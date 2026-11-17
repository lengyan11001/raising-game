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
  assert.match(block, /const users = scopedAccount/);
  assert.match(block, /const sessions = scopedAccount/);
  assert.doesNotMatch(block, /SELECT \* FROM app_admin_home_items/);
  assert.doesNotMatch(block, /SELECT \* FROM app_support_messages/);
});

test("authenticated requests load only the current user's media assets", () => {
  const part02 = read("server.parts/part-02.js");
  const part12 = read("server.parts/part-12.js");
  const db = read("db.js");
  const authStart = part12.indexOf("async function getAuth(req, options = {}) {");
  const authEnd = part12.indexOf("async function requireUser", authStart);
  const auth = part12.slice(authStart, authEnd);
  const readStart = db.indexOf("async function readAppDbFromTables(");
  const readEnd = db.indexOf("async function replaceAppDbTables(", readStart);
  const readSnapshot = db.slice(readStart, readEnd);

  assert.ok(authStart > 0 && authEnd > authStart);
  assert.match(part02, /userAssetsUserId: String\(options\.userAssetsUserId \|\| ""\)\.trim\(\)/);
  assert.match(auth, /userAssetsUserId: options\.includeAllUserAssets \? "" : user\.id/);
  assert.match(auth, /const includeAllAccountData = options\.includeAllAccountData === true \|\| options\.includeAllUserAssets === true/);
  assert.match(auth, /accountUserId: includeAllAccountData \? "" : user\.id/);
  assert.match(auth, /includeAllAccountData,/);
  assert.match(auth, /const session = await getSessionByTokenInDb\(token\)/);
  assert.match(auth, /const user = await getUserByIdInDb\(session\.userId\)/);
  assert.ok(auth.indexOf("getSessionByTokenInDb") < auth.indexOf("readAuthDb(user)"));
  assert.match(auth, /return \{ db: lightweightAuthDb\(\), user: null/);
  assert.match(readSnapshot, /SELECT \* FROM app_user_assets WHERE user_id = \$1 ORDER BY created_at DESC/);
  assert.match(part12, /includeAllUserAssets: true, \.\.\.options/);
});

test("authenticated snapshots scope account tables while admin keeps full reads", () => {
  const db = read("db.js");
  const part02 = read("server.parts/part-02.js");
  const auth = read("server.parts/part-12.js");
  const start = db.indexOf("async function readAppDbFromTables(");
  const end = db.indexOf("async function replaceAppDbTables(", start);
  const block = db.slice(start, end);

  assert.ok(start > 0 && end > start);
  assert.match(part02, /accountUserId: String\(options\.accountUserId \|\| ""\)\.trim\(\)/);
  assert.match(part02, /includeAllAccountData: options\.includeAllAccountData === true/);
  assert.match(auth, /accountUserId: includeAllAccountData \? "" : user\.id/);
  assert.match(block, /SELECT \* FROM app_users WHERE id = \$1 AND deleted_at IS NULL/);
  assert.match(block, /SELECT \* FROM app_sessions WHERE user_id = \$1/);
  assert.match(block, /SELECT \* FROM app_wallet_orders WHERE user_id = \$1/);
  assert.match(block, /SELECT \* FROM app_referral_withdrawals WHERE user_id = \$1/);
  assert.match(block, /SELECT \* FROM app_credit_ledger WHERE user_id = \$1/);
  assert.match(block, /SELECT \* FROM app_user_characters WHERE user_id = \$1/);
  assert.match(block, /SELECT \* FROM app_user_unlocks WHERE user_id = \$1/);
  assert.match(block, /includeAllAccountData === true \|\| !accountUserId/);
  assert.match(block, /scopedAccount\s*\? await readRows\(`SELECT \* FROM app_users WHERE id = \$1/);
  assert.match(block, /: await readRows\(`SELECT \* FROM app_users WHERE deleted_at IS NULL/);
});

test("referral pages explicitly retain cross-user account summaries", () => {
  const part33 = read("server.parts/part-33.js");
  const part34 = read("server.parts/part-34.js");
  assert.match(part33, /async function handleReferralSummary[\s\S]*?includeAllAccountData: true, includeUserAssets: false/);
  assert.match(part33, /async function handleRedeemMembershipActivationCode[\s\S]*?includeAllAccountData: true, includeUserAssets: false/);
  assert.match(part34, /async function handleUpdateReferralWallet[\s\S]*?includeAllAccountData: true, includeUserAssets: false/);
  assert.match(part34, /async function handleCreateReferralWithdrawal[\s\S]*?includeAllAccountData: true, includeUserAssets: false/);
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
