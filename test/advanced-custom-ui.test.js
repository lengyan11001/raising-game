const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const html = fs.readFileSync(path.join(root, "platform.html"), "utf8");
const ui = fs.readFileSync(path.join(root, "platform.ui.js"), "utf8");
const create = fs.readFileSync(path.join(root, "platform.create.js"), "utf8");
const platformExploreSource = fs.readFileSync(path.join(root, "platform.explore.js"), "utf8");
const main = fs.readFileSync(path.join(root, "platform.main.js"), "utf8");
const css = fs.readFileSync(path.join(root, "platform.css"), "utf8");
const server = fs.readFileSync(path.join(root, "server.js"), "utf8");

function elementMarkup(id) {
  const match = html.match(new RegExp(`<select id="${id}"[^>]*>([\\s\\S]*?)<\\/select>`));
  assert.ok(match, `missing #${id}`);
  return match[1];
}

test("Advanced engine list contains English model families, not task modes", () => {
  const engine = elementMarkup("advancedProvider");
  assert.doesNotMatch(engine, /[\u3400-\u9fff]/);
  assert.match(engine, /value="wan30">Wan 3\.0 Video/);
  assert.match(engine, /value="wan30-prime">Wan 3\.0 Video Prime/);
  assert.match(engine, /value="wan27" selected>Wan 2\.7/);
  assert.doesNotMatch(engine, /value="wan-legacy"/);
  assert.match(engine, /value="wan-animate">Wan Animate/);
  assert.match(engine, /value="happyhorse">HappyHorse/);
  assert.match(engine, /value="seedance">Seedance 2\.0/);
  assert.doesNotMatch(engine, /value="seedance25">Seedance 2\.5/);
  assert.match(engine, /value="seedance-nsfw">Seedance2\.5 \(NSFW\)/);
  assert.doesNotMatch(engine, /value="(?:wan27|happyhorse)-(?:t2v|i2v|r2v|video-edit)"/);
});

test("Playflux image templates resolve prompts on the server", () => {
  assert.match(server, /function findImageEditTemplate\(config = \{}, templateId = ""\)/);
  assert.match(server, /function imageEditPromptFromTemplate\(template = \{\}, \{ sourceImageCount = 0/);
  assert.match(server, /imageEditPromptFromTemplate\(template, \{/);
  assert.match(server, /body\.prompt,[\s\S]*bodyParams\.prompt,[\s\S]*imageEditPromptFromTemplate/);
  assert.match(server, /const templateId = String\(firstPresent\(body\.templateId, bodyParams\.templateId/);
  assert.match(server, /const template = findImageEditTemplate\(config, templateId\)/);
  assert.match(server, /if \(!prompt\) return sendJson\(res, 400, \{ ok: false, message: "Prompt is required\." \}\)/);
  assert.match(platformExploreSource, /requestJson\("\/api\/wan27\/image-edit"/);
  assert.doesNotMatch(platformExploreSource.match(/requestJson\("\/api\/wan27\/image-edit"[\s\S]{0,900}?body: \{([\s\S]*?)\n        \},/g)?.join("\n") || "", /prompt:/);
});

test("Seedance keeps only the two product modes", () => {
  const mode = elementMarkup("advancedSeedanceMediaMode");
  const values = [...mode.matchAll(/<option value="([^"]+)"/g)].map((match) => match[1]);
  assert.deepEqual(values, ["reference_video", "first_last_frame"]);
  assert.match(ui, /seedance25: Object\.freeze\(\[[\s\S]*?value: "omini"[\s\S]*?value: "first_last_frame"/);
  assert.doesNotMatch(ui.match(/seedance25: Object\.freeze\(\[([\s\S]*?)\]\)/)?.[1] || "", /value: "(?:edit|extend)"/);
  assert.match(server, /SEEDANCE25_DIRECT_RATIOS,[\s\S]*SEEDANCE25_DIRECT_RESOLUTIONS,[\s\S]*require\("\.\/seedance25-direct"\)/);
});

test("Wan and HappyHorse task modes live in the parameter capability map", () => {
  assert.match(ui, /wan30: Object\.freeze\(\[[\s\S]*?value: "wan30-video"/);
  assert.match(ui, /"wan30-prime": Object\.freeze\(\[[\s\S]*?value: "wan30-video-prime"/);
  assert.match(ui, /wan27:[\s\S]*?value: "wan27-i2v"[\s\S]*?value: "wan27-video-edit"/);
  assert.match(ui, /happyhorse:[\s\S]*?value: "happyhorse-i2v", label: "First Frame"[\s\S]*?value: "happyhorse-video-edit"/);
  assert.match(ui, /label\.textContent = "Mode"/);
  assert.match(ui, /"wan-animate":[\s\S]*?value: "wan-animate-move"[\s\S]*?value: "wan-animate-mix"/);
});

test("Wan3.0 Prime shares controls and applies the 1.5 pricing factor", () => {
  assert.match(create, /\["wan30-video", "wan30-video-prime"\]\.includes\(capability\)/);
  assert.match(create, /new Set\(\["wan30-video", "wan30-video-prime"/);
  assert.match(ui, /capability === "wan30-video-prime" \? "Wan 3\.0 Prime" : "Wan 3\.0"/);
  assert.match(ui, /wan30PrimeCreditsPerSecondByResolution/);
  assert.match(server, /ALIYUN_WAN30_PRIME_MODEL = process\.env\.ALIYUN_WAN30_PRIME_MODEL \|\| "wan3\.0-video-prime"/);
  assert.match(server, /ALIYUN_WAN30_PRIME_PRICE_FACTOR, 1\.5/);
  assert.match(server, /wan30PrimeCreditsPerSecondByResolution/);
  assert.match(server, /key: "wan30-prime-480p"/);
  assert.match(server, /key === "wan30-prime-1080p"/);
  assert.match(server, /provider === "wan30"\s*\? aliyunVideoModelForCapability\(requestParams\.videoCapability\)/);
});

test("only explicit frame modes use dedicated upload controls", () => {
  assert.match(html, /id="advancedWanFirstFrame" type="file" accept="image\/\*"/);
  assert.match(main, /advancedWanFirstFrame\?\.addEventListener\("change"/);
  assert.match(create, /usesDedicatedFrameUpload = \["seedance", "seedance25", "seedance-nsfw", "wan30"\]\.includes\(provider\) && seedanceModeNeedsFirstFrame\(seedanceMode\)/);
  assert.doesNotMatch(create, /usesDedicatedAliyunUpload/);
});

test("Wan, HappyHorse, and Animate modes use the shared multimodal uploader", () => {
  assert.match(create, /function advancedAliyunUsesSharedReferenceUpload/);
  assert.match(create, /function advancedUsesSharedReferenceUpload/);
  assert.match(create, /"wan-animate-move"/);
  assert.match(create, /"wan-animate-mix"/);
  assert.match(create, /usesSharedReferenceUpload \|\| !hasDedicatedWanPanelSlot/);
  assert.match(create, /aliyunVideo && advancedAliyunUsesSharedReferenceUpload\(capability\)/);
  assert.match(create, /const sharedReferenceUpload = advancedUsesSharedReferenceUpload\(provider, capability\)/);
  assert.match(create, /els\.advancedImage\.accept = sharedReferenceUpload \? sharedAccept : advancedCreateUploadAcceptValue\(\)/);
  assert.match(create, /"wan30-video"/);
  assert.match(main, /await uploadAdvancedMediaReference\(file, "video"\)/);
  assert.match(main, /await uploadAdvancedMediaReference\(file, "audio"\)/);
  assert.match(create, /data-remove-shared-video/);
  assert.match(create, /data-remove-shared-audio/);
  assert.doesNotMatch(css, /\.advanced-upload-box\.is-wan \.advanced-upload-previews\s*\{[\s\S]*?grid-template-columns:\s*minmax\(120px, 1fr\)/);
});

test("Wan3.0 exposes free multimodal and frame controls without link fields", () => {
  assert.match(create, /provider === "wan30"\s*\? \["480p", "720p", "1080p"\]/);
  assert.match(create, /provider === "seedance25"\s*\? \["16:9", "21:9", "9:16", "4:3", "3:4", "1:1"\]/);
  assert.match(create, /const fallbackRatio = provider === "seedance25" \? "16:9"/);
  assert.match(create, /\["wan30", "seedance-nsfw"\]\.includes\(provider\) && rawRatio === "adaptive" \? "adaptive"/);
  assert.match(create, /provider === "seedance25" && normalizeAdvancedResolution[\s\S]*?=== "720p"\s*\? 29/);
  assert.match(create, /\? \[-1, \.\.\.Array\.from\(\{ length: 29 \}/);
  assert.match(create, /ADVANCED_WAN30_VIDEO_REFERENCE_LIMIT/);
  assert.doesNotMatch(html, /id="advancedWan30(?:Image|Video|Audio)Url"/);
});

test("Advanced image files enter the asset library before generation", () => {
  assert.match(create, /async function uploadAdvancedImageReference/);
  assert.match(create, /requestJson\("\/api\/user-assets", \{[\s\S]*?provider,/);
  assert.match(create, /assetId: asset\.id,[\s\S]*?dataUrl: assetPreviewUrl\(asset\)/);
  assert.match(create, /function assetPreviewUrl\(asset = \{\}\) \{[\s\S]*?asset\.publicUrl \|\| asset\.cdnUrl \|\| asset\.previewUrl \|\| asset\.localUrl/);
  assert.match(create, /function restoreMediaUrl\(item = \{\}\) \{[\s\S]*?item\.publicUrl[\s\S]*?item\.localUrl/);
  assert.match(ui, /function mediaAssetPreviewUrl\(asset = \{\}\) \{[\s\S]*?asset\.publicUrl[\s\S]*?asset\.localUrl/);
  assert.match(main, /const ref = await uploadAdvancedImageReference\(file, \{ provider \}\)/);
  assert.match(main, /state\.advancedSeedanceFirstFrameAssetId = ref\.assetId/);
  assert.match(main, /state\.advancedSeedanceLastFrameAssetId = ref\.assetId/);
  assert.match(ui, /assetId: item\.assetId \|\| "",[\s\S]*?dataUrl: url/);
  assert.match(ui, /id: "local-upload-character",[\s\S]*?assetId: ref\.assetId \|\| ""/);
});

test("prompt image paste and @ mentions follow the shared upload control for every model", () => {
  assert.match(create, /function advancedPromptPasteImageRule\(\)/);
  assert.match(create, /const imageTargets = advancedAssetTargetItems\(\)\.filter\(\(target\) => target\.type === "image"\)/);
  assert.match(create, /else if \(\["wan27", "happyhorse"\]\.includes\(provider\)\) limit = advancedAliyunReferenceImageLimit\(capability\)/);
  assert.match(create, /else if \(advancedUsesSharedReferenceUpload\(provider, capability\)\) limit = ADVANCED_SEEDANCE_REFERENCE_LIMIT/);
  assert.match(create, /sharedFrameProvider && seedanceModeNeedsFirstFrame\(seedanceMode\)/);
  assert.match(create, /rule\.target === "frames"/);
  assert.match(create, /syncAdvancedPromptMentionLabels\(previousPromptRefs\)/);
  assert.doesNotMatch(create, /if \(!\["seedance", "seedance25", "seedance-nsfw", "seedream5-image", "qwen-image3"\]\.includes\(currentAdvancedProvider\(\)\)\) return false/);
});

test("Wan2.7 video edit follows source duration instead of exposing a manual duration", () => {
  assert.match(ui, /function advancedVideoEditUsesSourceDuration/);
  assert.match(create, /followInputDuration: advancedVideoEditUsesSourceDuration\(videoCapability\)/);
  assert.match(create, /Math\.ceil\(aliyunInputVideoSeconds\)/);
  assert.match(server, /duration: followInputDuration \? 0/);
  assert.match(server, /requestParams\.videoCapability === "wan27-video-edit" && requestParams\.followInputDuration/);
});

test("video prompts are forwarded without a system negative prompt", () => {
  assert.doesNotMatch(server, /DEFAULT_VIDEO_NEGATIVE_PROMPT/);
  assert.doesNotMatch(server, /appendDefaultVideoNegativePrompt/);
  assert.doesNotMatch(server, /Negative prompt: extra fingers/);
  assert.match(server, /const content = \[\{ type: "text", text: String\(prompt \|\| ""\)\.trim\(\) \}\]/);
  assert.match(server, /prompt,\s*media: normalizedMedia/);
  assert.match(server, /const submittedFinalPrompt = finalPrompt/);
});

test("Seedance 2.5 server pricing migrates old rounded defaults and preserves six decimals", () => {
  assert.match(server, /const normalizeStoredCredits = \(value, fallback, digits = 4\)/);
  assert.match(server, /const normalizeSeedance25Credits = \(value, fallback, resolution\)/);
  assert.match(server, /const previousPointsPerSecond = resolution === "720p" \? 260 : 130/);
  assert.match(server, /const previousIntegerDefault = Math\.round\(previousDefault\)/);
  assert.match(server, /const previousLegacyUiDefault = resolution === "720p" \? 40 : 20/);
  assert.match(server, /\[previousDefault, previousRoundedDefault, previousIntegerDefault, previousLegacyUiDefault\]\.some/);
  assert.match(server, /const SEEDANCE25_MODEL_ID = SEEDANCE25_MODEL/);
  assert.match(server, /"480p": normalizeSeedance25Credits\(seedance25\["480p"\]/);
  assert.match(server, /"720p": normalizeSeedance25Credits\(seedance25\["720p"\]/);
  assert.match(server, /key\.startsWith\("seedance25-"\) \|\| key\.startsWith\("seedance-nsfw-"\) \? 6 : 4/);
});

test("direct Seedance 2.5 waits until every uploaded Ark asset is available", () => {
  assert.match(server, /function arkAssetStillProcessing\(error\)/);
  assert.match(server, /asset is still processing\|not available yet/i);
  assert.match(server, /async function submitArkTaskAfterAssetsReady\(payload, \{ attempts = 12, waitMs = 10000 \} = \{\}\)/);
  assert.match(server, /submitted = await submitArkTaskAfterAssetsReady\(upstreamPayload\)/);
});

test("Seedance image preprocessing is shared by the model family and remains opt-in", () => {
  assert.match(html, /id="advancedPreprocessReference" type="checkbox"/);
  assert.doesNotMatch(html, /id="advancedPreprocessReference"[^>]*checked/);
  assert.match(create, /\["seedance", "seedance25", "seedance-nsfw"\]\.includes\(provider\)[\s\S]*Boolean\(els\.advancedPreprocessReference\?\.checked\)/);
  assert.match(create, /els\.advancedPreprocessReference\.checked = false/);
  assert.match(server, /requestParams\.preprocessReference = provider === "seedance" && boolFromRequest/);
  assert.match(server, /const preprocessReference = boolFromRequest\(firstPresent\([\s\S]*body\.preprocessReference/);
  assert.match(server, /prepareSeedanceReferenceAsset\(db, userAsset, true\)/);
  assert.match(server, /seedance25PublicAssetUrls\(db, imageAssets, \{ preprocessReference: true \}\)/);
  assert.match(server, /preprocessReference: provider === "seedance" \? requestParams\.preprocessReference : undefined/);
  assert.match(server, /provider: "seedance25",[\s\S]*?preprocessReference,[\s\S]*?functionMode: upstreamInput\.mode/);
  assert.match(server, /function makeSeedancePreprocessedReferencePrompt\(item = \{\}\)/);
  assert.match(server, /A male person must remain male, a female person must remain female/);
  assert.match(server, /a scene with no people must remain a scene with no people/);
  assert.match(server, /const SEEDANCE_PREPROCESS_REFERENCE_VERSION = "preserve-source-v2"/);
  assert.match(server, /const preprocessVersion = SEEDANCE_PREPROCESS_REFERENCE_VERSION/);
  assert.match(server, /preserveSourceComposition: true/);
  assert.match(server, /function seedream5SubmitRetryPolicy\(error\)/);
  assert.match(server, /timeout while downloading url\|timed\? out while downloading/);
  assert.match(server, /attempts: 4, waitMs: 5000, reason: "reference-download"/);
  assert.match(server, /\[408, 425, 429, 500, 502, 503, 504, 520, 522\]\.includes\(statusCode\)/);
  assert.match(server, /attempts: 3, waitMs: 3000, reason: "upstream-transient"/);
});

test("Seedance reference preprocessing is included in configured billing and cached references are not charged again", () => {
  assert.match(server, /function seedancePreprocessPricingForAssets\(auth = \{\}, config = \{\}, assets = \[\], enabled = false\)/);
  assert.match(server, /asset\.syntheticReferenceAssetUri[\s\S]*?asset\.syntheticReferenceVersion === SEEDANCE_PREPROCESS_REFERENCE_VERSION/);
  assert.match(server, /advancedModelPricing\("seedream5-image", \{[\s\S]*?referenceImageCount: 1,[\s\S]*?outputImageCount: 1/);
  assert.match(server, /preprocessCredits: preprocessPricing\.credits/);
  assert.match(server, /originalPreprocessCredits: preprocessPricing\.originalCredits/);
  assert.match(server, /credits: creditsAmount\(videoPricing\.credits \+ preprocessPricing\.credits\)/);
  assert.match(server, /type: "advanced_generation"[\s\S]*?preprocessImageCount: preprocessPricing\.imageCount/);
  assert.match(server, /preprocessAssetIds: preprocessPricing\.items\.map/);
});

test("Safari duration pickers refresh pricing and deployments invalidate split frontend chunks", () => {
  assert.match(main, /advancedDuration\?\.addEventListener\("input", handleAdvancedDurationSelection\)/);
  assert.match(main, /advancedDuration\?\.addEventListener\("change", handleAdvancedDurationSelection\)/);
  assert.match(server, /const PLATFORM_ASSET_FILES = Object\.freeze/);
  assert.match(server, /function applyPlatformAssetVersion/);
  assert.match(server, /applyPlatformAssetVersion\(html, await currentPlatformAssetVersion\(\)\)/);
});

test("shared video uploads use capability-specific duration limits", () => {
  assert.match(ui, /function advancedVideoInputDurationRule/);
  assert.match(ui, /"wan27-video-edit": \{ min: 1\.8, max: 10\.2, displayMin: 2, displayMax: 10 \}/);
  assert.match(ui, /"wan-animate-move": \{ min: 1\.8, max: 30\.2, displayMin: 2, displayMax: 30 \}/);
  assert.match(ui, /"happyhorse-video-edit": \{ min: 2\.8, max: 60\.2, displayMin: 3, displayMax: 60 \}/);
  assert.match(create, /advancedVideoInputDurationMessage\(durationSeconds, currentAdvancedProvider\(\), currentAdvancedVideoCapability\(\)\)/);
  assert.match(create, /advancedVideoInputDurationMessage\(aliyunInputVideoSeconds, provider, videoCapability, \{ allowUnknown: true \}\)/);
  assert.match(main, /await uploadAdvancedMediaReference\(file, "video"\)/);
  assert.doesNotMatch(main, /const maxVideoSeconds = capability/);
});

test("Wan input combinations are inferred and media URLs are not exposed in the UI", () => {
  assert.match(html, /id="advancedWanMediaMode" type="hidden" value="multimodal"/);
  assert.doesNotMatch(html, /class="field wan-mode-field/);
  assert.doesNotMatch(html, /id="advancedWan(?:Audio|Clip)Url"/);
  assert.doesNotMatch(html, /id="advancedSeedance(?:Video|Audio)Urls"/);
  assert.match(create, /capability === "wan27-i2v"\) return 2/);
});
