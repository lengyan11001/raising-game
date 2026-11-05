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

test("Vega Lite omits unsupported GenerateMode and VideoQualityMode", () => {
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
  assert.equal(proWand.GenerateMode, "StandardMovie");
  assert.equal(proWand.VideoQualityMode, "Fast");
  assert.equal(vega.vegaProviderCapabilities("h3-vega").generateMode, false);
  assert.equal(vega.vegaProviderCapabilities("h3-vega").qualityMode, false);
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
    referenceAudios: ["https://cdn.example.com/ref.mp3"],
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

test("Vega draft follow-up ignores stale media and keeps only draft output settings", () => {
  const payload = vega.buildVegaCreatePayload({
    provider: "seedance25-vega",
    prompt: "stale prompt must not be sent",
    draftTaskId: "draft-task-123",
    duration: -1,
    resolution: "1080P",
    mediaMode: "reference_video",
    firstFrameUrl: "https://cdn.example.com/first.png",
    lastFrameUrl: "https://cdn.example.com/last.png",
    referenceImages: ["https://cdn.example.com/ref.png"],
    referenceVideos: ["https://cdn.example.com/ref.mp4"],
    referenceAudios: ["https://cdn.example.com/ref.mp3"],
  }, { subAppId: 123 });
  assert.equal(Object.prototype.hasOwnProperty.call(payload, "Prompt"), false);
  assert.equal(Object.prototype.hasOwnProperty.call(payload, "FileInfos"), false);
  assert.equal(Object.prototype.hasOwnProperty.call(payload, "Seed"), false);
  assert.deepEqual(payload.OutputConfig, { StorageMode: "Temporary", Resolution: "1080P" });
  const extInfo = JSON.parse(payload.ExtInfo);
  assert.deepEqual(JSON.parse(extInfo.AdditionalParameters), { draft_task_id: "draft-task-123" });
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
  assert.equal(wand.GenerateMode, "Standard");
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
  assert.match(regenerate, /body\.referenceImages = regeneratedMedia\.referenceImages\.map\(\(url\) => \(\{ url \}\)\)/);
  assert.match(regenerate, /body\.referenceVideos = regeneratedMedia\.referenceVideos\.map\(\(url\) => \(\{ url \}\)\)/);
  assert.match(regenerate, /body\.referenceAudios = regeneratedMedia\.referenceAudios\.map\(\(url\) => \(\{ url \}\)\)/);
  for (const field of ["taskType", "draft", "draftTaskId", "assetGroupId", "generateAudio", "returnLastFrame", "returnVegaUsage", "enhancePromptMode", "moderationMode", "generateMode", "videoQualityMode", "outputFormat"]) {
    assert.match(regenerate, new RegExp(`body\\.${field}\\s*=`));
  }
  assert.doesNotMatch(regenerate, /reference_type|ReferenceType/);
});

test("Vega UI options are appended after existing video models with exact labels", () => {
  const videoGroup = html.match(/<optgroup label="Video">([\s\S]*?)<\/optgroup>/)?.[1] || "";
  const options = [...videoGroup.matchAll(/<option value="([^"]+)"[^>]*>([^<]+)<\/option>/g)].map((match) => [match[1], match[2]]);
  assert.deepEqual(options.slice(-3), [
    ["seedance25-vega", "Vega 1.5 Pro"],
    ["h3-vega", "Vega 1.5 Lite"],
    ["vega10-lite", "Vega 1.0 Lite"],
  ]);
  assert.equal(options.some(([id]) => /^seedance20-(?:fast-|mini-|lite-)?vega$/.test(id)), false);
  assert.deepEqual(options.slice(0, 6).map(([id]) => id), ["seedance-nsfw", "wan30", "wan30-prime", "wan27", "happyhorse", "seedance"]);
  assert.match(ui, /if \(VEGA_MODEL_LABELS\[normalized\]\) return VEGA_MODEL_LABELS\[normalized\]/);
  for (const [id, label] of [
    ["seedance25-vega", "Vega 1\.5 Pro"],
    ["h3-vega", "Vega 1\.5 Lite"],
  ]) assert.match(config, new RegExp(`"${id}": "${label}"`));
});

test("Vega UI exposes the full capability matrix and duration controls", () => {
  for (const id of ["seedance25-vega", "h3-vega"]) {
    assert.match(config, new RegExp(`"${id}"`));
  }
  assert.match(config, /VEGA_ALL_RESOLUTIONS = Object\.freeze\(\["480P", "720P", "768P", "1080P", "2K", "4K"\]\)/);
  assert.match(config, /VEGA_ALL_RATIOS = Object\.freeze\(\["21:9", "16:9", "4:3", "1:1", "3:4", "9:16", "adaptive"\]\)/);
  assert.match(config, /"seedance25-vega": Object\.freeze\(\{ min: 4, max: 30, fallback: 5, smart: true \}\)/);
  assert.match(config, /"h3-vega": Object\.freeze\(\{ min: 2, max: 30, fallback: 6, smart: true \}\)/);
  assert.match(ui, /advancedPricingUnavailableLabel/);
  assert.match(ui, /MODEL_PRICING_UNAVAILABLE/);
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

test("Vega model entrypoints expose 1.5 Pro, 1.5 Lite, and 1.0 Lite", () => {
  assert.deepEqual(vega.VEGA_PROVIDER_IDS, ["seedance25-vega", "h3-vega", "vega10-lite"]);
  assert.doesNotMatch(config, /seedance20-(fast-|mini-|lite-)?vega/);
  assert.doesNotMatch(html, /seedance20-(fast-|mini-|lite-)?vega/);
  assert.doesNotMatch(ui, /seedance20-(fast-|mini-|lite-)?vega/);
  assert.doesNotMatch(server, /seedance20-(fast-|mini-|lite-)?vega/);
  assert.match(html, /value="seedance25-vega">Vega 1\.5 Pro/);
  assert.match(html, /value="h3-vega">Vega 1\.5 Lite/);
});

test("Vega public API docs expose all supported models and the full media contract", () => {
  for (const [id, label, version] of [
    ["seedance25-vega", "Vega 1\\.5 Pro", "1\\.5-pro"],
    ["h3-vega", "Vega 1\\.5 Lite", "1\\.5-lite"],
    ["vega10-lite", "Vega 1\\.0 Lite", "1\\.0-lite"],
  ]) {
    assert.match(server, new RegExp(`${id}"[\\s\\S]{0,120}label: "${label}"[\\s\\S]{0,120}modelVersion: "${version}"`));
  }
  assert.match(server, /Media: public HTTP\(S\) URLs only\. FileInfos use .*Usage/);
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
  assert.match(branch, /const vegaFirstFrameUrl = vegaFirstFrameSource \? vegaPublicHttpUrl\(vegaFirstFrameSource\) : ""/);
});

test("Vega Add never overrides the explicitly selected media target", () => {
  const preferred = sourceBetween(create, "function preferredAdvancedAssetTargetForAsset(", "function advancedSourceImageAssetId(");
  assert.match(preferred, /if \(isVegaAdvancedProvider\(\)\) return ""/);
  const add = sourceBetween(create, "async function addAssetToAdvancedTarget(", "const url = assetPreviewUrl(asset)");
  assert.match(add, /const preferredTarget = preferredAdvancedAssetTargetForAsset\(asset\);[\s\S]*if \(preferredTarget\) state\.advancedAssetTarget = preferredTarget/);
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
