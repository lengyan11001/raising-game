"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const read = (name) => fs.readFileSync(path.join(root, name), "utf8");

function loadRiskModule() {
  const source = read("server.parts/part-46.js");
  const sandbox = {
    console,
    crypto: require("node:crypto"),
    process,
    dbEnabled: () => true,
    requestTenantId: () => "main",
    sendJson: (res, status, body) => ({ res, status, body }),
    incrementRateLimitInDb: async () => ({ hits: 1, retryAfterSeconds: 30 }),
    recordRiskEventInDb: async () => ({}),
    getLoginFailureStateInDb: async () => ({ lockedUntil: null, retryAfterSeconds: 0 }),
    recordLoginFailureInDb: async () => ({ failures: 1, lockedUntil: null }),
    clearLoginFailuresInDb: async () => undefined,
  };
  vm.runInNewContext(`${source}\n;globalThis.__risk = { authClientIp, enforceRegistrationRisk, authRateLimitedResponse, authRateLimit };`, sandbox, {
    filename: "server.parts/part-46.js",
  });
  return sandbox.__risk;
}

function loadBusinessRiskModule({ hits = 1, unavailable = false } = {}) {
  const source = read("server.parts/part-46.js");
  const calls = [];
  const sandbox = {
    console,
    crypto: require("node:crypto"),
    process,
    dbEnabled: () => true,
    requestTenantId: () => "main",
    sendJson: (_res, status, body) => ({ status, body }),
    incrementRateLimitInDb: async (key, options) => {
      calls.push({ key, options });
      if (unavailable) throw new Error("database unavailable");
      return { hits: typeof hits === "function" ? hits() : hits, retryAfterSeconds: 17 };
    },
    recordRiskEventInDb: async () => ({}),
    getLoginFailureStateInDb: async () => ({ lockedUntil: null, retryAfterSeconds: 0 }),
    recordLoginFailureInDb: async () => ({ failures: 1, lockedUntil: null }),
    clearLoginFailuresInDb: async () => undefined,
  };
  vm.runInNewContext(`${source}\n;globalThis.__risk = { enforceBusinessRateLimit, authRateLimitedResponse };`, sandbox, {
    filename: "server.parts/part-46.js",
  });
  return { ...sandbox.__risk, calls };
}

test("forged CF-Connecting-IP is ignored when request comes directly from a public client", () => {
  const { authClientIp } = loadRiskModule();
  assert.equal(authClientIp({
    socket: { remoteAddress: "8.8.8.8" },
    headers: { "cf-connecting-ip": "1.1.1.1" },
  }), "8.8.8.8");
});

test("localhost proxy uses X-Real-IP instead of a client supplied CF header", () => {
  const { authClientIp } = loadRiskModule();
  assert.equal(authClientIp({
    socket: { remoteAddress: "127.0.0.1" },
    headers: { "x-real-ip": "9.9.9.9", "cf-connecting-ip": "1.1.1.1" },
  }), "9.9.9.9");
});

test("password login path enforces lockout, failures, and successful reset", () => {
  const auth = read("server.parts/part-32.js");
  const login = auth.match(/async function loginWithBody[\s\S]*?\n}\r?\n\r?\nasync function handleLogin/);
  assert.ok(login, "loginWithBody should exist");
  assert.match(login[0], /enforceLoginRequestRisk\(req, body\)/);
  assert.match(login[0], /loginLockState\(req, username\)/);
  assert.match(login[0], /recordAuthLoginFailure\(req, username\)/);
  assert.match(login[0], /clearAuthLoginFailures\(req, username\)/);
  assert.match(read("server.parts/part-46.js"), /code: "AUTH_LOCKED"/);
});

test("registration and every auth entry use small JSON body limits and rate controls", () => {
  const auth = read("server.parts/part-32.js");
  assert.match(auth, /const AUTH_JSON_BODY_MAX_BYTES = 32 \* 1024/);
  assert.match(read("server.parts/part-46.js"), /function enforceRegistrationRisk\(req,/);
  assert.match(auth, /PASSWORD_REGISTRATION_DISABLED/);
  assert.match(auth, /enforceEmailRequestRisk\(req, "login", body\.email\)/);
  assert.match(auth, /enforceEmailRequestRisk\(req, "reset", email\)/);
  assert.match(auth, /enforceEmailVerifyRisk\(req, email\)/);
  assert.match(auth, /enforceGoogleLoginRisk\(req\)/);
  assert.doesNotMatch(auth, /handle(Register|Login|LoginOrRegister|EmailLoginRequest|EmailLoginVerify|PasswordResetRequest|PasswordReset|AccountEmailRequest|AccountEmailVerify|GoogleLogin)[\s\S]{0,300}readJson\(req\)/);
});

test("risk summary uses channel query and returns recent users", () => {
  const db = read("db.js");
  const block = db.match(/async function getRiskSummaryFromDb[\s\S]*?\n}\r?\n\r?\nasync function createSessionInDb/);
  assert.ok(block, "risk summary function should exist");
  assert.match(block[0], /usersByChannel: usersByChannel\.rows/);
  assert.doesNotMatch(block[0], /usersByChannel: failures\.rows/);
  assert.match(block[0], /recentUsers:/);
  assert.match(block[0], /totalUsers:/);
});

test("admin dashboard exposes risk summary and requires admin route", () => {
  const admin = read("server.parts/part-40.js");
  const route = read("server.parts/part-42.js");
  assert.match(admin, /async function handleAdminRiskSummary/);
  assert.match(admin, /getRiskSummaryFromDb\(\{ sinceHours: hours \}\)/);
  assert.match(admin, /risk: riskSummary/);
  assert.match(route, /\/api\/admin\/risk-summary/);
});


test("device registration bucket is global even when client IP changes", async () => {
  const calls = [];
  const source = read("server.parts/part-46.js");
  const sandbox = {
    console,
    crypto: require("node:crypto"),
    process,
    dbEnabled: () => true,
    requestTenantId: () => "main",
    incrementRateLimitInDb: async (key) => { calls.push(key); return { hits: 1, retryAfterSeconds: 30 }; },
    recordRiskEventInDb: async () => ({}),
  };
  vm.runInNewContext(`${source}\n;globalThis.__risk = { enforceRegistrationRisk };`, sandbox, { filename: "server.parts/part-46.js" });
  const body = { deviceId: "same-device", fingerprint: "same-fingerprint" };
  await sandbox.__risk.enforceRegistrationRisk({ socket: { remoteAddress: "8.8.8.8" }, headers: { "user-agent": "Mozilla/5.0" } }, { username: "alpha", body });
  await sandbox.__risk.enforceRegistrationRisk({ socket: { remoteAddress: "9.9.9.9" }, headers: { "user-agent": "Mozilla/5.0" } }, { username: "bravo", body });
  const deviceKeys = calls.filter((key) => key.startsWith("auth:register_device_day:"));
  assert.equal(deviceKeys.length, 2);
  assert.equal(deviceKeys[0], deviceKeys[1]);
});

test("quarantined accounts cannot receive a login session", () => {
  const auth = read("server.parts/part-32.js");
  const login = auth.match(/async function loginWithBody[\s\S]*?\n}\r?\n\r?\nasync function handleLogin/);
  assert.ok(login);
  assert.match(login[0], /user\.riskStatus === "quarantined"/);
  assert.match(login[0], /ACCOUNT_QUARANTINED/);
});

test("admin users expose risk state, filter it, and allow manual review", () => {
  const admin = read("server.parts/part-40.js");
  const db = read("db.js");
  const ui = read("admin.js");
  assert.match(admin, /searchParams\.get\("riskStatus"\)/);
  assert.match(admin, /body\.riskStatus/);
  assert.match(admin, /riskReviewedAt/);
  assert.match(db, /riskStatus = ""/);
  assert.match(ui, /usersRiskFilter/);
  assert.match(ui, /editRiskStatus/);
});

test("auth risk retention cleanup is scheduled and bounded", () => {
  const db = read("db.js");
  const part23 = read("server.parts/part-23.js");
  assert.match(db, /async function cleanupAuthRiskDataInDb/);
  assert.match(db, /DELETE FROM app_rate_limits/);
  assert.match(db, /DELETE FROM app_risk_events/);
  assert.match(db, /DELETE FROM app_login_failures/);
  assert.match(part23, /cleanupAuthRiskDataInDb/);
});

test("quarantined accounts keep existing browser sessions but cannot use primary tokens or subtokens", () => {
  const auth = read("server.parts/part-12.js");
  const sessionBranch = auth.match(/const session = db\.sessions\.find[\s\S]*?const user = db\.users\.find/);
  assert.ok(sessionBranch, "session authentication branch should exist");
  assert.doesNotMatch(sessionBranch[0], /riskStatus === "quarantined"/);
  assert.ok((auth.match(/user\.riskStatus === "quarantined"/g) || []).length >= 2);
  assert.ok((auth.match(/parent\?\.riskStatus === "quarantined"|parent\.riskStatus === "quarantined"/g) || []).length >= 2);
  assert.match(auth, /quarantined: true/);
  assert.match(read("db.js"), /async function revokeUserCredentialsInDb/);
});

test("login failures lock the account across IPs after the configured threshold", () => {
  const db = read("db.js");
  assert.match(db, /WHERE tenant_id = \$1 AND username = \$2 AND last_failed_at >= \$3/);
  assert.match(db, /accountFailures >= Math\.max\(1, Number\(maxFailures\) \|\| 5\)/);
  const risk = read("server.parts/part-46.js");
  assert.match(risk, /maxFailures: RISK_LOCK_MAX_FAILURES/);
});

test("admin force logout is explicit and revokes sessions and subtokens", () => {
  const admin = read("server.parts/part-40.js");
  const update = admin.match(/async function handleAdminUpdateUser[\s\S]*?\n}\r?\n\r?\nasync function handleAdminResetPassword/);
  assert.ok(update, "admin update handler should exist");
  assert.match(update[0], /if \(body\.forceLogout === true\) \{[\s\S]*?revokeUserCredentialsInDb\(user\.id\)/);
  const ui = read("admin.js");
  assert.match(ui, /id="editForceLogout"/);
  assert.match(ui, /forceLogout: tpl\.querySelector\("#editForceLogout"\)\.checked === true/);
});

test("new password policy requires ten characters", () => {
  assert.match(read("server.parts/part-32.js"), /password\.length < 10/);
  assert.match(read("server.parts/part-40.js"), /password\.length < 10/);
  const ui = read("admin.js");
  assert.match(ui, /新密码（至少 10 位）/);
  assert.match(ui, /minlength="10"/);
  assert.doesNotMatch(ui, /if \(password\.length < 6\)/);
});

test("existing users with legacy short passwords can still submit the login form", () => {
  const createUi = read("platform.create.parts/part-06.js");
  const login = createUi.match(/async function submitLogin\(\) \{[\s\S]*?\n\}/);
  assert.ok(login, "submitLogin should exist");
  assert.match(login[0], /if \(!username \|\| !password\)/);
  assert.doesNotMatch(login[0], /password\.length\s*<\s*(?:6|10)/);
  assert.match(createUi, /new password \(at least 10 characters\)/i);
});

test("password registration is disabled without breaking existing password login", () => {
  const auth = read("server.parts/part-32.js");
  const login = auth.match(/async function loginWithBody[\s\S]*?\n}\r?\n\r?\nasync function handleLogin/);
  assert.ok(login, "password login handler should exist");
  assert.match(login[0], /verifyPassword\(password, user\.passwordHash\)/);
  assert.match(login[0], /createSingleLoginSession/);
  assert.doesNotMatch(login[0], /registerWithBody|registerIfMissing/);
  assert.match(auth, /function passwordRegistrationDisabledResponse\(res\)/);
  assert.match(auth, /code: "PASSWORD_REGISTRATION_DISABLED"/);
  assert.match(auth, /async function registerWithBody\(req, res\) \{\s*return passwordRegistrationDisabledResponse\(res\);/);
  assert.match(auth, /async function handleRegister\(req, res\) \{\s*return passwordRegistrationDisabledResponse\(res\);/);
  assert.match(auth, /async function handleLoginOrRegister\(req, res\) \{[\s\S]*?return loginWithBody\(req, res, body\);/);
});

test("email and Google account creation paths remain independent from password registration", () => {
  const auth = read("server.parts/part-32.js");
  assert.match(auth, /registrationChannel: "email"/);
  assert.match(auth, /registrationChannel: "google"/);
  assert.match(auth, /handleEmailLoginVerify/);
  assert.match(auth, /handleGoogleLogin/);
});

test("email-code and Google sign-in share one account by verified email", () => {
  const auth = read("server.parts/part-32.js");
  const db = read("db.js");
  assert.match(auth, /function verifiedEmailForUser\(user = \{\}\)/);
  assert.match(auth, /normalizeEmail\(user\.email\) \|\| normalizeEmail\(user\.googleEmail\)/);
  assert.match(auth, /function findUserByVerifiedEmailInDb/);
  assert.match(auth, /let user = dbEnabled\(\) \? await getUserByVerifiedEmailInDb\(email, tenantId\)/);
  assert.match(auth, /const emailUser = await getUserByVerifiedEmailInDb\(claims\.email, normalizedTenant\)/);
  assert.match(auth, /error\.code = "GOOGLE_IDENTITY_CONFLICT"/);
  assert.match(auth, /user\.email = user\.googleEmail/);
  assert.doesNotMatch(auth, /if \(!user\) \{\s*user = \{\s*id: randomId\("user"\)[^}]*googleId/);
  assert.match(auth, /verifiedEmailForUser\(item\) === normalized/);
  assert.match(auth, /code: "EMAIL_IDENTITY_CONFLICT"/);
  assert.match(auth, /getUserByVerifiedEmailInDb\(email, tenantId\)/);
  const googleAccount = auth.match(/async function ensureGoogleUserAccount[\s\S]*?\n}\r?\n\r?\nasync function handleGoogleLogin/);
  const telegramAccount = auth.match(/async function ensureTelegramUserAccount[\s\S]*?\n}\r?\n\r?\nasync function telegramUserSessionFromInitData/);
  assert.ok(googleAccount, "Google account provisioning should exist");
  assert.ok(telegramAccount, "Telegram account provisioning should exist");
  assert.doesNotMatch(googleAccount[0], /readDb\s*\(/);
  assert.doesNotMatch(telegramAccount[0], /readDb\s*\(/);
  assert.match(db, /CREATE UNIQUE INDEX IF NOT EXISTS app_users_tenant_verified_email_uidx/);
  assert.match(db, /async function hasAnyActiveUserInDb/);
});

test("security notice targets accounts without email or Google and opens email binding", () => {
  const html = read("platform.html");
  const config = read("platform.config.js");
  const create = read("platform.create.parts/part-06.js");
  const main = read("platform.main.js");
  const view = read("server.parts/part-10.js");
  assert.match(html, /id="accountSecurityNoticeDialog"/);
  assert.match(html, /id="securityNoticeBindBtn"/);
  assert.match(config, /accountSecurityNoticeDialog: document\.querySelector\("#accountSecurityNoticeDialog"\)/);
  assert.match(view, /googleLinked: Boolean\(user\.googleId\)/);
  assert.match(create, /return !String\(user\.email \|\| ""\)\.trim\(\) && user\.googleLinked !== true;/);
  assert.match(create, /openEmailBinding\(\{ focusEmail: true \}\)/);
  assert.match(read("platform.ui.parts/part-01.js"), /scheduleAccountSecurityNotice\(\{ force: userChanged && Boolean\(state\.user\) \}\)/);
  assert.match(main, /els\.securityNoticeBindBtn\?\.addEventListener\("click", openAccountEmailBindingFromNotice\)/);
});

test("email security notice auto-opens at most once per account", () => {
  const create = read("platform.create.parts/part-06.js");
  const account = read("server.parts/part-10.js");
  const routes = read("server.parts/part-42.js");
  assert.doesNotMatch(create, /ACCOUNT_SECURITY_NOTICE_SNOOZE|SnoozedUntil/);
  assert.match(create, /localStorage\.getItem\(ACCOUNT_SECURITY_NOTICE_SEEN_LOCAL_KEY/);
  assert.match(create, /return Boolean\(String\(user\?\.securityNoticeSeenAt \|\| ""\)\.trim\(\)\) \|\| accountSecurityNoticeSeenLocally\(user\);/);
  assert.match(create, /if \(accountSecurityNoticeSeen\(\)\) \{[\s\S]*?persistAccountSecurityNoticeSeen\(\)\.catch/);
  assert.match(create, /accountSecurityNoticeTimer = window\.setTimeout\(\(\) => \{\s*if \(!accountSecurityNoticeNeeded\(\) \|\| accountSecurityNoticeSeen\(\)\) return;/);
  assert.match(create, /els\.accountSecurityNoticeDialog\.showModal\(\);\s*refreshIcons\(\);\s*\/\/ Mark at display time[\s\S]*?persistAccountSecurityNoticeSeen\(\)\.catch/);
  assert.match(create, /requestJson\("\/api\/account\/security-notice-seen", \{ method: "POST", body: \{\} \}\)/);
  assert.match(account, /securityNoticeSeenAt: String\(user\.securityNoticeSeenAt \|\| ""\)/);
  assert.match(account, /async function handleAccountSecurityNoticeSeen\(req, res\)/);
  assert.match(account, /auth\.user\.securityNoticeSeenAt = new Date\(\)\.toISOString\(\)/);
  assert.match(routes, /\/api\/account\/security-notice-seen/);
});

test("anonymous support and chat report preserve source attribution", () => {
  const support = read("server.parts/part-33.js");
  const chat = read("platform.chat.js");
  const explore = read("platform.explore.js");
  const html = read("platform.html");
  assert.match(support, /"security notice", "telegram", "chat report"/);
  assert.match(chat, /source: "chat report"/);
  assert.match(explore, /source: els\.supportDialog\?\.dataset\.source/);
  assert.match(html, /platform\.css\?v=[^"]+/);
});

test("logout requires confirmation and expired sessions clear stale account views", () => {
  const createUi = read("platform.create.parts/part-06.js");
  const uiClient = read("platform.ui.parts/part-04.js");
  const uiState = read("platform.ui.parts/part-01.js");
  const logout = createUi.match(/async function logout\(\) \{[\s\S]*?\n}\r?\n\r?\nfunction renderLoginForm/);
  assert.ok(logout, "logout should exist");
  assert.match(logout[0], /state\.logoutPending/);
  assert.match(logout[0], /account\.logoutConfirmTitle/);
  assert.match(logout[0], /account\.logoutConfirmBody/);
  assert.match(logout[0], /\) === "confirm"/);
  assert.match(logout[0], /if \(!confirmed\) return;/);
  assert.match(logout[0], /clearClientAuthState\(\)/);
  assert.match(uiClient, /const sessionLost = response\.status === 401 && Boolean\(state\.token\)[\s\S]*?clearClientAuthState\(\);/);
  const clear = uiClient.match(/function clearClientAuthState\(\) \{[\s\S]*?\n}\r?\n/);
  assert.ok(clear, "clearClientAuthState should exist");
  assert.match(clear[0], /setUser\(null\)/);
  assert.match(clear[0], /renderHistory\(\[\]\)/);
  assert.match(uiState, /state\.historyRecords = \[\];/);
  assert.match(uiState, /state\.advancedResultRecords = \[\];/);
});


test("business rate limits are account scoped, return Retry-After, and fail closed when storage is unavailable", async () => {
  const limited = loadBusinessRiskModule({ hits: 31 });
  const headers = {};
  const res = { setHeader: (name, value) => { headers[name] = value; } };
  const req = { socket: { remoteAddress: "8.8.8.8" }, headers: {} };
  const allowed = await limited.enforceBusinessRateLimit(req, res, { user: { id: "u1" } }, { action: "image_generate", limit: 30, windowMs: 600000 });
  assert.equal(allowed, false);
  assert.equal(headers["Retry-After"], "17");
  assert.equal(limited.calls[0].key.includes("business:image_generate:main:"), true);
  assert.equal(limited.calls[0].key.includes("8.8.8.8"), false);

  const unavailable = loadBusinessRiskModule({ unavailable: true });
  const unavailableRes = { setHeader: () => {} };
  const denied = await unavailable.enforceBusinessRateLimit(req, unavailableRes, { user: { id: "u1" } }, { action: "image_generate", limit: 30, windowMs: 600000 });
  assert.equal(denied, false);
  assert.equal(unavailable.calls.length, 1);
});

test("normal and media request bodies have separated size limits", () => {
  const source = read("server.parts/part-01.js");
  assert.match(source, /JSON_BODY_MAX_BYTES = Math\.floor\(clampNumber\(process\.env\.JSON_BODY_MAX_MB, 1, 1, 8\)/);
  assert.match(source, /JSON_MEDIA_BODY_MAX_BYTES = Math\.floor\(clampNumber\(process\.env\.JSON_MEDIA_BODY_MAX_MB, 140, 16, 200\)/);
  const mediaRoutes = [
    "server.parts/part-07.js",
    "server.parts/part-09.js",
    "server.parts/part-10.js",
    "server.parts/part-17.js",
    "server.parts/part-48.js",
    "server.parts/part-29.js",
    "server.parts/part-36.js",
    "server.parts/part-38.js",
    "server.parts/part-39.js",
    "server.parts/part-41.js",
  ];
  for (const file of mediaRoutes) assert.match(read(file), /readJson\(req, JSON_MEDIA_BODY_MAX_BYTES\)/, file);
  const jsonSource = read("server.parts/part-24.js");
  const start = jsonSource.indexOf("async function readRawBody");
  const end = jsonSource.indexOf("function clampNumber", start);
  const readRawBody = new Function("JSON_BODY_MAX_BYTES", `${jsonSource.slice(start, end)}\nreturn readRawBody;`)(1024);
  const exact = require("node:stream").Readable.from([Buffer.alloc(1024, 97)]);
  const tooLarge = require("node:stream").Readable.from([Buffer.alloc(1025, 97)]);
  return readRawBody(exact).then((body) => {
    assert.equal(Buffer.byteLength(body), 1024);
    return assert.rejects(readRawBody(tooLarge), (error) => error.statusCode === 413 && error.code === "REQUEST_BODY_TOO_LARGE");
  });
});

test("HTTP timing-safe comparisons execute without relying on an outer module scope", () => {
  const { timingSafeEqualString } = require("../lib-http");
  assert.equal(timingSafeEqualString("webhook-secret", "webhook-secret"), true);
  assert.equal(timingSafeEqualString("webhook-secret", "wrong-secret"), false);
});

test("transient database failures preserve login state on user and admin surfaces", () => {
  const part32 = read("server.parts/part-32.js");
  const me = part32.match(/async function handleMe\([\s\S]*?\n}\r?\n\r?\nasync function handleGetCompanionLevel/);
  assert.ok(me, "handleMe should exist");
  assert.match(me[0], /getAuth\(req, \{ loadDb: false \}\)/);
  assert.match(me[0], /await hydrateAuthSummaryDb\(auth\)/);
  const summary = read("db.js").match(/async function getUserAuthSummaryFromDb\([\s\S]*?\n}\r?\n\r?\nasync function getUserAssetsByIdsFromDb/);
  assert.ok(summary, "single-user auth summary reader should exist");
  assert.match(summary[0], /FROM app_wallet_orders o/);
  assert.match(summary[0], /FROM app_user_characters c/);
  assert.match(summary[0], /FROM app_credit_ledger l/);
  assert.match(summary[0], /AS gifts_received/);
  assert.match(summary[0], /creditLedger: \[\]/);
  assert.doesNotMatch(summary[0], /jsonb_agg\(to_jsonb\(l\)/);
  assert.doesNotMatch(summary[0].split("\n", 4).join("\n"), /readAppDbFromTables|readDb\(/);

  const admin = read("admin.js");
  const bootstrapFetch = admin.match(/async function fetchBootstrapMe\([\s\S]*?\n}\r?\n\r?\nasync function bootstrap/);
  assert.ok(bootstrapFetch, "admin bootstrap fetch should exist");
  assert.match(bootstrapFetch[0], /response\.status === 401 \|\| code === "LOGIN_REQUIRED" \|\| code === "SESSION_REPLACED"/);
  assert.match(bootstrapFetch[0], /response\.status === 401 \|\| code === "LOGIN_REQUIRED" \|\| code === "SESSION_REPLACED"/);
  const bootstrap = admin.match(/async function bootstrap\(\) \{[\s\S]*?\n}\r?\n\r?\nels\.loginForm/);
  assert.ok(bootstrap, "admin bootstrap should exist");
  assert.match(bootstrap[0], /if \(!response\.ok\)[\s\S]*?const sessionRejected = response\.status === 401 \|\| code === "LOGIN_REQUIRED" \|\| code === "SESSION_REPLACED"/);
  assert.match(bootstrap[0], /showBootstrapUnavailable\(payload\?\.message \|\| `管理服务暂时不可用（\$\{response\.status\}）`\)/);
  assert.match(bootstrap[0], /catch \(err\) \{[\s\S]*?showBootstrapUnavailable/);

  const createUi = read("platform.create.parts/part-06.js");
  const loadMe = createUi.match(/async function loadMe\(\) \{[\s\S]*?\n}\r?\n\r?\nasync function loadBillingSummary/);
  assert.ok(loadMe, "platform loadMe should exist");
  assert.match(loadMe[0], /if \(error\?\.statusCode === 401\) \{[\s\S]*?setUser\(null\)/);
  assert.match(loadMe[0], /console\.warn\("session restore temporarily unavailable"/);

  const app = read("app.js");
  const appSession = app.match(/async function loadSession\(\) \{[\s\S]*?\n}\r?\n\r?\nfunction renderAssetLibrary/);
  assert.ok(appSession, "app loadSession should exist");
  assert.match(appSession[0], /if \(error\?\.status === 401 \|\| error\?\.code === "SESSION_REPLACED"\)/);
  assert.match(appSession[0], /console\.warn\("session restore temporarily unavailable"/);

  const game = read("game.js");
  const gameSession = game.match(/async function loadSession\(\) \{[\s\S]*?\n}\r?\n\r?\n?async function loadConfig/);
  assert.ok(gameSession, "game loadSession should exist");
  assert.match(gameSession[0], /if \(error\?\.status === 401 \|\| error\?\.code === "SESSION_REPLACED"\)/);
  assert.match(gameSession[0], /console\.warn\("session restore temporarily unavailable"/);
});

test("anonymous auth and existing-user credential login avoid full application snapshots", () => {
  const auth = read("server.parts/part-12.js");
  const getAuth = auth.match(/async function getAuth\(req, options = \{\}\) \{[\s\S]*?\n}\r?\n\r?\nasync function requireUser/);
  assert.ok(getAuth, "getAuth should exist");
  assert.match(getAuth[0], /if \(!token\) return \{ db: lightweightAuthDb\(\)/);
  assert.doesNotMatch(getAuth[0], /if \(!token\) return \{ db: loadDb \? await readDb/);

  const part32 = read("server.parts/part-32.js");
  const login = part32.match(/async function loginWithBody[\s\S]*?\n}\r?\n\r?\nasync function handleLogin/);
  assert.ok(login, "password login should exist");
  assert.doesNotMatch(login[0], /readDb\s*\(/);
  assert.match(login[0], /getUserByUsernameInDb\(username, tenantId\)/);

  const emailSession = part32.match(/async function createEmailSession[\s\S]*?\n}\r?\n\r?\nasync function handleEmailLoginRequest/);
  assert.ok(emailSession, "email session should exist");
  assert.match(emailSession[0], /getUserByVerifiedEmailInDb\(email, tenantId\)/);
  assert.match(emailSession[0], /let db = lightweightAuthDb\(\)/);
  assert.doesNotMatch(emailSession[0], /if \(!user\) \{\s*db = await readDb\(\)/);

  const db = read("db.js");
  assert.match(db, /async function getSessionByUserDeviceInDb/);
  assert.match(db, /payload->>'deviceId' = \$3/);
  assert.match(db, /async function getUserByVerifiedEmailInDb/);
  assert.match(db, /CREATE INDEX IF NOT EXISTS app_sessions_user_device_idx/);
});
