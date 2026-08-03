const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const html = fs.readFileSync(path.join(root, "platform.html"), "utf8");
const ui = fs.readFileSync(path.join(root, "platform.ui.js"), "utf8");
const create = fs.readFileSync(path.join(root, "platform.create.js"), "utf8");
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
  assert.match(engine, /value="wan30">Wan 3\.0/);
  assert.match(engine, /value="wan27" selected>Wan 2\.7/);
  assert.doesNotMatch(engine, /value="wan-legacy"/);
  assert.match(engine, /value="wan-animate">Wan Animate/);
  assert.match(engine, /value="happyhorse">HappyHorse/);
  assert.match(engine, /value="seedance">Seedance 2\.0/);
  assert.doesNotMatch(engine, /value="(?:wan27|happyhorse)-(?:t2v|i2v|r2v|video-edit)"/);
});

test("Seedance keeps only the two product modes", () => {
  const mode = elementMarkup("advancedSeedanceMediaMode");
  const values = [...mode.matchAll(/<option value="([^"]+)"/g)].map((match) => match[1]);
  assert.deepEqual(values, ["reference_video", "first_last_frame"]);
});

test("Wan and HappyHorse task modes live in the parameter capability map", () => {
  assert.match(ui, /wan30:[\s\S]*?value: "wan30-video"/);
  assert.match(ui, /wan27:[\s\S]*?value: "wan27-i2v"[\s\S]*?value: "wan27-video-edit"/);
  assert.match(ui, /happyhorse:[\s\S]*?value: "happyhorse-i2v", label: "First Frame"[\s\S]*?value: "happyhorse-video-edit"/);
  assert.match(ui, /label\.textContent = "Mode"/);
  assert.match(ui, /"wan-animate":[\s\S]*?value: "wan-animate-move"[\s\S]*?value: "wan-animate-mix"/);
});

test("only explicit frame modes use dedicated upload controls", () => {
  assert.match(html, /id="advancedWanFirstFrame" type="file" accept="image\/\*"/);
  assert.match(main, /advancedWanFirstFrame\?\.addEventListener\("change"/);
  assert.match(create, /usesDedicatedFrameUpload = \["seedance", "seedance25", "wan30"\]\.includes\(provider\) && seedanceModeNeedsFirstFrame\(seedanceMode\)/);
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
  assert.match(create, /provider === "wan30" \|\| provider === "seedance25"\s*\? \["adaptive", "16:9", "21:9", "9:16", "4:3", "3:4", "1:1"\]/);
  assert.match(create, /els\.advancedRatio\.value \|\| \(\["wan30", "seedance25"\]\.includes\(provider\) \? "adaptive" : "9:16"\)/);
  assert.match(create, /\["wan30", "seedance25"\]\.includes\(provider\) && rawRatio === "adaptive" \? "adaptive"/);
  assert.match(create, /\? \[-1, \.\.\.Array\.from\(\{ length: 29 \}/);
  assert.match(create, /ADVANCED_WAN30_VIDEO_REFERENCE_LIMIT/);
  assert.doesNotMatch(html, /id="advancedWan30(?:Image|Video|Audio)Url"/);
});

test("Wan2.7 video edit follows source duration instead of exposing a manual duration", () => {
  assert.match(ui, /function advancedVideoEditUsesSourceDuration/);
  assert.match(create, /followInputDuration: advancedVideoEditUsesSourceDuration\(videoCapability\)/);
  assert.match(create, /Math\.ceil\(aliyunInputVideoSeconds\)/);
  assert.match(server, /duration: followInputDuration \? 0/);
  assert.match(server, /requestParams\.videoCapability === "wan27-video-edit" && requestParams\.followInputDuration/);
});

test("custom Advanced prompts are forwarded without system negative text", () => {
  assert.match(server, /function isAdvancedCustomPrompt\(body = \{\}\)/);
  assert.match(server, /return preserveUserPrompt \|\| createKind === "custom" \|\| createMode === "custom"/);
  assert.match(server, /if \(!base \|\| isAdvancedCustomPrompt\(body\)\) return base/);
  assert.match(server, /preserveUserPrompt: isAdvancedCustomPrompt\(mergedBodyBase\)/);
  assert.match(server, /preserveUserPrompt: requestParams\.preserveUserPrompt \|\| undefined/);
  assert.match(server, /params: requestParams\.preserveUserPrompt \? \{/);
  assert.match(server, /prompt: appendDefaultVideoNegativePrompt\(prompt, source\)/);
  assert.match(server, /text: appendDefaultVideoNegativePrompt\(prompt, body\)/);
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
