async function recordSubtokenSpend(auth, { taskId = "", type = "spend", amount = 0, meta = {} } = {}) {
  if (!auth?.tokenRecord?.id) return null;
  const token = auth.tokenRecord;
  const cost = subtokenCostAmount(amount);
  const deltaAmount = token.quotaType === "amount" ? cost : 0;
  const deltaCount = token.quotaType === "count" ? 1 : 0;
  if (deltaAmount <= 0 && deltaCount <= 0) return null;
  const usage = await recordApiSubtokenUsageInDb({
    tokenId: token.id,
    parentUserId: auth.user?.id || token.parentUserId,
    eventKey: subtokenUsageEventKey("charge", taskId || meta.taskId, type),
    deltaAmount,
    deltaCount,
    meta: {
      ...meta,
      type,
      taskId: taskId || meta.taskId || "",
      amount: cost,
    },
  });
  if (usage?.token) {
    auth.tokenRecord = usage.token;
    const store = requestContext.getStore();
    if (store) store.auth = auth;
  }
  return usage;
}

async function recordSubtokenAdjustment(authOrRecord, { taskId = "", type = "adjust", amount = 0, meta = {} } = {}) {
  const token = authOrRecord?.tokenRecord || (authOrRecord?.apiTokenId ? tokenContextFromRecord(authOrRecord) : authOrRecord);
  if (!token?.id) return null;
  const signedAmount = Number(amount || 0);
  const adjustmentType = String(type || meta.adjustmentType || "").toLowerCase();
  const adjustmentAmount = token.quotaType === "amount" ? subtokenCostAmount(signedAmount) : 0;
  let adjustmentCount = 0;
  if (token.quotaType === "count") {
    if (adjustmentType.includes("refund") && signedAmount < 0) adjustmentCount = -1;
    else if (adjustmentType.includes("refund") && signedAmount > 0) adjustmentCount = 1;
    else adjustmentCount = 0;
  }
  if (adjustmentAmount === 0 && adjustmentCount === 0) return null;
  return await recordApiSubtokenUsageInDb({
    tokenId: token.id,
    parentUserId: token.parentUserId,
    eventKey: subtokenUsageEventKey("adjust", taskId || meta.taskId, type),
    deltaAmount: adjustmentAmount,
    deltaCount: adjustmentCount,
    meta: {
      ...meta,
      type,
      taskId: taskId || meta.taskId || "",
      amount: signedAmount,
    },
  });
}

async function consumeSubtokenForRequest(auth, { taskId = "", cost = 0, type = "spend", meta = {} } = {}) {
  const amount = subtokenCostAmount(cost);
  if (!auth?.tokenRecord?.id || amount <= 0) return;
  assertSubtokenCanSpend(auth, amount);
  await recordSubtokenSpend(auth, { taskId, type, amount, meta });
}

async function chargeUserWithSubtoken(auth, { cost = 0, type = "spend", taskId = "", meta = {} } = {}) {
  const amount = creditsAmount(cost);
  if (amount <= 0) return null;
  await changeUserCredits(auth.db, auth.user.id, -amount, type, meta);
  try {
    await consumeSubtokenForRequest(auth, {
      taskId,
      cost: amount,
      type,
      meta,
    });
  } catch (error) {
    await changeUserCredits(auth.db, auth.user.id, amount, `${type}_subtoken_refund`, {
      ...meta,
      taskId,
      reason: error.message || "Sub token charge failed.",
    });
    throw error;
  }
  return auth.user;
}

async function changeUserCredits(db, userId, delta, type, meta = {}) {
  const user = (db.users || []).find((entry) => entry.id === userId);
  if (!user) {
    const error = new Error("User not found for billing.");
    error.statusCode = 404;
    throw error;
  }
  const amount = Math.round(Number(delta || 0) * 10000) / 10000;
  if (!Number.isFinite(amount)) {
    const error = new Error("Invalid credit amount.");
    error.statusCode = 400;
    throw error;
  }
  if (dbEnabled()) {
    await appendCreditLedger(db, user, amount, type, meta);
    return user;
  }
  const rawNext = Number(user.credits || 0) + amount;
  if (rawNext < -0.0001) {
    const error = new Error(insufficientCreditsMessage(-amount, user.credits));
    error.statusCode = 402;
    error.code = "INSUFFICIENT_CREDITS";
    error.credits = creditsAmount(user.credits);
    error.cost = creditsAmount(-amount);
    throw error;
  }
  user.credits = creditsAmount(rawNext);
  user.updatedAt = new Date().toISOString();
  await appendCreditLedger(db, user, amount, type, meta);
  return user;
}

function randomId(prefix) {
  return `${prefix}-${Date.now()}-${crypto.randomBytes(4).toString("hex")}`;
}

function supportMessageView(record = {}, userMap = new Map()) {
  const user = userMap.get(record.userId) || {};
  return {
    id: String(record.id || ""),
    userId: String(record.userId || ""),
    username: String(record.username || user.username || ""),
    email: String(record.email || ""),
    subject: String(record.subject || ""),
    message: String(record.message || ""),
    status: String(record.status || "open"),
    reply: String(record.reply || ""),
    repliedAt: String(record.repliedAt || ""),
    repliedBy: String(record.repliedBy || ""),
    source: String(record.source || ""),
    telegramChatId: String(record.telegramChatId || ""),
    telegramUsername: String(record.telegramUsername || ""),
    createdAt: String(record.createdAt || ""),
    updatedAt: String(record.updatedAt || ""),
  };
}

function localGenerationTaskId(prefix = "cgt") {
  const now = new Date();
  const stamp = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0"),
    String(now.getHours()).padStart(2, "0"),
    String(now.getMinutes()).padStart(2, "0"),
    String(now.getSeconds()).padStart(2, "0"),
  ].join("");
  return `${prefix}-${stamp}-${crypto.randomBytes(3).toString("hex")}`;
}

function hashPassword(password, salt = crypto.randomBytes(16).toString("hex")) {
  const hash = crypto.pbkdf2Sync(String(password), salt, 120000, 32, "sha256").toString("hex");
  return `${salt}:${hash}`;
}

function verifyPassword(password, stored) {
  const [salt, expected] = String(stored || "").split(":");
  if (!salt || !expected) return false;
  const actual = hashPassword(password, salt).split(":")[1];
  return crypto.timingSafeEqual(Buffer.from(actual), Buffer.from(expected));
}

function makeApiToken() {
  return `sk-${crypto.randomBytes(32).toString("hex")}`;
}

function makeUniqueApiToken(db) {
  const existing = new Set((db?.users || []).map((user) => String(user.apiToken || "")).filter(Boolean));
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const token = makeApiToken();
    if (!existing.has(token)) return token;
  }
  return makeApiToken();
}

function makeSubtokenValue() {
  return `sk-${crypto.randomBytes(40).toString("hex")}`;
}

async function makeUniqueSubtokenToken(db, parentUserId = "") {
  const existing = new Set([
    ...(db?.users || []).map((user) => String(user.apiToken || "")).filter(Boolean),
  ]);
  const subtokens = Array.isArray(db?.apiSubtokens) ? db.apiSubtokens : [];
  for (const record of subtokens) {
    const token = String(record?.token || "").trim();
    if (token) existing.add(token);
  }
  for (let attempt = 0; attempt < 16; attempt += 1) {
    const token = makeSubtokenValue();
    if (existing.has(token)) continue;
    const dbMatch = await getApiSubtokenFromDbByToken(token);
    if (!dbMatch) return token;
  }
  return makeSubtokenValue();
}

function ensureUserApiToken(user, db = null) {
  if (!user) return "";
  if (!user.apiToken) {
    user.apiToken = makeUniqueApiToken(db);
    user.updatedAt = new Date().toISOString();
  }
  return user.apiToken;
}

async function ensureAllUsersApiTokens() {
  const db = await readDb();
  let changed = false;
  for (const user of db.users || []) {
    if (!user.apiToken) {
      ensureUserApiToken(user, db);
      if (dbEnabled()) await updateUserInDb(user);
      changed = true;
    }
  }
  if (changed && !dbEnabled()) await writeDb(db);
  return changed;
}

function authUserContext(user = null, token = "", tokenSource = "", tokenRecord = null) {
  return {
    token: String(token || ""),
    tokenSource: String(tokenSource || ""),
    tokenRecord: tokenRecord || null,
    tokenId: String(tokenRecord?.id || ""),
    tokenName: String(tokenRecord?.name || ""),
    tokenType: String(tokenRecord?.quotaType || ""),
    tokenPreview: String(tokenRecord?.tokenPreview || ""),
    isSubtoken: tokenSource === "subtoken",
    isApiToken: tokenSource === "api_token",
    isSession: tokenSource === "session",
    user,
  };
}

function currentIso() {
  return new Date().toISOString();
}

function getBearerToken(req) {
  const auth = req.headers.authorization || "";
  const match = auth.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : "";
}

function withJsonBody(req, body = {}) {
  return Object.create(req, {
    [Symbol.asyncIterator]: {
      value: async function* iterator() {
        yield Buffer.from(JSON.stringify(body), "utf8");
      },
    },
  });
}

function lightweightAuthDb() {
  return { users: [], sessions: [], walletOrders: [], creditLedger: [], userAssets: [], userCharacters: [], userUnlocks: [], supportMessages: [], apiSubtokens: [] };
}

// Qualifying purchases earn the inviter a 20% USD commission. The order id is
// recorded on the inviter to make the grant idempotent across webhook retries.
async function maybeGrantReferralCommission(db, referredUserId = "", order = {}) {
  const amount = Number(order?.baseAmount || 0);
  const qualifies = (order?.orderKind === "subscription" && String(order?.billingPlanId || "") === CREATOR_MEMBERSHIP_PLAN_ID)
    || (order?.orderKind === "product" && String(order?.productId || "") === API_DOCS_PRODUCT_ID);
  if (!qualifies || !Number.isFinite(amount) || amount <= 0) return null;
  const referredUser = (db.users || []).find((entry) => entry.id === referredUserId);
  const referrerId = String(referralPayload(referredUser).referredByUserId || "").trim();
  const referrer = (db.users || []).find((entry) => entry.id === referrerId);
  if (!referredUser || !referrer || referrer.id === referredUser.id || !order.id) return null;
  const current = referralPayload(referrer);
  const orderIds = Array.isArray(current.commissionOrderIds) ? current.commissionOrderIds.map(String) : [];
  if (orderIds.includes(String(order.id))) return referrer;
  const commission = Math.round(amount * 0.2 * 100) / 100;
  referrer.referral = {
    ...current,
    totalCommissionUsd: Math.round((Number(current.totalCommissionUsd || 0) + commission) * 100) / 100,
    commissionOrderIds: [...orderIds, String(order.id)].slice(-500),
    lastCommissionAt: new Date().toISOString(),
  };
  referrer.updatedAt = new Date().toISOString();
  if (dbEnabled()) await updateUserInDb(referrer);
  return referrer;
}

function findUserChatUnlock(db, userId, itemId) {
  return (db.userUnlocks || []).find((record) => (
    !isSoftDeleted(record)
    && record.userId === userId
    && record.itemId === itemId
    && record.unlockType === "chat_character"
  )) || null;
}

function chatCharacterUnlockRecord(item = {}, userId = "") {
  if (!item?.id || !userId) return null;
  const now = new Date().toISOString();
  return {
    id: randomId("chat-unlock"),
    userId,
    itemId: item.id,
    itemName: item.name || item.title || "Character",
    sceneId: "__chat__",
    sceneName: "Character chat",
    sceneEntryId: "chat",
    sceneEntryName: "Character chat",
    videoKey: "__chat__",
    unlockType: "chat_character",
    cost: 0,
    createdAt: now,
    updatedAt: now,
    deletedAt: "",
  };
}

async function getAuth(req, options = {}) {
  const loadDb = options.loadDb !== false;
  const token = getBearerToken(req);
  const tenantId = requestTenantId(req);
  if (String(token || "").startsWith("elv1.")) {
    const embedAuth = await embedLiveAuthFromToken(token, tenantId, loadDb);
    if (embedAuth) return embedAuth;
  }
  if (!token) return { db: loadDb ? await readDb() : lightweightAuthDb(), user: null, session: null, token: "", tokenSource: "", tokenRecord: null };
  if (dbEnabled()) {
    const db = loadDb ? await readDb() : lightweightAuthDb();
    const session = await getSessionByTokenInDb(token);
    if (session && recordBelongsToTenant(session, tenantId)) {
      const user = await getUserByIdInDb(session.userId);
      if (!recordBelongsToTenant(user, tenantId)) {
        return { db, user: null, session: null, token, tokenSource: "", tokenRecord: null };
      }
      const auth = { db, user, session, ...authUserContext(user, token, "session", null) };
      const store = requestContext.getStore();
      if (store) store.auth = auth;
      return auth;
    }
    const user = await getUserByApiTokenInDb(token, tenantId);
    if (user) {
      if (user.riskStatus === "quarantined") {
        return { db, user: null, session: null, token, tokenSource: "", tokenRecord: null, quarantined: true };
      }
      const auth = { db, user, session: null, ...authUserContext(user, token, "api_token", null) };
      const store = requestContext.getStore();
      if (store) store.auth = auth;
      return auth;
    }
    const subtoken = await getApiSubtokenFromDbByToken(token);
    if (subtoken) {
      const parent = await getUserByIdInDb(subtoken.parentUserId);
      if (parent?.riskStatus === "quarantined") {
        return { db, user: null, session: null, token, tokenSource: "", tokenRecord: null, quarantined: true };
      }
      if (recordBelongsToTenant(parent, tenantId)) {
        const auth = {
          db,
          user: parent,
          session: null,
          ...authUserContext(parent, token, "subtoken", subtoken),
        };
        const store = requestContext.getStore();
        if (store) store.auth = auth;
        return auth;
      }
    }
    return { db, user: null, session: null, token, tokenSource: "", tokenRecord: null };
  }
  const db = await readDb();
  const session = db.sessions.find((item) => item.token === token && recordBelongsToTenant(item, tenantId));
  if (session) {
    const user = db.users.find((item) => item.id === session.userId) || null;
    if (!recordBelongsToTenant(user, tenantId)) {
      return { db, user: null, session: null, token, tokenSource: "", tokenRecord: null };
    }
    const auth = { db, user, session, ...authUserContext(user, token, "session", null) };
    const store = requestContext.getStore();
    if (store) store.auth = auth;
    return auth;
  }
  const user = db.users.find((item) => item.apiToken === token && recordBelongsToTenant(item, tenantId)) || null;
  if (user) {
    if (user.riskStatus === "quarantined") {
      return { db, user: null, session: null, token, tokenSource: "", tokenRecord: null, quarantined: true };
    }
    const auth = { db, user, session: null, ...authUserContext(user, token, "api_token", null) };
    const store = requestContext.getStore();
    if (store) store.auth = auth;
    return auth;
  }
  const subtoken = await getApiSubtokenFromDbByToken(token);
  if (subtoken) {
    const parent = db.users.find((item) => item.id === subtoken.parentUserId) || null;
    if (recordBelongsToTenant(parent, tenantId)) {
      if (parent.riskStatus === "quarantined") {
        return { db, user: null, session: null, token, tokenSource: "", tokenRecord: null, quarantined: true };
      }
      const auth = {
        db,
        user: parent,
        session: null,
        ...authUserContext(parent, token, "subtoken", subtoken),
      };
      const store = requestContext.getStore();
      if (store) store.auth = auth;
      return auth;
    }
  }
  return { db, user: null, session: null, token, tokenSource: "", tokenRecord: null };
}

async function requireUser(req, res, options = {}) {
  const auth = await getAuth(req, options);
  if (auth.user?.riskStatus === "quarantined" && auth.tokenSource !== "session") {
    sendJson(res, 403, { ok: false, code: "ACCOUNT_QUARANTINED", message: "This account is under security review. Please contact support." });
    return null;
  }
  if (!auth.user) {
    if (auth.quarantined) {
      sendJson(res, 403, { ok: false, code: "ACCOUNT_QUARANTINED", message: "This account is under security review. Please contact support." });
      return null;
    }
    const bearer = getBearerToken(req);
    const likelyBrowserSession = /^[a-f0-9]{64}$/i.test(bearer);
    sendJson(res, 401, { ok: false, code: likelyBrowserSession ? "SESSION_REPLACED" : "LOGIN_REQUIRED", message: likelyBrowserSession ? "这个账号已在另一台设备登录，请重新登录。" : "Please sign in to continue." });
    return null;
  }
  return auth;
}

async function requirePrimaryTokenOwner(req, res) {
  const auth = await requireUser(req, res);
  if (!auth) return null;
  if (auth.tokenSource === "subtoken") {
    sendJson(res, 403, {
      ok: false,
      code: "SUBTOKEN_MANAGEMENT_FORBIDDEN",
      message: "Please use the parent account token or session to manage sub tokens.",
    });
    return null;
  }
  return auth;
}

async function requireAdmin(req, res, options = {}) {
  const auth = await requireUser(req, res, options);
  if (!auth) return null;
  if (auth.user.role !== "admin") {
    sendJson(res, 403, { ok: false, code: "ADMIN_REQUIRED", message: "需要管理员权限。" });
    return null;
  }
  return auth;
}

function makeUniquePaymentAmount(baseAmount, suffixDigits) {
  const amount = Math.max(1, Math.round(Number(baseAmount || 0)));
  const suffix = `00${String(crypto.randomInt(1, 10000)).padStart(4, "0")}`;
  const payableAmountText = `${amount}.${suffix}`;
  const payableAmount = Number(payableAmountText);
  return { amount, suffix, payableAmount, payableAmountText };
}

function walletCnyCentsPerUsdt(wallet = {}) {
  const explicit = wallet.cnyCentsPerUsdt ?? wallet.usdtCnyCents;
  if (explicit !== undefined && explicit !== null && explicit !== "") {
    return clampNumber(explicit, DEFAULT_USDT_CNY_CENTS, 1, 100000);
  }
  const legacy = Number(wallet.creditsPerUsdt);
  return Number.isFinite(legacy) && legacy >= 100
    ? clampNumber(legacy, DEFAULT_USDT_CNY_CENTS, 1, 100000)
    : DEFAULT_USDT_CNY_CENTS;
}

function walletCreditsPerUsd(wallet = {}) {
  const explicit = wallet.creditsPerUsd;
  if (explicit !== undefined && explicit !== null && explicit !== "") {
    return clampNumber(explicit, DEFAULT_CREDITS_PER_USD, 0.0001, 100000);
  }
  return DEFAULT_CREDITS_PER_USD;
}

function publicTopupPackages(user = null) {
  const member = Boolean(user && userHasCreatorMembership(user));
  return TOPUP_PACKAGES.map((item) => ({
    id: item.id,
    amount: item.amount,
    credits: creditsAmount(member ? item.credits : item.amount * DEFAULT_CREDITS_PER_USD),
    bonusCredits: creditsAmount(member ? Math.max(0, item.credits - item.amount * DEFAULT_CREDITS_PER_USD) : 0),
    bonusPercent: member ? Number(item.bonusPercent || 0) : 0,
    memberBonus: member,
    currency: "USD",
  }));
}

function normalizeTopupAmount(value) {
  const amount = Number(value || 0);
  return Number.isFinite(amount) ? Math.round(amount * 100) / 100 : 0;
}

function findTopupPackage(input = {}, user = null) {
  const packageId = String(input.packageId || input.topupPackageId || "").trim().toLowerCase();
  const packages = publicTopupPackages(user);
  if (packageId) {
    const byId = packages.find((item) => item.id === packageId);
    if (byId) return byId;
  }
  const amount = normalizeTopupAmount(input.amount ?? input.baseAmount);
  return packages.find((item) => normalizeTopupAmount(item.amount) === amount) || null;
}

function normalizeWalletOption(option = {}, index = 0) {
  const id = String(option.id || option.network || `wallet-${index + 1}`)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || `wallet-${index + 1}`;
  return {
    id,
    label: String(option.label || option.network || id).trim(),
    network: String(option.network || option.label || id).trim(),
    asset: String(option.asset || "USDT").trim() || "USDT",
    address: String(option.address || "").trim(),
    qrUrl: String(option.qrUrl || "").trim(),
    explorerUrl: String(option.explorerUrl || option.explorer || "").trim(),
  };
}

function walletOptions(wallet = {}) {
  const configured = Array.isArray(wallet.options) ? wallet.options : [];
  let list = configured
    .map((option, index) => normalizeWalletOption(option, index))
    .filter((option) => option.address);
  if (list.length) return list;
  const fallback = normalizeWalletOption({
    id: wallet.network || "wallet",
    label: wallet.network || "USDT",
    network: wallet.network || "TRC20",
    asset: wallet.asset || "USDT",
    address: wallet.address || "",
    qrUrl: wallet.qrUrl || "",
    explorerUrl: wallet.explorerUrl || "",
  }, 0);
  return fallback.address ? [fallback] : [];
}

function findWalletOption(wallet = {}, selectedId = "", options = {}) {
  const walletOptionItems = walletOptions(wallet, options);
  const normalizedId = String(selectedId || "").trim().toLowerCase();
  return walletOptionItems.find((option) => option.id === normalizedId || option.network.toLowerCase() === normalizedId) || walletOptionItems[0] || null;
}

function publicWalletOptions(wallet = {}, options = {}) {
  return walletOptions(wallet, options).map((option) => ({
    id: option.id,
    label: option.label,
    network: option.network,
    asset: option.asset,
    address: option.address,
    qrUrl: option.qrUrl,
    explorerUrl: option.explorerUrl,
  }));
}

function normalizeWalletChain(network = "") {
  const value = String(network || "").trim().toLowerCase();
  if (!value) return "";
  if (value.includes("bnb") || value.includes("bsc") || value.includes("binance")) return "bnb";
  if (value.includes("sol")) return "solana";
  if (value.includes("base")) return "base";
  if (value.includes("eth") || value.includes("erc")) return "ethereum";
  if (value.includes("tron") || value.includes("trc")) return "tron";
  return value.replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

function normalizeChainAddress(address = "", chain = "") {
  const value = String(address || "").trim();
  return ["bnb", "base", "ethereum"].includes(chain) ? value.toLowerCase() : value;
}

function walletScanConfirmations(chain = "") {
  if (chain === "solana") return WALLET_SOLANA_CONFIRMATIONS;
  if (chain === "tron") return WALLET_TRON_CONFIRMATIONS;
  return WALLET_EVM_CONFIRMATIONS;
}

function walletUsdtDecimals(chain = "") {
  return normalizeWalletChain(chain) === "bnb" ? 18 : 6;
}

function tokenUnitAmount(value, decimals = 6) {
  const text = String(value ?? "").trim();
  if (!text) return null;
  const negative = text.startsWith("-");
  const clean = negative ? text.slice(1) : text;
  const [wholeRaw, fractionRaw = ""] = clean.split(".");
  const whole = wholeRaw.replace(/\D/g, "") || "0";
  const fraction = fractionRaw.replace(/\D/g, "").padEnd(decimals, "0").slice(0, decimals);
  try {
    const units = BigInt(whole) * (10n ** BigInt(decimals)) + BigInt(fraction || "0");
    return negative ? -units : units;
  } catch {
    return null;
  }
}

function tokenAmountFromUnits(units, decimals = 6) {
  let value;
  try {
    value = typeof units === "bigint" ? units : BigInt(String(units || "0"));
  } catch {
    value = 0n;
  }
  const negative = value < 0n;
  if (negative) value = -value;
  const base = 10n ** BigInt(decimals);
  const whole = value / base;
  const fraction = String(value % base).padStart(decimals, "0").replace(/0+$/, "");
  return `${negative ? "-" : ""}${whole.toString()}${fraction ? `.${fraction}` : ""}`;
}

function normalizeTokenUnits(units, fromDecimals = 6, toDecimals = 6) {
  let value;
  try {
    value = typeof units === "bigint" ? units : BigInt(String(units || "0"));
  } catch {
    value = 0n;
  }
  const from = Math.max(0, Number(fromDecimals || 0));
  const to = Math.max(0, Number(toDecimals || 0));
  if (from === to) return value;
  if (from > to) return value / (10n ** BigInt(from - to));
  return value * (10n ** BigInt(to - from));
}

function orderExpectedUnits(order = {}) {
  return tokenUnitAmount(order.payableAmountText || order.payableAmount || order.baseAmount, 6);
}

function walletOrderSubmittedHash(order = {}) {
  return normalizeSubmittedTxHash(order.confirmationHash || order.transactionHash || order.txHash || order.hash || "").toLowerCase();
}

function walletConfirmedHashMatchesOrder(order = {}, tx = {}) {
  const submitted = walletOrderSubmittedHash(order);
  return Boolean(submitted && tx.hash && submitted === normalizeSubmittedTxHash(tx.hash).toLowerCase());
}

function walletOrderAmountMatches(order = {}, tx = {}) {
  const expected = orderExpectedUnits(order);
  if (expected === null || tx.amountUnits === undefined || tx.amountUnits === null) return false;
  let amount;
  try {
    amount = typeof tx.amountUnits === "bigint" ? tx.amountUnits : BigInt(String(tx.amountUnits || "0"));
  } catch {
    return false;
  }
  if (amount === expected) return true;
  if (!walletConfirmedHashMatchesOrder(order, tx)) return false;
  const diff = expected > amount ? expected - amount : amount - expected;
  return diff <= 10n;
}

function walletTransactionKey(chain = "", hash = "") {
  return `${normalizeWalletChain(chain)}:${String(hash || "").trim().toLowerCase()}`;
}

function usedWalletTransactionKeys(db = {}) {
  const keys = new Set();
  (db.walletOrders || []).forEach((order) => {
    const hash = order.transactionHash || order.txHash || order.hash || "";
    if (hash) keys.add(walletTransactionKey(order.chain || order.network, hash));
    if (Array.isArray(order.matchedTransactions)) {
      order.matchedTransactions.forEach((tx) => {
        if (tx?.hash) keys.add(walletTransactionKey(tx.chain || order.chain || order.network, tx.hash));
      });
    }
  });
  return keys;
}

function walletScanSupported(chain = "") {
  return ["bnb", "base", "ethereum", "solana", "tron"].includes(normalizeWalletChain(chain));
}

async function scanFetchJson(url, { headers = {}, timeoutMs = 20000, method = "GET", body } = {}) {
  const response = await fetch(url, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  });
  const text = await response.text();
  let payload = null;
  try {
    payload = text ? JSON.parse(text.replace(/^\uFEFF/, "")) : null;
  } catch {
    payload = { raw: text };
  }
  if (!response.ok) {
    const error = new Error(`Chain API request failed: ${response.status}`);
    error.statusCode = response.status;
    error.payload = payload;
    throw error;
  }
  return payload;
}

async function evmRpc(chain, method, params = []) {
  const urls = WALLET_EVM_RPC_URLS[chain] || [];
  if (!urls.length) throw new Error(`No RPC configured for ${chain}.`);
  let lastError = null;
  for (const url of urls) {
    try {
      const payload = await scanFetchJson(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: { jsonrpc: "2.0", id: `wallet-${Date.now()}`, method, params },
        timeoutMs: 15000,
      });
      if (payload?.error) throw new Error(payload.error.message || `RPC ${method} failed`);
      return payload?.result;
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError || new Error(`RPC ${method} failed for ${chain}`);
}

function evmTopicAddress(address = "") {
  const hex = String(address || "").trim().replace(/^0x/i, "").toLowerCase();
  if (!/^[0-9a-f]{40}$/.test(hex)) return "";
  return `0x${hex.padStart(64, "0")}`;
}

function evmHex(value) {
  const number = typeof value === "bigint" ? value : BigInt(Math.max(0, Number(value || 0)));
  return `0x${number.toString(16)}`;
}

function evmHexToBigInt(hex = "0x0") {
  try {
    return BigInt(String(hex || "0x0"));
  } catch {
    return 0n;
  }
}

function evmAddressFromTopic(topic = "") {
  const hex = String(topic || "").replace(/^0x/i, "");
  return hex.length >= 40 ? `0x${hex.slice(-40)}` : "";
}

function evmScanConfig(chain = "") {
  const makeV2Url = (chainId, contract) => (address) => `https://api.etherscan.io/v2/api?chainid=${encodeURIComponent(chainId)}&module=account&action=tokentx&contractaddress=${encodeURIComponent(contract)}&address=${encodeURIComponent(address)}&page=1&offset=${WALLET_CHAIN_SCAN_LOOKBACK_LIMIT}&sort=desc&apikey=${encodeURIComponent(ETHERSCAN_API_KEY)}`;
  if (chain === "bnb") {
    if (ETHERSCAN_API_KEY) {
      return {
        apiBase: "https://api.etherscan.io/v2/api",
        apiKey: ETHERSCAN_API_KEY,
        usdtContract: WALLET_USDT_CONTRACTS.bnb,
        publicTokenUrl: makeV2Url("56", WALLET_USDT_CONTRACTS.bnb),
        source: "etherscan-v2",
      };
    }
    return {
      apiBase: "https://api.bscscan.com/api",
      apiKey: BSCSCAN_API_KEY,
      usdtContract: WALLET_USDT_CONTRACTS.bnb,
      publicTokenUrl: (address) => `https://api.bscscan.com/api?module=account&action=tokentx&contractaddress=${encodeURIComponent(WALLET_USDT_CONTRACTS.bnb)}&address=${encodeURIComponent(address)}&page=1&offset=${WALLET_CHAIN_SCAN_LOOKBACK_LIMIT}&sort=desc${BSCSCAN_API_KEY ? `&apikey=${encodeURIComponent(BSCSCAN_API_KEY)}` : ""}`,
      source: BSCSCAN_API_KEY ? "bscscan" : "public-bscscan",
    };
  }
  if (chain === "base") {
    if (ETHERSCAN_API_KEY) {
      return {
        apiBase: "https://api.etherscan.io/v2/api",
        apiKey: ETHERSCAN_API_KEY,
        usdtContract: WALLET_USDT_CONTRACTS.base,
        publicTokenUrl: makeV2Url("8453", WALLET_USDT_CONTRACTS.base),
        source: "etherscan-v2",
      };
    }
    return {
      apiBase: "https://api.basescan.org/api",
      apiKey: BASESCAN_API_KEY,
      usdtContract: WALLET_USDT_CONTRACTS.base,
      publicTokenUrl: (address) => `https://api.basescan.org/api?module=account&action=tokentx&contractaddress=${encodeURIComponent(WALLET_USDT_CONTRACTS.base)}&address=${encodeURIComponent(address)}&page=1&offset=${WALLET_CHAIN_SCAN_LOOKBACK_LIMIT}&sort=desc${BASESCAN_API_KEY ? `&apikey=${encodeURIComponent(BASESCAN_API_KEY)}` : ""}`,
      source: BASESCAN_API_KEY ? "basescan" : "public-basescan",
    };
  }
  if (ETHERSCAN_API_KEY) {
    return {
      apiBase: "https://api.etherscan.io/v2/api",
      apiKey: ETHERSCAN_API_KEY,
      usdtContract: WALLET_USDT_CONTRACTS.ethereum,
      publicTokenUrl: makeV2Url("1", WALLET_USDT_CONTRACTS.ethereum),
      source: "etherscan-v2",
    };
  }
  return {
    apiBase: "https://api.etherscan.io/api",
    apiKey: ETHERSCAN_API_KEY,
    usdtContract: WALLET_USDT_CONTRACTS.ethereum,
    publicTokenUrl: (address) => `https://api.etherscan.io/api?module=account&action=tokentx&contractaddress=${encodeURIComponent(WALLET_USDT_CONTRACTS.ethereum)}&address=${encodeURIComponent(address)}&page=1&offset=${WALLET_CHAIN_SCAN_LOOKBACK_LIMIT}&sort=desc${ETHERSCAN_API_KEY ? `&apikey=${encodeURIComponent(ETHERSCAN_API_KEY)}` : ""}`,
    source: "public-etherscan",
  };
}

function qwenImage3PricingEstimate(advancedPricing = DEFAULT_ADVANCED_PRICING, options = {}) {
  const pricing = normalizeAdvancedPricing(advancedPricing);
  const qwenPricing = pricing.qwenImage3 || DEFAULT_ADVANCED_PRICING.qwenImage3;
  const tier = normalizeQwenImage3Tier(options.qwenTier || options.qwenImageTier || options.tier, options.model);
  const size = String(options.size || "").trim();
  const resolution = size
    ? qwenImage3ResolutionForSize(size, options.resolution || qwenPricing.defaultResolution)
    : normalizeQwenImage3Resolution(options.resolution || qwenPricing.defaultResolution || "2K");
  const referenceImageCount = Math.max(0, Math.min(QWEN_IMAGE3_REFERENCE_LIMIT, Math.floor(Number(options.referenceImageCount) || 0)));
  const outputImageCount = Math.max(1, Math.min(QWEN_IMAGE3_OUTPUT_MAX, Math.floor(Number(options.outputImageCount ?? options.n ?? 1) || 1)));
  const tierConfig = qwenPricing[tier] || qwenPricing.pro;
  const outputUsdPerImage = pricingNumber(
    tierConfig.saleUsdPerImageByResolution?.[resolution],
    QWEN_IMAGE3_OFFICIAL_USD[tier].outputPerImage[resolution],
    0,
    6,
  );
  const inputUsdPerReferenceImage = pricingNumber(
    tierConfig.saleUsdPerReferenceImage,
    QWEN_IMAGE3_OFFICIAL_USD[tier].inputPerReferenceImage,
    0,
    6,
  );
  const outputUsd = pricingNumber(outputUsdPerImage * outputImageCount, 0, 0, 6);
  const inputUsd = pricingNumber(inputUsdPerReferenceImage * referenceImageCount, 0, 0, 6);
  const totalUsd = pricingNumber(outputUsd + inputUsd, 0, 0, 6);
  const credits = creditsAmount(totalUsd * DEFAULT_CREDITS_PER_USD);
  return {
    provider: "qwen-image3",
    providerLabel: "Qwen Image 3.0",
    model: qwenImage3ModelForTier(tier, options.model || tierConfig.model),
    qwenTier: tier,
    resolution,
    size: size || qwenImage3Size({ resolution, ratio: options.ratio || "1:1" }),
    referenceImageCount,
    outputImageCount,
    outputUsdPerImage,
    inputUsdPerReferenceImage,
    outputUsd,
    inputUsd,
    totalUsd,
    baseCredits: credits,
    originalCredits: credits,
    credits,
    markup: 1,
    userPricingMultiplier: 1,
    source: "aliyun_singapore_qwen_image3_official_pricing",
  };
}

const walletEvmScanCursors = new Map();

function evmApproximateBlockSeconds(chain = "") {
  if (chain === "bnb") return 3;
  if (chain === "base") return 2;
  return 12;
}

function walletOrdersOldestCreatedAtMs(orders = []) {
  const timestamps = orders
    .map((order) => Date.parse(order?.createdAt || ""))
    .filter((value) => Number.isFinite(value) && value > 0);
  return timestamps.length ? Math.min(...timestamps) : Date.now() - WALLET_CHAIN_SCAN_ORDER_TTL_HOURS * 60 * 60 * 1000;
}

function initialEvmScanFromBlock(chain, currentBlock, orders = []) {
  const oldestCreatedAtMs = walletOrdersOldestCreatedAtMs(orders);
  const ageSeconds = Math.max(0, (Date.now() - oldestCreatedAtMs) / 1000);
  const estimatedBlocks = Math.ceil(ageSeconds / evmApproximateBlockSeconds(chain)) + WALLET_EVM_SCAN_CURSOR_OVERLAP_BLOCKS;
  return {
    fromBlock: Math.max(0, currentBlock - Math.min(WALLET_EVM_SCAN_BLOCK_LOOKBACK, estimatedBlocks)),
    oldestCreatedAtMs,
  };
}

async function scanEvmUsdtTransfersByRpc(chain, address, { orders = [] } = {}) {
  const config = evmScanConfig(chain);
  const currentBlockHex = await evmRpc(chain, "eth_blockNumber", []);
  const currentBlock = Number(evmHexToBigInt(currentBlockHex));
  if (!currentBlock) return [];
  const initial = initialEvmScanFromBlock(chain, currentBlock, orders);
  const cursorKey = `${chain}:${normalizeChainAddress(address, chain)}`;
  const cursor = walletEvmScanCursors.get(cursorKey);
  const fromBlock = cursor && cursor.oldestCreatedAtMs <= initial.oldestCreatedAtMs
    ? Math.max(initial.fromBlock, Number(cursor.block || currentBlock) - WALLET_EVM_SCAN_CURSOR_OVERLAP_BLOCKS)
    : initial.fromBlock;
  const transferTopic = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
  const toTopic = evmTopicAddress(address);
  if (!toTopic) return [];
  const logs = [];
  let successfulChunks = 0;
  let failedChunks = 0;
  let lastError = null;
  for (let end = currentBlock; end >= fromBlock; end -= WALLET_EVM_SCAN_CHUNK_SIZE) {
    const start = Math.max(fromBlock, end - WALLET_EVM_SCAN_CHUNK_SIZE + 1);
    try {
      const chunk = await evmRpc(chain, "eth_getLogs", [{
        fromBlock: evmHex(start),
        toBlock: evmHex(end),
        address: config.usdtContract,
        topics: [transferTopic, null, toTopic],
      }]);
      successfulChunks += 1;
      if (Array.isArray(chunk)) logs.push(...chunk);
    } catch (error) {
      lastError = error;
      failedChunks += 1;
    }
    if (logs.length >= WALLET_CHAIN_SCAN_LOOKBACK_LIMIT) break;
  }
  if (!successfulChunks && lastError) throw lastError;
  if (!failedChunks) {
    walletEvmScanCursors.set(cursorKey, { block: currentBlock, oldestCreatedAtMs: initial.oldestCreatedAtMs });
  }
  return logs
    .sort((a, b) => Number(evmHexToBigInt(b.blockNumber || "0x0")) - Number(evmHexToBigInt(a.blockNumber || "0x0")))
    .slice(0, WALLET_CHAIN_SCAN_LOOKBACK_LIMIT)
    .map((log) => {
      const blockNumber = Number(evmHexToBigInt(log.blockNumber || "0x0"));
      const value = evmHexToBigInt(log.data || "0x0");
      const decimals = walletUsdtDecimals(chain);
      return {
        chain,
        hash: String(log.transactionHash || ""),
        to: evmAddressFromTopic(log.topics?.[2] || ""),
        from: evmAddressFromTopic(log.topics?.[1] || ""),
        amountUnits: normalizeTokenUnits(value, decimals, 6),
        amountText: tokenAmountFromUnits(value, decimals),
        decimals,
        confirmations: currentBlock && blockNumber ? Math.max(0, currentBlock - blockNumber + 1) : 0,
        blockNumber,
        timestamp: "",
        source: `${chain}-rpc`,
      };
    });
}

async function scanEvmUsdtTransfers(chain, address, options = {}) {
  const config = evmScanConfig(chain);
  if (!config.apiKey) return await scanEvmUsdtTransfersByRpc(chain, address, options);
  let payload = null;
  try {
    payload = await scanFetchJson(config.publicTokenUrl(address));
  } catch (error) {
    return await scanEvmUsdtTransfersByRpc(chain, address, options);
  }
  if (payload && payload.status === "0" && !Array.isArray(payload.result)) {
    return await scanEvmUsdtTransfersByRpc(chain, address, options);
  }
  const result = Array.isArray(payload?.result) ? payload.result : [];
  if (!result.length && !config.apiKey) {
    return await scanEvmUsdtTransfersByRpc(chain, address, options);
  }
  const currentBlock = Math.max(...result.map((tx) => Number(tx.blockNumber || 0)).filter(Boolean), 0);
  return result
    .filter((tx) => normalizeChainAddress(tx.to, chain) === normalizeChainAddress(address, chain))
    .filter((tx) => normalizeChainAddress(tx.contractAddress || tx.tokenContractAddress, chain) === normalizeChainAddress(config.usdtContract, chain))
    .map((tx) => {
      const blockNumber = Number(tx.blockNumber || 0);
      const confirmations = Number(tx.confirmations || 0) || (currentBlock && blockNumber ? Math.max(0, currentBlock - blockNumber + 1) : 0);
      const decimals = Number(tx.tokenDecimal || 6) || 6;
      return {
        chain,
        hash: String(tx.hash || ""),
        to: tx.to || "",
        from: tx.from || "",
        amountUnits: normalizeTokenUnits(tokenUnitAmount(tx.value || "0", 0) || 0n, decimals, 6),
        amountText: tokenAmountFromUnits(tx.value || "0", decimals),
        decimals,
        confirmations,
        blockNumber,
        timestamp: tx.timeStamp ? new Date(Number(tx.timeStamp) * 1000).toISOString() : "",
        source: config.source || (config.apiKey ? "scan-api" : "public-scan-api"),
      };
    });
}

async function solanaRpc(method, params = []) {
  return await scanFetchJson(SOLANA_RPC_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: { jsonrpc: "2.0", id: `wallet-${Date.now()}`, method, params },
    timeoutMs: 25000,
  });
}

function solanaTokenBalanceUnits(balance = {}) {
  const amount = balance?.uiTokenAmount?.amount ?? balance?.uiAmountString ?? "";
  if (balance?.uiTokenAmount?.amount !== undefined) return tokenUnitAmount(amount, 0) || 0n;
  return tokenUnitAmount(amount, 6) || 0n;
}

async function scanSolanaUsdtTransfers(address) {
  const tokenAccountsPayload = await solanaRpc("getTokenAccountsByOwner", [
    address,
    { mint: WALLET_USDT_CONTRACTS.solana },
    { encoding: "jsonParsed" },
  ]).catch(() => null);
  const tokenAccounts = Array.isArray(tokenAccountsPayload?.result?.value)
    ? tokenAccountsPayload.result.value.map((item) => item.pubkey).filter(Boolean)
    : [];
  const scanAddresses = Array.from(new Set([address, ...tokenAccounts])).slice(0, 8);
  const signatureMap = new Map();
  for (const scanAddress of scanAddresses) {
    const signaturesPayload = await solanaRpc("getSignaturesForAddress", [
      scanAddress,
      { limit: Math.min(WALLET_CHAIN_SCAN_LOOKBACK_LIMIT, 50) },
    ]).catch(() => null);
    const signatures = Array.isArray(signaturesPayload?.result) ? signaturesPayload.result : [];
    signatures.forEach((sig) => {
      if (sig?.signature && !signatureMap.has(sig.signature)) signatureMap.set(sig.signature, sig);
    });
  }
  const signatures = Array.from(signatureMap.values());
  const transfers = [];
  const finalizedSlotPayload = await solanaRpc("getSlot", [{ commitment: "finalized" }]).catch(() => null);
  const finalizedSlot = Number(finalizedSlotPayload?.result || 0);
  for (const sig of signatures.slice(0, 30)) {
    const hash = sig.signature;
    if (!hash || sig.err) continue;
    const txPayload = await solanaRpc("getTransaction", [
      hash,
      { encoding: "jsonParsed", maxSupportedTransactionVersion: 0, commitment: "finalized" },
    ]).catch(() => null);
    const tx = txPayload?.result;
    if (!tx?.meta) continue;
    const pre = Array.isArray(tx.meta.preTokenBalances) ? tx.meta.preTokenBalances : [];
    const post = Array.isArray(tx.meta.postTokenBalances) ? tx.meta.postTokenBalances : [];
    const candidates = post.filter((balance) => (
      String(balance.mint || "") === WALLET_USDT_CONTRACTS.solana &&
      String(balance.owner || "") === address
    ));
    for (const postBalance of candidates) {
      const matchingPre = pre.find((balance) => (
        balance.accountIndex === postBalance.accountIndex &&
        String(balance.mint || "") === String(postBalance.mint || "")
      ));
      const delta = solanaTokenBalanceUnits(postBalance) - solanaTokenBalanceUnits(matchingPre || {});
      if (delta <= 0n) continue;
      transfers.push({
        chain: "solana",
        hash,
        to: address,
        from: "",
        amountUnits: normalizeTokenUnits(delta, Number(postBalance.uiTokenAmount?.decimals || 6) || 6, 6),
        amountText: tokenAmountFromUnits(delta, Number(postBalance.uiTokenAmount?.decimals || 6) || 6),
        decimals: Number(postBalance.uiTokenAmount?.decimals || 6) || 6,
        confirmations: finalizedSlot && tx.slot ? Math.max(0, finalizedSlot - Number(tx.slot) + 1) : WALLET_SOLANA_CONFIRMATIONS,
        blockNumber: tx.slot || sig.slot || 0,
        timestamp: tx.blockTime ? new Date(Number(tx.blockTime) * 1000).toISOString() : "",
        source: "solana-rpc",
      });
    }
  }
  return transfers;
}

async function scanTronUsdtTransfers(address) {
  const url = `https://api.trongrid.io/v1/accounts/${encodeURIComponent(address)}/transactions/trc20?only_confirmed=true&limit=${Math.min(WALLET_CHAIN_SCAN_LOOKBACK_LIMIT, 200)}&contract_address=${encodeURIComponent(WALLET_USDT_CONTRACTS.tron)}`;
  const headers = TRONGRID_API_KEY ? { "TRON-PRO-API-KEY": TRONGRID_API_KEY } : {};
  const payload = await scanFetchJson(url, { headers, timeoutMs: 25000 });
  const rows = Array.isArray(payload?.data) ? payload.data : [];
  return rows
    .filter((tx) => String(tx.to || "") === address)
    .map((tx) => ({
      chain: "tron",
      hash: String(tx.transaction_id || tx.hash || ""),
      to: tx.to || "",
      from: tx.from || "",
      amountUnits: normalizeTokenUnits(tokenUnitAmount(tx.value || "0", 0) || 0n, Number(tx.token_info?.decimals || 6) || 6, 6),
      amountText: tokenAmountFromUnits(tx.value || "0", Number(tx.token_info?.decimals || 6) || 6),
      decimals: Number(tx.token_info?.decimals || 6) || 6,
      confirmations: WALLET_TRON_CONFIRMATIONS,
      blockNumber: Number(tx.block_number || 0),
      timestamp: tx.block_timestamp ? new Date(Number(tx.block_timestamp)).toISOString() : "",
      source: TRONGRID_API_KEY ? "trongrid" : "public-trongrid",
    }));
}

async function scanWalletTransfers(chain, address, options = {}) {
  if (chain === "solana") return await scanSolanaUsdtTransfers(address);
  if (chain === "tron") return await scanTronUsdtTransfers(address);
  if (["bnb", "base", "ethereum"].includes(chain)) return await scanEvmUsdtTransfers(chain, address, options);
  return [];
}

function pendingWalletOrdersForScan(db = {}) {
  const minCreatedAt = Date.now() - WALLET_CHAIN_SCAN_ORDER_TTL_HOURS * 60 * 60 * 1000;
  return (db.walletOrders || [])
    .filter((order) => (order.status || "pending") === "pending")
    .filter((order) => !order.paymentProvider || order.paymentProvider === "manual")
    .filter((order) => order.address && order.payableAmountText)
    .filter((order) => walletScanSupported(order.chain || order.network))
    .filter((order) => {
      const time = new Date(order.createdAt || 0).getTime();
      return !Number.isFinite(time) || !time || time >= minCreatedAt;
    });
}

function sameWalletAddress(a = "", b = "", chain = "") {
  return normalizeChainAddress(a, chain) === normalizeChainAddress(b, chain);
}

function walletTransferMatchesOrder(order = {}, tx = {}, usedKeys = new Set()) {
  const chain = normalizeWalletChain(order.chain || order.network);
  if (!chain || tx.chain !== chain) return false;
  if (!tx.hash || usedKeys.has(walletTransactionKey(chain, tx.hash))) return false;
  if (!sameWalletAddress(tx.to, order.address, chain)) return false;
  if (!walletOrderAmountMatches(order, tx)) return false;
  if (Number(tx.confirmations || 0) < walletScanConfirmations(chain)) return false;
  const createdAt = new Date(order.createdAt || "").getTime();
  const txTime = new Date(tx.timestamp || "").getTime();
  if (Number.isFinite(createdAt) && Number.isFinite(txTime) && txTime + 5 * 60 * 1000 < createdAt) return false;
  return true;
}

function walletScanGroups(orders = []) {
  const groups = new Map();
  orders.forEach((order) => {
    const chain = normalizeWalletChain(order.chain || order.network);
    const address = normalizeChainAddress(order.address || "", chain);
    if (!chain || !address) return;
    const key = `${chain}:${address}`;
    if (!groups.has(key)) groups.set(key, { chain, address: order.address, orders: [] });
    groups.get(key).orders.push(order);
  });
  return Array.from(groups.values());
}

async function scanAndSettleWalletOrders({ limit = 100, force = false } = {}) {
  const startedAt = new Date().toISOString();
  if (!WALLET_CHAIN_SCAN_ENABLED && !force) {
    return { ok: true, enabled: false, scanned: 0, matched: 0, errors: [], startedAt, finishedAt: new Date().toISOString() };
  }
  const db = await readDb();
  const config = await readAppConfig();
  const pending = pendingWalletOrdersForScan(db).slice(0, limit);
  const usedKeys = usedWalletTransactionKeys(db);
  const errors = [];
  let scanned = 0;
  let matched = 0;
  for (const group of walletScanGroups(pending)) {
    let transfers = [];
    try {
      transfers = await scanWalletTransfers(group.chain, group.address, { orders: group.orders });
      scanned += 1;
    } catch (error) {
      errors.push({
        chain: group.chain,
        address: group.address,
        message: error.message || "Scan failed",
        detail: error.payload?.message || error.payload?.result || "",
      });
      continue;
    }
    for (const order of group.orders) {
      if ((order.status || "pending") !== "pending") continue;
      const tx = transfers.find((item) => walletTransferMatchesOrder(order, item, usedKeys));
      if (!tx) continue;
      const key = walletTransactionKey(tx.chain, tx.hash);
      const result = await settleWalletOrderPayment(db, order, config, {
        note: `Auto matched on ${tx.chain}.`,
        chain: tx.chain,
        transactionHash: tx.hash,
        confirmations: tx.confirmations,
        blockNumber: tx.blockNumber,
        fromAddress: tx.from,
        matchedAmountText: tx.amountText,
        matchedAt: new Date().toISOString(),
        scanSource: tx.source,
      });
      if (result.settled) {
        usedKeys.add(key);
        matched += 1;
      }
    }
  }
  if (matched) {
    if (dbEnabled()) {
      for (const order of pending) {
        if (order.status === "paid") await updateWalletOrderInDb(order);
      }
    } else {
      await writeDb(db);
    }
  }
  return {
    ok: true,
    enabled: WALLET_CHAIN_SCAN_ENABLED,
    scanned,
    pending: pending.length,
    matched,
    errors,
    startedAt,
    finishedAt: new Date().toISOString(),
  };
}

let walletScanRunning = false;
let walletScanTimer = null;

async function runWalletScanTick(reason = "timer") {
  if (walletScanRunning) return;
  walletScanRunning = true;
  try {
    const result = await withAppStateWriteLock(() => scanAndSettleWalletOrders({ limit: 100 }));
    if (result.matched || result.errors?.length) {
      console.log("[wallet-scan]", { reason, matched: result.matched, scanned: result.scanned, errors: result.errors?.length || 0 });
    }
  } catch (error) {
    console.error("[wallet-scan] failed", error.message || error);
  } finally {
    walletScanRunning = false;
  }
}

function startWalletScanScheduler() {
  if (!WALLET_CHAIN_SCAN_ENABLED || walletScanTimer) return;
  walletScanTimer = setInterval(() => {
    runWalletScanTick("timer");
  }, WALLET_CHAIN_SCAN_INTERVAL_MS);
  walletScanTimer.unref?.();
  setTimeout(() => runWalletScanTick("startup"), 10000).unref?.();
}

function paypalEnabled() {
  return Boolean(PAYPAL_ENABLED && PAYPAL_CLIENT_ID && PAYPAL_CLIENT_SECRET);
}

function randomSecretToken(prefix = "token") {
  return `${prefix}-${Date.now()}-${crypto.randomBytes(18).toString("hex")}`;
}

function paypalCheckoutUrl(pathname = "/", params = {}) {
  const base = PAYPAL_CHECKOUT_BASE_URL || "https://pay.seed2.io";
  const url = new URL(pathname || "/", `${base}/`);
  Object.entries(params || {}).forEach(([key, value]) => {
    const text = String(value ?? "").trim();
    if (text) url.searchParams.set(key, text);
  });
  return url.toString();
}

function safePayPalReturnUrl(req, value = "") {
  const fallback = `${pageOriginFromRequest(req)}/#topups`;
  const text = String(value || "").trim();
  if (!text) return fallback;
  try {
    const origin = pageOriginFromRequest(req);
    if (text.startsWith("#")) return `${origin}/${text}`;
    if (text.startsWith("/")) return `${origin}${text}`;
    const parsed = new URL(text);
    const allowed = new URL(origin);
    return parsed.host === allowed.host ? parsed.toString() : fallback;
  } catch {
    return fallback;
  }
}

function paypalCheckoutSessionExpired(order = {}) {
  const createdMs = Date.parse(order.paypalCheckoutSessionCreatedAt || order.createdAt || "");
  if (!Number.isFinite(createdMs)) return false;
  return Date.now() - createdMs > PAYPAL_CHECKOUT_SESSION_TTL_MS;
}

function findPayPalCheckoutSessionOrder(db = {}, sessionId = "") {
  const sid = String(sessionId || "").trim();
  if (!sid) return null;
  return (db.walletOrders || []).find((order) => (
    order.paymentProvider === "paypal" &&
    String(order.paypalCheckoutSessionId || "") === sid
  )) || null;
}

function paypalApiBaseUrl() {
  return PAYPAL_ENV === "sandbox" ? "https://api-m.sandbox.paypal.com" : "https://api-m.paypal.com";
}

function paypalCnyCentsPerUnit(wallet = {}) {
  if (PAYPAL_CNY_CENTS_PER_UNIT_ENV !== "") {
    return clampNumber(PAYPAL_CNY_CENTS_PER_UNIT_ENV, DEFAULT_USDT_CNY_CENTS, 1, 100000);
  }
  return walletCnyCentsPerUsdt(wallet);
}

function paypalMoneyValue(amount) {
  return (Math.round(Number(amount || 0) * 100) / 100).toFixed(2);
}

function paypalPublicConfig() {
  const enabled = paypalEnabled();
  return {
    enabled,
    clientId: enabled ? PAYPAL_CLIENT_ID : "",
    currency: PAYPAL_CURRENCY,
    environment: PAYPAL_ENV,
    minAmount: PAYPAL_MIN_AMOUNT,
    maxAmount: PAYPAL_MAX_AMOUNT,
    topupPackages: publicTopupPackages(),
  };
}

