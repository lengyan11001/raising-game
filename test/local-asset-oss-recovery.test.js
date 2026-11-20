"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { readServerSource } = require("../server-source");

function extractFunction(source, name) {
  const asyncPrefix = `async function ${name}(`;
  const plainPrefix = `function ${name}(`;
  let start = source.indexOf(asyncPrefix);
  if (start === -1) start = source.indexOf(plainPrefix);
  assert.notEqual(start, -1, `missing function ${name}`);
  let parenDepth = 0;
  let bodyStart = -1;
  for (let index = source.indexOf("(", start); index < source.length; index += 1) {
    if (source[index] === "(") parenDepth += 1;
    else if (source[index] === ")") {
      parenDepth -= 1;
      if (parenDepth === 0) {
        bodyStart = source.indexOf("{", index);
        break;
      }
    }
  }
  assert.notEqual(bodyStart, -1, `missing body for ${name}`);
  let depth = 0;
  for (let index = bodyStart; index < source.length; index += 1) {
    if (source[index] === "{") depth += 1;
    else if (source[index] === "}") {
      depth -= 1;
      if (depth === 0) return source.slice(start, index + 1);
    }
  }
  throw new Error(`unterminated function ${name}`);
}

function advancedValidationError(code, message, details = {}) {
  return Object.assign(new Error(message), { code, details, statusCode: 400 });
}

function safePathWithin(root, target) {
  const relative = path.relative(root, target);
  if (!relative || (!relative.startsWith("..") && !path.isAbsolute(relative))) return target;
  return "";
}

test("a Seedance asset with an empty localUrl is restored from its OSS mirror", async (t) => {
  const source = readServerSource();
  const userUploadDir = await fs.mkdtemp(path.join(os.tmpdir(), "asset-oss-restore-"));
  t.after(() => fs.rm(userUploadDir, { recursive: true, force: true }));
  let persisted = null;
  let downloadedUrl = "";
  const imageExtFromMime = () => ".png";
  const storagePathSegment = (value, fallback) => String(value || fallback).replace(/[^a-z0-9._-]+/gi, "-");
  const restorablePublicUrlForUserAsset = () => "https://assets-cdn.example/signed/image.png";
  const localPathForUserAsset = new Function(
    "safeAssetPathFromUrl",
    "advancedValidationError",
    `return (${extractFunction(source, "localPathForUserAsset")});`,
  )(() => "", advancedValidationError);
  const restorableLocalPathForUserAsset = new Function(
    "path",
    "USER_UPLOAD_DIR",
    "imageExtFromMime",
    "videoExtFromMime",
    "audioExtFromMime",
    "storagePathSegment",
    "safePathWithin",
    "advancedValidationError",
    `return (${extractFunction(source, "restorableLocalPathForUserAsset")});`,
  )(path, userUploadDir, imageExtFromMime, () => ".mp4", () => ".mp3", storagePathSegment, safePathWithin, advancedValidationError);
  const restoredLocalUrlForUserAsset = new Function(
    "path",
    "USER_UPLOAD_DIR",
    "advancedValidationError",
    `return (${extractFunction(source, "restoredLocalUrlForUserAsset")});`,
  )(path, userUploadDir, advancedValidationError);
  const persistRestoredUserAssetMetadata = async (_db, asset) => {
    persisted = asset;
  };
  const ensureLocalUserAssetFile = new Function(
    "path",
    "fs",
    "localPathForUserAsset",
    "restorableLocalPathForUserAsset",
    "restoredLocalUrlForUserAsset",
    "missingUserAssetFileError",
    "restorablePublicUrlForUserAsset",
    "downloadRemoteFileToBuffer",
    "restoreLimitBytesForUserAsset",
    "persistRestoredUserAssetMetadata",
    `return (${extractFunction(source, "ensureLocalUserAssetFile")});`,
  )(
    path,
    fs,
    localPathForUserAsset,
    restorableLocalPathForUserAsset,
    restoredLocalUrlForUserAsset,
    () => advancedValidationError("ASSET_FILE_MISSING", "Asset source file is unavailable."),
    restorablePublicUrlForUserAsset,
    async (url) => {
      downloadedUrl = url;
      return { bytes: Buffer.from("image-bytes"), mime: "image/png" };
    },
    () => 1024,
    persistRestoredUserAssetMetadata,
  );

  const asset = {
    id: "asset-63ea8fca159e8e37c3e84f1c",
    userId: "user-1789207499148-734e3f44",
    mime: "image/png",
    localUrl: "",
    cdnUrl: "https://assets-cdn.123vips.com/seedance-assets/123vips/generated/images/img-20261118123847-d1a73c.png",
    publicUrl: "https://assets-cdn.123vips.com/seedance-assets/123vips/generated/images/img-20261118123847-d1a73c.png",
    objectStorageKey: "seedance-assets/123vips/generated/images/img-20261118123847-d1a73c.png",
  };

  const localPath = await ensureLocalUserAssetFile({ userAssets: [asset] }, asset, { label: "Seedance media asset" });

  assert.equal(downloadedUrl, "https://assets-cdn.example/signed/image.png");
  assert.match(asset.localUrl, /^\/assets\/user-uploads\/user-1789207499148-734e3f44\/asset-63ea8fca159e8e37c3e84f1c-restored\.png$/);
  assert.equal(await fs.readFile(localPath, "utf8"), "image-bytes");
  assert.equal(persisted, asset);
});
