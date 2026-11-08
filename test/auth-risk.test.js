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
  assert.match(auth, /enforceRegistrationRisk\(req, \{ username, body \}\)/);
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
