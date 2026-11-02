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
