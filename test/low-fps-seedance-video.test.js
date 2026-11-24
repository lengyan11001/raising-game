"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const server = fs.readFileSync(path.join(root, "server.js"), "utf8");

test("Seedance video probing reads frame rate as well as dimensions", () => {
  assert.match(server, /stream=width,height,duration,r_frame_rate,avg_frame_rate/);
  assert.match(server, /function videoFrameRateFromProbeStream\(stream = \{\}\)/);
  assert.match(server, /for \(const value of \[stream\.avg_frame_rate, stream\.r_frame_rate\]\)/);
  assert.match(server, /fps: frameRate,[\s\S]*?frameRate,/);
  assert.match(server, /function seedanceVideoFrameRate\(dimensions = \{\}\) \{\n  const source = plainObject\(dimensions\);/);
});

test("low FPS Seedance videos are normalized to 24 FPS", () => {
  assert.match(server, /const SEEDANCE_VIDEO_FPS_MIN = 23\.8;/);
  assert.match(server, /const SEEDANCE_VIDEO_FPS_NORMALIZED = 24;/);
  assert.match(server, /function seedanceVideoNeedsFrameRateNormalization\(dimensions = \{\}\)/);
  assert.match(server, /needsFrameRateNormalization\) videoFilters\.push\(`fps=\$\{SEEDANCE_VIDEO_FPS_NORMALIZED\}`\)/);
  assert.match(server, /if \(!needsScaling && !needsFrameRateNormalization\)/);
});

test("Seedance video reuse rejects missing or low stored FPS", () => {
  assert.match(server, /!seedanceVideoFrameRate\(storedDimensions\) \|\| seedanceVideoNeedsFrameRateNormalization\(storedDimensions\)/);
  assert.match(server, /Missing\/low FPS metadata cannot prove an existing upstream asset is usable\./);
  assert.match(server, /userAsset\[cacheField\] = "";/);
});

test("normalized FPS is persisted on uploaded and prepared video assets", () => {
  assert.match(server, /asset\.videoFps = fps;[\s\S]*?asset\.frameRate = fps;/);
  assert.match(server, /videoFps: seedanceVideoFrameRate\(videoDimensions\) \|\| 0,[\s\S]*?frameRate: seedanceVideoFrameRate\(videoDimensions\) \|\| 0,/);
  assert.match(server, /const dimensions = await normalizeSeedanceVideoFileForRequest\(localPath, localPath, "Seedance video asset"\);[\s\S]*?applySeedanceVideoDimensionsToAsset\(userAsset, dimensions\);/);
  assert.match(server, /applySeedanceVideoDimensionsToAsset\(asset, dimensions\);/);
});

test("gateway publishing refreshes video URL after FPS normalization", () => {
  assert.match(server, /!seedanceVideoFrameRate\(before \|\| \{\}\)[\s\S]*?seedanceVideoNeedsFrameRateNormalization\(before \|\| \{\}\)/);
  assert.match(server, /const dimensions = await validateSeedanceVideoAssetForRequest\(db, userAsset, "Seedance gateway video"\);[\s\S]*?applySeedanceVideoDimensionsToAsset\(userAsset, dimensions\);/);
});

test("Seedance 2.5 public asset URLs normalize reference videos before publishing", () => {
  assert.match(server, /const isVideo = String\(asset\?\.mime \|\| ""\)\.toLowerCase\(\)\.startsWith\("video\/"\);/);
  assert.match(server, /\(isVideo \? await prepareSeedanceVideoAsset\(db, asset\) : null\)\?\.asset/);
});

test("Seedance direct generation normalizes stored video assets before CreateAsset", () => {
  assert.match(server, /async function seedance25DirectVideoAssetUri\(db, user,/);
  assert.match(server, /asset = videoAssetIds\[index\][\s\S]*?seedance25OwnedAssets\(db, userId, \[videoAssetIds\[index\]\], "video"\)\[0\]/);
  assert.match(server, /await seedance25DirectVideoAssetUri\(db, record\?\.userId \? \{ id: userId \} : null, \{[\s\S]*?asset,[\s\S]*?url: upstreamInput\.videoFiles\[index\],/);
  assert.match(server, /videoAssetIds: videoUrls\.map\(\(url, index\) => videoAssets\[index\]\?\.id \|\| ""\),/);
});

test("Seedance direct keeps URL-only video inputs on the guarded fallback", () => {
  assert.match(server, /if \(!resolved && url\) \{[\s\S]*?createSeedanceReferenceVideoAssetFromUrl\(db, user, url, index\);/);
  assert.match(server, /return ensureSeedanceAssetUriForPublicUrl\(publicUrl, "Video", name\);/);
});
