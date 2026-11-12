"use strict";

/*
 * HTTP request idempotency for generation submits.
 *
 * PostgreSQL is the authority. This module only coordinates the request
 * boundary: parse a client key, claim it, replay a durable result, and fence
 * completion/release with the claim token. It deliberately does not read or
 * modify request/response streams.
 */

const crypto = require("node:crypto");

const DEFAULT_HEADER_NAMES = Object.freeze(["idempotency-key", "x-idempotency-key"]);
const DEFAULT_LEASE_MS = 2 * 60 * 1000;
const MAX_KEY_LENGTH = 240;

function headerValue(headers = {}, name = "") {
  if (!headers || !name) return "";
  if (typeof headers.get === "function") return String(headers.get(name) || "").trim();
  const lower = String(name).toLowerCase();
  for (const [key, value] of Object.entries(headers)) {
    if (String(key).toLowerCase() !== lower) continue;
    if (Array.isArray(value)) return String(value[0] || "").trim();
    return String(value ?? "").trim();
  }
  return "";
}

function requestIdempotencyKey(req, headerNames = DEFAULT_HEADER_NAMES) {
  for (const name of headerNames) {
    const value = headerValue(req?.headers, name);
    if (!value) continue;
    if (value.length > MAX_KEY_LENGTH) {
      const error = new Error(`Idempotency-Key must be at most ${MAX_KEY_LENGTH} characters.`);
      error.statusCode = 400;
      error.code = "IDEMPOTENCY_KEY_TOO_LONG";
      throw error;
    }
    return value;
  }
  return "";
}

function canonicalJson(value) {
  if (value === null || typeof value === "string" || typeof value === "boolean") return JSON.stringify(value);
  if (typeof value === "number") return Number.isFinite(value) ? JSON.stringify(value) : "null";
  if (Array.isArray(value)) return `[${value.map((item) => canonicalJson(item)).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
  }
  return "null";
}

function requestPayloadHash(payload = {}) {
  return `sha256:${crypto.createHash("sha256").update(canonicalJson(payload)).digest("hex")}`;
}

function newClaimToken() {
  return crypto.randomUUID();
}

function deterministicTaskId(prefix = "cgt", userId = "", action = "", key = "") {
  const digest = crypto.createHash("sha256")
    .update(`${String(userId)}\0${String(action)}\0${String(key)}`)
    .digest("hex")
    .slice(0, 20);
  return `${String(prefix || "cgt").replace(/[^a-z0-9_-]+/gi, "-").replace(/^-+|-+$/g, "").slice(0, 24) || "cgt"}-${digest}`;
}

function isRetryableStatus(statusCode = 0) {
  const status = Number(statusCode) || 0;
  return status === 0 || status === 408 || status >= 500;
}

function idempotencyErrorPayload(code, message, extra = {}) {
  return { ok: false, code, message, ...extra };
}

function replayHeaders() {
  return { "Idempotent-Replay": "true" };
}

async function executeRequestIdempotently({
  req,
  auth,
  action = "",
  payload = {},
  taskIdPrefix = "cgt",
  leaseMs = DEFAULT_LEASE_MS,
  claim,
  complete,
  release,
  execute,
  now = () => new Date(),
  claimToken = newClaimToken,
} = {}) {
  if (typeof execute !== "function") throw new TypeError("request idempotency execute callback is required");
  const key = requestIdempotencyKey(req);
  if (!key) return await execute({ idempotency: { enabled: false, key: "", taskId: "" } });

  const userId = String(auth?.user?.id || "").trim();
  if (!userId) {
    return {
      statusCode: 401,
      payload: idempotencyErrorPayload("AUTH_REQUIRED", "Authentication is required."),
      headers: {},
    };
  }
  if (!String(action || "").trim()) throw new Error("request idempotency action is required");
  if (typeof claim !== "function" || typeof complete !== "function" || typeof release !== "function") {
    throw new TypeError("request idempotency requires claim, complete, and release callbacks");
  }

  const payloadHash = requestPayloadHash(payload);
  const plannedTaskId = deterministicTaskId(taskIdPrefix, userId, action, key);
  const token = String(claimToken() || "");
  const claimed = await claim({
    userId,
    action,
    idempotencyKey: key,
    payloadHash,
    claimToken: token,
    taskId: plannedTaskId,
    leaseMs,
  });

  if (claimed?.conflict) {
    return {
      statusCode: 409,
      payload: idempotencyErrorPayload(
        "IDEMPOTENCY_KEY_REUSED",
        "This idempotency key was already used with a different request payload.",
        { taskId: claimed.taskId || "" },
      ),
      headers: {},
    };
  }
  if (!claimed?.claimed) {
    if (String(claimed?.status || "") === "completed" && claimed.resultPayload) {
      return {
        statusCode: 200,
        payload: claimed.resultPayload,
        headers: replayHeaders(),
      };
    }
    if (String(claimed?.status || "") === "claimed") {
      return {
        statusCode: 409,
        payload: idempotencyErrorPayload(
          "REQUEST_IN_PROGRESS",
          "This request is already being processed. Retry with the same idempotency key.",
          { taskId: claimed.taskId || "" },
        ),
        headers: { "Retry-After": "2" },
      };
    }
    return {
      statusCode: 409,
      payload: idempotencyErrorPayload(
        "IDEMPOTENCY_KEY_UNAVAILABLE",
        "This idempotency key cannot be used right now. Retry with the same key.",
        { taskId: claimed?.taskId || "", state: claimed?.status || "" },
      ),
      headers: {},
    };
  }

  const taskId = String(claimed.taskId || plannedTaskId);
  const startedAt = now();
  let result;
  try {
    result = await execute({
      idempotency: {
        enabled: true,
        key,
        taskId,
        claimToken: token,
        payloadHash,
        startedAt,
      },
    });
  } catch (error) {
    await release({
      userId,
      action,
      idempotencyKey: key,
      claimToken: token,
      error: String(error?.message || error || "generation request failed").slice(0, 2000),
    }).catch(() => {});
    throw error;
  }

  const statusCode = Number(result?.statusCode) || 200;
  if (statusCode >= 200 && statusCode < 300) {
    const completed = await complete({
      userId,
      action,
      idempotencyKey: key,
      claimToken: token,
      taskId,
      resultPayload: result.payload || {},
    });
    if (!completed?.completed) {
      const error = new Error("Request completed but its idempotency result could not be committed.");
      error.statusCode = 409;
      error.code = "IDEMPOTENCY_COMPLETION_CONFLICT";
      throw error;
    }
    return {
      ...result,
      statusCode,
      payload: result.payload || {},
      headers: { ...(result.headers || {}), "Idempotency-Key": key },
    };
  }

  if (isRetryableStatus(statusCode)) {
    await release({
      userId,
      action,
      idempotencyKey: key,
      claimToken: token,
      error: `HTTP ${statusCode}: ${String(result?.payload?.code || result?.payload?.message || "")}`,
    }).catch(() => {});
  } else {
    // A deterministic business validation failure must not burn the key.
    await release({
      userId,
      action,
      idempotencyKey: key,
      claimToken: token,
      error: `HTTP ${statusCode}: ${String(result?.payload?.code || result?.payload?.message || "")}`,
    }).catch(() => {});
  }
  return {
    ...result,
    statusCode,
    payload: result?.payload || {},
    headers: { ...(result?.headers || {}), "Idempotency-Key": key },
  };
}

module.exports = {
  DEFAULT_HEADER_NAMES,
  DEFAULT_LEASE_MS,
  MAX_KEY_LENGTH,
  canonicalJson,
  deterministicTaskId,
  executeRequestIdempotently,
  headerValue,
  isRetryableStatus,
  newClaimToken,
  requestIdempotencyKey,
  requestPayloadHash,
};
