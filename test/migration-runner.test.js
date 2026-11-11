"use strict";

const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const path = require("node:path");
const test = require("node:test");

const runnerPath = path.resolve(__dirname, "..", "ops", "run-db-migrations.js");
const { createMigrationPlan, parseArgs, renderPlan } = require("../ops/run-db-migrations");
const fs = require("node:fs");

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
  assert.equal(plan.pending.length, 3);
  assert.match(plan.pending[0].version, /schema-bootstrap/);
  assert.match(plan.pending[1].version, /webhook-deliveries/);
  assert.match(plan.pending[2].version, /generation-records-kv/);
});

test("migration runner never applies without an explicit database URL", () => {
  const result = run(["--apply"]);
  assert.equal(result.status, 2);
  assert.match(result.stderr, /DATABASE_URL is required/);
});

test("migration runner validates lock timeout and renders stable audit output", () => {
  assert.throws(() => parseArgs(["--lock-timeout-ms=10"]), /between 100 and 300000/);
  const plan = createMigrationPlan({ completedKeys: ["2026-11-11-schema-bootstrap-v1", "2026-11-11-webhook-deliveries-v1", "2026-11-11-generation-records-kv-v1"], dryRun: true, lockTimeoutMs: 2500 });
  assert.equal(plan.pending.length, 0);
  assert.match(renderPlan(plan), /migration_mode=dry-run/);
  assert.match(renderPlan(plan), /completed_version=2026-11-11-schema-bootstrap-v1/);
});

test("recorded bootstrap does not suppress webhook schema repair", () => {
  const source = fs.readFileSync(runnerPath, "utf8");
  assert.match(source, /Bootstrap means "the baseline schema has been checked", not "every/);
  assert.match(source, /DDL is idempotent\. Execute it even when the ledger says completed/);
  assert.match(source, /to_regclass\('public\.app_users'\)/);
});

test("migration plan preserves independently completed schema and data versions", () => {
  const plan = createMigrationPlan({
    completedKeys: ["2026-11-11-generation-records-kv-v1"],
    dryRun: true,
    lockTimeoutMs: 2500,
  });
  assert.deepEqual(plan.pending.map((item) => item.version), [
    "2026-11-11-schema-bootstrap-v1",
    "2026-11-11-webhook-deliveries-v1",
  ]);
  assert.deepEqual(plan.completed, ["2026-11-11-generation-records-kv-v1"]);
});

test("webhook schema v2 remains pending when only bootstrap is recorded", () => {
  const plan = createMigrationPlan({
    completedKeys: ["2026-11-11-schema-bootstrap-v1", "2026-11-11-generation-records-kv-v1"],
    dryRun: true,
    lockTimeoutMs: 2500,
  });
  assert.deepEqual(plan.pending.map((item) => item.version), ["2026-11-11-webhook-deliveries-v1"]);
});

test("migration runner is self-bootstrapping and serializes schema/data work", () => {
  const source = fs.readFileSync(runnerPath, "utf8");
  assert.match(source, /CREATE TABLE IF NOT EXISTS app_catalog_migration_state/);
  assert.match(source, /CREATE TABLE IF NOT EXISTS app_webhook_deliveries/);
  assert.match(source, /raising_game_schema_migrations_v1/);
  assert.match(source, /raising_game_data_migrations_v1/);
  assert.match(source, /lease_until/);
  assert.match(source, /claim_token/);
  assert.match(source, /require\(path\.join\(RUNTIME_ROOT, "db\.js"\)\)/);
});
