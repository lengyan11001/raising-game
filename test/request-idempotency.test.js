"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const {
  canonicalJson,
  deterministicTaskId,
  executeRequestIdempotently,
  requestIdempotencyKey,
  requestPayloadHash,
} = require("../lib-request-idempotency");

function request(headers = {}) {
  return { headers };
}

function auth(userId = "user-1") {
  return { user: { id: userId } };
}

function memoryStore() {
  const rows = new Map();
  return {
    rows,
    async claim(input) {
      const id = `${input.userId}\0${input.action}\0${input.idempotencyKey}`;
      const existing = rows.get(id);
      if (existing && existing.payloadHash !== input.payloadHash) {
        return { claimed: false, conflict: true, status: "conflict", taskId: existing.taskId, attempts: existing.attempts };
      }
      if (existing?.status === "completed") {
        return {
          claimed: false,
          conflict: false,
          status: "completed",
          taskId: existing.taskId,
          resultPayload: existing.resultPayload,
          attempts: existing.attempts,
        };
      }
      if (existing?.status === "claimed") {
        return { claimed: false, conflict: false, status: "claimed", taskId: existing.taskId, attempts: existing.attempts };
      }
      const row = {
        ...input,
        status: "claimed",
        taskId: existing?.taskId || input.taskId,
        attempts: (existing?.attempts || 0) + 1,
        resultPayload: null,
      };
      rows.set(id, row);
      return { claimed: true, conflict: false, status: "claimed", taskId: row.taskId, attempts: row.attempts };
    },
    async complete(input) {
      const id = `${input.userId}\0${input.action}\0${input.idempotencyKey}`;
      const row = rows.get(id);
      if (!row || row.status !== "claimed" || row.claimToken !== input.claimToken) return { completed: false };
      Object.assign(row, {
        status: "completed",
        claimToken: "",
        taskId: input.taskId || row.taskId,
        resultPayload: input.resultPayload,
      });
      return { completed: true, status: "completed", taskId: row.taskId, resultPayload: row.resultPayload };
    },
    async release(input) {
      const id = `${input.userId}\0${input.action}\0${input.idempotencyKey}`;
      const row = rows.get(id);
      if (!row || row.status !== "claimed" || row.claimToken !== input.claimToken) return { released: false };
      Object.assign(row, { status: "retry", claimToken: "", lastError: input.error });
      return { released: true, status: "retry", taskId: row.taskId, attempts: row.attempts };
    },
  };
}

function options(store, execute) {
  return {
    req: request({ "Idempotency-Key": "submit-once" }),
    auth: auth(),
    action: "platform_generate",
    payload: { templateId: "tpl-1", prompt: "same", params: { ratio: "9:16", duration: 5 } },
    taskIdPrefix: "cgt",
    claimToken: () => "claim-token-1",
    claim: store.claim,
    complete: store.complete,
    release: store.release,
    execute,
  };
}

test("without an idempotency key the legacy path runs once and is not persisted", async () => {
  const store = memoryStore();
  let calls = 0;
  const result = await executeRequestIdempotently({
    ...options(store, async () => {
      calls += 1;
      return { statusCode: 200, payload: { ok: true, taskId: "legacy" } };
    }),
    req: request(),
  });
  assert.equal(result.statusCode, 200);
  assert.equal(result.payload.taskId, "legacy");
  assert.equal(calls, 1);
  assert.equal(store.rows.size, 0);
});

test("same key and same normalized payload creates one task and replays its result", async () => {
  const store = memoryStore();
  let calls = 0;
  const execute = async ({ idempotency }) => {
    calls += 1;
    return {
      statusCode: 200,
      payload: { ok: true, taskId: idempotency.taskId, charged: 12 },
    };
  };
  const first = await executeRequestIdempotently(options(store, execute));
  const replay = await executeRequestIdempotently({
    ...options(store, execute),
    req: request({ "X-Idempotency-Key": "submit-once" }),
    payload: { params: { duration: 5, ratio: "9:16" }, prompt: "same", templateId: "tpl-1" },
  });
  assert.equal(first.statusCode, 200);
  assert.equal(replay.statusCode, 200);
  assert.equal(replay.headers["Idempotent-Replay"], "true");
  assert.equal(first.payload.taskId, replay.payload.taskId);
  assert.equal(calls, 1);
  assert.equal(store.rows.size, 1);
});

test("same key with a different payload is rejected without executing", async () => {
  const store = memoryStore();
  let calls = 0;
  await executeRequestIdempotently(options(store, async () => {
    calls += 1;
    return { statusCode: 200, payload: { ok: true } };
  }));
  const conflict = await executeRequestIdempotently({
    ...options(store, async () => {
      calls += 1;
      return { statusCode: 200, payload: { ok: true } };
    }),
    payload: { templateId: "tpl-2", prompt: "different" },
  });
  assert.equal(conflict.statusCode, 409);
  assert.equal(conflict.payload.code, "IDEMPOTENCY_KEY_REUSED");
  assert.equal(calls, 1);
});

test("an in-flight duplicate returns 409 and never executes twice", async () => {
  const store = memoryStore();
  let releaseFirst;
  const blocked = new Promise((resolve) => { releaseFirst = resolve; });
  let calls = 0;
  const firstPromise = executeRequestIdempotently(options(store, async ({ idempotency }) => {
    calls += 1;
    await blocked;
    return { statusCode: 200, payload: { ok: true, taskId: idempotency.taskId } };
  }));
  await new Promise((resolve) => setImmediate(resolve));
  const duplicate = await executeRequestIdempotently(options(store, async () => {
    calls += 1;
    return { statusCode: 200, payload: { ok: true } };
  }));
  assert.equal(duplicate.statusCode, 409);
  assert.equal(duplicate.payload.code, "REQUEST_IN_PROGRESS");
  releaseFirst();
  await firstPromise;
  assert.equal(calls, 1);
});

test("a deterministic 4xx validation result releases the key for correction and retry", async () => {
  const store = memoryStore();
  let calls = 0;
  const first = await executeRequestIdempotently(options(store, async () => {
    calls += 1;
    return { statusCode: 400, payload: { ok: false, code: "MISSING_PROMPT" } };
  }));
  assert.equal(first.statusCode, 400);
  assert.equal(store.rows.values().next().value.status, "retry");

  const second = await executeRequestIdempotently(options(store, async ({ idempotency }) => {
    calls += 1;
    return { statusCode: 200, payload: { ok: true, taskId: idempotency.taskId } };
  }));
  assert.equal(second.statusCode, 200);
  assert.equal(calls, 2);
  assert.equal(store.rows.values().next().value.attempts, 2);
  assert.equal(store.rows.values().next().value.status, "completed");
});

test("an exception releases the claim and preserves the original error", async () => {
  const store = memoryStore();
  let calls = 0;
  await assert.rejects(
    executeRequestIdempotently(options(store, async () => {
      calls += 1;
      const error = new Error("database temporarily unavailable");
      error.statusCode = 503;
      throw error;
    })),
    /database temporarily unavailable/,
  );
  assert.equal(store.rows.values().next().value.status, "retry");
  const retried = await executeRequestIdempotently(options(store, async ({ idempotency }) => {
    calls += 1;
    return { statusCode: 200, payload: { ok: true, taskId: idempotency.taskId } };
  }));
  assert.equal(retried.statusCode, 200);
  assert.equal(calls, 2);
});

test("a 5xx result is retryable and a completed record is never overwritten", async () => {
  const store = memoryStore();
  let calls = 0;
  const failed = await executeRequestIdempotently(options(store, async () => {
    calls += 1;
    return { statusCode: 502, payload: { ok: false, code: "UPSTREAM_UNAVAILABLE" } };
  }));
  assert.equal(failed.statusCode, 502);
  assert.equal(store.rows.values().next().value.status, "retry");
  const completed = await executeRequestIdempotently(options(store, async ({ idempotency }) => {
    calls += 1;
    return { statusCode: 200, payload: { ok: true, taskId: idempotency.taskId } };
  }));
  assert.equal(completed.statusCode, 200);
  const replay = await executeRequestIdempotently(options(store, async () => {
    calls += 1;
    return { statusCode: 200, payload: { ok: true, taskId: "wrong" } };
  }));
  assert.equal(replay.payload.taskId, completed.payload.taskId);
  assert.equal(calls, 2);
});

test("canonical payload hash ignores object key order but includes arrays and scalar changes", () => {
  assert.equal(canonicalJson({ b: 2, a: [1, { d: 4, c: 3 }] }), canonicalJson({ a: [1, { c: 3, d: 4 }], b: 2 }));
  assert.equal(requestPayloadHash({ a: 1, b: 2 }), requestPayloadHash({ b: 2, a: 1 }));
  assert.notEqual(requestPayloadHash({ a: 1 }), requestPayloadHash({ a: 2 }));
});

test("task ids are stable per user/action/key and do not collide across users or actions", () => {
  const base = deterministicTaskId("cgt", "u1", "advanced_generate", "key-1");
  assert.equal(base, deterministicTaskId("cgt", "u1", "advanced_generate", "key-1"));
  assert.notEqual(base, deterministicTaskId("cgt", "u2", "advanced_generate", "key-1"));
  assert.notEqual(base, deterministicTaskId("cgt", "u1", "platform_generate", "key-1"));
});

test("key parsing prefers Idempotency-Key and rejects oversized keys clearly", () => {
  assert.equal(requestIdempotencyKey(request({ "Idempotency-Key": "abc", "X-Idempotency-Key": "other" })), "abc");
  assert.equal(requestIdempotencyKey(request({ "x-idempotency-key": "lower" })), "lower");
  assert.throws(() => requestIdempotencyKey(request({ "Idempotency-Key": "x".repeat(241) })), (error) => (
    error.code === "IDEMPOTENCY_KEY_TOO_LONG" && error.statusCode === 400
  ));
});
