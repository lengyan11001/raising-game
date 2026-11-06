async function settleWan30AdaptiveDuration(record = {}, reason = "query") {
  if (!usesWan30AdaptiveDurationPricing(record) || !isSucceededStatus(record.status) || record.billingSettledAt) return record;
  const resultUrl = String(record.remoteVideoUrl || record.videoUrl || record.cdnVideoUrl || record.localVideoUrl || "").trim();
  if (!resultUrl) return record;
  const actualDuration = await probeVideoDurationSeconds(resultUrl);
  if (!(actualDuration > 0)) return record;

  const pricing = record.pricingEstimate || {};
  const creditsPerSecond = Number(pricing.creditsPerSecond || 0);
  const originalFinalCredits = creditsAmount(Math.min(30, actualDuration) * creditsPerSecond);
  const pricingMultiplier = normalizeUserPricingMultiplier(record.userPricingMultiplier ?? record.pricingMultiplier ?? pricing.userPricingMultiplier ?? 1);
  const finalCredits = applyUserPricingMultiplierToCredits(originalFinalCredits, pricingMultiplier);
  const preDeducted = creditsAmount(record.preDeductedCredits || 0);
  const delta = preDeducted - finalCredits;
  let billingStatus = "settled";
  const db = await readDb();

  try {
    if (delta > 0) {
      await changeUserCredits(db, record.userId, delta, "generation_refund", {
        taskId: record.taskId,
        provider: record.provider,
        reason,
        preDeducted,
        finalCredits,
        originalFinalCredits,
        pricingMultiplier,
        generatedDurationSeconds: actualDuration,
      });
      await recordSubtokenAdjustment(record, {
        taskId: record.taskId,
        type: "generation_refund",
        amount: -delta,
        meta: { provider: record.provider, reason, preDeducted, finalCredits, originalFinalCredits, generatedDurationSeconds: actualDuration },
      });
      if (!dbEnabled()) await writeDb(db);
    } else if (delta < 0) {
      await changeUserCredits(db, record.userId, delta, "generation_settle", {
        taskId: record.taskId,
        provider: record.provider,
        reason,
        preDeducted,
        finalCredits,
        originalFinalCredits,
        pricingMultiplier,
        generatedDurationSeconds: actualDuration,
      });
      await recordSubtokenAdjustment(record, {
        taskId: record.taskId,
        type: "generation_settle",
        amount: Math.abs(delta),
        meta: { provider: record.provider, reason, preDeducted, finalCredits, originalFinalCredits, generatedDurationSeconds: actualDuration },
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
        generatedDurationSeconds: actualDuration,
        billingStatus,
        billingError: error.message || "Not enough credits or sub token quota for final settlement.",
      });
    }
    throw error;
  }

  return upsertGenerationRecord({
    taskId: record.taskId,
    finalCredits,
    originalFinalCredits,
    userPricingMultiplier: pricingMultiplier,
    generatedDurationSeconds: actualDuration,
    billingStatus,
    billingSettledAt: new Date().toISOString(),
    billingError: "",
  });
}

async function settleSeedanceGenerationRecord(record = {}, reason = "query") {
  const preDeducted = creditsAmount(record.preDeductedCredits || 0);
  if (usesWan30AdaptiveDurationPricing(record) && isSucceededStatus(record.status) && !record.billingSettledAt) {
    return settleWan30AdaptiveDuration(record, reason);
  }
  if (
    seedanceUsesTokenPricing(record) &&
    record.taskId &&
    record.userId &&
    isSucceededStatus(record.status) &&
    !record.billingSettledAt
  ) {
    const usage = seedanceFinalCreditsFromUsage(record);
    if (!usage) return record;
    const configuredSalePrice = seedanceUsesConfiguredSalePrice(record);
    const finalCredits = configuredSalePrice ? preDeducted : usage.credits;
    const originalFinalCredits = configuredSalePrice
      ? creditsAmount(record.originalPreDeductedCredits ?? preDeducted)
      : usage.originalCredits;
    const delta = preDeducted - finalCredits;
    let billingStatus = "settled";
    const db = await readDb();
    try {
      if (delta > 0) {
        await changeUserCredits(db, record.userId, delta, "generation_refund", {
          taskId: record.taskId,
          provider: record.provider || "seedance",
          reason,
          preDeducted,
          baseCredits: usage.baseCredits,
          finalCredits,
          originalFinalCredits,
          upstreamCalculatedCredits: usage.credits,
          upstreamOriginalCredits: usage.originalCredits,
          pricingMultiplier: usage.pricingMultiplier,
          markup: usage.markup,
          completionTokens: usage.completionTokens,
        });
        await recordSubtokenAdjustment(record, {
          taskId: record.taskId,
          type: "generation_refund",
          amount: -delta,
          meta: {
            provider: record.provider || "seedance",
            reason,
            preDeducted,
            finalCredits,
            originalFinalCredits,
            upstreamCalculatedCredits: usage.credits,
            upstreamOriginalCredits: usage.originalCredits,
          },
        });
        if (!dbEnabled()) await writeDb(db);
      } else if (delta < 0) {
        await changeUserCredits(db, record.userId, delta, "generation_settle", {
          taskId: record.taskId,
          provider: record.provider || "seedance",
          reason,
          preDeducted,
          baseCredits: usage.baseCredits,
          finalCredits,
          originalFinalCredits,
          upstreamCalculatedCredits: usage.credits,
          upstreamOriginalCredits: usage.originalCredits,
          pricingMultiplier: usage.pricingMultiplier,
          markup: usage.markup,
          completionTokens: usage.completionTokens,
        });
        await recordSubtokenAdjustment(record, {
          taskId: record.taskId,
          type: "generation_settle",
          amount: Math.abs(delta),
          meta: {
            provider: record.provider || "seedance",
            reason,
            preDeducted,
            finalCredits,
            originalFinalCredits,
            upstreamCalculatedCredits: usage.credits,
            upstreamOriginalCredits: usage.originalCredits,
          },
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
          userPricingMultiplier: usage.pricingMultiplier,
          billingStatus,
          billingError: error.message || "Not enough credits or sub token quota for final settlement.",
          usageCompletionTokens: usage.completionTokens,
          usageBaseCredits: usage.baseCredits,
          upstreamCalculatedCredits: usage.credits,
          upstreamOriginalCredits: usage.originalCredits,
          billingPriceSource: configuredSalePrice ? "configured_sale_price" : "upstream_token_usage",
        });
      }
      throw error;
    }
    return upsertGenerationRecord({
      taskId: record.taskId,
      finalCredits,
      originalFinalCredits,
      userPricingMultiplier: usage.pricingMultiplier,
      billingStatus,
      billingSettledAt: new Date().toISOString(),
      billingError: "",
      usageCompletionTokens: usage.completionTokens,
      usageBaseCredits: usage.baseCredits,
      upstreamCalculatedCredits: usage.credits,
      upstreamOriginalCredits: usage.originalCredits,
      billingPriceSource: configuredSalePrice ? "configured_sale_price" : "upstream_token_usage",
    });
  }

  if (!needsSeedanceFailureRefund(record)) return record;
  const db = await readDb();
  const alreadyRefunded = (db.creditLedger || []).some((entry) => (
    entry.userId === record.userId &&
    entry.type === "generation_refund" &&
    entry.meta?.taskId === record.taskId
  ));

  try {
    if (!alreadyRefunded) {
      await changeUserCredits(db, record.userId, preDeducted, "generation_refund", {
        taskId: record.taskId,
        provider: record.provider || "seedance",
        reason,
        preDeducted,
        finalCredits: 0,
        originalFinalCredits: 0,
        pricingMultiplier: normalizeUserPricingMultiplier(record.userPricingMultiplier ?? record.pricingMultiplier ?? 1),
      });
      await recordSubtokenAdjustment(record, {
        taskId: record.taskId,
        type: "generation_refund",
        amount: -preDeducted,
        meta: { provider: record.provider || "seedance", reason, preDeducted },
      });
      if (!dbEnabled()) await writeDb(db);
    }
    return upsertGenerationRecord({
      taskId: record.taskId,
      finalCredits: 0,
      originalFinalCredits: 0,
      userPricingMultiplier: normalizeUserPricingMultiplier(record.userPricingMultiplier ?? record.pricingMultiplier ?? 1),
      billingStatus: "refunded",
      billingSettledAt: new Date().toISOString(),
      billingError: "",
    });
  } catch (error) {
    return upsertGenerationRecord({
      taskId: record.taskId,
      billingStatus: "refund_failed",
      billingError: error.message || "Failed to refund failed generation.",
    });
  }
}

function extractApizReportedCredits(value, depth = 0) {
  if (value === null || value === undefined || depth > 40) return null;
  if (typeof value === "string") {
    const text = value.trim();
    if (!text) return null;
    if (text.startsWith("{") || text.startsWith("[")) {
      try {
        return extractApizReportedCredits(JSON.parse(text), depth + 1);
      } catch {
        return null;
      }
    }
    const number = Number(text);
    return Number.isFinite(number) && number >= 0 ? creditsAmount(number) : null;
  }
  if (typeof value === "number") return value >= 0 ? creditsAmount(value) : null;
  if (Array.isArray(value)) {
    let best = null;
    value.forEach((item) => {
      const next = extractApizReportedCredits(item, depth + 1);
      if (next !== null) best = Math.max(best ?? 0, next);
    });
    return best;
  }
  if (typeof value !== "object") return null;

  const billing = value.x_billing ?? value["X-Billing"] ?? value.billing;
  const billingCredits = billing ? extractApizReportedCredits(billing, depth + 1) : null;
  if (billingCredits !== null) return billingCredits;

  const balanceLike = Object.prototype.hasOwnProperty.call(value, "balance") || Object.prototype.hasOwnProperty.call(value, "balance_yuan");
  let best = null;
  for (const [key, item] of Object.entries(value)) {
    const lower = key.toLowerCase();
    if (["balance", "balance_yuan", "remaining", "account", "token"].includes(lower)) continue;
    if (["credits_used", "credits_charged", "credits_final", "credit_cost", "consumed_credits", "usage_credits", "price", "cost"].includes(lower)) {
      const next = extractApizReportedCredits(item, depth + 1);
      if (next !== null) best = Math.max(best ?? 0, next);
    } else if (lower === "credits" && !balanceLike) {
      const next = extractApizReportedCredits(item, depth + 1);
      if (next !== null) best = Math.max(best ?? 0, next);
    } else if (item && typeof item === "object") {
      const next = extractApizReportedCredits(item, depth + 1);
      if (next !== null) best = Math.max(best ?? 0, next);
    } else if (typeof item === "string" && item.trim().startsWith("{")) {
      const next = extractApizReportedCredits(item, depth + 1);
      if (next !== null) best = Math.max(best ?? 0, next);
    }
  }
  return best === null ? null : creditsAmount(best);
}

function publicBilling(record = {}) {
  return {
    preDeducted: creditsAmount(record.preDeductedCredits || 0),
    final: record.finalCredits === undefined || record.finalCredits === null ? null : creditsAmount(record.finalCredits || 0),
    originalPreDeducted: record.originalPreDeductedCredits === undefined || record.originalPreDeductedCredits === null ? null : creditsAmount(record.originalPreDeductedCredits || 0),
    originalFinal: record.originalFinalCredits === undefined || record.originalFinalCredits === null ? null : creditsAmount(record.originalFinalCredits || 0),
    pricingMultiplier: normalizeUserPricingMultiplier(record.userPricingMultiplier ?? record.pricingMultiplier ?? 1),
    settled: Boolean(record.billingSettledAt),
    status: record.billingStatus || "",
  };
}

function platformRecordKind(template = {}) {
  return template.type === "image-to-video" ? "image-to-video" : "text-to-video";
}

function startPlatformGenerationJob(job) {
  setImmediate(() => {
    runPlatformGenerationJob(job).catch((error) => {
      console.error("[platform-generation-job-failed]", job.taskId, error.message || error);
    });
  });
}

async function runPlatformGenerationJob(job = {}) {
  const {
    taskId,
    userId,
    templateId,
    templateTitle,
    templateType,
    prompt,
    imageUrl,
    userAssetId,
    upstreamPayload,
    pricingEstimate,
    preDeductedCredits,
  } = job;

  try {
    await updateGenerationRecord(taskId, {
      status: "submitting",
      awaitingUpstreamTask: true,
      error: "",
    }, "platform-submitting");

    const gatewayBody = {
      templateId,
      prompt,
      params: upstreamPayload?.params || {},
    };
    if (USE_GATEWAY_UPSTREAM && userAssetId) {
      const db = await readDb();
      let asset = (db.userAssets || []).find((entry) => entry.id === userAssetId && entry.userId === userId && !isSoftDeleted(entry));
      if (!asset) {
        const error = new Error("Reference image not found.");
        error.statusCode = 404;
        throw error;
      }
      asset = await ensurePublicUrlForUserAsset(db, asset);
      gatewayBody.imageUrl = publicHttpUrlForUserAsset(asset);
      gatewayBody.fileName = asset.name || "";
    } else if (userAssetId) {
      gatewayBody.userAssetId = userAssetId;
    }
    const task = USE_GATEWAY_UPSTREAM
      ? await gatewaySubmitPlatformTask(gatewayBody)
      : await apizRequest("/api/v3/tasks/create", upstreamPayload);
    const upstreamTaskId = USE_GATEWAY_UPSTREAM ? task.taskId : apizTaskId(task);
    if (!upstreamTaskId) {
      const error = new Error(`Generation service did not return task id: ${JSON.stringify(task)}`);
      error.statusCode = 502;
      throw error;
    }

    const record = await upsertGenerationRecord({
      taskId,
      upstreamTaskId,
      awaitingUpstreamTask: false,
      status: USE_GATEWAY_UPSTREAM ? task.status : apizStatus(task),
      model: upstreamPayload.model,
      provider: "apiz",
      upstreamSource: USE_GATEWAY_UPSTREAM ? "gateway" : "direct",
      source: "platform-template",
      kind: platformRecordKind({ type: templateType }),
      templateId,
      templateTitle,
      userId,
      userAssetId: userAssetId || "",
      imageUrl,
      prompt,
      finalPrompt: prompt,
      params: upstreamPayload.params,
      upstreamPayload,
      preDeductedCredits,
      originalPreDeductedCredits: pricingEstimate.originalCredits ?? preDeductedCredits,
      userPricingMultiplier: pricingEstimate.userPricingMultiplier ?? 1,
      pricingEstimate: {
        source: pricingEstimate.source,
        pricing: pricingEstimate.pricing || null,
        baseCredits: pricingEstimate.baseCredits ?? null,
        originalCredits: pricingEstimate.originalCredits ?? null,
        userPricingMultiplier: pricingEstimate.userPricingMultiplier ?? 1,
        markup: pricingEstimate.markup ?? GENERATION_PRICE_MARKUP,
      },
      finalCredits: null,
      billingStatus: preDeductedCredits > 0 ? "pre_deducted" : "free",
      billingSettledAt: "",
      billingError: "",
      createResponse: task,
      createReportedCredits: USE_GATEWAY_UPSTREAM ? null : extractApizReportedCredits(task),
      remoteVideoUrl: USE_GATEWAY_UPSTREAM ? task.videoUrl : apizResultUrl(task),
      localVideoUrl: "",
      error: "",
      submittedAt: new Date().toISOString(),
    });
    if (USE_GATEWAY_UPSTREAM) {
      if (isSucceededStatus(record.status) || isFailedStatus(record.status)) {
        await settleApizGenerationRecord(record, {
          status: record.status,
          videoUrl: task.videoUrl,
          error: task.error,
        }, "create");
      }
    } else {
      await settleApizGenerationRecord(record, task, "create");
    }
  } catch (error) {
    console.warn("[platform-generation-job-error]", taskId, error.message || error);
    try {
      const failedRecord = await updateGenerationRecord(taskId, {
        status: "failed",
        awaitingUpstreamTask: false,
        error: error.message || "Generation submission failed.",
        billingError: "",
        failedAt: new Date().toISOString(),
        provider: "apiz",
        source: "platform-template",
        kind: platformRecordKind({ type: templateType }),
        templateId,
        templateTitle,
        model: upstreamPayload?.model || "",
        pricingEstimate: {
          source: pricingEstimate.source,
          pricing: pricingEstimate.pricing || null,
          baseCredits: pricingEstimate.baseCredits ?? null,
          originalCredits: pricingEstimate.originalCredits ?? null,
          userPricingMultiplier: pricingEstimate.userPricingMultiplier ?? 1,
          markup: pricingEstimate.markup ?? GENERATION_PRICE_MARKUP,
        },
        preDeductedCredits,
        originalPreDeductedCredits: pricingEstimate.originalCredits ?? preDeductedCredits,
        userPricingMultiplier: pricingEstimate.userPricingMultiplier ?? 1,
      }, "platform-failed");
      if (failedRecord) {
        await settleApizGenerationRecord(failedRecord, {
          status: "failed",
          error: error.message || "Generation submission failed.",
        }, "platform-submit-failed");
      }
    } catch (updateError) {
      console.error("[platform-generation-fail-update-error]", taskId, updateError.message || updateError);
    }
  }
}

function platformModelRejectsResolution(model = "", params = {}, type = "image-to-video") {
  const resolvedModel = resolvePlatformModelId(model, type);
  const compact = `${resolvedModel} ${params.model || ""}`.toLowerCase().replace(/[\s_/-]+/g, "");
  if (paramsHaveVideoInput(params)) return false;
  return compact.includes("arkseedance2.0") || compact.includes("dreaminaseedance") || compact.includes("seedance2.0fast");
}

function sanitizePlatformPayloadParamsForModel(model = "", params = {}, type = "image-to-video") {
  if (!params || typeof params !== "object" || Array.isArray(params)) return params;
  const next = { ...params };
  if (next.resolution && platformModelRejectsResolution(model, next, type)) {
    delete next.resolution;
  }
  return next;
}

function platformImageFieldKeys(payload = {}) {
  const keys = Object.keys(payload || {}).filter((key) => (
    /^image(?:_file)?_\d+$/i.test(key) ||
    /^image_url$/i.test(key) ||
    /^image_files$/i.test(key) ||
    /^filePaths$/i.test(key) ||
    /^images$/i.test(key) ||
    /^content$/i.test(key)
  ));
  if (keys.length) return keys;
  if (Array.isArray(payload.image_urls)) return ["image_urls"];
  return ["image_url"];
}

function replacePlatformPayloadImages(payload = {}, imageUrl = "") {
  if (!imageUrl) return payload;
  const next = { ...payload };
  platformImageFieldKeys(next).forEach((key) => {
    if (["image_urls", "image_files", "filePaths"].includes(key)) {
      next[key] = [imageUrl];
    } else if (key === "images") {
      const images = Array.isArray(next.images) && next.images.length
        ? next.images
        : [{ name: "image_1" }];
      next.images = images.map((item, index) => (
        item && typeof item === "object" && !Array.isArray(item)
          ? { ...item, url: imageUrl }
          : { url: imageUrl, name: `image_${index + 1}` }
      ));
    } else if (key === "content") {
      const content = Array.isArray(next.content) ? next.content : [];
      let replaced = false;
      next.content = content.map((item) => {
        if (!item || typeof item !== "object" || Array.isArray(item) || item.type !== "image_url") return item;
        replaced = true;
        const imageValue = item.image_url && typeof item.image_url === "object" && !Array.isArray(item.image_url)
          ? { ...item.image_url, url: imageUrl }
          : { url: imageUrl };
        return { ...item, image_url: imageValue };
      });
      if (!replaced) {
        next.content.push({ type: "image_url", image_url: { url: imageUrl }, role: "reference_image" });
      }
    } else {
      next[key] = imageUrl;
    }
  });
  return next;
}

function platformApizPayload({ template, prompt, imageUrl, overrides = {} }) {
  const configured = template.requestJson && typeof template.requestJson === "object" && !Array.isArray(template.requestJson)
    ? structuredClone(template.requestJson)
    : {};
  const model = resolvePlatformModelId(configured.model || template.model, template.type);
  const params = {
    ...(Object.keys(configured).length ? configured : { ...(template.params || {}), model }),
    ...(overrides && typeof overrides === "object" && !Array.isArray(overrides) ? overrides : {}),
  };
  params.model = resolvePlatformRequestModel(params.model || model, model, template.type);
  if (prompt && !params.prompt) params.prompt = prompt;
  if (params.ratio && !params.aspect_ratio) {
    params.aspect_ratio = params.ratio;
  }
  if ((model === "bytedance/seedance-2.0/fast/image-to-video" || model === "bytedance/seedance-2.0/fast/text-to-video") && !params.resolution) {
    params.resolution = "720p";
  }
  if (template.negativePrompt && !params.negative_prompt) params.negative_prompt = template.negativePrompt;
  const safeParams = sanitizePlatformPayloadParamsForModel(model, params, template.type);
  const replacedParams = replacePlatformPayloadImages(safeParams, imageUrl);
  return {
    model,
    params: replacedParams,
    channel: null,
  };
}

async function handlePlatformGenerate(req, res) {
  const auth = await requireUser(req, res);
  if (!auth) return;

  const body = await readJson(req);
  const config = await readAppConfig();
  const template = findPlatformTemplate(config, body.templateId);
  if (template && !isExternalPlatformTemplate(template)) {
    return sendJson(res, 400, { ok: false, code: "TEMPLATE_NOT_GENERATABLE", message: "This template is a gallery shortcut and cannot be generated from this endpoint." });
  }
  if (!template) return sendJson(res, 404, { ok: false, message: "模板不存在或未启用。" });

  let imageUrl = "";
  let userAsset = null;
  if (template.type === "image-to-video") {
    if (body.dataUrl) {
      userAsset = await createUserAssetFromDataUrl(auth.db, auth.user, {
        dataUrl: body.dataUrl,
        fileName: body.fileName,
        name: template.title || "Template upload",
      });
      if (USE_GATEWAY_UPSTREAM) {
        imageUrl = userAsset.localUrl || "";
      } else {
        userAsset.publicUrl = "";
        userAsset = await ensurePublicUrlForUserAsset(auth.db, userAsset);
        imageUrl = userAsset.publicUrl;
      }
    } else if (body.userAssetId) {
      userAsset = auth.db.userAssets.find((asset) => asset.id === body.userAssetId && asset.userId === auth.user.id && !isSoftDeleted(asset));
      if (!userAsset) return sendJson(res, 404, { ok: false, message: "上传图片不存在。" });
      if (USE_GATEWAY_UPSTREAM) {
        imageUrl = userAsset.localUrl || userAsset.publicUrl || "";
      } else {
        userAsset = await ensurePublicUrlForUserAsset(auth.db, userAsset);
        imageUrl = userAsset.publicUrl;
      }
    } else if (isPublicHttpUrl(body.imageUrl)) {
      imageUrl = publicHttpUrlForUpstream(body.imageUrl);
    }
    if (!imageUrl) return sendJson(res, 400, { ok: false, message: "这个模板需要先上传一张图片。" });
  }

  const configuredPrompt = typeof template.requestJson?.prompt === "string" ? template.requestJson.prompt : template.prompt;
  const prompt = typeof body.prompt === "string" && body.prompt.trim() ? body.prompt : configuredPrompt;
  if (!String(prompt || "").trim()) return sendJson(res, 400, { ok: false, message: "缺少 prompt。" });

  const upstreamPayload = platformApizPayload({
    template,
    prompt,
    imageUrl,
    overrides: body.params,
  });
  const rawPricingEstimate = await estimatePlatformPreDeductCredits(upstreamPayload.model, upstreamPayload.params, template);
  const pricingEstimate = applyUserPricingToEstimate(rawPricingEstimate, auth.user, pricingContextForAuth(auth));
  const preDeductedCredits = pricingEstimate.credits;
  if (auth.user.credits < preDeductedCredits) {
    return sendJson(res, 402, insufficientCreditsPayload(preDeductedCredits, auth.user.credits));
  }
  try {
    assertSubtokenCanSpend(auth, preDeductedCredits);
  } catch (error) {
    return sendJson(res, error.statusCode || 402, error.payload || { ok: false, code: error.code || "SUBTOKEN_UNAVAILABLE", message: error.message });
  }

  const taskId = localGenerationTaskId("cgt");

  const record = await upsertGenerationRecord({
    taskId,
    status: "submitting",
    model: upstreamPayload.model,
    provider: "apiz",
    source: "platform-template",
    kind: platformRecordKind(template),
    templateId: template.id,
    templateTitle: template.title,
    userId: auth.user.id,
    userAssetId: userAsset?.id || "",
    imageUrl,
    prompt,
    finalPrompt: prompt,
    params: upstreamPayload.params,
    upstreamPayload,
    preDeductedCredits,
    originalPreDeductedCredits: pricingEstimate.originalCredits,
    userPricingMultiplier: pricingEstimate.userPricingMultiplier,
    pricingEstimate: {
      source: pricingEstimate.source,
      pricing: pricingEstimate.pricing || null,
      baseCredits: pricingEstimate.baseCredits ?? null,
      originalCredits: pricingEstimate.originalCredits ?? null,
      userPricingMultiplier: pricingEstimate.userPricingMultiplier ?? 1,
      markup: pricingEstimate.markup ?? GENERATION_PRICE_MARKUP,
    },
    finalCredits: null,
    billingStatus: preDeductedCredits > 0 ? "pre_deducted" : "free",
    billingSettledAt: "",
    billingError: "",
    createResponse: null,
    createReportedCredits: null,
    remoteVideoUrl: "",
    localVideoUrl: "",
    error: "",
    apiTokenId: auth.tokenRecord?.id || "",
    apiTokenName: auth.tokenRecord?.name || "",
    apiTokenType: auth.tokenRecord?.quotaType || "",
    apiTokenSource: auth.tokenSource || "",
  });

  if (preDeductedCredits > 0) {
    await chargeUserWithSubtoken(auth, {
      cost: preDeductedCredits,
      type: "generation_pre_deduct",
      taskId,
      meta: {
        source: "platform-template",
        templateId: template.id,
        templateTitle: template.title,
        pricingSource: pricingEstimate.source,
        originalCost: pricingEstimate.originalCredits,
        pricingMultiplier: pricingEstimate.userPricingMultiplier,
        taskId,
      },
    });
    if (!dbEnabled()) await writeDb(auth.db);
  }

  startPlatformGenerationJob({
    taskId,
    userId: auth.user.id,
    templateId: template.id,
    templateTitle: template.title,
    templateType: template.type,
    prompt,
    imageUrl,
    userAssetId: userAsset?.id || "",
    upstreamPayload,
    pricingEstimate,
    preDeductedCredits,
  });
  const latestDb = await readDb();
  const latestUser = latestDb.users.find((user) => user.id === auth.user.id) || auth.user;

  return sendJson(res, 200, {
    ok: true,
    task: { taskId, status: record.status },
    taskId,
    record: publicGenerationRecord(record, generationRecordResponseOptionsForAuth(auth)),
    user: userView(latestUser),
  });
}

async function handleAdvancedAccessRequest(req, res) {
  const auth = await requireUser(req, res);
  if (!auth) return;
  auth.user.advancedAccess = true;
  auth.user.advancedAccessReviewedAt = auth.user.advancedAccessReviewedAt || new Date().toISOString();
  auth.user.updatedAt = new Date().toISOString();
  if (dbEnabled()) await updateUserInDb(auth.user);
  else await writeDb(auth.db);
  return sendJson(res, 200, { ok: true, user: userView(auth.user) });
}

function seedance25InputAssetId(item, keys = ["assetId", "userAssetId", "id"]) {
  if (typeof item === "string") return "";
  if (!item || typeof item !== "object" || Array.isArray(item)) return "";
  return String(firstPresent(...keys.map((key) => item[key]), "") || "").trim();
}

function seedance25InputUrl(item, kind = "image") {
  if (typeof item === "string") return String(item || "").trim();
  if (!item || typeof item !== "object" || Array.isArray(item)) return "";
  const keys = kind === "video"
    ? ["url", "videoUrl", "video_url", "previewUrl"]
    : kind === "audio"
    ? ["url", "audioUrl", "audio_url", "previewUrl"]
    : ["url", "imageUrl", "image_url", "previewUrl"];
  return String(firstPresent(...keys.map((key) => item[key]), "") || "").trim();
}

function seedance25ReferenceInputs(body = {}, kind = "image") {
  const rawItems = kind === "video"
    ? [
        ...arrayFromBody(body.referenceVideos),
        ...arrayFromBody(body.referenceVideoUrls),
        ...arrayFromBody(body.videoUrls),
        ...arrayFromBody(body.reference_videos),
      ]
    : kind === "audio"
    ? [
        ...arrayFromBody(body.referenceAudios),
        ...arrayFromBody(body.referenceAudioUrls),
        ...arrayFromBody(body.audioUrls),
        ...arrayFromBody(body.reference_audios),
      ]
    : [
        ...arrayFromBody(body.referenceImages),
        ...arrayFromBody(body.reference_images),
      ];
  const seenItems = new Set();
  const items = rawItems.filter((item) => {
    const assetId = seedance25InputAssetId(item);
    const dataUrl = kind === "image" && item && typeof item === "object" ? String(item.dataUrl || "").trim() : "";
    const url = seedance25InputUrl(item, kind);
    const identity = assetId ? `asset:${assetId}` : dataUrl ? `data:${dataUrl}` : url ? `url:${url}` : "";
    if (!identity || seenItems.has(identity)) return false;
    seenItems.add(identity);
    return true;
  });
  const explicitIds = kind === "video"
    ? [body.referenceVideoAssetId, body.videoAssetId, ...arrayFromBody(body.referenceVideoAssetIds), ...arrayFromBody(body.videoAssetIds)]
    : kind === "audio"
    ? [body.referenceAudioAssetId, body.audioAssetId, ...arrayFromBody(body.referenceAudioAssetIds), ...arrayFromBody(body.audioAssetIds)]
    : [body.referenceImageAssetId, body.userAssetId, ...arrayFromBody(body.extraReferenceAssetIds), ...arrayFromBody(body.extraUserAssetIds)];
  const assetIds = [...explicitIds, ...items.map((item) => seedance25InputAssetId(item))]
    .map((value) => String(value || "").trim())
    .filter(Boolean);
  const urls = items
    .filter((item) => !seedance25InputAssetId(item))
    .map((item) => seedance25InputUrl(item, kind))
    .filter(Boolean);
  const inlineInputs = kind === "image"
    ? items.filter((item) => item && typeof item === "object" && !Array.isArray(item) && !seedance25InputAssetId(item) && String(item.dataUrl || "").startsWith("data:image/"))
    : [];
  const ordered = [];
  const seenOrdered = new Set();
  items.forEach((item) => {
    const assetId = seedance25InputAssetId(item);
    const dataUrl = kind === "image" && item && typeof item === "object" ? String(item.dataUrl || "").trim() : "";
    const url = seedance25InputUrl(item, kind);
    if (assetId) {
      if (seenOrdered.has(`asset:${assetId}`)) return;
      seenOrdered.add(`asset:${assetId}`);
      ordered.push({ type: "asset", assetId });
      return;
    }
    if (dataUrl.startsWith("data:image/")) {
      if (seenOrdered.has(`data:${dataUrl}`)) return;
      seenOrdered.add(`data:${dataUrl}`);
      ordered.push({ type: "inline", item });
      return;
    }
    if (url) {
      if (seenOrdered.has(`url:${url}`)) return;
      seenOrdered.add(`url:${url}`);
      ordered.push({ type: "url", url });
    }
  });
  assetIds.forEach((assetId) => {
    if (seenOrdered.has(`asset:${assetId}`)) return;
    seenOrdered.add(`asset:${assetId}`);
    ordered.push({ type: "asset", assetId });
  });
  return { assetIds: [...new Set(assetIds)], urls: [...new Set(urls)], inlineInputs, ordered };
}

function seedance25OwnedAssets(db, userId, assetIds = [], kind = "image") {
  const assets = assetIds.map((assetId) => (
    (db.userAssets || []).find((asset) => asset.id === assetId && asset.userId === userId && !isSoftDeleted(asset))
  ));
  const missingIndex = assets.findIndex((asset) => !asset);
  if (missingIndex >= 0) {
    const error = new Error(`Reference ${kind} not found.`);
    error.statusCode = 404;
    error.code = `REFERENCE_${kind.toUpperCase()}_NOT_FOUND`;
    error.details = { assetId: assetIds[missingIndex] };
    throw error;
  }
  assets.forEach((asset) => validateWan27MediaKind(asset, kind, `Seedance 2.5 reference ${kind}`));
  return assets;
}

async function seedance25PublicAssetUrls(db, assets = [], { preprocessReference = false } = {}) {
  const urls = [];
  for (const asset of assets) {
    const preparedReference = preprocessReference
      ? await prepareSeedanceReferenceAsset(db, asset, true)
      : null;
    const prepared = preparedReference?.asset || await ensurePublicUrlForUserAsset(db, asset);
    const url = preprocessReference
      ? publicHttpUrlForUpstream(firstPresent(
          preparedReference?.publicImageUrl,
          prepared.syntheticReferencePublicUrl,
          prepared.syntheticReferenceUrl,
        ))
      : publicHttpUrlForUserAsset(prepared);
    if (!url) {
      const error = new Error("Reference asset could not be published for generation.");
      error.statusCode = 502;
      error.code = "SEEDANCE25_ASSET_PUBLISH_FAILED";
      throw error;
    }
    urls.push(url);
  }
  return urls;
}

function seedance25PublicInputUrls(urls = [], kind = "image") {
  const normalized = urls.map((value, index) => {
    const url = publicHttpUrlForUpstream(value);
    if (!isPublicHttpUrl(url)) {
      throw advancedValidationError("INVALID_MEDIA_URL", `Seedance 2.5 ${kind} ${index + 1} must be a public URL.`);
    }
    return url;
  });
  return [...new Set(normalized)];
}

function arkAssetStillProcessing(error) {
  return /asset is still processing|not available yet/i.test(String(error?.message || error || ""));
}

async function submitArkTaskAfterAssetsReady(payload, { attempts = 12, waitMs = 10000 } = {}) {
  const maxAttempts = Math.max(1, Number(attempts) || 1);
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await arkRequest("POST", "/contents/generations/tasks", payload);
    } catch (error) {
      if (!arkAssetStillProcessing(error) || attempt >= maxAttempts) throw error;
      console.warn(`[ark-assets-processing] generation submit attempt ${attempt}/${maxAttempts}; retrying in ${waitMs}ms`);
      await delay(waitMs);
    }
  }
  throw new Error("Ark generation submit failed while waiting for assets.");
}

async function runSeedance25GenerationJob(job = {}) {
  const {
    taskId,
    upstreamInput: initialUpstreamInput = {},
    mediaAssets: initialMediaAssets = [],
    pricing,
    cost,
    provider = "seedance25",
    preprocessReference = false,
    imageAssetIds = [],
    firstFrameAssetId = "",
    lastFrameAssetId = "",
  } = job;
  let upstreamInput = initialUpstreamInput;
  let mediaAssets = initialMediaAssets;
  const direct = normalizeAdvancedProvider(provider) === SEEDANCE25_DIRECT_PROVIDER;
  const providerLabel = direct ? SEEDANCE25_DIRECT_LABEL : "Seedance 2.5";
  const recordSource = direct ? "advanced-seedance-nsfw" : "advanced-seedance25";
  const upstreamSource = direct ? "byteplus-direct-seedance25" : (USE_GATEWAY_UPSTREAM ? "gateway" : "apiz-seedance25");
  let upstreamPayload = null;
  try {
    await updateGenerationRecord(taskId, { status: "submitting", awaitingUpstreamTask: true, error: "" }, direct ? "seedance-nsfw-submitting" : "seedance25-submitting");
    if (preprocessReference && (direct || !USE_GATEWAY_UPSTREAM)) {
      const db = await readDb();
      const record = await getGenerationRecord(taskId);
      const userId = String(record?.userId || "");
      const imageAssets = seedance25OwnedAssets(db, userId, imageAssetIds, "image");
      const firstFrameAsset = firstFrameAssetId
        ? seedance25OwnedAssets(db, userId, [firstFrameAssetId], "image")[0]
        : null;
      const lastFrameAsset = lastFrameAssetId
        ? seedance25OwnedAssets(db, userId, [lastFrameAssetId], "image")[0]
        : null;
      const imageFiles = await seedance25PublicAssetUrls(db, imageAssets, { preprocessReference: true });
      const firstFrameUrl = firstFrameAsset
        ? (await seedance25PublicAssetUrls(db, [firstFrameAsset], { preprocessReference: true }))[0]
        : initialUpstreamInput.firstFrameUrl;
      const lastFrameUrl = lastFrameAsset
        ? (await seedance25PublicAssetUrls(db, [lastFrameAsset], { preprocessReference: true }))[0]
        : initialUpstreamInput.lastFrameUrl;
      upstreamInput = { ...initialUpstreamInput, imageFiles, firstFrameUrl, lastFrameUrl };
      mediaAssets = [
        ...imageFiles.map((url, index) => ({ type: "reference_image", key: `image_${index + 1}`, userAssetId: imageAssets[index]?.id || "", imageUrl: url })),
        ...initialMediaAssets.filter((item) => !["reference_image", "image_url", "end_image_url"].includes(item.type)),
        ...(firstFrameUrl ? [{ type: "image_url", key: "image_url", userAssetId: firstFrameAsset?.id || "", imageUrl: firstFrameUrl }] : []),
        ...(lastFrameUrl ? [{ type: "end_image_url", key: "end_image_url", userAssetId: lastFrameAsset?.id || "", imageUrl: lastFrameUrl }] : []),
      ];
      const primaryPreparedAsset = firstFrameAsset || imageAssets[0] || null;
      await updateGenerationRecord(taskId, {
        mediaAssets,
        imageUrl: firstFrameUrl || imageFiles[0] || record?.imageUrl || "",
        syntheticReferenceLocalUrl: primaryPreparedAsset?.syntheticReferenceLocalUrl || "",
        syntheticReferenceUrl: primaryPreparedAsset?.syntheticReferenceUrl || "",
      }, direct ? "seedance-nsfw-reference-preprocessed" : "seedance25-reference-preprocessed");
    }
    let submitted;
    if (direct) {
      const imageAssets = [];
      for (let index = 0; index < upstreamInput.imageFiles.length; index += 1) {
        imageAssets.push(await ensureSeedanceAssetUriForPublicUrl(upstreamInput.imageFiles[index], "Image", `seedance-nsfw-image-${index + 1}`));
      }
      const videoAssets = [];
      for (let index = 0; index < upstreamInput.videoFiles.length; index += 1) {
        videoAssets.push(await ensureSeedanceAssetUriForPublicUrl(upstreamInput.videoFiles[index], "Video", `seedance-nsfw-video-${index + 1}`));
      }
      const audioAssets = [];
      for (let index = 0; index < upstreamInput.audioFiles.length; index += 1) {
        audioAssets.push(await ensureSeedanceAssetUriForPublicUrl(upstreamInput.audioFiles[index], "Audio", `seedance-nsfw-audio-${index + 1}`));
      }
      const firstFrameAsset = upstreamInput.firstFrameUrl
        ? await ensureSeedanceAssetUriForPublicUrl(upstreamInput.firstFrameUrl, "Image", "seedance-nsfw-first-frame")
        : "";
      const lastFrameAsset = upstreamInput.lastFrameUrl
        ? await ensureSeedanceAssetUriForPublicUrl(upstreamInput.lastFrameUrl, "Image", "seedance-nsfw-last-frame")
        : "";
      upstreamPayload = buildSeedance25DirectTaskPayload({
        ...upstreamInput,
        imageAssets,
        videoAssets,
        audioAssets,
        firstFrameAsset,
        lastFrameAsset,
      }, SEEDANCE25_DIRECT_ENDPOINT);
      submitted = await submitArkTaskAfterAssetsReady(upstreamPayload);
    } else {
      upstreamPayload = buildSeedance25TaskPayload(upstreamInput, SEEDANCE25_MODEL_ID);
      const gatewayBody = USE_GATEWAY_UPSTREAM ? {
      provider: "seedance25",
      prompt: upstreamInput.prompt,
      preprocessReference,
      functionMode: upstreamInput.mode,
      seedanceMode: upstreamInput.mode,
      resolution: upstreamInput.resolution,
      ratio: upstreamInput.ratio,
      duration: upstreamInput.duration,
      seed: upstreamInput.seed,
      referenceImages: upstreamInput.imageFiles.map((url) => ({ url })),
      referenceVideoUrls: upstreamInput.videoFiles,
      referenceAudioUrls: upstreamInput.audioFiles,
      firstFrameUrl: upstreamInput.firstFrameUrl,
      lastFrameUrl: upstreamInput.lastFrameUrl,
      preservePublicMediaUrls: true,
      } : null;
      submitted = USE_GATEWAY_UPSTREAM
        ? await gatewaySubmitAdvancedTask(gatewayBody)
        : await seedance25Request("/api/v3/tasks/create", upstreamPayload);
      if (USE_GATEWAY_UPSTREAM) upstreamPayload = gatewayBody;
    }
    const raw = !direct && USE_GATEWAY_UPSTREAM ? submitted.raw || submitted : submitted;
    const directTask = direct ? normalizeTask(raw) : null;
    const upstreamTaskId = direct ? directTask.taskId : USE_GATEWAY_UPSTREAM ? submitted.taskId : apizTaskId(raw);
    if (!upstreamTaskId) {
      const error = new Error(`${providerLabel} service did not return a task id.`);
      error.statusCode = 502;
      error.code = direct ? "SEEDANCE25_DIRECT_TASK_ID_MISSING" : "SEEDANCE25_TASK_ID_MISSING";
      error.payload = raw;
      throw error;
    }
    await updateGenerationRecord(taskId, {
      status: direct ? directTask.status || "submitted" : apizStatus(raw) || "submitted",
      upstreamTaskId,
      awaitingUpstreamTask: false,
      provider: direct ? SEEDANCE25_DIRECT_PROVIDER : "seedance25",
      upstreamSource,
      upstreamModel: direct ? SEEDANCE25_DIRECT_ENDPOINT : SEEDANCE25_MODEL_ID,
      source: recordSource,
      model: providerLabel,
      mediaMode: upstreamInput.mode,
      mediaAssets,
      upstreamPayload,
      createResponse: raw,
      submittedAt: new Date().toISOString(),
      error: "",
      pricingEstimate: pricing,
      finalCredits: cost,
      originalFinalCredits: pricing?.originalCredits ?? cost,
      billingStatus: cost > 0 ? (direct ? "pre_deducted" : "settled") : "free",
      billingSettledAt: cost > 0 && !direct ? new Date().toISOString() : "",
    }, direct ? "seedance-nsfw-submit" : "seedance25-submit");
  } catch (error) {
    console.warn(direct ? "[seedance-nsfw-generation-job-error]" : "[seedance25-generation-job-error]", taskId, error.message || error);
    await updateGenerationRecord(taskId, {
      status: "failed",
      awaitingUpstreamTask: false,
      provider: direct ? SEEDANCE25_DIRECT_PROVIDER : "seedance25",
      upstreamSource,
      source: recordSource,
      model: providerLabel,
      mediaMode: upstreamInput?.mode || "",
      mediaAssets,
      upstreamPayload,
      createResponse: error.payload || null,
      error: error.message || `${providerLabel} generation failed.`,
      code: error.code || "",
      failedAt: new Date().toISOString(),
      pricingEstimate: pricing,
      preDeductedCredits: cost,
      originalPreDeductedCredits: pricing?.originalCredits ?? cost,
      finalCredits: cost,
      originalFinalCredits: pricing?.originalCredits ?? cost,
    }, direct ? "seedance-nsfw-failed" : "seedance25-failed");
  }
}

function startSeedance25GenerationJob(job = {}) {
  setImmediate(() => {
    runSeedance25GenerationJob(job).catch((error) => {
      console.error("[seedance25-generation-job-failed]", job.taskId, error.message || error);
    });
  });
}

async function handleAdvancedSeedance25Generate(req, res, context = {}) {
  const { auth, body, bodyParams, caseParams, selectedCase, config, prompt } = context;
  const provider = normalizeAdvancedProvider(context.provider || body.provider || bodyParams.provider || "seedance25");
  const direct = provider === SEEDANCE25_DIRECT_PROVIDER;
  const providerLabel = direct ? SEEDANCE25_DIRECT_LABEL : "Seedance 2.5";
  if (direct && !ARK_API_KEY) {
    return sendJson(res, 503, { ok: false, code: "SEEDANCE25_DIRECT_NOT_CONFIGURED", message: `${providerLabel} generation is not configured.` });
  }
  if (!direct && !USE_GATEWAY_UPSTREAM && !SEEDANCE25_API_KEY) {
    return sendJson(res, 503, { ok: false, code: "SEEDANCE25_NOT_CONFIGURED", message: "Seedance 2.5 generation is not configured." });
  }
  const merged = mergedRequestForMedia(body, caseParams);
  const modeNormalizer = direct ? normalizeSeedance25DirectMode : normalizeSeedance25Mode;
  const mode = modeNormalizer(firstPresent(
    body.functionMode,
    body.seedanceMode,
    body.mediaMode,
    bodyParams.functionMode,
    bodyParams.seedanceMode,
    caseParams.functionMode,
    caseParams.seedanceMode,
  ));
  const resolution = String(firstPresent(body.resolution, bodyParams.resolution, caseParams.resolution, "480p")).trim().toLowerCase();
  const requestedRatio = String(firstPresent(body.ratio, bodyParams.ratio, caseParams.ratio, direct && mode !== "omini" ? "adaptive" : "16:9")).trim().toLowerCase();
  const ratio = direct && mode !== "omini" ? "adaptive" : requestedRatio;
  const duration = Number(firstPresent(body.duration, bodyParams.duration, caseParams.duration, 4));
  const seed = direct
    ? normalizeOptionalSeed(firstPresent(body.seed, bodyParams.seed, caseParams.seed), { max: SEEDANCE25_DIRECT_SEED_MAX })
    : "";
  const generateAudio = boolFromRequest(firstPresent(body.generateAudio, body.generate_audio, bodyParams.generateAudio, bodyParams.generate_audio), true);
  const preprocessReference = boolFromRequest(firstPresent(
    body.preprocessReference,
    bodyParams.preprocessReference,
    caseParams.preprocessReference,
  ), false);

  try {
    const imageInputs = seedance25ReferenceInputs(merged, "image");
    const videoInputs = seedance25ReferenceInputs(merged, "video");
    const audioInputs = seedance25ReferenceInputs(merged, "audio");
    const firstFrameAssetId = String(firstPresent(body.firstFrameAssetId, body.imageAssetId, bodyParams.firstFrameAssetId, bodyParams.imageAssetId, "") || "").trim();
    const lastFrameAssetId = String(firstPresent(body.lastFrameAssetId, body.endImageAssetId, bodyParams.lastFrameAssetId, bodyParams.endImageAssetId, "") || "").trim();
    if (mode === "first_last_frame") {
      imageInputs.assetIds = imageInputs.assetIds.filter((id) => id !== firstFrameAssetId && id !== lastFrameAssetId);
    }

    const imageSlots = (Array.isArray(imageInputs.ordered) ? imageInputs.ordered : [])
      .filter((slot) => mode !== "first_last_frame" || (slot.assetId !== firstFrameAssetId && slot.assetId !== lastFrameAssetId));
    const imageAssets = [];
    const imageUrls = [];
    for (const slot of imageSlots) {
      let asset = null;
      let urls = [];
      if (slot.type === "asset" && slot.assetId) {
        asset = seedance25OwnedAssets(auth.db, auth.user.id, [slot.assetId], "image")[0];
        urls = await seedance25PublicAssetUrls(auth.db, [asset]);
      } else if (slot.type === "inline" && slot.item) {
        asset = (await createUserImageAssetsFromInputs(auth.db, auth.user, [slot.item], { name: "Seedance 2.5 reference" }))[0] || null;
        urls = asset ? await seedance25PublicAssetUrls(auth.db, [asset]) : [];
      } else if (slot.type === "url" && slot.url) {
        if (preprocessReference) {
          asset = (await createUserImageAssetsFromInputs(auth.db, auth.user, [slot.url], { name: "Seedance 2.5 reference" }))[0] || null;
          urls = asset ? await seedance25PublicAssetUrls(auth.db, [asset]) : [];
        } else {
          urls = seedance25PublicInputUrls([slot.url], "image");
        }
      }
      const url = urls.find((item) => item && !imageUrls.includes(item)) || "";
      if (!url) continue;
      imageUrls.push(url);
      imageAssets.push(asset || null);
    }

    const videoAssets = seedance25OwnedAssets(auth.db, auth.user.id, videoInputs.assetIds, "video");
    const audioAssets = seedance25OwnedAssets(auth.db, auth.user.id, audioInputs.assetIds, "audio");
    const firstFrameInput = !firstFrameAssetId ? seedanceFirstFrameInputFromBody(merged, { includeDataUrlFallback: true }) : null;
    const lastFrameInput = !lastFrameAssetId ? seedanceEndFrameInputFromBody(merged) : null;
    const firstFrameAsset = firstFrameAssetId
      ? seedance25OwnedAssets(auth.db, auth.user.id, [firstFrameAssetId], "image")[0]
      : firstFrameInput && (firstFrameInput.dataUrl || preprocessReference)
      ? await createSingleSeedanceImageAssetFromInput(auth.db, auth.user, firstFrameInput, { name: "Seedance 2.5 first frame" })
      : null;
    const lastFrameAsset = lastFrameAssetId
      ? seedance25OwnedAssets(auth.db, auth.user.id, [lastFrameAssetId], "image")[0]
      : lastFrameInput && (lastFrameInput.dataUrl || preprocessReference)
      ? await createSingleSeedanceImageAssetFromInput(auth.db, auth.user, lastFrameInput, { name: "Seedance 2.5 last frame" })
      : null;

    let videoUrls = [...new Set([...await seedance25PublicAssetUrls(auth.db, videoAssets), ...seedance25PublicInputUrls(videoInputs.urls, "video")])];
    const audioUrls = [...new Set([...await seedance25PublicAssetUrls(auth.db, audioAssets), ...seedance25PublicInputUrls(audioInputs.urls, "audio")])];
    const firstFrameUrl = firstFrameAsset
      ? (await seedance25PublicAssetUrls(auth.db, [firstFrameAsset]))[0]
      : publicHttpUrlForUpstream(firstPresent(firstFrameInput?.url, body.firstFrameUrl, body.imageUrl, bodyParams.firstFrameUrl, bodyParams.imageUrl, ""));
    const lastFrameUrl = lastFrameAsset
      ? (await seedance25PublicAssetUrls(auth.db, [lastFrameAsset]))[0]
      : publicHttpUrlForUpstream(firstPresent(lastFrameInput?.url, body.lastFrameUrl, body.endImageUrl, bodyParams.lastFrameUrl, bodyParams.endImageUrl, ""));

    let inputVideoSeconds = 0;
    if (direct && videoUrls.length) {
      inputVideoSeconds = durationSecondsFromValue(firstPresent(
        body.inputVideoSeconds,
        body.referenceVideoDurationSeconds,
        bodyParams.inputVideoSeconds,
      ));
      if (!inputVideoSeconds) {
        inputVideoSeconds = videoAssets.reduce((sum, asset) => sum + durationSecondsFromValue(asset?.durationSeconds || asset?.duration), 0);
      }
      if (!inputVideoSeconds) {
        const durations = await Promise.all(videoUrls.map((url) => probeVideoDurationSeconds(url).catch(() => 0)));
        inputVideoSeconds = durations.reduce((sum, seconds) => sum + durationSecondsFromValue(seconds), 0);
      }
    }

    const upstreamInput = {
      mode,
      prompt,
      resolution,
      ratio,
      duration,
      seed,
      imageFiles: imageUrls,
      videoFiles: videoUrls,
      audioFiles: audioUrls,
      firstFrameUrl,
      lastFrameUrl,
      inputVideoSeconds,
      generateAudio,
    };
    if (direct) buildSeedance25DirectTaskPayload(upstreamInput, SEEDANCE25_DIRECT_ENDPOINT);
    else buildSeedance25TaskPayload(upstreamInput, SEEDANCE25_MODEL_ID);

    const rawPricing = advancedModelPricing(provider, {
      duration,
      resolution,
      ratio,
      mode,
      inputVideoSeconds,
      advancedPricing: config.platform?.advancedPricing,
    });
    const pricing = applyUserPricingToEstimate(rawPricing, auth.user, pricingContextForAuth(auth));
    const cost = pricing.credits;
    if (auth.user.credits < cost) return sendJson(res, 402, insufficientCreditsPayload(cost, auth.user.credits));
    assertSubtokenCanSpend(auth, cost);

    const taskId = localGenerationTaskId("cgt");
    const mediaAssets = [
      ...imageUrls.map((url, index) => ({ type: "reference_image", key: `image_${index + 1}`, userAssetId: imageAssets[index]?.id || "", imageUrl: url })),
      ...videoUrls.map((url, index) => ({ type: "reference_video", key: `video_${index + 1}`, userAssetId: videoAssets[index]?.id || "", videoUrl: url })),
      ...audioUrls.map((url, index) => ({ type: "reference_audio", key: `audio_${index + 1}`, userAssetId: audioAssets[index]?.id || "", audioUrl: url })),
      ...(firstFrameUrl ? [{ type: "image_url", key: "image_url", userAssetId: firstFrameAsset?.id || "", imageUrl: firstFrameUrl }] : []),
      ...(lastFrameUrl ? [{ type: "end_image_url", key: "end_image_url", userAssetId: lastFrameAsset?.id || "", imageUrl: lastFrameUrl }] : []),
    ];
    const requestParams = {
      provider,
      model: providerLabel,
      functionMode: mode,
      seedanceMode: mode,
      prompt,
      resolution,
      ratio,
      ...(mode === "edit" ? { inputVideoSeconds } : { duration }),
      ...(seed === "" || seed === undefined || seed === null ? {} : { seed: Number(seed) }),
      referenceImageAssetIds: imageAssets.map((asset) => asset.id),
      referenceVideoAssetIds: videoAssets.map((asset) => asset.id),
      referenceAudioAssetIds: audioAssets.map((asset) => asset.id),
      firstFrameAssetId: firstFrameAsset?.id || "",
      lastFrameAssetId: lastFrameAsset?.id || "",
      preprocessReference,
      generateAudio,
      generate_audio: generateAudio,
      createKind: firstPresent(bodyParams.createKind, body.params?.createKind, "custom"),
      createMode: firstPresent(bodyParams.createMode, body.params?.createMode, "custom"),
      preserveUserPrompt: true,
    };

    if (cost > 0) {
      await chargeUserWithSubtoken(auth, {
        cost,
        type: "advanced_generation",
        taskId,
        meta: {
          taskId,
          provider,
          model: providerLabel,
          mode,
          duration: pricing.duration,
          resolution,
          creditsPerSecond: pricing.creditsPerSecond,
          baseCredits: pricing.baseCredits,
          originalCost: pricing.originalCredits,
          pricingMultiplier: pricing.userPricingMultiplier,
          preprocessReference,
        },
      });
      if (!dbEnabled()) await writeDb(auth.db);
    }

    const record = await upsertGenerationRecord({
      taskId,
      status: "preparing",
      awaitingUpstreamTask: true,
      model: providerLabel,
      provider,
      upstreamSource: direct ? "byteplus-direct-seedance25" : (USE_GATEWAY_UPSTREAM ? "gateway" : "apiz-seedance25"),
      source: direct ? "advanced-seedance-nsfw" : "advanced-seedance25",
      kind: "advanced-video",
      templateId: selectedCase?.id || "",
      templateTitle: selectedCase?.title || "Advanced generation",
      userId: auth.user.id,
      userAssetId: firstFrameAsset?.id || imageAssets[0]?.id || videoAssets[0]?.id || "",
      mediaMode: mode,
      mediaAssets,
      imageUrl: firstFrameUrl || imageUrls[0] || "",
      sourceImageUrl: firstFrameUrl || imageUrls[0] || "",
      prompt,
      finalPrompt: prompt,
      params: requestParams,
      upstreamPayload: null,
      ratio,
      resolution,
      duration: pricing.duration,
      quality: resolution,
      error: "",
      preDeductedCredits: cost,
      originalPreDeductedCredits: pricing.originalCredits,
      finalCredits: cost,
      originalFinalCredits: pricing.originalCredits,
      userPricingMultiplier: pricing.userPricingMultiplier,
      billingStatus: cost > 0 ? (direct ? "pre_deducted" : "settled") : "free",
      billingSettledAt: cost > 0 && !direct ? new Date().toISOString() : "",
      pricingEstimate: pricing,
      apiTokenId: auth.tokenRecord?.id || "",
      apiTokenName: auth.tokenRecord?.name || "",
      apiTokenType: auth.tokenRecord?.quotaType || "",
      apiTokenSource: auth.tokenSource || "",
    });
    startSeedance25GenerationJob({
      taskId,
      upstreamInput,
      mediaAssets,
      pricing,
      cost,
      provider,
      preprocessReference,
      imageAssetIds: imageAssets.map((asset) => asset.id),
      firstFrameAssetId: firstFrameAsset?.id || "",
      lastFrameAssetId: lastFrameAsset?.id || "",
    });
    const latestDb = await readDb();
    const latestUser = latestDb.users.find((user) => user.id === auth.user.id) || auth.user;
    return sendJson(res, 200, {
      ok: true,
      task: { taskId, status: record.status },
      taskId,
      record: publicGenerationRecord(record, generationRecordResponseOptionsForAuth(auth)),
      user: userView(latestUser),
      pricing,
      cost,
    });
  } catch (error) {
    if (["INSUFFICIENT_CREDITS", "SUBTOKEN_QUOTA_EXCEEDED"].includes(error.code)) {
      return sendJson(res, error.statusCode || 402, error.payload || { ok: false, code: error.code, message: error.message });
    }
    return sendAdvancedValidationError(res, error, `${providerLabel} request is invalid.`);
  }
}

