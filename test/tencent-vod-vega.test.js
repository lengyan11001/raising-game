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
    ["seedance20-vega", "Seedance 2.0（Vega）", "wand-vega-video", "1.0-pro"],
    ["seedance25-vega", "Seedance 2.5（Vega）", "wand-vega-video", "1.5-pro"],
    ["h3-vega", "H3（Vega）", "wand-vega-video", "1.5-lite"],
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

test("Vega duration validates boundaries, defaults, and integer seconds", () => {
  assert.equal(vega.normalizeVegaDuration("seedance20-vega"), 5);
  assert.equal(vega.normalizeVegaDuration("seedance25-vega", 1), 1);
  assert.equal(vega.normalizeVegaDuration("h3-vega"), 6);
  assert.equal(vega.normalizeVegaDuration("h3-vega", 15), 15);
  assertCode(() => vega.normalizeVegaDuration("h3-vega", 0), "INVALID_DURATION");
  assertCode(() => vega.normalizeVegaDuration("h3-vega", 16), "INVALID_DURATION");
  assertCode(() => vega.normalizeVegaDuration("h3-vega", 2.5), "INVALID_DURATION");
});

test("Vega resolution and ratio accept only documented values", () => {
  for (const value of ["768P", "1080P", "2K", "4K", "2k", "4k"]) assert.equal(vega.normalizeVegaResolution(value), value.toUpperCase());
  assertCode(() => vega.normalizeVegaResolution("720P"), "INVALID_RESOLUTION");
  for (const value of ["21:9", "16:9", "4:3", "1:1", "3:4", "9:16"]) assert.equal(vega.normalizeVegaRatio(value), value);
  assertCode(() => vega.normalizeVegaRatio("adaptive"), "INVALID_RATIO");
});

test("Vega FileInfos use Usage and never ReferenceType", () => {
  const files = vega.buildVegaFileInfos({
    firstFrameUrl: "https://cdn.example.com/first.png",
    lastFrameUrl: "https://cdn.example.com/last.png",
    referenceImages: ["https://cdn.example.com/ref.png"],
    referenceVideos: ["https://cdn.example.com/ref.mp4"],
    referenceAudios: ["https://cdn.example.com/ref.mp3"],
  });
  assert.deepEqual(files.map((item) => item.Usage), ["FirstFrame", "LastFrame", "Reference", "Reference", "Reference"]);
  assert.deepEqual(files.map((item) => item.Category), ["Image", "Image", "Image", "Video", "Audio"]);
  assert.ok(files.every((item) => item.Type === "Url" && !Object.prototype.hasOwnProperty.call(item, "ReferenceType")));
  const payload = vega.buildVegaCreatePayload({
    provider: "seedance20-vega",
    prompt: "test",
    firstFrameUrl: "https://cdn.example.com/first.png",
    lastFrameUrl: "https://cdn.example.com/last.png",
  }, { subAppId: 123 });
  assert.equal(payload.EnhancePromptMode, "disable");
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

test("Vega last frame requires a first frame", () => {
  assertCode(() => vega.buildVegaCreatePayload({
    provider: "h3-vega",
    prompt: "test",
    lastFrameUrl: "https://cdn.example.com/last.png",
  }, { subAppId: 1 }), "INVALID_MEDIA_COMBINATION");
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
  assert.match(regenerate, /body\.firstFrameUrl = firstFrameUrl/);
  assert.match(regenerate, /body\.lastFrameUrl = lastFrameUrl/);
  assert.match(regenerate, /body\.referenceImages = referenceImages\.map\(\(url\) => \(\{ url \}\)\)/);
  assert.match(regenerate, /body\.referenceVideos = referenceVideos\.map\(\(url\) => \(\{ url \}\)\)/);
  assert.match(regenerate, /body\.referenceAudios = referenceAudios\.map\(\(url\) => \(\{ url \}\)\)/);
  assert.doesNotMatch(regenerate, /reference_type|ReferenceType/);
});

test("Vega UI options are appended after existing video models with exact labels", () => {
  const videoGroup = html.match(/<optgroup label="Video">([\s\S]*?)<\/optgroup>/)?.[1] || "";
  const options = [...videoGroup.matchAll(/<option value="([^"]+)"[^>]*>([^<]+)<\/option>/g)].map((match) => [match[1], match[2]]);
  assert.deepEqual(options.slice(-3), [
    ["seedance20-vega", "Seedance 2.0（Vega）"],
    ["seedance25-vega", "Seedance 2.5（Vega）"],
    ["h3-vega", "H3（Vega）"],
  ]);
  assert.deepEqual(options.slice(0, 6).map(([id]) => id), ["seedance-nsfw", "wan30", "wan30-prime", "wan27", "happyhorse", "seedance"]);
  assert.match(ui, /if \(normalized === "seedance20-vega"\) return "Seedance 2\.0（Vega）"/);
  assert.match(ui, /if \(normalized === "seedance25-vega"\) return "Seedance 2\.5（Vega）"/);
  assert.match(ui, /if \(normalized === "h3-vega"\) return "H3（Vega）"/);
});

test("Vega UI exposes only the documented resolution, ratio, and duration controls", () => {
  assert.match(ui, /\["seedance20-vega", "seedance25-vega", "h3-vega"\]\.includes\(normalizeAdvancedProvider\(provider\)\)\) return \["768P", "1080P", "2K", "4K"\]/);
  assert.match(ui, /return \{ min: 1, max: 15, fallback: normalized === "h3-vega" \? 6 : 5 \}/);
  assert.match(ui, /normalized === "h3-vega" \? 6 : 5/);
  assert.match(create, /vegaProvider[\s\S]*\["21:9", "16:9", "4:3", "1:1", "3:4", "9:16"\]/);
  assert.match(ui, /advancedPricingUnavailableLabel/);
  assert.match(ui, /MODEL_PRICING_UNAVAILABLE/);
});

test("Vega submit payload includes every required field", () => {
  const branch = sourceBetween(create, "const vegaPayload = {", "const vegaPendingTaskId =");
  for (const field of ["provider", "prompt", "duration", "resolution", "ratio", "seed", "firstFrameUrl", "lastFrameUrl", "referenceImages", "referenceVideos", "referenceAudios"]) {
    assert.match(branch, new RegExp(`\\b${field}\\b(?=\\s*[:,])`));
  }
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

test("Vega public API docs expose exact models and the required media contract", () => {
  assert.match(server, /seedance20-vega", label: "Seedance 2\.0（Vega）", modelName: "wand-vega-video", modelVersion: "1\.0-pro"/);
  assert.match(server, /seedance25-vega", label: "Seedance 2\.5（Vega）", modelName: "wand-vega-video", modelVersion: "1\.5-pro"/);
  assert.match(server, /h3-vega", label: "H3（Vega）", modelName: "wand-vega-video", modelVersion: "1\.5-lite"/);
  assert.match(server, /Media: public HTTP\(S\) URLs only\. FileInfos use .*Usage/);
  assert.match(server, /Asset IDs and data URLs are rejected/);
  assert.match(server, /Vega pricing is not configured/);
  assert.match(server, /Duration: 1-15|durationSeconds: \{ integer: true, min: 1, max: 15/);
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
  for (const provider of ["seedance20-vega", "seedance25-vega", "h3-vega"]) {
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
  assert.match(create, /function syncAdvancedVegaUploadInput\(\)[\s\S]*accept = config\.accept;[\s\S]*multiple = config\.multiple/);
  assert.match(main, /advancedAssetUploadInput\?\.addEventListener\("change", async \(\) => \{[\s\S]*if \(isVegaAdvancedProvider\(\)\) \{[\s\S]*await handleAdvancedVegaLocalFiles\(files\)/);
});

test("Vega asset targets and Add stay enabled in legacy video modes", () => {
  const allowance = sourceBetween(config, "function advancedCreateModeAllowsManualReferenceUpload(", "function currentAdvancedSeedanceUploadMode");
  assert.match(allowance, /seedance20-vega", "seedance25-vega", "h3-vega"\]\.includes\(normalizedProvider\)\) return true/);
  assert.match(create, /if \(isVegaAdvancedProvider\(provider\)\) \{[\s\S]*resolveAdvancedVegaAsset\(asset, target\.id\)/);
  const targets = sourceBetween(create, "function advancedAssetTargetItems()", "function activeAdvancedAssetTarget()");
  for (const target of ["primary", "lastFrame", "referenceImages", "video", "audio"]) assert.match(targets, new RegExp(`id: "${target}"`));
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
  assert.match(create, /if \(isVegaAdvancedProvider\(provider\)\) \{[\s\S]*const target = state\.advancedAssetTarget;[\s\S]*state\.advancedAssetTarget = \["primary", "lastFrame", "referenceImages"\]\.includes\(target\)/);
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
