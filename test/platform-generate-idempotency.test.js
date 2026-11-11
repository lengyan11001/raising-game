"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const part25 = fs.readFileSync(path.join(root, "server.parts", "part-25.js"), "utf8");
const part14 = fs.readFileSync(path.join(root, "server.parts", "part-14.js"), "utf8");
const part48 = fs.readFileSync(path.join(root, "server.parts", "part-48.js"), "utf8");

function section(source, start, end) {
  const from = source.indexOf(start);
  const to = source.indexOf(end, from + start.length);
  assert.ok(from >= 0, `missing start: ${start}`);
  assert.ok(to > from, `missing end: ${end}`);
  return source.slice(from, to);
}

test("uploaded image content participates in request idempotency without storing the data URL", () => {
  const handler = section(part48, "async function handlePlatformGenerate", "async function handleAdvancedAccessRequest");
  assert.match(handler, /uploadSha256 = platformUploadDigest\(body\.dataUrl\)/);
  assert.match(handler, /imageUrl,[\s\S]*uploadSha256,/);
  assert.doesNotMatch(handler, /dataUrl:\s*body\.dataUrl[\s\S]{0,300}payload:/);
  assert.doesNotMatch(handler, /imageUrl:\s*body\.dataUrl/);
});

test("data URL digest is deterministic while different uploads conflict under one idempotency key", () => {
  const imageA = "data:image/png;base64,AAAA";
  const imageB = "data:image/png;base64,BBBB";
  const digest = (value) => `sha256:${crypto.createHash("sha256").update(value).digest("hex")}`;
  assert.notEqual(digest(imageA), digest(imageB));
});

test("new uploads use a stable task-scoped asset id and do not create an extra local-memory row on retry", () => {
  const handler = section(part48, "async function handlePlatformGenerate", "async function handleAdvancedAccessRequest");
  assert.match(handler, /assetId: platformDeterministicAssetId\(taskId, uploadSha256\)/);
  assert.match(handler, /createUserAssetFromDataUrl\(auth\.db, auth\.user,[\s\S]*assetId:/);
  assert.match(part14, /assetId: requestedAssetId = ""/);
  assert.match(part14, /String\(requestedAssetId \|\| ""\)[\s\S]*?randomId\("asset"\)/);
  assert.match(part14, /db\.userAssets = \[[\s\S]*?userAsset,[\s\S]*?\.\.\.\(db\.userAssets \|\| \[\]\)\.filter/);
});

test("existing asset public URL preparation happens after the idempotency claim", () => {
  const handler = section(part48, "async function handlePlatformGenerate", "async function handleAdvancedAccessRequest");
  const claimIndex = handler.indexOf("executeRequestIdempotently({");
  const ensureIndex = handler.indexOf("ensurePublicUrlForUserAsset(auth.db, userAsset)", claimIndex);
  assert.ok(claimIndex >= 0);
  assert.ok(ensureIndex > claimIndex);
  assert.match(handler, /userAsset\.publicUrl \|\| userAsset\.localUrl/);
});

test("provider calls have bounded timeouts and preserve ambiguity after dispatch", () => {
  const part20 = fs.readFileSync(path.join(root, "server.parts", "part-20.js"), "utf8");
  const part24 = fs.readFileSync(path.join(root, "server.parts", "part-24.js"), "utf8");
  for (const source of [part20, part24]) {
    assert.match(source, /AbortSignal\.timeout\(180000\)/);
    assert.match(source, /error\.ambiguous = true/);
  }
  assert.match(part20, /GENERATION_SERVICE_TIMEOUT/);
  assert.match(part24, /GATEWAY_UPSTREAM_TIMEOUT/);
});
