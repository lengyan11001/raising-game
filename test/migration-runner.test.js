"use strict";

const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const path = require("node:path");
const test = require("node:test");

const runnerPath = path.resolve(__dirname, "..", "ops", "run-db-migrations.js");
const { createMigrationPlan, parseArgs, renderPlan } = require("../ops/run-db-migrations");

function run(args = []) {
  return spawnSync(process.execPath, [runnerPath, ...args], {
    cwd: path.resolve(__dirname, ".."),
    encoding: "utf8",
    env: { ...process.env, DATABASE_URL: "" },
  });
}

test("migration runner defaults to dry-run and shows pending versions", () => {
  const result = run(["--dry-run", "--json"]);
  assert.equal(result.status, 0, result.stderr);
  const plan = JSON.parse(result.stdout);
  assert.equal(plan.dryRun, true);
  assert.equal(plan.pending.length, 2);
  assert.match(plan.pending[0].version, /schema-bootstrap/);
  assert.match(plan.pending[1].version, /generation-records-kv/);
});

test("migration runner never applies without an explicit database URL", () => {
  const result = run(["--apply"]);
  assert.equal(result.status, 2);
  assert.match(result.stderr, /DATABASE_URL is required/);
});

test("migration runner validates lock timeout and renders stable audit output", () => {
  assert.throws(() => parseArgs(["--lock-timeout-ms=10"]), /between 100 and 300000/);
  const plan = createMigrationPlan({ completedKeys: ["2026-11-11-schema-bootstrap-v1", "2026-11-11-generation-records-kv-v1"], dryRun: true, lockTimeoutMs: 2500 });
  assert.equal(plan.pending.length, 0);
  assert.match(renderPlan(plan), /migration_mode=dry-run/);
  assert.match(renderPlan(plan), /completed_version=2026-11-11-schema-bootstrap-v1/);
});

test("migration plan preserves independently completed schema and data versions", () => {
  const plan = createMigrationPlan({
    completedKeys: ["2026-11-11-generation-records-kv-v1"],
    dryRun: true,
    lockTimeoutMs: 2500,
  });
  assert.deepEqual(plan.pending.map((item) => item.version), ["2026-11-11-schema-bootstrap-v1"]);
  assert.deepEqual(plan.completed, ["2026-11-11-generation-records-kv-v1"]);
});
