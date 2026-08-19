async function startPlatform() {
  const allowed = await ensureAgeGate();
  if (!allowed) return;
  await bootstrap();
}

document.addEventListener("click", (event) => {
  const galleryShortcut = event.target.closest("[data-gallery-shortcut]");
  if (galleryShortcut) {
    state.routeCharacterId = "";
    state.routeCharacterSource = "";
    state.activeGalleryCharacterId = "";
    setTab(DEFAULT_PLATFORM_TAB);
    setGalleryMode(galleryShortcut.dataset.galleryShortcut || DEFAULT_GALLERY_MODE);
    return;
  }
  const button = event.target.closest("[data-tab]");
  if (!button) return;
  state.routeCharacterId = "";
  state.routeCharacterSource = "";
  state.activeGalleryCharacterId = "";
  if (button.dataset.tab === DEFAULT_PLATFORM_TAB) state.galleryMode = DEFAULT_GALLERY_MODE;
  setTab(button.dataset.tab);
});
els.mobileDrawerToggle?.addEventListener("click", toggleMobileDrawer);
els.mobileDrawerBackdrop?.addEventListener("click", closeMobileDrawer);
window.addEventListener("hashchange", () => setTab(window.location.hash));
els.templateImage?.addEventListener("change", async () => {
  const file = els.templateImage.files?.[0];
  if (!file) return;
  state.uploadDataUrl = await readFileAsDataUrl(file);
  els.uploadPreview.src = state.uploadDataUrl;
  els.uploadBox.classList.add("has-image");
});
els.advancedImage?.addEventListener("change", async () => {
  const provider = currentAdvancedProvider();
  const files = Array.from(els.advancedImage.files || []);
  if (!files.length) return;
  if (["seedream5-image", "qwen-image3"].includes(provider)) {
    try {
      const imageLimit = provider === "qwen-image3" ? ADVANCED_QWEN_IMAGE3_REFERENCE_LIMIT : ADVANCED_SEEDANCE_REFERENCE_LIMIT;
      let skippedWrongType = false;
      let skippedTooLarge = false;
      let skippedTooMany = false;
      for (const file of files) {
        const mime = String(file.type || "").toLowerCase();
        if (!mime.startsWith("image/")) {
          skippedWrongType = true;
          continue;
        }
        if (file.size > (provider === "qwen-image3" ? ADVANCED_QWEN_IMAGE3_REFERENCE_MAX_BYTES : ADVANCED_SEEDANCE_REFERENCE_MAX_BYTES)) {
          skippedTooLarge = true;
          continue;
        }
        const existingImages = Array.isArray(state.advancedReferenceImages) ? state.advancedReferenceImages : [];
        if (existingImages.length >= imageLimit) {
          skippedTooMany = true;
          continue;
        }
        const ref = await uploadAdvancedImageReference(file, { provider });
        if (!ref) continue;
        state.advancedReferenceImages = dedupeAdvancedReferenceImages([...existingImages, ref]).slice(0, imageLimit);
        state.advancedUploadDataUrl = state.advancedReferenceImages[0]?.dataUrl || "";
        state.advancedFirstFrameAssetId = "";
        state.advancedSourceImageAssetId = "";
      }
      if (skippedWrongType && els.advancedNote) {
        els.advancedNote.textContent = t("advanced.assetWrongType", { target: t("advanced.uploadReference"), type: "image" });
      }
      if (skippedTooLarge && els.advancedNote) {
        els.advancedNote.textContent = t("advanced.referenceImageTooLarge");
      }
      if (skippedTooMany && els.advancedNote) {
        els.advancedNote.textContent = t("advanced.referenceImageTooMany", { count: imageLimit });
      }
      state.activeAdvancedCaseId = "";
      state.advancedAssetTarget = "referenceImages";
      renderAdvancedPresetBuilder();
      updateAdvancedModelControls();
      updateAdvancedButtonCost();
    } catch (error) {
      if (els.advancedNote) els.advancedNote.textContent = error.message || String(error);
    } finally {
      els.advancedImage.value = "";
    }
    return;
  }
  if (["seedance", "seedance25", "seedance-nsfw", "wan30"].includes(provider)) {
    const localCharacterUpload = provider === "seedance" && state.advancedLocalUploadSlot === "character" && state.advancedCreateKind !== "custom" && advancedCreateModeUsesCharacterPresetReference();
    const imageLimit = provider === "wan30"
      ? ADVANCED_WAN30_IMAGE_REFERENCE_LIMIT
      : ["seedance25", "seedance-nsfw"].includes(provider)
      ? ADVANCED_SEEDANCE25_IMAGE_REFERENCE_LIMIT
      : ADVANCED_SEEDANCE_REFERENCE_LIMIT;
    const allowedTypes = new Set(advancedAssetTargetItems().map((target) => target.type));
    try {
      let skippedWrongType = false;
      let skippedTooLarge = false;
      let skippedTooMany = false;
      for (const file of files) {
        const mime = String(file.type || "").toLowerCase();
        if (mime.startsWith("image/")) {
          if (!allowedTypes.has("image")) {
            skippedWrongType = true;
            continue;
          }
          if (file.size > ADVANCED_SEEDANCE_REFERENCE_MAX_BYTES) {
            skippedTooLarge = true;
            continue;
          }
          const existingImages = localCharacterUpload ? [] : (Array.isArray(state.advancedReferenceImages) ? state.advancedReferenceImages : []);
          if (!localCharacterUpload && existingImages.length >= imageLimit) {
            skippedTooMany = true;
            continue;
          }
          const ref = await uploadAdvancedImageReference(file, { provider });
          if (!ref) continue;
          state.advancedReferenceImages = localCharacterUpload ? [ref] : dedupeAdvancedReferenceImages([...existingImages, ref]).slice(0, imageLimit);
          if (localCharacterUpload) setAdvancedLocalCharacterPreset(ref);
          state.advancedUploadDataUrl = state.advancedReferenceImages[0]?.dataUrl || "";
          state.advancedSourceImageAssetId = "";
          if (!seedanceModeNeedsFirstFrame(els.advancedSeedanceMediaMode?.value || "")) {
            state.advancedFirstFrameAssetId = "";
            state.advancedSeedanceFirstFrameAssetId = "";
          }
          if (localCharacterUpload) break;
        } else if (!localCharacterUpload && mime.startsWith("video/")) {
          if (!allowedTypes.has("video")) {
            skippedWrongType = true;
            continue;
          }
          if (advancedSeedanceVideoReferences().length >= advancedVideoReferenceLimit(provider)) {
            skippedTooMany = true;
            continue;
          }
          await uploadAdvancedMediaReference(file, "video");
        } else if (!localCharacterUpload && mime.startsWith("audio/")) {
          if (!allowedTypes.has("audio")) {
            skippedWrongType = true;
            continue;
          }
          if (advancedSeedanceAudioReferences().length >= advancedAudioReferenceLimit(provider)) {
            skippedTooMany = true;
            continue;
          }
          await uploadAdvancedMediaReference(file, "audio");
        } else {
          skippedWrongType = true;
        }
      }
      if (skippedWrongType && els.advancedNote) {
        els.advancedNote.textContent = t("advanced.assetWrongType", { target: t("advanced.uploadReference"), type: "image / video / audio" });
      }
      if (skippedTooLarge && els.advancedNote) {
        els.advancedNote.textContent = t("advanced.referenceImageTooLarge");
      }
      if (skippedTooMany && els.advancedNote) {
        els.advancedNote.textContent = t("advanced.referenceMediaTooMany", {}, "Too many reference media files.");
      }
      if (!seedanceModeNeedsFirstFrame(els.advancedSeedanceMediaMode?.value || "")) syncSeedanceReferenceMode();
      state.activeAdvancedCaseId = "";
      renderAdvancedPresetBuilder();
      updateAdvancedModelControls();
      updateAdvancedButtonCost();
    } catch (error) {
      if (els.advancedNote) els.advancedNote.textContent = error.message || String(error);
    } finally {
      if (localCharacterUpload) state.advancedLocalUploadSlot = "";
      els.advancedImage.value = "";
    }
    return;
  }
  if (provider === "wan27" || provider === "happyhorse") {
    try {
      const capability = currentAdvancedVideoCapability();
      const allowedTypes = new Set(advancedAssetTargetItems().map((target) => target.type));
      const imageLimit = advancedAliyunReferenceImageLimit(capability);
      const referenceImageMode = ["wan27-i2v", "wan27-r2v", "wan27-video-edit", "happyhorse-r2v", "happyhorse-video-edit"].includes(capability)
        || (capability === "wan-legacy" && /r2v|vace/.test(String(els.advancedLegacyWanModel?.value || "")));
      let skippedWrongType = false;
      let skippedTooLarge = false;
      let skippedTooMany = false;
      let skippedDurationMessage = "";
      for (const file of files) {
        const mime = String(file.type || "").toLowerCase();
        if (mime.startsWith("image/")) {
          if (!allowedTypes.has("image")) {
            skippedWrongType = true;
            continue;
          }
          if (file.size > ADVANCED_SEEDANCE_REFERENCE_MAX_BYTES) {
            skippedTooLarge = true;
            continue;
          }
          const ref = await uploadAdvancedImageReference(file, { provider });
          if (!ref) continue;
          state.advancedReferenceImages = referenceImageMode
            ? dedupeAdvancedReferenceImages([...(state.advancedReferenceImages || []), ref]).slice(0, imageLimit)
            : [ref];
          state.advancedUploadDataUrl = state.advancedReferenceImages[0]?.dataUrl || ref.dataUrl || "";
          state.advancedFirstFrameAssetId = "";
          state.advancedSourceImageAssetId = "";
        } else if (mime.startsWith("video/")) {
          if (!allowedTypes.has("video")) {
            skippedWrongType = true;
            continue;
          }
          if (advancedSeedanceVideoReferences().length >= advancedVideoReferenceLimit(provider)) {
            skippedTooMany = true;
            continue;
          }
          await uploadAdvancedMediaReference(file, "video");
        } else if (mime.startsWith("audio/")) {
          if (!allowedTypes.has("audio")) {
            skippedWrongType = true;
            continue;
          }
          if (advancedSeedanceAudioReferences().length >= advancedAudioReferenceLimit(provider)) {
            skippedTooMany = true;
            continue;
          }
          await uploadAdvancedMediaReference(file, "audio");
        } else {
          skippedWrongType = true;
        }
      }
      if (skippedWrongType && els.advancedNote) {
        els.advancedNote.textContent = t("advanced.assetWrongType", { target: t("advanced.uploadReference"), type: "image / video / audio" });
      }
      if (skippedTooLarge && els.advancedNote) {
        els.advancedNote.textContent = t("advanced.referenceMediaTooMany", {}, "Some media files are too large.");
      }
      if (skippedTooMany && els.advancedNote) {
        els.advancedNote.textContent = t("advanced.referenceMediaTooMany", {}, "Too many reference media files.");
      }
      if (skippedDurationMessage && els.advancedNote) {
        els.advancedNote.textContent = skippedDurationMessage;
      }
      state.activeAdvancedCaseId = "";
      renderAdvancedPresetBuilder();
      updateAdvancedModelControls();
      updateAdvancedButtonCost();
    } catch (error) {
      if (els.advancedNote) els.advancedNote.textContent = error.message || String(error);
    } finally {
      els.advancedImage.value = "";
    }
    return;
  }
  const firstFile = files[0];
  const firstFileIsVideo = String(firstFile.type || "").startsWith("video/");
  const firstFileIsImage = String(firstFile.type || "").startsWith("image/");
  const uploadIsVideo = advancedCreateUploadIsVideo();
  if (uploadIsVideo && firstFileIsVideo) {
    try {
      if (state.advancedCreateMode === "video-extend") {
        await captureAdvancedExtendFrameFromSource(firstFile, `${firstFile.name || "video"}-last-frame.jpg`);
      } else {
        await uploadAdvancedVideoReference(firstFile);
      }
    } catch (error) {
      if (els.advancedNote) els.advancedNote.textContent = error.message || String(error);
    } finally {
      els.advancedImage.value = "";
    }
    return;
  }
  if (uploadIsVideo) {
    els.advancedImage.value = "";
    if (els.advancedNote) els.advancedNote.textContent = t("advanced.seedanceVideoRequired");
    updateAdvancedModelControls();
    return;
  }
  if (!firstFileIsImage) {
    els.advancedImage.value = "";
    if (els.advancedNote) els.advancedNote.textContent = t("advanced.seedanceFirstRequired");
    updateAdvancedModelControls();
    return;
  }
  if (files.some((file) => file.size > ADVANCED_SEEDANCE_REFERENCE_MAX_BYTES)) {
    els.advancedImage.value = "";
    if (els.advancedNote) els.advancedNote.textContent = t("advanced.referenceImageTooLarge");
    updateAdvancedModelControls();
    return;
  }
  if (provider === "wan27-image-edit") {
    let existing = Array.isArray(state.advancedReferenceImages) ? state.advancedReferenceImages : [];
    const seedanceMode = normalizeSeedanceMediaMode(els.advancedSeedanceMediaMode?.value || "reference_video");
    const localCharacterUpload = provider === "seedance" && state.advancedCreateKind !== "custom" && advancedCreateModeUsesCharacterPresetReference();
    const limit = provider === "wan27-image-edit"
      ? (advancedCreateModeUsesSingleUpload() ? 1 : ADVANCED_SEEDANCE_REFERENCE_LIMIT)
      : (advancedCreateModeUsesSingleUpload() || seedanceModeNeedsFirstFrame(seedanceMode) || advancedCreateModeNeedsReplacePair()) ? 1 : ADVANCED_SEEDANCE_REFERENCE_LIMIT;
    if (limit === 1 || localCharacterUpload) existing = [];
    const roomLeft = Math.max(0, limit - existing.length);
    if (!roomLeft) {
      els.advancedImage.value = "";
      if (els.advancedNote) els.advancedNote.textContent = t("advanced.referenceImageTooMany", { count: limit });
      updateAdvancedModelControls();
      return;
    }
    const selectedFiles = files.slice(0, roomLeft);
    const addedImages = [];
    try {
      for (const file of selectedFiles) {
        const ref = await uploadAdvancedImageReference(file, { provider });
        if (ref) addedImages.push(ref);
      }
    } catch (error) {
      els.advancedImage.value = "";
      if (els.advancedNote) els.advancedNote.textContent = error.message || String(error);
      updateAdvancedModelControls();
      return;
    }
    state.advancedSourceImageAssetId = "";
    state.advancedFirstFrameAssetId = "";
    state.advancedReferenceImages = dedupeAdvancedReferenceImages([...existing, ...addedImages]).slice(0, limit);
    if (provider === "wan27-image-edit") {
      state.advancedSourceImageAssetId = state.advancedReferenceImages[0]?.assetId || "";
    } else {
      state.advancedFirstFrameAssetId = state.advancedReferenceImages[0]?.assetId || "";
    }
    if (localCharacterUpload) setAdvancedLocalCharacterPreset(state.advancedReferenceImages[0] || {});
    state.advancedUploadDataUrl = state.advancedReferenceImages[0]?.dataUrl || "";
    if (!advancedCreateModeNeedsReplacePair()) {
      state.advancedSeedanceVideoAssetId = "";
      state.advancedSeedanceVideoPreviewUrl = "";
    }
    state.advancedWanClipAssetId = "";
    els.advancedImage.value = "";
    if (advancedCreateModeNeedsReplacePair()) state.advancedAssetTarget = "primary";
    if (files.length > selectedFiles.length && els.advancedNote) {
      els.advancedNote.textContent = t("advanced.referenceImageTooMany", { count: limit });
    }
    renderAdvancedPresetBuilder();
    updateAdvancedModelControls();
    return;
  }
  const selectedFile = files[0];
  state.advancedSourceImageAssetId = "";
  state.advancedFirstFrameAssetId = "";
  let selectedReference = null;
  try {
    selectedReference = await uploadAdvancedImageReference(selectedFile, { provider });
  } catch (error) {
    els.advancedImage.value = "";
    if (els.advancedNote) els.advancedNote.textContent = error.message || String(error);
    updateAdvancedModelControls();
    return;
  }
  if (!selectedReference) return;
  state.advancedReferenceImages = [selectedReference];
  state.advancedUploadDataUrl = state.advancedReferenceImages[0]?.dataUrl || "";
  state.advancedSeedanceVideoAssetId = "";
  state.advancedSeedanceVideoPreviewUrl = "";
  state.advancedWanClipAssetId = "";
  els.advancedImage.value = "";
  updateAdvancedModelControls();
});
els.advancedSeedanceFirstFrame?.addEventListener("change", async () => {
  const file = els.advancedSeedanceFirstFrame.files?.[0];
  if (!file) return;
  if (file.size > ADVANCED_SEEDANCE_REFERENCE_MAX_BYTES || !String(file.type || "").startsWith("image/")) {
    els.advancedSeedanceFirstFrame.value = "";
    if (els.advancedNote) els.advancedNote.textContent = t("advanced.referenceImageTooLarge");
    updateAdvancedModelControls();
    return;
  }
  try {
    const ref = await uploadAdvancedImageReference(file);
    if (!ref) return;
    state.advancedSeedanceFirstFrameDataUrl = ref.dataUrl;
    state.advancedSeedanceFirstFrameAssetId = ref.assetId;
    state.advancedFirstFrameAssetId = ref.assetId;
  } catch (error) {
    els.advancedSeedanceFirstFrame.value = "";
    if (els.advancedNote) els.advancedNote.textContent = error.message || String(error);
    updateAdvancedModelControls();
    return;
  }
  state.advancedUploadDataUrl = state.advancedSeedanceFirstFrameDataUrl;
  els.advancedSeedanceFirstFrame.value = "";
  updateAdvancedModelControls();
});
els.advancedSeedanceLastFrame?.addEventListener("change", async () => {
  const file = els.advancedSeedanceLastFrame.files?.[0];
  if (!file) return;
  if (file.size > ADVANCED_SEEDANCE_REFERENCE_MAX_BYTES) {
    els.advancedSeedanceLastFrame.value = "";
    if (els.advancedNote) els.advancedNote.textContent = t("advanced.referenceImageTooLarge");
    updateAdvancedModelControls();
    return;
  }
  try {
    const ref = await uploadAdvancedImageReference(file);
    if (!ref) return;
    state.advancedSeedanceLastFrameDataUrl = ref.dataUrl;
    state.advancedSeedanceLastFrameAssetId = ref.assetId;
  } catch (error) {
    els.advancedSeedanceLastFrame.value = "";
    if (els.advancedNote) els.advancedNote.textContent = error.message || String(error);
    updateAdvancedModelControls();
    return;
  }
  els.advancedSeedanceLastFrame.value = "";
  updateAdvancedModelControls();
});
els.advancedWanFirstFrame?.addEventListener("change", async () => {
  const file = els.advancedWanFirstFrame.files?.[0];
  if (!file) return;
  if (file.size > ADVANCED_SEEDANCE_REFERENCE_MAX_BYTES || !String(file.type || "").startsWith("image/")) {
    els.advancedWanFirstFrame.value = "";
    if (els.advancedNote) els.advancedNote.textContent = t("advanced.referenceImageTooLarge");
    updateAdvancedModelControls();
    return;
  }
  let ref = null;
  try {
    ref = await uploadAdvancedImageReference(file);
  } catch (error) {
    els.advancedWanFirstFrame.value = "";
    if (els.advancedNote) els.advancedNote.textContent = error.message || String(error);
    updateAdvancedModelControls();
    return;
  }
  if (!ref) return;
  state.advancedReferenceImages = [ref];
  state.advancedUploadDataUrl = ref.dataUrl;
  state.advancedFirstFrameAssetId = ref.assetId;
  state.advancedSourceImageAssetId = "";
  state.activeAdvancedCaseId = "";
  els.advancedWanFirstFrame.value = "";
  updateAdvancedModelControls();
});
els.advancedSeedanceVideoUrls?.addEventListener("input", () => {
  updateAdvancedReferenceSummary();
  updateAdvancedButtonCost();
});
els.advancedSeedanceAudioUrls?.addEventListener("input", () => {
  updateAdvancedReferenceSummary();
  updateAdvancedButtonCost();
});
els.advancedSeedanceGenerateAudio?.addEventListener("change", () => {
  state.advancedSeedanceGenerateAudio = els.advancedSeedanceGenerateAudio.value !== "false";
  updateAdvancedButtonCost();
});
els.advancedWanLastFrame?.addEventListener("change", async () => {
  const file = els.advancedWanLastFrame.files?.[0];
  if (!file) return;
  if (file.size > 20 * 1024 * 1024) {
    state.advancedWanLastFrameDataUrl = "";
    state.advancedWanLastFrameAssetId = "";
    els.advancedWanLastFrame.value = "";
    els.advancedWanLastFramePreview?.removeAttribute("src");
    els.advancedWanLastFramePreview?.classList.remove("is-visible");
    els.advancedWanLastFrame?.closest(".wan-frame-upload")?.classList.remove("has-image");
    if (els.advancedNote) els.advancedNote.textContent = "Last frame image must be 20MB or smaller.";
    return;
  }
  try {
    const ref = await uploadAdvancedImageReference(file);
    if (!ref) return;
    state.advancedWanLastFrameDataUrl = ref.dataUrl;
    state.advancedWanLastFrameAssetId = ref.assetId;
  } catch (error) {
    state.advancedWanLastFrameDataUrl = "";
    state.advancedWanLastFrameAssetId = "";
    els.advancedWanLastFrame.value = "";
    if (els.advancedNote) els.advancedNote.textContent = error.message || String(error);
    updateAdvancedModelControls();
    return;
  }
  if (els.advancedWanLastFramePreview) {
    els.advancedWanLastFramePreview.src = state.advancedWanLastFrameDataUrl;
    els.advancedWanLastFramePreview.classList.add("is-visible");
    els.advancedWanLastFrame.closest(".wan-frame-upload")?.classList.add("has-image");
  }
  updateAdvancedModelControls();
});
els.advancedWanClipFile?.addEventListener("change", async () => {
  const file = els.advancedWanClipFile.files?.[0];
  if (!file) return;
  if (file.size > ADVANCED_WAN_CLIP_MAX_BYTES) {
    state.advancedWanClipDataUrl = "";
    state.advancedWanClipFileName = "";
    state.advancedWanClipAssetId = "";
    state.advancedWanClipDurationSeconds = 0;
    state.advancedWanClipOrder = 0;
    els.advancedWanClipFile.value = "";
    els.advancedWanClipPreview?.removeAttribute("src");
    els.advancedWanClipPreview?.classList.remove("is-visible");
    els.advancedWanClipFile?.closest(".wan-frame-upload")?.classList.remove("has-image");
    if (els.advancedNote) els.advancedNote.textContent = t("advanced.clipTooLarge");
    return;
  }
  const clipDuration = await readVideoDuration(file).catch(() => 0);
  if (!clipDuration || clipDuration > ADVANCED_WAN_CLIP_MAX_SECONDS) {
    state.advancedWanClipDataUrl = "";
    state.advancedWanClipFileName = "";
    state.advancedWanClipAssetId = "";
    state.advancedWanClipDurationSeconds = 0;
    state.advancedWanClipOrder = 0;
    els.advancedWanClipFile.value = "";
    els.advancedWanClipPreview?.removeAttribute("src");
    els.advancedWanClipPreview?.classList.remove("is-visible");
    els.advancedWanClipFile?.closest(".wan-frame-upload")?.classList.remove("has-image");
    if (els.advancedNote) els.advancedNote.textContent = t("advanced.clipTooLong");
    return;
  }
  state.advancedWanClipDataUrl = await readFileAsDataUrl(file);
  state.advancedWanClipFileName = file.name || "";
  state.advancedWanClipAssetId = "";
  state.advancedWanClipDurationSeconds = clipDuration;
  state.advancedWanClipOrder = nextAdvancedReferenceOrder();
  if (els.advancedWanClipPreview) {
    els.advancedWanClipPreview.src = state.advancedWanClipDataUrl;
    els.advancedWanClipPreview.classList.add("is-visible");
    els.advancedWanClipFile.closest(".wan-frame-upload")?.classList.add("has-image");
  }
  updateAdvancedModelControls();
});
els.submitTemplateBtn?.addEventListener("click", submitTemplate);
els.refreshAssetsBtn?.addEventListener("click", () => loadUserAssets(state.userAssetsPage || 1));
els.refreshAdvancedAssetsBtn?.addEventListener("click", () => loadAdvancedAssets(state.advancedAssetPage || 1));
els.advancedSideTabs?.querySelectorAll("[data-advanced-side-tab]").forEach((button) => {
  button.addEventListener("click", () => setAdvancedSideTab(button.dataset.advancedSideTab || "assets"));
});
els.advancedMobileTabs?.querySelectorAll("[data-advanced-mobile-tab]").forEach((button) => {
  button.addEventListener("click", () => setAdvancedMobileTab(button.dataset.advancedMobileTab || "create"));
});
els.refreshAdvancedResultBtn?.addEventListener("click", () => refreshAdvancedResultRecord());
els.workflowRoot?.addEventListener("click", handleWorkflowClick);
els.workflowRoot?.addEventListener("pointerdown", handleWorkflowPointerDown);
els.workflowRoot?.addEventListener("wheel", handleWorkflowWheel, { passive: false });
els.workflowRoot?.addEventListener("scroll", handleWorkflowCanvasScroll, { capture: true, passive: true });
els.workflowRoot?.addEventListener("input", handleWorkflowInput);
els.workflowRoot?.addEventListener("change", (event) => {
  const input = event.target.closest("[data-workflow-file]");
  if (input) {
    handleWorkflowFileInput(input).catch((error) => {
      state.workflowMessage = error.message || String(error);
      renderWorkflowPanel();
    });
    return;
  }
  handleWorkflowInput(event);
});
document.addEventListener("pointermove", handleWorkflowPointerMove);
document.addEventListener("pointerup", handleWorkflowPointerUp);
document.addEventListener("pointercancel", handleWorkflowPointerCancel);
els.advancedCreateKindTabs?.addEventListener("click", (event) => {
  const button = event.target.closest("[data-advanced-create-kind]");
  if (!button) return;
  setAdvancedCreateKind(button.dataset.advancedCreateKind || "video");
});
els.advancedCreateModeTabs?.addEventListener("click", (event) => {
  const button = event.target.closest("[data-advanced-create-mode]");
  if (!button) return;
  setAdvancedCreateMode(button.dataset.advancedCreateMode || "");
});
els.advancedPrompt?.addEventListener("input", handleAdvancedPromptMentionInput);
els.advancedPrompt?.addEventListener("click", renderAdvancedPromptMentionMenu);
els.advancedPrompt?.addEventListener("keyup", (event) => {
  if (["ArrowDown", "ArrowUp", "Enter", "Tab", "Escape"].includes(event.key)) return;
  renderAdvancedPromptMentionMenu();
});
els.advancedPrompt?.addEventListener("keydown", handleAdvancedPromptMentionKeydown);
els.advancedPrompt?.addEventListener("blur", () => window.setTimeout(closeAdvancedPromptMentions, 120));
els.advancedPromptMentions?.addEventListener("pointerdown", handleAdvancedPromptMentionPointer);
els.advancedPrompt?.addEventListener("paste", (event) => {
  handleAdvancedPromptPaste(event).catch((error) => {
    if (els.advancedNote) els.advancedNote.textContent = error.message || String(error);
  });
});
document.addEventListener("pointerdown", (event) => {
  if (event.target.closest("#advancedPrompt, #advancedPromptMentions")) return;
  closeAdvancedPromptMentions();
});
window.addEventListener("resize", positionAdvancedPromptMentionMenu);
els.characterCreateBtn?.addEventListener("click", createCharacterFromPrompt);
els.assetSearch?.addEventListener("input", () => {
  window.clearTimeout(state.assetSearchTimer);
  state.assetSearchTimer = window.setTimeout(() => loadUserAssets(1), 250);
});
els.assetTypeFilter?.addEventListener("change", () => loadUserAssets(1));
els.assetUploadInput?.addEventListener("change", () => {
  updateFilePickerLabel(els.assetUploadInput);
  uploadUserAssets(els.assetUploadInput.files);
});
els.advancedAssetSearch?.addEventListener("input", () => {
  window.clearTimeout(state.advancedAssetSearchTimer);
  state.advancedAssetSearchTimer = window.setTimeout(() => loadAdvancedAssets(1), 250);
});
els.advancedAssetTypeFilter?.addEventListener("change", () => loadAdvancedAssets(1));
els.advancedAssetUploadInput?.addEventListener("change", () => {
  updateFilePickerLabel(els.advancedAssetUploadInput);
  uploadAdvancedAssets(els.advancedAssetUploadInput.files);
});
els.topupFilters?.addEventListener("submit", (event) => {
  event.preventDefault();
  loadTopupRecords(1);
});
els.spendingFilters?.addEventListener("submit", (event) => {
  event.preventDefault();
  loadSpendingRecords(1);
});
els.exportTopupsBtn?.addEventListener("click", () => exportLedger("topups"));
els.exportSpendingBtn?.addEventListener("click", () => exportLedger("spending"));
async function copyReferralText(value = "") {
  const text = String(value || "").trim();
  if (!text) return false;
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Safari can reject Clipboard API writes even after a direct button click.
  }
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.readOnly = true;
  textarea.style.position = "fixed";
  textarea.style.inset = "0 auto auto -9999px";
  textarea.style.fontSize = "16px";
  document.body.appendChild(textarea);
  textarea.select();
  textarea.setSelectionRange(0, textarea.value.length);
  const copied = document.execCommand("copy");
  textarea.remove();
  return copied;
}

els.copyReferralBtn?.addEventListener("click", async () => {
  if (!state.user) return openLogin();
  if (!state.referral?.inviteUrl) await loadReferralSummary({ force: true });
  const inviteUrl = state.referral?.inviteUrl || "";
  if (!inviteUrl) {
    if (els.referralNote) els.referralNote.textContent = t("referral.copyFailed");
    return;
  }
  const copied = await copyReferralText(inviteUrl);
  if (els.referralNote) els.referralNote.textContent = copied ? t("referral.linkCopied") : t("referral.copyFailed");
});
document.querySelectorAll("[data-legal-doc]").forEach((button) => {
  button.addEventListener("click", () => openLegalDialog(button.dataset.legalDoc || "privacy"));
});
els.topupMethodTabs?.querySelectorAll("[data-topup-method]").forEach((button) => {
  button.addEventListener("click", () => setTopupMethod(button.dataset.topupMethod || "paypal"));
});
els.topupBackBtn?.addEventListener("click", handleTopupBack);
els.createTopupBtn?.addEventListener("click", createTopupOrder);
function openTopupDialog() {
  prepareModalOpen();
  state.selectedBillingPlanId = "";
  setTopupStep("packages");
  setTopupMethod("paypal");
  renderTopupSummary();
  if (!els.topupDialog?.open) els.topupDialog?.showModal();
  syncTopupAutoRefresh();
  refreshIcons();
}

const TOOL_ANDROID_APK_URL = "/downloads/123tops-video.apk";
const TOOL_IOS_PROFILE_URL = "/downloads/123tops-video.mobileconfig";

function toolInstallPlatform() {
  const userAgent = String(navigator.userAgent || "");
  const platform = String(navigator.platform || "");
  if (/android/i.test(userAgent)) return "android";
  if (/iPad|iPhone|iPod/i.test(userAgent) || (platform === "MacIntel" && Number(navigator.maxTouchPoints || 0) > 1)) return "ios";
  return "desktop";
}

function openToolDownload() {
  if (!tenantFeature("toolOnly", false)) return;
  closeAccountMenu();
  closeMobileDrawer();
  const platform = toolInstallPlatform();
  trackAnalyticsEvent("tool_install_click", { event_location: "header", platform });
  if (platform === "android") {
    window.location.assign(TOOL_ANDROID_APK_URL);
    return;
  }
  if (platform === "ios") {
    window.location.assign(TOOL_IOS_PROFILE_URL);
    return;
  }
  if (!els.toolDownloadDialog?.open) els.toolDownloadDialog?.showModal();
  refreshIcons();
}

els.topupHeadBtn?.addEventListener("click", openTopupDialog);
els.toolDownloadBtn?.addEventListener("click", openToolDownload);
els.mobileToolDownloadBtn?.addEventListener("click", openToolDownload);
els.topupTriggerBtn?.addEventListener("click", openTopupDialog);
els.topupQrDialog?.addEventListener("close", syncTopupAutoRefresh);
els.previewDialog?.addEventListener("close", () => {
  if (!els.previewVideo) return;
  els.previewVideo.pause();
  els.previewVideo.preload = "none";
  els.previewVideo.removeAttribute("src");
  els.previewVideo.removeAttribute("poster");
  els.previewVideo.removeAttribute("style");
  els.previewVideo.load();
});
els.advancedSubmitBtn?.addEventListener("click", submitAdvancedGenerate);
els.advancedPresetSearch?.addEventListener("input", () => {
  state.advancedPresetSearch = els.advancedPresetSearch.value || "";
  renderAdvancedPresetDialog();
});
els.advancedPresetGrid?.addEventListener("click", (event) => {
  const button = event.target.closest("[data-advanced-preset-load-more]");
  if (!button) return;
  event.preventDefault();
  loadMoreAdvancedPresetCharacters().catch((error) => console.warn("load more preset characters failed", error.message || error));
});
els.advancedPresetDialog?.addEventListener("close", () => {
  state.advancedPresetDialogSlot = "";
  state.advancedPresetSearch = "";
  if (els.advancedPresetSearch) els.advancedPresetSearch.value = "";
});
function handleAdvancedDurationSelection() {
  syncAdvancedVideoSettingsControls();
  updateAdvancedButtonCost();
}
els.advancedDuration?.addEventListener("input", handleAdvancedDurationSelection);
// iOS Safari reliably emits change, but not input, for native select pickers.
els.advancedDuration?.addEventListener("change", handleAdvancedDurationSelection);
els.advancedProvider?.addEventListener("change", () => {
  state.advancedAssetTarget = "primary";
  if (["seedance25", "seedance-nsfw"].includes(currentAdvancedProvider())) {
    syncAdvancedSeedanceModeOptions(currentAdvancedProvider());
    if (els.advancedSeedanceMediaMode) els.advancedSeedanceMediaMode.value = "omini";
    if (els.advancedRatio) els.advancedRatio.value = currentAdvancedProvider() === "seedance25" ? "16:9" : "1:1";
    if (els.advancedResolution) els.advancedResolution.value = "480p";
    if (els.advancedDuration) els.advancedDuration.value = "4";
    state.advancedAssetTarget = "referenceImages";
  }
  if (currentAdvancedProvider() === "wan30") {
    if (els.advancedSeedanceMediaMode) els.advancedSeedanceMediaMode.value = "reference_video";
    if (els.advancedRatio) els.advancedRatio.value = "adaptive";
    if (els.advancedResolution) els.advancedResolution.value = "1080p";
    if (els.advancedDuration) els.advancedDuration.value = "5";
    if (els.advancedSeedanceGenerateAudio) els.advancedSeedanceGenerateAudio.value = "true";
  }
  if (currentAdvancedProvider() === "qwen-image3") {
    if (els.advancedRatio) els.advancedRatio.value = "1:1";
    if (els.advancedResolution) els.advancedResolution.value = "2K";
    if (els.advancedDuration) els.advancedDuration.value = "1";
    state.advancedAssetTarget = "referenceImages";
  }
  syncAdvancedVideoCapabilityOptions();
  updateAdvancedModelControls();
  updateAdvancedButtonCost();
});
els.advancedVideoCapability?.addEventListener("change", () => {
  state.advancedAssetTarget = "primary";
  updateAdvancedModelControls();
  updateAdvancedButtonCost();
});
els.advancedSeedanceTier?.addEventListener("change", () => {
  updateAdvancedModelControls();
});
els.advancedSeedreamTier?.addEventListener("change", () => {
  updateAdvancedModelControls();
});
[els.advancedQwenTier, els.advancedQwenOutputCount, els.advancedQwenPromptExtend, els.advancedQwenWatermark].forEach((control) => {
  control?.addEventListener("change", () => {
    state.advancedEstimateKey = "";
    updateAdvancedButtonCost();
  });
});
[els.advancedQwen37Thinking, els.advancedQwen37MaxTokens, els.advancedQwen37Temperature].forEach((control) => {
  control?.addEventListener("change", () => {
    state.advancedEstimateKey = "";
    updateAdvancedButtonCost();
  });
});
els.advancedWanMediaMode?.addEventListener("change", () => {
  state.advancedAssetTarget = "primary";
  updateAdvancedModelControls();
});
els.advancedLegacyWanModel?.addEventListener("change", () => {
  state.advancedAssetTarget = "primary";
  updateAdvancedModelControls();
  updateAdvancedButtonCost();
});
els.advancedWanAnimateMode?.addEventListener("change", updateAdvancedButtonCost);
els.advancedSeedanceMediaMode?.addEventListener("change", () => {
  const seedanceMode = normalizeSeedanceMediaMode(els.advancedSeedanceMediaMode?.value || "");
  const provider = currentAdvancedProvider();
  if (["seedance25", "seedance-nsfw"].includes(provider)) {
    const previousPromptRefs = advancedPromptMentionSnapshot();
    if (seedanceModeNeedsFirstFrame(seedanceMode)) {
      state.advancedReferenceImages = [];
      setAdvancedSeedanceVideoReferences([]);
      setAdvancedSeedanceAudioReferences([]);
    } else if (provider === "seedance-nsfw" && ["edit", "extend"].includes(seedanceMode)) {
      state.advancedReferenceImages = [];
      setAdvancedSeedanceVideoReferences(advancedSeedanceVideoReferences().slice(0, 1));
      setAdvancedSeedanceAudioReferences([]);
      state.advancedSeedanceFirstFrameAssetId = "";
      state.advancedSeedanceFirstFrameDataUrl = "";
      state.advancedSeedanceLastFrameAssetId = "";
      state.advancedSeedanceLastFrameDataUrl = "";
    } else {
      state.advancedSeedanceFirstFrameAssetId = "";
      state.advancedSeedanceFirstFrameDataUrl = "";
      state.advancedSeedanceLastFrameAssetId = "";
      state.advancedSeedanceLastFrameDataUrl = "";
    }
    syncAdvancedPromptMentionLabels(previousPromptRefs);
    if (els.advancedRatio) {
      els.advancedRatio.value = provider === "seedance25"
        ? "16:9"
        : seedanceMode === "omini" ? "1:1" : "adaptive";
    }
  }
  state.advancedAssetTarget = seedanceModeNeedsFirstFrame(seedanceMode)
    ? "primary"
    : provider === "seedance-nsfw" && ["edit", "extend"].includes(seedanceMode)
    ? "video"
    : "referenceImages";
  updateAdvancedModelControls();
  updateAdvancedButtonCost();
});
els.advancedRatio?.addEventListener("change", updateAdvancedButtonCost);
els.advancedResolution?.addEventListener("change", () => {
  updateAdvancedModelControls();
  updateAdvancedButtonCost();
});
els.advancedVideoResolutionChoices?.addEventListener("click", (event) => {
  const button = event.target.closest("[data-advanced-video-resolution]");
  if (!button || !els.advancedResolution) return;
  els.advancedResolution.value = button.dataset.advancedVideoResolution || "480p";
  updateAdvancedModelControls();
});
els.advancedVideoDurationChoices?.addEventListener("click", (event) => {
  const button = event.target.closest("[data-advanced-video-duration]");
  if (!button || !els.advancedDuration) return;
  els.advancedDuration.value = button.dataset.advancedVideoDuration || "4";
  syncAdvancedVideoSettingsControls();
  updateAdvancedButtonCost();
});
els.advancedPreprocessReference?.addEventListener("change", updateAdvancedModelControls);
els.advancedUploadBox?.addEventListener("click", () => {
  if (!advancedCreateModeAllowsManualReferenceUpload()) return;
  const provider = currentAdvancedProvider();
  const seedanceMode = normalizeSeedanceMediaMode(els.advancedSeedanceMediaMode?.value || "");
  const aliyunSharedTarget = ["wan30", "wan27", "happyhorse"].includes(provider)
    ? (advancedAssetTargetItems().find((target) => target.type === "image")?.id || advancedAssetTargetItems()[0]?.id || "primary")
    : "";
  setAdvancedAssetTarget(provider === "wan27-image-edit"
    ? "sourceImages"
    : ["seedream5-image", "qwen-image3"].includes(provider)
    ? "referenceImages"
    : provider === "seedance-nsfw" && ["edit", "extend"].includes(seedanceMode)
    ? "video"
    : ["seedance", "seedance25", "seedance-nsfw", "wan30"].includes(provider) && !seedanceModeNeedsFirstFrame(seedanceMode)
    ? "referenceImages"
    : aliyunSharedTarget || (advancedCreateUploadIsVideo() ? "video" : "primary"));
});
document.querySelectorAll("[data-remove-advanced-slot]").forEach((button) => {
  button.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    removeAdvancedMediaSlot(button.dataset.removeAdvancedSlot || "");
  });
});
els.advancedSeedanceLastFrame?.closest(".wan-frame-upload")?.addEventListener("click", () => setAdvancedAssetTarget("lastFrame"));
els.advancedSeedanceFirstFrame?.closest(".wan-frame-upload")?.addEventListener("click", () => setAdvancedAssetTarget("primary"));
els.advancedWanFirstFrame?.closest(".wan-frame-upload")?.addEventListener("click", () => setAdvancedAssetTarget("primary"));
els.advancedWanLastFrame?.closest(".wan-frame-upload")?.addEventListener("click", () => setAdvancedAssetTarget("lastFrame"));
els.advancedWanClipFile?.closest(".wan-frame-upload")?.addEventListener("click", () => setAdvancedAssetTarget("video"));
els.advancedWanAudioUrl?.addEventListener("input", updateAdvancedButtonCost);
els.advancedWanClipUrl?.addEventListener("input", updateAdvancedButtonCost);
els.advancedWanAudioUrl?.addEventListener("focus", () => setAdvancedAssetTarget("audio"));
els.advancedSeedanceVideoUrls?.addEventListener("focus", () => setAdvancedAssetTarget("video"));
els.advancedSeedanceAudioUrls?.addEventListener("focus", () => setAdvancedAssetTarget("audio"));
els.accountMenuBtn?.addEventListener("click", () => {
  toggleAccountMenu();
});
document.addEventListener("click", (event) => {
  if (!els.accountMenu || els.accountMenu.hidden) return;
  if (els.accountMenu.contains(event.target) || els.accountMenuBtn?.contains(event.target)) return;
  closeAccountMenu();
});
document.addEventListener("visibilitychange", syncTopupAutoRefresh);
els.loginForm?.addEventListener("submit", (event) => {
  event.preventDefault();
  if (event.submitter?.value === "cancel") {
    els.loginDialog?.close("cancel");
    return;
  }
  submitLogin();
});
els.languageSelect?.addEventListener("change", () => setLanguage(els.languageSelect.value));
els.copyAccessBtn?.addEventListener("click", async () => {
  await navigator.clipboard.writeText(fullAccessCopy());
  els.copyAccessBtn.innerHTML = `<i data-lucide="check"></i>${escapeHtml(t("common.copied"))}`;
  refreshIcons();
  setTimeout(() => {
    els.copyAccessBtn.innerHTML = `<i data-lucide="clipboard"></i>${escapeHtml(t("access.copySnippet"))}`;
    refreshIcons();
  }, 1600);
});
els.toggleAccessTokenBtn?.addEventListener("click", () => {
  state.showAccessToken = !state.showAccessToken;
  renderAccessGuides();
});
els.copyTokenBtn?.addEventListener("click", async () => {
  if (!state.token || !state.user?.apiToken) return openLogin();
  const markdown = await tokenAccessPackageMarkdown();
  await navigator.clipboard.writeText(markdown);
  els.copyTokenBtn.innerHTML = `<i data-lucide="check"></i>Copied token + docs`;
  refreshIcons();
  setTimeout(() => {
    renderTokenDisplays();
    refreshIcons();
  }, 1600);
});
function openSupportDialog() {
  if (!state.user) return openLogin();
  prepareModalOpen();
  if (els.supportEmail) els.supportEmail.value = "";
  if (els.supportSubject) els.supportSubject.value = "";
  if (els.supportMessage) els.supportMessage.value = "";
  if (els.supportStatus) els.supportStatus.textContent = "";
  els.supportDialog?.showModal();
}

document.querySelectorAll("[data-analytics-event]").forEach((element) => {
  element.addEventListener("click", (event) => {
    trackAnalyticsEvent(element.dataset.analyticsEvent, {
      event_location: element.dataset.analyticsLocation || "platform",
    });
    closeMobileDrawer();
    const directUrl = String(element.dataset.directUrl || "").trim();
    if (directUrl) {
      event.preventDefault();
      window.open(directUrl, "_blank");
    }
  });
});
els.supportFab?.addEventListener("click", openSupportDialog);
els.supportNavBtn?.addEventListener("click", openSupportDialog);
els.supportSubmitBtn?.addEventListener("click", submitSupportMessage);
els.mobileDrawerTopupBtn?.addEventListener("click", () => {
  closeMobileDrawer();
  openTopupDialog();
});
els.mobileDrawerLoginBtn?.addEventListener("click", () => {
  closeMobileDrawer();
  openLogin();
});
els.menuCopyTokenBtn?.addEventListener("click", async () => {
  if (!state.token || !state.user?.apiToken) return openLogin();
  await navigator.clipboard.writeText(state.user.apiToken);
  closeAccountMenu();
});
els.menuLoginBtn?.addEventListener("click", () => {
  closeAccountMenu();
  openLogin();
});
els.toggleAccountTokenBtn?.addEventListener("click", () => {
  state.showAccountToken = !state.showAccountToken;
  renderTokenDisplays();
});
els.copyAccountTokenBtn?.addEventListener("click", async () => {
  if (!state.token || !state.user?.apiToken) return openLogin();
  await navigator.clipboard.writeText(state.user.apiToken);
  els.copyAccountTokenBtn.innerHTML = `<i data-lucide="check"></i>${escapeHtml(t("common.copied"))}`;
  refreshIcons();
  setTimeout(() => {
    els.copyAccountTokenBtn.innerHTML = `<i data-lucide="copy"></i>${escapeHtml(t("common.copyToken"))}`;
    refreshIcons();
  }, 1600);
});
els.logoutAccountBtn?.addEventListener("click", logout);
els.menuLogoutBtn?.addEventListener("click", logout);

applyLanguage();

startPlatform().catch((error) => {
  document.body.insertAdjacentHTML("beforeend", `<div class="job-note" style="position:fixed;left:20px;bottom:20px;background:#11182b;padding:14px 16px;border-radius:14px;">${escapeHtml(error.message)}</div>`);
});
