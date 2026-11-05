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

  assert.match(source, /SELECT id FROM app_users[\s\S]*?WHERE id = \$1 OR username = \$1/);
  assert.match(source, /where\.push\(`records\.payload->>'userId' = \$\{addParam\(exactUserId\)\}`\)/);
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
  assert.match(admin, /async function openGenerationRecordDetail[\s\S]*?fetchAdminGenerationRecordDetail\(record\)/);
});
