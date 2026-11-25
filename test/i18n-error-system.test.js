"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const catalog = require("../platform.errors");
const resolver = require("../lib-media-error-resolver");
const { publicGenerationErrorMessage, publicGenerationErrorInfo } = require("../lib-providers");
const { readServerSource } = require("../server-source");

test("Every catalog error code renders cleanly across all 6 languages with no unreplaced placeholders", () => {
  const sampleTarget = { slot: "reference_image", index: 2, mention: "@Image 2", fileName: "sample.png" };
  const sampleParams = { minPx: 300, maxPx: 6000, actual: "200x400", minSec: 2, maxSec: 15, maxChars: 5000 };

  for (const code of Object.keys(catalog.ERROR_CATALOG)) {
    for (const lang of catalog.SUPPORTED_LANGS) {
      const generalMsg = catalog.formatErrorInfo({ code, params: sampleParams }, lang);
      assert.ok(generalMsg.length > 0, `Empty general message for ${code} in ${lang}`);
      assert.doesNotMatch(generalMsg, /\{[a-zA-Z0-9_]+\}/, `Unreplaced placeholder in ${code}/${lang}: ${generalMsg}`);
      assert.doesNotMatch(generalMsg, /https?:\/\//i, `URL leaked in ${code}/${lang}`);

      const targetedMsg = catalog.formatErrorInfo({ code, target: sampleTarget, params: sampleParams }, lang);
      assert.ok(targetedMsg.length > 0, `Empty targeted message for ${code} in ${lang}`);
      assert.doesNotMatch(targetedMsg, /\{[a-zA-Z0-9_]+\}/, `Unreplaced targeted placeholder in ${code}/${lang}: ${targetedMsg}`);
    }
  }
});

test("detectRequestLang respects x-lang > query lang > Accept-Language > fallback", () => {
  assert.equal(catalog.detectRequestLang({ headers: { "x-lang": "ja" }, url: "/api/test?lang=vi" }), "ja");
  assert.equal(catalog.detectRequestLang({ headers: { "accept-language": "ko-KR,ko;q=0.9" }, url: "/api/test?lang=vi" }), "vi");
  assert.equal(catalog.detectRequestLang({ headers: { "accept-language": "ko-KR,ko;q=0.9,en;q=0.8" }, url: "/api/test" }), "ko");
  assert.equal(catalog.detectRequestLang({ headers: { "accept-language": "zh-CN,zh;q=0.9" }, url: "/api/test" }), "zh");
  assert.equal(catalog.detectRequestLang({ headers: { "accept-language": "id-ID,id;q=0.9" }, url: "/api/test" }), "id");
  assert.equal(catalog.detectRequestLang({ headers: {}, url: "/api/test" }, ""), "");
  assert.equal(catalog.detectRequestLang(null, "en"), "en");
});

test("BytePlus content[k] errors pinpoint exact @Image N + filename and separate prompt vs media moderation", () => {
  const record = {
    provider: "seedance-nsfw",
    billingStatus: "refunded",
    mediaAssets: [
      { type: "reference_image", userAssetId: "a1", assetUri: "asset://asset-111", name: "hero.png", url: "https://media.123vips.com/a/hero.png" },
      { type: "reference_image", userAssetId: "a2", assetUri: "asset://asset-222", name: "bad_ref.png", url: "https://media.123vips.com/a/bad_ref.png" },
    ],
    upstreamPayload: {
      content: [
        { type: "text", text: "some prompt" },
        { type: "image_url", role: "reference_image", image_url: { url: "asset://asset-111" } },
        { type: "image_url", role: "reference_image", image_url: { url: "asset://asset-222" } },
      ],
    },
    queryResponse: {
      error: {
        code: "InvalidParameter",
        param: "content[2].image_url.url",
        message: "The parameter `content[2].image_url.url` specified in the request is not valid: The request failed because the input image may contain sensitive information.",
      },
    },
    error: "The parameter `content[2].image_url.url` specified in the request is not valid: The request failed because the input image may contain sensitive information.",
  };

  const info = publicGenerationErrorInfo(record);
  assert.equal(info.code, "MODERATION_INPUT_MEDIA");
  assert.equal(info.target.slot, "reference_image");
  assert.equal(info.target.index, 2);
  assert.equal(info.target.mention, "@Image 2");
  assert.equal(info.target.fileName, "bad_ref.png");

  const zhMsg = publicGenerationErrorMessage(record.error, { lang: "zh", record });
  const enMsg = publicGenerationErrorMessage(record.error, { lang: "en", record });
  const jaMsg = publicGenerationErrorMessage(record.error, { lang: "ja", record });
  assert.match(zhMsg, /@Image 2（bad_ref\.png）/);
  assert.match(enMsg, /@Image 2 \(bad_ref\.png\)/);
  assert.match(jaMsg, /@Image 2（bad_ref\.png）/);

  // Prompt moderation (content[0]) must resolve to MODERATION_INPUT_TEXT
  const promptRecord = {
    ...record,
    queryResponse: { error: { code: "InputTextSensitiveContentDetected", message: "The request failed because the input text 'content[0]' may contain sensitive information." } },
    error: "The request failed because the input text 'content[0]' may contain sensitive information.",
  };
  const promptInfo = publicGenerationErrorInfo(promptRecord);
  assert.equal(promptInfo.code, "MODERATION_INPUT_TEXT");
  assert.match(publicGenerationErrorMessage(promptRecord.error, { lang: "zh", record: promptRecord }), /提示词/);
  assert.match(publicGenerationErrorMessage(promptRecord.error, { lang: "en", record: promptRecord }), /prompt/i);
});

test("Output video copyright is distinguished from reference media copyright and audio BGM copyright", () => {
  const videoCopy = {
    error: "The request failed because the output video may be related to copyright restrictions.",
    queryResponse: { error: { code: "OutputVideoSensitiveContentDetected.PolicyViolation", message: "The request failed because the output video may be related to copyright restrictions." } },
  };
  const info = publicGenerationErrorInfo(videoCopy);
  assert.equal(info.code, "COPYRIGHT_OUTPUT_VIDEO");
  const zhMsg = publicGenerationErrorMessage(videoCopy.error, { lang: "zh", record: videoCopy });
  assert.match(zhMsg, /生成的视频结果/);
  assert.doesNotMatch(zhMsg, /参考素材可能涉及版权限制/);
  assert.match(publicGenerationErrorMessage(videoCopy.error, { lang: "en", record: videoCopy }), /generated video output/i);
});

test("ResourceNotFound, URL download timeout, FileInfos[k], CreateAsset dimensions, and Wan30 errors pinpoint exact media", () => {
  // 1. ResourceNotFound -> match asset:// URI
  const rnfRecord = {
    mediaAssets: [
      { type: "reference_image", userAssetId: "u1", assetUri: "asset://asset-img-1", name: "p1.png" },
      { type: "reference_video", userAssetId: "u2", assetUri: "asset://asset-vid-99", name: "dance.mp4" },
    ],
    error: "The specified resource `asset-vid-99` is not found.",
    queryResponse: { error: { code: "ResourceNotFound", message: "The specified resource `asset-vid-99` is not found." } },
  };
  const rnfInfo = publicGenerationErrorInfo(rnfRecord);
  assert.equal(rnfInfo.code, "MEDIA_NOT_FOUND");
  assert.equal(rnfInfo.target.mention, "@Video 1");
  assert.equal(rnfInfo.target.fileName, "dance.mp4");

  // 2. Download timeout with URL -> match pathname ignoring signature query, strip URL from message
  const dlRecord = {
    mediaAssets: [
      { type: "reference_image", name: "first.png", url: "https://media.123vips.com/assets/u1/first.png?sig=aaa" },
      { type: "reference_image", name: "slow_pic.png", url: "https://media.123vips.com/assets/u1/slow_pic.png?sig=bbb" },
    ],
    error: "The parameter `image` specified in the request are not valid: Timeout while downloading url=https://media.123vips.com/assets/u1/slow_pic.png?sig=ccc",
  };
  const dlInfo = publicGenerationErrorInfo(dlRecord);
  assert.equal(dlInfo.code, "MEDIA_DOWNLOAD_FAILED");
  assert.equal(dlInfo.target.mention, "@Image 2");
  assert.equal(dlInfo.target.fileName, "slow_pic.png");
  const dlZh = publicGenerationErrorMessage(dlRecord.error, { lang: "zh", record: dlRecord });
  assert.match(dlZh, /@Image 2（slow_pic\.png）/);
  assert.doesNotMatch(dlZh, /https?:\/\//i);

  // 3. Tencent VOD FileInfos[1]
  const vegaRecord = {
    provider: "vega15-lite",
    mediaAssets: [
      { type: "reference_image", name: "actor.png", url: "https://media.123vips.com/transient/actor.png" },
      { type: "reference_audio", name: "voice.mp3", url: "https://media.123vips.com/transient/voice.mp3" },
    ],
    upstreamPayload: {
      ModelVersion: "1.5-lite",
      FileInfos: [
        { Type: "Url", Category: "Image", Usage: "Reference", Url: "https://media.123vips.com/transient/actor.png" },
        { Type: "Url", Category: "Audio", Usage: "Reference", Url: "https://media.123vips.com/transient/voice.mp3" },
      ],
    },
    error: "InvalidParameter: FileInfos[1] audio format unsupported",
  };
  const vegaInfo = publicGenerationErrorInfo(vegaRecord);
  assert.equal(vegaInfo.target.slot, "reference_audio");
  assert.equal(vegaInfo.target.mention, "@Audio 1");
  assert.equal(vegaInfo.target.fileName, "voice.mp3");

  // 4. CreateAsset HeightTooSmall with persisted target
  const dimRecord = {
    error: "CreateAsset failed: InvalidParameter.HeightTooSmall Height must be between 300px and 6000px.",
    errorInfo: {
      code: "MEDIA_DIMENSIONS_INVALID",
      target: { slot: "reference_image", index: 2, mention: "@Image 2", fileName: "tiny.png" },
      params: { minPx: 300, maxPx: 6000 },
    },
  };
  assert.match(publicGenerationErrorMessage(dimRecord.error, { lang: "zh", record: dimRecord }), /@Image 2（tiny\.png）.*300–6000px/);
  assert.match(publicGenerationErrorMessage(dimRecord.error, { lang: "en", record: dimRecord }), /@Image 2 \(tiny\.png\).*300-6000px/);

  // 5. Wan30 reference video 2 dimensions + Seedance task type constraint + real human faces
  const wanInfo = publicGenerationErrorInfo({ error: "reference video 2 width and height must each be between 240px and 4096px." });
  assert.equal(wanInfo.code, "MEDIA_DIMENSIONS_INVALID");
  assert.equal(wanInfo.target.mention, "@Video 2");
  assert.equal(wanInfo.params.minPx, 240);
  assert.equal(wanInfo.params.maxPx, 4096);

  const editInfo = publicGenerationErrorInfo({ error: "InvalidParameter.TaskTypeConstraint Seedance identified your task as video editing based on your prompt." });
  assert.equal(editInfo.code, "SEEDANCE_EDIT_CONSTRAINT");

  const faceInfo = publicGenerationErrorInfo({
    mediaAssets: [{ type: "reference_image", name: "portrait.jpg", url: "https://media.123vips.com/a/portrait.jpg" }],
    error: "CarrotHub task failed: The input content is suspected to include real human faces.",
  });
  assert.equal(faceInfo.code, "MODERATION_INPUT_REAL_FACE");
  assert.equal(faceInfo.target.mention, "@Image 1");
  assert.equal(faceInfo.target.fileName, "portrait.jpg");
});

test("Error resolver is fail-safe and server/frontend wiring is intact", () => {
  assert.doesNotThrow(() => resolver.resolveGenerationErrorInfo(null));
  assert.doesNotThrow(() => resolver.resolveGenerationErrorInfo(undefined));
  assert.doesNotThrow(() => resolver.resolveGenerationErrorInfo({ error: 12345, upstreamPayload: { content: [null, 42] } }));
  assert.doesNotThrow(() => resolver.resolveHttpErrorInfo(null));

  const server = readServerSource();
  assert.match(server, /"platform\.errors\.js"/);
  assert.match(server, /lang: detectRequestLang\(req, ""\)/);
  assert.match(server, /publicGenerationErrorInfo\(record,/);
  assert.match(server, /const localizedMessage = lang \? formatErrorInfo\(errorInfo, lang\) : ""/);

  const boot = fs.readFileSync(path.join(__dirname, "..", "platform.js"), "utf8");
  assert.match(boot, /"platform\.errors\.js"/);
  const uiPart4 = fs.readFileSync(path.join(__dirname, "..", "platform.ui.parts/part-04.js"), "utf8");
  assert.match(uiPart4, /headers\["x-lang"\] = state\.lang/);
  assert.match(uiPart4, /error\.errorInfo = payload\.errorInfo \|\| null/);
});

test("publicGenerationRecord keeps succeeded records unchanged and localizes failed records with asset target", () => {
  const app = require("../server");
  const okRecord = app.publicGenerationRecord({
    taskId: "cgt-ok-1",
    status: "succeeded",
    provider: "vega15-lite",
    providerVideoUrl: "https://media.123vips.com/out.mp4",
  }, { lang: "en", requireR2Ready: false });
  assert.equal(okRecord.error, "");
  assert.equal(Object.prototype.hasOwnProperty.call(okRecord, "errorInfo"), false);

  const failedRecord = {
    taskId: "cgt-fail-1",
    status: "failed",
    provider: "seedance-nsfw",
    billingStatus: "refunded",
    mediaAssets: [
      { type: "reference_image", userAssetId: "a1", assetUri: "asset://asset-11", name: "cover.png" },
      { type: "reference_image", userAssetId: "a2", assetUri: "asset://asset-22", name: "ref_b.png" },
    ],
    upstreamPayload: {
      content: [
        { type: "text", text: "prompt" },
        { type: "image_url", role: "reference_image", image_url: { url: "asset://asset-11" } },
        { type: "image_url", role: "reference_image", image_url: { url: "asset://asset-22" } },
      ],
    },
    queryResponse: {
      error: {
        code: "InvalidParameter",
        param: "content[2].image_url.url",
        message: "The parameter `content[2].image_url.url` specified in the request is not valid: The request failed because the input image may contain sensitive information.",
      },
    },
    error: "The parameter `content[2].image_url.url` specified in the request is not valid: The request failed because the input image may contain sensitive information.",
  };

  const enView = app.publicGenerationRecord(failedRecord, { lang: "en", requireR2Ready: false });
  const zhView = app.publicGenerationRecord(failedRecord, { lang: "zh", requireR2Ready: false });
  const viView = app.publicGenerationRecord(failedRecord, { lang: "vi", requireR2Ready: false });
  assert.equal(enView.errorInfo.code, "MODERATION_INPUT_MEDIA");
  assert.equal(enView.errorInfo.target.mention, "@Image 2");
  assert.equal(enView.errorInfo.target.fileName, "ref_b.png");
  assert.match(enView.error, /@Image 2 \(ref_b\.png\)/);
  assert.match(zhView.error, /@Image 2（ref_b\.png）/);
  assert.match(viView.error, /@Image 2 \(ref_b\.png\)/);
});

test("platform.errors.js is publicly servable on all platform surfaces while lib-media-error-resolver.js stays server-only", () => {
  const { publicStaticPath } = require("../site-http");
  assert.equal(publicStaticPath("/platform.errors.js"), true);
  assert.equal(publicStaticPath("/lib-media-error-resolver.js"), false);
  assert.match("/platform.errors.js", /^\/platform(?:\.[a-z0-9-]+)?\.js$/i);
});
