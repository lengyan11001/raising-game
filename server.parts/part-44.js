// 11.11 promotion campaign: server-authoritative SKUs, capacity reservations, and Stripe checkout.
const ELEVEN_ELEVEN_PROMO = Object.freeze({
  id: "eleven-eleven-2026",
  startsAt: Date.parse(process.env.ELEVEN_ELEVEN_STARTS_AT || "2026-11-06T00:00:00+07:00"),
  periodSeconds: Math.max(3600, Number(process.env.ELEVEN_ELEVEN_PERIOD_SECONDS || 3 * 24 * 60 * 60) || 3 * 24 * 60 * 60),
  reservationSeconds: Math.max(300, Math.min(3600, Number(process.env.ELEVEN_ELEVEN_RESERVATION_SECONDS || 1500) || 1500)),
  skus: Object.freeze({
    member: Object.freeze({
      id: "member",
      capacity: 1111,
      displaySold: 896,
      amount: 29.9,
      originalAmount: 99,
      credits: 0,
      label: "创作者终身权益",
      orderKind: "subscription",
    }),
    credits: Object.freeze({
      id: "credits",
      capacity: 1111,
      displaySold: 743,
      amount: 66,
      originalAmount: 90,
      credits: 9000,
      label: "$66 充值档",
      orderKind: "topup",
    }),
  }),
});

function elevenElevenSku(sku = "") {
  return ELEVEN_ELEVEN_PROMO.skus[String(sku || "").trim()] || null;
}

function elevenElevenCampaignWindow(now = Date.now()) {
  const periodMs = ELEVEN_ELEVEN_PROMO.periodSeconds * 1000;
  const started = now >= ELEVEN_ELEVEN_PROMO.startsAt;
  const elapsed = Math.max(0, now - ELEVEN_ELEVEN_PROMO.startsAt);
  const period = Math.floor(elapsed / periodMs);
  return {
    started,
    active: started,
    startsAt: ELEVEN_ELEVEN_PROMO.startsAt + period * periodMs,
    endsAt: ELEVEN_ELEVEN_PROMO.startsAt + (period + 1) * periodMs,
    nextStartsAt: ELEVEN_ELEVEN_PROMO.startsAt + (period + 1) * periodMs,
  };
}

function elevenElevenCampaignStarted(now = Date.now()) {
  return elevenElevenCampaignWindow(now).started;
}

function elevenElevenCampaignOpen(now = Date.now()) {
  return elevenElevenCampaignWindow(now).active;
}

function elevenElevenCampaignVisible(now = Date.now()) {
  return true;
}

function elevenElevenCampaignRenewed(now = Date.now(), previousPeriodStartedAt = 0) {
  const window = elevenElevenCampaignWindow(now);
  return Boolean(previousPeriodStartedAt && window.startsAt > previousPeriodStartedAt);
}

function elevenElevenPublicPromo(state = {}, now = Date.now(), viewer = {}) {
  const inventory = new Map((state.inventory || []).map((item) => [item.sku, item]));
  const purchases = new Map((state.purchases || []).map((item) => [item.sku, item]));
  const memberOwned = Boolean(viewer.memberActive);
  const window = elevenElevenCampaignWindow(now);
  return {
    id: ELEVEN_ELEVEN_PROMO.id,
    visible: elevenElevenCampaignVisible(now),
    active: window.active,
    started: window.started,
    periodSeconds: ELEVEN_ELEVEN_PROMO.periodSeconds,
    startsAt: new Date(window.startsAt).toISOString(),
    endsAt: new Date(window.endsAt).toISOString(),
    currency: STRIPE_CURRENCY.toUpperCase(),
    skus: Object.values(ELEVEN_ELEVEN_PROMO.skus).map((sku) => {
      const usage = inventory.get(sku.id) || {};
      const sold = Number(usage.paid || 0);
      const reserved = Number(usage.pending || 0);
      const remaining = Math.max(0, sku.capacity - sold - reserved);
      // Social-proof display only: never used by checkout, capacity checks, or sold-out state.
      const displaySold = Math.min(sku.capacity, Math.max(sold, Number(sku.displaySold || 0)));
      const displayRemaining = Math.max(0, sku.capacity - displaySold - reserved);
      const purchase = purchases.get(sku.id) || null;
      const owned = sku.id === "member" && memberOwned;
      return {
        id: sku.id,
        label: sku.label,
        amount: sku.amount,
        originalAmount: sku.originalAmount,
        credits: sku.credits,
        capacity: sku.capacity,
        sold,
        reserved,
        remaining,
        displaySold,
        displayRemaining,
        soldOut: remaining <= 0,
        owned,
        purchased: purchase?.status === "paid",
        pending: purchase?.status === "pending" && Date.parse(purchase.reservedUntil || "") > now,
        orderId: purchase?.orderId || "",
        orderStatus: purchase?.status || "",
      };
    }),
  };
}

async function handleElevenElevenPromoStatus(req, res) {
  if (!dbEnabled()) return sendJson(res, 503, { ok: false, code: "DATABASE_REQUIRED", message: "活动数据需要 PostgreSQL，当前服务未配置 DATABASE_URL。" });
  const auth = await getAuth(req, { loadDb: false });
  const state = await getPromotionPurchaseStateInDb(ELEVEN_ELEVEN_PROMO.id, auth?.user?.id || "", Object.keys(ELEVEN_ELEVEN_PROMO.skus));
  return sendJson(res, 200, { ok: true, promo: elevenElevenPublicPromo(state, Date.now(), {
    memberActive: Boolean(auth?.user && userHasCreatorMembership(auth.user)),
  }) });
}

async function createElevenElevenCheckout(req, res) {
  const auth = await requireUser(req, res);
  if (!auth) return;
  if (!dbEnabled()) return sendJson(res, 503, { ok: false, code: "DATABASE_REQUIRED", message: "活动数据需要 PostgreSQL，当前服务未配置 DATABASE_URL。" });
  if (!elevenElevenCampaignStarted()) {
    return sendJson(res, 403, { ok: false, code: "PROMO_CLOSED", message: "活动尚未开始。" });
  }
  const body = await readJson(req);
  const sku = elevenElevenSku(body.sku);
  if (!sku) return sendJson(res, 400, { ok: false, code: "PROMO_SKU_INVALID", message: "请选择有效的活动档位。" });
  if (sku.id === "member" && userHasCreatorMembership(auth.user)) {
    return sendJson(res, 409, { ok: false, code: "MEMBERSHIP_ALREADY_ACTIVE", message: "您已开通创作者终身权益，无需重复购买。" });
  }
  const cashierBaseUrl = stripeCheckoutBaseUrlForRequest(req);
  const stripeConfig = stripeConfigForHost(cashierBaseUrl);
  if (!stripeEnabled(stripeConfig)) return sendJson(res, 503, { ok: false, code: "STRIPE_NOT_CONFIGURED", message: "Stripe is not configured yet." });
  const userId = auth.user.id;
  const existingState = await getPromotionPurchaseStateInDb(ELEVEN_ELEVEN_PROMO.id, userId, [sku.id]);
  const existing = existingState.purchases.find((item) => item.sku === sku.id) || null;
  if (existing?.status === "pending" && Date.parse(existing.reservedUntil || "") > Date.now()) {
    const pendingOrder = await getWalletOrderByIdInDb(existing.orderId);
    if (pendingOrder && pendingOrder.userId === userId && pendingOrder.status === "pending" && !stripeCheckoutSessionExpired(pendingOrder)) {
      return sendJson(res, 200, { ok: true, reused: true, checkoutUrl: stripeCheckoutUrl(pendingOrder.id, cashierBaseUrl), sku: sku.id });
    }
  }
  const orderId = randomId("stripe");
  const reserved = await reservePromotionPurchaseInDb({
    campaignId: ELEVEN_ELEVEN_PROMO.id,
    sku: sku.id,
    userId,
    orderId,
    capacity: sku.capacity,
    reservationSeconds: ELEVEN_ELEVEN_PROMO.reservationSeconds,
  });
  if (reserved.status === "purchased") {
    return sendJson(res, 409, { ok: false, code: "PROMO_ALREADY_PURCHASED", message: "每个账号限购一次，本档已购买。" });
  }
  if (reserved.status === "sold_out") {
    return sendJson(res, 409, { ok: false, code: "PROMO_SOLD_OUT", message: "本档已售完。" });
  }
  if (reserved.status === "pending") {
    const pendingOrder = reserved.purchase?.orderId ? await getWalletOrderByIdInDb(reserved.purchase.orderId) : null;
    if (pendingOrder && pendingOrder.userId === userId && pendingOrder.status === "pending" && !stripeCheckoutSessionExpired(pendingOrder)) {
      return sendJson(res, 200, { ok: true, reused: true, checkoutUrl: stripeCheckoutUrl(pendingOrder.id, cashierBaseUrl), sku: sku.id });
    }
    return sendJson(res, 409, { ok: false, code: "PROMO_CHECKOUT_BUSY", message: "正在处理上一笔支付，请稍后再试。" });
  }
  if (reserved.status !== "reserved") {
    return sendJson(res, 409, { ok: false, code: "PROMO_CHECKOUT_BUSY", message: "当前活动档位暂时无法下单，请稍后再试。" });
  }
  const config = await readAppConfig();
  const tenantOptions = requestTenantOptions(req);
  const isMember = sku.id === "member";
  const order = {
    id: orderId,
    tenantId: tenantOptions.tenant?.tenantId || DEFAULT_TENANT_ID,
    userId,
    paymentProvider: "stripe",
    orderKind: sku.orderKind,
    promoId: ELEVEN_ELEVEN_PROMO.id,
    promoCampaignId: ELEVEN_ELEVEN_PROMO.id,
    promoCampaignName: "11.11 限时特价",
    promoCampaignSku: sku.id,
    baseAmount: sku.amount,
    baseAmountOriginal: sku.originalAmount,
    creditAmount: creditsAmount(sku.credits),
    packageId: isMember ? "" : ELEVEN_ELEVEN_PROMO.id,
    packageCredits: sku.credits,
    billingPlanId: isMember ? CREATOR_MEMBERSHIP_PLAN_ID : "",
    billingPlanName: isMember ? "Creator Membership (Lifetime)" : "",
    billingIntervalUnit: "",
    billingIntervalCount: 0,
    creditsPerUsd: walletCreditsPerUsd(config.wallet),
    currency: STRIPE_CURRENCY.toUpperCase(),
    payableAmount: sku.amount,
    payableAmountText: sku.amount.toFixed(2),
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
    await markPromotionPurchaseFailedInDb({ campaignId: ELEVEN_ELEVEN_PROMO.id, orderId, status: "failed" }).catch(() => {});
    throw error;
  }
  return sendJson(res, 200, { ok: true, reused: false, checkoutUrl: stripeCheckoutUrl(order.id, cashierBaseUrl), sku: sku.id, orderId: order.id });
}


async function handlePromotionPaymentRoutes(req, res, url) {
  if (req.method === "GET" && url.pathname === "/api/pay/stripe/config") {
    sendJson(res, 200, { ok: true, stripe: stripePublicConfig(req) });
    return true;
  }
  if (req.method === "GET" && url.pathname === "/api/promo/1111") {
    await handleElevenElevenPromoStatus(req, res);
    return true;
  }
  if (req.method === "POST" && url.pathname === "/api/promo/1111/checkout") {
    await createElevenElevenCheckout(req, res);
    return true;
  }
  if (req.method === "GET" && url.pathname === "/api/promo/double-topup") {
    await handleDoubleTopupPromoStatus(req, res);
    return true;
  }
  if (req.method === "POST" && url.pathname === "/api/promo/double-topup/checkout") {
    await createDoubleTopupCheckout(req, res);
    return true;
  }
  return false;
}
