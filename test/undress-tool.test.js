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
const html = read("platform.html");
const frontend = read("platform.undress-tool.js");
const ui = read("platform.ui.js");
const admin = read("admin.js");
const history = read("platform.create.js");
const css = read("tool-undress.css");
const videoTools = read("video-tools.js");

test("undress.14vips.com is an isolated tenant without API or asset-library access", () => {
  assert.match(server, /undress\.14vips\.com=undress/);
  assert.match(server, /tenantId: "tool-undress-14vips"/);
  assert.match(server, /allowedTabs: \["gallery", "history", "topups", "spending", "referral"\]/);
  assert.match(server, /assetLibrary: false/);
  assert.match(db, /'tool-undress-14vips'/);
  assert.match(server, /function undressToolApiPathAllowed/);
  assert.match(server, /undressToolRequestAllowed\(req\) && url\.pathname\.startsWith\("\/api\/"\)/);
  assert.doesNotMatch(
    server.slice(server.indexOf("function undressToolApiPathAllowed"), server.indexOf("function undressToolFreeImageClaimId")),
    /video-tools|public\/characters|workflow|advanced/,
  );
  assert.match(server, /if \(undressToolRequestAllowed\(req\)\)[\s\S]*?allowedToolPath[\s\S]*?return sendText\(res, 404, "Not Found"\)/);
  assert.match(ui, /function requestAdvancedEstimate[\s\S]*?tenantFeature\("toolOnly", false\)/);
});

test("tool public requests avoid loading the full home catalog and anonymous database snapshot", () => {
  assert.match(server, /async function readAppConfig\(\{ includeHomeItems = true \} = \{\}\)/);
  assert.match(server, /readAppConfig\(\{ includeHomeItems: !tenantOptions\.toolOnly \}\)/);
  assert.match(server, /tenantOptions\.toolOnly \? Promise\.resolve\(""\) : getKvUpdatedAt\("app_config"\)/);
  const publicConfigHandler = server.slice(
    server.indexOf('if (req.method === "GET" && url.pathname === "/api/config/public")'),
    server.indexOf('if (req.method === "GET" && url.pathname === "/api/public/characters")'),
  );
  assert.match(publicConfigHandler, /const isToolOnly = Boolean\(tenantOptions\.toolOnly\)/);
  assert.match(publicConfigHandler, /if \(!isToolOnly\) \{[\s\S]*?ensureSceneEntriesPersisted[\s\S]*?refreshCompletedHomeVideoItems/);
  assert.match(publicConfigHandler, /const auth = getBearerToken\(req\) \? await getAuth\(req\) : \{ user: null \}/);
  assert.match(server, /if \(!requestTenantOptions\(req\)\.toolOnly\) await recordGeoVisitStats\(req, url\)/);
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

test("only users who have never recharged can receive the locked free image", () => {
  assert.match(db, /async function hasUserRechargeInDb/);
  assert.match(db, /LOWER\(status\) = 'paid'/);
  assert.match(db, /type IN \('wallet_topup', 'subscription_credit_grant'\)/);
  const eligibility = server.slice(
    server.indexOf("async function undressToolFreeImageAvailable"),
    server.indexOf("function undressToolGenerationDefinition"),
  );
  assert.match(eligibility, /hasUserRechargeInDb\(userId\)/);
  assert.match(eligibility, /if \(await hasUserRechargeInDb\(userId\)\) return null/);
  assert.match(server, /freeImageGeneration = recordBeforeSave\?\.freeImageGeneration === true && preDeductedCredits <= 0/);
  assert.match(server, /resultLocked: freeImageGeneration/);
  assert.match(server, /unlockType: freeImageGeneration \? "undress_image" : ""/);
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

test("admins can inspect locked originals without making the public asset path accessible", () => {
  const handler = server.slice(server.indexOf("async function handleAdminGenerationRecordMedia"), server.indexOf("async function handleListGenerationRecords"));
  assert.match(handler, /requireAdmin\(req, res\)/);
  assert.match(handler, /generationRecordDownloadTarget\(record\)/);
  assert.match(handler, /sendInternalAsset\(res, normalizedPath, mime, stat, \{ privateCache: true \}\)/);
  assert.match(server, /adminGenerationRecordMediaMatch[\s\S]*?handleAdminGenerationRecordMedia/);
  assert.match(admin, /fetchAdminGenerationRecordPreview/);
  assert.match(admin, /authorization: `Bearer \$\{state\.token\}`/);
  assert.match(admin, /URL\.createObjectURL\(blob\)/);
  assert.match(admin, /record\.resultLocked \? record\.lockedPreviewUrl/);
  assert.doesNotMatch(admin, /admPreview/);
  assert.match(server, /lockedRecord\?\.resultLocked === true[\s\S]*?sendText\(res, 403, "Unlock required"\)/);
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

test("Undress home uses the localized fantasy headline and adult creation description", () => {
  assert.match(frontend, /title: "\\u4f60\\u7684\\u5e7b\\u60f3\\uff0c\\u4f60\\u505a\\u4e3b\\u3002"/);
  assert.match(frontend, /subtitle: "\\u521b\\u5efa\\u81ea\\u5b9a\\u4e49\\u7684\\u6210\\u4eba\\u5185\\u5bb9\\u56fe\\u7247/);
  assert.match(frontend, /class="undress-tool-copy"[\s\S]*?undressToolText\("title"\)[\s\S]*?undressToolText\("subtitle"\)/);
  assert.match(css, /\.undress-tool-copy p[\s\S]*?color: var\(--undress-muted\)/);
});

test("all three generation tabs show compact server-backed before and after examples", () => {
  assert.match(frontend, /UNDRESS_TOOL_EXAMPLE_MEDIA/);
  assert.match(frontend, /\/api\/undress-tool\/examples\/image\/input\?v=image-20260819115156-587c60-webp1/);
  assert.match(frontend, /\/api\/undress-tool\/examples\/image\/result\?v=image-20260819115156-587c60-webp1/);
  assert.match(frontend, /media\.123vips\.com\/undress-tool\/examples\/v1\/image-video-result\.mp4/);
  assert.match(frontend, /media\.123vips\.com\/undress-tool\/examples\/v1\/video-input\.mp4/);
  assert.match(frontend, /media\.123vips\.com\/undress-tool\/examples\/v1\/video-result\.mp4/);
  assert.match(frontend, /controls playsinline preload="auto"/);
  assert.match(frontend, /loading="lazy" decoding="async" fetchpriority="low"/);
  assert.doesNotMatch(frontend, /loading="eager"/);
  assert.match(frontend, /undress-tool-example-arrow[\s\S]*?data-lucide="arrow-right"/);
  assert.match(frontend, /data-undress-example-play/);
  assert.match(frontend, /const playback = video\.play\(\)/);
  assert.match(frontend, /bindUndressToolExampleVideos\(body\)/);
  assert.doesNotMatch(frontend, /undress-20260806121918-0726d2|cgt-20260728161747-915edb/);
  assert.match(css, /\.undress-tool-example-media[\s\S]*?aspect-ratio: 9 \/ 14/);
  assert.match(css, /\.undress-tool-example-media img,[\s\S]*?object-fit: contain/);
  assert.match(css, /\.undress-tool-example-play[\s\S]*?width: 44px[\s\S]*?height: 44px/);

  const handler = server.slice(server.indexOf("async function handleUndressToolExampleMedia"), server.indexOf("async function handleUndressToolEstimate"));
  assert.match(server, /image-20260819115156-587c60/);
  assert.doesNotMatch(server, /undress-20260806121918-0726d2/);
  assert.match(server, /cgt-20260728161747-915edb/);
  assert.match(server, /video-20260806194724-f15971/);
  assert.match(handler, /undressToolRequestAllowed\(req\)/);
  assert.match(handler, /getGenerationRecord\(definition\.taskId\)/);
  assert.match(server, /UNDRESS_TOOL_EXAMPLE_DIR/);
  assert.match(handler, /ensureUndressToolExampleFile/);
  assert.match(server, /function undressToolExampleRemoteUrl/);
  assert.match(server, /async function optimizeUndressToolExampleImage/);
  assert.match(server, /libwebp/);
  assert.match(server, /image\/webp/);
  assert.match(server, /downloadRemoteFileToBuffer\(remoteUrl/);
  assert.match(server, /fs\.copyFile\(sourcePath, temporaryPath\)/);
  assert.match(handler, /sendInternalAsset\(res, filePath, mime, stat\)/);
  assert.match(server, /undressToolExampleMatch[\s\S]*?handleUndressToolExampleMedia/);
  assert.match(server, /\(image\|image_video\|video\)/);
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

test("generated Undress videos are fast-started and show their poster while previewing", () => {
  assert.match(server, /async function ensureGeneratedVideoFastStart/);
  assert.match(server, /"-movflags",[\s\S]*?"\+faststart"/);
  assert.match(server, /await ensureGeneratedVideoFastStart\(localVideoPath\)/);
  assert.match(server, /fastStartUpdated \|\| !cdnVideoUrl/);
  assert.match(server, /cacheBustedMediaUrl\(cdn\.cdnVideoUrl \|\| cdnVideoUrl, Date\.now\(\)\)/);
  assert.match(server, /function generationRecordNeedsMediaMaintenance\(record = \{\}\)[\s\S]*?!record\.playbackOptimizedAt/);
  assert.match(server, /playbackOptimizedAt: finalMedia\.playbackOptimizedAt \|\| completedAt/);
  assert.match(history, /posterUrl: generationPosterUrl\(record\)/);
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
  assert.match(history, /dialogClass: "is-undress-unlock"/);
  assert.match(css, /\.inline-modal\.is-undress-unlock \.inline-actions[\s\S]*?justify-content: center/);
  assert.match(ui, /classList\.remove\([^\n]*"is-undress-unlock"\)/);
  assert.match(history, /await showUndressUnlockConfirm\(record\)/);
  assert.match(server, /record\.localVideoUrl[\s\S]*?queueGenerationRecordMediaMaintenance\(record\)[\s\S]*?ensureUndressLockedPreview\(record\)/);
});

test("Undress results expose a download action only after the result is unlocked", () => {
  assert.match(history, /const undressDownloadAction = isUndressHistory && !resultLocked && canDownload/);
  assert.match(history, /const undressDeleteAction = isUndressHistory && !resultLocked && taskId[\s\S]*?statusClass\(record\.status\) === "failed"/);
  assert.match(history, /history-undress-result-actions[\s\S]*?data-history-delete/);
  assert.match(history, /class="history-undress-download"[\s\S]*?data-history-download/);
  assert.match(history, /\$\{undressResultActions\}[\s\S]*?<\/div>/);
  assert.match(css, /\.undress-history-footer[\s\S]*?padding:/);
  assert.match(css, /\.history-undress-result-actions[\s\S]*?border-radius: 10px/);
  assert.match(css, /\.history-undress-result-actions button[\s\S]*?width: 34px[\s\S]*?border-radius: 8px/);
  assert.match(css, /\.history-panel \.history-list[\s\S]*?grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/);
  assert.match(server, /r2KeyFromPublicDownloadUrl\(target\.objectStorageUrl\)/);
  assert.match(server, /left\[0\] < right\[0\] \? -1 : 1/);
  assert.doesNotMatch(server, /left\[0\]\.localeCompare\(right\[0\]\)/);
  assert.match(server, /source: signedUrl \? "r2_signed" : "authenticated_proxy"/);
  assert.match(ui, /href = payload\.url/);
  assert.match(ui, /directSignedDownload = payload\.source === "r2_signed"/);
  assert.match(ui, /if \(directSignedDownload\) \{[\s\S]*?triggerBrowserDownload\(href, fileName\)[\s\S]*?return;/);
  assert.match(ui, /await saveDownloadFromFetch\(href\.startsWith\("\/api\/"\) \? href : legacyHref, fileName\)/);
  assert.match(history, /data-history-download[\s\S]*?button\.disabled = true[\s\S]*?await downloadGenerationRecord\(record\)[\s\S]*?button\.disabled = false/);
  assert.match(html, /platform\.js\?v=ai-\d+-[a-z0-9-]+/);
});

test("insufficient unlock balance opens a top-up dialog", () => {
  assert.match(history, /async function showUndressInsufficientCreditsDialog/);
  assert.match(history, /error\.statusCode === 402 \|\| error\.code === "INSUFFICIENT_CREDITS"/);
  assert.match(history, /if \(result === "confirm"\) openTopupDialog\(\)/);
  assert.match(frontend, /showUndressInsufficientCreditsDialog\(error\)/);
  assert.match(css, /\.history-unlock-overlay[\s\S]*?position: absolute/);
});
