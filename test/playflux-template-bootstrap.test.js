const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const source = fs.readFileSync(path.join(root, "platform.create.parts/part-06.js"), "utf8");

test("bootstrap config refresh does not wipe loaded PlayFlux templates", () => {
  assert.match(source, /const playfluxTemplates = Array\.isArray\(config\.playfluxTemplates\) \? config\.playfluxTemplates : \[\];/);
  assert.match(source, /if \(playfluxTemplates\.length \|\| !state\.playfluxTemplatesLoaded \|\| !state\.playfluxTemplates\.length\) \{[\s\S]*?state\.playfluxTemplates = playfluxTemplates;/);
});
