async function streamVideoFile(req, res, filePath, { useInternalAsset = true } = {}) {
  const stat = await fs.stat(filePath);
  if (useInternalAsset && sendInternalAsset(res, filePath, "video/mp4", stat, { privateCache: true })) return;
  const range = req.headers.range;
  if (range) {
    const match = range.match(/bytes=(\d*)-(\d*)/);
    const start = match?.[1] ? Number(match[1]) : 0;
    const end = match?.[2] ? Number(match[2]) : stat.size - 1;
    const chunkStart = Math.max(0, start);
    const chunkEnd = Math.min(stat.size - 1, end);

    if (chunkStart > chunkEnd || Number.isNaN(chunkStart) || Number.isNaN(chunkEnd)) {
      res.writeHead(416, { "content-range": `bytes */${stat.size}` });
      return res.end();
    }

    res.writeHead(206, {
      "content-type": "video/mp4",
      "content-length": chunkEnd - chunkStart + 1,
      "content-range": `bytes ${chunkStart}-${chunkEnd}/${stat.size}`,
      "accept-ranges": "bytes",
      "cache-control": "private, no-store",
    });
    if (req.method === "HEAD") return res.end();
    return fsSync.createReadStream(filePath, { start: chunkStart, end: chunkEnd }).pipe(res);
  }

  res.writeHead(200, {
    "content-type": "video/mp4",
    "content-length": stat.size,
    "accept-ranges": "bytes",
    "cache-control": "private, no-store",
  });
  if (req.method === "HEAD") return res.end();
  return fsSync.createReadStream(filePath).pipe(res);
}

async function handleStreamUnlockVideo(req, res, token) {
  const payload = parseUnlockStreamToken(token);
  if (!payload) return sendJson(res, 403, { ok: false, message: "Unlock video link expired." });

  const db = await readDb();
  const user = db.users.find((entry) => entry.id === payload.userId && !isSoftDeleted(entry));
  if (!user) return sendJson(res, 401, { ok: false, message: "Please sign in to continue." });
  const directUnlock = await findUserUnlockInDb({
    userId: user.id,
    itemId: payload.itemId,
    sceneId: payload.sceneId,
    sceneEntryId: payload.sceneEntryId || "default",
  });
  const bundleUnlock = dbEnabled() ? await findUserUnlockInDb({
    userId: user.id,
    itemId: payload.itemId,
    sceneId: "__character__",
    sceneEntryId: "bundle",
  }) : null;
  const unlock = directUnlock || bundleUnlock || findUserUnlock(db, user.id, payload.itemId, payload.sceneId, payload.sceneEntryId || "default");
  const member = userHasCreatorMembership(user);

  let config = await readAppConfig();
  config.homeVideo = normalizeHomeVideo(config.homeVideo || {});
  const item = findHomeVideoItem(config.homeVideo, payload.itemId);
  const match = item ? (findCharacterVideoForItem(item, payload.sceneId, payload.sceneEntryId || "default") || findUnlockVideoForItem(item, payload.sceneId, payload.sceneEntryId || "default")) : null;
  if (!match) return sendJson(res, 404, { ok: false, message: "Unlock video not found." });
  if (!member && !unlock) {
    return sendJson(res, 403, { ok: false, code: "MEMBERSHIP_REQUIRED", message: "Creator Membership is required." });
  }

  const videoUrl = getUnlockVideoUrl(match.entry);
  if (!videoUrl) return sendJson(res, 409, { ok: false, message: "Unlock video is still generating." });
  if (/^https?:\/\//i.test(videoUrl)) return res.writeHead(302, { location: videoUrl }).end();

  const localPath = safeAssetPathFromUrl(videoUrl);
  if (!localPath) return sendJson(res, 403, { ok: false, message: "Forbidden." });
  const contentType = mimeTypes.get(path.extname(localPath).toLowerCase()) || "";
  if (!contentType.startsWith("video/")) return sendJson(res, 403, { ok: false, message: "Forbidden." });
  return streamVideoFile(req, res, localPath);
}

async function handleStreamPublicGameVideo(req, res, token) {
  const payload = parseUnlockStreamToken(token);
  if (!payload || payload.userId !== "__game_public__") {
    return sendJson(res, 403, { ok: false, message: "Video link expired." });
  }

  let config = await readAppConfig();
  config.homeVideo = normalizeHomeVideo(config.homeVideo || {});
  const item = findHomeVideoItem(config.homeVideo, payload.itemId);
  const videos = item ? publicCharacterVideoList(item) : [];
  const first = videos[0] || null;
  if (!item || !first) return sendJson(res, 404, { ok: false, message: "Video not found." });
  const firstEntry = first.entry || {};
  const firstKey = first.key || makeSceneVideoKey(firstEntry.sceneId, firstEntry.sceneEntryId || "default");
  const matchesFirst = String(firstEntry.sceneId || "") === String(payload.sceneId || "")
    && String(firstEntry.sceneEntryId || "default") === String(payload.sceneEntryId || "default")
    && (!payload.videoKey || String(payload.videoKey) === String(firstKey));
  if (!matchesFirst) return sendJson(res, 403, { ok: false, message: "Unlock required." });

  const videoUrl = getUnlockVideoUrl(firstEntry);
  if (!videoUrl) return sendJson(res, 409, { ok: false, message: "Video is unavailable." });
  if (/^https?:\/\//i.test(videoUrl)) return res.writeHead(302, { location: videoUrl }).end();

  const localPath = safeAssetPathFromUrl(videoUrl);
  if (!localPath) return sendJson(res, 403, { ok: false, message: "Forbidden." });
  const contentType = mimeTypes.get(path.extname(localPath).toLowerCase()) || "";
  if (!contentType.startsWith("video/")) return sendJson(res, 403, { ok: false, message: "Forbidden." });
  return streamVideoFile(req, res, localPath, { useInternalAsset: false });
}

async function handleUploadUserAsset(req, res) {
  const auth = await requireUser(req, res);
  if (!auth) return;
  const uploadRate = await authRateLimit(req, {
    action: "user_asset_upload",
    limit: 120,
    windowMs: 10 * 60_000,
    includeAccount: auth.user.id,
    includeIp: false,
  });
  if (!uploadRate.ok) return authRateLimitedResponse(res, uploadRate);

  const body = await readJson(req, JSON_MEDIA_BODY_MAX_BYTES);
  const uploadProvider = normalizeAdvancedProvider(body.provider || "");
  const publicUrl = String(body.url || body.imageUrl || body.videoUrl || body.audioUrl || "").trim();
  if (publicUrl) {
    let userAsset = await createUserMediaAssetFromPublicUrl(auth.db, auth.user, {
      url: publicUrl,
      name: body.name || body.fileName || "Upload",
      fileName: body.fileName || body.name || "",
      durationSeconds: firstPresent(body.durationSeconds, body.duration, body.videoDurationSeconds, body.audioDurationSeconds),
      provider: uploadProvider,
    });
    if (isVegaProvider(uploadProvider)) {
      userAsset = await ensureVegaPublicUrlForUserAsset(auth.db, userAsset);
    }
    return sendJson(res, 200, { ok: true, asset: publicUserAsset(userAsset) });
  }

  let { mime, bytes } = decodeWanMediaDataUrl(body.dataUrl || "");
  const fileName = String(body.fileName || body.name || "");
  if (mime === "application/octet-stream") {
    const inferredDocumentMime = documentMimeFromKnownPath(fileName);
    if (!inferredDocumentMime) return sendJson(res, 400, { ok: false, message: "A document file extension is required." });
    mime = inferredDocumentMime;
  }
  const isDocument = WAN30_DOCUMENT_MIMES.has(mime) && !mime.startsWith("image/") && !mime.startsWith("video/") && !mime.startsWith("audio/");
  if (isDocument && uploadProvider !== "wan30") {
    return sendJson(res, 400, { ok: false, message: "Document assets are currently supported only for Wan 3.0." });
  }
  if (!mime.startsWith("image/") && !mime.startsWith("video/") && !mime.startsWith("audio/") && !isDocument) {
    return sendJson(res, 400, { ok: false, message: "Only image, video, audio, or Wan 3.0 document assets are supported." });
  }
  const limits = userMediaUploadLimits(uploadProvider);
  const maxBytes = isDocument ? WAN30_DOCUMENT_UPLOAD_MAX_BYTES : mime.startsWith("image/") ? limits.image : mime.startsWith("audio/") ? limits.audio : limits.video;
  let userAsset = await createUserMediaAssetFromBytes(auth.db, auth.user, {
    bytes,
    mime,
    name: body.name || "Upload",
    fileName,
    maxBytes,
    durationSeconds: firstPresent(body.durationSeconds, body.duration, body.videoDurationSeconds, body.audioDurationSeconds),
  });
  if (isVegaProvider(uploadProvider)) {
    userAsset = await ensureVegaPublicUrlForUserAsset(auth.db, userAsset);
  }
  return sendJson(res, 200, { ok: true, asset: publicUserAsset(userAsset) });
}

function decodedUploadFileName(value = "") {
  const encoded = String(value || "").trim();
  if (!encoded) return "";
  try {
    return decodeURIComponent(encoded);
  } catch {
    return encoded;
  }
}

async function handleUploadVideoToolAsset(req, res) {
  const auth = await requireUser(req, res);
  if (!auth) return;
  if (!dbEnabled()) {
    return sendJson(res, 503, { ok: false, message: "Video tool uploads require database storage." });
  }
  const chunkRate = await authRateLimit(req, {
    action: "video_tool_upload_chunk",
    limit: 300,
    windowMs: 10 * 60_000,
    includeAccount: auth.user.id,
    includeIp: false,
  });
  if (!chunkRate.ok) return authRateLimitedResponse(res, chunkRate);

  const fileName = decodedUploadFileName(req.headers["x-file-name"] || "");
  const declaredMime = String(req.headers["content-type"] || "").split(";")[0].trim().toLowerCase();
  const inferredMime = imageMimeFromKnownPath(fileName) || videoMimeFromKnownPath(fileName);
  const rawMime = declaredMime && declaredMime !== "application/octet-stream" ? declaredMime : inferredMime;
  const mime = rawMime === "image/jpg" ? "image/jpeg" : rawMime;
  const supportedImageMimes = new Set(["image/jpeg", "image/png", "image/webp", "image/bmp"]);
  const supportedVideoMimes = new Set(["video/mp4", "video/webm", "video/quicktime", "video/x-m4v"]);
  const isImage = supportedImageMimes.has(mime);
  const isVideo = supportedVideoMimes.has(mime);
  if (!isImage && !isVideo) {
    return sendJson(res, 400, { ok: false, message: "Upload a JPG, PNG, WebP, BMP, MP4, WebM, MOV, or M4V file." });
  }

  const maxBytes = isImage ? IMAGE_UPLOAD_MAX_BYTES : VIDEO_TOOL_SOURCE_UPLOAD_MAX_BYTES;
  const uploadId = String(req.headers["x-upload-id"] || "").trim();
  const chunkIndex = Number(req.headers["x-chunk-index"] || 0);
  const chunkCount = Number(req.headers["x-chunk-count"] || 1);
  const declaredFileSize = Number(req.headers["x-file-size"] || req.headers["content-length"] || 0);
  if (!/^[a-z0-9-]{16,80}$/i.test(uploadId)) {
    return sendJson(res, 400, { ok: false, message: "Upload id is invalid." });
  }
  if (!Number.isInteger(chunkIndex) || !Number.isInteger(chunkCount) || chunkIndex < 0 || chunkCount < 1 || chunkCount > VIDEO_TOOL_UPLOAD_CHUNK_MAX_COUNT || chunkIndex >= chunkCount) {
    return sendJson(res, 400, { ok: false, message: "Upload chunk is invalid." });
  }
  if (!Number.isFinite(declaredFileSize) || declaredFileSize <= 0 || declaredFileSize > maxBytes) {
    req.resume();
    return sendJson(res, declaredFileSize > maxBytes ? 413 : 400, {
      ok: false,
      message: `${isImage ? "Image" : "Video"} must be ${Math.round(maxBytes / 1024 / 1024)}MB or smaller.`,
    });
  }
  const contentLength = Number(req.headers["content-length"] || 0);
  if (Number.isFinite(contentLength) && contentLength > VIDEO_TOOL_UPLOAD_CHUNK_MAX_BYTES) {
    req.resume();
    return sendJson(res, 413, {
      ok: false,
      message: `Upload chunks must be ${Math.round(VIDEO_TOOL_UPLOAD_CHUNK_MAX_BYTES / 1024 / 1024)}MB or smaller.`,
    });
  }

  const dir = path.join(USER_UPLOAD_DIR, auth.user.id);
  const uploadPartsDir = path.join(VIDEO_TOOL_UPLOAD_PART_DIR, storagePathSegment(auth.user.id), uploadId);
  const chunkPath = path.join(uploadPartsDir, `${String(chunkIndex).padStart(3, "0")}.part`);
  let fileHandle = null;
  let localPath = "";
  let chunkByteLength = 0;

  try {
    await fs.mkdir(uploadPartsDir, { recursive: true });
    fileHandle = await fs.open(chunkPath, "w");
    for await (const chunk of req) {
      const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      chunkByteLength += bytes.byteLength;
      if (chunkByteLength > VIDEO_TOOL_UPLOAD_CHUNK_MAX_BYTES) {
        const error = new Error(`Upload chunks must be ${Math.round(VIDEO_TOOL_UPLOAD_CHUNK_MAX_BYTES / 1024 / 1024)}MB or smaller.`);
        error.statusCode = 413;
        throw error;
      }
      await fileHandle.write(bytes);
    }
    await fileHandle.close();
    fileHandle = null;
    if (!chunkByteLength) {
      const error = new Error("Uploaded file is empty.");
      error.statusCode = 400;
      throw error;
    }
    if (chunkIndex < chunkCount - 1) {
      return sendJson(res, 200, {
        ok: true,
        pending: true,
        uploadId,
        receivedChunks: chunkIndex + 1,
        chunkCount,
      });
    }
    const completeRate = await authRateLimit(req, {
      action: "video_tool_upload_complete",
      limit: 30,
      windowMs: 60 * 60_000,
      includeAccount: auth.user.id,
      includeIp: false,
    });
    if (!completeRate.ok) return authRateLimitedResponse(res, completeRate);

    const partPaths = Array.from({ length: chunkCount }, (_, index) => path.join(uploadPartsDir, `${String(index).padStart(3, "0")}.part`));
    const partStats = [];
    for (const partPath of partPaths) {
      try {
        partStats.push(await fs.stat(partPath));
      } catch {
        const error = new Error("Upload is incomplete. Please select the file again.");
        error.statusCode = 409;
        throw error;
      }
    }
    const byteLength = partStats.reduce((sum, stat) => sum + Number(stat.size || 0), 0);
    if (byteLength !== declaredFileSize || byteLength > maxBytes) {
      const error = new Error(byteLength > maxBytes
        ? `${isImage ? "Image" : "Video"} must be ${Math.round(maxBytes / 1024 / 1024)}MB or smaller.`
        : "Uploaded file size does not match the selected file.");
      error.statusCode = byteLength > maxBytes ? 413 : 400;
      throw error;
    }

    const assetId = randomId("asset");
    const fallbackExt = isImage ? imageExtFromMime(mime) : videoExtFromMime(mime, fileName);
    const storedFileName = `${assetId}${mediaExtFromMime(mime, fileName) || fallbackExt}`;
    localPath = path.join(dir, storedFileName);
    await fs.mkdir(dir, { recursive: true });
    fileHandle = await fs.open(localPath, "wx");
    for (const partPath of partPaths) {
      for await (const partChunk of fsSync.createReadStream(partPath)) {
        await fileHandle.write(partChunk);
      }
    }
    await fileHandle.close();
    fileHandle = null;

    const imageBytes = isImage ? await fs.readFile(localPath) : null;
    const imageDimensions = imageBytes ? imageDimensionsFromBuffer(imageBytes) : null;
    const videoDimensions = isVideo ? await probeLocalVideoDimensions(localPath) : null;
    const suppliedDuration = durationSecondsFromValue(req.headers["x-duration-seconds"] || 0);
    const durationSeconds = isVideo
      ? durationSecondsFromValue(videoDimensions?.durationSeconds || await probeLocalVideoDurationSeconds(localPath) || suppliedDuration)
      : 0;
    if (isImage && (!imageDimensions?.width || !imageDimensions?.height)) {
      const error = new Error("Uploaded image could not be read.");
      error.statusCode = 400;
      throw error;
    }
    if (isVideo && (!videoDimensions?.width || !videoDimensions?.height || !durationSeconds)) {
      const error = new Error("Uploaded video could not be read.");
      error.statusCode = 400;
      throw error;
    }

    const localUrl = `/assets/user-uploads/${auth.user.id}/${storedFileName}`;
    const mirrorBytes = imageBytes || await fs.readFile(localPath);
    const objectStorage = await uploadLocalAssetMirrorToObjectStorage({ localUrl, bytes: mirrorBytes, mime });
    if (objectStorageEnabled() && objectStorage.error) {
      const error = new Error(`Object storage upload failed: ${objectStorage.error}`);
      error.statusCode = 502;
      throw error;
    }
    const displayName = String(fileName || (isVideo ? "Source video" : "Source image"))
      .split(/[\\/]/)
      .pop()
      .slice(0, 60) || (isVideo ? "Source video" : "Source image");
    const now = new Date().toISOString();
    const userAsset = {
      id: assetId,
      userId: auth.user.id,
      name: displayName,
      mime,
      localUrl,
      publicUrl: objectStorage.publicUrl || publicUrlForAssetPath(localUrl),
      cdnUrl: objectStorage.publicUrl || "",
      objectStorageKey: objectStorage.key || "",
      r2Key: objectStorage.key || "",
      objectStorageError: objectStorage.error || "",
      assetUri: "",
      width: imageDimensions?.width || 0,
      height: imageDimensions?.height || 0,
      videoWidth: videoDimensions?.width || 0,
      videoHeight: videoDimensions?.height || 0,
      imageType: imageDimensions?.type || "",
      durationSeconds,
      hidden: true,
      meta: { videoToolUpload: true, byteLength },
      createdAt: now,
      updatedAt: now,
      deletedAt: "",
    };
    auth.db.userAssets.unshift(userAsset);
    await upsertUserAssetInDb(userAsset);
    await fs.rm(uploadPartsDir, { recursive: true, force: true }).catch(() => {});
    return sendJson(res, 200, { ok: true, asset: publicUserAsset(userAsset) });
  } catch (error) {
    if (fileHandle) await fileHandle.close().catch(() => {});
    if (localPath) await fs.rm(localPath, { force: true }).catch(() => {});
    await fs.rm(chunkPath, { force: true }).catch(() => {});
    if (chunkIndex === chunkCount - 1) await fs.rm(uploadPartsDir, { recursive: true, force: true }).catch(() => {});
    throw error;
  }
}

async function handleUploadSeedanceCharacter(req, res) {
  const auth = await requireUser(req, res);
  if (!auth) return;
  if (!USE_GATEWAY_UPSTREAM) {
    try {
      requireValue("ARK_API_KEY", ARK_API_KEY);
      requireValue("BYTEPLUS_ACCESS_KEY_ID or VOLC_ACCESS_KEY_ID", ARK_OPENAPI.accessKey);
      requireValue("BYTEPLUS_SECRET_ACCESS_KEY or VOLC_ACCESS_KEY_SECRET", ARK_OPENAPI.secretKey);
    } catch (error) {
      return sendJson(res, error.statusCode || 503, {
        ok: false,
        code: "SEEDANCE_ASSET_UPLOAD_NOT_CONFIGURED",
        message: "Seedance character upload is not configured.",
      });
    }
  }

  const body = await readJson(req, JSON_MEDIA_BODY_MAX_BYTES);
  let userAsset = null;
  const assetId = String(firstPresent(body.assetId, body.userAssetId, body.imageAssetId, "") || "").trim();
  if (assetId) {
    userAsset = (auth.db.userAssets || []).find((asset) => asset.id === assetId && asset.userId === auth.user.id && !isSoftDeleted(asset));
    if (!userAsset) return sendJson(res, 404, { ok: false, message: "Seedance character image not found." });
  } else {
    const publicUrl = String(firstPresent(body.url, body.imageUrl, body.characterImageUrl, "") || "").trim();
    if (publicUrl) {
      userAsset = await createUserMediaAssetFromPublicUrl(auth.db, auth.user, {
        url: publicUrl,
        name: body.name || body.fileName || "Seedance character image1",
        fileName: body.fileName || body.name || "image1.png",
      });
    } else if (body.dataUrl) {
      const { mime, bytes } = decodeWanMediaDataUrl(body.dataUrl);
      if (!mime.startsWith("image/")) {
        return sendJson(res, 400, { ok: false, message: "Seedance character upload only accepts image dataUrl." });
      }
      userAsset = await createUserMediaAssetFromBytes(auth.db, auth.user, {
        bytes,
        mime,
        name: body.name || "Seedance character image1",
        fileName: body.fileName || body.name || "image1.png",
        maxBytes: IMAGE_UPLOAD_MAX_BYTES,
      });
    }
  }

  if (!userAsset) {
    return sendJson(res, 400, { ok: false, message: "Provide url, imageUrl, dataUrl, or assetId for the Seedance character image." });
  }
  try {
    validateWan27MediaKind(userAsset, "image", "Seedance character image");
  } catch (error) {
    return sendJson(res, 400, { ok: false, message: error.message || "Seedance character image must be an image." });
  }

  let prepared = { asset: userAsset, referenceAssetUri: userAsset.assetUri || "", imageUrl: userAsset.publicUrl || userAsset.localUrl || "" };
  if (!USE_GATEWAY_UPSTREAM) {
    prepared = await prepareSeedanceReferenceAsset(auth.db, userAsset, false);
  }
  const finalAsset = prepared.asset || userAsset;
  const fileName = String(body.fileName || finalAsset.name || "image1.png").trim() || "image1.png";
  const reference = {
    assetId: finalAsset.id,
    assetUri: prepared.referenceAssetUri || finalAsset.assetUri || "",
    fileName,
    name: String(body.name || finalAsset.name || "image1").trim() || "image1",
    imageLabel: "Image 1",
  };
  return sendJson(res, 200, {
    ok: true,
    asset: publicUserAsset(finalAsset),
    reference,
    referenceImages: [{
      assetId: reference.assetId,
      assetUri: reference.assetUri,
      fileName: reference.fileName,
      name: reference.name,
    }],
    generateRequest: {
      provider: "seedance",
      seedanceMode: "reference_video",
      prompt: "Use Image 1 as the main character. Keep the same identity and generate a cinematic shot.",
      referenceImages: [{ assetId: reference.assetId, fileName: reference.fileName }],
      ratio: "9:16",
      resolution: "720p",
      duration: 5,
      params: { generate_audio: true },
    },
  });
}

function generationRecordAssetName(record = {}) {
  const base = record.templateTitle || record.sceneEntryName || record.sceneName || record.companionName || record.kind || record.taskId || "Generated video";
  return String(base || "Generated video").trim().slice(0, 60) || "Generated video";
}

async function bytesForGenerationRecordVideo(record = {}) {
  const localUrl = record.localVideoUrl || "";
  if (localUrl && !/^https?:\/\//i.test(localUrl)) {
    const localPath = safeAssetPathFromUrl(localUrl);
    if (!localPath) {
      const error = new Error("Generation video path is not allowed.");
      error.statusCode = 403;
      throw error;
    }
    return {
      bytes: await fs.readFile(localPath),
      mime: videoMimeFromPath(localPath),
      fileName: path.basename(localPath),
    };
  }
  const videoUrl = generationRecordVideoUrl(record);
  if (!videoUrl) {
    const error = new Error("Generation record has no video result.");
    error.statusCode = 400;
    throw error;
  }
  if (!/^https?:\/\//i.test(videoUrl)) {
    const localPath = safeAssetPathFromUrl(videoUrl);
    if (!localPath) {
      const error = new Error("Generation video path is not allowed.");
      error.statusCode = 403;
      throw error;
    }
    return {
      bytes: await fs.readFile(localPath),
      mime: videoMimeFromPath(localPath),
      fileName: path.basename(localPath),
    };
  }
  const downloaded = await downloadRemoteFileToBuffer(videoUrl, {
    label: "generation video",
    maxBytes: 30 * 1024 * 1024,
  });
  return {
    bytes: downloaded.bytes,
    mime: downloaded.mime && downloaded.mime.startsWith("video/") ? downloaded.mime : videoMimeFromPath(videoUrl),
    fileName: path.basename(new URL(videoUrl).pathname) || `${record.taskId || "generated"}.mp4`,
  };
}

async function bytesForGenerationRecordImage(record = {}) {
  const localUrl = record.localImageUrl || record.imageResultUrl || "";
  if (localUrl && !/^https?:\/\//i.test(localUrl)) {
    const localPath = safeAssetPathFromUrl(localUrl);
    if (!localPath) {
      const error = new Error("Generation image path is not allowed.");
      error.statusCode = 403;
      throw error;
    }
    return {
      bytes: await fs.readFile(localPath),
      mime: imageMimeFromPath(localPath),
      fileName: path.basename(localPath),
    };
  }
  const imageUrl = generationRecordImageUrl(record);
  if (!imageUrl) {
    const error = new Error("Generation record has no image result.");
    error.statusCode = 400;
    throw error;
  }
  if (!/^https?:\/\//i.test(imageUrl)) {
    const localPath = safeAssetPathFromUrl(imageUrl);
    if (!localPath) {
      const error = new Error("Generation image path is not allowed.");
      error.statusCode = 403;
      throw error;
    }
    return {
      bytes: await fs.readFile(localPath),
      mime: imageMimeFromPath(localPath),
      fileName: path.basename(localPath),
    };
  }
  const downloaded = await downloadRemoteFileToBuffer(imageUrl, {
    label: "generation image",
    maxBytes: 20 * 1024 * 1024,
  });
  const pathname = new URL(imageUrl).pathname;
  const mime = downloaded.mime && downloaded.mime.startsWith("image/")
    ? downloaded.mime
    : imageMimeFromKnownPath(pathname) || "image/png";
  return {
    bytes: downloaded.bytes,
    mime,
    fileName: path.basename(pathname) || `${record.taskId || "generated"}${imageExtFromMime(mime)}`,
  };
}

async function handleAddGenerationRecordToAssets(req, res, taskId) {
  const auth = await requireUser(req, res);
  if (!auth) return;
  const records = await readGenerationRecords();
  const record = records.find((entry) => entry.taskId === taskId && entry.userId === auth.user.id && isUserVisibleGenerationRecord(entry));
  if (!record) return sendJson(res, 404, { ok: false, message: "Generation record not found." });
  if (record.resultLocked === true) return sendJson(res, 423, { ok: false, code: "RESULT_LOCKED", message: "Unlock this result first." });
  if (!isSucceededStatus(record.status)) return sendJson(res, 400, { ok: false, message: "Generation is not completed yet." });
  const existingAssetId = String(record.resultAssetId || "").trim();
  if (existingAssetId) {
    const existingAsset = (auth.db.userAssets || []).find((entry) => entry.id === existingAssetId && entry.userId === auth.user.id && !isSoftDeleted(entry));
    if (existingAsset) return sendJson(res, 200, { ok: true, asset: publicUserAsset(existingAsset), alreadyAdded: true });
  }
  const isImageRecord = Boolean(generationRecordImageUrl(record)) && !generationRecordVideoUrl(record);
  const media = isImageRecord ? await bytesForGenerationRecordImage(record) : await bytesForGenerationRecordVideo(record);
  const fileName = media.fileName || (isImageRecord ? `${taskId}${imageExtFromMime(media.mime)}` : `${taskId}.mp4`);
  const asset = await createUserMediaAssetFromBytes(auth.db, auth.user, {
    bytes: media.bytes,
    mime: isImageRecord
      ? (media.mime && media.mime.startsWith("image/") ? media.mime : "image/png")
      : (media.mime && media.mime.startsWith("video/") ? media.mime : "video/mp4"),
    name: generationRecordAssetName(record),
    fileName,
    maxBytes: 30 * 1024 * 1024,
  });
  if (isImageRecord) {
    if (String(record.kind || "").includes("character") || String(record.source || "").includes("character")) {
      asset.sourceCharacterId = record.characterId || "";
      asset.characterPrompt = record.prompt || "";
      asset.characterFinalPrompt = record.finalPrompt || record.prompt || "";
      asset.characterModel = record.model || "";
      asset.characterTaskId = record.upstreamTaskId || record.taskId || "";
      asset.characterParams = record.params || null;
    }
    if (record.userAssetId) asset.sourceAssetId = record.userAssetId;
    if (Array.isArray(record.userAssetIds)) asset.sourceAssetIds = record.userAssetIds;
    if (record.prompt) asset.modifyPrompt = record.prompt;
    if (record.model) asset.modifyModel = record.model;
    if (record.upstreamTaskId || record.taskId) asset.modifyTaskId = record.upstreamTaskId || record.taskId;
    if (record.params) asset.modifyParams = record.params;
    asset.updatedAt = new Date().toISOString();
    auth.db.userAssets = (auth.db.userAssets || []).map((entry) => (entry.id === asset.id ? asset : entry));
    if (dbEnabled()) await upsertUserAssetInDb(asset);
    else await writeDb(auth.db);
  }
  await updateGenerationRecord(taskId, {
    resultAssetId: asset.id,
    assetAddedAt: new Date().toISOString(),
  }, "history-add-asset");
  return sendJson(res, 200, { ok: true, asset: publicUserAsset(asset) });
}

function publicUserAsset(asset = {}) {
  const mime = String(asset.mime || "").toLowerCase();
  const kind = mime.startsWith("video/") ? "video" : mime.startsWith("audio/") ? "audio" : (WAN30_DOCUMENT_MIMES.has(mime) || documentMimeFromKnownPath(asset.name || asset.fileName)) ? "document" : "image";
  const isCharacterAsset = Boolean(asset.characterPrompt || asset.characterFinalPrompt || asset.characterModel || asset.characterTaskId);
  const rawLocalUrl = String(asset.localUrl || "").trim();
  const readableLocalUrl = (value, { absolute = false } = {}) => localUserUploadDeliveryUrl(value, { absolute }) || value;
  const localUrl = readableLocalUrl(rawLocalUrl);
  const localHttpUrl = localUserUploadDeliveryUrl(rawLocalUrl, { absolute: true })
    || readableLocalUrl(publicUrlForAssetPath(rawLocalUrl), { absolute: true });
  // A user asset may retain both the local ingest copy and an object-storage
  // mirror. Keep the durable public mirror as the primary URL; the signed
  // local URL is only a fallback for files that were never mirrored.
  const rawPublicUrl = String(asset.publicUrl || "").trim();
  const rawCdnUrl = String(asset.cdnUrl || "").trim();
  const storedPublicUrl = isPublicHttpUrl(rawPublicUrl) ? rawPublicUrl : readableLocalUrl(rawPublicUrl);
  const storedCdnUrl = isPublicHttpUrl(rawCdnUrl) ? rawCdnUrl : readableLocalUrl(rawCdnUrl);
  const storedUrl = storedPublicUrl || storedCdnUrl || localHttpUrl;
  const deliveryUrl = signedOssCdnUrlForDelivery(storedUrl, {
    key: asset.storageKey || asset.objectStorageKey || asset.r2Key || "",
  }) || storedPublicUrl || storedCdnUrl || localHttpUrl;
  const localPosterUrl = readableLocalUrl(String(asset.localPosterUrl || "").trim());
  const storedPosterUrl = readableLocalUrl(String(asset.posterUrl || asset.thumbnailUrl || asset.coverUrl || publicUrlForAssetPath(localPosterUrl) || "").trim(), { absolute: isPublicHttpUrl(asset.posterUrl || asset.thumbnailUrl || asset.coverUrl) });
  const deliveryPosterUrl = signedOssCdnUrlForDelivery(storedPosterUrl, {
    key: asset.posterStorageKey || asset.posterObjectStorageKey || asset.posterR2Key || "",
  }) || storedPosterUrl;
  const assetUrls = [];
  const seenAssetUrls = new Set();
  const addAssetUrl = (source, value) => {
    const url = String(value || "").trim();
    if (!url || seenAssetUrls.has(url)) return;
    if (url.startsWith("asset://") || url.startsWith("javascript:") || url.startsWith("file:")) return;
    if (!/^(?:https?:\/\/|\/(?!\/)|data:|blob:)/i.test(url)) return;
    seenAssetUrls.add(url);
    assetUrls.push({ source, url });
  };
  addAssetUrl("delivery", deliveryUrl);
  addAssetUrl("public", storedPublicUrl);
  addAssetUrl("cdn", storedCdnUrl);
  addAssetUrl("local-http", localHttpUrl);
  addAssetUrl("local", localUrl);
  return {
    id: asset.id,
    userId: asset.userId,
    name: asset.name || "Upload",
    kind,
    mime: asset.mime || "",
    localUrl,
    localHttpUrl,
    publicUrl: deliveryUrl,
    cdnUrl: deliveryUrl,
    previewUrl: deliveryUrl,
    posterUrl: deliveryPosterUrl,
    localPosterUrl,
    thumbnailUrl: deliveryPosterUrl,
    coverUrl: deliveryPosterUrl,
    assetUrls,
    durationSeconds: durationSecondsFromValue(firstPresent(asset.durationSeconds, asset.duration)),
    assetUri: kind === "image" ? asset.assetUri || "" : "",
    seedanceAssetUri: kind === "video" ? asset.seedanceVideoAssetUri || "" : kind === "audio" ? asset.seedanceAudioAssetUri || "" : asset.assetUri || "",
    seedanceReady: Boolean(kind === "video" ? asset.seedanceVideoAssetUri : kind === "audio" ? asset.seedanceAudioAssetUri || asset.publicUrl : asset.assetUri),
    isCharacterAsset,
    characterPrompt: asset.characterPrompt || "",
    characterTaskId: asset.characterTaskId || "",
    createdAt: asset.createdAt || "",
    updatedAt: asset.updatedAt || "",
    deletedAt: asset.deletedAt || "",
  };
}

function wan27ImageModifyPricing(config = {}, user = null, options = {}) {
  const pricing = normalizeAdvancedPricing(config.platform?.advancedPricing);
  const imagePricing = pricing.wan27ImagePro || DEFAULT_ADVANCED_PRICING.wan27ImagePro;
  const raw = fixedCnyPricingEstimate(imagePricing.saleCnyPerImage, "wan27_image_modify", {
    purchaseCnyPerImage: imagePricing.purchaseCnyPerImage,
    saleCnyPerImage: imagePricing.saleCnyPerImage,
    model: imagePricing.model || WAN27_IMAGE_PRO_MODEL,
  }, pricing.creditsPerCny);
  return user ? applyUserPricingToEstimate(raw, user, options) : raw;
}

function composeWan27CharacterPrompt(userPrompt = "", { mode = "create" } = {}) {
  const core = String(userPrompt || "").trim();
  if (mode === "take_off") {
    return CHARACTER_TAKE_OFF_PROMPT;
  }
  return core;
}

function firstPosterFromVideoMap(map = {}) {
  if (!map || typeof map !== "object") return "";
  for (const entry of Object.values(map)) {
    const poster = String(entry?.posterUrl || entry?.localPosterUrl || entry?.coverUrl || "").trim();
    if (poster) return poster;
  }
  return "";
}

async function localAssetUrlExists(value = "") {
  let publicPath = normalizePublicAssetPath(value);
  if (!publicPath && isPublicHttpUrl(value)) {
    try {
      const parsed = new URL(value);
      const base = configuredPublicBaseUrl() || "https://123vips.com";
      const baseHost = new URL(base).host;
      if (parsed.host === baseHost) publicPath = normalizePublicAssetPath(parsed.pathname);
    } catch {}
  }
  if (!publicPath || !publicPath.startsWith("/assets/")) return false;
  const filePath = safeAssetPathFromUrl(publicPath);
  if (!filePath) return false;
  try {
    const stat = await fs.stat(filePath);
    return stat.isFile();
  } catch {
    return false;
  }
}

async function systemCharacterImageUrl(item = {}) {
  const candidates = [
    item.sourceImageUrl,
    item.localImageUrl,
    item.posterUrl,
    item.syntheticReferenceLocalUrl,
    item.publicImageUrl,
    item.imageUrl,
    item.coverUrl,
    item.thumbnailUrl,
    firstPosterFromVideoMap(item.homeSceneVideos),
    firstPosterFromVideoMap(item.sceneVideos),
    firstPosterFromVideoMap(item.unlockVideos),
  ];
  for (const candidate of candidates) {
    const value = String(candidate || "").trim();
    if (!value) continue;
    if (await localAssetUrlExists(value)) return value;
    if (isPublicHttpUrl(value) && !isLocalPublicAssetUrl(value)) return value;
  }
  return "";
}

async function handleGenerateUserCharacterImage(req, res) {
  const auth = await requireUser(req, res);
  if (!auth) return;
  if (!await enforceBusinessRateLimit(req, res, auth, { action: "user_character_image_generate", limit: 10, windowMs: 10 * 60_000 })) return;
  if (!USE_GATEWAY_UPSTREAM && !ALIYUN_DASHSCOPE_API_KEY) {
    return sendJson(res, 503, { ok: false, code: "MISSING_ALIYUN_DASHSCOPE_API_KEY", message: "Wan2.7 image generation is not configured." });
  }
  const body = await readJson(req, JSON_MEDIA_BODY_MAX_BYTES);
  const userPrompt = String(body.prompt || "").trim();
  if (!userPrompt) return sendJson(res, 400, { ok: false, message: "Prompt is required." });

  const config = await readAppConfig();
  const pricingConfig = normalizeAdvancedPricing(config.platform?.advancedPricing).wan27ImagePro;
  const imageOptions = wan27ImageRequestOptions(body, {
    defaultModel: pricingConfig.model || WAN27_IMAGE_PRO_MODEL,
    defaultRatio: pricingConfig.defaultRatio || "9:16",
    defaultResolution: pricingConfig.defaultResolution || "2K",
  });
  const { ratio, resolution, model } = imageOptions;
  const pricing = wan27ImageModifyPricing(config, auth.user, pricingContextForAuth(auth));
  const cost = pricing.credits;
  if (auth.user.credits < cost) return sendJson(res, 402, insufficientCreditsPayload(cost, auth.user.credits));
  try {
    assertSubtokenCanSpend(auth, cost);
  } catch (error) {
    return sendJson(res, error.statusCode || 402, error.payload || { ok: false, code: error.code || "SUBTOKEN_UNAVAILABLE", message: error.message });
  }

  const taskId = localGenerationTaskId("char");
  const prompt = composeWan27CharacterPrompt(userPrompt, { mode: "create" });
  const initialRecord = {
    taskId,
    status: "submitting",
    model,
    source: "character-image-generate",
    kind: "character-image",
    provider: "aliyun-wan27-image",
    upstreamSource: USE_GATEWAY_UPSTREAM ? "gateway" : "direct",
    userId: auth.user.id,
    prompt: userPrompt,
    finalPrompt: prompt,
    params: { provider: "wan27-image", action: "character_create", ...exposedWan27ImageParams(imageOptions) },
    ratio,
    resolution,
    preDeductedCredits: cost,
    originalPreDeductedCredits: pricing.originalCredits ?? cost,
    finalCredits: null,
    originalFinalCredits: null,
    userPricingMultiplier: pricing.userPricingMultiplier ?? 1,
    billingStatus: cost > 0 ? "pre_deducted" : "free",
    billingSettledAt: "",
    pricingEstimate: pricing,
    awaitingUpstreamTask: true,
    upstreamPayload: null,
    createResponse: null,
    remoteImageUrl: "",
    localImageUrl: "",
    error: "",
    apiTokenId: auth.tokenRecord?.id || "",
    apiTokenName: auth.tokenRecord?.name || "",
    apiTokenType: auth.tokenRecord?.quotaType || "",
    apiTokenSource: auth.tokenSource || "",
  };
  await updateAssetImageModifyRecord(taskId, initialRecord, "character-image-create");
  if (cost > 0) {
    await chargeUserWithSubtoken(auth, {
      cost,
      type: "character_image_generate",
      taskId,
      meta: { taskId, model, ratio, resolution, baseCredits: pricing.baseCredits, originalCost: pricing.originalCredits, pricingMultiplier: pricing.userPricingMultiplier },
    });
    if (!dbEnabled()) await writeDb(auth.db);
  }

  try {
    const submitted = USE_GATEWAY_UPSTREAM ? await gatewaySubmitWan27ImageEditTask({
      imageUrls: [],
      prompt,
      ratio,
      resolution,
      model,
      input: imageOptions.input,
      parameters: imageOptions.parameters,
    }) : await submitWan27ImageTextGenerate({
      prompt,
      ratio,
      resolution,
      model,
      input: imageOptions.input,
      parameters: imageOptions.parameters,
    });
    const imageUrl = submitted.task.imageUrls[0];
    await updateAssetImageModifyRecord(taskId, {
      upstreamTaskId: submitted.task.taskId || "",
      awaitingUpstreamTask: false,
      status: imageUrl ? (submitted.task.status || "succeeded") : "failed",
      upstreamPayload: submitted.payload,
      createResponse: submitted.raw,
      remoteImageUrl: imageUrl || "",
      error: imageUrl ? "" : (submitted.task.error || "Wan2.7 character image returned no image."),
    }, "character-image-submit");
    if (!imageUrl) {
      const error = new Error(submitted.task.error || "Wan2.7 character image returned no image.");
      error.statusCode = 502;
      error.payload = submitted.raw;
      throw error;
    }
    const savedImage = GENERATED_ASSETS_ON_DEMAND
      ? { localImagePath: "", localImageUrl: "", cdnImageUrl: "", cdnError: "" }
      : await saveRemoteGeneratedImage(taskId, imageUrl);
    await updateAssetImageModifyRecord(taskId, {
      status: "succeeded",
      awaitingUpstreamTask: false,
      imageResultUrl: savedImage.cdnImageUrl || imageUrl,
      localImageUrl: savedImage.localImageUrl,
      localImagePath: savedImage.localImagePath,
      cdnImageUrl: savedImage.cdnImageUrl,
      cdnError: savedImage.cdnError,
      remoteImageUrl: imageUrl,
      finalCredits: cost,
      originalFinalCredits: pricing.originalCredits ?? cost,
      billingStatus: cost > 0 ? "settled" : "free",
      billingSettledAt: new Date().toISOString(),
      error: "",
    }, "character-image-succeeded");
    const latestUser = (auth.db.users || []).find((entry) => entry.id === auth.user.id) || auth.user;
    const publicRecord = publicGenerationRecord(await getGenerationRecord(taskId) || { taskId }, generationRecordResponseOptionsForAuth(auth));
    return sendJson(res, 200, {
      ok: true,
      taskId,
      upstreamTaskId: submitted.task.taskId || "",
      imageUrl: publicRecord.imageResultUrl || savedImage?.localImageUrl || "",
      user: userView(latestUser),
      pricing,
      cost,
      record: publicRecord,
      params: exposedWan27ImageParams(imageOptions),
    });
  } catch (error) {
    const errorInfo = normalizeErrorPayload(error);
    console.warn("[character-image-error]", taskId, errorInfo.message || error.message || error, JSON.stringify(errorInfo.payload || {}).slice(0, 1000));
    if (cost > 0) {
      try {
        const db = await readDb();
        await changeUserCredits(db, auth.user.id, cost, "character_image_generate_refund", { taskId, error: error.message || "Wan2.7 character image failed." });
        await recordSubtokenAdjustment(auth, { taskId, type: "character_image_generate_refund", amount: -cost, meta: { error: error.message || "Wan2.7 character image failed." } });
        if (!dbEnabled()) await writeDb(db);
      } catch (refundError) {
        console.error("[character-image-refund-failed]", refundError.message || refundError);
      }
    }
    await updateAssetImageModifyRecord(taskId, {
      status: "failed",
      awaitingUpstreamTask: false,
      error: errorInfo.message || "Wan2.7 character image failed.",
      code: errorInfo.code || "",
      errorPayload: errorInfo.payload || null,
      createResponse: errorInfo.payload || null,
      finalCredits: 0,
      originalFinalCredits: 0,
      billingStatus: cost > 0 ? "refunded" : "free",
      billingSettledAt: new Date().toISOString(),
      failedAt: new Date().toISOString(),
    }, "character-image-failed");
    return sendJson(res, error.statusCode || 502, {
      ok: false,
      message: error.message || "Wan2.7 character image failed.",
      code: error.code || "",
      taskId,
      record: publicGenerationRecord(await getGenerationRecord(taskId) || { taskId }, generationRecordResponseOptionsForAuth(auth)),
      payload: error.payload || null,
    });
  }
}

async function handleModifySystemCharacterImage(req, res, characterId) {
  const auth = await requireUser(req, res);
  if (!auth) return;
  if (!USE_GATEWAY_UPSTREAM && !ALIYUN_DASHSCOPE_API_KEY) return sendJson(res, 503, { ok: false, message: "DashScope API key is not configured." });
  const config = await readAppConfig();
  config.homeVideo = normalizeHomeVideo(config.homeVideo || {});
  const character = findHomeVideoItem(config.homeVideo, characterId);
  if (!character || isSoftDeleted(character)) return sendJson(res, 404, { ok: false, message: "Character not found." });
  const imageUrl = await systemCharacterImageUrl(character);
  if (!imageUrl) return sendJson(res, 400, { ok: false, message: "Character has no image." });

  const body = await readJson(req);
  const mode = String(body.mode || "modify").trim().toLowerCase();
  const userPrompt = String(body.prompt || "").trim();
  const displayPrompt = mode === "take_off" ? CHARACTER_TAKE_OFF_PROMPT : userPrompt;
  const prompt = composeWan27CharacterPrompt(displayPrompt, {
    mode: mode === "take_off" ? "take_off" : "modify",
  });
  if (mode !== "take_off" && !userPrompt) return sendJson(res, 400, { ok: false, message: "Prompt is required." });

  const pricingConfig = normalizeAdvancedPricing(config.platform?.advancedPricing).wan27ImagePro;
  const imageOptions = wan27ImageRequestOptions(body, {
    defaultModel: pricingConfig.model || WAN27_IMAGE_PRO_MODEL,
    defaultRatio: pricingConfig.defaultRatio || "9:16",
    defaultResolution: pricingConfig.defaultResolution || "2K",
  });
  const { ratio, resolution, model } = imageOptions;
  if (resolution === "4K") {
    return sendJson(res, 400, { ok: false, code: "WAN27_IMAGE_4K_TEXT_ONLY", message: "Wan2.7 Image 4K is only available for text-to-image without reference images." });
  }
  const pricing = wan27ImageModifyPricing(config, auth.user, pricingContextForAuth(auth));
  const cost = pricing.credits;
  if (auth.user.credits < cost) return sendJson(res, 402, insufficientCreditsPayload(cost, auth.user.credits));
  try {
    assertSubtokenCanSpend(auth, cost);
  } catch (error) {
    return sendJson(res, error.statusCode || 402, error.payload || { ok: false, code: error.code || "SUBTOKEN_UNAVAILABLE", message: error.message });
  }

  const taskId = localGenerationTaskId("char");
  const initialRecord = {
    taskId,
    status: "submitting",
    model,
    source: "character-image-modify",
    kind: "character-image",
    provider: "aliyun-wan27-image",
    upstreamSource: USE_GATEWAY_UPSTREAM ? "gateway" : "direct",
    userId: auth.user.id,
    characterId: character.id || "",
    characterName: character.name || "",
    imageUrl,
    sourceImageUrl: imageUrl,
    prompt: displayPrompt,
    finalPrompt: prompt,
    params: { provider: "wan27-image", action: mode === "take_off" ? "take_off" : "character_modify", ...exposedWan27ImageParams(imageOptions) },
    ratio,
    resolution,
    preDeductedCredits: cost,
    originalPreDeductedCredits: pricing.originalCredits ?? cost,
    finalCredits: null,
    originalFinalCredits: null,
    userPricingMultiplier: pricing.userPricingMultiplier ?? 1,
    billingStatus: cost > 0 ? "pre_deducted" : "free",
    billingSettledAt: "",
    pricingEstimate: pricing,
    awaitingUpstreamTask: true,
    upstreamPayload: null,
    createResponse: null,
    remoteImageUrl: "",
    localImageUrl: "",
    error: "",
    apiTokenId: auth.tokenRecord?.id || "",
    apiTokenName: auth.tokenRecord?.name || "",
    apiTokenType: auth.tokenRecord?.quotaType || "",
    apiTokenSource: auth.tokenSource || "",
  };
  await updateAssetImageModifyRecord(taskId, initialRecord, "character-image-modify-create");
  if (cost > 0) {
    await chargeUserWithSubtoken(auth, {
      cost,
      type: "character_image_modify",
      taskId,
      meta: { taskId, characterId: character.id || "", model, ratio, resolution, action: initialRecord.params.action },
    });
    if (!dbEnabled()) await writeDb(auth.db);
  }

  try {
    const publicSourceUrl = /^https?:\/\//i.test(imageUrl) ? imageUrl : publicUrlForAssetPath(imageUrl);
    const submitted = USE_GATEWAY_UPSTREAM ? await gatewaySubmitWan27ImageEditTask({
      imageUrl: publicSourceUrl,
      prompt,
      ratio,
      resolution,
      model,
      input: imageOptions.input,
      parameters: imageOptions.parameters,
    }) : await submitWan27ImageModify({
      imageUrl: publicSourceUrl,
      prompt,
      ratio,
      resolution,
      model,
      input: imageOptions.input,
      parameters: imageOptions.parameters,
    });
    const resultUrl = submitted.task.imageUrls[0];
    await updateAssetImageModifyRecord(taskId, {
      upstreamTaskId: submitted.task.taskId || "",
      awaitingUpstreamTask: false,
      status: resultUrl ? (submitted.task.status || "succeeded") : "failed",
      upstreamPayload: submitted.payload,
      createResponse: submitted.raw,
      remoteImageUrl: resultUrl || "",
      error: resultUrl ? "" : (submitted.task.error || "Wan2.7 character modify returned no image."),
    }, "character-image-modify-submit");
    if (!resultUrl) {
      const error = new Error(submitted.task.error || "Wan2.7 character modify returned no image.");
      error.statusCode = 502;
      error.payload = submitted.raw;
      throw error;
    }
    const savedImage = GENERATED_ASSETS_ON_DEMAND
      ? { localImagePath: "", localImageUrl: "", cdnImageUrl: "", cdnError: "" }
      : await saveRemoteGeneratedImage(taskId, resultUrl);
    await updateAssetImageModifyRecord(taskId, {
      status: "succeeded",
      awaitingUpstreamTask: false,
      imageResultUrl: savedImage.cdnImageUrl || resultUrl,
      localImageUrl: savedImage.localImageUrl,
      localImagePath: savedImage.localImagePath,
      cdnImageUrl: savedImage.cdnImageUrl,
      cdnError: savedImage.cdnError,
      remoteImageUrl: resultUrl,
      finalCredits: cost,
      originalFinalCredits: pricing.originalCredits ?? cost,
      billingStatus: cost > 0 ? "settled" : "free",
      billingSettledAt: new Date().toISOString(),
      error: "",
    }, "character-image-modify-succeeded");
    const latestUser = (auth.db.users || []).find((entry) => entry.id === auth.user.id) || auth.user;
    const publicRecord = publicGenerationRecord(await getGenerationRecord(taskId) || { taskId }, generationRecordResponseOptionsForAuth(auth));
    return sendJson(res, 200, {
      ok: true,
      taskId,
      upstreamTaskId: submitted.task.taskId || "",
      imageUrl: publicRecord.imageResultUrl || savedImage?.localImageUrl || "",
      sourceCharacter: { id: character.id || "", name: character.name || "", imageUrl },
      user: userView(latestUser),
      pricing,
      cost,
      record: publicRecord,
      params: { mode, ...exposedWan27ImageParams(imageOptions) },
    });
  } catch (error) {
    const errorInfo = normalizeErrorPayload(error);
    console.warn("[character-image-modify-error]", taskId, errorInfo.message || error.message || error, JSON.stringify(errorInfo.payload || {}).slice(0, 1000));
    if (cost > 0) {
      try {
        const db = await readDb();
        await changeUserCredits(db, auth.user.id, cost, "character_image_modify_refund", { taskId, characterId: character.id || "", error: error.message || "Wan2.7 character modify failed." });
        await recordSubtokenAdjustment(auth, { taskId, type: "character_image_modify_refund", amount: -cost, meta: { characterId: character.id || "", error: error.message || "Wan2.7 character modify failed." } });
        if (!dbEnabled()) await writeDb(db);
      } catch (refundError) {
        console.error("[character-image-modify-refund-failed]", refundError.message || refundError);
      }
    }
    await updateAssetImageModifyRecord(taskId, {
      status: "failed",
      awaitingUpstreamTask: false,
      error: errorInfo.message || "Wan2.7 character modify failed.",
      code: errorInfo.code || "",
      errorPayload: errorInfo.payload || null,
      createResponse: errorInfo.payload || null,
      finalCredits: 0,
      originalFinalCredits: 0,
      billingStatus: cost > 0 ? "refunded" : "free",
      billingSettledAt: new Date().toISOString(),
      failedAt: new Date().toISOString(),
    }, "character-image-modify-failed");
    return sendJson(res, error.statusCode || 502, {
      ok: false,
      message: error.message || "Wan2.7 character modify failed.",
      code: error.code || "",
      taskId,
      record: publicGenerationRecord(await getGenerationRecord(taskId) || { taskId }, generationRecordResponseOptionsForAuth(auth)),
      payload: error.payload || null,
    });
  }
}

async function updateAssetImageModifyRecord(taskId, updates = {}, reason = "asset-image-modify") {
  const existing = await getGenerationRecord(taskId).catch(() => null);
  return upsertGenerationRecord({
    taskId,
    source: existing?.source || "asset-image-modify",
    kind: existing?.kind || "asset-image",
    provider: existing?.provider || "aliyun-wan27-image",
    ...updates,
    lastUpdateReason: reason,
  });
}

function imageEditAssetIdsFromBody(body = {}) {
  const ids = [];
  for (const key of ["imageAssetIds", "image_asset_ids", "assetIds", "asset_ids", "userAssetIds", "user_asset_ids"]) {
    if (body[key] !== undefined && body[key] !== null && body[key] !== "") ids.push(...arrayFromBody(body[key]));
  }
  for (const key of ["imageAssetId", "image_asset_id", "assetId", "asset_id", "userAssetId", "user_asset_id"]) {
    if (body[key] !== undefined && body[key] !== null && body[key] !== "") ids.push(...arrayFromBody(body[key]));
  }
  return [...new Set(ids.map((value) => String(value || "").trim()).filter(Boolean))];
}

function imageEditUrlsFromBody(body = {}) {
  const urls = [];
  for (const key of ["imageUrls", "image_urls", "sourceImageUrls", "source_image_urls", "referenceImageUrls", "reference_image_urls"]) {
    if (body[key] !== undefined && body[key] !== null && body[key] !== "") urls.push(...arrayFromBody(body[key]));
  }
  for (const key of ["imageUrl", "image_url", "sourceImageUrl", "source_image_url", "referenceImageUrl", "reference_image_url"]) {
    if (body[key] !== undefined && body[key] !== null && body[key] !== "") urls.push(...arrayFromBody(body[key]));
  }
  return [...new Set(urls.map((value) => String(value || "").trim()).filter(Boolean))];
}

function findImageEditTemplate(config = {}, templateId = "") {
  const id = String(templateId || "").trim();
  if (!id) return null;
  const playfluxTemplates = Array.isArray(config.playfluxTemplates) ? config.playfluxTemplates : [];
  const platformTemplates = Array.isArray(config.platform?.templates) ? config.platform.templates : [];
  return [...playfluxTemplates, ...platformTemplates]
    .find((item) => String(item?.id || "").trim() === id) || null;
}

function imageEditTemplateShouldUsePreview(template = {}, sourceImageCount = 0) {
  if (String(template.tab || "").trim().toLowerCase() === "video" || !template.previewUrl) return false;
  if (sourceImageCount < 1) return false;
  const requiredCount = Number(template.sourceCount || 0);
  return requiredCount <= 1 && sourceImageCount <= 1;
}

function imageEditPromptFromTemplate(template = {}, { sourceImageCount = 0, userPrompt = "" } = {}) {
  const requestJson = template.requestJson && typeof template.requestJson === "object" && !Array.isArray(template.requestJson)
    ? template.requestJson
    : {};
  const params = template.params && typeof template.params === "object" && !Array.isArray(template.params)
    ? template.params
    : {};
  const prompts = template.prompts && typeof template.prompts === "object" && !Array.isArray(template.prompts)
    ? template.prompts
    : {};
  const negativePrompt = firstNonEmptyText(
    requestJson.negative_prompt,
    requestJson.negativePrompt,
    params.negative_prompt,
    params.negativePrompt,
    template.negativePrompt,
    template.negative_prompt,
    prompts.negative,
  );
  const basePrompt = [
    firstNonEmptyText(
      requestJson.prompt,
      params.prompt,
      template.prompt,
      template.imagePrompt,
      template.image_prompt,
      prompts.image,
      prompts.anime,
      prompts.default,
    ),
    String(userPrompt || "").trim(),
    negativePrompt ? `Negative prompt: ${negativePrompt}` : "",
  ].filter(Boolean).join("\n\n");
  if (!imageEditTemplateShouldUsePreview(template, sourceImageCount)) return basePrompt;
  const previewIndex = Math.max(0, Number(sourceImageCount || 0)) + 1;
  const guide = sourceImageCount > 0
    ? `CRITICAL: Image 1 is the user's selected character/source and must be the dominant subject. Preserve Image 1 identity, face, body type, skin tone, hair, and main visual features. Image ${previewIndex} is NOT the target result and NOT a character reference; use it only as a loose reference for pose, composition, camera angle, scene intent, and general style. Do not copy the person, face, body, clothing, background, watermark, text, colors, or artifacts from Image ${previewIndex}. If Image 1 conflicts with Image ${previewIndex}, Image 1 always wins. The final result must look like a transformed version of Image 1, not a copy of Image ${previewIndex}.`
    : "";
  return [guide, basePrompt].filter(Boolean).join("\n\n");
}

function firstNonEmptyText(...values) {
  for (const value of values) {
    if (typeof value !== "string") continue;
    const text = value.trim();
    if (text) return text;
  }
  return "";
}

