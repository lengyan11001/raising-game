"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const serverSource = fs.readFileSync(path.join(__dirname, "..", "server.js"), "utf8");
const copySource = fs.readFileSync(path.join(__dirname, "..", "platform.copy.js"), "utf8");
const uiSource = fs.readFileSync(path.join(__dirname, "..", "platform.ui.js"), "utf8");
const markdownSource = fs.readFileSync(path.join(__dirname, "..", "docs", "aliyun-models.md"), "utf8");
const aliyunVideoSource = fs.readFileSync(path.join(__dirname, "..", "aliyun-video.js"), "utf8");
const providersSource = fs.readFileSync(path.join(__dirname, "..", "lib-providers.js"), "utf8");
const publicMarkdownSource = [
  serverSource.slice(serverSource.indexOf("function mulerouterRoutingMarkdown"), serverSource.indexOf("function seedream5ImageParameterFields")),
  serverSource.slice(serverSource.indexOf("function wan30VideoParameterFields"), serverSource.indexOf("function seedance25VideoParameterFields")),
  serverSource.slice(serverSource.indexOf("function zImageSpicyProParameterFields"), serverSource.indexOf("function qwenImage3ParameterFields")),
  serverSource.slice(serverSource.indexOf("function advancedConstraintsMarkdown"), serverSource.indexOf("function externalAdvancedApiMarkdown")),
].join("\n");

test("external model docs list every currently supported model family", () => {
  for (const marker of [
    "Seedance 2.0 Standard",
    "Seedance 2.0 Fast",
    "W3.0",
    "W3.0-Pro",
    "W3.0-Prime",
    "W3.0-VSR-Prime",
    "Seedance 2.5",
    "Seedance 2.5 Video (seedance-nsfw)",
    "w3.0-video",
    "w3.0-video-pro",
    "w3.0-video-prime",
    "w3.0-video-prime-pro",
    "Seedream 5.0 Pro",
    "Qwen Image 3.0",
    "Z-Image Spicy Pro",
    "Qwen Image Edit Spicy",
  ]) {
    assert.match(serverSource, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
});

test("external docs cover advanced request fields and polling without internal credentials", () => {
  for (const functionName of [
    "advancedAssetParameterFields",
    "wan30VideoParameterFields",
    "seedance25VideoParameterFields",
    "seedanceNsfwVideoParameterFields",
    "zImageSpicyProParameterFields",
    "qwenImageEditSpicyParameterFields",
    "mulerouterRoutingMarkdown",
  ]) {
    assert.match(serverSource, new RegExp(`function ${functionName}\\([^)]*\\)`));
  }
  assert.match(serverSource, /\/api\/generation-records\/<taskId>/);
  assert.match(serverSource, /PNG transparency is not supported/);
  assert.match(serverSource, /input-video seconds plus output duration must not exceed 30 seconds/);
  assert.doesNotMatch(serverSource.slice(serverSource.indexOf("function externalAdvancedApiDoc"), serverSource.indexOf("function docsPricingView")), /API_KEY|Secret Access Key|ep-\d/);
});

test("selective model exposure still produces complete and valid Markdown", () => {
  const start = serverSource.indexOf("function buildRestrictedModelDocsMarkdown");
  const end = serverSource.indexOf("function templateDocMarkdown", start);
  const source = serverSource.slice(start, end);
  assert.doesNotMatch(source, /\.join\("\\\\n"\)/);
  for (const marker of [
    "byteplusV3ParameterMarkdown()",
    "seedream5ImageParameterFields()",
    "qwenImage3ParameterFields()",
    "wan30VideoParameterFields",
    "seedance25VideoParameterFields",
    "seedanceNsfwVideoParameterFields",
    "zImageSpicyProParameterFields",
    "qwenImageEditSpicyParameterFields",
    "mulerouterRoutingMarkdown()",
    "Advanced Task Polling",
  ]) {
    assert.match(source, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
});

test("Copy token plus docs advertises all model routes and loads the live markdown source", () => {
  assert.match(copySource, /const ADVANCED_VIDEO_ACCESS_COPY/);
  assert.match(copySource, /W3\.0, W3\.0-Pro, W3\.0-Prime, W3\.0-VSR-Prime, and Seedance 2\.5 use the asynchronous Advanced endpoint/);
  // Retired models stay out of the caller-facing copy while their routes keep working internally.
  assert.doesNotMatch(copySource, /Wan 2\.7|wan2\.7-i2v-spicy/);
  assert.doesNotMatch(copySource, /HappyHorse/);
  assert.doesNotMatch(copySource, /Wan Animate/);
  assert.match(copySource, /Mulerouter routing/);
  assert.match(copySource, /z-image-spicy-pro/);
  assert.match(copySource, /qwen-image-edit-spicy/);
  for (const node of ["w3.0-video", "w3.0-video-pro", "w3.0-video-prime", "w3.0-video-prime-pro"]) {
    assert.match(copySource, new RegExp(node.replace(/\./g, "\\.")));
    assert.match(serverSource, new RegExp(node.replace(/\./g, "\\.")));
  }
  assert.doesNotMatch(copySource, /"videoCapability":"wan30-video"/);
  assert.doesNotMatch(copySource, /"videoCapability":"wan27-(?:t2v|r2v|video-edit)"/);
  const wan30Docs = copySource.slice(copySource.indexOf("wan30Params:"), copySource.indexOf("seedream5ImageParams:"));
  for (const marker of ["w3.0-video", "w3.0-video-pro", "w3.0-video-prime", "w3.0-video-prime-pro", "referenceImages", "referenceVideos", "referenceAudios", "firstFrameUrl", "lastFrameUrl", "duration combination"]) {
    assert.match(wan30Docs, new RegExp(marker));
  }
  assert.doesNotMatch(wan30Docs, /Wan 2\.7|wan2\.7-i2v-spicy|drivingAudioUrl|negative_prompt/);
  // The public docs name the model, never the old NSFW wording.
  assert.doesNotMatch(copySource, /\(NSFW\)/);
  assert.doesNotMatch(publicMarkdownSource, /\(NSFW\)/);
  assert.doesNotMatch(uiSource, /\(NSFW\)/);
  for (const source of [copySource, publicMarkdownSource, uiSource]) {
    assert.doesNotMatch(source, /sk-[A-Za-z0-9]{8,}|AKIA[0-9A-Z]{16}|MULEROUTER_API_KEY/);
  }
  assert.match(copySource, /\/api\/wan27\/image-edit/);
  assert.doesNotMatch(copySource, /\/api\/vipeak1\/image-edit/);
  assert.match(uiSource, /fetchLatestModelDocsMarkdown/);
  assert.match(uiSource, /\/api\/advanced\/generate/);
  assert.match(uiSource, /\/api\/generation-records\/<taskId>/);
});

test("public docs always suppress Wan 2.7 even when its compatibility flag is enabled", () => {
  const start = serverSource.indexOf("function publicModelDocsView");
  const end = serverSource.indexOf("function buildRestrictedModelDocsMarkdown", start);
  const source = serverSource.slice(start, end);
  assert.doesNotMatch(source, /Wan2\.7 uses the Advanced route/);
  assert.doesNotMatch(source, /if \(!PUBLIC_WAN27_MODEL_EXPOSURE_ENABLED\)/);
  assert.match(source, /restrictedConstraintKeys\.push\("wan27"\)/);
  assert.match(source, /\["wan27Example", "wanAnimateExample", "wan27ImageExample"\]\.forEach\(\(key\) => delete external\[key\]\)/);
});

test("public Wan docs use only current Mulerouter nodes while legacy aliases stay internal", () => {
  const publicSources = [copySource, markdownSource, publicMarkdownSource];
  for (const source of publicSources) {
    for (const node of ["w3.0-video", "w3.0-video-pro", "w3.0-video-prime", "w3.0-video-prime-pro", "z-image-spicy-pro", "qwen-image-edit-spicy"]) {
      assert.match(source, new RegExp(node.replace(/\./g, "\\.")));
    }
    for (const retired of ["Wan 2.7", "wan2.7-i2v-spicy", "wan2.7-i2v", "wan27-i2v", "wan27-t2v", "wan27-r2v", "wan27-video-edit", "wan30-video", "HappyHorse", "Wan Animate", "Vidu"]) {
      assert.doesNotMatch(source, new RegExp(retired.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    }
  }
  for (const mapping of [
    '"w3.0-video": "wan30-video"',
    '"w3.0-video-pro": "wan30-video-pro"',
    '"w3.0-video-prime": "wan30-video-prime"',
    '"w3.0-video-prime-pro": "wan30-video-prime-pro"',
    '"wan2.7-i2v-spicy": "wan27-i2v"',
  ]) {
    assert.ok(aliyunVideoSource.includes(mapping), `missing internal compatibility mapping: ${mapping}`);
  }
});

test("public responses keep real provider, parameter, and model names", () => {
  assert.match(providersSource, /function publicModelText\(value = ""\) \{\s*return String\(value \?\? ""\);\s*\}/);
  assert.match(providersSource, /function publicModelKey\(key = ""\) \{\s*return String\(key \|\| ""\);\s*\}/);
  assert.match(providersSource, /return "wan27-image"/);
  assert.match(providersSource, /return "wan27"/);
  assert.match(providersSource, /return "seedance"/);
  assert.doesNotMatch(uiSource, /\.replace\(\/\\bseedance\\b\/g, "vipeak2"\)/);
});

test("V3 task route rejects non-Seedance models instead of failing asynchronously", () => {
  const start = serverSource.indexOf("function byteplusV3SupportedSeedanceModel");
  const end = serverSource.indexOf("function byteplusV3TaskToAdvancedBody", start);
  assert.ok(start > 0 && end > start, "model guard helper should exist and precede the mapper");
  const guard = serverSource.slice(start, end);
  assert.match(guard, /seedanceModelAliasKind\(raw\)/);
  assert.match(guard, /wanted\.includes\("seedance25"\)/);
  const mapper = serverSource.slice(end);
  assert.match(mapper, /if \(!byteplusV3SupportedSeedanceModel\(model\)\) \{/);
  assert.match(mapper, /InvalidParameter\.UnsupportedModel/);
  assert.match(mapper, /\/api\/advanced\/generate/);
});
