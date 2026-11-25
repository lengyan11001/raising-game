"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const gptImage2 = require("../gpt-image2");
const providers = require("../lib-providers");
const server = require("../server");

function read(relPath) {
  return fs.readFileSync(path.join(root, relPath), "utf8");
}

test("GPT Image 2 keeps its canonical provider id, aliases, and public label", () => {
  assert.equal(providers.isGptImage2Provider("gpt-image-2"), true);
  assert.equal(providers.isGptImage2Provider("openai/gpt-image-2"), true);
  assert.equal(providers.isGptImage2Provider("openai/gpt-image-2/edit"), true);
  assert.equal(providers.isGptImage2Provider("ChatGPT Images 2.0"), true);
  assert.equal(providers.isGptImage2Provider("gtp-image-2"), true);
  assert.equal(providers.isGptImage2Provider("seedream55-image"), false);

  assert.equal(providers.normalizeAdvancedProvider("openai/gpt-image-2"), "gpt-image-2");
  assert.equal(providers.normalizeAdvancedProvider("openai/gpt-image-2/edit"), "gpt-image-2");
  assert.equal(providers.publicProviderId("openai/gpt-image-2"), "gpt-image-2");
  assert.equal(providers.publicProviderLabel("gpt-image-2"), "GPT Image 2");
});

test("GPT Image 2 builds documented APIZ payloads for t2i and edit with all parameters intact", () => {
  const t2i = gptImage2.buildGptImage2UpstreamPayload({
    prompt: "Studio product photo",
    ratio: "16:9",
    resolution: "4K",
    quality: "high",
    outputFormat: "webp",
  });
  assert.equal(t2i.model, "openai/gpt-image-2");
  assert.deepEqual(t2i.params, {
    prompt: "Studio product photo",
    image_size: "16:9",
    resolution: "4K",
    quality: "high",
    num_images: 1,
    output_format: "webp",
  });
  assert.equal(t2i.channel, null);

  // Auto/adaptive ratio falls back to 1:1 on text-to-image (not in t2i enum).
  const t2iAuto = gptImage2.buildGptImage2UpstreamPayload({
    prompt: "Poster art",
    ratio: "auto",
    resolution: "2K",
    quality: "low",
    outputFormat: "jpg",
  });
  assert.equal(t2iAuto.model, "openai/gpt-image-2");
  assert.equal(t2iAuto.params.image_size, "1:1");
  assert.equal(t2iAuto.params.output_format, "jpeg");

  // Edit mode routes to openai/gpt-image-2/edit and preserves auto ratio + mask_url.
  const edit = gptImage2.buildGptImage2UpstreamPayload({
    prompt: "Make the apple green",
    ratio: "auto",
    resolution: "2K",
    quality: "medium",
    outputFormat: "png",
    imageUrls: ["https://media.123vips.com/a.png", "https://media.123vips.com/b.png"],
    maskUrl: "https://media.123vips.com/mask.png",
  });
  assert.equal(edit.model, "openai/gpt-image-2/edit");
  assert.deepEqual(edit.params, {
    prompt: "Make the apple green",
    image_size: "auto",
    resolution: "2K",
    quality: "medium",
    num_images: 1,
    output_format: "png",
    image_urls: ["https://media.123vips.com/a.png", "https://media.123vips.com/b.png"],
    mask_url: "https://media.123vips.com/mask.png",
  });
});

test("GPT Image 2 converts APIZ CNY points to USD site credits at exact 1.5x across all specs and references", () => {
  const specs = [
    ["1K", "low", 5],
    ["1K", "medium", 43],
    ["1K", "high", 170],
    ["2K", "low", 5],
    ["2K", "medium", 54],
    ["2K", "high", 345],
    ["4K", "low", 5],
    ["4K", "medium", 54],
    ["4K", "high", 345],
  ];
  for (const [resolution, quality, upstreamPoints] of specs) {
    const expectedSaleUsd = gptImage2.gptImage2PointsToSaleUsd(upstreamPoints);
    const expectedCredits = Math.round(expectedSaleUsd * 100 * 10000) / 10000;
    const estimate = server.gptImage2PricingEstimate(undefined, {
      resolution,
      quality,
      referenceImageCount: 0,
    });
    assert.equal(estimate.provider, "gpt-image-2");
    assert.equal(estimate.resolution, resolution);
    assert.equal(estimate.quality, quality);
    assert.equal(estimate.model, "openai/gpt-image-2");
    assert.equal(estimate.outputUsd, expectedSaleUsd, `${resolution} ${quality} sale USD`);
    assert.equal(estimate.credits, expectedCredits, `${resolution} ${quality} credits`);
  }

  // Verify reference image add-on (+7 APIZ points per reference -> 1.5x USD).
  const editEstimate = server.gptImage2PricingEstimate(undefined, {
    resolution: "2K",
    quality: "medium",
    referenceImageCount: 2,
  });
  const expectedBaseUsd = gptImage2.gptImage2PointsToSaleUsd(54);
  const expectedRefUsd = gptImage2.gptImage2PointsToSaleUsd(7);
  const expectedTotalUsd = Math.round((expectedBaseUsd + expectedRefUsd * 2) * 1e6) / 1e6;
  assert.equal(editEstimate.model, "openai/gpt-image-2/edit");
  assert.equal(editEstimate.referenceImageCount, 2);
  assert.equal(editEstimate.totalUsd, expectedTotalUsd);
  assert.equal(editEstimate.credits, Math.round(expectedTotalUsd * 100 * 10000) / 10000);
});

test("GPT Image 2 accepts ten references and rejects the eleventh", () => {
  const ten = Array.from({ length: 10 }, (_, idx) => ({ url: `https://media.123vips.com/ref-${idx}.png` }));
  assert.equal(server.gptImage2ReferenceInputsFromBody({ referenceImages: ten }).length, 10);
  const eleven = [...ten, { url: "https://media.123vips.com/ref-10.png" }];
  assert.throws(
    () => server.gptImage2ReferenceInputsFromBody({ referenceImages: eleven }),
    (err) => err && err.code === "TOO_MANY_GPT_IMAGE2_IMAGES",
  );
});

test("GPT Image 2 public and admin pricing rows round-trip cleanly and respect 1.5x defaults", async () => {
  const admin = await server.adminAdvancedPricingView({});
  const gptRows = admin.rows.filter((row) => row.provider === "gpt-image-2");
  assert.equal(gptRows.length, 10);
  assert.ok(gptRows.every((row) => row.modelGroup === "image"));
  assert.ok(gptRows.every((row) => !Object.prototype.hasOwnProperty.call(row, "modelSubtitle")));

  const row2kHigh = gptRows.find((row) => row.key === "gpt-image-2-2k-high");
  assert.ok(row2kHigh);
  assert.equal(row2kHigh.purchaseUsdPerSecond, gptImage2.gptImage2PointsToPurchaseUsd(345));
  assert.equal(row2kHigh.saleUsdPerSecond, gptImage2.gptImage2PointsToSaleUsd(345));
  assert.equal(row2kHigh.unit, "image");

  const refRow = gptRows.find((row) => row.key === "gpt-image-2-reference");
  assert.ok(refRow);
  assert.equal(refRow.unit, "reference_image");
  assert.equal(refRow.purchaseUsdPerSecond, gptImage2.gptImage2PointsToPurchaseUsd(7));
  assert.equal(refRow.saleUsdPerSecond, gptImage2.gptImage2PointsToSaleUsd(7));

  const editableRows = admin.rows.filter((row) => row.saleCreditsPerSecond !== null);
  // Unchanged round-trip must NOT flip userConfigured to true.
  const unchanged = server.advancedPricingFromBody({ rows: editableRows }, {});
  assert.equal(unchanged.gptImage2.userConfigured, false);

  // Explicit admin override flips userConfigured to true and persists new sale USD.
  const editedRows = editableRows.map((row) => (
    row.key === "gpt-image-2-1k-high"
      ? { ...row, saleUsdPerSecond: 0.5, saleCreditsPerSecond: 50 }
      : row
  ));
  const edited = server.advancedPricingFromBody({ rows: editedRows }, {});
  assert.equal(edited.gptImage2.userConfigured, true);
  assert.equal(edited.gptImage2.saleUsdByResolutionQuality["1K"].high, 0.5);

  const publicRows = server.publicAdvancedPricingRows({});
  assert.equal(publicRows.filter((row) => row.provider === "gpt-image-2").length, 10);
});

test("GPT Image 2 upstream true-up computes exact 1.5x settlement and respects admin overrides", () => {
  const autoSettlement = server.gptImage2FinalCreditsFromUpstream({
    provider: "gpt-image-2",
    userPricingMultiplier: 1,
    pricingEstimate: { userConfigured: false, cnyPerUsd: 6.67, saleMarkup: 1.5, modelDiscount: 1 },
    queryResponse: { price: 80 },
  });
  assert.ok(autoSettlement);
  const expected80 = Math.round(gptImage2.gptImage2PointsToSaleUsd(80) * 100 * 10000) / 10000;
  assert.equal(autoSettlement.reportedPoints, 80);
  assert.equal(autoSettlement.credits, expected80);

  // Admin custom sale price skips upstream point override.
  const customSettlement = server.gptImage2FinalCreditsFromUpstream({
    provider: "gpt-image-2",
    userPricingMultiplier: 1,
    pricingEstimate: { userConfigured: true, cnyPerUsd: 6.67, saleMarkup: 1.5, modelDiscount: 1 },
    queryResponse: { price: 80 },
  });
  assert.equal(customSettlement, null);
});

test("GPT Image 2 frontend exposes model option, quality/format chips, all resolutions/ratios, and regenerate", () => {
  const html = read("platform.html");
  const createSource = read("platform.create.js");
  const mainSource = read("platform.main.js");
  const uiSource = read("platform.ui.js");

  assert.match(html, /<option value="gpt-image-2">GPT Image 2<\/option>/);
  assert.match(html, /<select id="advancedGptImageQuality">[\s\S]*?<option value="low">[\s\S]*?<option value="medium" selected>[\s\S]*?<option value="high">/);
  assert.match(html, /<select id="advancedGptImageFormat">[\s\S]*?<option value="png" selected>[\s\S]*?<option value="jpeg">[\s\S]*?<option value="webp">/);

  assert.match(createSource, /const gptImage2Options = \["1K", "2K", "4K"\]/);
  assert.match(createSource, /if \(kind === "quality"\) return els\.advancedGptImageQuality;/);
  assert.match(createSource, /if \(kind === "format"\) return els\.advancedGptImageFormat;/);
  assert.match(createSource, /\["ratio", "resolution", "quality", "format", "duration"\]\.forEach/);
  assert.match(createSource, /gptImage2 \? \{ quality: gptQuality, output_format: gptFormat \}/);
  assert.match(createSource, /if \(provider === "gpt-image-2"\) \{\n\s+if \(els\.advancedGptImageQuality\)/);
  assert.match(uiSource, /quality: provider === "gpt-image-2" \? currentGptImage2Quality\(\) : undefined/);
  assert.match(mainSource, /\[els\.advancedGptImageQuality, els\.advancedGptImageFormat,/);
});

test("GPT Image 2 extracts image URLs and reported points from real APIZ response payloads", () => {
  const realTask = {
    task_id: "7677a71e-16f7-4fec-8055-5e2d585e3db7",
    model: "openai/gpt-image-2",
    status: "completed",
    price: 43,
    output: {
      images: [
        {
          url: "https://cdn-hk.51sux.com/v3-tasks/qimg-gpt-image-2/2026/11/25/example.png",
          width: 1024,
          height: 1024,
          content_type: "image/png",
        },
      ],
    },
  };
  assert.deepEqual(gptImage2.extractGptImage2OutputUrls(realTask), [
    "https://cdn-hk.51sux.com/v3-tasks/qimg-gpt-image-2/2026/11/25/example.png",
  ]);
  assert.equal(gptImage2.extractGptImage2ReportedPoints(realTask), 43);

  const mediaAssets = server.gptImage2PreparedMediaAssets([
    { id: "asset_1", localUrl: "/assets/user-uploads/a.png", publicUrl: "https://media.123vips.com/a.png", name: "ref-a" },
  ]);
  assert.equal(mediaAssets.length, 1);
  assert.equal(mediaAssets[0].userAssetId, "asset_1");
  assert.equal(mediaAssets[0].publicUrl, "https://media.123vips.com/a.png");
});

test("GPT Image 2 frontend pricing matches backend across resolutions, qualities, and references", () => {
  const configSrc = read("platform.config.js");
  const ui2Src = read("platform.ui.parts/part-02.js");
  const ui3Src = read("platform.ui.parts/part-03.js");
  const extractConst = (src, name) => {
    const m = src.match(new RegExp(`const ${name} = [^;]+;`));
    assert.ok(m, `missing const ${name}`);
    return m[0];
  };
  const extractFn = (src, name) => {
    const start = src.indexOf(`\nfunction ${name}(`) >= 0 ? src.indexOf(`\nfunction ${name}(`) + 1 : src.indexOf(`function ${name}(`);
    assert.ok(start >= 0, `missing function ${name}`);
    const end = src.indexOf("\n}\n", start);
    assert.ok(end > start, `unterminated function ${name}`);
    return src.slice(start, end + 2);
  };
  const evalPricing = new Function(
    "state",
    "els",
    "selectedAdvancedReferenceImages",
    "isVegaProviderId",
    "vegaCapabilities",
    "VEGA_ALL_RESOLUTIONS",
    "DEFAULT_ADVANCED_PROVIDER",
    "advancedVideoResolutionOptions",
    [
      extractConst(configSrc, "ADVANCED_GPT_IMAGE2_REFERENCE_LIMIT"),
      extractConst(configSrc, "ADVANCED_GPT_IMAGE2_DEFAULT_RESOLUTION"),
      extractConst(configSrc, "ADVANCED_GPT_IMAGE2_DEFAULT_QUALITY"),
      extractConst(configSrc, "ADVANCED_GPT_IMAGE2_DEFAULT_FORMAT"),
      extractConst(configSrc, "ADVANCED_GPT_IMAGE2_SALE_USD_BY_SPEC"),
      extractConst(configSrc, "ADVANCED_GPT_IMAGE2_REFERENCE_USD_PER_IMAGE"),
      extractFn(ui2Src, "creditsAmount"),
      extractFn(ui2Src, "userPricingMultiplier"),
      extractFn(ui2Src, "normalizeAdvancedProvider"),
      extractFn(ui2Src, "normalizeAdvancedResolution"),
      extractFn(ui3Src, "normalizeGptImage2QualityUi"),
      extractFn(ui3Src, "currentGptImage2Quality"),
      extractFn(ui3Src, "advancedPricing"),
      "return advancedPricing;",
    ].join("\n"),
  )(
    { config: { platform: { advancedPricing: { creditsPerUsd: 100 } } }, user: { pricingMultiplier: 1 }, wallet: { creditsPerUsd: 100 } },
    { advancedGptImageQuality: { value: "medium" } },
    () => [],
    () => false,
    () => null,
    [],
    "seedance-nsfw",
    () => [],
  );

  for (const resolution of ["1K", "2K", "4K"]) {
    for (const quality of ["low", "medium", "high"]) {
      for (const referenceImageCount of [0, 2]) {
        const uiEst = evalPricing(1, "gpt-image-2", resolution, "1:1", { quality, referenceImageCount });
        const srvEst = server.gptImage2PricingEstimate(undefined, { resolution, quality, referenceImageCount });
        assert.equal(uiEst.credits, srvEst.credits, `UI/server mismatch for ${resolution} ${quality} refs=${referenceImageCount}`);
      }
    }
  }
});
