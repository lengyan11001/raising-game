function renderAdvanced() {
  if (!els.advancedGate || !els.advancedWorkspace) return;
  els.advancedGate.innerHTML = "";
  els.advancedWorkspace.hidden = false;
  if (!state.user) {
    renderAdvancedCreateControls();
    renderAdvancedAssets([]);
    setAdvancedSideTab(state.advancedSideTab, { silent: true });
    // Restoring the remembered mobile tab must never override the side tab the
    // visitor picked: setAdvancedMobileTab mirrors back into the side tab by
    // default, which yanked a reader who had switched to Assets back to Result
    // every time user data refreshed (for example while a task is polling).
    setAdvancedMobileTab(state.advancedMobileTab || "create", { silent: true, skipSideTab: true });
    updateAdvancedModelControls();
    updateAdvancedButtonCost();
    refreshIcons();
    return;
  }
  renderAdvancedCreateControls();
  renderAdvancedAssets();
  setAdvancedSideTab(state.advancedSideTab, { silent: true });
  // Same guard as above: a re-render must not move the visitor back to Result.
  setAdvancedMobileTab(state.advancedMobileTab || "create", { silent: true, skipSideTab: true });
  updateAdvancedModelControls();
  updateAdvancedButtonCost();
}

function setAdvancedMobileTab(tab = "create", { silent = false, skipSideTab = false } = {}) {
  const assetsAllowed = state.advancedCreateKind === ADVANCED_CUSTOM_KIND.id;
  const next = tab === "result" || (tab === "assets" && assetsAllowed) ? tab : "create";
  state.advancedMobileTab = next;
  if (els.advancedWorkspace) els.advancedWorkspace.dataset.advancedMobileTab = next;
  els.advancedMobileTabs?.querySelectorAll("[data-advanced-mobile-tab]").forEach((button) => {
    const active = button.dataset.advancedMobileTab === next;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-selected", active ? "true" : "false");
  });
  if (!skipSideTab && (next === "assets" || next === "result")) {
    setAdvancedSideTab(next, { silent });
  }
  refreshIcons();
}

function setAdvancedSideTab(tab = "result", { silent = false, syncMobile = false } = {}) {
  const assetsAllowed = state.advancedCreateKind === ADVANCED_CUSTOM_KIND.id;
  const next = tab === "assets" && assetsAllowed ? "assets" : "result";
  state.advancedSideTab = next;
  if (els.advancedAssetsView) els.advancedAssetsView.hidden = next !== "assets";
  if (els.advancedResultView) els.advancedResultView.hidden = next !== "result";
  els.advancedSideTabs?.querySelectorAll("[data-advanced-side-tab]").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.advancedSideTab === next);
  });
  if (next === "result") {
    renderAdvancedResultPanel();
    // Only seed the result panel when no history load is already on its way:
    // loadHistory calls setUser, which re-renders this panel, so loading from
    // here without that guard reloads history in a loop.
    // Result is loaded on entry, never on a background loop. Refreshing here
    // picks up delayed R2 readiness without putting sustained load on the API.
    if (
      state.user
      && !historyLoading
      && !historyRefreshInFlight
      && !state.advancedResultRecords?.length
      && !advancedResultHistoryFallbackRecords().length
    ) {
      loadHistory({ silent: true, refresh: true, page: currentHistoryPage() });
    }
    // The server detail replaces stale cached/fallback status on entry. If
    // anything is still pending, refreshAdvancedResultRecord schedules one
    // low-frequency follow-up while the Result panel remains open.
    if (state.user) refreshAdvancedResultRecord();
  }
  if (syncMobile) setAdvancedMobileTab(next, { silent: true, skipSideTab: true });
  refreshIcons();
}

function advancedAliyunReferenceImageLimit(capability = currentAdvancedVideoCapability()) {
  if (["wan30-video", "wan30-video-pro", "wan30-video-prime", "wan30-video-prime-pro"].includes(capability)) return ADVANCED_WAN30_IMAGE_REFERENCE_LIMIT;
  if (capability === "wan27-i2v") return 2;
  if (capability === "wan27-r2v") return 5;
  if (capability === "wan27-video-edit") return 4;
  if (capability === "happyhorse-r2v") return 9;
  if (capability === "happyhorse-video-edit") return 5;
  if (capability === "wan-legacy") return 5;
  if (["wan27-t2v", "happyhorse-t2v"].includes(capability)) return 0;
  return 1;
}

function advancedAliyunUsesSharedReferenceUpload(capability = currentAdvancedVideoCapability()) {
  return [
    "wan30-video",
    "wan30-video-pro",
    "wan30-video-prime",
    "wan30-video-prime-pro",
    "wan27-i2v",
    "wan27-r2v",
    "wan27-video-edit",
    "wan-animate-move",
    "wan-animate-mix",
    "happyhorse-i2v",
    "happyhorse-r2v",
    "happyhorse-video-edit",
  ].includes(capability);
}

function advancedUsesSharedReferenceUpload(provider = currentAdvancedProvider(), capability = currentAdvancedVideoCapability()) {
  const normalizedProvider = normalizeAdvancedProvider(provider);
  return ["seedance", "seedance25", "seedance-nsfw", "wan30"].includes(normalizedProvider) || isVegaProviderId(normalizedProvider) || advancedAliyunUsesSharedReferenceUpload(capability);
}

function advancedVideoReferenceLimit(provider = currentAdvancedProvider()) {
  const normalizedProvider = normalizeAdvancedProvider(provider);
  if (normalizedProvider === "seedance-nsfw") {
    const mode = normalizeSeedanceMediaMode(els.advancedSeedanceMediaMode?.value || "omini");
    return ["edit", "extend"].includes(mode) ? 1 : mode === "omini" ? ADVANCED_SEEDANCE25_VIDEO_REFERENCE_LIMIT : 0;
  }
  if (normalizedProvider === "seedance25") {
    return normalizeSeedanceMediaMode(els.advancedSeedanceMediaMode?.value || "omini") === "omini"
      ? ADVANCED_SEEDANCE25_VIDEO_REFERENCE_LIMIT
      : 0;
  }
  if (normalizedProvider === "wan30") return ADVANCED_WAN30_VIDEO_REFERENCE_LIMIT;
  if (["wan27", "happyhorse"].includes(normalizedProvider)) return 1;
  if (isVegaProviderId(normalizedProvider)) return vegaReferenceLimits(normalizedProvider).videos;
  return ADVANCED_SEEDANCE_VIDEO_REFERENCE_LIMIT;
}

function advancedAudioReferenceLimit(provider = currentAdvancedProvider()) {
  const normalizedProvider = normalizeAdvancedProvider(provider);
  if (["seedance25", "seedance-nsfw"].includes(normalizedProvider)) {
    return normalizeSeedanceMediaMode(els.advancedSeedanceMediaMode?.value || "omini") === "omini"
      ? ADVANCED_SEEDANCE25_AUDIO_REFERENCE_LIMIT
      : 0;
  }
  if (normalizedProvider === "wan30") return ADVANCED_WAN30_AUDIO_REFERENCE_LIMIT;
  if (["wan27", "happyhorse"].includes(normalizedProvider)) return 1;
  if (isVegaProviderId(normalizedProvider)) return vegaReferenceLimits(normalizedProvider).audios;
  return ADVANCED_SEEDANCE_AUDIO_REFERENCE_LIMIT;
}

const ADVANCED_IMAGE_PROVIDERS = ["z-image-spicy-pro", "qwen-image-edit-spicy"];

function isAdvancedTextImageProvider(provider = "") {
  return normalizeAdvancedProvider(provider) === "z-image-spicy-pro";
}

function isAdvancedImageEditProvider(provider = "") {
  return normalizeAdvancedProvider(provider) === "qwen-image-edit-spicy";
}

function isAdvancedImageProvider(provider = "") {
  const normalized = normalizeAdvancedProvider(provider);
  return normalized === "z-image-spicy-pro" || normalized === "qwen-image-edit-spicy";
}

function isVegaAdvancedProvider(provider = currentAdvancedProvider()) {
  return isVegaProviderId(normalizeAdvancedProvider(provider));
}

function advancedVegaSelection(asset = {}, targetId = "primary") {
  const helper = globalThis.AdvancedVegaMedia;
  if (!helper?.selectionForAsset) {
    return { ok: false, code: "VEGA_MEDIA_HELPER_UNAVAILABLE", message: "Vega media controls are unavailable. Reload the page and try again." };
  }
  return helper.selectionForAsset({ asset, targetId });
}

function mergeAdvancedResolvedAsset(asset = {}, resolved = {}) {
  return { ...asset, ...resolved };
}

async function resolveAdvancedVegaAssets(assetIds = []) {
  const ids = uniqueAdvancedAssetIds(assetIds);
  if (!ids.length || !state.user) return new Map();
  const payload = await requestJson("/api/user-assets/resolve", {
    method: "POST",
    body: {
      assetIds: ids,
      provider: currentAdvancedProvider(),
      requirePublicUrl: true,
    },
  });
  const resolved = new Map();
  for (const asset of payload.assets || []) {
    if (!asset?.id) continue;
    resolved.set(asset.id, asset);
    state.advancedAssets = (state.advancedAssets || []).map((item) => (
      item.id === asset.id ? mergeAdvancedResolvedAsset(item, asset) : item
    ));
    state.userAssets = (state.userAssets || []).map((item) => (
      item.id === asset.id ? mergeAdvancedResolvedAsset(item, asset) : item
    ));
  }
  return resolved;
}

async function resolveAdvancedVegaAsset(asset = {}, targetId = "primary") {
  let selection = advancedVegaSelection(asset, targetId);
  if (selection.ok || selection.code !== "PUBLIC_URL_REQUIRED" || !asset?.id) return selection;
  try {
    const resolved = (await resolveAdvancedVegaAssets([asset.id])).get(asset.id);
    if (!resolved) return selection;
    selection = advancedVegaSelection(mergeAdvancedResolvedAsset(asset, resolved), targetId);
    if (selection.ok) renderAdvancedAssets();
    return selection;
  } catch (error) {
    return {
      ok: false,
      code: error.code || "VEGA_ASSET_PUBLIC_URL_UNAVAILABLE",
      message: error.message || "Vega asset public URL unavailable.",
    };
  }
}

function advancedVegaMediaMode() {
  return normalizeVegaUiMediaMode(els.advancedSeedanceMediaMode?.value || "reference_video");
}

function advancedVegaModeNeedsFrames(mode = advancedVegaMediaMode()) {
  return vegaModeNeedsFirstFrame(mode) || vegaModeNeedsLastFrame(mode);
}

function advancedVegaDraftFollowup() {
  return advancedVegaMediaMode() === "draft_followup";
}

function advancedVegaCurrentTaskType(provider = currentAdvancedProvider()) {
  const value = String(els.advancedVegaTaskType?.value || "auto").trim().toLowerCase();
  const allowed = vegaCapabilities(provider)?.taskTypes || ["auto", "reference"];
  return allowed.includes(value) ? value : "auto";
}

function advancedVegaPayloadOptions(provider = currentAdvancedProvider()) {
  if (!isVegaAdvancedProvider(provider)) return {};
  const draftTaskId = String(els.advancedVegaDraftTaskId?.value || "").trim();
  const draftFollowup = advancedVegaMediaMode() === "draft_followup";
  return {
    taskType: draftFollowup ? "auto" : advancedVegaCurrentTaskType(provider),
    draft: !draftFollowup && Boolean(els.advancedVegaDraft?.checked),
    draftTaskId: draftFollowup ? draftTaskId : "",
    assetGroupId: String(els.advancedVegaAssetGroupId?.value || "").trim(),
    generateAudio: String(els.advancedSeedanceGenerateAudio?.value || "true") !== "false",
    returnLastFrame: Boolean(els.advancedVegaReturnLastFrame?.checked),
    returnVegaUsage: Boolean(els.advancedVegaReturnUsage?.checked),
    enhancePromptMode: String(els.advancedVegaEnhancePromptMode?.value || "auto"),
    moderationMode: String(els.advancedVegaModerationMode?.value || "Moderation_L1"),
    generateMode: String(els.advancedVegaGenerateMode?.value || "Standard"),
    videoQualityMode: String(els.advancedVegaQualityMode?.value || "Standard"),
    outputFormat: String(els.advancedVegaOutputFormat?.value || "mp4"),
  };
}

function advancedVegaUploadConfig(targetId = state.advancedAssetTarget || "referenceImages") {
  const helper = globalThis.AdvancedVegaMedia;
  if (!helper?.uploadTargetConfig) return { type: "image", accept: "image/*", multiple: false };
  return helper.uploadTargetConfig(targetId);
}

function applyAdvancedVegaSelection(selection = {}, target = {}) {
  if (!selection.ok) return false;
  const ref = stampAdvancedReferenceOrder({
    ...selection.ref,
    order: nextAdvancedReferenceOrder(),
  });
  state.activeAdvancedCaseId = "";
  if (selection.action === "firstFrame") {
    state.advancedSeedanceFirstFrameAssetId = ref.assetId || "";
    state.advancedSeedanceFirstFrameDataUrl = selection.sourceUrl;
    state.advancedFirstFrameAssetId = ref.assetId || "";
    state.advancedUploadDataUrl = selection.sourceUrl;
  } else if (selection.action === "lastFrame") {
    state.advancedSeedanceLastFrameAssetId = ref.assetId || "";
    state.advancedSeedanceLastFrameDataUrl = selection.sourceUrl;
    if (els.advancedSeedanceLastFrame) els.advancedSeedanceLastFrame.value = "";
  } else if (selection.action === "referenceImage") {
    state.advancedReferenceImages = dedupeAdvancedReferenceImages([...(state.advancedReferenceImages || []), ref]);
    if (!state.advancedSeedanceFirstFrameDataUrl) state.advancedUploadDataUrl = state.advancedReferenceImages[0]?.dataUrl || "";
  } else if (selection.action === "videoReference") {
    setAdvancedSeedanceVideoReferences(dedupeAdvancedMediaReferences([...advancedSeedanceVideoReferences(), ref]));
  } else if (selection.action === "audioReference") {
    setAdvancedSeedanceAudioReferences(dedupeAdvancedMediaReferences([...advancedSeedanceAudioReferences(), ref]));
  } else {
    return false;
  }
  renderAdvancedReferencePreviews();
  updateAdvancedModelControls();
  updateAdvancedButtonCost();
  if (els.advancedAssetNote && target.label) els.advancedAssetNote.textContent = t("advanced.assetAdded", { target: target.label });
  return true;
}

function syncAdvancedVegaUploadInput() {
  if (!els.advancedImage || !isVegaAdvancedProvider()) return;
  const config = advancedVegaUploadConfig();
  els.advancedImage.accept = config.accept;
  els.advancedImage.multiple = config.multiple;
}

function advancedAssetTargetItems() {
  if (!advancedCreateModeAllowsManualReferenceUpload()) return [];
  const provider = currentAdvancedProvider();
  if (provider === "papaya") return [{ id: "referenceImages", label: t("advanced.assetTargetReferenceImages"), type: "image" }];
  if (["qwen37-flash", "byteplus-language"].includes(provider)) return [];
  const capability = currentAdvancedVideoCapability();
  const wanMode = normalizeWanMediaMode(els.advancedWanMediaMode?.value || "multimodal");
  const seedanceMode = normalizeSeedanceMediaMode(els.advancedSeedanceMediaMode?.value || "reference_video");
  const vegaMode = normalizeVegaUiMediaMode(els.advancedSeedanceMediaMode?.value || "reference_video");
  const targets = [];
  if (isVegaAdvancedProvider(provider)) {
    if (vegaMode === "text_to_video" || vegaMode === "draft_followup") return [];
    if (vegaModeNeedsFirstFrame(vegaMode)) targets.push({ id: "primary", label: t("advanced.assetTargetPrimary"), type: "image" });
    if (vegaModeNeedsLastFrame(vegaMode)) targets.push({ id: "lastFrame", label: t("advanced.assetTargetLastFrame"), type: "image" });
    if (vegaModeUsesReferences(vegaMode)) {
      targets.push({ id: "referenceImages", label: t("advanced.assetTargetReferenceImages"), type: "image" });
      targets.push({ id: "video", label: t("advanced.assetTargetVideo"), type: "video" });
      targets.push({ id: "audio", label: t("advanced.assetTargetAudio"), type: "audio" });
    }
    return targets;
  } else if (isAdvancedImageProvider(provider)) {
    targets.push({ id: "sourceImages", label: t("advanced.assetTargetSourceImages"), type: "image" });
  } else if (["seedream5-image", "qwen-image3"].includes(provider)) {
    targets.push({ id: "referenceImages", label: t("advanced.assetTargetReferenceImages"), type: "image" });
  } else if (provider === "seedance-nsfw" && ["edit", "extend"].includes(seedanceMode)) {
    targets.push({ id: "video", label: t("advanced.assetTargetVideo"), type: "video" });
  } else if (provider === "wan27" || provider === "happyhorse") {
    const legacyModel = String(els.advancedLegacyWanModel?.value || "");
    const legacyT2v = capability === "wan-legacy" && legacyModel.includes("t2v");
    const legacyR2v = capability === "wan-legacy" && legacyModel.includes("r2v");
    const legacyEdit = capability === "wan-legacy" && legacyModel.includes("vace");
    const needsPrimary = ["wan27-i2v", "wan-animate-move", "wan-animate-mix", "happyhorse-i2v"].includes(capability)
      || (capability === "wan-legacy" && !legacyT2v && !legacyR2v && !legacyEdit);
    const needsReferences = ["wan27-r2v", "wan27-video-edit", "happyhorse-r2v", "happyhorse-video-edit"].includes(capability)
      || legacyR2v || legacyEdit;
    const needsVideo = ["wan27-r2v", "wan27-video-edit", "wan-animate-move", "wan-animate-mix", "happyhorse-video-edit"].includes(capability)
      || legacyR2v || legacyEdit;
    if (needsPrimary) targets.push({ id: "primary", label: t("advanced.assetTargetPrimary"), type: "image" });
    if (needsReferences) targets.push({ id: "referenceImages", label: t("advanced.assetTargetReferenceImages"), type: "image" });
    if (needsVideo) targets.push({ id: "video", label: t("advanced.assetTargetVideo"), type: "video" });
    if (capability === "wan27-i2v") {
      targets.push({ id: "video", label: t("advanced.assetTargetVideo"), type: "video" });
      targets.push({ id: "audio", label: t("advanced.assetTargetAudio"), type: "audio" });
    } else {
      if (capability === "wan-legacy" && wanModeNeedsLastFrame(wanMode)) targets.push({ id: "lastFrame", label: t("advanced.assetTargetLastFrame"), type: "image" });
      if (capability === "wan-legacy" && wanModeNeedsAudio(wanMode)) targets.push({ id: "audio", label: t("advanced.assetTargetAudio"), type: "audio" });
    }
  } else if (seedanceModeNeedsFirstFrame(seedanceMode)) {
    targets.push({ id: "primary", label: t("advanced.assetTargetPrimary"), type: "image" });
    if (seedanceModeNeedsLastFrame(seedanceMode)) {
      targets.push({ id: "lastFrame", label: t("advanced.assetTargetLastFrame"), type: "image" });
    }
  } else {
    targets.push({ id: "referenceImages", label: t("advanced.assetTargetReferenceImages"), type: "image" });
    targets.push({ id: "video", label: t("advanced.assetTargetVideo"), type: "video" });
    targets.push({ id: "audio", label: t("advanced.assetTargetAudio"), type: "audio" });
    if (provider === "wan30") targets.push({ id: "document", label: "Document", type: "document" });
  }
  if (["wan27-t2v", "happyhorse-t2v"].includes(capability) || (capability === "wan-legacy" && String(els.advancedLegacyWanModel?.value || "").includes("t2v"))) return [];
  return targets.length ? targets : [{ id: "primary", label: t("advanced.assetTargetPrimary"), type: "image" }];
}

function activeAdvancedAssetTarget() {
  const targets = advancedAssetTargetItems();
  return targets.find((target) => target.id === state.advancedAssetTarget) || targets[0] || null;
}

function preferredAdvancedAssetTargetForAsset(asset = {}) {
  if (isVegaAdvancedProvider()) return "";
  if (currentAdvancedProvider() === "wan30" && isDocumentAsset(asset)) return "document";
  if (advancedCreateModeNeedsReplacePair()) {
    if (isImageAsset(asset)) return "primary";
  }
  if (advancedCreateModeNeedsVideoUpload()) {
    if (isVideoAsset(asset)) return "video";
  }
  return "";
}

function advancedSourceImageAssetId() {
  return state.advancedSourceImageAssetId || state.advancedFirstFrameAssetId || "";
}

function selectedAdvancedImageAsset() {
  const id = advancedSourceImageAssetId();
  if (!id) return null;
  return (state.advancedAssets || []).find((asset) => asset.id === id)
    || (state.userAssets || []).find((asset) => asset.id === id)
    || null;
}

async function ensureAdvancedImageEditAssets(inputReferences = null) {
  const references = (Array.isArray(inputReferences) ? inputReferences : selectedAdvancedReferenceImages(isAdvancedImageProvider() ? currentAdvancedProvider() : "wan27-image-edit"))
    .slice(0, advancedCreateModeUsesSingleUpload() ? 1 : ADVANCED_SEEDANCE_REFERENCE_LIMIT);
  if (!references.length) return { assets: [], imageUrls: [] };
  const resolved = [];
  const imageUrls = [];
  const nextRefs = [];
  for (const reference of references) {
    let asset = reference.assetId
      ? ((state.advancedAssets || []).find((item) => item.id === reference.assetId)
        || (state.userAssets || []).find((item) => item.id === reference.assetId)
        || null)
      : null;
    if (!asset?.id && reference.dataUrl?.startsWith("data:")) {
      const payload = await requestJson("/api/user-assets", {
        method: "POST",
        body: {
          dataUrl: reference.dataUrl,
          name: reference.name || reference.fileName || "Image edit source",
          fileName: reference.fileName || reference.name || "image.png",
        },
      });
      asset = payload.asset || null;
      if (asset?.id) {
        state.advancedAssets = [asset, ...(state.advancedAssets || []).filter((item) => item.id !== asset.id)];
        state.userAssets = [asset, ...(state.userAssets || []).filter((item) => item.id !== asset.id)];
      }
    }
    if (asset?.id && isImageAsset(asset)) {
      resolved.push(asset);
      nextRefs.push({
        assetId: asset.id,
        dataUrl: assetPreviewUrl(asset),
        fileName: asset.name || reference.fileName || "",
        name: asset.name || reference.name || "",
        fromLibrary: true,
      });
      continue;
    }
    const imageUrl = absoluteHttpUrl(reference.url || reference.imageUrl || reference.dataUrl || reference.previewUrl || "");
    if (imageUrl) {
      imageUrls.push(imageUrl);
      nextRefs.push({
        assetId: "",
        dataUrl: imageUrl,
        url: imageUrl,
        fileName: reference.fileName || "",
        name: reference.name || reference.fileName || "",
        fromLibrary: false,
      });
    }
  }
  state.advancedReferenceImages = nextRefs.slice(0, ADVANCED_SEEDANCE_REFERENCE_LIMIT);
  state.advancedSourceImageAssetId = state.advancedReferenceImages[0]?.assetId || "";
  state.advancedFirstFrameAssetId = "";
  state.advancedUploadDataUrl = state.advancedReferenceImages[0]?.dataUrl || "";
  renderAdvancedAssets();
  renderAdvancedReferencePreviews();
  return { assets: resolved, imageUrls: [...new Set(imageUrls)] };
}

function setAdvancedAssetTarget(target = "primary") {
  const targets = advancedAssetTargetItems();
  const next = targets.find((item) => item.id === target)?.id || targets[0]?.id || "";
  state.advancedAssetTarget = next;
  renderAdvancedAssetTargets();
  syncAdvancedVegaUploadInput();
}

function renderAdvancedAssetTargets() {
  if (!els.advancedAssetTargets) return;
  const targets = advancedAssetTargetItems();
  if (!targets.length) {
    state.advancedAssetTarget = "";
    els.advancedAssetTargets.innerHTML = "";
    return;
  }
  if (!targets.some((item) => item.id === state.advancedAssetTarget)) state.advancedAssetTarget = targets[0]?.id || "";
  els.advancedAssetTargets.innerHTML = `
    <span>${escapeHtml(t("advanced.assetTargets"))}</span>
    ${targets.map((target) => `
      <button class="advanced-asset-target ${state.advancedAssetTarget === target.id ? "is-active" : ""}" type="button" data-advanced-asset-target="${escapeHtml(target.id)}">
        ${escapeHtml(target.label)}
      </button>
    `).join("")}
  `;
  els.advancedAssetTargets.querySelectorAll("[data-advanced-asset-target]").forEach((button) => {
    button.addEventListener("click", () => setAdvancedAssetTarget(button.dataset.advancedAssetTarget || "primary"));
  });
}

function renderAdvancedAssets(assets) {
  if (!els.advancedAssetGrid) return;
  renderAdvancedAssetTargets();
  const canAddAssetToGeneration = advancedCreateModeAllowsManualReferenceUpload() && Boolean(activeAdvancedAssetTarget());
  const list = Array.isArray(assets)
    ? assets
    : (state.advancedAssetsLoaded ? state.advancedAssets : state.userAssets) || [];
  if (!state.user) {
    if (els.advancedAssetPager) els.advancedAssetPager.innerHTML = "";
    els.advancedAssetGrid.innerHTML = `
      <div class="advanced-asset-empty">
        <strong>${escapeHtml(t("assets.emptyTitle"))}</strong>
      </div>
    `;
    refreshIcons();
    return;
  }
  if (!list.length) {
    const emptyText = state.advancedAssetsLoaded ? t("assets.emptyTitle") : t("assets.loading");
    els.advancedAssetGrid.innerHTML = `<div class="advanced-asset-empty"><strong>${escapeHtml(emptyText)}</strong></div>`;
    if (state.advancedAssetTotal > 0) {
      renderSimplePager(els.advancedAssetPager, {
        page: state.advancedAssetPage,
        totalPages: state.advancedAssetTotalPages,
        total: state.advancedAssetTotal,
      }, loadAdvancedAssets);
    } else if (els.advancedAssetPager) {
      els.advancedAssetPager.innerHTML = "";
    }
    refreshIcons();
    return;
  }
  els.advancedAssetGrid.innerHTML = list.map((asset) => {
    const url = assetPreviewUrl(asset);
    const video = isVideoAsset(asset);
    const audio = isAudioAsset(asset);
    const document = isDocumentAsset(asset);
    const typeLabel = video ? t("assets.video") : audio ? t("assets.audio") : document ? "Document" : t("assets.image");
    return `
      <article class="advanced-asset-card">
        <div class="advanced-asset-preview ${audio ? "is-audio" : ""}" ${!audio ? `data-advanced-asset-preview="${escapeHtml(asset.id)}"` : ""}>
          ${video
            ? `<video src="${escapeHtml(url)}" muted playsinline preload="metadata"></video><span class="advanced-case-video-mark"><i data-lucide="play"></i></span>`
            : audio
              ? `<div class="audio-asset-preview"><i data-lucide="audio-lines"></i></div>`
              : document
                ? `<div class="audio-asset-preview"><i data-lucide="file-text"></i></div>`
              : `<img src="${escapeHtml(url)}" alt="${escapeHtml(asset.name || "")}" loading="lazy" />`}
        </div>
        <div class="advanced-asset-meta">
          <strong>${escapeHtml(asset.name || asset.id)}</strong>
          <span>${escapeHtml(typeLabel)}</span>
        </div>
        <div class="advanced-asset-actions">
          ${canAddAssetToGeneration ? `<button class="copy-btn" type="button" data-advanced-asset-add="${escapeHtml(asset.id)}">${escapeHtml(t("advanced.assetAdd"))}</button>` : ""}
          ${!video && !audio && !document ? `<button class="ghost-button" type="button" data-advanced-asset-modify="${escapeHtml(asset.id)}">${escapeHtml(t("assets.modify"))}</button>` : ""}
          <button class="ghost-button danger" type="button" data-advanced-asset-delete="${escapeHtml(asset.id)}">${escapeHtml(t("assets.delete"))}</button>
        </div>
      </article>
    `;
  }).join("");
  els.advancedAssetGrid.querySelectorAll("[data-advanced-asset-add]").forEach((button) => {
    button.addEventListener("click", () => addAssetToAdvancedTarget(button.dataset.advancedAssetAdd || ""));
  });
  els.advancedAssetGrid.querySelectorAll("[data-advanced-asset-modify]").forEach((button) => {
    button.addEventListener("click", () => useAssetInAdvanced(list.find((asset) => asset.id === button.dataset.advancedAssetModify), "modify"));
  });
  els.advancedAssetGrid.querySelectorAll("[data-advanced-asset-delete]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      deleteUserAsset(button.dataset.advancedAssetDelete || "", { source: "advanced", button });
    });
  });
  els.advancedAssetGrid.querySelectorAll("[data-advanced-asset-preview]").forEach((node) => {
    node.addEventListener("click", (event) => {
      if (event.target.closest("button, audio, video")) return;
      const asset = list.find((item) => item.id === node.dataset.advancedAssetPreview);
      if (!asset) return;
      const previewUrl = assetPreviewUrl(asset);
      if (isVideoAsset(asset)) {
        playPreview({ title: asset.name || asset.id, previewUrl, ratio: "16:9" });
      } else if (!isAudioAsset(asset) && !isDocumentAsset(asset)) {
        previewImage({ title: asset.name || asset.id, imageUrl: previewUrl });
      }
    });
  });
  renderSimplePager(els.advancedAssetPager, {
    page: state.advancedAssetPage,
    totalPages: state.advancedAssetTotalPages,
    total: state.advancedAssetTotal,
  }, loadAdvancedAssets);
  refreshIcons();
}

function advancedResultRecordTimestamp(record = {}) {
  const parseTime = (value) => {
    if (typeof value === "number") return Number.isFinite(value) ? value : 0;
    const parsed = Date.parse(String(value || ""));
    return Number.isFinite(parsed) ? parsed : 0;
  };
  return parseTime(record.createdAt || record.created_at)
    || parseTime(record.updatedAt || record.updated_at)
    || 0;
}

function sortAdvancedResultRecords(records = []) {
  return [...records].sort((left, right) => {
    const timeDifference = advancedResultRecordTimestamp(right) - advancedResultRecordTimestamp(left);
    if (timeDifference) return timeDifference;
    return String(right?.taskId || "").localeCompare(String(left?.taskId || ""));
  });
}

const ADVANCED_RESULT_MEDIA_FIELDS = [
  "cdnPosterUrl", "localPosterUrl", "posterUrl", "providerPosterUrl", "remotePosterUrl",
  "cdnVideoUrl", "localVideoUrl", "videoUrl", "downloadUrl", "remoteVideoUrl",
  "providerVideoUrl", "upstreamVideoUrl", "cdnImageUrl", "localImageUrl", "imageResultUrl",
  "providerImageUrl", "upstreamImageUrl", "remoteImageUrl", "cdnImageUrls", "localImageUrls",
  "imageResultUrls", "providerImageUrls", "remoteImageUrls",
];

function advancedResultRecordWithMediaFallback(previous = null, record = {}) {
  const merged = { ...(previous || {}), ...record };
  if (!previous) return merged;
  // History list snapshots can lag behind the richer detail response. Never
  // let an empty media field from the list erase a poster or video URL that
  // Result already received from the detail endpoint.
  ADVANCED_RESULT_MEDIA_FIELDS.forEach((key) => {
    const incoming = record?.[key];
    const prior = previous?.[key];
    const incomingEmpty = incoming == null
      || (typeof incoming === "string" && !incoming.trim())
      || (Array.isArray(incoming) && !incoming.length);
    if (incomingEmpty && prior) merged[key] = prior;
  });
  return merged;
}

function mergeAdvancedResultRecord(record = {}) {
  if (!record?.taskId) return;
  const existing = Array.isArray(state.advancedResultRecords) ? state.advancedResultRecords : [];
  const previous = existing.find((item) => item.taskId === record.taskId);
  // Detail responses are authoritative. Preserve fields omitted by a partial
  // update, but always take the latest server status and download readiness.
  const merged = previous ? advancedResultRecordWithMediaFallback(previous, record) : record;
  // A detail refresh must never change chronological order. Otherwise an old
  // task that happens to finish last jumps ahead of newly submitted tasks.
  state.advancedResultRecords = sortAdvancedResultRecords([
    merged,
    ...existing.filter((item) => item.taskId !== record.taskId),
  ]);
}

function advancedResultRefreshTaskIds() {
  const records = Array.isArray(state.advancedResultRecords) ? state.advancedResultRecords : [];
  const taskIds = [];
  const pushTaskId = (taskId) => {
    const id = String(taskId || "").trim();
    if (!id || id.startsWith("pending-") || taskIds.includes(id)) return;
    taskIds.push(id);
  };
  pushTaskId(state.advancedResultTaskId);
  records.forEach((record) => pushTaskId(record.taskId));
  // A cached history row can be the only record after login or page reload.
  // Refresh that row once from its detail endpoint instead of trusting stale
  // status stored in the browser.
  advancedResultHistoryFallbackRecords().forEach((record) => pushTaskId(record.taskId));
  return taskIds;
}

function syncAdvancedResultTaskId() {
  const taskIds = advancedResultRefreshTaskIds();
  state.advancedResultTaskId = taskIds[0] || "";
  return taskIds;
}

function advancedResultHistoryFallbackRecords() {
  return (Array.isArray(state.historyRecords) ? state.historyRecords : [])
    .filter((record) => (
      isPendingGenerationRecord(record)
      || isSucceededGenerationStatus(record?.status)
      || generationVideoUrl(record)
      || generationImageResultUrl(record)
      || generationPosterUrl(record)
      || record?.downloadUrl
      || record?.textResult
      || record?.responseText
    ));
}

function advancedResultKind(record = {}) {
  const provider = String(record.provider || record.params?.provider || record.model || "").toLowerCase();
  const kind = String(record.kind || record.source || "").toLowerCase();
  const createKind = String(record.params?.createKind || "").toLowerCase();
  const taskId = String(record.taskId || "");
  if (
    kind.includes("text")
    || kind.includes("language")
    || kind.includes("papaya")
    || provider.includes("papaya")
    || provider.includes("language")
    || provider.includes("qwen37")
    || taskId.startsWith("txt-")
    || record.textResult
    || record.responseText
  ) return "conversation";
  // Pending image tasks do not have an image URL yet. Classify by task metadata
  // first so they stay in the image tab from submission through completion.
  if (
    kind.includes("image")
    || createKind === "image"
    || taskId.startsWith("pending-image-")
  ) return "image";
  if (kind.includes("video") || createKind === "video" || taskId.startsWith("pending-video-")) return "video";
  if (generationVideoUrl(record)) return "video";
  if (generationImageResultUrl(record)) return "image";
  return "video";
}

function advancedResultDisplayRecords() {
  const current = Array.isArray(state.advancedResultRecords) ? state.advancedResultRecords : [];
  const history = advancedResultHistoryFallbackRecords();
  const byTaskId = new Map();
  [...current, ...history].forEach((record) => {
    const taskId = String(record?.taskId || "");
    if (!taskId) return;
    byTaskId.set(taskId, advancedResultRecordWithMediaFallback(byTaskId.get(taskId), record));
  });
  return sortAdvancedResultRecords([...byTaskId.values()]);
}

function advancedResultVisibleRecords() {
  return advancedResultDisplayRecords()
    .filter((record) => advancedResultKind(record) === (state.advancedResultMediaKind || "video"));
}

function renderAdvancedResultPanel() {
  if (!els.advancedResultList) return;
  const records = advancedResultVisibleRecords();
  els.advancedResultKindTabs?.querySelectorAll("[data-advanced-result-kind]").forEach((button) => {
    const active = button.dataset.advancedResultKind === (state.advancedResultMediaKind || "video");
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-selected", active ? "true" : "false");
  });
  if (!records.length) {
    const label = t(({ video: "advanced.createKindVideo", image: "advanced.createKindImage", conversation: "advanced.createKindConversation" })[state.advancedResultMediaKind || "video"]);
    els.advancedResultList.innerHTML = `<div class="advanced-result-empty"><strong>${escapeHtml(state.lang === "zh" ? `${label}暂无记录` : `No ${label.toLowerCase()} yet`)}</strong><p>${escapeHtml(state.lang === "zh" ? "该分类的生成结果会显示在这里。" : "Results for this type will appear here.")}</p></div>`;
    refreshIcons();
    return;
  }
  els.advancedResultList.innerHTML = records.map((record, index) => {
    const resultExpired = isGenerationResultExpired(record);
    const videoUrl = resultExpired ? "" : generationVideoUrl(record);
    const imageUrls = resultExpired ? [] : generationImageResultUrls(record);
    const imageUrl = imageUrls[0] || "";
    const textResult = String(record.textResult || record.responseText || "").trim();
    const isSucceeded = isSucceededGenerationStatus(record.status) || Boolean(videoUrl || imageUrl || textResult);
    const posterUrl = generationPosterUrl(record);
    const status = statusLabel(record.status);
    const taskId = record.taskId || "";
    const visibleTaskId = String(taskId).startsWith("pending-") ? "" : taskId;
    const ratio = record.ratio || record.params?.ratio || "16:9";
    const canDownload = !resultExpired && canDownloadGenerationRecord(record);
    const canAdvancedDownload = !resultExpired && canAdvancedDownloadGenerationRecord(record);
    const advancedDownloadState = record?.r2DownloadReady ? "ready" : "idle";
    const media = resultExpired
      ? `<div class="advanced-result-media is-placeholder is-expired"><img src="${escapeHtml(generationExpiredPlaceholderUrl())}" alt="内容已经过期" loading="lazy" decoding="async" /><span class="generation-expired-label">内容已经过期</span></div>`
      : videoUrl || posterUrl
      ? `<button class="advanced-result-media" type="button" data-advanced-result-video="${escapeHtml(String(index))}" style="${escapeHtml(ratioStyle(ratio))}">${posterUrl ? `<img src="${escapeHtml(posterUrl)}" alt="" loading="lazy" decoding="async" />` : `<span>${escapeHtml(status)}</span>`}<i data-lucide="play"></i></button>`
      : imageUrl
        ? `<div class="advanced-result-image-grid${imageUrls.length > 1 ? " is-multiple" : ""}">${imageUrls.map((url, imageIndex) => `<button class="advanced-result-media" type="button" data-advanced-result-image="${escapeHtml(`${index}:${imageIndex}`)}"><img src="${escapeHtml(url)}" alt="" loading="${index === 0 && imageIndex === 0 ? "eager" : "lazy"}" fetchpriority="${index === 0 && imageIndex === 0 ? "high" : "auto"}" decoding="async" /></button>`).join("")}</div>`
        : textResult
          ? `<div class="advanced-result-text">${escapeHtml(textResult)}</div>`
        : `<div class="advanced-result-media is-placeholder"><i data-lucide="${statusClass(record.status) === "failed" ? "circle-alert" : "loader-circle"}"></i><span>${escapeHtml(status)}</span></div>`;
    return `
      <article class="advanced-result-card is-${escapeHtml(statusClass(record.status))}">
        ${media}
        <div class="advanced-result-meta">
          <strong>${escapeHtml(publicModelText(record.templateTitle || record.sceneName || record.model || "Generation"))}</strong>
          <span>${escapeHtml(status)}${visibleTaskId ? ` - ${escapeHtml(visibleTaskId)}` : ""}</span>
          ${record.error ? `<p>${escapeHtml(record.error)}</p>` : ""}
          <div class="advanced-result-actions">
            ${textResult ? `<button class="history-download advanced-result-copy" type="button" data-advanced-result-copy="${escapeHtml(String(index))}"><i data-lucide="copy"></i>Copy</button>` : ""}
            ${canDownload ? `
              <button class="history-download advanced-result-download" type="button" data-advanced-result-download="${escapeHtml(String(index))}">
                <i data-lucide="download"></i>${escapeHtml(t("history.download"))}
              </button>
            ` : ""}
            ${videoUrl || imageUrl ? `
              <button class="history-download advanced-result-r2-download${advancedDownloadState === "ready" ? " is-ready" : ""}" type="button" data-advanced-result-r2-download="${escapeHtml(String(index))}" data-download-state="${advancedDownloadState}" ${canAdvancedDownload ? "" : "disabled"}>
                <i data-lucide="cloud-download"></i>${escapeHtml(advancedDownloadState === "ready" ? (state.lang === "zh" ? "download2 可下载" : "download2 available") : t("history.advancedDownload"))}
              </button>
            ` : ""}
            <button class="history-download advanced-result-regenerate" type="button" data-advanced-result-regenerate="${escapeHtml(String(index))}">
              <i data-lucide="refresh-cw"></i>${escapeHtml(t("history.regenerate"))}
            </button>
          </div>
        </div>
      </article>
    `;
  }).join("");
  els.advancedResultList.querySelectorAll("[data-advanced-result-video]").forEach((button) => {
    button.addEventListener("click", () => {
      const record = advancedResultVisibleRecords()[Number(button.dataset.advancedResultVideo || 0)];
      const videoUrl = generationVideoUrl(record);
      if (!videoUrl) return;
      playPreview({ title: publicModelText(record.templateTitle || record.taskId || t("common.preview")), previewUrl: videoUrl, ratio: record.ratio || "16:9" });
    });
  });
  els.advancedResultList.querySelectorAll("[data-advanced-result-image]").forEach((button) => {
    button.addEventListener("click", () => {
      const [recordIndex, imageIndex] = String(button.dataset.advancedResultImage || "0:0").split(":").map(Number);
      const record = advancedResultVisibleRecords()[recordIndex || 0];
      const imageUrl = generationImageResultUrls(record)[imageIndex || 0] || generationImageResultUrl(record);
      if (!imageUrl) return;
      previewImage({ title: publicModelText(record.templateTitle || record.taskId || t("common.preview")), imageUrl });
    });
  });
  els.advancedResultList.querySelectorAll("[data-advanced-result-copy]").forEach((button) => {
    button.addEventListener("click", async () => {
      const record = advancedResultVisibleRecords()[Number(button.dataset.advancedResultCopy || 0)];
      const textResult = String(record?.textResult || record?.responseText || "");
      if (!textResult) return;
      await navigator.clipboard.writeText(textResult);
      button.innerHTML = `<i data-lucide="check"></i>Copied`;
      refreshIcons();
    });
  });
  els.advancedResultList.querySelectorAll("[data-advanced-result-download]").forEach((button) => {
    button.addEventListener("click", () => {
      const record = advancedResultVisibleRecords()[Number(button.dataset.advancedResultDownload || 0)];
      downloadGenerationRecord(record);
    });
  });
  els.advancedResultList.querySelectorAll("[data-advanced-result-r2-download]").forEach((button) => {
    button.addEventListener("click", async () => {
      const record = advancedResultVisibleRecords()[Number(button.dataset.advancedResultR2Download || 0)];
      setAdvancedDownloadButtonState(button, "transferring");
      const ok = await downloadGenerationRecord(record, { advanced: true });
      setAdvancedDownloadButtonState(button, ok ? "ready" : "failed");
    });
  });
  els.advancedResultList.querySelectorAll("[data-advanced-result-regenerate]").forEach((button) => {
    button.addEventListener("click", () => {
      const record = advancedResultVisibleRecords()[Number(button.dataset.advancedResultRegenerate || 0)];
      button.disabled = true;
      button.innerHTML = `<i data-lucide="loader-circle"></i>${escapeHtml(t("history.regenerating"))}`;
      refreshIcons();
      restoreRecordToAdvancedCreate(record, button);
    });
  });
  refreshIcons();
}

const ADVANCED_RESULT_POLL_INTERVAL_MS = 60 * 1000;
const ADVANCED_RESULT_POSTER_RETRY_INTERVAL_MS = 8 * 1000;
const ADVANCED_RESULT_POSTER_RETRY_LIMIT = 8;

function advancedResultPendingRecords() {
  return advancedResultDisplayRecords().filter((record) => {
    const taskId = String(record?.taskId || "").trim();
    if (!taskId || taskId.startsWith("pending-")) return false;
    return isPendingGenerationRecord(record);
  });
}

function advancedResultPosterRefreshRecords() {
  return advancedResultDisplayRecords().filter((record) => {
    const taskId = String(record?.taskId || "").trim();
    if (!taskId || taskId.startsWith("pending-")) return false;
    if (!isSucceededGenerationStatus(record?.status) || generationPosterUrl(record)) return false;
    if (!generationVideoUrl(record) && record?.posterPending !== true) return false;
    return Number(state.advancedResultPosterRetryCounts?.[taskId] || 0) < ADVANCED_RESULT_POSTER_RETRY_LIMIT;
  });
}

function stopAdvancedResultRefresh() {
  if (state.advancedResultTimer) window.clearTimeout(state.advancedResultTimer);
  state.advancedResultTimer = 0;
}

function scheduleAdvancedResultRefresh() {
  stopAdvancedResultRefresh();
  if (!state.user || state.tab !== "advanced" || state.advancedSideTab !== "result") return;
  const pendingRecords = advancedResultPendingRecords();
  const posterRefreshRecords = pendingRecords.length ? [] : advancedResultPosterRefreshRecords();
  if (!pendingRecords.length && !posterRefreshRecords.length) return;
  posterRefreshRecords.forEach((record) => {
    const taskId = String(record?.taskId || "").trim();
    if (!taskId) return;
    if (!state.advancedResultPosterRetryCounts) state.advancedResultPosterRetryCounts = {};
    state.advancedResultPosterRetryCounts[taskId] = Number(state.advancedResultPosterRetryCounts[taskId] || 0) + 1;
  });
  state.advancedResultTimer = window.setTimeout(() => {
    state.advancedResultTimer = 0;
    refreshAdvancedResultRecord();
  }, pendingRecords.length ? ADVANCED_RESULT_POLL_INTERVAL_MS : ADVANCED_RESULT_POSTER_RETRY_INTERVAL_MS);
}

async function refreshAdvancedResultRecord() {
  stopAdvancedResultRefresh();
  if (!state.user) return;
  const taskIds = advancedResultRefreshTaskIds();
  if (!taskIds.length || state.advancedResultLoading || state.tab !== "advanced") return;
  state.advancedResultLoading = true;
  let rendered = false;
  let firstError = "";
  try {
    const results = await Promise.allSettled(
      taskIds.map((taskId) => requestJson(`/api/generation-records/${encodeURIComponent(taskId)}`)),
    );
    results.forEach((result) => {
      if (result.status !== "fulfilled") {
        firstError = firstError || (result.reason?.message || String(result.reason));
        return;
      }
      const payload = result.value || {};
      const record = payload.record || payload.generation || null;
      if (record?.taskId) {
        mergeAdvancedResultRecord(record);
        if (generationPosterUrl(record) && state.advancedResultPosterRetryCounts) {
          delete state.advancedResultPosterRetryCounts[record.taskId];
        }
        rendered = true;
      }
      if (payload.user) setUser(payload.user);
    });
    syncAdvancedResultTaskId();
    if (rendered) {
      state.advancedResultLastError = "";
      renderAdvancedResultPanel();
    } else if (firstError && state.advancedResultLastError !== firstError && els.advancedResultList) {
      state.advancedResultLastError = firstError;
      els.advancedResultList.insertAdjacentHTML("afterbegin", `<div class="job-note history-action-note">${escapeHtml(firstError)}</div>`);
    }
  } catch (error) {
    const message = error.message || String(error);
    if (message && state.advancedResultLastError !== message && els.advancedResultList) {
      state.advancedResultLastError = message;
      els.advancedResultList.insertAdjacentHTML("afterbegin", `<div class="job-note history-action-note">${escapeHtml(message)}</div>`);
    }
  } finally {
    state.advancedResultLoading = false;
    // Failed detail requests keep a pending record pending, so schedule the
    // next one-minute retry without creating overlapping requests.
    scheduleAdvancedResultRefresh();
  }
}

async function loadAdvancedAssets(page = state.advancedAssetPage || 1) {
  if (!els.advancedAssetGrid) return;
  if (!state.user) {
    renderAdvancedAssets([]);
    return;
  }
  if (state.userAssets?.length && !els.advancedAssetSearch?.value && !els.advancedAssetTypeFilter?.value) {
    state.advancedAssets = state.userAssets;
    state.advancedAssetsLoaded = true;
    state.advancedAssetTotal = state.userAssetsTotal || state.userAssets.length;
    state.advancedAssetTotalPages = state.userAssetsTotalPages || 1;
    renderAdvancedAssets(state.userAssets);
  }
  const params = new URLSearchParams();
  if (els.advancedAssetSearch?.value) params.set("q", els.advancedAssetSearch.value);
  if (els.advancedAssetTypeFilter?.value) params.set("type", els.advancedAssetTypeFilter.value);
  params.set("page", String(page));
  params.set("limit", String(state.advancedAssetLimit || 8));
  if (els.advancedAssetNote) els.advancedAssetNote.textContent = t("assets.loading");
  try {
    const payload = await requestJson(`/api/user-assets?${params.toString()}`);
    state.advancedAssets = payload.assets || [];
    state.userAssets = payload.assets || [];
    state.userAssetsPage = payload.page || page;
    state.userAssetsLimit = payload.limit || state.userAssetsLimit || 8;
    state.userAssetsTotal = payload.total || 0;
    state.userAssetsTotalPages = payload.totalPages || 1;
    state.advancedAssetsLoaded = true;
    state.advancedAssetPage = payload.page || page;
    state.advancedAssetLimit = payload.limit || state.advancedAssetLimit || 8;
    state.advancedAssetTotal = payload.total || 0;
    state.advancedAssetTotalPages = payload.totalPages || 1;
    if (els.advancedAssetNote) els.advancedAssetNote.textContent = "";
    renderAdvancedAssets();
  } catch (error) {
    state.advancedAssetsLoaded = true;
    if (els.advancedAssetNote) els.advancedAssetNote.textContent = t("assets.loadFailed", { message: error.message || String(error) });
    els.advancedAssetGrid.innerHTML = `<div class="advanced-asset-empty"><strong>${escapeHtml(t("assets.loadFailed", { message: error.message || String(error) }))}</strong></div>`;
  }
}

async function uploadAdvancedAssets(files = []) {
  if (!state.user) return openLogin();
  const selected = Array.from(files || []);
  if (!selected.length) return;
  if (els.advancedAssetNote) els.advancedAssetNote.textContent = t("assets.uploading");
  let uploaded = 0;
  try {
    for (const file of selected) {
      const dataUrl = await readFileAsDataUrl(file);
      const durationSeconds = uploadedFileMime(file).startsWith("video/") || uploadedFileMime(file).startsWith("audio/")
        ? await readMediaDuration(file).catch(() => 0)
        : 0;
      await requestJson("/api/user-assets", {
        method: "POST",
        body: {
          dataUrl,
          name: file.name || "Upload",
          fileName: file.name || "",
          durationSeconds,
          provider: isWan30DocumentFile(file) ? "wan30" : undefined,
        },
      });
      uploaded += 1;
    }
    if (els.advancedAssetNote) els.advancedAssetNote.textContent = t("assets.uploaded", { count: uploaded });
    await loadAdvancedAssets(1);
    if (state.tab === "assets") await loadUserAssets(1);
  } catch (error) {
    if (els.advancedAssetNote) els.advancedAssetNote.textContent = t("assets.uploadFailed", { message: error.message || String(error) });
  } finally {
    if (els.advancedAssetUploadInput) els.advancedAssetUploadInput.value = "";
    updateFilePickerLabel(els.advancedAssetUploadInput);
  }
}

async function uploadAdvancedVideoReference(file) {
  if (!state.user) {
    openLogin();
    return null;
  }
  if (!file) return null;
  if (!uploadedFileMime(file).startsWith("video/")) {
    if (els.advancedNote) els.advancedNote.textContent = t("advanced.seedanceVideoRequired");
    return null;
  }
  if (file.size > ADVANCED_WAN_CLIP_MAX_BYTES) {
    if (els.advancedNote) els.advancedNote.textContent = t("advanced.clipTooLarge");
    return null;
  }
  const pending = addAdvancedPendingReference("video", file);
  try {
    const durationSeconds = await readVideoDuration(file).catch(() => 0);
    const payload = await requestJson("/api/user-assets", {
      method: "POST",
      body: {
        dataUrl: await readFileAsDataUrl(file),
        name: file.name || "Video reference",
        fileName: file.name || "",
        durationSeconds,
      },
    });
    const asset = payload.asset || null;
    if (!asset?.id || !isVideoAsset(asset)) throw new Error(t("assets.uploadFailed", { message: "Invalid video asset" }));
    state.advancedAssets = [asset, ...(state.advancedAssets || []).filter((item) => item.id !== asset.id)];
    state.userAssets = [asset, ...(state.userAssets || []).filter((item) => item.id !== asset.id)];
    if (els.advancedSeedanceMediaMode) els.advancedSeedanceMediaMode.value = "reference_video";
    removeAdvancedPendingReference(pending.pendingId, { render: false });
    addAdvancedSeedanceMediaReference(asset, "video", { order: pending.order });
    if (advancedCreateModeNeedsReplacePair()) state.advancedAssetTarget = "primary";
    if (els.advancedNote) els.advancedNote.textContent = "";
    renderAdvancedAssets();
    updateAdvancedModelControls();
    updateAdvancedButtonCost();
    return asset;
  } catch (error) {
    removeAdvancedPendingReference(pending.pendingId);
    throw error;
  }
}

function advancedSeedanceVideoReferences() {
  const refs = Array.isArray(state.advancedSeedanceVideoReferences) ? [...state.advancedSeedanceVideoReferences] : [];
  const legacyAssetId = state.advancedSeedanceVideoAssetId || state.advancedWanClipAssetId || "";
  const legacyUrl = state.advancedSeedanceVideoPreviewUrl || state.advancedWanClipDataUrl || String(els.advancedWanClipUrl?.value || "").trim();
  if (legacyAssetId || legacyUrl) {
    const legacy = {
      assetId: legacyAssetId,
      url: legacyUrl,
      previewUrl: legacyUrl,
      name: state.advancedWanClipFileName || "Video reference",
      fileName: state.advancedWanClipFileName || "",
      durationSeconds: state.advancedWanClipDurationSeconds || 0,
      order: state.advancedWanClipOrder || 0,
    };
    if (!refs.some((item) => item.assetId === legacy.assetId && item.url === legacy.url)) refs.unshift(legacy);
  }
  return refs.filter((item) => item && (item.assetId || item.url || item.previewUrl)).slice(0, advancedVideoReferenceLimit());
}

async function uploadAdvancedImageReference(file, { provider = currentAdvancedProvider(), order = 0 } = {}) {
  if (!state.user) {
    openLogin();
    return null;
  }
  if (!file) return null;
  if (!uploadedFileMime(file).startsWith("image/")) {
    if (els.advancedNote) els.advancedNote.textContent = t("advanced.seedanceFirstRequired");
    return null;
  }

  const pending = addAdvancedPendingReference("image", file, { provider, order });
  try {
    const payload = await requestJson("/api/user-assets", {
      method: "POST",
      body: {
        dataUrl: await readFileAsDataUrl(file),
        name: file.name || "Image reference",
        fileName: file.name || "",
        provider,
      },
    });
    const asset = payload.asset || null;
    if (!asset?.id || !isImageAsset(asset)) {
      throw new Error(t("assets.uploadFailed", { message: "Invalid image asset" }));
    }
    state.advancedAssets = [asset, ...(state.advancedAssets || []).filter((item) => item.id !== asset.id)];
    state.userAssets = [asset, ...(state.userAssets || []).filter((item) => item.id !== asset.id)];
    removeAdvancedPendingReference(pending.pendingId, { render: false });
    renderAdvancedAssets();
    const sourceUrl = assetPreviewUrl(asset);
    return stampAdvancedReferenceOrder({
      assetId: asset.id,
      dataUrl: sourceUrl,
      url: sourceUrl,
      publicUrl: asset.publicUrl || asset.cdnUrl || sourceUrl,
      cdnUrl: asset.cdnUrl || "",
      fileName: file.name || asset.name || "",
      name: file.name || asset.name || "",
      fromLibrary: true,
      order: pending.order,
    });
  } catch (error) {
    removeAdvancedPendingReference(pending.pendingId);
    throw error;
  }
}

function setAdvancedSeedanceVideoReferences(refs = []) {
  const next = refs.filter((item) => item && (item.assetId || item.url || item.previewUrl)).slice(0, advancedVideoReferenceLimit());
  state.advancedSeedanceVideoReferences = next;
  state.advancedSeedanceVideoAssetId = next[0]?.assetId || "";
  state.advancedSeedanceVideoPreviewUrl = next[0]?.previewUrl || next[0]?.url || "";
  state.advancedWanClipAssetId = next[0]?.assetId || "";
  state.advancedWanClipDataUrl = next[0]?.assetId ? "" : (next[0]?.url || next[0]?.previewUrl || "");
  state.advancedWanClipFileName = next[0]?.fileName || next[0]?.name || "";
  state.advancedWanClipDurationSeconds = Number(next[0]?.durationSeconds || next[0]?.duration || 0) || 0;
  state.advancedWanClipOrder = advancedReferenceOrderValue(next[0]);
}

function advancedSeedanceAudioReferences() {
  const refs = Array.isArray(state.advancedSeedanceAudioReferences) ? [...state.advancedSeedanceAudioReferences] : [];
  if (state.advancedAudioAssetId) {
    const legacy = {
      assetId: state.advancedAudioAssetId || "",
      name: "Audio reference",
    };
    if (!refs.some((item) => item.assetId === legacy.assetId)) refs.unshift(legacy);
  }
  return refs.filter((item) => item && (item.assetId || item.url || item.previewUrl)).slice(0, advancedAudioReferenceLimit());
}

function setAdvancedSeedanceAudioReferences(refs = []) {
  const next = refs.filter((item) => item && (item.assetId || item.url || item.previewUrl)).slice(0, advancedAudioReferenceLimit());
  state.advancedSeedanceAudioReferences = next;
  state.advancedAudioAssetId = next[0]?.assetId || "";
  state.advancedAudioPreviewUrl = next[0]?.previewUrl || next[0]?.url || "";
  state.advancedAudioFileName = next[0]?.fileName || next[0]?.name || "";
  state.advancedAudioOrder = advancedReferenceOrderValue(next[0]);
}

function uniqueAdvancedAssetIds(assetIds = []) {
  return [...new Set((assetIds || []).map((id) => String(id || "").trim()).filter(Boolean))];
}

async function resolveMissingAdvancedAssetIds(assetIds = []) {
  const ids = uniqueAdvancedAssetIds(assetIds);
  if (!ids.length || !state.user) return [];
  try {
    const payload = await requestJson("/api/user-assets/resolve", {
      method: "POST",
      body: { assetIds: ids },
    });
    if (Array.isArray(payload.missingAssetIds)) return uniqueAdvancedAssetIds(payload.missingAssetIds);
    const foundIds = new Set((payload.assets || []).map((asset) => String(asset.id || "")));
    return ids.filter((id) => !foundIds.has(id));
  } catch (error) {
    return [];
  }
}

function advancedMissingAssetMessage(assetIds = []) {
  const count = uniqueAdvancedAssetIds(assetIds).length;
  return count > 1
    ? t("advanced.referencesMissing", { count }, "Some selected references were deleted or are no longer available. Please reselect them.")
    : t("advanced.referenceMissing", {}, "The selected reference was deleted or is no longer available. Please reselect it.");
}

async function guardAdvancedSubmitAssets(assetIds = []) {
  const missingAssetIds = await resolveMissingAdvancedAssetIds(assetIds);
  if (!missingAssetIds.length) return true;
  missingAssetIds.forEach((assetId) => clearDeletedAdvancedAssetReference(assetId));
  if (els.advancedNote) els.advancedNote.textContent = advancedMissingAssetMessage(missingAssetIds);
  setAdvancedSideTab("assets", { syncMobile: true });
  updateAdvancedButtonCost();
  return false;
}

function advancedMissingAssetIdsFromError(error = {}) {
  const payload = error.payload || {};
  return uniqueAdvancedAssetIds([
    payload.assetId,
    ...(Array.isArray(payload.missingAssetIds) ? payload.missingAssetIds : []),
    payload.details?.assetId,
  ]);
}

function isAdvancedReferenceMissingError(error = {}) {
  const code = String(error.code || error.payload?.code || "").toUpperCase();
  const message = String(error.message || "");
  return code.includes("REFERENCE_") && code.includes("_NOT_FOUND")
    || (Number(error.statusCode || 0) === 404 && /Reference (image|video|audio).*not found/i.test(message));
}

function handleAdvancedReferenceMissingError(error = {}, pendingTaskId = "") {
  if (!isAdvancedReferenceMissingError(error)) return false;
  const missingAssetIds = advancedMissingAssetIdsFromError(error);
  missingAssetIds.forEach((assetId) => clearDeletedAdvancedAssetReference(assetId));
  if (pendingTaskId) {
    state.advancedResultRecords = (state.advancedResultRecords || []).filter((record) => record.taskId !== pendingTaskId);
    if (state.advancedResultTaskId === pendingTaskId) state.advancedResultTaskId = "";
    renderAdvancedResultPanel();
  }
  if (els.advancedNote) els.advancedNote.textContent = missingAssetIds.length ? advancedMissingAssetMessage(missingAssetIds) : (error.message || String(error));
  setAdvancedSideTab("assets", { syncMobile: true });
  updateAdvancedButtonCost();
  return true;
}

function syncSeedanceReferenceMode() {
  if (currentAdvancedProvider() === "seedance" && els.advancedSeedanceMediaMode && !seedanceModeNeedsFirstFrame(els.advancedSeedanceMediaMode.value)) {
    els.advancedSeedanceMediaMode.value = "reference_video";
  }
}

function advancedReferenceOrderValue(item = {}, fallback = 0) {
  const value = Number(item.order ?? item.referenceOrder ?? item.createdOrder ?? 0);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

