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
const plan = fs.readFileSync(path.join(root, "ops", "RESILIENCE-PLAN.md"), "utf8");
const redisPlan = fs.readFileSync(path.join(root, "ops", "REDIS-PLAN.md"), "utf8");

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
    "ops/REDIS-PLAN.md",
    "ops/service-watchdog.sh",
    "ops/install-service-watchdog.sh",
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

test("resilience plan does not promise multi-process or RPO before verification", () => {
  assert.match(plan, /Do not run multiple copies of `server\.js` yet/);
  assert.match(plan, /per-tick PostgreSQL advisory leases/);
  assert.match(plan, /Do not treat\s+this alone as permission to run multiple `server\.js` processes/);
  assert.match(plan, /current daily-only backup does not meet the RPO target/i);
  assert.match(plan, /off-host backup independent of both production hosts/);
});
