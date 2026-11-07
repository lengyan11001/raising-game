"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const create = fs.readFileSync(path.join(root, "platform.create.js"), "utf8");
const explore = fs.readFileSync(path.join(root, "platform.explore.js"), "utf8");

test("result entry refreshes server detail even when history is cached", () => {
  const sideTab = create.match(/if \(next === "result"\) \{[\s\S]*?\n  \}/)?.[0] || "";
  assert.ok(sideTab, "setAdvancedSideTab result branch should exist");
  assert.match(sideTab, /if \(state\.user\) refreshAdvancedResultRecord\(\);/);
  assert.doesNotMatch(sideTab, /setInterval/);
});

test("history fallback records participate in the one-shot detail refresh", () => {
  const refreshIds = create.match(/function advancedResultRefreshTaskIds\(\) \{[\s\S]*?\n\}/)?.[0] || "";
  assert.ok(refreshIds, "advancedResultRefreshTaskIds should exist");
  assert.match(refreshIds, /advancedResultHistoryFallbackRecords\(\)\.forEach\(\(record\) => pushTaskId\(record\.taskId\)\)/);
});

test("fresh server detail overrides stale local task status", () => {
  const merge = create.match(/function mergeAdvancedResultRecord\(record = \{\}\) \{[\s\S]*?\n\}/)?.[0] || "";
  assert.ok(merge, "mergeAdvancedResultRecord should exist");
  assert.match(merge, /const merged = previous \? advancedResultRecordWithMediaFallback\(previous, record\) : record;/);
  assert.match(merge, /sortAdvancedResultRecords\(/);
  assert.doesNotMatch(merge, /slice\(0, 6\)/);
});

test("advanced result entry has no duplicate detail request", () => {
  assert.doesNotMatch(explore, /renderAdvancedResultPanel\(\);\s*if \(state\.advancedSideTab === "result" && state\.user && state\.advancedResultRecords\?\.length\) refreshAdvancedResultRecord\(\);/);
});

test("pending results use the account-level interval instead of a second result loop", () => {
  assert.match(create, /const ADVANCED_RESULT_POLL_INTERVAL_MS = 10 \* 1000;/);
  assert.match(create, /function scheduleAdvancedResultRefresh\(\) \{/);
  const schedule = create.match(/function scheduleAdvancedResultRefresh\(\) \{[\s\S]*?\n\}/)?.[0] || "";
  assert.match(schedule, /const posterRefreshRecords = advancedResultPosterRefreshRecords\(\);/);
  assert.doesNotMatch(schedule, /advancedResultPendingRecords\(\)/);
  assert.match(schedule, /ADVANCED_RESULT_POSTER_RETRY_INTERVAL_MS/);
  assert.doesNotMatch(create, /setInterval\([\s\S]{0,120}refreshAdvancedResultRecord/);
});

test("pending history without media can seed the result panel and polling", () => {
  const fallback = create.match(/function advancedResultHistoryFallbackRecords\(\) \{[\s\S]*?\n\}/)?.[0] || "";
  assert.ok(fallback, "advancedResultHistoryFallbackRecords should exist");
  assert.match(fallback, /isPendingGenerationRecord\(record\)/);
});

test("result poster polling stops when no poster repairs are pending", () => {
  const schedule = create.match(/function scheduleAdvancedResultRefresh\(\) \{[\s\S]*?\n\}/)?.[0] || "";
  assert.ok(schedule, "scheduleAdvancedResultRefresh should exist");
  assert.match(schedule, /const posterRefreshRecords = advancedResultPosterRefreshRecords\(\);/);
  assert.match(schedule, /if \(!posterRefreshRecords\.length\) return;/);
  assert.match(schedule, /state\.advancedResultTimer = window\.setTimeout/);
});

test("completed video results retry until their poster is repaired", () => {
  assert.match(create, /const ADVANCED_RESULT_POSTER_RETRY_INTERVAL_MS = 8 \* 1000;/);
  assert.match(create, /const ADVANCED_RESULT_POSTER_RETRY_LIMIT = 8;/);
  const posterRefresh = create.match(/function advancedResultPosterRefreshRecords\(\) \{[\s\S]*?\n\}/)?.[0] || "";
  assert.ok(posterRefresh, "advancedResultPosterRefreshRecords should exist");
  assert.match(posterRefresh, /isSucceededGenerationStatus\(record\?\.status\)/);
  assert.match(posterRefresh, /generationPosterUrl\(record\)/);
  assert.match(posterRefresh, /advancedResultPosterRetryCounts/);
  assert.match(create, /delete state\.advancedResultPosterRetryCounts\[record\.taskId\]/);
});

test("logout and leaving advanced stop pending-result polling", () => {
  assert.match(explore, /if \(nextTab !== "advanced"\) \{[\s\S]*?stopAdvancedResultRefresh\(\);/);
  const ui = fs.readFileSync(path.join(root, "platform.ui.js"), "utf8");
  assert.match(ui, /if \(userChanged && typeof stopAdvancedResultRefresh === "function"\) stopAdvancedResultRefresh\(\);/);
});
