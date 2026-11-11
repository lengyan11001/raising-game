"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

process.env.MULEROUTER_API_KEY = "test-key";
const mulerouter = require("../mulerouter-aliyun");

function mockFetch(payload, status = 402) {
  const original = global.fetch;
  global.fetch = async () => new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });
  return () => {
    global.fetch = original;
  };
}

test("MuleRouter balance rejection is reported as an upstream provider error", async () => {
  const restore = mockFetch({
    detail: "Available balance: -2.835 credits, Minimum required: 0 credits",
  });
  try {
    await assert.rejects(
      () => mulerouter.submit({ use: true, vendor: "carrothub", slug: "w3.0-video", body: {} }),
      (error) => {
        assert.equal(error.code, "MULEROUTER_UPSTREAM_BALANCE_UNAVAILABLE");
        assert.equal(error.statusCode, 503);
        assert.equal(error.provider, "mulerouter");
        assert.equal(error.availableBalance, -2.835);
        assert.equal(error.minimumRequired, 0);
        assert.match(error.message, /上游 MuleRouter 账户余额不足/);
        assert.match(error.message, /平台预扣积分会自动退回/);
        assert.doesNotMatch(error.message, /^Available balance/);
        return true;
      },
    );
  } finally {
    restore();
  }
});

test("other MuleRouter failures retain their original error", async () => {
  const restore = mockFetch({ detail: "Invalid request parameter." }, 400);
  try {
    await assert.rejects(
      () => mulerouter.submit({ use: true, vendor: "carrothub", slug: "w3.0-video", body: {} }),
      (error) => {
        assert.equal(error.code, "MULEROUTER_REQUEST_FAILED");
        assert.equal(error.statusCode, 400);
        assert.equal(error.message, "Invalid request parameter.");
        return true;
      },
    );
  } finally {
    restore();
  }
});


test("MuleRouter polling retries a transient network failure", async () => {
  const original = global.fetch;
  let calls = 0;
  global.fetch = async () => {
    calls += 1;
    if (calls === 1) {
      const error = new TypeError("fetch failed");
      error.cause = { code: "ECONNRESET" };
      throw error;
    }
    return new Response(JSON.stringify({
      task_info: { id: "task-1", status: "completed" },
      images: ["https://cdn.example.com/result.png"],
    }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };
  try {
    const result = await mulerouter.query("mr:qwen-image-edit-spicy:task-1");
    assert.equal(calls, 2);
    assert.equal(result.task.status, "completed");
    assert.deepEqual(result.task.imageUrls, ["https://cdn.example.com/result.png"]);
  } finally {
    global.fetch = original;
  }
});

test("MuleRouter does not retry a submitted generation on an ambiguous fetch failure", async () => {
  const original = global.fetch;
  let calls = 0;
  global.fetch = async () => {
    calls += 1;
    throw new TypeError("fetch failed");
  };
  try {
    await assert.rejects(
      () => mulerouter.submit({ use: true, vendor: "carrothub", slug: "qwen-image-edit-spicy", body: { prompt: "test" } }),
      (error) => {
        assert.equal(error.code, "MULEROUTER_NETWORK_ERROR");
        assert.equal(error.statusCode, 502);
        return true;
      },
    );
    assert.equal(calls, 1);
  } finally {
    global.fetch = original;
  }
});

test("MuleRouter retries a generation only when the connection was never established", async () => {
  const original = global.fetch;
  let calls = 0;
  global.fetch = async () => {
    calls += 1;
    if (calls === 1) {
      const error = new TypeError("fetch failed");
      error.cause = { code: "ENOTFOUND" };
      throw error;
    }
    return new Response(JSON.stringify({
      task_info: { id: "task-2", status: "pending" },
    }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };
  try {
    const result = await mulerouter.submit({ use: true, vendor: "carrothub", slug: "qwen-image-edit-spicy", body: { prompt: "test" } });
    assert.equal(calls, 2);
    assert.equal(result.task.taskId, "mr:qwen-image-edit-spicy:task-2");
  } finally {
    global.fetch = original;
  }
});
