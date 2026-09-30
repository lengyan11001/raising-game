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
  assert.match(create, /if \(kind === "image"\) return \["wan27-image-edit", "seedream5-image", "qwen-image3"\]/);
  assert.match(create, /if \(kind === "conversation"\) return provider === "byteplus-language"/);
  assert.match(create, /customKindHidden \|\| permanentlyHidden/);
});

test("advanced results have separate video, image, and conversation filters", () => {
  const html = read("platform.html");
  const create = read("platform.create.js");
  assert.match(html, /data-advanced-result-kind="video"[\s\S]*?data-advanced-result-kind="image"[\s\S]*?data-advanced-result-kind="conversation"/);
  assert.match(create, /function advancedResultKind\(/);
  assert.match(create, /records\.filter\(\(record\) => advancedResultKind\(record\) ===/);
});
