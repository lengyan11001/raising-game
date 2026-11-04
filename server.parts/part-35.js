async function paypalCheckoutSelectionForRequest(req, body = {}, user = null) {
  const tenant = requestTenantDescriptor(req);
  const billingPlanId = String(body.billingPlanId || body.billing_plan_id || body.planId || body.plan_id || "").trim();
  if (billingPlanId) {
    if (!tenant.subscriptions && !tenant.membershipProgram) return null;
    const plan = await getBillingPlanInDb(tenant.tenantId, billingPlanId);
    if (!plan || (tenant.membershipProgram && plan.id !== CREATOR_MEMBERSHIP_PLAN_ID)) return null;
    if (tenant.membershipProgram && user && userHasCreatorMembership(user)) {
      return { alreadyOwned: true, kind: "subscription", id: plan.id };
    }
    return {
      kind: "subscription",
      id: plan.id,
      amount: Number(plan.amount || 0),
      credits: creditsAmount(plan.includedCredits || 0),
      plan,
    };
  }
  const productId = String(body.productId || body.product_id || "").trim();
  if (productId === API_DOCS_PRODUCT_ID && tenant.membershipProgram) {
    if (user && userHasApiDocsAccess(user)) return { alreadyOwned: true, kind: "product", id: API_DOCS_PRODUCT_ID };
    return {
      kind: "product",
      id: API_DOCS_PRODUCT_ID,
      amount: API_DOCS_PRICE_USD,
      credits: API_DOCS_TEST_CREDITS,
      product: { id: API_DOCS_PRODUCT_ID, name: "API Documentation Access" },
    };
  }
  const topupPackage = await paypalTopupPackageForRequest(req, body, user);
  if (!topupPackage) return null;
  return {
    kind: "topup",
    id: topupPackage.id,
    amount: Number(topupPackage.amount || 0),
    credits: creditsAmount(topupPackage.credits || 0),
    topupPackage,
  };
}

function publicPayPalCheckoutSession(order = {}, config = {}, options = {}) {
  const publicOrder = publicTopupOrder(order, config.wallet, options);
  const createdMs = Date.parse(order.paypalCheckoutSessionCreatedAt || order.createdAt || "");
  const failureSummary = { issue: order.paypalErrorCode || "", name: order.paypalErrorCode || "" };
  return {
    id: String(order.id || ""),
    sessionId: String(order.paypalCheckoutSessionId || ""),
    status: String(order.paypalCheckoutSessionStatus || order.status || "pending"),
    paymentStatus: String(order.paypalStatus || ""),
    paypalOrderId: String(order.paypalOrderId || ""),
    approvalUrl: String(order.approvalUrl || ""),
    returnUrl: String(order.paypalReturnUrl || ""),
    cancelUrl: String(order.paypalCancelUrl || ""),
    expiresAt: Number.isFinite(createdMs) ? new Date(createdMs + PAYPAL_CHECKOUT_SESSION_TTL_MS).toISOString() : "",
    order: publicOrder,
    createdAt: String(order.paypalCheckoutSessionCreatedAt || order.createdAt || ""),
    startedAt: String(order.paypalCheckoutStartedAt || ""),
    errorCode: String(order.paypalErrorCode || ""),
    errorMessage: order.paypalErrorCode ? paypalPublicFailureMessage(failureSummary) : "",
    debugId: String(order.paypalDebugId || ""),
    errorAt: String(order.paypalErrorAt || ""),
  };
}

function paypalOrderBodyForCheckout(order = {}, { returnUrl = "", cancelUrl = "" } = {}) {
  const amountValue = paypalMoneyValue(order.baseAmount || 0);
  const purchaseUnit = {
    reference_id: order.id || order.paypalCheckoutSessionId || randomSecretToken("paypal"),
    custom_id: order.id || order.paypalCheckoutSessionId || "",
    description: order.orderKind === "subscription"
      ? `${PAYPAL_BRAND_NAME} ${order.billingPlanName || "subscription"}`
      : order.orderKind === "product"
        ? `${PAYPAL_BRAND_NAME} ${order.productName || "purchase"}`
        : `${PAYPAL_BRAND_NAME} credits`,
    amount: {
      currency_code: PAYPAL_CURRENCY,
      value: amountValue,
    },
  };
  if (order.paypalInvoiceId) purchaseUnit.invoice_id = String(order.paypalInvoiceId).slice(0, 127);
  return {
    intent: "CAPTURE",
    purchase_units: [purchaseUnit],
    payment_source: {
      paypal: {
        experience_context: {
          brand_name: PAYPAL_BRAND_NAME,
          landing_page: "LOGIN",
          shipping_preference: "NO_SHIPPING",
          user_action: "PAY_NOW",
          return_url: returnUrl || paypalCheckoutUrl("/paypal-return", { sid: order.paypalCheckoutSessionId || "" }),
          cancel_url: cancelUrl || paypalCheckoutUrl("/paypal-cancel", { sid: order.paypalCheckoutSessionId || "" }),
        },
      },
    },
  };
}

async function createAndStorePayPalOrder(req, auth, order, { returnUrl = "", cancelUrl = "", requestId = "" } = {}) {
  const paypalOrder = await paypalRequest("/v2/checkout/orders", {
    method: "POST",
    headers: {
      "paypal-request-id": requestId || order.id || randomId("paypal"),
    },
    body: paypalOrderBodyForCheckout(order, { returnUrl, cancelUrl }),
  });
  order.paypalOrderId = paypalOrder.id || order.paypalOrderId || "";
  order.paypalStatus = paypalOrder.status || order.paypalStatus || "";
  order.approvalUrl = findPayPalApprovalLink(paypalOrder);
  order.updatedAt = new Date().toISOString();
  auth.db.walletOrders.unshift(order);
  if (dbEnabled()) {
    await createWalletOrderInDb(order);
  } else {
    await writeDb(auth.db);
  }
  return paypalOrder;
}

async function createPayPalCheckoutSession(req, res) {
  const auth = await requireUser(req, res);
  if (!auth) return;
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
    const membership = selection.kind === "subscription";
    return sendJson(res, 409, {
      ok: false,
      code: membership ? "MEMBERSHIP_ALREADY_ACTIVE" : "PRODUCT_ALREADY_OWNED",
      message: membership ? "Creator Membership is already active." : "API documentation access is already active.",
    });
  }
  const rawAmount = selection.amount;
  if (!Number.isFinite(rawAmount) || rawAmount < PAYPAL_MIN_AMOUNT || rawAmount > PAYPAL_MAX_AMOUNT) {
    return sendJson(res, 400, {
      ok: false,
      message: `PayPal amount must be between ${PAYPAL_MIN_AMOUNT} and ${PAYPAL_MAX_AMOUNT} ${PAYPAL_CURRENCY}.`,
    });
  }
  if (!paypalEnabled()) {
    return sendJson(res, 503, { ok: false, code: "PAYPAL_NOT_CONFIGURED", message: "PayPal is not configured." });
  }

  const amountValue = paypalMoneyValue(rawAmount);
  const amount = Number(amountValue);
  const rate = paypalCnyCentsPerUnit(config.wallet);
  const sessionId = randomSecretToken("ppsid");
  const order = {
    id: randomId("paypal"),
    tenantId: tenantOptions.tenant?.tenantId || DEFAULT_TENANT_ID,
    userId: auth.user.id,
    paymentProvider: "paypal",
    orderKind: selection.kind,
    baseAmount: amount,
    creditAmount: selection.credits,
    packageId: selection.kind === "topup" ? selection.id : "",
    packageCredits: selection.credits,
    productId: selection.product?.id || "",
    productName: selection.product?.name || "",
    billingPlanId: selection.plan?.id || "",
    billingPlanName: selection.plan?.name || "",
    billingIntervalUnit: selection.plan?.intervalUnit || "",
    billingIntervalCount: selection.plan?.intervalCount || 0,
    creditsPerUsd: walletCreditsPerUsd(config.wallet),
    cnyCentsPerUnit: rate,
    currency: PAYPAL_CURRENCY,
    payableAmount: amount,
    payableAmountText: amountValue,
    asset: PAYPAL_CURRENCY,
    network: "PayPal",
    chain: "paypal",
    address: "",
    status: "pending",
    paypalCheckoutSessionId: sessionId,
    paypalCheckoutSessionStatus: "created",
    paypalCheckoutSessionCreatedAt: new Date().toISOString(),
    paypalReturnUrl: safePayPalReturnUrl(req, body.returnUrl || body.return_url || ""),
    paypalCancelUrl: safePayPalReturnUrl(req, body.cancelUrl || body.cancel_url || body.returnUrl || body.return_url || ""),
    sourceOrigin: pageOriginFromRequest(req),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  auth.db.walletOrders.unshift(order);
  if (dbEnabled()) {
    await createWalletOrderInDb(order);
  } else {
    await writeDb(auth.db);
  }
  return sendJson(res, 200, {
    ok: true,
    checkoutUrl: paypalCheckoutUrl("/", { sid: sessionId }),
    session: publicPayPalCheckoutSession(order, config, tenantOptions),
    order: publicTopupOrder(order, config.wallet, tenantOptions),
  });
}

async function handleCreatePayPalOrder(req, res) {
  const auth = await requireUser(req, res);
  if (!auth) return;
  const body = await readJson(req);
  const config = await readAppConfig();
  const tenantOptions = requestTenantOptions(req);
  const topupPackage = await paypalTopupPackageForRequest(req, body, auth.user);
  if (!topupPackage) {
    return sendJson(res, 400, {
      ok: false,
      code: "INVALID_TOPUP_PACKAGE",
      message: "Please select one of the available top-up packages.",
      packages: await paypalTopupPackagesForRequest(req, auth.user),
    });
  }
  const rawAmount = topupPackage.amount;
  if (!Number.isFinite(rawAmount) || rawAmount < PAYPAL_MIN_AMOUNT || rawAmount > PAYPAL_MAX_AMOUNT) {
    return sendJson(res, 400, {
      ok: false,
      message: `PayPal amount must be between ${PAYPAL_MIN_AMOUNT} and ${PAYPAL_MAX_AMOUNT} ${PAYPAL_CURRENCY}.`,
    });
  }
  if (!paypalEnabled()) {
    return sendJson(res, 503, { ok: false, code: "PAYPAL_NOT_CONFIGURED", message: "PayPal is not configured." });
  }

  const amountValue = paypalMoneyValue(rawAmount);
  const amount = Number(amountValue);
  const rate = paypalCnyCentsPerUnit(config.wallet);
  const localOrderId = randomId("paypal");
  const origin = publicOriginFromRequest(req);
  const order = {
    id: localOrderId,
    tenantId: tenantOptions.tenant?.tenantId || DEFAULT_TENANT_ID,
    userId: auth.user.id,
    paymentProvider: "paypal",
    orderKind: "topup",
    baseAmount: amount,
    creditAmount: creditsAmount(topupPackage.credits),
    packageId: topupPackage.id,
    packageCredits: topupPackage.credits,
    creditsPerUsd: walletCreditsPerUsd(config.wallet),
    cnyCentsPerUnit: rate,
    currency: PAYPAL_CURRENCY,
    payableAmount: amount,
    payableAmountText: amountValue,
    asset: PAYPAL_CURRENCY,
    network: "PayPal",
    chain: "paypal",
    address: "",
    status: "pending",
    paypalCheckoutSessionId: randomSecretToken("ppsid"),
    paypalCheckoutSessionStatus: "legacy-direct",
    paypalCheckoutSessionCreatedAt: new Date().toISOString(),
    paypalInvoiceId: localOrderId,
    paypalReturnUrl: safePayPalReturnUrl(req, body.returnUrl || body.return_url || ""),
    paypalCancelUrl: safePayPalReturnUrl(req, body.cancelUrl || body.cancel_url || body.returnUrl || body.return_url || ""),
    sourceOrigin: pageOriginFromRequest(req),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  await createAndStorePayPalOrder(req, auth, order, {
    requestId: localOrderId,
    returnUrl: `${origin}/#topups`,
    cancelUrl: `${origin}/#topups`,
  });
  return sendJson(res, 200, {
    ok: true,
    paypalOrderId: order.paypalOrderId,
    approvalUrl: order.approvalUrl,
    order: publicTopupOrder(order, config.wallet, tenantOptions),
  });
}

async function capturePayPalWalletOrder(db, order, config, { paypalOrderId = "" } = {}) {
  if (!order) {
    const error = new Error("PayPal order not found.");
    error.statusCode = 404;
    throw error;
  }
  const expectedPaypalOrderId = String(order.paypalOrderId || "").trim();
  const requestedPaypalOrderId = String(paypalOrderId || expectedPaypalOrderId || "").trim();
  if (!expectedPaypalOrderId && requestedPaypalOrderId) order.paypalOrderId = requestedPaypalOrderId;
  if (expectedPaypalOrderId && requestedPaypalOrderId && expectedPaypalOrderId !== requestedPaypalOrderId) {
    const error = new Error("PayPal order mismatch.");
    error.statusCode = 409;
    throw error;
  }
  const orderIdForCapture = String(order.paypalOrderId || requestedPaypalOrderId || "").trim();
  if (!orderIdForCapture) {
    const error = new Error("PayPal order is missing.");
    error.statusCode = 409;
    throw error;
  }
  if (order.status === "paid") {
    return { order, user: (db.users || []).find((u) => u.id === order.userId) || null, capturePayload: null, capture: null };
  }

  let capturePayload;
  try {
    capturePayload = await paypalRequest(`/v2/checkout/orders/${encodeURIComponent(orderIdForCapture)}/capture`, {
      method: "POST",
      headers: {
        "paypal-request-id": `${order.id}-capture`,
      },
      body: {},
    });
  } catch (error) {
    if (error.statusCode !== 422) throw error;
    capturePayload = await paypalRequest(`/v2/checkout/orders/${encodeURIComponent(orderIdForCapture)}`);
  }

  const capture = paypalCaptureFromOrder(capturePayload);
  order.paypalStatus = capturePayload.status || capture?.status || order.paypalStatus || "";
  order.paypalCaptureId = capture?.id || order.paypalCaptureId || "";
  order.paypalPayerId = capturePayload.payer?.payer_id || order.paypalPayerId || "";
  order.paypalPayerEmail = capturePayload.payer?.email_address || order.paypalPayerEmail || "";
  order.updatedAt = new Date().toISOString();

  const completed = String(capturePayload.status || "").toUpperCase() === "COMPLETED" ||
    String(capture?.status || "").toUpperCase() === "COMPLETED";
  if (!completed) {
    await updateWalletOrderInDb(order);
    if (!dbEnabled()) await writeDb(db);
    const error = new Error("PayPal payment is not completed yet.");
    error.statusCode = 409;
    error.code = "PAYPAL_NOT_COMPLETED";
    error.order = order;
    throw error;
  }

  const capturedAmount = Number(capture?.amount?.value || 0);
  const capturedCurrency = String(capture?.amount?.currency_code || PAYPAL_CURRENCY).toUpperCase();
  if (capturedCurrency !== PAYPAL_CURRENCY || Math.abs(capturedAmount - Number(order.baseAmount || 0)) > 0.009) {
    order.status = "pending";
    order.note = "PayPal capture amount mismatch. Manual review required.";
    await updateWalletOrderInDb(order);
    if (!dbEnabled()) await writeDb(db);
    const error = new Error("PayPal payment amount does not match the top-up order.");
    error.statusCode = 409;
    error.code = "PAYPAL_AMOUNT_MISMATCH";
    error.order = order;
    throw error;
  }

  const { user } = await settleWalletOrderPayment(db, order, config, {
    paypalCaptureId: order.paypalCaptureId,
    paypalPayerEmail: order.paypalPayerEmail,
    paypalStatus: order.paypalStatus,
  });
  order.paypalCheckoutSessionStatus = "paid";
  await updateWalletOrderInDb(order);
  if (!dbEnabled()) await writeDb(db);
  return { order, user, capturePayload, capture };
}

async function handleCapturePayPalOrder(req, res, paypalOrderId) {
  const auth = await requireUser(req, res);
  if (!auth) return;
  const config = await readAppConfig();
  const tenantOptions = requestTenantOptions(req);
  const order = await getWalletOrderByPaypalIdInDb(paypalOrderId) || (auth.db.walletOrders || []).find((entry) => (
    entry.userId === auth.user.id &&
    entry.paymentProvider === "paypal" &&
    entry.paypalOrderId === paypalOrderId
  ));
  if (!order) return sendJson(res, 404, { ok: false, message: "PayPal order not found." });
  if (String(order.userId || "") !== String(auth.user.id || "")) {
    return sendJson(res, 403, { ok: false, message: "PayPal order not found." });
  }
  if (order.status === "paid") {
    return sendJson(res, 200, { ok: true, order: publicTopupOrder(order, config.wallet, tenantOptions), user: userView(auth.user) });
  }

  try {
    const result = await capturePayPalWalletOrder(auth.db, order, config, { paypalOrderId });
    return sendJson(res, 200, { ok: true, order: publicTopupOrder(result.order, config.wallet, tenantOptions), user: userView(result.user) });
  } catch (error) {
    if (error.code === "PAYPAL_NOT_COMPLETED" || error.code === "PAYPAL_AMOUNT_MISMATCH") {
      return sendJson(res, error.statusCode || 409, {
        ok: false,
        code: error.code,
        message: error.message,
        order: publicTopupOrder(error.order || order, config.wallet, tenantOptions),
      });
    }
    throw error;
  }
}

async function handlePayPalCheckoutSessionDetails(req, res, sessionId) {
  const config = await readAppConfig();
  const tenantOptions = requestTenantOptions(req);
  const order = await readDb().then((db) => findPayPalCheckoutSessionOrder(db, sessionId));
  if (!order) return sendJson(res, 404, { ok: false, message: "PayPal checkout session not found." });
  return sendJson(res, 200, {
    ok: true,
    session: publicPayPalCheckoutSession(order, config, tenantOptions),
  });
}

async function handleStartPayPalCheckoutSession(req, res, sessionId) {
  const body = await readJson(req);
  const config = await readAppConfig();
  const tenantOptions = requestTenantOptions(req);
  const db = await readDb();
  const order = findPayPalCheckoutSessionOrder(db, sessionId);
  if (!order) return sendJson(res, 404, { ok: false, message: "PayPal checkout session not found." });
  if (paypalCheckoutSessionExpired(order) && !order.paypalOrderId && order.status !== "paid") {
    order.paypalCheckoutSessionStatus = "expired";
    order.note = "PayPal checkout session expired before start.";
    order.updatedAt = new Date().toISOString();
    await updateWalletOrderInDb(order);
    if (!dbEnabled()) await writeDb(db);
    return sendJson(res, 410, {
      ok: false,
      code: "PAYPAL_CHECKOUT_EXPIRED",
      message: "This payment session has expired. Please create a new top-up order.",
      session: publicPayPalCheckoutSession(order, config, tenantOptions),
    });
  }
  if (order.status === "paid") {
    return sendJson(res, 200, {
      ok: true,
      approvalUrl: "",
      session: publicPayPalCheckoutSession(order, config, tenantOptions),
    });
  }
  if (order.approvalUrl && order.paypalOrderId) {
    return sendJson(res, 200, {
      ok: true,
      approvalUrl: order.approvalUrl,
      session: publicPayPalCheckoutSession(order, config, tenantOptions),
    });
  }
  if (!paypalEnabled()) {
    return sendJson(res, 503, { ok: false, code: "PAYPAL_NOT_CONFIGURED", message: "PayPal is not configured." });
  }
  const checkoutAttempt = Number(order.paypalCheckoutAttempt || 0) || 0;
  order.paypalInvoiceId = `${order.id}-${checkoutAttempt}`;
  let paypalOrder;
  try {
    paypalOrder = order.paypalOrderId
      ? await paypalRequest(`/v2/checkout/orders/${encodeURIComponent(order.paypalOrderId)}`)
      : await paypalRequest("/v2/checkout/orders", {
          method: "POST",
          headers: {
            "paypal-request-id": `${order.id}-${order.paypalCheckoutSessionId}-${checkoutAttempt}`,
          },
          body: paypalOrderBodyForCheckout(order),
        });
  } catch (error) {
    const summary = paypalErrorSummary(error.details, error.statusCode);
    const now = new Date().toISOString();
    order.paypalCheckoutAttempt = checkoutAttempt + 1;
    order.paypalCheckoutSessionStatus = "failed";
    order.paypalErrorCode = summary.issue || summary.name || error.code || "PAYPAL_REQUEST_FAILED";
    order.paypalErrorDescription = summary.description || error.message || "PayPal request failed.";
    order.paypalErrorField = summary.field;
    order.paypalDebugId = summary.debugId;
    order.paypalErrorHttpStatus = summary.httpStatus || error.statusCode || 502;
    order.paypalErrorAt = now;
    order.note = `PayPal checkout failed: ${order.paypalErrorCode}`.slice(0, 200);
    order.updatedAt = now;
    await updateWalletOrderInDb(order);
    if (!dbEnabled()) await writeDb(db);
    console.error("[paypal-checkout-create-failed]", {
      orderId: order.id,
      sessionId: order.paypalCheckoutSessionId,
      attempt: checkoutAttempt,
      ...summary,
    });
    return sendJson(res, error.statusCode || 502, {
      ok: false,
      code: order.paypalErrorCode,
      message: paypalPublicFailureMessage(summary),
      debugId: summary.debugId,
      session: publicPayPalCheckoutSession(order, config, tenantOptions),
    });
  }
  order.paypalOrderId = paypalOrder.id || order.paypalOrderId || "";
  order.approvalUrl = findPayPalApprovalLink(paypalOrder);
  order.paypalStatus = paypalOrder.status || order.paypalStatus || "";
  order.paypalCheckoutSessionStatus = "started";
  order.paypalErrorCode = "";
  order.paypalErrorDescription = "";
  order.paypalErrorField = "";
  order.paypalDebugId = "";
  order.paypalErrorHttpStatus = 0;
  order.paypalErrorAt = "";
  order.paypalCheckoutStartedAt = new Date().toISOString();
  order.updatedAt = new Date().toISOString();
  await updateWalletOrderInDb(order);
  if (!dbEnabled()) await writeDb(db);
  return sendJson(res, 200, {
    ok: true,
    approvalUrl: order.approvalUrl,
    session: publicPayPalCheckoutSession(order, config, tenantOptions),
  });
}

async function handlePayPalCheckoutReturn(req, res, url) {
  const sid = String(url.searchParams.get("sid") || "").trim();
  const paypalOrderId = String(url.searchParams.get("token") || url.searchParams.get("orderID") || "").trim();
  const payerId = String(url.searchParams.get("PayerID") || "").trim();
  if (!sid) {
    res.writeHead(302, { location: paypalCheckoutUrl("/", { status: "error" }), "cache-control": "no-store" });
    return res.end();
  }
  const config = await readAppConfig();
  const db = await readDb();
  const order = findPayPalCheckoutSessionOrder(db, sid);
  if (!order) {
    res.writeHead(302, { location: paypalCheckoutUrl("/", { sid, status: "missing" }), "cache-control": "no-store" });
    return res.end();
  }
  if (paypalOrderId && !order.paypalOrderId) order.paypalOrderId = paypalOrderId;
  if (paypalOrderId && order.paypalOrderId && order.paypalOrderId !== paypalOrderId) {
    res.writeHead(302, { location: paypalCheckoutUrl("/", { sid, status: "error", code: "paypal-order-mismatch" }), "cache-control": "no-store" });
    return res.end();
  }
  if (!order.paypalOrderId && !payerId) {
    res.writeHead(302, { location: paypalCheckoutUrl("/", { sid, status: "error", code: "missing-token" }), "cache-control": "no-store" });
    return res.end();
  }
  try {
    const result = await capturePayPalWalletOrder(db, order, config, { paypalOrderId: order.paypalOrderId || paypalOrderId });
    const redirectUrl = paypalCheckoutUrl("/", {
      sid,
      status: "paid",
      order: result.order.id || order.id || "",
      paypal: result.order.paypalOrderId || "",
    });
    res.writeHead(302, { location: redirectUrl, "cache-control": "no-store" });
    return res.end();
  } catch (error) {
    const code = String(error.code || error.message || "error").toLowerCase().replace(/\s+/g, "-").slice(0, 64);
    const redirectUrl = paypalCheckoutUrl("/", {
      sid,
      status: "error",
      code,
    });
    res.writeHead(302, { location: redirectUrl, "cache-control": "no-store" });
    return res.end();
  }
}

async function handlePayPalCheckoutCancel(req, res, url) {
  const sid = String(url.searchParams.get("sid") || "").trim();
  if (sid) {
    const db = await readDb();
    const order = findPayPalCheckoutSessionOrder(db, sid);
    if (order && order.status !== "paid") {
      order.paypalCheckoutSessionStatus = "cancelled";
      order.paypalStatus = "CANCELLED";
      order.paypalOrderId = "";
      order.paypalInvoiceId = "";
      order.paypalCheckoutAttempt = (Number(order.paypalCheckoutAttempt || 0) || 0) + 1;
      order.approvalUrl = "";
      order.note = order.note || "PayPal checkout cancelled.";
      order.updatedAt = new Date().toISOString();
      await updateWalletOrderInDb(order);
      if (!dbEnabled()) await writeDb(db);
    }
  }
  const redirectUrl = paypalCheckoutUrl("/", sid ? { sid, status: "cancelled" } : { status: "cancelled" });
  res.writeHead(302, { location: redirectUrl, "cache-control": "no-store" });
  return res.end();
}

async function verifyPayPalWebhookEvent(req, event) {
  if (!PAYPAL_WEBHOOK_ID || !paypalEnabled()) return false;
  const payload = await paypalRequest("/v1/notifications/verify-webhook-signature", {
    method: "POST",
    body: {
      auth_algo: String(req.headers["paypal-auth-algo"] || ""),
      cert_url: String(req.headers["paypal-cert-url"] || ""),
      transmission_id: String(req.headers["paypal-transmission-id"] || ""),
      transmission_sig: String(req.headers["paypal-transmission-sig"] || ""),
      transmission_time: String(req.headers["paypal-transmission-time"] || ""),
      webhook_id: PAYPAL_WEBHOOK_ID,
      webhook_event: event,
    },
  });
  return payload.verification_status === "SUCCESS";
}

function findWalletOrderForPayPalEvent(db, event = {}) {
  const resource = event.resource || {};
  const relatedOrderId = resource.supplementary_data?.related_ids?.order_id || "";
  const captureId = String(event.event_type || "").startsWith("PAYMENT.CAPTURE.") ? resource.id : "";
  const candidateIds = [
    resource.custom_id,
    resource.invoice_id,
    relatedOrderId,
    String(event.event_type || "").startsWith("CHECKOUT.ORDER.") ? resource.id : "",
  ].filter(Boolean).map(String);
  return (db.walletOrders || []).find((order) => {
    if (captureId && order.paypalCaptureId === captureId) return true;
    if (candidateIds.includes(order.id)) return true;
    if (order.paypalOrderId && candidateIds.includes(order.paypalOrderId)) return true;
    return false;
  }) || null;
}

async function applyPayPalWebhookToOrder(db, event, config) {
  const type = String(event.event_type || "");
  const resource = event.resource || {};
  const order = findWalletOrderForPayPalEvent(db, event);
  if (!order) return false;
  order.updatedAt = new Date().toISOString();
  if (type === "PAYMENT.CAPTURE.COMPLETED") {
    const amount = Number(resource.amount?.value || 0);
    const currency = String(resource.amount?.currency_code || order.currency || "").toUpperCase();
    if (currency !== String(order.currency || PAYPAL_CURRENCY).toUpperCase() || Math.abs(amount - Number(order.baseAmount || 0)) > 0.009) {
      order.status = "pending";
      order.paypalStatus = resource.status || type;
      order.note = "PayPal webhook amount mismatch. Manual review required.";
      return true;
    }
    await safeSettleWalletOrderPayment(db, order, config, {
      paypalCaptureId: resource.id || order.paypalCaptureId,
      paypalStatus: resource.status || "COMPLETED",
      note: "Paid by PayPal webhook.",
    });
    return true;
  }
  if (type === "CHECKOUT.ORDER.COMPLETED") {
    const capture = paypalCaptureFromOrder(resource);
    const amount = Number(capture?.amount?.value || order.baseAmount || 0);
    const currency = String(capture?.amount?.currency_code || order.currency || "").toUpperCase();
    if (currency !== String(order.currency || PAYPAL_CURRENCY).toUpperCase() || Math.abs(amount - Number(order.baseAmount || 0)) > 0.009) {
      order.status = "pending";
      order.paypalStatus = resource.status || capture?.status || type;
      order.note = "PayPal webhook amount mismatch. Manual review required.";
      return true;
    }
    await safeSettleWalletOrderPayment(db, order, config, {
      paypalCaptureId: capture?.id || order.paypalCaptureId,
      paypalPayerEmail: resource.payer?.email_address || order.paypalPayerEmail,
      paypalStatus: resource.status || capture?.status || "COMPLETED",
      note: "Paid by PayPal webhook.",
    });
    return true;
  }
  if (["PAYMENT.CAPTURE.DENIED", "CHECKOUT.ORDER.VOIDED"].includes(type) && order.status !== "paid") {
    order.status = "cancelled";
    order.paypalStatus = resource.status || type;
    order.note = order.note || `PayPal event: ${type}`;
    return true;
  }
  return false;
}

async function handlePayPalWebhook(req, res) {
  let event;
  try {
    const raw = await readRawBody(req);
    event = raw ? JSON.parse(raw) : {};
  } catch {
    return sendJson(res, 400, { ok: false, message: "Invalid PayPal webhook body." });
  }
  if (!PAYPAL_WEBHOOK_ID || !paypalEnabled()) {
    return sendJson(res, 200, { ok: true, ignored: true, reason: "PayPal webhook is not configured." });
  }
  const verified = await verifyPayPalWebhookEvent(req, event);
  if (!verified) return sendJson(res, 400, { ok: false, message: "PayPal webhook verification failed." });
  const db = await readDb();
  const config = await readAppConfig();
  const changed = await applyPayPalWebhookToOrder(db, event, config);
  if (changed) {
    if (dbEnabled()) {
      const order = findWalletOrderForPayPalEvent(db, event);
      if (order) await updateWalletOrderInDb(order);
    } else {
      await writeDb(db);
    }
  }
  return sendJson(res, 200, { ok: true, handled: changed });
}

function pagingFromUrl(url, { defaultLimit = 12, maxLimit = 100 } = {}) {
  const page = Math.max(1, Number.parseInt(url.searchParams.get("page") || "1", 10) || 1);
  const limit = Math.min(maxLimit, Math.max(1, Number.parseInt(url.searchParams.get("limit") || String(defaultLimit), 10) || defaultLimit));
  return { page, limit, offset: (page - 1) * limit };
}

function pagedResponse(list = [], paging = {}) {
  const requestedPage = Math.max(1, Number(paging.page || 1) || 1);
  const limit = Math.max(1, Number(paging.limit || 20) || 20);
  const total = Array.isArray(list) ? list.length : 0;
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const page = Math.min(requestedPage, totalPages);
  const offset = (page - 1) * limit;
  return {
    page,
    limit,
    total,
    totalPages,
    items: Array.isArray(list) ? list.slice(offset, offset + limit) : [],
  };
}

function dateFromQuery(value, endOfDay = false) {
  const text = String(value || "").trim();
  if (!text) return null;
  const normalized = /^\d{4}-\d{2}-\d{2}$/.test(text)
    ? `${text}T${endOfDay ? "23:59:59.999" : "00:00:00.000"}Z`
    : text;
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? null : date;
}

function shanghaiCurrentMonthRange(now = new Date()) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
  }).formatToParts(now).map((part) => [part.type, part.value]));
  const year = Number(parts.year);
  const month = Number(parts.month);
  const start = new Date(Date.UTC(year, month - 1, 1) - 8 * 60 * 60 * 1000);
  const end = new Date(Date.UTC(year, month, 1) - 8 * 60 * 60 * 1000);
  return { from: start.toISOString(), to: end.toISOString() };
}

function spendingMonthlySummaryFromEntries(entries = [], range = {}) {
  const from = Date.parse(range.from || "") || 0;
  const to = Date.parse(range.to || "") || Number.POSITIVE_INFINITY;
  let chatCredits = 0;
  let giftCredits = 0;
  for (const entry of entries) {
    const type = String(entry.type || "");
    if (!type.startsWith("character_chat") && !type.startsWith("chat_live")) continue;
    const at = Date.parse(entry.createdAt || "");
    if (Number.isFinite(at) && (at < from || at >= to)) continue;
    const amount = -Number(entry.delta || 0);
    if (!Number.isFinite(amount) || amount <= 0) continue;
    if (/gift/i.test(type)) giftCredits += amount;
    else chatCredits += amount;
  }
  return { chatCredits: creditsAmount(Math.max(0, chatCredits)), giftCredits: creditsAmount(Math.max(0, giftCredits)) };
}

function recordInDateRange(createdAt, fromDate, toDate) {
  const date = new Date(createdAt || "");
  if (Number.isNaN(date.getTime())) return true;
  if (fromDate && date < fromDate) return false;
  if (toDate && date > toDate) return false;
  return true;
}

function publicTopupOrder(order = {}, wallet = {}, options = {}) {
  const paymentProvider = order.paymentProvider || (order.network === "PayPal" ? "paypal" : "manual");
  const creditsPerUsd = order.creditsPerUsd || walletCreditsPerUsd(wallet);
  const cnyCentsPerUsdt = order.cnyCentsPerUsdt || walletCnyCentsPerUsdt(wallet);
  const cnyCentsPerUnit = order.cnyCentsPerUnit || (paymentProvider === "paypal" ? paypalCnyCentsPerUnit(wallet) : cnyCentsPerUsdt);
  const creditAmount = order.creditAmount ?? (
    order.packageCredits !== undefined
      ? creditsAmount(order.packageCredits)
      : order.baseAmount
      ? creditsAmount(Number(order.baseAmount || 0) * creditsPerUsd)
      : 0
  );
  const walletOption = findWalletOption(wallet, order.walletOptionId || order.network, options);
  return {
    id: order.id || "",
    tenantId: order.tenantId || DEFAULT_TENANT_ID,
    orderKind: order.orderKind || "topup",
    billingPlanId: order.billingPlanId || "",
    billingPlanName: order.billingPlanName || "",
    productId: order.productId || "",
    productName: order.productName || "",
    paymentProvider,
    amount: order.baseAmount ?? "",
    creditAmount: creditsAmount(creditAmount),
    packageId: order.packageId || "",
    packageCredits: order.packageCredits ?? "",
    creditsPerUsd,
    payableAmount: order.payableAmount ?? "",
    payableAmountText: order.payableAmountText || String(order.payableAmount || order.baseAmount || ""),
    asset: order.asset || order.currency || "USDT",
    currency: order.currency || order.asset || "",
    walletOptionId: order.walletOptionId || "",
    network: order.network || "",
    chain: order.chain || normalizeWalletChain(order.network || ""),
    address: order.address || "",
    qrUrl: order.qrUrl || walletOption?.qrUrl || wallet.qrUrl || "",
    explorerUrl: order.explorerUrl || walletOption?.explorerUrl || "",
    status: order.status || "pending",
    transactionHash: order.transactionHash || order.txHash || "",
    confirmations: Number(order.confirmations || 0),
    blockNumber: order.blockNumber || "",
    matchedAt: order.matchedAt || "",
    matchedAmountText: order.matchedAmountText || "",
    scanSource: order.scanSource || "",
    matched: Boolean(order.matched || order.transactionHash || order.txHash),
    confirmationHash: order.confirmationHash || "",
    confirmationSubmittedAt: order.confirmationSubmittedAt || "",
    paypalOrderId: order.paypalOrderId || "",
    paypalCaptureId: order.paypalCaptureId || "",
    paypalStatus: order.paypalStatus || "",
    stripeCheckoutSessionId: order.stripeCheckoutSessionId || "",
    stripePaymentIntentId: order.stripePaymentIntentId || "",
    stripePaymentStatus: order.stripePaymentStatus || "",
    cashierHost: String(order.paymentProvider || "").toLowerCase() === "stripe" ? stripeCashierHostForOrder(order) : "",
    createdAt: order.createdAt || "",
    paidAt: order.paidAt || "",
    note: order.note || "",
  };
}

function ledgerInstant(value) {
  if (!value) return "";
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString();
  const text = String(value).trim();
  let normalized = text.includes("T") ? text : text.replace(" ", "T");
  normalized = normalized.replace(/([+-]\d{2})(\d{2})$/, "$1:$2").replace(/([+-]\d{2})$/, "$1:00");
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? text : date.toISOString();
}

function publicSpendingLedger(entry = {}) {
  const meta = entry.meta && typeof entry.meta === "object" ? entry.meta : {};
  const amount = Math.abs(Number(entry.delta || 0));
  return {
    id: entry.id || "",
    amount: creditsAmount(amount),
    delta: Number(entry.delta || 0),
    balanceAfter: creditsAmount(entry.balanceAfter || 0),
    type: entry.type || "",
    title: /gift/i.test(entry.type || "") ? (meta.giftName || meta.label || "礼物") : (/character_chat/i.test(entry.type || "") ? (meta.characterName ? `文字对话 · ${meta.characterName}` : "文字对话") : (meta.characterName ? `视频聊天 · ${meta.characterName}` : (meta.templateTitle || meta.caseTitle || meta.sceneName || meta.label || meta.source || entry.type || ""))),
    conversationId: meta.conversationId || "",
    characterName: meta.characterName || "",
    characterId: meta.characterId || "",
    giftName: meta.giftName || "",
    giftCount: Number(meta.count || meta.quantity || meta.giftCount || 0) || 0,
    portraitUrl: meta.portraitUrl || "",
    sessionId: meta.sessionId || meta.taskId || "",
    taskId: meta.sessionId || meta.taskId || "",
    endedAt: ledgerInstant(meta.endedAt || ""),
    startedAt: ledgerInstant(meta.startedAt || ""),
    templateId: meta.templateId || meta.caseId || "",
    provider: meta.provider || "",
    resolution: meta.resolution || "",
    duration: meta.duration || "",
    createdAt: ledgerInstant(entry.createdAt || ""),
  };
}

function billingQueryFilters(url) {
  return {
    q: String(url.searchParams.get("q") || "").trim().toLowerCase(),
    status: String(url.searchParams.get("status") || "").trim().toLowerCase(),
    type: String(url.searchParams.get("type") || "").trim().toLowerCase(),
    fromDate: dateFromQuery(url.searchParams.get("from"), false),
    toDate: dateFromQuery(url.searchParams.get("to"), true),
    exportCsv: String(url.searchParams.get("export") || "").toLowerCase() === "csv",
  };
}

async function handleListTopupRecords(req, res, url) {
  const exportRequested = String(url?.searchParams?.get("export") || "").toLowerCase() === "csv";
  const auth = await requireUser(req, res, { loadDb: exportRequested });
  if (!auth) return;
  const config = await readAppConfig();
  const tenantOptions = requestTenantOptions(req);
  const { page, limit, offset } = pagingFromUrl(url, { defaultLimit: 12, maxLimit: 200 });
  const { q, status, fromDate, toDate, exportCsv } = billingQueryFilters(url);
  if (dbEnabled() && !exportCsv) {
    const result = await getUserWalletOrdersPageFromDb({ userId: auth.user.id, page, limit, queryText: q, status, fromDate, toDate });
    if (result) {
      const records = result.items.map((order) => publicTopupOrder(order, config.wallet, tenantOptions));
      return sendJson(res, 200, { ok: true, records, total: result.total, page: result.page, limit: result.limit, totalPages: result.totalPages, user: userView(auth.user) });
    }
  }
  const records = (auth.db.walletOrders || [])
    .filter((order) => order.userId === auth.user.id)
    .map((order) => publicTopupOrder(order, config.wallet, tenantOptions))
    .filter((order) => {
      if (status && String(order.status || "").toLowerCase() !== status) return false;
      if (!recordInDateRange(order.createdAt, fromDate, toDate)) return false;
      if (!q) return true;
      return [order.id, order.payableAmountText, order.asset, order.network, order.status, order.note, order.paymentProvider, order.paypalOrderId]
        .some((value) => String(value || "").toLowerCase().includes(q));
    });

  if (exportCsv) {
    const rows = records.map((order) => ({
      id: order.id,
      provider: order.paymentProvider,
      status: order.status,
      amount: order.amount,
      payableAmount: order.payableAmountText || order.payableAmount,
      asset: order.asset,
      network: order.network,
      paypalOrderId: order.paypalOrderId,
      credits: order.creditAmount,
      createdAt: order.createdAt,
      paidAt: order.paidAt,
      note: order.note,
    }));
    return sendCsv(res, "topup-records.csv", csvRows([
      { key: "id", label: "Order ID" },
      { key: "provider", label: "Provider" },
      { key: "status", label: "Status" },
      { key: "amount", label: "Amount" },
      { key: "payableAmount", label: "Payable Amount" },
      { key: "asset", label: "Asset" },
      { key: "network", label: "Network" },
      { key: "paypalOrderId", label: "PayPal Order ID" },
      { key: "credits", label: "Credits" },
      { key: "createdAt", label: "Created At" },
      { key: "paidAt", label: "Paid At" },
      { key: "note", label: "Note" },
    ], rows));
  }

  return sendJson(res, 200, {
    ok: true,
    records: records.slice(offset, offset + limit),
    total: records.length,
    page,
    limit,
    totalPages: Math.max(1, Math.ceil(records.length / limit)),
    user: userView(auth.user),
  });
}

function groupChatLiveSpendingEntries(entries = []) {
  const others = [];
  const groups = new Map();
  for (const entry of entries) {
    const type = String(entry.type || "");
    if (!type.startsWith("chat_live")) {
      if (Number(entry.delta || 0) < 0) others.push(entry);
      continue;
    }
    const meta = entry.meta && typeof entry.meta === "object" ? entry.meta : {};
    const taskId = String(meta.taskId || "");
    const key = String(meta.sessionId || taskId.replace(/:(hold|hold-refund):.*$/i, "") || entry.id);
    const at = Date.parse(entry.createdAt || "") || 0;
    const current = groups.get(key) || {
      id: key,
      userId: entry.userId,
      delta: 0,
      balanceAfter: entry.balanceAfter,
      type: "chat_live",
      meta: { taskId: key, sessionId: key, label: "视频聊天", characterName: meta.characterName || "" },
      createdAt: entry.createdAt || "",
      _start: at,
      _end: at,
    };
    current.delta += Number(entry.delta || 0);
    if (at && (!current._end || at >= current._end)) {
      current._end = at;
      current.balanceAfter = entry.balanceAfter;
    }
    if (at && (!current._start || at < current._start)) {
      current._start = at;
      current.createdAt = entry.createdAt || current.createdAt;
    }
    if (meta.characterName) current.meta.characterName = meta.characterName;
    groups.set(key, current);
  }
  const grouped = [...groups.values()].filter((entry) => entry.delta < -0.0001).map((entry) => {
    entry.meta.startedAt = entry.createdAt;
    entry.meta.endedAt = entry._end ? new Date(entry._end).toISOString() : entry.createdAt;
    entry.meta.duration = entry._start && entry._end ? Math.max(0, Math.round((entry._end - entry._start) / 1000)) : "";
    delete entry._start;
    delete entry._end;
    return entry;
  });
  return [...grouped, ...others];
}

async function handleListSpendingRecords(req, res, url) {
  const exportRequested = String(url?.searchParams?.get("export") || "").toLowerCase() === "csv";
  const auth = await requireUser(req, res, { loadDb: exportRequested });
  if (!auth) return;
  // The monthly wallet summary belongs to Vipeak Live only. The platform and
  // tool tenants share this backend process, so additive live-only fields must
  // never leak into their billing responses.
  const liveTenant = requestTenantDescriptor(req).toolId === "live";
  const { page, limit, offset } = pagingFromUrl(url, { defaultLimit: 12, maxLimit: 200 });
  const { q, type, fromDate, toDate, exportCsv } = billingQueryFilters(url);
  const monthRange = shanghaiCurrentMonthRange();
  if (dbEnabled() && !exportCsv) {
    const result = await getUserSpendingRecordsPageFromDb({ userId: auth.user.id, page, limit, queryText: q, type, fromDate, toDate });
    const monthlySummary = liveTenant ? await getSpendingMonthlySummaryFromDb({ userId: auth.user.id, fromDate: monthRange.from, toDate: monthRange.to }) : null;
    if (result) {
      const payload = { ok: true, records: result.items.map(publicSpendingLedger), total: result.total, page: result.page, limit: result.limit, totalPages: result.totalPages, types: result.types, user: userView(auth.user) };
      if (liveTenant) payload.monthlySummary = monthlySummary;
      return sendJson(res, 200, payload);
    }
  }
  const rawRecords = (auth.db.creditLedger || []).filter((entry) => entry.userId === auth.user.id);
  const monthlySummary = liveTenant ? spendingMonthlySummaryFromEntries(rawRecords, monthRange) : null;
  const records = groupChatLiveSpendingEntries(rawRecords)
    .map(publicSpendingLedger)
    .filter((entry) => {
      if (type && String(entry.type || "").toLowerCase() !== type) return false;
      if (!recordInDateRange(entry.createdAt, fromDate, toDate)) return false;
      if (!q) return true;
      return [entry.id, entry.type, entry.title, entry.taskId, entry.templateId, entry.provider, entry.resolution]
        .some((value) => String(value || "").toLowerCase().includes(q));
    });

  const types = Array.from(new Set((auth.db.creditLedger || [])
    .filter((entry) => entry.userId === auth.user.id && Number(entry.delta || 0) < 0)
    .map((entry) => String(entry.type || "").trim())
    .filter(Boolean))).sort();

  if (exportCsv) {
    const rows = records.map((entry) => ({
      id: entry.id,
      type: entry.type,
      title: entry.title,
      amount: entry.amount,
      balanceAfter: entry.balanceAfter,
      taskId: entry.taskId,
      provider: entry.provider,
      resolution: entry.resolution,
      duration: entry.duration,
      createdAt: entry.createdAt,
    }));
    return sendCsv(res, "spending-records.csv", csvRows([
      { key: "id", label: "Ledger ID" },
      { key: "type", label: "Type" },
      { key: "title", label: "Title" },
      { key: "amount", label: "Credits Spent" },
      { key: "balanceAfter", label: "Balance After" },
      { key: "taskId", label: "Task ID" },
      { key: "provider", label: "Provider" },
      { key: "resolution", label: "Resolution" },
      { key: "duration", label: "Duration" },
      { key: "createdAt", label: "Created At" },
    ], rows));
  }

  const payload = {
    ok: true,
    records: records.slice(offset, offset + limit),
    total: records.length,
    page,
    limit,
    totalPages: Math.max(1, Math.ceil(records.length / limit)),
    types,
    user: userView(auth.user),
  };
  if (liveTenant) payload.monthlySummary = monthlySummary;
  return sendJson(res, 200, payload);
}

async function handleSpendCredits(req, res) {
  const auth = await requireUser(req, res);
  if (!auth) return;
  const body = await readJson(req);
  const cost = clampNumber(body.cost, 0, 0, 9999);
  if (cost <= 0) return sendJson(res, 400, { ok: false, message: "Spend amount is invalid." });
  if (auth.user.credits < cost) {
    return sendJson(res, 402, insufficientCreditsPayload(cost, auth.user.credits));
  }
  try {
    assertSubtokenCanSpend(auth, cost);
  } catch (error) {
    return sendJson(res, error.statusCode || 402, error.payload || { ok: false, code: error.code || "SUBTOKEN_UNAVAILABLE", message: error.message });
  }
  await chargeUserWithSubtoken(auth, {
    cost,
    type: "spend",
    taskId: randomId("spend"),
    meta: { label: String(body.label || "") },
  });
  if (!dbEnabled()) await writeDb(auth.db);
  return sendJson(res, 200, { ok: true, user: userView(auth.user), cost, label: String(body.label || "") });
}

async function handleListUnlocks(req, res) {
  const auth = await requireUser(req, res);
  if (!auth) return;
  const unlocks = (auth.db.userUnlocks || [])
    .filter((record) => record.userId === auth.user.id && !isSoftDeleted(record))
    .map(publicUserUnlock);
  return sendJson(res, 200, { ok: true, unlocks });
}

async function handleGameFeed(req, res) {
  let config = await readAppConfig();
  config = await ensureSceneEntriesPersisted(config);
  config = await refreshCompletedHomeVideoItems(config);
  const auth = await getAuth(req, { loadDb: false });
  const publicView = await attachBillingViewToPublicConfig(
    publicConfig(config, publicOriginFromRequest(req), auth?.user ? auth : null, requestTenantOptions(req)),
    req,
    auth?.user ? auth : null,
  );
  const homeVideo = normalizeHomeVideo(config.homeVideo || {});
  const items = publicAssetUrlsForClient(homeVideo.items.map((item) => publicGameHomeVideoItem(item, auth?.user ? auth : null)));
  publicView.homeVideo.items = items;
  return sendJson(res, 200, {
    ok: true,
    config: publicView,
    items,
    user: auth?.user ? userView(auth.user) : null,
  });
}

async function handleUnlockVideo(req, res) {
  const auth = await requireUser(req, res);
  if (!auth) return;

  const body = await readJson(req);
  const itemId = String(body.itemId || "").trim();
  if (!itemId) {
    return sendJson(res, 400, { ok: false, message: "Missing itemId." });
  }

  let config = await readAppConfig();
  config.homeVideo = normalizeHomeVideo(config.homeVideo || {});
  const item = findHomeVideoItem(config.homeVideo, itemId);
  if (!item) return sendJson(res, 404, { ok: false, message: "Character not found." });

  const characterVideos = publicCharacterVideoList(item);
  const lockedVideos = characterVideos.slice(1, 4);
  if (!lockedVideos.length) return sendJson(res, 404, { ok: false, message: "No locked videos for this character yet." });
  const missingVideo = lockedVideos.find(({ entry }) => !getUnlockVideoUrl(entry));
  if (missingVideo) {
    return sendJson(res, 409, { ok: false, message: "Unlock video is still generating." });
  }

  let unlock = findUserCharacterUnlock(auth.db, auth.user.id, item.id);
  const member = userHasCreatorMembership(auth.user);
  if (!member && !unlock) {
    return sendJson(res, 403, {
      ok: false,
      code: "MEMBERSHIP_REQUIRED",
      message: "Creator Membership is required to watch and download Explore videos.",
      membership: {
        planId: CREATOR_MEMBERSHIP_PLAN_ID,
        amount: CREATOR_MEMBERSHIP_PRICE_USD,
        currency: "USD",
      },
    });
  }

  const unlocks = (auth.db.userUnlocks || [])
    .filter((record) => record.userId === auth.user.id && !isSoftDeleted(record))
    .map(publicUserUnlock);
  return sendJson(res, 200, {
    ok: true,
    charged: false,
    cost: 0,
    membership: publicCreatorMembership(auth.user),
    user: userView(auth.user),
    unlock: publicUserUnlock(unlock),
    unlocks,
    videos: characterVideos.map(({ key, entry }, index) => ({
      ...publicCharacterSceneVideo(entry, { playable: true, locked: false, price: 0 }),
      videoUrl: secureUnlockVideoUrl({
        userId: auth.user.id,
        itemId: item.id,
        sceneId: entry.sceneId,
        sceneEntryId: entry.sceneEntryId || "default",
        videoKey: key || makeSceneVideoKey(entry.sceneId, entry.sceneEntryId || "default"),
      }),
      primary: index === 0,
    })),
  });
}

function localAssetUrlForGameMedia(value = "") {
  const text = String(value || "").trim();
  if (!text || /^https?:\/\//i.test(text)) return "";
  const clean = text.split("?")[0].replace(/^\/+/, "");
  if (!clean) return "";
  const filePath = path.normalize(path.join(ROOT, clean));
  const rootWithSep = ROOT.endsWith(path.sep) ? ROOT : `${ROOT}${path.sep}`;
  if (filePath !== ROOT && !filePath.startsWith(rootWithSep)) return "";
  return { filePath, localUrl: `/${clean}` };
}

async function createUserAssetFromLocalMedia(auth, { localUrl = "", name = "Game asset", fileName = "", durationSeconds = 0 } = {}) {
  const source = localAssetUrlForGameMedia(localUrl);
  if (!source) {
    return createUserMediaAssetFromPublicUrl(auth.db, auth.user, {
      url: localUrl,
      name,
      fileName,
      durationSeconds,
      sourceUrl: localUrl,
    });
  }
  const stat = await fs.stat(source.filePath);
  if (!stat.isFile()) {
    const error = new Error("Selected media file was not found.");
    error.statusCode = 404;
    throw error;
  }
  const ext = path.extname(source.filePath).toLowerCase();
  const mime = mimeTypes.get(ext) || imageMimeFromKnownPath(source.filePath) || videoMimeFromKnownPath(source.filePath) || "";
  if (!mime || (!mime.startsWith("image/") && !mime.startsWith("video/"))) {
    const error = new Error("Selected media is not an image or video.");
    error.statusCode = 400;
    throw error;
  }
  if (mime.startsWith("image/") && stat.size > IMAGE_UPLOAD_MAX_BYTES) {
    const error = new Error(`Image must be ${Math.round(IMAGE_UPLOAD_MAX_BYTES / 1024 / 1024)}MB or smaller.`);
    error.statusCode = 400;
    throw error;
  }
  if (mime.startsWith("video/") && stat.size > MEDIA_UPLOAD_MAX_BYTES) {
    const error = new Error(`Media must be ${Math.round(MEDIA_UPLOAD_MAX_BYTES / 1024 / 1024)}MB or smaller.`);
    error.statusCode = 400;
    throw error;
  }
  const existing = findUserAssetBySourceUrl(auth.db, auth.user, source.localUrl);
  if (existing) return existing;
  const bytes = await fs.readFile(source.filePath);
  const asset = await createUserMediaAssetFromBytes(auth.db, auth.user, {
    bytes,
    mime,
    name,
    fileName: fileName || path.basename(source.filePath),
    maxBytes: mime.startsWith("image/") ? IMAGE_UPLOAD_MAX_BYTES : MEDIA_UPLOAD_MAX_BYTES,
    durationSeconds,
  });
  asset.sourceUrl = normalizedAssetSourceUrl(source.localUrl);
  asset.meta = { ...(asset.meta || {}), fromGame: true, sourceLocalUrl: source.localUrl };
  asset.updatedAt = new Date().toISOString();
  auth.db.userAssets = (auth.db.userAssets || []).map((entry) => (entry.id === asset.id ? asset : entry));
  if (dbEnabled()) await upsertUserAssetInDb(asset);
  else await writeDb(auth.db);
  return asset;
}

async function handleCreateGameAssetFromCharacterMedia(req, res) {
  const auth = await requireUser(req, res);
  if (!auth) return;
  const body = await readJson(req);
  const itemId = String(body.itemId || "").trim();
  const kind = String(body.kind || "image").trim().toLowerCase();
  if (!itemId) return sendJson(res, 400, { ok: false, message: "Missing itemId." });

  let config = await readAppConfig();
  config.homeVideo = normalizeHomeVideo(config.homeVideo || {});
  const item = findHomeVideoItem(config.homeVideo, itemId);
  if (!item) return sendJson(res, 404, { ok: false, message: "Character not found." });

  let sourceUrl = "";
  let name = `${item.name || "Character"} image`;
  let durationSeconds = 0;
  if (kind === "video") {
    const videoKey = String(body.videoKey || "").trim();
    const sceneId = String(body.sceneId || "").trim();
    const sceneEntryId = String(body.sceneEntryId || "default").trim() || "default";
    const match = videoKey
      ? publicCharacterVideoList(item).find(({ key }) => key === videoKey)
      : findCharacterVideoForItem(item, sceneId, sceneEntryId);
    if (!match) return sendJson(res, 404, { ok: false, message: "Video not found." });
    const member = userHasCreatorMembership(auth.user);
    const bundleUnlocked = characterUnlockedByRecord(auth.db, auth.user.id, item.id);
    const singleUnlocked = Boolean(findUserUnlock(auth.db, auth.user.id, item.id, match.entry.sceneId || "", match.entry.sceneEntryId || "default"));
    if (!member && !bundleUnlocked && !singleUnlocked) {
      return sendJson(res, 403, { ok: false, code: "MEMBERSHIP_REQUIRED", message: "Creator Membership is required before using this video." });
    }
    sourceUrl = getUnlockVideoUrl(match.entry);
    name = `${item.name || "Character"} video`;
    durationSeconds = durationSecondsFromValue(match.entry.duration || item.duration || 0);
  } else {
    sourceUrl = String(
      item.posterUrl ||
      item.localImageUrl ||
      item.syntheticReferenceLocalUrl ||
      item.sourceImageUrl ||
      item.publicImageUrl ||
      item.coverUrl ||
      item.thumbnailUrl ||
      "",
    ).trim();
  }
  if (!sourceUrl) return sendJson(res, 404, { ok: false, message: "Selected media is unavailable." });
  try {
    const asset = await createUserAssetFromLocalMedia(auth, {
      localUrl: sourceUrl,
      name,
      fileName: `${item.id || "game"}-${kind}`,
      durationSeconds,
    });
    return sendJson(res, 200, { ok: true, asset: publicUserAsset(asset), user: userView(auth.user) });
  } catch (error) {
    return sendJson(res, error.statusCode || 500, { ok: false, message: error.message || "Failed to create asset." });
  }
}

