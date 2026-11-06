"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const vega = require("../tencent-vod-vega");
const vegaMedia = require("../platform.vega-media");
const providers = require("../lib-providers");
const application = require("../server");
const server = read("server.js");
const html = read("platform.html");
const ui = read("platform.ui.js");
const create = read("platform.create.js");
const main = read("platform.main.js");
const config = read("platform.config.js");
const loader = read("platform.js");

function sourceBetween(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  assert.notEqual(start, -1, `missing start marker: ${startMarker}`);
  const end = source.indexOf(endMarker, start + startMarker.length);
  assert.notEqual(end, -1, `missing end marker: ${endMarker}`);
  return source.slice(start, end);
}

function assertCode(fn, code) {
  assert.throws(fn, (error) => error && error.code === code);
}

test("Vega provider identities are exact and preserve the provider id", () => {
  const expected = [
    ["seedance20-vega", "Vega 1.0 Pro", "wand-vega-video", "1.0-pro"],
    ["seedance25-vega", "Vega 1.5 Pro", "wand-vega-video", "1.5-pro"],
    ["h3-vega", "Vega 1.5 Lite", "wand-vega-video", "1.5-lite"],
    ["vega10-lite", "Vega 1.0 Lite", "wand-vega-video", "1.0-lite"],
  ];
  for (const [id, label, modelName, modelVersion] of expected) {
    assert.deepEqual(vega.vegaProviderDefinition(id), { id, label, modelName, modelVersion });
    assert.equal(vega.vegaProviderLabel(id), label);
    assert.equal(providers.normalizeAdvancedProvider(id), id);
    assert.equal(providers.publicProviderId(id), id);
    assert.equal(providers.publicProviderLabel(id), label);
    assert.equal(vega.buildVegaCreatePayload({ provider: id, prompt: "test" }, { subAppId: 123 }).ModelName, modelName);
    assert.equal(vega.buildVegaCreatePayload({ provider: id, prompt: "test" }, { subAppId: 123 }).ModelVersion, modelVersion);
  }
});

test("Vega Pro public display aliases normalize new and historical records", () => {
  assert.equal(providers.publicGenerationDisplayLabel("seedance25-vega"), "seedance2.5vega");
  assert.equal(providers.publicGenerationDisplayLabel("Vega 1.5 Pro"), "seedance2.5vega");
  assert.equal(providers.publicGenerationDisplayLabel("seedance20-vega"), "seedance2.0（vega）");
  assert.equal(providers.publicGenerationDisplayLabel("Vega 1.0 Pro"), "seedance2.0（vega）");
  assert.equal(providers.publicGenerationDisplayLabel("Vega 1.5 Lite"), "");
  assert.equal(providers.publicGenerationDisplayLabel("Vega 1.0 Lite"), "");

  const display25 = application.publicGenerationRecord({
    taskId: "vega-15-pro",
    provider: "seedance25-vega",
    templateTitle: "Vega 1.5 Pro",
    model: "wand-vega-video:1.5-pro",
  });
  assert.equal(display25.provider, "seedance25-vega");
  assert.equal(display25.providerLabel, "seedance2.5vega");
  assert.equal(display25.templateTitle, "seedance2.5vega");

  const historical25 = application.publicGenerationRecord({
    taskId: "legacy-vega-15-pro",
    provider: "Vega 1.5 Pro",
    templateTitle: "Vega 1.5 Pro",
    model: "wand-vega-video:1.5-pro",
  });
  assert.equal(historical25.providerLabel, "seedance2.5vega");
  assert.equal(historical25.templateTitle, "seedance2.5vega");

  const display20 = application.publicGenerationRecord({
    taskId: "vega-10-pro",
    provider: "seedance20-vega",
    templateTitle: "Vega 1.0 Pro",
    model: "wand-vega-video:1.0-pro",
  });
  assert.equal(display20.providerLabel, "seedance2.0（vega）");
  assert.equal(display20.templateTitle, "seedance2.0（vega）");

  const lite = application.publicGenerationRecord({
    taskId: "vega-15-lite",
    provider: "h3-vega",
    templateTitle: "Vega 1.5 Lite",
    model: "wand-vega-video:1.5-lite",
  });
  assert.equal(lite.provider, "h3-vega");
  assert.equal(lite.providerLabel, "Vega 1.5 Lite");
  assert.equal(lite.templateTitle, "Vega 1.5 Lite");
});

test("Vega Pro pricing labels use the same public display aliases without changing provider ids", () => {
  const pricing25 = providers.publicPricingValue({
    provider: "seedance25-vega",
    providerLabel: "Vega 1.5 Pro",
    resolution: "1080p",
    credits: 10,
  });
  assert.equal(pricing25.provider, "seedance25-vega");
  assert.equal(pricing25.providerLabel, "seedance2.5vega");
  assert.equal(pricing25.credits, 10);

  const pricing20 = providers.publicPricingValue({
    provider: "seedance20-vega",
    providerLabel: "Vega 1.0 Pro",
    resolution: "720p",
  });
  assert.equal(pricing20.provider, "seedance20-vega");
  assert.equal(pricing20.providerLabel, "seedance2.0（vega）");

  const lite = providers.publicPricingValue({
    provider: "h3-vega",
    providerLabel: "Vega 1.5 Lite",
    resolution: "720p",
  });
  assert.equal(lite.providerLabel, "Vega 1.5 Lite");
  assert.match(read("platform.ui.parts/part-04.js"), /model: publicGenerationDisplayLabel\(row\.provider\) \|\| String\(row\.providerLabel/);
});

test("Vega Pro result, history, preview, and completion labels use the shared display alias", () => {
  assert.match(ui, /function generationCompletionLabel\(record = \{\}\) \{\s*return publicGenerationDisplayTitle\(record, "生成记录"\);/);
  assert.match(create, /publicGenerationDisplayTitle\(record, "Generation"\)/);
  assert.match(create, /playPreview\(\{ title: publicModelText\(publicGenerationDisplayTitle\(record, t\("common\.preview"\)\)\)/);
  assert.match(create, /previewImage\(\{ title: publicModelText\(publicGenerationDisplayTitle\(record, t\("common\.preview"\)\)\)/);
  assert.match(create, /title: record \? publicGenerationDisplayTitle\(record, t\("common\.preview"\)\) : t\("common\.preview"\)/);
  const explore = read("platform.explore.js");
  assert.match(explore, /const title = publicModelText\(publicGenerationDisplayTitle\(record, t\("history\.detailTitle"\)\)\);/);
});

test("Tencent VOD calls use the international endpoint and region", async () => {
  assert.equal(vega.TENCENT_VOD_INTERNATIONAL_HOST, "vod.intl.tencentcloudapi.com");
  assert.equal(vega.TENCENT_VOD_INTERNATIONAL_REGION, "ap-singapore");
  const requests = [];
  const fetchImpl = async (url, options) => {
    requests.push({ url, options });
    return {
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ Response: { TaskId: "task-1" } }),
    };
  };
  const payload = { SubAppId: 123, TaskId: "task-1" };
  const raw = await vega.callTencentVod({
    action: "DescribeTaskDetail",
    payload,
    env: { TENCENTCLOUD_SECRET_ID: "secret-id", TENCENTCLOUD_SECRET_KEY: "secret-key" },
    fetchImpl,
    timestamp: 1_700_000_000,
  });
  assert.equal(raw.Response.TaskId, "task-1");
  assert.equal(requests.length, 1);
  assert.equal(requests[0].url, "https://vod.intl.tencentcloudapi.com");
  assert.equal(requests[0].options.headers.host, "vod.intl.tencentcloudapi.com");
  assert.equal(requests[0].options.headers["x-tc-region"], "ap-singapore");
  assert.equal(requests[0].options.headers["x-tc-action"], "DescribeTaskDetail");
  assert.equal(requests[0].options.body, JSON.stringify(payload));
  assert.match(requests[0].options.headers.authorization, /Credential=secret-id\//);
  assert.doesNotMatch(requests[0].url, /^https:\/\/vod\.tencentcloudapi\.com/);
});

test("Vega models omit unsupported GenerateMode and VideoQualityMode", () => {
  const lite = vega.buildVegaCreatePayload({
    provider: "h3-vega",
    prompt: "test",
    mediaMode: "text_to_video",
    generateMode: "Fast",
    videoQualityMode: "SuperFast",
    enhancePromptMode: "enable",
  }, { subAppId: 123 });
  const liteExt = JSON.parse(lite.ExtInfo);
  const liteWand = JSON.parse(liteExt.WandVegaParameters);
  assert.deepEqual(liteWand, {
    EnhancePromptMode: "enable",
    ModerationMode: "Moderation_L1",
    ReturnVegaUsage: false,
  });
  assert.equal(Object.prototype.hasOwnProperty.call(liteWand, "GenerateMode"), false);
  assert.equal(Object.prototype.hasOwnProperty.call(liteWand, "VideoQualityMode"), false);

  const pro = vega.buildVegaCreatePayload({
    provider: "seedance25-vega",
    prompt: "test",
    mediaMode: "text_to_video",
    generateMode: "StandardMovie",
    videoQualityMode: "Fast",
  }, { subAppId: 123 });
  const proWand = JSON.parse(JSON.parse(pro.ExtInfo).WandVegaParameters);
  assert.equal(Object.prototype.hasOwnProperty.call(proWand, "GenerateMode"), false);
  assert.equal(Object.prototype.hasOwnProperty.call(proWand, "VideoQualityMode"), false);
  assert.equal(vega.vegaProviderCapabilities("seedance25-vega").generateMode, false);
  assert.equal(vega.vegaProviderCapabilities("seedance25-vega").qualityMode, false);
  assert.equal(vega.vegaProviderCapabilities("h3-vega").generateMode, false);
  assert.equal(vega.vegaProviderCapabilities("h3-vega").qualityMode, false);

  const vega10Pro = vega.buildVegaCreatePayload({
    provider: "seedance20-vega",
    prompt: "test",
    mediaMode: "reference_video",
    referenceImages: ["https://media.example.com/reference.png"],
    generateMode: "Standard",
    videoQualityMode: "Standard",
  }, { subAppId: 123 });
  const vega10ProWand = JSON.parse(JSON.parse(vega10Pro.ExtInfo).WandVegaParameters);
  assert.equal(Object.prototype.hasOwnProperty.call(vega10ProWand, "GenerateMode"), false);
  assert.equal(Object.prototype.hasOwnProperty.call(vega10ProWand, "VideoQualityMode"), false);
  assert.equal(vega.vegaProviderCapabilities("seedance20-vega").generateMode, false);
  assert.equal(vega.vegaProviderCapabilities("seedance20-vega").qualityMode, false);
});

test("Vega 1.0 Lite omits ModerationMode and GenerateMode while other Vega models keep them", () => {
  const lite = vega.buildVegaCreatePayload({
    provider: "vega10-lite",
    prompt: "test",
    mediaMode: "text_to_video",
    moderationMode: "Moderation_L2",
    generateMode: "Fast",
  }, { subAppId: 123 });
  const liteWand = JSON.parse(JSON.parse(lite.ExtInfo).WandVegaParameters);
  assert.equal(vega.vegaProviderCapabilities("vega10-lite").moderation, false);
  assert.equal(vega.vegaProviderCapabilities("vega10-lite").generateMode, false);
  assert.equal(Object.prototype.hasOwnProperty.call(liteWand, "ModerationMode"), false);
  assert.equal(Object.prototype.hasOwnProperty.call(liteWand, "GenerateMode"), false);

  for (const provider of ["seedance20-vega", "seedance25-vega", "h3-vega"]) {
    const payload = vega.buildVegaCreatePayload({
      provider,
      prompt: "test",
      mediaMode: "text_to_video",
      moderationMode: "Moderation_L2",
    }, { subAppId: 123 });
    const wand = JSON.parse(JSON.parse(payload.ExtInfo).WandVegaParameters);
    assert.equal(wand.ModerationMode, "Moderation_L2");
  }
});

test("Vega duration validates boundaries, defaults, and integer seconds", () => {
  assert.equal(vega.normalizeVegaDuration("seedance25-vega", 4), 4);
  assert.equal(vega.normalizeVegaDuration("seedance25-vega", -1), -1);
  assert.equal(vega.normalizeVegaDuration("h3-vega"), 6);
  assert.equal(vega.normalizeVegaDuration("h3-vega", 15), 15);
  assert.equal(vega.normalizeVegaDuration("h3-vega", -1), -1);
  assertCode(() => vega.normalizeVegaDuration("h3-vega", 0), "INVALID_DURATION");
  assertCode(() => vega.normalizeVegaDuration("h3-vega", 31), "INVALID_DURATION");
  assertCode(() => vega.normalizeVegaDuration("h3-vega", 2.5), "INVALID_DURATION");
  assert.equal(vega.normalizeVegaDuration("seedance25-vega", -1, { taskType: "edit" }), -1);
  assertCode(() => vega.normalizeVegaDuration("seedance25-vega", 8, { taskType: "edit" }), "INVALID_DURATION");
  assert.equal(vega.normalizeVegaDuration("seedance25-vega", 8, { taskType: "extend" }), 8);
  assert.equal(vega.normalizeVegaDuration("seedance20-vega"), 5);
  assert.equal(vega.normalizeVegaDuration("seedance20-vega", 4), 4);
  assert.equal(vega.normalizeVegaDuration("seedance20-vega", 15), 15);
  assertCode(() => vega.normalizeVegaDuration("seedance20-vega", -1), "INVALID_DURATION");
  assertCode(() => vega.normalizeVegaDuration("seedance20-vega", 3), "INVALID_DURATION");
  assertCode(() => vega.normalizeVegaDuration("seedance20-vega", 16), "INVALID_DURATION");
});

test("Vega resolution and ratio accept only documented values", () => {
  for (const value of ["480P", "720P", "768P", "1080P", "2K", "4K", "2k", "4k"]) assert.equal(vega.normalizeVegaResolution(value), value.toUpperCase());
  assert.equal(vega.normalizeVegaResolution("720P", "h3-vega"), "720P");
  assertCode(() => vega.normalizeVegaResolution("768P", "h3-vega"), "INVALID_RESOLUTION");
  for (const value of ["21:9", "16:9", "4:3", "1:1", "3:4", "9:16"]) assert.equal(vega.normalizeVegaRatio(value), value);
  assert.equal(vega.normalizeVegaRatio("adaptive"), "adaptive");
  assert.equal(vega.normalizeVegaRatio("adaptive", "seedance25-vega", { taskType: "edit" }), "adaptive");
  assert.equal(vega.normalizeVegaRatio("adaptive", "seedance25-vega", { taskType: "extend" }), "adaptive");
  assertCode(() => vega.normalizeVegaRatio("16:9", "seedance25-vega", { taskType: "edit" }), "INVALID_RATIO");
  assertCode(() => vega.normalizeVegaRatio("16:9", "seedance25-vega", { taskType: "extend" }), "INVALID_RATIO");
});

test("Vega FileInfos use Usage and never ReferenceType", () => {
  const frameFiles = vega.buildVegaFileInfos({
    provider: "seedance25-vega",
    mediaMode: "first_last_frame",
    firstFrameUrl: "https://cdn.example.com/first.png",
    lastFrameUrl: "https://cdn.example.com/last.png",
  });
  assert.deepEqual(frameFiles.map((item) => item.Usage), ["FirstFrame", "LastFrame"]);
  assert.deepEqual(frameFiles.map((item) => item.Category), ["Image", "Image"]);
  const referenceFiles = vega.buildVegaFileInfos({
    provider: "seedance25-vega",
    mediaMode: "reference_video",
    referenceImages: ["https://cdn.example.com/ref.png"],
    referenceVideos: ["https://cdn.example.com/ref.mp4"],
    referenceVideoDurations: [2],
    referenceAudios: ["https://cdn.example.com/ref.mp3"],
    referenceAudioDurations: [2],
  });
  assert.deepEqual(referenceFiles.map((item) => item.Usage), ["Reference", "Reference", "Reference"]);
  assert.deepEqual(referenceFiles.map((item) => item.Category), ["Image", "Video", "Audio"]);
  assert.ok([...frameFiles, ...referenceFiles].every((item) => item.Type === "Url" && !Object.prototype.hasOwnProperty.call(item, "ReferenceType")));
  const payload = vega.buildVegaCreatePayload({
    provider: "seedance25-vega",
    prompt: "test",
    mediaMode: "first_last_frame",
    firstFrameUrl: "https://cdn.example.com/first.png",
    lastFrameUrl: "https://cdn.example.com/last.png",
  }, { subAppId: 123 });
  const extInfo = JSON.parse(payload.ExtInfo);
  const wandParameters = JSON.parse(extInfo.WandVegaParameters);
  assert.equal(wandParameters.EnhancePromptMode, "disable");
  assert.ok(payload.FileInfos.every((item) => !Object.prototype.hasOwnProperty.call(item, "ReferenceType")));
});

test("Vega Pro media-library import turns every public URL into a VOD asset URI", async () => {
  const requests = [];
  const fetchImpl = async (url, options) => {
    const action = options.headers["x-tc-action"];
    const body = JSON.parse(options.body);
    requests.push({ action, body });
    const mediaName = action === "CreateAigcMaterial"
      ? new URL(body.FileInfo.Url).pathname.split("/").filter(Boolean).pop()
      : String(body.TaskId).replace(/^asset-task-/, "");
    const response = action === "CreateAigcMaterial"
      ? { Response: { TaskId: `asset-task-${mediaName}` } }
      : { Response: { CreateAigcMaterialTask: { Status: "FINISH", ErrCode: 0, Output: { AssetId: `asset-${mediaName}` } } } };
    return { ok: true, status: 200, text: async () => JSON.stringify(response) };
  };
  const sourceFiles = [
    { Type: "Url", Category: "Image", Usage: "FirstFrame", Url: "https://cdn.example.com/first.png" },
    { Type: "Url", Category: "Image", Usage: "LastFrame", Url: "https://cdn.example.com/last.png" },
    { Type: "Url", Category: "Video", Usage: "Reference", Url: "https://cdn.example.com/ref.mp4" },
  ];
  for (const provider of ["seedance20-vega", "seedance25-vega"]) {
    assert.equal(vega.vegaProviderUsesMediaLibrary(provider), true);
    const files = await vega.prepareVegaMediaLibraryFileInfos({
      provider,
      fileInfos: sourceFiles,
      subAppId: 123,
      env: { TENCENTCLOUD_SECRET_ID: "secret-id", TENCENTCLOUD_SECRET_KEY: "secret-key" },
      callVod: (args) => vega.callTencentVod({ ...args, fetchImpl, timestamp: 1_700_000_000 }),
      timeoutMs: 0,
      pollIntervalMs: 0,
      now: () => 0,
    });
    assert.deepEqual(files, [
      { Type: "Url", Category: "Image", Usage: "FirstFrame", Url: "asset://asset-first.png" },
      { Type: "Url", Category: "Image", Usage: "LastFrame", Url: "asset://asset-last.png" },
      { Type: "Url", Category: "Video", Usage: "Reference", Url: "asset://asset-ref.mp4" },
    ]);
    assert.ok(files.every((file) => !Object.prototype.hasOwnProperty.call(file, "FileId")));
  }
  assert.equal(requests.filter((item) => item.action === "CreateAigcMaterial").length, 6);
  assert.equal(requests.filter((item) => item.action === "DescribeTaskDetail").length, 6);
  assert.equal(requests.filter((item) => item.action === "PullUpload").length, 0);
  assert.ok(requests.some((item) => item.action === "CreateAigcMaterial" && item.body.FileInfo.Url === "https://cdn.example.com/first.png" && item.body.AssetType === "Image" && item.body.GroupId === "123vips-vega" && item.body.IsRealPerson === "False"));
  assert.ok(requests.some((item) => item.action === "DescribeTaskDetail" && item.body.TaskId === "asset-task-first.png"));
});

test("Vega Pro media-library import runs before charging and CreateAigcVideoTask", () => {
  const handler = sourceBetween(server, "async function handleAdvancedVegaGenerate(", "async function handleAdvancedGenerate(");
  const prepare = handler.indexOf("prepareVegaMediaLibraryFileInfos");
  const charge = handler.indexOf("await chargeUserWithSubtoken");
  const create = handler.indexOf('action: "CreateAigcVideoTask"');
  assert.ok(prepare > 0 && charge > prepare && create > charge);
  assert.match(handler, /const usesVegaMediaLibrary = vegaProviderUsesMediaLibrary\(provider\);[\s\S]*if \(usesVegaMediaLibrary &&[\s\S]*payload = \{[\s\S]*FileInfos: await prepareVegaMediaLibraryFileInfos[\s\S]*assetGroupId: advancedOptions\.assetGroupId/);
  assert.doesNotMatch(handler, /InputRegion: "Oversea"/);
  assert.match(handler, /lookup: getVegaMediaLibraryEntryFromDb/);
  assert.match(handler, /persist: upsertVegaMediaLibraryEntryInDb/);
  assert.match(handler, /code: errorInfo\.code \|\| "VEGA_MEDIA_LIBRARY_IMPORT_FAILED"/);
  assert.match(handler, /usesVegaMediaLibrary\s*\?\s*await resolveVegaMediaAssetSources[\s\S]*?:\s*await resolveVegaLiteMediaAssetSources/);
});

test("Vega Lite providers keep the URL FileInfos path and never call the asset API", async () => {
  for (const provider of ["h3-vega", "vega10-lite"]) {
    assert.equal(vega.vegaProviderUsesMediaLibrary(provider), false);
    let called = false;
    const files = await vega.prepareVegaMediaLibraryFileInfos({
      provider,
      fileInfos: [{ Type: "Url", Category: "Image", Usage: "FirstFrame", Url: "https://cdn.example.com/first.png" }],
      subAppId: 123,
      callVod: async () => { called = true; throw new Error("must not run"); },
    });
    assert.equal(called, false);
    assert.deepEqual(files, [{ Type: "Url", Category: "Image", Usage: "FirstFrame", Url: "https://cdn.example.com/first.png" }]);
  }
});

test("Vega Lite never queries the media library when resolving stale asset ids", async () => {
  assertCode(() => vega.buildVegaFileInfos({
    provider: "h3-vega",
    mediaMode: "reference_video",
    referenceImages: ["asset://asset-lite-only"],
  }), "INVALID_MEDIA_URL");

  let sourceLookupCalled = false;
  const resolved = await vega.resolveVegaLiteMediaAssetSources({
    provider: "h3-vega",
    userId: "user-1",
    media: {
      referenceImages: ["asset://asset-lite-source"],
      referenceImageAssetIds: ["asset-user-lite"],
      referenceImageAssetUris: ["asset://asset-lite-source"],
      referenceVideos: [],
      referenceAudios: [],
    },
    lookupAsset: async () => ({ id: "asset-user-lite", userId: "user-1", publicUrl: "https://media.example.com/lite.png" }),
    lookupSourceUrls: async () => { sourceLookupCalled = true; return {}; },
  });
  assert.equal(sourceLookupCalled, false);
  const files = vega.buildVegaFileInfos({
    provider: "h3-vega",
    mediaMode: "reference_video",
    referenceImages: resolved.referenceImages,
  });
  assert.deepEqual(files, [{ Type: "Url", Category: "Image", Usage: "Reference", Url: "https://media.example.com/lite.png" }]);

  const direct = await vega.resolveVegaLiteMediaAssetSources({
    provider: "vega10-lite",
    userId: "user-1",
    media: { referenceImages: ["https://media.example.com/direct.png"], referenceVideos: [], referenceAudios: [] },
    lookupAsset: async () => { throw new Error("must not run"); },
  });
  assert.deepEqual(direct.referenceImages, ["https://media.example.com/direct.png"]);

  const proFiles = vega.buildVegaFileInfos({
    provider: "seedance20-vega",
    mediaMode: "reference_video",
    referenceImages: ["asset://asset-pro-only"],
  });
  assert.deepEqual(proFiles, [{ Type: "Url", Category: "Image", Usage: "Reference", Url: "asset://asset-pro-only" }]);

  await assert.rejects(
    vega.resolveVegaLiteMediaAssetSources({
      provider: "vega10-lite",
      userId: "user-1",
      media: { referenceImages: ["asset://asset-lite-unknown"], referenceVideos: [], referenceAudios: [] },
      lookupAsset: async () => null,
    }),
    (error) => error.code === "VEGA_MEDIA_ASSET_UNAVAILABLE" && error.details.provider === "vega10-lite",
  );

  const mediaSource = sourceBetween(create, "function vegaMediaSource(item = {}, provider = currentAdvancedProvider()) {", "function applyResolvedVegaMediaSource");
  assert.match(mediaSource, /vegaProviderUsesMediaLibrary\(provider\) && assetUri\.startsWith\("asset:\/\/"\)/);
  assert.match(mediaSource, /const publicUrl = vegaPublicHttpUrl/);
});

test("Vega Pro stale asset URIs are resolved from owned media before FileInfos submission", async () => {
  const resolved = await vega.resolveVegaMediaAssetSources({
    provider: "seedance25-vega",
    userId: "user-1",
    media: {
      firstFrameUrl: "asset://asset-stale-first",
      lastFrameUrl: "",
      referenceImages: ["asset://asset-stale-ref", "asset://asset-stale-second"],
      referenceVideos: [],
      referenceAudios: [],
      firstFrameAssetId: "asset-user-first",
      referenceImageAssetIds: ["asset-user-ref", "asset-user-second"],
      referenceImageAssetUris: ["asset://asset-stale-ref", "asset://asset-stale-second"],
    },
    lookupSourceUrls: async ({ userId, assetUris }) => {
      assert.equal(userId, "user-1");
      assert.deepEqual(assetUris, ["asset://asset-stale-first", "asset://asset-stale-ref", "asset://asset-stale-second"]);
      return { "asset://asset-stale-ref": "https://media.example.com/ref.png" };
    },
    lookupAsset: async (assetId) => ({
      "asset-user-first": { id: "asset-user-first", userId: "user-1", publicUrl: "https://media.example.com/first.png" },
      "asset-user-second": { id: "asset-user-second", userId: "user-1", cdnUrl: "https://media.example.com/second.png" },
    })[assetId],
  });
  assert.equal(resolved.firstFrameUrl, "https://media.example.com/first.png");
  assert.deepEqual(resolved.referenceImages, [
    "https://media.example.com/ref.png",
    "https://media.example.com/second.png",
  ]);
  const files = vega.buildVegaFileInfos({
    provider: "seedance25-vega",
    mediaMode: "reference_video",
    referenceImages: resolved.referenceImages,
  });
  assert.ok(files.every((file) => !String(file.Url).startsWith("asset://")));

  await assert.rejects(
    vega.resolveVegaMediaAssetSources({
      provider: "seedance25-vega",
      userId: "user-1",
      media: {
        firstFrameUrl: "asset://asset-unknown",
        referenceImages: [],
        referenceVideos: [],
        referenceAudios: [],
      },
      lookupSourceUrls: async () => ({}),
      lookupAsset: async () => null,
    }),
    (error) => error.code === "VEGA_MEDIA_ASSET_UNAVAILABLE",
  );
});

test("Vega media-library cache avoids CreateAigcMaterial and failed imports preserve no asset URI", async () => {
  const lookups = [];
  const persisted = [];
  const files = await vega.prepareVegaMediaLibraryFileInfos({
    provider: "seedance20-vega",
    fileInfos: [{ Type: "Url", Category: "Image", Usage: "Reference", Url: "https://cdn.example.com/cached.png" }],
    subAppId: 123,
    userId: "user-1",
    lookup: async (args) => { lookups.push(args); return { status: "succeeded", assetId: "asset-cached", assetUri: "asset://asset-cached" }; },
    persist: async (entry) => { persisted.push(entry); },
  });
  assert.deepEqual(files, [{ Type: "Url", Category: "Image", Usage: "Reference", Url: "asset://asset-cached" }]);
  assert.deepEqual(lookups, [{ userId: "user-1", sourceUrl: "https://cdn.example.com/cached.png", subAppId: 123 }]);
  assert.deepEqual(persisted, []);

  await assert.rejects(
    vega.prepareVegaMediaLibraryFileInfos({
      provider: "seedance25-vega",
      fileInfos: [{ Type: "Url", Category: "Video", Usage: "Reference", Url: "https://cdn.example.com/fail.mp4" }],
      subAppId: 123,
      userId: "user-1",
      lookup: async () => null,
      persist: async (entry) => { persisted.push(entry); },
      importOptions: {},
      callVod: async () => { throw Object.assign(new Error("upstream denied"), { code: "InvalidParameter" }); },
    }),
    (error) => error.code === "VEGA_MEDIA_LIBRARY_IMPORT_FAILED",
  );
  assert.equal(persisted.length, 1);
  assert.equal(persisted[0].status, "failed");
  assert.equal(persisted[0].assetUri, undefined);
});

test("Vega media-library polling reports upstream errors, missing AssetId, and timeout", async () => {
  const base = {
    fileInfo: { Type: "Url", Category: "Video", Usage: "Reference", Url: "https://cdn.example.com/ref.mp4" },
    subAppId: 123,
    timeoutMs: 0,
    pollIntervalMs: 0,
    now: () => 0,
  };
  const run = (task, extra = {}) => {
    const defaultCallVod = async ({ action }) => action === "CreateAigcMaterial"
      ? { Response: { TaskId: "asset-task-1" } }
      : { Response: { CreateAigcMaterialTask: task } };
    return vega.importVegaMediaLibraryFile({
      ...base,
      ...extra,
      callVod: extra.callVod || defaultCallVod,
    });
  };
  await assert.rejects(run({ Status: "PROCESSING", ErrCode: 70000, Message: "internal" }), (error) => error.code === "VEGA_MEDIA_LIBRARY_IMPORT_FAILED" && error.details.errCode === 70000);
  await assert.rejects(run({ Status: "FINISH", ErrCode: 0 }), (error) => error.code === "VEGA_MEDIA_LIBRARY_ASSET_ID_MISSING");
  await assert.rejects(run({ Status: "PROCESSING", ErrCode: 0 }, { deadlineReached: () => true }), (error) => error.code === "VEGA_MEDIA_LIBRARY_TIMEOUT");
  await assert.rejects(run({ Status: "PROCESSING", ErrCode: 0 }, { callVod: async ({ action }) => {
    if (action === "CreateAigcMaterial") return { Response: { TaskId: "asset-task-1" } };
    throw Object.assign(new Error("poll failed"), { code: "InternalError" });
  } }), (error) => error.code === "VEGA_MEDIA_LIBRARY_IMPORT_FAILED" && /polling failed/.test(error.message));
});

test("Vega media URL validation rejects local/private/credential URLs and preserves public URLs", () => {
  const publicUrls = [
    "https://cdn.example.com/a.png?x=1",
    "http://8.8.8.8/video.mp4",
    "https://[2001:4860:4860::8888]/asset.png",
  ];
  for (const value of publicUrls) assert.equal(vega.publicVegaUrl(value), value);
  const invalid = [
    "data:image/png;base64,abc",
    "file:///tmp/a.png",
    "ftp://example.com/a.png",
    "http://localhost/a.png",
    "http://localhost./a.png",
    "http://foo.local/a.png",
    "http://127.0.0.1/a.png",
    "http://10.0.0.1/a.png",
    "http://172.16.0.1/a.png",
    "http://192.168.1.1/a.png",
    "http://169.254.1.1/a.png",
    "http://100.64.0.1/a.png",
    "http://[::1]/a.png",
    "http://[fc00::1]/a.png",
    "http://[fe80::1]/a.png",
    "http://user:pass@example.com/a.png",
  ];
  for (const value of invalid) assertCode(() => vega.publicVegaUrl(value), "INVALID_MEDIA_URL");
});

test("Vega frame modes are mutually exclusive and complete", () => {
  assert.doesNotThrow(() => vega.buildVegaCreatePayload({
    provider: "h3-vega",
    prompt: "test",
    mediaMode: "last_frame",
    lastFrameUrl: "https://cdn.example.com/last.png",
  }, { subAppId: 1 }));
  assertCode(() => vega.buildVegaCreatePayload({
    provider: "h3-vega",
    prompt: "test",
    mediaMode: "first_last_frame",
    lastFrameUrl: "https://cdn.example.com/last.png",
  }, { subAppId: 1 }), "INVALID_MEDIA_COMBINATION");
});

test("Vega draft follow-up uses only a draft id and output settings", () => {
  const payload = vega.buildVegaCreatePayload({
    provider: "seedance25-vega",
    draftTaskId: "draft-task-123",
    duration: -1,
    resolution: "1080P",
    mediaMode: "draft_followup",
  }, { subAppId: 123 });
  assert.equal(Object.prototype.hasOwnProperty.call(payload, "Prompt"), false);
  assert.equal(Object.prototype.hasOwnProperty.call(payload, "FileInfos"), false);
  assert.equal(Object.prototype.hasOwnProperty.call(payload, "Seed"), false);
  assert.deepEqual(payload.OutputConfig, { StorageMode: "Temporary", Resolution: "1080P" });
  const extInfo = JSON.parse(payload.ExtInfo);
  assert.deepEqual(JSON.parse(extInfo.AdditionalParameters), { draft_task_id: "draft-task-123" });
  const stale = vega.buildVegaCreatePayload({
    provider: "seedance25-vega",
    prompt: "stale prompt must become ordinary generation",
    draftTaskId: "draft-task-123",
    resolution: "1080P",
    mediaMode: "draft_followup",
    referenceImages: ["https://cdn.example.com/ref.png"],
  }, { subAppId: 123 });
  assert.equal(stale.Prompt, "stale prompt must become ordinary generation");
  assert.equal(stale.FileInfos.length, 1);
  assert.doesNotMatch(stale.ExtInfo, /draft_task_id/);
  assertCode(() => vega.buildVegaCreatePayload({
    provider: "h3-vega",
    draftTaskId: "draft-task-lite",
    resolution: "1080P",
  }, { subAppId: 123 }), "DRAFT_UNSUPPORTED");
});

test("Vega 1.0 Lite exposes its exact model contract and suppresses undocumented return-last-frame", () => {
  const caps = vega.vegaProviderCapabilities("vega10-lite");
  assert.deepEqual(caps.resolutions, ["480P", "768P", "1080P", "2K", "4K"]);
  assert.deepEqual(caps.durationSeconds, { min: 4, max: 15, fallback: 5, smart: false });
  assert.deepEqual(caps.limits, { images: 9, videos: 3, audios: 3, total: 12, videoSeconds: 15, audioSeconds: 15, perFileMinSeconds: 2, perFileMaxSeconds: 15 });
  assert.equal(caps.frameRatioFromInput, true);
  assert.equal(caps.returnLastFrame, false);
  assertCode(() => vega.normalizeVegaDuration("vega10-lite", -1), "INVALID_DURATION");
  assertCode(() => vega.normalizeVegaResolution("720P", "vega10-lite"), "INVALID_RESOLUTION");
  assert.equal(vega.normalizeVegaResolution("768P", "vega10-lite"), "768P");
  const payload = vega.buildVegaCreatePayload({
    provider: "vega10-lite",
    prompt: "test",
    mediaMode: "first_last_frame",
    firstFrameUrl: "https://cdn.example.com/first.png",
    lastFrameUrl: "https://cdn.example.com/last.png",
    duration: 5,
    resolution: "768P",
    ratio: "16:9",
    returnLastFrame: true,
  }, { subAppId: 123 });
  assert.equal(payload.ModelVersion, "1.0-lite");
  assert.equal(payload.OutputConfig.Duration, 5);
  assert.equal(payload.OutputConfig.Resolution, "768P");
  assert.equal(Object.prototype.hasOwnProperty.call(payload.OutputConfig, "AspectRatio"), false);
  const additional = JSON.parse(JSON.parse(payload.ExtInfo).AdditionalParameters || "{}");
  assert.equal(Object.prototype.hasOwnProperty.call(additional, "return_last_frame"), false);
  const wand = JSON.parse(JSON.parse(payload.ExtInfo).WandVegaParameters);
  assert.equal(Object.prototype.hasOwnProperty.call(wand, "GenerateMode"), false);
  assert.equal(wand.VideoQualityMode, "Standard");
});

test("Vega 1.0 Lite enforces count, audio-pairing, per-file and total duration limits", () => {
  const image = (n) => `https://cdn.example.com/${n}.png`;
  const video = (n) => `https://cdn.example.com/${n}.mp4`;
  const audio = (n) => `https://cdn.example.com/${n}.mp3`;
  const base = { provider: "vega10-lite", prompt: "test", mediaMode: "reference_video", duration: 5, resolution: "768P", ratio: "adaptive" };
  assert.doesNotThrow(() => vega.buildVegaCreatePayload({
    ...base,
    referenceImages: Array.from({ length: 8 }, (_, i) => image(i)),
    referenceVideos: Array.from({ length: 3 }, (_, i) => video(i)),
    referenceVideoDurations: [2, 2, 2],
    referenceAudios: [audio(0)],
    referenceAudioDurations: [2],
  }, { subAppId: 123 }));
  assertCode(() => vega.buildVegaCreatePayload({ ...base, referenceImages: Array.from({ length: 10 }, (_, i) => image(i)) }, { subAppId: 123 }), "MEDIA_LIMIT_EXCEEDED");
  assertCode(() => vega.buildVegaCreatePayload({ ...base, referenceVideos: [video(0)], referenceVideoDurations: [1] }, { subAppId: 123 }), "MEDIA_DURATION_LIMIT_EXCEEDED");
  assertCode(() => vega.buildVegaCreatePayload({ ...base, referenceAudios: [audio(0)], referenceAudioDurations: [2] }, { subAppId: 123 }), "INVALID_MEDIA_COMBINATION");
  assertCode(() => vega.buildVegaCreatePayload({ ...base, referenceVideos: [video(0), video(1)], referenceVideoDurations: [10, 6] }, { subAppId: 123 }), "MEDIA_DURATION_LIMIT_EXCEEDED");
  assertCode(() => vega.buildVegaCreatePayload({ ...base, referenceVideos: [video(0)], referenceVideoDurations: [] }, { subAppId: 123 }), "MEDIA_DURATION_REQUIRED");
});

test("Vega 1.0 Pro exposes its duration, reference limits, and model controls", () => {
  const caps = vega.vegaProviderCapabilities("seedance20-vega");
  assert.deepEqual(caps.resolutions, ["480P", "720P", "768P", "1080P", "2K", "4K"]);
  assert.deepEqual(caps.durationSeconds, { min: 4, max: 15, fallback: 5, smart: false });
  assert.deepEqual(caps.limits, { images: 9, videos: 3, audios: 3, total: 12, videoSeconds: 15, audioSeconds: 15 });
  assert.equal(caps.returnLastFrame, true);
  assert.equal(caps.frameRatioFromInput, false);
  assert.equal(caps.perFileMinSeconds, undefined);
  assert.equal(caps.perFileMaxSeconds, undefined);

  const payload = vega.buildVegaCreatePayload({
    provider: "seedance20-vega",
    prompt: "test",
    mediaMode: "reference_video",
    referenceVideos: ["https://cdn.example.com/ref.mp4"],
    referenceVideoDurations: [1],
    duration: 5,
    resolution: "1080P",
    ratio: "adaptive",
    returnLastFrame: true,
  }, { subAppId: 123 });
  assert.equal(payload.ModelVersion, "1.0-pro");
  assert.equal(payload.OutputConfig.Duration, 5);
  assert.equal(payload.OutputConfig.Resolution, "1080P");
  assert.equal(payload.OutputConfig.AspectRatio, "adaptive");
  const additional = JSON.parse(JSON.parse(payload.ExtInfo).AdditionalParameters || "{}");
  assert.equal(additional.return_last_frame, true);
});

test("Vega 1.5 Pro enforces 30 images, 10 videos, 10 audios, and 50 references", () => {
  const image = (n) => `https://cdn.example.com/${n}.png`;
  const video = (n) => `https://cdn.example.com/${n}.mp4`;
  const audio = (n) => `https://cdn.example.com/${n}.mp3`;
  const base = { provider: "seedance25-vega", prompt: "test", mediaMode: "reference_video", duration: 5, resolution: "1080P", ratio: "adaptive" };
  const caps = vega.vegaProviderCapabilities("seedance25-vega");
  assert.deepEqual(caps.durationSeconds, { min: 4, max: 30, fallback: 5, smart: true });
  assert.deepEqual(caps.limits, {
    images: 30,
    videos: 10,
    audios: 10,
    total: 50,
    videoSeconds: 0,
    audioSeconds: 30,
    perFileMinSeconds: 2,
    perFileMaxSeconds: 30,
  });

  const maxReferences = {
    ...base,
    referenceImages: Array.from({ length: 30 }, (_, i) => image(i)),
    referenceVideos: Array.from({ length: 10 }, (_, i) => video(i)),
    referenceVideoDurations: Array(10).fill(30),
    referenceAudios: Array.from({ length: 10 }, (_, i) => audio(i)),
    referenceAudioDurations: Array(10).fill(3),
  };
  const maxPayload = vega.buildVegaCreatePayload(maxReferences, { subAppId: 123 });
  assert.equal(maxPayload.FileInfos.length, 50);
  assert.equal(maxPayload.ModelVersion, "1.5-pro");

  assertCode(() => vega.buildVegaCreatePayload({ ...base, referenceImages: Array.from({ length: 31 }, (_, i) => image(i)) }, { subAppId: 123 }), "MEDIA_LIMIT_EXCEEDED");
  assertCode(() => vega.buildVegaCreatePayload({
    ...base,
    referenceVideos: Array.from({ length: 11 }, (_, i) => video(i)),
    referenceVideoDurations: Array(11).fill(2),
  }, { subAppId: 123 }), "MEDIA_LIMIT_EXCEEDED");
  assertCode(() => vega.buildVegaCreatePayload({
    ...base,
    referenceImages: [image(0)],
    referenceAudios: Array.from({ length: 11 }, (_, i) => audio(i)),
    referenceAudioDurations: Array(11).fill(2),
  }, { subAppId: 123 }), "MEDIA_LIMIT_EXCEEDED");

  assert.doesNotThrow(() => vega.buildVegaCreatePayload({
    ...base,
    referenceVideos: [video(0), video(1), video(2)],
    referenceVideoDurations: [30, 30, 2],
  }, { subAppId: 123 }));
  assertCode(() => vega.buildVegaCreatePayload({ ...base, referenceVideos: [video(0)], referenceVideoDurations: [1] }, { subAppId: 123 }), "MEDIA_DURATION_LIMIT_EXCEEDED");
  assertCode(() => vega.buildVegaCreatePayload({ ...base, referenceVideos: [video(0)], referenceVideoDurations: [31] }, { subAppId: 123 }), "MEDIA_DURATION_LIMIT_EXCEEDED");
  assertCode(() => vega.buildVegaCreatePayload({ ...base, referenceVideos: [video(0)], referenceVideoDurations: [] }, { subAppId: 123 }), "MEDIA_DURATION_REQUIRED");
  assertCode(() => vega.buildVegaCreatePayload({ ...base, referenceImages: [image(0)], referenceAudios: [audio(0)], referenceAudioDurations: [1] }, { subAppId: 123 }), "MEDIA_DURATION_LIMIT_EXCEEDED");
  assertCode(() => vega.buildVegaCreatePayload({ ...base, referenceImages: [image(0)], referenceAudios: [audio(0)], referenceAudioDurations: [31] }, { subAppId: 123 }), "MEDIA_DURATION_LIMIT_EXCEEDED");
  assertCode(() => vega.buildVegaCreatePayload({ ...base, referenceImages: [image(0)], referenceAudios: [audio(0)], referenceAudioDurations: [] }, { subAppId: 123 }), "MEDIA_DURATION_REQUIRED");
  assertCode(() => vega.buildVegaCreatePayload({
    ...base,
    referenceImages: [image(0)],
    referenceAudios: Array.from({ length: 10 }, (_, i) => audio(i)),
    referenceAudioDurations: [4, 3, 3, 3, 3, 3, 3, 3, 3, 3],
  }, { subAppId: 123 }), "MEDIA_DURATION_LIMIT_EXCEEDED");
});

test("Vega model upload limits keep Lite and Pro 1.0 behavior while allowing Pro 1.5 video files up to 200MB", () => {
  assert.match(config, /ADVANCED_VEGA15_PRO_IMAGE_MAX_BYTES = 30 \* 1024 \* 1024/);
  assert.match(config, /ADVANCED_VEGA15_PRO_VIDEO_MAX_BYTES = 200 \* 1024 \* 1024/);
  assert.match(config, /ADVANCED_VEGA15_PRO_AUDIO_MAX_BYTES = 15 \* 1024 \* 1024/);
  assert.match(create, /if \(normalized === "seedance25-vega"\) \{[\s\S]*?ADVANCED_VEGA15_PRO_IMAGE_MAX_BYTES[\s\S]*?ADVANCED_VEGA15_PRO_VIDEO_MAX_BYTES[\s\S]*?ADVANCED_VEGA15_PRO_AUDIO_MAX_BYTES/);
  assert.match(create, /if \(provider === "seedance25-vega"\) return vegaReferenceLimits\(provider\)\.images/);
  assert.match(config, /"seedance20-vega": Object\.freeze\(\{ images: 9, videos: 3, audios: 3, total: 12 \}\)/);
  assert.match(config, /"seedance25-vega": Object\.freeze\(\{ images: 30, videos: 10, audios: 10, total: 50 \}\)/);
  assert.match(config, /"h3-vega": Object\.freeze\(\{ images: 10, videos: 5, audios: 5, total: 20 \}\)/);
  assert.match(config, /"vega10-lite": Object\.freeze\(\{ images: 9, videos: 3, audios: 3, total: 12 \}\)/);
  assert.match(server, /VEGA_15_PRO_IMAGE_UPLOAD_MAX_BYTES = 30 \* 1024 \* 1024/);
  assert.match(server, /VEGA_15_PRO_VIDEO_UPLOAD_MAX_BYTES = 200 \* 1024 \* 1024/);
  assert.match(server, /VEGA_15_PRO_AUDIO_UPLOAD_MAX_BYTES = 15 \* 1024 \* 1024/);
  assert.match(server, /normalized === "seedance25-vega"[\s\S]{0,240}VEGA_15_PRO_IMAGE_UPLOAD_MAX_BYTES[\s\S]{0,120}VEGA_15_PRO_VIDEO_UPLOAD_MAX_BYTES[\s\S]{0,120}VEGA_15_PRO_AUDIO_UPLOAD_MAX_BYTES/);
  assert.match(config, /"seedance25-vega": Object\.freeze\(\{ resolutions: VEGA_ALL_RESOLUTIONS, ratios: VEGA_ALL_RATIOS, taskTypes: Object\.freeze\(\["auto", "reference", "edit", "extend"\]\), draft: true, generateMode: false, qualityMode: false, perFileMinSeconds: 2, perFileMaxSeconds: 30, videoSeconds: 0, audioSeconds: 30 \}\)/);
  assert.match(config, /"vega10-lite": Object\.freeze\(\{[^\n]*moderation: false, generateMode: false[^\n]*\}\)/);
});

test("Vega 1.5 Pro dirty draft id with prompt and references is normalized into a normal generation", () => {
  for (const draftTaskId of ["undefined", "null", "NaN", "   "]) {
    const input = {
      provider: "seedance25-vega",
      prompt: "@Image 1 把@Image 2 举在空中，鸡巴反复插入",
      mediaMode: "draft_followup",
      draftTaskId,
      resolution: "1080P",
      duration: 5,
      referenceImages: [
        "https://media.123vips.com/assets/user-uploads/user-1777972853765-6da5a3f7/asset-1792378136626-21ee3188.png",
        "https://media.123vips.com/assets/user-uploads/user-1777972853765-6da5a3f7/asset-1790320007464-77ad159c.jpg",
      ],
    };
    const selection = vega.resolveVegaDraftSelection({
      provider: input.provider,
      mediaMode: input.mediaMode,
      prompt: input.prompt,
      draftTaskId: input.draftTaskId,
      media: { referenceImages: input.referenceImages },
    });
    assert.equal(selection.draftTaskId, "");
    assert.equal(selection.mediaMode, "reference_video");
    const payload = vega.buildVegaCreatePayload(input, { subAppId: 1524935253 });
    assert.equal(payload.Prompt, input.prompt);
    assert.equal(payload.FileInfos.length, 2);
    assert.equal(payload.OutputConfig.Resolution, "1080P");
    assert.doesNotMatch(payload.ExtInfo, /draft_task_id/);
  }
});

test("Vega 1.5 Pro keeps a real draft-to-final request and requires an id for draft-only intent", () => {
  const selection = vega.resolveVegaDraftSelection({
    provider: "seedance25-vega",
    mediaMode: "draft_followup",
    draftTaskId: "1524935253-AigcVideoTask-draft",
  });
  assert.equal(selection.draftTaskId, "1524935253-AigcVideoTask-draft");
  assert.equal(selection.mediaMode, "draft_followup");
  assert.equal(vega.resolveVegaDraftSelection({
    provider: "seedance25-vega",
    draftTaskId: "1524935253-AigcVideoTask-draft",
  }).mediaMode, "draft_followup");
  const payload = vega.buildVegaCreatePayload({
    provider: "seedance25-vega",
    mediaMode: "draft_followup",
    draftTaskId: "1524935253-AigcVideoTask-draft",
    resolution: "1080P",
  }, { subAppId: 123 });
  assert.equal(payload.Prompt, undefined);
  assert.deepEqual(JSON.parse(JSON.parse(payload.ExtInfo).AdditionalParameters), { draft_task_id: "1524935253-AigcVideoTask-draft" });
  assertCode(() => vega.resolveVegaDraftSelection({
    provider: "seedance25-vega",
    mediaMode: "draft_followup",
  }), "DRAFT_TASK_ID_REQUIRED");
});

test("Vega 1.5 Lite stale draft state is normalized into a normal generation", () => {
  const staleInput = {
    provider: "h3-vega",
    prompt: "make a normal lite video",
    draftTaskId: "draft-task-from-template",
    mediaMode: "draft_followup",
    resolution: "720P",
    duration: 6,
    referenceImages: ["https://cdn.example.com/ref.png"],
  };
  const selection = vega.resolveVegaDraftSelection({
    provider: staleInput.provider,
    mediaMode: staleInput.mediaMode,
    prompt: staleInput.prompt,
    draftTaskId: staleInput.draftTaskId,
    media: { referenceImages: staleInput.referenceImages },
  });
  assert.equal(selection.draftTaskId, "");
  assert.equal(selection.ignoredStaleDraft, true);
  assert.equal(selection.mediaMode, "reference_video");

  const payload = vega.buildVegaCreatePayload(staleInput, { subAppId: 123 });
  assert.equal(payload.Prompt, staleInput.prompt);
  assert.equal(payload.FileInfos.length, 1);
  assert.equal(payload.OutputConfig.Duration, 6);
  assert.equal(payload.OutputConfig.Resolution, "720P");
  assert.doesNotMatch(payload.ExtInfo, /draft_task_id/);
});

test("Vega 1.5 Lite draft-only intent fails closed before upstream submission", () => {
  assertCode(() => vega.resolveVegaDraftSelection({
    provider: "h3-vega",
    mediaMode: "draft_followup",
    draftTaskId: "draft-only",
  }), "DRAFT_UNSUPPORTED");
  assertCode(() => vega.buildVegaCreatePayload({
    provider: "h3-vega",
    draftTaskId: "draft-only",
    mediaMode: "draft_followup",
  }, { subAppId: 123 }), "DRAFT_UNSUPPORTED");
});

test("Vega Lite request handler ignores stale draft state before validation and charging", async () => {
  const responses = [];
  const res = {
    statusCode: 0,
    headers: {},
    setHeader(name, value) { this.headers[name] = value; },
    writeHead(statusCode, headers = {}) { this.statusCode = statusCode; Object.assign(this.headers, headers); },
    end(body) { responses.push({ status: this.statusCode, body: JSON.parse(body) }); },
  };
  const originalSecretId = process.env.TENCENTCLOUD_SECRET_ID;
  const originalSecretKey = process.env.TENCENTCLOUD_SECRET_KEY;
  const originalSubAppId = process.env.TENCENT_VOD_SUB_APP_ID;
  delete process.env.TENCENTCLOUD_SECRET_ID;
  delete process.env.TENCENTCLOUD_SECRET_KEY;
  process.env.TENCENT_VOD_SUB_APP_ID = "123";
  try {
    await application.handleAdvancedVegaGenerate({ method: "POST", headers: {} }, res, {
      auth: { user: { id: "test-user", credits: 10000 }, tokenSource: "session" },
      config: {
        platform: {
          advancedPricing: {
            h3VegaCreditsPerSecondByResolution: { "720p": 13.5 },
            h3VegaInputVideoCreditsPerSecondByResolution: {},
          },
        },
      },
      body: {
        provider: "h3-vega",
        prompt: "normal lite generation",
        mediaMode: "draft_followup",
        draftTaskId: "stale-template-draft",
        resolution: "720P",
        duration: 6,
      },
      bodyParams: {},
      caseParams: { draftTaskId: "stale-template-draft", mediaMode: "draft_followup" },
      prompt: "normal lite generation",
      provider: "h3-vega",
      selectedCase: null,
    });
  } finally {
    if (originalSecretId === undefined) delete process.env.TENCENTCLOUD_SECRET_ID;
    else process.env.TENCENTCLOUD_SECRET_ID = originalSecretId;
    if (originalSecretKey === undefined) delete process.env.TENCENTCLOUD_SECRET_KEY;
    else process.env.TENCENTCLOUD_SECRET_KEY = originalSecretKey;
    if (originalSubAppId === undefined) delete process.env.TENCENT_VOD_SUB_APP_ID;
    else process.env.TENCENT_VOD_SUB_APP_ID = originalSubAppId;
  }
  assert.equal(responses.length, 1);
  assert.equal(responses[0].status, 503);
  assert.equal(responses[0].body.code, "TENCENT_VOD_NOT_CONFIGURED");
  assert.notEqual(responses[0].body.code, "DRAFT_UNSUPPORTED");
});

test("Vega regenerated draft bodies discard reconstructed prompt and media before validation", () => {
  const regenerate = sourceBetween(server, "function advancedRegenerateBody(record = {})", "async function handleRegenerateGenerationRecord(");
  assert.match(regenerate, /const explicitMediaMode = firstPresent\(record\.mediaMode, params\.mediaMode/);
  assert.match(regenerate, /const requestedDraftTaskId = String\(firstPresent\(params\.draftTaskId, params\.draft_task_id, ""\)/);
  assert.match(regenerate, /draftSelection = resolveVegaDraftSelection\(\{[\s\S]*?draftTaskId: requestedDraftTaskId/);
  assert.match(regenerate, /const draftTaskId = draftSelection\.draftTaskId/);
  assert.match(regenerate, /const requestedMedia = draftTaskId[\s\S]*?firstFrameUrl: ""[\s\S]*?referenceImages: \[\]/);
  assert.match(regenerate, /mediaMode: effectiveMediaMode,[\s\S]*?\.\.\.requestedMedia/);
  assert.match(regenerate, /body\.prompt = ""/);
  assert.match(regenerate, /body\.draft = draftTaskId \|\| !vegaProviderCapabilities\(provider\)\?\.draft \? false/);
  const handler = sourceBetween(server, "async function handleAdvancedVegaGenerate(", "function advancedRuntimeForProvider(");
  assert.match(handler, /body\.draftTaskId,[\s\S]*?bodyParams\.draft_task_id,[\s\S]*?"",/);
  const requestedMode = sourceBetween(handler, "const requestedMediaMode = firstPresent(", "const directDraftTaskId");
  assert.doesNotMatch(requestedMode, /caseParams\./);
  assert.match(handler, /resolveVegaDraftSelection\(\{[\s\S]*?templateDraftTaskId: firstPresent\(caseParams\.draftTaskId/);
  assert.match(handler, /const effectiveMedia = draftTaskId[\s\S]*?firstFrameUrl: ""[\s\S]*?referenceImages: \[\]/);
  assert.match(handler, /const mediaMode = draftSelection\.mediaMode/);
  assert.match(create, /restoredDraftFollowup \? "draft_followup"/);
  assert.match(create, /normalizeAdvancedVegaDraftTaskId/);
});

test("Vega task responses are extracted with the required status mapping", () => {
  assert.equal(vega.vegaCreateTaskId({ Response: { TaskId: "task-1" } }), "task-1");
  const detail = { TaskId: "task-1", Status: "FINISH", Output: { FileInfos: [
    { UsageType: "last_frame_url", FileUrl: "https://cdn.example.com/last.png" },
    { UsageType: "", FileUrl: "https://cdn.example.com/video.mp4" },
  ] } };
  assert.equal(vega.vegaTaskDetail({ Response: { AigcVideoTask: detail } }), detail);
  assert.equal(vega.vegaTaskDetail({ Response: {} }), null);
  assert.equal(vega.normalizeVegaStatus("FINISH"), "succeeded");
  assert.equal(vega.normalizeVegaStatus("WAITING"), "queued");
  assert.equal(vega.normalizeVegaStatus("PROCESSING"), "running");
  assert.equal(vega.normalizeVegaStatus("ABORTED"), "failed");
  assert.equal(vega.vegaOutputVideoUrl(detail), "https://cdn.example.com/video.mp4");
});

test("Vega pricing fails closed with HTTP 422", () => {
  const error = vega.vegaPricingUnavailableError("seedance25-vega");
  assert.equal(error.statusCode, 422);
  assert.equal(error.code, "MODEL_PRICING_UNAVAILABLE");
  assert.match(error.message, /pricing is not configured/i);
  assert.equal(vega.assertVegaPricingConfigured("h3-vega", { credits: 1 }).credits, 1);
  assertCode(() => vega.assertVegaPricingConfigured("h3-vega", { credits: 0 }), "MODEL_PRICING_UNAVAILABLE");
  assert.match(server, /if \(isVegaProvider\(normalizedProvider\)\) throw vegaPricingUnavailableError\(normalizedProvider\)/);
});

test("Vega pricing is checked before charging or calling the upstream API", () => {
  const handler = sourceBetween(server, "async function handleAdvancedVegaGenerate(", "function advancedRuntimeForProvider(");
  const pricingIndex = handler.indexOf("assertVegaPricingConfigured(provider, pricing)");
  const chargeIndex = handler.indexOf("await chargeUserWithSubtoken(auth, {");
  const upstreamIndex = handler.indexOf('await callTencentVod({ action: "CreateAigcVideoTask", payload })');
  assert.ok(pricingIndex > 0 && chargeIndex > pricingIndex && upstreamIndex > chargeIndex);
  assert.match(handler, /assertVegaPricingConfigured\(provider, pricing\)/);
});

test("Vega create failure and polling failure paths refund without double charging", () => {
  const handler = sourceBetween(server, "async function handleAdvancedVegaGenerate(", "function advancedRuntimeForProvider(");
  assert.match(handler, /if \(charged\)[\s\S]*advanced_vega_refund[\s\S]*billingStatus: cost > 0 \? "refunded" : "free"/);
  const refresh = sourceBetween(server, "async function refreshGenerationRecordStatus(", "if (record.provider === \"apiz\")");
  assert.match(refresh, /upstreamResourceMissing\(error\)[\s\S]*status: "failed"[\s\S]*finalCredits: 0[\s\S]*originalFinalCredits: 0/);
  assert.match(server, /function needsSeedanceFailureRefund[\s\S]*isVegaProvider\(provider\)/);
});

test("Vega regeneration preserves exact provider and public media URLs", () => {
  const regenerate = sourceBetween(server, "function advancedRegenerateBody(record = {})", "async function handleRegenerateGenerationRecord(");
  assert.match(regenerate, /const provider = normalizeAdvancedProvider\(record\.provider \|\| params\.provider\)/);
  assert.match(regenerate, /if \(regeneratedMedia\.firstFrameUrl\) body\.firstFrameUrl = regeneratedMedia\.firstFrameUrl/);
  assert.match(regenerate, /if \(regeneratedMedia\.lastFrameUrl\) body\.lastFrameUrl = regeneratedMedia\.lastFrameUrl/);
  assert.match(regenerate, /body\.referenceImages = regeneratedMedia\.referenceImages\.map\(\(url, index\) => \(\{[\s\S]*?userAssetId: referenceImageAssetIds\[index\]/);
  assert.match(regenerate, /body\.referenceVideos = regeneratedMedia\.referenceVideos\.map\(\(url, index\) => \(\{[\s\S]*?userAssetId: referenceVideoAssetIds\[index\]/);
  assert.match(regenerate, /body\.referenceAudios = regeneratedMedia\.referenceAudios\.map\(\(url, index\) => \(\{[\s\S]*?userAssetId: referenceAudioAssetIds\[index\]/);
  assert.match(regenerate, /if \(firstFrameAssetId\) body\.firstFrameAssetId = firstFrameAssetId/);
  assert.match(regenerate, /if \(lastFrameAssetId\) body\.lastFrameAssetId = lastFrameAssetId/);
  for (const field of ["taskType", "draft", "draftTaskId", "assetGroupId", "generateAudio", "returnLastFrame", "returnVegaUsage", "enhancePromptMode", "moderationMode", "generateMode", "videoQualityMode", "outputFormat"]) {
    assert.match(regenerate, new RegExp(`body\\.${field}\\s*=`));
  }
  assert.doesNotMatch(regenerate, /reference_type|ReferenceType/);
});

test("Vega regeneration restores and persists user asset ids end to end", () => {
  const restoreMedia = sourceBetween(create, "function restoreVegaRecordMedia(record = {}, params = {}) {", "async function refreshedRegenerationRecord");
  assert.match(restoreMedia, /restoreMediaAssetId\(media\.firstFrame\)/);
  assert.match(restoreMedia, /params\.firstFrameAssetId/);
  assert.match(restoreMedia, /params\.lastFrameAssetId/);
  assert.match(restoreMedia, /referenceImageAssetIds/);
  assert.match(restoreMedia, /referenceVideoAssetIds/);
  assert.match(restoreMedia, /referenceAudioAssetIds/);
  const submit = sourceBetween(create, "const vegaPayload = {", "const vegaPendingTaskId =");
  assert.match(submit, /firstFrameAssetId: state\.advancedSeedanceFirstFrameAssetId/);
  assert.match(submit, /lastFrameAssetId: state\.advancedSeedanceLastFrameAssetId/);
  assert.match(submit, /referenceImageAssetIds: vegaReferenceImageItems\.map/);
  assert.match(submit, /referenceVideoAssetIds: vegaVideoItems\.map/);
  assert.match(submit, /referenceAudioAssetIds: vegaAudioItems\.map/);
  assert.match(submit, /firstFrameAssetId: state\.advancedSeedanceFirstFrameAssetId/);
  const pending = sourceBetween(create, "const vegaPendingRecord = {", "setAdvancedResultMediaKind(\"video\");");
  assert.match(pending, /userAssetId: vegaPayload\.firstFrameAssetId/);
  assert.match(pending, /userAssetId: vegaPayload\.referenceImageAssetIds\?\.\[index\]/);
  const handler = sourceBetween(server, "async function handleAdvancedVegaGenerate(", "function advancedRuntimeForProvider(");
  assert.match(handler, /mediaAssets: media\.mode === "first_frame"[\s\S]*?userAssetId: requestedMedia\.firstFrameAssetId/);
  assert.match(handler, /type: "reference_image"[\s\S]*?userAssetId: requestedMedia\.referenceImageAssetIds\[index\]/);
  assert.match(server, /async function hydrateVegaRecordMediaAssetIds\(record = \{\}, userId = ""\)/);
  assert.match(server, /getUserAssetIdsByUrlsFromDb\(\{ userId, urls \}\)/);
  assert.match(server, /let nextRecord = await hydrateVegaRecordMediaAssetIds\(record, auth\.user\.id\)/);
  assert.match(create, /button\.addEventListener\("click", async \(\) => \{[\s\S]*?refreshedRegenerationRecord\(cachedRecord\)/);
  assert.match(create, /record = await refreshedRegenerationRecord\(record\)/);
});

test("Vega UI options are appended after existing video models with exact labels", () => {
  const videoGroup = html.match(/<optgroup label="Video">([\s\S]*?)<\/optgroup>/)?.[1] || "";
  const options = [...videoGroup.matchAll(/<option value="([^"]+)"[^>]*>([^<]+)<\/option>/g)].map((match) => [match[1], match[2]]);
  assert.deepEqual(options.slice(-4), [
    ["seedance20-vega", "seedance2.0（vega）"],
    ["seedance25-vega", "seedance2.5vega"],
    ["h3-vega", "wan（vega）"],
    ["vega10-lite", "h3（vega）"],
  ]);
  assert.equal(options.some(([id]) => /^seedance20-(?:fast|mini|lite)-vega$/.test(id)), false);
  assert.deepEqual(options.slice(0, 6).map(([id]) => id), ["seedance-nsfw", "wan30", "wan30-prime", "wan27", "happyhorse", "seedance"]);
  assert.match(ui, /if \(VEGA_MODEL_LABELS\[normalized\]\) return VEGA_MODEL_LABELS\[normalized\]/);
  for (const [id, label] of [
    ["seedance20-vega", "seedance2\.0（vega）"],
    ["seedance25-vega", "seedance2\.5vega"],
    ["h3-vega", "wan（vega）"],
  ]) assert.match(config, new RegExp(`"${id}": "${label}"`));
});

test("Vega UI exposes the full capability matrix and duration controls", () => {
  for (const id of ["seedance20-vega", "seedance25-vega", "h3-vega"]) {
    assert.match(config, new RegExp(`"${id}"`));
  }
  assert.match(config, /VEGA_ALL_RESOLUTIONS = Object\.freeze\(\["480P", "720P", "768P", "1080P", "2K", "4K"\]\)/);
  assert.match(config, /VEGA_ALL_RATIOS = Object\.freeze\(\["21:9", "16:9", "4:3", "1:1", "3:4", "9:16", "adaptive"\]\)/);
  assert.match(config, /"seedance20-vega": Object\.freeze\(\{ min: 4, max: 15, fallback: 5, smart: false \}\)/);
  assert.match(config, /"seedance25-vega": Object\.freeze\(\{ min: 4, max: 30, fallback: 5, smart: true \}\)/);
  assert.match(config, /"h3-vega": Object\.freeze\(\{ min: 2, max: 30, fallback: 6, smart: true \}\)/);
  assert.match(ui, /advancedPricingUnavailableLabel/);
  assert.match(ui, /MODEL_PRICING_UNAVAILABLE/);
});

test("Vega models expose only the first two control rows and keep hidden defaults", () => {
  const controls = sourceBetween(create, "function updateAdvancedModelControls()", "function triggerAdvancedLocalImageUpload(");
  assert.match(controls, /document\.querySelectorAll\("\.advanced-vega-option"\)\.forEach\(\(item\) => \{\s*item\.hidden = true;\s*\}\);/);
  assert.doesNotMatch(controls, /item\.hidden = !vegaProvider/);
  assert.match(controls, /else if \(vegaProvider\) \{\s*els\.advancedWanSeed\?\.closest\("\.field"\)\?\.setAttribute\("hidden", ""\);\s*\}/);
  const options = sourceBetween(create, "function advancedVegaPayloadOptions(", "function advancedVegaUploadConfig(");
  for (const field of ["taskType", "generateAudio", "returnLastFrame", "returnVegaUsage", "enhancePromptMode", "moderationMode", "generateMode", "videoQualityMode", "outputFormat"]) {
    assert.match(options, new RegExp(`\\b${field}\\b(?=\\s*[:,])`));
  }
});

test("Vega submit payload includes every required field", () => {
  const branch = sourceBetween(create, "const vegaPayload = {", "const vegaPendingTaskId =");
  for (const field of ["provider", "duration", "resolution", "ratio", "seed", "mediaMode", "firstFrameUrl", "lastFrameUrl", "referenceImages", "referenceVideos", "referenceAudios"]) {
    assert.match(branch, new RegExp(`\\b${field}\\b(?=\\s*[:,])`));
  }
  assert.match(branch, /\.\.\.\(vegaDraftFollowup \? \{\} : \{ prompt \}\)/);
  assert.match(branch, /\.\.\.vegaOptions/);
  const options = sourceBetween(create, "function advancedVegaPayloadOptions(", "function advancedVegaUploadConfig(");
  for (const field of ["taskType", "draft", "draftTaskId", "assetGroupId", "generateAudio", "returnLastFrame", "returnVegaUsage", "enhancePromptMode", "moderationMode", "generateMode", "videoQualityMode", "outputFormat"]) {
    assert.match(options, new RegExp(`\\b${field}\\b(?=\\s*[:,])`));
  }
  assert.match(options, /caps\?\.generateMode === false \? \{\} : \{ generateMode:/);
  assert.match(options, /caps\?\.qualityMode === false \? \{} : \{ videoQualityMode:/);
  assert.match(options, /caps\?\.moderation === false \? \{\} : \{ moderationMode:/);
  assert.match(branch, /duration: vegaDraftFollowup \|\| \["edit", "extend"\]\.includes\(vegaTaskType\) \? -1 : vegaDuration/);
  assert.match(create, /requestJson\("\/api\/advanced\/generate", \{ method: "POST", body: vegaPayload \}\)/);
});

test("Vega local uploads use the dedicated public-URL upload path", () => {
  assert.match(main, /if \(isVegaAdvancedProvider\(provider\)\) \{[\s\S]*?await handleAdvancedVegaLocalFiles\(files\);[\s\S]*?return;/);
  const handler = sourceBetween(create, "async function handleAdvancedVegaLocalFiles(", "function dataUrlValue(");
  assert.match(handler, /uploadAdvancedImageReference\(file, \{ provider \}\)/);
  assert.match(handler, /uploadAdvancedMediaReference\(file, kind, \{ provider, skipReference: true \}\)/);
  assert.match(create, /function vegaPublicHttpUrl\(/);
  assert.match(create, /hostname === "localhost"[\s\S]*endsWith\("\.local"\)/);
});

test("Vega model entrypoints expose 1.0 Pro, 1.5 Pro, 1.5 Lite, and 1.0 Lite", () => {
  assert.deepEqual(vega.VEGA_PROVIDER_IDS, ["seedance20-vega", "seedance25-vega", "h3-vega", "vega10-lite"]);
  for (const text of [config, html, ui, server]) assert.doesNotMatch(text, /seedance20-(fast|mini|lite)-vega/);
  assert.match(html, /value="seedance20-vega">seedance2\.0（vega）/);
  assert.match(html, /value="seedance25-vega">seedance2\.5vega/);
  assert.match(html, /value="h3-vega">wan（vega）/);
  assert.match(html, /value="vega10-lite">h3（vega）/);
});

test("Vega public API docs expose all supported models and the full media contract", () => {
  for (const [id, label, version] of [
    ["seedance20-vega", "Vega 1\\.0 Pro", "1\\.0-pro"],
    ["seedance25-vega", "Vega 1\\.5 Pro", "1\\.5-pro"],
    ["h3-vega", "Vega 1\\.5 Lite", "1\\.5-lite"],
    ["vega10-lite", "Vega 1\\.0 Lite", "1\\.0-lite"],
  ]) {
    assert.match(server, new RegExp(`${id}"[\\s\\S]{0,120}label: "${label}"[\\s\\S]{0,120}modelVersion: "${version}"`));
  }
  assert.match(server, /Media: public HTTP\(S\) URLs only\. Vega 1\.0 Pro and 1\.5 Pro URLs are registered[\s\S]*?Url=asset:\/\/asset-\.\.\.\. Vega 1\.5 Lite and 1\.0 Lite continue to submit public FileInfos Type=Url\./);
  assert.match(server, /Asset IDs and data URLs are rejected/);
  assert.match(server, /Vega pricing is not configured/);
  assert.match(server, /durationSeconds: \{ integer: true, min: 2, max: 30, smart: -1/);
});

test("Vega dispatch is after prompt initialization to prevent a TDZ regression", () => {
  const promptIndex = server.indexOf("let prompt = String(firstPresent(");
  const dispatchIndex = server.indexOf("if (isVegaProvider(provider)) {", promptIndex);
  assert.ok(promptIndex > 0);
  assert.ok(dispatchIndex > promptIndex);
  assert.match(server.slice(promptIndex, dispatchIndex + 400), /prompt,\s*provider,\s*\}\);/);
});


test("Vega media helper maps all five public targets for every Vega model", () => {
  const assets = {
    primary: { id: "first", kind: "image", publicUrl: "https://cdn.example.com/first.png" },
    lastFrame: { id: "last", kind: "image", publicUrl: "https://cdn.example.com/last.png" },
    referenceImages: { id: "ref-image", kind: "image", publicUrl: "https://cdn.example.com/ref.png" },
    video: { id: "ref-video", kind: "video", publicUrl: "https://cdn.example.com/ref.mp4" },
    audio: { id: "ref-audio", kind: "audio", publicUrl: "https://cdn.example.com/ref.mp3" },
  };
  for (const provider of ["seedance25-vega", "h3-vega", "vega10-lite"]) {
    assert.ok(provider);
    assert.deepEqual(
      Object.keys(assets).map((targetId) => vegaMedia.selectionForAsset({ asset: assets[targetId], targetId }).action),
      ["firstFrame", "lastFrame", "referenceImage", "videoReference", "audioReference"],
    );
  }
});

test("Vega library assets become references without replacing first or last frame", () => {
  const source = sourceBetween(create, "function applyAdvancedVegaSelection(", "function syncAdvancedVegaUploadInput");
  assert.match(source, /selection\.action === "firstFrame"[\s\S]*state\.advancedSeedanceFirstFrameDataUrl = selection\.sourceUrl/);
  assert.match(source, /selection\.action === "lastFrame"[\s\S]*state\.advancedSeedanceLastFrameDataUrl = selection\.sourceUrl/);
  assert.match(source, /selection\.action === "referenceImage"[\s\S]*state\.advancedReferenceImages = dedupeAdvancedReferenceImages/);
  assert.doesNotMatch(source, /selection\.action === "referenceImage"[\s\S]{0,220}advancedSeedanceFirstFrameDataUrl\s*=/);
  assert.match(source, /selection\.action === "videoReference"[\s\S]*setAdvancedSeedanceVideoReferences/);
  assert.match(source, /selection\.action === "audioReference"[\s\S]*setAdvancedSeedanceAudioReferences/);
});

test("Vega media targets reject wrong types and non-public URLs", () => {
  const image = { id: "image", kind: "image", publicUrl: "https://cdn.example.com/a.png" };
  const video = { id: "video", kind: "video", publicUrl: "https://cdn.example.com/a.mp4" };
  assertCode(() => { if (!vegaMedia.selectionForAsset({ asset: video, targetId: "primary" }).ok) throw Object.assign(new Error(), { code: "WRONG_TYPE" }); }, "WRONG_TYPE");
  assertCode(() => { if (!vegaMedia.selectionForAsset({ asset: image, targetId: "audio" }).ok) throw Object.assign(new Error(), { code: "WRONG_TYPE" }); }, "WRONG_TYPE");
  for (const publicUrl of ["", "/uploads/a.png", "data:image/png;base64,abc", "http://localhost/a.png", "http://127.0.0.1/a.png", "http://10.0.0.1/a.png", "https://user:pass@cdn.example.com/a.png"]) {
    const result = vegaMedia.selectionForAsset({ asset: { ...image, publicUrl }, targetId: "primary" });
    assert.equal(result.ok, false);
    assert.equal(result.code, "PUBLIC_URL_REQUIRED");
  }
});

test("Vega upload inputs use target-specific accept and multiple settings", () => {
  assert.deepEqual(vegaMedia.uploadTargetConfig("primary"), { type: "image", accept: "image/*", multiple: false });
  assert.deepEqual(vegaMedia.uploadTargetConfig("lastFrame"), { type: "image", accept: "image/*", multiple: false });
  assert.deepEqual(vegaMedia.uploadTargetConfig("referenceImages"), { type: "image", accept: "image/*", multiple: true });
  assert.deepEqual(vegaMedia.uploadTargetConfig("video"), { type: "video", accept: "video/mp4,video/webm,video/quicktime,video/*", multiple: true });
  assert.deepEqual(vegaMedia.uploadTargetConfig("audio"), { type: "audio", accept: "audio/*", multiple: true });
  const sync = sourceBetween(create, "function syncAdvancedVegaUploadInput()", "function advancedAssetTargetItems()");
  assert.match(sync, /acceptsReferences[\s\S]*image\/\*,video\/mp4,video\/webm,video\/quicktime,video\/\*,audio\/\*/);
  assert.match(sync, /multiple = acceptsReferences \|\| advancedVegaUploadConfig\(\)\.multiple/);
  assert.match(main, /advancedAssetUploadInput\?\.addEventListener\("change", async \(\) => \{[\s\S]*if \(isVegaAdvancedProvider\(\)\) \{[\s\S]*await handleAdvancedVegaLocalFiles\(files\)/);
});

test("Vega asset targets and Add stay enabled in legacy video modes", () => {
  const allowance = sourceBetween(config, "function advancedCreateModeAllowsManualReferenceUpload(", "function currentAdvancedSeedanceUploadMode");
  assert.match(allowance, /if \(isVegaProviderId\(normalizedProvider\)\) return true;/);
  assert.match(create, /if \(isVegaAdvancedProvider\(provider\)\) \{[\s\S]*resolveAdvancedVegaAsset\(asset, target\.id\)/);
  const targets = sourceBetween(create, "function advancedAssetTargetItems()", "function activeAdvancedAssetTarget()");
  for (const target of ["primary", "lastFrame", "referenceImages", "video", "audio"]) assert.match(targets, new RegExp(`id: "${target}"`));
  assert.match(targets, /vegaModeNeedsFirstFrame\(vegaMode\)/);
  assert.match(targets, /vegaModeNeedsLastFrame\(vegaMode\)/);
  assert.match(targets, /vegaModeUsesReferences\(vegaMode\)/);
  assert.match(create, /const canAddAssetToGeneration = advancedCreateModeAllowsManualReferenceUpload\(\) && Boolean\(activeAdvancedAssetTarget\(\)\)/);
});

test("Vega Add resolves legacy local-only assets exactly once when a public URL is missing", () => {
  const resolver = sourceBetween(create, "async function resolveAdvancedVegaAsset(", "function advancedVegaUploadConfig(")
    + sourceBetween(create, "async function resolveAdvancedVegaAssets(", "async function resolveAdvancedVegaAsset(");
  assert.match(resolver, /selection\.code !== "PUBLIC_URL_REQUIRED"/);
  assert.match(resolver, /requestJson\("\/api\/user-assets\/resolve"/);
  assert.match(resolver, /provider: currentAdvancedProvider\(\),[\s\S]*requirePublicUrl: true/);
  assert.match(resolver, /advancedVegaSelection\(mergeAdvancedResolvedAsset\(asset, resolved\), targetId\)/);
  const add = sourceBetween(create, "async function addAssetToAdvancedTarget(", "if (!assetMatchesTarget(asset, target))");
  assert.match(add, /resolveAdvancedVegaAsset\(asset, target\.id\)/);
  const upload = sourceBetween(create, "async function handleAdvancedVegaLocalFiles(", "function dataUrlValue(");
  assert.match(upload, /resolveAdvancedVegaAsset\(asset, targetId\)/);
});

test("Vega submit resolves every selected asset before building media URLs", () => {
  const branch = sourceBetween(create, "if (isVegaAdvancedProvider(provider)) {", "const vegaPendingTaskId =");
  assert.match(branch, /const vegaAssetIds = uniqueAdvancedAssetIds\(\[/);
  assert.match(branch, /const resolvedVegaAssets = await resolveAdvancedVegaAssets\(vegaAssetIds\)/);
  assert.match(branch, /const resolvedFirstFrame = resolvedVegaAssets\.get\(state\.advancedSeedanceFirstFrameAssetId\)/);
  assert.match(branch, /const resolvedLastFrame = resolvedVegaAssets\.get\(state\.advancedSeedanceLastFrameAssetId\)/);
  assert.match(branch, /if \(firstFrameUrl\) state\.advancedSeedanceFirstFrameDataUrl = firstFrameUrl/);
  assert.match(branch, /if \(lastFrameUrl\) state\.advancedSeedanceLastFrameDataUrl = lastFrameUrl/);
  const resolveIndex = branch.indexOf("const resolvedVegaAssets = await resolveAdvancedVegaAssets");
  const firstSourceIndex = branch.indexOf("const vegaFirstFrameSource =");
  const payloadIndex = branch.indexOf("const vegaPayload =");
  assert.ok(resolveIndex > 0 && firstSourceIndex > resolveIndex && payloadIndex > firstSourceIndex);
  assert.match(branch, /const vegaFirstFrameUrl = vegaFirstFrameSource \? vegaMediaSource\(\{ url: vegaFirstFrameSource \}\) : ""/);
});

test("Asset target categories quickly filter the asset list and keep the add target", () => {
  assert.match(html, /id="advancedAssetTargets"/);
  const render = sourceBetween(create, "function renderAdvancedAssetTargets()", "function renderAdvancedAssets(");
  assert.match(render, /data-advanced-asset-target/);
  assert.match(render, /data-advanced-asset-type/);
  assert.match(render, /filterAdvancedAssetsByType\(button\.dataset\.advancedAssetType \|\| ""\)/);
  const filter = sourceBetween(create, "function filterAdvancedAssetsByType(", "function renderAdvancedAssetTargets(");
  assert.match(filter, /els\.advancedAssetTypeFilter\.value = type/);
  assert.match(filter, /state\.advancedAssetsLoaded = false/);
  assert.match(filter, /renderAdvancedAssets\(\[\]\)/);
  assert.match(filter, /loadAdvancedAssets\(1\)/);
  assert.match(main, /advancedAssetTypeFilter.*change[\s\S]*filterAdvancedAssetsByType/);
  const load = sourceBetween(create, "async function loadAdvancedAssets(", "async function uploadAdvancedAssets(");
  assert.match(load, /const requestSeq = Number\(state\.advancedAssetLoadSeq \|\| 0\) \+ 1/);
  assert.match(load, /requestSeq !== state\.advancedAssetLoadSeq/);
  assert.ok(load.indexOf("params.set(\"type\"") < load.indexOf("requestSeq !== state.advancedAssetLoadSeq"));
  const preferred = sourceBetween(create, "function preferredAdvancedAssetTargetForAsset(", "function advancedSourceImageAssetId(");
  assert.match(preferred, /if \(active\?\.type === kind\) return active\.id/);
  const add = sourceBetween(create, "async function addAssetToAdvancedTarget(", "const url = assetPreviewUrl(asset)");
  assert.match(add, /const preferredTarget = preferredAdvancedAssetTargetForAsset\(asset\);[\s\S]*if \(preferredTarget\) state\.advancedAssetTarget = preferredTarget/);
  const upload = sourceBetween(create, "async function handleAdvancedVegaLocalFiles(", "function dataUrlValue(");
  assert.match(upload, /const autoTarget = autoAdvancedAssetTargetForAsset\(\{ kind \}\)/);
});

test("Vega resolve and upload require a real public mirror without local fallback", () => {
  const ensure = sourceBetween(server, "async function ensureVegaPublicUrlForUserAsset(", "async function arkOpenApiAction(");
  assert.match(ensure, /ensurePublicUrlForUserAsset\(db, userAsset\)/);
  assert.match(ensure, /isPublicHttpUrl\(value\)/);
  assert.match(ensure, /VEGA_ASSET_PUBLIC_URL_UNAVAILABLE/);
  assert.match(ensure, /statusCode = 502/);
  const resolve = sourceBetween(server, "async function handleResolveUserAssets(", "async function handleDeleteUserAsset(");
  assert.match(resolve, /requirePublicUrl = Boolean\(body\.requirePublicUrl\) \|\| isVegaProvider\(body\.provider\)/);
  assert.match(resolve, /ensureVegaPublicUrlForUserAsset\(auth\.db, asset\)/);
  const upload = sourceBetween(server, "async function handleUploadUserAsset(", "function decodedUploadFileName(");
  assert.match(upload, /if \(isVegaProvider\(uploadProvider\)\) \{[\s\S]*ensureVegaPublicUrlForUserAsset\(auth\.db, userAsset\)/);
  const publicUrlBranch = sourceBetween(upload, "if (publicUrl) {", "let { mime, bytes }");
  assert.match(publicUrlBranch, /let userAsset = await createUserMediaAssetFromPublicUrl/);
  assert.match(publicUrlBranch, /if \(isVegaProvider\(uploadProvider\)\) \{[\s\S]*ensureVegaPublicUrlForUserAsset\(auth\.db, userAsset\)/);
  const publicAsset = sourceBetween(server, "function publicUserAsset(asset = {})", "function wan27ImageModifyPricing(");
  assert.match(publicAsset, /cdnUrl: asset\.cdnUrl \|\| ""/);
});

test("Vega model refresh preserves selected provider and model settings", () => {
  const apply = sourceBetween(ui, "function applyAdvancedCreateMode(", "function renderAdvancedCreateControls(");
  assert.match(apply, /function applyAdvancedCreateMode\(\{ clearMedia = false, syncForm = true \} = \{\}\)/);
  assert.match(apply, /if \(!custom && syncForm\) \{/);
  assert.match(apply, /if \(els\.advancedRatio\) els\.advancedRatio\.value = "9:16"/);
  const refresh = sourceBetween(create, "function updateAdvancedModelControls()", "function triggerAdvancedLocalImageUpload(");
  assert.match(refresh, /applyAdvancedCreateMode\(\{ syncForm: false \}\)/);
});

test("Vega dedicated frame and shared upload paths preserve the selected target", () => {
  assert.match(main, /advancedSeedanceFirstFrame[\s\S]*isVegaAdvancedProvider\(\)[\s\S]*state\.advancedAssetTarget = "primary"[\s\S]*handleAdvancedVegaLocalFiles/);
  assert.match(main, /advancedSeedanceLastFrame[\s\S]*isVegaAdvancedProvider\(\)[\s\S]*state\.advancedAssetTarget = "lastFrame"[\s\S]*handleAdvancedVegaLocalFiles/);
  assert.match(create, /if \(isVegaAdvancedProvider\(provider\)\) \{[\s\S]*const targets = advancedAssetTargetItems\(\);[\s\S]*targets\.some\(\(item\) => item\.id === target\)/);
  const upload = sourceBetween(create, "async function uploadAdvancedMediaReference(", "function addAdvancedSeedanceMediaReference(");
  assert.match(upload, /advancedVideoInputDurationMessage\(durationSeconds, provider, currentAdvancedVideoCapability\(\)\)/);
  assert.match(upload, /addAdvancedPendingReference\(kind, file, \{ provider \}\)/);
});

test("Vega reference previews include image, video, audio and dedicated frames", () => {
  const previews = sourceBetween(create, "function renderAdvancedReferencePreviews()", "function updateAdvancedReferenceSummary()");
  assert.match(previews, /advancedReferenceDisplayItems\(provider\)/);
  assert.match(previews, /kind === "video"/);
  assert.match(previews, /kind === "audio"/);
  assert.match(create, /\.seedance-first-frame/);
  assert.match(create, /\.seedance-last-frame/);
  assert.match(create, /isVegaAdvancedProvider\(provider\)/);
});

test("Vega controls expose seed and never send ReferenceType", () => {
  assert.match(html, /id="advancedWanSeed"/);
  assert.match(create, /function vegaCurrentSeed\(\)[\s\S]*els\.advancedWanSeed/);
  const payload = sourceBetween(create, "const vegaPayload = {", "const vegaPendingTaskId =");
  assert.doesNotMatch(payload, /ReferenceType|reference_type/);
});


test("Vega media helper is loaded and served by the production asset whitelist", () => {
  assert.match(loader, /"platform\.vega-media\.js"/);
  assert.match(server, /"platform\.config\.js",\s*"platform\.vega-media\.js",\s*"platform\.copy\.js"/);
});

test("Asset video Add fails when the active model has no video reference capacity", () => {
  const addReference = sourceBetween(create, "function addAdvancedSeedanceMediaReference(", "function dedupeAdvancedMediaReferences(");
  assert.match(addReference, /const limit = kind === "audio" \? advancedAudioReferenceLimit\(\) : advancedVideoReferenceLimit\(\)/);
  assert.match(addReference, /if \(limit <= 0\) return \{ ok: false, code: "REFERENCE_NOT_SUPPORTED"/);
  assert.match(addReference, /savedRefs\.find/);
  assert.match(addReference, /if \(!savedRef\) return \{ ok: false, code: "REFERENCE_NOT_ADDED"/);
  const add = sourceBetween(create, "async function addAssetToAdvancedTarget(", "function publicAliyunModelsEnabled(");
  assert.match(add, /const result = addAdvancedSeedanceMediaReference\(asset, "video"\)/);
  assert.match(add, /if \(!result\.ok\)[\s\S]*advancedMediaReferenceAddError\(result, "video"\)[\s\S]*return;/);
  assert.match(add, /const result = addAdvancedSeedanceMediaReference\(asset, "audio"\)/);
  assert.match(add, /if \(!result\.ok\)[\s\S]*advancedMediaReferenceAddError\(result, "audio"\)[\s\S]*return;/);
  const targets = sourceBetween(create, "function advancedAssetTargetItems()", "function activeAdvancedAssetTarget()");
  assert.match(targets, /advancedVideoReferenceLimit\(provider\) > 0[\s\S]*id: "video"/);
  assert.match(targets, /advancedAudioReferenceLimit\(provider\) > 0[\s\S]*id: "audio"/);
});

test("Seedance 2.5 reference-video modes expose and persist video references", () => {
  const modeHelpers = sourceBetween(config, "function normalizeSeedanceMediaMode(", "function advancedCreateModeUsesAutoPrompt(");
  const limitHelpers = sourceBetween(create, "function advancedVideoReferenceLimit(", "const ADVANCED_IMAGE_PROVIDERS");
  const addReference = sourceBetween(create, "function addAdvancedSeedanceMediaReference(", "function dedupeAdvancedMediaReferences(");
  let provider = "seedance25";
  let videoRefs = [];
  let audioRefs = [];
  const els = { advancedSeedanceMediaMode: { value: "reference_video" } };
  const load = new Function(
    "els",
    "currentAdvancedProvider",
    "normalizeAdvancedProvider",
    "ADVANCED_SEEDANCE25_VIDEO_REFERENCE_LIMIT",
    "ADVANCED_SEEDANCE25_AUDIO_REFERENCE_LIMIT",
    "ADVANCED_SEEDANCE_VIDEO_REFERENCE_LIMIT",
    "ADVANCED_SEEDANCE_AUDIO_REFERENCE_LIMIT",
    "ADVANCED_WAN30_VIDEO_REFERENCE_LIMIT",
    "ADVANCED_WAN30_AUDIO_REFERENCE_LIMIT",
    "vegaReferenceLimits",
    "isVegaProviderId",
    "assetPreviewUrl",
    "stampAdvancedReferenceOrder",
    "advancedSeedanceVideoReferences",
    "setAdvancedSeedanceVideoReferences",
    "advancedSeedanceAudioReferences",
    "setAdvancedSeedanceAudioReferences",
    "dedupeAdvancedMediaReferences",
    "syncSeedanceReferenceMode",
    `${modeHelpers}\n${limitHelpers}\n${addReference}\nreturn { advancedVideoReferenceLimit, advancedAudioReferenceLimit, addAdvancedSeedanceMediaReference };`,
  );
  const api = load(
    els,
    () => provider,
    (value) => String(value || "").toLowerCase(),
    10,
    10,
    3,
    3,
    5,
    5,
    () => ({ videos: 0, audios: 0 }),
    () => false,
    (asset) => asset.previewUrl || asset.url || "",
    (ref) => ref,
    () => videoRefs,
    (refs) => { videoRefs = refs; },
    () => audioRefs,
    (refs) => { audioRefs = refs; },
    (refs) => refs.filter((ref, index) => refs.findIndex((item) => item.assetId === ref.assetId) === index),
    () => {},
  );

  assert.equal(api.advancedVideoReferenceLimit("seedance25"), 10);
  assert.equal(api.advancedAudioReferenceLimit("seedance25"), 10);
  const result = api.addAdvancedSeedanceMediaReference({ id: "video-1", previewUrl: "https://cdn.example/video.mp4" }, "video");
  assert.equal(result.ok, true);
  assert.equal(videoRefs.length, 1);
  assert.equal(videoRefs[0].assetId, "video-1");

  els.advancedSeedanceMediaMode.value = "omini";
  assert.equal(api.advancedVideoReferenceLimit("seedance25"), 10);
  assert.equal(api.advancedAudioReferenceLimit("seedance25"), 10);

  provider = "seedance-nsfw";
  videoRefs = [];
  assert.equal(api.advancedVideoReferenceLimit("seedance-nsfw"), 10);
  assert.equal(api.advancedAudioReferenceLimit("seedance-nsfw"), 10);
  assert.equal(api.addAdvancedSeedanceMediaReference({ id: "video-2", previewUrl: "https://cdn.example/video-2.mp4" }, "video").ok, true);
  assert.equal(videoRefs.length, 1);

  els.advancedSeedanceMediaMode.value = "edit";
  assert.equal(api.advancedVideoReferenceLimit("seedance-nsfw"), 1);
  assert.equal(api.advancedAudioReferenceLimit("seedance-nsfw"), 0);
  els.advancedSeedanceMediaMode.value = "extend";
  assert.equal(api.advancedVideoReferenceLimit("seedance-nsfw"), 1);
  assert.equal(api.advancedAudioReferenceLimit("seedance-nsfw"), 0);

  els.advancedSeedanceMediaMode.value = "first_last_frame";
  assert.equal(api.advancedVideoReferenceLimit("seedance25"), 0);
  assert.equal(api.advancedAudioReferenceLimit("seedance25"), 0);
  assert.equal(api.advancedVideoReferenceLimit("seedance-nsfw"), 0);
  assert.equal(api.advancedAudioReferenceLimit("seedance-nsfw"), 0);
});
