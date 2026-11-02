"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const server = fs.readFileSync(path.resolve(__dirname, "..", "server.js"), "utf8");

test("admin password reset invalidates every session for the target user", () => {
  const handler = server.match(/async function handleAdminResetPassword[\s\S]*?\n}\r?\n\r?\nasync function handleAdminDeleteUser/);
  assert.ok(handler, "admin password reset handler should be present");
  assert.match(handler[0], /auth\.db\.sessions = \(auth\.db\.sessions \|\| \[\]\)\.filter\(\(s\) => s\.userId !== userId\)/);
  assert.match(handler[0], /await deleteUserSessionsInDb\(userId\)/);
  assert.doesNotMatch(handler[0], /auth\.session/);
});
