"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const databaseUrl = String(process.env.TEST_DATABASE_URL || "").trim();
const databaseName = (() => {
  try {
    return decodeURIComponent(new URL(databaseUrl).pathname.replace(/^\//, ""));
  } catch {
    return "";
  }
})();
const canRun = Boolean(databaseUrl) && /(?:^|[_-])test(?:$|[_-])/i.test(databaseName);

if (canRun) process.env.DATABASE_URL = databaseUrl;

const db = canRun ? require("../db") : null;

test("story generation ref sync updates status and merges metadata without overwriting", {
  skip: !canRun ? "Set TEST_DATABASE_URL to a dedicated disposable PostgreSQL test database." : false,
}, async (t) => {
  const { Pool } = require("pg");
  const pool = new Pool({ connectionString: databaseUrl, max: 2 });
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const ownerId = `owner-${suffix}`;
  const projectId = `story-project-${suffix}`;
  const episodeId = `story-episode-${suffix}`;
  const shotId = `story-shot-${suffix}`;
  const refId = `story-ref-${suffix}`;
  const recordId = `cgt-${suffix}`;

  t.after(async () => {
    await pool.query("DELETE FROM app_story_projects WHERE id = $1", [projectId]).catch(() => {});
    await pool.end();
  });

  assert.ok(await db.createStoryProjectInDb({ id: projectId, ownerUserId: ownerId, name: "sync test" }));
  assert.ok(await db.createStoryEpisodeInDb({ id: episodeId, projectId, ownerUserId: ownerId, episodeNo: 1, title: "episode" }));
  assert.ok(await db.createStoryShotInDb({ id: shotId, projectId, episodeId, ownerUserId: ownerId, shotNo: 1, title: "shot" }));
  assert.ok(await db.createStoryGenerationRefInDb({
    id: refId,
    projectId,
    ownerUserId: ownerId,
    shotId,
    generationRecordId: recordId,
    kind: "video",
    status: "queued",
    metadata: { model: "seedance", keep: "yes" },
  }));

  const updated = await db.updateStoryGenerationRefInDb({
    id: refId,
    projectId,
    ownerUserId: ownerId,
    status: "succeeded",
    generationRecordId: recordId,
    metadata: {
      generationStatus: "succeeded",
      videoUrl: "https://media.example.test/video.mp4",
      mediaSyncPending: false,
    },
  });

  assert.ok(updated, "ref should be updated");
  assert.equal(updated.status, "succeeded");
  assert.equal(updated.generationRecordId, recordId);
  assert.equal(updated.metadata.model, "seedance", "existing metadata must survive the merge");
  assert.equal(updated.metadata.keep, "yes");
  assert.equal(updated.metadata.generationStatus, "succeeded");
  assert.equal(updated.metadata.videoUrl, "https://media.example.test/video.mp4");
  assert.equal(updated.metadata.mediaSyncPending, false);

  const persisted = await pool.query(
    `SELECT status, generation_record_id, metadata FROM app_story_generation_refs WHERE id = $1`,
    [refId],
  );
  assert.equal(persisted.rows.length, 1);
  assert.equal(persisted.rows[0].status, "succeeded");
  assert.equal(persisted.rows[0].generation_record_id, recordId);
  assert.equal(persisted.rows[0].metadata.videoUrl, "https://media.example.test/video.mp4");
  assert.equal(persisted.rows[0].metadata.keep, "yes");

  const rejected = await db.updateStoryGenerationRefInDb({
    id: refId,
    projectId,
    ownerUserId: `intruder-${suffix}`,
    status: "failed",
    metadata: { hijacked: true },
  });
  assert.equal(rejected, null, "a foreign owner must not be able to update the ref");

  const afterIntruder = await pool.query(
    `SELECT status, metadata FROM app_story_generation_refs WHERE id = $1`,
    [refId],
  );
  assert.equal(afterIntruder.rows[0].status, "succeeded");
  assert.notEqual(afterIntruder.rows[0].metadata.hijacked, true);
});

test("story generation ref sync query binds every placeholder", () => {
  const fs = require("node:fs");
  const path = require("node:path");
  const source = fs.readFileSync(path.resolve(__dirname, "..", "db.js"), "utf8");
  const start = source.indexOf("async function updateStoryGenerationRefInDb(");
  assert.notEqual(start, -1);
  const end = source.indexOf("\n}\n", start);
  const body = source.slice(start, end);

  const updateStart = body.indexOf("`UPDATE app_story_generation_refs");
  assert.notEqual(updateStart, -1);
  const updateEnd = body.indexOf("`", updateStart + 1);
  const sql = body.slice(updateStart, updateEnd);
  const placeholders = new Set([...sql.matchAll(/\$(\d+)/g)].map((match) => match[1]));
  assert.deepEqual([...placeholders].sort(), ["1", "2", "3", "4", "5"]);
  assert.match(body, /\[\s*refId,\s*parentId,\s*String\(status \|\| ""\),\s*String\(generationRecordId \|\| ""\),\s*JSON\.stringify\(mergedMetadata\)\s*\]/);
});
