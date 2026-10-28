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
  assert.match(merge, /const merged = previous \? \{ \.\.\.previous, \.\.\.record \} : record;/);
  assert.match(merge, /\[merged, \.\.\.existing\.filter/);
});

test("advanced result entry has no duplicate detail request", () => {
  assert.doesNotMatch(explore, /renderAdvancedResultPanel\(\);\s*if \(state\.advancedSideTab === "result" && state\.user && state\.advancedResultRecords\?\.length\) refreshAdvancedResultRecord\(\);/);
});
