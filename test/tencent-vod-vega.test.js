"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const vega = require("../tencent-vod-vega");
const providers = require("../lib-providers");
const server = read("server.js");
const html = read("platform.html");
const ui = read("platform.ui.js");
const create = read("platform.create.js");
const main = read("platform.main.js");

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
  assert.match(handler, /uploadAdvancedMediaReference\(file, "video"\)/);
  assert.match(handler, /uploadAdvancedMediaReference\(file, "audio"\)/);
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
