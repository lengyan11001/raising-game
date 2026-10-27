"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const server = read("server.js");
const ui = read("platform.ui.js");
const create = read("platform.create.js");
const explore = read("platform.explore.js");
const css = read("platform.css");

test("generated media defaults to on-demand storage", () => {
  assert.match(server, /const GENERATED_ASSETS_ON_DEMAND = .*process\.env\.GENERATED_ASSETS_ON_DEMAND \|\| "true"/);
  assert.match(server, /if \(GENERATED_ASSETS_ON_DEMAND\) return false;\n  const cleanTaskId = String\(taskId \|\| ""\)/);
  assert.match(server, /if \(DISABLE_GENERATED_R2_STORAGE \|\| GENERATED_ASSETS_ON_DEMAND\) return record;/);
});

test("generated video and image helpers defer local writes until forced", () => {
  const video = server.slice(server.indexOf("async function downloadGeneratedVideo"), server.indexOf("function imageFileName"));
  assert.match(video, /!forceLocal && \(!generatedOutputStorageEnabled\(\) \|\| GENERATED_ASSETS_ON_DEMAND\)/);
  const image = server.slice(server.indexOf("async function saveGeneratedImageFile"), server.indexOf("async function saveRemoteGeneratedImage"));
  assert.match(image, /!forceLocal && \(!generatedOutputStorageEnabled\(\) \|\| GENERATED_ASSETS_ON_DEMAND\)/);
  assert.match(server, /async function saveRemoteGeneratedImage[\s\S]*?!forceLocal && \(!generatedOutputStorageEnabled\(\) \|\| GENERATED_ASSETS_ON_DEMAND\)/);
});

test("advanced download preparation forces a local transient copy and R2 upload", () => {
  const prepare = server.slice(
    server.indexOf("async function prepareGenerationRecordAdvancedDownload"),
    server.indexOf("function generationImageResultUrl"),
  );
  assert.match(prepare, /providerTarget = generationRecordProviderDownloadTarget\(record\)/);
  assert.match(prepare, /downloadGeneratedVideo\(existing\.taskId, providerTarget\.url, \{ forceLocal: true \}\)/);
  assert.match(prepare, /downloadRemoteFileToBuffer\(providerTarget\.url/);
  assert.match(prepare, /saveGeneratedImageFile\(existing\.taskId, downloaded\.bytes, mime, \{ publish: false, forceLocal: true \}\)/);
  assert.match(prepare, /uploadStaticAssetToObjectStorage\(/);
  assert.match(prepare, /markPublishedFileSafely\(saved\.localImagePath\)/);
  assert.match(prepare, /if \(!objectStorageEnabled\(\) \|\| !isSucceededStatus\(record\.status\)\) return record;/);
  assert.match(prepare, /force: true,/);
});

test("advanced download eligibility does not require a pre-existing R2 copy", () => {
  assert.match(server, /advancedDownloadAvailable: Boolean\(/);
  assert.match(ui, /record\?\.r2DownloadReady \|\| record\?\.advancedDownloadAvailable/);
  assert.match(create, /const advancedDownloadState = record\?\.r2DownloadReady \? "ready" : "idle"/);
  assert.match(explore, /const advancedDownloadState = record\?\.r2DownloadReady \? "ready" : "idle"/);
  assert.match(create, /download2 可下载/);
  assert.match(explore, /download2 可下载/);
});

test("advanced download button exposes transferring and ready states", () => {
  const state = ui.slice(ui.indexOf("function setAdvancedDownloadButtonState"), ui.indexOf("function showAdvancedDownloadError"));
  assert.match(state, /status === "transferring"/);
  assert.match(state, /status === "ready"/);
  assert.match(state, /status === "failed"/);
  assert.match(state, /download2 转存中/);
  assert.match(state, /download2 可下载/);
  assert.match(state, /download2 重试/);
  assert.match(create, /setAdvancedDownloadButtonState\(button, "transferring"\)/);
  assert.match(create, /setAdvancedDownloadButtonState\(button, ok \? "ready" : "failed"\)/);
  assert.match(explore, /setAdvancedDownloadButtonState\(button, "transferring"\)/);
  assert.match(css, /\.history-r2-download\.is-transferring svg/);
  assert.match(css, /\.history-r2-download\.is-ready/);
});

test("advanced downloads always request an R2 transfer before browser fetch", () => {
  const download = ui.slice(ui.indexOf("async function downloadGenerationRecordInternal"), ui.indexOf("function stripModelParams"));
  assert.match(download, /download-url\?quality=r2/);
  assert.ok(download.indexOf("download-url?quality=r2") < download.indexOf("await saveDownloadFromFetch(href, fileName)"));
});

test("free locked Undress previews still keep a forced local source", () => {
  assert.match(server, /if \(freeImageGeneration\) \{[\s\S]*?saveGeneratedImageFile\(taskId, downloaded\.bytes, mime, \{ publish: false, forceLocal: true \}\)/);
});
