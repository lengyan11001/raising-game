"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const server = fs.readFileSync(path.join(root, "server.js"), "utf8");
const html = fs.readFileSync(path.join(root, "platform.html"), "utf8");
const ui = fs.readFileSync(path.join(root, "platform.ui.js"), "utf8");
const create = fs.readFileSync(path.join(root, "platform.create.js"), "utf8");

test("BytePlus Language is exposed as a text-only Custom model", () => {
  assert.match(html, /<option value="byteplus-language">BytePlus Language<\/option>/);
  assert.match(ui, /return "byteplus-language"/);
  assert.match(create, /\["qwen37-flash", "byteplus-language"\]\.includes\(provider\)/);
  assert.match(create, /advanced-byteplus-language/);
});

test("BytePlus Language uses the Seedance Ark key and requested endpoint model", () => {
  assert.match(server, /BYTEPLUS_LANGUAGE_MODEL[^\n]+ep-20260827122554-8fsgw/);
  assert.match(server, /fetch\(`\$\{ARK_BASE_URL\.replace\(\/\\\/\+\$\/, ""\)\}\/chat\/completions`/);
  assert.match(server, /authorization: `Bearer \$\{ARK_API_KEY\}`/);
  assert.match(server, /provider === "byteplus-language"[\s\S]*?byteplusLanguageRequest\(upstreamPayload\)/);
  assert.match(server, /upstreamSource: provider === "byteplus-language" \? "byteplus-ark-openai-compatible"/);
});
