function publicAdvancedPricingRowVisible(row = {}) {
  const key = String(row.key || "").trim().toLowerCase();
  const provider = String(row.provider || "").trim().toLowerCase();
  if (provider === "happyhorse") return false;
  if (provider === "wan30") return PUBLIC_ALIYUN_MODEL_EXPOSURE_ENABLED || PUBLIC_WAN30_MODEL_EXPOSURE_ENABLED;
  if (provider === "wan27" || provider === "wan27-image") {
    return PUBLIC_ALIYUN_MODEL_EXPOSURE_ENABLED || PUBLIC_WAN27_MODEL_EXPOSURE_ENABLED;
  }
  if (provider === "qwen-image3") return PUBLIC_ALIYUN_MODEL_EXPOSURE_ENABLED || PUBLIC_QWEN_IMAGE3_EXPOSURE_ENABLED;
  return true;
}

function publicAdvancedPricingRows(pricing = DEFAULT_ADVANCED_PRICING) {
  const normalized = normalizeAdvancedPricing(pricing);
  const rows = ADVANCED_PRICING_ROWS
    .filter(publicAdvancedPricingRowVisible)
    .map((row) => {
      const saleCreditsPerUnit = advancedSaleCreditsPerSecond(
        normalized,
        row.provider,
        row.resolution,
        row.rateKind,
        row.seedanceTier,
        row.capability,
        row.mode,
        row.model,
        row.variant,
      );
      return {
        key: row.key,
        provider: row.provider,
        providerLabel: row.providerLabel,
        model: row.model || "",
        resolution: row.resolution,
        rateKind: row.rateKind || "output",
        unit: row.unit || "output_second",
        usageLabel: row.usageLabel || "",
        saleCreditsPerUnit,
      };
    });

  const imageRows = [
    {
      key: "wan27-image",
      provider: "wan27-image",
      providerLabel: "Wan2.7 Image Pro",
      model: normalized.wan27ImagePro.model,
      resolution: "1K / 2K",
      rateKind: "output",
      unit: "image",
      usageLabel: "Generated image",
      saleCreditsPerUnit: advancedSaleImageCredits(normalized),
    },
    ...["1K", "2K"].map((resolution) => ({
      key: `seedream5-pro-${resolution.toLowerCase()}`,
      provider: "seedream5-image",
      providerLabel: "Seedream 5.0 Pro",
      model: "seedream-5.0-pro",
      resolution,
      rateKind: "output",
      unit: "image",
      usageLabel: "Generated image",
      saleCreditsPerUnit: advancedSaleSeedream5Credits(normalized, resolution),
    })),
    {
      key: "seedream5-pro-reference",
      provider: "seedream5-image",
      providerLabel: "Seedream 5.0 Pro Reference",
      model: "seedream-5.0-pro",
      resolution: "reference",
      rateKind: "input",
      unit: "reference_image",
      usageLabel: "Each reference image after the first",
      saleCreditsPerUnit: advancedSaleSeedream5ReferenceCredits(normalized),
    },
    ...["pro", "standard"].flatMap((tier) => {
      const tierConfig = normalized.qwenImage3[tier];
      const label = `Qwen Image 3.0 ${tier === "pro" ? "Pro" : "Standard"}`;
      return [
        ...["1K", "2K"].map((resolution) => ({
          key: `qwen-image3-${tier}-${resolution.toLowerCase()}`,
          provider: "qwen-image3",
          providerLabel: label,
          model: QWEN_IMAGE3_MODELS[tier],
          resolution,
          rateKind: "output",
          unit: "image",
          usageLabel: "Generated image",
          saleCreditsPerUnit: pricingNumber(tierConfig.saleUsdPerImageByResolution[resolution] * DEFAULT_CREDITS_PER_USD, 0, 0, 6),
        })),
        {
          key: `qwen-image3-${tier}-reference`,
          provider: "qwen-image3",
          providerLabel: `${label} Reference`,
          model: QWEN_IMAGE3_MODELS[tier],
          resolution: "reference",
          rateKind: "input",
          unit: "reference_image",
          usageLabel: "Each reference image",
          saleCreditsPerUnit: pricingNumber(tierConfig.saleUsdPerReferenceImage * DEFAULT_CREDITS_PER_USD, 0, 0, 6),
        },
      ];
    }),
  ].filter(publicAdvancedPricingRowVisible);

  return [...rows, ...imageRows];
}

function pricingPayloadError(message, code = "INVALID_PRICING_ROWS") {
  const error = new Error(message);
  error.statusCode = 400;
  error.code = code;
  return error;
}

function advancedPricingRowKey(row = {}) {
  const explicit = String(row.key || "").trim();
  if (explicit) return explicit;
  const providerRaw = String(row.provider || "").toLowerCase();
  const unitRaw = String(row.unit || "").toLowerCase();
  const resolutionRaw = String(row.resolution || "").toLowerCase();
  if (isQwenImage3Provider(providerRaw)) {
    const tier = String(row.qwenTier || row.tier || row.model || "").toLowerCase().includes("standard") || String(row.model || "").trim() === QWEN_IMAGE3_MODELS.standard ? "standard" : "pro";
    if (unitRaw === "reference_image" || resolutionRaw === "reference") return `qwen-image3-${tier}-reference`;
    return `qwen-image3-${tier}-${normalizeQwenImage3Resolution(row.resolution).toLowerCase()}`;
  }
  if (isSeedream5ImageProvider(providerRaw)) {
    if (unitRaw === "reference_image" || resolutionRaw === "reference" || resolutionRaw === "reference_image") return "seedream5-pro-reference";
    return `seedream5-pro-${normalizeSeedream5Resolution(row.resolution).toLowerCase()}`;
  }
  if (providerRaw === "wan27-image" || unitRaw === "image" || resolutionRaw === "image") return "wan27-image";
  const provider = normalizeAdvancedProvider(row.provider);
  const resolution = normalizeAdvancedResolution(row.resolution);
  const rateKindRaw = String(row.rateKind || row.unit || "").toLowerCase();
  const isVideoInput = rateKindRaw === "video_input" || rateKindRaw === "input_second" || String(row.key || "").includes("video-input");
  const isFast = String(row.seedanceTier || "").toLowerCase() === "fast";
  if (provider === "seedance" && isFast && isVideoInput) return `seedance-fast-video-input-${resolution}`;
  if (provider === "seedance" && isFast) return `seedance-fast-${resolution}`;
  if (provider === "seedance" && isVideoInput) return `seedance-video-input-${resolution}`;
  if (provider === SEEDANCE25_DIRECT_PROVIDER && isVideoInput) return `seedance-nsfw-video-input-${resolution}`;
  if (provider === "h3-vega" && isVideoInput) return `h3-vega-video-input-${resolution}`;
  if (provider === "vega10-lite" && isVideoInput) return `vega10-lite-video-input-${resolution}`;
  if (provider === "seedance20-vega" && isVideoInput) return `vega10-pro-video-${resolution}`;
  if (provider === "vega10-lite" && (rateKindRaw === "reference_image" || resolutionRaw === "reference")) return "vega10-lite-reference-image";
  return `${provider}-${resolution}`;
}

function advancedPricingRowSaleCredits(row = {}, creditsPerCny = ADVANCED_CREDITS_PER_CNY) {
  if (row.saleCreditsPerSecond !== undefined) return Number(row.saleCreditsPerSecond);
  if (row.saleUsdPerSecond !== undefined) return Number(row.saleUsdPerSecond) * DEFAULT_CREDITS_PER_USD;
  return Number(row.saleYuanPerSecond) * Number(creditsPerCny || ADVANCED_CREDITS_PER_CNY);
}

function advancedPricingRowSaleYuan(row = {}, creditsPerCny = ADVANCED_CREDITS_PER_CNY) {
  if (row.saleUsdPerSecond !== undefined) return Number(row.saleUsdPerSecond) * INTERNAL_CNY_PER_USD;
  if (row.saleYuanPerSecond !== undefined) return Number(row.saleYuanPerSecond);
  if (row.saleCnyPerImage !== undefined) return Number(row.saleCnyPerImage);
  if (row.saleCreditsPerSecond !== undefined) return Number(row.saleCreditsPerSecond) / Number(creditsPerCny || ADVANCED_CREDITS_PER_CNY);
  return NaN;
}

function usdFromCny(value) {
  if (value === null || value === undefined) return null;
  return pricingNumber(Number(value || 0) / INTERNAL_CNY_PER_USD, 0, 0, 6);
}

function usdRangeFromCny(values) {
  if (!Array.isArray(values) || values.length < 2) return null;
  return values.slice(0, 2).map((value) => usdFromCny(value));
}

function yuanPerSecondFromCredits(creditsPerSecond, creditsPerCny) {
  if (creditsPerSecond === null || creditsPerSecond === undefined) return null;
  return pricingNumber(Number(creditsPerSecond || 0) / Number(creditsPerCny || ADVANCED_CREDITS_PER_CNY), 0);
}

function yuanPerSecondRangeFromCredits(creditsPerSecondRange, creditsPerCny) {
  if (!Array.isArray(creditsPerSecondRange) || creditsPerSecondRange.length < 2) return null;
  return creditsPerSecondRange.slice(0, 2).map((value) => yuanPerSecondFromCredits(value, creditsPerCny));
}

function advancedSaleCreditsPerSecond(pricing = DEFAULT_ADVANCED_PRICING, provider = "seedance", resolution = "720p", rateKind = "output", seedanceTier = "standard", capability = "", mode = "", model = "", variant = "", options = {}) {
  const normalized = normalizeAdvancedPricing(pricing);
  const normalizedProvider = normalizeAdvancedProvider(provider);
  const normalizedModel = String(model || "").trim().toLowerCase();
  let saleCredits = 0;
  if (capability === "wan-legacy" && normalizedModel && normalized.aliyunVideoCreditsPerSecondByModel?.[normalizedModel]) {
    const rateKey = variant
      ? `${normalizeAdvancedResolution(resolution)}-${String(variant).toLowerCase()}`
      : normalizeAdvancedResolution(resolution);
    saleCredits = pricingNumber(normalized.aliyunVideoCreditsPerSecondByModel[normalizedModel][rateKey], 0);
  } else if (capability && normalized.aliyunVideoCreditsPerSecondByCapability?.[capability]) {
    const rateKey = mode || String(resolution || "").toLowerCase();
    saleCredits = pricingNumber(normalized.aliyunVideoCreditsPerSecondByCapability[capability][rateKey], 0);
  } else {
    const isFast = normalizedProvider === "seedance" && normalizeSeedanceTier(seedanceTier) === "fast";
    const table = normalizedProvider === "seedance25"
    ? normalized.seedance25CreditsPerSecondByResolution
    : normalizedProvider === "h3-vega" && rateKind === "video_input"
    ? normalized.h3VegaInputVideoCreditsPerSecondByResolution
    : normalizedProvider === "h3-vega"
    ? normalized.h3VegaCreditsPerSecondByResolution
    : normalizedProvider === "vega10-lite" && rateKind === "video_input"
    ? normalized.vega10LiteInputVideoCreditsPerSecondByResolution
    : normalizedProvider === "seedance20-vega" && rateKind === "video_input"
    ? normalized.vega10ProInputVideoCreditsPerSecondByResolution
    : normalizedProvider === "seedance20-vega"
    ? normalized.vega10ProCreditsPerSecondByResolution
    : normalizedProvider === "seedance25-vega" && rateKind === "video_input"
    ? normalized.vega15ProInputVideoCreditsPerSecondByResolution
    : normalizedProvider === "seedance25-vega"
    ? normalized.vega15ProCreditsPerSecondByResolution
    : normalizedProvider === "vega10-lite" && rateKind === "reference_image"
    ? { reference: normalized.vega10LiteReferenceImageCreditsEach }
    : normalizedProvider === "vega10-lite"
    ? normalized.vega10LiteCreditsPerSecondByResolution
    : normalizedProvider === SEEDANCE25_DIRECT_PROVIDER && rateKind === "video_input"
    ? normalized.seedanceNsfwVideoCreditsPerSecondByResolution
    : normalizedProvider === SEEDANCE25_DIRECT_PROVIDER
    ? normalized.seedanceNsfwCreditsPerSecondByResolution
    : normalizedProvider === "wan30" && capability === "wan30-video-prime-pro"
    ? normalized.wan30PrimeProCreditsPerSecondByResolution
    : normalizedProvider === "wan30" && capability === "wan30-video-pro"
    ? normalized.wan30ProCreditsPerSecondByResolution
    : normalizedProvider === "wan30" && (capability === "wan30-video-prime" || normalizedModel === ALIYUN_WAN30_PRIME_MODEL.toLowerCase())
    ? normalized.wan30PrimeCreditsPerSecondByResolution
    : normalizedProvider === "wan30"
    ? normalized.wan30CreditsPerSecondByResolution
    : normalizedProvider === "seedance" && isFast && rateKind === "video_input"
    ? normalized.seedanceFastVideoInputCreditsPerSecondByResolution
    : normalizedProvider === "seedance" && isFast
    ? normalized.seedanceFastCreditsPerSecondByResolution
    : normalizedProvider === "seedance" && rateKind === "video_input"
    ? normalized.seedanceVideoInputCreditsPerSecondByResolution
    : normalizedProvider === "wan27"
    ? normalized.wan27CreditsPerSecondByResolution
    : normalizedProvider === "happyhorse"
    ? normalized.happyhorseCreditsPerSecondByResolution
      : normalized.seedanceCreditsPerSecondByResolution;
    const rateKey = ["vega10-lite", "seedance20-vega"].includes(normalizedProvider)
      ? String(resolution || "").trim().toLowerCase().replace(/^2160p$/, "4k")
      : normalizeAdvancedResolution(resolution);
    saleCredits = pricingNumber(table[rateKey], 0, 0, isFast ? 6 : 4);
  }
  if (options.applyDiscount === false) return saleCredits;
  return applyAdvancedModelDiscount(saleCredits, normalized, advancedPricingModelKey(provider, {
    capability,
    mode,
    model,
    seedanceTier,
    tier: normalizedProvider === "qwen-image3" ? mode : "",
  }));
}

function advancedSaleImageCredits(pricing = DEFAULT_ADVANCED_PRICING) {
  const normalized = normalizeAdvancedPricing(pricing);
  const saleCredits = pricingNumber(Number(normalized.wan27ImagePro.saleCnyPerImage || 0) * Number(normalized.creditsPerCny || ADVANCED_CREDITS_PER_CNY), 0, 0, 6);
  return applyAdvancedModelDiscount(saleCredits, normalized, "wan27");
}

function seedream5ProOfficialUsdPerImage(resolution = "2K") {
  return normalizeSeedream5Resolution(resolution) === "1K"
    ? SEEDREAM5_PRO_1K_USD_PER_IMAGE
    : SEEDREAM5_PRO_2K_USD_PER_IMAGE;
}

function advancedSaleSeedream5Credits(pricing = DEFAULT_ADVANCED_PRICING, resolution = "2K") {
  const normalized = normalizeAdvancedPricing(pricing);
  const publicResolution = normalizeSeedream5Resolution(resolution);
  const saleUsd = pricingNumber(
    normalized.seedream5Image?.pro?.saleUsdPerImageByResolution?.[publicResolution],
    DEFAULT_ADVANCED_PRICING.seedream5Image.pro.saleUsdPerImageByResolution[publicResolution] || seedream5ProOfficialUsdPerImage(publicResolution),
    0,
    6,
  );
  return applyAdvancedModelDiscount(pricingNumber(saleUsd * DEFAULT_CREDITS_PER_USD, 0, 0, 6), normalized, "seedream5-image");
}

function advancedSaleSeedream5ReferenceCredits(pricing = DEFAULT_ADVANCED_PRICING) {
  const normalized = normalizeAdvancedPricing(pricing);
  const saleUsd = pricingNumber(
    normalized.seedream5Image?.pro?.referenceUsdPerImageAfterFirst,
    SEEDREAM5_PRO_REFERENCE_USD_PER_IMAGE_AFTER_FIRST,
    0,
    6,
  );
  return applyAdvancedModelDiscount(pricingNumber(saleUsd * DEFAULT_CREDITS_PER_USD, 0, 0, 6), normalized, "seedream5-image");
}

function purchaseUsdFromCredits(credits) {
  const value = Number(credits);
  return Number.isFinite(value) ? pricingNumber(value / DEFAULT_CREDITS_PER_USD, 0, 0, 6) : null;
}

async function gatewayPurchaseSeedream5ImageCredits(resolution = "2K") {
  if (!USE_GATEWAY_UPSTREAM) return null;
  const publicResolution = normalizeSeedream5Resolution(resolution);
  try {
    const estimate = await gatewayAdvancedEstimate("seedream5-image", {
      seedreamTier: "pro",
      resolution: publicResolution,
      size: publicResolution,
      referenceImageCount: 0,
      outputImageCount: 1,
    });
    const credits = Number(estimate?.credits ?? estimate?.cost);
    if (!Number.isFinite(credits)) {
      throw new Error("Gateway estimate did not include a usable Seedream image credit amount.");
    }
    const multiplier = gatewayEstimateMultiplier(estimate);
    return {
      credits: creditsAmount(credits),
      source: "gateway_upstream",
      message: `Old-site sale price through the configured upstream token${multiplier !== 1 ? `, API multiplier ${multiplier} applied` : ""}.`,
    };
  } catch (error) {
    return {
      credits: null,
      source: "gateway_unavailable",
      message: error.message || String(error),
    };
  }
}

async function gatewayPurchaseSeedream5ReferenceCredits() {
  if (!USE_GATEWAY_UPSTREAM) return null;
  try {
    const baseEstimate = await gatewayAdvancedEstimate("seedream5-image", {
      seedreamTier: "pro",
      resolution: "2K",
      size: "2K",
      referenceImageCount: 1,
      outputImageCount: 1,
    });
    const withReferenceEstimate = await gatewayAdvancedEstimate("seedream5-image", {
      seedreamTier: "pro",
      resolution: "2K",
      size: "2K",
      referenceImageCount: 2,
      outputImageCount: 1,
    });
    const baseCredits = Number(baseEstimate?.credits ?? baseEstimate?.cost);
    const withReferenceCredits = Number(withReferenceEstimate?.credits ?? withReferenceEstimate?.cost);
    if (!Number.isFinite(baseCredits) || !Number.isFinite(withReferenceCredits)) {
      throw new Error("Gateway estimate did not include a usable Seedream reference credit amount.");
    }
    const multiplier = gatewayEstimateMultiplier(withReferenceEstimate);
    return {
      credits: creditsAmount(Math.max(0, withReferenceCredits - baseCredits)),
      source: "gateway_upstream",
      message: `Old-site sale add-on per reference image after the first${multiplier !== 1 ? `, API multiplier ${multiplier} applied` : ""}.`,
    };
  } catch (error) {
    return {
      credits: null,
      source: "gateway_unavailable",
      message: error.message || String(error),
    };
  }
}

async function gatewayPurchaseImageCredits() {
  if (!USE_GATEWAY_UPSTREAM) return null;
  try {
    const estimate = await gatewayAdvancedEstimate("wan27-image", {});
    const credits = estimate?.credits ?? estimate?.cost;
    if (!Number.isFinite(Number(credits))) {
      throw new Error("Gateway estimate did not include a usable image credit amount.");
    }
    const multiplier = gatewayEstimateMultiplier(estimate);
    return {
      credits: creditsAmount(credits),
      source: "gateway_upstream",
      message: `Old-site sale price through the configured upstream token${multiplier !== 1 ? `, API multiplier ${multiplier} applied` : ""}.`,
    };
  } catch (error) {
    return {
      credits: null,
      source: "gateway_unavailable",
      message: error.message || String(error),
    };
  }
}

function gatewayEstimateMultiplier(estimate = {}) {
  const multiplier = Number(estimate.userPricingMultiplier ?? estimate.pricingMultiplier ?? estimate.multiplier ?? 1);
  return Number.isFinite(multiplier) && multiplier > 0 ? multiplier : 1;
}

async function gatewayPurchaseCreditsPerSecond(provider = "seedance", resolution = "720p", rateKind = "output", seedanceTier = "standard") {
  if (!USE_GATEWAY_UPSTREAM) return null;
  const normalizedProvider = normalizeAdvancedProvider(provider);
  const publicResolution = normalizeAdvancedResolution(resolution);
  const duration = 5;
  try {
    const estimate = await gatewayAdvancedEstimate(normalizedProvider, {
      duration,
      resolution: publicResolution,
      ratio: "16:9",
      ...(normalizedProvider === "seedance" ? { seedanceTier: normalizeSeedanceTier(seedanceTier) } : {}),
      ...(normalizedProvider === "seedance" && rateKind === "video_input" ? { inputVideoSeconds: duration } : {}),
    });
    const multiplier = gatewayEstimateMultiplier(estimate);
    const estimateDuration = Number(estimate.duration || duration);
    const inputSeconds = Number(estimate.videoInputSeconds || duration);
    const outputCredits = Number(estimate.outputCredits);
    const videoInputCredits = Number(estimate.videoInputCredits);
    const originalCredits = Number(estimate.originalCredits);
    const rawCredits = normalizedProvider === "seedance" && rateKind === "video_input"
      ? Number.isFinite(videoInputCredits)
        ? (videoInputCredits * multiplier) / inputSeconds
        : Number.isFinite(originalCredits) && Number.isFinite(outputCredits)
        ? (Math.max(0, originalCredits - outputCredits) * multiplier) / inputSeconds
        : Number(estimate.credits ?? 0) / inputSeconds
      : Number.isFinite(outputCredits)
      ? (outputCredits * multiplier) / estimateDuration
      : Number(estimate.credits ?? 0) / estimateDuration;
    if (!Number.isFinite(rawCredits) || rawCredits < 0) {
      throw new Error("Gateway estimate did not include a usable credit amount.");
    }
    return {
      creditsPerSecond: pricingNumber(rawCredits, 0),
      source: "gateway_upstream",
      message: `Old-site sale price through the configured upstream token${multiplier !== 1 ? `, API multiplier ${multiplier} applied` : ""}.`,
    };
  } catch (error) {
    return {
      creditsPerSecond: null,
      source: "gateway_unavailable",
      message: error.message || String(error),
    };
  }
}

function seedanceOfficialExampleUsdPerSecond(resolution = "720p", seedanceTier = "standard") {
  const publicResolution = normalizeAdvancedResolution(resolution);
  const exampleUsd = ADVANCED_SEEDANCE_EXAMPLE_USD_BY_RESOLUTION[publicResolution] || ADVANCED_SEEDANCE_EXAMPLE_USD_BY_RESOLUTION["720p"];
  const standardRate = seedanceUsdPerMillionTokens(publicResolution, { seedanceTier: "standard" });
  const targetRate = seedanceUsdPerMillionTokens(publicResolution, { seedanceTier });
  const ratio = Number(standardRate || 0) > 0 ? Number(targetRate || 0) / Number(standardRate) : 1;
  return pricingNumber((exampleUsd / 5) * ratio, exampleUsd / 5, 0, 6);
}

function seedanceOfficialInputUsdPerSecond(resolution = "720p", seedanceTier = "standard") {
  const publicResolution = normalizeAdvancedResolution(resolution);
  const baseUsdPerSecond = seedanceOfficialExampleUsdPerSecond(publicResolution, seedanceTier);
  const noVideoRate = seedanceUsdPerMillionTokens(publicResolution, { seedanceTier, rateKind: "output" });
  const withVideoRate = seedanceUsdPerMillionTokens(publicResolution, { seedanceTier, rateKind: "video_input" });
  const ratio = Number(noVideoRate || 0) > 0 ? Number(withVideoRate || 0) / Number(noVideoRate) : 1;
  return pricingNumber(baseUsdPerSecond * ratio, baseUsdPerSecond, 0, 6);
}

function seedanceFastOfficialUsdPerSecond(resolution = "720p", rateKind = "output") {
  const publicResolution = normalizeAdvancedResolution(resolution);
  const { width, height } = seedanceOfficialPixelDimensions(publicResolution, "16:9");
  const tokensPerSecond = Math.ceil((ADVANCED_SEEDANCE_FPS * width * height) / 1024);
  const usdPerMillionTokens = seedanceUsdPerMillionTokens(publicResolution, {
    seedanceTier: "fast",
    rateKind,
  });
  return pricingNumber((tokensPerSecond * usdPerMillionTokens) / 1000000, 0, 0, 8);
}

function advancedVegaPurchaseForRow(pricing = DEFAULT_ADVANCED_PRICING, row = {}) {
  const normalized = normalizeAdvancedPricing(pricing);
  const provider = normalizeAdvancedProvider(row.provider);
  const rateKind = String(row.rateKind || row.unit || "output").trim().toLowerCase();
  const resolution = ["vega10-lite", "seedance20-vega"].includes(provider)
    ? String(row.resolution || "").trim().toLowerCase().replace(/^2160p$/, "4k")
    : normalizeAdvancedResolution(row.resolution);
  let table = null;
  let usdPerSecond = null;
  let rateKey = resolution;
  if (provider === "h3-vega") {
    table = rateKind === "video_input"
      ? normalized.h3VegaInputVideoPurchaseUsdPerSecondByResolution
      : normalized.h3VegaPurchaseUsdPerSecondByResolution;
  } else if (provider === "vega10-lite" && rateKind === "reference_image") {
    rateKey = "reference";
    usdPerSecond = normalized.vega10LiteReferenceImagePurchaseUsdEach;
  } else if (provider === "vega10-lite") {
    table = rateKind === "video_input"
      ? normalized.vega10LiteInputVideoPurchaseUsdPerSecondByResolution
      : normalized.vega10LitePurchaseUsdPerSecondByResolution;
  } else if (provider === "seedance20-vega") {
    table = rateKind === "video_input"
      ? normalized.vega10ProInputVideoPurchaseUsdPerSecondByResolution
      : normalized.vega10ProPurchaseUsdPerSecondByResolution;
  } else if (provider === "seedance25-vega") {
    table = rateKind === "video_input"
      ? normalized.vega15ProInputVideoPurchaseUsdPerSecondByResolution
      : normalized.vega15ProPurchaseUsdPerSecondByResolution;
  } else {
    return null;
  }
  if (table) usdPerSecond = table[rateKey];
  const normalizedUsd = pricingNumber(usdPerSecond, 0, 0, 8);
  return {
    provider,
    table,
    rateKey,
    usdPerSecond: normalizedUsd > 0 ? normalizedUsd : null,
    creditsPerSecond: normalizedUsd > 0 ? pricingNumber(normalizedUsd * DEFAULT_CREDITS_PER_USD, 0, 0, 6) : null,
    source: "admin_configured",
    message: "后台配置的 Vega 采购价；对外计费仍使用右侧对外价。",
  };
}

async function advancedPurchaseCreditsPerSecond(provider = "seedance", resolution = "720p", rateKind = "output", seedanceTier = "standard", capability = "", mode = "", model = "", variant = "", pricing = DEFAULT_ADVANCED_PRICING) {
  const normalizedProvider = normalizeAdvancedProvider(provider);
  const publicResolution = normalizeAdvancedResolution(resolution);
  const duration = normalizedProvider === "wan27" ? 5 : 5;
  const vegaPurchase = advancedVegaPurchaseForRow(pricing, {
    provider: normalizedProvider,
    resolution,
    rateKind,
    unit: rateKind,
  });
  if (vegaPurchase) {
    return {
      creditsPerSecond: vegaPurchase.creditsPerSecond,
      usdPerSecond: vegaPurchase.usdPerSecond,
      source: vegaPurchase.source,
      message: vegaPurchase.message,
    };
  }
  if (normalizedProvider === "wan30") {
    const normalizedModel = String(model || "").trim().toLowerCase();
    const pro = capability === "wan30-video-pro" || normalizedModel === ALIYUN_WAN30_MODEL.replace(/-video$/, "-video-pro").toLowerCase();
    const prime = capability === "wan30-video-prime" || capability === "wan30-video-prime-pro" || normalizedModel === ALIYUN_WAN30_PRIME_MODEL.toLowerCase() || normalizedModel === ALIYUN_WAN30_PRIME_MODEL.replace(/-prime$/, "-prime-pro").toLowerCase();
    const baseCnyPerSecond = ALIYUN_WAN30_OFFICIAL_CNY_PER_SECOND[publicResolution] ?? null;
    const multiplier = (prime ? ALIYUN_WAN30_PRIME_PRICE_FACTOR : 1) * (pro ? 1 : 1);
    const cnyPerSecond = baseCnyPerSecond === null ? null : pricingNumber(baseCnyPerSecond * multiplier, 0, 0, 6);
    const usdPerSecond = cnyPerSecond === null ? null : pricingNumber(cnyPerSecond / ALIYUN_WAN30_CNY_PER_USD, 0, 0, 8);
    return {
      creditsPerSecond: usdPerSecond === null ? null : pricingNumber(usdPerSecond * DEFAULT_CREDITS_PER_USD, 0, 0, 6),
      usdPerSecond,
      source: "mulerouter_model_pricing",
      message: cnyPerSecond === null
        ? "Mulerouter purchase price is unavailable for this resolution."
        : `Mulerouter Wan 3.0${pro ? " Pro" : prime ? " Prime" : ""} purchase price is not configured for off-peak purchase estimation. The sale price is editable in Advanced Pricing.`,
    };
  }
  if (normalizedProvider === SEEDANCE25_DIRECT_PROVIDER) {
    const hasVideoInput = rateKind === "video_input";
    const usdPerSecond = directPurchaseUsdPerSecond(publicResolution, { hasVideoInput });
    const usdPerMillionTokens = hasVideoInput
      ? SEEDANCE25_DIRECT_USD_PER_MILLION_TOKENS.withVideo
      : SEEDANCE25_DIRECT_USD_PER_MILLION_TOKENS.withoutVideo;
    return {
      creditsPerSecond: pricingNumber(usdPerSecond * DEFAULT_CREDITS_PER_USD, 0, 0, 6),
      usdPerSecond,
      source: "seedance25_direct_endpoint_token_pricing",
      message: `Seedance 2.5 direct-endpoint contract price: $${usdPerMillionTokens}/million tokens (${hasVideoInput ? "with input video" : "without input video"}); the displayed per-second purchase price uses ${publicResolution} 16:9 at 24fps. Actual upstream billing uses completion_tokens.`,
    };
  }
  if (normalizedProvider === "seedance25") {
    const pointsPerSecond = SEEDANCE25_POINTS_PER_SECOND[publicResolution];
    const usdPerSecond = Number.isFinite(Number(pointsPerSecond))
      ? pricingNumber((Number(pointsPerSecond) * SEEDANCE25_CNY_PER_POINT) / SEEDANCE25_CNY_PER_USD, 0, 0, 6)
      : null;
    return {
      creditsPerSecond: usdPerSecond === null ? null : pricingNumber(usdPerSecond * DEFAULT_CREDITS_PER_USD, 0, 0, 6),
      usdPerSecond,
      source: "apiz_seedance25_points_pricing",
      message: `APIZ Seedance 2.5 ${publicResolution} purchase price: ${pointsPerSecond} APIZ points/second at 0.01 CNY/point, converted at 6.67 CNY/USD and 100 site credits/USD.`,
    };
  }
  if (capability && (ALIYUN_VIDEO_OFFICIAL_PRICING[capability] || capability === "wan-legacy")) {
    const purchase = officialSingaporePurchaseDetails(capability, {
      resolution: publicResolution,
      mode: mode || resolution,
      model,
      audio: String(variant || "audio").toLowerCase() !== "silent",
    });
    const promotionMessage = purchase?.limitedTimeDiscount
      ? ` Limited-time ${purchase.discountPercent}% discount applied; list price $${purchase.listUsdPerSecond}/second.`
      : "";
    return {
      creditsPerSecond: purchase ? pricingNumber(purchase.usdPerSecond * DEFAULT_CREDITS_PER_USD, 0) : null,
      usdPerSecond: purchase?.usdPerSecond ?? null,
      source: "aliyun_singapore_official_model_pricing",
      message: purchase ? `Alibaba Cloud Model Studio Singapore official per-second price.${promotionMessage}` : "Official Singapore price is unavailable for this rate.",
    };
  }
  if (normalizedProvider === "seedance" && normalizeSeedanceTier(seedanceTier) === "fast") {
    const usdPerSecond = seedanceFastOfficialUsdPerSecond(publicResolution, rateKind);
    return {
      creditsPerSecond: pricingNumber(usdPerSecond * DEFAULT_CREDITS_PER_USD, 0, 0, 6),
      usdPerSecond,
      source: "byteplus_official_token_pricing",
      message: `BytePlus Seedance 2.0 Fast token pricing at ${publicResolution} 16:9 and ${ADVANCED_SEEDANCE_FPS}fps${rateKind === "video_input" ? " for input video" : ""}; actual billing follows completion_tokens.`,
    };
  }
  if (USE_GATEWAY_UPSTREAM) {
    return await gatewayPurchaseCreditsPerSecond(normalizedProvider, publicResolution, rateKind, seedanceTier);
  }
  if (normalizedProvider === "seedance" && rateKind === "video_input") {
    const usdPerSecond = seedanceOfficialInputUsdPerSecond(publicResolution, seedanceTier);
    return {
      creditsPerSecond: pricingNumber(usdPerSecond * UPSTREAM_USD_CNY_RATE * ADVANCED_CREDITS_PER_CNY, 0),
      source: "byteplus_official_token_pricing",
      message: `BytePlus official token pricing. This row is the video-input add-on only: output price/s x video-input token-rate ratio. Internal upstream rate: ${UPSTREAM_USD_CNY_RATE}.`,
    };
  }
  if (normalizedProvider === "seedance") {
    const exampleUsdPerSecond = seedanceOfficialExampleUsdPerSecond(publicResolution, seedanceTier);
    const exampleUsd = pricingNumber(exampleUsdPerSecond * duration, 0, 0, 6);
    return {
      creditsPerSecond: pricingNumber(exampleUsdPerSecond * UPSTREAM_USD_CNY_RATE * ADVANCED_CREDITS_PER_CNY, 0),
      source: "byteplus_official_video_example_pricing",
      message: `BytePlus official 5s 16:9 example${normalizeSeedanceTier(seedanceTier) === "fast" ? " scaled by fast endpoint token rate" : ""}: ${exampleUsd} USD/video. Internal upstream rate: ${UPSTREAM_USD_CNY_RATE}. Actual billing follows completion_tokens returned by the API.`,
    };
  }
  if (normalizedProvider === "happyhorse") {
    const purchaseRates = ["happyhorse-t2v", "happyhorse-i2v", "happyhorse-r2v", "happyhorse-video-edit"]
      .map((item) => officialSingaporePurchaseDetails(item, { resolution: publicResolution })?.usdPerSecond)
      .filter((value) => Number.isFinite(Number(value)))
      .map(Number);
    const usdPerSecondRange = purchaseRates.length
      ? [Math.min(...purchaseRates), Math.max(...purchaseRates)]
      : null;
    return {
      creditsPerSecond: null,
      creditsPerSecondRange: usdPerSecondRange?.map((value) => pricingNumber(value * DEFAULT_CREDITS_PER_USD, 0)),
      usdPerSecondRange,
      source: "aliyun_singapore_official_model_pricing",
      message: "Alibaba Cloud Model Studio Singapore official price range for HappyHorse generation modes.",
    };
  }
  const wan27Purchase = officialSingaporePurchaseDetails("wan27-i2v", { resolution: publicResolution });
  return {
    creditsPerSecond: wan27Purchase ? pricingNumber(wan27Purchase.usdPerSecond * DEFAULT_CREDITS_PER_USD, 0) : null,
    usdPerSecond: wan27Purchase?.usdPerSecond ?? null,
    source: "aliyun_singapore_official_model_pricing",
    message: "Alibaba Cloud Model Studio Singapore official price for wan2.7-i2v-2026-04-25.",
  };
}

async function gatewayPurchaseQwenImage3Credits(tier = "pro", resolution = "2K") {
  if (!USE_GATEWAY_UPSTREAM) return null;
  const normalizedTier = normalizeQwenImage3Tier(tier);
  const normalizedResolution = normalizeQwenImage3Resolution(resolution);
  try {
    const estimate = await gatewayAdvancedEstimate("qwen-image3", {
      qwenTier: normalizedTier,
      model: QWEN_IMAGE3_MODELS[normalizedTier],
      resolution: normalizedResolution,
      referenceImageCount: 0,
      outputImageCount: 1,
      n: 1,
    });
    const credits = Number(estimate?.credits ?? estimate?.cost);
    if (!Number.isFinite(credits)) throw new Error("Gateway estimate did not include a usable Qwen Image 3.0 credit amount.");
    return { credits: creditsAmount(credits), source: "gateway_upstream", message: "Old-site Qwen Image 3.0 sale price through the configured upstream token." };
  } catch (error) {
    return { credits: null, source: "gateway_unavailable", message: error.message || String(error) };
  }
}

async function gatewayPurchaseQwenImage3ReferenceCredits(tier = "pro") {
  if (!USE_GATEWAY_UPSTREAM) return null;
  const normalizedTier = normalizeQwenImage3Tier(tier);
  try {
    const [baseEstimate, referenceEstimate] = await Promise.all([
      gatewayAdvancedEstimate("qwen-image3", { qwenTier: normalizedTier, resolution: "1K", referenceImageCount: 0, outputImageCount: 1 }),
      gatewayAdvancedEstimate("qwen-image3", { qwenTier: normalizedTier, resolution: "1K", referenceImageCount: 1, outputImageCount: 1 }),
    ]);
    const baseCredits = Number(baseEstimate?.credits ?? baseEstimate?.cost);
    const referenceCredits = Number(referenceEstimate?.credits ?? referenceEstimate?.cost);
    if (!Number.isFinite(baseCredits) || !Number.isFinite(referenceCredits)) throw new Error("Gateway estimate did not include a usable Qwen Image 3.0 reference credit amount.");
    return { credits: creditsAmount(Math.max(0, referenceCredits - baseCredits)), source: "gateway_upstream", message: "Old-site Qwen Image 3.0 sale add-on per reference image." };
  } catch (error) {
    return { credits: null, source: "gateway_unavailable", message: error.message || String(error) };
  }
}

function wan30PurchaseTableForRow(pricing = DEFAULT_ADVANCED_PRICING, row = {}) {
  const normalized = normalizeAdvancedPricing(pricing);
  const capability = String(row.capability || "").trim();
  if (row.provider !== "wan30") return null;
  if (capability === "wan30-video-pro") return normalized.wan30ProPurchaseUsdPerSecondByResolution;
  if (capability === "wan30-video-prime-pro") return normalized.wan30PrimeProPurchaseUsdPerSecondByResolution;
  if (capability === "wan30-video-prime") return normalized.wan30PrimePurchaseUsdPerSecondByResolution;
  return normalized.wan30PurchaseUsdPerSecondByResolution;
}

async function adminAdvancedPricingView(config = {}) {
  const pricing = normalizeAdvancedPricing(config.platform?.advancedPricing);
  const rows = await Promise.all(ADVANCED_PRICING_ROWS.filter(adminAdvancedPricingRowVisible).map(async (row) => {
    const modelKey = advancedPricingModelKey(row.provider, row);
    const modelSetting = advancedModelSetting(pricing, modelKey);
    const configuredSaleCreditsPerSecond = advancedSaleCreditsPerSecond(pricing, row.provider, row.resolution, row.rateKind, row.seedanceTier, row.capability, row.mode, row.model, row.variant, { applyDiscount: false });
    const saleCreditsPerSecond = applyAdvancedModelDiscount(configuredSaleCreditsPerSecond, pricing, modelKey);
    const wan30PurchaseTable = wan30PurchaseTableForRow(pricing, row);
    const configuredWan30PurchaseUsd = wan30PurchaseTable?.[row.resolution];
    const vegaPurchase = advancedVegaPurchaseForRow(pricing, row);
    const purchase = vegaPurchase || await advancedPurchaseCreditsPerSecond(row.provider, row.resolution, row.rateKind, row.seedanceTier, row.capability, row.mode, row.model, row.variant, pricing);
    const adminConfiguredPurchase = Boolean(wan30PurchaseTable || vegaPurchase);
    return {
      ...row,
      purchaseCreditsPerSecond: adminConfiguredPurchase
        ? vegaPurchase
          ? vegaPurchase.creditsPerSecond
          : pricingNumber(configuredWan30PurchaseUsd * DEFAULT_CREDITS_PER_USD, 0, 0, 6)
        : purchase.creditsPerSecond,
      purchaseCreditsPerSecondRange: Array.isArray(purchase.creditsPerSecondRange) ? purchase.creditsPerSecondRange.slice(0, 2) : null,
      purchaseUsdPerSecond: adminConfiguredPurchase
        ? vegaPurchase
          ? vegaPurchase.usdPerSecond
          : configuredWan30PurchaseUsd
        : purchase.usdPerSecond ?? usdFromCny(yuanPerSecondFromCredits(purchase.creditsPerSecond, pricing.creditsPerCny)),
      purchaseUsdPerSecondRange: purchase.usdPerSecondRange
        ?? usdRangeFromCny(yuanPerSecondRangeFromCredits(purchase.creditsPerSecondRange, pricing.creditsPerCny)),
      purchaseSource: adminConfiguredPurchase ? "admin_configured" : purchase.source,
      purchaseMessage: adminConfiguredPurchase ? "后台配置的采购价；对外计费仍使用右侧对外价。" : purchase.message || "",
      purchaseEditable: Boolean(wan30PurchaseTable || vegaPurchase),
      modelKey,
      modelDisplayName: modelSetting.displayName,
      modelSubtitle: modelSetting.subtitle,
      modelDiscount: modelSetting.discount,
      configuredSaleCreditsPerSecond,
      saleCreditsPerSecond,
      saleUsdPerSecond: pricingNumber(saleCreditsPerSecond / DEFAULT_CREDITS_PER_USD, 0, 0, 6),
    };
  }));
  const gatewayImagePurchase = await gatewayPurchaseImageCredits();
  const imagePurchaseCredits = gatewayImagePurchase
    ? gatewayImagePurchase.credits
    : pricingNumber(WAN27_IMAGE_PRO_PURCHASE_USD * DEFAULT_CREDITS_PER_USD, 0);
  for (const [rowKey, pricingKey, providerLabel, model] of [
    ["z-image-spicy-pro", "zImageSpicyPro", "Z-Image Spicy Pro", "z-image-spicy-pro"],
    ["qwen-image-edit-spicy", "qwenImageEditSpicy", "Qwen Image Edit Spicy", "qwen-image-edit-spicy"],
  ]) {
    const configured = pricing[pricingKey] || DEFAULT_ADVANCED_PRICING[pricingKey] || {};
    const purchaseCredits = imagePurchaseCredits || pricingNumber((configured.purchaseCnyPerImage || WAN27_IMAGE_PRO_PURCHASE_CNY) * (pricing.creditsPerCny || ADVANCED_CREDITS_PER_CNY), 0, 0, 6);
    const saleCredits = pricingNumber((configured.saleCnyPerImage || WAN27_IMAGE_PRO_SALE_CNY) * (pricing.creditsPerCny || ADVANCED_CREDITS_PER_CNY), 0, 0, 6);
    rows.push({
      key: rowKey,
      provider: rowKey,
      providerLabel,
      resolution: "image",
      unit: "image",
      purchaseCreditsPerSecond: purchaseCredits,
      purchaseUsdPerSecond: purchaseUsdFromCredits(purchaseCredits),
      purchaseSource: gatewayImagePurchase?.source || "mulerouter_official_model_pricing",
      purchaseMessage: gatewayImagePurchase?.message || "Mulerouter per generated image price.",
      saleCreditsPerSecond: saleCredits,
      saleUsdPerSecond: pricingNumber(saleCredits / DEFAULT_CREDITS_PER_USD, 0, 0, 6),
      model,
    });
  }
  for (const resolution of ["1K", "2K"]) {
    const purchaseUsd = seedream5ProOfficialUsdPerImage(resolution);
    const gatewayPurchase = await gatewayPurchaseSeedream5ImageCredits(resolution);
    const hasGatewayPurchase = gatewayPurchase !== null;
    const purchaseCredits = hasGatewayPurchase
      ? gatewayPurchase.credits
      : pricingNumber(purchaseUsd * DEFAULT_CREDITS_PER_USD, 0, 0, 6);
    const saleCredits = advancedSaleSeedream5Credits(pricing, resolution);
    rows.push({
      key: `seedream5-pro-${resolution.toLowerCase()}`,
      provider: "seedream5-image",
      providerLabel: "Seedream 5.0 Pro",
      resolution,
      unit: "image",
      purchaseCreditsPerSecond: purchaseCredits,
      purchaseUsdPerSecond: hasGatewayPurchase ? purchaseUsdFromCredits(purchaseCredits) : purchaseUsd,
      purchaseSource: gatewayPurchase?.source || "byteplus_official_image_pricing",
      purchaseMessage: gatewayPurchase?.message || "Official Seedream 5.0 Pro image price per generated image.",
      saleCreditsPerSecond: saleCredits,
      saleUsdPerSecond: pricingNumber(saleCredits / DEFAULT_CREDITS_PER_USD, 0, 0, 6),
      model: "seedream-5.0-pro",
    });
  }
  {
    const purchaseUsd = SEEDREAM5_PRO_REFERENCE_USD_PER_IMAGE_AFTER_FIRST;
    const gatewayPurchase = await gatewayPurchaseSeedream5ReferenceCredits();
    const hasGatewayPurchase = gatewayPurchase !== null;
    const purchaseCredits = hasGatewayPurchase
      ? gatewayPurchase.credits
      : pricingNumber(purchaseUsd * DEFAULT_CREDITS_PER_USD, 0, 0, 6);
    const saleCredits = advancedSaleSeedream5ReferenceCredits(pricing);
    rows.push({
      key: "seedream5-pro-reference",
      provider: "seedream5-image",
      providerLabel: "Seedream 5.0 Pro Reference",
      resolution: "reference",
      unit: "reference_image",
      purchaseCreditsPerSecond: purchaseCredits,
      purchaseUsdPerSecond: hasGatewayPurchase ? purchaseUsdFromCredits(purchaseCredits) : purchaseUsd,
      purchaseSource: gatewayPurchase?.source || "byteplus_official_image_pricing",
      purchaseMessage: gatewayPurchase?.message || "Official add-on price per reference image after the first reference image.",
      saleCreditsPerSecond: saleCredits,
      saleUsdPerSecond: pricingNumber(saleCredits / DEFAULT_CREDITS_PER_USD, 0, 0, 6),
      model: "seedream-5.0-pro",
    });
  }
  for (const tier of ["pro", "standard"]) {
    const tierConfig = pricing.qwenImage3?.[tier] || DEFAULT_ADVANCED_PRICING.qwenImage3[tier];
    for (const resolution of ["1K", "2K"]) {
      const officialUsd = QWEN_IMAGE3_OFFICIAL_USD[tier].outputPerImage[resolution];
      const gatewayPurchase = await gatewayPurchaseQwenImage3Credits(tier, resolution);
      const hasGatewayPurchase = Number.isFinite(Number(gatewayPurchase?.credits));
      const purchaseCredits = hasGatewayPurchase ? Number(gatewayPurchase.credits) : pricingNumber(officialUsd * DEFAULT_CREDITS_PER_USD, 0, 0, 6);
      const configuredSaleUsd = pricingNumber(tierConfig.saleUsdPerImageByResolution?.[resolution], officialUsd, 0, 6);
      const configuredSaleCredits = pricingNumber(configuredSaleUsd * DEFAULT_CREDITS_PER_USD, 0, 0, 6);
      const modelKey = `qwen-image3-${tier}`;
      const modelSetting = advancedModelSetting(pricing, modelKey);
      const saleCredits = applyAdvancedModelDiscount(configuredSaleCredits, pricing, modelKey);
      rows.push({
        key: `qwen-image3-${tier}-${resolution.toLowerCase()}`,
        provider: "qwen-image3",
        providerLabel: `Qwen Image 3.0 ${tier === "pro" ? "Pro" : "Standard"}`,
        qwenTier: tier,
        resolution,
        unit: "image",
        purchaseCreditsPerSecond: purchaseCredits,
        purchaseUsdPerSecond: hasGatewayPurchase ? purchaseUsdFromCredits(purchaseCredits) : officialUsd,
        purchaseSource: gatewayPurchase?.source || "aliyun_singapore_official_model_pricing",
        purchaseMessage: gatewayPurchase?.message || "Alibaba Cloud Model Studio Singapore official output image price.",
        modelKey,
        modelDisplayName: modelSetting.displayName,
        modelSubtitle: modelSetting.subtitle,
        modelDiscount: modelSetting.discount,
        configuredSaleCreditsPerSecond: configuredSaleCredits,
        saleCreditsPerSecond: saleCredits,
        saleUsdPerSecond: pricingNumber(saleCredits / DEFAULT_CREDITS_PER_USD, 0, 0, 6),
        model: QWEN_IMAGE3_MODELS[tier],
      });
    }
    {
      const officialUsd = QWEN_IMAGE3_OFFICIAL_USD[tier].inputPerReferenceImage;
      const gatewayPurchase = await gatewayPurchaseQwenImage3ReferenceCredits(tier);
      const hasGatewayPurchase = Number.isFinite(Number(gatewayPurchase?.credits));
      const purchaseCredits = hasGatewayPurchase ? Number(gatewayPurchase.credits) : pricingNumber(officialUsd * DEFAULT_CREDITS_PER_USD, 0, 0, 6);
      const configuredSaleUsd = pricingNumber(tierConfig.saleUsdPerReferenceImage, officialUsd, 0, 6);
      const configuredSaleCredits = pricingNumber(configuredSaleUsd * DEFAULT_CREDITS_PER_USD, 0, 0, 6);
      const modelKey = `qwen-image3-${tier}`;
      const modelSetting = advancedModelSetting(pricing, modelKey);
      const saleCredits = applyAdvancedModelDiscount(configuredSaleCredits, pricing, modelKey);
      rows.push({
        key: `qwen-image3-${tier}-reference`,
        provider: "qwen-image3",
        providerLabel: `Qwen Image 3.0 ${tier === "pro" ? "Pro" : "Standard"} Reference`,
        qwenTier: tier,
        resolution: "reference",
        unit: "reference_image",
        purchaseCreditsPerSecond: purchaseCredits,
        purchaseUsdPerSecond: hasGatewayPurchase ? purchaseUsdFromCredits(purchaseCredits) : officialUsd,
        purchaseSource: gatewayPurchase?.source || "aliyun_singapore_official_model_pricing",
        purchaseMessage: gatewayPurchase?.message || "Alibaba Cloud Model Studio Singapore official input price per reference image.",
        modelKey,
        modelDisplayName: modelSetting.displayName,
        modelSubtitle: modelSetting.subtitle,
        modelDiscount: modelSetting.discount,
        configuredSaleCreditsPerSecond: configuredSaleCredits,
        saleCreditsPerSecond: saleCredits,
        saleUsdPerSecond: pricingNumber(saleCredits / DEFAULT_CREDITS_PER_USD, 0, 0, 6),
        model: QWEN_IMAGE3_MODELS[tier],
      });
    }
  }
  return {
    unit: "credits",
    creditsPerUsd: DEFAULT_CREDITS_PER_USD,
    upstreamMode: USE_GATEWAY_UPSTREAM ? "gateway" : "direct",
    modelSettings: { ...pricing.modelSettings },
    rows,
  };
}

function advancedPricingFromBody(body = {}, currentPricing = DEFAULT_ADVANCED_PRICING) {
  if (!Array.isArray(body.rows)) {
    throw pricingPayloadError("Pricing save requires the latest row-based form. Refresh the admin page and try again.", "PRICING_ROWS_REQUIRED");
  }
  const next = normalizeAdvancedPricing(currentPricing);
  if (Object.prototype.hasOwnProperty.call(body, "modelSettings")) {
    const source = body.modelSettings && typeof body.modelSettings === "object" && !Array.isArray(body.modelSettings)
      ? body.modelSettings
      : {};
    next.modelSettings = normalizeAdvancedModelSettings({ ...next.modelSettings, ...source });
  }
  const seen = new Set();
  for (const row of body.rows) {
    const key = advancedPricingRowKey(row);
    if (!ADVANCED_PRICING_ROW_KEYS.has(key)) {
      throw pricingPayloadError(`Unknown pricing row: ${key || "empty"}`);
    }
    seen.add(key);
    const definedRow = ADVANCED_PRICING_ROWS_BY_KEY.get(key) || null;
    if (definedRow) {
      const vegaPurchase = advancedVegaPurchaseForRow(next, definedRow);
      const wan30PurchaseTable = wan30PurchaseTableForRow(next, definedRow);
      const purchaseTable = vegaPurchase?.table || wan30PurchaseTable;
      const rawPurchaseUsd = Number(row.purchaseUsdPerSecond);
      if ((vegaPurchase || wan30PurchaseTable) && (!Number.isFinite(rawPurchaseUsd) || rawPurchaseUsd <= 0)) {
        throw pricingPayloadError(`Invalid purchase price for ${key}`);
      }
      if (vegaPurchase && rawPurchaseUsd > 0) {
        if (purchaseTable) {
          purchaseTable[vegaPurchase.rateKey] = pricingNumber(rawPurchaseUsd, purchaseTable[vegaPurchase.rateKey], 0, 8);
        } else if (vegaPurchase.provider === "vega10-lite" && vegaPurchase.rateKey === "reference") {
          next.vega10LiteReferenceImagePurchaseUsdEach = pricingNumber(rawPurchaseUsd, next.vega10LiteReferenceImagePurchaseUsdEach, 0, 8);
        }
      } else if (wan30PurchaseTable && rawPurchaseUsd > 0) {
        purchaseTable[definedRow.resolution] = pricingNumber(rawPurchaseUsd, purchaseTable[definedRow.resolution], 0, 8);
      }
    }
    if (key === "wan27-image") {
      const rawSale = advancedPricingRowSaleYuan(row, next.creditsPerCny);
      if (!Number.isFinite(rawSale) || rawSale < 0) {
        throw pricingPayloadError(`Invalid sale price for ${key}`);
      }
      next.wan27ImagePro.saleCnyPerImage = pricingNumber(rawSale, next.wan27ImagePro.saleCnyPerImage, 0, 6);
      next.wan27ImagePro.userConfigured = true;
      continue;
    }
    if (key === "z-image-spicy-pro" || key === "qwen-image-edit-spicy") {
      const rawSale = advancedPricingRowSaleYuan(row, next.creditsPerCny);
      if (!Number.isFinite(rawSale) || rawSale < 0) {
        throw pricingPayloadError(`Invalid sale price for ${key}`);
      }
      const targetKey = key === "z-image-spicy-pro" ? "zImageSpicyPro" : "qwenImageEditSpicy";
      const target = next[targetKey] || (next[targetKey] = { ...DEFAULT_ADVANCED_PRICING[targetKey] });
      target.saleCnyPerImage = pricingNumber(rawSale, target.saleCnyPerImage, 0, 6);
      target.userConfigured = true;
      continue;
    }
    if (key === "seedream5-pro-1k" || key === "seedream5-pro-2k" || key === "seedream5-pro-reference") {
      const rawSaleUsd = row.saleUsdPerSecond !== undefined
        ? Number(row.saleUsdPerSecond)
        : row.saleCreditsPerSecond !== undefined
        ? Number(row.saleCreditsPerSecond) / DEFAULT_CREDITS_PER_USD
        : NaN;
      if (!Number.isFinite(rawSaleUsd) || rawSaleUsd < 0) {
        throw pricingPayloadError(`Invalid sale price for ${key}`);
      }
      next.seedream5Image.pro.userConfigured = true;
      if (key === "seedream5-pro-reference") {
        next.seedream5Image.pro.referenceUsdPerImageAfterFirst = pricingNumber(rawSaleUsd, next.seedream5Image.pro.referenceUsdPerImageAfterFirst, 0, 6);
      } else {
        const resolution = key.endsWith("-1k") ? "1K" : "2K";
        next.seedream5Image.pro.saleUsdPerImageByResolution[resolution] = pricingNumber(rawSaleUsd, next.seedream5Image.pro.saleUsdPerImageByResolution[resolution], 0, 6);
      }
      continue;
    }
    if (key.startsWith("qwen-image3-")) {
      const rawSaleUsd = row.saleUsdPerSecond !== undefined
        ? Number(row.saleUsdPerSecond)
        : row.saleCreditsPerSecond !== undefined
        ? Number(row.saleCreditsPerSecond) / DEFAULT_CREDITS_PER_USD
        : NaN;
      if (!Number.isFinite(rawSaleUsd) || rawSaleUsd < 0) throw pricingPayloadError(`Invalid sale price for ${key}`);
      const tier = key.includes("-standard-") ? "standard" : "pro";
      next.qwenImage3[tier].userConfigured = true;
      if (key.endsWith("-reference")) {
        next.qwenImage3[tier].saleUsdPerReferenceImage = pricingNumber(rawSaleUsd, next.qwenImage3[tier].saleUsdPerReferenceImage, 0, 6);
      } else {
        const resolution = key.endsWith("-1k") ? "1K" : "2K";
        next.qwenImage3[tier].saleUsdPerImageByResolution[resolution] = pricingNumber(rawSaleUsd, next.qwenImage3[tier].saleUsdPerImageByResolution[resolution], 0, 6);
      }
      continue;
    }
    if (key.startsWith("aliyun-")) {
      const capability = String(definedRow?.capability || "").trim();
      const model = capability === "wan-legacy"
        ? String(definedRow?.model || "").trim().toLowerCase()
        : "";
      const rateKey = String(definedRow?.rateKey || definedRow?.mode || definedRow?.resolution || "").trim().toLowerCase();
      const targetRates = model
        ? next.aliyunVideoCreditsPerSecondByModel?.[model]
        : next.aliyunVideoCreditsPerSecondByCapability?.[capability];
      if (!targetRates || !(rateKey in targetRates)) {
        throw pricingPayloadError(`Unknown Alibaba video pricing rate: ${model || capability}/${rateKey}`);
      }
      const rawCredits = advancedPricingRowSaleCredits(row, next.creditsPerCny);
      if (!Number.isFinite(rawCredits) || rawCredits < 0) {
        throw pricingPayloadError(`Invalid sale price for ${key}`);
      }
      targetRates[rateKey] = pricingNumber(rawCredits, 0);
      continue;
    }
    const rawCredits = advancedPricingRowSaleCredits(row, next.creditsPerCny);
    if (!Number.isFinite(rawCredits) || rawCredits < 0 || (definedRow?.provider === "wan30" && rawCredits <= 0)) {
      throw pricingPayloadError(`Invalid sale price for ${key}`);
    }
    const credits = pricingNumber(rawCredits, 0, 0, key.startsWith("seedance25-") || key.startsWith("seedance-nsfw-") || key.startsWith("seedance-fast-") || key.startsWith("h3-vega-") || key.startsWith("vega10-lite-") || key.startsWith("vega15-pro-") ? 6 : 4);
    if (key === "wan27-720p") next.wan27CreditsPerSecondByResolution["720p"] = credits;
    else if (key === "wan27-1080p") next.wan27CreditsPerSecondByResolution["1080p"] = credits;
    else if (key === "wan30-480p") next.wan30CreditsPerSecondByResolution["480p"] = credits;
    else if (key === "wan30-720p") next.wan30CreditsPerSecondByResolution["720p"] = credits;
    else if (key === "wan30-1080p") next.wan30CreditsPerSecondByResolution["1080p"] = credits;
    else if (key === "wan30-prime-480p") next.wan30PrimeCreditsPerSecondByResolution["480p"] = credits;
    else if (key === "wan30-prime-720p") next.wan30PrimeCreditsPerSecondByResolution["720p"] = credits;
    else if (key === "wan30-prime-1080p") next.wan30PrimeCreditsPerSecondByResolution["1080p"] = credits;
    else if (key === "wan30-pro-1080p") next.wan30ProCreditsPerSecondByResolution["1080p"] = credits;
    else if (key === "wan30-pro-2k") next.wan30ProCreditsPerSecondByResolution["2k"] = credits;
    else if (key === "wan30-pro-4k") next.wan30ProCreditsPerSecondByResolution["4k"] = credits;
    else if (key === "wan30-prime-pro-1080p") next.wan30PrimeProCreditsPerSecondByResolution["1080p"] = credits;
    else if (key === "wan30-prime-pro-2k") next.wan30PrimeProCreditsPerSecondByResolution["2k"] = credits;
    else if (key === "wan30-prime-pro-4k") next.wan30PrimeProCreditsPerSecondByResolution["4k"] = credits;
    else if (key === "vega10-pro-480p") next.vega10ProCreditsPerSecondByResolution["480p"] = credits;
    else if (key === "vega10-pro-720p") next.vega10ProCreditsPerSecondByResolution["720p"] = credits;
    else if (key === "vega10-pro-1080p") next.vega10ProCreditsPerSecondByResolution["1080p"] = credits;
    else if (key === "vega10-pro-2k") next.vega10ProCreditsPerSecondByResolution["2k"] = credits;
    else if (key === "vega10-pro-4k") next.vega10ProCreditsPerSecondByResolution["4k"] = credits;
    else if (key === "vega10-pro-video-480p") next.vega10ProInputVideoCreditsPerSecondByResolution["480p"] = credits;
    else if (key === "vega10-pro-video-720p") next.vega10ProInputVideoCreditsPerSecondByResolution["720p"] = credits;
    else if (key === "vega10-pro-video-1080p") next.vega10ProInputVideoCreditsPerSecondByResolution["1080p"] = credits;
    else if (key === "vega10-pro-video-2k") next.vega10ProInputVideoCreditsPerSecondByResolution["2k"] = credits;
    else if (key === "vega10-pro-video-4k") next.vega10ProInputVideoCreditsPerSecondByResolution["4k"] = credits;
    else if (key === "vega15-pro-480p") next.vega15ProCreditsPerSecondByResolution["480p"] = credits;
    else if (key === "vega15-pro-720p") next.vega15ProCreditsPerSecondByResolution["720p"] = credits;
    else if (key === "vega15-pro-1080p") next.vega15ProCreditsPerSecondByResolution["1080p"] = credits;
    else if (key === "vega15-pro-2k") next.vega15ProCreditsPerSecondByResolution["2k"] = credits;
    else if (key === "vega15-pro-4k") next.vega15ProCreditsPerSecondByResolution["4k"] = credits;
    else if (key === "vega15-pro-video-480p") next.vega15ProInputVideoCreditsPerSecondByResolution["480p"] = credits;
    else if (key === "vega15-pro-video-720p") next.vega15ProInputVideoCreditsPerSecondByResolution["720p"] = credits;
    else if (key === "vega15-pro-video-1080p") next.vega15ProInputVideoCreditsPerSecondByResolution["1080p"] = credits;
    else if (key === "vega15-pro-video-2k") next.vega15ProInputVideoCreditsPerSecondByResolution["2k"] = credits;
    else if (key === "vega15-pro-video-4k") next.vega15ProInputVideoCreditsPerSecondByResolution["4k"] = credits;
    else if (key === "vega10-lite-480p") next.vega10LiteCreditsPerSecondByResolution["480p"] = credits;
    else if (key === "vega10-lite-768p") next.vega10LiteCreditsPerSecondByResolution["768p"] = credits;
    else if (key === "vega10-lite-1080p") next.vega10LiteCreditsPerSecondByResolution["1080p"] = credits;
    else if (key === "vega10-lite-2k") next.vega10LiteCreditsPerSecondByResolution["2k"] = credits;
    else if (key === "vega10-lite-4k") next.vega10LiteCreditsPerSecondByResolution["4k"] = credits;
    else if (key === "vega10-lite-video-input-480p") next.vega10LiteInputVideoCreditsPerSecondByResolution["480p"] = credits;
    else if (key === "vega10-lite-video-input-768p") next.vega10LiteInputVideoCreditsPerSecondByResolution["768p"] = credits;
    else if (key === "vega10-lite-video-input-1080p") next.vega10LiteInputVideoCreditsPerSecondByResolution["1080p"] = credits;
    else if (key === "vega10-lite-video-input-2k") next.vega10LiteInputVideoCreditsPerSecondByResolution["2k"] = credits;
    else if (key === "vega10-lite-video-input-4k") next.vega10LiteInputVideoCreditsPerSecondByResolution["4k"] = credits;
    else if (key === "vega10-lite-reference-image") next.vega10LiteReferenceImageCreditsEach = credits;
    else if (key === "seedance25-480p") next.seedance25CreditsPerSecondByResolution["480p"] = credits;
    else if (key === "seedance25-720p") next.seedance25CreditsPerSecondByResolution["720p"] = credits;
    else if (key === "h3-vega-480p") next.h3VegaCreditsPerSecondByResolution["480p"] = credits;
    else if (key === "h3-vega-720p") next.h3VegaCreditsPerSecondByResolution["720p"] = credits;
    else if (key === "h3-vega-1080p") next.h3VegaCreditsPerSecondByResolution["1080p"] = credits;
    else if (key === "h3-vega-2k") next.h3VegaCreditsPerSecondByResolution["2k"] = credits;
    else if (key === "h3-vega-4k") next.h3VegaCreditsPerSecondByResolution["4k"] = credits;
    else if (key === "h3-vega-video-input-480p") next.h3VegaInputVideoCreditsPerSecondByResolution["480p"] = credits;
    else if (key === "h3-vega-video-input-720p") next.h3VegaInputVideoCreditsPerSecondByResolution["720p"] = credits;
    else if (key === "h3-vega-video-input-1080p") next.h3VegaInputVideoCreditsPerSecondByResolution["1080p"] = credits;
    else if (key === "h3-vega-video-input-2k") next.h3VegaInputVideoCreditsPerSecondByResolution["2k"] = credits;
    else if (key === "h3-vega-video-input-4k") next.h3VegaInputVideoCreditsPerSecondByResolution["4k"] = credits;
    else if (key === "seedance-nsfw-480p") next.seedanceNsfwCreditsPerSecondByResolution["480p"] = credits;
    else if (key === "seedance-nsfw-720p") next.seedanceNsfwCreditsPerSecondByResolution["720p"] = credits;
    else if (key === "seedance-nsfw-video-input-480p") next.seedanceNsfwVideoCreditsPerSecondByResolution["480p"] = credits;
    else if (key === "seedance-nsfw-video-input-720p") next.seedanceNsfwVideoCreditsPerSecondByResolution["720p"] = credits;
    else if (key === "happyhorse-720p") next.happyhorseCreditsPerSecondByResolution["720p"] = credits;
    else if (key === "happyhorse-1080p") next.happyhorseCreditsPerSecondByResolution["1080p"] = credits;
    else if (key === "seedance-video-input-480p") next.seedanceVideoInputCreditsPerSecondByResolution["480p"] = credits;
    else if (key === "seedance-video-input-720p") next.seedanceVideoInputCreditsPerSecondByResolution["720p"] = credits;
    else if (key === "seedance-video-input-1080p") next.seedanceVideoInputCreditsPerSecondByResolution["1080p"] = credits;
    else if (key === "seedance-video-input-4k") next.seedanceVideoInputCreditsPerSecondByResolution["4k"] = credits;
    else if (key === "seedance-fast-video-input-480p") next.seedanceFastVideoInputCreditsPerSecondByResolution["480p"] = credits;
    else if (key === "seedance-fast-video-input-720p") next.seedanceFastVideoInputCreditsPerSecondByResolution["720p"] = credits;
    else if (key === "seedance-480p") next.seedanceCreditsPerSecondByResolution["480p"] = credits;
    else if (key === "seedance-720p") next.seedanceCreditsPerSecondByResolution["720p"] = credits;
    else if (key === "seedance-1080p") next.seedanceCreditsPerSecondByResolution["1080p"] = credits;
    else if (key === "seedance-4k") next.seedanceCreditsPerSecondByResolution["4k"] = credits;
    else if (key === "seedance-fast-480p") next.seedanceFastCreditsPerSecondByResolution["480p"] = credits;
    else if (key === "seedance-fast-720p") next.seedanceFastCreditsPerSecondByResolution["720p"] = credits;
  }
  const seedance720 = next.seedanceCreditsPerSecondByResolution["720p"];
  const seedanceVideo720 = next.seedanceVideoInputCreditsPerSecondByResolution["720p"];
  if (!seen.has("seedance-480p")) {
    next.seedanceCreditsPerSecondByResolution["480p"] = pricingNumber(seedance720 * 0.5, DEFAULT_ADVANCED_PRICING.seedanceCreditsPerSecondByResolution["480p"]);
  }
  if (!seen.has("seedance-video-input-480p")) {
    next.seedanceVideoInputCreditsPerSecondByResolution["480p"] = pricingNumber(seedanceVideo720 * 0.5, DEFAULT_ADVANCED_PRICING.seedanceVideoInputCreditsPerSecondByResolution["480p"]);
  }
  if (!seen.has("seedance-fast-480p")) {
    next.seedanceFastCreditsPerSecondByResolution["480p"] = DEFAULT_ADVANCED_PRICING.seedanceFastCreditsPerSecondByResolution["480p"];
  }
  if (!seen.has("seedance-fast-720p")) {
    next.seedanceFastCreditsPerSecondByResolution["720p"] = DEFAULT_ADVANCED_PRICING.seedanceFastCreditsPerSecondByResolution["720p"];
  }
  if (!seen.has("seedance-fast-video-input-480p")) {
    next.seedanceFastVideoInputCreditsPerSecondByResolution["480p"] = DEFAULT_ADVANCED_PRICING.seedanceFastVideoInputCreditsPerSecondByResolution["480p"];
  }
  if (!seen.has("seedance-fast-video-input-720p")) {
    next.seedanceFastVideoInputCreditsPerSecondByResolution["720p"] = DEFAULT_ADVANCED_PRICING.seedanceFastVideoInputCreditsPerSecondByResolution["720p"];
  }
  return normalizeAdvancedPricing(next);
}

async function handleAdminGetPricing(req, res) {
  const auth = await requireAdmin(req, res, { loadDb: false });
  if (!auth) return;
  const config = await readAppConfig();
  return sendJson(res, 200, { ok: true, pricing: await adminAdvancedPricingView(config) });
}

async function handleAdminSavePricing(req, res) {
  const auth = await requireAdmin(req, res);
  if (!auth) return;
  const body = await readJson(req);
  const current = await readAppConfig();
  let nextPricing;
  try {
    nextPricing = advancedPricingFromBody(body, current.platform?.advancedPricing);
  } catch (error) {
    return sendJson(res, error.statusCode || 400, {
      ok: false,
      code: error.code || "INVALID_PRICING_ROWS",
      message: error.message || "Invalid pricing rows.",
    });
  }
  const next = {
    ...current,
    platform: normalizePlatformConfig({
      ...(current.platform || {}),
      advancedPricing: nextPricing,
    }),
    updatedAt: new Date().toISOString(),
  };
  await writeAppConfig(next);
  return sendJson(res, 200, { ok: true, config: next, pricing: await adminAdvancedPricingView(next) });
}

async function handleAdminSaveConfig(req, res) {
  const auth = await requireAdmin(req, res);
  if (!auth) return;
  const body = await readJson(req);
  const current = await readAppConfig();
  const configPatch = body.config || {};
  let undressPrompts = current.undressPrompts;
  if (Object.prototype.hasOwnProperty.call(configPatch, "undressPrompts")) {
    try {
      undressPrompts = validateUndressPrompts(configPatch.undressPrompts);
    } catch (error) {
      return sendJson(res, 400, {
        ok: false,
        code: error.code || "INVALID_UNDRESS_PROMPT",
        field: error.field || "",
        message: error.message || "Invalid Undress prompt configuration.",
      });
    }
  }
  const next = {
    ...current,
    ...configPatch,
    prices: { ...current.prices, ...(configPatch.prices || {}) },
    wallet: { ...current.wallet, ...(configPatch.wallet || {}) },
    video: { ...current.video, ...(configPatch.video || {}) },
    undressPrompts,
    platform: normalizePlatformConfig(configPatch.platform || current.platform || {}),
    homeVideo: { ...current.homeVideo, ...(configPatch.homeVideo || {}) },
    ifilm: { ...current.ifilm, ...(configPatch.ifilm || {}) },
    characterImage: { ...current.characterImage, ...(configPatch.characterImage || {}) },
    scenes: Array.isArray(configPatch.scenes) ? configPatch.scenes : current.scenes,
    updatedAt: new Date().toISOString(),
  };
  await writeAppConfig(next);
  return sendJson(res, 200, { ok: true, config: next });
}

async function handleAdminList(req, res) {
  const auth = await requireAdmin(req, res, { loadDb: false });
  if (!auth) return;
  if (dbEnabled()) {
    const [usersPage, ordersPage, assetsPage, recordsPage] = await Promise.all([
      getAdminUsersPageFromDb({ page: 1, limit: 100 }),
      getAdminWalletOrdersPageFromDb({ page: 1, limit: 100 }),
      getAdminUserAssetsPageFromDb({ page: 1, limit: 100 }),
      getAdminGenerationRecordsPageFromDb({ page: 1, limit: 30 }),
    ]);
    const recordUsers = await getUsersByIdsInDb((recordsPage?.records || []).map((record) => record.userId));
    const recordUserMap = new Map(recordUsers.map((user) => [user.id, user]));
    return sendJson(res, 200, {
      ok: true,
      users: (usersPage?.items || []).map(userView),
      walletOrders: ordersPage?.items || [],
      userAssets: assetsPage?.items || [],
      generationRecords: (recordsPage?.records || []).map((record) => adminGenerationRecordView(record, recordUserMap)),
    });
  }
  const records = await readGenerationRecords();
  return sendJson(res, 200, {
    ok: true,
    users: auth.db.users.map(userView),
    walletOrders: auth.db.walletOrders.slice(0, 100),
    userAssets: auth.db.userAssets.slice(0, 100),
    generationRecords: records.slice(0, 30),
  });
}

async function handleAdminUploadHomeImage(req, res) {
  const auth = await requireAdmin(req, res);
  if (!auth) return;
  const body = await readJson(req, JSON_MEDIA_BODY_MAX_BYTES);
  const { mime, bytes } = decodeDataUrl(body.dataUrl || "");
  const ext = imageExtFromMime(mime);
  const fileName = `home-${Date.now()}-${crypto.randomBytes(3).toString("hex")}${ext}`;
  await fs.mkdir(ADMIN_HOME_DIR, { recursive: true });
  const localPath = path.join(ADMIN_HOME_DIR, fileName);
  await fs.writeFile(localPath, bytes);

  const config = await readAppConfig();
  const description = String(body.description || body.summary || "").trim().slice(0, 1200);
  const tags = Array.isArray(body.tags) ? body.tags : String(body.tags || "").split(/[,，\n]/);
  const cleanTags = tags.map((tag) => compactPlainText(tag, 32)).filter(Boolean).slice(0, 12);
  const category = compactPlainText(body.category || "", 48);
  const internalPrompt = typeof body.prompt === "string" ? body.prompt : typeof body.internalPrompt === "string" ? body.internalPrompt : "";
  const item = {
    id: makeHomeVideoItemId(),
    name: String(body.name || "新角色").trim().slice(0, 40) || "新角色",
    title: String(body.title || description || "系统角色").trim().slice(0, 80) || "系统角色",
    description,
    tags: cleanTags,
    category,
    posterUrl: `/assets/admin/home/${fileName}`,
    localImageUrl: `/assets/admin/home/${fileName}`,
    sourceImageUrl: `/assets/admin/home/${fileName}`,
    imageMime: mime,
    sourceImageMime: mime,
    publicImageUrl: "",
    referenceAssetUri: "",
    syntheticReferenceLocalUrl: "",
    syntheticReferenceUrl: "",
    syntheticReferenceTaskId: "",
    videoUrl: "",
    localVideoUrl: "",
    taskId: "",
    status: "image_uploaded",
    prompt: internalPrompt,
    internalPrompt,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  config.homeVideo = upsertHomeVideoItem(config.homeVideo, item);
  await writeAppConfig(config);

  // Kick off the synthetic-reference build in the background so the
  // admin doesn't have to wait, but the item is "ready" before any video
  // task touches it.
  scheduleHomeItemReferenceBuild(item.id).catch((error) => {
    console.warn(`[home-ref] background build failed for ${item.id}:`, error.message || error);
  });

  return sendJson(res, 200, { ok: true, homeVideo: config.homeVideo, item });
}

async function handleAdminRebuildHomeItemReference(req, res, itemId) {
  const auth = await requireAdmin(req, res);
  if (!auth) return;
  let body = {};
  try { body = await readJson(req); } catch { body = {}; }
  const force = body.force !== false;

  const cfgInitial = await readAppConfig();
  const item = findHomeVideoItem(cfgInitial.homeVideo || {}, itemId);
  if (!item) return sendJson(res, 404, { ok: false, message: "没有找到这个角色。" });

  if (HOME_REFERENCE_BUILDS.has(itemId)) {
    return sendJson(res, 200, {
      ok: true,
      message: "参考图正在重建中，请稍候。",
      itemId,
      status: "building",
    });
  }

  // Wipe synthetic state if force=true so we re-run apiz Seedream.
  if (force) {
    const cfg = await readAppConfig();
    const before = findHomeVideoItem(cfg.homeVideo || {}, itemId);
    if (before) {
      cfg.homeVideo = replaceHomeVideoItem(cfg.homeVideo, {
        ...before,
        referenceAssetUri: "",
        publicImageUrl: "",
        r2Key: "",
        syntheticReferenceLocalUrl: "",
        syntheticReferenceUrl: "",
        syntheticReferenceTaskId: "",
        syntheticReferenceModel: "",
        syntheticReferencePrompt: "",
        // Restore poster/local to the original upload so the synthesizer
        // works on the source image again.
        posterUrl: before.sourceImageUrl || before.posterUrl,
        localImageUrl: before.sourceImageUrl || before.localImageUrl,
        imageMime: before.sourceImageMime || before.imageMime,
        status: "image_uploaded",
        updatedAt: new Date().toISOString(),
      });
      await writeAppConfig(cfg);
    }
  }

  scheduleHomeItemReferenceBuild(itemId).catch(() => {});

  return sendJson(res, 200, {
    ok: true,
    message: force ? "已清空旧参考图并重新合成。" : "已触发参考图合成。",
    itemId,
    status: "building",
  });
}

const HOME_REFERENCE_BUILDS = new Map();

function scheduleHomeItemReferenceBuild(itemId) {
  if (!itemId) return Promise.resolve();
  if (HOME_REFERENCE_BUILDS.has(itemId)) return HOME_REFERENCE_BUILDS.get(itemId);
  const promise = (async () => {
    try {
      let cfg = await readAppConfig();
      cfg = await ensureSyntheticReferenceForHomeItem(cfg, itemId, { force: false, _fromScheduler: true });
      const item = findHomeVideoItem(cfg.homeVideo || {}, itemId);
      if (item && (item.status === "reference_failed" || item.error)) {
        cfg.homeVideo = replaceHomeVideoItem(cfg.homeVideo, {
          ...item,
          status: "reference_ready",
          error: "",
          updatedAt: new Date().toISOString(),
        });
      }
      await writeAppConfig(cfg);
      console.log(`[home-ref] synthesized reference for item ${itemId}`);
    } catch (error) {
      console.warn(`[home-ref] failed to build reference for item ${itemId}:`, error.message || error);
      try {
        const cfg = await readAppConfig();
        const item = findHomeVideoItem(cfg.homeVideo || {}, itemId);
        if (item) {
          cfg.homeVideo = replaceHomeVideoItem(cfg.homeVideo, {
            ...item,
            status: "reference_failed",
            error: String(error.message || error),
            updatedAt: new Date().toISOString(),
          });
          await writeAppConfig(cfg);
        }
      } catch (writeError) {
        console.warn(`[home-ref] failed to persist failure state for ${itemId}:`, writeError.message || writeError);
      }
    } finally {
      HOME_REFERENCE_BUILDS.delete(itemId);
    }
  })();
  HOME_REFERENCE_BUILDS.set(itemId, promise);
  return promise;
}

async function handleAdminIfilmStatus(req, res) {
  const auth = await requireAdmin(req, res, { loadDb: false });
  if (!auth) return;
  const config = await readAppConfig();
  const cliPath = config.ifilm?.cliPath || "ifilm";
  try {
    const guide = await execFileJson(cliPath, ["guide", "--format", "json"], {
      env: { ...process.env, FLOW_API_KEY: process.env.FLOW_API_KEY || "" },
    });
    return sendJson(res, 200, { ok: true, installed: true, cliPath, guide });
  } catch (error) {
    return sendJson(res, 200, {
      ok: true,
      installed: false,
      cliPath,
      message: error.code === "ENOENT" ? "ifilm CLI 未安装或不在 PATH。" : error.message,
      stderr: error.stderr || "",
    });
  }
}

async function handleAdminCreateHomeVideo(req, res) {
  const auth = await requireAdmin(req, res);
  if (!auth) return;
  const body = await readJson(req);
  let config = await readAppConfig();
  config.homeVideo = normalizeHomeVideo({ ...config.homeVideo, ...(body.homeVideo || {}) });
  if (body.itemId) {
    const item = findHomeVideoItem(config.homeVideo, body.itemId);
    if (!item) return sendJson(res, 404, { ok: false, message: "没有找到这个首页角色。" });
    config.homeVideo.activeItemId = item.id;
    config.homeVideo = syncHomeVideoActiveFields(config.homeVideo);
  }
  const editableItem = findHomeVideoItem(config.homeVideo);
  if (editableItem && (body.name || body.title)) {
    config.homeVideo = upsertHomeVideoItem(config.homeVideo, {
      ...editableItem,
      name: String(body.name || editableItem.name || "新角色").trim() || "新角色",
      title: String(body.title || editableItem.title || "短剧角色").trim() || "短剧角色",
      updatedAt: new Date().toISOString(),
    });
  }
  const activeItem = findHomeVideoItem(config.homeVideo);
  const sceneId = String(body.sceneId || "room").trim() || "room";
  const sceneConfig = findSceneConfig(config, sceneId);
  const provider = String(body.provider || config.homeVideo.provider || "seedance");
  const submittedPrompt = typeof body.prompt === "string" ? body.prompt : "";
  const userPrompt = body.saveOnly === true ? submittedPrompt : (submittedPrompt.trim() ? submittedPrompt : String(activeItem?.prompt || ""));
  if (body.saveOnly === true) {
    const nowIso = new Date().toISOString();
    const sceneVideos = { ...(activeItem.homeSceneVideos || {}) };
    const previous = sceneVideos[sceneConfig.id] || {};
    sceneVideos[sceneConfig.id] = {
      ...previous,
      sceneId: sceneConfig.id,
      sceneName: sceneConfig.name,
      posterUrl: previous.posterUrl || activeItem.posterUrl || activeItem.localImageUrl || "",
      prompt: userPrompt,
      userPrompt,
      updatedAt: nowIso,
      createdAt: previous.createdAt || nowIso,
      source: previous.source || "admin-home-scene",
    };
    const nextItem = { ...activeItem, provider, homeSceneVideos: sceneVideos, updatedAt: nowIso };
    config.homeVideo = replaceHomeVideoItem(config.homeVideo, nextItem);
    await writeAppConfig(config);
    return sendJson(res, 200, { ok: true, saved: true, homeVideo: config.homeVideo, item: nextItem, homeSceneVideo: sceneVideos[sceneConfig.id] });
  }
  const prompt = makeHomeVideoPrompt(activeItem, userPrompt, { scene: sceneConfig });

  if (provider === "ifilm-cli") {
    return sendJson(res, 503, {
      ok: false,
      code: "IFILM_TEMPLATE_REQUIRED",
      message: "ifilm CLI 生成命令还未配置。先安装 CLI 后运行 ifilm guide，确认图片生视频命令格式，再写入后台 ifilm.commandTemplate。",
    });
  }

  if (!USE_GATEWAY_UPSTREAM && !ARK_API_KEY) {
    return sendJson(res, 503, { ok: false, code: "MISSING_ARK_API_KEY", message: "缺少 ARK_API_KEY，不能提交 Seedance 视频任务。" });
  }

  config = await ensureSyntheticReferenceForHomeItem(config, activeItem.id);
  const referenceItem = findHomeVideoItem(config.homeVideo, activeItem.id);
  const { task, payload } = await submitSeedanceVideoTask({
    config,
    prompt,
    referenceAssetUri: referenceItem.referenceAssetUri || config.homeVideo.referenceAssetUri,
    body: { ...body, generateAudio: true },
    slug: "home-video",
  });

  const nextItem = {
    ...referenceItem,
    provider,
    prompt: referenceItem.prompt || "",
    taskId: task.taskId,
    status: task.status,
    updatedAt: new Date().toISOString(),
  };
  const nowIso = new Date().toISOString();
  const homeSceneVideos = { ...(referenceItem.homeSceneVideos || {}) };
  homeSceneVideos[sceneConfig.id] = {
    sceneId: sceneConfig.id,
    sceneName: sceneConfig.name,
    posterUrl: referenceItem.posterUrl || referenceItem.localImageUrl || "",
    prompt: prompt,
    userPrompt,
    finalPrompt: prompt,
    referenceAssetUri: nextItem.referenceAssetUri || referenceItem.referenceAssetUri || config.homeVideo.referenceAssetUri,
    model: MODEL_QUALITY,
    ratio: payload.ratio,
    resolution: payload.resolution,
    duration: payload.duration,
    provider: "seedance",
    taskId: task.taskId,
    status: task.status,
    videoUrl: "",
    localVideoUrl: "",
    remoteVideoUrl: task.videoUrl || "",
    createdAt: homeSceneVideos[sceneConfig.id]?.createdAt || nowIso,
    updatedAt: nowIso,
    error: "",
    source: "admin-home-scene",
  };
  nextItem.homeSceneVideos = homeSceneVideos;
  if (sceneConfig.id === "room") {
    nextItem.videoUrl = "";
    nextItem.localVideoUrl = "";
    nextItem.remoteVideoUrl = task.videoUrl || "";
  }
  config.homeVideo = replaceHomeVideoItem(config.homeVideo, nextItem);
  await writeAppConfig(config);
  await upsertGenerationRecord({
    taskId: task.taskId,
    status: task.status,
    model: MODEL_QUALITY,
    sceneId: "home",
    sceneName: referenceItem.title || "首页主视频",
    companionId: referenceItem.id || "home",
    companionName: referenceItem.name || "首页预设角色",
    userId: auth.user.id,
    sceneId: sceneConfig.id,
    sceneName: sceneConfig.name,
    referenceAssetUri: nextItem.referenceAssetUri || referenceItem.referenceAssetUri || config.homeVideo.referenceAssetUri,
    prompt: prompt,
    finalPrompt: prompt,
    ratio: payload.ratio,
    resolution: payload.resolution,
    duration: payload.duration,
    quality: "high",
    provider: "seedance",
    upstreamSource: USE_GATEWAY_UPSTREAM ? "gateway" : "direct",
    remoteVideoUrl: task.videoUrl || "",
    localVideoUrl: "",
    error: "",
    source: "admin-home-scene",
  });

  return sendJson(res, 200, { ok: true, homeVideo: config.homeVideo, item: nextItem, homeSceneVideo: homeSceneVideos[sceneConfig.id], task });
}

