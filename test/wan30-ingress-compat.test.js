"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const server = fs.readFileSync(path.resolve(__dirname, "..", "server.js"), "utf8");

// server.js is a single module. Lift the real ingress helpers and the Wan 3.0
// resolver out of the source so the test exercises the production code without
// booting the HTTP server or requiring external services.
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

const helperNames = [
  "firstPresent",
  "arrayFromBody",
  "nestedMediaUrl",
  "advancedValidationError",
  "aliyunMediaInput",
  "aliyunMediaInputs",
  "uniqueResolvedAliyunMedia",
  "aliyunBodyMediaItems",
  "aliyunBodyLayers",
  "aliyunBodyField",
  "aliyunBodyArrayField",
  "aliyunMediaLocator",
  "aliyunMediaEntryRole",
  "aliyunMediaEntryKind",
  "aliyunReferenceImageInputs",
  "aliyunReferenceVideoInputs",
  "aliyunReferenceAudioInputs",
  "aliyunReferenceFileInput",
  "aliyunFirstFrameInput",
  "aliyunLastFrameInput",
  "aliyunWan30ReferenceInputsPresent",
  "aliyunWan30MediaMode",
  "aliyunPrimaryVideoInput",
  "resolveAliyunVideoMedia",
];

const ingress = new Function([
  ...helperNames.map((name) => extractFunction(server, name)),
  `function normalizeAdvancedProvider(value) { return String(value || "").toLowerCase(); }`,
  `function aliyunVideoCapabilityForRequest() { return "wan30-video"; }`,
  `async function resolveAliyunVideoMediaInput({ input }) {
    const mediaKind = input.type === "reference_video" || input.type === "video"
      ? "video"
      : input.type === "reference_audio" ? "audio"
      : input.type === "file" ? "document"
      : "image";
    return { ...input, mediaKind, url: input.url || (input.dataUrl ? "data:image/jpeg;base64,AA==" : "") };
  }`,
  `async function validateWan30ResolvedMedia() {}`,
  `async function resolveWan27Media() { return { mediaMode: "wan27", media: [] }; }`,
  `return { aliyunWan30MediaMode, aliyunFirstFrameInput, aliyunLastFrameInput, aliyunReferenceImageInputs, resolveAliyunVideoMedia };`,
].join("\n"))();

async function resolved(body, requestParams = { provider: "wan30", videoCapability: "wan30-video" }, fallbackAsset = null) {
  return ingress.resolveAliyunVideoMedia({
    db: { userAssets: [] },
    user: { id: "user-1" },
    body,
    requestParams,
    fallbackAsset,
    skipWan30Validation: true,
  });
}

test("snake_case first_frame/last_frame selects frame mode without mediaMode", async () => {
  const body = {
    first_frame: "https://cdn.example.com/first.jpg",
    last_frame: "https://cdn.example.com/last.jpg",
  };
  assert.equal(ingress.aliyunWan30MediaMode(body), "first_last_frame");
  const result = await resolved(body);
  assert.equal(result.mediaMode, "first_last_frame");
  assert.deepEqual(result.media.map((item) => [item.type, item.url]), [
    ["first_frame", "https://cdn.example.com/first.jpg"],
    ["last_frame", "https://cdn.example.com/last.jpg"],
  ]);
});

test("camelCase firstFrameUrl/lastFrameUrl selects frame mode without mediaMode", async () => {
  const result = await resolved({
    firstFrameUrl: "https://cdn.example.com/first.jpg",
    lastFrameUrl: "https://cdn.example.com/last.jpg",
  });
  assert.equal(result.mediaMode, "first_last_frame");
  assert.deepEqual(result.media.map((item) => item.url), [
    "https://cdn.example.com/first.jpg",
    "https://cdn.example.com/last.jpg",
  ]);
});

test("object-valued first_image/last_image fields keep their URLs", async () => {
  const body = {
    first_image: { url: "https://cdn.example.com/first.jpg" },
    last_image: { image_url: "https://cdn.example.com/last.jpg" },
  };
  const first = ingress.aliyunFirstFrameInput(body);
  const last = ingress.aliyunLastFrameInput(body);
  assert.equal(first.url, "https://cdn.example.com/first.jpg");
  assert.equal(last.url, "https://cdn.example.com/last.jpg");
  assert.doesNotMatch(`${first.url}${last.url}`, /\[object Object\]/);
});

test("nested input.media frame roles are recognized", async () => {
  const body = {
    input: {
      media: [
        { type: "first-frame", image_url: "https://cdn.example.com/first.jpg" },
        { role: "last_frame", url: "https://cdn.example.com/last.jpg" },
      ],
    },
  };
  const result = await resolved(body);
  assert.equal(result.mediaMode, "first_last_frame");
  assert.deepEqual(result.media.map((item) => [item.type, item.url]), [
    ["first_frame", "https://cdn.example.com/first.jpg"],
    ["last_frame", "https://cdn.example.com/last.jpg"],
  ]);
});

test("nested snake_case reference images are recognized in multimodal mode", async () => {
  const body = {
    input: {
      reference_images: [
        "https://cdn.example.com/reference-1.jpg",
        { image_url: "https://cdn.example.com/reference-2.jpg" },
      ],
    },
  };
  const result = await resolved(body);
  assert.equal(result.mediaMode, "multimodal");
  assert.deepEqual(result.media.map((item) => [item.type, item.url]), [
    ["reference_image", "https://cdn.example.com/reference-1.jpg"],
    ["reference_image", "https://cdn.example.com/reference-2.jpg"],
  ]);
});

test("frames mixed with reference media fail explicitly instead of dropping images", async () => {
  const body = {
    first_frame: "https://cdn.example.com/first.jpg",
    last_frame: "https://cdn.example.com/last.jpg",
    reference_images: ["https://cdn.example.com/reference.jpg"],
  };
  assert.throws(
    () => ingress.aliyunWan30MediaMode(body),
    (error) => error.code === "WAN30_MEDIA_COMBINATION_INVALID" && /cannot be combined/.test(error.message),
  );
  await assert.rejects(
    resolved(body),
    (error) => error.code === "WAN30_MEDIA_COMBINATION_INVALID",
  );
});
