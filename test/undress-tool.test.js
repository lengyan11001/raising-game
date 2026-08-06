"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const server = read("server.js");
const db = read("db.js");
const loader = read("platform.js");
const frontend = read("platform.undress-tool.js");
const history = read("platform.create.js");
const css = read("tool-undress.css");
const videoTools = read("video-tools.js");

test("undress.14vips.com is an isolated tenant without API or asset-library access", () => {
  assert.match(server, /undress\.14vips\.com=undress/);
  assert.match(server, /tenantId: "tool-undress-14vips"/);
  assert.match(server, /allowedTabs: \["gallery", "history", "topups", "spending"\]/);
  assert.match(server, /assetLibrary: false/);
  assert.match(db, /'tool-undress-14vips'/);
  assert.match(server, /function undressToolApiPathAllowed/);
  assert.match(server, /undressToolRequestAllowed\(req\) && url\.pathname\.startsWith\("\/api\/"\)/);
  assert.doesNotMatch(
    server.slice(server.indexOf("function undressToolApiPathAllowed"), server.indexOf("function undressToolFreeImageClaimId")),
    /video-tools|public\/characters|workflow|advanced/,
  );
  assert.match(server, /if \(undressToolRequestAllowed\(req\)\)[\s\S]*?allowedToolPath[\s\S]*?return sendText\(res, 404, "Not Found"\)/);
});

test("the first image claim is atomic, persistent, and released only after a failed claim", () => {
  assert.match(db, /async function claimToolFreeGenerationInDb/);
  assert.match(db, /ON CONFLICT \(id\) DO NOTHING/);
  assert.match(db, /app_credit_ledger_task_event_uidx/);
  assert.match(db, /ON CONFLICT DO NOTHING/);
  assert.match(db, /async function releaseToolFreeGenerationClaimInDb/);
  assert.match(db, /COALESCE\(payload->>'status', 'claimed'\) = 'claimed'/);
  assert.match(server, /claimToolFreeGenerationInDb\(\{/);
  assert.match(server, /freeImageGeneration \? 0 : pricing\.credits/);
  assert.match(server, /billingStatus: freeImageGeneration \? "free_generating"/);
  assert.match(server, /refundVideoToolTask[\s\S]*?releaseToolFreeGenerationClaimInDb/);
});

test("locked free results expose no media and cannot be downloaded or added to assets", () => {
  const publicView = server.slice(server.indexOf("function publicGenerationRecord"), server.indexOf("function adminGenerationRecordView"));
  assert.match(publicView, /record\.resultLocked === true/);
  assert.match(publicView, /publicRecord\.imageResultUrls = \[\]/);
  assert.match(publicView, /publicRecord\.mediaAssets = \[\]/);
  assert.match(publicView, /publicRecord\.prompt = ""/);
  assert.match(server, /code: "RESULT_LOCKED"/);
  assert.match(server, /saveGeneratedImageFile\(taskId, downloaded\.bytes, mime, \{ publish: !freeImageGeneration \}\)/);
  assert.match(server, /lockedRecord\?\.resultLocked === true/);
  assert.match(server, /objectStoragePath\("generated", "images", fileName\)/);
  assert.match(server, /async function handleUnlockUndressToolResult/);
  assert.match(server, /type: "undress_tool_image_unlock"/);
  assert.match(server, /GENERATED_LOCKED_PREVIEW_DIR/);
  assert.match(server, /async function createUndressLockedPreview/);
  assert.match(server, /scale=64:64:force_original_aspect_ratio=decrease/);
  assert.match(publicView, /lockedPreviewUrl: record\.resultLocked === true && undressToolRecord/);
  assert.match(publicView, /publicUndressLockedPreviewUrl\(record\.lockedPreviewUrl\)/);
  assert.match(server, /lockedPreviewUrl: ""/);
  assert.match(server, /fs\.rm\(lockedPreviewPath, \{ force: true \}\)/);
});

test("the create dialog has three explicit generation types with matching uploads", () => {
  assert.match(loader, /"platform\.undress-tool\.js"/);
  assert.match(frontend, /generationType: "image"/);
  assert.match(frontend, /\["image", "imageOnly", "image"\]/);
  assert.match(frontend, /\["image_video", "imageVideo", "clapperboard"\]/);
  assert.match(frontend, /\["video", "videoOnly", "video"\]/);
  assert.match(frontend, /undressToolExpectedMediaKind\(\)/);
  assert.match(frontend, /"video\/mp4,video\/webm,video\/quicktime,video\/x-m4v"/);
  assert.match(frontend, /"image\/jpeg,image\/png,image\/webp,image\/bmp"/);
  assert.match(frontend, /generationType: undressToolState\.generationType/);
  assert.match(frontend, /requestJson\("\/api\/undress-tool\/generate"/);
  assert.match(frontend, /showPlayfluxSubmittedHistory/);
  assert.match(server, /undressToolGenerationDefinition\(body\.generationType\)/);
  assert.match(server, /mediaKind !== generation\.mediaKind/);
  assert.match(server, /const freeClaimId = generationType === "image"/);
  assert.match(server, /planVideoEditSegments\(actualDuration\)/);
  assert.match(server, /composeVideoToolSegments\(taskId, generatedPaths\)/);
  assert.match(css, /\.video-tool-upload-preview[\s\S]*?object-fit: contain/);
  assert.match(css, /\.undress-tool-type-switch[\s\S]*?grid-template-columns: repeat\(3/);
});

test("image-to-video clones the reference Wan2.7 task and uses configured pricing", () => {
  const pricing = server.slice(server.indexOf("async function videoToolPricing"), server.indexOf("async function handleVideoToolEstimate"));
  const runner = server.slice(server.indexOf("async function runVideoToolUndressImageVideo"), server.indexOf("async function runVideoToolUndressVideoLegacy"));
  assert.match(pricing, /action === "undress-image-video"/);
  assert.match(pricing, /applyUserPricingToEstimate\(advancedModelPricing\("wan27"/);
  assert.match(pricing, /videoCapability: "wan27-i2v"/);
  assert.match(pricing, /duration: 5/);
  assert.match(pricing, /resolution: "720P"/);
  assert.match(runner, /capability: "wan27-i2v"/);
  assert.match(runner, /model: ALIYUN_WAN27_I2V_MODEL/);
  assert.match(runner, /media: \[\{ type: "first_frame", url: imageUrl \}\]/);
  assert.match(runner, /mediaMode: "first_frame"/);
  assert.match(runner, /duration: 5/);
  assert.match(runner, /resolution: "720P"/);
  assert.match(runner, /ratio: "9:16"/);
  assert.match(runner, /generateAudio: true/);
  assert.match(runner, /prompt_extend: false/);
  assert.match(videoTools, /她脱掉衣服，全裸露出胸部用手抚摸一只胸，并微笑着说：今天又是美好的一天/);
  assert.doesNotMatch(videoTools, /Negative prompt:/);
  assert.match(server, /job\.action === "undress-image-video"[\s\S]*?runVideoToolUndressImageVideo/);
});

test("reopening the upload dialog resets transient progress state", () => {
  const resetBlock = frontend.slice(frontend.indexOf("function resetUndressToolFile"), frontend.indexOf("function undressToolCanSubmit"));
  assert.match(resetBlock, /undressToolState\.estimating = false/);
  assert.match(resetBlock, /undressToolState\.submitting = false/);
  assert.match(resetBlock, /undressToolState\.uploadProgress = 0/);
  assert.match(frontend, /file \? `<div class="undress-tool-price-note"/);
});

test("History renders an unlock action instead of media for locked results", () => {
  assert.match(history, /const resultLocked = record\.resultLocked === true/);
  assert.match(history, /history-unlock-overlay/);
  assert.match(history, /const detailAction = isUndressHistory \? ""/);
  assert.match(history, /isUndressHistory \? "" : `<div class="history-card-actions/);
  assert.match(history, /\/api\/undress-tool\/tasks\/\$\{encodeURIComponent\(taskId\)\}\/unlock/);
  assert.match(history, /is-result-locked/);
  assert.match(history, /record\.lockedPreviewUrl/);
  assert.match(history, /history-locked-preview/);
  assert.doesNotMatch(
    history.slice(history.indexOf("const unlockOverlay"), history.indexOf("const resultActions")),
    /record\.unlockCredits/,
  );
  assert.match(history, /async function showUndressUnlockConfirm/);
  assert.match(history, /This unlock will deduct/);
  assert.match(history, /await showUndressUnlockConfirm\(record\)/);
  assert.match(server, /ownRecords\.map\(ensureUndressLockedPreview\)/);
});

test("insufficient unlock balance opens a top-up dialog", () => {
  assert.match(history, /async function showUndressInsufficientCreditsDialog/);
  assert.match(history, /error\.statusCode === 402 \|\| error\.code === "INSUFFICIENT_CREDITS"/);
  assert.match(history, /if \(result === "confirm"\) openTopupDialog\(\)/);
  assert.match(frontend, /showUndressInsufficientCreditsDialog\(error\)/);
  assert.match(css, /\.history-unlock-overlay[\s\S]*?position: absolute/);
});
