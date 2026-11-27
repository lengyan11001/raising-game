function gptImage2ReferenceInputsFromBody(body = {}) {
  const contentSummary = safeSeedanceContentMediaSummary(body.content);
  const directInputs = [
    ...arrayFromBody(body.referenceImages),
    ...arrayFromBody(body.reference_images),
    ...arrayFromBody(body.referenceImageUrls),
    ...arrayFromBody(body.reference_image_urls),
    ...arrayFromBody(body.imageUrls),
    ...arrayFromBody(body.image_urls),
    ...arrayFromBody(body.images),
    ...arrayFromBody(body.image),
    ...arrayFromBody(contentSummary.referenceImages),
  ];
  const assetIds = [
    body.userAssetId,
    body.assetId,
    body.imageAssetId,
    body.referenceImageAssetId,
    ...arrayFromBody(body.userAssetIds),
    ...arrayFromBody(body.assetIds),
    ...arrayFromBody(body.imageAssetIds),
    ...arrayFromBody(body.referenceImageAssetIds),
  ].map((item) => String(item || "").trim()).filter(Boolean);
  const inputs = [...assetIds.map((assetId) => ({ assetId })), ...directInputs]
    .filter((item) => {
      if (!item) return false;
      if (typeof item === "string") return Boolean(item.trim());
      return item.assetId || item.userAssetId || item.assetUri || item.referenceAssetUri || item.seedanceAssetUri || item.dataUrl || item.url || item.imageUrl;
    })
    .map((item) => {
      if (typeof item !== "string") return item;
      const text = item.trim();
      return text.startsWith("asset://") ? { assetId: byteplusAssetIdFromUri(text) } : text;
    });
  if (inputs.length > GPT_IMAGE2_REFERENCE_LIMIT) {
    throw advancedValidationError(
      "TOO_MANY_GPT_IMAGE2_IMAGES",
      `GPT Image 2 supports at most ${GPT_IMAGE2_REFERENCE_LIMIT} reference images.`,
      { count: inputs.length, max: GPT_IMAGE2_REFERENCE_LIMIT },
    );
  }
  return inputs;
}

async function prepareGptImage2ReferenceImages(db, user, body = {}) {
  const inputs = gptImage2ReferenceInputsFromBody(body);
  const assets = await createUserImageAssetsFromInputs(db, user, inputs, { name: "GPT Image 2 reference image" });
  const preparedAssets = [];
  const publicImageUrls = [];
  for (const asset of assets) {
    validateWan27MediaKind(asset, "image", "GPT Image 2 reference image");
    const prepared = await ensurePublicUrlForUserMediaAsset(db, asset);
    const publicUrl = publicUrlForLocalAsset(prepared);
    if (!isPublicHttpUrl(publicUrl)) {
      throw advancedValidationError(
        "GPT_IMAGE2_REFERENCE_NOT_PUBLIC",
        "Failed to prepare a public URL for GPT Image 2 reference image.",
        { assetId: asset.id || "" },
      );
    }
    preparedAssets.push(prepared);
    publicImageUrls.push(publicUrl);
  }
  return { inputs, assets: preparedAssets, publicImageUrls };
}

function gptImage2PreparedMediaAssets(assets = []) {
  return (Array.isArray(assets) ? assets : []).map((asset, index) => {
    const userAssetId = String(firstPresent(asset?.id, asset?.userAssetId, asset?.assetId, "") || "").trim();
    const imageUrl = String(firstPresent(asset?.localUrl, asset?.previewUrl, asset?.publicUrl, asset?.cdnUrl, "") || "").trim();
    const publicUrl = String(firstPresent(asset?.publicUrl, asset?.cdnUrl, asset?.localUrl, "") || "").trim();
    if (!userAssetId && !imageUrl) return null;
    return {
      type: "reference_image",
      ...(userAssetId ? { userAssetId } : {}),
      ...(imageUrl ? { url: imageUrl, imageUrl, sourceImageUrl: imageUrl, previewUrl: imageUrl } : {}),
      ...(publicUrl ? { publicUrl } : {}),
      name: asset?.name || asset?.fileName || `GPT Image 2 reference ${index + 1}`,
      order: index + 1,
    };
  }).filter(Boolean);
}

async function prepareGptImage2MaskUrl(db, user, body = {}) {
  const rawMask = firstPresent(body.mask_url, body.maskUrl, body.maskImage, body.mask);
  const maskAssetId = String(firstPresent(body.maskAssetId, body.mask_asset_id, "") || "").trim();
  const input = maskAssetId ? { assetId: maskAssetId } : rawMask;
  if (!input) return "";
  if (typeof input === "string" && isPublicHttpUrl(input.trim())) return input.trim();
  const assets = await createUserImageAssetsFromInputs(db, user, [input], { name: "GPT Image 2 mask image" });
  if (!assets.length) return "";
  validateWan27MediaKind(assets[0], "image", "GPT Image 2 mask image");
  const prepared = await ensurePublicUrlForUserMediaAsset(db, assets[0]);
  const publicUrl = publicUrlForLocalAsset(prepared);
  if (!isPublicHttpUrl(publicUrl)) {
    throw advancedValidationError("GPT_IMAGE2_MASK_NOT_PUBLIC", "Failed to prepare a public URL for GPT Image 2 mask image.");
  }
  return publicUrl;
}

function gptImage2FinalCreditsFromUpstream(record = {}) {
  const pricing = record.pricingEstimate && typeof record.pricingEstimate === "object" ? record.pricingEstimate : {};
  if (pricing.userConfigured === true) return null;
  const reportedPoints = extractGptImage2ReportedPoints(record.queryResponse)
    ?? extractGptImage2ReportedPoints(record.createResponse)
    ?? (Number.isFinite(Number(record.createReportedPoints)) && Number(record.createReportedPoints) > 0
      ? Number(record.createReportedPoints)
      : null);
  if (!reportedPoints) return null;
  const cnyPerUsd = Number(pricing.cnyPerUsd) > 0 ? Number(pricing.cnyPerUsd) : GPT_IMAGE2_CNY_PER_USD_CONFIGURED;
  const markup = Number(pricing.saleMarkup) > 0 ? Number(pricing.saleMarkup) : GPT_IMAGE2_MARKUP_CONFIGURED;
  const modelDiscount = Number(pricing.modelDiscount) > 0 ? Number(pricing.modelDiscount) : 1;
  const purchaseUsd = gptImage2PointsToPurchaseUsd(reportedPoints, cnyPerUsd);
  const saleUsd = gptImage2PointsToSaleUsd(reportedPoints, { cnyPerUsd, markup });
  const originalCredits = creditsAmount(saleUsd * DEFAULT_CREDITS_PER_USD * modelDiscount);
  const pricingMultiplier = normalizeUserPricingMultiplier(
    record.userPricingMultiplier ?? record.pricingMultiplier ?? pricing.userPricingMultiplier ?? 1,
    pricingContextForRecord(record),
  );
  return {
    reportedPoints,
    purchaseUsd,
    saleUsd,
    cnyPerUsd,
    markup,
    modelDiscount,
    originalCredits,
    pricingMultiplier,
    credits: applyUserPricingMultiplierToCredits(originalCredits, pricingMultiplier),
  };
}

async function settleGptImage2GenerationRecord(record = {}, reason = "query") {
  if (String(record.provider || "").toLowerCase() !== GPT_IMAGE2_PROVIDER) return record;
  if (!record.taskId || !record.userId || record.billingSettledAt) return record;
  const preDeducted = creditsAmount(record.preDeductedCredits || 0);
  if (isFailedStatus(record.status)) {
    if (preDeducted <= 0) {
      return upsertGenerationRecord({
        taskId: record.taskId,
        finalCredits: 0,
        originalFinalCredits: 0,
        billingStatus: "free",
        billingSettledAt: new Date().toISOString(),
      });
    }
    const result = await refundCreditsWithSubtoken(record, record.userId, preDeducted, "advanced_gpt_image2_refund", {
      taskId: record.taskId,
      provider: GPT_IMAGE2_PROVIDER,
      reason,
      error: record.error || "GPT Image 2 failed.",
    }, { logTag: "gpt-image2" });
    return upsertGenerationRecord({
      taskId: record.taskId,
      finalCredits: 0,
      originalFinalCredits: 0,
      billingStatus: result.refunded ? "refunded" : "refund_failed",
      billingError: result.error ? `Refund failed: ${result.error.message || result.error}` : "",
      billingSettledAt: result.refunded ? new Date().toISOString() : "",
    });
  }
  if (!isSucceededStatus(record.status)) return record;

  const actual = gptImage2FinalCreditsFromUpstream(record);
  const finalCredits = actual ? actual.credits : preDeducted;
  const originalFinalCredits = actual
    ? actual.originalCredits
    : creditsAmount(record.originalPreDeductedCredits ?? record.pricingEstimate?.originalCredits ?? preDeducted);
  const delta = Math.round((preDeducted - finalCredits) * 10000) / 10000;
  let billingError = "";
  const db = await readDb();
  try {
    if (delta > 0.0001) {
      await changeUserCredits(db, record.userId, delta, "generation_refund", {
        taskId: record.taskId,
        provider: GPT_IMAGE2_PROVIDER,
        reason,
        preDeducted,
        finalCredits,
        originalFinalCredits,
        reportedPoints: actual?.reportedPoints ?? null,
        upstreamCostUsd: actual?.purchaseUsd ?? null,
      });
      await recordSubtokenAdjustment(record, {
        taskId: record.taskId,
        type: "generation_refund",
        amount: -delta,
        meta: { provider: GPT_IMAGE2_PROVIDER, reason, preDeducted, finalCredits, originalFinalCredits },
      });
      if (!dbEnabled()) await writeDb(db);
    } else if (delta < -0.0001) {
      await changeUserCredits(db, record.userId, delta, "generation_settle", {
        taskId: record.taskId,
        provider: GPT_IMAGE2_PROVIDER,
        reason,
        preDeducted,
        finalCredits,
        originalFinalCredits,
        reportedPoints: actual?.reportedPoints ?? null,
        upstreamCostUsd: actual?.purchaseUsd ?? null,
      });
      await recordSubtokenAdjustment(record, {
        taskId: record.taskId,
        type: "generation_settle",
        amount: Math.abs(delta),
        meta: { provider: GPT_IMAGE2_PROVIDER, reason, preDeducted, finalCredits, originalFinalCredits },
      });
      if (!dbEnabled()) await writeDb(db);
    }
  } catch (error) {
    billingError = error.message || "GPT Image 2 billing settlement failed.";
    console.warn("[gpt-image2-settle-error]", record.taskId, billingError);
  }
  return upsertGenerationRecord({
    taskId: record.taskId,
    finalCredits,
    originalFinalCredits,
    upstreamReportedPoints: actual?.reportedPoints ?? record.createReportedPoints ?? null,
    upstreamCostUsd: actual?.purchaseUsd ?? null,
    billingStatus: billingError ? "settlement_failed" : (finalCredits > 0 || preDeducted > 0 ? "settled" : "free"),
    billingError,
    billingSettledAt: billingError ? "" : new Date().toISOString(),
  });
}

async function refreshGptImage2GenerationRecord(record = {}, reason = "query") {
  if (String(record.provider || "").toLowerCase() !== GPT_IMAGE2_PROVIDER) return record;
  const queryTaskId = record.upstreamTaskId || record.taskId;
  const task = await apizRequest("/api/v3/tasks/query", { task_id: queryTaskId });
  const rawStatus = apizStatus(task);
  const imageUrls = extractGptImage2OutputUrls(task);
  const imageUrl = imageUrls[0] || "";
  if (isSucceededStatus(rawStatus)) {
    if (!imageUrl) {
      return upsertAndSettleGenerationRecord({
        taskId: record.taskId,
        upstreamTaskId: apizTaskId(task) || queryTaskId,
        status: "failed",
        awaitingUpstreamTask: false,
        queryResponse: task,
        error: "GPT Image 2 returned no image.",
        failedAt: new Date().toISOString(),
      }, `gpt-image2-${reason}`);
    }
    const savedImage = record.cdnImageUrl
      ? {
          cdnImageUrl: record.cdnImageUrl,
          storageProvider: record.storageProvider || "",
          storageKey: record.storageKey || "",
          cdnError: record.cdnError || "",
        }
      : await saveRemoteGeneratedImage(record.taskId, imageUrl);
    return upsertAndSettleGenerationRecord({
      taskId: record.taskId,
      upstreamTaskId: apizTaskId(task) || queryTaskId,
      status: "succeeded",
      awaitingUpstreamTask: false,
      imageResultUrl: savedImage.cdnImageUrl || imageUrl,
      localImageUrl: "",
      localImagePath: "",
      cdnImageUrl: savedImage.cdnImageUrl || "",
      storageProvider: savedImage.storageProvider || "",
      storageKey: savedImage.storageKey || "",
      cdnError: savedImage.cdnError || "",
      remoteImageUrl: imageUrl,
      remoteImageUrls: imageUrls,
      queryResponse: task,
      completedAt: record.completedAt || new Date().toISOString(),
      error: "",
    }, `gpt-image2-${reason}`);
  }
  if (isFailedStatus(rawStatus)) {
    const message = [
      task?.error?.message, task?.error,
      task?.result?.error?.message, task?.result?.error,
      task?.output?.error?.message, task?.output?.error,
      task?.message, task?.detail,
    ].find((value) => typeof value === "string" && value.trim()) || "GPT Image 2 generation failed.";
    return upsertAndSettleGenerationRecord({
      taskId: record.taskId,
      upstreamTaskId: apizTaskId(task) || queryTaskId,
      status: "failed",
      awaitingUpstreamTask: false,
      queryResponse: task,
      error: message.trim(),
      failedAt: record.failedAt || new Date().toISOString(),
    }, `gpt-image2-${reason}`);
  }
  return upsertGenerationRecord({
    taskId: record.taskId,
    upstreamTaskId: apizTaskId(task) || queryTaskId,
    status: rawStatus || "processing",
    awaitingUpstreamTask: false,
    queryResponse: task,
  });
}

async function runGptImage2GenerationJob(job = {}, submission = null) {
  const {
    taskId = "",
    userId = "",
    body = {},
    bodyParams = {},
    initialParams = {},
    prompt = "",
    resolution = GPT_IMAGE2_DEFAULT_RESOLUTION,
    quality = GPT_IMAGE2_DEFAULT_QUALITY,
    ratio = GPT_IMAGE2_DEFAULT_RATIO,
    outputFormat = GPT_IMAGE2_DEFAULT_OUTPUT_FORMAT,
    cost = 0,
  } = job;
  if (!taskId || !userId) return;

  let upstreamPayload = null;
  try {
    const db = await readGenerationJobDb(userId);
    const user = (db.users || []).find((entry) => entry.id === userId);
    if (!user) {
      const error = new Error("User not found for GPT Image 2 job.");
      error.statusCode = 404;
      throw error;
    }

    const mergedBody = { ...bodyParams, ...body };
    const prepared = await prepareGptImage2ReferenceImages(db, user, mergedBody);
    const maskUrl = prepared.publicImageUrls.length ? await prepareGptImage2MaskUrl(db, user, mergedBody) : "";
    const referencePreviewUrls = prepared.assets.map((asset) => asset.localUrl || asset.publicUrl || "").filter(Boolean);
    const preparedMediaAssets = gptImage2PreparedMediaAssets(prepared.assets);
    const upstreamModel = prepared.publicImageUrls.length ? GPT_IMAGE2_EDIT_MODEL : GPT_IMAGE2_TEXT_MODEL;

    await upsertGenerationRecord({
      taskId,
      model: upstreamModel,
      userAssetIds: prepared.assets.map((asset) => asset.id),
      userAssetId: prepared.assets[0]?.id || "",
      imageUrl: referencePreviewUrls[0] || "",
      imageUrls: referencePreviewUrls,
      sourceImageUrl: referencePreviewUrls[0] || "",
      sourceImageUrls: referencePreviewUrls,
      mediaAssets: preparedMediaAssets,
      status: "running",
      params: {
        ...initialParams,
        referenceImageCount: prepared.publicImageUrls.length,
        ...(maskUrl ? { mask_url: maskUrl } : {}),
      },
    });

    upstreamPayload = buildGptImage2UpstreamPayload({
      prompt,
      ratio,
      resolution,
      quality,
      outputFormat,
      imageUrls: prepared.publicImageUrls,
      maskUrl,
    });

    if (USE_GATEWAY_UPSTREAM) {
      const submitted = await gatewaySubmitAdvancedTask({
        provider: GPT_IMAGE2_PROVIDER,
        prompt,
        ratio: upstreamPayload.params.image_size,
        resolution,
        quality,
        outputFormat,
        referenceImages: prepared.publicImageUrls,
        ...(maskUrl ? { maskUrl } : {}),
      });
      await upsertGenerationRecord({
        taskId,
        upstreamTaskId: submitted.taskId || "",
        awaitingUpstreamTask: false,
        status: submitted.status || "submitted",
        upstreamPayload,
        createResponse: submitted.raw || submitted,
        error: "",
      });
      return;
    }

    const raw = await apizRequest("/api/v3/tasks/create", upstreamPayload);
    const upstreamTaskId = apizTaskId(raw);
    const rawStatus = apizStatus(raw);
    const createReportedPoints = extractGptImage2ReportedPoints(raw);
    const immediateUrls = extractGptImage2OutputUrls(raw);
    if (isSucceededStatus(rawStatus) && immediateUrls.length) {
      const savedImage = await saveRemoteGeneratedImage(taskId, immediateUrls[0]);
      await upsertAndSettleGenerationRecord({
        taskId,
        upstreamTaskId,
        model: upstreamPayload.model,
        awaitingUpstreamTask: false,
        status: "succeeded",
        upstreamPayload,
        createResponse: raw,
        createReportedPoints,
        imageResultUrl: savedImage.cdnImageUrl || immediateUrls[0],
        localImageUrl: "",
        localImagePath: "",
        cdnImageUrl: savedImage.cdnImageUrl || "",
        storageProvider: savedImage.storageProvider || "",
        storageKey: savedImage.storageKey || "",
        cdnError: savedImage.cdnError || "",
        remoteImageUrl: immediateUrls[0],
        remoteImageUrls: immediateUrls,
        completedAt: new Date().toISOString(),
        error: "",
      }, "gpt-image2-create");
      return;
    }
    if (!upstreamTaskId) {
      const error = new Error("GPT Image 2 upstream did not return a task id.");
      error.statusCode = 502;
      error.payload = raw;
      throw error;
    }
    await upsertGenerationRecord({
      taskId,
      upstreamTaskId,
      model: upstreamPayload.model,
      awaitingUpstreamTask: false,
      status: isFailedStatus(rawStatus) ? "failed" : (rawStatus || "submitted"),
      upstreamPayload,
      createResponse: raw,
      createReportedPoints,
      error: isFailedStatus(rawStatus) ? String(raw?.error?.message || raw?.error || raw?.message || "GPT Image 2 failed.") : "",
    });
    if (isFailedStatus(rawStatus)) {
      const failedRecord = await getGenerationRecord(taskId);
      if (failedRecord) await settleGptImage2GenerationRecord(failedRecord, "gpt-image2-create-failed");
    }
  } catch (error) {
    const errorInfo = normalizeErrorPayload(error);
    console.warn("[gpt-image2-error]", taskId, errorInfo.message || error.message || error, JSON.stringify(errorInfo.payload || {}).slice(0, 1000));
    const currentRecord = await getGenerationRecord(taskId).catch(() => null);
    let refunded = cost <= 0;
    let refundError = null;
    if (cost > 0) {
      const result = await refundCreditsWithSubtoken(currentRecord || { taskId, userId }, userId, cost, "advanced_gpt_image2_refund", {
        taskId,
        error: error.message || "GPT Image 2 failed.",
      }, { logTag: "gpt-image2" });
      refunded = result.refunded;
      refundError = result.error;
    }
    await upsertGenerationRecord({
      taskId,
      status: "failed",
      awaitingUpstreamTask: false,
      error: errorInfo.message || "GPT Image 2 failed.",
      code: errorInfo.code || "",
      errorPayload: errorInfo.payload || null,
      createResponse: errorInfo.payload || null,
      upstreamPayload,
      finalCredits: 0,
      originalFinalCredits: 0,
      billingStatus: cost <= 0 ? "free" : refunded ? "refunded" : "pre_deducted",
      billingError: refundError ? `Refund failed: ${refundError.message || refundError}` : "",
      billingSettledAt: refunded ? new Date().toISOString() : "",
      failedAt: new Date().toISOString(),
    });
  } finally {
    finishGenerationSubmission(submission);
  }
}

function startGptImage2GenerationJob(job = {}) {
  return startTrackedGenerationJob("gpt-image2-generation", job.taskId, (submission) => runGptImage2GenerationJob(job, submission), (error) => {
    console.error("[gpt-image2-job-unhandled]", job.taskId || "", error.message || error);
  });
}

async function handleAdvancedGptImage2Generate(req, res, context = {}) {
  const auth = context.auth || await requireUser(req, res);
  if (!auth) return;
  if (!USE_GATEWAY_UPSTREAM && !APIZ_API_KEY) {
    return sendJson(res, 503, { ok: false, code: "MISSING_APIZ_API_KEY", message: "GPT Image 2 generation is not configured." });
  }
  const body = context.body || await readJson(req);
  const bodyParams = context.bodyParams || requestParamsFromBody(body);
  const caseParams = context.caseParams || {};
  const selectedCase = context.selectedCase || null;
  const config = context.config || await readAppConfig();
  const mergedProviderParameters = {
    ...plainObject(caseParams.parameters),
    ...plainObject(bodyParams.parameters),
    ...plainObject(body.parameters),
  };
  const prompt = String(context.prompt || firstPresent(body.prompt, bodyParams.prompt, selectedCase?.prompt, caseParams.prompt, "")).trim();
  if (!prompt) return sendJson(res, 400, { ok: false, message: "Prompt is required." });

  let referenceInputs = [];
  try {
    referenceInputs = gptImage2ReferenceInputsFromBody({ ...bodyParams, ...body });
  } catch (error) {
    return sendAdvancedValidationError(res, error, "GPT Image 2 reference input is invalid.");
  }
  const hasReferences = referenceInputs.length > 0;
  const gptConfig = config.platform?.advancedPricing?.gptImage2 || DEFAULT_ADVANCED_PRICING.gptImage2;
  const resolution = normalizeGptImage2Resolution(firstPresent(
    body.resolution,
    body.size,
    bodyParams.resolution,
    bodyParams.size,
    mergedProviderParameters.resolution,
    mergedProviderParameters.size,
    caseParams.resolution,
    caseParams.size,
    gptConfig?.defaultResolution,
    GPT_IMAGE2_DEFAULT_RESOLUTION,
  ));
  const quality = normalizeGptImage2Quality(firstPresent(
    body.quality,
    body.gptImageQuality,
    bodyParams.quality,
    bodyParams.gptImageQuality,
    mergedProviderParameters.quality,
    mergedProviderParameters.gptImageQuality,
    caseParams.quality,
    gptConfig?.defaultQuality,
    GPT_IMAGE2_DEFAULT_QUALITY,
  ));
  const ratio = normalizeGptImage2Ratio(firstPresent(
    body.ratio,
    body.aspect_ratio,
    body.aspectRatio,
    body.image_size,
    bodyParams.ratio,
    bodyParams.aspect_ratio,
    bodyParams.aspectRatio,
    bodyParams.image_size,
    mergedProviderParameters.ratio,
    mergedProviderParameters.aspect_ratio,
    mergedProviderParameters.aspectRatio,
    mergedProviderParameters.image_size,
    caseParams.ratio,
    caseParams.aspect_ratio,
    caseParams.aspectRatio,
    hasReferences ? "auto" : GPT_IMAGE2_DEFAULT_RATIO,
  ), { allowAuto: hasReferences, fallback: hasReferences ? "auto" : GPT_IMAGE2_DEFAULT_RATIO });
  const outputFormat = normalizeGptImage2OutputFormat(firstPresent(
    body.output_format,
    body.outputFormat,
    bodyParams.output_format,
    bodyParams.outputFormat,
    mergedProviderParameters.output_format,
    mergedProviderParameters.outputFormat,
    caseParams.output_format,
    caseParams.outputFormat,
    gptConfig?.defaultOutputFormat,
    GPT_IMAGE2_DEFAULT_OUTPUT_FORMAT,
  ));

  const rawPricing = advancedModelPricing(GPT_IMAGE2_PROVIDER, {
    advancedPricing: config.platform?.advancedPricing,
    resolution,
    quality,
    referenceImageCount: referenceInputs.length,
    outputImageCount: 1,
  });
  const pricing = applyUserPricingToEstimate(rawPricing, auth.user, pricingContextForAuth(auth));
  const cost = pricing.credits;
  if (auth.user.credits < cost) return sendJson(res, 402, insufficientCreditsPayload(cost, auth.user.credits));
  try {
    assertSubtokenCanSpend(auth, cost);
  } catch (error) {
    return sendJson(res, error.statusCode || 402, error.payload || { ok: false, code: error.code || "SUBTOKEN_UNAVAILABLE", message: error.message });
  }

  const taskId = localGenerationTaskId("img");
  const upstreamModel = hasReferences ? GPT_IMAGE2_EDIT_MODEL : GPT_IMAGE2_TEXT_MODEL;
  const initialRecord = {
    taskId,
    status: "submitting",
    model: upstreamModel,
    source: "advanced-gpt-image-2",
    kind: "advanced-image",
    provider: GPT_IMAGE2_PROVIDER,
    upstreamSource: USE_GATEWAY_UPSTREAM ? "gateway" : "apiz-gpt-image-2",
    userId: auth.user.id,
    userAssetIds: [],
    userAssetId: "",
    imageUrl: "",
    imageUrls: [],
    sourceImageUrl: "",
    sourceImageUrls: [],
    prompt,
    finalPrompt: prompt,
    params: {
      ...plainObject(bodyParams),
      ...plainObject(body.params),
      provider: GPT_IMAGE2_PROVIDER,
      ratio,
      image_size: ratio,
      resolution,
      quality,
      size: resolution,
      output_format: outputFormat,
      referenceImageCount: referenceInputs.length,
      action: hasReferences ? "image_reference" : "text_to_image",
    },
    resolution,
    ratio,
    size: resolution,
    quality,
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
    ...requestTraceForGeneration(req),
  };
  await upsertGenerationRecord(initialRecord);
  if (cost > 0) {
    await chargeUserWithSubtoken(auth, {
      cost,
      type: "advanced_gpt_image2",
      taskId,
      meta: {
        taskId,
        provider: GPT_IMAGE2_PROVIDER,
        model: upstreamModel,
        ratio,
        resolution,
        quality,
        outputFormat,
        referenceImageCount: referenceInputs.length,
        outputUsd: pricing.outputUsd,
        referenceUsd: pricing.referenceUsd,
        totalUsd: pricing.totalUsd,
        baseCredits: pricing.baseCredits,
        originalCost: pricing.originalCredits,
        pricingMultiplier: pricing.userPricingMultiplier,
        pricingSource: pricing.source,
      },
    });
    if (!dbEnabled()) await writeDb(auth.db);
  }

  startGptImage2GenerationJob({
    taskId,
    userId: auth.user.id,
    body,
    bodyParams,
    initialParams: initialRecord.params,
    prompt,
    resolution,
    quality,
    ratio,
    outputFormat,
    pricing,
    cost,
  });
  const latestUser = await getUserByIdInDb(auth.user.id) || auth.user;
  const publicRecord = publicGenerationRecord(await getGenerationRecord(taskId) || initialRecord, generationRecordResponseOptionsForAuth(auth));
  return sendJson(res, 200, {
    ok: true,
    async: true,
    taskId,
    upstreamTaskId: "",
    imageUrl: "",
    user: userView(latestUser),
    pricing,
    cost,
    record: publicRecord,
    params: {
      provider: GPT_IMAGE2_PROVIDER,
      ratio,
      resolution,
      quality,
      size: resolution,
      output_format: outputFormat,
      referenceImageCount: referenceInputs.length,
    },
  });
}
