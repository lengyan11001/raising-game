async function handleUndressToolExampleMedia(req, res, generationType, side) {
  if (!undressToolRequestAllowed(req)) return sendJson(res, 404, { ok: false, message: "API not found." });
  const definition = UNDRESS_TOOL_EXAMPLES[generationType];
  if (!definition || !["input", "result"].includes(side)) return sendText(res, 404, "Not Found");
  const record = await getGenerationRecord(definition.taskId);
  if (!record || !isSucceededStatus(record.status)) return sendText(res, 404, "Not Found");
  try {
    let example = await ensureUndressToolExampleFile(record, definition, generationType, side);
    if (!example && side === "input") {
      const asset = dbEnabled()
        ? await getUserAssetFromDb(undressToolExampleAssetId(record))
        : (await readDb()).userAssets.find((item) => item.id === undressToolExampleAssetId(record));
      record.__userAssets = asset ? [asset] : [];
      example = await ensureUndressToolExampleFile(record, definition, generationType, side);
    }
    const filePath = example?.filePath || "";
    if (!filePath) return sendText(res, 404, "Not Found");
    const stat = await fs.stat(filePath);
    const mime = example.mime || (definition[side === "input" ? "inputType" : "resultType"] === "video"
      ? videoMimeFromKnownPath(filePath) || "video/mp4"
      : imageMimeFromKnownPath(filePath) || "image/jpeg");
    if (sendInternalAsset(res, filePath, mime, stat)) return;
    res.writeHead(200, {
      "content-type": mime,
      "content-length": stat.size,
      "cache-control": "public, max-age=604800, immutable",
    });
    if (req.method === "HEAD") return res.end();
    return pipeFileStream(res, filePath);
  } catch {
    return sendText(res, 404, "Not Found");
  }
}

async function handleUndressToolEstimate(req, res) {
  if (!undressToolRequestAllowed(req)) return sendJson(res, 404, { ok: false, message: "API not found." });
  const auth = await requireUser(req, res);
  if (!auth) return;
  if (!dbEnabled()) return sendJson(res, 503, { ok: false, message: "This tool requires database storage." });
  const body = await readJson(req);
  const generation = undressToolGenerationDefinition(body.generationType);
  if (!generation) return sendJson(res, 400, { ok: false, message: "Select a generation type." });
  const durationSeconds = durationSecondsFromValue(body.durationSeconds || body.duration);
  if (generation.generationType === "video" && !durationSeconds) {
    return sendJson(res, 400, { ok: false, message: "Read the source video duration before estimating." });
  }
  try {
    const pricing = await videoToolPricing(generation.action, { durationSeconds, user: auth.user, auth });
    const freeImageAvailable = generation.generationType === "image" && await undressToolFreeImageAvailable(auth.user.id);
    return sendJson(res, 200, {
      ok: true,
      generationType: generation.generationType,
      mediaKind: generation.mediaKind,
      freeImageAvailable,
      chargeCredits: freeImageAvailable ? 0 : pricing.credits,
      unlockCredits: freeImageAvailable ? pricing.credits : 0,
      pricing: publicVideoToolPricing(pricing),
    });
  } catch (error) {
    return sendJson(res, error.statusCode || 400, { ok: false, message: error.message || "Unable to estimate this generation." });
  }
}

async function handleUndressToolGenerate(req, res) {
  if (!undressToolRequestAllowed(req)) return sendJson(res, 404, { ok: false, message: "API not found." });
  const auth = await requireUser(req, res);
  if (!auth) return;
  if (!dbEnabled()) return sendJson(res, 503, { ok: false, message: "This tool requires database storage." });
  const body = await readJson(req);
  const appConfig = await readAppConfig();
  const generation = undressToolGenerationDefinition(body.generationType, appConfig.undressPrompts);
  if (!generation) return sendJson(res, 400, { ok: false, message: "Select a generation type." });
  const uploaded = (auth.db.userAssets || []).find((entry) => (
    entry.id === String(body.assetId || "").trim()
    && entry.userId === auth.user.id
    && !isSoftDeleted(entry)
  ));
  if (!uploaded) return sendJson(res, 404, { ok: false, message: "Uploaded media not found." });
  const mime = String(uploaded.mime || "").toLowerCase();
  const mediaKind = mime.startsWith("video/") ? "video" : mime.startsWith("image/") ? "image" : "";
  if (!mediaKind) return sendJson(res, 400, { ok: false, message: "Upload one image or video." });
  if (mediaKind !== generation.mediaKind) {
    return sendJson(res, 400, {
      ok: false,
      message: generation.mediaKind === "video" ? "Upload a video for this generation type." : "Upload an image for this generation type.",
    });
  }

  const { action, generationType } = generation;
  const asset = videoToolAsset(
    auth.db,
    auth.user.id,
    uploaded.id,
    generation.mediaKind,
    generation.mediaKind === "video" ? "Source video" : "Source image",
  );
  let durationSeconds = 0;
  if (generationType === "video") {
    const localPath = localPathForUserAsset(asset);
    durationSeconds = durationSecondsFromValue(asset.durationSeconds)
      || (localPath ? await probeLocalVideoDurationSeconds(localPath) : 0)
      || await probeVideoDurationSeconds(publicUrlForLocalAsset(asset));
    if (!durationSeconds) return sendJson(res, 400, { ok: false, message: "Source video duration could not be read." });
  }

  const taskId = localGenerationTaskId(generationType.replace(/_/g, "-"));
  const freeClaimId = generationType === "image" ? undressToolFreeImageClaimId(auth.user.id) : "";
  let freeClaim = null;
  let recordCreated = false;
  try {
    const pricing = await videoToolPricing(action, { durationSeconds, user: auth.user, auth });
    if (generationType === "image") {
      freeClaim = await claimUndressToolFreeImage({
        userId: auth.user.id,
        tenantId: requestTenantId(req),
        taskId,
      });
    }
    const freeImageGeneration = Boolean(freeClaim);
    const cost = freeImageGeneration ? 0 : pricing.credits;
    if (auth.user.credits < cost) return sendJson(res, 402, insufficientCreditsPayload(cost, auth.user.credits));
    try {
      assertSubtokenCanSpend(auth, cost);
    } catch (error) {
      return sendJson(res, error.statusCode || 402, error.payload || { ok: false, code: error.code || "SUBTOKEN_UNAVAILABLE", message: error.message });
    }
    if (cost > 0) {
      await chargeUserWithSubtoken(auth, {
        cost,
        type: `undress_tool_${generationType}_generate`,
        taskId,
        meta: {
          taskId,
          action,
          assetId: asset.id,
          durationSeconds: pricing.durationSeconds,
          segmentCount: pricing.segmentCount,
          model: pricing.model,
          originalCost: pricing.originalCredits,
          pricingSource: pricing.source,
        },
      });
    }
    const createdAt = new Date().toISOString();
    const resultLocked = freeImageGeneration;
    const record = await upsertGenerationRecord({
      taskId,
      status: "queued",
      source: generation.source,
      kind: generation.kind,
      provider: generation.provider,
      upstreamSource: "video-tool-orchestrator",
      model: pricing.model,
      userId: auth.user.id,
      userAssetId: asset.id,
      userAssetIds: [asset.id],
      imageUrl: generation.mediaKind === "image" ? (asset.localUrl || asset.publicUrl || "") : "",
      sourceImageUrl: generation.mediaKind === "image" ? (asset.localUrl || asset.publicUrl || "") : "",
      mediaAssets: [{
        type: generationType === "video" ? "video" : generationType === "image_video" ? "first_frame" : "reference_image",
        userAssetId: asset.id,
        localUrl: asset.localUrl || "",
      }],
      prompt: generation.prompt,
      finalPrompt: generation.prompt,
      params: {
        toolAction: action,
        generationType,
        stage: "queued",
        durationSeconds: pricing.durationSeconds,
        segmentCount: pricing.segmentCount,
        completedSegments: 0,
        freeImageClaimId: freeImageGeneration ? freeClaimId : "",
      },
      ratio: generationType === "image" ? closestWan27ImageRatioForAsset(asset) : generationType === "image_video" ? "9:16" : "source",
      resolution: generationType === "image" ? "2K" : "720p",
      duration: generationType === "image" ? "" : pricing.durationSeconds,
      preDeductedCredits: cost,
      originalPreDeductedCredits: freeImageGeneration ? 0 : pricing.originalCredits,
      finalCredits: null,
      originalFinalCredits: null,
      userPricingMultiplier: pricing.components?.[0]?.userPricingMultiplier ?? 1,
      billingStatus: freeImageGeneration ? "free_generating" : cost > 0 ? "pre_deducted" : "free",
      billingSettledAt: "",
      pricingEstimate: pricing,
      resultLocked,
      unlockCredits: freeImageGeneration ? pricing.credits : 0,
      unlockType: freeImageGeneration ? "undress_image" : "",
      freeImageGeneration,
      freeImageClaimId: freeImageGeneration ? freeClaimId : "",
      awaitingUpstreamTask: false,
      error: "",
      createdAt,
      updatedAt: createdAt,
      apiTokenId: auth.tokenRecord?.id || "",
      apiTokenName: auth.tokenRecord?.name || "",
      apiTokenType: auth.tokenRecord?.quotaType || "",
      apiTokenSource: auth.tokenSource || "",
    });
    recordCreated = true;
    startVideoToolJob({
      taskId,
      action,
      userId: auth.user.id,
      imageAssetId: generation.mediaKind === "image" ? asset.id : "",
      videoAssetId: generation.mediaKind === "video" ? asset.id : "",
      pricing,
      prompt: generation.prompt,
    });
    return sendJson(res, 202, {
      ok: true,
      async: true,
      taskId,
      freeImageGeneration,
      pricing: publicVideoToolPricing(pricing),
      record: publicGenerationRecord(record, generationRecordResponseOptionsForAuth(auth)),
      user: userView(auth.user),
    });
  } catch (error) {
    if (freeClaim && !recordCreated) {
      await releaseToolFreeGenerationClaimInDb({ id: freeClaimId, userId: auth.user.id, taskId }).catch(() => {});
    }
    return sendJson(res, error.statusCode || 500, { ok: false, message: error.message || "Generation submission failed." });
  }
}

async function handleUnlockUndressToolResult(req, res, taskId) {
  if (!undressToolRequestAllowed(req)) return sendJson(res, 404, { ok: false, message: "API not found." });
  const auth = await requireUser(req, res);
  if (!auth) return;
  const record = await getGenerationRecord(taskId);
  if (!record || record.userId !== auth.user.id || record.unlockType !== "undress_image") {
    return sendJson(res, 404, { ok: false, message: "Generation record not found." });
  }
  if (!isSucceededStatus(record.status)) {
    return sendJson(res, 409, { ok: false, message: "This result is not ready yet." });
  }
  if (record.resultLocked !== true) {
    return sendJson(res, 200, {
      ok: true,
      alreadyUnlocked: true,
      record: publicGenerationRecord(record, generationRecordResponseOptionsForAuth(auth)),
      user: userView(auth.user),
    });
  }
  const cost = creditsAmount(record.unlockCredits || record.pricingEstimate?.credits || 0);
  if (!(cost > 0)) return sendJson(res, 409, { ok: false, message: "Unlock price is unavailable." });
  if (auth.user.credits < cost) return sendJson(res, 402, insufficientCreditsPayload(cost, auth.user.credits));
  try {
    assertSubtokenCanSpend(auth, cost);
    await chargeUserWithSubtoken(auth, {
      cost,
      type: "undress_tool_image_unlock",
      taskId,
      meta: { taskId, action: "unlock", model: record.model || "", originalCost: record.pricingEstimate?.originalCredits || cost },
    });
    let publishedImageUrl = String(record.cdnImageUrl || "").trim();
    let publishError = "";
    if (!publishedImageUrl && record.localImagePath && generatedOutputStorageEnabled()) {
      try {
        const bytes = await fs.readFile(record.localImagePath);
        const fileName = path.basename(record.localImagePath);
        const mime = imageMimeFromKnownPath(fileName) || "image/png";
        const published = await uploadStaticAssetToObjectStorage({
          key: objectStoragePath("generated", "images", fileName),
          bytes,
          mime,
        });
        publishedImageUrl = published.publicUrl || "";
      } catch (error) {
        publishError = error.message || "Object storage publication failed.";
      }
    }
    const unlockedAt = new Date().toISOString();
    const nextRecord = await upsertGenerationRecord({
      ...record,
      taskId,
      resultLocked: false,
      lockedPreviewUrl: "",
      lockedPreviewPath: "",
      unlockedAt,
      imageResultUrl: publishedImageUrl || record.localImageUrl || record.imageResultUrl || "",
      cdnImageUrl: publishedImageUrl,
      cdnError: publishError,
      finalCredits: cost,
      originalFinalCredits: record.pricingEstimate?.originalCredits || cost,
      billingStatus: "settled",
      billingSettledAt: unlockedAt,
      lastUpdateReason: "undress-tool-image-unlocked",
    });
    const lockedPreviewPath = String(record.lockedPreviewPath || localAssetPathFromPublicValue(record.lockedPreviewUrl || "")).trim();
    if (lockedPreviewPath) await fs.rm(lockedPreviewPath, { force: true }).catch(() => {});
    if (record.freeImageClaimId) {
      await markToolFreeGenerationUnlockedInDb({ id: record.freeImageClaimId, userId: auth.user.id, taskId }).catch((error) => {
        console.warn("[undress-free-claim-unlock-mark-failed]", taskId, error.message || error);
      });
    }
    return sendJson(res, 200, {
      ok: true,
      record: publicGenerationRecord(nextRecord, generationRecordResponseOptionsForAuth(auth)),
      user: userView(auth.user),
    });
  } catch (error) {
    return sendJson(res, error.statusCode || 500, error.payload || { ok: false, message: error.message || "Unlock failed." });
  }
}

async function ingestAdvancedCaseMedia({ videoUrl, coverUrl = "", caseId = "" } = {}) {
  const sourceVideoUrl = requireHttpUrl(videoUrl, "Video URL");
  const sourceCoverUrl = String(coverUrl || "").trim() ? requireHttpUrl(coverUrl, "Cover URL") : "";
  const safeId = String(caseId || `advanced-${Date.now()}`).trim().replace(/[^a-z0-9_-]/gi, "-").slice(0, 64) || `advanced-${Date.now()}`;
  await fs.mkdir(ADMIN_ADVANCED_CASE_DIR, { recursive: true });

  const videoDownload = await downloadRemoteFileToBuffer(sourceVideoUrl, { label: "video", maxBytes: 300 * 1024 * 1024 });
  const videoPathname = new URL(sourceVideoUrl).pathname;
  if (!String(videoDownload.mime || "").startsWith("video/") && !isLikelyVideoUrl(videoPathname)) {
    const error = new Error("Video URL must point to a video file.");
    error.statusCode = 400;
    throw error;
  }
  const videoExt = videoExtFromMime(videoDownload.mime, sourceVideoUrl);
  const videoName = `${safeId}-video-${Date.now()}${videoExt}`;
  const videoPath = path.join(ADMIN_ADVANCED_CASE_DIR, videoName);
  const localVideoUrl = `/assets/admin/advanced-cases/${videoName}`;
  await fs.writeFile(videoPath, videoDownload.bytes);

  let localCoverUrl = "";
  let coverPath = "";
  let coverBytes = null;
  let coverMime = "";
  if (sourceCoverUrl) {
    const coverDownload = await downloadRemoteFileToBuffer(sourceCoverUrl, { label: "cover", maxBytes: 8 * 1024 * 1024, timeoutMs: 120000 });
    const coverPathname = new URL(sourceCoverUrl).pathname;
    if (!String(coverDownload.mime || "").startsWith("image/") && !/\.(png|jpe?g|webp)$/i.test(coverPathname)) {
      const error = new Error("Cover URL must point to an image file.");
      error.statusCode = 400;
      throw error;
    }
    coverMime = coverDownload.mime && coverDownload.mime.startsWith("image/") ? coverDownload.mime : "image/jpeg";
    const coverExt = imageExtFromMime(coverMime);
    const coverName = `${safeId}-cover-${Date.now()}${coverExt}`;
    coverPath = path.join(ADMIN_ADVANCED_CASE_DIR, coverName);
    localCoverUrl = `/assets/admin/advanced-cases/${coverName}`;
    coverBytes = coverDownload.bytes;
    await fs.writeFile(coverPath, coverBytes);
  } else {
    const coverName = `${safeId}-cover-${Date.now()}.jpg`;
    coverPath = path.join(ADMIN_ADVANCED_CASE_DIR, coverName);
    const captured = await captureVideoPosterFrame(videoPath, coverPath);
    if (captured) {
      localCoverUrl = `/assets/admin/advanced-cases/${coverName}`;
      coverMime = "image/jpeg";
      coverBytes = await fs.readFile(coverPath);
    }
  }

  const result = {
    sourceVideoUrl,
    sourceCoverUrl,
    localVideoUrl,
    localCoverUrl,
    previewUrl: localVideoUrl,
    coverUrl: localCoverUrl,
    cdnVideoUrl: "",
    cdnCoverUrl: "",
    cdnEnabled: objectStorageEnabled(),
    cdnError: "",
  };

  if (objectStorageEnabled()) {
    const baseKey = objectStoragePath("admin", "advanced-cases", safeId, Date.now());
    const videoUpload = await uploadStaticAssetToObjectStorage({
      key: `${baseKey}${videoExt}`,
      bytes: videoDownload.bytes,
      mime: videoDownload.mime && videoDownload.mime.startsWith("video/") ? videoDownload.mime : videoMimeFromPath(videoName),
    });
    result.cdnVideoUrl = videoUpload.publicUrl;
    result.previewUrl = videoUpload.publicUrl;
    if (coverBytes && localCoverUrl) {
      const coverUpload = await uploadStaticAssetToObjectStorage({
        key: `${baseKey}-cover${path.extname(coverPath) || ".jpg"}`,
        bytes: coverBytes,
        mime: coverMime || "image/jpeg",
      });
      result.cdnCoverUrl = coverUpload.publicUrl;
      result.coverUrl = coverUpload.publicUrl;
    }
  }

  return result;
}

async function ingestPlatformTemplateMedia({ videoUrl, coverUrl = "", templateId = "" } = {}) {
  const sourceVideoUrl = requireHttpUrl(videoUrl, "Video URL");
  const sourceCoverUrl = String(coverUrl || "").trim() ? requireHttpUrl(coverUrl, "Cover URL") : "";
  const safeId = String(templateId || `template-${Date.now()}`).trim().replace(/[^a-z0-9_-]/gi, "-").slice(0, 64) || `template-${Date.now()}`;
  await fs.mkdir(ADMIN_PLATFORM_TEMPLATE_DIR, { recursive: true });

  const videoDownload = await downloadRemoteFileToBuffer(sourceVideoUrl, { label: "video", maxBytes: 300 * 1024 * 1024 });
  const videoPathname = new URL(sourceVideoUrl).pathname;
  if (!String(videoDownload.mime || "").startsWith("video/") && !isLikelyVideoUrl(videoPathname)) {
    const error = new Error("Video URL must point to a video file.");
    error.statusCode = 400;
    throw error;
  }
  const videoExt = videoExtFromMime(videoDownload.mime, sourceVideoUrl);
  const stamp = Date.now();
  const videoName = `${safeId}-video-${stamp}${videoExt}`;
  const videoPath = path.join(ADMIN_PLATFORM_TEMPLATE_DIR, videoName);
  const localVideoUrl = `/assets/admin/platform-templates/${videoName}`;
  await fs.writeFile(videoPath, videoDownload.bytes);

  let localCoverUrl = "";
  let coverPath = "";
  let coverBytes = null;
  let coverMime = "";
  if (sourceCoverUrl) {
    const coverDownload = await downloadRemoteFileToBuffer(sourceCoverUrl, { label: "cover", maxBytes: 8 * 1024 * 1024, timeoutMs: 120000 });
    const coverPathname = new URL(sourceCoverUrl).pathname;
    if (!String(coverDownload.mime || "").startsWith("image/") && !/\.(png|jpe?g|webp)$/i.test(coverPathname)) {
      const error = new Error("Cover URL must point to an image file.");
      error.statusCode = 400;
      throw error;
    }
    coverMime = coverDownload.mime && coverDownload.mime.startsWith("image/") ? coverDownload.mime : "image/jpeg";
    const coverExt = imageExtFromMime(coverMime);
    const coverName = `${safeId}-cover-${stamp}${coverExt}`;
    coverPath = path.join(ADMIN_PLATFORM_TEMPLATE_DIR, coverName);
    localCoverUrl = `/assets/admin/platform-templates/${coverName}`;
    coverBytes = coverDownload.bytes;
    await fs.writeFile(coverPath, coverBytes);
  } else {
    const coverName = `${safeId}-cover-${stamp}.jpg`;
    coverPath = path.join(ADMIN_PLATFORM_TEMPLATE_DIR, coverName);
    const captured = await captureVideoPosterFrame(videoPath, coverPath);
    if (captured) {
      localCoverUrl = `/assets/admin/platform-templates/${coverName}`;
      coverMime = "image/jpeg";
      coverBytes = await fs.readFile(coverPath);
    }
  }

  const result = {
    sourceVideoUrl,
    sourceCoverUrl,
    localVideoUrl,
    localCoverUrl,
    previewUrl: localVideoUrl,
    coverUrl: localCoverUrl,
    cdnVideoUrl: "",
    cdnCoverUrl: "",
    cdnEnabled: objectStorageEnabled(),
    cdnError: "",
  };

  if (objectStorageEnabled()) {
    const baseKey = objectStoragePath("admin", "platform-templates", safeId, stamp);
    const videoUpload = await uploadStaticAssetToObjectStorage({
      key: `${baseKey}${videoExt}`,
      bytes: videoDownload.bytes,
      mime: videoDownload.mime && videoDownload.mime.startsWith("video/") ? videoDownload.mime : videoMimeFromPath(videoName),
    });
    result.cdnVideoUrl = videoUpload.publicUrl;
    result.previewUrl = videoUpload.publicUrl;
    if (coverBytes && localCoverUrl) {
      const coverUpload = await uploadStaticAssetToObjectStorage({
        key: `${baseKey}-cover${path.extname(coverPath) || ".jpg"}`,
        bytes: coverBytes,
        mime: coverMime || "image/jpeg",
      });
      result.cdnCoverUrl = coverUpload.publicUrl;
      result.coverUrl = coverUpload.publicUrl;
    }
  }

  return result;
}

async function readRawBody(req, maxBytes = JSON_BODY_MAX_BYTES) {
  const chunks = [];
  let byteLength = 0;
  for await (const chunk of req) {
    chunks.push(chunk);
    byteLength += Buffer.byteLength(chunk);
    if (byteLength > maxBytes) {
      const error = new Error("Request body too large");
      error.statusCode = 413;
      error.code = "REQUEST_BODY_TOO_LARGE";
      throw error;
    }
  }

  return Buffer.concat(chunks).toString("utf8");
}

async function readJson(req, maxBytes = JSON_BODY_MAX_BYTES) {
  const raw = await readRawBody(req, maxBytes);
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    const error = new Error("Request body must be valid JSON.");
    error.statusCode = 400;
    error.code = "INVALID_JSON";
    throw error;
  }
}

function clampNumber(value, fallback, min, max) {
  const next = Number(value);
  if (!Number.isFinite(next)) return fallback;
  return Math.max(min, Math.min(max, next));
}

function makeScenePrompt(body) {
  return typeof body.prompt === "string" ? body.prompt : "";
}

function normalizeTask(raw) {
  const task = raw?.data || raw?.task || raw;
  const content = task?.content || raw?.content;
  const videoUrl =
    content?.video_url ||
    content?.[0]?.video_url ||
    task?.output?.video_url ||
    task?.result?.video_url ||
    findVideoUrl(task) ||
    "";

  return {
    taskId: task?.id || task?.task_id || task?.taskId || raw?.id || raw?.task_id || "",
    status: task?.status || task?.state || task?.task_status || raw?.status || "",
    videoUrl,
    error: task?.error?.message || task?.error || raw?.error?.message || raw?.message || "",
  };
}

function adminGenerationRecordListView(record = {}, userMap = new Map()) {
  const view = adminGenerationRecordView(record, userMap);
  delete view.upstreamPayload;
  delete view.pricingEstimate;
  delete view.createResponse;
  delete view.queryResponse;
  view.params = listGenerationRecordValue(view.params);
  view.mediaAssets = listGenerationRecordValue(view.mediaAssets);
  return view;
}

function normalizePivoxStatus(status = "") {
  const normalized = String(status || "").trim().toLowerCase();
  if (["success", "succeeded", "completed", "done"].includes(normalized)) return "succeeded";
  if (["fail", "failed", "error", "cancelled", "canceled"].includes(normalized)) return "failed";
  if (["queued", "pending", "created", "submitted", "not_start"].includes(normalized)) return "submitted";
  if (["running", "processing", "in_progress", "generating"].includes(normalized)) return "processing";
  return normalized || "submitted";
}

function findPivoxOutputVideoUrl(value = {}) {
  const task = value?.data?.data?.task || value?.data?.task || value?.task || value;
  const outputs = [
    ...(Array.isArray(task?.outputs) ? task.outputs : []),
    ...(Array.isArray(value?.data?.outputs) ? value.data.outputs : []),
    ...(Array.isArray(value?.outputs) ? value.outputs : []),
  ];
  for (const item of outputs) {
    const url = typeof item === "string" ? item : nestedMediaUrl(item);
    if (url && isLikelyVideoUrl(url)) return url;
  }
  return findVideoUrl(value);
}

function normalizePivoxTask(raw = {}) {
  const outer = raw?.data && typeof raw.data === "object" ? raw.data : raw;
  const task = outer?.data?.task || outer?.task || raw?.task || {};
  const status = firstPresent(outer.status, task.status, raw.status, task.state, raw.state, "submitted");
  const taskId = firstPresent(outer.task_id, outer.taskId, task.task_id, task.taskId, task.id, raw.task_id, raw.taskId, raw.id, "");
  const error = firstPresent(
    outer.fail_reason,
    outer.error_msg,
    outer.error?.message,
    task.fail_reason,
    task.error_msg,
    task.error?.message,
    task.error,
    raw.error?.message,
    raw.message,
    "",
  );
  return {
    taskId: String(taskId || ""),
    status: normalizePivoxStatus(status),
    videoUrl: findPivoxOutputVideoUrl(raw) || "",
    error: String(error || ""),
  };
}

function normalizeApizSeedanceTask(raw = {}) {
  const outer = raw?.data && typeof raw.data === "object" ? raw.data : raw;
  const task = outer?.data?.task || outer?.task || raw?.task || {};
  const status = firstPresent(outer.status, task.status, raw.status, task.state, raw.state, "submitted");
  const taskId = firstPresent(outer.task_id, outer.taskId, task.task_id, task.taskId, task.id, raw.task_id, raw.taskId, raw.id, "");
  const error = firstPresent(
    outer.fail_reason,
    outer.error_msg,
    outer.error?.message,
    task.fail_reason,
    task.error_msg,
    task.error?.message,
    task.error,
    raw.error?.message,
    raw.message,
    "",
  );
  return {
    taskId: String(taskId || ""),
    status: normalizePivoxStatus(status),
    videoUrl: apizResultUrl(raw) || findPivoxOutputVideoUrl(raw) || "",
    error: String(error || ""),
  };
}

function normalizeIgnexTask(raw = {}) {
  const outer = raw?.data && typeof raw.data === "object" ? raw.data : raw;
  const task = outer?.Result || outer?.result || outer?.data?.task || outer?.task || raw?.task || outer;
  const status = firstPresent(task?.status, task?.Status, outer?.status, outer?.Status, raw?.status, "submitted");
  const taskId = firstPresent(
    task?.id,
    task?.Id,
    task?.task_id,
    task?.taskId,
    outer?.id,
    outer?.Id,
    outer?.task_id,
    outer?.taskId,
    raw?.id,
    raw?.task_id,
    "",
  );
  const error = firstPresent(
    task?.error?.message,
    task?.Error?.Message,
    task?.error,
    task?.fail_reason,
    outer?.error?.message,
    outer?.Error?.Message,
    outer?.message,
    raw?.error?.message,
    raw?.message,
    "",
  );
  return {
    taskId: String(taskId || ""),
    status: normalizePivoxStatus(status),
    videoUrl: findVideoUrl(raw) || "",
    error: String(error || ""),
  };
}

function findVideoUrl(value) {
  if (!value || typeof value !== "object") return "";
  if (typeof value.video_url === "string") return value.video_url;
  if (typeof value.videoUrl === "string") return value.videoUrl;
  if (typeof value.url === "string" && isLikelyVideoUrl(value.url)) return value.url;

  for (const item of Object.values(value)) {
    const found = Array.isArray(item)
      ? item.map(findVideoUrl).find(Boolean)
      : findVideoUrl(item);
    if (found) return found;
  }

  return "";
}

function collectImageUrls(value, urls = []) {
  if (!value || typeof value !== "object") return urls;
  if (typeof value.url === "string" && /\.(png|jpe?g|webp)(\?|$)/i.test(value.url)) urls.push(value.url);
  if (typeof value.image_url === "string") urls.push(value.image_url);
  if (typeof value.image === "string" && /^https?:\/\//i.test(value.image)) urls.push(value.image);
  if (typeof value.output === "string" && /^https?:\/\//i.test(value.output)) urls.push(value.output);

  for (const item of Object.values(value)) {
    if (Array.isArray(item)) item.forEach((child) => collectImageUrls(child, urls));
    else collectImageUrls(item, urls);
  }
  return [...new Set(urls)];
}

function collectOutputImageUrls(task) {
  const output = task?.output || task?.result || task?.data?.output || {};
  const direct = [
    ...(Array.isArray(task?.data) ? task.data.map((image) => image?.url || image?.image_url || image?.image) : []),
    ...(Array.isArray(output.images) ? output.images.map((image) => image?.url || image?.image_url) : []),
    ...(Array.isArray(output.results) ? output.results.map((image) => image?.url || image?.image_url || image?.image) : []),
    output.url,
    output.image_url,
    output.image?.url,
  ].filter(Boolean);
  return direct.length ? direct : collectImageUrls(output);
}

async function gatewayRequest(method, pathname, body = null) {
  if (!UPSTREAM_API_TOKEN) {
    const error = new Error("Gateway upstream token is not configured.");
    error.statusCode = 503;
    error.code = "GATEWAY_TOKEN_NOT_CONFIGURED";
    throw error;
  }
  const response = await fetch(`${UPSTREAM_BASE_URL}${pathname}`, {
    method,
    headers: {
      authorization: `Bearer ${UPSTREAM_API_TOKEN}`,
      accept: "application/json",
      ...(body ? { "content-type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await response.text();
  let payload = {};
  try {
    payload = text ? JSON.parse(text) : {};
  } catch {
    payload = { ok: false, message: text };
  }
  if (!response.ok || payload.ok === false || payload.code >= 400) {
    const error = new Error(payload.message || payload.detail || `Gateway upstream request failed: ${response.status}`);
    error.statusCode = response.status || 502;
    error.code = payload.code || "GATEWAY_UPSTREAM_FAILED";
    error.payload = payload;
    throw error;
  }
  return payload;
}

function gatewayTaskFromPayload(payload = {}) {
  const record = payload.record || payload.data?.record || {};
  const task = payload.task || payload.data?.task || record || payload;
  const videoUrl = gatewayAbsoluteAssetUrl(record.videoUrl || task.videoUrl || payload.videoUrl || payload.data?.videoUrl || findVideoUrl(payload) || "");
  const imageUrl = gatewayAbsoluteAssetUrl(firstPresent(
    payload.imageUrl,
    payload.image_url,
    payload.downloadUrl,
    payload.data?.imageUrl,
    payload.data?.image_url,
    record.imageResultUrl,
    record.cdnImageUrl,
    record.localImageUrl,
    record.remoteImageUrl,
    record.providerImageUrl,
    record.downloadUrl,
    collectOutputImageUrls(payload)[0],
  ));
  const imageUrls = [...new Set([
    imageUrl,
    ...(Array.isArray(record.imageResultUrls) ? record.imageResultUrls : []),
    ...(Array.isArray(record.cdnImageUrls) ? record.cdnImageUrls : []),
    ...(Array.isArray(record.localImageUrls) ? record.localImageUrls : []),
    ...(Array.isArray(record.providerImageUrls) ? record.providerImageUrls : []),
    ...collectOutputImageUrls(payload),
  ].map(gatewayAbsoluteAssetUrl).filter(Boolean))];
  return {
    taskId: record.taskId || task.taskId || payload.taskId || payload.data?.taskId || "",
    upstreamTaskId: record.upstreamTaskId || task.upstreamTaskId || "",
    status: record.status || task.status || "submitted",
    videoUrl,
    imageUrl: imageUrls[0] || imageUrl,
    imageUrls,
    error: record.error || task.error || payload.error || "",
    record,
    raw: payload,
  };
}

async function gatewaySubmitPlatformTask(body = {}) {
  const payload = await gatewayRequest("POST", "/api/platform/generate", body);
  return gatewayTaskFromPayload(payload);
}

async function gatewaySubmitAdvancedTask(body = {}) {
  const payload = await gatewayRequest("POST", "/api/advanced/generate", body);
  return gatewayTaskFromPayload(payload);
}

async function gatewayAdvancedEstimate(provider = "seedance", body = {}) {
  const payload = await gatewayRequest("POST", "/api/advanced/estimate", {
    ...plainObject(body),
    provider,
  });
  return payload.pricing || payload.estimate || payload;
}

function gatewayAbsoluteAssetUrl(value = "") {
  const text = String(value || "").trim();
  if (!text) return "";
  if (/^https?:\/\//i.test(text)) return text;
  if (text.startsWith("/")) {
    try {
      return new URL(text, UPSTREAM_BASE_URL).toString();
    } catch {
      return text;
    }
  }
  return text;
}

async function dataUrlForLocalAssetUrl(localUrl = "", fallbackMime = "application/octet-stream") {
  const value = String(localUrl || "").trim();
  if (!value || !value.startsWith("/")) return "";
  const localPath = safeAssetPathFromUrl(value);
  if (!localPath) {
    const error = new Error("Asset path is invalid.");
    error.statusCode = 400;
    throw error;
  }
  const bytes = await fs.readFile(localPath);
  return `data:${fallbackMime};base64,${bytes.toString("base64")}`;
}

async function gatewaySeedanceReferenceFromUri(uri = "", label = "Reference") {
  const value = String(uri || "").trim();
  if (!value) return null;
  if (/^data:/i.test(value)) return { dataUrl: value, fileName: `${label}.bin`, name: label };
  if (value.startsWith("asset://")) return { url: value, name: label };
  if (value.startsWith("/")) {
    const localPath = safeAssetPathFromUrl(value);
    if (!localPath) {
      const error = new Error("Reference asset path is invalid.");
      error.statusCode = 400;
      throw error;
    }
    return { url: await publishLocalAssetUrlToObjectStorage(value), fileName: path.basename(localPath), name: label };
  }
  return { url: publicHttpUrlForUpstream(value) || gatewayAbsoluteAssetUrl(value), name: label };
}

async function gatewaySeedanceVideoUrlFromUri(uri = "") {
  const value = String(uri || "").trim();
  if (!value) return "";
  if (value.startsWith("/")) return publishLocalAssetUrlToObjectStorage(value);
  return publicHttpUrlForUpstream(value) || gatewayAbsoluteAssetUrl(value);
}

async function gatewaySeedanceBodyFromReferences({
  config = {},
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
  const directPayload = seedancePayloadFromBody({
    config,
    prompt,
    content: seedanceContentFromReferences({
      prompt,
      referenceAssetUri,
      extraReferenceAssetUris,
      firstFrameAssetUri,
      lastFrameAssetUri,
      referenceVideoAssetUri,
      extraReferenceVideoAssetUris,
      referenceAudioAssetUris,
      body,
    }),
    body,
  });
  const gatewayBody = {
    provider: "seedance",
    prompt,
    ratio: directPayload.ratio,
    resolution: directPayload.resolution,
    duration: directPayload.duration,
    generateAudio: directPayload.generate_audio,
    seedanceMode: "reference_video",
    model: directPayload.model,
    parameters: {},
    preservePublicMediaUrls: true,
  };
  ["seed", "web_search", "watermark", "draft", "service_tier", "fps", "camera_fixed"].forEach((field) => {
    if (directPayload[field] !== undefined) gatewayBody[field] = directPayload[field];
  });

  const referenceImages = [];
  const firstFrame = firstFrameAssetUri ? await gatewaySeedanceReferenceFromUri(firstFrameAssetUri, "First frame") : null;
  const lastFrame = lastFrameAssetUri ? await gatewaySeedanceReferenceFromUri(lastFrameAssetUri, "Last frame") : null;
  if (firstFrame?.dataUrl) gatewayBody.firstFrameDataUrl = firstFrame.dataUrl;
  else if (firstFrame?.url) gatewayBody.firstFrameUrl = firstFrame.url;
  if (lastFrame?.dataUrl) gatewayBody.endImageDataUrl = lastFrame.dataUrl;
  else if (lastFrame?.url) gatewayBody.endImageUrl = lastFrame.url;
  if (firstFrame || lastFrame) gatewayBody.seedanceMode = lastFrame ? "first_last_frame" : "first_frame";

  const imageUris = [referenceAssetUri, ...arrayFromBody(extraReferenceAssetUris)]
    .filter((uri, index, list) => uri && list.indexOf(uri) === index);
  for (let index = 0; index < imageUris.length; index += 1) {
    const item = await gatewaySeedanceReferenceFromUri(imageUris[index], `Reference image ${index + 1}`);
    if (item) referenceImages.push(item);
  }
  if (referenceImages.length && !firstFrame && !lastFrame) {
    gatewayBody.referenceImageAssetUris = referenceImages
      .map((item) => item.url || "")
      .filter(Boolean)
      .slice(0, ADVANCED_SEEDANCE_REFERENCE_LIMIT);
    gatewayBody.seedanceMode = "reference_video";
  }

  const videoUris = [referenceVideoAssetUri, ...arrayFromBody(extraReferenceVideoAssetUris), ...arrayFromBody(body.reference_videos)]
    .map((item) => (typeof item === "string" ? item : String(item?.url || item?.videoUrl || item?.video_url || item?.assetUri || "")))
    .filter((uri, index, list) => uri && list.indexOf(uri) === index);
  const referenceVideoUrls = [];
  for (const uri of videoUris) {
    const videoUrl = await gatewaySeedanceVideoUrlFromUri(uri);
    if (videoUrl) referenceVideoUrls.push(videoUrl);
  }
  if (referenceVideoUrls.length) {
    gatewayBody.referenceVideoUrls = referenceVideoUrls.slice(0, ADVANCED_SEEDANCE_VIDEO_REFERENCE_LIMIT);
    gatewayBody.seedanceMode = "reference_video";
  }

  const audioUris = [...arrayFromBody(referenceAudioAssetUris), ...arrayFromBody(body.reference_audios)]
    .map((item) => (typeof item === "string" ? item : String(item?.url || item?.audioUrl || item?.audio_url || item?.assetUri || "")))
    .filter((uri, index, list) => uri && list.indexOf(uri) === index);
  const referenceAudioUrls = [];
  for (const uri of audioUris) {
    const audioUrl = await gatewaySeedanceVideoUrlFromUri(uri);
    if (audioUrl) referenceAudioUrls.push(audioUrl);
  }
  if (referenceAudioUrls.length) gatewayBody.referenceAudioUrls = referenceAudioUrls.slice(0, ADVANCED_SEEDANCE_AUDIO_REFERENCE_LIMIT);

  return gatewayBody;
}

function gatewayImageTaskFromPayload(payload = {}) {
  const record = payload.record || payload.data?.record || {};
  const task = payload.task || payload.data?.task || record || payload;
  const imageUrl = gatewayAbsoluteAssetUrl(firstPresent(
    payload.imageUrl,
    payload.image_url,
    payload.downloadUrl,
    payload.data?.imageUrl,
    payload.data?.image_url,
    payload.output?.imageUrl,
    payload.output?.image_url,
    Array.isArray(payload.output?.images) ? (payload.output.images[0]?.url || payload.output.images[0]?.image_url) : "",
    record.imageResultUrl,
    record.cdnImageUrl,
    record.localImageUrl,
    record.remoteImageUrl,
    record.providerImageUrl,
    record.downloadUrl,
    collectOutputImageUrls(payload)[0],
  ));
  return {
    taskId: record.taskId || task.taskId || payload.taskId || payload.data?.taskId || "",
    upstreamTaskId: record.upstreamTaskId || task.upstreamTaskId || "",
    status: record.status || task.status || (imageUrl ? "succeeded" : "submitted"),
    imageUrl,
    imageUrls: imageUrl ? [imageUrl] : [],
    error: record.error || task.error || payload.error || payload.message || "",
    record,
    raw: payload,
  };
}

async function gatewaySubmitWan27ImageEditTask({
  imageUrl,
  imageUrls,
  prompt,
  ratio = "9:16",
  resolution = "2K",
  model = WAN27_IMAGE_PRO_MODEL,
  input = {},
  parameters = {},
  waitForResult = true,
} = {}) {
  const orderedImages = arrayFromBody(imageUrls).map((item) => String(item || "").trim()).filter(Boolean);
  if (!orderedImages.length && imageUrl) orderedImages.push(String(imageUrl || "").trim());
  const gatewayBody = {
    prompt,
    ratio,
    resolution,
    model,
    imageUrls: orderedImages,
    input: plainObject(input),
    parameters: plainObject(parameters),
    async: waitForResult ? false : true,
  };
  const payload = await gatewayRequest("POST", "/api/wan27/image-edit", gatewayBody);
  return { task: gatewayImageTaskFromPayload(payload), payload: gatewayBody, raw: payload };
}

async function gatewayQueryTask(taskId) {
  const payload = await gatewayRequest("GET", `/api/generation-records/${encodeURIComponent(taskId)}`);
  return gatewayTaskFromPayload(payload);
}

function apizTaskId(task = {}) {
  return task.task_id || task.taskId || task.id || task.data?.task_id || task.data?.id || "";
}

function apizStatus(task = {}) {
  return task.status || task.state || task.task_status || task.data?.status || "submitted";
}

function apizResultUrl(task = {}) {
  return findVideoUrl(task) || collectOutputImageUrls(task)[0] || "";
}

function isLikelyVideoUrl(value = "") {
  return /\.(mp4|webm|mov|m4v)(?:[?#]|$)/i.test(String(value || ""));
}

async function maybeDownloadApizVideo(record = {}, resultUrl = "") {
  if (!record?.taskId || !resultUrl || !isLikelyVideoUrl(resultUrl)) return {};
  try {
    return await downloadGeneratedVideo(record.taskId, resultUrl);
  } catch (error) {
    return { downloadError: error.message || "Failed to download generated video." };
  }
}

async function settleApizGenerationRecord(record = {}, task = {}, reason = "query") {
  if (!record?.taskId || record.provider !== "apiz") return record;
  const status = apizStatus(task) || record.status || "";
  if (!isSucceededStatus(status) && !isFailedStatus(status)) return record;
  if (record.billingSettledAt) {
    const resultUrl = apizResultUrl(task) || record.remoteVideoUrl || "";
    if (isSucceededStatus(status) && resultUrl && (!record.localVideoUrl || !record.cdnVideoUrl) && isLikelyVideoUrl(resultUrl)) {
      const media = await maybeDownloadApizVideo(record, resultUrl);
      if (media.localVideoUrl || media.cdnVideoUrl || media.localPosterUrl) {
        return upsertGenerationRecord({
          taskId: record.taskId,
          videoUrl: localPublicAssetStorageEnabled()
            ? (media.localVideoUrl || media.cdnVideoUrl || record.videoUrl || resultUrl)
            : (media.cdnVideoUrl || media.localVideoUrl || record.videoUrl || resultUrl),
          localVideoUrl: media.localVideoUrl || record.localVideoUrl || "",
          localVideoPath: media.localVideoPath || record.localVideoPath || "",
          localPosterUrl: media.localPosterUrl || record.localPosterUrl || "",
          localPosterPath: media.localPosterPath || record.localPosterPath || "",
          posterUrl: localPublicAssetStorageEnabled()
            ? (media.localPosterUrl || media.cdnPosterUrl || record.posterUrl || "")
            : (media.cdnPosterUrl || media.localPosterUrl || record.posterUrl || ""),
          cdnVideoUrl: media.cdnVideoUrl || record.cdnVideoUrl || "",
          cdnPosterUrl: media.cdnPosterUrl || record.cdnPosterUrl || "",
          cdnError: media.cdnError || record.cdnError || "",
          error: media.downloadError || record.error || "",
        });
      }
    }
    return record;
  }

  let mediaUpdates = {};
  if (isSucceededStatus(status)) {
    const resultUrl = apizResultUrl(task) || record.remoteVideoUrl || "";
    const media = (!record.localVideoUrl || !record.cdnVideoUrl) && isLikelyVideoUrl(resultUrl)
      ? await maybeDownloadApizVideo(record, resultUrl)
      : {};
    if (media.localVideoUrl || media.cdnVideoUrl || media.localPosterUrl || media.downloadError) {
      mediaUpdates = {
        videoUrl: localPublicAssetStorageEnabled()
          ? (media.localVideoUrl || media.cdnVideoUrl || record.videoUrl || resultUrl)
          : (media.cdnVideoUrl || media.localVideoUrl || record.videoUrl || resultUrl),
        localVideoUrl: media.localVideoUrl || record.localVideoUrl || "",
        localVideoPath: media.localVideoPath || record.localVideoPath || "",
        localPosterUrl: media.localPosterUrl || record.localPosterUrl || "",
        localPosterPath: media.localPosterPath || record.localPosterPath || "",
        posterUrl: localPublicAssetStorageEnabled()
          ? (media.localPosterUrl || media.cdnPosterUrl || record.posterUrl || "")
          : (media.cdnPosterUrl || media.localPosterUrl || record.posterUrl || ""),
        cdnVideoUrl: media.cdnVideoUrl || record.cdnVideoUrl || "",
        cdnPosterUrl: media.cdnPosterUrl || record.cdnPosterUrl || "",
        cdnError: media.cdnError || record.cdnError || "",
        error: media.downloadError || record.error || "",
      };
    }
  }

  const db = await readDb();
  let finalCredits = 0;
  let originalFinalCredits = 0;
  let delta = 0;
  let billingStatus = "settled";
  const preDeducted = creditsAmount(record.preDeductedCredits || 0);
  const pricingMultiplier = normalizeUserPricingMultiplier(record.userPricingMultiplier ?? record.pricingMultiplier ?? (db.users || []).find((user) => user.id === record.userId), pricingContextForRecord(record));

  if (isFailedStatus(status)) {
    finalCredits = 0;
    originalFinalCredits = 0;
    delta = preDeducted;
    billingStatus = "refunded";
  } else {
    const reported = extractApizReportedCredits(task) ?? (record.createReportedCredits === undefined ? null : creditsAmount(record.createReportedCredits));
    originalFinalCredits = reported === null
      ? creditsAmount(record.originalPreDeductedCredits ?? record.pricingEstimate?.originalCredits ?? preDeducted)
      : sellingCredits(reported);
    finalCredits = reported === null ? preDeducted : applyUserPricingMultiplierToCredits(originalFinalCredits, pricingMultiplier);
    delta = preDeducted - finalCredits;
  }

  try {
    if (delta > 0) {
      await changeUserCredits(db, record.userId, delta, "generation_refund", {
        taskId: record.taskId,
        reason,
        preDeducted,
        finalCredits,
        originalFinalCredits,
        pricingMultiplier,
      });
      await recordSubtokenAdjustment(record, {
        taskId: record.taskId,
        type: "generation_refund",
        amount: -delta,
        meta: { reason, preDeducted, finalCredits, originalFinalCredits, pricingMultiplier },
      });
      if (!dbEnabled()) await writeDb(db);
    } else if (delta < 0) {
      await changeUserCredits(db, record.userId, delta, "generation_settle", {
        taskId: record.taskId,
        reason,
        preDeducted,
        finalCredits,
        originalFinalCredits,
        pricingMultiplier,
      });
      await recordSubtokenAdjustment(record, {
        taskId: record.taskId,
        type: "generation_settle",
        amount: Math.abs(delta),
        meta: { reason, preDeducted, finalCredits, originalFinalCredits, pricingMultiplier },
      });
      if (!dbEnabled()) await writeDb(db);
    }
  } catch (error) {
    if (error.code === "INSUFFICIENT_CREDITS" || error.code === "SUBTOKEN_QUOTA_EXCEEDED") {
      billingStatus = "settle_pending_insufficient";
      return upsertGenerationRecord({
        taskId: record.taskId,
        finalCredits,
        originalFinalCredits,
        userPricingMultiplier: pricingMultiplier,
        billingStatus,
        billingError: error.message || "Not enough credits or sub token quota for final settlement.",
      });
    }
    throw error;
  }

  return upsertGenerationRecord({
    taskId: record.taskId,
    ...mediaUpdates,
    finalCredits,
    originalFinalCredits,
    userPricingMultiplier: pricingMultiplier,
    billingStatus,
    billingSettledAt: new Date().toISOString(),
    billingError: "",
  });
}

function needsApizFailureRefund(record = {}) {
  if (String(record.provider || "").toLowerCase() !== "apiz") return false;
  if (!record.taskId || !record.userId || !isFailedStatus(record.status)) return false;
  const billingStatus = String(record.billingStatus || "").toLowerCase();
  if (billingStatus === "refunded") return false;
  const preDeducted = creditsAmount(record.preDeductedCredits || 0);
  const finalCredits = record.finalCredits === undefined || record.finalCredits === null
    ? preDeducted
    : creditsAmount(record.finalCredits || 0);
  return preDeducted > 0 && (finalCredits > 0 || ["pre_deducted", "refund_failed"].includes(billingStatus));
}

function needsSeedanceFailureRefund(record = {}) {
  const provider = String(record.provider || "").toLowerCase();
  if (!["seedance", "seedance-nsfw", "seedance25", SEEDANCE25_DIRECT_PROVIDER, "aliyun-wan30", "aliyun-wan27", "aliyun-happyhorse", "seedream5-image"].includes(provider) && !isVegaProvider(provider)) return false;
  if (!record.taskId || !record.userId || !isFailedStatus(record.status)) return false;
  const billingStatus = String(record.billingStatus || "").toLowerCase();
  if (billingStatus === "refunded") return false;
  const preDeducted = creditsAmount(record.preDeductedCredits || 0);
  const finalCredits = record.finalCredits === undefined || record.finalCredits === null
    ? preDeducted
    : creditsAmount(record.finalCredits || 0);
  return preDeducted > 0 && (finalCredits > 0 || ["pre_deducted", "refund_failed"].includes(billingStatus));
}

function seedanceUsesTokenPricing(record = {}) {
  const provider = String(record.provider || "").toLowerCase();
  if (!["seedance", SEEDANCE25_DIRECT_PROVIDER].includes(provider)) return false;
  if (record.awaitingUpstreamTask && !record.upstreamTaskId) return false;
  const pricing = record.pricingEstimate && typeof record.pricingEstimate === "object" ? record.pricingEstimate : {};
  if (String(pricing.source || "") === "public_duration_rate") return false;
  if (["seedance_token_estimate", "seedance25_direct_token_estimate"].includes(String(pricing.source || ""))) return true;
  return String(record.source || "").includes("advanced") && record.billingSettledAt === "";
}

// Seedance 2.5 NSFW is sold from the configured duration price. The upstream
// token usage is retained for cost auditing, but must not change the customer
// charge after the configured sale price was pre-deducted.
function seedanceUsesConfiguredSalePrice(record = {}) {
  if (String(record.provider || "").toLowerCase() !== SEEDANCE25_DIRECT_PROVIDER) return false;
  return creditsAmount(record.preDeductedCredits || 0) > 0;
}

function extractUsageCompletionTokens(value, depth = 0) {
  if (value === null || value === undefined || depth > 30) return null;
  if (typeof value === "string") {
    const text = value.trim();
    if (!text) return null;
    if (text.startsWith("{") || text.startsWith("[")) {
      try {
        return extractUsageCompletionTokens(JSON.parse(text), depth + 1);
      } catch {
        return null;
      }
    }
    return null;
  }
  if (Array.isArray(value)) {
    let best = null;
    value.forEach((item) => {
      const next = extractUsageCompletionTokens(item, depth + 1);
      if (next !== null) best = Math.max(best ?? 0, next);
    });
    return best;
  }
  if (typeof value !== "object") return null;

  const usage = value.usage && typeof value.usage === "object" ? value.usage : value;
  for (const key of ["completion_tokens", "output_tokens", "video_tokens"]) {
    const next = Number(usage[key]);
    if (Number.isFinite(next) && next > 0) return Math.ceil(next);
  }

  let best = null;
  for (const item of Object.values(value)) {
    if (!item || typeof item !== "object") continue;
    const next = extractUsageCompletionTokens(item, depth + 1);
    if (next !== null) best = Math.max(best ?? 0, next);
  }
  return best;
}

function seedanceFinalCreditsFromUsage(record = {}) {
  const completionTokens = extractUsageCompletionTokens(record.queryResponse) ?? extractUsageCompletionTokens(record.createResponse);
  if (!completionTokens) return null;
  const pricing = record.pricingEstimate && typeof record.pricingEstimate === "object" ? record.pricingEstimate : {};
  const directSeedance25 = String(record.provider || "").toLowerCase() === SEEDANCE25_DIRECT_PROVIDER
    || String(pricing.source || "") === "seedance25_direct_token_estimate";
  const resolution = normalizeAdvancedResolution(record.resolution || pricing.resolution || record.params?.resolution);
  const usdPerMillionTokens = Number(pricing.usdPerMillionTokens || seedanceUsdPerMillionTokens(resolution, {
    model: record.model || pricing.model,
    seedanceTier: pricing.seedanceTier || record.params?.seedanceTier,
    hasVideoInput: Boolean(pricing.hasVideoInput || pricing.videoInputSeconds || record.params?.inputVideoSeconds || record.params?.videoInputSeconds),
  }));
  const yuanPerMillionTokens = Number(pricing.yuanPerMillionTokens || pricingNumber(usdPerMillionTokens * UPSTREAM_USD_CNY_RATE, 0, 0, 6));
  const markup = Number(pricing.markup || ADVANCED_GENERATION_MARKUP) || ADVANCED_GENERATION_MARKUP;
  const baseCredits = directSeedance25
    ? creditsAmount((completionTokens * usdPerMillionTokens * DEFAULT_CREDITS_PER_USD) / 1000000)
    : creditsAmount((completionTokens * yuanPerMillionTokens * ADVANCED_CREDITS_PER_CNY) / 1000000);
  const originalCredits = creditsAmount(Math.round(baseCredits * markup));
  const pricingMultiplier = normalizeUserPricingMultiplier(record.userPricingMultiplier ?? record.pricingMultiplier ?? pricing.userPricingMultiplier ?? 1);
  return {
    completionTokens,
    usdPerMillionTokens,
    usdCnyRate: Number(pricing.usdCnyRate || UPSTREAM_USD_CNY_RATE),
    yuanPerMillionTokens,
    baseCredits,
    markup,
    originalCredits,
    pricingMultiplier,
    credits: applyUserPricingMultiplierToCredits(originalCredits, pricingMultiplier),
  };
}

function usesWan30AdaptiveDurationPricing(record = {}) {
  const pricing = record.pricingEstimate && typeof record.pricingEstimate === "object" ? record.pricingEstimate : {};
  return String(record.provider || "").toLowerCase() === "aliyun-wan30"
    && pricing.adaptiveDuration === true
    && Number(pricing.creditsPerSecond) > 0;
}


function vegaMediaUrls(value, keys = ["url"]) {
  return arrayFromBody(value)
    .map((item) => {
      if (typeof item === "string") return item.trim();
      if (!item || typeof item !== "object" || Array.isArray(item)) return "";
      return String(firstPresent(...keys.map((key) => item[key]), "") || "").trim();
    })
    .filter(Boolean);
}

function vegaMediaAssetIds(value) {
  return arrayFromBody(value)
    .map((item) => {
      if (!item || typeof item !== "object" || Array.isArray(item)) return "";
      return String(firstPresent(item.userAssetId, item.assetId, item.id, "") || "").trim();
    })
    .filter(Boolean);
}

function vegaMediaAssetUris(value) {
  return arrayFromBody(value)
    .flatMap((item) => {
      if (typeof item === "string") return [item];
      if (!item || typeof item !== "object" || Array.isArray(item)) return [];
      return [
        item.assetUri,
        item.referenceAssetUri,
        item.seedanceAssetUri,
        item.url,
        item.imageUrl,
        item.image_url?.url,
        item.image_url,
        item.videoUrl,
        item.video_url?.url,
        item.video_url,
        item.audioUrl,
        item.audio_url?.url,
        item.audio_url,
        item.Url,
        item.URL,
      ];
    })
    .map((uri) => String(uri || "").trim())
    .filter((uri) => uri.startsWith("asset://"));
}

function vegaAssetUrisFromFileInfos(fileInfos = [], category = "", usage = "") {
  return (Array.isArray(fileInfos) ? fileInfos : [])
    .filter((item) => (!category || item?.Category === category) && (!usage || item?.Usage === usage))
    .map((item) => String(item?.Url || "").trim())
    .filter((uri) => uri.startsWith("asset://"));
}

function vegaRequestMedia(merged = {}) {
  const firstFrameUrl = String(firstPresent(
    merged.firstFrameUrl,
    merged.first_frame_url,
    merged.imageUrl,
    merged.image_url,
  ) || "").trim();
  const lastFrameUrl = String(firstPresent(
    merged.lastFrameUrl,
    merged.last_frame_url,
    merged.endImageUrl,
    merged.end_image_url,
  ) || "").trim();
  const referenceImages = [...new Set([
    ...vegaMediaUrls(merged.referenceImages, ["url", "imageUrl", "image_url"]),
    ...vegaMediaUrls(merged.reference_images, ["url", "imageUrl", "image_url"]),
    ...vegaMediaUrls(merged.referenceImageUrls, ["url", "imageUrl", "image_url"]),
    ...vegaMediaUrls(merged.reference_image_urls, ["url", "imageUrl", "image_url"]),
  ].map((url) => String(url || "").trim()).filter((url) => url && url !== firstFrameUrl && url !== lastFrameUrl))];
  const referenceVideos = [...new Set([
    ...vegaMediaUrls(merged.referenceVideos, ["url", "videoUrl", "video_url"]),
    ...vegaMediaUrls(merged.reference_videos, ["url", "videoUrl", "video_url"]),
    ...vegaMediaUrls(merged.referenceVideoUrls, ["url", "videoUrl", "video_url"]),
    ...vegaMediaUrls(merged.reference_video_urls, ["url", "videoUrl", "video_url"]),
  ].map((url) => String(url || "").trim()).filter(Boolean))];
  const referenceAudios = [...new Set([
    ...vegaMediaUrls(merged.referenceAudios, ["url", "audioUrl", "audio_url"]),
    ...vegaMediaUrls(merged.reference_audios, ["url", "audioUrl", "audio_url"]),
    ...vegaMediaUrls(merged.referenceAudioUrls, ["url", "audioUrl", "audio_url"]),
    ...vegaMediaUrls(merged.reference_audio_urls, ["url", "audioUrl", "audio_url"]),
  ].map((url) => String(url || "").trim()).filter(Boolean))];
  const firstFrameAssetId = String(firstPresent(
    merged.firstFrameAssetId,
    merged.first_frame_asset_id,
    merged.firstFrameUserAssetId,
    "",
  ) || "").trim();
  const lastFrameAssetId = String(firstPresent(
    merged.lastFrameAssetId,
    merged.last_frame_asset_id,
    merged.lastFrameUserAssetId,
    "",
  ) || "").trim();
  const firstFrameAssetUri = String(firstPresent(
    merged.firstFrameAssetUri,
    merged.first_frame_asset_uri,
    vegaMediaAssetUris(merged.firstFrameUrl)[0],
    vegaMediaAssetUris(merged.first_frame_url)[0],
    vegaMediaAssetUris(merged.imageUrl)[0],
    vegaMediaAssetUris(merged.image_url)[0],
    "",
  ) || "").trim();
  const lastFrameAssetUri = String(firstPresent(
    merged.lastFrameAssetUri,
    merged.last_frame_asset_uri,
    vegaMediaAssetUris(merged.lastFrameUrl)[0],
    vegaMediaAssetUris(merged.last_frame_url)[0],
    vegaMediaAssetUris(merged.endImageUrl)[0],
    vegaMediaAssetUris(merged.end_image_url)[0],
    "",
  ) || "").trim();
  const referenceImageAssetIds = [
    ...arrayFromBody(merged.referenceImageAssetIds),
    ...arrayFromBody(merged.reference_image_asset_ids),
    ...vegaMediaAssetIds(firstPresent(merged.referenceImages, merged.reference_images)),
  ].map((id) => String(id || "").trim()).filter(Boolean);
  const referenceVideoAssetIds = [
    ...arrayFromBody(merged.referenceVideoAssetIds),
    ...arrayFromBody(merged.reference_video_asset_ids),
    ...vegaMediaAssetIds(firstPresent(merged.referenceVideos, merged.reference_videos)),
  ].map((id) => String(id || "").trim()).filter(Boolean);
  const referenceAudioAssetIds = [
    ...arrayFromBody(merged.referenceAudioAssetIds),
    ...arrayFromBody(merged.reference_audio_asset_ids),
    ...vegaMediaAssetIds(firstPresent(merged.referenceAudios, merged.reference_audios)),
  ].map((id) => String(id || "").trim()).filter(Boolean);
  const referenceImageAssetUris = [...new Set([
    ...arrayFromBody(merged.referenceImageAssetUris),
    ...arrayFromBody(merged.reference_image_asset_uris),
    ...vegaMediaAssetUris(firstPresent(merged.referenceImages, merged.reference_images)),
  ])];
  const referenceVideoAssetUris = [...new Set([
    ...arrayFromBody(merged.referenceVideoAssetUris),
    ...arrayFromBody(merged.reference_video_asset_uris),
    ...vegaMediaAssetUris(firstPresent(merged.referenceVideos, merged.reference_videos)),
  ])];
  const referenceAudioAssetUris = [...new Set([
    ...arrayFromBody(merged.referenceAudioAssetUris),
    ...arrayFromBody(merged.reference_audio_asset_uris),
    ...vegaMediaAssetUris(firstPresent(merged.referenceAudios, merged.reference_audios)),
  ])];
  return {
    firstFrameUrl,
    lastFrameUrl,
    firstFrameAssetId,
    lastFrameAssetId,
    firstFrameAssetUri,
    lastFrameAssetUri,
    referenceImages,
    referenceVideos,
    referenceAudios,
    referenceImageAssetIds,
    referenceVideoAssetIds,
    referenceAudioAssetIds,
    referenceImageAssetUris,
    referenceVideoAssetUris,
    referenceAudioAssetUris,
  };
}

