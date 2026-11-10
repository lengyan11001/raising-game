function advancedPreparationErrorMessage(error = {}) {
  const code = String(error.code || "").trim();
  if (code === "ASSET_FILE_MISSING") {
    return "The reference media is no longer available. Please re-upload it and try again.";
  }
  if (code === "R2_PUBLIC_NOT_READY") {
    return "Reference media is still being prepared. Please try again shortly.";
  }
  return publicModelText(error.message || "Reference media could not be prepared.");
}

function advancedReferenceAssetNotFound(kind = "image", assetId = "") {
  const normalizedKind = ["video", "audio"].includes(kind) ? kind : "image";
  const error = advancedValidationError(
    `REFERENCE_${normalizedKind.toUpperCase()}_NOT_FOUND`,
    `Reference ${normalizedKind} not found.`,
    assetId ? { assetId, missingAssetIds: [assetId] } : {},
  );
  error.statusCode = 404;
  return error;
}

async function recordAdvancedPreparationFailure(req, res, auth, {
  body = {},
  provider = "",
  runtime = {},
  requestParams = {},
  userAsset = null,
  extraUserAssets = [],
  error = {},
  failureStage = "preparation",
} = {}) {
  const taskId = localGenerationTaskId("cgt");
  const message = advancedPreparationErrorMessage(error);
  const record = await upsertGenerationRecord({
    taskId,
    status: "failed",
    failureStage,
    preparationErrorCode: String(error.code || "MEDIA_PREPARATION_FAILED"),
    error: message,
    model: String(runtime.model || requestParams.model || ""),
    provider: String(runtime.providerName || provider || ""),
    source: String(runtime.recordSource || "advanced"),
    kind: "advanced-video",
    templateId: String(firstPresent(body.caseId, body.templateId, "") || ""),
    templateTitle: String(firstPresent(body.caseTitle, "") || "Advanced generation"),
    userId: auth.user.id,
    userAssetId: userAsset?.id || "",
    mediaMode: String(requestParams.mediaMode || requestParams.seedanceMode || ""),
    mediaAssets: userAsset ? [{
      type: "reference_image",
      userAssetId: userAsset.id,
      localUrl: userAsset.localUrl || "",
      imageUrl: userAsset.localUrl || userAsset.publicUrl || "",
    }, ...extraUserAssets.map((asset) => ({
      type: "reference_image",
      userAssetId: asset.id,
      localUrl: asset.localUrl || "",
      imageUrl: asset.localUrl || asset.publicUrl || "",
    }))] : [],
    prompt: String(firstPresent(body.prompt, body.promptText, body.params?.prompt, "") || ""),
    finalPrompt: String(firstPresent(body.prompt, body.promptText, body.params?.prompt, "") || ""),
    params: requestParams,
    ratio: String(requestParams.ratio || ""),
    resolution: String(requestParams.resolution || ""),
    duration: requestParams.duration,
    quality: runtime.quality || "",
    remoteVideoUrl: "",
    localVideoUrl: "",
    preDeductedCredits: 0,
    originalPreDeductedCredits: 0,
    finalCredits: 0,
    originalFinalCredits: 0,
    billingStatus: "free",
    awaitingUpstreamTask: false,
    apiTokenId: auth.tokenRecord?.id || "",
    apiTokenName: auth.tokenRecord?.name || "",
    apiTokenType: auth.tokenRecord?.quotaType || "",
    apiTokenSource: auth.tokenSource || "",
  });
  console.warn("[advanced-preparation-failed]", taskId, error.code || "MEDIA_PREPARATION_FAILED", error.message || message);
  return { taskId, record, message, statusCode: error.statusCode || 400 };
}

async function sendAdvancedRequestFailure(req, res, auth, {
  body = {},
  provider = "",
  runtime = {},
  requestParams = {},
  userAsset = null,
  extraUserAssets = [],
  error = {},
  code = "",
  statusCode,
  response = {},
} = {}) {
  const failed = await recordAdvancedPreparationFailure(req, res, auth, {
    body,
    provider,
    runtime,
    requestParams,
    userAsset,
    extraUserAssets,
    error,
  });
  return sendJson(res, statusCode || failed.statusCode, {
    ok: false,
    code: code || error.code || "INVALID_ADVANCED_REQUEST",
    message: failed.message,
    ...response,
    taskId: failed.taskId,
  });
}

async function handleAdvancedGenerate(req, res) {
  const auth = await requireUser(req, res, { loadDb: true, includeUserAssets: false, loadCurrentUserAssets: true });
  if (!auth) return;
  if (!await enforceBusinessRateLimit(req, res, auth, { action: "advanced_generate", limit: 30, windowMs: 10 * 60_000 })) return;
  const externalApiCaller = auth.tokenSource === "api_token" || auth.tokenSource === "subtoken" || auth.isApiToken === true;

  const body = await readJson(req, JSON_MEDIA_BODY_MAX_BYTES);
  const config = await readAppConfig();
  const advanced = config.platform?.advanced || {};
  const cases = Array.isArray(advanced.cases) ? advanced.cases : [];
  const bodyParams = requestParamsFromBody(body);
  const requestSource = String(firstPresent(body.source, bodyParams.source, "") || "").trim().toLowerCase();
  const requestedTemplateId = String(firstPresent(body.templateId, bodyParams.templateId, "") || "").trim();
  const playfluxTemplate = requestSource === "playflux" && requestedTemplateId
    ? (Array.isArray(config.playfluxTemplates) ? config.playfluxTemplates : []).find((item) => item.id === requestedTemplateId)
    : null;
  const selectedCase = cases.find((item) => item.id === String(firstPresent(body.caseId, bodyParams.caseId, "")).trim()) || playfluxTemplate;
  const caseParams = selectedCase?.params && typeof selectedCase.params === "object" ? selectedCase.params : {};
  const mergedBodyBase = mergedRequestForMedia(body, caseParams);
  const requestedModel = firstPresent(body.model, bodyParams.model, caseParams.model);
  const requestedSeedanceTier = seedanceModelAliasKind(requestedModel) || firstPresent(
    body.seedanceTier,
    body.vipeak2Tier,
    bodyParams.seedanceTier,
    bodyParams.vipeak2Tier,
    caseParams.seedanceTier,
    caseParams.vipeak2Tier,
  );
  const requestTenant = requestTenantDescriptor(req);
  const isToolVideoTemplateRequest = requestTenant.toolId === "video";
  const isPlayfluxVideoTemplateRequest = requestSource === "playflux" && String(firstPresent(
    selectedCase?.tab,
    bodyParams.templateTab,
    body.params?.templateTab,
    "",
  ) || "").trim().toLowerCase() === "video";
  const isVideoTemplateRequest = isToolVideoTemplateRequest || isPlayfluxVideoTemplateRequest;
  const forcePlayfluxWan27VideoEdit = isPlayfluxVideoTemplateRequest;
  const toolVideoProvider = isToolVideoTemplateRequest
    ? "seedance"
    : (["seedance", "wan30", "happyhorse", "wan27"].includes(requestTenant.videoProvider)
      ? requestTenant.videoProvider
      : "wan27");
  const requestedCreateMode = String(firstPresent(body.createMode, body.create_mode, bodyParams.createMode, bodyParams.create_mode, caseParams.createMode, "") || "").trim().toLowerCase();
  const isVideoReplacementRequest = isToolVideoTemplateRequest || ["video-image", "video-replace", "playflux-video"].includes(requestedCreateMode);
  const providerHint = firstPresent(
    isToolVideoTemplateRequest ? toolVideoProvider : "",
    isVideoReplacementRequest ? "seedance" : "",
    forcePlayfluxWan27VideoEdit ? "wan27" : "",
    body.provider,
    bodyParams.provider,
    selectedCase?.provider,
    caseParams.provider,
    caseParams.modelProvider,
    caseParams.model_provider,
  );
  const provider = normalizeAdvancedProvider(firstPresent(
    providerHint,
    seedanceModelAliasKind(requestedModel) ? "seedance" : "",
  ));
  if (publicAliyunModelBlockedForRequest(req, provider)) {
    return sendAdvancedRequestFailure(req, res, auth, {
      body: mergedBodyBase,
      provider,
      runtime: { model: String(requestedModel || ""), providerName: provider, recordSource: "advanced-validation" },
      requestParams: { provider, model: String(requestedModel || "") },
      error: advancedValidationError("MODEL_TEMPORARILY_UNAVAILABLE", "This model is temporarily unavailable."),
      statusCode: 404,
    });
  }
  try {
    assertExplicitAdvancedProvider(providerHint);
  } catch (error) {
    return sendAdvancedRequestFailure(req, res, auth, {
      body: mergedBodyBase,
      provider,
      runtime: { model: String(requestedModel || ""), providerName: provider, recordSource: "advanced-validation" },
      requestParams: { provider, model: String(requestedModel || "") },
      error,
    });
  }
  let prompt = String(firstPresent(
    body.prompt,
    bodyParams.prompt,
    selectedCase?.prompt,
    caseParams.prompt,
    provider === "seedance" ? seedancePromptFromContent(mergedBodyBase.content) : "",
    "",
  )).trim();
  if (isVegaProvider(provider)) {
    return await handleAdvancedVegaGenerate(req, res, {
      auth,
      body,
      bodyParams,
      caseParams,
      selectedCase,
      config,
      prompt,
      provider,
    });
  }
  const canUseIgnexSeedance = provider === "seedance" && !USE_GATEWAY_UPSTREAM && seedanceIgnexEnabledForUser(auth.user);
  if (USE_GATEWAY_UPSTREAM && !UPSTREAM_API_TOKEN) {
    return sendAdvancedRequestFailure(req, res, auth, {
      body: mergedBodyBase,
      provider,
      runtime: { model: String(requestedModel || ""), providerName: provider, recordSource: "advanced-validation" },
      requestParams: { provider, model: String(requestedModel || "") },
      error: advancedValidationError("GATEWAY_TOKEN_NOT_CONFIGURED", "Gateway upstream token is not configured."),
      statusCode: 503,
    });
  }
  if (!USE_GATEWAY_UPSTREAM && provider === "seedance" && !ARK_API_KEY && !canUseIgnexSeedance) {
    return sendAdvancedRequestFailure(req, res, auth, {
      body: mergedBodyBase,
      provider,
      runtime: { model: String(requestedModel || ""), providerName: provider, recordSource: "advanced-validation" },
      requestParams: { provider, model: String(requestedModel || "") },
      error: advancedValidationError("MISSING_ARK_API_KEY", "Seedance generation is not configured."),
      statusCode: 503,
    });
  }
  if (provider === SEEDANCE25_DIRECT_PROVIDER && !ARK_API_KEY) {
    return sendAdvancedRequestFailure(req, res, auth, {
      body: mergedBodyBase,
      provider,
      runtime: { model: String(requestedModel || ""), providerName: provider, recordSource: "advanced-validation" },
      requestParams: { provider, model: String(requestedModel || "") },
      error: advancedValidationError("MISSING_ARK_API_KEY", `${SEEDANCE25_DIRECT_LABEL} generation is not configured.`),
      statusCode: 503,
    });
  }
  const aliyunProviderConfigured = provider === "wan30" ? Boolean(ALIYUN_WAN30_API_KEY) : Boolean(ALIYUN_DASHSCOPE_API_KEY);
  if (!USE_GATEWAY_UPSTREAM && isAliyunVideoProvider(provider) && !aliyunProviderConfigured) {
    const code = provider === "wan30" ? "MISSING_ALIYUN_WAN30_API_KEY" : "MISSING_ALIYUN_DASHSCOPE_API_KEY";
    return sendAdvancedRequestFailure(req, res, auth, {
      body: mergedBodyBase,
      provider,
      runtime: { model: String(requestedModel || ""), providerName: provider, recordSource: "advanced-validation" },
      requestParams: { provider, model: String(requestedModel || "") },
      error: advancedValidationError(code, `${publicProviderLabel(provider)} generation is not configured.`),
      statusCode: 503,
    });
  }
  let mergedBody = mergedBodyBase;
  let seedanceContentExpanded = false;
  if (provider === "seedance") {
    try {
      seedanceContentExpanded = seedanceContentHasMedia(mergedBodyBase.content);
      mergedBody = seedanceBodyWithContentMediaFields(mergedBodyBase);
    } catch (error) {
      return sendAdvancedRequestFailure(req, res, auth, {
        body: mergedBodyBase,
        provider,
        runtime: { model: String(requestedModel || ""), providerName: provider, recordSource: "advanced-validation" },
        requestParams: { provider, model: String(requestedModel || "") },
        error,
      });
    }
  }
  if (isVideoReplacementRequest && provider !== "z-image-spicy-pro") prompt = VIDEO_REPLACE_PROMPT;
  if (!prompt && !["wan30", SEEDANCE25_DIRECT_PROVIDER].includes(provider)) {
    return sendAdvancedRequestFailure(req, res, auth, {
      body: mergedBody,
      provider,
      runtime: { model: String(requestedModel || ""), providerName: provider, recordSource: "advanced-validation" },
      requestParams: { provider, model: String(requestedModel || "") },
      error: advancedValidationError("PROMPT_REQUIRED", "Prompt is required."),
    });
  }
  if (["qwen37-flash", "byteplus-language", "papaya"].includes(provider)) {
    return await handleAdvancedQwen37FlashGenerate(req, res, {
      auth,
      body,
      bodyParams,
      caseParams,
      selectedCase,
      config,
      prompt,
      provider,
    });
  }
  if (provider === "qwen-image3") {
    return await handleAdvancedQwenImage3Generate(req, res, {
      auth,
      body,
      bodyParams,
      caseParams,
      selectedCase,
      config,
      prompt,
    });
  }
  if (provider === "seedream5-image") {
    return await handleAdvancedSeedream5ImageGenerate(req, res, {
      auth,
      body,
      bodyParams,
      caseParams,
      selectedCase,
      config,
      prompt,
    });
  }
  if (provider === "z-image-spicy-pro") {
    return await handleAdvancedZImageSpicyProGenerate(req, res, {
      auth,
      body,
      bodyParams,
      caseParams,
      selectedCase,
      config,
      prompt,
      provider,
    });
  }
  if (["seedance25", SEEDANCE25_DIRECT_PROVIDER].includes(provider)) {
    return await handleAdvancedSeedance25Generate(req, res, {
      auth,
      body,
      bodyParams,
      caseParams,
      selectedCase,
      config,
      prompt,
      provider,
    });
  }
  const durationBounds = advancedDurationBounds(provider);
  const mergedProviderParameters = {
    ...plainObject(caseParams.parameters),
    ...plainObject(bodyParams.parameters),
    ...plainObject(body.parameters),
  };
  const rawDurationInput = firstPresent(body.duration, body.durationSeconds, bodyParams.duration, bodyParams.durationSeconds, mergedProviderParameters.duration, caseParams.duration);
  const rawResolutionInput = firstPresent(body.resolution, bodyParams.resolution, mergedProviderParameters.resolution, caseParams.resolution);
  const rawRatioInput = firstPresent(body.ratio, body.aspect_ratio, bodyParams.ratio, bodyParams.aspect_ratio, caseParams.ratio, caseParams.aspect_ratio);
  try {
    assertAdvancedDurationInput(provider, rawDurationInput);
    assertAdvancedResolutionInput(provider, rawResolutionInput, {
      seedanceTier: requestedSeedanceTier,
      videoCapability: firstPresent(body.videoCapability, body.aliyunVideoCapability, body.wanCapability, body.capability, bodyParams.videoCapability, bodyParams.aliyunVideoCapability, bodyParams.wanCapability, caseParams.videoCapability, caseParams.wanCapability),
    });
    assertAdvancedRatioInput(rawRatioInput, provider);
  } catch (error) {
    return sendAdvancedRequestFailure(req, res, auth, {
      body: mergedBody,
      provider,
      runtime: { model: String(requestedModel || ""), providerName: provider, recordSource: "advanced-validation" },
      requestParams: { provider, model: String(requestedModel || "") },
      error,
    });
  }

  const requestParams = {
    ...caseParams,
    ...bodyParams,
    provider,
    preserveUserPrompt: isAdvancedCustomPrompt(mergedBodyBase),
    seedanceTier: normalizeSeedanceTier(requestedSeedanceTier),
    ratio: firstPresent(body.ratio, body.aspect_ratio, bodyParams.ratio, bodyParams.aspect_ratio, caseParams.ratio, caseParams.aspect_ratio, provider === "wan30" ? "adaptive" : config.video.ratio, provider === "wan30" ? "adaptive" : "9:16"),
    resolution: firstPresent(body.resolution, bodyParams.resolution, mergedProviderParameters.resolution, caseParams.resolution, provider === "wan30" ? "1080p" : config.video.resolution, provider === "wan30" ? "1080p" : "720p"),
    duration: provider === "wan30" && Number(rawDurationInput) === -1
      ? -1
      : clampNumber(
          rawDurationInput,
          config.video.duration || durationBounds.fallback,
          durationBounds.min,
          durationBounds.max,
        ),
    generateAudio: boolFromRequest(firstPresent(body.generateAudio, body.generate_audio, bodyParams.generateAudio, bodyParams.generate_audio, caseParams.generateAudio, caseParams.generate_audio), true),
    prompt_extend: provider === "wan30"
      ? boolFromRequest(firstPresent(body.prompt_extend, body.promptExtend, bodyParams.prompt_extend, bodyParams.promptExtend, mergedProviderParameters.prompt_extend, mergedProviderParameters.promptExtend, caseParams.prompt_extend, caseParams.promptExtend), true)
      : undefined,
  };
  if (isVideoReplacementRequest) {
    requestParams.model = TOOL_VIDEO_SEEDANCE_MODEL;
    requestParams.seedanceTier = "standard";
    requestParams.seedanceMode = "reference_video";
    requestParams.ratio = "9:16";
    requestParams.resolution = "720p";
    requestParams.duration = 6;
    requestParams.generateAudio = true;
    requestParams.generate_audio = true;
    requestParams.watermark = false;
  }
  requestParams.ratio = normalizeVideoRatio(requestParams.ratio);
  requestParams.resolution = isAliyunVideoProvider(provider)
    ? (normalizeWan27Resolution(requestParams.resolution) || (provider === "wan30" ? "1080P" : "720P"))
    : normalizeAdvancedResolution(requestParams.resolution);
  requestParams.preprocessReference = provider === "seedance" && boolFromRequest(firstPresent(
    body.preprocessReference,
    bodyParams.preprocessReference,
    caseParams.preprocessReference,
  ), false);
  requestParams.seed = normalizeOptionalSeed(firstPresent(body.seed, bodyParams.seed, mergedProviderParameters.seed, caseParams.seed));
  const normalizedSeedanceModel = provider === "seedance"
    ? seedanceConfiguredModelForRequest(requestedModel, requestParams.seedanceTier)
    : "";
  const forwardModelToGateway = provider !== "seedance" && requestedModel !== undefined;
  const requestedVideoCapability = firstPresent(
    isToolVideoTemplateRequest ? toolVideoDefaultCapability(toolVideoProvider) : "",
    forcePlayfluxWan27VideoEdit ? "wan27-video-edit" : "",
    body.videoCapability,
    body.aliyunVideoCapability,
    body.wanCapability,
    body.happyhorseCapability,
    bodyParams.videoCapability,
    bodyParams.aliyunVideoCapability,
    caseParams.videoCapability,
    caseParams.wanCapability,
    caseParams.happyhorseCapability,
    provider === "wan27" ? "wan27-i2v" : "",
    provider === "happyhorse" ? "happyhorse-i2v" : "",
    provider === "wan30" && ["wan3.0-video-prime-pro", "wan30-video-prime-pro"].includes(String(requestedModel || "").trim().toLowerCase())
      ? "wan30-video-prime-pro"
      : provider === "wan30" && ["wan3.0-video-pro", "wan30-video-pro"].includes(String(requestedModel || "").trim().toLowerCase())
      ? "wan30-video-pro"
      : provider === "wan30" && String(requestedModel || "").trim().toLowerCase() === ALIYUN_WAN30_PRIME_MODEL.toLowerCase()
      ? "wan30-video-prime"
      : provider === "wan30" ? "wan30-video" : "",
  );
  requestParams.videoCapability = isAliyunVideoProvider(provider)
    ? normalizeAliyunVideoCapability(requestedVideoCapability, { provider, model: provider === "wan30" ? "" : requestedModel })
    : "";
  if (isAliyunVideoProvider(provider)) {
    try {
      assertAdvancedResolutionInput(provider, requestParams.resolution, {
        seedanceTier: requestParams.seedanceTier,
        videoCapability: requestParams.videoCapability,
      });
    } catch (error) {
      return sendAdvancedRequestFailure(req, res, auth, {
        body: mergedBody,
        provider,
        runtime: { model: requestParams.model, providerName: provider, recordSource: "advanced-validation" },
        requestParams,
        error,
      });
    }
  }
  requestParams.followInputDuration = requestParams.videoCapability === "wan27-video-edit"
    && boolFromRequest(firstPresent(body.followInputDuration, bodyParams.followInputDuration), false);
  requestParams.model = provider === "seedance"
    ? (isVideoReplacementRequest ? TOOL_VIDEO_SEEDANCE_MODEL : normalizedSeedanceModel)
    : provider === "wan30"
      ? aliyunVideoModelForCapability(requestParams.videoCapability)
      : String(firstPresent(requestedModel, aliyunVideoModelForCapability(requestParams.videoCapability)));
  requestParams.input = plainObject(firstPresent(body.input, bodyParams.input, caseParams.input, {}));
  requestParams.parameters = mergedProviderParameters;
  if (provider === "seedance" && requestParams.seedanceTier === "fast" && requestParams.resolution === "1080p") {
    return sendAdvancedRequestFailure(req, res, auth, {
      body: mergedBody,
      provider,
      runtime: { model: requestParams.model, providerName: provider, recordSource: "advanced-validation" },
      requestParams,
      error: advancedValidationError("INVALID_SEEDANCE_FAST_RESOLUTION", "Seedance Fast does not support 1080p."),
    });
  }
  if (provider === "seedance" && requestParams.seedanceTier === "fast" && requestParams.resolution === "4k") {
    return sendAdvancedRequestFailure(req, res, auth, {
      body: mergedBody,
      provider,
      runtime: { model: requestParams.model, providerName: provider, recordSource: "advanced-validation" },
      requestParams,
      error: advancedValidationError("INVALID_SEEDANCE_FAST_RESOLUTION", "Seedance Fast does not support 4K."),
    });
  }
  if (provider === "seedance") {
    [
        "image_url",
        "end_image_url",
        "referenceImages",
        "reference_images",
        "referenceVideoUrls",
        "reference_videos",
        "referenceAudioUrls",
        "reference_audios",
        "content",
      "web_search",
      "webSearch",
      "callback_url",
      "return_last_frame",
      "service_tier",
      "execution_expires_after",
      "draft",
      "safety_identifier",
      "priority",
      "watermark",
      "seed",
      "frames",
      "fps",
      "camera_fixed",
    ].forEach((field) => {
      const value = field === "content" && seedanceContentExpanded
        ? undefined
        : firstPresent(mergedBody[field], body[field], bodyParams[field], caseParams[field]);
      if (value !== undefined) requestParams[field] = value;
    });
    if (seedanceContentExpanded) delete requestParams.content;
  }
  let userAsset = null;
  let extraUserAssets = [];
  let extraUserAssetIds = [];
  let seedanceVideoAsset = null;
  let seedanceVideoAssets = [];
  let seedanceAudioAssets = [];
  let referenceVideoAssetIds = [];
  let referenceVideoAssetUris = [];
  let referenceAudioAssetUris = [];
  let referenceAudioAssetIds = [];
  let referenceImageAssetUris = [];
  let seedanceMode = "";
  let seedanceFirstFrameAsset = null;
  let seedanceEndFrameAsset = null;
  const preservePublicMediaUrls = requestParams.preprocessReference !== true && boolFromRequest(firstPresent(
    body.preservePublicMediaUrls,
    bodyParams.preservePublicMediaUrls,
  ), false);
  try {
  if (provider === "seedance") {
    seedanceMode = isVideoReplacementRequest
      ? "reference_video"
      : normalizeSeedanceMode(firstPresent(body.seedanceMode, body.vipeak2Mode, body.mediaMode, bodyParams.seedanceMode, bodyParams.vipeak2Mode, bodyParams.mediaMode, caseParams.seedanceMode, caseParams.vipeak2Mode, caseParams.mediaMode), mergedBody);
    requestParams.seedanceMode = seedanceMode;
    const firstFrameInput = seedanceFirstFrameInputFromBody(mergedBody, {
      includeDataUrlFallback: seedanceModeNeedsFirstFrame(seedanceMode),
      includeUserAssetId: seedanceModeNeedsFirstFrame(seedanceMode),
    });
    const endFrameInput = seedanceEndFrameInputFromBody(mergedBody);
    const firstFramePublicUrl = preservePublicMediaUrls && isPublicHttpUrl(firstFrameInput?.url)
      ? publicHttpUrlForUpstream(firstFrameInput.url)
      : "";
    const endFramePublicUrl = preservePublicMediaUrls && isPublicHttpUrl(endFrameInput?.url)
      ? publicHttpUrlForUpstream(endFrameInput.url)
      : "";
    if (seedanceModeNeedsFirstFrame(seedanceMode)) {
      seedanceFirstFrameAsset = firstFramePublicUrl
        ? null
        : await createSingleSeedanceImageAssetFromInput(auth.db, auth.user, firstFrameInput, { name: "Seedance first frame" });
      const rawFirstFrameUrl = String(firstPresent(firstFramePublicUrl, mergedBody.image_url, mergedBody.firstFrameRawUrl, "") || "").trim();
      if (rawFirstFrameUrl) requestParams.image_url = rawFirstFrameUrl;
      if (!seedanceFirstFrameAsset && !rawFirstFrameUrl) {
        throw advancedValidationError("SEEDANCE_FIRST_FRAME_REQUIRED", "Seedance image-to-video requires imageUrl, firstFrameUrl, imageAssetId, firstFrameAssetId, or dataUrl.");
      }
    }
    if (seedanceModeNeedsEndFrame(seedanceMode)) {
      seedanceEndFrameAsset = endFramePublicUrl
        ? null
        : await createSingleSeedanceImageAssetFromInput(auth.db, auth.user, endFrameInput, { name: "Seedance end frame" });
      const rawEndFrameUrl = String(firstPresent(endFramePublicUrl, mergedBody.end_image_url, mergedBody.endImageRawUrl, "") || "").trim();
      if (rawEndFrameUrl) requestParams.end_image_url = rawEndFrameUrl;
      if (!seedanceEndFrameAsset && !rawEndFrameUrl) {
        throw advancedValidationError("SEEDANCE_END_FRAME_REQUIRED", "Seedance first/last-frame mode requires endImageUrl, lastFrameUrl, endImageAssetId, lastFrameAssetId, or endImageDataUrl.");
      }
    } else if (endFrameInput) {
      seedanceEndFrameAsset = await createSingleSeedanceImageAssetFromInput(auth.db, auth.user, endFrameInput, { name: "Seedance end frame" });
      if (seedanceEndFrameAsset) {
        seedanceMode = "first_last_frame";
        requestParams.seedanceMode = seedanceMode;
      }
    }
    referenceVideoAssetIds = seedanceReferenceVideoAssetIdsFromBody(mergedBody);
    if (referenceVideoAssetIds.length) {
      seedanceVideoAsset = auth.db.userAssets.find((asset) => asset.id === referenceVideoAssetIds[0] && asset.userId === auth.user.id && !isSoftDeleted(asset));
      if (!seedanceVideoAsset) throw advancedReferenceAssetNotFound("video", referenceVideoAssetIds[0]);
      try {
        validateWan27MediaKind(seedanceVideoAsset, "video", "Seedance reference video");
      } catch (error) {
        throw advancedValidationError("INVALID_REFERENCE_VIDEO", publicModelText(error.message || "Seedance reference video must be a video."));
      }
      seedanceVideoAssets = referenceVideoAssetIds.map((assetId) => auth.db.userAssets.find((asset) => asset.id === assetId && asset.userId === auth.user.id && !isSoftDeleted(asset)));
      if (seedanceVideoAssets.some((asset) => !asset)) throw advancedReferenceAssetNotFound("video", referenceVideoAssetIds[seedanceVideoAssets.findIndex((asset) => !asset)] || "");
      try {
        seedanceVideoAssets.forEach((asset) => validateWan27MediaKind(asset, "video", "Seedance reference video"));
      } catch (error) {
        throw advancedValidationError("INVALID_REFERENCE_VIDEO", publicModelText(error.message || "Seedance reference video must be a video."));
      }
    }
    try {
      referenceImageAssetUris = seedanceReferenceAssetUrisFromBody(mergedBody);
      if (referenceImageAssetUris.length) requestParams.referenceImageAssetUris = referenceImageAssetUris;
    } catch (error) {
      throw advancedValidationError(error.code || "INVALID_REFERENCE_IMAGE_URI", publicModelText(error.message || "Seedance reference image assetUri is invalid."));
    }
    try {
      referenceVideoAssetUris = seedanceReferenceVideoUrlInputsFromBody(mergedBody);
      if (referenceVideoAssetUris.length) requestParams.reference_videos = referenceVideoAssetUris;
    } catch (error) {
      throw advancedValidationError(error.code || "INVALID_REFERENCE_VIDEO_URI", publicModelText(error.message || "Seedance reference video is invalid."));
    }
    try {
      referenceAudioAssetUris = seedanceReferenceAudioInputsFromBody(mergedBody);
      referenceAudioAssetIds = seedanceReferenceAudioAssetIdsFromBody(mergedBody);
    } catch (error) {
      throw advancedValidationError(error.code || "INVALID_REFERENCE_AUDIO_URI", publicModelText(error.message || "Seedance reference audio is invalid."));
    }
    if (referenceAudioAssetIds.length) {
      seedanceAudioAssets = referenceAudioAssetIds.map((assetId) => auth.db.userAssets.find((asset) => asset.id === assetId && asset.userId === auth.user.id && !isSoftDeleted(asset)));
      if (seedanceAudioAssets.some((asset) => !asset)) throw advancedReferenceAssetNotFound("audio", referenceAudioAssetIds[seedanceAudioAssets.findIndex((asset) => !asset)] || "");
      try {
        seedanceAudioAssets.forEach((asset) => validateWan27MediaKind(asset, "audio", "Seedance reference audio"));
      } catch (error) {
        throw advancedValidationError("INVALID_REFERENCE_AUDIO", publicModelText(error.message || "Seedance reference audio must be audio."));
      }
    }
    if (referenceAudioAssetUris.length) {
      requestParams.reference_audios = referenceAudioAssetUris;
    }
    const referenceInputs = seedanceReferenceInputsFromBody(mergedBody, { includeDataUrlFallback: !seedanceModeNeedsFirstFrame(seedanceMode) });
    const publicReferenceImageUrls = preservePublicMediaUrls
      ? referenceInputs.map((item) => {
          const value = typeof item === "string" ? item : firstPresent(item?.url, item?.imageUrl, item?.image_url, "");
          return isPublicHttpUrl(value) ? publicHttpUrlForUpstream(value) : "";
        }).filter(Boolean)
      : [];
    if (publicReferenceImageUrls.length) {
      referenceImageAssetUris = [...new Set([...referenceImageAssetUris, ...publicReferenceImageUrls])]
        .slice(0, ADVANCED_SEEDANCE_REFERENCE_LIMIT);
      requestParams.referenceImageAssetUris = referenceImageAssetUris;
    }
    const localReferenceInputs = referenceInputs.filter((item) => {
      const value = typeof item === "string" ? item : firstPresent(item?.url, item?.imageUrl, item?.image_url, "");
      return !preservePublicMediaUrls || !isPublicHttpUrl(value);
    });
    if (localReferenceInputs.length && referenceImageAssetUris.length) {
      const localReferenceUriKeys = new Set(localReferenceInputs.map((item) => {
        const value = typeof item === "string" ? item : firstPresent(item?.url, item?.imageUrl, item?.image_url, "");
        return isPublicHttpUrl(value) ? publicHttpUrlForUpstream(value) : "";
      }).filter(Boolean));
      referenceImageAssetUris = referenceImageAssetUris.filter((uri) => (
        !localReferenceUriKeys.has(isPublicHttpUrl(uri) ? publicHttpUrlForUpstream(uri) : uri)
      ));
      if (referenceImageAssetUris.length) requestParams.referenceImageAssetUris = referenceImageAssetUris;
      else delete requestParams.referenceImageAssetUris;
    }
    const createdReferenceAssets = await createUserImageAssetsFromInputs(auth.db, auth.user, localReferenceInputs, {
      name: selectedCase?.title || "Advanced reference",
    });
    if (createdReferenceAssets.length) {
      [userAsset, ...extraUserAssets] = createdReferenceAssets;
    } else {
      const referenceAssetIds = seedanceReferenceAssetIdsFromBody(mergedBody, {
        includeUserAssetId: !seedanceModeNeedsFirstFrame(seedanceMode),
        includeImageAssetId: !seedanceModeNeedsFirstFrame(seedanceMode),
      });
      if (referenceAssetIds.length) {
        const foundAssets = referenceAssetIds.map((assetId) => auth.db.userAssets.find((asset) => asset.id === assetId && asset.userId === auth.user.id && !isSoftDeleted(asset)));
        if (foundAssets.some((asset) => !asset)) throw advancedReferenceAssetNotFound("image", referenceAssetIds[foundAssets.findIndex((asset) => !asset)] || "");
        try {
          foundAssets.forEach((asset) => validateWan27MediaKind(asset, "image", "Seedance reference image"));
        } catch (error) {
          throw advancedValidationError("INVALID_REFERENCE_IMAGE", publicModelText(error.message || "Seedance reference image must be an image."));
        }
        [userAsset, ...extraUserAssets] = foundAssets;
      }
    }
    const seenSeedanceAssetIds = new Set([
      userAsset?.id,
      seedanceFirstFrameAsset?.id,
      seedanceEndFrameAsset?.id,
      ...extraUserAssets.map((asset) => asset?.id || ""),
    ].filter(Boolean));
    for (const assetId of seedanceExtraReferenceAssetIdsFromBody(mergedBody)) {
      if (seenSeedanceAssetIds.has(assetId) || extraUserAssets.length >= ADVANCED_SEEDANCE_REFERENCE_LIMIT - 1) continue;
      const asset = auth.db.userAssets.find((entry) => entry.id === assetId && entry.userId === auth.user.id && !isSoftDeleted(entry));
      if (!asset) throw advancedReferenceAssetNotFound("image", assetId);
      try {
        validateWan27MediaKind(asset, "image", "Extra reference image");
      } catch (error) {
        throw advancedValidationError("INVALID_REFERENCE_IMAGE", error.message || "Extra reference image must be an image.");
      }
      extraUserAssets.push(asset);
      seenSeedanceAssetIds.add(asset.id);
    }
    extraUserAssets = extraUserAssets.slice(0, Math.max(0, ADVANCED_SEEDANCE_REFERENCE_LIMIT - 1));
    extraUserAssetIds = extraUserAssets.map((asset) => asset.id);
    try {
      await validateSeedanceImageAssetsForRequest(auth.db, [
        seedanceFirstFrameAsset,
        seedanceEndFrameAsset,
        userAsset,
        ...extraUserAssets,
      ]);
      await validateSeedanceAdvancedMediaRules({
        requestParams,
        seedanceMode,
        seedanceFirstFrameAsset,
        seedanceEndFrameAsset,
        userAsset,
        extraUserAssets,
        referenceImageAssetUris,
        referenceVideoAssetIds,
        referenceVideoAssets: seedanceVideoAssets,
        referenceVideoAssetUris,
        referenceAudioAssetIds,
        referenceAudioAssetUris,
      });
    } catch (error) {
      const failed = await recordAdvancedPreparationFailure(req, res, auth, {
        body: mergedBody,
        provider,
        runtime: { model: requestParams.model, providerName: provider, recordSource: "advanced-seedance" },
        requestParams,
        userAsset,
        extraUserAssets,
        error,
      });
      return sendJson(res, failed.statusCode, {
        ok: false,
        code: error.code || "SEEDANCE_MEDIA_INVALID",
        message: failed.message,
        taskId: failed.taskId,
      });
    }
  } else {
    const firstFrameDataUrl = firstPresent(body.firstFrameDataUrl, body.first_frame_data_url, body.dataUrl, bodyParams.firstFrameDataUrl, bodyParams.first_frame_data_url, bodyParams.dataUrl);
    if (firstFrameDataUrl) {
      userAsset = await createUserWanMediaAssetFromDataUrl(auth.db, auth.user, {
        dataUrl: firstFrameDataUrl,
        fileName: firstPresent(body.firstFrameFileName, body.fileName, bodyParams.firstFrameFileName, bodyParams.fileName, ""),
        name: selectedCase?.title || "Advanced reference",
      });
    } else if (firstPresent(body.userAssetId, body.firstFrameAssetId, bodyParams.userAssetId, bodyParams.firstFrameAssetId)) {
      const firstAssetId = firstPresent(body.firstFrameAssetId, body.userAssetId, bodyParams.firstFrameAssetId, bodyParams.userAssetId);
      userAsset = auth.db.userAssets.find((asset) => asset.id === firstAssetId && asset.userId === auth.user.id && !isSoftDeleted(asset));
      if (!userAsset) throw advancedReferenceAssetNotFound("image", firstAssetId);
    }
  }
  } catch (error) {
    const failed = await recordAdvancedPreparationFailure(req, res, auth, {
      body: mergedBody,
      provider,
      runtime: { model: requestParams.model, providerName: provider, recordSource: "advanced-preparation" },
      requestParams,
      userAsset,
      extraUserAssets,
      error,
    });
    return sendJson(res, failed.statusCode, {
      ok: false,
      code: error.code || "MEDIA_PREPARATION_FAILED",
      message: failed.message,
      taskId: failed.taskId,
    });
  }
  let wan27MediaMode = "";
  let wan27Media = [];
  if (isAliyunVideoProvider(provider)) {
    const requestedWanMediaMode = firstPresent(
      body.mediaMode,
      body.wanMode,
      body.wanMediaMode,
      bodyParams.mediaMode,
      bodyParams.wanMode,
      bodyParams.wanMediaMode,
      caseParams.mediaMode,
      requestParams.videoCapability === "wan27-i2v" ? "first_frame" : requestParams.videoCapability,
    );
    requestParams.mediaMode = provider === "wan30"
      ? aliyunWan30MediaMode(mergedBody, requestedWanMediaMode, userAsset)
      : requestParams.videoCapability === "wan27-r2v"
        ? "wan27-r2v"
        : normalizeWan27MediaMode(requestedWanMediaMode);
    let resolved;
    try {
      resolved = await resolveAliyunVideoMedia({
        db: auth.db,
        user: auth.user,
        body: mergedBody,
        requestParams,
        fallbackAsset: userAsset,
        skipWan30Validation: externalApiCaller,
      });
    } catch (error) {
      const failed = await recordAdvancedPreparationFailure(req, res, auth, {
        body: mergedBody,
        provider,
        runtime: { model: requestParams.model, providerName: provider, recordSource: "advanced" },
        requestParams,
        userAsset,
        extraUserAssets,
        error,
      });
      return sendJson(res, failed.statusCode, {
        ok: false,
        code: error.code || "ALIYUN_MEDIA_PREPARATION_FAILED",
        message: failed.message,
        taskId: failed.taskId,
      });
    }
    wan27MediaMode = resolved.mediaMode || requestParams.videoCapability;
    wan27Media = resolved.media;
    const capabilityDefinition = ALIYUN_VIDEO_CAPABILITIES[requestParams.videoCapability];
    const billableVideos = wan27Media.filter((item) => ["video", "video_url", "reference_video", "first_clip"].includes(item.type));
    const shouldProbeBillableVideos = capabilityDefinition?.mediaKind === "animate"
      || capabilityDefinition?.billing === "input_output";
    const probedVideoDurations = [];
    if (shouldProbeBillableVideos) {
      for (const item of billableVideos) {
        probedVideoDurations.push(await probeVideoDurationSeconds(item.url) || 0);
      }
    }
    const primaryVideoDuration = probedVideoDurations[0] || 0;
    if (requestParams.videoCapability === "wan27-video-edit" && requestParams.followInputDuration && primaryVideoDuration > 0) {
      requestParams.duration = Math.max(2, Math.min(10, Math.ceil(primaryVideoDuration)));
    } else if (capabilityDefinition?.mediaKind === "animate" && primaryVideoDuration > 0) {
      requestParams.duration = clampNumber(primaryVideoDuration, requestParams.duration, 2, 30);
    } else if (isVideoTemplateRequest && requestParams.videoCapability === "wan27-r2v" && primaryVideoDuration > 0) {
      requestParams.duration = Math.max(2, Math.min(10, Math.round(primaryVideoDuration)));
    }
    if (capabilityDefinition?.billing === "input_output") {
      const probedInputSeconds = probedVideoDurations.reduce((sum, seconds) => sum + seconds, 0);
      const explicitInputSeconds = durationSecondsFromValue(firstPresent(
        body.inputVideoSeconds,
        body.videoInputSeconds,
        body.referenceVideoDurationSeconds,
        bodyParams.inputVideoSeconds,
        bodyParams.videoInputSeconds,
      ));
      const fallbackInputSeconds = billableVideos.length ? billableVideos.length * requestParams.duration : 0;
      requestParams.inputVideoSeconds = durationSecondsFromValue(Math.max(
        explicitInputSeconds,
        probedInputSeconds || fallbackInputSeconds,
      ));
    }
  }
  if (provider === "seedance") {
    requestParams.inputVideoSeconds = await seedanceVideoInputSecondsForPricingWithProbe(mergedBody, {
      requestParams,
      assets: seedanceVideoAssets,
      assetIds: referenceVideoAssetIds,
    });
  }
  const isPlayfluxVideoReferenceRequest = isPlayfluxVideoTemplateRequest && (
    (provider === "seedance" && seedanceModeNeedsReferenceVideo(seedanceMode))
    || (provider === "wan27" && requestParams.videoCapability === "wan27-video-edit")
  );
  if (isPlayfluxVideoReferenceRequest && provider !== "wan27" && !isVideoReplacementRequest) {
    prompt = enhancePlayfluxReferenceVideoPrompt(prompt, {
      hasReferenceImage: provider === "wan27"
        ? wan27Media.some((item) => ["first_frame", "reference_image"].includes(item.type))
        : Boolean(userAsset || extraUserAssets.length || referenceImageAssetUris.length),
      hasReferenceVideo: provider === "wan27"
        ? wan27Media.some((item) => ["video", "reference_video"].includes(item.type))
        : Boolean(referenceVideoAssetIds.length || referenceVideoAssetUris.length),
    });
  }
  if (isAliyunVideoProvider(provider)) {
    try {
      buildAliyunVideoRequest({
        provider,
        capability: requestParams.videoCapability,
        model: aliyunVideoModelForCapability(requestParams.videoCapability, requestParams.model),
        prompt,
        media: wan27Media,
        parameters: {
          ...plainObject(requestParams.parameters),
          resolution: requestParams.resolution,
          duration: requestParams.duration,
          ratio: requestParams.ratio,
          seed: requestParams.seed,
          mode: firstPresent(requestParams.parameters?.mode, requestParams.animateMode),
          audio: requestParams.generateAudio,
        },
      });
    } catch (error) {
      return sendAdvancedRequestFailure(req, res, auth, {
        body: mergedBody,
        provider,
        runtime: { model: requestParams.model, providerName: provider, recordSource: "advanced-validation" },
        requestParams,
        userAsset,
        extraUserAssets,
        error,
        code: error.code || "INVALID_VIDEO_INPUT",
        statusCode: error.statusCode || 400,
        response: { message: publicModelText(error.message || "Alibaba video input is invalid.") },
      });
    }
  }
  const rawPricing = advancedModelPricing(provider, {
    ...requestParams,
    advancedPricing: config.platform?.advancedPricing,
  });
  const videoPricing = applyUserPricingToEstimate(rawPricing, auth.user, pricingContextForAuth(auth));
  const preprocessPricing = seedancePreprocessPricingForAssets(
    auth,
    config,
    provider === "seedance"
      ? [userAsset, ...extraUserAssets, seedanceFirstFrameAsset, seedanceEndFrameAsset]
      : [],
    provider === "seedance" && requestParams.preprocessReference === true,
  );
  const pricing = {
    ...videoPricing,
    videoCredits: videoPricing.credits,
    baseVideoCredits: videoPricing.baseCredits,
    originalVideoCredits: videoPricing.originalCredits,
    preprocessReference: requestParams.preprocessReference === true,
    preprocessPricing,
    preprocessCredits: preprocessPricing.credits,
    basePreprocessCredits: preprocessPricing.baseCredits,
    originalPreprocessCredits: preprocessPricing.originalCredits,
    credits: creditsAmount(videoPricing.credits + preprocessPricing.credits),
    baseCredits: creditsAmount(videoPricing.baseCredits + preprocessPricing.baseCredits),
    originalCredits: creditsAmount(videoPricing.originalCredits + preprocessPricing.originalCredits),
  };
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
  const runtime = advancedRuntimeForProvider(provider, requestParams);
  const taskId = localGenerationTaskId("cgt");
  const primaryWanMedia = wan27Media.find((item) => ["first_frame", "first_clip", "reference_image", "image_url"].includes(item.type)) || wan27Media[0] || null;
  const seedancePrimaryVisual = seedanceFirstFrameAsset || userAsset || seedanceVideoAsset || null;
  const initialImageUrl = primaryWanMedia?.localUrl || primaryWanMedia?.url || seedancePrimaryVisual?.localUrl || seedancePrimaryVisual?.publicUrl || "";
  const initialSourceImageUrl = primaryWanMedia?.localUrl || seedanceFirstFrameAsset?.sourceImageUrl || seedanceFirstFrameAsset?.localUrl || userAsset?.sourceImageUrl || userAsset?.localUrl || "";
  const initialSeedanceMediaAssets = provider === "seedance"
    ? [
        ...(seedanceFirstFrameAsset ? [{
          type: "image_url",
          key: "image_url",
          userAssetId: seedanceFirstFrameAsset.id,
          imageUrl: seedanceFirstFrameAsset.localUrl || seedanceFirstFrameAsset.publicUrl || "",
          sourceImageUrl: seedanceFirstFrameAsset.sourceImageUrl || seedanceFirstFrameAsset.localUrl || "",
          localUrl: seedanceFirstFrameAsset.localUrl || "",
          mime: seedanceFirstFrameAsset.mime || "",
        }] : []),
        ...(seedanceEndFrameAsset ? [{
          type: "end_image_url",
          key: "end_image_url",
          userAssetId: seedanceEndFrameAsset.id,
          imageUrl: seedanceEndFrameAsset.localUrl || seedanceEndFrameAsset.publicUrl || "",
          sourceImageUrl: seedanceEndFrameAsset.sourceImageUrl || seedanceEndFrameAsset.localUrl || "",
          localUrl: seedanceEndFrameAsset.localUrl || "",
          mime: seedanceEndFrameAsset.mime || "",
        }] : []),
        ...seedanceVideoAssets.map((asset, index) => ({
          type: "reference_video",
          key: `video_${index + 1}`,
          userAssetId: asset.id,
          videoUrl: asset.localUrl || asset.publicUrl || "",
          localUrl: asset.localUrl || "",
          mime: asset.mime || "",
        })),
        ...referenceAudioAssetUris.map((uri, index) => ({
          type: "reference_audio",
          key: `audio_${index + 1}`,
          audioUrl: uri,
        })),
        ...seedanceAudioAssets.map((asset, index) => ({
          type: "reference_audio",
          key: `audio_asset_${index + 1}`,
          userAssetId: asset.id,
          audioUrl: asset.localUrl || asset.publicUrl || "",
          localUrl: asset.localUrl || "",
          mime: asset.mime || "",
        })),
        ...(userAsset ? [{
          type: "reference_image",
          key: "image_1",
          userAssetId: userAsset.id,
          imageUrl: userAsset.localUrl || userAsset.publicUrl || "",
          sourceImageUrl: userAsset.sourceImageUrl || userAsset.localUrl || "",
          localUrl: userAsset.localUrl || "",
          mime: userAsset.mime || "",
        }] : []),
        ...extraUserAssets.map((asset, index) => ({
          type: "reference_image",
          key: `extra_${index + 1}`,
          userAssetId: asset.id,
          imageUrl: asset.localUrl || asset.publicUrl || "",
          sourceImageUrl: asset.sourceImageUrl || asset.localUrl || "",
          localUrl: asset.localUrl || "",
          mime: asset.mime || "",
        })),
      ]
    : [];
  const initialMediaMode = isAliyunVideoProvider(provider) ? wan27MediaMode : seedanceMode;

  if (cost > 0) {
    await chargeUserWithSubtoken(auth, {
      cost,
      type: "advanced_generation",
      taskId,
      meta: {
        taskId,
        provider: runtime.providerName,
        model: runtime.model,
        caseId: selectedCase?.id || "",
        caseTitle: selectedCase?.title || "",
        duration: requestParams.duration,
        creditsPerSecond: pricing.creditsPerSecond,
        outputCredits: pricing.outputCredits,
        inputVideoSeconds: pricing.videoInputSeconds || 0,
        videoInputCreditsPerSecond: pricing.videoInputCreditsPerSecond || 0,
        videoInputCredits: pricing.videoInputCredits || 0,
        videoCredits: pricing.videoCredits || 0,
        preprocessCredits: pricing.preprocessCredits || 0,
        preprocessImageCount: preprocessPricing.imageCount || 0,
        preprocessResolution: preprocessPricing.resolution || "",
        preprocessTier: preprocessPricing.tier || "",
        preprocessAssetIds: preprocessPricing.items.map((item) => item.assetId),
        baseCredits: pricing.baseCredits,
        originalCost: pricing.originalCredits,
        pricingMultiplier: pricing.userPricingMultiplier,
        markup: pricing.markup,
        resolution: pricing.resolution || requestParams.resolution,
        ratio: pricing.ratio || requestParams.ratio,
        outputTokens: pricing.outputTokens || null,
        yuanPerMillionTokens: pricing.yuanPerMillionTokens || null,
        pricingSource: pricing.source || "duration_rate",
        preprocessReference: requestParams.preprocessReference,
        userAssetId: userAsset?.id || "",
        seedanceFirstFrameAssetId: seedanceFirstFrameAsset?.id || "",
        seedanceEndFrameAssetId: seedanceEndFrameAsset?.id || "",
        referenceVideoAssetId: seedanceVideoAsset?.id || "",
        referenceVideoAssetIds,
        referenceVideoAssetUris,
        referenceAudioAssetUris,
        referenceAudioAssetIds,
        referenceImageAssetUris,
        extraUserAssetIds,
        mediaMode: provider === "seedance" ? initialMediaMode : wan27MediaMode,
        mediaAssets: isAliyunVideoProvider(provider)
          ? wan27Media.map((item) => ({ type: item.type, key: item.key, userAssetId: item.userAssetId || "", mediaKind: item.mediaKind || "" }))
          : initialSeedanceMediaAssets.map((item) => ({ type: item.type, key: item.key, userAssetId: item.userAssetId || "", audioUrl: item.audioUrl || "", videoUrl: item.videoUrl || "" })),
        referenceAssetUri: "",
      },
    });
    if (!dbEnabled()) await writeDb(auth.db);
  }

  const record = await upsertGenerationRecord({
    taskId,
    status: "preparing",
    model: runtime.model,
    provider: runtime.providerName,
    source: runtime.recordSource,
    kind: "advanced-video",
    templateId: selectedCase?.id || "",
    templateTitle: selectedCase?.title || "Advanced generation",
    userId: auth.user.id,
    userAssetId: userAsset?.id || "",
    mediaMode: provider === "seedance" ? initialMediaMode : wan27MediaMode,
    mediaAssets: isAliyunVideoProvider(provider) ? wan27Media : initialSeedanceMediaAssets,
    imageUrl: initialImageUrl,
    sourceImageUrl: initialSourceImageUrl,
    syntheticReferenceLocalUrl: "",
    syntheticReferenceUrl: "",
    referenceAssetUri: "",
    prompt,
    finalPrompt: prompt,
    params: requestParams,
    upstreamPayload: null,
    ratio: requestParams.ratio || "",
    resolution: requestParams.resolution || "",
    duration: requestParams.duration,
    quality: runtime.quality,
    remoteVideoUrl: "",
    localVideoUrl: "",
    error: "",
    preDeductedCredits: cost,
    originalPreDeductedCredits: pricing.originalCredits,
    videoCredits: pricing.videoCredits || 0,
    originalVideoCredits: pricing.originalVideoCredits || 0,
    preprocessReference: pricing.preprocessReference,
    preprocessCredits: pricing.preprocessCredits || 0,
    originalPreprocessCredits: pricing.originalPreprocessCredits || 0,
    preprocessImageCount: preprocessPricing.imageCount || 0,
    preprocessAssetIds: preprocessPricing.items.map((item) => item.assetId),
    finalCredits: pricing.adaptiveDuration ? null : cost,
    originalFinalCredits: pricing.adaptiveDuration ? null : pricing.originalCredits,
    userPricingMultiplier: pricing.userPricingMultiplier,
    billingStatus: cost > 0 ? (pricing.adaptiveDuration ? "pre_deducted" : "settled") : "free",
    billingSettledAt: cost > 0 && !pricing.adaptiveDuration ? new Date().toISOString() : "",
    pricingEstimate: pricing,
    createResponse: null,
    awaitingUpstreamTask: true,
    apiTokenId: auth.tokenRecord?.id || "",
    apiTokenName: auth.tokenRecord?.name || "",
    apiTokenType: auth.tokenRecord?.quotaType || "",
    apiTokenSource: auth.tokenSource || "",
  });
  startAdvancedGenerationJob({
    taskId,
    userId: auth.user.id,
    userAssetId: userAsset?.id || "",
    extraUserAssetIds,
    referenceVideoAssetId: seedanceVideoAsset?.id || "",
    referenceVideoAssetIds,
    referenceVideoAssetUris,
    referenceAudioAssetUris,
    referenceAudioAssetIds,
    referenceImageAssetUris,
    seedanceMode,
    seedanceFirstFrameAssetId: seedanceFirstFrameAsset?.id || "",
    seedanceEndFrameAssetId: seedanceEndFrameAsset?.id || "",
    wan27MediaMode,
    wan27Media,
    provider,
    prompt,
    requestParams,
    forwardModelToGateway,
    pricing,
    cost,
    caseId: selectedCase?.id || "",
    caseTitle: selectedCase?.title || "",
    config,
  });
  const latestUser = await getUserByIdInDb(auth.user.id) || auth.user;
  return sendJson(res, 200, {
    ok: true,
    task: { taskId, status: record.status },
    taskId,
    record: publicGenerationRecord(record, generationRecordResponseOptionsForAuth(auth)),
    user: userView(latestUser),
    referenceAsset: userAsset ? {
      userAssetId: userAsset.id,
      imageUrl: initialImageUrl,
      sourceImageUrl: initialSourceImageUrl,
      syntheticReferenceLocalUrl: "",
      syntheticReferenceUrl: "",
      referenceAssetUri: "",
    } : null,
    extraReferences: extraUserAssets.map((asset) => ({
      userAssetId: asset.id,
      imageUrl: asset.localUrl || asset.publicUrl || "",
      sourceImageUrl: asset.sourceImageUrl || asset.localUrl || "",
      referenceAssetUri: "",
    })),
    pricing,
    cost,
  });
}

async function handleAdminAdvancedGenerate(req, res) {
  const auth = await requireAdmin(req, res);
  if (!auth) return;
  return handleAdvancedGenerate(req, res);
}

function mediaAssetIdsByType(record = {}, type = "") {
  return (Array.isArray(record.mediaAssets) ? record.mediaAssets : [])
    .filter((asset) => asset && asset.type === type && asset.userAssetId)
    .map((asset) => String(asset.userAssetId || "").trim())
    .filter(Boolean);
}

function mediaAssetIdsByTypes(record = {}, types = []) {
  const wanted = new Set(types);
  return (Array.isArray(record.mediaAssets) ? record.mediaAssets : [])
    .filter((asset) => asset && wanted.has(asset.type) && asset.userAssetId)
    .map((asset) => String(asset.userAssetId || "").trim())
    .filter(Boolean);
}

function mediaAssetUrlByType(record = {}, type = "") {
  const asset = (Array.isArray(record.mediaAssets) ? record.mediaAssets : []).find((item) => item && item.type === type);
  return String(asset?.url || asset?.imageUrl || asset?.videoUrl || asset?.audioUrl || asset?.localUrl || "").trim();
}

function platformRegenerateBody(record = {}) {
  const body = {
    templateId: record.templateId || "",
    prompt: record.finalPrompt || record.prompt || "",
  };
  if (record.userAssetId) body.userAssetId = record.userAssetId;
  if (record.params && typeof record.params === "object" && !Array.isArray(record.params)) {
    body.params = { ...record.params };
  }
  return body;
}

function upstreamPayloadInputImageItems(record = {}) {
  const payload = plainObject(record.upstreamPayload);
  const params = plainObject(record.params);
  const containers = [
    payload,
    params,
    plainObject(payload.params),
    plainObject(payload.parameters),
    plainObject(payload.input),
    plainObject(payload.request),
  ];
  const urls = new Set();
  const items = [];
  const push = (value, fallbackType = "") => {
    if (Array.isArray(value)) {
      value.forEach((item) => push(item, fallbackType));
      return;
    }
    if (typeof value === "string") {
      const url = value.trim();
      if (url) urls.add(url);
      return;
    }
    if (!value || typeof value !== "object") return;
    const url = [
      value.Url,
      value.URL,
      value.url,
      value.image_url?.url,
      value.imageUrl?.url,
      value.image_url,
      value.imageUrl,
      value.publicUrl,
      value.sourceImageUrl,
      value.image,
    ].map((item) => String(item || "").trim()).find(Boolean) || "";
    const itemUrl = String(firstPresent(
      value.userAssetId,
      value.assetId,
      value.FileId,
      value.fileId,
      value.id,
      url,
      "",
    ) || "").trim();
    if (!itemUrl) return;
    const category = String(value.Category || value.category || value.type || value.Type || "").toLowerCase();
    const role = String(value.Usage || value.usage || value.role || value.Role || "").toLowerCase();
    const type = fallbackType || (category.includes("video") || role.includes("video") ? "reference_video" : category.includes("audio") || role.includes("audio") ? "reference_audio" : role.includes("last") || role.includes("end") ? "last_frame" : role.includes("first") ? "first_frame" : "reference_image");
    items.push({
      ...value,
      url: url || value.url || "",
      type,
      assetId: String(firstPresent(value.userAssetId, value.assetId, "") || "").trim(),
      upstreamFileId: String(firstPresent(value.FileId, value.fileId, "") || "").trim(),
    });
  };
  const fileInfos = Array.isArray(payload.FileInfos) ? payload.FileInfos : [];
  fileInfos.forEach((item) => push(item));
  const content = Array.isArray(payload.Content) ? payload.Content : Array.isArray(payload.content) ? payload.content : [];
  content.forEach((item) => push(item));
  containers.forEach((source) => {
    [
      source.input_image,
      source.inputImage,
      source.image_url,
      source.imageUrl,
      source.image,
      source.first_frame_url,
      source.firstFrameUrl,
      source.first_image,
      source.firstImage,
      source.last_frame_url,
      source.lastFrameUrl,
      source.last_image,
      source.lastImage,
      source.images,
      source.image_urls,
      source.imageUrls,
      source.reference_images,
      source.referenceImages,
      source.reference_image_urls,
      source.referenceImageUrls,
      source.reference_videos,
      source.referenceVideos,
      source.reference_video_urls,
      source.referenceVideoUrls,
      source.reference_audios,
      source.referenceAudios,
      source.reference_audio_urls,
      source.referenceAudioUrls,
    ].forEach((value) => {
      const key = Object.keys(source).find((name) => source[name] === value) || "";
      const fallback = key.toLowerCase().includes("video") ? "reference_video" : key.toLowerCase().includes("audio") ? "reference_audio" : "";
      push(value, fallback);
    });
  });
  const urlItems = [...urls].map((url) => ({ url }));
  return [...items, ...urlItems];
}

function advancedRegenerateBody(record = {}) {
  const params = record.params && typeof record.params === "object" && !Array.isArray(record.params) ? record.params : {};
  const provider = normalizeAdvancedProvider(record.provider || params.provider);
  const body = {
    caseId: record.templateId || "",
    provider,
    prompt: record.finalPrompt || record.prompt || params.prompt || "",
    ratio: record.ratio || params.ratio || params.aspect_ratio || "9:16",
    resolution: record.resolution || params.resolution || "720p",
    duration: record.duration || params.duration || 5,
  };
  if (["seedream5-image", "qwen-image3"].includes(provider)) {
    const mediaAssets = Array.isArray(record.mediaAssets) ? record.mediaAssets : [];
    const imageItems = mediaAssets
      .filter((asset) => !["video", "audio", "first_clip", "driving_audio"].some((type) => String(asset?.type || "").includes(type)))
      .map((asset) => {
        const assetId = String(firstPresent(asset?.userAssetId, asset?.assetId, asset?.id, "") || "").trim();
        if (assetId) return { assetId };
        const url = String(firstPresent(asset?.imageUrl, asset?.url, asset?.publicUrl, asset?.localUrl, "") || "").trim();
        return url ? { url } : null;
      })
      .filter(Boolean);
    const recordedImageItems = (items) => (Array.isArray(items) ? items : []).map((item) => {
      if (typeof item === "string") return item ? { url: item } : null;
      const assetId = String(firstPresent(item?.userAssetId, item?.assetId, item?.id, "") || "").trim();
      if (assetId) return { assetId };
      const url = String(firstPresent(item?.imageUrl, item?.url, item?.publicUrl, item?.sourceImageUrl, "") || "").trim();
      return url ? { url } : null;
    }).filter(Boolean);
    const upstreamItems = upstreamPayloadInputImageItems(record);
    const referenceImages = [...imageItems, ...recordedImageItems(params.referenceImages), ...recordedImageItems(upstreamItems)];
    const fallbackIds = [...new Set([
      ...(Array.isArray(params.referenceImageAssetIds) ? params.referenceImageAssetIds : []),
      ...(Array.isArray(record.userAssetIds) ? record.userAssetIds : []),
      record.userAssetId || "",
    ].map((id) => String(id || "").trim()).filter(Boolean))];
    const referenceImageUrls = [...new Set([
      ...(Array.isArray(record.imageUrls) ? record.imageUrls : []),
      ...(Array.isArray(record.sourceImageUrls) ? record.sourceImageUrls : []),
      ...(Array.isArray(params.referenceImageUrls) ? params.referenceImageUrls : []),
      ...upstreamItems.map((item) => String(firstPresent(item?.image_url, item?.imageUrl, item?.url, item?.publicUrl, item?.sourceImageUrl, "") || "").trim()),
      record.imageUrl || "",
      record.sourceImageUrl || "",
    ].map((url) => String(url || "").trim()).filter(Boolean))];
    const seen = new Set();
    body.referenceImages = [...referenceImages, ...fallbackIds.map((assetId) => ({ assetId })), ...referenceImageUrls.map((url) => ({ url }))]
      .filter((item) => {
        const key = item.assetId ? `asset:${item.assetId}` : `url:${item.url}`;
        if (!key || seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    body.preservePublicMediaUrls = true;
    if (provider === "seedream5-image") body.seedreamTier = firstPresent(params.seedreamTier, params.seedream5Tier, params.seedanceTier);
    if (provider === "qwen-image3") {
      body.qwenTier = firstPresent(params.qwenTier, params.qwenImageTier, params.tier);
      body.model = firstPresent(params.model, record.model);
      body.n = firstPresent(params.outputImageCount, params.n);
      body.prompt_extend = firstPresent(params.prompt_extend, params.promptExtend);
      body.watermark = firstPresent(params.watermark);
      if (params.seed !== undefined && params.seed !== null && params.seed !== "") body.seed = params.seed;
    }
    return body;
  }
  if (isVegaProvider(provider)) {
    const mediaAssets = Array.isArray(record.mediaAssets) ? record.mediaAssets : [];
    const explicitMediaMode = firstPresent(record.mediaMode, params.mediaMode, params.seedanceMode, params.functionMode, "");
    const requestedDraftTaskId = String(firstPresent(params.draftTaskId, params.draft_task_id, "") || "").trim();
    const assetUri = (asset) => String(firstPresent(
      asset?.assetUri,
      asset?.referenceAssetUri,
      asset?.seedanceAssetUri,
      asset?.Url,
      asset?.URL,
      asset?.url,
      asset?.imageUrl,
      asset?.image_url?.url,
      asset?.videoUrl,
      asset?.video_url?.url,
      asset?.audioUrl,
      asset?.audio_url?.url,
      "",
    ) || "").trim();
    const publicUrlByAssetUri = new Map();
    const assetUriByPublicUrl = new Map();
    const rememberPublicUrl = (item) => {
      const uri = vegaRecordAssetUriValues(item)[0] || "";
      const url = vegaRecordMediaPublicUrl(item);
      if (uri && url && !url.startsWith("asset://")) {
        if (!publicUrlByAssetUri.has(uri)) publicUrlByAssetUri.set(uri, url);
        if (!assetUriByPublicUrl.has(url)) assetUriByPublicUrl.set(url, uri);
      }
    };
    mediaAssets.forEach(rememberPublicUrl);
    [
      params.firstFrameUrl || params.first_frame_url,
      params.lastFrameUrl || params.last_frame_url,
      params.referenceImages || params.reference_images,
      params.referenceVideos || params.reference_videos,
      params.referenceAudios || params.reference_audios,
    ].forEach((value) => arrayFromBody(value).forEach(rememberPublicUrl));
    const assetUrl = (asset, keys = []) => {
      if (!asset || typeof asset !== "object") return "";
      const direct = keys.map((key) => asset[key]).find(Boolean);
      const directUrl = String(firstPresent(
        direct,
        asset.Url,
        asset.URL,
        asset.url,
        asset.imageUrl,
        asset.image_url?.url,
        asset.videoUrl,
        asset.video_url?.url,
        asset.audioUrl,
        asset.audio_url?.url,
        "",
      ) || "").trim();
      const uri = assetUri(asset);
      const publicUrl = uri ? publicUrlByAssetUri.get(uri) || "" : "";
      return publicUrl || (!directUrl.startsWith("asset://") ? directUrl : "") || uri;
    };
    const assetId = (asset) => String(firstPresent(asset?.userAssetId, asset?.assetId, asset?.id, "") || "").trim();
    const upstreamItems = upstreamPayloadInputImageItems(record);
    const upstreamByType = (type) => upstreamItems.filter((item) => item.type === type);
    const assetIdsByType = (type) => mediaAssets
      .filter((asset) => asset?.type === type)
      .map(assetId)
      .filter(Boolean);
    const urlsByType = (type, keys) => mediaAssets
      .filter((asset) => asset?.type === type)
      .map((asset) => assetUrl(asset, keys))
      .filter(Boolean);
    const uniqueUrls = (values) => [...new Set((Array.isArray(values) ? values : []).map((value) => String(value || "").trim()).filter(Boolean))];
    const missingAssetUriOnly = (urls, uris) => {
      const represented = new Set(urls.flatMap((item) => {
        const values = vegaRecordAssetUriValues(item);
        const publicUrl = vegaRecordMediaPublicUrl(item);
        const mappedUri = publicUrl ? assetUriByPublicUrl.get(publicUrl) : "";
        return mappedUri ? [...values, mappedUri] : values;
      }));
      return arrayFromBody(uris)
        .map((uri) => String(uri || "").trim())
        .filter((uri) => uri.startsWith("asset://") && !represented.has(uri));
    };
    const firstFrameUrl = String(firstPresent(
      params.firstFrameUrl,
      params.first_frame_url,
      params.firstFrameAssetUri,
      urlsByType("first_frame", ["url", "imageUrl", "image_url"]),
      upstreamByType("first_frame").map((item) => assetUrl(item)),
      "",
    ) || "").trim();
    const lastFrameUrl = String(firstPresent(
      params.lastFrameUrl,
      params.last_frame_url,
      params.lastFrameAssetUri,
      urlsByType("last_frame", ["url", "imageUrl", "image_url"]),
      upstreamByType("last_frame").map((item) => assetUrl(item)),
      "",
    ) || "").trim();
    const referenceImages = uniqueUrls([
      ...urlsByType("reference_image", ["url", "imageUrl", "image_url"]),
      ...upstreamByType("reference_image").map((item) => assetUrl(item)),
      ...(Array.isArray(params.referenceImages) ? params.referenceImages.map((item) => typeof item === "string" ? item : assetUrl(item, ["url", "imageUrl", "image_url"])) : []),
      ...(Array.isArray(params.referenceImageUrls) ? params.referenceImageUrls : []),
    ]).filter((url) => url !== firstFrameUrl && url !== lastFrameUrl);
    const imageUriOnly = missingAssetUriOnly(referenceImages, params.referenceImageAssetUris);
    referenceImages.push(...imageUriOnly);
    const referenceVideos = uniqueUrls([
      ...urlsByType("reference_video", ["url", "videoUrl", "video_url"]),
      ...upstreamByType("reference_video").map((item) => assetUrl(item)),
      ...(Array.isArray(params.referenceVideos) ? params.referenceVideos.map((item) => typeof item === "string" ? item : assetUrl(item, ["url", "videoUrl", "video_url"])) : []),
      ...(Array.isArray(params.referenceVideoUrls) ? params.referenceVideoUrls : []),
    ]);
    const videoUriOnly = missingAssetUriOnly(referenceVideos, params.referenceVideoAssetUris);
    referenceVideos.push(...videoUriOnly);
    const referenceAudios = uniqueUrls([
      ...urlsByType("reference_audio", ["url", "audioUrl", "audio_url"]),
      ...upstreamByType("reference_audio").map((item) => assetUrl(item)),
      ...(Array.isArray(params.referenceAudios) ? params.referenceAudios.map((item) => typeof item === "string" ? item : assetUrl(item, ["url", "audioUrl", "audio_url"])) : []),
      ...(Array.isArray(params.referenceAudioUrls) ? params.referenceAudioUrls : []),
    ]);
    const audioUriOnly = missingAssetUriOnly(referenceAudios, params.referenceAudioAssetUris);
    referenceAudios.push(...audioUriOnly);
    const firstFrameAssetId = String(firstPresent(
      params.firstFrameAssetId,
      params.first_frame_asset_id,
      params.firstFrameUserAssetId,
      assetIdsByType("first_frame"),
      "",
    ) || "").trim();
    const lastFrameAssetId = String(firstPresent(
      params.lastFrameAssetId,
      params.last_frame_asset_id,
      params.lastFrameUserAssetId,
      assetIdsByType("last_frame"),
      "",
    ) || "").trim();
    const referenceImageAssetIds = [...new Set([
      ...arrayFromBody(firstPresent(params.referenceImageAssetIds, params.reference_image_asset_ids)),
      ...assetIdsByType("reference_image"),
      ...upstreamByType("reference_image").map((item) => assetId(item)),
    ].map((id) => String(id || "").trim()).filter(Boolean))];
    const referenceVideoAssetIds = [...new Set([
      ...arrayFromBody(firstPresent(params.referenceVideoAssetIds, params.reference_video_asset_ids)),
      ...assetIdsByType("reference_video"),
      ...upstreamByType("reference_video").map((item) => assetId(item)),
    ].map((id) => String(id || "").trim()).filter(Boolean))];
    const referenceAudioAssetIds = [...new Set([
      ...arrayFromBody(firstPresent(params.referenceAudioAssetIds, params.reference_audio_asset_ids)),
      ...assetIdsByType("reference_audio"),
      ...upstreamByType("reference_audio").map((item) => assetId(item)),
    ].map((id) => String(id || "").trim()).filter(Boolean))];
    const firstFrameAssetUri = String(firstPresent(
      params.firstFrameAssetUri,
      params.first_frame_asset_uri,
      vegaRecordAssetUriValues(params.firstFrameUrl || params.first_frame_url)[0],
      vegaRecordAssetUriValues(urlsByType("first_frame", ["assetUri", "url", "imageUrl", "image_url"]))[0],
      vegaRecordAssetUriValues(upstreamByType("first_frame"))[0],
      "",
    ) || "").trim();
    const lastFrameAssetUri = String(firstPresent(
      params.lastFrameAssetUri,
      params.last_frame_asset_uri,
      vegaRecordAssetUriValues(params.lastFrameUrl || params.last_frame_url)[0],
      vegaRecordAssetUriValues(urlsByType("last_frame", ["assetUri", "url", "imageUrl", "image_url"]))[0],
      vegaRecordAssetUriValues(upstreamByType("last_frame"))[0],
      "",
    ) || "").trim();
    const referenceImageAssetUris = [...new Set([
      ...arrayFromBody(firstPresent(params.referenceImageAssetUris, params.reference_image_asset_uris)),
      ...referenceImages.flatMap((item) => vegaRecordAssetUriValues(item)),
      ...urlsByType("reference_image", ["assetUri", "referenceAssetUri", "url", "imageUrl", "image_url"]),
      ...upstreamByType("reference_image").flatMap((item) => vegaRecordAssetUriValues(item)),
    ].map((uri) => String(uri || "").trim()).filter((uri) => uri.startsWith("asset://")))].slice(0, referenceImages.length);
    const referenceVideoAssetUris = [...new Set([
      ...arrayFromBody(firstPresent(params.referenceVideoAssetUris, params.reference_video_asset_uris)),
      ...referenceVideos.flatMap((item) => vegaRecordAssetUriValues(item)),
      ...urlsByType("reference_video", ["assetUri", "referenceAssetUri", "url", "videoUrl", "video_url"]),
      ...upstreamByType("reference_video").flatMap((item) => vegaRecordAssetUriValues(item)),
    ].map((uri) => String(uri || "").trim()).filter((uri) => uri.startsWith("asset://")))].slice(0, referenceVideos.length);
    const referenceAudioAssetUris = [...new Set([
      ...arrayFromBody(firstPresent(params.referenceAudioAssetUris, params.reference_audio_asset_uris)),
      ...referenceAudios.flatMap((item) => vegaRecordAssetUriValues(item)),
      ...urlsByType("reference_audio", ["assetUri", "referenceAssetUri", "url", "audioUrl", "audio_url"]),
      ...upstreamByType("reference_audio").flatMap((item) => vegaRecordAssetUriValues(item)),
    ].map((uri) => String(uri || "").trim()).filter((uri) => uri.startsWith("asset://")))].slice(0, referenceAudios.length);
    const reconstructedMedia = { firstFrameUrl, lastFrameUrl, referenceImages, referenceVideos, referenceAudios };
    let draftSelection;
    try {
      draftSelection = resolveVegaDraftSelection({
        provider,
        mediaMode: explicitMediaMode,
        media: reconstructedMedia,
        prompt: body.prompt,
        draftTaskId: requestedDraftTaskId,
      });
    } catch (error) {
      // Preserve explicit draft intent so the normal request handler returns a
      // clear validation error; stale Lite draft state is normalized above.
      draftSelection = {
        draftTaskId: requestedDraftTaskId,
        explicitDraftMode: normalizeVegaMediaMode(explicitMediaMode) === "draft_followup",
        mediaMode: normalizeVegaMediaMode(explicitMediaMode, reconstructedMedia),
      };
    }
    const draftTaskId = draftSelection.draftTaskId;
    const requestedMedia = draftTaskId
      ? { firstFrameUrl: "", lastFrameUrl: "", referenceImages: [], referenceVideos: [], referenceAudios: [] }
      : reconstructedMedia;
    const inferredMediaMode = firstFrameUrl && lastFrameUrl
      ? "first_last_frame"
      : firstFrameUrl
      ? "first_frame"
      : lastFrameUrl
      ? "last_frame"
      : (referenceImages.length || referenceVideos.length || referenceAudios.length)
      ? "reference_video"
      : "text_to_video";
    const mediaMode = draftTaskId
      ? "draft_followup"
      : draftSelection.mediaMode || normalizeVegaMediaMode(explicitMediaMode || inferredMediaMode, requestedMedia);
    const taskType = draftTaskId
      ? "auto"
      : String(firstPresent(params.taskType, params.omniReferenceTaskType, "auto") || "auto").trim().toLowerCase();
    const effectiveMediaMode = draftTaskId
      ? "draft_followup"
      : ["edit", "extend"].includes(taskType)
      ? "reference_video"
      : mediaMode;
    const regeneratedMedia = vegaMediaSelection({
      mediaMode: effectiveMediaMode,
      ...requestedMedia,
    });
    body.mediaMode = regeneratedMedia.mode;
    if (["first_frame", "last_frame", "first_last_frame"].includes(regeneratedMedia.mode)) {
      if (regeneratedMedia.firstFrameUrl) body.firstFrameUrl = regeneratedMedia.firstFrameUrl;
      if (regeneratedMedia.lastFrameUrl) body.lastFrameUrl = regeneratedMedia.lastFrameUrl;
      if (firstFrameAssetId) body.firstFrameAssetId = firstFrameAssetId;
      if (lastFrameAssetId) body.lastFrameAssetId = lastFrameAssetId;
      if (firstFrameAssetUri) body.firstFrameAssetUri = firstFrameAssetUri;
      if (lastFrameAssetUri) body.lastFrameAssetUri = lastFrameAssetUri;
    } else if (regeneratedMedia.mode === "reference_video") {
      // File-based Vega records have no local mediaAssets. Keep the original
      // FileInfos URLs/IDs and asset URIs so an old finished result can be regenerated directly.
      body.referenceImages = regeneratedMedia.referenceImages.map((url, index) => ({
        url,
        ...(referenceImageAssetUris[index] ? { assetUri: referenceImageAssetUris[index], referenceAssetUri: referenceImageAssetUris[index] } : {}),
        ...(referenceImageAssetIds[index] ? { userAssetId: referenceImageAssetIds[index] } : {}),
      }));
      body.referenceVideos = regeneratedMedia.referenceVideos.map((url, index) => ({
        url,
        ...(referenceVideoAssetUris[index] ? { assetUri: referenceVideoAssetUris[index], referenceAssetUri: referenceVideoAssetUris[index] } : {}),
        ...(referenceVideoAssetIds[index] ? { userAssetId: referenceVideoAssetIds[index] } : {}),
      }));
      body.referenceAudios = regeneratedMedia.referenceAudios.map((url, index) => ({
        url,
        ...(referenceAudioAssetUris[index] ? { assetUri: referenceAudioAssetUris[index], referenceAssetUri: referenceAudioAssetUris[index] } : {}),
        ...(referenceAudioAssetIds[index] ? { userAssetId: referenceAudioAssetIds[index] } : {}),
      }));
      if (referenceImageAssetIds.length) body.referenceImageAssetIds = referenceImageAssetIds;
      if (referenceVideoAssetIds.length) body.referenceVideoAssetIds = referenceVideoAssetIds;
      if (referenceAudioAssetIds.length) body.referenceAudioAssetIds = referenceAudioAssetIds;
      if (referenceImageAssetUris.length) body.referenceImageAssetUris = referenceImageAssetUris;
      if (referenceVideoAssetUris.length) body.referenceVideoAssetUris = referenceVideoAssetUris;
      if (referenceAudioAssetUris.length) body.referenceAudioAssetUris = referenceAudioAssetUris;
    }
    if (regeneratedMedia.mode === "draft_followup") {
      body.prompt = "";
      body.duration = -1;
    } else if (["edit", "extend"].includes(taskType)) {
      body.duration = -1;
    }
    body.taskType = taskType;
    body.draft = draftTaskId || !vegaProviderCapabilities(provider)?.draft ? false : params.draft === true || params.draft === "true";
    body.draftTaskId = draftTaskId;
    body.assetGroupId = String(firstPresent(params.assetGroupId, params.asset_group_id, "") || "").trim();
    body.generateAudio = boolFromRequest(firstPresent(params.generateAudio, params.generate_audio), true);
    body.returnLastFrame = boolFromRequest(firstPresent(params.returnLastFrame, params.return_last_frame), false);
    body.returnVegaUsage = boolFromRequest(firstPresent(params.returnVegaUsage, params.return_vega_usage), false);
    body.enhancePromptMode = firstPresent(params.enhancePromptMode, params.enhance_prompt_mode);
    body.moderationMode = firstPresent(params.moderationMode, params.moderation_mode);
    body.generateMode = firstPresent(params.generateMode, params.generate_mode);
    body.videoQualityMode = firstPresent(params.videoQualityMode, params.video_quality_mode);
    body.outputFormat = firstPresent(params.outputFormat, params.output_format);
    body.ratio = firstPresent(record.ratio, params.ratio, params.aspect_ratio, body.ratio);
    if (params.seed !== undefined && params.seed !== null && params.seed !== "") body.seed = params.seed;
  } else if (isAliyunVideoProvider(provider)) {
    const capability = normalizeAliyunVideoCapability(params.videoCapability || record.mediaMode || "", {
      provider,
      model: params.model || record.model,
      media: Array.isArray(record.mediaAssets) ? record.mediaAssets : [],
    });
    body.videoCapability = capability;
    if (capability === "wan-legacy") body.model = params.model || record.model || "";
    if (["wan-animate-move", "wan-animate-mix"].includes(capability)) {
      body.animateMode = params.animateMode || params.parameters?.mode || "wan-std";
      body.params = { parameters: { mode: body.animateMode } };
    }
    const mediaMode = provider === "wan30"
      ? (String(record.mediaMode || params.mediaMode || "multimodal").toLowerCase() === "first_last_frame" ? "first_last_frame" : "multimodal")
      : normalizeWan27MediaMode(record.mediaMode || params.mediaMode);
    body.mediaMode = mediaMode;
    const firstFrame = mediaAssetIdsByType(record, "first_frame")[0] || record.userAssetId || "";
    const lastFrame = mediaAssetIdsByType(record, "last_frame")[0] || "";
    const firstClip = mediaAssetIdsByType(record, "first_clip")[0] || "";
    const drivingAudio = mediaAssetIdsByType(record, "driving_audio")[0] || "";
    if (firstFrame) body.firstFrameAssetId = firstFrame;
    else if (mediaAssetUrlByType(record, "first_frame")) body.firstFrameUrl = mediaAssetUrlByType(record, "first_frame");
    if (lastFrame) body.lastFrameAssetId = lastFrame;
    else if (mediaAssetUrlByType(record, "last_frame")) body.lastFrameUrl = mediaAssetUrlByType(record, "last_frame");
    if (firstClip) body.firstClipAssetId = firstClip;
    else if (mediaAssetUrlByType(record, "first_clip")) body.firstClipUrl = mediaAssetUrlByType(record, "first_clip");
    if (drivingAudio) body.drivingAudioAssetId = drivingAudio;
    else if (mediaAssetUrlByType(record, "driving_audio")) body.drivingAudioUrl = mediaAssetUrlByType(record, "driving_audio");
    if (!drivingAudio && (params.drivingAudioUrl || params.driving_audio_url)) body.drivingAudioUrl = params.drivingAudioUrl || params.driving_audio_url;
    if (!firstClip && (params.firstClipUrl || params.first_clip_url)) body.firstClipUrl = params.firstClipUrl || params.first_clip_url;
    if (params.seed) body.seed = params.seed;
    const referenceImageIds = [...new Set(mediaAssetIdsByType(record, "reference_image"))];
    if (referenceImageIds.length) body.referenceImages = referenceImageIds.map((assetId) => ({ assetId }));
    const primaryImageId = mediaAssetIdsByTypes(record, ["image_url", "first_frame"])[0] || record.userAssetId || "";
    if (primaryImageId && ["happyhorse-i2v", "wan-animate-move", "wan-animate-mix"].includes(capability)) {
      body.firstFrameAssetId = primaryImageId;
    }
    const primaryVideoId = mediaAssetIdsByTypes(record, ["video", "video_url"])[0] || "";
    const primaryVideoUrl = mediaAssetUrlByType(record, "video") || mediaAssetUrlByType(record, "video_url");
    if (primaryVideoId) body.videoAssetId = primaryVideoId;
    else if (primaryVideoUrl) body.videoUrl = primaryVideoUrl;
    const referenceVideoIds = [...new Set(mediaAssetIdsByType(record, "reference_video"))];
    if (referenceVideoIds.length) body.referenceVideoAssetIds = referenceVideoIds;
    const referenceVideoUrls = (Array.isArray(record.mediaAssets) ? record.mediaAssets : [])
      .filter((asset) => asset?.type === "reference_video" && !asset.userAssetId)
      .map((asset) => String(asset.videoUrl || asset.url || "").trim())
      .filter(Boolean);
    if (referenceVideoUrls.length) body.referenceVideoUrls = referenceVideoUrls;
    if (provider === "wan30") {
      const referenceAudioIds = [...new Set(mediaAssetIdsByType(record, "reference_audio"))];
      if (referenceAudioIds.length) body.referenceAudioAssetIds = referenceAudioIds;
      const referenceAudioUrls = (Array.isArray(record.mediaAssets) ? record.mediaAssets : [])
        .filter((asset) => asset?.type === "reference_audio" && !asset.userAssetId)
        .map((asset) => String(asset.audioUrl || asset.url || "").trim())
        .filter(Boolean);
      if (referenceAudioUrls.length) body.referenceAudioUrls = referenceAudioUrls;
      body.generateAudio = boolFromRequest(firstPresent(params.generateAudio, params.generate_audio), true);
    }
  } else if (["seedance25", SEEDANCE25_DIRECT_PROVIDER].includes(provider)) {
    // Seedance 2.5 accepts up to 30 images (and 10 videos / 10 audios). Keep
    // the original ordered media list when rebuilding a task instead of
    // applying the legacy Seedance nine-image limit.
    const mediaAssets = Array.isArray(record.mediaAssets) ? record.mediaAssets : [];
    const mediaItems = (type, urlKeys = []) => mediaAssets
      .filter((asset) => asset?.type === type)
      .map((asset) => {
        const assetId = String(asset.userAssetId || "").trim();
        if (assetId) return { assetId };
        const url = String(urlKeys.map((key) => asset?.[key]).find(Boolean) || "").trim();
        return url ? { url } : null;
      })
      .filter(Boolean);
    const fallbackItems = (ids, type, urlKeys) => {
      const items = mediaItems(type, urlKeys);
      if (items.length) return items;
      return (Array.isArray(ids) ? ids : [])
        .map((id) => String(id || "").trim())
        .filter(Boolean)
        .map((assetId) => ({ assetId }));
    };
    const savedImageIds = Array.isArray(params.referenceImageAssetIds) && params.referenceImageAssetIds.length
      ? params.referenceImageAssetIds
      : [record.userAssetId || ""];
    const referenceImages = fallbackItems(savedImageIds, "reference_image", ["imageUrl", "url", "localUrl"]);
    const referenceVideos = fallbackItems(params.referenceVideoAssetIds, "reference_video", ["videoUrl", "url", "localUrl"]);
    const referenceAudios = fallbackItems(params.referenceAudioAssetIds, "reference_audio", ["audioUrl", "url", "localUrl"]);
    const mediaMode = String(firstPresent(record.mediaMode, params.functionMode, params.seedanceMode, params.mediaMode, "omini") || "omini").trim();
    body.functionMode = mediaMode;
    body.mediaMode = mediaMode;
    if (referenceImages.length) body.referenceImages = referenceImages;
    if (referenceVideos.length) body.referenceVideos = referenceVideos;
    if (referenceAudios.length) body.referenceAudios = referenceAudios;
    if (params.generateAudio !== undefined || params.generate_audio !== undefined) {
      body.generateAudio = boolFromRequest(firstPresent(params.generateAudio, params.generate_audio), true);
    }
    if (params.preprocessReference !== undefined) body.preprocessReference = boolFromRequest(params.preprocessReference, false);
    if (params.seed !== undefined && params.seed !== null && params.seed !== "") body.seed = params.seed;

    if (mediaMode === "first_last_frame") {
      const firstFrameId = String(firstPresent(
        params.firstFrameAssetId,
        mediaAssetIdsByTypes(record, ["first_frame", "image_url"])[0],
        "",
      ) || "").trim();
      const lastFrameId = String(firstPresent(
        params.lastFrameAssetId,
        mediaAssetIdsByTypes(record, ["last_frame", "end_image_url"])[0],
        "",
      ) || "").trim();
      const firstFrameUrl = mediaAssetUrlByType(record, "first_frame") || mediaAssetUrlByType(record, "image_url");
      const lastFrameUrl = mediaAssetUrlByType(record, "last_frame") || mediaAssetUrlByType(record, "end_image_url");
      if (firstFrameId) body.firstFrameAssetId = firstFrameId;
      else if (firstFrameUrl) body.firstFrameUrl = firstFrameUrl;
      if (lastFrameId) body.lastFrameAssetId = lastFrameId;
      else if (lastFrameUrl) body.lastFrameUrl = lastFrameUrl;
    }
  } else {
    const referenceIds = [
      ...mediaAssetIdsByType(record, "reference_image"),
      record.userAssetId || "",
    ].map((id) => String(id || "").trim()).filter(Boolean);
    const uniqueIds = [...new Set(referenceIds)].slice(0, ADVANCED_SEEDANCE_REFERENCE_LIMIT);
    if (uniqueIds.length) {
      body.userAssetId = uniqueIds[0];
      if (uniqueIds.length > 1) body.extraReferenceAssetIds = uniqueIds.slice(1);
    }
    const referenceVideoIds = [...new Set(mediaAssetIdsByTypes(record, ["reference_video", "first_clip"]))];
    if (referenceVideoIds.length) body.referenceVideoAssetId = referenceVideoIds[0];
    const referenceVideoUrls = (Array.isArray(record.mediaAssets) ? record.mediaAssets : [])
      .filter((asset) => asset?.type === "reference_video" && !asset.userAssetId)
      .map((asset) => String(asset.videoUrl || asset.url || "").trim())
      .filter(Boolean);
    if (referenceVideoUrls.length) body.referenceVideoUrls = referenceVideoUrls.slice(0, ADVANCED_SEEDANCE_VIDEO_REFERENCE_LIMIT);
    const referenceAudioIds = [...new Set(mediaAssetIdsByType(record, "reference_audio"))];
    if (referenceAudioIds.length) body.referenceAudioAssetIds = referenceAudioIds.slice(0, ADVANCED_SEEDANCE_AUDIO_REFERENCE_LIMIT);
    const referenceAudioUrls = (Array.isArray(record.mediaAssets) ? record.mediaAssets : [])
      .filter((asset) => asset?.type === "reference_audio" && !asset.userAssetId)
      .map((asset) => String(asset.audioUrl || asset.url || "").trim())
      .filter(Boolean);
    if (referenceAudioUrls.length) body.referenceAudioUrls = referenceAudioUrls.slice(0, ADVANCED_SEEDANCE_AUDIO_REFERENCE_LIMIT);
  }
  return body;
}

function imageEditRegenerateBody(record = {}) {
  const params = record.params && typeof record.params === "object" && !Array.isArray(record.params) ? record.params : {};
  const mediaAssets = Array.isArray(record.mediaAssets) ? record.mediaAssets : [];
  const upstreamItems = upstreamPayloadInputImageItems(record);
  const assetIds = [...new Set([
    ...mediaAssets.map((asset) => String(firstPresent(asset?.userAssetId, asset?.assetId, asset?.id, "") || "").trim()),
    ...(Array.isArray(params.referenceImageAssetIds) ? params.referenceImageAssetIds : []),
    ...(Array.isArray(record.userAssetIds) ? record.userAssetIds : []),
    ...upstreamItems.map((item) => String(firstPresent(item?.userAssetId, item?.assetId, item?.id, "") || "").trim()),
    record.userAssetId || "",
  ].map((id) => String(id || "").trim()).filter(Boolean))];
  const imageUrls = [...new Set([
    ...mediaAssets.map((asset) => String(firstPresent(asset?.sourceImageUrl, asset?.imageUrl, asset?.url, asset?.publicUrl, asset?.localUrl, "") || "").trim()),
    ...(Array.isArray(record.sourceImageUrls) ? record.sourceImageUrls : []),
    ...(Array.isArray(record.imageUrls) ? record.imageUrls : []),
    ...(Array.isArray(params.referenceImageUrls) ? params.referenceImageUrls : []),
    ...upstreamItems.map((item) => String(firstPresent(item?.image_url, item?.imageUrl, item?.url, item?.publicUrl, item?.sourceImageUrl, "") || "").trim()),
    record.sourceImageUrl || "",
    record.imageUrl || "",
  ].map((url) => String(url || "").trim()).filter(Boolean))];
  return {
    prompt: record.finalPrompt || record.prompt || params.prompt || "",
    imageAssetIds: assetIds,
    userAssetIds: assetIds,
    imageUrls,
    sourceImageUrls: imageUrls,
    ratio: record.ratio || params.ratio || params.aspect_ratio || "9:16",
    resolution: record.resolution || params.resolution || "2K",
    params: { ...params, advancedProviderId: params.advancedProviderId || record.provider || "" },
    async: true,
  };
}

async function handleRegenerateGenerationRecord(req, res, taskId) {
  const auth = await requireUser(req, res);
  if (!auth) return;
  const record = await getGenerationRecord(taskId);
  if (!record || record.userId !== auth.user.id || !isUserVisibleGenerationRecord(record)) {
    return sendJson(res, 404, { ok: false, message: "Generation record not found." });
  }

  const source = String(record.source || "").toLowerCase();
  const kind = String(record.kind || "").toLowerCase();
  if (source === "platform-template" || (record.templateId && ["image-to-video", "text-to-video"].includes(kind))) {
    return handlePlatformGenerate(withJsonBody(req, platformRegenerateBody(record)), res);
  }
  const params = record.params && typeof record.params === "object" && !Array.isArray(record.params) ? record.params : {};
  const explicitProvider = normalizeAdvancedProvider(params.advancedProviderId || "");
  if (["z-image-spicy-pro", "qwen-image-edit-spicy", "wan27-image-edit"].includes(explicitProvider)) {
    return handleWan27ImageEdit(withJsonBody(req, imageEditRegenerateBody(record)), res);
  }
  const rawProvider = String(record.provider || params.provider || "").toLowerCase();
  if (rawProvider === "aliyun-wan27-image" || isWan27ImageProvider(rawProvider)) {
    return handleWan27ImageEdit(withJsonBody(req, imageEditRegenerateBody(record)), res);
  }
  const provider = normalizeAdvancedProvider(record.provider || params.provider || "");
  if (source.includes("advanced") || ["seedance", "seedance25", SEEDANCE25_DIRECT_PROVIDER, "aliyun-wan30", "aliyun-wan27", "aliyun-happyhorse", "seedream5-image", "qwen-image3"].includes(provider)) {
    return handleAdvancedGenerate(withJsonBody(req, advancedRegenerateBody(record)), res);
  }
  return sendJson(res, 400, { ok: false, message: "This record cannot be regenerated yet." });
}

async function handleAdminUploadPlatformCover(req, res) {
  const auth = await requireAdmin(req, res);
  if (!auth) return;
  const body = await readJson(req, JSON_MEDIA_BODY_MAX_BYTES);
  const { mime, bytes } = decodeImageDataUrl(body.dataUrl || "");
  if (bytes.byteLength > 4 * 1024 * 1024) {
    return sendJson(res, 400, { ok: false, message: "Cover image must be 4MB or smaller." });
  }
  const safeName = String(body.name || "platform-cover").trim().replace(/[^a-z0-9_-]/gi, "-").slice(0, 50) || "platform-cover";
  const fileName = `${safeName}-${Date.now()}${imageExtFromMime(mime)}`;
  await fs.mkdir(ADMIN_HOME_DIR, { recursive: true });
  const localUrl = `/assets/admin/home/${fileName}`;
  await fs.writeFile(path.join(ADMIN_HOME_DIR, fileName), bytes);
  const mirror = await uploadLocalAssetMirrorToObjectStorage({ localUrl, bytes, mime });
  return sendJson(res, 200, {
    ok: true,
    url: mirror.publicUrl || localUrl,
    localUrl,
    cdnUrl: mirror.publicUrl || "",
    objectStorageError: mirror.error || "",
  });
}

async function handleAdminIngestAdvancedCaseMedia(req, res) {
  const auth = await requireAdmin(req, res);
  if (!auth) return;
  const body = await readJson(req);
  try {
    const media = await ingestAdvancedCaseMedia({
      videoUrl: body.videoUrl,
      coverUrl: body.coverUrl,
      caseId: body.caseId || body.name || "advanced-case",
    });
    return sendJson(res, 200, { ok: true, media });
  } catch (error) {
    return sendJson(res, error.statusCode || 500, { ok: false, message: error.message || "Failed to ingest media." });
  }
}

async function handleAdminIngestPlatformTemplateMedia(req, res) {
  const auth = await requireAdmin(req, res);
  if (!auth) return;
  const body = await readJson(req);
  try {
    const media = await ingestPlatformTemplateMedia({
      videoUrl: body.videoUrl,
      coverUrl: body.coverUrl,
      templateId: body.templateId || body.name || "platform-template",
    });
    return sendJson(res, 200, { ok: true, media });
  } catch (error) {
    return sendJson(res, error.statusCode || 500, { ok: false, message: error.message || "Failed to ingest media." });
  }
}

function platformTemplateFromGenerationRecord(record = {}, media = {}, index = 0) {
  const taskId = String(record.taskId || Date.now()).replace(/[^a-z0-9_-]/gi, "-").slice(0, 48);
  const title = record.templateTitle || record.sceneEntryName || record.sceneName || record.companionName || record.kind || "Gallery video";
  const prompt = record.finalPrompt || record.prompt || title;
  const ratio = record.ratio || record.params?.ratio || record.params?.aspect_ratio || "16:9";
  const duration = record.duration || record.params?.duration || 5;
  const resolution = record.resolution || record.params?.resolution || "720p";
  return normalizePlatformTemplate({
    id: `gallery-record-${taskId}`,
    title: String(title || "Gallery video").slice(0, 80),
    category: "featured",
    type: "text-to-video",
    badge: "Advanced",
    previewUrl: media.previewUrl || record.localVideoUrl || record.videoUrl || record.remoteVideoUrl || "",
    coverUrl: media.coverUrl || record.localPosterUrl || record.posterUrl || record.imageUrl || "",
    hoverPreviewUrl: media.previewUrl || "",
    model: "advanced-link",
    prompt,
    requestJson: {
      model: "advanced-link",
      prompt,
      ratio,
      duration,
      resolution,
    },
    action: "advanced",
    targetTab: "advanced",
    buttonLabel: "Advanced",
    enabled: true,
    sort: index,
  }, index);
}

async function handleAdminPromoteRecordToPlatform(req, res, taskId) {
  const auth = await requireAdmin(req, res);
  if (!auth) return;
  const records = await readGenerationRecords();
  const record = records.find((entry) => entry.taskId === taskId);
  if (!record) return sendJson(res, 404, { ok: false, message: "Generation record not found." });
  const sourceVideoUrl = generationRecordVideoUrl(record);
  if (!sourceVideoUrl) return sendJson(res, 400, { ok: false, message: "This record has no video result." });

  const config = await readAppConfig();
  const platform = config.platform || {};
  const templates = Array.isArray(platform.templates) ? platform.templates : [];
  const templateId = `gallery-record-${String(record.taskId || Date.now()).replace(/[^a-z0-9_-]/gi, "-").slice(0, 48)}`;
  let media = {
    previewUrl: sourceVideoUrl,
    coverUrl: record.localPosterUrl || record.posterUrl || record.imageUrl || "",
  };
  try {
    media = await ingestPlatformTemplateMedia({
      videoUrl: absolutePublicUrl(sourceVideoUrl),
      coverUrl: media.coverUrl ? absolutePublicUrl(media.coverUrl) : "",
      templateId,
    });
  } catch (error) {
    console.warn("[promote-platform-media-failed]", taskId, error.message || error);
  }
  const nextTemplate = platformTemplateFromGenerationRecord(record, media, templates.length);
  const nextTemplates = [
    ...templates.filter((item) => item.id !== nextTemplate.id),
    nextTemplate,
  ];
  const nextConfig = {
    ...config,
    platform: {
      ...platform,
      templates: nextTemplates,
    },
    updatedAt: new Date().toISOString(),
  };
  await writeAppConfig(nextConfig);
  return sendJson(res, 200, { ok: true, template: nextTemplate, config: nextConfig });
}

