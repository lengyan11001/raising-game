"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

test("task-scoped refunds require and cap a real charge in the same transaction", () => {
  const db = read("db.js");
  const start = db.indexOf("async function applyCreditDeltaInDb");
  const end = db.indexOf("async function generationRecordsTableCount", start);
  const fn = db.slice(start, end);

  assert.ok(start > 0 && end > start);
  assert.match(fn, /requireTaskCharge = false/);
  assert.match(fn, /FOR UPDATE/);
  assert.match(fn, /WHERE user_id = \$1[\s\S]*?meta->>'taskId' = \$2/);
  assert.match(fn, /type = ANY\(\$3::text\[\]\) OR type ILIKE '%refund%' OR type ILIKE '%reversal%'/);
  assert.match(fn, /charged <= 0\.000001[\s\S]*?skipped: true, reason: "charge-not-found"/);
  assert.match(fn, /refunded \+ amount > charged/);
  assert.match(fn, /REFUND_EXCEEDS_CHARGE/);
  assert.match(fn, /applyCreditDeltaInDb\(\{ id: cleanId, userId: cleanUserId, delta: amount, type: cleanType, meta, payload, requireTaskCharge, refundTypes \}\)/);
});

test("the shared refund entry uses the database charge guard and does not load the full snapshot", () => {
  const part = read("server.parts/part-12.js");
  const start = part.indexOf("async function refundCreditsWithSubtoken");
  const end = part.indexOf("async function changeUserCredits", start);
  const fn = part.slice(start, end);

  assert.ok(start > 0 && end > start);
  assert.match(fn, /applyCreditDeltaInDb\(/);
  assert.match(fn, /requireTaskCharge: true/);
  assert.match(fn, /if \(dbEnabled\(\)\) \{[\s\S]*?applyCreditDeltaInDb\([\s\S]*?\} else \{[\s\S]*?const db = await readDb\(\)/);
  assert.match(fn, /applied\?\.skipped/);
  assert.match(fn, /applied\?\.inserted === false/);
});

test("notification polling and Seedream jobs avoid the full application snapshot", () => {
  const notifications = read("server.parts/part-33.js");
  const seedream = read("server.parts/part-27.js");

  for (const name of ["handleListSystemNotifications", "handleReadSystemNotification", "handleReadAllSystemNotifications"]) {
    const start = notifications.indexOf(`async function ${name}`);
    const end = notifications.indexOf("\n}\n", start);
    assert.match(notifications.slice(start, end), /requireUser\(req, res, \{ loadDb: false \}\)/);
  }
  assert.match(seedream, /const db = await readGenerationJobDb\(userId\)/);
  assert.match(seedream, /const latestUser = await getUserByIdInDb\(auth\.user\.id\) \|\| auth\.user/);
});
