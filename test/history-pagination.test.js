"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const create = fs.readFileSync(path.join(root, "platform.create.js"), "utf8");
const ui = fs.readFileSync(path.join(root, "platform.ui.js"), "utf8");
const explore = fs.readFileSync(path.join(root, "platform.explore.js"), "utf8");

test("history keeps the page the visitor is reading", () => {
  // The reader's page is the default for every history load.
  assert.match(create, /function currentHistoryPage\(\) \{\s*return Math\.max\(1, Number\(state\.historyRecordsPage \|\| 1\) \|\| 1\);\s*\}/);
  assert.match(create, /async function loadHistory\(\{\s*silent = false,\s*refresh = false,\s*page = currentHistoryPage\(\),/);
  // Background refresh is disabled; page preservation applies to loads that
  // are explicitly triggered by navigation, paging, or user actions.
  assert.doesNotMatch(create, /function scheduleHistoryRefresh\(/);
  assert.doesNotMatch(create, /setTimeout\([\s\S]{0,200}loadHistory\(\{\s*silent: true,\s*refresh: true/s);
  // Deleting a record reloads the same page instead of jumping to the first one.
  assert.match(create, /await loadHistory\(\{ silent: true, page: currentHistoryPage\(\), preserveMobile: true \}\)/);
});

test("history completion does not run in the background", () => {
  const poller = ui.match(/function syncGenerationCompletionRefresh\(\)[\s\S]*?\n\}/)?.[0] || "";
  assert.ok(poller, "syncGenerationCompletionRefresh should exist");
  assert.doesNotMatch(poller, /setInterval/);
  assert.doesNotMatch(poller, /loadHistory\(/);
  assert.doesNotMatch(create, /delayMs: 15000/);
});

test("a page that disappeared steps back instead of rendering empty", () => {
  assert.match(create, /const lastPage = Math\.max\(1, Number\(payload\.totalPages \|\| 1\) \|\| 1\);/);
  assert.match(create, /if \(!append && !shouldPreserve && requestedPage > lastPage\) \{/);
  // The step-back waits for the in-flight guard to be released first.
  assert.match(create, /window\.setTimeout\(\(\) => \{\s*loadHistory\(\{ silent, refresh, page: lastPage, preserveMobile \}\)\.catch\(\(\) => \{\}\);\s*\}, 0\);/);
});

test("seeding the result panel cannot loop through history", () => {
  const sideTab = create.match(/if \(next === "result"\) \{[\s\S]*?\n  \}/)?.[0] || "";
  assert.ok(sideTab, "setAdvancedSideTab result branch should exist");
  assert.match(sideTab, /&& !historyLoading/);
  assert.match(sideTab, /&& !historyRefreshInFlight/);
  assert.match(sideTab, /loadHistory\(\{ silent: true, refresh: true, page: currentHistoryPage\(\) \}\);/);
});

test("switching to History still opens the page the visitor left", () => {
  assert.match(explore, /if \(nextTab === "history"\) loadHistory\(\{ page: isMobileHistoryLayout\(\) \? 1 : state\.historyRecordsPage \|\| 1 \}\);/);
});

test("submitting a task still surfaces the newest record and preselects it", () => {
  // Those two keep page 1 on purpose: they run on the create/result side.
  assert.match(create, /await loadHistory\(\{ silent: true, refresh: true, page: 1 \}\)\.catch\(\(\) => \{\}\);/);
});
