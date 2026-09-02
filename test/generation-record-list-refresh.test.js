"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const server = fs.readFileSync(path.join(__dirname, "..", "server.js"), "utf8");
const platformCreate = fs.readFileSync(path.join(__dirname, "..", "platform.create.js"), "utf8");

function functionSource(name, nextName) {
  const start = server.indexOf(`async function ${name}`);
  const end = server.indexOf(`async function ${nextName}`, start + 1);
  assert.notEqual(start, -1, `${name} should exist`);
  assert.notEqual(end, -1, `${nextName} should follow ${name}`);
  return server.slice(start, end);
}

test("generation record lists enqueue refreshes without waiting for upstream", () => {
  const adminList = functionSource("handleAdminListGenerationRecords", "handleAdminGetGenerationRecord");
  const userList = functionSource("handleListGenerationRecords", "handleGetGenerationRecord");
  for (const source of [adminList, userList]) {
    assert.match(source, /queueGenerationRecordStatusRefreshes\(/);
    assert.doesNotMatch(source, /await\s+(?:Promise\.all\([^)]*refreshGenerationRecordStatus|refreshGenerationRecordStatus\()/);
  }
});

test("background list refreshes are deduplicated, cooled down, and concurrency limited", () => {
  assert.match(server, /const generationRecordRefreshQueued = new Set\(\)/);
  assert.match(server, /generationRecordRefreshQueued\.has\(taskId\)/);
  assert.match(server, /GENERATION_RECORD_REFRESH_COOLDOWN_MS/);
  assert.match(server, /generationRecordRefreshActive < GENERATION_RECORD_REFRESH_CONCURRENCY/);
  assert.match(server, /setImmediate\(\(\) => \{/);
});

test("single-task detail polling still waits for an upstream refresh", () => {
  const detail = functionSource("handleGetGenerationRecord", "handleGenerationRecordDownloadUrl");
  assert.match(detail, /nextRecord = await refreshGenerationRecordStatus\(record\)/);
});

test("Wan detail and background status refreshes never wait for video downloads", () => {
  const refreshStatus = functionSource("refreshGenerationRecordStatus", "findActiveSeedream5ImageDuplicate");
  const detail = functionSource("handleGetGenerationRecord", "handleGenerationRecordDownloadUrl");
  assert.match(refreshStatus, /refreshWan27GenerationRecord\(record, \{ download: false, reason: "query" \}\)/);
  assert.match(detail, /queueGenerationRecordStatusRefresh\(record, \{ priority: true, reason: "detail" \}\)/);
  assert.doesNotMatch(detail, /refreshWan27GenerationRecord\(record, \{ download: true/);
});

test("history detail polling updates the current page without fetching the list twice", () => {
  const start = platformCreate.indexOf("async function refreshPendingHistoryRecords");
  const end = platformCreate.indexOf("async function requestVideoFullscreen", start + 1);
  assert.notEqual(start, -1);
  assert.notEqual(end, -1);
  const source = platformCreate.slice(start, end);
  assert.match(source, /refreshedByTaskId/);
  assert.match(source, /state\.historyRecords = .*\.map/s);
  assert.doesNotMatch(source, /loadHistory\(/);
});

test("generation detail uses lightweight auth and does not reload the full database", () => {
  const detail = functionSource("handleGetGenerationRecord", "handleGenerationRecordDownloadUrl");
  assert.match(detail, /requireUser\(req, res, \{ loadDb: false \}\)/);
  assert.match(detail, /user: userView\(auth\.user\)/);
  assert.doesNotMatch(detail, /await readDb\(\)/);
});
