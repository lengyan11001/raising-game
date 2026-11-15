function qwenImage3ReferenceInputsFromBody(body = {}) {
  const inputs = seedream5ReferenceInputsFromBody(body);
  if (inputs.length > QWEN_IMAGE3_REFERENCE_LIMIT) {
    throw advancedValidationError(
      "QWEN_IMAGE3_TOO_MANY_REFERENCES",
      `Qwen Image 3.0 supports at most ${QWEN_IMAGE3_REFERENCE_LIMIT} reference images.`,
      { count: inputs.length, max: QWEN_IMAGE3_REFERENCE_LIMIT },
    );
  }
  return inputs;
}

async function prepareQwenImage3ReferenceImages(db, user, body = {}) {
  const inputs = qwenImage3ReferenceInputsFromBody(body);
  const preservePublicMediaUrls = boolFromRequest(body.preservePublicMediaUrls, false);
  const publicInputs = preservePublicMediaUrls
    ? inputs.map((item) => {
        const value = typeof item === "string" ? item : firstPresent(item?.url, item?.imageUrl, item?.image_url, "");
        return isPublicHttpUrl(value) ? publicHttpUrlForUpstream(value) : "";
      }).filter(Boolean)
    : [];
  const localInputs = inputs.filter((item) => {
    const value = typeof item === "string" ? item : firstPresent(item?.url, item?.imageUrl, item?.image_url, "");
    return !preservePublicMediaUrls || !isPublicHttpUrl(value);
  });
  const assets = await createUserImageAssetsFromInputs(db, user, localInputs, { name: "Qwen Image 3.0 reference" });
  const preparedAssets = [];
  const publicImageUrls = [...publicInputs];
  for (const asset of assets) {
    validateWan27MediaKind(asset, "image", "Qwen Image 3.0 reference");
    if (Number(asset.sizeBytes || 0) > 10 * 1024 * 1024) {
      throw advancedValidationError("QWEN_IMAGE3_REFERENCE_TOO_LARGE", "Qwen Image 3.0 reference images must be 10MB or smaller.", { assetId: asset.id || "" });
    }
    const mime = String(asset.mime || "").toLowerCase();
    if (mime && !["image/jpeg", "image/png", "image/bmp", "image/tiff", "image/webp", "image/gif"].includes(mime)) {
      throw advancedValidationError("QWEN_IMAGE3_REFERENCE_FORMAT", "Qwen Image 3.0 reference images must be JPG, JPEG, PNG, BMP, TIFF, WebP, or GIF.", { assetId: asset.id || "", mime });
    }
    const prepared = await ensurePublicUrlForUserMediaAsset(db, asset);
    const publicUrl = publicUrlForLocalAsset(prepared);
    if (!isPublicHttpUrl(publicUrl)) {
      throw advancedValidationError("QWEN_IMAGE3_REFERENCE_NOT_PUBLIC", "Failed to prepare Qwen Image 3.0 reference image URL.", { assetId: asset.id || "" });
    }
    preparedAssets.push(prepared);
    publicImageUrls.push(publicUrl);
  }
  return {
    inputs,
    assets: preparedAssets,
    publicImageUrls: [...new Set(publicImageUrls)],
  };
}

function qwenImage3RequestFingerprint({ userId = "", model = "", prompt = "", size = "", outputImageCount = 1, negativePrompt = "", promptExtend = true, promptExtendMode = "direct", watermark = false, seed = null, referenceInputs = [] } = {}) {
  const references = (Array.isArray(referenceInputs) ? referenceInputs : []).map((item) => {
    if (typeof item === "string") return item.trim();
    const value = String(item?.assetId || item?.url || item?.imageUrl || item?.image_url || item?.dataUrl || item?.fileName || "").trim();
    return /^data:/i.test(value) ? `data:${crypto.createHash("sha256").update(value).digest("hex")}` : value;
  }).filter(Boolean);
  return crypto.createHash("sha256").update(JSON.stringify({
    provider: "qwen-image3",
    userId: String(userId || ""),
    model,
    prompt: String(prompt || "").trim(),
    size,
    outputImageCount,
    negativePrompt: String(negativePrompt || "").trim(),
    promptExtend: Boolean(promptExtend),
    promptExtendMode: String(promptExtendMode || "direct"),
    watermark: Boolean(watermark),
    seed: seed === undefined || seed === null || seed === "" ? null : Number(seed),
    references,
  })).digest("hex").slice(0, 32);
}

async function withQwenImage3InFlight(fingerprint, fn) {
  const key = String(fingerprint || "").trim();
  if (!key) return await fn();
  while (QWEN_IMAGE3_IN_FLIGHT.has(key)) await QWEN_IMAGE3_IN_FLIGHT.get(key).catch(() => {});
  let release = () => {};
  const lock = new Promise((resolve) => { release = resolve; });
  QWEN_IMAGE3_IN_FLIGHT.set(key, lock);
  try {
    return await fn();
  } finally {
    if (QWEN_IMAGE3_IN_FLIGHT.get(key) === lock) QWEN_IMAGE3_IN_FLIGHT.delete(key);
    release();
  }
}

async function findActiveQwenImage3Duplicate({ userId = "", fingerprint = "" } = {}) {
  const cutoff = Date.now() - 5 * 60 * 1000;
  const settledCutoff = Date.now() - 3 * 60 * 1000;
  const records = await listGenerationRecordsForUser(userId, 80);
  return records.find((record) => (
    record?.provider === "qwen-image3"
    && String(record.requestFingerprint || record.params?.requestFingerprint || "") === fingerprint
    && (
      (isActiveGenerationStatus(record.status) && generationRecordCreatedMs(record) >= cutoff)
      || (isSucceededStatus(record.status) && seedream5ImageRecordHasResult(record) && generationRecordUpdatedMs(record) >= settledCutoff)
    )
  )) || null;
}

function queueQwenImage3Submit(submit) {
  const run = qwenImage3SubmitTail.catch(() => {}).then(async () => {
    const waitMs = Math.max(0, 61000 - (Date.now() - qwenImage3LastSubmitAt));
    if (waitMs) await delay(waitMs);
    qwenImage3LastSubmitAt = Date.now();
    return await submit();
  });
  qwenImage3SubmitTail = run.then(() => undefined, () => undefined);
  return run;
}

function qwen37FlashResponseText(raw = {}) {
  const content = raw?.choices?.[0]?.message?.content;
  if (typeof content === "string") return content.trim();
  if (Array.isArray(content)) {
    return content
      .map((item) => typeof item === "string" ? item : String(item?.text || item?.content || ""))
      .filter(Boolean)
      .join("\n")
      .trim();
  }
  return String(raw?.choices?.[0]?.text || raw?.output?.text || "").trim();
}

function qwen37FlashUsage(raw = {}) {
  const usage = plainObject(raw.usage);
  return {
    promptTokens: Math.max(0, Math.floor(Number(usage.prompt_tokens ?? usage.input_tokens ?? 0) || 0)),
    completionTokens: Math.max(0, Math.floor(Number(usage.completion_tokens ?? usage.output_tokens ?? 0) || 0)),
    totalTokens: Math.max(0, Math.floor(Number(usage.total_tokens ?? 0) || 0)),
  };
}

async function settleQwen37FlashUsage({ taskId = "", userId = "", cost = 0, pricing = {}, advancedPricing = {}, usage = {}, provider = "qwen37-flash", prompt = "", textResult = "", maxTokens = 0 } = {}) {
  let promptTokens = Math.max(0, Math.floor(Number(usage.promptTokens || 0)));
  let completionTokens = Math.max(0, Math.floor(Number(usage.completionTokens || 0)));
  if (!promptTokens) promptTokens = Math.max(1, Math.floor(Number(pricing.inputTokens || 0)) || Math.ceil(Buffer.byteLength(String(prompt || ""), "utf8") / 2) || 1);
  if (!completionTokens && String(textResult || "").trim()) {
    const cap = Math.max(1, Math.floor(Number(maxTokens || pricing.outputTokens || QWEN37_FLASH_MAX_OUTPUT_TOKENS) || QWEN37_FLASH_MAX_OUTPUT_TOKENS));
    completionTokens = Math.min(cap, Math.max(1, Math.ceil(String(textResult).length * 1.5)));
  }
  const rawFinalPricing = advancedModelPricing(provider, {
    advancedPricing,
    inputTokens: Math.max(1, promptTokens),
    outputTokens: Math.max(0, completionTokens),
  });
  const finalPricing = applyUserPricingToEstimate(rawFinalPricing, pricing.userPricingMultiplier || 1);
  const finalCost = finalPricing.credits;
  const adjustment = creditsAmount(Math.abs(Number(cost || 0) - finalCost));
  if (adjustment > 0) {
    const refund = Number(cost || 0) > finalCost;
    const db = await readDb();
    await changeUserCredits(db, userId, refund ? adjustment : -adjustment, "advanced_qwen37_flash_settlement", {
      taskId,
      preDeductedCredits: cost,
      finalCredits: finalCost,
      promptTokens: usage.promptTokens || 0,
      completionTokens: usage.completionTokens || 0,
    });
    const currentRecord = await getGenerationRecord(taskId).catch(() => null);
    await recordSubtokenAdjustment(currentRecord || { taskId, userId }, {
      taskId,
      type: "advanced_qwen37_flash_settlement",
      amount: refund ? -adjustment : adjustment,
      meta: { preDeductedCredits: cost, finalCredits: finalCost },
    });
    if (!dbEnabled()) await writeDb(db);
  }
  return { finalCost, finalPricing };
}

async function runQwen37FlashGenerationJob(job = {}, submission = null) {
  const {
    taskId = "",
    userId = "",
    prompt = "",
    enableThinking = false,
    maxTokens = 1024,
    temperature = 0.7,
    pricing = {},
    advancedPricing = {},
    cost = 0,
    provider = "qwen37-flash",
    model = QWEN37_FLASH_MODEL,
  } = job;
  if (!taskId || !userId) return;
  let upstreamPayload = null;
  try {
    await upsertGenerationRecord({ taskId, status: "running", awaitingUpstreamTask: true, error: "" });
    const imageUrls = Array.isArray(job.images) ? job.images.filter((item) => String(item || "").startsWith("data:image/")).slice(0, 4) : [];
    upstreamPayload = {
      model,
      messages: provider === "papaya"
        ? [{
            role: "user",
            content: imageUrls.length
              ? [{ type: "text", text: prompt }, ...imageUrls.map((url) => ({ type: "image_url", image_url: { url } }))]
              : prompt,
          }]
        : provider === "byteplus-language"
        ? [
            { role: "system", content: "You are an artificial intelligence assistant." },
            { role: "user", content: prompt },
          ]
        : [{ role: "user", content: prompt }],
      ...(provider === "byteplus-language" || provider === "papaya" ? {} : { enable_thinking: enableThinking === true }),
      max_tokens: maxTokens,
      temperature,
    };
    const storedPayload = provider === "papaya"
      ? JSON.parse(JSON.stringify(upstreamPayload, (key, value) => key === "url" && String(value).startsWith("data:image/") ? "[image]" : value))
      : upstreamPayload;
    await upsertGenerationRecord({ taskId, upstreamPayload: storedPayload });
    const raw = provider === "papaya"
      ? await papayaLanguageRequest(upstreamPayload)
      : provider === "byteplus-language"
      ? await byteplusLanguageRequest(upstreamPayload)
      : await aliyunQwen37FlashRequest(upstreamPayload);
    const providerLabel = publicProviderLabel(provider);
    const textResult = qwen37FlashResponseText(raw);
    if (!textResult) {
      const error = new Error(`${providerLabel} returned no text.`);
      error.statusCode = 502;
      error.payload = raw;
      throw error;
    }
    const usage = qwen37FlashUsage(raw);
    const { finalCost, finalPricing } = await settleQwen37FlashUsage({
      taskId,
      userId,
      cost,
      pricing,
      advancedPricing,
      usage,
      provider,
      prompt,
      textResult,
      maxTokens,
    });
    await upsertGenerationRecord({
      taskId,
      upstreamTaskId: String(raw.id || raw.request_id || raw.requestId || ""),
      status: "succeeded",
      awaitingUpstreamTask: false,
      createResponse: raw,
      textResult,
      responseText: textResult,
      usage,
      finalCredits: finalCost,
      originalFinalCredits: finalPricing.originalCredits ?? finalCost,
      pricingEstimate: finalPricing,
      billingStatus: finalCost > 0 ? "settled" : "free",
      billingSettledAt: new Date().toISOString(),
      error: "",
    });
  } catch (error) {
    const errorInfo = normalizeErrorPayload(error);
    console.warn("[language-model-error]", taskId, errorInfo.message || error.message || error);
    const currentRecord = await getGenerationRecord(taskId).catch(() => null);
    let refunded = cost <= 0;
    let refundError = null;
    if (cost > 0) {
      const result = await refundCreditsWithSubtoken(currentRecord || { taskId, userId }, userId, cost, "advanced_qwen37_flash_refund", {
        taskId,
        error: error.message || `${providerLabel} failed.`,
      }, { logTag: "qwen37-flash" });
      refunded = result.refunded;
      refundError = result.error;
    }
    await upsertGenerationRecord({
      taskId,
      status: "failed",
      awaitingUpstreamTask: false,
      error: errorInfo.message || `${providerLabel} failed.`,
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

function startQwen37FlashGenerationJob(job = {}) {
  return startTrackedGenerationJob("qwen37-flash-generation", job.taskId, (submission) => runQwen37FlashGenerationJob(job, submission), (error) => {
    console.error("[qwen37-flash-job-unhandled]", job.taskId || "", error.message || error);
  });
}

async function handleAdvancedQwen37FlashGenerate(req, res, context = {}) {
  const auth = context.auth || await requireUser(req, res);
  if (!auth) return;
  const provider = context.provider === "papaya" ? "papaya" : context.provider === "byteplus-language" ? "byteplus-language" : "qwen37-flash";
  const model = provider === "papaya" ? PAPAYA_MODEL : provider === "byteplus-language" ? BYTEPLUS_LANGUAGE_MODEL : QWEN37_FLASH_MODEL;
  const missingKey = provider === "papaya" ? !String(process.env.MULEROUTER_API_KEY || "").trim() : provider === "byteplus-language" ? !ARK_API_KEY : !ALIYUN_QWEN37_API_KEY;
  if (missingKey) {
    return sendJson(res, 503, {
      ok: false,
      code: provider === "papaya" ? "MISSING_MULEROUTER_API_KEY" : provider === "byteplus-language" ? "MISSING_ARK_API_KEY" : "MISSING_ALIYUN_QWEN37_API_KEY",
      message: `${publicProviderLabel(provider)} is not configured.`,
    });
  }
  const body = context.body || await readJson(req);
  const bodyParams = context.bodyParams || requestParamsFromBody(body);
  const caseParams = context.caseParams || {};
  const config = context.config || await readAppConfig();
  const merged = { ...plainObject(caseParams.parameters), ...plainObject(bodyParams.parameters), ...plainObject(body.parameters) };
  const prompt = String(context.prompt || firstPresent(body.prompt, bodyParams.prompt, caseParams.prompt, "")).trim();
  if (!prompt) return sendJson(res, 400, { ok: false, message: "Prompt is required." });
  if (prompt.length > 250000) return sendJson(res, 400, { ok: false, code: "PROMPT_TOO_LONG", message: "Prompt must be 250000 characters or fewer." });
  const configuredPricing = normalizeAdvancedPricing(config.platform?.advancedPricing || DEFAULT_ADVANCED_PRICING).qwen37Flash;
  const enableThinking = boolFromRequest(firstPresent(body.enable_thinking, body.enableThinking, bodyParams.enable_thinking, merged.enable_thinking), false);
  const maxTokens = Math.floor(clampNumber(
    firstPresent(body.max_tokens, body.maxTokens, bodyParams.max_tokens, merged.max_tokens),
    configuredPricing.defaultMaxTokens || 1024,
    1,
    QWEN37_FLASH_MAX_OUTPUT_TOKENS,
  ));
  const temperature = clampNumber(
    firstPresent(body.temperature, bodyParams.temperature, merged.temperature),
    configuredPricing.defaultTemperature ?? 0.7,
    0,
    2,
  );
  const papayaImages = provider === "papaya" ? await papayaImageDataUrls(auth, body) : [];
  const estimatedInputTokens = Math.max(1, Math.min(256000, Math.ceil(Buffer.byteLength(prompt, "utf8") / 2) + 32 + papayaImages.length * 800));
  const rawPricing = provider === "papaya"
    ? papayaPricingEstimate(config.platform?.advancedPricing, { inputTokens: estimatedInputTokens, outputTokens: maxTokens })
    : qwen37FlashPricingEstimate(config.platform?.advancedPricing, {
    inputTokens: estimatedInputTokens,
    outputTokens: maxTokens,
  });
  const pricing = applyUserPricingToEstimate(rawPricing, auth.user, pricingContextForAuth(auth));
  const cost = pricing.credits;
  if (auth.user.credits < cost) return sendJson(res, 402, insufficientCreditsPayload(cost, auth.user.credits));
  try {
    assertSubtokenCanSpend(auth, cost);
  } catch (error) {
    return sendJson(res, error.statusCode || 402, error.payload || { ok: false, code: error.code, message: error.message });
  }
  const taskId = localGenerationTaskId("txt");
  const requestTrace = requestTraceForGeneration(req);
  const params = {
    provider,
    model,
    enable_thinking: enableThinking,
    max_tokens: maxTokens,
    temperature,
  };
  const initialRecord = {
    taskId,
    status: "submitting",
    model,
    source: provider === "papaya" ? "advanced-papaya" : provider === "byteplus-language" ? "advanced-byteplus-language" : "advanced-qwen37-flash",
    kind: "advanced-text",
    provider,
    upstreamSource: provider === "papaya" ? "mulerouter-papaya" : provider === "byteplus-language" ? "byteplus-ark-openai-compatible" : "aliyun-openai-compatible",
    userId: auth.user.id,
    prompt,
    finalPrompt: prompt,
    params,
    preDeductedCredits: cost,
    originalPreDeductedCredits: pricing.originalCredits ?? cost,
    finalCredits: null,
    originalFinalCredits: null,
    userPricingMultiplier: pricing.userPricingMultiplier ?? 1,
    billingStatus: cost > 0 ? "pre_deducted" : "free",
    billingSettledAt: "",
    pricingEstimate: pricing,
    awaitingUpstreamTask: true,
    error: "",
    apiTokenId: auth.tokenRecord?.id || "",
    apiTokenName: auth.tokenRecord?.name || "",
    apiTokenType: auth.tokenRecord?.quotaType || "",
    apiTokenSource: auth.tokenSource || "",
    ...requestTrace,
  };
  await upsertGenerationRecord(initialRecord);
  if (cost > 0) {
    await chargeUserWithSubtoken(auth, {
      cost,
      type: "advanced_qwen37_flash",
      taskId,
      meta: { taskId, provider, model, maxTokens, enableThinking, pricingSource: pricing.source },
    });
    if (!dbEnabled()) await writeDb(auth.db);
  }
  startQwen37FlashGenerationJob({
    taskId,
    userId: auth.user.id,
    prompt,
    enableThinking,
    maxTokens,
    temperature,
    pricing,
    advancedPricing: config.platform?.advancedPricing,
    cost,
    provider,
    model,
    images: papayaImages,
  });
  const latestUser = await getUserByIdInDb(auth.user.id) || auth.user;
  return sendJson(res, 200, {
    ok: true,
    async: true,
    taskId,
    user: userView(latestUser),
    pricing,
    cost,
    record: publicGenerationRecord(initialRecord, generationRecordResponseOptionsForAuth(auth)),
    params,
  });
}

async function runQwenImage3GenerationJob(job = {}, submission = null) {
  const { taskId = "", userId = "", body = {}, bodyParams = {}, initialParams = {}, prompt = "", tier = "pro", model = "", resolution = "2K", ratio = "1:1", size = "", outputImageCount = 1, negativePrompt = "", promptExtend = true, promptExtendMode = "direct", watermark = false, seed = null, pricing = {}, cost = 0 } = job;
  if (!taskId || !userId) return;
  let upstreamPayload = null;
  try {
    const db = await readDb();
    const user = (db.users || []).find((entry) => entry.id === userId);
    if (!user) throw Object.assign(new Error("User not found for Qwen Image 3.0 job."), { statusCode: 404 });
    const prepared = await prepareQwenImage3ReferenceImages(db, user, { ...bodyParams, ...body });
    const previewUrls = prepared.assets.map((asset) => asset.localUrl || asset.publicUrl || "").filter(Boolean);
    await upsertGenerationRecord({
      taskId,
      status: "running",
      userAssetIds: prepared.assets.map((asset) => asset.id),
      userAssetId: prepared.assets[0]?.id || "",
      imageUrl: previewUrls[0] || "",
      imageUrls: previewUrls,
      sourceImageUrl: previewUrls[0] || "",
      sourceImageUrls: previewUrls,
      params: { ...initialParams, referenceImageCount: prepared.publicImageUrls.length },
    });
    const payload = buildQwenImage3Request({
      model,
      tier,
      prompt,
      referenceImages: prepared.publicImageUrls,
      resolution,
      ratio,
      size,
      n: outputImageCount,
      negativePrompt,
      promptExtend,
      promptExtendMode,
      watermark,
      seed,
    });
    upstreamPayload = payload;
    await upsertGenerationRecord({ taskId, upstreamPayload });
    if (USE_GATEWAY_UPSTREAM) {
      const gatewayBody = {
        provider: "qwen-image3",
        model,
        qwenTier: tier,
        prompt,
        referenceImages: prepared.publicImageUrls.map((url) => ({ url })),
        preservePublicMediaUrls: true,
        resolution,
        ratio,
        size: payload.parameters.size,
        n: outputImageCount,
        negative_prompt: negativePrompt,
        prompt_extend: promptExtend,
        prompt_extend_mode: promptExtendMode,
        watermark,
        ...(seed === null ? {} : { seed }),
      };
      const submitted = await gatewaySubmitAdvancedTask(gatewayBody);
      if (!submitted.taskId) throw Object.assign(new Error("Qwen Image 3.0 gateway did not return a task id."), { statusCode: 502, payload: submitted.raw || submitted });
      await upsertGenerationRecord({
        taskId,
        upstreamTaskId: submitted.taskId,
        upstreamSource: "gateway",
        awaitingUpstreamTask: true,
        status: submitted.status || "submitted",
        upstreamPayload: gatewayBody,
        createResponse: submitted.raw || submitted,
        error: "",
      });
      return;
    }
    const raw = await queueQwenImage3Submit(() => aliyunDashscopeRequest(
      "/api/v1/services/aigc/multimodal-generation/generation",
      { body: payload, provider: "qwen-image3", timeoutMs: 10 * 60 * 1000 },
    ));
    const remoteImageUrls = qwenImage3OutputUrls(raw);
    if (!remoteImageUrls.length) throw Object.assign(new Error("Qwen Image 3.0 returned no image."), { statusCode: 502, payload: raw });
    const savedImages = [];
    for (let index = 0; index < remoteImageUrls.length; index += 1) {
      savedImages.push(await saveRemoteGeneratedImage(index ? `${taskId}-${index + 1}` : taskId, remoteImageUrls[index]));
    }
    if (savedImages.some((item) => !item.cdnImageUrl || !item.storageKey)) {
      throw Object.assign(new Error("Qwen Image 3.0 output could not be persisted to object storage."), {
        statusCode: 502,
        retryable: true,
        payload: raw,
      });
    }
    const resultUrls = savedImages.map((item, index) => item.cdnImageUrl || remoteImageUrls[index]).filter(Boolean);
    await upsertGenerationRecord({
      taskId,
      upstreamTaskId: String(raw.request_id || raw.requestId || ""),
      status: "succeeded",
      awaitingUpstreamTask: false,
      createResponse: raw,
      imageResultUrl: resultUrls[0] || "",
      imageResultUrls: resultUrls,
      localImageUrl: savedImages[0]?.localImageUrl || "",
      localImageUrls: savedImages.map((item) => item.localImageUrl).filter(Boolean),
      cdnImageUrl: savedImages[0]?.cdnImageUrl || "",
      cdnImageUrls: savedImages.map((item) => item.cdnImageUrl).filter(Boolean),
      cdnImageStorageKeys: savedImages.map((item) => item.storageKey || ""),
      storageProvider: savedImages[0]?.storageProvider || "",
      storageKey: savedImages[0]?.storageKey || "",
      remoteImageUrl: remoteImageUrls[0] || "",
      remoteImageUrls,
      finalCredits: cost,
      originalFinalCredits: pricing.originalCredits ?? cost,
      billingStatus: cost > 0 ? "settled" : "free",
      billingSettledAt: new Date().toISOString(),
      error: "",
    });
  } catch (error) {
    const errorInfo = normalizeErrorPayload(error);
    console.warn("[qwen-image3-error]", taskId, errorInfo.message || error.message || error);
    const currentRecord = await getGenerationRecord(taskId).catch(() => null);
    let refunded = cost <= 0;
    let refundError = null;
    if (cost > 0) {
      const result = await refundCreditsWithSubtoken(currentRecord || { taskId, userId }, userId, cost, "advanced_qwen_image3_refund", {
        taskId,
        error: error.message || "Qwen Image 3.0 failed.",
      }, { logTag: "qwen-image3" });
      refunded = result.refunded;
      refundError = result.error;
    }
    await upsertGenerationRecord({
      taskId,
      status: "failed",
      awaitingUpstreamTask: false,
      error: errorInfo.message || "Qwen Image 3.0 failed.",
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

function startQwenImage3GenerationJob(job = {}) {
  return startTrackedGenerationJob("qwen-image3-generation", job.taskId, (submission) => runQwenImage3GenerationJob(job, submission), (error) => {
    console.error("[qwen-image3-job-unhandled]", job.taskId || "", error.message || error);
  });
}

async function handleAdvancedQwenImage3Generate(req, res, context = {}) {
  const auth = context.auth || await requireUser(req, res);
  if (!auth) return;
  if (!USE_GATEWAY_UPSTREAM && !ALIYUN_QWEN_IMAGE3_API_KEY) {
    return sendJson(res, 503, { ok: false, code: "MISSING_ALIYUN_QWEN_IMAGE3_API_KEY", message: "Qwen Image 3.0 generation is not configured." });
  }
  const body = context.body || await readJson(req);
  const bodyParams = context.bodyParams || requestParamsFromBody(body);
  const caseParams = context.caseParams || {};
  const selectedCase = context.selectedCase || null;
  const config = context.config || await readAppConfig();
  const merged = { ...plainObject(caseParams.parameters), ...plainObject(bodyParams.parameters), ...plainObject(body.parameters) };
  const prompt = String(context.prompt || firstPresent(body.prompt, bodyParams.prompt, selectedCase?.prompt, caseParams.prompt, "")).trim();
  if (!prompt) return sendJson(res, 400, { ok: false, message: "Prompt is required." });
  let referenceInputs;
  let tier;
  let model;
  let resolution;
  let ratio;
  let size;
  let outputImageCount;
  let seed;
  try {
    referenceInputs = qwenImage3ReferenceInputsFromBody({ ...bodyParams, ...body });
    tier = normalizeQwenImage3Tier(firstPresent(body.qwenTier, body.qwenImageTier, bodyParams.qwenTier, merged.qwenTier, caseParams.qwenTier), firstPresent(body.model, bodyParams.model, merged.model, caseParams.model));
    model = qwenImage3ModelForTier(tier, firstPresent(body.model, bodyParams.model, merged.model, caseParams.model));
    resolution = normalizeQwenImage3Resolution(firstPresent(body.resolution, bodyParams.resolution, merged.resolution, config.platform?.advancedPricing?.qwenImage3?.defaultResolution, "2K"));
    const requestedRatio = firstPresent(body.ratio, body.aspect_ratio, bodyParams.ratio, bodyParams.aspect_ratio, merged.ratio, "");
    ratio = normalizeVideoRatio(requestedRatio || "1:1");
    size = qwenImage3SizeForSelection({
      size: firstPresent(body.size, bodyParams.size, merged.size, ""),
      resolution,
      ratio,
      ratioSpecified: String(requestedRatio || "").trim() !== "",
    });
    resolution = qwenImage3ResolutionForSize(size, resolution);
    outputImageCount = qwenImage3OfficialPricing({ tier, resolution, referenceImageCount: referenceInputs.length, outputImageCount: firstPresent(body.n, body.outputImageCount, bodyParams.n, merged.n, 1) }).outputImageCount;
    seed = firstPresent(body.seed, bodyParams.seed, merged.seed, null);
    buildQwenImage3Request({ model, tier, prompt, resolution, ratio, size, n: outputImageCount, seed });
  } catch (error) {
    return sendAdvancedValidationError(res, error, "Qwen Image 3.0 request is invalid.");
  }
  const negativePrompt = String(firstPresent(body.negative_prompt, body.negativePrompt, bodyParams.negative_prompt, merged.negative_prompt, "")).trim();
  const promptExtend = boolFromRequest(firstPresent(body.prompt_extend, body.promptExtend, bodyParams.prompt_extend, merged.prompt_extend), true);
  const promptExtendMode = String(firstPresent(body.prompt_extend_mode, body.promptExtendMode, bodyParams.prompt_extend_mode, merged.prompt_extend_mode, "direct")).trim().toLowerCase() === "agent" ? "agent" : "direct";
  const watermark = boolFromRequest(firstPresent(body.watermark, bodyParams.watermark, merged.watermark), false);
  const requestFingerprint = qwenImage3RequestFingerprint({ userId: auth.user.id, model, prompt, size, outputImageCount, negativePrompt, promptExtend, promptExtendMode, watermark, seed, referenceInputs });
  const requestTrace = requestTraceForGeneration(req);
  return await withQwenImage3InFlight(requestFingerprint, async () => {
    const duplicateRecord = await findActiveQwenImage3Duplicate({ userId: auth.user.id, fingerprint: requestFingerprint });
    if (duplicateRecord) {
      return sendJson(res, 200, { ok: true, async: !isSucceededStatus(duplicateRecord.status), duplicate: true, taskId: duplicateRecord.taskId, record: publicGenerationRecord(duplicateRecord, generationRecordResponseOptionsForAuth(auth)) });
    }
    const rawPricing = advancedModelPricing("qwen-image3", { advancedPricing: config.platform?.advancedPricing, qwenTier: tier, model, resolution, size, referenceImageCount: referenceInputs.length, outputImageCount });
    const pricing = applyUserPricingToEstimate(rawPricing, auth.user, pricingContextForAuth(auth));
    const cost = pricing.credits;
    if (auth.user.credits < cost) return sendJson(res, 402, insufficientCreditsPayload(cost, auth.user.credits));
    try { assertSubtokenCanSpend(auth, cost); } catch (error) { return sendJson(res, error.statusCode || 402, error.payload || { ok: false, code: error.code, message: error.message }); }
    const taskId = localGenerationTaskId("img");
    const initialRecord = {
      taskId,
      status: "submitting",
      model,
      source: "advanced-qwen-image3",
      kind: "advanced-image",
      provider: "qwen-image3",
      upstreamSource: USE_GATEWAY_UPSTREAM ? "gateway" : "direct",
      userId: auth.user.id,
      prompt,
      finalPrompt: prompt,
      params: { ...plainObject(bodyParams), provider: "qwen-image3", qwenTier: tier, resolution, ratio, size, n: outputImageCount, referenceImageCount: referenceInputs.length, negative_prompt: negativePrompt, prompt_extend: promptExtend, prompt_extend_mode: promptExtendMode, watermark, ...(seed === null ? {} : { seed }), requestFingerprint },
      requestFingerprint,
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
      error: "",
      apiTokenId: auth.tokenRecord?.id || "",
      apiTokenName: auth.tokenRecord?.name || "",
      apiTokenType: auth.tokenRecord?.quotaType || "",
      apiTokenSource: auth.tokenSource || "",
      ...requestTrace,
    };
    await upsertGenerationRecord(initialRecord);
    if (cost > 0) {
      await chargeUserWithSubtoken(auth, { cost, type: "advanced_qwen_image3", taskId, meta: { taskId, provider: "qwen-image3", model, qwenTier: tier, resolution, size, outputImageCount, referenceImageCount: referenceInputs.length, pricingSource: pricing.source } });
      if (!dbEnabled()) await writeDb(auth.db);
    }
    startQwenImage3GenerationJob({ taskId, userId: auth.user.id, body, bodyParams, initialParams: initialRecord.params, prompt, tier, model, resolution, ratio, size, outputImageCount, negativePrompt, promptExtend, promptExtendMode, watermark, seed, pricing, cost });
    const latestUser = await getUserByIdInDb(auth.user.id) || auth.user;
    return sendJson(res, 200, { ok: true, async: true, taskId, user: userView(latestUser), pricing, cost, record: publicGenerationRecord(initialRecord, generationRecordResponseOptionsForAuth(auth)), params: initialRecord.params });
  });
}

async function handleAdvancedZImageSpicyProGenerate(req, res, context = {}) {
  const auth = context.auth || await requireUser(req, res);
  if (!auth) return;
  if (!USE_GATEWAY_UPSTREAM && !ALIYUN_DASHSCOPE_API_KEY && !String(process.env.MULEROUTER_API_KEY || "").trim()) {
    return sendJson(res, 503, { ok: false, code: "MISSING_ALIYUN_DASHSCOPE_API_KEY", message: "Z-Image Spicy Pro generation is not configured." });
  }
  const body = context.body || await readJson(req);
  const bodyParams = context.bodyParams || requestParamsFromBody(body);
  const caseParams = context.caseParams || {};
  const selectedCase = context.selectedCase || null;
  const config = context.config || await readAppConfig();
  const merged = {
    ...plainObject(caseParams.parameters),
    ...plainObject(bodyParams.parameters),
    ...plainObject(body.parameters),
  };
  const prompt = String(context.prompt || firstPresent(body.prompt, bodyParams.prompt, selectedCase?.prompt, caseParams.prompt, "")).trim();
  if (!prompt) return sendJson(res, 400, { ok: false, message: "Prompt is required." });

  const imagePricing = normalizeAdvancedPricing(config.platform?.advancedPricing).zImageSpicyPro || DEFAULT_ADVANCED_PRICING.zImageSpicyPro;
  const defaultResolution = String(firstPresent(body.resolution, bodyParams.resolution, merged.resolution, imagePricing.defaultResolution || "2K"));
  const defaultRatio = String(firstPresent(body.ratio, body.aspect_ratio, bodyParams.ratio, bodyParams.aspect_ratio, merged.ratio, imagePricing.defaultRatio || "9:16"));
  const resolution = normalizeWan27ImageResolution(defaultResolution);
  const ratio = normalizeWan27ImageRatio(defaultRatio);
  const size = String(firstPresent(body.size, bodyParams.size, merged.size, wan27ImageSize(resolution, ratio)));
  const n = Number(firstPresent(body.n, body.outputImageCount, bodyParams.n, merged.n, 1)) || 1;
  if (n !== 1) return sendJson(res, 400, { ok: false, code: "Z_IMAGE_MULTI_OUTPUT_UNSUPPORTED", message: "Z-Image Spicy Pro supports one image per request." });
  const watermark = boolFromRequest(firstPresent(body.watermark, bodyParams.watermark, merged.watermark), false);
  const promptExtend = boolFromRequest(firstPresent(body.prompt_extend, body.promptExtend, bodyParams.prompt_extend, merged.prompt_extend), true);
  const seed = firstPresent(body.seed, bodyParams.seed, merged.seed, null);
  if (seed !== null && seed !== "" && seed !== undefined) {
    const numericSeed = Number(seed);
    if (!Number.isInteger(numericSeed) || numericSeed < 0 || numericSeed > 2147483647) {
      return sendJson(res, 400, { ok: false, code: "INVALID_SEED", message: "seed must be an integer from 0 to 2147483647." });
    }
  }

  const rawPricing = advancedModelPricing("z-image-spicy-pro", {
    advancedPricing: config.platform?.advancedPricing,
    resolution,
    ratio,
    size,
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
  const requestTrace = requestTraceForGeneration(req);
  const initialRecord = {
    taskId,
    status: "submitting",
    model: imagePricing.model || "z-image-spicy-pro",
    source: "advanced-z-image-spicy-pro",
    kind: "advanced-image",
    provider: "z-image-spicy-pro",
    upstreamSource: USE_GATEWAY_UPSTREAM ? "gateway" : "direct",
    userId: auth.user.id,
    prompt,
    finalPrompt: prompt,
    params: {
      ...plainObject(bodyParams),
      provider: "z-image-spicy-pro",
      resolution,
      ratio,
      size,
      n: 1,
      watermark,
      prompt_extend: promptExtend,
      ...(seed === null || seed === "" || seed === undefined ? {} : { seed }),
      action: "text_to_image",
    },
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
    queryResponse: null,
    remoteImageUrl: "",
    localImageUrl: "",
    error: "",
    apiTokenId: auth.tokenRecord?.id || "",
    apiTokenName: auth.tokenRecord?.name || "",
    apiTokenType: auth.tokenRecord?.quotaType || "",
    apiTokenSource: auth.tokenSource || "",
    ...requestTrace,
  };
  await upsertGenerationRecord(initialRecord);
  if (cost > 0) {
    await chargeUserWithSubtoken(auth, {
      cost,
      type: "advanced_z_image_spicy_pro",
      taskId,
      meta: {
        taskId,
        provider: "z-image-spicy-pro",
        model: imagePricing.model || "z-image-spicy-pro",
        resolution,
        ratio,
        size,
        baseCredits: pricing.baseCredits,
        originalCost: pricing.originalCredits,
        pricingMultiplier: pricing.userPricingMultiplier,
        pricingSource: pricing.source,
      },
    });
    if (!dbEnabled()) await writeDb(auth.db);
  }

  let upstreamPayload = null;
  try {
    upstreamPayload = {
      prompt,
      ratio,
      resolution,
      size,
      n: 1,
      watermark,
      prompt_extend: promptExtend,
      ...(seed === null || seed === "" || seed === undefined ? {} : { seed }),
    };
    await upsertGenerationRecord({ taskId, upstreamPayload });
    const submitted = USE_GATEWAY_UPSTREAM ? await gatewaySubmitWan27ImageEditTask({
      imageUrls: [],
      prompt,
      ratio,
      resolution,
      model: imagePricing.model || "z-image-spicy-pro",
      input: {},
      parameters: {
        size,
        n: 1,
        watermark,
        prompt_extend: promptExtend,
        ...(seed === null || seed === "" || seed === undefined ? {} : { seed }),
      },
      waitForResult: true,
    }) : await submitWan27ImageTextGenerate({
      prompt,
      ratio,
      resolution,
      model: imagePricing.model || "z-image-spicy-pro",
      input: {},
      parameters: {
        size,
        n: 1,
        watermark,
        prompt_extend: promptExtend,
        ...(seed === null || seed === "" || seed === undefined ? {} : { seed }),
      },
      waitForResult: true,
    });
    const imageUrl = submitted.task.imageUrls[0];
    await upsertGenerationRecord({
      taskId,
      upstreamTaskId: submitted.task.taskId || "",
      awaitingUpstreamTask: false,
      status: imageUrl ? (submitted.task.status || "succeeded") : "failed",
      upstreamPayload: submitted.payload,
      createResponse: submitted.raw,
      remoteImageUrl: imageUrl || "",
      error: imageUrl ? "" : (submitted.task.error || "Z-Image Spicy Pro returned no image."),
    });
    if (!imageUrl) {
      const error = new Error(submitted.task.error || "Z-Image Spicy Pro returned no image.");
      error.statusCode = 502;
      error.payload = submitted.raw;
      throw error;
    }
    const savedImage = await saveRemoteGeneratedImage(taskId, imageUrl);
    await upsertGenerationRecord({
      taskId,
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
    });
    const latestUser = await getUserByIdInDb(auth.user.id) || auth.user;
    const publicRecord = publicGenerationRecord(await getGenerationRecord(taskId) || initialRecord, generationRecordResponseOptionsForAuth(auth));
    return sendJson(res, 200, {
      ok: true,
      async: false,
      taskId,
      upstreamTaskId: submitted.task.taskId || "",
      imageUrl: publicRecord.imageResultUrl || savedImage?.localImageUrl || "",
      user: userView(latestUser),
      pricing,
      cost,
      record: publicRecord,
      params: {
        provider: "z-image-spicy-pro",
        resolution,
        ratio,
        size,
        n: 1,
      },
    });
  } catch (error) {
    const errorInfo = normalizeErrorPayload(error);
    console.warn("[z-image-spicy-pro-error]", taskId, errorInfo.message || error.message || error, JSON.stringify(errorInfo.payload || {}).slice(0, 1000));
    const currentRecord = await getGenerationRecord(taskId).catch(() => null);
    let refunded = cost <= 0;
    let refundError = null;
    if (cost > 0) {
      const result = await refundCreditsWithSubtoken(currentRecord || { taskId, userId: auth.user.id }, auth.user.id, cost, "advanced_z_image_spicy_pro_refund", {
        taskId,
        error: error.message || "Z-Image Spicy Pro failed.",
      }, { logTag: "z-image-spicy-pro" });
      refunded = result.refunded;
      refundError = result.error;
    }
    await upsertGenerationRecord({
      taskId,
      status: "failed",
      awaitingUpstreamTask: false,
      error: errorInfo.message || "Z-Image Spicy Pro failed.",
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
    return sendJson(res, error.statusCode || 502, {
      ok: false,
      message: error.message || "Z-Image Spicy Pro failed.",
      code: error.code || "",
      taskId,
      record: publicGenerationRecord(await getGenerationRecord(taskId) || { taskId }, generationRecordResponseOptionsForAuth(auth)),
      payload: error.payload || null,
    });
  }
}

