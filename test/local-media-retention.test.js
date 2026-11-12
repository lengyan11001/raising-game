"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const {
  LOCAL_MEDIA_RETENTION_MS,
  markPublishedFile,
  markPublishedFileSafely,
  removeExpiredFiles,
  removeExpiredPublishedFiles,
  cleanupTransientMediaWorkspaces,
} = require("../local-media-retention");

async function oldFile(filePath, contents = "old") {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, contents);
  const old = new Date(Date.now() - LOCAL_MEDIA_RETENTION_MS - 60_000);
  await fs.utimes(filePath, old, old);
}

test("local user uploads expire after one day", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "user-upload-retention-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const expired = path.join(root, "old-user", "expired.mp4");
  const fresh = path.join(root, "new-user", "fresh.png");
  await oldFile(expired, "expired-media");
  await fs.mkdir(path.dirname(fresh), { recursive: true });
  await fs.writeFile(fresh, "fresh-media");

  const result = await removeExpiredFiles(root, Date.now() - LOCAL_MEDIA_RETENTION_MS);

  assert.equal(result.files, 1);
  await assert.rejects(fs.access(expired));
  await fs.access(fresh);
});

test("generated files expire only after R2 publication is marked", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "generated-retention-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const published = path.join(root, "published.mp4");
  const localOnly = path.join(root, "local-only.mp4");
  await oldFile(published, "published-media");
  await oldFile(localOnly, "local-only-media");
  const marker = await markPublishedFile(published);
  const old = new Date(Date.now() - LOCAL_MEDIA_RETENTION_MS - 60_000);
  await fs.utimes(marker, old, old);

  const result = await removeExpiredPublishedFiles([root], Date.now() - LOCAL_MEDIA_RETENTION_MS);

  assert.equal(result.files, 1);
  await assert.rejects(fs.access(published));
  await assert.rejects(fs.access(marker));
  await fs.access(localOnly);
});

test("R2 marker failures never invalidate an already uploaded file", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "generated-marker-failure-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const missing = path.join(root, "missing", "image.png");

  assert.equal(await markPublishedFileSafely(missing), "");
});

test("cleanup removes only stale disposable OS temp workspaces", async (t) => {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "transient-media-retention-"));
  t.after(() => fs.rm(tmpDir, { recursive: true, force: true }));
  const mediaRoot = path.join(tmpDir, "raising-game-media");
  const staleWorkspace = path.join(mediaRoot, "stale-job");
  const freshWorkspace = path.join(mediaRoot, "fresh-job");
  const stalePoster = path.join(tmpDir, "raising-game-poster-stale");
  const freshPoster = path.join(tmpDir, "raising-game-poster-fresh");
  const outside = path.join(tmpDir, "business-media");
  for (const directory of [staleWorkspace, freshWorkspace, stalePoster, freshPoster, outside]) {
    await fs.mkdir(directory, { recursive: true });
  }
  const old = new Date(Date.now() - LOCAL_MEDIA_RETENTION_MS - 60_000);
  for (const directory of [staleWorkspace, stalePoster, outside]) await fs.utimes(directory, old, old);

  const result = await cleanupTransientMediaWorkspaces({ tmpDir });

  assert.equal(result.directories, 2);
  await assert.rejects(fs.access(staleWorkspace));
  await assert.rejects(fs.access(stalePoster));
  await fs.access(freshWorkspace);
  await fs.access(freshPoster);
  await fs.access(outside);
});

test("server schedules temp cleanup without deleting business media", async () => {
  const server = await fs.readFile(path.resolve(__dirname, "..", "server.js"), "utf8");
  assert.match(server, /startLocalMediaCleanupScheduler\(\);/);
  assert.match(server, /setInterval\(\(\) => runLocalMediaCleanupSchedulerTick\(\), 5 \* 60 \* 1000\)/);
  const cleanupStart = server.indexOf("async function cleanupStaleLocalMedia()");
  const cleanupEnd = server.indexOf("async function deleteStoredGeneratedObject", cleanupStart);
  const cleanupBlock = server.slice(cleanupStart, cleanupEnd);
  assert.match(cleanupBlock, /cleanupTransientMediaWorkspaces\(\)/);
  assert.doesNotMatch(cleanupBlock, /USER_UPLOAD_DIR|GENERATED_IMAGE_DIR|GENERATED_VIDEO_DIR|locked-previews/);
  assert.match(server, /async function expireGeneratedR2Objects\(\)[\s\S]*?successful generation media retention is permanent/);
  assert.match(server, /async function downloadGeneratedVideo\([\s\S]*?removeGeneratedMediaWorkspace\(workspace\)/);
  assert.match(server, /cdnVideoUrl: cdn\.cdnVideoUrl[\s\S]*?storageKey: cdn\.storageKey/);
});

test("server rehydrates cleaned user-upload assets before upstream reuse", async () => {
  const server = await fs.readFile(path.resolve(__dirname, "..", "server.js"), "utf8");
  assert.match(server, /function restorablePublicUrlForUserAsset/);
  assert.match(server, /async function ensureLocalUserAssetFile/);
  assert.match(server, /downloadRemoteFileToBuffer\(remoteUrl/);
  assert.match(server, /localRestoredAt/);
  assert.match(server, /function missingUserAssetFileError/);
  assert.match(server, /async function ensureLocalAssetUrlFile/);

  const normalizeImage = server.indexOf("async function normalizeUserImageAssetForUpstream");
  const seedanceCreateAsset = server.indexOf("async function ensureSeedanceAssetForUserAsset");
  const publicMedia = server.indexOf("async function ensurePublicUrlForUserMediaAsset");
  const wan30Mirror = server.indexOf("async function ensureWan30R2MirrorForUserMediaAsset");
  const videoTool = server.indexOf("async function localVideoToolAssetPath");
  const publishLocal = server.indexOf("async function publishLocalAssetUrlToObjectStorage");
  assert.ok(server.indexOf("ensureLocalUserAssetFile(db, userAsset", normalizeImage) > normalizeImage);
  assert.ok(server.indexOf("ensureLocalUserAssetFile(db, userAsset", seedanceCreateAsset) > seedanceCreateAsset);
  assert.ok(server.indexOf("readLocalUserAssetBytes(db, userAsset", publicMedia) > publicMedia);
  assert.ok(server.indexOf("readLocalUserAssetBytes(db, userAsset", wan30Mirror) > wan30Mirror);
  assert.ok(server.indexOf("ensureLocalUserAssetFile(null, asset", videoTool) > videoTool);
  assert.ok(server.indexOf("ensureLocalAssetUrlFile(value", publishLocal) > publishLocal);
});

test("generation records recover delayed R2 publication automatically", async () => {
  const server = await fs.readFile(path.resolve(__dirname, "..", "server.js"), "utf8");
  assert.match(server, /async function recoverGenerationRecordR2Urls\(/);
  assert.match(server, /async function ensureGenerationRecordImageR2Published\(/);
  assert.match(server, /findUploadedR2Object\(objectStoragePath\("generated", "videos"/);
  assert.match(server, /startGenerationRecordMediaRecoveryScheduler\(\);/);
  assert.match(server, /setInterval\(\(\) => runGenerationRecordMediaRecoverySchedulerTick\("timer"\), 5 \* 60 \* 1000\)/);
  assert.match(server, /getGenerationRecordsNeedingR2RecoveryFromDb\(\{ limit: 100 \}\)/);
  assert.match(await fs.readFile(path.resolve(__dirname, "..", "db.js"), "utf8"), /async function getGenerationRecordsNeedingR2RecoveryFromDb\(/);
  assert.match(await fs.readFile(path.resolve(__dirname, "..", "db.js"), "utf8"), /updated_at > NOW\(\) - INTERVAL '48 hours'/);
  assert.match(await fs.readFile(path.resolve(__dirname, "..", "db.js"), "utf8"), /payload->>'localImagePath'/);
});

test("successful generated media retention is permanent and never purged by age", async () => {
  const server = await fs.readFile(path.resolve(__dirname, "..", "server.js"), "utf8");
  const db = await fs.readFile(path.resolve(__dirname, "..", "db.js"), "utf8");
  assert.match(server, /function generationRecordR2Expired\(record = \{\}\)/);
  assert.match(server, /function shouldRefreshGenerationRecord[\s\S]*?if \(generationRecordR2Expired\(record\)\) return false;/);
  assert.match(server, /function generationRecordNeedsMediaMaintenance[\s\S]*?generationRecordR2Expired\(record\)/);
  assert.match(server, /function generationRecordR2PublicationPending[\s\S]*?generationRecordR2Expired\(record\)/);
  assert.match(server, /async function expireGeneratedR2Objects\(\)[\s\S]*?successful generation media retention is permanent/);
  assert.doesNotMatch(server, /'localVideoUrl', ''[\s\S]*?'remoteVideoUrl', ''[\s\S]*?'error', ''/);
  assert.match(db, /async function backfillGenerationRecordResultAssetMediaFieldsInDb/);
  assert.match(db, /async function getGenerationRecordsNeedingResultAssetMediaBackfillFromDb/);
  assert.match(db, /JOIN app_user_assets assets[\s\S]*?assets\.user_id = records\.payload->>'userId'/);
  assert.match(db, /assets\.id = records\.payload->>'resultAssetId'/);
  assert.match(server, /startGenerationRecordResultAssetMediaBackfillScheduler\(\);/);
  assert.match(server, /runGenerationRecordResultAssetMediaBackfillSchedulerTick\("startup"\)/);
  assert.match(db, /COALESCE\(NULLIF\(payload->>'\$\{key\}', ''\), \$\$\{index\}::text\)/);
});
