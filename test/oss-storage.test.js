"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const {
  assertOssCdnRegionAllowed,
  ossConfig,
  ossConfigured,
  ossEndpointRegion,
  ossRegionAllowed,
  publicUrlForKey,
  signedDownloadUrl,
  signedCdnUrl,
} = require("../oss-storage");
const { readServerSource } = require("../server-source");

const root = path.resolve(__dirname, "..");
const server = readServerSource();
const deploy = fs.readFileSync(path.join(root, "scripts", "deploy_site.py"), "utf8");
const envExample = fs.readFileSync(path.join(root, ".env.example"), "utf8");

function ossEnv(overrides = {}) {
  return {
    STORAGE_PROVIDER: "oss",
    OSS_REGION: "oss-ap-southeast-1",
    OSS_ENDPOINT: "https://oss-ap-southeast-1.aliyuncs.com",
    OSS_BUCKET: "vipeak-media-sg",
    OSS_ACCESS_KEY_ID: "test-access-key",
    OSS_ACCESS_KEY_SECRET: "test-secret",
    OSS_CDN_REGION: "oss-ap-southeast-1",
    OSS_CDN_BASE_URL: "https://assets-cdn.123vips.com",
    ...overrides,
  };
}

test("OSS accepts only Singapore and US regions", () => {
  assert.equal(ossRegionAllowed("oss-ap-southeast-1"), true);
  assert.equal(ossRegionAllowed("oss-us-west-1"), true);
  assert.equal(ossRegionAllowed("oss-us-east-1"), true);
  assert.equal(ossRegionAllowed("oss-cn-hangzhou"), false);
  assert.equal(ossEndpointRegion("https://oss-cn-hangzhou.aliyuncs.com"), "oss-cn-hangzhou");
  assert.equal(ossEndpointRegion("https://oss-ap-southeast-1.aliyuncs.com"), "oss-ap-southeast-1");
});

test("OSS config rejects mainland regions and endpoints", () => {
  assert.throws(
    () => ossConfig(ossEnv({ OSS_REGION: "oss-cn-shanghai", OSS_ENDPOINT: "https://oss-cn-shanghai.aliyuncs.com" })),
    (error) => error.code === "OSS_REGION_NOT_ALLOWED",
  );
  assert.throws(
    () => ossConfig(ossEnv({ OSS_ENDPOINT: "https://oss-cn-hangzhou.aliyuncs.com" })),
    (error) => error.code === "OSS_ENDPOINT_NOT_ALLOWED",
  );
  assert.throws(
    () => ossConfig(ossEnv({ OSS_CDN_REGION: "oss-cn-shanghai" })),
    (error) => error.code === "OSS_CDN_REGION_NOT_ALLOWED",
  );
  assert.throws(
    () => ossConfig(ossEnv({ OSS_CDN_REGION: "oss-us-west-1" })),
    (error) => error.code === "OSS_CDN_REGION_MISMATCH",
  );
  assert.throws(
    () => ossConfig(ossEnv({ OSS_CDN_BASE_URL: "https://oss-cn-hangzhou.aliyuncs.com" })),
    (error) => error.code === "OSS_CDN_BASE_URL_NOT_ALLOWED",
  );
});

test("explicit OSS selection requires complete configuration", () => {
  const incomplete = ossConfig(ossEnv({ STORAGE_PROVIDER: "auto", OSS_BUCKET: "" }));
  assert.equal(ossConfigured(incomplete), false);
  assert.throws(
    () => ossConfig(ossEnv({ OSS_BUCKET: "" })),
    (error) => error.code === "OSS_NOT_CONFIGURED",
  );
  assert.match(server, /STORAGE_PROVIDER=oss requires complete OSS configuration/);
  assert.doesNotMatch(server, /if \(requested === "oss"\) return OSS_STORAGE_ENABLED \? "oss" : ""/);
});

test("OSS public and signed URLs use the configured CDN and endpoint", () => {
  const config = ossConfig(ossEnv({ OSS_FORCE_PATH_STYLE: "1" }));
  assert.equal(config.cdnRegion, "oss-ap-southeast-1");
  assert.equal(config.forcePathStyle, false);
  assert.equal(
    publicUrlForKey("generated/videos/demo.mp4", config),
    "https://assets-cdn.123vips.com/generated/videos/demo.mp4",
  );
  const originSigned = new URL(signedDownloadUrl({
    key: "generated/videos/demo.mp4",
    fileName: "演示 视频.mp4",
    contentType: "video/mp4",
    config,
  }));
  assert.equal(originSigned.hostname, "vipeak-media-sg.oss-ap-southeast-1.aliyuncs.com");
  const signed = new URL(signedCdnUrl({
    key: "generated/videos/demo.mp4",
    fileName: "演示 视频.mp4",
    contentType: "video/mp4",
    download: true,
    config,
  }));
  assert.equal(signed.hostname, "assets-cdn.123vips.com");
  assert.equal(signed.pathname, "/generated/videos/demo.mp4");
  assert.equal(signed.searchParams.get("OSSAccessKeyId"), "test-access-key");
  assert.ok(signed.searchParams.get("Signature"));
  assert.ok(signed.searchParams.get("Expires"));
  assert.doesNotMatch(signed.toString(), /aliyuncs\.com/i);
  assert.match(signed.searchParams.get("response-content-disposition"), /filename\*=UTF-8''/);
  // OSS V1 signs the response override subresource only when present. An
  // inline URL must not reuse the download signature after deleting it.
  const inline = new URL(signedCdnUrl({ key: "generated/videos/demo.mp4", config }));
  assert.equal(inline.hostname, "assets-cdn.123vips.com");
  assert.equal(inline.searchParams.has("response-content-disposition"), false);
  assert.ok(inline.searchParams.get("Signature"));
});

test("private OSS origin URLs are converted to signed CDN delivery URLs", () => {
  const previous = {
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
  const virtual = new URL(isolatedServer.signedOssCdnUrlForDelivery(
    "https://vipeak-media-sg.oss-ap-southeast-1.aliyuncs.com/generated/videos/virtual.mp4",
  ));
  assert.equal(virtual.hostname, "assets-cdn.123vips.com");
  assert.equal(virtual.pathname, "/generated/videos/virtual.mp4");
  assert.equal(virtual.searchParams.get("OSSAccessKeyId"), "test-access-key");
  assert.ok(virtual.searchParams.get("Signature"));
  assert.doesNotMatch(virtual.toString(), /aliyuncs\.com/i);

  const pathStyle = new URL(isolatedServer.signedOssCdnUrlForDelivery(
    "https://oss-ap-southeast-1.aliyuncs.com/vipeak-media-sg/generated/videos/path.mp4",
  ));
  assert.equal(pathStyle.hostname, "assets-cdn.123vips.com");
  assert.equal(pathStyle.pathname, "/generated/videos/path.mp4");
  assert.ok(pathStyle.searchParams.get("Signature"));

  const publicRecord = isolatedServer.publicGenerationRecord({
    taskId: "oss-origin",
    status: "succeeded",
    cdnVideoUrl: "https://vipeak-media-sg.oss-ap-southeast-1.aliyuncs.com/generated/videos/virtual.mp4",
    cdnPosterUrl: "https://vipeak-media-sg.oss-ap-southeast-1.aliyuncs.com/generated/posters/virtual.jpg",
    cdnImageUrls: [
      "https://vipeak-media-sg.oss-ap-southeast-1.aliyuncs.com/generated/images/one.png",
      "https://vipeak-media-sg.oss-ap-southeast-1.aliyuncs.com/generated/images/two.png",
    ],
  });
  assert.equal(new URL(publicRecord.videoUrl).hostname, "assets-cdn.123vips.com");
  assert.equal(new URL(publicRecord.cdnVideoUrl).hostname, "assets-cdn.123vips.com");
  assert.equal(new URL(publicRecord.cdnPosterUrl).hostname, "assets-cdn.123vips.com");
  assert.deepEqual(publicRecord.cdnImageUrls.map((url) => new URL(url).pathname), [
    "/generated/images/one.png",
    "/generated/images/two.png",
  ]);
  assert.ok(publicRecord.cdnImageUrls.every((url) => new URL(url).searchParams.get("Signature")));
  assert.doesNotMatch(JSON.stringify(publicRecord), /aliyuncs\.com/i);

  for (const [name, value] of Object.entries(previous)) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
});

test("provider routing keeps historical R2 and OSS downloads separate", () => {
  assert.match(server, /function objectStorageKeyFromPublicUrl/);
  assert.match(server, /function inferObjectStorageProviderFromUrl/);
  assert.match(server, /function objectStorageDownloadKey/);
  assert.match(server, /const urlProvider = inferObjectStorageProviderFromUrl\(target\.objectStorageUrl\)/);
  assert.match(server, /storage\.provider === "r2" && storage\.key/);
  assert.match(server, /storage\.provider === "oss" && storage\.key/);
  assert.match(server, /hostname === `\$\{bucket\}\.\$\{ossOriginSuffix\}`/);
  assert.match(server, /hostname === ossOriginSuffix && parsed\.pathname\.toLowerCase\(\)\.startsWith\(`\/\$\{bucket\}\/`\)/);
  assert.match(server, /signedOssCdnUrlForDelivery\(cdnUrl/);
  assert.match(server, /!OSS_STORAGE_ENABLED[\s\S]*?R2\.publicDomain/);
  assert.match(server, /makeOssSignedCdnUrl\(\{/);
  assert.doesNotMatch(server, /storage\.provider === "oss" && storage\.key[\s\S]{0,240}makeOssSignedDownloadUrl\(/);
});

test("deployment and env template reject mainland OSS settings", () => {
  assert.match(envExample, /Never use oss-cn-\*/);
  assert.match(envExample, /OSS_REGION=oss-ap-southeast-1/);
  assert.match(envExample, /OSS_ENDPOINT=https:\/\/oss-ap-southeast-1\.aliyuncs\.com/);
  assert.match(envExample, /OSS_CDN_BASE_URL=/);
  assert.match(envExample, /OSS_CDN_REGION=oss-ap-southeast-1/);
  assert.match(envExample, /STORAGE_PROVIDER=auto/);
  assert.ok(deploy.includes('OSS_REGION=\\"?oss-cn-'));
  assert.ok(deploy.includes('OSS_ENDPOINT=\\"?https?://[^/]*oss-cn-'));
});
