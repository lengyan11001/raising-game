"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const ui = fs.readFileSync(path.resolve(__dirname, "..", "platform.ui.js"), "utf8");
const create = fs.readFileSync(path.resolve(__dirname, "..", "platform.create.js"), "utf8");

test("top-up user refresh does not recursively reload the top-up page", () => {
  assert.match(ui, /const userChanged = nextUserId !== previousUserId;/);
  assert.match(ui, /if \(userChanged && state\.tab === "topups"\) loadTopupRecords\(1\);/);
  assert.match(create, /if \(payload\.user\) setUser\(payload\.user\);/);
});
