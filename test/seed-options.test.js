"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const {
  DEFAULT_SEED_MAX,
  SEEDANCE25_DIRECT_SEED_MAX,
  normalizeOptionalSeed,
} = require("../seed-options");
const {
  buildSeedance25DirectTaskPayload,
  validateSeedance25DirectInput,
} = require("../seedance25-direct");

const root = path.resolve(__dirname, "..");
const serverSource = fs.readFileSync(path.join(root, "server.js"), "utf8");
const createSource = fs.readFileSync(path.join(root, "platform.create.js"), "utf8");
const platformHtml = fs.readFileSync(path.join(root, "platform.html"), "utf8");

test("optional seed normalization omits empty, zero, invalid, and oversized values", () => {
  for (const value of [undefined, null, "", "  ", 0, "0", -1, "1.5", "abc", DEFAULT_SEED_MAX + 1]) {
    assert.equal(normalizeOptionalSeed(value), undefined, `expected ${String(value)} to be omitted`);
  }
  assert.equal(normalizeOptionalSeed("7"), 7);
  assert.equal(normalizeOptionalSeed(42), 42);
  assert.equal(normalizeOptionalSeed(String(DEFAULT_SEED_MAX)), DEFAULT_SEED_MAX);
});

test("Qwen image allows an explicit zero seed while video seeds require a positive integer", () => {
  assert.equal(normalizeOptionalSeed("0", { min: 0 }), 0);
  assert.equal(normalizeOptionalSeed("0"), undefined);
});

test("Seedance 2.5 direct payload converts string seeds and omits zero", () => {
  const withSeed = buildSeedance25DirectTaskPayload({
    prompt: "test",
    resolution: "480p",
    ratio: "adaptive",
    duration: 4,
    seed: "7",
  }, "ep-test");
  assert.equal(withSeed.seed, 7);

  const zeroSeed = buildSeedance25DirectTaskPayload({
    prompt: "test",
    resolution: "480p",
    ratio: "adaptive",
    duration: 4,
    seed: "0",
  }, "ep-test");
  assert.equal(Object.hasOwn(zeroSeed, "seed"), false);
  assert.equal(validateSeedance25DirectInput({
    prompt: "test",
    resolution: "480p",
    ratio: "adaptive",
    duration: 4,
    seed: String(SEEDANCE25_DIRECT_SEED_MAX),
  }).seed, SEEDANCE25_DIRECT_SEED_MAX);
});

test("Seedance and gateway payload builders never forward the raw web seed", () => {
  assert.match(serverSource, /delete payload\.seed/);
  assert.match(serverSource, /normalizeOptionalSeed\(firstPresent\(source\.seed, parameterExtras\.seed\)\)/);
  assert.match(serverSource, /seed: normalizeOptionalSeed\(requestParams\.seed\)/);
  assert.match(createSource, /seed: normalizeAdvancedSeed\(els\.advancedWanSeed\?\.value\)/);
  assert.doesNotMatch(createSource, /seed: els\.advancedWanSeed\?\.value \|\| ""/);
  assert.match(platformHtml, /id="advancedWanSeed" type="number" min="1" step="1"/);
});
