"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const test = require("node:test");
const { readServerSource } = require("../server-source");

function extractFunction(source, name) {
  const start = source.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `missing function ${name}`);
  const bodyStart = source.indexOf("{", start);
  let depth = 0;
  for (let index = bodyStart; index < source.length; index += 1) {
    if (source[index] === "{") depth += 1;
    if (source[index] === "}" && --depth === 0) return source.slice(start, index + 1);
  }
  throw new Error(`unterminated function ${name}`);
}

function loadNamingHelpers() {
  const source = readServerSource();
  const storagePathSegment = new Function(
    `return (${extractFunction(source, "storagePathSegment")});`,
  )();
  const compactStorageIdentifier = new Function(
    "crypto",
    "storagePathSegment",
    `return (${extractFunction(source, "compactStorageIdentifier")});`,
  )(crypto, storagePathSegment);
  const upstreamAssetName = new Function(
    "compactStorageIdentifier",
    `return (${extractFunction(source, "upstreamAssetName")});`,
  )(compactStorageIdentifier);
  const storageObjectName = new Function(
    "crypto",
    "storagePathSegment",
    "compactStorageIdentifier",
    "SITE_STORAGE_SLUG",
    "Date",
    `return (${extractFunction(source, "storageObjectName")});`,
  )(crypto, storagePathSegment, compactStorageIdentifier, "raising-game", { now: () => 1795165546599 });
  return { source, upstreamAssetName, storageObjectName };
}

test("long upstream asset names are converted to short stable identifiers", () => {
  const { upstreamAssetName } = loadNamingHelpers();
  const sourceName = "raising-game-gateway-asset-63ea8fca159e8e37c3e84f1c-1795165546599";
  const first = upstreamAssetName(sourceName, "reference");
  const second = upstreamAssetName(sourceName, "reference");
  assert.equal(first.length <= 64, true);
  assert.equal(first, second);
  assert.match(first, /^a-[a-f0-9]{16,}$/);
});

test("storage object names remain at most 64 characters with a compact hash", () => {
  const { storageObjectName } = loadNamingHelpers();
  const name = storageObjectName("gateway", "asset-63ea8fca159e8e37c3e84f1c");
  assert.equal(name.length <= 64, true);
  assert.match(name, /^raising-game-gateway-a-[a-f0-9]+-1795165546599$/);
});

test("every Ark and Ignex CreateAsset path caps the upstream Name", () => {
  const { source } = loadNamingHelpers();
  assert.match(source, /Name: storageObjectName\("gateway", name\)/);
  assert.match(source, /Name: storageObjectName\("home", item\.id\)/);
  assert.match(source, /Name: storageObjectName\("user", record\.id\)/);
  assert.match(source, /const assetName = upstreamAssetName\(body\.Name \|\| body\.name/);
  assert.match(source, /Name: upstreamAssetName\(name \|\| storageObjectName\("seedream5"/);
  assert.match(source, /const assetName = upstreamAssetName\(name, "reference-media"\)/);
  assert.match(source, /Name: assetName,[\s\S]*?ProjectName: IGNEX_PROJECT_NAME/);
});
