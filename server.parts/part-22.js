function posterFileName(taskId) {
  return `${String(taskId).replace(/[^a-z0-9_-]/gi, "_")}.jpg`;
}

async function generatedVideoNeedsFastStart(videoPath = "") {
  if (!videoPath || path.extname(videoPath).toLowerCase() !== ".mp4") return false;
  const handle = await fs.open(videoPath, "r");
  try {
    const stat = await handle.stat();
    const bytes = Buffer.alloc(Math.min(stat.size, 1024 * 1024));
    const { bytesRead } = await handle.read(bytes, 0, bytes.length, 0);
    const header = bytes.subarray(0, bytesRead);
    const moovOffset = header.indexOf("moov");
    const mdatOffset = header.indexOf("mdat");
    return mdatOffset >= 0 && (moovOffset < 0 || moovOffset > mdatOffset);
  } finally {
    await handle.close();
  }
}

async function ensureGeneratedVideoFastStart(videoPath = "") {
  if (!(await generatedVideoNeedsFastStart(videoPath))) return false;
  const tempPath = `${videoPath}.${Date.now()}.faststart.mp4`;
  try {
    await execFileQuiet("ffmpeg", [
      "-y",
      "-i",
      videoPath,
      "-map",
      "0:v:0",
      "-map",
      "0:a?",
      "-c",
      "copy",
      "-movflags",
      "+faststart",
      tempPath,
    ], { timeout: 120000 });
    await fs.copyFile(tempPath, videoPath);
    return true;
  } catch (error) {
    console.warn("[generated-video-faststart-failed]", videoPath, error.message || error);
    return false;
  } finally {
    await fs.rm(tempPath, { force: true }).catch(() => {});
  }
}

function cacheBustedMediaUrl(url = "", version = "") {
  const value = String(url || "").trim();
  if (!value || !version) return value;
  try {
    const parsed = new URL(value);
    parsed.searchParams.set("v", String(version));
    return parsed.toString();
  } catch {
    return value;
  }
}

async function createGeneratedVideoPoster(taskId, videoPath) {
  if (!taskId || !videoPath) return { localPosterPath: "", localPosterUrl: "" };
  await fs.mkdir(GENERATED_POSTER_DIR, { recursive: true });
  const fileName = posterFileName(taskId);
  const localPosterPath = path.join(GENERATED_POSTER_DIR, fileName);
  const localPosterUrl = `/assets/generated/posters/${fileName}`;
  try {
    await fs.access(localPosterPath);
    return { localPosterPath, localPosterUrl };
  } catch {
    // Capture below.
  }
  const captured = await captureVideoPosterFrame(videoPath, localPosterPath);
  return captured ? { localPosterPath, localPosterUrl } : { localPosterPath: "", localPosterUrl: "" };
}

async function uploadGeneratedMediaToObjectStorage({ taskId, localVideoPath, localPosterPath = "", force = false } = {}) {
  const result = {
    cdnVideoUrl: "",
    cdnPosterUrl: "",
    cdnError: "",
    storageProvider: objectStorageProvider(),
    storageKey: "",
    posterStorageProvider: "",
    posterStorageKey: "",
  };
  if (!objectStorageEnabled() || (!force && !generatedOutputStorageEnabled())) return result;
  const errors = [];
  if (localVideoPath) {
    try {
      const videoExt = path.extname(localVideoPath) || ".mp4";
      const videoUpload = await uploadStaticAssetToObjectStorage({
        key: objectStoragePath("generated", "videos", `${storagePathSegment(taskId || "video")}${videoExt}`),
        filePath: localVideoPath,
        mime: videoMimeFromPath(localVideoPath),
      });
      result.cdnVideoUrl = videoUpload.publicUrl;
      result.storageKey = videoUpload.key || "";
      result.storageProvider = videoUpload.provider || objectStorageProvider();
      const marker = await markPublishedFileSafely(localVideoPath);
      if (!marker) console.warn("[generated-video-r2-ready-marker-failed]", taskId, localVideoPath);
    } catch (error) {
      errors.push(error.message || "Generated video R2 upload failed.");
      console.warn("[generated-video-r2-upload-failed]", taskId, error.message || error);
    }
  }
  if (localPosterPath) {
    try {
      const posterBytes = await fs.readFile(localPosterPath);
      const posterUpload = await uploadStaticAssetToObjectStorage({
        key: objectStoragePath("generated", "posters", `${storagePathSegment(taskId || "poster")}.jpg`),
        bytes: posterBytes,
        mime: "image/jpeg",
      });
      result.cdnPosterUrl = posterUpload.publicUrl;
      result.posterStorageProvider = posterUpload.provider || objectStorageProvider();
      result.posterStorageKey = posterUpload.key || "";
      if (!result.storageKey) result.storageProvider = posterUpload.provider || objectStorageProvider();
      const marker = await markPublishedFileSafely(localPosterPath);
      if (!marker) console.warn("[generated-poster-r2-ready-marker-failed]", taskId, localPosterPath);
    } catch (error) {
      errors.push(error.message || "Generated poster R2 upload failed.");
      console.warn("[generated-poster-r2-upload-failed]", taskId, error.message || error);
    }
  }
  result.cdnError = errors.join("; ");
  return result;
}

function pipeFileStream(res, filePath, options = {}) {
  const stream = fsSync.createReadStream(filePath, options);
  stream.on("error", (error) => {
    if (!res.headersSent) {
      res.writeHead(error.code === "ENOENT" ? 404 : 500, { "content-type": "text/plain; charset=utf-8" });
    }
    res.end(error.code === "ENOENT" ? "Not Found" : "File stream error");
  });
  return stream.pipe(res);
}

function parseSingleByteRange(rangeHeader = "", size = 0) {
  const match = String(rangeHeader || "").match(/^bytes=(\d*)-(\d*)$/);
  if (!match) return null;
  const [, rawStart, rawEnd] = match;
  if (!rawStart && !rawEnd) return { invalid: true };
  let start;
  let end;
  if (!rawStart) {
    const suffixLength = Number(rawEnd);
    if (!Number.isFinite(suffixLength) || suffixLength <= 0) return { invalid: true };
    start = Math.max(0, size - suffixLength);
    end = size - 1;
  } else {
    start = Number(rawStart);
    end = rawEnd ? Number(rawEnd) : size - 1;
  }
  if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end < start || start >= size) {
    return { invalid: true };
  }
  return { start, end: Math.min(size - 1, end) };
}

function sendMediaFile(req, res, filePath, { contentType = "application/octet-stream", stat, headers = {} } = {}) {
  const fileStat = stat || fsSync.statSync(filePath);
  const range = parseSingleByteRange(req.headers.range, fileStat.size);
  const baseHeaders = {
    "content-type": contentType,
    "accept-ranges": "bytes",
    "cache-control": "private, max-age=300",
    "x-accel-buffering": "no",
    ...headers,
  };
  if (range?.invalid) {
    res.writeHead(416, { ...baseHeaders, "content-range": `bytes */${fileStat.size}`, "content-length": 0 });
    return res.end();
  }
  if (range) {
    res.writeHead(206, {
      ...baseHeaders,
      "content-length": range.end - range.start + 1,
      "content-range": `bytes ${range.start}-${range.end}/${fileStat.size}`,
    });
    if (req.method === "HEAD") return res.end();
    return fsSync.createReadStream(filePath, { start: range.start, end: range.end }).pipe(res);
  }
  res.writeHead(200, { ...baseHeaders, "content-length": fileStat.size });
  if (req.method === "HEAD") return res.end();
  return fsSync.createReadStream(filePath).pipe(res);
}

async function proxyRemoteMedia(req, res, remoteUrl, { fallbackMime = "application/octet-stream", headers = {} } = {}) {
  const requestHeaders = {};
  if (req.headers.range) requestHeaders.range = req.headers.range;
  let response;
  try {
    response = await fetch(remoteUrl, {
      method: req.method,
      headers: requestHeaders,
      redirect: "follow",
      signal: AbortSignal.timeout(120000),
    });
  } catch (error) {
    return sendJson(res, 502, { ok: false, message: `Failed to read media: ${error.message || "upstream error"}` });
  }
  if (response.status === 416) {
    res.writeHead(416, {
      ...headers,
      "content-range": response.headers.get("content-range") || "bytes */*",
      "accept-ranges": "bytes",
      "cache-control": "private, no-store",
    });
    return res.end();
  }
  if (!response.ok) return sendJson(res, 502, { ok: false, message: `Failed to read media: ${response.status}` });
  const outputHeaders = {
    ...headers,
    "content-type": String(response.headers.get("content-type") || fallbackMime).split(";")[0].trim(),
    "cache-control": headers["cache-control"] || "private, max-age=300",
    "x-accel-buffering": "no",
  };
  for (const name of ["content-length", "content-range", "accept-ranges", "etag", "last-modified"]) {
    const value = response.headers.get(name);
    if (value) outputHeaders[name] = value;
  }
  if (response.status === 206 && !outputHeaders["accept-ranges"]) outputHeaders["accept-ranges"] = "bytes";
  res.writeHead(response.status, outputHeaders);
  if (req.method === "HEAD" || !response.body) return res.end();
  return Readable.fromWeb(response.body).pipe(res);
}

function internalAssetRedirectPath(filePath = "") {
  const relative = path.relative(path.join(ROOT, "assets"), filePath);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) return "";
  return `/__protected_assets__/${relative.split(path.sep).map(encodeURIComponent).join("/")}`;
}

function sendInternalAsset(res, filePath, contentType, stat, { privateCache = false } = {}) {
  const redirectPath = internalAssetRedirectPath(filePath);
  if (!redirectPath) return false;
  res.writeHead(200, {
    "content-type": contentType,
    "cache-control": privateCache ? "private, no-store" : "public, max-age=604800, immutable",
    "x-accel-redirect": redirectPath,
  });
  res.end();
  return true;
}

async function downloadGeneratedVideo(taskId, remoteVideoUrl, { forceLocal = false, posterOnly = false } = {}) {
  if (!forceLocal && (!generatedOutputStorageEnabled() || GENERATED_ASSETS_ON_DEMAND)) {
    const existing = taskId ? await getGenerationRecord(taskId).catch(() => null) : null;
    return {
      localVideoPath: existing?.localVideoPath || "",
      localVideoUrl: existing?.localVideoUrl || "",
      localPosterPath: existing?.localPosterPath || "",
      localPosterUrl: existing?.localPosterUrl || "",
      cdnVideoUrl: existing?.cdnVideoUrl || "",
      cdnPosterUrl: existing?.cdnPosterUrl || "",
      storageProvider: existing?.storageProvider || "",
      storageKey: existing?.storageKey || "",
      posterStorageProvider: existing?.posterStorageProvider || "",
      posterStorageKey: existing?.posterStorageKey || "",
      cdnError: existing?.cdnError || "",
      playbackOptimizedAt: existing?.playbackOptimizedAt || "",
    };
  }
  const existing = await getGenerationRecord(taskId);
  const expectedDurationSeconds = expectedGeneratedVideoDurationSeconds(existing || {});
  if (posterOnly) {
    let source = String(remoteVideoUrl || "").trim();
    if (existing?.localVideoUrl) {
      const existingVideoPath = existing.localVideoPath || path.join(ROOT, existing.localVideoUrl.replace(/^\//, ""));
      try {
        await fs.access(existingVideoPath);
        source = existingVideoPath;
      } catch {
        // Fall back to the provider URL when the local copy is gone.
      }
    }
    if (!source) throw new Error("No video source is available for poster repair.");
    const poster = await createGeneratedVideoPoster(taskId, source);
    if (!poster.localPosterUrl) throw new Error("Could not capture a poster frame from the video.");
    return {
      localVideoPath: existing?.localVideoPath || "",
      localVideoUrl: existing?.localVideoUrl || "",
      localPosterPath: poster.localPosterPath || "",
      localPosterUrl: poster.localPosterUrl || "",
      cdnVideoUrl: existing?.cdnVideoUrl || "",
      cdnPosterUrl: existing?.cdnPosterUrl || "",
      storageProvider: existing?.storageProvider || "",
      storageKey: existing?.storageKey || "",
      posterStorageProvider: existing?.posterStorageProvider || "",
      posterStorageKey: existing?.posterStorageKey || "",
      cdnError: existing?.cdnError || "",
      playbackOptimizedAt: existing?.playbackOptimizedAt || "",
    };
  }
  if (existing?.localVideoUrl) {
    try {
      const existingVideoPath = existing.localVideoPath || path.join(ROOT, existing.localVideoUrl.replace(/^\//, ""));
      await fs.access(existingVideoPath);
      const actualDurationSeconds = expectedDurationSeconds > 0
        ? await probeLocalVideoDurationSeconds(existingVideoPath)
        : 0;
      const canRedownload = Boolean(String(remoteVideoUrl || "").trim());
      if (!canRedownload || !generatedVideoIsTooShort(actualDurationSeconds, expectedDurationSeconds)) {
        let optimized = existing;
        let poster = null;
        if (!existing.localPosterUrl) {
          poster = await createGeneratedVideoPoster(taskId, existingVideoPath);
          if (poster.localPosterUrl) {
            optimized = {
              ...existing,
              localPosterPath: poster.localPosterPath || existing.localPosterPath || "",
              localPosterUrl: poster.localPosterUrl || existing.localPosterUrl || "",
              posterUrl: poster.localPosterUrl || existing.posterUrl || "",
            };
            await upsertGenerationRecord({
              taskId,
              localPosterPath: optimized.localPosterPath,
              localPosterUrl: optimized.localPosterUrl,
              posterUrl: optimized.posterUrl,
              lastUpdateReason: "generated-poster-recovery",
            });
          }
        }
        if (!GENERATED_ASSETS_ON_DEMAND && !generationRecordIsApiTask(existing) && generatedOutputStorageEnabled() && (!existing.cdnVideoUrl || (existing.localPosterPath && !existing.cdnPosterUrl))) {
          const cdn = await uploadGeneratedMediaToObjectStorage({
            taskId,
            localVideoPath: existingVideoPath,
            localPosterPath: existing.localPosterPath || "",
          });
          optimized = {
            ...existing,
            cdnVideoUrl: cdn.cdnVideoUrl || existing.cdnVideoUrl || "",
            cdnPosterUrl: cdn.cdnPosterUrl || existing.cdnPosterUrl || "",
            storageProvider: cdn.storageProvider || existing.storageProvider || "",
            storageKey: cdn.storageKey || existing.storageKey || "",
            posterStorageProvider: cdn.posterStorageProvider || existing.posterStorageProvider || "",
            posterStorageKey: cdn.posterStorageKey || existing.posterStorageKey || "",
            cdnError: cdn.cdnError || existing.cdnError || "",
          };
          if (optimized.cdnVideoUrl || optimized.cdnPosterUrl || optimized.cdnError !== existing.cdnError) {
            await upsertGenerationRecord({
              taskId,
              cdnVideoUrl: optimized.cdnVideoUrl,
              cdnPosterUrl: optimized.cdnPosterUrl,
              storageProvider: optimized.storageProvider,
              storageKey: optimized.storageKey,
              posterStorageProvider: optimized.posterStorageProvider,
              posterStorageKey: optimized.posterStorageKey,
              cdnError: optimized.cdnError,
            });
          }
        }
        if (!GENERATED_ASSETS_ON_DEMAND && !generationRecordIsApiTask(optimized) && generationRecordNeedsMediaMaintenance(optimized)) queueGenerationRecordMediaMaintenance(optimized);
        return {
          localVideoPath: optimized.localVideoPath || existingVideoPath,
          localVideoUrl: optimized.localVideoUrl || existing.localVideoUrl,
          localPosterPath: optimized.localPosterPath || "",
          localPosterUrl: optimized.localPosterUrl || "",
          cdnVideoUrl: optimized.cdnVideoUrl || "",
          cdnPosterUrl: optimized.cdnPosterUrl || "",
          storageProvider: optimized.storageProvider || "",
          storageKey: optimized.storageKey || "",
          posterStorageProvider: optimized.posterStorageProvider || "",
          posterStorageKey: optimized.posterStorageKey || "",
          cdnError: optimized.cdnError || "",
          playbackOptimizedAt: optimized.playbackOptimizedAt || "",
        };
      }
      console.warn(
        `[generated-video-too-short] ${taskId}: stored ${actualDurationSeconds}s, expected ${expectedDurationSeconds}s; retrying upstream download`,
      );
    } catch {
      // Fall through and re-download if the record points to a missing file.
    }
  }

  if (generationRecordIsApiTask(existing || {})) {
    return {
      localVideoPath: existing?.localVideoPath || "",
      localVideoUrl: existing?.localVideoUrl || "",
      localPosterPath: existing?.localPosterPath || "",
      localPosterUrl: existing?.localPosterUrl || "",
      cdnVideoUrl: existing?.cdnVideoUrl || "",
      cdnPosterUrl: existing?.cdnPosterUrl || "",
      storageProvider: existing?.storageProvider || "",
      storageKey: existing?.storageKey || "",
      posterStorageProvider: existing?.posterStorageProvider || "",
      posterStorageKey: existing?.posterStorageKey || "",
      cdnError: existing?.cdnError || "",
      playbackOptimizedAt: existing?.playbackOptimizedAt || "",
    };
  }

  await fs.mkdir(GENERATED_VIDEO_DIR, { recursive: true });
  const fileName = videoFileName(taskId);
  const localVideoPath = path.join(GENERATED_VIDEO_DIR, fileName);
  const localVideoUrl = `/assets/generated/videos/${fileName}`;
  let downloadedDurationSeconds = 0;
  let fastStartReady = false;
  let lastDownloadError = null;
  for (let attempt = 0; attempt < GENERATED_VIDEO_DOWNLOAD_MAX_ATTEMPTS; attempt += 1) {
    const temporaryPath = `${localVideoPath}.${process.pid}.${Date.now()}.download`;
    try {
      const response = await fetch(remoteVideoUrl, { signal: AbortSignal.timeout(15 * 60 * 1000) });
      if (!response.ok) {
        throw new Error(`Failed to download generated video: ${response.status}`);
      }
      if (!response.body) throw new Error("Generated video download returned no response body.");
      await pipeline(Readable.fromWeb(response.body), fsSync.createWriteStream(temporaryPath));
      downloadedDurationSeconds = expectedDurationSeconds > 0
        ? await probeLocalVideoDurationSeconds(temporaryPath)
        : 0;
      if (generatedVideoIsTooShort(downloadedDurationSeconds, expectedDurationSeconds) && attempt + 1 < GENERATED_VIDEO_DOWNLOAD_MAX_ATTEMPTS) {
        console.warn(
          `[generated-video-download-retry] ${taskId}: attempt ${attempt + 1} returned ${downloadedDurationSeconds}s, expected ${expectedDurationSeconds}s`,
        );
        await fs.rm(temporaryPath, { force: true });
        await delay(GENERATED_VIDEO_DOWNLOAD_RETRY_DELAY_MS * (attempt + 1));
        continue;
      }
      const fastStartNeeded = await generatedVideoNeedsFastStart(temporaryPath);
      fastStartReady = !fastStartNeeded || await ensureGeneratedVideoFastStart(temporaryPath);
      await fs.rename(temporaryPath, localVideoPath);
      break;
    } catch (error) {
      lastDownloadError = error;
      await fs.rm(temporaryPath, { force: true }).catch(() => {});
      if (attempt + 1 >= GENERATED_VIDEO_DOWNLOAD_MAX_ATTEMPTS) throw error;
      await delay(GENERATED_VIDEO_DOWNLOAD_RETRY_DELAY_MS * (attempt + 1));
    }
  }
  if (generatedVideoIsTooShort(downloadedDurationSeconds, expectedDurationSeconds)) {
    console.warn(
      `[generated-video-duration-mismatch] ${taskId}: stored ${downloadedDurationSeconds}s after ${GENERATED_VIDEO_DOWNLOAD_MAX_ATTEMPTS} attempts, expected ${expectedDurationSeconds}s`,
    );
  }
  if (!fastStartReady && lastDownloadError) throw lastDownloadError;
  const poster = await createGeneratedVideoPoster(taskId, localVideoPath);
  const cdn = !GENERATED_ASSETS_ON_DEMAND && generatedOutputStorageEnabled()
    ? await uploadGeneratedMediaToObjectStorage({
      taskId,
      localVideoPath,
      localPosterPath: poster.localPosterPath,
    })
    : { cdnVideoUrl: "", cdnPosterUrl: "", cdnError: "" };

  const result = {
    localVideoPath,
    localVideoUrl,
    playbackOptimizedAt: fastStartReady ? new Date().toISOString() : "",
    ...poster,
    ...cdn,
  };
  // Persist storage metadata at the point of publication. Callers historically
  // copied only the CDN URLs and discarded the keys, which made private OSS
  // media impossible to sign correctly on later requests.
  if (taskId && (result.storageKey || result.posterStorageKey || result.cdnVideoUrl || result.cdnPosterUrl)) {
    await upsertGenerationRecord({
      taskId,
      cdnVideoUrl: result.cdnVideoUrl || "",
      cdnPosterUrl: result.cdnPosterUrl || "",
      storageProvider: result.storageProvider || objectStorageProvider(),
      storageKey: result.storageKey || "",
      posterStorageProvider: result.posterStorageProvider || result.storageProvider || objectStorageProvider(),
      posterStorageKey: result.posterStorageKey || "",
      cdnError: result.cdnError || "",
    }).catch((error) => {
      console.warn("[generated-media-storage-metadata-save-failed]", taskId, error.message || error);
    });
  }
  return result;
}

function imageFileName(taskId, mime = "image/png") {
  return `${String(taskId || randomId("img")).replace(/[^a-z0-9_-]/gi, "_")}${imageExtFromMime(mime)}`;
}

async function saveGeneratedImageFile(taskId, bytes, mime = "image/png", { publish = true, forceLocal = false } = {}) {
  if (!forceLocal && (!generatedOutputStorageEnabled() || GENERATED_ASSETS_ON_DEMAND)) {
    return {
      localImagePath: "",
      localImageUrl: "",
      cdnImageUrl: "",
      storageProvider: "",
      storageKey: "",
      cdnError: "",
    };
  }
  const imageMime = String(mime || "").startsWith("image/") ? mime : "image/png";
  await fs.mkdir(GENERATED_IMAGE_DIR, { recursive: true });
  const fileName = imageFileName(taskId, imageMime);
  const localImagePath = path.join(GENERATED_IMAGE_DIR, fileName);
  const localImageUrl = `/assets/generated/images/${fileName}`;
  await fs.writeFile(localImagePath, bytes);
  const result = {
    localImagePath,
    localImageUrl,
    cdnImageUrl: "",
    storageProvider: "",
    storageKey: "",
    cdnError: "",
  };
  if (publish && !GENERATED_ASSETS_ON_DEMAND && generatedOutputStorageEnabled()) {
    try {
      const upload = await uploadStaticAssetToObjectStorage({
        key: objectStoragePath("generated", "images", fileName),
        bytes,
        mime: imageMime,
      });
      result.cdnImageUrl = upload.publicUrl || "";
      result.storageProvider = upload.provider || objectStorageProvider();
      result.storageKey = upload.key || objectStorageKeyFromPublicUrl(upload.publicUrl, upload.provider || "oss").key || "";
      const marker = await markPublishedFileSafely(localImagePath);
      if (!marker) console.warn("[generated-image-r2-ready-marker-failed]", taskId, localImagePath);
    } catch (error) {
      // The generated image is already safely stored locally and its upstream
      // result succeeded. R2 is only the faster advanced-download copy, so a
      // publication failure must not turn the generation task into a failure.
      result.cdnError = error.message || "Generated image R2 upload failed.";
      console.warn("[generated-image-r2-upload-failed]", taskId, result.cdnError);
    }
  }
  return result;
}

async function saveRemoteGeneratedImage(taskId, imageUrl, { mime = "image/png", publish = true, forceLocal = false } = {}) {
  if (!forceLocal && (!generatedOutputStorageEnabled() || GENERATED_ASSETS_ON_DEMAND)) {
    return {
      localImagePath: "",
      localImageUrl: "",
      cdnImageUrl: "",
      storageProvider: "",
      storageKey: "",
      cdnError: "",
    };
  }
  const downloaded = await downloadRemoteFileToBuffer(imageUrl, { label: "generated image", maxBytes: 30 * 1024 * 1024 });
  const imageMime = String(downloaded.mime || "").startsWith("image/") ? downloaded.mime : mime;
  return saveGeneratedImageFile(taskId, downloaded.bytes, imageMime, { publish, forceLocal });
}

function requireHttpUrl(value = "", label = "URL") {
  let parsed;
  try {
    parsed = new URL(String(value || "").trim());
  } catch {
    const error = new Error(`${label} must be a valid http or https URL.`);
    error.statusCode = 400;
    throw error;
  }
  if (!["http:", "https:"].includes(parsed.protocol)) {
    const error = new Error(`${label} must use http or https.`);
    error.statusCode = 400;
    throw error;
  }
  return parsed.toString();
}

async function downloadRemoteFileToBuffer(fileUrl, {
  label = "file",
  maxBytes = 200 * 1024 * 1024,
  timeoutMs = 15 * 60 * 1000,
  retryCount = 2,
  retryDelayMs = 1000,
} = {}) {
  const retries = Math.max(0, Math.min(3, Math.floor(Number(retryCount) || 0)));
  let response = null;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      response = await fetch(fileUrl, { redirect: "follow", signal: AbortSignal.timeout(timeoutMs) });
    } catch (cause) {
      if (attempt < retries) {
        await delay(Math.max(100, Number(retryDelayMs) || 500) * (attempt + 1));
        continue;
      }
      const error = new Error(`Failed to download ${label}: ${cause?.message || "network error"}`);
      error.statusCode = 502;
      error.code = "REMOTE_DOWNLOAD_FAILED";
      throw error;
    }
    const retryableStatus = [408, 425, 429].includes(response.status) || response.status >= 500;
    if (response.ok || !retryableStatus || attempt >= retries) break;
    try {
      await response.body?.cancel();
    } catch {}
    await delay(Math.max(100, Number(retryDelayMs) || 500) * (attempt + 1));
  }
  if (!response.ok) {
    const error = new Error(`Failed to download ${label}: ${response.status}`);
    error.statusCode = [408, 425, 429].includes(response.status) || response.status >= 500 ? 502 : 400;
    error.code = error.statusCode === 502 ? "REMOTE_DOWNLOAD_FAILED" : "INVALID_REMOTE_MEDIA";
    throw error;
  }
  const contentLength = Number(response.headers.get("content-length") || 0);
  if (contentLength && contentLength > maxBytes) {
    const error = new Error(`${label} is too large. Max ${Math.round(maxBytes / 1024 / 1024)}MB.`);
    error.statusCode = 400;
    throw error;
  }
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.byteLength > maxBytes) {
    const error = new Error(`${label} is too large. Max ${Math.round(maxBytes / 1024 / 1024)}MB.`);
    error.statusCode = 400;
    throw error;
  }
  return {
    bytes,
    mime: String(response.headers.get("content-type") || "").split(";")[0].trim().toLowerCase(),
  };
}

async function captureVideoPosterFrame(videoPath, posterPath) {
  try {
    await execFileQuiet("ffmpeg", [
      "-y",
      "-ss",
      "00:00:00.500",
      "-i",
      videoPath,
      "-frames:v",
      "1",
      "-q:v",
      "3",
      posterPath,
    ], { timeout: 60000 });
    await fs.access(posterPath);
    return true;
  } catch {
    return false;
  }
}

async function probeLocalVideoDurationSeconds(videoPath = "") {
  if (!videoPath) return 0;
  try {
    const result = await execFileJson("ffprobe", [
      "-v",
      "error",
      "-show_entries",
      "format=duration",
      "-of",
      "json",
      videoPath,
    ], { timeout: VIDEO_DURATION_PROBE_TIMEOUT_MS });
    return durationSecondsFromValue(result?.format?.duration);
  } catch {
    return 0;
  }
}

async function captureVideoFrameAt(videoPath, imagePath, seekSeconds = 0.5) {
  try {
    await execFileQuiet("ffmpeg", [
      "-y",
      "-ss",
      String(Math.max(0, Number(seekSeconds || 0))).replace(",", "."),
      "-i",
      videoPath,
      "-frames:v",
      "1",
      "-q:v",
      "3",
      imagePath,
    ], { timeout: 60000 });
    await fs.access(imagePath);
    return true;
  } catch {
    return false;
  }
}

function localAssetPathFromPublicValue(value = "") {
  const text = String(value || "").trim();
  if (!text) return "";
  let pathname = "";
  if (text.startsWith("/assets/")) {
    pathname = text.split("?")[0];
  } else if (isPublicHttpUrl(text)) {
    try {
      const parsed = new URL(text);
      const base = configuredPublicBaseUrl();
      const baseHost = base ? new URL(base).host : "";
      if (baseHost && parsed.host === baseHost && parsed.pathname.startsWith("/assets/")) {
        pathname = parsed.pathname;
      }
    } catch {}
  }
  if (!pathname) return "";
  const filePath = path.normalize(path.join(ROOT, pathname.replace(/^\/+/, "")));
  const assetsRoot = path.normalize(path.join(ROOT, "assets"));
  if (!filePath.startsWith(assetsRoot)) return "";
  return filePath;
}

async function workflowVideoFileFromInput(auth = {}, { taskId = "", videoUrl = "", index = 0 } = {}) {
  const cleanTaskId = String(taskId || "").trim();
  const record = cleanTaskId ? await getGenerationRecord(cleanTaskId) : null;
  if (record?.taskId) {
    if (String(record.userId || "") !== String(auth.user?.id || "")) {
      const error = new Error("Workflow video does not belong to the current user.");
      error.statusCode = 403;
      throw error;
    }
    const recordPath = record.localVideoPath || localAssetPathFromPublicValue(record.localVideoUrl || record.videoUrl || "");
    if (recordPath) {
      try {
        await fs.access(recordPath);
        return { filePath: recordPath, record };
      } catch {}
    }
    const remote = generationRecordProviderVideoUrl(record) || record.remoteVideoUrl || String(videoUrl || "");
    if (remote && isPublicHttpUrl(remote)) {
      const downloaded = await downloadGeneratedVideo(record.taskId, remote, { forceLocal: true });
      if (downloaded.localVideoPath) return { filePath: downloaded.localVideoPath, record };
    }
  }
  const localPath = localAssetPathFromPublicValue(videoUrl);
  if (localPath) {
    try {
      await fs.access(localPath);
      return { filePath: localPath, record: null };
    } catch {}
  }
  if (!isPublicHttpUrl(videoUrl)) {
    const error = new Error("Workflow video URL is not accessible.");
    error.statusCode = 400;
    throw error;
  }
  const downloaded = await downloadRemoteFileToBuffer(videoUrl, { label: "workflow video", maxBytes: 300 * 1024 * 1024 });
  const ext = videoExtFromMime(downloaded.mime, videoUrl) || ".mp4";
  await fs.mkdir(GENERATED_VIDEO_DIR, { recursive: true });
  const fileName = `${storagePathSegment(cleanTaskId || `workflow-${index}`)}-source-${Date.now()}${ext}`;
  const filePath = path.join(GENERATED_VIDEO_DIR, fileName);
  await fs.writeFile(filePath, downloaded.bytes);
  return { filePath, record: null };
}

async function handleWorkflowExtractFrame(req, res) {
  const auth = await requireUser(req, res);
  if (!auth) return;
  const body = await readJson(req);
  try {
    const taskId = String(body.taskId || "").trim();
    const videoUrl = String(body.videoUrl || "").trim();
    const resolved = await workflowVideoFileFromInput(auth, { taskId, videoUrl });
    const duration = await probeLocalVideoDurationSeconds(resolved.filePath) || durationSecondsFromValue(body.duration) || 5;
    const seek = Math.max(0.2, Number(duration || 5) - 0.28);
    await fs.mkdir(GENERATED_IMAGE_DIR, { recursive: true });
    const safeId = storagePathSegment(taskId || randomId("workflow-frame"));
    const fileName = `${safeId}-last-frame.jpg`;
    const localFramePath = path.join(GENERATED_IMAGE_DIR, fileName);
    const localFrameUrl = `/assets/generated/images/${fileName}`;
    const captured = await captureVideoFrameAt(resolved.filePath, localFramePath, seek);
    if (!captured) {
      return sendJson(res, 502, { ok: false, message: "Failed to extract workflow tail frame." });
    }
    return sendJson(res, 200, {
      ok: true,
      frameUrl: localFrameUrl,
      localFrameUrl,
      publicFrameUrl: publicUrlForAssetPath(localFrameUrl),
      duration,
      seek,
    });
  } catch (error) {
    return sendJson(res, error.statusCode || 500, { ok: false, message: error.message || "Failed to extract workflow frame." });
  }
}

async function handleWorkflowCompose(req, res) {
  const auth = await requireUser(req, res);
  if (!auth) return;
  const body = await readJson(req);
  const taskIds = arrayFromBody(body.taskIds).map((value) => String(value || "").trim()).filter(Boolean);
  const videoUrls = arrayFromBody(body.videoUrls).map((value) => String(value || "").trim()).filter(Boolean);
  const count = Math.max(taskIds.length, videoUrls.length);
  if (!count) return sendJson(res, 400, { ok: false, message: "No workflow videos to compose." });
  if (count > 12) return sendJson(res, 400, { ok: false, message: "Workflow compose supports up to 12 videos." });
  try {
    const inputs = [];
    for (let index = 0; index < count; index += 1) {
      const resolved = await workflowVideoFileFromInput(auth, {
        taskId: taskIds[index] || "",
        videoUrl: videoUrls[index] || "",
        index,
      });
      inputs.push(resolved.filePath);
    }
    await fs.mkdir(GENERATED_VIDEO_DIR, { recursive: true });
    const outputId = randomId("workflow");
    const listPath = path.join(GENERATED_VIDEO_DIR, `${outputId}.txt`);
    const localVideoPath = path.join(GENERATED_VIDEO_DIR, `${outputId}.mp4`);
    const localVideoUrl = `/assets/generated/videos/${outputId}.mp4`;
    const concatList = inputs.map((filePath) => `file '${String(filePath).replace(/'/g, "'\\''")}'`).join("\n");
    await fs.writeFile(listPath, concatList, "utf8");
    await execFileQuiet("ffmpeg", [
      "-y",
      "-f",
      "concat",
      "-safe",
      "0",
      "-i",
      listPath,
      "-c:v",
      "libx264",
      "-preset",
      "veryfast",
      "-crf",
      "20",
      "-c:a",
      "aac",
      "-movflags",
      "+faststart",
      localVideoPath,
    ], { timeout: 15 * 60 * 1000 });
    const poster = await createGeneratedVideoPoster(outputId, localVideoPath);
    return sendJson(res, 200, {
      ok: true,
      videoUrl: localVideoUrl,
      localVideoUrl,
      posterUrl: poster.localPosterUrl || "",
      localPosterUrl: poster.localPosterUrl || "",
      taskId: outputId,
      count,
    });
  } catch (error) {
    return sendJson(res, error.statusCode || 500, { ok: false, message: error.message || "Failed to compose workflow output." });
  }
}

function videoToolAction(value = "") {
  const action = String(value || "").trim().toLowerCase().replace(/[\s_]+/g, "-");
  if (["image-face-swap", "image-faceswap", "photo-face-swap", "photo-faceswap"].includes(action)) return "image-face-swap";
  if (["face-swap", "faceswap", "replace-face"].includes(action)) return "face-swap";
  if (["undress-image-video", "image-video-undress", "undress-tool-image-video", "video-tool-undress-image-video"].includes(action)) return "undress-image-video";
  if (["undress-video", "video-undress", "strip-video"].includes(action)) return "undress-video";
  if (["undress", "strip", "take-off"].includes(action)) return "undress";
  return "";
}

function videoToolAsset(db, userId, assetId, mediaKind, label) {
  const asset = (db.userAssets || []).find((entry) => (
    entry.id === String(assetId || "").trim()
    && entry.userId === userId
    && !isSoftDeleted(entry)
  ));
  if (!asset) {
    const error = new Error(`${label} not found.`);
    error.statusCode = 404;
    throw error;
  }
  validateWan27MediaKind(asset, mediaKind, label);
  return asset;
}

function videoToolPricingAggregate(action, items = [], extras = {}) {
  const rows = items.filter(Boolean);
  return {
    provider: ["undress", "image-face-swap"].includes(action) ? "wan27-image-edit" : ["undress-image-video", "face-swap", "undress-video"].includes(action) ? "wan27" : "video-tool",
    action,
    credits: creditsAmount(rows.reduce((sum, item) => sum + Number(item.credits || 0), 0)),
    originalCredits: creditsAmount(rows.reduce((sum, item) => sum + Number(item.originalCredits ?? item.credits ?? 0), 0)),
    baseCredits: creditsAmount(rows.reduce((sum, item) => sum + Number(item.baseCredits ?? item.credits ?? 0), 0)),
    source: "configured_video_tool_models",
    components: rows,
    ...extras,
  };
}

function publicVideoToolPricing(pricing = {}) {
  return {
    credits: creditsAmount(pricing.credits || 0),
    durationSeconds: Number(pricing.durationSeconds || 0),
    segmentCount: Number(pricing.segmentCount || 1),
    resolution: String(pricing.resolution || "720p"),
    outputKind: String(pricing.outputKind || "video"),
  };
}

async function videoToolUndressPreset() {
  const presets = await listWorkflowPresetsFromDb({ includeDeleted: false }) || [];
  return presets.find((preset) => String(preset.id || "").trim().toLowerCase() === "nude")
    || presets.find((preset) => String(preset.label || preset.name || "").trim().toLowerCase() === "nude")
    || {};
}

async function videoToolPresetVideoDuration(preset = {}) {
  const previewUrl = String(preset.previewUrl || "").trim();
  if (!previewUrl) return 0;
  const localPath = localAssetPathFromPublicValue(previewUrl);
  if (localPath) return await probeLocalVideoDurationSeconds(localPath);
  const publicUrl = publicHttpUrlForUpstream(previewUrl) || publicUrlForAssetPath(previewUrl);
  return publicUrl ? await probeVideoDurationSeconds(publicUrl) : 0;
}

async function videoToolPricing(action, { durationSeconds = 0, user = null, auth = null } = {}) {
  const config = await readAppConfig();
  const pricingOptions = pricingContextForAuth(auth || {});
  if (["undress", "image-face-swap"].includes(action)) {
    const imagePricing = wan27ImageModifyPricing(config, user, pricingOptions);
    return videoToolPricingAggregate(action, [imagePricing], {
      durationSeconds: 0,
      segmentCount: 1,
      resolution: "2K",
      model: imagePricing.model || WAN27_IMAGE_PRO_MODEL,
      outputKind: "image",
    });
  }
  if (action === "undress-image-video") {
    const videoPricing = applyUserPricingToEstimate(advancedModelPricing("wan27", {
      videoCapability: "wan27-i2v",
      model: ALIYUN_WAN27_I2V_MODEL,
      duration: 5,
      resolution: "720P",
      ratio: "9:16",
      generateAudio: true,
      advancedPricing: config.platform?.advancedPricing,
    }), user || 1, pricingOptions);
    return videoToolPricingAggregate(action, [videoPricing], {
      durationSeconds: 5,
      segmentCount: 1,
      resolution: "720p",
      model: ALIYUN_WAN27_I2V_MODEL,
      outputKind: "video",
    });
  }
  if (["face-swap", "undress-video"].includes(action)) {
    const segments = planVideoEditSegments(durationSeconds);
    const components = segments.map((segment) => applyUserPricingToEstimate(advancedModelPricing("wan27", {
      videoCapability: "wan27-video-edit",
      model: ALIYUN_WAN27_VIDEO_EDIT_MODEL,
      duration: segment.outputSeconds,
      inputVideoSeconds: segment.inputSeconds,
      resolution: "720p",
      advancedPricing: config.platform?.advancedPricing,
    }), user || 1, pricingOptions));
    return videoToolPricingAggregate(action, components, {
      durationSeconds: creditsAmount(durationSeconds),
      segmentCount: segments.length,
      segments,
      resolution: "720p",
      model: ALIYUN_WAN27_VIDEO_EDIT_MODEL,
    });
  }

  throw new Error("Unsupported video tool action.");
}

async function handleVideoToolEstimate(req, res) {
  const auth = await getAuth(req, { loadDb: false });
  const body = await readJson(req);
  const action = videoToolAction(body.action);
  if (!action) return sendJson(res, 400, { ok: false, message: "Unsupported video tool action." });
  const durationSeconds = durationSecondsFromValue(body.durationSeconds || body.duration);
  if (["face-swap", "undress-video"].includes(action) && !durationSeconds) {
    return sendJson(res, 400, { ok: false, message: "Read the source video duration before estimating." });
  }
  try {
    const pricing = await videoToolPricing(action, { durationSeconds, user: auth?.user || null, auth });
    return sendJson(res, 200, { ok: true, pricing: publicVideoToolPricing(pricing) });
  } catch (error) {
    return sendJson(res, error.statusCode || 400, { ok: false, message: error.message || "Unable to estimate this video." });
  }
}

async function localVideoToolAssetPath(asset = {}, workDir = "") {
  const localPath = await ensureLocalUserAssetFile(null, asset, {
    label: "Uploaded video",
    maxBytes: VIDEO_TOOL_SOURCE_UPLOAD_MAX_BYTES,
    requireFile: false,
  });
  if (localPath) {
    try {
      await fs.access(localPath);
      return localPath;
    } catch {}
  }
  const publicUrl = publicUrlForLocalAsset(asset);
  if (!isPublicHttpUrl(publicUrl)) {
    const error = new Error("Uploaded video is not accessible.");
    error.statusCode = 400;
    throw error;
  }
  const downloaded = await downloadRemoteFileToBuffer(publicUrl, { label: "source video", maxBytes: 300 * 1024 * 1024 });
  const filePath = path.join(workDir, "source-upload.mp4");
  await fs.writeFile(filePath, downloaded.bytes);
  return filePath;
}

function publicUndressLockedPreviewUrl(value = "") {
  const pathname = String(value || "").trim().split("?")[0];
  return /^\/assets\/generated\/locked-previews\/[a-z0-9_-]+\.jpg$/i.test(pathname) ? pathname : "";
}

function undressLockedPreviewFile(taskId = "") {
  const safeTaskId = String(taskId || randomId("locked-preview")).replace(/[^a-z0-9_-]/gi, "_");
  const fileName = `${safeTaskId}.jpg`;
  return {
    filePath: path.join(GENERATED_LOCKED_PREVIEW_DIR, fileName),
    publicUrl: `/assets/generated/locked-previews/${fileName}`,
  };
}

async function createUndressLockedPreview(taskId, sourceImagePath) {
  const preview = undressLockedPreviewFile(taskId);
  const tempPath = path.join(
    GENERATED_LOCKED_PREVIEW_DIR,
    `.${path.basename(preview.filePath, ".jpg")}-${process.pid}-${Date.now()}.jpg`,
  );
  await fs.mkdir(GENERATED_LOCKED_PREVIEW_DIR, { recursive: true });
  try {
    await execFileQuiet("ffmpeg", [
      "-y",
      "-i",
      sourceImagePath,
      "-vf",
      "scale=64:64:force_original_aspect_ratio=decrease:flags=area,boxblur=2:1,eq=brightness=-0.08:saturation=0.55",
      "-frames:v",
      "1",
      "-q:v",
      "14",
      "-map_metadata",
      "-1",
      tempPath,
    ], { timeout: 60000 });
    await fs.rm(preview.filePath, { force: true });
    await fs.rename(tempPath, preview.filePath);
    return {
      lockedPreviewPath: preview.filePath,
      lockedPreviewUrl: preview.publicUrl,
    };
  } finally {
    await fs.rm(tempPath, { force: true }).catch(() => {});
  }
}

async function existingUndressLockedImagePath(record = {}) {
  const candidates = [
    String(record.localImagePath || "").trim(),
    localAssetPathFromPublicValue(record.localImageUrl || ""),
    localAssetPathFromPublicValue(record.imageResultUrl || ""),
  ].filter(Boolean);
  for (const candidate of candidates) {
    const filePath = path.normalize(candidate);
    const relative = path.relative(GENERATED_IMAGE_DIR, filePath);
    if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) continue;
    try {
      await fs.access(filePath);
      return filePath;
    } catch {}
  }
  return "";
}

async function ensureUndressLockedPreview(record = {}) {
  const isUndressRecord = String(record.source || "").startsWith("undress-tool-")
    || String(record.kind || "").includes("tool-undress");
  if (!isUndressRecord || record.resultLocked !== true || !isSucceededStatus(record.status)) return record;

  const previewUrl = publicUndressLockedPreviewUrl(record.lockedPreviewUrl);
  const previewFile = previewUrl ? localAssetPathFromPublicValue(previewUrl) : "";
  if (previewFile) {
    try {
      await fs.access(previewFile);
      return record;
    } catch {}
  }

  const sourceImagePath = await existingUndressLockedImagePath(record);
  if (!sourceImagePath) return record;
  try {
    const preview = await createUndressLockedPreview(record.taskId, sourceImagePath);
    return await upsertGenerationRecord({ taskId: record.taskId, ...preview });
  } catch (error) {
    console.warn("[undress-locked-preview-failed]", record.taskId, error.message || error);
    return record;
  }
}

async function publishVideoToolInput(filePath, taskId, index) {
  const fileName = `${storagePathSegment(taskId)}-input-${index + 1}.mp4`;
  const publicPath = `/assets/generated/videos/${fileName}`;
  const publicFilePath = path.join(GENERATED_VIDEO_DIR, fileName);
  await fs.mkdir(GENERATED_VIDEO_DIR, { recursive: true });
  await fs.copyFile(filePath, publicFilePath);
  if (objectStorageEnabled()) {
    const upload = await uploadStaticAssetToObjectStorage({
      key: objectStoragePath("generated", "videos", fileName),
      bytes: await fs.readFile(publicFilePath),
      mime: videoMimeFromPath(publicFilePath),
    });
    if (!upload.publicUrl) throw new Error("Video tool input could not be published to R2.");
    return { url: upload.publicUrl, publicFilePath, storageKey: upload.key || "" };
  }
  return { url: publicUrlForAssetPath(publicPath), publicFilePath, storageKey: "" };
}

async function waitForAliyunVideoToolTask(upstreamTaskId, { timeoutMs = 45 * 60 * 1000, inputUrls = [] } = {}) {
  const deadline = Date.now() + timeoutMs;
  let lastRaw = null;
  while (Date.now() < deadline) {
    lastRaw = await queryAliyunOrMulerouterTask(upstreamTaskId, { method: "GET" });
    const task = normalizeWan27Task(lastRaw);
    if (isSucceededStatus(task.status) && task.videoUrl) {
      if (isSubmittedWan27InputVideo(task.videoUrl, inputUrls)) {
        const error = new Error("Wan2.7 Video Edit returned the submitted input video instead of a generated result.");
        error.statusCode = 502;
        error.payload = lastRaw;
        throw error;
      }
      return { task, raw: lastRaw };
    }
    if (isFailedStatus(task.status)) {
      const error = new Error(task.error || "Wan2.7 Video Edit failed.");
      error.statusCode = 502;
      error.payload = lastRaw;
      throw error;
    }
    await delay(5000);
  }
  const error = new Error("Wan2.7 Video Edit timed out.");
  error.statusCode = 504;
  error.payload = lastRaw;
  throw error;
}

async function waitForSeedanceVideoToolTask(upstreamTaskId, { timeoutMs = 45 * 60 * 1000 } = {}) {
  const deadline = Date.now() + timeoutMs;
  let lastRaw = null;
  while (Date.now() < deadline) {
    const task = USE_GATEWAY_UPSTREAM
      ? await gatewayQueryTask(upstreamTaskId)
      : normalizeTask(lastRaw = await arkRequest("GET", `/contents/generations/tasks/${encodeURIComponent(upstreamTaskId)}`));
    if (isSucceededStatus(task.status) && task.videoUrl) return { task, raw: task.raw || lastRaw };
    if (isFailedStatus(task.status)) {
      const error = new Error(task.error || "Seedance video generation failed.");
      error.statusCode = 502;
      error.payload = task.raw || lastRaw;
      throw error;
    }
    await delay(5000);
  }
  const error = new Error("Seedance video generation timed out.");
  error.statusCode = 504;
  error.payload = lastRaw;
  throw error;
}

async function waitForWan27ImageToolTask(upstreamTaskId, { timeoutMs = 20 * 60 * 1000 } = {}) {
  const deadline = Date.now() + timeoutMs;
  let lastRaw = null;
  while (Date.now() < deadline) {
    const task = USE_GATEWAY_UPSTREAM
      ? await gatewayQueryTask(upstreamTaskId)
      : normalizeWan27ImageTask(lastRaw = await queryAliyunOrMulerouterTask(upstreamTaskId, { method: "GET" }));
    const imageUrl = task.imageUrls?.[0] || task.imageUrl || "";
    if (isSucceededStatus(task.status) && imageUrl) return { task: { ...task, imageUrl, imageUrls: [imageUrl] }, raw: task.raw || lastRaw };
    if (isFailedStatus(task.status)) {
      const error = new Error(task.error || "Wan2.7 image edit failed.");
      error.statusCode = 502;
      error.payload = task.raw || lastRaw;
      throw error;
    }
    await delay(4000);
  }
  const error = new Error("Wan2.7 image edit timed out.");
  error.statusCode = 504;
  error.payload = lastRaw;
  throw error;
}

async function downloadVideoToolSegment(url, filePath) {
  const downloaded = await downloadRemoteFileToBuffer(url, { label: "generated segment", maxBytes: 300 * 1024 * 1024 });
  await fs.writeFile(filePath, downloaded.bytes);
  return filePath;
}

async function composeVideoToolSegments(taskId, inputPaths = []) {
  if (!inputPaths.length) throw new Error("No generated video segments were returned.");
  await fs.mkdir(GENERATED_VIDEO_DIR, { recursive: true });
  const listPath = path.join(GENERATED_VIDEO_DIR, `${storagePathSegment(taskId)}-segments.txt`);
  const localVideoPath = path.join(GENERATED_VIDEO_DIR, videoFileName(taskId));
  const localVideoUrl = `/assets/generated/videos/${videoFileName(taskId)}`;
  const concatList = inputPaths.map((filePath) => `file '${String(filePath).replace(/'/g, "'\\''")}'`).join("\n");
  await fs.writeFile(listPath, concatList, "utf8");
  try {
    await execFileQuiet("ffmpeg", [
      "-y", "-f", "concat", "-safe", "0", "-i", listPath,
      "-map", "0:v:0", "-map", "0:a?",
      "-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-pix_fmt", "yuv420p",
      "-c:a", "aac", "-b:a", "128k", "-movflags", "+faststart", localVideoPath,
    ], { timeout: 30 * 60 * 1000 });
  } finally {
    await fs.rm(listPath, { force: true }).catch(() => {});
  }
  const poster = await createGeneratedVideoPoster(taskId, localVideoPath);
  const cdn = generatedOutputStorageEnabled()
    ? await uploadGeneratedMediaToObjectStorage({
      taskId,
      localVideoPath,
      localPosterPath: poster.localPosterPath,
    })
    : { cdnVideoUrl: "", cdnPosterUrl: "", cdnError: "" };
  return { localVideoPath, localVideoUrl, playbackOptimizedAt: new Date().toISOString(), ...poster, ...cdn };
}

async function createHiddenVideoToolImageAsset(db, user, imageUrl, taskId, stage) {
  const downloaded = await downloadRemoteFileToBuffer(imageUrl, { label: `${stage} image`, maxBytes: 20 * 1024 * 1024 });
  const mime = String(downloaded.mime || "").startsWith("image/") ? downloaded.mime : "image/png";
  const asset = await createUserMediaAssetFromBytes(db, user, {
    bytes: downloaded.bytes,
    mime,
    name: `${stage} image`,
    fileName: `${storagePathSegment(taskId)}-${stage}${imageExtFromMime(mime)}`,
    maxBytes: IMAGE_UPLOAD_MAX_BYTES,
  });
  asset.hidden = true;
  asset.meta = { ...(asset.meta || {}), videoToolTaskId: taskId, videoToolStage: stage };
  asset.updatedAt = new Date().toISOString();
  db.userAssets = (db.userAssets || []).map((entry) => (entry.id === asset.id ? asset : entry));
  if (dbEnabled()) await upsertUserAssetInDb(asset);
  else await writeDb(db);
  return asset;
}

async function generateVideoToolImageStage({ db, user, sourceAsset, prompt, taskId, stage, config }) {
  const preparedSource = await ensurePublicUrlForUserMediaAsset(db, sourceAsset);
  const imageOptions = wan27ImageRequestOptions({}, {
    defaultModel: normalizeAdvancedPricing(config.platform?.advancedPricing).wan27ImagePro.model || WAN27_IMAGE_PRO_MODEL,
    defaultRatio: "9:16",
    defaultResolution: "2K",
  });
  const submit = USE_GATEWAY_UPSTREAM ? gatewaySubmitWan27ImageEditTask : submitWan27ImageModify;
  const submitted = await submit({
    imageUrls: [publicUrlForLocalAsset(preparedSource)],
    prompt,
    ratio: imageOptions.ratio,
    resolution: imageOptions.resolution,
    model: imageOptions.model,
    input: imageOptions.input,
    parameters: imageOptions.parameters,
    waitForResult: true,
  });
  const imageUrl = submitted.task.imageUrls?.[0] || submitted.task.imageUrl || "";
  if (!imageUrl) {
    const error = new Error(submitted.task.error || `${stage} image generation returned no image.`);
    error.statusCode = 502;
    error.payload = submitted.raw;
    throw error;
  }
  return {
    asset: await createHiddenVideoToolImageAsset(db, user, imageUrl, taskId, stage),
    upstreamTaskId: submitted.task.taskId || "",
    upstreamPayload: submitted.payload,
    response: submitted.raw,
  };
}

async function updateVideoToolProgress(taskId, stage, updates = {}) {
  const record = await getGenerationRecord(taskId);
  return upsertGenerationRecord({
    ...(record || {}),
    taskId,
    status: updates.status || "running",
    params: {
      ...plainObject(record?.params),
      stage,
      ...(updates.params || {}),
    },
    ...updates,
    params: {
      ...plainObject(record?.params),
      stage,
      ...(updates.params || {}),
    },
    lastUpdateReason: `video-tool-${stage}`,
  });
}

async function refundVideoToolTask(taskId, message = "Video tool generation failed.", errorPayload = null) {
  const record = await getGenerationRecord(taskId);
  if (!record) return null;
  const cost = creditsAmount(record.preDeductedCredits || 0);
  const alreadyRefunded = String(record.billingStatus || "").toLowerCase() === "refunded";
  if (cost > 0 && !alreadyRefunded) {
    const db = await readDb();
    await changeUserCredits(db, record.userId, cost, "video_tool_refund", { taskId, action: record.params?.toolAction || "", error: message });
    await recordSubtokenAdjustment(record, {
      taskId,
      type: "video_tool_refund",
      amount: -cost,
      meta: { action: record.params?.toolAction || "", error: message },
    });
    if (!dbEnabled()) await writeDb(db);
  }
  const freeClaimId = String(record.freeImageClaimId || record.params?.freeImageClaimId || "").trim();
  if (freeClaimId) {
    await releaseToolFreeGenerationClaimInDb({ id: freeClaimId, userId: record.userId, taskId }).catch((error) => {
      console.warn("[undress-free-claim-release-failed]", taskId, error.message || error);
    });
  }
  return upsertGenerationRecord({
    ...record,
    taskId,
    status: "failed",
    awaitingUpstreamTask: false,
    error: message,
    finalCredits: 0,
    originalFinalCredits: 0,
    billingStatus: cost > 0 ? "refunded" : freeClaimId ? "free_released" : "free",
    billingSettledAt: new Date().toISOString(),
    failedAt: new Date().toISOString(),
    queryResponse: errorPayload || record.queryResponse || null,
    lastUpdateReason: "video-tool-failed",
  });
}

function closestWan27ImageRatioForAsset(asset = {}) {
  const dimensions = storedImageDimensionsForAsset(asset);
  if (!dimensions) return "9:16";
  const sourceRatio = dimensions.width / dimensions.height;
  const candidates = [
    ["9:16", 9 / 16],
    ["3:4", 3 / 4],
    ["1:1", 1],
    ["4:3", 4 / 3],
    ["16:9", 16 / 9],
  ];
  return candidates.reduce((best, candidate) => (
    Math.abs(Math.log(sourceRatio / candidate[1])) < Math.abs(Math.log(sourceRatio / best[1])) ? candidate : best
  ))[0];
}

