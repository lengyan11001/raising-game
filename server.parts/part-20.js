async function ensureSyntheticReferenceForUserAsset(db, userAsset) {
  if (!userAsset) return null;
  const preprocessVersion = SEEDANCE_PREPROCESS_REFERENCE_VERSION;
  const reusable = userAsset.syntheticReferenceAssetUri
    && userAsset.syntheticReferenceVersion === preprocessVersion;
  if (reusable) return userAsset;

  // References produced by the old prompt forced every input into a female
  // character portrait, including male characters and empty scene images.
  const resetLegacyReference = userAsset.syntheticReferenceVersion !== preprocessVersion;

  const prepared = await ensureCharacterReferenceForRecord({
    id: userAsset.id,
    userId: userAsset.userId,
    name: userAsset.name || "Advanced reference",
    title: userAsset.name || "Advanced reference",
    sourceImageUrl: userAsset.sourceImageUrl || userAsset.localUrl,
    localImageUrl: userAsset.sourceImageUrl || userAsset.localUrl,
    posterUrl: userAsset.sourceImageUrl || userAsset.localUrl,
    sourceImageMime: userAsset.sourceImageMime || userAsset.mime || "",
    imageMime: userAsset.sourceImageMime || userAsset.mime || "",
    syntheticReferenceLocalUrl: resetLegacyReference ? "" : (userAsset.syntheticReferenceLocalUrl || ""),
    syntheticReferenceUrl: resetLegacyReference ? "" : (userAsset.syntheticReferenceUrl || ""),
    syntheticReferenceTaskId: resetLegacyReference ? "" : (userAsset.syntheticReferenceTaskId || ""),
    syntheticReferenceModel: resetLegacyReference ? "" : (userAsset.syntheticReferenceModel || ""),
    syntheticReferencePrompt: resetLegacyReference ? "" : (userAsset.syntheticReferencePrompt || ""),
    referenceAssetUri: resetLegacyReference ? "" : (userAsset.syntheticReferenceAssetUri || ""),
    preserveSourceComposition: true,
  });

  const next = {
    ...userAsset,
    sourceImageUrl: userAsset.sourceImageUrl || userAsset.localUrl,
    sourceImageMime: userAsset.sourceImageMime || userAsset.mime || "",
    syntheticReferenceLocalUrl: prepared.syntheticReferenceLocalUrl || userAsset.syntheticReferenceLocalUrl || "",
    syntheticReferenceUrl: prepared.syntheticReferenceUrl || userAsset.syntheticReferenceUrl || "",
    syntheticReferenceTaskId: prepared.syntheticReferenceTaskId || userAsset.syntheticReferenceTaskId || "",
    syntheticReferenceModel: prepared.syntheticReferenceModel || userAsset.syntheticReferenceModel || "",
    syntheticReferencePrompt: prepared.syntheticReferencePrompt || userAsset.syntheticReferencePrompt || "",
    syntheticReferenceVersion: preprocessVersion,
    syntheticReferenceAssetUri: prepared.referenceAssetUri || userAsset.syntheticReferenceAssetUri || "",
    syntheticReferencePublicUrl: prepared.publicImageUrl || userAsset.syntheticReferencePublicUrl || "",
    syntheticReferenceR2Key: prepared.r2Key || userAsset.syntheticReferenceR2Key || "",
    sourcePublicUrl: prepared.sourcePublicUrl || userAsset.sourcePublicUrl || "",
    sourceR2Key: prepared.sourceR2Key || userAsset.sourceR2Key || "",
    updatedAt: new Date().toISOString(),
  };

  db.userAssets = (db.userAssets || []).map((asset) => (asset.id === next.id ? next : asset));
  if (dbEnabled()) await upsertUserAssetInDb(next);
  else await writeDb(db);
  return next;
}

async function prepareSeedanceReferenceAsset(db, userAsset, preprocess = false) {
  if (!userAsset) return { asset: null, referenceAssetUri: "", imageUrl: "", sourceImageUrl: "" };
  validateWan27MediaKind(userAsset, "image", "Seedance reference image");
  const prepared = preprocess
    ? await ensureSyntheticReferenceForUserAsset(db, userAsset)
    : await ensureSeedanceAssetForUserAsset(db, userAsset);
  const publicImageUrl = preprocess
    ? publicHttpUrlForUpstream(firstPresent(
        prepared.syntheticReferencePublicUrl,
        prepared.syntheticReferenceUrl,
        prepared.publicUrl,
      ))
    : publicHttpUrlForUserAsset(prepared);
  return {
    asset: prepared,
    referenceAssetUri: preprocess ? (prepared.syntheticReferenceAssetUri || prepared.assetUri || "") : (prepared.assetUri || ""),
    imageUrl: preprocess
      // The local character-reference path is redirected to R2 by serveStatic.
      // Persist the CDN URL when available so task history does not point at
      // an object key that was never uploaded under assets/user-characters.
      ? (publicImageUrl || prepared.syntheticReferencePublicUrl || prepared.publicUrl || prepared.syntheticReferenceLocalUrl || prepared.syntheticReferenceUrl || prepared.localUrl || "")
      : (prepared.publicUrl || prepared.localUrl || ""),
    publicImageUrl,
    sourceImageUrl: prepared.sourceImageUrl || prepared.localUrl || "",
  };
}

async function prepareSeedanceVideoAsset(db, userAsset) {
  if (!userAsset) return { asset: null, referenceAssetUri: "", videoUrl: "" };
  validateWan27MediaKind(userAsset, "video", "Seedance reference video");
  const prepared = await ensureSeedanceAssetForUserAsset(db, userAsset);
  return {
    asset: prepared,
    referenceAssetUri: prepared.seedanceVideoAssetUri || "",
    videoUrl: prepared.publicUrl || prepared.localUrl || "",
  };
}

async function createSeedanceReferenceVideoAssetFromUrl(db, user, videoUrl = "", index = 0) {
  const url = publicHttpUrlForUpstream(videoUrl) || String(videoUrl || "").trim();
  if (!url) return null;
  if (isAllowedInlineMediaDataUrl(url, "video")) {
    return await createUserWanMediaAssetFromDataUrl(db, user, {
      dataUrl: url,
      name: `Seedance reference video ${index + 1}`,
      fileName: `seedance-reference-video-${index + 1}.mp4`,
    });
  }
  if (!isPublicHttpUrl(url)) return null;
  const pathname = new URL(url).pathname;
  const fileName = path.basename(pathname) || `seedance-reference-video-${index + 1}.mp4`;
  const existing = findUserAssetBySourceUrl(db, user, url);
  if (existing) return await refreshSeedancePresetVideoAssetFromSourceIfNeeded(db, existing, url);
  const localSourcePath = localAssetPathFromPublicValue(url);
  if (localSourcePath) {
    const tempPath = path.join(USER_UPLOAD_DIR, user.id, `.seedance-reference-video-${Date.now()}-${index}.mp4`);
    try {
      const dimensions = await normalizeSeedanceVideoFileForRequest(localSourcePath, tempPath, `Seedance reference video ${index + 1}`);
      const bytes = await fs.readFile(tempPath);
      const asset = await createUserMediaAssetFromBytes(db, user, {
        bytes,
        mime: videoMimeFromPath(tempPath),
        name: `Seedance reference video ${index + 1}`,
        fileName,
        maxBytes: MEDIA_UPLOAD_MAX_BYTES,
        durationSeconds: dimensions.durationSeconds,
      });
      asset.sourceUrl = normalizedAssetSourceUrl(url);
      asset.hidden = true;
      asset.videoWidth = dimensions.width;
      asset.videoHeight = dimensions.height;
      asset.durationSeconds = dimensions.durationSeconds || asset.durationSeconds || 0;
      asset.meta = { fromWorkflowPreset: true, upstreamUse: "seedance_reference_video" };
      asset.updatedAt = new Date().toISOString();
      db.userAssets = (db.userAssets || []).map((entry) => (entry.id === asset.id ? asset : entry));
      if (dbEnabled()) await upsertUserAssetInDb(asset);
      else await writeDb(db);
      return asset;
    } finally {
      await fs.rm(tempPath, { force: true }).catch(() => {});
    }
  }
  return await createUserMediaAssetFromPublicUrl(db, user, {
    url,
    name: `Seedance reference video ${index + 1}`,
    fileName,
    sourceUrl: url,
    hidden: true,
    meta: { fromWorkflowPreset: true, upstreamUse: "seedance_reference_video" },
  });
}

async function createSeedanceReferenceAudioAssetFromUrl(db, user, audioUrl = "", index = 0) {
  const url = publicHttpUrlForUpstream(audioUrl) || String(audioUrl || "").trim();
  if (!url) return null;
  if (isAllowedInlineMediaDataUrl(url, "audio")) {
    return await createUserWanMediaAssetFromDataUrl(db, user, {
      dataUrl: url,
      name: `Seedance reference audio ${index + 1}`,
      fileName: `seedance-reference-audio-${index + 1}.mp3`,
    });
  }
  if (!isPublicHttpUrl(url)) return null;
  const pathname = new URL(url).pathname;
  const fileName = path.basename(pathname) || `seedance-reference-audio-${index + 1}.mp3`;
  const existing = findUserAssetBySourceUrl(db, user, url);
  if (existing) return existing;
  return await createUserMediaAssetFromPublicUrl(db, user, {
    url,
    name: `Seedance reference audio ${index + 1}`,
    fileName,
    sourceUrl: url,
    hidden: true,
    meta: { fromWorkflowPreset: true, upstreamUse: "seedance_reference_audio" },
  });
}

async function prepareSeedanceAudioAsset(db, userAsset) {
  if (!userAsset) return { asset: null, referenceAssetUri: "", audioUrl: "" };
  validateWan27MediaKind(userAsset, "audio", "Seedance reference audio");
  try {
    const prepared = await ensureSeedanceAssetForUserAsset(db, userAsset);
    return {
      asset: prepared,
      referenceAssetUri: prepared.seedanceAudioAssetUri || "",
      audioUrl: prepared.publicUrl || prepared.localUrl || "",
    };
  } catch (error) {
    const prepared = await ensurePublicUrlForUserMediaAsset(db, userAsset);
    return {
      asset: prepared,
      referenceAssetUri: publicUrlForLocalAsset(prepared),
      audioUrl: publicUrlForLocalAsset(prepared),
    };
  }
}

async function apizRequest(pathname, body) {
  if (!APIZ_API_KEY) {
    const error = new Error("Generation service is not configured.");
    error.statusCode = 503;
    error.code = "GENERATION_SERVICE_NOT_CONFIGURED";
    throw error;
  }

  const response = await fetch(`${APIZ_BASE_URL}${pathname}`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${APIZ_API_KEY}`,
      "content-type": "application/json",
      accept: "application/json",
    },
    body: JSON.stringify(body),
  });
  const text = await response.text();
  const payload = text ? JSON.parse(text) : {};
  if (!response.ok || payload.code >= 400) {
    const error = new Error(payload.message || payload.detail || `Generation request failed: ${response.status}`);
    error.statusCode = response.status || 502;
    error.payload = payload;
    throw error;
  }
  return payload.data || payload;
}

async function seedance25Request(pathname, body = {}, { auth = true, timeoutMs = 180000 } = {}) {
  if (auth && !SEEDANCE25_API_KEY) {
    const error = new Error("Seedance 2.5 generation is not configured.");
    error.statusCode = 503;
    error.code = "SEEDANCE25_NOT_CONFIGURED";
    throw error;
  }
  let response;
  try {
    response = await fetch(`${SEEDANCE25_API_BASE_URL}${pathname}`, {
      method: "POST",
      headers: {
        ...(auth ? { authorization: `Bearer ${SEEDANCE25_API_KEY}` } : {}),
        "content-type": "application/json",
        accept: "application/json",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (cause) {
    const error = new Error("Seedance 2.5 service request failed.");
    error.statusCode = 502;
    error.code = "SEEDANCE25_FETCH_FAILED";
    error.cause = cause;
    throw error;
  }
  const responseText = await response.text();
  let payload = {};
  try {
    payload = responseText ? JSON.parse(responseText) : {};
  } catch {
    payload = { message: responseText };
  }
  if (!response.ok || Number(payload?.code || 0) >= 400 || payload?.error) {
    const error = new Error(payload?.error?.message || payload?.message || payload?.detail || `Seedance 2.5 request failed: ${response.status}`);
    error.statusCode = response.status || 502;
    error.code = payload?.error?.code || payload?.code || "SEEDANCE25_REQUEST_FAILED";
    error.payload = payload;
    throw error;
  }
  return payload?.data || payload;
}

function apizModelPathId(modelId = "") {
  return encodeURIComponent(String(modelId || "").trim()).replace(/%2F/gi, "/");
}

async function apizGet(pathname, query = {}) {
  if (!APIZ_API_KEY) {
    const error = new Error("Generation service is not configured.");
    error.statusCode = 503;
    error.code = "GENERATION_SERVICE_NOT_CONFIGURED";
    throw error;
  }

  const url = new URL(`${APIZ_BASE_URL}${pathname}`);
  Object.entries(query || {}).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") url.searchParams.set(key, String(value));
  });
  const response = await fetch(url, {
    method: "GET",
    headers: {
      authorization: `Bearer ${APIZ_API_KEY}`,
      accept: "application/json",
    },
  });
  const text = await response.text();
  const payload = text ? JSON.parse(text) : {};
  if (!response.ok || payload.code >= 400) {
    const error = new Error(payload.message || payload.detail || `Generation metadata request failed: ${response.status}`);
    error.statusCode = response.status || 502;
    error.payload = payload;
    throw error;
  }
  return payload.data || payload;
}

function apizPricingNumber(value) {
  if (typeof value === "boolean") return null;
  if (typeof value === "string") {
    const text = value.trim();
    if (!text || /^auto$/i.test(text)) return null;
    const direct = Number(text);
    if (Number.isFinite(direct)) return direct;
    const match = text.match(/-?\d+(?:\.\d+)?/);
    if (!match) return null;
    const parsed = Number(match[0]);
    return Number.isFinite(parsed) ? parsed : null;
  }
  const next = Number(value);
  return Number.isFinite(next) ? next : null;
}

function apizPricingBaseAmount(pricing = {}) {
  for (const key of ["base_price", "amount", "price", "credits", "credit_cost"]) {
    const next = apizPricingNumber(pricing?.[key]);
    if (next !== null) return next;
  }
  return null;
}

function apizCreditsFromPricingAmount(amount, unit = "") {
  const next = apizPricingNumber(amount);
  if (next === null || next < 0) return null;
  const normalizedUnit = String(unit || "").toLowerCase();
  if (normalizedUnit.includes("元") || normalizedUnit.includes("yuan") || normalizedUnit.includes("cny")) {
    return creditsAmount(next * 100);
  }
  return creditsAmount(next);
}

function durationSecondsFromParams(params = {}) {
  for (const key of ["duration", "duration_sec", "duration_seconds", "seconds", "length", "video_length", "audio_length"]) {
    const next = apizPricingNumber(params?.[key]);
    if (next !== null && next > 0) return next;
  }
  return 0;
}

function apizPricingText(value = {}) {
  if (!value || typeof value !== "object") return "";
  return [
    value.description,
    value.label,
    value.name,
    value.title,
    value.price_description,
    Array.isArray(value.price_factors) ? value.price_factors.join(" ") : "",
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function mediaValueLooksLikeVideo(value) {
  if (!value) return false;
  if (typeof value === "string") return isLikelyVideoUrl(value) || /\.(avi|mkv)(?:[?#]|$)/i.test(value);
  if (Array.isArray(value)) return value.some(mediaValueLooksLikeVideo);
  if (typeof value === "object") {
    return mediaValueLooksLikeVideo(value.url || value.src || value.path || value.file || value.file_url || value.fileUrl);
  }
  return false;
}

function paramsHaveVideoInput(params = {}) {
  return Object.entries(params || {}).some(([key, value]) => {
    const normalizedKey = key.toLowerCase();
    if (/^video_(?:file|url)?_\d+$/.test(normalizedKey) || /^video_file_\d+$/.test(normalizedKey) || ["video_file", "video_url", "video_files", "video_urls"].includes(normalizedKey)) {
      return Boolean(value);
    }
    if (["media_files", "filepaths", "file_paths"].includes(normalizedKey)) {
      return mediaValueLooksLikeVideo(value);
    }
    return false;
  });
}

function modelVariantFromParams(params = {}) {
  const raw = String(params.model || params.model_type || params.variant || "").trim();
  const compact = raw.toLowerCase().replace(/[\s_/-]+/g, "");
  if (!compact) return { known: false, fast: null, vip: null };
  if (compact.includes("superseed2")) return { known: true, fast: true, vip: false };
  if (!compact.includes("seedance")) return { known: false, fast: null, vip: null };
  const vip = compact.includes("vip");
  const fast = compact.includes("fast");
  return { known: true, fast, vip };
}

function exampleMentionsVideoInput(text = "") {
  return /含\s*视频|视频素材|with\s+video|video\s+(?:material|input|reference|file)|video_file/i.test(text);
}

function exampleMentionsNoVideoInput(text = "") {
  return /文生视频|text\s*to\s*video|without\s+video|no\s+video/i.test(text);
}

function seedanceDynamicPerSecondRate(pricing = {}, params = {}) {
  const description = apizPricingText(pricing);
  if (!/seedance|fast|标准|standard/i.test(description)) return null;
  const variant = modelVariantFromParams(params);
  if (!variant.known) return null;
  const hasVideoInput = paramsHaveVideoInput(params);
  if (variant.fast && variant.vip) return hasVideoInput ? 240 : 120;
  if (variant.fast) return hasVideoInput ? 120 : 60;
  if (variant.vip) return hasVideoInput ? 300 : 150;
  return hasVideoInput ? 180 : 90;
}

function numOutputsFromParams(params = {}) {
  const next = apizPricingNumber(params.num_images ?? params.n ?? params.batch_size ?? params.num_outputs ?? 1);
  return Math.max(1, Math.ceil(next || 1));
}

function durationFromPricingExample(example = {}) {
  for (const key of ["duration", "duration_sec", "duration_seconds", "seconds", "length"]) {
    const next = apizPricingNumber(example?.[key]);
    if (next !== null && next > 0) return next;
  }
  const text = String(example.description || example.label || example.name || "");
  const match = text.match(/(\d+(?:\.\d+)?)\s*(?:秒|s|sec|second)/i);
  const parsed = match ? apizPricingNumber(match[1]) : null;
  return parsed && parsed > 0 ? parsed : 0;
}

function exampleMatchesPricingParams(example = {}, params = {}) {
  const text = apizPricingText(example);
  const resolution = String(params.resolution || params.quality || "").trim().toLowerCase();
  const modelVariant = modelVariantFromParams(params);
  const hasVideoInput = paramsHaveVideoInput(params);

  if (resolution && text && !text.includes(resolution)) {
    const mentionedResolution = /\b\d{3,4}p\b/i.test(text);
    if (mentionedResolution) return false;
  }
  if (modelVariant.known && text) {
    const mentionsVip = /\bvip\b/i.test(text);
    const mentionsFast = /\bfast\b/i.test(text);
    const mentionsStandard = /标准|standard/i.test(text);
    if (modelVariant.vip !== null && mentionsVip !== modelVariant.vip) return false;
    if (modelVariant.fast === true && mentionsStandard) return false;
    if (modelVariant.fast === false && mentionsFast) return false;
  }
  if (text) {
    if (exampleMentionsVideoInput(text) && !hasVideoInput) return false;
    if (exampleMentionsNoVideoInput(text) && hasVideoInput) return false;
  }
  return true;
}

function pricingExamplePrices(pricing = {}) {
  const examples = pricing.examples || pricing.duration_prices || pricing.prices || [];
  if (!Array.isArray(examples)) return [];
  return examples
    .map((example) => {
      if (!example || typeof example !== "object") return null;
      const price = apizPricingBaseAmount(example);
      if (price === null) return null;
      return { duration: durationFromPricingExample(example), price };
    })
    .filter(Boolean);
}

function priceFromDurationExamples(pricing = {}, params = {}) {
  const examples = pricing.examples || pricing.duration_prices || pricing.prices || [];
  const scopedExamples = Array.isArray(examples) ? examples.filter((example) => exampleMatchesPricingParams(example, params)) : [];
  const prices = pricingExamplePrices({ ...pricing, examples: scopedExamples.length ? scopedExamples : examples });
  if (!prices.length) return null;
  const duration = durationSecondsFromParams(params);
  if (duration > 0) {
    const withDuration = prices.filter((item) => item.duration > 0).sort((a, b) => a.duration - b.duration);
    const matched = withDuration.find((item) => duration <= item.duration);
    if (matched) {
      return Math.max(...withDuration.filter((item) => item.duration === matched.duration).map((item) => item.price));
    }
    if (withDuration.length) {
      const maxDuration = withDuration[withDuration.length - 1].duration;
      const maxDurationPrice = Math.max(...withDuration.filter((item) => item.duration === maxDuration).map((item) => item.price));
      if (maxDuration > 0) return Math.ceil((maxDurationPrice / maxDuration) * duration);
      return maxDurationPrice;
    }
  }
  return Math.max(...prices.map((item) => item.price));
}

function matrixPriceCandidates(value) {
  const direct = apizPricingNumber(value);
  if (direct !== null) return [direct];
  if (Array.isArray(value)) return value.flatMap(matrixPriceCandidates);
  if (value && typeof value === "object") {
    const base = apizPricingBaseAmount(value);
    const nested = Object.values(value).flatMap(matrixPriceCandidates);
    return base === null ? nested : [base, ...nested];
  }
  return [];
}

function priceFromQualitySizeMatrix(pricing = {}, params = {}) {
  const matrix = pricing.quality_size_matrix || pricing.matrix || pricing.size_quality_matrix;
  if (!matrix || typeof matrix !== "object" || Array.isArray(matrix)) return null;
  const qualities = ["quality", "image_quality", "resolution_quality", "mode", "resolution"]
    .map((key) => String(params[key] || "").trim())
    .filter(Boolean);
  const sizes = ["size", "image_size", "resolution", "aspect_ratio", "ratio"]
    .map((key) => String(params[key] || "").trim())
    .filter(Boolean);

  for (const quality of qualities) {
    const sub = matrix[quality];
    if (sub && typeof sub === "object") {
      for (const size of sizes) {
        const values = matrixPriceCandidates(sub[size]);
        if (values.length) return Math.max(...values);
      }
      const values = matrixPriceCandidates(sub);
      if (values.length) return Math.max(...values);
    }
  }
  for (const size of sizes) {
    const values = matrixPriceCandidates(matrix[size]);
    if (values.length) return Math.max(...values);
  }
  const values = matrixPriceCandidates(matrix);
  return values.length ? Math.max(...values) : null;
}

function defaultDurationFromDocs(docs = {}) {
  const properties = docs.params_schema?.properties;
  const durationSchema = properties?.duration;
  if (!durationSchema || typeof durationSchema !== "object") return 0;
  const direct = apizPricingNumber(durationSchema.default);
  if (direct && direct > 0) return direct;
  if (Array.isArray(durationSchema.enum)) {
    const values = durationSchema.enum.map(apizPricingNumber).filter((value) => value && value > 0);
    if (values.length) return Math.min(...values);
  }
  return 0;
}

function normalizeApizPricing(pricing, docs = {}) {
  if (!pricing || typeof pricing !== "object" || Array.isArray(pricing)) return null;
  const next = { ...pricing };
  const defaultDuration = defaultDurationFromDocs(docs);
  if (defaultDuration > 0) next._default_duration_seconds = defaultDuration;
  return next;
}

function pricingIsFreeFixed(pricing = {}) {
  const priceType = String(pricing.price_type || pricing.type || "").trim().toLowerCase();
  const amount = apizPricingBaseAmount(pricing);
  return priceType === "fixed" && amount === 0;
}

function estimateCreditsFromApizPricing(pricing = {}, params = {}) {
  if (!pricing || typeof pricing !== "object") return 0;
  const unit = pricing.price_unit || pricing.unit || "";
  const priceType = String(pricing.price_type || pricing.type || "").trim().toLowerCase();
  const baseAmount = apizPricingBaseAmount(pricing);
  const duration = durationSecondsFromParams(params) || apizPricingNumber(pricing._default_duration_seconds) || 0;

  if (pricing.pricing_mode === "token") {
    const inputRate = apizPricingNumber(pricing.input_price_credits_per_1m);
    const outputRate = apizPricingNumber(pricing.output_price_credits_per_1m);
    const promptTokens = Math.max(0, Number(params.prompt_tokens || params.input_tokens || 0));
    const completionTokens = Math.max(0, Number(params.completion_tokens || params.output_tokens || 0));
    const promptText = String(params.prompt || params.text || "");
    const fallbackInputTokens = promptText ? Math.ceil(promptText.length / 3) : 1000;
    const fallbackOutputTokens = Math.max(1000, Math.ceil(Math.max(duration, 5) * 21780));
    if (inputRate !== null || outputRate !== null) {
      const inputCredits = ((inputRate || 0) * (promptTokens || fallbackInputTokens)) / 1000000;
      const outputCredits = ((outputRate || 0) * (completionTokens || fallbackOutputTokens)) / 1000000;
      return creditsAmount(inputCredits + outputCredits);
    }
  }

  if (priceType === "fixed" && baseAmount === 0) return 0;

  if (priceType === "per_second" || priceType === "dynamic_per_second") {
    const explicitRate = priceType === "dynamic_per_second" ? seedanceDynamicPerSecondRate(pricing, params) : null;
    if (explicitRate && explicitRate > 0) {
      return apizCreditsFromPricingAmount(Math.ceil((duration || 5) * explicitRate), unit) || 0;
    }
    const examplePrice = priceFromDurationExamples(pricing, params);
    if (examplePrice !== null) return apizCreditsFromPricingAmount(examplePrice, unit) || 0;
    let rate = apizPricingNumber(pricing.per_second);
    if (!rate || rate <= 0) {
      if (priceType === "dynamic_per_second" && baseAmount && pricing._default_duration_seconds) {
        rate = baseAmount / Number(pricing._default_duration_seconds);
      } else {
        rate = baseAmount;
      }
    }
    if (!rate || rate <= 0) return 0;
    return apizCreditsFromPricingAmount(Math.ceil(Math.max(duration, 5) * rate), unit) || 0;
  }

  if (priceType === "per_minute") {
    const rate = apizPricingNumber(pricing.per_minute) ?? baseAmount;
    if (!rate || rate <= 0) return 0;
    return apizCreditsFromPricingAmount(Math.max(1, Math.ceil(Math.max(duration, 60) / 60)) * rate, unit) || 0;
  }

  if (priceType === "duration_map" || priceType === "duration_based" || priceType === "duration_price") {
    const examplePrice = priceFromDurationExamples(pricing, params);
    if (examplePrice !== null) return apizCreditsFromPricingAmount(examplePrice, unit) || 0;
    if (!baseAmount || baseAmount <= 0) return 0;
    if (duration > 0 && priceType !== "duration_map") return apizCreditsFromPricingAmount(Math.ceil(duration * baseAmount), unit) || 0;
    return apizCreditsFromPricingAmount(baseAmount, unit) || 0;
  }

  if (priceType === "token_postcharge") {
    const examplePrice = priceFromDurationExamples(pricing, params);
    if (examplePrice !== null) return apizCreditsFromPricingAmount(examplePrice, unit) || 0;
    return apizCreditsFromPricingAmount(baseAmount || 0, unit) || 0;
  }

  if (priceType === "quantity_based") {
    if (!baseAmount || baseAmount <= 0) return 0;
    return apizCreditsFromPricingAmount(baseAmount * numOutputsFromParams(params), unit) || 0;
  }

  if (priceType === "quality_size_matrix" || priceType === "matrix") {
    const matrixPrice = priceFromQualitySizeMatrix(pricing, params);
    const amount = matrixPrice ?? baseAmount;
    if (!amount || amount <= 0) return 0;
    return apizCreditsFromPricingAmount(amount * numOutputsFromParams(params), unit) || 0;
  }

  if (priceType === "token_based") {
    if (!baseAmount || baseAmount <= 0) return 0;
    const tokens = Math.max(0, Number(params.prompt_tokens || 0) + Number(params.completion_tokens || 0));
    return apizCreditsFromPricingAmount(baseAmount * Math.max(1, Math.ceil(tokens / 1000)), unit) || 0;
  }

  if (priceType === "audio_duration_based" || priceType === "audio_duration" || priceType === "char_based") {
    if (!baseAmount || baseAmount <= 0) return 0;
    if (priceType === "char_based") {
      const chars = String(params.prompt || params.text || "").length || 100;
      return apizCreditsFromPricingAmount(baseAmount * Math.max(1, Math.ceil(chars / 1000)), unit) || 0;
    }
    return apizCreditsFromPricingAmount(baseAmount * Math.max(1, Math.ceil(duration || 1)), unit) || 0;
  }

  if (priceType === "resolution_quantity" || priceType === "size_based") {
    if (!baseAmount || baseAmount <= 0) return 0;
    return apizCreditsFromPricingAmount(baseAmount * numOutputsFromParams(params), unit) || 0;
  }

  return apizCreditsFromPricingAmount(baseAmount || 0, unit) || 0;
}

async function fetchApizModelPricing(modelId = "") {
  const model = String(modelId || "").trim();
  if (!model) return null;
  const cached = apizPricingCache.get(model);
  if (cached && cached.expiresAt > Date.now()) return cached.value;

  let value = null;
  try {
    const docs = await apizGet(`/api/v3/models/${apizModelPathId(model)}/docs`, { lang: "zh" });
    value = normalizeApizPricing(docs?.pricing, docs);
  } catch (error) {
    if (!error.statusCode || error.statusCode !== 404) {
      console.warn("[apiz-pricing-docs-failed]", model, error.message || error);
    }
  }

  if (!value) {
    try {
      const detail = await apizGet(`/api/v3/mcp/models/${apizModelPathId(model)}`, { lang: "zh" });
      value = normalizeApizPricing(detail?.pricing, detail);
    } catch (error) {
      if (!error.statusCode || error.statusCode !== 404) {
        console.warn("[apiz-pricing-detail-failed]", model, error.message || error);
      }
    }
  }

  if (!value) {
    try {
      value = normalizeApizPricing(await apizGet(`/v1/pricing/${encodeURIComponent(model)}`), {});
    } catch (error) {
      if (!error.statusCode || error.statusCode !== 404) {
        console.warn("[apiz-pricing-v1-failed]", model, error.message || error);
      }
    }
  }

  if (!value) {
    value = await fetchApizModelListPricing(model);
  }

  apizPricingCache.set(model, { value, expiresAt: Date.now() + APIZ_PRICING_CACHE_TTL_MS });
  return value;
}

async function fetchApizModelListPricing(modelId = "") {
  const model = String(modelId || "").trim();
  if (!model) return null;
  if (apizModelListPricingCache.expiresAt <= Date.now()) {
    const values = new Map();
    try {
      const data = await apizGet("/api/v3/mcp/models", { lang: "zh-CN" });
      const models = Array.isArray(data?.models) ? data.models : [];
      models.forEach((item) => {
        const id = String(item?.id || "").trim();
        const pricing = normalizeApizPricing(item?.pricing, item);
        if (id && pricing) values.set(id, pricing);
      });
    } catch (error) {
      console.warn("[apiz-pricing-list-failed]", error.message || error);
    }
    apizModelListPricingCache = { expiresAt: Date.now() + APIZ_PRICING_CACHE_TTL_MS, values };
  }
  return apizModelListPricingCache.values.get(model) || null;
}

async function estimatePlatformPreDeductCredits(model, params = {}, template = {}) {
  if (USE_GATEWAY_UPSTREAM) {
    return fixedCreditsBreakdown(template.price || GATEWAY_PLATFORM_FALLBACK_CREDITS, "gateway_fixed");
  }
  const pricing = await fetchApizModelPricing(model);
  const estimated = estimateCreditsFromApizPricing(pricing, params);
  if (estimated > 0 || pricingIsFreeFixed(pricing)) {
    return { ...costBreakdown(estimated, "model_pricing"), pricing };
  }

  const error = new Error("模型定价未配置，暂不能提交生成。请在后台模板里填写上游真实模型 ID。");
  error.statusCode = 422;
  error.code = "MODEL_PRICING_UNAVAILABLE";
  throw error;
}

async function readGenerationRecords() {
  if (dbEnabled()) {
    const records = await getGenerationRecordsFromDb({ limit: 500, includeDeleted: true });
    return Array.isArray(records) ? records : [];
  }
  const records = await getKv("generation_records", []);
  return Array.isArray(records) ? records : [];
}

async function writeGenerationRecords(records) {
  return withAppStateWriteLock(async () => {
    if (dbEnabled()) {
      await replaceGenerationRecordsInDb(records);
      return;
    }
    await setKv("generation_records", records);
  });
}

async function upsertGenerationRecord(nextRecord) {
  const storableRecord = storageGenerationRecord(nextRecord);
  if (
    /^(?:R2 upload timed out after \d+ seconds\.)$/.test(String(storableRecord.error || "").trim())
    && /^(?:succeeded|completed|success)$/i.test(String(storableRecord.status || "").trim())
    && (storableRecord.localVideoUrl || storableRecord.cdnVideoUrl)
  ) {
    storableRecord.error = "";
  }
  if (dbEnabled()) {
    const record = await upsertGenerationRecordInDb(storableRecord);
    void notifyTelegramGenerationRecord(record).catch((error) => {
      console.warn("[telegram-generation-notify-queue-failed]", record?.taskId || storableRecord.taskId, error.message || error);
    });
    return record;
  }
  const record = await withAppStateWriteLock(async () => {
    const records = await readGenerationRecords();
    const index = records.findIndex((record) => record.taskId === storableRecord.taskId);
    const now = new Date().toISOString();
    const record = {
      ...(index >= 0 ? records[index] : { createdAt: now }),
      ...storableRecord,
      deletedAt: storableRecord.deletedAt ?? (index >= 0 ? records[index].deletedAt || "" : ""),
      updatedAt: now,
    };

    for (const key of ["cdnVideoUrl", "cdnPosterUrl", "cdnImageUrl"]) {
      if (!String(storableRecord[key] || "").trim() && String(records[index]?.[key] || "").trim()) {
        record[key] = records[index][key];
      }
    }
    for (const key of ["cdnImageUrls"]) {
      if (Array.isArray(records[index]?.[key]) && records[index][key].length && (!Array.isArray(storableRecord[key]) || !storableRecord[key].length)) {
        record[key] = records[index][key];
      }
    }

    if (index >= 0) {
      records[index] = record;
    } else {
      records.unshift(record);
    }

    await writeGenerationRecords(records.slice(0, 500));
    return record;
  });
  void notifyTelegramGenerationRecord(record).catch((error) => {
    console.warn("[telegram-generation-notify-queue-failed]", record?.taskId || storableRecord.taskId, error.message || error);
  });
  return record;
}

async function upsertAndSettleGenerationRecord(nextRecord, reason = "query") {
  const record = await upsertGenerationRecord(nextRecord);
  // Upstream completion is immediately customer-visible. Browser responses
  // prefer the durable R2 copy when available and otherwise fall back to the
  // still-valid upstream URL while the background mirror retries.
  return settleSeedanceGenerationRecord(record, reason);
}

async function updateGenerationRecord(taskId, updates = {}, reason = "update") {
  if (!taskId) return null;
  const nextRecord = storageGenerationRecord({ ...updates, taskId });
  if (reason) nextRecord.lastUpdateReason = reason;
  return upsertAndSettleGenerationRecord(nextRecord, reason);
}

async function getGenerationRecord(taskId) {
  if (dbEnabled()) {
    return getGenerationRecordFromDb(taskId);
  }
  const records = await readGenerationRecords();
  return records.find((record) => record.taskId === taskId) || null;
}

async function listGenerationRecordsForUser(userId, limit = 60) {
  if (dbEnabled()) {
    const records = await getGenerationRecordsFromDb({
      userId,
      limit,
      includeDeleted: false,
    });
    return Array.isArray(records) ? records : [];
  }
  const records = await readGenerationRecords();
  return records
    .filter((record) => record.userId === userId && isUserVisibleGenerationRecord(record))
    .slice(0, limit);
}

async function softDeleteGenerationRecordsByCompanion(companionId, { userId = "" } = {}) {
  if (!companionId) return [];
  const nowIso = new Date().toISOString();
  if (dbEnabled()) {
    return patchGenerationRecordsInDb({
      companionId,
      userId,
      notDeleted: true,
    }, {
      deletedAt: nowIso,
    });
  }
  const records = await readGenerationRecords();
  let changedRecords = false;
  const nextRecords = records.map((entry) => {
    if (entry.companionId !== companionId || entry.deletedAt) return entry;
    if (userId && entry.userId !== userId) return entry;
    changedRecords = true;
    return { ...entry, deletedAt: nowIso, updatedAt: nowIso };
  });
  if (changedRecords) await writeGenerationRecords(nextRecords);
  return changedRecords ? nextRecords : [];
}

async function softDeleteGenerationRecordForUser(taskId, userId) {
  const id = String(taskId || "").trim();
  const ownerId = String(userId || "").trim();
  if (!id || !ownerId) return null;
  const record = await getGenerationRecord(id);
  if (!record || record.userId !== ownerId || !isUserVisibleGenerationRecord(record)) return null;
  const nowIso = new Date().toISOString();
  return upsertGenerationRecord({
    ...record,
    taskId: id,
    deletedAt: nowIso,
    updatedAt: nowIso,
  });
}

function isUserVisibleGenerationRecord(record) {
  return Boolean(record && record.taskId && !record.deletedAt);
}

function generationRecordKind(record = {}) {
  const source = String(record.source || "").trim();
  if (source === "user-character" || source.includes("home")) return "main-video";
  if (source.includes("unlock")) return "unlock-video";
  if (source.includes("advanced")) return "advanced-video";
  return "scene-video";
}

function generationRecordProviderVideoUrl(record = {}) {
  return String(
    record.remoteVideoUrl ||
    record.providerVideoUrl ||
    record.upstreamVideoUrl ||
    findVideoUrl(record.queryResponse) ||
    findVideoUrl(record.createResponse) ||
    "",
  ).trim();
}

function generationRecordStoredVideoUrl(record = {}) {
  return String(record.cdnVideoUrl || record.localVideoUrl || record.videoUrl || "").trim();
}

function generationRecordVideoUrl(record = {}, options = {}) {
  const providerUrl = generationRecordProviderVideoUrl(record);
  const cdnUrl = String(record.cdnVideoUrl || "").trim();
  const localUrl = String(record.localVideoUrl || record.videoUrl || "").trim();
  if (options.preferProviderVideoUrl) return providerUrl || cdnUrl || localUrl;
  return cdnUrl || providerUrl || localUrl;
}

function generationRecordImageUrl(record = {}) {
  return String(
    record.cdnImageUrl ||
    record.remoteImageUrl ||
    record.providerImageUrl ||
    record.upstreamImageUrl ||
    record.localImageUrl ||
    record.imageResultUrl ||
    "",
  ).trim();
}

function generationRecordProviderImageUrl(record = {}) {
  return String(
    record.remoteImageUrl ||
    record.providerImageUrl ||
    record.upstreamImageUrl ||
    collectOutputImageUrls(record.queryResponse)[0] ||
    collectOutputImageUrls(record.createResponse)[0] ||
    "",
  ).trim();
}

function isChatCompletionGenerationRecord(record = {}) {
  const provider = String(record.provider || "").toLowerCase();
  const kind = String(record.kind || "").toLowerCase();
  const source = String(record.source || "").toLowerCase();
  if (["byteplus-language", "qwen37-flash", "papaya"].includes(provider)) return true;
  if (kind === "text" || kind === "language" || kind === "chat" || kind.includes("text")) return true;
  if (source.includes("language") || source === "advanced-text") return true;
  const hasText = Boolean(String(record.textResult || record.responseText || "").trim());
  return hasText && !generationRecordVideoUrl(record) && !generationRecordImageUrl(record);
}

function isImageGenerationRecord(record = {}) {
  const provider = String(record.provider || "").toLowerCase();
  const kind = String(record.kind || "").toLowerCase();
  const source = String(record.source || "").toLowerCase();
  if (
    generationRecordVideoUrl(record) ||
    kind.includes("video") ||
    source.includes("video") ||
    provider === "seedance" ||
    provider === "seedance25" ||
    provider === SEEDANCE25_DIRECT_PROVIDER ||
    provider === "wan27" ||
    provider === "aliyun-wan30" ||
    provider === "aliyun-wan27" ||
    provider === "aliyun-happyhorse" ||
    isVegaProvider(provider)
  ) return false;
  if (provider.includes("image") || kind.includes("image") || source.includes("image")) return true;
  return Boolean(generationRecordImageUrl(record)) && !Boolean(generationRecordVideoUrl(record));
}

function generationRecordResponseOptionsForAuth(auth = {}) {
  const tokenSource = String(auth?.tokenSource || "").toLowerCase();
  const externalApiCaller = tokenSource === "api_token" || tokenSource === "subtoken" || auth?.isApiToken === true;
  return {
    // Browser previews use the durable R2 copy first. External API callers keep
    // the upstream URL contract and do not receive stored media URLs.
    preferProviderVideoUrl: externalApiCaller,
    providerOnlyVideoUrl: externalApiCaller,
    includeStoredVideoUrls: !externalApiCaller,
    providerOnlyImageUrl: externalApiCaller,
    includeStoredImageUrls: !externalApiCaller,
    includeUpstreamPayload: !externalApiCaller,
    requireR2Ready: !externalApiCaller && objectStorageEnabled() && !GENERATED_ASSETS_ON_DEMAND,
  };
}

function generationRecordIsApiTask(record = {}) {
  const source = String(record.apiTokenSource || record.tokenSource || "").toLowerCase();
  return source === "api_token" || source === "subtoken";
}

function generationRecordIsVideoOutput(record = {}) {
  if (isImageGenerationRecord(record)) return false;
  const provider = String(record.provider || "").toLowerCase();
  const kind = String(record.kind || "").toLowerCase();
  return Boolean(
    record.remoteVideoUrl
    || record.providerVideoUrl
    || record.upstreamVideoUrl
    || record.localVideoUrl
    || record.cdnVideoUrl
    || record.videoUrl
    || kind.includes("video")
    || ["apiz", "seedance", "seedance25", SEEDANCE25_DIRECT_PROVIDER, "aliyun-wan30", "aliyun-wan27", "aliyun-happyhorse", "pivox", "ignex", "seedance20-vega", "seedance25-vega", "h3-vega"].includes(provider),
  );
}

const GENERATED_R2_REQUIRED_SINCE_MS = Date.parse("2026-10-17T13:17:00+08:00");

function generationRecordRequiresR2Publication(record = {}) {
  // Records created before the R2 gate was turned back on keep their original
  // provider links. Only tasks created at or after that moment wait for R2.
  const createdAt = Date.parse(String(record.createdAt || ""));
  if (!Number.isFinite(createdAt)) return false;
  return createdAt >= GENERATED_R2_REQUIRED_SINCE_MS;
}

function generationRecordR2Expired(record = {}) {
  // r2PurgedAt means retention deliberately removed the durable copy. It is a
  // terminal state, not a failed upload that should be retried from an expired
  // provider URL.
  return Boolean(String(record.r2PurgedAt || "").trim());
}

function generationRecordR2PublicationPending(record = {}) {
  if (generationRecordR2Expired(record)) return false;
  if (!generationRecordRequiresR2Publication(record)) return false;
  if (!generatedOutputStorageEnabled() || generationRecordIsApiTask(record) || !isSucceededStatus(record.status)) return false;
  if (isChatCompletionGenerationRecord(record)) return false;
  if (generationRecordIsVideoOutput(record)) return !String(record.cdnVideoUrl || "").trim();
  if (isImageGenerationRecord(record)) {
    const cdnImages = Array.isArray(record.cdnImageUrls) ? record.cdnImageUrls : [];
    return !String(record.cdnImageUrl || "").trim() && !cdnImages.some((item) => String(item || "").trim());
  }
  return false;
}

function publicGenerationRecord(record = {}, options = {}) {
  const providerOnlyOutputs = DISABLE_GENERATED_R2_STORAGE;
  const requireR2Ready = options.requireR2Ready === true;
  const r2PublicationPending = requireR2Ready && generationRecordR2PublicationPending(record);
  const undressToolRecord = String(record.source || "").startsWith("undress-tool-")
    || String(record.kind || "").includes("tool-undress");
  const providerVideoUrl = generationRecordProviderVideoUrl(record);
  const cdnUrl = String(record.cdnVideoUrl || "").trim();
  const localUrl = String(record.localVideoUrl || record.videoUrl || "").trim();
  const providerOnlyVideoUrl = options.providerOnlyVideoUrl === true;
  // Prefer the durable R2 copy when it is available. While the background
  // mirror is still uploading, fall back to the provider URL so the user can
  // preview/download immediately instead of being stuck on a loading state.
  // Provider URLs are intentionally treated as usable for their validity
  // window; the R2 mirror will take over automatically on a later refresh.
  const gateNewR2 = requireR2Ready && generatedOutputStorageEnabled() && generationRecordRequiresR2Publication(record);
  // A finished generation is usable immediately from the provider URL while
  // the durable R2 mirror catches up. R2 readiness controls the advanced
  // download action only; it must not rewrite task status to processing or
  // hide a result that the upstream has already completed.
  const publicVideoUrl = providerOnlyOutputs || providerOnlyVideoUrl
    ? (providerVideoUrl || cdnUrl || localUrl)
    : (providerVideoUrl || cdnUrl || localUrl);
  const includeStoredVideoUrls = options.includeStoredVideoUrls !== false;
  const providerPosterUrl = String(record.providerPosterUrl || record.upstreamPosterUrl || record.remotePosterUrl || "");
  const storedPosterUrl = String(record.cdnPosterUrl || record.localPosterUrl || record.posterUrl || "").trim();
  const preferredPosterUrl = String(record.cdnPosterUrl || providerPosterUrl || record.localPosterUrl || record.posterUrl || "").trim();
  const providerImageUrl = generationRecordProviderImageUrl(record);
  const providerOnlyImageUrl = options.providerOnlyImageUrl === true;
  const publicImageUrl = (providerOnlyOutputs || providerOnlyImageUrl) && providerImageUrl
    ? providerImageUrl
    : generationRecordImageUrl(record);
  const includeStoredImageUrls = options.includeStoredImageUrls !== false;
  const providerImageUrls = [...new Set([
    ...(Array.isArray(record.remoteImageUrls) ? record.remoteImageUrls : []),
    ...(Array.isArray(record.providerImageUrls) ? record.providerImageUrls : []),
    ...collectOutputImageUrls(record.queryResponse),
    ...collectOutputImageUrls(record.createResponse),
  ].map((item) => String(item || "").trim()).filter(Boolean))];
  const storedImageUrls = [...new Set([
    ...(Array.isArray(record.imageResultUrls) ? record.imageResultUrls : []),
    ...(Array.isArray(record.cdnImageUrls) ? record.cdnImageUrls : []),
    ...(Array.isArray(record.localImageUrls) ? record.localImageUrls : []),
  ].map((item) => String(item || "").trim()).filter(Boolean))];
  const publicImageUrls = (providerOnlyOutputs || providerOnlyImageUrl) && providerImageUrls.length
    ? providerImageUrls
    : (storedImageUrls.length ? storedImageUrls : providerImageUrls);
  const publicDownloadUrl = publicVideoUrl || publicImageUrl || providerVideoUrl || providerImageUrl;
  const recordError = generationRecordR2Expired(record)
    ? ""
    : (String(record.provider || "").toLowerCase() === "seedance25" && isFailedStatus(record.status)
      ? seedance25TaskFailureMessage(record.queryResponse || {}) || record.error || ""
      : record.error || "");
  const publicRecord = {
    taskId: String(record.taskId || ""),
    upstreamTaskId: String(record.upstreamTaskId || ""),
    status: String(record.status || "submitted"),
    source: publicModelText(record.source || ""),
    kind: String(record.kind || generationRecordKind(record)),
    templateId: String(record.templateId || ""),
    templateTitle: String(record.templateTitle || ""),
    sceneId: String(record.sceneId || ""),
    sceneName: String(record.sceneName || ""),
    sceneEntryId: String(record.sceneEntryId || ""),
    sceneEntryName: String(record.sceneEntryName || ""),
    companionId: String(record.companionId || ""),
    companionName: String(record.companionName || ""),
    partnerCharacterId: String(record.partnerCharacterId || ""),
    partnerCharacterName: String(record.partnerCharacterName || ""),
    imageUrl: String(record.imageUrl || ""),
    sourceImageUrl: String(record.sourceImageUrl || ""),
    syntheticReferenceLocalUrl: String(record.syntheticReferenceLocalUrl || ""),
    syntheticReferenceUrl: String(record.syntheticReferenceUrl || ""),
    userAssetId: String(record.userAssetId || ""),
    referenceAssetUri: String(record.referenceAssetUri || ""),
    mediaMode: publicModelText(record.mediaMode || record.params?.mediaMode || ""),
    mediaAssets: listGenerationRecordValue(publicModelValue(Array.isArray(record.mediaAssets) ? record.mediaAssets : [])),
    posterUrl: includeStoredVideoUrls ? preferredPosterUrl : providerPosterUrl,
    prompt: String(record.prompt || ""),
    finalPrompt: String(record.finalPrompt || ""),
    params: listGenerationRecordValue(publicModelValue(record.params || null)),
    model: publicModelText(record.model || ""),
    provider: publicProviderId(record.provider || record.params?.provider || ""),
    providerLabel: publicProviderLabel(record.provider || record.params?.provider || ""),
    ratio: String(record.ratio || ""),
    resolution: String(record.resolution || ""),
    duration: record.duration || "",
    quality: String(record.quality || ""),
    videoUrl: publicVideoUrl,
    downloadUrl: publicDownloadUrl,
    providerVideoUrl,
    upstreamVideoUrl: providerVideoUrl,
    remoteVideoUrl: String(record.remoteVideoUrl || ""),
    imageResultUrl: publicImageUrl,
    imageResultUrls: publicImageUrls,
    providerImageUrl,
    providerImageUrls,
    upstreamImageUrl: providerImageUrl,
    remoteImageUrl: String(record.remoteImageUrl || ""),
    textResult: publicModelText(record.textResult || record.responseText || ""),
    responseText: publicModelText(record.responseText || record.textResult || ""),
    usage: listGenerationRecordValue(record.usage || null),
    error: publicModelText(recordError),
    cdnError: publicModelText(record.cdnError || ""),
    r2DownloadReady: Boolean(String(record.cdnVideoUrl || record.cdnImageUrl || (Array.isArray(record.cdnImageUrls) ? record.cdnImageUrls.find((item) => String(item || "").trim()) : "") || "").trim()),
    advancedDownloadAvailable: Boolean(
      isSucceededStatus(record.status)
      && record.resultLocked !== true
      && !generationRecordR2Expired(record)
      && Boolean(generationRecordProviderDownloadTarget(record)?.url)
    ),
    billing: publicBilling(record),
    createdAt: String(record.createdAt || ""),
    updatedAt: String(record.updatedAt || ""),
    awaitingUpstreamTask: record.awaitingUpstreamTask === true,
    apiTokenId: String(record.apiTokenId || ""),
    apiTokenName: String(record.apiTokenName || ""),
    apiTokenType: String(record.apiTokenType || ""),
    resultLocked: record.resultLocked === true,
    unlockCredits: creditsAmount(record.unlockCredits || 0),
    unlockType: String(record.unlockType || ""),
    lockedPreviewUrl: record.resultLocked === true && undressToolRecord
      ? publicUndressLockedPreviewUrl(record.lockedPreviewUrl)
      : "",
  };
  if (gateNewR2 && !generationRecordIsApiTask(record) && !isChatCompletionGenerationRecord(record)) {
    if (generationRecordIsVideoOutput(record) && !r2PublicationPending) {
      publicRecord.videoUrl = cdnUrl;
      publicRecord.downloadUrl = cdnUrl;
      publicRecord.providerVideoUrl = "";
      publicRecord.upstreamVideoUrl = "";
      publicRecord.remoteVideoUrl = "";
    } else if (isImageGenerationRecord(record) && !r2PublicationPending) {
      const readyImages = [...new Set([
        ...(Array.isArray(record.cdnImageUrls) ? record.cdnImageUrls : []),
        record.cdnImageUrl,
      ].map((item) => String(item || "").trim()).filter(Boolean))];
      publicRecord.imageResultUrl = readyImages[0] || "";
      publicRecord.imageResultUrls = readyImages;
      publicRecord.downloadUrl = readyImages[0] || "";
      publicRecord.providerImageUrl = "";
      publicRecord.providerImageUrls = [];
      publicRecord.upstreamImageUrl = "";
      publicRecord.remoteImageUrl = "";
    }
  }
  if (includeStoredVideoUrls) {
    publicRecord.localVideoUrl = providerOnlyOutputs ? "" : String(record.localVideoUrl || "");
    publicRecord.cdnVideoUrl = providerOnlyOutputs ? "" : String(record.cdnVideoUrl || "");
    publicRecord.localPosterUrl = providerOnlyOutputs ? "" : String(record.localPosterUrl || "");
    publicRecord.cdnPosterUrl = providerOnlyOutputs ? "" : String(record.cdnPosterUrl || "");
  }
  if (includeStoredImageUrls) {
    publicRecord.localImageUrl = providerOnlyOutputs ? "" : String(record.localImageUrl || "");
    publicRecord.cdnImageUrl = providerOnlyOutputs ? "" : String(record.cdnImageUrl || "");
    publicRecord.localImageUrls = providerOnlyOutputs ? [] : (Array.isArray(record.localImageUrls) ? record.localImageUrls.map(String) : []);
    publicRecord.cdnImageUrls = providerOnlyOutputs ? [] : (Array.isArray(record.cdnImageUrls) ? record.cdnImageUrls.map(String) : []);
  }
  if (options.includeUpstreamPayload === true && (record.resultLocked !== true || options.includeLockedMedia === true)) {
    publicRecord.upstreamPayload = listGenerationRecordValue(record.upstreamPayload || null);
  }
  if (undressToolRecord && options.includeInternalToolDetails !== true) {
    const recordParams = plainObject(record.params);
    publicRecord.upstreamTaskId = "";
    publicRecord.prompt = "";
    publicRecord.finalPrompt = "";
    publicRecord.model = "";
    publicRecord.provider = "undress";
    publicRecord.providerLabel = "Undress";
    publicRecord.cdnError = "";
    publicRecord.params = {
      stage: String(recordParams.stage || ""),
      durationSeconds: Number(recordParams.durationSeconds || 0),
      segmentCount: Number(recordParams.segmentCount || 0),
      completedSegments: Number(recordParams.completedSegments || 0),
    };
    publicRecord.mediaAssets = [];
    publicRecord.userAssetId = "";
    publicRecord.referenceAssetUri = "";
    delete publicRecord.upstreamPayload;
  }
  if (record.resultLocked === true && options.includeLockedMedia !== true) {
    [
      "imageUrl", "sourceImageUrl", "syntheticReferenceLocalUrl", "syntheticReferenceUrl",
      "referenceAssetUri", "posterUrl", "videoUrl", "downloadUrl", "providerVideoUrl",
      "upstreamVideoUrl", "remoteVideoUrl", "imageResultUrl", "providerImageUrl",
      "upstreamImageUrl", "remoteImageUrl", "localVideoUrl", "cdnVideoUrl",
      "localPosterUrl", "cdnPosterUrl", "localImageUrl", "cdnImageUrl",
    ].forEach((key) => { publicRecord[key] = ""; });
    publicRecord.imageResultUrls = [];
    publicRecord.providerImageUrls = [];
    publicRecord.localImageUrls = [];
    publicRecord.cdnImageUrls = [];
    publicRecord.mediaAssets = [];
    publicRecord.userAssetId = "";
    publicRecord.prompt = "";
    publicRecord.finalPrompt = "";
    delete publicRecord.upstreamPayload;
  }
  return publicRecord;
}

function adminGenerationRecordView(record = {}, userMap = new Map()) {
  const user = userMap.get(record.userId);
  const publicRecord = publicGenerationRecord(record, { includeLockedMedia: true, includeInternalToolDetails: true });
  const inferredProvider = record.provider || (String(record.source || "").includes("platform") ? "apiz" : "seedance");
  return {
    ...publicRecord,
    userId: String(record.userId || ""),
    username: user?.username || "",
    source: String(record.source || ""),
    mediaMode: String(record.mediaMode || record.params?.mediaMode || ""),
    mediaAssets: listGenerationRecordValue(Array.isArray(record.mediaAssets) ? record.mediaAssets : []),
    params: listGenerationRecordValue(record.params || null),
    model: String(record.model || ""),
    provider: String(inferredProvider || ""),
    prompt: String(record.prompt || ""),
    finalPrompt: String(record.finalPrompt || ""),
    error: String(record.error || ""),
    cdnError: String(record.cdnError || ""),
    upstreamPayload: listGenerationRecordValue(record.upstreamPayload || null),
    pricingEstimate: record.pricingEstimate || null,
    createResponse: listGenerationRecordValue(record.createResponse || null),
    queryResponse: listGenerationRecordValue(record.queryResponse || null),
    createReportedCredits: record.createReportedCredits === undefined ? null : record.createReportedCredits,
    billingError: String(record.billingError || ""),
    statusQueryError: String(record.statusQueryError || ""),
    statusQueryStatusCode: record.statusQueryStatusCode || 0,
    statusQueryCheckedAt: String(record.statusQueryCheckedAt || ""),
    partnerReferenceAssetUri: String(record.partnerReferenceAssetUri || ""),
  };
}

const ADMIN_GENERATION_MEDIA_TTL_MS = 30 * 60 * 1000;

function signAdminGenerationMediaPayload(encodedPayload = "") {
  return crypto.createHmac("sha256", unlockStreamSecret()).update(`admin-generation-media:${encodedPayload}`).digest("base64url");
}

function makeAdminGenerationMediaToken(taskId = "") {
  const payload = base64UrlJson({
    kind: "admin-generation-media",
    taskId: String(taskId || ""),
    exp: Date.now() + ADMIN_GENERATION_MEDIA_TTL_MS,
  });
  return `${payload}.${signAdminGenerationMediaPayload(payload)}`;
}

function parseAdminGenerationMediaToken(token = "") {
  const [payload, signature] = String(token || "").split(".");
  if (!payload || !signature) return null;
  const expected = signAdminGenerationMediaPayload(payload);
  const actualBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (actualBuffer.length !== expectedBuffer.length || !crypto.timingSafeEqual(actualBuffer, expectedBuffer)) return null;
  try {
    const decoded = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (!decoded || decoded.kind !== "admin-generation-media" || Number(decoded.exp || 0) < Date.now()) return null;
    return decoded;
  } catch {
    return null;
  }
}

