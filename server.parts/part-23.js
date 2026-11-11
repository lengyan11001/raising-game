async function runVideoToolImageEdit(job, { inputs = [], prompt = "", resultLabel = "image edit", successReason = "image-edit" } = {}) {
  const { taskId, userId, pricing } = job;
  const db = await readGenerationJobDb(userId);
  const user = (db.users || []).find((entry) => entry.id === userId);
  if (!user) throw new Error("User not found.");
  const assets = [];
  for (const input of inputs) {
    const asset = videoToolAsset(db, userId, input.assetId, "image", input.label || "Source image");
    assets.push(await ensurePublicUrlForUserMediaAsset(db, asset));
  }
  if (!assets.length) throw new Error("Image edit input is required.");
  const imageUrls = assets.map(publicUrlForLocalAsset);
  if (imageUrls.some((url) => !isPublicHttpUrl(url))) throw new Error("Image edit inputs are not publicly accessible.");

  const config = await readAppConfig();
  const imageOptions = wan27ImageRequestOptions({}, {
    defaultModel: pricing.model || normalizeAdvancedPricing(config.platform?.advancedPricing).wan27ImagePro.model || WAN27_IMAGE_PRO_MODEL,
    defaultRatio: closestWan27ImageRatioForAsset(assets[0]),
    defaultResolution: "2K",
  });
  const priorRecord = await getGenerationRecord(taskId);
  let upstreamTaskId = String(priorRecord?.upstreamTaskId || "").trim();
  let completed = null;
  if (!upstreamTaskId) {
    await updateVideoToolProgress(taskId, "generating");
    const submit = USE_GATEWAY_UPSTREAM ? gatewaySubmitWan27ImageEditTask : submitWan27ImageModify;
    const submitted = await submit({
      imageUrls,
      prompt,
      ratio: imageOptions.ratio,
      resolution: imageOptions.resolution,
      model: imageOptions.model,
      input: imageOptions.input,
      parameters: imageOptions.parameters,
      waitForResult: false,
    });
    upstreamTaskId = submitted.task.taskId || "";
    if (!upstreamTaskId && !submitted.task.imageUrls?.[0] && !submitted.task.imageUrl) {
      throw new Error(`Wan2.7 ${resultLabel} did not return a task id.`);
    }
    await updateVideoToolProgress(taskId, "generating", {
      upstreamTaskId,
      upstreamPayload: submitted.payload,
      createResponse: submitted.raw,
      awaitingUpstreamTask: Boolean(upstreamTaskId),
    });
    if (submitted.task.imageUrls?.[0] || submitted.task.imageUrl) completed = submitted;
  }
  if (!completed) completed = await waitForWan27ImageToolTask(upstreamTaskId);
  const imageUrl = completed.task.imageUrls?.[0] || completed.task.imageUrl || "";
  if (!imageUrl) throw new Error(`Wan2.7 ${resultLabel} returned no image.`);

  const recordBeforeSave = await getGenerationRecord(taskId);
  const preDeductedCredits = creditsAmount(recordBeforeSave?.preDeductedCredits || 0);
  const freeImageGeneration = recordBeforeSave?.freeImageGeneration === true && preDeductedCredits <= 0;
  let savedImage = { localImagePath: "", localImageUrl: "", cdnImageUrl: "", storageKey: "", storageProvider: "", cdnError: "" };
  let lockedPreview = {};
  if (freeImageGeneration) {
    const downloaded = await downloadRemoteFileToBuffer(imageUrl, { label: `${resultLabel} result`, maxBytes: 20 * 1024 * 1024 });
    const mime = String(downloaded.mime || "").startsWith("image/") ? downloaded.mime : "image/png";
    const fileName = imageFileName(taskId, mime);
    const upload = await uploadStaticAssetToObjectStorage({
      key: objectStoragePath("generated", "images", fileName),
      bytes: downloaded.bytes,
      mime,
    });
    await verifyObjectStorageMedia(upload, { expectedBytes: downloaded.bytes.length, label: "Locked original image" });
    savedImage = {
      localImagePath: "",
      localImageUrl: "",
      cdnImageUrl: upload.publicUrl || "",
      storageKey: upload.key || "",
      storageProvider: upload.provider || objectStorageProvider(),
      cdnError: "",
    };
    const workspace = await createGeneratedMediaWorkspace(`locked-result-${taskId}`);
    try {
      const sourcePath = path.join(workspace, `source${imageExtFromMime(mime)}`);
      await fs.writeFile(sourcePath, downloaded.bytes, { mode: 0o600 });
      lockedPreview = await createUndressLockedPreview(taskId, sourcePath, { workspace });
    } finally {
      await removeGeneratedMediaWorkspace(workspace);
    }
  } else {
    savedImage = await saveRemoteGeneratedImage(taskId, imageUrl, { publish: true });
  }
  const completedAt = new Date().toISOString();
  const record = await getGenerationRecord(taskId);
  await upsertGenerationRecord({
    ...record,
    taskId,
    status: "succeeded",
    awaitingUpstreamTask: false,
    upstreamTaskId,
    imageResultUrl: generationImageResultUrl({ remoteImageUrl: imageUrl }, savedImage),
    localImageUrl: "",
    localImagePath: "",
    cdnImageUrl: freeImageGeneration ? "" : savedImage.cdnImageUrl,
    storageProvider: savedImage.storageProvider || "",
    storageKey: savedImage.storageKey || "",
    cdnError: savedImage.cdnError,
    ...lockedPreview,
    remoteImageUrl: imageUrl,
    providerImageUrl: imageUrl,
    error: "",
    finalCredits: freeImageGeneration ? 0 : pricing.credits,
    originalFinalCredits: freeImageGeneration ? 0 : pricing.originalCredits,
    billingStatus: freeImageGeneration ? "free_locked" : pricing.credits > 0 ? "settled" : "free",
    billingSettledAt: completedAt,
    resultLocked: freeImageGeneration,
    unlockCredits: freeImageGeneration ? creditsAmount(record?.unlockCredits || pricing.credits) : 0,
    unlockType: freeImageGeneration ? "undress_image" : "",
    freeImageGeneration,
    completedAt,
    params: { ...plainObject(record?.params), stage: "completed" },
    lastUpdateReason: `video-tool-${successReason}-succeeded`,
  });
  if (freeImageGeneration && record.freeImageClaimId) {
    await completeToolFreeGenerationInDb({ id: record.freeImageClaimId, userId, taskId }).catch((error) => {
      console.warn("[undress-free-claim-complete-failed]", taskId, error.message || error);
    });
  }
}

async function runVideoToolImageFaceSwap(job) {
  return runVideoToolImageEdit(job, {
    inputs: [
      { assetId: job.targetImageAssetId, label: "Target image" },
      { assetId: job.imageAssetId, label: "Face reference" },
    ],
    prompt: IMAGE_TOOL_FACE_SWAP_PROMPT,
    resultLabel: "image face swap",
    successReason: "image-face-swap",
  });
}

async function runVideoToolFaceSwap(job) {
  const { taskId, userId, imageAssetId, videoAssetId, pricing } = job;
  const undressVideo = job.action === "undress-video";
  const db = await readGenerationJobDb(userId);
  const user = (db.users || []).find((entry) => entry.id === userId);
  if (!user) throw new Error("User not found.");
  let imageAsset = undressVideo ? null : videoToolAsset(db, userId, imageAssetId, "image", "Face image");
  const videoAsset = videoToolAsset(db, userId, videoAssetId, "video", "Source video");
  const workDir = await createGeneratedMediaWorkspace(`video-tool-${taskId}`);
  const upstreamInputUrls = [];
  try {
    const priorRecord = await getGenerationRecord(taskId);
    const priorParams = plainObject(priorRecord?.params);
    const upstreamTaskIds = Array.isArray(priorParams.upstreamTaskIds) ? [...priorParams.upstreamTaskIds] : [];
    upstreamInputUrls.push(...(Array.isArray(priorParams.upstreamInputUrls) ? priorParams.upstreamInputUrls.filter(Boolean) : []));
    if (imageAsset) imageAsset = await ensurePublicUrlForUserMediaAsset(db, imageAsset);
    const sourcePath = await localVideoToolAssetPath(videoAsset, workDir);
    const normalizedPath = path.join(workDir, "source-normalized.mp4");
    await normalizeSeedanceVideoFileForRequest(sourcePath, normalizedPath, "Face Swap source video");
    const actualDuration = await probeLocalVideoDurationSeconds(normalizedPath);
    if (!actualDuration) throw new Error("Source video duration could not be read.");
    const segments = planVideoEditSegments(actualDuration);
    await updateVideoToolProgress(taskId, "splitting", {
      duration: actualDuration,
      params: { durationSeconds: actualDuration, segmentCount: segments.length, completedSegments: 0 },
    });

    const generatedPaths = [];
    for (const segment of segments) {
      const segmentPath = path.join(workDir, `source-${segment.index + 1}.mp4`);
      const outputPath = path.join(workDir, `result-${segment.index + 1}.mp4`);
      if (await probeLocalVideoDurationSeconds(outputPath)) {
        generatedPaths.push(outputPath);
        continue;
      }
      await execFileQuiet("ffmpeg", [
        "-y", "-ss", String(segment.startSeconds), "-i", normalizedPath, "-t", String(segment.inputSeconds),
        "-map", "0:v:0", "-map", "0:a?", "-c:v", "libx264", "-preset", "veryfast", "-crf", "20",
        "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "128k", "-movflags", "+faststart", segmentPath,
      ], { timeout: 10 * 60 * 1000 });
      await updateVideoToolProgress(taskId, "generating", {
        params: { currentSegment: segment.index + 1, segmentCount: segments.length, completedSegments: segment.index },
      });
      let upstreamTaskId = String(upstreamTaskIds[segment.index] || "").trim();
      if (!upstreamTaskId) {
        const published = await publishVideoToolInput(segmentPath, taskId, segment.index);
        upstreamInputUrls[segment.index] = published.url;
        const submitted = await submitAliyunVideoTask({
          provider: "wan27",
          capability: "wan27-video-edit",
          userId,
          prompt: undressVideo ? (job.prompt || VIDEO_TOOL_UNDRESS_EDIT_PROMPT) : VIDEO_TOOL_FACE_SWAP_PROMPT,
          media: [
            { type: "video", url: published.url },
            ...(imageAsset ? [{ type: "reference_image", url: publicUrlForLocalAsset(imageAsset) }] : []),
          ],
          body: {
            model: ALIYUN_WAN27_VIDEO_EDIT_MODEL,
            videoCapability: "wan27-video-edit",
            duration: segment.outputSeconds,
            inputVideoSeconds: segment.inputSeconds,
            resolution: "720p",
            generateAudio: true,
          },
        });
        upstreamTaskId = submitted.task.taskId || "";
        if (!upstreamTaskId) throw new Error("Wan2.7 Video Edit did not return a task id.");
        upstreamTaskIds[segment.index] = upstreamTaskId;
        await updateVideoToolProgress(taskId, "generating", {
          upstreamTaskId,
          upstreamPayload: submitted.payload,
          createResponse: submitted.raw,
          params: {
            upstreamTaskIds,
            upstreamInputUrls,
            currentSegment: segment.index + 1,
            segmentCount: segments.length,
            completedSegments: segment.index,
          },
        });
      }
      const completed = await waitForAliyunVideoToolTask(upstreamTaskId, { inputUrls: upstreamInputUrls });
      await updateVideoToolProgress(taskId, "generating", {
        upstreamTaskId,
        queryResponse: completed.raw,
        params: { upstreamTaskIds, upstreamInputUrls, currentSegment: segment.index + 1, segmentCount: segments.length, completedSegments: segment.index },
      });
      await downloadVideoToolSegment(completed.task.videoUrl, outputPath);
      generatedPaths.push(outputPath);
      await updateVideoToolProgress(taskId, "generating", {
        upstreamTaskId,
        params: { upstreamTaskIds, upstreamInputUrls, currentSegment: segment.index + 1, segmentCount: segments.length, completedSegments: segment.index + 1 },
      });
    }

    await updateVideoToolProgress(taskId, "stitching", { params: { upstreamTaskIds, completedSegments: segments.length } });
    const finalMedia = await composeVideoToolSegments(taskId, generatedPaths);
    const completedAt = new Date().toISOString();
    const record = await getGenerationRecord(taskId);
    await upsertGenerationRecord({
      ...record,
      taskId,
      status: "succeeded",
      awaitingUpstreamTask: false,
      upstreamTaskId: upstreamTaskIds[upstreamTaskIds.length - 1] || "",
      videoUrl: DISABLE_GENERATED_R2_STORAGE ? (record?.remoteVideoUrl || "") : finalMedia.cdnVideoUrl,
      localVideoUrl: "",
      localVideoPath: "",
      localPosterUrl: "",
      localPosterPath: "",
      posterUrl: finalMedia.cdnPosterUrl || "",
      cdnVideoUrl: finalMedia.cdnVideoUrl || "",
      cdnPosterUrl: finalMedia.cdnPosterUrl || "",
      storageProvider: finalMedia.storageProvider || "",
      storageKey: finalMedia.storageKey || "",
      posterStorageProvider: finalMedia.posterStorageProvider || "",
      posterStorageKey: finalMedia.posterStorageKey || "",
      cdnError: finalMedia.cdnError || "",
      playbackOptimizedAt: finalMedia.playbackOptimizedAt || completedAt,
      error: "",
      finalCredits: pricing.credits,
      originalFinalCredits: pricing.originalCredits,
      billingStatus: pricing.credits > 0 ? "settled" : "free",
      billingSettledAt: completedAt,
      completedAt,
      queryResponse: record?.queryResponse || null,
      params: { ...plainObject(record?.params), stage: "completed", upstreamTaskIds, upstreamInputUrls, completedSegments: segments.length },
      lastUpdateReason: undressVideo ? "video-tool-undress-video-succeeded" : "video-tool-face-swap-succeeded",
    });
  } finally {
    await removeGeneratedMediaWorkspace(workDir);
  }
}

async function runVideoToolUndress(job) {
  return runVideoToolImageEdit(job, {
    inputs: [{ assetId: job.imageAssetId, label: "Source image" }],
    prompt: job.prompt || VIDEO_TOOL_UNDRESS_TARGET_PROMPT,
    resultLabel: "undress image edit",
    successReason: "undress",
  });
}

async function runVideoToolUndressImageVideo(job) {
  const { taskId, userId, imageAssetId, pricing } = job;
  const db = await readGenerationJobDb(userId);
  const user = (db.users || []).find((entry) => entry.id === userId);
  if (!user) throw new Error("User not found.");
  const sourceAsset = await ensurePublicUrlForUserMediaAsset(
    db,
    videoToolAsset(db, userId, imageAssetId, "image", "Source image"),
  );
  const imageUrl = publicUrlForLocalAsset(sourceAsset);
  if (!isPublicHttpUrl(imageUrl)) throw new Error("Source image is not publicly accessible.");

  const priorRecord = await getGenerationRecord(taskId);
  let upstreamTaskId = String(priorRecord?.upstreamTaskId || "").trim();
  let completed = null;
  if (!upstreamTaskId) {
    await updateVideoToolProgress(taskId, "generating");
    const submitted = await submitAliyunVideoTask({
      provider: "wan27",
      capability: "wan27-i2v",
      userId,
      prompt: job.prompt || VIDEO_TOOL_UNDRESS_IMAGE_VIDEO_PROMPT,
      media: [{ type: "first_frame", url: imageUrl }],
      body: {
        model: ALIYUN_WAN27_I2V_MODEL,
        videoCapability: "wan27-i2v",
        mediaMode: "first_frame",
        duration: 5,
        resolution: "720P",
        ratio: "9:16",
        generateAudio: true,
        prompt_extend: true,
        watermark: false,
      },
    });
    upstreamTaskId = submitted.task.taskId || "";
    if (!upstreamTaskId && !submitted.task.videoUrl) {
      throw new Error("Wan2.7 image-to-video did not return a task id.");
    }
    await updateVideoToolProgress(taskId, "generating", {
      upstreamTaskId,
      upstreamPayload: submitted.payload,
      createResponse: submitted.raw,
      awaitingUpstreamTask: Boolean(upstreamTaskId),
    });
    if (submitted.task.videoUrl) completed = submitted;
  }
  if (!completed) completed = await waitForAliyunVideoToolTask(upstreamTaskId);
  const videoUrl = completed.task.videoUrl || "";
  if (!videoUrl) throw new Error("Wan2.7 image-to-video returned no video.");

  const finalMedia = await downloadGeneratedVideo(taskId, videoUrl);
  const completedAt = new Date().toISOString();
  const record = await getGenerationRecord(taskId);
  await upsertGenerationRecord({
    ...record,
    taskId,
    status: "succeeded",
    awaitingUpstreamTask: false,
    upstreamTaskId,
    remoteVideoUrl: videoUrl,
    videoUrl: DISABLE_GENERATED_R2_STORAGE ? videoUrl : (finalMedia.cdnVideoUrl || videoUrl),
    localVideoUrl: "",
    localVideoPath: "",
    localPosterUrl: "",
    localPosterPath: "",
    posterUrl: finalMedia.cdnPosterUrl || "",
    cdnVideoUrl: finalMedia.cdnVideoUrl || "",
    cdnPosterUrl: finalMedia.cdnPosterUrl || "",
    storageProvider: finalMedia.storageProvider || "",
    storageKey: finalMedia.storageKey || "",
    posterStorageProvider: finalMedia.posterStorageProvider || "",
    posterStorageKey: finalMedia.posterStorageKey || "",
    cdnError: finalMedia.cdnError || "",
    playbackOptimizedAt: finalMedia.playbackOptimizedAt || completedAt,
    queryResponse: completed.raw || null,
    error: "",
    finalCredits: pricing.credits,
    originalFinalCredits: pricing.originalCredits,
    billingStatus: pricing.credits > 0 ? "settled" : "free",
    billingSettledAt: completedAt,
    completedAt,
    params: { ...plainObject(record?.params), stage: "completed" },
    lastUpdateReason: "video-tool-undress-image-video-succeeded",
  });
}

async function runVideoToolUndressVideoLegacy(job) {
  const { taskId, userId, imageAssetId, pricing } = job;
  const db = await readGenerationJobDb(userId);
  const user = (db.users || []).find((entry) => entry.id === userId);
  if (!user) throw new Error("User not found.");
  const sourceAsset = videoToolAsset(db, userId, imageAssetId, "image", "Source image");
  const config = await readAppConfig();
  const priorRecord = await getGenerationRecord(taskId);
  const priorParams = plainObject(priorRecord?.params);
  const upstreamTaskIds = Array.isArray(priorParams.upstreamTaskIds) ? [...priorParams.upstreamTaskIds] : [];

  let keyframeAsset = priorParams.keyframeAssetId
    ? videoToolAsset(db, userId, priorParams.keyframeAssetId, "image", "Generated keyframe")
    : null;
  if (!keyframeAsset) {
    await updateVideoToolProgress(taskId, "keyframe");
    const keyframe = await generateVideoToolImageStage({
      db, user, sourceAsset, prompt: VIDEO_TOOL_UNDRESS_KEYFRAME_PROMPT, taskId, stage: "keyframe", config,
    });
    keyframeAsset = keyframe.asset;
    if (keyframe.upstreamTaskId && !upstreamTaskIds.includes(keyframe.upstreamTaskId)) upstreamTaskIds.push(keyframe.upstreamTaskId);
    await updateVideoToolProgress(taskId, "keyframe", {
      params: { upstreamTaskIds, keyframeAssetId: keyframeAsset.id },
    });
  }

  let targetAsset = priorParams.targetAssetId
    ? videoToolAsset(db, userId, priorParams.targetAssetId, "image", "Generated target")
    : null;
  if (!targetAsset) {
    await updateVideoToolProgress(taskId, "target", { params: { upstreamTaskIds, keyframeAssetId: keyframeAsset.id } });
    const target = await generateVideoToolImageStage({
      db, user, sourceAsset: keyframeAsset, prompt: job.prompt || VIDEO_TOOL_UNDRESS_TARGET_PROMPT, taskId, stage: "target", config,
    });
    targetAsset = target.asset;
    if (target.upstreamTaskId && !upstreamTaskIds.includes(target.upstreamTaskId)) upstreamTaskIds.push(target.upstreamTaskId);
    await updateVideoToolProgress(taskId, "target", {
      params: { upstreamTaskIds, keyframeAssetId: keyframeAsset.id, targetAssetId: targetAsset.id },
    });
  }

  const preparedTarget = USE_GATEWAY_UPSTREAM
    ? { referenceAssetUri: publicUrlForLocalAsset(targetAsset), imageUrl: publicUrlForLocalAsset(targetAsset) }
    : await prepareSeedanceReferenceAsset(db, targetAsset, false);
  const preset = await videoToolUndressPreset();
  let presetImageUri = "";
  let presetVideoUri = "";
  const posterUrl = publicHttpUrlForUpstream(preset.posterUrl) || publicUrlForAssetPath(preset.posterUrl || "");
  if (posterUrl) {
    const presetImage = await createUserMediaAssetFromPublicUrl(db, user, {
      url: posterUrl,
      name: "Undress reference image",
      fileName: "undress-reference.png",
      hidden: true,
      meta: { videoToolTaskId: taskId, videoToolStage: "preset-image" },
    });
    presetImageUri = USE_GATEWAY_UPSTREAM
      ? publicUrlForLocalAsset(presetImage)
      : (await prepareSeedanceReferenceAsset(db, presetImage, false)).referenceAssetUri;
  }
  const previewUrl = publicHttpUrlForUpstream(preset.previewUrl) || publicUrlForAssetPath(preset.previewUrl || "");
  if (previewUrl) {
    const presetVideo = await createSeedanceReferenceVideoAssetFromUrl(db, user, previewUrl, 0);
    if (presetVideo) {
      presetVideoUri = USE_GATEWAY_UPSTREAM
        ? publicUrlForLocalAsset(presetVideo)
        : (await prepareSeedanceVideoAsset(db, presetVideo)).referenceAssetUri;
    }
  }

  await updateVideoToolProgress(taskId, "generating", { params: { upstreamTaskIds } });
  const latestRecord = await getGenerationRecord(taskId);
  let upstreamTaskId = String(latestRecord?.params?.seedanceTaskId || "").trim();
  if (!upstreamTaskId) {
    const submitted = await submitSeedanceVideoTask({
      config,
      prompt: VIDEO_TOOL_UNDRESS_VIDEO_PROMPT,
      referenceAssetUri: preparedTarget.referenceAssetUri || preparedTarget.imageUrl,
      extraReferenceAssetUris: [presetImageUri].filter(Boolean),
      referenceVideoAssetUri: presetVideoUri,
      body: {
        provider: "seedance",
        model: MODEL_QUALITY,
        seedanceTier: "standard",
        seedanceMode: "reference_images",
        ratio: "9:16",
        resolution: "720p",
        duration: 5,
        generateAudio: true,
      },
      slug: "video-tool-undress",
    });
    upstreamTaskId = submitted.task.taskId || "";
    if (!upstreamTaskId) throw new Error("Seedance did not return a task id.");
    if (!upstreamTaskIds.includes(upstreamTaskId)) upstreamTaskIds.push(upstreamTaskId);
    await updateVideoToolProgress(taskId, "generating", {
      upstreamTaskId,
      params: { upstreamTaskIds, seedanceTaskId: upstreamTaskId },
    });
  }
  const completed = await waitForSeedanceVideoToolTask(upstreamTaskId);
  const finalMedia = await downloadGeneratedVideo(taskId, completed.task.videoUrl);
  const completedAt = new Date().toISOString();
  const record = await getGenerationRecord(taskId);
  await upsertGenerationRecord({
    ...record,
    taskId,
    status: "succeeded",
    awaitingUpstreamTask: false,
    upstreamTaskId,
    remoteVideoUrl: completed.task.videoUrl,
    videoUrl: DISABLE_GENERATED_R2_STORAGE ? completed.task.videoUrl : (finalMedia.cdnVideoUrl || completed.task.videoUrl),
    localVideoUrl: "",
    localVideoPath: "",
    localPosterUrl: "",
    localPosterPath: "",
    posterUrl: finalMedia.cdnPosterUrl || "",
    cdnVideoUrl: finalMedia.cdnVideoUrl || "",
    cdnPosterUrl: finalMedia.cdnPosterUrl || "",
    storageProvider: finalMedia.storageProvider || "",
    storageKey: finalMedia.storageKey || "",
    posterStorageProvider: finalMedia.posterStorageProvider || "",
    posterStorageKey: finalMedia.posterStorageKey || "",
    cdnError: finalMedia.cdnError || "",
    queryResponse: completed.raw || null,
    error: "",
    finalCredits: pricing.credits,
    originalFinalCredits: pricing.originalCredits,
    billingStatus: pricing.credits > 0 ? "settled" : "free",
    billingSettledAt: completedAt,
    completedAt,
    params: { ...plainObject(record?.params), stage: "completed", upstreamTaskIds },
    lastUpdateReason: "video-tool-undress-succeeded",
  });
}

const activeVideoToolJobIds = new Set();
const videoToolJobQueue = [];
const VIDEO_TOOL_JOB_CONCURRENCY = Math.max(1, Math.min(4, Number(process.env.VIDEO_TOOL_JOB_CONCURRENCY || 2) || 2));
let videoToolJobActive = 0;
let videoToolJobDrainScheduled = false;

function videoToolRunnerForJob(job = {}) {
  return job.action === "image-face-swap"
    ? runVideoToolImageFaceSwap
    : job.action === "undress-image-video"
      ? runVideoToolUndressImageVideo
    : ["face-swap", "undress-video"].includes(job.action)
      ? runVideoToolFaceSwap
      : job.action === "undress" && job.pricing?.outputKind !== "image"
        ? runVideoToolUndressVideoLegacy
        : runVideoToolUndress;
}

let generationMediaRecoveryRunning = false;

async function scanGenerationRecordMediaRecovery(reason = "timer") {
  if (generationMediaRecoveryRunning || !objectStorageEnabled()) return;
  generationMediaRecoveryRunning = true;
  try {
    const records = dbEnabled()
      ? await getGenerationRecordsNeedingR2RecoveryFromDb({ limit: 100 })
      : await readGenerationRecords();
    const candidates = records
      .filter((record) => isSucceededStatus(record.status) && generationRecordNeedsMediaMaintenance(record))
      .slice(0, 25);
    for (const record of candidates) queueGenerationRecordMediaMaintenance(record);
    if (candidates.length) console.log("[generation-record-r2-recovery-scan]", reason, candidates.length);
  } catch (error) {
    console.warn("[generation-record-r2-recovery-scan-failed]", error.message || error);
  } finally {
    generationMediaRecoveryRunning = false;
  }
}

let generationPosterBackfillRunning = false;

async function scanGenerationRecordMissingPosterBackfill(reason = "timer") {
  if (generationPosterBackfillRunning || !dbEnabled()) return;
  generationPosterBackfillRunning = true;
  try {
    const records = await getGenerationRecordsNeedingPosterMaintenanceFromDb({
      limit: GENERATION_POSTER_BACKFILL_BATCH_SIZE,
      maxAttempts: GENERATION_POSTER_BACKFILL_MAX_ATTEMPTS,
      retryDelayMs: GENERATION_POSTER_BACKFILL_RETRY_DELAY_MS,
    }) || [];
    let repaired = 0;
    let failed = 0;
    for (const candidate of records) {
      const current = await getGenerationRecord(candidate.taskId).catch(() => null);
      if (!current || !generationRecordNeedsPosterMaintenance(current)) continue;
      const previousAttempts = Number(current.posterMaintenanceAttempts || 0);
      const repairStartedAt = Date.now();
      try {
        // Avoid storing thousands of historical full videos. Poster-only mode
        // uses the local file when present, otherwise ffmpeg reads the remote
        // stream and writes only the thumbnail.
        await ensureGenerationRecordMediaOptimized(current, { allowObjectStorageUpload: false });
        const repairedRecord = await getGenerationRecord(current.taskId).catch(() => null);
        if (!generationRecordNeedsPosterMaintenance(repairedRecord || {})) {
          repaired += 1;
          await upsertGenerationRecord({
            taskId: current.taskId,
            posterMaintenanceAttempts: previousAttempts + 1,
            posterMaintenanceRetryAt: "",
            posterMaintenanceError: "",
            posterMaintenanceTerminalAt: "",
            posterMaintenanceCompletedAt: new Date().toISOString(),
            posterMaintenanceLastDurationMs: Math.max(0, Date.now() - repairStartedAt),
          });
        } else {
          throw new Error("Poster frame was not created.");
        }
      } catch (error) {
        failed += 1;
        const now = Date.now();
        await upsertGenerationRecord({
          taskId: current.taskId,
          ...posterMaintenanceFailureUpdates(previousAttempts, error, now),
          posterMaintenanceLastDurationMs: Math.max(0, now - repairStartedAt),
        }).catch(() => {});
      }
      await delay(750);
    }
    if (repaired || failed) {
      console.log("[generation-poster-backfill]", reason, { scanned: records.length, repaired, failed });
    }
  } catch (error) {
    console.warn("[generation-poster-backfill-scan-failed]", error.message || error);
  } finally {
    generationPosterBackfillRunning = false;
  }
}

let generationMediaPersistenceRunning = false;

async function scanGenerationRecordMissingMediaPersistence(reason = "timer") {
  if (generationMediaPersistenceRunning || !dbEnabled() || !objectStorageEnabled()) return;
  generationMediaPersistenceRunning = true;
  try {
    const records = await getGenerationRecordsNeedingMediaPersistenceFromDb({
      limit: GENERATION_MEDIA_PERSISTENCE_BATCH_SIZE,
      maxAgeMs: GENERATION_MEDIA_PERSISTENCE_MAX_AGE_MS,
      maxAttempts: GENERATION_MEDIA_PERSISTENCE_MAX_ATTEMPTS,
      retryDelayMs: GENERATION_MEDIA_PERSISTENCE_RETRY_DELAY_MS,
    }) || [];
    let repaired = 0;
    let failed = 0;
    for (const candidate of records) {
      let current = await getGenerationRecord(candidate.taskId).catch(() => null);
      if (!current || !isSucceededStatus(current.status) || !generationRecordProviderVideoUrl(current)) continue;
      const previousAttempts = Number(current.mediaPersistenceAttempts || 0);
      const startedAt = new Date().toISOString();
      try {
        // Refresh an expired provider URL before trying to copy it. A saved
        // provider URL is not proof that the durable media still exists.
        if (!current.cdnVideoUrl && shouldRefreshGenerationRecord(current)) {
          current = await refreshGenerationRecordStatus(current);
        }
        if (!current || !isSucceededStatus(current.status) || !generationRecordProviderVideoUrl(current)) {
          throw new Error("Generated media source is unavailable.");
        }
        await prepareGenerationRecordAdvancedDownload(current);
        const repairedRecord = await getGenerationRecord(current.taskId).catch(() => null);
        if (!repairedRecord || !repairedRecord.cdnVideoUrl || !repairedRecord.storageKey) {
          throw new Error("Generated video was not persisted.");
        }
        if (repairedRecord.cdnPosterUrl && !repairedRecord.posterStorageKey) {
          throw new Error("Generated poster was not fully persisted.");
        }
        await updateGenerationRecordAdvancedDownloadInDb(current.taskId, {
          mediaPersistenceAttempts: previousAttempts + 1,
          mediaPersistenceRetryAt: "",
          mediaPersistenceTerminalAt: "",
          mediaPersistenceLastAttemptAt: startedAt,
        });
        repaired += 1;
      } catch (error) {
        failed += 1;
        const attempts = Math.min(GENERATION_MEDIA_PERSISTENCE_MAX_ATTEMPTS, previousAttempts + 1);
        const terminal = attempts >= GENERATION_MEDIA_PERSISTENCE_MAX_ATTEMPTS || !isRetryableMediaIngestError(error);
        await updateGenerationRecordAdvancedDownloadInDb(current.taskId, {
          advancedDownloadStatus: terminal ? "failed" : "preparing",
          advancedDownloadError: advancedDownloadFailureMessage(error),
          mediaPersistenceAttempts: attempts,
          mediaPersistenceRetryAt: terminal ? "" : new Date(Date.now() + GENERATION_MEDIA_PERSISTENCE_RETRY_DELAY_MS * attempts).toISOString(),
          mediaPersistenceTerminalAt: terminal ? new Date().toISOString() : "",
          mediaPersistenceLastAttemptAt: startedAt,
        }).catch(() => {});
      }
      await delay(1000);
    }
    if (records.length) console.log("[generation-media-persistence]", reason, { scanned: records.length, repaired, failed });
  } catch (error) {
    console.warn("[generation-media-persistence-scan-failed]", error.message || error);
  } finally {
    generationMediaPersistenceRunning = false;
  }
}

function runGenerationRecordMediaRecoverySchedulerTick(reason) {
  return runWithSchedulerLease("generation-record-media-recovery", () => (
    scanGenerationRecordMediaRecovery(reason)
  ), {
    connect: () => getSchedulerPool().connect(),
    onError: (error) => console.warn("[generation-media-recovery-lease-failed]", error.message || error),
  });
}

function runGenerationRecordMediaPersistenceSchedulerTick(reason) {
  return runWithSchedulerLease("generation-record-media-persistence", () => (
    scanGenerationRecordMissingMediaPersistence(reason)
  ), {
    connect: () => getSchedulerPool().connect(),
    onError: (error) => console.warn("[generation-media-persistence-lease-failed]", error.message || error),
  });
}

function runGenerationPosterBackfillSchedulerTick(reason) {
  return runWithSchedulerLease("generation-poster-backfill", () => (
    scanGenerationRecordMissingPosterBackfill(reason)
  ), {
    connect: () => getSchedulerPool().connect(),
    onError: (error) => console.warn("[generation-poster-backfill-loop-failed]", error.message || error),
  });
}

function startGenerationRecordMediaRecoveryScheduler() {
  setTimeout(() => runGenerationRecordMediaRecoverySchedulerTick("startup"), 20000).unref?.();
  setInterval(() => runGenerationRecordMediaRecoverySchedulerTick("timer"), 5 * 60 * 1000).unref?.();
  setTimeout(() => runGenerationRecordMediaPersistenceSchedulerTick("startup"), 35000).unref?.();
  setInterval(() => runGenerationRecordMediaPersistenceSchedulerTick("timer"), GENERATION_MEDIA_PERSISTENCE_INTERVAL_MS).unref?.();
  setTimeout(function runPosterBackfill() {
    runGenerationPosterBackfillSchedulerTick("startup")
      .finally(() => setTimeout(runPosterBackfill, GENERATION_POSTER_BACKFILL_INTERVAL_MS).unref?.());
  }, 25000).unref?.();
}

function scheduleVideoToolJobDrain() {
  if (videoToolJobDrainScheduled) return;
  videoToolJobDrainScheduled = true;
  setImmediate(() => {
    videoToolJobDrainScheduled = false;
    drainVideoToolJobQueue();
  });
}

function drainVideoToolJobQueue() {
  while (videoToolJobActive < VIDEO_TOOL_JOB_CONCURRENCY && videoToolJobQueue.length) {
    const job = videoToolJobQueue.shift();
    videoToolJobActive += 1;
    Promise.resolve().then(() => videoToolRunnerForJob(job)(job)).catch(async (error) => {
      console.error("[video-tool-job-failed]", job.taskId, error.message || error);
      try {
        await refundVideoToolTask(job.taskId, error.message || "Video generation failed.", error.payload || null);
      } catch (refundError) {
        console.error("[video-tool-refund-failed]", job.taskId, refundError.message || refundError);
      }
    }).finally(() => {
      videoToolJobActive -= 1;
      activeVideoToolJobIds.delete(job.taskId);
      scheduleVideoToolJobDrain();
    });
  }
}

function startVideoToolJob(job) {
  if (!job?.taskId || activeVideoToolJobIds.has(job.taskId)) return false;
  activeVideoToolJobIds.add(job.taskId);
  videoToolJobQueue.push(job);
  scheduleVideoToolJobDrain();
  return true;
}

async function recoverVideoToolJobs(reason = "startup") {
  const records = await readGenerationRecords();
  const cutoff = Date.now() - 24 * 60 * 60 * 1000;
  const recoverable = records.filter((record) => {
    if (record.upstreamSource !== "video-tool-orchestrator") return false;
    if (isSucceededStatus(record.status) || isFailedStatus(record.status)) return false;
    if (String(record.billingStatus || "").toLowerCase() === "refunded") return false;
    const createdAt = Date.parse(record.createdAt || record.updatedAt || "");
    return !Number.isFinite(createdAt) || createdAt >= cutoff;
  });
  recoverable.forEach((record) => {
    const action = videoToolAction(record.params?.toolAction || record.kind || record.source);
    const assetIds = Array.isArray(record.userAssetIds) ? record.userAssetIds.filter(Boolean) : [];
    const targetImageAssetId = action === "image-face-swap" ? (record.userAssetId || assetIds[0] || "") : "";
    const imageAssetId = action === "image-face-swap"
      ? (assetIds.find((id) => id !== targetImageAssetId) || assetIds[1] || "")
      : (record.userAssetId || assetIds[0] || "");
    const videoAssetId = ["face-swap", "undress-video"].includes(action)
      ? (action === "undress-video" ? (record.userAssetId || assetIds[0] || "") : (assetIds.find((id) => id !== imageAssetId) || assetIds[1] || ""))
      : "";
    if (
      !action
      || (action !== "undress-video" && !imageAssetId)
      || (action === "image-face-swap" && !targetImageAssetId)
      || (["face-swap", "undress-video"].includes(action) && !videoAssetId)
    ) return;
    const started = startVideoToolJob({
      taskId: record.taskId,
      action,
      userId: record.userId,
      imageAssetId,
      targetImageAssetId,
      videoAssetId,
      pricing: plainObject(record.pricingEstimate),
      prompt: record.finalPrompt || record.prompt || "",
    });
    if (started) console.log("[video-tool-job-recovered]", { reason, taskId: record.taskId, action });
  });
}

function runVideoToolJobRecoverySchedulerTick() {
  return runWithSchedulerLease("video-tool-job-recovery", () => recoverVideoToolJobs("startup"), {
    connect: () => getSchedulerPool().connect(),
    onError: (error) => console.error("[video-tool-recovery-failed]", error.message || error),
  });
}

function startVideoToolJobRecoveryScheduler() {
  setTimeout(() => runVideoToolJobRecoverySchedulerTick(), 10000).unref?.();
}

async function cleanupStaleVideoToolUploads() {
  const cutoff = Date.now() - 24 * 60 * 60 * 1000;
  let userDirs = [];
  try {
    userDirs = await fs.readdir(VIDEO_TOOL_UPLOAD_PART_DIR, { withFileTypes: true });
  } catch (error) {
    if (error.code !== "ENOENT") console.warn("[video-tool-upload-cleanup-failed]", error.message || error);
    return;
  }
  for (const userDir of userDirs.filter((entry) => entry.isDirectory())) {
    const userPath = path.join(VIDEO_TOOL_UPLOAD_PART_DIR, userDir.name);
    const uploadDirs = await fs.readdir(userPath, { withFileTypes: true }).catch(() => []);
    for (const uploadDir of uploadDirs.filter((entry) => entry.isDirectory())) {
      const uploadPath = path.join(userPath, uploadDir.name);
      const stat = await fs.stat(uploadPath).catch(() => null);
      if (stat && stat.mtimeMs < cutoff) await fs.rm(uploadPath, { recursive: true, force: true }).catch(() => {});
    }
  }
}

function runVideoToolUploadCleanupSchedulerTick() {
  return runWithSchedulerLease("video-tool-upload-cleanup", () => cleanupStaleVideoToolUploads(), {
    connect: () => getSchedulerPool().connect(),
    onError: (error) => console.warn("[video-tool-upload-cleanup-lease-failed]", error.message || error),
  });
}

function startVideoToolUploadCleanupScheduler() {
  setTimeout(() => runVideoToolUploadCleanupSchedulerTick(), 30000).unref?.();
  setInterval(() => runVideoToolUploadCleanupSchedulerTick(), 6 * 60 * 60 * 1000).unref?.();
}

async function cleanupStaleLocalMedia() {
  // Business media is permanent. Only remove stale disposable workspaces from
  // the OS temp directory; success/failure paths still clean their own workspace.
  const result = await cleanupTransientMediaWorkspaces();
  if (result.directories > 0) {
    console.log("[local-media-temp-cleaned]", result);
  }
}

async function deleteStoredGeneratedObject(key = "", provider = objectStorageProvider()) {
  const clean = String(key || "").replace(/^\/+/, "");
  if (!clean.includes("/generated/") && !clean.startsWith("generated/")) return false;
  if (!objectStorageEnabled()) return false;
  if (provider === "oss") {
    await deleteOssObject({ key: clean, config: OSS });
    return true;
  }
  const auth = makeR2Auth({
    method: "DELETE",
    key: clean,
    body: Buffer.alloc(0),
    contentType: "application/octet-stream",
  });
  const response = await fetch(auth.url, {
    method: "DELETE",
    headers: auth.headers,
    signal: AbortSignal.timeout(20000),
  });
  return response.ok || response.status === 404;
}

let generatedR2ExpiryRunning = false;
async function expireGeneratedR2Objects() {
  // Successfully generated results are user data, not disposable cache. The
  // old hourly retention job removed the only durable copy after 24 hours and
  // made historical thumbnails/playback disappear. Keep the scheduler entry
  // point for operational compatibility, but never purge successful outputs.
  if (generatedR2ExpiryRunning || !generatedOutputStorageEnabled() || !dbEnabled()) return;
  generatedR2ExpiryRunning = true;
  try {
    if (!expireGeneratedR2Objects.disabledLogged) {
      console.log("[generated-r2-expiry-disabled] successful generation media retention is permanent");
      expireGeneratedR2Objects.disabledLogged = true;
    }
  } finally {
    generatedR2ExpiryRunning = false;
  }
}

function runLocalMediaCleanupSchedulerTick() {
  return runWithSchedulerLease("local-media-cleanup", () => cleanupStaleLocalMedia(), {
    connect: () => getSchedulerPool().connect(),
    onError: (error) => console.warn("[local-media-cleanup-lease-failed]", error.message || error),
  });
}

function runGeneratedR2ExpirySchedulerTick() {
  return runWithSchedulerLease("generated-r2-expiry", () => expireGeneratedR2Objects(), {
    connect: () => getSchedulerPool().connect(),
    onError: (error) => console.warn("[generated-r2-expiry-lease-failed]", error.message || error),
  });
}

function startLocalMediaCleanupScheduler() {
  setTimeout(() => runLocalMediaCleanupSchedulerTick(), 30000).unref?.();
  setInterval(() => runLocalMediaCleanupSchedulerTick(), 5 * 60 * 1000).unref?.();
  setTimeout(() => runGeneratedR2ExpirySchedulerTick(), 60000).unref?.();
  setInterval(() => runGeneratedR2ExpirySchedulerTick(), 60 * 60 * 1000).unref?.();
}

function runMediaIngestWorkerSchedulerTick() {
  return runWithSchedulerLease("media-ingest-worker", () => scanMediaIngestQueue(), {
    connect: () => getSchedulerPool().connect(),
    onError: (error) => console.warn("[media-ingest-worker-lease-failed]", error.message || error),
  });
}

function startMediaIngestWorkerScheduler() {
  setTimeout(() => runMediaIngestWorkerSchedulerTick(), 5000).unref?.();
  setInterval(() => runMediaIngestWorkerSchedulerTick(), 15 * 1000).unref?.();
}

function runChatLiveStaleSettlementSchedulerTick() {
  return runWithSchedulerLease("chat-live-stale-settlement", () => settleStaleChatLiveSessions(), {
    connect: () => getSchedulerPool().connect(),
    onError: (error) => console.warn("[chat-live-stale-settlement-lease-failed]", error.message || error),
  });
}

function runChatLiveOrphanCleanupSchedulerTick() {
  return runWithSchedulerLease("chat-live-orphan-cleanup", () => cleanupOrphanedChatLiveFreeAllocations(), {
    connect: () => getSchedulerPool().connect(),
    onError: (error) => console.warn("[chat-live-orphan-cleanup-lease-failed]", error.message || error),
  });
}

function runAuthRiskCleanupSchedulerTick() {
  return runWithSchedulerLease("auth-risk-cleanup", async () => {
    if (!dbEnabled()) return;
    const cleaned = await cleanupAuthRiskDataInDb();
    if (cleaned.rateLimits || cleaned.riskEvents || cleaned.loginFailures) console.log("[auth-risk-cleanup]", cleaned);
  }, {
    connect: () => getSchedulerPool().connect(),
    onError: (error) => console.error(`[auth-risk-cleanup] ${error.message}`),
  });
}

async function monitorUnsettledChatLiveSessions() {
  const sessions = await listUnsettledChatLiveSessionsInDb({ limit: 30, minAgeSeconds: 5 }).catch(() => []);
  const active = [];
  for (const session of sessions) {
    if (!session || session.settled === true || !session.liveId) continue;
    const terminalStatus = normalizeChatLiveUpstreamStatus(session.upstreamStatus || session.status);
    const storedSeconds = Number(session.upstreamBilledSeconds);
    const hasTerminalEvidence = chatLiveUpstreamIsTerminal(terminalStatus)
      && Number.isFinite(storedSeconds)
      && storedSeconds >= 0;
    if (hasTerminalEvidence) {
      settleChatLiveSessionById(session.id).catch(() => null);
    } else {
      active.push(session);
    }
  }
  await Promise.all(active.map((item) => monitorChatLiveSession(item).catch(() => null)));
}

function runChatLiveBillingSchedulerTick() {
  return runWithSchedulerLease("chat-live-billing-monitor", () => monitorUnsettledChatLiveSessions(), {
    connect: () => getSchedulerPool().connect(),
    onError: (error) => console.warn("[chat-live-billing-monitor-lease-failed]", error.message || error),
  });
}

function startChatLiveSettlementScheduler() {
  setTimeout(() => runChatLiveStaleSettlementSchedulerTick(), 45000).unref?.();
  setInterval(() => runChatLiveStaleSettlementSchedulerTick(), 60000).unref?.();
  setTimeout(() => runChatLiveOrphanCleanupSchedulerTick(), 90000).unref?.();
  setInterval(() => runChatLiveOrphanCleanupSchedulerTick(), 10 * 60 * 1000).unref?.();
  setInterval(() => runAuthRiskCleanupSchedulerTick(), 6 * 60 * 60 * 1000).unref?.();
  /*
   * Query only genuinely unsettled rows. Scanning the latest 100 sessions
   * every five seconds repeatedly polled already-ended calls and starved the
   * Node event loop. Stored terminal evidence is settled without another Vidu
   * request, while active calls continue to renew prepaid coverage each tick.
   */
  setInterval(() => runChatLiveBillingSchedulerTick(), CHAT_LIVE_BILLING_TICK_MS).unref?.();
}

async function handleVideoToolGenerate(req, res) {
  const auth = await requireUser(req, res);
  if (!auth) return;
  const body = await readJson(req);
  const action = videoToolAction(body.action);
  if (!action) return sendJson(res, 400, { ok: false, message: "Unsupported video tool action." });
  try {
    const isImageFaceSwap = action === "image-face-swap";
    const isImageAction = action === "undress" || isImageFaceSwap;
    const appConfig = await readAppConfig();
    const configuredUndressPrompt = undressPromptForAction(action, appConfig.undressPrompts);
    const taskPrompt = configuredUndressPrompt
      || (isImageFaceSwap ? IMAGE_TOOL_FACE_SWAP_PROMPT : VIDEO_TOOL_FACE_SWAP_PROMPT);
    const imageAsset = videoToolAsset(
      auth.db,
      auth.user.id,
      body.imageAssetId,
      "image",
      action === "undress" ? "Source image" : "Face reference",
    );
    const targetImageAsset = action === "image-face-swap"
      ? videoToolAsset(auth.db, auth.user.id, body.targetImageAssetId, "image", "Target image")
      : null;
    let videoAsset = null;
    let durationSeconds = 0;
    if (action === "face-swap") {
      videoAsset = videoToolAsset(auth.db, auth.user.id, body.videoAssetId, "video", "Source video");
      const localPath = localPathForUserAsset(videoAsset);
      durationSeconds = localPath ? await probeLocalVideoDurationSeconds(localPath) : 0;
      if (!durationSeconds) durationSeconds = await probeVideoDurationSeconds(publicUrlForLocalAsset(videoAsset));
      if (!durationSeconds) return sendJson(res, 400, { ok: false, message: "Source video duration could not be read." });
    }
    const pricing = await videoToolPricing(action, { durationSeconds, user: auth.user, auth });
    const cost = pricing.credits;
    if (auth.user.credits < cost) return sendJson(res, 402, insufficientCreditsPayload(cost, auth.user.credits));
    try {
      assertSubtokenCanSpend(auth, cost);
    } catch (error) {
      return sendJson(res, error.statusCode || 402, error.payload || { ok: false, code: error.code || "SUBTOKEN_UNAVAILABLE", message: error.message });
    }

    const taskId = localGenerationTaskId(
      action === "image-face-swap" ? "image-face" : action === "face-swap" ? "face" : "undress",
    );
    if (cost > 0) {
      await chargeUserWithSubtoken(auth, {
        cost,
        type: `video_tool_${action.replace(/-/g, "_")}`,
        taskId,
        meta: {
          taskId,
          action,
          imageAssetId: imageAsset.id,
          targetImageAssetId: targetImageAsset?.id || "",
          videoAssetId: videoAsset?.id || "",
          durationSeconds: pricing.durationSeconds,
          segmentCount: pricing.segmentCount,
          model: pricing.model,
          originalCost: pricing.originalCredits,
          pricingSource: pricing.source,
        },
      });
      if (!dbEnabled()) await writeDb(auth.db);
    }
    const primaryAsset = targetImageAsset || imageAsset;
    const assetIds = isImageFaceSwap
      ? [targetImageAsset.id, imageAsset.id]
      : [imageAsset.id, videoAsset?.id].filter(Boolean);
    const record = await upsertGenerationRecord({
      taskId,
      status: "queued",
      source: `${isImageAction ? "image" : "video"}-tool-${action}`,
      kind: `${isImageAction ? "image" : "video"}-tool-${action}`,
      provider: isImageAction ? "wan27-image-edit" : "video-tool",
      upstreamSource: "video-tool-orchestrator",
      model: pricing.model,
      userId: auth.user.id,
      userAssetId: primaryAsset.id,
      userAssetIds: assetIds,
      imageUrl: primaryAsset.localUrl || primaryAsset.publicUrl || "",
      sourceImageUrl: primaryAsset.localUrl || primaryAsset.publicUrl || "",
      mediaAssets: isImageFaceSwap
        ? [
            { type: "target_image", userAssetId: targetImageAsset.id, localUrl: targetImageAsset.localUrl || "" },
            { type: "reference_image", userAssetId: imageAsset.id, localUrl: imageAsset.localUrl || "" },
          ]
        : [
            { type: "reference_image", userAssetId: imageAsset.id, localUrl: imageAsset.localUrl || "" },
            ...(videoAsset ? [{ type: "video", userAssetId: videoAsset.id, localUrl: videoAsset.localUrl || "" }] : []),
          ],
      prompt: taskPrompt,
      finalPrompt: taskPrompt,
      params: {
        toolAction: action,
        stage: "queued",
        durationSeconds: pricing.durationSeconds,
        segmentCount: pricing.segmentCount,
        completedSegments: 0,
      },
      ratio: isImageAction ? closestWan27ImageRatioForAsset(primaryAsset) : "source",
      resolution: isImageAction ? "2K" : "720p",
      duration: isImageAction ? "" : pricing.durationSeconds,
      preDeductedCredits: cost,
      originalPreDeductedCredits: pricing.originalCredits,
      finalCredits: null,
      originalFinalCredits: null,
      userPricingMultiplier: pricing.components?.[0]?.userPricingMultiplier ?? 1,
      billingStatus: cost > 0 ? "pre_deducted" : "free",
      billingSettledAt: "",
      pricingEstimate: pricing,
      awaitingUpstreamTask: false,
      error: "",
      apiTokenId: auth.tokenRecord?.id || "",
      apiTokenName: auth.tokenRecord?.name || "",
      apiTokenType: auth.tokenRecord?.quotaType || "",
      apiTokenSource: auth.tokenSource || "",
    });
    startVideoToolJob({
      taskId,
      action,
      userId: auth.user.id,
      imageAssetId: imageAsset.id,
      targetImageAssetId: targetImageAsset?.id || "",
      videoAssetId: videoAsset?.id || "",
      pricing,
      prompt: taskPrompt,
    });
    return sendJson(res, 202, {
      ok: true,
      async: true,
      taskId,
      pricing: publicVideoToolPricing(pricing),
      record: publicGenerationRecord(record, generationRecordResponseOptionsForAuth(auth)),
      user: userView(auth.user),
    });
  } catch (error) {
    return sendJson(res, error.statusCode || 500, { ok: false, message: error.message || "Video tool submission failed." });
  }
}

const UNDRESS_TOOL_TENANT_ID = "tool-undress-14vips";
const UNDRESS_TOOL_EXAMPLES = Object.freeze({
  image: Object.freeze({
    taskId: "image-20260819115156-587c60",
    inputType: "image",
    resultType: "image",
  }),
  image_video: Object.freeze({
    taskId: "cgt-20260728161747-915edb",
    inputType: "image",
    resultType: "video",
  }),
  video: Object.freeze({
    taskId: "video-20260806194724-f15971",
    inputType: "video",
    resultType: "video",
  }),
});

function undressToolRequestAllowed(req) {
  const tenant = requestTenantDescriptor(req);
  return tenant.toolId === "undress" && tenant.tenantId === UNDRESS_TOOL_TENANT_ID;
}

function undressToolGenerationRecordPathAllowed(method = "GET", pathname = "") {
  const pathValue = String(pathname || "");
  if (["GET", "HEAD"].includes(String(method || "GET").toUpperCase())) return true;
  return String(method || "").toUpperCase() === "DELETE" && /^\/api\/generation-records\/[^/]+$/.test(pathValue);
}

function undressToolApiPathAllowed(method = "GET", pathname = "") {
  const pathValue = String(pathname || "");
  return pathValue === "/api/health"
    || pathValue === "/api/config/public"
    || pathValue.startsWith("/api/auth/")
    || pathValue === "/api/google/login"
    || pathValue.startsWith("/api/billing/")
    || pathValue.startsWith("/api/pay/")
    || pathValue === "/api/referral"
    || pathValue.startsWith("/api/referral/")
    || pathValue === "/api/telegram/webapp-auth"
    || pathValue === "/api/telegram/login/options"
    || pathValue === "/api/telegram/login"
    || pathValue.startsWith("/api/telegram/webhook")
    || (pathValue.startsWith("/api/generation-records") && undressToolGenerationRecordPathAllowed(method, pathValue))
    || pathValue.startsWith("/api/undress-tool/")
    || pathValue === "/api/analytics/web-vitals";
}

function undressToolFreeImageClaimId(userId = "") {
  const digest = crypto.createHash("sha256")
    .update(`${UNDRESS_TOOL_TENANT_ID}:${String(userId || "").trim()}:first-image`)
    .digest("hex")
    .slice(0, 32);
  return `tool-free-${digest}`;
}

async function undressToolFreeImageAvailable(userId = "") {
  if (!dbEnabled()) return false;
  if (await hasUserRechargeInDb(userId)) return false;
  const id = undressToolFreeImageClaimId(userId);
  return !(await getToolFreeGenerationClaimInDb({ id, userId }));
}

async function claimUndressToolFreeImage({ userId = "", tenantId = "", taskId = "" } = {}) {
  if (await hasUserRechargeInDb(userId)) return null;
  const id = undressToolFreeImageClaimId(userId);
  const existing = await getToolFreeGenerationClaimInDb({ id, userId });
  if (existing && String(existing.status || "") === "claimed") {
    const existingTaskId = String(existing.taskId || "").trim();
    const existingRecord = existingTaskId ? await getGenerationRecord(existingTaskId) : null;
    const createdAt = Date.parse(existing.createdAt || "");
    const abandoned = !existingRecord && Number.isFinite(createdAt) && Date.now() - createdAt > 10 * 60 * 1000;
    if (abandoned || (existingRecord && isFailedStatus(existingRecord.status))) {
      await releaseToolFreeGenerationClaimInDb({ id, userId, taskId: existingTaskId });
    }
  }
  return claimToolFreeGenerationInDb({
    id,
    userId,
    tenantId,
    taskId,
    kind: "undress-image",
  });
}

function undressToolGenerationDefinition(value = "", promptConfig = DEFAULT_UNDRESS_PROMPTS) {
  const generationType = String(value || "").trim().toLowerCase().replace(/-/g, "_");
  const prompts = normalizeUndressPrompts(promptConfig);
  const definitions = {
    image: {
      generationType: "image",
      mediaKind: "image",
      action: "undress",
      source: "undress-tool-image",
      kind: "image-tool-undress",
      provider: "wan27-image-edit",
      prompt: prompts.image,
    },
    image_video: {
      generationType: "image_video",
      mediaKind: "image",
      action: "undress-image-video",
      source: "undress-tool-image-video",
      kind: "video-tool-undress-image-video",
      provider: "wan27",
      prompt: prompts.imageVideo,
    },
    video: {
      generationType: "video",
      mediaKind: "video",
      action: "undress-video",
      source: "undress-tool-video",
      kind: "video-tool-undress-video",
      provider: "video-tool",
      prompt: prompts.video,
    },
  };
  return definitions[generationType] || null;
}

function undressToolExampleLocalPath(record = {}, definition = {}, side = "input") {
  const mediaAssets = Array.isArray(record.mediaAssets) ? record.mediaAssets : [];
  const candidates = side === "result"
    ? (definition.resultType === "video"
      ? [record.localVideoPath, record.localVideoUrl, record.videoUrl]
      : [record.localImagePath, record.localImageUrl, record.imageResultUrl])
    : [
      ...mediaAssets.map((asset) => asset?.localUrl),
      record.sourceImageUrl,
      record.imageUrl,
    ];
  for (const candidate of candidates) {
    const value = String(candidate || "").trim();
    if (!value) continue;
    if (value.startsWith("/assets/")) {
      const filePath = safeAssetPathFromUrl(value);
      if (filePath) return filePath;
      continue;
    }
    if (path.isAbsolute(value)) {
      const filePath = safePathWithin(ASSETS_ROOT, value);
      if (filePath) return filePath;
      continue;
    }
    if (isPublicHttpUrl(value)) {
      try {
        const filePath = safeAssetPathFromUrl(new URL(value).pathname);
        if (filePath) return filePath;
      } catch {}
    }
  }
  return "";
}

function undressToolExampleAsset(record = {}) {
  const assetIds = [
    record.userAssetId,
    ...(Array.isArray(record.userAssetIds) ? record.userAssetIds : []),
    ...(Array.isArray(record.mediaAssets) ? record.mediaAssets.map((asset) => asset?.userAssetId) : []),
  ].map((id) => String(id || "").trim()).filter(Boolean);
  return assetIds.length
    ? (record.__userAssets || []).find((asset) => assetIds.includes(String(asset?.id || ""))) || null
    : null;
}

function undressToolExampleAssetId(record = {}) {
  return [
    record.userAssetId,
    ...(Array.isArray(record.userAssetIds) ? record.userAssetIds : []),
    ...(Array.isArray(record.mediaAssets) ? record.mediaAssets.map((asset) => asset?.userAssetId) : []),
  ].map((id) => String(id || "").trim()).find(Boolean) || "";
}

function undressToolExampleRemoteUrl(record = {}, definition = {}, side = "input") {
  if (side === "result") {
    const candidates = definition.resultType === "video"
      ? [record.cdnVideoUrl, record.videoUrl, record.remoteVideoUrl]
      : [record.cdnImageUrl, record.imageResultUrl, record.remoteImageUrl];
    return candidates.map((value) => String(value || "").trim()).find(isPublicHttpUrl) || "";
  }
  const asset = undressToolExampleAsset(record);
  const candidates = [
    asset?.cdnUrl,
    asset?.publicUrl,
    asset?.objectStorageUrl,
    asset?.r2Url,
    record.sourceImageUrl,
    record.imageUrl,
  ];
  return candidates.map((value) => String(value || "").trim()).find(isPublicHttpUrl) || "";
}

function undressToolExampleExtension(mediaType = "image", mime = "", source = "") {
  return mediaType === "video"
    ? videoExtFromMime(mime, source)
    : imageExtFromMime(mime || imageMimeFromKnownPath(source) || "image/jpeg");
}

async function optimizeUndressToolExampleImage(sourcePath = "", targetPath = "") {
  await execFileQuiet("ffmpeg", [
    "-y",
    "-i",
    sourcePath,
    "-vf",
    "scale=w='min(960,iw)':h='min(960,ih)':force_original_aspect_ratio=decrease:flags=lanczos",
    "-frames:v",
    "1",
    "-an",
    "-c:v",
    "libwebp",
    "-quality",
    "82",
    "-compression_level",
    "4",
    targetPath,
  ], { timeout: 120000 });
}

async function ensureUndressToolExampleFile(record = {}, definition = {}, generationType = "", side = "input") {
  const mediaType = side === "input" ? definition.inputType : definition.resultType;
  const existing = undressToolExampleLocalPath(record, definition, side);
  let existingStat = null;
  if (existing) existingStat = await fs.stat(existing).catch(() => null);
  const existingMime = existingStat
    ? (mediaType === "video" ? videoMimeFromKnownPath(existing) : imageMimeFromKnownPath(existing))
    : "";
  const remoteUrl = undressToolExampleRemoteUrl(record, definition, side);
  const sourceHint = existing || remoteUrl;
  const fallbackMime = mediaType === "video" ? "video/mp4" : "image/jpeg";
  const extension = undressToolExampleExtension(mediaType, existingMime, sourceHint);
  const cacheKey = storagePathSegment(record.taskId || generationType, generationType);
  const optimizedTargetPath = path.join(UNDRESS_TOOL_EXAMPLE_DIR, `${cacheKey}-${side}${mediaType === "image" ? ".webp" : extension}`);
  const fallbackTargetPath = path.join(UNDRESS_TOOL_EXAMPLE_DIR, `${cacheKey}-${side}${extension}`);
  const optimizedTargetStat = await fs.stat(optimizedTargetPath).catch(() => null);
  if (optimizedTargetStat?.isFile() && optimizedTargetStat.size > 0) {
    return { filePath: optimizedTargetPath, mime: mediaType === "image" ? "image/webp" : (existingMime || videoMimeFromPath(optimizedTargetPath)) };
  }

  await fs.mkdir(UNDRESS_TOOL_EXAMPLE_DIR, { recursive: true });
  const temporaryPath = `${optimizedTargetPath}.${process.pid}.${Date.now()}.tmp${mediaType === "image" ? ".webp" : ""}`;
  let downloadedSourcePath = "";
  try {
    let mime = existingMime || fallbackMime;
    const sourcePath = existingStat?.isFile() && existingStat.size > 0 ? existing : "";
    if (sourcePath) {
      if (mediaType === "image") {
        try {
          await optimizeUndressToolExampleImage(sourcePath, temporaryPath);
          await fs.rename(temporaryPath, optimizedTargetPath);
          return { filePath: optimizedTargetPath, mime: "image/webp" };
        } catch (error) {
          console.warn("[undress-example-image-optimize-failed]", error.message || error);
          await fs.copyFile(sourcePath, fallbackTargetPath);
          return { filePath: fallbackTargetPath, mime: mime || imageMimeFromPath(fallbackTargetPath) };
        }
      }
      await fs.copyFile(sourcePath, temporaryPath);
    } else {
      if (!remoteUrl) return null;
      const downloaded = await downloadRemoteFileToBuffer(remoteUrl, {
        label: `Undress ${generationType} ${side} example`,
        maxBytes: mediaType === "video" ? 300 * 1024 * 1024 : 25 * 1024 * 1024,
        timeoutMs: 2 * 60 * 1000,
        retryCount: 2,
      });
      mime = downloaded.mime || fallbackMime;
      downloadedSourcePath = `${optimizedTargetPath}.${process.pid}.${Date.now()}.source${extension}`;
      await fs.writeFile(downloadedSourcePath, downloaded.bytes);
      if (mediaType === "image") {
        try {
          await optimizeUndressToolExampleImage(downloadedSourcePath, temporaryPath);
          await fs.rename(temporaryPath, optimizedTargetPath);
          return { filePath: optimizedTargetPath, mime: "image/webp" };
        } catch (error) {
          console.warn("[undress-example-image-optimize-failed]", error.message || error);
          await fs.copyFile(downloadedSourcePath, fallbackTargetPath);
          return { filePath: fallbackTargetPath, mime: mime || imageMimeFromPath(fallbackTargetPath) };
        }
      }
      await fs.copyFile(downloadedSourcePath, temporaryPath);
    }
    await fs.rename(temporaryPath, optimizedTargetPath);
    return { filePath: optimizedTargetPath, mime };
  } finally {
    await fs.rm(temporaryPath, { force: true }).catch(() => {});
    if (downloadedSourcePath) await fs.rm(downloadedSourcePath, { force: true }).catch(() => {});
  }
}

