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
      extractFunction(serverSource, "hydratedGenerationRecordMediaAsset"),
      extractFunction(serverSource, "hydrateGenerationRecordMediaAssetsWithMap"),
      extractFunction(serverSource, "hydrateGenerationRecordMediaAssets"),
      "return { generationRecordMediaAssetIds, hydrateGenerationRecordMediaAssets };",
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
