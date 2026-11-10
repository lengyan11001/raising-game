async function handleAdvancedVegaGenerate(req, res, context = {}) {
  const provider = normalizeAdvancedProvider(context.provider);
  const definition = vegaProviderDefinition(provider);
  if (!definition) return sendJson(res, 400, { ok: false, code: "INVALID_PROVIDER", message: "Unknown Vega provider." });
  const auth = context.auth || await requireUser(req, res);
  if (!auth) return;
  const config = context.config || await readAppConfig();
  const body = context.body || await readJson(req);
  const bodyParams = context.bodyParams || requestParamsFromBody(body);
  const caseParams = context.caseParams || {};
  const selectedCase = context.selectedCase || null;
  const usesVegaMediaLibrary = vegaProviderUsesMediaLibrary(provider);
  const merged = mergedRequestForMedia(body, caseParams);
  const requestedMediaMode = firstPresent(
    body.mediaMode,
    body.seedanceMode,
    body.functionMode,
    bodyParams.mediaMode,
    bodyParams.seedanceMode,
    bodyParams.functionMode,
    "",
  );
  const directDraftTaskId = String(firstPresent(
    body.draftTaskId,
    body.draft_task_id,
    bodyParams.draftTaskId,
    bodyParams.draft_task_id,
    "",
  )).trim();
  const prompt = String(context.prompt || firstPresent(body.prompt, bodyParams.prompt, selectedCase?.prompt, caseParams.prompt, "")).trim();
  const requestedMedia = vegaRequestMedia(merged);
  let draftSelection;
  try {
    draftSelection = resolveVegaDraftSelection({
      provider,
      mediaMode: requestedMediaMode,
      media: requestedMedia,
      prompt,
      draftTaskId: directDraftTaskId,
      templateDraftTaskId: firstPresent(caseParams.draftTaskId, caseParams.draft_task_id, ""),
    });
  } catch (error) {
    return sendAdvancedValidationError(res, error, `${definition.label} request is invalid.`);
  }
  const draftTaskId = draftSelection.draftTaskId;
  // Regenerate requests can carry media reconstructed from the source record.
  // Draft-to-final is identified solely by draftTaskId and must discard all of
  // that stale media before validation.
  const effectiveMedia = draftTaskId
    ? { firstFrameUrl: "", lastFrameUrl: "", referenceImages: [], referenceVideos: [], referenceAudios: [] }
    : requestedMedia;
  const mediaMode = draftSelection.mediaMode;
  let media;
  try {
    media = vegaMediaSelection({ ...effectiveMedia, mediaMode, draftTaskId });
    const ownedLiteAssetPublicUrl = async (assetId) => {
      const owned = (auth.db?.userAssets || []).find((asset) => (
        asset.id === assetId && asset.userId === auth.user.id && !isSoftDeleted(asset)
      )) || await getUserAssetFromDb(assetId);
      if (!owned || String(owned.userId || "").trim() !== String(auth.user.id || "").trim()) return null;
      return ensureVegaPublicUrlForUserAsset(auth.db, owned);
    };
    // Pro resolves asset:// through the media library. Lite always uses the
    // public object-storage URL and never queries or creates library entries.
    media = usesVegaMediaLibrary
      ? await resolveVegaMediaAssetSources({
        provider,
        media: { ...effectiveMedia, ...media },
        userId: auth.user.id,
        lookupSourceUrls: getVegaMediaLibrarySourceUrlsByAssetUrisFromDb,
        lookupAsset: getUserAssetFromDb,
      })
      : await resolveVegaLiteMediaAssetSources({
        provider,
        media: { ...effectiveMedia, ...media },
        userId: auth.user.id,
        lookupAsset: ownedLiteAssetPublicUrl,
      });
  } catch (error) {
    return sendAdvancedValidationError(res, error, `${definition.label} media is invalid.`);
  }
  const taskType = String(firstPresent(body.taskType, body.task_type, bodyParams.taskType, bodyParams.task_type, caseParams.taskType, "auto")).trim().toLowerCase();
  let duration;
  let resolution;
  let ratio;
  try {
    duration = draftTaskId
      ? Number(firstPresent(body.duration, bodyParams.duration, 5))
      : normalizeVegaDuration(provider, firstPresent(body.duration, body.durationSeconds, bodyParams.duration, bodyParams.durationSeconds, caseParams.duration), { taskType });
    resolution = normalizeVegaResolution(firstPresent(body.resolution, bodyParams.resolution, caseParams.resolution, "1080P"), provider);
    ratio = normalizeVegaRatio(firstPresent(body.ratio, body.aspect_ratio, bodyParams.ratio, bodyParams.aspect_ratio, caseParams.ratio, caseParams.aspect_ratio, "16:9"), provider, {
      taskType,
      frameRatioFromInput: vegaProviderCapabilities(provider)?.frameRatioFromInput && media.mode !== "reference_video" && media.mode !== "text_to_video",
    });
  } catch (error) {
    return sendAdvancedValidationError(res, error, `${definition.label} request is invalid.`);
  }
  const referenceVideoDurations = (Array.isArray(body.referenceVideoDurations)
    ? body.referenceVideoDurations
    : (Array.isArray(bodyParams.referenceVideoDurations)
      ? bodyParams.referenceVideoDurations
      : media.referenceVideos.map((url, index) => {
        const sourceItems = [
          ...arrayFromBody(merged.referenceVideos),
          ...arrayFromBody(merged.reference_videos),
          ...arrayFromBody(merged.referenceVideoUrls),
          ...arrayFromBody(merged.reference_video_urls),
        ];
        const source = sourceItems[index];
        return source && typeof source === "object" ? firstPresent(source.durationSeconds, source.duration, 0) : 0;
      }))).map((value) => durationSecondsFromValue(value)).filter((value) => value > 0);
  // Pricing is intentionally evaluated before credentials, media transport, charging, or upstream calls.
  let pricing;
  try {
    const rawPricing = advancedModelPricing(provider, {
      ...merged,
      duration,
      resolution,
      ratio,
      referenceVideoDurations,
      advancedPricing: config.platform?.advancedPricing,
    });
    pricing = applyUserPricingToEstimate(rawPricing, auth.user, pricingContextForAuth(auth));
    assertVegaPricingConfigured(provider, pricing);
  } catch (error) {
    return sendAdvancedValidationError(res, error, "Model pricing is unavailable.");
  }
  const cost = creditsAmount(pricing.credits || 0);
  if (auth.user.credits < cost) return sendJson(res, 402, insufficientCreditsPayload(cost, auth.user.credits));
  try {
    assertSubtokenCanSpend(auth, cost);
  } catch (error) {
    return sendJson(res, error.statusCode || 402, error.payload || {
      ok: false,
      code: error.code || "SUBTOKEN_QUOTA_UNAVAILABLE",
      message: error.message || "Sub token quota is not enough.",
    });
  }

  const subAppId = Number(process.env.TENCENT_VOD_SUB_APP_ID || 0);
  if (!String(process.env.TENCENTCLOUD_SECRET_ID || "").trim() || !String(process.env.TENCENTCLOUD_SECRET_KEY || "").trim() || !Number.isInteger(subAppId) || subAppId <= 0) {
    return sendJson(res, 503, {
      ok: false,
      code: "TENCENT_VOD_NOT_CONFIGURED",
      message: "Tencent VOD is not configured. Generation was not started.",
    });
  }
  const advancedOptions = {
    taskType,
    draftTaskId,
    draft: Boolean(vegaProviderCapabilities(provider)?.draft) && !draftTaskId && (body.draft === true || body.draft === "true" || bodyParams.draft === true),
    returnLastFrame: body.returnLastFrame === true || body.returnLastFrame === "true" || body.return_last_frame === true || bodyParams.returnLastFrame === true,
    returnVegaUsage: body.returnVegaUsage === true || body.returnVegaUsage === "true" || bodyParams.returnVegaUsage === true,
    enhancePromptMode: firstPresent(body.enhancePromptMode, body.enhance_prompt_mode, bodyParams.enhancePromptMode, bodyParams.enhance_prompt_mode),
    moderationMode: firstPresent(body.moderationMode, body.moderation_mode, bodyParams.moderationMode, bodyParams.moderation_mode),
    generateMode: firstPresent(body.generateMode, body.generate_mode, bodyParams.generateMode, bodyParams.generate_mode),
    videoQualityMode: firstPresent(body.videoQualityMode, body.video_quality_mode, bodyParams.videoQualityMode, bodyParams.video_quality_mode),
    outputFormat: firstPresent(body.outputFormat, body.output_format, bodyParams.outputFormat, bodyParams.output_format),
    assetGroupId: firstPresent(body.assetGroupId, body.asset_group_id, bodyParams.assetGroupId, bodyParams.asset_group_id),
    generateAudio: firstPresent(body.generateAudio, body.generate_audio, bodyParams.generateAudio, bodyParams.generate_audio, true),
  };
  let payload;
  try {
    payload = buildVegaCreatePayload({
      provider,
      prompt,
      ...media,
      mediaMode: media.mode,
      duration,
      resolution,
      ratio,
      seed: firstPresent(body.seed, bodyParams.seed, caseParams.seed),
      referenceVideoDurations,
      referenceAudioDurations: (Array.isArray(body.referenceAudioDurations) ? body.referenceAudioDurations : (Array.isArray(bodyParams.referenceAudioDurations) ? bodyParams.referenceAudioDurations : [])),
      ...advancedOptions,
    }, { subAppId });
  } catch (error) {
    return sendAdvancedValidationError(res, error, `${definition.label} request is invalid.`);
  }
  if (usesVegaMediaLibrary && Array.isArray(payload.FileInfos) && payload.FileInfos.length) {
    try {
      payload = {
        ...payload,
        FileInfos: await prepareVegaMediaLibraryFileInfos({
          provider,
          fileInfos: payload.FileInfos,
          subAppId,
          assetGroupId: advancedOptions.assetGroupId,
          userId: auth.user.id,
          lookup: getVegaMediaLibraryEntryFromDb,
          persist: upsertVegaMediaLibraryEntryInDb,
          canonicalizeSourceUrl: canonicalOssStorageUrlForCache,
          signSourceUrl: publicHttpUrlForUpstream,
        }),
      };
    } catch (error) {
      const errorInfo = normalizeErrorPayload(error);
      return sendJson(res, errorInfo.statusCode || 502, {
        ok: false,
        code: errorInfo.code || "VEGA_MEDIA_LIBRARY_IMPORT_FAILED",
        message: errorInfo.message || "Tencent VOD media-library import failed. Generation was not started.",
        provider,
        details: errorInfo.details || null,
      });
    }
  }
  // Lite providers submit public URL FileInfos directly. Refresh OSS
  // signatures at this final boundary so a stale browser/cache URL cannot
  // become a 403 inside Tencent VOD.
  if (Array.isArray(payload.FileInfos) && payload.FileInfos.length) {
    payload = {
      ...payload,
      FileInfos: payload.FileInfos.map((fileInfo) => ({
        ...fileInfo,
        Url: String(publicHttpUrlForUpstream(fileInfo?.Url) || fileInfo?.Url || "").trim(),
      })),
    };
  }

  const firstFrameAssetUri = usesVegaMediaLibrary
    ? (vegaAssetUrisFromFileInfos(payload.FileInfos, "Image", "FirstFrame")[0] || requestedMedia.firstFrameAssetUri || "")
    : "";
  const lastFrameAssetUri = usesVegaMediaLibrary
    ? (vegaAssetUrisFromFileInfos(payload.FileInfos, "Image", "LastFrame")[0] || requestedMedia.lastFrameAssetUri || "")
    : "";
  const referenceImageAssetUris = usesVegaMediaLibrary ? vegaAssetUrisFromFileInfos(payload.FileInfos, "Image", "Reference") : [];
  const referenceVideoAssetUris = usesVegaMediaLibrary ? vegaAssetUrisFromFileInfos(payload.FileInfos, "Video", "Reference") : [];
  const referenceAudioAssetUris = usesVegaMediaLibrary ? vegaAssetUrisFromFileInfos(payload.FileInfos, "Audio", "Reference") : [];
  if (usesVegaMediaLibrary && !referenceImageAssetUris.length) referenceImageAssetUris.push(...requestedMedia.referenceImageAssetUris);
  if (usesVegaMediaLibrary && !referenceVideoAssetUris.length) referenceVideoAssetUris.push(...requestedMedia.referenceVideoAssetUris);
  if (usesVegaMediaLibrary && !referenceAudioAssetUris.length) referenceAudioAssetUris.push(...requestedMedia.referenceAudioAssetUris);
  const taskId = localGenerationTaskId("cgt");
  const requestParams = {
    ...caseParams,
    ...bodyParams,
    ...body,
    ...advancedOptions,
    provider,
    mediaMode: media.mode,
    duration,
    resolution,
    ratio,
    ...(firstFrameAssetUri ? { firstFrameAssetUri } : {}),
    ...(lastFrameAssetUri ? { lastFrameAssetUri } : {}),
    ...(referenceImageAssetUris.length ? { referenceImageAssetUris } : {}),
    ...(referenceVideoAssetUris.length ? { referenceVideoAssetUris } : {}),
    ...(referenceAudioAssetUris.length ? { referenceAudioAssetUris } : {}),
    ...(payload.Seed !== undefined ? { seed: payload.Seed } : {}),
  };
  if (!usesVegaMediaLibrary) {
    delete requestParams.firstFrameAssetUri;
    delete requestParams.lastFrameAssetUri;
    delete requestParams.referenceImageAssetUris;
    delete requestParams.referenceVideoAssetUris;
    delete requestParams.referenceAudioAssetUris;
    delete requestParams.first_frame_asset_uri;
    delete requestParams.last_frame_asset_uri;
    delete requestParams.reference_image_asset_uris;
    delete requestParams.reference_video_asset_uris;
    delete requestParams.reference_audio_asset_uris;
  }
  const requestTrace = requestTraceForGeneration(req);
  let charged = false;
  try {
    if (cost > 0) {
      await chargeUserWithSubtoken(auth, {
        cost,
        type: "advanced_generation",
        taskId,
        meta: {
          taskId,
          provider,
          model: definition.modelName,
          modelVersion: definition.modelVersion,
          duration,
          resolution,
          ratio,
          pricingSource: pricing.source || "vega_not_configured",
          baseCredits: pricing.baseCredits,
          originalCost: pricing.originalCredits,
          pricingMultiplier: pricing.userPricingMultiplier,
          markup: pricing.markup,
        },
      });
      charged = true;
      if (!dbEnabled()) await writeDb(auth.db);
    }
    const initialRecord = await upsertGenerationRecord({
      taskId,
      status: "submitting",
      model: `${definition.modelName}:${definition.modelVersion}`,
      provider,
      source: `advanced-${provider}`,
      kind: "advanced-video",
      upstreamSource: "tencent-vod",
      templateId: selectedCase?.id || "",
      templateTitle: selectedCase?.title || definition.label,
      userId: auth.user.id,
      prompt,
      finalPrompt: prompt,
      params: requestParams,
      mediaMode: media.mode,
      mediaAssets: media.mode === "first_frame"
        ? [{
          type: "first_frame",
          url: media.firstFrameUrl,
          userAssetId: requestedMedia.firstFrameAssetId,
          ...(firstFrameAssetUri ? { assetUri: firstFrameAssetUri, referenceAssetUri: firstFrameAssetUri } : {}),
        }]
        : media.mode === "last_frame"
        ? [{
          type: "last_frame",
          url: media.lastFrameUrl,
          userAssetId: requestedMedia.lastFrameAssetId,
          ...(lastFrameAssetUri ? { assetUri: lastFrameAssetUri, referenceAssetUri: lastFrameAssetUri } : {}),
        }]
        : media.mode === "first_last_frame"
        ? [
          {
            type: "first_frame",
            url: media.firstFrameUrl,
            userAssetId: requestedMedia.firstFrameAssetId,
            ...(firstFrameAssetUri ? { assetUri: firstFrameAssetUri, referenceAssetUri: firstFrameAssetUri } : {}),
          },
          {
            type: "last_frame",
            url: media.lastFrameUrl,
            userAssetId: requestedMedia.lastFrameAssetId,
            ...(lastFrameAssetUri ? { assetUri: lastFrameAssetUri, referenceAssetUri: lastFrameAssetUri } : {}),
          },
        ]
        : [
          ...media.referenceImages.map((url, index) => ({
            type: "reference_image",
            key: `image_${index + 1}`,
            url,
            userAssetId: requestedMedia.referenceImageAssetIds[index] || "",
            ...(referenceImageAssetUris[index]
              ? { assetUri: referenceImageAssetUris[index], referenceAssetUri: referenceImageAssetUris[index] }
              : {}),
          })),
          ...media.referenceVideos.map((url, index) => ({
            type: "reference_video",
            key: `video_${index + 1}`,
            videoUrl: url,
            userAssetId: requestedMedia.referenceVideoAssetIds[index] || "",
            ...(referenceVideoAssetUris[index]
              ? { assetUri: referenceVideoAssetUris[index], referenceAssetUri: referenceVideoAssetUris[index] }
              : {}),
          })),
          ...media.referenceAudios.map((url, index) => ({
            type: "reference_audio",
            key: `audio_${index + 1}`,
            audioUrl: url,
            userAssetId: requestedMedia.referenceAudioAssetIds[index] || "",
            ...(referenceAudioAssetUris[index]
              ? { assetUri: referenceAudioAssetUris[index], referenceAssetUri: referenceAudioAssetUris[index] }
              : {}),
          })),
        ],
      ratio,
      resolution,
      duration,
      quality: resolution,
      upstreamPayload: payload,
      createResponse: null,
      awaitingUpstreamTask: true,
      error: "",
      draftTaskId,
      preDeductedCredits: cost,
      originalPreDeductedCredits: pricing.originalCredits ?? cost,
      finalCredits: cost,
      originalFinalCredits: pricing.originalCredits ?? cost,
      userPricingMultiplier: pricing.userPricingMultiplier ?? 1,
      billingStatus: cost > 0 ? "pre_deducted" : "free",
      billingSettledAt: "",
      pricingEstimate: pricing,
      apiTokenId: auth.tokenRecord?.id || "",
      apiTokenName: auth.tokenRecord?.name || "",
      apiTokenType: auth.tokenRecord?.quotaType || "",
      apiTokenSource: auth.tokenSource || "",
      ...requestTrace,
    });
    const raw = await callTencentVod({ action: "CreateAigcVideoTask", payload });
    const upstreamTaskId = vegaCreateTaskId(raw);
    if (!upstreamTaskId) {
      throw Object.assign(new Error("Tencent VOD did not return a task id."), { statusCode: 502, code: "TENCENT_VOD_TASK_ID_MISSING", payload: raw });
    }
    const record = await upsertAndSettleGenerationRecord({
      taskId,
      status: "running",
      upstreamTaskId,
      awaitingUpstreamTask: true,
      createResponse: raw,
      upstreamPayload: payload,
    }, `advanced-${provider}-submitted`);
    const db = await readDb();
    const latestDb = db || auth.db;
    const latestUser = (latestDb.users || []).find((user) => user.id === auth.user.id) || auth.user;
    return sendJson(res, 200, {
      ok: true,
      async: true,
      task: { taskId: record.taskId, status: record.status },
      taskId: record.taskId,
      record: publicGenerationRecord(record, generationRecordResponseOptionsForAuth(auth)),
      user: userView(latestUser),
      pricing,
      cost,
      params: initialRecord.params,
    });
  } catch (error) {
    const errorInfo = normalizeErrorPayload(error);
    let refunded = !charged || cost <= 0;
    let refundError = null;
    if (charged) {
      const result = await refundCreditsWithSubtoken({ taskId, userId: auth.user.id, provider }, auth.user.id, cost, "advanced_vega_refund", {
        taskId,
        provider,
        error: errorInfo.message,
      }, { logTag: "vega-generation" });
      refunded = result.refunded;
      refundError = result.error;
    }
    await upsertGenerationRecord({
      taskId,
      status: "failed",
      provider,
      source: `advanced-${provider}`,
      kind: "advanced-video",
      upstreamSource: "tencent-vod",
      awaitingUpstreamTask: false,
      error: errorInfo.message || `${definition.label} failed.`,
      code: errorInfo.code || "",
      errorPayload: errorInfo.payload || null,
      createResponse: errorInfo.payload || null,
      upstreamPayload: payload || null,
      finalCredits: 0,
      originalFinalCredits: 0,
      billingStatus: cost <= 0 ? "free" : refunded ? "refunded" : "pre_deducted",
      billingError: refundError ? `Refund failed: ${refundError.message || refundError}` : "",
      billingSettledAt: refunded ? new Date().toISOString() : "",
      failedAt: new Date().toISOString(),
    });
    const current = await getGenerationRecord(taskId).catch(() => null);
    return sendJson(res, errorInfo.statusCode || 502, {
      ok: false,
      message: errorInfo.message || `${definition.label} failed.`,
      code: errorInfo.code || "",
      taskId,
      record: publicGenerationRecord(current || { taskId }, generationRecordResponseOptionsForAuth(auth)),
      payload: errorInfo.payload || null,
    });
  }
}

function advancedRuntimeForProvider(provider, requestParams = {}) {
  if (isVegaProvider(provider)) {
    const definition = vegaProviderDefinition(provider);
    return {
      providerName: definition.id,
      recordSource: `advanced-${definition.id}`,
      model: `${definition.modelName}:${definition.modelVersion}`,
      quality: normalizeVegaResolution(requestParams.resolution),
    };
  }
  if (normalizeAdvancedProvider(provider) === "seedance25") {
    return {
      providerName: "seedance25",
      recordSource: "advanced-seedance25",
      model: "Seedance 2.5",
      quality: String(requestParams.resolution || "480p").toLowerCase(),
    };
  }
  if (isAliyunVideoProvider(provider)) {
    const normalizedProvider = normalizeAdvancedProvider(provider);
    const capability = requestParams.videoCapability || aliyunVideoCapabilityForRequest(normalizedProvider, requestParams, []);
    return {
      providerName: normalizedProvider === "wan30" ? "aliyun-wan30" : normalizedProvider === "happyhorse" ? "aliyun-happyhorse" : "aliyun-wan27",
      recordSource: normalizedProvider === "wan30" ? "advanced-wan30" : normalizedProvider === "happyhorse" ? "advanced-happyhorse" : `advanced-${capability}`,
      model: requestParams.model || aliyunVideoModelForCapability(capability),
      quality: normalizeWan27Resolution(requestParams.resolution),
    };
  }
  return {
    providerName: "seedance",
    recordSource: "advanced-seedance",
    model: requestParams.model || MODEL_QUALITY,
    quality: "high",
  };
}

function startAdvancedGenerationJob(job) {
  setImmediate(() => {
    runAdvancedGenerationJob(job).catch((error) => {
      console.error("[advanced-generation-job-failed]", job.taskId, error.stack || error.message || error);
    });
  });
}

async function runAdvancedGenerationJob(job = {}) {
  const {
    taskId,
    userId,
    userAssetId,
    extraUserAssetIds = [],
    provider,
    prompt,
    requestParams,
    seedanceMode = "",
    seedanceFirstFrameAssetId = "",
    seedanceEndFrameAssetId = "",
    wan27MediaMode,
    wan27Media,
    pricing,
    cost,
    caseId,
    caseTitle,
    referenceVideoAssetId = "",
    referenceVideoAssetIds = [],
    referenceVideoAssetUris: initialReferenceVideoAssetUris = [],
    referenceAudioAssetUris: initialReferenceAudioAssetUris = [],
    referenceAudioAssetIds = [],
    referenceImageAssetUris = [],
  } = job;
  if (isVegaProvider(provider)) {
    throw new Error("Vega generation must use handleAdvancedVegaGenerate.");
  }
  let referenceVideoAssetUris = Array.isArray(initialReferenceVideoAssetUris) ? [...initialReferenceVideoAssetUris] : [];
  let referenceAudioAssetUris = Array.isArray(initialReferenceAudioAssetUris) ? [...initialReferenceAudioAssetUris] : [];
  const bodyParams = requestParams && typeof requestParams === "object" ? requestParamsFromBody(requestParams) : {};
  const runtime = advancedRuntimeForProvider(provider, requestParams);
  let userAsset = null;
  let referenceAssetUri = "";
  let imageUrl = "";
  let sourceImageUrl = "";
  let syntheticReferenceLocalUrl = "";
  let syntheticReferenceUrl = "";
  let seedanceMediaAssets = [];
  let extraReferenceAssetUris = [];
  let seedanceVideoAsset = null;
  let extraSeedanceVideoAssets = [];
  let seedanceAudioAssets = [];
  let seedanceFirstFrameAsset = null;
  let seedanceEndFrameAsset = null;
  let seedanceImageUrl = "";
  let seedanceEndImageUrl = "";
  let referenceVideoAssetUri = "";
  let extraReferenceVideoAssetUris = [];
  let resolvedReferenceAudioAssetUris = [];
  let directReferenceAssetUris = Array.isArray(referenceImageAssetUris)
    ? [...new Set(referenceImageAssetUris.map((uri) => String(uri || "").trim()).filter((uri) => uri.startsWith("asset://") || isPublicHttpUrl(uri)))]
    : [];
  let payload = null;
  let createResponse = null;
  let useIgnexSeedance = false;
  let useExternalSeedanceHttp = false;
  let upstreamSource = USE_GATEWAY_UPSTREAM ? "gateway" : "direct";
  const preprocessSeedanceImages = provider === "seedance"
    && requestParams.preprocessReference === true
    && !USE_GATEWAY_UPSTREAM;

  try {
    await updateGenerationRecord(taskId, {
      status: "preparing",
      awaitingUpstreamTask: true,
      error: "",
    }, "advanced-preparing");

    const db = await readGenerationJobDb(userId);
    const jobUser = (db.users || []).find((user) => user.id === userId && !isSoftDeleted(user)) || null;
    useIgnexSeedance = provider === "seedance" && !USE_GATEWAY_UPSTREAM && seedanceIgnexEnabledForUser(jobUser);
    useExternalSeedanceHttp = useIgnexSeedance;
    upstreamSource = useIgnexSeedance ? "ignex" : (USE_GATEWAY_UPSTREAM ? "gateway" : "direct");
    if (provider === "seedance" && !USE_GATEWAY_UPSTREAM && !useExternalSeedanceHttp) {
      const preparedUris = [];
      for (let index = 0; index < directReferenceAssetUris.length; index += 1) {
        const uri = directReferenceAssetUris[index];
        preparedUris.push(isPublicHttpUrl(uri)
          ? await ensureSeedanceAssetUriForPublicUrl(uri, "Image", `reference-image-${index + 1}`)
          : uri);
      }
      directReferenceAssetUris = [...new Set(preparedUris)];
    }
    if (userAssetId) {
      userAsset = (db.userAssets || []).find((asset) => asset.id === userAssetId && asset.userId === userId && !isSoftDeleted(asset));
      if (!userAsset) {
        const error = new Error("Reference image not found.");
        error.statusCode = 404;
        throw error;
      }
    }
    const requestedExtraAssetIds = Array.isArray(extraUserAssetIds) ? extraUserAssetIds.map((id) => String(id || "").trim()).filter(Boolean) : [];
    const extraUserAssets = requestedExtraAssetIds.map((assetId) => (
      (db.userAssets || []).find((asset) => asset.id === assetId && asset.userId === userId && !isSoftDeleted(asset))
    ));
    if (extraUserAssets.some((asset) => !asset)) {
      const error = new Error("Extra reference image not found.");
      error.statusCode = 404;
      throw error;
    }
    if (referenceVideoAssetId) {
      seedanceVideoAsset = (db.userAssets || []).find((asset) => asset.id === referenceVideoAssetId && asset.userId === userId && !isSoftDeleted(asset));
      if (!seedanceVideoAsset) {
        const error = new Error("Reference video not found.");
        error.statusCode = 404;
        throw error;
      }
      validateWan27MediaKind(seedanceVideoAsset, "video", "Seedance reference video");
    }
    const requestedVideoIds = Array.isArray(referenceVideoAssetIds)
      ? referenceVideoAssetIds.map((id) => String(id || "").trim()).filter(Boolean).slice(0, ADVANCED_SEEDANCE_VIDEO_REFERENCE_LIMIT)
      : [];
    const seenRequestedVideoIds = new Set([referenceVideoAssetId].filter(Boolean));
    extraSeedanceVideoAssets = requestedVideoIds
      .filter((assetId) => {
        if (!assetId || seenRequestedVideoIds.has(assetId)) return false;
        seenRequestedVideoIds.add(assetId);
        return true;
      })
      .map((assetId) => (db.userAssets || []).find((asset) => asset.id === assetId && asset.userId === userId && !isSoftDeleted(asset)));
    if (extraSeedanceVideoAssets.some((asset) => !asset)) {
      const error = new Error("Extra reference video not found.");
      error.statusCode = 404;
      throw error;
    }
    extraSeedanceVideoAssets.forEach((asset) => validateWan27MediaKind(asset, "video", "Extra Seedance reference video"));
    const requestedAudioIds = Array.isArray(referenceAudioAssetIds)
      ? referenceAudioAssetIds.map((id) => String(id || "").trim()).filter(Boolean).slice(0, ADVANCED_SEEDANCE_AUDIO_REFERENCE_LIMIT)
      : [];
    seedanceAudioAssets = requestedAudioIds
      .map((assetId) => (db.userAssets || []).find((asset) => asset.id === assetId && asset.userId === userId && !isSoftDeleted(asset)));
    if (seedanceAudioAssets.some((asset) => !asset)) {
      const error = new Error("Reference audio not found.");
      error.statusCode = 404;
      throw error;
    }
    seedanceAudioAssets.forEach((asset) => validateWan27MediaKind(asset, "audio", "Seedance reference audio"));
    if (seedanceFirstFrameAssetId) {
      seedanceFirstFrameAsset = (db.userAssets || []).find((asset) => asset.id === seedanceFirstFrameAssetId && asset.userId === userId && !isSoftDeleted(asset));
      if (!seedanceFirstFrameAsset) {
        const error = new Error("Seedance first-frame image not found.");
        error.statusCode = 404;
        throw error;
      }
      validateWan27MediaKind(seedanceFirstFrameAsset, "image", "Seedance first-frame image");
    }
    if (seedanceEndFrameAssetId) {
      seedanceEndFrameAsset = (db.userAssets || []).find((asset) => asset.id === seedanceEndFrameAssetId && asset.userId === userId && !isSoftDeleted(asset));
      if (!seedanceEndFrameAsset) {
        const error = new Error("Seedance end-frame image not found.");
        error.statusCode = 404;
        throw error;
      }
      validateWan27MediaKind(seedanceEndFrameAsset, "image", "Seedance end-frame image");
    }

    if (userAsset) {
      if (provider === "seedance") {
        if (preprocessSeedanceImages) {
          const prepared = await prepareSeedanceReferenceAsset(db, userAsset, true);
          userAsset = prepared.asset;
          referenceAssetUri = USE_GATEWAY_UPSTREAM || useExternalSeedanceHttp
            ? (prepared.publicImageUrl || prepared.imageUrl)
            : prepared.referenceAssetUri;
          imageUrl = prepared.imageUrl;
          sourceImageUrl = prepared.sourceImageUrl;
          syntheticReferenceLocalUrl = userAsset.syntheticReferenceLocalUrl || "";
          syntheticReferenceUrl = userAsset.syntheticReferenceUrl || "";
        } else if (USE_GATEWAY_UPSTREAM) {
          imageUrl = userAsset.localUrl || userAsset.publicUrl || "";
          sourceImageUrl = userAsset.sourceImageUrl || userAsset.localUrl || "";
        } else if (useExternalSeedanceHttp) {
          referenceAssetUri = publicHttpUrlForUserAsset(userAsset);
          imageUrl = referenceAssetUri || userAsset.localUrl || userAsset.publicUrl || "";
          sourceImageUrl = publicHttpUrlForUpstream(userAsset.sourceImageUrl) || publicHttpUrlForUserAsset(userAsset) || userAsset.sourceImageUrl || userAsset.localUrl || "";
        } else {
          const prepared = await prepareSeedanceReferenceAsset(db, userAsset, false);
          userAsset = prepared.asset;
          referenceAssetUri = prepared.referenceAssetUri;
          imageUrl = prepared.imageUrl;
          sourceImageUrl = prepared.sourceImageUrl;
          syntheticReferenceLocalUrl = userAsset.syntheticReferenceLocalUrl || "";
          syntheticReferenceUrl = userAsset.syntheticReferenceUrl || "";
        }
      } else {
        userAsset = await ensurePublicUrlForUserAsset(db, userAsset);
        imageUrl = userAsset.publicUrl || userAsset.localUrl || "";
        sourceImageUrl = userAsset.sourceImageUrl || userAsset.localUrl || "";
      }
    }
    if (provider === "seedance" && directReferenceAssetUris.length && useExternalSeedanceHttp) {
      const directQueue = directReferenceAssetUris
        .filter((uri) => uri && uri !== referenceAssetUri)
        .slice(0, ADVANCED_SEEDANCE_REFERENCE_LIMIT);
      if (!referenceAssetUri && directQueue.length) {
        referenceAssetUri = directQueue.shift();
      }
      directQueue.forEach((uri) => {
        if (uri !== referenceAssetUri && !extraReferenceAssetUris.includes(uri)) extraReferenceAssetUris.push(uri);
      });
      extraReferenceAssetUris = extraReferenceAssetUris.slice(0, Math.max(0, ADVANCED_SEEDANCE_REFERENCE_LIMIT - 1));
    } else if (provider === "seedance" && directReferenceAssetUris.length && !useExternalSeedanceHttp) {
      const directQueue = directReferenceAssetUris
        .filter((uri) => uri && uri !== referenceAssetUri)
        .slice(0, ADVANCED_SEEDANCE_REFERENCE_LIMIT);
      if (!referenceAssetUri && directQueue.length) {
        referenceAssetUri = directQueue.shift();
      }
      directQueue.forEach((uri) => {
        if (uri !== referenceAssetUri && !extraReferenceAssetUris.includes(uri)) extraReferenceAssetUris.push(uri);
      });
      extraReferenceAssetUris = extraReferenceAssetUris.slice(0, Math.max(0, ADVANCED_SEEDANCE_REFERENCE_LIMIT - 1));
    }
    if (provider === "seedance" && seedanceVideoAsset) {
      if (USE_GATEWAY_UPSTREAM) {
        imageUrl = imageUrl || seedanceVideoAsset.localUrl || seedanceVideoAsset.publicUrl || "";
      } else if (useExternalSeedanceHttp) {
        referenceVideoAssetUri = publicHttpUrlForUserAsset(seedanceVideoAsset);
        imageUrl = imageUrl || referenceVideoAssetUri || seedanceVideoAsset.localUrl || seedanceVideoAsset.publicUrl || "";
      } else {
        const preparedVideo = await prepareSeedanceVideoAsset(db, seedanceVideoAsset);
        seedanceVideoAsset = preparedVideo.asset;
        referenceVideoAssetUri = preparedVideo.referenceAssetUri;
        imageUrl = imageUrl || preparedVideo.videoUrl;
      }
    }
    const extraReferenceVideoUriQueue = [];
    if (provider === "seedance" && extraSeedanceVideoAssets.length && useExternalSeedanceHttp) {
      for (const asset of extraSeedanceVideoAssets) {
        const uri = publicHttpUrlForUserAsset(asset);
        if (uri && uri !== referenceVideoAssetUri && !extraReferenceVideoAssetUris.includes(uri)) {
          extraReferenceVideoAssetUris.push(uri);
          extraReferenceVideoUriQueue.push(uri);
        }
      }
    } else if (provider === "seedance" && extraSeedanceVideoAssets.length && !USE_GATEWAY_UPSTREAM) {
      for (const asset of extraSeedanceVideoAssets) {
        const preparedVideo = await prepareSeedanceVideoAsset(db, asset);
        if (preparedVideo.referenceAssetUri && preparedVideo.referenceAssetUri !== referenceVideoAssetUri && !extraReferenceVideoAssetUris.includes(preparedVideo.referenceAssetUri)) {
          extraReferenceVideoAssetUris.push(preparedVideo.referenceAssetUri);
          extraReferenceVideoUriQueue.push(preparedVideo.referenceAssetUri);
        }
      }
    }
    if (provider === "seedance" && referenceVideoAssetUris.length && !USE_GATEWAY_UPSTREAM && !useExternalSeedanceHttp) {
      const unresolvedReferenceVideoUris = [];
      for (let index = 0; index < referenceVideoAssetUris.length; index += 1) {
        const uri = String(referenceVideoAssetUris[index] || "").trim();
        if (!uri) continue;
        if (uri.startsWith("asset://")) {
          if (uri !== referenceVideoAssetUri && !extraReferenceVideoAssetUris.includes(uri)) {
            extraReferenceVideoAssetUris.push(uri);
            extraReferenceVideoUriQueue.push(uri);
          }
          continue;
        }
        if (!isPublicHttpUrl(uri)) {
          unresolvedReferenceVideoUris.push(uri);
          continue;
        }
        // Materialize URL-based references into the user's hidden asset record
        // first. The record stores the durable upstream asset id, so repeated
        // generations reuse the same CreateAsset result after restarts.
        const sourceAsset = jobUser
          ? await createSeedanceReferenceVideoAssetFromUrl(db, jobUser, uri, index)
          : null;
        const preparedVideo = sourceAsset
          ? await prepareSeedanceVideoAsset(db, sourceAsset)
          : null;
        const preparedVideoUri = preparedVideo?.referenceAssetUri
          || await ensureSeedanceAssetUriForPublicUrl(uri, "Video", `reference-video-${index + 1}`);
        if (preparedVideoUri !== referenceVideoAssetUri && !extraReferenceVideoAssetUris.includes(preparedVideoUri)) {
          extraReferenceVideoAssetUris.push(preparedVideoUri);
          extraReferenceVideoUriQueue.push(preparedVideoUri);
        }
      }
      referenceVideoAssetUris = unresolvedReferenceVideoUris;
      if (unresolvedReferenceVideoUris.length) requestParams.reference_videos = unresolvedReferenceVideoUris;
      else delete requestParams.reference_videos;
      delete requestParams.referenceVideos;
      delete requestParams.referenceVideoUrls;
      delete requestParams.videoUrls;
    }
    if (provider === "seedance" && referenceAudioAssetUris.length && !USE_GATEWAY_UPSTREAM && !useExternalSeedanceHttp) {
      const remainingReferenceAudioUris = [];
      for (let index = 0; index < referenceAudioAssetUris.length; index += 1) {
        const uri = String(referenceAudioAssetUris[index] || "").trim();
        if (!uri) continue;
        if (uri.startsWith("asset://")) {
          remainingReferenceAudioUris.push(uri);
          continue;
        }
        if (!isPublicHttpUrl(uri)) {
          remainingReferenceAudioUris.push(uri);
          continue;
        }
        remainingReferenceAudioUris.push(await ensureSeedanceAssetUriForPublicUrl(uri, "Audio", `reference-audio-${index + 1}`));
      }
      referenceAudioAssetUris = remainingReferenceAudioUris;
      if (remainingReferenceAudioUris.length) requestParams.reference_audios = remainingReferenceAudioUris;
      else delete requestParams.reference_audios;
      delete requestParams.referenceAudios;
      delete requestParams.referenceAudioUrls;
      delete requestParams.audioUrls;
    }
    const audioReferenceUriByAssetId = new Map();
    if (provider === "seedance") {
      resolvedReferenceAudioAssetUris = referenceAudioAssetUris
        .map((uri) => String(uri || "").trim())
        .filter(Boolean);
      if (seedanceAudioAssets.length && !USE_GATEWAY_UPSTREAM && !useExternalSeedanceHttp) {
        for (const asset of seedanceAudioAssets) {
          const preparedAudio = await prepareSeedanceAudioAsset(db, asset);
          const uri = preparedAudio.referenceAssetUri || preparedAudio.audioUrl || "";
          if (uri && !resolvedReferenceAudioAssetUris.includes(uri)) {
            resolvedReferenceAudioAssetUris.push(uri);
            audioReferenceUriByAssetId.set(asset.id, uri);
          }
        }
      } else if (seedanceAudioAssets.length) {
        for (const asset of seedanceAudioAssets) {
          const uri = useExternalSeedanceHttp
            ? publicHttpUrlForUserAsset(asset)
            : (publicHttpUrlForUpstream(asset.publicUrl || asset.localUrl) || asset.localUrl || asset.publicUrl || "");
          if (uri && !resolvedReferenceAudioAssetUris.includes(uri)) {
            resolvedReferenceAudioAssetUris.push(uri);
            audioReferenceUriByAssetId.set(asset.id, uri);
          }
        }
      }
      resolvedReferenceAudioAssetUris = resolvedReferenceAudioAssetUris.slice(0, ADVANCED_SEEDANCE_AUDIO_REFERENCE_LIMIT);
    }
    if (provider === "seedance" && seedanceFirstFrameAsset) {
      if (preprocessSeedanceImages) {
        const preparedFrame = await prepareSeedanceReferenceAsset(db, seedanceFirstFrameAsset, true);
        seedanceFirstFrameAsset = preparedFrame.asset;
        seedanceImageUrl = USE_GATEWAY_UPSTREAM || useExternalSeedanceHttp
          ? (preparedFrame.publicImageUrl || preparedFrame.imageUrl)
          : preparedFrame.referenceAssetUri;
        imageUrl = imageUrl || preparedFrame.imageUrl;
        sourceImageUrl = sourceImageUrl || preparedFrame.sourceImageUrl;
      } else if (USE_GATEWAY_UPSTREAM) {
        imageUrl = imageUrl || seedanceFirstFrameAsset.localUrl || seedanceFirstFrameAsset.publicUrl || "";
        sourceImageUrl = sourceImageUrl || seedanceFirstFrameAsset.sourceImageUrl || seedanceFirstFrameAsset.localUrl || "";
      } else if (useExternalSeedanceHttp) {
        seedanceImageUrl = publicHttpUrlForUserAsset(seedanceFirstFrameAsset);
        imageUrl = imageUrl || seedanceImageUrl || seedanceFirstFrameAsset.localUrl || seedanceFirstFrameAsset.publicUrl || "";
        sourceImageUrl = sourceImageUrl || publicHttpUrlForUpstream(seedanceFirstFrameAsset.sourceImageUrl) || seedanceImageUrl || seedanceFirstFrameAsset.sourceImageUrl || seedanceFirstFrameAsset.localUrl || "";
      } else {
        const preparedFrame = await prepareSeedanceReferenceAsset(db, seedanceFirstFrameAsset, false);
        seedanceFirstFrameAsset = preparedFrame.asset;
        seedanceImageUrl = preparedFrame.referenceAssetUri;
        imageUrl = imageUrl || preparedFrame.imageUrl;
        sourceImageUrl = sourceImageUrl || preparedFrame.sourceImageUrl;
      }
    }
    if (provider === "seedance" && seedanceEndFrameAsset) {
      if (preprocessSeedanceImages) {
        const preparedEndFrame = await prepareSeedanceReferenceAsset(db, seedanceEndFrameAsset, true);
        seedanceEndFrameAsset = preparedEndFrame.asset;
        seedanceEndImageUrl = USE_GATEWAY_UPSTREAM || useExternalSeedanceHttp
          ? (preparedEndFrame.publicImageUrl || preparedEndFrame.imageUrl)
          : preparedEndFrame.referenceAssetUri;
      } else if (useExternalSeedanceHttp) {
        seedanceEndImageUrl = publicHttpUrlForUserAsset(seedanceEndFrameAsset);
      } else if (!USE_GATEWAY_UPSTREAM) {
        const preparedEndFrame = await prepareSeedanceReferenceAsset(db, seedanceEndFrameAsset, false);
        seedanceEndFrameAsset = preparedEndFrame.asset;
        seedanceEndImageUrl = preparedEndFrame.referenceAssetUri;
      }
    }
    if (provider === "seedance") {
      const frameMediaAssets = [
        ...(seedanceFirstFrameAsset ? [{
          type: "image_url",
          key: "image_url",
          userAssetId: seedanceFirstFrameAsset.id,
          referenceAssetUri: seedanceImageUrl,
          imageUrl: seedanceImageUrl || seedanceFirstFrameAsset.localUrl || seedanceFirstFrameAsset.publicUrl || imageUrl || "",
          sourceImageUrl: sourceImageUrl || seedanceFirstFrameAsset.sourceImageUrl || seedanceFirstFrameAsset.localUrl || "",
          localUrl: seedanceFirstFrameAsset.localUrl || "",
          mime: seedanceFirstFrameAsset.mime || "",
        }] : []),
        ...(seedanceEndFrameAsset ? [{
          type: "end_image_url",
          key: "end_image_url",
          userAssetId: seedanceEndFrameAsset.id,
          referenceAssetUri: seedanceEndImageUrl,
          imageUrl: seedanceEndImageUrl || seedanceEndFrameAsset.localUrl || seedanceEndFrameAsset.publicUrl || "",
          sourceImageUrl: seedanceEndFrameAsset.sourceImageUrl || seedanceEndFrameAsset.localUrl || "",
          localUrl: seedanceEndFrameAsset.localUrl || "",
          mime: seedanceEndFrameAsset.mime || "",
        }] : []),
      ];
      const videoMediaAsset = [seedanceVideoAsset, ...extraSeedanceVideoAssets].filter(Boolean)
        .slice(0, ADVANCED_SEEDANCE_VIDEO_REFERENCE_LIMIT)
        .map((asset, index) => ({
          type: "reference_video",
          key: `video_${index + 1}`,
          userAssetId: asset.id,
          referenceAssetUri: asset.id === seedanceVideoAsset?.id ? referenceVideoAssetUri : extraReferenceVideoUriQueue.shift() || "",
          videoUrl: (asset.id === seedanceVideoAsset?.id ? referenceVideoAssetUri : "") || asset.localUrl || asset.publicUrl || imageUrl || "",
          localUrl: asset.localUrl || "",
          mime: asset.mime || "",
        }));
      const publicVideoMediaAsset = referenceVideoAssetUris.map((uri, index) => ({
        type: "reference_video",
        key: `video_url_${index + 1}`,
        videoUrl: uri,
      }));
      const publicAudioMediaAssets = referenceAudioAssetUris.map((uri, index) => ({
        type: "reference_audio",
        key: `audio_url_${index + 1}`,
        audioUrl: uri,
      }));
      const assetAudioMediaAssets = seedanceAudioAssets.map((asset, index) => ({
        type: "reference_audio",
        key: `audio_asset_${index + 1}`,
        userAssetId: asset.id,
        referenceAssetUri: audioReferenceUriByAssetId.get(asset.id) || "",
        audioUrl: audioReferenceUriByAssetId.get(asset.id) || asset.publicUrl || asset.localUrl || "",
        localUrl: asset.localUrl || "",
        mime: asset.mime || "",
      }));
      const audioMediaAssets = [...publicAudioMediaAssets, ...assetAudioMediaAssets].slice(0, ADVANCED_SEEDANCE_AUDIO_REFERENCE_LIMIT);
      const directReferenceMediaAssets = extraReferenceAssetUris
        .filter((uri) => directReferenceAssetUris.includes(uri))
        .map((uri, index) => ({
          type: "reference_image",
          key: `seedance_asset_${index + 1}`,
          referenceAssetUri: uri,
          imageUrl: uri,
        }));
      const primaryMediaAsset = (USE_GATEWAY_UPSTREAM || useExternalSeedanceHttp) && userAsset ? [{
        type: "reference_image",
        key: "image_1",
        userAssetId: userAsset.id,
        referenceAssetUri: useExternalSeedanceHttp ? referenceAssetUri : "",
        imageUrl,
        sourceImageUrl,
        localUrl: userAsset.localUrl || "",
        mime: userAsset.mime || "",
      }] : referenceAssetUri ? [{
        type: "reference_image",
        key: "image_1",
        userAssetId: userAsset?.id || "",
        referenceAssetUri,
        imageUrl,
        sourceImageUrl,
        localUrl: userAsset?.localUrl || "",
        mime: userAsset?.mime || "",
      }] : [];
      const extraMediaAssets = [];
      for (let index = 0; index < extraUserAssets.length; index += 1) {
        if (preprocessSeedanceImages) {
          const prepared = await prepareSeedanceReferenceAsset(db, extraUserAssets[index], true);
          const referenceUri = USE_GATEWAY_UPSTREAM || useExternalSeedanceHttp
            ? (prepared.publicImageUrl || prepared.imageUrl)
            : prepared.referenceAssetUri;
          if (!referenceUri || referenceUri === referenceAssetUri || extraReferenceAssetUris.includes(referenceUri)) continue;
          extraReferenceAssetUris.push(referenceUri);
          extraMediaAssets.push({
            type: "reference_image",
            key: `extra_${index + 1}`,
            userAssetId: prepared.asset?.id || extraUserAssets[index]?.id || "",
            referenceAssetUri: referenceUri,
            imageUrl: prepared.imageUrl,
            sourceImageUrl: prepared.sourceImageUrl,
            localUrl: prepared.asset?.syntheticReferenceLocalUrl || prepared.asset?.localUrl || "",
            mime: prepared.asset?.mime || "",
          });
          continue;
        }
        if (USE_GATEWAY_UPSTREAM || useExternalSeedanceHttp) {
          const asset = extraUserAssets[index];
          const referenceUrl = useExternalSeedanceHttp ? publicHttpUrlForUserAsset(asset) : "";
          if (referenceUrl && !extraReferenceAssetUris.includes(referenceUrl)) extraReferenceAssetUris.push(referenceUrl);
          extraMediaAssets.push({
            type: "reference_image",
            key: `extra_${index + 1}`,
            userAssetId: asset?.id || "",
            referenceAssetUri: referenceUrl,
            imageUrl: referenceUrl || asset?.localUrl || asset?.publicUrl || "",
            sourceImageUrl: (useExternalSeedanceHttp ? publicHttpUrlForUpstream(asset?.sourceImageUrl) : "") || asset?.sourceImageUrl || asset?.localUrl || "",
            localUrl: asset?.localUrl || "",
            mime: asset?.mime || "",
          });
          continue;
        }
        const prepared = await prepareSeedanceReferenceAsset(db, extraUserAssets[index], false);
        if (!prepared.referenceAssetUri || prepared.referenceAssetUri === referenceAssetUri || extraReferenceAssetUris.includes(prepared.referenceAssetUri)) continue;
        extraReferenceAssetUris.push(prepared.referenceAssetUri);
        extraMediaAssets.push({
          type: "reference_image",
          key: `extra_${index + 1}`,
          userAssetId: prepared.asset?.id || extraUserAssets[index]?.id || "",
          referenceAssetUri: prepared.referenceAssetUri,
          imageUrl: prepared.imageUrl,
          sourceImageUrl: prepared.sourceImageUrl,
          localUrl: prepared.asset?.localUrl || "",
          mime: prepared.asset?.mime || "",
        });
      }
      seedanceMediaAssets = [...frameMediaAssets, ...videoMediaAsset, ...publicVideoMediaAsset, ...audioMediaAssets, ...primaryMediaAsset, ...extraMediaAssets, ...directReferenceMediaAssets];
    }

    let resolvedWan27MediaMode = wan27MediaMode || requestParams.mediaMode || requestParams.videoCapability || "first_frame";
    let resolvedWan27Media = Array.isArray(wan27Media) ? wan27Media : [];
    if (isAliyunVideoProvider(provider) && !resolvedWan27Media.length && !["wan30-video", "wan30-video-pro", "wan30-video-prime", "wan30-video-prime-pro", "wan27-t2v", "happyhorse-t2v"].includes(requestParams.videoCapability)) {
      const resolved = await resolveAliyunVideoMedia({
        db,
        user: { id: userId },
        body: { dataUrl: userAsset ? "asset" : "", mediaMode: resolvedWan27MediaMode },
        requestParams,
        fallbackAsset: userAsset,
      });
      resolvedWan27MediaMode = resolved.mediaMode;
      resolvedWan27Media = resolved.media;
    }
    if (isAliyunVideoProvider(provider) && resolvedWan27Media[0]) {
      imageUrl = resolvedWan27Media.find((item) => ["first_frame", "first_clip", "reference_image", "image_url"].includes(item.type))?.url || imageUrl;
      sourceImageUrl = imageUrl || sourceImageUrl;
    }

    await updateGenerationRecord(taskId, {
      status: "submitting",
      imageUrl,
      sourceImageUrl,
      syntheticReferenceLocalUrl,
      syntheticReferenceUrl,
      referenceAssetUri,
      mediaMode: isAliyunVideoProvider(provider) ? resolvedWan27MediaMode : (seedanceMode || (referenceVideoAssetUri ? "reference_video" : extraReferenceAssetUris.length ? "multi_reference" : "text_to_video")),
      mediaAssets: isAliyunVideoProvider(provider) ? resolvedWan27Media : seedanceMediaAssets,
      error: "",
    }, "advanced-reference-ready");

    const config = job.config || await readAppConfig();
    let task = null;
    let aliyunUpstreamModel = "";
    if (USE_GATEWAY_UPSTREAM) {
      const gatewayBody = {
        ...bodyParams,
        caseId,
        provider,
        prompt,
        preserveUserPrompt: requestParams.preserveUserPrompt || undefined,
        params: requestParams.preserveUserPrompt ? {
          createKind: requestParams.createKind || "custom",
          createMode: requestParams.createMode || "custom",
          preserveUserPrompt: true,
        } : undefined,
        ratio: requestParams.ratio,
        resolution: requestParams.resolution,
        duration: requestParams.duration,
        generateAudio: requestParams.generateAudio,
        preprocessReference: provider === "seedance" ? requestParams.preprocessReference : undefined,
        parameters: Object.keys(plainObject(requestParams.parameters)).length ? requestParams.parameters : undefined,
        input: Object.keys(plainObject(requestParams.input)).length ? requestParams.input : undefined,
        mediaMode: isAliyunVideoProvider(provider) ? resolvedWan27MediaMode : (seedanceMode || undefined),
        videoCapability: isAliyunVideoProvider(provider) ? requestParams.videoCapability : undefined,
        seedanceMode: provider === "seedance" ? (seedanceMode || undefined) : undefined,
        seed: normalizeOptionalSeed(requestParams.seed),
      };
      if (provider !== "seedance" || job.forwardModelToGateway) {
        gatewayBody.model = requestParams.model;
      }
      if (provider === "seedance") {
        const webSearchValue = firstPresent(requestParams.web_search, requestParams.webSearch, requestParams.parameters?.web_search, requestParams.parameters?.webSearch);
        const watermarkValue = firstPresent(requestParams.watermark, requestParams.parameters?.watermark);
        if (webSearchValue !== undefined) gatewayBody.web_search = boolFromRequest(webSearchValue, false);
        if (watermarkValue !== undefined) gatewayBody.watermark = boolFromRequest(watermarkValue, false);
        [
          "callback_url",
          "return_last_frame",
          "service_tier",
          "execution_expires_after",
          "draft",
          "safety_identifier",
          "priority",
          "frames",
          "fps",
          "camera_fixed",
        ].forEach((field) => {
          if (requestParams[field] !== undefined) gatewayBody[field] = requestParams[field];
        });
      }
      if (isAliyunVideoProvider(provider)) {
        const dbForGateway = db;
        const assetMap = new Map((dbForGateway.userAssets || []).map((asset) => [asset.id, asset]));
        const wan30References = { referenceImages: [], referenceVideos: [], referenceAudios: [] };
        for (const item of resolvedWan27Media) {
          let asset = item.userAssetId ? assetMap.get(item.userAssetId) : null;
          if (asset) asset = await ensurePublicUrlForUserMediaAsset(dbForGateway, asset, {
            imageMinDimension: provider === "wan30" ? 240 : SEEDANCE_IMAGE_DIMENSION_MIN,
            imageMaxDimension: provider === "wan30" ? 8000 : SEEDANCE_IMAGE_DIMENSION_MAX,
          });
          const publicUrl = asset ? publicHttpUrlForUserAsset(asset) : gatewayAbsoluteAssetUrl(item.url || "");
          if (!isPublicHttpUrl(publicUrl)) {
            throw advancedValidationError("GATEWAY_MEDIA_NOT_PUBLIC", "Gateway media could not be published to R2.", { key: item.key || "" });
          }
          if (provider === "wan30") {
            const entry = { url: publicUrl, fileName: asset?.name || "" };
            if (item.type === "first_frame") {
              gatewayBody.firstFrameUrl = publicUrl;
              gatewayBody.firstFrameFileName = asset?.name || "";
            } else if (item.type === "last_frame") {
              gatewayBody.lastFrameUrl = publicUrl;
              gatewayBody.lastFrameFileName = asset?.name || "";
            } else if (item.type === "reference_image") {
              wan30References.referenceImages.push(entry);
            } else if (item.type === "reference_video") {
              wan30References.referenceVideos.push(entry);
            } else if (item.type === "reference_audio") {
              wan30References.referenceAudios.push(entry);
            }
            continue;
          }
          gatewayBody[`${item.key}Url`] = publicUrl;
          if (asset?.name) gatewayBody[`${item.key}FileName`] = asset.name;
        }
        if (provider === "wan30") {
          Object.entries(wan30References).forEach(([key, value]) => {
            if (value.length) gatewayBody[key] = value;
          });
        }
      } else {
        const dbForGateway = db;
        const assetMap = new Map((dbForGateway.userAssets || []).map((asset) => [asset.id, asset]));
        const referenceImages = [];
        const referenceVideos = [];
        const referenceAudios = [];
        for (const item of seedanceMediaAssets) {
          let asset = item.userAssetId ? assetMap.get(item.userAssetId) : null;
          const preprocessedImage = preprocessSeedanceImages
            && ["reference_image", "image_url", "end_image_url"].includes(item.type);
          if (asset && !preprocessedImage) asset = await ensureSeedanceGatewayPublicAsset(dbForGateway, asset);
          let mediaUrl = preprocessedImage
            ? String(firstPresent(item.referenceAssetUri, item.imageUrl, "") || "").trim()
            : asset
              ? publicHttpUrlForUserAsset(asset)
              : String(firstPresent(item.referenceAssetUri, item.imageUrl, item.videoUrl, item.audioUrl, "") || "").trim();
          if (mediaUrl.startsWith("/")) mediaUrl = await publishLocalAssetUrlToObjectStorage(mediaUrl);
          else if (mediaUrl && !mediaUrl.startsWith("asset://")) mediaUrl = publicHttpUrlForUpstream(mediaUrl) || gatewayAbsoluteAssetUrl(mediaUrl);
          if (!mediaUrl) continue;
          if (item.type === "reference_video") {
            referenceVideos.push(mediaUrl);
          } else if (item.type === "reference_audio") {
            referenceAudios.push(mediaUrl);
          } else if (item.type === "image_url") {
            gatewayBody.firstFrameUrl = mediaUrl;
            gatewayBody.seedanceMode = seedanceMode || "first_frame";
          } else if (item.type === "end_image_url") {
            gatewayBody.endImageUrl = mediaUrl;
            gatewayBody.seedanceMode = "first_last_frame";
          } else {
            referenceImages.push(mediaUrl);
          }
        }
        gatewayBody.preservePublicMediaUrls = true;
        const allImages = [...referenceImages, ...directReferenceAssetUris].filter((uri, index, list) => uri && list.indexOf(uri) === index);
        const allVideos = [...referenceVideos, ...referenceVideoAssetUris].filter((uri, index, list) => uri && list.indexOf(uri) === index);
        const allAudios = [...referenceAudios, ...resolvedReferenceAudioAssetUris].filter((uri, index, list) => uri && list.indexOf(uri) === index);
        if (allImages.length) gatewayBody.referenceImageAssetUris = allImages.slice(0, ADVANCED_SEEDANCE_REFERENCE_LIMIT);
        if (allVideos.length) gatewayBody.referenceVideoUrls = allVideos.slice(0, ADVANCED_SEEDANCE_VIDEO_REFERENCE_LIMIT);
        if (allAudios.length) gatewayBody.referenceAudioUrls = allAudios.slice(0, ADVANCED_SEEDANCE_AUDIO_REFERENCE_LIMIT);
      }
      task = await gatewaySubmitAdvancedTask(gatewayBody);
      payload = gatewayBody;
      createResponse = task.raw;
    } else if (isAliyunVideoProvider(provider)) {
      if (!resolvedWan27Media.length && !["wan30-video", "wan30-video-pro", "wan30-video-prime", "wan30-video-prime-pro", "wan27-t2v", "happyhorse-t2v"].includes(requestParams.videoCapability)) {
        const error = new Error(`${requestParams.videoCapability || "Alibaba video"} requires media input.`);
        error.statusCode = 400;
        throw error;
      }
      const submitted = await submitAliyunVideoTask({
        provider,
        capability: requestParams.videoCapability,
        prompt,
        media: resolvedWan27Media,
        body: requestParams,
        user: jobUser,
        userId,
      });
      upstreamSource = submitted.upstreamSource || upstreamSource;
      aliyunUpstreamModel = submitted.upstreamModel || "";
      task = submitted.task;
      payload = submitted.payload;
      createResponse = submitted.raw;
    } else {
      const submitSeedanceTask = useIgnexSeedance ? submitIgnexSeedanceVideoTask : submitSeedanceVideoTask;
      const firstFrameForSubmit = !useExternalSeedanceHttp && isPublicHttpUrl(requestParams.image_url)
        ? await ensureSeedanceAssetUriForPublicUrl(requestParams.image_url, "Image", "first-frame")
        : requestParams.image_url || "";
      const lastFrameForSubmit = !useExternalSeedanceHttp && isPublicHttpUrl(requestParams.end_image_url)
        ? await ensureSeedanceAssetUriForPublicUrl(requestParams.end_image_url, "Image", "last-frame")
        : requestParams.end_image_url || "";
      const submitted = await submitSeedanceTask({
        config,
        prompt,
        referenceAssetUri,
        extraReferenceAssetUris,
        firstFrameAssetUri: seedanceImageUrl || firstFrameForSubmit,
        lastFrameAssetUri: seedanceEndImageUrl || lastFrameForSubmit,
        referenceVideoAssetUri,
        extraReferenceVideoAssetUris: [...extraReferenceVideoAssetUris, ...referenceVideoAssetUris],
        referenceAudioAssetUris: resolvedReferenceAudioAssetUris,
        body: {
          ...requestParams,
        },
        slug: "advanced",
        user: jobUser,
        db,
      });
      task = { ...submitted.task, recordModel: submitted.recordModel || "" };
      payload = submitted.payload;
      createResponse = submitted.raw || task;
      upstreamSource = submitted.upstreamSource || upstreamSource;
    }

    const upstreamTaskId = task?.taskId || "";
    if (!upstreamTaskId) {
      const error = new Error(`Generation service did not return task id: ${JSON.stringify(task || createResponse || {})}`);
      error.statusCode = 502;
      throw error;
    }

    const submittedAt = new Date().toISOString();
    const submittedModel = String(firstPresent(
      task?.recordModel,
      task?.record?.model,
      task?.raw?.record?.model,
      task?.raw?.data?.record?.model,
      useExternalSeedanceHttp ? runtime.model : payload?.model,
      runtime.model,
    ));
    const fixedBilling = {
      finalCredits: pricing?.adaptiveDuration ? null : cost,
      originalFinalCredits: pricing?.adaptiveDuration ? null : (pricing?.originalCredits ?? cost),
      userPricingMultiplier: pricing?.userPricingMultiplier ?? 1,
      billingStatus: cost > 0 ? (pricing?.adaptiveDuration ? "pre_deducted" : "settled") : "free",
      billingSettledAt: cost > 0 && !pricing?.adaptiveDuration ? submittedAt : "",
    };
    await updateGenerationRecord(taskId, {
      status: task.status || "submitted",
      upstreamTaskId,
      awaitingUpstreamTask: false,
      model: submittedModel,
      provider: runtime.providerName,
      upstreamSource,
      upstreamModel: isAliyunVideoProvider(provider) ? (aliyunUpstreamModel || payload?.model || "") : (useExternalSeedanceHttp ? (payload?.params?.model || payload?.model || "") : ""),
      source: runtime.recordSource,
      kind: "advanced-video",
      imageUrl,
      sourceImageUrl,
      syntheticReferenceLocalUrl,
      syntheticReferenceUrl,
      referenceAssetUri,
      mediaMode: isAliyunVideoProvider(provider) ? resolvedWan27MediaMode : (seedanceMode || (referenceVideoAssetUri ? "reference_video" : extraReferenceAssetUris.length ? "multi_reference" : "text_to_video")),
      mediaAssets: isAliyunVideoProvider(provider) ? resolvedWan27Media : seedanceMediaAssets,
      params: requestParams,
      upstreamPayload: payload,
      ratio: payload?.ratio || requestParams.ratio || "",
      resolution: payload?.resolution || payload?.parameters?.resolution || requestParams.resolution || "",
      duration: payload?.duration || payload?.parameters?.duration || requestParams.duration,
      quality: runtime.quality,
      remoteVideoUrl: task.videoUrl || "",
      error: "",
      createResponse,
      submittedAt,
      pricingEstimate: pricing ? { ...pricing, model: submittedModel } : pricing,
      ...fixedBilling,
    }, "advanced-submit");
  } catch (error) {
    console.warn("[advanced-generation-job-error]", taskId, error.stack || error.message || error);
    try {
      await updateGenerationRecord(taskId, {
        status: "failed",
        awaitingUpstreamTask: false,
        error: error.message || "Advanced generation failed.",
        billingError: "",
        failedAt: new Date().toISOString(),
        provider: runtime.providerName,
        source: runtime.recordSource,
        model: runtime.model,
        kind: "advanced-video",
        params: requestParams,
        upstreamPayload: error.upstreamPayload || payload || null,
        pricingEstimate: pricing,
        preDeductedCredits: cost,
        originalPreDeductedCredits: pricing?.originalCredits ?? cost,
        userPricingMultiplier: pricing?.userPricingMultiplier ?? 1,
        templateId: caseId || "",
        templateTitle: caseTitle || "Advanced generation",
      }, "advanced-failed");
    } catch (updateError) {
      console.error("[advanced-generation-fail-update-error]", taskId, updateError.message || updateError);
    }
  }
}

function byteplusRequestId() {
  return `req-${crypto.randomBytes(12).toString("hex")}`;
}

function byteplusErrorPayload({ code = "InvalidParameter", message = "Invalid parameter.", param = "", type = "BadRequest" } = {}) {
  return { error: { code, message, param, type } };
}

function byteplusHttpError(statusCode = 400, message = "Invalid parameter.", param = "", code = "InvalidParameter") {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.code = code;
  error.param = param;
  if (param) error.details = { param };
  error.byteplusError = byteplusErrorPayload({
    code,
    message,
    param,
    type: statusCode === 404 ? "NotFound" : "BadRequest",
  });
  return error;
}

function sendByteplusError(res, statusCode = 400, error = {}) {
  const payload = error?.byteplusError || byteplusErrorPayload({
    code: error?.code || (statusCode === 404 ? "ResourceNotFound" : "InvalidParameter"),
    message: error?.message || "Invalid parameter.",
    param: error?.param || "",
    type: statusCode === 404 ? "NotFound" : "BadRequest",
  });
  return sendJson(res, statusCode, payload);
}

function captureJsonResponse() {
  return {
    statusCode: 200,
    headers: {},
    body: "",
    writeHead(statusCode, headers = {}) {
      this.statusCode = Number(statusCode || 200);
      this.headers = headers || {};
      return this;
    },
    end(chunk) {
      if (chunk !== undefined && chunk !== null) {
        this.body += Buffer.isBuffer(chunk) ? chunk.toString("utf8") : String(chunk);
      }
      return this;
    },
  };
}

function capturedJsonPayload(captured = {}) {
  try {
    return captured.body ? JSON.parse(captured.body) : {};
  } catch {
    return {};
  }
}

function byteplusNestedMediaUrl(item = {}, type = "") {
  if (!item || typeof item !== "object") return "";
  if (type === "image_url") return nestedMediaUrl(item.image_url) || nestedMediaUrl(item.imageUrl) || nestedMediaUrl(item.url) || nestedMediaUrl(item);
  if (type === "video_url") return nestedMediaUrl(item.video_url) || nestedMediaUrl(item.videoUrl) || nestedMediaUrl(item.url) || nestedMediaUrl(item);
  if (type === "audio_url") return nestedMediaUrl(item.audio_url) || nestedMediaUrl(item.audioUrl) || nestedMediaUrl(item.url) || nestedMediaUrl(item);
  return nestedMediaUrl(item.url) || nestedMediaUrl(item);
}

function byteplusLocalAssetFromUri(auth = {}, uri = "") {
  const text = String(uri || "").trim();
  if (!text.startsWith("asset://")) return null;
  const id = text.slice("asset://".length).trim();
  if (!id) return null;
  return (auth.db?.userAssets || []).find((asset) => asset.id === id && asset.userId === auth.user?.id && !isSoftDeleted(asset)) || null;
}

function byteplusAssetIdFromUri(uri = "") {
  const text = String(uri || "").trim();
  return text.startsWith("asset://") ? text.slice("asset://".length).trim() : "";
}

function pushByteplusV3AssetReference(auth, target, role, url, param, item = {}) {
  const value = String(url || "").trim();
  if (!value) throw byteplusHttpError(400, `${param} is required.`, param);
  try {
    const kind = role === "reference_video" ? "video" : role === "reference_audio" ? "audio" : "image";
    assertSeedanceMediaUrl(value, param, { kind });
  } catch (error) {
    throw byteplusHttpError(400, error.message || `${param} is not valid.`, param, error.code || "InvalidParameter");
  }

  const localAsset = byteplusLocalAssetFromUri(auth, value);
  const localAssetId = localAsset?.id || "";
  const requestedAssetId = byteplusAssetIdFromUri(value);
  if (requestedAssetId && !localAsset) {
    throw byteplusHttpError(404, `The specified asset ${requestedAssetId} is not found.`, param, "ResourceNotFound");
  }
  const passthroughAssetUri = localAsset?.byteplusUpstreamAsset
    ? String(localAsset.assetUri || localAsset.seedanceVideoAssetUri || localAsset.seedanceAudioAssetUri || value).trim()
    : "";
  if (localAsset && !passthroughAssetUri) {
    if (role === "first_frame") {
      target.firstFrameAssetId = localAssetId;
      return;
    }
    if (role === "last_frame") {
      target.endImageAssetId = localAssetId;
      return;
    }
    if (role === "reference_video") {
      target.referenceVideoAssetIds.push(localAssetId);
      return;
    }
    if (role === "reference_audio") {
      target.referenceAudioAssetIds.push(localAssetId);
      return;
    }
    target.referenceImages.push({ assetId: localAssetId, fileName: item.fileName || item.name || localAsset.name || "" });
    return;
  }

  const directValue = passthroughAssetUri || value;

  if (role === "first_frame") {
    target.image_url = directValue;
    return;
  }
  if (role === "last_frame") {
    target.end_image_url = directValue;
    return;
  }
  if (role === "reference_video") {
    target.referenceVideoUrls.push(directValue);
    return;
  }
  if (role === "reference_audio") {
    target.referenceAudioUrls.push(directValue);
    return;
  }
  if (directValue.startsWith("asset://")) {
    target.referenceImageAssetUris.push(directValue);
    return;
  }
  target.referenceImages.push({ url: directValue, fileName: item.fileName || item.name || "" });
}

