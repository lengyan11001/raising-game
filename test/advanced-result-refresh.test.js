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
  assert.match(explore, /if \(!advancedWorkspace\) \{[\s\S]*?stopAdvancedResultRefresh\(\);/);
  const ui = fs.readFileSync(path.join(root, "platform.ui.js"), "utf8");
  assert.match(ui, /if \(userChanged && typeof stopAdvancedResultRefresh === "function"\) stopAdvancedResultRefresh\(\);/);
});
test("unchanged result payloads do not tear down and reload thumbnails", () => {
  const renderStart = create.indexOf("function renderAdvancedResultPanel() {");
  const renderEnd = create.indexOf("// Detail requests are cheap", renderStart);
  const render = renderStart >= 0 && renderEnd > renderStart ? create.slice(renderStart, renderEnd) : "";
  assert.ok(render, "renderAdvancedResultPanel should exist");
  assert.match(render, /reconcileAdvancedResultCards\(records\)/);
  assert.match(render, /Reconcile by taskId/);
  assert.doesNotMatch(render, /els\.advancedResultList\.innerHTML = resultHtml/);
  const reconcileStart = create.indexOf("function reconcileAdvancedResultCards(");
  const reconcileEnd = create.indexOf("function renderAdvancedResultPanel()", reconcileStart);
  const reconcile = reconcileStart >= 0 && reconcileEnd > reconcileStart ? create.slice(reconcileStart, reconcileEnd) : "";
  assert.ok(reconcile, "reconcileAdvancedResultCards should exist");
  assert.match(reconcile, /existingByKey/);
  assert.match(reconcile, /data-advanced-result-task-id/);
  assert.match(reconcile, /if \(!mediaSlot \|\| mediaSlot\.dataset\.advancedResultMediaKey !== view\.mediaKey\)/);
  assert.match(reconcile, /refreshAdvancedResultMediaSources\(records\)/);
});

test("rotating OSS signatures do not invalidate the result render cache", () => {
  const helper = create.match(/function advancedResultStableRenderHtml\(html = ""\) \{[\s\S]*?\n\}/)?.[0] || "";
  assert.ok(helper, "advancedResultStableRenderHtml should exist");
  const vm = require("node:vm");
  const context = {};
  vm.runInNewContext(`${helper}\nthis.normalize = advancedResultStableRenderHtml;`, context);
  const first = context.normalize('<img src="https://assets-cdn.123vips.com/a.jpg?Expires=1&amp;OSSAccessKeyId=key&amp;Signature=one" />');
  const second = context.normalize('<img src="https://assets-cdn.123vips.com/a.jpg?Expires=2&amp;OSSAccessKeyId=key&amp;Signature=two" />');
  assert.equal(first, second);
  assert.match(first, /assets-cdn\.123vips\.com\/a\.jpg/);
  assert.doesNotMatch(first, /Expires|OSSAccessKeyId|Signature/);
  assert.notEqual(
    context.normalize('<img src="https://assets-cdn.123vips.com/a.jpg" />'),
    context.normalize('<img src="https://assets-cdn.123vips.com/b.jpg" />'),
  );
});

test("unchanged result payloads refresh only expiring signed media sources", () => {
  const refresh = create.match(/function advancedResultSignedMediaNeedsRefresh\(value = ""\) \{[\s\S]*?\n\}/)?.[0] || "";
  assert.ok(refresh, "advancedResultSignedMediaNeedsRefresh should exist");
  assert.match(create, /if \(advancedResultSignedMediaNeedsRefresh\(image\.currentSrc \|\| image\.src\)\)/);
  assert.match(create, /records\.map\(\(record, index\) => advancedResultCardView\(record, index\)\.mediaKey\)/);
  const cardView = create.match(/function advancedResultCardView\(record = \{\}, index = 0\) \{[\s\S]*?\n\}/)?.[0] || "";
  assert.ok(cardView, "advancedResultCardView should exist");
  assert.match(cardView, /advancedResultStableRenderHtml\(posterUrl\)/);
  assert.match(cardView, /advancedResultStableRenderHtml\(videoUrl\)/);
});
