function advancedEffectivePrompt(basePrompt = "") {
  const prompt = String(basePrompt || "").trim();
  if (state.advancedCreateKind === "custom") return prompt;
  if (["video-image", "video-replace"].includes(state.advancedCreateMode)) return advancedCreateModeDefaultPrompt(state.advancedCreateMode);
  return [...advancedPresetPromptParts(), prompt]
    .filter(Boolean)
    .join("\n");
}

// Wan 3.0 responds better to explicit material references and observable
// actions. Keep this local and conservative so the user's story and dialogue
// remain intact, while avoiding a second upstream prompt rewrite.
function optimizeWan30Prompt(prompt = "") {
  let text = String(prompt || "").trim();
  if (!text) return text;
  text = text.replace(/(^|[^@\w])(?:图片|图像|照片)\s*([0-9]+)/gi, "$1@图片$2");
  text = text.replace(/(^|[^@\w])(?:视频)\s*([0-9]+)/gi, "$1@视频$2");
  text = text.replace(/(^|[^@\w])(?:音频)\s*([0-9]+)/gi, "$1@音频$2");
  text = text.replace(/(^|[^@\w])Image\s*([0-9]+)/gi, "$1@图片$2");
  text = text.replace(/(^|[^@\w])Video\s*([0-9]+)/gi, "$1@视频$2");
  text = text.replace(/(^|[^@\w])Audio\s*([0-9]+)/gi, "$1@音频$2");
  const positiveRules = [
    [/不要(?:出现|添加|加入)\s*(?:任何)?(?:文字|字幕|水印|logo|标志)/gi, "画面保持纯净"],
    [/不要改变/gi, "保持"],
    [/禁止移动镜头|不要移动镜头|避免移动镜头/gi, "镜头保持稳定"],
    [/不要说话|禁止说话|避免说话/gi, "保持安静表演"],
    [/很惊讶|非常惊讶/gi, "眉毛上扬，眼睛睁大，嘴巴微张"],
    [/很悲伤|非常悲伤/gi, "眼神下垂，呼吸变慢，肩膀下沉"],
    [/很开心|非常开心/gi, "嘴角上扬，眼神明亮，身体自然放松"],
  ];
  positiveRules.forEach(([pattern, replacement]) => { text = text.replace(pattern, replacement); });
  return text
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .join("\n")
    .trim();
}

function nonCustomAdvancedNeedsCharacterImage() {
  if (state.advancedCreateKind === "custom") return false;
  return advancedCreateModeActivePresetSlots().includes("character");
}

function hasAdvancedCharacterImage() {
  return Boolean(
    state.advancedUploadDataUrl ||
    state.advancedSeedanceFirstFrameDataUrl ||
    state.advancedSeedanceFirstFrameAssetId ||
    state.advancedFirstFrameAssetId ||
    state.advancedSourceImageAssetId ||
    selectedAdvancedReferenceImages("seedance").length ||
    selectedAdvancedReferenceImages(["z-image-spicy-pro", "qwen-image-edit-spicy"].includes(currentAdvancedProvider()) ? currentAdvancedProvider() : "wan27-image-edit").length
  );
}

function advancedCreateKindConfig(kind = state.advancedCreateKind) {
  if (kind === ADVANCED_CUSTOM_KIND.id) return ADVANCED_CUSTOM_KIND;
  return ADVANCED_CREATE_KINDS.find((item) => item.id === kind) || ADVANCED_CREATE_KINDS[1];
}

function advancedCreateModesForKind(kind = state.advancedCreateKind) {
  const normalizedKind = advancedCreateKindConfig(kind).id;
  return ADVANCED_CREATE_MODES[normalizedKind] || ADVANCED_CREATE_MODES.video;
}

function advancedCreateModeConfig(kind = state.advancedCreateKind, mode = state.advancedCreateMode) {
  if (advancedCreateKindConfig(kind).id === "custom") return ADVANCED_CUSTOM_MODE;
  const modes = advancedCreateModesForKind(kind);
  return modes.find((item) => item.id === mode) || modes[0];
}

function clearAdvancedMediaInputs() {
  const previousPromptRefs = typeof advancedPromptMentionSnapshot === "function" ? advancedPromptMentionSnapshot() : [];
  state.activeAdvancedCaseId = "";
  state.advancedUploadDataUrl = "";
  state.advancedSourceImageAssetId = "";
  state.advancedFirstFrameAssetId = "";
  state.advancedReferenceImages = [];
  state.advancedSeedanceVideoReferences = [];
  state.advancedSeedanceAudioReferences = [];
  state.advancedSeedanceFirstFrameDataUrl = "";
  state.advancedSeedanceFirstFrameAssetId = "";
  state.advancedSeedanceLastFrameDataUrl = "";
  state.advancedSeedanceLastFrameAssetId = "";
  state.advancedSeedanceVideoAssetId = "";
  state.advancedSeedanceVideoPreviewUrl = "";
  state.advancedWanLastFrameDataUrl = "";
  state.advancedWanLastFrameAssetId = "";
  state.advancedWanClipDataUrl = "";
  state.advancedWanClipFileName = "";
  state.advancedWanClipAssetId = "";
  state.advancedWanClipOrder = 0;
  state.advancedAudioAssetId = "";
  state.advancedAudioPreviewUrl = "";
  state.advancedAudioFileName = "";
  state.advancedAudioOrder = 0;
  resetAdvancedPresets();
  [
    els.advancedSeedanceVideoUrls,
    els.advancedSeedanceAudioUrls,
    els.advancedWanAudioUrl,
    els.advancedWanClipUrl,
  ].forEach((input) => {
    if (input) input.value = "";
  });
  [
    els.advancedImage,
    els.advancedSeedanceFirstFrame,
    els.advancedSeedanceLastFrame,
    els.advancedWanFirstFrame,
    els.advancedWanLastFrame,
    els.advancedWanClipFile,
  ].forEach((input) => {
    if (input) input.value = "";
  });
  [
    [els.advancedWanFirstFramePreview, els.advancedWanFirstFrame],
    [els.advancedSeedanceFirstFramePreview, els.advancedSeedanceFirstFrame],
    [els.advancedSeedanceLastFramePreview, els.advancedSeedanceLastFrame],
    [els.advancedWanLastFramePreview, els.advancedWanLastFrame],
    [els.advancedWanClipPreview, els.advancedWanClipFile],
  ].forEach(([preview, input]) => {
    preview?.removeAttribute("src");
    preview?.classList.remove("is-visible");
    input?.closest(".wan-frame-upload")?.classList.remove("has-image");
  });
  if (els.advancedUploadPreview) els.advancedUploadPreview.innerHTML = "";
  els.advancedUploadBox?.classList.remove("has-image");
  if (typeof syncAdvancedPromptMentionLabels === "function") syncAdvancedPromptMentionLabels(previousPromptRefs);
  renderAdvancedPresetBuilder();
}

function applyAdvancedCreateMode({ clearMedia = false, syncForm = true } = {}) {
  const kind = advancedCreateKindConfig().id;
  const config = advancedCreateModeConfig(kind);
  state.advancedCreateKind = kind;
  state.advancedCreateMode = config.id;
  if (clearMedia) clearAdvancedMediaInputs();
  const custom = Boolean(config.custom);
  if (els.advancedWorkspace) {
    els.advancedWorkspace.classList.toggle("is-create-custom", custom);
    els.advancedWorkspace.classList.toggle("is-create-image", kind === "image");
    els.advancedWorkspace.classList.toggle("is-create-video", kind === "video");
    els.advancedWorkspace.classList.toggle("is-create-custom-kind", kind === "custom");
    els.advancedWorkspace.classList.toggle("is-create-auto-prompt", !custom && advancedCreateModeUsesAutoPrompt(config.id));
    els.advancedWorkspace.classList.toggle("is-create-simple-edit", !custom && advancedCreateModeIsSimpleEdit(config.id));
    Object.values(ADVANCED_CREATE_MODES).flat().forEach((mode) => {
      els.advancedWorkspace.classList.toggle(`is-create-${mode.id}`, mode.id === config.id);
    });
    els.advancedWorkspace.dataset.createMode = config.id;
  }
  if (!custom && syncForm) {
    if (els.advancedProvider && config.provider) els.advancedProvider.value = config.provider;
    if (config.videoCapability && typeof syncAdvancedVideoCapabilityOptions === "function") {
      syncAdvancedVideoCapabilityOptions(config.videoCapability);
    }
    if (config.seedanceMode && els.advancedSeedanceMediaMode) els.advancedSeedanceMediaMode.value = advancedCreateModePreferredSeedanceMode(config);
    if (config.wanMode && els.advancedWanMediaMode) els.advancedWanMediaMode.value = normalizeWanMediaMode(config.wanMode);
    if (config.assetTarget) {
      const targetIds = advancedAssetTargetItems().map((target) => target.id);
      if (clearMedia || !targetIds.includes(state.advancedAssetTarget)) state.advancedAssetTarget = config.assetTarget;
    }
    if (els.advancedRatio) els.advancedRatio.value = "9:16";
    if (kind === "image") {
      if (els.advancedResolution) els.advancedResolution.value = "2K";
      if (els.advancedDuration) els.advancedDuration.value = "1";
    }
    if (kind === "video") {
      const videoResolutions = advancedVideoResolutionOptions(config.provider || "seedance");
      const currentResolution = normalizeAdvancedResolution(els.advancedResolution?.value || videoResolutions[0], config.provider || "seedance");
      if (els.advancedResolution && !videoResolutions.includes(currentResolution)) els.advancedResolution.value = videoResolutions[0];
      const bounds = advancedDurationBounds(config.provider || "seedance");
      const currentDuration = Number(els.advancedDuration?.value || 0);
      if (els.advancedDuration && (!Number.isFinite(currentDuration) || currentDuration < bounds.min || currentDuration > bounds.max)) {
        els.advancedDuration.value = String(bounds.min);
      }
    }
  }
  if (els.advancedPrompt) {
    els.advancedPrompt.setAttribute("placeholder", t(config.placeholderKey || "advanced.promptPlaceholder"));
  }
  if (els.advancedImage) {
    els.advancedImage.accept = advancedCreateUploadAcceptValue(config.id);
    els.advancedImage.multiple = !advancedCreateUploadIsVideo(config.id) && !advancedCreateModeUsesSingleUpload(config.id);
  }
  renderAdvancedPresetBuilder();
}

function renderAdvancedCreateControls() {
  if (els.advancedCreateKindTabs) {
    const customKinds = [
      { id: "video", labelKey: "advanced.createKindVideo", icon: "clapperboard" },
      { id: "image", labelKey: "advanced.createKindImage", icon: "image" },
      { id: "conversation", labelKey: "advanced.createKindConversation", icon: "message-circle" },
    ];
    els.advancedCreateKindTabs.innerHTML = (state.advancedCreateKind === "custom" ? customKinds : ADVANCED_CREATE_KINDS).map((kind) => {
      const active = state.advancedCreateKind === "custom"
        ? kind.id === state.advancedCustomMediaKind
        : kind.id === state.advancedCreateKind;
      const attribute = state.advancedCreateKind === "custom"
        ? `data-advanced-custom-media-kind="${escapeHtml(kind.id)}"`
        : `data-advanced-create-kind="${escapeHtml(kind.id)}"`;
      return `<button class="advanced-create-kind ${active ? "is-active" : ""}" ${attribute} type="button" role="tab" aria-selected="${active ? "true" : "false"}"><i data-lucide="${escapeHtml(kind.icon)}"></i><span>${escapeHtml(t(kind.labelKey))}</span></button>`;
    }).join("");
  }
  if (els.advancedCreateModeTabs) {
    const modes = advancedCreateModesForKind();
    if (!modes.some((mode) => mode.id === state.advancedCreateMode)) {
      state.advancedCreateMode = modes[0]?.id || "video-image";
    }
    els.advancedCreateModeTabs.hidden = state.advancedCreateKind === "custom";
    els.advancedCreateModeTabs.innerHTML = modes.map((mode) => `
      <button class="advanced-create-mode ${mode.id === state.advancedCreateMode ? "is-active" : ""}" data-advanced-create-mode="${escapeHtml(mode.id)}" type="button" role="tab" aria-selected="${mode.id === state.advancedCreateMode ? "true" : "false"}">
        <i data-lucide="${escapeHtml(mode.icon)}"></i><span>${escapeHtml(t(mode.labelKey))}</span>
      </button>
    `).join("");
  }
  applyAdvancedCreateMode();
  if (typeof syncMainTabState === "function") syncMainTabState();
  refreshIcons();
}

function setAdvancedCreateKind(kind = "video") {
  const nextKind = advancedCreateKindConfig(kind).id;
  const previousKind = state.advancedCreateKind;
  state.advancedCreateKind = nextKind;
  state.advancedCreateMode = nextKind === "custom"
    ? ADVANCED_CUSTOM_MODE.id
    : advancedCreateModesForKind(nextKind)[0]?.id || state.advancedCreateMode;
  if (previousKind !== nextKind) resetAdvancedPresets();
  renderAdvancedCreateControls();
  applyAdvancedCreateMode({ clearMedia: previousKind !== nextKind && nextKind !== "custom" });
  updateAdvancedModelControls();
  updateAdvancedButtonCost();
}

function setAdvancedCustomMediaKind(kind = "video") {
  if (state.advancedCreateKind !== "custom") return;
  const next = ["video", "image", "conversation"].includes(kind) ? kind : "video";
  if (state.advancedCustomMediaKind === next) return;
  state.advancedCustomMediaKind = next;
  const option = Array.from(els.advancedProvider?.options || []).find((item) => !item.hidden && advancedProviderMatchesCustomKind(item.value, next));
  if (option && els.advancedProvider) {
    els.advancedProvider.value = option.value;
    els.advancedProvider.dispatchEvent(new Event("change", { bubbles: true }));
  }
  renderAdvancedCreateControls();
  updateAdvancedModelControls();
  updateAdvancedButtonCost();
}

function setAdvancedCreateMode(mode = "") {
  if (state.advancedCreateKind === "custom") return;
  const modes = advancedCreateModesForKind();
  const previousMode = state.advancedCreateMode;
  const nextMode = modes.find((item) => item.id === mode)?.id || modes[0]?.id || state.advancedCreateMode;
  state.advancedCreateMode = nextMode;
  const nextConfig = advancedCreateModeConfig(state.advancedCreateKind, nextMode);
  if (previousMode !== nextMode) resetAdvancedPresets();
  renderAdvancedCreateControls();
  applyAdvancedCreateMode({ clearMedia: previousMode !== nextMode && !nextConfig.custom });
  updateAdvancedModelControls();
  updateAdvancedButtonCost();
}

function normalizeWanMediaMode(value = "") {
  const normalized = String(value || "").trim().toLowerCase().replace(/[\s-]+/g, "_");
  const allowed = new Set(["multimodal", "first_frame", "first_last_frame", "first_frame_audio", "first_last_frame_audio", "first_clip", "first_clip_last_frame"]);
  return allowed.has(normalized) ? normalized : "multimodal";
}

function wanModeNeedsFirstFrame(mode) {
  return ["multimodal", "first_frame", "first_last_frame", "first_frame_audio", "first_last_frame_audio"].includes(normalizeWanMediaMode(mode));
}

function wanModeNeedsLastFrame(mode) {
  return ["first_last_frame", "first_last_frame_audio", "first_clip_last_frame"].includes(normalizeWanMediaMode(mode));
}

function wanModeNeedsAudio(mode) {
  return ["multimodal", "first_frame_audio", "first_last_frame_audio"].includes(normalizeWanMediaMode(mode));
}

function wanModeNeedsClip(mode) {
  return ["multimodal", "first_clip", "first_clip_last_frame"].includes(normalizeWanMediaMode(mode));
}

function advancedPricingUnavailableLabel(pricing = {}) {
  const message = String(pricing?.message || "").trim();
  return message && !/^null$/i.test(message) ? message : "Pricing unavailable. Generation was not started.";
}

function advancedCostLabel(duration, provider = "seedance", resolution = "720p", ratio = "16:9", options = {}) {
  const normalizedProvider = normalizeAdvancedProvider(provider);
  if (isVegaProviderId(normalizedProvider)) {
    const key = advancedEstimateKey(duration, provider, resolution, ratio, options);
    const pricing = state.advancedEstimate && state.advancedEstimateKey === key
      ? state.advancedEstimate
      : null;
    if (pricing?.available === true) {
      const suffix = ` - ${pricing.resolution || normalizeAdvancedResolution(resolution, normalizedProvider)}`;
      const inputSuffix = Number(pricing.videoInputSeconds || 0) > 0
        ? ` + input ${formatDurationSeconds(pricing.videoInputSeconds)}`
        : "";
      return `${t("cost.creditsDuration", { credits: formatCredits(pricing.credits), duration: formatDurationSeconds(pricing.duration) })}${inputSuffix}${suffix}`;
    }
    if (state.advancedEstimateFailureKey === key) {
      return advancedPricingUnavailableLabel(state.advancedEstimate || {});
    }
    return t("cost.checking");
  }
  if (normalizeAdvancedProvider(provider) === "qwen-image3") {
    const key = advancedEstimateKey(duration, provider, resolution, ratio, options);
    const pricing = state.advancedEstimate && state.advancedEstimateKey === key
      ? state.advancedEstimate
      : advancedPricing(duration, provider, resolution, ratio, options);
    const tier = String(pricing.qwenTier || options.qwenTier || "pro") === "standard" ? "Standard" : "Pro";
    return `${t("cost.credits", { credits: formatCredits(pricing.credits) })} - ${tier} ${pricing.resolution || normalizeAdvancedResolution(resolution, provider)}`;
  }
  if (normalizeAdvancedProvider(provider) === "seedream5-image") {
    const key = advancedEstimateKey(duration, provider, resolution, ratio, options);
    const pricing = state.advancedEstimate && state.advancedEstimateKey === key
      ? state.advancedEstimate
      : advancedPricing(duration, provider, resolution, ratio, options);
    return `${t("cost.credits", { credits: formatCredits(pricing.credits) })} - Pro ${pricing.resolution || normalizeAdvancedResolution(resolution, provider)}`;
  }
  if (["wan27-image-edit", "z-image-spicy-pro", "qwen-image-edit-spicy"].includes(normalizeAdvancedProvider(provider))) {
    return `${assetImageModifyCostLabel()} - ${normalizeAdvancedResolution(resolution, provider)}`;
  }
  const key = advancedEstimateKey(duration, provider, resolution, ratio, options);
  const pricing = state.advancedEstimate && state.advancedEstimateKey === key
    ? state.advancedEstimate
    : advancedPricing(duration, provider, resolution, ratio, options);
  const suffix = ` - ${pricing.resolution || normalizeAdvancedResolution(resolution, provider)}`;
  const inputSuffix = Number(pricing.videoInputSeconds || 0) > 0
    ? ` + input ${formatDurationSeconds(pricing.videoInputSeconds)}`
    : "";
  return `${t("cost.creditsDuration", { credits: formatCredits(pricing.credits), duration: formatDurationSeconds(pricing.duration) })}${inputSuffix}${suffix}`;
}

function assetImageModifyCostCredits() {
  return Number(state.config?.assetImageModify?.costCredits ?? DEFAULT_ASSET_IMAGE_MODIFY_CREDITS);
}

function assetImageModifyCostLabel() {
  return t("cost.credits", { credits: formatCredits(assetImageModifyCostCredits()) });
}

function pricingCreditLabel(value) {
  return t("cost.credits", { credits: formatCredits(creditsAmount(value)) });
}

function seedanceInputCreditsPerSecond(resolution = "720p", seedanceTier = "standard") {
  const normalizedResolution = normalizeAdvancedResolution(resolution, "seedance");
  const isFast = String(seedanceTier || "").trim().toLowerCase() === "fast";
  const byResolution = isFast
    ? (state.config?.platform?.advancedPricing?.seedanceFastVideoInputCreditsPerSecondByResolution || {})
    : (state.config?.platform?.advancedPricing?.seedanceVideoInputCreditsPerSecondByResolution || {});
  const fallback = isFast
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
  return Number(byResolution[normalizedResolution] || fallback) || fallback;
}

function pricingTable(title, description, columns = [], rows = []) {
  return `
    <section class="pricing-rule-block">
      <div class="pricing-rule-head">
        <h3>${escapeHtml(title)}</h3>
        ${description ? `<p>${escapeHtml(description)}</p>` : ""}
      </div>
      <div class="pricing-table-wrap">
        <table class="pricing-table">
          <thead>
            <tr>${columns.map((column) => `<th>${escapeHtml(column)}</th>`).join("")}</tr>
          </thead>
          <tbody>
            ${rows.map((row) => `<tr>${row.map((cell) => `<td>${cell}</td>`).join("")}</tr>`).join("")}
          </tbody>
        </table>
      </div>
    </section>
  `;
}

function renderConfiguredPricingRows(pricing = {}, packages = []) {
  const configuredRows = Array.isArray(pricing.rows)
    ? pricing.rows.filter((row) => row && normalizeAdvancedProvider(row.provider) !== "seedance25")
    : [];
  if (!configuredRows.length) return false;
  const creditsPerUsd = Number(pricing.creditsPerUsd || 100) || 100;
  const publicCredits = (value) => `${formatCredits(creditsAmount(value))} credits`;
  const commonDurations = [5, 10, 15];
  const rowCategory = (row) => {
    if (row.unit === "image") return "Image generation";
    if (row.unit === "reference_image") return "Reference image surcharge";
    if (row.unit === "input_second") return "Video input surcharge";
    if (row.unit === "combined_second") return "Video generation + input";
    return "Video generation";
  };
  const rowUnit = (row, rate) => {
    if (row.unit === "image") return `${publicCredits(rate)}/image`;
    if (row.unit === "reference_image") return `${publicCredits(rate)}/reference`;
    if (row.unit === "combined_second") return `${publicCredits(rate)}/combined second`;
    return `${publicCredits(rate)}/second`;
  };
  const rowCommonPrice = (row, rate) => {
    if (row.unit === "image") return `1 image ${publicCredits(rate)}`;
    if (row.unit === "reference_image") return `1 reference +${publicCredits(rate)}`;
    if (row.unit === "combined_second") {
      return `5s output + 5s input ${publicCredits(rate * 10)}`;
    }
    const prefix = row.unit === "input_second" ? "+" : "";
    return commonDurations.map((duration) => `${duration}s ${prefix}${publicCredits(rate * duration)}`).join(" / ");
  };
  const rows = configuredRows.map((row) => {
    const rate = Number(row.saleCreditsPerUnit ?? row.saleCreditsPerSecond ?? 0) || 0;
    return {
      category: rowCategory(row),
      model: publicGenerationDisplayLabel(row.provider) || String(row.providerLabel || row.provider || row.model || "Model"),
      modelId: String(row.model || ""),
      spec: String(row.resolution || "-"),
      unit: rowUnit(row, rate),
      common: rowCommonPrice(row, rate),
      note: String(row.usageLabel || ""),
    };
  });
  const packageChips = packages.length
    ? packages.map((item) => `<span><strong>${escapeHtml(item.currency)} $${escapeHtml(formatCredits(item.amount))}</strong>${escapeHtml(publicCredits(item.credits))}</span>`).join("")
    : "";

  els.pricingRules.innerHTML = `
    <div class="pricing-shot-card">
      <div class="pricing-shot-title">
        <div>
          <p>Vipeak AI</p>
          <h3>Public price list</h3>
        </div>
        <span>1 USD = ${escapeHtml(formatCredits(creditsPerUsd))} credits</span>
      </div>
      <div class="pricing-shot-table-wrap">
        <table class="pricing-shot-table">
          <thead>
            <tr>
              <th>Type</th>
              <th>Model</th>
              <th>Specification</th>
              <th>Unit price</th>
              <th>Common prices</th>
              <th>Billing</th>
            </tr>
          </thead>
          <tbody>
            ${rows.map((row) => `
              <tr>
                <td>${escapeHtml(row.category)}</td>
                <td><strong>${escapeHtml(row.model)}</strong>${row.modelId && row.modelId !== row.model ? `<small class="pricing-model-id">${escapeHtml(row.modelId)}</small>` : ""}</td>
                <td>${escapeHtml(row.spec)}</td>
                <td>${escapeHtml(row.unit)}</td>
                <td>${escapeHtml(row.common)}</td>
                <td>${escapeHtml(row.note)}</td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>
      <div class="pricing-shot-foot">
        <span>Prices come directly from the current admin sale-price configuration. User-specific web or API multipliers are applied when a task is submitted.</span>
        ${packageChips ? `<div class="pricing-package-list">${packageChips}</div>` : ""}
      </div>
    </div>
  `;
  return true;
}

function renderPricing() {
  if (!els.pricingRules) return;
  const configuredPricing = state.config?.platform?.advancedPricing || {};
  const packages = topupPackages();
  if (renderConfiguredPricingRows(configuredPricing, packages)) return;
  const seedanceResolutions = ["480p", "720p", "1080p", "4k"];
  const seedanceFastResolutions = ["480p", "720p"];
  const wanResolutions = ["720p", "1080p"];
  const commonDurations = [5, 10, 15];
  const creditsPerUsd = Number(state.config?.platform?.advancedPricing?.creditsPerUsd || 100) || 100;

  const publicCredits = (value) => `${formatCredits(creditsAmount(value))} 积分`;
  const publicPricingCredits = (pricing = {}) => creditsAmount(pricing.originalCredits ?? pricing.baseCredits ?? pricing.credits ?? 0);
  const durationSummary = (provider, resolution, options = {}) => commonDurations
    .map((duration) => `${duration}s ${publicCredits(publicPricingCredits(advancedPricing(duration, provider, resolution, "16:9", options)))}`)
    .join(" / ");
  const generationRow = (category, model, resolution, provider, options, note) => {
    const pricing = advancedPricing(5, provider, resolution, "16:9", options);
    return {
      category,
      model,
      spec: resolution,
      unit: `${publicCredits(pricing.creditsPerSecond || publicPricingCredits(pricing) / 5)}/秒`,
      common: durationSummary(provider, resolution, options),
      note,
    };
  };
  const videoInputRow = (resolution, tier) => {
    const inputPerSecond = seedanceInputCreditsPerSecond(resolution, tier);
    return {
      category: "参考视频加收",
      model: `Seedance 2.0 ${tier === "fast" ? "Fast" : "Standard"}`,
      spec: resolution,
      unit: `${publicCredits(inputPerSecond)}/秒`,
      common: commonDurations.map((duration) => `${duration}s +${publicCredits(inputPerSecond * duration)}`).join(" / "),
      note: "仅上传参考视频时叠加",
    };
  };
  const seedreamPrice = (resolution) => publicPricingCredits(advancedPricing(1, "seedream5-image", resolution, "1:1", { referenceImageCount: 0 }));
  const seedreamReferenceExtra = creditsAmount(
    Number(state.config?.platform?.advancedPricing?.seedream5Image?.pro?.referenceUsdPerImageAfterFirst ?? ADVANCED_SEEDREAM5_PRO_REFERENCE_USD_PER_IMAGE_AFTER_FIRST)
    * creditsPerUsd
  );
  const rows = [
    ...seedanceResolutions.map((resolution) => generationRow("视频生成", "Seedance 2.0 Standard", resolution, "seedance", { seedanceTier: "standard" }, "支持 5-15 秒")),
    ...seedanceFastResolutions.map((resolution) => generationRow("视频生成", "Seedance 2.0 Fast", resolution, "seedance", { seedanceTier: "fast" }, "Fast 支持 480p / 720p")),
    ...wanResolutions.map((resolution) => generationRow("视频生成", "Wan2.7", resolution, "wan27", {}, "支持 2-15 秒")),
    ...seedanceResolutions.map((resolution) => videoInputRow(resolution, "standard")),
    ...seedanceFastResolutions.map((resolution) => videoInputRow(resolution, "fast")),
    {
      category: "图片生成",
      model: "Z-Image Spicy Pro",
      spec: "1K / 2K",
      unit: `${publicCredits(assetImageModifyCostCredits())}/张`,
      common: `单张 ${publicCredits(assetImageModifyCostCredits())}`,
    },
    {
      category: "图片编辑",
      model: "Qwen Image Edit Spicy",
      spec: "1K / 2K",
      unit: `${publicCredits(assetImageModifyCostCredits())}/张`,
      common: `单张 ${publicCredits(assetImageModifyCostCredits())}`,
    },
    {
      category: "图片生成",
      model: "Seedream 5.0 Pro",
      spec: "1K",
      unit: `${publicCredits(seedreamPrice("1K"))}/张`,
      common: `单张 ${publicCredits(seedreamPrice("1K"))}`,
      note: `第 2 张起参考图 +${publicCredits(seedreamReferenceExtra)}/张`,
    },
    {
      category: "图片生成",
      model: "Seedream 5.0 Pro",
      spec: "2K",
      unit: `${publicCredits(seedreamPrice("2K"))}/张`,
      common: `单张 ${publicCredits(seedreamPrice("2K"))}`,
      note: `第 2 张起参考图 +${publicCredits(seedreamReferenceExtra)}/张`,
    },
  ];
  const packageChips = packages.length
    ? packages.map((item) => `<span><strong>${escapeHtml(item.currency)} $${escapeHtml(formatCredits(item.amount))}</strong>${escapeHtml(publicCredits(item.credits))}</span>`).join("")
    : "";
  els.pricingRules.innerHTML = `
    <div class="pricing-shot-card">
      <div class="pricing-shot-title">
        <div>
          <p>Vipeak AI</p>
          <h3>公开价格表</h3>
        </div>
        <span>1 USD = ${escapeHtml(formatCredits(creditsPerUsd))} 积分</span>
      </div>
      <div class="pricing-shot-table-wrap">
        <table class="pricing-shot-table">
          <thead>
            <tr>
              <th>类型</th>
              <th>模型/项目</th>
              <th>规格</th>
              <th>单价</th>
              <th>常用价格</th>
              <th>说明</th>
            </tr>
          </thead>
          <tbody>
            ${rows.map((row) => `
              <tr>
                <td>${escapeHtml(row.category)}</td>
                <td><strong>${escapeHtml(row.model)}</strong></td>
                <td>${escapeHtml(row.spec)}</td>
                <td>${escapeHtml(row.unit)}</td>
                <td>${escapeHtml(row.common)}</td>
                <td>${escapeHtml(row.note)}</td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>
      <div class="pricing-shot-foot">
        <span>视频最终扣分 = 生成视频价格 + 参考视频加收（如有）。公开价不包含用户专属折扣。</span>
        ${packageChips ? `<div class="pricing-package-list">${packageChips}</div>` : ""}
      </div>
    </div>
  `;
}

function advancedButtonCostLabel(duration, provider = "seedance", resolution = "720p", ratio = "16:9", options = {}) {
  const normalizedProvider = normalizeAdvancedProvider(provider);
  if (isVegaProviderId(normalizedProvider)) {
    return advancedCostLabel(duration, provider, resolution, ratio, options);
  }
  const fullLabel = advancedCostLabel(duration, provider, resolution, ratio, options);
  if (state.advancedCreateKind === "custom") return fullLabel;
  if (["seedream5-image", "qwen-image3", "qwen37-flash", "byteplus-language"].includes(normalizedProvider)) return fullLabel;
  if (["wan27-image-edit", "z-image-spicy-pro", "qwen-image-edit-spicy"].includes(normalizedProvider)) return assetImageModifyCostLabel();
  const pricing = state.advancedEstimate && state.advancedEstimateKey === advancedEstimateKey(duration, provider, resolution, ratio, options)
    ? state.advancedEstimate
    : advancedPricing(duration, provider, resolution, ratio, options);
  return t("cost.credits", { credits: formatCredits(pricing.credits) });
}

function advancedEstimateKey(duration, provider = "seedance", resolution = "720p", ratio = "16:9", options = {}) {
  const normalizedProvider = normalizeAdvancedProvider(provider);
  if (["qwen37-flash", "byteplus-language", "papaya"].includes(normalizedProvider)) {
    return [
      normalizedProvider,
      Math.max(1, Number(options.inputTokens || 1) || 1),
      Math.max(1, Number(options.outputTokens ?? options.maxTokens ?? els.advancedQwen37MaxTokens?.value ?? 8192) || 1024),
      String(options.enableThinking ?? els.advancedQwen37Thinking?.value ?? "false"),
      String(options.temperature ?? els.advancedQwen37Temperature?.value ?? "0.7"),
      Number(state.user?.pricingMultiplier || 1),
    ].join("|");
  }
  if (normalizedProvider === "qwen-image3") {
    return [
      normalizedProvider,
      options.qwenTier || currentQwenImage3Tier(),
      normalizeAdvancedResolution(resolution, normalizedProvider),
      normalizeVideoRatio(ratio),
      Math.max(0, Number(options.referenceImageCount ?? selectedAdvancedReferenceImages("qwen-image3").length) || 0),
      Math.max(1, Number(options.outputImageCount ?? els.advancedQwenOutputCount?.value ?? 1) || 1),
      Number(state.user?.pricingMultiplier || 1),
    ].join("|");
  }
  if (normalizedProvider === "seedream5-image") {
    return [
      normalizedProvider,
      "pro",
      normalizeAdvancedResolution(resolution, normalizedProvider),
      Math.max(0, Number(options.referenceImageCount ?? selectedAdvancedReferenceImages("seedream5-image").length) || 0),
      Number(state.user?.pricingMultiplier || 1),
    ].join("|");
  }
  if (["wan27-image-edit", "z-image-spicy-pro", "qwen-image-edit-spicy"].includes(normalizedProvider)) {
    return [
      normalizedProvider,
      normalizeAdvancedResolution(resolution, normalizedProvider),
      normalizeVideoRatio(ratio),
      Number(state.user?.pricingMultiplier || 1),
    ].join("|");
  }
  const bounds = advancedDurationBounds(normalizedProvider);
  const rawDuration = Number(duration || bounds.fallback);
  const seconds = Number.isFinite(rawDuration) ? Math.min(bounds.max, Math.max(bounds.min, rawDuration)) : bounds.fallback;
  const inputVideoSeconds = ["seedance", "seedance25", "seedance-nsfw", "wan27", "happyhorse", "h3-vega", "vega10-lite", "seedance20-vega"].includes(normalizedProvider)
    ? positiveDurationSeconds(options.inputVideoSeconds ?? options.videoInputSeconds, 0)
    : 0;
  const referenceVideoSignature = ["seedance", "seedance25", "seedance-nsfw", "h3-vega", "vega10-lite", "seedance20-vega"].includes(normalizedProvider)
    ? (Array.isArray(options.referenceVideoUrls) ? options.referenceVideoUrls : []).map((item) => String(item || "").trim()).filter(Boolean).join(",")
    : "";
  return [
    normalizedProvider,
    normalizedProvider === "seedance" ? (String(options.seedanceTier || "").trim().toLowerCase() === "fast" ? "fast" : "standard") : "",
    options.videoCapability || (typeof currentAdvancedVideoCapability === "function" ? currentAdvancedVideoCapability() : ""),
    options.mode || options.animateMode || "",
    normalizeAdvancedResolution(resolution, normalizedProvider),
    normalizeVideoRatio(ratio),
    seconds,
    inputVideoSeconds,
    referenceVideoSignature,
    options.qwenTier || "",
    Math.max(0, Number(options.referenceImageCount || 0) || 0),
    Math.max(1, Number(options.outputImageCount || 1) || 1),
    Number(state.user?.pricingMultiplier || 1),
  ].join("|");
}

function requestAdvancedEstimate(duration, provider = "seedance", resolution = "720p", ratio = "16:9", options = {}) {
  if (tenantFeature("toolOnly", false)) return;
  if (["wan27-image-edit", "z-image-spicy-pro", "qwen-image-edit-spicy"].includes(normalizeAdvancedProvider(provider))) return;
  const key = advancedEstimateKey(duration, provider, resolution, ratio, options);
  if (!state.user) return;
  const currentEstimate = state.advancedEstimate;
  const currentEstimateKey = state.advancedEstimateKey;
  const estimatePending = state.advancedEstimatePendingKey === key;
  const estimateFailedRecently = state.advancedEstimateFailureKey === key
    && Date.now() - Number(state.advancedEstimateFailureAt || 0) < 3000;
  if (estimatePending || (currentEstimateKey === key && currentEstimate?.available === true) || estimateFailedRecently) return;
  window.clearTimeout(state.advancedEstimateTimer);
  state.advancedEstimate = null;
  state.advancedEstimateKey = "";
  state.advancedEstimatePendingKey = key;
  state.advancedEstimateTimer = window.setTimeout(async () => {
    try {
      const payload = await requestJson("/api/advanced/estimate", {
        method: "POST",
        body: {
          provider,
          duration,
          resolution,
          ratio,
          inputVideoSeconds: positiveDurationSeconds(options.inputVideoSeconds ?? options.videoInputSeconds, 0),
          referenceVideoDurations: Array.isArray(options.referenceVideoDurations) ? options.referenceVideoDurations : [],
          referenceVideoUrls: Array.isArray(options.referenceVideoUrls) ? options.referenceVideoUrls : [],
          seedanceTier: options.seedanceTier,
          videoCapability: options.videoCapability,
          model: options.model,
          mode: options.mode || options.animateMode,
          seedreamTier: options.seedreamTier || options.seedream5Tier,
          qwenTier: options.qwenTier,
          inputTokens: options.inputTokens,
          outputTokens: options.outputTokens ?? options.maxTokens,
          max_tokens: options.outputTokens ?? options.maxTokens,
          outputImageCount: Math.max(1, Number(options.outputImageCount || 1) || 1),
          n: Math.max(1, Number(options.outputImageCount || 1) || 1),
          referenceImageCount: Math.max(0, Number(options.referenceImageCount || 0) || 0),
        },
      });
      const estimatedPricing = payload.pricing || null;
      if (normalizeAdvancedProvider(provider) === "wan30" && !(Number(estimatedPricing?.credits) > 0)) {
        const error = new Error("The server returned invalid Wan 3.0 pricing.");
        error.code = "MODEL_PRICING_UNAVAILABLE";
        throw error;
      }
      if (state.advancedEstimatePendingKey !== key) return;
      state.advancedEstimate = { ...(estimatedPricing || {}), available: true };
      state.advancedEstimateKey = key;
      state.advancedEstimateFailureKey = "";
      state.advancedEstimateFailureAt = 0;
      state.advancedEstimatePendingKey = "";
      updateAdvancedButtonCost();
      renderAdvancedAssetTargets();
    } catch (error) {
      if (state.advancedEstimatePendingKey !== key) return;
      state.advancedEstimate = {
        available: false,
        credits: null,
        code: error?.code || "MODEL_PRICING_UNAVAILABLE",
        message: error?.message || "Pricing is unavailable.",
      };
      state.advancedEstimateKey = "";
      state.advancedEstimateFailureKey = key;
      state.advancedEstimateFailureAt = Date.now();
      state.advancedEstimatePendingKey = "";
      updateAdvancedButtonCost();
      renderAdvancedAssetTargets();
      console.warn("advanced estimate failed", error);
    }
  }, 180);
}

function updateAdvancedButtonCost() {
  if (!els.advancedSubmitBtn || els.advancedSubmitBtn.classList.contains("is-busy")) return;
  const rawDuration = Number(els.advancedDuration?.value || 5);
  const bounds = advancedDurationBounds(currentAdvancedProvider());
  const provider = currentAdvancedProvider();
  const videoCapability = currentAdvancedVideoCapability();
  const durationMax = provider === "seedance25" && currentAdvancedResolution() === "720p" ? 29 : bounds.max;
  const configuredDuration = Number.isFinite(rawDuration) ? Math.min(durationMax, Math.max(bounds.min, rawDuration)) : bounds.fallback;
  const sourceVideoSeconds = advancedVideoEditUsesSourceDuration(videoCapability)
    ? currentAdvancedAliyunSourceVideoSeconds(0)
    : provider === "seedance-nsfw" && normalizeSeedanceMediaMode(els.advancedSeedanceMediaMode?.value || "") === "edit"
    ? currentSeedanceVideoInputSeconds(0, provider)
    : 0;
  const duration = sourceVideoSeconds > 0
    ? Math.min(bounds.max, Math.max(bounds.min, Math.ceil(sourceVideoSeconds)))
    : configuredDuration;
  const seedanceTier = currentSeedanceTier();
  if (state.advancedCreateKind === "video" && advancedCreateModeUsesAutoPrompt()) {
    els.advancedSubmitBtn.innerHTML = `<i data-lucide="sparkles"></i>${escapeHtml(t("common.generate"))}`;
    refreshIcons();
    return;
  }
  if (["wan27-image-edit", "z-image-spicy-pro", "qwen-image-edit-spicy"].includes(provider)) {
    els.advancedSubmitBtn.innerHTML = `<i data-lucide="wand-sparkles"></i>${escapeHtml(t("template.generate", { cost: advancedButtonCostLabel(duration, provider, currentAdvancedResolution(), currentAdvancedRatio()) }))}`;
    refreshIcons();
    return;
  }
  const isVegaEstimate = ["h3-vega", "vega10-lite", "seedance20-vega"].includes(provider);
  const vegaVideoItems = isVegaEstimate && typeof advancedSeedanceVideoReferences === "function"
    ? advancedSeedanceVideoReferences()
    : [];
  const vegaReferenceVideoDurations = vegaVideoItems.map((item) => positiveDurationSeconds(item?.durationSeconds || item?.duration, 0));
  const options = {
    inputVideoSeconds: ["seedance", "seedance25", "seedance-nsfw"].includes(provider)
      ? currentSeedanceVideoInputSeconds(duration, provider)
      : ["wan27", "happyhorse"].includes(provider)
      ? currentAdvancedAliyunSourceVideoSeconds(duration)
      : isVegaEstimate
      ? vegaReferenceVideoDurations.reduce((sum, seconds) => sum + seconds, 0)
      : 0,
    referenceVideoDurations: isVegaEstimate ? vegaReferenceVideoDurations : [],
    referenceVideoUrls: ["seedance", "seedance25", "seedance-nsfw", "h3-vega", "vega10-lite", "seedance20-vega"].includes(provider) ? currentSeedanceEstimateReferenceVideoUrls(provider) : [],
    seedanceTier: provider === "seedream5-image" ? currentSeedreamTier() : seedanceTier,
    qwenTier: provider === "qwen-image3" ? currentQwenImage3Tier() : undefined,
    outputImageCount: provider === "qwen-image3" ? Number(els.advancedQwenOutputCount?.value || 1) : 1,
    inputTokens: ["qwen37-flash", "byteplus-language", "papaya"].includes(provider) ? Math.max(1, Math.ceil(new TextEncoder().encode(String(els.advancedPrompt?.value || "")).length / 2) + 32) : undefined,
    outputTokens: ["qwen37-flash", "byteplus-language", "papaya"].includes(provider) ? Number(els.advancedQwen37MaxTokens?.value || 8192) : undefined,
    enableThinking: ["qwen37-flash", "byteplus-language", "papaya"].includes(provider) ? els.advancedQwen37Thinking?.value === "true" : undefined,
    temperature: ["qwen37-flash", "byteplus-language", "papaya"].includes(provider) ? Number(els.advancedQwen37Temperature?.value || 0.7) : undefined,
    referenceImageCount: ["vega10-lite", "seedance20-vega"].includes(provider)
      ? selectedAdvancedReferenceImages(provider).length
      : ["seedream5-image", "qwen-image3"].includes(provider)
      ? selectedAdvancedReferenceImages(provider).length
      : 0,
    videoCapability,
    model: videoCapability === "wan-legacy" ? String(els.advancedLegacyWanModel?.value || "") : undefined,
    mode: ["seedance25", "seedance-nsfw"].includes(provider)
      ? normalizeSeedanceMediaMode(els.advancedSeedanceMediaMode?.value || "omini")
      : ["wan-animate-move", "wan-animate-mix"].includes(videoCapability)
      ? String(els.advancedWanAnimateMode?.value || "wan-std")
      : undefined,
  };
  requestAdvancedEstimate(duration, provider, currentAdvancedResolution(), currentAdvancedRatio(), options);
  els.advancedSubmitBtn.innerHTML = `<i data-lucide="sparkles"></i>${escapeHtml(t("template.generate", { cost: advancedButtonCostLabel(duration, provider, currentAdvancedResolution(), currentAdvancedRatio(), options) }))}`;
  refreshIcons();
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

async function requestJson(url, options = {}) {
  const headers = { "content-type": "application/json", ...(options.headers || {}) };
  // Public bootstrap data is shared by all visitors. Callers must be able to
  // request the anonymous view even when localStorage already has a token.
  if (state.token && options.auth !== false) headers.authorization = `Bearer ${state.token}`;
  const response = await fetch(url, {
    method: options.method || "GET",
    headers,
    body: options.body === undefined ? undefined : typeof options.body === "string" ? options.body : JSON.stringify(options.body),
    signal: options.signal || (options.timeoutMs ? AbortSignal.timeout(options.timeoutMs) : undefined),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.ok === false) {
    if (payload.code === "SESSION_REPLACED") {
      state.token = "";
      state.user = null;
      localStorage.removeItem(TOKEN_KEY);
      window.dispatchEvent(new CustomEvent("raising-session-replaced", { detail: payload }));
    }
    const error = new Error(payload.message || payload.detail || `Request failed: ${response.status}`);
    error.statusCode = response.status;
    error.code = payload.code || "";
    error.payload = payload;
    error.details = payload.details || null;
    throw error;
  }
  return payload;
}

const WORKFLOW_CANVAS_BASE_WIDTH = 3200;
const WORKFLOW_CANVAS_BASE_HEIGHT = 720;
const WORKFLOW_CANVAS_PADDING = 140;
const WORKFLOW_CANVAS_MAX_WIDTH = 12000;
const WORKFLOW_CANVAS_MAX_HEIGHT = 3200;

function cloneWorkflowDefault() {
  return {
    nodes: WORKFLOW_DEFAULT_NODES.map((node) => ({ ...node, data: { ...(node.data || {}) } })),
    edges: WORKFLOW_DEFAULT_EDGES.map(([from, to]) => ({ from, to })),
    physics: [],
    directorPrompt: "",
    zoom: 1,
    layoutVersion: WORKFLOW_NODE_LAYOUT_VERSION,
    canvasWidth: WORKFLOW_CANVAS_BASE_WIDTH,
    canvasHeight: WORKFLOW_CANVAS_BASE_HEIGHT,
    scrollLeft: 0,
    scrollTop: 0,
  };
}

function normalizeWorkflowPreset(preset = {}) {
  const id = String(preset.id || preset.sourceId || "").trim();
  const label = String(preset.label || preset.name || id || "Workflow preset").trim();
  return {
    id: id || label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""),
    label,
    prompt: String(preset.prompt || preset.defaultPrompt || "").trim(),
    previewUrl: String(preset.previewUrl || preset.demoUrl || "").trim(),
    posterUrl: String(preset.posterUrl || "").trim(),
    category: String(preset.category || "PlayFlux").trim() || "PlayFlux",
    sourceId: String(preset.sourceId || "").trim(),
  };
}

function workflowPresetLibrary() {
  const remote = (state.workflowPresets || []).map(normalizeWorkflowPreset).filter((preset) => preset.id && preset.label);
  if (!remote.length) return WORKFLOW_MODEL_LIBRARY;
  const byId = new Map(WORKFLOW_MODEL_LIBRARY.map((preset) => [preset.id, { ...preset }]));
  remote.forEach((preset) => {
    const existing = byId.get(preset.id);
    byId.set(preset.id, existing ? { ...existing, ...preset, prompt: preset.prompt || existing.prompt } : preset);
  });
  return [...byId.values()];
}

function workflowModelById(modelId = "") {
  const library = workflowPresetLibrary();
  const normalizedModelId = WORKFLOW_MODEL_ALIASES?.[modelId] || modelId;
  return library.find((model) => model.id === normalizedModelId) || library[0] || WORKFLOW_MODEL_LIBRARY[0];
}

function workflowUserStorageKey() {
  const userId = String(state.user?.id || "").trim();
  const username = String(state.user?.username || "").trim().toLowerCase();
  const fallback = state.token ? `token:${String(state.token).slice(-16)}` : "guest";
  return `${WORKFLOW_STORAGE_KEY}:${userId || username || fallback}`;
}

function ensureWorkflowState() {
  if (state.workflow && Array.isArray(state.workflow.nodes)) {
    return state.workflow;
  }
  state.workflow = cloneWorkflowDefault();
  return state.workflow;
}

function markWorkflowCanvasLocalEdit() {
  state.workflowLocalRevision = Number(state.workflowLocalRevision || 0) + 1;
}

function persistWorkflowState({ skipServer = false } = {}) {
  markWorkflowCanvasLocalEdit();
  try {
    const workflow = ensureWorkflowState();
    localStorage.setItem(workflowUserStorageKey(), JSON.stringify({
      nodes: workflow.nodes,
      edges: workflow.edges,
      physics: workflow.physics,
      directorPrompt: workflow.directorPrompt || "",
      zoom: normalizeWorkflowZoom(workflow.zoom),
      layoutVersion: workflow.layoutVersion || WORKFLOW_NODE_LAYOUT_VERSION,
      canvasWidth: Number(workflow.canvasWidth || WORKFLOW_CANVAS_BASE_WIDTH),
      canvasHeight: Number(workflow.canvasHeight || WORKFLOW_CANVAS_BASE_HEIGHT),
      scrollLeft: Number(workflow.scrollLeft || 0),
      scrollTop: Number(workflow.scrollTop || 0),
    }));
  } catch (_) {}
  if (!skipServer && typeof scheduleWorkflowCanvasSave === "function") scheduleWorkflowCanvasSave();
}

function workflowNodeById(nodeId = "") {
  return ensureWorkflowState().nodes.find((node) => node.id === nodeId) || null;
}

window.refreshIcons = refreshIcons;
window.ensureWorkflowState = ensureWorkflowState;
window.persistWorkflowState = persistWorkflowState;
window.markWorkflowCanvasLocalEdit = markWorkflowCanvasLocalEdit;
window.workflowNodeById = workflowNodeById;

function normalizeWorkflowZoom(value = 1) {
  const numeric = Number(value || 1);
  if (!Number.isFinite(numeric)) return 1;
  return Math.max(0.55, Math.min(1.8, Math.round(numeric * 100) / 100));
}

function workflowZoom() {
  const workflow = ensureWorkflowState();
  workflow.zoom = normalizeWorkflowZoom(workflow.zoom);
  return workflow.zoom;
}

function workflowCanvasLogicalSize() {
  const canvas = els.workflowRoot?.querySelector(".workflow-canvas");
  const zoom = workflowZoom();
  const visibleWidth = canvas ? Math.ceil(canvas.clientWidth / zoom) : WORKFLOW_CANVAS_BASE_WIDTH;
  const visibleHeight = canvas ? Math.ceil(canvas.clientHeight / zoom) : WORKFLOW_CANVAS_BASE_HEIGHT;
  const nodes = state.workflow?.nodes || [];
  const storedWidth = Math.min(WORKFLOW_CANVAS_MAX_WIDTH, Math.max(WORKFLOW_CANVAS_BASE_WIDTH, Number(state.workflow?.canvasWidth || 0)));
  const storedHeight = Math.min(WORKFLOW_CANVAS_MAX_HEIGHT, Math.max(WORKFLOW_CANVAS_BASE_HEIGHT, Number(state.workflow?.canvasHeight || 0)));
  const nodeMaxX = nodes.reduce((max, node) => Math.max(max, Number(node.x || 0) + workflowNodeWidth(node) + WORKFLOW_CANVAS_PADDING), 0);
  const nodeMaxY = nodes.reduce((max, node) => Math.max(max, Number(node.y || 0) + workflowNodeHeight(node) + WORKFLOW_CANVAS_PADDING), 0);
  const size = {
    width: Math.min(WORKFLOW_CANVAS_MAX_WIDTH, Math.max(WORKFLOW_CANVAS_BASE_WIDTH, storedWidth, visibleWidth + WORKFLOW_CANVAS_PADDING, nodeMaxX)),
    height: Math.min(WORKFLOW_CANVAS_MAX_HEIGHT, Math.max(WORKFLOW_CANVAS_BASE_HEIGHT, storedHeight, visibleHeight + WORKFLOW_CANVAS_PADDING, nodeMaxY)),
  };
  if (state.workflow) {
    state.workflow.canvasWidth = size.width;
    state.workflow.canvasHeight = size.height;
  }
  return size;
}

function workflowCanvasRenderId() {
  return String(state.workflowActiveCanvasId || `local:${workflowUserStorageKey()}`);
}

function captureWorkflowCanvasViewport() {
  const workflow = ensureWorkflowState();
  const canvas = els.workflowRoot?.querySelector(".workflow-canvas");
  const renderedId = String(els.workflowRoot?.dataset.workflowCanvasId || "");
  const currentId = workflowCanvasRenderId();
  if (canvas && renderedId && renderedId === currentId) {
    return { left: canvas.scrollLeft, top: canvas.scrollTop };
  }
  return {
    left: Math.max(0, Number(workflow.scrollLeft || 0)),
    top: Math.max(0, Number(workflow.scrollTop || 0)),
  };
}

function restoreWorkflowCanvasViewport(viewport = {}) {
  const canvas = els.workflowRoot?.querySelector(".workflow-canvas");
  const workflow = ensureWorkflowState();
  const left = Math.max(0, Number(viewport.left || 0));
  const top = Math.max(0, Number(viewport.top || 0));
  if (canvas) {
    suppressWorkflowViewportSaveUntil = Date.now() + 100;
    canvas.scrollLeft = left;
    canvas.scrollTop = top;
  }
  workflow.scrollLeft = canvas?.scrollLeft ?? left;
  workflow.scrollTop = canvas?.scrollTop ?? top;
  if (els.workflowRoot) els.workflowRoot.dataset.workflowCanvasId = workflowCanvasRenderId();
}

function handleWorkflowCanvasScroll(event) {
  const canvas = event.target?.closest?.(".workflow-canvas");
  if (!canvas || event.target !== canvas) return;
  const workflow = ensureWorkflowState();
  workflow.scrollLeft = canvas.scrollLeft;
  workflow.scrollTop = canvas.scrollTop;
  if (Date.now() < suppressWorkflowViewportSaveUntil) return;
  window.clearTimeout(state.workflowViewportSaveTimer);
  state.workflowViewportSaveTimer = window.setTimeout(() => {
    state.workflowViewportSaveTimer = 0;
    persistWorkflowState();
  }, 300);
}

function workflowCanvasStageStyle() {
  const size = workflowCanvasLogicalSize();
  return `--workflow-zoom:${workflowZoom()};--workflow-stage-width:${size.width}px;--workflow-stage-height:${size.height}px`;
}

function syncWorkflowCanvasStageSize() {
  const size = workflowCanvasLogicalSize();
  const stage = els.workflowRoot?.querySelector(".workflow-canvas-stage");
  if (stage) {
    stage.style.setProperty("--workflow-stage-width", `${size.width}px`);
    stage.style.setProperty("--workflow-stage-height", `${size.height}px`);
  }
  const svg = els.workflowRoot?.querySelector(".workflow-edges");
  if (svg) svg.setAttribute("viewBox", `0 0 ${size.width} ${size.height}`);
}

function workflowVideoNodes() {
  return ensureWorkflowState().nodes
    .filter((node) => ["unifiedVideoGen", "video"].includes(node.type))
    .sort((left, right) => Number(left.x || 0) - Number(right.x || 0));
}

function workflowImageNodes() {
  return ensureWorkflowState().nodes
    .filter((node) => ["imageDisplay", "imageGenerate"].includes(node.type))
    .sort((left, right) => Number(left.x || 0) - Number(right.x || 0));
}

function workflowVideoReferenceNodes() {
  return ensureWorkflowState().nodes.filter((node) => node.type === "videoReference");
}

function workflowGenerationNodes() {
  return ensureWorkflowState().nodes
    .filter((node) => ["imageDisplay", "unifiedVideoGen", "imageGenerate", "video"].includes(node.type))
    .sort((left, right) => Number(left.x || 0) - Number(right.x || 0));
}

function workflowSourceNodes() {
  return ensureWorkflowState().nodes.filter((node) => ["imageReference", "image", "upload", "videoReference", "prompt"].includes(node.type));
}

function workflowOutputNodes() {
  return ensureWorkflowState().nodes.filter((node) => node.type === "output");
}

function workflowNodeByType(type = "") {
  return ensureWorkflowState().nodes.find((node) => node.type === type) || null;
}

function workflowOutgoingEdges(nodeId = "") {
  return ensureWorkflowState().edges.filter((edge) => edge.from === nodeId);
}

function workflowIncomingEdges(nodeId = "") {
  return ensureWorkflowState().edges.filter((edge) => edge.to === nodeId);
}

window.workflowIncomingEdges = workflowIncomingEdges;
window.workflowOutgoingEdges = workflowOutgoingEdges;

function workflowDownstreamGenerationNodes(nodeId = "") {
  const workflow = ensureWorkflowState();
  const nodeById = new Map(workflow.nodes.map((node) => [node.id, node]));
  const visited = new Set([nodeId]);
  const videos = [];
  const queue = [nodeId];
  while (queue.length && visited.size <= workflow.nodes.length + 1) {
    const currentId = queue.shift();
    workflow.edges
      .filter((edge) => edge.from === currentId)
      .map((edge) => nodeById.get(edge.to))
      .filter(Boolean)
      .sort((left, right) => Number(left.x || 0) - Number(right.x || 0))
      .forEach((node) => {
        if (visited.has(node.id)) return;
        visited.add(node.id);
        if (["imageDisplay", "imageGenerate", "unifiedVideoGen", "video"].includes(node.type)) videos.push(node);
        queue.push(node.id);
      });
  }
  return videos;
}

function workflowOrderedVideoNodes() {
  const workflow = ensureWorkflowState();
  const nodeById = new Map(workflow.nodes.map((node) => [node.id, node]));
  const graphIds = new Set(workflowGenerationNodes().map((node) => node.id));
  const incomingCounts = new Map([...graphIds].map((nodeId) => [nodeId, 0]));
  workflow.edges.forEach((edge) => {
    if (graphIds.has(edge.from) && graphIds.has(edge.to)) {
      incomingCounts.set(edge.to, (incomingCounts.get(edge.to) || 0) + 1);
    }
  });
  const orderedGraph = [];
  const ready = workflow.nodes
    .filter((node) => graphIds.has(node.id) && (incomingCounts.get(node.id) || 0) === 0)
    .sort((left, right) => Number(left.x || 0) - Number(right.x || 0));
  while (ready.length) {
    const node = ready.shift();
    if (!node || orderedGraph.some((item) => item.id === node.id)) continue;
    orderedGraph.push(node);
    workflow.edges
      .filter((edge) => edge.from === node.id && graphIds.has(edge.to))
      .forEach((edge) => {
        incomingCounts.set(edge.to, Math.max(0, (incomingCounts.get(edge.to) || 0) - 1));
        if ((incomingCounts.get(edge.to) || 0) === 0) {
          const next = nodeById.get(edge.to);
          if (next && !orderedGraph.some((item) => item.id === next.id) && !ready.some((item) => item.id === next.id)) {
            ready.push(next);
            ready.sort((left, right) => Number(left.x || 0) - Number(right.x || 0));
          }
        }
      });
  }
  const executable = orderedGraph.filter((node) => graphIds.has(node.id));
  const missing = [...graphIds]
    .map((nodeId) => nodeById.get(nodeId))
    .filter(Boolean)
    .filter((node) => !executable.some((item) => item.id === node.id))
    .sort((left, right) => Number(left.x || 0) - Number(right.x || 0));
  return [...executable, ...missing];
}

function workflowOrderedExecutableNodes() {
  return workflowOrderedVideoNodes();
}

function workflowFirstVideoNode() {
  return workflowOrderedVideoNodes()[0] || null;
}

function workflowUploadNode() {
  return workflowSourceNodes().find((node) => ["imageReference", "image", "upload"].includes(node.type)) || null;
}

function selectedWorkflowNode() {
  return workflowNodeById(state.workflowSelectedNodeId) || ensureWorkflowState().nodes[0] || null;
}

function workflowLog(message = "") {
  const text = String(message || "").trim();
  if (!text) return;
  state.workflowLogs = [{ time: new Date().toLocaleTimeString(), message: text }, ...(state.workflowLogs || [])].slice(0, 12);
  renderWorkflowPanel();
}

async function loadWorkflowPresets() {
  if (state.workflowPresetsLoaded || state.workflowPresetsLoading) return;
  state.workflowPresetsLoading = true;
  try {
    const payload = await requestJson("/api/workflow/presets");
    state.workflowPresets = (payload.presets || []).map(normalizeWorkflowPreset).filter((preset) => preset.id && preset.label);
    state.workflowPresetsLoaded = true;
  } catch (_) {
    state.workflowPresetsLoaded = true;
  } finally {
    state.workflowPresetsLoading = false;
    if (state.tab === "workflow") renderWorkflowPanel();
  }
}

function workflowNodeStatusText(node = {}) {
  return node.data?.status ? statusLabel(node.data.status) : "Ready";
}

function workflowNodeHasSuccessfulResult(node = {}) {
  const status = node.data?.status || node.data?.record?.status || "";
  const hasResult = ["imageDisplay", "imageGenerate"].includes(node.type)
    ? Boolean(workflowNodeResultImage(node))
    : Boolean(workflowNodeResultVideo(node));
  return hasResult && isSucceededGenerationStatus(status || "succeeded");
}

