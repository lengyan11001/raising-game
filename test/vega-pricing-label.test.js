"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const source = fs.readFileSync(path.join(root, "platform.ui.js"), "utf8");

function extractFunction(name) {
  const marker = `function ${name}(`;
  const start = source.indexOf(marker);
  if (start === -1) throw new Error(`missing function ${name}`);
  const paramsStart = source.indexOf("(", start);
  let paramsDepth = 0;
  let paramsEnd = -1;
  for (let index = paramsStart; index < source.length; index += 1) {
    if (source[index] === "(") paramsDepth += 1;
    if (source[index] === ")" && --paramsDepth === 0) {
      paramsEnd = index;
      break;
    }
  }
  if (paramsEnd === -1) throw new Error(`unterminated parameters for ${name}`);
  const bodyStart = source.indexOf("{", paramsEnd);
  let depth = 0;
  let quote = "";
  let escaped = false;
  for (let index = bodyStart; index < source.length; index += 1) {
    const char = source[index];
    if (quote) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === quote) quote = "";
      continue;
    }
    if (char === '"' || char === "'" || char === "`") {
      quote = char;
      continue;
    }
    if (char === "{") depth += 1;
    if (char === "}" && --depth === 0) return source.slice(start, index + 1);
  }
  throw new Error(`unterminated function ${name}`);
}

function loadHelpers(state) {
  const translated = {
    "cost.checking": "Checking cost...",
    "cost.credits": ({ credits }) => `${credits} credits`,
    "cost.creditsDuration": ({ credits, duration }) => `${credits} credits · ${duration}`,
    "cost.seconds": ({ value }) => `${value}s`,
  };
  return new Function(
    "state",
    "isVegaProviderId",
    "normalizeAdvancedProvider",
    "advancedProviderLabel",
    "advancedPricingUnavailableLabel",
    "advancedDurationBounds",
    "normalizeAdvancedResolution",
    "normalizeVideoRatio",
    "currentAdvancedVideoCapability",
    "selectedAdvancedReferenceImages",
    "currentQwenImage3Tier",
    "positiveDurationSeconds",
    "t",
    "formatCredits",
    "formatDurationSeconds",
    `${extractFunction("advancedEstimateKey")}
     ${extractFunction("advancedCostLabel")}
     return { advancedEstimateKey, advancedCostLabel };`,
  )(
    state,
    (provider) => ["h3-vega", "vega10-lite", "seedance20-vega"].includes(provider),
    (provider) => String(provider || ""),
    () => "Vega 1.5 Lite",
    (pricing) => String(pricing?.message || "Pricing unavailable. Generation was not started."),
    () => ({ min: 1, max: 60, fallback: 5 }),
    (resolution) => String(resolution || "720P").toUpperCase(),
    (ratio) => String(ratio || "16:9"),
    () => "",
    () => [],
    () => "pro",
    (value) => (Number(value) > 0 ? Number(value) : 0),
    (key, values) => (typeof translated[key] === "function" ? translated[key](values) : translated[key]),
    (value) => String(Number(value)),
    (value) => (Number(value) > 0 ? `${Number(value)}s` : ""),
  );
}

function keyFor(helpers, options = {}) {
  return helpers.advancedEstimateKey(6, "h3-vega", "720P", "16:9", options);
}

test("Vega Lite renders the successful estimate instead of a pricing error", () => {
  const state = { user: { pricingMultiplier: 1 }, advancedEstimateFailureKey: "" };
  const helpers = loadHelpers(state);
  const options = { inputVideoSeconds: 0, referenceVideoDurations: [], referenceVideoUrls: [] };
  state.advancedEstimateKey = keyFor(helpers, options);
  state.advancedEstimate = { available: true, credits: 81, duration: 6, resolution: "720P", videoInputSeconds: 0 };

  const label = helpers.advancedCostLabel(6, "h3-vega", "720P", "16:9", options);
  assert.equal(label, "81 credits · 6s - 720P");
  assert.doesNotMatch(label, /pricing|unavailable|not configured/i);
});

test("Vega Lite shows checking while its matching estimate is pending", () => {
  const state = { user: { pricingMultiplier: 1 }, advancedEstimatePendingKey: "", advancedEstimateFailureKey: "" };
  const helpers = loadHelpers(state);
  const options = { inputVideoSeconds: 0, referenceVideoDurations: [], referenceVideoUrls: [] };
  state.advancedEstimatePendingKey = keyFor(helpers, options);

  assert.equal(helpers.advancedCostLabel(6, "h3-vega", "720P", "16:9", options), "Checking cost...");
});

test("Vega Lite only exposes a pricing failure after the matching estimate fails", () => {
  const state = { user: { pricingMultiplier: 1 }, advancedEstimateFailureKey: "" };
  const helpers = loadHelpers(state);
  const options = { inputVideoSeconds: 0, referenceVideoDurations: [], referenceVideoUrls: [] };
  state.advancedEstimateFailureKey = keyFor(helpers, options);
  state.advancedEstimate = { available: false, message: "Upstream pricing service failed." };

  assert.equal(
    helpers.advancedCostLabel(6, "h3-vega", "720P", "16:9", options),
    "Upstream pricing service failed.",
  );
});

test("Vega Lite estimate key changes with reference-video duration", () => {
  const state = { user: { pricingMultiplier: 1 }, advancedEstimateFailureKey: "" };
  const helpers = loadHelpers(state);
  const withoutReference = keyFor(helpers, { inputVideoSeconds: 0, referenceVideoDurations: [], referenceVideoUrls: [] });
  const withReference = keyFor(helpers, { inputVideoSeconds: 7, referenceVideoDurations: [7], referenceVideoUrls: [] });

  assert.notEqual(withReference, withoutReference);
});


test("Vega 1.0 Pro aliases keep their provider identity instead of falling back to Seedance pricing", () => {
  const normalizeAdvancedProvider = new Function(
    "DEFAULT_ADVANCED_PROVIDER",
    `${extractFunction("normalizeAdvancedProvider")}
     return normalizeAdvancedProvider;`,
  )("wan27");

  for (const provider of ["seedance20-vega", "seedance20vega", "seedance2.0vega", "vega10pro", "vega1.0pro", "vega10", "vega1.0"]) {
    assert.equal(normalizeAdvancedProvider(provider), "seedance20-vega");
  }
  assert.equal(normalizeAdvancedProvider("vega10-lite"), "vega10-lite");
  assert.equal(normalizeAdvancedProvider("seedance25-vega"), "seedance25-vega");
});

test("Vega 1.0 Lite keeps its provider identity instead of falling back to Seedance pricing", () => {
  const normalizeAdvancedProvider = new Function(
    "DEFAULT_ADVANCED_PROVIDER",
    `${extractFunction("normalizeAdvancedProvider")}
     return normalizeAdvancedProvider;`,
  )("wan27");

  for (const provider of ["vega10-lite", "vega10lite", "vega1.0-lite", "vega1.0lite"]) {
    assert.equal(normalizeAdvancedProvider(provider), "vega10-lite");
  }
  assert.equal(normalizeAdvancedProvider("seedance25-vega"), "seedance25-vega");
  assert.equal(normalizeAdvancedProvider("h3-vega"), "h3-vega");
});

test("Changing the video resolution refreshes the estimated button cost", () => {
  const main = fs.readFileSync(path.join(root, "platform.main.js"), "utf8");
  const handler = main.slice(
    main.indexOf('els.advancedVideoResolutionChoices?.addEventListener("click"'),
    main.indexOf('els.advancedVideoDurationChoices?.addEventListener("click"'),
  );
  assert.match(handler, /els\.advancedResolution\.value = button\.dataset\.advancedVideoResolution/);
  assert.match(handler, /updateAdvancedModelControls\(\);/);
  assert.match(handler, /updateAdvancedButtonCost\(\);/);
});

test("Vega 1.0 Pro renders its successful estimate instead of a pricing error", () => {
  const state = { user: { pricingMultiplier: 1 }, advancedEstimateFailureKey: "" };
  const helpers = loadHelpers(state);
  const options = { inputVideoSeconds: 1, referenceVideoDurations: [1], referenceVideoUrls: ["https://cdn.example.com/ref.mp4"], referenceImageCount: 9 };
  state.advancedEstimateKey = helpers.advancedEstimateKey(6, "seedance20-vega", "1080P", "16:9", options);
  state.advancedEstimate = { available: true, credits: 249.3, duration: 6, resolution: "1080P", videoInputSeconds: 4 };

  const label = helpers.advancedCostLabel(6, "seedance20-vega", "1080P", "16:9", options);
  assert.equal(label, "249.3 credits · 6s + input 4s - 1080P");
  assert.doesNotMatch(label, /pricing|unavailable|not configured/i);
});

test("Vega 1.0 Lite renders its successful estimate instead of a pricing error", () => {
  const state = { user: { pricingMultiplier: 1 }, advancedEstimateFailureKey: "" };
  const helpers = loadHelpers(state);
  const options = { inputVideoSeconds: 3, referenceVideoDurations: [3], referenceVideoUrls: ["https://cdn.example.com/ref.mp4"], referenceImageCount: 7 };
  state.advancedEstimateKey = helpers.advancedEstimateKey(5, "vega10-lite", "768P", "16:9", options);
  state.advancedEstimate = { available: true, credits: 78.24, duration: 5, resolution: "768P", videoInputSeconds: 3 };

  const label = helpers.advancedCostLabel(5, "vega10-lite", "768P", "16:9", options);
  assert.equal(label, "78.24 credits · 5s + input 3s - 768P");
  assert.doesNotMatch(label, /pricing|unavailable|not configured/i);
});
