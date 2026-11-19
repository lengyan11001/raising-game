const { checkinConfigFromEnv } = require("./checkin-core");

function sendCheckinResponse(res, statusCode, code, msg, data = {}) {
  return sendJson(res, statusCode, { code, msg, data }, { cacheControl: "private, no-store" });
}

async function requireCheckinUser(req, res) {
  const auth = await getAuth(req);
  if (auth.quarantined || auth.user?.riskStatus === "quarantined") {
    sendCheckinResponse(res, 403, 1002, "账号异常", {});
    return null;
  }
  if (!auth.user) {
    sendCheckinResponse(res, 401, 1001, "请先登录", {});
    return null;
  }
  return auth;
}

function checkinErrorResponse(res, error) {
  const statusCode = Number(error?.statusCode || error?.status || 500);
  if (statusCode === 401 || statusCode === 404) {
    return sendCheckinResponse(res, statusCode === 401 ? 401 : 404, 1001, "请先登录", {});
  }
  if (statusCode === 403) {
    return sendCheckinResponse(res, 403, 1002, "账号异常", {});
  }
  if (statusCode === 429) {
    return sendCheckinResponse(res, 429, 2003, "请求过于频繁", {});
  }
  console.error("[checkin]", error);
  return sendCheckinResponse(res, 500, 5000, "服务异常", {});
}

async function enforceCheckinRateLimit(req, res, auth) {
  const rate = await authRateLimit(req, {
    action: "daily_checkin",
    limit: 1,
    windowMs: 1000,
    includeAccount: auth.user.id,
    includeIp: false,
    eventType: "business_rate_limited",
    code: "BUSINESS_RATE_LIMITED",
  });
  if (rate.ok) return true;
  const seconds = Math.max(1, Number(rate.retryAfterSeconds || rate.result?.retryAfterSeconds || 1) || 1);
  res.setHeader("Retry-After", String(seconds));
  sendCheckinResponse(res, 429, 2003, "请求过于频繁", { retry_after_seconds: seconds });
  return false;
}

async function handleCheckinStatus(req, res) {
  try {
    const auth = await requireCheckinUser(req, res);
    if (!auth) return;
    const status = await getCheckinStatusFromDb({
      userId: auth.user.id,
      now: new Date(),
      config: checkinConfigFromEnv(),
    });
    return sendCheckinResponse(res, 200, 0, "ok", status);
  } catch (error) {
    return checkinErrorResponse(res, error);
  }
}

async function handleCheckin(req, res) {
  try {
    const auth = await requireCheckinUser(req, res);
    if (!auth) return;
    if (!(await enforceCheckinRateLimit(req, res, auth))) return;
    const body = await readJson(req);
    const result = await performCheckinInDb({
      userId: auth.user.id,
      ip: requestIpForStats(req),
      deviceId: String(body?.device_id || body?.deviceId || "").trim(),
      now: new Date(),
      config: checkinConfigFromEnv(),
    });
    return sendCheckinResponse(res, 200, 0, "ok", result);
  } catch (error) {
    return checkinErrorResponse(res, error);
  }
}
