"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const server = fs.readFileSync(path.resolve(__dirname, "..", "server.parts", "part-40.js"), "utf8");

test("admin password reset invalidates every session for the target user", () => {
  const handler = server.match(/async function handleAdminResetPassword[\s\S]*?\n}\r?\n\r?\nasync function handleAdminDeleteUser/);
  assert.ok(handler, "admin password reset handler should be present");
  assert.match(handler[0], /auth\.db\.sessions = \(auth\.db\.sessions \|\| \[\]\)\.filter\(\(s\) => s\.userId !== userId\)/);
  assert.match(handler[0], /await deleteUserSessionsInDb\(userId\)/);
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
});
