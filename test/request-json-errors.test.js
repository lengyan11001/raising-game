"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const read = (name) => fs.readFileSync(path.join(root, name), "utf8");

function loadRequestJson(fetchImpl) {
  const source = read("platform.ui.parts/part-04.js");
  const match = source.match(/async function requestJson\(url, options = \{\}\) \{[\s\S]*?\n}\r?\n\r?\nfunction clearClientAuthState/);
  assert.ok(match, "requestJson should be present");
  const code = match[0].replace(/\n\r?\nfunction clearClientAuthState[\s\S]*$/, "");
  const sandbox = {
    state: { token: "token" },
    AbortSignal,
    CustomEvent: class CustomEvent { constructor(type, options) { this.type = type; this.detail = options?.detail; } },
    window: { dispatchEvent: () => {} },
    clearClientAuthState: () => {},
    fetch: fetchImpl,
  };
  vm.runInNewContext(`${code}\n;globalThis.requestJson = requestJson;`, sandbox);
  return sandbox.requestJson;
}

test("requestJson surfaces a JSON backend message instead of the generic 502 label", async () => {
  const requestJson = loadRequestJson(async () => ({
    ok: false,
    status: 502,
    statusText: "Bad Gateway",
    text: async () => JSON.stringify({ ok: false, code: "STORY_PROMPTS_ALL_FAILED", message: "Papaya 内容安全拦截，请重试。" }),
  }));

  await assert.rejects(requestJson("/api/story/prompts/plan", { method: "POST", body: {} }), (error) => {
    assert.equal(error.message, "Papaya 内容安全拦截，请重试。");
    assert.equal(error.code, "STORY_PROMPTS_ALL_FAILED");
    assert.equal(error.statusCode, 502);
    return true;
  });
});

test("requestJson surfaces readable non-JSON gateway text", async () => {
  const requestJson = loadRequestJson(async () => ({
    ok: false,
    status: 502,
    statusText: "Bad Gateway",
    text: async () => "upstream gateway unavailable",
  }));

  await assert.rejects(requestJson("/api/story/prompts/plan"), (error) => {
    assert.equal(error.message, "upstream gateway unavailable");
    assert.equal(error.statusCode, 502);
    assert.equal(error.responseText, "upstream gateway unavailable");
    return true;
  });
});
