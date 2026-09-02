"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const config = fs.readFileSync(path.join(root, "platform.config.js"), "utf8");
const ui = fs.readFileSync(path.join(root, "platform.ui.js"), "utf8");
const create = fs.readFileSync(path.join(root, "platform.create.js"), "utf8");
const main = fs.readFileSync(path.join(root, "platform.main.js"), "utf8");
const server = fs.readFileSync(path.join(root, "server.js"), "utf8");
const videoActions = JSON.parse(fs.readFileSync(path.join(root, "assets", "ourdream", "presets", "video-actions.json"), "utf8"));
const mirrorScript = fs.readFileSync(path.join(root, "scripts", "refresh-ourdream-presets.js"), "utf8");
const { dedupeItems, getOurDreamPresetLibrary, normalizeCharacter, normalizePresetItem, tRpcUrl } = require("../ourdream-presets");

test("Advanced creation modes use the requested OurDream slot structure and Wan routes", () => {
  assert.match(config, /id: "image-create"[^\n]+activeSlots: \["character", "pose", "outfit", "scene"\]/);
  assert.match(config, /id: "video-text"[^\n]+provider: "wan30"[^\n]+videoCapability: "wan30-video"[^\n]+activeSlots: \["character", "action", "outfit", "scene"\]/);
  assert.match(config, /id: "video-image"[^\n]+provider: "wan27"[^\n]+videoCapability: "wan27-video-edit"[^\n]+activeSlots: \["character", "action"\]/);
  assert.match(config, /\["video-image", "video-extend", "video-replace"\]\.includes\(mode\)/);
  assert.match(config, /将视频中的人物替换成图片中的人物。/);
});

test("Advanced preset submission maps images and action videos separately", () => {
  assert.match(ui, /function advancedPresetVideoReferences\(\)/);
  assert.match(ui, /Reference video \$\{index \+ 1\}: action, pose sequence, timing, and motion reference/);
  assert.match(create, /dedupeAdvancedMediaReferences\(\[\.\.\.presetVideoReferences, \.\.\.advancedSeedanceVideoReferences\(\)\]\)/);
  assert.match(create, /presetActionVideo\?\.url/);
  assert.match(create, /followInputDuration: advancedVideoEditUsesSourceDuration\(videoCapability\)/);
  assert.match(main, /uploadedFileMime\(file\)/);
});

test("OurDream live preset adapter preserves variants and original prompts", () => {
  const female = normalizePresetItem({ id: "same", label: "Pose", prompt: "female pose", imageUrl: "https://img/f" }, "pose", { gender: "Female", style: "Realistic" });
  const male = normalizePresetItem({ id: "same", label: "Pose", prompt: "male pose", imageUrl: "https://img/m" }, "pose", { gender: "Male", style: "Realistic" });
  const [merged] = dedupeItems([female, male]);
  assert.equal(merged.prompt, "female pose");
  assert.equal(merged.variants["Female:Realistic"].imageUrl, "https://img/f");
  assert.equal(merged.variants["Male:Realistic"].prompt, "male pose");

  const character = normalizeCharacter({ id: "c1", name: "Ava", age: 25, gender: "Female", style: "Realistic", tags: ["Adult"], displayImageUrls: ["https://vid/x", "https://img.ourdream.ai/thumb/x"] });
  assert.equal(character.imageUrl, "https://img.ourdream.ai/thumb/x");
  assert.match(character.prompt, /Keep identity, face, hairstyle, body type, and age impression consistent/);
  assert.match(tRpcUrl("presets.getAll", { gender: "Female", style: "Realistic" }), /trpc\.svc\.ourdream\.ai\/api\/trpc\/presets\.getAll/);
});

test("OurDream media refresh mirrors action resources into our R2 namespace", () => {
  assert.ok(videoActions.items.length >= 60);
  assert.match(mirrorScript, /assets\/ourdream\/mirrored/);
  assert.match(mirrorScript, /R2_PUBLIC_BASE_URL/);
  assert.match(mirrorScript, /sourceUrl/);
  assert.match(server, /url\.pathname === "\/api\/ourdream\/presets"/);
});

test("production preset API reads the static snapshot without live OurDream fetches", async () => {
  const library = await getOurDreamPresetLibrary({
    fetchImpl: async () => { throw new Error("live fetch must not run"); },
    force: true,
  });
  assert.ok(library.sets.length >= 4);
  assert.match(server, /const presets = await getOurDreamPresetLibrary\(\)/);
  assert.match(mirrorScript, /clean\.source = "OurDream catalog mirrored to this site's R2 bucket"/);
});
