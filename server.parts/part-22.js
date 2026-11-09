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

async function createGeneratedVideoPoster(taskId, videoPath, { directory = "" } = {}) {
  if (!taskId || !videoPath) return { localPosterPath: "", localPosterUrl: "" };
  // Generated posters are transient artifacts. Callers either provide a task
  // workspace they manage or this helper creates and removes its own private
  // OS temp directory from a finally block.
  const ownsDirectory = !directory;
  const posterDirectory = directory || await fs.mkdtemp(path.join(os.tmpdir(), "raising-game-poster-"));
  const localPosterPath = path.join(posterDirectory, posterFileName(taskId));
  try {
    await fs.mkdir(posterDirectory, { recursive: true, mode: 0o700 });
    try {
      await fs.access(localPosterPath);
    } catch {
      const captured = await captureVideoPosterFrame(videoPath, localPosterPath);
      if (!captured) return { localPosterPath: "", localPosterUrl: "" };
    }
    return { localPosterPath, localPosterUrl: "" };
  } finally {
    if (ownsDirectory) await fs.rm(posterDirectory, { recursive: true, force: true }).catch(() => {});
  }
}

function generatedMediaTempRoot() {
  return path.join(os.tmpdir(), "raising-game-media");
}

async function createGeneratedMediaWorkspace(taskId = "media") {
  const root = generatedMediaTempRoot();
  await fs.mkdir(root, { recursive: true, mode: 0o700 });
  const prefix = `${storagePathSegment(taskId || "media")}-`;
  return fs.mkdtemp(path.join(root, prefix));
}

async function removeGeneratedMediaWorkspace(directory = "") {
  if (!directory) return;
  const root = path.resolve(generatedMediaTempRoot());
  const target = path.resolve(directory);
  if (!target.startsWith(`${root}${path.sep}`)) return;
  await fs.rm(target, { recursive: true, force: true }).catch((error) => {
    console.warn("[generated-media-temp-cleanup-failed]", target, error.message || error);
  });
}

async function verifyObjectStorageMedia(upload = {}, { expectedBytes = 0, label = "media" } = {}) {
  if (!upload?.publicUrl || !upload?.key) {
    const error = new Error(`${label} object storage upload did not return a public URL and key.`);
    error.statusCode = 502;
    error.code = "OBJECT_STORAGE_PUBLIC_URL_MISSING";
    error.retryable = true;
    throw error;
  }
  if (expectedBytes > 0 && Number(upload.bytes || 0) > 0 && Number(upload.bytes) !== Number(expectedBytes)) {
    const error = new Error(`${label} object storage size mismatch.`);
    error.statusCode = 502;
    error.code = "OBJECT_STORAGE_SIZE_MISMATCH";
    error.retryable = true;
    throw error;
  }
  const provider = String(upload.provider || objectStorageProvider() || "").toLowerCase();
  let verified = null;
  let lastError = null;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      if (provider === "oss") {
        const head = await headOssObject({ key: upload.key, config: OSS });
        if (head.ok) {
          if (expectedBytes > 0 && head.contentLength > 0 && head.contentLength !== Number(expectedBytes)) {
            const error = new Error(`${label} object storage size mismatch.`);
            error.code = "OBJECT_STORAGE_SIZE_MISMATCH";
            error.retryable = true;
            throw error;
          }
          const signedCdnUrl = makeOssSignedCdnUrl({ key: upload.key, expiresSeconds: 600 })
            || makeOssSignedDownloadUrl({ key: upload.key, expiresSeconds: 600 });
          if (signedCdnUrl) {
            const cdnHead = await fetchPublicRemoteUrl(signedCdnUrl, { method: "HEAD", signal: AbortSignal.timeout(30000) }, { label: `${label} signed CDN` });
            if (!cdnHead.ok) {
              lastError = new Error(`${label} signed CDN object is not readable (${cdnHead.status}).`);
              continue;
            }
          }
          verified = head;
          break;
        }
        lastError = new Error(`${label} object storage is not readable (${head.status}).`);
      } else if (provider === "r2") {
        const found = await findUploadedR2Object(upload.key);
        if (found) {
          verified = found;
          break;
        }
        lastError = new Error(`${label} object storage is not readable.`);
      } else {
        throw new Error(`${label} object storage provider is unavailable.`);
      }
    } catch (error) {
      lastError = error;
      if (error.code === "OBJECT_STORAGE_SIZE_MISMATCH") break;
    }
    if (attempt < 2) await delay(500 * (attempt + 1));
  }
  if (!verified) {
    const error = new Error(`${label} object storage verification failed${lastError?.message ? `: ${lastError.message}` : "."}`);
    error.statusCode = 502;
    error.code = "OBJECT_STORAGE_OBJECT_UNREADABLE";
    error.retryable = true;
    throw error;
  }
  return upload;
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
    videoBytes: 0,
    posterBytes: 0,
  };
  if (!objectStorageEnabled() || (!force && !generatedOutputStorageEnabled())) return result;
  const errors = [];
  if (localVideoPath) {
    try {
      result.videoBytes = (await fs.stat(localVideoPath)).size;
      const videoExt = path.extname(localVideoPath) || ".mp4";
      const videoUpload = await uploadStaticAssetToObjectStorage({
        key: objectStoragePath("generated", "videos", `${storagePathSegment(taskId || "video")}${videoExt}`),
        filePath: localVideoPath,
        mime: videoMimeFromPath(localVideoPath),
      });
      await verifyObjectStorageMedia(videoUpload, { expectedBytes: result.videoBytes, label: "Generated video" });
      result.cdnVideoUrl = videoUpload.publicUrl;
      result.storageKey = videoUpload.key || "";
      result.storageProvider = videoUpload.provider || objectStorageProvider();
    } catch (error) {
      errors.push(error.message || "Generated video object storage upload failed.");
      console.warn("[generated-video-object-storage-upload-failed]", taskId, error.message || error);
    }
  }
  if (localPosterPath) {
    try {
      const posterBytes = await fs.readFile(localPosterPath);
      result.posterBytes = posterBytes.length;
      const posterUpload = await uploadStaticAssetToObjectStorage({
        key: objectStoragePath("generated", "posters", `${storagePathSegment(taskId || "poster")}.jpg`),
        bytes: posterBytes,
        mime: "image/jpeg",
      });
      await verifyObjectStorageMedia(posterUpload, { expectedBytes: result.posterBytes, label: "Generated poster" });
      result.cdnPosterUrl = posterUpload.publicUrl;
      result.posterStorageProvider = posterUpload.provider || objectStorageProvider();
      result.posterStorageKey = posterUpload.key || "";
      if (!result.storageKey) result.storageProvider = posterUpload.provider || objectStorageProvider();
    } catch (error) {
      errors.push(error.message || "Generated poster object storage upload failed.");
      console.warn("[generated-poster-object-storage-upload-failed]", taskId, error.message || error);
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

const SAFE_REMOTE_FETCH_MAX_REDIRECTS = 5;

function safeRemoteUrlError(label = "URL", message = "") {
  const error = new Error(`${label} ${message || "must be a public HTTP(S) URL."}`.trim());
  error.statusCode = 400;
  error.code = "INVALID_REMOTE_MEDIA_URL";
  return error;
}

async function resolvePublicRemoteUrl(value = "", label = "URL") {
  let parsed;
  try {
    parsed = new URL(String(value || "").trim());
  } catch {
    throw safeRemoteUrlError(label, "must be a valid http or https URL.");
  }
  if (!["http:", "https:"].includes(parsed.protocol)) throw safeRemoteUrlError(label, "must use http or https.");
  if (parsed.username || parsed.password) throw safeRemoteUrlError(label, "must not contain credentials.");
  if (isPrivateVegaHostname(parsed.hostname)) throw safeRemoteUrlError(label, "must not target a private or local host.");
  let addresses;
  try {
    addresses = await dns.promises.lookup(parsed.hostname, { all: true, verbatim: true });
  } catch {
    throw safeRemoteUrlError(label, "hostname could not be resolved.");
  }
  if (!addresses.length) throw safeRemoteUrlError(label, "hostname could not be resolved.");
  if (addresses.some((item) => isPrivateVegaHostname(item.address))) {
    throw safeRemoteUrlError(label, "must not resolve to a private or local address.");
  }
  return { url: parsed, addresses };
}

async function requestPinnedPublicUrl(target, init = {}, label = "URL") {
  const { url, addresses } = await resolvePublicRemoteUrl(target, label);
  const selected = addresses.find((item) => item.family === 4) || addresses[0];
  const transport = url.protocol === "https:" ? require("node:https") : require("node:http");
  return new Promise((resolve, reject) => {
    const request = transport.request({
      protocol: url.protocol,
      hostname: selected.address,
      port: url.port || (url.protocol === "https:" ? 443 : 80),
      // DNS is pinned to the validated address, but TLS must still validate the
      // original hostname. Without SNI, multi-tenant certificates can fail or
      // the wrong virtual host can be served.
      servername: url.protocol === "https:" ? url.hostname : undefined,
      path: `${url.pathname}${url.search}`,
      method: init.method || "GET",
      headers: {
        host: url.host,
        ...(init.headers || {}),
      },
      signal: init.signal,
    }, (response) => {
      const headers = new Headers();
      for (const [name, value] of Object.entries(response.headers)) {
        if (Array.isArray(value)) value.forEach((item) => headers.append(name, item));
        else if (value !== undefined) headers.set(name, String(value));
      }
      const body = response.statusCode === 204 || response.statusCode === 304 || init.method === "HEAD"
        ? null
        : Readable.toWeb(response);
      resolve(new Response(body, {
        status: response.statusCode || 502,
        statusText: response.statusMessage || "",
        headers,
      }));
    });
    request.on("error", reject);
    if (init.body !== undefined && init.body !== null) request.write(init.body);
    request.end();
  });
}

async function fetchPublicRemoteUrl(input, init = {}, { label = "URL", maxRedirects = SAFE_REMOTE_FETCH_MAX_REDIRECTS } = {}) {
  let currentUrl = String(input || "").trim();
  for (let redirectCount = 0; redirectCount <= maxRedirects; redirectCount += 1) {
    const response = await requestPinnedPublicUrl(currentUrl, {
      ...init,
      headers: init.headers || {},
    }, label);
    if (![301, 302, 303, 307, 308].includes(response.status)) return response;
    const location = response.headers.get("location");
    try { await response.body?.cancel(); } catch {}
    if (!location) throw safeRemoteUrlError(label, "redirected without a location.");
    if (redirectCount >= maxRedirects) throw safeRemoteUrlError(label, "redirected too many times.");
    currentUrl = new URL(location, currentUrl).toString();
    await resolvePublicRemoteUrl(currentUrl, label);
    currentUrl = new URL(currentUrl).toString();
  }
  throw safeRemoteUrlError(label, "redirected too many times.");
}

async function proxyRemoteMedia(req, res, remoteUrl, { fallbackMime = "application/octet-stream", headers = {} } = {}) {
  const requestHeaders = {};
  if (req.headers.range) requestHeaders.range = req.headers.range;
  let response;
  try {
    response = await fetchPublicRemoteUrl(remoteUrl, {
      method: req.method,
      headers: requestHeaders,
      signal: AbortSignal.timeout(120000),
    }, { label: "Remote media" });
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

function generatedVideoDurableMediaUpdates(media = {}, record = {}) {
  const cdnVideoUrl = String(media.cdnVideoUrl || record.cdnVideoUrl || "").trim();
  const cdnPosterUrl = String(media.cdnPosterUrl || record.cdnPosterUrl || "").trim();
  return {
    videoUrl: cdnVideoUrl || String(record.videoUrl || "").trim(),
    posterUrl: cdnPosterUrl || String(record.posterUrl || "").trim(),
    localVideoUrl: "",
    localVideoPath: "",
    localPosterUrl: "",
    localPosterPath: "",
    cdnVideoUrl,
    cdnPosterUrl,
    storageProvider: String(media.storageProvider || record.storageProvider || "").trim(),
    storageKey: String(media.storageKey || record.storageKey || "").trim(),
    posterStorageProvider: String(media.posterStorageProvider || record.posterStorageProvider || "").trim(),
    posterStorageKey: String(media.posterStorageKey || record.posterStorageKey || "").trim(),
    cdnError: String(media.cdnError || record.cdnError || "").trim(),
    playbackOptimizedAt: String(media.playbackOptimizedAt || record.playbackOptimizedAt || "").trim(),
  };
}

async function downloadGeneratedVideo(taskId, remoteVideoUrl, { forceLocal = false, posterOnly = false } = {}) {
  // Generated videos are never a durable local asset. Every success path uses
  // a disposable workspace and returns verified object-storage metadata only.
  // forceLocal is retained for historical call-site compatibility; it never
  // changes the durable storage contract.
  const existing = await getGenerationRecord(taskId);
  const expectedDurationSeconds = expectedGeneratedVideoDurationSeconds(existing || {});
  if (posterOnly) {
    const workspace = await createGeneratedMediaWorkspace(taskId || "poster");
    try {
      let source = String(remoteVideoUrl || "").trim();
      if (existing?.cdnVideoUrl) source = "";
      const downloaded = source
        ? await downloadRemoteVideoToWorkspace(taskId, source, workspace, expectedDurationSeconds)
        : null;
      if (downloaded?.localVideoPath) source = downloaded.localVideoPath;
      if (!source && existing?.cdnVideoUrl && objectStorageEnabled() && existing.storageKey) {
        const signed = makeOssSignedCdnUrl({
          key: existing.storageKey,
          expiresSeconds: 600,
        }) || makeOssSignedDownloadUrl({ key: existing.storageKey, expiresSeconds: 600 });
        if (signed) source = signed;
      }
      if (!source) throw new Error("No video source is available for poster repair.");
      const poster = await createGeneratedVideoPoster(taskId, source, { directory: workspace });
      if (!poster.localPosterPath) throw new Error("Could not capture a poster frame from the video.");
      const posterBytes = await fs.readFile(poster.localPosterPath);
      const upload = await uploadStaticAssetToObjectStorage({
        key: objectStoragePath("generated", "posters", `${storagePathSegment(taskId || "poster")}.jpg`),
        bytes: posterBytes,
        mime: "image/jpeg",
      });
      await verifyObjectStorageMedia(upload, { expectedBytes: posterBytes.length, label: "Generated poster" });
      return {
        localVideoPath: "",
        localVideoUrl: "",
        localPosterPath: "",
        localPosterUrl: "",
        cdnVideoUrl: existing?.cdnVideoUrl || "",
        cdnPosterUrl: upload.publicUrl,
        storageProvider: existing?.storageProvider || "",
        storageKey: existing?.storageKey || "",
        posterStorageProvider: upload.provider || objectStorageProvider(),
        posterStorageKey: upload.key || "",
        cdnError: "",
        playbackOptimizedAt: existing?.playbackOptimizedAt || "",
      };
    } finally {
      await removeGeneratedMediaWorkspace(workspace);
    }
  }

  const workspace = await createGeneratedMediaWorkspace(taskId || "video");
  try {
    const existingKey = String(existing?.storageKey || "").trim();
    if (existingKey && objectStorageEnabled()) {
      const downloadUrl = makeOssSignedCdnUrl({ key: existingKey, expiresSeconds: 600 })
        || makeOssSignedDownloadUrl({ key: existingKey, expiresSeconds: 600 });
      if (downloadUrl) {
        try {
          const downloaded = await downloadRemoteVideoToWorkspace(taskId, downloadUrl, workspace, expectedDurationSeconds);
          const poster = await createGeneratedVideoPoster(taskId, downloaded.localVideoPath, { directory: workspace });
          const posterUpload = poster.localPosterPath
            ? await uploadStaticAssetToObjectStorage({
              key: objectStoragePath("generated", "posters", `${storagePathSegment(taskId || "poster")}.jpg`),
              filePath: poster.localPosterPath,
              mime: "image/jpeg",
            }).then((upload) => verifyObjectStorageMedia(upload, { label: "Generated poster" }))
            : null;
          return {
            localVideoPath: "",
            localVideoUrl: "",
            localPosterPath: "",
            localPosterUrl: "",
            cdnVideoUrl: existing?.cdnVideoUrl || "",
            cdnPosterUrl: posterUpload?.publicUrl || existing?.cdnPosterUrl || "",
            storageProvider: existing?.storageProvider || objectStorageProvider(),
            storageKey: existingKey,
            posterStorageProvider: posterUpload?.provider || existing?.posterStorageProvider || "",
            posterStorageKey: posterUpload?.key || existing?.posterStorageKey || "",
            cdnError: "",
            playbackOptimizedAt: downloaded.playbackOptimizedAt || existing?.playbackOptimizedAt || "",
          };
        } catch (error) {
          console.warn("[generated-video-durable-source-unavailable]", taskId, error.message || error);
        }
      }
    }

    const downloaded = await downloadRemoteVideoToWorkspace(taskId, remoteVideoUrl, workspace, expectedDurationSeconds);
    const poster = await createGeneratedVideoPoster(taskId, downloaded.localVideoPath, { directory: workspace });
    const cdn = await uploadGeneratedMediaToObjectStorage({
      taskId,
      localVideoPath: downloaded.localVideoPath,
      localPosterPath: poster.localPosterPath,
      force: true,
    });
    if (!cdn.cdnVideoUrl || !cdn.storageKey) {
      const error = new Error(cdn.cdnError || "Generated video was not persisted to object storage.");
      error.statusCode = 502;
      error.retryable = true;
      error.code = "OBJECT_STORAGE_UPLOAD_FAILED";
      throw error;
    }
    return {
      ...downloaded,
      localVideoPath: "",
      localVideoUrl: "",
      localPosterPath: "",
      localPosterUrl: "",
      cdnVideoUrl: cdn.cdnVideoUrl,
      cdnPosterUrl: cdn.cdnPosterUrl || "",
      storageProvider: cdn.storageProvider || objectStorageProvider(),
      storageKey: cdn.storageKey,
      posterStorageProvider: cdn.posterStorageProvider || "",
      posterStorageKey: cdn.posterStorageKey || "",
      cdnError: cdn.cdnError || "",
    };
  } finally {
    await removeGeneratedMediaWorkspace(workspace);
  }
}

async function downloadRemoteVideoToWorkspace(taskId, remoteVideoUrl, workspace, expectedDurationSeconds = 0) {
  if (!remoteVideoUrl) throw new Error("No generated video source URL.");
  await fs.mkdir(workspace, { recursive: true });
  const localVideoPath = path.join(workspace, videoFileName(taskId));
  let downloadedDurationSeconds = 0;
  let fastStartReady = false;
  let lastDownloadError = null;
  for (let attempt = 0; attempt < GENERATED_VIDEO_DOWNLOAD_MAX_ATTEMPTS; attempt += 1) {
    const temporaryPath = `${localVideoPath}.${process.pid}.${Date.now()}.download`;
    try {
      const response = await fetchPublicRemoteUrl(remoteVideoUrl, { signal: AbortSignal.timeout(15 * 60 * 1000) }, { label: "Generated video" });
      if (!response.ok) throw new Error(`Failed to download generated video: ${response.status}`);
      if (!response.body) throw new Error("Generated video download returned no response body.");
      await pipeline(Readable.fromWeb(response.body), fsSync.createWriteStream(temporaryPath));
      downloadedDurationSeconds = expectedDurationSeconds > 0
        ? await probeLocalVideoDurationSeconds(temporaryPath)
        : 0;
      if (generatedVideoIsTooShort(downloadedDurationSeconds, expectedDurationSeconds) && attempt + 1 < GENERATED_VIDEO_DOWNLOAD_MAX_ATTEMPTS) {
        console.warn(`[generated-video-download-retry] ${taskId}: attempt ${attempt + 1} returned ${downloadedDurationSeconds}s, expected ${expectedDurationSeconds}s`);
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
    console.warn(`[generated-video-duration-mismatch] ${taskId}: stored ${downloadedDurationSeconds}s after ${GENERATED_VIDEO_DOWNLOAD_MAX_ATTEMPTS} attempts, expected ${expectedDurationSeconds}s`);
  }
  if (!fastStartReady && lastDownloadError) throw lastDownloadError;
  return {
    localVideoPath,
    localVideoUrl: "",
    playbackOptimizedAt: fastStartReady ? new Date().toISOString() : "",
  };
}

function imageFileName(taskId, mime = "image/png") {
  return `${String(taskId || randomId("img")).replace(/[^a-z0-9_-]/gi, "_")}${imageExtFromMime(mime)}`;
}

async function saveGeneratedImageFile(taskId, bytes, mime = "image/png", { publish = true, forceLocal = false } = {}) {
  const imageMime = String(mime || "").startsWith("image/") ? mime : "image/png";
  const fileName = imageFileName(taskId, imageMime);
  const result = {
    localImagePath: "",
    localImageUrl: "",
    cdnImageUrl: "",
    storageProvider: "",
    storageKey: "",
    cdnError: "",
  };
  if (publish && generatedOutputStorageEnabled()) {
    try {
      const upload = await uploadStaticAssetToObjectStorage({
        key: objectStoragePath("generated", "images", fileName),
        bytes,
        mime: imageMime,
      });
      await verifyObjectStorageMedia(upload, { expectedBytes: bytes.length, label: "Generated image" });
      result.cdnImageUrl = upload.publicUrl || "";
      result.storageProvider = upload.provider || objectStorageProvider();
      result.storageKey = upload.key || "";
    } catch (error) {
      result.cdnError = error.message || "Generated image object storage upload failed.";
      console.warn("[generated-image-object-storage-upload-failed]", taskId, result.cdnError);
    }
  }
  return result;
}

async function saveRemoteGeneratedImage(taskId, imageUrl, { mime = "image/png", publish = true, forceLocal = false } = {}) {
  if (!generatedOutputStorageEnabled()) {
    const error = new Error("Generated media requires object storage.");
    error.statusCode = 503;
    error.code = "OBJECT_STORAGE_NOT_CONFIGURED";
    throw error;
  }
  const downloaded = await downloadRemoteFileToBuffer(imageUrl, { label: "generated image", maxBytes: 30 * 1024 * 1024 });
  const imageMime = String(downloaded.mime || "").startsWith("image/") ? downloaded.mime : mime;
  const saved = await saveGeneratedImageFile(taskId, downloaded.bytes, imageMime, { publish, forceLocal });
  if (!saved.cdnImageUrl || !saved.storageKey) {
    const error = new Error(saved.cdnError || "Generated image was not persisted to object storage.");
    error.statusCode = 502;
    error.code = "OBJECT_STORAGE_UPLOAD_FAILED";
    error.retryable = true;
    throw error;
  }
  return saved;
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

async function readResponseBodyWithLimit(response, maxBytes, label = "file") {
  const chunks = [];
  let total = 0;
  if (response.body) {
    const reader = response.body.getReader();
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        total += value.byteLength;
        if (total > maxBytes) {
          const error = new Error(`${label} is too large. Max ${Math.round(maxBytes / 1024 / 1024)}MB.`);
          error.statusCode = 400;
          await reader.cancel().catch(() => {});
          throw error;
        }
        chunks.push(Buffer.from(value));
      }
    } finally {
      reader.releaseLock();
    }
  }
  return Buffer.concat(chunks, total);
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
      response = await fetchPublicRemoteUrl(fileUrl, { signal: AbortSignal.timeout(timeoutMs) }, { label });
    } catch (cause) {
      if (attempt < retries) {
        await delay(Math.max(100, Number(retryDelayMs) || 500) * (attempt + 1));
        continue;
      }
      const error = new Error(`Failed to download ${label}: ${cause?.message || "network error"}`);
      error.statusCode = Number(cause?.statusCode) || 502;
      error.code = cause?.code || "REMOTE_DOWNLOAD_FAILED";
      if (cause?.retryable === false) error.retryable = false;
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
  const bytes = await readResponseBodyWithLimit(response, maxBytes, label);
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
  return safeAssetPathFromUrl(pathname);
}

async function workflowVideoFileFromInput(auth = {}, { taskId = "", videoUrl = "", index = 0, workspace = "" } = {}) {
  if (!workspace) throw new Error("Workflow media workspace is required.");
  const cleanTaskId = String(taskId || "").trim();
  const record = cleanTaskId ? await getGenerationRecord(cleanTaskId) : null;
  if (record?.taskId) {
    if (String(record.userId || "") !== String(auth.user?.id || "")) {
      const error = new Error("Workflow video does not belong to the current user.");
      error.statusCode = 403;
      throw error;
    }
    if (record.storageKey && objectStorageEnabled()) {
      const filePath = path.join(workspace, `record-${index + 1}${videoExtFromMime("", generationRecordProviderVideoUrl(record) || record.videoUrl) || ".mp4"}`);
      await downloadOssObject({ key: record.storageKey, filePath, maxBytes: 300 * 1024 * 1024, config: OSS });
      return { filePath, record };
    }
    // Historical local media is read only as a temporary workflow input. It is
    // never copied back into the persistent generated-media directories.
    const historicalPath = record.localVideoPath
      ? safePathWithin(ASSETS_ROOT, record.localVideoPath)
      : localAssetPathFromPublicValue(record.localVideoUrl || record.videoUrl || "");
    if (historicalPath) {
      try {
        await fs.access(historicalPath);
        const ext = path.extname(historicalPath) || ".mp4";
        const filePath = path.join(workspace, `record-${index + 1}${ext}`);
        await fs.copyFile(historicalPath, filePath);
        return { filePath, record };
      } catch {}
    }
    const remote = generationRecordProviderVideoUrl(record) || record.remoteVideoUrl || String(videoUrl || "");
    if (remote && isPublicHttpUrl(remote)) {
      const downloaded = await downloadRemoteVideoToWorkspace(record.taskId || `workflow-${index}`, remote, workspace);
      if (downloaded.localVideoPath) return { filePath: downloaded.localVideoPath, record };
    }
  }
  const historicalPath = localAssetPathFromPublicValue(videoUrl);
  if (historicalPath) {
    try {
      await fs.access(historicalPath);
      const filePath = path.join(workspace, `source-${index + 1}${path.extname(historicalPath) || ".mp4"}`);
      await fs.copyFile(historicalPath, filePath);
      return { filePath, record: null };
    } catch {}
  }
  if (!isPublicHttpUrl(videoUrl)) {
    const error = new Error("Workflow video URL is not accessible.");
    error.statusCode = 400;
    throw error;
  }
  const downloaded = await downloadRemoteFileToBuffer(videoUrl, { label: "workflow video", maxBytes: 300 * 1024 * 1024 });
  const ext = videoExtFromMime(downloaded.mime, videoUrl) || ".mp4";
  const fileName = `${storagePathSegment(cleanTaskId || `workflow-${index}`)}-source-${index + 1}${ext}`;
  const filePath = path.join(workspace, fileName);
  await fs.writeFile(filePath, downloaded.bytes);
  return { filePath, record: null };
}

async function handleWorkflowExtractFrame(req, res) {
  const auth = await requireUser(req, res);
  if (!auth) return;
  const body = await readJson(req);
  const workspace = await createGeneratedMediaWorkspace(`workflow-frame-${randomId("job")}`);
  try {
    const taskId = String(body.taskId || "").trim();
    const videoUrl = String(body.videoUrl || "").trim();
    const resolved = await workflowVideoFileFromInput(auth, { taskId, videoUrl, workspace });
    const duration = await probeLocalVideoDurationSeconds(resolved.filePath) || durationSecondsFromValue(body.duration) || 5;
    const seek = Math.max(0.2, Number(duration || 5) - 0.28);
    const safeId = storagePathSegment(taskId || randomId("workflow-frame"));
    const fileName = `${safeId}-last-frame.jpg`;
    const localFramePath = path.join(workspace, fileName);
    const captured = await captureVideoFrameAt(resolved.filePath, localFramePath, seek);
    if (!captured) {
      return sendJson(res, 502, { ok: false, message: "Failed to extract workflow tail frame." });
    }
    const frameBytes = await fs.readFile(localFramePath);
    const upload = await uploadStaticAssetToObjectStorage({
      key: objectStoragePath("generated", "images", fileName),
      bytes: frameBytes,
      mime: "image/jpeg",
    });
    await verifyObjectStorageMedia(upload, { expectedBytes: frameBytes.length, label: "Workflow tail frame" });
    return sendJson(res, 200, {
      ok: true,
      frameUrl: upload.publicUrl,
      localFrameUrl: "",
      publicFrameUrl: upload.publicUrl,
      storageKey: upload.key || "",
      storageProvider: upload.provider || objectStorageProvider(),
      duration,
      seek,
    });
  } catch (error) {
    return sendJson(res, error.statusCode || 500, { ok: false, message: error.message || "Failed to extract workflow frame." });
  } finally {
    await removeGeneratedMediaWorkspace(workspace);
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
  const workspace = await createGeneratedMediaWorkspace(`workflow-compose-${randomId("job")}`);
  try {
    const inputs = [];
    for (let index = 0; index < count; index += 1) {
      const resolved = await workflowVideoFileFromInput(auth, {
        taskId: taskIds[index] || "",
        videoUrl: videoUrls[index] || "",
        index,
        workspace,
      });
      inputs.push(resolved.filePath);
    }
    const outputId = randomId("workflow");
    const listPath = path.join(workspace, `${outputId}.txt`);
    const localVideoPath = path.join(workspace, `${outputId}.mp4`);
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
    const poster = await createGeneratedVideoPoster(outputId, localVideoPath, { directory: workspace });
    const cdn = await uploadGeneratedMediaToObjectStorage({
      taskId: outputId,
      localVideoPath,
      localPosterPath: poster.localPosterPath,
      force: true,
    });
    if (!cdn.cdnVideoUrl || !cdn.storageKey) {
      throw Object.assign(new Error(cdn.cdnError || "Workflow composition was not persisted to object storage."), { statusCode: 502 });
    }
    return sendJson(res, 200, {
      ok: true,
      videoUrl: cdn.cdnVideoUrl,
      localVideoUrl: "",
      posterUrl: cdn.cdnPosterUrl || "",
      localPosterUrl: "",
      storageKey: cdn.storageKey,
      posterStorageKey: cdn.posterStorageKey || "",
      taskId: outputId,
      count,
    });
  } catch (error) {
    return sendJson(res, error.statusCode || 500, { ok: false, message: error.message || "Failed to compose workflow output." });
  } finally {
    await removeGeneratedMediaWorkspace(workspace);
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
  if (auth.quarantined) return sendJson(res, 403, { ok: false, code: "ACCOUNT_QUARANTINED", message: "This account is under security review. Please contact support." });
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
  const text = String(value || "").trim();
  if (!text) return "";
  let parsed;
  try {
    parsed = new URL(text, "https://local.invalid");
  } catch {
    return "";
  }
  if (!/^\/assets\/generated\/locked-previews\/[a-z0-9_-]+\.jpg$/i.test(parsed.pathname)) return "";
  return isPublicHttpUrl(text) ? parsed.toString() : parsed.pathname;
}

function undressLockedPreviewFile(taskId = "") {
  const safeTaskId = String(taskId || randomId("locked-preview")).replace(/[^a-z0-9_-]/gi, "_");
  const fileName = `${safeTaskId}.jpg`;
  return { fileName, publicPath: `/assets/generated/locked-previews/${fileName}` };
}

async function createUndressLockedPreview(taskId, sourceImagePath, { workspace = "" } = {}) {
  if (!sourceImagePath) throw new Error("Locked preview source image is required.");
  const ownWorkspace = !workspace;
  workspace = workspace || await createGeneratedMediaWorkspace(`locked-preview-${taskId || "image"}`);
  const preview = undressLockedPreviewFile(taskId);
  const tempPath = path.join(workspace, `preview-${process.pid}-${Date.now()}.jpg`);
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
    const bytes = await fs.readFile(tempPath);
    const upload = await uploadStaticAssetToObjectStorage({
      key: objectStoragePath("generated", "locked-previews", preview.fileName),
      bytes,
      mime: "image/jpeg",
    });
    await verifyObjectStorageMedia(upload, { expectedBytes: bytes.length, label: "Locked result preview" });
    return {
      lockedPreviewPath: "",
      lockedPreviewUrl: upload.publicUrl,
      lockedPreviewStorageKey: upload.key || "",
      lockedPreviewStorageProvider: upload.provider || objectStorageProvider(),
    };
  } finally {
    await fs.rm(tempPath, { force: true }).catch(() => {});
    if (ownWorkspace) await removeGeneratedMediaWorkspace(workspace);
  }
}

async function existingUndressLockedImagePath(record = {}, workspace = "") {
  if (!workspace) throw new Error("Locked image workspace is required.");
  const protectedKey = String(record.storageKey || record.imageStorageKey || "").trim();
  if (protectedKey && objectStorageEnabled()) {
    const fileName = `protected-${storagePathSegment(record.taskId || "image")}${imageExtFromMime(record.imageMime || record.mime || "image/png")}`;
    const filePath = path.join(workspace, fileName);
    await downloadOssObject({ key: protectedKey, filePath, maxBytes: 30 * 1024 * 1024, config: OSS });
    return filePath;
  }
  // Transitional read-only support for pre-migration records. The file is
  // copied into the task workspace and is never written to a durable path.
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
      const copiedPath = path.join(workspace, `historical-${path.basename(filePath)}`);
      await fs.copyFile(filePath, copiedPath);
      return copiedPath;
    } catch {}
  }
  return "";
}

async function ensureUndressLockedPreview(record = {}) {
  const isUndressRecord = String(record.source || "").startsWith("undress-tool-")
    || String(record.kind || "").includes("tool-undress");
  if (!isUndressRecord || record.resultLocked !== true || !isSucceededStatus(record.status)) return record;

  if (publicUndressLockedPreviewUrl(record.lockedPreviewUrl)) return record;
  const workspace = await createGeneratedMediaWorkspace(`locked-unlock-${record.taskId || "image"}`);
  try {
    const sourceImagePath = await existingUndressLockedImagePath(record, workspace);
    if (!sourceImagePath) return record;
    const preview = await createUndressLockedPreview(record.taskId, sourceImagePath, { workspace });
    return await upsertGenerationRecord({ taskId: record.taskId, ...preview });
  } catch (error) {
    console.warn("[undress-locked-preview-failed]", record.taskId, error.message || error);
    return record;
  } finally {
    await removeGeneratedMediaWorkspace(workspace);
  }
}

async function publishVideoToolInput(filePath, taskId, index) {
  const fileName = `${storagePathSegment(taskId)}-input-${index + 1}.mp4`;
  if (!objectStorageEnabled()) throw new Error("Video tool inputs require object storage.");
  const upload = await uploadStaticAssetToObjectStorage({
    key: objectStoragePath("generated", "video-inputs", fileName),
    filePath,
    mime: videoMimeFromPath(filePath),
  });
  await verifyObjectStorageMedia(upload, { label: "Video tool input" });
  return { url: upload.publicUrl, storageKey: upload.key || "" };
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
  const workspace = await createGeneratedMediaWorkspace(`video-stitch-${taskId}`);
  try {
    const listPath = path.join(workspace, `${storagePathSegment(taskId)}-segments.txt`);
    const localVideoPath = path.join(workspace, videoFileName(taskId));
    const concatList = inputPaths.map((filePath) => `file '${String(filePath).replace(/'/g, "'\\''")}'`).join("\n");
    await fs.writeFile(listPath, concatList, "utf8");
    await execFileQuiet("ffmpeg", [
      "-y", "-f", "concat", "-safe", "0", "-i", listPath,
      "-map", "0:v:0", "-map", "0:a?",
      "-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-pix_fmt", "yuv420p",
      "-c:a", "aac", "-b:a", "128k", "-movflags", "+faststart", localVideoPath,
    ], { timeout: 30 * 60 * 1000 });
    const poster = await createGeneratedVideoPoster(taskId, localVideoPath, { directory: workspace });
    const cdn = await uploadGeneratedMediaToObjectStorage({
      taskId,
      localVideoPath,
      localPosterPath: poster.localPosterPath,
      force: true,
    });
    if (!cdn.cdnVideoUrl || !cdn.storageKey) {
      throw Object.assign(new Error(cdn.cdnError || "Stitched video was not persisted to object storage."), { statusCode: 502 });
    }
    return {
      localVideoPath: "",
      localVideoUrl: "",
      localPosterPath: "",
      localPosterUrl: "",
      playbackOptimizedAt: new Date().toISOString(),
      cdnVideoUrl: cdn.cdnVideoUrl,
      cdnPosterUrl: cdn.cdnPosterUrl || "",
      storageProvider: cdn.storageProvider || objectStorageProvider(),
      storageKey: cdn.storageKey,
      posterStorageProvider: cdn.posterStorageProvider || "",
      posterStorageKey: cdn.posterStorageKey || "",
      cdnError: cdn.cdnError || "",
    };
  } finally {
    await removeGeneratedMediaWorkspace(workspace);
  }
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

