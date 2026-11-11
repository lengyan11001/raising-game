const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const root = path.resolve(__dirname, "..");
const read = (name) => fs.readFileSync(path.join(root, name), "utf8");

test("custom generation exposes video, image, conversation in requested order", () => {
  const ui = read("platform.ui.js");
  assert.match(ui, /const customKinds = \[[\s\S]*?id: "video"[\s\S]*?id: "image"[\s\S]*?id: "conversation"/);
  assert.match(ui, /data-advanced-custom-media-kind/);
  assert.match(read("platform.main.js"), /setAdvancedCustomMediaKind\(customButton\.dataset\.advancedCustomMediaKind/);
});

test("custom model selector filters models by the selected generation kind", () => {
  const create = read("platform.create.js");
  assert.match(create, /if \(kind === "image"\) return \["wan27-image-edit", "seedream5-image", "qwen-image3", "z-image-spicy-pro", "qwen-image-edit-spicy"\]\.includes\(provider\)/);
  assert.match(create, /if \(kind === "conversation"\) return \["byteplus-language", "papaya", "qwen37-flash"\]\.includes\(provider\)/);
  assert.match(create, /otherMediaKindHidden \|\| permanentlyHidden/);
  assert.match(create, /group\.hidden = !Array\.from\(group\.querySelectorAll\("option"\)\)\.some/);
});

test("advanced results have separate video, image, and conversation filters", () => {
  const html = read("platform.html");
  const create = read("platform.create.js");
  assert.match(html, /data-advanced-result-kind="video"[\s\S]*?data-advanced-result-kind="image"[\s\S]*?data-advanced-result-kind="conversation"/);
  assert.match(create, /function advancedResultKind\(/);
  assert.match(create, /\.filter\(\(record\) => advancedResultKind\(record\) === \(state\.advancedResultMediaKind \|\| "video"\)\)/);
});

test("image generation reference thumbnails keep the same compact maximum size as video", () => {
  const css = read("platform.css");
  const rule = css.match(/\.advanced-upload-box\.is-image-edit \.advanced-upload-previews \{[\s\S]*?\n\}/)?.[0] || "";
  assert.ok(rule, "image-edit preview grid rule should exist");
  assert.match(rule, /repeat\(auto-fill, minmax\(82px, 100px\)\)/);
  assert.doesNotMatch(rule, /1fr/);
});

test("advanced generation asset cards no longer jump to the legacy modify workspace", () => {
  const create = read("platform.create.parts/part-01.js");
  assert.doesNotMatch(create, /data-advanced-asset-modify/);
  assert.doesNotMatch(create, /useAssetInAdvanced\([^\n]*"modify"/);
});
