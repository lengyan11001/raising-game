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
  const create = fs.readFileSync(path.join(__dirname, "..", "platform.create.js"), "utf8");
  const ui = fs.readFileSync(path.join(__dirname, "..", "platform.ui.js"), "utf8");
  const explore = fs.readFileSync(path.join(__dirname, "..", "platform.explore.js"), "utf8");
  assert.doesNotMatch(create, /function scheduleAdvancedResultRefresh\([\s\S]{0,400}?setInterval\(/);
  assert.doesNotMatch(create, /scheduleHistoryRefresh\(\{ delayMs: 15000/);
  assert.match(create, /refreshAdvancedResultRecord\(\);/);
  const completion = ui.slice(ui.indexOf("function syncGenerationCompletionRefresh"), ui.indexOf("function isTerminalGenerationStatus"));
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

test("completed video records without durable media refresh even when a provider URL exists", () => {
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
  );

  const base = {
    taskId: "cgt-completed-without-r2",
    status: "succeeded",
    provider: "seedance",
    upstreamSource: "direct",
    remoteVideoUrl: "https://provider.example/expiring.mp4",
  };
  assert.equal(shouldRefresh(base), true);
  assert.equal(shouldRefresh({ ...base, cdnVideoUrl: "https://media.example/video.mp4", storageKey: "generated/videos/video.mp4" }), false);
  assert.equal(shouldRefresh({ ...base, mediaPersistenceTerminalAt: new Date().toISOString() }), false);
  assert.equal(shouldRefresh({ ...base, mediaPersistenceRetryAt: new Date(Date.now() + 60_000).toISOString() }), false);

  const persistenceStart = server.indexOf("async function scanGenerationRecordMissingMediaPersistence(");
  const persistenceEnd = server.indexOf("setTimeout(() => scanGenerationRecordMissingMediaPersistence", persistenceStart + 1);
  assert.notEqual(persistenceStart, -1);
  assert.notEqual(persistenceEnd, -1);
  const persistenceScanner = server.slice(persistenceStart, persistenceEnd);
  assert.match(persistenceScanner, /if \(!current\.cdnVideoUrl && shouldRefreshGenerationRecord\(current\)\)[\s\S]*?current = await refreshGenerationRecordStatus\(current\)/);
  assert.ok(persistenceScanner.indexOf("refreshGenerationRecordStatus(current)") < persistenceScanner.indexOf("prepareGenerationRecordAdvancedDownload(current)"));
});
