"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const {
  LOCAL_MEDIA_RETENTION_MS,
  markPublishedFile,
  removeExpiredFiles,
  removeExpiredPublishedFiles,
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

test("server schedules hourly local-media cleanup and marks R2 outputs", async () => {
  const server = await fs.readFile(path.resolve(__dirname, "..", "server.js"), "utf8");
  assert.match(server, /startLocalMediaCleanupScheduler\(\);/);
  assert.match(server, /setInterval\(\(\) => cleanupStaleLocalMedia\(\), 60 \* 60 \* 1000\)/);
  assert.match(server, /await markPublishedFile\(localVideoPath\)/);
  assert.match(server, /await markPublishedFile\(localPosterPath\)/);
  assert.match(server, /await markPublishedFile\(localImagePath\)/);
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
  assert.match(server, /findUploadedR2Object\(objectStoragePath\("generated", "videos"/);
  assert.match(server, /startGenerationRecordMediaRecoveryScheduler\(\);/);
  assert.match(server, /setInterval\(\(\) => scanGenerationRecordMediaRecovery\("timer"\), 5 \* 60 \* 1000\)/);
  assert.match(server, /getGenerationRecordsNeedingR2RecoveryFromDb\(\{ limit: 100 \}\)/);
  assert.match(await fs.readFile(path.resolve(__dirname, "..", "db.js"), "utf8"), /async function getGenerationRecordsNeedingR2RecoveryFromDb\(/);
});
