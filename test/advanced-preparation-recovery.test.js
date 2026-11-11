"use strict";

const assert = require("node:assert/strict");
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

const previousEnv = {
  STORAGE_PROVIDER: process.env.STORAGE_PROVIDER,
  OSS_REGION: process.env.OSS_REGION,
  OSS_ENDPOINT: process.env.OSS_ENDPOINT,
  OSS_BUCKET: process.env.OSS_BUCKET,
  OSS_ACCESS_KEY_ID: process.env.OSS_ACCESS_KEY_ID,
  OSS_ACCESS_KEY_SECRET: process.env.OSS_ACCESS_KEY_SECRET,
  OSS_CDN_REGION: process.env.OSS_CDN_REGION,
  OSS_CDN_BASE_URL: process.env.OSS_CDN_BASE_URL,
};
Object.assign(process.env, {
  STORAGE_PROVIDER: "oss",
  OSS_REGION: "oss-ap-southeast-1",
  OSS_ENDPOINT: "https://oss-ap-southeast-1.aliyuncs.com",
  OSS_BUCKET: "vipeak-media-sg",
  OSS_ACCESS_KEY_ID: "test-access-key",
  OSS_ACCESS_KEY_SECRET: "test-secret",
  OSS_CDN_REGION: "oss-ap-southeast-1",
  OSS_CDN_BASE_URL: "https://assets-cdn.123vips.com",
});

const isolatedServer = require("../server");
const source = readServerSource();
const firstPresent = (...values) => values.find((value) => value !== undefined && value !== null && value !== "");
const isPublicHttpUrl = (value) => {
  try {
    return ["http:", "https:"].includes(new URL(String(value)).protocol);
  } catch {
    return false;
  }
};
const inferObjectStorageProviderFromUrl = (value) => {
  try {
    const url = new URL(String(value));
    if (url.hostname === "assets-cdn.123vips.com") return "oss";
    if (url.hostname.endsWith("r2.cloudflarestorage.com") || url.hostname === "media.123vips.com") return "r2";
  } catch {}
  return "";
};

const restorablePublicUrlForUserAsset = new Function(
  "firstPresent",
  "isPublicHttpUrl",
  "signedOssCdnUrlForDelivery",
  "inferObjectStorageProviderFromUrl",
  `return (${extractFunction(source, "restorablePublicUrlForUserAsset")});`,
)(firstPresent, isPublicHttpUrl, isolatedServer.signedOssCdnUrlForDelivery, inferObjectStorageProviderFromUrl);

const ensurePublicUrlForUserAsset = new Function(
  "firstPresent",
  "isPublicHttpUrl",
  "signedOssCdnUrlForUpstream",
  "objectStorageEnabled",
  "userAssetHasConfiguredObjectStorageMirror",
  "publicUrlForAssetPath",
  "dbEnabled",
  "upsertUserAssetInDb",
  "writeDb",
  "readLocalUserAssetBytes",
  "restoreLimitBytesForUserAsset",
  "uploadBufferToR2",
  `return (${extractFunction(source, "ensurePublicUrlForUserAsset")});`,
)(
  firstPresent,
  isPublicHttpUrl,
  isolatedServer.signedOssCdnUrlForUpstream,
  () => true,
  () => true,
  () => "",
  () => false,
  async () => {},
  async () => {},
  async () => { throw new Error("unexpected local read"); },
  () => 0,
  async () => { throw new Error("unexpected upload"); },
);

test.after(() => {
  for (const [name, value] of Object.entries(previousEnv)) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
});

test("restoring a purged local upload signs a private OSS CDN URL", () => {
  const asset = {
    id: "asset-1",
    cdnUrl: "https://assets-cdn.123vips.com/assets/user-uploads/user-1/asset-1.png",
  };
  const restored = new URL(restorablePublicUrlForUserAsset(asset));
  assert.equal(restored.hostname, "assets-cdn.123vips.com");
  assert.equal(restored.pathname, "/assets/user-uploads/user-1/asset-1.png");
  assert.equal(restored.searchParams.get("OSSAccessKeyId"), "test-access-key");
  assert.ok(restored.searchParams.get("Signature"));
  assert.ok(restored.searchParams.get("Expires"));
  assert.equal(asset.cdnUrl, "https://assets-cdn.123vips.com/assets/user-uploads/user-1/asset-1.png");
});

test("historical R2 URLs are never rewritten with OSS credentials", () => {
  const value = "https://media.123vips.com/assets/user-uploads/user-1/asset-1.png";
  assert.equal(restorablePublicUrlForUserAsset({ publicUrl: value }), value);
});

test("delivery signing returns a copy so PostgreSQL keeps the canonical URL", async () => {
  const asset = {
    id: "asset-1",
    localUrl: "/assets/user-uploads/user-1/asset-1.png",
    publicUrl: "https://assets-cdn.123vips.com/assets/user-uploads/user-1/asset-1.png",
  };
  const delivered = await ensurePublicUrlForUserAsset({ userAssets: [asset] }, asset);
  assert.notEqual(delivered, asset);
  assert.equal(new URL(delivered.publicUrl).searchParams.get("OSSAccessKeyId"), "test-access-key");
  assert.equal(asset.publicUrl, "https://assets-cdn.123vips.com/assets/user-uploads/user-1/asset-1.png");
});

test("all media preparation before billing is recorded as a free failed generation", () => {
  const start = source.indexOf('  try {\n  if (provider === "seedance") {');
  const end = source.indexOf('let wan27MediaMode = "";', start);
  assert.ok(start > 0 && end > start);
  const preparation = source.slice(start, end);
  assert.match(preparation, /^\s*try \{/);
  assert.match(preparation, /createSingleSeedanceImageAssetFromInput/);
  assert.match(preparation, /createUserImageAssetsFromInputs/);
  assert.match(preparation, /createUserWanMediaAssetFromDataUrl/);
  assert.match(preparation, /recordAdvancedPreparationFailure/);
  assert.match(preparation, /code: error\.code \|\| "MEDIA_PREPARATION_FAILED"/);
  assert.doesNotMatch(preparation, /sendReferenceAssetNotFound\(/);
  assert.doesNotMatch(preparation, /sendAdvancedValidationError\(/);
});

test("advanced request validation failures are persisted with a taskId and never charged", () => {
  const sendAdvancedRequestFailure = new Function(
    "recordAdvancedPreparationFailure",
    "sendJson",
    `return (${extractFunction(source, "sendAdvancedRequestFailure")});`,
  )(
    async (req, res, auth, { error }) => ({
      taskId: "cgt-validation-test",
      message: error.message,
      statusCode: error.statusCode || 400,
    }),
    (res, statusCode, payload) => ({ statusCode, payload }),
  );
  return sendAdvancedRequestFailure({}, {}, { user: { id: "user-1" } }, {
    provider: "seedance",
    error: Object.assign(new Error("Seedance content is invalid."), {
      code: "INVALID_SEEDANCE_CONTENT",
      statusCode: 400,
    }),
  }).then((response) => {
    assert.equal(response.statusCode, 400);
    assert.equal(response.payload.taskId, "cgt-validation-test");
    assert.equal(response.payload.code, "INVALID_SEEDANCE_CONTENT");
    assert.equal(response.payload.message, "Seedance content is invalid.");
  });
});

test("preparation failures are persisted without charging credits", () => {
  const recordAdvancedPreparationFailure = new Function(
    "advancedPreparationErrorMessage",
    "localGenerationTaskId",
    "upsertGenerationRecord",
    "publicModelText",
    "firstPresent",
    `return (${extractFunction(source, "recordAdvancedPreparationFailure")});`,
  )(
    (error) => error.message,
    () => "cgt-test",
    async (record) => record,
    (value) => value,
    firstPresent,
  );
  const failed = recordAdvancedPreparationFailure({}, {}, { user: { id: "user-1" }, tokenRecord: null }, {
    provider: "seedance",
    requestParams: { model: "seedance-2.0" },
    error: Object.assign(new Error("Failed to download Upstream reference image: 403"), {
      code: "INVALID_REMOTE_MEDIA",
      statusCode: 400,
    }),
  });
  return failed.then((result) => {
    assert.equal(result.taskId, "cgt-test");
    assert.equal(result.record.status, "failed");
    assert.equal(result.record.failureStage, "preparation");
    assert.equal(result.record.billingStatus, "free");
    assert.equal(result.record.preDeductedCredits, 0);
    assert.equal(result.record.finalCredits, 0);
    assert.equal(result.statusCode, 400);
  });
});

test("public media ingest refreshes an expired OSS signature before download", async () => {
  const canonical = (value) => String(value || "").replace(/\?.*$/, "");
  const existingAsset = {
    id: "asset-existing",
    userId: "user-1",
    sourceUrl: "https://assets-cdn.123vips.com/assets/user-uploads/user-1/reference.png",
  };
  const downloadCalls = [];
  const createUserMediaAssetFromPublicUrl = new Function(
    "path",
    "isPublicHttpUrl",
    "canonicalOssStorageUrlForCache",
    "findUserAssetBySourceUrl",
    "isSoftDeleted",
    "isAutoPresetReferenceAsset",
    "refreshSeedancePresetVideoAssetFromSourceIfNeeded",
    "dbEnabled",
    "upsertUserAssetInDb",
    "writeDb",
    "publicHttpUrlForUpstream",
    "downloadRemoteFileToBuffer",
    "imageMimeFromKnownPath",
    "videoMimeFromKnownPath",
    "audioMimeFromKnownPath",
    "createUserMediaAssetFromBytes",
    "normalizedAssetSourceUrl",
    "userMediaUploadLimits",
    `return (${extractFunction(source, "createUserMediaAssetFromPublicUrl")});`,
  )(
    require("node:path"),
    (value) => { try { return ["http:", "https:"].includes(new URL(String(value)).protocol); } catch { return false; } },
    canonical,
    (db, user, sourceUrl) => (db.userAssets || []).find((asset) => (
      asset?.userId === user.id && canonical(asset.sourceUrl) === canonical(sourceUrl)
    )) || null,
    () => false,
    () => true,
    async (db, asset) => asset,
    () => false,
    async () => {},
    async () => {},
    (value) => {
      const url = new URL(canonical(value));
      if (url.hostname !== "assets-cdn.123vips.com") return String(value || "");
      url.searchParams.set("OSSAccessKeyId", "test-access-key");
      url.searchParams.set("Expires", "9999999999");
      url.searchParams.set("Signature", "fresh-signature");
      return url.toString();
    },
    async (url) => {
      downloadCalls.push(url);
      return { bytes: Buffer.from("png"), mime: "image/png" };
    },
    () => "image/png",
    () => "",
    () => "",
    async () => ({ id: "asset-created", userId: "user-1" }),
    (value) => String(value || ""),
    () => ({ image: 8 * 1024 * 1024, video: 32 * 1024 * 1024, audio: 16 * 1024 * 1024 }),
  );

  const db = { userAssets: [existingAsset] };
  const user = { id: "user-1" };
  const existing = await createUserMediaAssetFromPublicUrl(db, user, {
    url: "https://assets-cdn.123vips.com/assets/user-uploads/user-1/reference.png?Expires=1&OSSAccessKeyId=old&Signature=expired",
  });
  assert.equal(existing, existingAsset, "the same durable OSS object must reuse the existing asset");
  assert.equal(downloadCalls.length, 0);

  const created = await createUserMediaAssetFromPublicUrl(db, user, {
    url: "https://assets-cdn.123vips.com/assets/user-uploads/user-1/new-reference.png?Expires=1&OSSAccessKeyId=old&Signature=expired",
  });
  db.userAssets.push(created);
  assert.equal(created.id, "asset-created");
  assert.equal(downloadCalls.length, 1);
  const downloaded = new URL(downloadCalls[0]);
  assert.equal(downloaded.hostname, "assets-cdn.123vips.com");
  assert.equal(downloaded.pathname, "/assets/user-uploads/user-1/new-reference.png");
  assert.notEqual(downloaded.searchParams.get("Signature"), "expired");
  assert.equal(created.sourceUrl, "https://assets-cdn.123vips.com/assets/user-uploads/user-1/new-reference.png");

  const externalUrl = "https://cdn.example.com/assets/external.png";
  await createUserMediaAssetFromPublicUrl(db, user, { url: `${externalUrl}?token=keep` });
  assert.equal(downloadCalls[1], `${externalUrl}?token=keep`, "external public URLs must remain byte-for-byte unchanged");
});
