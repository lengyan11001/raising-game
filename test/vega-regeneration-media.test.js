"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const serverSource = require("../server-source").readServerSource();
const createSource = fs.readFileSync(path.join(root, "platform.create.parts", "part-04.js"), "utf8");
const uiSource = fs.readFileSync(path.join(root, "platform.ui.parts", "part-02.js"), "utf8");
const createUrlSource = fs.readFileSync(path.join(root, "platform.create.parts", "part-03.js"), "utf8");
const createOrderSource = fs.readFileSync(path.join(root, "platform.create.parts", "part-01.js"), "utf8");
const createControlsSource = fs.readFileSync(path.join(root, "platform.create.parts", "part-02.js"), "utf8");
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

function generationMediaRuntime(assetsById = new Map(), overrides = {}) {
  const publicUserAsset = overrides.publicUserAsset || ((asset) => ({
    id: asset.id,
    kind: asset.kind || (String(asset.mime || "").startsWith("video/") ? "video" : "image"),
    previewUrl: asset.previewUrl || asset.publicUrl || asset.cdnUrl || asset.localHttpUrl || "",
    posterUrl: asset.posterUrl || "",
    thumbnailUrl: asset.thumbnailUrl || asset.posterUrl || "",
    coverUrl: asset.coverUrl || asset.posterUrl || "",
    publicUrl: asset.publicUrl || "",
    cdnUrl: asset.cdnUrl || "",
    assetUri: asset.assetUri || "",
    seedanceAssetUri: asset.seedanceAssetUri || "",
    assetUrls: asset.assetUrls || [],
  }));
  return new Function(
    "getUserAssetsByIdsFromDb",
    "publicUserAsset",
    [
      extractFunction(serverSource, "firstPresent"),
      extractFunction(serverSource, "generationRecordMediaAssetIds"),
      extractFunction(serverSource, "generationRecordResultAssetMediaFields"),
      extractFunction(serverSource, "hydrateGenerationRecordResultAsset"),
      extractFunction(serverSource, "generationRecordResultAssetBackfillPatch"),
      extractFunction(serverSource, "hydratedGenerationRecordMediaAsset"),
      extractFunction(serverSource, "hydrateGenerationRecordMediaAssetsWithMap"),
      extractFunction(serverSource, "hydrateGenerationRecordMediaAssets"),
      "return { generationRecordMediaAssetIds, hydrateGenerationRecordMediaAssets, generationRecordResultAssetBackfillPatch };",
    ].join("\n"),
  )(
    async ({ userId, assetIds }) => assetIds.map((id) => assetsById.get(id)).filter(Boolean),
    publicUserAsset,
  );
}

function frontendRuntime() {
  const createNames = [
    "recordParams",
    "firstPresent",
    "upstreamMediaUrl",
    "upstreamMediaType",
    "upstreamInputMediaItems",
    "previewableAssetUrl",
    "assetUrlCandidateRank",
    "reliableAssetUrlCandidates",
    "reliableAssetUrl",
    "reliableAssetPosterUrl",
    "restoreMediaUrl",
    "restoreMediaPreviewUrl",
    "restoreMediaAssetUri",
    "restoreMediaAssetId",
    "restoreReferenceFromMedia",
    "restoreRecordMediaAssetIds",
    "hydrateRecordMediaItemPreview",
    "hydrateRecordMediaParamPreviews",
    "hydrateRecordMediaAssetEntries",
    "hydrateRecordMediaUserAssetPreviews",
    "restoreVegaMediaItem",
    "mergeVegaMediaItems",
    "mergeRecordMediaByKind",
    "dedupeRecordMediaItems",
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
    "return { reliableAssetUrl, recordImageAssets, restoreRecordMedia, restoreVegaRecordMedia, hydrateRecordMediaUserAssetPreviews };",
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

function expiredSignedRegenerationRecord() {
  return {
    taskId: "cgt-20261106230001-147d65",
    provider: "seedance25-vega",
    status: "succeeded",
    prompt: "regenerate with the original reference",
    mediaAssets: [
      {
        type: "reference_image",
        userAssetId: "asset-1793972155554-38d1c57e",
        assetUri: "asset://asset-20261106225953-oi1r5",
        url: "https://cdn.example.com/reference.png?Expires=1&Signature=expired",
      },
    ],
    params: {
      provider: "seedance25-vega",
      referenceImages: [
        {
          assetId: "asset-1793972155554-38d1c57e",
          assetUri: "asset://asset-20261106225953-oi1r5",
          url: "https://cdn.example.com/reference.png?Expires=1&Signature=expired",
          dataUrl: "https://cdn.example.com/reference.png?Expires=1&Signature=expired",
          imageUrl: "https://cdn.example.com/reference.png?Expires=1&Signature=expired",
        },
      ],
      referenceImageAssetIds: ["asset-1793972155554-38d1c57e"],
      referenceImageAssetUris: ["asset://asset-20261106225953-oi1r5"],
    },
    upstreamPayload: {
      FileInfos: [
        { Type: "Url", Usage: "Reference", Category: "Image", Url: "asset://asset-20261106225953-oi1r5" },
      ],
    },
  };
}

function seedanceNsfwRegenerationRecord() {
  return {
    taskId: "cgt-20261106224218-1800a5",
    provider: "seedance-nsfw",
    status: "succeeded",
    prompt: "keep the three references",
    mediaMode: "omini",
    mediaAssets: [
      {
        type: "reference_image",
        key: "image_1",
        userAssetId: "asset-1792378136626-21ee3188",
        imageUrl: "https://cdn.example.com/reference-image.png?Expires=1&Signature=expired",
      },
      {
        type: "reference_video",
        key: "video_1",
        userAssetId: "asset-1793895814730-cea3b134",
        videoUrl: "https://cdn.example.com/reference-video-1.mp4?Expires=1&Signature=expired",
      },
      {
        type: "reference_video",
        key: "video_2",
        userAssetId: "asset-1793940603600-bec2f1f1",
        videoUrl: "https://cdn.example.com/reference-video-2.mp4?Expires=1&Signature=expired",
      },
    ],
    params: {
      provider: "seedance-nsfw",
      mediaMode: "omini",
      referenceImages: [],
      referenceVideos: [],
      referenceImageAssetIds: ["asset-1792378136626-21ee3188"],
      referenceVideoAssetIds: [
        "asset-1793895814730-cea3b134",
        "asset-1793940603600-bec2f1f1",
      ],
    },
    upstreamPayload: {
      content: [
        { type: "text", text: "keep the three references" },
        { role: "reference_image", type: "image_url", image_url: { url: "asset://asset-20261106224219-4shcg" } },
        { role: "reference_video", type: "video_url", video_url: { url: "asset://asset-20261106224219-hpbpw" } },
        { role: "reference_video", type: "video_url", video_url: { url: "asset://asset-20261106224219-pddlv" } },
      ],
    },
  };
}

test("Generation record hydration plans one stable preview and full address set per stored asset", async () => {
  const record = seedanceNsfwRegenerationRecord();
  const assetsById = new Map(record.mediaAssets.map((item, index) => [item.userAssetId, {
    id: item.userAssetId,
    kind: item.type === "reference_video" ? "video" : "image",
    previewUrl: `https://assets-cdn.example.com/asset-${index + 1}?signature=fresh`,
    posterUrl: item.type === "reference_video" ? `https://assets-cdn.example.com/poster-${index + 1}.jpg` : "",
    assetUri: `asset://internal-${index + 1}`,
    assetUrls: [
      { source: "delivery", url: `https://assets-cdn.example.com/asset-${index + 1}?signature=fresh` },
      { source: "local-http", url: `https://123vips.com/assets/user-uploads/user-1/asset-${index + 1}` },
    ],
  }]));
  const { generationRecordMediaAssetIds, hydrateGenerationRecordMediaAssets } = generationMediaRuntime(assetsById);
  assert.deepEqual(generationRecordMediaAssetIds(record), record.mediaAssets.map((item) => item.userAssetId));
  const hydrated = await hydrateGenerationRecordMediaAssets(record, "user-1");
  assert.equal(hydrated.mediaAssets.length, 3);
  assert.deepEqual(hydrated.mediaAssets.map((item) => [item.type, item.assetUri, item.previewUrl, item.posterUrl || "", item.assetUrls.length]), [
    ["reference_image", "asset://internal-1", "https://assets-cdn.example.com/asset-1?signature=fresh", "", 2],
    ["reference_video", "asset://internal-2", "https://assets-cdn.example.com/asset-2?signature=fresh", "https://assets-cdn.example.com/poster-2.jpg", 2],
    ["reference_video", "asset://internal-3", "https://assets-cdn.example.com/asset-3?signature=fresh", "https://assets-cdn.example.com/poster-3.jpg", 2],
  ]);
  assert.equal(hydrated.mediaAssets[0].imageUrl, hydrated.mediaAssets[0].previewUrl);
  assert.equal(hydrated.mediaAssets[1].videoUrl, hydrated.mediaAssets[1].previewUrl);
  assert.equal(hydrated.mediaAssets[2].videoUrl, hydrated.mediaAssets[2].previewUrl);
});

test("Generation record hydration fills video and poster delivery fields from resultAssetId", async () => {
  const asset = {
    id: "asset-result-video",
    kind: "video",
    mime: "video/mp4",
    localUrl: "/assets/user-uploads/user-1/asset-result-video.mp4",
    cdnUrl: "https://assets-cdn.example.com/asset-result-video.mp4",
    objectStorageKey: "assets/user-uploads/user-1/asset-result-video.mp4",
    localPosterUrl: "/assets/user-uploads/user-1/asset-result-video.poster.jpg",
    posterUrl: "https://assets-cdn.example.com/asset-result-video.poster.jpg",
    posterStorageKey: "assets/user-uploads/user-1/asset-result-video.poster.jpg",
  };
  const record = {
    taskId: "cgt-result-video",
    kind: "advanced-video",
    status: "succeeded",
    resultAssetId: asset.id,
    mediaAssets: [],
    cdnPosterUrl: "https://assets-cdn.example.com/existing.poster.jpg",
    remoteVideoUrl: "https://provider.example.com/expired.mp4",
  };
  const { generationRecordMediaAssetIds, hydrateGenerationRecordMediaAssets } = generationMediaRuntime(new Map([[asset.id, asset]]));

  assert.deepEqual(generationRecordMediaAssetIds(record), [asset.id]);
  const hydrated = await hydrateGenerationRecordMediaAssets(record, "user-1");
  assert.equal(hydrated.videoUrl, asset.cdnUrl);
  assert.equal(hydrated.cdnVideoUrl, asset.cdnUrl);
  assert.equal(hydrated.localVideoUrl, asset.localUrl);
  assert.equal(hydrated.storageKey, asset.objectStorageKey);
  assert.equal(hydrated.cdnPosterUrl, "https://assets-cdn.example.com/existing.poster.jpg");
  assert.equal(hydrated.posterStorageKey, asset.posterStorageKey);
  assert.equal(hydrated.remoteVideoUrl, record.remoteVideoUrl);
});

test("Canonical mediaAssets are not expanded by upstream asset URI placeholders", () => {
  const { recordImageAssets } = frontendRuntime();
  const record = seedanceNsfwRegenerationRecord();
  const images = recordImageAssets(record);
  assert.equal(images.length, 1);
  assert.equal(images[0].userAssetId, "asset-1792378136626-21ee3188");
  assert.doesNotMatch(JSON.stringify(images), /asset-20261106224219-4shcg/);
});

test("Seedance regenerated records resolve user asset previews and retain internal references", async () => {
  const { restoreRecordMedia, restoreVegaRecordMedia, hydrateRecordMediaUserAssetPreviews } = frontendRuntime();
  const record = seedanceNsfwRegenerationRecord();
  const hydrated = await hydrateRecordMediaUserAssetPreviews(record, async (assetIds) => new Map([
    [assetIds[0], { id: assetIds[0], publicUrl: "https://cdn.example.com/reference-image.png" }],
    [assetIds[1], {
      id: assetIds[1],
      cdnUrl: "https://cdn.example.com/reference-video-1.mp4",
      posterUrl: "https://cdn.example.com/reference-video-1.poster.jpg",
    }],
    [assetIds[2], {
      id: assetIds[2],
      previewUrl: "/assets/user-uploads/user-1/reference-video-2.mp4",
      posterUrl: "https://cdn.example.com/reference-video-2.poster.jpg",
      assetUrls: [{ source: "delivery", url: "https://assets-cdn.example.com/reference-video-2.mp4?signature=fresh" }],
    }],
  ]));
  const restored = restoreRecordMedia(hydrated);

  assert.equal(restored.referenceImages.length, 1);
  assert.deepEqual(restored.videos.map((item) => [item.url, item.assetUri, item.assetId]), [
    [
      "https://cdn.example.com/reference-video-1.mp4",
      "asset://asset-20261106224219-hpbpw",
      "asset-1793895814730-cea3b134",
    ],
    [
      "https://assets-cdn.example.com/reference-video-2.mp4?signature=fresh",
      "asset://asset-20261106224219-pddlv",
      "asset-1793940603600-bec2f1f1",
    ],
  ]);
  assert.equal(restored.videos.filter((item) => String(item.url || "").startsWith("asset://")).length, 0);
  assert.equal(restored.referenceImages[0].dataUrl, "https://cdn.example.com/reference-image.png");
  assert.equal(restored.referenceImages[0].url, "");
  assert.ok(restored.videos.every((item) => /^https:\/\//.test(item.url)));
  assert.deepEqual(restored.videos.map((item) => item.posterUrl), [
    "https://cdn.example.com/reference-video-1.poster.jpg",
    "https://cdn.example.com/reference-video-2.poster.jpg",
  ]);

  assert.equal(hydrated.mediaAssets.length, 3);
  assert.equal(restored.references.length + restored.videos.length + restored.audios.length, 3);
  const vegaRestored = restoreVegaRecordMedia(hydrated, hydrated.params);
  assert.equal(vegaRestored.referenceImages.length, 1);
  assert.equal(vegaRestored.referenceVideos.length, 2);
  assert.deepEqual(vegaRestored.referenceVideoUrls, [
    "https://cdn.example.com/reference-video-1.mp4",
    "https://assets-cdn.example.com/reference-video-2.mp4?signature=fresh",
  ]);
  assert.deepEqual(vegaRestored.referenceVideos.map((item) => item.assetUri), [
    "asset://asset-20261106224219-hpbpw",
    "asset://asset-20261106224219-pddlv",
  ]);
});

test("Unresolved media never exposes an internal asset URI as a preview source", async () => {
  const { restoreRecordMedia, hydrateRecordMediaUserAssetPreviews } = frontendRuntime();
  const hydrated = await hydrateRecordMediaUserAssetPreviews(seedanceNsfwRegenerationRecord(), async () => new Map());
  const restored = restoreRecordMedia(hydrated);
  assert.ok(restored.referenceImages.every((item) => !String(item.dataUrl || "").startsWith("asset://")));
  assert.ok(restored.videos.every((item) => !String(item.url || "").startsWith("asset://")));
  assert.equal(restored.videos.length, 2);
  assert.ok(restored.videos.every((item) => /^https:\/\//.test(item.url)));
  assert.doesNotMatch(restored.videos.map((item) => item.url).join("\n"), /^asset:\/\//m);
  assert.deepEqual(restored.videos.map((item) => item.assetUri), [
    "asset://asset-20261106224219-hpbpw",
    "asset://asset-20261106224219-pddlv",
  ]);
});

test("Regeneration clicks are serialized and failed previews do not remain black", () => {
  const createUiSource = fs.readFileSync(path.join(root, "platform.create.parts", "part-01.js"), "utf8");
  const previewSource = fs.readFileSync(path.join(root, "platform.create.parts", "part-05.js"), "utf8");
  const exploreSource = fs.readFileSync(path.join(root, "platform.explore.js"), "utf8");

  assert.match(createUiSource, /if \(state\.advancedRegenerationRestoreInFlight\) return;/);
  assert.match(createUiSource, /const posterUrl = video \? reliableAssetPosterUrl\(asset\) : "";/);
  assert.match(createUiSource, /poster="\$\{escapeHtml\(posterUrl\)\}"/);
  assert.match(createUiSource, /state\.advancedRegenerationRestoreInFlight = true;/);
  assert.match(createUiSource, /state\.advancedRegenerationRestoreInFlight = false;/);
  assert.match(previewSource, /data-advanced-preview-media/);
  assert.match(previewSource, /addEventListener\("error"/);
  assert.match(previewSource, /advanced-reference-unavailable/);
  assert.match(previewSource, /reliableAssetUrlCandidates\(refs\[Number\(media\.dataset\.previewIndex/);
  assert.match(previewSource, /candidates\[candidateIndex\]/);
  assert.match(previewSource, /kind === "video"[\s\S]*?url[\s\S]*?data-advanced-preview-media/);
  assert.match(previewSource, /advanced-video-fallback/);
  assert.match(previewSource, /advanced-video-poster/);
  assert.match(previewSource, /advanced-video-reference-label/);
  assert.match(previewSource, /kind === "video" && url && !pending/);
  assert.match(previewSource, /reliableAssetPosterUrl/);
  assert.match(previewSource, /poster="\$\{escapeHtml\(posterUrl\)\}"/);
  assert.match(previewSource, /const posterUrl = video \? reliableAssetPosterUrl\(asset\) : "";/);
  assert.match(previewSource, /src="\$\{escapeHtml\(url\)\}"\$\{posterUrl \? ` poster=/);
  assert.match(previewSource, /is-video-ready/);
  assert.match(previewSource, /preload="auto"/);
  assert.match(previewSource, /素材不可用/);
  assert.match(exploreSource, /recordImageAssets\(detailRecord\)/);
  assert.match(exploreSource, /referenceImages: \[\], referenceVideos: \[\], referenceAudios: \[\]/);

  const resultRegenerateHandler = createUiSource.match(
    /card\.querySelectorAll\("\[data-advanced-result-regenerate\]"\)[\s\S]*?\n  \}\);/,
  )?.[0] || "";
  assert.ok(resultRegenerateHandler, "result-card regenerate handler should exist");
  assert.doesNotMatch(resultRegenerateHandler, /button\.innerHTML\s*=/);
  assert.doesNotMatch(resultRegenerateHandler, /history\.regenerating|history\.regenerateSubmitted/);

  const historyRegenerate = extractFunction(previewSource, "regenerateHistoryRecord");
  assert.doesNotMatch(historyRegenerate, /button\.innerHTML\s*=/);
  assert.doesNotMatch(historyRegenerate, /history\.regenerating|history\.regenerateSubmitted/);

  const applySource = extractFunction(createSource, "applyRecordToAdvancedCreate");
  assert.doesNotMatch(applySource, /history\.regenerateSubmitted/);
});


test("Resolved assets choose a reliable HTTP address and never leak internal URIs", async () => {
  const { restoreRecordMedia, hydrateRecordMediaUserAssetPreviews, reliableAssetUrl } = frontendRuntime();
  const record = seedanceNsfwRegenerationRecord();
  const hydrated = await hydrateRecordMediaUserAssetPreviews(record, async (assetIds) => new Map([
    [assetIds[0], {
      id: assetIds[0],
      publicUrl: "asset://internal-image",
      previewUrl: "/assets/user-uploads/user-1/image.png",
      localUrl: "/assets/user-uploads/user-1/image.png",
      assetUrls: [{ source: "local-http", url: "https://123vips.com/assets/user-uploads/user-1/image.png" }],
    }],
    [assetIds[1], {
      id: assetIds[1],
      publicUrl: "asset://internal-video-1",
      cdnUrl: "/assets/user-uploads/user-1/video-1.mp4",
      localUrl: "/assets/user-uploads/user-1/video-1.mp4",
      assetUrls: [{ source: "local-http", url: "https://123vips.com/assets/user-uploads/user-1/video-1.mp4" }],
    }],
    [assetIds[2], {
      id: assetIds[2],
      localUrl: "/assets/user-uploads/user-1/video-2.mp4",
      assetUrls: [{ source: "local-http", url: "https://123vips.com/assets/user-uploads/user-1/video-2.mp4" }],
    }],
  ]));
  const restored = restoreRecordMedia(hydrated);
  assert.equal(restored.referenceImages[0].dataUrl, "https://123vips.com/assets/user-uploads/user-1/image.png");
  assert.deepEqual(restored.videos.map((item) => item.url), [
    "https://123vips.com/assets/user-uploads/user-1/video-1.mp4",
    "https://123vips.com/assets/user-uploads/user-1/video-2.mp4",
  ]);
  assert.doesNotMatch(JSON.stringify({
    references: restored.references.map(({ assetUri, referenceAssetUri, ...item }) => item),
    videos: restored.videos.map(({ assetUri, referenceAssetUri, ...item }) => item),
  }), /asset:\/\/internal|asset:\/\/asset-2026/);
  assert.equal(reliableAssetUrl({
    publicUrl: "javascript:alert(1)",
    cdnUrl: "asset://internal",
    previewUrl: "/assets/fallback.mp4",
  }), "/assets/fallback.mp4");
});

test("Regeneration replaces expired parameter previews with freshly resolved asset URLs", async () => {
  const { restoreRecordMedia, restoreVegaRecordMedia, hydrateRecordMediaUserAssetPreviews } = frontendRuntime();
  const record = expiredSignedRegenerationRecord();
  const assetId = record.mediaAssets[0].userAssetId;
  const hydrated = await hydrateRecordMediaUserAssetPreviews(record, async () => new Map([
    [assetId, {
      id: assetId,
      previewUrl: "https://assets-cdn.example.com/reference.png?signature=fresh",
      localHttpUrl: "https://123vips.com/assets/user-uploads/user-1/reference.png",
      assetUrls: [{ source: "delivery", url: "https://assets-cdn.example.com/reference.png?signature=fresh" }],
    }],
  ]));
  const restored = restoreRecordMedia(hydrated);
  assert.equal(restored.referenceImages.length, 1);
  assert.equal(restored.referenceImages[0].dataUrl, "https://assets-cdn.example.com/reference.png?signature=fresh");
  assert.doesNotMatch(JSON.stringify(restored.referenceImages[0]), /Expires=1|Signature=expired/);
  assert.equal(hydrated.params.referenceImages[0].url, "https://assets-cdn.example.com/reference.png?signature=fresh");

  const vegaRestored = restoreVegaRecordMedia(hydrated, hydrated.params);
  assert.deepEqual(vegaRestored.referenceImageUrls, ["https://assets-cdn.example.com/reference.png?signature=fresh"]);
});

test("Regeneration falls back to the local HTTP asset URL when delivery signing fails", async () => {
  const { restoreRecordMedia, hydrateRecordMediaUserAssetPreviews } = frontendRuntime();
  const record = expiredSignedRegenerationRecord();
  const assetId = record.mediaAssets[0].userAssetId;
  const hydrated = await hydrateRecordMediaUserAssetPreviews(record, async () => new Map([
    [assetId, { id: assetId, localHttpUrl: "https://123vips.com/assets/user-uploads/user-1/reference.png" }],
  ]));
  const restored = restoreRecordMedia(hydrated);
  assert.equal(restored.referenceImages[0].dataUrl, "https://123vips.com/assets/user-uploads/user-1/reference.png");
  assert.doesNotMatch(JSON.stringify(restored.referenceImages[0]), /Expires=1|Signature=expired/);
});

test("Public user assets return the full address set for the frontend fallback chain", () => {
  const publicAsset = extractFunction(serverSource, "publicUserAsset");
  assert.match(publicAsset, /assetUrls\s*=\s*\[\]/);
  assert.match(publicAsset, /addAssetUrl\("delivery", deliveryUrl\)/);
  assert.match(publicAsset, /addAssetUrl\("local-http", localHttpUrl\)/);
  assert.match(publicAsset, /previewUrl: deliveryUrl/);
  assert.match(publicAsset, /posterUrl: deliveryPosterUrl/);
  assert.match(publicAsset, /localPosterUrl/);
  assert.doesNotMatch(publicAsset, /previewUrl: asset\.localUrl \|\|/);
});

test("Result asset hydration backfills only missing durable media fields", async () => {
  const asset = {
    id: "asset-result-video",
    kind: "video",
    mime: "video/mp4",
    localUrl: "/assets/user-uploads/user-1/result.mp4",
    cdnUrl: "https://assets-cdn.example.com/result.mp4",
    objectStorageKey: "assets/user-uploads/user-1/result.mp4",
    localPosterUrl: "/assets/user-uploads/user-1/result.poster.jpg",
    posterUrl: "https://assets-cdn.example.com/result.poster.jpg",
    posterStorageKey: "assets/user-uploads/user-1/result.poster.jpg",
  };
  const record = {
    taskId: "cgt-backfill",
    userId: "user-1",
    status: "succeeded",
    resultAssetId: asset.id,
    localPosterUrl: "/existing/poster.jpg",
  };
  const { hydrateGenerationRecordMediaAssets, generationRecordResultAssetBackfillPatch } = generationMediaRuntime(new Map([[asset.id, asset]]));
  const hydrated = await hydrateGenerationRecordMediaAssets(record, "user-1");
  const patch = generationRecordResultAssetBackfillPatch(record, hydrated);
  assert.equal(patch.localVideoUrl, asset.localUrl);
  assert.equal(patch.cdnVideoUrl, asset.cdnUrl);
  assert.equal(patch.storageKey, asset.objectStorageKey);
  assert.equal(patch.cdnPosterUrl, asset.posterUrl);
  assert.equal(patch.localPosterUrl, undefined, "existing fields must never be overwritten");
  assert.deepEqual(generationRecordResultAssetBackfillPatch({ taskId: "plain" }, { taskId: "plain", cdnVideoUrl: "https://example.com/v.mp4" }), {});
});

function advancedParameterRuntime() {
  const names = [
    "firstPresent",
    "normalizeAdvancedVegaDraftTaskId",
    "advancedRegenerationParameterSnapshot",
    "advancedRegenerationSnapshotProvider",
    "advancedRegenerationSnapshotFor",
    "advancedVegaGenerationOptions",
  ];
  const state = { advancedRegenerationSnapshot: null };
  const runtime = new Function(
    "state",
    "normalizeAdvancedProvider",
    "advancedVegaPayloadOptions",
    "vegaCapabilities",
    "advancedBoolFromValue",
    [
      ...names.map((name) => extractFunction(name === "normalizeAdvancedVegaDraftTaskId" ? createOrderSource : createSource, name)),
      "return { state, advancedRegenerationParameterSnapshot, advancedRegenerationSnapshotProvider, advancedRegenerationSnapshotFor, advancedVegaGenerationOptions };",
    ].join("\n"),
  )(
    state,
    (value = "") => String(value || "").trim().toLowerCase(),
    () => ({
      taskType: "auto",
      draft: false,
      draftTaskId: "",
      assetGroupId: "",
      generateAudio: true,
      returnLastFrame: false,
      returnVegaUsage: false,
      enhancePromptMode: "auto",
      moderationMode: "Moderation_L1",
      generateMode: "Standard",
      videoQualityMode: "Standard",
      outputFormat: "mp4",
    }),
    () => ({
      taskTypes: ["auto", "reference", "edit", "extend"],
      returnLastFrame: true,
      moderation: true,
      generateMode: true,
      qualityMode: true,
      draft: true,
    }),
    (value, fallback = false) => {
      if (value === undefined || value === null || value === "") return fallback;
      if (typeof value === "boolean") return value;
      return ["1", "true", "yes", "on"].includes(String(value).trim().toLowerCase());
    },
  );
  return runtime;
}

test("Regeneration snapshot never infers ratio or resolution from image size", () => {
  const runtime = advancedParameterRuntime();
  const snapshot = runtime.advancedRegenerationParameterSnapshot({
    taskId: "vega-size-record",
    provider: "seedance25-vega",
    params: { size: "3840x2160", image_size: "1024x1536", width: 1080, height: 1920 },
  }, {
    size: "3840x2160",
    image_size: "1024x1536",
    width: 1080,
    height: 1920,
  }, "seedance25-vega");
  assert.equal(snapshot.ratio, "");
  assert.equal(snapshot.resolution, "");
});

test("Regeneration snapshot uses only the saved submission snapshot for hidden model parameters", () => {
  const runtime = advancedParameterRuntime();
  const snapshot = runtime.advancedRegenerationParameterSnapshot({
    taskId: "vega-hidden-record",
    provider: "seedance25-vega",
    params: {
      submissionSnapshot: {
        taskType: "edit",
        draft: true,
        draftTaskId: "draft-1",
        assetGroupId: "group-1",
        returnLastFrame: true,
        returnVegaUsage: true,
        enhancePromptMode: "on",
        moderationMode: "Moderation_L2",
        generateMode: "Pro",
        videoQualityMode: "High",
        outputFormat: "mov",
      },
    },
  }, {
    submissionSnapshot: {
      taskType: "edit",
      draft: true,
      draftTaskId: "draft-1",
      assetGroupId: "group-1",
      returnLastFrame: true,
      returnVegaUsage: true,
      enhancePromptMode: "on",
      moderationMode: "Moderation_L2",
      generateMode: "Pro",
      videoQualityMode: "High",
      outputFormat: "mov",
    },
  }, "seedance25-vega");
  assert.equal(snapshot.taskType, "edit");
  assert.equal(snapshot.draft, true);
  assert.equal(snapshot.draftTaskId, "draft-1");
  assert.equal(snapshot.assetGroupId, "group-1");
  assert.equal(snapshot.returnLastFrame, true);
  assert.equal(snapshot.returnVegaUsage, true);
  assert.equal(snapshot.enhancePromptMode, "on");
  assert.equal(snapshot.moderationMode, "Moderation_L2");
  assert.equal(snapshot.generateMode, "Pro");
  assert.equal(snapshot.videoQualityMode, "High");
  assert.equal(snapshot.outputFormat, "mov");
});

test("Hidden regeneration snapshot fills Vega options without overriding visible controls", () => {
  const runtime = advancedParameterRuntime();
  runtime.state.advancedRegenerationSnapshot = {
    provider: "seedance25-vega",
    taskType: "edit",
    enhancePromptMode: "on",
    moderationMode: "Moderation_L2",
    outputFormat: "mov",
    generateAudio: false,
  };
  const options = runtime.advancedVegaGenerationOptions("seedance25-vega");
  assert.equal(options.taskType, "edit");
  assert.equal(options.enhancePromptMode, "on");
  assert.equal(options.moderationMode, "Moderation_L2");
  assert.equal(options.outputFormat, "mov");
  assert.equal(options.generateAudio, true, "visible Audio control must remain authoritative");
});

test("Hidden regeneration snapshot is scoped to the same Vega provider", () => {
  const runtime = advancedParameterRuntime();
  runtime.state.advancedRegenerationSnapshot = {
    provider: "seedance25-vega",
    taskType: "extend",
    outputFormat: "mov",
  };
  const options = runtime.advancedVegaGenerationOptions("seedance20-vega");
  assert.equal(options.taskType, "auto");
  assert.equal(options.outputFormat, "mp4");
});

test("Regeneration switches the custom create tab to the restored record media kind", () => {
  const helper = extractFunction(createSource, "advancedCustomMediaKindForRecord");
  const resultKind = extractFunction(createOrderSource, "advancedResultKind");
  const runtime = new Function(
    "generationVideoUrl",
    "generationImageResultUrl",
    `${resultKind}\n${helper}\nreturn advancedCustomMediaKindForRecord;`,
  )(() => "", () => "");

  assert.equal(runtime({ taskId: "img-record", kind: "advanced-image" }), "image");
  assert.equal(runtime({ taskId: "vid-record", kind: "advanced-video" }), "video");
  assert.equal(runtime({ taskId: "txt-record", kind: "advanced-text" }), "conversation");
  assert.equal(runtime({ taskId: "unknown-record" }), "video");
  assert.match(createSource, /state\.advancedCustomMediaKind = advancedCustomMediaKindForRecord\(record\);/);
});

test("Regeneration restores submitted visible parameters while keeping Vega hidden controls hidden", () => {
  const restoreSource = extractFunction(createSource, "restoreRecordToAdvancedCreate");
  const applySource = extractFunction(createSource, "applyRecordToAdvancedCreate");
  const visibleHelper = extractFunction(createSource, "applyAdvancedRegenerationVisibleParameters");
  assert.match(applySource, /applyAdvancedRegenerationVisibleParameters\(regenerationSnapshot, provider\)/);
  assert.match(visibleHelper, /els\.advancedRatio\.value\s*=/);
  assert.match(visibleHelper, /els\.advancedResolution\.value\s*=/);
  assert.match(visibleHelper, /els\.advancedDuration\.value\s*=/);
  assert.match(visibleHelper, /els\.advancedSeedanceGenerateAudio\.value\s*=/);
  assert.doesNotMatch(visibleHelper, /els\.advancedVega(TaskType|Draft|DraftTaskId|AssetGroupId|ReturnLastFrame|ReturnUsage|EnhancePromptMode|ModerationMode|GenerateMode|QualityMode|OutputFormat)\.(value|checked)\s*=/);
  assert.match(applySource, /clearAdvancedCreationInputs\(\{ preserveRegenerationSnapshot: true \}\)/);
  assert.match(applySource, /state\.advancedRegenerationSnapshot = regenerationSnapshot;/);
  assert.match(createSource, /function advancedVegaGenerationOptions/);
  assert.match(createUrlSource, /const vegaOptions = advancedVegaGenerationOptions\(provider\);/);
  assert.match(createUrlSource, /const vegaPayload = \{ \.\.\.vegaPayloadBase, submissionSnapshot: \{ \.\.\.vegaPayloadBase \} \};/);
  assert.match(createControlsSource, /document\.querySelectorAll\("\.advanced-vega-option"\)\.forEach\(\(item\) => \{[\s\S]*?item\.hidden = true;/);
});

test("Vega regeneration keeps canonical media when the submission snapshot has empty lists", () => {
  const { restoreVegaRecordMedia } = frontendRuntime();
  const record = {
    taskId: "vega-empty-snapshot-media",
    provider: "seedance20-vega",
    mediaAssets: [
      { type: "first_frame", userAssetId: "asset-first", previewUrl: "https://cdn.example.com/first.png" },
      { type: "last_frame", userAssetId: "asset-last", previewUrl: "https://cdn.example.com/last.png" },
      { type: "reference_image", userAssetId: "asset-image", previewUrl: "https://cdn.example.com/image.png" },
      { type: "reference_video", userAssetId: "asset-video", previewUrl: "https://cdn.example.com/video.mp4" },
      { type: "reference_audio", userAssetId: "asset-audio", previewUrl: "https://cdn.example.com/audio.mp3" },
    ],
    params: {
      provider: "seedance20-vega",
      mediaMode: "reference_video",
      submissionSnapshot: {
        referenceImages: [],
        referenceImageUrls: [],
        referenceVideos: [],
        referenceVideoUrls: [],
        referenceAudios: [],
        referenceAudioUrls: [],
      },
      referenceImages: [{ assetId: "asset-image", url: "https://cdn.example.com/image.png" }],
      referenceVideos: [{ assetId: "asset-video", url: "https://cdn.example.com/video.mp4" }],
      referenceAudios: [{ assetId: "asset-audio", url: "https://cdn.example.com/audio.mp3" }],
    },
  };
  const media = restoreVegaRecordMedia(record, record.params);
  assert.deepEqual([media.firstFrameAssetId, media.lastFrameAssetId], ["asset-first", "asset-last"]);
  assert.deepEqual(media.referenceImages.map((item) => item.assetId), ["asset-image"]);
  assert.deepEqual(media.referenceVideos.map((item) => item.assetId), ["asset-video"]);
  assert.deepEqual(media.referenceAudios.map((item) => item.assetId), ["asset-audio"]);
});

test("Vega regeneration combines snapshot asset IDs with legacy preview URLs", () => {
  const { restoreVegaRecordMedia } = frontendRuntime();
  const record = {
    taskId: "vega-split-snapshot-media",
    provider: "seedance25-vega",
    mediaAssets: [],
    params: {
      provider: "seedance25-vega",
      mediaMode: "reference_video",
      submissionSnapshot: {
        mediaMode: "reference_video",
        referenceImageAssetIds: ["asset-one", "asset-two"],
        referenceVideoAssetIds: ["asset-video"],
      },
      referenceImageUrls: ["https://cdn.example.com/one.png", "https://cdn.example.com/two.png"],
      referenceVideoUrls: ["https://cdn.example.com/video.mp4"],
    },
  };
  const media = restoreVegaRecordMedia(record, record.params);
  assert.deepEqual(media.referenceImages.map((item) => item.assetId), ["asset-one", "asset-two"]);
  assert.deepEqual(media.referenceImageUrls, ["https://cdn.example.com/one.png", "https://cdn.example.com/two.png"]);
  assert.deepEqual(media.referenceVideos.map((item) => item.assetId), ["asset-video"]);
  assert.deepEqual(media.referenceVideoUrls, ["https://cdn.example.com/video.mp4"]);
});

test("Regeneration prefers the original prompt that still contains @ media mentions", () => {
  const runtime = new Function(
    `${extractFunction(createSource, "advancedRegenerationPrompt")}
return { advancedRegenerationPrompt };`,
  )();
  assert.equal(
    runtime.advancedRegenerationPrompt({
      prompt: "@Image 1 把@Image 2 举在空中",
      finalPrompt: "Image 1 把Image 2 举在空中",
    }),
    "@Image 1 把@Image 2 举在空中",
  );
  assert.equal(
    runtime.advancedRegenerationPrompt({
      prompt: "plain original",
      finalPrompt: "plain normalized",
    }),
    "plain original",
  );
  assert.equal(
    runtime.advancedRegenerationPrompt({}, { submissionSnapshot: { prompt: "@Video 1 保持动作" } }),
    "@Video 1 保持动作",
  );
});

test("Image regeneration accepts complete img records without a video duration", () => {
  const names = ["advancedRegenerationRecordIsImage", "advancedRegenerationRecordIsComplete"];
  const runtime = new Function(
    `${extractFunction(createSource, "recordParams")}
${names.map((name) => extractFunction(createSource, name)).join("\n")}
return { advancedRegenerationRecordIsComplete };`,
  )();
  const imageRecord = {
    taskId: "img-20261110222140-4eac3a",
    kind: "asset-image",
    source: "asset-image-modify",
    provider: "aliyun-wan27-image",
    model: "wan2.7-image-pro",
    status: "completed",
    prompt: "一只金毛在花园玩耍",
    ratio: "9:16",
    resolution: "2K",
    params: {
      advancedProviderId: "z-image-spicy-pro",
      provider: "wan27-image",
      createKind: "custom",
      createMode: "custom",
      ratio: "9:16",
      resolution: "2K",
      size: "1440*2560",
      action: "text_to_image",
    },
  };
  assert.equal(runtime.advancedRegenerationRecordIsComplete(imageRecord), true);
  assert.equal(runtime.advancedRegenerationRecordIsComplete({
    taskId: "img-20261110224714-e648ed",
    kind: "advanced-image",
    source: "advanced-seedream5-image",
    provider: "seedream5-image",
    model: "ep-20260721175949-xw978",
    status: "failed",
    prompt: "五官发型参考 @Image 2，身材参考 @Image 1",
    resolution: "2K",
    params: {
      provider: "seedream5-image",
      createKind: "custom",
      createMode: "custom",
      resolution: "2K",
      size: "2K",
      seedreamTier: "pro",
      referenceImageCount: 2,
    },
    userAssetIds: ["asset-1794321962587-4a2d4b0f", "asset-1794322001742-c165c694"],
    imageUrls: [
      "/assets/user-uploads/user-1781623567712-81394c0d/asset-1794321962587-4a2d4b0f.png",
      "/assets/user-uploads/user-1781623567712-81394c0d/asset-1794322001742-c165c694.png",
    ],
  }), true);
  assert.equal(runtime.advancedRegenerationRecordIsComplete({
    ...imageRecord,
    resolution: "",
    params: { ...imageRecord.params, resolution: "" },
  }), false);
  assert.equal(runtime.advancedRegenerationRecordIsComplete({
    ...imageRecord,
    ratio: "",
    params: { ...imageRecord.params, ratio: "" },
  }), true);
  assert.equal(runtime.advancedRegenerationRecordIsComplete({
    taskId: "vid-without-duration",
    kind: "video",
    provider: "seedance20-vega",
    prompt: "video prompt",
    ratio: "16:9",
    resolution: "720P",
    params: { provider: "seedance20-vega" },
  }), false);
});

test("Result-card regeneration failure is visible instead of silently rejected", () => {
  assert.match(
    createOrderSource,
    /data-advanced-result-regenerate[\s\S]*?catch \(error\)[\s\S]*?advancedNote\.textContent = detail[\s\S]*?advancedNote\.classList\.add\("is-error"\)/,
  );
  const handler = createOrderSource.match(
    /card\.querySelectorAll\("\[data-advanced-result-regenerate\]"\).*?\n  \}\);/s,
  )?.[0] || "";
  assert.ok(handler, "result-card regeneration handler should exist");
  assert.doesNotMatch(handler, /throw error;/);
});

test("Regeneration waits for complete detail instead of applying partial poll records", async () => {
  const createNames = [
    "advancedRegenerationRecordIsImage",
    "advancedRegenerationRecordIsComplete",
    "refreshedRegenerationRecord",
    "restoreRecordToAdvancedCreate",
    "advancedRegenerationMediaFingerprint",
    "refreshAdvancedRegenerationMediaInBackground",
  ];
  const calls = { apply: [], fetch: [], hydrate: [], background: [] };
  const partial = { taskId: "vega-partial", status: "succeeded", videoUrl: "https://cdn.example.com/result.mp4" };
  const detail = {
    taskId: "vega-partial",
    provider: "seedance20-vega",
    ratio: "1:1",
    resolution: "1080P",
    duration: 8,
    prompt: "restore me",
    mediaAssets: [
      { type: "first_frame", userAssetId: "first-asset", previewUrl: "https://cdn.example.com/first.png" },
      { type: "last_frame", userAssetId: "last-asset", previewUrl: "https://cdn.example.com/last.png" },
      { type: "reference_image", userAssetId: "image-asset", previewUrl: "https://cdn.example.com/reference.png" },
      { type: "reference_video", userAssetId: "video-asset", previewUrl: "https://cdn.example.com/reference.mp4" },
      { type: "reference_audio", userAssetId: "audio-asset", previewUrl: "https://cdn.example.com/reference.mp3" },
    ],
    params: {
      provider: "seedance20-vega",
      mediaMode: "reference_video",
      submissionSnapshot: { ratio: "1:1", resolution: "1080P", duration: 8, mediaMode: "reference_video" },
    },
  };
  const runtime = new Function(
    "requestJson",
    "setUser",
    "hydrateRecordMediaUserAssetPreviews",
    "applyRecordToAdvancedCreate",
    "t",
    "advancedRegenerationMediaFingerprint",
    "refreshAdvancedRegenerationMediaInBackground",
    `${extractFunction(createSource, "recordParams")}
${createNames.map((name) => extractFunction(createSource, name)).join("\n")}
return { restoreRecordToAdvancedCreate, advancedRegenerationRecordIsComplete };`,
  )(
    async (url) => {
      calls.fetch.push(url);
      return { record: detail };
    },
    () => {},
    async (record) => {
      calls.hydrate.push(record.taskId);
      return record;
    },
    (record) => calls.apply.push(record),
    (key, values = {}) => values.message || key,
    () => "fingerprint",
    () => calls.background.push("background"),
  );

  assert.equal(runtime.advancedRegenerationRecordIsComplete(partial), false);
  assert.equal(runtime.advancedRegenerationRecordIsComplete(detail), true);
  assert.equal(runtime.advancedRegenerationRecordIsComplete({
    ...detail,
    ratio: "",
    resolution: "",
    duration: "",
    params: {
      ...detail.params,
      ratio: "",
      resolution: "",
      submissionSnapshot: { ratio: "1:1", resolution: "1080P" },
    },
  }), false);
  assert.equal(runtime.advancedRegenerationRecordIsComplete({
    ...detail,
    mediaAssets: detail.mediaAssets.filter((item) => item.type !== "reference_audio"),
    params: {
      ...detail.params,
      submissionSnapshot: { ...detail.params.submissionSnapshot, referenceAudioAssetIds: ["audio-asset"] },
      referenceAudioAssetIds: [],
    },
  }), false);
  assert.equal(runtime.advancedRegenerationRecordIsComplete({
    taskId: "legacy-seedance",
    provider: "seedance",
    prompt: "legacy prompt",
    ratio: "16:9",
    resolution: "720p",
    duration: 15,
    params: { provider: "seedance", mediaMode: "reference_video" },
    mediaAssets: [{ type: "reference_image", userAssetId: "old-asset" }],
  }), true);
  const restored = await runtime.restoreRecordToAdvancedCreate(partial, { id: "button" });
  assert.equal(restored, true);
  assert.deepEqual(calls.fetch, ["/api/generation-records/vega-partial"]);
  assert.deepEqual(calls.hydrate, ["vega-partial"]);
  assert.equal(calls.apply.length, 1);
  assert.equal(calls.apply[0].ratio, "1:1");
  assert.equal(calls.apply[0].resolution, "1080P");
  assert.equal(calls.apply[0].duration, 8);
  assert.deepEqual(calls.apply[0].mediaAssets.map((item) => item.type), [
    "first_frame", "last_frame", "reference_image", "reference_video", "reference_audio",
  ]);
  assert.deepEqual(calls.background, []);
});

test("Regeneration leaves the current form untouched when incomplete detail fetch fails", async () => {
  const createNames = [
    "advancedRegenerationRecordIsComplete",
    "refreshedRegenerationRecord",
    "restoreRecordToAdvancedCreate",
    "advancedRegenerationMediaFingerprint",
    "refreshAdvancedRegenerationMediaInBackground",
  ];
  let applied = false;
  const runtime = new Function(
    "requestJson",
    "setUser",
    "hydrateRecordMediaUserAssetPreviews",
    "applyRecordToAdvancedCreate",
    "t",
    "advancedRegenerationMediaFingerprint",
    "refreshAdvancedRegenerationMediaInBackground",
    `${extractFunction(createSource, "recordParams")}
${createNames.map((name) => extractFunction(createSource, name)).join("\n")}
return { restoreRecordToAdvancedCreate };`,
  )(
    async () => { throw new Error("detail unavailable"); },
    () => {},
    async (record) => record,
    () => { applied = true; },
    (key, values = {}) => values.message || key,
    () => "fingerprint",
    () => {},
  );

  await assert.rejects(
    () => runtime.restoreRecordToAdvancedCreate({ taskId: "vega-failed", status: "succeeded" }),
    /detail unavailable/,
  );
  assert.equal(applied, false);
});

test("Regeneration still restores complete cached records immediately and refreshes previews in background", async () => {
  const calls = { apply: [], background: [] };
  const complete = {
    taskId: "vega-complete",
    provider: "seedance20-vega",
    ratio: "9:16",
    resolution: "720P",
    duration: 5,
    mediaAssets: [{ type: "reference_image", userAssetId: "asset-1" }],
    params: {
      provider: "seedance20-vega",
      submissionSnapshot: { ratio: "9:16", resolution: "720P", duration: 5, mediaMode: "reference_video" },
    },
  };
  const runtime = new Function(
    "advancedRegenerationRecordIsComplete",
    "advancedRegenerationMediaFingerprint",
    "refreshAdvancedRegenerationMediaInBackground",
    "applyRecordToAdvancedCreate",
    `${extractFunction(createSource, "restoreRecordToAdvancedCreate")}
return { restoreRecordToAdvancedCreate };`,
  )(
    () => true,
    () => "fingerprint",
    (record, fingerprint) => calls.background.push([record.taskId, fingerprint]),
    (record) => calls.apply.push(record),
  );

  const restored = await runtime.restoreRecordToAdvancedCreate(complete);
  assert.equal(restored, true);
  assert.equal(calls.apply.length, 1);
  assert.deepEqual(calls.background, [["vega-complete", "fingerprint"]]);
});

test("Vega regeneration media reads the submitted snapshot and preserves reference order", () => {
  const { restoreVegaRecordMedia } = frontendRuntime();
  const record = {
    taskId: "vega-snapshot-media",
    provider: "seedance20-vega",
    mediaAssets: [
      { type: "reference_image", userAssetId: "asset-two", previewUrl: "https://cdn.example.com/two.png" },
      { type: "reference_video", userAssetId: "asset-video", previewUrl: "https://cdn.example.com/source.mp4" },
    ],
    params: {
      provider: "seedance20-vega",
      submissionSnapshot: {
        mediaMode: "reference_video",
        referenceImages: ["https://cdn.example.com/one.png"],
        referenceImageAssetIds: ["asset-one", "asset-two"],
        referenceVideoUrls: ["https://cdn.example.com/source.mp4"],
        referenceVideoAssetIds: ["asset-video"],
      },
    },
  };
  const media = restoreVegaRecordMedia(record, record.params);
  assert.equal(media.referenceImages.length, 2);
  assert.deepEqual(media.referenceImages.map((item) => item.assetId), ["asset-one", "asset-two"]);
  assert.deepEqual(media.referenceImageUrls, ["https://cdn.example.com/one.png", "https://cdn.example.com/two.png"]);
  assert.equal(media.referenceVideos.length, 1);
  assert.equal(media.referenceVideos[0].assetId, "asset-video");
});

test("Vega Pro regeneration accepts a resolved seedanceAssetUri and keeps invalid local media blocked", () => {
  const runtime = new Function(
    "normalizeAdvancedProvider",
    "currentAdvancedProvider",
    "isVegaProviderId",
    [
      extractFunction(createSource, "vegaProviderUsesMediaLibrary"),
      extractFunction(createSource, "vegaMediaSource"),
      extractFunction(createSource, "applyResolvedVegaMediaSource"),
      extractFunction(createUrlSource, "vegaPublicHttpUrl"),
      "return { vegaMediaSource, applyResolvedVegaMediaSource };",
    ].join("\n"),
  )(
    (value) => String(value || ""),
    () => "seedance20-vega",
    () => true,
  );

  const resolvedAsset = {
    id: "asset-video",
    seedanceAssetUri: "asset://asset-video",
    publicUrl: "",
    cdnUrl: "",
  };
  assert.equal(runtime.vegaMediaSource(resolvedAsset), "asset://asset-video");

  const restoredReference = {};
  assert.equal(runtime.applyResolvedVegaMediaSource(restoredReference, resolvedAsset), "asset://asset-video");
  assert.equal(restoredReference.seedanceAssetUri, "asset://asset-video");
  assert.equal(runtime.vegaMediaSource(restoredReference), "asset://asset-video");

  assert.equal(runtime.vegaMediaSource({ url: "data:image/png;base64,AAAA" }), "");
  assert.equal(runtime.vegaMediaSource({ url: "/assets/local-reference.png" }), "");
});
