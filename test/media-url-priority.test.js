"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const server = fs.readFileSync(path.resolve(__dirname, "..", "server.js"), "utf8");
const admin = fs.readFileSync(path.resolve(__dirname, "..", "admin.js"), "utf8");
const app = fs.readFileSync(path.resolve(__dirname, "..", "app.js"), "utf8");

test("generation record previews prefer R2, then upstream, then local media", () => {
  assert.match(server, /return cdnUrl \|\| providerUrl \|\| localUrl/);
  assert.match(admin, /record\.cdnVideoUrl \|\|\s*record\.remoteVideoUrl \|\|\s*record\.providerVideoUrl/);
  assert.match(app, /record\?\.cdnVideoUrl \|\|\s*record\?\.remoteVideoUrl \|\|\s*record\?\.providerVideoUrl/);
});

test("image and poster previews also prefer stored R2 URLs", () => {
  assert.match(server, /record\.cdnImageUrl \|\|[\s\S]*record\.remoteImageUrl/);
  assert.match(server, /record\.cdnPosterUrl \|\| providerPosterUrl \|\| record\.localPosterUrl/);
  assert.match(admin, /record\.cdnImageUrl \|\| record\.remoteImageUrl/);
  assert.match(admin, /record\.cdnPosterUrl \|\| record\.cdnCoverUrl \|\| record\.providerPosterUrl/);
});
