"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

test("catalog and runtime settings are persisted in PostgreSQL tables", () => {
  const db = read("db.js");
  for (const table of ["app_catalog_entries", "app_runtime_settings", "app_catalog_migration_state"]) {
    assert.match(db, new RegExp(`CREATE TABLE IF NOT EXISTS ${table}`));
  }
  assert.match(db, /PRIMARY KEY \(catalog, id\)/);
  assert.match(db, /async function replaceCatalogEntriesInDb/);
  assert.match(db, /async function listCatalogEntriesFromDb/);
  assert.match(db, /async function getRuntimeSettingFromDb/);
  assert.match(db, /async function setRuntimeSettingInDb/);
});

test("production catalog readers and refresh tools do not read or write catalog JSON", () => {
  const server = read("server.js");
  const presets = read("ourdream-presets.js");
  const route = read("mulerouter-aliyun.js");
  const refresh = read("scripts/refresh-ourdream-presets.js");
  const videoActions = read("scripts/refresh-ourdream-video-actions.js");

  assert.match(server, /listCatalogEntriesFromDb\("showcase_cases"\)/);
  assert.match(server, /listCatalogEntriesFromDb\("chat_live_voices", \{ scope: "component" \}\)/);
  assert.match(server, /listCatalogEntriesFromDb\("chat_live_voices", \{ scope: "realtime" \}\)/);
  assert.match(presets, /listCatalogEntriesFromDb\("ourdream_presets"\)/);
  assert.doesNotMatch(presets, /readFile|presets\.json|video-actions\.json/);
  assert.match(route, /getRuntimeSettingFromDb|setRuntimeSettingInDb/);
  assert.doesNotMatch(route, /readFileSync|writeFileSync|raising-game-demo-aliyun-route\.json/);
  assert.match(refresh, /replaceCatalogEntriesInDb\(/);
  assert.match(videoActions, /replaceCatalogEntriesInDb\(/);
  assert.doesNotMatch(refresh, /writeFile\(OUTPUT|OUTPUT =/);
  assert.doesNotMatch(videoActions, /writeFile\(OUTPUT|OUTPUT =/);
});

test("preset API fails clearly instead of serving a file fallback", () => {
  const server = read("server.js");
  assert.match(server, /code: "OURDREAM_CATALOG_UNAVAILABLE"/);
  assert.match(server, /sendJson\(res, 503/);
  assert.match(server, /DATABASE_URL is required\. Runtime data must be stored in PostgreSQL/);
});

test("generation record KV migration is durable, transactional, and fingerprint-gated", () => {
  const db = read("db.js");
  const block = db.slice(
    db.indexOf("const GENERATION_RECORDS_KV_MIGRATION_KEY"),
    db.indexOf("async function getGenerationRecordsFromDb"),
  );
  assert.match(block, /createHash\("sha256"\)/);
  assert.match(block, /canonicalJson/);
  assert.doesNotMatch(block, /updatedAt: generationRecordUpdatedAt\(record\)/);
  assert.match(block, /reason: "empty-source"/);
  assert.doesNotMatch(block, /if \(!Array\.isArray\(records\) \|\| !records\.length\) \{\n    await markCatalogMigrationInDb/);
  assert.match(block, /getCatalogMigrationStateInDb\(migrationKey\)/);
  assert.match(block, /client\.query\("BEGIN"\)/);
  assert.match(block, /set_config\('lock_timeout'/);
  assert.match(block, /GENERATION_RECORDS_KV_LOCK_TIMEOUT_MS/);
  assert.match(block, /pg_advisory_xact_lock\(hashtextextended\(\$1, 0\)\)/);
  assert.match(block, /priorInLock\.rows\.length/);
  assert.match(block, /INSERT INTO app_catalog_migration_state/);
  assert.match(block, /client\.query\("COMMIT"\)/);
  assert.match(block, /client\.query\("ROLLBACK"\)/);
  assert.ok(block.indexOf('client.query("COMMIT")') < block.indexOf('return { migrated, existing'));
});
