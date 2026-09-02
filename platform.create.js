function renderAdvanced() {
  if (!els.advancedGate || !els.advancedWorkspace) return;
  els.advancedGate.innerHTML = "";
  els.advancedWorkspace.hidden = false;
  if (!state.user) {
    renderAdvancedCreateControls();
    renderAdvancedAssets([]);
    setAdvancedSideTab(state.advancedSideTab, { silent: true });
    setAdvancedMobileTab(state.advancedMobileTab || "create", { silent: true });
    updateAdvancedModelControls();
    updateAdvancedButtonCost();
    refreshIcons();
    return;
  }
  renderAdvancedCreateControls();
  renderAdvancedAssets();
  setAdvancedSideTab(state.advancedSideTab, { silent: true });
  setAdvancedMobileTab(state.advancedMobileTab || "create", { silent: true });
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
    if (state.user && !state.advancedResultRecords?.length && !advancedResultHistoryFallbackRecords().length) {
      loadHistory({ silent: true, refresh: true, page: 1 });
    }
    const current = state.advancedResultRecords.find((record) => record.taskId === state.advancedResultTaskId);
    if (state.advancedResultTaskId && (!current || !isTerminalGenerationStatus(current.status))) {
      scheduleAdvancedResultRefresh({ delayMs: silent ? 1200 : 0, force: true });
    }
  }
  if (syncMobile) setAdvancedMobileTab(next, { silent: true, skipSideTab: true });
  refreshIcons();
}

function advancedAliyunReferenceImageLimit(capability = currentAdvancedVideoCapability()) {
  if (["wan30-video", "wan30-video-prime"].includes(capability)) return ADVANCED_WAN30_IMAGE_REFERENCE_LIMIT;
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
    "wan30-video-prime",
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
  return ["seedance", "seedance25", "seedance-nsfw", "wan30"].includes(normalizedProvider) || advancedAliyunUsesSharedReferenceUpload(capability);
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
  return ADVANCED_SEEDANCE_AUDIO_REFERENCE_LIMIT;
}

function advancedAssetTargetItems() {
  if (!advancedCreateModeAllowsManualReferenceUpload()) return [];
  const provider = currentAdvancedProvider();
  if (["qwen37-flash", "byteplus-language"].includes(provider)) return [];
  const capability = currentAdvancedVideoCapability();
  const wanMode = normalizeWanMediaMode(els.advancedWanMediaMode?.value || "multimodal");
  const seedanceMode = normalizeSeedanceMediaMode(els.advancedSeedanceMediaMode?.value || "reference_video");
  const targets = [];
  if (provider === "wan27-image-edit") {
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
  const references = (Array.isArray(inputReferences) ? inputReferences : selectedAdvancedReferenceImages("wan27-image-edit"))
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

function mergeAdvancedResultRecord(record = {}) {
  if (!record?.taskId) return;
  const existing = Array.isArray(state.advancedResultRecords) ? state.advancedResultRecords : [];
  state.advancedResultRecords = [record, ...existing.filter((item) => item.taskId !== record.taskId)].slice(0, 6);
}

function advancedResultPendingTaskIds() {
  const records = Array.isArray(state.advancedResultRecords) ? state.advancedResultRecords : [];
  const recordById = new Map(records.map((record) => [String(record.taskId || ""), record]));
  const taskIds = [];
  const pushTaskId = (taskId, record = null) => {
    const id = String(taskId || "").trim();
    if (!id || id.startsWith("pending-") || taskIds.includes(id)) return;
    const current = record || recordById.get(id);
    if (current && isTerminalGenerationStatus(current.status)) return;
    taskIds.push(id);
  };
  pushTaskId(state.advancedResultTaskId);
  records.forEach((record) => {
    if (!isTerminalGenerationStatus(record.status)) pushTaskId(record.taskId, record);
  });
  return taskIds.slice(0, 6);
}

function syncAdvancedResultTaskId() {
  const pendingTaskIds = advancedResultPendingTaskIds();
  state.advancedResultTaskId = pendingTaskIds[0] || "";
  return pendingTaskIds;
}

function advancedResultHistoryFallbackRecords() {
  return (Array.isArray(state.historyRecords) ? state.historyRecords : [])
    .filter((record) => generationVideoUrl(record) || generationImageResultUrl(record) || record?.downloadUrl || record?.textResult || record?.responseText)
    .slice(0, 1);
}

function advancedResultVisibleRecords() {
  const current = Array.isArray(state.advancedResultRecords) ? state.advancedResultRecords : [];
  return current.length ? current : advancedResultHistoryFallbackRecords();
}

function renderAdvancedResultPanel() {
  if (!els.advancedResultList) return;
  const records = advancedResultVisibleRecords();
  if (!records.length) {
    els.advancedResultList.innerHTML = `<div class="advanced-result-empty"><strong>No generation yet</strong><p>Click Generate to track progress here.</p></div>`;
    refreshIcons();
    return;
  }
  els.advancedResultList.innerHTML = records.map((record, index) => {
    const videoUrl = generationVideoUrl(record);
    const imageUrls = generationImageResultUrls(record);
    const imageUrl = imageUrls[0] || "";
    const textResult = String(record.textResult || record.responseText || "").trim();
    const isSucceeded = isSucceededGenerationStatus(record.status) || Boolean(videoUrl || imageUrl || textResult);
    const posterUrl = videoUrl || imageUrl ? generationPosterUrl(record) : "";
    const status = statusLabel(record.status);
    const taskId = record.taskId || "";
    const visibleTaskId = String(taskId).startsWith("pending-") ? "" : taskId;
    const ratio = record.ratio || record.params?.ratio || "16:9";
    const canDownload = canDownloadGenerationRecord(record);
    const media = videoUrl
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

function stopAdvancedResultRefresh() {
  if (state.advancedResultTimer) window.clearTimeout(state.advancedResultTimer);
  state.advancedResultTimer = 0;
}

function scheduleAdvancedResultRefresh({ delayMs = 5000, force = false } = {}) {
  if (state.tab !== "advanced") return;
  if (!advancedResultPendingTaskIds().length) return;
  if (state.advancedResultTimer && !force) return;
  stopAdvancedResultRefresh();
  state.advancedResultTimer = window.setTimeout(() => {
    state.advancedResultTimer = 0;
    refreshAdvancedResultRecord();
  }, delayMs);
}

async function refreshAdvancedResultRecord() {
  const taskIds = advancedResultPendingTaskIds();
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
    if (advancedResultPendingTaskIds().length) scheduleAdvancedResultRefresh({ delayMs: 5000, force: true });
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
      const durationSeconds = file.type.startsWith("video/") || file.type.startsWith("audio/")
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
  if (!String(file.type || "").startsWith("video/")) {
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
    return stampAdvancedReferenceOrder({
      assetId: asset.id,
      dataUrl: assetPreviewUrl(asset),
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

function nextAdvancedReferenceOrder() {
  const imageOrders = (Array.isArray(state.advancedReferenceImages) ? state.advancedReferenceImages : [])
    .map((item, index) => advancedReferenceOrderValue(item, index + 1));
  const videoOrders = advancedSeedanceVideoReferences()
    .map((item, index) => advancedReferenceOrderValue(item, index + 1));
  const audioOrders = advancedSeedanceAudioReferences()
    .map((item, index) => advancedReferenceOrderValue(item, index + 1));
  const current = Math.max(Number(state.advancedReferenceOrderCounter || 0), 0, ...imageOrders, ...videoOrders, ...audioOrders);
  state.advancedReferenceOrderCounter = current + 1;
  return state.advancedReferenceOrderCounter;
}

function advancedPendingReferences(provider = currentAdvancedProvider()) {
  const normalizedProvider = normalizeAdvancedProvider(provider);
  return (Array.isArray(state.advancedPendingReferences) ? state.advancedPendingReferences : [])
    .filter((item) => item && (!item.provider || item.provider === normalizedProvider));
}

function addAdvancedPendingReference(kind = "image", file = {}, options = {}) {
  const previewUrl = typeof Blob !== "undefined" && file instanceof Blob && typeof URL !== "undefined"
    ? URL.createObjectURL(file)
    : "";
  const ref = {
    pendingId: `pending-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    provider: normalizeAdvancedProvider(options.provider || currentAdvancedProvider()),
    kind,
    isPending: true,
    name: file?.name || options.name || (kind === "audio" ? "Audio reference" : kind === "video" ? "Video reference" : "Image reference"),
    fileName: file?.name || options.fileName || "",
    previewUrl,
    order: options.order || nextAdvancedReferenceOrder(),
  };
  state.advancedPendingReferences = [...(state.advancedPendingReferences || []), ref];
  renderAdvancedReferencePreviews();
  refreshIcons();
  return ref;
}

function removeAdvancedPendingReference(pendingId = "", { render = true } = {}) {
  if (!pendingId) return;
  const removed = (state.advancedPendingReferences || []).find((item) => item?.pendingId === pendingId);
  if (removed?.previewUrl?.startsWith("blob:") && typeof URL !== "undefined") URL.revokeObjectURL(removed.previewUrl);
  state.advancedPendingReferences = (state.advancedPendingReferences || []).filter((item) => item?.pendingId !== pendingId);
  if (render) {
    renderAdvancedReferencePreviews();
    refreshIcons();
  }
}

function stampAdvancedReferenceOrder(ref = {}) {
  return {
    ...ref,
    order: advancedReferenceOrderValue(ref) || nextAdvancedReferenceOrder(),
  };
}

async function readMediaDuration(file) {
  if (!file) return 0;
  const tag = uploadedFileMime(file).startsWith("audio/") ? "audio" : "video";
  const media = document.createElement(tag);
  const url = URL.createObjectURL(file);
  return await new Promise((resolve) => {
    const cleanup = () => {
      URL.revokeObjectURL(url);
      media.removeAttribute("src");
      media.load?.();
    };
    media.preload = "metadata";
    media.onloadedmetadata = () => {
      const duration = Number(media.duration || 0);
      cleanup();
      resolve(Number.isFinite(duration) ? duration : 0);
    };
    media.onerror = () => {
      cleanup();
      resolve(0);
    };
    media.src = url;
  });
}

async function uploadAdvancedMediaReference(file, kind = "video") {
  if (!state.user) {
    openLogin();
    return null;
  }
  if (!file) return null;
  const mime = String(file.type || "").toLowerCase();
  const provider = currentAdvancedProvider();
  const wan30 = normalizeAdvancedProvider(provider) === "wan30";
  const expectedPrefix = kind === "audio" ? "audio/" : "video/";
  if (!mime.startsWith(expectedPrefix)) {
    if (els.advancedNote) els.advancedNote.textContent = kind === "audio" ? t("advanced.seedanceAudioRequired", {}, "Reference audio is required.") : t("advanced.seedanceVideoRequired");
    return null;
  }
  const maxBytes = wan30
    ? (kind === "audio" ? ADVANCED_WAN30_AUDIO_MAX_BYTES : ADVANCED_WAN30_VIDEO_MAX_BYTES)
    : ADVANCED_WAN_CLIP_MAX_BYTES;
  if (file.size > maxBytes || (wan30 && file.size === maxBytes)) {
    if (els.advancedNote) els.advancedNote.textContent = t("advanced.clipTooLarge");
    return null;
  }
  if (wan30) {
    const supported = kind === "audio"
      ? new Set(["audio/mpeg", "audio/mp3", "audio/wav", "audio/x-wav"])
      : new Set(["video/mp4", "video/quicktime"]);
    if (!supported.has(mime)) {
      if (els.advancedNote) els.advancedNote.textContent = kind === "audio" ? "Wan 3.0 audio must be WAV or MP3." : "Wan 3.0 video must be MP4 or MOV.";
      return null;
    }
  }
  const durationSeconds = await readMediaDuration(file);
  if (kind === "video") {
    const durationMessage = advancedVideoInputDurationMessage(durationSeconds, currentAdvancedProvider(), currentAdvancedVideoCapability());
    if (durationMessage) {
      if (els.advancedNote) els.advancedNote.textContent = durationMessage;
      return null;
    }
  }
  if (wan30) {
    if (durationSeconds < 1 || durationSeconds > 15) {
      if (els.advancedNote) els.advancedNote.textContent = `Wan 3.0 ${kind} duration must be between 1 and 15 seconds.`;
      return null;
    }
    const existing = kind === "audio" ? advancedSeedanceAudioReferences() : advancedSeedanceVideoReferences();
    const totalSeconds = existing.reduce((sum, item) => sum + positiveDurationSeconds(item.durationSeconds || item.duration), 0) + durationSeconds;
    if (totalSeconds > 15) {
      if (els.advancedNote) els.advancedNote.textContent = `Wan 3.0 reference ${kind}s must total 15 seconds or less.`;
      return null;
    }
  }
  const pending = addAdvancedPendingReference(kind, file);
  try {
    const payload = await requestJson("/api/user-assets", {
      method: "POST",
      body: {
        dataUrl: await readFileAsDataUrl(file),
        name: file.name || (kind === "audio" ? "Audio reference" : "Video reference"),
        fileName: file.name || "",
        durationSeconds,
        provider: wan30 ? "wan30" : provider,
      },
    });
    const asset = payload.asset || null;
    if (!asset?.id || (kind === "audio" ? !isAudioAsset(asset) : !isVideoAsset(asset))) {
      throw new Error(t("assets.uploadFailed", { message: `Invalid ${kind} asset` }));
    }
    state.advancedAssets = [asset, ...(state.advancedAssets || []).filter((item) => item.id !== asset.id)];
    state.userAssets = [asset, ...(state.userAssets || []).filter((item) => item.id !== asset.id)];
    removeAdvancedPendingReference(pending.pendingId, { render: false });
    addAdvancedSeedanceMediaReference(asset, kind, { order: pending.order });
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

async function uploadAdvancedWanAudioReference(file) {
  if (!state.user) {
    openLogin();
    return null;
  }
  if (!file) return null;
  if (!String(file.type || "").toLowerCase().startsWith("audio/")) {
    if (els.advancedNote) els.advancedNote.textContent = t("advanced.seedanceAudioRequired", {}, "Reference audio is required.");
    return null;
  }
  if (file.size > ADVANCED_WAN_CLIP_MAX_BYTES) {
    if (els.advancedNote) els.advancedNote.textContent = t("advanced.clipTooLarge");
    return null;
  }
  const pending = addAdvancedPendingReference("audio", file);
  try {
    const durationSeconds = await readMediaDuration(file);
    const payload = await requestJson("/api/user-assets", {
      method: "POST",
      body: {
        dataUrl: await readFileAsDataUrl(file),
        name: file.name || "Driving audio",
        fileName: file.name || "",
        durationSeconds,
      },
    });
    const asset = payload.asset || null;
    if (!asset?.id || !isAudioAsset(asset)) throw new Error(t("assets.uploadFailed", { message: "Invalid audio asset" }));
    state.advancedAssets = [asset, ...(state.advancedAssets || []).filter((item) => item.id !== asset.id)];
    state.userAssets = [asset, ...(state.userAssets || []).filter((item) => item.id !== asset.id)];
    removeAdvancedPendingReference(pending.pendingId, { render: false });
    state.advancedAudioAssetId = asset.id;
    state.advancedAudioPreviewUrl = assetPreviewUrl(asset);
    state.advancedAudioFileName = asset.fileName || asset.name || file.name || "";
    state.advancedAudioOrder = pending.order || nextAdvancedReferenceOrder();
    if (els.advancedWanAudioUrl) els.advancedWanAudioUrl.value = "";
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

function addAdvancedSeedanceMediaReference(asset = {}, kind = "video", options = {}) {
  const ref = {
    assetId: asset.id || asset.assetId || "",
    url: assetPreviewUrl(asset),
    previewUrl: assetPreviewUrl(asset),
    name: asset.name || asset.fileName || (kind === "audio" ? "Audio reference" : "Video reference"),
    fileName: asset.fileName || asset.name || "",
    durationSeconds: asset.durationSeconds || asset.duration || 0,
    fromLibrary: true,
    order: options.order || 0,
  };
  const orderedRef = stampAdvancedReferenceOrder(ref);
  if (kind === "audio") {
    setAdvancedSeedanceAudioReferences(dedupeAdvancedMediaReferences([...advancedSeedanceAudioReferences(), orderedRef]).slice(0, advancedAudioReferenceLimit()));
  } else {
    setAdvancedSeedanceVideoReferences(dedupeAdvancedMediaReferences([...advancedSeedanceVideoReferences(), orderedRef]).slice(0, advancedVideoReferenceLimit()));
  }
  syncSeedanceReferenceMode();
}

function dedupeAdvancedMediaReferences(refs = []) {
  const seen = new Set();
  return refs.filter((item) => {
    const key = item?.assetId ? `asset:${item.assetId}` : item?.url ? `url:${item.url}` : item?.previewUrl ? `preview:${item.previewUrl}` : "";
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function removeAdvancedSeedanceMediaReference(kind = "video", index = -1) {
  const previousPromptRefs = advancedPromptMentionSnapshot();
  if (kind === "audio") {
    const refs = advancedSeedanceAudioReferences();
    refs.splice(index, 1);
    setAdvancedSeedanceAudioReferences(refs);
  } else {
    const refs = advancedSeedanceVideoReferences();
    refs.splice(index, 1);
    setAdvancedSeedanceVideoReferences(refs);
    if (!advancedSeedanceVideoReferences().length && els.advancedSeedanceVideoUrls) els.advancedSeedanceVideoUrls.value = "";
  }
  syncAdvancedPromptMentionLabels(previousPromptRefs);
  updateAdvancedModelControls();
  updateAdvancedButtonCost();
}

function setAdvancedExtendFrameReference(dataUrl = "", fileName = "video-last-frame.jpg", order = 0) {
  if (!dataUrl) return;
  if (els.advancedSeedanceMediaMode) els.advancedSeedanceMediaMode.value = "reference_video";
  state.activeAdvancedCaseId = "";
  state.advancedFirstFrameAssetId = "";
  state.advancedSourceImageAssetId = "";
  state.advancedReferenceImages = [{
    dataUrl,
    fileName,
    name: fileName,
    order,
  }].map(stampAdvancedReferenceOrder);
  state.advancedUploadDataUrl = dataUrl;
  if (els.advancedImage) els.advancedImage.value = "";
  if (els.advancedNote) els.advancedNote.textContent = "";
  updateAdvancedModelControls();
  updateAdvancedButtonCost();
}

async function captureAdvancedExtendFrameFromSource(source, fileName = "video-last-frame.jpg") {
  const pending = addAdvancedPendingReference("image", { name: fileName });
  try {
    const frameDataUrl = await captureLastFrameDataUrl(source);
    removeAdvancedPendingReference(pending.pendingId, { render: false });
    setAdvancedExtendFrameReference(frameDataUrl, fileName, pending.order);
  } catch (error) {
    removeAdvancedPendingReference(pending.pendingId);
    throw error;
  }
}

function assetTargetTypeLabel(type = "image") {
  if (type === "video") return t("assets.video");
  if (type === "audio") return t("assets.audio");
  if (type === "document") return "document";
  return t("assets.image");
}

function assetMatchesTarget(asset = {}, target = activeAdvancedAssetTarget()) {
  if (target.type === "video") return isVideoAsset(asset);
  if (target.type === "audio") return isAudioAsset(asset);
  if (target.type === "document") return isDocumentAsset(asset);
  return isImageAsset(asset);
}

async function addAssetToAdvancedTarget(assetId = "") {
  if (!state.user) return openLogin();
  const asset = (state.advancedAssets || []).find((item) => item.id === assetId)
    || (state.userAssets || []).find((item) => item.id === assetId);
  if (!asset) return;
  const preferredTarget = preferredAdvancedAssetTargetForAsset(asset);
  if (preferredTarget) state.advancedAssetTarget = preferredTarget;
  const target = activeAdvancedAssetTarget();
  if (!target) {
    if (els.advancedAssetNote) els.advancedAssetNote.textContent = t("advanced.assetSelectTarget");
    return;
  }
  if (!assetMatchesTarget(asset, target)) {
    if (els.advancedAssetNote) {
      els.advancedAssetNote.textContent = t("advanced.assetWrongType", {
        target: target.label,
        type: assetTargetTypeLabel(target.type),
      });
    }
    return;
  }
  const provider = currentAdvancedProvider();
  const url = assetPreviewUrl(asset);
  state.activeAdvancedCaseId = "";
  if (target.id === "document") {
    if (provider !== "wan30" || !isDocumentAsset(asset)) return;
    state.advancedDocumentReference = {
      assetId: asset.id,
      fileName: asset.name || asset.fileName || "Document reference",
      name: asset.name || asset.fileName || "Document reference",
      kind: "document",
      order: nextAdvancedReferenceOrder(),
    };
    state.advancedReferenceImages = [];
    state.advancedUploadDataUrl = "";
    state.advancedFirstFrameAssetId = "";
    state.advancedSeedanceFirstFrameAssetId = "";
    state.advancedSeedanceFirstFrameDataUrl = "";
    setAdvancedSeedanceVideoReferences([]);
    setAdvancedSeedanceAudioReferences([]);
    renderAdvancedReferencePreviews();
  } else if (target.id === "primary" || target.id === "sourceImage" || target.id === "sourceImages" || target.id === "referenceImages") {
    if (!isImageAsset(asset)) return;
    if (target.id === "sourceImage" || target.id === "sourceImages") state.advancedSourceImageAssetId = asset.id;
    else state.advancedFirstFrameAssetId = asset.id;
    state.advancedUploadDataUrl = url;
    if (["seedance", "seedance25", "seedance-nsfw", "wan30"].includes(provider)) {
      const referenceLimit = provider === "wan30"
        ? ADVANCED_WAN30_IMAGE_REFERENCE_LIMIT
        : ["seedance25", "seedance-nsfw"].includes(provider)
        ? ADVANCED_SEEDANCE25_IMAGE_REFERENCE_LIMIT
        : ADVANCED_SEEDANCE_REFERENCE_LIMIT;
      if (advancedCreateModeUsesCharacterPresetReference() && els.advancedSeedanceMediaMode) els.advancedSeedanceMediaMode.value = "reference_video";
      const seedanceMode = normalizeSeedanceMediaMode(els.advancedSeedanceMediaMode?.value || "text_to_video");
      const ref = stampAdvancedReferenceOrder({ assetId: asset.id, dataUrl: url, fileName: asset.name || "", name: asset.name || "", fromLibrary: true });
      if (target.id === "primary" && seedanceModeNeedsFirstFrame(seedanceMode)) {
        state.advancedSeedanceFirstFrameAssetId = asset.id;
        state.advancedSeedanceFirstFrameDataUrl = url;
        state.advancedFirstFrameAssetId = asset.id;
        state.advancedUploadDataUrl = url;
      } else if (target.id === "referenceImages") {
        state.advancedReferenceImages = dedupeAdvancedReferenceImages([...(state.advancedReferenceImages || []), ref]).slice(0, referenceLimit);
        state.advancedUploadDataUrl = state.advancedReferenceImages[0]?.dataUrl || "";
      } else {
        state.advancedReferenceImages = dedupeAdvancedReferenceImages([...(state.advancedReferenceImages || []), ref]).slice(0, referenceLimit);
        state.advancedUploadDataUrl = seedanceModeNeedsFirstFrame(seedanceMode)
          ? (state.advancedSeedanceFirstFrameDataUrl || "")
          : (state.advancedReferenceImages[0]?.dataUrl || "");
        syncSeedanceReferenceMode();
      }
      if (advancedCreateModeNeedsReplacePair()) state.advancedAssetTarget = "primary";
    } else if (["seedream5-image", "qwen-image3"].includes(provider)) {
      const ref = stampAdvancedReferenceOrder({ assetId: asset.id, dataUrl: url, fileName: asset.name || "", name: asset.name || "", fromLibrary: true });
      const imageLimit = provider === "qwen-image3" ? ADVANCED_QWEN_IMAGE3_REFERENCE_LIMIT : ADVANCED_SEEDANCE_REFERENCE_LIMIT;
      state.advancedReferenceImages = dedupeAdvancedReferenceImages([...(state.advancedReferenceImages || []), ref]).slice(0, imageLimit);
      state.advancedFirstFrameAssetId = "";
      state.advancedUploadDataUrl = state.advancedReferenceImages[0]?.dataUrl || url;
    } else if (provider === "wan27-image-edit") {
      const ref = stampAdvancedReferenceOrder({ assetId: asset.id, dataUrl: url, fileName: asset.name || "", name: asset.name || "", fromLibrary: true });
      const imageLimit = advancedCreateModeUsesSingleUpload() ? 1 : ADVANCED_SEEDANCE_REFERENCE_LIMIT;
      state.advancedReferenceImages = dedupeAdvancedReferenceImages([...(imageLimit === 1 ? [] : (state.advancedReferenceImages || [])), ref]).slice(0, imageLimit);
      state.advancedSourceImageAssetId = state.advancedReferenceImages[0]?.assetId || "";
      state.advancedFirstFrameAssetId = "";
      state.advancedUploadDataUrl = state.advancedReferenceImages[0]?.dataUrl || url;
    } else {
      const ref = stampAdvancedReferenceOrder({ assetId: asset.id, dataUrl: url, fileName: asset.name || "", name: asset.name || "", fromLibrary: true });
      if (currentAdvancedVideoCapability() === "wan27-i2v") {
        const limit = advancedAliyunReferenceImageLimit("wan27-i2v");
        state.advancedReferenceImages = dedupeAdvancedReferenceImages([...(state.advancedReferenceImages || []), ref]).slice(0, limit);
        state.advancedFirstFrameAssetId = state.advancedReferenceImages[0]?.assetId || "";
        state.advancedUploadDataUrl = state.advancedReferenceImages[0]?.dataUrl || "";
      } else if (target.id === "referenceImages") {
        const limit = advancedAliyunReferenceImageLimit(currentAdvancedVideoCapability());
        state.advancedReferenceImages = dedupeAdvancedReferenceImages([...(state.advancedReferenceImages || []), ref]).slice(0, limit);
        state.advancedUploadDataUrl = state.advancedReferenceImages[0]?.dataUrl || "";
      } else {
        state.advancedReferenceImages = [ref];
        state.advancedFirstFrameAssetId = asset.id;
        state.advancedUploadDataUrl = url;
      }
    }
    if (els.advancedImage) els.advancedImage.value = "";
  } else if (target.id === "lastFrame") {
    if (!isImageAsset(asset)) return;
    if (["seedance", "seedance25", "seedance-nsfw", "wan30"].includes(provider)) {
      state.advancedSeedanceLastFrameAssetId = asset.id;
      state.advancedSeedanceLastFrameDataUrl = url;
      if (els.advancedSeedanceLastFrame) els.advancedSeedanceLastFrame.value = "";
    } else {
      state.advancedWanLastFrameAssetId = asset.id;
      state.advancedWanLastFrameDataUrl = url;
      if (els.advancedWanLastFrame) els.advancedWanLastFrame.value = "";
      if (els.advancedWanLastFramePreview) {
        els.advancedWanLastFramePreview.src = url;
        els.advancedWanLastFramePreview.classList.add("is-visible");
        els.advancedWanLastFrame?.closest(".wan-frame-upload")?.classList.add("has-image");
      }
    }
  } else if (target.id === "video") {
    if (!isVideoAsset(asset)) return;
    const durationMessage = advancedVideoInputDurationMessage(
      Number(asset.durationSeconds || asset.duration || 0),
      provider,
      currentAdvancedVideoCapability(),
      { allowUnknown: true },
    );
    if (durationMessage) {
      if (els.advancedAssetNote) els.advancedAssetNote.textContent = durationMessage;
      if (els.advancedNote) els.advancedNote.textContent = durationMessage;
      return;
    }
    if (["seedance", "seedance25", "seedance-nsfw", "wan30"].includes(provider)) {
      addAdvancedSeedanceMediaReference(asset, "video");
      if (advancedCreateModeNeedsReplacePair()) state.advancedAssetTarget = "primary";
    } else if (advancedAliyunUsesSharedReferenceUpload(currentAdvancedVideoCapability())) {
      addAdvancedSeedanceMediaReference(asset, "video");
    } else {
      if (els.advancedWanMediaMode && !wanModeNeedsClip(els.advancedWanMediaMode.value)) els.advancedWanMediaMode.value = "first_clip";
      state.advancedWanClipAssetId = asset.id;
      state.advancedWanClipDataUrl = "";
      state.advancedWanClipFileName = asset.name || "";
      state.advancedWanClipDurationSeconds = Number(asset.durationSeconds || asset.duration || 0) || 0;
      state.advancedWanClipOrder = nextAdvancedReferenceOrder();
      if (els.advancedWanClipFile) els.advancedWanClipFile.value = "";
      if (els.advancedWanClipUrl) els.advancedWanClipUrl.value = "";
      if (els.advancedWanClipPreview) {
        els.advancedWanClipPreview.src = url;
        els.advancedWanClipPreview.classList.add("is-visible");
        els.advancedWanClipFile?.closest(".wan-frame-upload")?.classList.add("has-image");
      }
    }
  } else if (target.id === "audio") {
    if (!isAudioAsset(asset)) return;
    if (advancedUsesSharedReferenceUpload(provider, currentAdvancedVideoCapability())) {
      addAdvancedSeedanceMediaReference(asset, "audio");
    } else if (els.advancedWanAudioUrl) {
      state.advancedAudioAssetId = asset.id;
      state.advancedAudioPreviewUrl = assetPreviewUrl(asset);
      state.advancedAudioFileName = asset.name || asset.fileName || "";
      state.advancedAudioOrder = nextAdvancedReferenceOrder();
      els.advancedWanAudioUrl.value = "";
    }
  }
  updateAdvancedModelControls();
  updateAdvancedButtonCost();
  if (els.advancedAssetNote) els.advancedAssetNote.textContent = t("advanced.assetAdded", { target: target.label });
}

function publicAliyunModelsEnabled() {
  return state.config?.tenantFeatures?.aliyunModels !== false;
}

const WAN30_DOCUMENT_EXTENSIONS = new Set([".doc", ".docx", ".xls", ".xlsx", ".ppt", ".pptx", ".pdf", ".txt", ".md"]);

function isWan30DocumentFile(file) {
  const name = String(file?.name || "").toLowerCase();
  const ext = name.includes(".") ? name.slice(name.lastIndexOf(".")) : "";
  return WAN30_DOCUMENT_EXTENSIONS.has(ext);
}

async function uploadAdvancedDocumentReference(file) {
  if (!state.user) {
    openLogin();
    return null;
  }
  if (!file || currentAdvancedProvider() !== "wan30" || !isWan30DocumentFile(file)) return null;
  if (file.size > ADVANCED_WAN30_DOCUMENT_MAX_BYTES) {
    if (els.advancedNote) els.advancedNote.textContent = "Wan 3.0 documents must be 100MB or smaller.";
    return null;
  }
  const pending = addAdvancedPendingReference("document", file);
  try {
    const payload = await requestJson("/api/user-assets", {
      method: "POST",
      body: {
        dataUrl: await readFileAsDataUrl(file),
        name: file.name || "Document reference",
        fileName: file.name || "",
        provider: "wan30",
      },
    });
    const asset = payload.asset || null;
    if (!asset?.id || asset.kind !== "document") throw new Error("Invalid document asset");
    state.advancedDocumentReference = { assetId: asset.id, fileName: asset.name || file.name || "", name: asset.name || file.name || "", kind: "document", order: pending.order };
    state.advancedAssets = [asset, ...(state.advancedAssets || []).filter((item) => item.id !== asset.id)];
    state.userAssets = [asset, ...(state.userAssets || []).filter((item) => item.id !== asset.id)];
    removeAdvancedPendingReference(pending.pendingId, { render: false });
    if (els.advancedNote) els.advancedNote.textContent = "";
    renderAdvancedAssets();
    renderAdvancedReferencePreviews();
    updateAdvancedModelControls();
    updateAdvancedButtonCost();
    return asset;
  } catch (error) {
    removeAdvancedPendingReference(pending.pendingId);
    throw error;
  }
}

function publicWan27ModelsEnabled() {
  return state.config?.tenantFeatures?.aliyunWan27Models === true;
}

function publicWan30ModelsEnabled() {
  return state.config?.tenantFeatures?.aliyunWan30Models === true;
}

function publicHappyhorseModelsEnabled() {
  return state.config?.tenantFeatures?.aliyunHappyHorseModels === true;
}

function publicQwenImage3ModelsEnabled() {
  return state.config?.tenantFeatures?.aliyunQwenImage3Models === true;
}

function isPublicWan27ProviderOption(value = "") {
  const raw = String(value || "").trim().toLowerCase();
  return ["wan27", "wan27-image-edit", "wan-animate"].includes(raw)
    || raw.includes("wan2.7")
    || raw.includes("wan27")
    || raw.includes("wan-animate")
    || raw.includes("wananimate");
}

function isPublicWan30ProviderOption(value = "") {
  const raw = String(value || "").trim().toLowerCase();
  return raw === "wan30" || raw.includes("wan3.0") || raw.includes("wan30");
}

function isPublicHappyhorseProviderOption(value = "") {
  return String(value || "").trim().toLowerCase() === "happyhorse";
}

function isPublicQwenImage3ProviderOption(value = "") {
  return String(value || "").trim().toLowerCase() === "qwen-image3";
}

function syncAdvancedProviderExposure() {
  if (!els.advancedProvider) return;
  const hiddenProviders = new Set(["wan30", "wan27", "wan-animate", "happyhorse", "wan27-image-edit", "qwen-image3"]);
  const enabled = publicAliyunModelsEnabled();
  const wan30Enabled = publicWan30ModelsEnabled();
  const wan27Enabled = publicWan27ModelsEnabled();
  const happyhorseEnabled = publicHappyhorseModelsEnabled();
  const qwenImage3Enabled = publicQwenImage3ModelsEnabled();
  els.advancedProvider.querySelectorAll("option").forEach((option) => {
    const raw = String(option.value || "").trim().toLowerCase();
    // Keep HappyHorse hidden on the old site, but expose Wan 3.0 Prime along
    // with Wan 3.0 when that tenant feature is enabled.
    const permanentlyHidden = raw === "happyhorse";
    const primeHidden = raw === "wan30-prime" && !wan30Enabled;
    option.hidden = permanentlyHidden || primeHidden || (!enabled && hiddenProviders.has(raw) && !(
      (wan30Enabled && isPublicWan30ProviderOption(raw))
      || (wan27Enabled && isPublicWan27ProviderOption(raw))
      || (happyhorseEnabled && isPublicHappyhorseProviderOption(raw))
      || (qwenImage3Enabled && isPublicQwenImage3ProviderOption(raw))
    ));
  });
  const current = String(els.advancedProvider.value || "").trim().toLowerCase();
  const modeProvider = state.advancedCreateKind === "custom" ? "" : String(advancedCreateModeConfig()?.provider || "").trim().toLowerCase();
  const permanentlyHiddenCurrent = current === "happyhorse" || (current === "wan30-prime" && !wan30Enabled);
  if (current !== modeProvider && (permanentlyHiddenCurrent || (!enabled && hiddenProviders.has(current) && !(
    (wan30Enabled && isPublicWan30ProviderOption(current))
    || (wan27Enabled && isPublicWan27ProviderOption(current))
    || (happyhorseEnabled && isPublicHappyhorseProviderOption(current))
    || (qwenImage3Enabled && isPublicQwenImage3ProviderOption(current))
  )))) {
    els.advancedProvider.value = "seedance25";
  }
}

function updateAdvancedModelControls() {
  applyAdvancedCreateMode();
  syncAdvancedProviderExposure();
  const provider = currentAdvancedProvider();
  syncAdvancedVideoCapabilityOptions();
  syncAdvancedSeedanceModeOptions(provider);
  const capability = currentAdvancedVideoCapability();
  const wanMode = normalizeWanMediaMode(els.advancedWanMediaMode?.value || "first_frame");
  const seedanceMode = normalizeSeedanceMediaMode(els.advancedSeedanceMediaMode?.value || "text_to_video");
  const allowManualReferenceUpload = advancedCreateModeAllowsManualReferenceUpload();
  const bounds = advancedDurationBounds(provider, capability);
  const isImageEdit = provider === "wan27-image-edit";
  const isSeedreamImage = provider === "seedream5-image";
  const isQwenImage = provider === "qwen-image3";
  const isQwenText = ["qwen37-flash", "byteplus-language"].includes(provider);
  const isStandaloneImage = isSeedreamImage || isQwenImage;
  const simpleEdit = advancedCreateModeIsSimpleEdit();
  const simpleAction = state.advancedCreateKind === "video" && advancedCreateModeUsesAutoPrompt();
  const aliyunVideo = provider === "wan30" || provider === "wan27" || provider === "happyhorse";
  const animateCapability = ["wan-animate-move", "wan-animate-mix"].includes(capability);
  const legacyModel = String(els.advancedLegacyWanModel?.value || "");
  const legacyT2v = capability === "wan-legacy" && legacyModel.includes("t2v");
  const capabilityNeedsPrimary = ["wan27-i2v", "wan-animate-move", "wan-animate-mix", "happyhorse-i2v"].includes(capability)
    || (capability === "wan-legacy" && !legacyT2v && !legacyModel.includes("r2v") && !legacyModel.includes("vace"));
  const capabilityNeedsVideo = ["wan27-r2v", "wan27-video-edit", "wan-animate-move", "wan-animate-mix", "happyhorse-video-edit"].includes(capability)
    || (capability === "wan-legacy" && (legacyModel.includes("r2v") || legacyModel.includes("vace")));
  const capabilityNeedsMedia = aliyunVideo && !["wan27-t2v", "happyhorse-t2v"].includes(capability) && !legacyT2v;
  if (els.advancedDuration) {
    const durationMax = provider === "seedance25" && normalizeAdvancedResolution(els.advancedResolution?.value, provider) === "720p"
      ? 29
      : bounds.max;
    const rawDuration = Number(els.advancedDuration.value || bounds.fallback);
    const selectedDuration = isImageEdit || isStandaloneImage || isQwenText
      ? "1"
      : provider === "wan30" && rawDuration === -1
        ? "-1"
        : String(Math.min(durationMax, Math.max(provider === "wan30" ? 2 : bounds.min, Number.isFinite(rawDuration) ? rawDuration : bounds.fallback)));
    const durationValues = isImageEdit || isStandaloneImage || isQwenText
      ? [1]
      : provider === "wan30"
        ? [-1, ...Array.from({ length: 29 }, (_, index) => index + 2)]
        : Array.from({ length: durationMax - bounds.min + 1 }, (_, index) => bounds.min + index);
    els.advancedDuration.innerHTML = durationValues
      .map((value) => `<option value="${value}"${String(value) === selectedDuration ? " selected" : ""}>${value === -1 ? "Auto" : `${value}s`}</option>`)
      .join("");
    els.advancedDuration.value = selectedDuration;
  }
  if (els.advancedResolution) {
    const imageEditOptions = imageCreateResolutionOptions();
    const seedreamOptions = ["1K", "2K"];
    const videoOptions = provider === "seedance"
      ? ["480p", "720p", "1080p", "4k"]
      : ["seedance25", "seedance-nsfw"].includes(provider)
      ? ["480p", "720p"]
      : provider === "wan30"
      ? ["480p", "720p", "1080p"]
      : ["720p", "1080p"];
    const options = isStandaloneImage ? seedreamOptions : isImageEdit ? imageEditOptions : videoOptions;
    const current = normalizeAdvancedResolution(els.advancedResolution.value, provider);
    els.advancedResolution.innerHTML = options.map((value) => `<option value="${escapeHtml(value)}" ${value === current ? "selected" : ""}>${escapeHtml(value)}</option>`).join("");
    if (!options.includes(current)) els.advancedResolution.value = options[0];
    els.advancedResolution.closest(".field")?.toggleAttribute("hidden", animateCapability || isQwenText);
  }
  if (els.advancedSeedanceTier) {
    const active = provider === "seedance";
    els.advancedSeedanceTier.closest(".field")?.toggleAttribute("hidden", !active);
    if (!active) els.advancedSeedanceTier.value = "standard";
    if (active && ["1080p", "4k"].includes(currentAdvancedResolution()) && currentSeedanceTier() === "fast") {
      els.advancedSeedanceTier.value = "standard";
    }
  }
  if (els.advancedSeedreamTier) {
    els.advancedSeedreamTier.value = "pro";
    els.advancedSeedreamTier.closest(".field")?.setAttribute("hidden", "");
  }
  document.querySelectorAll(".advanced-qwen-option").forEach((item) => {
    item.hidden = simpleAction || simpleEdit || !isQwenImage;
  });
  document.querySelectorAll(".advanced-wan-prompt-extend-option").forEach((item) => {
    item.hidden = simpleAction || simpleEdit || !["wan30-video", "wan30-video-prime"].includes(capability);
  });
  document.querySelectorAll(".advanced-qwen37-option").forEach((item) => {
    item.hidden = simpleAction || simpleEdit || !isQwenText;
  });
  if (els.advancedRatio) {
    const imageRatios = ["1:1", "3:4", "4:3", "9:16", "16:9"];
    const seedanceNsfwReferenceMode = provider === "seedance-nsfw" && seedanceMode === "omini";
    const videoRatios = provider === "seedance25"
      ? ["16:9", "21:9", "9:16", "4:3", "3:4", "1:1"]
      : provider === "wan30" || provider === "seedance-nsfw"
      ? ["adaptive", "16:9", "21:9", "9:16", "4:3", "3:4", "1:1"]
      : ["9:16", "16:9", "1:1"];
    const options = isImageEdit || isQwenImage ? imageRatios : videoRatios;
    if (provider === "seedance-nsfw" && !seedanceNsfwReferenceMode) els.advancedRatio.value = "adaptive";
    const fallbackRatio = provider === "seedance25" ? "16:9" : ["wan30", "seedance-nsfw"].includes(provider) ? "adaptive" : "9:16";
    const rawRatio = String(els.advancedRatio.value || fallbackRatio).trim().toLowerCase();
    const current = ["wan30", "seedance-nsfw"].includes(provider) && rawRatio === "adaptive" ? "adaptive" : normalizeVideoRatio(rawRatio);
    els.advancedRatio.innerHTML = options.map((value) => `<option value="${escapeHtml(value)}" ${value === current ? "selected" : ""}>${escapeHtml(value)}</option>`).join("");
    if (!options.includes(current)) els.advancedRatio.value = fallbackRatio;
    els.advancedRatio.closest(".field")?.toggleAttribute("hidden", isSeedreamImage || isQwenText || simpleAction || animateCapability || (provider === "seedance-nsfw" && !seedanceNsfwReferenceMode));
  }
  document.querySelectorAll(".advanced-wan-option").forEach((item) => {
    item.hidden = simpleAction || simpleEdit || !capabilityNeedsMedia;
  });
  if (els.advancedWanMediaPanel) {
    const usesSharedReferenceUpload = advancedAliyunUsesSharedReferenceUpload(capability);
    const hasDedicatedWanPanelSlot = capabilityNeedsPrimary || capabilityNeedsVideo
      || ((capability === "wan27-i2v" || capability === "wan-legacy") && (wanModeNeedsLastFrame(wanMode) || wanModeNeedsAudio(wanMode) || wanModeNeedsClip(wanMode)));
    els.advancedWanMediaPanel.hidden = simpleAction || simpleEdit || !aliyunVideo || usesSharedReferenceUpload || !hasDedicatedWanPanelSlot;
  }
  document.querySelectorAll(".advanced-legacy-model-field").forEach((item) => {
    item.hidden = capability !== "wan-legacy";
  });
  document.querySelectorAll(".advanced-animate-mode-field").forEach((item) => {
    item.hidden = !["wan-animate-move", "wan-animate-mix"].includes(capability);
  });
  document.querySelectorAll(".advanced-seedance-option").forEach((item) => {
    item.hidden = simpleAction || simpleEdit || !["seedance", "seedance25", "seedance-nsfw", "wan30"].includes(provider);
  });
  els.advancedSeedanceTier?.closest(".field")?.toggleAttribute("hidden", provider !== "seedance");
  if (els.advancedSeedanceMediaPanel) {
    els.advancedSeedanceMediaPanel.hidden = simpleAction || simpleEdit || !["seedance", "seedance25", "seedance-nsfw", "wan30"].includes(provider) || !seedanceModeNeedsFirstFrame(seedanceMode);
  }
  if (els.advancedFrameEngineLabel) els.advancedFrameEngineLabel.textContent = provider === "wan30" ? "Wan 3.0" : provider === "seedance-nsfw" ? "Seedance2.5 (NSFW)" : provider === "seedance25" ? "Seedance 2.5" : "Seedance 2.0";
  document.querySelectorAll(".advanced-seedream5-option").forEach((item) => {
    item.hidden = simpleAction || simpleEdit || !isSeedreamImage;
  });
  document.querySelectorAll(".advanced-fields").forEach((item) => {
    item.hidden = simpleAction;
  });
  document.querySelectorAll(".advanced-prompt-field").forEach((item) => {
    item.hidden = simpleAction;
  });
  document.querySelectorAll(".advanced-duration-field").forEach((item) => {
    item.hidden = isImageEdit || isStandaloneImage || isQwenText || simpleEdit || animateCapability || advancedVideoEditUsesSourceDuration(capability) || (provider === "seedance-nsfw" && seedanceMode === "edit");
  });
  document.querySelectorAll(".advanced-seedance-audio-field").forEach((item) => {
    item.hidden = simpleAction || simpleEdit || !["seedance", "seedance25", "seedance-nsfw", "wan30"].includes(provider);
  });
  const seedanceImagePreprocessAvailable = ["seedance", "seedance25", "seedance-nsfw"].includes(provider)
    && !["edit", "extend"].includes(seedanceMode);
  els.advancedPreprocessReference?.closest(".advanced-seedance-preprocess-field")
    ?.toggleAttribute("hidden", simpleAction || simpleEdit || !seedanceImagePreprocessAvailable);
  if (!seedanceImagePreprocessAvailable && els.advancedPreprocessReference) {
    els.advancedPreprocessReference.checked = false;
  }
  if (["seedance-nsfw", "qwen-image3"].includes(provider)) {
    els.advancedWanSeed?.closest(".field")?.removeAttribute("hidden");
  }
  syncAdvancedVideoSettingsControls();
  document.querySelectorAll(".wan-first-frame").forEach((item) => {
    item.hidden = !capabilityNeedsPrimary || ((capability === "wan27-i2v" || capability === "wan-legacy") && !wanModeNeedsFirstFrame(wanMode));
  });
  document.querySelectorAll(".wan-last-frame").forEach((item) => {
    item.hidden = !(capability === "wan27-i2v" || capability === "wan-legacy") || !wanModeNeedsLastFrame(wanMode);
  });
  document.querySelectorAll(".wan-audio").forEach((item) => {
    item.hidden = !(capability === "wan27-i2v" || capability === "wan-legacy") || !wanModeNeedsAudio(wanMode);
  });
  document.querySelectorAll(".wan-clip").forEach((item) => {
    item.hidden = !capabilityNeedsVideo && !((capability === "wan27-i2v" || capability === "wan-legacy") && wanModeNeedsClip(wanMode));
  });
  document.querySelectorAll(".seedance-last-frame").forEach((item) => {
    item.hidden = !["seedance", "seedance25", "seedance-nsfw", "wan30"].includes(provider) || !seedanceModeNeedsLastFrame(seedanceMode);
  });
  document.querySelectorAll(".seedance-first-frame").forEach((item) => {
    item.hidden = !["seedance", "seedance25", "seedance-nsfw", "wan30"].includes(provider) || !seedanceModeNeedsFirstFrame(seedanceMode);
  });
  document.querySelectorAll(".seedance-video-field").forEach((item) => {
    item.hidden = true;
  });
  renderAdvancedAssetTargets();
  const assetsSideTab = els.advancedSideTabs?.querySelector('[data-advanced-side-tab="assets"]');
  const assetsMobileTab = els.advancedMobileTabs?.querySelector('[data-advanced-mobile-tab="assets"]');
  if (assetsSideTab) assetsSideTab.hidden = isQwenText;
  if (assetsMobileTab) assetsMobileTab.hidden = isQwenText;
  if (isQwenText && state.advancedSideTab !== "result") setAdvancedSideTab("result", { silent: true });
  if (els.advancedUploadBox) {
    const uploadIsVideo = advancedCreateUploadIsVideo();
    const mixedUpload = advancedCreateModeAcceptsVideoUpload() && advancedCreateModeAcceptsImageUpload();
    const hidePresetUploadBox = !allowManualReferenceUpload;
    if (els.advancedImage) {
      const sharedReferenceUpload = advancedUsesSharedReferenceUpload(provider, capability);
      const allowedTargetTypes = new Set(advancedAssetTargetItems().map((target) => target.type));
      const sharedAccept = [
        allowedTargetTypes.has("image") ? "image/*" : "",
        allowedTargetTypes.has("video") ? "video/mp4,video/webm,video/quicktime,video/*" : "",
        allowedTargetTypes.has("audio") ? "audio/*" : "",
        provider === "wan30" ? ".doc,.docx,.xls,.xlsx,.ppt,.pptx,.pdf,.txt,.md" : "",
      ].filter(Boolean).join(",");
      els.advancedImage.accept = sharedReferenceUpload ? sharedAccept : advancedCreateUploadAcceptValue();
      els.advancedImage.multiple = allowManualReferenceUpload && (
        (["seedance", "seedance25", "seedance-nsfw", "wan30"].includes(provider) && !seedanceModeNeedsFirstFrame(seedanceMode) && !(provider === "seedance-nsfw" && ["edit", "extend"].includes(seedanceMode)))
        || isStandaloneImage
        || (aliyunVideo && advancedAliyunUsesSharedReferenceUpload(capability))
        || (!uploadIsVideo && !advancedCreateModeUsesSingleUpload())
      );
    }
    const forceUpload = allowManualReferenceUpload && (simpleAction || simpleEdit || advancedCreateModeNeedsVideoUpload());
    const usesDedicatedFrameUpload = ["seedance", "seedance25", "seedance-nsfw", "wan30"].includes(provider) && seedanceModeNeedsFirstFrame(seedanceMode);
    els.advancedUploadBox.hidden = hidePresetUploadBox
      || isQwenText
      || usesDedicatedFrameUpload
      || (aliyunVideo && !capabilityNeedsMedia);
    els.advancedUploadBox.classList.toggle("is-wan", aliyunVideo);
    els.advancedUploadBox.classList.toggle("is-seedance", ["seedance", "seedance25", "seedance-nsfw", "wan30"].includes(provider));
    els.advancedUploadBox.classList.toggle("is-seedream5", isStandaloneImage);
    els.advancedUploadBox.classList.toggle("is-image-edit", isImageEdit);
    els.advancedUploadBox.classList.toggle("is-video-upload", uploadIsVideo);
    const label = els.advancedUploadBox.querySelector("span");
    if (label) {
      const imageEditLabel = t("advanced.assetTargetSourceImages");
      const videoEditLabel = t("advanced.assetTargetVideo");
      const seedanceLabel = t("advanced.uploadReference");
      const uploadLabel = ["seedance", "seedance25", "seedance-nsfw"].includes(provider) || aliyunVideo || isStandaloneImage ? seedanceLabel : simpleEdit && isImageEdit ? imageEditLabel : simpleEdit && uploadIsVideo ? videoEditLabel : mixedUpload ? t("advanced.uploadImageVideo") : uploadIsVideo ? videoEditLabel : isImageEdit ? imageEditLabel : seedanceLabel;
      label.innerHTML = `<i data-lucide="${["seedance", "seedance25", "seedance-nsfw"].includes(provider) || aliyunVideo || isStandaloneImage ? "plus" : uploadIsVideo ? "video" : "image-up"}"></i>${escapeHtml(uploadLabel)}`;
    }
    if (hidePresetUploadBox) els.advancedUploadBox.classList.remove("has-image");
  }
  renderAdvancedReferencePreviews();
  updateAdvancedReferenceSummary();
  if (els.advancedNote && (state.advancedUploadDataUrl || state.advancedSeedanceFirstFrameDataUrl || advancedSeedanceVideoReferences().length || advancedSeedanceAudioReferences().length)) els.advancedNote.textContent = "";
  updateAdvancedButtonCost();
}

function triggerAdvancedLocalImageUpload({ sourceMode = "", presetSlot = "" } = {}) {
  if (!els.advancedImage) return;
  const provider = currentAdvancedProvider();
  const characterPresetUpload = presetSlot === "character" && state.advancedCreateKind !== "custom" && advancedCreateModeUsesCharacterPresetReference();
  if (!advancedCreateModeAllowsManualReferenceUpload() && !characterPresetUpload) return;
  state.advancedLocalUploadSlot = characterPresetUpload ? "character" : "";
  if (["seedance", "seedance25", "seedance-nsfw", "wan30"].includes(provider) && els.advancedSeedanceMediaMode) {
    let mode = normalizeSeedanceMediaMode(sourceMode || els.advancedSeedanceMediaMode.value || "reference_video");
    if (["seedance", "wan30"].includes(provider) && !seedanceModeNeedsFirstFrame(mode)) mode = "reference_video";
    els.advancedSeedanceMediaMode.value = mode;
    state.advancedAssetTarget = seedanceModeNeedsFirstFrame(mode)
      ? "primary"
      : provider === "seedance-nsfw" && ["edit", "extend"].includes(mode)
      ? "video"
      : "referenceImages";
  } else if (["seedream5-image", "qwen-image3"].includes(provider)) {
    state.advancedAssetTarget = "referenceImages";
  } else if (provider === "wan27-image-edit") {
    state.advancedAssetTarget = "sourceImages";
  }
  updateAdvancedModelControls();
  const capability = currentAdvancedVideoCapability();
  const sharedUpload = advancedUsesSharedReferenceUpload(provider, capability);
  const allowedTypes = new Set(advancedAssetTargetItems().map((target) => target.type));
  els.advancedImage.accept = sharedUpload
      ? [
        allowedTypes.has("image") ? "image/*" : "",
        allowedTypes.has("video") ? "video/mp4,video/webm,video/quicktime,video/*" : "",
        allowedTypes.has("audio") ? "audio/*" : "",
        provider === "wan30" ? ".doc,.docx,.xls,.xlsx,.ppt,.pptx,.pdf,.txt,.md" : "",
      ].filter(Boolean).join(",") || advancedCreateUploadAcceptValue()
    : "image/*";
  els.advancedImage.multiple = !characterPresetUpload && (
    ["seedream5-image", "qwen-image3"].includes(provider)
    || (sharedUpload
      ? (!["seedance", "seedance25", "seedance-nsfw", "wan30"].includes(provider) || !seedanceModeNeedsFirstFrame(els.advancedSeedanceMediaMode?.value || ""))
      : !advancedCreateModeUsesSingleUpload())
  );
  els.advancedImage.click();
}

function renderAdvancedCases() {
  if (!els.advancedCaseGrid) return;
  activeHoverPreviewStop?.();
  activeHoverPreviewStop = null;
  const cases = state.advancedCases.filter((item) => item.enabled !== false);
  state.activeAdvancedCaseTab = normalizeAdvancedCaseTab(state.activeAdvancedCaseTab);
  const activeTab = state.activeAdvancedCaseTab;
  const visibleCases = cases
    .map((item, index) => ({ item, index }))
    .filter(({ item }) => normalizeAdvancedCaseTab(item.category || item.caseCategory || item.tab) === activeTab);
  const pageSize = ADVANCED_CASE_PAGE_SIZE[activeTab] || 9;
  const totalPages = Math.max(1, Math.ceil(visibleCases.length / pageSize));
  const currentPage = Math.min(totalPages, Math.max(1, Number(state.advancedCasePages?.[activeTab] || 1)));
  state.advancedCasePages = { ...state.advancedCasePages, [activeTab]: currentPage };
  const pageCases = visibleCases.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const tabs = `
    <div class="advanced-case-tabs" role="tablist" aria-label="${escapeHtml(t("advanced.cases"))}">
      ${ADVANCED_CASE_TABS.map((tab) => {
        const count = cases.filter((item) => normalizeAdvancedCaseTab(item.category || item.caseCategory || item.tab) === tab.id).length;
        return `<button class="advanced-case-tab ${tab.id === activeTab ? "is-active" : ""}" data-case-tab="${escapeHtml(tab.id)}" type="button" role="tab" aria-selected="${tab.id === activeTab ? "true" : "false"}">${escapeHtml(advancedCaseTabLabel(tab.id))}<span>${count}</span></button>`;
      }).join("")}
    </div>
  `;
  const caseMarkup = pageCases.length
    ? pageCases.map((entry) => (activeTab === "hot" ? renderAdvancedCaseCard(entry) : renderAdvancedCaseRow(entry))).join("")
    : `<div class="job-note advanced-case-empty">${escapeHtml(t("advanced.noCases"))}</div>`;
  els.advancedCaseGrid.classList.toggle("is-case-list", activeTab !== "hot");
  els.advancedCaseGrid.innerHTML = `${tabs}${caseMarkup}${renderAdvancedCasePager(activeTab, currentPage, totalPages)}`;
  els.advancedCaseGrid.querySelectorAll("[data-case-tab]").forEach((button) => {
    button.addEventListener("click", () => {
      state.activeAdvancedCaseTab = normalizeAdvancedCaseTab(button.dataset.caseTab);
      state.advancedCasePages = { ...state.advancedCasePages, [state.activeAdvancedCaseTab]: state.advancedCasePages?.[state.activeAdvancedCaseTab] || 1 };
      renderAdvancedCases();
    });
  });
  els.advancedCaseGrid.querySelectorAll("[data-case-page]").forEach((button) => {
    button.addEventListener("click", () => {
      state.advancedCasePages = {
        ...state.advancedCasePages,
        [activeTab]: Math.min(totalPages, Math.max(1, Number(button.dataset.casePage || 1))),
      };
      renderAdvancedCases();
    });
  });
  els.advancedCaseGrid.querySelectorAll("[data-case-index]").forEach((card) => {
    if (!card.classList.contains("advanced-case-row")) {
      card.addEventListener("click", () => fillAdvancedCase(cases[Number(card.dataset.caseIndex || 0)]));
    }
    const isCaseRow = card.classList.contains("advanced-case-row");
    bindHoverPreviewCard({
      card,
      video: isCaseRow ? null : card.querySelector(".advanced-case-hover-video"),
      cover: isCaseRow ? null : card.querySelector(".advanced-case-cover"),
    });
  });
  els.advancedCaseGrid.querySelectorAll("[data-advanced-fill-prompt-id]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      fillAdvancedCasePrompt(advancedCaseById(button.dataset.advancedFillPromptId));
    });
  });
  els.advancedCaseGrid.querySelectorAll("[data-advanced-row-preview-id]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      openAdvancedRowPreview(button.dataset.advancedRowPreviewId, button.dataset.advancedRowPreviewKind || "output");
    });
  });
  els.advancedCaseGrid.querySelectorAll("[data-advanced-preview-index]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      openAdvancedPreview(button.dataset.advancedPreviewIndex);
    });
  });
  refreshIcons();
}

function fillAdvancedCase(item = {}) {
  const params = item.params && typeof item.params === "object" ? item.params : {};
  const provider = advancedCaseProvider(item);
  state.advancedCreateKind = "custom";
  state.advancedCreateMode = ADVANCED_CUSTOM_MODE.id;
  renderAdvancedCreateControls();
  state.activeAdvancedCaseId = item.id || "";
  const restoredCapability = String(params.videoCapability || item.mediaMode || "").trim();
  if (els.advancedProvider) {
    els.advancedProvider.value = advancedEngineValue(provider, restoredCapability);
    syncAdvancedVideoCapabilityOptions(restoredCapability);
  }
  if (els.advancedLegacyWanModel && restoredCapability === "wan-legacy") {
    els.advancedLegacyWanModel.value = params.model || record.model || els.advancedLegacyWanModel.value;
  }
  if (els.advancedWanAnimateMode && ["wan-animate-move", "wan-animate-mix"].includes(restoredCapability)) {
    els.advancedWanAnimateMode.value = params.animateMode || params.parameters?.mode || "wan-std";
  }
  if (els.advancedPrompt) els.advancedPrompt.value = item.prompt || params.prompt || "";
  if (els.advancedRatio) els.advancedRatio.value = params.ratio || params.aspect_ratio || item.ratio || "9:16";
  if (els.advancedResolution) els.advancedResolution.value = params.resolution || item.resolution || "720p";
  if (els.advancedDuration) els.advancedDuration.value = params.duration || item.duration || 5;
  if (els.advancedPreprocessReference) els.advancedPreprocessReference.checked = params.preprocessReference === true;
  if (els.advancedWanPromptExtend) els.advancedWanPromptExtend.checked = ["wan30-video", "wan30-video-prime"].includes(restoredCapability)
    && advancedBoolFromValue(params.prompt_extend ?? params.promptExtend ?? params.parameters?.prompt_extend ?? params.parameters?.promptExtend, false);
  if (els.advancedWanSeed) els.advancedWanSeed.value = params.seed || "";
  state.advancedSourceImageAssetId = "";
  state.advancedFirstFrameAssetId = "";
  state.advancedSeedanceLastFrameAssetId = "";
  state.advancedWanLastFrameAssetId = "";
  state.advancedWanClipAssetId = "";
  state.advancedAudioAssetId = "";
  if (els.advancedWanMediaMode) els.advancedWanMediaMode.value = normalizeWanMediaMode(params.mediaMode || item.mediaMode || "multimodal");
  if (els.advancedSeedanceMediaMode) els.advancedSeedanceMediaMode.value = normalizeSeedanceMediaMode(params.seedanceMode || params.mediaMode || item.mediaMode || "reference_video");
  if (els.advancedWanAudioUrl) els.advancedWanAudioUrl.value = params.drivingAudioUrl || params.driving_audio_url || "";
  if (els.advancedWanClipUrl) els.advancedWanClipUrl.value = params.firstClipUrl || params.first_clip_url || "";
  if (els.advancedSeedanceVideoUrls) els.advancedSeedanceVideoUrls.value = [
    ...splitUrlList(params.referenceVideoUrls || params.referenceVideos || ""),
    ...arrayFrom(params.reference_videos).map((item) => (typeof item === "string" ? item : item?.url || item?.videoUrl || item?.video_url || item?.assetUri || "")).filter(Boolean),
  ].join(", ");
  if (els.advancedSeedanceAudioUrls) els.advancedSeedanceAudioUrls.value = [
    ...splitUrlList(params.referenceAudioUrls || params.referenceAudios || ""),
    ...arrayFrom(params.reference_audios).map((item) => (typeof item === "string" ? item : item?.url || item?.audioUrl || item?.audio_url || item?.assetUri || "")).filter(Boolean),
  ].join(", ");
  state.advancedSeedanceGenerateAudio = advancedBoolFromValue(params.generateAudio ?? params.generate_audio ?? item.generateAudio ?? item.generate_audio, true);
  if (els.advancedSeedanceGenerateAudio) els.advancedSeedanceGenerateAudio.value = state.advancedSeedanceGenerateAudio ? "true" : "false";
  updateAdvancedModelControls();
  updateAdvancedButtonCost();
  if (els.advancedNote) {
    els.advancedNote.textContent = t("advanced.loadedCase", {
      title: item.title || t("advanced.defaultCase"),
      cost: advancedCostLabel(advancedCaseDuration(item), provider, params.resolution, params.ratio || params.aspect_ratio),
    });
  }
}

function clearAdvancedCreationInputs() {
  state.activeAdvancedCaseId = "";
  state.advancedUploadDataUrl = "";
  state.advancedSourceImageAssetId = "";
  state.advancedFirstFrameAssetId = "";
  state.advancedReferenceImages = [];
  state.advancedDocumentReference = null;
  state.advancedSeedanceVideoReferences = [];
  state.advancedSeedanceAudioReferences = [];
  state.advancedSeedanceGenerateAudio = true;
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
  state.advancedWanClipDurationSeconds = 0;
  state.advancedWanClipOrder = 0;
  state.advancedAudioAssetId = "";
  state.advancedAudioPreviewUrl = "";
  state.advancedAudioFileName = "";
  state.advancedAudioOrder = 0;
  state.advancedAssetTarget = "primary";

  [
    els.advancedPrompt,
    els.advancedSeedanceVideoUrls,
    els.advancedSeedanceAudioUrls,
    els.advancedWanSeed,
    els.advancedWanAudioUrl,
    els.advancedWanClipUrl,
  ].forEach((input) => {
    if (input) input.value = "";
  });
  if (els.advancedSeedanceGenerateAudio) els.advancedSeedanceGenerateAudio.value = "true";
  if (els.advancedPreprocessReference) els.advancedPreprocessReference.checked = false;
  if (els.advancedWanPromptExtend) els.advancedWanPromptExtend.checked = false;
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
  updateAdvancedModelControls();
}

async function requestAdvancedAccess() {
  if (!state.user) return openLogin();
  try {
    const payload = await requestJson("/api/advanced/request-access", { method: "POST" });
    if (payload.user) setUser(payload.user);
    if (els.advancedNote) els.advancedNote.textContent = t("advanced.requestSubmitted");
  } catch (error) {
    if (els.advancedNote) els.advancedNote.textContent = error.message;
  }
}

async function submitAdvancedGenerate() {
  if (!state.user) return openLogin();
  const promptInput = els.advancedPrompt?.value.trim() || "";
  const usingPresetFlow = advancedCreateModeUsesPresetBuilder();
  const autoPrompt = advancedCreateModeUsesAutoPrompt();
  if (usingPresetFlow && advancedCreateModeRequiresActionPreset() && !selectedAdvancedPreset("action")) {
    if (els.advancedNote) els.advancedNote.textContent = t("advancedPreset.actionRequired");
    return;
  }
  if (usingPresetFlow && nonCustomAdvancedNeedsCharacterImage() && !hasAdvancedCharacterImage()) {
    if (els.advancedNote) els.advancedNote.textContent = t("advancedPreset.characterRequired");
    return;
  }
  const basePrompt = autoPrompt ? advancedCreateModeDefaultPrompt() : promptInput;
  const prompt = advancedEffectivePrompt(basePrompt);
  if (!prompt && currentAdvancedProvider() !== "wan30") {
    if (els.advancedNote) els.advancedNote.textContent = t("advanced.promptRequired");
    return;
  }
  if (advancedCreateModeIsSimpleEdit()) {
    if (state.advancedCreateMode === "image-edit" && !selectedAdvancedReferenceImages("wan27-image-edit").length) {
      if (els.advancedNote) els.advancedNote.textContent = t("advanced.editImageRequired", {}, "Upload one image first.");
      return;
    }
    if (state.advancedCreateMode === "video-edit" && !state.advancedSeedanceVideoAssetId) {
      if (els.advancedNote) els.advancedNote.textContent = t("advanced.editVideoRequired", {}, "Upload one video first.");
      return;
    }
  }
  const currentCase = state.advancedCases.find((item) => item.id === state.activeAdvancedCaseId);
  if (currentCase?.prompt && currentCase.prompt !== prompt) state.activeAdvancedCaseId = "";
  els.advancedSubmitBtn.disabled = true;
  const provider = currentAdvancedProvider();
  const seedanceTier = currentSeedanceTier();
  const seedreamTier = currentSeedreamTier();
  const advancedPresetSelection = usingPresetFlow ? advancedPresetSelectionPayload() : undefined;
  const presetReferenceImages = usingPresetFlow ? advancedPresetReferenceImages() : [];
  const presetVideoReferences = usingPresetFlow ? advancedPresetVideoReferences() : [];
  if (["qwen37-flash", "byteplus-language"].includes(provider)) {
    const enableThinking = els.advancedQwen37Thinking?.value === "true";
    const maxTokens = Math.max(1, Math.min(8192, Number(els.advancedQwen37MaxTokens?.value || 1024) || 1024));
    const temperature = Math.max(0, Math.min(2, Number(els.advancedQwen37Temperature?.value || 0.7)));
    const pendingTaskId = `pending-text-${Date.now().toString(36)}`;
    mergeAdvancedResultRecord({
      taskId: pendingTaskId,
      status: "submitting",
      model: provider === "byteplus-language" ? "ep-20260827122554-8fsgw" : "qwen3.7-flash",
      provider,
      source: provider === "byteplus-language" ? "advanced-byteplus-language" : "advanced-qwen37-flash",
      kind: "advanced-text",
      prompt,
      params: { enable_thinking: enableThinking, max_tokens: maxTokens, temperature },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    state.advancedResultTaskId = pendingTaskId;
    setAdvancedSideTab("result", { syncMobile: true });
    renderAdvancedResultPanel();
    if (els.advancedNote) els.advancedNote.textContent = "";
    try {
      const payload = await requestJson("/api/advanced/generate", {
        method: "POST",
        body: {
          provider,
          model: provider === "byteplus-language" ? "ep-20260827122554-8fsgw" : "qwen3.7-flash",
          prompt,
          enable_thinking: enableThinking,
          max_tokens: maxTokens,
          temperature,
        },
      });
      if (payload.user) setUser(payload.user);
      state.advancedResultRecords = (state.advancedResultRecords || []).filter((record) => record.taskId !== pendingTaskId);
      if (payload.record) {
        state.historyRecords = [payload.record, ...(state.historyRecords || []).filter((record) => record.taskId !== payload.record.taskId)];
        mergeAdvancedResultRecord(payload.record);
      }
      state.advancedResultTaskId = payload.taskId || payload.record?.taskId || "";
      clearAdvancedCreationInputs();
      setAdvancedSideTab("result", { syncMobile: true });
      renderAdvancedResultPanel();
      if (state.advancedResultTaskId) scheduleAdvancedResultRefresh({ delayMs: 800, force: true });
    } catch (error) {
      state.advancedResultRecords = (state.advancedResultRecords || []).map((record) => (
        record.taskId === pendingTaskId
          ? { ...record, status: "failed", error: error.message || String(error), updatedAt: new Date().toISOString() }
          : record
      ));
      if (state.advancedResultTaskId === pendingTaskId) state.advancedResultTaskId = "";
      renderAdvancedResultPanel();
    } finally {
      els.advancedSubmitBtn.disabled = false;
      updateAdvancedButtonCost();
    }
    return;
  }
  if (["seedream5-image", "qwen-image3"].includes(provider)) {
    const qwenImage = provider === "qwen-image3";
    const qwenTier = qwenImage ? currentQwenImage3Tier() : "";
    const outputImageCount = qwenImage ? Math.max(1, Math.min(6, Number(els.advancedQwenOutputCount?.value || 1))) : 1;
    const references = selectedAdvancedReferenceImages(provider);
    const referencesReady = await guardAdvancedSubmitAssets(references.map((item) => item.assetId));
    if (!referencesReady) {
      els.advancedSubmitBtn.disabled = false;
      return;
    }
    const pendingTaskId = `pending-image-${Date.now().toString(36)}`;
    mergeAdvancedResultRecord({
      taskId: pendingTaskId,
      status: "submitting",
      model: advancedProviderLabel(provider),
      provider,
      source: qwenImage ? "advanced-qwen-image3" : "advanced-seedream5-image",
      kind: "advanced-image",
      prompt,
      presets: advancedPresetSelection,
      params: {
        createKind: state.advancedCreateKind,
        createMode: state.advancedCreateMode,
        presets: advancedPresetSelection,
        seedreamTier,
        ...(qwenImage ? { qwenTier, outputImageCount } : {}),
        referenceImageCount: references.length,
      },
      resolution: currentAdvancedResolution(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    state.advancedResultTaskId = pendingTaskId;
    setAdvancedSideTab("result", { syncMobile: true });
    renderAdvancedResultPanel();
    if (els.advancedNote) els.advancedNote.textContent = "";
    try {
      const payload = await requestJson("/api/advanced/generate", {
        method: "POST",
        body: {
          caseId: state.activeAdvancedCaseId,
          provider,
          ...(qwenImage
            ? {
                qwenTier,
                model: qwenTier === "standard" ? "qwen-image-3.0" : "qwen-image-3.0-pro",
                n: outputImageCount,
                prompt_extend: els.advancedQwenPromptExtend?.value !== "false",
                watermark: els.advancedQwenWatermark?.value === "true",
                seed: els.advancedWanSeed?.value === "" ? undefined : Number(els.advancedWanSeed.value),
              }
            : { seedreamTier }),
          prompt,
          referenceImages: references.map(seedanceImageRefPayload),
          resolution: currentAdvancedResolution(),
          ratio: currentAdvancedRatio(),
          params: {
            createKind: state.advancedCreateKind,
            createMode: state.advancedCreateMode,
            presets: advancedPresetSelection,
          },
        },
      });
      if (payload.user) setUser(payload.user);
      state.advancedResultRecords = (state.advancedResultRecords || []).filter((record) => record.taskId !== pendingTaskId);
      if (payload.record) {
        state.historyRecords = [payload.record, ...(state.historyRecords || []).filter((record) => record.taskId !== payload.record.taskId)];
        mergeAdvancedResultRecord(payload.record);
      }
      state.advancedResultTaskId = payload.taskId || payload.record?.taskId || "";
      clearAdvancedCreationInputs();
      if (els.advancedNote) els.advancedNote.textContent = "";
      setAdvancedSideTab("result", { syncMobile: true });
      renderAdvancedResultPanel();
      await loadHistory({ silent: true, refresh: true, page: 1 }).catch(() => {});
    } catch (error) {
      if (handleAdvancedReferenceMissingError(error, pendingTaskId)) return;
      state.advancedResultRecords = (state.advancedResultRecords || []).map((record) => (
        record.taskId === pendingTaskId
          ? { ...record, status: "failed", error: error.message || String(error), updatedAt: new Date().toISOString() }
          : record
      ));
      if (state.advancedResultTaskId === pendingTaskId) state.advancedResultTaskId = "";
      renderAdvancedResultPanel();
      if (els.advancedNote) els.advancedNote.textContent = "";
    } finally {
      els.advancedSubmitBtn.disabled = false;
      updateAdvancedButtonCost();
    }
    return;
  }
  if (provider === "wan27-image-edit") {
    const imageReferences = dedupeAdvancedReferenceImages([
      ...presetReferenceImages,
      ...selectedAdvancedReferenceImages("wan27-image-edit"),
    ]).slice(0, ADVANCED_SEEDANCE_REFERENCE_LIMIT);
    const referencesReady = await guardAdvancedSubmitAssets(imageReferences.map((item) => item.assetId));
    if (!referencesReady) {
      els.advancedSubmitBtn.disabled = false;
      return;
    }
    const pendingTaskId = `pending-image-${Date.now().toString(36)}`;
    mergeAdvancedResultRecord({
      taskId: pendingTaskId,
      status: "submitting",
      model: advancedProviderLabel(provider),
      provider,
      source: "asset-image-modify",
      kind: "asset-image",
      prompt,
      presets: advancedPresetSelection,
      params: {
        createKind: state.advancedCreateKind,
        createMode: state.advancedCreateMode,
        presets: advancedPresetSelection,
      },
      ratio: currentAdvancedRatio(),
      resolution: currentAdvancedResolution(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    state.advancedResultTaskId = pendingTaskId;
    setAdvancedSideTab("result", { syncMobile: true });
    renderAdvancedResultPanel();
    if (els.advancedNote) els.advancedNote.textContent = "";
    try {
      const { assets, imageUrls } = await ensureAdvancedImageEditAssets(imageReferences);
      renderAdvancedResultPanel();
      const payload = await requestJson("/api/wan27/image-edit", {
        method: "POST",
        body: {
          prompt,
          imageAssetIds: assets.map((asset) => asset.id),
          imageUrls,
          ratio: currentAdvancedRatio(),
          resolution: currentAdvancedResolution(),
          params: {
            createKind: state.advancedCreateKind,
            createMode: state.advancedCreateMode,
            presets: advancedPresetSelection,
          },
          async: true,
        },
      });
      if (payload.user) setUser(payload.user);
      state.advancedResultRecords = (state.advancedResultRecords || []).filter((record) => record.taskId !== pendingTaskId);
      if (payload.record) {
        state.historyRecords = [payload.record, ...(state.historyRecords || []).filter((record) => record.taskId !== payload.record.taskId)];
        mergeAdvancedResultRecord(payload.record);
      }
      state.advancedResultTaskId = payload.taskId || payload.record?.taskId || "";
      clearAdvancedCreationInputs();
      if (els.advancedNote) els.advancedNote.textContent = "";
      setAdvancedSideTab("result", { syncMobile: true });
      renderAdvancedResultPanel();
      if (state.advancedResultTaskId) scheduleAdvancedResultRefresh({ delayMs: 1200, force: true });
      await loadHistory({ silent: true }).catch(() => {});
    } catch (error) {
      if (handleAdvancedReferenceMissingError(error, pendingTaskId)) return;
      state.advancedResultRecords = (state.advancedResultRecords || []).map((record) => (
        record.taskId === pendingTaskId
          ? { ...record, status: "failed", error: error.message || String(error), updatedAt: new Date().toISOString() }
          : record
      ));
      if (state.advancedResultTaskId === pendingTaskId) state.advancedResultTaskId = "";
      renderAdvancedResultPanel();
      if (els.advancedNote) els.advancedNote.textContent = "";
    } finally {
      els.advancedSubmitBtn.disabled = false;
      updateAdvancedButtonCost();
    }
    return;
  }
  const videoCapability = currentAdvancedVideoCapability();
  const bounds = advancedDurationBounds(provider, videoCapability);
  const rawDurationValue = Number(els.advancedDuration?.value || bounds.fallback);
  let duration = provider === "wan30" && rawDurationValue === -1
    ? -1
    : Math.min(bounds.max, Math.max(provider === "wan30" ? 2 : bounds.min, Number.isFinite(rawDurationValue) ? rawDurationValue : bounds.fallback));
  const resolution = currentAdvancedResolution();
  const legacyWanModel = videoCapability === "wan-legacy" ? String(els.advancedLegacyWanModel?.value || "").trim() : "";
  const wanAnimateMode = ["wan-animate-move", "wan-animate-mix"].includes(videoCapability)
    ? String(els.advancedWanAnimateMode?.value || "wan-std")
    : "";
  const preprocessReference = ["seedance", "seedance25", "seedance-nsfw"].includes(provider)
    && Boolean(els.advancedPreprocessReference?.checked);
  const rawWanMediaMode = normalizeWanMediaMode(els.advancedWanMediaMode?.value || "multimodal");
  const rawSeedanceMode = normalizeSeedanceMediaMode(els.advancedSeedanceMediaMode?.value || "reference_video");
  const mediaMode = provider === "wan30"
    ? (seedanceModeNeedsFirstFrame(rawSeedanceMode) ? "first_last_frame" : "multimodal")
    : provider === "wan27" && (videoCapability === "wan27-i2v" || videoCapability === "wan-legacy")
      ? resolvedWanSubmitMediaMode(rawWanMediaMode)
      : videoCapability;
  const presetReferenceMode = provider === "seedance"
    && usingPresetFlow
    && advancedCreateModeUsesCharacterPresetReference()
    && presetReferenceImages.length > 0;
  const seedanceMode = presetReferenceMode ? "reference_video" : rawSeedanceMode;
  if (presetReferenceMode && els.advancedSeedanceMediaMode) els.advancedSeedanceMediaMode.value = "reference_video";
  const sharedReferenceProvider = ["seedance", "seedance25", "seedance-nsfw", "wan30"].includes(provider);
  const seedanceFrameMode = sharedReferenceProvider && seedanceModeNeedsFirstFrame(seedanceMode);
  const seedance25VideoOnlyMode = provider === "seedance-nsfw" && ["edit", "extend"].includes(seedanceMode);
  const referenceImages = seedanceFrameMode || seedance25VideoOnlyMode
    ? []
    : usingPresetFlow
    ? dedupeAdvancedReferenceImages([
        ...presetReferenceImages,
        ...(Array.isArray(state.advancedReferenceImages) ? state.advancedReferenceImages : []),
      ]).slice(0, provider === "wan30" || provider === "wan27" || provider === "happyhorse"
        ? advancedAliyunReferenceImageLimit(videoCapability)
        : ADVANCED_SEEDANCE_REFERENCE_LIMIT)
    : selectedAdvancedReferenceImages();
  const documentReference = provider === "wan30" && state.advancedDocumentReference ? state.advancedDocumentReference : null;
  const isWanI2v = provider === "wan27" && videoCapability === "wan27-i2v";
  const wanI2vFrames = isWanI2v
    ? resolvedWanI2vFrames(referenceImages)
    : { first: referenceImages[0] || null, last: null };
  const wanFirstFrameReference = wanI2vFrames.first;
  const wanLastFrameReference = wanI2vFrames.last;
  const wanFirstFrameAssetId = isWanI2v
    ? (wanFirstFrameReference?.assetId || "")
    : (state.advancedFirstFrameAssetId || wanFirstFrameReference?.assetId || "");
  const wanLastFrameAssetId = state.advancedWanLastFrameAssetId || wanLastFrameReference?.assetId || "";
  const wanFirstFrameSource = isWanI2v
    ? (wanFirstFrameReference?.dataUrl || wanFirstFrameReference?.url || "")
    : (wanFirstFrameReference?.dataUrl || wanFirstFrameReference?.url || state.advancedUploadDataUrl || "");
  const wanLastFrameSource = state.advancedWanLastFrameDataUrl || wanLastFrameReference?.dataUrl || wanLastFrameReference?.url || "";
  const caseVideoUrl = provider === "seedance" && advancedCreateModeNeedsReplacePair()
    ? absoluteHttpUrl(advancedCaseInputVideo(currentCase || {}))
    : "";
  const seedanceVideoRefs = sharedReferenceProvider && !seedanceFrameMode
    ? dedupeAdvancedMediaReferences([...presetVideoReferences, ...advancedSeedanceVideoReferences()]).slice(0, advancedVideoReferenceLimit(provider))
    : [];
  const seedanceAudioRefs = sharedReferenceProvider && !seedanceFrameMode && !seedance25VideoOnlyMode ? advancedSeedanceAudioReferences() : [];
  const seedanceVideoAssetIds = seedanceVideoRefs.map((item) => item.assetId || "").filter(Boolean);
  const seedanceAudioAssetIds = seedanceAudioRefs.map((item) => item.assetId || "").filter(Boolean);
  const seedanceVideoRefUrls = seedanceVideoRefs.filter((item) => !item.assetId).map((item) => item.url || item.previewUrl || "").filter(Boolean);
  const seedanceAudioRefUrls = seedanceAudioRefs.filter((item) => !item.assetId).map((item) => item.url || item.previewUrl || "").filter(Boolean);
  const seedanceVideoUrls = splitUrlList(els.advancedSeedanceVideoUrls?.value || "");
  const effectiveSeedanceVideoUrls = advancedCreateModeIsSimpleEdit()
    ? []
    : seedanceFrameMode
    ? []
    : [...seedanceVideoRefUrls, ...seedanceVideoUrls, ...(caseVideoUrl ? [caseVideoUrl] : [])];
  const seedanceAudioUrls = seedanceFrameMode ? [] : [...seedanceAudioRefUrls, ...splitUrlList(els.advancedSeedanceAudioUrls?.value || "")];
  const seedanceGenerateAudio = sharedReferenceProvider ? advancedBoolFromValue(els.advancedSeedanceGenerateAudio?.value, true) : true;
  const promptExtend = provider === "wan30" && Boolean(els.advancedWanPromptExtend?.checked);
  if (sharedReferenceProvider) state.advancedSeedanceGenerateAudio = seedanceGenerateAudio;
  const selectedClipAsset = state.advancedWanClipAssetId
    ? [...(state.advancedAssets || []), ...(state.userAssets || [])].find((asset) => asset.id === state.advancedWanClipAssetId)
    : null;
  const aliyunInputVideoSeconds = positiveDurationSeconds(
    state.advancedWanClipDurationSeconds || selectedClipAsset?.durationSeconds || selectedClipAsset?.duration,
    state.advancedWanClipAssetId || state.advancedWanClipDataUrl || String(els.advancedWanClipUrl?.value || "").trim() ? duration : 0,
  );
  if (advancedVideoEditUsesSourceDuration(videoCapability) && aliyunInputVideoSeconds > 0) {
    duration = Math.min(bounds.max, Math.max(bounds.min, Math.ceil(aliyunInputVideoSeconds)));
  }
  const inputVideoSeconds = sharedReferenceProvider
    ? seedanceVideoRefs.reduce((sum, item) => sum + positiveDurationSeconds(item.durationSeconds || item.duration), 0)
    : aliyunInputVideoSeconds;
  const seedanceFirstFrameAssetId = state.advancedSeedanceFirstFrameAssetId || state.advancedFirstFrameAssetId || "";
  const seedanceFirstFrameData = state.advancedSeedanceFirstFrameDataUrl || "";
  if (provider === "seedance" && seedanceModeNeedsFirstFrame(seedanceMode) && !seedanceFirstFrameData && !seedanceFirstFrameAssetId) {
    els.advancedSubmitBtn.disabled = false;
    if (els.advancedNote) els.advancedNote.textContent = t("advanced.seedanceFirstRequired");
    return;
  }
  if (provider === "seedance" && seedanceModeNeedsLastFrame(seedanceMode) && !state.advancedSeedanceLastFrameDataUrl && !state.advancedSeedanceLastFrameAssetId) {
    els.advancedSubmitBtn.disabled = false;
    if (els.advancedNote) els.advancedNote.textContent = t("advanced.seedanceLastRequired");
    return;
  }
  if (["seedance25", "seedance-nsfw"].includes(provider) && seedanceModeNeedsFirstFrame(seedanceMode) && !seedanceFirstFrameData && !seedanceFirstFrameAssetId) {
    els.advancedSubmitBtn.disabled = false;
    if (els.advancedNote) els.advancedNote.textContent = "First frame image is required.";
    return;
  }
  if (["seedance25", "seedance-nsfw"].includes(provider) && seedanceModeNeedsLastFrame(seedanceMode) && !state.advancedSeedanceLastFrameDataUrl && !state.advancedSeedanceLastFrameAssetId) {
    els.advancedSubmitBtn.disabled = false;
    if (els.advancedNote) els.advancedNote.textContent = "Last frame image is required.";
    return;
  }
  if (provider === "wan30" && seedanceModeNeedsFirstFrame(seedanceMode) && !seedanceFirstFrameData && !seedanceFirstFrameAssetId) {
    els.advancedSubmitBtn.disabled = false;
    if (els.advancedNote) els.advancedNote.textContent = "First frame image is required.";
    return;
  }
  if (provider === "wan30" && seedanceModeNeedsLastFrame(seedanceMode) && !state.advancedSeedanceLastFrameDataUrl && !state.advancedSeedanceLastFrameAssetId) {
    els.advancedSubmitBtn.disabled = false;
    if (els.advancedNote) els.advancedNote.textContent = "Last frame image is required.";
    return;
  }
  if (provider === "wan30" && !prompt && !referenceImages.length && !seedanceVideoRefs.length && !seedanceAudioRefs.length && !documentReference && !seedanceFrameMode) {
    els.advancedSubmitBtn.disabled = false;
    if (els.advancedNote) els.advancedNote.textContent = "Prompt or reference media is required.";
    return;
  }
  if (provider === "wan30") {
    if (documentReference && (referenceImages.length || seedanceVideoRefs.length || seedanceAudioRefs.length || seedanceFrameMode)) {
      els.advancedSubmitBtn.disabled = false;
      if (els.advancedNote) els.advancedNote.textContent = "Wan 3.0 documents cannot be combined with other media inputs.";
      return;
    }
    const videoSeconds = seedanceVideoRefs.reduce((sum, item) => sum + positiveDurationSeconds(item.durationSeconds || item.duration), 0);
    const audioSeconds = seedanceAudioRefs.reduce((sum, item) => sum + positiveDurationSeconds(item.durationSeconds || item.duration), 0);
    if (videoSeconds > 15 || audioSeconds > 15) {
      els.advancedSubmitBtn.disabled = false;
      if (els.advancedNote) els.advancedNote.textContent = `Wan 3.0 reference ${videoSeconds > 15 ? "videos" : "audios"} must total 15 seconds or less.`;
      return;
    }
    if (duration !== -1 && videoSeconds > 0 && videoSeconds + duration > 30) {
      els.advancedSubmitBtn.disabled = false;
      if (els.advancedNote) els.advancedNote.textContent = "Input video duration plus output duration must not exceed 30 seconds.";
      return;
    }
  }
  if (["seedance25", "seedance-nsfw"].includes(provider)) {
    const totalReferences = referenceImages.length + seedanceVideoRefs.length + seedanceAudioRefs.length;
    if (provider === "seedance25" && resolution === "720p" && duration > 29) {
      els.advancedSubmitBtn.disabled = false;
      if (els.advancedNote) els.advancedNote.textContent = "Seedance 2.5 720p supports 4-29 seconds.";
      return;
    }
    if (seedanceMode === "omini" && totalReferences === 0) {
      els.advancedSubmitBtn.disabled = false;
      if (els.advancedNote) els.advancedNote.textContent = "Add at least one image, video, or audio reference.";
      return;
    }
    if (provider === "seedance25" && seedanceMode === "omini" && seedanceAudioRefs.length > 0 && !referenceImages.length && !seedanceVideoRefs.length) {
      els.advancedSubmitBtn.disabled = false;
      if (els.advancedNote) els.advancedNote.textContent = "Audio must be combined with an image or video reference.";
      return;
    }
    if (seedanceMode === "omini" && totalReferences > ADVANCED_SEEDANCE25_TOTAL_REFERENCE_LIMIT) {
      els.advancedSubmitBtn.disabled = false;
      if (els.advancedNote) els.advancedNote.textContent = `Seedance 2.5 supports at most ${ADVANCED_SEEDANCE25_TOTAL_REFERENCE_LIMIT} references.`;
      return;
    }
    if (provider === "seedance-nsfw" && ["edit", "extend"].includes(seedanceMode) && seedanceVideoRefs.length !== 1) {
      els.advancedSubmitBtn.disabled = false;
      if (els.advancedNote) els.advancedNote.textContent = `${seedanceMode === "edit" ? "Video Edit" : "Video Extend"} requires exactly one source video.`;
      return;
    }
  }
  if (provider === "seedance" && advancedCreateModeNeedsReplacePair() && !referenceImages.length) {
    els.advancedSubmitBtn.disabled = false;
    if (els.advancedNote) els.advancedNote.textContent = t("advanced.seedanceFirstRequired");
    return;
  }
  if (provider === "seedance" && seedanceTier === "fast" && ["1080p", "4k"].includes(resolution)) {
    els.advancedSubmitBtn.disabled = false;
    if (els.advancedNote) els.advancedNote.textContent = `${advancedProviderLabel(provider)} Fast does not support ${resolution === "4k" ? "4K" : "1080p"}.`;
    return;
  }
  if (provider === "wan27" || provider === "happyhorse") {
    const usesWanFrameModes = provider === "wan27" && (videoCapability === "wan27-i2v" || videoCapability === "wan-legacy");
    const hasPrimaryImage = Boolean(wanFirstFrameSource || wanFirstFrameAssetId || referenceImages[0]);
    const hasReferenceImages = referenceImages.length > 0;
    const hasVideo = Boolean(presetVideoReferences[0]?.url || state.advancedWanClipDataUrl || String(els.advancedWanClipUrl?.value || "").trim() || state.advancedWanClipAssetId);
    const durationMessage = hasVideo
      ? advancedVideoInputDurationMessage(aliyunInputVideoSeconds, provider, videoCapability, { allowUnknown: true })
      : "";
    if (durationMessage) {
      els.advancedSubmitBtn.disabled = false;
      if (els.advancedNote) els.advancedNote.textContent = durationMessage;
      return;
    }
    if (["happyhorse-i2v", "wan-animate-move", "wan-animate-mix"].includes(videoCapability) && !hasPrimaryImage) {
      els.advancedSubmitBtn.disabled = false;
      if (els.advancedNote) els.advancedNote.textContent = "Image is required.";
      return;
    }
    if (["wan27-r2v", "happyhorse-r2v"].includes(videoCapability) && !hasReferenceImages && !hasVideo) {
      els.advancedSubmitBtn.disabled = false;
      if (els.advancedNote) els.advancedNote.textContent = "Reference media is required.";
      return;
    }
    if (["wan27-video-edit", "happyhorse-video-edit", "wan-animate-move", "wan-animate-mix"].includes(videoCapability) && !hasVideo) {
      els.advancedSubmitBtn.disabled = false;
      if (els.advancedNote) els.advancedNote.textContent = "Source video is required.";
      return;
    }
    if (usesWanFrameModes && wanModeNeedsFirstFrame(mediaMode) && !wanFirstFrameSource && !wanFirstFrameAssetId) {
      els.advancedSubmitBtn.disabled = false;
      if (els.advancedNote) els.advancedNote.textContent = "First frame image is required.";
      return;
    }
    if (usesWanFrameModes && wanModeNeedsLastFrame(mediaMode) && !wanLastFrameSource && !wanLastFrameAssetId) {
      els.advancedSubmitBtn.disabled = false;
      if (els.advancedNote) els.advancedNote.textContent = "Last frame image is required.";
      return;
    }
    if (usesWanFrameModes && wanModeNeedsAudio(mediaMode) && !state.advancedAudioAssetId) {
      els.advancedSubmitBtn.disabled = false;
      if (els.advancedNote) els.advancedNote.textContent = "Audio is required.";
      return;
    }
    if (usesWanFrameModes && wanModeNeedsClip(mediaMode) && !state.advancedWanClipDataUrl && !state.advancedWanClipAssetId) {
      els.advancedSubmitBtn.disabled = false;
      if (els.advancedNote) els.advancedNote.textContent = t("advanced.clipRequired");
      return;
    }
  }
  const submitAssetIds = sharedReferenceProvider
    ? [
        seedanceModeNeedsFirstFrame(seedanceMode) ? seedanceFirstFrameAssetId : "",
        seedanceModeNeedsLastFrame(seedanceMode) ? state.advancedSeedanceLastFrameAssetId : "",
        ...referenceImages.map((item) => item.assetId || ""),
        ...seedanceVideoAssetIds,
        ...seedanceAudioAssetIds,
        documentReference?.assetId || "",
      ]
    : [
        state.advancedFirstFrameAssetId,
        state.advancedWanLastFrameAssetId,
        state.advancedWanClipAssetId,
        state.advancedAudioAssetId,
        ...referenceImages.map((item) => item.assetId || ""),
      ];
  const referencesReady = await guardAdvancedSubmitAssets(submitAssetIds);
  if (!referencesReady) {
    els.advancedSubmitBtn.disabled = false;
    return;
  }
  if (provider === "seedance" && autoPrompt) {
    const confirmed = await confirmAdvancedSimpleActionCost(advancedSimpleActionCostLabel(provider, duration, resolution, currentAdvancedRatio()));
    if (!confirmed) {
      els.advancedSubmitBtn.disabled = false;
      updateAdvancedButtonCost();
      return;
    }
  }
  const pendingTaskId = `pending-video-${Date.now().toString(36)}`;
  mergeAdvancedResultRecord({
    taskId: pendingTaskId,
    status: "submitting",
    model: advancedProviderLabel(provider),
    provider,
    source: provider === "seedance-nsfw" ? "advanced-seedance-nsfw" : provider === "seedance25" ? "advanced-seedance25" : provider === "seedance" ? "advanced-seedance" : provider === "wan30" ? "advanced-wan30" : provider === "happyhorse" ? "advanced-happyhorse" : `advanced-${videoCapability || "wan27"}`,
    kind: "advanced-video",
    prompt,
    presets: advancedPresetSelection,
    params: {
      createKind: state.advancedCreateKind,
      createMode: state.advancedCreateMode,
      presets: advancedPresetSelection,
      videoCapability: videoCapability || undefined,
      model: legacyWanModel || undefined,
      animateMode: wanAnimateMode || undefined,
      ...(provider === "wan30" ? { prompt_extend: promptExtend } : {}),
      ...(["seedance", "seedance25", "seedance-nsfw", "wan30"].includes(provider) ? { generateAudio: seedanceGenerateAudio, generate_audio: seedanceGenerateAudio } : {}),
    },
    ratio: els.advancedRatio?.value || (provider === "wan30" ? "adaptive" : "9:16"),
    resolution,
    duration,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });
  state.advancedResultTaskId = pendingTaskId;
  setAdvancedSideTab("result", { syncMobile: true });
  renderAdvancedResultPanel();
  if (els.advancedNote) els.advancedNote.textContent = "";
  try {
    const firstFrameSource = sharedReferenceProvider ? state.advancedSeedanceFirstFrameDataUrl : wanFirstFrameSource;
    const firstFrameDataUrl = dataUrlValue(firstFrameSource);
    const firstFrameUrl = absoluteHttpUrl(firstFrameSource);
    const seedanceLastFrameDataUrl = dataUrlValue(state.advancedSeedanceLastFrameDataUrl);
    const seedanceLastFrameUrl = absoluteHttpUrl(state.advancedSeedanceLastFrameDataUrl);
    const wanLastFrameDataUrl = dataUrlValue(wanLastFrameSource);
    const wanLastFrameUrl = absoluteHttpUrl(wanLastFrameSource);
    const capabilityUsesVideo = [
      "wan27-r2v", "wan27-video-edit", "wan-animate-move", "wan-animate-mix", "happyhorse-video-edit",
    ].includes(videoCapability) || (videoCapability === "wan-legacy" && /r2v|vace/.test(legacyWanModel));
    const presetActionVideo = presetVideoReferences[0] || null;
    const wanClipSource = capabilityUsesVideo
      ? (state.advancedWanClipDataUrl || presetActionVideo?.url || presetActionVideo?.videoUrl || "")
      : selectedWanClipData(mediaMode);
    const wanClipDataUrl = dataUrlValue(wanClipSource);
    const wanClipUrl = capabilityUsesVideo
      ? (String(els.advancedWanClipUrl?.value || "").trim() || absoluteHttpUrl(wanClipSource) || presetActionVideo?.url || "")
      : (selectedWanClipUrl(mediaMode) || absoluteHttpUrl(wanClipSource));
    const wanClipFileName = capabilityUsesVideo ? (state.advancedWanClipFileName || presetActionVideo?.fileName || "action.mp4") : selectedWanClipFileName(mediaMode);
    const aliyunPrimaryCapabilities = new Set(["wan27-i2v", "happyhorse-i2v", "wan-animate-move", "wan-animate-mix"]);
    const usesAliyunPrimaryImage = aliyunPrimaryCapabilities.has(videoCapability)
      || (videoCapability === "wan-legacy" && !/t2v|r2v|vace/.test(legacyWanModel));
    const aliyunReferenceCapabilities = new Set(["wan30-video", "wan30-video-prime", "wan27-r2v", "wan27-video-edit", "happyhorse-r2v", "happyhorse-video-edit"]);
    const aliyunReferenceImages = aliyunReferenceCapabilities.has(videoCapability)
      ? referenceImages.map(seedanceImageRefPayload)
      : undefined;
    const payload = await requestJson("/api/advanced/generate", {
      method: "POST",
      body: {
        caseId: state.activeAdvancedCaseId,
        provider,
        videoCapability: videoCapability || undefined,
        model: legacyWanModel || undefined,
        animateMode: wanAnimateMode || undefined,
        seedanceTier: provider === "seedance" ? seedanceTier : undefined,
        prompt,
        prompt_extend: provider === "wan30" ? promptExtend : undefined,
        generateAudio: ["seedance", "seedance25", "seedance-nsfw", "wan30"].includes(provider) ? seedanceGenerateAudio : undefined,
        generate_audio: ["seedance", "seedance25", "seedance-nsfw", "wan30"].includes(provider) ? seedanceGenerateAudio : undefined,
        dataUrl: usesAliyunPrimaryImage && !wanFirstFrameAssetId ? firstFrameDataUrl : undefined,
        seedanceMode: ["seedance", "seedance25", "seedance-nsfw"].includes(provider) ? seedanceMode : undefined,
        functionMode: ["seedance25", "seedance-nsfw"].includes(provider) ? seedanceMode : undefined,
        imageAssetId: sharedReferenceProvider && seedanceModeNeedsFirstFrame(seedanceMode) ? seedanceFirstFrameAssetId : undefined,
        firstFrameAssetId: usesAliyunPrimaryImage ? wanFirstFrameAssetId : sharedReferenceProvider && seedanceModeNeedsFirstFrame(seedanceMode) ? seedanceFirstFrameAssetId : undefined,
        firstFrameDataUrl: (usesAliyunPrimaryImage && !wanFirstFrameAssetId) || (sharedReferenceProvider && seedanceModeNeedsFirstFrame(seedanceMode) && !seedanceFirstFrameAssetId) ? firstFrameDataUrl : undefined,
        firstFrameUrl: (usesAliyunPrimaryImage && !wanFirstFrameAssetId) || (sharedReferenceProvider && seedanceModeNeedsFirstFrame(seedanceMode) && !seedanceFirstFrameAssetId) ? firstFrameUrl : undefined,
        imageUrl: ["seedance", "seedance25", "seedance-nsfw"].includes(provider) && seedanceModeNeedsFirstFrame(seedanceMode) && !seedanceFirstFrameAssetId ? firstFrameUrl : undefined,
        endImageAssetId: sharedReferenceProvider && seedanceModeNeedsLastFrame(seedanceMode) ? (state.advancedSeedanceLastFrameAssetId || "") : undefined,
        lastFrameAssetId: provider === "wan27" ? wanLastFrameAssetId : sharedReferenceProvider && seedanceModeNeedsLastFrame(seedanceMode) ? (state.advancedSeedanceLastFrameAssetId || "") : "",
        endImageDataUrl: sharedReferenceProvider && seedanceModeNeedsLastFrame(seedanceMode) && !state.advancedSeedanceLastFrameAssetId ? seedanceLastFrameDataUrl : undefined,
        endImageUrl: sharedReferenceProvider && seedanceModeNeedsLastFrame(seedanceMode) && !state.advancedSeedanceLastFrameAssetId ? seedanceLastFrameUrl : undefined,
        referenceImages: sharedReferenceProvider && !seedanceFrameMode
          ? referenceImages.map(seedanceImageRefPayload)
          : aliyunReferenceImages,
        referenceVideoAssetId: sharedReferenceProvider && !seedanceFrameMode ? (seedanceVideoAssetIds[0] || "") : undefined,
        referenceVideoAssetIds: sharedReferenceProvider && !seedanceFrameMode ? seedanceVideoAssetIds : undefined,
        referenceAudioAssetId: sharedReferenceProvider && !seedanceFrameMode ? (seedanceAudioAssetIds[0] || "") : undefined,
        referenceAudioAssetIds: sharedReferenceProvider && !seedanceFrameMode ? seedanceAudioAssetIds : undefined,
        referenceVideoUrls: sharedReferenceProvider && !seedanceFrameMode ? effectiveSeedanceVideoUrls : undefined,
        referenceVideoDurationSeconds: sharedReferenceProvider && !seedanceFrameMode ? inputVideoSeconds : undefined,
        referenceAudioUrls: sharedReferenceProvider && !seedanceFrameMode ? seedanceAudioUrls : undefined,
        referenceFileAssetId: provider === "wan30" && !seedanceFrameMode ? (documentReference?.assetId || "") : undefined,
        videoAssetId: provider === "wan27" || provider === "happyhorse" ? (state.advancedWanClipAssetId || "") : undefined,
        videoDataUrl: provider === "wan27" || provider === "happyhorse" ? wanClipDataUrl : undefined,
        videoUrl: provider === "wan27" || provider === "happyhorse" ? wanClipUrl : undefined,
        videoFileName: provider === "wan27" || provider === "happyhorse" ? wanClipFileName : undefined,
        inputVideoSeconds: provider === "wan27" || provider === "happyhorse" ? inputVideoSeconds : sharedReferenceProvider && !seedanceFrameMode ? inputVideoSeconds : undefined,
        followInputDuration: advancedVideoEditUsesSourceDuration(videoCapability) || undefined,
        lastFrameDataUrl: !wanLastFrameAssetId ? wanLastFrameDataUrl : "",
        lastFrameUrl: !wanLastFrameAssetId ? wanLastFrameUrl : "",
        drivingAudioAssetId: provider === "wan27" && wanModeNeedsAudio(mediaMode) ? (state.advancedAudioAssetId || "") : undefined,
        firstClipDataUrl: wanClipDataUrl,
        firstClipFileName: selectedWanClipFileName(mediaMode),
        firstClipAssetId: provider === "wan27" ? (state.advancedWanClipAssetId || "") : undefined,
        firstClipUrl: wanClipUrl,
        mediaMode,
        fileName: referenceImages[0]?.fileName || els.advancedImage?.files?.[0]?.name || "",
        lastFrameFileName: wanLastFrameReference?.fileName || els.advancedWanLastFrame?.files?.[0]?.name || "",
        ratio: provider === "seedance-nsfw" && seedanceMode !== "omini" ? "adaptive" : els.advancedRatio?.value || (provider === "seedance25" ? "16:9" : provider === "wan30" ? "adaptive" : "9:16"),
        resolution: els.advancedResolution?.value || (["seedance25", "seedance-nsfw"].includes(provider) ? "480p" : provider === "wan30" ? "1080p" : "720p"),
        duration,
        preprocessReference,
        seed: els.advancedWanSeed?.value || "",
        params: {
          createKind: state.advancedCreateKind,
          createMode: state.advancedCreateMode,
          presets: advancedPresetSelection,
          videoCapability: videoCapability || undefined,
          model: legacyWanModel || undefined,
          animateMode: wanAnimateMode || undefined,
          parameters: {
            ...(provider === "wan30" ? { prompt_extend: promptExtend } : {}),
            ...(wanAnimateMode ? { mode: wanAnimateMode } : {}),
          },
          ...(provider === "wan30" ? { prompt_extend: promptExtend } : {}),
          ...(["seedance", "seedance25", "seedance-nsfw", "wan30"].includes(provider) ? { generateAudio: seedanceGenerateAudio, generate_audio: seedanceGenerateAudio } : {}),
        },
      },
    });
    if (payload.user) setUser(payload.user);
    const taskId = payload.taskId || payload.task?.taskId || payload.record?.taskId || "";
    const submittedRecord = payload.record || payload.generation || {
      taskId,
      status: payload.task?.status || "submitted",
      provider,
      source: provider === "seedance-nsfw" ? "advanced-seedance-nsfw" : provider === "seedance25" ? "advanced-seedance25" : provider === "seedance" ? "advanced-seedance" : provider === "wan30" ? "advanced-wan30" : provider === "happyhorse" ? "advanced-happyhorse" : `advanced-${videoCapability || "wan27"}`,
      kind: "advanced-video",
      prompt,
      presets: advancedPresetSelection,
      params: {
        createKind: state.advancedCreateKind,
        createMode: state.advancedCreateMode,
        presets: advancedPresetSelection,
        videoCapability: videoCapability || undefined,
        model: legacyWanModel || undefined,
        animateMode: wanAnimateMode || undefined,
        ...(provider === "wan30" ? { prompt_extend: promptExtend } : {}),
        ...(sharedReferenceProvider ? { generateAudio: seedanceGenerateAudio, generate_audio: seedanceGenerateAudio } : {}),
      },
      ratio: els.advancedRatio?.value || (provider === "wan30" ? "adaptive" : "9:16"),
      resolution: els.advancedResolution?.value || (provider === "wan30" ? "1080p" : "720p"),
      duration,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    state.advancedResultRecords = (state.advancedResultRecords || []).filter((record) => record.taskId !== pendingTaskId);
    if (taskId) {
      state.advancedResultTaskId = taskId;
      mergeAdvancedResultRecord(submittedRecord);
    }
    if (els.advancedNote) els.advancedNote.textContent = "";
    clearAdvancedCreationInputs();
    setAdvancedSideTab("result", { syncMobile: true });
    renderAdvancedResultPanel();
    scheduleAdvancedResultRefresh({ delayMs: 1200, force: true });
    scheduleHistoryRefresh({ delayMs: 8000, force: true });
  } catch (error) {
    if (handleAdvancedReferenceMissingError(error, pendingTaskId)) return;
    state.advancedResultRecords = (state.advancedResultRecords || []).map((record) => (
      record.taskId === pendingTaskId
        ? { ...record, status: "failed", error: error.message || String(error), updatedAt: new Date().toISOString() }
        : record
    ));
    if (state.advancedResultTaskId === pendingTaskId) state.advancedResultTaskId = "";
    renderAdvancedResultPanel();
    if (els.advancedNote) els.advancedNote.textContent = "";
  } finally {
    els.advancedSubmitBtn.disabled = false;
    updateAdvancedButtonCost();
  }
}

function openTemplate(templateId) {
  const template = state.templates.find((item) => item.id === templateId);
  if (!template) return;
  setTab("advanced");
  state.advancedCreateKind = "video";
  state.advancedCreateMode = template.type === "text-to-video" ? "video-text" : "video-image";
  if (template.advancedCaseId) {
    const matched = state.advancedCases.find((item) => item.id === template.advancedCaseId);
    if (matched) {
      fillAdvancedCase(matched);
      return;
    }
  }
  state.activeAdvancedCaseId = "";
  if (els.advancedProvider) els.advancedProvider.value = "seedance";
  if (els.advancedPrompt) els.advancedPrompt.value = template.prompt || template.description || "";
  if (els.advancedSeedanceMediaMode) els.advancedSeedanceMediaMode.value = "reference_video";
  updateAdvancedModelControls();
  setAdvancedSideTab("assets");
  refreshIcons();
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error(t("modal.readImageFailed")));
    reader.readAsDataURL(file);
  });
}

function pastedImageFilesFromEvent(event) {
  const items = Array.from(event?.clipboardData?.items || []);
  return items
    .filter((item) => String(item.type || "").startsWith("image/"))
    .map((item) => item.getAsFile())
    .filter(Boolean);
}

function advancedPromptPasteImageRule() {
  if (state.advancedCreateKind !== "custom") return { allowed: false, limit: 0, target: "references" };
  const provider = currentAdvancedProvider();
  const capability = currentAdvancedVideoCapability();
  const imageTargets = advancedAssetTargetItems().filter((target) => target.type === "image");
  if (!imageTargets.length) return { allowed: false, limit: 0, target: "references" };

  const seedanceMode = normalizeSeedanceMediaMode(els.advancedSeedanceMediaMode?.value || "reference_video");
  const sharedFrameProvider = ["seedance", "seedance25", "seedance-nsfw", "wan30"].includes(provider);
  if (sharedFrameProvider && seedanceModeNeedsFirstFrame(seedanceMode)) {
    return { allowed: true, limit: 2, target: "frames", replaceExisting: false };
  }

  let limit = 1;
  if (provider === "qwen-image3") limit = ADVANCED_QWEN_IMAGE3_REFERENCE_LIMIT;
  else if (provider === "seedream5-image") limit = ADVANCED_SEEDANCE_REFERENCE_LIMIT;
  else if (provider === "wan27-image-edit") limit = advancedCreateModeUsesSingleUpload() ? 1 : ADVANCED_SEEDANCE_REFERENCE_LIMIT;
  else if (provider === "wan30") limit = ADVANCED_WAN30_IMAGE_REFERENCE_LIMIT;
  else if (["seedance25", "seedance-nsfw"].includes(provider)) limit = ADVANCED_SEEDANCE25_IMAGE_REFERENCE_LIMIT;
  else if (provider === "seedance") limit = ADVANCED_SEEDANCE_REFERENCE_LIMIT;
  else if (["wan27", "happyhorse"].includes(provider)) limit = advancedAliyunReferenceImageLimit(capability);
  else if (advancedUsesSharedReferenceUpload(provider, capability)) limit = ADVANCED_SEEDANCE_REFERENCE_LIMIT;

  return {
    allowed: limit > 0,
    limit: Math.max(0, limit),
    target: "references",
    replaceExisting: limit === 1,
  };
}

function advancedPromptPasteTargetIsReferenceImages() {
  return advancedPromptPasteImageRule().allowed;
}

async function handleAdvancedPromptPaste(event) {
  const files = pastedImageFilesFromEvent(event);
  const rule = advancedPromptPasteImageRule();
  if (!files.length || !rule.allowed) return;
  event.preventDefault();
  const provider = currentAdvancedProvider();
  const referenceLimit = rule.limit;
  const maxBytes = currentAdvancedProvider() === "qwen-image3" ? ADVANCED_QWEN_IMAGE3_REFERENCE_MAX_BYTES : ADVANCED_SEEDANCE_REFERENCE_MAX_BYTES;
  const validFiles = files.filter((file) => file.size <= maxBytes);
  if (validFiles.length !== files.length && els.advancedNote) {
    els.advancedNote.textContent = t("advanced.referenceImageTooLarge");
  }
  const previousPromptRefs = advancedPromptMentionSnapshot();
  const existing = rule.replaceExisting ? [] : (Array.isArray(state.advancedReferenceImages) ? state.advancedReferenceImages : []);
  const occupiedFrameSlots = rule.target === "frames"
    ? Number(Boolean(state.advancedSeedanceFirstFrameDataUrl || state.advancedSeedanceFirstFrameAssetId))
      + Number(Boolean(state.advancedSeedanceLastFrameDataUrl || state.advancedSeedanceLastFrameAssetId))
    : 0;
  const roomLeft = Math.max(0, referenceLimit - (rule.target === "frames" ? occupiedFrameSlots : existing.length));
  if (!roomLeft) {
    if (els.advancedNote) els.advancedNote.textContent = t("advanced.referenceImageTooMany", { count: referenceLimit });
    updateAdvancedModelControls();
    return;
  }
  const selectedFiles = validFiles.slice(0, roomLeft);
  if (!selectedFiles.length) {
    updateAdvancedModelControls();
    return;
  }
  const addedImages = await Promise.all(selectedFiles.map(async (file, index) => ({
    dataUrl: await readFileAsDataUrl(file),
    fileName: file.name || `pasted-reference-${Date.now()}-${index + 1}.png`,
  })));
  state.activeAdvancedCaseId = "";
  if (rule.target === "frames") {
    state.advancedReferenceImages = [];
    addedImages.forEach((image) => {
      if (!state.advancedSeedanceFirstFrameDataUrl && !state.advancedSeedanceFirstFrameAssetId) {
        state.advancedSeedanceFirstFrameDataUrl = image.dataUrl;
        state.advancedSeedanceFirstFrameAssetId = "";
        state.advancedFirstFrameAssetId = "";
      } else if (!state.advancedSeedanceLastFrameDataUrl && !state.advancedSeedanceLastFrameAssetId) {
        state.advancedSeedanceLastFrameDataUrl = image.dataUrl;
        state.advancedSeedanceLastFrameAssetId = "";
      }
    });
    state.advancedUploadDataUrl = state.advancedSeedanceFirstFrameDataUrl || "";
  } else {
    state.advancedReferenceImages = dedupeAdvancedReferenceImages([
      ...existing,
      ...addedImages.map(stampAdvancedReferenceOrder),
    ]).slice(0, referenceLimit);
    state.advancedUploadDataUrl = state.advancedReferenceImages[0]?.dataUrl || "";
    state.advancedFirstFrameAssetId = "";
    state.advancedSeedanceFirstFrameAssetId = "";
    state.advancedSeedanceFirstFrameDataUrl = "";
    state.advancedSourceImageAssetId = provider === "wan27-image-edit" ? (state.advancedReferenceImages[0]?.assetId || "") : "";
  }
  state.advancedWanClipAssetId = "";
  if (els.advancedImage) els.advancedImage.value = "";
  if (validFiles.length > selectedFiles.length && els.advancedNote) {
    els.advancedNote.textContent = t("advanced.referenceImageTooMany", { count: referenceLimit });
  } else if (els.advancedNote && validFiles.length === files.length) {
    els.advancedNote.textContent = "";
  }
  syncAdvancedPromptMentionLabels(previousPromptRefs);
  updateAdvancedModelControls();
  updateAdvancedButtonCost();
}

function readVideoDuration(file) {
  return new Promise((resolve, reject) => {
    const video = document.createElement("video");
    const url = URL.createObjectURL(file);
    const cleanup = () => URL.revokeObjectURL(url);
    video.preload = "metadata";
    video.onloadedmetadata = () => {
      const duration = Number(video.duration || 0);
      cleanup();
      resolve(duration);
    };
    video.onerror = () => {
      cleanup();
      reject(new Error(t("modal.readImageFailed")));
    };
    video.src = url;
  });
}

function scaledCanvasSize(width = 0, height = 0, maxPixels = ADVANCED_SEEDANCE_MAX_PIXELS) {
  const w = Math.max(1, Number(width) || 1);
  const h = Math.max(1, Number(height) || 1);
  const pixels = w * h;
  if (pixels <= maxPixels) return { width: Math.round(w), height: Math.round(h) };
  const scale = Math.sqrt(maxPixels / pixels);
  return {
    width: Math.max(1, Math.floor(w * scale)),
    height: Math.max(1, Math.floor(h * scale)),
  };
}

function videoSourceObjectUrl(source) {
  if (source instanceof Blob) {
    const url = URL.createObjectURL(source);
    return Promise.resolve({ url, cleanup: () => URL.revokeObjectURL(url) });
  }
  const url = String(source || "").trim();
  if (!url) return Promise.reject(new Error(t("advanced.seedanceVideoRequired")));
  return fetch(url, { credentials: "same-origin" })
    .then((response) => {
      if (!response.ok) throw new Error(t("advanced.seedanceVideoRequired"));
      return response.blob();
    })
    .then((blob) => {
      const objectUrl = URL.createObjectURL(blob);
      return { url: objectUrl, cleanup: () => URL.revokeObjectURL(objectUrl) };
    });
}

async function captureLastFrameDataUrl(source) {
  const { url, cleanup } = await videoSourceObjectUrl(source);
  const video = document.createElement("video");
  video.muted = true;
  video.playsInline = true;
  video.preload = "auto";
  try {
    await new Promise((resolve, reject) => {
      video.onloadedmetadata = resolve;
      video.onerror = () => reject(new Error(t("modal.readImageFailed")));
      video.src = url;
      video.load?.();
    });
    const duration = Number.isFinite(video.duration) ? video.duration : 0;
    const targetTime = Math.max(0, duration - 0.08);
    await new Promise((resolve, reject) => {
      video.onseeked = resolve;
      video.onerror = () => reject(new Error(t("modal.readImageFailed")));
      video.currentTime = targetTime;
    });
    const width = video.videoWidth || 1;
    const height = video.videoHeight || 1;
    const size = scaledCanvasSize(width, height);
    const canvas = document.createElement("canvas");
    canvas.width = size.width;
    canvas.height = size.height;
    canvas.getContext("2d").drawImage(video, 0, 0, size.width, size.height);
    return canvas.toDataURL("image/jpeg", 0.9);
  } finally {
    cleanup();
    video.removeAttribute("src");
    video.load?.();
  }
}

function isVideoAsset(asset = {}) {
  return asset.kind === "video" || String(asset.mime || "").toLowerCase().startsWith("video/");
}

function isImageAsset(asset = {}) {
  return asset.kind === "image" || String(asset.mime || "").toLowerCase().startsWith("image/");
}

function isAudioAsset(asset = {}) {
  return asset.kind === "audio" || String(asset.mime || "").toLowerCase().startsWith("audio/");
}

function isDocumentAsset(asset = {}) {
  return asset.kind === "document";
}

function assetPreviewUrl(asset = {}) {
  return asset.publicUrl || asset.cdnUrl || asset.previewUrl || asset.localUrl || "";
}

function absoluteHttpUrl(value = "") {
  const raw = String(value || "").trim();
  if (!raw || raw.startsWith("data:") || raw.startsWith("asset://")) return "";
  try {
    return new URL(raw, window.location.origin || API_ORIGIN || undefined).href;
  } catch (_error) {
    return "";
  }
}

function dataUrlValue(value = "") {
  const raw = String(value || "").trim();
  return raw.startsWith("data:") ? raw : "";
}

function advancedSeedanceImageRefsFromState() {
  return selectedAdvancedReferenceImages(currentAdvancedProvider()).filter((item) => item && (item.dataUrl || item.assetId || item.assetUri || item.referenceAssetUri || item.url));
}

function seedanceImageRefPayload(item = {}) {
  if (item.assetId) return { assetId: item.assetId, dataUrl: "", url: "", fileName: item.fileName || "", name: item.name || "" };
  const meta = {
    fileName: item.fileName || "",
    name: item.name || "",
    presetId: item.presetId || "",
    presetSlot: item.presetSlot || "",
    fromPreset: Boolean(item.fromPreset),
    sourceUrl: item.sourceUrl || item.url || item.imageUrl || item.dataUrl || "",
  };
  if (item.assetUri || item.referenceAssetUri) {
    const assetUri = item.assetUri || item.referenceAssetUri;
    return { assetUri, referenceAssetUri: assetUri, dataUrl: "", url: "", ...meta };
  }
  if (item.url || item.imageUrl) return { url: absoluteHttpUrl(item.url || item.imageUrl), dataUrl: "", ...meta };
  const imageUrl = absoluteHttpUrl(item.dataUrl || item.previewUrl || "");
  if (imageUrl) return { url: imageUrl, dataUrl: "", ...meta };
  return { dataUrl: item.dataUrl || "", url: "", ...meta };
}

function recordParams(record = {}) {
  return record.params && typeof record.params === "object" && !Array.isArray(record.params) ? record.params : {};
}

function restoreMediaUrl(item = {}) {
  return item.dataUrl
    || item.imageUrl
    || item.videoUrl
    || item.audioUrl
    || item.publicUrl
    || item.cdnUrl
    || item.url
    || item.sourceImageUrl
    || item.previewUrl
    || item.localUrl
    || "";
}

function restoreMediaAssetUri(item = {}) {
  const direct = String(item.assetUri || item.referenceAssetUri || item.seedanceAssetUri || "").trim();
  if (direct) return direct;
  const url = String(item.url || item.imageUrl || item.sourceImageUrl || "").trim();
  return url.startsWith("asset://") ? url : "";
}

function restoreMediaAssetId(item = {}) {
  return String(item.userAssetId || item.assetId || item.id || "").trim();
}

function restoreReferenceFromMedia(item = {}, index = 0) {
  const assetId = restoreMediaAssetId(item);
  const assetUri = restoreMediaAssetUri(item);
  const url = restoreMediaUrl(item);
  if (!assetId && !assetUri && !url) return null;
  return {
    assetId,
    assetUri,
    referenceAssetUri: assetUri,
    dataUrl: url && !String(url).startsWith("asset://") ? url : "",
    url: assetId || assetUri ? "" : url,
    fileName: item.fileName || item.name || item.label || `image-${index + 1}`,
    name: item.name || item.label || `Image ${index + 1}`,
    fromLibrary: Boolean(assetId),
    order: advancedReferenceOrderValue(item, index + 1),
  };
}

function restoreRecordProvider(record = {}) {
  const params = recordParams(record);
  const source = String(record.source || record.provider || params.provider || "").toLowerCase();
  if (source.includes("image") || source.includes("wan27-image")) return "wan27-image-edit";
  return normalizeAdvancedProvider(record.provider || params.provider || (source.includes("wan") ? "wan27" : "seedance"));
}

function restoreSeedanceMode(record = {}, references = [], videos = [], audios = []) {
  const params = recordParams(record);
  const mediaMode = String(record.mediaMode || params.seedanceMode || params.mediaMode || "").trim();
  if (mediaMode) return normalizeSeedanceMediaMode(mediaMode);
  if (videos.length || audios.length) return "reference_video";
  if (references.length) return "reference_video";
  return "reference_video";
}

function restoreWanMode(record = {}, videos = [], audios = []) {
  const params = recordParams(record);
  const mediaMode = String(record.mediaMode || params.mediaMode || "").trim();
  if (mediaMode) return normalizeWanMediaMode(mediaMode);
  if (videos.length) return "first_clip";
  if (audios.length) return "first_frame_audio";
  return "first_frame";
}

function restoreRecordMedia(record = {}) {
  const mediaAssets = Array.isArray(record.mediaAssets) ? record.mediaAssets : [];
  const imageAssets = mediaAssets.filter((item) => {
    const type = String(item.type || item.key || "").toLowerCase();
    return !type.includes("audio") && !type.includes("video") && !type.includes("clip") && (restoreMediaUrl(item) || restoreMediaAssetUri(item));
  });
  const references = imageAssets.map(restoreReferenceFromMedia).filter(Boolean);
  const videos = mediaAssets
    .map((item, index) => ({ item, index }))
    .filter(({ item }) => String(item.type || item.key || "").toLowerCase().includes("video") && restoreMediaUrl(item))
    .map(({ item, index }) => ({ ...item, assetId: restoreMediaAssetId(item), url: restoreMediaUrl(item), order: advancedReferenceOrderValue(item, index + 1) }));
  const audios = mediaAssets
    .map((item, index) => ({ item, index }))
    .filter(({ item }) => String(item.type || item.key || "").toLowerCase().includes("audio") && restoreMediaUrl(item))
    .map(({ item, index }) => ({ ...item, assetId: restoreMediaAssetId(item), url: restoreMediaUrl(item), order: advancedReferenceOrderValue(item, index + 1) }));
  if (!references.length) {
    recordImageAssets(record).forEach((item, index) => {
      const ref = restoreReferenceFromMedia(item, index);
      if (ref) references.push(ref);
    });
  }
  return { references: dedupeAdvancedReferenceImages(references).slice(0, ADVANCED_SEEDANCE_REFERENCE_LIMIT), videos, audios };
}

function restoreRecordToAdvancedCreate(record = {}, button = null) {
  if (!record?.taskId && !record?.prompt && !record?.params) return;
  const params = recordParams(record);
  const provider = restoreRecordProvider(record);
  const { references, videos, audios } = restoreRecordMedia(record);
  const seedanceMode = restoreSeedanceMode(record, references, videos, audios);
  const wanMode = restoreWanMode(record, videos, audios);
  const ratio = normalizeVideoRatio(record.ratio || params.ratio || params.aspect_ratio || "9:16");
  const resolution = normalizeAdvancedResolution(record.resolution || params.resolution || (provider === "wan27-image-edit" ? "2K" : "720p"), provider);
  const duration = record.duration || params.duration || params.durationSeconds || (provider === "wan27" ? 2 : 5);
  const restoredPresetFlow = hydrateAdvancedPresetsFromParams(params);
  const restoredKind = ADVANCED_CREATE_KINDS.some((item) => item.id === params.createKind) ? params.createKind : "";
  const restoredMode = restoredKind && advancedCreateModesForKind(restoredKind).some((item) => item.id === params.createMode) ? params.createMode : "";
  setTab("advanced");
  state.advancedCreateKind = restoredPresetFlow && restoredKind ? restoredKind : "custom";
  state.advancedCreateMode = state.advancedCreateKind === "custom" ? ADVANCED_CUSTOM_MODE.id : (restoredMode || advancedCreateModesForKind(state.advancedCreateKind)[0]?.id || ADVANCED_CUSTOM_MODE.id);
  renderAdvancedCreateControls();
  clearAdvancedCreationInputs();
  if (restoredPresetFlow) hydrateAdvancedPresetsFromParams(params);
  state.activeAdvancedCaseId = "";
  const restoredCapability = String(params.videoCapability || record.mediaMode || "").trim();
  if (els.advancedProvider) {
    els.advancedProvider.value = advancedEngineValue(provider, restoredCapability);
    syncAdvancedVideoCapabilityOptions(restoredCapability);
  }
  if (els.advancedLegacyWanModel && restoredCapability === "wan-legacy") {
    els.advancedLegacyWanModel.value = params.model || record.model || els.advancedLegacyWanModel.value;
  }
  if (els.advancedWanAnimateMode && ["wan-animate-move", "wan-animate-mix"].includes(restoredCapability)) {
    els.advancedWanAnimateMode.value = params.animateMode || params.parameters?.mode || "wan-std";
  }
  if (els.advancedPrompt) {
    const rawPrompt = record.finalPrompt || record.prompt || params.prompt || "";
    els.advancedPrompt.value = restoredPresetFlow ? promptWithoutPresetParts(rawPrompt, params) : rawPrompt;
  }
  if (els.advancedRatio) els.advancedRatio.value = ratio;
  if (els.advancedResolution) els.advancedResolution.value = resolution;
  if (els.advancedDuration) els.advancedDuration.value = duration;
  if (els.advancedWanSeed) els.advancedWanSeed.value = params.seed || params.parameters?.seed || "";
  if (els.advancedWanPromptExtend) els.advancedWanPromptExtend.checked = ["wan30-video", "wan30-video-prime"].includes(restoredCapability)
    && advancedBoolFromValue(params.prompt_extend ?? params.promptExtend ?? params.parameters?.prompt_extend ?? params.parameters?.promptExtend, false);
  if (els.advancedSeedanceTier) {
    const model = String(record.model || params.model || "").toLowerCase();
    els.advancedSeedanceTier.value = model.includes("fast") || params.seedanceTier === "fast" ? "fast" : "standard";
  }
  if (provider === "qwen-image3") {
    if (els.advancedQwenTier) els.advancedQwenTier.value = params.qwenTier === "standard" || record.model === "qwen-image-3.0" ? "standard" : "pro";
    if (els.advancedQwenOutputCount) els.advancedQwenOutputCount.value = String(Math.max(1, Math.min(6, Number(params.n || params.outputImageCount || 1))));
    if (els.advancedQwenPromptExtend) els.advancedQwenPromptExtend.value = advancedBoolFromValue(params.prompt_extend ?? params.promptExtend, true) ? "true" : "false";
    if (els.advancedQwenWatermark) els.advancedQwenWatermark.value = advancedBoolFromValue(params.watermark, false) ? "true" : "false";
  }
  if (["qwen37-flash", "byteplus-language"].includes(provider)) {
    if (els.advancedQwen37Thinking) els.advancedQwen37Thinking.value = advancedBoolFromValue(params.enable_thinking ?? params.enableThinking, false) ? "true" : "false";
    if (els.advancedQwen37MaxTokens) els.advancedQwen37MaxTokens.value = String(Math.max(1, Math.min(8192, Number(params.max_tokens || params.maxTokens || 1024))));
    if (els.advancedQwen37Temperature) els.advancedQwen37Temperature.value = String(Math.max(0, Math.min(2, Number(params.temperature ?? 0.7))));
  }
  if (els.advancedSeedanceMediaMode) els.advancedSeedanceMediaMode.value = seedanceMode;
  if (els.advancedWanMediaMode) els.advancedWanMediaMode.value = wanMode;
  state.advancedSeedanceGenerateAudio = advancedBoolFromValue(params.generateAudio ?? params.generate_audio ?? record.generateAudio ?? record.generate_audio, true);
  if (els.advancedSeedanceGenerateAudio) els.advancedSeedanceGenerateAudio.value = state.advancedSeedanceGenerateAudio ? "true" : "false";
  const restoredSeedanceFirstFrame = ["seedance", "seedance25", "seedance-nsfw", "wan30"].includes(provider) && seedanceModeNeedsFirstFrame(seedanceMode) ? (references[0] || null) : null;
  state.advancedReferenceImages = restoredSeedanceFirstFrame
    ? references.slice(1)
    : provider === "qwen-image3"
    ? references.slice(0, ADVANCED_QWEN_IMAGE3_REFERENCE_LIMIT)
    : ["qwen37-flash", "byteplus-language"].includes(provider)
    ? []
    : references;
  state.advancedUploadDataUrl = restoredSeedanceFirstFrame ? "" : (references[0]?.dataUrl || "");
  if (provider === "wan27-image-edit") {
    state.advancedSourceImageAssetId = references[0]?.assetId || "";
    state.advancedFirstFrameAssetId = "";
  } else {
    state.advancedFirstFrameAssetId = restoredSeedanceFirstFrame?.assetId || references[0]?.assetId || "";
    state.advancedSeedanceFirstFrameAssetId = restoredSeedanceFirstFrame?.assetId || "";
    state.advancedSeedanceFirstFrameDataUrl = restoredSeedanceFirstFrame?.dataUrl || "";
    state.advancedSourceImageAssetId = "";
  }
  const firstLastFrame = references.find((item) => /last|end/i.test(`${item.name || ""} ${item.fileName || ""} ${item.label || ""}`));
  const lastFrameRef = firstLastFrame || (seedanceModeNeedsLastFrame(seedanceMode) ? references[1] : null);
  if (["seedance", "seedance25", "seedance-nsfw", "wan30"].includes(provider) && lastFrameRef) {
    state.advancedSeedanceLastFrameAssetId = lastFrameRef.assetId || "";
    state.advancedSeedanceLastFrameDataUrl = lastFrameRef.dataUrl || "";
  } else if (provider === "wan27" && wanModeNeedsLastFrame(wanMode) && references[1]) {
    state.advancedWanLastFrameAssetId = references[1].assetId || "";
    state.advancedWanLastFrameDataUrl = references[1].dataUrl || "";
  }
  const firstVideo = videos[0];
  if (advancedUsesSharedReferenceUpload(provider, currentAdvancedVideoCapability()) && firstVideo) {
    setAdvancedSeedanceVideoReferences(videos.map((item) => ({
      assetId: item.assetId || "",
      url: item.url || "",
      previewUrl: item.url || "",
      name: item.name || item.label || item.fileName || "Video reference",
      durationSeconds: item.durationSeconds || item.duration || 0,
      order: advancedReferenceOrderValue(item),
    })));
    if (["seedance", "seedance25", "seedance-nsfw", "wan30"].includes(provider) && els.advancedSeedanceVideoUrls) {
      els.advancedSeedanceVideoUrls.value = firstVideo.assetId ? "" : firstVideo.url || "";
    }
  }
  const firstAudio = audios[0];
  if (firstAudio) {
    if (advancedUsesSharedReferenceUpload(provider, currentAdvancedVideoCapability())) {
      setAdvancedSeedanceAudioReferences(audios.map((item) => ({
        assetId: item.assetId || "",
        url: item.url || "",
        previewUrl: item.url || "",
        name: item.name || item.label || item.fileName || "Audio reference",
        durationSeconds: item.durationSeconds || item.duration || 0,
        order: advancedReferenceOrderValue(item),
      })));
    }
    if (provider === "seedance" && els.advancedSeedanceAudioUrls) els.advancedSeedanceAudioUrls.value = firstAudio.assetId ? "" : firstAudio.url || "";
    if (provider === "wan27" && els.advancedWanAudioUrl) els.advancedWanAudioUrl.value = firstAudio.assetId ? "" : firstAudio.url || "";
  }
  renderAdvancedPresetBuilder();
  renderAdvancedReferencePreviews();
  updateAdvancedModelControls();
  updateAdvancedButtonCost();
  setAdvancedSideTab("assets");
  if (els.advancedNote) els.advancedNote.textContent = t("history.regenerateSubmitted");
  if (button) {
    button.innerHTML = `<i data-lucide="check"></i>${escapeHtml(t("history.regenerateSubmitted"))}`;
    button.disabled = false;
    refreshIcons();
  }
}

function splitUrlList(value = "") {
  return String(value || "")
    .split(/[\n,]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function advancedBoolFromValue(value, fallback = true) {
  if (value === undefined || value === null || value === "") return fallback;
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  const normalized = String(value).trim().toLowerCase();
  if (["false", "0", "no", "off"].includes(normalized)) return false;
  if (["true", "1", "yes", "on"].includes(normalized)) return true;
  return fallback;
}

function arrayFrom(value) {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function imageAssetOptions(selectedId = "") {
  const images = (state.assetImageChoices?.length ? state.assetImageChoices : state.userAssets || []).filter(isImageAsset);
  return images.length
    ? images.map((asset) => `<option value="${escapeHtml(asset.id)}" ${asset.id === selectedId ? "selected" : ""}>${escapeHtml(asset.name || asset.id)}</option>`).join("")
    : `<option value="">${escapeHtml(t("assets.noImageAssets"))}</option>`;
}

async function ensureAssetImageChoices() {
  if (!state.user) return [];
  const payload = await requestJson("/api/user-assets?type=image&page=1&limit=50");
  state.assetImageChoices = payload.assets || [];
  return state.assetImageChoices;
}

async function ensureAssetAudioChoices() {
  if (!state.user) return [];
  const payload = await requestJson("/api/user-assets?type=audio&page=1&limit=50");
  state.assetAudioChoices = payload.assets || [];
  return state.assetAudioChoices;
}

function assetGenerateDialogBody({ mode = "extend", imageAssetId = "" } = {}) {
  const isReplace = mode === "replace";
  const prompt = isReplace ? "Replace the lady in [Video 1] with the lady in [Image 1]" : "Extend [Image 1]";
  return `
    <div class="asset-generate-form">
      ${isReplace ? `
        <div class="asset-replace-source">
          <span>${escapeHtml(t("assets.imageSource"))}</span>
          <div class="asset-source-toggle" role="radiogroup" aria-label="${escapeHtml(t("assets.imageSource"))}">
            <label><input type="radio" name="assetReplaceImageSource" value="asset" checked />${escapeHtml(t("assets.sourceAssets"))}</label>
            <label><input type="radio" name="assetReplaceImageSource" value="upload" />${escapeHtml(t("assets.sourceUpload"))}</label>
          </div>
        </div>
        <label class="field asset-replace-asset-field" data-replace-source-field="asset"><span>${escapeHtml(t("assets.pickAssetImage"))}</span><select id="assetGenerateImageAsset">${imageAssetOptions(imageAssetId)}</select></label>
        <label class="field file-picker-field asset-replace-upload-field" data-replace-source-field="upload" hidden>
          <span>${escapeHtml(t("assets.uploadReplaceImage"))}</span>
          <span class="file-picker-control">
            <input id="assetGenerateImageUpload" type="file" accept="image/*" />
            <span class="file-picker-button"><i data-lucide="image-up"></i>${escapeHtml(t("file.chooseImage"))}</span>
            <span class="file-picker-name" data-file-name-for="assetGenerateImageUpload">${escapeHtml(t("file.none"))}</span>
          </span>
        </label>
        <p class="job-note asset-source-note">${escapeHtml(t("assets.uploadOverridesAsset"))}</p>
      ` : ""}
      <label class="field"><span>${escapeHtml(t("field.prompt"))}</span><textarea id="assetGeneratePrompt" rows="4">${escapeHtml(prompt)}</textarea></label>
      <div class="asset-generate-grid">
        <label class="field"><span>${escapeHtml(t("field.duration"))}</span><input id="assetGenerateDuration" type="number" min="5" max="15" value="5" /></label>
        <label class="field"><span>${escapeHtml(t("field.resolution"))}</span><select id="assetGenerateResolution"><option value="480p">480p</option><option value="720p">720p</option><option value="1080p">1080p</option></select></label>
      </div>
      <p class="job-note" id="assetGenerateStatus"></p>
    </div>
  `;
}

function assetVideoExtendDialogBody() {
  return `
    <div class="asset-generate-form">
      <label class="field"><span>${escapeHtml(t("field.prompt"))}</span><textarea id="assetGeneratePrompt" rows="4">${escapeHtml("Extend [Video 1] smoothly with the same subject, scene, motion, lighting and cinematic style.")}</textarea></label>
      <div class="asset-generate-grid">
        <label class="field"><span>${escapeHtml(t("field.duration"))}</span><input id="assetGenerateDuration" type="number" min="5" max="15" value="5" /></label>
        <label class="field"><span>${escapeHtml(t("field.resolution"))}</span><select id="assetGenerateResolution"><option value="480p">480p</option><option value="720p">720p</option><option value="1080p">1080p</option></select></label>
      </div>
      <p class="job-note" id="assetGenerateStatus"></p>
    </div>
  `;
}

function bindAssetGenerateCost(root, options = {}) {
  const durationInput = root.querySelector("#assetGenerateDuration");
  const resolutionInput = root.querySelector("#assetGenerateResolution");
  const cost = root.querySelector("#assetGenerateCost");
  const syncReplaceSource = () => {
    const source = root.querySelector("input[name='assetReplaceImageSource']:checked")?.value || "asset";
    root.querySelectorAll("[data-replace-source-field]").forEach((field) => {
      field.hidden = field.dataset.replaceSourceField !== source;
    });
  };
  root.querySelectorAll("input[name='assetReplaceImageSource']").forEach((input) => {
    input.addEventListener("change", syncReplaceSource);
  });
  syncReplaceSource();
  root.querySelectorAll("input[type='file']").forEach((input) => {
    updateFilePickerLabel(input);
    input.addEventListener("change", () => updateFilePickerLabel(input));
  });
  const update = () => {
    const duration = Number(durationInput?.value || 5);
    const resolution = resolutionInput?.value || "720p";
    const inputVideoSeconds = typeof options.inputVideoSeconds === "function"
      ? positiveDurationSeconds(options.inputVideoSeconds(duration, resolution), 0)
      : positiveDurationSeconds(options.inputVideoSeconds, 0);
    const label = advancedCostLabel(duration, "seedance", resolution, "16:9", { inputVideoSeconds });
    if (cost) cost.textContent = label;
    if (els.inlineDialogConfirm) {
      els.inlineDialogConfirm.innerHTML = `<i data-lucide="sparkles"></i>${escapeHtml(t("template.generate", { cost: label }))}`;
      refreshIcons();
    }
  };
  durationInput?.addEventListener("input", update);
  resolutionInput?.addEventListener("change", update);
  update();
}

async function readOptionalImageUpload(root) {
  const file = root.querySelector("#assetGenerateImageUpload")?.files?.[0];
  if (!file) return null;
  if (file.size > ADVANCED_SEEDANCE_REFERENCE_MAX_BYTES) throw new Error(t("advanced.referenceImageTooLarge"));
  return { dataUrl: await readFileAsDataUrl(file), fileName: file.name || "", name: file.name || "" };
}

async function selectedReplaceImageReference(root) {
  const source = root.querySelector("input[name='assetReplaceImageSource']:checked")?.value || "asset";
  if (source === "upload") {
    const uploadRef = await readOptionalImageUpload(root);
    if (!uploadRef) throw new Error(t("assets.selectImageRequired"));
    return uploadRef;
  }
  const selectedImageAssetId = root.querySelector("#assetGenerateImageAsset")?.value || "";
  if (!selectedImageAssetId) throw new Error(t("assets.selectImageRequired"));
  return { assetId: selectedImageAssetId };
}

function assetModifyDialogBody(asset = {}) {
  const options = state.config?.assetImageModify || {};
  const ratios = Array.isArray(options.ratios) && options.ratios.length ? options.ratios : ["1:1", "3:4", "4:3", "9:16", "16:9"];
  const defaultRatio = options.defaultRatio || "9:16";
  const resolutions = Array.isArray(options.resolutions) && options.resolutions.length ? options.resolutions : ["1K", "2K"];
  const defaultResolution = options.defaultResolution || "2K";
  return `
    <div class="asset-generate-form asset-modify-form">
      <div class="asset-modify-preview">
        <img src="${escapeHtml(assetPreviewUrl(asset))}" alt="${escapeHtml(asset.name || "")}" />
      </div>
      <label class="field"><span>${escapeHtml(t("field.prompt"))}</span><textarea id="assetModifyPrompt" rows="4" placeholder="${escapeHtml(t("assets.modifyPromptPlaceholder"))}"></textarea></label>
      <label class="field"><span>${escapeHtml(t("field.ratio"))}</span><select id="assetModifyRatio">${ratios.map((ratio) => `<option value="${escapeHtml(ratio)}" ${ratio === defaultRatio ? "selected" : ""}>${escapeHtml(ratio)}</option>`).join("")}</select></label>
      <label class="field"><span>${escapeHtml(t("field.resolution"))}</span><select id="assetModifyResolution">${resolutions.map((resolution) => `<option value="${escapeHtml(resolution)}" ${resolution === defaultResolution ? "selected" : ""}>${escapeHtml(resolution)}</option>`).join("")}</select></label>
      <p class="job-note">${escapeHtml(t("assets.modifyHint"))}</p>
      <p class="job-note" id="assetModifyStatus"></p>
    </div>
  `;
}

function bindAssetModifyCost(root) {
  const cost = root.querySelector("#assetModifyCost");
  const update = () => {
    const label = assetImageModifyCostLabel();
    if (cost) cost.textContent = label;
    if (els.inlineDialogConfirm) {
      els.inlineDialogConfirm.innerHTML = `<i data-lucide="wand-sparkles"></i>${escapeHtml(t("template.generate", { cost: label }))}`;
      refreshIcons();
    }
  };
  root.querySelector("#assetModifyRatio")?.addEventListener("change", update);
  root.querySelector("#assetModifyResolution")?.addEventListener("change", update);
  update();
}

async function openAssetModifyDialog(asset = {}) {
  if (!asset?.id || !isImageAsset(asset)) return;
  if (!state.user) return openLogin();
  let shouldRefreshHistory = false;
  const result = await showInlineDialog({
    title: t("assets.modifyTitle"),
    body: assetModifyDialogBody(asset),
    confirmText: t("common.generate"),
    dialogClass: "is-media-action",
    onOpen: bindAssetModifyCost,
    onConfirm: async (root) => {
      const prompt = root.querySelector("#assetModifyPrompt")?.value.trim() || "";
      if (!prompt) throw new Error(t("advanced.promptRequired"));
      const status = root.querySelector("#assetModifyStatus");
      if (status) status.textContent = t("assets.generating");
      let payload;
      try {
        payload = await requestJson(`/api/user-assets/${encodeURIComponent(asset.id)}/modify`, {
          method: "POST",
          body: {
            prompt,
            ratio: root.querySelector("#assetModifyRatio")?.value || "9:16",
            resolution: root.querySelector("#assetModifyResolution")?.value || "2K",
          },
        });
      } catch (error) {
        shouldRefreshHistory = true;
        window.setTimeout(() => loadHistory({ silent: true }), 300);
        throw error;
      }
      shouldRefreshHistory = true;
      if (payload.user) setUser(payload.user);
      if (payload.record) {
        state.historyRecords = [payload.record, ...(state.historyRecords || []).filter((record) => record.taskId !== payload.record.taskId)];
      }
      if (status) status.textContent = t("assets.modified");
    },
  });
  if (result === "confirm") {
    await loadHistory({ silent: true });
  } else if (shouldRefreshHistory) {
    await loadHistory({ silent: true });
  }
}

async function openAssetExtendDialog(asset = {}) {
  if (!asset?.id) return;
  if (!state.user) return openLogin();
  if (isVideoAsset(asset)) return openAssetVideoExtendDialog(asset);
  const duration = 5;
  const resolution = "720p";
  const ratio = "16:9";
  const cost = advancedButtonCostLabel(duration, "seedance", resolution, ratio, { seedanceTier: "standard", inputVideoSeconds: 0 });
  const result = await showInlineDialog({
    title: t("assets.extendTitle"),
    body: `
      <p class="job-note" id="assetGenerateStatus"></p>
    `,
    confirmText: t("common.generate"),
    onOpen: () => {
      if (els.inlineDialogConfirm) {
        els.inlineDialogConfirm.innerHTML = `<i data-lucide="sparkles"></i>${escapeHtml(t("template.generate", { cost }))}`;
        refreshIcons();
      }
    },
    onConfirm: async (root) => {
      const status = root.querySelector("#assetGenerateStatus");
      if (status) status.textContent = t("assets.generating");
      const payload = await requestJson("/api/advanced/generate", {
        method: "POST",
        body: {
          provider: "seedance",
          prompt: "Extend [Image 1] smoothly with the same subject, scene, lighting and cinematic style.",
          referenceImages: [{ assetId: asset.id, name: asset.name || "" }],
          ratio,
          resolution,
          duration,
          params: { createKind: "video", createMode: "video-extend" },
        },
      });
      if (payload.user) setUser(payload.user);
      if (status) status.textContent = t("assets.generated", { taskId: payload.taskId || payload.task?.taskId || "" });
    },
  });
  if (result === "confirm") {
    scheduleHistoryRefresh({ delayMs: 8000, force: true });
  }
}

async function openAssetVideoExtendDialog(videoAsset = {}) {
  if (!videoAsset?.id) return;
  if (!state.user) return openLogin();
  const duration = 5;
  const resolution = "720p";
  const ratio = "16:9";
  const cost = advancedButtonCostLabel(duration, "seedance", resolution, ratio, { seedanceTier: "standard", inputVideoSeconds: 0 });
  const result = await showInlineDialog({
    title: t("assets.extendTitle"),
    body: `
      <p class="job-note" id="assetGenerateStatus"></p>
    `,
    confirmText: t("common.generate"),
    onOpen: () => {
      if (els.inlineDialogConfirm) {
        els.inlineDialogConfirm.innerHTML = `<i data-lucide="sparkles"></i>${escapeHtml(t("template.generate", { cost }))}`;
        refreshIcons();
      }
    },
    onConfirm: async (root) => {
      const status = root.querySelector("#assetGenerateStatus");
      if (status) status.textContent = t("advanced.extractingLastFrame", {}, "Preparing video frame...");
      const frameDataUrl = await captureLastFrameDataUrl(assetPreviewUrl(videoAsset));
      if (status) status.textContent = t("assets.generating");
      const payload = await requestJson("/api/advanced/generate", {
        method: "POST",
        body: {
          provider: "seedance",
          seedanceMode: "first_frame",
          prompt: advancedCreateModeDefaultPrompt("video-extend"),
          firstFrameDataUrl: frameDataUrl,
          ratio,
          resolution,
          duration,
          params: { createKind: "video", createMode: "video-extend" },
        },
      });
      if (payload.user) setUser(payload.user);
      if (status) status.textContent = t("assets.generated", { taskId: payload.taskId || payload.task?.taskId || "" });
    },
  });
  if (result === "confirm") {
    scheduleHistoryRefresh({ delayMs: 8000, force: true });
  }
}

async function openAssetReplaceDialog(videoAsset = {}) {
  if (!videoAsset?.id) return;
  if (!state.user) return openLogin();
  const duration = 5;
  const resolution = "720p";
  const ratio = "16:9";
  const inputVideoSeconds = positiveDurationSeconds(videoAsset.durationSeconds || videoAsset.duration, duration);
  const cost = advancedButtonCostLabel(duration, "seedance", resolution, ratio, { seedanceTier: "standard", inputVideoSeconds });
  const result = await showInlineDialog({
    title: t("assets.replaceTitle"),
    body: `
      <label class="field file-picker-field asset-replace-upload-field">
        <span>${escapeHtml(t("assets.replaceImage"))}</span>
        <div class="file-picker-control">
          <input id="assetReplaceUploadImage" type="file" accept="image/*" />
          <span class="file-picker-button"><i data-lucide="image-up"></i>${escapeHtml(t("assets.sourceUpload"))}</span>
        </div>
        <img class="asset-upload-preview" id="assetReplaceUploadPreview" alt="" hidden />
      </label>
      <p class="job-note" id="assetGenerateStatus"></p>
    `,
    confirmText: t("common.generate"),
    dialogClass: "is-media-action",
    onOpen: (root) => {
      const input = root.querySelector("#assetReplaceUploadImage");
      const preview = root.querySelector("#assetReplaceUploadPreview");
      input?.addEventListener("change", async () => {
        const file = input.files?.[0];
        if (!file || !preview) return;
        preview.src = await readFileAsDataUrl(file);
        preview.hidden = false;
      });
      if (els.inlineDialogConfirm) {
        els.inlineDialogConfirm.innerHTML = `<i data-lucide="sparkles"></i>${escapeHtml(t("template.generate", { cost }))}`;
      }
      refreshIcons();
    },
    onConfirm: async (root) => {
      const file = root.querySelector("#assetReplaceUploadImage")?.files?.[0];
      if (!file) throw new Error(t("assets.replaceImageRequired"));
      const status = root.querySelector("#assetGenerateStatus");
      if (status) status.textContent = t("assets.uploading");
      const dataUrl = await readFileAsDataUrl(file);
      const uploaded = await requestJson("/api/user-assets", {
        method: "POST",
        body: { dataUrl, name: file.name || "Replacement image", fileName: file.name || "replacement.png" },
      });
      if (status) status.textContent = t("assets.generating");
      const payload = await requestJson("/api/advanced/generate", {
        method: "POST",
        body: {
          provider: "seedance",
          seedanceMode: "reference_video",
          prompt: advancedCreateModeDefaultPrompt("video-replace"),
          referenceVideoAssetId: videoAsset.id,
          referenceImages: [{ assetId: uploaded.asset?.id || "" }],
          inputVideoSeconds,
          referenceVideoDurationSeconds: inputVideoSeconds,
          ratio,
          resolution,
          duration,
          params: { createKind: "video", createMode: "video-replace" },
        },
      });
      if (payload.user) setUser(payload.user);
      if (status) status.textContent = t("assets.generated", { taskId: payload.taskId || payload.task?.taskId || "" });
    },
  });
  if (result === "confirm") {
    scheduleHistoryRefresh({ delayMs: 8000, force: true });
  }
}

function captureFrameFromVideo(video) {
  if (!video || !video.videoWidth || !video.videoHeight) throw new Error("Video frame is not ready.");
  const canvas = document.createElement("canvas");
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", 0.9);
}

async function openAssetFrameDialog(asset = {}) {
  const url = assetPreviewUrl(asset);
  if (!url) return;
  await showInlineDialog({
    title: t("assets.frameTitle"),
    dialogClass: "is-media-action is-frame-action",
    body: `
      <div class="asset-frame-form">
        <video id="assetFrameVideo" src="${escapeHtml(url)}" controls playsinline preload="metadata"></video>
        <p class="job-note">${escapeHtml(t("assets.frameHint"))}</p>
        <p class="job-note" id="assetFrameStatus"></p>
      </div>
    `,
    confirmText: t("assets.selectFrame"),
    onOpen: (root) => {
      const video = root.querySelector("#assetFrameVideo");
      const syncRatio = () => {
        if (!video?.videoWidth || !video.videoHeight) return;
        const ratio = video.videoWidth / video.videoHeight;
        video.style.setProperty("--asset-frame-ratio", `${video.videoWidth} / ${video.videoHeight}`);
        video.style.setProperty("--asset-frame-ratio-value", String(ratio));
      };
      video?.addEventListener("loadedmetadata", syncRatio);
      if (video?.readyState >= 1) syncRatio();
    },
    onConfirm: async (root) => {
      const video = root.querySelector("#assetFrameVideo");
      const dataUrl = captureFrameFromVideo(video);
      root.querySelector("#assetFrameStatus").textContent = t("assets.uploading");
      await requestJson("/api/user-assets", {
        method: "POST",
        body: { dataUrl, name: `${asset.name || "video"} frame`, fileName: `${asset.id || "frame"}.jpg` },
      });
      root.querySelector("#assetFrameStatus").textContent = t("assets.frameSaved");
      await loadUserAssets(state.userAssetsPage || 1);
    },
  });
}

function useAssetInAdvanced(asset = {}, action = "use") {
  if (!asset) return;
  if (!state.user) return openLogin();
  state.advancedCreateKind = action === "modify" ? "image" : "video";
  state.advancedCreateMode = action === "modify"
    ? "image-edit"
    : action === "replace"
      ? "video-replace"
      : action === "extend"
        ? "video-extend"
        : isVideoAsset(asset)
          ? "video-edit"
          : "video-image";
  if (els.advancedProvider) els.advancedProvider.value = action === "modify" ? "wan27-image-edit" : "seedance";
  state.activeAdvancedCaseId = "";
  if (isImageAsset(asset)) {
    if (action === "modify") {
      state.advancedSourceImageAssetId = asset.id;
      state.advancedFirstFrameAssetId = "";
    } else {
      state.advancedFirstFrameAssetId = asset.id;
      state.advancedSourceImageAssetId = "";
    }
    if (els.advancedSeedanceMediaMode) els.advancedSeedanceMediaMode.value = "reference_video";
    const ref = stampAdvancedReferenceOrder({
      assetId: asset.id,
      dataUrl: assetPreviewUrl(asset),
      fileName: asset.name || "",
      name: asset.name || "",
      fromLibrary: true,
    });
    const existing = action === "replace" || action === "modify" ? advancedSeedanceImageRefsFromState().filter((item) => item.assetId !== asset.id) : [];
    const imageLimit = action === "replace" ? 1 : ADVANCED_SEEDANCE_REFERENCE_LIMIT;
    state.advancedReferenceImages = dedupeAdvancedReferenceImages([...existing, ref]).slice(0, imageLimit);
    state.advancedUploadDataUrl = state.advancedReferenceImages[0]?.dataUrl || "";
    if (action === "modify" && els.advancedPrompt) els.advancedPrompt.value = "";
  }
  if (isVideoAsset(asset)) {
    if (els.advancedSeedanceMediaMode) els.advancedSeedanceMediaMode.value = "reference_video";
    addAdvancedSeedanceMediaReference(asset, "video");
  }
  setTab("advanced");
  updateAdvancedModelControls();
  updateAdvancedButtonCost();
  if (els.advancedNote) {
    els.advancedNote.textContent = action === "extend"
      ? t("assets.extended")
      : action === "replace"
        ? t("assets.replaced")
        : action === "modify"
          ? t("assets.modify")
          : t("assets.used");
  }
}

function selectedWanClipData(mediaMode = "first_frame") {
  return wanModeNeedsClip(mediaMode) && !state.advancedWanClipAssetId ? state.advancedWanClipDataUrl : "";
}

function selectedWanClipFileName(mediaMode = "first_frame") {
  return wanModeNeedsClip(mediaMode) && !state.advancedWanClipAssetId ? state.advancedWanClipFileName : "";
}

function selectedWanClipUrl(mediaMode = "first_frame") {
  return wanModeNeedsClip(mediaMode) && !state.advancedWanClipAssetId ? (els.advancedWanClipUrl?.value.trim() || "") : "";
}

function resolvedWanI2vFrames(images = selectedAdvancedReferenceImages("wan27")) {
  const references = Array.isArray(images) ? images : [];
  const hasClip = Boolean(state.advancedWanClipAssetId || state.advancedWanClipDataUrl);
  return {
    first: hasClip ? null : (references[0] || null),
    last: hasClip ? (references[0] || null) : (references[1] || null),
  };
}

function resolvedWanSubmitMediaMode(rawMode = "first_frame") {
  const mode = normalizeWanMediaMode(rawMode);
  if (mode !== "multimodal") return mode;
  const frames = resolvedWanI2vFrames();
  const hasClip = Boolean(state.advancedWanClipAssetId || state.advancedWanClipDataUrl);
  const hasAudio = Boolean(state.advancedAudioAssetId);
  const hasLast = Boolean(state.advancedWanLastFrameAssetId || state.advancedWanLastFrameDataUrl || frames.last);
  if (hasClip) return hasLast ? "first_clip_last_frame" : "first_clip";
  if (hasAudio) return hasLast ? "first_last_frame_audio" : "first_frame_audio";
  return hasLast ? "first_last_frame" : "first_frame";
}

function selectedAdvancedReferenceImages(provider = currentAdvancedProvider()) {
  const images = Array.isArray(state.advancedReferenceImages) ? state.advancedReferenceImages : [];
  const normalizedProvider = normalizeAdvancedProvider(provider);
  if (normalizedProvider === "wan27-image-edit") return images.slice(0, advancedCreateModeUsesSingleUpload() ? 1 : ADVANCED_SEEDANCE_REFERENCE_LIMIT);
  if (normalizedProvider === "qwen-image3") return images.slice(0, ADVANCED_QWEN_IMAGE3_REFERENCE_LIMIT);
  if (normalizedProvider === "seedream5-image") return images.slice(0, ADVANCED_SEEDANCE_REFERENCE_LIMIT);
  if (normalizedProvider === "wan30") return images.slice(0, ADVANCED_WAN30_IMAGE_REFERENCE_LIMIT);
  if (["wan27", "happyhorse"].includes(normalizedProvider)) return images.slice(0, advancedAliyunReferenceImageLimit());
  if (["seedance25", "seedance-nsfw"].includes(normalizedProvider)) return images.slice(0, ADVANCED_SEEDANCE25_IMAGE_REFERENCE_LIMIT);
  if (normalizedProvider !== "seedance") return images.slice(0, 1);
  return images;
}

function dedupeAdvancedReferenceImages(images = []) {
  const seen = new Set();
  return images.filter((item) => {
    const assetUri = item?.assetUri || item?.referenceAssetUri || "";
    const sourceUrl = item?.sourceUrl || "";
    const dataUrl = item?.dataUrl || "";
    const key = item?.assetId ? `asset:${item.assetId}` : assetUri ? `asset-uri:${assetUri}` : dataUrl ? `data:${dataUrl}` : sourceUrl ? `source:${sourceUrl}` : item?.url ? `url:${item.url}` : `${item?.fileName || ""}::`;
    if ((!dataUrl && !item?.assetId && !assetUri && !sourceUrl && !item?.url) || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function removeAdvancedReferenceImage(index = -1) {
  const images = Array.isArray(state.advancedReferenceImages) ? [...state.advancedReferenceImages] : [];
  if (index < 0 || index >= images.length) return;
  const previousPromptRefs = advancedPromptMentionSnapshot();
  images.splice(index, 1);
  const provider = currentAdvancedProvider();
  state.advancedReferenceImages = images;
  state.advancedUploadDataUrl = images[0]?.dataUrl || "";
  if (provider === "wan27-image-edit") {
    state.advancedFirstFrameAssetId = "";
    state.advancedSourceImageAssetId = images[0]?.assetId || "";
  } else {
    state.advancedFirstFrameAssetId = images[0]?.assetId || "";
    state.advancedSourceImageAssetId = "";
  }
  if (!images.length && els.advancedImage) els.advancedImage.value = "";
  syncAdvancedPromptMentionLabels(previousPromptRefs);
  updateAdvancedModelControls();
  updateAdvancedButtonCost();
}

function removeAdvancedSeedanceVideoReference() {
  const previousPromptRefs = advancedPromptMentionSnapshot();
  setAdvancedSeedanceVideoReferences([]);
  if (els.advancedSeedanceVideoUrls) els.advancedSeedanceVideoUrls.value = "";
  syncAdvancedPromptMentionLabels(previousPromptRefs);
  updateAdvancedModelControls();
  updateAdvancedButtonCost();
}

function removeAdvancedMediaSlot(slot = "") {
  const previousPromptRefs = advancedPromptMentionSnapshot();
  if (slot === "seedanceFirstFrame") {
    state.advancedSeedanceFirstFrameAssetId = "";
    state.advancedSeedanceFirstFrameDataUrl = "";
    state.advancedFirstFrameAssetId = "";
    state.advancedUploadDataUrl = selectedAdvancedReferenceImages()[0]?.dataUrl || "";
    if (els.advancedSeedanceFirstFrame) els.advancedSeedanceFirstFrame.value = "";
    els.advancedSeedanceFirstFramePreview?.removeAttribute("src");
    els.advancedSeedanceFirstFramePreview?.classList.remove("is-visible");
    els.advancedSeedanceFirstFrame?.closest(".wan-frame-upload")?.classList.remove("has-image");
  } else if (slot === "seedanceLastFrame") {
    state.advancedSeedanceLastFrameAssetId = "";
    state.advancedSeedanceLastFrameDataUrl = "";
    if (els.advancedSeedanceLastFrame) els.advancedSeedanceLastFrame.value = "";
    els.advancedSeedanceLastFramePreview?.removeAttribute("src");
    els.advancedSeedanceLastFramePreview?.classList.remove("is-visible");
    els.advancedSeedanceLastFrame?.closest(".wan-frame-upload")?.classList.remove("has-image");
  } else if (slot === "wanFirstFrame") {
    state.advancedReferenceImages = [];
    state.advancedUploadDataUrl = "";
    state.advancedFirstFrameAssetId = "";
    if (els.advancedWanFirstFrame) els.advancedWanFirstFrame.value = "";
    els.advancedWanFirstFramePreview?.removeAttribute("src");
    els.advancedWanFirstFramePreview?.classList.remove("is-visible");
    els.advancedWanFirstFrame?.closest(".wan-frame-upload")?.classList.remove("has-image");
  } else if (slot === "wanLastFrame") {
    state.advancedWanLastFrameAssetId = "";
    state.advancedWanLastFrameDataUrl = "";
    if (els.advancedWanLastFrame) els.advancedWanLastFrame.value = "";
    els.advancedWanLastFramePreview?.removeAttribute("src");
    els.advancedWanLastFramePreview?.classList.remove("is-visible");
    els.advancedWanLastFrame?.closest(".wan-frame-upload")?.classList.remove("has-image");
  } else if (slot === "wanClip") {
    state.advancedWanClipAssetId = "";
    state.advancedWanClipDataUrl = "";
    state.advancedWanClipFileName = "";
    state.advancedWanClipDurationSeconds = 0;
    state.advancedWanClipOrder = 0;
    if (els.advancedWanClipFile) els.advancedWanClipFile.value = "";
    if (els.advancedWanClipUrl) els.advancedWanClipUrl.value = "";
    els.advancedWanClipPreview?.removeAttribute("src");
    els.advancedWanClipPreview?.classList.remove("is-visible");
    els.advancedWanClipFile?.closest(".wan-frame-upload")?.classList.remove("has-image");
  } else if (slot === "wanAudio") {
    state.advancedAudioAssetId = "";
    state.advancedAudioPreviewUrl = "";
    state.advancedAudioFileName = "";
    state.advancedAudioOrder = 0;
    if (els.advancedWanAudioUrl) els.advancedWanAudioUrl.value = "";
  }
  syncAdvancedPromptMentionLabels(previousPromptRefs);
  updateAdvancedModelControls();
  updateAdvancedButtonCost();
}

function advancedReferenceDisplayItems(provider = currentAdvancedProvider()) {
  const images = selectedAdvancedReferenceImages();
  const pendingRefs = advancedPendingReferences(provider);
  const sharedUpload = advancedUsesSharedReferenceUpload(provider, currentAdvancedVideoCapability());
  const referenceVideos = sharedUpload ? advancedSeedanceVideoReferences() : [];
  const referenceAudios = sharedUpload ? advancedSeedanceAudioReferences() : [];
  const documentItems = provider === "wan30" && state.advancedDocumentReference ? [{ kind: "document", index: 0, label: "Document", item: state.advancedDocumentReference, order: advancedReferenceOrderValue(state.advancedDocumentReference, 1) }] : [];
  const displayImages = [...images, ...pendingRefs.filter((item) => item.kind === "image")]
    .sort((left, right) => advancedReferenceOrderValue(left) - advancedReferenceOrderValue(right));
  const imageItems = displayImages.map((item, index) => ({
    kind: "image",
    index,
    label: `Image ${index + 1}`,
    item,
    order: advancedReferenceOrderValue(item, index + 1),
  }));
  const displayVideos = [...referenceVideos, ...pendingRefs.filter((item) => item.kind === "video")]
    .sort((left, right) => advancedReferenceOrderValue(left) - advancedReferenceOrderValue(right));
  const videoItems = displayVideos.map((item, index) => ({
    kind: "video",
    index,
    label: `Video ${index + 1}`,
    item,
    order: advancedReferenceOrderValue(item, displayImages.length + index + 1),
  }));
  const displayAudios = [...referenceAudios, ...pendingRefs.filter((item) => item.kind === "audio")]
    .sort((left, right) => advancedReferenceOrderValue(left) - advancedReferenceOrderValue(right));
  const audioItems = displayAudios.map((item, index) => ({
    kind: "audio",
    index,
    label: `Audio ${index + 1}`,
    item,
    order: advancedReferenceOrderValue(item, displayImages.length + displayVideos.length + index + 1),
  }));
  return [...imageItems, ...videoItems, ...audioItems, ...documentItems].sort((left, right) => left.order - right.order);
}

function advancedPromptMentionStableKey(entry = {}) {
  const item = entry.item || entry || {};
  const kind = entry.kind || item.kind || "";
  const assetUri = item.assetUri || item.referenceAssetUri || "";
  const sourceUrl = item.sourceUrl || "";
  const dataUrl = item.dataUrl || "";
  const rawKey = item.assetId
    ? `asset:${item.assetId}`
    : assetUri
      ? `asset-uri:${assetUri}`
      : sourceUrl
        ? `source:${sourceUrl}`
        : item.url
          ? `url:${item.url}`
          : item.previewUrl
            ? `preview:${item.previewUrl}`
            : dataUrl
              ? `data:${dataUrl}`
              : item.fileName
                ? `file:${item.fileName}:${advancedReferenceOrderValue(item)}`
                : "";
  return rawKey ? `${kind}:${rawKey}` : "";
}

function advancedPromptMentionSnapshot(provider = currentAdvancedProvider()) {
  return advancedReferenceDisplayItems(provider)
    .filter(({ item }) => item && !item.isPending && !item.pendingId)
    .map((entry) => ({
      label: entry.label,
      key: advancedPromptMentionStableKey(entry),
    }))
    .filter((entry) => entry.label && entry.key);
}

function escapeAdvancedPromptMentionRegExp(value = "") {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function syncAdvancedPromptMentionLabels(previousRefs = [], nextRefs = advancedPromptMentionSnapshot()) {
  const textarea = els.advancedPrompt;
  if (!textarea || !previousRefs.length) return;
  let value = String(textarea.value || "");
  if (!value.includes("@")) return;
  const nextLabelByKey = new Map();
  nextRefs.forEach((entry) => {
    if (entry.key && entry.label) nextLabelByKey.set(entry.key, entry.label);
  });
  let changed = false;
  const boundary = "(?=$|[^A-Za-z0-9_-])";
  previousRefs
    .filter((entry) => entry.label && entry.key)
    .sort((left, right) => right.label.length - left.label.length)
    .forEach((entry) => {
      const nextLabel = nextLabelByKey.get(entry.key) || "";
      const from = `@${entry.label}`;
      const to = nextLabel ? `@${nextLabel}` : "";
      if (from === to) return;
      const pattern = new RegExp(`${escapeAdvancedPromptMentionRegExp(from)}${boundary}`, "gi");
      value = value.replace(pattern, () => {
        changed = true;
        return to;
      });
    });
  if (!changed) return;
  const cursor = Number(textarea.selectionStart || 0);
  textarea.value = value
    .replace(/[ \t]{2,}/g, " ")
    .replace(/[ \t]+([.,;:!?\uFF0C\u3002\uFF1B\uFF1A\uFF01\uFF1F\u3001])/g, "$1");
  const nextCursor = Math.min(cursor, textarea.value.length);
  textarea.setSelectionRange?.(nextCursor, nextCursor);
  textarea.dispatchEvent(new Event("input", { bubbles: true }));
}

function advancedPromptMentionContext(textarea = els.advancedPrompt) {
  if (!textarea || textarea.selectionStart !== textarea.selectionEnd) return null;
  if (textarea.hidden || textarea.closest("[hidden]")) return null;
  const cursor = Number(textarea.selectionStart || 0);
  const before = String(textarea.value || "").slice(0, cursor);
  const atIndex = before.lastIndexOf("@");
  if (atIndex < 0) return null;
  const fragment = before.slice(atIndex + 1);
  if (/[\s.,;:!?()[\]{}<>\uFF0C\u3002\uFF1B\uFF1A\uFF01\uFF1F\u3001]/.test(fragment)) return null;
  return {
    start: atIndex,
    end: cursor,
    query: fragment.trim().toLowerCase(),
  };
}

function advancedPromptMentionItems() {
  return advancedReferenceDisplayItems(currentAdvancedProvider())
    .filter(({ item }) => item && !item.isPending && !item.pendingId)
    .map((entry) => {
      const rawName = entry.item.name || entry.item.fileName || entry.item.assetId || entry.item.url || entry.label;
      return {
        ...entry,
        mention: `@${entry.label}`,
        title: String(rawName || entry.label),
        url: entry.item.dataUrl || entry.item.previewUrl || entry.item.url || "",
      };
    });
}

function textareaCaretClientRect(textarea, position = 0) {
  if (!textarea) return null;
  const style = window.getComputedStyle(textarea);
  const mirror = document.createElement("div");
  const span = document.createElement("span");
  const text = String(textarea.value || "").slice(0, position);
  const properties = [
    "boxSizing", "width", "fontFamily", "fontSize", "fontWeight", "fontStyle", "letterSpacing",
    "textTransform", "wordSpacing", "textIndent", "lineHeight", "paddingTop", "paddingRight",
    "paddingBottom", "paddingLeft", "borderTopWidth", "borderRightWidth", "borderBottomWidth",
    "borderLeftWidth", "whiteSpace", "overflowWrap", "wordBreak",
  ];
  properties.forEach((name) => { mirror.style[name] = style[name]; });
  mirror.style.position = "fixed";
  mirror.style.left = "-9999px";
  mirror.style.top = "0";
  mirror.style.height = "auto";
  mirror.style.minHeight = "0";
  mirror.style.overflow = "hidden";
  mirror.style.whiteSpace = "pre-wrap";
  mirror.style.overflowWrap = "break-word";
  mirror.style.visibility = "hidden";
  mirror.textContent = text;
  span.textContent = "\u200b";
  mirror.appendChild(span);
  document.body.appendChild(mirror);
  const textRect = textarea.getBoundingClientRect();
  const mirrorRect = mirror.getBoundingClientRect();
  const spanRect = span.getBoundingClientRect();
  const rect = {
    left: textRect.left + (spanRect.left - mirrorRect.left) - textarea.scrollLeft,
    top: textRect.top + (spanRect.top - mirrorRect.top) - textarea.scrollTop,
    bottom: textRect.top + (spanRect.bottom - mirrorRect.top) - textarea.scrollTop,
  };
  mirror.remove();
  return rect;
}

function positionAdvancedPromptMentionMenu() {
  const textarea = els.advancedPrompt;
  const menu = els.advancedPromptMentions;
  if (!textarea || !menu || menu.hidden) return;
  const field = textarea.closest(".advanced-prompt-field") || textarea.parentElement;
  if (!field) return;
  const context = state.advancedPromptMentionContext || advancedPromptMentionContext(textarea);
  const caret = textareaCaretClientRect(textarea, context?.end ?? textarea.selectionStart ?? 0);
  const fieldRect = field.getBoundingClientRect();
  const textareaRect = textarea.getBoundingClientRect();
  const width = Math.max(220, Math.min(340, fieldRect.width - 16));
  const fallbackLeft = textareaRect.left - fieldRect.left + 10;
  const fallbackTop = textareaRect.bottom - fieldRect.top + 6;
  const rawLeft = caret ? caret.left - fieldRect.left : fallbackLeft;
  const rawTop = caret ? caret.bottom - fieldRect.top + 8 : fallbackTop;
  const left = Math.max(8, Math.min(rawLeft, Math.max(8, fieldRect.width - width - 8)));
  const top = Math.max(34, rawTop);
  menu.style.setProperty("--mention-left", `${Math.round(left)}px`);
  menu.style.setProperty("--mention-top", `${Math.round(top)}px`);
  menu.style.setProperty("--mention-width", `${Math.round(width)}px`);
}

function closeAdvancedPromptMentions() {
  state.advancedPromptMentionContext = null;
  state.advancedPromptMentionItems = [];
  state.advancedPromptMentionIndex = 0;
  if (els.advancedPromptMentions) {
    els.advancedPromptMentions.hidden = true;
    els.advancedPromptMentions.innerHTML = "";
  }
}

function renderAdvancedPromptMentionMenu() {
  const textarea = els.advancedPrompt;
  const menu = els.advancedPromptMentions;
  const context = advancedPromptMentionContext(textarea);
  if (!textarea || !menu || !context) {
    closeAdvancedPromptMentions();
    return;
  }
  const query = context.query || "";
  const items = advancedPromptMentionItems()
    .filter((item) => {
      const text = `${item.mention} ${item.title} ${item.kind}`.toLowerCase();
      return !query || text.includes(query);
    })
    .slice(0, 12);
  if (!items.length) {
    closeAdvancedPromptMentions();
    return;
  }
  const selected = Math.max(0, Math.min(Number(state.advancedPromptMentionIndex || 0), items.length - 1));
  state.advancedPromptMentionContext = context;
  state.advancedPromptMentionItems = items;
  state.advancedPromptMentionIndex = selected;
  menu.hidden = false;
  menu.innerHTML = items.map((entry, index) => {
    const url = entry.url || "";
    const thumb = entry.kind === "video" && url
      ? `<video src="${escapeHtml(url)}" muted playsinline preload="metadata"></video>`
      : entry.kind === "image" && url
        ? `<img src="${escapeHtml(url)}" alt="" />`
        : `<i data-lucide="${entry.kind === "audio" ? "audio-lines" : entry.kind === "video" ? "film" : "image"}"></i>`;
    const title = entry.title && entry.title !== entry.label ? entry.title : (entry.kind === "audio" ? "Audio reference" : entry.kind === "video" ? "Video reference" : "Image reference");
    return `
      <button class="advanced-prompt-mention ${index === selected ? "is-active" : ""}" type="button" role="option" aria-selected="${index === selected ? "true" : "false"}" data-advanced-prompt-mention="${index}">
        <span class="advanced-prompt-mention-thumb is-${escapeHtml(entry.kind)}">${thumb}</span>
        <span class="advanced-prompt-mention-copy">
          <strong>${escapeHtml(entry.mention)}</strong>
          <small>${escapeHtml(title)}</small>
        </span>
      </button>
    `;
  }).join("");
  positionAdvancedPromptMentionMenu();
  refreshIcons();
}

function insertAdvancedPromptMention(index = state.advancedPromptMentionIndex || 0) {
  const textarea = els.advancedPrompt;
  const context = state.advancedPromptMentionContext || advancedPromptMentionContext(textarea);
  const item = (state.advancedPromptMentionItems || [])[index];
  if (!textarea || !context || !item) return false;
  const value = String(textarea.value || "");
  const before = value.slice(0, context.start);
  const after = value.slice(context.end);
  const needsSpace = after && /^\s/.test(after) ? "" : " ";
  const inserted = `${item.mention}${needsSpace}`;
  textarea.value = `${before}${inserted}${after}`;
  const cursor = before.length + inserted.length;
  textarea.focus?.();
  textarea.setSelectionRange?.(cursor, cursor);
  textarea.dispatchEvent(new Event("input", { bubbles: true }));
  closeAdvancedPromptMentions();
  return true;
}

function handleAdvancedPromptMentionInput() {
  state.advancedPromptMentionIndex = 0;
  renderAdvancedPromptMentionMenu();
}

function handleAdvancedPromptMentionKeydown(event) {
  if (!els.advancedPromptMentions || els.advancedPromptMentions.hidden) return;
  const items = state.advancedPromptMentionItems || [];
  if (!items.length) return;
  if (event.key === "ArrowDown" || event.key === "ArrowUp") {
    event.preventDefault();
    const delta = event.key === "ArrowDown" ? 1 : -1;
    state.advancedPromptMentionIndex = (Number(state.advancedPromptMentionIndex || 0) + delta + items.length) % items.length;
    renderAdvancedPromptMentionMenu();
    return;
  }
  if (event.key === "Enter" || event.key === "Tab") {
    event.preventDefault();
    insertAdvancedPromptMention();
    return;
  }
  if (event.key === "Escape") {
    event.preventDefault();
    closeAdvancedPromptMentions();
  }
}

function handleAdvancedPromptMentionPointer(event) {
  const button = event.target.closest("[data-advanced-prompt-mention]");
  if (!button) return;
  event.preventDefault();
  event.stopPropagation();
  insertAdvancedPromptMention(Number(button.dataset.advancedPromptMention || 0));
}

function renderAdvancedReferencePreviews() {
  if (!els.advancedUploadPreview) return;
  const provider = currentAdvancedProvider();
  const images = selectedAdvancedReferenceImages();
  const refs = advancedReferenceDisplayItems(provider);
  els.advancedUploadPreview.innerHTML = refs.map(({ kind, index, label, item }) => {
    const pending = Boolean(item.isPending || item.pendingId);
    const url = item.dataUrl || item.previewUrl || item.url || "";
    const removeAttr = kind === "image"
      ? `data-remove-advanced-ref="${index}"`
      : kind === "document"
        ? `data-remove-advanced-document="${index}"`
      : `data-remove-shared-${kind}="${index}"`;
    const pendingText = t("advanced.uploadingReference", {}, "Uploading...");
    const media = pending && url && (kind === "image" || kind === "video")
      ? `<div class="advanced-reference-pending has-preview">${kind === "video" ? `<video src="${escapeHtml(url)}" muted playsinline preload="metadata"></video>` : `<img src="${escapeHtml(url)}" alt="" />`}<div class="advanced-reference-upload-status"><i data-lucide="loader-2"></i><span>${escapeHtml(pendingText)}</span></div></div>`
      : pending
        ? `<div class="advanced-reference-pending"><i data-lucide="loader-2"></i><span>${escapeHtml(pendingText)}</span></div>`
      : kind === "video"
      ? `<video src="${escapeHtml(url)}" muted playsinline preload="metadata"></video>`
      : kind === "audio"
        ? `<div class="advanced-audio-ref"><i data-lucide="audio-lines"></i></div>`
        : kind === "document"
          ? `<div class="advanced-audio-ref"><i data-lucide="file-text"></i><span>${escapeHtml(item.fileName || item.name || "Document")}</span></div>`
        : (url ? `<img src="${escapeHtml(url)}" alt="" />` : `<div class="history-placeholder"><i data-lucide="image"></i></div>`);
    return `
      <figure class="advanced-reference-chip is-${escapeHtml(kind)} ${pending ? "is-pending" : ""}" title="${escapeHtml(item.name || item.fileName || label)}">
        ${pending ? "" : `<button class="advanced-preview-remove" type="button" ${removeAttr} aria-label="${escapeHtml(t("common.remove", {}, "Remove"))}">&times;</button>`}
        <span class="advanced-reference-label">${escapeHtml(label)}</span>
        ${media}
      </figure>
    `;
  }).join("");
  els.advancedUploadPreview.querySelectorAll("[data-remove-advanced-ref]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      removeAdvancedReferenceImage(Number(button.dataset.removeAdvancedRef));
    });
  });
  els.advancedUploadPreview.querySelectorAll("[data-remove-shared-video]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      removeAdvancedSeedanceMediaReference("video", Number(button.dataset.removeSharedVideo));
    });
  });
  els.advancedUploadPreview.querySelectorAll("[data-remove-shared-audio]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      removeAdvancedSeedanceMediaReference("audio", Number(button.dataset.removeSharedAudio));
    });
  });
  els.advancedUploadPreview.querySelectorAll("[data-remove-advanced-document]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.preventDefault();
      state.advancedDocumentReference = null;
      renderAdvancedReferencePreviews();
      updateAdvancedModelControls();
      updateAdvancedButtonCost();
    });
  });
  els.advancedUploadBox?.classList.toggle("has-image", refs.length > 0);
  if (els.advancedPromptMentions && !els.advancedPromptMentions.hidden) renderAdvancedPromptMentionMenu();
  if (els.advancedWanFirstFramePreview) {
    const firstFrame = images[0]?.dataUrl || state.advancedUploadDataUrl || "";
    if ((provider === "wan27" || provider === "happyhorse" || provider === "wan27-image-edit") && firstFrame) {
      els.advancedWanFirstFramePreview.src = firstFrame;
      els.advancedWanFirstFramePreview.classList.add("is-visible");
      els.advancedWanFirstFrame?.closest(".wan-frame-upload")?.classList.add("has-image");
    } else {
      els.advancedWanFirstFramePreview.removeAttribute("src");
      els.advancedWanFirstFramePreview.classList.remove("is-visible");
      els.advancedWanFirstFrame?.closest(".wan-frame-upload")?.classList.remove("has-image");
    }
  }
  if (els.advancedSeedanceFirstFramePreview) {
    const firstFrame = state.advancedSeedanceFirstFrameDataUrl || "";
    if (["seedance", "seedance25", "seedance-nsfw", "wan30"].includes(provider) && seedanceModeNeedsFirstFrame(els.advancedSeedanceMediaMode?.value || "") && firstFrame) {
      els.advancedSeedanceFirstFramePreview.src = firstFrame;
      els.advancedSeedanceFirstFramePreview.classList.add("is-visible");
      els.advancedSeedanceFirstFrame?.closest(".wan-frame-upload")?.classList.add("has-image");
    } else {
      els.advancedSeedanceFirstFramePreview.removeAttribute("src");
      els.advancedSeedanceFirstFramePreview.classList.remove("is-visible");
      els.advancedSeedanceFirstFrame?.closest(".wan-frame-upload")?.classList.remove("has-image");
    }
  }
  if (els.advancedSeedanceLastFramePreview) {
    if (["seedance", "seedance25", "seedance-nsfw", "wan30"].includes(provider) && state.advancedSeedanceLastFrameDataUrl) {
      els.advancedSeedanceLastFramePreview.src = state.advancedSeedanceLastFrameDataUrl;
      els.advancedSeedanceLastFramePreview.classList.add("is-visible");
    } else {
      els.advancedSeedanceLastFramePreview.removeAttribute("src");
      els.advancedSeedanceLastFramePreview.classList.remove("is-visible");
    }
  }
}

function updateAdvancedReferenceSummary() {
  if (!els.advancedReferenceSummary) return;
  els.advancedReferenceSummary.textContent = "";
}

function renderAssets(assets = state.userAssets || []) {
  if (!els.assetGrid) return;
  if (!state.user) {
    if (els.assetPager) els.assetPager.innerHTML = "";
    els.assetGrid.innerHTML = `
      <div class="history-empty-card">
        <strong>${escapeHtml(t("assets.loginRequired"))}</strong>
        <p>${escapeHtml(t("assets.loginDesc"))}</p>
        <button class="generate-btn" type="button" data-login-assets>${escapeHtml(t("history.login"))}</button>
      </div>
    `;
    els.assetGrid.querySelector("[data-login-assets]")?.addEventListener("click", openLogin);
    return;
  }
  if (!assets.length) {
    els.assetGrid.innerHTML = `<div class="history-empty-card"><strong>${escapeHtml(t("assets.emptyTitle"))}</strong><p>${escapeHtml(t("assets.emptyDesc"))}</p></div>`;
    renderSimplePager(els.assetPager, {
      page: state.userAssetsPage,
      totalPages: state.userAssetsTotalPages,
      total: state.userAssetsTotal,
    }, loadUserAssets);
    return;
  }
  els.assetGrid.innerHTML = assets.map((asset) => {
    const url = assetPreviewUrl(asset);
    const video = isVideoAsset(asset);
    const audio = isAudioAsset(asset);
    const document = isDocumentAsset(asset);
    const typeLabel = video ? t("assets.video") : audio ? t("assets.audio") : document ? "Document" : t("assets.image");
    return `
      <article class="asset-card">
        <div class="asset-preview ${audio ? "is-audio" : ""}" ${!audio ? `data-asset-preview="${escapeHtml(asset.id)}"` : ""}>
          ${video
            ? `<video src="${escapeHtml(url)}" muted playsinline preload="metadata" controls></video>`
            : audio
              ? `<div class="audio-asset-preview"><i data-lucide="audio-lines"></i><audio src="${escapeHtml(url)}" controls preload="metadata"></audio></div>`
              : document
                ? `<div class="audio-asset-preview"><i data-lucide="file-text"></i></div>`
              : `<img src="${escapeHtml(url)}" alt="${escapeHtml(asset.name || "")}" loading="lazy" />`}
        </div>
        <div class="asset-info">
          <strong>${escapeHtml(asset.name || asset.id)}</strong>
          <span>${escapeHtml(typeLabel)}</span>
        </div>
        <div class="asset-actions">
          ${!video && !audio && !document ? `<button class="ghost-button" type="button" data-asset-use="${escapeHtml(asset.id)}">${escapeHtml(t("assets.use"))}</button>` : ""}
          ${!video && !audio && !document ? `<button class="copy-btn" type="button" data-asset-modify="${escapeHtml(asset.id)}">${escapeHtml(t("assets.modify"))}</button>` : ""}
          ${!video && !audio && !document ? `<button class="ghost-button" type="button" data-asset-extend="${escapeHtml(asset.id)}">${escapeHtml(t("assets.extend"))}</button>` : ""}
          ${video ? `<button class="copy-btn" type="button" data-asset-replace="${escapeHtml(asset.id)}">${escapeHtml(t("assets.replace"))}</button>` : ""}
          ${video ? `<button class="ghost-button" type="button" data-asset-frame="${escapeHtml(asset.id)}">${escapeHtml(t("assets.extractFrame"))}</button>` : ""}
          <button class="ghost-button danger" type="button" data-asset-delete="${escapeHtml(asset.id)}">${escapeHtml(t("assets.delete"))}</button>
        </div>
      </article>
    `;
  }).join("");
  els.assetGrid.querySelectorAll("[data-asset-use]").forEach((button) => {
    button.addEventListener("click", () => useAssetInAdvanced(state.userAssets.find((asset) => asset.id === button.dataset.assetUse), "use"));
  });
  els.assetGrid.querySelectorAll("[data-asset-modify]").forEach((button) => {
    button.addEventListener("click", () => openAssetModifyDialog(state.userAssets.find((asset) => asset.id === button.dataset.assetModify)));
  });
  els.assetGrid.querySelectorAll("[data-asset-extend]").forEach((button) => {
    button.addEventListener("click", () => openAssetExtendDialog(state.userAssets.find((asset) => asset.id === button.dataset.assetExtend)));
  });
  els.assetGrid.querySelectorAll("[data-asset-replace]").forEach((button) => {
    button.addEventListener("click", () => openAssetReplaceDialog(state.userAssets.find((asset) => asset.id === button.dataset.assetReplace)));
  });
  els.assetGrid.querySelectorAll("[data-asset-frame]").forEach((button) => {
    button.addEventListener("click", () => openAssetFrameDialog(state.userAssets.find((asset) => asset.id === button.dataset.assetFrame)));
  });
  els.assetGrid.querySelectorAll("[data-asset-delete]").forEach((button) => {
    button.addEventListener("click", () => deleteUserAsset(button.dataset.assetDelete || "", { source: "assets", button }));
  });
  els.assetGrid.querySelectorAll("[data-asset-preview]").forEach((node) => {
    node.addEventListener("click", (event) => {
      if (event.target.closest("button, audio, video")) return;
      const asset = state.userAssets.find((item) => item.id === node.dataset.assetPreview);
      if (!asset) return;
      const previewUrl = assetPreviewUrl(asset);
      if (isVideoAsset(asset)) {
        playPreview({ title: asset.name || asset.id, previewUrl, ratio: "16:9" });
      } else if (!isAudioAsset(asset)) {
        previewImage({ title: asset.name || asset.id, imageUrl: previewUrl });
      }
    });
  });
  renderSimplePager(els.assetPager, {
    page: state.userAssetsPage,
    totalPages: state.userAssetsTotalPages,
    total: state.userAssetsTotal,
  }, loadUserAssets);
  refreshIcons();
}

async function loadUserAssets(page = state.userAssetsPage || 1) {
  if (!els.assetGrid) return;
  if (!state.user) {
    renderAssets([]);
    return;
  }
  const params = new URLSearchParams();
  if (els.assetSearch?.value) params.set("q", els.assetSearch.value);
  if (els.assetTypeFilter?.value) params.set("type", els.assetTypeFilter.value);
  params.set("page", String(page));
  params.set("limit", String(state.userAssetsLimit || 8));
  if (els.assetNote) els.assetNote.textContent = t("assets.loading");
  try {
    const payload = await requestJson(`/api/user-assets?${params.toString()}`);
    state.userAssets = payload.assets || [];
    state.userAssetsPage = payload.page || page;
    state.userAssetsLimit = payload.limit || state.userAssetsLimit || 8;
    state.userAssetsTotal = payload.total || 0;
    state.userAssetsTotalPages = payload.totalPages || 1;
    if (els.assetNote) els.assetNote.textContent = "";
    renderAssets();
    if (state.tab === "characters" && state.characterSource === "custom") renderGalleryCharacters(els.characterGrid);
  } catch (error) {
    if (els.assetNote) els.assetNote.textContent = t("assets.loadFailed", { message: error.message || String(error) });
  }
}

async function uploadUserAssets(files = []) {
  if (!state.user) return openLogin();
  const selected = Array.from(files || []);
  if (!selected.length) return;
  if (els.assetNote) els.assetNote.textContent = t("assets.uploading");
  let uploaded = 0;
  try {
    for (const file of selected) {
      const dataUrl = await readFileAsDataUrl(file);
      const durationSeconds = file.type.startsWith("video/") || file.type.startsWith("audio/")
        ? await readVideoDuration(file).catch(() => 0)
        : 0;
      await requestJson("/api/user-assets", {
        method: "POST",
        body: { dataUrl, name: file.name || "Upload", fileName: file.name || "", durationSeconds },
      });
      uploaded += 1;
    }
    if (els.assetNote) els.assetNote.textContent = t("assets.uploaded", { count: uploaded });
    await loadUserAssets(1);
  } catch (error) {
    if (els.assetNote) els.assetNote.textContent = t("assets.uploadFailed", { message: error.message || String(error) });
  } finally {
    if (els.assetUploadInput) els.assetUploadInput.value = "";
    updateFilePickerLabel(els.assetUploadInput);
  }
}

function clearDeletedAdvancedAssetReference(assetId = "") {
  if (!assetId) return;
  const previousPromptRefs = advancedPromptMentionSnapshot();
  let changed = false;
  const images = Array.isArray(state.advancedReferenceImages) ? state.advancedReferenceImages : [];
  const nextImages = images.filter((item) => item?.assetId !== assetId);
  if (nextImages.length !== images.length) {
    state.advancedReferenceImages = nextImages;
    state.advancedUploadDataUrl = nextImages[0]?.dataUrl || "";
    if (state.advancedFirstFrameAssetId === assetId) state.advancedFirstFrameAssetId = nextImages[0]?.assetId || "";
    if (state.advancedSourceImageAssetId === assetId) state.advancedSourceImageAssetId = nextImages[0]?.assetId || "";
    if (!nextImages.length && els.advancedImage) els.advancedImage.value = "";
    changed = true;
  }
  if (state.advancedFirstFrameAssetId === assetId) {
    state.advancedFirstFrameAssetId = "";
    state.advancedUploadDataUrl = nextImages[0]?.dataUrl || "";
    changed = true;
  }
  if (state.advancedSeedanceFirstFrameAssetId === assetId) {
    removeAdvancedMediaSlot("seedanceFirstFrame");
    changed = true;
  }
  if (state.advancedSourceImageAssetId === assetId) {
    state.advancedSourceImageAssetId = "";
    state.advancedUploadDataUrl = nextImages[0]?.dataUrl || "";
    changed = true;
  }
  if (state.advancedSeedanceLastFrameAssetId === assetId) {
    removeAdvancedMediaSlot("seedanceLastFrame");
    changed = true;
  }
  if (state.advancedWanLastFrameAssetId === assetId) {
    removeAdvancedMediaSlot("wanLastFrame");
    changed = true;
  }
  if (state.advancedWanClipAssetId === assetId) {
    removeAdvancedMediaSlot("wanClip");
    changed = true;
  }
  if (state.advancedSeedanceVideoAssetId === assetId) {
    state.advancedSeedanceVideoAssetId = "";
    state.advancedSeedanceVideoPreviewUrl = "";
    changed = true;
  }
  const seedanceVideos = advancedSeedanceVideoReferences();
  const nextSeedanceVideos = seedanceVideos.filter((item) => item.assetId !== assetId);
  if (nextSeedanceVideos.length !== seedanceVideos.length) {
    setAdvancedSeedanceVideoReferences(nextSeedanceVideos);
    changed = true;
  }
  if (state.advancedAudioAssetId === assetId) {
    removeAdvancedMediaSlot("wanAudio");
    changed = true;
  }
  const seedanceAudios = advancedSeedanceAudioReferences();
  const nextSeedanceAudios = seedanceAudios.filter((item) => item.assetId !== assetId);
  if (nextSeedanceAudios.length !== seedanceAudios.length) {
    setAdvancedSeedanceAudioReferences(nextSeedanceAudios);
    changed = true;
  }
  if (state.advancedDocumentReference?.assetId === assetId) {
    state.advancedDocumentReference = null;
    changed = true;
  }
  if (!changed) return;
  syncAdvancedPromptMentionLabels(previousPromptRefs);
  renderAdvancedReferencePreviews();
  updateAdvancedReferenceSummary();
  updateAdvancedModelControls();
  updateAdvancedButtonCost();
}

async function deleteUserAsset(assetId = "", options = {}) {
  if (!assetId) return;
  const source = options?.source || "assets";
  const button = options?.button || null;
  if (button) button.disabled = true;
  try {
    await requestJson(`/api/user-assets/${encodeURIComponent(assetId)}`, { method: "DELETE" });
    clearDeletedAdvancedAssetReference(assetId);
    if (Array.isArray(state.userAssets)) state.userAssets = state.userAssets.filter((asset) => asset.id !== assetId);
    if (Array.isArray(state.advancedAssets)) state.advancedAssets = state.advancedAssets.filter((asset) => asset.id !== assetId);
    if (state.tab === "assets") await loadUserAssets(state.userAssetsPage || 1);
    if (source === "advanced" || state.tab === "advanced") {
      await loadAdvancedAssets(state.advancedAssetPage || 1);
    } else if (state.advancedAssetsLoaded) {
      renderAdvancedAssets();
    }
  } catch (error) {
    const note = source === "advanced" ? els.advancedAssetNote : els.assetNote;
    if (note) note.textContent = error.message || String(error);
    if (button) button.disabled = false;
  }
}

async function submitTemplate() {
  if (!state.activeTemplate) return;
  const template = state.activeTemplate;
  if (els.templateDialog?.open) els.templateDialog.close();
  setTab("advanced");
  state.advancedCreateKind = "video";
  state.advancedCreateMode = template.type === "text-to-video" ? "video-text" : "video-image";
  state.activeTemplate = null;
  state.activeAdvancedCaseId = "";
  if (els.advancedProvider) els.advancedProvider.value = "seedance";
  if (els.advancedPrompt) els.advancedPrompt.value = els.templatePrompt?.value || template.prompt || template.description || "";
  if (els.advancedSeedanceMediaMode) els.advancedSeedanceMediaMode.value = "reference_video";
  if (state.uploadDataUrl) {
    state.advancedReferenceImages = [{ dataUrl: state.uploadDataUrl, fileName: "reference.png" }];
    state.advancedUploadDataUrl = state.uploadDataUrl;
  }
  updateAdvancedModelControls();
  setAdvancedSideTab("assets");
}

function isMobileHistoryLayout() {
  return window.matchMedia("(max-width: 720px)").matches;
}

function disconnectHistoryLoadMoreObserver() {
  if (historyLoadMoreObserver) historyLoadMoreObserver.disconnect();
  historyLoadMoreObserver = null;
}

function mergeHistoryRecordPages(primary = [], secondary = []) {
  const seen = new Set();
  return [...primary, ...secondary].filter((record, index) => {
    const key = String(record?.taskId || record?.id || `${record?.createdAt || ""}-${index}`);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function setupHistoryInfiniteScroll() {
  disconnectHistoryLoadMoreObserver();
  if (!isMobileHistoryLayout() || state.tab !== "history" || !state.user) return;
  if (Number(state.historyRecordsPage || 1) >= Number(state.historyRecordsTotalPages || 1)) return;
  const sentinel = els.historyList?.querySelector("[data-history-load-more]");
  if (!sentinel || !("IntersectionObserver" in window)) return;
  historyLoadMoreObserver = new IntersectionObserver((entries) => {
    if (!entries.some((entry) => entry.isIntersecting) || historyLoading || historyRefreshInFlight) return;
    disconnectHistoryLoadMoreObserver();
    sentinel.classList.add("is-loading");
    loadHistory({
      silent: true,
      append: true,
      page: Number(state.historyRecordsPage || 1) + 1,
    }).finally(() => {
      if (state.tab === "history" && document.contains(sentinel)) setupHistoryInfiniteScroll();
    });
  }, { rootMargin: "360px 0px", threshold: 0.01 });
  historyLoadMoreObserver.observe(sentinel);
}

function renderHistory(records = []) {
  if (!els.historyList) return;
  disconnectHistoryLoadMoreObserver();
  const mobileLayout = isMobileHistoryLayout();
  if (els.historyPager) {
    els.historyPager.hidden = mobileLayout;
    if (mobileLayout) els.historyPager.innerHTML = "";
  }
  const sortedRecords = [...records].sort((left, right) => new Date(right.createdAt || right.updatedAt || 0) - new Date(left.createdAt || left.updatedAt || 0));
  if (!state.user) {
    if (els.historyPager) els.historyPager.innerHTML = "";
    els.historyList.innerHTML = `
      <div class="history-empty-card">
        <strong>${escapeHtml(t("history.loginRequired"))}</strong>
        <p>${escapeHtml(t("history.loginDesc"))}</p>
        <button class="generate-btn" type="button" data-login-history>${escapeHtml(t("history.login"))}</button>
      </div>
    `;
    els.historyList.querySelector("[data-login-history]")?.addEventListener("click", openLogin);
    refreshIcons();
    return;
  }
  if (!sortedRecords.length) {
    els.historyList.innerHTML = `<div class="history-empty-card"><strong>${escapeHtml(t("history.emptyTitle"))}</strong><p>${escapeHtml(t("history.emptyDesc"))}</p></div>`;
    if (!mobileLayout) {
      renderSimplePager(els.historyPager, {
        page: state.historyRecordsPage,
        totalPages: state.historyRecordsTotalPages,
        total: state.historyRecordsTotal,
      }, (page) => loadHistory({ page }), { jump: true });
    }
    refreshIcons();
    return;
  }
  state.historyRecords = sortedRecords;
  const loadMoreHtml = mobileLayout && Number(state.historyRecordsPage || 1) < Number(state.historyRecordsTotalPages || 1)
    ? `<div class="history-load-sentinel" data-history-load-more><i data-lucide="loader-circle"></i></div>`
    : "";
  els.historyList.innerHTML = `${sortedRecords.map((record, index) => {
    const videoUrl = generationVideoUrl(record);
    const imageResultUrl = generationImageResultUrl(record);
    const textResult = String(record.textResult || record.responseText || "").trim();
    const resultLocked = record.resultLocked === true;
    const isSucceeded = isSucceededGenerationStatus(record.status) || Boolean(videoUrl || imageResultUrl || textResult);
    const taskId = record.taskId || "";
    const mediaKey = `history-video-${Math.random().toString(36).slice(2)}`;
    const recordRatio = record.ratio || record.params?.ratio || record.params?.aspect_ratio;
    const mediaStyle = ratioStyle(recordRatio);
    const posterUrl = isSucceeded ? generationPosterUrl(record) : "";
    // The newest result is the primary thing users are waiting for. Start it
    // immediately; keep older, potentially large media lazy to protect the
    // connection when the history page contains several results.
    const imageLoading = index === 0 ? "eager" : "lazy";
    const imageFetchPriority = index === 0 ? "high" : "auto";
    const canDownload = canDownloadGenerationRecord(record);
    const isUndressHistory = isTenantTool("undress");
    const recordStatusClass = statusClass(record.status);
    const recordStatusLabel = statusLabel(record.status);
    const recordStatusIcon = resultLocked
      ? "lock-keyhole"
      : recordStatusClass === "failed"
        ? "circle-alert"
        : isSucceeded
          ? "check-circle-2"
          : "loader-circle";
    const recordDate = formatDateTime(record.createdAt || record.updatedAt);
    const regenerateAction = taskId && !resultLocked && !isTenantTool("undress") ? `
      <button class="history-download history-regenerate" type="button" data-history-regenerate="${escapeHtml(taskId)}">
        <i data-lucide="refresh-cw"></i>${escapeHtml(t("history.regenerate"))}
      </button>
    ` : "";
    const unlockAction = taskId && resultLocked && !isUndressHistory ? `
      <button class="history-download history-unlock" type="button" data-history-unlock="${escapeHtml(taskId)}">
        <i data-lucide="unlock"></i>${escapeHtml(t("history.unlockResult", { credits: formatCredits(record.unlockCredits || 0) }, `Unlock · ${formatCredits(record.unlockCredits || 0)} credits`))}
      </button>
    ` : "";
    const unlockOverlay = taskId && resultLocked && isUndressHistory ? `
      <button class="history-unlock-overlay" type="button" data-history-unlock="${escapeHtml(taskId)}">
        <i data-lucide="unlock"></i>
        <span>${escapeHtml(state.lang === "zh" ? "解锁" : "Unlock")}</span>
      </button>
    ` : "";
    const undressDownloadAction = isUndressHistory && !resultLocked && canDownload && (videoUrl || imageResultUrl) ? `
      <button class="history-undress-download" type="button" data-history-download="${escapeHtml(String(index))}" aria-label="${escapeHtml(t("history.download"))}" title="${escapeHtml(t("history.download"))}">
        <i data-lucide="download"></i>
      </button>
    ` : "";
    const undressDeleteAction = isUndressHistory && !resultLocked && taskId && (videoUrl || imageResultUrl || statusClass(record.status) === "failed") ? `
      <button class="history-undress-delete" type="button" data-history-delete="${escapeHtml(taskId)}" aria-label="${escapeHtml(t("history.delete"))}" title="${escapeHtml(t("history.delete"))}">
        <i data-lucide="trash-2"></i>
      </button>
    ` : "";
    const undressResultActions = undressDownloadAction || undressDeleteAction ? `
      <div class="history-undress-result-actions">${undressDownloadAction}${undressDeleteAction}</div>
    ` : "";
    const resultActions = !isUndressHistory && taskId && (videoUrl || imageResultUrl) ? `
      ${canDownload ? `
        <button class="history-download history-download-file" type="button" data-history-download="${escapeHtml(String(index))}">
          <i data-lucide="download"></i>${escapeHtml(t("history.download"))}
        </button>
      ` : ""}
      <button class="history-download history-add-asset" type="button" data-history-add-asset="${escapeHtml(taskId)}">
        <i data-lucide="folder-plus"></i>${escapeHtml(t("history.addAsset"))}
      </button>
    ` : "";
    const videoActions = taskId && videoUrl && !isTenantTool("undress") ? `
      <button class="history-download history-extend" type="button" data-history-extend="${escapeHtml(taskId)}">
        <i data-lucide="stretch-horizontal"></i>${escapeHtml(t("assets.extend"))}
      </button>
      <button class="history-download history-replace" type="button" data-history-replace="${escapeHtml(taskId)}">
        <i data-lucide="replace"></i>${escapeHtml(t("assets.replace"))}
      </button>
      <button class="history-download history-frame" type="button" data-history-frame="${escapeHtml(taskId)}">
        <i data-lucide="scan-line"></i>${escapeHtml(t("assets.extractFrame"))}
      </button>
    ` : "";
    const detailAction = isUndressHistory ? "" : `
      <button class="history-download history-params" type="button" data-history-detail="${index}">
        <i data-lucide="sliders-horizontal"></i>${escapeHtml(t("history.viewParameters"))}
      </button>
    `;
    const deleteAction = taskId && !isUndressHistory ? `
      <button class="history-download history-delete" type="button" data-history-delete="${escapeHtml(taskId)}">
        <i data-lucide="trash-2"></i>${escapeHtml(t("history.delete"))}
      </button>
    ` : "";
    const primaryActions = `${unlockAction}${regenerateAction}${resultActions}${videoActions}`;
    const allActions = `${primaryActions}${detailAction}${deleteAction}`;
    return `
      <article class="history-item is-${escapeHtml(statusClass(record.status))}${resultLocked ? " is-result-locked" : ""}" data-history-index="${index}">
        <div class="history-media" style="${escapeHtml(mediaStyle)}">
          ${resultLocked ? `<div class="history-placeholder history-locked-preview-wrap">
            ${record.lockedPreviewUrl ? `<img class="history-locked-preview" src="${escapeHtml(record.lockedPreviewUrl)}" alt="" loading="lazy" decoding="async" draggable="false" /><span class="history-locked-scrim" aria-hidden="true"></span>` : ""}
            <span class="history-locked-mark" aria-hidden="true"><i data-lucide="lock-keyhole"></i></span>
            ${unlockOverlay}
          </div>` : videoUrl ? `
            <button class="history-poster" type="button" data-history-load-video="${escapeHtml(mediaKey)}" aria-label="${escapeHtml(t("common.preview"))}">
              ${posterUrl ? `<img src="${escapeHtml(posterUrl)}" alt="" loading="lazy" decoding="async" />` : `<span>${escapeHtml(statusLabel(record.status))}</span>`}
              <i data-lucide="play"></i>
            </button>
            <video data-src="${escapeHtml(videoUrl)}" ${posterUrl ? `poster="${escapeHtml(posterUrl)}"` : ""} muted loop playsinline preload="none" data-history-video="${escapeHtml(mediaKey)}" hidden></video>
          ` : imageResultUrl ? `<img class="history-result-image" data-history-image="${index}" src="${escapeHtml(imageResultUrl)}" alt="" loading="${imageLoading}" fetchpriority="${imageFetchPriority}" decoding="async" />` : textResult ? `<div class="history-result-text">${escapeHtml(textResult)}</div>` : `<div class="history-placeholder"><i data-lucide="${recordStatusIcon}"></i><span>${escapeHtml(recordStatusLabel)}</span></div>`}
        </div>
        ${isUndressHistory ? `<div class="undress-history-footer">
          <div class="undress-history-meta">
            <span class="undress-history-status is-${escapeHtml(recordStatusClass)}"><i data-lucide="${escapeHtml(recordStatusIcon)}"></i>${escapeHtml(recordStatusLabel)}</span>
            ${recordDate ? `<time datetime="${escapeHtml(record.createdAt || record.updatedAt || "")}">${escapeHtml(recordDate)}</time>` : ""}
          </div>
          ${undressResultActions}
        </div>` : ""}
        ${isUndressHistory ? "" : `<div class="history-card-actions">
          <div class="history-record-actions${taskId || videoUrl ? "" : " history-record-actions-empty"}">
            ${primaryActions}
          </div>
          ${detailAction}
          ${deleteAction}
        </div>
        <details class="history-actions-menu">
          <summary class="history-download history-actions-trigger">
            <i data-lucide="ellipsis"></i><span>${escapeHtml(t("history.actions"))}</span><i data-lucide="chevron-down"></i>
          </summary>
          <div class="history-actions-popover" role="menu">${allActions}</div>
        </details>`}
      </article>
    `;
  }).join("")}${loadMoreHtml}`;
  const allowInlinePreview = !mobileLayout && window.matchMedia("(hover: hover) and (pointer: fine)").matches;
  els.historyList.querySelectorAll("[data-history-load-video]").forEach((button) => {
    const showVideo = () => {
      const key = button.dataset.historyLoadVideo || "";
      const escapedKey = window.CSS?.escape ? CSS.escape(key) : key.replace(/["\\]/g, "\\$&");
      const video = els.historyList.querySelector(`[data-history-video="${escapedKey}"]`);
      if (!video) return;
      if (!video.src) video.src = video.dataset.src || "";
      video.muted = true;
      video.loop = true;
      video.controls = false;
      video.hidden = false;
      button.hidden = true;
      video.play?.().catch(() => {});
    };
    const openModalPreview = () => {
      const key = button.dataset.historyLoadVideo || "";
      const escapedKey = window.CSS?.escape ? CSS.escape(key) : key.replace(/["\\]/g, "\\$&");
      const video = els.historyList.querySelector(`[data-history-video="${escapedKey}"]`);
      const previewUrl = video?.dataset?.src || video?.src || "";
      const index = Number(button.closest(".history-item")?.dataset.historyIndex || -1);
      const record = Number.isInteger(index) && index >= 0 ? sortedRecords[index] : null;
      if (!previewUrl) return;
      playPreview({
        title: record?.templateTitle || record?.sceneName || record?.taskId || t("common.preview"),
        previewUrl,
        posterUrl: generationPosterUrl(record),
        ratio: record?.ratio || record?.params?.ratio || record?.params?.aspect_ratio || "16:9",
      });
    };
    if (allowInlinePreview) {
      button.addEventListener("mouseenter", showVideo, { once: true });
      button.addEventListener("focus", showVideo, { once: true });
    }
    button.addEventListener("click", openModalPreview);
  });
  els.historyList.querySelectorAll(".history-result-image").forEach((image) => {
    image.addEventListener("click", () => {
      const index = Number(image.dataset.historyImage || -1);
      const record = sortedRecords[index];
      const previewUrl = image.getAttribute("src") || generationImageResultUrl(record);
      if (!previewUrl) return;
      previewImage({
        title: record?.templateTitle || record?.sceneName || record?.taskId || t("common.preview"),
        imageUrl: previewUrl,
      });
    });
  });
  els.historyList.querySelectorAll("[data-history-regenerate]").forEach((button) => {
    button.addEventListener("click", () => regenerateHistoryRecord(button.dataset.historyRegenerate || "", button));
  });
  els.historyList.querySelectorAll("[data-history-unlock]").forEach((button) => {
    button.addEventListener("click", () => {
      const taskId = button.dataset.historyUnlock || "";
      const record = sortedRecords.find((item) => String(item.taskId || "") === String(taskId));
      unlockHistoryRecord(taskId, button, record);
    });
  });
  els.historyList.querySelectorAll("[data-history-add-asset]").forEach((button) => {
    button.addEventListener("click", () => addHistoryRecordToAssets(button.dataset.historyAddAsset || "", button));
  });
  els.historyList.querySelectorAll("[data-history-download]").forEach((button) => {
    button.addEventListener("click", async () => {
      const record = sortedRecords[Number(button.dataset.historyDownload || 0)];
      button.disabled = true;
      try {
        await downloadGenerationRecord(record);
      } finally {
        button.disabled = false;
      }
    });
  });
  els.historyList.querySelectorAll("[data-history-replace]").forEach((button) => {
    button.addEventListener("click", () => openHistoryRecordAssetAction(button.dataset.historyReplace || "", "replace", button));
  });
  els.historyList.querySelectorAll("[data-history-extend]").forEach((button) => {
    button.addEventListener("click", () => openHistoryRecordAssetAction(button.dataset.historyExtend || "", "extend", button));
  });
  els.historyList.querySelectorAll("[data-history-frame]").forEach((button) => {
    button.addEventListener("click", () => openHistoryRecordAssetAction(button.dataset.historyFrame || "", "frame", button));
  });
  els.historyList.querySelectorAll("[data-history-detail]").forEach((button) => {
    button.addEventListener("click", () => openHistoryDetail(button.dataset.historyDetail || 0));
  });
  els.historyList.querySelectorAll("[data-history-delete]").forEach((button) => {
    button.addEventListener("click", () => deleteHistoryRecord(button.dataset.historyDelete || "", button));
  });
  const actionMenus = Array.from(els.historyList.querySelectorAll(".history-actions-menu"));
  actionMenus.forEach((menu) => {
    menu.addEventListener("toggle", () => {
      if (!menu.open) return;
      actionMenus.forEach((other) => {
        if (other !== menu) other.open = false;
      });
    });
    menu.querySelectorAll("button").forEach((button) => {
      button.addEventListener("click", () => { menu.open = false; });
    });
  });
  if (mobileLayout) {
    setupHistoryInfiniteScroll();
  } else {
    renderSimplePager(els.historyPager, {
      page: state.historyRecordsPage,
      totalPages: state.historyRecordsTotalPages,
      total: state.historyRecordsTotal,
    }, (page) => loadHistory({ page }), { jump: true });
  }
  refreshIcons();
}

async function showUndressInsufficientCreditsDialog(error) {
  const zh = state.lang === "zh";
  const cost = Number(error?.payload?.cost || 0);
  const credits = Number(error?.payload?.credits || state.user?.credits || 0);
  const detail = cost > 0
    ? (zh
      ? `\u9700\u8981 ${formatCredits(cost)} \u79ef\u5206\uff0c\u5f53\u524d\u4f59\u989d ${formatCredits(credits)} \u79ef\u5206\u3002`
      : `Unlocking needs ${formatCredits(cost)} credits. Your balance is ${formatCredits(credits)} credits.`)
    : (zh ? "\u4f59\u989d\u4e0d\u8db3\uff0c\u8bf7\u5145\u503c\u540e\u518d\u89e3\u9501\u3002" : "Your balance is insufficient. Top up before unlocking.");
  const result = await showInlineDialog({
    title: zh ? "\u4f59\u989d\u4e0d\u8db3" : "Insufficient balance",
    body: `<div class="undress-credit-alert"><i data-lucide="wallet-cards"></i><p>${escapeHtml(detail)}</p></div>`,
    confirmText: zh ? "\u53bb\u5145\u503c" : "Top up",
    onOpen: () => {
      if (els.inlineDialogConfirm) {
        els.inlineDialogConfirm.innerHTML = `<i data-lucide="wallet"></i>${escapeHtml(zh ? "\u53bb\u5145\u503c" : "Top up")}`;
      }
      refreshIcons();
    },
  });
  if (result === "confirm") openTopupDialog();
}

async function showUndressUnlockConfirm(record = {}) {
  const zh = state.lang === "zh";
  const cost = formatCredits(record.unlockCredits || 0);
  const result = await showInlineDialog({
    title: zh ? "确认解锁" : "Unlock result?",
    dialogClass: "is-undress-unlock",
    body: `<div class="undress-unlock-confirm">
      <span>${escapeHtml(zh ? "本次解锁将扣除" : "This unlock will deduct")}</span>
      <strong>${escapeHtml(cost)} <small>${escapeHtml(zh ? "积分" : "credits")}</small></strong>
    </div>`,
    confirmText: zh ? "确认解锁" : "Unlock",
    onOpen: () => {
      if (els.inlineDialogConfirm) {
        els.inlineDialogConfirm.innerHTML = `<i data-lucide="unlock"></i>${escapeHtml(zh ? "确认解锁" : "Unlock")}`;
      }
      refreshIcons();
    },
  });
  return result === "confirm";
}

async function unlockHistoryRecord(taskId, button, record = {}) {
  if (!taskId || !button) return;
  if (!(await showUndressUnlockConfirm(record))) return;
  const originalHtml = button.innerHTML;
  button.disabled = true;
  button.innerHTML = `<i data-lucide="loader-circle"></i>${escapeHtml(t("history.unlocking", {}, "Unlocking..."))}`;
  refreshIcons();
  try {
    const payload = await requestJson(`/api/undress-tool/tasks/${encodeURIComponent(taskId)}/unlock`, { method: "POST" });
    if (payload.user) setUser(payload.user);
    if (payload.record) {
      state.historyRecords = (state.historyRecords || []).map((record) => (
        String(record.taskId || "") === String(taskId) ? payload.record : record
      ));
      renderHistory(state.historyRecords);
    } else {
      await loadHistory({ silent: true });
    }
  } catch (error) {
    button.disabled = false;
    button.innerHTML = originalHtml;
    refreshIcons();
    if (error.statusCode === 402 || error.code === "INSUFFICIENT_CREDITS") {
      await showUndressInsufficientCreditsDialog(error);
      return;
    }
    const note = document.createElement("div");
    note.className = "job-note history-action-note";
    note.textContent = error.message || String(error);
    els.historyList?.prepend(note);
    window.setTimeout(() => note.remove(), 5000);
    refreshIcons();
  }
}

async function regenerateHistoryRecord(taskId, button) {
  if (!taskId || !button) return;
  const originalHtml = button.innerHTML;
  button.disabled = true;
  button.innerHTML = `<i data-lucide="loader-circle"></i>${escapeHtml(t("history.regenerating"))}`;
  refreshIcons();
  try {
    let record = (state.historyRecords || []).find((item) => String(item.taskId || "") === String(taskId));
    if (!record) {
      const payload = await requestJson(`/api/generation-records/${encodeURIComponent(taskId)}`);
      record = payload.record || payload.generation || null;
      if (payload.user) setUser(payload.user);
    }
    if (!record) throw new Error(t("history.loadFailed", { message: "record not found" }));
    restoreRecordToAdvancedCreate(record, button);
    button.innerHTML = `<i data-lucide="check"></i>${escapeHtml(t("history.regenerateSubmitted"))}`;
    refreshIcons();
  } catch (error) {
    button.innerHTML = `<i data-lucide="alert-circle"></i>${escapeHtml(error.message || String(error))}`;
    refreshIcons();
    window.setTimeout(() => {
      button.disabled = false;
      button.innerHTML = originalHtml;
      refreshIcons();
    }, 2500);
    return;
  }
  button.disabled = false;
}

async function addHistoryRecordToAssets(taskId, button) {
  if (!taskId || !button) return;
  const originalHtml = button.innerHTML;
  button.disabled = true;
  button.innerHTML = `<i data-lucide="loader-circle"></i>${escapeHtml(t("history.addingAsset"))}`;
  refreshIcons();
  try {
    const payload = await requestJson(`/api/generation-records/${encodeURIComponent(taskId)}/add-asset`, { method: "POST" });
    if (payload.asset) {
      state.userAssets = [payload.asset, ...(state.userAssets || []).filter((asset) => asset.id !== payload.asset.id)];
    }
    button.innerHTML = `<i data-lucide="check"></i>${escapeHtml(t("history.assetAdded"))}`;
    refreshIcons();
    window.setTimeout(() => {
      button.disabled = false;
      button.innerHTML = originalHtml;
      refreshIcons();
    }, 1800);
  } catch (error) {
    button.disabled = false;
    button.innerHTML = originalHtml;
    if (els.historyList) {
      const note = document.createElement("div");
      note.className = "job-note history-action-note";
      note.textContent = error.message || String(error);
      els.historyList.prepend(note);
      window.setTimeout(() => note.remove(), 5000);
    }
    refreshIcons();
  }
}

async function historyRecordToVideoAsset(taskId, button) {
  if (!taskId) return null;
  const originalHtml = button?.innerHTML || "";
  if (button) {
    button.disabled = true;
    button.innerHTML = `<i data-lucide="loader-circle"></i>${escapeHtml(t("history.addingAsset"))}`;
    refreshIcons();
  }
  try {
    const payload = await requestJson(`/api/generation-records/${encodeURIComponent(taskId)}/add-asset`, { method: "POST" });
    if (payload.asset) {
      state.userAssets = [payload.asset, ...(state.userAssets || []).filter((asset) => asset.id !== payload.asset.id)];
      state.userAssetsTotal += 1;
    }
    return payload.asset || null;
  } finally {
    if (button) {
      button.disabled = false;
      button.innerHTML = originalHtml;
      refreshIcons();
    }
  }
}

async function openHistoryRecordAssetAction(taskId, action = "replace", button = null) {
  const videoAsset = await historyRecordToVideoAsset(taskId, button).catch((error) => {
    if (els.historyList) {
      const note = document.createElement("div");
      note.className = "job-note history-action-note";
      note.textContent = error.message || String(error);
      els.historyList.prepend(note);
      window.setTimeout(() => note.remove(), 5000);
    }
    refreshIcons();
    return null;
  });
  if (!videoAsset) return;
  if (action === "frame") return openAssetFrameDialog(videoAsset);
  if (action === "extend") return openAssetVideoExtendDialog(videoAsset);
  if (action === "replace") return openAssetReplaceDialog(videoAsset);
}

async function deleteHistoryRecord(taskId = "", button = null) {
  if (!taskId) return;
  const originalHtml = button?.innerHTML || "";
  if (button) {
    button.disabled = true;
    button.innerHTML = `<i data-lucide="loader-circle"></i>${escapeHtml(t("history.deleting"))}`;
    refreshIcons();
  }
  try {
    await requestJson(`/api/generation-records/${encodeURIComponent(taskId)}`, { method: "DELETE" });
    state.historyRecords = (state.historyRecords || []).filter((record) => String(record.taskId || "") !== String(taskId));
    state.historyRecordsTotal = Math.max(0, Number(state.historyRecordsTotal || 0) - 1);
    historyRecordsSignature = "";
    await loadHistory({ silent: true, page: 1, preserveMobile: true });
  } catch (error) {
    if (button) {
      button.disabled = false;
      button.innerHTML = originalHtml;
      refreshIcons();
    }
    if (els.historyList) {
      const note = document.createElement("div");
      note.className = "job-note history-action-note";
      note.textContent = t("history.deleteFailed", { message: error.message || String(error) });
      els.historyList.prepend(note);
      window.setTimeout(() => note.remove(), 5000);
    }
  }
}

function isPendingGenerationRecord(record = {}) {
  if (generationVideoUrl(record)) return false;
  if (generationImageResultUrl(record)) return false;
  return !["succeeded", "success", "done", "completed", "failed", "error", "cancelled", "canceled", "reference_failed", "rejected", "refunded", "deleted", "hidden"]
    .includes(String(record.status || "").toLowerCase().trim());
}

function generationRecordTime(record = {}) {
  const value = Date.parse(record.updatedAt || record.createdAt || "");
  return Number.isFinite(value) ? value : 0;
}

function isRecentPendingGenerationRecord(record = {}) {
  if (!isPendingGenerationRecord(record) || !record.taskId) return false;
  const time = generationRecordTime(record);
  return !time || Date.now() - time <= HISTORY_PENDING_REFRESH_MAX_AGE_MS;
}

function canRefreshHistoryRecordDetail(record = {}) {
  if (!isRecentPendingGenerationRecord(record)) return false;
  const taskId = String(record.taskId || "");
  if (!taskId || historyDetailRefreshInFlight.has(taskId)) return false;
  const lastRefreshAt = historyDetailRefreshAt.get(taskId) || 0;
  return Date.now() - lastRefreshAt >= HISTORY_DETAIL_REFRESH_COOLDOWN_MS;
}

async function refreshPendingHistoryRecords(records = []) {
  if (state.tab !== "history" || !state.user) return;
  const candidates = records
    .filter(canRefreshHistoryRecordDetail)
    .sort((left, right) => generationRecordTime(right) - generationRecordTime(left))
    .slice(0, HISTORY_DETAIL_REFRESH_LIMIT);
  if (!candidates.length) return;

  const startedAt = Date.now();
  candidates.forEach((record) => {
    const taskId = String(record.taskId || "");
    historyDetailRefreshAt.set(taskId, startedAt);
    historyDetailRefreshInFlight.add(taskId);
  });

  const settled = await Promise.allSettled(candidates.map((record) => (
    requestJson(`/api/generation-records/${encodeURIComponent(record.taskId)}`)
  )));

  candidates.forEach((record) => historyDetailRefreshInFlight.delete(String(record.taskId || "")));
  if (state.tab !== "history" || !state.user) return;
  if (settled.some((result) => result.status === "fulfilled")) {
    window.setTimeout(() => loadHistory({ silent: true, page: 1, preserveMobile: true }), 500);
  }
}

async function requestVideoFullscreen(video) {
  if (!video) return;
  try {
    if (video.requestFullscreen) await video.requestFullscreen();
    else if (video.webkitEnterFullscreen) video.webkitEnterFullscreen();
    else if (video.webkitRequestFullscreen) await video.webkitRequestFullscreen();
    await video.play().catch(() => {});
  } catch {
    video.controls = true;
  }
}

function stopHistoryRefresh() {
  if (historyRefreshTimer) window.clearTimeout(historyRefreshTimer);
  historyRefreshTimer = null;
}

function scheduleHistoryRefresh({ delayMs = 15000, force = false } = {}) {
  if (historyRefreshTimer && !force) return;
  stopHistoryRefresh();
  if (state.tab !== "history" || !state.user) return;
  historyRefreshTimer = window.setTimeout(() => {
    historyRefreshTimer = null;
    if (state.tab === "history") loadHistory({ silent: true, refresh: true, page: 1, preserveMobile: true });
  }, delayMs);
}

async function loadHistory({
  silent = false,
  refresh = false,
  page = state.historyRecordsPage || 1,
  append = false,
  preserveMobile = false,
} = {}) {
  if (!els.historyList) return;
  if (!state.user) {
    stopHistoryRefresh();
    historyRecordsSignature = "";
    renderHistory([]);
    return;
  }
  if (historyLoading || historyRefreshInFlight) {
    if (append) return;
    scheduleHistoryRefresh({ delayMs: 5000, force: true });
    return;
  }
  historyLoading = true;
  historyRefreshInFlight = true;
  const previousScrollTop = els.historyList.scrollTop || 0;
  const previousRecords = Array.isArray(state.historyRecords) ? state.historyRecords : [];
  const previousPage = Number(state.historyRecordsPage || 1);
  const requestedPage = Math.max(1, Number(page || 1) || 1);
  if (!silent && !append) els.historyList.innerHTML = `<div class="job-note">${escapeHtml(t("history.loading"))}</div>`;
  try {
    const historyUrl = `/api/generation-records?page=${encodeURIComponent(requestedPage)}&limit=${encodeURIComponent(state.historyRecordsLimit || 8)}${refresh ? "&refresh=1" : ""}`;
    const payload = await requestJson(historyUrl);
    if (payload.user) setUser(payload.user);
    const incomingRecords = payload.records || [];
    const mobileLayout = isMobileHistoryLayout();
    const shouldAppend = mobileLayout && append && requestedPage > 1;
    const shouldPreserve = mobileLayout && preserveMobile && previousRecords.length > 0;
    const records = shouldAppend
      ? mergeHistoryRecordPages(previousRecords, incomingRecords)
      : shouldPreserve
        ? mergeHistoryRecordPages(incomingRecords, previousRecords)
        : incomingRecords;
    state.historyRecordsPage = shouldAppend || shouldPreserve
      ? Math.max(previousPage, Number(payload.page || requestedPage))
      : payload.page || requestedPage;
    state.historyRecordsLimit = payload.limit || state.historyRecordsLimit || 8;
    state.historyRecordsTotal = payload.total || records.length;
    state.historyRecordsTotalPages = payload.totalPages || 1;
    state.historyRecords = records;
    const nextSignature = generationRecordsSignature(records);
    if (!silent || shouldAppend || nextSignature !== historyRecordsSignature) {
      renderHistory(records);
      historyRecordsSignature = nextSignature;
      if (!shouldAppend) els.historyList.scrollTop = previousScrollTop;
    }
    if (state.tab === "advanced" && state.advancedSideTab === "result" && !state.advancedResultRecords?.length) {
      renderAdvancedResultPanel();
    }
    refreshPendingHistoryRecords(records);
    if (records.some(isRecentPendingGenerationRecord)) scheduleHistoryRefresh();
    else stopHistoryRefresh();
  } catch (error) {
    if (!silent) els.historyList.innerHTML = `<div class="job-note">${escapeHtml(t("history.loadFailed", { message: error.message || String(error) }))}</div>`;
    scheduleHistoryRefresh({ delayMs: 30000, force: true });
  } finally {
    historyLoading = false;
    historyRefreshInFlight = false;
  }
}

function ledgerLoginCard() {
  return `
    <div class="history-empty-card">
      <strong>${escapeHtml(t("ledger.loginRequired"))}</strong>
      <p>${escapeHtml(t("ledger.loginDesc"))}</p>
      <button class="generate-btn" type="button" data-login-ledger>${escapeHtml(t("history.login"))}</button>
    </div>
  `;
}

function ledgerParams(kind, page = 1, exportCsv = false) {
  const params = new URLSearchParams({
    page: String(page),
    limit: String(kind === "topups" ? state.topupRecords.limit : state.spendingRecords.limit),
  });
  const controls = kind === "topups"
    ? {
        q: els.topupSearch?.value,
        status: els.topupStatus?.value,
        from: els.topupFrom?.value,
        to: els.topupTo?.value,
      }
    : {
        q: els.spendingSearch?.value,
        type: els.spendingType?.value,
        from: els.spendingFrom?.value,
        to: els.spendingTo?.value,
      };
  Object.entries(controls).forEach(([key, value]) => {
    const text = String(value || "").trim();
    if (text) params.set(key, text);
  });
  if (exportCsv) params.set("export", "csv");
  return params;
}

function renderLedgerPager(kind) {
  const data = kind === "topups" ? state.topupRecords : state.spendingRecords;
  const holder = kind === "topups" ? els.topupPager : els.spendingPager;
  if (!holder) return;
  holder.innerHTML = `
    <button class="ghost-button" type="button" data-page="prev" ${data.page <= 1 ? "disabled" : ""}>${escapeHtml(t("ledger.prev"))}</button>
    <span>${escapeHtml(t("ledger.page", { page: data.page, totalPages: data.totalPages, total: data.total }))}</span>
    <button class="ghost-button" type="button" data-page="next" ${data.page >= data.totalPages ? "disabled" : ""}>${escapeHtml(t("ledger.next"))}</button>
  `;
  holder.querySelector('[data-page="prev"]')?.addEventListener("click", () => {
    if (data.page > 1) (kind === "topups" ? loadTopupRecords : loadSpendingRecords)(data.page - 1);
  });
  holder.querySelector('[data-page="next"]')?.addEventListener("click", () => {
    if (data.page < data.totalPages) (kind === "topups" ? loadTopupRecords : loadSpendingRecords)(data.page + 1);
  });
}

function renderTopupRecords() {
  if (!els.topupTable) return;
  if (!state.user) {
    els.topupTable.innerHTML = ledgerLoginCard();
    els.topupPager.innerHTML = "";
    els.topupTable.querySelector("[data-login-ledger]")?.addEventListener("click", openLogin);
    refreshIcons();
    return;
  }
  const records = state.topupRecords.records || [];
  if (!records.length) {
    els.topupTable.innerHTML = `<div class="history-empty-card"><strong>${escapeHtml(t("ledger.empty"))}</strong></div>`;
    renderLedgerPager("topups");
    return;
  }
  els.topupTable.innerHTML = `
    <table class="ledger-table">
      <thead>
        <tr>
          <th>${escapeHtml(t("ledger.orderId"))}</th>
          <th>${escapeHtml(t("ledger.status"))}</th>
          <th>${escapeHtml(t("ledger.amount"))}</th>
          <th>${escapeHtml(t("ledger.payable"))}</th>
          <th>${escapeHtml(t("ledger.credits"))}</th>
          <th>${escapeHtml(t("ledger.createdAt"))}</th>
        </tr>
      </thead>
      <tbody>
        ${records.map((order) => `
          <tr>
            <td data-label="${escapeHtml(t("ledger.orderId"))}"><code>${escapeHtml(order.id)}</code></td>
            <td data-label="${escapeHtml(t("ledger.status"))}"><span class="ledger-badge">${escapeHtml(order.status || "")}</span></td>
            <td data-label="${escapeHtml(t("ledger.amount"))}">${escapeHtml(formatCredits(order.amount))} ${escapeHtml(order.asset || "USDT")}</td>
            <td data-label="${escapeHtml(t("ledger.payable"))}"><strong>${escapeHtml(order.payableAmountText || order.payableAmount || "")}</strong><small>${escapeHtml([order.network, order.paymentProvider === "paypal" ? order.paypalOrderId : ""].filter(Boolean).join(" · "))}</small></td>
            <td data-label="${escapeHtml(t("ledger.credits"))}">${escapeHtml(formatCredits(order.creditAmount))}</td>
            <td data-label="${escapeHtml(t("ledger.createdAt"))}">${escapeHtml(formatDateTime(order.createdAt))}</td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;
  renderLedgerPager("topups");
}

function renderReferral() {
  const referral = state.referral || null;
  const loggedIn = Boolean(state.user);
  const invitedCount = Number(referral?.invitedCount || 0);
  const paidInviteCount = Math.max(0, Number(referral?.paidInviteCount || 0));
  const rewardCount = Math.max(0, Number(referral?.rewardCount || 0));
  const membershipTarget = Math.max(1, Number(referral?.membershipTarget || 100));
  const registrationProgress = Math.max(0, Math.min(100, (invitedCount / membershipTarget) * 100));
  const member = creatorMembershipActive();
  if (els.referralLink) els.referralLink.textContent = loggedIn ? (referral?.inviteUrl || "") : t("referral.login");
  if (els.referralProgressFill) els.referralProgressFill.style.width = `${paidInviteCount ? Math.min(100, (rewardCount / paidInviteCount) * 100) : 0}%`;
  if (els.referralInvitedCount) els.referralInvitedCount.textContent = t("referral.invitedCount", { count: invitedCount });
  if (els.referralRewardStatus) {
    els.referralRewardStatus.textContent = member
      ? t("membership.rewardStatusActive", { rewardCount, paidCount: paidInviteCount })
      : t("membership.rewardStatusInactive");
  }
  if (els.referralMembershipProgressText) els.referralMembershipProgressText.textContent = member
    ? t("membership.activeProgress")
    : t("membership.progressCount", { count: invitedCount, target: membershipTarget });
  if (els.referralMembershipProgressFill) els.referralMembershipProgressFill.style.width = `${member ? 100 : registrationProgress}%`;
  if (els.referralNote) els.referralNote.textContent = loggedIn
    ? member
      ? t("membership.rewardNote")
      : t("membership.unlockNote", { target: membershipTarget })
    : t("referral.login");
  if (els.copyReferralBtn) els.copyReferralBtn.disabled = !loggedIn || !referral?.inviteUrl;
  renderMembershipCard();
  refreshIcons();
}

function renderMembershipCard() {
  if (!els.membershipCard) return;
  els.membershipCard.hidden = !membershipProgramEnabled();
  if (els.topupMembershipLink) els.topupMembershipLink.hidden = !membershipProgramEnabled() || creatorMembershipActive();
  if (!membershipProgramEnabled()) return;
  const active = creatorMembershipActive();
  if (els.membershipState) {
    els.membershipState.textContent = t(active ? "membership.active" : "membership.notActive");
    els.membershipState.classList.toggle("is-active", active);
  }
  if (els.buyMembershipBtn) {
    els.buyMembershipBtn.hidden = active;
    els.buyMembershipBtn.disabled = !state.user;
  }
  if (els.membershipCodeForm) els.membershipCodeForm.hidden = active;
  if (els.membershipNote && active) els.membershipNote.textContent = t("membership.activeNote");
}

async function startEntitlementCheckout(body = {}, statusElement = null) {
  if (!state.user) return openLogin();
  if (statusElement) statusElement.textContent = "Creating secure checkout...";
  const returnUrl = `${window.location.origin}${window.location.pathname}#${state.tab || "referral"}`;
  try {
    const payload = await requestJson("/api/pay/stripe/checkout-sessions", {
      method: "POST",
      body: { ...body, returnUrl, cancelUrl: returnUrl },
    });
    const checkoutUrl = String(payload.checkoutUrl || payload.session?.checkoutUrl || "").trim();
    if (!checkoutUrl) throw new Error("Stripe checkout page was not created.");
    window.location.href = checkoutUrl;
  } catch (error) {
    if (statusElement) statusElement.textContent = error.message || String(error);
  }
}

function openBillingPaymentChoice({ billingPlanId = "", productId = "", statusElement = null } = {}) {
  if (!state.user) return openLogin();
  const plan = billingPlanId
    ? (typeof billingPlans === "function" ? billingPlans() : []).find((item) => item.id === billingPlanId)
    : null;
  const product = productId
    ? (state.billing?.products || []).find((item) => item.id === productId)
    : null;
  if (!plan && !product) {
    if (statusElement) statusElement.textContent = "This product is not available.";
    return;
  }
  if (product?.owned) {
    if (statusElement) statusElement.textContent = "API documentation access is already active.";
    return;
  }
  if (statusElement) statusElement.textContent = "";
  state.selectedBillingPlanId = plan?.id || "";
  if (product) state.selectedProductId = product.id;
  else state.selectedProductId = "";
  state.selectedTopupPackageId = "";
  prepareModalOpen();
  setTopupMethod("stripe", { skipSummary: true });
  setTopupStep("payment");
  renderTopupSummary();
  if (!els.topupDialog?.open) els.topupDialog?.showModal();
  if (stripeCheckoutVisible()) renderStripeCheckout();
  syncTopupAutoRefresh();
  refreshIcons();
}

function openEntitlementPaymentChoice(productId = "", statusElement = null) {
  return openBillingPaymentChoice({ productId, statusElement });
}

async function redeemMembershipCode(event) {
  event?.preventDefault?.();
  if (!state.user) return openLogin();
  const code = String(els.membershipCodeInput?.value || "").trim();
  if (!code) {
    if (els.membershipNote) els.membershipNote.textContent = t("membership.enterCode");
    return;
  }
  if (els.redeemMembershipCodeBtn) els.redeemMembershipCodeBtn.disabled = true;
  if (els.membershipNote) els.membershipNote.textContent = t("membership.redeeming");
  try {
    const payload = await requestJson("/api/membership/redeem", { method: "POST", body: { code } });
    if (payload.user) setUser(payload.user, { skipReferralRefresh: true });
    if (state.billing) state.billing = { ...state.billing, membership: payload.membership || state.billing.membership };
    if (els.membershipCodeInput) els.membershipCodeInput.value = "";
    if (els.membershipNote) els.membershipNote.textContent = t("membership.activated");
    await loadReferralSummary({ force: true });
    await refreshExploreMembershipAccess();
    await loadBillingSummary();
    renderMembershipCard();
  } catch (error) {
    if (els.membershipNote) els.membershipNote.textContent = error.message || String(error);
  } finally {
    if (els.redeemMembershipCodeBtn) els.redeemMembershipCodeBtn.disabled = false;
  }
}

async function loadReferralSummary({ force = false } = {}) {
  if (!state.user) {
    state.referral = null;
    state.referralLoadedUserId = "";
    state.referralLoadedAt = 0;
    renderReferral();
    return;
  }
  const userId = state.user.id || state.user.username || "";
  if (state.referralLoading) return;
  if (!force && state.referralLoadedUserId === userId && Number(state.referralLoadedAt || 0) > 0) {
    renderReferral();
    return;
  }
  state.referralLoading = true;
  try {
    const payload = await requestJson("/api/referral");
    state.referral = payload.referral || null;
    state.referralLoadedUserId = userId;
    state.referralLoadedAt = Date.now();
    if (payload.user) setUser(payload.user, { skipReferralRefresh: true });
  } catch (error) {
    if (els.referralNote) els.referralNote.textContent = error.message || String(error);
  } finally {
    state.referralLoading = false;
  }
  renderReferral();
}

function renderSpendingTypeOptions(types = []) {
  if (!els.spendingType) return;
  const current = els.spendingType.value;
  els.spendingType.innerHTML = `<option value="">${escapeHtml(t("ledger.allTypes"))}</option>${types.map((type) => `<option value="${escapeHtml(type)}">${escapeHtml(type)}</option>`).join("")}`;
  if (types.includes(current)) els.spendingType.value = current;
}

function renderSpendingRecords() {
  if (!els.spendingTable) return;
  if (!state.user) {
    els.spendingTable.innerHTML = ledgerLoginCard();
    els.spendingPager.innerHTML = "";
    els.spendingTable.querySelector("[data-login-ledger]")?.addEventListener("click", openLogin);
    refreshIcons();
    return;
  }
  const records = state.spendingRecords.records || [];
  renderSpendingTypeOptions(state.spendingRecords.types || []);
  if (!records.length) {
    els.spendingTable.innerHTML = `<div class="history-empty-card"><strong>${escapeHtml(t("ledger.empty"))}</strong></div>`;
    renderLedgerPager("spending");
    return;
  }
  els.spendingTable.innerHTML = `
    <table class="ledger-table">
      <thead>
        <tr>
          <th>${escapeHtml(t("ledger.createdAt"))}</th>
          <th>${escapeHtml(t("ledger.type"))}</th>
          <th>${escapeHtml(t("ledger.title"))}</th>
          <th>${escapeHtml(t("ledger.credits"))}</th>
          <th>${escapeHtml(t("ledger.balanceAfter"))}</th>
          <th>${escapeHtml(t("ledger.taskId"))}</th>
        </tr>
      </thead>
      <tbody>
        ${records.map((entry) => `
          <tr>
            <td data-label="${escapeHtml(t("ledger.createdAt"))}">${escapeHtml(formatDateTime(entry.createdAt))}</td>
            <td data-label="${escapeHtml(t("ledger.type"))}"><span class="ledger-badge">${escapeHtml(entry.type || "")}</span></td>
            <td data-label="${escapeHtml(t("ledger.title"))}"><strong>${escapeHtml(entry.title || entry.type || "")}</strong><small>${[entry.resolution, entry.duration ? `${entry.duration}s` : ""].filter(Boolean).join(" / ")}</small></td>
            <td data-label="${escapeHtml(t("ledger.credits"))}" class="ledger-negative">-${escapeHtml(formatCredits(entry.amount))}</td>
            <td data-label="${escapeHtml(t("ledger.balanceAfter"))}">${escapeHtml(formatCredits(entry.balanceAfter))}</td>
            <td data-label="${escapeHtml(t("ledger.taskId"))}"><code>${escapeHtml(entry.taskId || entry.id || "")}</code></td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;
  renderLedgerPager("spending");
}

async function loadTopupRecords(page = state.topupRecords.page || 1) {
  if (!els.topupTable) return;
  if (!state.user) {
    renderTopupRecords();
    return;
  }
  els.topupTable.innerHTML = `<div class="job-note">${escapeHtml(t("ledger.loading"))}</div>`;
  try {
    const payload = await requestJson(`/api/billing/topups?${ledgerParams("topups", page).toString()}`);
    if (payload.user) setUser(payload.user);
    state.topupRecords = {
      ...state.topupRecords,
      records: payload.records || [],
      page: payload.page || page,
      limit: payload.limit || state.topupRecords.limit,
      total: payload.total || 0,
      totalPages: payload.totalPages || 1,
    };
    renderTopupRecords();
  } catch (error) {
    els.topupTable.innerHTML = `<div class="job-note">${escapeHtml(t("ledger.loadFailed", { message: error.message || String(error) }))}</div>`;
  }
  refreshIcons();
}

function shouldAutoRefreshTopups() {
  return Boolean(
    state.user &&
    !document.hidden &&
    (state.tab === "topups" || els.topupQrDialog?.open)
  );
}

async function refreshTopupsQuietly() {
  if (!shouldAutoRefreshTopups() || state.topupRefreshInFlight) return;
  state.topupRefreshInFlight = true;
  try {
    const page = state.tab === "topups" ? (state.topupRecords.page || 1) : 1;
    const payload = await requestJson(`/api/billing/topups?${ledgerParams("topups", page).toString()}`);
    if (payload.user) setUser(payload.user);
    state.topupRecords = {
      ...state.topupRecords,
      records: payload.records || [],
      page: payload.page || page,
      limit: payload.limit || state.topupRecords.limit,
      total: payload.total || 0,
      totalPages: payload.totalPages || 1,
    };
    if (state.tab === "topups") renderTopupRecords();
    if (tenantFeature("subscriptions", false) && state.activeTopupOrder?.orderKind === "subscription") {
      await loadBillingSummary();
    }
    refreshIcons();
  } catch {
    // Keep the current table visible; the next interval can recover.
  } finally {
    state.topupRefreshInFlight = false;
  }
}

function syncTopupAutoRefresh() {
  const active = shouldAutoRefreshTopups();
  if (active && !state.topupRefreshTimer) {
    state.topupRefreshTimer = window.setInterval(refreshTopupsQuietly, TOPUP_RECORDS_AUTO_REFRESH_MS);
  } else if (!active && state.topupRefreshTimer) {
    window.clearInterval(state.topupRefreshTimer);
    state.topupRefreshTimer = 0;
  }
}

async function loadSpendingRecords(page = state.spendingRecords.page || 1) {
  if (!els.spendingTable) return;
  if (!state.user) {
    renderSpendingRecords();
    return;
  }
  els.spendingTable.innerHTML = `<div class="job-note">${escapeHtml(t("ledger.loading"))}</div>`;
  try {
    const payload = await requestJson(`/api/billing/spending?${ledgerParams("spending", page).toString()}`);
    if (payload.user) setUser(payload.user);
    state.spendingRecords = {
      ...state.spendingRecords,
      records: payload.records || [],
      types: payload.types || state.spendingRecords.types || [],
      page: payload.page || page,
      limit: payload.limit || state.spendingRecords.limit,
      total: payload.total || 0,
      totalPages: payload.totalPages || 1,
    };
    renderSpendingRecords();
  } catch (error) {
    els.spendingTable.innerHTML = `<div class="job-note">${escapeHtml(t("ledger.loadFailed", { message: error.message || String(error) }))}</div>`;
  }
  refreshIcons();
}

async function exportLedger(kind) {
  if (!state.user) return openLogin();
  const endpoint = kind === "topups" ? "/api/billing/topups" : "/api/billing/spending";
  const params = ledgerParams(kind, 1, true);
  const button = kind === "topups" ? els.exportTopupsBtn : els.exportSpendingBtn;
  const table = kind === "topups" ? els.topupTable : els.spendingTable;
  const filename = kind === "topups" ? "topup-records.csv" : "spending-records.csv";
  if (button) button.disabled = true;
  try {
    const response = await fetch(`${endpoint}?${params.toString()}`, {
      headers: state.token ? { authorization: `Bearer ${state.token}` } : {},
    });
    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      throw new Error(payload.message || `Export failed: ${response.status}`);
    }
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  } catch (error) {
    if (table) {
      table.insertAdjacentHTML("afterbegin", `<div class="job-note">${escapeHtml(error.message || String(error))}</div>`);
    }
  } finally {
    if (button) button.disabled = false;
  }
}

function openLogin() {
  if (state.user) return openAccount();
  prepareModalOpen();
  renderLoginForm();
  els.loginDialog.showModal();
  window.requestAnimationFrame(() => els.loginUsername?.focus());
}

function openAccount() {
  prepareModalOpen();
  renderTokenDisplays();
  if (els.accountEmail) els.accountEmail.value = state.user?.email || "";
  if (els.accountSecurityMessage) els.accountSecurityMessage.textContent = "";
  const securityBox = els.accountEmail?.closest(".account-security-box");
  if (securityBox) securityBox.hidden = !Boolean(state.config?.auth?.email?.enabled);
  els.accountDialog?.showModal();
  refreshIcons();
}

function logout() {
  closeMobileDrawer();
  state.token = "";
  state.user = null;
  state.showAccessToken = false;
  state.showAccountToken = false;
  state.apiSubtokens = [];
  state.apiSubtokensLoaded = false;
  state.apiSubtokenMessage = "";
  state.createdApiSubtoken = null;
  localStorage.removeItem(TOKEN_KEY);
  els.accountDialog?.close();
  closeAccountMenu();
  setUser(null);
  if (state.tab === "history") renderHistory([]);
  if (state.tab === "topups") renderTopupRecords();
  if (state.tab === "spending") renderSpendingRecords();
  if (state.tab === "assets") renderAssets([]);
  if (state.tab === "access") renderApiSubtokens();
  if (state.tab === "referral") renderReferral();
  syncTopupAutoRefresh();
}

function renderLoginForm() {
  const label = t("nav.login");
  if (els.loginTitle) els.loginTitle.textContent = label;
  if (els.loginSubmit) els.loginSubmit.textContent = label;
  if (els.loginSubmit) els.loginSubmit.disabled = false;
  if (els.telegramLoginBtn) els.telegramLoginBtn.disabled = false;
  if (els.telegramLoginStatus) els.telegramLoginStatus.textContent = "";
  if (els.googleLoginBtn) els.googleLoginBtn.disabled = false;
  if (els.googleLoginStatus) {
    els.googleLoginStatus.textContent = "";
    els.googleLoginStatus.hidden = true;
  }
  if (els.loginMessage) els.loginMessage.textContent = "";
  const emailEnabled = Boolean(state.config?.auth?.email?.enabled);
  if (els.loginEmail) els.loginEmail.closest(".auth-email-row")?.toggleAttribute("hidden", !emailEnabled);
  if (els.loginEmailCode) els.loginEmailCode.closest(".auth-email-row")?.toggleAttribute("hidden", !emailEnabled);
  if (els.forgotPasswordBtn) els.forgotPasswordBtn.hidden = !emailEnabled;
}

async function refreshAfterLogin() {
  if (state.tab === "access") renderAccessGuides();
  const refreshes = [];
  if (state.tab === "access") refreshes.push(loadApiSubtokens({ force: true }));
  if (state.tab === "history") refreshes.push(loadHistory());
  if (state.tab === "topups") refreshes.push(loadTopupRecords(1));
  if (state.tab === "spending") refreshes.push(loadSpendingRecords(1));
  if (state.tab === "assets") refreshes.push(loadUserAssets());
  if (state.tab === "referral") refreshes.push(loadReferralSummary());
  if (tenantFeature("subscriptions", false) || membershipProgramEnabled()) refreshes.push(loadBillingSummary());
  await Promise.allSettled(refreshes);
}

async function completeLogin(payload = {}) {
  const token = String(payload.token || "").trim();
  if (!token || !payload.user) throw new Error("Login response is invalid.");
  state.token = token;
  localStorage.setItem(TOKEN_KEY, token);
  setUser(payload.user);
  els.loginDialog?.close();
  await refreshAfterLogin();
}

async function submitLogin() {
  const username = els.loginUsername.value.trim();
  const password = els.loginPassword.value;
  if (!username || password.length < 6) {
    els.loginMessage.textContent = t("auth.invalid");
    return;
  }
  const referralCode = localStorage.getItem(REFERRAL_CODE_KEY) || "";
  let registrationAttribution = {};
  try {
    registrationAttribution = JSON.parse(localStorage.getItem(REGISTRATION_ATTRIBUTION_KEY) || "{}") || {};
  } catch {
    registrationAttribution = {};
  }
  if (els.loginSubmit) els.loginSubmit.disabled = true;
  try {
    const payload = await requestJson("/api/auth/login-or-register", {
      method: "POST",
      body: {
        username,
        password,
        referralCode,
        channel: registrationAttribution.channel || "direct",
        attribution: registrationAttribution,
      },
    });
    await completeLogin(payload);
  } catch (error) {
    els.loginMessage.textContent = error.message;
  } finally {
    if (els.loginSubmit) els.loginSubmit.disabled = false;
  }
}

async function requestEmailLoginCode() {
  const email = els.loginEmail?.value.trim() || "";
  try { await requestJson("/api/auth/email/request", { method: "POST", body: { email } }); if (els.loginMessage) els.loginMessage.textContent = "Verification code sent."; }
  catch (error) { if (els.loginMessage) els.loginMessage.textContent = error.message; }
}

async function verifyEmailLogin() {
  const email = els.loginEmail?.value.trim() || ""; const code = els.loginEmailCode?.value.trim() || "";
  try { await completeLogin(await requestJson("/api/auth/email/verify", { method: "POST", body: { email, code } })); }
  catch (error) { if (els.loginMessage) els.loginMessage.textContent = error.message; }
}

async function forgotPassword() {
  const email = window.prompt("Enter your bound login email"); if (!email) return;
  try { await requestJson("/api/auth/password/reset/request", { method: "POST", body: { email } }); const code = window.prompt("Enter the verification code"); const password = window.prompt("Enter a new password (at least 6 characters)"); if (code && password) { await requestJson("/api/auth/password/reset", { method: "POST", body: { email, code, password } }); if (els.loginMessage) els.loginMessage.textContent = "Password updated. Please sign in."; } }
  catch (error) { if (els.loginMessage) els.loginMessage.textContent = error.message; }
}

async function requestAccountEmailCode() {
  try { await requestJson("/api/account/email/request", { method: "POST", body: { email: els.accountEmail?.value.trim() || "", password: els.accountCurrentPassword?.value || "" } }); if (els.accountSecurityMessage) els.accountSecurityMessage.textContent = "Verification code sent."; }
  catch (error) { if (els.accountSecurityMessage) els.accountSecurityMessage.textContent = error.message; }
}

async function verifyAccountEmail() {
  try { const payload = await requestJson("/api/account/email/verify", { method: "POST", body: { email: els.accountEmail?.value.trim() || "", code: els.accountEmailCode?.value.trim() || "" } }); if (payload.user) setUser(payload.user); if (els.accountSecurityMessage) els.accountSecurityMessage.textContent = "Email bound successfully."; }
  catch (error) { if (els.accountSecurityMessage) els.accountSecurityMessage.textContent = error.message; }
}

async function loadMe() {
  if (!state.token) return;
  try {
    const payload = await requestJson("/api/auth/me");
    setUser(payload.user);
  } catch {
    state.token = "";
    localStorage.removeItem(TOKEN_KEY);
    setUser(null);
  }
}

async function loadBillingSummary() {
  if (!state.user || (!tenantFeature("subscriptions", false) && !membershipProgramEnabled())) return;
  try {
    const payload = await requestJson("/api/billing/summary");
    state.billing = payload.billing || state.billing;
    if (payload.user) setUser(payload.user);
    renderTopupSummary();
    renderMembershipCard();
    renderAccessGuides();
  } catch (error) {
    console.warn("billing summary failed", error.message || error);
  }
}

async function refreshExploreMembershipAccess() {
  if (!state.user || !creatorMembershipActive()) return;
  const limit = Math.max(20, Math.min(100, Number(state.homeCharacters?.length || CHARACTER_PAGE_SIZE) || CHARACTER_PAGE_SIZE));
  try {
    const payload = await requestJson(`/api/public/characters?page=1&limit=${encodeURIComponent(String(limit))}`);
    state.homeCharacters = Array.isArray(payload.items) ? payload.items : state.homeCharacters;
    state.homeCharactersPage = Number(payload.page || 1) || 1;
    state.homeCharactersLimit = Number(payload.limit || limit) || limit;
    state.homeCharactersTotal = Number(payload.total || state.homeCharacters.length) || state.homeCharacters.length;
    state.homeCharactersTotalPages = Number(payload.totalPages || 1) || 1;
    if (state.tab === "gallery") renderTemplates();
    if (state.tab === "characters") renderCharactersPanel();
  } catch (error) {
    console.warn("membership Explore refresh failed", error.message || error);
  }
}

async function loadPlatformEstimates() {
  if (!state.templates.length) return;
  try {
    const payload = await requestJson("/api/platform/estimates");
    state.estimates = {};
    (payload.estimates || []).forEach((estimate) => {
      if (estimate?.templateId) state.estimates[estimate.templateId] = estimate;
    });
  } catch (error) {
    state.estimates = Object.fromEntries(state.templates.map((template) => [
      template.id,
      { templateId: template.id, available: false, credits: null, message: error.message },
    ]));
  }
  renderTemplates();
  updateSubmitButtonCost();
}

function captureReferralCodeFromUrl() {
  const params = new URLSearchParams(window.location.search || "");
  const ref = String(params.get("ref") || params.get("referral") || "").trim();
  if (ref) localStorage.setItem(REFERRAL_CODE_KEY, ref);
}

function captureRegistrationAttributionFromUrl() {
  const params = new URLSearchParams(window.location.search || "");
  const clean = (value, maxLength = 120) => String(value || "")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
  const explicitChannel = clean(params.get("channel") || params.get("utm_source") || "", 80);
  let previous = {};
  try {
    previous = JSON.parse(localStorage.getItem(REGISTRATION_ATTRIBUTION_KEY) || "{}") || {};
  } catch {
    previous = {};
  }
  if (!explicitChannel && previous.channel) return;
  const attribution = {
    channel: explicitChannel || "direct",
    medium: clean(params.get("utm_medium"), 80),
    campaign: clean(params.get("utm_campaign"), 120),
    content: clean(params.get("utm_content"), 120),
    landingPath: clean(window.location.pathname, 500),
    capturedAt: new Date().toISOString(),
  };
  try {
    localStorage.setItem(REGISTRATION_ATTRIBUTION_KEY, JSON.stringify(attribution));
  } catch {}
}

async function bootstrap() {
  captureReferralCodeFromUrl();
  captureRegistrationAttributionFromUrl();
  await loadTelegramMiniAppAuth().catch((error) => {
    console.warn("Telegram Mini App authentication failed", error.message || error);
  });
  await loadMe();
  const payload = await requestJson("/api/config/public");
  const platform = payload.config?.platform || {};
  initGoogleAnalytics(platform.analytics?.googleMeasurementId || platform.googleMeasurementId || "");
  state.config = payload.config;
  configureGoogleLogin();
  state.wallet = payload.config?.wallet || null;
  state.billing = payload.config?.billing || null;
  ensureSelectedWalletOption();
  state.templates = platform.templates || [];
  state.playfluxTemplates = Array.isArray(payload.config?.playfluxTemplates) ? payload.config.playfluxTemplates : [];
  state.categories = platform.categories || [];
  state.advancedCases = platform.advanced?.cases || [];
  const homeVideo = payload.config?.homeVideo || {};
  state.homeCharacters = homeVideo.items || [];
  state.homeCharactersPage = Number(homeVideo.page || 1) || 1;
  state.homeCharactersLimit = Number(homeVideo.limit || CHARACTER_PAGE_SIZE) || CHARACTER_PAGE_SIZE;
  state.homeCharactersTotal = Number(homeVideo.total || state.homeCharacters.length) || state.homeCharacters.length;
  state.homeCharactersTotalPages = Number(homeVideo.totalPages || 1) || 1;
  await ensureRouteHomeCharacterLoaded().catch((error) => console.warn("route character preload failed", error.message || error));
  applyRouteCharacterDetail({ allowTabSwitch: true });
  els.brandName.textContent = platform.brand || "Vipeak AI";
  if (isTabAllowed("advanced")) await loadAdvancedPresets();
  applyTenantFeatures();
  normalizeTenantRouteAfterConfig();
  applyTelegramMiniAppRoute();
  renderCategories();
  renderTemplates();
  renderAccessGuides();
  renderAdvanced();
  renderAssets();
  renderAccountMenu();
  renderTopupSummary();
  renderPricing();
  renderTokenDisplays();
  setTab(window.location.hash || state.tab);
  refreshIcons();
  if (!isTenantTool("undress")) loadPlatformEstimates();
}
