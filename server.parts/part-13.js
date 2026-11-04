async function getPayPalAccessToken() {
  if (!paypalEnabled()) {
    const error = new Error("PayPal is not configured.");
    error.statusCode = 503;
    throw error;
  }
  if (paypalTokenCache.accessToken && Date.now() < paypalTokenCache.expiresAt - 60_000) {
    return paypalTokenCache.accessToken;
  }
  const credentials = Buffer.from(`${PAYPAL_CLIENT_ID}:${PAYPAL_CLIENT_SECRET}`).toString("base64");
  const response = await fetch(`${paypalApiBaseUrl()}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      authorization: `Basic ${credentials}`,
      "content-type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload.access_token) {
    const error = new Error(payload.error_description || payload.message || "Failed to authenticate PayPal.");
    error.statusCode = response.status || 502;
    error.details = payload;
    throw error;
  }
  paypalTokenCache = {
    accessToken: payload.access_token,
    expiresAt: Date.now() + Math.max(60, Number(payload.expires_in || 300)) * 1000,
  };
  return paypalTokenCache.accessToken;
}

async function paypalRequest(pathname, { method = "GET", body, headers = {} } = {}) {
  const accessToken = await getPayPalAccessToken();
  const response = await fetch(`${paypalApiBaseUrl()}${pathname}`, {
    method,
    headers: {
      authorization: `Bearer ${accessToken}`,
      "content-type": "application/json",
      ...headers,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(payload.message || payload.error_description || payload.name || "PayPal request failed.");
    error.statusCode = response.status || 502;
    error.code = paypalErrorSummary(payload, response.status).issue || payload.name || "PAYPAL_REQUEST_FAILED";
    error.details = payload;
    throw error;
  }
  return payload;
}

function paypalErrorSummary(payload = {}, statusCode = 0) {
  const details = Array.isArray(payload?.details) ? payload.details : [];
  const first = details.find((item) => item && typeof item === "object") || {};
  return {
    name: String(payload?.name || payload?.error || "").slice(0, 80),
    issue: String(first.issue || payload?.issue || "").slice(0, 120),
    description: String(first.description || payload?.error_description || payload?.message || "").slice(0, 500),
    field: String(first.field || "").slice(0, 160),
    debugId: String(payload?.debug_id || payload?.debugId || "").slice(0, 120),
    httpStatus: Number(statusCode || payload?.status || 0) || 0,
  };
}

function paypalPublicFailureMessage(summary = {}) {
  const issue = String(summary.issue || summary.name || "").toUpperCase();
  if (/PAYEE_ACCOUNT_(?:RESTRICTED|LOCKED_OR_CLOSED)|PAYEE_NOT_ENABLED_FOR_CARD_PROCESSING/.test(issue)) {
    return "PayPal is temporarily unavailable for this merchant. Please use USDT or contact support.";
  }
  if (/DUPLICATE_INVOICE_ID/.test(issue)) {
    return "PayPal could not reuse this payment reference. Please try again.";
  }
  return "PayPal could not create this payment. Please try again or use USDT.";
}

function findPayPalApprovalLink(orderPayload = {}) {
  const links = Array.isArray(orderPayload.links) ? orderPayload.links : [];
  const approvalRels = new Set(["payer-action", "approve"]);
  return links.find((link) => (
    approvalRels.has(String(link.rel || "").trim().toLowerCase())
    && String(link.href || "").trim()
  ))?.href || "";
}

function paypalCaptureFromOrder(payload = {}) {
  const purchaseUnits = Array.isArray(payload.purchase_units) ? payload.purchase_units : [];
  for (const unit of purchaseUnits) {
    const captures = Array.isArray(unit?.payments?.captures) ? unit.payments.captures : [];
    const capture = captures.find(Boolean);
    if (capture) return capture;
  }
  return null;
}

function telegramPaymentNotifierEnabled() {
  return Boolean(TELEGRAM_PAYMENT_BOT_TOKEN && TELEGRAM_PAYMENT_NOTIFY_CHAT_IDS.length);
}

function telegramPaymentSiteLabel(order = {}) {
  const source = String(order.sourceOrigin || "").trim();
  if (source) {
    try {
      return new URL(source).hostname || source;
    } catch {}
  }
  return String(order.tenantId || DEFAULT_TENANT_ID);
}

function telegramPaymentMethodLabel(order = {}) {
  if (String(order.paymentProvider || "").toLowerCase() === "paypal" || String(order.network || "").toLowerCase() === "paypal") return "PayPal";
  const network = String(order.network || order.chain || "").trim();
  return network ? `USDT (${network})` : "USDT";
}

function telegramPaymentNotificationText(order = {}, user = {}) {
  const amount = order.payableAmountText || order.payableAmount || order.baseAmount || 0;
  const asset = String(order.asset || order.currency || (order.paymentProvider === "paypal" ? PAYPAL_CURRENCY : "USDT")).trim();
  const credits = creditsAmount(order.creditAmount || order.packageCredits || 0);
  const userLabel = user.username || user.email || order.username || order.userId || "unknown";
  const lines = [
    "充值成功",
    `站点: ${telegramPaymentSiteLabel(order)}`,
    `用户: ${userLabel}`,
    `用户 ID: ${order.userId || user.id || ""}`,
    `支付方式: ${telegramPaymentMethodLabel(order)}`,
    `金额: ${amount} ${asset}`,
    `到账积分: ${credits}`,
    `订单号: ${order.id || ""}`,
    `到账时间: ${order.paidAt || order.updatedAt || new Date().toISOString()}`,
  ];
  if (order.paypalPayerEmail) lines.push(`PayPal 账户: ${order.paypalPayerEmail}`);
  if (order.transactionHash) lines.push(`交易哈希: ${order.transactionHash}`);
  return lines.join("\n");
}

async function callTelegramPaymentApi(method, payload = {}) {
  const response = await fetch(`https://api.telegram.org/bot${TELEGRAM_PAYMENT_BOT_TOKEN}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(15000),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.ok === false) {
    const error = new Error(data.description || `Telegram payment notification failed (${response.status}).`);
    error.statusCode = response.status || 502;
    throw error;
  }
  return data;
}

async function notifyTelegramPaymentOrder(order = {}, user = {}) {
  if (!telegramPaymentNotifierEnabled() || order.status !== "paid" || !order.telegramPaymentNotificationPendingAt) return false;
  const sentChatIds = new Set(Array.isArray(order.telegramPaymentNotificationSentChatIds)
    ? order.telegramPaymentNotificationSentChatIds.map(String)
    : []);
  const pendingChatIds = TELEGRAM_PAYMENT_NOTIFY_CHAT_IDS.filter((chatId) => !sentChatIds.has(chatId));
  if (!pendingChatIds.length) {
    order.telegramPaymentNotificationStatus = "sent";
    order.telegramPaymentNotificationSentAt = order.telegramPaymentNotificationSentAt || new Date().toISOString();
    return false;
  }
  const now = new Date().toISOString();
  order.telegramPaymentNotificationLastAttemptAt = now;
  order.telegramPaymentNotificationAttempts = Math.max(0, Number(order.telegramPaymentNotificationAttempts || 0)) + 1;
  const errors = [];
  for (const chatId of pendingChatIds) {
    try {
      await callTelegramPaymentApi("sendMessage", {
        chat_id: chatId,
        text: telegramPaymentNotificationText(order, user),
        disable_web_page_preview: true,
      });
      sentChatIds.add(chatId);
    } catch (error) {
      errors.push(`${chatId}: ${error.message || error}`);
    }
  }
  order.telegramPaymentNotificationSentChatIds = Array.from(sentChatIds);
  if (errors.length) {
    order.telegramPaymentNotificationStatus = "retry";
    order.telegramPaymentNotificationError = errors.join("; ").slice(0, 1000);
  } else {
    order.telegramPaymentNotificationStatus = "sent";
    order.telegramPaymentNotificationError = "";
    order.telegramPaymentNotificationSentAt = now;
  }
  order.updatedAt = now;
  return true;
}

let telegramPaymentNotificationScanRunning = false;
async function scanTelegramPaymentNotifications() {
  if (telegramPaymentNotificationScanRunning || !telegramPaymentNotifierEnabled()) return;
  telegramPaymentNotificationScanRunning = true;
  try {
    const db = await readDb();
    const orders = (db.walletOrders || [])
      .filter((order) => order.status === "paid" && order.telegramPaymentNotificationPendingAt && order.telegramPaymentNotificationStatus !== "sent")
      .slice(0, 50);
    const userMap = new Map((db.users || []).map((user) => [user.id, user]));
    for (const order of orders) {
      await notifyTelegramPaymentOrder(order, userMap.get(order.userId) || {});
      if (dbEnabled()) await updateWalletOrderInDb(order);
    }
    if (orders.length && !dbEnabled()) await writeDb(db);
  } catch (error) {
    console.warn("[telegram-payment-notify-failed]", error.message || error);
  } finally {
    telegramPaymentNotificationScanRunning = false;
  }
}

const DOUBLE_TOPUP_PROMO = Object.freeze({
  id: "double-topup-20261015",
  startsAt: Date.parse("2026-10-15T00:00:00+07:00"),
  endsAt: Date.parse("2026-11-15T00:00:00+07:00"),
  windowMs: 3 * 24 * 60 * 60 * 1000,
  amount: 30,
  baseCredits: 3000,
  grantCredits: 4500,
});
const doubleTopupCheckoutLocks = new Map();

function doubleTopupHostAllowed(req) {
  const host = String(requestHostname(req) || "").toLowerCase().replace(/^www\./, "");
  return host === "123vips.com" || host === "123vip.fans";
}

function doubleTopupCampaignOpen(now = Date.now()) {
  return now >= DOUBLE_TOPUP_PROMO.startsAt && now < DOUBLE_TOPUP_PROMO.endsAt;
}

function doubleTopupState(user) {
  const state = user && user.doubleTopupPromo && typeof user.doubleTopupPromo === "object" ? user.doubleTopupPromo : {};
  return state.id === DOUBLE_TOPUP_PROMO.id ? state : {};
}

async function saveDoubleTopupState(user, next) {
  user.doubleTopupPromo = { id: DOUBLE_TOPUP_PROMO.id, ...doubleTopupState(user), ...next };
  user.updatedAt = new Date().toISOString();
  if (dbEnabled()) await updateUserInDb(user);
  return user.doubleTopupPromo;
}

async function syncDoubleTopupWindow(user, hintedStart = "") {
  const now = Date.now();
  const current = doubleTopupState(user);
  if (current.claimedOrderId) return current;
  let start = Date.parse(current.windowStartedAt || "");
  const hint = Date.parse(String(hintedStart || ""));
  if (!Number.isFinite(start)) start = Number.isFinite(hint) && hint >= DOUBLE_TOPUP_PROMO.startsAt && hint <= now ? hint : now;
  if (start < DOUBLE_TOPUP_PROMO.startsAt || start > now || now - start >= DOUBLE_TOPUP_PROMO.windowMs) start = now;
  const iso = new Date(start).toISOString();
  if (current.windowStartedAt !== iso) return saveDoubleTopupState(user, { windowStartedAt: iso });
  return current;
}

function doubleTopupView(state = {}, now = Date.now()) {
  const claimed = Boolean(state.claimedOrderId);
  const start = Date.parse(state.windowStartedAt || "") || now;
  const windowEnd = Math.min(start + DOUBLE_TOPUP_PROMO.windowMs, DOUBLE_TOPUP_PROMO.endsAt);
  return {
    id: DOUBLE_TOPUP_PROMO.id,
    visible: doubleTopupCampaignOpen(now) && !claimed && now < windowEnd,
    claimed,
    amount: DOUBLE_TOPUP_PROMO.amount,
    baseCredits: DOUBLE_TOPUP_PROMO.baseCredits,
    grantCredits: DOUBLE_TOPUP_PROMO.grantCredits,
    currency: "USD",
    endsAt: new Date(windowEnd).toISOString(),
    campaignEndsAt: new Date(DOUBLE_TOPUP_PROMO.endsAt).toISOString(),
  };
}

async function reserveDoubleTopupPending(user, orderId, replacePendingId = "") {
  const expected = String(replacePendingId || "");
  if (dbEnabled()) {
    const { rows } = await dbQuery(
      `UPDATE app_users
       SET payload = jsonb_set(
         COALESCE(payload, '{}'::jsonb),
         '{doubleTopupPromo}',
         COALESCE(payload->'doubleTopupPromo', '{}'::jsonb) || jsonb_build_object('id', $2::text, 'pendingOrderId', $3::text),
         true
       ),
       updated_at = NOW()
       WHERE id = $1
         AND COALESCE(payload#>>'{doubleTopupPromo,claimedOrderId}', '') = ''
         AND COALESCE(payload#>>'{doubleTopupPromo,pendingOrderId}', '') IN ('', $4)
       RETURNING id`,
      [user.id, DOUBLE_TOPUP_PROMO.id, orderId, expected],
    );
    if (rows && rows.length) return { status: "reserved" };
    const fresh = await getUserByIdInDb(user.id);
    const state = doubleTopupState(fresh || user);
    if (state.claimedOrderId) return { status: "claimed", state };
    if (state.pendingOrderId) return { status: "pending", pendingOrderId: state.pendingOrderId, state };
    return { status: "retry", state };
  }
  const state = doubleTopupState(user);
  if (state.claimedOrderId) return { status: "claimed", state };
  if (state.pendingOrderId && state.pendingOrderId !== expected && state.pendingOrderId !== orderId) {
    return { status: "pending", pendingOrderId: state.pendingOrderId, state };
  }
  await saveDoubleTopupState(user, { pendingOrderId: orderId });
  return { status: "reserved" };
}

async function claimDoubleTopupOnce(user, orderId) {
  const now = new Date().toISOString();
  if (dbEnabled()) {
    const { rows } = await dbQuery(
      `UPDATE app_users
       SET payload = jsonb_set(
         COALESCE(payload, '{}'::jsonb),
         '{doubleTopupPromo}',
         COALESCE(payload->'doubleTopupPromo', '{}'::jsonb) || jsonb_build_object('id', $2::text, 'claimedAt', $3::text, 'claimedOrderId', $4::text),
         true
       ),
       updated_at = NOW()
       WHERE id = $1
         AND COALESCE(payload#>>'{doubleTopupPromo,claimedOrderId}', '') IN ('', $4)
       RETURNING id`,
      [user.id, DOUBLE_TOPUP_PROMO.id, now, orderId],
    );
    return Boolean(rows && rows.length);
  }
  const current = doubleTopupState(user);
  if (current.claimedOrderId && current.claimedOrderId !== orderId) return false;
  await saveDoubleTopupState(user, { claimedAt: now, claimedOrderId: orderId });
  return true;
}

async function applyDoubleTopupPromoSettlement(db, order) {
  if (!order || order.promoId !== DOUBLE_TOPUP_PROMO.id || order.orderKind === "subscription") return;
  const user = (db.users || []).find((entry) => entry.id === order.userId) || await getUserByIdInDb(order.userId);
  if (!user) return;
  const won = await claimDoubleTopupOnce(user, order.id);
  if (won) {
    order.creditAmount = creditsAmount(DOUBLE_TOPUP_PROMO.grantCredits);
    order.packageCredits = order.creditAmount;
    order.promoBonusApplied = true;
    user.doubleTopupPromo = { ...doubleTopupState(user), id: DOUBLE_TOPUP_PROMO.id, claimedOrderId: order.id, claimedAt: new Date().toISOString() };
    return;
  }
  const normal = findTopupPackage({ packageId: "usd-30" }, user);
  order.creditAmount = creditsAmount(normal?.credits || Number(order.baseAmount || DOUBLE_TOPUP_PROMO.amount) * DEFAULT_CREDITS_PER_USD);
  order.packageCredits = order.creditAmount;
  order.packageId = normal?.id || "usd-30";
  order.promoId = "";
  order.promoBonusApplied = false;
  order.promoDowngraded = true;
  order.note = order.note || "Double top-up already used. Settled at the regular package rate.";
}

const doubleTopupStatusCache = new Map();
async function handleDoubleTopupPromoStatus(req, res) {
  if (!doubleTopupHostAllowed(req) || !doubleTopupCampaignOpen()) {
    return sendJson(res, 200, { ok: true, promo: { id: DOUBLE_TOPUP_PROMO.id, visible: false } });
  }
  const cacheKey = `${String(req.headers.cookie || "").slice(0, 180)}|${String(req.url || "")}`;
  const cached = doubleTopupStatusCache.get(cacheKey);
  if (cached && Date.now() - cached.at < 20000) return sendJson(res, 200, cached.body);
  const auth = await getAuth(req);
  if (!auth.user) {
    const hinted = String(new URL(req.url, "http://localhost").searchParams.get("windowStartedAt") || "");
    const hintMs = Date.parse(hinted);
    const now = Date.now();
    const start = Number.isFinite(hintMs) && hintMs >= DOUBLE_TOPUP_PROMO.startsAt && hintMs <= now && now - hintMs < DOUBLE_TOPUP_PROMO.windowMs ? hintMs : now;
    const body = { ok: true, promo: doubleTopupView({ windowStartedAt: new Date(start).toISOString() }) };
    doubleTopupStatusCache.set(cacheKey, { at: Date.now(), body });
    return sendJson(res, 200, body);
  }
  const hinted = String(new URL(req.url, "http://localhost").searchParams.get("windowStartedAt") || "");
  const state = await syncDoubleTopupWindow(auth.user, hinted);
  const body = { ok: true, promo: doubleTopupView(state) };
  doubleTopupStatusCache.set(cacheKey, { at: Date.now(), body });
  return sendJson(res, 200, body);
}

async function createDoubleTopupCheckout(req, res) {
  const auth = await requireUser(req, res);
  if (!auth) return;
  if (!doubleTopupHostAllowed(req) || !doubleTopupCampaignOpen()) {
    return sendJson(res, 403, { ok: false, code: "PROMO_CLOSED", message: "这个活动已经结束。" });
  }
  const userId = auth.user.id;
  const previous = doubleTopupCheckoutLocks.get(userId) || Promise.resolve();
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  const tail = previous.catch(() => {}).then(() => gate);
  doubleTopupCheckoutLocks.set(userId, tail);
  await previous.catch(() => {});
  try {
    const fresh = await getUserByIdInDb(userId) || auth.user;
    const state = doubleTopupState(fresh);
    const cashierBaseUrl = stripeCheckoutBaseUrlForRequest(req);
    const stripeConfig = stripeConfigForHost(cashierBaseUrl);
    if (!stripeEnabled(stripeConfig)) return sendJson(res, 503, { ok: false, code: "STRIPE_NOT_CONFIGURED", message: "Stripe is not configured yet." });
    const reusePending = async (orderId, requirePromo) => {
      if (!orderId) return null;
      const existing = await getWalletOrderByIdInDb(orderId);
      if (!existing || existing.userId !== userId || existing.status !== "pending" || stripeCheckoutSessionExpired(existing)) return null;
      if (requirePromo && existing.promoId !== DOUBLE_TOPUP_PROMO.id) return null;
      if (!requirePromo && existing.promoId) return null;
      return sendJson(res, 200, {
        ok: true,
        reused: true,
        promoApplied: existing.promoId === DOUBLE_TOPUP_PROMO.id,
        checkoutUrl: stripeCheckoutUrl(existing.id, cashierBaseUrl),
      });
    };
    if (state.claimedOrderId) {
      const reused = await reusePending(state.normalPendingOrderId, false);
      if (reused) return reused;
      const config = await readAppConfig();
      const normal = findTopupPackage({ packageId: "usd-30" }, fresh);
      const amount = Number(normal?.price ?? normal?.amount ?? DOUBLE_TOPUP_PROMO.amount);
      const credits = creditsAmount(normal?.credits || amount * walletCreditsPerUsd(config.wallet));
      const order = {
        id: randomId("stripe"),
        tenantId: requestTenantOptions(req).tenant?.tenantId || DEFAULT_TENANT_ID,
        userId,
        paymentProvider: "stripe",
        orderKind: "topup",
        promoId: "",
        baseAmount: amount,
        creditAmount: credits,
        packageId: normal?.id || "usd-30",
        packageCredits: credits,
        creditsPerUsd: walletCreditsPerUsd(config.wallet),
        currency: STRIPE_CURRENCY.toUpperCase(),
        payableAmount: amount,
        payableAmountText: Number(amount).toFixed(2),
        asset: STRIPE_CURRENCY.toUpperCase(),
        network: "Stripe",
        chain: "stripe",
        status: "pending",
        sourceOrigin: pageOriginFromRequest(req),
        cashierHost: normalizeHostname(cashierBaseUrl),
        stripeAccountId: stripeConfig.accountId || "",
        note: "Double top-up already used. Charged at the regular package rate.",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      await createWalletOrderInDb(order);
      await saveDoubleTopupState(fresh, { normalPendingOrderId: order.id });
      return sendJson(res, 200, { ok: true, reused: false, promoApplied: false, checkoutUrl: stripeCheckoutUrl(order.id, cashierBaseUrl) });
    }
    const reusedPromo = await reusePending(state.pendingOrderId, true);
    if (reusedPromo) return reusedPromo;
    await syncDoubleTopupWindow(fresh);
    const config = await readAppConfig();
    const amount = DOUBLE_TOPUP_PROMO.amount;
    const orderId = randomId("stripe");
    const stalePending = state.pendingOrderId || "";
    const reserved = await reserveDoubleTopupPending(fresh, orderId, stalePending);
    if (reserved.status !== "reserved") {
      const pendingId = reserved.pendingOrderId || doubleTopupState(await getUserByIdInDb(userId) || fresh).pendingOrderId;
      const reused = await reusePending(pendingId, true);
      if (reused) return reused;
      if (reserved.status === "claimed") {
        return sendJson(res, 409, { ok: false, code: "PROMO_ALREADY_USED", message: "这次加赠已经用过，请再点一次按原价充值。" });
      }
      return sendJson(res, 409, { ok: false, code: "PROMO_CHECKOUT_BUSY", message: "正在处理上一笔充值，请稍后再试。" });
    }
    const order = {
      id: orderId,
      tenantId: requestTenantOptions(req).tenant?.tenantId || DEFAULT_TENANT_ID,
      userId,
      paymentProvider: "stripe",
      orderKind: "topup",
      promoId: DOUBLE_TOPUP_PROMO.id,
      baseAmount: amount,
      creditAmount: creditsAmount(DOUBLE_TOPUP_PROMO.grantCredits),
      packageId: DOUBLE_TOPUP_PROMO.id,
      packageCredits: DOUBLE_TOPUP_PROMO.grantCredits,
      creditsPerUsd: walletCreditsPerUsd(config.wallet),
      currency: STRIPE_CURRENCY.toUpperCase(),
      payableAmount: amount,
      payableAmountText: amount.toFixed(2),
      asset: STRIPE_CURRENCY.toUpperCase(),
      network: "Stripe",
      chain: "stripe",
      status: "pending",
      sourceOrigin: pageOriginFromRequest(req),
      cashierHost: normalizeHostname(cashierBaseUrl),
      stripeAccountId: stripeConfig.accountId || "",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    try {
      await createWalletOrderInDb(order);
    } catch (error) {
      if (dbEnabled()) {
        await dbQuery(
          `UPDATE app_users
           SET payload = jsonb_set(payload, '{doubleTopupPromo,pendingOrderId}', '""'::jsonb, true)
           WHERE id = $1 AND COALESCE(payload#>>'{doubleTopupPromo,pendingOrderId}', '') = $2`,
          [userId, orderId],
        );
      }
      throw error;
    }
    return sendJson(res, 200, { ok: true, reused: false, promoApplied: true, checkoutUrl: stripeCheckoutUrl(order.id, cashierBaseUrl) });
  } finally {
    release();
    if (doubleTopupCheckoutLocks.get(userId) === tail) doubleTopupCheckoutLocks.delete(userId);
  }
}

async function settleWalletOrderPayment(db, order, config, meta = {}) {
  if (!order) {
    const error = new Error("Payment order not found.");
    error.statusCode = 404;
    throw error;
  }
  const now = new Date().toISOString();
  if (order.status === "paid") {
    return { settled: false, user: (db.users || []).find((u) => u.id === order.userId) || null };
  }
  await applyDoubleTopupPromoSettlement(db, order);
  const creditsPerUsd = order.creditsPerUsd || walletCreditsPerUsd(config.wallet);
  const legacyRate = order.paymentProvider === "paypal"
    ? (order.cnyCentsPerUnit || paypalCnyCentsPerUnit(config.wallet))
    : (order.cnyCentsPerUsdt || walletCnyCentsPerUsdt(config.wallet));
  const creditDelta = creditsAmount(order.creditAmount ?? Number(order.baseAmount || 0) * creditsPerUsd);
  order.creditAmount = creditDelta;
  order.creditsPerUsd = creditsPerUsd;
  if (order.paymentProvider === "paypal") order.cnyCentsPerUnit = order.cnyCentsPerUnit || legacyRate;
  else order.cnyCentsPerUsdt = order.cnyCentsPerUsdt || legacyRate;
  if (meta.paypalCaptureId) order.paypalCaptureId = meta.paypalCaptureId;
  if (meta.paypalPayerEmail) order.paypalPayerEmail = meta.paypalPayerEmail;
  if (meta.paypalStatus) order.paypalStatus = meta.paypalStatus;
  if (meta.transactionHash) order.transactionHash = meta.transactionHash;
  if (meta.chain) order.chain = meta.chain;
  if (meta.transactionHash) order.matched = true;
  if (meta.confirmations !== undefined) order.confirmations = Number(meta.confirmations || 0);
  if (meta.blockNumber !== undefined) order.blockNumber = Number(meta.blockNumber || 0);
  if (meta.fromAddress) order.fromAddress = meta.fromAddress;
  if (meta.matchedAmountText) order.matchedAmountText = meta.matchedAmountText;
  if (meta.matchedAt) order.matchedAt = meta.matchedAt;
  if (meta.scanSource) order.scanSource = meta.scanSource;
  if (meta.transactionHash) {
    order.matchedTransactions = Array.isArray(order.matchedTransactions) ? order.matchedTransactions : [];
    if (!order.matchedTransactions.some((tx) => walletTransactionKey(tx.chain || order.chain || order.network, tx.hash) === walletTransactionKey(meta.chain || order.chain || order.network, meta.transactionHash))) {
      order.matchedTransactions.unshift({
        chain: meta.chain || order.chain || order.network || "",
        hash: meta.transactionHash,
        amount: meta.matchedAmountText || order.payableAmountText || "",
        confirmations: Number(meta.confirmations || 0),
        blockNumber: Number(meta.blockNumber || 0),
        from: meta.fromAddress || "",
        source: meta.scanSource || "",
        matchedAt: meta.matchedAt || now,
      });
    }
  }
  const subscriptionPlan = order.orderKind === "subscription"
    ? (await getBillingPlanInDb(order.tenantId || DEFAULT_TENANT_ID, order.billingPlanId || "") || {
        id: order.billingPlanId || "",
        name: order.billingPlanName || "Pro",
        intervalUnit: order.billingIntervalUnit || "month",
        intervalCount: order.billingIntervalCount || 1,
        includedCredits: order.creditAmount || 0,
      })
    : null;
  const creditType = order.orderKind === "subscription"
    ? "subscription_credit_grant"
    : order.orderKind === "product" && order.productId === API_DOCS_PRODUCT_ID
      ? "api_docs_test_credit"
      : "wallet_topup";
  const user = await changeUserCredits(db, order.userId, creditDelta, creditType, {
    orderId: order.id,
    tenantId: order.tenantId || DEFAULT_TENANT_ID,
    orderKind: order.orderKind || "topup",
    billingPlanId: order.billingPlanId || "",
    productId: order.productId || "",
    amount: order.baseAmount,
    asset: order.asset,
    network: order.network,
    provider: order.paymentProvider || "manual",
    paypalOrderId: order.paypalOrderId || "",
    paypalCaptureId: order.paypalCaptureId || "",
    transactionHash: order.transactionHash || "",
    chain: order.chain || order.network || "",
  });
  if (subscriptionPlan) await activatePaidSubscription(db, order, subscriptionPlan);
  if (order.orderKind === "product" && order.productId === API_DOCS_PRODUCT_ID) {
    await grantApiDocsAccess(db, user, { orderId: order.id, source: order.paymentProvider || "payment" });
  }
  order.status = "paid";
  order.paidAt = order.paidAt || now;
  order.telegramPaymentNotificationPendingAt = order.telegramPaymentNotificationPendingAt || now;
  order.telegramPaymentNotificationStatus = order.telegramPaymentNotificationStatus || "pending";
  order.updatedAt = now;
  if (meta.note && !order.note) order.note = String(meta.note).slice(0, 200);
  await maybeGrantReferralReward(db, order.userId, order);
  await maybeGrantReferralCommission(db, order.userId, order);
  return { settled: true, user };
}

async function safeSettleWalletOrderPayment(db, order, config, meta = {}) {
  try {
    return await settleWalletOrderPayment(db, order, config, meta);
  } catch (error) {
    order.status = order.status === "paid" ? "pending" : (order.status || "pending");
    order.note = error.message || "Failed to settle payment.";
    order.updatedAt = new Date().toISOString();
    return { settled: false, error };
  }
}

function decodeDataUrl(dataUrl) {
  const match = String(dataUrl || "").match(/^data:(image\/(?:png|jpeg|jpg|webp|bmp|gif));base64,([a-z0-9+/=]+)$/i);
  if (!match) {
    const error = new Error("Only PNG/JPG/WebP/BMP/GIF images are supported.");
    error.statusCode = 400;
    throw error;
  }
  return {
    mime: match[1].replace("image/jpg", "image/jpeg"),
    bytes: Buffer.from(match[2], "base64"),
  };
}

function decodeImageDataUrl(dataUrl) {
  return decodeDataUrl(dataUrl);
}

function imageExtFromMime(mime) {
  if (mime === "image/png") return ".png";
  if (mime === "image/webp") return ".webp";
  if (mime === "image/bmp") return ".bmp";
  if (mime === "image/gif") return ".gif";
  return ".jpg";
}

function audioExtFromMime(mime) {
  if (mime === "audio/mpeg") return ".mp3";
  if (mime === "audio/wav") return ".wav";
  if (mime === "audio/ogg") return ".ogg";
  if (mime === "audio/mp4") return ".m4a";
  return ".mp3";
}

function decodeAudioDataUrl(dataUrl) {
  const match = String(dataUrl || "").match(/^data:(audio\/(?:mp3|mpeg|wav|ogg|m4a));base64,([a-z0-9+/=]+)$/i);
  if (!match) {
    const error = new Error("只支持 MP3、WAV、OGG、M4A 音频。");
    error.statusCode = 400;
    throw error;
  }
  return {
    mime: match[1],
    bytes: Buffer.from(match[2], "base64"),
  };
}

function imageMimeFromPath(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".png") return "image/png";
  if (ext === ".webp") return "image/webp";
  if (ext === ".bmp") return "image/bmp";
  if (ext === ".gif") return "image/gif";
  return "image/jpeg";
}

function imageMimeFromKnownPath(filePath) {
  const ext = path.extname(String(filePath || "").split("?")[0]).toLowerCase();
  if (![".jpg", ".jpeg", ".png", ".webp", ".bmp", ".gif"].includes(ext)) return "";
  return imageMimeFromPath(filePath);
}

const SEEDANCE_IMAGE_ASPECT_RATIO_MIN = 0.4;
const SEEDANCE_IMAGE_ASPECT_RATIO_MAX = 2.5;
const SEEDANCE_IMAGE_DIMENSION_MIN = 300;
const SEEDANCE_IMAGE_DIMENSION_MAX = 6000;
const SEEDANCE_VIDEO_PIXEL_COUNT_MIN = 409600;
const SEEDANCE_VIDEO_PIXEL_COUNT_MAX = 8847360;

function readLittleEndian24(buffer, offset) {
  return buffer[offset] + (buffer[offset + 1] << 8) + (buffer[offset + 2] << 16);
}

function imageDimensionsFromBuffer(bytes) {
  const buffer = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes || []);
  if (buffer.length >= 24 && buffer[0] === 0x89 && buffer.toString("ascii", 1, 4) === "PNG") {
    return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20), type: "png" };
  }
  if (buffer.length >= 26 && buffer.toString("ascii", 0, 2) === "BM") {
    return { width: Math.abs(buffer.readInt32LE(18)), height: Math.abs(buffer.readInt32LE(22)), type: "bmp" };
  }
  if (buffer.length >= 30 && buffer.toString("ascii", 0, 4) === "RIFF" && buffer.toString("ascii", 8, 12) === "WEBP") {
    const chunk = buffer.toString("ascii", 12, 16);
    if (chunk === "VP8X" && buffer.length >= 30) {
      return { width: readLittleEndian24(buffer, 24) + 1, height: readLittleEndian24(buffer, 27) + 1, type: "webp" };
    }
    if (chunk === "VP8 " && buffer.length >= 30) {
      return { width: buffer.readUInt16LE(26) & 0x3fff, height: buffer.readUInt16LE(28) & 0x3fff, type: "webp" };
    }
    if (chunk === "VP8L" && buffer.length >= 25 && buffer[20] === 0x2f) {
      const bits = buffer.readUInt32LE(21);
      return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1, type: "webp" };
    }
  }
  if (buffer.length >= 4 && buffer[0] === 0xff && buffer[1] === 0xd8) {
    let offset = 2;
    while (offset + 9 < buffer.length) {
      while (offset < buffer.length && buffer[offset] !== 0xff) offset += 1;
      while (offset < buffer.length && buffer[offset] === 0xff) offset += 1;
      const marker = buffer[offset];
      offset += 1;
      if (!marker || marker === 0xd9 || marker === 0xda) break;
      if (marker >= 0xd0 && marker <= 0xd7) continue;
      if (offset + 2 > buffer.length) break;
      const length = buffer.readUInt16BE(offset);
      if (length < 2 || offset + length > buffer.length) break;
      if (
        (marker >= 0xc0 && marker <= 0xc3) ||
        (marker >= 0xc5 && marker <= 0xc7) ||
        (marker >= 0xc9 && marker <= 0xcb) ||
        (marker >= 0xcd && marker <= 0xcf)
      ) {
        if (length < 7) break;
        return { width: buffer.readUInt16BE(offset + 5), height: buffer.readUInt16BE(offset + 3), type: "jpeg" };
      }
      offset += length;
    }
  }
  return null;
}

function imageMimeFromBuffer(bytes) {
  const type = String(imageDimensionsFromBuffer(bytes || [])?.type || "").toLowerCase();
  if (type === "png") return "image/png";
  if (type === "jpeg") return "image/jpeg";
  if (type === "webp") return "image/webp";
  if (type === "bmp") return "image/bmp";
  return "";
}

function assertSeedanceImageAspectRatio(dimensions, label = "Seedance image") {
  if (!dimensions?.width || !dimensions?.height) {
    const error = new Error(`${label} dimensions could not be read.`);
    error.statusCode = 400;
    error.code = "SEEDANCE_IMAGE_DIMENSIONS_UNREADABLE";
    throw error;
  }
  if (
    dimensions.width < SEEDANCE_IMAGE_DIMENSION_MIN ||
    dimensions.width > SEEDANCE_IMAGE_DIMENSION_MAX ||
    dimensions.height < SEEDANCE_IMAGE_DIMENSION_MIN ||
    dimensions.height > SEEDANCE_IMAGE_DIMENSION_MAX
  ) {
    const error = new Error(
      `${label} width and height must each be between ${SEEDANCE_IMAGE_DIMENSION_MIN}px and ${SEEDANCE_IMAGE_DIMENSION_MAX}px. Current image is ${dimensions.width}x${dimensions.height}.`,
    );
    error.statusCode = 400;
    error.code = "SEEDANCE_IMAGE_DIMENSIONS_INVALID";
    error.details = {
      width: dimensions.width,
      height: dimensions.height,
      min: SEEDANCE_IMAGE_DIMENSION_MIN,
      max: SEEDANCE_IMAGE_DIMENSION_MAX,
    };
    throw error;
  }
  const ratio = dimensions.width / dimensions.height;
  if (ratio < SEEDANCE_IMAGE_ASPECT_RATIO_MIN || ratio > SEEDANCE_IMAGE_ASPECT_RATIO_MAX) {
    const error = new Error(
      `${label} aspect ratio must be between ${SEEDANCE_IMAGE_ASPECT_RATIO_MIN} and ${SEEDANCE_IMAGE_ASPECT_RATIO_MAX}. Current image is ${dimensions.width}x${dimensions.height} (${ratio.toFixed(2)}).`,
    );
    error.statusCode = 400;
    error.code = "SEEDANCE_IMAGE_ASPECT_RATIO_INVALID";
    error.details = {
      width: dimensions.width,
      height: dimensions.height,
      ratio,
      min: SEEDANCE_IMAGE_ASPECT_RATIO_MIN,
      max: SEEDANCE_IMAGE_ASPECT_RATIO_MAX,
    };
    throw error;
  }
  return dimensions;
}

function validateSeedanceImageBytes(bytes, label = "Seedance image") {
  return assertSeedanceImageAspectRatio(imageDimensionsFromBuffer(bytes), label);
}

function assertSeedanceVideoPixelCount(dimensions, label = "Seedance video") {
  const width = Number(dimensions?.width || 0);
  const height = Number(dimensions?.height || 0);
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    throw advancedValidationError(
      "SEEDANCE_VIDEO_DIMENSIONS_UNREADABLE",
      `${label} dimensions could not be read. Re-upload the video before using it with Seedance.`,
    );
  }
  const pixelCount = width * height;
  if (pixelCount < SEEDANCE_VIDEO_PIXEL_COUNT_MIN || pixelCount > SEEDANCE_VIDEO_PIXEL_COUNT_MAX) {
    throw advancedValidationError(
      "SEEDANCE_VIDEO_PIXEL_COUNT_INVALID",
      `${label} pixel count must be between ${SEEDANCE_VIDEO_PIXEL_COUNT_MIN} and ${SEEDANCE_VIDEO_PIXEL_COUNT_MAX}. Current video is ${width}x${height} (${pixelCount} pixels).`,
      {
        width,
        height,
        pixelCount,
        minPixelCount: SEEDANCE_VIDEO_PIXEL_COUNT_MIN,
        maxPixelCount: SEEDANCE_VIDEO_PIXEL_COUNT_MAX,
      },
    );
  }
  return { ...dimensions, width, height, pixelCount };
}

async function probeLocalVideoDimensions(videoPath = "") {
  if (!videoPath) return null;
  try {
    const result = await execFileJson("ffprobe", [
      "-v",
      "error",
      "-select_streams",
      "v:0",
      "-show_entries",
      "stream=width,height,duration",
      "-of",
      "json",
      videoPath,
    ], { timeout: VIDEO_DURATION_PROBE_TIMEOUT_MS });
    const stream = Array.isArray(result?.streams) ? result.streams[0] : null;
    if (!stream) return null;
    return {
      width: Number(stream.width || 0),
      height: Number(stream.height || 0),
      durationSeconds: durationSecondsFromValue(stream.duration),
    };
  } catch (error) {
    console.warn("[video-dimensions-probe-failed]", videoPath, error.message || error);
    return null;
  }
}

function evenVideoDimension(value, mode = "ceil") {
  const numeric = Math.max(2, Number(value) || 2);
  const rounded = mode === "floor" ? Math.floor(numeric) : Math.ceil(numeric);
  return rounded % 2 === 0 ? rounded : (mode === "floor" ? rounded - 1 : rounded + 1);
}

function seedanceVideoTargetDimensions(dimensions = {}) {
  const width = Number(dimensions.width || 0);
  const height = Number(dimensions.height || 0);
  const pixelCount = width * height;
  if (!width || !height || !Number.isFinite(pixelCount) || pixelCount <= 0) return null;
  if (pixelCount >= SEEDANCE_VIDEO_PIXEL_COUNT_MIN && pixelCount <= SEEDANCE_VIDEO_PIXEL_COUNT_MAX) {
    return { width, height };
  }
  const targetPixels = pixelCount < SEEDANCE_VIDEO_PIXEL_COUNT_MIN
    ? SEEDANCE_VIDEO_PIXEL_COUNT_MIN
    : SEEDANCE_VIDEO_PIXEL_COUNT_MAX;
  const scale = Math.sqrt(targetPixels / pixelCount);
  const mode = pixelCount < SEEDANCE_VIDEO_PIXEL_COUNT_MIN ? "ceil" : "floor";
  let targetWidth = evenVideoDimension(width * scale, mode);
  let targetHeight = evenVideoDimension(height * scale, mode);
  while (targetWidth * targetHeight < SEEDANCE_VIDEO_PIXEL_COUNT_MIN) {
    if (targetWidth <= targetHeight) targetWidth += 2;
    else targetHeight += 2;
  }
  while (targetWidth * targetHeight > SEEDANCE_VIDEO_PIXEL_COUNT_MAX) {
    if (targetWidth >= targetHeight && targetWidth > 2) targetWidth -= 2;
    else if (targetHeight > 2) targetHeight -= 2;
    else break;
  }
  return { width: targetWidth, height: targetHeight };
}

async function normalizeSeedanceVideoFileForRequest(sourcePath = "", targetPath = "", label = "Seedance video") {
  const sourceDimensions = await probeLocalVideoDimensions(sourcePath);
  const targetDimensions = seedanceVideoTargetDimensions(sourceDimensions);
  if (!targetDimensions) {
    throw advancedValidationError("SEEDANCE_VIDEO_DIMENSIONS_UNREADABLE", `${label} dimensions could not be read. Re-upload the video before using it with Seedance.`);
  }
  const sourcePixelCount = Number(sourceDimensions.width || 0) * Number(sourceDimensions.height || 0);
  const outputPath = targetPath || sourcePath;
  if (sourcePixelCount >= SEEDANCE_VIDEO_PIXEL_COUNT_MIN && sourcePixelCount <= SEEDANCE_VIDEO_PIXEL_COUNT_MAX) {
    if (outputPath && path.resolve(sourcePath) !== path.resolve(outputPath)) {
      await fs.mkdir(path.dirname(outputPath), { recursive: true });
      await fs.copyFile(sourcePath, outputPath);
    }
    return assertSeedanceVideoPixelCount(sourceDimensions, label);
  }
  const tempPath = `${outputPath}.${Date.now()}.seedance-normalized.mp4`;
  try {
    await fs.mkdir(path.dirname(outputPath), { recursive: true });
    await execFileQuiet("ffmpeg", [
      "-y",
      "-i",
      sourcePath,
      "-vf",
      `scale=${targetDimensions.width}:${targetDimensions.height}:flags=lanczos`,
      "-map",
      "0:v:0",
      "-map",
      "0:a?",
      "-c:v",
      "libx264",
      "-preset",
      "veryfast",
      "-crf",
      "20",
      "-pix_fmt",
      "yuv420p",
      "-c:a",
      "aac",
      "-b:a",
      "128k",
      "-movflags",
      "+faststart",
      tempPath,
    ], { timeout: 180000 });
    const normalizedDimensions = assertSeedanceVideoPixelCount(await probeLocalVideoDimensions(tempPath), label);
    await fs.rename(tempPath, outputPath);
    return normalizedDimensions;
  } catch (error) {
    await fs.rm(tempPath, { force: true }).catch(() => {});
    if (error?.code === "SEEDANCE_VIDEO_PIXEL_COUNT_INVALID" || error?.code === "SEEDANCE_VIDEO_DIMENSIONS_UNREADABLE") throw error;
    const wrapped = advancedValidationError(
      "SEEDANCE_VIDEO_NORMALIZE_FAILED",
      `${label} could not be normalized for Seedance. Re-upload a video between ${SEEDANCE_VIDEO_PIXEL_COUNT_MIN} and ${SEEDANCE_VIDEO_PIXEL_COUNT_MAX} pixels.`,
      {
        width: sourceDimensions.width,
        height: sourceDimensions.height,
        pixelCount: sourcePixelCount,
      },
    );
    wrapped.cause = error;
    throw wrapped;
  }
}

function localPathForUserAsset(asset = {}) {
  const localUrl = String(asset.localUrl || "").trim();
  if (!localUrl) return "";
  const localPath = path.resolve(ROOT, localUrl.replace(/^\/+/, ""));
  const rootPath = path.resolve(ROOT);
  const relative = path.relative(rootPath, localPath);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw advancedValidationError("INVALID_ASSET_PATH", "Asset path is invalid.", { assetId: asset.id || "" });
  }
  return localPath;
}

function userAssetObjectStorageKey(asset = {}) {
  return String(firstPresent(
    asset.objectStorageKey,
    asset.r2Key,
  ) || "").trim();
}

function userAssetHasObjectStorageMirror(asset = {}) {
  return Boolean(userAssetObjectStorageKey(asset));
}

function configuredObjectStoragePublicDomain() {
  return r2Enabled() ? String(R2.publicDomain || "").trim() : "";
}

function userAssetHasConfiguredObjectStorageMirror(asset = {}) {
  const publicDomain = configuredObjectStoragePublicDomain();
  return userAssetHasObjectStorageMirror(asset)
    && Boolean(publicDomain)
    && [asset.publicUrl, asset.cdnUrl].some((value) => publicUrlMatchesStorageBase(value, publicDomain));
}

function restorablePublicUrlForUserAsset(asset = {}) {
  const candidates = [
    asset.cdnUrl,
    asset.publicUrl,
    asset.wan30PublicUrl,
    asset.objectStorageUrl,
    asset.r2Url,
    asset.syntheticReferencePublicUrl,
    asset.sourcePublicUrl,
    asset.sourceUrl,
    asset.originalUrl,
  ];
  return candidates.map((value) => String(value || "").trim()).find(isPublicHttpUrl) || "";
}

function restoreLimitBytesForUserAsset(asset = {}, fallbackBytes = 0) {
  const mime = String(asset.mime || "").toLowerCase();
  const storedSize = Number(firstPresent(asset.sizeBytes, asset.meta?.byteLength, asset.meta?.sizeBytes));
  const defaultLimit = fallbackBytes
    || (mime.startsWith("image/")
      ? IMAGE_UPLOAD_MAX_BYTES
      : mime.startsWith("video/")
        ? VIDEO_TOOL_SOURCE_UPLOAD_MAX_BYTES
        : MEDIA_UPLOAD_MAX_BYTES);
  const requestedLimit = Number.isFinite(storedSize) && storedSize > 0
    ? Math.max(defaultLimit, storedSize + 1024 * 1024)
    : defaultLimit;
  return Math.min(Math.max(requestedLimit, defaultLimit), 500 * 1024 * 1024);
}

function missingUserAssetFileError(asset = {}, label = "Asset") {
  return advancedValidationError(
    "ASSET_FILE_MISSING",
    `${label} source file is unavailable. Re-upload the asset before generating again.`,
    { assetId: asset.id || "" },
  );
}

async function persistRestoredUserAssetMetadata(db, userAsset, bytes, mime = "") {
  if (!userAsset || !bytes) return userAsset;
  const restoredAt = new Date().toISOString();
  if (mime && !userAsset.mime) userAsset.mime = mime;
  userAsset.sizeBytes = Number(bytes.byteLength || userAsset.sizeBytes || 0);
  userAsset.meta = {
    ...plainObject(userAsset.meta),
    localRestoredAt: restoredAt,
  };
  userAsset.updatedAt = restoredAt;
  if (db?.userAssets) db.userAssets = db.userAssets.map((asset) => (asset.id === userAsset.id ? userAsset : asset));
  if (dbEnabled()) await upsertUserAssetInDb(userAsset);
  else if (db) await writeDb(db);
  return userAsset;
}

async function ensureLocalUserAssetFile(db, userAsset, {
  label = "Asset",
  maxBytes = 0,
  requireFile = true,
} = {}) {
  const localPath = localPathForUserAsset(userAsset);
  if (!localPath) {
    if (!requireFile) return "";
    throw missingUserAssetFileError(userAsset, label);
  }
  const stat = await fs.stat(localPath).catch(() => null);
  if (stat?.isFile() && stat.size > 0) return localPath;

  const remoteUrl = restorablePublicUrlForUserAsset(userAsset);
  if (!remoteUrl) {
    if (!requireFile) return "";
    throw missingUserAssetFileError(userAsset, label);
  }

  const downloaded = await downloadRemoteFileToBuffer(remoteUrl, {
    label,
    maxBytes: restoreLimitBytesForUserAsset(userAsset, maxBytes),
    timeoutMs: 2 * 60 * 1000,
    retryCount: 2,
  });
  await fs.mkdir(path.dirname(localPath), { recursive: true });
  const temporaryPath = `${localPath}.${process.pid}.${Date.now()}.restore.tmp`;
  try {
    await fs.writeFile(temporaryPath, downloaded.bytes);
    await fs.rename(temporaryPath, localPath);
  } catch (error) {
    await fs.rm(temporaryPath, { force: true }).catch(() => {});
    const current = await fs.stat(localPath).catch(() => null);
    if (!current?.isFile() || current.size <= 0) throw error;
  }
  await persistRestoredUserAssetMetadata(db, userAsset, downloaded.bytes, downloaded.mime);
  return localPath;
}

async function readLocalUserAssetBytes(db, userAsset, options = {}) {
  const localPath = await ensureLocalUserAssetFile(db, userAsset, options);
  return {
    localPath,
    bytes: await fs.readFile(localPath),
  };
}

async function findRestorableUserAssetByLocalUrl(localUrl = "") {
  const target = String(localUrl || "").trim().split("?")[0];
  if (!target.startsWith("/assets/user-uploads/")) return { db: null, asset: null };
  const db = await readDb();
  const asset = (db.userAssets || []).find((entry) => (
    String(entry?.localUrl || "").trim().split("?")[0] === target
    && !isSoftDeleted(entry)
  )) || null;
  return { db, asset };
}

async function ensureLocalAssetUrlFile(localUrl = "", {
  label = "Asset",
  maxBytes = 0,
} = {}) {
  const value = String(localUrl || "").trim().split("?")[0];
  if (!value || !value.startsWith("/assets/")) return "";
  const localPath = path.resolve(ROOT, value.replace(/^\/+/, ""));
  const rootPath = path.resolve(ROOT);
  const relative = path.relative(rootPath, localPath);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    const error = new Error("Asset path is invalid.");
    error.statusCode = 400;
    throw error;
  }
  const stat = await fs.stat(localPath).catch(() => null);
  if (stat?.isFile() && stat.size > 0) return localPath;
  const { db, asset } = await findRestorableUserAssetByLocalUrl(value);
  if (!asset) return "";
  return ensureLocalUserAssetFile(db, asset, { label, maxBytes, requireFile: false });
}

function normalizedImageTempPath(sourcePath = "") {
  const parsed = path.parse(sourcePath);
  const extension = [".jpg", ".jpeg", ".png", ".webp", ".bmp"].includes(parsed.ext.toLowerCase()) ? parsed.ext : ".png";
  return path.join(parsed.dir, `${parsed.name}.${Date.now()}.normalized${extension}`);
}

async function normalizeLocalImageMinimumDimensions(sourcePath = "", {
  label = "Reference image",
  minDimension = SEEDANCE_IMAGE_DIMENSION_MIN,
  maxDimension = SEEDANCE_IMAGE_DIMENSION_MAX,
  flattenTransparency = true,
} = {}) {
  const initialBytes = await fs.readFile(sourcePath);
  const initialDimensions = imageDimensionsFromBuffer(initialBytes);
  if (!initialDimensions?.width || !initialDimensions?.height) {
    throw advancedValidationError("IMAGE_DIMENSIONS_UNREADABLE", `${label} dimensions could not be read.`);
  }

  let target;
  try {
    target = minimumImageTargetDimensions(initialDimensions.width, initialDimensions.height, { minDimension, maxDimension });
  } catch (error) {
    throw advancedValidationError(
      "IMAGE_DIMENSIONS_UNSUPPORTED",
      `${label} cannot be normalized within ${minDimension}-${maxDimension}px. Current image is ${initialDimensions.width}x${initialDimensions.height}.`,
      { width: initialDimensions.width, height: initialDimensions.height, minDimension, maxDimension },
    );
  }
  const transparencyFlattened = Boolean(
    flattenTransparency
    && initialDimensions.type === "png"
    && pngBufferHasTransparency(initialBytes),
  );
  if (!target.changed && !transparencyFlattened) {
    return { bytes: initialBytes, dimensions: initialDimensions, changed: false, transparencyFlattened: false };
  }

  const tempPath = normalizedImageTempPath(sourcePath);
  try {
    const ffmpegArgs = transparencyFlattened
      ? [
          "-y",
          "-f",
          "lavfi",
          "-i",
          `color=c=white:s=${initialDimensions.width}x${initialDimensions.height}`,
          "-i",
          sourcePath,
          "-filter_complex",
          `[0:v][1:v]overlay=shortest=1:format=auto,scale=${target.width}:${target.height}:flags=lanczos,format=rgb24`,
          "-frames:v",
          "1",
          tempPath,
        ]
      : [
          "-y",
          "-i",
          sourcePath,
          "-vf",
          `scale=${target.width}:${target.height}:flags=lanczos`,
          "-frames:v",
          "1",
          tempPath,
        ];
    await execFileQuiet("ffmpeg", ffmpegArgs, { timeout: 120000 });
    const bytes = await fs.readFile(tempPath);
    const dimensions = imageDimensionsFromBuffer(bytes);
    if (!dimensions?.width || !dimensions?.height || dimensions.width < minDimension || dimensions.height < minDimension) {
      throw advancedValidationError("IMAGE_NORMALIZE_FAILED", `${label} could not be normalized to the upstream minimum dimensions.`);
    }
    if (transparencyFlattened && pngBufferHasTransparency(bytes)) {
      throw advancedValidationError("IMAGE_TRANSPARENCY_NORMALIZE_FAILED", `${label} transparency could not be removed for upstream generation.`);
    }
    await fs.rename(tempPath, sourcePath);
    return { bytes, dimensions, changed: true, transparencyFlattened };
  } catch (error) {
    await fs.rm(tempPath, { force: true }).catch(() => {});
    if (["IMAGE_NORMALIZE_FAILED", "IMAGE_TRANSPARENCY_NORMALIZE_FAILED"].includes(error?.code)) throw error;
    const wrapped = advancedValidationError("IMAGE_NORMALIZE_FAILED", `${label} could not be normalized for upstream generation.`);
    wrapped.cause = error;
    throw wrapped;
  }
}

async function normalizeUserImageAssetForUpstream(db, userAsset, {
  label = "Reference image",
  minDimension = SEEDANCE_IMAGE_DIMENSION_MIN,
  maxDimension = SEEDANCE_IMAGE_DIMENSION_MAX,
  flattenTransparency = true,
} = {}) {
  if (!userAsset || !String(userAsset.mime || "").toLowerCase().startsWith("image/")) return userAsset;
  const localPath = await ensureLocalUserAssetFile(db, userAsset, { label, maxBytes: IMAGE_UPLOAD_MAX_BYTES, requireFile: false });
  if (!localPath) return userAsset;

  const storedDimensions = storedImageDimensionsForAsset(userAsset);
  const normalized = await normalizeLocalImageMinimumDimensions(localPath, {
    label,
    minDimension,
    maxDimension,
    flattenTransparency,
  });
  const dimensionsChanged = normalized.changed
    || Number(storedDimensions?.width || 0) !== Number(normalized.dimensions.width || 0)
    || Number(storedDimensions?.height || 0) !== Number(normalized.dimensions.height || 0);
  const needsObjectUpload = objectStorageEnabled() && (dimensionsChanged || !userAssetHasConfiguredObjectStorageMirror(userAsset));
  let uploaded = null;
  if (needsObjectUpload) {
    uploaded = await uploadBufferToR2({
      userId: userAsset.userId,
      assetId: `${userAsset.id}-normalized`,
      bytes: normalized.bytes,
      mime: userAsset.mime || imageMimeFromPath(localPath),
      extension: path.extname(localPath),
    });
  }

  const metadataChanged = dimensionsChanged || Boolean(uploaded);
  if (!metadataChanged) return userAsset;
  userAsset.width = normalized.dimensions.width;
  userAsset.height = normalized.dimensions.height;
  userAsset.imageType = normalized.dimensions.type || userAsset.imageType || "";
  userAsset.sizeBytes = normalized.bytes.byteLength;
  if (dimensionsChanged) {
    userAsset.assetId = "";
    userAsset.assetUri = "";
  }
  if (uploaded) {
    userAsset.publicUrl = uploaded.publicUrl;
    userAsset.cdnUrl = uploaded.publicUrl;
    userAsset.objectStorageKey = uploaded.key || "";
    userAsset.r2Key = uploaded.key || "";
    userAsset.objectStorageError = "";
    userAsset.publicUploadedAt = new Date().toISOString();
  } else if (!objectStorageEnabled()) {
    const localPublicUrl = publicUrlForAssetPath(userAsset.localUrl);
    userAsset.publicUrl = normalized.changed && localPublicUrl
      ? `${localPublicUrl}${localPublicUrl.includes("?") ? "&" : "?"}asset_version=${Date.now()}`
      : localPublicUrl || userAsset.publicUrl || "";
  }
  if (normalized.changed) {
    userAsset.meta = {
      ...plainObject(userAsset.meta),
      normalizedForUpstream: true,
      normalizedWidth: normalized.dimensions.width,
      normalizedHeight: normalized.dimensions.height,
      ...(normalized.transparencyFlattened ? { flattenedTransparency: true } : {}),
    };
  }
  userAsset.updatedAt = new Date().toISOString();
  db.userAssets = (db.userAssets || []).map((asset) => (asset.id === userAsset.id ? userAsset : asset));
  if (dbEnabled()) await upsertUserAssetInDb(userAsset);
  else await writeDb(db);
  return userAsset;
}

function storedImageDimensionsForAsset(asset = {}) {
  const width = Number(firstPresent(asset.width, asset.imageWidth, asset.meta?.width, asset.meta?.imageWidth));
  const height = Number(firstPresent(asset.height, asset.imageHeight, asset.meta?.height, asset.meta?.imageHeight));
  if (Number.isFinite(width) && width > 0 && Number.isFinite(height) && height > 0) {
    return { width, height, type: asset.imageType || asset.meta?.imageType || "" };
  }
  return null;
}

async function validateSeedanceImageAssetForRequest(db, asset = {}, label = "Seedance image") {
  if (!asset) return null;
  validateWan27MediaKind(asset, "image", label);
  asset = await normalizeUserImageAssetForUpstream(db, asset, { label });
  const storedDimensions = storedImageDimensionsForAsset(asset);
  if (storedDimensions) return assertSeedanceImageAspectRatio(storedDimensions, label);

  let bytes = null;
  const localPath = await ensureLocalUserAssetFile(db, asset, { label, maxBytes: IMAGE_UPLOAD_MAX_BYTES, requireFile: false });
  if (localPath) {
    bytes = await fs.readFile(localPath);
  } else if (isPublicHttpUrl(asset.publicUrl)) {
    const downloaded = await downloadRemoteFileToBuffer(asset.publicUrl, {
      label,
      maxBytes: IMAGE_UPLOAD_MAX_BYTES,
      timeoutMs: 120000,
    });
    bytes = downloaded.bytes;
  }
  if (!bytes) {
    throw advancedValidationError("SEEDANCE_IMAGE_DIMENSIONS_UNREADABLE", `${label} dimensions could not be read. Re-upload the image before using it with Seedance.`, { assetId: asset.id || "" });
  }
  const dimensions = validateSeedanceImageBytes(bytes, label);
  asset.width = dimensions.width;
  asset.height = dimensions.height;
  asset.imageType = dimensions.type || asset.imageType || "";
  asset.updatedAt = new Date().toISOString();
  db.userAssets = (db.userAssets || []).map((entry) => (entry.id === asset.id ? asset : entry));
  if (dbEnabled()) await upsertUserAssetInDb(asset);
  else await writeDb(db);
  return dimensions;
}

