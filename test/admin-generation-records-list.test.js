"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const db = fs.readFileSync(path.join(__dirname, "..", "db.js"), "utf8");
const server = require("../server-source").readServerSource();
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

test("admin generation details always load the complete record from the separate endpoint", () => {
  assert.match(db, /async function getGenerationRecordFromDb\(taskId\)[\s\S]*?SELECT payload FROM app_generation_records WHERE task_id = \$1/);
  assert.match(server, /async function handleAdminGetGenerationRecord[\s\S]*?const record = await getGenerationRecord\(decodeURIComponent\(taskId\)\)/);
  assert.match(server, /async function handleAdminGetGenerationRecord[\s\S]*?requireAdmin\(req, res, \{ loadDb: false \}\)/);
  assert.match(admin, /async function openGenerationRecordDetail[\s\S]*?fetchAdminGenerationRecordDetail\(record\)/);
  const start = admin.indexOf("async function fetchAdminGenerationRecordDetail");
  const end = admin.indexOf("async function openGenerationRecordDetail", start + 1);
  const source = admin.slice(start, end);
  assert.match(source, /const payload = await api\(`\/api\/admin\/generation-records\/\$\{encodeURIComponent\(record\.taskId\)\}`\)/);
  assert.doesNotMatch(source, /return record;\s*\}\s*const payload/);
});

test("admin generation media detail preserves stable reference indexes and all media kinds", () => {
  const detailStart = server.indexOf("async function handleAdminGetGenerationRecord");
  const detailEnd = server.indexOf("async function handleAdminGenerationRecordReferenceMedia", detailStart + 1);
  const detailSource = server.slice(detailStart, detailEnd);
  assert.match(detailSource, /const referenceIndex = Number\.isInteger\(Number\(asset\?\.referenceIndex\)\)/);
  assert.match(detailSource, /const directPreviewUrl = adminRecordMediaAssetUrl\(asset\)/);
  assert.match(detailSource, /adminPreviewUrl: signedPreviewUrl \|\| directPreviewUrl/);

  const mediaStart = server.indexOf("function adminRecordMediaAssetUrl");
  const mediaEnd = server.indexOf("async function ensureGenerationRecordImageR2Published", mediaStart + 1);
  const mediaSource = server.slice(mediaStart, mediaEnd);
  assert.match(mediaSource, /asset\.cdnUrl/);
  assert.match(mediaSource, /asset\.videoUrl/);
  assert.match(mediaSource, /asset\.audioUrl/);
  assert.match(mediaSource, /signedOssCdnUrlForDelivery\(value, \{ key: storageKey \}\) \|\| value/);
  assert.match(mediaSource, /linked\?\.objectStorageKey/);
  assert.doesNotMatch(mediaSource, /if \(!ids\.length\) return/);

  assert.match(admin, /function recordReferenceAudioAssets/);
  assert.match(admin, /"reference_audio"/);
  assert.match(admin, /class="adm-record-reference-audio"/);
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
  assert.match(querySource, /FROM app_wallet_orders/);
  assert.match(querySource, /FROM app_generation_records/);
  assert.match(querySource, /users_today/);
  assert.match(querySource, /generation_succeeded/);
  assert.match(querySource, /successRate7d/);
  assert.match(querySource, /recentFailures/);
  assert.doesNotMatch(querySource, /app_user_characters/);

  const handlerStart = server.indexOf("async function handleAdminDashboard");
  const handlerEnd = server.indexOf("async function handleAdminListUsers", handlerStart + 1);
  const handlerSource = server.slice(handlerStart, handlerEnd);
  assert.match(handlerSource, /requireAdmin\(req, res, \{ loadDb: false \}\)/);
  assert.match(handlerSource, /getAdminDashboardStatsFromDb\(\)/);
  assert.doesNotMatch(handlerSource, /readGenerationRecords\(\)/);
  assert.doesNotMatch(handlerSource, /adminCharacters|characterVisits|userCharacters|userSceneVideos/);

  const dashboardUi = admin.slice(admin.indexOf("async function renderDashboard"), admin.indexOf("function statCard", admin.indexOf("async function renderDashboard")));
  assert.match(dashboardUi, /用户增长、活跃情况与生成任务执行情况/);
  assert.match(dashboardUi, /generationStatuses/);
  assert.match(dashboardUi, /最近失败任务/);
  assert.match(dashboardUi, /href="#\/records"/);
  assert.doesNotMatch(dashboardUi, /系统角色访问统计|用户自定义角色|角色 PV|角色 UV/);
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
