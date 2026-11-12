"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const create = fs.readFileSync(path.join(root, "platform.create.js"), "utf8");
const explore = fs.readFileSync(path.join(root, "platform.explore.js"), "utf8");
const ui = fs.readFileSync(path.join(root, "platform.ui.js"), "utf8");

function extractFunction(source, name) {
  let start = source.indexOf(`function ${name}(`);
  if (start === -1) throw new Error(`missing function ${name}`);
  if (source.slice(Math.max(0, start - 6), start) === "async ") start -= 6;
  let parenDepth = 0;
  let bodyStart = -1;
  for (let index = source.indexOf("(", start); index < source.length; index += 1) {
    if (source[index] === "(") parenDepth += 1;
    else if (source[index] === ")") {
      parenDepth -= 1;
      if (parenDepth === 0) {
        bodyStart = source.indexOf("{", index);
        break;
      }
    }
  }
  if (bodyStart === -1) throw new Error(`missing body for ${name}`);
  let depth = 0;
  for (let index = bodyStart; index < source.length; index += 1) {
    const char = source[index];
    if (char === "{") depth += 1;
    else if (char === "}") {
      depth -= 1;
      if (depth === 0) return source.slice(start, index + 1);
    }
  }
  throw new Error(`unterminated function ${name}`);
}

test("result entry refreshes server detail even when history is cached", () => {
  const sideTab = create.match(/if \(next === "result"\) \{[\s\S]*?\n  \}/)?.[0] || "";
  assert.ok(sideTab, "setAdvancedSideTab result branch should exist");
  assert.match(sideTab, /if \(state\.user\) refreshAdvancedResultRecord\(\);/);
  assert.doesNotMatch(sideTab, /setInterval/);
});

test("result detail refresh is limited to the visible page", () => {
  const refreshIds = create.match(/function advancedResultRefreshTaskIds\(\) \{[\s\S]*?\n\}/)?.[0] || "";
  assert.ok(refreshIds, "advancedResultRefreshTaskIds should exist");
  assert.match(refreshIds, /advancedResultPageData\(\)\.records\.forEach\(\(record\) => pushTaskId\(record\.taskId\)\)/);
  assert.doesNotMatch(refreshIds, /advancedResultHistoryFallbackRecords/);
  assert.match(create, /const concurrency = 2;/);
  assert.match(create, /taskIds\.slice\(offset, offset \+ concurrency\)/);
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
  assert.match(create, /function clearAdvancedResultPosterFailure\(record = \{\}\)/);
  assert.match(create, /delete state\.advancedResultPosterRetryCounts\[taskId\]/);
  assert.match(create, /if \(advancedResultPosterCanRecover\(record\)\)/);
});

test("logout and leaving advanced stop pending-result polling", () => {
  assert.match(explore, /if \(nextTab !== "advanced"\) \{[\s\S]*?stopAdvancedResultRefresh\(\);/);
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
  assert.match(reconcile, /mediaSlot\.dataset\.advancedResultMediaKey !== view\.mediaKey/);
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
  assert.match(create, /advancedResultSignedMediaNeedsRefresh\(currentUrl\)/);
  assert.match(create, /records\.map\(\(record, index\) => advancedResultCardView\(record, index\)\.mediaKey\)/);
  const cardView = create.match(/function advancedResultCardView\(record = \{\}, index = 0\) \{[\s\S]*?\n\}/)?.[0] || "";
  assert.ok(cardView, "advancedResultCardView should exist");
  assert.match(cardView, /advancedResultMediaIdentity\(\{/);
  assert.doesNotMatch(cardView, /mediaKey = JSON\.stringify\(\[\s*resultExpired,\s*ratio,\s*isSucceeded,/);
});

test("media object identity ignores signatures and status changes", () => {
  const objectStart = create.indexOf("function advancedResultMediaObjectKey(");
  const identityStart = create.indexOf("function advancedResultMediaIdentity(");
  const identityEnd = create.indexOf("function advancedResultSignedMediaNeedsRefresh(", identityStart);
  const objectHelper = create.slice(objectStart, identityStart);
  const identityHelper = identityStart >= 0 && identityEnd > identityStart ? create.slice(identityStart, identityEnd) : "";
  assert.ok(objectHelper, "advancedResultMediaObjectKey should exist");
  assert.ok(identityHelper, "advancedResultMediaIdentity should exist");
  const vm = require("node:vm");
  const context = { URL, window: { location: { href: "https://123vips.com/platform" } } };
  vm.runInNewContext(`${objectHelper}\n${identityHelper}\nthis.objectKey = advancedResultMediaObjectKey; this.identity = advancedResultMediaIdentity;`, context);
  assert.equal(
    context.objectKey("https://assets-cdn.123vips.com/a.jpg?Expires=1&amp;OSSAccessKeyId=k&amp;Signature=one"),
    context.objectKey("https://vipeak-media-sg.oss-ap-southeast-1.aliyuncs.com/a.jpg?Expires=2&OSSAccessKeyId=k&Signature=two"),
  );
  assert.notEqual(
    context.objectKey("https://assets-cdn.123vips.com/a.jpg?Expires=1"),
    context.objectKey("https://assets-cdn.123vips.com/b.jpg?Expires=1"),
  );
  const imagePending = context.identity({
    imageUrls: ["https://assets-cdn.123vips.com/a.jpg?Expires=1&Sig=one"],
    posterUrl: "https://assets-cdn.123vips.com/poster.jpg?Expires=1&Sig=one",
    status: "Generating",
  });
  const imageSucceeded = context.identity({
    imageUrls: ["https://assets-cdn.123vips.com/a.jpg?Expires=2&Sig=two"],
    posterUrl: "https://assets-cdn.123vips.com/poster.jpg?Expires=2&Sig=two",
    status: "Succeeded",
  });
  assert.equal(imagePending, imageSucceeded, "status/signature/poster changes must not rebuild a displayed image");
  assert.notEqual(
    imageSucceeded,
    context.identity({ imageUrls: ["https://assets-cdn.123vips.com/b.jpg?Expires=2&Sig=two"], status: "Succeeded" }),
  );
  assert.equal(
    context.identity({
      imageUrls: [
        "https://assets-cdn.123vips.com/b.jpg?Expires=2&Sig=two",
        "https://media.123vips.com/a.jpg?Expires=2&Sig=two",
      ],
    }),
    context.identity({
      imageUrls: [
        "https://vipeak-media-sg.oss-ap-southeast-1.aliyuncs.com/a.jpg?Expires=3&Sig=three",
        "https://assets-cdn.123vips.com/b.jpg?Expires=3&Sig=three",
      ],
    }),
    "multi-image field order and origin aliases must keep the same media key",
  );
});

test("result image outputs dedupe signed aliases by media path without merging distinct images", () => {
  const names = [
    "isGenerationImageOutputUrl",
    "generationImageResultUrl",
    "generationImageResultObjectKey",
    "generationImageResultUrls",
  ];
  const uiPart = fs.readFileSync(path.join(root, "platform.ui.parts", "part-02.js"), "utf8");
  const helpers = names.map((name) => extractFunction(uiPart, name)).join("\n");
  const vm = require("node:vm");
  const context = { URL };
  vm.runInNewContext(`${helpers}\nthis.urls = generationImageResultUrls;`, context);
  assert.deepEqual(
    JSON.parse(JSON.stringify(context.urls({
      cdnImageUrls: [
        "https://assets-cdn.123vips.com/assets/generated/a.png?Expires=1&OSSAccessKeyId=k&Signature=one",
        "https://media.123vips.com/assets/generated/b.png?Expires=1&Signature=two",
      ],
      imageResultUrls: [
        "https://vipeak-media-sg.oss-ap-southeast-1.aliyuncs.com/assets/generated/a.png?Expires=2&Signature=three",
      ],
      localImageUrls: ["/assets/generated/b.png?Expires=2&Signature=four"],
      imageResultUrl: "https://assets-cdn.123vips.com/assets/generated/a.png?Expires=3&Signature=five",
    }))),
    [
      "https://assets-cdn.123vips.com/assets/generated/a.png?Expires=1&OSSAccessKeyId=k&Signature=one",
      "https://media.123vips.com/assets/generated/b.png?Expires=1&Signature=two",
    ],
  );
});

test("result media refresh keeps a painted thumbnail for the same object", () => {
  const names = [
    "advancedResultMediaObjectKey",
    "advancedResultMediaObjectKeys",
    "advancedResultMediaIdentity",
    "advancedResultSignedMediaNeedsRefresh",
    "advancedResultSameMediaObject",
    "advancedResultMatchingMediaUrl",
    "refreshAdvancedResultMediaSources",
  ];
  const helpers = names.map((name) => extractFunction(create, name)).join("\n");
  const nowSeconds = Math.floor(Date.now() / 1000);
  const runRefresh = (currentUrl, nextUrls) => {
    const vm = require("node:vm");
    const image = { currentSrc: currentUrl, src: currentUrl };
    const button = {
      dataset: { advancedResultImage: "0:0" },
      querySelector: (selector) => (selector === "img" ? image : null),
    };
    const context = {
      URL,
      window: { location: { href: "https://123vips.com/platform" } },
      els: {
        advancedResultList: {
          querySelectorAll: (selector) => (selector === "[data-advanced-result-image]" ? [button] : []),
        },
      },
      generationImageResultUrls: () => nextUrls,
      generationImageResultUrl: () => nextUrls[0] || "",
    };
    vm.runInNewContext(`${helpers}\nthis.refresh = refreshAdvancedResultMediaSources;`, context);
    context.refresh([{ taskId: "cgt-test" }]);
    return image.src;
  };

  const current = "https://assets-cdn.123vips.com/generated/a.png?Expires=9999999999&Signature=one";
  const rotated = [
    "https://media.123vips.com/generated/b.png?Expires=9999999999&Signature=three",
    "https://vipeak-media-sg.oss-ap-southeast-1.aliyuncs.com/generated/a.png?Expires=9999999999&Signature=two",
  ];
  assert.equal(runRefresh(current, rotated), current, "origin aliases and field order must not reload the painted image");

  const expiring = `https://assets-cdn.123vips.com/generated/a.png?Expires=${nowSeconds - 10}&Signature=old`;
  const refreshed = `https://assets-cdn.123vips.com/generated/a.png?Expires=${nowSeconds + 600}&Signature=new`;
  assert.equal(runRefresh(expiring, [refreshed]), refreshed, "an expired signature must be replaced before the image breaks");
});

test("generate result video clicks use the shared video preview", () => {
  assert.match(create, /if \(videoUrl\) \{\s*playPreview\(\{/);
  assert.match(create, /previewUrl: videoUrl/);
  assert.match(create, /posterUrl: generationPosterUrl\(record\)/);
  assert.doesNotMatch(create, /previewVideo\(\{/);
});

test("broken result posters fail closed and retry only once", () => {
  assert.match(create, /function advancedResultPosterFailed\(record = \{\}\)/);
  assert.match(create, /function markAdvancedResultPosterFailed\(record = \{\}, failedUrl = ""\)/);
  assert.match(create, /if \(state\.advancedResultPosterFailures\[taskId\]\) return;/);
  assert.match(create, /image\.addEventListener\("error", fallback\)/);
  assert.match(create, /image\.addEventListener\("load", recover\)/);
  assert.match(create, /image\.dataset\.posterFallbackApplied === "true"/);
  assert.match(create, /image\.removeAttribute\("src"\)/);
  assert.match(create, /if \(image\.loading !== "lazy" && image\.complete && image\.naturalWidth === 0\) fallback\(\);/);
  assert.match(create, /if \(generationPosterUrl\(record\) && !advancedResultPosterFailed\(record\)\) return false;/);
  assert.match(create, /function advancedResultPosterCanRecover\(record = \{\}\)/);
  assert.match(create, /if \(advancedResultPosterCanRecover\(record\)\) \{/);
});

test("history thumbnails degrade once instead of repeatedly loading a broken URL", () => {
  const source = fs.readFileSync(path.join(root, "platform.create.parts", "part-05.js"), "utf8");
  assert.match(source, /state\.historyPosterFailures\[posterTaskId\]/);
  assert.match(source, /poster\.dataset\.fallbackApplied === "true"/);
  assert.match(source, /poster\.addEventListener\("load", \(\) => \{/);
  assert.match(source, /poster\.hidden = true/);
  assert.match(source, /button\.classList\.add\("is-poster-missing"\)/);
  assert.match(source, /if \(poster\.loading !== "lazy" && poster\.complete && poster\.naturalWidth === 0\) poster\.dispatchEvent\(new Event\("error"\)\);/);
});

test("durable generated media is never hidden by the 24 hour provider TTL", () => {
  const ui = fs.readFileSync(path.join(root, "platform.ui.parts", "part-02.js"), "utf8");
  const legacy = fs.readFileSync(path.join(root, "app.js"), "utf8");
  const uiRuntime = new Function(
    "GENERATION_RESULT_TTL_MS",
    `${extractFunction(ui, "generationResultTimestamp")}\n${extractFunction(ui, "isGenerationResultExpired")}\nreturn { isGenerationResultExpired };`,
  )(24 * 60 * 60 * 1000);
  const legacyRuntime = new Function(
    "GENERATION_RESULT_TTL_MS",
    `${extractFunction(legacy, "isGenerationResultExpired")}\nreturn { isGenerationResultExpired };`,
  )(24 * 60 * 60 * 1000);
  for (const runtime of [uiRuntime, legacyRuntime]) {
    const old = { createdAt: "2025-01-01T00:00:00.000Z" };
    assert.equal(runtime.isGenerationResultExpired({ ...old, cdnPosterUrl: "https://cdn.example.com/poster.jpg" }), false);
    assert.equal(runtime.isGenerationResultExpired({ ...old, localVideoUrl: "/assets/generated/video.mp4" }), false);
    assert.equal(runtime.isGenerationResultExpired(old), true);
  }
});
