"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const application = require("../server");
const platformHtml = fs.readFileSync(path.join(root, "platform.html"), "utf8");
const platformUi = fs.readFileSync(path.join(root, "platform.ui.js"), "utf8");
const platformCreate = fs.readFileSync(path.join(root, "platform.create.js"), "utf8");
const server = fs.readFileSync(path.join(root, "server.js"), "utf8");

test("Seedance 2.0 Fast is an independent Generate option", () => {
  assert.match(platformHtml, /<option value="seedance-fast">Seedance 2\.0 Fast<\/option>/);
  assert.match(platformUi, /function advancedEngineValueResolved[\s\S]*?"seedance-fast"/);
  assert.match(platformUi, /function advancedVideoResolutionOptions[\s\S]*?seedance-fast[\s\S]*?return \["480p", "720p"\]/);
  assert.match(platformCreate, /seedanceTier: provider === "seedance" \? seedanceTier : undefined/);
});

test("Seedance 2.0 Fast sells at 1.5x BytePlus output token cost", () => {
  const hd = application.advancedModelPricing("seedance", {
    duration: 5,
    resolution: "720p",
    seedanceTier: "fast",
  });
  const sd = application.advancedModelPricing("seedance", {
    duration: 5,
    resolution: "480p",
    seedanceTier: "fast",
  });

  assert.equal(hd.creditsPerSecond, 17.29728);
  assert.equal(hd.credits, 86.4864);
  assert.equal(sd.creditsPerSecond, 8.1648);
  assert.equal(sd.credits, 40.824);
  assert.equal(hd.tierDiscount, 1);
  assert.equal(hd.markup, 1);
});

test("Seedance 2.0 Fast input-video rates are charged separately", () => {
  const hd = application.advancedModelPricing("seedance", {
    duration: 5,
    resolution: "720p",
    seedanceTier: "fast",
    inputVideoSeconds: 1,
  });
  const sd = application.advancedModelPricing("seedance", {
    duration: 5,
    resolution: "480p",
    seedanceTier: "fast",
    inputVideoSeconds: 1,
  });

  assert.equal(hd.videoInputCreditsPerSecond, 10.19304);
  assert.equal(sd.videoInputCreditsPerSecond, 4.8114);
  assert.equal(hd.baseCredits, 96.6794);
  assert.equal(sd.baseCredits, 45.6354);
});

test("legacy Fast defaults migrate without overwriting custom prices", () => {
  const legacy = {
    seedanceFastCreditsPerSecondByResolution: { "480p": 12, "720p": 24 },
    seedanceFastVideoInputCreditsPerSecondByResolution: { "480p": 8, "720p": 16 },
  };
  const migrated = application.advancedModelPricing("seedance", {
    duration: 5,
    resolution: "720p",
    seedanceTier: "fast",
    inputVideoSeconds: 1,
    advancedPricing: legacy,
  });
  assert.equal(migrated.creditsPerSecond, 17.29728);
  assert.equal(migrated.videoInputCreditsPerSecond, 10.19304);

  const roundedLegacy = {
    seedanceFastCreditsPerSecondByResolution: { "480p": 4.0824, "720p": 8.64864 },
    seedanceFastVideoInputCreditsPerSecondByResolution: { "480p": 2.4057, "720p": 5.09652 },
  };
  const rounded = application.advancedModelPricing("seedance", {
    duration: 5,
    resolution: "720p",
    seedanceTier: "fast",
    inputVideoSeconds: 1,
    advancedPricing: roundedLegacy,
  });
  assert.equal(rounded.creditsPerSecond, 17.29728);
  assert.equal(rounded.videoInputCreditsPerSecond, 10.19304);

  const custom = {
    seedanceFastCreditsPerSecondByResolution: { "480p": 9.5, "720p": 19.25 },
    seedanceFastVideoInputCreditsPerSecondByResolution: { "480p": 5.5, "720p": 11.75 },
  };
  const preserved = application.advancedModelPricing("seedance", {
    duration: 5,
    resolution: "720p",
    seedanceTier: "fast",
    inputVideoSeconds: 1,
    advancedPricing: custom,
  });
  assert.equal(preserved.creditsPerSecond, 19.25);
  assert.equal(preserved.videoInputCreditsPerSecond, 11.75);
});

test("public and admin pricing expose the approved Fast sale and purchase rates", async () => {
  const publicRows = application.publicAdvancedPricingRows();
  const publicRates = Object.fromEntries(publicRows.map((row) => [row.key, row.saleCreditsPerUnit]));
  assert.equal(publicRates["seedance-fast-480p"], 8.1648);
  assert.equal(publicRates["seedance-fast-720p"], 17.29728);
  assert.equal(publicRates["seedance-fast-video-input-480p"], 4.8114);
  assert.equal(publicRates["seedance-fast-video-input-720p"], 10.19304);

  const adminPricing = await application.adminAdvancedPricingView();
  const adminById = Object.fromEntries(adminPricing.rows.map((row) => [row.key, row]));
  assert.equal(adminById["seedance-fast-480p"].providerLabel, "Seedance 2.0 Fast");
  assert.equal(adminById["seedance-fast-720p"].providerLabel, "Seedance 2.0 Fast");
  assert.equal(adminById["seedance-fast-480p"].purchaseCreditsPerSecond, 5.4432);
  assert.equal(adminById["seedance-fast-720p"].purchaseCreditsPerSecond, 11.53152);
  assert.equal(adminById["seedance-fast-video-input-480p"].purchaseCreditsPerSecond, 3.2076);
  assert.equal(adminById["seedance-fast-video-input-720p"].purchaseCreditsPerSecond, 6.79536);
});

test("standard Seedance pricing and Fast endpoint routing are unchanged", () => {
  const standard = application.advancedModelPricing("seedance", { duration: 5, resolution: "720p" });
  assert.equal(standard.creditsPerSecond, 30);
  assert.equal(standard.credits, 150);

  const fast = application.advancedModelPricing("seedance", {
    duration: 5,
    resolution: "720p",
    seedanceTier: "fast",
  });
  assert.equal(fast.model, "ep-20260429142538-fkm9d");
  assert.match(server, /const SEEDANCE_FAST_ENDPOINT_ID = "ep-20260429142538-fkm9d"/);
});
