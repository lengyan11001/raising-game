async function handleWan27ImageEdit(req, res) {
  const auth = await requireUser(req, res);
  if (!auth) return;
  if (!USE_GATEWAY_UPSTREAM && !ALIYUN_DASHSCOPE_API_KEY) {
    return sendJson(res, 503, { ok: false, code: "MISSING_ALIYUN_DASHSCOPE_API_KEY", message: "Wan2.7 image generation is not configured." });
  }

  const body = await readJson(req);
  const bodyParams = requestParamsFromBody(body);
  const mergedBody = { ...bodyParams, ...body };
  const config = await readAppConfig();
  const templateId = String(firstPresent(body.templateId, bodyParams.templateId, "") || "").trim();
  const template = findImageEditTemplate(config, templateId);
  const assetIds = imageEditAssetIdsFromBody(mergedBody);
  let externalImageUrls = imageEditUrlsFromBody(mergedBody);
  const originalSourceImageCount = assetIds.length + externalImageUrls.length;
  if (template && imageEditTemplateShouldUsePreview(template, originalSourceImageCount)) {
    const previewUrl = publicHttpUrlForUpstream(template.previewUrl);
    if (previewUrl && !externalImageUrls.includes(previewUrl)) externalImageUrls = [...externalImageUrls, previewUrl];
  }
  const prompt = template
    ? imageEditPromptFromTemplate(template, {
      sourceImageCount: originalSourceImageCount,
      userPrompt: firstNonEmptyText(body.prompt, bodyParams.prompt),
    })
    : firstNonEmptyText(body.prompt, bodyParams.prompt);
  if (!prompt) return sendJson(res, 400, { ok: false, message: "Prompt is required." });
  const asyncResponse = boolFromRequest(firstPresent(mergedBody.async, mergedBody.asyncResponse, mergedBody.returnImmediately), false);
  const invalidExternalImageUrl = externalImageUrls.find((url) => !isPublicHttpUrl(url));
  if (invalidExternalImageUrl) {
    return sendJson(res, 400, { ok: false, code: "INVALID_IMAGE_URL", message: "Wan2.7 image URLs must be public http(s) URLs." });
  }
  const sourceAssets = [];
  for (const assetId of assetIds) {
    const asset = auth.db.userAssets.find((entry) => entry.id === assetId && entry.userId === auth.user.id && !isSoftDeleted(entry));
    if (!asset) return sendJson(res, 404, { ok: false, message: `Asset not found: ${assetId}` });
    if (!String(asset.mime || "").toLowerCase().startsWith("image/")) {
      return sendJson(res, 400, { ok: false, message: "Wan2.7 image edit only accepts image assets." });
    }
    sourceAssets.push(asset);
  }
  const sourceAssetUrlKeys = new Set(sourceAssets.flatMap((asset) => [
    asset.publicUrl,
    asset.objectStorageUrl,
    asset.cdnUrl,
    asset.sourceImageUrl,
    publicUrlForAssetPath(asset.localUrl),
  ]).map((url) => (isPublicHttpUrl(url) ? publicHttpUrlForUpstream(url) : "")).filter(Boolean));
  externalImageUrls = externalImageUrls.filter((url) => !sourceAssetUrlKeys.has(publicHttpUrlForUpstream(url)));
  if (assetIds.length + externalImageUrls.length > 9) {
    return sendJson(res, 400, { ok: false, code: "TOO_MANY_IMAGES", message: "Wan2.7 image edit supports 0 to 9 input images." });
  }

  const pricingProvider = normalizeAdvancedProvider(firstPresent(
    mergedBody.advancedProviderId,
    mergedBody.provider,
    mergedBody.modelProvider,
    "wan27-image",
  ));
  const hasReferenceImages = sourceAssets.length + externalImageUrls.length > 0;
  if (pricingProvider === "z-image-spicy-pro" && hasReferenceImages) {
    return sendJson(res, 400, {
      ok: false,
      code: "Z_IMAGE_REFERENCE_UNSUPPORTED",
      message: "Z-Image Spicy Pro only supports text-to-image. Choose Qwen Image Edit Spicy for reference-image editing.",
    });
  }
  if (pricingProvider === "qwen-image-edit-spicy" && !hasReferenceImages) {
    return sendJson(res, 400, {
      ok: false,
      code: "QWEN_IMAGE_EDIT_REFERENCE_REQUIRED",
      message: "Qwen Image Edit Spicy requires at least one input image.",
    });
  }
  const pricingConfig = normalizeAdvancedPricing(config.platform?.advancedPricing).wan27ImagePro;
  const imageOptions = wan27ImageRequestOptions(mergedBody, {
    defaultModel: pricingConfig.model || WAN27_IMAGE_PRO_MODEL,
    defaultRatio: pricingConfig.defaultRatio || "9:16",
    defaultResolution: pricingConfig.defaultResolution || "2K",
    includeSizeSelection: pricingProvider !== "qwen-image-edit-spicy",
  });
  const { ratio, resolution, model } = imageOptions;
  if (resolution === "4K" && hasReferenceImages) {
    return sendJson(res, 400, { ok: false, code: "WAN27_IMAGE_4K_TEXT_ONLY", message: "Wan2.7 Image 4K is only available for text-to-image without reference images." });
  }
  const pricing = wan27ImageModifyPricing(config, auth.user, {
    ...pricingContextForAuth(auth),
    provider: pricingProvider,
  });
  const cost = pricing.credits;
  if (auth.user.credits < cost) {
    return sendJson(res, 402, insufficientCreditsPayload(cost, auth.user.credits));
  }
  try {
    assertSubtokenCanSpend(auth, cost);
  } catch (error) {
    return sendJson(res, error.statusCode || 402, error.payload || { ok: false, code: error.code || "SUBTOKEN_UNAVAILABLE", message: error.message });
  }

  const taskId = localGenerationTaskId("img");
  const previewUrls = [...new Set([
    ...sourceAssets.map((asset) => asset.localUrl || asset.publicUrl || ""),
    ...externalImageUrls,
  ].filter(Boolean))];
  const initialRecord = {
    taskId,
    status: "submitting",
    model,
    source: "asset-image-modify",
    kind: "asset-image",
    provider: "aliyun-wan27-image",
    upstreamSource: USE_GATEWAY_UPSTREAM ? "gateway" : "direct",
    userId: auth.user.id,
    userAssetIds: sourceAssets.map((asset) => asset.id),
    userAssetId: sourceAssets[0]?.id || "",
    imageUrl: previewUrls[0] || "",
    imageUrls: previewUrls,
    sourceImageUrl: previewUrls[0] || "",
    sourceImageUrls: previewUrls,
    prompt,
    finalPrompt: prompt,
    params: wan27ImageParamsForRecord(mergedBody, imageOptions, {
      provider: "wan27-image",
      action: previewUrls.length ? "image_edit" : "text_to_image",
      imageCount: previewUrls.length,
    }),
    ...(ratio ? { ratio } : {}),
    ...(resolution ? { resolution } : {}),
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
    queryResponse: null,
    remoteImageUrl: "",
    localImageUrl: "",
    error: "",
    apiTokenId: auth.tokenRecord?.id || "",
    apiTokenName: auth.tokenRecord?.name || "",
    apiTokenType: auth.tokenRecord?.quotaType || "",
    apiTokenSource: auth.tokenSource || "",
  };
  await updateAssetImageModifyRecord(taskId, initialRecord, "wan27-image-edit-create");
  if (cost > 0) {
    await chargeUserWithSubtoken(auth, {
      cost,
      type: "asset_image_modify",
      taskId,
      meta: {
        taskId,
        assetIds: sourceAssets.map((asset) => asset.id),
        externalImageCount: externalImageUrls.length,
        model,
        ratio,
        resolution,
        imageCount: previewUrls.length,
        baseCredits: pricing.baseCredits,
        originalCost: pricing.originalCredits,
        pricingMultiplier: pricing.userPricingMultiplier,
        purchaseCnyPerImage: pricing.purchaseCnyPerImage,
        saleCnyPerImage: pricing.saleCnyPerImage,
        pricingSource: pricing.source,
      },
    });
    if (!dbEnabled()) await writeDb(auth.db);
  }

  const runWan27ImageEditTask = async ({ waitForResult = true, sendResponse = true } = {}) => {
    const preparedAssets = [];
    for (const asset of sourceAssets) {
      preparedAssets.push(await ensurePublicUrlForUserMediaAsset(auth.db, asset));
    }
    const preparedAssetUrls = preparedAssets.map((asset) => {
      const value = asset.publicUrl || publicUrlForLocalAsset(asset) || "";
      return signedOssCdnUrlForUpstream(value, {
        key: asset.storageKey || asset.objectStorageKey || asset.r2Key || "",
      }) || publicHttpUrlForUpstream(value);
    });
    if (preparedAssetUrls.some((url) => !url)) {
      const error = new Error("Failed to prepare all source images for Wan2.7 image edit.");
      error.statusCode = 502;
      throw error;
    }
    const publicImageUrls = [...new Set([
      ...preparedAssetUrls,
      ...externalImageUrls,
    ])];
    const referenceUrls = [...new Set([
      ...preparedAssets.map((asset) => asset.localUrl || asset.publicUrl || ""),
      ...externalImageUrls,
    ].filter(Boolean))];
    await updateAssetImageModifyRecord(taskId, {
      imageUrl: referenceUrls[0] || "",
      imageUrls: referenceUrls,
      sourceImageUrl: referenceUrls[0] || "",
      sourceImageUrls: referenceUrls,
      status: "running",
    }, "wan27-image-edit-references-ready");
    const submitted = publicImageUrls.length === 0
      ? (USE_GATEWAY_UPSTREAM ? await gatewaySubmitWan27ImageEditTask({
        imageUrls: [],
        prompt,
        ratio,
        resolution,
        model,
        includeSizeSelection: imageOptions.includeSizeSelection,
        input: imageOptions.input,
        parameters: imageOptions.parameters,
        waitForResult,
      }) : await submitWan27ImageTextGenerate({
        prompt,
        ratio,
        resolution,
        model,
        includeSizeSelection: imageOptions.includeSizeSelection,
        input: imageOptions.input,
        parameters: imageOptions.parameters,
        waitForResult,
      }))
      : (USE_GATEWAY_UPSTREAM ? await gatewaySubmitWan27ImageEditTask({
        imageUrls: publicImageUrls,
        prompt,
        ratio,
        resolution,
        model,
        includeSizeSelection: imageOptions.includeSizeSelection,
        input: imageOptions.input,
        parameters: imageOptions.parameters,
        waitForResult,
      }) : await submitWan27ImageModify({
        imageUrls: publicImageUrls,
        prompt,
        ratio,
        resolution,
        model,
        includeSizeSelection: imageOptions.includeSizeSelection,
        input: imageOptions.input,
        parameters: imageOptions.parameters,
        waitForResult,
      }));
    const imageUrl = submitted.task.imageUrls[0];
    await updateAssetImageModifyRecord(taskId, {
      upstreamTaskId: submitted.task.taskId || "",
      awaitingUpstreamTask: !imageUrl && !isFailedStatus(submitted.task.status),
      status: imageUrl ? (submitted.task.status || "succeeded") : (submitted.task.status || "running"),
      upstreamPayload: submitted.payload,
      createResponse: submitted.raw,
      remoteImageUrl: imageUrl || "",
      error: imageUrl || !isFailedStatus(submitted.task.status) ? "" : (submitted.task.error || "Wan2.7 image edit returned no image."),
    }, "wan27-image-edit-submit");
    if (!imageUrl) {
      if (!waitForResult && !isFailedStatus(submitted.task.status)) return null;
      const error = new Error(submitted.task.error || "Wan2.7 image edit returned no image.");
      error.statusCode = 502;
      error.payload = submitted.raw;
      throw error;
    }
    const savedImage = await saveRemoteGeneratedImage(taskId, imageUrl);
    await updateAssetImageModifyRecord(taskId, {
      status: "succeeded",
      awaitingUpstreamTask: false,
      imageResultUrl: savedImage.cdnImageUrl || imageUrl,
      localImageUrl: "",
      localImagePath: "",
      cdnImageUrl: savedImage.cdnImageUrl,
      storageProvider: savedImage.storageProvider || "",
      storageKey: savedImage.storageKey || "",
      cdnError: savedImage.cdnError,
      remoteImageUrl: imageUrl,
      finalCredits: cost,
      originalFinalCredits: pricing.originalCredits ?? cost,
      billingStatus: cost > 0 ? "settled" : "free",
      billingSettledAt: new Date().toISOString(),
      error: "",
    }, "wan27-image-edit-succeeded");
    const latestUser = (auth.db.users || []).find((entry) => entry.id === auth.user.id) || auth.user;
    const publicRecord = publicGenerationRecord(await getGenerationRecord(taskId) || { taskId }, generationRecordResponseOptionsForAuth(auth));
    const result = {
      ok: true,
      taskId,
      upstreamTaskId: submitted.task.taskId || "",
      imageUrl: publicRecord.imageResultUrl || savedImage?.localImageUrl || "",
      sourceAssets: sourceAssets.map(publicUserAsset),
      sourceAsset: sourceAssets[0] ? publicUserAsset(sourceAssets[0]) : null,
      sourceImageUrls: referenceUrls,
      user: userView(latestUser),
      pricing,
      cost,
      record: publicRecord,
      params: {
        ...exposedWan27ImageParams(imageOptions),
        imageCount: referenceUrls.length,
      },
    };
    return sendResponse ? sendJson(res, 200, result) : result;
  };

  if (asyncResponse) {
    runWan27ImageEditTask({ waitForResult: false, sendResponse: false }).catch(async (error) => {
      const errorInfo = normalizeErrorPayload(error);
      console.warn("[wan27-image-edit-background-error]", taskId, error.message || error);
      let refunded = cost <= 0;
      let refundError = null;
      if (cost > 0) {
        const result = await refundCreditsWithSubtoken(auth, auth.user.id, cost, "asset_image_modify_refund", {
          taskId,
          assetIds: sourceAssets.map((asset) => asset.id),
          error: error.message || "Wan2.7 image edit failed.",
        }, { logTag: "wan27-image-edit-background" });
        refunded = result.refunded;
        refundError = result.error;
      }
      await updateAssetImageModifyRecord(taskId, {
        status: "failed",
        awaitingUpstreamTask: false,
        error: errorInfo.message || "Wan2.7 image edit failed.",
        code: errorInfo.code || "",
        errorPayload: errorInfo.payload || null,
        createResponse: errorInfo.payload || null,
        finalCredits: 0,
        originalFinalCredits: 0,
        billingStatus: cost <= 0 ? "free" : refunded ? "refunded" : "pre_deducted",
        billingError: refundError ? `Refund failed: ${refundError.message || refundError}` : "",
        billingSettledAt: refunded ? new Date().toISOString() : "",
        failedAt: new Date().toISOString(),
      }, "wan27-image-edit-background-failed");
    });
    const latestUser = (auth.db.users || []).find((entry) => entry.id === auth.user.id) || auth.user;
    return sendJson(res, 202, {
      ok: true,
      taskId,
      status: "submitting",
      async: true,
      user: userView(latestUser),
      pricing,
      cost,
      record: publicGenerationRecord(await getGenerationRecord(taskId) || { taskId }, generationRecordResponseOptionsForAuth(auth)),
      params: {
        ...exposedWan27ImageParams(imageOptions),
        imageCount: previewUrls.length,
      },
    });
  }

  try {
    return await runWan27ImageEditTask({ waitForResult: true, sendResponse: true });
  } catch (error) {
    const errorInfo = normalizeErrorPayload(error);
    console.warn("[wan27-image-edit-error]", taskId, errorInfo.message || error.message || error, JSON.stringify(errorInfo.payload || {}).slice(0, 1000));
    let refunded = cost <= 0;
    let refundError = null;
    if (cost > 0) {
      const result = await refundCreditsWithSubtoken(auth, auth.user.id, cost, "asset_image_modify_refund", {
        taskId,
        assetIds: sourceAssets.map((asset) => asset.id),
        error: error.message || "Wan2.7 image edit failed.",
      }, { logTag: "wan27-image-edit" });
      refunded = result.refunded;
      refundError = result.error;
    }
    await updateAssetImageModifyRecord(taskId, {
      status: "failed",
      awaitingUpstreamTask: false,
      error: errorInfo.message || "Wan2.7 image edit failed.",
      code: errorInfo.code || "",
      errorPayload: errorInfo.payload || null,
      createResponse: errorInfo.payload || null,
      finalCredits: 0,
      originalFinalCredits: 0,
      billingStatus: cost <= 0 ? "free" : refunded ? "refunded" : "pre_deducted",
      billingError: refundError ? `Refund failed: ${refundError.message || refundError}` : "",
      billingSettledAt: refunded ? new Date().toISOString() : "",
      failedAt: new Date().toISOString(),
    }, "wan27-image-edit-failed");
    return sendJson(res, error.statusCode || 502, {
      ok: false,
      message: error.message || "Wan2.7 image edit failed.",
      code: error.code || "",
      taskId,
      record: publicGenerationRecord(await getGenerationRecord(taskId) || { taskId }, generationRecordResponseOptionsForAuth(auth)),
      payload: error.payload || null,
    });
  }
}

async function handleModifyUserAssetImage(req, res, assetId) {
  const auth = await requireUser(req, res);
  if (!auth) return;
  if (!USE_GATEWAY_UPSTREAM && !ALIYUN_DASHSCOPE_API_KEY) {
    return sendJson(res, 503, { ok: false, code: "MISSING_ALIYUN_DASHSCOPE_API_KEY", message: "Wan2.7 image generation is not configured." });
  }
  const asset = auth.db.userAssets.find((entry) => entry.id === assetId && entry.userId === auth.user.id && !isSoftDeleted(entry));
  if (!asset) return sendJson(res, 404, { ok: false, message: "Asset not found." });
  if (!String(asset.mime || "").toLowerCase().startsWith("image/")) {
    return sendJson(res, 400, { ok: false, message: "Only image assets can be modified." });
  }

  const body = await readJson(req);
  const prompt = String(body.prompt || "").trim();
  if (!prompt) return sendJson(res, 400, { ok: false, message: "Prompt is required." });
  const config = await readAppConfig();
  const pricingConfig = normalizeAdvancedPricing(config.platform?.advancedPricing).wan27ImagePro;
  const pricingProvider = normalizeAdvancedProvider(firstPresent(
    body.advancedProviderId,
    requestParamsFromBody(body).advancedProviderId,
    body.provider,
    requestParamsFromBody(body).provider,
    "wan27-image",
  ));
  if (pricingProvider === "z-image-spicy-pro") {
    return sendJson(res, 400, {
      ok: false,
      code: "Z_IMAGE_REFERENCE_UNSUPPORTED",
      message: "Z-Image Spicy Pro only supports text-to-image. Choose Qwen Image Edit Spicy for reference-image editing.",
    });
  }
  const imageOptions = wan27ImageRequestOptions(body, {
    defaultModel: pricingConfig.model || WAN27_IMAGE_PRO_MODEL,
    defaultRatio: pricingConfig.defaultRatio || "9:16",
    defaultResolution: pricingConfig.defaultResolution || "2K",
    includeSizeSelection: pricingProvider !== "qwen-image-edit-spicy",
  });
  const { ratio, resolution, model } = imageOptions;
  if (resolution === "4K") {
    return sendJson(res, 400, { ok: false, code: "WAN27_IMAGE_4K_TEXT_ONLY", message: "Wan2.7 Image 4K is only available for text-to-image without reference images." });
  }
  const pricing = wan27ImageModifyPricing(config, auth.user, {
    ...pricingContextForAuth(auth),
    provider: pricingProvider,
  });
  const cost = pricing.credits;
  if (auth.user.credits < cost) {
    return sendJson(res, 402, insufficientCreditsPayload(cost, auth.user.credits));
  }
  try {
    assertSubtokenCanSpend(auth, cost);
  } catch (error) {
    return sendJson(res, error.statusCode || 402, error.payload || { ok: false, code: error.code || "SUBTOKEN_UNAVAILABLE", message: error.message });
  }

  const taskId = localGenerationTaskId("img");
  const assetPreviewUrl = asset.localUrl || asset.publicUrl || "";
  const initialRecord = {
    taskId,
    status: "submitting",
    model,
    source: "asset-image-modify",
    kind: "asset-image",
    provider: "aliyun-wan27-image",
    upstreamSource: USE_GATEWAY_UPSTREAM ? "gateway" : "direct",
    userId: auth.user.id,
    userAssetId: asset.id,
    imageUrl: assetPreviewUrl,
    sourceImageUrl: assetPreviewUrl,
    prompt,
    finalPrompt: prompt,
    params: wan27ImageParamsForRecord(body, imageOptions, {
      provider: "wan27-image",
      action: "modify",
    }),
    ...(ratio ? { ratio } : {}),
    ...(resolution ? { resolution } : {}),
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
    queryResponse: null,
    remoteImageUrl: "",
    localImageUrl: "",
    error: "",
    apiTokenId: auth.tokenRecord?.id || "",
    apiTokenName: auth.tokenRecord?.name || "",
    apiTokenType: auth.tokenRecord?.quotaType || "",
    apiTokenSource: auth.tokenSource || "",
  };
  await updateAssetImageModifyRecord(taskId, initialRecord, "asset-image-modify-create");
  if (cost > 0) {
    await chargeUserWithSubtoken(auth, {
      cost,
      type: "asset_image_modify",
      taskId,
      meta: {
        taskId,
        assetId,
        model,
        ratio,
        resolution,
        baseCredits: pricing.baseCredits,
        originalCost: pricing.originalCredits,
        pricingMultiplier: pricing.userPricingMultiplier,
        purchaseCnyPerImage: pricing.purchaseCnyPerImage,
        saleCnyPerImage: pricing.saleCnyPerImage,
        pricingSource: pricing.source,
      },
    });
    if (!dbEnabled()) await writeDb(auth.db);
  }

  try {
    const publicAsset = await ensurePublicUrlForUserMediaAsset(auth.db, asset);
    await updateAssetImageModifyRecord(taskId, {
      imageUrl: publicAsset.localUrl || publicAsset.publicUrl || assetPreviewUrl,
      sourceImageUrl: publicAsset.localUrl || publicAsset.publicUrl || assetPreviewUrl,
      status: "running",
    }, "asset-image-modify-reference-ready");
    const upstreamImageUrl = publicHttpUrlForUpstream(publicAsset.publicUrl || publicUrlForLocalAsset(publicAsset));
    const submitted = USE_GATEWAY_UPSTREAM ? await gatewaySubmitWan27ImageEditTask({
      imageUrl: upstreamImageUrl,
      prompt,
      ratio,
      resolution,
      model,
      includeSizeSelection: imageOptions.includeSizeSelection,
      input: imageOptions.input,
      parameters: imageOptions.parameters,
    }) : await submitWan27ImageModify({
      imageUrl: upstreamImageUrl,
      prompt,
      ratio,
      resolution,
      model,
      includeSizeSelection: imageOptions.includeSizeSelection,
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
      error: imageUrl ? "" : (submitted.task.error || "Wan2.7 image modify returned no image."),
    }, "asset-image-modify-submit");
    if (!imageUrl) {
      const error = new Error(submitted.task.error || "Wan2.7 image modify returned no image.");
      error.statusCode = 502;
      error.payload = submitted.raw;
      throw error;
    }
    const savedImage = await saveRemoteGeneratedImage(taskId, imageUrl);
    await updateAssetImageModifyRecord(taskId, {
      status: "succeeded",
      awaitingUpstreamTask: false,
      imageResultUrl: savedImage.cdnImageUrl || imageUrl,
      localImageUrl: "",
      localImagePath: "",
      cdnImageUrl: savedImage.cdnImageUrl,
      storageProvider: savedImage.storageProvider || "",
      storageKey: savedImage.storageKey || "",
      cdnError: savedImage.cdnError,
      remoteImageUrl: imageUrl,
      finalCredits: cost,
      originalFinalCredits: pricing.originalCredits ?? cost,
      billingStatus: cost > 0 ? "settled" : "free",
      billingSettledAt: new Date().toISOString(),
      error: "",
    }, "asset-image-modify-succeeded");
    const latestUser = (auth.db.users || []).find((entry) => entry.id === auth.user.id) || auth.user;
    const publicRecord = publicGenerationRecord(await getGenerationRecord(taskId) || { taskId }, generationRecordResponseOptionsForAuth(auth));
    return sendJson(res, 200, {
      ok: true,
      taskId,
      upstreamTaskId: submitted.task.taskId || "",
      imageUrl: publicRecord.imageResultUrl || savedImage?.localImageUrl || "",
      sourceAsset: publicUserAsset(asset),
      user: userView(latestUser),
      pricing,
      cost,
      record: publicRecord,
      params: exposedWan27ImageParams(imageOptions),
    });
  } catch (error) {
    const errorInfo = normalizeErrorPayload(error);
    console.warn("[asset-image-modify-error]", taskId, errorInfo.message || error.message || error, JSON.stringify(errorInfo.payload || {}).slice(0, 1000));
    let refunded = cost <= 0;
    let refundError = null;
    if (cost > 0) {
      const result = await refundCreditsWithSubtoken(auth, auth.user.id, cost, "asset_image_modify_refund", {
        taskId,
        assetId,
        error: error.message || "Wan2.7 image edit failed.",
      }, { logTag: "asset-image-modify" });
      refunded = result.refunded;
      refundError = result.error;
    }
    await updateAssetImageModifyRecord(taskId, {
      status: "failed",
      awaitingUpstreamTask: false,
      error: errorInfo.message || "Wan2.7 image modify failed.",
      code: errorInfo.code || "",
      errorPayload: errorInfo.payload || null,
      createResponse: errorInfo.payload || null,
      finalCredits: 0,
      originalFinalCredits: 0,
      billingStatus: cost <= 0 ? "free" : refunded ? "refunded" : "pre_deducted",
      billingError: refundError ? `Refund failed: ${refundError.message || refundError}` : "",
      billingSettledAt: refunded ? new Date().toISOString() : "",
      failedAt: new Date().toISOString(),
    }, "asset-image-modify-failed");
    return sendJson(res, error.statusCode || 502, {
      ok: false,
      message: error.message || "Wan2.7 image modify failed.",
      code: error.code || "",
      taskId,
      record: publicGenerationRecord(await getGenerationRecord(taskId) || { taskId }, generationRecordResponseOptionsForAuth(auth)),
      payload: error.payload || null,
    });
  }
}

async function handleListUserAssets(req, res, url = null) {
  const startedAt = baselineMetrics.monoNow();
  const auth = await requireUser(req, res, { loadDb: false });
  const authMs = baselineMetrics.monoNow() - startedAt;
  try { baselineMetrics.recordTiming("user_assets:auth", authMs); } catch {}
  if (!auth) return;
  const params = url?.searchParams || new URLSearchParams();
  const q = String(params.get("q") || "").trim().toLowerCase();
  const type = String(params.get("type") || "").trim().toLowerCase();
  const { page, limit, offset } = pagingFromUrl(url || new URL("http://localhost"), { defaultLimit: 8, maxLimit: 50 });
  if (dbEnabled()) {
    const dbStartedAt = baselineMetrics.monoNow();
    const result = await getUserAssetsPageFromDb({ userId: auth.user.id, page, limit, queryText: q, type });
    try { baselineMetrics.recordTiming("user_assets:db", baselineMetrics.monoNow() - dbStartedAt); } catch {}
    if (result) {
      const serializeStartedAt = baselineMetrics.monoNow();
      const payload = { ok: true, assets: result.assets.map(publicUserAsset).filter((asset) => !isAutoPresetReferenceAsset(asset)), page: result.page, limit: result.limit, total: result.total, totalPages: result.totalPages };
      try { baselineMetrics.recordTiming("user_assets:serialize", baselineMetrics.monoNow() - serializeStartedAt); } catch {}
      return sendJson(res, 200, payload);
    }
  }
  const filtered = auth.db.userAssets
    .filter((asset) => asset.userId === auth.user.id && !isSoftDeleted(asset) && !isAutoPresetReferenceAsset(asset))
    .map(publicUserAsset)
    .filter((asset) => !type || asset.kind === type)
    .filter((asset) => !q || [asset.name, asset.id, asset.mime].some((value) => String(value || "").toLowerCase().includes(q)))
    .sort((left, right) => String(right.createdAt || "").localeCompare(String(left.createdAt || "")));
  const total = filtered.length;
  const assets = filtered.slice(offset, offset + limit);
  return sendJson(res, 200, {
    ok: true,
    assets,
    page,
    limit,
    total,
    totalPages: Math.max(1, Math.ceil(total / limit)),
  });
}

async function handleResolveUserAssets(req, res) {
  const auth = await requireUser(req, res);
  if (!auth) return;
  const body = await readJson(req);
  const assetIds = [...new Set(arrayFromBody(body.assetIds || body.ids)
    .map((id) => String(id || "").trim())
    .filter(Boolean))].slice(0, 50);
  const assets = assetIds
    .map((assetId) => auth.db.userAssets.find((asset) => asset.id === assetId && asset.userId === auth.user.id && !isSoftDeleted(asset)))
    .filter(Boolean);
  const requirePublicUrl = Boolean(body.requirePublicUrl) || isVegaProvider(body.provider);
  const resolvedAssets = [];
  for (const asset of assets) {
    const resolved = requirePublicUrl ? await ensureVegaPublicUrlForUserAsset(auth.db, asset) : asset;
    resolvedAssets.push(await ensureUserAssetVideoPoster(auth.db, resolved));
  }
  const foundIds = new Set(assets.map((asset) => asset.id));
  return sendJson(res, 200, {
    ok: true,
    assets: resolvedAssets.map(publicUserAsset),
    missingAssetIds: assetIds.filter((assetId) => !foundIds.has(assetId)),
  });
}

async function handleDeleteUserAsset(req, res, assetId) {
  const auth = await requireUser(req, res);
  if (!auth) return;
  const asset = auth.db.userAssets.find((entry) => entry.id === assetId && entry.userId === auth.user.id);
  if (!asset || isSoftDeleted(asset)) {
    return sendJson(res, 404, { ok: false, message: "Asset not found." });
  }
  const nowIso = new Date().toISOString();
  asset.deletedAt = nowIso;
  asset.updatedAt = nowIso;
  auth.db.userAssets = auth.db.userAssets.map((entry) => (entry.id === asset.id ? asset : entry));
  if (dbEnabled()) await upsertUserAssetInDb(asset);
  else await writeDb(auth.db);
  return sendJson(res, 200, { ok: true, asset });
}


function publicUserCharacter(character) {
  if (!character) return null;
  const creator = plainObject(character.creator);
  const safeMedia = (value = "", { absolute = false } = {}) => {
    const text = String(value || "").trim();
    const signed = localMediaDeliveryUrl(text, { absolute });
    if (signed) return signed;
    return isLocalProtectedMediaAssetUrl(text) ? "" : text;
  };
  const localImageUrl = safeMedia(character.localImageUrl || "");
  const localPosterUrl = safeMedia(character.posterUrl || character.localImageUrl || "");
  const localSourceImageUrl = safeMedia(character.sourceImageUrl || character.localImageUrl || character.posterUrl || "");
  const publicImageUrl = safeMedia(character.publicImageUrl || "", { absolute: isPublicHttpUrl(character.publicImageUrl || "") });
  const cdnImageUrl = safeMedia(character.cdnImageUrl || "", { absolute: isPublicHttpUrl(character.cdnImageUrl || "") });
  const posterUrl = publicImageUrl || cdnImageUrl || localPosterUrl || localImageUrl || "";
  const sourceImageUrl = publicImageUrl || cdnImageUrl || localSourceImageUrl || localImageUrl || localPosterUrl || "";
  const videoUrl = safeMedia(DISABLE_GENERATED_R2_STORAGE
    ? (character.remoteVideoUrl || character.videoUrl || character.cdnVideoUrl || character.localVideoUrl || "")
    : (character.cdnVideoUrl || character.videoUrl || character.localVideoUrl || character.remoteVideoUrl || ""));
  return {
    id: character.id,
    name: character.name || "My character",
    title: character.title || "My drama",
    posterUrl,
    localImageUrl,
    sourceImageUrl,
    publicImageUrl,
    cdnImageUrl,
    imageTaskId: character.imageTaskId || "",
    imageRemoteUrl: character.imageRemoteUrl || "",
    videoUrl,
    remoteVideoUrl: safeMedia(character.remoteVideoUrl || "", { absolute: isPublicHttpUrl(character.remoteVideoUrl || "") }),
    cdnVideoUrl: safeMedia(character.cdnVideoUrl || "", { absolute: isPublicHttpUrl(character.cdnVideoUrl || "") }),
    taskId: character.taskId || "",
    status: character.status || "",
    error: character.error || "",
    referenceAssetUri: character.referenceAssetUri || "",
    prompt: character.prompt || "",
    creator: creator && Object.keys(creator).length ? creator : null,
    callMe: String(creator.callMe || character.callMe || ""),
    personalityTags: Array.isArray(creator.tags) ? creator.tags.map(String).slice(0, 3) : (Array.isArray(character.personalityTags) ? character.personalityTags.map(String).slice(0, 3) : []),
    voiceStyle: String(creator.voice || character.voiceStyle || ""),
    relationStart: String(creator.relation || character.relationStart || ""),
    greeting: String(creator.intro || character.greeting || ""),
    isPublic: creator.isPublic === true || character.isPublic === true,
    visibility: creator.isPublic === true || character.isPublic === true ? "public" : "private",
    sceneVideos: publicSceneVideoMap(character.sceneVideos || {}),
    deletedAt: character.deletedAt || "",
    createdAt: character.createdAt || "",
    updatedAt: character.updatedAt || "",
  };
}

function apizTaskIdFromResponse(value = {}) {
  return String(
    value?.task_id ||
      value?.taskId ||
      value?.id ||
      value?.data?.task_id ||
      value?.data?.taskId ||
      value?.data?.id ||
      value?.task?.task_id ||
      value?.task?.taskId ||
      value?.task?.id ||
      "",
  ).trim();
}

function apizTaskStatus(value = {}) {
  return String(
    value?.status ||
      value?.state ||
      value?.data?.status ||
      value?.data?.state ||
      value?.task?.status ||
      value?.task?.state ||
      "submitted",
  ).trim();
}

async function saveUserCharacterForAuth(auth, record) {
  const existingIndex = auth.db.userCharacters.findIndex((entry) => entry.id === record.id);
  if (existingIndex >= 0) {
    auth.db.userCharacters[existingIndex] = record;
  } else {
    auth.db.userCharacters.unshift(record);
  }
  if (dbEnabled()) await upsertUserCharacterInDb(record);
  else await writeDb(auth.db);
  return record;
}

function myCharacterImageGenerationStatus(record = {}, fallback = "submitted") {
  const status = String(record.status || "").toLowerCase();
  if (status === "image_ready") return "succeeded";
  if (status === "image_failed") return "failed";
  if (status === "image_generating") return String(record.imageStatus || fallback || "submitted");
  return String(record.imageStatus || record.status || fallback || "submitted");
}

function myCharacterImageGenerationRecordId(record = {}) {
  return String(record.imageGenerationRecordTaskId || record.imageTaskId || "").trim();
}

function characterImageUrlsFromPayload(payload = {}) {
  const character = payload.character || payload.data?.character || {};
  const task = payload.task || payload.data?.task || character.imageTaskResponse || {};
  const record = payload.record || payload.data?.record || {};
  const urls = [
    payload.imageUrl,
    payload.image_url,
    payload.localSheetUrl,
    payload.localImageUrl,
    payload.cdnImageUrl,
    payload.downloadUrl,
    character.publicImageUrl,
    character.cdnImageUrl,
    character.localImageUrl,
    character.posterUrl,
    task.imageUrl,
    task.image_url,
    task.output?.url,
    task.output?.image_url,
    record.imageResultUrl,
    record.cdnImageUrl,
    record.localImageUrl,
    record.remoteImageUrl,
    ...(Array.isArray(payload.imageUrls) ? payload.imageUrls : []),
    ...collectOutputImageUrls(payload),
    ...collectImageUrls(payload),
  ];
  return [...new Set(urls
    .map((url) => signedOssCdnUrlForDelivery(url) || gatewayAbsoluteAssetUrl(url))
    .filter(Boolean))];
}

async function updateMyCharacterImageGenerationRecord(auth, record, updates = {}, reason = "my-character-image") {
  const taskId = myCharacterImageGenerationRecordId(record) || String(updates.taskId || "").trim();
  if (!taskId) return null;
  return upsertGenerationRecord({
    taskId,
    status: myCharacterImageGenerationStatus(record, updates.status || "submitted"),
    source: "my-character-image-generate",
    kind: "character-image",
    provider: "seedream5-image",
    upstreamSource: record.upstreamSource || (USE_GATEWAY_UPSTREAM ? "gateway" : "direct"),
    userId: record.userId || auth.user.id,
    companionId: record.id || "",
    companionName: record.name || "",
    sceneName: record.title || "",
    prompt: record.prompt || "",
    finalPrompt: record.finalPrompt || record.prompt || "",
    imageUrl: record.sourceImageUrl || "",
    imageResultUrl: record.publicImageUrl || record.cdnImageUrl || record.localImageUrl || record.posterUrl || "",
    localImageUrl: record.localImageUrl || "",
    cdnImageUrl: record.cdnImageUrl || record.publicImageUrl || "",
    remoteImageUrl: record.imageRemoteUrl || "",
    error: record.error || "",
    apiTokenId: auth.tokenRecord?.id || "",
    apiTokenName: auth.tokenRecord?.name || "",
    apiTokenType: auth.tokenRecord?.quotaType || "",
    apiTokenSource: auth.tokenSource || "",
    ...updates,
    taskId,
    lastUpdateReason: reason,
  });
}

function configuredFixedCreditsPricing(credits, source = "fixed_price", auth = {}) {
  const raw = fixedCreditsBreakdown(Number(credits || 0), source);
  return applyUserPricingToEstimate(raw, auth.user || 1, pricingContextForAuth(auth));
}

function characterSeedream5ImageOptions(config = {}, model = "", options = {}) {
  const advancedPricing = normalizeAdvancedPricing(config.platform?.advancedPricing || DEFAULT_ADVANCED_PRICING);
  const tier = normalizeSeedream5Tier(firstPresent(
    options.seedreamTier,
    options.seedream5Tier,
    process.env.CHARACTER_SEEDREAM_TIER,
    advancedPricing.seedream5Image?.defaultTier,
    "pro",
  ));
  const resolution = normalizeSeedream5Resolution(firstPresent(
    options.resolution,
    options.size,
    process.env.CHARACTER_SEEDREAM_SIZE,
    advancedPricing.seedream5Image?.defaultResolution,
    "2K",
  ));
  const resolvedModel = seedream5ModelForTier(firstPresent(
    options.model,
    process.env.CHARACTER_SEEDREAM_MODEL,
    /^ep-/i.test(String(model || "")) ? model : "",
  ), tier);
  return {
    provider: "seedream5-image",
    model: resolvedModel,
    seedreamTier: tier,
    resolution,
    size: resolution,
    outputImageCount: Math.max(1, Math.floor(Number(options.outputImageCount || 1) || 1)),
    referenceImageCount: Math.max(0, Math.floor(Number(options.referenceImageCount || 0) || 0)),
  };
}

function myCharacterImagePricing(config = {}, auth = {}, options = {}) {
  const raw = advancedModelPricing("seedream5-image", {
    ...characterSeedream5ImageOptions(config, options.model || config.characterImage?.textModel || "", options),
    advancedPricing: config.platform?.advancedPricing,
  });
  return applyUserPricingToEstimate(raw, auth.user || 1, pricingContextForAuth(auth));
}

async function seedanceVideoPricingForPayload(auth, config = {}, payload = {}, body = {}) {
  const model = String(payload.model || firstPresent(body.model, MODEL_QUALITY));
  const seedanceTier = normalizeSeedanceTier(firstPresent(
    body.seedanceTier,
    body.vipeak2Tier,
    payload.seedanceTier,
    /fast/i.test(model) ? "fast" : "standard",
  ));
  const requestParams = {
    ...payload,
    provider: "seedance",
    model,
    seedanceTier,
    duration: clampNumber(payload.duration, advancedDurationBounds("seedance").fallback, advancedDurationBounds("seedance").min, advancedDurationBounds("seedance").max),
    resolution: normalizeAdvancedResolution(payload.resolution || body.resolution || config.video?.resolution || "720p"),
    ratio: normalizeVideoRatio(payload.ratio || payload.aspect_ratio || body.ratio || body.aspect_ratio || config.video?.ratio || "9:16"),
  };
  const pricingBody = officialSeedanceVideoInputsForPricing(payload);
  requestParams.inputVideoSeconds = await seedanceVideoInputSecondsForPricingWithProbe(pricingBody, { requestParams });
  const raw = advancedModelPricing("seedance", {
    ...requestParams,
    advancedPricing: config.platform?.advancedPricing,
  });
  return applyUserPricingToEstimate(raw, auth.user || 1, pricingContextForAuth(auth));
}

async function seedanceVideoPricingForSubmitArgs(auth, args = {}) {
  const content = seedanceContentFromReferences(args);
  const payload = seedancePayloadFromBody({
    config: args.config || {},
    prompt: args.prompt || "",
    content,
    body: args.body || {},
  });
  payload.Moderation = { Strategy: "Skip" };
  const pricing = await seedanceVideoPricingForPayload(auth, args.config || {}, payload, args.body || {});
  return { pricing, payload };
}

async function myCharacterImageSettleUpdates(record = {}) {
  const taskId = myCharacterImageGenerationRecordId(record);
  const generationRecord = taskId ? await getGenerationRecord(taskId) : null;
  const preDeducted = creditsAmount(generationRecord?.preDeductedCredits || 0);
  if (preDeducted <= 0) return {};
  return {
    finalCredits: preDeducted,
    originalFinalCredits: creditsAmount(generationRecord.originalPreDeductedCredits ?? preDeducted),
    billingStatus: "settled",
    billingSettledAt: generationRecord.billingSettledAt || new Date().toISOString(),
    billingError: "",
  };
}

async function myCharacterImageRefundUpdates(auth, record = {}, reason = "my-character-image-failed", message = "") {
  const taskId = myCharacterImageGenerationRecordId(record);
  const generationRecord = taskId ? await getGenerationRecord(taskId) : null;
  const preDeducted = creditsAmount(generationRecord?.preDeductedCredits || 0);
  const billingStatus = String(generationRecord?.billingStatus || "").toLowerCase();
  const finalCredits = creditsAmount(generationRecord?.finalCredits || 0);
  const canRefund = billingStatus === "pre_deducted" || billingStatus === "settled" || finalCredits > 0;
  if (preDeducted <= 0 || !canRefund || billingStatus === "refunded" || billingStatus === "free") {
    return {};
  }
  const db = await readDb();
  await changeUserCredits(db, generationRecord.userId || record.userId || auth.user.id, preDeducted, "my_character_image_refund", {
    taskId,
    characterId: record.id || generationRecord.companionId || "",
    reason,
    error: message,
  });
  await recordSubtokenAdjustment(generationRecord, {
    taskId,
    type: "my_character_image_refund",
    amount: -preDeducted,
    meta: { reason, error: message, characterId: record.id || generationRecord.companionId || "" },
  });
  if (!dbEnabled()) await writeDb(db);
  return {
    finalCredits: 0,
    originalFinalCredits: 0,
    billingStatus: "refunded",
    billingSettledAt: new Date().toISOString(),
    billingError: "",
  };
}

async function refreshGeneratedMyCharacterImage(auth, record) {
  const readyImageUrl = record?.publicImageUrl || record?.cdnImageUrl || record?.localImageUrl || record?.posterUrl || "";
  if (readyImageUrl && (isCompletedStatus(record.imageStatus) || String(record.status || "").toLowerCase() === "image_ready")) {
    const billingUpdates = await myCharacterImageSettleUpdates(record);
    await updateMyCharacterImageGenerationRecord(auth, record, {
      status: "succeeded",
      awaitingUpstreamTask: false,
      imageResultUrl: readyImageUrl,
      localImageUrl: record.localImageUrl || "",
      cdnImageUrl: record.cdnImageUrl || record.publicImageUrl || "",
      remoteImageUrl: record.imageRemoteUrl || "",
      createResponse: record.imageTaskResponse || null,
      error: "",
      ...billingUpdates,
    }, "my-character-image-ready");
    return {
      record,
      task: record.imageTaskResponse || { taskId: record.imageTaskId || "", status: record.imageStatus || "succeeded", output: { url: readyImageUrl } },
      imageUrls: [readyImageUrl],
    };
  }
  if (isFailedStatus(record?.imageStatus) || String(record?.status || "").toLowerCase() === "image_failed") {
    const billingUpdates = await myCharacterImageRefundUpdates(auth, record, "my-character-image-refresh-failed", record.error || "");
    await updateMyCharacterImageGenerationRecord(auth, record, {
      status: "failed",
      awaitingUpstreamTask: false,
      imageResultUrl: "",
      localImageUrl: record.localImageUrl || "",
      cdnImageUrl: record.cdnImageUrl || record.publicImageUrl || "",
      remoteImageUrl: record.imageRemoteUrl || "",
      createResponse: record.imageTaskResponse || null,
      error: record.error || "Character image generation failed.",
      failedAt: record.failedAt || new Date().toISOString(),
      ...billingUpdates,
    }, "my-character-image-already-failed");
    return {
      record,
      task: record.imageTaskResponse || { taskId: record.imageTaskId || "", status: "failed", error: record.error || "Character image generation failed." },
      imageUrls: [],
    };
  }
  const localImageRecordTaskId = String(record?.imageGenerationRecordTaskId || "").trim();
  const currentImageTaskId = String(record?.imageTaskId || "").trim();
  const terminalImageStatus = isCompletedStatus(record?.imageStatus)
    || isFailedStatus(record?.imageStatus)
    || ["image_ready", "image_failed"].includes(String(record?.status || "").toLowerCase());
  const waitingForSubmit = !terminalImageStatus && (
    Boolean(record?.awaitingImageSubmit)
    || (localImageRecordTaskId && currentImageTaskId === localImageRecordTaskId && !record.gatewayCharacterId)
  );
  if (waitingForSubmit) {
    record.status = "image_generating";
    record.imageStatus = record.imageStatus || "submitting";
    record.updatedAt = new Date().toISOString();
    await saveUserCharacterForAuth(auth, record);
    await updateMyCharacterImageGenerationRecord(auth, record, {
      status: record.imageStatus || "submitting",
      awaitingUpstreamTask: true,
      error: "",
    }, "my-character-image-awaiting-submit");
    return {
      record,
      task: { taskId: currentImageTaskId || localImageRecordTaskId, status: record.imageStatus || "submitting" },
      imageUrls: [],
    };
  }
  if (!record?.imageTaskId) return { record, task: null, imageUrls: [] };
  if (!USE_GATEWAY_UPSTREAM && record.imageRemoteUrl && !readyImageUrl) {
    const taskId = String(record.imageTaskId || myCharacterImageGenerationRecordId(record) || "");
    const local = await downloadGeneratedCharacterSheet(taskId, record.imageRemoteUrl);
    record.imageStatus = "succeeded";
    record.posterUrl = local.localUrl;
    record.localImageUrl = local.localUrl;
    record.sourceImageUrl = local.localUrl;
    record.publicImageUrl = local.cdnImageUrl || record.publicImageUrl || "";
    record.cdnImageUrl = local.cdnImageUrl || record.cdnImageUrl || "";
    record.objectStorageKey = local.objectStorageKey || record.objectStorageKey || "";
    record.objectStorageError = local.cdnError || record.objectStorageError || "";
    record.status = "image_ready";
    record.error = "";
    record.updatedAt = new Date().toISOString();
    await saveUserCharacterForAuth(auth, record);
    const billingUpdates = await myCharacterImageSettleUpdates(record);
    await updateMyCharacterImageGenerationRecord(auth, record, {
      upstreamTaskId: record.imageTaskId || "",
      status: "succeeded",
      awaitingUpstreamTask: false,
      imageResultUrl: local.cdnImageUrl || local.localUrl || record.imageRemoteUrl,
      localImageUrl: local.localUrl || "",
      cdnImageUrl: local.cdnImageUrl || "",
      cdnError: local.cdnError || "",
      remoteImageUrl: record.imageRemoteUrl || "",
      error: "",
      ...billingUpdates,
    }, "my-character-image-remote-image-recovered");
    return {
      record,
      task: record.imageTaskResponse || { taskId: record.imageTaskId || "", status: "succeeded", output: { url: record.imageRemoteUrl } },
      imageUrls: [local.cdnImageUrl, local.localUrl, record.imageRemoteUrl].filter(Boolean),
    };
  }
  if (USE_GATEWAY_UPSTREAM && record.gatewayCharacterId) {
    const payload = await gatewayRequest("GET", `/api/my/characters/${encodeURIComponent(record.gatewayCharacterId)}/image`);
    const gatewayCharacter = payload.character || {};
    const task = payload.task || gatewayCharacter.imageTaskResponse || payload;
    const status = String(gatewayCharacter.imageStatus || gatewayCharacter.status || apizTaskStatus(task));
    const imageUrls = [
      ...(Array.isArray(payload.imageUrls) ? payload.imageUrls : []),
      gatewayCharacter.publicImageUrl,
      gatewayCharacter.cdnImageUrl,
      gatewayCharacter.localImageUrl,
      gatewayCharacter.posterUrl,
      collectImageUrls(task)[0],
    ].map(gatewayAbsoluteAssetUrl).filter(Boolean);
    const nowIso = new Date().toISOString();
    record.imageStatus = status;
    record.updatedAt = nowIso;

    if (isCompletedStatus(status) && imageUrls[0]) {
      const local = await downloadGeneratedCharacterSheet(record.imageTaskId, imageUrls[0]);
      record.posterUrl = local.localUrl;
      record.localImageUrl = local.localUrl;
      record.sourceImageUrl = local.localUrl;
      record.publicImageUrl = local.cdnImageUrl || record.publicImageUrl || "";
      record.cdnImageUrl = local.cdnImageUrl || record.cdnImageUrl || "";
      record.objectStorageKey = local.objectStorageKey || record.objectStorageKey || "";
      record.objectStorageError = local.cdnError || record.objectStorageError || "";
      record.imageRemoteUrl = imageUrls[0];
      record.imageTaskResponse = payload;
      record.status = "image_ready";
      record.error = "";
    } else if (isFailedStatus(status)) {
      record.status = "image_failed";
      record.error = String(gatewayCharacter.error || task.error || task.message || task.fail_reason || "Character image generation failed.");
      record.imageTaskResponse = payload;
    } else {
      record.status = record.status || "image_generating";
      record.imageTaskResponse = payload;
    }

    await saveUserCharacterForAuth(auth, record);
    const billingUpdates = isCompletedStatus(status)
      ? await myCharacterImageSettleUpdates(record)
      : isFailedStatus(status)
        ? await myCharacterImageRefundUpdates(auth, record, "my-character-image-refresh", record.error || "")
        : {};
    await updateMyCharacterImageGenerationRecord(auth, record, {
      upstreamTaskId: record.imageTaskId || "",
      status: myCharacterImageGenerationStatus(record, status),
      awaitingUpstreamTask: !(isCompletedStatus(status) || isFailedStatus(status)),
      imageResultUrl: record.publicImageUrl || record.cdnImageUrl || record.localImageUrl || record.posterUrl || "",
      localImageUrl: record.localImageUrl || "",
      cdnImageUrl: record.cdnImageUrl || record.publicImageUrl || "",
      remoteImageUrl: record.imageRemoteUrl || imageUrls[0] || "",
      queryResponse: payload,
      error: record.error || "",
      ...billingUpdates,
    }, "my-character-image-refresh");
    return { record, task, imageUrls };
  }
  const task = await apizRequest("/api/v3/tasks/query", { task_id: record.imageTaskId });
  const status = apizTaskStatus(task);
  const imageUrls = collectImageUrls(task);
  const nowIso = new Date().toISOString();
  record.imageStatus = status;
  record.updatedAt = nowIso;

  if (isCompletedStatus(status) && imageUrls[0]) {
    const local = await downloadGeneratedCharacterSheet(record.imageTaskId, imageUrls[0]);
    record.posterUrl = local.localUrl;
    record.localImageUrl = local.localUrl;
    record.sourceImageUrl = local.localUrl;
    record.publicImageUrl = local.cdnImageUrl || record.publicImageUrl || "";
    record.cdnImageUrl = local.cdnImageUrl || record.cdnImageUrl || "";
    record.objectStorageKey = local.objectStorageKey || record.objectStorageKey || "";
    record.objectStorageError = local.cdnError || record.objectStorageError || "";
    record.imageRemoteUrl = imageUrls[0];
    record.imageTaskResponse = task;
    record.status = "image_ready";
    record.error = "";
  } else if (isFailedStatus(status)) {
    record.status = "image_failed";
    record.error = String(task.error || task.message || task.fail_reason || "Character image generation failed.");
    record.imageTaskResponse = task;
  } else {
    record.status = record.status || "image_generating";
    record.imageTaskResponse = task;
  }

  await saveUserCharacterForAuth(auth, record);
  const billingUpdates = isCompletedStatus(status)
    ? await myCharacterImageSettleUpdates(record)
    : isFailedStatus(status)
      ? await myCharacterImageRefundUpdates(auth, record, "my-character-image-refresh", record.error || "")
      : {};
  await updateMyCharacterImageGenerationRecord(auth, record, {
    upstreamTaskId: record.imageTaskId || "",
    status: myCharacterImageGenerationStatus(record, status),
    awaitingUpstreamTask: !(isCompletedStatus(status) || isFailedStatus(status)),
    imageResultUrl: record.publicImageUrl || record.cdnImageUrl || record.localImageUrl || record.posterUrl || "",
    localImageUrl: record.localImageUrl || "",
    cdnImageUrl: record.cdnImageUrl || record.publicImageUrl || "",
    remoteImageUrl: record.imageRemoteUrl || imageUrls[0] || "",
    queryResponse: task,
    error: record.error || "",
    ...billingUpdates,
  }, "my-character-image-refresh");
  return { record, task, imageUrls };
}

async function backgroundAuthForMyCharacterJob(authSnapshot = {}) {
  const db = await readDb();
  const userId = authSnapshot.user?.id || "";
  const user = (db.users || []).find((entry) => entry.id === userId) || authSnapshot.user || null;
  return {
    ...authSnapshot,
    db,
    user,
  };
}

async function refreshMyCharacterImageGenerationRecord(record = {}, reason = "my-character-image-record-refresh") {
  if (!record?.taskId || !record.userId) return record;
  const auth = await backgroundAuthForMyCharacterJob({
    user: { id: record.userId },
    tokenRecord: tokenContextFromRecord(record),
    tokenSource: record.apiTokenSource || "",
  });
  if (!auth.user) return record;
  const taskId = String(record.taskId || "");
  const upstreamTaskId = String(record.upstreamTaskId || "");
  const companionId = String(record.companionId || "");
  const character = (auth.db.userCharacters || []).find((entry) => (
    entry &&
    entry.userId === record.userId &&
    !isSoftDeleted(entry) &&
    (
      String(entry.id || "") === companionId ||
      String(entry.imageGenerationRecordTaskId || "") === taskId ||
      String(entry.imageTaskId || "") === taskId ||
      (upstreamTaskId && String(entry.imageTaskId || "") === upstreamTaskId)
    )
  ));
  if (!character) return record;
  if (
    !USE_GATEWAY_UPSTREAM &&
    record.upstreamTaskId &&
    String(character.imageTaskId || "") === taskId &&
    !character.imageRemoteUrl
  ) {
    const ageMs = Date.now() - generationRecordCreatedTime(record);
    if (ageMs >= GENERATION_SUBMIT_STALE_MS) {
      character.imageTaskId = String(record.upstreamTaskId || "");
      character.awaitingImageSubmit = false;
      const error = new Error("Seedream image submission was interrupted before a result image was saved. The pre-deducted credits were refunded.");
      await failMyCharacterImageGeneration(auth, character, error, "my-character-image-stale-seedream-submit");
      return await getGenerationRecord(taskId) || record;
    }
  }
  try {
    await refreshGeneratedMyCharacterImage(auth, character);
  } catch (error) {
    console.warn("[my-character-image-record-refresh-failed]", taskId, error.message || error);
    return record;
  }
  return await getGenerationRecord(taskId) || record;
}

function startMyCharacterImageGenerationJob(job = {}) {
  return startTrackedGenerationJob("my-character-image-generation", job.record?.taskId || job.characterId, (submission) => runMyCharacterImageGenerationJob(job, submission), (error) => {
    console.error("[my-character-image-job-failed]", job.characterId || job.record?.id || "", error.message || error);
  });
}

async function failMyCharacterImageGeneration(auth, record, error, reason = "my-character-image-failed") {
  const errorInfo = normalizeErrorPayload(error);
  const billingUpdates = await myCharacterImageRefundUpdates(auth, record, reason, errorInfo.message || "");
  record.status = "image_failed";
  record.imageStatus = "failed";
  record.awaitingImageSubmit = false;
  record.error = errorInfo.message || error.message || "Character image generation failed.";
  record.updatedAt = new Date().toISOString();
  await saveUserCharacterForAuth(auth, record);
  await updateMyCharacterImageGenerationRecord(auth, record, {
    status: "failed",
    awaitingUpstreamTask: false,
    error: record.error,
    code: errorInfo.code || "",
    errorPayload: errorInfo.payload || null,
    createResponse: errorInfo.payload || null,
    failedAt: new Date().toISOString(),
    ...billingUpdates,
  }, reason);
}

