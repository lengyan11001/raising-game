"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const serverSource = fs.readFileSync(path.join(root, "server.js"), "utf8");
const createSource = fs.readFileSync(path.join(root, "platform.create.parts", "part-04.js"), "utf8");
const uiSource = fs.readFileSync(path.join(root, "platform.ui.parts", "part-02.js"), "utf8");
const createUrlSource = fs.readFileSync(path.join(root, "platform.create.parts", "part-03.js"), "utf8");
const createOrderSource = fs.readFileSync(path.join(root, "platform.create.parts", "part-01.js"), "utf8");
const providers = require("../lib-providers");
const vega = require("../tencent-vod-vega");

function extractFunction(source, name) {
  const marker = `function ${name}(`;
  const declaration = source.indexOf(marker);
  assert.notEqual(declaration, -1, `missing function ${name}`);
  const start = source.slice(Math.max(0, declaration - 6), declaration) === "async " ? declaration - 6 : declaration;
  let parenDepth = 0;
  let bodyStart = -1;
  for (let index = source.indexOf("(", start); index < source.length; index += 1) {
    if (source[index] === "(") parenDepth += 1;
    else if (source[index] === ")" && --parenDepth === 0) {
      bodyStart = source.indexOf("{", index);
      break;
    }
  }
  assert.notEqual(bodyStart, -1, `missing body for ${name}`);
  let depth = 0;
  for (let index = bodyStart; index < source.length; index += 1) {
    if (source[index] === "{") depth += 1;
    else if (source[index] === "}" && --depth === 0) return source.slice(start, index + 1);
  }
  throw new Error(`unterminated ${name}`);
}

function serverRuntime(overrides = {}) {
  const names = [
    "firstPresent",
    "plainObject",
    "arrayFromBody",
    "boolFromRequest",
    "vegaRecordMediaUrlValues",
    "vegaRecordAssetUriValues",
    "vegaRecordUpstreamMediaValues",
    "vegaRecordMediaPublicUrl",
    "vegaRecordMediaKind",
    "vegaRecordMediaType",
    "withVegaRecordMediaSource",
    "hydrateVegaRecordMediaAssetIds",
    "upstreamPayloadInputImageItems",
    "advancedRegenerateBody",
  ];
  const getVegaMediaLibrarySourceUrlsByAssetUrisFromDb = overrides.getVegaMediaLibrarySourceUrlsByAssetUrisFromDb || (async () => ({}));
  const getUserAssetIdsByUrlsFromDb = overrides.getUserAssetIdsByUrlsFromDb || (async () => ({}));
  return new Function(
    "isVegaProvider",
    "normalizeAdvancedProvider",
    "normalizeVegaMediaMode",
    "resolveVegaDraftSelection",
    "vegaMediaSelection",
    "vegaProviderCapabilities",
    "getVegaMediaLibrarySourceUrlsByAssetUrisFromDb",
    "getUserAssetIdsByUrlsFromDb",
    [
      ...names.map((name) => extractFunction(serverSource, name)),
      "return { hydrateVegaRecordMediaAssetIds, advancedRegenerateBody };",
    ].join("\n"),
  )(
    vega.isVegaProvider,
    providers.normalizeAdvancedProvider,
    vega.normalizeVegaMediaMode,
    vega.resolveVegaDraftSelection,
    vega.vegaMediaSelection,
    vega.vegaProviderCapabilities,
    getVegaMediaLibrarySourceUrlsByAssetUrisFromDb,
    getUserAssetIdsByUrlsFromDb,
  );
}

function frontendRuntime() {
  const createNames = [
    "recordParams",
    "firstPresent",
    "upstreamMediaUrl",
    "upstreamMediaType",
    "upstreamInputMediaItems",
    "restoreMediaUrl",
    "restoreMediaAssetUri",
    "restoreMediaAssetId",
    "restoreReferenceFromMedia",
    "restoreVegaMediaItem",
    "mergeVegaMediaItems",
    "restoreVegaRecordMedia",
    "vegaPublicHttpUrl",
    "arrayFrom",
    "dedupeAdvancedReferenceImages",
  ];
  const uiNames = ["mediaAssetPreviewUrl", "mediaAssetLabel", "upstreamInputImageAssets", "recordImageAssets"];
  return new Function([
    ...createNames.filter((name) => name !== "vegaPublicHttpUrl").map((name) => extractFunction(createSource, name)),
    extractFunction(createUrlSource, "vegaPublicHttpUrl"),
    extractFunction(createOrderSource, "advancedReferenceOrderValue"),
    ...uiNames.map((name) => extractFunction(uiSource, name)),
    `function restoreRecordProvider(record = {}) { return String(record.params?.advancedProviderId || record.provider || ""); }`,
    `function restoreRecordImageLimit() { return 30; }`,
    extractFunction(createSource, "restoreRecordMedia"),
    "return { restoreVegaRecordMedia };",
  ].join("\n"))();
}

function vegaReferenceRecord() {
  return {
    taskId: "vega-ref-legacy",
    provider: "seedance25-vega",
    prompt: "keep the references",
    mediaAssets: [],
    params: {
      provider: "seedance25-vega",
      mediaMode: "reference_video",
      referenceImages: [],
      referenceImageAssetIds: [],
    },
    upstreamPayload: {
      FileInfos: [
        { Type: "Url", Usage: "Reference", Category: "Image", Url: "asset://asset-ref-image-1", userAssetId: "user-ref-image-1" },
        { Type: "Url", Usage: "Reference", Category: "Image", Url: "asset://asset-ref-image-2", userAssetId: "user-ref-image-2" },
        { Type: "Url", Usage: "Reference", Category: "Video", Url: "asset://asset-ref-video-1", userAssetId: "user-ref-video-1" },
        { Type: "Url", Usage: "Reference", Category: "Audio", Url: "asset://asset-ref-audio-1", userAssetId: "user-ref-audio-1" },
      ],
      Content: [
        { role: "reference_image", type: "image_url", image_url: { url: "asset://asset-ref-image-1" } },
      ],
      result: {
        FileInfos: [
          { Type: "Url", Usage: "Reference", Category: "Image", Url: "https://cdn.example.com/generated-result.png" },
        ],
      },
    },
  };
}

function vegaFrameRecord() {
  return {
    taskId: "vega-frame-legacy",
    provider: "seedance20-vega",
    prompt: "preserve both frames",
    mediaAssets: [],
    params: {
      provider: "seedance20-vega",
      mediaMode: "first_last_frame",
      firstFrameAssetUri: "asset://asset-first-frame",
      lastFrameAssetUri: "asset://asset-last-frame",
    },
    upstreamPayload: {
      FileInfos: [
        { Type: "Url", Usage: "FirstFrame", Category: "Image", Url: "asset://asset-first-frame", userAssetId: "user-first" },
        { Type: "Url", Usage: "LastFrame", Category: "Image", Url: "asset://asset-last-frame", userAssetId: "user-last" },
      ],
      result: {
        FileInfos: [
          { Type: "Url", Usage: "FirstFrame", Category: "Image", Url: "https://cdn.example.com/generated-frame.png" },
        ],
      },
    },
  };
}

test("Vega regeneration restores old reference images, videos and audio in order", async () => {
  const sourceUrls = {
    "asset://asset-ref-image-1": "https://cdn.example.com/ref-image-1.png",
    "asset://asset-ref-image-2": "https://cdn.example.com/ref-image-2.png",
    "asset://asset-ref-video-1": "https://cdn.example.com/ref-video-1.mp4",
    "asset://asset-ref-audio-1": "https://cdn.example.com/ref-audio-1.mp3",
  };
  const calls = [];
  const { hydrateVegaRecordMediaAssetIds, advancedRegenerateBody } = serverRuntime({
    getVegaMediaLibrarySourceUrlsByAssetUrisFromDb: async ({ userId, assetUris }) => {
      calls.push({ userId, assetUris });
      return sourceUrls;
    },
  });
  const hydrated = await hydrateVegaRecordMediaAssetIds(vegaReferenceRecord(), "user-1");
  assert.deepEqual(calls, [{
    userId: "user-1",
    assetUris: [
      "asset://asset-ref-image-1",
      "asset://asset-ref-image-2",
      "asset://asset-ref-video-1",
      "asset://asset-ref-audio-1",
    ],
  }]);
  assert.deepEqual(hydrated.params.referenceImages.map((item) => item.url), [
    "https://cdn.example.com/ref-image-1.png",
    "https://cdn.example.com/ref-image-2.png",
  ]);
  assert.deepEqual(hydrated.params.referenceVideos.map((item) => item.url), ["https://cdn.example.com/ref-video-1.mp4"]);
  assert.deepEqual(hydrated.params.referenceAudios.map((item) => item.url), ["https://cdn.example.com/ref-audio-1.mp3"]);
  assert.deepEqual(hydrated.params.referenceImageAssetUris, ["asset://asset-ref-image-1", "asset://asset-ref-image-2"]);
  assert.deepEqual(hydrated.params.referenceVideoAssetUris, ["asset://asset-ref-video-1"]);
  assert.deepEqual(hydrated.params.referenceAudioAssetUris, ["asset://asset-ref-audio-1"]);
  assert.deepEqual(hydrated.mediaAssets.map((item) => item.type), [
    "reference_image", "reference_image", "reference_video", "reference_audio",
  ]);
  assert.doesNotMatch(JSON.stringify({ mediaAssets: hydrated.mediaAssets, params: hydrated.params }), /generated-result/);

  const body = advancedRegenerateBody(hydrated);
  assert.equal(body.mediaMode, "reference_video");
  assert.deepEqual(body.referenceImages, [
    { url: "https://cdn.example.com/ref-image-1.png", assetUri: "asset://asset-ref-image-1", referenceAssetUri: "asset://asset-ref-image-1", userAssetId: "user-ref-image-1" },
    { url: "https://cdn.example.com/ref-image-2.png", assetUri: "asset://asset-ref-image-2", referenceAssetUri: "asset://asset-ref-image-2", userAssetId: "user-ref-image-2" },
  ]);
  assert.deepEqual(body.referenceVideos, [
    { url: "https://cdn.example.com/ref-video-1.mp4", assetUri: "asset://asset-ref-video-1", referenceAssetUri: "asset://asset-ref-video-1", userAssetId: "user-ref-video-1" },
  ]);
  assert.deepEqual(body.referenceAudios, [
    { url: "https://cdn.example.com/ref-audio-1.mp3", assetUri: "asset://asset-ref-audio-1", referenceAssetUri: "asset://asset-ref-audio-1", userAssetId: "user-ref-audio-1" },
  ]);
  assert.doesNotMatch(JSON.stringify(body), /generated-result/);

  const { restoreVegaRecordMedia } = frontendRuntime();
  const restored = restoreVegaRecordMedia(hydrated, hydrated.params);
  assert.equal(restored.firstFrame, null);
  assert.equal(restored.lastFrame, null);
  assert.deepEqual(restored.referenceImages.map((item) => [item.url, item.assetUri, item.assetId]), [
    ["https://cdn.example.com/ref-image-1.png", "asset://asset-ref-image-1", "user-ref-image-1"],
    ["https://cdn.example.com/ref-image-2.png", "asset://asset-ref-image-2", "user-ref-image-2"],
  ]);
  assert.deepEqual(restored.referenceVideos.map((item) => [item.url, item.assetUri, item.assetId]), [
    ["https://cdn.example.com/ref-video-1.mp4", "asset://asset-ref-video-1", "user-ref-video-1"],
  ]);
  assert.deepEqual(restored.referenceAudios.map((item) => [item.url, item.assetUri, item.assetId]), [
    ["https://cdn.example.com/ref-audio-1.mp3", "asset://asset-ref-audio-1", "user-ref-audio-1"],
  ]);
  assert.doesNotMatch(JSON.stringify(restored), /generated-result/);
});

test("Vega regeneration restores first and last frames that only have asset URIs", async () => {
  const sourceUrls = {
    "asset://asset-first-frame": "https://cdn.example.com/first-frame.png",
    "asset://asset-last-frame": "https://cdn.example.com/last-frame.png",
  };
  const { hydrateVegaRecordMediaAssetIds, advancedRegenerateBody } = serverRuntime({
    getVegaMediaLibrarySourceUrlsByAssetUrisFromDb: async () => sourceUrls,
  });
  const hydrated = await hydrateVegaRecordMediaAssetIds(vegaFrameRecord(), "user-1");
  assert.equal(hydrated.params.firstFrameUrl, "https://cdn.example.com/first-frame.png");
  assert.equal(hydrated.params.lastFrameUrl, "https://cdn.example.com/last-frame.png");
  assert.equal(hydrated.params.firstFrameAssetUri, "asset://asset-first-frame");
  assert.equal(hydrated.params.lastFrameAssetUri, "asset://asset-last-frame");
  assert.deepEqual(hydrated.mediaAssets.map((item) => item.type), ["first_frame", "last_frame"]);
  assert.doesNotMatch(JSON.stringify({ mediaAssets: hydrated.mediaAssets, params: hydrated.params }), /generated-frame/);

  const body = advancedRegenerateBody(hydrated);
  assert.equal(body.mediaMode, "first_last_frame");
  assert.equal(body.firstFrameUrl, "https://cdn.example.com/first-frame.png");
  assert.equal(body.lastFrameUrl, "https://cdn.example.com/last-frame.png");
  assert.equal(body.firstFrameAssetUri, "asset://asset-first-frame");
  assert.equal(body.lastFrameAssetUri, "asset://asset-last-frame");
  assert.equal(body.firstFrameAssetId, "user-first");
  assert.equal(body.lastFrameAssetId, "user-last");
  assert.doesNotMatch(JSON.stringify(body), /generated-frame/);

  const { restoreVegaRecordMedia } = frontendRuntime();
  const restored = restoreVegaRecordMedia(hydrated, hydrated.params);
  assert.deepEqual(
    [restored.firstFrame.url, restored.firstFrame.assetUri, restored.firstFrame.assetId],
    ["https://cdn.example.com/first-frame.png", "asset://asset-first-frame", "user-first"],
  );
  assert.deepEqual(
    [restored.lastFrame.url, restored.lastFrame.assetUri, restored.lastFrame.assetId],
    ["https://cdn.example.com/last-frame.png", "asset://asset-last-frame", "user-last"],
  );
  assert.doesNotMatch(JSON.stringify(restored), /generated-frame/);
});

test("Vega hydration prefers legacy URL and asset-URI arrays over an empty canonical list", async () => {
  const { hydrateVegaRecordMediaAssetIds } = serverRuntime({
    getVegaMediaLibrarySourceUrlsByAssetUrisFromDb: async () => ({
      "asset://asset-legacy-ref": "https://cdn.example.com/legacy-ref.png",
    }),
  });
  const record = {
    provider: "h3-vega",
    mediaAssets: [],
    params: {
      mediaMode: "reference_video",
      referenceImages: [],
      reference_image_urls: ["https://cdn.example.com/legacy-ref.png"],
      referenceImageAssetUris: ["asset://asset-legacy-ref"],
    },
    upstreamPayload: { FileInfos: [] },
  };
  const hydrated = await hydrateVegaRecordMediaAssetIds(record, "user-1");
  assert.deepEqual(hydrated.params.referenceImages.map((item) => [item.url, item.assetUri]), [
    ["https://cdn.example.com/legacy-ref.png", "asset://asset-legacy-ref"],
  ]);
  assert.equal(hydrated.params.referenceImages.length, 1);
});
