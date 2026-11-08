"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const server = fs.readFileSync(path.resolve(__dirname, "..", "server.parts", "part-40.js"), "utf8");

test("admin password reset rotates the API token without ending browser sessions", () => {
  const handler = server.match(/async function handleAdminResetPassword[\s\S]*?\n}\r?\n\r?\nasync function handleAdminDeleteUser/);
  assert.ok(handler, "admin password reset handler should be present");
  assert.match(handler[0], /user\.apiToken = makeUniqueApiToken\(auth\.db\)/);
  assert.doesNotMatch(handler[0], /auth\.db\.sessions =/);
  assert.doesNotMatch(handler[0], /deleteUserSessionsInDb\(userId\)/);
  assert.doesNotMatch(handler[0], /auth\.session/);
});

test("user login keeps independent persistent sessions per device", () => {
  const part = fs.readFileSync(path.resolve(__dirname, "..", "server.parts", "part-02.js"), "utf8");
  const block = part.match(/async function createSingleLoginSession[\s\S]*?\n}\r?\n\r?\nfunction loginAccountKey/);
  assert.ok(block, "login session creator should be present");
  assert.match(block[0], /deviceId = ""/);
  assert.match(block[0], /const existing = normalizedDeviceId/);
  assert.match(block[0], /String\(item\.deviceId \|\| ""\) === normalizedDeviceId/);
  assert.match(block[0], /if \(existing\?\.token\) \{[\s\S]*?return existing;/);
  assert.match(block[0], /db\.sessions\.push\(session\)/);
  assert.match(block[0], /await createSessionInDb\(session\)/);
  assert.doesNotMatch(block[0], /replaceUserSessionInDb/);
  assert.doesNotMatch(block[0], /db\.sessions = .*\.filter/);
});

test("every browser login path forwards a stable device id", () => {
  const auth = fs.readFileSync(path.resolve(__dirname, "..", "server.parts", "part-32.js"), "utf8");
  assert.equal((auth.match(/createSingleLoginSession\(/g) || []).length, 5);
  assert.equal((auth.match(/createSingleLoginSession\([^\n]+body\.deviceId \|\| body\.device_id \|\| ""\)/g) || []).length, 4);
  assert.match(auth, /createSingleLoginSession\(account\.db, account\.user, normalizedTenant, deviceId\)/);
  assert.match(auth, /deviceId: body\.deviceId \|\| body\.device_id \|\| ""/);

  const password = fs.readFileSync(path.resolve(__dirname, "..", "platform.create.parts", "part-06.js"), "utf8");
  assert.equal((password.match(/deviceId: sessionDeviceId\(\)/g) || []).length, 2);
  assert.match(fs.readFileSync(path.resolve(__dirname, "..", "platform.google.js"), "utf8"), /deviceId: sessionDeviceId\(\)/);
  const telegram = fs.readFileSync(path.resolve(__dirname, "..", "platform.telegram.js"), "utf8");
  assert.equal((telegram.match(/deviceId: sessionDeviceId\(\)/g) || []).length, 2);
});


test("same device reuses its token while different devices stay signed in", async () => {
  const part = fs.readFileSync(path.resolve(__dirname, "..", "server.parts", "part-02.js"), "utf8");
  const functionSource = part.match(/async function createSingleLoginSession[\s\S]*?\n}\r?\n\r?\nfunction loginAccountKey/)[0]
    .replace(/\n\r?\nfunction loginAccountKey[\s\S]*$/, "");
  let writes = 0;
  const context = {
    crypto: require("node:crypto"),
    process,
    DEFAULT_TENANT_ID: "main",
    normalizeTenantId: (value) => String(value || "main"),
    dbEnabled: () => false,
    createSessionInDb: async () => { throw new Error("unexpected database write"); },
    writeDb: async () => { writes += 1; },
    loginAccountKey: () => "username:tester",
    module: { exports: {} },
  };
  vm.runInNewContext(`${functionSource}\nmodule.exports = createSingleLoginSession;`, context);
  const createSession = context.module.exports;
  const db = { sessions: [] };
  const user = { id: "user-1" };
  const first = await createSession(db, user, "main", "browser-a");
  const again = await createSession(db, user, "main", "browser-a");
  const second = await createSession(db, user, "main", "browser-b");
  const legacy = await createSession(db, user, "main");
  assert.equal(again.token, first.token);
  assert.notEqual(second.token, first.token);
  assert.notEqual(legacy.token, first.token);
  assert.equal(db.sessions.length, 3);
  assert.equal(db.sessions.filter((item) => item.token === first.token).length, 1);
  assert.equal(writes, 3);
  for (const session of [first, second, legacy]) {
    assert.ok(Date.parse(session.expiresAt) > Date.now());
  }
  const legacyExisting = { token: "legacy-token", userId: "user-1", tenantId: "main", deviceId: "browser-old", createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z" };
  db.sessions.push(legacyExisting);
  const reusedLegacy = await createSession(db, user, "main", "browser-old");
  assert.equal(reusedLegacy.token, legacyExisting.token);
  assert.equal(reusedLegacy.expiresAt, undefined);
});

test("legacy sessions without expiry remain valid while explicit expiry is enforced", () => {
  const database = fs.readFileSync(path.resolve(__dirname, "..", "db.js"), "utf8");
  assert.match(database, /expires_at TIMESTAMPTZ/);
  assert.match(database, /expires_at IS NULL OR expires_at > NOW\(\)/);
  assert.match(database, /expires_at = app_sessions\.expires_at/);
});
