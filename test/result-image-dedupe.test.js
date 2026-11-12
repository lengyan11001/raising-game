"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const application = require("../server");

const root = path.resolve(__dirname, "..");
const source = fs.readFileSync(path.join(root, "platform.ui.parts", "part-02.js"), "utf8");

function extractFunction(name) {
  const start = source.indexOf(`function ${name}(`);
  if (start === -1) throw new Error(`missing function ${name}`);
  const bodyStart = source.indexOf("{", source.indexOf(")", start));
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

function resultUrls(record) {
  const helpers = [
    "isGenerationImageOutputUrl",
    "generationImageResultUrl",
    "generationImageResultObjectKey",
    "generationImageResultUrls",
  ].map(extractFunction).join("\n");
  const context = { URL };
  vm.runInNewContext(`${helpers}\nthis.resultUrls = generationImageResultUrls;`, context);
  return Array.from(context.resultUrls(record));
}

test("result image URLs dedupe signed aliases of the same media object", () => {
  const urls = resultUrls({
    cdnImageUrls: [
      "https://assets-cdn.123vips.com/generated/result.jpg?Expires=1&Signature=old",
    ],
    imageResultUrls: [
      "https://vipeak-media-sg.oss-ap-southeast-1.aliyuncs.com/generated/result.jpg?Expires=2&Signature=new",
    ],
    localImageUrls: [
      "/generated/result.jpg?Expires=3&Signature=local",
    ],
    imageResultUrl: "/generated/result.jpg",
  });
  assert.deepEqual(urls, [
    "https://assets-cdn.123vips.com/generated/result.jpg?Expires=1&Signature=old",
  ]);
});

test("durable image output suppresses a different-path provider fallback", () => {
  const urls = resultUrls({
    cdnImageUrl: "https://assets-cdn.123vips.com/seedance-assets/123vips/generated/images/img-20261111005109-24948d.png",
    cdnImageUrls: [],
    imageResultUrl: "https://assets-cdn.123vips.com/seedance-assets/123vips/generated/images/img-20261111005109-24948d.png",
    imageResultUrls: [
      "https://assets-cdn.123vips.com/seedance-assets/123vips/generated/images/img-20261111005109-24948d.png",
    ],
    providerImageUrl: "https://usercontent1.carrothub.ai/public/artifacts/d222e742-7568-4b6c-a67c-33fb962eeb03/output_00.png",
    providerImageUrls: [
      "https://usercontent1.carrothub.ai/public/artifacts/d222e742-7568-4b6c-a67c-33fb962eeb03/output_00.png",
    ],
    remoteImageUrl: "https://usercontent1.carrothub.ai/public/artifacts/d222e742-7568-4b6c-a67c-33fb962eeb03/output_00.png",
    remoteImageUrls: [
      "https://usercontent1.carrothub.ai/public/artifacts/d222e742-7568-4b6c-a67c-33fb962eeb03/output_00.png",
    ],
  });
  assert.deepEqual(urls, [
    "https://assets-cdn.123vips.com/seedance-assets/123vips/generated/images/img-20261111005109-24948d.png",
  ]);
});

test("public record uses a singular durable image instead of provider fallback", () => {
  const durable = "https://assets-cdn.123vips.com/seedance-assets/123vips/generated/images/img-20261111005109-24948d.png";
  const provider = "https://usercontent1.carrothub.ai/public/artifacts/d222e742-7568-4b6c-a67c-33fb962eeb03/output_00.png";
  const record = application.publicGenerationRecord({
    taskId: "img-20261111005109-24948d",
    status: "succeeded",
    kind: "asset-image",
    source: "asset-image-modify",
    provider: "aliyun-wan27-image",
    cdnImageUrl: durable,
    imageResultUrl: durable,
    cdnImageUrls: [],
    remoteImageUrl: provider,
    remoteImageUrls: [provider],
  });
  assert.deepEqual(record.imageResultUrls, [durable]);
  assert.equal(record.imageResultUrl, durable);
});

test("distinct result images survive dedupe and preserve field order", () => {
  const urls = resultUrls({
    cdnImageUrls: [
      "https://assets-cdn.123vips.com/generated/first.jpg?Expires=1&Signature=a",
      "https://assets-cdn.123vips.com/generated/second.jpg?Expires=1&Signature=b",
    ],
    imageResultUrls: [
      "https://vipeak-media-sg.oss-ap-southeast-1.aliyuncs.com/generated/first.jpg?Expires=2&Signature=c",
      "/generated/third.jpg?Expires=2&Signature=d",
    ],
  });
  assert.deepEqual(urls.map((url) => new URL(url, "https://123vips.com").pathname), [
    "/generated/first.jpg",
    "/generated/second.jpg",
    "/generated/third.jpg",
  ]);
});
