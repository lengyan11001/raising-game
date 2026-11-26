const COUPON_NEW_USER_CODE = "NEWUSER_30_5OFF";

function couponRolloutPercent() {
  const configured = Number(process.env.COUPON_ROLLOUT_PERCENT ?? 100);
  if (!Number.isFinite(configured)) return 100;
  return Math.max(0, Math.min(100, Math.trunc(configured)));
}

function couponRolloutBucket(userId = "") {
  const digest = crypto.createHash("sha256").update(String(userId || "")).digest();
  return digest.readUInt32BE(0) % 100;
}

function couponRolloutEligible(userId = "") {
  return couponRolloutBucket(userId) < couponRolloutPercent();
}

function couponEmailDomain(email = "") {
  const normalized = String(email || "").trim().toLowerCase();
  const at = normalized.lastIndexOf("@");
  return at > 0 ? normalized.slice(at + 1).slice(0, 160) : "";
}

const COUPON_EMAIL_REMINDER_INTERVAL_MS = 10 * 60 * 1000;
const COUPON_EMAIL_REMINDER_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
const COUPON_EMAIL_REMINDER_LIMIT = 3;

function couponReminderTime(value = "") {
  const timestamp = Date.parse(value || "");
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function couponEmailReminderCandidate(coupon = {}, now = Date.now()) {
  const email = String(coupon.email || "").trim();
  const status = Number(coupon.status);
  const nowMs = Number(now || Date.now());
  if (!email || Number(coupon.riskFlag || 0) !== 0 || ![0, 1].includes(status)) return "";
  const reminders = (Array.isArray(coupon.reminders) ? coupon.reminders : [])
    .map((item) => ({
      type: String(item?.type || "").trim(),
      sentAt: couponReminderTime(item?.sentAt),
    }))
    .filter((item) => item.type && item.sentAt > 0);
  const sentTypes = new Set(reminders.map((item) => item.type));
  const recentCount = reminders.filter((item) => nowMs - item.sentAt < COUPON_EMAIL_REMINDER_WINDOW_MS).length;
  if (recentCount >= COUPON_EMAIL_REMINDER_LIMIT) return "";

  if (status === 0) {
    const grantedAt = couponReminderTime(coupon.grantedAt);
    if (!grantedAt || nowMs < grantedAt) return "";
    const ageMs = nowMs - grantedAt;
    const dueType = ageMs >= 72 * 60 * 60 * 1000
      ? "pending_72h"
      : (ageMs >= 24 * 60 * 60 * 1000 ? "pending_24h" : "pending_0h");
    return sentTypes.has(dueType) ? "" : dueType;
  }

  const claimedAt = couponReminderTime(coupon.claimedAt);
  const expireAt = couponReminderTime(coupon.expireAt);
  if (!claimedAt || !expireAt || expireAt <= nowMs) return "";
  const timeLeft = expireAt - nowMs;
  const claimAge = nowMs - claimedAt;
  if (timeLeft <= 24 * 60 * 60 * 1000) return sentTypes.has("expire_24h") ? "" : "expire_24h";
  if (timeLeft <= 48 * 60 * 60 * 1000) return sentTypes.has("expire_48h") ? "" : "expire_48h";
  if (claimAge >= 48 * 60 * 60 * 1000) return sentTypes.has("claimed_48h") ? "" : "claimed_48h";
  return "";
}

function couponEmailMoney(cents = 0) {
  const amount = Math.max(0, Math.trunc(Number(cents || 0))) / 100;
  return `$${Number.isInteger(amount) ? amount : amount.toFixed(2)}`;
}

function couponEmailReminderContent(type = "", coupon = {}) {
  const faceValue = couponEmailMoney(coupon.faceValue);
  const threshold = couponEmailMoney(coupon.threshold);
  const validDays = Math.max(1, Math.trunc(Number(coupon.validDays || 7)));
  const expireAt = couponReminderTime(coupon.expireAt);
  const remainingDays = expireAt > Date.now() ? Math.max(1, Math.ceil((expireAt - Date.now()) / (24 * 60 * 60 * 1000))) : 0;
  const baseUrl = String(PUBLIC_BASE_URL || "https://123vips.com").replace(/\/+$/, "");
  const couponUrl = `${baseUrl}/#topup`;
  const content = {
    pending_0h: {
      subject: `你的 ${faceValue} 新用户券待领取`,
      title: `你的 ${faceValue} 新用户券已到账`,
      body: `满 ${threshold} 可用，领取后 ${validDays} 天内有效。登录 Vipeak AI 即可领取。`,
    },
    pending_24h: {
      subject: `${faceValue} 优惠还在，去领一下`,
      title: `别忘了领取你的 ${faceValue} 新用户券`,
      body: `满 ${threshold} 可用，待领取期间不会过期。现在登录即可领取。`,
    },
    pending_72h: {
      subject: "最后提醒：新用户券待领取",
      title: `你的 ${faceValue} 新用户券还在这里`,
      body: `满 ${threshold} 可用，领取后 ${validDays} 天内有效。登录 Vipeak AI 即可领取。`,
    },
    claimed_48h: {
      subject: `${faceValue} 优惠还没用，别让它过期`,
      title: `你的 ${faceValue} 现金券还没使用`,
      body: `这张券领取后 ${validDays} 天有效${remainingDays > 0 ? `，约 ${remainingDays} 天后失效` : ""}。请尽快在购买积分或开通会员时使用。`,
    },
    expire_48h: {
      subject: `新用户券 2 天后失效`,
      title: `你的 ${faceValue} 现金券将在 2 天内失效`,
      body: `满 ${threshold} 可用，请尽快在购买积分或开通会员时使用。`,
    },
    expire_24h: {
      subject: "最后 1 天：新用户券即将失效",
      title: `你的 ${faceValue} 现金券将在 24 小时内失效`,
      body: `满 ${threshold} 可用，请尽快使用，过期后无法恢复。`,
    },
  }[type];
  if (!content) return null;
  const text = `${content.title}\n\n${content.body}\n\n立即查看：${couponUrl}\n\n如果这不是你的账户操作，请忽略此邮件。`;
  const html = `<p><strong>${content.title}</strong></p><p>${content.body}</p><p><a href="${couponUrl}">立即查看</a></p><p style="color:#777;font-size:12px">如果这不是你的账户操作，请忽略此邮件。</p>`;
  return { ...content, text, html, couponUrl };
}

async function couponIssuanceRisk(req, { user = {}, body = {}, email = "" } = {}) {
  const userId = String(user.id || "").trim();
  const reasons = [];
  const rolloutEligible = couponRolloutEligible(userId);
  if (!rolloutEligible) reasons.push("rollout_holdout");
  if (!dbEnabled()) return { eligible: false, riskFlag: 0, reasons, rolloutEligible, emailDomain: couponEmailDomain(email) };
  const ipHash = authAuditMetadata(req, body).ipHash || "";
  const deviceId = authDeviceId(req, body);
  const deviceHash = deviceId ? authRiskKey(deviceId) : "";
  const emailDomain = couponEmailDomain(email);
  try {
    const ipLookup = ipHash
      ? query(`
          SELECT COUNT(*)::int AS count
          FROM app_risk_events
          WHERE event_type = 'auth_registration_created'
            AND ip_hash = $1
            AND created_at >= NOW() - INTERVAL '1 hour'
        `, [ipHash])
      : Promise.resolve({ rows: [{ count: 0 }] });
    const emailDeviceLookup = emailDomain && deviceHash
      ? query(`
          SELECT COUNT(*)::int AS count
          FROM app_risk_events
          WHERE event_type = 'auth_registration_created'
            AND metadata->>'deviceHash' = $1
            AND metadata->>'emailDomain' = $2
        `, [deviceHash, emailDomain])
      : Promise.resolve({ rows: [{ count: 0 }] });
    const [ipResult, emailDeviceResult] = await Promise.all([ipLookup, emailDeviceLookup]);
    if (Number(ipResult.rows?.[0]?.count || 0) >= 3) reasons.push("ip_registration_hour_limit");
    if (Number(emailDeviceResult.rows?.[0]?.count || 0) >= 1) reasons.push("email_domain_device_reuse");
  } catch (error) {
    console.warn("[coupon-risk-check-failed]", userId, error.message || error);
    reasons.push("risk_check_unavailable");
  }
  return {
    eligible: rolloutEligible && !reasons.length,
    riskFlag: reasons.length ? 1 : 0,
    reasons,
    rolloutEligible,
    ipHash,
    deviceHash,
    emailDomain,
  };
}

async function issueRegistrationCouponIfEligible(req, { user = {}, body = {}, email = "", username = "" } = {}) {
  if (!dbEnabled() || !user.id) return { issued: false, risk: null };
  const risk = await couponIssuanceRisk(req, { user, body, email });
  await recordRegistrationRiskEvent(req, {
    username: username || user.username || email,
    automatic: Boolean(body?.automatic),
    created: true,
    riskReasons: risk.reasons,
    body,
    extra: {
      emailDomain: risk.emailDomain,
      deviceHash: risk.deviceHash,
      couponEligible: risk.eligible,
      couponRolloutEligible: risk.rolloutEligible,
    },
  }).catch((error) => console.warn("[coupon-risk-event-failed]", user.id, error.message || error));
  if (!risk.eligible) return { issued: false, risk };
  const coupon = await issueCouponInDb({ userId: user.id, templateCode: COUPON_NEW_USER_CODE, grantSource: "register" })
    .catch((error) => {
      console.warn("[coupon-register-issue-failed]", user.id, error.message || error);
      return null;
    });
  return { issued: Boolean(coupon), risk, coupon };
}

async function recordCouponClaimRisk(req, body = {}, userId = "", reasons = []) {
  if (!dbEnabled()) return;
  try {
    await recordRiskEventInDb({
      eventType: "coupon_claim_risk",
      scopeKey: `coupon:${requestTenantId(req)}`,
      tenantId: requestTenantId(req),
      subject: userId,
      ip: authClientIp(req),
      userAgent: authUserAgent(req),
      metadata: authAuditMetadata(req, body, {
        reasons: Array.isArray(reasons) ? reasons.slice(0, 8).map(String) : [],
      }),
    });
  } catch (error) {
    console.warn("[coupon-claim-risk-event-failed]", userId, error.message || error);
  }
}

async function couponClaimRisk(req, body = {}, userId = "") {
  if (!dbEnabled() || !userId) return { block: false, riskFlag: 0, reasons: [] };
  const reasons = [];
  const deviceId = authDeviceId(req, body);
  if (deviceId) {
    const deviceAccounts = await query(`
      SELECT COUNT(DISTINCT user_id)::int AS count
      FROM app_sessions
      WHERE payload->>'deviceId' = $1
        AND user_id <> $2
        AND (expires_at IS NULL OR expires_at > NOW())
    `, [deviceId, userId]).catch((error) => {
      console.warn("[coupon-device-risk-check-failed]", userId, error.message || error);
      return { rows: [{ count: 0 }] };
    });
    if (Number(deviceAccounts.rows?.[0]?.count || 0) >= 3) reasons.push("device_shared_by_more_than_three_accounts");
  }
  return { block: reasons.includes("device_shared_by_more_than_three_accounts"), riskFlag: reasons.length ? 1 : 0, reasons };
}

function couponIdFromRequest(body = {}) {
  return String(body.couponId || body.coupon_id || "").trim();
}

function couponSceneForOrderKind(orderKind = "") {
  const kind = String(orderKind || "").toLowerCase();
  if (kind === "subscription") return "membership";
  if (kind === "topup" || !kind) return "recharge";
  return kind;
}

function publicCouponForClient(coupon = {}) {
  const hoursLeft = coupon.expireAt
    ? Math.max(0, Math.ceil((Date.parse(coupon.expireAt) - Date.now()) / 3_600_000))
    : null;
  return {
    coupon_id: coupon.couponId,
    code: coupon.code,
    title: coupon.title,
    face_value: coupon.faceValue,
    currency: coupon.currency,
    threshold: coupon.threshold,
    scope: coupon.scope,
    status: coupon.status,
    granted_at: coupon.grantedAt,
    claimed_at: coupon.claimedAt,
    expire_at: coupon.status === 0 ? null : coupon.expireAt,
    hours_left: coupon.status === 0 ? null : hoursLeft,
    used_at: coupon.usedAt,
    used_scene: coupon.usedScene,
    discount_amount: coupon.discountAmount,
    lock_order_no: coupon.status === 2 ? coupon.lockOrderNo : "",
    lock_expire_at: coupon.status === 2 ? coupon.lockExpireAt : "",
    risk_review: Boolean(coupon.riskFlag),
    grant_source: coupon.grantSource,
  };
}

function couponApiError(res, error) {
  const code = String(error?.code || "COUPON_SERVICE_ERROR");
  const statusCode = Number(error?.statusCode || 500);
  return sendJson(res, statusCode, { ok: false, code, message: error?.message || "Coupon service unavailable." });
}

async function handleListCoupons(req, res) {
  const auth = await requireUser(req, res, { loadDb: false });
  if (!auth) return;
  try {
    const coupons = dbEnabled()
      ? await listUserCouponsInDb(auth.user.id)
      : [];
    const rows = (coupons || []).map(publicCouponForClient);
    return sendJson(res, 200, {
      ok: true,
      pending_claim: rows.filter((coupon) => coupon.status === 0),
      available: rows.filter((coupon) => coupon.status === 1),
      locked: rows.filter((coupon) => coupon.status === 2),
      used: rows.filter((coupon) => coupon.status === 3),
      expired: rows.filter((coupon) => coupon.status === 4),
    });
  } catch (error) {
    return couponApiError(res, error);
  }
}

async function handleClaimCoupon(req, res) {
  const auth = await requireUser(req, res, { loadDb: false });
  if (!auth) return;
  if (!dbEnabled()) return sendJson(res, 503, { ok: false, code: "DATABASE_REQUIRED", message: "Coupons require database storage." });
  const body = await readJson(req);
  try {
    let couponId = couponIdFromRequest(body);
    if (!couponId) {
      const coupons = await listUserCouponsInDb(auth.user.id);
      couponId = coupons.find((coupon) => coupon.status === 0)?.couponId || "";
    }
    if (!couponId) return sendJson(res, 404, { ok: false, code: "COUPON_NOT_FOUND", message: "No pending coupon was found." });
    const claimRisk = await couponClaimRisk(req, body, auth.user.id);
    if (claimRisk.block) {
      await markUserCouponRiskInDb(auth.user.id, couponId, 1);
      await recordCouponClaimRisk(req, body, auth.user.id, claimRisk.reasons);
      return sendJson(res, 403, { ok: false, code: "COUPON_RISK_REVIEW", message: "Coupon requires manual review." });
    }
    let coupon = await claimUserCouponInDb(auth.user.id, couponId);
    if (claimRisk.riskFlag) {
      coupon = await markUserCouponRiskInDb(auth.user.id, couponId, 1) || coupon;
      await recordCouponClaimRisk(req, body, auth.user.id, claimRisk.reasons);
    }
    const publicCoupon = publicCouponForClient(coupon);
    return sendJson(res, 200, {
      ok: true,
      coupon_id: publicCoupon.coupon_id,
      claimed_at: publicCoupon.claimed_at,
      expire_at: publicCoupon.expire_at,
      days_left: coupon.validDays || null,
      coupon: publicCoupon,
    });
  } catch (error) {
    return couponApiError(res, error);
  }
}

async function handleAvailableCoupons(req, res, url) {
  const auth = await requireUser(req, res, { loadDb: false });
  if (!auth) return;
  const amount = Math.max(0, Math.trunc(Number(url.searchParams.get("amount") || 0)));
  const scene = String(url.searchParams.get("scene") || "recharge").trim().toLowerCase();
  try {
    const result = dbEnabled()
      ? await getAvailableCouponsInDb({ userId: auth.user.id, amountCents: amount, scene })
      : { available: [], best: "", blockedReason: "not_claimed" };
    return sendJson(res, 200, {
      ok: true,
      available: (result?.available || []).map(publicCouponForClient),
      best: result?.best || "",
      blocked_reason: result?.blockedReason || null,
    });
  } catch (error) {
    return couponApiError(res, error);
  }
}

async function prepareCouponForWalletOrder({
  userId = "",
  couponId = "",
  orderId = "",
  amountCents = 0,
  scene = "recharge",
} = {}) {
  const cleanCouponId = String(couponId || "").trim();
  if (!cleanCouponId) {
    return {
      couponId: "",
      couponCode: "",
      originalAmountCents: Math.max(0, Math.trunc(Number(amountCents || 0))),
      discountAmountCents: 0,
      payAmountCents: Math.max(0, Math.trunc(Number(amountCents || 0))),
      couponLockExpireAt: "",
    };
  }
  if (!dbEnabled()) {
    const error = new Error("Coupons require database storage.");
    error.code = "DATABASE_REQUIRED";
    error.statusCode = 503;
    throw error;
  }
  const amount = Math.max(0, Math.trunc(Number(amountCents || 0)));
  const coupon = await lockUserCouponForOrderInDb({
    userId,
    couponId: cleanCouponId,
    orderId,
    amountCents: amount,
    scene,
  });
  const discountAmountCents = Math.min(amount, Math.max(0, Number(coupon?.faceValue || 0)));
  return {
    couponId: coupon?.couponId || cleanCouponId,
    couponCode: coupon?.code || "",
    originalAmountCents: amount,
    discountAmountCents,
    payAmountCents: Math.max(0, amount - discountAmountCents),
    couponLockExpireAt: coupon?.lockExpireAt || "",
  };
}

function applyCouponFieldsToWalletOrder(order = {}, coupon = {}) {
  const originalAmountCents = Math.max(0, Math.trunc(Number(coupon.originalAmountCents || 0)));
  const discountAmountCents = Math.max(0, Math.trunc(Number(coupon.discountAmountCents || 0)));
  const payAmountCents = Math.max(0, Math.trunc(Number(coupon.payAmountCents ?? originalAmountCents)));
  return {
    ...order,
    originalAmountCents,
    discountAmountCents,
    payAmountCents,
    couponId: coupon.couponId || "",
    couponCode: coupon.couponCode || "",
    couponLockExpireAt: coupon.couponLockExpireAt || "",
    payableAmount: payAmountCents / 100,
    payableAmountText: (payAmountCents / 100).toFixed(2),
  };
}

async function releaseCouponOnWalletOrderFailure(order = {}) {
  if (!dbEnabled() || !order?.couponId) return;
  await releaseUserCouponForOrderInDb(order.couponId, order.id)
    .catch((error) => console.warn("[coupon-release-failed]", order.id, error.message || error));
}

async function ensureCouponLockForWalletOrder(order = {}) {
  if (!dbEnabled() || !order?.couponId) return order;
  const originalAmountCents = Number(order.originalAmountCents)
    || Math.round(Number(order.baseAmount || 0) * 100);
  const coupon = await prepareCouponForWalletOrder({
    userId: order.userId,
    couponId: order.couponId,
    orderId: order.id,
    amountCents: originalAmountCents,
    scene: couponSceneForOrderKind(order.orderKind),
  });
  return applyCouponFieldsToWalletOrder(order, coupon);
}

let couponEmailReminderRunning = false;

async function scanCouponEmailReminders(reason = "timer") {
  if (!dbEnabled() || !EMAIL_LOGIN_ENABLED || !smtpConfigured(EMAIL_SMTP_CONFIG)) {
    return { scanned: 0, sent: 0, skipped: "email_not_configured" };
  }
  if (couponEmailReminderRunning) return { scanned: 0, sent: 0, skipped: "already_running" };
  couponEmailReminderRunning = true;
  try {
    const candidates = await listCouponEmailReminderCandidatesFromDb({ limit: 100 });
    let sent = 0;
    for (const coupon of candidates) {
      const reminderType = couponEmailReminderCandidate(coupon);
      if (!reminderType) continue;
      const content = couponEmailReminderContent(reminderType, coupon);
      if (!content) continue;
      try {
        await sendEmailMessage({
          to: coupon.email,
          subject: content.subject,
          text: content.text,
          html: content.html,
        });
        await recordCouponEmailReminderInDb({
          couponId: coupon.couponId,
          reminderType,
          email: coupon.email,
          metadata: { reason, subject: content.subject },
        });
        sent += 1;
      } catch (error) {
        console.warn("[coupon-email-reminder-failed]", coupon.couponId, reminderType, error?.code || "", error?.message || error);
      }
    }
    return { scanned: candidates.length, sent };
  } finally {
    couponEmailReminderRunning = false;
  }
}

function runCouponEmailReminderSchedulerTick(reason = "timer") {
  return runWithSchedulerLease("coupon-email-reminders", () => (
    scanCouponEmailReminders(reason)
  ), {
    connect: () => getSchedulerPool().connect(),
    onError: (error) => console.warn("[coupon-email-reminder-lease-failed]", error.message || error),
  });
}

function startCouponEmailReminderScheduler() {
  if (!EMAIL_LOGIN_ENABLED || !smtpConfigured(EMAIL_SMTP_CONFIG)) return;
  scheduleStartupScheduler("coupon-email-reminders", () => runCouponEmailReminderSchedulerTick("startup"));
  setInterval(() => runCouponEmailReminderSchedulerTick("timer"), COUPON_EMAIL_REMINDER_INTERVAL_MS).unref?.();
}
