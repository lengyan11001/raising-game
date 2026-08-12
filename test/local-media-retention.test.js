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
