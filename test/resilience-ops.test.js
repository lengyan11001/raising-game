"use strict";

const assert = require("node:assert/strict");
const { spawn, spawnSync } = require("node:child_process");
const fs = require("node:fs");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const snapshotBuilder = fs.readFileSync(path.join(root, "scripts", "build_release_snapshot.py"), "utf8");
const verifyScript = fs.readFileSync(path.join(root, "ops", "verify-postgres-backup.sh"), "utf8");
const watchdogScript = fs.readFileSync(path.join(root, "ops", "service-watchdog.sh"), "utf8");
const installScript = fs.readFileSync(path.join(root, "ops", "install-service-watchdog.sh"), "utf8");
const watchdogService = fs.readFileSync(path.join(root, "ops", "systemd", "raising-game-watchdog.service"), "utf8");
const watchdogTimer = fs.readFileSync(path.join(root, "ops", "systemd", "raising-game-watchdog.timer"), "utf8");
const secondaryWatchdogScript = fs.readFileSync(path.join(root, "ops", "secondary-watchdog.sh"), "utf8");
const secondaryWatchdogInstaller = fs.readFileSync(path.join(root, "ops", "install-secondary-watchdog.sh"), "utf8");
const secondaryWatchdogService = fs.readFileSync(path.join(root, "ops", "systemd", "raising-game-watchdog-b.service"), "utf8");
const secondaryWatchdogTimer = fs.readFileSync(path.join(root, "ops", "systemd", "raising-game-watchdog-b.timer"), "utf8");
const plan = fs.readFileSync(path.join(root, "ops", "RESILIENCE-PLAN.md"), "utf8");
const redisPlan = fs.readFileSync(path.join(root, "ops", "REDIS-PLAN.md"), "utf8");
const resilienceDecision = fs.readFileSync(path.join(root, "ops", "RESILIENCE-DECISION-2026-11.md"), "utf8");
const redisUsageMatrix = fs.readFileSync(path.join(root, "ops", "REDIS-USAGE-MATRIX.md"), "utf8");
const multiProcessDrill = fs.readFileSync(path.join(root, "ops", "multi-process-drill.sh"), "utf8");
const nginxDrill = fs.readFileSync(path.join(root, "ops", "nginx-multi-upstream-drill.sh"), "utf8");
const systemdMultiInstanceDrill = fs.readFileSync(path.join(root, "ops", "systemd-multi-instance-drill.sh"), "utf8");
const secondaryUnit = fs.readFileSync(path.join(root, "ops", "systemd", "raising-game-demo-b.service"), "utf8");
const secondaryEnv = fs.readFileSync(path.join(root, "ops", "systemd", "raising-game-demo-b.env.example"), "utf8");
const cutoverRunbook = fs.readFileSync(path.join(root, "ops", "production-cutover-runbook.md"), "utf8");
const cutoverVerifier = fs.readFileSync(path.join(root, "ops", "verify-production-cutover.py"), "utf8");
const upstreamSwitchScript = path.join(root, "ops", "nginx-upstream-switch.py");

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: root,
    env: { ...process.env, ...(options.env || {}) },
    encoding: "utf8",
  });
  assert.equal(result.status, 0, `${command} failed:\n${result.stdout}\n${result.stderr}`);
  return result.stdout;
}

async function withTempDir(fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "raising-game-resilience-"));
  try {
    return await fn(dir);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

function writeExecutable(file, body) {
  fs.writeFileSync(file, body, { mode: 0o755 });
}

function invokeUpstreamSwitch(args, env = {}) {
  const journalDir = fs.mkdtempSync(path.join(os.tmpdir(), "raising-game-switch-journal-"));
  const result = spawnSync("python3", [upstreamSwitchScript, ...args], {
    cwd: root,
    env: {
      ...process.env,
      NGINX_UPSTREAM_SWITCH_LOCK: path.join(os.tmpdir(), `raising-game-nginx-switch-${process.pid}.lock`),
      NGINX_UPSTREAM_SWITCH_JOURNAL_DIR: journalDir,
      ...env,
    },
    encoding: "utf8",
  });
  fs.rmSync(journalDir, { recursive: true, force: true });
  return result;
}

function writeUpstreamConfig(file, body = `upstream raising_game_app {
    server 127.0.0.1:4174;
    keepalive 64;
}
`) {
  fs.writeFileSync(file, body);
  return body;
}

async function withHealthServer(fn) {
  let healthy = true;
  const server = http.createServer((req, res) => {
    if (req.url !== "/api/livez") {
      res.writeHead(404, { "content-type": "text/plain" });
      res.end("not found\n");
      return;
    }
    if (healthy) {
      res.writeHead(200, { "content-type": "text/plain" });
      res.end("ready\n");
      return;
    }
    res.writeHead(503, { "content-type": "text/plain" });
    res.end("not ready\n");
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  try {
    return await fn({
      url: `http://127.0.0.1:${port}/api/livez`,
      fail: () => { healthy = false; },
      recover: () => { healthy = true; },
    });
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

function invokeWatchdog(env) {
  return spawnSync(path.join(root, "ops", "service-watchdog.sh"), [], {
    cwd: root,
    env: { ...process.env, ...env },
    encoding: "utf8",
  });
}

function invokeWatchdogAsync(env) {
  return new Promise((resolve) => {
    const child = spawn(path.join(root, "ops", "service-watchdog.sh"), [], {
      cwd: root,
      env: { ...process.env, ...env },
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8").on("data", (chunk) => { stdout += chunk; });
    child.stderr.setEncoding("utf8").on("data", (chunk) => { stderr += chunk; });
    child.on("close", (status, signal) => resolve({ status, signal, stdout, stderr }));
  });
}

test("resilience operations are included only in the platform release snapshot", () => {
  for (const file of [
    "baseline-metrics.js",
    "db-operational-stats.js",
    "ops/RESILIENCE-PLAN.md",
    "ops/RESILIENCE-DECISION-2026-11.md",
    "ops/REDIS-PLAN.md",
    "ops/REDIS-USAGE-MATRIX.md",
    "ops/multi-process-drill.sh",
    "ops/nginx-multi-upstream-drill.sh",
    "ops/nginx-upstream-switch.py",
    "ops/service-watchdog.sh",
    "ops/install-service-watchdog.sh",
    "ops/systemd/raising-game-watchdog.service",
    "ops/systemd/raising-game-watchdog.timer",
    "ops/secondary-watchdog.sh",
    "ops/install-secondary-watchdog.sh",
    "ops/systemd/raising-game-watchdog-b.service",
    "ops/systemd/raising-game-watchdog-b.timer",
    "ops/systemd/raising-game-demo-b.service",
    "ops/systemd/raising-game-demo-b.env.example",
    "ops/systemd-multi-instance-drill.sh",
    "ops/production-cutover-runbook.md",
    "ops/verify-production-cutover.py",
    "ops/verify-postgres-backup.sh",
    "ops/run-db-migrations.js",
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

test("watchdog installer defaults to dry-run and protects active/rollback paths", () => {
  assert.match(installScript, /WATCHDOG_INSTALL_MODE:-dry-run/);
  assert.match(installScript, /refusing to enable automatic restarts without --confirm-active/);
  assert.match(installScript, /Environment=WATCHDOG_DRY_RUN=1/);
  assert.match(installScript, /disable --now "\$TIMER_NAME"/);
  assert.match(installScript, /application service was not touched/);
  assert.match(watchdogScript, /dry-run would restart service=/);
  assert.match(watchdogScript, /printf '0\\n' > "\$STATE_FILE"/);
});

test("watchdog requires consecutive failures, re-arms dry-run, and resets after recovery", async () => {
  await withTempDir(async (dir) => {
    await withHealthServer(async (health) => {
      const state = path.join(dir, "failures");
      const baseEnv = {
        HEALTH_URL: health.url,
        STATE_FILE: state,
        LOCK_FILE: path.join(dir, "lock"),
        RESTART_STATE_FILE: path.join(dir, "restarts"),
        RESTART_PENDING_FILE: path.join(dir, "restart.pending"),
        FAILURE_THRESHOLD: "3",
        WATCHDOG_DRY_RUN: "1",
        RESTART_COMMAND: `printf restart >> ${path.join(dir, "restart")}`,
      };

      health.fail();
      let result = await invokeWatchdogAsync(baseEnv);
      assert.equal(result.status, 0, result.stderr);
      assert.equal(fs.readFileSync(state, "utf8").trim(), "1");
      assert.equal(fs.existsSync(path.join(dir, "restart")), false);

      result = await invokeWatchdogAsync(baseEnv);
      assert.equal(result.status, 0, result.stderr);
      assert.equal(fs.readFileSync(state, "utf8").trim(), "2");

      result = await invokeWatchdogAsync(baseEnv);
      assert.equal(result.status, 0, result.stderr);
      assert.match(result.stderr, /dry-run would restart/);
      assert.equal(fs.readFileSync(state, "utf8").trim(), "0");
      assert.equal(fs.existsSync(path.join(dir, "restart")), false);

      result = await invokeWatchdogAsync(baseEnv);
      assert.equal(result.status, 0, result.stderr);
      assert.equal(fs.readFileSync(state, "utf8").trim(), "1");

      fs.writeFileSync(state, "2\n");
      health.recover();
      result = await invokeWatchdogAsync(baseEnv);
      assert.equal(result.status, 0, result.stderr);
      assert.match(result.stderr, /recovered/);
      assert.equal(fs.readFileSync(state, "utf8").trim(), "0");
    });
  });
});

test("watchdog restarts exactly once at threshold and skips inactive services", async () => {
  await withTempDir(async (dir) => {
    await withHealthServer(async (health) => {
      const state = path.join(dir, "failures");
      const restart = path.join(dir, "restart");
      const env = {
        HEALTH_URL: health.url,
        STATE_FILE: state,
        LOCK_FILE: path.join(dir, "lock"),
        RESTART_STATE_FILE: path.join(dir, "restarts"),
        RESTART_PENDING_FILE: path.join(dir, "restart.pending"),
        FAILURE_THRESHOLD: "2",
        WATCHDOG_DRY_RUN: "0",
        RESTART_COMMAND: `printf restart >> ${restart}`,
      };

      health.fail();
      assert.equal((await invokeWatchdogAsync(env)).status, 0);
      assert.equal(fs.existsSync(restart), false);
      assert.equal((await invokeWatchdogAsync(env)).status, 0);
      assert.equal(fs.readFileSync(restart, "utf8"), "restart");
      assert.equal(fs.readFileSync(state, "utf8").trim(), "0");
      assert.equal(fs.readFileSync(env.RESTART_STATE_FILE, "utf8").trim().split("\n").length, 1);
      assert.equal(fs.existsSync(env.RESTART_PENDING_FILE), true);

      assert.equal((await invokeWatchdogAsync(env)).status, 0);
      const cooldown = await invokeWatchdogAsync(env);
      assert.equal(cooldown.status, 0, cooldown.stderr);
      assert.match(cooldown.stderr, /restart suppressed reason=cooldown/);
      assert.equal(fs.readFileSync(restart, "utf8"), "restart");

      const bin = path.join(dir, "bin");
      fs.mkdirSync(bin);
      writeExecutable(path.join(bin, "systemctl"), "#!/usr/bin/env bash\n[[ \"$1\" == is-active ]] && exit 3\nexit 0\n");
      const skippedState = path.join(dir, "inactive-failures");
      const skipped = await invokeWatchdogAsync({
        ...env,
        PATH: `${bin}:${process.env.PATH}`,
        SERVICE_CHECK_ACTIVE: "1",
        SERVICE: "raising-game-demo",
        STATE_FILE: skippedState,
      });
      assert.equal(skipped.status, 0, skipped.stderr);
      assert.match(skipped.stderr, /service is not active/);
      assert.equal(fs.existsSync(skippedState), false);
    });
  });
});

test("watchdog bounds restart attempts and blocks a tight failure loop", async () => {
  await withTempDir(async (dir) => {
    await withHealthServer(async (health) => {
      const state = path.join(dir, "failures");
      const restarts = path.join(dir, "restarts");
      const restart = path.join(dir, "restart");
      const env = {
        HEALTH_URL: health.url,
        STATE_FILE: state,
        LOCK_FILE: path.join(dir, "lock"),
        RESTART_STATE_FILE: restarts,
        RESTART_PENDING_FILE: path.join(dir, "restart.pending"),
        FAILURE_THRESHOLD: "1",
        WATCHDOG_DRY_RUN: "0",
        RESTART_COOLDOWN_SECONDS: "3600",
        RESTART_MAX_PER_HOUR: "2",
        RESTART_COMMAND: `printf restart >> ${restart}`,
      };
      health.fail();
      let result = await invokeWatchdogAsync(env);
      assert.equal(result.status, 0, result.stderr);
      assert.match(result.stderr, /restart queued/);
      assert.equal(fs.readFileSync(restart, "utf8"), "restart");

      result = await invokeWatchdogAsync(env);
      assert.equal(result.status, 0, result.stderr);
      assert.match(result.stderr, /restart suppressed reason=cooldown/);
      assert.equal(fs.readFileSync(restart, "utf8"), "restart");

      fs.writeFileSync(restarts, `${Math.floor(Date.now() / 1000)}\n${Math.floor(Date.now() / 1000)}\n`);
      result = await invokeWatchdogAsync(env);
      assert.equal(result.status, 0, result.stderr);
      assert.match(result.stderr, /restart suppressed reason=hourly_limit/);
      assert.equal(fs.readFileSync(restart, "utf8"), "restart");
    });
  });
});

test("watchdog records dispatch failure and backs off instead of retrying every tick", async () => {
  await withTempDir(async (dir) => {
    await withHealthServer(async (health) => {
      const state = path.join(dir, "failures");
      const restarts = path.join(dir, "restarts");
      const env = {
        HEALTH_URL: health.url,
        STATE_FILE: state,
        LOCK_FILE: path.join(dir, "lock"),
        RESTART_STATE_FILE: restarts,
        RESTART_PENDING_FILE: path.join(dir, "restart.pending"),
        FAILURE_THRESHOLD: "1",
        WATCHDOG_DRY_RUN: "0",
        RESTART_COOLDOWN_SECONDS: "3600",
        RESTART_MAX_PER_HOUR: "3",
        RESTART_COMMAND: "exit 7",
      };
      health.fail();
      let result = await invokeWatchdogAsync(env);
      assert.notEqual(result.status, 0);
      assert.match(result.stderr, /restart dispatch failed/);
      assert.equal(fs.existsSync(restarts), true);
      assert.equal(fs.readFileSync(state, "utf8").trim(), "0");

      result = await invokeWatchdogAsync(env);
      assert.equal(result.status, 0, result.stderr);
      assert.match(result.stderr, /restart suppressed reason=cooldown/);
    });
  });
});

test("watchdog warm-up grace avoids checking health immediately after a restart", async () => {
  await withTempDir(async (dir) => {
    await withHealthServer(async (health) => {
      const bin = path.join(dir, "bin");
      fs.mkdirSync(bin);
      const fakeSystemctl = path.join(bin, "systemctl");
      writeExecutable(fakeSystemctl, `#!/usr/bin/env bash
if [[ "$1" == is-active ]]; then exit 0; fi
if [[ "$1" == show ]]; then printf '10000000\n'; exit 0; fi
exit 0
`);
      const uptime = path.join(dir, "uptime");
      fs.writeFileSync(uptime, "20.00 30.00\n");
      health.fail();
      const result = await invokeWatchdogAsync({
        PATH: `${bin}:${process.env.PATH}`,
        HEALTH_URL: health.url,
        STATE_FILE: path.join(dir, "failures"),
        LOCK_FILE: path.join(dir, "lock"),
        RESTART_STATE_FILE: path.join(dir, "restarts"),
        RESTART_PENDING_FILE: path.join(dir, "restart.pending"),
        UPTIME_FILE: uptime,
        SERVICE_CHECK_ACTIVE: "1",
        SERVICE: "raising-game-demo",
        WARMUP_SECONDS: "45",
        WATCHDOG_DRY_RUN: "0",
      });
      assert.equal(result.status, 0, result.stderr);
      assert.match(result.stderr, /service warm-up grace/);
      assert.equal(fs.readFileSync(path.join(dir, "failures"), "utf8").trim(), "0");
    });
  });
});

test("secondary watchdog observes 4175 in dry-run and never shares primary state", () => {
  assert.match(secondaryWatchdogScript, /127\.0\.0\.1:4175\/api\/livez/);
  assert.match(secondaryWatchdogScript, /raising-game-demo-b\.service/);
  assert.match(secondaryWatchdogScript, /WATCHDOG_DRY_RUN:-1/);
  assert.match(secondaryWatchdogScript, /raising-game-watchdog-b\.failures/);
  assert.match(secondaryWatchdogScript, /raising-game-watchdog-b\.lock/);
  assert.match(secondaryWatchdogScript, /raising-game-watchdog-b\.restarts/);
  assert.match(secondaryWatchdogScript, /raising-game-watchdog-b\.restart\.pending/);
  assert.doesNotMatch(secondaryWatchdogScript, /4174|raising-game-demo\.service|raising-game-watchdog\.failures/);
  assert.match(secondaryWatchdogService, /Environment=HEALTH_URL=http:\/\/127\.0\.0\.1:4175\/api\/livez/);
  assert.match(secondaryWatchdogService, /Environment=SERVICE=raising-game-demo-b\.service/);
  assert.match(secondaryWatchdogService, /Environment=SERVICE_CHECK_ACTIVE=1/);
  assert.match(secondaryWatchdogService, /Environment=FAILURE_THRESHOLD=3/);
  assert.match(secondaryWatchdogService, /secondary-watchdog\.sh/);
  assert.doesNotMatch(secondaryWatchdogService, /4174|raising-game-demo\.service|raising-game-watchdog\.failures/);
  assert.match(secondaryWatchdogTimer, /OnUnitActiveSec=10s/);
  assert.match(secondaryWatchdogTimer, /Unit=raising-game-watchdog-b\.service/);
  assert.match(secondaryWatchdogInstaller, /Environment=WATCHDOG_DRY_RUN=/);
  assert.match(secondaryWatchdogInstaller, /WATCHDOG_DRY_RUN=1/);
  assert.match(secondaryWatchdogInstaller, /never operates on the primary raising-game-watchdog units/);
  assert.match(secondaryWatchdogInstaller, /primary and secondary application services were not touched/);
  assert.doesNotMatch(secondaryWatchdogInstaller, /service=raising-game-demo\b/);
});

test("secondary watchdog dry-run reports 4175 failures without restarting it", async () => {
  await withTempDir(async (dir) => {
    await withHealthServer(async (health) => {
      health.fail();
      const env = {
        HEALTH_URL: health.url,
        STATE_FILE: path.join(dir, "failures"),
        LOCK_FILE: path.join(dir, "lock"),
        RESTART_STATE_FILE: path.join(dir, "restarts"),
        RESTART_PENDING_FILE: path.join(dir, "restart.pending"),
        FAILURE_THRESHOLD: "1",
        WATCHDOG_DRY_RUN: "1",
        RESTART_COMMAND: `printf restart >> ${path.join(dir, "restart")}`,
        SERVICE_CHECK_ACTIVE: "0",
      };
      const result = spawnSync(path.join(root, "ops", "secondary-watchdog.sh"), [], {
        cwd: root,
        env: { ...process.env, ...env },
        encoding: "utf8",
      });
      assert.equal(result.status, 0, result.stderr);
      assert.match(result.stderr, /dry-run would restart service=raising-game-demo-b\.service/);
      assert.equal(fs.existsSync(path.join(dir, "restart")), false);
      assert.equal(fs.readFileSync(path.join(dir, "failures"), "utf8").trim(), "0");
    });
  });
});

test("watchdog installer dry-run/active/rollback modes are isolated", () => {
  withTempDir((dir) => {
    const unitDir = path.join(dir, "units");
    const log = path.join(dir, "systemctl.log");
    const fakeSystemctl = path.join(dir, "systemctl");
    writeExecutable(fakeSystemctl, `#!/usr/bin/env bash
printf '%s\n' "$*" >> ${JSON.stringify(log)}
exit 0
`);
    const common = {
      PATH: `${dir}:${process.env.PATH}`,
      SYSTEMD_UNIT_DIR: unitDir,
      SYSTEMCTL_BIN: fakeSystemctl,
      WATCHDOG_INSTALL_TEST_MODE: "1",
      WATCHDOG_START_NOW: "0",
    };
    const script = path.join(root, "ops", "install-service-watchdog.sh");
    let result = spawnSync(script, ["--mode", "dry-run"], { cwd: root, env: { ...process.env, ...common }, encoding: "utf8" });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(fs.existsSync(path.join(unitDir, "raising-game-watchdog.service")), true);
    assert.equal(fs.existsSync(path.join(unitDir, "raising-game-watchdog.timer")), true);
    assert.equal(fs.existsSync(path.join(unitDir, "raising-game-watchdog.service.d", "50-dry-run.conf")), true);
    assert.match(fs.readFileSync(log, "utf8"), /enable raising-game-watchdog\.timer/);

    result = spawnSync(script, ["--mode", "active"], { cwd: root, env: { ...process.env, ...common }, encoding: "utf8" });
    assert.notEqual(result.status, 0);
    assert.match(`${result.stdout}${result.stderr}`, /without --confirm-active/);

    result = spawnSync(script, ["--mode", "active", "--confirm-active"], { cwd: root, env: { ...process.env, ...common }, encoding: "utf8" });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(fs.existsSync(path.join(unitDir, "raising-game-watchdog.service.d")), false);

    result = spawnSync(script, ["--mode", "rollback"], { cwd: root, env: { ...process.env, ...common }, encoding: "utf8" });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(fs.existsSync(path.join(unitDir, "raising-game-watchdog.service")), false);
    assert.equal(fs.existsSync(path.join(unitDir, "raising-game-watchdog.timer")), false);
    assert.doesNotMatch(fs.readFileSync(log, "utf8"), /restart raising-game-demo/);
  });
});

test("secondary watchdog installer modes are isolated from primary units", () => {
  withTempDir((dir) => {
    const unitDir = path.join(dir, "units");
    const log = path.join(dir, "systemctl.log");
    const fakeSystemctl = path.join(dir, "systemctl");
    writeExecutable(fakeSystemctl, `#!/usr/bin/env bash
printf '%s\n' "$*" >> ${JSON.stringify(log)}
exit 0
`);
    const common = {
      PATH: `${dir}:${process.env.PATH}`,
      SYSTEMD_UNIT_DIR: unitDir,
      SYSTEMCTL_BIN: fakeSystemctl,
      SECONDARY_WATCHDOG_INSTALL_TEST_MODE: "1",
      SECONDARY_WATCHDOG_START_NOW: "0",
    };
    const script = path.join(root, "ops", "install-secondary-watchdog.sh");
    let result = spawnSync(script, ["--mode", "dry-run"], { cwd: root, env: { ...process.env, ...common }, encoding: "utf8" });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(fs.existsSync(path.join(unitDir, "raising-game-watchdog-b.service")), true);
    assert.equal(fs.existsSync(path.join(unitDir, "raising-game-watchdog-b.timer")), true);
    const dropin = path.join(unitDir, "raising-game-watchdog-b.service.d", "90-mode.conf");
    assert.match(fs.readFileSync(dropin, "utf8"), /WATCHDOG_DRY_RUN=1/);

    result = spawnSync(script, ["--mode", "active"], { cwd: root, env: { ...process.env, ...common }, encoding: "utf8" });
    assert.notEqual(result.status, 0);
    assert.match(`${result.stdout}${result.stderr}`, /without --confirm-active/);

    result = spawnSync(script, ["--mode", "active", "--confirm-active"], { cwd: root, env: { ...process.env, ...common }, encoding: "utf8" });
    assert.equal(result.status, 0, result.stderr);
    assert.match(fs.readFileSync(dropin, "utf8"), /WATCHDOG_DRY_RUN=0/);

    result = spawnSync(script, ["--mode", "rollback"], { cwd: root, env: { ...process.env, ...common }, encoding: "utf8" });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(fs.existsSync(path.join(unitDir, "raising-game-watchdog-b.service")), false);
    assert.equal(fs.existsSync(path.join(unitDir, "raising-game-watchdog-b.timer")), false);
    const commands = fs.readFileSync(log, "utf8");
    assert.doesNotMatch(commands, /raising-game-watchdog\.(service|timer)/);
    assert.doesNotMatch(commands, /restart raising-game-demo/);
  });
});

test("resilience plan makes Redis conditional and subordinate to PostgreSQL authority", () => {
  assert.match(plan, /target architecture is defined independently of today's implementation/i);
  assert.match(plan, /PostgreSQL remains the authoritative durable store/i);
  assert.match(plan, /Redis is used only where shared, short-lived state or cache materially improves/i);
  assert.match(plan, /P3\.5 - Redis shared-state and cache track \(conditional, default off\)/);
  assert.match(plan, /Redis loss must cause cache misses or controlled\s+fallback, never startup failure/i);
  assert.match(plan, /complete the relevant P3\.5 gates/i);
  assert.match(redisPlan, /detailed execution track for P3\.5/i);
  assert.match(redisPlan, /Do not introduce Redis as a second source of truth/i);
  assert.match(redisPlan, /`REDIS_ENABLED`/);
  assert.match(plan, /zero duplicate charges\/provider\s+submissions/i);
  assert.match(redisPlan, /same-host Redis does not increase\s+host-level/i);
});

test("resilience decision requires measured evidence before topology promotion", () => {
  assert.match(resilienceDecision, /Do not treat "more Node processes on the same host" as the resilience goal/i);
  assert.match(resilienceDecision, /A measured baseline period exists; no promotion is approved from plan review alone/i);
  assert.match(resilienceDecision, /Nginx removes an unhealthy upstream before replacement/i);
  assert.match(resilienceDecision, /A duplicate request across different ports produces one charge and one provider submission/i);
  assert.match(resilienceDecision, /SIGKILL of one process does not duplicate a generation charge/i);
  assert.match(resilienceDecision, /Redis is not a prerequisite for the first two Node processes/i);
  assert.match(resilienceDecision, /same-host Redis does not provide host-loss\s+resilience/i);
});

test("Redis usage matrix separates cache roles from authoritative financial and security facts", () => {
  assert.match(redisUsageMatrix, /Redis remains disabled until a measured\s+need/i);
  assert.match(redisUsageMatrix, /Keep in PostgreSQL\?/);
  assert.match(redisUsageMatrix, /Users, sessions, balances, ledger, orders \| Yes, authoritative \| None/i);
  assert.match(redisUsageMatrix, /Webhook claims \| Yes, authoritative \| No/i);
  assert.match(redisUsageMatrix, /Media bytes \| No \| No/i);
  assert.match(redisUsageMatrix, /Redis timeout\/restart\/eviction must degrade to PostgreSQL or a cache miss/i);
  assert.match(redisUsageMatrix, /Do not use Redis advisory locks for scheduler ownership/i);
});

test("resilience plan does not promise multi-process or RPO before verification", () => {
  assert.match(plan, /Do not run multiple copies of `server\.js` yet/);
  assert.match(plan, /per-tick PostgreSQL advisory leases/);
  assert.match(plan, /Do not treat\s+this alone as permission to run multiple `server\.js` processes/);
  assert.match(plan, /current daily-only backup does not meet the RPO target/i);
  assert.match(plan, /off-host backup independent of both production hosts/);
});

test("multi-process drill reconciles a restored disposable schema before starting app processes", () => {
  const confirmation = multiProcessDrill.indexOf("DRILL_CONFIRM_DISPOSABLE_DATABASE");
  const firstDryRun = multiProcessDrill.indexOf("run-db-migrations.js --dry-run");
  const apply = multiProcessDrill.indexOf("run-db-migrations.js --apply");
  const readyDryRun = multiProcessDrill.indexOf("migrations-ready.log");
  const start = multiProcessDrill.indexOf("start_app() {");
  const cdAppRoot = multiProcessDrill.indexOf('cd "$APP_ROOT"');
  assert.ok(confirmation >= 0 && cdAppRoot > confirmation && firstDryRun > cdAppRoot && apply > firstDryRun && readyDryRun > apply && start > readyDryRun);
  assert.match(multiProcessDrill, /grep -q '\^pending=0\$'/);
  assert.match(multiProcessDrill, /ALTER TABLE %s OWNER TO raising_game_app/);
  assert.match(multiProcessDrill, /ALTER SEQUENCE %s OWNER TO raising_game_app/);
  assert.match(multiProcessDrill, /d\.deptype IN \('a', 'i'\)/);
  assert.match(multiProcessDrill, /GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO raising_game_app;\nSQL\n/);
  assert.match(multiProcessDrill, /DRILL_DB must be restored from a populated disposable snapshot/);
  assert.match(multiProcessDrill, /catalog = 'ourdream_presets'/);
  assert.match(multiProcessDrill, /catalog = 'chat_live_voices' AND scope = 'realtime'/);
  assert.match(multiProcessDrill, /DRILL_CATALOG_PROBE_OK/);
  assert.match(multiProcessDrill, /PROBE_REQUESTS/);
  assert.match(multiProcessDrill, /kill -KILL "\$http_b"/);
  assert.match(multiProcessDrill, /SURVIVOR_PROBE_OK requests=.*failures=0/);
  assert.match(multiProcessDrill, /SIGKILL_PEER_SURVIVED=1/);
  assert.match(multiProcessDrill, /wait_exit "\$http_a"/);
  assert.match(multiProcessDrill, /sigkill_failover=1/);
  assert.ok(multiProcessDrill.indexOf("kill -KILL \"$http_b\"") < multiProcessDrill.indexOf("SIGKILL_PEER_SURVIVED=1"));
  assert.ok(multiProcessDrill.indexOf("SIGKILL_PEER_SURVIVED=1") < multiProcessDrill.indexOf("kill -TERM \"$http_a\""));
  assert.ok(multiProcessDrill.indexOf("DRILL_CATALOG_PROBE_OK") < multiProcessDrill.indexOf("start_app() {"));
});

test("Nginx multi-upstream drill isolates ports, database, and provider side effects", () => {
  assert.match(nginxDrill, /raising_game_nginx_drill_\[0-9\]\{14\}/);
  assert.match(nginxDrill, /DRILL_CONFIRM_DISPOSABLE_DATABASE/);
  assert.match(nginxDrill, /DRILL_DB must be restored from a populated disposable snapshot/);
  assert.match(nginxDrill, /catalog = 'ourdream_presets'/);
  assert.match(nginxDrill, /catalog = 'chat_live_voices' AND scope = 'realtime'/);
  assert.match(nginxDrill, /DRILL_CATALOG_PROBE_OK/);
  assert.match(nginxDrill, /DRILL_APP_ROLE_READY=\$DRILL_APP_ROLE/);
  assert.match(nginxDrill, /ALTER TABLE %s OWNER TO \$DRILL_APP_ROLE/);
  assert.match(nginxDrill, /ALTER SEQUENCE %s OWNER TO \$DRILL_APP_ROLE/);
  assert.match(nginxDrill, /d\.deptype IN \('a', 'i'\)/);
  assert.match(nginxDrill, /catalog_error=.*catalog-probe\.stderr/);
  assert.match(nginxDrill, /cat "\$catalog_error" >&2/);
  assert.match(nginxDrill, /schema_error=.*schema-privilege-probe\.stderr/);
  assert.match(nginxDrill, /has_schema_privilege\(current_user, 'public', 'USAGE'\)/);
  assert.match(nginxDrill, /DRILL_SCHEMA_PRIVILEGES_OK=1/);
  assert.match(nginxDrill, /The production port 4174 must not be used/);
  assert.match(nginxDrill, /BACKGROUND_SCHEDULERS_ENABLED=0 GENERATION_SUBMIT_WORKER_ENABLED=0/);
  assert.match(nginxDrill, /max_fails=1 fail_timeout=2s/);
  assert.match(nginxDrill, /proxy_next_upstream error timeout http_502 http_503 http_504/);
  assert.match(nginxDrill, /PEER_DRAIN_SURVIVED=1/);
  assert.match(nginxDrill, /ROLLING_REPLACEMENT_OK=1/);
  assert.match(nginxDrill, /PROBE_REQUESTS/);
  assert.match(nginxDrill, /EDGE_SIGKILL_PROBE_OK requests=.*failures=0/);
  assert.match(nginxDrill, /SIGKILL_FAILOVER_OK=1/);
  assert.match(nginxDrill, /server 127\.0\.0\.1:\$PORT_B backup;/);
  assert.match(nginxDrill, /EDGE_BACKUP_FAILOVER_PROBE_OK requests=.*failures=0/);
  assert.match(nginxDrill, /AUTOMATIC_BACKUP_FAILOVER_OK=1/);
  assert.match(nginxDrill, /AUTOMATIC_BACKUP_STOP_TAKEOVER_OK=1/);
  assert.match(nginxDrill, /PRIMARY_RECOVERY_WITHOUT_BACKUP_OK=1/);
  assert.match(nginxDrill, /BACKUP_RESTORED_OK=1/);
  assert.match(nginxDrill, /NGINX_MULTI_UPSTREAM_DRILL_OK/);
  assert.match(nginxDrill, /UPSTREAM_SWITCH_BEFORE_DRAIN_OK=1/);
  assert.match(nginxDrill, /UPSTREAM_SWITCH_ROLLBACK_OK=1/);
  assert.match(nginxDrill, /UPSTREAM_TRANSACTION_SWITCH_OK=1/);
  assert.match(nginxDrill, /UPSTREAM_TRANSACTION_ROLLBACK_OK=1/);
  assert.match(nginxDrill, /--upstream raising_game_switch_drill/);
  assert.match(nginxDrill, /--switch "raising_game_txn_app=\$source_port:\$control_port"/);
  assert.match(nginxDrill, /Transaction preflight failed before config switch/);
  assert.match(nginxDrill, /--health-url "http:\/\/127\.0\.0\.1:\$EDGE_PORT\/txn-chat\/health"/);
  assert.match(nginxDrill, /--health-url "http:\/\/127\.0\.0\.1:\$EDGE_PORT\/txn-chat\/definitely-not-healthy"/);
  assert.match(nginxDrill, /UPSTREAM_SWITCH_COMMIT_OK upstreams=3\( files=1\)\? health_urls=3/);
  assert.match(nginxDrill, /NGINX_DRILL_CLEANUP_OK=1/);
  assert.match(nginxDrill, /NGINX_DRILL_FAILURE_LOGS_RETAINED/);
  assert.match(nginxDrill, /NGINX_DRILL_FAILED line=\$LINENO command=\$BASH_COMMAND/);
  assert.match(nginxDrill, /Rolling replacement died during transaction switch/);
  assert.match(nginxDrill, /old_txn_pid="\$source_pid"/);
  assert.doesNotMatch(nginxDrill, /NGINX_DRILL_CLEANUP db=/);
  assert.match(multiProcessDrill, /MULTI_PROCESS_DRILL_CLEANUP_OK=1/);
  assert.doesNotMatch(multiProcessDrill, /MULTI_PROCESS_DRILL_CLEANUP db=/);
  assert.match(nginxDrill, /--nginx-test-command/);
  assert.match(nginxDrill, /upstream raising_game_switch_drill \{\n    server 127\.0\.0\.1:\$PORT_A;\n    keepalive 16;\n  \}/);
  assert.ok(nginxDrill.indexOf('server 127.0.0.1:$PORT_B max_fails=1 fail_timeout=2s;') < nginxDrill.indexOf('upstream raising_game_switch_drill'));
  const edgeProbeStart = nginxDrill.indexOf('probe_log="$logs/edge-sigkill-probe.log"');
  const edgeKill = nginxDrill.indexOf('kill -KILL "$killed_pid"');
  const edgeProbeWait = nginxDrill.indexOf('grep -qx "EDGE_SIGKILL_PROBE_OK requests=$PROBE_REQUESTS failures=0"');
  assert.ok(edgeProbeStart >= 0 && edgeKill > edgeProbeStart && edgeProbeWait > edgeKill);
  const catalogProbe = nginxDrill.indexOf("catalog_probe=");
  const schemaProbe = nginxDrill.indexOf("schema_privileges=");
  const firstMigration = nginxDrill.indexOf("run-db-migrations.js --dry-run");
  const nginxStart = nginxDrill.indexOf('"$NGINX_BIN" -p "$nginx_prefix"');
  const appStart = nginxDrill.indexOf('http_a="$(start_app');
  assert.ok(catalogProbe >= 0 && schemaProbe > catalogProbe && firstMigration > schemaProbe && nginxStart > firstMigration && appStart > nginxStart);
});

test("systemd multi-instance drill isolates production and verifies restart and cleanup", () => {
  assert.match(systemdMultiInstanceDrill, /raising_game_systemd_drill_/);
  assert.match(systemdMultiInstanceDrill, /The production port 4174 must not be used for this drill/);
  assert.match(systemdMultiInstanceDrill, /DRILL_CONFIRM_DISPOSABLE_DATABASE=1/);
  assert.match(systemdMultiInstanceDrill, /BACKGROUND_SCHEDULERS_ENABLED=0/);
  assert.match(systemdMultiInstanceDrill, /GENERATION_SUBMIT_WORKER_ENABLED=0/);
  assert.match(systemdMultiInstanceDrill, /systemd-run --unit="\$unit"/);
  assert.match(systemdMultiInstanceDrill, /Restart=always/);
  assert.match(systemdMultiInstanceDrill, /TimeoutStopSec=300/);
  assert.match(systemdMultiInstanceDrill, /kill -KILL "\$pid_a"/);
  assert.match(systemdMultiInstanceDrill, /SYSTEMD_AUTO_RESTART_OK/);
  assert.match(systemdMultiInstanceDrill, /SYSTEMD_SINGLE_STOP_ISOLATED=1/);
  assert.match(systemdMultiInstanceDrill, /SYSTEMD_RESTART_ISOLATED=1/);
  assert.match(systemdMultiInstanceDrill, /SYSTEMD_MULTI_INSTANCE_DRILL_OK/);
  assert.match(systemdMultiInstanceDrill, /SYSTEMD_DRILL_CLEANUP_OK=1/);
  assert.match(systemdMultiInstanceDrill, /APP_ROOT="\$\{APP_ROOT:-\/opt\/raising-game-systemd-drill-src\}"/);
  assert.match(systemdMultiInstanceDrill, /APP_ROOT must not be under \/tmp because the drill units use PrivateTmp=yes/);
  assert.doesNotMatch(systemdMultiInstanceDrill, /systemctl (restart|stop) raising-game-demo/);
  assert.doesNotMatch(systemdMultiInstanceDrill, /PORT=(4174)/);
  const migration = systemdMultiInstanceDrill.indexOf("run-db-migrations.js --dry-run");
  const unitStart = systemdMultiInstanceDrill.indexOf('start_unit "$UNIT_A"');
  const cleanup = systemdMultiInstanceDrill.indexOf("cleanup() {");
  assert.ok(cleanup >= 0 && migration > cleanup && unitStart > migration);
});

test("Nginx upstream switch dry-run is narrow and preserves unrelated directives", () => {
  withTempDir((dir) => {
    const file = path.join(dir, "site.conf");
    const original = writeUpstreamConfig(file, `upstream raising_game_app {
    server 127.0.0.1:4174;
    keepalive 64;
}
upstream raising_game_app_chat {
    server 127.0.0.1:4174;
}
`);
    const result = invokeUpstreamSwitch([
      "--file", file,
      "--upstream", "raising_game_app",
      "--current-port", "4174",
      "--next-port", "4183",
      "--health-url", "http://127.0.0.1:48080/api/livez",
    ]);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /UPSTREAM_SWITCH_PLAN upstream=raising_game_app from=4174 to=4183/);
    assert.equal(fs.readFileSync(file, "utf8"), original);
  });
});

test("Nginx upstream switch atomically swaps an existing primary and backup", () => {
  withTempDir((dir) => {
    const file = path.join(dir, "site.conf");
    const original = writeUpstreamConfig(file, `upstream raising_game_app {
    server 127.0.0.1:4174;
    server 127.0.0.1:4175 backup;
    keepalive 64;
}
upstream raising_game_app_chat { server 127.0.0.1:4174; server 127.0.0.1:4175 backup; keepalive 32; }
`);
    const args = [
      "--file", file,
      "--switch", "raising_game_app=4174:4175",
      "--switch", "raising_game_app_chat=4174:4175",
      "--health-url", "http://127.0.0.1:48080/api/health",
      "--nginx-bin", "/usr/bin/true",
      "--nginx-test-command", "/usr/bin/true",
      "--reload-command", "/usr/bin/true",
      "--apply",
    ];
    const curl = path.join(dir, "curl");
    writeExecutable(curl, "#!/usr/bin/env bash\nprintf '200'\n");
    const switchEnv = { PATH: `${dir}:${process.env.PATH}` };
    let result = invokeUpstreamSwitch(args, switchEnv);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /UPSTREAM_SWITCH_PLAN upstream=raising_game_app from=4174 to=4175/);
    const promoted = fs.readFileSync(file, "utf8");
    assert.match(promoted, /server 127\.0\.0\.1:4175;\n\s+server 127\.0\.0\.1:4174 backup;/);
    assert.match(promoted, /keepalive 64;/);
    assert.match(promoted, /upstream raising_game_app_chat \{ server 127\.0\.0\.1:4175; server 127\.0\.0\.1:4174 backup; keepalive 32; \}/);

    result = invokeUpstreamSwitch(args, switchEnv);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(fs.readFileSync(file, "utf8"), promoted);

    result = invokeUpstreamSwitch([
      "--file", file,
      "--switch", "raising_game_app=4175:4174",
      "--switch", "raising_game_app_chat=4175:4174",
      "--health-url", "http://127.0.0.1:48080/api/health",
      "--nginx-bin", "/usr/bin/true",
      "--nginx-test-command", "/usr/bin/true",
      "--reload-command", "/usr/bin/true",
      "--apply",
    ], switchEnv);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(fs.readFileSync(file, "utf8"), original);
  });
});

test("Nginx upstream switch rolls back an existing primary and backup on health failure", async () => {
  await withTempDir(async (dir) => {
    const file = path.join(dir, "site.conf");
    const original = writeUpstreamConfig(file, `upstream raising_game_app {
    server 127.0.0.1:4174;
    server 127.0.0.1:4175 backup;
}
`);
    await withHealthServer(async (health) => {
      health.fail();
      const result = invokeUpstreamSwitch([
        "--file", file,
        "--switch", "raising_game_app=4174:4175",
        "--health-url", health.url,
        "--nginx-bin", "/usr/bin/true",
        "--nginx-test-command", "/usr/bin/true",
        "--reload-command", "/usr/bin/true",
        "--apply",
      ]);
      assert.notEqual(result.status, 0);
      assert.match(result.stdout, /UPSTREAM_SWITCH_ROLLBACK/);
      assert.equal(fs.readFileSync(file, "utf8"), original);
    });
  });
});

test("Nginx upstream backup transaction is idempotent and preserves primary plus keepalive", () => {
  withTempDir((dir) => {
    const file = path.join(dir, "site.conf");
    const curl = path.join(dir, "curl");
    writeExecutable(curl, `#!/usr/bin/env bash\nprintf '200'\n`);
    const original = writeUpstreamConfig(file, `upstream raising_game_app {
    server 127.0.0.1:4175;
    keepalive 64;
}
upstream raising_game_app_chat { server 127.0.0.1:4175; keepalive 32; }
`);
    const args = [
      "--file", file,
      "--backup", "raising_game_app=4175:4174",
      "--backup", "raising_game_app_chat=4175:4174",
      "--health-url", "http://127.0.0.1:48080/api/health",
      "--nginx-bin", "/usr/bin/true",
      "--reload-command", "/usr/bin/true",
      "--apply",
    ];
    let result = invokeUpstreamSwitch(args, { PATH: `${dir}:${process.env.PATH}` });
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /UPSTREAM_BACKUP_PLAN upstream=raising_game_app primary=4175 backup=4174/);
    const updated = fs.readFileSync(file, "utf8");
    assert.match(updated, /server 127\.0\.0\.1:4175;\n\s+server 127\.0\.0\.1:4174 backup;/);
    assert.match(updated, /keepalive 64;/);
    assert.match(updated, /upstream raising_game_app_chat \{ server 127\.0\.0\.1:4175;\n\s+server 127\.0\.0\.1:4174 backup; keepalive 32; \}/);
    assert.notEqual(original, updated);

    result = invokeUpstreamSwitch(args, { PATH: `${dir}:${process.env.PATH}` });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(fs.readFileSync(file, "utf8"), updated);
  });
});

test("Nginx upstream recovery ignores journals for unrelated files", () => {
  withTempDir((dir) => {
    const file = path.join(dir, "site.conf");
    const journalDir = path.join(dir, "journals");
    fs.mkdirSync(journalDir);
    const original = writeUpstreamConfig(file);
    fs.writeFileSync(path.join(journalDir, "raising-game-nginx-switch-unrelated.json"), JSON.stringify({
      files: [{ path: path.join(dir, "missing.conf"), original: "stale", mode: 0o644 }],
    }));
    const result = invokeUpstreamSwitch([
      "--file", file,
      "--backup", "raising_game_app=4174:4175",
      "--health-url", "http://127.0.0.1:48080/api/health",
    ], { NGINX_UPSTREAM_SWITCH_JOURNAL_DIR: journalDir });
    assert.equal(result.status, 0, result.stderr);
    assert.doesNotMatch(result.stderr, /UPSTREAM_SWITCH_RECOVERY_FAILED/);
    assert.equal(fs.readFileSync(file, "utf8"), original);
    assert.ok(fs.existsSync(path.join(journalDir, "raising-game-nginx-switch-unrelated.json")));
  });
});

test("Nginx upstream recovery restores a matching stale journal", async () => {
  await withTempDir((dir) => {
    const file = path.join(dir, "site.conf");
    const journalDir = path.join(dir, "journals");
    fs.mkdirSync(journalDir);
    const original = writeUpstreamConfig(file, `upstream raising_game_app { server 127.0.0.1:4174; }\n`);
    fs.writeFileSync(path.join(journalDir, "raising-game-nginx-switch-matching.json"), JSON.stringify({
      files: [{ path: file, original, mode: 0o644 }],
    }));
    fs.writeFileSync(file, "upstream raising_game_app { server 127.0.0.1:9999; }\n");
    const result = spawnSync("python3", [upstreamSwitchScript,
      "--file", file,
      "--backup", "raising_game_app=4174:4175",
      "--health-url", "http://127.0.0.1:48080/api/health",
      "--nginx-bin", "/usr/bin/true",
      "--reload-command", "/usr/bin/true",
      "--apply",
    ], {
      cwd: root,
      env: {
        ...process.env,
        NGINX_UPSTREAM_SWITCH_LOCK: path.join(dir, "switch.lock"),
        NGINX_UPSTREAM_SWITCH_JOURNAL_DIR: journalDir,
        PATH: `${dir}:${process.env.PATH}`,
      },
      encoding: "utf8",
    });
    assert.notEqual(result.status, 0);
    assert.match(result.stdout, /UPSTREAM_SWITCH_RECOVERED/);
    assert.equal(fs.readFileSync(file, "utf8"), original);
    assert.ok(!fs.existsSync(path.join(journalDir, "raising-game-nginx-switch-matching.json")));
  });
});

test("Nginx upstream backup transaction rejects malformed or conflicting members", () => {
  withTempDir((dir) => {
    const cases = [
      ["wrong primary", `upstream raising_game_app {\n    server 127.0.0.1:9999;\n}\n`, /must be exactly 127\.0\.0\.1:4175/],
      ["extra backup", `upstream raising_game_app {\n    server 127.0.0.1:4175;\n    server 127.0.0.1:4199 backup;\n}\n`, /must be exactly 127\.0\.0\.1:4175/],
      ["tuned primary", `upstream raising_game_app {\n    server 127.0.0.1:4175 max_fails=1;\n}\n`, /must be exactly 127\.0\.0\.1:4175/],
    ];
    for (const [name, body, error] of cases) {
      const file = path.join(dir, `${name.replaceAll(" ", "-")}.conf`);
      fs.writeFileSync(file, body);
      const result = invokeUpstreamSwitch([
        "--file", file,
        "--backup", "raising_game_app=4175:4174",
        "--health-url", "http://127.0.0.1:48080/api/health",
      ]);
      assert.notEqual(result.status, 0, name);
      assert.match(result.stderr, error, name);
      assert.equal(fs.readFileSync(file, "utf8"), body, name);
    }
  });
});

test("Nginx upstream switch rejects absent, duplicate, multi-server, and extra-option blocks", () => {
  withTempDir((dir) => {
    const cases = [
      ["zero", `upstream other {\n    server 127.0.0.1:4174;\n}\n`, /found 0/],
      ["single-line duplicate", `upstream raising_game_app { server 127.0.0.1:4174; } upstream raising_game_app { server 127.0.0.1:4174; }\n`, /found 2/],
      ["multi-server", `upstream raising_game_app {\n    server 127.0.0.1:4174;\n    server 127.0.0.1:4183;\n}\n`, /server must be exactly/],
      ["extra option", `upstream raising_game_app {\n    server 127.0.0.1:4174 max_fails=1;\n}\n`, /server must be exactly/],
    ];
    for (const [name, body, error] of cases) {
      const file = path.join(dir, `${name.replaceAll(" ", "-")}.conf`);
      fs.writeFileSync(file, body);
      const result = invokeUpstreamSwitch([
        "--file", file,
        "--upstream", "raising_game_app",
        "--current-port", "4174",
        "--next-port", "4183",
        "--health-url", "http://127.0.0.1:48080/api/livez",
      ]);
      assert.notEqual(result.status, 0, name);
      assert.match(result.stderr, error, name);
      assert.equal(fs.readFileSync(file, "utf8"), body, name);
    }
  });
});

test("Nginx upstream switch restores the exact file when nginx validation fails", () => {
  withTempDir((dir) => {
    const file = path.join(dir, "site.conf");
    const original = writeUpstreamConfig(file);
    const nginx = path.join(dir, "nginx");
    writeExecutable(nginx, `#!/usr/bin/env bash
exit 1
`);
    const result = invokeUpstreamSwitch([
      "--file", file,
      "--upstream", "raising_game_app",
      "--current-port", "4174",
      "--next-port", "4183",
      "--health-url", "http://127.0.0.1:48080/api/livez",
      "--nginx-bin", nginx,
      "--reload-command", path.join(dir, "reload-noop"),
      "--apply",
    ]);
    assert.notEqual(result.status, 0);
    assert.match(result.stdout, /UPSTREAM_SWITCH_PLAN/);
    assert.equal(fs.readFileSync(file, "utf8"), original);
  });
});

test("Nginx upstream switch rolls back config and reloads the old upstream when health fails", async () => {
  await withTempDir(async (dir) => {
    const file = path.join(dir, "site.conf");
    const original = writeUpstreamConfig(file);
    const log = path.join(dir, "reload.log");
    const nginx = path.join(dir, "nginx");
    const reload = path.join(dir, "reload");
    const curl = path.join(dir, "curl");
    writeExecutable(nginx, `#!/usr/bin/env bash\nexit 0\n`);
    writeExecutable(reload, `#!/usr/bin/env bash\nprintf 'reload\\n' >> ${JSON.stringify(log)}\nexit 0\n`);
    writeExecutable(curl, `#!/usr/bin/env bash\nexit 22\n`);
    const result = invokeUpstreamSwitch([
      "--file", file,
      "--upstream", "raising_game_app",
      "--current-port", "4174",
      "--next-port", "4183",
      "--health-url", "http://127.0.0.1:48080/api/livez",
      "--nginx-bin", nginx,
      "--reload-command", reload,
      "--apply",
    ], { PATH: `${dir}:${process.env.PATH}` });
    assert.notEqual(result.status, 0);
    assert.equal(fs.readFileSync(file, "utf8"), original);
    assert.equal(fs.readFileSync(log, "utf8").trim().split("\n").length, 2);
  });
});

test("Nginx upstream switch applies only after validation, reload, and health all pass", () => {
  withTempDir((dir) => {
    const file = path.join(dir, "site.conf");
    writeUpstreamConfig(file);
    const nginx = path.join(dir, "nginx");
    const reload = path.join(dir, "reload");
    const curl = path.join(dir, "curl");
    writeExecutable(nginx, `#!/usr/bin/env bash\nexit 0\n`);
    writeExecutable(reload, `#!/usr/bin/env bash\nexit 0\n`);
    writeExecutable(curl, `#!/usr/bin/env bash\nprintf '200'\n`);
    const result = invokeUpstreamSwitch([
      "--file", file,
      "--upstream", "raising_game_app",
      "--current-port", "4174",
      "--next-port", "4183",
      "--health-url", "http://127.0.0.1:48080/api/livez",
      "--nginx-bin", nginx,
      "--reload-command", reload,
      "--apply",
    ], { PATH: `${dir}:${process.env.PATH}` });
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /UPSTREAM_SWITCH_OK upstream=raising_game_app port=4183/);
    assert.match(fs.readFileSync(file, "utf8"), /server 127\.0\.0\.1:4183;/);
    assert.doesNotMatch(fs.readFileSync(file, "utf8"), /server 127\.0\.0\.1:4174;/);
    assert.match(fs.readFileSync(file, "utf8"), /keepalive 64;/);
  });
});

test("Nginx upstream transaction switches every traffic upstream in one atomic config write", () => {
  withTempDir((dir) => {
    const file = path.join(dir, "site.conf");
    const nginx = path.join(dir, "nginx");
    const reload = path.join(dir, "reload");
    const curl = path.join(dir, "curl");
    const nginxLog = path.join(dir, "nginx.log");
    const reloadLog = path.join(dir, "reload.log");
    const original = writeUpstreamConfig(file, `upstream raising_game_app {
    server 127.0.0.1:4174;
    keepalive 64;
}
upstream raising_game_app_chat {
    server 127.0.0.1:4174;
}
upstream raising_game_app_live {
    server 127.0.0.1:4174;
}
upstream unrelated {
    server 127.0.0.1:9000;
}
`);
    writeExecutable(nginx, `#!/usr/bin/env bash
printf '%s\n' "$(cat ${JSON.stringify(file)})" > ${JSON.stringify(nginxLog)}
exit 0
`);
    writeExecutable(reload, `#!/usr/bin/env bash
printf 'reload\n' >> ${JSON.stringify(reloadLog)}
exit 0
`);
    writeExecutable(curl, `#!/usr/bin/env bash
printf '200'
`);
    const result = invokeUpstreamSwitch([
      "--file", file,
      "--switch", "raising_game_app=4174:4183",
      "--switch", "raising_game_app_chat=4174:4183",
      "--switch", "raising_game_app_live=4174:4183",
      "--health-url", "http://127.0.0.1:48080/api/health",
      "--health-url", "http://127.0.0.1:48080/chat/health",
      "--health-url", "http://127.0.0.1:48080/live/health",
      "--nginx-bin", nginx,
      "--reload-command", reload,
      "--apply",
    ], { PATH: `${dir}:${process.env.PATH}` });
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /UPSTREAM_SWITCH_COMMIT_OK upstreams=3 files=1 health_urls=3/);
    const updated = fs.readFileSync(file, "utf8");
    assert.equal((updated.match(/server 127\.0\.0\.1:4183;/g) || []).length, 3);
    assert.match(updated, /upstream unrelated \{\n    server 127\.0\.0\.1:9000;/);
    assert.match(updated, /keepalive 64;/);
    assert.equal(fs.readFileSync(nginxLog, "utf8").trimEnd(), updated.trimEnd());
    assert.equal(fs.readFileSync(reloadLog, "utf8").trim(), "reload");
    assert.notEqual(original, updated);
  });
});

test("Nginx file transaction switches upstreams across files and rolls back every file", async () => {
  await withTempDir(async (dir) => {
    const main = path.join(dir, "default");
    const chat = path.join(dir, "chat.conf");
    const live = path.join(dir, "live.conf");
    const mainOriginal = writeUpstreamConfig(main, `upstream raising_game_app {
    server 127.0.0.1:4174;
    keepalive 64;
}
`);
    const chatOriginal = writeUpstreamConfig(chat, `upstream raising_game_app_chat { server 127.0.0.1:4174; keepalive 32; }
`);
    const liveOriginal = writeUpstreamConfig(live, `upstream raising_game_app_live { server 127.0.0.1:4174; keepalive 32; }
`);
    const nginx = path.join(dir, "nginx");
    const reload = path.join(dir, "reload");
    const curl = path.join(dir, "curl");
    const count = path.join(dir, "count");
    writeExecutable(nginx, `#!/usr/bin/env bash
grep -q '127.0.0.1:4183' ${JSON.stringify(main)} &&
grep -q '127.0.0.1:4183' ${JSON.stringify(chat)} &&
grep -q '127.0.0.1:4183' ${JSON.stringify(live)}
`);
    writeExecutable(reload, `#!/usr/bin/env bash
exit 0
`);
    writeExecutable(curl, `#!/usr/bin/env bash
n=0
[[ -f ${JSON.stringify(count)} ]] && n=$(cat ${JSON.stringify(count)})
n=$((n + 1))
printf '%s' "$n" > ${JSON.stringify(count)}
[[ "$n" -eq 1 ]] && printf '200' && exit 0
printf '503'
exit 22
`);
    const result = invokeUpstreamSwitch([
      "--file-switch", `${main}=raising_game_app=4174:4183`,
      "--file-switch", `${chat}=raising_game_app_chat=4174:4183`,
      "--file-switch", `${live}=raising_game_app_live=4174:4183`,
      "--health-url", "http://127.0.0.1:48080/api/health",
      "--health-url", "http://127.0.0.1:48080/chat/health",
      "--health-url", "http://127.0.0.1:48080/live/health",
      "--nginx-bin", nginx,
      "--reload-command", reload,
      "--apply",
    ], {
      PATH: `${dir}:${process.env.PATH}`,
      NGINX_UPSTREAM_SWITCH_JOURNAL_DIR: dir,
      NGINX_UPSTREAM_SWITCH_LOCK: path.join(dir, "switch.lock"),
    });
    assert.notEqual(result.status, 0);
    assert.match(`${result.stdout}${result.stderr}`, /HTTP 503/);
    assert.equal(fs.readFileSync(main, "utf8"), mainOriginal);
    assert.equal(fs.readFileSync(chat, "utf8"), chatOriginal);
    assert.equal(fs.readFileSync(live, "utf8"), liveOriginal);
    assert.equal(
      fs.readdirSync(dir).some((name) => name.startsWith("raising-game-nginx-switch-") && name.endsWith(".json")),
      false
    );
  });
});

test("Nginx file transaction commits all files and rejects duplicate upstream names", () => {
  withTempDir((dir) => {
    const main = path.join(dir, "default");
    const chat = path.join(dir, "chat.conf");
    writeUpstreamConfig(main, `upstream raising_game_app {
    server 127.0.0.1:4174;
}
`);
    writeUpstreamConfig(chat, `upstream raising_game_app_chat {
    server 127.0.0.1:4174;
}
`);
    const baseArgs = [
      "--file-switch", `${main}=raising_game_app=4174:4183`,
      "--file-switch", `${chat}=raising_game_app_chat=4174:4183`,
      "--health-url", "http://127.0.0.1:48080/api/health",
      "--nginx-bin", path.join(dir, "nginx"),
      "--reload-command", path.join(dir, "reload"),
    ];
    writeExecutable(path.join(dir, "nginx"), "#!/usr/bin/env bash\nexit 0\n");
    writeExecutable(path.join(dir, "reload"), "#!/usr/bin/env bash\nexit 0\n");
    writeExecutable(path.join(dir, "curl"), "#!/usr/bin/env bash\nprintf '200'\n");
    const committed = invokeUpstreamSwitch([...baseArgs, "--apply"], {
      PATH: `${dir}:${process.env.PATH}`,
      NGINX_UPSTREAM_SWITCH_JOURNAL_DIR: dir,
      NGINX_UPSTREAM_SWITCH_LOCK: path.join(dir, "switch.lock"),
    });
    assert.equal(committed.status, 0, committed.stderr);
    assert.match(committed.stdout, /UPSTREAM_SWITCH_COMMIT_OK upstreams=2 files=2 health_urls=1/);
    assert.match(fs.readFileSync(main, "utf8"), /127\.0\.0\.1:4183/);
    assert.match(fs.readFileSync(chat, "utf8"), /127\.0\.0\.1:4183/);
    const duplicate = invokeUpstreamSwitch([
      "--file-switch", `${main}=raising_game_app=4183:4174`,
      "--file-switch", `${chat}=raising_game_app=4183:4174`,
      "--health-url", "http://127.0.0.1:48080/api/health",
    ]);
    assert.notEqual(duplicate.status, 0);
    assert.match(duplicate.stderr, /upstream names must be unique/);
  });
});

test("Nginx upstream transaction rejects any mismatched member without writing config", () => {
  withTempDir((dir) => {
    const file = path.join(dir, "site.conf");
    const original = writeUpstreamConfig(file, `upstream raising_game_app {
    server 127.0.0.1:4174;
}
upstream raising_game_app_chat {
    server 127.0.0.1:4183;
}
`);
    const result = invokeUpstreamSwitch([
      "--file", file,
      "--switch", "raising_game_app=4174:4183",
      "--switch", "raising_game_app_chat=4174:4183",
      "--health-url", "http://127.0.0.1:48080/api/health",
      "--apply",
    ]);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /server must be exactly 127\.0\.0\.1:4174/);
    assert.equal(fs.readFileSync(file, "utf8"), original);
  });
});

test("Nginx upstream transaction rolls back the whole file and reloads old config when any entry is unhealthy", async () => {
  await withTempDir(async (dir) => {
    const file = path.join(dir, "site.conf");
    const original = writeUpstreamConfig(file, `upstream raising_game_app {
    server 127.0.0.1:4174;
}
upstream raising_game_app_chat {
    server 127.0.0.1:4174;
}
`);
    const nginx = path.join(dir, "nginx");
    const reload = path.join(dir, "reload");
    const curl = path.join(dir, "curl");
    const count = path.join(dir, "count");
    const reloadLog = path.join(dir, "reload.log");
    writeExecutable(nginx, `#!/usr/bin/env bash
exit 0
`);
    writeExecutable(reload, `#!/usr/bin/env bash
printf 'reload\n' >> ${JSON.stringify(reloadLog)}
exit 0
`);
    writeExecutable(curl, `#!/usr/bin/env bash
n=0
[[ -f ${JSON.stringify(count)} ]] && n=$(cat ${JSON.stringify(count)})
n=$((n + 1))
printf '%s' "$n" > ${JSON.stringify(count)}
[[ "$n" -eq 1 ]] && printf '200' && exit 0
printf '503'
exit 22
`);
    const result = invokeUpstreamSwitch([
      "--file", file,
      "--switch", "raising_game_app=4174:4183",
      "--switch", "raising_game_app_chat=4174:4183",
      "--health-url", "http://127.0.0.1:48080/api/health",
      "--health-url", "http://127.0.0.1:48080/chat/health",
      "--nginx-bin", nginx,
      "--reload-command", reload,
      "--apply",
    ], { PATH: `${dir}:${process.env.PATH}` });
    assert.notEqual(result.status, 0);
    assert.match(`${result.stdout}${result.stderr}`, /HTTP 503/);
    assert.equal(fs.readFileSync(file, "utf8"), original);
    assert.equal(fs.readFileSync(reloadLog, "utf8").trim().split("\n").length, 2);
  });
});

test("Nginx upstream switch verifies an explicit HTTP 200 rather than accepting a redirect or auth page", () => {
  withTempDir((dir) => {
    const file = path.join(dir, "site.conf");
    writeUpstreamConfig(file);
    const nginx = path.join(dir, "nginx");
    const reload = path.join(dir, "reload");
    const curl = path.join(dir, "curl");
    writeExecutable(nginx, `#!/usr/bin/env bash\nexit 0\n`);
    writeExecutable(reload, `#!/usr/bin/env bash\nexit 0\n`);
    writeExecutable(curl, `#!/usr/bin/env bash\nprintf '302'\nexit 0\n`);
    const result = invokeUpstreamSwitch([
      "--file", file,
      "--upstream", "raising_game_app",
      "--current-port", "4174",
      "--next-port", "4183",
      "--health-url", "http://127.0.0.1:48080/api/livez",
      "--nginx-bin", nginx,
      "--reload-command", reload,
      "--apply",
    ], { PATH: `${dir}:${process.env.PATH}` });
    assert.notEqual(result.status, 0);
    assert.match(`${result.stdout}${result.stderr}`, /HTTP 302/);
    assert.match(fs.readFileSync(file, "utf8"), /server 127\.0\.0\.1:4174;/);
  });
});

test("secondary unit is disabled by default and keeps schedulers off", () => {
  assert.match(secondaryUnit, /description=Raising Game Demo secondary HTTP instance \(disabled by default\)/i);
  assert.match(secondaryUnit, /ConditionPathExists=!\/etc\/raising-game-demo-b\.disabled/);
  assert.match(secondaryUnit, /EnvironmentFile=\/etc\/raising-game-demo\.env/);
  assert.match(secondaryUnit, /EnvironmentFile=\/etc\/raising-game-demo-b\.env/);
  assert.match(secondaryUnit, /Restart=always/);
  assert.match(secondaryUnit, /TimeoutStopSec=300/);
  assert.doesNotMatch(secondaryUnit, /PORT=4174|Environment=PORT=4174/);
  assert.match(secondaryEnv, /PORT=4175/);
  assert.match(secondaryEnv, /DB_SCHEMA_MIGRATION_MODE=verify/);
  assert.match(secondaryEnv, /BACKGROUND_SCHEDULERS_ENABLED=0/);
  assert.match(secondaryEnv, /GENERATION_SUBMIT_QUEUE_ENABLED=0/);
  assert.match(secondaryEnv, /GENERATION_SUBMIT_WORKER_ENABLED=0/);
  assert.doesNotMatch(secondaryEnv, /DATABASE_URL|SECRET|TOKEN|PASSWORD|KEY/);
});

test("cutover runbook uses one atomic switch for every real upstream", () => {
  for (const name of ["raising_game_app", "raising_game_app_chat", "raising_game_app_live"]) {
    assert.match(cutoverRunbook, new RegExp(`${name}=4174:4175`));
    assert.match(cutoverRunbook, new RegExp(`${name}=4175:4174`));
  }
  assert.match(cutoverRunbook, /UPSTREAM_SWITCH_COMMIT_OK/);
  assert.match(cutoverRunbook, /restore the complete original Nginx file/i);
  assert.match(cutoverRunbook, /Do not roll back the database/);
  assert.match(cutoverRunbook, /DB_SCHEMA_MIGRATION_MODE=verify/);
  assert.match(cutoverRunbook, /GENERATION_SUBMIT_QUEUE_ENABLED=0/);
  assert.match(cutoverRunbook, /raising-game-demo-b\.disabled/);
  assert.match(cutoverRunbook, /deliberately blocked start/);
  assert.match(cutoverRunbook, /MainPID=0/);
  assert.match(cutoverRunbook, /Redis remains disabled/);
});

test("cutover verifier is read-only and checks public, service, port, and database gates", () => {
  assert.match(cutoverVerifier, /Read-only acceptance checks/);
  assert.match(cutoverVerifier, /systemctl", "show"/);
  assert.doesNotMatch(cutoverVerifier, /systemctl", "(start|stop|restart|reload)"/);
  assert.doesNotMatch(cutoverVerifier, /nginx-upstream-switch|os\.replace|write_text|open\([^)]*["']w/);
  for (const url of ["https://123vips.com/api/health", "https://chat.5vips.com/api/health", "https://live.123vipeak.com/api/health"]) {
    assert.match(cutoverVerifier, new RegExp(url.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
  assert.match(cutoverVerifier, /secondary_environment_check/);
  assert.match(cutoverVerifier, /GENERATION_SUBMIT_QUEUE_ENABLED/);
  assert.match(cutoverVerifier, /pg_stat_activity/);
  assert.match(cutoverVerifier, /CUTOVER_VERIFY_/);
});

test("watchdog force-kills only the same still-unhealthy PID after restart timeout", async () => {
  await withTempDir(async (dir) => {
    await withHealthServer(async (health) => {
      const bin = path.join(dir, "bin");
      fs.mkdirSync(bin);
      const systemctlLog = path.join(dir, "systemctl.log");
      writeExecutable(path.join(bin, "systemctl"), `#!/usr/bin/env bash
printf '%s\n' "$*" >> ${JSON.stringify(systemctlLog)}
if [[ "$1" == is-active ]]; then exit 0; fi
if [[ "$1" == show && "$*" == *"-p MainPID"* ]]; then printf '4242\n'; exit 0; fi
if [[ "$1" == show && "$*" == *"ExecMainStartTimestampMonotonic"* ]]; then printf '0\n'; exit 0; fi
exit 0
`);
      health.fail();
      const pending = path.join(dir, "restart.pending");
      fs.writeFileSync(pending, `${Math.floor(Date.now() / 1000) - 30} 4242\n`);
      const result = await invokeWatchdogAsync({
        PATH: `${bin}:${process.env.PATH}`,
        HEALTH_URL: health.url,
        STATE_FILE: path.join(dir, "failures"),
        LOCK_FILE: path.join(dir, "lock"),
        RESTART_STATE_FILE: path.join(dir, "restarts"),
        RESTART_PENDING_FILE: pending,
        SERVICE_CHECK_ACTIVE: "1",
        SERVICE: "raising-game-demo-test",
        SIGKILL_AFTER_SECONDS: "15",
        WATCHDOG_DRY_RUN: "0",
      });
      assert.equal(result.status, 0, result.stderr);
      assert.match(result.stderr, /force-kill requested .*pid=4242/);
      assert.match(fs.readFileSync(systemctlLog, "utf8"), /kill --kill-who=main --signal=SIGKILL raising-game-demo-test/);
    });
  });
});

test("watchdog does not force-kill a replaced PID and clears the stale marker", async () => {
  await withTempDir(async (dir) => {
    await withHealthServer(async (health) => {
      const bin = path.join(dir, "bin");
      fs.mkdirSync(bin);
      const systemctlLog = path.join(dir, "systemctl.log");
      writeExecutable(path.join(bin, "systemctl"), `#!/usr/bin/env bash
printf '%s\n' "$*" >> ${JSON.stringify(systemctlLog)}
if [[ "$1" == is-active ]]; then exit 0; fi
if [[ "$1" == show && "$*" == *"-p MainPID"* ]]; then printf '5252\n'; exit 0; fi
if [[ "$1" == show && "$*" == *"ExecMainStartTimestampMonotonic"* ]]; then printf '0\n'; exit 0; fi
exit 0
`);
      health.fail();
      const pending = path.join(dir, "restart.pending");
      fs.writeFileSync(pending, `${Math.floor(Date.now() / 1000) - 30} 4242\n`);
      const result = await invokeWatchdogAsync({
        PATH: `${bin}:${process.env.PATH}`,
        HEALTH_URL: health.url,
        STATE_FILE: path.join(dir, "failures"),
        LOCK_FILE: path.join(dir, "lock"),
        RESTART_STATE_FILE: path.join(dir, "restarts"),
        RESTART_PENDING_FILE: pending,
        SERVICE_CHECK_ACTIVE: "1",
        SERVICE: "raising-game-demo-test",
        SIGKILL_AFTER_SECONDS: "15",
        WATCHDOG_DRY_RUN: "0",
      });
      assert.equal(result.status, 0, result.stderr);
      assert.match(result.stderr, /force-kill skipped reason=main_pid_changed/);
      assert.equal(fs.existsSync(pending), false);
      assert.doesNotMatch(fs.readFileSync(systemctlLog, "utf8"), / kill /);
    });
  });
});

test("watchdog never force-kills in dry-run even with an expired pending marker", async () => {
  await withTempDir(async (dir) => {
    await withHealthServer(async (health) => {
      health.fail();
      const pending = path.join(dir, "restart.pending");
      fs.writeFileSync(pending, `${Math.floor(Date.now() / 1000) - 30} 4242\n`);
      const result = await invokeWatchdogAsync({
        HEALTH_URL: health.url,
        STATE_FILE: path.join(dir, "failures"),
        LOCK_FILE: path.join(dir, "lock"),
        RESTART_STATE_FILE: path.join(dir, "restarts"),
        RESTART_PENDING_FILE: pending,
        FAILURE_THRESHOLD: "3",
        SIGKILL_AFTER_SECONDS: "15",
        WATCHDOG_DRY_RUN: "1",
      });
      assert.equal(result.status, 0, result.stderr);
      assert.doesNotMatch(result.stderr, /force-kill (requested|dispatched)/);
      assert.equal(fs.existsSync(pending), true);
    });
  });
});
