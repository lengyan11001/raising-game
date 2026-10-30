"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const server = read("server.js");
const db = read("db.js");

test("GEO statistics use PostgreSQL tables instead of hot-path JSONB values", () => {
  for (const table of [
    "app_geo_visitor_ips",
    "app_geo_visitor_paths",
    "app_geo_visitor_countries",
    "app_geo_visitor_recent",
    "app_geo_crawler_bots",
    "app_geo_crawler_paths",
    "app_geo_crawler_path_bots",
    "app_geo_crawler_recent",
    "app_geo_character_daily",
    "app_geo_character_daily_ips",
    "app_geo_character_meta",
    "app_geo_character_recent",
    "app_geo_migration_state",
  ]) {
    assert.match(db, new RegExp(`CREATE TABLE IF NOT EXISTS ${table}`));
  }
  assert.match(db, /async function recordGeoVisitorVisitInDb/);
  assert.match(db, /async function recordGeoCrawlerVisitInDb/);
  assert.match(db, /async function recordGeoCharacterVisitInDb/);
  assert.match(db, /async function readGeoVisitorStatsFromDb/);
  assert.match(db, /async function readGeoCrawlerStatsFromDb/);
  assert.match(db, /async function readGeoCharacterVisitStatsFromDb/);
});

test("the legacy GEO JSONB is migrated once in a single transaction and deleted", () => {
  const migration = db.slice(
    db.indexOf("async function migrateGeoStatsKvToTables"),
    db.indexOf("function geoVisitorStatsFromTables"),
  );
  assert.match(migration, /getPool\(\)/);
  assert.match(migration, /client = await pool\.connect\(\)/);
  assert.match(migration, /client\.query\("BEGIN"\)/);
  assert.match(migration, /client\.query\("COMMIT"\)/);
  assert.match(migration, /client\.query\("ROLLBACK"\)/);
  assert.match(migration, /pg_advisory_xact_lock/);
  assert.match(migration, /jsonb_to_recordset/);
  assert.match(migration, /DELETE FROM app_kv WHERE key = ANY/);
  assert.match(server, /migrateGeoStatsKvToTables/);
  assert.match(server, /await migrateGeoStatsKvToTables\(\)/);
});

test("GEO collection defaults off and the admin readers no longer call JSONB KV helpers", () => {
  assert.match(server, /GEO_VISIT_STATS_ENABLED = .*GEO_VISIT_STATS_ENABLED \|\| "0"/);
  assert.match(server, /async function recordGeoVisitStats\(req, url\) \{\s*if \(!GEO_VISIT_STATS_ENABLED\) return;/);
  assert.match(server, /async function recordGeoCharacterVisit[\s\S]*?if \(!GEO_VISIT_STATS_ENABLED\) return;/);
  assert.match(server, /if \(!GEO_VISIT_STATS_ENABLED\) return sendJson\(res, 200, \{ ok: true, disabled: true \}\)/);
  const readers = server.slice(
    server.indexOf("async function readGeoCrawlerStats"),
    server.indexOf("function sameOriginReferer"),
  );
  assert.match(readers, /readGeoCrawlerStatsFromDb/);
  assert.match(readers, /readGeoVisitorStatsFromDb/);
  assert.match(readers, /readGeoCharacterVisitStatsFromDb/);
  assert.doesNotMatch(readers, /getKv\(|setKv\(/);
});
