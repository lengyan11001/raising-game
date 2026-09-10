"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const server = fs.readFileSync(path.resolve(__dirname, "..", "server.js"), "utf8");

function functionBody(name) {
  const start = server.indexOf(`async function ${name}(`);
  assert.notEqual(start, -1, `${name} should exist in server.js`);
  const next = server.indexOf("\nasync function ", start + 1);
  return server.slice(start, next === -1 ? server.length : next);
}

test("character reference rebuild restores a purged local upload instead of reading a dead path", () => {
  const body = functionBody("ensureCharacterReferenceForRecord");
  assert.match(body, /await ensureLocalAssetUrlFile\(sourceUrl, \{/);
  assert.match(body, /if \(!sourcePath\) throw missingUserAssetFileError\(record, "Character source image"\)/);
  assert.doesNotMatch(
    body,
    /const sourcePath = path\.join\(ROOT, sourceUrl\.replace\(\/\^\\\/\/, ""\)\)/,
    "the source image must not be read straight off disk; the 24h retention job removes it",
  );
});

test("missing user uploads are restored from the stored R2/CDN mirror", () => {
  const body = functionBody("ensureLocalAssetUrlFile");
  assert.match(body, /const stat = await fs\.stat\(localPath\)\.catch\(\(\) => null\)/);
  assert.match(body, /findRestorableUserAssetByLocalUrl\(value\)/);
  assert.match(body, /return ensureLocalUserAssetFile\(db, asset, \{ label, maxBytes, requireFile: false \}\)/);
});
