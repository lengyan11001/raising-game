const RISK_LOCK_MAX_FAILURES = Math.max(3, Math.min(20, Number(process.env.AUTH_LOCK_MAX_FAILURES || 5) || 5));
const RISK_LOCK_MINUTES = Math.max(1, Math.min(1440, Number(process.env.AUTH_LOCK_MINUTES || 15) || 15));
const RISK_REGISTER_PER_MINUTE = Math.max(1, Math.min(60, Number(process.env.AUTH_REGISTER_PER_MINUTE || 3) || 3));
const RISK_REGISTER_PER_HOUR = Math.max(1, Math.min(600, Number(process.env.AUTH_REGISTER_PER_HOUR || 8) || 8));
const RISK_REGISTER_PER_DAY = Math.max(1, Math.min(100, Number(process.env.AUTH_REGISTER_PER_DAY || 20) || 20));
const RISK_DEVICE_REGISTER_PER_DAY = Math.max(1, Math.min(20, Number(process.env.AUTH_DEVICE_REGISTER_PER_DAY || 5) || 5));
const RISK_AUTOMATED_REGISTER_PER_HOUR = Math.max(1, Math.min(60, Number(process.env.AUTH_AUTOMATED_REGISTER_PER_HOUR || 2) || 2));
const RISK_IP_LOGIN_FAILURES = Math.max(5, Math.min(200, Number(process.env.AUTH_IP_LOGIN_FAILURES || 20) || 20));
const RISK_IP_LOGIN_WINDOW_MINUTES = Math.max(5, Math.min(120, Number(process.env.AUTH_IP_LOGIN_WINDOW_MINUTES || 15) || 15));
const RISK_LOGIN_PER_MINUTE = Math.max(3, Math.min(300, Number(process.env.AUTH_LOGIN_PER_MINUTE || 30) || 30));
const RISK_LOGIN_PER_HOUR = Math.max(10, Math.min(3000, Number(process.env.AUTH_LOGIN_PER_HOUR || 120) || 120));
const RISK_EMAIL_REQUEST_PER_MINUTE = Math.max(1, Math.min(30, Number(process.env.AUTH_EMAIL_REQUEST_PER_MINUTE || 5) || 5));
const RISK_EMAIL_REQUEST_PER_HOUR = Math.max(1, Math.min(300, Number(process.env.AUTH_EMAIL_REQUEST_PER_HOUR || 20) || 20));
const RISK_EMAIL_VERIFY_PER_MINUTE = Math.max(3, Math.min(100, Number(process.env.AUTH_EMAIL_VERIFY_PER_MINUTE || 10) || 10));
const RISK_GOOGLE_LOGIN_PER_MINUTE = Math.max(3, Math.min(100, Number(process.env.AUTH_GOOGLE_LOGIN_PER_MINUTE || 10) || 10));
const CLOUDFLARE_IPV4_RANGES = [
  "173.245.48.0/20", "103.21.244.0/22", "103.22.200.0/22", "103.31.4.0/22",
  "141.101.64.0/18", "108.162.192.0/18", "190.93.240.0/20", "188.114.96.0/20",
  "197.234.240.0/22", "198.41.128.0/17", "162.158.0.0/15", "104.16.0.0/13",
  "104.24.0.0/14", "172.64.0.0/13", "131.0.72.0/22",
];
const CLOUDFLARE_IPV6_RANGES = [
  "2400:cb00::/32", "2606:4700::/32", "2803:f800::/32", "2405:b500::/32",
  "2405:8100::/32", "2a06:98c0::/29", "2c0f:f248::/32",
];
const RISK_AUTOMATION_UA = /(?:powershell|curl|wget|python-requests|python-urllib|httpx|aiohttp|go-http-client|java\/|okhttp|libwww|node-fetch|axios|scrapy|headlesschrome|phantomjs|selenium|playwright|puppeteer|httpclient)/i;

function riskNetworks(ranges = []) {
  return ranges.map((value) => {
    const [address, prefixText] = String(value || "").split("/");
    return { address: riskIpAddress(address), prefix: Number(prefixText || 0) };
  }).filter((item) => item.address);
}

function riskIpAddress(value = "") {
  const text = String(value || "").trim();
  if (!text) return null;
  const mapped = text.startsWith("::ffff:") ? text.slice(7) : text;
  const family = mapped.includes(":") ? 6 : 4;
  const parts = family === 4 ? mapped.split(".").map(Number) : riskIpv6Parts(mapped);
  if (!parts || parts.some((part) => !Number.isInteger(part) || part < 0 || part > (family === 4 ? 255 : 65535))) return null;
  return { family, parts };
}

function riskIpv6Parts(value = "") {
  let text = String(value || "").toLowerCase().split("%")[0];
  if (!text.includes(":")) return null;
  const halves = text.split("::");
  if (halves.length > 2) return null;
  const parse = (chunk) => chunk ? chunk.split(":").flatMap((item) => {
    if (!item) return [];
    if (item.includes(".")) {
      const v4 = item.split(".").map(Number);
      if (v4.length !== 4 || v4.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return [NaN];
      return [(v4[0] << 8) | v4[1], (v4[2] << 8) | v4[3]];
    }
    return [parseInt(item, 16)];
  }) : [];
  const left = parse(halves[0]);
  const right = halves.length === 2 ? parse(halves[1]) : [];
  const fill = halves.length === 2 ? 8 - left.length - right.length : 0;
  const parts = halves.length === 2 ? [...left, ...Array(Math.max(0, fill)).fill(0), ...right] : left;
  return parts.length === 8 ? parts : null;
}

const CLOUDFLARE_NETWORKS = riskNetworks([...CLOUDFLARE_IPV4_RANGES, ...CLOUDFLARE_IPV6_RANGES]);

function riskIpInNetworks(address = "", networks = CLOUDFLARE_NETWORKS) {
  const ip = riskIpAddress(address);
  if (!ip) return false;
  return networks.some((network) => {
    if (!network?.address || network.address.family !== ip.family) return false;
    let bits = network.prefix;
    for (let index = 0; index < ip.parts.length && bits > 0; index += 1) {
      const width = ip.family === 4 ? 8 : 16;
      const take = Math.min(width, bits);
      const mask = take === width ? (1 << width) - 1 : ((1 << take) - 1) << (width - take);
      if ((ip.parts[index] & mask) !== (network.address.parts[index] & mask)) return false;
      bits -= take;
    }
    return true;
  });
}

function normalizedSocketIp(req = null) {
  return String(req?.socket?.remoteAddress || req?.connection?.remoteAddress || "").trim();
}

function authClientIp(req = null) {
  const socketIp = normalizedSocketIp(req);
  const trustProxy = String(process.env.AUTH_TRUST_PROXY || "true") !== "false";
  if (trustProxy && riskIpInNetworks(socketIp)) {
    const cf = String(req?.headers?.["cf-connecting-ip"] || "").trim();
    if (cf && riskIpAddress(cf)) return cf.slice(0, 80);
  }
  if (trustProxy && (!socketIp || socketIp === "127.0.0.1" || socketIp === "::1")) {
    // Nginx must overwrite X-Real-IP from the trusted peer address. Do not trust
    // CF-Connecting-IP here: a direct client can send that header through Nginx.
    const real = String(req?.headers?.["x-real-ip"] || "").trim();
    if (real && riskIpAddress(real)) return real.slice(0, 80);
    if (String(process.env.AUTH_TRUST_FORWARDED_FOR || "false") === "true") {
      const forwarded = String(req?.headers?.["x-forwarded-for"] || "").split(",")[0].trim();
      if (forwarded && riskIpAddress(forwarded)) return forwarded.slice(0, 80);
    }
  }
  return (socketIp || "unknown").slice(0, 80);
}

function authUserAgent(req = null) {
  return String(req?.headers?.["user-agent"] || "").slice(0, 300);
}

function isAutomatedAuthUserAgent(req = null) {
  const userAgent = authUserAgent(req);
  return !userAgent || RISK_AUTOMATION_UA.test(userAgent);
}

function authRiskKey(value = "") {
  return crypto.createHash("sha256").update(String(value || "")).digest("hex").slice(0, 32);
}

function authDeviceId(req = null, body = {}) {
  const raw = body?.deviceId || body?.device_id || req?.headers?.["x-device-id"] || "";
  return String(raw || "").normalize("NFKC").replace(/[^a-zA-Z0-9:_-]/g, "").slice(0, 128);
}

function authFingerprint(req = null, body = {}) {
  const raw = body?.fingerprint || body?.fingerprintHash || req?.headers?.["x-device-fingerprint"] || "";
  const clean = String(raw || "").trim().slice(0, 512);
  return clean ? authRiskKey(clean) : "";
}

function authDeviceRiskKey(req = null, body = {}) {
  const fingerprint = authFingerprint(req, body);
  if (fingerprint) return `fp:${fingerprint}`;
  const deviceId = authDeviceId(req, body);
  if (deviceId) return `device:${authRiskKey(deviceId)}`;
  const ua = authUserAgent(req);
  return ua ? `ua:${authRiskKey(ua)}` : "unknown";
}

function maskedAuthIp(ip = "") {
  const value = String(ip || "").trim();
  if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(value)) return value.replace(/\.\d{1,3}$/, ".*");
  if (value.includes(":")) return `${value.split(":").slice(0, 3).join(":")}:*`;
  return value ? `${value.slice(0, 3)}*` : "";
}

function authAuditMetadata(req = null, body = {}, extra = {}) {
  const ip = authClientIp(req);
  return {
    ...extra,
    ipHash: authRiskKey(ip),
    ipMasked: maskedAuthIp(ip),
    userAgent: authUserAgent(req),
    deviceId: authDeviceId(req, body),
    fingerprintHash: authFingerprint(req, body),
  };
}

async function authRateLimit(req, { action = "", limit = 1, windowMs = 60_000, includeAccount = "", includeIp = true } = {}) {
  if (!dbEnabled()) return { ok: true };
  const ip = authClientIp(req);
  const tenantId = requestTenantId(req);
  const windowBucket = Math.floor(Date.now() / Math.max(1000, Number(windowMs) || 60_000));
  const subject = String(includeAccount || "").trim().toLowerCase();
  const subjectKey = subject ? `${includeIp ? `${ip}:` : ""}${subject}` : ip;
  const key = `auth:${String(action)}:${tenantId}:${authRiskKey(subjectKey)}:${windowBucket}`;
  const result = await incrementRateLimitInDb(key, { windowMs });
  if (result.hits <= limit) return { ok: true, ip, result };
  try {
    await recordRiskEventInDb({
      eventType: "auth_rate_limited",
      scopeKey: key,
      tenantId,
      subject: includeAccount,
      ip,
      userAgent: authUserAgent(req),
      metadata: { ...authAuditMetadata(req, {}, { action, limit, windowMs, hits: result.hits }) },
    });
  } catch (error) {
    console.error(`[auth-risk] rate event failed: ${error.message}`);
  }
  return {
    ok: false,
    ip,
    result,
    retryAfterSeconds: result.retryAfterSeconds,
    response: { ok: false, code: "AUTH_RATE_LIMITED", message: "Too many requests. Please try again later." },
  };
}

function authRateLimitedResponse(res, rate = {}) {
  const seconds = Math.max(1, Number(rate.retryAfterSeconds || rate.result?.retryAfterSeconds || 1) || 1);
  res.setHeader("Retry-After", String(seconds));
  return sendJson(res, 429, {
    ...(rate.response || { ok: false, code: "AUTH_RATE_LIMITED", message: "Too many requests. Please try again later." }),
    retryAfterSeconds: seconds,
  });
}

async function enforceLoginRequestRisk(req, body = {}) {
  if (!dbEnabled()) return { ok: true };
  const minute = await authRateLimit(req, {
    action: "password_login_minute",
    limit: RISK_LOGIN_PER_MINUTE,
    windowMs: 60_000,
  });
  if (!minute.ok) return minute;
  const hour = await authRateLimit(req, {
    action: "password_login_hour",
    limit: RISK_LOGIN_PER_HOUR,
    windowMs: 60 * 60_000,
  });
  if (!hour.ok) return hour;
  return { ok: true };
}

async function enforceEmailRequestRisk(req, kind = "login", email = "") {
  if (!dbEnabled()) return { ok: true };
  const action = `email_${String(kind || "login")}_request`;
  const minute = await authRateLimit(req, { action: `${action}_minute`, limit: RISK_EMAIL_REQUEST_PER_MINUTE, windowMs: 60_000 });
  if (!minute.ok) return minute;
  const hour = await authRateLimit(req, { action: `${action}_hour`, limit: RISK_EMAIL_REQUEST_PER_HOUR, windowMs: 60 * 60_000 });
  if (!hour.ok) return hour;
  return await authRateLimit(req, {
    action: `${action}_address`,
    limit: 2,
    windowMs: 60 * 60_000,
    includeAccount: String(email || "").trim().toLowerCase(),
  });
}

async function enforceEmailVerifyRisk(req, email = "") {
  if (!dbEnabled()) return { ok: true };
  const minute = await authRateLimit(req, {
    action: "email_verify_minute",
    limit: RISK_EMAIL_VERIFY_PER_MINUTE,
    windowMs: 60_000,
  });
  if (!minute.ok) return minute;
  return await authRateLimit(req, {
    action: "email_verify_address",
    limit: 8,
    windowMs: 15 * 60_000,
    includeAccount: String(email || "").trim().toLowerCase(),
  });
}

async function enforceGoogleLoginRisk(req) {
  if (!dbEnabled()) return { ok: true };
  return await authRateLimit(req, {
    action: "google_login_minute",
    limit: RISK_GOOGLE_LOGIN_PER_MINUTE,
    windowMs: 60_000,
  });
}


const RISK_COMMON_DICTIONARY_NAMES = new Set([
  "admin", "administrator", "root", "founder", "owner", "owner01", "super", "superuser", "sysadmin", "god", "king",
  "test", "test1", "testa", "testb", "tester", "demo", "guest", "member", "player", "visitor", "user", "user1",
  "john", "mike", "tom", "david", "lily", "lucy", "anna", "amy", "zheng", "lisi", "zhangsan", "xiaoming", "xiaohong",
  "aaa", "bbb", "ccc", "ddd", "eee", "fff", "ggg", "hhh", "iii", "jjj", "kkk", "lll", "mmm", "nnn", "ooo", "ppp", "qqq", "rrr", "sss", "ttt", "uuu", "vvv", "www", "xxx", "yyy", "zzz",
  "0000", "1111", "2222", "3333", "4444", "5555", "6666", "7777", "8888", "9999",
]);

function registrationHeuristicReasons(req, body = {}, risk = {}) {
  const username = String(body?.username || "").trim().toLowerCase();
  const ua = authUserAgent(req);
  const reasons = [];
  if (risk.automated) reasons.push("automated_user_agent");
  if (!ua) reasons.push("missing_user_agent");
  if (RISK_COMMON_DICTIONARY_NAMES.has(username)) reasons.push("dictionary_username");
  if (/^([a-z0-9])\1{2,}$/i.test(username) || /^\d{4,}$/.test(username)) reasons.push("repetitive_username");
  if (!authDeviceId(req, body) && !authFingerprint(req, body)) reasons.push("missing_device_identity");
  return reasons;
}

async function enforceRegistrationRisk(req, { username = "", automatic = false, body = {} } = {}) {
  if (!dbEnabled()) return { ok: true };
  const ip = authClientIp(req);
  const automated = isAutomatedAuthUserAgent(req) || Boolean(automatic);
  const deviceKey = authDeviceRiskKey(req, body);
  const minute = await authRateLimit(req, {
    action: "register_minute",
    limit: RISK_REGISTER_PER_MINUTE,
    windowMs: 60_000,
  });
  if (!minute.ok) return minute;
  const hour = await authRateLimit(req, {
    action: automated ? "automated_register_hour" : "register_hour",
    limit: automated ? RISK_AUTOMATED_REGISTER_PER_HOUR : RISK_REGISTER_PER_HOUR,
    windowMs: 60 * 60_000,
  });
  if (!hour.ok) return hour;
  const day = await authRateLimit(req, {
    action: "register_day",
    limit: RISK_REGISTER_PER_DAY,
    windowMs: 24 * 60 * 60_000,
  });
  if (!day.ok) return day;
  const device = await authRateLimit(req, {
    action: "register_device_day",
    limit: RISK_DEVICE_REGISTER_PER_DAY,
    windowMs: 24 * 60 * 60_000,
    includeAccount: deviceKey,
    includeIp: false,
  });
  if (!device.ok) return device;
  return { ok: true, ip, automated, deviceKey };
}

async function recordRegistrationRiskEvent(req, { username = "", automatic = false, created = false, riskReasons = [] } = {}) {
  if (!dbEnabled()) return;
  try {
    await recordRiskEventInDb({
      eventType: created ? "auth_registration_created" : "auth_registration_attempt",
      scopeKey: `register:${requestTenantId(req)}`,
      tenantId: requestTenantId(req),
      subject: username,
      ip: authClientIp(req),
      userAgent: authUserAgent(req),
      metadata: authAuditMetadata(req, {}, { automatic: Boolean(automatic), username: String(username || "").slice(0, 64), riskReasons: Array.isArray(riskReasons) ? riskReasons.slice(0, 8).map(String) : [] }),
    });
  } catch (error) {
    console.error(`[auth-risk] registration event failed: ${error.message}`);
  }
}

function lockedAuthResponse(res, state = {}) {
  const seconds = Math.max(1, Number(state.retryAfterSeconds || 0) || 1);
  res.setHeader("Retry-After", String(seconds));
  return sendJson(res, 429, {
    ok: false,
    code: "AUTH_LOCKED",
    message: "Too many failed sign-in attempts. Please try again later.",
    retryAfterSeconds: seconds,
  });
}

async function loginLockState(req, username = "") {
  if (!dbEnabled()) return null;
  return await getLoginFailureStateInDb({
    tenantId: requestTenantId(req),
    username,
    ip: authClientIp(req),
    lockMs: RISK_LOCK_MINUTES * 60_000,
    maxFailures: RISK_LOCK_MAX_FAILURES,
    ipMaxFailures: RISK_IP_LOGIN_FAILURES,
    ipWindowMs: RISK_IP_LOGIN_WINDOW_MINUTES * 60_000,
  });
}

async function recordAuthLoginFailure(req, username = "") {
  if (!dbEnabled()) return null;
  try {
    const failure = await recordLoginFailureInDb({
      tenantId: requestTenantId(req),
      username,
      ip: authClientIp(req),
      maxFailures: RISK_LOCK_MAX_FAILURES,
      lockMs: RISK_LOCK_MINUTES * 60_000,
    });
    await recordRiskEventInDb({
      eventType: failure.lockedUntil ? "auth_login_locked" : "auth_login_failed",
      scopeKey: `login:${requestTenantId(req)}`,
      tenantId: requestTenantId(req),
      subject: username,
      ip: authClientIp(req),
      userAgent: authUserAgent(req),
      metadata: authAuditMetadata(req, {}, { failures: failure.failures, username: String(username || "").slice(0, 64) }),
    });
    return failure;
  } catch (error) {
    console.error(`[auth-risk] login failure record failed: ${error.message}`);
    return null;
  }
}

async function clearAuthLoginFailures(req, username = "") {
  if (!dbEnabled()) return;
  try {
    await clearLoginFailuresInDb({ tenantId: requestTenantId(req), username, ip: authClientIp(req) });
  } catch (error) {
    console.error(`[auth-risk] clear login failures failed: ${error.message}`);
  }
}
