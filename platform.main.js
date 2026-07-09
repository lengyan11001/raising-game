async function startPlatform() {
  const allowed = await ensureAgeGate();
  if (!allowed) return;
  await bootstrap();
}

document.addEventListener("click", (event) => {
  const button = event.target.closest("[data-tab]");
  if (!button) return;
  state.routeCharacterId = "";
  state.routeCharacterSource = "";
  state.activeGalleryCharacterId = "";
  setTab(button.dataset.tab);
});
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
  if (provider === "seedance" || provider === "wan27-image-edit") {
    let existing = Array.isArray(state.advancedReferenceImages) ? state.advancedReferenceImages : [];
    if (provider === "seedance" && advancedCreateModeNeedsReplacePair() && els.advancedSeedanceMediaMode) {
      els.advancedSeedanceMediaMode.value = "reference_video";
    } else if (provider === "seedance" && advancedCreateModeUsesAutoPrompt() && els.advancedSeedanceMediaMode) {
      els.advancedSeedanceMediaMode.value = "first_frame";
    }
    const seedanceMode = normalizeSeedanceMediaMode(els.advancedSeedanceMediaMode?.value || "text_to_video");
    const limit = provider === "wan27-image-edit" ? ADVANCED_SEEDANCE_REFERENCE_LIMIT : (seedanceModeNeedsFirstFrame(seedanceMode) || advancedCreateModeNeedsReplacePair()) ? 1 : ADVANCED_SEEDANCE_REFERENCE_LIMIT;
    if (limit === 1) existing = [];
    const roomLeft = Math.max(0, limit - existing.length);
    if (!roomLeft) {
      els.advancedImage.value = "";
      if (els.advancedNote) els.advancedNote.textContent = t("advanced.referenceImageTooMany", { count: limit });
      updateAdvancedModelControls();
      return;
    }
    const selectedFiles = files.slice(0, roomLeft);
    const addedImages = await Promise.all(selectedFiles.map(async (file) => ({
      dataUrl: await readFileAsDataUrl(file),
      fileName: file.name || "",
    })));
    state.advancedSourceImageAssetId = "";
    state.advancedFirstFrameAssetId = "";
    state.advancedReferenceImages = dedupeAdvancedReferenceImages([...existing, ...addedImages]).slice(0, limit);
    if (provider === "wan27-image-edit") {
      state.advancedSourceImageAssetId = state.advancedReferenceImages[0]?.assetId || "";
    } else {
      state.advancedFirstFrameAssetId = state.advancedReferenceImages[0]?.assetId || "";
    }
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
    updateAdvancedModelControls();
    return;
  }
  const selectedFile = files[0];
  state.advancedSourceImageAssetId = "";
  state.advancedFirstFrameAssetId = "";
  state.advancedReferenceImages = [{
    dataUrl: await readFileAsDataUrl(selectedFile),
    fileName: selectedFile.name || "",
  }];
  state.advancedUploadDataUrl = state.advancedReferenceImages[0]?.dataUrl || "";
  state.advancedSeedanceVideoAssetId = "";
  state.advancedSeedanceVideoPreviewUrl = "";
  state.advancedWanClipAssetId = "";
  els.advancedImage.value = "";
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
  state.advancedSeedanceLastFrameDataUrl = await readFileAsDataUrl(file);
  state.advancedSeedanceLastFrameAssetId = "";
  els.advancedSeedanceLastFrame.value = "";
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
  state.advancedWanLastFrameDataUrl = await readFileAsDataUrl(file);
  state.advancedWanLastFrameAssetId = "";
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
  if (els.advancedWanClipPreview) {
    els.advancedWanClipPreview.src = state.advancedWanClipDataUrl;
    els.advancedWanClipPreview.classList.add("is-visible");
    els.advancedWanClipFile.closest(".wan-frame-upload")?.classList.add("has-image");
  }
  updateAdvancedModelControls();
});
els.submitTemplateBtn?.addEventListener("click", submitTemplate);
els.refreshHistoryBtn?.addEventListener("click", () => loadHistory({ refresh: true }));
els.refreshAssetsBtn?.addEventListener("click", () => loadUserAssets(state.userAssetsPage || 1));
els.refreshAdvancedAssetsBtn?.addEventListener("click", () => loadAdvancedAssets(state.advancedAssetPage || 1));
els.advancedSideTabs?.querySelectorAll("[data-advanced-side-tab]").forEach((button) => {
  button.addEventListener("click", () => setAdvancedSideTab(button.dataset.advancedSideTab || "assets"));
});
els.refreshAdvancedResultBtn?.addEventListener("click", () => refreshAdvancedResultRecord());
els.workflowRoot?.addEventListener("click", handleWorkflowClick);
els.workflowRoot?.addEventListener("pointerdown", handleWorkflowPointerDown);
els.workflowRoot?.addEventListener("wheel", handleWorkflowWheel, { passive: false });
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
els.advancedPrompt?.addEventListener("paste", (event) => {
  handleAdvancedPromptPaste(event).catch((error) => {
    if (els.advancedNote) els.advancedNote.textContent = error.message || String(error);
  });
});
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
els.copyReferralBtn?.addEventListener("click", async () => {
  if (!state.user) return openLogin();
  if (!state.referral?.inviteUrl) await loadReferralSummary();
  const inviteUrl = state.referral?.inviteUrl || "";
  if (!inviteUrl) return;
  await navigator.clipboard.writeText(inviteUrl);
  if (els.referralNote) els.referralNote.textContent = t("referral.linkCopied");
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
  closeAccountMenu();
  setTopupStep("packages");
  setTopupMethod("paypal");
  renderTopupSummary();
  if (!els.topupDialog?.open) els.topupDialog?.showModal();
  syncTopupAutoRefresh();
  refreshIcons();
}
els.topupHeadBtn?.addEventListener("click", openTopupDialog);
els.topupTriggerBtn?.addEventListener("click", openTopupDialog);
els.topupQrDialog?.addEventListener("close", syncTopupAutoRefresh);
els.previewDialog?.addEventListener("close", () => {
  if (!els.previewVideo) return;
  els.previewVideo.pause();
  els.previewVideo.removeAttribute("src");
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
els.advancedDuration?.addEventListener("input", () => {
  syncAdvancedVideoSettingsControls();
  updateAdvancedButtonCost();
});
els.advancedProvider?.addEventListener("change", () => {
  state.advancedAssetTarget = "primary";
  updateAdvancedModelControls();
});
els.advancedSeedanceTier?.addEventListener("change", () => {
  updateAdvancedModelControls();
});
els.advancedWanMediaMode?.addEventListener("change", () => {
  state.advancedAssetTarget = "primary";
  updateAdvancedModelControls();
});
els.advancedSeedanceMediaMode?.addEventListener("change", () => {
  const seedanceMode = normalizeSeedanceMediaMode(els.advancedSeedanceMediaMode?.value || "");
  state.advancedAssetTarget = seedanceMode === "reference_images" ? "referenceImages" : seedanceMode === "reference_video" && !advancedCreateModeNeedsReplacePair() ? "video" : "primary";
  updateAdvancedModelControls();
});
els.advancedRatio?.addEventListener("change", updateAdvancedButtonCost);
els.advancedResolution?.addEventListener("change", () => {
  syncAdvancedVideoSettingsControls();
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
  const provider = currentAdvancedProvider();
  const seedanceMode = normalizeSeedanceMediaMode(els.advancedSeedanceMediaMode?.value || "");
  setAdvancedAssetTarget(provider === "wan27-image-edit" ? "sourceImages" : advancedCreateUploadIsVideo() ? "video" : provider === "seedance" && seedanceMode === "reference_images" ? "referenceImages" : "primary");
});
document.querySelectorAll("[data-remove-advanced-slot]").forEach((button) => {
  button.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    removeAdvancedMediaSlot(button.dataset.removeAdvancedSlot || "");
  });
});
els.advancedSeedanceLastFrame?.closest(".wan-frame-upload")?.addEventListener("click", () => setAdvancedAssetTarget("lastFrame"));
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
els.toggleLoginMode?.addEventListener("click", () => {
  state.loginMode = state.loginMode === "login" ? "register" : "login";
  renderLoginMode();
});
els.loginSubmit?.addEventListener("click", submitLogin);
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
  await navigator.clipboard.writeText(tokenAccessPackageMarkdown());
  els.copyTokenBtn.innerHTML = `<i data-lucide="check"></i>Copied token + docs`;
  refreshIcons();
  setTimeout(() => {
    renderTokenDisplays();
    refreshIcons();
  }, 1600);
});
function openSupportDialog() {
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
    const directUrl = String(element.dataset.directUrl || "").trim();
    if (directUrl) {
      event.preventDefault();
      window.open(directUrl, "_blank");
    }
  });
});
els.supportFab?.addEventListener("click", openSupportDialog);
els.supportSubmitBtn?.addEventListener("click", submitSupportMessage);
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
