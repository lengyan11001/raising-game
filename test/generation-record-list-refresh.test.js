"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const server = require("../server-source").readServerSource();
const platformCreate = fs.readdirSync(path.join(__dirname, "..", "platform.create.parts")).filter((name) => /^part-\d+\.js$/.test(name)).sort().map((name) => fs.readFileSync(path.join(__dirname, "..", "platform.create.parts", name), "utf8")).join("");

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

test("single-task detail polling enqueues refresh without waiting for media", () => {
  const detail = functionSource("handleGetGenerationRecord", "handleGenerationRecordDownloadUrl");
  assert.match(detail, /queueGenerationRecordStatusRefresh\((?:record|nextRecord), \{ priority: true, reason: "detail" \}\)/);
  assert.doesNotMatch(detail, /await refresh(?:GenerationRecordStatus|ApizGenerationRecord|IgnexGenerationRecord)/);
});

test("Wan detail and background status refreshes never wait for video downloads", () => {
  const refreshStatus = functionSource("refreshGenerationRecordStatus", "findActiveSeedream5ImageDuplicate");
  const detail = functionSource("handleGetGenerationRecord", "handleGenerationRecordDownloadUrl");
  assert.match(refreshStatus, /refreshWan27GenerationRecord\(record, \{ download: false, reason: "query" \}\)/);
  assert.match(detail, /queueGenerationRecordStatusRefresh\((?:record|nextRecord), \{ priority: true, reason: "detail" \}\)/);
  assert.doesNotMatch(detail, /refreshWan27GenerationRecord\(record, \{ download: true/);
});

test("history no longer polls details in the background", () => {
  assert.doesNotMatch(platformCreate, /async function refreshPendingHistoryRecords/);
  assert.doesNotMatch(platformCreate, /scheduleHistoryRefresh\(/);
});

test("generation detail uses lightweight auth and does not reload the full database", () => {
  const detail = functionSource("handleGetGenerationRecord", "handleGenerationRecordDownloadUrl");
  assert.match(detail, /requireUser\(req, res, \{ loadDb: false \}\)/);
  assert.match(detail, /user: userView\(auth\.user\)/);
  assert.doesNotMatch(detail, /await readDb\(\)/);
});

test("completed records stay complete while R2 publication catches up", () => {
  const start = server.indexOf("function publicGenerationRecord");
  const end = server.indexOf("function generationRecordTime", start + 1);
  const source = server.slice(start, end);
  assert.match(source, /const deliveryVideoUrl = deliverableStoredMediaUrl\(cdnUrl/s);
  assert.match(source, /const publicVideoUrl = .*?deliveryVideoUrl \|\| providerVideoUrl \|\| localUrl/s);
  assert.match(source, /r2DownloadReady:/);
  assert.doesNotMatch(source, /publicRecord\.status = "running"/);
  assert.doesNotMatch(source, /publicRecord\.videoUrl = ""/);
  assert.doesNotMatch(source, /publicRecord\.localVideoUrl = r2PublicationPending \? ""/);
});

test("advanced downloads stay R2-only while browser results expose the durable CDN copy", () => {
  const targetSource = server.slice(
    server.indexOf("function generationRecordDownloadTarget"),
    server.indexOf("function awsQueryEncode"),
  );
  assert.match(targetSource, /r2Only/);
  assert.match(targetSource, /r2Only \? cdnVideoUrl : generationRecordVideoUrl\(record, \{ preferProviderVideoUrl: true \}\)/);
  assert.match(server, /cdnVideoUrl: includeStoredVideoUrls \? deliveryVideoUrl : ""/);
  assert.match(server, /r2Only \? 409 : 404/);
  assert.match(server, /const fallbackUrl = `\/api\/generation-records\/\$\{encodeURIComponent\(taskId\)\}\/download\$\{r2Only \? "\?quality=r2" : ""\}`/);
});

test("R2 upload delays do not downgrade completed upstream tasks to processing", () => {
  const start = server.indexOf("async function upsertAndSettleGenerationRecord");
  const end = server.indexOf("async function updateGenerationRecord", start + 1);
  assert.notEqual(start, -1);
  assert.notEqual(end, -1);
  const source = server.slice(start, end);
  assert.doesNotMatch(source, /status:\s*"processing"/);
  assert.match(source, /return settleSeedanceGenerationRecord\(record, reason\)/);
});

test("generation completion polls at account level while result keeps only poster repair", () => {
  const create = platformCreate;
  const ui = fs.readdirSync(path.join(__dirname, "..", "platform.ui.parts")).filter((name) => /^part-\d+\.js$/.test(name)).sort().map((name) => fs.readFileSync(path.join(__dirname, "..", "platform.ui.parts", name), "utf8")).join("");
  const explore = fs.readFileSync(path.join(__dirname, "..", "platform.explore.js"), "utf8");
  assert.doesNotMatch(create, /function scheduleAdvancedResultRefresh\([\s\S]{0,400}?setInterval\(/);
  assert.doesNotMatch(create, /scheduleHistoryRefresh\(\{ delayMs: 15000/);
  assert.match(create, /refreshAdvancedResultRecord\(\);/);
  const completion = ui.slice(ui.indexOf("function handleGenerationCompletionVisibilityChange"), ui.indexOf("function isTerminalGenerationStatus"));
  assert.match(completion, /scheduleGenerationCompletionRefresh/);
  assert.match(ui, /notifyGenerationCompletionChanges\(trackedRecords, records\)/);
  assert.match(ui, /generationCompletionNotified/);
  assert.match(ui, /const previousStatus = rememberedStatus \|\| previousByTask\.get\(taskId\)\?\.status;/);
  assert.match(ui, /if \(!previousStatus \|\| isTerminalGenerationStatus\(previousStatus\)\) return false;/);
  assert.match(ui, /GENERATION_COMPLETION_STATUS_STORAGE_KEY/);
  assert.match(ui, /if \(isTerminalGenerationStatus\(previousStatus\)\) return;/);
  assert.doesNotMatch(ui, /generationCompletionPrimed/);
  assert.match(ui, /is-failed/);
  assert.doesNotMatch(explore, /scheduleAdvancedResultRefresh/);
});

test("external API results still expose the matching provider URL first", () => {
  const start = server.indexOf("const publicVideoUrl =");
  const end = server.indexOf("const includeStoredVideoUrls", start);
  const source = server.slice(start, end);
  assert.match(source, /providerOnlyOutputs \|\| providerOnlyVideoUrl/);
  assert.match(source, /providerVideoUrl \|\| deliveryVideoUrl \|\| localUrl/);
});

test("terminal failed records never re-enter upstream status polling", () => {
  const start = server.indexOf("function shouldRefreshGenerationRecord(");
  const end = server.indexOf("function isStalePreSubmitGenerationRecord(", start + 1);
  assert.notEqual(start, -1);
  assert.notEqual(end, -1);
  const source = server.slice(start, end);
  const shouldRefresh = new Function(
    "isChatCompletionGenerationRecord",
    "needsApizFailureRefund",
    "needsSeedanceFailureRefund",
    "generationRecordR2Expired",
    "isImageGenerationRecord",
    "seedanceUsesTokenPricing",
    "isFailedStatus",
    "isSucceededStatus",
    "generationRecordProviderVideoUrl",
    "GENERATION_MEDIA_PERSISTENCE_RETRY_DELAY_MS",
    "GENERATION_MEDIA_PERSISTENCE_MAX_AGE_MS",
    `${source}\nreturn shouldRefreshGenerationRecord;`,
  )(
    () => false,
    () => true,
    () => true,
    () => false,
    () => false,
    () => false,
    (status) => ["failed", "error", "cancelled", "canceled", "image_failed"].includes(String(status).toLowerCase()),
    (status) => ["succeeded", "success", "done", "completed"].includes(String(status).toLowerCase()),
    (record) => String(record.remoteVideoUrl || ""),
    30 * 60 * 1000,
    24 * 60 * 60 * 1000,
  );
  for (const status of ["failed", "error", "cancelled", "canceled", "image_failed"]) {
    assert.equal(shouldRefresh({
      taskId: `terminal-${status}`,
      status,
      provider: "seedance",
      upstreamTaskId: "upstream-terminal",
      preDeductedCredits: 10,
      finalCredits: 0,
      billingStatus: "pre_deducted",
    }), false);
  }
  assert.equal(shouldRefresh({
    taskId: "active-running",
    status: "running",
    provider: "seedance",
    upstreamTaskId: "upstream-active",
    preDeductedCredits: 10,
    billingStatus: "pre_deducted",
  }), true);
});

test("completed video records without durable media only refresh inside the recovery window", () => {
  const start = server.indexOf("function shouldRefreshGenerationRecord(");
  const end = server.indexOf("function isStalePreSubmitGenerationRecord(", start + 1);
  assert.notEqual(start, -1);
  assert.notEqual(end, -1);
  const source = server.slice(start, end);
  const shouldRefresh = new Function(
    "isChatCompletionGenerationRecord",
    "needsApizFailureRefund",
    "needsSeedanceFailureRefund",
    "generationRecordR2Expired",
    "isImageGenerationRecord",
    "seedanceUsesTokenPricing",
    "isFailedStatus",
    "isSucceededStatus",
    "generationRecordProviderVideoUrl",
    "GENERATION_MEDIA_PERSISTENCE_RETRY_DELAY_MS",
    "GENERATION_MEDIA_PERSISTENCE_MAX_AGE_MS",
    `${source}\nreturn shouldRefreshGenerationRecord;`,
  )(
    () => false,
    () => false,
    () => false,
    () => false,
    () => false,
    () => false,
    (status) => String(status).toLowerCase() === "failed",
    (status) => ["succeeded", "success", "done", "completed"].includes(String(status).toLowerCase()),
    (record) => String(record.remoteVideoUrl || ""),
    30 * 60 * 1000,
    24 * 60 * 60 * 1000,
  );

  const base = {
    taskId: "cgt-completed-without-r2",
    status: "succeeded",
    provider: "seedance",
    upstreamSource: "direct",
    remoteVideoUrl: "https://provider.example/expiring.mp4",
    createdAt: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
  };
  assert.equal(shouldRefresh(base), true);
  assert.equal(shouldRefresh({
    ...base,
    createdAt: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000).toISOString(),
    updatedAt: new Date().toISOString(),
  }), false);
  assert.equal(shouldRefresh({ ...base, createdAt: "" }), false);
  assert.equal(shouldRefresh({ ...base, cdnVideoUrl: "https://media.example/video.mp4", storageKey: "generated/videos/video.mp4" }), false);
  assert.equal(shouldRefresh({ ...base, mediaPersistenceTerminalAt: new Date().toISOString() }), false);
  assert.equal(shouldRefresh({ ...base, mediaPersistenceRetryAt: new Date(Date.now() + 60_000).toISOString() }), false);

  const persistenceStart = server.indexOf("async function scanGenerationRecordMissingMediaPersistence(");
  const persistenceEnd = server.indexOf("function runGenerationRecordMediaRecoverySchedulerTick(", persistenceStart + 1);
  assert.notEqual(persistenceStart, -1);
  assert.notEqual(persistenceEnd, -1);
  const persistenceScanner = server.slice(persistenceStart, persistenceEnd);
  assert.match(persistenceScanner, /if \(!current\.cdnVideoUrl && shouldRefreshGenerationRecord\(current\)\)[\s\S]*?current = await refreshGenerationRecordStatus\(current\)/);
  assert.ok(persistenceScanner.indexOf("refreshGenerationRecordStatus(current)") < persistenceScanner.indexOf("prepareGenerationRecordAdvancedDownload(current)"));
});

test("missing upstream resources do not downgrade an already succeeded generation record", () => {
  const preserveHelper = functionSource("preserveSucceededGenerationRecordAfterMissingUpstream", "updateGenerationRecord");
  assert.match(preserveHelper, /mediaPersistenceTerminalAt: new Date\(\)\.toISOString\(\)/);
  assert.doesNotMatch(preserveHelper, /status:\s*"failed"/);
  const refreshStatus = functionSource("refreshGenerationRecordStatus", "findActiveSeedream5ImageDuplicate");
  assert.equal((refreshStatus.match(/if \(upstreamResourceMissing\(error\)\)/g) || []).length, 3);
  assert.equal((refreshStatus.match(/if \(isSucceededStatus\(record\.status\)\)/g) || []).length, 3);
  assert.equal((refreshStatus.match(/preserveSucceededGenerationRecordAfterMissingUpstream\(record, error,/g) || []).length, 3);
  for (const reason of ["vega-upstream-resource-missing-preserved-success", "wan27-upstream-resource-missing-preserved-success", "upstream-resource-missing-preserved-success"]) {
    assert.match(refreshStatus, new RegExp(reason));
  }
});

test("poll=1 uses a status-only snapshot while plain refresh=1 stays compatible", () => {
  const userList = functionSource("handleListGenerationRecords", "handleGetGenerationRecord");
  const pollBranch = userList.slice(userList.indexOf("if (refreshRequested && pollRequested)"), userList.indexOf("// Active poster work"));
  assert.match(pollBranch, /publicGenerationPollRecord/);
  assert.match(userList, /const pollRequested = generationListPollRequested\(url\)/);
  assert.match(userList, /queueGenerationRecordStatusRefreshes\(refreshable, \{ reason: refreshRequested \? "user-poll" : "user-list" \}\)/);
  assert.doesNotMatch(pollBranch, /hydrateGenerationRecordMediaAssets|persistGenerationRecordResultAssetMediaBackfills|queueGenerationRecordMediaMaintenance/);
  assert.match(userList, /const hydratedRecords = await hydrateGenerationRecordMediaAssets/);
  assert.match(userList, /const persistedRecords = await persistGenerationRecordResultAssetMediaBackfills/);
  assert.match(server, /function generationListPollRequested\(url\)/);
});

test("poll serializer omits submission payloads but keeps result and billing state", () => {
  const application = require("../server");
  const omitted = [
    "params", "prompt", "finalPrompt", "mediaAssets", "usage",
    "imageUrl", "imageUrls", "sourceImageUrl", "sourceImageUrls",
    "syntheticReferenceLocalUrl", "syntheticReferenceUrl",
    "userAssetId", "userAssetIds", "referenceAssetUri", "upstreamPayload",
  ];
  const fullRecord = {
    taskId: "cgt-poll",
    status: "succeeded",
    provider: "seedance25",
    source: "platform-video",
    kind: "text-to-video",
    prompt: "submission prompt",
    finalPrompt: "final submission prompt",
    params: { provider: "seedance25", resolution: "1080P", mediaMode: "video" },
    mediaAssets: [{ id: "asset-1", url: "https://example.com/input.png" }],
    usage: { tokens: 42 },
    imageUrl: "https://example.com/source.png",
    imageUrls: ["https://example.com/source.png"],
    sourceImageUrl: "https://example.com/source.png",
    sourceImageUrls: ["https://example.com/source.png"],
    syntheticReferenceLocalUrl: "/assets/user-uploads/reference.png",
    syntheticReferenceUrl: "https://example.com/reference.png",
    userAssetId: "asset-1",
    userAssetIds: ["asset-1"],
    referenceAssetUri: "asset://asset-1",
    upstreamPayload: { prompt: "submission prompt" },
    providerVideoUrl: "https://provider.example/result.mp4",
    remoteVideoUrl: "https://provider.example/result.mp4",
    textResult: "",
    error: "",
    cdnError: "",
    advancedDownloadStatus: "preparing",
    preDeductedCredits: 20,
    finalCredits: 18,
    billingSettledAt: "2026-11-12T00:00:00.000Z",
    billingStatus: "settled",
    createdAt: "2026-11-12T00:00:00.000Z",
    updatedAt: "2026-11-12T00:01:00.000Z",
  };
  const full = application.publicGenerationRecord(fullRecord, { includeUpstreamPayload: true });
  const polled = application.publicGenerationPollRecord(fullRecord, { includeUpstreamPayload: true });

  for (const key of omitted) {
    assert.equal(Object.hasOwn(full, key), true, `${key} should remain in full records`);
    assert.equal(Object.hasOwn(polled, key), false, `${key} should be omitted from polls`);
  }
  assert.equal(polled.taskId, full.taskId);
  assert.equal(polled.status, full.status);
  assert.equal(polled.provider, full.provider);
  assert.equal(polled.videoUrl, full.videoUrl);
  assert.equal(polled.advancedDownloadAvailable, full.advancedDownloadAvailable);
  assert.equal(polled.advancedDownloadStatus, "preparing");
  assert.deepEqual(polled.billing, full.billing);
  assert.equal(polled.createdAt, full.createdAt);
  assert.equal(polled.updatedAt, full.updatedAt);
  assert.equal(polled.r2DownloadReady, full.r2DownloadReady);
});

test("poll projection never leaks undress or locked input fields", () => {
  const application = require("../server");
  const base = {
    taskId: "cgt-private-poll",
    status: "succeeded",
    provider: "seedance25",
    source: "undress-tool-video",
    kind: "tool-undress",
    prompt: "private prompt",
    finalPrompt: "private final prompt",
    params: { stage: "done", durationSeconds: 5, segmentCount: 2, completedSegments: 2, secret: "private" },
    mediaAssets: [{ id: "asset-1", url: "https://example.com/input.png" }],
    imageUrl: "https://example.com/source.png",
    imageUrls: ["https://example.com/source.png"],
    sourceImageUrl: "https://example.com/source.png",
    sourceImageUrls: ["https://example.com/source.png"],
    syntheticReferenceLocalUrl: "/assets/user-uploads/private.png",
    syntheticReferenceUrl: "https://example.com/private.png",
    userAssetId: "asset-1",
    userAssetIds: ["asset-1"],
    referenceAssetUri: "asset://asset-1",
    upstreamPayload: { prompt: "private" },
    providerVideoUrl: "https://provider.example/private.mp4",
    preDeductedCredits: 10,
  };
  for (const record of [base, { ...base, resultLocked: true, lockedPreviewUrl: "https://example.com/locked.png" }]) {
    const full = application.publicGenerationRecord(record, { includeUpstreamPayload: true });
    const polled = application.publicGenerationPollRecord(record, { includeUpstreamPayload: true });
    assert.equal(Object.hasOwn(full, "params"), true);
    assert.equal(Object.hasOwn(full, "mediaAssets"), true);
    assert.equal(Object.hasOwn(full, "prompt"), true);
    for (const key of [
      "params", "prompt", "finalPrompt", "mediaAssets", "usage",
      "imageUrl", "imageUrls", "sourceImageUrl", "sourceImageUrls",
      "syntheticReferenceLocalUrl", "syntheticReferenceUrl",
      "userAssetId", "userAssetIds", "referenceAssetUri", "upstreamPayload",
    ]) {
      assert.equal(Object.hasOwn(polled, key), false, `${key} should stay absent on undress/locked polls`);
    }
    assert.equal(polled.status, "succeeded");
    assert.equal(polled.provider, "undress");
    assert.equal(polled.providerLabel, "Undress");
    assert.equal(polled.billing.preDeducted, 10);
    assert.equal(polled.resultLocked, record.resultLocked === true);
    assert.doesNotMatch(JSON.stringify(polled), /private prompt|private final prompt|example\.com\/source\.png|example\.com\/private\.png|asset:\/\/asset-1|"secret":"private"/);
  }
});

test("full serializer keeps its original field order and browser/API media URL contracts", () => {
  const application = require("../server");
  const record = {
    taskId: "cgt-order",
    status: "succeeded",
    provider: "seedance25",
    source: "platform-video",
    kind: "text-to-video",
    prompt: "prompt",
    finalPrompt: "final",
    params: { provider: "seedance25", resolution: "1080P" },
    mediaAssets: [{ id: "asset-1" }],
    usage: { tokens: 1 },
    imageUrl: "https://example.com/source.png",
    imageUrls: ["https://example.com/source.png"],
    sourceImageUrl: "https://example.com/source.png",
    sourceImageUrls: ["https://example.com/source.png"],
    syntheticReferenceLocalUrl: "/assets/user-uploads/reference.png",
    syntheticReferenceUrl: "https://example.com/reference.png",
    userAssetId: "asset-1",
    userAssetIds: ["asset-1"],
    referenceAssetUri: "asset://asset-1",
    providerVideoUrl: "https://provider.example/result.mp4",
  };
  const browser = application.publicGenerationRecord(record, {
    providerOnlyVideoUrl: false,
    includeStoredVideoUrls: true,
    providerOnlyImageUrl: false,
    includeStoredImageUrls: true,
    includeUpstreamPayload: true,
    requireR2Ready: false,
  });
  const api = application.publicGenerationRecord(record, {
    providerOnlyVideoUrl: true,
    includeStoredVideoUrls: false,
    providerOnlyImageUrl: true,
    includeStoredImageUrls: false,
    includeUpstreamPayload: false,
    requireR2Ready: false,
  });
  assert.deepEqual(Object.keys(browser), [
    "taskId", "upstreamTaskId", "status", "source", "kind", "templateId", "templateTitle",
    "sceneId", "sceneName", "sceneEntryId", "sceneEntryName", "companionId", "companionName",
    "partnerCharacterId", "partnerCharacterName", "imageUrl", "imageUrls", "sourceImageUrl",
    "sourceImageUrls", "syntheticReferenceLocalUrl", "syntheticReferenceUrl", "userAssetId",
    "userAssetIds", "referenceAssetUri", "mediaMode", "mediaAssets", "posterUrl", "posterPending",
    "cdnPosterUrl", "localPosterUrl", "prompt", "finalPrompt", "params", "model", "provider",
    "providerLabel", "ratio", "resolution", "duration", "quality", "videoUrl", "downloadUrl",
    "cdnVideoUrl", "cdnImageUrl", "cdnImageUrls", "providerVideoUrl", "upstreamVideoUrl",
    "remoteVideoUrl", "imageResultUrl", "imageResultUrls", "providerImageUrl", "providerImageUrls",
    "upstreamImageUrl", "remoteImageUrl", "textResult", "responseText", "usage", "error",
    "cdnError", "r2DownloadReady", "advancedDownloadAvailable", "advancedDownloadStatus",
    "billing", "createdAt", "updatedAt", "awaitingUpstreamTask", "apiTokenId",
    "apiTokenName", "apiTokenType", "resultLocked", "unlockCredits", "unlockType",
    "lockedPreviewUrl", "localVideoUrl", "localVideoPath", "localPosterPath",
    "localImageUrl", "localImagePath", "localImageUrls", "upstreamPayload",
  ]);
  assert.equal(browser.videoUrl, "https://provider.example/result.mp4");
  assert.equal(api.videoUrl, "https://provider.example/result.mp4");
  assert.deepEqual(api.params, browser.params);
  assert.equal(Object.hasOwn(api, "upstreamPayload"), false);
  assert.equal(typeof browser.billing, "object");
  assert.equal(typeof api.billing, "object");
});

test("frontend polling merges partial snapshots without erasing full record fields", () => {
  const ui = fs.readFileSync(path.join(__dirname, "..", "platform.ui.parts", "part-02.js"), "utf8");
  const start = ui.indexOf("function mergeGenerationPollRecord(");
  const end = ui.indexOf("async function refreshGenerationCompletionRecords(", start);
  assert.notEqual(start, -1);
  assert.notEqual(end, -1);
  const { mergeGenerationPollRecords, mergeGenerationPollRecord } = new Function(
    `${ui.slice(start, end)}\nreturn { mergeGenerationPollRecords, mergeGenerationPollRecord };`,
  )();
  const previous = [{
    taskId: "cgt-merge",
    status: "processing",
    videoUrl: "",
    params: { resolution: "1080P", duration: 5 },
    mediaAssets: [{ id: "asset-1" }],
    upstreamPayload: { input: true },
    billing: { preDeducted: 20, settled: false },
  }];
  const incoming = [{
    taskId: "cgt-merge",
    status: "succeeded",
    videoUrl: "https://media.example/result.mp4",
    billing: { final: 20, settled: true },
  }];
  const [merged] = mergeGenerationPollRecords(previous, incoming);
  assert.equal(merged.status, "succeeded");
  assert.equal(merged.videoUrl, "https://media.example/result.mp4");
  assert.deepEqual(merged.params, previous[0].params);
  assert.deepEqual(merged.mediaAssets, previous[0].mediaAssets);
  assert.deepEqual(merged.upstreamPayload, previous[0].upstreamPayload);
  assert.deepEqual(merged.billing, { preDeducted: 20, settled: true, final: 20 });
  assert.deepEqual(mergeGenerationPollRecord(previous[0], incoming[0]).billing, merged.billing);
});

test("returning to a visible tab refreshes generation status immediately", () => {
  const ui = fs.readFileSync(path.join(__dirname, "..", "platform.ui.parts", "part-02.js"), "utf8");
  assert.match(ui, /\/api\/generation-records\?page=1&limit=20&refresh=1&poll=1/);
  assert.match(ui, /document\.addEventListener\("visibilitychange", handleGenerationCompletionVisibilityChange\)/);
  assert.match(ui, /document\.visibilityState !== "visible" \|\| !state\.user/);
  assert.match(ui, /refreshGenerationCompletionRecords\(\)\.finally\(scheduleGenerationCompletionRefresh\)/);
});
