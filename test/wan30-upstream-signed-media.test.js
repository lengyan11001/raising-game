"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { readServerSource } = require("../server-source");

function extractFunction(source, name) {
  let start = source.indexOf(`function ${name}(`);
  if (start === -1) throw new Error(`missing function ${name}`);
  if (source.slice(Math.max(0, start - 6), start) === "async ") start -= 6;
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
  if (bodyStart === -1) throw new Error(`missing body for ${name}`);
  let depth = 0;
  for (let index = bodyStart; index < source.length; index += 1) {
    const char = source[index];
    if (char === "{") depth += 1;
    else if (char === "}") {
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
const serverSource = readServerSource();
const signedWan30MediaForUpstream = new Function(
  "signedOssCdnUrlForDelivery",
  `return (${extractFunction(serverSource, "signedWan30MediaForUpstream")});`,
)(isolatedServer.signedOssCdnUrlForDelivery);

test.after(() => {
  for (const [name, value] of Object.entries(previousEnv)) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
});

test("Wan 3.0 signs private OSS CDN media at the upstream submission boundary", () => {
  const unsignedUrl = "https://assets-cdn.123vips.com/assets/user-uploads/user-1/asset-1.png";
  const media = [
    { type: "reference_image", url: unsignedUrl, reference_voice: "voice-1" },
    { type: "reference_image", url: "https://cdn.example.com/public.png" },
  ];

  const signed = signedWan30MediaForUpstream(media);
  const signedUrl = new URL(signed[0].url);
  assert.equal(signedUrl.protocol, "https:");
  assert.equal(signedUrl.hostname, "assets-cdn.123vips.com");
  assert.equal(signedUrl.pathname, "/assets/user-uploads/user-1/asset-1.png");
  assert.equal(signedUrl.searchParams.get("OSSAccessKeyId"), "test-access-key");
  assert.ok(signedUrl.searchParams.get("Signature"));
  assert.ok(signedUrl.searchParams.get("Expires"));
  assert.equal(signed[0].type, "reference_image");
  assert.equal(signed[0].reference_voice, "voice-1");

  // External public media must remain untouched, and the caller's array must
  // not be mutated while constructing the upstream payload.
  assert.equal(signed[1].url, "https://cdn.example.com/public.png");
  assert.equal(media[0].url, unsignedUrl);
});

test("Wan 3.0 submission sends the signed media to both routing and Alibaba payloads", () => {
  const submitStart = serverSource.indexOf("async function submitAliyunVideoTask");
  const submitEnd = serverSource.indexOf("\nasync function ", submitStart + 1);
  const submitSource = serverSource.slice(submitStart, submitEnd === -1 ? undefined : submitEnd);
  assert.match(
    submitSource,
    /const upstreamMedia = isWan30Capability \? signedWan30MediaForUpstream\(normalizedMedia\) : normalizedMedia;/,
  );
  assert.match(submitSource, /buildAliyunVideoRequest\(\{[\s\S]*?media: upstreamMedia,/);
  assert.match(submitSource, /mulerouterAliyun\.decideVideo\(\{[\s\S]*?media: upstreamMedia,/);
});

test("Seedance gateway reference helpers refresh OSS signatures at the final boundary", () => {
  const referenceSource = extractFunction(serverSource, "gatewaySeedanceReferenceFromUri");
  const videoSource = extractFunction(serverSource, "gatewaySeedanceVideoUrlFromUri");
  assert.match(referenceSource, /publicHttpUrlForUpstream\(value\) \|\| gatewayAbsoluteAssetUrl\(value\)/);
  assert.match(videoSource, /publicHttpUrlForUpstream\(value\) \|\| gatewayAbsoluteAssetUrl\(value\)/);
});
