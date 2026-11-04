function ratioStyle(value = "") {
  if (normalizeVideoRatio(value) === "adaptive") return "--video-ratio:16 / 9;--video-ratio-value:1.7777777778;";
  const [width, height] = normalizeVideoRatio(value).split(":").map((part) => Math.max(1, Number(part) || 1));
  return `--video-ratio:${width} / ${height};--video-ratio-value:${width / height};`;
}

function videoPixelDimensions(resolution = "720p", ratio = "16:9") {
  const normalizedResolution = normalizeAdvancedResolution(resolution);
  const shortSide = normalizedResolution === "4k" ? 2160 : normalizedResolution === "1080p" ? 1080 : normalizedResolution === "480p" ? 480 : 720;
  const [ratioW, ratioH] = normalizeVideoRatio(ratio).split(":").map((part) => Math.max(1, Number(part) || 1));
  if (ratioW >= ratioH) {
    return {
      width: Math.max(1, Math.round((shortSide * ratioW) / ratioH)),
      height: shortSide,
    };
  }
  const width = shortSide;
  const height = Math.max(1, Math.round((shortSide * ratioH) / ratioW));
  return { width, height };
}

function positiveDurationSeconds(value, fallback = 0) {
  const next = Number(value);
  if (!Number.isFinite(next) || next <= 0) return Math.max(0, Number(fallback || 0) || 0);
  return Math.round(next * 10000) / 10000;
}

function currentAdvancedAliyunSourceVideoSeconds(fallback = 0) {
  const selectedAsset = state.advancedWanClipAssetId
    ? [...(state.advancedAssets || []), ...(state.userAssets || [])]
      .find((asset) => asset.id === state.advancedWanClipAssetId)
    : null;
  const hasVideo = Boolean(
    state.advancedWanClipAssetId
    || state.advancedWanClipDataUrl
    || String(els.advancedWanClipUrl?.value || "").trim()
  );
  return positiveDurationSeconds(
    state.advancedWanClipDurationSeconds || selectedAsset?.durationSeconds || selectedAsset?.duration,
    hasVideo ? fallback : 0,
  );
}

function selectedSeedanceVideoAsset() {
  const id = state.advancedSeedanceVideoAssetId || "";
  if (!id) return null;
  return (state.userAssets || []).find((asset) => asset.id === id)
    || (state.advancedAssets || []).find((asset) => asset.id === id)
    || (state.assetVideoChoices || []).find((asset) => asset.id === id)
    || null;
}

function currentSeedanceVideoInputSeconds(duration = 5, provider = currentAdvancedProvider()) {
  if (!["seedance", "seedance25", "seedance-nsfw"].includes(normalizeAdvancedProvider(provider))) return 0;
  const videoUrlCount = splitUrlList(els.advancedSeedanceVideoUrls?.value || "").length;
  const hasVideoUrl = videoUrlCount > 0;
  const videoRefs = typeof advancedSeedanceVideoReferences === "function" ? advancedSeedanceVideoReferences() : [];
  const selectedAsset = selectedSeedanceVideoAsset();
  const refs = videoRefs.length ? videoRefs : (selectedAsset ? [selectedAsset] : []);
  if (!refs.length && !hasVideoUrl) return 0;
  const assetSeconds = refs.reduce((sum, item) => sum + positiveDurationSeconds(item?.durationSeconds || item?.duration), 0);
  const assetCount = refs.length;
  const fallbackSeconds = positiveDurationSeconds(duration, 5);
  return assetSeconds + (assetCount && !assetSeconds ? fallbackSeconds : 0) + (hasVideoUrl ? fallbackSeconds * videoUrlCount : 0) || fallbackSeconds;
}

function currentSeedanceEstimateReferenceVideoUrls(provider = currentAdvancedProvider()) {
  if (!["seedance", "seedance25", "seedance-nsfw"].includes(normalizeAdvancedProvider(provider))) return [];
  const seedanceMode = normalizeSeedanceMediaMode(els.advancedSeedanceMediaMode?.value || "reference_video");
  if (seedanceModeNeedsFirstFrame(seedanceMode)) return [];
  const videoRefs = typeof advancedSeedanceVideoReferences === "function" ? advancedSeedanceVideoReferences() : [];
  const refUrls = videoRefs
    .filter((item) => !item?.assetId)
    .map((item) => item.url || item.previewUrl || "")
    .filter(Boolean);
  return [...new Set([...refUrls, ...splitUrlList(els.advancedSeedanceVideoUrls?.value || "")])];
}

function advancedPricing(duration, provider = "seedance", resolution = "720p", ratio = "16:9", options = {}) {
  const normalizedProvider = normalizeAdvancedProvider(provider);
  if (["seedance20-vega", "seedance25-vega", "h3-vega"].includes(normalizedProvider)) {
    const error = new Error(advancedProviderLabel(normalizedProvider) + " pricing is not configured. Generation was not started.");
    error.code = "MODEL_PRICING_UNAVAILABLE";
    throw error;
  }
  if (normalizedProvider === "papaya") {
    const configPricing = state.config?.platform?.advancedPricing || {};
    const creditsPerUsd = Number(configPricing.creditsPerUsd || state.wallet?.creditsPerUsd || 100) || 100;
    const inputTokens = Math.max(1, Math.min(256000, Math.floor(Number(options.inputTokens || 1) || 1)));
    const outputTokens = Math.max(0, Math.min(8192, Math.floor(Number(options.outputTokens ?? options.maxTokens ?? els.advancedQwen37MaxTokens?.value ?? 8192) || 0)));
    const usd = (inputTokens * 0.15 + outputTokens * 0.45) / 1000000;
    const originalCredits = creditsAmount(usd * creditsPerUsd);
    const multiplier = userPricingMultiplier();
    return {
      provider: "papaya",
      model: "carrothub-papaya-1.0",
      inputTokens,
      outputTokens,
      inputUsdPerMillionTokens: 0.15,
      outputUsdPerMillionTokens: 0.45,
      originalCredits,
      credits: creditsAmount(originalCredits * multiplier),
      source: "mulerouter_papaya_token_pricing",
    };
  }
  if (["qwen37-flash", "byteplus-language", "papaya"].includes(normalizedProvider)) {
    const configPricing = state.config?.platform?.advancedPricing || {};
    const qwenPricing = configPricing.qwen37Flash || {};
    const inputTokens = Math.max(1, Math.min(1000000, Math.floor(Number(options.inputTokens || 1) || 1)));
    const outputTokens = Math.max(0, Math.min(8192, Math.floor(Number(options.outputTokens ?? options.maxTokens ?? els.advancedQwen37MaxTokens?.value ?? 8192) || 0)));
    const inputRate = Number(qwenPricing.inputCnyPerMillionTokens ?? 0.225);
    const outputRate = Number(qwenPricing.outputCnyPerMillionTokens ?? 0.974);
    const creditsPerCny = Number(configPricing.creditsPerCny || 20) || 20;
    const originalCredits = creditsAmount(((inputTokens * inputRate + outputTokens * outputRate) / 1000000) * creditsPerCny);
    const multiplier = userPricingMultiplier();
    return {
      provider: normalizedProvider,
      model: normalizedProvider === "byteplus-language" ? "ep-20260827122554-8fsgw" : "qwen3.7-flash",
      inputTokens,
      outputTokens,
      inputCnyPerMillionTokens: inputRate,
      outputCnyPerMillionTokens: outputRate,
      baseCredits: originalCredits,
      originalCredits,
      credits: creditsAmount(originalCredits * multiplier),
      markup: 1,
      userPricingMultiplier: multiplier,
      source: "aliyun_singapore_official_token_pricing",
    };
  }
  if (normalizedProvider === "wan30") {
    const requestedDuration = Number(duration ?? 5);
    const adaptiveDuration = requestedDuration === -1;
    const billingDuration = adaptiveDuration ? 30 : Math.min(30, Math.max(2, Number.isFinite(requestedDuration) ? requestedDuration : 5));
    const normalizedResolution = normalizeAdvancedResolution(resolution || "1080p", normalizedProvider);
    const capability = String(options.videoCapability || currentAdvancedVideoCapability(normalizedProvider) || "wan30-video");
    const pricingConfig = state.config?.platform?.advancedPricing || {};
    const pricingByCapability = {
      "wan30-video": ["wan30CreditsPerSecondByResolution", "configured_wan30_output_duration_rate"],
      "wan30-video-pro": ["wan30ProCreditsPerSecondByResolution", "configured_wan30_pro_output_duration_rate"],
      "wan30-video-prime": ["wan30PrimeCreditsPerSecondByResolution", "configured_wan30_prime_output_duration_rate"],
      "wan30-video-prime-pro": ["wan30PrimeProCreditsPerSecondByResolution", "configured_wan30_prime_pro_output_duration_rate"],
    };
    const [rateTable, pricingSource] = pricingByCapability[capability] || pricingByCapability["wan30-video"];
    const configuredRates = pricingConfig[rateTable] || {};
    const fallbackRatesByCapability = {
      "wan30-video": { "480p": 7, "720p": 15, "1080p": 30 },
      "wan30-video-pro": { "1080p": 26.986507, "2k": 53.973014, "4k": 107.946028 },
      "wan30-video-prime": { "480p": 10, "720p": 20, "1080p": 38 },
      "wan30-video-prime-pro": { "1080p": 40.479761, "2k": 80.959521, "4k": 161.919042 },
    };
    const fallbackRates = fallbackRatesByCapability[capability] || fallbackRatesByCapability["wan30-video"];
    const configuredRate = Number(configuredRates[normalizedResolution]);
    const creditsPerSecond = configuredRate > 0
      ? configuredRate
      : Number(fallbackRates[normalizedResolution] ?? fallbackRates["1080p"]);
    if (!(creditsPerSecond > 0)) {
      const error = new Error(advancedProviderLabel(normalizedProvider) + " " + normalizedResolution + " pricing is unavailable.");
      error.code = "MODEL_PRICING_UNAVAILABLE";
      throw error;
    }
    const originalCredits = creditsAmount(billingDuration * creditsPerSecond);
    const multiplier = userPricingMultiplier();
    return {
      provider: "wan30",
      capability,
      duration: adaptiveDuration ? -1 : billingDuration,
      billingDuration,
      adaptiveDuration,
      resolution: normalizedResolution,
      ratio: normalizeVideoRatio(ratio || "adaptive"),
      billing: "output",
      creditsPerSecond,
      outputCredits: originalCredits,
      baseCredits: originalCredits,
      originalCredits,
      credits: creditsAmount(originalCredits * multiplier),
      markup: 1,
      userPricingMultiplier: multiplier,
      source: pricingSource,
    };
  }
  if (normalizedProvider === "qwen-image3") {
    const configPricing = state.config?.platform?.advancedPricing || {};
    const qwenPricing = configPricing.qwenImage3 || {};
    const creditsPerUsd = Number(configPricing.creditsPerUsd || state.wallet?.creditsPerUsd || 100) || 100;
    const tier = options.qwenTier || currentQwenImage3Tier();
    const normalizedTier = tier === "standard" ? "standard" : "pro";
    const normalizedResolution = normalizeAdvancedResolution(resolution || qwenPricing.defaultResolution || "2K", normalizedProvider);
    const referenceImageCount = Math.max(0, Math.min(ADVANCED_QWEN_IMAGE3_REFERENCE_LIMIT, Number(options.referenceImageCount ?? selectedAdvancedReferenceImages("qwen-image3").length) || 0));
    const outputImageCount = Math.max(1, Math.min(6, Number(options.outputImageCount ?? els.advancedQwenOutputCount?.value ?? 1) || 1));
    const tierPricing = qwenPricing[normalizedTier] || {};
    const fallbackOutputUsd = normalizedTier === "standard"
      ? ADVANCED_QWEN_IMAGE3_STANDARD_USD_PER_IMAGE
      : normalizedResolution === "1K"
      ? ADVANCED_QWEN_IMAGE3_PRO_1K_USD_PER_IMAGE
      : ADVANCED_QWEN_IMAGE3_PRO_2K_USD_PER_IMAGE;
    const outputUsdPerImage = Number(tierPricing.saleUsdPerImageByResolution?.[normalizedResolution] ?? fallbackOutputUsd);
    const inputUsdPerReferenceImage = Number(tierPricing.saleUsdPerReferenceImage ?? ADVANCED_QWEN_IMAGE3_USD_PER_REFERENCE_IMAGE);
    const outputUsd = Math.max(0, outputUsdPerImage * outputImageCount);
    const inputUsd = Math.max(0, inputUsdPerReferenceImage * referenceImageCount);
    const totalUsd = outputUsd + inputUsd;
    const originalCredits = creditsAmount(totalUsd * creditsPerUsd);
    const multiplier = userPricingMultiplier();
    return {
      provider: "qwen-image3",
      qwenTier: normalizedTier,
      duration: 1,
      resolution: normalizedResolution,
      referenceImageCount,
      outputImageCount,
      outputUsdPerImage,
      inputUsdPerReferenceImage,
      outputUsd,
      inputUsd,
      totalUsd,
      baseCredits: originalCredits,
      originalCredits,
      credits: creditsAmount(originalCredits * multiplier),
      markup: 1,
      userPricingMultiplier: multiplier,
    };
  }
  if (normalizedProvider === "seedream5-image") {
    const configPricing = state.config?.platform?.advancedPricing || {};
    const seedreamPricing = configPricing.seedream5Image || {};
    const creditsPerUsd = Number(configPricing.creditsPerUsd || state.wallet?.creditsPerUsd || 100) || 100;
    const tier = "pro";
    const normalizedResolution = normalizeAdvancedResolution(resolution || seedreamPricing.defaultResolution || "2K", normalizedProvider);
    const referenceImageCount = Math.max(0, Number(options.referenceImageCount ?? selectedAdvancedReferenceImages("seedream5-image").length) || 0);
    const proResolutionUsd = seedreamPricing.pro?.saleUsdPerImageByResolution || {};
    const outputUsdPerImage = Number(proResolutionUsd[normalizedResolution] ?? (normalizedResolution === "1K" ? ADVANCED_SEEDREAM5_PRO_1K_USD_PER_IMAGE : ADVANCED_SEEDREAM5_PRO_2K_USD_PER_IMAGE));
    const referenceUsdPerImage = Number(seedreamPricing.pro?.referenceUsdPerImageAfterFirst ?? ADVANCED_SEEDREAM5_PRO_REFERENCE_USD_PER_IMAGE_AFTER_FIRST);
    const billableReferenceImages = Math.max(0, referenceImageCount - 1);
    const totalUsd = Math.max(0, outputUsdPerImage + referenceUsdPerImage * billableReferenceImages);
    const originalCredits = creditsAmount(totalUsd * creditsPerUsd);
    const multiplier = userPricingMultiplier();
    return {
      provider: "seedream5-image",
      seedreamTier: tier,
      duration: 1,
      resolution: normalizedResolution,
      size: normalizedResolution,
      referenceImageCount,
      billableReferenceImages,
      outputUsdPerImage,
      referenceUsdPerImage,
      totalUsd,
      baseCredits: originalCredits,
      originalCredits,
      credits: creditsAmount(originalCredits * multiplier),
      markup: 1,
      userPricingMultiplier: multiplier,
    };
  }
  if (normalizedProvider === "wan27-image-edit" || normalizedProvider === "z-image-spicy-pro" || normalizedProvider === "qwen-image-edit-spicy") {
    const credits = assetImageModifyCostCredits();
    return {
      provider: normalizedProvider,
      duration: 1,
      resolution: normalizeAdvancedResolution(resolution, normalizedProvider),
      ratio: normalizeVideoRatio(ratio),
      baseCredits: credits,
      originalCredits: credits,
      credits,
      markup: 1,
      userPricingMultiplier: userPricingMultiplier(),
    };
  }
  const bounds = advancedDurationBounds(normalizedProvider, options.videoCapability);
  const rawSeconds = Number(duration || bounds.fallback);
  const seconds = Number.isFinite(rawSeconds) ? Math.min(bounds.max, Math.max(bounds.min, rawSeconds)) : bounds.fallback;
  const configPricing = state.config?.platform?.advancedPricing || {};
  const multiplier = userPricingMultiplier();
  if (normalizedProvider === "seedance25") {
    const normalizedResolution = normalizeAdvancedResolution(resolution, normalizedProvider);
    const mode = normalizeSeedanceMediaMode(options.mode || els.advancedSeedanceMediaMode?.value || "omini");
    const billingSeconds = normalizedResolution === "720p" ? Math.min(29, seconds) : seconds;
    const byResolution = configPricing.seedance25CreditsPerSecondByResolution || {};
    const fallbackPerSecond = normalizedResolution === "720p"
      ? ADVANCED_SEEDANCE25_720P_CREDITS_PER_SECOND
      : ADVANCED_SEEDANCE25_480P_CREDITS_PER_SECOND;
    const perSecond = Number(byResolution[normalizedResolution] || fallbackPerSecond) || fallbackPerSecond;
    const originalCredits = creditsAmount(billingSeconds * perSecond);
    return {
      provider: "seedance25",
      mode,
      duration: billingSeconds,
      requestedDuration: billingSeconds,
      inputVideoSeconds: 0,
      resolution: normalizedResolution,
      ratio: normalizeVideoRatio(ratio || "16:9"),
      creditsPerSecond: perSecond,
      outputCredits: originalCredits,
      baseCredits: originalCredits,
      originalCredits,
      credits: creditsAmount(originalCredits * multiplier),
      markup: 1,
      userPricingMultiplier: multiplier,
    };
  }
  if (normalizedProvider === "seedance-nsfw") {
    const normalizedResolution = normalizeAdvancedResolution(resolution, normalizedProvider);
    const mode = normalizeSeedanceMediaMode(options.mode || els.advancedSeedanceMediaMode?.value || "omini");
    const inputVideoSeconds = positiveDurationSeconds(options.inputVideoSeconds ?? options.videoInputSeconds, 0);
    const outputSeconds = mode === "edit" && inputVideoSeconds > 0
      ? Math.min(30, Math.max(4, Math.ceil(inputVideoSeconds)))
      : seconds;
    const hasVideoInput = inputVideoSeconds > 0;
    const byResolution = hasVideoInput
      ? configPricing.seedanceNsfwVideoCreditsPerSecondByResolution || {}
      : configPricing.seedanceNsfwCreditsPerSecondByResolution || {};
    const fallbackPerSecond = hasVideoInput
      ? normalizedResolution === "720p" ? ADVANCED_SEEDANCE_NSFW_VIDEO_720P_CREDITS_PER_SECOND : ADVANCED_SEEDANCE_NSFW_VIDEO_480P_CREDITS_PER_SECOND
      : normalizedResolution === "720p" ? ADVANCED_SEEDANCE_NSFW_720P_CREDITS_PER_SECOND : ADVANCED_SEEDANCE_NSFW_480P_CREDITS_PER_SECOND;
    const perSecond = Number(byResolution[normalizedResolution] || fallbackPerSecond) || fallbackPerSecond;
    const outputCredits = creditsAmount(outputSeconds * perSecond);
    const inputVideoCredits = hasVideoInput ? creditsAmount(inputVideoSeconds * perSecond) : 0;
    const originalCredits = creditsAmount(outputCredits + inputVideoCredits);
    return {
      provider: "seedance-nsfw",
      mode,
      duration: outputSeconds,
      requestedDuration: mode === "edit" ? null : seconds,
      inputVideoSeconds,
      hasVideoInput,
      resolution: normalizedResolution,
      ratio: mode === "omini" ? normalizeVideoRatio(ratio) : "adaptive",
      creditsPerSecond: perSecond,
      outputCredits,
      inputVideoCreditsPerSecond: hasVideoInput ? perSecond : 0,
      inputVideoCredits,
      baseCredits: originalCredits,
      originalCredits,
      credits: creditsAmount(originalCredits * multiplier),
      userPricingMultiplier: multiplier,
    };
  }
  if (normalizedProvider === "wan27" || normalizedProvider === "happyhorse") {
    const capability = options.videoCapability || currentAdvancedVideoCapability();
    const normalizedResolution = normalizeAdvancedResolution(resolution, normalizedProvider);
    const animateMode = String(options.mode || options.animateMode || els.advancedWanAnimateMode?.value || "wan-std") === "wan-pro" ? "wan-pro" : "wan-std";
    const rateKey = ["wan-animate-move", "wan-animate-mix"].includes(capability) ? animateMode : normalizedResolution;
    const familyPricing = normalizedProvider === "happyhorse"
      ? configPricing.happyhorseCreditsPerSecondByResolution
      : configPricing.wan27CreditsPerSecondByResolution;
    const byResolution = ["wan-animate-move", "wan-animate-mix"].includes(capability)
      ? configPricing.aliyunVideoCreditsPerSecondByCapability?.[capability] || {}
      : familyPricing || {};
    const fallbackPerSecond = normalizedResolution === "1080p" ? ADVANCED_WAN27_1080P_CREDITS_PER_SECOND : ADVANCED_WAN27_720P_CREDITS_PER_SECOND;
    const perSecond = Number(byResolution[rateKey] || fallbackPerSecond) || fallbackPerSecond;
    const inputBillingCapabilities = new Set(["wan27-r2v", "wan27-video-edit", "happyhorse-video-edit"]);
    const rawInputVideoSeconds = inputBillingCapabilities.has(capability)
      ? positiveDurationSeconds(options.inputVideoSeconds ?? options.videoInputSeconds, 0)
      : 0;
    const inputVideoSeconds = capability === "wan27-r2v" ? Math.min(seconds, rawInputVideoSeconds) : rawInputVideoSeconds;
    const outputCredits = creditsAmount(seconds * perSecond);
    const inputVideoCredits = creditsAmount(inputVideoSeconds * perSecond);
    const originalCredits = creditsAmount(outputCredits + inputVideoCredits);
    return {
      provider: normalizedProvider,
      capability,
      duration: seconds,
      resolution: normalizedResolution,
      animateMode: ["wan-animate-move", "wan-animate-mix"].includes(capability) ? animateMode : undefined,
      creditsPerSecond: perSecond,
      outputCredits,
      inputVideoSeconds,
      inputVideoCreditsPerSecond: perSecond,
      inputVideoCredits,
      baseCredits: originalCredits,
      originalCredits,
      credits: creditsAmount(originalCredits * multiplier),
      markup: 1,
      userPricingMultiplier: multiplier,
    };
  }
  const normalizedResolution = normalizeAdvancedResolution(resolution, normalizedProvider);
  const normalizedRatio = normalizeVideoRatio(ratio);
  const seedanceTier = String(options.seedanceTier || "").trim().toLowerCase() === "fast" ? "fast" : "standard";
  const isFast = seedanceTier === "fast";
  const byResolution = isFast
    ? (configPricing.seedanceFastCreditsPerSecondByResolution || {})
    : (configPricing.seedanceCreditsPerSecondByResolution || {});
  const fallbackPerSecond = isFast
    ? normalizedResolution === "480p"
      ? ADVANCED_SEEDANCE_FAST_480P_CREDITS_PER_SECOND
      : ADVANCED_SEEDANCE_FAST_720P_CREDITS_PER_SECOND
    : normalizedResolution === "4k"
    ? ADVANCED_SEEDANCE_4K_CREDITS_PER_SECOND
    : normalizedResolution === "1080p"
    ? ADVANCED_SEEDANCE_1080P_CREDITS_PER_SECOND
    : normalizedResolution === "480p"
    ? ADVANCED_SEEDANCE_480P_CREDITS_PER_SECOND
    : ADVANCED_SEEDANCE_720P_CREDITS_PER_SECOND;
  const perSecond = Number(byResolution[normalizedResolution] || fallbackPerSecond) || fallbackPerSecond;
  const videoInputSeconds = positiveDurationSeconds(options.inputVideoSeconds ?? options.videoInputSeconds, 0);
  const videoInputByResolution = isFast
    ? (configPricing.seedanceFastVideoInputCreditsPerSecondByResolution || {})
    : (configPricing.seedanceVideoInputCreditsPerSecondByResolution || {});
  const fallbackVideoInputPerSecond = isFast
    ? normalizedResolution === "480p"
      ? ADVANCED_SEEDANCE_FAST_VIDEO_INPUT_480P_CREDITS_PER_SECOND
      : ADVANCED_SEEDANCE_FAST_VIDEO_INPUT_720P_CREDITS_PER_SECOND
    : normalizedResolution === "4k"
    ? ADVANCED_SEEDANCE_VIDEO_INPUT_4K_CREDITS_PER_SECOND
    : normalizedResolution === "1080p"
    ? ADVANCED_SEEDANCE_VIDEO_INPUT_1080P_CREDITS_PER_SECOND
    : normalizedResolution === "480p"
    ? ADVANCED_SEEDANCE_VIDEO_INPUT_480P_CREDITS_PER_SECOND
    : ADVANCED_SEEDANCE_VIDEO_INPUT_720P_CREDITS_PER_SECOND;
  const videoInputCreditsPerSecond = Number(videoInputByResolution[normalizedResolution] || fallbackVideoInputPerSecond) || fallbackVideoInputPerSecond;
  const seedanceDiscount = 1;
  const outputCredits = creditsAmount(seconds * perSecond * seedanceDiscount);
  const videoInputCredits = creditsAmount(videoInputSeconds * videoInputCreditsPerSecond * seedanceDiscount);
  const originalCredits = creditsAmount(outputCredits + videoInputCredits);
  return {
    provider: "seedance",
    seedanceTier,
    seedanceDiscount,
    duration: seconds,
    resolution: normalizedResolution,
    ratio: normalizedRatio,
    creditsPerSecond: perSecond,
    outputCredits,
    videoInputSeconds,
    videoInputCreditsPerSecond,
    videoInputCredits,
    baseCredits: originalCredits,
    originalCredits,
    credits: creditsAmount(originalCredits * multiplier),
    markup: 1,
    userPricingMultiplier: multiplier,
  };
}

function advancedCostForDuration(duration, provider = "seedance", resolution = "720p", ratio = "16:9", options = {}) {
  const key = advancedEstimateKey(duration, provider, resolution, ratio, options);
  if (state.advancedEstimate && state.advancedEstimateKey === key) {
    return state.advancedEstimate.credits;
  }
  return advancedPricing(duration, provider, resolution, ratio, options).credits;
}

function currentAdvancedProvider() {
  return normalizeAdvancedProvider(els.advancedProvider?.value);
}

function currentSeedanceTier() {
  return (String(els.advancedSeedanceTier?.value || "").trim().toLowerCase() === "fast") ? "fast" : "standard";
}

function currentSeedreamTier() {
  return "pro";
}

function currentQwenImage3Tier() {
  return els.advancedQwenTier?.value === "standard" ? "standard" : "pro";
}

function currentAdvancedResolution() {
  const provider = currentAdvancedProvider();
  const normalizedProvider = normalizeAdvancedProvider(provider);
  const fallback = ["seedream5-image", "qwen-image3"].includes(normalizedProvider) ? "2K" : ["seedance", "seedance25", "seedance-nsfw"].includes(normalizedProvider) ? "480p" : "720p";
  return normalizeAdvancedResolution(els.advancedResolution?.value || fallback, provider);
}

function advancedVideoSettingsVisible() {
  return state.advancedCreateKind === "video"
    && !["qwen37-flash", "byteplus-language", "papaya"].includes(currentAdvancedProvider())
    && !advancedCreateModeIsSimpleEdit()
    && !["wan-animate-move", "wan-animate-mix"].includes(currentAdvancedVideoCapability())
    && !advancedVideoEditUsesSourceDuration()
    && !(currentAdvancedProvider() === "seedance-nsfw" && normalizeSeedanceMediaMode(els.advancedSeedanceMediaMode?.value || "") === "edit");
}

function advancedVideoResolutionOptions(provider = currentAdvancedProvider()) {
  if (["seedance20-vega", "seedance25-vega", "h3-vega"].includes(normalizeAdvancedProvider(provider))) return ["768P", "1080P", "2K", "4K"];
  if (normalizeAdvancedProvider(provider) === "qwen-image3") return ["1K", "2K"];
  if (normalizeAdvancedProvider(provider) === "seedream5-image") return ["1K", "2K"];
  if (["seedance25", "seedance-nsfw"].includes(normalizeAdvancedProvider(provider))) return ["480p", "720p"];
  if (normalizeAdvancedProvider(provider) === "wan30") {
    const capability = currentAdvancedVideoCapability(provider);
    if (capability === "wan30-video-pro" || capability === "wan30-video-prime-pro") return ["1080p", "2k", "4k"];
    return ["480p", "720p", "1080p"];
  }
  return normalizeAdvancedProvider(provider) === "seedance"
    ? ["480p", "720p", "1080p", "4k"]
    : ["720p", "1080p"];
}

function advancedVideoDurationOptions(provider = currentAdvancedProvider()) {
  const bounds = advancedDurationBounds(provider);
  const max = normalizeAdvancedProvider(provider) === "seedance25" && currentAdvancedResolution() === "720p" ? 29 : bounds.max;
  const base = [bounds.min, 5, 8, 10, max]
    .filter((value, index, list) => Number.isFinite(value) && value >= bounds.min && value <= max && list.indexOf(value) === index);
  const current = Number(els.advancedDuration?.value || bounds.min);
  if (Number.isFinite(current) && current >= bounds.min && current <= max && !base.includes(current)) base.push(current);
  return base.sort((a, b) => a - b);
}

function advancedVideoResolutionLabel(value = "") {
  const raw = String(value || "");
  if (raw.toLowerCase() === "4k") return "4K";
  if (raw.toLowerCase() === "2k") return "2K";
  return raw;
}

function syncAdvancedVideoSettingsControls() {
  const visible = advancedVideoSettingsVisible();
  if (els.advancedVideoSettings) els.advancedVideoSettings.hidden = !visible;
  if (!visible) return;
  const provider = currentAdvancedProvider();
  const resolutionOptions = advancedVideoResolutionOptions(provider);
  const currentResolution = currentAdvancedResolution();
  if (els.advancedResolution && !resolutionOptions.includes(currentResolution)) {
    els.advancedResolution.value = resolutionOptions[0];
  }
  const selectedResolution = currentAdvancedResolution();
  if (els.advancedVideoResolutionChoices) {
    els.advancedVideoResolutionChoices.innerHTML = resolutionOptions.map((value) => `
      <button class="advanced-video-choice ${value === selectedResolution ? "is-active" : ""}" type="button" data-advanced-video-resolution="${escapeHtml(value)}">
        ${escapeHtml(advancedVideoResolutionLabel(value))}
      </button>
    `).join("");
  }

  const bounds = advancedDurationBounds(provider);
  const maxDuration = normalizeAdvancedProvider(provider) === "seedance25" && selectedResolution === "720p" ? 29 : bounds.max;
  const rawDuration = Number(els.advancedDuration?.value || bounds.min);
  const selectedDuration = Math.min(maxDuration, Math.max(bounds.min, Number.isFinite(rawDuration) ? rawDuration : bounds.min));
  if (els.advancedDuration && Number(els.advancedDuration.value) !== selectedDuration) {
    els.advancedDuration.value = String(selectedDuration);
  }
  if (els.advancedVideoDurationChoices) {
    els.advancedVideoDurationChoices.innerHTML = advancedVideoDurationOptions(provider).map((value) => `
      <button class="advanced-video-choice ${value === selectedDuration ? "is-active" : ""}" type="button" data-advanced-video-duration="${escapeHtml(value)}">
        ${escapeHtml(value)}s
      </button>
    `).join("");
  }
  refreshIcons();
}

function imageCreateHasReferences() {
  const provider = currentAdvancedProvider();
  return selectedAdvancedReferenceImages(["z-image-spicy-pro", "qwen-image-edit-spicy"].includes(provider) ? provider : "wan27-image-edit").length > 0;
}

function imageCreateResolutionOptions() {
  const provider = currentAdvancedProvider();
  if (["z-image-spicy-pro", "qwen-image-edit-spicy"].includes(provider)) return ["1K", "2K"];
  return imageCreateHasReferences() ? ["1K", "2K"] : ["1K", "2K", "4K"];
}

function currentAdvancedRatio() {
  return normalizeVideoRatio(els.advancedRatio?.value || "16:9");
}

function advancedPresetMeta(slot = "") {
  return ADVANCED_PRESET_SLOT_META[slot] || ADVANCED_PRESET_SLOT_META.action;
}

function advancedPresetLabel(slot = "") {
  return t(advancedPresetMeta(slot).labelKey);
}

function advancedPresetSet(slot = "") {
  return (state.advancedPresetData?.sets || []).find((set) => set.slot === slot) || { slot, items: [] };
}

function advancedCharacterPresetFromItem(item = {}, source = "system") {
  const imageUrl = characterReferenceImageUrl(item) || characterUsableImage(item);
  if (!item?.id || !imageUrl || isGenericCharacterPoster(imageUrl)) return null;
  const sourceLabel = source === "custom" ? t("characters.customTab") : t("characters.systemTab");
  const label = item.name || item.label || item.title || "Character";
  return {
    id: String(item.id || ""),
    label,
    category: item.category || sourceLabel,
    section: sourceLabel,
    prompt: item.prompt || item.description || item.title || `Use ${label} as the main subject.`,
    description: item.description || item.title || "",
    imageUrl,
    referenceImageUrl: imageUrl,
    tags: Array.isArray(item.tags) ? item.tags : [],
    gender: item.gender || "",
    style: item.style || "",
    assetId: item.assetId || "",
    sourceType: source,
    characterId: item.id || "",
    myCharacter: source === "custom",
  };
}

function advancedCharacterPresetItems(source = state.advancedPresetCharacterSource || "system") {
  const systemItems = (state.homeCharacters || [])
    .filter((item) => item && !item.deletedAt)
    .map((item) => advancedCharacterPresetFromItem(item, "system"))
    .filter(Boolean);
  const customItems = customCharacterItems()
    .filter((item) => item && !item.deletedAt && characterUsableImage(item))
    .map((item) => advancedCharacterPresetFromItem(item, "custom"))
    .filter(Boolean);
  const ourdreamItems = (advancedPresetSet("character").items || [])
    .map((item) => advancedCharacterPresetFromItem(item, "ourdream"))
    .filter(Boolean);
  const seen = new Set();
  const pool = source === "custom" ? customItems : [...ourdreamItems, ...systemItems];
  return pool.filter((item) => {
    const key = `${item.sourceType}:${item.id}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function advancedPresetItems(slot = "") {
  if (slot === "character") return advancedCharacterPresetItems();
  const items = Array.isArray(advancedPresetSet(slot).items) ? advancedPresetSet(slot).items : [];
  const character = selectedAdvancedPreset("character") || {};
  const gender = ["Female", "Male", "Trans"].includes(character.gender) ? character.gender : "Female";
  const anime = String(character.style || "").toLowerCase() === "anime";
  if (slot !== "action") {
    return items.map((item) => {
      const variant = item.variants?.[`${gender}:${anime ? "Anime" : "Realistic"}`]
        || item.variants?.[`Female:${anime ? "Anime" : "Realistic"}`]
        || item.variants?.[`${gender}:Realistic`]
        || null;
      return variant ? {
        ...item,
        prompt: variant.prompt || item.prompt || "",
        imageUrl: variant.imageUrl || item.imageUrl || "",
        referenceImageUrl: variant.imageUrl || item.referenceImageUrl || item.imageUrl || "",
      } : item;
    });
  }
  return items.map((item) => {
    const videoVariant = item.videos?.[gender] || item.videos?.Female || item.videos?.Male || item.videos?.Trans || {};
    const thumbnailVariant = item.thumbnails?.[gender] || item.thumbnails?.Female || item.thumbnails?.Male || item.thumbnails?.Trans || {};
    return {
      ...item,
      imageUrl: (anime ? thumbnailVariant.animeThumbnailUrl : thumbnailVariant.thumbnailUrl) || thumbnailVariant.thumbnailUrl || item.imageUrl || "",
      referenceImageUrl: (anime ? thumbnailVariant.animeThumbnailUrl : thumbnailVariant.thumbnailUrl) || thumbnailVariant.thumbnailUrl || item.referenceImageUrl || item.imageUrl || "",
      videoUrl: (anime ? videoVariant.animeVideoUrl : videoVariant.videoUrl) || videoVariant.videoUrl || item.videoUrl || "",
    };
  });
}

function hasMoreSystemCharacterPresets() {
  const total = Number(state.homeCharactersTotal || 0) || 0;
  if (!total) return false;
  return advancedCharacterPresetItems("system").length < total;
}

function systemCharacterPresetTotal() {
  return Math.max(
    Number(state.homeCharactersTotal || 0) || 0,
    advancedCharacterPresetItems("system").length,
  );
}

function renderAdvancedPresetCharacterPager() {
  if (state.advancedPresetDialogSlot !== "character" || state.advancedPresetCharacterSource === "custom") return "";
  const loaded = advancedCharacterPresetItems("system").length;
  const total = systemCharacterPresetTotal();
  if (!total || loaded >= total) return "";
  const loading = state.homeCharactersLoadingMore;
  return `
    <div class="advanced-preset-load-more">
      <span>${escapeHtml(String(loaded))} / ${escapeHtml(String(total))}</span>
      <button class="ghost-button" type="button" data-advanced-preset-load-more ${loading ? "disabled" : ""}>
        <i data-lucide="${loading ? "loader-circle" : "chevrons-down"}"></i>${escapeHtml(loading ? "Loading" : "Load more")}
      </button>
    </div>
  `;
}

async function loadMoreAdvancedPresetCharacters() {
  if (state.advancedPresetDialogSlot !== "character" || state.advancedPresetCharacterSource === "custom") return;
  if (!hasMoreSystemCharacterPresets()) return;
  renderAdvancedPresetDialog();
  await loadMoreHomeCharacters();
  if (state.advancedPresetDialogSlot === "character" && els.advancedPresetDialog?.open) renderAdvancedPresetDialog();
  renderAdvancedPresetBuilder();
}

function selectedAdvancedPreset(slot = "") {
  return state.advancedSelectedPresets?.[slot] || null;
}

function clearAdvancedPreset(slot = "") {
  if (!slot) return;
  state.advancedSelectedPresets = { ...(state.advancedSelectedPresets || {}), [slot]: null };
  if (slot === "character") clearAdvancedCharacterPresetReference();
  renderAdvancedPresetBuilder();
}

function clearAdvancedCharacterPresetReference() {
  const refs = Array.isArray(state.advancedReferenceImages) ? state.advancedReferenceImages : [];
  const removedActivePresetRef = refs.some((item) => item?.fromPreset && item.dataUrl === state.advancedUploadDataUrl);
  const nextRefs = refs.filter((item) => !item?.fromPreset);
  state.advancedReferenceImages = nextRefs;
  if (removedActivePresetRef || !nextRefs.length) state.advancedUploadDataUrl = nextRefs[0]?.dataUrl || "";
  if (!nextRefs.length) {
    state.advancedFirstFrameAssetId = "";
    state.advancedSourceImageAssetId = "";
  } else if (["wan27-image-edit", "z-image-spicy-pro", "qwen-image-edit-spicy"].includes(currentAdvancedProvider())) {
    state.advancedSourceImageAssetId = nextRefs[0]?.assetId || "";
    state.advancedFirstFrameAssetId = "";
  } else {
    state.advancedFirstFrameAssetId = nextRefs[0]?.assetId || "";
    state.advancedSourceImageAssetId = "";
  }
  updateAdvancedModelControls();
}

function resetAdvancedPresets() {
  state.advancedSelectedPresets = {};
  state.advancedPresetDialogSlot = "";
  state.advancedPresetCategory = "All";
  state.advancedPresetSearch = "";
}

async function loadAdvancedPresets() {
  if (state.advancedPresetsLoaded || state.advancedPresetsLoading) return;
  state.advancedPresetsLoading = true;
  try {
    const response = await fetch(`${OURDREAM_PRESET_URL}?v=4`);
    if (!response.ok) throw new Error(`Preset request failed: ${response.status}`);
    const rawPayload = await response.json();
    const payload = rawPayload?.presets || rawPayload;
    state.advancedPresetData = {
      sets: Array.isArray(payload.sets) ? payload.sets : [],
      categories: payload.categories && typeof payload.categories === "object" ? payload.categories : {},
    };
    state.advancedPresetsLoaded = true;
  } catch (error) {
    console.warn("advanced presets failed", error);
  } finally {
    state.advancedPresetsLoading = false;
    renderAdvancedPresetBuilder();
  }
}

async function loadPlayfluxTemplates() {
  if (state.playfluxTemplatesLoaded || state.playfluxTemplatesLoading) return;
  state.playfluxTemplatesLoading = true;
  try {
    const response = await fetch("/api/platform/playflux-templates?v=1", { cache: "force-cache" });
    if (!response.ok) throw new Error(`Template request failed: ${response.status}`);
    const payload = await response.json();
    state.playfluxTemplates = Array.isArray(payload?.templates) ? payload.templates : [];
    state.playfluxTemplatesLoaded = true;
  } catch (error) {
    console.warn("playflux templates failed", error);
  } finally {
    state.playfluxTemplatesLoading = false;
    if (typeof renderTemplates === "function" && isPlayfluxGalleryMode()) renderTemplates();
  }
}

function presetImageUrl(item = {}) {
  return item.imageUrl || item.referenceImageUrl || "";
}

function presetPromptText(item = {}) {
  return String(item.prompt || item.description || item.label || "").trim();
}

function presetVideoUrl(item = {}) {
  return String(item.videoUrl || item.referenceVideoUrl || "").trim();
}

function advancedPresetReferenceImage(slot = "", item = selectedAdvancedPreset(slot)) {
  if (!slot || !item) return null;
  const url = presetImageUrl(item);
  if (!url) return null;
  return {
    assetId: item.assetId || "",
    dataUrl: url,
    url,
    imageUrl: url,
    fileName: `${item.id || slot}.jpg`,
    name: `${advancedPresetLabel(slot)}: ${item.label || slot}`,
    presetId: item.id || "",
    presetSlot: slot,
    fromPreset: true,
    localUpload: Boolean(item.localUpload),
    sourceUrl: item.localUpload ? "" : url,
  };
}

function advancedPresetReferenceImages() {
  return advancedCreateModeActivePresetSlots()
    .filter((slot) => !(slot === "action" && presetVideoUrl(selectedAdvancedPreset(slot) || {})))
    .map((slot) => advancedPresetReferenceImage(slot))
    .filter(Boolean)
    .slice(0, ADVANCED_SEEDANCE_REFERENCE_LIMIT);
}

function advancedPresetVideoReferences() {
  if (!advancedCreateModeActivePresetSlots().includes("action")) return [];
  const item = selectedAdvancedPreset("action");
  const url = presetVideoUrl(item || {});
  if (!url) return [];
  return [{
    assetId: item.assetId || "",
    dataUrl: url,
    url,
    videoUrl: url,
    fileName: `${item.id || "action"}.mp4`,
    name: `${advancedPresetLabel("action")}: ${item.label || "Action"}`,
    presetId: item.id || "",
    presetSlot: "action",
    fromPreset: true,
    sourceUrl: url,
  }];
}

function setAdvancedLocalCharacterPreset(ref = {}) {
  const url = ref.dataUrl || ref.url || ref.imageUrl || ref.previewUrl || "";
  if (!url) return;
  state.advancedSelectedPresets = {
    ...(state.advancedSelectedPresets || {}),
    character: {
      id: "local-upload-character",
      assetId: ref.assetId || "",
      label: t("advancedPreset.localImage"),
      category: t("advancedPreset.character"),
      prompt: "Use the uploaded image as the main consenting adult subject. Preserve identity, face, hairstyle, body type, and overall character consistency.",
      imageUrl: url,
      referenceImageUrl: url,
      localUpload: true,
    },
  };
}

function advancedPresetSupplementalReferenceImages(seedanceMode = "") {
  const refs = advancedPresetReferenceImages();
  if (!seedanceModeNeedsFirstFrame(seedanceMode)) return refs;
  return refs.filter((item) => item.presetSlot !== "character");
}

function advancedSimpleActionCostLabel(provider = currentAdvancedProvider(), duration = Number(els.advancedDuration?.value || 5), resolution = currentAdvancedResolution(), ratio = currentAdvancedRatio()) {
  const options = {
    inputVideoSeconds: provider === "seedance" ? currentSeedanceVideoInputSeconds(duration, provider) : 0,
    seedanceTier: currentSeedanceTier(),
  };
  return advancedButtonCostLabel(duration, provider, resolution, ratio, options);
}

async function confirmAdvancedSimpleActionCost(costLabel = "") {
  const cost = String(costLabel || "").trim();
  const result = await showInlineDialog({
    title: "",
    body: `<p class="job-note">${escapeHtml(t("advanced.confirmCostOnly", { cost }, cost))}</p>`,
    confirmText: t("common.generate"),
    dialogClass: "is-frame-action",
  });
  return result === "confirm";
}

function advancedPresetImageRolePrompt() {
  const refs = advancedPresetReferenceImages();
  const videos = advancedPresetVideoReferences();
  if (!refs.length && !videos.length) return "";
  const roles = {
    character: "character identity and first-frame subject",
    pose: "pose, body position, and composition",
    action: "action, pose, and motion direction",
    outfit: "outfit and styling",
    scene: "environment, lighting, and background",
  };
  const lines = refs.map((item, index) => (
    `Image ${index + 1}: ${roles[item.presetSlot] || item.presetSlot} reference (${item.name || item.label || item.presetSlot}).`
  ));
  const videoLines = videos.map((item, index) => (
    `Reference video ${index + 1}: action, pose sequence, timing, and motion reference (${item.name || item.presetSlot}).`
  ));
  return [
    "Follow the selected reference media exactly for their assigned roles.",
    ...lines,
    ...videoLines,
    refs.some((item) => item.presetSlot === "character") ? "The character image is the highest-priority identity reference. Preserve its face, identity, hairstyle, body type, age impression, and overall character consistency." : "",
    "Use pose media only for body position and composition, action video only for motion and timing, outfit images only for clothing and styling, and scene images only for environment, lighting, and background.",
    "Do not copy faces, identities, body types, or extra people from pose, action, outfit, or scene references.",
  ].join(" ");
}

function renderAdvancedPresetBuilder() {
  if (!els.advancedPresetBuilder) return;
  const slots = advancedCreateModeActivePresetSlots();
  const hidden = state.advancedCreateKind === "custom" || !slots.length;
  els.advancedPresetBuilder.hidden = hidden;
  if (hidden) {
    els.advancedPresetBuilder.innerHTML = "";
    return;
  }
  if (state.advancedPresetsLoading && !state.advancedPresetsLoaded) {
    els.advancedPresetBuilder.innerHTML = `<div class="advanced-preset-status">${escapeHtml(t("advancedPreset.loading"))}</div>`;
    return;
  }
  const showLocalUpload = slots.includes("character") && nonCustomAdvancedNeedsCharacterImage();
  const uploadAction = showLocalUpload
    ? `<button class="advanced-preset-upload" type="button" data-advanced-preset-upload="character"><i data-lucide="upload"></i>${escapeHtml(t("advancedPreset.uploadLocalImage"))}</button>`
    : "";
  els.advancedPresetBuilder.innerHTML = `${uploadAction}${slots.map((slot) => {
    const meta = advancedPresetMeta(slot);
    const selected = selectedAdvancedPreset(slot);
    const image = presetImageUrl(selected || {});
    return `
      <button class="advanced-preset-slot ${selected ? "has-preset" : ""}" type="button" data-advanced-preset-slot="${escapeHtml(slot)}">
        <span class="advanced-preset-slot-media">
          ${image ? `<img src="${escapeHtml(image)}" alt="${escapeHtml(selected?.label || advancedPresetLabel(slot))}" loading="lazy" />` : `<i data-lucide="${escapeHtml(meta.icon)}"></i>`}
        </span>
        <span class="advanced-preset-slot-copy">
          <strong>${escapeHtml(selected?.label || advancedPresetLabel(slot))}</strong>
          <small>${escapeHtml(selected ? advancedPresetLabel(slot) : t(meta.required ? "advancedPreset.required" : "advancedPreset.optional"))}</small>
        </span>
        ${selected ? `<span class="advanced-preset-clear" data-advanced-preset-clear="${escapeHtml(slot)}" aria-label="${escapeHtml(t("advancedPreset.clear"))}">&times;</span>` : ""}
      </button>
    `;
  }).join("")}`;
  els.advancedPresetBuilder.querySelectorAll("[data-advanced-preset-upload]").forEach((button) => {
    const openUpload = (event) => {
      event.preventDefault();
      event.stopPropagation();
      triggerAdvancedLocalImageUpload({ sourceMode: "reference_video", presetSlot: "character" });
    };
    button.addEventListener("click", openUpload);
    button.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") openUpload(event);
    });
  });
  els.advancedPresetBuilder.querySelectorAll("[data-advanced-preset-slot]").forEach((button) => {
    button.addEventListener("click", (event) => {
      if (event.target.closest("[data-advanced-preset-clear]")) return;
      if (event.target.closest("[data-advanced-preset-upload]")) return;
      openAdvancedPresetDialog(button.dataset.advancedPresetSlot || "");
    });
  });
  els.advancedPresetBuilder.querySelectorAll("[data-advanced-preset-clear]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      clearAdvancedPreset(button.dataset.advancedPresetClear || "");
    });
  });
  refreshIcons();
}

function advancedPresetCategoriesForSlot(slot = "") {
  const configured = Array.isArray(state.advancedPresetData?.categories?.[slot]) ? state.advancedPresetData.categories[slot] : [];
  const itemCategories = [...new Set(advancedPresetItems(slot).map((item) => item.category || "").filter(Boolean))];
  const categories = configured.length ? configured : ["All", ...itemCategories];
  return [...new Set(["All", ...categories.filter(Boolean)])];
}

function openAdvancedPresetDialog(slot = "") {
  if (!slot || !els.advancedPresetDialog) return;
  prepareModalOpen();
  state.advancedPresetDialogSlot = slot;
  if (slot === "character" && !["system", "custom"].includes(state.advancedPresetCharacterSource)) {
    state.advancedPresetCharacterSource = "system";
  }
  state.advancedPresetCategory = "All";
  state.advancedPresetSearch = "";
  if (els.advancedPresetSearch) els.advancedPresetSearch.value = "";
  if (els.advancedPresetDialogKicker) els.advancedPresetDialogKicker.textContent = "Preset";
  if (els.advancedPresetDialogTitle) {
    els.advancedPresetDialogTitle.textContent = t("advancedPreset.choose", { slot: advancedPresetLabel(slot) });
  }
  renderAdvancedPresetDialog();
  els.advancedPresetDialog.showModal();
  window.setTimeout(() => els.advancedPresetSearch?.focus(), 80);
  if (slot === "character" && state.user) {
    Promise.allSettled([
      state.myCharactersLoaded ? Promise.resolve() : loadMyCharacters({ silent: true }),
      loadUserAssets(state.userAssetsPage || 1),
    ]).then(() => {
      if (state.advancedPresetDialogSlot === "character" && els.advancedPresetDialog?.open) {
        renderAdvancedPresetDialog();
      }
      renderAdvancedPresetBuilder();
    });
  }
}

function renderAdvancedPresetDialog() {
  const slot = state.advancedPresetDialogSlot;
  if (!slot || !els.advancedPresetGrid) return;
  const categories = advancedPresetCategoriesForSlot(slot);
  if (els.advancedPresetCategories) {
    const sourceTabs = slot === "character" ? `
      <div class="advanced-preset-source-tabs" role="tablist" aria-label="${escapeHtml(t("advancedPreset.choose", { slot: advancedPresetLabel(slot) }))}">
        ${[
          { id: "system", label: t("characters.systemTab"), count: systemCharacterPresetTotal() },
          { id: "custom", label: t("characters.customTab"), count: advancedCharacterPresetItems("custom").length },
        ].map((source) => `
          <button class="advanced-preset-source-tab ${state.advancedPresetCharacterSource === source.id ? "is-active" : ""}" type="button" data-advanced-preset-source="${escapeHtml(source.id)}">
            ${escapeHtml(source.label)}<span>${escapeHtml(String(source.count))}</span>
          </button>
        `).join("")}
      </div>
    ` : "";
    els.advancedPresetCategories.innerHTML = `${sourceTabs}${categories.map((category) => `
      <button class="advanced-preset-category ${category === state.advancedPresetCategory ? "is-active" : ""}" type="button" data-advanced-preset-category="${escapeHtml(category)}">
        ${escapeHtml(category)}
      </button>
    `).join("")}`;
    els.advancedPresetCategories.querySelectorAll("[data-advanced-preset-source]").forEach((button) => {
      button.addEventListener("click", () => {
        state.advancedPresetCharacterSource = button.dataset.advancedPresetSource === "custom" ? "custom" : "system";
        state.advancedPresetCategory = "All";
        renderAdvancedPresetDialog();
      });
    });
    els.advancedPresetCategories.querySelectorAll("[data-advanced-preset-category]").forEach((button) => {
      button.addEventListener("click", () => {
        state.advancedPresetCategory = button.dataset.advancedPresetCategory || "All";
        renderAdvancedPresetDialog();
      });
    });
  }
  const query = String(state.advancedPresetSearch || "").trim().toLowerCase();
  const selectedCategory = String(state.advancedPresetCategory || "All").toLowerCase();
  const localUploadCard = slot === "character" && nonCustomAdvancedNeedsCharacterImage() ? `
    <button class="advanced-preset-card advanced-preset-local-card" type="button" data-advanced-preset-local-upload>
      <span><i data-lucide="image-up"></i></span>
      <strong>${escapeHtml(t("advancedPreset.uploadLocalImage"))}</strong>
    </button>
  ` : "";
  const bindLocalUploadCard = () => {
    els.advancedPresetGrid.querySelector("[data-advanced-preset-local-upload]")?.addEventListener("click", () => {
      els.advancedPresetDialog?.close();
      triggerAdvancedLocalImageUpload({ sourceMode: "reference_video", presetSlot: "character" });
    });
  };
  const items = advancedPresetItems(slot).filter((item) => {
    const tagList = (item.tags || []).map((tag) => String(tag || "").toLowerCase());
    const categoryOk = state.advancedPresetCategory === "All" || String(item.category || "").toLowerCase() === selectedCategory || tagList.includes(selectedCategory);
    const haystack = [item.label, item.category, item.section, item.description, item.prompt, ...(item.tags || [])].join(" ").toLowerCase();
    return categoryOk && (!query || haystack.includes(query));
  });
  if (!items.length) {
    els.advancedPresetGrid.innerHTML = `${localUploadCard}<div class="advanced-preset-empty">${escapeHtml(t("advancedPreset.none"))}</div>${renderAdvancedPresetCharacterPager()}`;
    bindLocalUploadCard();
    els.advancedPresetGrid.querySelector("[data-advanced-preset-load-more]")?.addEventListener("click", () => {
      loadMoreAdvancedPresetCharacters().catch((error) => console.warn("load more preset characters failed", error.message || error));
    });
    refreshIcons();
    return;
  }
  els.advancedPresetGrid.innerHTML = `${localUploadCard}${items.map((item) => {
    const image = presetImageUrl(item);
    const active = selectedAdvancedPreset(slot)?.id === item.id;
    return `
      <button class="advanced-preset-card ${active ? "is-active" : ""}" type="button" data-advanced-preset-id="${escapeHtml(item.id)}">
        ${image ? `<img src="${escapeHtml(image)}" alt="${escapeHtml(item.label || "")}" loading="lazy" />` : `<span><i data-lucide="${escapeHtml(advancedPresetMeta(slot).icon)}"></i></span>`}
        <strong>${escapeHtml(item.label || "")}</strong>
      </button>
    `;
  }).join("")}${renderAdvancedPresetCharacterPager()}`;
  bindLocalUploadCard();
  els.advancedPresetGrid.querySelectorAll("[data-advanced-preset-id]").forEach((button) => {
    button.addEventListener("click", () => selectAdvancedPreset(slot, button.dataset.advancedPresetId || ""));
  });
  els.advancedPresetGrid.querySelector("[data-advanced-preset-load-more]")?.addEventListener("click", () => {
    loadMoreAdvancedPresetCharacters().catch((error) => console.warn("load more preset characters failed", error.message || error));
  });
  refreshIcons();
}

function selectAdvancedPreset(slot = "", presetId = "") {
  const preset = advancedPresetItems(slot).find((item) => item.id === presetId);
  if (!preset) return;
  state.advancedSelectedPresets = { ...(state.advancedSelectedPresets || {}), [slot]: preset };
  if (slot === "character") {
    ["pose", "action", "outfit", "scene"].forEach((dependentSlot) => {
      const selectedId = state.advancedSelectedPresets?.[dependentSlot]?.id;
      if (!selectedId) return;
      const resolved = advancedPresetItems(dependentSlot).find((item) => item.id === selectedId);
      if (resolved) state.advancedSelectedPresets[dependentSlot] = resolved;
    });
    applyAdvancedCharacterPreset(preset);
  }
  els.advancedPresetDialog?.close();
  renderAdvancedPresetBuilder();
  if (els.advancedNote) els.advancedNote.textContent = "";
}

function applyAdvancedCharacterPreset(preset = {}) {
  const url = preset.referenceImageUrl || preset.imageUrl || "";
  if (!url) return;
  const rawRef = {
    assetId: preset.assetId || "",
    dataUrl: url,
    url,
    fileName: `${preset.id || "character"}.jpg`,
    name: preset.label || "Character",
    fromPreset: true,
    sourceType: preset.sourceType || "",
    characterId: preset.characterId || preset.id || "",
  };
  const ref = typeof stampAdvancedReferenceOrder === "function" ? stampAdvancedReferenceOrder(rawRef) : rawRef;
  const provider = currentAdvancedProvider();
  if (["wan27-image-edit", "z-image-spicy-pro", "qwen-image-edit-spicy"].includes(provider)) {
    state.advancedSourceImageAssetId = "";
    state.advancedFirstFrameAssetId = "";
    state.advancedReferenceImages = [ref];
  } else {
    state.advancedFirstFrameAssetId = "";
    state.advancedSourceImageAssetId = "";
    state.advancedReferenceImages = [ref];
    if (provider === "seedance" && els.advancedSeedanceMediaMode) {
      const mode = normalizeSeedanceMediaMode(els.advancedSeedanceMediaMode.value || "");
      if (!seedanceModeNeedsFirstFrame(mode)) els.advancedSeedanceMediaMode.value = "reference_video";
    }
  }
  state.advancedUploadDataUrl = url;
  if (els.advancedImage) els.advancedImage.value = "";
  updateAdvancedModelControls();
}

function advancedPresetPromptParts() {
  const parts = [advancedPresetImageRolePrompt()];
  advancedCreateModeActivePresetSlots().forEach((slot) => {
    const item = selectedAdvancedPreset(slot);
    if (!item) return;
    const label = advancedPresetLabel(slot);
    const prompt = presetPromptText(item);
    parts.push(`${label}: ${slot === "character" ? `${item.label}. ` : ""}${prompt}`);
  });
  return parts.map((part) => part.trim()).filter(Boolean);
}

function advancedPresetSelectionPayload() {
  return Object.fromEntries(advancedCreateModeActivePresetSlots().map((slot) => {
    const item = selectedAdvancedPreset(slot);
    return [slot, item ? {
      id: item.id,
      label: item.label,
      category: item.category || "",
      prompt: presetPromptText(item),
      imageUrl: item.localUpload ? "" : presetImageUrl(item),
      videoUrl: item.localUpload ? "" : presetVideoUrl(item),
      sourceType: item.localUpload ? "local" : item.sourceType || "",
    } : null];
  }));
}

function hydrateAdvancedPresetsFromParams(params = {}) {
  const saved = params.presets && typeof params.presets === "object" && !Array.isArray(params.presets) ? params.presets : null;
  if (!saved) return false;
  const next = {};
  ADVANCED_PRESET_SLOT_ORDER.forEach((slot) => {
    const savedItem = saved[slot];
    if (!savedItem) return;
    const matched = advancedPresetItems(slot).find((item) => item.id === savedItem.id) || null;
    next[slot] = matched || {
      id: savedItem.id || `${slot}-restored`,
      label: savedItem.label || advancedPresetLabel(slot),
      category: savedItem.category || "",
      prompt: savedItem.prompt || "",
      imageUrl: savedItem.imageUrl || "",
      referenceImageUrl: savedItem.imageUrl || "",
      videoUrl: savedItem.videoUrl || "",
    };
  });
  state.advancedSelectedPresets = next;
  return Object.values(next).some(Boolean);
}

function promptWithoutPresetParts(prompt = "", params = {}) {
  const saved = params.presets && typeof params.presets === "object" && !Array.isArray(params.presets) ? params.presets : null;
  let text = String(prompt || "");
  if (!saved) return text.trim();
  Object.entries(saved).forEach(([slot, item]) => {
    if (!item) return;
    const label = item.label || "";
    const promptText = item.prompt || "";
    const slotTitle = slot.charAt(0).toUpperCase() + slot.slice(1);
    const patterns = [
      `${slotTitle}: ${label}. ${promptText}`,
      `${slotTitle}: ${promptText}`,
      promptText,
    ].filter((value) => String(value || "").trim().length > 8);
    patterns.forEach((pattern) => {
      text = text.replace(pattern, "");
    });
  });
  return text
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .join("\n")
    .trim();
}

