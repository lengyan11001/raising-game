/* Seedance 2.5 and advanced generation request handlers. */

async function handlePlatformGenerate(req, res) {
  const auth = await requireUser(req, res);
  if (!auth) return;
  if (!await enforceBusinessRateLimit(req, res, auth, { action: "platform_generate", limit: 30, windowMs: 10 * 60_000 })) return;

  const body = await readJson(req, JSON_MEDIA_BODY_MAX_BYTES);
  const config = await readAppConfig();
  const template = findPlatformTemplate(config, body.templateId);
  if (template && !isExternalPlatformTemplate(template)) {
    return sendJson(res, 400, { ok: false, code: "TEMPLATE_NOT_GENERATABLE", message: "This template is a gallery shortcut and cannot be generated from this endpoint." });
  }
  if (!template) return sendJson(res, 404, { ok: false, message: "模板不存在或未启用。" });

  let imageUrl = "";
  let userAsset = null;
  let uploadSha256 = "";
  if (template.type === "image-to-video") {
    if (!body.dataUrl && body.userAssetId) {
      userAsset = auth.db.userAssets.find((asset) => asset.id === body.userAssetId && asset.userId === auth.user.id && !isSoftDeleted(asset));
      if (!userAsset) return sendJson(res, 404, { ok: false, message: "上传图片不存在。" });
      // A missing public URL is prepared inside the idempotent execution path.
      imageUrl = USE_GATEWAY_UPSTREAM
        ? (userAsset.localUrl || userAsset.publicUrl || "")
        : (userAsset.publicUrl || userAsset.localUrl || "");
    } else if (isPublicHttpUrl(body.imageUrl)) {
      imageUrl = publicHttpUrlForUpstream(body.imageUrl);
    } else if (body.dataUrl) {
      // A new upload is created only inside the idempotent execution path below.
      uploadSha256 = platformUploadDigest(body.dataUrl);
      imageUrl = "[pending-upload]";
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

  return executeRequestIdempotently({
    req,
    auth,
    action: "platform_generate",
    payload: {
      templateId: template.id,
      prompt,
      params: upstreamPayload.params,
      userAssetId: userAsset?.id || "",
      imageUrl,
      uploadSha256,
    },
    taskIdPrefix: "cgt",
    claim: claimRequestIdempotencyInDb,
    complete: completeRequestIdempotencyInDb,
    release: releaseRequestIdempotencyClaimInDb,
    execute: async ({ idempotency }) => {
      const taskId = idempotency.taskId || localGenerationTaskId("cgt");

      if (GENERATION_SUBMIT_QUEUE_ENABLED && idempotency.enabled) {
        const resumed = await getGenerationSubmitResumeStateInDb(taskId);
        if (resumed?.record && resumed.job) {
          const latestDb = await readDb();
          const latestUser = latestDb.users.find((user) => user.id === auth.user.id) || auth.user;
          return {
            statusCode: 200,
            payload: {
              ok: true,
              task: { taskId, status: resumed.record.status },
              taskId,
              record: publicGenerationRecord(resumed.record, generationRecordResponseOptionsForAuth(auth)),
              user: userView(latestUser),
            },
            headers: { "Idempotent-Replay": "true" },
          };
        }
      }

      if (template.type === "image-to-video" && body.dataUrl) {
        userAsset = await createUserAssetFromDataUrl(auth.db, auth.user, {
          dataUrl: body.dataUrl,
          fileName: body.fileName,
          name: template.title || "Template upload",
          assetId: platformDeterministicAssetId(taskId, uploadSha256),
        });
      }
      if (template.type === "image-to-video" && userAsset && !USE_GATEWAY_UPSTREAM) {
        userAsset = await ensurePublicUrlForUserAsset(auth.db, userAsset);
        imageUrl = userAsset.publicUrl;
      }
      if (template.type === "image-to-video" && (body.dataUrl || (userAsset && !USE_GATEWAY_UPSTREAM))) {
        if (USE_GATEWAY_UPSTREAM && userAsset) imageUrl = userAsset.localUrl || userAsset.publicUrl || imageUrl;
        const rebuiltPayload = platformApizPayload({
          template,
          prompt,
          imageUrl,
          overrides: body.params,
        });
        upstreamPayload.model = rebuiltPayload.model;
        upstreamPayload.params = rebuiltPayload.params;
      }

      const recordInput = platformGenerationRecordInput({
        taskId,
        auth,
        template,
        prompt,
        imageUrl,
        userAsset,
        upstreamPayload,
        pricingEstimate,
        preDeductedCredits,
      });
      const jobInput = platformGenerationJobInput({
        taskId,
        userId: auth.user.id,
        template,
        prompt,
        imageUrl,
        userAssetId: userAsset?.id || "",
        upstreamPayload,
        pricingEstimate,
        preDeductedCredits,
      });

      let record;
      if (GENERATION_SUBMIT_QUEUE_ENABLED) {
        if (!dbEnabled()) {
          const error = new Error("Durable generation submit requires PostgreSQL.");
          error.statusCode = 503;
          error.code = "GENERATION_SUBMIT_QUEUE_UNAVAILABLE";
          throw error;
        }
        const chargeMeta = attachAuthContextToMeta({
          source: "platform-template",
          templateId: template.id,
          templateTitle: template.title,
          pricingSource: pricingEstimate.source,
          originalCost: pricingEstimate.originalCredits,
          pricingMultiplier: pricingEstimate.userPricingMultiplier,
          taskId,
        });
        const charge = preDeductedCredits > 0 ? {
          id: stableLedgerId("generation_pre_deduct", chargeMeta),
          userId: auth.user.id,
          delta: -preDeductedCredits,
          type: "generation_pre_deduct",
          meta: chargeMeta,
        } : null;
        const subtoken = auth.tokenRecord?.id && preDeductedCredits > 0 ? {
          tokenId: auth.tokenRecord.id,
          eventKey: subtokenUsageEventKey("charge", taskId, "generation_pre_deduct"),
          parentUserId: auth.tokenRecord.parentUserId || auth.user.id,
          deltaAmount: auth.tokenRecord.quotaType === "amount" ? preDeductedCredits : 0,
          deltaCount: auth.tokenRecord.quotaType === "count" ? 1 : 0,
          meta: {
            ...chargeMeta,
            type: "generation_pre_deduct",
            taskId,
            amount: preDeductedCredits,
          },
        } : null;
        const prepared = await prepareGenerationSubmitInDb({
          record: recordInput,
          charge,
          subtoken,
          job: {
            userId: auth.user.id,
            kind: platformRecordKind(template),
            payload: jobInput,
          },
        });
        record = prepared.record || recordInput;
        if (prepared.jobInserted === false && String(prepared.job?.status || "") === "failed") {
          throw Object.assign(new Error("Generation submission queue rejected this task."), {
            statusCode: 409,
            code: "GENERATION_SUBMIT_JOB_FAILED",
          });
        }
      } else {
        record = await upsertGenerationRecord(recordInput);
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
        startPlatformGenerationJob(jobInput);
      }
      const latestDb = await readDb();
      const latestUser = latestDb.users.find((user) => user.id === auth.user.id) || auth.user;

      const responsePayload = {
        ok: true,
        task: { taskId, status: record.status },
        taskId,
        record: publicGenerationRecord(record, generationRecordResponseOptionsForAuth(auth)),
        user: userView(latestUser),
      };
      return { statusCode: 200, payload: responsePayload };
    },
  }).then((result) => sendRequestIdempotencyResult(res, result));
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

/* Seedance 2.5 input preparation and advanced generation handlers. */

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

async function runSeedance25GenerationJob(job = {}, submission = null) {
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
  } finally {
    finishGenerationSubmission(submission);
  }
}

function startSeedance25GenerationJob(job = {}) {
  return startTrackedGenerationJob("seedance25-generation", job.taskId, runSeedance25GenerationJob, (error) => {
    console.error("[seedance25-generation-job-failed]", job.taskId, error.message || error);
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
