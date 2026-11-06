async function validateSeedanceImageAssetsForRequest(db, assets = []) {
  const list = assets.filter(Boolean);
  for (let index = 0; index < list.length; index += 1) {
    await validateSeedanceImageAssetForRequest(db, list[index], `Seedance image ${index + 1}`);
  }
}

function storedVideoDimensionsForAsset(asset = {}) {
  const width = Number(firstPresent(asset.videoWidth, asset.width, asset.meta?.videoWidth, asset.meta?.width));
  const height = Number(firstPresent(asset.videoHeight, asset.height, asset.meta?.videoHeight, asset.meta?.height));
  if (Number.isFinite(width) && width > 0 && Number.isFinite(height) && height > 0) {
    return {
      width,
      height,
      durationSeconds: durationSecondsFromValue(firstPresent(asset.durationSeconds, asset.meta?.durationSeconds)),
    };
  }
  return null;
}

async function validateSeedanceVideoAssetForRequest(db, asset = {}, label = "Seedance video") {
  if (!asset) return null;
  validateWan27MediaKind(asset, "video", label);
  let localPath = localPathForUserAsset(asset);
  const storedDimensions = storedVideoDimensionsForAsset(asset);
  if (storedDimensions) {
    try {
      return assertSeedanceVideoPixelCount(storedDimensions, label);
    } catch (error) {
      if (!localPath || error.code !== "SEEDANCE_VIDEO_PIXEL_COUNT_INVALID") throw error;
    }
  }

  localPath = await ensureLocalUserAssetFile(db, asset, { label, maxBytes: VIDEO_TOOL_SOURCE_UPLOAD_MAX_BYTES, requireFile: false });
  if (!localPath) {
    throw advancedValidationError("SEEDANCE_VIDEO_DIMENSIONS_UNREADABLE", `${label} dimensions could not be read. Re-upload the video before using it with Seedance.`, { assetId: asset.id || "" });
  }
  const dimensions = await normalizeSeedanceVideoFileForRequest(localPath, localPath, label);
  asset.videoWidth = dimensions.width;
  asset.videoHeight = dimensions.height;
  asset.durationSeconds = dimensions.durationSeconds || asset.durationSeconds || 0;
  asset.seedanceVideoAssetId = "";
  asset.seedanceVideoAssetUri = "";
  asset.updatedAt = new Date().toISOString();
  db.userAssets = (db.userAssets || []).map((entry) => (entry.id === asset.id ? asset : entry));
  if (dbEnabled()) await upsertUserAssetInDb(asset);
  else await writeDb(db);
  return dimensions;
}

async function validateSeedanceReferenceVideoDurationsForRequest({ assets = [], urls = [] } = {}) {
  const entries = [];
  const assetUrls = new Set();
  const uniqueAssets = [...new Map(assets.filter(Boolean).map((asset) => [asset.id || asset.localUrl || asset.publicUrl, asset])).values()];
  for (let index = 0; index < uniqueAssets.length; index += 1) {
    const asset = uniqueAssets[index];
    const localPath = localPathForUserAsset(asset);
    let durationSeconds = durationSecondsFromValue(firstPresent(asset.durationSeconds, asset.meta?.durationSeconds));
    if (!durationSeconds && localPath) durationSeconds = await probeLocalVideoDurationSeconds(localPath);
    if (!durationSeconds && isPublicHttpUrl(asset.publicUrl)) durationSeconds = await probeVideoDurationSeconds(asset.publicUrl);
    durationSeconds = durationSecondsFromValue(durationSeconds);
    entries.push({ label: `Seedance reference video ${index + 1}`, durationSeconds });
    [asset.localUrl, asset.publicUrl].map((value) => String(value || "").trim()).filter(Boolean).forEach((value) => assetUrls.add(value));
  }

  const uniqueItems = uniqueSeedanceReferenceVideoItems(arrayFromBody(urls));
  for (let index = 0; index < uniqueItems.length; index += 1) {
    const item = uniqueItems[index];
    let url = seedanceReferenceVideoUrlFromItem(item);
    if (!url || assetUrls.has(url) || isProviderAssetUri(url)) continue;
    if (url.startsWith("/")) url = publicUrlForAssetPath(url);
    const durationSeconds = seedanceVideoInputDurationFromItem(item)
      || (isPublicHttpUrl(url) ? await probeVideoDurationSeconds(url) : 0);
    entries.push({ label: `Seedance reference video ${entries.length + 1}`, durationSeconds });
  }

  const violation = referenceVideoDurationViolation(entries);
  if (violation) {
    throw advancedValidationError(
      "SEEDANCE_REFERENCE_VIDEO_DURATION_INVALID",
      `${violation.label} must be between ${SEEDANCE_REFERENCE_VIDEO_MIN_SECONDS}s and ${SEEDANCE_REFERENCE_VIDEO_MAX_SECONDS}s. Current duration is ${violation.durationSeconds}s.`,
      violation,
    );
  }
  return entries;
}

async function validateSeedanceRawImageUrlsForRequest(urls = []) {
  const uniqueUrls = [...new Set(urls.map((url) => String(url || "").trim()).filter(Boolean))];
  for (let index = 0; index < uniqueUrls.length; index += 1) {
    const url = uniqueUrls[index];
    if (isProviderAssetUri(url)) continue;
    if (isAllowedInlineMediaDataUrl(url, "image")) {
      const { bytes } = decodeWanMediaDataUrl(url);
      validateSeedanceImageBytes(bytes, `Seedance raw image ${index + 1}`);
      continue;
    }
    if (!isPublicHttpUrl(url)) {
      throw advancedValidationError("INVALID_IMAGE_URL", "Seedance image URL must be public http(s), asset://, or a supported image data URL.", { url });
    }
    const downloaded = await downloadRemoteFileToBuffer(url, {
      label: `Seedance raw image ${index + 1}`,
      maxBytes: IMAGE_UPLOAD_MAX_BYTES,
      timeoutMs: 120000,
    });
    const mime = String(downloaded.mime || imageMimeFromKnownPath(new URL(url).pathname) || "").replace("image/jpg", "image/jpeg");
    if (mime && !["image/jpeg", "image/png", "image/webp", "image/bmp"].includes(mime)) {
      throw advancedValidationError("INVALID_IMAGE_FORMAT", "Seedance image URL must point to a JPG, PNG, WebP, or BMP file.", { url, mime });
    }
    validateSeedanceImageBytes(downloaded.bytes, `Seedance raw image ${index + 1}`);
  }
}

function videoExtFromMime(mime = "", fallbackPath = "") {
  const cleanMime = String(mime || "").split(";")[0].trim().toLowerCase();
  if (cleanMime === "video/webm") return ".webm";
  if (cleanMime === "video/quicktime") return ".mov";
  if (cleanMime === "video/x-m4v") return ".m4v";
  const ext = path.extname(String(fallbackPath || "").split("?")[0]).toLowerCase();
  if ([".mp4", ".webm", ".mov", ".m4v"].includes(ext)) return ext;
  return ".mp4";
}

function videoMimeFromPath(filePath = "") {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".webm") return "video/webm";
  if (ext === ".mov") return "video/quicktime";
  if (ext === ".m4v") return "video/x-m4v";
  return "video/mp4";
}

function videoMimeFromKnownPath(filePath = "") {
  const ext = path.extname(String(filePath || "").split("?")[0]).toLowerCase();
  if (![".mp4", ".webm", ".mov", ".m4v"].includes(ext)) return "";
  return videoMimeFromPath(filePath);
}

function audioMimeFromPath(filePath = "") {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".wav") return "audio/wav";
  if (ext === ".m4a" || ext === ".mp4") return "audio/mp4";
  if (ext === ".aac") return "audio/aac";
  if (ext === ".ogg") return "audio/ogg";
  if (ext === ".webm") return "audio/webm";
  return "audio/mpeg";
}

function audioMimeFromKnownPath(filePath = "") {
  const ext = path.extname(String(filePath || "").split("?")[0]).toLowerCase();
  if (![".mp3", ".wav", ".m4a", ".aac", ".ogg", ".webm"].includes(ext)) return "";
  return audioMimeFromPath(filePath);
}

function audioExtFromMime(mime = "", fallbackPath = "") {
  const cleanMime = String(mime || "").split(";")[0].trim().toLowerCase();
  if (cleanMime === "audio/mpeg" || cleanMime === "audio/mp3") return ".mp3";
  if (cleanMime === "audio/wav" || cleanMime === "audio/x-wav") return ".wav";
  if (cleanMime === "audio/mp4" || cleanMime === "audio/aac") return ".m4a";
  if (cleanMime === "audio/webm") return ".webm";
  if (cleanMime === "audio/ogg") return ".ogg";
  const ext = path.extname(String(fallbackPath || "").split("?")[0]).toLowerCase();
  if ([".mp3", ".wav", ".m4a", ".aac", ".ogg", ".webm"].includes(ext)) return ext;
  return ".mp3";
}

function mediaExtFromMime(mime = "", fallbackPath = "") {
  const cleanMime = String(mime || "").split(";")[0].trim().toLowerCase();
  if (cleanMime.startsWith("image/")) return imageExtFromMime(cleanMime);
  if (cleanMime.startsWith("video/")) return videoExtFromMime(cleanMime, fallbackPath);
  if (cleanMime.startsWith("audio/")) return audioExtFromMime(cleanMime, fallbackPath);
  const fallbackExt = path.extname(String(fallbackPath || "").split("?")[0]).toLowerCase();
  if (fallbackExt) return fallbackExt;
  if (cleanMime === "application/octet-stream") return ".bin";
  return "";
}

function documentMimeFromKnownPath(filePath = "") {
  const ext = path.extname(String(filePath || "").split("?")[0]).toLowerCase();
  const map = {
    ".pdf": "application/pdf", ".txt": "text/plain", ".md": "text/markdown", ".doc": "application/msword",
    ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document", ".xls": "application/vnd.ms-excel",
    ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", ".ppt": "application/vnd.ms-powerpoint",
    ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  };
  return map[ext] || "";
}

function decodeWanMediaDataUrl(dataUrl = "") {
  const match = String(dataUrl || "").match(/^data:([^;,]+);base64,([a-z0-9+/=]+)$/i);
  if (!match) {
    const error = new Error("Only supported image, audio, video, or Wan 3.0 document data URLs are supported.");
    error.statusCode = 400;
    throw error;
  }
  const mime = match[1].toLowerCase().replace("image/jpg", "image/jpeg").replace("audio/mp3", "audio/mpeg");
  const supportedMediaMimes = new Set([
    "image/png", "image/jpeg", "image/webp", "image/bmp", "image/heic", "image/heif",
    "audio/mpeg", "audio/wav", "audio/x-wav", "audio/mp4", "audio/aac", "audio/ogg", "audio/webm",
    "video/mp4", "video/webm", "video/quicktime", "video/x-m4v",
  ]);
  if (!(supportedMediaMimes.has(mime) || WAN30_DOCUMENT_MIMES.has(mime))) {
    const error = new Error("Unsupported upload format.");
    error.statusCode = 400;
    throw error;
  }
  return {
    mime,
    bytes: Buffer.from(match[2], "base64"),
  };
}

async function createUserMediaAssetFromBytes(db, user, { bytes, mime, name = "Upload", fileName = "", maxBytes = 8 * 1024 * 1024, durationSeconds = 0 } = {}) {
  if (bytes.byteLength > maxBytes) {
    const label = mime.startsWith("image/") ? "Image" : mime.startsWith("audio/") ? "Audio" : "Media";
    const error = new Error(`${label} must be ${Math.round(maxBytes / 1024 / 1024)}MB or smaller.`);
    error.statusCode = 400;
    throw error;
  }

  const assetId = randomId("asset");
  const fallbackExt = mime.startsWith("image/") ? imageExtFromMime(mime) : documentMimeFromKnownPath(fileName) ? path.extname(fileName).toLowerCase() : ".bin";
  const storedFileName = `${assetId}${mediaExtFromMime(mime, fileName) || fallbackExt}`;
  const dir = path.join(USER_UPLOAD_DIR, user.id);
  const localPath = path.join(dir, storedFileName);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(localPath, bytes);

  const imageDimensions = mime.startsWith("image/") ? imageDimensionsFromBuffer(bytes) : null;
  const videoDimensions = mime.startsWith("video/") ? await probeLocalVideoDimensions(localPath) : null;
  const localUrl = `/assets/user-uploads/${user.id}/${storedFileName}`;
  let objectStorage;
  try {
    objectStorage = await uploadLocalAssetMirrorToObjectStorage({ localUrl, bytes, mime });
  } catch (error) {
    await fs.rm(localPath, { force: true }).catch(() => {});
    throw error;
  }
  const displayName = String(fileName || name || "Upload")
    .split(/[\\/]/)
    .pop()
    .slice(0, 60);
  const userAsset = {
    id: assetId,
    userId: user.id,
    name: displayName || "Upload",
    mime,
    localUrl,
    publicUrl: objectStorage.publicUrl || publicUrlForAssetPath(localUrl),
    cdnUrl: objectStorage.publicUrl || "",
    objectStorageKey: objectStorage.key || "",
    objectStorageError: objectStorage.error || "",
    assetUri: "",
    sizeBytes: bytes.byteLength,
    width: imageDimensions?.width || 0,
    height: imageDimensions?.height || 0,
    videoWidth: videoDimensions?.width || 0,
    videoHeight: videoDimensions?.height || 0,
    imageType: imageDimensions?.type || "",
    durationSeconds: mime.startsWith("video/") || mime.startsWith("audio/")
      ? durationSecondsFromValue(durationSeconds || videoDimensions?.durationSeconds)
      : 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    deletedAt: "",
  };
  db.userAssets.unshift(userAsset);
  if (dbEnabled()) await upsertUserAssetInDb(userAsset);
  else await writeDb(db);
  return userAsset;
}

async function createUserAssetFromDataUrl(db, user, { dataUrl, name = "Upload", fileName = "" } = {}) {
  const { mime, bytes } = decodeDataUrl(dataUrl);
  return createUserMediaAssetFromBytes(db, user, {
    bytes,
    mime,
    name,
    fileName,
    maxBytes: IMAGE_UPLOAD_MAX_BYTES,
  });
}

function normalizedAssetSourceUrl(value = "") {
  const text = String(value || "").trim();
  if (!text) return "";
  try {
    const url = new URL(text.startsWith("/") ? publicUrlForAssetPath(text) : text);
    url.hash = "";
    return url.toString();
  } catch {
    return text;
  }
}

function findUserAssetBySourceUrl(db, user, sourceUrl = "") {
  const normalized = normalizedAssetSourceUrl(sourceUrl);
  if (!normalized) return null;
  return (db.userAssets || []).find((asset) => {
    if (!asset || asset.userId !== user.id || isSoftDeleted(asset)) return false;
    return [asset.sourceUrl, asset.originalUrl, asset.publicUrl, asset.localUrl]
      .map(normalizedAssetSourceUrl)
      .some((candidate) => candidate && candidate === normalized);
  }) || null;
}

function isAutoPresetReferenceAsset(asset = {}) {
  if (asset.hidden || asset.meta?.fromPreset) return true;
  const name = String(asset.name || "").trim().toLowerCase();
  return /^(character|action|outfit|scene)-[a-z0-9_-]+\.(jpg|jpeg|png|webp)$/i.test(name);
}

function userMediaUploadLimits(provider = "") {
  const normalized = normalizeAdvancedProvider(provider);
  if (normalized === "wan30") {
    return {
      image: IMAGE_UPLOAD_MAX_BYTES,
      video: WAN30_VIDEO_UPLOAD_MAX_BYTES,
      audio: WAN30_AUDIO_UPLOAD_MAX_BYTES,
    };
  }
  if (normalized === "seedance25-vega") {
    return {
      image: VEGA_15_PRO_IMAGE_UPLOAD_MAX_BYTES,
      video: VEGA_15_PRO_VIDEO_UPLOAD_MAX_BYTES,
      audio: VEGA_15_PRO_AUDIO_UPLOAD_MAX_BYTES,
    };
  }
  if (normalized === "vega10-lite") {
    return {
      image: VEGA_10_LITE_IMAGE_UPLOAD_MAX_BYTES,
      video: VEGA_10_LITE_VIDEO_UPLOAD_MAX_BYTES,
      audio: VEGA_10_LITE_AUDIO_UPLOAD_MAX_BYTES,
    };
  }
  return { image: IMAGE_UPLOAD_MAX_BYTES, video: MEDIA_UPLOAD_MAX_BYTES, audio: MEDIA_UPLOAD_MAX_BYTES };
}

async function createUserWanMediaAssetFromDataUrl(db, user, { dataUrl, name = "Wan media", fileName = "", provider = "" } = {}) {
  let { mime, bytes } = decodeWanMediaDataUrl(dataUrl);
  if (mime === "application/octet-stream") {
    mime = documentMimeFromKnownPath(fileName);
    if (!mime) {
      const error = new Error("A document file extension is required.");
      error.statusCode = 400;
      throw error;
    }
  }
  const limits = userMediaUploadLimits(provider);
  const maxBytes = WAN30_DOCUMENT_MIMES.has(mime) && !mime.startsWith("image/") && !mime.startsWith("audio/") && !mime.startsWith("video/")
    ? WAN30_DOCUMENT_UPLOAD_MAX_BYTES
    : mime.startsWith("image/") ? limits.image : mime.startsWith("audio/") ? limits.audio : limits.video;
  return createUserMediaAssetFromBytes(db, user, {
    bytes,
    mime,
    name,
    fileName,
    maxBytes,
  });
}

async function createUserMediaAssetFromPublicUrl(db, user, { url, name = "Upload", fileName = "", durationSeconds = 0, sourceUrl = "", hidden = false, meta = {}, provider = "" } = {}) {
  const mediaUrl = String(url || "").trim();
  if (!isPublicHttpUrl(mediaUrl)) {
    const error = new Error("Asset URL must be a public http(s) URL.");
    error.statusCode = 400;
    throw error;
  }
  let existing = findUserAssetBySourceUrl(db, user, sourceUrl || mediaUrl);
  if (!existing && hidden) {
    const reusableName = String(fileName || path.basename(new URL(mediaUrl).pathname) || "").trim().toLowerCase();
    existing = (db.userAssets || []).find((asset) => (
      asset
      && asset.userId === user.id
      && !isSoftDeleted(asset)
      && isAutoPresetReferenceAsset(asset)
      && reusableName
      && String(asset.name || "").trim().toLowerCase() === reusableName
    )) || null;
  }
  if (existing) {
    existing = await refreshSeedancePresetVideoAssetFromSourceIfNeeded(db, existing, mediaUrl);
    if (!hidden && existing.hidden) {
      existing.hidden = false;
      existing.updatedAt = new Date().toISOString();
      db.userAssets = (db.userAssets || []).map((entry) => (entry.id === existing.id ? existing : entry));
      if (dbEnabled()) await upsertUserAssetInDb(existing);
      else await writeDb(db);
    }
    return existing;
  }
  const fallbackName = path.basename(new URL(mediaUrl).pathname) || "";
  const limits = userMediaUploadLimits(provider);
  const downloaded = await downloadRemoteFileToBuffer(mediaUrl, {
    label: "asset",
    maxBytes: Math.max(limits.image, limits.video, limits.audio),
    timeoutMs: 120000,
    retryCount: 2,
    retryDelayMs: 750,
  });
  const pathname = new URL(mediaUrl).pathname;
  const responseMime = String(downloaded.mime || "").replace("image/jpg", "image/jpeg");
  const mime = responseMime.startsWith("image/")
    ? responseMime
    : responseMime.startsWith("video/")
      ? responseMime
      : responseMime.startsWith("audio/")
        ? responseMime.replace("audio/mp3", "audio/mpeg")
        : imageMimeFromKnownPath(pathname) || videoMimeFromKnownPath(pathname) || audioMimeFromKnownPath(pathname);
  if (!mime || (!mime.startsWith("image/") && !mime.startsWith("video/") && !mime.startsWith("audio/"))) {
    const error = new Error("Asset URL must point to an image, video, or audio file.");
    error.statusCode = 400;
    throw error;
  }
  if (mime.startsWith("image/") && !["image/jpeg", "image/png", "image/webp", "image/bmp"].includes(mime)) {
    const error = new Error("Asset image URL must point to a JPG, PNG, WebP, or BMP file.");
    error.statusCode = 400;
    throw error;
  }
  if (mime.startsWith("video/") && !["video/mp4", "video/webm", "video/quicktime", "video/x-m4v"].includes(mime)) {
    const error = new Error("Asset video URL must point to an MP4, WebM, MOV, or M4V file.");
    error.statusCode = 400;
    throw error;
  }
  if (mime.startsWith("audio/") && !["audio/mpeg", "audio/wav", "audio/x-wav", "audio/mp4", "audio/aac", "audio/ogg", "audio/webm"].includes(mime)) {
    const error = new Error("Asset audio URL must point to an MP3, WAV, M4A, AAC, OGG, or WebM audio file.");
    error.statusCode = 400;
    throw error;
  }
  const maxBytes = mime.startsWith("image/") ? limits.image : mime.startsWith("audio/") ? limits.audio : limits.video;
  const asset = await createUserMediaAssetFromBytes(db, user, {
    bytes: downloaded.bytes,
    mime,
    name,
    fileName: fileName || fallbackName,
    maxBytes,
    durationSeconds,
  });
  asset.sourceUrl = normalizedAssetSourceUrl(sourceUrl || mediaUrl);
  asset.hidden = Boolean(hidden);
  const currentMeta = asset.meta && typeof asset.meta === "object" && !Array.isArray(asset.meta) ? asset.meta : {};
  asset.meta = { ...currentMeta, ...(meta || {}) };
  asset.updatedAt = new Date().toISOString();
  db.userAssets = (db.userAssets || []).map((entry) => (entry.id === asset.id ? asset : entry));
  if (dbEnabled()) await upsertUserAssetInDb(asset);
  else await writeDb(db);
  return asset;
}

async function refreshSeedancePresetVideoAssetFromSourceIfNeeded(db, asset = {}, sourceUrl = "") {
  if (!asset || !String(asset.mime || "").toLowerCase().startsWith("video/")) return asset;
  const meta = asset.meta && typeof asset.meta === "object" && !Array.isArray(asset.meta) ? asset.meta : {};
  const isSeedancePreset = asset.hidden && (meta.fromWorkflowPreset || meta.upstreamUse === "seedance_reference_video");
  if (!isSeedancePreset) return asset;
  try {
    await validateSeedanceVideoAssetForRequest(db, asset, "Seedance reference video");
    return asset;
  } catch (error) {
    if (!["SEEDANCE_VIDEO_PIXEL_COUNT_INVALID", "SEEDANCE_VIDEO_DIMENSIONS_UNREADABLE"].includes(error.code)) throw error;
  }

  const sourcePath = localAssetPathFromPublicValue(sourceUrl || asset.sourceUrl || asset.originalUrl || "");
  const targetPath = localPathForUserAsset(asset);
  if (!sourcePath || !targetPath) return asset;
  const sourceDimensions = await normalizeSeedanceVideoFileForRequest(sourcePath, targetPath, "Seedance reference video source");
  asset.videoWidth = sourceDimensions.width;
  asset.videoHeight = sourceDimensions.height;
  asset.durationSeconds = sourceDimensions.durationSeconds || asset.durationSeconds || 0;
  asset.seedanceVideoAssetId = "";
  asset.seedanceVideoAssetUri = "";
  const refreshedBytes = await fs.readFile(targetPath);
  const refreshedMime = asset.mime || videoMimeFromPath(targetPath) || "video/mp4";
  if (objectStorageEnabled()) {
    const uploaded = await uploadBufferToR2({
      userId: asset.userId,
      assetId: `${asset.id}-seedance-refresh`,
      bytes: refreshedBytes,
      mime: refreshedMime,
      extension: path.extname(targetPath),
    });
    asset.publicUrl = uploaded.publicUrl || "";
    asset.cdnUrl = uploaded.publicUrl || "";
    asset.objectStorageKey = uploaded.key || "";
    asset.objectStorageError = "";
    asset.publicUploadedAt = new Date().toISOString();
  } else {
    asset.publicUrl = publicUrlForAssetPath(asset.localUrl) || asset.publicUrl || "";
    asset.cdnUrl = asset.cdnUrl || "";
  }
  asset.updatedAt = new Date().toISOString();
  db.userAssets = (db.userAssets || []).map((entry) => (entry.id === asset.id ? asset : entry));
  if (dbEnabled()) await upsertUserAssetInDb(asset);
  else await writeDb(db);
  return asset;
}

function execFileJson(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    execFile(command, args, { timeout: 120000, windowsHide: true, ...options }, (error, stdout, stderr) => {
      if (error) {
        error.stdout = stdout;
        error.stderr = stderr;
        reject(error);
        return;
      }
      const text = String(stdout || "").trim();
      try {
        resolve(text ? JSON.parse(text) : {});
      } catch {
        resolve({ text, stderr: String(stderr || "") });
      }
    });
  });
}

function execFileQuiet(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    execFile(command, args, { timeout: 120000, windowsHide: true, ...options }, (error, stdout, stderr) => {
      if (error) {
        error.stdout = stdout;
        error.stderr = stderr;
        reject(error);
        return;
      }
      resolve({ stdout, stderr });
    });
  });
}

async function probeVideoDurationSeconds(videoUrl = "") {
  const url = String(videoUrl || "").trim();
  if (!url || !isPublicHttpUrl(url)) return 0;
  try {
    const result = await execFileJson("ffprobe", [
      "-v",
      "error",
      "-show_entries",
      "format=duration",
      "-of",
      "json",
      url,
    ], { timeout: VIDEO_DURATION_PROBE_TIMEOUT_MS });
    return durationSecondsFromValue(result?.format?.duration);
  } catch (error) {
    console.warn("[video-duration-probe-failed]", url, error.message || error);
    return 0;
  }
}

function findSceneConfig(config, sceneId) {
  return config.scenes.find((scene) => scene.id === sceneId) || config.scenes[0] || DEFAULT_CONFIG.scenes[0];
}

function publicSceneVideo(entry = {}) {
  if (!entry || typeof entry !== "object") return null;
  const videoUrl = DISABLE_GENERATED_R2_STORAGE
    ? (entry.remoteVideoUrl || entry.videoUrl || entry.cdnVideoUrl || entry.localVideoUrl || "")
    : (entry.cdnVideoUrl || entry.videoUrl || entry.localVideoUrl || entry.remoteVideoUrl || "");
  const savedPrompt = String(entry.userPrompt || "").trim();
  if (!videoUrl && !entry.taskId && !savedPrompt) return null;
  const posterUrl = String(DISABLE_GENERATED_R2_STORAGE
    ? (entry.remotePosterUrl || entry.posterUrl || entry.cdnPosterUrl || entry.localPosterUrl || entry.coverUrl || entry.thumbnailUrl || "")
    : (entry.cdnPosterUrl || entry.posterUrl || entry.localPosterUrl || entry.coverUrl || entry.thumbnailUrl || "")).trim();
  const signedVideoUrl = signedOssCdnUrlForDelivery(videoUrl, {
    key: entry.storageKey || entry.objectStorageKey || entry.r2Key || "",
  }) || videoUrl;
  const signedPosterUrl = signedOssCdnUrlForDelivery(posterUrl, {
    key: entry.posterStorageKey || entry.posterObjectStorageKey || entry.posterR2Key || "",
  }) || posterUrl;
  return {
    sceneId: entry.sceneId || "",
    sceneName: entry.sceneName || "",
    videoUrl: signedVideoUrl,
    posterUrl: signedPosterUrl,
    cdnVideoUrl: signedOssCdnUrlForDelivery(entry.cdnVideoUrl, {
      key: entry.storageKey || entry.objectStorageKey || entry.r2Key || "",
    }) || entry.cdnVideoUrl || "",
    cdnPosterUrl: signedOssCdnUrlForDelivery(entry.cdnPosterUrl, {
      key: entry.posterStorageKey || entry.posterObjectStorageKey || entry.posterR2Key || "",
    }) || entry.cdnPosterUrl || "",
    localPosterUrl: entry.localPosterUrl || signedPosterUrl || "",
    coverUrl: signedOssCdnUrlForDelivery(entry.coverUrl, {
      key: entry.posterStorageKey || entry.posterObjectStorageKey || entry.posterR2Key || "",
    }) || entry.coverUrl || signedPosterUrl || "",
    thumbnailUrl: signedOssCdnUrlForDelivery(entry.thumbnailUrl, {
      key: entry.posterStorageKey || entry.posterObjectStorageKey || entry.posterR2Key || "",
    }) || entry.thumbnailUrl || signedPosterUrl || "",
    taskId: entry.taskId || "",
    status: entry.status || "",
    sceneEntryId: entry.sceneEntryId || "default",
    sceneEntryName: entry.sceneEntryName || "",
    referenceAssetUri: entry.referenceAssetUri || "",
    partnerCharacterId: entry.partnerCharacterId || "",
    partnerCharacterName: entry.partnerCharacterName || "",
    partnerReferenceAssetUri: entry.partnerReferenceAssetUri || "",
    savedPrompt,
    userPrompt: savedPrompt,
    model: entry.model || "",
    ratio: entry.ratio || "",
    resolution: entry.resolution || "",
    duration: entry.duration || 0,
    likes: Number(entry.likes || entry.thumbsUpCount || 0),
    shouldBlur: entry.shouldBlur === true,
    source: entry.source || "",
    provider: entry.provider || "seedance",
    updatedAt: entry.updatedAt || "",
    createdAt: entry.createdAt || "",
    error: entry.error || "",
  };
}

function publicSceneVideoMap(sceneVideos = {}) {
  if (!sceneVideos || typeof sceneVideos !== "object") return {};
  const out = {};
  Object.keys(sceneVideos).forEach((videoKey) => {
    const rawEntry = sceneVideos[videoKey] || {};
    const sceneId = rawEntry.sceneId || sceneIdFromVideoKey(videoKey);
    const entry = publicSceneVideo({ ...rawEntry, sceneId });
    if (entry) out[videoKey] = entry;
  });
  Object.keys(out).forEach((videoKey) => {
    const entry = out[videoKey];
    if (entry.sceneEntryId === "default" && entry.sceneId && !out[entry.sceneId]) {
      out[entry.sceneId] = entry;
    }
  });
  return out;
}

function requireValue(label, value) {
  if (!value) {
    const error = new Error(`Missing ${label}`);
    error.statusCode = 503;
    throw error;
  }
}

function sha256Hex(data) {
  return crypto.createHash("sha256").update(data).digest("hex");
}

function hmac(key, data, encoding) {
  return crypto.createHmac("sha256", key).update(data).digest(encoding);
}

function signKey(secret, date, region, service) {
  return hmac(hmac(hmac(hmac(secret, date), region), service), "request");
}

function signAwsKey(secret, date, region, service) {
  return hmac(hmac(hmac(hmac(`AWS4${secret}`, date), region), service), "aws4_request");
}

function amzDate() {
  const value = new Date().toISOString().replace(/[:-]|\.\d{3}/g, "");
  return { xDate: value, date: value.slice(0, 8) };
}

function encodePathname(input) {
  return input
    .split("/")
    .map((part) => encodeURIComponent(part))
    .join("/");
}

function r2EndpointUrl() {
  const endpoint = String(R2.endpoint || "").trim().replace(/\/+$/, "");
  if (!endpoint) return null;
  return new URL(/^https?:\/\//i.test(endpoint) ? endpoint : `https://${endpoint}`);
}

function canonicalR2Query(query = {}) {
  return Object.entries(query)
    .flatMap(([key, value]) => (Array.isArray(value) ? value.map((item) => [key, item]) : [[key, value]]))
    .filter(([, value]) => value !== undefined && value !== null)
    .map(([key, value]) => [String(key), String(value)])
    .sort(([leftKey, leftValue], [rightKey, rightValue]) => leftKey.localeCompare(rightKey) || leftValue.localeCompare(rightValue))
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
    .join("&");
}

function makeR2Auth({ method, key, body, contentType, query = {} }) {
  const endpoint = r2EndpointUrl();
  if (!endpoint) {
    const error = new Error("Missing R2_ENDPOINT");
    error.statusCode = 503;
    throw error;
  }
  const { xDate, date } = amzDate();
  const payloadHash = sha256Hex(body);
  const canonicalUri = `/${encodeURIComponent(R2.bucket)}/${encodePathname(key)}`;
  const canonicalQuery = canonicalR2Query(query);
  const headers = {
    "content-type": contentType,
    host: endpoint.host,
    "x-amz-content-sha256": payloadHash,
    "x-amz-date": xDate,
  };
  const sortedKeys = Object.keys(headers).sort();
  const signedHeaders = sortedKeys.join(";");
  const canonicalHeaders = sortedKeys.map((header) => `${header}:${headers[header]}\n`).join("");
  const canonicalRequest = [method, canonicalUri, canonicalQuery, canonicalHeaders, signedHeaders, payloadHash].join("\n");
  const scope = `${date}/${R2.region || "auto"}/s3/aws4_request`;
  const stringToSign = ["AWS4-HMAC-SHA256", xDate, scope, sha256Hex(canonicalRequest)].join("\n");
  const signature = hmac(signAwsKey(R2.secretKey, date, R2.region || "auto", "s3"), stringToSign, "hex");

  return {
    url: `${endpoint.protocol}//${endpoint.host}${canonicalUri}${canonicalQuery ? `?${canonicalQuery}` : ""}`,
    headers: {
      ...headers,
      authorization: `AWS4-HMAC-SHA256 Credential=${R2.accessKey}/${scope},SignedHeaders=${signedHeaders},Signature=${signature}`,
    },
  };
}

function makeArkOpenApiAuth({ action, body }) {
  const { xDate, date } = amzDate();
  const query = new URLSearchParams({ Action: action, Version: ARK_OPENAPI.version }).toString();
  const payloadHash = sha256Hex(body);
  const headers = {
    "content-type": "application/json",
    host: ARK_OPENAPI.host,
    "x-content-sha256": payloadHash,
    "x-date": xDate,
  };
  const sortedKeys = Object.keys(headers).sort();
  const signedHeaders = sortedKeys.join(";");
  const canonicalHeaders = sortedKeys.map((header) => `${header}:${headers[header]}\n`).join("");
  const canonicalRequest = ["POST", "/", query, canonicalHeaders, signedHeaders, payloadHash].join("\n");
  const scope = `${date}/${ARK_OPENAPI.region}/${ARK_OPENAPI.service}/request`;
  const stringToSign = ["HMAC-SHA256", xDate, scope, sha256Hex(canonicalRequest)].join("\n");
  const signature = hmac(signKey(ARK_OPENAPI.secretKey, date, ARK_OPENAPI.region, ARK_OPENAPI.service), stringToSign, "hex");

  return {
    url: `https://${ARK_OPENAPI.host}/?${query}`,
    headers: {
      ...headers,
      authorization: `HMAC-SHA256 Credential=${ARK_OPENAPI.accessKey}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
    },
  };
}

async function uploadBufferToR2({ userId, assetId, bytes, mime, extension = "" }) {
  const fileName = `${storagePathSegment(assetId, "asset")}-${Date.now()}${extension || mediaExtFromMime(mime) || imageExtFromMime(mime)}`;
  return uploadStaticAssetToObjectStorage({
    key: objectStoragePath("users", userId, fileName),
    bytes,
    mime,
  });
}

function r2Enabled() {
  if (DISABLE_R2_STORAGE) return false;
  return Boolean(R2.accessKey && R2.secretKey && R2.endpoint && R2.bucket && R2.publicDomain);
}

function objectStorageEnabled() {
  return Boolean(OBJECT_STORAGE_PROVIDER) || r2Enabled();
}

function objectStorageProvider() {
  return OBJECT_STORAGE_PROVIDER || (r2Enabled() ? "r2" : "");
}

function objectStoragePublicDomain() {
  return objectStorageProvider() === "oss" ? String(OSS.cdnBaseUrl || "") : String(R2.publicDomain || "");
}

function generatedOutputStorageEnabled() {
  return objectStorageEnabled() && !DISABLE_GENERATED_R2_STORAGE;
}

function localPublicAssetStorageEnabled() {
  return !objectStorageEnabled();
}

function r2UploadTimeoutMs(byteLength = 0) {
  const bytes = Math.max(0, Number(byteLength) || 0);
  const transferBudgetMs = Math.ceil((bytes / R2_UPLOAD_MIN_BYTES_PER_SECOND) * 1000) + 15000;
  return Math.min(R2_UPLOAD_MAX_TIMEOUT_MS, Math.max(R2_UPLOAD_TIMEOUT_MS, transferBudgetMs));
}

function r2PublicUrlForKey(key = "") {
  const value = String(key || "").replace(/^\/+/, "");
  return value ? `${R2.publicDomain.replace(/\/$/, "")}/${value}` : "";
}

let r2UploadQueueActive = 0;
const r2UploadQueue = [];

function scheduleR2UploadQueueDrain() {
  while (r2UploadQueueActive < R2_UPLOAD_CONCURRENCY && r2UploadQueue.length) {
    const item = r2UploadQueue.shift();
    r2UploadQueueActive += 1;
    Promise.resolve()
      .then(item.run)
      .then(item.resolve, item.reject)
      .finally(() => {
        r2UploadQueueActive -= 1;
        scheduleR2UploadQueueDrain();
      });
  }
}

function withR2UploadSlot(run) {
  return new Promise((resolve, reject) => {
    r2UploadQueue.push({ run, resolve, reject });
    scheduleR2UploadQueueDrain();
  });
}

async function findUploadedR2Object(key = "") {
  const publicUrl = r2PublicUrlForKey(key);
  if (!publicUrl) return null;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const auth = makeR2Auth({
        method: "HEAD",
        key,
        body: Buffer.alloc(0),
        contentType: "application/octet-stream",
      });
      const response = await fetch(auth.url, {
        method: "HEAD",
        headers: auth.headers,
        signal: AbortSignal.timeout(10000),
      });
      if (response.ok) {
        return { key, r2Url: auth.url, publicUrl };
      }
      if (response.status === 404) return null;
    } catch {
      // The upload may still be settling after the client-side timeout.
    }
    if (attempt < 3) await delay(1000 * attempt);
  }
  return null;
}

async function waitForR2PublicObject(publicUrl = "") {
  if (!publicUrl) return false;
  for (let attempt = 1; attempt <= R2_PUBLIC_READY_RETRY_COUNT; attempt += 1) {
    try {
      const response = await fetch(publicUrl, {
        method: "HEAD",
        redirect: "follow",
        headers: { "cache-control": "no-cache" },
        signal: AbortSignal.timeout(10000),
      });
      if (response.ok) return true;
      if (![404, 408, 425, 429].includes(response.status) && response.status < 500) return false;
    } catch {
      // The custom domain can briefly lag behind the R2 PUT response.
    }
    if (attempt < R2_PUBLIC_READY_RETRY_COUNT) {
      await delay(Math.min(8000, R2_UPLOAD_RETRY_BASE_DELAY_MS * 2 ** (attempt - 1)));
    }
  }
  return false;
}

function r2ResponseError(label, response, text = "") {
  const error = new Error(`${label}: ${response.status} ${text}`.trim());
  error.statusCode = 502;
  error.retryable = response.status === 429 || response.status >= 500;
  return error;
}

async function r2SignedRequest({ method, key, body = Buffer.alloc(0), contentType = "application/octet-stream", query = {}, timeoutMs = R2_UPLOAD_TIMEOUT_MS }) {
  const auth = makeR2Auth({ method, key, body, contentType, query });
  const response = await fetch(auth.url, {
    method,
    headers: auth.headers,
    body: method === "GET" || method === "HEAD" ? undefined : body,
    signal: AbortSignal.timeout(timeoutMs),
  });
  const text = await response.text();
  if (!response.ok) throw r2ResponseError(`R2 ${method} failed`, response, text);
  return { response, text, auth };
}

async function r2RequestWithRetries(requestFactory, label = "R2 request") {
  let lastError = null;
  for (let attempt = 1; attempt <= R2_UPLOAD_RETRY_COUNT; attempt += 1) {
    try {
      return await requestFactory(attempt);
    } catch (error) {
      lastError = error;
      const retryable = error?.retryable !== false && (error?.name === "TimeoutError" || error?.name === "AbortError" || !error?.statusCode || error.statusCode === 502);
      if (!retryable || attempt >= R2_UPLOAD_RETRY_COUNT) throw error;
      console.warn("[r2-upload-retry]", label, `attempt=${attempt}`, error.message || error);
      await delay(Math.min(10000, R2_UPLOAD_RETRY_BASE_DELAY_MS * 2 ** (attempt - 1)));
    }
  }
  throw lastError || new Error(`${label} failed.`);
}

function xmlText(value = "") {
  return String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

async function uploadR2Multipart({ key, bytes, mime }) {
  const partSize = Math.max(5 * 1024 * 1024, R2_MULTIPART_PART_SIZE_BYTES);
  const partCount = Math.ceil(bytes.length / partSize);
  const started = Date.now();
  console.log("[r2-multipart-start]", key, { bytes: bytes.length, partSize, partCount });

  const created = await r2RequestWithRetries(
    () => r2SignedRequest({
      method: "POST",
      key,
      contentType: mime || "application/octet-stream",
      query: { uploads: "" },
    }),
    `multipart-start ${key}`,
  );
  const uploadId = String(created.text.match(/<UploadId>([^<]+)<\/UploadId>/i)?.[1] || "").trim();
  if (!uploadId) throw new Error("R2 multipart upload did not return an upload id.");

  const parts = new Array(partCount);
  try {
    let nextPart = 0;
    const concurrency = Math.max(1, Math.min(4, Number(process.env.R2_MULTIPART_CONCURRENCY || 2) || 2));
    const worker = async () => {
      while (true) {
        const index = nextPart;
        nextPart += 1;
        if (index >= partCount) return;
        const partNumber = index + 1;
        const body = bytes.subarray(index * partSize, Math.min(bytes.length, (index + 1) * partSize));
        const result = await r2RequestWithRetries(
          () => r2SignedRequest({
            method: "PUT",
            key,
            body,
            contentType: mime || "application/octet-stream",
            query: { partNumber, uploadId },
            timeoutMs: r2UploadTimeoutMs(body.length),
          }),
          `multipart-part ${key} ${partNumber}/${partCount}`,
        );
        const etag = String(result.response.headers.get("etag") || "").trim();
        if (!etag) throw new Error(`R2 multipart part ${partNumber} returned no ETag.`);
        parts[index] = { partNumber, etag };
        console.log("[r2-multipart-part]", key, `${partNumber}/${partCount}`, `${Math.round(body.length / 1024)}KB`);
      }
    };
    await Promise.all(Array.from({ length: Math.min(concurrency, partCount) }, () => worker()));

    const completeXml = Buffer.from(
      `<CompleteMultipartUpload>${parts.map((part) => `<Part><PartNumber>${part.partNumber}</PartNumber><ETag>${xmlText(part.etag)}</ETag></Part>`).join("")}</CompleteMultipartUpload>`,
      "utf8",
    );
    try {
      await r2RequestWithRetries(
        () => r2SignedRequest({
          method: "POST",
          key,
          body: completeXml,
          contentType: "application/xml",
          query: { uploadId },
          timeoutMs: Math.max(R2_UPLOAD_TIMEOUT_MS, 60000),
        }),
        `multipart-complete ${key}`,
      );
    } catch (error) {
      const found = await findUploadedR2Object(key);
      if (!found) throw error;
    }

    const publicUrl = r2PublicUrlForKey(key);
    if (!(await waitForR2PublicObject(publicUrl))) throw new Error(`R2 multipart upload completed but public URL is not ready: ${publicUrl}`);
    console.log("[r2-multipart-complete]", key, { bytes: bytes.length, seconds: Math.round((Date.now() - started) / 100) / 10 });
    return { key, publicUrl };
  } catch (error) {
    await r2SignedRequest({ method: "DELETE", key, query: { uploadId } }).catch(() => {});
    throw error;
  }
}

async function uploadStaticAssetToR2({ key, bytes, mime }) {
  requireValue("R2_ACCESS_KEY_ID", R2.accessKey);
  requireValue("R2_SECRET_ACCESS_KEY", R2.secretKey);
  requireValue("R2_ENDPOINT", R2.endpoint);
  requireValue("R2_BUCKET", R2.bucket);
  requireValue("R2_PUBLIC_BASE_URL", R2.publicDomain);

  return withR2UploadSlot(async () => {
    if ((bytes?.byteLength ?? bytes?.length ?? 0) >= R2_MULTIPART_THRESHOLD_BYTES) {
      return uploadR2Multipart({ key, bytes, mime });
    }

    const uploadTimeoutMs = r2UploadTimeoutMs(bytes?.byteLength ?? bytes?.length ?? 0);
    let lastError = null;
    for (let attempt = 1; attempt <= R2_UPLOAD_RETRY_COUNT; attempt += 1) {
      try {
        const auth = makeR2Auth({ method: "PUT", key, body: bytes, contentType: mime || "application/octet-stream" });
        const response = await fetch(auth.url, {
          method: "PUT",
          headers: auth.headers,
          body: bytes,
          signal: AbortSignal.timeout(uploadTimeoutMs),
        });
        const text = await response.text();
        if (response.ok) {
          const result = {
            key,
            r2Url: auth.url,
            publicUrl: `${R2.publicDomain.replace(/\/$/, "")}/${key}`,
          };
          if (await waitForR2PublicObject(result.publicUrl)) return result;
          const error = new Error(`R2 object uploaded but public URL is not ready: ${result.publicUrl}`);
          error.statusCode = 502;
          error.retryable = true;
          lastError = error;
        }
        else {
          const error = new Error(`R2 upload failed: ${response.status} ${text}`);
          error.statusCode = 502;
          error.retryable = response.status === 429 || response.status >= 500;
          lastError = error;
          if (error.retryable) {
            const published = await findUploadedR2Object(key);
            if (published && await waitForR2PublicObject(published.publicUrl)) return published;
          }
          if (attempt >= R2_UPLOAD_RETRY_COUNT || !error.retryable) throw error;
        }
      } catch (error) {
        const timeout = error?.name === "TimeoutError" || error?.name === "AbortError";
        if (timeout) {
          const published = await findUploadedR2Object(key);
          if (published) return published;
        }
        const uploadError = timeout ? new Error(`R2 upload timed out after ${Math.ceil(uploadTimeoutMs / 1000)} seconds.`) : error;
        if (timeout) {
          uploadError.code = "R2_UPLOAD_TIMEOUT";
          uploadError.retryable = false;
        }
        if (!uploadError.statusCode) uploadError.statusCode = 502;
        lastError = uploadError;
        if (attempt >= R2_UPLOAD_RETRY_COUNT || uploadError.retryable === false || uploadError.statusCode !== 502) throw uploadError;
      }
      await delay(Math.min(10000, R2_UPLOAD_RETRY_BASE_DELAY_MS * 2 ** (attempt - 1)));
    }
    throw lastError || new Error("R2 upload failed.");
  });
}
async function uploadStaticAssetToObjectStorage({ key, bytes, mime }) {
  if (objectStorageProvider() === "oss") {
    const uploaded = await uploadOssObject({ key, bytes, mime, config: OSS });
    return { ...uploaded, provider: "oss", publicUrl: uploaded.publicUrl || uploaded.url || "" };
  }
  return uploadStaticAssetToR2({ key, bytes, mime });
}

function localAssetMirrorKey(localUrl = "") {
  const value = String(localUrl || "").trim().split("?")[0];
  if (!value.startsWith("/assets/")) return "";
  return value.replace(/^\/+/, "").split("/").map((part) => storagePathSegment(decodeURIComponent(part), "asset")).join("/");
}

async function uploadLocalAssetMirrorToObjectStorage({ localUrl = "", bytes, mime = "application/octet-stream" } = {}) {
  if (!objectStorageEnabled()) return { publicUrl: "", key: "", error: "" };
  const key = localAssetMirrorKey(localUrl);
  if (!key) return { publicUrl: "", key: "", error: "" };
  const upload = await uploadStaticAssetToObjectStorage({ key, bytes, mime });
  if (!upload.publicUrl) {
    const error = new Error("R2 upload completed without a public URL.");
    error.statusCode = 502;
    error.code = "R2_PUBLIC_URL_MISSING";
    throw error;
  }
  return { publicUrl: upload.publicUrl, key: upload.key || key, error: "" };
}

async function publishLocalAssetUrlToObjectStorage(localUrl = "") {
  const value = String(localUrl || "").trim();
  if (!value.startsWith("/assets/")) {
    const error = new Error("Only local asset URLs can be published to R2.");
    error.statusCode = 400;
    throw error;
  }
  const localPath = path.resolve(ROOT, value.replace(/^\/+/, ""));
  const relative = path.relative(path.resolve(ROOT), localPath);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    const error = new Error("Asset path is invalid.");
    error.statusCode = 400;
    throw error;
  }
  const restoredPath = await ensureLocalAssetUrlFile(value, { label: "Local asset", maxBytes: VIDEO_TOOL_SOURCE_UPLOAD_MAX_BYTES });
  let bytes = null;
  try {
    bytes = await fs.readFile(restoredPath || localPath);
  } catch (error) {
    if (error?.code === "ENOENT" && value.startsWith("/assets/user-uploads/")) {
      throw missingUserAssetFileError({}, "Local asset");
    }
    throw error;
  }
  const mime = imageMimeFromKnownPath(localPath)
    || videoMimeFromKnownPath(localPath)
    || audioMimeFromKnownPath(localPath)
    || "application/octet-stream";
  const mirror = await uploadLocalAssetMirrorToObjectStorage({ localUrl: value, bytes, mime });
  if (objectStorageEnabled() && !mirror.publicUrl) {
    const error = new Error("Asset could not be published to R2.");
    error.statusCode = 502;
    throw error;
  }
  return mirror.publicUrl || publicUrlForAssetPath(value);
}

function makeHomeSyntheticReferencePrompt(item = {}) {
  const extra = String(item.referencePrompt || "").trim();
  return [
    "Use Figure 1 as the strict visual reference for a synthetic original adult female character.",
    "Keep the same face impression, adult age impression, hairstyle, body proportions, outfit silhouette, fabric colors, fabric textures, shoes, and visible accessories from the uploaded image.",
    "Generate one premium photorealistic FULL-BODY portrait, head-to-shoes fully visible inside the frame, front-facing, vertical 9:16 portrait composition, centered with generous margin, clean soft studio background, natural skin texture, no anime, no CGI, no plastic doll look.",
    "Composition must show her entire body from the top of her head down to her shoes; her long elegant legs must be clearly visible in the lower half of the image. Outfit should highlight her legs in a tasteful editorial way (short fitted dress, mini skirt, high-slit long dress, or fitted leggings) while remaining fully clothed.",
    "The character should feel like the same uploaded character rebuilt as a fictional digital model, not a different woman.",
    "Tasteful alluring confidence, mature adult fashion look, non-nude, non-explicit, no transparent clothing.",
    "No text, no logo, no watermark, no extra people, no cropped feet, no headshot, no upper-body-only crop, no distorted hands.",
    extra ? `Extra direction: ${extra}` : "",
  ].filter(Boolean).join(" ");
}

function makeSeedancePreprocessedReferencePrompt(item = {}) {
  const extra = String(item.referencePrompt || "").trim();
  return [
    "Recreate Figure 1 as a faithful synthetic reference image while preserving its original meaning and visual identity.",
    "Preserve the exact number of people and each person's perceived gender presentation, age group, face identity, hairstyle, body proportions, clothing, pose, and position.",
    "A male person must remain male, a female person must remain female, and a scene with no people must remain a scene with no people. Never swap gender, add a person, remove a person, or replace one person with another.",
    "Preserve the original environment, objects, composition, camera angle, lighting, aspect ratio, and any multi-view sheet or collage layout. Do not turn a scene, object image, or multi-view sheet into a single-person studio portrait.",
    "Keep the result photorealistic and visually close to Figure 1. Only normalize explicit or disallowed details into a fully clothed, non-explicit equivalent when necessary; otherwise do not redesign the source.",
    "No added text, logo, watermark, unrelated objects, or unrelated people.",
    extra ? `Extra direction: ${extra}` : "",
  ].filter(Boolean).join(" ");
}

const HOME_SCENE_DIRECTIONS = {
  room: {
    label: "Suite Night",
    scene: "luxury private suite at night, rain on tall windows, warm lamp light, mirrored wall, rose-gold highlights",
    action:
      "0-4s she slowly opens the suite curtains and turns back toward camera; 4-9s she walks diagonally across the room in full-body view with relaxed hip sway and steady eye contact; 9-15s she leans against the mirrored wall, one leg forward, giving a soft teasing smile while speaking a short intimate line.",
  },
  cafe: {
    label: "Wine Lounge",
    scene: "upscale wine lounge with jazz lighting, glossy bar reflections, red wine glass, low amber and crimson light",
    action:
      "0-4s she glides past the bar with a wine glass in hand; 4-9s she pauses beside a lounge table, crosses one leg and gently lifts the glass toward camera; 9-15s she steps closer, places the glass down, and whispers a playful invitation with direct eye contact.",
  },
  park: {
    label: "Neon Rooftop",
    scene: "neon rooftop at night with city skyline, light breeze, wet floor reflections, cinematic teal and warm red highlights",
    action:
      "0-4s she walks along the rooftop edge with wind moving her hair and outfit; 4-9s she spins once under the neon sign, full silhouette visible from head to heels; 9-15s she rests both hands on the railing, looks over her shoulder, then turns back with a confident teasing line.",
  },
  cinema: {
    label: "Private Cinema",
    scene: "private cinema with velvet seats, projector beam, dim aisle lights, soft dust in the light shaft",
    action:
      "0-4s she walks down the cinema aisle between velvet seats; 4-9s she stops in the projector beam and slowly turns, letting the light trace her silhouette; 9-15s she sits on the armrest, leans toward camera, and murmurs a flirtatious non-explicit line.",
  },
};

function getHomeSceneDirection(scene = {}) {
  const id = String(scene?.id || "").trim();
  const fallback = {
    label: scene?.name || scene?.shortName || "Main Scene",
    scene: String(scene?.prompt || "").trim() || "premium intimate mobile romance drama setting",
    action:
      "0-4s she enters the scene in full-body view; 4-9s she performs a distinct slow movement suited to the setting; 9-15s she settles into an elegant flirtatious pose and speaks a short non-explicit teasing line.",
  };
  return { ...fallback, ...(HOME_SCENE_DIRECTIONS[id] || {}) };
}

function makeHomeVideoPrompt(item = {}, overridePrompt = "", { decorate = false, scene = null } = {}) {
  const rawPrompt = overridePrompt !== undefined && overridePrompt !== null ? String(overridePrompt) : String(item.prompt || "");
  if (rawPrompt.trim()) return rawPrompt;
  const sceneDirection = scene ? getHomeSceneDirection(scene) : null;
  const core = [
    "Create a 15-second vertical cinematic image-to-video FULL-BODY short drama shot featuring the same original adult woman from the reference image.",
    "Identity lock: preserve her face impression, adult age impression, hairstyle, outfit colors, outfit silhouette, body proportions, shoes, and visible accessories from the reference image.",
    "Mood: seductive, elegant, intimate, confident, premium mobile romance drama, strictly non-explicit.",
    "Audio: include soft sensual female voiceover and breathy teasing spoken lines, flirtatious and alluring, short intimate phrases, low-volume cinematic mix, no explicit sexual language.",
    sceneDirection
      ? `Scene: ${sceneDirection.scene}.`
      : "Scene: luxury private suite lounge with warm lamp light, mirrored wall, rain on tall windows, rose-gold highlights, polished high-end atmosphere.",
    sceneDirection
      ? `Action timeline: ${sceneDirection.action}`
      : "Action timeline: 0-4s she walks toward camera in full-body view, legs crossing naturally in stride, direct confident eye contact; 4-9s she stops, slowly turns 360 to show her full silhouette, hands resting at her hips, long legs clearly visible; 9-15s she leans against the mirrored wall, one leg slightly forward in a fashion editorial pose, slow low-angle camera tilt highlights her long legs while she gives a restrained flirtatious smile.",
  ].join(" ");
  return decorate ? decorateFullBodyLegPrompt(core) : core;
}

function makeSceneVideoPrompt(scene = {}, overridePrompt = "") {
  const userPrompt = String(overridePrompt || "");
  if (userPrompt.trim()) return userPrompt;
  return String(scene.prompt || "").trim() || `15-second vertical cinematic short drama in scene ${scene.name || scene.id || "scene"}.`;
}

function makeInteractiveSceneVideoPrompt(scene = {}, primaryName = "", partnerName = "", overridePrompt = "") {
  const userPrompt = String(overridePrompt || "");
  if (userPrompt.trim()) return userPrompt;
  const base = makeSceneVideoPrompt(scene, "");
  const who = primaryName || "the main woman";
  const withWho = partnerName || "the selected partner";
  const interaction = [
    `Feature two adult women together in the same shot: ${who} and ${withWho}.`,
    `Keep both identities distinct and consistent from their reference images.`,
    "They should interact naturally with eye contact, body turns, mirrored movement, and shared framing.",
    "Do not turn this into a solo portrait. Keep both characters visible in meaningful parts of the scene.",
    "Maintain tasteful non-explicit romance-drama energy.",
    "Audio: use soft seductive female voices with playful teasing dialogue and short spoken lines, intimate but non-explicit.",
  ].join(" ");
  return [userPrompt || base, interaction].filter(Boolean).join(" ");
}

function isAdvancedCustomPrompt(body = {}) {
  const params = plainObject(body.params);
  const preserveUserPrompt = boolFromRequest(firstPresent(
    body.preserveUserPrompt,
    body.preserve_user_prompt,
    params.preserveUserPrompt,
    params.preserve_user_prompt,
  ), false);
  const createKind = String(firstPresent(body.createKind, body.create_kind, params.createKind, params.create_kind, "") || "").trim().toLowerCase();
  const createMode = String(firstPresent(body.createMode, body.create_mode, params.createMode, params.create_mode, "") || "").trim().toLowerCase();
  return preserveUserPrompt || createKind === "custom" || createMode === "custom";
}

function enhancePlayfluxReferenceVideoPrompt(prompt = "", { hasReferenceImage = false, hasReferenceVideo = false } = {}) {
  const base = String(prompt || "").trim();
  if (!base || !hasReferenceVideo) return base;
  const lower = base.toLowerCase();
  if (lower.includes("video 1 is the reference motion video") || lower.includes("video 1 is the motion reference")) {
    return base;
  }
  const guide = [
    hasReferenceImage
      ? "CRITICAL: Image 1 is the user's selected character/source image. Preserve Image 1 identity, face, hairstyle, body type, skin tone, outfit direction, and main visual features."
      : "",
    "CRITICAL: Video 1 is the reference motion video. Match Video 1 closely: action type, pose sequence, body positions, interaction timing, camera angle, framing, shot rhythm, motion direction, and start/end composition.",
    hasReferenceImage
      ? "Use Video 1 only for motion, action, camera, and composition. Do not copy identity, face, body, clothing, background, watermark, text, colors, or artifacts from Video 1. If Image 1 conflicts with Video 1, Image 1 always wins."
      : "Use Video 1 as the primary action, camera, and composition guide.",
    "Reproduce the full Video 1 timeline from beginning to end. Keep every major action beat at the same relative timestamp; do not skip, reorder, compress, or invent actions. Preserve coherent anatomy, stable hands, and no subtitles or watermark.",
  ].filter(Boolean).join(" ");
  return [guide, base].filter(Boolean).join("\n\n");
}

function seedanceContentFromReferences({
  prompt = "",
  referenceAssetUri = "",
  extraReferenceAssetUris = [],
  firstFrameAssetUri = "",
  lastFrameAssetUri = "",
  referenceVideoAssetUri = "",
  extraReferenceVideoAssetUris = [],
  referenceAudioAssetUris = [],
  body = {},
} = {}) {
  const content = [{ type: "text", text: String(prompt || "").trim() }];
  if (firstFrameAssetUri) {
    content.push({
      type: "image_url",
      image_url: { url: firstFrameAssetUri },
      role: "first_frame",
    });
  }
  if (lastFrameAssetUri) {
    content.push({
      type: "image_url",
      image_url: { url: lastFrameAssetUri },
      role: "last_frame",
    });
  }
  const videoUris = [referenceVideoAssetUri, ...extraReferenceVideoAssetUris]
    .filter((uri, index, list) => uri && list.indexOf(uri) === index);
  const rawReferenceVideos = arrayFromBody(body?.reference_videos)
    .map((item) => (typeof item === "string" ? item : String(item?.url || item?.videoUrl || item?.video_url || item?.assetUri || "")))
    .filter(Boolean);
  rawReferenceVideos.forEach((uri) => {
    if (!videoUris.includes(uri) && videoUris.length < ADVANCED_SEEDANCE_VIDEO_REFERENCE_LIMIT) videoUris.push(uri);
  });
  videoUris.forEach((uri) => {
    content.push({
      type: "video_url",
      video_url: { url: uri },
      role: "reference_video",
    });
  });
  const rawReferenceAudios = [
    ...arrayFromBody(referenceAudioAssetUris),
    ...arrayFromBody(body?.reference_audios)
      .map((item) => (typeof item === "string" ? item : String(item?.url || item?.audioUrl || item?.audio_url || item?.assetUri || ""))),
  ]
    .filter((uri, index, list) => uri && typeof uri === "string" && list.indexOf(uri) === index)
    .slice(0, ADVANCED_SEEDANCE_AUDIO_REFERENCE_LIMIT);
  rawReferenceAudios.forEach((uri) => {
    content.push({
      type: "audio_url",
      audio_url: { url: uri },
      role: "reference_audio",
    });
  });
  if (referenceAssetUri && referenceAssetUri.startsWith("asset://")) {
    content.push({
      type: "image_url",
      image_url: { url: referenceAssetUri },
      role: "reference_image",
    });
  }
  extraReferenceAssetUris
    .filter((uri) => uri && uri.startsWith("asset://") && uri !== referenceAssetUri)
    .forEach((uri) => {
      content.push({
        type: "image_url",
        image_url: { url: uri },
        role: "reference_image",
      });
  });
  return content;
}

const SEEDANCE_TOP_LEVEL_PASSTHROUGH_FIELDS = [
  "model",
  "ratio",
  "resolution",
  "duration",
  "generate_audio",
  "web_search",
  "callback_url",
  "return_last_frame",
  "service_tier",
  "execution_expires_after",
  "draft",
  "safety_identifier",
  "priority",
  "seed",
  "frames",
  "watermark",
  "fps",
  "camera_fixed",
  "content",
  "reference_images",
  "reference_videos",
  "reference_audios",
];

