"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const server = fs.readFileSync(path.resolve(__dirname, "..", "server.js"), "utf8");
const admin = fs.readFileSync(path.resolve(__dirname, "..", "admin.js"), "utf8");
const app = fs.readFileSync(path.resolve(__dirname, "..", "app.js"), "utf8");

test("generation record previews prefer signed CDN, then upstream, then local media", () => {
  assert.match(server, /const deliveryVideoUrl = deliverableStoredMediaUrl\(cdnUrl/);
  assert.match(server, /function deliverableStoredMediaUrl/);
  assert.match(server, /if \(OSS_STORAGE_ENABLED && \(provider === "oss" \|\| \(provider === "" && key\)\)\) return ""/);
  assert.match(admin, /record\.cdnVideoUrl \|\|\s*record\.remoteVideoUrl \|\|\s*record\.providerVideoUrl/);
  assert.match(app, /record\?\.cdnVideoUrl \|\|\s*record\?\.remoteVideoUrl \|\|\s*record\?\.providerVideoUrl/);
});

test("image and poster previews also prefer stored R2 URLs", () => {
  assert.match(server, /record\.cdnImageUrl \|\|[\s\S]*record\.remoteImageUrl/);
  assert.match(server, /deliverableStoredMediaUrl\(record\.cdnPosterUrl/);
  assert.match(server, /\|\| deliverableStoredMediaUrl\(record\.localPosterUrl/);
  assert.match(server, /\|\| deliverableStoredMediaUrl\(record\.posterUrl/);
  assert.match(admin, /record\.cdnImageUrl \|\| record\.remoteImageUrl/);
  assert.match(admin, /record\.cdnPosterUrl \|\| record\.cdnCoverUrl \|\| record\.providerPosterUrl/);
});

test("video output URLs never leak into image result fields", () => {
  assert.match(server, /function isGenerationImageOutputUrl\(value = ""\) \{[\s\S]*?!isLikelyVideoUrl\(url\)/);
  assert.match(server, /\.filter\(isGenerationImageOutputUrl\)/);
  assert.match(server, /isPublicHttpUrl\(item\) && isGenerationImageOutputUrl\(item\)/);
  assert.match(server, /\.filter\(isGenerationImageOutputUrl\)\)\];/);
});
