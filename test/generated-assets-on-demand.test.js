"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const server = read("server.js");
const ui = read("platform.ui.js");
const create = read("platform.create.js");
const explore = read("platform.explore.js");
const css = read("platform.css");

test("generated media defaults to on-demand storage", () => {
  assert.match(server, /const GENERATED_ASSETS_ON_DEMAND = .*process\.env\.GENERATED_ASSETS_ON_DEMAND \|\| "true"/);
  assert.match(server, /if \(GENERATED_ASSETS_ON_DEMAND\) return generationRecordNeedsPosterMaintenance\(record\)/);
  assert.match(server, /if \(DISABLE_GENERATED_R2_STORAGE\) return record;\n  if \(!record\?\.taskId\) return record;/);
});

test("generated video and image helpers defer local writes until forced", () => {
  const video = server.slice(server.indexOf("async function downloadGeneratedVideo"), server.indexOf("function imageFileName"));
  assert.match(video, /!forceLocal && \(!generatedOutputStorageEnabled\(\) \|\| GENERATED_ASSETS_ON_DEMAND\)/);
  const image = server.slice(server.indexOf("async function saveGeneratedImageFile"), server.indexOf("async function saveRemoteGeneratedImage"));
  assert.match(image, /!forceLocal && \(!generatedOutputStorageEnabled\(\) \|\| GENERATED_ASSETS_ON_DEMAND\)/);
  assert.match(server, /async function saveRemoteGeneratedImage[\s\S]*?!forceLocal && \(!generatedOutputStorageEnabled\(\) \|\| GENERATED_ASSETS_ON_DEMAND\)/);
});

test("advanced download preparation forces a local transient copy and R2 upload", () => {
  const prepare = server.slice(
    server.indexOf("async function prepareGenerationRecordAdvancedDownload"),
    server.indexOf("function generationImageResultUrl"),
  );
  assert.match(prepare, /providerTarget = generationRecordProviderDownloadTarget\(record\)/);
  assert.match(prepare, /downloadGeneratedVideo\(existing\.taskId, providerTarget\.url, \{ forceLocal: true \}\)/);
  assert.match(prepare, /downloadRemoteFileToBuffer\(providerTarget\.url/);
  assert.match(prepare, /saveGeneratedImageFile\(existing\.taskId, downloaded\.bytes, mime, \{ publish: false, forceLocal: true \}\)/);
  assert.match(prepare, /uploadStaticAssetToObjectStorage\(/);
  assert.match(prepare, /markPublishedFileSafely\(saved\.localImagePath\)/);
  assert.match(prepare, /if \(!objectStorageEnabled\(\) \|\| !isSucceededStatus\(record\.status\)\) return record;/);
  assert.match(prepare, /force: true,/);
  assert.match(prepare, /updateGenerationRecordAdvancedDownloadInDb\(existing\.taskId, \{/);
  assert.doesNotMatch(prepare, /return upsertGenerationRecord\(\{\s*taskId: existing\.taskId/);
});

test("advanced download preparation is queued so the download-url request cannot hit proxy timeout", () => {
  const handler = server.slice(
    server.indexOf("async function handleGenerationRecordDownloadUrl"),
    server.indexOf("async function handleDownloadGenerationRecord"),
  );
  assert.match(server, /const advancedDownloadPreparationQueued = new Set\(\)/);
  assert.match(server, /function queueGenerationRecordAdvancedDownload\(record = \{\}\)/);
  assert.match(server, /advancedDownloadPreparationQueued\.has\(taskId\)/);
  assert.match(server, /advancedDownloadStatus: "preparing"/);
  assert.match(server, /advancedDownloadStatus: "failed"/);
  assert.match(server, /advancedDownloadError: advancedDownloadFailureMessage\(error\)/);
  assert.match(handler, /queueGenerationRecordAdvancedDownload\(record\)/);
  assert.match(handler, /status: "preparing"/);
  assert.match(handler, /preparationStatus === "failed" && !retry/);
  assert.doesNotMatch(handler, /preparationStatus === "preparing"/);
  assert.doesNotMatch(handler, /await prepareGenerationRecordAdvancedDownload\(/);
});

test("advanced download eligibility does not require a pre-existing R2 copy", () => {
  assert.match(server, /advancedDownloadAvailable: Boolean\(/);
  assert.match(ui, /record\?\.r2DownloadReady \|\| record\?\.advancedDownloadAvailable/);
  assert.match(create, /const advancedDownloadState = record\?\.r2DownloadReady \? "ready" : "idle"/);
  assert.match(explore, /const advancedDownloadState = record\?\.r2DownloadReady \? "ready" : "idle"/);
  assert.match(create, /download2 可下载/);
  assert.match(explore, /download2 可下载/);
});

test("all download2 buttons show a persistent save hint bubble", () => {
  assert.match(create, /<button class="history-download advanced-result-r2-download[^>]*>[\s\S]*?<span class="advanced-result-download-hint" aria-hidden="true">如果下载素材慢请点击我保存<\/span>/);
  assert.match(create, /<button class="history-download history-r2-download[^>]*>[\s\S]*?<span class="advanced-result-download-hint" aria-hidden="true">如果下载素材慢请点击我保存<\/span>/);
  assert.match(explore, /<button class="history-download history-detail-r2-download[^>]*>[\s\S]*?<span class="advanced-result-download-hint" aria-hidden="true">如果下载素材慢请点击我保存<\/span>/);
  assert.match(ui, /const hint = `<span class="advanced-result-download-hint" aria-hidden="true">如果下载素材慢请点击我保存<\/span>`;/);
  assert.match(css, /\.advanced-result-r2-download,\s*\.history-r2-download,\s*\.history-detail-r2-download \{\s*position: relative;\s*overflow: visible;/);
  assert.match(css, /\.advanced-result-download-hint \{[\s\S]*?position: absolute;[\s\S]*?bottom: calc\(100% \+ 9px\);/);
  assert.match(css, /\.advanced-result-download-hint::after \{/);
});

test("advanced download button exposes transferring and ready states", () => {
  const state = ui.slice(ui.indexOf("function setAdvancedDownloadButtonState"), ui.indexOf("function showAdvancedDownloadError"));
  assert.match(state, /status === "transferring"/);
  assert.match(state, /status === "ready"/);
  assert.match(state, /status === "failed"/);
  assert.match(state, /download2 转存中/);
  assert.match(state, /download2 可下载/);
  assert.match(state, /download2 重试/);
  assert.match(create, /setAdvancedDownloadButtonState\(button, "transferring"\)/);
  assert.match(create, /setAdvancedDownloadButtonState\(button, ok \? "ready" : "failed"\)/);
  assert.match(explore, /setAdvancedDownloadButtonState\(button, "transferring"\)/);
  assert.match(css, /\.history-r2-download\.is-transferring svg/);
  assert.match(css, /\.history-r2-download\.is-ready/);
});

test("advanced downloads poll a short R2 preparation request before direct browser download", () => {
  const download = ui.slice(ui.indexOf("async function downloadGenerationRecordInternal"), ui.indexOf("function stripModelParams"));
  assert.match(download, /new URLSearchParams\(\{ quality: "r2" \}\)/);
  assert.match(download, /query\.set\("retry", "1"\)/);
  assert.match(download, /timeoutMs: 30000/);
  assert.match(download, /window\.setTimeout\(resolve, 2500\)/);
  assert.match(download, /payload\.status/);
  assert.match(download, /maxWaitMs = 16 \* 60 \* 1000/);
  assert.ok(download.indexOf("download-url") < download.indexOf("triggerBrowserDownload(href, fileName)"));
  assert.doesNotMatch(download, /saveDownloadFromFetch|response\.blob\(\)/);
});

test("free locked Undress previews still keep a forced local source", () => {
  assert.match(server, /if \(freeImageGeneration\) \{[\s\S]*?saveGeneratedImageFile\(taskId, downloaded\.bytes, mime, \{ publish: false, forceLocal: true \}\)/);
});

test("on-demand still repairs a successful video poster", () => {
  assert.match(server, /function generationRecordNeedsPosterMaintenance\(record = \{\}\)/);
  assert.match(server, /if \(GENERATED_ASSETS_ON_DEMAND\) return generationRecordNeedsPosterMaintenance\(record\)/);
  assert.match(server, /if \(GENERATED_ASSETS_ON_DEMAND\) \{[\s\S]*?downloadGeneratedVideo\(record\.taskId, remoteVideo, \{ forceLocal: true, posterOnly: true \}\)/);
  assert.match(server, /ownRecords[\s\S]*?generationRecordNeedsPosterMaintenance\(record\)[\s\S]*?queueGenerationRecordMediaMaintenance\(record\)/);
  assert.match(server, /if \(generationRecordNeedsPosterMaintenance\(nextRecord\)\) \{[\s\S]*?queueGenerationRecordMediaMaintenance\(nextRecord\)/);
  assert.match(server, /if \(GENERATED_ASSETS_ON_DEMAND && !repairPoster\) return false;/);
  assert.match(server, /"poster-maintenance", \{ repairPoster: true \}/);
});

test("background poster backfill scans non-API video records in bounded batches", () => {
  const db = read("db.js");
  const scanStart = server.indexOf("async function scanGenerationRecordMissingPosterBackfill");
  const scanEnd = server.indexOf("function startGenerationRecordMediaRecoveryScheduler", scanStart);
  const scan = server.slice(scanStart, scanEnd);
  assert.match(db, /async function getGenerationRecordsNeedingPosterMaintenanceFromDb/);
  assert.match(db, /COALESCE\(payload->>'cdnPosterUrl', ''\) = ''/);
  assert.match(db, /COALESCE\(payload->>'localPosterUrl', ''\) = ''/);
  assert.match(db, /COALESCE\(payload->>'localVideoUrl', ''\) <> ''/);
  assert.match(db, /COALESCE\(payload->>'kind', ''\) NOT ILIKE '%image%'/);
  assert.match(db, /COALESCE\(payload->>'provider', ''\) NOT ILIKE '%image%'/);
  assert.match(scan, /getGenerationRecordsNeedingPosterMaintenanceFromDb\(\{/);
  assert.match(scan, /limit: GENERATION_POSTER_BACKFILL_BATCH_SIZE/);
  assert.match(scan, /posterMaintenanceAttempts/);
  assert.match(scan, /posterMaintenanceRetryAt/);
  assert.match(scan, /ensureGenerationRecordMediaOptimized\(current, \{ allowObjectStorageUpload: false \}\)/);
  assert.match(server, /downloadGeneratedVideo\(record\.taskId, remoteVideo, \{ forceLocal: true, posterOnly: true \}\)/);
  assert.match(server, /startGenerationRecordMediaRecoveryScheduler\(\);/);
  assert.match(server, /setTimeout\(runPosterBackfill, GENERATION_POSTER_BACKFILL_INTERVAL_MS\)/);
});

test("on-demand poster-only repair does not persist a downloaded video", () => {
  const video = server.slice(server.indexOf("async function downloadGeneratedVideo"), server.indexOf("function imageFileName"));
  assert.match(video, /\{ forceLocal = false, posterOnly = false \} = \{\}/);
  assert.match(video, /if \(posterOnly\) \{/);
  assert.match(video, /createGeneratedVideoPoster\(taskId, source\)/);
  assert.doesNotMatch(video.slice(video.indexOf("if (posterOnly)"), video.indexOf("if (existing?.localVideoUrl)")), /fs\.writeFile\(/);
});

test("public records expose repaired posters to both result surfaces", () => {
  assert.match(server, /posterPending: generationRecordNeedsPosterMaintenance\(record\)/);
  assert.match(server, /cdnPosterUrl: includeStoredVideoUrls \? \(String\(record\.cdnPosterUrl \|\| ""\)\.trim\(\) \|\| preferredPosterUrl\) : ""/);
  assert.match(server, /localPosterUrl: includeStoredVideoUrls \? \(String\(record\.localPosterUrl \|\| ""\)\.trim\(\) \|\| ""\) : ""/);
});
