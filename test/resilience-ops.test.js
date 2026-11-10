"use strict";

const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const snapshotBuilder = fs.readFileSync(path.join(root, "scripts", "build_release_snapshot.py"), "utf8");
const verifyScript = fs.readFileSync(path.join(root, "ops", "verify-postgres-backup.sh"), "utf8");
const watchdogScript = fs.readFileSync(path.join(root, "ops", "service-watchdog.sh"), "utf8");
const watchdogService = fs.readFileSync(path.join(root, "ops", "systemd", "raising-game-watchdog.service"), "utf8");
const watchdogTimer = fs.readFileSync(path.join(root, "ops", "systemd", "raising-game-watchdog.timer"), "utf8");
const plan = fs.readFileSync(path.join(root, "ops", "RESILIENCE-PLAN.md"), "utf8");

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: root,
    env: { ...process.env, ...(options.env || {}) },
    encoding: "utf8",
  });
  assert.equal(result.status, 0, `${command} failed:\n${result.stdout}\n${result.stderr}`);
  return result.stdout;
}

test("resilience operations are included only in the platform release snapshot", () => {
  for (const file of [
    "ops/RESILIENCE-PLAN.md",
    "ops/service-watchdog.sh",
    "ops/systemd/raising-game-watchdog.service",
    "ops/systemd/raising-game-watchdog.timer",
    "ops/verify-postgres-backup.sh",
  ]) {
    assert.match(snapshotBuilder, new RegExp(`"${file.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"`));
  }
});

test("restore drill refuses the source database and verifies into an isolated database", () => {
  assert.match(verifyScript, /Refusing to restore over the source database/);
  assert.match(verifyScript, /--exit-on-error --no-owner --no-privileges --single-transaction/);
  assert.match(verifyScript, /information_schema\.tables/);
  assert.match(verifyScript, /invalid_indexes/);
  assert.match(verifyScript, /DRILL_CLEANUP_OK/);
  assert.match(verifyScript, /DRILL_DB_RETAINED/);
  assert.match(verifyScript, /SOURCE_MATCH=1/);
  assert.match(verifyScript, /pg_export_snapshot/);
  assert.match(verifyScript, /--snapshot="?\$snapshot_id/);
  assert.match(verifyScript, /SOURCE_MANIFEST_TABLES/);
  assert.match(verifyScript, /SNAPSHOT_MANIFEST_MISMATCH/);
  assert.match(verifyScript, /DRAIN_TIMEOUT_SECONDS/);
  assert.match(verifyScript, /wait_for_exporter/);
  assert.doesNotMatch(verifyScript, /dblink|CORE_ROW_IDENTITY/);
});

test("watchdog uses liveness, requires consecutive failures, and skips inactive services", () => {
  assert.match(watchdogScript, /127\.0\.0\.1:4174\/api\/livez/);
  assert.match(watchdogScript, /FAILURE_THRESHOLD/);
  assert.match(watchdogScript, /SERVICE_CHECK_ACTIVE/);
  assert.match(watchdogService, /Environment=HEALTH_URL=http:\/\/127\.0\.0\.1:4174\/api\/livez/);
  assert.match(watchdogService, /Environment=FAILURE_THRESHOLD=3/);
  assert.match(watchdogTimer, /OnUnitActiveSec=10s/);
  assert.match(watchdogTimer, /WantedBy=timers\.target/);
});

test("resilience plan does not promise multi-process or RPO before verification", () => {
  assert.match(plan, /Do not run multiple copies of `server\.js` yet/);
  assert.match(plan, /advisory-lock leader/);
  assert.match(plan, /current daily-only backup does not meet the RPO target/i);
  assert.match(plan, /off-host backup independent of both production hosts/);
});
