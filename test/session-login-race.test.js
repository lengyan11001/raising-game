"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const read = (name) => fs.readFileSync(path.join(root, name), "utf8");

function loadRequestJson() {
  const source = read("platform.ui.parts/part-04.js");
  const match = source.match(/async function requestJson\(url, options = \{\}\) \{[\s\S]*?\n}\r?\n\r?\nfunction clearClientAuthState/);
  assert.ok(match, "requestJson should be present");
  return match[0].replace(/\n\r?\nfunction clearClientAuthState[\s\S]*$/, "");
}

function loadLoadMe() {
  const source = read("platform.create.parts/part-06.js");
  const match = source.match(/async function loadMe\(\) \{[\s\S]*?\n}\r?\n\r?\nasync function loadBillingSummary/);
  assert.ok(match, "loadMe should be present");
  return match[0].replace(/\n\r?\nasync function loadBillingSummary[\s\S]*$/, "");
}

test("a stale auth response cannot clear a newer login token", async () => {
  const state = { token: "old-token", tab: "home" };
  const events = [];
  let cleared = 0;
  const sandbox = {
    state,
    AbortSignal,
    CustomEvent: class CustomEvent { constructor(type, options) { this.type = type; this.detail = options?.detail; } },
    window: { dispatchEvent: (event) => events.push(event) },
    clearClientAuthState: () => { cleared += 1; },
    fetch: async (_url, options) => ({
      status: 401,
      ok: false,
      json: async () => ({ ok: false, code: "LOGIN_REQUIRED", message: "sign in" }),
    }),
  };
  vm.runInNewContext(`${loadRequestJson()}\n;globalThis.requestJson = requestJson;`, sandbox);

  const pending = sandbox.requestJson("/api/auth/me");
  state.token = "new-token";
  await assert.rejects(pending, /sign in/);

  assert.equal(cleared, 0);
  assert.equal(state.token, "new-token");
  assert.equal(events.length, 0);
});

test("an auth rejection for the current token still clears the session", async () => {
  const state = { token: "current-token", tab: "home" };
  let cleared = 0;
  const sandbox = {
    state,
    AbortSignal,
    CustomEvent: class CustomEvent { constructor(type, options) { this.type = type; this.detail = options?.detail; } },
    window: { dispatchEvent: () => {} },
    clearClientAuthState: () => { cleared += 1; state.token = ""; },
    fetch: async () => ({
      status: 401,
      ok: false,
      json: async () => ({ ok: false, code: "SESSION_REPLACED", message: "replaced" }),
    }),
  };
  vm.runInNewContext(`${loadRequestJson()}\n;globalThis.requestJson = requestJson;`, sandbox);

  await assert.rejects(sandbox.requestJson("/api/auth/me"), /replaced/);
  assert.equal(cleared, 1);
});

test("a late session restore cannot overwrite a login completed meanwhile", async () => {
  const state = { token: "old-token" };
  const users = [];
  const sandbox = {
    state,
    TOKEN_KEY: "token",
    localStorage: { removeItem: () => {} },
    setUser: (user) => users.push(user),
    requestJson: async () => {
      state.token = "new-token";
      return { user: { id: "old-user" } };
    },
  };
  vm.runInNewContext(`${loadLoadMe()}\n;globalThis.loadMe = loadMe;`, sandbox);

  await sandbox.loadMe();
  assert.equal(users.length, 0, "late old-session payload must be ignored");
  assert.equal(state.token, "new-token");
});
