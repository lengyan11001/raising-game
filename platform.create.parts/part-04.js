function advancedMediaUploadMaxBytes(kind = "", provider = currentAdvancedProvider()) {
  const normalized = normalizeAdvancedProvider(provider);
  if (normalized === "seedance25-vega") {
    return kind === "image"
      ? ADVANCED_VEGA15_PRO_IMAGE_MAX_BYTES
      : kind === "video"
        ? ADVANCED_VEGA15_PRO_VIDEO_MAX_BYTES
        : ADVANCED_VEGA15_PRO_AUDIO_MAX_BYTES;
  }
  if (isVegaProviderId(normalized) && ["seedance20-vega", "vega10-lite"].includes(normalized)) {
    return kind === "image"
      ? ADVANCED_VEGA10_LITE_IMAGE_MAX_BYTES
      : kind === "video"
        ? ADVANCED_VEGA10_LITE_VIDEO_MAX_BYTES
        : ADVANCED_VEGA10_LITE_AUDIO_MAX_BYTES;
  }
  if (kind === "image") return ADVANCED_SEEDANCE_REFERENCE_MAX_BYTES;
  return ADVANCED_WAN_CLIP_MAX_BYTES;
}

function vegaMediaSource(item = {}) {
  const assetUri = String(item.assetUri || item.referenceAssetUri || "").trim();
  if (assetUri.startsWith("asset://")) return assetUri;
  return vegaPublicHttpUrl(item.publicUrl || item.cdnUrl || item.url || item.imageUrl || item.videoUrl || item.audioUrl || item.previewUrl || item.dataUrl || item.sourceUrl || "");
}

function applyResolvedVegaMediaSource(item = {}, resolved = {}) {
  const sourceUrl = vegaMediaSource(resolved);
  if (!sourceUrl) return "";
  item.publicUrl = sourceUrl;
  item.cdnUrl = sourceUrl;
  item.dataUrl = sourceUrl;
  item.url = sourceUrl;
  item.imageUrl = sourceUrl;
  item.videoUrl = sourceUrl;
  item.audioUrl = sourceUrl;
  item.previewUrl = sourceUrl;
  return sourceUrl;
}

function vegaCurrentSeed() {
  const value = String(els.advancedWanSeed?.value || "").trim();
  if (!value) return undefined;
  const seed = Number(value);
  return Number.isInteger(seed) && seed >= 0 ? seed : undefined;
}

async function handleAdvancedVegaLocalFiles(files = []) {
  const list = Array.from(files || []);
  if (!list.length) return;
  const provider = currentAdvancedProvider();
  const targetId = state.advancedAssetTarget || "primary";
  const targetConfig = advancedVegaUploadConfig(targetId);
  const target = activeAdvancedAssetTarget() || { id: targetId, label: t("advanced.uploadReference"), type: targetConfig.type };
  let rejected = false;
  try {
    for (const file of list) {
      const mime = uploadedFileMime(file);
      const kind = mime.startsWith("video/") ? "video" : mime.startsWith("audio/") ? "audio" : mime.startsWith("image/") ? "image" : "";
      if (!kind || kind !== targetConfig.type) {
        rejected = true;
        if (els.advancedAssetNote) els.advancedAssetNote.textContent = t("advanced.assetWrongType", {
          target: target.label,
          type: targetConfig.type === "image" ? t("assets.image") : targetConfig.type === "video" ? t("assets.video") : t("assets.audio"),
        });
        continue;
      }
      if (file.size > advancedMediaUploadMaxBytes(kind, provider)) {
        rejected = true;
        if (els.advancedAssetNote) els.advancedAssetNote.textContent = t("advanced.referenceImageTooLarge");
        continue;
      }
      let asset = null;
      if (kind === "image") {
        const ref = await uploadAdvancedImageReference(file, { provider });
        asset = ref?.assetId ? (state.advancedAssets || []).find((item) => item.id === ref.assetId) || null : null;
        if (!asset) asset = { id: ref?.assetId || "", kind: "image", publicUrl: ref?.publicUrl || ref?.dataUrl || ref?.url || ref?.previewUrl || "" };
      } else {
        asset = await uploadAdvancedMediaReference(file, kind, { provider, skipReference: true });
      }
      if (!asset) continue;
      const selection = await resolveAdvancedVegaAsset(asset, targetId);
      if (!selection.ok) {
        rejected = true;
        if (els.advancedAssetNote) els.advancedAssetNote.textContent = selection.message || "This media cannot be used for the selected Vega input.";
        continue;
      }
      applyAdvancedVegaSelection(selection, target);
    }
    if (!rejected) {
      state.activeAdvancedCaseId = "";
      updateAdvancedModelControls();
      updateAdvancedButtonCost();
    }
  } finally {
    if (els.advancedImage) els.advancedImage.value = "";
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

function firstPresent(...values) {
  for (const value of values) {
    if (value !== undefined && value !== null && value !== "") return value;
  }
  return "";
}

function upstreamMediaUrl(item = {}) {
  if (!item || typeof item !== "object") return "";
  return item.Url
    || item.URL
    || item.url
    || item.image_url?.url
    || item.imageUrl?.url
    || item.video_url?.url
    || item.videoUrl?.url
    || item.audio_url?.url
    || item.audioUrl?.url
    || item.image_url
    || item.imageUrl
    || item.video_url
    || item.videoUrl
    || item.audio_url
    || item.audioUrl
    || "";
}

function upstreamMediaType(item = {}) {
  const category = String(item.Category || item.category || item.type || item.Type || "").toLowerCase();
  const usage = String(item.Usage || item.usage || "").toLowerCase();
  const role = String(item.role || item.Role || "").toLowerCase();
  if (category.includes("video") || usage.includes("video") || role.includes("video")) return "reference_video";
  if (category.includes("audio") || usage.includes("audio") || role.includes("audio")) return "reference_audio";
  if (usage.includes("first") || role.includes("first")) return "first_frame";
  if (usage.includes("last") || usage.includes("end") || role.includes("last") || role.includes("end")) return "last_frame";
  return "reference_image";
}

function upstreamInputMediaItems(record = {}) {
  const payload = record.upstreamPayload && typeof record.upstreamPayload === "object" && !Array.isArray(record.upstreamPayload) ? record.upstreamPayload : {};
  const params = recordParams(record);
  const items = [];
  const seen = new Set();
  const push = (item, fallbackType = "") => {
    const source = typeof item === "string" ? { url: item } : (item && typeof item === "object" ? item : null);
    if (!source) return;
    const rawUrl = upstreamMediaUrl(source);
    const assetId = String(source.userAssetId || source.assetId || "").trim();
    const assetUri = String(source.assetUri || source.referenceAssetUri || (String(rawUrl).startsWith("asset://") ? rawUrl : "")).trim();
    const url = rawUrl && !String(rawUrl).startsWith("asset://") ? rawUrl : "";
    const type = fallbackType || upstreamMediaType(source);
    const key = assetId ? `asset:${assetId}` : assetUri ? `asset-uri:${assetUri}` : url ? `url:${url}` : "";
    if (!key || seen.has(key)) return;
    seen.add(key);
    items.push({ ...source, assetId, userAssetId: source.userAssetId || assetId, assetUri, referenceAssetUri: assetUri, url: url || assetUri, type });
  };
  const fileInfos = Array.isArray(payload.FileInfos) ? payload.FileInfos : [];
  fileInfos.forEach((item) => push(item));
  const content = Array.isArray(payload.Content) ? payload.Content : Array.isArray(payload.content) ? payload.content : [];
  content.forEach((item) => {
    const type = String(item?.type || item?.Type || "").toLowerCase();
    const role = String(item?.role || item?.Role || "").toLowerCase();
    const fallback = type.includes("video") || role.includes("video") ? "reference_video" : type.includes("audio") || role.includes("audio") ? "reference_audio" : role.includes("last") || role.includes("end") ? "last_frame" : role.includes("first") ? "first_frame" : "reference_image";
    push(item, fallback);
  });
  const listKeys = ["referenceImages", "reference_images", "referenceImageUrls", "reference_image_urls", "referenceVideos", "reference_videos", "referenceVideoUrls", "reference_video_urls", "referenceAudios", "reference_audios", "referenceAudioUrls", "reference_audio_urls"];
  listKeys.forEach((key) => {
    const fallback = key.toLowerCase().includes("video") ? "reference_video" : key.toLowerCase().includes("audio") ? "reference_audio" : "reference_image";
    arrayFrom(firstPresent(params[key], payload[key])).forEach((item) => push(item, fallback));
  });
  return items;
}

function restoreMediaUrl(item = {}) {
  if (!item || typeof item !== "object") return "";
  const publicUrl = firstPresent(item.url, item.publicUrl, item.cdnUrl, item.previewUrl, item.sourceUrl);
  if (publicUrl && !String(publicUrl).trim().startsWith("asset://")) return String(publicUrl).trim();
  return item.dataUrl
    || upstreamMediaUrl(item)
    || item.publicUrl
    || item.cdnUrl
    || item.sourceImageUrl
    || item.previewUrl
    || item.localUrl
    || "";
}

function restoreMediaAssetUri(item = {}) {
  if (!item || typeof item !== "object") return "";
  const direct = String(item.assetUri || item.referenceAssetUri || item.seedanceAssetUri || "").trim();
  if (direct) return direct;
  const url = String(item.url || item.imageUrl || item.sourceImageUrl || "").trim();
  return url.startsWith("asset://") ? url : "";
}

function restoreMediaAssetId(item = {}) {
  if (!item || typeof item !== "object") return "";
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

function advancedPromptHeightLimits() {
  const minimumHeight = 68;
  const maximumHeight = Math.max(minimumHeight, Math.min(window.innerHeight * 0.62, 520));
  return { minimumHeight, maximumHeight };
}

function advancedPromptMentionTokenPattern() {
  const tokens = advancedReferenceDisplayItems(currentAdvancedProvider())
    .filter(({ item }) => item && !item.isPending && !item.pendingId)
    .map((entry) => `@${entry.label}`)
    .filter(Boolean)
    .sort((left, right) => right.length - left.length)
    .map(escapeAdvancedPromptMentionRegExp);
  return tokens.length ? new RegExp(`(?:${tokens.join("|")})(?=$|[^A-Za-z0-9_-])`, "g") : null;
}

function advancedPromptHighlightHtml(value = "") {
  const text = String(value || "");
  if (!text) return "";
  const pattern = advancedPromptMentionTokenPattern();
  if (!pattern) return escapeHtml(text);
  let html = "";
  let lastIndex = 0;
  text.replace(pattern, (match, offset) => {
    html += escapeHtml(text.slice(lastIndex, offset));
    html += `<mark class="advanced-prompt-mention-token">${escapeHtml(match)}</mark>`;
    lastIndex = offset + match.length;
    return match;
  });
  return html + escapeHtml(text.slice(lastIndex));
}

function syncAdvancedPromptHighlight() {
  const textarea = els.advancedPrompt;
  const highlight = els.advancedPromptHighlight;
  if (!textarea || !highlight) return false;
  highlight.innerHTML = advancedPromptHighlightHtml(textarea.value);
  highlight.scrollTop = textarea.scrollTop;
  highlight.scrollLeft = textarea.scrollLeft;
  return true;
}

function autoSizeAdvancedPrompt({ force = false, resetManual = false } = {}) {
  const textarea = els.advancedPrompt;
  if (!textarea) return false;
  syncAdvancedPromptHighlight();
  if (resetManual) delete textarea.dataset.promptUserResized;
  if (!force && state.advancedPromptResizing) return false;
  if (!textarea.isConnected || textarea.offsetParent === null || textarea.getClientRects().length === 0) return false;
  const { minimumHeight, maximumHeight } = advancedPromptHeightLimits();
  textarea.style.height = "0px";
  textarea.style.overflowY = "hidden";
  const contentHeight = Math.max(minimumHeight, textarea.scrollHeight + 2);
  const nextHeight = Math.min(maximumHeight, Math.max(minimumHeight, contentHeight));
  textarea.style.height = `${Math.round(nextHeight)}px`;
  textarea.style.overflowY = contentHeight > maximumHeight + 1 ? "auto" : "hidden";
  const handle = els.advancedPromptResizeHandle;
  if (handle) {
    handle.setAttribute("aria-valuemin", String(minimumHeight));
    handle.setAttribute("aria-valuemax", String(Math.round(maximumHeight)));
    handle.setAttribute("aria-valuenow", String(Math.round(nextHeight)));
  }
  return true;
}

function scheduleAutoSizeAdvancedPrompt({ force = false, resetManual = false } = {}) {
  window.requestAnimationFrame(() => autoSizeAdvancedPrompt({ force, resetManual }));
}

function bindAdvancedPromptResizeHandle() {
  const textarea = els.advancedPrompt;
  const handle = els.advancedPromptResizeHandle;
  if (!textarea || !handle || handle.dataset.resizeBound === "true") return;
  handle.dataset.resizeBound = "true";
  const { minimumHeight, maximumHeight } = advancedPromptHeightLimits();
  let startY = 0;
  let startHeight = 0;
  let pointerId = null;

  const resize = (height, { manual = false } = {}) => {
    if (manual) textarea.dataset.promptUserResized = "true";
    const next = Math.max(minimumHeight, Math.min(maximumHeight, height));
    textarea.style.height = `${Math.round(next)}px`;
    textarea.style.overflowY = next >= maximumHeight ? "auto" : "hidden";
    handle.setAttribute("aria-valuemin", String(minimumHeight));
    handle.setAttribute("aria-valuemax", String(Math.round(maximumHeight)));
    handle.setAttribute("aria-valuenow", String(Math.round(next)));
  };
  const finish = () => {
    state.advancedPromptResizing = false;
    if (pointerId !== null && handle.hasPointerCapture?.(pointerId)) handle.releasePointerCapture(pointerId);
    pointerId = null;
    handle.classList.remove("is-resizing");
    document.body.classList.remove("is-resizing-advanced-prompt");
  };

  autoSizeAdvancedPrompt({ force: true, resetManual: true });
  resize(textarea.getBoundingClientRect().height || minimumHeight);
  handle.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    state.advancedPromptResizing = true;
    pointerId = event.pointerId;
    startY = event.clientY;
    startHeight = textarea.getBoundingClientRect().height;
    handle.setPointerCapture?.(pointerId);
    handle.classList.add("is-resizing");
    document.body.classList.add("is-resizing-advanced-prompt");
  });
  handle.addEventListener("pointermove", (event) => {
    if (event.pointerId !== pointerId) return;
    event.preventDefault();
    resize(startHeight + event.clientY - startY, { manual: true });
  });
  handle.addEventListener("pointerup", finish);
  handle.addEventListener("pointercancel", finish);
  handle.addEventListener("lostpointercapture", () => {
    state.advancedPromptResizing = false;
    pointerId = null;
    handle.classList.remove("is-resizing");
    document.body.classList.remove("is-resizing-advanced-prompt");
  });
  handle.addEventListener("keydown", (event) => {
    if (!["ArrowUp", "ArrowDown", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const current = textarea.getBoundingClientRect().height || minimumHeight;
    if (event.key === "Home") resize(minimumHeight, { manual: true });
    else if (event.key === "End") resize(maximumHeight, { manual: true });
    else resize(current + (event.key === "ArrowDown" ? 24 : -24), { manual: true });
  });
}

function restoreRecordProvider(record = {}) {
  const params = recordParams(record);
  const imageProviders = new Set([
    "seedream5-image",
    "qwen-image3",
    "z-image-spicy-pro",
    "qwen-image-edit-spicy",
    "wan27-image-edit",
  ]);
  const explicitProvider = normalizeAdvancedProvider(params.advancedProviderId || "");
  if (imageProviders.has(explicitProvider)) return explicitProvider;
  const candidates = [params.provider, record.provider, record.model, params.model, record.source];
  for (const value of candidates) {
    const provider = normalizeAdvancedProvider(value || "");
    if (imageProviders.has(provider)) return provider;
  }
  const source = String(record.source || record.provider || params.provider || "").toLowerCase();
  if (source.includes("image") || source.includes("wan27-image") || source.includes("wan2.7-image")) return "wan27-image-edit";
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

function restoreRecordImageLimit(record = {}) {
  const provider = restoreRecordProvider(record);
  const params = recordParams(record);
  const capability = String(params.videoCapability || record.mediaMode || "").trim();
  if (provider === "qwen-image3") return ADVANCED_QWEN_IMAGE3_REFERENCE_LIMIT;
  if (provider === "wan30") return ADVANCED_WAN30_IMAGE_REFERENCE_LIMIT;
  if (provider === "seedance25-vega") return vegaReferenceLimits(provider).images;
  if (["seedance25", "seedance-nsfw"].includes(provider)) return ADVANCED_SEEDANCE25_IMAGE_REFERENCE_LIMIT;
  if (["wan27", "happyhorse"].includes(provider)) return advancedAliyunReferenceImageLimit(capability);
  if (provider === "wan27-image-edit" || provider === "qwen-image-edit-spicy") return 1;
  return ADVANCED_SEEDANCE_REFERENCE_LIMIT;
}

function restoreRecordMedia(record = {}) {
  const mediaAssets = Array.isArray(record.mediaAssets) ? record.mediaAssets : [];
  const frameTypes = new Set(["first_frame", "firstframe", "first-frame", "last_frame", "lastframe", "last-frame", "end_frame", "endframe"]);
  const recordedImages = recordImageAssets(record);
  const upstreamItems = upstreamInputMediaItems(record);
  const seenImageKeys = new Set();
  const imageEntries = recordedImages.map((item, index) => ({ item, index })).filter(({ item }) => {
    const type = String(item?.type || item?.key || "").toLowerCase();
    const assetId = restoreMediaAssetId(item);
    const assetUri = restoreMediaAssetUri(item);
    const url = restoreMediaUrl(item);
    const key = assetId ? `asset:${assetId}` : assetUri ? `asset-uri:${assetUri}` : url ? `url:${url}` : "";
    if (!key || seenImageKeys.has(key)) return false;
    seenImageKeys.add(key);
    return !type.includes("audio") && !type.includes("video") && !type.includes("clip");
  });
  const imageAssets = imageEntries.map(({ item }) => item);
  const references = imageAssets.map(restoreReferenceFromMedia).filter(Boolean);
  const firstFrame = imageEntries
    .filter(({ item }) => ["first_frame", "firstframe", "first-frame"].includes(String(item.type || item.key || "").toLowerCase()))
    .map(({ item, index }) => restoreReferenceFromMedia(item, index))[0] || null;
  const lastFrame = imageEntries
    .filter(({ item }) => ["last_frame", "lastframe", "last-frame", "end_frame", "endframe"].includes(String(item.type || item.key || "").toLowerCase()))
    .map(({ item, index }) => restoreReferenceFromMedia(item, index))[0] || null;
  const referenceImages = imageEntries
    .filter(({ item }) => !frameTypes.has(String(item.type || item.key || "").toLowerCase()))
    .map(({ item, index }) => restoreReferenceFromMedia(item, index))
    .filter(Boolean);
  const videoEntries = [...mediaAssets, ...upstreamItems].map((item, index) => ({ item, index }));
  const videos = videoEntries
    .filter(({ item }) => String(item.type || item.key || "").toLowerCase().includes("video") && restoreMediaUrl(item))
    .map(({ item, index }) => ({ ...item, assetId: restoreMediaAssetId(item), assetUri: restoreMediaAssetUri(item), url: restoreMediaUrl(item), order: advancedReferenceOrderValue(item, index + 1) }));
  const audios = videoEntries
    .filter(({ item }) => String(item.type || item.key || "").toLowerCase().includes("audio") && restoreMediaUrl(item))
    .map(({ item, index }) => ({ ...item, assetId: restoreMediaAssetId(item), assetUri: restoreMediaAssetUri(item), url: restoreMediaUrl(item), order: advancedReferenceOrderValue(item, index + 1) }));
  if (!references.length) {
    recordImageAssets(record).forEach((item, index) => {
      const ref = restoreReferenceFromMedia(item, index);
      if (ref) references.push(ref);
    });
  }
  return {
    references: dedupeAdvancedReferenceImages(references).slice(0, restoreRecordImageLimit(record)),
    firstFrame,
    lastFrame,
    referenceImages: dedupeAdvancedReferenceImages(referenceImages).slice(0, restoreRecordImageLimit(record)),
    videos,
    audios,
  };
}

function restoreVegaMediaItem(item = {}, index = 0, kind = "image") {
  const source = typeof item === "string" ? { url: item } : (item && typeof item === "object" ? item : {});
  const assetId = restoreMediaAssetId(source);
  const assetUri = restoreMediaAssetUri(source);
  const sourceUrl = restoreMediaUrl(source) || source.publicUrl || source.cdnUrl || source.previewUrl || "";
  const url = vegaPublicHttpUrl(sourceUrl);
  if (!assetId && !assetUri && !url) return null;
  const name = source.name || source.label || source.fileName || `${kind}-${index + 1}`;
  return {
    ...source,
    assetId,
    assetUri,
    referenceAssetUri: assetUri,
    sourceUrl: url || assetUri || sourceUrl,
    url,
    publicUrl: url || source.publicUrl || "",
    cdnUrl: url || source.cdnUrl || "",
    previewUrl: url || source.previewUrl || "",
    dataUrl: url,
    fileName: source.fileName || name,
    name,
    fromLibrary: Boolean(assetId),
    order: advancedReferenceOrderValue(source, index + 1),
  };
}

function mergeVegaMediaItems(...lists) {
  const merged = [];
  const seen = new Map();
  const hasValue = (value) => value !== undefined && value !== null && String(value).trim() !== "";
  lists.flat().forEach((item, index) => {
    const normalized = restoreVegaMediaItem(item, index, "reference");
    if (!normalized) return;
    const keys = [
      normalized.assetId ? `asset:${normalized.assetId}` : "",
      normalized.assetUri ? `asset-uri:${normalized.assetUri}` : "",
      normalized.url ? `url:${normalized.url}` : "",
      normalized.url ? `asset-url:${normalized.url}` : "",
    ].filter(Boolean);
    const duplicateIndex = keys.map((key) => seen.get(key)).find((value) => value !== undefined);
    if (duplicateIndex !== undefined) {
      merged[duplicateIndex] = {
        ...merged[duplicateIndex],
        ...Object.fromEntries(Object.entries(normalized).filter(([key, value]) => !hasValue(merged[duplicateIndex][key]) && hasValue(value))),
      };
      keys.forEach((key) => seen.set(key, duplicateIndex));
      return;
    }
    const nextIndex = merged.length;
    merged.push(normalized);
    keys.forEach((key) => seen.set(key, nextIndex));
    if (normalized.url) seen.set(`asset-uri:${normalized.url}`, nextIndex);
  });
  return merged;
}

function restoreVegaRecordMedia(record = {}, params = {}) {
  const media = restoreRecordMedia(record);
  const firstNonEmpty = (...values) => values.find((value) => value !== undefined && value !== null && String(value).trim() !== "") || "";
  const firstFrame = restoreVegaMediaItem({
    ...(media.firstFrame || {}),
    assetId: restoreMediaAssetId(media.firstFrame) || firstNonEmpty(params.firstFrameAssetId, params.first_frame_asset_id, params.firstFrameUserAssetId),
    url: firstNonEmpty(media.firstFrame?.url, media.firstFrame?.dataUrl, params.firstFrameUrl, params.first_frame_url, record.firstFrameUrl, record.first_frame_url),
  }, 0, "first-frame");
  const lastFrame = restoreVegaMediaItem({
    ...(media.lastFrame || {}),
    assetId: restoreMediaAssetId(media.lastFrame) || firstNonEmpty(params.lastFrameAssetId, params.last_frame_asset_id, params.lastFrameUserAssetId),
    url: firstNonEmpty(media.lastFrame?.url, media.lastFrame?.dataUrl, params.lastFrameUrl, params.last_frame_url, record.lastFrameUrl, record.last_frame_url),
  }, 0, "last-frame");
  const imageAssetIds = arrayFrom(firstNonEmpty(params.referenceImageAssetIds, params.reference_image_asset_ids));
  const videoAssetIds = arrayFrom(firstNonEmpty(params.referenceVideoAssetIds, params.reference_video_asset_ids));
  const audioAssetIds = arrayFrom(firstNonEmpty(params.referenceAudioAssetIds, params.reference_audio_asset_ids));
  const withAssetIds = (items, ids) => items.map((item, index) => ({
    ...item,
    assetId: item.assetId || String(ids[index] || "").trim(),
  }));
  const referenceImages = withAssetIds(mergeVegaMediaItems(
    arrayFrom(firstNonEmpty(params.referenceImages, params.reference_images)),
    arrayFrom(record.referenceImages),
    media.referenceImages,
  ), imageAssetIds);
  const referenceVideos = withAssetIds(mergeVegaMediaItems(
    arrayFrom(firstNonEmpty(params.referenceVideos, params.reference_videos)),
    arrayFrom(record.referenceVideos),
    media.videos,
  ), videoAssetIds);
  const referenceAudios = withAssetIds(mergeVegaMediaItems(
    arrayFrom(firstNonEmpty(params.referenceAudios, params.reference_audios)),
    arrayFrom(record.referenceAudios),
    media.audios,
  ), audioAssetIds);
  const mediaSourceValue = (item) => item?.sourceUrl || item?.url || item?.assetUri || item?.referenceAssetUri || "";
  return {
    firstFrame,
    lastFrame,
    firstFrameAssetId: firstFrame?.assetId || "",
    firstFrameUrl: mediaSourceValue(firstFrame),
    lastFrameAssetId: lastFrame?.assetId || "",
    lastFrameUrl: mediaSourceValue(lastFrame),
    referenceImages,
    referenceImageUrls: referenceImages.map(mediaSourceValue).filter(Boolean),
    referenceVideos,
    referenceVideoUrls: referenceVideos.map(mediaSourceValue).filter(Boolean),
    referenceAudios,
    referenceAudioUrls: referenceAudios.map(mediaSourceValue).filter(Boolean),
  };
}

async function refreshedRegenerationRecord(record = {}) {
  const taskId = String(record?.taskId || "").trim();
  if (!taskId) return record;
  try {
    const payload = await requestJson(`/api/generation-records/${encodeURIComponent(taskId)}`);
    if (payload.user) setUser(payload.user);
    return payload.record || payload.generation || record;
  } catch (_error) {
    return record;
  }
}

function restoreRecordToAdvancedCreate(record = {}, button = null) {
  if (!record?.taskId && !record?.prompt && !record?.params) return;
  const params = recordParams(record);
  const provider = restoreRecordProvider(record);
  const { references, videos, audios } = restoreRecordMedia(record);
  const seedanceMode = restoreSeedanceMode(record, references, videos, audios);
  const wanMode = restoreWanMode(record, videos, audios);
  const ratio = normalizeVideoRatio(record.ratio || params.ratio || params.aspect_ratio || "9:16");
  const resolution = normalizeAdvancedResolution(record.resolution || params.resolution || (isAdvancedImageProvider(provider) ? "2K" : "720p"), provider);
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
    autoSizeAdvancedPrompt({ force: true, resetManual: true });
  }
  if (els.advancedRatio) els.advancedRatio.value = ratio;
  if (els.advancedResolution) els.advancedResolution.value = resolution;
  if (els.advancedDuration) els.advancedDuration.value = duration;
  if (els.advancedWanSeed) els.advancedWanSeed.value = params.seed || params.parameters?.seed || "";
  if (els.advancedWanPromptExtend) els.advancedWanPromptExtend.checked = ["wan30-video", "wan30-video-pro", "wan30-video-prime", "wan30-video-prime-pro"].includes(restoredCapability)
    && advancedBoolFromValue(params.prompt_extend ?? params.promptExtend ?? params.parameters?.prompt_extend ?? params.parameters?.promptExtend, false);
  if (els.advancedWanPromptOptimize) els.advancedWanPromptOptimize.checked = ["wan30-video", "wan30-video-pro", "wan30-video-prime", "wan30-video-prime-pro"].includes(restoredCapability)
    && advancedBoolFromValue(params.wan_prompt_optimize ?? params.wanPromptOptimize ?? params.parameters?.wan_prompt_optimize ?? params.parameters?.wanPromptOptimize, false);
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
  if (["qwen37-flash", "byteplus-language", "papaya"].includes(provider)) {
    if (els.advancedQwen37Thinking) els.advancedQwen37Thinking.value = advancedBoolFromValue(params.enable_thinking ?? params.enableThinking, false) ? "true" : "false";
    if (els.advancedQwen37MaxTokens) els.advancedQwen37MaxTokens.value = String(Math.max(1, Math.min(8192, Number(params.max_tokens || params.maxTokens || 1024))));
    if (els.advancedQwen37Temperature) els.advancedQwen37Temperature.value = String(Math.max(0, Math.min(2, Number(params.temperature ?? 0.7))));
  }
  if (els.advancedSeedanceMediaMode) els.advancedSeedanceMediaMode.value = seedanceMode;
  if (els.advancedWanMediaMode) els.advancedWanMediaMode.value = wanMode;
  state.advancedSeedanceGenerateAudio = advancedBoolFromValue(params.generateAudio ?? params.generate_audio ?? record.generateAudio ?? record.generate_audio, true);
  if (els.advancedSeedanceGenerateAudio) els.advancedSeedanceGenerateAudio.value = state.advancedSeedanceGenerateAudio ? "true" : "false";
  if (isVegaAdvancedProvider(provider)) {
    const media = restoreVegaRecordMedia(record, params);
    const explicitMediaMode = firstPresent(
      record.mediaMode,
      params.mediaMode,
      params.seedanceMode,
      params.functionMode,
      "",
    );
    const inferredMediaMode = media.firstFrameUrl && media.lastFrameUrl
      ? "first_last_frame"
      : media.firstFrameUrl
      ? "first_frame"
      : media.lastFrameUrl
      ? "last_frame"
      : (media.referenceImages.length || media.referenceVideos.length || media.referenceAudios.length)
      ? "reference_video"
      : "text_to_video";
    const restoredDraftTaskId = normalizeAdvancedVegaDraftTaskId(firstPresent(params.draftTaskId, params.draft_task_id, record.draftTaskId, "") || "");
    const restoredDraftFollowup = Boolean(vegaCapabilities(provider)?.draft) && normalizeVegaUiMediaMode(explicitMediaMode) === "draft_followup" && Boolean(restoredDraftTaskId);
    const vegaMediaMode = normalizeVegaUiMediaMode(restoredDraftFollowup ? "draft_followup" : explicitMediaMode || inferredMediaMode);
    const rawVegaRatio = String(record.ratio || params.ratio || params.aspect_ratio || "16:9").trim();
    const vegaRatio = VEGA_ALL_RATIOS.includes(rawVegaRatio) ? rawVegaRatio : "16:9";
    const vegaDurationBounds = advancedDurationBounds(provider);
    const rawVegaDuration = Number(record.duration ?? params.duration ?? params.durationSeconds ?? vegaDurationBounds.fallback);
    const vegaDuration = rawVegaDuration === -1 && vegaDurationBounds.smart
      ? "-1"
      : String(Number.isFinite(rawVegaDuration)
        ? Math.min(vegaDurationBounds.max, Math.max(vegaDurationBounds.min, rawVegaDuration))
        : vegaDurationBounds.fallback);
    if (els.advancedSeedanceMediaMode) els.advancedSeedanceMediaMode.value = vegaMediaMode;
    if (els.advancedRatio) els.advancedRatio.value = vegaRatio;
    if (els.advancedResolution) els.advancedResolution.value = normalizeAdvancedResolution(record.resolution || params.resolution, provider);
    if (els.advancedDuration) els.advancedDuration.value = vegaDuration;
    if (els.advancedWanSeed) els.advancedWanSeed.value = record.seed ?? params.seed ?? params.parameters?.seed ?? "";
    if (els.advancedVegaTaskType) els.advancedVegaTaskType.value = firstPresent(params.taskType, params.omniReferenceTaskType, "auto") || "auto";
    if (els.advancedVegaDraft) els.advancedVegaDraft.checked = advancedBoolFromValue(params.draft ?? record.draft, false);
    if (els.advancedVegaDraftTaskId) els.advancedVegaDraftTaskId.value = restoredDraftFollowup ? restoredDraftTaskId : "";
    if (els.advancedVegaAssetGroupId) els.advancedVegaAssetGroupId.value = firstPresent(params.assetGroupId, params.asset_group_id, "") || "";
    if (els.advancedVegaReturnLastFrame) els.advancedVegaReturnLastFrame.checked = advancedBoolFromValue(firstPresent(params.returnLastFrame, params.return_last_frame), false);
    if (els.advancedVegaReturnUsage) els.advancedVegaReturnUsage.checked = advancedBoolFromValue(firstPresent(params.returnVegaUsage, params.return_vega_usage), false);
    if (els.advancedVegaEnhancePromptMode) els.advancedVegaEnhancePromptMode.value = String(firstPresent(params.enhancePromptMode, params.enhance_prompt_mode, "auto") || "auto");
    if (els.advancedVegaModerationMode) els.advancedVegaModerationMode.value = String(firstPresent(params.moderationMode, params.moderation_mode, "Moderation_L1") || "Moderation_L1");
    if (els.advancedVegaGenerateMode) els.advancedVegaGenerateMode.value = String(firstPresent(params.generateMode, params.generate_mode, "Standard") || "Standard");
    if (els.advancedVegaQualityMode) els.advancedVegaQualityMode.value = String(firstPresent(params.videoQualityMode, params.video_quality_mode, "Standard") || "Standard");
    if (els.advancedVegaOutputFormat) els.advancedVegaOutputFormat.value = String(firstPresent(params.outputFormat, params.output_format, "mp4") || "mp4");
    state.advancedFirstFrameAssetId = "";
    state.advancedSeedanceFirstFrameAssetId = "";
    state.advancedSeedanceFirstFrameDataUrl = "";
    state.advancedSeedanceLastFrameAssetId = "";
    state.advancedSeedanceLastFrameDataUrl = "";
    state.advancedReferenceImages = [];
    setAdvancedSeedanceVideoReferences([]);
    setAdvancedSeedanceAudioReferences([]);
    state.advancedUploadDataUrl = "";
    if (vegaMediaMode === "first_frame" || vegaMediaMode === "first_last_frame") {
      state.advancedSeedanceFirstFrameAssetId = media.firstFrameAssetId;
      state.advancedSeedanceFirstFrameDataUrl = media.firstFrameUrl;
      state.advancedFirstFrameAssetId = media.firstFrameAssetId;
    }
    if (vegaMediaMode === "last_frame" || vegaMediaMode === "first_last_frame") {
      state.advancedSeedanceLastFrameAssetId = media.lastFrameAssetId;
      state.advancedSeedanceLastFrameDataUrl = media.lastFrameUrl;
    }
    if (vegaMediaMode === "reference_video") {
      state.advancedReferenceImages = media.referenceImages.map((item, index) => {
        const sourceUrl = item.sourceUrl || item.url || item.assetUri || "";
        return stampAdvancedReferenceOrder({
          ...item,
          assetId: item.assetId || "",
          dataUrl: item.url || "",
          url: sourceUrl,
          fileName: item.fileName || `reference-${index + 1}`,
          name: item.name || `Reference ${index + 1}`,
          fromLibrary: Boolean(item.assetId),
        });
      });
      state.advancedUploadDataUrl = state.advancedReferenceImages[0]?.url || "";
      setAdvancedSeedanceVideoReferences(media.referenceVideos.map((item, index) => {
        const sourceUrl = item.sourceUrl || item.url || item.assetUri || "";
        return {
          ...item,
          assetId: item.assetId || "",
          url: sourceUrl,
          previewUrl: item.url || "",
          name: item.name || `Video ${index + 1}`,
          fileName: item.fileName || `video-${index + 1}`,
        };
      }));
      setAdvancedSeedanceAudioReferences(media.referenceAudios.map((item, index) => {
        const sourceUrl = item.sourceUrl || item.url || item.assetUri || "";
        return {
          ...item,
          assetId: item.assetId || "",
          url: sourceUrl,
          previewUrl: item.url || "",
          name: item.name || `Audio ${index + 1}`,
          fileName: item.fileName || `audio-${index + 1}`,
        };
      }));
    }
    state.advancedAssetTarget = vegaModeNeedsFirstFrame(vegaMediaMode)
      ? "primary"
      : vegaModeNeedsLastFrame(vegaMediaMode)
      ? "lastFrame"
      : "referenceImages";
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
    return;
  }
  const restoredSeedanceFirstFrame = ["seedance", "seedance25", "seedance-nsfw", "wan30"].includes(provider) && seedanceModeNeedsFirstFrame(seedanceMode) ? (references[0] || null) : null;
  state.advancedReferenceImages = restoredSeedanceFirstFrame
    ? references.slice(1)
    : provider === "qwen-image3"
    ? references.slice(0, ADVANCED_QWEN_IMAGE3_REFERENCE_LIMIT)
    : ["qwen37-flash", "byteplus-language"].includes(provider)
    ? []
    : references;
  state.advancedUploadDataUrl = restoredSeedanceFirstFrame ? "" : (references[0]?.dataUrl || "");
  if (isAdvancedImageProvider(provider)) {
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

function normalizeAdvancedSeed(value, { min = 1, max = 2147483647 } = {}) {
  if (value === undefined || value === null) return undefined;
  const text = String(value).trim();
  if (!text) return undefined;
  const seed = Number(text);
  if (!Number.isSafeInteger(seed) || seed < min || seed > max) return undefined;
  return seed;
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
  if (els.advancedProvider) els.advancedProvider.value = action === "modify" ? "qwen-image-edit-spicy" : "seedance";
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
    if (action === "modify" && els.advancedPrompt) {
      els.advancedPrompt.value = "";
      autoSizeAdvancedPrompt({ force: true, resetManual: true });
    }
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
  const images = (Array.isArray(state.advancedReferenceImages) ? [...state.advancedReferenceImages] : [])
    .sort((left, right) => advancedReferenceOrderValue(left) - advancedReferenceOrderValue(right) || 0);
  const normalizedProvider = normalizeAdvancedProvider(provider);
  if (normalizedProvider === "wan27-image-edit" || isAdvancedImageProvider(normalizedProvider)) return images.slice(0, (normalizedProvider === "qwen-image-edit-spicy" || normalizedProvider === "wan27-image-edit") && advancedCreateModeUsesSingleUpload() ? 1 : ADVANCED_SEEDANCE_REFERENCE_LIMIT);
  if (normalizedProvider === "qwen-image3") return images.slice(0, ADVANCED_QWEN_IMAGE3_REFERENCE_LIMIT);
  if (normalizedProvider === "seedream5-image") return images.slice(0, ADVANCED_SEEDANCE_REFERENCE_LIMIT);
  if (normalizedProvider === "wan30") return images.slice(0, ADVANCED_WAN30_IMAGE_REFERENCE_LIMIT);
  if (["wan27", "happyhorse"].includes(normalizedProvider)) return images.slice(0, advancedAliyunReferenceImageLimit());
  if (["seedance25", "seedance-nsfw"].includes(normalizedProvider)) return images.slice(0, ADVANCED_SEEDANCE25_IMAGE_REFERENCE_LIMIT);
  if (isVegaProviderId(normalizedProvider)) return images.slice(0, vegaReferenceLimits(normalizedProvider).images);
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
  if (isAdvancedImageProvider(provider)) {
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

