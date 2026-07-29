"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const { planVideoEditSegments } = require("../video-tools");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const server = read("server.js");
const html = read("platform.html");
const loader = read("platform.js");
const frontend = read("platform.video-tools.js");
const css = read("tool-video.css");
const sharedCss = read("platform.css");

test("face swap plans source-timeline segments no longer than 10 seconds", () => {
  assert.deepEqual(planVideoEditSegments(8.0333), [
    { index: 0, startSeconds: 0, inputSeconds: 8.0333, outputSeconds: 8 },
  ]);
  assert.deepEqual(planVideoEditSegments(15.0417), [
    { index: 0, startSeconds: 0, inputSeconds: 10, outputSeconds: 10 },
    { index: 1, startSeconds: 10, inputSeconds: 5.0417, outputSeconds: 5 },
  ]);
});

test("Video exposes all three quick tools as floating modal actions", () => {
  assert.match(html, /id="videoToolFabs"[\s\S]*?data-video-tool-action="undress"[\s\S]*?data-video-tool-action="face-swap"[\s\S]*?data-video-tool-action="image-face-swap"/);
  assert.match(html, /id="videoToolDialog"[\s\S]*?id="videoToolDialogBody"/);
  assert.match(css, /body\.tenant-tool-video \.video-tool-fabs \{[\s\S]*?position: fixed/);
  assert.match(sharedCss, /\.video-tool-fabs \{[\s\S]*?position: fixed/);
  assert.match(frontend, /normalizeGalleryMode\(state\.galleryMode\) === "playflux-video"/);
  assert.match(loader, /"platform\.video-tools\.js"/);
});

test("Video tool upload slots show complete media in compact portrait controls", () => {
  for (const source of [css, sharedCss]) {
    assert.match(source, /\.video-tool-upload \{[\s\S]*?aspect-ratio: 9 \/ 16/);
    assert.match(source, /\.video-tool-upload-preview \{[\s\S]*?object-fit: contain/);
  }
  assert.match(frontend, /videoToolUploadCard\("targetImage"/);
  assert.match(frontend, /videoToolUploadCard\("image"[\s\S]*?copy\.faceImage/);
  assert.match(sharedCss, /\.advanced-upload-previews img \{[\s\S]*?object-fit: contain/);
  assert.match(sharedCss, /\.advanced-upload-previews video \{[\s\S]*?object-fit: contain/);
  assert.match(sharedCss, /\.workflow-upload-preview img \{[\s\S]*?object-fit: contain/);
  assert.match(sharedCss, /\.playflux-local-source-media img \{[\s\S]*?object-fit: contain/);
});

test("Video tool submission uploads local files and navigates to History immediately", () => {
  assert.match(frontend, /fetch\("\/api\/video-tools\/upload"/);
  assert.match(frontend, /body: chunk/);
  assert.match(frontend, /"x-chunk-index"/);
  assert.doesNotMatch(frontend, /readAsDataURL|\/api\/user-assets/);
  assert.match(frontend, /requestJson\("\/api\/video-tools\/generate"/);
  assert.match(frontend, /showPlayfluxSubmittedHistory\(payload\.record/);
  assert.doesNotMatch(frontend, /generation-records\/\$\{|pollVideoTool|setInterval/);
});

test("server owns Video tool pricing, orchestration, splitting, and stitching", () => {
  assert.match(server, /url\.pathname === "\/api\/video-tools\/estimate"/);
  assert.match(server, /url\.pathname === "\/api\/video-tools\/upload"/);
  assert.match(server, /url\.pathname === "\/api\/video-tools\/generate"/);
  assert.match(server, /VIDEO_TOOL_SOURCE_UPLOAD_MAX_BYTES/);
  assert.match(server, /for await \(const chunk of req\)/);
  assert.match(server, /videoCapability: "wan27-video-edit"/);
  assert.match(server, /normalizeSeedanceVideoFileForRequest\(sourcePath, normalizedPath/);
  assert.match(server, /planVideoEditSegments\(actualDuration\)/);
  assert.match(server, /composeVideoToolSegments\(taskId, generatedPaths\)/);
  assert.match(server, /upstreamSource: "video-tool-orchestrator"/);
  assert.match(server, /startVideoToolJobRecoveryScheduler\(\)/);
  assert.match(server, /upstreamTaskIds\[segment\.index\]/);
  assert.match(server, /billingStatus: cost > 0 \? "pre_deducted" : "free"/);
  assert.match(server, /refundVideoToolTask\(job\.taskId/);
});

test("image face swap uses Wan2.7 Image Pro with target image before face reference", () => {
  assert.match(server, /action === "image-face-swap"[\s\S]*?wan27ImageModifyPricing/);
  assert.match(server, /runVideoToolImageFaceSwap/);
  assert.match(server, /inputs: \[[\s\S]*?job\.targetImageAssetId[\s\S]*?job\.imageAssetId/);
  assert.match(server, /prompt: IMAGE_TOOL_FACE_SWAP_PROMPT/);
  assert.match(server, /source: `\$\{isImageAction \? "image" : "video"\}-tool-\$\{action\}`/);
  assert.match(server, /userAssetIds: assetIds/);
  assert.match(server, /targetImageAssetId: targetImageAsset\?\.id \|\| ""/);
  assert.match(server, /imageResultUrl: savedImage\.cdnImageUrl \|\| savedImage\.localImageUrl/);
  assert.match(frontend, /targetImageAssetId: targetImageAsset\?\.id \|\| undefined/);
});

test("Undress is one Wan2.7 image edit and is recorded as an image", () => {
  const pricing = server.slice(server.indexOf("async function videoToolPricing"), server.indexOf("async function handleVideoToolEstimate"));
  assert.match(pricing, /\["undress", "image-face-swap"\]\.includes\(action\)/);
  assert.match(pricing, /videoToolPricingAggregate\(action, \[imagePricing\]/);
  assert.doesNotMatch(pricing, /submitSeedanceVideoTask|videoPricing/);
  assert.match(server, /async function runVideoToolUndress\(job\)[\s\S]*?runVideoToolImageEdit\(job,[\s\S]*?VIDEO_TOOL_UNDRESS_TARGET_PROMPT/);
  assert.match(server, /const isImageAction = action === "undress" \|\| isImageFaceSwap/);
  assert.match(frontend, /const imageAction = videoToolUiState\.action === "undress" \|\| imageFaceSwap/);
  assert.match(server, /job\.action === "undress" && job\.pricing\?\.outputKind !== "image"[\s\S]*?runVideoToolUndressVideoLegacy/);
});

test("video tool recovery restores image face swap asset order", () => {
  const recovery = server.slice(server.indexOf("async function recoverVideoToolJobs"), server.indexOf("function startVideoToolJobRecoveryScheduler"));
  assert.match(recovery, /targetImageAssetId = action === "image-face-swap"/);
  assert.match(recovery, /assetIds\.find\(\(id\) => id !== targetImageAssetId\)/);
  assert.match(recovery, /targetImageAssetId,/);
});

test("intermediate segment tasks stay out of History", () => {
  const faceSwap = server.slice(server.indexOf("async function runVideoToolFaceSwap"), server.indexOf("async function runVideoToolUndress"));
  assert.doesNotMatch(faceSwap, /upsertGenerationRecord\(\{[\s\S]*?taskId: upstreamTaskId/);
  assert.match(faceSwap, /upstreamTaskIds\[segment\.index\] = upstreamTaskId/);
});
