"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const server = require("../server-source").readServerSource();
const ui = read("platform.ui.js");
const create = read("platform.create.js");
const explore = read("platform.explore.js");
const siteCanvas = read("workflow-react/src/components/canvas/siteNodes/GenerationResultMedia.js");
const siteNode = read("workflow-react/src/components/canvas/siteNodes/useSiteNode.js");
const css = read("platform.css");
const db = read("db.js");

test("generated media defaults to on-demand storage", () => {
  assert.match(server, /const GENERATED_ASSETS_ON_DEMAND = .*process\.env\.GENERATED_ASSETS_ON_DEMAND \|\| "true"/);
  assert.match(server, /if \(GENERATED_ASSETS_ON_DEMAND\) return generationRecordNeedsPosterMaintenance\(record\)/);
  assert.match(server, /if \(DISABLE_GENERATED_R2_STORAGE\) return record;\n  if \(!record\?\.taskId\) return record;/);
});

test("OSS media verification accepts private objects only when signed delivery is readable", () => {
  const verify = server.slice(
    server.indexOf("async function verifyObjectStorageMedia"),
    server.indexOf("async function uploadGeneratedMediaToObjectStorage"),
  );
  assert.match(verify, /makeOssSignedCdnUrl\(\{ key: upload\.key, expiresSeconds: 600 \}\)/);
  assert.match(verify, /fetchPublicRemoteUrl\(signedCdnUrl, \{ method: "HEAD"/);
  assert.match(verify, /signed CDN object is not readable/);
  assert.match(verify, /verified = head;/);
});

test("generated video and image helpers persist only verified object-storage media", () => {
  const video = server.slice(server.indexOf("async function downloadGeneratedVideo"), server.indexOf("function imageFileName"));
  assert.match(video, /Generated videos are never a durable local asset/);
  assert.match(video, /createGeneratedMediaWorkspace\(taskId \|\| "video"\)/);
  assert.match(video, /createGeneratedVideoPoster\(taskId, downloaded\.localVideoPath, \{ directory: workspace \}\)/);
  assert.match(video, /uploadGeneratedMediaToObjectStorage\(\{/);
  assert.match(video, /force: true,/);
  assert.match(video, /localVideoUrl: "",/);
  assert.match(video, /finally \{\s*await removeGeneratedMediaWorkspace\(workspace\);/);
  const image = server.slice(server.indexOf("async function saveGeneratedImageFile"), server.indexOf("async function saveRemoteGeneratedImage"));
  assert.match(image, /uploadStaticAssetToObjectStorage\(/);
  assert.match(image, /await verifyObjectStorageMedia\(upload/);
  assert.match(image, /localImagePath: "",/);
  assert.match(image, /localImageUrl: "",/);
  assert.match(server, /async function saveRemoteGeneratedImage[\s\S]*?if \(!saved\.cdnImageUrl \|\| !saved\.storageKey\)/);
});

test("advanced download preparation materializes durable OSS media without local persistence", () => {
  const prepare = server.slice(
    server.indexOf("async function prepareGenerationRecordAdvancedDownload"),
    server.indexOf("function generationImageResultUrl"),
  );
  assert.match(prepare, /providerTarget = generationRecordProviderDownloadTarget\(record\)/);
  assert.match(prepare, /downloadGeneratedVideo\(existing\.taskId, providerTarget\.url, \{ forceLocal: true \}\)/);
  assert.match(prepare, /generationRecordProviderImageUrls\(existing\)/);
  assert.match(prepare, /downloadRemoteFileToBuffer\(sourceUrl, \{ label: "advanced download image"/);
  assert.match(prepare, /uploadStaticAssetToObjectStorage\(/);
  assert.match(prepare, /await verifyObjectStorageMedia\(upload/);
  assert.match(prepare, /if \(!objectStorageEnabled\(\) \|\| !isSucceededStatus\(record\.status\)\) return record;/);
  assert.match(prepare, /localVideoUrl: "",/);
  assert.match(prepare, /localImageUrl: "",/);
  assert.match(prepare, /storageKey: media\.storageKey/);
  assert.match(prepare, /updateGenerationRecordAdvancedDownloadInDb\(existing\.taskId, \{/);
  assert.doesNotMatch(prepare, /saveGeneratedImageFile\(/);
  assert.doesNotMatch(prepare, /markPublishedFileSafely\(/);
  assert.doesNotMatch(prepare, /return upsertGenerationRecord\(\{\s*taskId: existing\.taskId/);
});

test("video publication returns only durable OSS metadata", () => {
  const durable = server.slice(
    server.indexOf("function generatedVideoDurableMediaUpdates"),
    server.indexOf("async function downloadRemoteVideoToWorkspace"),
  );
  assert.match(durable, /videoUrl: cdnVideoUrl \|\| String\(record\.videoUrl \|\| ""\)\.trim\(\)/);
  assert.match(durable, /posterUrl: cdnPosterUrl \|\| String\(record\.posterUrl \|\| ""\)\.trim\(\)/);
  assert.match(durable, /localVideoUrl: "",/);
  assert.match(durable, /localVideoPath: "",/);
  assert.match(durable, /localPosterUrl: "",/);
  assert.match(durable, /localPosterPath: "",/);
  assert.match(durable, /storageProvider: String\(media\.storageProvider/);
  assert.match(durable, /storageKey: String\(media\.storageKey/);
  assert.match(durable, /posterStorageProvider: String\(media\.posterStorageProvider/);
  assert.match(durable, /posterStorageKey: String\(media\.posterStorageKey/);
});

test("successful generation immediately queues background transfer without waiting for download2", () => {
  const upsert = server.slice(
    server.indexOf("async function upsertGenerationRecord"),
    server.indexOf("async function updateGenerationRecord"),
  );
  assert.match(upsert, /const record = await upsertGenerationRecordInDb\(storableRecord\);\n    if \(isSucceededStatus\(record\?\.status\)\) queueGenerationRecordAdvancedDownload\(record\);/);
  assert.match(upsert, /if \(isSucceededStatus\(record\?\.status\)\) queueGenerationRecordAdvancedDownload\(record\);/);
  assert.match(upsert, /await writeGenerationRecords\(records\.slice\(0, 500\)\);\n    return record;\n  \}\);\n  if \(isSucceededStatus\(record\?\.status\)\) queueGenerationRecordAdvancedDownload\(record\);/);
  const queue = server.slice(
    server.indexOf("function queueGenerationRecordAdvancedDownload"),
    server.indexOf("async function runMediaIngestJob"),
  );
  assert.match(queue, /enqueueMediaIngestJobInDb\(taskId/);
  assert.match(queue, /advancedDownloadStatus: "preparing"/);
  assert.match(queue, /void scanMediaIngestQueue\(\)/);
  assert.doesNotMatch(queue, /runMediaIngestJob\(taskId\)/);
  assert.match(queue, /!dbEnabled\(\)/);
  assert.match(queue, /!generatedOutputStorageEnabled\(\)/);
  assert.match(queue, /generationRecordHasR2Download\(record\)/);
});

test("failed media ingest jobs can be manually requeued after retry exhaustion", () => {
  const enqueue = db.slice(
    db.indexOf("async function enqueueMediaIngestJobInDb"),
    db.indexOf("async function claimMediaIngestJobInDb"),
  );
  assert.match(enqueue, /WHEN app_media_ingest_jobs\.status = 'failed' THEN 0/);
  assert.match(enqueue, /status = CASE[\s\S]*ELSE 'queued'/);
  assert.match(enqueue, /available_at = CASE[\s\S]*ELSE NOW\(\)/);
});

test("bounded media persistence recovery only targets succeeded records with provider video", () => {
  const recovery = db.slice(
    db.indexOf("async function getGenerationRecordsNeedingMediaPersistenceFromDb"),
    db.indexOf("async function getGenerationRecordsNeedingResultAssetMediaBackfillFromDb"),
  );
  assert.match(recovery, /LOWER\(COALESCE\(payload->>'status', ''\)\) IN \('succeeded', 'completed', 'success', 'done'\)/);
  assert.match(recovery, /COALESCE\(payload->>'cdnVideoUrl', ''\) = ''/);
  assert.match(recovery, /COALESCE\(payload->>'localVideoUrl', ''\) = ''/);
  assert.match(recovery, /mediaPersistenceAttempts/);
  assert.match(recovery, /mediaPersistenceRetryAt/);
  assert.match(recovery, /mediaPersistenceTerminalAt/);
  assert.match(recovery, /advancedDownloadStatus[^\n]*NOT IN \([^\n]*'failed'/);
  assert.match(recovery, /queryResponse'->'content'->>'video_url'/);
  assert.match(server, /const GENERATION_MEDIA_PERSISTENCE_MAX_AGE_MS = Math\.max\([^\n]*24 \* 60 \* 60 \* 1000/);
  assert.match(server, /async function scanGenerationRecordMissingMediaPersistence/);
  assert.match(server, /prepareGenerationRecordAdvancedDownload\(current\)/);
  assert.match(server, /setTimeout\(\(\) => scanGenerationRecordMissingMediaPersistence\("startup"\), 35000\)/);
});

test("poster-only maintenance does not fail on a concurrently missing video record", () => {
  const queue = server.slice(
    server.indexOf("function queueGeneratedVideoDownload"),
    server.indexOf("function adminRecordMediaAssetUrl"),
  );
  assert.match(queue, /if \(repairPoster\) \{/);
  assert.match(queue, /downloaded\.posterStorageKey/);
  assert.match(queue, /cdnVideoUrl: downloaded\.cdnVideoUrl \|\| current\.cdnVideoUrl \|\| ""/);
  assert.match(queue, /\.\.\.\(!repairPoster \? \{/);
});

test("background video downloads cool down and stop retrying expired media", () => {
  assert.match(server, /function generationRecordVideoDownloadCoolingDown/);
  assert.match(server, /attempts >= GENERATED_MEDIA_R2_RETRY_MAX_ATTEMPTS/);
  assert.match(server, /cdnRetryCount: attempts/);
  assert.match(server, /const detail = String\(error\.message \|\| error \|\| "Generated video download failed\."\)\.slice\(0, 500\)/);
  assert.match(server, /cdnError: detail,/);
  assert.match(server, /if \(String\(record\.cdnPosterUrl \|\| record\.posterUrl \|\| ''\)\.trim\(\)\) return false;/);
});

test("background media transfer uses a global bounded worker pool", () => {
  assert.match(server, /const MEDIA_INGEST_CONCURRENCY = Math\.max\(1, Math\.min\(8/);
  assert.match(server, /const mediaIngestRunning = new Set\(\)/);
  const scan = server.slice(
    server.indexOf("async function scanMediaIngestQueue"),
    server.indexOf("async function runClaimedMediaIngestJob"),
  );
  assert.match(scan, /MEDIA_INGEST_CONCURRENCY - mediaIngestRunning\.size/);
  assert.match(scan, /claimNextMediaIngestJobsInDb\(slots/);
  assert.match(scan, /mediaIngestRunning\.add\(id\)/);
  assert.match(scan, /mediaIngestRunning\.delete\(id\)/);
  assert.doesNotMatch(scan, /await runClaimedMediaIngestJob\(job\)/);
  assert.match(read(".env.example"), /MEDIA_INGEST_CONCURRENCY=3/);
});

test("stale media jobs stop being claimed at the retry limit", () => {
  const claimNext = db.slice(
    db.indexOf("async function claimNextMediaIngestJobsInDb"),
    db.indexOf("async function completeMediaIngestJobInDb"),
  );
  assert.match(claimNext, /AND attempts < 5/);
  const fail = db.slice(
    db.indexOf("async function failMediaIngestJobInDb"),
    db.indexOf("async function updateGenerationRecordAdvancedDownloadInDb"),
  );
  assert.match(fail, /maxAttempts = 5/);
  assert.match(fail, /SET status = CASE WHEN \$5::boolean = false OR attempts >= \$3 THEN 'failed'/);
});

test("background media transfer never rewrites generation status and deduplicates images", () => {
  const prepare = server.slice(
    server.indexOf("async function prepareGenerationRecordAdvancedDownload"),
    server.indexOf("function generationImageResultUrl"),
  );
  const worker = server.slice(
    server.indexOf("async function runClaimedMediaIngestJob"),
    server.indexOf("async function prepareGenerationRecordAdvancedDownload"),
  );
  assert.doesNotMatch(prepare, /status:\s*["'](?:succeeded|failed|processing)["']/);
  assert.doesNotMatch(worker, /status:\s*["'](?:succeeded|failed|processing)["']/);
  assert.match(prepare, /cdnImageUrls: uploads\.map\(\(item\) => item\.publicUrl\)/);
  assert.match(prepare, /advancedDownloadStatus: errors\.length \? "preparing" : "ready"/);
  const hasDownload = server.slice(
    server.indexOf("function generationRecordHasR2Download"),
    server.indexOf("function awsQueryEncode"),
  );
  assert.match(hasDownload, /stored\.length >= expected\.length/);
  assert.match(db, /ON CONFLICT \(task_id\) DO UPDATE SET/);
});

test("media ingest drains OSS transfers without starving retry-exhausted rows", () => {
  const scan = server.slice(
    server.indexOf("async function scanMediaIngestQueue"),
    server.indexOf("async function runClaimedMediaIngestJob"),
  );
  const failure = server.slice(
    server.indexOf("function isRetryableMediaIngestError"),
    server.indexOf("function advancedDownloadFailureMessage"),
  );
  assert.match(scan, /expireExhaustedMediaIngestJobsInDb\(5, \{ staleMinutes: 20 \}\)/);
  assert.match(scan, /MEDIA_INGEST_CONCURRENCY/);
  assert.match(server, /process\.env\.MEDIA_INGEST_CONCURRENCY \|\| 3/);
  assert.match(failure, /403/);
  assert.match(failure, /return false/);
  assert.match(server, /retryable: isRetryableMediaIngestError\(error\)/);
  assert.match(db, /SET status = 'failed'[\s\S]*status = 'queued' AND attempts >= \$1[\s\S]*status = 'processing' AND attempts >= \$1/);
  assert.match(db, /UPDATE app_generation_records records[\s\S]*advancedDownloadStatus[\s\S]*failed/);
  assert.match(db, /async function syncFailedMediaIngestRecordStatusesInDb/);
  assert.match(scan, /syncFailedMediaIngestRecordStatusesInDb\(200\)/);
  assert.match(db, /app_generation_records_advanced_download_pending_idx[\s\S]*?WHERE payload->>'advancedDownloadStatus' IN \('preparing', 'queued', 'processing'\)/);
});

test("stale submission scan uses the partial index predicate verbatim", () => {
  const db = read("db.js");
  const start = db.indexOf("async function getStalePreSubmitGenerationRecordsFromDb");
  const end = db.indexOf("async function getGenerationRecordsForScheduledMaintenanceFromDb", start);
  const block = db.slice(start, end);
  assert.ok(start > 0 && end > start);
  assert.match(block, /AND payload->>'awaitingUpstreamTask' = 'true'/);
  assert.match(block, /AND COALESCE\(payload->>'upstreamTaskId', ''\) = ''/);
  assert.doesNotMatch(block, /COALESCE\(payload->>'awaitingUpstreamTask', 'false'\) = 'true'/);
});

test("automatic advanced download recovery never reopens terminal failures", () => {
  const queue = server.slice(
    server.indexOf("function queueGenerationRecordAdvancedDownload"),
    server.indexOf("const MEDIA_INGEST_CONCURRENCY"),
  );
  const handler = server.slice(
    server.indexOf("async function handleGenerationRecordDownloadUrl"),
    server.indexOf("async function handleDownloadGenerationRecord"),
  );
  assert.match(queue, /function queueGenerationRecordAdvancedDownload\(record = \{\}, \{ retryFailed = false \} = \{\}\)/);
  assert.match(queue, /!retryFailed && String\(record\?\.advancedDownloadStatus \|\| ""\)\.toLowerCase\(\) === "failed"/);
  assert.match(handler, /queueGenerationRecordAdvancedDownload\(record, \{ retryFailed: retry \}\)/);
});

test("advanced download preparation is queued so the download-url request cannot hit proxy timeout", () => {
  const handler = server.slice(
    server.indexOf("async function handleGenerationRecordDownloadUrl"),
    server.indexOf("async function handleDownloadGenerationRecord"),
  );
  assert.match(server, /const advancedDownloadPreparationQueued = new Set\(\)/);
  assert.match(server, /function queueGenerationRecordAdvancedDownload\(record = \{\}, \{ retryFailed = false \} = \{\}\)/);
  assert.match(server, /advancedDownloadPreparationQueued\.has\(taskId\)/);
  assert.match(server, /advancedDownloadStatus: "preparing"/);
  assert.match(server, /advancedDownloadStatus: "failed"/);
  assert.match(server, /advancedDownloadError: advancedDownloadFailureMessage\(error\)/);
  assert.match(handler, /queueGenerationRecordAdvancedDownload\(record, \{ retryFailed: retry \}\)/);
  assert.match(handler, /status: "preparing"/);
  assert.match(handler, /preparationStatus === "failed" && !retry/);
  assert.doesNotMatch(handler, /preparationStatus === "preparing"/);
  assert.doesNotMatch(handler, /await prepareGenerationRecordAdvancedDownload\(/);
});

test("advanced download eligibility does not require a pre-existing R2 copy", () => {
  assert.match(server, /advancedDownloadAvailable: Boolean\(/);
  assert.match(ui, /record\?\.r2DownloadReady \|\| record\?\.advancedDownloadAvailable/);
  assert.match(create, /const advancedDownloadState = advancedDownloadUiState\(record\)/);
  assert.match(create, /const advancedDownloadLabel = advancedDownloadButtonLabel\(record\)/);
  assert.match(explore, /const advancedDownloadState = advancedDownloadUiState\(record\)/);
  assert.match(explore, /const advancedDownloadLabel = advancedDownloadButtonLabel\(record\)/);
  assert.match(ui, /download2 可下载/);
  assert.match(ui, /download2 加速中/);
  assert.match(ui, /download2 重试/);
});

test("public generation records expose media transfer state without private errors", () => {
  const publicRecord = server.slice(
    server.indexOf("function publicGenerationRecord"),
    server.indexOf("function adminGenerationRecordView", server.indexOf("function publicGenerationRecord")),
  );
  assert.match(publicRecord, /advancedDownloadStatus: String\(record\.advancedDownloadStatus \|\| ""\)\.toLowerCase\(\)/);
  assert.doesNotMatch(publicRecord, /advancedDownloadError:/);
});

test("media transfer status is rendered in result, history, and detail surfaces", () => {
  const helper = ui.slice(
    ui.indexOf("function advancedDownloadButtonLabel"),
    ui.indexOf("function setAdvancedDownloadButtonState"),
  );
  assert.match(helper, /status === "ready"/);
  assert.match(helper, /status === "preparing"/);
  assert.match(helper, /status === "failed"/);
  assert.match(helper, /return "ready"/);
  assert.match(helper, /status === "queued" \|\| status === "processing"/);
  assert.match(helper, /素材加速中…/);
  assert.match(helper, /素材加速失败/);
  assert.match(helper, /生成已完成，正在准备高速下载/);
  assert.match(helper, /生成已完成，但素材加速失败/);
  assert.match(create, /\$\{advancedDownloadStatusPill\(record\)\}/);
  assert.match(create, /advancedDownloadState === "preparing" \? " is-preparing" : ""/);
  assert.match(create, /advancedDownloadDisabled = !canAdvancedDownload \|\| advancedDownloadState === "preparing"/);
  assert.match(explore, /\$\{advancedDownloadStatusPill\(record, \{ detail: true \}\)\}/);
  assert.match(explore, /advancedDownloadDisabled = !canAdvancedDownload \|\| advancedDownloadState === "preparing"/);
  assert.match(siteCanvas, /application\/x-workflow-media-result/);
  assert.match(siteCanvas, /sourceNodeId/);
  assert.match(siteNode, /window\.runWorkflowSingleNode/);
  assert.match(css, /\.media-transfer-state\.is-preparing svg \{[\s\S]*?animation: spin/);
  assert.match(css, /\.media-transfer-state\.is-failed \{/);
  assert.match(css, /\.history-r2-download\.is-preparing,/);
});

test("download2 buttons do not render the slow-download save hint bubble", () => {
  assert.doesNotMatch(create, /advanced-result-download-hint|如果下载素材慢请点击我保存/);
  assert.doesNotMatch(explore, /advanced-result-download-hint|如果下载素材慢请点击我保存/);
  assert.doesNotMatch(ui, /advanced-result-download-hint|如果下载素材慢请点击我保存/);
  assert.doesNotMatch(css, /\.advanced-result-download-hint/);
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

test("free locked Undress originals and previews are persisted only to OSS", () => {
  const freeResult = server.slice(
    server.indexOf("if (freeImageGeneration) {"),
    server.indexOf("} else {", server.indexOf("if (freeImageGeneration) {")),
  );
  assert.match(freeResult, /uploadStaticAssetToObjectStorage\(/);
  assert.match(freeResult, /await verifyObjectStorageMedia\(upload/);
  assert.match(freeResult, /localImagePath: "",/);
  assert.match(freeResult, /localImageUrl: "",/);
  assert.match(freeResult, /createGeneratedMediaWorkspace\(`locked-result-/);
  assert.match(freeResult, /createUndressLockedPreview\(taskId, sourcePath, \{ workspace \}\)/);
  assert.match(freeResult, /removeGeneratedMediaWorkspace\(workspace\)/);
  assert.doesNotMatch(freeResult, /forceLocal: true/);
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
  const scanStart = server.indexOf("async function scanGenerationRecordMissingPosterBackfill");
  const scanEnd = server.indexOf("function startGenerationRecordMediaRecoveryScheduler", scanStart);
  const scan = server.slice(scanStart, scanEnd);
  assert.match(db, /async function getGenerationRecordsNeedingPosterMaintenanceFromDb/);
  assert.match(db, /COALESCE\(payload->>'cdnPosterUrl', ''\) = ''/);
  assert.match(db, /COALESCE\(payload->>'localPosterUrl', ''\) = ''/);
  assert.match(db, /COALESCE\(payload->>'localVideoUrl', ''\) <> ''/);
  assert.match(db, /COALESCE\(payload->>'kind', ''\) NOT ILIKE '%image%'/);
  assert.match(db, /COALESCE\(payload->>'provider', ''\) NOT ILIKE '%image%'/);
  assert.match(db, /LOWER\(COALESCE\(payload->>'advancedDownloadStatus', ''\)\) <> 'failed'/);
  assert.match(server, /generationRecordNeedsPosterMaintenance[\s\S]*?advancedDownloadStatus[\s\S]*?=== "failed"/);
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
  assert.match(video, /createGeneratedVideoPoster\(taskId, source, \{ directory: workspace \}\)/);
  const posterBranch = video.slice(
    video.indexOf("if (posterOnly)"),
    video.indexOf('const workspace = await createGeneratedMediaWorkspace(taskId || "video")'),
  );
  assert.match(posterBranch, /uploadStaticAssetToObjectStorage\(/);
  assert.match(posterBranch, /removeGeneratedMediaWorkspace\(workspace\)/);
  assert.doesNotMatch(posterBranch, /fs\.writeFile\(/);
});

test("public records expose repaired posters to both result surfaces", () => {
  assert.match(server, /posterPending: generationRecordNeedsPosterMaintenance\(record\)/);
  assert.match(server, /cdnPosterUrl: includeStoredVideoUrls \? preferredPosterUrl : ""/);
  assert.match(server, /localPosterUrl: includeStoredVideoUrls[\s\S]{0,120}deliverableStoredMediaUrl\(record\.localPosterUrl/);
});
