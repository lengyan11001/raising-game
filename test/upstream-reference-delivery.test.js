"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

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

const application = require("../server");

test("upstream reference URLs prefer the configured OSS CDN over the protected application origin", () => {
  const deliveryUrl = application.publicUrlForLocalAsset({
    localUrl: "/assets/user-uploads/user-1/reference.png",
    publicUrl: "https://assets-cdn.123vips.com/seedance-assets/123vips/users/user-1/reference-normalized.png",
    objectStorageKey: "seedance-assets/123vips/users/user-1/reference-normalized.png",
    r2Key: "seedance-assets/123vips/users/user-1/reference-normalized.png",
  });

  const parsed = new URL(deliveryUrl);
  assert.equal(parsed.hostname, "assets-cdn.123vips.com");
  assert.equal(parsed.pathname, "/seedance-assets/123vips/users/user-1/reference-normalized.png");
  assert.equal(parsed.searchParams.get("OSSAccessKeyId"), "test-access-key");
  assert.ok(parsed.searchParams.get("Signature"));
  assert.ok(Number(parsed.searchParams.get("Expires")) > Math.floor(Date.now() / 1000));
});

test("upstream reference URLs fall back to the signed application origin only without an object mirror", () => {
  process.env.MEDIA_URL_SIGNING_SECRET = "test-media-signing-secret";
  const deliveryUrl = application.publicUrlForLocalAsset({
    localUrl: "/assets/user-uploads/user-1/reference.png",
  });
  const parsed = new URL(deliveryUrl);
  assert.equal(parsed.hostname, "123vips.com");
  assert.equal(parsed.pathname, "/assets/user-uploads/user-1/reference.png");
  assert.ok(parsed.searchParams.get("expires"));
  assert.ok(parsed.searchParams.get("signature"));
});
