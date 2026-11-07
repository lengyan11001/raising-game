async function handleUpdateApiSubtoken(req, res, tokenId) {
  const auth = await requirePrimaryTokenOwner(req, res);
  if (!auth) return;
  const current = await getApiSubtokenFromDbById(tokenId, auth.user.id);
  if (!current) return sendJson(res, 404, { ok: false, message: "Sub token not found." });
  const body = await readJson(req);
  const next = {};
  if (typeof body.name === "string") next.name = body.name.trim().slice(0, 80);
  if (Object.prototype.hasOwnProperty.call(body, "quotaLimit") || Object.prototype.hasOwnProperty.call(body, "quota_limit")) {
    const raw = Number(body.quotaLimit ?? body.quota_limit);
    if (!Number.isFinite(raw) || raw <= 0) {
      return sendJson(res, 400, { ok: false, message: "Quota must be greater than 0." });
    }
    next.quotaLimit = current.quotaType === "count" ? Math.max(1, Math.round(raw)) : roundCredits(raw, 6);
  }
  const hasRemaining =
    Object.prototype.hasOwnProperty.call(body, "remaining") ||
    Object.prototype.hasOwnProperty.call(body, "remainingAmount") ||
    Object.prototype.hasOwnProperty.call(body, "remaining_amount") ||
    Object.prototype.hasOwnProperty.call(body, "remainingCount") ||
    Object.prototype.hasOwnProperty.call(body, "remaining_count");
  if (hasRemaining) {
    const rawRemaining = current.quotaType === "count"
      ? Number(body.remainingCount ?? body.remaining_count ?? body.remaining)
      : Number(body.remainingAmount ?? body.remaining_amount ?? body.remaining);
    if (!Number.isFinite(rawRemaining) || rawRemaining < 0) {
      return sendJson(res, 400, { ok: false, message: "Remaining quota must be 0 or greater." });
    }
    const used = current.quotaType === "count"
      ? Math.max(0, Math.round(Number(current.usedCount || 0) || 0))
      : roundCredits(current.usedAmount || 0, 6);
    const remaining = current.quotaType === "count"
      ? Math.max(0, Math.round(rawRemaining))
      : roundCredits(rawRemaining, 6);
    next.quotaLimit = current.quotaType === "count"
      ? used + remaining
      : roundCredits(used + remaining, 6);
  }
  if (Object.prototype.hasOwnProperty.call(body, "expiresAt") || Object.prototype.hasOwnProperty.call(body, "expires_at")) {
    const expiresAtRaw = String(body.expiresAt ?? body.expires_at ?? "").trim();
    if (!expiresAtRaw) {
      next.expiresAt = "";
    } else {
      const parsed = Date.parse(expiresAtRaw);
      if (!Number.isFinite(parsed)) return sendJson(res, 400, { ok: false, message: "Invalid expiration time." });
      next.expiresAt = new Date(parsed).toISOString();
    }
  }
  const updated = await updateApiSubtokenInDb(tokenId, auth.user.id, next);
  return sendJson(res, 200, { ok: true, subtoken: apiSubtokenView(updated) });
}

async function handleRevokeApiSubtoken(req, res, tokenId) {
  const auth = await requirePrimaryTokenOwner(req, res);
  if (!auth) return;
  const current = await getApiSubtokenFromDbById(tokenId, auth.user.id);
  if (!current) return sendJson(res, 404, { ok: false, message: "Sub token not found." });
  const revoked = await revokeApiSubtokenInDb(tokenId, auth.user.id, currentIso());
  return sendJson(res, 200, { ok: true, subtoken: apiSubtokenView(revoked) });
}

async function toolTopupPackageForRequest(req, input = {}) {
  const tenant = requestTenantDescriptor(req);
  if (!tenant.subscriptions) return null;
  const plan = await getBillingPlanInDb(tenant.tenantId);
  const packages = toolTopupPackagesForPlan(plan);
  const packageId = String(input.packageId || input.package_id || "").trim();
  const amount = normalizeTopupAmount(input.amount);
  return packages.find((item) => item.id === packageId)
    || packages.find((item) => normalizeTopupAmount(item.amount) === amount)
    || null;
}

function addBillingInterval(value, unit = "month", count = 1) {
  const date = new Date(value || Date.now());
  const amount = Math.max(1, Math.trunc(Number(count || 1) || 1));
  if (unit === "year") date.setUTCFullYear(date.getUTCFullYear() + amount);
  else if (unit === "day") date.setUTCDate(date.getUTCDate() + amount);
  else date.setUTCMonth(date.getUTCMonth() + amount);
  return date.toISOString();
}

async function activatePaidSubscription(db, order, plan) {
  const tenantId = normalizeTenantId(order.tenantId || DEFAULT_TENANT_ID);
  if (tenantId === DEFAULT_TENANT_ID && plan.id === CREATOR_MEMBERSHIP_PLAN_ID) {
    const user = (db.users || []).find((entry) => entry.id === order.userId);
    await activateCreatorMembership(db, user, {
      source: order.paymentProvider || "payment",
      orderId: order.id,
    });
    await grantPendingReferralRewardsForMember(db, user);
    const subscription = await getUserSubscriptionInDb(order.userId, tenantId);
    order.subscriptionId = subscription?.id || "";
    order.subscriptionPeriodEnd = "";
    return subscription;
  }
  const existing = await getUserSubscriptionInDb(order.userId, tenantId);
  if (existing?.lastOrderId === order.id) return existing;
  const now = new Date().toISOString();
  const existingEnd = Date.parse(existing?.currentPeriodEnd || "");
  const activeExisting = Number.isFinite(existingEnd) && existingEnd > Date.now();
  const periodBase = activeExisting ? existing.currentPeriodEnd : now;
  const subscription = await upsertUserSubscriptionInDb({
    ...existing,
    id: existing?.id || randomId("sub"),
    tenantId,
    userId: order.userId,
    planId: plan.id,
    planName: plan.name,
    status: "active",
    currentPeriodStart: activeExisting ? existing.currentPeriodStart : now,
    currentPeriodEnd: addBillingInterval(periodBase, plan.intervalUnit, plan.intervalCount),
    cancelAtPeriodEnd: false,
    provider: order.paymentProvider || "manual",
    lastOrderId: order.id,
    renewalCount: Math.max(0, Number(existing?.renewalCount || 0)) + 1,
    includedCredits: creditsAmount(plan.includedCredits || 0),
    updatedAt: now,
    createdAt: existing?.createdAt || now,
  });
  order.subscriptionId = subscription?.id || existing?.id || "";
  order.subscriptionPeriodEnd = subscription?.currentPeriodEnd || "";
  return subscription;
}

async function handleBillingSummary(req, res) {
  const auth = await requireUser(req, res);
  if (!auth) return;
  const billing = await billingViewForRequest(req, auth);
  if (!billing.enabled) return sendJson(res, 404, { ok: false, code: "SUBSCRIPTIONS_DISABLED", message: "Subscriptions are not enabled for this site." });
  return sendJson(res, 200, { ok: true, billing, user: userView(auth.user) });
}

function airwallexEnabled() {
  return Boolean(AIRWALLEX_CLIENT_ID && AIRWALLEX_API_KEY && AIRWALLEX_WEBHOOK_SECRET);
}

function airwallexCheckoutUrl(orderId = "") {
  const url = new URL("/", `${AIRWALLEX_CHECKOUT_BASE_URL}/`);
  url.searchParams.set("aw_sid", String(orderId || ""));
  return url.toString();
}

async function airwallexLogin() {
  if (!airwallexEnabled()) {
    const error = new Error("Airwallex is not configured.");
    error.statusCode = 503;
    error.code = "AIRWALLEX_NOT_CONFIGURED";
    throw error;
  }
  if (airwallexTokenCache.token && airwallexTokenCache.expiresAt > Date.now() + 60000) return airwallexTokenCache.token;
  const response = await fetch(`${AIRWALLEX_API_BASE}/api/v1/authentication/login`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-client-id": AIRWALLEX_CLIENT_ID,
      "x-api-key": AIRWALLEX_API_KEY,
    },
    body: "{}",
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload.token) {
    const error = new Error("Airwallex login failed.");
    error.statusCode = 502;
    error.code = "AIRWALLEX_LOGIN_FAILED";
    throw error;
  }
  const expires = Date.parse(payload.expires_at || "") || (Date.now() + 20 * 60 * 1000);
  airwallexTokenCache = { token: payload.token, expiresAt: expires };
  return payload.token;
}

async function airwallexRequest(pathname, body) {
  const token = await airwallexLogin();
  const response = await fetch(`${AIRWALLEX_API_BASE}${pathname}`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(body || {}),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(payload.message || "Airwallex request failed.");
    error.statusCode = response.status || 502;
    error.code = payload.code || "AIRWALLEX_REQUEST_FAILED";
    throw error;
  }
  return payload;
}

function airwallexCashierReturnUrl(order, billing) {
  const url = new URL(`${AIRWALLEX_CHECKOUT_BASE_URL}/`);
  url.searchParams.set("aw_sid", String(order?.id || ""));
  url.searchParams.set("billing", billing === "cancel" ? "cancel" : "success");
  return url.toString();
}

async function ensureAirwallexPaymentIntent(order) {
  if (order.airwallexPaymentIntentId && order.airwallexClientSecret) {
    return { id: order.airwallexPaymentIntentId, client_secret: order.airwallexClientSecret };
  }
  const amount = Number(order.payableAmount || order.baseAmount || 0);
  const intent = await airwallexRequest("/api/v1/pa/payment_intents/create", {
    request_id: randomId("awreq"),
    amount: Number(amount.toFixed(2)),
    currency: "USD",
    merchant_order_id: order.id,
    return_url: airwallexCashierReturnUrl(order, "success"),
    metadata: {
      order_id: order.id,
      user_id: order.userId || "",
      tenant_id: order.tenantId || "",
      tool: "live",
    },
  });
  order.airwallexPaymentIntentId = String(intent.id || "");
  order.airwallexClientSecret = String(intent.client_secret || "");
  order.airwallexStatus = String(intent.status || "");
  order.updatedAt = new Date().toISOString();
  await updateWalletOrderInDb(order);
  return intent;
}

async function createAirwallexCheckoutSession(req, res) {
  const auth = await requireUser(req, res);
  if (!auth) return;
  if (requestTenantDescriptor(req).toolId !== "live") {
    return sendJson(res, 404, { ok: false, code: "AIRWALLEX_LIVE_ONLY", message: "Airwallex checkout is only available on the live site." });
  }
  if (!airwallexEnabled()) return sendJson(res, 503, { ok: false, code: "AIRWALLEX_NOT_CONFIGURED", message: "Airwallex is not configured yet." });
  const body = await readJson(req);
  const config = await readAppConfig();
  const tenantOptions = requestTenantOptions(req);
  const selection = await paypalCheckoutSelectionForRequest(req, body, auth.user);
  if (!selection) {
    const requestedPlan = Boolean(body.billingPlanId || body.billing_plan_id || body.planId || body.plan_id);
    return sendJson(res, 400, { ok: false, code: requestedPlan ? "BILLING_PLAN_NOT_FOUND" : "INVALID_TOPUP_PACKAGE", message: requestedPlan ? "Subscription plan not found." : "Please select one of the available top-up packages." });
  }
  if (selection.alreadyOwned) {
    return sendJson(res, 409, { ok: false, code: selection.kind === "subscription" ? "MEMBERSHIP_ALREADY_ACTIVE" : "PRODUCT_ALREADY_OWNED", message: selection.kind === "subscription" ? "Membership is already active." : "This product is already active." });
  }
  const amount = Number(selection.amount || 0);
  const amountCents = Math.round(amount * 100);
  if (!Number.isFinite(amount) || amountCents < 100 || amountCents > 100000000) {
    return sendJson(res, 400, { ok: false, code: "INVALID_AIRWALLEX_AMOUNT", message: "Card amount must be between 1 and 1,000,000 USD." });
  }
  const order = {
    id: randomId("aw"),
    tenantId: tenantOptions.tenant?.tenantId || DEFAULT_TENANT_ID,
    userId: auth.user.id,
    paymentProvider: "airwallex",
    orderKind: selection.kind,
    baseAmount: amount,
    creditAmount: creditsAmount(selection.credits),
    packageId: selection.kind === "topup" ? selection.id : "",
    packageCredits: selection.credits,
    productId: selection.product?.id || "",
    productName: selection.product?.name || "",
    billingPlanId: selection.plan?.id || "",
    billingPlanName: selection.plan?.name || "",
    billingIntervalUnit: selection.plan?.intervalUnit || "",
    billingIntervalCount: selection.plan?.intervalCount || 0,
    creditsPerUsd: walletCreditsPerUsd(config.wallet),
    currency: "USD",
    payableAmount: amount,
    payableAmountText: amount.toFixed(2),
    asset: "USD",
    network: "Airwallex",
    chain: "airwallex",
    status: "pending",
    sourceOrigin: pageOriginFromRequest(req),
    cashierHost: airwallexCheckoutHostname(),
    airwallexAccountId: AIRWALLEX_ACCOUNT_ID,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  await createWalletOrderInDb(order);
  return sendJson(res, 200, {
    ok: true,
    checkoutUrl: airwallexCheckoutUrl(order.id),
    order: publicTopupOrder(order, config.wallet, tenantOptions),
  });
}

async function findAirwallexCheckoutOrder(orderId = "") {
  const order = await getWalletOrderByIdInDb(orderId);
  if (!order || String(order.paymentProvider || "").toLowerCase() !== "airwallex") return null;
  return order;
}

async function handleAirwallexCheckoutSessionDetails(req, res, orderId) {
  const order = await findAirwallexCheckoutOrder(orderId);
  if (!order) return sendJson(res, 404, { ok: false, code: "AIRWALLEX_CHECKOUT_NOT_FOUND", message: "Airwallex checkout session not found." });
  return sendJson(res, 200, {
    ok: true,
    session: {
      status: order.status || "pending",
      returnUrl: String(order.sourceOrigin || LIVE_BILLING_RETURN_ORIGIN).replace(/\/+$/, "") + "/",
      order: publicTopupOrder(order, (await readAppConfig()).wallet || {}, requestTenantOptions(req)),
    },
  });
}

async function handleStartAirwallexCheckoutSession(req, res, orderId) {
  const order = await findAirwallexCheckoutOrder(orderId);
  if (!order) return sendJson(res, 404, { ok: false, code: "AIRWALLEX_CHECKOUT_NOT_FOUND", message: "Airwallex checkout session not found." });
  if (order.status === "paid") {
    return sendJson(res, 200, { ok: true, session: { status: "paid", order: publicTopupOrder(order, (await readAppConfig()).wallet || {}, requestTenantOptions(req)) } });
  }
  try {
    const intent = await ensureAirwallexPaymentIntent(order);
    return sendJson(res, 200, {
      ok: true,
      env: AIRWALLEX_ENV,
      intentId: intent.id,
      clientSecret: intent.client_secret,
      currency: "USD",
      countryCode: "HK",
      successUrl: airwallexCashierReturnUrl(order, "success"),
      cancelUrl: airwallexCashierReturnUrl(order, "cancel"),
    });
  } catch (error) {
    return sendJson(res, error.statusCode || 502, { ok: false, code: error.code || "AIRWALLEX_CHECKOUT_FAILED", message: "Airwallex checkout could not be created." });
  }
}

const mulerouterWebhookDeliveries = new Set();

function verifyMulerouterWebhookSignature(rawBody, deliveryId, timestamp, signatureHeader) {
  const secret = String(process.env.MULEROUTER_WEBHOOK_SECRET || "").trim();
  if (!secret || !rawBody || !deliveryId || !timestamp || !signatureHeader) return false;
  const sentAt = Number(timestamp);
  if (!Number.isFinite(sentAt) || Math.abs(Date.now() / 1000 - sentAt) > 5 * 60) return false;
  const header = String(signatureHeader);
  if (!header.startsWith("v1=")) return false;
  const received = header.slice(3);
  const expected = crypto.createHmac("sha256", secret).update(`${deliveryId}.${timestamp}.${rawBody}`, "utf8").digest("hex");
  const left = Buffer.from(expected);
  const right = Buffer.from(received);
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

async function findMulerouterGenerationRecord(taskId, slug = "") {
  const id = String(taskId || "").trim();
  if (!id) return null;
  const encoded = slug ? mulerouterAliyun.encodeRef(slug, id) : "";
  if (encoded) {
    const exact = await getGenerationRecord(encoded);
    if (exact) return exact;
  }
  const direct = await getGenerationRecord(id);
  if (direct) return direct;
  if (!dbEnabled()) {
    const records = await readGenerationRecords();
    return records.find((record) => {
      const upstream = String(record.upstreamTaskId || record.taskId || "");
      return upstream === id || upstream.endsWith(":" + id) || (encoded && upstream === encoded);
    }) || null;
  }
  const { rows } = await dbQuery(
    `SELECT payload FROM app_generation_records
      WHERE task_id = $1
         OR task_id = $2
         OR payload->>'upstreamTaskId' = $1
         OR payload->>'upstreamTaskId' = $2
         OR task_id LIKE $3
         OR payload->>'upstreamTaskId' LIKE $3
      ORDER BY updated_at DESC
      LIMIT 1`,
    [encoded || id, id, "%:" + id],
  );
  return rows[0] ? rows[0].payload : null;
}

async function handleMulerouterWebhook(req, res) {
  if (!mulerouterWebhookConfigured()) {
    return sendJson(res, 503, { ok: false, code: "MULEROUTER_WEBHOOK_NOT_CONFIGURED" });
  }
  const rawBody = await readRawBody(req, 128 * 1024);
  const deliveryId = String(req.headers["x-mulerouter-webhook-id"] || "");
  const timestamp = String(req.headers["x-mulerouter-webhook-timestamp"] || "");
  const signature = String(req.headers["x-mulerouter-webhook-signature"] || "");
  if (!verifyMulerouterWebhookSignature(rawBody, deliveryId, timestamp, signature)) {
    return sendJson(res, 401, { ok: false, code: "MULEROUTER_WEBHOOK_SIGNATURE_INVALID" });
  }
  if (mulerouterWebhookDeliveries.has(deliveryId)) return sendJson(res, 200, { ok: true, duplicate: true });
  mulerouterWebhookDeliveries.add(deliveryId);
  if (mulerouterWebhookDeliveries.size > 5000) {
    const first = mulerouterWebhookDeliveries.values().next().value;
    mulerouterWebhookDeliveries.delete(first);
  }
  let event = {};
  try { event = JSON.parse(rawBody); } catch { return sendJson(res, 400, { ok: false, message: "Invalid MuleRouter webhook body." }); }
  const type = String(event.type || "");
  if (type === "balance.low") {
    console.warn("[mulerouter-webhook-balance-low]", String(event.id || ""));
    return sendJson(res, 200, { ok: true, accepted: type });
  }
  if (type !== "task.succeeded" && type !== "task.failed") {
    return sendJson(res, 200, { ok: true, ignored: type || "unknown" });
  }
  const data = event.data && typeof event.data === "object" ? event.data : {};
  const payload = data.payload && typeof data.payload === "object" ? data.payload : {};
  const taskId = String((payload.task_info && payload.task_info.id) || (payload.taskInfo && payload.taskInfo.id) || "").trim();
  const slug = String(data.model_name || data.modelName || "").trim();
  if (!taskId || String(event.id || "").startsWith("evt_test_")) {
    return sendJson(res, 200, { ok: true, test: true });
  }
  const record = await findMulerouterGenerationRecord(taskId, slug);
  if (!record) return sendJson(res, 503, { ok: false, code: "MULEROUTER_TASK_NOT_READY", message: "Local task record is not ready yet." });
  const terminal = isSucceededStatus(record.status) || isFailedStatus(record.status);
  if (terminal && (record.localVideoUrl || record.cdnVideoUrl || record.localImageUrl || record.cdnImageUrl || isFailedStatus(record.status))) {
    return sendJson(res, 200, { ok: true, alreadySettled: true });
  }
  const reason = "mulerouter-webhook-" + type;
  const nextRecord = record.provider === "aliyun-wan27-image"
    ? await refreshWan27ImageGenerationRecord(record, { reason, upstreamRaw: payload })
    : await refreshWan27GenerationRecord(record, { download: false, reason, upstreamRaw: payload });
  console.log("[mulerouter-webhook]", JSON.stringify({
    type,
    taskId,
    slug,
    localTaskId: record.taskId,
    status: nextRecord && nextRecord.status || "",
  }));
  return sendJson(res, 200, { ok: true, status: nextRecord && nextRecord.status || "" });
}

function verifyAirwallexSignature(rawBody, timestamp, signature) {
  if (!AIRWALLEX_WEBHOOK_SECRET || !rawBody || !timestamp || !signature) return false;
  const age = Math.abs(Date.now() - Number(timestamp));
  if (!Number.isFinite(age) || age > 5 * 60 * 1000) return false;
  const expected = crypto.createHmac("sha256", AIRWALLEX_WEBHOOK_SECRET).update(`${timestamp}${rawBody}`, "utf8").digest("hex");
  const left = Buffer.from(expected);
  const right = Buffer.from(String(signature));
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

async function handleAirwallexWebhook(req, res) {
  if (!AIRWALLEX_WEBHOOK_SECRET) return sendJson(res, 503, { ok: false, code: "AIRWALLEX_NOT_CONFIGURED" });
  const rawBody = await readRawBody(req, 2 * 1024 * 1024);
  const timestamp = String(req.headers["x-timestamp"] || "");
  const signature = String(req.headers["x-signature"] || "");
  if (!verifyAirwallexSignature(rawBody, timestamp, signature)) {
    return sendJson(res, 400, { ok: false, code: "AIRWALLEX_SIGNATURE_INVALID" });
  }
  let event = {};
  try { event = JSON.parse(rawBody); } catch { return sendJson(res, 400, { ok: false, message: "Invalid Airwallex webhook body." }); }
  const name = String(event.name || event.type || "");
  const object = event.data?.object || event.data || {};
  const orderId = String(object.merchant_order_id || object.metadata?.order_id || "").trim();
  const order = orderId ? await findAirwallexCheckoutOrder(orderId) : null;
  if (!order) return sendJson(res, 200, { ok: true, ignored: true });
  const db = await readDb();
  const config = await readAppConfig();
  if (name === "payment_intent.succeeded") {
    await safeSettleWalletOrderPayment(db, order, config, { note: "Settled by Airwallex payment_intent.succeeded.", scanSource: "airwallex" });
    order.airwallexStatus = "SUCCEEDED";
    order.airwallexPaymentIntentId = String(object.id || order.airwallexPaymentIntentId || "");
    await updateWalletOrderInDb(order);
  } else if (name === "payment_intent.cancelled" || name === "payment_attempt.authorization_failed") {
    if (order.status !== "paid") {
      order.status = name.endsWith("cancelled") ? "cancelled" : "failed";
      order.airwallexStatus = name;
      order.updatedAt = new Date().toISOString();
      await updateWalletOrderInDb(order);
    }
  } else if ((name === "refund.received" || name === "refund.settled") && order.status === "paid" && !order.airwallexRefundedAt) {
    const delta = creditsAmount(order.creditAmount || 0);
    try {
      await changeUserCredits(db, order.userId, -delta, "airwallex_refund", { orderId: order.id, provider: "airwallex", refundId: String(object.id || "") });
      order.status = "refunded";
      order.note = "Airwallex refund settled and credits reversed.";
    } catch (error) {
      order.note = `Airwallex refund received but credits were not fully reversed: ${String(error.message || error).slice(0, 160)}`;
    }
    order.airwallexRefundedAt = new Date().toISOString();
    order.updatedAt = order.airwallexRefundedAt;
    await updateWalletOrderInDb(order);
  }
  return sendJson(res, 200, { ok: true });
}

async function handleCreateSubscriptionOrder(req, res) {
  const auth = await requireUser(req, res);
  if (!auth) return;
  const tenant = requestTenantDescriptor(req);
  if (!tenant.subscriptions && !tenant.membershipProgram) return sendJson(res, 404, { ok: false, code: "SUBSCRIPTIONS_DISABLED", message: "Membership purchases are not enabled for this site." });
  const body = await readJson(req);
  const plan = await getBillingPlanInDb(tenant.tenantId, body.planId || body.plan_id);
  if (!plan) return sendJson(res, 404, { ok: false, code: "BILLING_PLAN_NOT_FOUND", message: "Subscription plan not found." });
  if (tenant.membershipProgram && plan.id !== CREATOR_MEMBERSHIP_PLAN_ID) {
    return sendJson(res, 404, { ok: false, code: "BILLING_PLAN_NOT_FOUND", message: "Membership plan not found." });
  }
  if (tenant.membershipProgram && userHasCreatorMembership(auth.user)) {
    return sendJson(res, 409, { ok: false, code: "MEMBERSHIP_ALREADY_ACTIVE", message: "Creator Membership is already active." });
  }
  const config = await readAppConfig();
  const walletOption = findWalletOption(config.wallet || {}, body.walletOptionId || body.walletNetwork || body.network, requestTenantOptions(req));
  if (!walletOption?.address) return sendJson(res, 503, { ok: false, code: "WALLET_NOT_CONFIGURED", message: "USDT payment is not configured." });
  const suffixDigits = clampNumber(config.wallet.suffixDigits, 6, 3, 6);
  const payment = makeUniquePaymentAmount(plan.amount, suffixDigits);
  let order = {
    id: randomId("order"),
    tenantId: tenant.tenantId,
    userId: auth.user.id,
    orderKind: "subscription",
    billingPlanId: plan.id,
    billingPlanName: plan.name,
    billingIntervalUnit: plan.intervalUnit,
    billingIntervalCount: plan.intervalCount,
    baseAmount: plan.amount,
    creditAmount: creditsAmount(plan.includedCredits),
    packageCredits: creditsAmount(plan.includedCredits),
    creditsPerUsd: walletCreditsPerUsd(config.wallet),
    cnyCentsPerUsdt: walletCnyCentsPerUsdt(config.wallet),
    suffix: payment.suffix,
    payableAmount: payment.payableAmount,
    payableAmountText: payment.payableAmountText,
    asset: walletOption.asset || config.wallet.asset,
    network: walletOption.network,
    chain: normalizeWalletChain(walletOption.network),
    walletOptionId: walletOption.id,
    address: walletOption.address,
    qrUrl: walletOption.qrUrl,
    explorerUrl: walletOption.explorerUrl || "",
    status: "pending",
    sourceOrigin: pageOriginFromRequest(req),
    createdAt: new Date().toISOString(),
  };
  auth.db.walletOrders.unshift(order);
  if (dbEnabled()) {
    order = await createManualWalletOrderInDb({ order, suffixDigits });
    auth.db.walletOrders[0] = order;
  } else {
    return sendJson(res, 503, { ok: false, code: "DATABASE_REQUIRED", message: "Subscriptions require database billing." });
  }
  return sendJson(res, 200, { ok: true, order });
}

async function handleCreatePaymentOrder(req, res) {
  const auth = await requireUser(req, res);
  if (!auth) return;

  const body = await readJson(req);
  const config = await readAppConfig();
  const tenant = requestTenantDescriptor(req);
  const requestedProductId = String(body.productId || body.product_id || "").trim();
  const availablePackages = tenant.subscriptions
    ? toolTopupPackagesForPlan(await getBillingPlanInDb(tenant.tenantId))
    : publicTopupPackages(auth.user);
  let paymentSelection = null;
  if (!requestedProductId) {
    const topupPackage = tenant.subscriptions
      ? await toolTopupPackageForRequest(req, body)
      : findTopupPackage(body, auth.user);
    if (topupPackage) {
      paymentSelection = {
        kind: "topup",
        id: topupPackage.id,
        name: "",
        amount: topupPackage.amount,
        credits: topupPackage.credits,
      };
    }
  }
  if (!paymentSelection) {
    return sendJson(res, 400, {
      ok: false,
      code: requestedProductId ? "PRODUCT_NOT_FOUND" : "INVALID_TOPUP_PACKAGE",
      message: requestedProductId ? "Payment product not found." : "Please select one of the available top-up packages.",
      packages: availablePackages,
    });
  }
  const walletOption = findWalletOption(config.wallet || {}, body.walletOptionId || body.walletNetwork || body.network, requestTenantOptions(req));
  if (!walletOption?.address) {
    return sendJson(res, 503, { ok: false, code: "WALLET_NOT_CONFIGURED", message: "USDT top-up is not configured." });
  }

  const suffixDigits = clampNumber(config.wallet.suffixDigits, 6, 3, 6);
  const baseAmount = paymentSelection.amount;
  const payment = makeUniquePaymentAmount(baseAmount, suffixDigits);
  const creditAmount = creditsAmount(paymentSelection.credits);
  if (!dbEnabled()) {
    payment.amount = baseAmount;
    payment.payableAmountText = `${baseAmount}.${payment.suffix}`;
    payment.payableAmount = Number(payment.payableAmountText);
  }
  let order = {
    id: randomId("order"),
    tenantId: tenant.tenantId,
    userId: auth.user.id,
    orderKind: paymentSelection.kind,
    baseAmount,
    creditAmount,
    packageId: paymentSelection.kind === "topup" ? paymentSelection.id : "",
    packageCredits: paymentSelection.credits,
    productId: paymentSelection.kind === "product" ? paymentSelection.id : "",
    productName: paymentSelection.kind === "product" ? paymentSelection.name : "",
    creditsPerUsd: walletCreditsPerUsd(config.wallet),
    cnyCentsPerUsdt: walletCnyCentsPerUsdt(config.wallet),
    suffix: payment.suffix,
    payableAmount: payment.payableAmount,
    payableAmountText: payment.payableAmountText,
    asset: walletOption.asset || config.wallet.asset,
    network: walletOption.network,
    chain: normalizeWalletChain(walletOption.network),
    walletOptionId: walletOption.id,
    address: walletOption.address,
    qrUrl: walletOption.qrUrl,
    explorerUrl: walletOption.explorerUrl || "",
    status: "pending",
    sourceOrigin: pageOriginFromRequest(req),
    createdAt: new Date().toISOString(),
  };
  auth.db.walletOrders.unshift(order);
  if (dbEnabled()) {
    order = await createManualWalletOrderInDb({ order, suffixDigits });
    auth.db.walletOrders[0] = order;
  } else {
    await writeDb(auth.db);
  }
  return sendJson(res, 200, { ok: true, order });
}

async function handleListPaymentOrders(req, res) {
  const auth = await requireUser(req, res, { loadDb: false });
  if (!auth) return;
  if (dbEnabled()) {
    const result = await getUserWalletOrdersPageFromDb({ userId: auth.user.id, page: 1, limit: 20 });
    if (result) return sendJson(res, 200, { ok: true, orders: result.items });
  }
  const orders = auth.db.walletOrders.filter((order) => order.userId === auth.user.id).slice(0, 20);
  return sendJson(res, 200, { ok: true, orders });
}

function normalizeSubmittedTxHash(value = "") {
  return String(value || "").trim().replace(/\s+/g, "");
}

function isValidSubmittedTxHash(value = "") {
  const text = normalizeSubmittedTxHash(value);
  return text.length >= 20 && text.length <= 140 && /^[A-Za-z0-9:_-]+$/.test(text);
}

async function handleConfirmPaymentOrder(req, res, orderId) {
  const auth = await requireUser(req, res);
  if (!auth) return;
  const body = await readJson(req);
  const hash = normalizeSubmittedTxHash(body.transactionHash || body.txHash || body.hash);
  if (!isValidSubmittedTxHash(hash)) {
    return sendJson(res, 400, { ok: false, code: "INVALID_TRANSACTION_HASH", message: "Please enter a valid transaction hash." });
  }
  const config = await readAppConfig();
  const tenantOptions = requestTenantOptions(req);
  const id = String(orderId || "").trim();
  const dbOrder = await getWalletOrderByIdInDb(id);
  const order = dbOrder || (auth.db.walletOrders || []).find((entry) => entry.id === id);
  if (!order || order.userId !== auth.user.id) {
    return sendJson(res, 404, { ok: false, code: "ORDER_NOT_FOUND", message: "Payment order not found." });
  }
  if (order.paymentProvider === "paypal" || order.network === "PayPal") {
    return sendJson(res, 400, { ok: false, code: "UNSUPPORTED_PAYMENT_PROVIDER", message: "This order does not support hash confirmation." });
  }
  if (order.status === "paid") {
    return sendJson(res, 200, { ok: true, order: publicTopupOrder(order, config.wallet, tenantOptions), user: userView(auth.user) });
  }
  order.confirmationHash = hash;
  order.confirmationSubmittedAt = new Date().toISOString();
  order.confirmationSource = "user";
  order.note = "User submitted transaction hash. Waiting for wallet scanner verification.";
  order.updatedAt = new Date().toISOString();
  if (dbEnabled()) {
    await updateWalletOrderInDb(order);
  } else {
    await writeDb(auth.db);
  }
  return sendJson(res, 200, { ok: true, order: publicTopupOrder(order, config.wallet, tenantOptions) });
}

function parseNestedJsonParam(value) {
  if (!value || typeof value !== "string") return null;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

async function handleTronLinkCallback(req, res, url) {
  let payload = {};
  if (req.method === "POST") {
    try {
      payload = await readJson(req);
    } catch {
      payload = {};
    }
  }
  for (const [key, value] of url.searchParams.entries()) {
    if (payload[key] === undefined) payload[key] = value;
  }
  const nested = parseNestedJsonParam(payload.param) || parseNestedJsonParam(payload.data) || parseNestedJsonParam(payload.result);
  if (nested) payload = { ...payload, ...nested };
  const orderId = String(payload.actionId || payload.orderId || payload.order_id || payload.id || "").trim();
  const hash = normalizeSubmittedTxHash(
    payload.transactionHash || payload.txHash || payload.txid || payload.txId || payload.hash || payload.transaction_id,
  );
  if (!orderId) return sendJson(res, 400, { ok: false, code: "ORDER_ID_REQUIRED", message: "Order id is required." });
  if (!isValidSubmittedTxHash(hash)) {
    return sendJson(res, 400, { ok: false, code: "INVALID_TRANSACTION_HASH", message: "Please enter a valid transaction hash." });
  }
  const db = await readDb();
  const order = await getWalletOrderByIdInDb(orderId) || (db.walletOrders || []).find((entry) => entry.id === orderId);
  if (!order) return sendJson(res, 404, { ok: false, code: "ORDER_NOT_FOUND", message: "Payment order not found." });
  if (order.status !== "paid") {
    order.confirmationHash = hash;
    order.confirmationSubmittedAt = new Date().toISOString();
    order.confirmationSource = "tronlink_callback";
    order.note = "TronLink callback submitted transaction hash. Waiting for wallet scanner verification.";
    order.updatedAt = new Date().toISOString();
    if (dbEnabled()) {
      await updateWalletOrderInDb(order);
    } else {
      await writeDb(db);
    }
  }
  return sendJson(res, 200, { ok: true, orderId: order.id, status: order.status || "pending" });
}

async function handlePayPalConfig(req, res) {
  return sendJson(res, 200, { ok: true, paypal: paypalPublicConfig() });
}

function referralWithdrawalView(record = {}, user = {}) {
  return {
    id: String(record.id || ""),
    userId: String(record.userId || ""),
    username: String(record.username || user?.username || ""),
    amountUsd: Number(Number(record.amountUsd || 0).toFixed(2)),
    walletAddress: String(record.walletAddress || ""),
    // Keep the established UI pending state compatible while persisting the clearer processing state.
    status: String(record.status || "processing").toLowerCase() === "processing" ? "pending" : String(record.status || "processing"),
    note: String(record.note || ""),
    txHash: String(record.txHash || ""),
    createdAt: String(record.createdAt || ""),
    requestedAt: String(record.requestedAt || record.createdAt || ""),
    updatedAt: String(record.updatedAt || ""),
    processedAt: String(record.processedAt || ""),
    rejectionReason: String(record.rejectionReason || record.note || ""),
  };
}

async function handleUpdateReferralWallet(req, res) {
  const auth = await requireUser(req, res);
  if (!auth) return;
  const body = await readJson(req);
  const address = String(body.walletAddress || body.address || "").trim();
  if (address.length < 20 || address.length > 200) return sendJson(res, 400, { ok: false, code: "INVALID_WALLET_ADDRESS", message: "Please enter a valid wallet address." });
  const referral = referralPayload(auth.user);
  auth.user.referral = { ...referral, walletAddress: address, updatedAt: new Date().toISOString() };
  auth.user.updatedAt = new Date().toISOString();
  if (dbEnabled()) await updateUserInDb(auth.user); else await writeDb(auth.db);
  return sendJson(res, 200, { ok: true, referral: publicReferralSummary(req, auth.db, auth.user), user: userView(auth.user) });
}

async function handleListReferralWithdrawals(req, res, url) {
  const auth = await requireUser(req, res, { loadDb: false });
  if (!auth) return;
  const paging = pagingFromUrl(url || new URL("http://localhost"), { defaultLimit: 20, maxLimit: 100 });
  if (dbEnabled()) {
    const page = await getReferralWithdrawalsPageFromDb({ userId: auth.user.id, page: paging.page, limit: paging.limit });
    if (page) return sendJson(res, 200, { ok: true, records: page.items.map((item) => referralWithdrawalView(item, auth.user)), page: page.page, limit: page.limit, total: page.total, totalPages: page.totalPages });
  }
  const records = (auth.db.referralWithdrawals || []).filter((item) => item.userId === auth.user.id).sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));
  const paged = pagedResponse(records, paging);
  return sendJson(res, 200, { ok: true, records: paged.items.map((item) => referralWithdrawalView(item, auth.user)), page: paged.page, limit: paged.limit, total: paged.total, totalPages: Math.max(1, Math.ceil(paged.total / paged.limit)) });
}

async function handleCreateReferralWithdrawal(req, res) {
  const auth = await requireUser(req, res);
  if (!auth) return;
  const body = await readJson(req);
  const amount = Math.round(Number(body.amountUsd || body.amount || 0) * 100) / 100;
  if (!Number.isFinite(amount) || amount < 1) return sendJson(res, 400, { ok: false, code: "INVALID_WITHDRAWAL_AMOUNT", message: "Minimum withdrawal is $1." });
  const referral = referralPayload(auth.user);
  const total = Number(referral.totalCommissionUsd || 0);
  const withdrawn = Number(referral.withdrawnCommissionUsd || 0);
  const locked = Number(referral.lockedCommissionUsd || 0);
  const available = Math.max(0, total - withdrawn - locked);
  if (amount > available + 1e-9) return sendJson(res, 400, { ok: false, code: "INSUFFICIENT_COMMISSION", message: "Insufficient withdrawable commission.", availableUsd: Number(available.toFixed(2)) });
  const address = String(body.walletAddress || body.address || referral.walletAddress || "").trim();
  if (address.length < 20 || address.length > 200) return sendJson(res, 400, { ok: false, code: "WALLET_ADDRESS_REQUIRED", message: "Set your wallet address before requesting withdrawal." });
  const now = new Date().toISOString();
  const record = { id: randomId("withdraw"), userId: auth.user.id, username: auth.user.username || "", amountUsd: amount, walletAddress: address, status: "processing", note: "", txHash: "", createdAt: now, updatedAt: now };
  auth.user.referral = { ...referral, walletAddress: address, lockedCommissionUsd: Number((locked + amount).toFixed(2)), updatedAt: now };
  auth.user.updatedAt = now;
  auth.db.referralWithdrawals = Array.isArray(auth.db.referralWithdrawals) ? auth.db.referralWithdrawals : [];
  auth.db.referralWithdrawals.unshift(record);
  if (dbEnabled()) { await updateUserInDb(auth.user); await createReferralWithdrawalInDb(record); } else await writeDb(auth.db);
  return sendJson(res, 200, { ok: true, record: referralWithdrawalView(record, auth.user), referral: publicReferralSummary(req, auth.db, auth.user) });
}

async function handleAdminListReferralWithdrawals(req, res, url) {
  const auth = await requireAdmin(req, res, { loadDb: false });
  if (!auth) return;
  const paging = pagingFromUrl(url || new URL("http://localhost"), { defaultLimit: 20, maxLimit: 100 });
  const status = String((url || new URL("http://localhost")).searchParams.get("status") || "").trim().toLowerCase();
  let page;
  if (dbEnabled()) page = await getReferralWithdrawalsPageFromDb({ page: paging.page, limit: paging.limit, status });
  if (page) {
    const users = await getUsersByIdsInDb(page.items.map((item) => item.userId));
    const map = new Map(users.map((user) => [user.id, user]));
    return sendJson(res, 200, { ok: true, records: page.items.map((item) => referralWithdrawalView(item, map.get(item.userId))), page: page.page, limit: page.limit, total: page.total, totalPages: page.totalPages });
  }
  const users = new Map((auth.db.users || []).map((user) => [user.id, user]));
  let records = (auth.db.referralWithdrawals || []).filter((item) => !status || String(item.status || "").toLowerCase() === status).sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));
  const paged = pagedResponse(records, paging);
  return sendJson(res, 200, { ok: true, records: paged.items.map((item) => referralWithdrawalView(item, users.get(item.userId))), page: paged.page, limit: paged.limit, total: paged.total, totalPages: Math.max(1, Math.ceil(paged.total / paged.limit)) });
}

async function handleAdminUpdateReferralWithdrawal(req, res, withdrawalId) {
  const auth = await requireAdmin(req, res);
  if (!auth) return;
  const id = decodeURIComponent(String(withdrawalId || ""));
  const record = (await getReferralWithdrawalByIdInDb(id)) || (auth.db.referralWithdrawals || []).find((item) => item.id === id);
  if (!record) return sendJson(res, 404, { ok: false, message: "Withdrawal request not found." });
  const body = await readJson(req);
  const nextStatus = String(body.status || "").trim().toLowerCase();
  if (!["processing", "rejected", "paid"].includes(nextStatus)) return sendJson(res, 400, { ok: false, code: "INVALID_WITHDRAWAL_STATUS", message: "Status must be processing, rejected, or paid." });
  const user = (auth.db.users || []).find((item) => item.id === record.userId) || (await getUserByIdInDb(record.userId));
  if (!user) return sendJson(res, 404, { ok: false, message: "User not found." });
  const previous = String(record.status || "processing");
  if (previous === "paid" && nextStatus !== "paid") return sendJson(res, 409, { ok: false, code: "WITHDRAWAL_ALREADY_PAID", message: "Paid withdrawal records cannot be reopened." });
  const referral = referralPayload(user);
  let locked = Number(referral.lockedCommissionUsd || 0);
  let withdrawn = Number(referral.withdrawnCommissionUsd || 0);
  if (previous === "processing" && nextStatus !== "processing") locked = Math.max(0, locked - Number(record.amountUsd || 0));
  if (previous !== "processing" && nextStatus === "processing") locked += Number(record.amountUsd || 0);
  if (previous !== "paid" && nextStatus === "paid") withdrawn += Number(record.amountUsd || 0);
  record.status = nextStatus;
  record.note = typeof body.note === "string" ? body.note.slice(0, 500) : record.note || "";
  record.txHash = typeof body.txHash === "string" ? body.txHash.trim().slice(0, 200) : record.txHash || "";
  record.processedAt = nextStatus === "processing" ? "" : (record.processedAt || new Date().toISOString());
  record.updatedAt = new Date().toISOString();
  user.referral = { ...referral, lockedCommissionUsd: Number(locked.toFixed(2)), withdrawnCommissionUsd: Number(withdrawn.toFixed(2)), walletAddress: referral.walletAddress || record.walletAddress, updatedAt: record.updatedAt };
  user.updatedAt = record.updatedAt;
  if (dbEnabled()) { await updateReferralWithdrawalInDb(record); await updateUserInDb(user); } else { const idx = auth.db.referralWithdrawals.findIndex((item) => item.id === id); if (idx >= 0) auth.db.referralWithdrawals[idx] = record; await writeDb(auth.db); }
  return sendJson(res, 200, { ok: true, record: referralWithdrawalView(record, user) });
}

function stripeConfigForHost(host = "") {
  const normalizedHost = normalizeHostname(host);
  if (normalizedHost === "pay.5vips.com" && STRIPE_PAY5_SECRET_KEY) {
    return {
      secretKey: STRIPE_PAY5_SECRET_KEY,
      webhookSecret: STRIPE_PAY5_WEBHOOK_SECRET,
      accountId: STRIPE_PAY5_ACCOUNT_ID,
    };
  }
  return {
    secretKey: STRIPE_SECRET_KEY,
    webhookSecret: STRIPE_WEBHOOK_SECRET,
    accountId: "",
  };
}

function stripeConfigForRequest(req = null) {
  return stripeConfigForHost(req?.headers?.host || req?.headers?.["x-forwarded-host"] || "");
}

function stripeConfigForOrder(order = {}, req = null) {
  if (String(order?.stripeAccountId || "") === STRIPE_PAY5_ACCOUNT_ID && STRIPE_PAY5_SECRET_KEY) {
    return stripeConfigForHost("pay.5vips.com");
  }
  // Admin hydration runs outside an HTTP request; use the primary Stripe account in that case.
  return req ? stripeConfigForRequest(req) : stripeConfigForHost("");
}

function stripeEnabled(config = stripeConfigForHost("")) {
  return Boolean(config.secretKey && config.webhookSecret);
}

function stripePublicConfig(req = null) {
  return { enabled: stripeEnabled(stripeConfigForHost(stripeCheckoutBaseUrlForRequest(req))), currency: STRIPE_CURRENCY };
}

async function stripeRequest(pathname, params, method = "POST", config = stripeConfigForHost("")) {
  if (!config.secretKey) {
    const error = new Error("Stripe is not configured.");
    error.statusCode = 503;
    error.code = "STRIPE_NOT_CONFIGURED";
    throw error;
  }
  const requestMethod = String(method || "POST").toUpperCase();
  const query = params instanceof URLSearchParams ? params.toString() : new URLSearchParams(params || {}).toString();
  const url = requestMethod === "GET" && query ? `https://api.stripe.com${pathname}?${query}` : `https://api.stripe.com${pathname}`;
  const response = await fetch(url, {
    method: requestMethod,
    headers: {
      authorization: `Bearer ${config.secretKey}`,
      "content-type": "application/x-www-form-urlencoded",
    },
    ...(requestMethod === "GET" || requestMethod === "HEAD" ? {} : { body: params instanceof URLSearchParams ? params : new URLSearchParams(params || {}) }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(payload?.error?.message || "Stripe request failed.");
    error.statusCode = response.status || 502;
    error.code = payload?.error?.code || "STRIPE_REQUEST_FAILED";
    error.details = payload;
    throw error;
  }
  return payload;
}

function stripeCheckoutProductName(order = {}) {
  if (order.orderKind === "subscription") return order.billingPlanName || "Membership subscription";
  if (order.orderKind === "product") return order.productName || "API documentation access";
  return "Vipeak AI credits";
}

function stripeCheckoutAmountCents(order = {}) {
  return Math.round(Number(order.baseAmount || 0) * 100);
}

function stripeCheckoutSessionExpired(order = {}) {
  const createdMs = Date.parse(order.createdAt || order.updatedAt || "");
  if (!Number.isFinite(createdMs)) return false;
  return Date.now() - createdMs > STRIPE_CHECKOUT_SESSION_TTL_SECONDS * 1000;
}

function stripeCheckoutUrl(orderId = "", checkoutBaseUrl = STRIPE_CHECKOUT_BASE_URL) {
  const url = new URL("/", `${String(checkoutBaseUrl || STRIPE_CHECKOUT_BASE_URL).replace(/\/+$/, "")}/`);
  url.searchParams.set("stripe_sid", String(orderId || ""));
  return url.toString();
}

async function findStripeCheckoutOrder(orderId = "") {
  const id = String(orderId || "").trim();
  if (!id) return null;
  const db = await readDb();
  const stored = await getWalletOrderByIdInDb(id);
  if (stored && String(stored.paymentProvider || "").toLowerCase() === "stripe") return stored;
  return (db.walletOrders || []).find((order) => (
    String(order.id || "") === id && String(order.paymentProvider || "").toLowerCase() === "stripe"
  )) || null;
}

async function startStripeCheckoutForOrder(order, config, { requestOrigin = "", stripeConfig = stripeConfigForHost("") } = {}) {
  const params = new URLSearchParams();
  const origin = String(order.sourceOrigin || requestOrigin || "https://123vips.com").replace(/\/+$/, "");
  params.set("mode", "payment");
  const promoQuery = new URLSearchParams();
  if (order.promoCampaignId === "eleven-eleven-2026") {
    promoQuery.set("promo", "1111");
    if (order.promoCampaignSku) promoQuery.set("promo_sku", order.promoCampaignSku);
  }
  promoQuery.set("stripe_session_id", "{CHECKOUT_SESSION_ID}");
  params.set("success_url", `${origin}/?${promoQuery.toString()}#topups`);
  const cancelQuery = new URLSearchParams();
  if (order.promoCampaignId === "eleven-eleven-2026") {
    cancelQuery.set("promo", "1111");
    cancelQuery.set("promo_cancelled", "1");
    if (order.promoCampaignSku) cancelQuery.set("promo_sku", order.promoCampaignSku);
  }
  params.set("cancel_url", `${origin}/?${cancelQuery.toString()}#topups`);
  params.set("client_reference_id", order.id);
  params.set("expires_at", String(Math.floor(Date.now() / 1000) + STRIPE_CHECKOUT_SESSION_TTL_SECONDS));
  params.set("line_items[0][price_data][currency]", STRIPE_CURRENCY);
  params.set("line_items[0][price_data][unit_amount]", String(stripeCheckoutAmountCents(order)));
  params.set("line_items[0][price_data][product_data][name]", stripeCheckoutProductName(order));
  params.set("line_items[0][quantity]", "1");
  params.set("metadata[order_id]", order.id);
  params.set("metadata[user_id]", order.userId || "");
  params.set("metadata[tenant_id]", order.tenantId || "");
  params.set("metadata[order_kind]", order.orderKind || "topup");
  params.set("payment_intent_data[metadata][order_id]", order.id || "");
  params.set("payment_intent_data[metadata][user_id]", order.userId || "");
  params.set("payment_intent_data[metadata][tenant_id]", order.tenantId || "");
  const session = await stripeRequest("/v1/checkout/sessions", params, "POST", stripeConfig);
  order.stripeCheckoutSessionId = String(session.id || "");
  order.stripePaymentStatus = String(session.payment_status || "");
  order.stripePaymentIntentId = String(session.payment_intent || "");
  order.stripeCheckoutUrl = String(session.url || "");
  order.updatedAt = new Date().toISOString();
  await updateWalletOrderInDb(order);
  return session;
}

async function createStripeCheckoutSession(req, res) {
  const auth = await requireUser(req, res);
  if (!auth) return;
  const cashierBaseUrl = stripeCheckoutBaseUrlForRequest(req);
  const stripeConfig = stripeConfigForHost(cashierBaseUrl);
  if (!stripeEnabled(stripeConfig)) return sendJson(res, 503, { ok: false, code: "STRIPE_NOT_CONFIGURED", message: "Stripe is not configured yet." });
  const body = await readJson(req);
  const config = await readAppConfig();
  const tenantOptions = requestTenantOptions(req);
  const selection = await paypalCheckoutSelectionForRequest(req, body, auth.user);
  if (!selection) {
    const requestedPlan = Boolean(body.billingPlanId || body.billing_plan_id || body.planId || body.plan_id);
    return sendJson(res, 400, {
      ok: false,
      code: requestedPlan ? "BILLING_PLAN_NOT_FOUND" : "INVALID_TOPUP_PACKAGE",
      message: requestedPlan ? "Subscription plan not found." : "Please select one of the available top-up packages.",
      packages: await paypalTopupPackagesForRequest(req, auth.user),
    });
  }
  if (selection.alreadyOwned) {
    return sendJson(res, 409, {
      ok: false,
      code: selection.kind === "subscription" ? "MEMBERSHIP_ALREADY_ACTIVE" : "PRODUCT_ALREADY_OWNED",
      message: "Creator Membership is already active.",
    });
  }
  const amount = Number(selection.amount || 0);
  const amountCents = Math.round(amount * 100);
  if (!Number.isFinite(amount) || amountCents < 100 || amountCents > 100000000) {
    return sendJson(res, 400, { ok: false, code: "INVALID_STRIPE_AMOUNT", message: "Stripe amount must be between 1 and 1,000,000 USD." });
  }
  const origin = pageOriginFromRequest(req);
  const order = {
    id: randomId("stripe"),
    tenantId: tenantOptions.tenant?.tenantId || DEFAULT_TENANT_ID,
    userId: auth.user.id,
    paymentProvider: "stripe",
    orderKind: selection.kind,
    baseAmount: amount,
    creditAmount: creditsAmount(selection.credits),
    packageId: selection.kind === "topup" ? selection.id : "",
    packageCredits: selection.credits,
    productId: selection.product?.id || "",
    productName: selection.product?.name || "",
    billingPlanId: selection.plan?.id || "",
    billingPlanName: selection.plan?.name || "",
    billingIntervalUnit: selection.plan?.intervalUnit || "",
    billingIntervalCount: selection.plan?.intervalCount || 0,
    creditsPerUsd: walletCreditsPerUsd(config.wallet),
    cnyCentsPerUnit: paypalCnyCentsPerUnit(config.wallet),
    currency: STRIPE_CURRENCY.toUpperCase(),
    payableAmount: amount,
    payableAmountText: amount.toFixed(2),
    asset: STRIPE_CURRENCY.toUpperCase(),
    network: "Stripe",
    chain: "stripe",
    status: "pending",
    sourceOrigin: origin,
    cashierHost: normalizeHostname(cashierBaseUrl),
    stripeAccountId: stripeConfig.accountId || "",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  await createWalletOrderInDb(order);
  return sendJson(res, 200, {
    ok: true,
    checkoutUrl: stripeCheckoutUrl(order.id, cashierBaseUrl),
    cashierUrl: stripeCheckoutUrl(order.id, cashierBaseUrl),
    order: publicTopupOrder(order, config.wallet, tenantOptions),
  });
}

async function handleStripeCheckoutSessionDetails(req, res, orderId) {
  const order = await findStripeCheckoutOrder(orderId);
  if (!order) return sendJson(res, 404, { ok: false, code: "STRIPE_CHECKOUT_NOT_FOUND", message: "Stripe checkout session not found." });
  const config = await readAppConfig();
  return sendJson(res, 200, { ok: true, session: { id: order.id, status: order.status || "pending", stripeStatus: order.stripePaymentStatus || "", checkoutUrl: order.stripeCheckoutUrl || "", returnUrl: `${String(order.sourceOrigin || "https://123vips.com").replace(/\/+$/, "")}/#topups`, order: publicTopupOrder(order, config.wallet, requestTenantOptions(req)) } });
}

async function handleStartStripeCheckoutSession(req, res, orderId) {
  const order = await findStripeCheckoutOrder(orderId);
  if (!order) return sendJson(res, 404, { ok: false, code: "STRIPE_CHECKOUT_NOT_FOUND", message: "Stripe checkout session not found." });
  const stripeConfig = stripeConfigForHost(stripeCashierHostForOrder(order));
  if (!stripeEnabled(stripeConfig)) return sendJson(res, 503, { ok: false, code: "STRIPE_NOT_CONFIGURED", message: "Stripe is not configured yet." });
  const config = await readAppConfig();
  if (order.status === "paid") return sendJson(res, 200, { ok: true, checkoutUrl: "", session: { id: order.id, status: order.status, order: publicTopupOrder(order, config.wallet, requestTenantOptions(req)) } });
  if (stripeCheckoutSessionExpired(order)) return sendJson(res, 410, { ok: false, code: "STRIPE_CHECKOUT_EXPIRED", message: "This payment session has expired. Please create a new top-up order." });
  if (order.stripeCheckoutUrl) return sendJson(res, 200, { ok: true, checkoutUrl: order.stripeCheckoutUrl, session: { id: order.id, status: order.status, order: publicTopupOrder(order, config.wallet, requestTenantOptions(req)) } });
  try {
    const stripeSession = await startStripeCheckoutForOrder(order, config, { requestOrigin: pageOriginFromRequest(req), stripeConfig });
    return sendJson(res, 200, { ok: true, checkoutUrl: String(stripeSession.url || order.stripeCheckoutUrl || ""), session: { id: order.id, status: order.status, order: publicTopupOrder(order, config.wallet, requestTenantOptions(req)) } });
  } catch (error) {
    order.status = "failed";
    order.note = error.message || "Stripe checkout creation failed.";
    order.updatedAt = new Date().toISOString();
    await updateWalletOrderInDb(order).catch(() => {});
    return sendJson(res, error.statusCode || 502, { ok: false, code: error.code || "STRIPE_CHECKOUT_FAILED", message: "Stripe checkout could not be created." });
  }
}

function verifyStripeSignature(rawBody, signatureHeader, webhookSecret = STRIPE_WEBHOOK_SECRET) {
  if (!webhookSecret || !rawBody || !signatureHeader) return false;
  const values = {};
  for (const part of String(signatureHeader).split(",")) {
    const [key, value] = part.split("=", 2);
    if (key && value) values[key] = value;
  }
  const timestamp = Number(values.t || 0);
  const signature = String(values.v1 || "");
  if (!timestamp || !signature || Math.abs(Date.now() / 1000 - timestamp) > 300) return false;
  const expected = crypto.createHmac("sha256", webhookSecret).update(`${timestamp}.${rawBody}`, "utf8").digest("hex");
  try {
    return crypto.timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(signature, "hex"));
  } catch {
    return false;
  }
}

function stripeObjectId(value = "") {
  if (value && typeof value === "object") return String(value.id || "");
  return String(value || "");
}

function stripeIsoFromTimestamp(value) {
  const seconds = Number(value || 0);
  return Number.isFinite(seconds) && seconds > 0 ? new Date(seconds * 1000).toISOString() : "";
}

function stripeAmountMajor(value) {
  const cents = Number(value);
  return Number.isFinite(cents) ? Math.round((cents / 100) * 100) / 100 : 0;
}

function stripeFailureDetails(...objects) {
  for (const object of objects) {
    const error = object?.last_payment_error || object?.failure_details || object || {};
    const code = String(error.code || object?.failure_code || "").trim();
    const message = String(error.message || object?.failure_message || object?.outcome?.seller_message || "").trim();
    if (code || message) return { code, message };
  }
  return { code: "", message: "" };
}

async function hydrateStripeOrderDetails(order, sessionHint = null, paymentIntentHint = null, chargeHint = null, stripeConfig = stripeConfigForHost("")) {
  if (!order || String(order.paymentProvider || "").toLowerCase() !== "stripe") return order;
  let session = sessionHint && typeof sessionHint === "object" ? sessionHint : null;
  let paymentIntent = paymentIntentHint && typeof paymentIntentHint === "object" ? paymentIntentHint : null;
  let charge = chargeHint && typeof chargeHint === "object" ? chargeHint : null;
  let customer = null;
  try {
    const sessionId = stripeObjectId(session) || String(order.stripeCheckoutSessionId || "");
    if (sessionId && (!session || !session.customer_details)) {
      const params = new URLSearchParams();
      params.append("expand[]", "payment_intent.latest_charge");
      params.append("expand[]", "payment_intent.payment_method");
      params.append("expand[]", "customer");
      session = await stripeRequest(`/v1/checkout/sessions/${encodeURIComponent(sessionId)}`, params, "GET", stripeConfig);
    }
  } catch (error) {
    console.warn("[stripe-session-details-failed]", error.message || error);
  }
  if (!paymentIntent) paymentIntent = session?.payment_intent && typeof session.payment_intent === "object" ? session.payment_intent : null;
  const paymentIntentId = stripeObjectId(paymentIntent) || stripeObjectId(session?.payment_intent) || String(order.stripePaymentIntentId || "");
  if (paymentIntentId && (!paymentIntent || !paymentIntent.last_payment_error || !paymentIntent.payment_method)) {
    try {
      const params = new URLSearchParams();
      params.append("expand[]", "latest_charge");
      params.append("expand[]", "payment_method");
      paymentIntent = await stripeRequest(`/v1/payment_intents/${encodeURIComponent(paymentIntentId)}`, params, "GET", stripeConfig);
    } catch (error) {
      console.warn("[stripe-payment-intent-details-failed]", error.message || error);
    }
  }
  if (!charge) charge = paymentIntent?.latest_charge && typeof paymentIntent.latest_charge === "object" ? paymentIntent.latest_charge : null;
  const chargeId = stripeObjectId(charge) || stripeObjectId(paymentIntent?.latest_charge);
  if (chargeId && (!charge || !charge.payment_method_details)) {
    try {
      charge = await stripeRequest(`/v1/charges/${encodeURIComponent(chargeId)}`, null, "GET", stripeConfig);
    } catch (error) {
      console.warn("[stripe-charge-details-failed]", error.message || error);
    }
  }
  customer = session?.customer && typeof session.customer === "object" ? session.customer : null;
  const customerId = stripeObjectId(customer) || stripeObjectId(session?.customer) || String(order.stripeCustomerId || "");
  if (customerId && !customer) {
    try { customer = await stripeRequest(`/v1/customers/${encodeURIComponent(customerId)}`, null, "GET", stripeConfig); } catch (error) {
      console.warn("[stripe-customer-details-failed]", error.message || error);
    }
  }
  const failure = stripeFailureDetails(paymentIntent, charge, session);
  const methodType = String(
    paymentIntent?.payment_method?.type ||
    charge?.payment_method_details?.type ||
    session?.payment_method_types?.[0] ||
    order.stripePaymentMethodType ||
    "",
  );
  const amountReceived = paymentIntent?.amount_received ?? charge?.amount ?? session?.amount_total;
  const refundedAmount = charge?.amount_refunded ?? paymentIntent?.amount_refunded;
  const detailsAvailable = Boolean(session || paymentIntent || charge || customer);
  Object.assign(order, {
    stripeCheckoutSessionId: stripeObjectId(session) || order.stripeCheckoutSessionId || "",
    stripePaymentIntentId: paymentIntentId || order.stripePaymentIntentId || "",
    stripeChargeId: chargeId || order.stripeChargeId || "",
    stripeCustomerId: customerId || order.stripeCustomerId || "",
    stripeCustomerEmail: String(session?.customer_details?.email || customer?.email || order.stripeCustomerEmail || ""),
    stripeCustomerName: String(session?.customer_details?.name || customer?.name || order.stripeCustomerName || ""),
    stripePaymentMethodType: methodType,
    stripePaymentStatus: String(session?.payment_status || paymentIntent?.status || order.stripePaymentStatus || ""),
    stripeFailureCode: failure.code || order.stripeFailureCode || "",
    stripeFailureMessage: failure.message || order.stripeFailureMessage || "",
    stripeAmountReceived: amountReceived !== undefined ? stripeAmountMajor(amountReceived) : (order.stripeAmountReceived || 0),
    stripeRefundedAmount: refundedAmount !== undefined ? stripeAmountMajor(refundedAmount) : (order.stripeRefundedAmount || 0),
    stripeCreatedAt: stripeIsoFromTimestamp(charge?.created || paymentIntent?.created || session?.created) || order.stripeCreatedAt || "",
    stripeDetailsSyncedAt: detailsAvailable ? new Date().toISOString() : (order.stripeDetailsSyncedAt || ""),
  });
  order.updatedAt = new Date().toISOString();
  return order;
}

async function handleStripeWebhook(req, res) {
  const rawBody = await readRawBody(req, 2 * 1024 * 1024);
  const stripeConfig = stripeConfigForRequest(req);
  if (!stripeConfig.webhookSecret) return sendJson(res, 503, { ok: false, code: "STRIPE_NOT_CONFIGURED" });
  if (!verifyStripeSignature(rawBody, req.headers["stripe-signature"], stripeConfig.webhookSecret)) return sendJson(res, 400, { ok: false, code: "STRIPE_SIGNATURE_INVALID", message: "Invalid Stripe webhook signature." });
  let event;
  try { event = JSON.parse(rawBody); } catch { return sendJson(res, 400, { ok: false, message: "Invalid Stripe webhook body." }); }
  const supportedEvents = new Set([
    "checkout.session.completed",
    "checkout.session.async_payment_succeeded",
    "checkout.session.async_payment_failed",
    "checkout.session.expired",
    "payment_intent.payment_failed",
    "charge.refunded",
  ]);
  if (!supportedEvents.has(event.type)) return sendJson(res, 200, { ok: true, ignored: true });
  const object = event.data?.object || {};
  const session = event.type.startsWith("checkout.session.") ? object : null;
  const paymentIntent = event.type.startsWith("payment_intent.") ? object : null;
  const charge = event.type.startsWith("charge.") ? object : null;
  let orderId = String(
    session?.metadata?.order_id || session?.client_reference_id ||
    paymentIntent?.metadata?.order_id || charge?.metadata?.order_id || "",
  ).trim();
  const db = await readDb();
  if (!orderId) {
    const paymentIntentId = stripeObjectId(paymentIntent) || stripeObjectId(charge?.payment_intent);
    const matched = (db.walletOrders || []).find((entry) =>
      String(entry.paymentProvider || "").toLowerCase() === "stripe" &&
      paymentIntentId && String(entry.stripePaymentIntentId || "") === paymentIntentId,
    );
    orderId = String(matched?.id || "");
  }
  if (!orderId) return sendJson(res, 200, { ok: true, ignored: true, reason: "missing_order_id" });
  const order = await getWalletOrderByIdInDb(orderId) || (db.walletOrders || []).find((entry) => entry.id === orderId);
  if (!order || order.paymentProvider !== "stripe") return sendJson(res, 200, { ok: true, ignored: true, reason: "order_not_found" });
  await hydrateStripeOrderDetails(order, session, paymentIntent, charge, stripeConfig);
  if (event.type === "charge.refunded") {
    order.stripeRefundedAmount = stripeAmountMajor(object.amount_refunded ?? object.amount);
    order.stripeRefundStatus = object.refunded ? "refunded" : "partial_refund";
    await updateWalletOrderInDb(order);
    return sendJson(res, 200, { ok: true, refunded: true });
  }
  if (event.type === "checkout.session.async_payment_failed" || event.type === "checkout.session.expired" || event.type === "payment_intent.payment_failed") {
    if (order.status !== "paid") order.status = "failed";
    const failure = order.stripeFailureMessage || order.stripeFailureCode || (event.type === "checkout.session.expired" ? "Checkout session expired." : "Stripe payment failed.");
    order.note = String(failure).slice(0, 200);
    await updateWalletOrderInDb(order);
    if (order.promoCampaignId === "eleven-eleven-2026") {
      await markPromotionPurchaseFailedInDb({
        campaignId: order.promoCampaignId,
        orderId: order.id,
        status: event.type === "checkout.session.expired" ? "expired" : "failed",
      }).catch(() => {});
    }
    return sendJson(res, 200, { ok: true, failed: true });
  }
  const amountTotal = Number(session?.amount_total || 0);
  const currency = String(session?.currency || "").toLowerCase();
  if (amountTotal !== stripeCheckoutAmountCents(order) || currency !== STRIPE_CURRENCY) {
    order.note = "Stripe checkout amount or currency mismatch. Manual review required.";
    order.updatedAt = new Date().toISOString();
    await updateWalletOrderInDb(order);
    return sendJson(res, 400, { ok: false, code: "STRIPE_AMOUNT_MISMATCH" });
  }
  if (event.type === "checkout.session.completed" && String(session?.payment_status || "").toLowerCase() !== "paid") {
    await updateWalletOrderInDb(order);
    return sendJson(res, 200, { ok: true, pending: true });
  }
  const config = await readAppConfig();
  const settled = await safeSettleWalletOrderPayment(db, order, config, { note: "Paid by Stripe Checkout webhook." });
  await updateWalletOrderInDb(order);
  if (!settled.settled && settled.error) return sendJson(res, 500, { ok: false, message: "Stripe payment received but settlement failed." });
  return sendJson(res, 200, { ok: true, settled: true });
}

async function paypalTopupPackagesForRequest(req, user = null) {
  const tenant = requestTenantDescriptor(req);
  if (tenant.subscriptions) {
    const plan = await getBillingPlanInDb(tenant.tenantId);
    return toolTopupPackagesForPlan(plan);
  }
  return publicTopupPackages(user);
}

async function paypalTopupPackageForRequest(req, body = {}, user = null) {
  const tenant = requestTenantDescriptor(req);
  if (tenant.subscriptions) {
    return await toolTopupPackageForRequest(req, body);
  }
  return findTopupPackage(body, user);
}

