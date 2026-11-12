"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { DRILL_DATABASE_PREFIX, assertDrillDatabase, drillDatabaseName, parseArgs } = require("../ops/drill-generation-kv-migration");

test("migration drill refuses production-looking databases", () => {
  assert.throws(() => assertDrillDatabase("postgres://user:pass@db/raising_game"), /disposable database/);
  assert.equal(assertDrillDatabase("postgres://user:pass@db/raising_game_migration_drill_20261111"), "raising_game_migration_drill_20261111");
  assert.equal(drillDatabaseName("postgres://user:pass@db/raising_game_migration_drill_x?sslmode=disable"), "raising_game_migration_drill_x");
  assert.match(DRILL_DATABASE_PREFIX, /migration_drill/);
});

test("migration drill defaults to dry-run and parses explicit apply", () => {
  assert.equal(parseArgs([]).apply, false);
  assert.equal(parseArgs(["--apply"]).apply, true);
  assert.equal(parseArgs(["--apply", "--dry-run"]).apply, false);
  assert.equal(parseArgs(["--database-url=postgres://x/y"]).databaseUrl, "postgres://x/y");
  assert.throws(() => parseArgs(["--unknown"]), /Unknown argument/);
});
