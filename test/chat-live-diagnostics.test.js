"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const server = fs.readFileSync(path.join(__dirname, "..", "server.js"), "utf8");
const client = fs.readFileSync(path.join(__dirname, "..", "chat-live.js"), "utf8");
const admin = fs.readFileSync(path.join(__dirname, "..", "admin.js"), "utf8");

test("chat live sessions use first-frame billing and preserve legacy sessions", () => {
  assert.equal((server.match(/billingPolicy: "first_frame"/g) || []).length, 2);
  assert.match(server, /const billingPolicy = session\.billingPolicy \|\| latest\?\.billingPolicy \|\| ""/);
  assert.match(server, /const billedSeconds = billingPolicy === "first_frame"/);
  assert.match(server, /const billedSeconds = session\.billingPolicy === "first_frame"/);
  assert.match(client, /state\.billableStartedAt \? `\$\{mm\}:\$\{ss\}` : "--:--"/);
});

test("chat live operation diagnostics persist bounded success and failure details", () => {
  assert.match(server, /async function appendChatLiveOperation/);
  assert.match(server, /jsonb_array_length\(COALESCE\(payload->'operations', '\[\]'::jsonb\)\) \+ 2 - 40/);
  assert.match(server, /success: body\?\.success === true \? true : body\?\.success === false \? false : null/);
  assert.match(server, /code: String\(body\?\.code \|\| ""\)/);
  assert.match(server, /operations: normalizeChatLiveOperations\(session\.operations\)/);
  assert.match(admin, /操作明细/);
  assert.match(admin, /operation\.success === true/);
  assert.match(admin, /operation\.success === false/);
  assert.match(admin, /处理中/);
});

test("control disconnect reports the active operation instead of hard-coded Undress", () => {
  assert.match(client, /const operation = state\.lookOperation \|\| \{\};/);
  assert.match(client, /action: operation\.action \|\| "switch_look"/);
  assert.doesNotMatch(client, /reportChatLiveOperation\(\{ action: "undress", phase: "transport"/);
});
