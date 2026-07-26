const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const html = fs.readFileSync(path.join(root, "platform.html"), "utf8");
const ui = fs.readFileSync(path.join(root, "platform.ui.js"), "utf8");
const create = fs.readFileSync(path.join(root, "platform.create.js"), "utf8");
const main = fs.readFileSync(path.join(root, "platform.main.js"), "utf8");

function elementMarkup(id) {
  const match = html.match(new RegExp(`<select id="${id}"[^>]*>([\\s\\S]*?)<\\/select>`));
  assert.ok(match, `missing #${id}`);
  return match[1];
}

test("Advanced engine list contains English model families, not task modes", () => {
  const engine = elementMarkup("advancedProvider");
  assert.doesNotMatch(engine, /[\u3400-\u9fff]/);
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
  assert.match(ui, /wan27:[\s\S]*?value: "wan27-i2v"[\s\S]*?value: "wan27-video-edit"/);
  assert.match(ui, /happyhorse:[\s\S]*?value: "happyhorse-i2v", label: "First Frame"[\s\S]*?value: "happyhorse-video-edit"/);
  assert.match(ui, /advancedEngineValue\(\) === "happyhorse" \? "Input" : "Mode"/);
  assert.match(ui, /"wan-animate":[\s\S]*?value: "wan-animate-move"[\s\S]*?value: "wan-animate-mix"/);
});

test("frame modes use dedicated upload controls", () => {
  assert.match(html, /id="advancedWanFirstFrame" type="file" accept="image\/\*"/);
  assert.match(main, /advancedWanFirstFrame\?\.addEventListener\("change"/);
  assert.match(create, /usesDedicatedFrameUpload = provider === "seedance" && seedanceModeNeedsFirstFrame\(seedanceMode\)/);
  assert.match(create, /usesDedicatedAliyunUpload = \["wan27-i2v", "happyhorse-i2v"/);
});
