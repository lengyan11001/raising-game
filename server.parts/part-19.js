function emptySeedanceContentMediaSummary() {
  return {
    firstImages: [],
    lastImages: [],
    referenceImages: [],
    videos: [],
    audios: [],
  };
}

function safeSeedanceContentMediaSummary(content = []) {
  try {
    return seedanceContentMediaSummary(content);
  } catch {
    return emptySeedanceContentMediaSummary();
  }
}

function seedanceContentHasMedia(content = []) {
  const summary = safeSeedanceContentMediaSummary(content);
  return Boolean(
    summary.firstImages.length ||
    summary.lastImages.length ||
    summary.referenceImages.length ||
    summary.videos.length ||
    summary.audios.length
  );
}

function seedancePromptFromContent(content = []) {
  return (Array.isArray(content) ? content : [])
    .map((item) => normalizeSeedanceContentItem(item))
    .map((item) => {
      if (typeof item === "string") return item;
      if (!item || typeof item !== "object" || Array.isArray(item)) return "";
      if (item.type === "text" || item.text !== undefined) return String(item.text || "");
      return "";
    })
    .filter(Boolean)
    .join("\n")
    .trim();
}

function mergeSeedanceMediaList(existing = [], additions = []) {
  const merged = [];
  const seen = new Set();
  [...arrayFromBody(existing), ...arrayFromBody(additions)].forEach((item) => {
    const key = nestedMediaUrl(item) || String(item || "").trim();
    if (!key || seen.has(key)) return;
    seen.add(key);
    merged.push(item);
  });
  return merged;
}

function seedanceBodyWithContentMediaFields(body = {}) {
  if (!Array.isArray(body.content) || !seedanceContentHasMedia(body.content)) return body;
  const summary = seedanceContentMediaSummary(body.content);
  const next = { ...body };
  if (summary.firstImages.length && !firstPresent(next.image_url, next.imageUrl, next.firstFrameUrl, next.first_frame_url, next.imageAssetId, next.firstFrameAssetId)) {
    next.image_url = summary.firstImages[0];
  }
  if (summary.lastImages.length && !firstPresent(next.end_image_url, next.endImageUrl, next.lastFrameUrl, next.last_frame_url, next.endImageAssetId, next.lastFrameAssetId)) {
    next.end_image_url = summary.lastImages[0];
  }
  if (summary.referenceImages.length) {
    next.referenceImages = mergeSeedanceMediaList(next.referenceImages, summary.referenceImages);
  }
  if (summary.videos.length) {
    next.referenceVideoUrls = mergeSeedanceMediaList(next.referenceVideoUrls, summary.videos);
  }
  if (summary.audios.length) {
    next.referenceAudioUrls = mergeSeedanceMediaList(next.referenceAudioUrls, summary.audios);
  }
  delete next.content;
  return next;
}

async function validateSeedanceAdvancedMediaRules({
  requestParams = {},
  seedanceMode = "",
  seedanceFirstFrameAsset = null,
  seedanceEndFrameAsset = null,
  userAsset = null,
  extraUserAssets = [],
  referenceImageAssetUris = [],
  referenceVideoAssetIds = [],
  referenceVideoAssets = [],
  referenceVideoAssetUris = [],
  referenceAudioAssetIds = [],
  referenceAudioAssetUris = [],
} = {}) {
  const mode = normalizeSeedanceMode(seedanceMode);
  const contentSummary = seedanceContentMediaSummary(requestParams.content);
  const rawFirstFrameUrls = [
    firstPresent(requestParams.image_url, requestParams.firstFrameUrl, requestParams.imageUrl),
    ...contentSummary.firstImages,
  ].map((item) => String(item || "").trim()).filter(Boolean);
  const rawLastFrameUrls = [
    firstPresent(requestParams.end_image_url, requestParams.lastFrameUrl, requestParams.endImageUrl),
    ...contentSummary.lastImages,
  ].map((item) => String(item || "").trim()).filter(Boolean);
  rawFirstFrameUrls.forEach((url, index) => assertSeedanceMediaUrl(url, `Seedance first frame ${index + 1}`, { kind: "image" }));
  rawLastFrameUrls.forEach((url, index) => assertSeedanceMediaUrl(url, `Seedance last frame ${index + 1}`, { kind: "image" }));

  const rawReferenceImageUrls = [
    ...seedanceRawArrayUrls(requestParams.reference_images, "image", "Seedance reference image"),
    ...contentSummary.referenceImages,
  ];
  const rawReferenceVideoUrls = [
    ...seedanceRawArrayUrls(requestParams.reference_videos, "video", "Seedance reference video"),
    ...contentSummary.videos,
  ];
  const rawReferenceAudioUrls = [
    ...seedanceRawArrayUrls(requestParams.reference_audios, "audio", "Seedance reference audio"),
    ...contentSummary.audios,
  ];
  await validateSeedanceRawImageUrlsForRequest([
    ...rawFirstFrameUrls,
    ...rawLastFrameUrls,
    ...rawReferenceImageUrls,
  ]);

  const firstFrameCount = seedanceFirstFrameAsset || rawFirstFrameUrls.length ? 1 : 0;
  const lastFrameCount = seedanceEndFrameAsset || rawLastFrameUrls.length ? 1 : 0;
  const referenceImageRefs = new Set([
    ...(userAsset ? [`asset:${userAsset.id}`] : []),
    ...extraUserAssets.map((asset) => `asset:${asset.id}`),
    ...arrayFromBody(referenceImageAssetUris).map((uri) => String(uri || "").trim()).filter(Boolean),
    ...rawReferenceImageUrls,
  ]);
  const referenceVideoRefs = new Set([
    ...arrayFromBody(referenceVideoAssetIds).map((id) => `asset:${id}`),
    ...arrayFromBody(referenceVideoAssetUris).map((uri) => String(uri || "").trim()).filter(Boolean),
    ...rawReferenceVideoUrls,
  ]);
  const referenceAudioRefs = new Set([
    ...arrayFromBody(referenceAudioAssetIds).map((id) => `asset:${id}`),
    ...arrayFromBody(referenceAudioAssetUris).map((uri) => String(uri || "").trim()).filter(Boolean),
    ...rawReferenceAudioUrls,
  ]);
  const referenceImageCount = [...referenceImageRefs].filter(Boolean).length;
  const referenceVideoCount = [...referenceVideoRefs].filter(Boolean).length;
  const referenceAudioCount = [...referenceAudioRefs].filter(Boolean).length;
  const totalImageInputs = firstFrameCount + lastFrameCount + referenceImageCount;
  if (seedanceModeNeedsFirstFrame(mode) && (referenceImageCount > 0 || referenceVideoCount > 0 || referenceAudioCount > 0 || requestParams.draft || requestParams.draft_task || requestParams.draftTask)) {
    throw advancedValidationError(
      "SEEDANCE_FRAME_REFERENCE_MIX_UNSUPPORTED",
      "Seedance first/last-frame mode cannot be mixed with reference images, reference videos, reference audios, or draft references. Use reference_video mode for multimodal references, or remove the extra references.",
    );
  }

  if (totalImageInputs > ADVANCED_SEEDANCE_REFERENCE_LIMIT) {
    throw advancedValidationError("TOO_MANY_SEEDANCE_IMAGES", `Seedance supports at most ${ADVANCED_SEEDANCE_REFERENCE_LIMIT} image inputs total.`, {
      totalImageInputs,
      max: ADVANCED_SEEDANCE_REFERENCE_LIMIT,
    });
  }
  if (referenceVideoCount > ADVANCED_SEEDANCE_VIDEO_REFERENCE_LIMIT) {
    throw advancedValidationError("TOO_MANY_SEEDANCE_VIDEOS", `Seedance supports at most ${ADVANCED_SEEDANCE_VIDEO_REFERENCE_LIMIT} reference videos.`, {
      referenceVideoCount,
      max: ADVANCED_SEEDANCE_VIDEO_REFERENCE_LIMIT,
    });
  }
  await validateSeedanceReferenceVideoDurationsForRequest({
    assets: referenceVideoAssets,
    urls: [...arrayFromBody(referenceVideoAssetUris), ...rawReferenceVideoUrls],
  });
  if (referenceAudioCount > ADVANCED_SEEDANCE_AUDIO_REFERENCE_LIMIT) {
    throw advancedValidationError("TOO_MANY_SEEDANCE_AUDIOS", `Seedance supports at most ${ADVANCED_SEEDANCE_AUDIO_REFERENCE_LIMIT} reference audios.`, {
      referenceAudioCount,
      max: ADVANCED_SEEDANCE_AUDIO_REFERENCE_LIMIT,
    });
  }
  if (seedanceModeNeedsFirstFrame(mode) && !firstFrameCount) {
    throw advancedValidationError("MISSING_FIRST_FRAME", "Seedance first-frame mode requires imageUrl, firstFrameUrl, imageAssetId, firstFrameAssetId, or dataUrl.");
  }
  if (seedanceModeNeedsEndFrame(mode) && !lastFrameCount) {
    throw advancedValidationError("MISSING_LAST_FRAME", "Seedance first/last-frame mode requires endImageUrl, lastFrameUrl, endImageAssetId, lastFrameAssetId, or endImageDataUrl.");
  }
  const hasReferenceMedia = referenceImageCount > 0 || referenceVideoCount > 0 || referenceAudioCount > 0;
  if (referenceAudioCount > 0 && firstFrameCount + lastFrameCount + referenceImageCount + referenceVideoCount < 1) {
    throw advancedValidationError("AUDIO_REQUIRES_VISUAL_MEDIA", "Seedance audio references must be combined with an image or video reference.");
  }
}

async function createUserImageAssetsFromInputs(db, user, inputs = [], { name = "Reference" } = {}) {
  const assets = [];
  for (let index = 0; index < inputs.length; index += 1) {
    const item = inputs[index];
    if (!item) continue;
    if (typeof item === "string") {
      const text = item.trim().startsWith("/") ? publicUrlForAssetPath(item.trim()) : item.trim();
      if (!text || text.startsWith("asset://")) continue;
      if (isPublicHttpUrl(text)) {
        const pathname = new URL(text).pathname;
        const asset = await createUserMediaAssetFromPublicUrl(db, user, {
          url: text,
          fileName: path.basename(pathname) || "",
          name: `${name} ${index + 1}`,
          sourceUrl: text,
        });
        validateWan27MediaKind(asset, "image", `${name} ${index + 1}`);
        assets.push(asset);
      } else {
        assets.push(await createUserAssetFromDataUrl(db, user, {
          dataUrl: text,
          name: `${name} ${index + 1}`,
        }));
      }
      continue;
    }
    if (item.dataUrl) {
      const rawDataUrl = String(item.dataUrl || "").trim();
      const dataImageUrl = rawDataUrl.startsWith("/") ? publicUrlForAssetPath(rawDataUrl) : rawDataUrl;
      const itemSourceUrl = String(item.sourceUrl || item.originalUrl || dataImageUrl || "").trim();
      if (isPublicHttpUrl(dataImageUrl)) {
        const pathname = new URL(dataImageUrl).pathname;
        const asset = await createUserMediaAssetFromPublicUrl(db, user, {
          url: dataImageUrl,
          fileName: item.fileName || path.basename(pathname) || "",
          name: item.name || `${name} ${index + 1}`,
          sourceUrl: itemSourceUrl || dataImageUrl,
          hidden: Boolean(item.fromPreset),
          meta: {
            fromPreset: Boolean(item.fromPreset),
            presetId: item.presetId || "",
            presetSlot: item.presetSlot || "",
          },
        });
        validateWan27MediaKind(asset, "image", `${name} ${index + 1}`);
        assets.push(asset);
      } else {
        assets.push(await createUserAssetFromDataUrl(db, user, {
          dataUrl: rawDataUrl,
          fileName: item.fileName || "",
          name: item.name || `${name} ${index + 1}`,
        }));
      }
    } else if (item.url || item.imageUrl) {
      const rawImageUrl = String(item.url || item.imageUrl || "").trim();
      const imageUrl = rawImageUrl.startsWith("/") ? publicUrlForAssetPath(rawImageUrl) : rawImageUrl;
      if (!isPublicHttpUrl(imageUrl)) {
        const error = new Error("Reference image URL must be a public http(s) URL.");
        error.statusCode = 400;
        throw error;
      }
      const pathname = new URL(imageUrl).pathname;
      const asset = await createUserMediaAssetFromPublicUrl(db, user, {
        url: imageUrl,
        fileName: item.fileName || path.basename(pathname) || "",
        name: item.name || `${name} ${index + 1}`,
        sourceUrl: item.sourceUrl || item.originalUrl || imageUrl,
        hidden: Boolean(item.fromPreset),
        meta: {
          fromPreset: Boolean(item.fromPreset),
          presetId: item.presetId || "",
          presetSlot: item.presetSlot || "",
        },
      });
      validateWan27MediaKind(asset, "image", `${name} ${index + 1}`);
      assets.push(asset);
    } else if (item.assetId) {
      const asset = (db.userAssets || []).find((entry) => entry.id === String(item.assetId || "").trim() && entry.userId === user.id && !isSoftDeleted(entry));
      if (!asset) {
        const error = new Error("Reference image not found.");
        error.statusCode = 404;
        throw error;
      }
      assets.push(asset);
    }
  }
  return assets;
}

function urlPathForExtension(value = "") {
  const text = String(value || "").trim();
  if (!text) return "";
  try {
    return new URL(text).pathname;
  } catch (error) {
    return text.split("#")[0].split("?")[0];
  }
}

function validateWan27MediaKind(assetOrUrl = {}, expectedKind = "image", label = "Media") {
  const reject = (message) => {
    const error = new Error(message);
    error.statusCode = 400;
    error.code = "MEDIA_KIND_INVALID";
    throw error;
  };
  const mime = String(assetOrUrl.mime || "").toLowerCase();
  if (mime) {
    if (expectedKind === "image" && !mime.startsWith("image/")) reject(`${label} must be an image.`);
    if (expectedKind === "audio" && !mime.startsWith("audio/")) reject(`${label} must be audio.`);
    if (expectedKind === "video" && !mime.startsWith("video/")) reject(`${label} must be a video.`);
    if (expectedKind === "document" && !WAN30_DOCUMENT_MIMES.has(mime)) reject(`${label} must be a supported document.`);
  }
  const url = String(assetOrUrl.url || assetOrUrl.publicUrl || assetOrUrl.localUrl || "");
  // Read the extension from the url path: a host name is not a file type, so
  // "https://cdn.example.com/" must not look like a ".com" upload.
  const ext = path.extname(urlPathForExtension(url)).toLowerCase();
  if (!mime && ext) {
    if (expectedKind === "image" && ![".jpg", ".jpeg", ".png", ".bmp", ".webp"].includes(ext)) reject(`${label} must be an image URL.`);
    if (expectedKind === "audio" && ![".mp3", ".wav", ".m4a", ".aac", ".ogg"].includes(ext)) reject(`${label} must be an audio URL.`);
    if (expectedKind === "video" && ![".mp4", ".webm", ".mov", ".m4v"].includes(ext)) reject(`${label} must be a video URL.`);
    if (expectedKind === "document" && !WAN30_DOCUMENT_EXTENSIONS.has(ext)) reject(`${label} must be a supported document URL.`);
  }
}

async function resolveWan27MediaSlot({ db, user, body, slot, fallbackAsset = null } = {}) {
  let asset = null;
  let url = mediaUrlFromBody(body, slot.key);
  const dataUrl = mediaDataUrlFromBody(body, slot.key);
  const assetId = mediaAssetIdFromBody(body, slot.key);
  if (!url && slot.key === "firstFrame" && body.dataUrl) {
    asset = fallbackAsset;
  } else if (dataUrl) {
    asset = await createUserWanMediaAssetFromDataUrl(db, user, {
      dataUrl,
      fileName: mediaFileNameFromBody(body, slot.key),
      name: `Wan ${slot.label}`,
    });
  } else if (assetId) {
    asset = (db.userAssets || []).find((entry) => entry.id === assetId && entry.userId === user.id && !isSoftDeleted(entry));
    if (!asset) {
      const error = new Error(`${slot.label} asset not found.`);
      error.statusCode = 404;
      throw error;
    }
  }

  if (asset) {
    validateWan27MediaKind(asset, slot.mediaKind, slot.label);
    asset = await ensurePublicUrlForUserMediaAsset(db, asset);
    url = publicUrlForLocalAsset(asset);
  }
  if (!url || !isPublicHttpUrl(url)) {
    const error = new Error(`Wan2.7 requires ${slot.label}.`);
    error.statusCode = 400;
    throw error;
  }
  validateWan27MediaKind({ url }, slot.mediaKind, slot.label);
  return {
    type: slot.type,
    url,
    key: slot.key,
    mediaKind: slot.mediaKind,
    userAssetId: asset?.id || "",
    localUrl: asset?.localUrl || "",
    mime: asset?.mime || "",
  };
}

async function resolveWan27Media({ db, user, body, requestParams, fallbackAsset = null } = {}) {
  const mediaMode = normalizeWan27MediaMode(requestParams.mediaMode || body.mediaMode || body.wanMode || body.wanMediaMode);
  const slots = wan27MediaSlotsForMode(mediaMode);
  const media = [];
  for (const slot of slots) {
    media.push(await resolveWan27MediaSlot({ db, user, body, slot, fallbackAsset }));
  }
  return { mediaMode, media };
}

function aliyunBodyLayers(body = {}) {
  const layers = [];
  const seen = new Set();
  const add = (value) => {
    if (!value || typeof value !== "object" || Array.isArray(value) || seen.has(value)) return;
    seen.add(value);
    layers.push(value);
    for (const key of ["input", "params", "parameters", "data", "payload"]) add(value[key]);
  };
  add(body);
  return layers;
}

function aliyunBodyField(body = {}, ...keys) {
  for (const layer of aliyunBodyLayers(body)) {
    for (const key of keys) {
      const value = layer?.[key];
      if (value !== undefined && value !== null && value !== "") return value;
    }
  }
  return undefined;
}

function aliyunBodyArrayField(body = {}, ...keys) {
  const values = [];
  for (const layer of aliyunBodyLayers(body)) {
    for (const key of keys) {
      const value = layer?.[key];
      if (value === undefined || value === null || value === "") continue;
      values.push(...arrayFromBody(value));
    }
  }
  return values;
}

function aliyunBodyMediaItems(body = {}) {
  const items = [];
  for (const layer of aliyunBodyLayers(body)) {
    for (const key of ["media", "mediaItems", "media_items", "content"]) {
      items.push(...arrayFromBody(layer?.[key]));
    }
  }
  return items.filter((item) => item && typeof item === "object" && !Array.isArray(item));
}

function aliyunMediaEntryRole(value = {}) {
  return String(firstPresent(
    value.role,
    value.type,
    value.mediaRole,
    value.media_role,
    value.kind,
    "",
  ) || "").replace(/([a-z0-9])([A-Z])/g, "$1_$2").trim().toLowerCase().replace(/[\s-]+/g, "_");
}

function aliyunMediaEntryKind(value = {}) {
  const role = aliyunMediaEntryRole(value);
  if (/(^|_)(first|last|start|end|reference)?_?(frame|image)(_|$)/.test(role) || role === "image_url" || role === "reference") {
    if (/(^|_)(first|last|start|end)_(frame|image)(_|$)/.test(role) || role.includes("reference")) {
      if (role.includes("video")) return "video";
      if (role.includes("audio")) return "audio";
      if (role.includes("file") || role.includes("document")) return "document";
      return "image";
    }
  }
  if (role.includes("video")) return "video";
  if (role.includes("audio")) return "audio";
  if (role.includes("file") || role.includes("document") || role.includes("attachment")) return "document";
  if (role.includes("image") || role.includes("frame") || role.includes("picture") || role.includes("photo")) return "image";
  if (firstPresent(value.image_url, value.imageUrl, value.image)) return "image";
  if (firstPresent(value.video_url, value.videoUrl, value.video)) return "video";
  if (firstPresent(value.audio_url, value.audioUrl, value.audio)) return "audio";
  return "";
}

function aliyunMediaLocator(value) {
  if (typeof value === "string") return value.trim();
  if (Array.isArray(value)) {
    for (const item of value) {
      const locator = aliyunMediaLocator(item);
      if (locator) return locator;
    }
    return "";
  }
  if (!value || typeof value !== "object") return "";
  for (const key of [
    "url", "uri", "image_url", "imageUrl", "video_url", "videoUrl", "audio_url", "audioUrl",
    "file_url", "fileUrl", "source_url", "sourceUrl", "public_url", "publicUrl",
    "dataUrl", "data_url", "assetUri", "asset_uri", "image", "video", "audio", "file",
  ]) {
    const locator = aliyunMediaLocator(value[key]);
    if (locator) return locator;
  }
  return nestedMediaUrl(value);
}

function aliyunMediaInput(value, defaults = {}) {
  if (!value) return null;
  const base = { ...defaults };
  if (typeof value === "string") {
    const text = value.trim();
    if (!text) return null;
    if (text.startsWith("asset://")) return { ...base, assetId: text.slice("asset://".length) };
    if (text.startsWith("data:")) return { ...base, dataUrl: text };
    return { ...base, url: text };
  }
  if (typeof value !== "object" || Array.isArray(value)) return null;
  const assetId = String(firstPresent(value.assetId, value.asset_id, value.userAssetId, value.user_asset_id, "") || "").trim();
  let dataUrl = String(firstPresent(value.dataUrl, value.data_url, "") || "");
  const locator = aliyunMediaLocator(value);
  if (!dataUrl && locator.startsWith("data:")) dataUrl = locator;
  const url = dataUrl ? "" : locator;
  const fileName = String(firstPresent(value.fileName, value.file_name, value.name, "") || "");
  const referenceVoice = String(firstPresent(value.referenceVoice, value.reference_voice, "") || "").trim();
  if (!assetId && !dataUrl && !url) return null;
  return { ...base, assetId, dataUrl, url, fileName, referenceVoice };
}

function aliyunMediaInputs(values = [], defaults = {}) {
  const seen = new Set();
  return arrayFromBody(values).map((item) => aliyunMediaInput(item, defaults)).filter((input) => {
    if (!input) return false;
    const locator = input.dataUrl
      ? `data:${input.dataUrl}`
      : input.assetId
      ? `asset:${input.assetId}`
      : input.url
      ? `url:${input.url}`
      : "";
    const identity = `${input.type || defaults.type || "media"}:${locator}`;
    if (!locator || seen.has(identity)) return false;
    seen.add(identity);
    return true;
  });
}

function uniqueResolvedAliyunMedia(media = []) {
  const seen = new Set();
  return media.filter((item) => {
    const identity = `${item?.type || "media"}:${String(item?.url || "").trim()}`;
    if (!item?.url || seen.has(identity)) return false;
    seen.add(identity);
    return true;
  });
}

function aliyunReferenceImageInputs(body = {}) {
  const values = [
    ...aliyunBodyArrayField(body, "referenceImages", "reference_images", "referenceImage", "reference_image", "imageReferences", "image_references"),
    ...aliyunBodyArrayField(body, "referenceImageDataUrls", "reference_image_data_urls", "referenceImageUrls", "reference_image_urls"),
    ...aliyunBodyArrayField(body, "referenceImageAssetIds", "reference_image_asset_ids").map((assetId) => ({ assetId })),
    ...aliyunBodyMediaItems(body).filter((item) => {
      const role = aliyunMediaEntryRole(item);
      return aliyunMediaEntryKind(item) === "image" && !/(^|_)(first|last|start|end)_(frame|image)(_|$)/.test(role);
    }),
  ];
  return aliyunMediaInputs(values, { mediaKind: "image", type: "reference_image" });
}

function aliyunReferenceVideoInputs(body = {}) {
  const values = [
    ...aliyunBodyArrayField(body, "referenceVideos", "reference_videos", "referenceVideo", "reference_video"),
    ...aliyunBodyArrayField(body, "referenceVideoUrls", "reference_video_urls"),
    ...aliyunBodyArrayField(body, "referenceVideoAssetIds", "reference_video_asset_ids").map((assetId) => ({ assetId })),
    ...aliyunBodyMediaItems(body).filter((item) => aliyunMediaEntryKind(item) === "video"),
  ];
  return aliyunMediaInputs(values, { mediaKind: "video", type: "reference_video" });
}

function aliyunReferenceAudioInputs(body = {}) {
  const values = [
    ...aliyunBodyArrayField(body, "referenceAudios", "reference_audios", "referenceAudio", "reference_audio"),
    ...aliyunBodyArrayField(body, "referenceAudioUrls", "reference_audio_urls"),
    ...aliyunBodyArrayField(body, "referenceAudioAssetIds", "reference_audio_asset_ids").map((assetId) => ({ assetId })),
    ...aliyunBodyMediaItems(body).filter((item) => aliyunMediaEntryKind(item) === "audio"),
  ];
  return aliyunMediaInputs(values, { mediaKind: "audio", type: "reference_audio" });
}

function aliyunReferenceFileInput(body = {}) {
  const value = firstPresent(
    aliyunBodyField(body, "referenceFile", "reference_file"),
    aliyunBodyField(body, "referenceFileAssetId", "reference_file_asset_id") ? { assetId: aliyunBodyField(body, "referenceFileAssetId", "reference_file_asset_id") } : null,
    ...aliyunBodyMediaItems(body).filter((item) => aliyunMediaEntryKind(item) === "document"),
  );
  return aliyunMediaInput(value, { mediaKind: "document", type: "file" });
}

function aliyunFirstFrameInput(body = {}, fallbackAsset = null) {
  const defaults = { mediaKind: "image", type: "first_frame" };
  let input = aliyunMediaInput(
    firstPresent(
      aliyunBodyField(body, "firstFrame", "first_frame", "firstImage", "first_image", "startFrame", "start_frame", "startImage", "start_image"),
      {
        assetId: aliyunBodyField(body, "firstFrameAssetId", "first_frame_asset_id", "imageAssetId", "image_asset_id", "userAssetId", "user_asset_id"),
        dataUrl: aliyunBodyField(body, "firstFrameDataUrl", "first_frame_data_url", "imageDataUrl", "image_data_url", "dataUrl", "data_url"),
        url: aliyunBodyField(body, "firstFrameUrl", "first_frame_url", "imageUrl", "image_url", "image_url_public"),
        fileName: aliyunBodyField(body, "firstFrameFileName", "first_frame_file_name", "imageFileName", "image_file_name", "fileName", "file_name"),
      },
    ),
    defaults,
  );
  if (!input) {
    const item = aliyunBodyMediaItems(body).find((entry) => {
      const role = aliyunMediaEntryRole(entry);
      return aliyunMediaEntryKind(entry) === "image" && ["first_frame", "first_image", "start_frame", "start_image", "first"].includes(role);
    });
    input = aliyunMediaInput(item, defaults);
  }
  if (!input && fallbackAsset?.id) input = aliyunMediaInput({ assetId: fallbackAsset.id }, defaults);
  return input;
}

function aliyunLastFrameInput(body = {}) {
  const defaults = { mediaKind: "image", type: "last_frame" };
  let input = aliyunMediaInput(
    firstPresent(
      aliyunBodyField(body, "lastFrame", "last_frame", "lastImage", "last_image", "endFrame", "end_frame", "endImage", "end_image"),
      {
        assetId: aliyunBodyField(body, "lastFrameAssetId", "last_frame_asset_id", "endImageAssetId", "end_image_asset_id", "endFrameAssetId", "end_frame_asset_id"),
        dataUrl: aliyunBodyField(body, "lastFrameDataUrl", "last_frame_data_url", "endImageDataUrl", "end_image_data_url", "endFrameDataUrl", "end_frame_data_url"),
        url: aliyunBodyField(body, "lastFrameUrl", "last_frame_url", "endImageUrl", "end_image_url", "end_image_public_url", "endFrameUrl", "end_frame_url"),
        fileName: aliyunBodyField(body, "lastFrameFileName", "last_frame_file_name", "endImageFileName", "end_image_file_name", "endFrameFileName", "end_frame_file_name"),
      },
    ),
    defaults,
  );
  if (!input) {
    const item = aliyunBodyMediaItems(body).find((entry) => {
      const role = aliyunMediaEntryRole(entry);
      return aliyunMediaEntryKind(entry) === "image" && ["last_frame", "last_image", "end_frame", "end_image", "last"].includes(role);
    });
    input = aliyunMediaInput(item, defaults);
  }
  return input;
}

function aliyunPrimaryVideoInput(body = {}) {
  const defaults = { mediaKind: "video", type: "video" };
  let input = aliyunMediaInput(
    firstPresent(
      aliyunBodyField(body, "video", "inputVideo", "input_video", "referenceVideo", "reference_video"),
      {
        assetId: aliyunBodyField(body, "videoAssetId", "video_asset_id", "inputVideoAssetId", "input_video_asset_id", "referenceVideoAssetId", "reference_video_asset_id"),
        dataUrl: aliyunBodyField(body, "videoDataUrl", "video_data_url", "inputVideoDataUrl", "input_video_data_url", "referenceVideoDataUrl", "reference_video_data_url"),
        url: aliyunBodyField(body, "videoUrl", "video_url", "inputVideoUrl", "input_video_url", "referenceVideoUrl", "reference_video_url"),
        fileName: aliyunBodyField(body, "videoFileName", "video_file_name", "inputVideoFileName", "input_video_file_name", "referenceVideoFileName", "reference_video_file_name"),
      },
    ),
    defaults,
  );
  if (!input) {
    const item = aliyunBodyMediaItems(body).find((entry) => aliyunMediaEntryKind(entry) === "video");
    input = aliyunMediaInput(item, defaults);
  }
  return input;
}

function aliyunWan30ReferenceInputsPresent(body = {}) {
  return Boolean(
    aliyunReferenceImageInputs(body).length
    || aliyunReferenceVideoInputs(body).length
    || aliyunReferenceAudioInputs(body).length
    || aliyunReferenceFileInput(body)
  );
}

function aliyunWan30MediaMode(body = {}, requestedMode = "", fallbackAsset = null) {
  const hasFrames = Boolean(aliyunFirstFrameInput(body, fallbackAsset) || aliyunLastFrameInput(body));
  const hasReferences = aliyunWan30ReferenceInputsPresent(body);
  if (hasFrames && hasReferences) {
    throw advancedValidationError(
      "WAN30_MEDIA_COMBINATION_INVALID",
      "Wan 3.0 first/last frame images cannot be combined with reference media.",
    );
  }
  if (hasFrames) return "first_last_frame";
  const rawMode = String(requestedMode || "").trim().toLowerCase().replace(/[\s-]+/g, "_");
  if (["first_frame", "first_last_frame", "frames", "first_image", "start_end"].includes(rawMode)) return "first_last_frame";
  return "multimodal";
}

// A reference can also arrive as a bare public URL - preset art, a link the studio
// already owns, or a URL the client sends instead of an asset id. Such an input has
// no stored MIME and no pixel size, so Wan 3.0 used to reject a perfectly good PNG
// or JPEG with "must be JPG, JPEG, PNG, BMP, or WebP". Read the real format from the
// bytes, and fall back to the URL extension when the file cannot be reached.
async function publicImageFactsForUrl(url, { label = "Reference image" } = {}) {
  const pathname = (() => {
    try {
      return new URL(url).pathname;
    } catch (error) {
      return String(url || "").split("?")[0];
    }
  })();
  const extensionMime = imageMimeFromKnownPath(pathname);
  let downloaded = null;
  try {
    downloaded = await downloadRemoteFileToBuffer(url, {
      label,
      maxBytes: IMAGE_UPLOAD_MAX_BYTES,
      timeoutMs: 30000,
      retryCount: 1,
      retryDelayMs: 500,
    });
  } catch (error) {
    downloaded = null;
  }
  const bytes = downloaded?.bytes || null;
  const headerMime = String(downloaded?.mime || "").replace("image/jpg", "image/jpeg").toLowerCase();
  const detectedMime = imageMimeFromBuffer(bytes);
  const dimensions = bytes ? imageDimensionsFromBuffer(bytes) : null;
  const mime = detectedMime || extensionMime || (headerMime.startsWith("image/") ? headerMime : "");
  if (!mime && !dimensions) return null;
  return {
    mime,
    width: Number(dimensions?.width || 0),
    height: Number(dimensions?.height || 0),
    sizeBytes: Number(bytes?.byteLength || 0),
  };
}

async function resolveAliyunVideoMediaInput({ db, user, input, label = "Media" } = {}) {
  if (!input) return null;
  let asset = null;
  let url = String(input.url || "").trim();
  if (url.startsWith("/")) url = publicUrlForAssetPath(url);
  // A reference sent as a bare URL may still be one of this studio's own assets, and
  // that record carries the MIME and pixel size the validators need.
  if (!input.dataUrl && !input.assetId && user && isPublicHttpUrl(url)) {
    asset = findUserAssetBySourceUrl(db, user, url);
  }
  if (input.dataUrl) {
    asset = await createUserWanMediaAssetFromDataUrl(db, user, {
      dataUrl: input.dataUrl,
      fileName: input.fileName || "",
      name: label,
      provider: input.provider || "",
    });
  } else if (input.assetId) {
    asset = (db.userAssets || []).find((entry) => entry.id === input.assetId && entry.userId === user.id && !isSoftDeleted(entry));
    if (!asset) {
      const error = new Error(`${label} asset not found.`);
      error.statusCode = 404;
      throw error;
    }
  }
  if (asset) {
    validateWan27MediaKind(asset, input.mediaKind, label);
    const wan30 = normalizeAdvancedProvider(input.provider || "") === "wan30";
    asset = await ensurePublicUrlForUserMediaAsset(db, asset, {
      normalizeImage: input.mediaKind !== "document",
      imageMinDimension: wan30 ? 240 : SEEDANCE_IMAGE_DIMENSION_MIN,
      imageMaxDimension: wan30 ? 8000 : SEEDANCE_IMAGE_DIMENSION_MAX,
    });
    if (wan30) asset = await ensureWan30R2MirrorForUserMediaAsset(db, asset);
    const wan30PublicUrl = asset.wan30PublicUrl;
    url = wan30 && isPublicHttpUrl(wan30PublicUrl)
      ? wan30PublicUrl
      : publicUrlForLocalAsset(asset);
  }
  if (!url || !isPublicHttpUrl(url)) {
    const error = new Error(`${label} requires a public URL, uploaded file, or asset id.`);
    error.statusCode = 400;
    throw error;
  }
  validateWan27MediaKind({ url }, input.mediaKind, label);
  let mime = String(asset?.mime || "").toLowerCase();
  if (!mime && input.mediaKind === "video") mime = videoMimeFromKnownPath(url);
  let sizeBytes = Number(asset?.sizeBytes || 0);
  let width = Number(asset?.width || asset?.videoWidth || 0);
  let height = Number(asset?.height || asset?.videoHeight || 0);
  if (!asset && input.mediaKind === "image" && (!mime || !width || !height)) {
    const facts = await publicImageFactsForUrl(url, { label });
    if (facts) {
      if (!mime) mime = facts.mime;
      if (!width) width = facts.width;
      if (!height) height = facts.height;
      if (!sizeBytes) sizeBytes = facts.sizeBytes;
    }
  }
  const resolved = {
    type: input.type,
    url,
    key: input.key || "",
    mediaKind: input.mediaKind,
    userAssetId: asset?.id || "",
    localUrl: asset?.localUrl || "",
    // Public template URLs and other bare links have no asset record, so the
    // supported media type and pixel size come from the file itself.
    mime,
    sizeBytes,
    width,
    height,
    durationSeconds: durationSecondsFromValue(asset?.durationSeconds),
  };
  if (input.referenceVoice) resolved.referenceVoice = input.referenceVoice;
  return resolved;
}

async function localBytesForResolvedMedia(item = {}) {
  const localUrl = String(item.localUrl || "").trim();
  if (!localUrl) return null;
  const localPath = safeAssetPathFromUrl(localUrl);
  if (!localPath) return null;
  try {
    return await fs.readFile(localPath);
  } catch {
    return null;
  }
}

async function validateWan30ResolvedMedia(media = [], requestParams = {}) {
  const imageTypes = new Set(["image/jpeg", "image/png", "image/webp", "image/bmp"]);
  const videoTypes = new Set(["video/mp4", "video/quicktime"]);
  const audioTypes = new Set(["audio/mpeg", "audio/wav", "audio/x-wav"]);
  let totalVideoSeconds = 0;
  let totalAudioSeconds = 0;
  for (let index = 0; index < media.length; index += 1) {
    const item = media[index];
    const label = `${String(item.type || "media").replace(/_/g, " ")} ${index + 1}`;
    const mime = String(item.mime || "").toLowerCase();
    let sizeBytes = Number(item.sizeBytes || 0);
    const bytes = await localBytesForResolvedMedia(item);
    if (!sizeBytes && bytes) sizeBytes = bytes.byteLength;
    if (["reference_image", "first_frame", "last_frame"].includes(item.type)) {
      if (!imageTypes.has(mime)) {
        // Keep the rejected locator in the log: a bare url that never reached a
        // readable file is the only way this branch can see an empty format.
        console.warn("[wan30-image-format-rejected]", JSON.stringify({
          label,
          url: String(item.url || "").slice(0, 300),
          mime: item.mime || "",
          userAssetId: item.userAssetId || "",
        }));
        throw advancedValidationError("WAN30_IMAGE_FORMAT_INVALID", `${label} must be JPG, JPEG, PNG, BMP, or WebP.`);
      }
      if (sizeBytes > IMAGE_UPLOAD_MAX_BYTES) throw advancedValidationError("WAN30_IMAGE_TOO_LARGE", `${label} must be 20MB or smaller.`);
      const dimensions = item.width && item.height ? { width: item.width, height: item.height } : imageDimensionsFromBuffer(bytes || []);
      const width = Number(dimensions?.width || 0);
      const height = Number(dimensions?.height || 0);
      if (!width || !height || width < 240 || width > 8000 || height < 240 || height > 8000) {
        throw advancedValidationError("WAN30_IMAGE_DIMENSIONS_INVALID", `${label} width and height must each be between 240px and 8000px.`, { width, height });
      }
      if (Math.max(width / height, height / width) > 8) {
        throw advancedValidationError("WAN30_IMAGE_RATIO_INVALID", `${label} aspect ratio must not exceed 8:1.`, { width, height });
      }
      if (mime === "image/png" && bytes && pngBufferHasTransparency(bytes)) {
        throw advancedValidationError("WAN30_PNG_ALPHA_UNSUPPORTED", `${label} PNG must not contain transparency.`);
      }
      continue;
    }
    if (item.type === "reference_video") {
      if (!videoTypes.has(mime)) throw advancedValidationError("WAN30_VIDEO_FORMAT_INVALID", `${label} must be MP4 or MOV.`);
      if (sizeBytes >= WAN30_VIDEO_UPLOAD_MAX_BYTES) throw advancedValidationError("WAN30_VIDEO_TOO_LARGE", `${label} must be smaller than 100MB.`);
      const width = Number(item.width || 0);
      const height = Number(item.height || 0);
      if (!width || !height || width < 240 || width > 4096 || height < 240 || height > 4096) {
        throw advancedValidationError("WAN30_VIDEO_DIMENSIONS_INVALID", `${label} width and height must each be between 240px and 4096px.`, { width, height });
      }
      if (Math.max(width / height, height / width) > 8) {
        throw advancedValidationError("WAN30_VIDEO_RATIO_INVALID", `${label} aspect ratio must not exceed 8:1.`, { width, height });
      }
      const seconds = durationSecondsFromValue(item.durationSeconds) || await probeVideoDurationSeconds(item.url);
      if (seconds < 1 || seconds > 15) throw advancedValidationError("WAN30_VIDEO_DURATION_INVALID", `${label} duration must be between 1 and 15 seconds.`, { duration: seconds });
      totalVideoSeconds += seconds;
      continue;
    }
    if (item.type === "reference_audio") {
      if (!audioTypes.has(mime)) throw advancedValidationError("WAN30_AUDIO_FORMAT_INVALID", `${label} must be WAV or MP3.`);
      if (sizeBytes >= WAN30_AUDIO_UPLOAD_MAX_BYTES) throw advancedValidationError("WAN30_AUDIO_TOO_LARGE", `${label} must be smaller than 15MB.`);
      const seconds = durationSecondsFromValue(item.durationSeconds) || await probeVideoDurationSeconds(item.url);
      if (seconds < 1 || seconds > 15) throw advancedValidationError("WAN30_AUDIO_DURATION_INVALID", `${label} duration must be between 1 and 15 seconds.`, { duration: seconds });
      totalAudioSeconds += seconds;
      continue;
    }
    if (item.type === "file") {
      const extension = path.extname(String(item.url || "").split("?")[0]).toLowerCase();
      if (!WAN30_DOCUMENT_MIMES.has(mime) && !WAN30_DOCUMENT_EXTENSIONS.has(extension)) {
        throw advancedValidationError("WAN30_DOCUMENT_FORMAT_INVALID", `${label} must be PDF, Word, Excel, PowerPoint, TXT, or Markdown.`);
      }
      if (sizeBytes > WAN30_DOCUMENT_UPLOAD_MAX_BYTES) throw advancedValidationError("WAN30_DOCUMENT_TOO_LARGE", `${label} must be 100MB or smaller.`);
    }
  }
  if (totalVideoSeconds > 15) throw advancedValidationError("WAN30_VIDEO_TOTAL_DURATION_INVALID", "Wan 3.0 reference videos must total 15 seconds or less.", { totalVideoSeconds });
  if (totalAudioSeconds > 15) throw advancedValidationError("WAN30_AUDIO_TOTAL_DURATION_INVALID", "Wan 3.0 reference audios must total 15 seconds or less.", { totalAudioSeconds });
  const outputDuration = Number(requestParams.duration);
  if (totalVideoSeconds > 0 && outputDuration !== -1 && totalVideoSeconds + outputDuration > 30) {
    throw advancedValidationError("WAN30_TOTAL_VIDEO_DURATION_INVALID", "Wan 3.0 input video duration plus output duration must not exceed 30 seconds.", { inputVideoSeconds: totalVideoSeconds, outputDuration });
  }
  return { totalVideoSeconds, totalAudioSeconds };
}

async function resolveAliyunVideoMedia({ db, user, body = {}, requestParams = {}, fallbackAsset = null, skipWan30Validation = false } = {}) {
  const provider = normalizeAdvancedProvider(requestParams.provider || body.provider);
  const capability = aliyunVideoCapabilityForRequest(provider, requestParams, []);
  if (["wan30-video", "wan30-video-pro", "wan30-video-prime", "wan30-video-prime-pro"].includes(capability)) {
    const mediaMode = aliyunWan30MediaMode(
      body,
      firstPresent(requestParams.mediaMode, body.mediaMode, body.wan30Mode, "multimodal"),
      fallbackAsset,
    );
    const frameMode = mediaMode === "first_last_frame";
    let inputs = frameMode
      ? [aliyunFirstFrameInput(body, fallbackAsset), aliyunLastFrameInput(body)].filter(Boolean)
      : [...aliyunReferenceImageInputs(body), ...aliyunReferenceVideoInputs(body), ...aliyunReferenceAudioInputs(body), ...[aliyunReferenceFileInput(body)].filter(Boolean)];
    inputs = inputs.map((input) => ({ ...input, provider: "wan30" }));
    const resolvedMedia = [];
    for (let index = 0; index < inputs.length; index += 1) {
      resolvedMedia.push(await resolveAliyunVideoMediaInput({ db, user, input: inputs[index], label: `Wan 3.0 ${inputs[index].type} ${index + 1}` }));
    }
    const media = uniqueResolvedAliyunMedia(resolvedMedia);
    const inputCounts = {
      images: media.filter((item) => item.type === "reference_image").length,
      videos: media.filter((item) => item.type === "reference_video").length,
      audios: media.filter((item) => item.type === "reference_audio").length,
      files: media.filter((item) => item.type === "file").length,
    };
    if (inputCounts.images > 10 || inputCounts.videos > 5 || inputCounts.audios > 5 || inputCounts.files > 1) {
      throw advancedValidationError("WAN30_MEDIA_COUNT_INVALID", "Wan 3.0 accepts up to 10 images, 5 videos, 5 audios, or one document.", inputCounts);
    }
    if (inputCounts.files && media.length > 1) throw advancedValidationError("WAN30_MEDIA_COMBINATION_INVALID", "Wan 3.0 documents cannot be combined with other media inputs.");
    if (frameMode && (!media.some((item) => item.type === "first_frame") || !media.some((item) => item.type === "last_frame"))) {
      throw advancedValidationError("WAN30_FRAMES_REQUIRED", "Wan 3.0 First + Last Frame mode requires both frame images.");
    }
    // External API callers provide upstream-ready URLs. The upstream remains the
    // authority for media limits; locally probing every URL would reject valid
    // signed links that do not expose dimensions to us.
    if (!skipWan30Validation) await validateWan30ResolvedMedia(media, requestParams);
    return { capability, mediaMode, media };
  }
  if (["wan27-t2v", "happyhorse-t2v"].includes(capability)) return { capability, mediaMode: capability, media: [] };
  if (capability === "wan27-i2v") {
    const resolved = await resolveWan27Media({ db, user, body, requestParams, fallbackAsset });
    return { ...resolved, capability };
  }

  let inputs = [];
  if (capability === "wan27-r2v") {
    const firstFrame = aliyunFirstFrameInput(body, null);
    if (firstFrame?.assetId || firstFrame?.dataUrl || firstFrame?.url) inputs.push(firstFrame);
    inputs.push(...aliyunReferenceImageInputs(body), ...aliyunReferenceVideoInputs(body));
  } else if (capability === "wan27-video-edit" || capability === "happyhorse-video-edit") {
    inputs = [aliyunPrimaryVideoInput(body), ...aliyunReferenceImageInputs(body)].filter(Boolean);
  } else if (capability === "happyhorse-i2v") {
    inputs = [aliyunFirstFrameInput(body, fallbackAsset)].filter(Boolean);
  } else if (capability === "happyhorse-r2v") {
    inputs = aliyunReferenceImageInputs(body);
  } else if (capability === "wan-animate-move" || capability === "wan-animate-mix") {
    const imageInput = aliyunFirstFrameInput(body, fallbackAsset);
    if (imageInput) imageInput.type = "image_url";
    const videoInput = aliyunPrimaryVideoInput(body);
    if (videoInput) videoInput.type = "video_url";
    inputs = [imageInput, videoInput].filter(Boolean);
  } else if (capability === "wan-legacy") {
    const model = String(requestParams.model || "").toLowerCase();
    if (model.includes("t2v")) inputs = [];
    else if (model.includes("r2v")) inputs = [...aliyunReferenceImageInputs(body), ...aliyunReferenceVideoInputs(body)];
    else if (model.includes("vace")) inputs = [aliyunPrimaryVideoInput(body), ...aliyunReferenceImageInputs(body)].filter(Boolean);
    else {
      const resolved = await resolveWan27Media({ db, user, body, requestParams, fallbackAsset });
      return { ...resolved, capability };
    }
  }

  const media = [];
  for (let index = 0; index < inputs.length; index += 1) {
    const input = inputs[index];
    const label = `${capability} ${input.type} ${index + 1}`;
    media.push(await resolveAliyunVideoMediaInput({ db, user, input, label }));
  }
  return { capability, mediaMode: capability, media: uniqueResolvedAliyunMedia(media) };
}

function publicUrlForLocalAsset(asset = {}) {
  const storedUrl = isPublicHttpUrl(asset.wan30PublicUrl)
    ? asset.wan30PublicUrl
    : (isPublicHttpUrl(asset.publicUrl) ? asset.publicUrl : publicUrlForAssetPath(asset.localUrl));
  return signedOssCdnUrlForDelivery(storedUrl, {
    key: isPublicHttpUrl(asset.wan30PublicUrl)
      ? (asset.wan30R2Key || asset.wan30StorageKey || "")
      : (asset.storageKey || asset.objectStorageKey || asset.r2Key || ""),
  }) || storedUrl;
}

async function ensureWan30R2MirrorForUserMediaAsset(db, userAsset) {
  if (!userAsset?.localUrl) return userAsset;
  if (!objectStorageEnabled()) {
    const error = new Error("Object storage is not configured.");
    error.statusCode = 503;
    throw error;
  }
  if (publicUrlMatchesStorageBase(userAsset.wan30PublicUrl, objectStoragePublicDomain())) return userAsset;
  if (publicUrlMatchesStorageBase(userAsset.publicUrl, objectStoragePublicDomain())) {
    userAsset.wan30PublicUrl = userAsset.publicUrl;
    userAsset.wan30R2Key = userAsset.objectStorageKey || userAsset.r2Key || "";
    userAsset.wan30SourceSizeBytes = Number(userAsset.sizeBytes || 0);
    userAsset.wan30UploadedAt = userAsset.publicUploadedAt || userAsset.updatedAt || new Date().toISOString();
    userAsset.updatedAt = new Date().toISOString();
    db.userAssets = (db.userAssets || []).map((asset) => (asset.id === userAsset.id ? userAsset : asset));
    if (dbEnabled()) await upsertUserAssetInDb(userAsset);
    else await writeDb(db);
    return userAsset;
  }

  const { localPath, bytes } = await readLocalUserAssetBytes(db, userAsset, {
    label: "Wan 3.0 media",
    maxBytes: restoreLimitBytesForUserAsset(userAsset),
  });
  const uploaded = await uploadBufferToR2({
    userId: userAsset.userId,
    assetId: `${userAsset.id}-wan30`,
    bytes,
    mime: userAsset.mime || "application/octet-stream",
    extension: path.extname(localPath),
  });
  userAsset.wan30PublicUrl = uploaded.publicUrl;
  userAsset.wan30R2Key = uploaded.key;
  userAsset.wan30SourceSizeBytes = bytes.byteLength;
  userAsset.wan30UploadedAt = new Date().toISOString();
  userAsset.updatedAt = userAsset.wan30UploadedAt;
  db.userAssets = (db.userAssets || []).map((asset) => (asset.id === userAsset.id ? userAsset : asset));
  if (dbEnabled()) await upsertUserAssetInDb(userAsset);
  else await writeDb(db);
  return userAsset;
}

async function ensurePublicUrlForUserMediaAsset(db, userAsset, {
  normalizeImage = true,
  imageMinDimension = SEEDANCE_IMAGE_DIMENSION_MIN,
  imageMaxDimension = SEEDANCE_IMAGE_DIMENSION_MAX,
} = {}) {
  if (normalizeImage && String(userAsset.mime || "").toLowerCase().startsWith("image/")) {
    userAsset = await normalizeUserImageAssetForUpstream(db, userAsset, {
      label: "Upstream reference image",
      minDimension: imageMinDimension,
      maxDimension: imageMaxDimension,
    });
  }
  const needsObjectMirror = objectStorageEnabled() && Boolean(userAsset.localUrl) && !userAssetHasConfiguredObjectStorageMirror(userAsset);
  if (isPublicHttpUrl(userAsset.publicUrl) && !needsObjectMirror) {
    if (publicUrlMatchesStorageBase(userAsset.publicUrl, objectStoragePublicDomain()) && objectStorageProvider() === "r2" && !await waitForR2PublicObject(userAsset.publicUrl)) {
      const error = new Error("R2 public media is not ready yet. Please retry shortly.");
      error.statusCode = 502;
      error.code = "R2_PUBLIC_NOT_READY";
      error.retryable = true;
      throw error;
    }
    // Delivery callers may send userAsset.publicUrl directly upstream. OSS
    // private-read URLs are only stable after a fresh signature, while the DB
    // must retain the unsigned canonical URL. Return a shallow copy so this
    // short-lived URL can never be persisted by a caller.
    const signedDeliveryUrl = signedOssCdnUrlForDelivery(userAsset.publicUrl, {
      key: firstPresent(userAsset.storageKey, userAsset.objectStorageKey, userAsset.r2Key, ""),
    });
    return signedDeliveryUrl ? { ...userAsset, publicUrl: signedDeliveryUrl } : userAsset;
  }
  const localPublicUrl = !objectStorageEnabled() ? publicUrlForAssetPath(userAsset.localUrl) : "";
  if (localPublicUrl) {
    userAsset.publicUrl = localPublicUrl;
    userAsset.updatedAt = new Date().toISOString();
    db.userAssets = (db.userAssets || []).map((asset) => (asset.id === userAsset.id ? userAsset : asset));
    if (dbEnabled()) await upsertUserAssetInDb(userAsset);
    else await writeDb(db);
    return userAsset;
  }

  const { localPath, bytes } = await readLocalUserAssetBytes(db, userAsset, {
    label: "Upstream media",
    maxBytes: restoreLimitBytesForUserAsset(userAsset),
  });
  const uploaded = await uploadBufferToR2({
    userId: userAsset.userId,
    assetId: `${userAsset.id}-wan`,
    bytes,
    mime: userAsset.mime || "application/octet-stream",
    extension: path.extname(localPath),
  });
  userAsset.publicUrl = uploaded.publicUrl;
  userAsset.objectStorageKey = uploaded.key;
  userAsset.r2Key = uploaded.key;
  userAsset.cdnUrl = uploaded.publicUrl;
  userAsset.objectStorageError = "";
  userAsset.publicUploadedAt = new Date().toISOString();
  userAsset.updatedAt = new Date().toISOString();
  db.userAssets = (db.userAssets || []).map((asset) => (asset.id === userAsset.id ? userAsset : asset));
  if (dbEnabled()) await upsertUserAssetInDb(userAsset);
  else await writeDb(db);
  return userAsset;
}

async function ensureSeedanceGatewayPublicAsset(db, userAsset) {
  if (!userAsset) return null;
  const mime = String(userAsset.mime || "").toLowerCase();
  if (mime.startsWith("image/")) {
    await validateSeedanceImageAssetForRequest(db, userAsset, "Seedance gateway image");
    return ensurePublicUrlForUserMediaAsset(db, userAsset);
  }
  if (mime.startsWith("video/")) {
    const before = storedVideoDimensionsForAsset(userAsset);
    const dimensions = await validateSeedanceVideoAssetForRequest(db, userAsset, "Seedance gateway video");
    const dimensionsChanged = Number(before?.width || 0) !== Number(dimensions?.width || 0)
      || Number(before?.height || 0) !== Number(dimensions?.height || 0);
    if (dimensionsChanged || !userAssetHasConfiguredObjectStorageMirror(userAsset)) {
      const { localPath, bytes } = await readLocalUserAssetBytes(db, userAsset, {
        label: "Seedance gateway video",
        maxBytes: VIDEO_TOOL_SOURCE_UPLOAD_MAX_BYTES,
      });
      const uploaded = await uploadBufferToR2({
        userId: userAsset.userId,
        assetId: `${userAsset.id}-seedance-gateway`,
        bytes,
        mime: userAsset.mime || videoMimeFromPath(localPath) || "video/mp4",
        extension: path.extname(localPath),
      });
      userAsset.publicUrl = uploaded.publicUrl;
      userAsset.cdnUrl = uploaded.publicUrl;
      userAsset.objectStorageKey = uploaded.key;
      userAsset.r2Key = uploaded.key;
      userAsset.objectStorageError = "";
      userAsset.publicUploadedAt = new Date().toISOString();
      userAsset.updatedAt = userAsset.publicUploadedAt;
      db.userAssets = (db.userAssets || []).map((asset) => (asset.id === userAsset.id ? userAsset : asset));
      if (dbEnabled()) await upsertUserAssetInDb(userAsset);
      else await writeDb(db);
    }
    return userAsset;
  }
  return ensurePublicUrlForUserMediaAsset(db, userAsset, { normalizeImage: false });
}

function normalizeSeedreamImageSize(value) {
  return APIZ_SEEDREAM_IMAGE_SIZES.has(value) ? value : "auto_3K";
}

async function ensurePublicUrlForUserAsset(db, userAsset) {
  const needsObjectMirror = objectStorageEnabled() && Boolean(userAsset.localUrl) && !userAssetHasConfiguredObjectStorageMirror(userAsset);
  if (isPublicHttpUrl(userAsset.publicUrl) && !needsObjectMirror) {
    const signedDeliveryUrl = signedOssCdnUrlForDelivery(userAsset.publicUrl, {
      key: firstPresent(userAsset.storageKey, userAsset.objectStorageKey, userAsset.r2Key, ""),
    });
    return signedDeliveryUrl ? { ...userAsset, publicUrl: signedDeliveryUrl } : userAsset;
  }
  const localPublicUrl = !objectStorageEnabled() ? publicUrlForAssetPath(userAsset.localUrl) : "";
  if (localPublicUrl) {
    userAsset.publicUrl = localPublicUrl;
    userAsset.updatedAt = new Date().toISOString();
    db.userAssets = (db.userAssets || []).map((asset) => (asset.id === userAsset.id ? userAsset : asset));
    if (dbEnabled()) await upsertUserAssetInDb(userAsset);
    else await writeDb(db);
    return userAsset;
  }

  const { localPath, bytes } = await readLocalUserAssetBytes(db, userAsset, {
    label: "Upstream image",
    maxBytes: restoreLimitBytesForUserAsset(userAsset),
  });
  const uploaded = await uploadBufferToR2({
    userId: userAsset.userId,
    assetId: `${userAsset.id}-apiz`,
    bytes,
    mime: userAsset.mime || "image/png",
  });

  userAsset.publicUrl = uploaded.publicUrl;
  userAsset.objectStorageKey = uploaded.key;
  userAsset.r2Key = uploaded.key;
  userAsset.publicUploadedAt = new Date().toISOString();
  if (dbEnabled()) await upsertUserAssetInDb(userAsset);
  else await writeDb(db);
  return userAsset;
}

async function ensureVegaPublicUrlForUserAsset(db, userAsset) {
  try {
    const ensured = await ensurePublicUrlForUserAsset(db, userAsset);
    const publicUrl = [ensured?.publicUrl, ensured?.cdnUrl].find((value) => isPublicHttpUrl(value)) || "";
    if (!publicUrl) throw new Error("Object storage did not return a public HTTP(S) URL.");
    return ensured;
  } catch (error) {
    const wrapped = new Error(`Vega asset public URL unavailable: ${error.message || "object storage upload failed"}`);
    wrapped.statusCode = 502;
    wrapped.code = "VEGA_ASSET_PUBLIC_URL_UNAVAILABLE";
    wrapped.cause = error;
    throw wrapped;
  }
}

async function arkOpenApiAction(action, payload) {
  requireValue("BYTEPLUS_ACCESS_KEY_ID or VOLC_ACCESS_KEY_ID", ARK_OPENAPI.accessKey);
  requireValue("BYTEPLUS_SECRET_ACCESS_KEY or VOLC_ACCESS_KEY_SECRET", ARK_OPENAPI.secretKey);

  const body = JSON.stringify(payload);
  const transientCodes = /InternalServiceTimeout|InternalServiceError|RequestTimeout|ServerBusy|TooManyRequests/i;
  const transientAssetDownload = /DownloadFailed[\s\S]*(?:context deadline exceeded|timed?\s*out|read body err)|(?:context deadline exceeded|read body err)[\s\S]*DownloadFailed/i;
  let lastError = null;
  // Each iteration freshly signs the request because the signed timestamp
  // would otherwise drift between attempts.
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      const auth = makeArkOpenApiAuth({ action, body });
      const response = await fetch(auth.url, { method: "POST", headers: auth.headers, body });
      const text = await response.text();
      const json = text ? JSON.parse(text) : {};
      if (!response.ok || json.ResponseMetadata?.Error) {
        const detail = json.ResponseMetadata?.Error;
        const message = `${action} failed: ${detail?.Code || response.status} ${detail?.Message || text}`;
        const isTransient =
          (detail?.Code && transientCodes.test(detail.Code)) ||
          (detail?.Message && transientCodes.test(detail.Message)) ||
          (text && transientCodes.test(text)) ||
          (action === "CreateAsset" && (transientAssetDownload.test(`${detail?.Code || ""} ${detail?.Message || text}`))) ||
          response.status === 503 ||
          response.status === 504 ||
          response.status === 429;
        if (isTransient && attempt < 3) {
          lastError = message;
          const wait = 4000 * (attempt + 1);
          console.warn(`[ark-openapi] ${action} transient error: ${message} — retrying in ${wait}ms`);
          await delay(wait);
          continue;
        }
        const error = new Error(message);
        error.statusCode = response.ok ? 502 : response.status;
        error.payload = json;
        throw error;
      }
      return json.Result || json;
    } catch (error) {
      // Network-layer errors get one retry only when they look transient.
      const msg = String(error.message || error);
      if (attempt < 3 && /timeout|network|ECONN|fetch failed/i.test(msg)) {
        lastError = msg;
        const wait = 4000 * (attempt + 1);
        console.warn(`[ark-openapi] ${action} network error: ${msg} — retrying in ${wait}ms`);
        await delay(wait);
        continue;
      }
      throw error;
    }
  }
  const error = new Error(`${action} failed after retries: ${lastError || "unknown error"}`);
  error.statusCode = 502;
  throw error;
}

function extractAssetId(result) {
  return result.Id || result.AssetId || result.Asset?.Id || result.Asset?.AssetId || result.Item?.Id || "";
}

function seedanceAssetTypeForUserAsset(userAsset = {}) {
  const mime = String(userAsset.mime || "").toLowerCase();
  if (mime.startsWith("video/")) return "Video";
  if (mime.startsWith("audio/")) return "Audio";
  return "Image";
}

function seedanceAssetCacheField(userAsset = {}) {
  const assetType = seedanceAssetTypeForUserAsset(userAsset);
  if (assetType === "Video") return "seedanceVideoAssetUri";
  if (assetType === "Audio") return "seedanceAudioAssetUri";
  return "assetUri";
}

const SEEDANCE_PUBLIC_ASSET_URI_CACHE = new Map();

async function ensureSeedanceAssetUriForPublicUrl(url = "", assetType = "Image", name = "reference") {
  const publicUrl = publicHttpUrlForUpstream(url);
  if (String(url || "").startsWith("asset://")) return String(url).trim();
  if (!isPublicHttpUrl(publicUrl)) {
    throw advancedValidationError("INVALID_SEEDANCE_ASSET_URL", "Seedance media must use a public http(s) URL.", { assetType });
  }
  const normalizedType = ["Image", "Video", "Audio"].includes(assetType) ? assetType : "Image";
  const cacheKey = `${normalizedType}:${publicUrl}`;
  if (SEEDANCE_PUBLIC_ASSET_URI_CACHE.has(cacheKey)) return SEEDANCE_PUBLIC_ASSET_URI_CACHE.get(cacheKey);
  const created = await arkOpenApiAction("CreateAsset", {
    GroupId: ARK_OPENAPI.groupId,
    URL: publicUrl,
    AssetType: normalizedType,
    Moderation: { Strategy: "Skip" },
    Name: storageObjectName("gateway", name),
    ProjectName: ARK_OPENAPI.projectName,
  });
  const assetId = extractAssetId(created);
  if (!assetId) {
    const error = new Error(`CreateAsset did not return asset id: ${JSON.stringify(created)}`);
    error.statusCode = 502;
    throw error;
  }
  const assetUri = `asset://${assetId}`;
  SEEDANCE_PUBLIC_ASSET_URI_CACHE.set(cacheKey, assetUri);
  return assetUri;
}

async function ensureSeedanceAssetForUserAsset(db, userAsset) {
  const assetType = seedanceAssetTypeForUserAsset(userAsset);
  if (assetType === "Image") {
    userAsset = await normalizeUserImageAssetForUpstream(db, userAsset, { label: "Seedance image asset" });
  }
  const cacheField = seedanceAssetCacheField(userAsset);
  // Upstream CreateAsset ids are durable. Once a user asset has one, reuse it
  // instead of uploading the same action/reference media on every generation.
  // Keep the dimension guard for videos so an invalid legacy asset can still
  // be rebuilt once, but do not tie reuse to the current R2/public URL.
  if (userAsset[cacheField]) {
    if (assetType !== "Video") return userAsset;
    const storedDimensions = storedVideoDimensionsForAsset(userAsset);
    if (!storedDimensions) return userAsset;
    try {
      assertSeedanceVideoPixelCount(storedDimensions, "Seedance video asset");
      return userAsset;
    } catch (error) {
      if (error.code !== "SEEDANCE_VIDEO_PIXEL_COUNT_INVALID") throw error;
    }
  }

  const localPath = await ensureLocalUserAssetFile(db, userAsset, {
    label: "Seedance media asset",
    maxBytes: restoreLimitBytesForUserAsset(userAsset),
  });
  let bytes = null;
  if (assetType === "Image") {
    bytes = await fs.readFile(localPath);
    const dimensions = validateSeedanceImageBytes(bytes, "Seedance image asset");
    userAsset.width = dimensions.width;
    userAsset.height = dimensions.height;
    userAsset.imageType = dimensions.type || userAsset.imageType || "";
  } else if (assetType === "Video") {
    const dimensions = await normalizeSeedanceVideoFileForRequest(localPath, localPath, "Seedance video asset");
    userAsset.videoWidth = dimensions.width;
    userAsset.videoHeight = dimensions.height;
    userAsset.durationSeconds = dimensions.durationSeconds || userAsset.durationSeconds || 0;
    userAsset.seedanceVideoAssetId = "";
    userAsset.seedanceVideoAssetUri = "";
    bytes = await fs.readFile(localPath);
  } else {
    bytes = await fs.readFile(localPath);
  }
  const localPublicUrl = publicUrlForAssetPath(userAsset.localUrl);
  let uploaded = {
    publicUrl: isPublicHttpUrl(userAsset.publicUrl) ? userAsset.publicUrl : localPublicUrl,
    key: userAssetObjectStorageKey(userAsset),
  };
  if (objectStorageEnabled() && (assetType === "Video" || !userAssetHasConfiguredObjectStorageMirror(userAsset))) {
    uploaded = await uploadBufferToR2({
      userId: userAsset.userId,
      assetId: `${userAsset.id}-seedance`,
      bytes,
      mime: userAsset.mime || videoMimeFromPath(localPath) || "video/mp4",
      extension: path.extname(localPath),
    });
  } else if (!uploaded.publicUrl) {
    uploaded = await uploadBufferToR2({
      userId: userAsset.userId,
      assetId: userAsset.id,
      bytes,
      mime: userAsset.mime || "image/png",
    });
  }
  const assetUri = await ensureSeedanceAssetUriForPublicUrl(uploaded.publicUrl, assetType, userAsset.id);
  const assetId = assetUri.slice("asset://".length);

  if (assetType === "Video") {
    userAsset.seedanceVideoAssetId = assetId;
    userAsset.seedanceVideoAssetUri = assetUri;
  } else if (assetType === "Audio") {
    userAsset.seedanceAudioAssetId = assetId;
    userAsset.seedanceAudioAssetUri = assetUri;
  } else {
    userAsset.assetId = assetId;
    userAsset.assetUri = assetUri;
  }
  userAsset.publicUrl = uploaded.publicUrl;
  userAsset.r2Key = uploaded.key;
  if (uploaded.key) {
    userAsset.cdnUrl = uploaded.publicUrl || userAsset.cdnUrl || "";
    userAsset.objectStorageKey = uploaded.key;
    userAsset.r2Key = uploaded.key;
    userAsset.objectStorageError = "";
    userAsset.publicUploadedAt = new Date().toISOString();
  }
  userAsset.upstreamCreatedAt = new Date().toISOString();
  userAsset.updatedAt = new Date().toISOString();
  if (dbEnabled()) await upsertUserAssetInDb(userAsset);
  else await writeDb(db);
  return userAsset;
}

