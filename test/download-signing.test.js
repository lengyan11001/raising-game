"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const ui = fs.readFileSync(path.join(root, "platform.ui.js"), "utf8");

test("standard downloads request a fresh signature before attachment navigation", () => {
  const download = ui.slice(ui.indexOf("async function downloadGenerationRecordInternal"), ui.indexOf("function stripModelParams"));
  assert.match(download, /requestJson\(`\/api\/generation-records\/\$\{encodeURIComponent\(taskId\)\}\/download-url`\)/);
  assert.match(download, /if \(legacyHref\) \{\n    triggerBrowserDownload\(legacyHref, fileName\)/);
  assert.doesNotMatch(download, /newTab:\s*true|target\s*=\s*"_blank"|window\.open\("about:blank"/);
  assert.doesNotMatch(download, /if \(!advanced && href && !href\.startsWith\("\/api\/"\)\)/);
  assert.ok(download.indexOf("/download-url") < download.indexOf("triggerBrowserDownload(href, fileName)"));
});
