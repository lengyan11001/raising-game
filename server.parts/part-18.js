async function submitWan27VideoTask(options = {}) {
  return submitAliyunVideoTask({ ...options, provider: "wan27" });
}

function normalizeWan27ImageTask(raw = {}) {
  const output = raw.output || raw.data?.output || raw.data || raw;
  const imageUrls = collectOutputImageUrls(raw);
  return {
    taskId: output.task_id || output.taskId || raw.task_id || raw.taskId || raw.request_id || raw.requestId || "",
    status: output.task_status || output.status || raw.task_status || raw.status || (imageUrls.length ? "completed" : "pending"),
    imageUrls,
    error: output.message || output.error_message || output.error?.message || raw.message || raw.error_message || raw.error?.message || "",
  };
}

async function resolveWan27ImageResult(raw = {}, { timeoutMs = 10 * 60 * 1000, pollIntervalMs = 3000 } = {}) {
  let task = normalizeWan27ImageTask(raw);
  if ((task.imageUrls.length && isCompletedStatus(task.status)) || (task.imageUrls.length && !task.taskId)) return task;
  if (isFailedStatus(task.status)) return task;
  if (!task.taskId) return task;

  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    await delay(pollIntervalMs);
    const queried = await queryAliyunOrMulerouterTask(task.taskId, { method: "GET" });
    task = normalizeWan27ImageTask(queried);
    if (task.imageUrls.length && isCompletedStatus(task.status)) return task;
    if (isFailedStatus(task.status)) return task;
  }
  return task;
}

function wan27ImageRequestOptions(body = {}, {
  defaultModel = WAN27_IMAGE_PRO_MODEL,
  defaultRatio = "9:16",
  defaultResolution = "2K",
  includeSizeSelection = true,
} = {}) {
  const source = { ...requestParamsFromBody(body), ...body };
  const ratio = includeSizeSelection
    ? normalizeWan27ImageRatio(firstPresent(source.ratio, source.aspect_ratio, defaultRatio))
    : "";
  const resolution = includeSizeSelection
    ? normalizeWan27ImageResolution(firstPresent(source.resolution, defaultResolution))
    : "";
  const parameters = {
    ...plainObject(source.parameters),
    ...plainObject(source.parameter),
  };
  if (includeSizeSelection) {
    if (firstPresent(source.size, parameters.size) !== undefined) parameters.size = String(firstPresent(source.size, parameters.size));
    else parameters.size = wan27ImageSize(resolution, ratio);
  } else {
    delete parameters.size;
  }
  parameters.n = Number(firstPresent(parameters.n, source.n, 1)) || 1;
  parameters.watermark = boolFromRequest(firstPresent(parameters.watermark, source.watermark), false);
  return {
    model: String(firstPresent(source.model, defaultModel, WAN27_IMAGE_PRO_MODEL)),
    ratio,
    resolution,
    includeSizeSelection,
    input: plainObject(source.input),
    parameters,
  };
}

function exposedWan27ImageParams(imageOptions = {}) {
  const parameters = { ...plainObject(imageOptions.parameters) };
  const size = parameters.size;
  delete parameters.size;
  return {
    ...(imageOptions.ratio ? { ratio: imageOptions.ratio } : {}),
    ...(imageOptions.resolution ? { resolution: imageOptions.resolution } : {}),
    model: imageOptions.model,
    ...(size ? { size } : {}),
    ...(Object.keys(parameters).length ? { parameters } : {}),
  };
}

function wan27ImageParamsForRecord(body = {}, imageOptions = {}, extra = {}) {
  const source = {
    ...requestParamsFromBody(body),
    ...plainObject(body?.params),
  };
  if (imageOptions.includeSizeSelection === false) {
    ["ratio", "aspect_ratio", "aspectRatio", "resolution", "resolution_name", "resolutionName", "size"].forEach((key) => delete source[key]);
    const nested = plainObject(source.parameters);
    delete nested.size;
    if (Object.keys(nested).length) source.parameters = nested;
    else delete source.parameters;
  }
  return { ...source, ...extra, ...exposedWan27ImageParams(imageOptions) };
}

async function submitWan27ImageModify({
  imageUrl,
  imageUrls,
  prompt,
  ratio = "9:16",
  resolution = "2K",
  model = WAN27_IMAGE_PRO_MODEL,
  input = {},
  parameters = {},
  waitForResult = true,
  includeSizeSelection = true,
  user = null,
  userId = "",
} = {}) {
  const orderedImages = arrayFromBody(imageUrls).map((item) => String(item || "").trim()).filter(Boolean);
  if (!orderedImages.length && imageUrl) orderedImages.push(String(imageUrl || "").trim());
  if (includeSizeSelection && normalizeWan27ImageResolution(resolution) === "4K" && orderedImages.length) {
    const error = new Error("Wan2.7 Image 4K is only available for text-to-image without reference images.");
    error.statusCode = 400;
    error.code = "WAN27_IMAGE_4K_TEXT_ONLY";
    throw error;
  }
  if (orderedImages.length > 9) {
    const error = new Error("Wan2.7 image supports at most 9 input images.");
    error.statusCode = 400;
    error.code = "TOO_MANY_IMAGES";
    throw error;
  }
  const content = [
    ...orderedImages.map((url) => ({ image: url })),
    { text: prompt },
  ];
  const payload = {
    model: model || WAN27_IMAGE_PRO_MODEL,
    input: {
      ...plainObject(input),
      messages: [
        {
          role: "user",
          content,
        },
      ],
    },
    parameters: {
      ...plainObject(parameters),
      ...(includeSizeSelection ? { size: firstPresent(parameters.size, wan27ImageSize(resolution, ratio)) } : {}),
      n: firstPresent(parameters.n, 1),
      watermark: firstPresent(parameters.watermark, false),
    },
  };
  if (!includeSizeSelection) delete payload.parameters.size;
  payload.parameters.n = Number(firstPresent(parameters.n, payload.parameters.n, 1)) || 1;
  payload.parameters.watermark = boolFromRequest(firstPresent(parameters.watermark, payload.parameters.watermark), false);
  let routeUser = user || currentAuthContext()?.user || null;
  if (!routeUser && userId) {
    try {
      const routeDb = await readDb();
      routeUser = (routeDb.users || []).find((entry) => entry.id === userId && !isSoftDeleted(entry)) || null;
    } catch {}
  }
  const imageDecision = await mulerouterAliyun.decideImageEdit({
    user: routeUser,
    imageUrls: orderedImages,
    prompt,
    parameters: {
      ...plainObject(parameters),
      n: payload.parameters.n,
      watermark: payload.parameters.watermark,
      seed: firstPresent(parameters.seed, payload.parameters.seed),
    },
  });
  if (imageDecision.use) {
    console.log("[mulerouter-image-edit]", JSON.stringify({
      slug: imageDecision.slug,
      username: routeUser?.username || "",
      forced: mulerouterAliyun.userForced(routeUser),
    }));
    const submitted = await mulerouterAliyun.submit(imageDecision);
    const seeded = { output: { task_id: submitted.task.taskId, task_status: submitted.task.status, url: submitted.task.imageUrls[0] || "" } };
    const task = waitForResult ? await resolveWan27ImageResult(seeded) : submitted.task;
    return { task, payload: imageDecision.body, raw: submitted.raw, upstreamSource: "mulerouter", upstreamModel: imageDecision.slug };
  }
  const raw = await aliyunDashscopeRequest("/api/v1/services/aigc/image-generation/generation", {
    method: "POST",
    body: payload,
    asyncTask: true,
  });
  return { task: waitForResult ? await resolveWan27ImageResult(raw) : normalizeWan27ImageTask(raw), payload, raw, upstreamSource: "aliyun", upstreamModel: payload.model || "" };
}

async function submitWan27ImageTextGenerate({
  prompt,
  ratio = "9:16",
  resolution = "2K",
  model = WAN27_IMAGE_PRO_MODEL,
  input = {},
  parameters = {},
  user = null,
  userId = "",
} = {}) {
  const payload = {
    model: model || WAN27_IMAGE_PRO_MODEL,
    input: {
      ...plainObject(input),
      messages: [
        {
          role: "user",
          content: [
            { text: prompt },
          ],
        },
      ],
    },
    parameters: {
      ...plainObject(parameters),
      size: firstPresent(parameters.size, wan27ImageSize(resolution, ratio)),
      n: firstPresent(parameters.n, 1),
      watermark: firstPresent(parameters.watermark, false),
    },
  };
  payload.parameters.n = Number(firstPresent(parameters.n, payload.parameters.n, 1)) || 1;
  payload.parameters.watermark = boolFromRequest(firstPresent(parameters.watermark, payload.parameters.watermark), false);
  let routeUser = user || currentAuthContext()?.user || null;
  if (!routeUser && userId) {
    try {
      const routeDb = await readDb();
      routeUser = (routeDb.users || []).find((entry) => entry.id === userId && !isSoftDeleted(entry)) || null;
    } catch {}
  }
  const imageDecision = await mulerouterAliyun.decideTextToImage({
    user: routeUser,
    prompt,
    parameters: {
      ...plainObject(parameters),
      n: payload.parameters.n,
      watermark: payload.parameters.watermark,
      seed: firstPresent(parameters.seed, payload.parameters.seed),
    },
  });
  if (imageDecision.use) {
    console.log("[mulerouter-image-t2i]", JSON.stringify({
      slug: imageDecision.slug,
      username: routeUser?.username || "",
      forced: mulerouterAliyun.userForced(routeUser),
    }));
    const submitted = await mulerouterAliyun.submit(imageDecision);
    const seeded = { output: { task_id: submitted.task.taskId, task_status: submitted.task.status, url: submitted.task.imageUrls[0] || "" } };
    const task = await resolveWan27ImageResult(seeded);
    return { task, payload: imageDecision.body, raw: submitted.raw, upstreamSource: "mulerouter", upstreamModel: imageDecision.slug };
  }
  const raw = await aliyunDashscopeRequest("/api/v1/services/aigc/image-generation/generation", {
    method: "POST",
    body: payload,
    asyncTask: true,
  });
  return { task: await resolveWan27ImageResult(raw), payload, raw, upstreamSource: "aliyun", upstreamModel: payload.model || "" };
}

async function refreshWan27GenerationRecord(record = {}, { download = false, reason = "query", upstreamRaw = null } = {}) {
  const queryTaskId = record.upstreamTaskId || record.taskId;
  if (!queryTaskId) return record;
  const provider = record.provider === "aliyun-wan30" ? "wan30" : "wan27";
  const capability = String(record.videoCapability || record.params?.videoCapability || "").toLowerCase();
  const mulerouterTask = record.upstreamSource === "mulerouter" || String(queryTaskId).startsWith("mr:");
  const prime = !mulerouterTask && provider === "wan30"
    && capability === "wan30-video-prime";
  let raw;
  if (upstreamRaw) {
    raw = await queryAliyunOrMulerouterTask(queryTaskId, {
      method: "GET",
      provider,
      prime,
      mulerouterRaw: upstreamRaw,
    });
  } else try {
    raw = await queryAliyunOrMulerouterTask(queryTaskId, {
      method: "GET",
      provider,
      prime,
    });
  } catch (error) {
    if (!prime || !ALIYUN_WAN30_PRIME_API_KEY || mulerouterTask) throw error;
    console.warn("[aliyun-video-prime-fallback] Agentic Mobile query failed; retrying legacy Wan endpoint", error?.message || error);
    raw = await aliyunDashscopeRequest(`/api/v1/tasks/${encodeURIComponent(queryTaskId)}`, {
      method: "GET",
      provider,
      prime: false,
    });
  }
  const task = normalizeWan27Task(raw);
  const taskAgeMs = Date.now() - Date.parse(record.createdAt || "");
  if (
    String(task.status || "").toUpperCase() === "UNKNOWN" &&
    !task.videoUrl &&
    (!Number.isFinite(taskAgeMs) || taskAgeMs > 10 * 60 * 1000)
  ) {
    task.status = "failed";
    task.error = task.error || "Upstream task returned UNKNOWN without a video.";
  }
  let localVideoUrl = record.localVideoUrl || "";
  let localVideoPath = record.localVideoPath || "";
  let localPosterUrl = record.localPosterUrl || "";
  let localPosterPath = record.localPosterPath || "";
  let cdnVideoUrl = record.cdnVideoUrl || "";
  let cdnPosterUrl = record.cdnPosterUrl || "";
  let storageProvider = record.storageProvider || "";
  let storageKey = record.storageKey || "";
  let posterStorageProvider = record.posterStorageProvider || "";
  let posterStorageKey = record.posterStorageKey || "";
  let cdnError = record.cdnError || "";
  let downloadError = "";
  const remoteVideoUrl = task.videoUrl || record.remoteVideoUrl || "";
  if (download && generatedOutputStorageEnabled() && !generationRecordIsApiTask(record) && isSucceededStatus(task.status) && remoteVideoUrl) {
    try {
      const localVideo = await downloadGeneratedVideo(record.taskId, remoteVideoUrl);
      localVideoUrl = localVideo.localVideoUrl;
      localVideoPath = localVideo.localVideoPath;
      localPosterUrl = localVideo.localPosterUrl || localPosterUrl;
      localPosterPath = localVideo.localPosterPath || localPosterPath;
      cdnVideoUrl = localVideo.cdnVideoUrl || cdnVideoUrl;
      cdnPosterUrl = localVideo.cdnPosterUrl || cdnPosterUrl;
      storageProvider = localVideo.storageProvider || storageProvider;
      storageKey = localVideo.storageKey || storageKey;
      posterStorageProvider = localVideo.posterStorageProvider || posterStorageProvider;
      posterStorageKey = localVideo.posterStorageKey || posterStorageKey;
      cdnError = localVideo.cdnError || cdnError;
    } catch (error) {
      downloadError = error.message || "Failed to download generated video.";
    }
  }
  const nextRecord = await upsertAndSettleGenerationRecord({
    taskId: record.taskId,
    upstreamTaskId: task.taskId || queryTaskId,
    status: task.status || record.status || "unknown",
    remoteVideoUrl,
    localVideoUrl,
    localVideoPath,
    localPosterUrl,
    localPosterPath,
    posterUrl: localPublicAssetStorageEnabled()
      ? (localPosterUrl || cdnPosterUrl || record.posterUrl || "")
      : (cdnPosterUrl || localPosterUrl || record.posterUrl || ""),
    cdnVideoUrl,
    cdnPosterUrl,
    storageProvider,
    storageKey,
    posterStorageProvider,
    posterStorageKey,
    cdnError,
    error: task.error || downloadError || record.error || "",
    queryResponse: raw,
    completedAt: isSucceededStatus(task.status) ? (record.completedAt || new Date().toISOString()) : record.completedAt || "",
  }, reason);
  if (
    !download
    && !generationRecordIsApiTask(nextRecord)
    && isSucceededStatus(nextRecord.status)
    && remoteVideoUrl
    && generatedOutputStorageEnabled()
    && !String(nextRecord.cdnVideoUrl || "").trim()
  ) {
    queueGeneratedVideoDownload(nextRecord.taskId || record.taskId, remoteVideoUrl, `${reason}-background-download`);
  }
  return nextRecord;
}

async function refreshWan27ImageGenerationRecord(record = {}, { reason = "query", upstreamRaw = null } = {}) {
  const queryTaskId = record.upstreamTaskId || record.taskId;
  if (!queryTaskId) return record;
  const raw = await queryAliyunOrMulerouterTask(queryTaskId, { method: "GET", ...(upstreamRaw ? { mulerouterRaw: upstreamRaw } : {}) });
  const task = normalizeWan27ImageTask(raw);
  const imageUrl = task.imageUrls[0] || record.remoteImageUrl || "";
  const failed = isFailedStatus(task.status);
  if (!imageUrl && !failed) {
    return updateAssetImageModifyRecord(record.taskId, {
      upstreamTaskId: task.taskId || queryTaskId,
      status: task.status || record.status || "running",
      awaitingUpstreamTask: true,
      queryResponse: raw,
      error: task.error || "",
    }, reason);
  }
  if (failed && !imageUrl) {
    const preDeducted = Number(record.preDeductedCredits || 0);
    let refunded = preDeducted <= 0;
    let refundError = null;
    if (preDeducted > 0 && record.billingStatus === "pre_deducted") {
      const result = await refundCreditsWithSubtoken(record, record.userId, preDeducted, "asset_image_modify_refund", {
        taskId: record.taskId,
        error: task.error || "Wan2.7 image edit failed.",
      }, { logTag: "wan27-image-edit-refresh" });
      refunded = result.refunded;
      refundError = result.error;
    }
    return updateAssetImageModifyRecord(record.taskId, {
      upstreamTaskId: task.taskId || queryTaskId,
      status: "failed",
      awaitingUpstreamTask: false,
      queryResponse: raw,
      error: task.error || "Wan2.7 image edit failed.",
      finalCredits: 0,
      originalFinalCredits: 0,
      billingStatus: preDeducted <= 0 ? "free" : refunded ? "refunded" : "pre_deducted",
      billingError: refundError ? `Refund failed: ${refundError.message || refundError}` : "",
      billingSettledAt: refunded ? new Date().toISOString() : "",
      failedAt: new Date().toISOString(),
    }, reason);
  }
  let savedImage = null;
  if (imageUrl && !(record.cdnImageUrl && record.storageKey)) {
    savedImage = await saveRemoteGeneratedImage(record.taskId, imageUrl);
  }
  return updateAssetImageModifyRecord(record.taskId, {
    upstreamTaskId: task.taskId || queryTaskId,
    status: "succeeded",
    awaitingUpstreamTask: false,
    imageResultUrl: savedImage?.cdnImageUrl || record.cdnImageUrl || imageUrl || "",
    localImageUrl: "",
    localImagePath: "",
    cdnImageUrl: savedImage?.cdnImageUrl || record.cdnImageUrl || "",
    storageProvider: savedImage?.storageProvider || record.storageProvider || "",
    storageKey: savedImage?.storageKey || record.storageKey || "",
    cdnError: savedImage?.cdnError || record.cdnError || "",
    remoteImageUrl: imageUrl,
    queryResponse: raw,
    finalCredits: record.preDeductedCredits || record.finalCredits || 0,
    originalFinalCredits: record.originalPreDeductedCredits || record.originalFinalCredits || 0,
    billingStatus: Number(record.preDeductedCredits || 0) > 0 ? "settled" : "free",
    billingSettledAt: record.billingSettledAt || new Date().toISOString(),
    completedAt: record.completedAt || new Date().toISOString(),
    error: "",
  }, reason);
}

async function downloadHomeReferenceImage(imageUrl, itemId) {
  const response = await fetchPublicRemoteUrl(imageUrl, { signal: AbortSignal.timeout(180000) }, { label: "Synthetic reference image" });
  if (!response.ok) {
    const error = new Error(`Failed to download synthetic reference: ${response.status}`);
    error.statusCode = 502;
    throw error;
  }
  const bytes = Buffer.from(await response.arrayBuffer());
  const fileName = `home-ref-${String(itemId || "role").replace(/[^a-z0-9_-]/gi, "-")}-${Date.now()}.png`;
  const localPath = path.join(ADMIN_HOME_DIR, fileName);
  await fs.mkdir(ADMIN_HOME_DIR, { recursive: true });
  await fs.writeFile(localPath, bytes);
  return {
    bytes,
    localPath,
    localUrl: `/assets/admin/home/${fileName}`,
    mime: "image/png",
  };
}

async function createHomeSyntheticReference(item) {
  const sourceUrl = item.sourceImageUrl || item.originalImageUrl || item.localImageUrl || item.posterUrl;
  if (!sourceUrl || /^https?:\/\//i.test(sourceUrl)) {
    const error = new Error("Save the home character locally first before generating a faithful reference image.");
    error.statusCode = 400;
    throw error;
  }

  const sourcePath = safeAssetPathFromUrl(sourceUrl);
  if (!sourcePath) {
    const error = new Error("Home character source path is invalid.");
    error.statusCode = 400;
    throw error;
  }
  const bytes = await fs.readFile(sourcePath);
  const localSourcePublicUrl = publicUrlForAssetPath(sourceUrl);
  let uploaded = { publicUrl: localSourcePublicUrl, key: "" };
  if (objectStorageEnabled()) {
    uploaded = await uploadBufferToR2({
      userId: "admin",
      assetId: `${item.id || "home-role"}-source`,
      bytes,
      mime: item.sourceImageMime || item.imageMime || imageMimeFromPath(sourcePath),
    });
  }
  const prompt = makeHomeSyntheticReferencePrompt(item);
  const model = process.env.HOME_REFERENCE_MODEL || process.env.OFFICIAL_PRESET_MODEL || "";
  const generated = await createSeedream5ImageDirect({
    prompt,
    imageUrls: [uploaded.publicUrl],
    resolution: process.env.HOME_REFERENCE_SEEDREAM_SIZE || process.env.CHARACTER_SEEDREAM_SIZE || "2K",
    model,
    tier: process.env.HOME_REFERENCE_SEEDREAM_TIER || process.env.CHARACTER_SEEDREAM_TIER || "pro",
  });
  const taskId = String(generated.raw?.id || generated.raw?.task_id || generated.raw?.taskId || randomId("ref"));
  const imageUrl = generated.imageUrl;
  const local = await downloadHomeReferenceImage(imageUrl, item.id);
  return {
    model: generated.payload.model,
    prompt,
    taskId,
    imageUrl,
    raw: generated.raw,
    payload: generated.payload,
    sourcePublicUrl: uploaded.publicUrl,
    sourceR2Key: uploaded.key,
    local,
  };
}

async function ensureHomeSyntheticReference(config) {
  config.homeVideo = normalizeHomeVideo(config.homeVideo || {});
  const item = findHomeVideoItem(config.homeVideo);
  if (!item) {
    const error = new Error("Please upload or select a home character first.");
    error.statusCode = 400;
    throw error;
  }
  return ensureSyntheticReferenceForHomeItem(config, item.id);
}

/**
 * Make sure the given home item has BOTH a high-quality apiz Seedream synthetic
 * reference image AND an upstream Seedance asset built from that image.
 * Self-heals if a previous version wrote referenceAssetUri straight from the
 * raw upload (i.e. syntheticReferenceLocalUrl missing).
 */
async function ensureSyntheticReferenceForHomeItem(config, itemId, options = {}) {
  // If a background scheduler is already building this item, wait for
  // it to finish to avoid firing two Seedream tasks for the same image.
  if (
    !options._fromScheduler &&
    typeof HOME_REFERENCE_BUILDS !== "undefined" &&
    HOME_REFERENCE_BUILDS &&
    HOME_REFERENCE_BUILDS.has(itemId)
  ) {
    try { await HOME_REFERENCE_BUILDS.get(itemId); } catch {}
    return await readAppConfig();
  }

  config.homeVideo = normalizeHomeVideo(config.homeVideo || {});
  const item = findHomeVideoItem(config.homeVideo, itemId);
  if (!item) {
    const error = new Error(`Home item ${itemId} not found.`);
    error.statusCode = 404;
    throw error;
  }

  if (USE_GATEWAY_UPSTREAM) {
    return ensureSeedanceAssetForHomeItem(config, itemId);
  }

  const force = options.force === true;
  const hasSynthetic = Boolean(item.syntheticReferenceLocalUrl || item.syntheticReferenceUrl);
  const hasAsset = Boolean(item.referenceAssetUri);

  // Self-heal: a stale referenceAssetUri exists but no synthetic image was
  // ever produced. Treat it as invalid and rebuild from scratch.
  let working = item;
  if (force || (hasAsset && !hasSynthetic)) {
    working = {
      ...item,
      referenceAssetUri: "",
      publicImageUrl: "",
      r2Key: "",
    };
    config.homeVideo = replaceHomeVideoItem(config.homeVideo, working);
    await writeAppConfig(config);
  } else if (hasAsset && hasSynthetic) {
    return config;
  }

  let referenceItem = working;
  if (!referenceItem.syntheticReferenceLocalUrl && !referenceItem.syntheticReferenceUrl) {
    const synthetic = await createHomeSyntheticReference(referenceItem);
    referenceItem = {
      ...referenceItem,
      sourceImageUrl: referenceItem.sourceImageUrl || referenceItem.localImageUrl || referenceItem.posterUrl,
      sourceImageMime: referenceItem.sourceImageMime || referenceItem.imageMime || "",
      posterUrl: synthetic.local.localUrl,
      localImageUrl: synthetic.local.localUrl,
      imageMime: synthetic.local.mime,
      syntheticReferenceLocalUrl: synthetic.local.localUrl,
      syntheticReferenceUrl: synthetic.imageUrl,
      syntheticReferenceTaskId: synthetic.taskId,
      syntheticReferenceModel: synthetic.model,
      syntheticReferencePrompt: synthetic.prompt,
      sourcePublicUrl: synthetic.sourcePublicUrl,
      sourceR2Key: synthetic.sourceR2Key,
      status: "reference_ready",
      updatedAt: new Date().toISOString(),
    };
    config.homeVideo = replaceHomeVideoItem(config.homeVideo, referenceItem);
    await writeAppConfig(config);
  } else if (referenceItem.syntheticReferenceLocalUrl && referenceItem.localImageUrl !== referenceItem.syntheticReferenceLocalUrl) {
    referenceItem = {
      ...referenceItem,
      sourceImageUrl: referenceItem.sourceImageUrl || referenceItem.localImageUrl || referenceItem.posterUrl,
      posterUrl: referenceItem.syntheticReferenceLocalUrl,
      localImageUrl: referenceItem.syntheticReferenceLocalUrl,
      imageMime: "image/png",
      updatedAt: new Date().toISOString(),
    };
    config.homeVideo = replaceHomeVideoItem(config.homeVideo, referenceItem);
    await writeAppConfig(config);
  }

  return ensureSeedanceAssetForHomeItem(config, referenceItem.id);
}

async function ensureSeedanceAssetForHomeImage(config) {
  config.homeVideo = normalizeHomeVideo(config.homeVideo || {});
  const item = findHomeVideoItem(config.homeVideo);
  if (!item) {
    const error = new Error("Please upload or select a home character first.");
    error.statusCode = 400;
    throw error;
  }
  return ensureSeedanceAssetForHomeItem(config, item.id);
}

async function ensureSeedanceAssetForHomeItem(config, itemId) {
  config.homeVideo = normalizeHomeVideo(config.homeVideo || {});
  const item = findHomeVideoItem(config.homeVideo, itemId);
  if (!item) {
    const error = new Error(`Home item ${itemId} not found.`);
    error.statusCode = 404;
    throw error;
  }
  if (item.referenceAssetUri && (!localPublicAssetStorageEnabled() || isLocalPublicAssetUrl(item.publicImageUrl))) return config;
  // Prefer the synthetic image as the reference, fall back to the local image.
  const localUrl = item.syntheticReferenceLocalUrl || item.localImageUrl || item.posterUrl;
  if (!localUrl || /^https?:\/\//i.test(localUrl)) {
    const error = new Error("The home image must be uploaded locally first before creating an upstream reference asset.");
    error.statusCode = 400;
    throw error;
  }

  if (USE_GATEWAY_UPSTREAM) {
    const publicUrl = publicUrlForAssetPath(localUrl) || item.publicImageUrl || localUrl;
    const next = {
      ...item,
      publicImageUrl: publicUrl,
      referenceAssetUri: publicUrl || localUrl,
      updatedAt: new Date().toISOString(),
    };
    config.homeVideo = replaceHomeVideoItem(config.homeVideo, next);
    return config;
  }

  const localPath = safeAssetPathFromUrl(localUrl);
  if (!localPath) {
    const error = new Error("Home image path is invalid.");
    error.statusCode = 400;
    throw error;
  }
  const bytes = await fs.readFile(localPath);
  validateSeedanceImageBytes(bytes, "Seedance home image");
  const localPublicUrl = publicUrlForAssetPath(localUrl);
  let uploaded = { publicUrl: localPublicUrl, key: "" };
  if (objectStorageEnabled()) {
    uploaded = await uploadBufferToR2({
      userId: "admin",
      assetId: `${item.id || "home-video-reference"}-ref`,
      bytes,
      mime: item.imageMime || config.homeVideo?.imageMime || imageMimeFromPath(localPath),
    });
  }
  const created = await arkOpenApiAction("CreateAsset", {
    GroupId: ARK_OPENAPI.groupId,
    URL: uploaded.publicUrl,
    AssetType: "Image",
    Moderation: { Strategy: "Skip" },
    Name: `raising-game-home-${item.id}-${Date.now()}`,
    ProjectName: ARK_OPENAPI.projectName,
  });
  const assetId = extractAssetId(created);
  if (!assetId) {
    const error = new Error(`CreateAsset did not return asset id: ${JSON.stringify(created)}`);
    error.statusCode = 502;
    throw error;
  }

  const next = {
    ...item,
    publicImageUrl: uploaded.publicUrl,
    referenceAssetUri: `asset://${assetId}`,
    r2Key: uploaded.key,
    updatedAt: new Date().toISOString(),
  };
  config.homeVideo = replaceHomeVideoItem(config.homeVideo, next);
  return config;
}

function isPrivateIpv4Address(address = "") {
  const parts = String(address || "").split(".").map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return false;
  const [a, b, c] = parts;
  return a === 0
    || a === 10
    || a === 127
    || (a === 100 && b >= 64 && b <= 127)
    || (a === 169 && b === 254)
    || (a === 172 && b >= 16 && b <= 31)
    || (a === 192 && b === 0 && c === 0)
    || (a === 192 && b === 0 && c === 2)
    || (a === 192 && b === 168)
    || (a === 198 && (b === 18 || b === 19))
    || (a === 198 && b === 51 && c === 100)
    || (a === 203 && b === 0 && c === 113)
    || a >= 224;
}

function ipv4FromMappedIpv6(address = "") {
  const normalized = String(address || "").toLowerCase().replace(/^\[|\]$/g, "");
  const prefix = "::ffff:";
  if (!normalized.startsWith(prefix)) return "";
  const tail = normalized.slice(prefix.length);
  if (net.isIP(tail) === 4) return tail;
  const words = tail.split(":");
  if (words.length !== 2 || words.some((word) => !/^[0-9a-f]{1,4}$/.test(word))) return "";
  const high = Number.parseInt(words[0], 16);
  const low = Number.parseInt(words[1], 16);
  return `${high >> 8}.${high & 255}.${low >> 8}.${low & 255}`;
}

function isPrivateIpAddress(address = "") {
  const value = String(address || "").trim().toLowerCase().replace(/^\[|\]$/g, "").split("%")[0];
  const version = net.isIP(value);
  if (version === 4) return isPrivateIpv4Address(value);
  if (version !== 6) return false;
  const mappedIpv4 = ipv4FromMappedIpv6(value);
  if (mappedIpv4) return isPrivateIpv4Address(mappedIpv4);
  const first = value.split(":")[0] || "";
  return value === "::"
    || value === "::1"
    || /^f[cd][0-9a-f]{0,2}$/.test(first)
    || /^fe[89ab][0-9a-f]{0,2}$/.test(first)
    || /^ff[0-9a-f]{0,2}$/.test(first)
    || value.startsWith("2001:db8:")
    || value === "2001:db8::"
    || value.startsWith("2001:2:")
    || value.startsWith("2001:10:")
    || value.startsWith("2001:20:")
    || value.startsWith("64:ff9b:");
}

function isPrivateVegaHostname(value = "") {
  const hostname = String(value || "").trim().toLowerCase().replace(/^\[|\]$/g, "").replace(/\.$/, "");
  if (!hostname) return true;
  if (hostname === "localhost" || hostname.endsWith(".localhost") || hostname.endsWith(".local") || hostname.endsWith(".internal")) return true;
  return isPrivateIpAddress(hostname);
}

function isPublicHttpUrl(value = "") {
  try {
    const url = new URL(String(value || ""));
    return ["http:", "https:"].includes(url.protocol)
      && !url.username
      && !url.password
      && !isPrivateVegaHostname(url.hostname);
  } catch {
    return false;
  }
}

const WAN27_MEDIA_MODE = new Set([
  "first_frame",
  "first_last_frame",
  "first_frame_audio",
  "first_last_frame_audio",
  "first_clip",
  "first_clip_last_frame",
]);

function normalizeWan27MediaMode(value = "") {
  const normalized = String(value || "").trim().toLowerCase().replace(/[\s-]+/g, "_");
  if (["image", "single_image", "first", "single"].includes(normalized)) return "first_frame";
  if (["multi_image", "two_images", "first_last", "first_and_last", "last_frame"].includes(normalized)) return "first_last_frame";
  if (["image_audio", "audio", "first_audio", "first_and_audio"].includes(normalized)) return "first_frame_audio";
  if (["multi_image_audio", "two_images_audio", "first_last_audio", "first_last_and_audio"].includes(normalized)) return "first_last_frame_audio";
  if (["extend", "video", "clip", "continue", "continuation"].includes(normalized)) return "first_clip";
  if (["extend_last", "clip_last", "video_last", "continuation_last"].includes(normalized)) return "first_clip_last_frame";
  return WAN27_MEDIA_MODE.has(normalized) ? normalized : "first_frame";
}

function wan27ModeNeedsFirstFrame(mode) {
  return ["first_frame", "first_last_frame", "first_frame_audio", "first_last_frame_audio"].includes(normalizeWan27MediaMode(mode));
}

function wan27ModeNeedsLastFrame(mode) {
  return ["first_last_frame", "first_last_frame_audio", "first_clip_last_frame"].includes(normalizeWan27MediaMode(mode));
}

function wan27ModeNeedsAudio(mode) {
  return ["first_frame_audio", "first_last_frame_audio"].includes(normalizeWan27MediaMode(mode));
}

function wan27ModeNeedsClip(mode) {
  return ["first_clip", "first_clip_last_frame"].includes(normalizeWan27MediaMode(mode));
}

function wan27MediaSlotsForMode(mode) {
  const normalizedMode = normalizeWan27MediaMode(mode);
  const slots = [];
  if (wan27ModeNeedsFirstFrame(normalizedMode)) slots.push({ key: "firstFrame", type: "first_frame", mediaKind: "image", label: "First frame" });
  if (wan27ModeNeedsClip(normalizedMode)) slots.push({ key: "firstClip", type: "first_clip", mediaKind: "video", label: "First clip" });
  if (wan27ModeNeedsLastFrame(normalizedMode)) slots.push({ key: "lastFrame", type: "last_frame", mediaKind: "image", label: "Last frame" });
  if (wan27ModeNeedsAudio(normalizedMode)) slots.push({ key: "drivingAudio", type: "driving_audio", mediaKind: "audio", label: "Driving audio" });
  return slots;
}

function mediaUrlFromBody(body = {}, key = "") {
  return String(body[`${key}Url`] || body[`${key}_url`] || body[`${key}MediaUrl`] || "").trim();
}

function mediaDataUrlFromBody(body = {}, key = "") {
  return String(body[`${key}DataUrl`] || body[`${key}_dataUrl`] || body[`${key}_data_url`] || "");
}

function mediaFileNameFromBody(body = {}, key = "") {
  return String(body[`${key}FileName`] || body[`${key}_fileName`] || body[`${key}_file_name`] || "");
}

function mediaAssetIdFromBody(body = {}, key = "") {
  return String(body[`${key}AssetId`] || body[`${key}_assetId`] || body[`${key}_asset_id`] || "").trim();
}

function arrayFromBody(value) {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

const SEEDANCE_MEDIA_MODES = new Set([
  "text_to_video",
  "first_frame",
  "first_last_frame",
  "reference_images",
  "reference_video",
]);

function normalizeSeedanceMode(value = "", body = {}) {
  const raw = String(value || "").trim().toLowerCase().replace(/[\s-]+/g, "_");
  if (["text", "txt", "t2v", "text_video", "text_to_video"].includes(raw)) return "text_to_video";
  if (["image", "i2v", "image_to_video", "first", "first_image", "first_frame", "image_url", "single_image"].includes(raw)) return "first_frame";
  if (["first_last", "first_last_frame", "first_and_last", "start_end", "start_end_frame", "image_to_video_end", "end_image", "last_frame"].includes(raw)) return "first_last_frame";
  if (["reference", "references", "reference_image", "reference_images", "multi_reference", "multi_images"].includes(raw)) return "reference_images";
  if (["reference_video", "video_reference", "video"].includes(raw)) return "reference_video";
  if (SEEDANCE_MEDIA_MODES.has(raw)) return raw;

  const merged = body || {};
  const contentSummary = safeSeedanceContentMediaSummary(merged.content);
  if (contentSummary.firstImages.length || contentSummary.lastImages.length) {
    return contentSummary.lastImages.length ? "first_last_frame" : "first_frame";
  }
  if (firstPresent(
    merged.endImageUrl,
    merged.end_image_url,
    merged.lastFrameUrl,
    merged.last_frame_url,
    merged.endImageDataUrl,
    merged.lastFrameDataUrl,
    merged.endImageAssetId,
    merged.lastFrameAssetId,
  )) return "first_last_frame";
  if (firstPresent(
    merged.image_url,
    merged.imageUrl,
    merged.firstFrameUrl,
    merged.first_frame_url,
    merged.imageDataUrl,
    merged.firstFrameDataUrl,
    merged.imageAssetId,
    merged.firstFrameAssetId,
  )) return "first_frame";
  if (
    seedanceReferenceVideoInputCountFromBody(merged) > 0 ||
    seedanceReferenceAudioInputCountFromBody(merged) > 0 ||
    contentSummary.videos.length ||
    contentSummary.audios.length ||
    Array.isArray(merged.reference_videos)
  ) return "reference_video";
  if (
    contentSummary.referenceImages.length ||
    arrayFromBody(merged.referenceImages).length ||
    arrayFromBody(merged.reference_images).length ||
    arrayFromBody(merged.referenceImageDataUrls).length ||
    arrayFromBody(merged.referenceImageAssetUris).length ||
    arrayFromBody(merged.seedanceReferenceAssetUris).length ||
    arrayFromBody(merged.vipeak2ReferenceAssetUris).length ||
    arrayFromBody(merged.referenceImages).some((item) => (
      typeof item === "object" && item && (item.assetUri || item.referenceAssetUri || item.seedanceAssetUri)
    )) ||
    firstPresent(merged.reference_images, merged.seedanceReferenceAssetUri, merged.vipeak2ReferenceAssetUri, merged.seedanceCharacterAssetUri, merged.vipeak2CharacterAssetUri, merged.userAssetId, merged.referenceImageAssetId)
  ) return "reference_images";
  return "text_to_video";
}

function seedanceModeNeedsFirstFrame(mode) {
  return ["first_frame", "first_last_frame"].includes(normalizeSeedanceMode(mode));
}

function seedanceModeNeedsEndFrame(mode) {
  return normalizeSeedanceMode(mode) === "first_last_frame";
}

function seedanceModeNeedsReferenceVideo(mode) {
  return normalizeSeedanceMode(mode) === "reference_video";
}

function seedanceFirstFrameInputFromBody(body = {}, { includeDataUrlFallback = false, includeUserAssetId = false } = {}) {
  const assetId = String(firstPresent(body.firstFrameAssetId, body.first_frame_asset_id, body.imageAssetId, body.image_asset_id, includeUserAssetId ? body.userAssetId : "") || "").trim();
  if (assetId) return { assetId, name: "Seedance first frame" };
  const dataUrl = String(firstPresent(
    body.firstFrameDataUrl,
    body.first_frame_data_url,
    body.imageDataUrl,
    body.image_data_url,
    includeDataUrlFallback ? body.dataUrl : "",
  ) || "");
  if (dataUrl) {
    return {
      dataUrl,
      fileName: firstPresent(body.firstFrameFileName, body.imageFileName, body.fileName, ""),
      name: "Seedance first frame",
    };
  }
  const url = String(firstPresent(
    body.firstFrameUrl,
    body.first_frame_url,
    body.imageUrl,
    body.image_url_public,
    isPublicHttpUrl(body.image_url) ? body.image_url : "",
  ) || "").trim();
  if (url) {
    return {
      url,
      fileName: firstPresent(body.firstFrameFileName, body.imageFileName, body.fileName, ""),
      name: "Seedance first frame",
    };
  }
  return null;
}

function seedanceEndFrameInputFromBody(body = {}) {
  const assetId = String(firstPresent(body.endImageAssetId, body.end_image_asset_id, body.lastFrameAssetId, body.last_frame_asset_id) || "").trim();
  if (assetId) return { assetId, name: "Seedance end frame" };
  const dataUrl = String(firstPresent(body.endImageDataUrl, body.end_image_data_url, body.lastFrameDataUrl, body.last_frame_data_url) || "");
  if (dataUrl) {
    return {
      dataUrl,
      fileName: firstPresent(body.endImageFileName, body.lastFrameFileName, body.fileName, ""),
      name: "Seedance end frame",
    };
  }
  const url = String(firstPresent(
    body.endImageUrl,
    body.end_image_public_url,
    body.lastFrameUrl,
    body.last_frame_url,
    isPublicHttpUrl(body.end_image_url) ? body.end_image_url : "",
  ) || "").trim();
  if (url) {
    return {
      url,
      fileName: firstPresent(body.endImageFileName, body.lastFrameFileName, body.fileName, ""),
      name: "Seedance end frame",
    };
  }
  return null;
}

async function createSingleSeedanceImageAssetFromInput(db, user, input, { name = "Seedance frame" } = {}) {
  if (!input) return null;
  const assets = await createUserImageAssetsFromInputs(db, user, [{ ...input, name: input.name || name }], { name });
  const asset = assets[0] || null;
  if (asset) validateWan27MediaKind(asset, "image", name);
  return asset;
}

function seedanceReferenceImageInputIdentity(item) {
  if (!item) return "";
  if (typeof item === "string") return item.trim();
  const assetId = String(item.assetId || item.userAssetId || item.imageAssetId || "").trim();
  if (assetId) return `asset:${assetId}`;
  const dataUrl = String(item.dataUrl || "").trim();
  if (dataUrl) return dataUrl;
  const url = String(item.url || item.imageUrl || item.image_url || item.assetUri || item.referenceAssetUri || item.seedanceAssetUri || "").trim();
  return url;
}

function uniqueSeedanceReferenceImageInputs(inputs = []) {
  const seen = new Set();
  return inputs.filter((item) => {
    const identity = seedanceReferenceImageInputIdentity(item);
    if (!identity || seen.has(identity)) return false;
    seen.add(identity);
    return true;
  });
}

function seedanceReferenceInputsFromBody(body = {}, { includeDataUrlFallback = true } = {}) {
  const inputs = uniqueSeedanceReferenceImageInputs([
    ...arrayFromBody(body.referenceImages),
    ...arrayFromBody(body.reference_images),
    ...arrayFromBody(body.referenceImageDataUrls),
  ]);
  const filteredInputs = inputs.filter((item) => {
    if (!item) return false;
    if (typeof item === "string") {
      const text = item.trim();
      return text && !text.startsWith("asset://");
    }
    return item.dataUrl || item.assetId || item.url || item.imageUrl;
  });
  if (filteredInputs.length > ADVANCED_SEEDANCE_REFERENCE_LIMIT) {
    const error = new Error(`Seedance supports up to ${ADVANCED_SEEDANCE_REFERENCE_LIMIT} reference images.`);
    error.statusCode = 400;
    throw error;
  }
  if (filteredInputs.length) return filteredInputs;
  const fallbackInputs = uniqueSeedanceReferenceImageInputs([
    includeDataUrlFallback && body.dataUrl ? { dataUrl: body.dataUrl, fileName: body.fileName || "", name: "Advanced reference 1" } : null,
    ...seedanceExtraReferenceInputsFromBody(body),
  ].filter(Boolean));
  if (fallbackInputs.length > ADVANCED_SEEDANCE_REFERENCE_LIMIT) {
    const error = new Error(`Seedance supports up to ${ADVANCED_SEEDANCE_REFERENCE_LIMIT} reference images.`);
    error.statusCode = 400;
    throw error;
  }
  return fallbackInputs;
}

function seedanceExtraReferenceInputsFromBody(body = {}) {
  const inputs = uniqueSeedanceReferenceImageInputs([
    ...arrayFromBody(body.extraReferenceDataUrls),
    ...arrayFromBody(body.extraReferenceImages),
    ...arrayFromBody(body.extraDataUrls),
    ...arrayFromBody(body.referenceDataUrls),
  ]).filter((item) => {
    if (!item) return false;
    if (typeof item === "string") {
      const text = item.trim();
      return text && !text.startsWith("asset://");
    }
    return item.dataUrl || item.assetId || item.url || item.imageUrl;
  });
  if (inputs.length > ADVANCED_SEEDANCE_REFERENCE_LIMIT) {
    const error = new Error(`Seedance supports up to ${ADVANCED_SEEDANCE_REFERENCE_LIMIT} reference images.`);
    error.statusCode = 400;
    throw error;
  }
  return inputs;
}

function seedanceExtraReferenceAssetIdsFromBody(body = {}) {
  const assetIds = [
    ...arrayFromBody(body.extraReferenceAssetIds),
    ...arrayFromBody(body.extraUserAssetIds),
  ].map((item) => String(item || "").trim()).filter(Boolean);
  const uniqueAssetIds = [...new Set(assetIds)];
  if (uniqueAssetIds.length > ADVANCED_SEEDANCE_REFERENCE_LIMIT) {
    const error = new Error(`Seedance supports up to ${ADVANCED_SEEDANCE_REFERENCE_LIMIT} reference images.`);
    error.statusCode = 400;
    throw error;
  }
  return uniqueAssetIds;
}

function seedanceReferenceAssetIdsFromBody(body = {}, { includeUserAssetId = true, includeImageAssetId = true } = {}) {
  const assetIds = [
    includeUserAssetId ? body.userAssetId : "",
    body.referenceImageAssetId,
    includeImageAssetId ? body.imageAssetId : "",
    ...seedanceExtraReferenceAssetIdsFromBody(body),
  ].map((item) => String(item || "").trim()).filter(Boolean);
  const uniqueAssetIds = [...new Set(assetIds)];
  if (uniqueAssetIds.length > ADVANCED_SEEDANCE_REFERENCE_LIMIT) {
    const error = new Error(`Seedance supports up to ${ADVANCED_SEEDANCE_REFERENCE_LIMIT} reference images.`);
    error.statusCode = 400;
    throw error;
  }
  return uniqueAssetIds;
}

function seedanceReferenceAssetUrisFromBody(body = {}) {
  const explicitInputs = [
    body.seedanceCharacterAssetUri,
    body.vipeak2CharacterAssetUri,
    body.seedanceReferenceAssetUri,
    body.vipeak2ReferenceAssetUri,
    ...arrayFromBody(body.seedanceReferenceAssetUris),
    ...arrayFromBody(body.vipeak2ReferenceAssetUris),
    ...arrayFromBody(body.referenceImageAssetUris),
  ].map((item) => String(item || "").trim()).filter(Boolean);
  const referenceImageInputs = [
    ...arrayFromBody(body.referenceImages),
    ...arrayFromBody(body.reference_images),
  ].map((item) => (
      typeof item === "string"
        ? ((item.trim().startsWith("asset://") || isPublicHttpUrl(item.trim())) ? item : "")
        : (item?.assetId || item?.userAssetId || item?.imageAssetId
          ? ""
          : String(item?.assetUri || item?.referenceAssetUri || item?.seedanceAssetUri || item?.url || item?.imageUrl || ""))
    )).map((item) => String(item || "").trim()).filter(Boolean);
  const inputs = [...explicitInputs, ...referenceImageInputs];
  const invalid = inputs.find((uri) => !uri.startsWith("asset://") && !isPublicHttpUrl(uri));
  if (invalid) {
    const error = new Error("Seedance reference media must use asset:// or a public http(s) URL.");
    error.statusCode = 400;
    throw error;
  }
  const unique = [...new Set(inputs)];
  if (unique.length > ADVANCED_SEEDANCE_REFERENCE_LIMIT) {
    const error = new Error(`Seedance supports up to ${ADVANCED_SEEDANCE_REFERENCE_LIMIT} reference images.`);
    error.statusCode = 400;
    throw error;
  }
  return unique;
}

function seedanceReferenceVideoAssetIdsFromBody(body = {}) {
  const ids = [
    body.referenceVideoAssetId,
    body.videoAssetId,
    body.firstClipAssetId,
    ...arrayFromBody(body.referenceVideoAssetIds),
    ...arrayFromBody(body.videoAssetIds),
  ].map((item) => String(item || "").trim()).filter(Boolean);
  const uniqueIds = [...new Set(ids)];
  if (uniqueIds.length > ADVANCED_SEEDANCE_VIDEO_REFERENCE_LIMIT) {
    const error = new Error(`Seedance supports up to ${ADVANCED_SEEDANCE_VIDEO_REFERENCE_LIMIT} reference videos.`);
    error.statusCode = 400;
    throw error;
  }
  return uniqueIds;
}

function seedanceReferenceVideoUrlFromItem(item = "") {
  if (typeof item === "string") return item.trim();
  if (!item || typeof item !== "object") return "";
  return String(item.url || item.videoUrl || item.video_url || item.assetUri || "").trim();
}

// Browser clients can restore local media as `/assets/...` paths. Seedance
// only accepts public URLs (or asset:// ids), so resolve local paths before
// validation; the generation worker will still convert public URLs to an
// upstream CreateAsset asset:// URI before submission.
function normalizeSeedanceReferenceVideoInputUrl(value = "") {
  const text = String(value || "").trim();
  if (!text || text.startsWith("asset://") || /^data:/i.test(text) || isPublicHttpUrl(text)) return text;
  if (text.startsWith("/")) return publicUrlForAssetPath(text) || text;
  return text;
}

function uniqueSeedanceReferenceVideoItems(items = []) {
  const seen = new Set();
  const unique = [];
  for (const item of items) {
    const url = seedanceReferenceVideoUrlFromItem(item);
    if (!url || seen.has(url)) continue;
    seen.add(url);
    unique.push(item);
  }
  return unique;
}

function seedanceReferenceVideoUrlInputsFromBody(body = {}) {
  const inputs = uniqueSeedanceReferenceVideoItems([
    ...arrayFromBody(body.referenceVideos),
    ...arrayFromBody(body.referenceVideoUrls),
    ...arrayFromBody(body.videoUrls),
    ...arrayFromBody(body.reference_videos),
  ]);
  if (inputs.length > ADVANCED_SEEDANCE_VIDEO_REFERENCE_LIMIT) {
    const error = new Error(`Seedance supports up to ${ADVANCED_SEEDANCE_VIDEO_REFERENCE_LIMIT} reference videos.`);
    error.statusCode = 400;
    throw error;
  }
  return inputs.map((item, index) => {
    if (typeof item === "string") return normalizeSeedanceReferenceVideoInputUrl(item);
    return normalizeSeedanceReferenceVideoInputUrl(seedanceReferenceVideoUrlFromItem(item));
  }).filter(Boolean).map((url, index) => assertSeedanceMediaUrl(url, `Seedance reference video ${index + 1}`, { kind: "video" }));
}

function durationSecondsFromValue(value, fallback = 0) {
  return pricingNumber(value, fallback, 0, 4);
}

function seedanceVideoInputDurationFromItem(item = {}) {
  if (!item || typeof item !== "object") return 0;
  return durationSecondsFromValue(firstPresent(
    item.durationSeconds,
    item.duration,
    item.inputVideoSeconds,
    item.inputVideoDurationSeconds,
    item.inputVideoDuration,
    item.videoDurationSeconds,
    item.videoDuration,
  ));
}

function seedanceExplicitVideoInputSecondsFromBody(body = {}) {
  return durationSecondsFromValue(firstPresent(
    body.inputVideoSeconds,
    body.inputVideoDurationSeconds,
    body.inputVideoDuration,
    body.referenceVideoSeconds,
    body.referenceVideoDurationSeconds,
    body.referenceVideoDuration,
    body.videoInputSeconds,
    body.videoDurationSeconds,
    body.videoDuration,
    body.sourceVideoDurationSeconds,
  ));
}

function seedanceReferenceVideoUrlItemsFromBody(body = {}) {
  return uniqueSeedanceReferenceVideoItems([
    ...arrayFromBody(body.referenceVideos),
    ...arrayFromBody(body.referenceVideoUrls),
    ...arrayFromBody(body.videoUrls),
    ...arrayFromBody(body.reference_videos),
  ]);
}

function seedanceReferenceVideoInputCountFromBody(body = {}) {
  const ids = [
    body.referenceVideoAssetId,
    body.videoAssetId,
    body.firstClipAssetId,
    ...arrayFromBody(body.referenceVideoAssetIds),
    ...arrayFromBody(body.videoAssetIds),
  ].map((item) => String(item || "").trim()).filter(Boolean);
  const uniqueIdCount = new Set(ids).size;
  const arrayVideos = seedanceReferenceVideoUrlItemsFromBody(body).length;
  return uniqueIdCount + arrayVideos;
}

function seedanceVideoInputSecondsFromBody(body = {}, { fallbackSeconds = 0 } = {}) {
  const videoItems = seedanceReferenceVideoUrlItemsFromBody(body);
  const itemDurations = videoItems.map(seedanceVideoInputDurationFromItem);
  const floorSeconds = durationSecondsFromValue(fallbackSeconds);
  const knownSeconds = itemDurations.reduce((sum, seconds) => {
    const value = durationSecondsFromValue(seconds);
    return value > 0 ? sum + Math.max(value, floorSeconds) : sum;
  }, 0);
  const unknownCount = itemDurations.filter((seconds) => !seconds).length;
  if (knownSeconds > 0 || unknownCount > 0) {
    return durationSecondsFromValue(knownSeconds + unknownCount * floorSeconds);
  }
  return 0;
}

function seedanceVideoInputSecondsFromAssets(assets = [], { fallbackSeconds = 0, expectedCount = null } = {}) {
  const list = (assets || []).filter(Boolean);
  const floorSeconds = durationSecondsFromValue(fallbackSeconds);
  const knownSeconds = list.reduce((sum, asset) => {
    const seconds = durationSecondsFromValue(firstPresent(asset?.durationSeconds, asset?.duration));
    return seconds > 0 ? sum + Math.max(seconds, floorSeconds) : sum;
  }, 0);
  const knownCount = list.filter((asset) => durationSecondsFromValue(firstPresent(asset?.durationSeconds, asset?.duration)) > 0).length;
  const totalCount = expectedCount === null || expectedCount === undefined ? list.length : Math.max(0, Number(expectedCount || 0));
  const unknownCount = Math.max(0, totalCount - knownCount);
  return durationSecondsFromValue(knownSeconds + unknownCount * floorSeconds);
}

function seedanceVideoInputSecondsForPricing(body = {}, { requestParams = {}, assets = [], assetIds = [] } = {}) {
  const explicitTotal = seedanceExplicitVideoInputSecondsFromBody(body);
  const fallbackSeconds = durationSecondsFromValue(requestParams.duration, advancedDurationBounds("seedance").fallback);
  const assetSeconds = seedanceVideoInputSecondsFromAssets(assets, {
    fallbackSeconds,
    expectedCount: Math.max(arrayFromBody(assetIds).filter(Boolean).length, (assets || []).filter(Boolean).length),
  });
  const urlSeconds = seedanceVideoInputSecondsFromBody(body, { fallbackSeconds });
  const minimumSeconds = durationSecondsFromValue(assetSeconds + urlSeconds);
  return durationSecondsFromValue(Math.max(explicitTotal, minimumSeconds));
}

async function seedanceVideoInputSecondsForPricingWithProbe(body = {}, { requestParams = {}, assets = [], assetIds = [] } = {}) {
  const fallbackSeconds = durationSecondsFromValue(requestParams.duration, advancedDurationBounds("seedance").fallback);
  const videoItems = seedanceReferenceVideoUrlItemsFromBody(body);
  const explicitTotal = seedanceExplicitVideoInputSecondsFromBody(body);
  if (!videoItems.length) {
    return seedanceVideoInputSecondsForPricing(body, { requestParams, assets, assetIds });
  }
  const probedItems = [];
  for (const item of videoItems) {
    if (item && typeof item === "object" && seedanceVideoInputDurationFromItem(item) > 0) {
      probedItems.push(item);
      continue;
    }
    const url = typeof item === "string"
      ? item.trim()
      : String(item?.url || item?.videoUrl || item?.video_url || item?.assetUri || "").trim();
    const probedSeconds = await probeVideoDurationSeconds(url);
    probedItems.push(item && typeof item === "object"
      ? { ...item, durationSeconds: probedSeconds || undefined }
      : { url, durationSeconds: probedSeconds || undefined });
  }
  const probedMinimumSeconds = seedanceVideoInputSecondsForPricing({
    ...body,
    inputVideoSeconds: undefined,
    inputVideoDurationSeconds: undefined,
    inputVideoDuration: undefined,
    referenceVideoSeconds: undefined,
    referenceVideoDurationSeconds: undefined,
    referenceVideoDuration: undefined,
    videoInputSeconds: undefined,
    videoDurationSeconds: undefined,
    videoDuration: undefined,
    sourceVideoDurationSeconds: undefined,
    referenceVideos: probedItems,
    referenceVideoUrls: [],
    videoUrls: [],
    reference_videos: [],
  }, { requestParams: { ...requestParams, duration: fallbackSeconds }, assets, assetIds });
  return durationSecondsFromValue(Math.max(explicitTotal, probedMinimumSeconds));
}

function seedanceReferenceAudioAssetIdsFromBody(body = {}) {
  const ids = [
    body.referenceAudioAssetId,
    body.audioAssetId,
    body.drivingAudioAssetId,
    ...arrayFromBody(body.referenceAudioAssetIds),
    ...arrayFromBody(body.audioAssetIds),
  ].map((item) => String(item || "").trim()).filter(Boolean);
  const uniqueIds = [...new Set(ids)];
  if (uniqueIds.length > ADVANCED_SEEDANCE_AUDIO_REFERENCE_LIMIT) {
    const error = new Error(`Seedance supports up to ${ADVANCED_SEEDANCE_AUDIO_REFERENCE_LIMIT} reference audios.`);
    error.statusCode = 400;
    throw error;
  }
  return uniqueIds;
}

function seedanceReferenceAudioInputsFromBody(body = {}) {
  const seen = new Set();
  const inputs = [
    ...arrayFromBody(body.referenceAudios),
    ...arrayFromBody(body.referenceAudioUrls),
    ...arrayFromBody(body.audioUrls),
    ...arrayFromBody(body.reference_audios),
  ].filter((item) => {
    if (!item) return false;
    if (typeof item === "string") return item.trim();
    return item.url || item.audioUrl || item.audio_url || item.assetUri;
  }).filter((item) => {
    const url = typeof item === "string"
      ? item.trim()
      : String(item.url || item.audioUrl || item.audio_url || item.assetUri || "").trim();
    if (!url || seen.has(url)) return false;
    seen.add(url);
    return true;
  });
  if (inputs.length > ADVANCED_SEEDANCE_AUDIO_REFERENCE_LIMIT) {
    const error = new Error(`Seedance supports up to ${ADVANCED_SEEDANCE_AUDIO_REFERENCE_LIMIT} reference audios.`);
    error.statusCode = 400;
    throw error;
  }
  return inputs.map((item) => {
    if (typeof item === "string") return item.trim();
    return String(item.url || item.audioUrl || item.audio_url || item.assetUri || "").trim();
  }).filter(Boolean).map((url, index) => assertSeedanceMediaUrl(url, `Seedance reference audio ${index + 1}`, { kind: "audio" }));
}

function seedanceReferenceAudioInputCountFromBody(body = {}) {
  const ids = [
    body.referenceAudioAssetId,
    body.audioAssetId,
    body.drivingAudioAssetId,
    ...arrayFromBody(body.referenceAudioAssetIds),
    ...arrayFromBody(body.audioAssetIds),
  ].map((item) => String(item || "").trim()).filter(Boolean);
  const urls = [
    ...arrayFromBody(body.referenceAudios),
    ...arrayFromBody(body.referenceAudioUrls),
    ...arrayFromBody(body.audioUrls),
    ...arrayFromBody(body.reference_audios),
  ].map((item) => (typeof item === "string" ? item.trim() : nestedMediaUrl(item))).filter(Boolean);
  return new Set([...ids.map((id) => `asset:${id}`), ...urls]).size;
}

function seedanceRawArrayUrls(value, kind = "image", label = "Seedance media") {
  return arrayFromBody(value)
    .map((item) => nestedMediaUrl(item))
    .filter(Boolean)
    .map((url, index) => assertSeedanceMediaUrl(url, `${label} ${index + 1}`, { kind }));
}

function seedanceContentMediaSummary(content = []) {
  const summary = {
    firstImages: [],
    lastImages: [],
    referenceImages: [],
    videos: [],
    audios: [],
  };
  for (const item of (Array.isArray(content) ? content : [])) {
    const normalized = normalizeSeedanceContentItem(item);
    if (!normalized || typeof normalized !== "object" || Array.isArray(normalized)) continue;
    const type = String(normalized.type || "").trim();
    if (!type || type === "text") continue;
    if (!["image_url", "video_url", "audio_url"].includes(type)) {
      throw advancedValidationError("INVALID_CONTENT_TYPE", `Unsupported Seedance content type: ${type}.`, { type });
    }
    const kind = type === "image_url" ? "image" : type === "video_url" ? "video" : "audio";
    const url = assertSeedanceMediaUrl(nestedMediaUrl(normalized[type]), `Seedance content ${type}`, { kind });
    if (!url) {
      throw advancedValidationError("MISSING_MEDIA_URL", `${type} content requires a url.`, { type });
    }
    const role = String(normalized.role || "").trim().toLowerCase();
    if (type === "image_url" && role === "first_frame") summary.firstImages.push(url);
    else if (type === "image_url" && role === "last_frame") summary.lastImages.push(url);
    else if (type === "image_url") summary.referenceImages.push(url);
    else if (type === "video_url") summary.videos.push(url);
    else if (type === "audio_url") summary.audios.push(url);
  }
  return summary;
}

