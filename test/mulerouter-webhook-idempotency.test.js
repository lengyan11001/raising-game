"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");

function loadWebhookHandler(overrides = {}) {
  const source = fs.readFileSync(path.join(root, "server.parts", "part-34.js"), "utf8");
  const start = source.indexOf("async function handleMulerouterWebhook");
  const end = source.indexOf("\nfunction verifyAirwallexSignature", start);
  assert.ok(start >= 0 && end > start, "handleMulerouterWebhook source should be present");
  const calls = [];
  const dependencies = {
    mulerouterWebhookConfigured: () => true,
    sendJson: (res, status, body) => {
      res.statusCode = status;
      res.body = body;
      return res;
    },
    readRawBody: async () => JSON.stringify({ type: "task.succeeded", id: "evt_1", data: { model_name: "w3.0-video", payload: { task_info: { id: "task_1" } } } }),
    verifyMulerouterWebhookSignature: () => true,
    claimWebhookDeliveryInDb: async (args) => {
      calls.push(["claim", args]);
      return { claimed: true, claimToken: "claim-token", status: "claimed" };
    },
    releaseWebhookDeliveryClaimInDb: async (args) => {
      calls.push(["release", args]);
      return { released: true, status: "retry" };
    },
    completeWebhookDeliveryClaimInDb: async (args) => {
      calls.push(["complete", args]);
      return { completed: true, status: "completed" };
    },
    findMulerouterGenerationRecord: async () => ({ taskId: "local-task", provider: "mulerouter", status: "processing" }),
    isSucceededStatus: (status) => status === "succeeded",
    isFailedStatus: (status) => status === "failed",
    refreshWan27ImageGenerationRecord: async () => ({ status: "succeeded" }),
    refreshWan27GenerationRecord: async () => ({ status: "succeeded" }),
    console: { log() {}, warn() {}, error() {} },
    ...overrides,
  };
  const names = Object.keys(dependencies);
  const handler = new Function(...names, `${source.slice(start, end)}\nreturn handleMulerouterWebhook;`)(...names.map((name) => dependencies[name]));
  return { handler, calls, dependencies };
}

function request(body = "") {
  return {
    headers: {
      "x-mulerouter-webhook-id": "delivery-1",
      "x-mulerouter-webhook-timestamp": String(Math.floor(Date.now() / 1000)),
      "x-mulerouter-webhook-signature": "v1=test",
    },
    async *[Symbol.asyncIterator]() {
      if (body) yield Buffer.from(body);
    },
  };
}

test("MuleRouter webhook releases the durable claim while the local task is not ready", async () => {
  const { handler, calls } = loadWebhookHandler({ findMulerouterGenerationRecord: async () => null });
  const res = {};
  await handler(request(), res);

  assert.equal(res.statusCode, 503);
  assert.equal(res.body.code, "MULEROUTER_TASK_NOT_READY");
  assert.deepEqual(calls.map(([name]) => name), ["claim", "release"]);
  assert.equal(calls[1][1].error, "task-not-ready:task_1");
  assert.equal(calls[1][1].claimToken, "claim-token");
});

test("MuleRouter webhook releases the durable claim when processing throws", async () => {
  const { handler, calls } = loadWebhookHandler({
    refreshWan27GenerationRecord: async () => { throw new Error("provider record refresh failed"); },
  });

  await assert.rejects(handler(request(), {}), /provider record refresh failed/);
  assert.deepEqual(calls.map(([name]) => name), ["claim", "release"]);
  assert.match(calls[1][1].error, /task:task_1:provider record refresh failed/);
});

test("MuleRouter webhook completes settled, ignored, balance-low, and test deliveries", async (t) => {
  const cases = [
    {
      name: "already settled",
      body: JSON.stringify({ type: "task.succeeded", id: "evt_1", data: { model_name: "w3.0-video", payload: { task_info: { id: "task_1" } } } }),
      record: { taskId: "local-task", status: "succeeded", localVideoUrl: "https://media.example/video.mp4" },
      expectedStatus: 200,
      expectedBody: { alreadySettled: true },
    },
    {
      name: "ignored event",
      body: JSON.stringify({ type: "task.queued", id: "evt_2" }),
      expectedStatus: 200,
      expectedBody: { ignored: "task.queued" },
    },
    {
      name: "balance low",
      body: JSON.stringify({ type: "balance.low", id: "evt_3" }),
      expectedStatus: 200,
      expectedBody: { accepted: "balance.low" },
    },
    {
      name: "provider test event",
      body: JSON.stringify({ type: "task.succeeded", id: "evt_test_4", data: { payload: { task_info: { id: "" } } } }),
      expectedStatus: 200,
      expectedBody: { test: true },
    },
  ];

  for (const testCase of cases) {
    await t.test(testCase.name, async () => {
      const { handler, calls } = loadWebhookHandler({
        readRawBody: async () => testCase.body,
        findMulerouterGenerationRecord: async () => testCase.record || null,
      });
      const res = {};
      await handler(request(testCase.body), res);
      assert.equal(res.statusCode, testCase.expectedStatus);
      for (const [key, value] of Object.entries(testCase.expectedBody)) assert.equal(res.body[key], value);
      assert.deepEqual(calls.map(([name]) => name), ["claim", "complete"]);
      assert.equal(calls[1][1].claimToken, "claim-token");
    });
  }
});

test("MuleRouter webhook releases invalid JSON and completes successful refreshes", async () => {
  const invalid = loadWebhookHandler({ readRawBody: async () => "{" });
  const invalidRes = {};
  await invalid.handler(request("{"), invalidRes);
  assert.equal(invalidRes.statusCode, 400);
  assert.deepEqual(invalid.calls.map(([name]) => name), ["claim", "release"]);
  assert.equal(invalid.calls[1][1].error, "invalid-json");

  const success = loadWebhookHandler();
  const successRes = {};
  await success.handler(request(), successRes);
  assert.equal(successRes.statusCode, 200);
  assert.equal(successRes.body.status, "succeeded");
  assert.deepEqual(success.calls.map(([name]) => name), ["claim", "complete"]);
});
