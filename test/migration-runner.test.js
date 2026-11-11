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
  assert.equal(plan.pending.length, 1);
  assert.match(plan.pending[0].version, /generation-records-kv/);
});

test("migration runner never silently applies without an explicit --apply", () => {
  const result = run(["--apply"]);
  assert.equal(result.status, 2);
  assert.match(result.stderr, /apply is not enabled/);
});

test("migration runner validates lock timeout and renders stable audit output", () => {
  assert.throws(() => parseArgs(["--lock-timeout-ms=10"]), /between 100 and 300000/);
  const plan = createMigrationPlan({ completedKeys: ["2026-11-11-generation-records-kv-v1"], dryRun: true, lockTimeoutMs: 2500 });
  assert.equal(plan.pending.length, 0);
  assert.match(renderPlan(plan), /migration_mode=dry-run/);
  assert.match(renderPlan(plan), /completed_version=2026-11-11-generation-records-kv-v1/);
});
