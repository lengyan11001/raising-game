function seedanceModelAliasKind(model = "") {
  const raw = String(model || "").trim();
  const compact = raw.toLowerCase().replace(/[\s_-]+/g, "");
  const knownFast = [
    SEEDANCE_FAST_ENDPOINT_ID.toLowerCase().replace(/[\s_-]+/g, ""),
    "dreaminaseedance20fast260128",
    "dreaminaseedance2.0fast260128",
    "dreaminaseedance20fasthc",
    "dreaminaseedance2.0fasthc",
    "dreaminaseedance20minihc",
    "dreaminaseedance2.0minihc",
    "seedance20fast",
    "seedance2.0fast",
    "seedance20mini",
    "seedance2.0mini",
    "vipeak2fast",
    "vp2fast",
  ];
  const knownQuality = [
    SEEDANCE_QUALITY_ENDPOINT_ID.toLowerCase().replace(/[\s_-]+/g, ""),
    "dreaminaseedance20260128",
    "dreaminaseedance2.0260128",
    "dreaminaseedance20hc",
    "dreaminaseedance2.0hc",
    "seedance20",
    "seedance2.0",
    "vipeak2standard",
    "vipeak2",
    "vp2standard",
  ];
  if (knownFast.includes(compact)) return "fast";
  if (knownQuality.includes(compact)) return "standard";
  return "";
}

function seedanceConfiguredModelForRequest(model = "", seedanceTier = "standard") {
  const raw = String(model || "").trim();
  const configuredFast = String(MODEL_FAST || "").trim();
  const configuredQuality = String(MODEL_QUALITY || "").trim();
  const aliasKind = seedanceModelAliasKind(raw);
  if (!raw) return normalizeSeedanceTier(seedanceTier) === "fast" ? configuredFast : configuredQuality;
  if (aliasKind === "fast") return configuredFast;
  if (aliasKind === "standard") return configuredQuality;
  return raw;
}

function seedanceUpstreamEnabledForUser(user = {}, enabledKeys = new Set()) {
  if (!enabledKeys?.size) return false;
  const keys = [
    user?.username,
    user?.name,
    user?.email,
    user?.id,
  ].map((item) => String(item || "").trim().toLowerCase()).filter(Boolean);
  return enabledKeys.has("*") || keys.some((key) => enabledKeys.has(key));
}

function seedancePivoxEnabledForUser(user = {}) {
  return false;
}

function seedanceApizEnabledForUser(user = {}) {
  return false;
}

function seedanceIgnexEnabledForUser(user = {}) {
  if (!IGNEX_API_KEY) return false;
  return seedanceUpstreamEnabledForUser(user, IGNEX_ENABLED_USER_KEYS);
}

function seedancePivoxModelForRequest(model = "", seedanceTier = "standard") {
  const kind = seedanceModelAliasKind(model) || normalizeSeedanceTier(seedanceTier);
  return kind === "fast" ? PIVOX_SEEDANCE_FAST_MODEL : PIVOX_SEEDANCE_QUALITY_MODEL;
}

function seedanceApizModelForRequest(model = "", seedanceTier = "standard") {
  const raw = String(model || "").trim().toLowerCase();
  const kind = seedanceModelAliasKind(model) || (raw.includes("fast") ? "fast" : "") || normalizeSeedanceTier(seedanceTier);
  return kind === "fast" ? APIZ_SEEDANCE_FAST_MODEL : APIZ_SEEDANCE_QUALITY_MODEL;
}

function seedanceIgnexModelForRequest(model = "", seedanceTier = "standard") {
  const raw = String(model || "").trim().toLowerCase();
  const kind = seedanceModelAliasKind(model) || (raw.includes("fast") ? "fast" : "") || normalizeSeedanceTier(seedanceTier);
  return kind === "fast" ? IGNEX_SEEDANCE_FAST_MODEL : IGNEX_SEEDANCE_QUALITY_MODEL;
}

function signedOssCdnUrlForDelivery(value = "", { key = "", fileName = "", download = false, expiresSeconds } = {}) {
  const text = String(value || "").trim();
  if (!OSS_STORAGE_ENABLED || !text) return "";
  // A record-level storage key may belong to OSS while its display URL still
  // points at historical R2 media. Never sign an R2/other public URL with the
  // OSS credentials merely because a key was supplied.
  const urlProvider = inferObjectStorageProviderFromUrl(text);
  if (urlProvider && urlProvider !== "oss") return "";
  const inferred = objectStorageKeyFromPublicUrl(text, "oss");
  // A configured CDN origin is also used as a general media domain. Re-sign
  // only objects that can be mapped into this bucket, otherwise a third-party
  // path on the same host could be rewritten into an invalid signature.
  if (isPublicHttpUrl(text) && urlProvider === "oss" && !inferred.key) return "";
  // Recognized OSS origin/CDN URLs are safe to sign. For any other public URL,
  // only use an explicitly supplied key when the caller has no URL-derived
  // provider. This keeps arbitrary external/R2 URLs from being rewritten.
  const hasPublicUrl = isPublicHttpUrl(text);
  // Prefer the object key encoded in the URL. Multi-image records can contain
  // several different keys while carrying only one record-level storageKey.
  const objectKey = String(inferred.key || (hasPublicUrl ? "" : key) || "").trim();
  if (!objectKey || (inferred.provider && inferred.provider !== "oss")) return "";
  return makeOssSignedCdnUrl({
    key: objectKey,
    fileName,
    download,
    expiresSeconds,
    config: OSS,
  });
}

function signedOssCdnUrlForUpstream(value = "", options = {}) {
  return signedOssCdnUrlForDelivery(value, {
    ...options,
    expiresSeconds: OSS.upstreamSignedUrlTtlSeconds,
  });
}

function deliverableStoredMediaUrl(value = "", { key = "" } = {}) {
  const text = String(value || "").trim();
  if (!text) return "";
  const provider = inferObjectStorageProviderFromUrl(text);
  const signed = signedOssCdnUrlForDelivery(text, { key });
  if (signed) return signed;
  // A bare private OSS/CDN URL is not a delivery URL. Returning it causes a
  // guaranteed browser 403 and makes thumbnails appear broken. If OSS signing
  // is available but failed, omit the URL so callers can use a provider/local
  // fallback or repair the poster instead of caching a known-bad address.
  if (OSS_STORAGE_ENABLED && (provider === "oss" || (provider === "" && key))) return "";
  return text;
}

// Media-library cache rows must identify the object, not one short-lived
// signature. Historical rows stored full OSS signed URLs; normalize those to a
// stable CDN URL so a refreshed signature can still hit the same asset.
function canonicalOssStorageUrlForCache(value = "") {
  const text = String(value || "").trim();
  if (!text) return "";
  const inferred = objectStorageKeyFromPublicUrl(text);
  if (inferred.provider !== "oss" || !inferred.key) return text;
  try {
    const parsed = new URL(text);
    parsed.search = "";
    parsed.hash = "";
    return parsed.toString();
  } catch {
    return text;
  }
}

function publicHttpUrlForUpstream(value = "") {
  const text = String(value || "").trim();
  if (!text) return "";
  if (isPublicHttpUrl(text)) {
    const publicUrl = publicUrlForAssetPath(text);
    const signedObjectUrl = signedOssCdnUrlForUpstream(text) || signedOssCdnUrlForUpstream(publicUrl);
    if (signedObjectUrl) return signedObjectUrl;
    // A protected application-origin URL must never be sent upstream bare.
    const protectedLocalDelivery = localMediaDeliveryUrlForUpstream(text, { absolute: true });
    if (protectedLocalDelivery) return protectedLocalDelivery;
    return publicUrl !== text ? publicUrl : text;
  }
  if (text.startsWith("/")) {
    const localDeliveryUrl = localMediaDeliveryUrlForUpstream(text, { absolute: true });
    if (localDeliveryUrl) return localDeliveryUrl;
    const configured = publicUrlForAssetPath(text);
    const signedConfigured = signedOssCdnUrlForUpstream(configured);
    if (signedConfigured) return signedConfigured;
    if (!configured) return `https://123vips.com/${text.replace(/^\/+/, "")}`;
    return configured;
  }
  return "";
}

function publicHttpUrlForUserAsset(asset = {}, fallback = "") {
  const value = asset.publicUrl || asset.localUrl || fallback || "";
  const signed = signedOssCdnUrlForUpstream(value, {
    key: asset.storageKey || asset.objectStorageKey || asset.r2Key || "",
  });
  return signed || publicHttpUrlForUpstream(value);
}

function normalizeAdvancedResolution(value = "") {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "480p") return "480p";
  if (normalized === "2k") return "2k";
  if (["4k", "2160p"].includes(normalized)) return "4k";
  return normalized === "1080p" ? "1080p" : "720p";
}

function normalizeVideoRatio(value = "") {
  if (String(value || "").trim().toLowerCase() === "adaptive") return "adaptive";
  const normalized = String(value || "").trim().replace(/[：xX]/g, ":");
  if (/^\d+\s*:\s*\d+$/.test(normalized)) {
    const [width, height] = normalized.split(":").map((part) => Math.max(1, Number(part.trim()) || 1));
    return `${width}:${height}`;
  }
  return "16:9";
}

function advancedValidationError(code = "INVALID_ADVANCED_REQUEST", message = "Invalid advanced generation request.", details = {}) {
  const error = new Error(message);
  error.statusCode = 400;
  error.code = code;
  if (details && Object.keys(details).length) error.details = details;
  return error;
}

function sendAdvancedValidationError(res, error, fallback = "Invalid advanced generation request.") {
  return sendJson(res, error.statusCode || 400, {
    ok: false,
    code: error.code || "INVALID_ADVANCED_REQUEST",
    message: publicModelText(error.message || fallback),
    ...(error.details ? { details: publicDocsValue(error.details) } : {}),
  });
}

function sendReferenceAssetNotFound(res, kind = "image", assetId = "") {
  const normalizedKind = ["video", "audio"].includes(kind) ? kind : "image";
  return sendJson(res, 404, {
    ok: false,
    code: `REFERENCE_${normalizedKind.toUpperCase()}_NOT_FOUND`,
    message: `Reference ${normalizedKind} not found.`,
    ...(assetId ? { assetId, missingAssetIds: [assetId] } : {}),
  });
}

function isExplicitAdvancedProvider(value = "") {
  const normalized = String(value || "").trim().toLowerCase().replace(/[\s_-]+/g, "");
  if (!normalized) return true;
  if (isVegaProvider(value)) return true;
  if (isPapayaProvider(value)) return true;
  if (isByteplusLanguageProvider(value)) return true;
  if (isQwen37FlashProvider(value)) return true;
  if (isQwenImage3Provider(value)) return true;
  if (isSeedream5ImageProvider(value)) return true;
  if (["zimagespicypro", "zimagespicy", "zimagepro", "zimage", "zimagespicpro"].includes(normalized) || normalized.includes("zimagespicy") || normalized.includes("zimage")) return true;
  if (["qwenimageeditspicy", "qwenimageeditspic", "qwenimageedit", "qwenimageeditspicpro"].includes(normalized) || normalized.includes("qwenimageedit")) return true;
  if (["seedancensfw", "seedance25nsfw", "seedance2.5nsfw"].includes(normalized) || (normalized.includes("seedance") && normalized.includes("nsfw"))) return true;
  if (["seedance25", "seedance2.5", "seedancev25"].includes(normalized) || normalized.includes("seedance25") || normalized.includes("seedance2.5")) return true;
  if (["wan30", "wan3", "wan3.0", "wan3video", "wan3.0video"].includes(normalized) || normalized.includes("wan30") || normalized.includes("wan3.0")) return true;
  if (["happyhorse", "horse", "hh"].includes(normalized) || normalized.includes("happyhorse")) return true;
  if (["wan27", "wan2.7", "wan", "vipeak1", "vp1"].includes(normalized)) return true;
  if (["seedance", "vipeak2", "vp2"].includes(normalized)) return true;
  return normalized.includes("wan27") || normalized.includes("wan2.7") || normalized.includes("vipeak1") || normalized.includes("seedance") || normalized.includes("vipeak2") || normalized.includes("dreamina") || normalized.includes("seedream") || normalized.includes("qwenimage3");
}

function assertExplicitAdvancedProvider(value = "") {
  if (value === undefined || value === null || value === "") return;
  if (!isExplicitAdvancedProvider(value)) {
    throw advancedValidationError("INVALID_PROVIDER", "provider must be wan30, wan27/vipeak1, happyhorse, seedance, seedance25, seedance-nsfw, a Vega provider id, seedream5-image, qwen-image3, qwen37-flash, byteplus-language, or papaya.", { provider: value });
  }
}

function assertAdvancedDurationInput(provider = "seedance", value) {
  if (value === undefined || value === null || value === "") return;
  if (isVegaProvider(provider)) {
    normalizeVegaDuration(provider, value);
    return;
  }
  const bounds = advancedDurationBounds(provider);
  const duration = Number(value);
  if (normalizeAdvancedProvider(provider) === "wan30" && duration === -1) return;
  if (!Number.isFinite(duration) || !Number.isInteger(duration) || duration < bounds.min || duration > bounds.max) {
    throw advancedValidationError(
      "INVALID_DURATION",
      `${publicProviderLabel(provider)} duration must be an integer from ${bounds.min} to ${bounds.max} seconds.`,
      { duration: value, min: bounds.min, max: bounds.max },
    );
  }
}

function assertAdvancedResolutionInput(provider = "seedance", value, { seedanceTier = "standard", videoCapability = "" } = {}) {
  if (value === undefined || value === null || value === "") return;
  if (isVegaProvider(provider)) {
    normalizeVegaResolution(value);
    return;
  }
  const raw = String(value || "").trim().toLowerCase();
  const capability = normalizeAliyunVideoCapability(videoCapability, { provider });
  if (normalizeAdvancedProvider(provider) === "seedance25") {
    if (!["480p", "720p"].includes(raw)) {
      throw advancedValidationError("INVALID_RESOLUTION", "Seedance 2.5 resolution must be 480p or 720p.", { resolution: value, allowed: ["480p", "720p"] });
    }
    return;
  }
  if (normalizeAdvancedProvider(provider) === SEEDANCE25_DIRECT_PROVIDER) {
    const allowed = [...SEEDANCE25_DIRECT_RESOLUTIONS];
    if (!allowed.includes(raw)) {
      throw advancedValidationError("INVALID_RESOLUTION", "Seedance 2.5 resolution must be 480p, 720p, or 1080p.", { resolution: value, allowed });
    }
    return;
  }
  if (normalizeAdvancedProvider(provider) === "wan30") {
    const allowed = ALIYUN_VIDEO_CAPABILITIES[capability]?.resolutions?.map((item) => item.toLowerCase())
      || ["480p", "720p", "1080p"];
    if (!allowed.includes(raw)) {
      throw advancedValidationError("INVALID_RESOLUTION", `${capability === "wan30-video-pro" || capability === "wan30-video-prime-pro" ? "Wan 3.0 Pro" : "Wan 3.0"} resolution must be one of: ${allowed.join(", ")}.`, { resolution: value, allowed });
    }
    return;
  }
  if (normalizeAdvancedProvider(provider) === "seedream5-image" || normalizeAdvancedProvider(provider) === "z-image-spicy-pro") {
    if (!["1k", "2k"].includes(raw)) {
      throw advancedValidationError("INVALID_RESOLUTION", `${publicProviderLabel(provider)} resolution must be one of: 1K, 2K.`, { resolution: value, allowed: ["1K", "2K"] });
    }
    return;
  }
  if (["wan27", "happyhorse"].includes(normalizeAdvancedProvider(provider))) {
    if (!["720p", "1080p"].includes(raw)) {
    throw advancedValidationError("INVALID_RESOLUTION", "Wan2.7 video resolution must be 720p or 1080p.", { resolution: value, allowed: ["720p", "1080p"] });
    }
    return;
  }
  const normalized = normalizeAdvancedResolution(value);
  const allowed = normalizeSeedanceTier(seedanceTier) === "fast" ? ["480p", "720p"] : ["480p", "720p", "1080p", "4k"];
  if (!["480p", "720p", "1080p", "4k", "2160p"].includes(raw) || !allowed.includes(normalized)) {
    throw advancedValidationError("INVALID_RESOLUTION", `Seedance ${normalizeSeedanceTier(seedanceTier)} resolution must be one of: ${allowed.join(", ")}.`, { resolution: value, allowed });
  }
}

function assertAdvancedRatioInput(value, provider = "seedance") {
  if (value === undefined || value === null || value === "") return;
  if (isVegaProvider(provider)) {
    normalizeVegaRatio(value);
    return;
  }
  if (["wan30", "seedance25", SEEDANCE25_DIRECT_PROVIDER].includes(normalizeAdvancedProvider(provider)) && String(value || "").trim().toLowerCase() === "adaptive") return;
  const normalized = String(value || "").trim().replace(/[锛歺X]/g, ":");
  if (!/^\d+\s*:\s*\d+$/.test(normalized)) {
    throw advancedValidationError("INVALID_RATIO", "ratio must use width:height format, for example 9:16, 16:9, or 1:1.", { ratio: value });
  }
  const [width, height] = normalized.split(":").map((part) => Number(part.trim()));
  const ratio = width / height;
  if (!Number.isFinite(ratio) || ratio < SEEDANCE_IMAGE_ASPECT_RATIO_MIN || ratio > SEEDANCE_IMAGE_ASPECT_RATIO_MAX) {
    throw advancedValidationError("INVALID_RATIO", `ratio must be between ${SEEDANCE_IMAGE_ASPECT_RATIO_MIN} and ${SEEDANCE_IMAGE_ASPECT_RATIO_MAX}.`, {
      ratio: value,
      min: SEEDANCE_IMAGE_ASPECT_RATIO_MIN,
      max: SEEDANCE_IMAGE_ASPECT_RATIO_MAX,
    });
  }
}

function plainObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function firstPresent(...values) {
  for (const value of values) {
    if (value !== undefined && value !== null && value !== "") return value;
  }
  return undefined;
}

function boolFromRequest(value, fallback = false) {
  if (value === undefined || value === null || value === "") return fallback;
  if (typeof value === "boolean") return value;
  const normalized = String(value).trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  return fallback;
}

function requestParamsFromBody(body = {}) {
  return plainObject(body.params);
}

function mergedRequestForMedia(body = {}, caseParams = {}) {
  return {
    ...caseParams,
    ...requestParamsFromBody(body),
    ...body,
  };
}

function pickRequestFields(source = {}, fields = []) {
  const picked = {};
  fields.forEach((field) => {
    if (source[field] !== undefined && source[field] !== null && source[field] !== "") picked[field] = source[field];
  });
  return picked;
}

function copyIfPresent(target = {}, source = {}, fromKey = "", toKey = fromKey) {
  if (source[fromKey] !== undefined && source[fromKey] !== null && source[fromKey] !== "") target[toKey] = source[fromKey];
}

function nestedMediaUrl(value) {
  if (typeof value === "string") return value.trim();
  if (value && typeof value === "object" && !Array.isArray(value)) {
    for (const key of ["url", "uri", "assetUri", "imageUrl", "videoUrl", "audioUrl", "image_url", "video_url", "audio_url"]) {
      const found = nestedMediaUrl(value[key]);
      if (found) return found;
    }
  }
  return "";
}

function isProviderAssetUri(value = "") {
  return String(value || "").trim().startsWith("asset://");
}

function isAllowedInlineMediaDataUrl(value = "", kind = "") {
  const text = String(value || "").trim();
  if (kind === "image") return /^data:image\/(?:png|jpeg|jpg|webp|bmp);base64,/i.test(text);
  if (kind === "video") return /^data:video\/(?:mp4|webm|quicktime|x-m4v);base64,/i.test(text);
  if (kind === "audio") return /^data:audio\/(?:mpeg|mp3|wav|x-wav|mp4|aac|ogg|webm);base64,/i.test(text);
  return /^data:(?:image|video|audio)\//i.test(text);
}

function assertSeedanceMediaUrl(value = "", label = "Seedance media", { kind = "" } = {}) {
  const text = String(value || "").trim();
  if (!text) return "";
  if (isProviderAssetUri(text) || isPublicHttpUrl(text) || isAllowedInlineMediaDataUrl(text, kind)) return text;
  throw advancedValidationError("INVALID_MEDIA_URL", `${label} must be a public http(s) URL, asset:// URI, or supported data URL.`, { value: text });
}

function normalizeSeedanceContentItem(item = {}) {
  if (typeof item === "string") return { type: "text", text: item };
  if (!item || typeof item !== "object" || Array.isArray(item)) return item;
  const type = String(item.type || (item.text !== undefined ? "text" : "")).trim();
  if (type === "text") return { ...item, type, text: String(item.text || "") };
  if (type === "image_url") {
    const url = nestedMediaUrl(item.image_url) || nestedMediaUrl(item.imageUrl) || nestedMediaUrl(item.url) || nestedMediaUrl(item);
    const imageUrl = item.image_url && typeof item.image_url === "object" && !Array.isArray(item.image_url)
      ? { ...item.image_url, url }
      : { url };
    return { ...item, image_url: imageUrl, imageUrl: undefined, url: undefined };
  }
  if (type === "video_url") {
    const url = nestedMediaUrl(item.video_url) || nestedMediaUrl(item.videoUrl) || nestedMediaUrl(item.url) || nestedMediaUrl(item);
    const source = item.video_url && typeof item.video_url === "object" && !Array.isArray(item.video_url)
      ? item.video_url
      : {};
    const videoUrl = { ...source, url };
    const duration = firstPresent(item.durationSeconds, item.duration, source.durationSeconds, source.duration);
    if (duration !== undefined) videoUrl.durationSeconds = duration;
    return { ...item, video_url: videoUrl, videoUrl: undefined, url: undefined };
  }
  if (type === "audio_url") {
    const url = nestedMediaUrl(item.audio_url) || nestedMediaUrl(item.audioUrl) || nestedMediaUrl(item.url) || nestedMediaUrl(item);
    const audioUrl = item.audio_url && typeof item.audio_url === "object" && !Array.isArray(item.audio_url)
      ? { ...item.audio_url, url }
      : { url };
    return { ...item, audio_url: audioUrl, audioUrl: undefined, url: undefined };
  }
  return item;
}

function pushSeedanceContentMedia(content = [], type = "image_url", url = "", role = "", extras = {}) {
  const value = String(url || "").trim();
  if (!value) return;
  const exists = content.some((item) => {
    if (!item || item.type !== type) return false;
    const key = type === "video_url" ? "video_url" : type === "audio_url" ? "audio_url" : "image_url";
    return nestedMediaUrl(item[key]) === value && String(item.role || "") === String(role || "");
  });
  if (exists) return;
  const key = type === "video_url" ? "video_url" : type === "audio_url" ? "audio_url" : "image_url";
  const media = { url: value };
  if (extras.durationSeconds !== undefined) media.durationSeconds = extras.durationSeconds;
  content.push({ type, [key]: media, ...(role ? { role } : {}) });
}

function stripSeedanceCompatibilityAliases(payload = {}) {
  [
    "prompt",
    "params",
    "image_url",
    "end_image_url",
    "reference_images",
    "reference_videos",
    "reference_audios",
    "imageUrl",
    "firstFrameUrl",
    "first_frame_url",
    "lastFrameUrl",
    "last_frame_url",
    "endImageUrl",
    "referenceImages",
    "referenceVideos",
    "referenceAudios",
    "generateAudio",
    "webSearch",
    "durationSeconds",
    "aspect_ratio",
  ].forEach((key) => {
    delete payload[key];
  });
  return payload;
}

function normalizeWan27ImageRatio(value = "") {
  const ratio = normalizeVideoRatio(value);
  return new Set(["1:1", "3:4", "4:3", "9:16", "16:9"]).has(ratio) ? ratio : "9:16";
}

function normalizeWan27ImageResolution(value = "") {
  const normalized = String(value || "").trim().toUpperCase();
  if (normalized === "4K") return "4K";
  return normalized === "1K" ? "1K" : "2K";
}

function normalizeSeedream5Tier(value = "") {
  return "pro";
}

function normalizeSeedream5Resolution(value = "") {
  const raw = String(value || "").trim();
  const normalized = raw.toUpperCase();
  if (normalized === "1K" || normalized === "1024") return "1K";
  return "2K";
}

function seedream5ModelForTier(model = "", tier = "pro") {
  const raw = String(model || "").trim();
  if (raw === SEEDREAM5_LITE_ENDPOINT_ID) return SEEDREAM5_PRO_ENDPOINT_ID;
  const compact = raw.toLowerCase().replace(/[\s_.-]+/g, "");
  if ([
    "lite",
    "pro",
    "seedream",
    "seedream5",
    "seedream50",
    "seedream5pro",
    "seedream50pro",
    "seedreampro",
  ].includes(compact)) {
    return SEEDREAM5_PRO_ENDPOINT_ID;
  }
  if (raw && raw !== SEEDREAM5_PRO_ENDPOINT_ID) return raw;
  return SEEDREAM5_PRO_ENDPOINT_ID;
}

function seedream5SequentialImageGenerationValue(value, { model = "", tier = "" } = {}) {
  const text = String(value ?? "").trim();
  if (!text) return "";
  const targetModel = String(model || "").trim();
  const isProModel = targetModel === SEEDREAM5_PRO_ENDPOINT_ID || normalizeSeedream5Tier(tier) === "pro";
  return isProModel ? "" : text;
}

function normalizeSeedream5ResponseFormat(value = "url") {
  const raw = String(value || "").trim().toLowerCase();
  return raw === "b64_json" ? "b64_json" : "url";
}

function normalizeSeedream5OutputFormat(value = "") {
  const raw = String(value || "").trim().toLowerCase();
  if (raw === "jpg") return "jpeg";
  return ["png", "jpeg"].includes(raw) ? raw : "";
}

function normalizeSeedream5OptimizePromptOptions(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const mode = String(value.mode || "").trim().toLowerCase();
  if (!["standard", "fast"].includes(mode)) return null;
  return { mode };
}

function wan27ImageSize(resolution = "2K", ratio = "9:16") {
  const tier = normalizeWan27ImageResolution(resolution);
  const normalizedRatio = normalizeWan27ImageRatio(ratio);
  const sizes = {
    "1K": {
      "1:1": "1024*1024",
      "3:4": "768*1024",
      "4:3": "1024*768",
      "9:16": "720*1280",
      "16:9": "1280*720",
    },
    "2K": {
      "1:1": "2048*2048",
      "3:4": "1536*2048",
      "4:3": "2048*1536",
      "9:16": "1440*2560",
      "16:9": "2560*1440",
    },
    "4K": {
      "1:1": "4096*4096",
      "3:4": "3072*4096",
      "4:3": "4096*3072",
      "9:16": "2160*3840",
      "16:9": "3840*2160",
    },
  };
  return sizes[tier]?.[normalizedRatio] || tier;
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

function seedanceOfficialPixelDimensions(resolution = "720p", ratio = "16:9") {
  const normalizedResolution = normalizeAdvancedResolution(resolution);
  const normalizedRatio = normalizeVideoRatio(ratio);
  if (normalizedRatio === "16:9") {
    if (normalizedResolution === "480p") return { width: 864, height: 480 };
    if (normalizedResolution === "1080p") return { width: 1920, height: 1088 };
    if (normalizedResolution === "4k") return { width: 3840, height: 2160 };
    return { width: 1248, height: 704 };
  }
  if (normalizedRatio === "9:16") {
    if (normalizedResolution === "480p") return { width: 480, height: 864 };
    if (normalizedResolution === "1080p") return { width: 1088, height: 1920 };
    if (normalizedResolution === "4k") return { width: 2160, height: 3840 };
    return { width: 704, height: 1248 };
  }
  return videoPixelDimensions(normalizedResolution, normalizedRatio);
}

function seedanceUsdPerMillionTokens(resolution = "720p", options = {}) {
  const normalizedResolution = normalizeAdvancedResolution(resolution);
  const hasVideoInput = Boolean(options.hasVideoInput || options.rateKind === "video_input");
  const isFast = normalizeSeedanceTier(options.seedanceTier) === "fast" || /fast/i.test(String(options.model || ""));
  if (isFast) {
    return hasVideoInput
      ? ADVANCED_SEEDANCE_FAST_VIDEO_INPUT_USD_PER_MILLION_TOKENS
      : ADVANCED_SEEDANCE_FAST_USD_PER_MILLION_TOKENS;
  }
  if (hasVideoInput) {
    return normalizedResolution === "4k"
      ? ADVANCED_SEEDANCE_VIDEO_INPUT_4K_USD_PER_MILLION_TOKENS
      : normalizedResolution === "1080p"
      ? ADVANCED_SEEDANCE_VIDEO_INPUT_1080P_USD_PER_MILLION_TOKENS
      : ADVANCED_SEEDANCE_VIDEO_INPUT_720P_USD_PER_MILLION_TOKENS;
  }
  return normalizedResolution === "4k"
    ? ADVANCED_SEEDANCE_4K_USD_PER_MILLION_TOKENS
    : normalizedResolution === "1080p"
    ? ADVANCED_SEEDANCE_1080P_USD_PER_MILLION_TOKENS
    : ADVANCED_SEEDANCE_720P_USD_PER_MILLION_TOKENS;
}

function seedanceTokenPricing(options = {}) {
  const resolution = normalizeAdvancedResolution(options.resolution);
  const ratio = normalizeVideoRatio(options.ratio || options.aspect_ratio || "16:9");
  const duration = clampNumber(options.duration ?? options.durationSeconds, advancedDurationBounds("seedance").fallback, advancedDurationBounds("seedance").min, advancedDurationBounds("seedance").max);
  const fps = clampNumber(options.fps || ADVANCED_SEEDANCE_FPS, ADVANCED_SEEDANCE_FPS, 1, 120);
  const videoInputSeconds = durationSecondsFromValue(firstPresent(
    options.videoInputSeconds,
    options.inputVideoSeconds,
    options.referenceVideoDurationSeconds,
    options.referenceVideoSeconds,
  ));
  const hasVideoInput = videoInputSeconds > 0 || Boolean(options.hasVideoInput || options.rateKind === "video_input");
  const { width, height } = seedanceOfficialPixelDimensions(resolution, ratio);
  const billableSeconds = hasVideoInput ? duration + videoInputSeconds : duration;
  const outputTokens = Math.ceil((billableSeconds * width * height * fps) / 1024);
  const usdPerMillionTokens = seedanceUsdPerMillionTokens(resolution, {
    ...options,
    hasVideoInput,
  });
  const yuanPerMillionTokens = pricingNumber(usdPerMillionTokens * UPSTREAM_USD_CNY_RATE, 0, 0, 6);
  const baseCredits = creditsAmount((outputTokens * yuanPerMillionTokens * ADVANCED_CREDITS_PER_CNY) / 1000000);
  return {
    resolution,
    ratio,
    duration,
    videoInputSeconds,
    billableSeconds,
    hasVideoInput,
    fps,
    width,
    height,
    outputTokens,
    usdPerMillionTokens,
    usdCnyRate: UPSTREAM_USD_CNY_RATE,
    yuanPerMillionTokens,
    baseCredits,
    source: "byteplus_official_token_pricing",
  };
}

function advancedDurationBounds(provider = "seedance") {
  const normalizedProvider = normalizeAdvancedProvider(provider);
  if (isVegaProvider(normalizedProvider)) { const bounds = vegaDurationBounds(normalizedProvider); return { fallback: bounds.fallback, min: bounds.min, max: bounds.max }; }
  if (["seedream5-image", "qwen-image3", "qwen37-flash", "byteplus-language", "papaya", "z-image-spicy-pro"].includes(normalizedProvider)) return { fallback: 1, min: 1, max: 1 };
  if (normalizedProvider === "wan30") return { fallback: 5, min: 2, max: 30 };
  if (["seedance25", SEEDANCE25_DIRECT_PROVIDER].includes(normalizedProvider)) return { fallback: 4, min: 4, max: 30 };
  if (normalizedProvider === "happyhorse") return { fallback: 5, min: 3, max: 15 };
  return normalizedProvider === "wan27"
    ? { fallback: 5, min: 2, max: 15 }
    : { fallback: 5, min: 5, max: 15 };
}

function qwen37FlashPricingEstimate(advancedPricing = DEFAULT_ADVANCED_PRICING, options = {}) {
  const pricing = normalizeAdvancedPricing(advancedPricing);
  const configured = pricing.qwen37Flash || DEFAULT_ADVANCED_PRICING.qwen37Flash;
  const inputTokens = Math.max(1, Math.min(1000000, Math.floor(Number(options.inputTokens || options.promptTokens || 1) || 1)));
  const outputTokens = Math.max(0, Math.min(QWEN37_FLASH_MAX_OUTPUT_TOKENS, Math.floor(Number(options.outputTokens ?? options.completionTokens ?? options.maxTokens ?? configured.defaultMaxTokens) || 0)));
  const officialTier = QWEN37_FLASH_SINGAPORE_CNY_PER_MILLION_TOKENS.find((tier) => inputTokens <= tier.maxInputTokens)
    || QWEN37_FLASH_SINGAPORE_CNY_PER_MILLION_TOKENS[QWEN37_FLASH_SINGAPORE_CNY_PER_MILLION_TOKENS.length - 1];
  const inputCnyPerMillionTokens = inputTokens <= 32768
    ? pricingNumber(configured.inputCnyPerMillionTokens, officialTier.input, 0, 6)
    : officialTier.input;
  const outputCnyPerMillionTokens = inputTokens <= 32768
    ? pricingNumber(configured.outputCnyPerMillionTokens, officialTier.output, 0, 6)
    : officialTier.output;
  const inputCny = (inputTokens * inputCnyPerMillionTokens) / 1000000;
  const outputCny = (outputTokens * outputCnyPerMillionTokens) / 1000000;
  const totalCny = inputCny + outputCny;
  const baseCredits = creditsAmount(totalCny * Number(pricing.creditsPerCny || ADVANCED_CREDITS_PER_CNY));
  return {
    provider: "qwen37-flash",
    providerLabel: "Qwen3.7 Flash",
    model: QWEN37_FLASH_MODEL,
    inputTokens,
    outputTokens,
    inputCnyPerMillionTokens,
    outputCnyPerMillionTokens,
    inputCny: pricingNumber(inputCny, 0, 0, 8),
    outputCny: pricingNumber(outputCny, 0, 0, 8),
    totalCny: pricingNumber(totalCny, 0, 0, 8),
    baseCredits,
    credits: baseCredits,
    markup: 1,
    source: "aliyun_singapore_official_token_pricing",
  };
}

function advancedModelPricingRaw(provider = "seedance", options = {}) {
  const normalizedProvider = normalizeAdvancedProvider(provider);
  if (normalizedProvider === "h3-vega" || normalizedProvider === "vega10-lite" || normalizedProvider === "seedance20-vega" || normalizedProvider === "seedance25-vega") {
    const isVega10Pro = normalizedProvider === "seedance20-vega";
    const isVega15Pro = normalizedProvider === "seedance25-vega";
    const isVegaProWithReferenceRates = isVega10Pro || isVega15Pro;
    const isVega10Lite = normalizedProvider === "vega10-lite";
    const providerLabel = isVega10Pro ? "Vega 1.0 Pro" : isVega15Pro ? "Vega 1.5 Pro" : isVega10Lite ? "Vega 1.0 Lite" : "Vega 1.5 Lite";
    const modelVersion = isVega10Pro ? "1.0-pro" : isVega15Pro ? "1.5-pro" : isVega10Lite ? "1.0-lite" : "1.5-lite";
    const pricingKey = isVega10Pro ? "vega10_pro" : isVega15Pro ? "vega15_pro" : isVega10Lite ? "vega10_lite" : "h3_vega";
    const duration = options.duration ?? options.durationSeconds;
    const normalizedDuration = normalizeVegaDuration(normalizedProvider, duration);
    const adaptiveDuration = normalizedDuration === -1;
    const billingDuration = adaptiveDuration ? 30 : normalizedDuration;
    const resolution = normalizeVegaResolution(options.resolution || (isVega10Lite ? "768P" : "1080P"), normalizedProvider).toLowerCase();
    const ratio = normalizeVegaRatio(options.ratio || options.aspect_ratio || "16:9", normalizedProvider);
    const advancedPricing = normalizeAdvancedPricing(options.advancedPricing || options.pricing || DEFAULT_ADVANCED_PRICING);
    const priceTable = isVega10Pro
      ? advancedPricing.vega10ProCreditsPerSecondByResolution
      : isVega15Pro
      ? advancedPricing.vega15ProCreditsPerSecondByResolution
      : isVega10Lite
      ? advancedPricing.vega10LiteCreditsPerSecondByResolution
      : advancedPricing.h3VegaCreditsPerSecondByResolution;
    const inputPriceTable = isVega10Pro
      ? advancedPricing.vega10ProInputVideoCreditsPerSecondByResolution
      : isVega15Pro
      ? advancedPricing.vega15ProInputVideoCreditsPerSecondByResolution
      : isVega10Lite
      ? advancedPricing.vega10LiteInputVideoCreditsPerSecondByResolution
      : advancedPricing.h3VegaInputVideoCreditsPerSecondByResolution;
    const creditsPerSecond = pricingNumber(priceTable?.[resolution], 0, 0, 6);
    const inputVideoCreditsPerSecond = pricingNumber(inputPriceTable?.[resolution], 0, 0, 6);
    if (!(creditsPerSecond > 0)) {
      const error = advancedValidationError(
        "MODEL_PRICING_UNAVAILABLE",
        `${providerLabel} ${resolution.toUpperCase()} pricing is not configured. Generation was not started.`,
        { resolution },
      );
      error.statusCode = 422;
      throw error;
    }
    const referenceVideoDurations = Array.isArray(options.referenceVideoDurations)
      ? options.referenceVideoDurations
      : [];
    const explicitInputVideoSeconds = durationSecondsFromValue(firstPresent(
      options.inputVideoSeconds,
      options.videoInputSeconds,
      options.referenceVideoDurationSeconds,
      options.referenceVideoSeconds,
    ));
    const rawInputVideoSeconds = durationSecondsFromValue(Math.max(
      explicitInputVideoSeconds,
      referenceVideoDurations.reduce((sum, seconds) => sum + durationSecondsFromValue(seconds), 0),
    ));
    const hasVideoInput = rawInputVideoSeconds > 0;
    if (hasVideoInput && !(inputVideoCreditsPerSecond > 0)) {
      const error = advancedValidationError(
        "MODEL_PRICING_UNAVAILABLE",
        `${providerLabel} ${resolution.toUpperCase()} input-video pricing is not configured. Generation was not started.`,
        { resolution, rateKind: "video_input" },
      );
      error.statusCode = 422;
      throw error;
    }
    // Tencent charges a reference-video request at the reference-video rate for
    // both input and output. The input is billed for at least 2/3 of the output.
    const inputVideoMinimumSeconds = isVegaProWithReferenceRates && hasVideoInput ? Math.ceil(billingDuration * 2 / 3) : 0;
    const inputVideoSeconds = isVegaProWithReferenceRates && hasVideoInput
      ? Math.max(rawInputVideoSeconds, inputVideoMinimumSeconds)
      : rawInputVideoSeconds;
    const outputRate = isVegaProWithReferenceRates && hasVideoInput ? inputVideoCreditsPerSecond : creditsPerSecond;
    const referenceImageCount = Math.max(0, Math.floor(Number(options.referenceImageCount || 0) || 0));
    const billableReferenceImageCount = isVega10Lite ? Math.max(0, referenceImageCount - 5) : 0;
    const referenceImageCreditsEach = isVega10Lite
      ? pricingNumber(advancedPricing.vega10LiteReferenceImageCreditsEach, 0, 0, 6)
      : 0;
    if (billableReferenceImageCount > 0 && !(referenceImageCreditsEach > 0)) {
      const error = advancedValidationError(
        "MODEL_PRICING_UNAVAILABLE",
        `${providerLabel} extra-reference-image pricing is not configured. Generation was not started.`,
        { rateKind: "reference_image" },
      );
      error.statusCode = 422;
      throw error;
    }
    const outputCredits = creditsAmount(billingDuration * outputRate);
    const inputVideoCredits = creditsAmount(hasVideoInput ? inputVideoSeconds * inputVideoCreditsPerSecond : 0);
    const referenceImageCredits = creditsAmount(billableReferenceImageCount * referenceImageCreditsEach);
    const credits = creditsAmount(outputCredits + inputVideoCredits + referenceImageCredits);
    return {
      provider: normalizedProvider,
      providerLabel,
      model: `wand-vega-video / ${modelVersion}`,
      duration: normalizedDuration,
      requestedDuration: normalizedDuration,
      billingDuration,
      adaptiveDuration,
      resolution,
      ratio,
      creditsPerSecond: outputRate,
      outputCreditsPerSecond: outputRate,
      outputCredits,
      inputVideoSeconds,
      rawInputVideoSeconds,
      inputVideoMinimumSeconds,
      inputVideoCreditsPerSecond,
      inputVideoCredits,
      referenceImageCount,
      billableReferenceImageCount,
      referenceImageCreditsEach,
      referenceImageCredits,
      baseCredits: credits,
      credits,
      markup: 1,
      source: hasVideoInput || billableReferenceImageCount > 0
        ? `configured_${pricingKey}_input_output_and_reference_rates`
        : `configured_${pricingKey}_output_duration_rate`,
    };
  }
  if (isVegaProvider(normalizedProvider)) throw vegaPricingUnavailableError(normalizedProvider);
  const advancedPricing = normalizeAdvancedPricing(options.advancedPricing || options.pricing || DEFAULT_ADVANCED_PRICING);
  if (normalizedProvider === "papaya") return papayaPricingEstimate(advancedPricing, options);
  if (["qwen37-flash", "byteplus-language"].includes(normalizedProvider)) {
    const estimate = qwen37FlashPricingEstimate(advancedPricing, options);
    return normalizedProvider === "byteplus-language"
      ? { ...estimate, provider: normalizedProvider, providerLabel: "BytePlus Language", model: BYTEPLUS_LANGUAGE_MODEL, source: "byteplus_token_pricing_fallback" }
      : estimate;
  }
  if (normalizedProvider === "wan30") {
    const requestedDuration = Number(options.duration ?? options.durationSeconds ?? 5);
    const adaptiveDuration = requestedDuration === -1;
    const duration = adaptiveDuration ? -1 : clampNumber(requestedDuration, 5, 2, 30);
    const billingDuration = adaptiveDuration ? 30 : duration;
    const capability = normalizeAliyunVideoCapability(firstPresent(options.videoCapability, options.capability, "wan30-video"), { provider: "wan30" });
    assertAdvancedResolutionInput("wan30", options.resolution || "1080p", { videoCapability: capability });
    const resolution = normalizeWan27Resolution(options.resolution || "1080p").toLowerCase();
    const rateTables = {
      "wan30-video": ["wan30CreditsPerSecondByResolution", "Wan 3.0", ALIYUN_WAN30_MODEL],
      "wan30-video-pro": ["wan30ProCreditsPerSecondByResolution", "Wan 3.0 Pro", ALIYUN_WAN30_MODEL.replace(/-video$/, "-video-pro")],
      "wan30-video-prime": ["wan30PrimeCreditsPerSecondByResolution", "Wan 3.0 Prime", ALIYUN_WAN30_PRIME_MODEL],
      "wan30-video-prime-pro": ["wan30PrimeProCreditsPerSecondByResolution", "Wan 3.0 VSR-Prime", ALIYUN_WAN30_PRIME_MODEL.replace(/-prime$/, "-prime-pro")],
    };
    const [tableKey, providerLabel, model] = rateTables[capability] || rateTables["wan30-video"];
    const configuredRates = advancedPricing[tableKey] || {};
    const fallbackRates = DEFAULT_ADVANCED_PRICING[tableKey] || {};
    const creditsPerSecond = pricingNumber(configuredRates[resolution], fallbackRates[resolution], 0, 6);
    if (!(creditsPerSecond > 0)) {
      const error = advancedValidationError(
        "MODEL_PRICING_UNAVAILABLE",
        `${providerLabel} ${resolution} pricing is not configured. Generation was not started.`,
        { capability, resolution },
      );
      error.statusCode = 422;
      throw error;
    }
    const credits = creditsAmount(billingDuration * creditsPerSecond);
    return {
      provider: "wan30",
      providerLabel,
      capability,
      model,
      duration,
      billingDuration,
      adaptiveDuration,
      resolution,
      ratio: normalizeVideoRatio(options.ratio || "adaptive"),
      billing: "output",
      creditsPerSecond,
      outputCredits: credits,
      inputVideoCredits: 0,
      baseCredits: credits,
      credits,
      markup: 1,
      source: `configured_${capability.replace(/-/g, "_")}_output_duration_rate`,
    };
  }
  const bounds = advancedDurationBounds(normalizedProvider);
  const duration = clampNumber(options.duration ?? options.durationSeconds, bounds.fallback, bounds.min, bounds.max);
  if (normalizedProvider === "qwen-image3") {
    return qwenImage3PricingEstimate(advancedPricing, options);
  }
  if (normalizedProvider === "seedream5-image") {
    return seedream5ImagePricingEstimate(advancedPricing, options);
  }
  if (normalizedProvider === "z-image-spicy-pro") {
    const imagePricing = advancedPricing.zImageSpicyPro || DEFAULT_ADVANCED_PRICING.zImageSpicyPro;
    const resolution = normalizeWan27ImageResolution(firstPresent(options.resolution, options.size, imagePricing.defaultResolution || "2K"));
    return fixedCnyPricingEstimate(imagePricing.saleCnyPerImage, "z_image_spicy_pro", {
      purchaseCnyPerImage: imagePricing.purchaseCnyPerImage,
      saleCnyPerImage: imagePricing.saleCnyPerImage,
      model: imagePricing.model || "z-image-spicy-pro",
      provider: "z-image-spicy-pro",
      providerLabel: "Z-Image Spicy Pro",
      resolution,
      size: resolution,
      duration: 1,
    }, advancedPricing.creditsPerCny);
  }
  if (normalizedProvider === "seedance25") {
    const mode = normalizeSeedance25Mode(firstPresent(options.functionMode, options.seedanceMode, options.mode));
    const resolution = ["480p", "720p"].includes(String(options.resolution || "").toLowerCase())
      ? String(options.resolution).toLowerCase()
      : "480p";
    const maxDuration = resolution === "720p" ? 29 : 30;
    const requestedDuration = clampNumber(options.duration ?? options.durationSeconds, 4, 4, maxDuration);
    const configuredRates = advancedPricing.seedance25CreditsPerSecondByResolution || {};
    const fallbackRates = DEFAULT_ADVANCED_PRICING.seedance25CreditsPerSecondByResolution;
    const creditsPerSecond = pricingNumber(configuredRates[resolution], fallbackRates[resolution], 0, 6);
    const credits = creditsAmount(requestedDuration * creditsPerSecond);
    return {
      provider: "seedance25",
      providerLabel: "Seedance 2.5",
      model: SEEDANCE25_MODEL_ID,
      mode,
      duration: requestedDuration,
      requestedDuration,
      inputVideoSeconds: 0,
      resolution,
      ratio: String(options.ratio || "16:9"),
      creditsPerSecond,
      outputCredits: credits,
      inputVideoCredits: 0,
      baseCredits: credits,
      credits,
      markup: 1,
      source: "configured_seedance25_duration_rate",
    };
  }
  if (normalizedProvider === SEEDANCE25_DIRECT_PROVIDER) {
    const mode = normalizeSeedance25DirectMode(firstPresent(options.functionMode, options.seedanceMode, options.mode));
    const resolution = ["480p", "720p", "1080p"].includes(String(options.resolution || "").toLowerCase())
      ? String(options.resolution).toLowerCase()
      : "480p";
    const inputVideoSeconds = durationSecondsFromValue(firstPresent(
      options.inputVideoSeconds,
      options.videoInputSeconds,
      options.referenceVideoDurationSeconds,
    ));
    const requestedDuration = clampNumber(options.duration ?? options.durationSeconds, 4, 4, 30);
    const duration = mode === "edit" && inputVideoSeconds > 0
      ? clampNumber(Math.ceil(inputVideoSeconds), 4, 4, 30)
      : requestedDuration;
    const hasVideoInput = inputVideoSeconds > 0;
    const configuredRates = hasVideoInput
      ? advancedPricing.seedanceNsfwVideoCreditsPerSecondByResolution || {}
      : advancedPricing.seedanceNsfwCreditsPerSecondByResolution || {};
    const fallbackRates = hasVideoInput
      ? DEFAULT_ADVANCED_PRICING.seedanceNsfwVideoCreditsPerSecondByResolution
      : DEFAULT_ADVANCED_PRICING.seedanceNsfwCreditsPerSecondByResolution;
    const creditsPerSecond = pricingNumber(configuredRates[resolution], fallbackRates[resolution], 0, 6);
    const billingSeconds = duration + (hasVideoInput ? inputVideoSeconds : 0);
    const credits = creditsAmount(billingSeconds * creditsPerSecond);
    const usdPerMillionTokens = hasVideoInput
      ? SEEDANCE25_DIRECT_USD_PER_MILLION_TOKENS.withVideo
      : SEEDANCE25_DIRECT_USD_PER_MILLION_TOKENS.withoutVideo;
    const purchaseCreditsPerSecond = directPurchaseUsdPerSecond(resolution, { hasVideoInput }) * DEFAULT_CREDITS_PER_USD;
    const markup = purchaseCreditsPerSecond > 0 ? pricingNumber(creditsPerSecond / purchaseCreditsPerSecond, ALIYUN_VIDEO_DEFAULT_MARKUP, 0, 8) : ALIYUN_VIDEO_DEFAULT_MARKUP;
    const estimatedCompletionTokens = directEstimatedCompletionTokens({ resolution, outputSeconds: duration, inputVideoSeconds });
    return {
      provider: SEEDANCE25_DIRECT_PROVIDER,
      providerLabel: SEEDANCE25_DIRECT_LABEL,
      model: SEEDANCE25_DIRECT_MODEL,
      endpoint: SEEDANCE25_DIRECT_ENDPOINT,
      mode,
      duration,
      requestedDuration,
      inputVideoSeconds,
      hasVideoInput,
      billingSeconds,
      resolution,
      ratio: String(options.ratio || "adaptive"),
      creditsPerSecond,
      outputCredits: creditsAmount(duration * creditsPerSecond),
      inputVideoCreditsPerSecond: hasVideoInput ? creditsPerSecond : 0,
      inputVideoCredits: hasVideoInput ? creditsAmount(inputVideoSeconds * creditsPerSecond) : 0,
      baseCredits: credits,
      credits,
      estimatedCompletionTokens,
      usdPerMillionTokens,
      yuanPerMillionTokens: pricingNumber(usdPerMillionTokens * UPSTREAM_USD_CNY_RATE, 0, 0, 6),
      markup,
      source: "seedance25_direct_token_estimate",
    };
  }
  if (isAliyunVideoProvider(normalizedProvider)) {
    const capability = normalizeAliyunVideoCapability(firstPresent(
      options.videoCapability,
      options.aliyunVideoCapability,
      options.wanCapability,
      options.happyhorseCapability,
      normalizedProvider === "happyhorse" ? "happyhorse-i2v" : "wan27-i2v",
    ), { provider: normalizedProvider, model: options.model });
    const definition = ALIYUN_VIDEO_CAPABILITIES[capability] || ALIYUN_VIDEO_CAPABILITIES[normalizedProvider === "happyhorse" ? "happyhorse-i2v" : "wan27-i2v"];
    const aliyunDuration = clampNumber(
      options.duration ?? options.durationSeconds,
      Math.max(5, definition?.duration?.[0] || 0),
      definition?.duration?.[0] ?? bounds.min,
      definition?.duration?.[1] ?? bounds.max,
    );
    const definitionResolutions = definition?.resolutions || ["720P", "1080P"];
    const requestedResolution = String(options.resolution || "").trim().toUpperCase();
    const normalizedWanResolution = normalizeWan27Resolution(requestedResolution);
    const resolution = definitionResolutions.includes(normalizedWanResolution)
      ? normalizedWanResolution
      : (definitionResolutions.includes("720P") ? "720P" : definitionResolutions[0]);
    const publicResolution = normalizeAdvancedResolution(resolution);
    const animateMode = String(firstPresent(options.animateMode, options.mode, options.parameters?.mode, "wan-std")).toLowerCase() === "wan-pro" ? "wan-pro" : "wan-std";
    const model = String(options.model || aliyunVideoModelForCapability(capability)).trim().toLowerCase();
    const audioEnabled = boolFromRequest(firstPresent(
      options.parameters?.audio,
      options.audio,
      options.generateAudio,
      options.generate_audio,
    ), true);
    const configuredModelTable = capability === "wan-legacy"
      ? advancedPricing.aliyunVideoCreditsPerSecondByModel?.[model]
      : null;
    const fallbackModelTable = capability === "wan-legacy"
      ? DEFAULT_ADVANCED_PRICING.aliyunVideoCreditsPerSecondByModel?.[model]
      : null;
    const variantRateKey = `${publicResolution}-${audioEnabled ? "audio" : "silent"}`;
    const rateKey = definition?.mediaKind === "animate"
      ? animateMode
      : configuredModelTable?.[variantRateKey] !== undefined || fallbackModelTable?.[variantRateKey] !== undefined
      ? variantRateKey
      : publicResolution;
    const wan30PriceTableKey = {
      "wan30-video": "wan30CreditsPerSecondByResolution",
      "wan30-video-pro": "wan30ProCreditsPerSecondByResolution",
      "wan30-video-prime": "wan30PrimeCreditsPerSecondByResolution",
      "wan30-video-prime-pro": "wan30PrimeProCreditsPerSecondByResolution",
    }[capability];
    const familyPriceTable = capability.startsWith("happyhorse-")
      ? advancedPricing.happyhorseCreditsPerSecondByResolution
      : capability.startsWith("wan27-")
      ? advancedPricing.wan27CreditsPerSecondByResolution
      : wan30PriceTableKey
      ? advancedPricing[wan30PriceTableKey]
      : null;
    const fallbackFamilyPriceTable = capability.startsWith("happyhorse-")
      ? DEFAULT_ADVANCED_PRICING.happyhorseCreditsPerSecondByResolution
      : capability.startsWith("wan27-")
      ? DEFAULT_ADVANCED_PRICING.wan27CreditsPerSecondByResolution
      : wan30PriceTableKey
      ? DEFAULT_ADVANCED_PRICING[wan30PriceTableKey]
      : null;
    const priceTable = configuredModelTable
      || familyPriceTable
      || advancedPricing.aliyunVideoCreditsPerSecondByCapability?.[capability]
      || null;
    const fallbackTable = fallbackModelTable
      || fallbackFamilyPriceTable
      || DEFAULT_ADVANCED_PRICING.aliyunVideoCreditsPerSecondByCapability?.[capability]
      || null;
    const creditsPerSecond = priceTable?.[rateKey] || fallbackTable?.[rateKey] || 0;
    const rawInputVideoSeconds = durationSecondsFromValue(firstPresent(
      options.inputVideoSeconds,
      options.videoInputSeconds,
      options.referenceVideoDurationSeconds,
      options.referenceVideoSeconds,
    ));
    const inputVideoSeconds = definition?.billing === "input_output"
      ? (capability === "wan27-r2v" ? Math.min(aliyunDuration, rawInputVideoSeconds) : rawInputVideoSeconds)
      : 0;
    const outputCredits = creditsAmount(aliyunDuration * creditsPerSecond);
    const inputVideoCredits = creditsAmount(inputVideoSeconds * creditsPerSecond);
    const credits = creditsAmount(outputCredits + inputVideoCredits);
    return {
      provider: normalizedProvider,
      providerLabel: {
        "wan30-video": "Wan 3.0",
        "wan30-video-pro": "Wan 3.0 Pro",
        "wan30-video-prime": "Wan 3.0 Prime",
        "wan30-video-prime-pro": "Wan 3.0 VSR-Prime",
      }[capability] || (normalizedProvider === "happyhorse" ? "HappyHorse" : "Wan"),
      capability,
      model,
      duration: aliyunDuration,
      resolution,
      publicResolution,
      animateMode: definition?.mediaKind === "animate" ? animateMode : undefined,
      audio: audioEnabled,
      creditsPerSecond,
      outputCredits,
      inputVideoSeconds,
      inputVideoCreditsPerSecond: creditsPerSecond,
      inputVideoCredits,
      baseCredits: credits,
      credits,
      markup: 1,
      source: "configured_capability_duration_rate",
    };
  }
  const resolution = normalizeAdvancedResolution(options.resolution);
  const ratio = normalizeVideoRatio(options.ratio || options.aspect_ratio || "16:9");
  const seedanceTier = normalizeSeedanceTier(options.seedanceTier);
  const isFast = seedanceTier === "fast";
  const priceTable = isFast
    ? advancedPricing.seedanceFastCreditsPerSecondByResolution
    : advancedPricing.seedanceCreditsPerSecondByResolution;
  const fallbackPriceTable = isFast
    ? DEFAULT_ADVANCED_PRICING.seedanceFastCreditsPerSecondByResolution
    : DEFAULT_ADVANCED_PRICING.seedanceCreditsPerSecondByResolution;
  const tierDiscount = 1;
  const creditsPerSecond = priceTable[resolution] || fallbackPriceTable[resolution] || DEFAULT_ADVANCED_PRICING.seedanceCreditsPerSecondByResolution["720p"];
  const videoInputSeconds = durationSecondsFromValue(firstPresent(
    options.videoInputSeconds,
    options.inputVideoSeconds,
    options.referenceVideoDurationSeconds,
    options.referenceVideoSeconds,
  ));
  const videoInputTable = isFast
    ? advancedPricing.seedanceFastVideoInputCreditsPerSecondByResolution || {}
    : advancedPricing.seedanceVideoInputCreditsPerSecondByResolution || {};
  const fallbackVideoInputTable = isFast
    ? DEFAULT_ADVANCED_PRICING.seedanceFastVideoInputCreditsPerSecondByResolution
    : DEFAULT_ADVANCED_PRICING.seedanceVideoInputCreditsPerSecondByResolution;
  const videoInputCreditsPerSecond = videoInputTable[resolution] || fallbackVideoInputTable[resolution] || DEFAULT_ADVANCED_PRICING.seedanceVideoInputCreditsPerSecondByResolution["720p"];
  const outputCredits = creditsAmount(duration * creditsPerSecond * tierDiscount);
  const videoInputCredits = creditsAmount(videoInputSeconds * videoInputCreditsPerSecond * tierDiscount);
  const credits = creditsAmount(outputCredits + videoInputCredits);
  return {
    provider: "seedance",
    providerLabel: "Seedance",
    model: options.model || (seedanceTier === "fast" ? MODEL_FAST : MODEL_QUALITY),
    seedanceTier,
    tierDiscount,
    duration,
    ratio,
    resolution,
    creditsPerSecond,
    outputCredits,
    videoInputSeconds,
    videoInputCreditsPerSecond,
    videoInputCredits,
    hasVideoInput: videoInputSeconds > 0,
    baseCredits: credits,
    credits,
    markup: 1,
    source: "public_duration_rate",
  };
}

function advancedModelPricing(provider = "seedance", options = {}) {
  const estimate = advancedModelPricingRaw(provider, options);
  const pricing = normalizeAdvancedPricing(options.advancedPricing || options.pricing || DEFAULT_ADVANCED_PRICING);
  const modelKey = advancedPricingModelKey(provider, {
    ...options,
    capability: options.capability || options.videoCapability,
    tier: options.tier || options.qwenTier || options.seedreamTier,
  });
  const setting = advancedModelSetting(pricing, modelKey);
  if (setting.discount === 1) return { ...estimate, modelKey, modelDiscount: 1 };
  const scale = (value) => value === undefined || value === null ? value : pricingNumber(Number(value || 0) * setting.discount, 0, 0, 6);
  const discountCredits = (value) => creditsAmount(Number(value || 0) * setting.discount);
  return {
    ...estimate,
    modelKey,
    modelDiscount: setting.discount,
    configuredCredits: creditsAmount(estimate.credits || 0),
    creditsPerSecond: scale(estimate.creditsPerSecond),
    outputCreditsPerSecond: scale(estimate.outputCreditsPerSecond),
    outputCredits: discountCredits(estimate.outputCredits),
    inputVideoCreditsPerSecond: scale(estimate.inputVideoCreditsPerSecond),
    videoInputCreditsPerSecond: scale(estimate.videoInputCreditsPerSecond),
    inputVideoCredits: discountCredits(estimate.inputVideoCredits),
    videoInputCredits: discountCredits(estimate.videoInputCredits),
    referenceImageCreditsEach: scale(estimate.referenceImageCreditsEach),
    referenceImageCredits: discountCredits(estimate.referenceImageCredits),
    credits: discountCredits(estimate.credits),
  };
}

function seedream5ImagePricingEstimate(advancedPricing = DEFAULT_ADVANCED_PRICING, options = {}) {
  const pricing = normalizeAdvancedPricing(advancedPricing);
  const seedreamPricing = pricing.seedream5Image || DEFAULT_ADVANCED_PRICING.seedream5Image;
  const tier = normalizeSeedream5Tier(options.seedreamTier || options.seedream5Tier || options.tier || seedreamPricing.defaultTier || "pro");
  const resolution = normalizeSeedream5Resolution(options.resolution || options.size || seedreamPricing.defaultResolution || "2K");
  const referenceImageCount = Math.max(0, Math.floor(Number(firstPresent(
    options.referenceImageCount,
    options.imageCount,
    arrayFromBody(options.referenceImages).length || undefined,
    arrayFromBody(options.images).length || undefined,
  ) || 0)));
  const outputImageCount = Math.max(1, Math.floor(Number(firstPresent(options.n, options.count, options.outputImageCount, 1)) || 1));
  const tierConfig = seedreamPricing.pro || {};
  const model = seedream5ModelForTier(options.model || tierConfig?.model || "", tier);
  const outputUsdPerImage = pricingNumber(tierConfig?.saleUsdPerImageByResolution?.[resolution], DEFAULT_ADVANCED_PRICING.seedream5Image.pro.saleUsdPerImageByResolution[resolution] || SEEDREAM5_PRO_2K_USD_PER_IMAGE, 0, 6);
  const referenceUsdPerImage = pricingNumber(tierConfig?.referenceUsdPerImageAfterFirst, SEEDREAM5_PRO_REFERENCE_USD_PER_IMAGE_AFTER_FIRST, 0, 6);
  const billableReferenceImages = Math.max(0, referenceImageCount - 1);
  const outputUsd = pricingNumber(outputUsdPerImage * outputImageCount, 0, 0, 6);
  const referenceUsd = pricingNumber(referenceUsdPerImage * billableReferenceImages, 0, 0, 6);
  const totalUsd = pricingNumber(outputUsd + referenceUsd, 0, 0, 6);
  const credits = creditsAmount(totalUsd * DEFAULT_CREDITS_PER_USD);
  return {
    provider: "seedream5-image",
    providerLabel: "Seedream 5.0 Image",
    model,
    seedreamTier: tier,
    resolution,
    size: resolution,
    duration: 1,
    outputImageCount,
    referenceImageCount,
    billableReferenceImages,
    outputUsdPerImage,
    referenceUsdPerImage,
    outputUsd,
    referenceUsd,
    totalUsd,
    creditsPerUsd: DEFAULT_CREDITS_PER_USD,
    baseCredits: credits,
    credits,
    markup: 1,
    source: "byteplus_seedream5_official_image_pricing",
  };
}

function seedancePreprocessPricingForAssets(auth = {}, config = {}, assets = [], enabled = false) {
  const empty = {
    enabled: false,
    imageCount: 0,
    resolution: "",
    tier: "",
    credits: 0,
    baseCredits: 0,
    originalCredits: 0,
    perImageCredits: 0,
    perImageBaseCredits: 0,
    perImageOriginalCredits: 0,
    source: "",
    items: [],
  };
  if (!enabled || USE_GATEWAY_UPSTREAM) return empty;

  const uniqueAssets = [];
  const seen = new Set();
  for (const asset of Array.isArray(assets) ? assets : []) {
    const id = String(asset?.id || "").trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    const reusable = Boolean(
      asset.syntheticReferenceAssetUri
      && asset.syntheticReferenceVersion === SEEDANCE_PREPROCESS_REFERENCE_VERSION,
    );
    if (!reusable) uniqueAssets.push(asset);
  }
  if (!uniqueAssets.length) return empty;

  const advancedPricing = config?.platform?.advancedPricing;
  const resolution = normalizeSeedream5Resolution(
    process.env.HOME_REFERENCE_SEEDREAM_SIZE
    || process.env.CHARACTER_SEEDREAM_SIZE
    || advancedPricing?.seedream5Image?.defaultResolution
    || "2K",
  );
  const tier = normalizeSeedream5Tier(
    process.env.HOME_REFERENCE_SEEDREAM_TIER
    || process.env.CHARACTER_SEEDREAM_TIER
    || advancedPricing?.seedream5Image?.defaultTier
    || "pro",
  );
  const rawPerImage = advancedModelPricing("seedream5-image", {
    advancedPricing,
    seedreamTier: tier,
    resolution,
    referenceImageCount: 1,
    outputImageCount: 1,
  });
  const perImage = applyUserPricingToEstimate(rawPerImage, auth.user || 1, pricingContextForAuth(auth));
  const imageCount = uniqueAssets.length;
  const credits = creditsAmount(perImage.credits * imageCount);
  const baseCredits = creditsAmount(perImage.baseCredits * imageCount);
  const originalCredits = creditsAmount(perImage.originalCredits * imageCount);
  return {
    enabled: true,
    imageCount,
    resolution,
    tier,
    credits,
    baseCredits,
    originalCredits,
    perImageCredits: perImage.credits,
    perImageBaseCredits: perImage.baseCredits,
    perImageOriginalCredits: perImage.originalCredits,
    source: perImage.source || "byteplus_seedream5_official_image_pricing",
    items: uniqueAssets.map((asset) => ({
      assetId: asset.id,
      credits: perImage.credits,
      baseCredits: perImage.baseCredits,
      originalCredits: perImage.originalCredits,
    })),
  };
}

function advancedGenerationCost(durationSeconds = 5, provider = "seedance", options = {}) {
  return advancedModelPricing(provider, { ...options, duration: durationSeconds }).credits;
}

function positiveCreditsOrNull(value) {
  const next = Number(value);
  if (!Number.isFinite(next) || next <= 0) return null;
  return creditsAmount(next);
}

function insufficientCreditsMessage(cost, credits) {
  const need = creditsAmount(cost);
  const current = creditsAmount(credits);
  return `Not enough credits. This generation needs ${need} credits; your balance is ${current}. Please top up and try again.`;
}

function insufficientCreditsPayload(cost, credits, extra = {}) {
  return {
    ok: false,
    code: "INSUFFICIENT_CREDITS",
    message: insufficientCreditsMessage(cost, credits),
    cost: creditsAmount(cost),
    credits: creditsAmount(credits),
    ...extra,
  };
}

function stableLedgerId(type = "", meta = {}) {
  const cleanType = String(type || "ledger").trim() || "ledger";
  const stableKey = String(
    (cleanType === "referral_reward" ? `${meta?.referrerUserId || ""}:${meta?.referredUserId || ""}` : "") ||
    meta?.orderId ||
    meta?.taskId ||
    meta?.unlockId ||
    meta?.transactionHash ||
    meta?.paypalOrderId ||
    "",
  ).trim();
  if (!stableKey) return randomId("ledger");
  const digest = crypto.createHash("sha256").update(`${cleanType}:${stableKey}`).digest("hex").slice(0, 24);
  return `ledger-${digest}`;
}

async function appendCreditLedger(db, user, delta, type, meta = {}) {
  if (!db || !user) return null;
  const amount = Math.round(Number(delta || 0) * 10000) / 10000;
  if (!Number.isFinite(amount) || amount === 0) return null;
  db.creditLedger = Array.isArray(db.creditLedger) ? db.creditLedger : [];
  const normalizedMeta = attachAuthContextToMeta(meta);
  const record = {
    id: stableLedgerId(type, normalizedMeta),
    userId: user.id,
    username: user.username || "",
    delta: amount,
    balanceAfter: creditsAmount(user.credits),
    type,
    meta: normalizedMeta,
    createdAt: new Date().toISOString(),
  };
  if (dbEnabled()) {
    const refundLike = amount > 0 && /refund|reversal/i.test(String(type || ""));
    const applied = await applyCreditDeltaInDb({
      id: record.id,
      userId: user.id,
      delta: amount,
      type,
      meta: normalizedMeta,
      payload: record,
      requireTaskCharge: refundLike && Boolean(normalizedMeta?.taskId),
      refundTypes: refundLike ? [type] : [],
    });
    if (applied?.skipped) return null;
    if (applied?.user) {
      Object.assign(user, applied.user);
      record.balanceAfter = creditsAmount(applied.user.credits);
    }
    if (applied?.ledger) Object.assign(record, applied.ledger);
  }
  db.creditLedger.unshift(record);
  db.creditLedger = db.creditLedger.slice(0, 1000);
  return record;
}

async function maybeGrantReferralReward(db, referredUserId = "", order = {}) {
  const cleanReferredUserId = String(referredUserId || "").trim();
  if (!cleanReferredUserId) return null;
  const initialReferredUser = (db.users || []).find((entry) => entry.id === cleanReferredUserId);
  const referrerId = String(referralPayload(initialReferredUser).referredByUserId || "").trim();
  if (!initialReferredUser || !referrerId || referrerId === cleanReferredUserId) return null;
  if (!dbEnabled()) {
    return maybeGrantReferralRewardInMemory(db, initialReferredUser, referrerId, order);
  }
  /* The reward is ledger-idempotent, but its metadata is a user snapshot write.
     Hold the referrer lock around both the duplicate check and metadata patch. */
  return withUserMutationLockInDb(referrerId, async (referrer) => {
    if (!referrer) return { value: null };
    const referredUser = await getUserByIdInDb(cleanReferredUserId);
    if (!referredUser || referrerId === referredUser.id) return { value: null };
    if (await referralRewardAlreadyGranted(db, referrer.id, referredUser.id)) return { value: null };
    const now = new Date().toISOString();
    const rewardMeta = {
      referrerUserId: referrer.id,
      referredUserId: referredUser.id,
      referredUsername: referredUser.username || "",
      orderId: order.id || "",
      orderProvider: order.paymentProvider || "manual",
    };
    await changeUserCredits(db, referrer.id, REFERRAL_REWARD_CREDITS, "referral_reward", rewardMeta);
    const freshReferrer = await getUserByIdInDb(referrer.id) || referrer;
    const referredReferral = referralPayload(referredUser);
    freshReferrer.referral = {
      ...referralPayload(freshReferrer),
      invitedUserId: referredUser.id,
      invitedUsername: referredUser.username || "",
      rewardedAt: now,
      rewardOrderId: order.id || "",
      rewardCredits: REFERRAL_REWARD_CREDITS,
      rewardCount: Math.max(0, Number(referralPayload(freshReferrer).rewardCount || 0)) + 1,
    };
    const referredReferralPatch = {
      ...referredReferral,
      firstPaidAt: referredReferral.firstPaidAt || now,
      firstPaidOrderId: referredReferral.firstPaidOrderId || order.id || "",
      rewardGrantedAt: now,
    };
    await patchUserPayloadInDb(referredUser.id, {
      referral: referredReferralPatch,
      updatedAt: now,
    });
    const cachedReferredUser = (db.users || []).find((entry) => entry.id === referredUser.id);
    if (cachedReferredUser) cachedReferredUser.referral = referredReferralPatch;
    freshReferrer.updatedAt = now;
    return { user: freshReferrer, value: freshReferrer };
  });
}

function maybeGrantReferralRewardInMemory(db, referredUser, referrerId, order) {
  const referrer = (db.users || []).find((entry) => entry.id === referrerId);
  if (!referrer) return null;
  if ((db.creditLedger || []).some((entry) => (
    entry.type === "referral_reward"
    && String(entry.userId || entry.meta?.referrerUserId || "") === referrer.id
    && String(entry.meta?.referredUserId || "") === referredUser.id
  ))) return null;
  const now = new Date().toISOString();
  const rewardMeta = {
    referrerUserId: referrer.id,
    referredUserId: referredUser.id,
    referredUsername: referredUser.username || "",
    orderId: order.id || "",
    orderProvider: order.paymentProvider || "manual",
  };
  const ledger = {
    id: randomId("ledger"),
    userId: referrer.id,
    username: referrer.username || "",
    delta: REFERRAL_REWARD_CREDITS,
    balanceAfter: creditsAmount(Number(referrer.credits || 0) + REFERRAL_REWARD_CREDITS),
    type: "referral_reward",
    meta: rewardMeta,
    createdAt: now,
  };
  referrer.credits = creditsAmount(Number(referrer.credits || 0) + REFERRAL_REWARD_CREDITS);
  referrer.referral = {
    ...referralPayload(referrer),
    invitedUserId: referredUser.id,
    invitedUsername: referredUser.username || "",
    rewardedAt: now,
    rewardOrderId: order.id || "",
    rewardCredits: REFERRAL_REWARD_CREDITS,
    rewardCount: Math.max(0, Number(referralPayload(referrer).rewardCount || 0)) + 1,
  };
  referredUser.referral = {
    ...referralPayload(referredUser),
    firstPaidAt: referralPayload(referredUser).firstPaidAt || now,
    firstPaidOrderId: referralPayload(referredUser).firstPaidOrderId || order.id || "",
    rewardGrantedAt: now,
  };
  referrer.updatedAt = now;
  referredUser.updatedAt = now;
  db.creditLedger = Array.isArray(db.creditLedger) ? db.creditLedger : [];
  db.creditLedger.unshift(ledger);
  return referrer;
}

async function grantPendingReferralRewardsForMember(db = {}, referrer = {}) {
  if (!referrer?.id) return 0;
  const referredUsers = referredUsersForUser(db, referrer);
  let granted = 0;
  for (const referredUser of referredUsers) {
    if (await referralRewardAlreadyGranted(db, referrer.id, referredUser.id)) continue;
    const paidOrder = (db.walletOrders || []).find((order) => (
      order.userId === referredUser.id && String(order.status || "").toLowerCase() === "paid"
    ));
    if (!paidOrder) continue;
    const rewarded = await maybeGrantReferralReward(db, referredUser.id, paidOrder);
    if (rewarded) granted += 1;
  }
  return granted;
}

function currentAuthContext() {
  return requestContext.getStore()?.auth || null;
}

function tokenContextFromRecord(record = {}) {
  if (!record?.apiTokenId) return null;
  return {
    id: String(record.apiTokenId || ""),
    name: String(record.apiTokenName || ""),
    quotaType: String(record.apiTokenType || "") === "count" ? "count" : "amount",
    parentUserId: String(record.userId || ""),
  };
}

function attachAuthContextToMeta(meta = {}, auth = currentAuthContext()) {
  if (!auth?.tokenRecord?.id) return meta;
  return {
    ...meta,
    apiTokenId: auth.tokenRecord.id,
    apiTokenName: auth.tokenRecord.name || "",
    apiTokenType: auth.tokenRecord.quotaType || "",
    apiTokenSource: auth.tokenSource || "subtoken",
  };
}

function subtokenCostAmount(cost = 0) {
  return roundCredits(cost, 6);
}

function subtokenUsageEventKey(prefix = "spend", taskId = "", type = "") {
  const base = String(taskId || "").trim() || randomId("usage");
  return `${prefix}:${String(type || "credits").trim()}:${base}`;
}

function subtokenFailurePayload(cost = 0, remaining = 0, extra = {}) {
  return {
    ok: false,
    code: "SUBTOKEN_QUOTA_EXCEEDED",
    message: `Sub token quota is not enough. This request needs ${formatServerCredits(cost)}; remaining ${formatServerCredits(remaining)}.`,
    cost: roundCredits(cost, 6),
    remaining: roundCredits(remaining, 6),
    ...extra,
  };
}

function upstreamResourceMissing(error = {}) {
  return /resource .*not found|is not found|not found/i.test(String(error?.message || error || ""));
}

function formatServerCredits(value) {
  const next = roundCredits(value, 6);
  return Number.isInteger(next) ? String(next) : next.toFixed(6).replace(/0+$/, "").replace(/\.$/, "");
}

function assertSubtokenCanSpend(auth, cost = 0) {
  const amount = subtokenCostAmount(cost);
  if (!auth?.tokenRecord?.id || amount <= 0) return;
  const token = auth.tokenRecord;
  if (!token.active) {
    const error = new Error(token.status === "expired" ? "Sub token expired." : "Sub token revoked.");
    error.statusCode = 401;
    error.code = token.status === "expired" ? "SUBTOKEN_EXPIRED" : "SUBTOKEN_REVOKED";
    throw error;
  }
  if (token.quotaType === "amount" && amount - Number(token.remaining || 0) > 0.000001) {
    const error = new Error("Sub token quota is not enough.");
    error.statusCode = 402;
    error.code = "SUBTOKEN_QUOTA_EXCEEDED";
    error.payload = subtokenFailurePayload(amount, token.remaining, { quotaType: token.quotaType });
    throw error;
  }
  if (token.quotaType === "count" && Number(token.remaining || 0) < 1) {
    const error = new Error("Sub token count quota is not enough.");
    error.statusCode = 402;
    error.code = "SUBTOKEN_QUOTA_EXCEEDED";
    error.payload = subtokenFailurePayload(1, token.remaining, { quotaType: token.quotaType });
    throw error;
  }
}

