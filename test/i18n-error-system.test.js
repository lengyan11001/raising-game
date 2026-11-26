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
  assert.match(server, /const localizedMessage = \(lang && !keepSpecificSameLang\) \? formatErrorInfo\(errorInfo, lang\) : ""/);

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

test("Phase 3: all 759 server ok:false HTTP error exits resolve to a valid 6-language catalog code", () => {
  const serverPartsDir = path.join(__dirname, "..", "server.parts");
  const files = fs.readdirSync(serverPartsDir).filter((f) => f.endsWith(".js")).sort();
  let total = 0;
  for (const file of files) {
    const txt = fs.readFileSync(path.join(serverPartsDir, file), "utf8");
    const re = /sendJson\s*\(\s*res\s*,\s*([45]\d\d)\s*,\s*\{([\s\S]{0,420}?)\}\s*\)/g;
    let m;
    while ((m = re.exec(txt)) !== null) {
      const status = Number(m[1]);
      const body = m[2];
      if (!/\bok\s*:\s*false\b/.test(body)) continue;
      total += 1;
      const cm = body.match(/\bcode\s*:\s*["']([A-Z0-9_]+)["']/);
      const mm = body.match(/\bmessage\s*:\s*["'`]([^"'`\n]{2,140})["'`]/);
      const payload = { ok: false, ...(cm ? { code: cm[1] } : {}), ...(mm ? { message: mm[1] } : {}) };
      const info = resolver.resolveHttpErrorInfo(payload, { statusCode: status });
      assert.ok(info && info.code, `Unresolved error in ${file}: status=${status} payload=${JSON.stringify(payload)}`);
      for (const lang of catalog.SUPPORTED_LANGS) {
        const rendered = catalog.formatErrorInfo(info, lang);
        assert.ok(rendered.length > 0, `Empty ${lang} template for ${info.code} in ${file}`);
      }
    }
  }
  assert.ok(total >= 700, `Expected >= 700 error exits audited, got ${total}`);
});

test("Phase 3: exact domain HTTP errors localize cleanly and generic fallbacks preserve same-language specifics", () => {
  const cases = [
    [{ ok: false, message: "API not found." }, 404, "API_NOT_FOUND"],
    [{ ok: false, message: "Forbidden." }, 403, "FORBIDDEN"],
    [{ ok: false, message: "Generation record not found." }, 404, "GENERATION_RECORD_NOT_FOUND"],
    [{ ok: false, message: "Enter a valid email address." }, 400, "INVALID_EMAIL"],
    [{ ok: false, code: "AUTH_LOCKED", message: "Too many failed sign-in attempts." }, 429, "AUTH_LOCKED"],
    [{ ok: false, code: "STRIPE_NOT_CONFIGURED", message: "Stripe is not configured yet." }, 503, "PAYMENT_NOT_CONFIGURED"],
    [{ ok: false, code: "PROMO_CHECKOUT_BUSY", message: "正在处理上一笔支付，请稍后再试。" }, 409, "PROMO_CHECKOUT_BUSY"],
    [{ ok: false, code: "RESULT_LOCKED", message: "Unlock this result first." }, 403, "RESULT_LOCKED"],
    [{ ok: false, message: "工单不存在。" }, 404, "SUPPORT_TICKET_NOT_FOUND"],
    [{ ok: false, code: "WORKFLOW_CANVAS_NOT_FOUND", message: "Workflow not found." }, 404, "WORKFLOW_CANVAS_NOT_FOUND"],
    [{ ok: false, code: "STORY_PROJECT_NOT_FOUND", message: "剧集项目不存在。" }, 404, "STORY_PROJECT_NOT_FOUND"],
    [{ ok: false, message: "礼物暂时没有送出，积分已退回。" }, 502, "GIFT_SEND_FAILED_REFUNDED"],
  ];
  for (const [payload, statusCode, expectedCode] of cases) {
    const info = resolver.resolveHttpErrorInfo(payload, { statusCode });
    assert.equal(info.code, expectedCode);
    assert.equal(Boolean(info.generic), false, `${expectedCode} should be exact, not generic`);
    assert.ok(catalog.formatErrorInfo(info, "en").length > 0);
    assert.ok(catalog.formatErrorInfo(info, "zh").length > 0);
    assert.ok(catalog.formatErrorInfo(info, "vi").length > 0);
  }

  // Generic status fallback preserves sourceLang so same-language custom messages are not downgraded
  const customZh = resolver.resolveHttpErrorInfo({ ok: false, message: "自定义中文校验提示" }, { statusCode: 400 });
  assert.equal(customZh.code, "REQUEST_INVALID");
  assert.equal(customZh.generic, true);
  assert.equal(customZh.sourceLang, "zh");
  assert.ok(catalog.formatErrorInfo(customZh, "en").includes("invalid"));
});

test("Phase 2: creation note assignments have zero raw English validation literals", () => {
  const dir = path.join(__dirname, "..", "platform.create.parts");
  const offenders = [];
  for (const file of fs.readdirSync(dir).filter((f) => f.endsWith(".js")).sort()) {
    const lines = fs.readFileSync(path.join(dir, file), "utf8").split("\n");
    lines.forEach((line, idx) => {
      if (!/(?:advancedNote|advancedAssetNote|assetNote)\.textContent\s*=/.test(line)) return;
      const rhs = line.split("=").slice(1).join("=").trim();
      if (/^(?:""|''|``);?$/.test(rhs)) return;
      if (/localizedUiError\(|t\(|error\.message|vegaMediaDurationError|selection\.message|durationMessage|advancedMediaReferenceAddError/.test(rhs)) return;
      // Ignore multiline ternary heads whose branches use t(...)
      if (/^(?:normalizedKind|action)\s*===/.test(rhs)) return;
      if (/["'`][A-Za-z]/.test(rhs)) offenders.push(`${file}:${idx + 1}: ${rhs}`);
    });
  }
  assert.deepEqual(offenders, []);
});

test("Phase 2: platform.vega-media.js and localizedUiError render 6 languages in browser VM", () => {
  const vm = require("node:vm");
  const errorsSrc = fs.readFileSync(path.join(__dirname, "..", "platform.errors.js"), "utf8");
  const vegaMediaSrc = fs.readFileSync(path.join(__dirname, "..", "platform.vega-media.js"), "utf8");
  for (const [lang, expectedRe] of [
    ["en", /valid media target/i],
    ["zh", /有效的素材槽位/],
    ["vi", /mục tài nguyên hợp lệ/],
    ["ja", /有効な素材スロット/],
    ["ko", /유효한 소재 슬롯/],
    ["id", /target media yang valid/i],
  ]) {
    const ctx = {
      globalThis: null,
      document: { documentElement: { lang } },
      console,
      URL,
    };
    ctx.globalThis = ctx;
    vm.runInNewContext(errorsSrc, ctx);
    vm.runInNewContext(vegaMediaSrc, ctx);
    const badTarget = ctx.AdvancedVegaMedia.selectionForAsset({ asset: {}, targetId: "nonexistent" });
    assert.equal(badTarget.ok, false);
    assert.equal(badTarget.code, "INVALID_TARGET");
    assert.match(badTarget.message, expectedRe);
  }
});

test("Today's production failure regressions: gpt-image-2 provider allowlist, Vega concurrency limit, INVALID_PROVIDER, and seedance-nsfw target tagging", () => {
  // 1. gpt-image-2 must pass isExplicitAdvancedProvider / assertExplicitAdvancedProvider
  const server = readServerSource();
  assert.match(server, /function isExplicitAdvancedProvider\([\s\S]{0,900}if \(isGptImage2Provider\(value\)\) return true;/);

  // 2. Tencent VOD RequestLimitExceeded / maximum concurrency maps to UPSTREAM_RATE_LIMITED
  const vegaConcurrency = {
    provider: "vega15-lite",
    billingStatus: "refunded",
    error: "RequestLimitExceeded: task failed with status: FAIL, message: GenerateVideo task reached the maximum concurrency.",
    queryResponse: {
      Response: {
        AigcVideoTask: {
          ErrCodeExt: "RequestLimitExceeded",
          Message: "task failed with status: FAIL, message: GenerateVideo task reached the maximum concurrency.",
        },
      },
    },
  };
  const vegaInfo = publicGenerationErrorInfo(vegaConcurrency);
  assert.equal(vegaInfo.code, "UPSTREAM_RATE_LIMITED");
  assert.equal(vegaInfo.retryable, true);
  assert.match(publicGenerationErrorMessage(vegaConcurrency.error, { lang: "zh", record: vegaConcurrency }), /当前生成请求较多/);
  assert.match(publicGenerationErrorMessage(vegaConcurrency.error, { lang: "en", record: vegaConcurrency }), /currently busy/i);

  // 3. INVALID_PROVIDER resolves cleanly in all 6 languages
  const invalidProv = {
    provider: "seedance",
    failureStage: "preparation",
    preparationErrorCode: "INVALID_PROVIDER",
    error: "provider must be an available generation model id.",
  };
  const provInfo = publicGenerationErrorInfo(invalidProv);
  assert.equal(provInfo.code, "INVALID_PROVIDER");
  assert.match(publicGenerationErrorMessage(invalidProv.error, { lang: "zh", record: invalidProv }), /所选模型不可用/);
  assert.match(publicGenerationErrorMessage(invalidProv.error, { lang: "en", record: invalidProv }), /selected model is invalid/i);

  // 4. seedance-nsfw CreateAsset WidthTooSmall with tagged @Image 5 + actual WxH
  const dim5 = {
    provider: "seedance-nsfw",
    billingStatus: "refunded",
    error: "CreateAsset failed: InvalidParameter.WidthTooSmall Width must be between 300px and 6000px.",
    errorInfo: {
      code: "MEDIA_DIMENSIONS_INVALID",
      target: { slot: "reference_image", index: 5, mention: "@Image 5", fileName: "small.jpg" },
      params: { actual: "256x384", minPx: 300, maxPx: 6000 },
    },
  };
  const zhDim = publicGenerationErrorMessage(dim5.error, { lang: "zh", record: dim5 });
  const enDim = publicGenerationErrorMessage(dim5.error, { lang: "en", record: dim5 });
  assert.match(zhDim, /@Image 5（small\.jpg）.*256x384.*300–6000px/);
  assert.match(enDim, /@Image 5 \(small\.jpg\).*256x384.*300-6000px/);

  // 5. server.parts/part-48.js tags target on direct seedance-nsfw & flash asset loops
  assert.match(server, /seedance-nsfw-image-\$\{index \+ 1\}[\s\S]{0,250}mention: `@Image \$\{index \+ 1\}`/);
});
