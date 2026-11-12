function ensureAdvancedReferenceOrders(images = state.advancedReferenceImages) {
  const list = Array.isArray(images) ? images : [];
  let maxOrder = Math.max(0, Number(state.advancedReferenceOrderCounter || 0));
  list.forEach((item) => {
    maxOrder = Math.max(maxOrder, advancedReferenceOrderValue(item));
  });
  list.forEach((item) => {
    if (!item || advancedReferenceOrderValue(item)) return;
    maxOrder += 1;
    item.order = maxOrder;
  });
  state.advancedReferenceOrderCounter = Math.max(Number(state.advancedReferenceOrderCounter || 0), maxOrder);
  return maxOrder;
}

function nextAdvancedReferenceOrder() {
  ensureAdvancedReferenceOrders();
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

async function uploadAdvancedMediaReference(file, kind = "video", options = {}) {
  if (!state.user) {
    openLogin();
    return null;
  }
  if (!file) return null;
  const mime = uploadedFileMime(file);
  const provider = options.provider || currentAdvancedProvider();
  const wan30 = normalizeAdvancedProvider(provider) === "wan30";
  const expectedPrefix = kind === "audio" ? "audio/" : "video/";
  if (!mime.startsWith(expectedPrefix)) {
    if (els.advancedNote) els.advancedNote.textContent = kind === "audio" ? t("advanced.seedanceAudioRequired", {}, "Reference audio is required.") : t("advanced.seedanceVideoRequired");
    return null;
  }
  const maxBytes = wan30
    ? (kind === "audio" ? ADVANCED_WAN30_AUDIO_MAX_BYTES : ADVANCED_WAN30_VIDEO_MAX_BYTES)
    : advancedMediaUploadMaxBytes(kind, provider);
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
  const vegaCaps = isVegaAdvancedProvider(provider) ? vegaCapabilities(provider) : null;
  if (vegaCaps?.perFileMinSeconds > 0) {
    if (!(durationSeconds >= vegaCaps.perFileMinSeconds && durationSeconds <= vegaCaps.perFileMaxSeconds)) {
      if (els.advancedNote) els.advancedNote.textContent = `Vega reference ${kind} duration must be between ${vegaCaps.perFileMinSeconds} and ${vegaCaps.perFileMaxSeconds} seconds.`;
      return null;
    }
    const existing = kind === "audio" ? advancedSeedanceAudioReferences() : advancedSeedanceVideoReferences();
    const totalSeconds = existing.reduce((sum, item) => sum + positiveDurationSeconds(item.durationSeconds || item.duration), 0) + durationSeconds;
    const totalLimit = kind === "audio" ? vegaCaps.audioSeconds : vegaCaps.videoSeconds;
    if (totalLimit > 0 && totalSeconds > totalLimit) {
      if (els.advancedNote) els.advancedNote.textContent = `Vega reference ${kind}s must total ${totalLimit} seconds or less.`;
      return null;
    }
  }
  if (kind === "video" && !vegaCaps) {
    const durationMessage = advancedVideoInputDurationMessage(durationSeconds, provider, currentAdvancedVideoCapability());
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
  const pending = addAdvancedPendingReference(kind, file, { provider });
  try {
    const payload = await requestJson("/api/user-assets", {
      method: "POST",
      body: {
        dataUrl: await readMediaFileAsDataUrl(file),
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
    if (!options.skipReference) addAdvancedSeedanceMediaReference(asset, kind, { order: pending.order });
    if (els.advancedNote && !options.skipReference) els.advancedNote.textContent = "";
    renderAdvancedAssets();
    updateAdvancedModelControls();
    updateAdvancedButtonCost();
    return asset;
  } catch (error) {
    removeAdvancedPendingReference(pending.pendingId);
    throw error;
  }
}

async function uploadAdvancedTransientMediaReference(file, kind = "image", { provider = currentAdvancedProvider(), durationSeconds = 0 } = {}) {
  if (!state.user) {
    openLogin();
    return null;
  }
  if (!file) return null;
  const normalizedKind = String(kind || "").toLowerCase();
  const mime = uploadedFileMime(file);
  const expectedPrefix = normalizedKind === "audio" ? "audio/" : normalizedKind === "video" ? "video/" : "image/";
  if (!mime.startsWith(expectedPrefix)) {
    if (els.advancedNote) {
      els.advancedNote.textContent = normalizedKind === "audio"
        ? t("advanced.seedanceAudioRequired", {}, "Reference audio is required.")
        : normalizedKind === "video"
          ? t("advanced.seedanceVideoRequired")
          : t("advanced.seedanceFirstRequired");
    }
    return null;
  }
  if (file.size > advancedMediaUploadMaxBytes(normalizedKind, provider)) {
    if (els.advancedNote) els.advancedNote.textContent = t("advanced.clipTooLarge");
    return null;
  }
  const payload = await requestJson("/api/advanced/transient-media", {
    method: "POST",
    body: {
      dataUrl: await readMediaFileAsDataUrl(file),
      name: file.name || (normalizedKind === "audio" ? "Audio reference" : normalizedKind === "video" ? "Video reference" : "Image reference"),
      fileName: file.name || "",
      mime,
      kind: normalizedKind,
      provider,
      durationSeconds: durationSeconds || await readMediaDuration(file),
    },
  });
  const media = payload.media || null;
  const publicUrl = vegaPublicHttpUrl(media?.publicUrl || media?.url || "");
  if (!media || !publicUrl) {
    throw new Error(t("assets.uploadFailed", { message: "Object storage public URL unavailable" }));
  }
  return {
    id: "",
    assetId: "",
    kind: normalizedKind,
    mime: media.mime || mime,
    name: media.name || file.name || "",
    fileName: media.fileName || file.name || "",
    publicUrl,
    cdnUrl: publicUrl,
    url: publicUrl,
    previewUrl: publicUrl,
    durationSeconds: Number(media.durationSeconds || durationSeconds || 0) || 0,
  };
}

async function uploadAdvancedWanAudioReference(file) {
  if (!state.user) {
    openLogin();
    return null;
  }
  if (!file) return null;
  if (!uploadedFileMime(file).startsWith("audio/")) {
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
        dataUrl: await readMediaFileAsDataUrl(file),
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
  const sourceUrl = String(options.sourceUrl || options.ref?.dataUrl || options.ref?.url || "").trim();
  const ref = {
    ...(options.ref || {}),
    assetId: options.ref?.assetId || asset.id || asset.assetId || "",
    url: sourceUrl || options.ref?.url || assetPreviewUrl(asset),
    previewUrl: sourceUrl || options.ref?.previewUrl || assetPreviewUrl(asset),
    dataUrl: sourceUrl || options.ref?.dataUrl || "",
    name: options.ref?.name || asset.name || asset.fileName || (kind === "audio" ? "Audio reference" : "Video reference"),
    fileName: options.ref?.fileName || asset.fileName || asset.name || "",
    durationSeconds: options.ref?.durationSeconds || asset.durationSeconds || asset.duration || 0,
    ...(kind === "video" ? {
      posterUrl: options.ref?.posterUrl || asset.posterUrl || asset.thumbnailUrl || asset.coverUrl || "",
      thumbnailUrl: options.ref?.thumbnailUrl || asset.thumbnailUrl || asset.posterUrl || asset.coverUrl || "",
      coverUrl: options.ref?.coverUrl || asset.coverUrl || asset.posterUrl || asset.thumbnailUrl || "",
    } : {}),
    fromLibrary: true,
    order: options.order || options.ref?.order || 0,
  };
  if (!ref.assetId && !ref.url && !ref.previewUrl) return { ok: false, code: "PUBLIC_URL_REQUIRED" };
  const limit = kind === "audio" ? advancedAudioReferenceLimit() : advancedVideoReferenceLimit();
  if (limit <= 0) return { ok: false, code: "REFERENCE_NOT_SUPPORTED", kind, limit };
  const orderedRef = stampAdvancedReferenceOrder(ref);
  if (kind === "audio") {
    setAdvancedSeedanceAudioReferences(dedupeAdvancedMediaReferences([...advancedSeedanceAudioReferences(), orderedRef]).slice(0, limit));
  } else {
    setAdvancedSeedanceVideoReferences(dedupeAdvancedMediaReferences([...advancedSeedanceVideoReferences(), orderedRef]).slice(0, limit));
  }
  const savedRefs = kind === "audio" ? advancedSeedanceAudioReferences() : advancedSeedanceVideoReferences();
  const savedRef = savedRefs.find((item) => (orderedRef.assetId && item.assetId === orderedRef.assetId)
    || (orderedRef.url && item.url === orderedRef.url)
    || (orderedRef.previewUrl && item.previewUrl === orderedRef.previewUrl));
  if (!savedRef) return { ok: false, code: "REFERENCE_NOT_ADDED", kind, limit };
  syncSeedanceReferenceMode();
  return { ok: true, ref: savedRef };
}

function advancedMediaReferenceAddError(result = {}, kind = "video") {
  if (result.code === "REFERENCE_NOT_SUPPORTED") {
    return kind === "audio" ? t("advanced.referenceAudioUnsupported", {}, "This mode does not support reference audio.") : t("advanced.referenceVideoUnsupported", {}, "This mode does not support reference video.");
  }
  return t("advanced.referenceMediaTooMany", {}, "Too many reference media files.");
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
  const provider = currentAdvancedProvider();
  if (isVegaAdvancedProvider(provider)) {
    const usesMediaLibrary = vegaProviderUsesMediaLibrary(provider);
    let selection = usesMediaLibrary
      ? await resolveAdvancedVegaAsset(asset, target.id)
      : advancedVegaSelection(asset, target.id);
    if (!usesMediaLibrary && !selection.ok && selection.code === "PUBLIC_URL_REQUIRED") {
      selection = await resolveAdvancedVegaAsset(asset, target.id);
    }
    if (!selection.ok) {
      if (els.advancedAssetNote) els.advancedAssetNote.textContent = selection.message || t("advanced.assetWrongType", {
        target: target.label,
        type: assetTargetTypeLabel(target.type),
      });
      return;
    }
    if (els.advancedImage) els.advancedImage.value = "";
    applyAdvancedVegaSelection(selection, target);
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
    if (isVegaAdvancedProvider(provider)) {
      const ref = stampAdvancedReferenceOrder({ assetId: asset.id, dataUrl: url, url, fileName: asset.name || "", name: asset.name || "", fromLibrary: true });
      if (target.id === "primary") {
        state.advancedSeedanceFirstFrameAssetId = asset.id;
        state.advancedSeedanceFirstFrameDataUrl = url;
        state.advancedUploadDataUrl = url;
      } else if (target.id === "referenceImages") {
        state.advancedReferenceImages = dedupeAdvancedReferenceImages([...(state.advancedReferenceImages || []), ref]);
        state.advancedUploadDataUrl = state.advancedReferenceImages[0]?.dataUrl || state.advancedReferenceImages[0]?.url || "";
        state.advancedFirstFrameAssetId = "";
      } else {
        state.advancedReferenceImages = [ref];
        state.advancedFirstFrameAssetId = asset.id;
        state.advancedUploadDataUrl = url;
      }
    } else if (["seedance", "seedance25", "seedance-nsfw", "wan30"].includes(provider)) {
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
    } else if (isAdvancedImageProvider(provider)) {
      const ref = stampAdvancedReferenceOrder({ assetId: asset.id, dataUrl: url, fileName: asset.name || "", name: asset.name || "", fromLibrary: true });
      const imageLimit = isAdvancedImageEditProvider(provider) && advancedCreateModeUsesSingleUpload() ? 1 : ADVANCED_SEEDANCE_REFERENCE_LIMIT;
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
    if (isVegaAdvancedProvider(provider)) {
      state.advancedSeedanceLastFrameAssetId = asset.id;
      state.advancedSeedanceLastFrameDataUrl = url;
    } else if (["seedance", "seedance25", "seedance-nsfw", "wan30"].includes(provider)) {
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
    if (isVegaAdvancedProvider(provider) || ["seedance", "seedance25", "seedance-nsfw", "wan30"].includes(provider)) {
      const result = addAdvancedSeedanceMediaReference(asset, "video");
      if (!result.ok) {
        if (els.advancedAssetNote) els.advancedAssetNote.textContent = advancedMediaReferenceAddError(result, "video");
        return;
      }
      if (advancedCreateModeNeedsReplacePair()) state.advancedAssetTarget = "primary";
    } else if (advancedAliyunUsesSharedReferenceUpload(currentAdvancedVideoCapability())) {
      const result = addAdvancedSeedanceMediaReference(asset, "video");
      if (!result.ok) {
        if (els.advancedAssetNote) els.advancedAssetNote.textContent = advancedMediaReferenceAddError(result, "video");
        return;
      }
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
    if (isVegaAdvancedProvider(provider) || advancedUsesSharedReferenceUpload(provider, currentAdvancedVideoCapability())) {
      const result = addAdvancedSeedanceMediaReference(asset, "audio");
      if (!result.ok) {
        if (els.advancedAssetNote) els.advancedAssetNote.textContent = advancedMediaReferenceAddError(result, "audio");
        return;
      }
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

function advancedProviderMatchesCustomKind(value = "", kind = state.advancedCustomMediaKind) {
  const provider = String(value || "").trim().toLowerCase();
  if (kind === "image") return ["wan27-image-edit", "seedream5-image", "qwen-image3", "z-image-spicy-pro", "qwen-image-edit-spicy"].includes(provider);
  if (kind === "conversation") return ["byteplus-language", "papaya", "qwen37-flash"].includes(provider);
  return ["seedance-nsfw", "wan30", "wan30-prime", "wan27", "happyhorse", "seedance", "seedance-fast", "seedance25"].includes(provider) || isVegaProviderId(provider);
}

function syncAdvancedProviderExposure() {
  if (!els.advancedProvider) return;
  const hiddenProviders = new Set(["wan30", "wan27", "wan-animate", "happyhorse", "wan27-image-edit", "qwen-image3"]); // z-image-spicy-pro / qwen-image-edit-spicy stay visible
  const enabled = publicAliyunModelsEnabled();
  const wan30Enabled = publicWan30ModelsEnabled();
  const wan27Enabled = publicWan27ModelsEnabled();
  const happyhorseEnabled = publicHappyhorseModelsEnabled();
  const qwenImage3Enabled = publicQwenImage3ModelsEnabled();
  const selectedMediaKind = state.advancedCreateKind === "custom"
    ? state.advancedCustomMediaKind
    : state.advancedCreateKind;
  els.advancedProvider.querySelectorAll("option").forEach((option) => {
    const raw = String(option.value || "").trim().toLowerCase();
    // Keep HappyHorse hidden on the old site, but expose Wan 3.0 Prime along
    // with Wan 3.0 when that tenant feature is enabled.
    const permanentlyHidden = raw === "happyhorse";
    const primeHidden = raw === "wan30-prime" && !wan30Enabled;
    // Only show models belonging to the selected video/image/conversation tab.
    const otherMediaKindHidden = !advancedProviderMatchesCustomKind(raw, selectedMediaKind);
    option.hidden = otherMediaKindHidden || permanentlyHidden || primeHidden || (!enabled && hiddenProviders.has(raw) && !(
      (wan30Enabled && isPublicWan30ProviderOption(raw))
      || (wan27Enabled && isPublicWan27ProviderOption(raw))
      || (happyhorseEnabled && isPublicHappyhorseProviderOption(raw))
      || (qwenImage3Enabled && isPublicQwenImage3ProviderOption(raw))
    ));
  });
  els.advancedProvider.querySelectorAll("optgroup").forEach((group) => {
    group.hidden = !Array.from(group.querySelectorAll("option")).some((option) => !option.hidden);
  });
  const current = String(els.advancedProvider.value || "").trim().toLowerCase();
  const modeProvider = state.advancedCreateKind === "custom" ? "" : String(advancedCreateModeConfig()?.provider || "").trim().toLowerCase();
  const permanentlyHiddenCurrent = current === "happyhorse" || (current === "wan30-prime" && !wan30Enabled);
  const tenantHiddenCurrent = !enabled && hiddenProviders.has(current) && !(
    (wan30Enabled && isPublicWan30ProviderOption(current))
    || (wan27Enabled && isPublicWan27ProviderOption(current))
    || (happyhorseEnabled && isPublicHappyhorseProviderOption(current))
    || (qwenImage3Enabled && isPublicQwenImage3ProviderOption(current))
  );
  const currentHiddenForSelectedKind = !advancedProviderMatchesCustomKind(current, selectedMediaKind);
  if (currentHiddenForSelectedKind || (state.advancedCreateKind === "custom" && permanentlyHiddenCurrent)) {
    const preferred = Array.from(els.advancedProvider.options).find((option) => !option.hidden && option.value.toLowerCase() === modeProvider);
    const replacement = preferred || Array.from(els.advancedProvider.options).find((option) => !option.hidden);
    if (replacement) els.advancedProvider.value = replacement.value;
  } else if (current !== modeProvider && (permanentlyHiddenCurrent || tenantHiddenCurrent)) {
    if (selectedMediaKind === "video" && !Array.from(els.advancedProvider.options).find((option) => option.value === DEFAULT_ADVANCED_PROVIDER)?.hidden) {
      els.advancedProvider.value = DEFAULT_ADVANCED_PROVIDER;
    } else {
      const preferred = Array.from(els.advancedProvider.options).find((option) => !option.hidden && option.value.toLowerCase() === modeProvider);
      const replacement = preferred || Array.from(els.advancedProvider.options).find((option) => !option.hidden);
      if (replacement) els.advancedProvider.value = replacement.value;
    }
  }
}

function updateAdvancedModelControls() {
  applyAdvancedCreateMode({ syncForm: false });
  syncAdvancedProviderExposure();
  const provider = currentAdvancedProvider();
  if (els.advancedPromptOptimizeBtn) {
    els.advancedPromptOptimizeBtn.hidden = !window.isPromptOptimizerProvider?.(provider);
  }
  syncAdvancedVideoCapabilityOptions();
  syncAdvancedSeedanceModeOptions(provider);
  const capability = currentAdvancedVideoCapability();
  const wanMode = normalizeWanMediaMode(els.advancedWanMediaMode?.value || "first_frame");
  const seedanceMode = normalizeSeedanceMediaMode(els.advancedSeedanceMediaMode?.value || "text_to_video");
  const vegaProvider = isVegaAdvancedProvider(provider);
  const vegaMode = vegaProvider ? normalizeVegaUiMediaMode(els.advancedSeedanceMediaMode?.value || "text_to_video") : "";
  const vegaCaps = vegaProvider ? vegaCapabilities(provider) : null;
  const vegaDraftFollowup = vegaProvider && vegaMode === "draft_followup";
  const vegaUsesFirstFrame = vegaProvider && vegaModeNeedsFirstFrame(vegaMode);
  const vegaUsesLastFrame = vegaProvider && vegaModeNeedsLastFrame(vegaMode);
  const vegaUsesReferences = vegaProvider && vegaModeUsesReferences(vegaMode);
  const vegaTaskType = vegaProvider ? advancedVegaCurrentTaskType(provider) : "";
  const vegaEditLikeTask = vegaProvider && ["edit", "extend"].includes(vegaTaskType);
  const allowManualReferenceUpload = advancedCreateModeAllowsManualReferenceUpload();
  const bounds = advancedDurationBounds(provider, capability);
  const isImageEdit = isAdvancedImageProvider(provider);
  const isSeedreamImage = provider === "seedream5-image";
  const isQwenImage = provider === "qwen-image3";
  const isQwenText = ["qwen37-flash", "byteplus-language", "papaya"].includes(provider);
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
    const smartDuration = provider === "wan30" || (vegaProvider && bounds.smart);
    const selectedDuration = isImageEdit || isStandaloneImage || isQwenText
      ? "1"
      : smartDuration && rawDuration === -1
        ? "-1"
        : String(Math.min(durationMax, Math.max(bounds.min, Number.isFinite(rawDuration) ? rawDuration : bounds.fallback)));
    const durationValues = isImageEdit || isStandaloneImage || isQwenText
      ? [1]
      : smartDuration
        ? [-1, ...Array.from({ length: durationMax - bounds.min + 1 }, (_, index) => bounds.min + index)]
        : Array.from({ length: durationMax - bounds.min + 1 }, (_, index) => bounds.min + index);
    els.advancedDuration.innerHTML = durationValues
      .map((value) => `<option value="${value}"${String(value) === selectedDuration ? " selected" : ""}>${value === -1 ? "Auto" : `${value}s`}</option>`)
      .join("");
    els.advancedDuration.value = selectedDuration;
  }
  if (els.advancedResolution) {
    const imageEditOptions = imageCreateResolutionOptions();
    const seedreamOptions = ["1K", "2K"];
    const videoOptions = advancedVideoResolutionOptions(provider);
    const options = isStandaloneImage ? seedreamOptions : isImageEdit ? imageEditOptions : videoOptions;
    const current = normalizeAdvancedResolution(els.advancedResolution.value, provider);
    els.advancedResolution.innerHTML = options.map((value) => `<option value="${escapeHtml(value)}" ${value === current ? "selected" : ""}>${escapeHtml(value)}</option>`).join("");
    if (!options.includes(current)) els.advancedResolution.value = options[0];
    els.advancedResolution.closest(".field")?.toggleAttribute("hidden", animateCapability || isQwenText);
  }
  if (els.advancedSeedanceTier) {
    const active = provider === "seedance";
    const explicitlyFast = String(els.advancedProvider?.value || "").trim().toLowerCase() === "seedance-fast";
    els.advancedSeedanceTier.closest(".field")?.toggleAttribute("hidden", true);
    els.advancedSeedanceTier.value = active && explicitlyFast ? "fast" : "standard";
  }
  if (els.advancedSeedreamTier) {
    els.advancedSeedreamTier.value = "pro";
    els.advancedSeedreamTier.closest(".field")?.setAttribute("hidden", "");
  }
  document.querySelectorAll(".advanced-qwen-option").forEach((item) => {
    item.hidden = simpleAction || simpleEdit || !isQwenImage;
  });
  document.querySelectorAll(".advanced-wan-prompt-extend-option").forEach((item) => {
    item.hidden = simpleAction || simpleEdit || !["wan30-video", "wan30-video-pro", "wan30-video-prime", "wan30-video-prime-pro"].includes(capability);
  });
  document.querySelectorAll(".advanced-wan-prompt-optimize-option").forEach((item) => {
    item.hidden = simpleAction || simpleEdit || !["wan30-video", "wan30-video-pro", "wan30-video-prime", "wan30-video-prime-pro"].includes(capability);
  });
  document.querySelectorAll(".advanced-qwen37-option").forEach((item) => {
    item.hidden = simpleAction || simpleEdit || !isQwenText;
  });
  if (vegaProvider && els.advancedVegaTaskType) {
    const allowedTaskTypes = vegaCaps?.taskTypes || ["auto", "reference"];
    Array.from(els.advancedVegaTaskType.options).forEach((option) => {
      option.hidden = !allowedTaskTypes.includes(option.value);
      option.disabled = !allowedTaskTypes.includes(option.value);
    });
    if (!allowedTaskTypes.includes(els.advancedVegaTaskType.value)) els.advancedVegaTaskType.value = "auto";
  }
  // The four Vega models expose only the first two rows of user-facing
  // controls: model/mode/ratio and resolution/duration/audio. Keep the
  // remaining controls as hidden inputs so their existing defaults continue
  // to be submitted without expanding the public form.
  document.querySelectorAll(".advanced-vega-option").forEach((item) => {
    item.hidden = true;
  });
  if (!vegaProvider || vegaCaps?.returnLastFrame === false) {
    if (els.advancedVegaReturnLastFrame) els.advancedVegaReturnLastFrame.checked = false;
  }
  if (!vegaCaps?.draft && els.advancedVegaDraft) els.advancedVegaDraft.checked = false;
  if (!vegaDraftFollowup && els.advancedVegaDraftTaskId) els.advancedVegaDraftTaskId.value = "";
  if (vegaProvider && els.advancedSeedanceMediaMode) {
    els.advancedSeedanceMediaMode.closest(".field")?.removeAttribute("hidden");
  }
  if (els.advancedRatio) {
    const imageRatios = ["1:1", "3:4", "4:3", "9:16", "16:9"];
    const seedanceNsfwReferenceMode = provider === "seedance-nsfw" && seedanceMode === "omini";
    const vegaProvider = isVegaAdvancedProvider(provider);
    const videoRatios = vegaProvider
      ? [...(vegaCaps?.ratios || VEGA_ALL_RATIOS)]
      : provider === "seedance25"
      ? ["16:9", "21:9", "9:16", "4:3", "3:4", "1:1"]
      : provider === "wan30" || provider === "seedance-nsfw"
      ? ["adaptive", "16:9", "21:9", "9:16", "4:3", "3:4", "1:1"]
      : ["9:16", "16:9", "1:1"];
    const options = isImageEdit || isQwenImage ? imageRatios : videoRatios;
    if (provider === "seedance-nsfw" && !seedanceNsfwReferenceMode) els.advancedRatio.value = "adaptive";
    const fallbackRatio = vegaProvider || provider === "seedance25" ? "16:9" : ["wan30", "seedance-nsfw"].includes(provider) ? "adaptive" : "9:16";
    const rawRatio = String(els.advancedRatio.value || fallbackRatio).trim();
    const current = (["wan30", "seedance-nsfw"].includes(provider) || vegaProvider) && rawRatio.toLowerCase() === "adaptive" ? "adaptive" : normalizeVideoRatio(rawRatio);
    els.advancedRatio.innerHTML = options.map((value) => `<option value="${escapeHtml(value)}" ${value === current ? "selected" : ""}>${escapeHtml(value)}</option>`).join("");
    if (!options.includes(current)) els.advancedRatio.value = fallbackRatio;
    els.advancedRatio.closest(".field")?.toggleAttribute("hidden", isSeedreamImage || isQwenText || simpleAction || animateCapability || (provider === "seedance-nsfw" && !seedanceNsfwReferenceMode) || vegaDraftFollowup);
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
    item.hidden = simpleAction || simpleEdit || (!["seedance", "seedance25", "seedance-nsfw", "wan30"].includes(provider) && !vegaProvider);
  });
  els.advancedSeedanceTier?.closest(".field")?.toggleAttribute("hidden", true);
  if (els.advancedSeedanceMediaPanel) {
    els.advancedSeedanceMediaPanel.hidden = simpleAction || simpleEdit
      || (vegaProvider
        ? !vegaUsesFirstFrame && !vegaUsesLastFrame
        : !["seedance", "seedance25", "seedance-nsfw", "wan30"].includes(provider) || !seedanceModeNeedsFirstFrame(seedanceMode));
  }
  if (els.advancedFrameEngineLabel) els.advancedFrameEngineLabel.textContent = isVegaAdvancedProvider(provider) || String(els.advancedProvider?.value || "").trim().toLowerCase() === "seedance-fast" ? advancedProviderLabel(provider) : provider === "wan30" ? "Wan 3.0" : provider === "seedance-nsfw" ? "Seedance 2.5" : provider === "seedance25" ? "Seedance 2.5" : "Seedance 2.0";
  document.querySelectorAll(".advanced-seedream5-option").forEach((item) => {
    item.hidden = simpleAction || simpleEdit || !isSeedreamImage;
  });
  document.querySelectorAll(".advanced-fields").forEach((item) => {
    item.hidden = simpleAction;
  });
  document.querySelectorAll(".advanced-prompt-field").forEach((item) => {
    item.hidden = simpleAction || vegaDraftFollowup;
  });
  document.querySelectorAll(".advanced-duration-field").forEach((item) => {
    item.hidden = isImageEdit || isStandaloneImage || isQwenText || simpleEdit || animateCapability || advancedVideoEditUsesSourceDuration(capability) || (provider === "seedance-nsfw" && seedanceMode === "edit") || vegaEditLikeTask;
  });
  document.querySelectorAll(".advanced-seedance-audio-field").forEach((item) => {
    item.hidden = simpleAction || simpleEdit
      || (vegaProvider ? vegaDraftFollowup : !["seedance", "seedance25", "seedance-nsfw", "wan30"].includes(provider));
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
  } else if (vegaProvider) {
    els.advancedWanSeed?.closest(".field")?.setAttribute("hidden", "");
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
    item.hidden = vegaProvider
      ? !vegaUsesLastFrame
      : !["seedance", "seedance25", "seedance-nsfw", "wan30"].includes(provider) || !seedanceModeNeedsLastFrame(seedanceMode);
  });
  document.querySelectorAll(".seedance-first-frame").forEach((item) => {
    item.hidden = vegaProvider
      ? !vegaUsesFirstFrame
      : !["seedance", "seedance25", "seedance-nsfw", "wan30"].includes(provider) || !seedanceModeNeedsFirstFrame(seedanceMode);
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
        (vegaProvider && vegaUsesReferences)
        || (["seedance", "seedance25", "seedance-nsfw", "wan30"].includes(provider) && !seedanceModeNeedsFirstFrame(seedanceMode) && !(provider === "seedance-nsfw" && ["edit", "extend"].includes(seedanceMode)))
        || isStandaloneImage
        || (aliyunVideo && advancedAliyunUsesSharedReferenceUpload(capability))
        || (!uploadIsVideo && !advancedCreateModeUsesSingleUpload())
      );
      if (vegaProvider) syncAdvancedVegaUploadInput();
    }
    const forceUpload = allowManualReferenceUpload && (simpleAction || simpleEdit || advancedCreateModeNeedsVideoUpload());
    const usesDedicatedFrameUpload = vegaProvider
      ? vegaUsesFirstFrame || vegaUsesLastFrame
      : ["seedance", "seedance25", "seedance-nsfw", "wan30"].includes(provider) && seedanceModeNeedsFirstFrame(seedanceMode);
    els.advancedUploadBox.hidden = hidePresetUploadBox
      || isQwenText
      || vegaDraftFollowup
      || usesDedicatedFrameUpload
      || (vegaProvider && !vegaUsesReferences)
      || (aliyunVideo && !capabilityNeedsMedia);
    els.advancedUploadBox.classList.toggle("is-wan", aliyunVideo);
    els.advancedUploadBox.classList.toggle("is-seedance", ["seedance", "seedance25", "seedance-nsfw", "wan30"].includes(provider) || vegaProvider);
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
  syncAdvancedParameterChips();
}

function advancedParameterNativeSelect(kind = "") {
  const provider = currentAdvancedProvider();
  if (kind === "model") return els.advancedProvider;
  if (kind === "mode") {
    if (els.advancedVideoCapability?.options.length > 1) return els.advancedVideoCapability;
    const seedanceModeProvider = ["seedance", "seedance25", "seedance-nsfw", "wan30"].includes(provider)
      || isVegaAdvancedProvider(provider);
    if (seedanceModeProvider && els.advancedSeedanceMediaMode?.options.length > 1) return els.advancedSeedanceMediaMode;
    return null;
  }
  if (kind === "ratio") return els.advancedRatio;
  if (kind === "resolution") return els.advancedResolution;
  if (kind === "duration") return els.advancedDuration;
  return null;
}

function advancedParameterVisibleOptions(kind = "") {
  const select = advancedParameterNativeSelect(kind);
  if (!select) return [];
  return Array.from(select.options)
    .filter((option) => !option.hidden && !option.disabled && !option.closest("optgroup")?.hidden)
    .map((option) => ({
      value: String(option.value ?? ""),
      label: String(option.textContent || option.value || "").trim(),
      group: String(option.closest("optgroup")?.label || "").trim(),
    }));
}

function advancedParameterFieldVisible(kind = "", select = null) {
  if (!select) return false;
  if (kind === "model" || kind === "mode") return true;
  const field = select.closest(".field");
  return Boolean(field && !field.hidden);
}

function advancedParameterValueLabel(kind = "", select = advancedParameterNativeSelect(kind)) {
  if (!select) return "";
  const selected = select.options[select.selectedIndex];
  const raw = String(selected?.textContent || select.value || "").trim();
  if (kind === "ratio" && String(select.value).toLowerCase() === "adaptive") return "Adaptive";
  if (kind === "resolution") return advancedVideoResolutionLabel(select.value);
  return raw || String(select.value || "");
}

function advancedParameterChipIcon(kind = "") {
  return {
    model: "sparkles",
    mode: "sliders-horizontal",
    ratio: "ratio",
    resolution: "scan",
    duration: "timer",
  }[kind] || "settings-2";
}

function advancedParameterChipLabel(kind = "") {
  return {
    model: t("field.model"),
    mode: "Mode",
    ratio: t("field.ratio"),
    resolution: t("field.resolution"),
    duration: t("field.duration"),
  }[kind] || kind;
}

function advancedParameterChipItems() {
  const items = [];
  const providerSelect = advancedParameterNativeSelect("model");
  const providerOptions = advancedParameterVisibleOptions("model");
  if (providerSelect && providerOptions.length) items.push({ kind: "model", valueLabel: advancedParameterValueLabel("model", providerSelect) });
  const modeSelect = advancedParameterNativeSelect("mode");
  const modeOptions = advancedParameterVisibleOptions("mode");
  if (modeSelect && modeOptions.length > 1) items.push({ kind: "mode", valueLabel: advancedParameterValueLabel("mode", modeSelect) });
  ["ratio", "resolution", "duration"].forEach((kind) => {
    const select = advancedParameterNativeSelect(kind);
    const options = advancedParameterVisibleOptions(kind);
    if (select && options.length && advancedParameterFieldVisible(kind, select)) {
      items.push({ kind, valueLabel: advancedParameterValueLabel(kind, select) });
    }
  });
  return items;
}

function syncAdvancedParameterChips() {
  if (!els.advancedParameterChips) return;
  const items = advancedParameterChipItems();
  const summary = items.filter((item) => item.kind !== "model").map((item) => item.valueLabel).filter(Boolean).join(" · ");
  if (els.advancedParameterSummary) els.advancedParameterSummary.textContent = summary;
  els.advancedParameterChips.innerHTML = items.map(({ kind, valueLabel }) => `
    <button class="advanced-parameter-chip" type="button" data-parameter-kind="${escapeHtml(kind)}" data-advanced-parameter-open="${escapeHtml(kind)}" aria-expanded="${state.advancedParameterOpen === kind ? "true" : "false"}" title="${escapeHtml(`${advancedParameterChipLabel(kind)}: ${valueLabel}`)}">
      <i data-lucide="${advancedParameterChipIcon(kind)}"></i>
      <span class="advanced-parameter-chip-label">${escapeHtml(kind === "model" ? "" : advancedParameterChipLabel(kind))}</span>
      <span class="advanced-parameter-chip-value">${escapeHtml(valueLabel)}</span>
      <i class="advanced-parameter-chip-caret" data-lucide="chevron-down"></i>
    </button>
  `).join("");
  const open = state.advancedParameterOpen;
  els.advancedParameterChips.hidden = false;
  if (open && !items.some((item) => item.kind === open)) {
    closeAdvancedParameterPanel();
  } else if (open) {
    renderAdvancedParameterPanel(open);
  }
  refreshIcons();
}

function closeAdvancedParameterPanel() {
  state.advancedParameterOpen = "";
  if (els.advancedParameterPanel) {
    els.advancedParameterPanel.hidden = true;
    els.advancedParameterPanel.innerHTML = "";
    delete els.advancedParameterPanel.dataset.advancedParameterPlacement;
  }
  if (els.advancedParameterChips) els.advancedParameterChips.hidden = false;
  els.advancedParameterChips?.querySelectorAll("[data-advanced-parameter-open]").forEach((button) => {
    button.setAttribute("aria-expanded", "false");
  });
}

function positionAdvancedParameterPanel() {
  const panel = els.advancedParameterPanel;
  const chip = els.advancedParameterChips?.querySelector(`[data-advanced-parameter-open="${state.advancedParameterOpen}"]`);
  if (!panel || panel.hidden || !chip) return;
  const chipRect = chip.getBoundingClientRect();
  const viewportGap = 12;
  const spaceBelow = Math.max(0, window.innerHeight - chipRect.bottom - viewportGap);
  const spaceAbove = Math.max(0, chipRect.top - viewportGap);
  const previousMaxHeight = panel.style.maxHeight;
  panel.style.maxHeight = "none";
  const neededHeight = Math.ceil(panel.getBoundingClientRect().height);
  const fitsBelow = neededHeight <= spaceBelow;
  const fitsAbove = neededHeight <= spaceAbove;
  const openUp = !fitsBelow && (fitsAbove || spaceAbove > spaceBelow);
  const available = openUp ? spaceAbove : spaceBelow;
  panel.dataset.advancedParameterPlacement = openUp ? "up" : "down";
  if (neededHeight > available) {
    panel.style.maxHeight = `${Math.max(0, Math.floor(available))}px`;
  } else {
    panel.style.maxHeight = previousMaxHeight;
  }
}

function renderAdvancedParameterPanel(kind = "") {
  const select = advancedParameterNativeSelect(kind);
  const options = advancedParameterVisibleOptions(kind);
  if (!els.advancedParameterPanel || !select || !options.length) {
    closeAdvancedParameterPanel();
    return;
  }
  const current = String(select.value || "");
  let body = "";
  if (kind === "duration") {
    const numeric = options.map((item) => Number(item.value)).filter((value) => Number.isFinite(value) && value >= 0);
    const min = numeric.length ? Math.min(...numeric) : 0;
    const max = numeric.length ? Math.max(...numeric) : 0;
    const selectedNumber = Number(current);
    const hasAuto = options.some((item) => Number(item.value) === -1);
    const sliderMin = hasAuto ? -1 : min;
    const sliderValue = hasAuto && selectedNumber === -1
      ? -1
      : Number.isFinite(selectedNumber) && selectedNumber >= min && selectedNumber <= max
        ? selectedNumber
        : min;
    body = `
      <div class="advanced-parameter-duration">
        <div class="advanced-parameter-duration-readout">
          <strong data-advanced-parameter-duration-value>${escapeHtml(advancedParameterValueLabel(kind, select))}</strong>
        </div>
        <input class="advanced-parameter-range" type="range" min="${sliderMin}" max="${max}" step="1" value="${sliderValue}" data-advanced-parameter-duration-range aria-label="${escapeHtml(advancedParameterChipLabel(kind))}" />
        <div class="advanced-parameter-range-labels" aria-hidden="true">
          <span>${hasAuto ? "Auto" : `${min}s`}</span>
          <span>${max}s</span>
        </div>
      </div>
    `;
  } else {
    body = `<div class="advanced-parameter-options">
      ${options.map((item) => `
        <button class="advanced-parameter-option ${item.value === current ? "is-selected" : ""}" type="button" data-advanced-parameter-option-kind="${escapeHtml(kind)}" data-advanced-parameter-option-value="${escapeHtml(item.value)}">
          <strong>${escapeHtml(item.value === "adaptive" ? "Adaptive" : item.label)}</strong>
        </button>
      `).join("")}
    </div>`;
  }
  els.advancedParameterPanel.hidden = false;
  els.advancedParameterPanel.innerHTML = body;
  delete els.advancedParameterPanel.dataset.advancedParameterPlacement;
  positionAdvancedParameterPanel();
  refreshIcons();
}

function openAdvancedParameterPanel(kind = "") {
  if (!kind) return;
  state.advancedParameterOpen = kind;
  syncAdvancedParameterChips();
  renderAdvancedParameterPanel(kind);
}

function setAdvancedParameterValue(kind = "", value = "") {
  const select = advancedParameterNativeSelect(kind);
  if (!select) return;
  select.value = String(value);
  closeAdvancedParameterPanel();
  select.dispatchEvent(new Event("change", { bubbles: true }));
  syncAdvancedParameterChips();
}

function handleAdvancedParameterTriggerClick(event) {
  event.preventDefault();
  if (state.advancedParameterOpen) {
    closeAdvancedParameterPanel();
    return;
  }
  const firstKind = els.advancedParameterChips?.querySelector("[data-advanced-parameter-open]")?.dataset.advancedParameterOpen;
  if (firstKind) openAdvancedParameterPanel(firstKind);
}

function handleAdvancedParameterChipClick(event) {
  const button = event.target.closest("[data-advanced-parameter-open]");
  if (!button) return;
  event.preventDefault();
  openAdvancedParameterPanel(button.dataset.advancedParameterOpen || "");
}

function handleAdvancedParameterPanelClick(event) {
  const closeButton = event.target.closest("[data-advanced-parameter-close]");
  if (closeButton) {
    event.preventDefault();
    closeAdvancedParameterPanel();
    return;
  }
  const option = event.target.closest("[data-advanced-parameter-option-kind]");
  if (!option) return;
  event.preventDefault();
  setAdvancedParameterValue(option.dataset.advancedParameterOptionKind || "", option.dataset.advancedParameterOptionValue || "");
}

function handleAdvancedParameterPanelInput(event) {
  const range = event.target.closest("[data-advanced-parameter-duration-range]");
  if (!range || !els.advancedDuration) return;
  els.advancedDuration.value = range.value;
  const label = range.value === "-1" ? "Auto" : `${range.value}s`;
  const readout = els.advancedParameterPanel?.querySelector("[data-advanced-parameter-duration-value]");
  if (readout) readout.textContent = label;
  const chipValue = els.advancedParameterChips?.querySelector('[data-advanced-parameter-open="duration"] .advanced-parameter-chip-value');
  if (chipValue) chipValue.textContent = label;
}

function handleAdvancedParameterPanelChange(event) {
  const range = event.target.closest("[data-advanced-parameter-duration-range]");
  if (!range || !els.advancedDuration) return;
  els.advancedDuration.value = range.value;
  // Close first so the native select's change handler cannot briefly reopen
  // the picker while syncing the estimate and parameter chips.
  closeAdvancedParameterPanel();
  els.advancedDuration.dispatchEvent(new Event("change", { bubbles: true }));
  syncAdvancedParameterChips();
}

function handleAdvancedParameterDocumentClick(event) {
  if (!state.advancedParameterOpen) return;
  // Rendering the chips/options replaces the clicked node. The composed path is
  // captured at dispatch time, so it still identifies this click as internal.
  const path = typeof event.composedPath === "function" ? event.composedPath() : [];
  if (els.advancedParameterShell && path.includes(els.advancedParameterShell)) return;
  if (event.target.closest?.("#advancedParameterShell")) return;
  closeAdvancedParameterPanel();
}

function handleAdvancedParameterKeydown(event) {
  if (event.key === "Escape" && state.advancedParameterOpen) closeAdvancedParameterPanel();
}

function triggerAdvancedLocalImageUpload({ sourceMode = "", presetSlot = "" } = {}) {
  if (!els.advancedImage) return;
  const provider = currentAdvancedProvider();
  const characterPresetUpload = presetSlot === "character" && state.advancedCreateKind !== "custom" && advancedCreateModeUsesCharacterPresetReference();
  if (!advancedCreateModeAllowsManualReferenceUpload() && !characterPresetUpload) return;
  state.advancedLocalUploadSlot = characterPresetUpload ? "character" : "";
  if (isVegaAdvancedProvider(provider)) {
    const targets = advancedAssetTargetItems();
    const target = state.advancedAssetTarget;
    state.advancedAssetTarget = targets.some((item) => item.id === target) ? target : (targets[0]?.id || "referenceImages");
  } else if (["seedance", "seedance25", "seedance-nsfw", "wan30"].includes(provider) && els.advancedSeedanceMediaMode) {
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
  } else if (isAdvancedImageProvider(provider)) {
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
  if (isVegaAdvancedProvider(provider)) syncAdvancedVegaUploadInput();
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
  if (els.advancedPrompt) {
    window.setAdvancedPromptValue?.(item.prompt || params.prompt || "", { emitInput: false });
    autoSizeAdvancedPrompt({ force: true, resetManual: true });
  }
  if (els.advancedRatio) els.advancedRatio.value = params.ratio || params.aspect_ratio || item.ratio || "9:16";
  if (els.advancedResolution) els.advancedResolution.value = params.resolution || item.resolution || "720p";
  if (els.advancedDuration) els.advancedDuration.value = params.duration || item.duration || 5;
  if (els.advancedPreprocessReference) els.advancedPreprocessReference.checked = params.preprocessReference === true;
  if (els.advancedWanPromptExtend) els.advancedWanPromptExtend.checked = ["wan30-video", "wan30-video-pro", "wan30-video-prime", "wan30-video-prime-pro"].includes(restoredCapability)
    && advancedBoolFromValue(params.prompt_extend ?? params.promptExtend ?? params.parameters?.prompt_extend ?? params.parameters?.promptExtend, false);
  if (els.advancedWanPromptOptimize) els.advancedWanPromptOptimize.checked = ["wan30-video", "wan30-video-pro", "wan30-video-prime", "wan30-video-prime-pro"].includes(restoredCapability)
    && advancedBoolFromValue(params.wan_prompt_optimize ?? params.wanPromptOptimize ?? params.parameters?.wan_prompt_optimize ?? params.parameters?.wanPromptOptimize, false);
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

function clearAdvancedCreationInputs({ preserveRegenerationSnapshot = false } = {}) {
  if (!preserveRegenerationSnapshot) state.advancedRegenerationSnapshot = null;
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
  autoSizeAdvancedPrompt({ resetManual: true });
  if (els.advancedSeedanceGenerateAudio) els.advancedSeedanceGenerateAudio.value = "true";
  if (els.advancedPreprocessReference) els.advancedPreprocessReference.checked = false;
  if (els.advancedWanPromptExtend) els.advancedWanPromptExtend.checked = false;
  if (els.advancedWanPromptOptimize) els.advancedWanPromptOptimize.checked = false;
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

