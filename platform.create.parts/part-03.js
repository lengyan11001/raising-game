const advancedPromptPasteEvents = new WeakSet();

async function submitAdvancedGenerate() {
  if (!state.user) return openLogin();
  if (els.advancedSubmitBtn?.getAttribute("aria-busy") === "true") return;
  setAdvancedSubmitButtonBusy(true);
  try {
    await submitAdvancedGenerateInternal();
  } finally {
    setAdvancedSubmitButtonBusy(false);
  }
}

function setAdvancedSubmitButtonBusy(busy) {
  const button = els.advancedSubmitBtn;
  if (!button) return;
  if (busy) {
    button.classList.add("is-busy");
    button.disabled = true;
    button.setAttribute("aria-busy", "true");
    button.innerHTML = `<i data-lucide="loader-circle"></i><span>${escapeHtml(state.lang === "zh" ? "正在创建..." : "Creating...")}</span>`;
    if (els.advancedNote) {
      els.advancedNote.textContent = "";
      els.advancedNote.classList.add("is-error");
    }
    refreshIcons();
    return;
  }
  button.classList.remove("is-busy");
  button.removeAttribute("aria-busy");
  button.disabled = false;
  if (!button.classList.contains("is-busy")) updateAdvancedButtonCost();
}

function showAdvancedSubmissionNotice(title, detail = "", failed = false) {
  const root = els.generationCompletionNotices;
  if (!root) return;
  const item = document.createElement("div");
  item.className = `generation-completion-notice is-submission${failed ? " is-failed" : ""}`;
  item.setAttribute("role", failed ? "alert" : "status");
  item.innerHTML = `
    <span class="generation-completion-notice-icon"><i data-lucide="${failed ? "alert-circle" : "check"}"></i></span>
    <div class="generation-completion-notice-copy">
      <strong>${escapeHtml(title)}</strong>
      <span>${escapeHtml(detail)}</span>
    </div>
    <button class="generation-completion-notice-close" type="button" aria-label="${escapeHtml(state.lang === "zh" ? "关闭通知" : "Close notification")}"><i data-lucide="x"></i></button>
  `;
  item.querySelector(".generation-completion-notice-close")?.addEventListener("click", () => item.remove());
  root.prepend(item);
  refreshIcons();
  window.setTimeout(() => item.remove(), 5200);
}

function showAdvancedSubmittedNotice() {
  if (els.advancedNote) {
    els.advancedNote.textContent = "";
    els.advancedNote.classList.remove("is-error");
  }
  showAdvancedSubmissionNotice(
    state.lang === "zh" ? "任务已提交" : "Generation submitted",
    state.lang === "zh" ? "正在生成，可在 Result 查看进度。" : "Generation started. Track progress in Result.",
  );
}

function showAdvancedSubmitFailure(error) {
  const detail = String(error?.message || error || "").trim();
  if (!detail) return;
  if (els.advancedNote) {
    els.advancedNote.textContent = detail;
    els.advancedNote.classList.add("is-error");
  }
  showAdvancedSubmissionNotice(
    state.lang === "zh" ? "提交失败" : "Submission failed",
    detail,
    true,
  );
}

async function submitAdvancedGenerateInternal() {
  if (!state.user) return openLogin();
  const promptInput = String(window.getAdvancedPromptValue?.() ?? els.advancedPrompt?.value ?? "").trim();
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
  let prompt = advancedEffectivePrompt(basePrompt);
  if (!prompt && currentAdvancedProvider() !== "wan30") {
    if (els.advancedNote) els.advancedNote.textContent = t("advanced.promptRequired");
    return;
  }
  if (advancedCreateModeIsSimpleEdit()) {
    if (state.advancedCreateMode === "image-edit" && !selectedAdvancedReferenceImages(isAdvancedImageProvider() ? currentAdvancedProvider() : "wan27-image-edit").length) {
      if (els.advancedNote) els.advancedNote.textContent = t("advanced.editImageRequired", {}, "Upload one image first.");
      return;
    }
    if (state.advancedCreateMode === "video-edit" && !state.advancedSeedanceVideoAssetId) {
      if (els.advancedNote) els.advancedNote.textContent = t("advanced.editVideoRequired", {}, "Upload one video first.");
      return;
    }
  }
  const provider = currentAdvancedProvider();
  const wanPromptOptimize = provider === "wan30" && Boolean(els.advancedWanPromptOptimize?.checked);
  if (wanPromptOptimize) prompt = optimizeWan30Prompt(prompt);
  const currentCase = state.advancedCases.find((item) => item.id === state.activeAdvancedCaseId);
  if (currentCase?.prompt && currentCase.prompt !== prompt) state.activeAdvancedCaseId = "";
  els.advancedSubmitBtn.disabled = true;
  const seedanceTier = currentSeedanceTier();
  const seedreamTier = currentSeedreamTier();
  const advancedPresetSelection = usingPresetFlow ? advancedPresetSelectionPayload() : undefined;
  const presetReferenceImages = usingPresetFlow ? advancedPresetReferenceImages() : [];
  const presetVideoReferences = usingPresetFlow ? advancedPresetVideoReferences() : [];
  if (["qwen37-flash", "byteplus-language", "papaya"].includes(provider)) {
    const enableThinking = els.advancedQwen37Thinking?.value === "true";
    const maxTokens = Math.max(1, Math.min(8192, Number(els.advancedQwen37MaxTokens?.value || 8192) || 8192));
    const temperature = Math.max(0, Math.min(2, Number(els.advancedQwen37Temperature?.value || 0.7)));
    const pendingTaskId = `pending-text-${Date.now().toString(36)}`;
    setAdvancedResultMediaKind("conversation");
    mergeAdvancedResultRecord({
      taskId: pendingTaskId,
      status: "submitting",
      model: provider === "papaya" ? "carrothub-papaya-1.0" : provider === "byteplus-language" ? "ep-20260827122554-8fsgw" : "qwen3.7-flash",
      provider,
      source: provider === "papaya" ? "advanced-papaya" : provider === "byteplus-language" ? "advanced-byteplus-language" : "advanced-qwen37-flash",
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
          model: provider === "papaya" ? "carrothub-papaya-1.0" : provider === "byteplus-language" ? "ep-20260827122554-8fsgw" : "qwen3.7-flash",
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
    setAdvancedResultMediaKind("image");
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
                seed: normalizeAdvancedSeed(els.advancedWanSeed?.value, { min: 0 }),
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
      showAdvancedSubmittedNotice();
      setAdvancedSideTab("result", { syncMobile: true });
      renderAdvancedResultPanel();
      await loadHistory({ silent: true, refresh: true, page: 1 }).catch(() => {});
    } catch (error) {
      if (handleAdvancedReferenceMissingError(error, pendingTaskId)) return;
      showAdvancedSubmitFailure(error);
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
  if (isAdvancedImageProvider(provider)) {
    const imageReferences = dedupeAdvancedReferenceImages([
      ...presetReferenceImages,
      ...selectedAdvancedReferenceImages(provider),
    ]).slice(0, ADVANCED_SEEDANCE_REFERENCE_LIMIT);
    const referencesReady = await guardAdvancedSubmitAssets(imageReferences.map((item) => item.assetId));
    if (!referencesReady) {
      els.advancedSubmitBtn.disabled = false;
      return;
    }
    setAdvancedResultMediaKind("image");
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
        advancedProviderId: provider,
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
            advancedProviderId: provider,
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
      showAdvancedSubmittedNotice();
      setAdvancedSideTab("result", { syncMobile: true });
      renderAdvancedResultPanel();
      await loadHistory({ silent: true }).catch(() => {});
    } catch (error) {
      if (handleAdvancedReferenceMissingError(error, pendingTaskId)) return;
      showAdvancedSubmitFailure(error);
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
  if (isVegaAdvancedProvider(provider)) {
    const vegaBounds = advancedDurationBounds(provider);
    const rawVegaDuration = Number(els.advancedDuration?.value || vegaBounds.fallback);
    const vegaDuration = vegaBounds.smart && rawVegaDuration === -1
      ? -1
      : Math.min(vegaBounds.max, Math.max(vegaBounds.min, Number.isFinite(rawVegaDuration) ? rawVegaDuration : vegaBounds.fallback));
    const vegaOptions = advancedVegaGenerationOptions(provider);
    const vegaTaskType = String(vegaOptions.taskType || "auto").trim().toLowerCase();
    const vegaSourceMediaMode = advancedVegaMediaMode();
    const vegaDraftFollowup = advancedVegaDraftFollowup();
    const vegaMediaMode = ["edit", "extend"].includes(vegaTaskType) ? "reference_video" : vegaSourceMediaMode;
    const vegaUsesFirstFrame = vegaModeNeedsFirstFrame(vegaMediaMode);
    const vegaUsesLastFrame = vegaModeNeedsLastFrame(vegaMediaMode);
    const vegaUsesReferences = vegaModeUsesReferences(vegaMediaMode);
    const vegaDraftTaskId = vegaDraftFollowup ? normalizeAdvancedVegaDraftTaskId(vegaOptions.draftTaskId || "") : "";
    if (vegaDraftFollowup && !vegaDraftTaskId) {
      els.advancedSubmitBtn.disabled = false;
      if (els.advancedNote) els.advancedNote.textContent = "Draft to Final requires the upstream draft task ID.";
      return;
    }
    if (!vegaDraftFollowup && !prompt) {
      els.advancedSubmitBtn.disabled = false;
      if (els.advancedNote) els.advancedNote.textContent = t("advanced.promptRequired");
      return;
    }
    const vegaReferenceImageItems = vegaUsesReferences ? selectedAdvancedReferenceImages(provider) : [];
    const vegaVideoItems = vegaUsesReferences ? advancedSeedanceVideoReferences() : [];
    const vegaAudioItems = vegaUsesReferences ? advancedSeedanceAudioReferences() : [];
    const vegaAssetIds = uniqueAdvancedAssetIds([
      vegaUsesFirstFrame ? state.advancedSeedanceFirstFrameAssetId : "",
      vegaUsesLastFrame ? state.advancedSeedanceLastFrameAssetId : "",
      ...vegaReferenceImageItems.map((item) => item.assetId),
      ...vegaVideoItems.map((item) => item.assetId),
      ...vegaAudioItems.map((item) => item.assetId),
    ]);
    if (vegaAssetIds.length) {
      try {
        const resolvedVegaAssets = await resolveAdvancedVegaAssets(vegaAssetIds);
        for (const item of [...vegaReferenceImageItems, ...vegaVideoItems, ...vegaAudioItems]) {
          const resolved = resolvedVegaAssets.get(item.assetId);
          if (resolved) applyResolvedVegaMediaSource(item, resolved);
        }
        if (vegaUsesFirstFrame) {
          const resolvedFirstFrame = resolvedVegaAssets.get(state.advancedSeedanceFirstFrameAssetId);
          const firstFrameUrl = resolvedFirstFrame ? applyResolvedVegaMediaSource({}, resolvedFirstFrame) : "";
          if (firstFrameUrl) state.advancedSeedanceFirstFrameDataUrl = firstFrameUrl;
        }
        if (vegaUsesLastFrame) {
          const resolvedLastFrame = resolvedVegaAssets.get(state.advancedSeedanceLastFrameAssetId);
          const lastFrameUrl = resolvedLastFrame ? applyResolvedVegaMediaSource({}, resolvedLastFrame) : "";
          if (lastFrameUrl) state.advancedSeedanceLastFrameDataUrl = lastFrameUrl;
        }
      } catch (error) {
        els.advancedSubmitBtn.disabled = false;
        if (els.advancedNote) els.advancedNote.textContent = error.message || "Vega asset public URL unavailable.";
        return;
      }
    }
    const vegaFirstFrameSource = vegaUsesFirstFrame ? String(state.advancedSeedanceFirstFrameDataUrl || "").trim() : "";
    const vegaLastFrameSource = vegaUsesLastFrame ? String(state.advancedSeedanceLastFrameDataUrl || "").trim() : "";
    const vegaFirstFrameUrl = vegaFirstFrameSource ? vegaMediaSource({ url: vegaFirstFrameSource }) : "";
    const vegaLastFrameUrl = vegaLastFrameSource ? vegaMediaSource({ url: vegaLastFrameSource }) : "";
    const vegaReferenceImageMedia = vegaReferenceImageItems.map((item) => ({
      item,
      source: vegaMediaSource(item),
      assetUri: String(item.assetUri || item.referenceAssetUri || item.seedanceAssetUri || "").trim(),
    }));
    const vegaReferenceVideoMedia = vegaVideoItems.map((item) => ({
      item,
      source: vegaMediaSource(item),
      assetUri: String(item.assetUri || item.referenceAssetUri || item.seedanceAssetUri || "").trim(),
    }));
    const vegaReferenceAudioMedia = vegaAudioItems.map((item) => ({
      item,
      source: vegaMediaSource(item),
      assetUri: String(item.assetUri || item.referenceAssetUri || item.seedanceAssetUri || "").trim(),
    }));
    const vegaReferenceImages = vegaReferenceImageMedia.map((entry) => entry.source);
    const vegaReferenceVideos = vegaReferenceVideoMedia.map((entry) => entry.source);
    const vegaReferenceAudios = vegaReferenceAudioMedia.map((entry) => entry.source);
    const invalidVegaMedia = (vegaFirstFrameSource && !vegaFirstFrameUrl)
      || (vegaLastFrameSource && !vegaLastFrameUrl)
      || vegaReferenceImages.some((url) => !url)
      || vegaReferenceVideos.some((url) => !url)
      || vegaReferenceAudios.some((url) => !url);
    if (invalidVegaMedia) {
      els.advancedSubmitBtn.disabled = false;
      if (els.advancedNote) els.advancedNote.textContent = vegaProviderUsesMediaLibrary(provider)
        ? "Vega Pro requires a public HTTP(S) URL or an existing asset:// URI."
        : "Vega Lite requires a public HTTP(S) URL from object storage.";
      return;
    }
    if (vegaUsesFirstFrame && !vegaFirstFrameUrl) {
      els.advancedSubmitBtn.disabled = false;
      if (els.advancedNote) els.advancedNote.textContent = "First Frame requires a first-frame image.";
      return;
    }
    if (vegaUsesLastFrame && !vegaLastFrameUrl) {
      els.advancedSubmitBtn.disabled = false;
      if (els.advancedNote) els.advancedNote.textContent = "Last Frame requires a last-frame image.";
      return;
    }
    if (vegaUsesReferences && !vegaReferenceImages.length && !vegaReferenceVideos.length && !vegaReferenceAudios.length) {
      els.advancedSubmitBtn.disabled = false;
      if (els.advancedNote) els.advancedNote.textContent = "Multimodal References requires at least one reference image, video, or audio.";
      return;
    }
    if (vegaReferenceAudios.length && !vegaReferenceImages.length && !vegaReferenceVideos.length) {
      els.advancedSubmitBtn.disabled = false;
      if (els.advancedNote) els.advancedNote.textContent = "Vega audio references require at least one image or video reference.";
      return;
    }
    const vegaReferenceLimitConfig = vegaReferenceLimits(provider);
    const vegaReferenceTotal = vegaReferenceImages.length + vegaReferenceVideos.length + vegaReferenceAudios.length;
    if (vegaReferenceImages.length > vegaReferenceLimitConfig.images || vegaReferenceVideos.length > vegaReferenceLimitConfig.videos || vegaReferenceAudios.length > vegaReferenceLimitConfig.audios || vegaReferenceTotal > vegaReferenceLimitConfig.total) {
      els.advancedSubmitBtn.disabled = false;
      if (els.advancedNote) els.advancedNote.textContent = `Vega references exceed the ${advancedProviderLabel(provider)} limit (images ${vegaReferenceLimitConfig.images}, videos ${vegaReferenceLimitConfig.videos}, audio ${vegaReferenceLimitConfig.audios}, total ${vegaReferenceLimitConfig.total}).`;
      return;
    }
    const vegaReferenceVideoDurations = vegaVideoItems.map((item) => positiveDurationSeconds(item.durationSeconds || item.duration, 0));
    const vegaReferenceAudioDurations = vegaAudioItems.map((item) => positiveDurationSeconds(item.durationSeconds || item.duration, 0));
    const vegaMediaDurationError = advancedVegaMediaDurationError(provider, vegaReferenceVideoDurations, vegaReferenceAudioDurations, vegaReferenceVideos.length, vegaReferenceAudios.length);
    if (vegaMediaDurationError) {
      els.advancedSubmitBtn.disabled = false;
      if (els.advancedNote) els.advancedNote.textContent = vegaMediaDurationError;
      return;
    }
    if (["edit", "extend"].includes(vegaOptions.taskType)) {
      if (!vegaUsesReferences || !vegaReferenceVideos.length) {
        els.advancedSubmitBtn.disabled = false;
        if (els.advancedNote) els.advancedNote.textContent = `Vega ${vegaOptions.taskType} requires Multimodal References with a source video.`;
        return;
      }
      if (String(els.advancedRatio?.value || "").trim().toLowerCase() !== "adaptive") {
        els.advancedSubmitBtn.disabled = false;
        if (els.advancedNote) els.advancedNote.textContent = `Vega ${vegaOptions.taskType} requires adaptive aspect ratio.`;
        return;
      }
    }
    if (vegaOptions.draft && currentAdvancedResolution() !== "480P") {
      els.advancedSubmitBtn.disabled = false;
      if (els.advancedNote) els.advancedNote.textContent = "Vega draft generation requires 480P resolution.";
      return;
    }
    const vegaPayloadBase = {
      provider,
      ...(vegaDraftFollowup ? {} : { prompt }),
      duration: vegaDraftFollowup || ["edit", "extend"].includes(vegaTaskType) ? -1 : vegaDuration,
      resolution: currentAdvancedResolution(),
      ratio: String(els.advancedRatio?.value || "16:9").trim(),
      seed: vegaCurrentSeed(),
      mediaMode: vegaMediaMode,
      ...vegaOptions,
      ...(vegaUsesFirstFrame ? {
        firstFrameUrl: vegaFirstFrameUrl,
        firstFrameAssetId: state.advancedSeedanceFirstFrameAssetId || "",
      } : {}),
      ...(vegaUsesLastFrame ? {
        lastFrameUrl: vegaLastFrameUrl,
        lastFrameAssetId: state.advancedSeedanceLastFrameAssetId || "",
      } : {}),
      ...(vegaUsesReferences ? {
        referenceImages: vegaReferenceImages,
        referenceImageCount: vegaReferenceImages.length,
        referenceImageAssetIds: vegaReferenceImageItems.map((item) => item.assetId || ""),
        referenceImageAssetUris: vegaReferenceImageMedia.map((entry) => entry.assetUri || ""),
        referenceVideos: vegaReferenceVideos,
        referenceVideoDurations: vegaReferenceVideoDurations,
        referenceVideoAssetIds: vegaVideoItems.map((item) => item.assetId || ""),
        referenceVideoAssetUris: vegaReferenceVideoMedia.map((entry) => entry.assetUri || ""),
        referenceAudios: vegaReferenceAudios,
        referenceAudioDurations: vegaReferenceAudioDurations,
        referenceAudioAssetIds: vegaAudioItems.map((item) => item.assetId || ""),
        referenceAudioAssetUris: vegaReferenceAudioMedia.map((entry) => entry.assetUri || ""),
      } : {}),
    };
    // Keep an exact, detached copy of the submitted model parameters in the
    // PostgreSQL generation record. Regeneration can then carry hidden Vega
    // options forward without repopulating or exposing their controls.
    const vegaPayload = { ...vegaPayloadBase, submissionSnapshot: { ...vegaPayloadBase } };
    if (vegaDraftFollowup) {
      delete vegaPayload.draft;
      vegaPayload.taskType = "auto";
    }
    const vegaPendingTaskId = `pending-video-${Date.now().toString(36)}`;
    const vegaPendingRecord = {
      taskId: vegaPendingTaskId,
      status: "submitting",
      model: advancedProviderLabel(provider),
      provider,
      source: `advanced-${provider}`,
      kind: "advanced-video",
      prompt: vegaPayload.prompt || "",
      params: { ...vegaPayload, advancedProviderId: provider },
      ratio: vegaPayload.ratio,
      resolution: vegaPayload.resolution,
      duration: vegaPayload.duration,
      seed: vegaPayload.seed,
      mediaMode: vegaMediaMode,
      mediaAssets: [
        ...(vegaPayload.firstFrameUrl ? [{
          type: "first_frame",
          url: vegaPayload.firstFrameUrl,
          userAssetId: vegaPayload.firstFrameAssetId || "",
        }] : []),
        ...(vegaPayload.lastFrameUrl ? [{
          type: "last_frame",
          url: vegaPayload.lastFrameUrl,
          userAssetId: vegaPayload.lastFrameAssetId || "",
        }] : []),
        ...(vegaPayload.referenceImages || []).map((url, index) => ({
          type: "reference_image",
          key: `image_${index + 1}`,
          url,
          userAssetId: vegaPayload.referenceImageAssetIds?.[index] || "",
        })),
        ...(vegaPayload.referenceVideos || []).map((url, index) => ({
          type: "reference_video",
          key: `video_${index + 1}`,
          videoUrl: url,
          userAssetId: vegaPayload.referenceVideoAssetIds?.[index] || "",
        })),
        ...(vegaPayload.referenceAudios || []).map((url, index) => ({
          type: "reference_audio",
          key: `audio_${index + 1}`,
          audioUrl: url,
          userAssetId: vegaPayload.referenceAudioAssetIds?.[index] || "",
        })),
      ],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    setAdvancedResultMediaKind("video");
    mergeAdvancedResultRecord(vegaPendingRecord);
    setAdvancedSideTab("result", { syncMobile: true });
    renderAdvancedResultPanel();
    if (els.advancedNote) els.advancedNote.textContent = "";
    try {
      const payload = await requestJson("/api/advanced/generate", { method: "POST", body: vegaPayload });
      if (payload.user) setUser(payload.user);
      state.advancedResultRecords = (state.advancedResultRecords || []).filter((record) => record.taskId !== vegaPendingTaskId);
      const submittedRecord = payload.record || payload.generation || {
        ...vegaPendingRecord,
        taskId: payload.taskId || payload.task?.taskId || vegaPendingTaskId,
        status: payload.task?.status || "submitted",
      };
      if (submittedRecord.taskId) {
        state.advancedResultTaskId = submittedRecord.taskId;
        mergeAdvancedResultRecord(submittedRecord);
      }
      clearAdvancedCreationInputs();
      showAdvancedSubmittedNotice();
      setAdvancedSideTab("result", { syncMobile: true });
      renderAdvancedResultPanel();
      await loadHistory({ silent: true }).catch(() => {});
    } catch (error) {
      if (handleAdvancedReferenceMissingError(error, vegaPendingTaskId)) return;
      showAdvancedSubmitFailure(error);
      state.advancedResultRecords = (state.advancedResultRecords || []).map((record) => (
        record.taskId === vegaPendingTaskId
          ? { ...record, status: "failed", error: error.message || String(error), updatedAt: new Date().toISOString() }
          : record
      ));
      if (state.advancedResultTaskId === vegaPendingTaskId) state.advancedResultTaskId = "";
      renderAdvancedResultPanel();
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
  if (provider === "seedance" && ["video-image", "video-replace"].includes(state.advancedCreateMode)) duration = 6;
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
  setAdvancedResultMediaKind("video");
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
      ...(provider === "wan30" ? { wan_prompt_optimize: wanPromptOptimize } : {}),
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
    const aliyunReferenceCapabilities = new Set(["wan30-video", "wan30-video-pro", "wan30-video-prime", "wan30-video-prime-pro", "wan27-r2v", "wan27-video-edit", "happyhorse-r2v", "happyhorse-video-edit"]);
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
        wan_prompt_optimize: provider === "wan30" ? wanPromptOptimize : undefined,
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
        resolution: currentAdvancedResolution(),
        duration,
        preprocessReference,
        seed: normalizeAdvancedSeed(els.advancedWanSeed?.value),
        params: {
          createKind: state.advancedCreateKind,
          createMode: state.advancedCreateMode,
          presets: advancedPresetSelection,
          videoCapability: videoCapability || undefined,
          model: legacyWanModel || undefined,
          animateMode: wanAnimateMode || undefined,
          parameters: {
            ...(provider === "wan30" ? { prompt_extend: promptExtend } : {}),
            ...(provider === "wan30" ? { wan_prompt_optimize: wanPromptOptimize } : {}),
            ...(wanAnimateMode ? { mode: wanAnimateMode } : {}),
          },
          ...(provider === "wan30" ? { prompt_extend: promptExtend } : {}),
          ...(provider === "wan30" ? { wan_prompt_optimize: wanPromptOptimize } : {}),
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
        ...(provider === "wan30" ? { wan_prompt_optimize: wanPromptOptimize } : {}),
        ...(sharedReferenceProvider ? { generateAudio: seedanceGenerateAudio, generate_audio: seedanceGenerateAudio } : {}),
      },
      ratio: els.advancedRatio?.value || (provider === "wan30" ? "adaptive" : "9:16"),
      resolution: currentAdvancedResolution(),
      duration,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    state.advancedResultRecords = (state.advancedResultRecords || []).filter((record) => record.taskId !== pendingTaskId);
    if (taskId) {
      state.advancedResultTaskId = taskId;
      mergeAdvancedResultRecord(submittedRecord);
    }
    showAdvancedSubmittedNotice();
    clearAdvancedCreationInputs();
    setAdvancedSideTab("result", { syncMobile: true });
    renderAdvancedResultPanel();
  } catch (error) {
    if (handleAdvancedReferenceMissingError(error, pendingTaskId)) return;
    showAdvancedSubmitFailure(error);
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
  if (els.advancedPrompt) {
    window.setAdvancedPromptValue?.(template.prompt || template.description || "", { emitInput: false });
    autoSizeAdvancedPrompt({ force: true, resetManual: true });
  }
  if (els.advancedSeedanceMediaMode) els.advancedSeedanceMediaMode.value = "reference_video";
  updateAdvancedModelControls();
  setAdvancedSideTab("assets");
  refreshIcons();
}

function readFileAsDataUrl(file) {
  if (String(file?.type || "").toLowerCase().startsWith("image/") && typeof document !== "undefined" && typeof URL !== "undefined") {
    return new Promise((resolve, reject) => {
      const sourceUrl = URL.createObjectURL(file);
      const image = new Image();
      const cleanup = () => {
        URL.revokeObjectURL(sourceUrl);
        image.onload = null;
        image.onerror = null;
        image.removeAttribute("src");
      };
      image.onload = () => {
        const width = Number(image.naturalWidth || image.width || 0);
        const height = Number(image.naturalHeight || image.height || 0);
        const pixels = width * height;
        if (!(width > 0 && height > 0) || pixels <= ADVANCED_CLIENT_IMAGE_MAX_PIXELS) {
          cleanup();
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result || ""));
          reader.onerror = () => reject(new Error(t("modal.readImageFailed")));
          reader.readAsDataURL(file);
          return;
        }
        try {
          const size = scaledCanvasSize(width, height, ADVANCED_CLIENT_IMAGE_MAX_PIXELS);
          const canvas = document.createElement("canvas");
          canvas.width = size.width;
          canvas.height = size.height;
          const context = canvas.getContext("2d", { alpha: true });
          if (!context) throw new Error("canvas_unavailable");
          context.drawImage(image, 0, 0, size.width, size.height);
          const outputType = String(file.type || "").toLowerCase() === "image/png" ? "image/png" : "image/jpeg";
          const dataUrl = canvas.toDataURL(outputType, outputType === "image/jpeg" ? ADVANCED_CLIENT_IMAGE_JPEG_QUALITY : undefined);
          canvas.width = 1;
          canvas.height = 1;
          cleanup();
          resolve(dataUrl);
        } catch {
          cleanup();
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result || ""));
          reader.onerror = () => reject(new Error(t("modal.readImageFailed")));
          reader.readAsDataURL(file);
        }
      };
      image.onerror = () => {
        cleanup();
        reject(new Error(t("modal.readImageFailed")));
      };
      image.src = sourceUrl;
    });
  }
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error(t("modal.readImageFailed")));
    reader.readAsDataURL(file);
  });
}

async function readMediaFileAsDataUrl(file, nameHint = "") {
  const dataUrl = await readFileAsDataUrl(file);
  const hintedFile = nameHint && !file?.name ? { ...file, name: nameHint } : file;
  const inferredMime = String(uploadedFileMime(hintedFile) || "").toLowerCase();
  const match = String(dataUrl || "").match(/^data:([^;,]*)((?:;[^,]*)*),(.*)$/s);
  if (!match || !inferredMime) return dataUrl;
  const currentMime = String(match[1] || "").toLowerCase();
  const genericMime = !currentMime || currentMime === "application/octet-stream" || currentMime === "binary/octet-stream" || currentMime === "application/mp4";
  return genericMime ? `data:${inferredMime}${match[2]},${match[3]}` : dataUrl;
}

function pastedMediaFilesFromEvent(event) {
  const clipboard = event?.clipboardData;
  const files = [];
  const seen = new Set();
  const addFile = (file) => {
    if (!file) return;
    const mime = String(file.type || uploadedFileMime(file) || "").toLowerCase();
    if (!/^(?:image|video|audio)\//.test(mime)) return;
    const key = `${mime}:${file.name || ""}:${file.size || 0}:${file.lastModified || 0}`;
    if (seen.has(key)) return;
    seen.add(key);
    files.push(file);
  };
  for (const item of Array.from(clipboard?.items || [])) {
    const kind = String(item?.kind || "").toLowerCase();
    const mime = String(item?.type || "").toLowerCase();
    // Chrome may expose a local copied video as a file item with an empty
    // kind/type. Do not discard it before trying getAsFile().
    if (kind && kind !== "file" && kind !== "string") continue;
    if (kind === "string" && mime && !/^(?:image|video|audio)\//.test(mime)) continue;
    addFile(item.getAsFile?.());
  }
  for (const file of Array.from(clipboard?.files || [])) addFile(file);
  return files;
}

function pastedImageFilesFromEvent(event) {
  return pastedMediaFilesFromEvent(event).filter((file) => String(file.type || uploadedFileMime(file) || "").toLowerCase().startsWith("image/"));
}

function clipboardEventLooksLikeMedia(event) {
  const clipboard = event?.clipboardData;
  const types = Array.from(clipboard?.types || []).map((type) => String(type || "").toLowerCase());
  if (types.includes("files") || types.some((type) => /^(?:image|video|audio)\//.test(type))) return true;
  const html = String(clipboard?.getData?.("text/html") || "");
  if (/<(?:img|video|audio|source)\b/i.test(html) || /url\(\s*["']?(?:https?:|data:|blob:)/i.test(html)) return true;
  const plain = String(clipboard?.getData?.("text/plain") || "");
  return /^(?:data|blob):(?:image|video|audio)\//i.test(plain.trim());
}

function clipboardItemText(item = {}, type = "") {
  const getType = item?.getType;
  if (typeof getType !== "function") return Promise.resolve("");
  return Promise.resolve(getType.call(item, type))
    .then((value) => (typeof value === "string" ? value : value?.text?.()))
    .then((value) => (typeof value === "string" ? value : String(value || "")))
    .catch(() => "");
}

async function pastedMediaUrlsFromClipboardItems(items = []) {
  const eventLike = { clipboardData: null };
  const textTypes = ["text/uri-list", "text/html", "text/plain"];
  const values = new Map(textTypes.map((type) => [type, []]));
  for (const item of Array.from(items || [])) {
    for (const type of Array.from(item?.types || [])) {
      const normalized = String(type || "").toLowerCase();
      if (!textTypes.includes(normalized)) continue;
      const text = await clipboardItemText(item, type);
      if (text) values.get(normalized).push(text);
    }
  }
  eventLike.clipboardData = {
    getData(type) {
      return (values.get(String(type || "").toLowerCase()) || []).join("\n");
    },
  };
  return pastedMediaUrlCandidatesFromEvent(eventLike);
}

function readNavigatorClipboardMedia() {
  const clipboard = globalThis.navigator?.clipboard;
  if (!clipboard?.read) return null;
  try {
    return Promise.resolve(clipboard.read());
  } catch (_error) {
    return null;
  }
}

async function pastedMediaFilesFromNavigatorClipboard(clipboardReadPromise = null) {
  const clipboard = globalThis.navigator?.clipboard;
  if (!clipboard?.read) return [];
  const files = [];
  const seen = new Set();
  for (const item of await (clipboardReadPromise || clipboard.read())) {
    for (const type of Array.from(item.types || [])) {
      const mime = String(type || "").toLowerCase();
      if (!/^(?:image|video|audio)\//.test(mime)) continue;
      const blob = await item.getType(type);
      if (!blob) continue;
      const extension = mime.split("/")[1]?.replace("jpeg", "jpg").replace("quicktime", "mov") || "bin";
      const file = new File([blob], `clipboard-pasted-${Date.now()}-${files.length + 1}.${extension}`, { type: mime });
      const key = `${file.type}:${file.size}:${file.name}`;
      if (seen.has(key)) continue;
      seen.add(key);
      files.push(file);
    }
  }
  return files;
}

async function pastedMediaUrlsFromNavigatorClipboard() {
  const clipboard = globalThis.navigator?.clipboard;
  if (!clipboard?.read) return [];
  const contents = await clipboard.read();
  return pastedMediaUrlsFromClipboardItems(contents);
}

function mediaUrlKind(value = "") {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const dataKind = raw.match(/^data:((?:image|video|audio)\/)/i)?.[1]?.toLowerCase() || "";
  if (dataKind) return dataKind.startsWith("image/") ? "image" : dataKind.startsWith("video/") ? "video" : "audio";
  let pathname = "";
  try { pathname = new URL(raw).pathname.toLowerCase(); } catch (_error) { return ""; }
  if (/\.(?:png|jpe?g|webp|gif|bmp|avif)$/.test(pathname)) return "image";
  if (/\.(?:mp4|webm|mov|m4v)$/.test(pathname)) return "video";
  if (/\.(?:mp3|wav|m4a|aac|ogg)$/.test(pathname)) return "audio";
  return "";
}

function mediaUrlKindFromHtmlTag(tag = "") {
  const name = String(tag || "").match(/^<\s*([a-z0-9]+)/i)?.[1]?.toLowerCase() || "";
  if (name === "img") return "image";
  if (name === "video") return "video";
  if (name === "audio") return "audio";
  return "";
}

function decodePastedHtmlUrl(value = "") {
  return String(value || "")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .trim();
}

function pastedHtmlAttribute(tag = "", name = "") {
  const escaped = String(name || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = String(tag || "").match(new RegExp(`\\b${escaped}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, "i"));
  return decodePastedHtmlUrl(match?.[1] ?? match?.[2] ?? match?.[3] ?? "");
}

function pastedHtmlMediaKind(tag = "") {
  const tagKind = mediaUrlKindFromHtmlTag(tag);
  if (tagKind) return tagKind;
  const mime = pastedHtmlAttribute(tag, "type").toLowerCase();
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("video/")) return "video";
  if (mime.startsWith("audio/")) return "audio";
  return "";
}

function pastedMediaUrlCandidatesFromEvent(event) {
  const clipboard = event?.clipboardData;
  const candidates = [];
  const seen = new Set();
  const add = (value = "", { kind = "", onlyMedia = false } = {}) => {
    const raw = String(value || "").trim();
    if (!raw) return;
    const urls = [];
    for (const line of raw.split(/\r?\n/)) {
      const direct = line.trim();
      if (/^(?:(?:https?:)?\/\/|data:|blob:)/i.test(direct)) urls.push({ value: direct, kind });
    }
    for (const tag of raw.match(/<(?:img|video|audio|source|a|link)\b[^>]*>/gi) || []) {
      const tagKind = pastedHtmlMediaKind(tag);
      const src = pastedHtmlAttribute(tag, "src") || pastedHtmlAttribute(tag, "data-src") || pastedHtmlAttribute(tag, "data-original") || pastedHtmlAttribute(tag, "href");
      const poster = pastedHtmlAttribute(tag, "poster");
      const srcset = pastedHtmlAttribute(tag, "srcset").split(",")[0]?.trim().split(/\s+/)[0] || "";
      if (poster) urls.push({ value: poster, kind: "image" });
      if (src) urls.push({ value: src, kind: tagKind || mediaUrlKind(src) });
      if (srcset && !src) urls.push({ value: srcset, kind: tagKind || mediaUrlKind(srcset) });
    }
    for (const cssUrl of raw.match(/url\(\s*["']?([^"')]+)["']?\s*\)/gi) || []) {
      const value = cssUrl.replace(/^url\(\s*["']?|["']?\s*\)$/gi, "");
      urls.push({ value: decodePastedHtmlUrl(value), kind: mediaUrlKind(value) });
    }
    for (const candidate of urls) {
      const rawUrl = String(candidate.value || "").trim();
      const inlineMedia = /^(?:data|blob):/i.test(rawUrl) && Boolean(candidate.kind || mediaUrlKind(rawUrl));
      const url = inlineMedia ? rawUrl : absoluteHttpUrl(rawUrl);
      const resolvedKind = candidate.kind || mediaUrlKind(url);
      if (!url || seen.has(url) || (onlyMedia && !resolvedKind)) continue;
      seen.add(url);
      candidates.push({ url, kind: resolvedKind });
    }
  };
  const read = (type) => {
    try { return clipboard?.getData?.(type) || ""; } catch (_error) { return ""; }
  };
  add(read("text/uri-list"), { onlyMedia: true });
  add(read("text/html"));
  add(read("text/plain"), { onlyMedia: true });
  return candidates;
}

function mediaUrlCandidateName(value = "", kind = "image") {
  if (/^(?:data|blob):/i.test(String(value || ""))) {
    return kind === "video" ? "pasted-video.mp4" : kind === "audio" ? "pasted-audio.mp3" : "pasted-image.png";
  }
  try { return decodeURIComponent(new URL(value).pathname.split("/").pop() || ""); }
  catch (_error) { return kind === "video" ? "pasted-video.mp4" : kind === "audio" ? "pasted-audio.mp3" : "pasted-image.png"; }
}

function advancedPastedMediaRef(asset = {}, kind = "image", fallbackUrl = "") {
  const sourceUrl = asset.publicUrl || asset.cdnUrl || asset.previewUrl || asset.localUrl || fallbackUrl || "";
  return {
    ...asset,
    id: asset.id || "",
    assetId: asset.id || asset.assetId || "",
    kind,
    mime: asset.mime || "",
    name: asset.name || asset.fileName || mediaUrlCandidateName(sourceUrl, kind),
    fileName: asset.fileName || asset.name || mediaUrlCandidateName(sourceUrl, kind),
    publicUrl: asset.publicUrl || sourceUrl,
    cdnUrl: asset.cdnUrl || "",
    url: sourceUrl,
    previewUrl: asset.previewUrl || sourceUrl,
    durationSeconds: Number(asset.durationSeconds || asset.duration || 0) || 0,
  };
}

function advancedPastedMediaUsesLibrary(provider = currentAdvancedProvider()) {
  return !vegaProviderUsesTransientObjectStorage(provider);
}

async function uploadAdvancedMediaReferenceUrl(url = "", kind = "image", { provider = currentAdvancedProvider(), name = "", durationSeconds = 0 } = {}) {
  if (!state.user) {
    openLogin();
    return null;
  }
  let sourceUrl = String(url || "").trim();
  if (/^blob:/i.test(sourceUrl)) {
    try {
      const blob = await (await fetch(sourceUrl)).blob();
      sourceUrl = await readMediaFileAsDataUrl(blob, name);
    } catch (_error) {
      sourceUrl = "";
    }
  }
  if (!/^data:/i.test(sourceUrl)) sourceUrl = absoluteHttpUrl(sourceUrl);
  if (!sourceUrl || (!/^data:/i.test(sourceUrl) && !vegaPublicHttpUrl(sourceUrl))) {
    if (els.advancedNote) els.advancedNote.textContent = t("assets.uploadFailed", { message: "Media URL must be public HTTP(S)." });
    return null;
  }
  const fileName = String(name || mediaUrlCandidateName(sourceUrl, kind));
  const usesMediaLibrary = advancedPastedMediaUsesLibrary(provider);
  const inlineDataUrl = /^data:/i.test(sourceUrl);
  const payload = await requestJson(usesMediaLibrary ? "/api/user-assets" : "/api/advanced/transient-media", {
    method: "POST",
    body: usesMediaLibrary
      ? { ...(inlineDataUrl ? { dataUrl: sourceUrl } : { url: sourceUrl }), name: fileName, fileName, durationSeconds, provider }
      : { ...(inlineDataUrl ? { dataUrl: sourceUrl } : { url: sourceUrl }), name: fileName, fileName, kind, provider, durationSeconds },
  });
  if (usesMediaLibrary) {
    const asset = payload.asset || null;
    if (!asset?.id) throw new Error(t("assets.uploadFailed", { message: "Invalid media asset" }));
    state.advancedAssets = [asset, ...(state.advancedAssets || []).filter((item) => item.id !== asset.id)];
    state.userAssets = [asset, ...(state.userAssets || []).filter((item) => item.id !== asset.id)];
    renderAdvancedAssets();
    return advancedPastedMediaRef(asset, kind, sourceUrl);
  }
  const media = payload.media || null;
  const publicUrl = vegaPublicHttpUrl(media?.publicUrl || media?.url || "");
  if (!media || !publicUrl) throw new Error(t("assets.uploadFailed", { message: "Object storage public URL unavailable" }));
  return advancedPastedMediaRef({
    ...media,
    id: "",
    publicUrl,
    url: publicUrl,
    previewUrl: publicUrl,
  }, kind, publicUrl);
}

async function addAdvancedVegaPromptPasteUrlImages(candidates = [], rule = {}, provider = currentAdvancedProvider()) {
  if (!rule.allowed || !candidates.length) return 0;
  const targets = rule.target === "frames"
    ? advancedAssetTargetItems().filter((target) => (
      ["primary", "lastFrame"].includes(target.id) && !advancedTargetHasSelection(target.id)
    ))
    : [{ id: "referenceImages", label: t("advanced.assetTargetReferenceImages") }];
  if (!targets.length) return 0;

  const previousPromptRefs = advancedPromptMentionSnapshot();
  const existing = rule.replaceExisting ? [] : (Array.isArray(state.advancedReferenceImages) ? state.advancedReferenceImages : []);
  const occupiedFrameSlots = rule.target === "frames"
    ? Number(Boolean(state.advancedSeedanceFirstFrameDataUrl || state.advancedSeedanceFirstFrameAssetId))
      + Number(Boolean(state.advancedSeedanceLastFrameDataUrl || state.advancedSeedanceLastFrameAssetId))
    : 0;
  const roomLeft = Math.max(0, rule.limit - (rule.target === "frames" ? occupiedFrameSlots : existing.length));
  const maxCandidates = rule.target === "frames" ? Math.min(roomLeft, targets.length) : roomLeft;
  const selected = candidates.slice(0, maxCandidates);
  const resolved = [];
  for (const candidate of selected) {
    const target = rule.target === "frames" ? targets[resolved.length] : targets[0];
    if (!target) break;
    const ref = await uploadAdvancedMediaReferenceUrl(candidate.url, "image", { provider });
    if (!ref) return 0;
    const selection = vegaProviderUsesMediaLibrary(provider)
      ? await resolveAdvancedVegaAsset(ref, target.id)
      : advancedVegaSelection(ref, target.id);
    if (!selection.ok) throw new Error(selection.message || "This image cannot be used for the selected Vega input.");
    resolved.push({ selection, target });
  }
  if (!resolved.length) return 0;

  state.activeAdvancedCaseId = "";
  if (rule.target === "frames") {
    state.advancedReferenceImages = [];
  } else {
    state.advancedFirstFrameAssetId = "";
    state.advancedSeedanceFirstFrameAssetId = "";
    state.advancedSeedanceFirstFrameDataUrl = "";
    state.advancedSourceImageAssetId = "";
  }
  state.advancedWanClipAssetId = "";
  resolved.forEach(({ selection, target }) => applyAdvancedVegaSelection(selection, target));
  if (els.advancedImage) els.advancedImage.value = "";
  syncAdvancedPromptMentionLabels(previousPromptRefs);
  updateAdvancedModelControls();
  updateAdvancedButtonCost();
  return resolved.length;
}

function advancedPromptPasteSupportsVideoReferences(provider = currentAdvancedProvider()) {
  if (advancedVideoReferenceLimit(provider) <= 0) return false;
  if (isVegaAdvancedProvider(provider)) {
    return vegaModeUsesReferences(advancedVegaMediaMode());
  }
  const mode = normalizeSeedanceMediaMode(els.advancedSeedanceMediaMode?.value || "reference_video");
  return seedanceModeNeedsReferenceVideo(mode);
}

async function addAdvancedPromptPasteUrlVideos(candidates = [], provider = currentAdvancedProvider()) {
  if (!advancedPromptPasteSupportsVideoReferences(provider)) {
    if (els.advancedNote) els.advancedNote.textContent = t("advanced.referenceVideoUnsupported");
    return false;
  }
  const availableVideoSlots = Math.max(0, advancedVideoReferenceLimit(provider) - advancedSeedanceVideoReferences().length);
  const selected = candidates.slice(0, availableVideoSlots);
  if (!selected.length) {
    if (els.advancedNote) els.advancedNote.textContent = t("advanced.referenceMediaTooMany");
    return false;
  }
  for (const candidate of selected) {
    const ref = await uploadAdvancedMediaReferenceUrl(candidate.url, "video", { provider });
    if (!ref) return false;
    const added = addAdvancedSeedanceMediaReference(ref, "video", {
      sourceUrl: ref.publicUrl || ref.url || ref.previewUrl || "",
      ref,
    });
    if (!added.ok) {
      if (els.advancedNote) els.advancedNote.textContent = advancedMediaReferenceAddError(added, "video");
      return false;
    }
  }
  if (els.advancedNote) els.advancedNote.textContent = "";
  updateAdvancedModelControls();
  updateAdvancedButtonCost();
  return true;
}

async function addAdvancedVegaPromptPasteUrlVideos(candidates = [], provider = currentAdvancedProvider()) {
  return addAdvancedPromptPasteUrlVideos(candidates, provider);
}

async function addAdvancedPromptPasteVideoFiles(videoFiles = [], provider = currentAdvancedProvider()) {
  if (!advancedPromptPasteSupportsVideoReferences(provider)) {
    if (els.advancedNote) els.advancedNote.textContent = t("advanced.referenceVideoUnsupported");
    return false;
  }
  const availableVideoSlots = Math.max(0, advancedVideoReferenceLimit(provider) - advancedSeedanceVideoReferences().length);
  const selectedVideos = videoFiles.slice(0, availableVideoSlots);
  if (!selectedVideos.length) {
    if (els.advancedNote) els.advancedNote.textContent = t("advanced.referenceMediaTooMany");
    return false;
  }
  const usesTransientStorage = vegaProviderUsesTransientObjectStorage(provider);
  for (const file of selectedVideos) {
    const ref = usesTransientStorage
      ? await uploadAdvancedTransientMediaReference(file, "video", { provider })
      : await uploadAdvancedMediaReference(file, "video", { provider, skipReference: true });
    if (!ref) return false;
    const added = addAdvancedSeedanceMediaReference(ref, "video", {
      sourceUrl: ref.publicUrl || ref.url || ref.previewUrl || "",
      ref,
    });
    if (!added.ok) {
      if (els.advancedNote) els.advancedNote.textContent = advancedMediaReferenceAddError(added, "video");
      return false;
    }
  }
  if (els.advancedNote) els.advancedNote.textContent = "";
  renderAdvancedAssets();
  updateAdvancedModelControls();
  updateAdvancedButtonCost();
  return true;
}

function advancedPromptPasteImageRule() {
  if (state.advancedCreateKind !== "custom") return { allowed: false, limit: 0, target: "references" };
  const provider = currentAdvancedProvider();
  const capability = currentAdvancedVideoCapability();
  const imageTargets = advancedAssetTargetItems().filter((target) => target.type === "image");
  if (!imageTargets.length) return { allowed: false, limit: 0, target: "references" };

  const rawMediaMode = els.advancedSeedanceMediaMode?.value || "reference_video";
  if (isVegaAdvancedProvider(provider)) {
    const vegaMode = normalizeVegaUiMediaMode(rawMediaMode);
    if (vegaModeNeedsFirstFrame(vegaMode) || vegaModeNeedsLastFrame(vegaMode)) {
      return {
        allowed: true,
        limit: Number(vegaModeNeedsFirstFrame(vegaMode)) + Number(vegaModeNeedsLastFrame(vegaMode)),
        target: "frames",
        replaceExisting: false,
      };
    }
    if (vegaModeUsesReferences(vegaMode)) {
      return {
        allowed: true,
        limit: vegaReferenceLimits(provider).images,
        target: "references",
        replaceExisting: false,
      };
    }
    return { allowed: false, limit: 0, target: "references" };
  }

  const seedanceMode = normalizeSeedanceMediaMode(rawMediaMode);
  const sharedFrameProvider = ["seedance", "seedance25", "seedance-nsfw", "wan30"].includes(provider);
  if (sharedFrameProvider && seedanceModeNeedsFirstFrame(seedanceMode)) {
    return { allowed: true, limit: 2, target: "frames", replaceExisting: false };
  }

  let limit = 1;
  if (provider === "qwen-image3") limit = ADVANCED_QWEN_IMAGE3_REFERENCE_LIMIT;
  else if (provider === "seedream5-image") limit = ADVANCED_SEEDANCE_REFERENCE_LIMIT;
  else if (isAdvancedImageProvider(provider)) limit = advancedCreateModeUsesSingleUpload() ? 1 : ADVANCED_SEEDANCE_REFERENCE_LIMIT;
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

async function addAdvancedVegaPromptPasteImages(files = [], rule = {}, provider = currentAdvancedProvider()) {
  const targets = rule.target === "frames"
    ? advancedAssetTargetItems().filter((target) => (
      ["primary", "lastFrame"].includes(target.id) && !advancedTargetHasSelection(target.id)
    ))
    : [{ id: "referenceImages", label: t("advanced.assetTargetReferenceImages") }];
  const resolved = [];
  for (const file of files) {
    const target = targets[resolved.length];
    if (!target) {
      throw new Error(t("advanced.referenceImageTooMany", { count: rule.limit }));
    }
    const usesMediaLibrary = vegaProviderUsesMediaLibrary(provider);
    const ref = usesMediaLibrary
      ? await uploadAdvancedImageReference(file, { provider })
      : await uploadAdvancedTransientMediaReference(file, "image", { provider });
    if (!ref) return false;
    const asset = {
      ...ref,
      id: ref.assetId || ref.id || "",
      kind: "image",
      mime: uploadedFileMime(file),
    };
    const selection = usesMediaLibrary
      ? await resolveAdvancedVegaAsset(asset, target.id)
      : advancedVegaSelection(asset, target.id);
    if (!selection.ok) {
      throw new Error(selection.message || "This image cannot be used for the selected Vega input.");
    }
    resolved.push({ selection, target });
  }
  if (!resolved.length) return false;

  state.activeAdvancedCaseId = "";
  if (rule.target === "frames") {
    state.advancedReferenceImages = [];
  } else {
    state.advancedFirstFrameAssetId = "";
    state.advancedSeedanceFirstFrameAssetId = "";
    state.advancedSeedanceFirstFrameDataUrl = "";
    state.advancedSourceImageAssetId = "";
  }
  state.advancedWanClipAssetId = "";
  resolved.forEach(({ selection, target }) => applyAdvancedVegaSelection(selection, target));
  return true;
}

function handleAdvancedPromptPaste(event) {
  // The rich editor can receive the same paste through its document capture
  // listener and ProseMirror's handlePaste. De-duplicate only that same event:
  // a boolean guard would drop a second paste made while the first upload is
  // still in flight. Return true synchronously when the platform owns this
  // paste so ProseMirror cannot insert a duplicate while uploads are pending.
  if (!event || typeof event !== "object" || advancedPromptPasteEvents.has(event)) {
    return Boolean(event?.defaultPrevented);
  }
  advancedPromptPasteEvents.add(event);
  // Safari invalidates ClipboardEvent.clipboardData immediately after the
  // paste dispatch returns. Snapshot every synchronous source now; async
  // uploads must never wait until the microtask to read the event again.
  const snapshot = advancedPromptPasteMediaSnapshot(event);
  const ownsMediaPaste = Boolean(snapshot.files.length || snapshot.urls.length || snapshot.looksLikeMedia);
  if (ownsMediaPaste) event.preventDefault();
  // Start the clipboard read while the paste event still has user activation.
  // Reading it later from the async upload path can fail with NotAllowedError.
  const clipboardReadPromise = snapshot.looksLikeMedia ? readNavigatorClipboardMedia() : null;
  Promise.resolve()
    .then(() => handleAdvancedPromptPasteEvent(event, { ownsMediaPaste, snapshot, clipboardReadPromise }))
    .catch((error) => {
      const note = els.advancedNote;
      if (note) note.textContent = error?.message || String(error);
    });
  setTimeout(() => advancedPromptPasteEvents.delete(event), 0);
  return ownsMediaPaste;
}

function advancedPromptPasteMediaSnapshot(event) {
  return {
    files: pastedMediaFilesFromEvent(event),
    urls: pastedMediaUrlCandidatesFromEvent(event),
    looksLikeMedia: clipboardEventLooksLikeMedia(event),
  };
}

async function handleAdvancedPromptPasteEvent(event, { ownsMediaPaste = false, snapshot = null, clipboardReadPromise = null } = {}) {
  const provider = currentAdvancedProvider();
  const initialSnapshot = snapshot || advancedPromptPasteMediaSnapshot(event);
  let mediaFiles = initialSnapshot.files.slice();
  const rule = advancedPromptPasteImageRule();
  let pastedUrls = !mediaFiles.length ? initialSnapshot.urls.slice() : [];
  const suspiciousClipboardMedia = !mediaFiles.length && !pastedUrls.length && initialSnapshot.looksLikeMedia;
  // Safari sometimes hides the actual image/video behind the async Clipboard
  // API even though the synchronous paste event exposes only an empty
  // Files/HTML type. The synchronous decision above already prevented the
  // editor from inserting the placeholder, then resolve the real files here.
  if (suspiciousClipboardMedia) {
    if (!ownsMediaPaste) event.preventDefault();
    try {
      mediaFiles = await pastedMediaFilesFromNavigatorClipboard(clipboardReadPromise);
    } catch (_error) {
      mediaFiles = [];
    }
    if (!mediaFiles.length) {
      try {
        pastedUrls = await pastedMediaUrlsFromNavigatorClipboard();
      } catch (_error) {
        pastedUrls = [];
      }
    }
    if (mediaFiles.length) pastedUrls = [];
  }
  if (!mediaFiles.length && !pastedUrls.length) {
    try {
      pastedUrls = await pastedMediaUrlsFromClipboardItems(event?.clipboardData?.items || []);
    } catch (_error) {
      pastedUrls = [];
    }
  }
  const imageFiles = mediaFiles.filter((file) => String(file.type || uploadedFileMime(file) || "").toLowerCase().startsWith("image/"));
  const videoFiles = mediaFiles.filter((file) => String(file.type || uploadedFileMime(file) || "").toLowerCase().startsWith("video/"));
  const pastedImageUrls = pastedUrls.filter((candidate) => candidate.kind === "image");
  const pastedVideoUrls = pastedUrls.filter((candidate) => candidate.kind === "video");
  const hasPastedMedia = Boolean(mediaFiles.length || pastedImageUrls.length || pastedVideoUrls.length);

  // Clipboard media must be consumed before the rich editor inserts it or
  // turns its URL into plain text. This runs synchronously before the first await.
  if (hasPastedMedia) event.preventDefault();

  if (pastedVideoUrls.length) {
    await addAdvancedPromptPasteUrlVideos(pastedVideoUrls, provider);
  }

  if (isVegaAdvancedProvider(provider) && pastedImageUrls.length) {
    const addedCount = await addAdvancedVegaPromptPasteUrlImages(pastedImageUrls, rule, provider);
    if (els.advancedNote && addedCount < pastedImageUrls.length && addedCount >= rule.limit) {
      els.advancedNote.textContent = t("advanced.referenceImageTooMany", { count: rule.limit });
    }
  }

  if (videoFiles.length) {
    event.preventDefault();
    await addAdvancedPromptPasteVideoFiles(videoFiles, provider);
  }

  const files = imageFiles;
  if (!files.length) return;
  if (!rule.allowed) {
    if (isVegaAdvancedProvider(provider)) {
      event.preventDefault();
      if (els.advancedNote) els.advancedNote.textContent = t("advanced.referenceImageTooMany", { count: 1 });
    }
    return;
  }
  event.preventDefault();
  const referenceLimit = rule.limit;
  const maxBytes = provider === "qwen-image3" ? ADVANCED_QWEN_IMAGE3_REFERENCE_MAX_BYTES : advancedMediaUploadMaxBytes("image", provider);
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
  if (isVegaAdvancedProvider(provider)) {
    const added = await addAdvancedVegaPromptPasteImages(selectedFiles, rule, provider);
    if (!added) {
      updateAdvancedModelControls();
      return;
    }
  } else {
    const addedImages = [];
    for (let index = 0; index < selectedFiles.length; index += 1) {
      const file = selectedFiles[index];
      addedImages.push({
        dataUrl: await readFileAsDataUrl(file),
        fileName: file.name || `pasted-reference-${Date.now()}-${index + 1}.png`,
      });
    }
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
      const stamped = addedImages.map(stampAdvancedReferenceOrder);
      state.advancedReferenceImages = dedupeAdvancedReferenceImages([
        ...existing,
        ...stamped,
      ]).slice(0, referenceLimit);
      const pinned = stamped[stamped.length - 1];
      if (pinned) state.advancedPinnedMentionKey = advancedPromptMentionStableKey({ kind: "image", item: pinned });
      state.advancedUploadDataUrl = state.advancedReferenceImages[0]?.dataUrl || "";
      state.advancedFirstFrameAssetId = "";
      state.advancedSeedanceFirstFrameAssetId = "";
      state.advancedSeedanceFirstFrameDataUrl = "";
      state.advancedSourceImageAssetId = isAdvancedImageProvider(provider) ? (state.advancedReferenceImages[0]?.assetId || "") : "";
    }
    state.advancedWanClipAssetId = "";
  }
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
  const mime = String(asset.mime || "").toLowerCase();
  if (asset.kind === "video" || mime.startsWith("video/") || mime === "application/mp4") return true;
  if (asset.kind === "image" || asset.kind === "audio" || asset.kind === "document" || mime.startsWith("image/") || mime.startsWith("audio/")) return false;
  return mimeFromMediaName([asset.name, asset.fileName, asset.localUrl, asset.publicUrl, asset.cdnUrl, asset.previewUrl].filter(Boolean).join(" ")).startsWith("video/");
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

function vegaPublicHttpUrl(value = "") {
  const raw = String(value || "").trim();
  if (!raw) return "";
  let parsed;
  try {
    parsed = new URL(raw);
  } catch (_error) {
    return "";
  }
  if (!["http:", "https:"].includes(parsed.protocol) || parsed.username || parsed.password) return "";
  const hostname = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, "").replace(/\.$/, "");
  if (!hostname || hostname === "localhost" || hostname.endsWith(".localhost") || hostname.endsWith(".local")) return "";
  const mappedIpv4 = hostname.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/)?.[1] || "";
  const ipv4 = mappedIpv4 || (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(hostname) ? hostname : "");
  if (ipv4) {
    const parts = ipv4.split(".").map(Number);
    if (parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return "";
    if (parts[0] === 0 || parts[0] === 10 || parts[0] === 127 || parts[0] === 169 && parts[1] === 254
      || parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31
      || parts[0] === 192 && parts[1] === 168
      || parts[0] === 100 && parts[1] >= 64 && parts[1] <= 127) return "";
  }
  if (hostname.includes(":") && (hostname === "::1" || hostname === "::" || hostname.startsWith("fc") || hostname.startsWith("fd") || /^fe[89ab]/.test(hostname))) return "";
  return raw;
}


window.handleAdvancedPromptPaste = handleAdvancedPromptPaste;
