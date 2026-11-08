"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const source = fs.readFileSync(path.join(root, "platform.create.parts", "part-04.js"), "utf8");

test("advanced workspace routes use the defined setTab helper", () => {
  assert.doesNotMatch(source, /setAdvancedWorkspaceTab\s*\(/);
  assert.match(source, /function restoreRecordToAdvancedCreate[\s\S]*?setTab\("advanced"\);/, "regeneration restore must route with setTab");
  assert.match(source, /function useAssetInAdvanced[\s\S]*?setTab\("advanced"\);/, "asset-to-create routing must use setTab");
});
