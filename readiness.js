"use strict";

const { execFileSync } = require("node:child_process");
const path = require("node:path");

const PHASES = Object.freeze({
  STARTING: "starting",
  READY: "ready",
  STOPPING: "stopping",
  FAILED: "failed",
});

function createReadinessState({ release, pid, runtime } = {}) {
  const state = {
    phase: PHASES.STARTING,
    startedAt: new Date().toISOString(),
    readyAt: "",
    failedAt: "",
    errorCode: "",
    errorMessage: "",
  };
  if (release && typeof release === "object") state.release = { ...release };
  if (Number.isInteger(pid) && pid > 0) state.pid = pid;
  if (runtime && typeof runtime === "object") state.runtime = { ...runtime };
  return state;
}

function resolveReleaseIdentity({
  root = __dirname,
  gitBin = "git",
  timeoutMs = 3000,
} = {}) {
  const repoRoot = path.resolve(root);
  try {
    const id = String(execFileSync(gitBin, [
      "-C",
      repoRoot,
      "rev-parse",
      "--verify",
      "HEAD",
    ], {
      encoding: "utf8",
      timeout: timeoutMs,
      stdio: ["ignore", "pipe", "ignore"],
      env: { ...process.env, GIT_OPTIONAL_LOCKS: "0" },
    })).trim().toLowerCase();
    if (!/^[0-9a-f]{40}(?:[0-9a-f]{24})?$/.test(id)) {
      return { id: "", clean: false, source: "git-invalid" };
    }
    const status = String(execFileSync(gitBin, [
      "-C",
      repoRoot,
      "status",
      "--porcelain=v1",
      "--untracked-files=no",
      "--ignore-submodules=dirty",
    ], {
      encoding: "utf8",
      timeout: timeoutMs,
      stdio: ["ignore", "pipe", "ignore"],
      env: { ...process.env, GIT_OPTIONAL_LOCKS: "0" },
    }));
    return { id, clean: status.trim() === "", source: "git" };
  } catch {
    return { id: "", clean: false, source: "unavailable" };
  }
}

function processMetadata(state) {
  return {
    ...(state.release ? { release: { ...state.release } } : {}),
    ...(Number.isInteger(state.pid) ? { process: { pid: state.pid } } : {}),
    ...(state.runtime ? { runtime: { ...state.runtime } } : {}),
  };
}

function markReady(state, now = new Date()) {
  state.phase = PHASES.READY;
  state.readyAt = now.toISOString();
  state.failedAt = "";
  state.errorCode = "";
  state.errorMessage = "";
  return state;
}

function markStarting(state) {
  state.phase = PHASES.STARTING;
  state.readyAt = "";
  state.failedAt = "";
  state.errorCode = "";
  state.errorMessage = "";
  return state;
}

function markStopping(state) {
  state.phase = PHASES.STOPPING;
  return state;
}

function markFailed(state, error, now = new Date()) {
  state.phase = PHASES.FAILED;
  state.failedAt = now.toISOString();
  state.errorCode = String(error?.code || error?.name || "READINESS_FAILED").trim() || "READINESS_FAILED";
  state.errorMessage = String(error?.message || error || "Readiness failed").trim();
  return state;
}

function readinessView(state) {
  const ready = state.phase === PHASES.READY;
  return {
    ok: ready,
    ready,
    phase: state.phase,
    startedAt: state.startedAt,
    readyAt: state.readyAt,
    ...processMetadata(state),
    ...(state.failedAt ? {
      failedAt: state.failedAt,
      error: {
        code: state.errorCode,
        message: state.errorMessage,
      },
    } : {}),
  };
}

function liveView(state) {
  return {
    ok: state.phase !== PHASES.FAILED,
    phase: state.phase,
    startedAt: state.startedAt,
    ...processMetadata(state),
  };
}

async function probeReadiness(state, {
  checkDatabase = async () => ({ ok: true }),
  timeoutMs = 1500,
  cacheMs = 1000,
  now = () => Date.now(),
} = {}) {
  if (state.phase !== PHASES.READY) return readinessView(state);
  const checkedAt = now();
  if (state.databaseCheck?.result && checkedAt - state.databaseCheck.checkedAt < cacheMs) {
    return state.databaseCheck.result;
  }
  let result;
  let timer;
  try {
    const timeout = new Promise((_, reject) => {
      timer = setTimeout(() => {
        const error = new Error(`Database readiness check timed out after ${timeoutMs}ms`);
        error.code = "DATABASE_READINESS_TIMEOUT";
        reject(error);
      }, timeoutMs);
    });
    await Promise.race([checkDatabase({ timeoutMs }), timeout]);
    result = readinessView(state);
  } catch (error) {
    result = {
      ...readinessView(state),
      ok: false,
      ready: false,
      database: {
        ok: false,
        code: String(error?.code || "DATABASE_READINESS_FAILED"),
      },
    };
  } finally {
    clearTimeout(timer);
  }
  state.databaseCheck = { checkedAt, result };
  return result;
}

async function readinessResponse(state, {
  checkDatabase,
  timeoutMs = 1500,
  cacheMs = 1000,
} = {}) {
  const readiness = await probeReadiness(state, { checkDatabase, timeoutMs, cacheMs });
  return {
    statusCode: readiness.ok ? 200 : 503,
    body: readiness,
  };
}

module.exports = {
  PHASES,
  createReadinessState,
  resolveReleaseIdentity,
  markReady,
  markStarting,
  markStopping,
  markFailed,
  readinessView,
  liveView,
  probeReadiness,
  readinessResponse,
};
