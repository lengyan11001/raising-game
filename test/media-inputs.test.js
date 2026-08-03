"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const {
  minimumImageTargetDimensions,
  pngBufferHasTransparency,
  referenceVideoDurationViolation,
} = require("../media-inputs");

const server = fs.readFileSync(path.resolve(__dirname, "..", "server.js"), "utf8");
const admin = fs.readFileSync(path.resolve(__dirname, "..", "admin.js"), "utf8");
const adminCss = fs.readFileSync(path.resolve(__dirname, "..", "admin.css"), "utf8");
const explore = fs.readFileSync(path.resolve(__dirname, "..", "platform.explore.js"), "utf8");

test("small reference images are enlarged proportionally to the upstream minimum", () => {
  assert.deepEqual(minimumImageTargetDimensions(204, 204), {
    width: 300,
    height: 300,
    changed: true,
    scale: 300 / 204,
  });
  assert.deepEqual(minimumImageTargetDimensions(400, 600), {
    width: 400,
    height: 600,
    changed: false,
    scale: 1,
  });
});

test("PNG alpha channels and transparency chunks are detected without false positives", () => {
  const pngHeader = Buffer.alloc(33);
  pngHeader[0] = 0x89;
  pngHeader.write("PNG", 1, "ascii");
  pngHeader.writeUInt32BE(13, 8);
  pngHeader.write("IHDR", 12, "ascii");
  pngHeader[25] = 6;
  assert.equal(pngBufferHasTransparency(pngHeader), true);

  pngHeader[25] = 2;
  pngHeader.writeUInt32BE(0, 8);
  pngHeader.write("IDAT", 12, "ascii");
  assert.equal(pngBufferHasTransparency(pngHeader), false);

  const transparentPalettePng = Buffer.alloc(45);
  pngHeader.copy(transparentPalettePng, 0, 0, 33);
  transparentPalettePng.writeUInt32BE(1, 8);
  transparentPalettePng.write("tRNS", 12, "ascii");
  assert.equal(pngBufferHasTransparency(transparentPalettePng), true);
});

test("every Seedance reference video is checked against the asset duration bounds", () => {
  assert.equal(referenceVideoDurationViolation([
    { label: "Video 1", durationSeconds: 8 },
    { label: "Video 2", durationSeconds: 15.2 },
  ]), null);
  assert.deepEqual(referenceVideoDurationViolation([
    { label: "Video 1", durationSeconds: 8 },
    { label: "Video 2", durationSeconds: 15.9667 },
  ]), {
    index: 1,
    label: "Video 2",
    durationSeconds: 15.9667,
    minSeconds: 1.8,
    maxSeconds: 15.2,
  });
});

test("server applies media checks before upstream generation and mirrors tool uploads", () => {
  assert.match(server, /await validateSeedanceReferenceVideoDurationsForRequest\(\{ urls: pricingBody\.reference_videos \}\)/);
  assert.match(server, /referenceVideoAssets: seedanceVideoAssets/);
  assert.match(server, /const objectStorage = await uploadLocalAssetMirrorToObjectStorage\(\{ localUrl, bytes: mirrorBytes, mime \}\)/);
  assert.match(server, /objectStorageKey: objectStorage\.key \|\| ""/);
  assert.match(server, /userAsset = await normalizeUserImageAssetForUpstream/);
  assert.match(server, /flattenedTransparency: true/);
  assert.match(server, /format=rgb24/);
  assert.match(server, /imageMinDimension: wan30 \? 240/);
  assert.match(server, /asset_version=\$\{Date\.now\(\)\}/);
});

test("admin reference previews fall back from upstream asset URIs to playable video URLs", () => {
  assert.match(admin, /const candidates = \[asset\.videoUrl, asset\.url, asset\.localUrl, asset\.publicUrl\]/);
  assert.match(admin, /candidates\.find\(\(url\) => isPreviewableVideoUrl\(url\)\)/);
  assert.match(admin, /candidates\.find\(\(url\) => !isInternalAssetUrl\(url\)\)/);
});

test("admin user actions stay visible in wide tables", () => {
  assert.match(admin, /class="adm-text-right adm-user-actions-cell"/);
  assert.match(admin, /class="adm-btn adm-btn-sm adm-btn-ghost adm-user-action-btn"/);
  assert.match(adminCss, /\.adm-user-table th\.adm-user-actions-cell,[\s\S]*?position: sticky;[\s\S]*?right: 0;/);
  assert.match(adminCss, /\.adm-user-table \.adm-user-action-btn \{[\s\S]*?width: 34px;[\s\S]*?height: 34px;/);
});

test("owner and admin parameter views show the payload actually sent upstream", () => {
  assert.match(server, /includeUpstreamPayload: !externalApiCaller/);
  assert.match(server, /publicRecord\.upstreamPayload = listGenerationRecordValue\(record\.upstreamPayload \|\| null\)/);
  assert.match(explore, /params: record\.upstreamPayload \|\| record\.params \|\| null/);
  assert.match(admin, /recordDetailJsonSectionHtml\("upstream", "实际发送参数", record\.upstreamPayload \|\| record\.params\)/);
});
