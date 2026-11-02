"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const server = fs.readFileSync(path.resolve(__dirname, "..", "server.js"), "utf8");

function asyncWan27ImageEditSource() {
  const start = server.indexOf("  if (asyncResponse) {");
  const end = server.indexOf("\n  try {\n    return await runWan27ImageEditTask", start + 1);
  assert.notEqual(start, -1, "Wan2.7 async response branch should exist");
  assert.notEqual(end, -1, "Wan2.7 background branch should end before the synchronous path");
  return server.slice(start, end);
}

test("Wan2.7 background image edits never write a second HTTP response", () => {
  const source = asyncWan27ImageEditSource();
  assert.match(
    source,
    /runWan27ImageEditTask\(\{ waitForResult: false, sendResponse: false \}\)/,
  );
  assert.doesNotMatch(source, /runWan27ImageEditTask\(\{ waitForResult: false \}\)/);
});

test("Wan2.7 image edit response ownership is explicit", () => {
  assert.match(
    server,
    /const runWan27ImageEditTask = async \(\{ waitForResult = true, sendResponse = true \} = \{\}\) =>/,
  );
  assert.match(server, /return sendResponse \? sendJson\(res, 200, result\) : result;/);
});
