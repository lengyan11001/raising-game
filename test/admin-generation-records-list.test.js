"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const db = fs.readFileSync(path.join(__dirname, "..", "db.js"), "utf8");
const server = fs.readFileSync(path.join(__dirname, "..", "server.js"), "utf8");
const admin = fs.readFileSync(path.join(__dirname, "..", "admin.js"), "utf8");

test("admin generation list resolves exact users before broad payload search", () => {
  const start = db.indexOf("async function getAdminGenerationRecordsPageFromDb");
  const end = db.indexOf("async function getGenerationRecordFromDb", start + 1);
  assert.notEqual(start, -1);
  assert.notEqual(end, -1);
  const source = db.slice(start, end);

  assert.match(source, /SELECT id FROM app_users[\s\S]*?WHERE \(id = \$1 OR username = \$1 OR LOWER\(username\) = LOWER\(\$1\)\)/);
  assert.match(source, /where\.push\(`records\.payload->>'userId' = ANY\(\$\{addParam\(exactUserIds\)\}::text\[\]\)`\)/);
  assert.match(source, /records\.task_id = \$\{addParam\(cleanSearch\)\}/);
  assert.match(source, /\$\{needsUserJoin \? "LEFT JOIN app_users users ON users\.id = records\.payload->>'userId'" : ""\}/);
});

test("admin generation list omits heavy detail payloads from the page query", () => {
  const start = db.indexOf("async function getAdminGenerationRecordsPageFromDb");
  const end = db.indexOf("async function getGenerationRecordFromDb", start + 1);
  const source = db.slice(start, end);

  assert.match(source, /'upstreamPayload', 'createResponse', 'queryResponse', 'pricingEstimate'/);
  assert.match(source, /'params', 'mediaAssets', 'usage'/);
  assert.match(source, /SELECT \$\{listPayloadSql\} AS payload, COUNT\(\*\) OVER\(\)::int AS total_count/);
  assert.doesNotMatch(source, /SELECT records\.payload\s+\$\{fromSql\}/);
});

test("admin generation details still load the complete record from the separate endpoint", () => {
  assert.match(db, /async function getGenerationRecordFromDb\(taskId\)[\s\S]*?SELECT payload FROM app_generation_records WHERE task_id = \$1/);
  assert.match(server, /async function handleAdminGetGenerationRecord[\s\S]*?const record = await getGenerationRecord\(decodeURIComponent\(taskId\)\)/);
  assert.match(server, /async function handleAdminGetGenerationRecord[\s\S]*?requireAdmin\(req, res, \{ loadDb: false \}\)/);
  assert.match(admin, /async function openGenerationRecordDetail[\s\S]*?fetchAdminGenerationRecordDetail\(record\)/);
});


test("admin generation exact-user search counts and pages separately", () => {
  const start = db.indexOf("async function getAdminGenerationRecordsPageFromDb");
  const end = db.indexOf("async function getGenerationRecordFromDb", start + 1);
  const source = db.slice(start, end);

  assert.match(source, /if \(exactSearchMatched && exactUserIds\.length > 0/);
  assert.match(source, /SELECT COUNT\(\*\)::int AS count \$\{fromSql\} \$\{whereSql\}/);
  assert.match(source, /SELECT \$\{listPayloadSql\} AS payload\s+\$\{fromSql\}/);
  const exactBranch = source.slice(source.indexOf("if (exactSearchMatched && exactUserIds.length > 0"), source.indexOf("const pageParams", source.indexOf("if (exactSearchMatched && exactUserIds.length > 0")));
  assert.doesNotMatch(exactBranch, /COUNT\(\*\) OVER\(\)/);
});

test("admin dashboard uses one aggregate query instead of loading the entire app database", () => {
  const dashboardStart = db.indexOf("async function getAdminDashboardStatsFromDb");
  const dashboardEnd = db.indexOf("async function getAdminGenerationRecordsPageFromDb", dashboardStart + 1);
  assert.notEqual(dashboardStart, -1);
  assert.notEqual(dashboardEnd, -1);
  const querySource = db.slice(dashboardStart, dashboardEnd);
  assert.match(querySource, /FROM app_users WHERE deleted_at IS NULL/);
  assert.match(querySource, /FROM app_user_characters WHERE deleted_at IS NULL/);
  assert.match(querySource, /FROM app_wallet_orders/);
  assert.match(querySource, /FROM app_generation_records/);

  const handlerStart = server.indexOf("async function handleAdminDashboard");
  const handlerEnd = server.indexOf("async function handleAdminListUsers", handlerStart + 1);
  const handlerSource = server.slice(handlerStart, handlerEnd);
  assert.match(handlerSource, /requireAdmin\(req, res, \{ loadDb: false \}\)/);
  assert.match(handlerSource, /getAdminDashboardStatsFromDb\(\)/);
  assert.doesNotMatch(handlerSource, /readGenerationRecords\(\)/);
});

test("admin overview uses paginated database readers instead of loading all records", () => {
  const start = server.indexOf("async function handleAdminList(req, res)");
  const end = server.indexOf("async function handleAdminUploadHomeImage", start + 1);
  assert.notEqual(start, -1);
  assert.notEqual(end, -1);
  const source = server.slice(start, end);
  assert.match(source, /requireAdmin\(req, res, \{ loadDb: false \}\)/);
  assert.match(source, /getAdminUsersPageFromDb\(\{ page: 1, limit: 100 \}\)/);
  assert.match(source, /getAdminWalletOrdersPageFromDb\(\{ page: 1, limit: 100 \}\)/);
  assert.match(source, /getAdminUserAssetsPageFromDb\(\{ page: 1, limit: 100 \}\)/);
  assert.match(source, /getAdminGenerationRecordsPageFromDb\(\{ page: 1, limit: 30 \}\)/);
  assert.doesNotMatch(source.slice(source.indexOf("if (dbEnabled())"), source.indexOf("const records = await readGenerationRecords()")), /readGenerationRecords\(\)/);
});
