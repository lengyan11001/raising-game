async function runMyCharacterImageGenerationJob(job = {}) {
  let auth = await backgroundAuthForMyCharacterJob(job.auth || {});
  if (!auth.user) {
    throw new Error("Character image job user not found.");
  }
  let record = (auth.db.userCharacters || []).find((entry) => entry.id === job.characterId && entry.userId === auth.user.id && !isSoftDeleted(entry)) || job.record;
  if (!record?.id) {
    throw new Error("Character image job record not found.");
  }
  const config = job.config || await readAppConfig();
  const model = job.model || config.characterImage?.textModel || "";
  const params = job.params || {};
  const userPrompt = String(job.userPrompt || record.prompt || "").trim();
  const sourceImageUrl = String(job.sourceImageUrl || record.sourceImagePublicUrl || "").trim();
  record.awaitingImageSubmit = true;
  record.status = "image_generating";
  record.imageStatus = record.imageStatus || "submitting";
  record.updatedAt = new Date().toISOString();
  await saveUserCharacterForAuth(auth, record);

  try {
    if (USE_GATEWAY_UPSTREAM) {
      const submitted = await gatewayRequest("POST", "/api/my/characters/generate-image", {
        prompt: userPrompt,
        name: record.name,
        title: record.title,
        creator: record.creator,
        sourceImageUrl,
      });
      auth = await backgroundAuthForMyCharacterJob(auth);
      record = (auth.db.userCharacters || []).find((entry) => entry.id === job.characterId && entry.userId === auth.user.id && !isSoftDeleted(entry)) || record;
      const imageUrls = characterImageUrlsFromPayload(submitted);
      const taskId = apizTaskIdFromResponse(submitted) || String(submitted.character?.imageTaskId || submitted.record?.upstreamTaskId || submitted.record?.taskId || "").trim();
      const gatewayRecordTaskId = String(submitted.record?.taskId || submitted.data?.record?.taskId || "").trim();
      if (!taskId && !imageUrls[0]) {
        const error = new Error(`Character image task did not return task id: ${JSON.stringify(submitted)}`);
        error.statusCode = 502;
        throw error;
      }
      record.imageTaskId = taskId || record.imageTaskId || record.imageGenerationRecordTaskId || "";
      record.imageStatus = String(submitted.character?.imageStatus || submitted.task?.status || apizTaskStatus(submitted));
      record.gatewayCharacterId = String(submitted.character?.id || "");
      record.imageTaskResponse = submitted;
      record.awaitingImageSubmit = false;
      if (imageUrls[0] && (isCompletedStatus(record.imageStatus) || !isFailedStatus(record.imageStatus))) {
        const local = await downloadGeneratedCharacterSheet(record.imageTaskId, imageUrls[0]);
        record.imageStatus = "succeeded";
        record.posterUrl = local.localUrl;
        record.localImageUrl = local.localUrl;
        record.sourceImageUrl = local.localUrl;
        record.publicImageUrl = local.cdnImageUrl || record.publicImageUrl || "";
        record.cdnImageUrl = local.cdnImageUrl || record.cdnImageUrl || "";
        record.objectStorageKey = local.objectStorageKey || record.objectStorageKey || "";
        record.objectStorageError = local.cdnError || record.objectStorageError || "";
        record.imageRemoteUrl = imageUrls[0];
        record.status = "image_ready";
        record.error = "";
      } else if (isFailedStatus(record.imageStatus)) {
        record.status = "image_failed";
        record.error = String(submitted.character?.error || submitted.task?.error || submitted.task?.message || submitted.message || "Character image generation failed.");
      } else {
        record.status = "image_generating";
        record.error = "";
      }
      record.updatedAt = new Date().toISOString();
      await saveUserCharacterForAuth(auth, record);
      const billingUpdates = record.status === "image_ready"
        ? await myCharacterImageSettleUpdates(record)
        : record.status === "image_failed"
          ? await myCharacterImageRefundUpdates(auth, record, "my-character-image-submit", record.error || "")
          : {};
      await updateMyCharacterImageGenerationRecord(auth, record, {
        upstreamTaskId: gatewayRecordTaskId || taskId || "",
        status: myCharacterImageGenerationStatus(record, record.imageStatus),
        model: submitted.record?.model || model,
        params,
        awaitingUpstreamTask: !(record.status === "image_ready" || record.status === "image_failed"),
        createResponse: submitted,
        remoteImageUrl: record.imageRemoteUrl || imageUrls[0] || "",
        imageResultUrl: record.publicImageUrl || record.cdnImageUrl || record.localImageUrl || record.posterUrl || "",
        localImageUrl: record.localImageUrl || "",
        cdnImageUrl: record.cdnImageUrl || record.publicImageUrl || "",
        error: record.error || "",
        ...billingUpdates,
      }, "my-character-image-submit");
      return;
    }

    const generated = await createSeedream5ImageDirect({
      prompt: userPrompt,
      imageUrls: sourceImageUrl ? [sourceImageUrl] : [],
      resolution: process.env.CHARACTER_SEEDREAM_SIZE || "2K",
      model: process.env.CHARACTER_SEEDREAM_MODEL || (/^ep-/i.test(String(model || "")) ? model : ""),
      tier: process.env.CHARACTER_SEEDREAM_TIER || "pro",
    });
    auth = await backgroundAuthForMyCharacterJob(auth);
    record = (auth.db.userCharacters || []).find((entry) => entry.id === job.characterId && entry.userId === auth.user.id && !isSoftDeleted(entry)) || record;
    const taskId = String(generated.raw?.id || generated.raw?.task_id || generated.raw?.taskId || randomId("img"));
    record.imageTaskId = taskId;
    record.imageRemoteUrl = generated.imageUrl;
    record.imageTaskResponse = { ...generated.raw, payload: generated.payload };
    record.imageStatus = "submitted";
    record.awaitingImageSubmit = false;
    record.updatedAt = new Date().toISOString();
    await saveUserCharacterForAuth(auth, record);
    await updateMyCharacterImageGenerationRecord(auth, record, {
      upstreamTaskId: taskId,
      status: "submitted",
      model: generated.payload.model || model,
      params,
      upstreamPayload: generated.payload,
      createResponse: generated.raw,
      remoteImageUrl: generated.imageUrl,
      awaitingUpstreamTask: false,
    }, "my-character-image-submit");
    const local = await downloadGeneratedCharacterSheet(taskId, generated.imageUrl);
    record.imageStatus = "succeeded";
    record.posterUrl = local.localUrl;
    record.localImageUrl = local.localUrl;
    record.sourceImageUrl = local.localUrl;
    record.publicImageUrl = local.cdnImageUrl || record.publicImageUrl || "";
    record.cdnImageUrl = local.cdnImageUrl || record.cdnImageUrl || "";
    record.objectStorageKey = local.objectStorageKey || record.objectStorageKey || "";
    record.objectStorageError = local.cdnError || record.objectStorageError || "";
    record.imageRemoteUrl = generated.imageUrl;
    record.imageTaskResponse = { ...generated.raw, payload: generated.payload };
    record.status = "image_ready";
    record.error = "";
    record.updatedAt = new Date().toISOString();
    await saveUserCharacterForAuth(auth, record);
    const billingUpdates = await myCharacterImageSettleUpdates(record);
    await updateMyCharacterImageGenerationRecord(auth, record, {
      upstreamTaskId: taskId,
      status: "succeeded",
      model: generated.payload.model || model,
      params,
      upstreamPayload: generated.payload,
      createResponse: generated.raw,
      remoteImageUrl: generated.imageUrl,
      imageResultUrl: local.cdnImageUrl || local.localUrl || generated.imageUrl,
      localImageUrl: local.localUrl,
      cdnImageUrl: local.cdnImageUrl || "",
      cdnError: local.cdnError || "",
      awaitingUpstreamTask: false,
      error: "",
      ...billingUpdates,
    }, "my-character-image-succeeded");
  } catch (error) {
    await failMyCharacterImageGeneration(auth, record, error, "my-character-image-failed");
  }
}

async function ensureCharacterReferenceForRecord(record) {
  if (record.referenceAssetUri) {
    const reusableGatewayReference = USE_GATEWAY_UPSTREAM
      && (String(record.referenceAssetUri).startsWith("asset://") || publicUrlMatchesStorageBase(record.referenceAssetUri, R2.publicDomain));
    const reusableDirectReference = !USE_GATEWAY_UPSTREAM
      && (!localPublicAssetStorageEnabled() || isLocalPublicAssetUrl(record.publicImageUrl));
    if (reusableGatewayReference || reusableDirectReference) return record;
  }
  const sourceUrl = record.sourceImageUrl || record.localImageUrl || record.posterUrl;
  if (!sourceUrl || /^https?:\/\//i.test(sourceUrl)) {
    const error = new Error("Character image must be uploaded locally first before creating the upstream asset.");
    error.statusCode = 400;
    throw error;
  }

  if (USE_GATEWAY_UPSTREAM) {
    const publicUrl = sourceUrl.startsWith("/")
      ? await publishLocalAssetUrlToObjectStorage(sourceUrl)
      : publicHttpUrlForUpstream(record.publicImageUrl || sourceUrl);
    if (!isPublicHttpUrl(publicUrl)) {
      const error = new Error("Character reference could not be published to R2.");
      error.statusCode = 502;
      throw error;
    }
    record.publicImageUrl = publicUrl;
    record.referenceAssetUri = publicUrl;
    record.status = record.status === "draft" || record.status === "image_uploaded" ? "reference_ready" : record.status;
    record.updatedAt = new Date().toISOString();
    return record;
  }

  if (!record.syntheticReferenceLocalUrl) {
    // The original upload may already have been removed by the 24h local media
    // retention job. Resolve it through the shared helper so a purged local file
    // is restored from the asset's R2/CDN mirror instead of throwing a raw ENOENT.
    const sourcePath = await ensureLocalAssetUrlFile(sourceUrl, {
      label: "Character source image",
      maxBytes: IMAGE_UPLOAD_MAX_BYTES,
    });
    if (!sourcePath) throw missingUserAssetFileError(record, "Character source image");
    const sourceBytes = await fs.readFile(sourcePath);
    const localSourcePublicUrl = publicUrlForAssetPath(sourceUrl);
    let uploaded = { publicUrl: localSourcePublicUrl, key: "" };
    if (objectStorageEnabled()) {
      uploaded = await uploadBufferToR2({
        userId: record.userId || "user",
        assetId: `${record.id}-source`,
        bytes: sourceBytes,
        mime: record.sourceImageMime || record.imageMime || imageMimeFromPath(sourcePath),
      });
    }
    const refPrompt = record.preserveSourceComposition === true
      ? makeSeedancePreprocessedReferencePrompt(record)
      : makeHomeSyntheticReferencePrompt(record);
    const model = process.env.HOME_REFERENCE_MODEL || process.env.OFFICIAL_PRESET_MODEL || "";
    const generated = await createSeedream5ImageDirect({
      prompt: refPrompt,
      imageUrls: [uploaded.publicUrl],
      resolution: process.env.HOME_REFERENCE_SEEDREAM_SIZE || process.env.CHARACTER_SEEDREAM_SIZE || "2K",
      model,
      tier: process.env.HOME_REFERENCE_SEEDREAM_TIER || process.env.CHARACTER_SEEDREAM_TIER || "pro",
    });
    const taskId = String(generated.raw?.id || generated.raw?.task_id || generated.raw?.taskId || randomId("ref"));
    const imageUrl = generated.imageUrl;

    const fileName = `ref-${String(record.id).replace(/[^a-z0-9_-]/gi, "-")}-${Date.now()}.png`;
    const localPath = path.join(USER_CHARACTER_DIR, record.userId || "user", fileName);
    await fs.mkdir(path.dirname(localPath), { recursive: true });
    const downloaded = await downloadRemoteFileToBuffer(imageUrl, { label: "character synthetic reference", maxBytes: 30 * 1024 * 1024, timeoutMs: 180000 });
    await fs.writeFile(localPath, downloaded.bytes);

    record.syntheticReferenceLocalUrl = `/assets/user-characters/${record.userId || "user"}/${fileName}`;
    record.syntheticReferenceUrl = imageUrl;
    record.syntheticReferenceTaskId = taskId;
    record.syntheticReferenceModel = generated.payload.model;
    record.syntheticReferencePrompt = refPrompt;
    record.syntheticReferenceCreateResponse = generated.raw;
    record.syntheticReferencePayload = generated.payload;
    record.posterUrl = record.syntheticReferenceLocalUrl;
    record.localImageUrl = record.syntheticReferenceLocalUrl;
    record.imageMime = String(downloaded.mime || "").startsWith("image/") ? downloaded.mime : "image/png";
    record.sourcePublicUrl = uploaded.publicUrl;
    record.sourceR2Key = uploaded.key;
    record.status = "reference_ready";
    record.updatedAt = new Date().toISOString();
  }

  const localUrl = record.syntheticReferenceLocalUrl || record.localImageUrl || record.posterUrl;
  const localPath = path.join(ROOT, localUrl.replace(/^\//, ""));
  const refBytes = await fs.readFile(localPath);
  validateSeedanceImageBytes(refBytes, "Seedance character reference image");
  const localRefPublicUrl = publicUrlForAssetPath(localUrl);
  let uploadedRef = { publicUrl: localRefPublicUrl, key: "" };
  if (objectStorageEnabled()) {
    uploadedRef = await uploadBufferToR2({
      userId: record.userId || "user",
      assetId: `${record.id}-ref`,
      bytes: refBytes,
      mime: record.imageMime || imageMimeFromPath(localPath),
    });
  }
  const created = await arkOpenApiAction("CreateAsset", {
    GroupId: ARK_OPENAPI.groupId,
    URL: uploadedRef.publicUrl,
    AssetType: "Image",
    Moderation: { Strategy: "Skip" },
    Name: storageObjectName("user", record.id),
    ProjectName: ARK_OPENAPI.projectName,
  });
  const assetId = extractAssetId(created);
  if (!assetId) {
    const error = new Error(`CreateAsset did not return asset id: ${JSON.stringify(created)}`);
    error.statusCode = 502;
    throw error;
  }

  record.publicImageUrl = uploadedRef.publicUrl;
  record.referenceAssetUri = `asset://${assetId}`;
  record.r2Key = uploadedRef.key;
  record.updatedAt = new Date().toISOString();
  return record;
}

async function userCharacterMainVideoPricing(auth, prepared, config, userPrompt, seedanceBody = {}) {
  const prompt = makeHomeVideoPrompt(prepared, userPrompt, { decorate: true });
  return await seedanceVideoPricingForSubmitArgs(auth, {
    config,
    prompt,
    referenceAssetUri: prepared.referenceAssetUri,
    body: { ...seedanceBody, generateAudio: true },
    slug: `user-character-${prepared.id}`,
  });
}

async function finalizeUserCharacterMainVideoSubmit(auth, prepared, config, cost, userPrompt, seedanceBody = {}, pricing = null) {
  const prompt = makeHomeVideoPrompt(prepared, userPrompt, { decorate: true });
  let finalPricing = pricing;
  if (!finalPricing) {
    finalPricing = (await userCharacterMainVideoPricing(auth, prepared, config, userPrompt, seedanceBody)).pricing;
    cost = finalPricing.credits;
  }
  const { task, payload } = await submitSeedanceVideoTask({
    config,
    prompt,
    referenceAssetUri: prepared.referenceAssetUri,
    body: { ...seedanceBody, generateAudio: true },
    slug: `user-character-${prepared.id}`,
  });

  await chargeUserWithSubtoken(auth, {
    cost,
    type: "user_character_main_video",
    taskId: task.taskId,
    meta: { characterId: prepared.id, duration: payload.duration },
  });
  if (!dbEnabled()) await writeDb(auth.db);

  prepared.taskId = task.taskId;
  prepared.status = task.status;
  prepared.videoUrl = task.videoUrl || "";
  prepared.remoteVideoUrl = task.videoUrl || "";
  prepared.prompt = userPrompt || prompt;
  prepared.userPrompt = userPrompt;
  prepared.finalPrompt = prompt;
  prepared.updatedAt = new Date().toISOString();
  auth.db.userCharacters = auth.db.userCharacters.map((entry) => (entry.id === prepared.id ? { ...entry, ...prepared } : entry));
  if (dbEnabled()) await upsertUserCharacterInDb(prepared);
  else await writeDb(auth.db);

  await upsertAndSettleGenerationRecord({
    taskId: task.taskId,
    status: task.status,
    model: MODEL_QUALITY,
    sceneId: "user-character",
    sceneName: prepared.title || "User custom character",
    companionId: prepared.id,
    companionName: prepared.name,
    userId: auth.user.id,
    referenceAssetUri: prepared.referenceAssetUri,
    prompt: prompt,
    finalPrompt: prompt,
    ratio: payload.ratio,
    resolution: payload.resolution,
    duration: payload.duration,
    quality: "high",
    provider: "seedance",
    upstreamSource: USE_GATEWAY_UPSTREAM ? "gateway" : "direct",
    kind: "main-video",
    params: payload,
    upstreamPayload: payload,
    remoteVideoUrl: task.videoUrl || "",
    localVideoUrl: "",
    error: "",
    source: "user-character",
    preDeductedCredits: cost,
    originalPreDeductedCredits: finalPricing?.originalCredits ?? cost,
    finalCredits: cost,
    originalFinalCredits: finalPricing?.originalCredits ?? cost,
    userPricingMultiplier: finalPricing?.userPricingMultiplier ?? 1,
    billingStatus: cost > 0 ? "settled" : "free",
    billingSettledAt: new Date().toISOString(),
    pricingEstimate: finalPricing || null,
    createResponse: task,
    apiTokenId: auth.tokenRecord?.id || "",
    apiTokenName: auth.tokenRecord?.name || "",
    apiTokenType: auth.tokenRecord?.quotaType || "",
    apiTokenSource: auth.tokenSource || "",
  }, "create");

  return { task, payload };
}

async function handleSaveMyCharacterDraft(req, res) {
  const auth = await requireUser(req, res);
  if (!auth) return;
  const body = await readJson(req);
  const name = String(body.name || "").trim().slice(0, 32);
  if (!name) {
    return sendJson(res, 400, { ok: false, message: "Name is required." });
  }
  const title = String(body.title || "My drama").trim().slice(0, 32) || "My drama";

  let mime = "";
  let bytes = Buffer.alloc(0);
  const dataUrl = String(body.dataUrl || "").trim();
  const sourceImageUrl = String(body.sourceImageUrl || "").trim();
  if (dataUrl) {
    const decoded = decodeDataUrl(dataUrl);
    mime = decoded.mime;
    bytes = decoded.bytes;
    if (bytes.byteLength > IMAGE_UPLOAD_MAX_BYTES) {
      return sendJson(res, 400, { ok: false, message: "Image must be 20MB or smaller." });
    }
  } else if (sourceImageUrl) {
    mime = imageMimeFromKnownPath(sourceImageUrl) || "image/jpeg";
    if (!(mime.startsWith("image/") && sourceImageUrl.startsWith("/assets/"))) {
      return sendJson(res, 400, { ok: false, message: "Draft source image must be a local image asset." });
    }
  } else {
    return sendJson(res, 400, { ok: false, message: "A draft source image is required." });
  }

  const characterId = randomId("mychar");
  let localUrl = sourceImageUrl;
  let objectStorage = { publicUrl: "", key: "", error: "" };
  if (dataUrl) {
    const fileName = `${characterId}-source${imageExtFromMime(mime)}`;
    const dir = path.join(USER_CHARACTER_DIR, auth.user.id);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, fileName), bytes);
    localUrl = `/assets/user-characters/${auth.user.id}/${fileName}`;
    objectStorage = await uploadLocalAssetMirrorToObjectStorage({ localUrl, bytes, mime });
  } else {
    const localPath = path.join(ROOT, localUrl.replace(/^\//, ""));
    bytes = await fs.readFile(localPath).catch(() => null);
    if (!bytes) return sendJson(res, 400, { ok: false, message: "Draft source image could not be read." });
    if (bytes.byteLength > IMAGE_UPLOAD_MAX_BYTES) {
      return sendJson(res, 400, { ok: false, message: "Image must be 20MB or smaller." });
    }
    objectStorage = await uploadLocalAssetMirrorToObjectStorage({ localUrl, bytes, mime });
  }

  const nowIso = new Date().toISOString();
  const record = {
    id: characterId,
    userId: auth.user.id,
    name,
    title,
    posterUrl: localUrl,
    localImageUrl: localUrl,
    sourceImageUrl: localUrl,
    imageMime: mime,
    sourceImageMime: mime,
    publicImageUrl: objectStorage.publicUrl || "",
    cdnImageUrl: objectStorage.publicUrl || "",
    objectStorageKey: objectStorage.key || "",
    objectStorageError: objectStorage.error || "",
    referenceAssetUri: "",
    syntheticReferenceLocalUrl: "",
    syntheticReferenceUrl: "",
    syntheticReferenceTaskId: "",
    videoUrl: "",
    localVideoUrl: "",
    taskId: "",
    status: "draft",
    prompt: typeof body.prompt === "string" ? body.prompt : "",
    creator: body.creator && typeof body.creator === "object" && !Array.isArray(body.creator) ? body.creator : null,
    sceneVideos: {},
    deletedAt: "",
    createdAt: nowIso,
    updatedAt: nowIso,
  };

  auth.db.userCharacters.unshift(record);
  if (dbEnabled()) await upsertUserCharacterInDb(record);
  else await writeDb(auth.db);

  return sendJson(res, 200, { ok: true, character: publicUserCharacter(record) });
}

async function handleGenerateMyCharacterImage(req, res) {
  const auth = await requireUser(req, res);
  if (!auth) return;
  const body = await readJson(req);
  const userPrompt = String(body.prompt || "").trim();
  if (!userPrompt) return sendJson(res, 400, { ok: false, message: "Prompt is required." });
  let sourceImageAsset = null;
  let sourceImageUrl = "";
  if (body.sourceImageDataUrl) {
    try {
      sourceImageAsset = await createUserAssetFromDataUrl(auth.db, auth.user, {
        dataUrl: body.sourceImageDataUrl,
        name: `${String(body.name || "Character").slice(0, 40)} reference`,
        fileName: "character-card-reference.png",
      });
      sourceImageUrl = sourceImageAsset.publicUrl || publicUrlForAssetPath(sourceImageAsset.localUrl);
    } catch (error) {
      return sendJson(res, error.statusCode || 400, { ok: false, code: error.code || "CHARACTER_REFERENCE_INVALID", message: error.message || "Character reference image is invalid." });
    }
  }
  const config = await readAppConfig();
  const nowIso = new Date().toISOString();
  const characterId = randomId("mychar");
  const imageRecordTaskId = localGenerationTaskId("mychar-img");
  const model = config.characterImage.textModel;
  const imagePricingOptions = characterSeedream5ImageOptions(config, model, { referenceImageCount: sourceImageUrl ? 1 : 0 });
  const pricing = myCharacterImagePricing(config, auth, imagePricingOptions);
  const cost = pricing.credits;
  if (auth.user.credits < cost) {
    return sendJson(res, 402, insufficientCreditsPayload(cost, auth.user.credits));
  }
  try {
    assertSubtokenCanSpend(auth, cost);
  } catch (error) {
    return sendJson(res, error.statusCode || 402, error.payload || {
      ok: false,
      code: error.code || "SUBTOKEN_QUOTA_EXCEEDED",
      message: error.message || "Sub token quota is not enough.",
    });
  }
  const record = {
    id: characterId,
    userId: auth.user.id,
    name: String(body.name || "My character").trim().slice(0, 32) || "My character",
    title: String(body.title || "My character").trim().slice(0, 48) || "My character",
    posterUrl: "",
    localImageUrl: "",
    sourceImageUrl: "",
    imageMime: "",
    sourceImageMime: "",
    publicImageUrl: "",
    imageTaskId: "",
    imageGenerationRecordTaskId: imageRecordTaskId,
    imageStatus: "submitted",
    imageRemoteUrl: "",
    upstreamSource: USE_GATEWAY_UPSTREAM ? "gateway" : "direct",
    gatewayCharacterId: "",
    referenceAssetUri: "",
    syntheticReferenceLocalUrl: "",
    syntheticReferenceUrl: "",
    syntheticReferenceTaskId: "",
    videoUrl: "",
    localVideoUrl: "",
    taskId: "",
    status: "image_generating",
    prompt: userPrompt,
    sourceImageAssetId: sourceImageAsset?.id || "",
    sourceImageUrl: sourceImageAsset?.localUrl || "",
    sourceImagePublicUrl: sourceImageAsset?.publicUrl || "",
    creator: body.creator && typeof body.creator === "object" && !Array.isArray(body.creator) ? body.creator : null,
    sceneVideos: {},
    deletedAt: "",
    createdAt: nowIso,
    updatedAt: nowIso,
  };
  await saveUserCharacterForAuth(auth, record);

  const params = {
    prompt: userPrompt,
    image_size: normalizeSeedreamImageSize(config.characterImage.imageSize),
    size: imagePricingOptions.size,
    seedreamTier: imagePricingOptions.seedreamTier,
    num_images: 1,
    max_images: 1,
    enhance_prompt_mode: "standard",
  };
  if (sourceImageUrl) params.image = [sourceImageUrl];
  await updateMyCharacterImageGenerationRecord(auth, record, {
    status: "submitting",
    model,
    params,
    awaitingUpstreamTask: true,
    preDeductedCredits: cost,
    originalPreDeductedCredits: pricing.originalCredits ?? cost,
    finalCredits: null,
    originalFinalCredits: null,
    userPricingMultiplier: pricing.userPricingMultiplier ?? 1,
    billingStatus: cost > 0 ? "pre_deducted" : "free",
    billingSettledAt: "",
    billingError: "",
    pricingEstimate: pricing,
  }, "my-character-image-create");

  if (cost > 0) {
    await chargeUserWithSubtoken(auth, {
      cost,
      type: "my_character_image_generate",
      taskId: imageRecordTaskId,
      meta: {
        taskId: imageRecordTaskId,
        characterId,
        model,
        baseCredits: pricing.baseCredits,
        originalCost: pricing.originalCredits,
        pricingMultiplier: pricing.userPricingMultiplier,
        pricingSource: pricing.source || "byteplus_seedream5_official_image_pricing",
        provider: pricing.provider || "seedream5-image",
        resolution: pricing.resolution || imagePricingOptions.resolution,
        seedreamTier: pricing.seedreamTier || imagePricingOptions.seedreamTier,
      },
    });
    if (!dbEnabled()) await writeDb(auth.db);
  }

  record.imageTaskId = imageRecordTaskId;
  record.imageStatus = "submitting";
  record.awaitingImageSubmit = true;
  record.updatedAt = new Date().toISOString();
  await saveUserCharacterForAuth(auth, record);
  const generationRecord = await updateMyCharacterImageGenerationRecord(auth, record, {
    status: "submitting",
    model,
    params,
    awaitingUpstreamTask: true,
    upstreamTaskId: "",
    error: "",
    preDeductedCredits: cost,
    originalPreDeductedCredits: pricing.originalCredits ?? cost,
    finalCredits: null,
    originalFinalCredits: null,
    userPricingMultiplier: pricing.userPricingMultiplier ?? 1,
    billingStatus: cost > 0 ? "pre_deducted" : "free",
    billingSettledAt: "",
    billingError: "",
    pricingEstimate: pricing,
  }, "my-character-image-queued");

  startMyCharacterImageGenerationJob({
    auth: {
      user: auth.user,
      tokenRecord: auth.tokenRecord || null,
      tokenSource: auth.tokenSource || "",
    },
    characterId,
    record: { ...record },
    userPrompt,
    sourceImageUrl,
    config,
    model,
    params,
  });

  return sendJson(res, 202, {
    ok: true,
    character: publicUserCharacter(record),
    task: { taskId: imageRecordTaskId, status: "submitting", imageUrl: "" },
    taskId: imageRecordTaskId,
    record: publicGenerationRecord(generationRecord || { taskId: imageRecordTaskId }, generationRecordResponseOptionsForAuth(auth)),
    user: userView(auth.user),
    pricing,
    cost,
  });
}

async function handleCreateMyCharacter(req, res) {
  const auth = await requireUser(req, res);
  if (!auth) return;
  const body = await readJson(req);
  const { mime, bytes } = decodeDataUrl(body.dataUrl || "");
  if (bytes.byteLength > IMAGE_UPLOAD_MAX_BYTES) {
    return sendJson(res, 400, { ok: false, message: "Image must be 20MB or smaller." });
  }

  if (!USE_GATEWAY_UPSTREAM && !ARK_API_KEY) {
    return sendJson(res, 503, { ok: false, code: "MISSING_ARK_API_KEY", message: "ARK_API_KEY is missing — character video tasks cannot be submitted." });
  }
  const config = await readAppConfig();

  const characterId = randomId("mychar");
  const fileName = `${characterId}-source${imageExtFromMime(mime)}`;
  const dir = path.join(USER_CHARACTER_DIR, auth.user.id);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, fileName), bytes);
  const localUrl = `/assets/user-characters/${auth.user.id}/${fileName}`;
  const objectStorage = await uploadLocalAssetMirrorToObjectStorage({ localUrl, bytes, mime });

  const nowIso = new Date().toISOString();
  const record = {
    id: characterId,
    userId: auth.user.id,
    name: String(body.name || "My character").trim().slice(0, 32) || "My character",
    title: String(body.title || "My drama").trim().slice(0, 32) || "My drama",
    posterUrl: localUrl,
    localImageUrl: localUrl,
    sourceImageUrl: localUrl,
    imageMime: mime,
    sourceImageMime: mime,
    publicImageUrl: objectStorage.publicUrl || "",
    cdnImageUrl: objectStorage.publicUrl || "",
    objectStorageKey: objectStorage.key || "",
    objectStorageError: objectStorage.error || "",
    referenceAssetUri: "",
    syntheticReferenceLocalUrl: "",
    syntheticReferenceUrl: "",
    syntheticReferenceTaskId: "",
    videoUrl: "",
    localVideoUrl: "",
    taskId: "",
    status: "image_uploaded",
    prompt: typeof body.prompt === "string" ? body.prompt : "",
    sceneVideos: {},
    deletedAt: "",
    createdAt: nowIso,
    updatedAt: nowIso,
  };

  auth.db.userCharacters.unshift(record);
  if (dbEnabled()) await upsertUserCharacterInDb(record);
  else await writeDb(auth.db);

  const userPrompt = typeof body.prompt === "string" ? body.prompt : "";
  const pricing = (await userCharacterMainVideoPricing(auth, {
    ...record,
    referenceAssetUri: record.referenceAssetUri || "asset://pricing-reference",
  }, config, userPrompt, body)).pricing;
  const cost = pricing.credits;
  if (auth.user.credits < cost) {
    return sendJson(res, 402, insufficientCreditsPayload(cost, auth.user.credits));
  }
  try {
    assertSubtokenCanSpend(auth, cost);
  } catch (error) {
    return sendJson(res, error.statusCode || 402, error.payload || { ok: false, code: error.code || "SUBTOKEN_UNAVAILABLE", message: error.message });
  }

  let prepared;
  try {
    prepared = await ensureCharacterReferenceForRecord({ ...record });
  } catch (error) {
    record.status = "reference_failed";
    record.error = error.message || "Failed to create upstream asset.";
    auth.db.userCharacters = auth.db.userCharacters.map((entry) => (entry.id === record.id ? record : entry));
    if (dbEnabled()) await upsertUserCharacterInDb(record);
    else await writeDb(auth.db);
    throw error;
  }

  const { task } = await finalizeUserCharacterMainVideoSubmit(auth, prepared, config, cost, userPrompt, body, pricing);

  return sendJson(res, 200, {
    ok: true,
    character: publicUserCharacter(prepared),
    task: { taskId: task.taskId, status: task.status, videoUrl: task.videoUrl || "" },
    user: userView(auth.user),
    cost,
  });
}

async function handleStartMyCharacterMainVideo(req, res, characterId) {
  const auth = await requireUser(req, res);
  if (!auth) return;
  const body = await readJson(req);
  const record = auth.db.userCharacters.find((entry) => entry.id === characterId && entry.userId === auth.user.id && !isSoftDeleted(entry));
  if (!record) {
    return sendJson(res, 404, { ok: false, message: "Character not found." });
  }
  if (record.taskId) {
    return sendJson(res, 400, { ok: false, message: "Main video task already exists for this character — use refresh to check progress." });
  }
  const existingVideo = String(record.videoUrl || record.localVideoUrl || "").trim();
  if (existingVideo) {
    return sendJson(res, 400, { ok: false, message: "This character already has a main video." });
  }

  const st = String(record.status || "").toLowerCase();
  const canStart = st === "draft" || st === "reference_failed" || st === "image_uploaded";
  if (!canStart) {
    return sendJson(res, 400, { ok: false, message: "This character cannot start main video generation from its current status." });
  }

  if (!USE_GATEWAY_UPSTREAM && !ARK_API_KEY) {
    return sendJson(res, 503, { ok: false, code: "MISSING_ARK_API_KEY", message: "ARK_API_KEY is missing — character video tasks cannot be submitted." });
  }
  const config = await readAppConfig();

  if (st === "reference_failed") {
    record.referenceAssetUri = "";
    record.syntheticReferenceLocalUrl = "";
    record.syntheticReferenceUrl = "";
    record.syntheticReferenceTaskId = "";
    record.publicImageUrl = "";
    record.r2Key = "";
    record.error = "";
    const src = record.sourceImageUrl || record.localImageUrl || record.posterUrl;
    if (src) {
      record.posterUrl = src;
      record.localImageUrl = src;
    }
    record.status = "draft";
    auth.db.userCharacters = auth.db.userCharacters.map((entry) => (entry.id === record.id ? record : entry));
    if (dbEnabled()) await upsertUserCharacterInDb(record);
    else await writeDb(auth.db);
  }

  const userPrompt = typeof body.prompt === "string" ? body.prompt : String(record.prompt || "");
  const pricing = (await userCharacterMainVideoPricing(auth, {
    ...record,
    referenceAssetUri: record.referenceAssetUri || "asset://pricing-reference",
  }, config, userPrompt, body)).pricing;
  const cost = pricing.credits;
  if (auth.user.credits < cost) {
    return sendJson(res, 402, insufficientCreditsPayload(cost, auth.user.credits));
  }
  try {
    assertSubtokenCanSpend(auth, cost);
  } catch (error) {
    return sendJson(res, error.statusCode || 402, error.payload || { ok: false, code: error.code || "SUBTOKEN_UNAVAILABLE", message: error.message });
  }

  let prepared;
  try {
    prepared = await ensureCharacterReferenceForRecord({ ...record });
  } catch (error) {
    record.status = "reference_failed";
    record.error = error.message || "Failed to create upstream asset.";
    auth.db.userCharacters = auth.db.userCharacters.map((entry) => (entry.id === record.id ? record : entry));
    if (dbEnabled()) await upsertUserCharacterInDb(record);
    else await writeDb(auth.db);
    throw error;
  }

  const { task } = await finalizeUserCharacterMainVideoSubmit(auth, prepared, config, cost, userPrompt, body, pricing);

  return sendJson(res, 200, {
    ok: true,
    character: publicUserCharacter(prepared),
    task: { taskId: task.taskId, status: task.status, videoUrl: task.videoUrl || "" },
    user: userView(auth.user),
    cost,
  });
}

async function handleListMyCharacters(req, res) {
  const auth = await requireUser(req, res, { loadDb: false });
  if (!auth) return;
  if (dbEnabled()) {
    const result = await getUserCharactersPageFromDb({ userId: auth.user.id, page: 1, limit: 50 });
    if (result) return sendJson(res, 200, { ok: true, characters: result.characters.map(publicUserCharacter), page: result.page, limit: result.limit, total: result.total, totalPages: result.totalPages });
  }
  const characters = auth.db.userCharacters
    .filter((character) => character.userId === auth.user.id && !isSoftDeleted(character))
    .slice(0, 50)
    .map(publicUserCharacter);
  return sendJson(res, 200, { ok: true, characters });
}

async function handleGetMyCharacter(req, res, characterId) {
  const auth = await requireUser(req, res);
  if (!auth) return;
  const record = auth.db.userCharacters.find((entry) => entry.id === characterId && entry.userId === auth.user.id && !isSoftDeleted(entry));
  if (!record) return sendJson(res, 404, { ok: false, message: "Character not found." });
  return sendJson(res, 200, { ok: true, character: publicUserCharacter(record) });
}

async function handleRefreshMyCharacterImage(req, res, characterId) {
  const auth = await requireUser(req, res);
  if (!auth) return;
  const record = auth.db.userCharacters.find((entry) => entry.id === characterId && entry.userId === auth.user.id && !isSoftDeleted(entry));
  if (!record) return sendJson(res, 404, { ok: false, message: "Character not found." });
  if (!record.imageTaskId) return sendJson(res, 400, { ok: false, message: "This character has no image generation task." });
  try {
    const refreshed = await refreshGeneratedMyCharacterImage(auth, record);
    return sendJson(res, 200, {
      ok: true,
      character: publicUserCharacter(refreshed.record),
      task: refreshed.task,
      imageUrls: refreshed.imageUrls,
    });
  } catch (error) {
    record.status = "image_failed";
    record.error = error.message || "Failed to refresh character image.";
    record.updatedAt = new Date().toISOString();
    await saveUserCharacterForAuth(auth, record);
    return sendJson(res, error.statusCode || 502, {
      ok: false,
      message: record.error,
      character: publicUserCharacter(record),
    });
  }
}

async function handleDeleteMyCharacter(req, res, characterId) {
  const auth = await requireUser(req, res);
  if (!auth) return;
  const record = auth.db.userCharacters.find((entry) => entry.id === characterId && entry.userId === auth.user.id);
  if (!record || isSoftDeleted(record)) {
    return sendJson(res, 404, { ok: false, message: "Character not found." });
  }
  const nowIso = new Date().toISOString();
  record.deletedAt = nowIso;
  record.updatedAt = nowIso;
  auth.db.userCharacters = auth.db.userCharacters.map((entry) => (entry.id === record.id ? record : entry));
  if (dbEnabled()) await upsertUserCharacterInDb(record);
  else await writeDb(auth.db);
  await softDeleteGenerationRecordsByCompanion(record.id, { userId: auth.user.id });
  return sendJson(res, 200, { ok: true, character: publicUserCharacter(record) });
}

async function handleQueryMyCharacterMainVideo(req, res, characterId) {
  const auth = await requireUser(req, res);
  if (!auth) return;
  const record = auth.db.userCharacters.find((entry) => entry.id === characterId && entry.userId === auth.user.id && !isSoftDeleted(entry));
  if (!record) return sendJson(res, 404, { ok: false, message: "Character not found." });
  if (!record.taskId) return sendJson(res, 400, { ok: false, message: "This character has no video task yet." });

  const gatewayTask = USE_GATEWAY_UPSTREAM ? await gatewayQueryTask(record.taskId) : null;
  const raw = gatewayTask ? gatewayTask.raw : await arkRequest("GET", `/contents/generations/tasks/${encodeURIComponent(record.taskId)}`);
  const task = gatewayTask || normalizeTask(raw);
  let localVideoUrl = "";
  let localVideoPath = "";
  let cdnVideoUrl = record.cdnVideoUrl || "";
  let cdnPosterUrl = record.cdnPosterUrl || "";
  let cdnError = record.cdnError || "";
  let downloadError = "";
  if (isSucceededStatus(task.status) && task.videoUrl) {
    try {
      const localVideo = await downloadGeneratedVideo(record.taskId, task.videoUrl);
      localVideoUrl = localVideo.localVideoUrl;
      localVideoPath = localVideo.localVideoPath;
      cdnVideoUrl = localVideo.cdnVideoUrl || cdnVideoUrl;
      cdnPosterUrl = localVideo.cdnPosterUrl || cdnPosterUrl;
      cdnError = localVideo.cdnError || cdnError;
    } catch (error) {
      downloadError = error.message || "Failed to download character video.";
    }
  }

  record.status = task.status;
  record.videoUrl = DISABLE_GENERATED_R2_STORAGE
    ? (task.videoUrl || record.remoteVideoUrl || record.videoUrl || localVideoUrl || cdnVideoUrl || "")
    : localPublicAssetStorageEnabled()
      ? (localVideoUrl || cdnVideoUrl || task.videoUrl || record.videoUrl || "")
      : (cdnVideoUrl || localVideoUrl || task.videoUrl || record.videoUrl || "");
  record.localVideoUrl = localVideoUrl || record.localVideoUrl || "";
  record.localVideoPath = localVideoPath || record.localVideoPath || "";
  record.remoteVideoUrl = task.videoUrl || record.remoteVideoUrl || "";
  record.cdnVideoUrl = cdnVideoUrl || "";
  record.cdnPosterUrl = cdnPosterUrl || "";
  record.cdnError = cdnError || "";
  record.error = task.error || downloadError || "";
  record.updatedAt = new Date().toISOString();
  auth.db.userCharacters = auth.db.userCharacters.map((entry) => (entry.id === record.id ? record : entry));
  if (dbEnabled()) await upsertUserCharacterInDb(record);
  else await writeDb(auth.db);

  await upsertAndSettleGenerationRecord({
    taskId: record.taskId,
    status: record.status,
    remoteVideoUrl: task.videoUrl || "",
    localVideoUrl,
    localVideoPath,
    cdnVideoUrl,
    cdnPosterUrl,
    cdnError,
    error: task.error || downloadError || "",
    queryResponse: raw,
  }, "character-main-query");

  return sendJson(res, 200, { ok: true, character: publicUserCharacter(record), task: { ...task, videoUrl: record.videoUrl } });
}

async function handleCreateMyCharacterSceneVideo(req, res, characterId) {
  const auth = await requireUser(req, res);
  if (!auth) return;
  const body = await readJson(req);
  const sceneId = String(body.sceneId || "").trim();
  if (!sceneId) return sendJson(res, 400, { ok: false, message: "Missing sceneId." });

  const record = auth.db.userCharacters.find((entry) => entry.id === characterId && entry.userId === auth.user.id && !isSoftDeleted(entry));
  if (!record) return sendJson(res, 404, { ok: false, message: "Character not found." });
  if (!record.referenceAssetUri) {
    return sendJson(res, 400, { ok: false, message: "This character isn't ready yet. Wait for the main video task to finish or recreate the character." });
  }
  if (!USE_GATEWAY_UPSTREAM && !ARK_API_KEY) {
    return sendJson(res, 503, { ok: false, code: "MISSING_ARK_API_KEY", message: "ARK_API_KEY is missing — scene video tasks cannot be submitted." });
  }

  const config = await readAppConfig();
  const sceneConfig = findSceneConfig(config, sceneId);
  if (!sceneConfig || sceneConfig.id !== sceneId) {
    return sendJson(res, 404, { ok: false, message: "Scene not found." });
  }
  const sceneEntry = findSceneEntryConfig(sceneConfig, body.sceneEntryId);
  const sceneVideoKey = makeSceneVideoKey(sceneConfig.id, sceneEntry.id);

  const userPrompt = typeof body.prompt === "string" ? body.prompt : "";
  const prompt = makeSceneVideoPrompt(sceneConfig, userPrompt);
  const pricing = (await seedanceVideoPricingForSubmitArgs(auth, {
    config,
    prompt,
    referenceAssetUri: record.referenceAssetUri,
    body: { ...body, generateAudio: true },
    slug: `user-scene-${characterId}-${sceneVideoKey}`,
  })).pricing;
  const cost = pricing.credits;
  if (auth.user.credits < cost) {
    return sendJson(res, 402, insufficientCreditsPayload(cost, auth.user.credits));
  }
  try {
    assertSubtokenCanSpend(auth, cost);
  } catch (error) {
    return sendJson(res, error.statusCode || 402, error.payload || { ok: false, code: error.code || "SUBTOKEN_UNAVAILABLE", message: error.message });
  }

  let task;
  let payload;
  try {
    const result = await submitSeedanceVideoTask({
      config,
      prompt,
      referenceAssetUri: record.referenceAssetUri,
      body: { ...body, generateAudio: true },
      slug: `user-scene-${characterId}-${sceneVideoKey}`,
    });
    task = result.task;
    payload = result.payload;
  } catch (error) {
    throw error;
  }

  await chargeUserWithSubtoken(auth, {
    cost,
    type: "user_character_scene_video",
    taskId: task.taskId,
    meta: {
      characterId,
      sceneId: sceneConfig.id,
      sceneEntryId: sceneEntry.id,
      duration: payload.duration,
      resolution: payload.resolution,
      provider: pricing.provider || "seedance",
      originalCost: pricing.originalCredits,
      pricingMultiplier: pricing.userPricingMultiplier,
      pricingSource: pricing.source || "public_duration_rate",
    },
  });

  const nowIso = new Date().toISOString();
  const sceneVideos = { ...(record.sceneVideos || {}) };
  sceneVideos[sceneVideoKey] = {
    sceneId: sceneConfig.id,
    sceneName: sceneConfig.name,
    sceneEntryId: sceneEntry.id,
    sceneEntryName: sceneEntry.name,
    posterUrl: record.posterUrl || record.localImageUrl || "",
    prompt: prompt,
    userPrompt,
    finalPrompt: prompt,
    referenceAssetUri: record.referenceAssetUri || "",
    model: MODEL_QUALITY,
    ratio: payload.ratio,
    resolution: payload.resolution,
    duration: payload.duration,
    provider: "seedance",
    taskId: task.taskId,
    status: task.status,
    videoUrl: "",
    localVideoUrl: "",
    remoteVideoUrl: task.videoUrl || "",
    createdAt: sceneVideos[sceneVideoKey]?.createdAt || nowIso,
    updatedAt: nowIso,
    error: "",
  };
  record.sceneVideos = sceneVideos;
  record.updatedAt = nowIso;

  auth.db.userCharacters = auth.db.userCharacters.map((entry) => (entry.id === record.id ? record : entry));
  if (dbEnabled()) await upsertUserCharacterInDb(record);
  else await writeDb(auth.db);

  await upsertAndSettleGenerationRecord({
    taskId: task.taskId,
    status: task.status,
    model: MODEL_QUALITY,
    sceneId: sceneConfig.id,
    sceneName: sceneConfig.name,
    sceneEntryId: sceneEntry.id,
    sceneEntryName: sceneEntry.name,
    companionId: record.id,
    companionName: record.name,
    userId: auth.user.id,
    referenceAssetUri: record.referenceAssetUri,
    prompt: prompt,
    finalPrompt: prompt,
    ratio: payload.ratio,
    resolution: payload.resolution,
    duration: payload.duration,
    quality: "high",
    provider: "seedance",
    upstreamSource: USE_GATEWAY_UPSTREAM ? "gateway" : "direct",
    kind: "scene-video",
    params: payload,
    upstreamPayload: payload,
    remoteVideoUrl: task.videoUrl || "",
    localVideoUrl: "",
    error: "",
    source: "user-character-scene",
    preDeductedCredits: cost,
    originalPreDeductedCredits: pricing.originalCredits ?? cost,
    finalCredits: cost,
    originalFinalCredits: pricing.originalCredits ?? cost,
    userPricingMultiplier: pricing.userPricingMultiplier ?? 1,
    billingStatus: cost > 0 ? "settled" : "free",
    billingSettledAt: new Date().toISOString(),
    pricingEstimate: pricing,
    createResponse: task,
    apiTokenId: auth.tokenRecord?.id || "",
    apiTokenName: auth.tokenRecord?.name || "",
    apiTokenType: auth.tokenRecord?.quotaType || "",
    apiTokenSource: auth.tokenSource || "",
  }, "create");

  return sendJson(res, 200, {
    ok: true,
    character: publicUserCharacter(record),
    sceneVideo: sceneVideos[sceneVideoKey],
    task,
    user: userView(auth.user),
    cost,
  });
}

async function handleQueryMyCharacterSceneVideo(req, res, taskId) {
  const auth = await requireUser(req, res);
  if (!auth) return;
  let record = null;
  let matchedSceneId = "";
  for (const entry of auth.db.userCharacters) {
    if (entry.userId !== auth.user.id) continue;
    if (isSoftDeleted(entry)) continue;
    const sceneVideos = entry.sceneVideos || {};
    for (const sceneId of Object.keys(sceneVideos)) {
      if (sceneVideos[sceneId]?.taskId === taskId) {
        record = entry;
        matchedSceneId = sceneId;
        break;
      }
    }
    if (record) break;
  }
  if (!record || !matchedSceneId) {
    return sendJson(res, 404, { ok: false, message: "No matching user-character scene video task found." });
  }
  const matchedVideoKey = matchedSceneId;
  const matchedSceneBaseId = sceneIdFromVideoKey(matchedVideoKey);

  const gatewayTask = USE_GATEWAY_UPSTREAM ? await gatewayQueryTask(taskId) : null;
  const raw = gatewayTask ? gatewayTask.raw : await arkRequest("GET", `/contents/generations/tasks/${encodeURIComponent(taskId)}`);
  const task = gatewayTask || normalizeTask(raw);
  const nowIso = new Date().toISOString();
  const sceneVideos = { ...(record.sceneVideos || {}) };
  const previous = sceneVideos[matchedVideoKey] || {};
  const localVideoUrl = previous.localVideoUrl || "";
  const localVideoPath = previous.localVideoPath || "";
  const cdnVideoUrl = previous.cdnVideoUrl || "";
  const cdnPosterUrl = previous.cdnPosterUrl || "";
  const cdnError = previous.cdnError || "";
  const downloadError = "";
  if (isSucceededStatus(task.status) && task.videoUrl) {
    queueGeneratedVideoDownload(task.taskId || taskId, task.videoUrl, "character-scene-background-download");
  }
  sceneVideos[matchedVideoKey] = {
    ...previous,
    sceneId: previous.sceneId || matchedSceneBaseId,
    taskId: task.taskId || taskId,
    status: task.status,
    videoUrl: localPublicAssetStorageEnabled()
      ? (localVideoUrl || cdnVideoUrl || task.videoUrl || previous.videoUrl || "")
      : (cdnVideoUrl || localVideoUrl || task.videoUrl || previous.videoUrl || ""),
    localVideoUrl: localVideoUrl || previous.localVideoUrl || "",
    localVideoPath: localVideoPath || previous.localVideoPath || "",
    remoteVideoUrl: task.videoUrl || previous.remoteVideoUrl || "",
    cdnVideoUrl: cdnVideoUrl || previous.cdnVideoUrl || "",
    cdnPosterUrl: cdnPosterUrl || previous.cdnPosterUrl || "",
    cdnError: cdnError || previous.cdnError || "",
    error: task.error || downloadError || "",
    updatedAt: nowIso,
  };
  record.sceneVideos = sceneVideos;
  record.updatedAt = nowIso;
  auth.db.userCharacters = auth.db.userCharacters.map((entry) => (entry.id === record.id ? record : entry));
  if (dbEnabled()) await upsertUserCharacterInDb(record);
  else await writeDb(auth.db);

  await upsertAndSettleGenerationRecord({
    taskId: task.taskId || taskId,
    status: task.status,
    remoteVideoUrl: task.videoUrl || "",
    localVideoUrl,
    localVideoPath,
    cdnVideoUrl,
    cdnPosterUrl,
    cdnError,
    error: task.error || downloadError || "",
    queryResponse: raw,
  }, "character-scene-query");

  return sendJson(res, 200, { ok: true, character: publicUserCharacter(record), sceneVideo: sceneVideos[matchedVideoKey], task });
}

async function handleAdminGetConfig(req, res) {
  const auth = await requireAdmin(req, res);
  if (!auth) return;
  const config = await readAppConfig();
  return sendJson(res, 200, { ok: true, config });
}

async function handleAdminGetUndressPrompts(req, res) {
  const auth = await requireAdmin(req, res);
  if (!auth) return;
  const config = await readAppConfig();
  return sendJson(res, 200, {
    ok: true,
    prompts: normalizeUndressPrompts(config.undressPrompts),
    defaults: DEFAULT_UNDRESS_PROMPTS,
  });
}

async function handleAdminSaveUndressPrompts(req, res) {
  const auth = await requireAdmin(req, res);
  if (!auth) return;
  const body = await readJson(req);
  let prompts;
  try {
    prompts = validateUndressPrompts(body.prompts);
  } catch (error) {
    return sendJson(res, 400, {
      ok: false,
      code: error.code || "INVALID_UNDRESS_PROMPT",
      field: error.field || "",
      message: error.message || "Invalid Undress prompt configuration.",
    });
  }
  const current = await readAppConfig();
  const next = {
    ...current,
    undressPrompts: prompts,
    updatedAt: new Date().toISOString(),
  };
  await writeAppConfig(next);
  return sendJson(res, 200, { ok: true, prompts, defaults: DEFAULT_UNDRESS_PROMPTS });
}

const ADVANCED_PRICING_ROWS = [
  { key: "seedance25-480p", provider: "seedance25", providerLabel: "Seedance 2.5", model: SEEDANCE25_MODEL_ID, resolution: "480p", rateKind: "output", unit: "output_second", usageLabel: "References / first-last frames" },
  { key: "seedance25-720p", provider: "seedance25", providerLabel: "Seedance 2.5", model: SEEDANCE25_MODEL_ID, resolution: "720p", rateKind: "output", unit: "output_second", usageLabel: "References / first-last frames" },
  { key: "seedance-nsfw-480p", provider: SEEDANCE25_DIRECT_PROVIDER, providerLabel: SEEDANCE25_DIRECT_LABEL, model: SEEDANCE25_DIRECT_MODEL, resolution: "480p", rateKind: "output", unit: "output_second", usageLabel: "Without input video" },
  { key: "seedance-nsfw-720p", provider: SEEDANCE25_DIRECT_PROVIDER, providerLabel: SEEDANCE25_DIRECT_LABEL, model: SEEDANCE25_DIRECT_MODEL, resolution: "720p", rateKind: "output", unit: "output_second", usageLabel: "Without input video" },
  { key: "seedance-nsfw-video-input-480p", provider: SEEDANCE25_DIRECT_PROVIDER, providerLabel: `${SEEDANCE25_DIRECT_LABEL} + Video`, model: SEEDANCE25_DIRECT_MODEL, resolution: "480p", rateKind: "video_input", unit: "combined_second", usageLabel: "Input + output video seconds" },
  { key: "seedance-nsfw-video-input-720p", provider: SEEDANCE25_DIRECT_PROVIDER, providerLabel: `${SEEDANCE25_DIRECT_LABEL} + Video`, model: SEEDANCE25_DIRECT_MODEL, resolution: "720p", rateKind: "video_input", unit: "combined_second", usageLabel: "Input + output video seconds" },
  { key: "wan30-480p", provider: "wan30", providerLabel: "W3.0", model: ALIYUN_WAN30_MODEL, resolution: "480p", rateKind: "output", unit: "output_second", usageLabel: "All modes" },
  { key: "wan30-720p", provider: "wan30", providerLabel: "W3.0", model: ALIYUN_WAN30_MODEL, resolution: "720p", rateKind: "output", unit: "output_second", usageLabel: "All modes" },
  { key: "wan30-1080p", provider: "wan30", providerLabel: "W3.0", model: ALIYUN_WAN30_MODEL, resolution: "1080p", rateKind: "output", unit: "output_second", usageLabel: "All modes" },
  { key: "wan30-prime-480p", provider: "wan30", providerLabel: "W3.0-Prime", capability: "wan30-video-prime", model: ALIYUN_WAN30_PRIME_MODEL, resolution: "480p", rateKind: "output", unit: "output_second", usageLabel: "All modes" },
  { key: "wan30-prime-720p", provider: "wan30", providerLabel: "W3.0-Prime", capability: "wan30-video-prime", model: ALIYUN_WAN30_PRIME_MODEL, resolution: "720p", rateKind: "output", unit: "output_second", usageLabel: "All modes" },
  { key: "wan30-prime-1080p", provider: "wan30", providerLabel: "W3.0-Prime", capability: "wan30-video-prime", model: ALIYUN_WAN30_PRIME_MODEL, resolution: "1080p", rateKind: "output", unit: "output_second", usageLabel: "All modes" },
  { key: "wan30-pro-1080p", provider: "wan30", providerLabel: "W3.0-Pro", capability: "wan30-video-pro", model: ALIYUN_WAN30_MODEL.replace(/-video$/, "-video-pro"), resolution: "1080p", rateKind: "output", unit: "output_second", usageLabel: "All modes" },
  { key: "wan30-pro-2k", provider: "wan30", providerLabel: "W3.0-Pro", capability: "wan30-video-pro", model: ALIYUN_WAN30_MODEL.replace(/-video$/, "-video-pro"), resolution: "2k", rateKind: "output", unit: "output_second", usageLabel: "All modes" },
  { key: "wan30-pro-4k", provider: "wan30", providerLabel: "W3.0-Pro", capability: "wan30-video-pro", model: ALIYUN_WAN30_MODEL.replace(/-video$/, "-video-pro"), resolution: "4k", rateKind: "output", unit: "output_second", usageLabel: "All modes" },
  { key: "wan30-prime-pro-1080p", provider: "wan30", providerLabel: "W3.0-VSR-Prime", capability: "wan30-video-prime-pro", model: ALIYUN_WAN30_PRIME_MODEL.replace(/-prime$/, "-prime-pro"), resolution: "1080p", rateKind: "output", unit: "output_second", usageLabel: "All modes" },
  { key: "wan30-prime-pro-2k", provider: "wan30", providerLabel: "W3.0-VSR-Prime", capability: "wan30-video-prime-pro", model: ALIYUN_WAN30_PRIME_MODEL.replace(/-prime$/, "-prime-pro"), resolution: "2k", rateKind: "output", unit: "output_second", usageLabel: "All modes" },
  { key: "wan30-prime-pro-4k", provider: "wan30", providerLabel: "W3.0-VSR-Prime", capability: "wan30-video-prime-pro", model: ALIYUN_WAN30_PRIME_MODEL.replace(/-prime$/, "-prime-pro"), resolution: "4k", rateKind: "output", unit: "output_second", usageLabel: "All modes" },
  { key: "seedance-480p", provider: "seedance", providerLabel: "Seedance Standard", seedanceTier: "standard", resolution: "480p", rateKind: "output", unit: "output_second" },
  { key: "seedance-720p", provider: "seedance", providerLabel: "Seedance Standard", seedanceTier: "standard", resolution: "720p", rateKind: "output", unit: "output_second" },
  { key: "seedance-1080p", provider: "seedance", providerLabel: "Seedance Standard", seedanceTier: "standard", resolution: "1080p", rateKind: "output", unit: "output_second" },
  { key: "seedance-4k", provider: "seedance", providerLabel: "Seedance Standard", seedanceTier: "standard", resolution: "4k", rateKind: "output", unit: "output_second" },
  { key: "seedance-fast-480p", provider: "seedance", providerLabel: "Seedance Fast", seedanceTier: "fast", resolution: "480p", rateKind: "output", unit: "output_second" },
  { key: "seedance-fast-720p", provider: "seedance", providerLabel: "Seedance Fast", seedanceTier: "fast", resolution: "720p", rateKind: "output", unit: "output_second" },
  { key: "seedance-video-input-480p", provider: "seedance", providerLabel: "Seedance Standard 视频输入加收", seedanceTier: "standard", resolution: "480p", rateKind: "video_input", unit: "input_second" },
  { key: "seedance-video-input-720p", provider: "seedance", providerLabel: "Seedance Standard 视频输入加收", seedanceTier: "standard", resolution: "720p", rateKind: "video_input", unit: "input_second" },
  { key: "seedance-video-input-1080p", provider: "seedance", providerLabel: "Seedance Standard 视频输入加收", seedanceTier: "standard", resolution: "1080p", rateKind: "video_input", unit: "input_second" },
  { key: "seedance-video-input-4k", provider: "seedance", providerLabel: "Seedance Standard 视频输入加收", seedanceTier: "standard", resolution: "4k", rateKind: "video_input", unit: "input_second" },
  { key: "seedance-fast-video-input-480p", provider: "seedance", providerLabel: "Seedance Fast 视频输入加收", seedanceTier: "fast", resolution: "480p", rateKind: "video_input", unit: "input_second" },
  { key: "seedance-fast-video-input-720p", provider: "seedance", providerLabel: "Seedance Fast 视频输入加收", seedanceTier: "fast", resolution: "720p", rateKind: "video_input", unit: "input_second" },
  { key: "wan27-720p", provider: "wan27", providerLabel: "Wan2.7 Video", model: "wan2.7", resolution: "720p", rateKind: "output", unit: "output_second", usageLabel: "All modes" },
  { key: "wan27-1080p", provider: "wan27", providerLabel: "Wan2.7 Video", model: "wan2.7", resolution: "1080p", rateKind: "output", unit: "output_second", usageLabel: "All modes" },
  { key: "happyhorse-720p", provider: "happyhorse", providerLabel: "HappyHorse Video", model: "happyhorse", resolution: "720p", rateKind: "output", unit: "output_second", usageLabel: "All modes" },
  { key: "happyhorse-1080p", provider: "happyhorse", providerLabel: "HappyHorse Video", model: "happyhorse", resolution: "1080p", rateKind: "output", unit: "output_second", usageLabel: "All modes" },
  ...[
    { capability: "wan-animate-move", provider: "wan27", providerLabel: "Wan Image to Action", model: ALIYUN_WAN_ANIMATE_MOVE_MODEL, rates: ["wan-std", "wan-pro"] },
    { capability: "wan-animate-mix", provider: "wan27", providerLabel: "Wan Character Replacement", model: ALIYUN_WAN_ANIMATE_MIX_MODEL, rates: ["wan-std", "wan-pro"] },
  ].flatMap((item) => item.rates.map((rateKey) => ({
    key: `aliyun-${item.capability}-${rateKey}`,
    provider: item.provider,
    providerLabel: item.providerLabel,
    capability: item.capability,
    model: item.model,
    resolution: rateKey,
    rateKey,
    mode: rateKey.startsWith("wan-") ? rateKey : "",
    rateKind: "output",
    billing: ALIYUN_VIDEO_CAPABILITIES[item.capability]?.billing || "output",
    unit: "output_second",
  }))),
];

const ADVANCED_PRICING_ROW_KEYS = new Set([
  ...ADVANCED_PRICING_ROWS.map((row) => row.key),
  "wan27-image",
  "z-image-spicy-pro",
  "qwen-image-edit-spicy",
  "seedream5-pro-1k",
  "seedream5-pro-2k",
  "seedream5-pro-reference",
  "qwen-image3-pro-1k",
  "qwen-image3-pro-2k",
  "qwen-image3-pro-reference",
  "qwen-image3-standard-1k",
  "qwen-image3-standard-2k",
  "qwen-image3-standard-reference",
]);
const ADVANCED_PRICING_ROWS_BY_KEY = new Map(ADVANCED_PRICING_ROWS.map((row) => [row.key, row]));

const ADMIN_HIDDEN_PRICING_PROVIDERS = new Set(["wan27", "wan27-image"]);
const ADMIN_HIDDEN_PRICING_CAPABILITIES = new Set(["wan-animate-move", "wan-animate-mix"]);

function adminAdvancedPricingRowVisible(row = {}) {
  const provider = String(row.provider || "").trim().toLowerCase();
  const capability = String(row.capability || "").trim().toLowerCase();
  if (ADMIN_HIDDEN_PRICING_PROVIDERS.has(provider)) return false;
  if (ADMIN_HIDDEN_PRICING_CAPABILITIES.has(capability)) return false;
  return true;
}

