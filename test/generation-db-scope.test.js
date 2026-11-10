"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

test("advanced generation jobs load only the creating user and that user's assets", () => {
  const part01 = read("server.parts/part-01.js");
  const part02 = read("server.parts/part-02.js");
  const part26 = read("server.parts/part-26.js");
  const db = read("db.js");
  const jobStart = part26.indexOf("async function runAdvancedGenerationJob");
  const jobEnd = part26.indexOf("function byteplusRequestId", jobStart);
  const job = part26.slice(jobStart, jobEnd);

  assert.ok(jobStart > 0 && jobEnd > jobStart);
  assert.doesNotMatch(job, /\breadDb\s*\(/);
  assert.match(job, /readGenerationJobDb\(userId\)/);
  assert.match(part02, /async function readGenerationJobDb\(userId = ""\)/);
  const part12 = read("server.parts/part-12.js");
  const part29 = read("server.parts/part-29.js");
  assert.match(part12, /loadCurrentUserAssets[\s\S]*?getUserAssetsForUserFromDb\(user\.id\)/);
  assert.match(part29, /const auth = await requireUser\(req, res, \{ loadDb: true, includeUserAssets: false, loadCurrentUserAssets: true \}\)/);
  assert.match(part29, /const latestUser = await getUserByIdInDb\(auth\.user\.id\) \|\| auth\.user/);
  assert.match(part02, /getUserByIdInDb\(cleanUserId\)/);
  assert.match(part02, /getUserAssetsForUserFromDb\(cleanUserId\)/);
  assert.match(part01, /getUserAssetsForUserFromDb/);
  assert.match(db, /async function getUserAssetsForUserFromDb\(userId = ""\)/);
  assert.match(db, /WHERE user_id = \$1[\s\S]*?deleted_at IS NULL/);
});

test("video tool jobs load only the creating user and that user's assets", () => {
  const part23 = read("server.parts/part-23.js");
  const runners = part23.slice(
    part23.indexOf("async function runVideoToolImageEdit"),
    part23.indexOf("const VIDEO_TOOL_JOB_CONCURRENCY"),
  );
  assert.ok(runners.length > 0);
  assert.doesNotMatch(runners, /\breadDb\s*\(/);
  const calls = runners.match(/readGenerationJobDb\(userId\)/g) || [];
  assert.equal(calls.length, 4);
  assert.match(runners, /async function runVideoToolImageEdit[\s\S]*?const db = await readGenerationJobDb\(userId\)/);
  assert.match(runners, /async function runVideoToolFaceSwap[\s\S]*?const db = await readGenerationJobDb\(userId\)/);
  assert.match(runners, /async function runVideoToolUndressImageVideo[\s\S]*?const db = await readGenerationJobDb\(userId\)/);
  assert.match(runners, /async function runVideoToolUndressVideoLegacy[\s\S]*?const db = await readGenerationJobDb\(userId\)/);
});


test("legacy full snapshots use one pooled connection and skip unused tables", () => {
  const db = read("db.js");
  const start = db.indexOf("async function readAppDbFromTables(");
  const end = db.indexOf("async function replaceAppDbTables(", start);
  const block = db.slice(start, end);
  assert.ok(start > 0 && end > start);
  assert.match(block, /const client = await getPool\(\)\.connect\(\)/);
  assert.match(block, /finally \{\s*client\.release\(\);/);
  assert.doesNotMatch(block, /Promise\.all\(\[/);
  assert.match(block, /const users = await readRows/);
  assert.match(block, /const sessions = await readRows/);
  assert.doesNotMatch(block, /SELECT \* FROM app_admin_home_items/);
  assert.doesNotMatch(block, /SELECT \* FROM app_support_messages/);
});

test("admin support replies do not load the full application snapshot", () => {
  const server = read("server.parts/part-33.js");
  const db = read("db.js");
  const start = server.indexOf("async function handleAdminReplySupportMessage(");
  const end = server.indexOf("async function handleListApiSubtokens(", start);
  const block = server.slice(start, end);
  assert.ok(start > 0 && end > start);
  assert.match(block, /requireAdmin\(req, res, \{ loadDb: false \}\)/);
  assert.match(block, /getSupportMessageByIdInDb\(messageId\)/);
  assert.match(db, /async function getSupportMessageByIdInDb\(messageId = ""\)/);
});
