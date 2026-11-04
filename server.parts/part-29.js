async function handleAdvancedGenerate(req, res) {
  const auth = await requireUser(req, res);
  if (!auth) return;
  const externalApiCaller = auth.tokenSource === "api_token" || auth.tokenSource === "subtoken" || auth.isApiToken === true;

  const body = await readJson(req);
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
  if (publicAliyunModelBlockedForRequest(req, provider)) return sendPublicAliyunModelUnavailable(res);
  try {
    assertExplicitAdvancedProvider(providerHint);
  } catch (error) {
    return sendAdvancedValidationError(res, error);
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
    return sendJson(res, 503, { ok: false, code: "GATEWAY_TOKEN_NOT_CONFIGURED", message: "Gateway upstream token is not configured." });
  }
  if (!USE_GATEWAY_UPSTREAM && provider === "seedance" && !ARK_API_KEY && !canUseIgnexSeedance) {
    return sendJson(res, 503, { ok: false, code: "MISSING_ARK_API_KEY", message: "Seedance generation is not configured." });
  }
  if (provider === SEEDANCE25_DIRECT_PROVIDER && !ARK_API_KEY) {
    return sendJson(res, 503, { ok: false, code: "MISSING_ARK_API_KEY", message: `${SEEDANCE25_DIRECT_LABEL} generation is not configured.` });
  }
  const aliyunProviderConfigured = provider === "wan30" ? Boolean(ALIYUN_WAN30_API_KEY) : Boolean(ALIYUN_DASHSCOPE_API_KEY);
  if (!USE_GATEWAY_UPSTREAM && isAliyunVideoProvider(provider) && !aliyunProviderConfigured) {
    return sendJson(res, 503, { ok: false, code: provider === "wan30" ? "MISSING_ALIYUN_WAN30_API_KEY" : "MISSING_ALIYUN_DASHSCOPE_API_KEY", message: `${publicProviderLabel(provider)} generation is not configured.` });
  }
  let mergedBody = mergedBodyBase;
  let seedanceContentExpanded = false;
  if (provider === "seedance") {
    try {
      seedanceContentExpanded = seedanceContentHasMedia(mergedBodyBase.content);
      mergedBody = seedanceBodyWithContentMediaFields(mergedBodyBase);
    } catch (error) {
      return sendAdvancedValidationError(res, error, "Seedance content is invalid.");
    }
  }
  if (isVideoReplacementRequest && provider !== "z-image-spicy-pro") prompt = VIDEO_REPLACE_PROMPT;
  if (!prompt && !["wan30", SEEDANCE25_DIRECT_PROVIDER].includes(provider)) return sendJson(res, 400, { ok: false, message: "Prompt is required." });
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
    return sendAdvancedValidationError(res, error);
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
      return sendAdvancedValidationError(res, error, "Alibaba video resolution is invalid.");
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
    return sendJson(res, 400, { ok: false, code: "INVALID_SEEDANCE_FAST_RESOLUTION", message: "Seedance Fast does not support 1080p." });
  }
  if (provider === "seedance" && requestParams.seedanceTier === "fast" && requestParams.resolution === "4k") {
    return sendJson(res, 400, { ok: false, code: "INVALID_SEEDANCE_FAST_RESOLUTION", message: "Seedance Fast does not support 4K." });
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
        return sendJson(res, 400, { ok: false, message: "Seedance image-to-video requires imageUrl, firstFrameUrl, imageAssetId, firstFrameAssetId, or dataUrl." });
      }
    }
    if (seedanceModeNeedsEndFrame(seedanceMode)) {
      seedanceEndFrameAsset = endFramePublicUrl
        ? null
        : await createSingleSeedanceImageAssetFromInput(auth.db, auth.user, endFrameInput, { name: "Seedance end frame" });
      const rawEndFrameUrl = String(firstPresent(endFramePublicUrl, mergedBody.end_image_url, mergedBody.endImageRawUrl, "") || "").trim();
      if (rawEndFrameUrl) requestParams.end_image_url = rawEndFrameUrl;
      if (!seedanceEndFrameAsset && !rawEndFrameUrl) {
        return sendJson(res, 400, { ok: false, message: "Seedance first/last-frame mode requires endImageUrl, lastFrameUrl, endImageAssetId, lastFrameAssetId, or endImageDataUrl." });
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
      if (!seedanceVideoAsset) return sendReferenceAssetNotFound(res, "video", referenceVideoAssetIds[0]);
      try {
        validateWan27MediaKind(seedanceVideoAsset, "video", "Seedance reference video");
      } catch (error) {
        return sendJson(res, 400, { ok: false, message: publicModelText(error.message || "Seedance reference video must be a video.") });
      }
      seedanceVideoAssets = referenceVideoAssetIds.map((assetId) => auth.db.userAssets.find((asset) => asset.id === assetId && asset.userId === auth.user.id && !isSoftDeleted(asset)));
      if (seedanceVideoAssets.some((asset) => !asset)) return sendReferenceAssetNotFound(res, "video", referenceVideoAssetIds[seedanceVideoAssets.findIndex((asset) => !asset)] || "");
      try {
        seedanceVideoAssets.forEach((asset) => validateWan27MediaKind(asset, "video", "Seedance reference video"));
      } catch (error) {
        return sendJson(res, 400, { ok: false, message: publicModelText(error.message || "Seedance reference video must be a video.") });
      }
    }
    try {
      referenceImageAssetUris = seedanceReferenceAssetUrisFromBody(mergedBody);
      if (referenceImageAssetUris.length) requestParams.referenceImageAssetUris = referenceImageAssetUris;
    } catch (error) {
      return sendJson(res, error.statusCode || 400, { ok: false, message: publicModelText(error.message || "Seedance reference image assetUri is invalid.") });
    }
    try {
      referenceVideoAssetUris = seedanceReferenceVideoUrlInputsFromBody(mergedBody);
      if (referenceVideoAssetUris.length) requestParams.reference_videos = referenceVideoAssetUris;
    } catch (error) {
      return sendJson(res, error.statusCode || 400, { ok: false, message: publicModelText(error.message || "Seedance reference video is invalid.") });
    }
    try {
      referenceAudioAssetUris = seedanceReferenceAudioInputsFromBody(mergedBody);
      referenceAudioAssetIds = seedanceReferenceAudioAssetIdsFromBody(mergedBody);
    } catch (error) {
      return sendJson(res, error.statusCode || 400, { ok: false, message: publicModelText(error.message || "Seedance reference audio is invalid.") });
    }
    if (referenceAudioAssetIds.length) {
      seedanceAudioAssets = referenceAudioAssetIds.map((assetId) => auth.db.userAssets.find((asset) => asset.id === assetId && asset.userId === auth.user.id && !isSoftDeleted(asset)));
      if (seedanceAudioAssets.some((asset) => !asset)) return sendReferenceAssetNotFound(res, "audio", referenceAudioAssetIds[seedanceAudioAssets.findIndex((asset) => !asset)] || "");
      try {
        seedanceAudioAssets.forEach((asset) => validateWan27MediaKind(asset, "audio", "Seedance reference audio"));
      } catch (error) {
        return sendJson(res, 400, { ok: false, message: publicModelText(error.message || "Seedance reference audio must be audio.") });
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
        if (foundAssets.some((asset) => !asset)) return sendReferenceAssetNotFound(res, "image", referenceAssetIds[foundAssets.findIndex((asset) => !asset)] || "");
        try {
          foundAssets.forEach((asset) => validateWan27MediaKind(asset, "image", "Seedance reference image"));
        } catch (error) {
          return sendJson(res, 400, { ok: false, message: publicModelText(error.message || "Seedance reference image must be an image.") });
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
      if (!asset) return sendReferenceAssetNotFound(res, "image", assetId);
      try {
        validateWan27MediaKind(asset, "image", "Extra reference image");
      } catch (error) {
        return sendJson(res, 400, { ok: false, message: error.message || "Extra reference image must be an image." });
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
      return sendAdvancedValidationError(res, error, "Seedance media input is invalid.");
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
      if (!userAsset) return sendReferenceAssetNotFound(res, "image", firstAssetId);
    }
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
    const resolved = await resolveAliyunVideoMedia({
      db: auth.db,
      user: auth.user,
      body: mergedBody,
      requestParams,
      fallbackAsset: userAsset,
      skipWan30Validation: externalApiCaller,
    });
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
      if (isVideoTemplateRequest) {
        return sendJson(res, error.statusCode || 400, { ok: false, code: error.code || "INVALID_VIDEO_INPUT", message: "Video input is invalid." });
      }
      return sendAdvancedValidationError(res, error, "Alibaba video input is invalid.");
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
  const latestDb = await readDb();
  const latestUser = latestDb.users.find((user) => user.id === auth.user.id) || auth.user;
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
  if (isVegaProvider(provider)) {
    const mediaAssets = Array.isArray(record.mediaAssets) ? record.mediaAssets : [];
    const explicitMediaMode = firstPresent(record.mediaMode, params.mediaMode, params.seedanceMode, params.functionMode, "");
    const requestedDraftTaskId = String(firstPresent(params.draftTaskId, params.draft_task_id, "") || "").trim();
    const assetUrl = (asset, keys = []) => String(keys.map((key) => asset?.[key]).find(Boolean) || "").trim();
    const urlsByType = (type, keys) => mediaAssets
      .filter((asset) => asset?.type === type)
      .map((asset) => assetUrl(asset, keys))
      .filter(Boolean);
    const uniqueUrls = (values) => [...new Set((Array.isArray(values) ? values : []).map((value) => String(value || "").trim()).filter(Boolean))];
    const firstFrameUrl = String(firstPresent(params.firstFrameUrl, params.first_frame_url, urlsByType("first_frame", ["url", "imageUrl", "image_url"])) || "").trim();
    const lastFrameUrl = String(firstPresent(params.lastFrameUrl, params.last_frame_url, urlsByType("last_frame", ["url", "imageUrl", "image_url"])) || "").trim();
    const referenceImages = uniqueUrls([
      ...urlsByType("reference_image", ["url", "imageUrl", "image_url"]),
      ...(Array.isArray(params.referenceImages) ? params.referenceImages.map((item) => typeof item === "string" ? item : item?.url || item?.imageUrl || item?.image_url) : []),
      ...(Array.isArray(params.referenceImageUrls) ? params.referenceImageUrls : []),
    ]).filter((url) => url !== firstFrameUrl && url !== lastFrameUrl);
    const referenceVideos = uniqueUrls([
      ...urlsByType("reference_video", ["url", "videoUrl", "video_url"]),
      ...(Array.isArray(params.referenceVideos) ? params.referenceVideos.map((item) => typeof item === "string" ? item : item?.url || item?.videoUrl || item?.video_url) : []),
      ...(Array.isArray(params.referenceVideoUrls) ? params.referenceVideoUrls : []),
    ]);
    const referenceAudios = uniqueUrls([
      ...urlsByType("reference_audio", ["url", "audioUrl", "audio_url"]),
      ...(Array.isArray(params.referenceAudios) ? params.referenceAudios.map((item) => typeof item === "string" ? item : item?.url || item?.audioUrl || item?.audio_url) : []),
      ...(Array.isArray(params.referenceAudioUrls) ? params.referenceAudioUrls : []),
    ]);
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
    } else if (regeneratedMedia.mode === "reference_video") {
      body.referenceImages = regeneratedMedia.referenceImages.map((url) => ({ url }));
      body.referenceVideos = regeneratedMedia.referenceVideos.map((url) => ({ url }));
      body.referenceAudios = regeneratedMedia.referenceAudios.map((url) => ({ url }));
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
  if (source.includes("advanced") || ["seedance", "seedance25", SEEDANCE25_DIRECT_PROVIDER, "aliyun-wan30", "aliyun-wan27", "aliyun-happyhorse"].includes(String(record.provider || "").toLowerCase())) {
    return handleAdvancedGenerate(withJsonBody(req, advancedRegenerateBody(record)), res);
  }
  return sendJson(res, 400, { ok: false, message: "This record cannot be regenerated yet." });
}

async function handleAdminUploadPlatformCover(req, res) {
  const auth = await requireAdmin(req, res);
  if (!auth) return;
  const body = await readJson(req);
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

