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
  // The timed history refresh no longer forces page 1 on a paged layout.
  const scheduled = create.match(/function scheduleHistoryRefresh\([\s\S]*?\n\}/)?.[0] || "";
  assert.doesNotMatch(scheduled, /page: 1/);
  assert.match(scheduled, /page: isMobileHistoryLayout\(\) \? 1 : currentHistoryPage\(\)/);
  // Deleting a record reloads the same page instead of jumping to the first one.
  assert.match(create, /await loadHistory\(\{ silent: true, page: currentHistoryPage\(\), preserveMobile: true \}\)/);
});

test("the completion poller never drags a reader back to page 1", () => {
  const poller = ui.match(/function syncGenerationCompletionRefresh\(\)[\s\S]*?\n\}/)?.[0] || "";
  assert.ok(poller, "syncGenerationCompletionRefresh should exist");
  assert.doesNotMatch(poller, /page: 1, preserveMobile/);
  assert.match(poller, /const desktopPage = typeof currentHistoryPage === "function" \? currentHistoryPage\(\) : 1;/);
  assert.match(poller, /const mobile = typeof isMobileHistoryLayout === "function" && isMobileHistoryLayout\(\);/);
  assert.match(poller, /page: mobile \? 1 : desktopPage/);
});

test("a page that disappeared steps back instead of rendering empty", () => {
  assert.match(create, /const lastPage = Math\.max\(1, Number\(payload\.totalPages \|\| 1\) \|\| 1\);/);
  assert.match(create, /if \(!append && !shouldPreserve && requestedPage > lastPage\) \{/);
  assert.match(create, /return loadHistory\(\{ silent, refresh, page: lastPage, preserveMobile \}\);/);
});

test("switching to History still opens the page the visitor left", () => {
  assert.match(explore, /if \(nextTab === "history"\) loadHistory\(\{ page: isMobileHistoryLayout\(\) \? 1 : state\.historyRecordsPage \|\| 1 \}\);/);
});

test("submitting a task still surfaces the newest record and preselects it", () => {
  // Those two keep page 1 on purpose: they run on the create/result side.
  assert.match(create, /await loadHistory\(\{ silent: true, refresh: true, page: 1 \}\)\.catch\(\(\) => \{\}\);/);
});
