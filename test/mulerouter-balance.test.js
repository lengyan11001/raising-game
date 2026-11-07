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
