function seedancePayloadFromBody({ config = {}, prompt = "", content = [], body = {} } = {}) {
  const source = { ...requestParamsFromBody(body), ...body };
  const parameterExtras = plainObject(source.parameters);
  const payload = pickRequestFields(source, SEEDANCE_TOP_LEVEL_PASSTHROUGH_FIELDS);
  delete payload.seed;
  const requestedContent = Array.isArray(source.content) ? source.content : null;
  const fallbackContent = Array.isArray(content) ? content : [];
  payload.model = String(firstPresent(source.model, MODEL_QUALITY));
  payload.content = requestedContent || fallbackContent;
  payload.generate_audio = boolFromRequest(
    firstPresent(source.generate_audio, source.generateAudio),
    config.video?.generateAudio === true,
  );
  payload.ratio = String(firstPresent(source.ratio, source.aspect_ratio, config.video?.ratio, "9:16"));
  payload.resolution = normalizeAdvancedResolution(firstPresent(source.resolution, config.video?.resolution, "720p"));
  payload.duration = clampNumber(
    firstPresent(source.duration, source.durationSeconds),
    config.video?.duration || advancedDurationBounds("seedance").fallback,
    advancedDurationBounds("seedance").min,
    advancedDurationBounds("seedance").max,
  );
  const seedValue = normalizeOptionalSeed(firstPresent(source.seed, parameterExtras.seed));
  if (seedValue !== undefined) payload.seed = seedValue;
  const webSearchValue = firstPresent(source.web_search, source.webSearch, parameterExtras.web_search, parameterExtras.webSearch);
  if (webSearchValue !== undefined) payload.web_search = boolFromRequest(webSearchValue, false);
  payload.watermark = boolFromRequest(firstPresent(source.watermark, parameterExtras.watermark), false);
  if (Array.isArray(payload.reference_images) && payload.reference_images.length) {
    payload.reference_images = payload.reference_images.map((item) => (
      typeof item === "string" ? item : String(item?.url || item?.image_url || item?.assetUri || item || "")
    )).filter(Boolean);
  }
  if (Array.isArray(payload.reference_videos) && payload.reference_videos.length) {
    payload.reference_videos = payload.reference_videos.map((item) => (
      typeof item === "string" ? item : String(item?.url || item?.videoUrl || item?.video_url || item?.assetUri || item || "")
    )).filter(Boolean);
  }
  if (Array.isArray(payload.reference_audios) && payload.reference_audios.length) {
    payload.reference_audios = payload.reference_audios.map((item) => (
      typeof item === "string" ? item : String(item?.url || item?.audioUrl || item?.audio_url || item?.assetUri || item || "")
    )).filter(Boolean);
  }
  if (!Array.isArray(payload.content) || !payload.content.length) payload.content = [{ type: "text", text: String(prompt || "") }];
  return payload;
}

function pivoxSeedanceContentFromReferences(args = {}) {
  const content = seedanceContentFromReferences(args);
  const addReferenceImage = (uri) => {
    const url = String(uri || "").trim();
    if (!url) return;
    const exists = content.some((item) => item?.type === "image_url" && nestedMediaUrl(item.image_url) === url && String(item.role || "") === "reference_image");
    if (!exists) content.push({ type: "image_url", image_url: { url }, role: "reference_image" });
  };
  addReferenceImage(args.referenceAssetUri);
  arrayFromBody(args.extraReferenceAssetUris).forEach(addReferenceImage);
  return content;
}

function normalizePivoxSeedanceContent(content = []) {
  return (Array.isArray(content) ? content : [])
    .map((item) => normalizeSeedanceContentItem(item))
    .map((item) => {
      if (!item || typeof item !== "object" || Array.isArray(item)) return null;
      if (item.type === "text") return { ...item, text: String(item.text || "") };
      if (item.type === "image_url") {
        const url = pivoxMediaReferenceUrl(nestedMediaUrl(item.image_url));
        if (!url) return null;
        return { ...item, image_url: { ...(item.image_url || {}), url } };
      }
      if (item.type === "video_url") {
        const url = pivoxMediaReferenceUrl(nestedMediaUrl(item.video_url));
        if (!url) return null;
        return { ...item, video_url: { ...(item.video_url || {}), url } };
      }
      if (item.type === "audio_url") {
        const url = pivoxMediaReferenceUrl(nestedMediaUrl(item.audio_url));
        if (!url) return null;
        return { ...item, audio_url: { ...(item.audio_url || {}), url } };
      }
      return item;
    })
    .filter(Boolean);
}

function normalizePivoxUrlList(value = []) {
  return arrayFromBody(value)
    .map((item) => pivoxMediaReferenceUrl(nestedMediaUrl(item)))
    .filter((url, index, list) => url && list.indexOf(url) === index);
}

function isPivoxAssetUri(value = "") {
  return /^asset:\/\/asset-[a-z0-9_-]+$/i.test(String(value || "").trim());
}

function pivoxMediaReferenceUrl(value = "") {
  const text = String(value || "").trim();
  if (!text) return "";
  if (isPivoxAssetUri(text)) return text;
  return publicHttpUrlForUpstream(text);
}

function pivoxAssetGroupCacheKey(user = {}, model = "") {
  const userKey = String(user?.id || user?.username || user?.email || "default").trim().toLowerCase() || "default";
  return `${String(model || "default").trim().toLowerCase() || "default"}:${userKey}`;
}

async function pivoxAssetGroupForUser(user = {}, model = "") {
  const key = pivoxAssetGroupCacheKey(user, model);
  const cached = PIVOX_ASSET_GROUP_CACHE.get(key);
  if (cached) return cached;
  const safeUser = String(user?.username || user?.id || "user").replace(/[^a-z0-9_-]+/gi, "-").slice(0, 48) || "user";
  const raw = await pivoxRequest("POST", "/v1/asset-groups", {
    model,
    name: `vipeak-${safeUser}`,
    description: "Reusable Seedance references",
  });
  const groupId = String(raw?.id || raw?.group_id || raw?.data?.id || raw?.data?.group_id || "").trim();
  if (!groupId) {
    const error = new Error(`Pivoxapi did not return asset group id: ${JSON.stringify(raw || {})}`);
    error.statusCode = 502;
    error.code = "PIVOX_ASSET_GROUP_FAILED";
    throw error;
  }
  PIVOX_ASSET_GROUP_CACHE.set(key, groupId);
  return groupId;
}

async function waitForPivoxAsset(assetId = "", taskId = "", model = "") {
  const id = String(assetId || "").trim();
  const task = String(taskId || "").trim();
  if (!id && !task) return null;
  let last = null;
  for (let attempt = 0; attempt < 12; attempt += 1) {
    if (attempt) await delay(Math.min(1000 + attempt * 500, 3500));
    last = await pivoxRequest("POST", "/v1/assets/get", {
      model,
      ...(id ? { asset_id: id } : {}),
      ...(task ? { task_id: task } : {}),
    });
    const status = String(last?.status || last?.data?.status || last?.asset?.status || "").toLowerCase();
    const assetError = last?.error || last?.data?.error || last?.asset?.error;
    if (status === "completed" || status === "success" || status === "succeeded") return last;
    if (status === "failed" || status === "error" || assetError) {
      const error = new Error(assetError?.message || assetError || "Pivoxapi asset upload failed.");
      error.statusCode = 502;
      error.code = "PIVOX_ASSET_UPLOAD_FAILED";
      error.payload = last;
      throw error;
    }
  }
  const error = new Error(`Pivoxapi asset upload did not complete: ${id || task}`);
  error.statusCode = 502;
  error.code = "PIVOX_ASSET_UPLOAD_TIMEOUT";
  error.payload = last;
  throw error;
}

async function uploadPivoxImageReferenceAsset({ user = {}, model = "", url = "", name = "reference-image" } = {}) {
  const sourceUrl = pivoxMediaReferenceUrl(url);
  if (!sourceUrl) return "";
  if (isPivoxAssetUri(sourceUrl)) return sourceUrl;
  const cacheKey = `${pivoxAssetGroupCacheKey(user, model)}:${sourceUrl}`;
  const cachedAssetUri = PIVOX_ASSET_URI_CACHE.get(cacheKey);
  if (cachedAssetUri) return cachedAssetUri;
  const groupId = await pivoxAssetGroupForUser(user, model);
  const raw = await pivoxRequest("POST", "/v1/assets", {
    model,
    group_id: groupId,
    url: sourceUrl,
    asset_type: "Image",
    name,
  });
  const assetId = String(raw?.id || raw?.asset_id || raw?.data?.id || raw?.data?.asset_id || "").trim();
  const taskId = String(raw?.task_id || raw?.data?.task_id || "").trim();
  if (!assetId) {
    const error = new Error(`Pivoxapi did not return asset id: ${JSON.stringify(raw || {})}`);
    error.statusCode = 502;
    error.code = "PIVOX_ASSET_UPLOAD_FAILED";
    throw error;
  }
  await waitForPivoxAsset(assetId, taskId, model);
  const assetUri = `asset://${assetId}`;
  PIVOX_ASSET_URI_CACHE.set(cacheKey, assetUri);
  return assetUri;
}

async function preparePivoxSeedancePayloadAssets(payload = {}, { user = {} } = {}) {
  if (!payload || typeof payload !== "object") return payload;
  const model = String(payload.model || PIVOX_SEEDANCE_QUALITY_MODEL);
  const assetUriByUrl = new Map();
  const toAssetUri = async (url = "", name = "reference-image") => {
    const normalized = pivoxMediaReferenceUrl(url);
    if (!normalized) return "";
    if (isPivoxAssetUri(normalized)) return normalized;
    if (!assetUriByUrl.has(normalized)) {
      assetUriByUrl.set(normalized, uploadPivoxImageReferenceAsset({ user, model, url: normalized, name }));
    }
    return await assetUriByUrl.get(normalized);
  };

  const content = Array.isArray(payload.content) ? payload.content : [];
  for (let index = 0; index < content.length; index += 1) {
    const item = content[index];
    if (!item || item.type !== "image_url") continue;
    const url = nestedMediaUrl(item.image_url);
    const assetUri = await toAssetUri(url, `content-image-${index + 1}`);
    if (assetUri) item.image_url = { ...(item.image_url || {}), url: assetUri };
  }
  if (Array.isArray(payload.reference_images) && payload.reference_images.length) {
    const refs = [];
    for (let index = 0; index < payload.reference_images.length; index += 1) {
      const assetUri = await toAssetUri(payload.reference_images[index], `reference-image-${index + 1}`);
      if (assetUri && !refs.includes(assetUri)) refs.push(assetUri);
    }
    payload.reference_images = refs;
  }
  return payload;
}

function avoidPivoxMixedFrameReferenceContent(content = []) {
  return content;
}

function pivoxSeedancePayloadFromBody({ config = {}, prompt = "", content = [], body = {} } = {}) {
  const payload = seedancePayloadFromBody({ config, prompt, content, body });
  const externalModel = String(payload.model || MODEL_QUALITY);
  payload.model = seedancePivoxModelForRequest(externalModel, firstPresent(body.seedanceTier, body.vipeak2Tier));
  payload.content = avoidPivoxMixedFrameReferenceContent(normalizePivoxSeedanceContent(payload.content));
  if (!payload.content.some((item) => item?.type === "text")) {
    payload.content.unshift({ type: "text", text: String(prompt || "") });
  }
  payload.reference_images = normalizePivoxUrlList(payload.reference_images);
  payload.reference_videos = normalizePivoxUrlList(payload.reference_videos);
  payload.reference_audios = normalizePivoxUrlList(payload.reference_audios);
  if (!payload.reference_images.length) delete payload.reference_images;
  if (!payload.reference_videos.length) delete payload.reference_videos;
  if (!payload.reference_audios.length) delete payload.reference_audios;
  return { payload, externalModel };
}

async function submitSeedanceVideoTask({
  config,
  prompt,
  referenceAssetUri,
  extraReferenceAssetUris = [],
  firstFrameAssetUri = "",
  lastFrameAssetUri = "",
  referenceVideoAssetUri = "",
  extraReferenceVideoAssetUris = [],
  referenceAudioAssetUris = [],
  body = {},
  slug = "",
}) {
  const content = seedanceContentFromReferences({
    prompt,
    referenceAssetUri,
    extraReferenceAssetUris,
    firstFrameAssetUri,
    lastFrameAssetUri,
    referenceVideoAssetUri,
    extraReferenceVideoAssetUris,
    referenceAudioAssetUris,
    body,
  });

  const payload = seedancePayloadFromBody({ config, prompt, content, body });
  payload.Moderation = { Strategy: "Skip" };

  if (USE_GATEWAY_UPSTREAM) {
    const gatewayBody = await gatewaySeedanceBodyFromReferences({
      config,
      prompt,
      referenceAssetUri,
      extraReferenceAssetUris,
      firstFrameAssetUri,
      lastFrameAssetUri,
      referenceVideoAssetUri,
      extraReferenceVideoAssetUris,
      referenceAudioAssetUris,
      body,
    });
    console.log(`[seedance-gateway-submit-${slug || "video"}]`, JSON.stringify(gatewayBody, null, 2));
    const task = await gatewaySubmitAdvancedTask(gatewayBody);
    return { task, payload: gatewayBody, raw: task.raw || task };
  }

  console.log(`[seedance-submit-${slug || "video"}]`, JSON.stringify(payload, null, 2));
  let raw;
  let lastSubmitError = "";
  for (let attempt = 0; attempt < 18; attempt += 1) {
    try {
      raw = await arkRequest("POST", "/contents/generations/tasks", payload);
      break;
    } catch (error) {
      lastSubmitError = error.message || String(error);
      if (!/asset is still processing|not available yet/i.test(lastSubmitError)) {
        error.upstreamPayload = payload;
        throw error;
      }
      await delay(10000);
    }
  }
  if (!raw) {
    const error = new Error(lastSubmitError || "Upstream asset still processing, Seedance submit failed.");
    error.statusCode = 502;
    throw error;
  }
  return { task: normalizeTask(raw), payload, raw };
}

async function submitPivoxSeedanceVideoTask({
  config,
  prompt,
  referenceAssetUri,
  extraReferenceAssetUris = [],
  firstFrameAssetUri = "",
  lastFrameAssetUri = "",
  referenceVideoAssetUri = "",
  extraReferenceVideoAssetUris = [],
  referenceAudioAssetUris = [],
  body = {},
  slug = "",
  user = {},
}) {
  const content = pivoxSeedanceContentFromReferences({
    prompt,
    referenceAssetUri,
    extraReferenceAssetUris,
    firstFrameAssetUri,
    lastFrameAssetUri,
    referenceVideoAssetUri,
    extraReferenceVideoAssetUris,
    referenceAudioAssetUris,
    body,
  });
  const { payload, externalModel } = pivoxSeedancePayloadFromBody({ config, prompt, content, body });
  await preparePivoxSeedancePayloadAssets(payload, { user });

  console.log(`[pivox-seedance-submit-${slug || "video"}]`, JSON.stringify({
    ...payload,
    model: payload.model,
    externalModel,
  }, null, 2));
  const raw = await pivoxRequest("POST", "/v1/video/generate", payload);
  return {
    task: normalizePivoxTask(raw),
    payload,
    raw,
    recordModel: externalModel,
    upstreamSource: "pivoxapi",
  };
}

function apizSeedanceMediaReferenceUrl(value = "") {
  const text = String(value || "").trim();
  if (!text) return "";
  if (/^asset:\/\/asset-[a-z0-9_-]+$/i.test(text)) return text;
  return publicHttpUrlForUpstream(text);
}

function normalizeApizSeedanceUrlList(value = [], limit = 9) {
  const urls = [];
  arrayFromBody(value).forEach((item) => {
    const url = apizSeedanceMediaReferenceUrl(nestedMediaUrl(item));
    if (url && !urls.includes(url) && urls.length < limit) urls.push(url);
  });
  return urls;
}

function normalizeApizSeedanceContent(content = []) {
  return (Array.isArray(content) ? content : [])
    .map((item) => normalizeSeedanceContentItem(item))
    .map((item) => {
      if (!item || typeof item !== "object" || Array.isArray(item)) return null;
      if (item.type === "text") return { ...item, text: String(item.text || "") };
      if (item.type === "image_url") {
        const url = apizSeedanceMediaReferenceUrl(nestedMediaUrl(item.image_url));
        if (!url) return null;
        return { ...item, image_url: { ...(item.image_url || {}), url } };
      }
      if (item.type === "video_url") {
        const url = apizSeedanceMediaReferenceUrl(nestedMediaUrl(item.video_url));
        if (!url) return null;
        return { ...item, video_url: { ...(item.video_url || {}), url } };
      }
      if (item.type === "audio_url") {
        const url = apizSeedanceMediaReferenceUrl(nestedMediaUrl(item.audio_url));
        if (!url) return null;
        return { ...item, audio_url: { ...(item.audio_url || {}), url } };
      }
      return item;
    })
    .filter(Boolean);
}

function addApizSeedanceUrl(list = [], value = "", limit = 9) {
  const url = apizSeedanceMediaReferenceUrl(value);
  if (url && !list.includes(url) && list.length < limit) list.push(url);
}

function apizSeedanceParamsFromPayload(payload = {}, { prompt = "", body = {} } = {}) {
  const source = { ...requestParamsFromBody(body), ...body };
  const content = normalizeApizSeedanceContent(payload.content);
  const textPrompt = content
    .filter((item) => item?.type === "text")
    .map((item) => String(item.text || ""))
    .filter(Boolean)
    .join("\n")
    .trim();
  const params = {
    model: seedanceApizModelForRequest(payload.model, firstPresent(source.seedanceTier, source.vipeak2Tier)),
    prompt: textPrompt || String(prompt || source.prompt || "").trim(),
    ratio: String(firstPresent(payload.ratio, source.ratio, source.aspect_ratio, "9:16")),
    resolution: normalizeAdvancedResolution(firstPresent(payload.resolution, source.resolution, "720p")),
    duration: clampNumber(
      firstPresent(payload.duration, source.duration, source.durationSeconds),
      advancedDurationBounds("seedance").fallback,
      advancedDurationBounds("seedance").min,
      advancedDurationBounds("seedance").max,
    ),
    generate_audio: boolFromRequest(firstPresent(payload.generate_audio, source.generate_audio, source.generateAudio), true),
  };
  const webSearchValue = firstPresent(payload.web_search, source.web_search, source.webSearch, source.parameters?.web_search, source.parameters?.webSearch);
  if (webSearchValue !== undefined) params.web_search = boolFromRequest(webSearchValue, false);
  const watermarkValue = firstPresent(payload.watermark, source.watermark, source.parameters?.watermark);
  if (watermarkValue !== undefined) params.watermark = boolFromRequest(watermarkValue, false);
  const returnLastFrame = firstPresent(payload.return_last_frame, source.return_last_frame, source.returnLastFrame);
  if (returnLastFrame !== undefined) params.return_last_frame = boolFromRequest(returnLastFrame, false);

  let firstFrameUrl = apizSeedanceMediaReferenceUrl(firstPresent(payload.image_url, source.image_url, source.imageUrl, source.firstFrameUrl, source.first_frame_url));
  let lastFrameUrl = apizSeedanceMediaReferenceUrl(firstPresent(payload.end_image_url, source.end_image_url, source.endImageUrl, source.lastFrameUrl, source.last_frame_url));
  const referenceImages = normalizeApizSeedanceUrlList([
    ...arrayFromBody(payload.reference_images),
    ...arrayFromBody(source.referenceImages),
  ], ADVANCED_SEEDANCE_REFERENCE_LIMIT);
  const referenceVideos = normalizeApizSeedanceUrlList([
    ...arrayFromBody(payload.reference_videos),
    ...arrayFromBody(source.referenceVideos),
  ], ADVANCED_SEEDANCE_VIDEO_REFERENCE_LIMIT);
  const referenceAudios = normalizeApizSeedanceUrlList([
    ...arrayFromBody(payload.reference_audios),
    ...arrayFromBody(source.referenceAudios),
  ], ADVANCED_SEEDANCE_AUDIO_REFERENCE_LIMIT);

  content.forEach((item) => {
    if (item?.type === "image_url") {
      const url = nestedMediaUrl(item.image_url);
      const role = String(item.role || "");
      if (role === "first_frame" && !firstFrameUrl) firstFrameUrl = url;
      else if (role === "last_frame" && !lastFrameUrl) lastFrameUrl = url;
      else addApizSeedanceUrl(referenceImages, url, ADVANCED_SEEDANCE_REFERENCE_LIMIT);
    } else if (item?.type === "video_url") {
      addApizSeedanceUrl(referenceVideos, nestedMediaUrl(item.video_url), ADVANCED_SEEDANCE_VIDEO_REFERENCE_LIMIT);
    } else if (item?.type === "audio_url") {
      addApizSeedanceUrl(referenceAudios, nestedMediaUrl(item.audio_url), ADVANCED_SEEDANCE_AUDIO_REFERENCE_LIMIT);
    }
  });

  if (firstFrameUrl) params.image_url = firstFrameUrl;
  if (lastFrameUrl) params.end_image_url = lastFrameUrl;
  if (referenceImages.length) params.reference_images = referenceImages;
  if (referenceVideos.length) params.reference_videos = referenceVideos;
  if (referenceAudios.length) params.reference_audios = referenceAudios;
  return params;
}

function apizSeedancePayloadFromBody({ config = {}, prompt = "", content = [], body = {} } = {}) {
  const seedancePayload = seedancePayloadFromBody({ config, prompt, content, body });
  const externalModel = String(seedancePayload.model || MODEL_QUALITY);
  const params = apizSeedanceParamsFromPayload(seedancePayload, { prompt, body });
  return {
    payload: {
      model: APIZ_SEEDANCE_MODEL_ID,
      params,
      channel: null,
    },
    externalModel,
  };
}

function isApizAssetUri(value = "") {
  return /^asset:\/\/asset-[a-z0-9_-]+$/i.test(String(value || "").trim());
}

function normalizeApizAssetUri(value = "") {
  const text = String(value || "").trim();
  if (!text) return "";
  const match = text.match(/asset:\/\/(asset-[a-z0-9_-]+)/i);
  return match ? `Asset://${match[1]}` : "";
}

function apizSeedanceAssetCacheKey(user = {}) {
  const userKey = String(user?.id || user?.username || user?.email || "default").trim().toLowerCase() || "default";
  return `${String(APIZ_SEEDANCE_MODEL_ID || "seedance").trim().toLowerCase()}:${userKey}`;
}

function apizSeedanceServiceAssetUrl(assetId = "", taskId = "") {
  const id = encodeURIComponent(String(assetId || "").trim());
  if (!id) return "";
  const task = String(taskId || "").trim();
  return `/api/v3/service-inference/assets/${id}${task ? `?task_id=${encodeURIComponent(task)}` : ""}`;
}

function apizSeedanceAssetStatusPayload(raw = {}) {
  return raw?.data && typeof raw.data === "object" ? raw.data : raw;
}

async function waitForApizSeedanceAsset(assetId = "", taskId = "") {
  const id = String(assetId || "").trim();
  if (!id) return null;
  let last = null;
  for (let attempt = 0; attempt < 12; attempt += 1) {
    if (attempt) await delay(Math.min(1000 + attempt * 500, 3500));
    const queryPath = apizSeedanceServiceAssetUrl(id, taskId);
    console.log("[apiz-seedance-service-asset-query]", JSON.stringify({ path: queryPath, assetId: id, taskId: taskId || "" }));
    last = await apizSeedanceRequest(queryPath, null, { method: "GET" });
    const data = apizSeedanceAssetStatusPayload(last);
    const status = String(firstPresent(data?.sync_status, data?.status, data?.state, last?.sync_status, last?.status, "")).toLowerCase();
    const assetError = firstPresent(data?.sync_error, data?.error?.message, data?.error, last?.sync_error, last?.error?.message, last?.error, "");
    if (["active", "completed", "complete", "success", "succeeded", "ready"].includes(status)) return last;
    if (["failed", "fail", "error"].includes(status) || assetError) {
      const error = new Error(assetError || `APIZ Seedance asset upload failed: ${id}`);
      error.statusCode = 502;
      error.code = "APIZ_SEEDANCE_ASSET_UPLOAD_FAILED";
      error.payload = last;
      throw error;
    }
  }
  const error = new Error(`APIZ Seedance asset upload did not complete: ${id}`);
  error.statusCode = 502;
  error.code = "APIZ_SEEDANCE_ASSET_UPLOAD_TIMEOUT";
  error.payload = last;
  throw error;
}

async function uploadApizSeedanceAsset({ user = {}, url = "", assetType = "Image", name = "reference-media" } = {}) {
  const sourceUrl = apizSeedanceMediaReferenceUrl(url);
  if (!sourceUrl) return "";
  const existingAssetUri = normalizeApizAssetUri(sourceUrl);
  if (existingAssetUri) return existingAssetUri;
  const normalizedType = String(assetType || "Image").trim();
  const cacheKey = `${apizSeedanceAssetCacheKey(user)}:${normalizedType.toLowerCase()}:${sourceUrl}`;
  const cachedAssetUri = APIZ_SEEDANCE_ASSET_URI_CACHE.get(cacheKey);
  if (cachedAssetUri) return cachedAssetUri;
  const mediaKey = normalizedType.toLowerCase() === "video" ? "video_url" : normalizedType.toLowerCase() === "audio" ? "audio_url" : "image_url";
  const uploadPayload = {
    [mediaKey]: sourceUrl,
    asset_type: normalizedType,
    name,
    Moderation: { Strategy: "Skip" },
  };
  console.log("[apiz-seedance-service-asset-upload]", JSON.stringify({
    path: "/api/v3/service-inference/assets",
    assetType: normalizedType,
    mediaKey,
    name,
    sourceUrl,
  }));
  const raw = await apizSeedanceRequest("/api/v3/service-inference/assets", uploadPayload);
  const assetId = String(raw?.asset_id || raw?.id || raw?.assetId || raw?.data?.asset_id || raw?.data?.id || raw?.data?.assetId || "").trim();
  const taskId = String(raw?.task_id || raw?.taskId || raw?.upload_task_id || raw?.uploadTaskId || raw?.data?.task_id || raw?.data?.taskId || raw?.data?.upload_task_id || raw?.data?.uploadTaskId || "").trim();
  const assetUri = normalizeApizAssetUri(firstPresent(raw?.asset_uri, raw?.data?.asset_uri, raw?.intl_asset_uri, raw?.data?.intl_asset_uri, ""));
  if (!assetId && !assetUri) {
    const error = new Error(`APIZ Seedance did not return asset id: ${JSON.stringify(raw || {})}`);
    error.statusCode = 502;
    error.code = "APIZ_SEEDANCE_ASSET_UPLOAD_FAILED";
    throw error;
  }
  console.log("[apiz-seedance-service-asset-upload-result]", JSON.stringify({
    assetId,
    taskId,
    assetUri,
  }));
  if (assetId) {
    try {
      await waitForApizSeedanceAsset(assetId, taskId);
    } catch (error) {
      error.sourceUrl = sourceUrl;
      error.assetId = assetId;
      error.taskId = taskId;
      error.assetUri = assetUri;
      throw error;
    }
  }
  const finalAssetUri = assetUri || `Asset://${assetId}`;
  APIZ_SEEDANCE_ASSET_URI_CACHE.set(cacheKey, finalAssetUri);
  return finalAssetUri;
}

function uniqueApizSeedanceMediaRefs(values = []) {
  return [...new Set(values.map((item) => apizSeedanceMediaReferenceUrl(item)).filter(Boolean))];
}

async function prepareApizSeedancePayloadAssets(payload = {}, { user = {} } = {}) {
  const params = payload?.params && typeof payload.params === "object" ? payload.params : null;
  if (!params) return payload;
  const imageCache = new Map();
  const toAsset = async (value = "", assetType = "Image", name = "reference-media", { optional = false } = {}) => {
    const sourceUrl = apizSeedanceMediaReferenceUrl(value);
    if (!sourceUrl) return "";
    if (!imageCache.has(`${assetType}:${sourceUrl}`)) {
      imageCache.set(`${assetType}:${sourceUrl}`, uploadApizSeedanceAsset({ user, url: sourceUrl, assetType, name }));
    }
    try {
      return await imageCache.get(`${assetType}:${sourceUrl}`);
    } catch (error) {
      if (!optional) throw error;
      console.warn("[apiz-seedance-optional-asset-skipped]", {
        name,
        assetType,
        sourceUrl,
        assetId: error?.assetId || "",
        message: error?.message || String(error),
      });
      return "";
    }
  };
  if (params.image_url) params.image_url = await toAsset(params.image_url, "Image", "first-frame");
  if (params.end_image_url) params.end_image_url = await toAsset(params.end_image_url, "Image", "last-frame");
  if (Array.isArray(params.reference_images)) {
    const refs = [];
    const sourceRefs = uniqueApizSeedanceMediaRefs(params.reference_images);
    for (let index = 0; index < sourceRefs.length; index += 1) {
      const assetUri = await toAsset(sourceRefs[index], "Image", `reference-image-${index + 1}`, { optional: true });
      if (assetUri && !refs.includes(assetUri)) refs.push(assetUri);
    }
    if (sourceRefs.length && !refs.length) {
      const error = new Error("APIZ Seedance rejected all reference images.");
      error.statusCode = 502;
      error.code = "APIZ_SEEDANCE_ASSET_UPLOAD_FAILED";
      throw error;
    }
    params.reference_images = refs;
  }
  if (Array.isArray(params.reference_videos)) {
    const refs = [];
    const sourceRefs = uniqueApizSeedanceMediaRefs(params.reference_videos);
    for (let index = 0; index < sourceRefs.length; index += 1) {
      const assetUri = await toAsset(sourceRefs[index], "Video", `reference-video-${index + 1}`, { optional: true });
      if (assetUri && !refs.includes(assetUri)) refs.push(assetUri);
    }
    if (sourceRefs.length && !refs.length) {
      const error = new Error("APIZ Seedance rejected all reference videos.");
      error.statusCode = 502;
      error.code = "APIZ_SEEDANCE_ASSET_UPLOAD_FAILED";
      throw error;
    }
    params.reference_videos = refs;
  }
  if (Array.isArray(params.reference_audios)) {
    const refs = [];
    const sourceRefs = uniqueApizSeedanceMediaRefs(params.reference_audios);
    for (let index = 0; index < sourceRefs.length; index += 1) {
      const assetUri = await toAsset(sourceRefs[index], "Audio", `reference-audio-${index + 1}`, { optional: true });
      if (assetUri && !refs.includes(assetUri)) refs.push(assetUri);
    }
    if (sourceRefs.length && !refs.length) {
      const error = new Error("APIZ Seedance rejected all reference audios.");
      error.statusCode = 502;
      error.code = "APIZ_SEEDANCE_ASSET_UPLOAD_FAILED";
      throw error;
    }
    params.reference_audios = refs;
  }
  if (Array.isArray(params.reference_images) && !params.reference_images.length) delete params.reference_images;
  if (Array.isArray(params.reference_videos) && !params.reference_videos.length) delete params.reference_videos;
  if (Array.isArray(params.reference_audios) && !params.reference_audios.length) delete params.reference_audios;
  return payload;
}

async function submitApizSeedanceVideoTask({
  config,
  prompt,
  referenceAssetUri,
  extraReferenceAssetUris = [],
  firstFrameAssetUri = "",
  lastFrameAssetUri = "",
  referenceVideoAssetUri = "",
  extraReferenceVideoAssetUris = [],
  referenceAudioAssetUris = [],
  body = {},
  slug = "",
  user = {},
}) {
  const content = pivoxSeedanceContentFromReferences({
    prompt,
    referenceAssetUri,
    extraReferenceAssetUris,
    firstFrameAssetUri,
    lastFrameAssetUri,
    referenceVideoAssetUri,
    extraReferenceVideoAssetUris,
    referenceAudioAssetUris,
    body,
  });
  const { payload, externalModel } = apizSeedancePayloadFromBody({ config, prompt, content, body });
  await prepareApizSeedancePayloadAssets(payload, { user });

  console.log(`[apiz-seedance-submit-${slug || "video"}]`, JSON.stringify({
    ...payload,
    externalModel,
  }, null, 2));
  const raw = await apizSeedanceRequest("/api/v3/tasks/create", payload);
  return {
    task: normalizeApizSeedanceTask(raw),
    payload,
    raw,
    recordModel: externalModel,
    upstreamSource: "apiz-seedance",
  };
}

function ignexSeedancePayloadFromBody({ config = {}, prompt = "", content = [], body = {} } = {}) {
  const source = { ...requestParamsFromBody(body), ...body };
  const payload = seedancePayloadFromBody({ config, prompt, content, body });
  const externalModel = String(payload.model || MODEL_QUALITY);
  payload.model = seedanceIgnexModelForRequest(payload.model, firstPresent(source.seedanceTier, source.vipeak2Tier));
  return { payload, externalModel };
}

async function submitIgnexSeedanceVideoTask({
  config,
  prompt,
  referenceAssetUri,
  extraReferenceAssetUris = [],
  firstFrameAssetUri = "",
  lastFrameAssetUri = "",
  referenceVideoAssetUri = "",
  extraReferenceVideoAssetUris = [],
  referenceAudioAssetUris = [],
  body = {},
  slug = "",
  user = {},
  db = null,
}) {
  const content = pivoxSeedanceContentFromReferences({
    prompt,
    referenceAssetUri,
    extraReferenceAssetUris,
    firstFrameAssetUri,
    lastFrameAssetUri,
    referenceVideoAssetUri,
    extraReferenceVideoAssetUris,
    referenceAudioAssetUris,
    body,
  });
  const { payload, externalModel } = ignexSeedancePayloadFromBody({ config, prompt, content, body });
  await prepareIgnexSeedancePayloadAssets(payload, { db, user });
  delete payload.Moderation;
  delete payload.moderation;
  stripSeedanceCompatibilityAliases(payload);

  console.log(`[ignex-seedance-submit-${slug || "video"}]`, JSON.stringify({
    ...payload,
    externalModel,
  }, null, 2));
  const raw = await ignexRequest("POST", "/api/v3/contents/generations/tasks", payload);
  return {
    task: normalizeIgnexTask(raw),
    payload,
    raw,
    recordModel: externalModel,
    upstreamSource: "ignex",
  };
}

function cloneJson(value) {
  if (value === undefined) return undefined;
  return JSON.parse(JSON.stringify(value));
}

function mediaUrlFromOfficialItem(item = {}, key = "image_url") {
  const value = item?.[key];
  if (typeof value === "string") return value.trim();
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return String(value.url || value.uri || value.assetUri || "").trim();
  }
  return "";
}

function setOfficialMediaUrl(item = {}, key = "image_url", url = "") {
  const current = item?.[key];
  if (current && typeof current === "object" && !Array.isArray(current)) {
    return { ...item, [key]: { ...current, url } };
  }
  return { ...item, [key]: { url } };
}

function officialSeedancePrompt(payload = {}) {
  if (typeof payload.prompt === "string" && payload.prompt.trim()) return payload.prompt.trim();
  const content = Array.isArray(payload.content) ? payload.content : [];
  return content
    .map((item) => {
      if (typeof item === "string") return item;
      if (!item || typeof item !== "object") return "";
      if (item.type === "text" || item.text !== undefined) return String(item.text || "");
      return "";
    })
    .filter(Boolean)
    .join("\n")
    .trim();
}

function officialSeedanceVideoInputsForPricing(payload = {}) {
  const content = Array.isArray(payload.content) ? payload.content : [];
  const videos = content
    .filter((item) => item && typeof item === "object" && item.type === "video_url")
    .map((item) => ({
      url: mediaUrlFromOfficialItem(item, "video_url"),
      durationSeconds: firstPresent(
        item.durationSeconds,
        item.duration,
        item.videoDurationSeconds,
        item.inputVideoSeconds,
        item.video_url?.durationSeconds,
        item.video_url?.duration,
      ),
    }))
    .filter((item) => item.url);
  return {
    ...payload,
    reference_videos: [
      ...arrayFromBody(payload.reference_videos),
      ...arrayFromBody(payload.referenceVideos),
      ...videos,
    ],
  };
}

async function prepareOfficialSeedanceImageUrl(db, user, url = "", name = "Seedance reference image") {
  const text = String(url || "").trim();
  if (!text || text.startsWith("asset://")) return text;
  let userAsset = null;
  if (/^data:image\//i.test(text)) {
    const { mime, bytes } = decodeWanMediaDataUrl(text);
    userAsset = await createUserMediaAssetFromBytes(db, user, {
      bytes,
      mime,
      name,
      fileName: `${String(name || "image").replace(/[^a-z0-9_-]+/gi, "-").slice(0, 40) || "image"}.png`,
      maxBytes: IMAGE_UPLOAD_MAX_BYTES,
    });
  } else if (isPublicHttpUrl(text)) {
    userAsset = await createUserMediaAssetFromPublicUrl(db, user, {
      url: text,
      name,
      fileName: `${String(name || "image").replace(/[^a-z0-9_-]+/gi, "-").slice(0, 40) || "image"}.png`,
    });
  }
  if (!userAsset) return text;
  const prepared = await prepareSeedanceReferenceAsset(db, userAsset, false);
  return prepared.referenceAssetUri || prepared.asset?.assetUri || text;
}

async function prepareOfficialSeedancePayloadForArk(db, user, body = {}, { prepareImages = true } = {}) {
  const source = { ...plainObject(body.params), ...cloneJson(body) };
  delete source.params;
  const payload = cloneJson(source) || {};
  payload.model = String(payload.model || MODEL_QUALITY);
  copyIfPresent(payload, source, "aspect_ratio", "ratio");
  copyIfPresent(payload, source, "durationSeconds", "duration");
  copyIfPresent(payload, source, "generateAudio", "generate_audio");
  copyIfPresent(payload, source, "webSearch", "web_search");
  copyIfPresent(payload, source, "firstFrameUrl", "image_url");
  copyIfPresent(payload, source, "first_frame_url", "image_url");
  copyIfPresent(payload, source, "imageUrl", "image_url");
  copyIfPresent(payload, source, "lastFrameUrl", "end_image_url");
  copyIfPresent(payload, source, "last_frame_url", "end_image_url");
  copyIfPresent(payload, source, "endImageUrl", "end_image_url");
  if (payload.draft !== undefined) payload.draft = boolFromRequest(payload.draft, false);
  if (payload.generate_audio !== undefined) payload.generate_audio = boolFromRequest(payload.generate_audio, false);
  if (payload.web_search !== undefined) payload.web_search = boolFromRequest(payload.web_search, false);
  if (payload.watermark !== undefined) payload.watermark = boolFromRequest(payload.watermark, false);
  if (payload.camera_fixed !== undefined) payload.camera_fixed = boolFromRequest(payload.camera_fixed, false);
  if (!Array.isArray(payload.content) || !payload.content.length) {
    const prompt = officialSeedancePrompt(payload);
    payload.content = prompt ? [{ type: "text", text: prompt }] : [];
  }
  payload.content = payload.content.map(normalizeSeedanceContentItem);

  pushSeedanceContentMedia(payload.content, "image_url", payload.image_url, "first_frame");
  pushSeedanceContentMedia(payload.content, "image_url", payload.end_image_url, "last_frame");
  [
    ...arrayFromBody(payload.reference_images),
    ...arrayFromBody(source.referenceImages),
  ].forEach((item) => {
    const url = nestedMediaUrl(item);
    pushSeedanceContentMedia(payload.content, "image_url", url, "reference_image");
  });
  [
    ...arrayFromBody(payload.reference_videos),
    ...arrayFromBody(source.referenceVideos),
  ].forEach((item) => {
    const url = nestedMediaUrl(item);
    const durationSeconds = typeof item === "object" && item ? firstPresent(item.durationSeconds, item.duration, item.video_url?.durationSeconds, item.video_url?.duration) : undefined;
    pushSeedanceContentMedia(payload.content, "video_url", url, "reference_video", { durationSeconds });
  });
  [
    ...arrayFromBody(payload.reference_audios),
    ...arrayFromBody(source.referenceAudios),
  ].forEach((item) => {
    const url = nestedMediaUrl(item);
    pushSeedanceContentMedia(payload.content, "audio_url", url, "reference_audio");
  });
  if (!prepareImages) {
    payload.content = payload.content.map((item) => {
      if (!item || typeof item !== "object" || Array.isArray(item)) return item;
      return Object.fromEntries(Object.entries(item).filter(([, value]) => value !== undefined));
    });
    return payload;
  }

  if (typeof payload.image_url === "string") {
    payload.image_url = await prepareOfficialSeedanceImageUrl(db, user, payload.image_url, "Seedance first frame");
  }
  if (typeof payload.end_image_url === "string") {
    payload.end_image_url = await prepareOfficialSeedanceImageUrl(db, user, payload.end_image_url, "Seedance last frame");
  }
  if (Array.isArray(payload.reference_images)) {
    const preparedImages = [];
    for (let index = 0; index < payload.reference_images.length; index += 1) {
      const item = payload.reference_images[index];
      const url = typeof item === "string" ? item : String(item?.url || item?.image_url || item?.assetUri || "");
      const preparedUrl = await prepareOfficialSeedanceImageUrl(db, user, url, `Seedance reference image ${index + 1}`);
      if (preparedUrl) preparedImages.push(preparedUrl);
    }
    payload.reference_images = preparedImages;
  }
  if (Array.isArray(payload.content)) {
    const preparedContent = [];
    for (let index = 0; index < payload.content.length; index += 1) {
      const item = payload.content[index];
      if (!item || typeof item !== "object" || Array.isArray(item) || item.type !== "image_url") {
        preparedContent.push(item);
        continue;
      }
      const url = mediaUrlFromOfficialItem(item, "image_url");
      const preparedUrl = await prepareOfficialSeedanceImageUrl(db, user, url, `Seedance content image ${index + 1}`);
      preparedContent.push(preparedUrl ? setOfficialMediaUrl(item, "image_url", preparedUrl) : item);
    }
    payload.content = preparedContent;
  }
  payload.content = payload.content.map((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return item;
    return Object.fromEntries(Object.entries(item).filter(([, value]) => value !== undefined));
  });
  stripSeedanceCompatibilityAliases(payload);
  return payload;
}

async function preparePivoxMediaUrlForUser(db, user, value = "", name = "Seedance media") {
  const text = String(value || "").trim();
  if (!text) return "";
  const publicUrl = publicHttpUrlForUpstream(text);
  if (publicUrl) return publicUrl;
  if (!/^data:(image|video|audio)\//i.test(text)) return "";
  const { mime, bytes } = decodeWanMediaDataUrl(text);
  const maxBytes = mime.startsWith("image/") ? IMAGE_UPLOAD_MAX_BYTES : MEDIA_UPLOAD_MAX_BYTES;
  const ext = mime.startsWith("video/") ? ".mp4" : mime.startsWith("audio/") ? ".mp3" : imageExtFromMime(mime);
  const userAsset = await createUserMediaAssetFromBytes(db, user, {
    bytes,
    mime,
    name,
    fileName: `${String(name || "media").replace(/[^a-z0-9_-]+/gi, "-").slice(0, 40) || "media"}${ext}`,
    maxBytes,
  });
  const publicAsset = await ensurePublicUrlForUserMediaAsset(db, userAsset);
  return publicHttpUrlForUserAsset(publicAsset);
}

async function prepareOfficialSeedancePayloadForPivox(db, user, body = {}, { config = {} } = {}) {
  const sourcePayload = await prepareOfficialSeedancePayloadForArk(db, user, body, { prepareImages: false });
  const prompt = officialSeedancePrompt(sourcePayload);
  const preparedContent = [];
  for (let index = 0; index < (Array.isArray(sourcePayload.content) ? sourcePayload.content : []).length; index += 1) {
    const item = sourcePayload.content[index];
    if (!item || typeof item !== "object" || Array.isArray(item) || !["image_url", "video_url", "audio_url"].includes(item.type)) {
      preparedContent.push(item);
      continue;
    }
    const key = item.type;
    const url = await preparePivoxMediaUrlForUser(db, user, mediaUrlFromOfficialItem(item, key), `Seedance content ${index + 1}`);
    if (!url) {
      const error = new Error(`${item.type || "media"} content requires a public http(s) URL for Pivoxapi.`);
      error.statusCode = 400;
      error.code = "INVALID_PIVOX_MEDIA_URL";
      throw error;
    }
    preparedContent.push(setOfficialMediaUrl(item, key, url));
  }
  sourcePayload.content = preparedContent;
  if (Array.isArray(sourcePayload.reference_images)) {
    const urls = [];
    for (let index = 0; index < sourcePayload.reference_images.length; index += 1) {
      const url = await preparePivoxMediaUrlForUser(db, user, nestedMediaUrl(sourcePayload.reference_images[index]), `Seedance reference image ${index + 1}`);
      if (url) urls.push(url);
    }
    sourcePayload.reference_images = urls;
  }
  if (Array.isArray(sourcePayload.reference_videos)) {
    const urls = [];
    for (let index = 0; index < sourcePayload.reference_videos.length; index += 1) {
      const url = await preparePivoxMediaUrlForUser(db, user, nestedMediaUrl(sourcePayload.reference_videos[index]), `Seedance reference video ${index + 1}`);
      if (url) urls.push(url);
    }
    sourcePayload.reference_videos = urls;
  }
  if (Array.isArray(sourcePayload.reference_audios)) {
    const urls = [];
    for (let index = 0; index < sourcePayload.reference_audios.length; index += 1) {
      const url = await preparePivoxMediaUrlForUser(db, user, nestedMediaUrl(sourcePayload.reference_audios[index]), `Seedance reference audio ${index + 1}`);
      if (url) urls.push(url);
    }
    sourcePayload.reference_audios = urls;
  }
  const { payload, externalModel } = pivoxSeedancePayloadFromBody({
    config,
    prompt,
    content: sourcePayload.content,
    body: sourcePayload,
  });
  await preparePivoxSeedancePayloadAssets(payload, { user });
  return { payload, externalModel, sourcePayload };
}

async function prepareOfficialSeedancePayloadForApiz(db, user, body = {}, { config = {} } = {}) {
  const sourcePayload = await prepareOfficialSeedancePayloadForArk(db, user, body, { prepareImages: false });
  const prompt = officialSeedancePrompt(sourcePayload);
  const preparedContent = [];
  for (let index = 0; index < (Array.isArray(sourcePayload.content) ? sourcePayload.content : []).length; index += 1) {
    const item = sourcePayload.content[index];
    if (!item || typeof item !== "object" || Array.isArray(item) || !["image_url", "video_url", "audio_url"].includes(item.type)) {
      preparedContent.push(item);
      continue;
    }
    const key = item.type;
    const url = await preparePivoxMediaUrlForUser(db, user, mediaUrlFromOfficialItem(item, key), `Seedance content ${index + 1}`);
    if (!url) {
      const error = new Error(`${item.type || "media"} content requires a public http(s) URL for APIZ Seedance.`);
      error.statusCode = 400;
      error.code = "INVALID_APIZ_SEEDANCE_MEDIA_URL";
      throw error;
    }
    preparedContent.push(setOfficialMediaUrl(item, key, url));
  }
  sourcePayload.content = preparedContent;
  if (Array.isArray(sourcePayload.reference_images)) {
    const urls = [];
    for (let index = 0; index < sourcePayload.reference_images.length; index += 1) {
      const url = await preparePivoxMediaUrlForUser(db, user, nestedMediaUrl(sourcePayload.reference_images[index]), `Seedance reference image ${index + 1}`);
      if (url) urls.push(url);
    }
    sourcePayload.reference_images = urls;
  }
  if (Array.isArray(sourcePayload.reference_videos)) {
    const urls = [];
    for (let index = 0; index < sourcePayload.reference_videos.length; index += 1) {
      const url = await preparePivoxMediaUrlForUser(db, user, nestedMediaUrl(sourcePayload.reference_videos[index]), `Seedance reference video ${index + 1}`);
      if (url) urls.push(url);
    }
    sourcePayload.reference_videos = urls;
  }
  if (Array.isArray(sourcePayload.reference_audios)) {
    const urls = [];
    for (let index = 0; index < sourcePayload.reference_audios.length; index += 1) {
      const url = await preparePivoxMediaUrlForUser(db, user, nestedMediaUrl(sourcePayload.reference_audios[index]), `Seedance reference audio ${index + 1}`);
      if (url) urls.push(url);
    }
    sourcePayload.reference_audios = urls;
  }
  const { payload, externalModel } = apizSeedancePayloadFromBody({
    config,
    prompt,
    content: sourcePayload.content,
    body: sourcePayload,
  });
  await prepareApizSeedancePayloadAssets(payload, { user });
  return { payload, externalModel, sourcePayload };
}

async function prepareOfficialSeedancePayloadForIgnex(db, user, body = {}, { config = {} } = {}) {
  const sourcePayload = await prepareOfficialSeedancePayloadForArk(db, user, body, { prepareImages: false });
  const prompt = officialSeedancePrompt(sourcePayload);
  const { payload, externalModel } = ignexSeedancePayloadFromBody({
    config,
    prompt,
    content: sourcePayload.content,
    body: sourcePayload,
  });
  await prepareIgnexSeedancePayloadAssets(payload, { db, user });
  delete payload.Moderation;
  delete payload.moderation;
  stripSeedanceCompatibilityAliases(payload);
  return { payload, externalModel, sourcePayload };
}

function validateOfficialSeedancePayloadBeforeCharge(payload = {}) {
  const errors = [];
  const resolution = String(payload.resolution || "720p").trim().toLowerCase();
  if (!["480p", "720p", "1080p", "4k"].includes(resolution)) errors.push("resolution must be 480p, 720p, 1080p, or 4k.");
  const duration = Number(payload.duration ?? advancedDurationBounds("seedance").fallback);
  if (!Number.isFinite(duration) || !Number.isInteger(duration) || duration < advancedDurationBounds("seedance").min || duration > advancedDurationBounds("seedance").max) {
    errors.push(`duration must be an integer from ${advancedDurationBounds("seedance").min} to ${advancedDurationBounds("seedance").max} seconds.`);
  }
  const model = String(payload.model || "").toLowerCase();
  if (model.includes("fast") && ["1080p", "4k"].includes(resolution)) errors.push("Seedance fast does not support 1080p or 4k.");
  const content = Array.isArray(payload.content) ? payload.content : [];
  const unsupportedContent = content.find((item) => item && typeof item === "object" && item.type && !["text", "image_url", "video_url", "audio_url"].includes(String(item.type)));
  if (unsupportedContent) errors.push(`unsupported content type: ${unsupportedContent.type}.`);
  const imageCount = content.filter((item) => item && item.type === "image_url").length;
  const videoCount = content.filter((item) => item && item.type === "video_url").length;
  const audioCount = content.filter((item) => item && item.type === "audio_url").length;
  if (imageCount > ADVANCED_SEEDANCE_REFERENCE_LIMIT) errors.push(`Seedance supports at most ${ADVANCED_SEEDANCE_REFERENCE_LIMIT} image inputs.`);
  if (videoCount > ADVANCED_SEEDANCE_VIDEO_REFERENCE_LIMIT) errors.push(`Seedance supports at most ${ADVANCED_SEEDANCE_VIDEO_REFERENCE_LIMIT} video inputs.`);
  if (audioCount > ADVANCED_SEEDANCE_AUDIO_REFERENCE_LIMIT) errors.push(`Seedance supports at most ${ADVANCED_SEEDANCE_AUDIO_REFERENCE_LIMIT} audio inputs.`);
  const hasFrameImage = content.some((item) => item && item.type === "image_url" && ["first_frame", "last_frame"].includes(String(item.role || "")));
  const hasReferenceMedia = content.some((item) => {
    if (!item || typeof item !== "object") return false;
    if (item.type === "video_url" || item.type === "audio_url") return true;
    return item.type === "image_url" && !["first_frame", "last_frame"].includes(String(item.role || ""));
  });
  if (hasFrameImage && hasReferenceMedia) {
    errors.push("first/last-frame image content cannot be mixed with reference image, reference video, reference audio, or draft_task content.");
  }
  if (audioCount > 0 && imageCount + videoCount < 1) errors.push("audio content must be combined with image or video content.");
  const missingMedia = content.find((item) => {
    if (!item || typeof item !== "object") return false;
    if (item.type === "image_url") return !mediaUrlFromOfficialItem(item, "image_url");
    if (item.type === "video_url") return !mediaUrlFromOfficialItem(item, "video_url");
    if (item.type === "audio_url") return !mediaUrlFromOfficialItem(item, "audio_url");
    return false;
  });
  if (missingMedia) errors.push(`${missingMedia.type || "media"} content requires a url.`);
  if (errors.length) {
    const error = new Error(errors.join(" "));
    error.statusCode = 400;
    error.code = "INVALID_SEEDANCE_REQUEST";
    throw error;
  }
}

function officialSeedanceResponseFromRecord(record = {}) {
  const videoUrl = generationRecordProviderVideoUrl(record);
  const status = record.status || "unknown";
  const usage = record.usageCompletionTokens
    ? { completion_tokens: record.usageCompletionTokens, total_tokens: record.usageCompletionTokens }
    : undefined;
  return {
    id: record.upstreamTaskId || record.taskId || "",
    task_id: record.upstreamTaskId || record.taskId || "",
    status,
    model: record.model || MODEL_QUALITY,
    content: videoUrl ? { video_url: videoUrl } : undefined,
    usage,
    error: record.error ? { message: record.error } : undefined,
    created_at: record.createdAt || "",
    updated_at: record.updatedAt || "",
  };
}

async function findOwnGenerationRecordByTaskId(auth, taskId = "") {
  const id = String(taskId || "").trim();
  if (!id) return null;
  const direct = await getGenerationRecord(id);
  if (direct && direct.userId === auth.user.id && !isSoftDeleted(direct)) return direct;
  const records = await listGenerationRecordsForUser(auth.user.id, 1000);
  return records.find((record) => record.upstreamTaskId === id && !isSoftDeleted(record)) || null;
}

async function handleVolcengineCreateGenerationTask(req, res) {
  const auth = await requireUser(req, res);
  if (!auth) return;
  if (USE_GATEWAY_UPSTREAM) {
    return sendJson(res, 503, { error: { code: "GATEWAY_MODE_NOT_SUPPORTED", message: "This route requires direct Ark upstream mode. Use /api/v3/contents/generations/tasks for external video integrations." } });
  }
  const useIgnexSeedance = seedanceIgnexEnabledForUser(auth.user);
  const useExternalSeedanceHttp = useIgnexSeedance;
  if (!ARK_API_KEY && !useExternalSeedanceHttp) {
    return sendJson(res, 503, { error: { code: "MISSING_ARK_API_KEY", message: "Seedance generation is not configured." } });
  }

  const body = await readJson(req);
  const config = await readAppConfig();
  const payloadForValidation = await prepareOfficialSeedancePayloadForArk(auth.db, auth.user, body, { prepareImages: false });
  let payload = payloadForValidation;
  const prompt = officialSeedancePrompt(payload);
  if (!prompt) {
    return sendJson(res, 400, { error: { code: "MISSING_PROMPT", message: "content text or prompt is required." } });
  }
  try {
    validateOfficialSeedancePayloadBeforeCharge(payloadForValidation);
  } catch (error) {
    return sendJson(res, error.statusCode || 400, {
      error: { code: error.code || "INVALID_SEEDANCE_REQUEST", message: error.message || "Seedance request is invalid." },
    });
  }

  const pricingBody = officialSeedanceVideoInputsForPricing(payloadForValidation);
  try {
    await validateSeedanceReferenceVideoDurationsForRequest({ urls: pricingBody.reference_videos });
  } catch (error) {
    return sendJson(res, error.statusCode || 400, {
      error: { code: error.code || "INVALID_SEEDANCE_REFERENCE_VIDEO", message: error.message || "Seedance reference video is invalid." },
    });
  }
  const requestParams = {
    ...payloadForValidation,
    provider: "seedance",
    duration: clampNumber(payloadForValidation.duration, advancedDurationBounds("seedance").fallback, advancedDurationBounds("seedance").min, advancedDurationBounds("seedance").max),
    resolution: String(payloadForValidation.resolution || "720p").toLowerCase() === "1080p"
      ? "1080p"
      : String(payloadForValidation.resolution || "720p").toLowerCase() === "480p"
      ? "480p"
      : "720p",
    ratio: normalizeVideoRatio(payloadForValidation.ratio || payloadForValidation.aspect_ratio || "9:16"),
  };
  requestParams.inputVideoSeconds = await seedanceVideoInputSecondsForPricingWithProbe(pricingBody, { requestParams });
  const rawPricing = advancedModelPricing("seedance", {
    ...requestParams,
    model: payloadForValidation.model,
    advancedPricing: config.platform?.advancedPricing,
  });
  const pricing = applyUserPricingToEstimate(rawPricing, auth.user, pricingContextForAuth(auth));
  const cost = pricing.credits;
  if (auth.user.credits < cost) {
    return sendJson(res, 402, { error: { code: "INSUFFICIENT_CREDITS", message: insufficientCreditsMessage(cost, auth.user.credits) }, cost, credits: creditsAmount(auth.user.credits) });
  }
  try {
    assertSubtokenCanSpend(auth, cost);
  } catch (error) {
    return sendJson(res, error.statusCode || 402, {
      error: { code: error.code || "SUBTOKEN_QUOTA_EXCEEDED", message: error.message || "Sub token quota is not enough." },
      ...(error.payload || {}),
    });
  }

  const fallbackTaskId = localGenerationTaskId("ark");
  const recordModel = payloadForValidation.model || MODEL_QUALITY;
  const upstreamSource = useIgnexSeedance ? "ignex" : "direct";
  if (cost > 0) {
    await chargeUserWithSubtoken(auth, {
      cost,
      type: "volcengine_generation",
      taskId: fallbackTaskId,
      meta: {
        taskId: fallbackTaskId,
        provider: "seedance",
        model: payloadForValidation.model,
        duration: requestParams.duration,
        resolution: requestParams.resolution,
        ratio: requestParams.ratio,
        inputVideoSeconds: requestParams.inputVideoSeconds || 0,
        originalCost: pricing.originalCredits,
        pricingMultiplier: pricing.userPricingMultiplier,
        pricingSource: pricing.source || "duration_rate",
      },
    });
    if (!dbEnabled()) await writeDb(auth.db);
  }

  try {
    let raw;
    let task;
    if (useIgnexSeedance) {
      const prepared = await prepareOfficialSeedancePayloadForIgnex(auth.db, auth.user, body, { config });
      payload = prepared.payload;
      console.log("[ignex-seedance-submit-volcengine]", JSON.stringify({
        ...payload,
        externalModel: prepared.externalModel,
      }, null, 2));
      raw = await ignexRequest("POST", "/api/v3/contents/generations/tasks", payload);
      task = normalizeIgnexTask(raw);
    } else {
      payload = await prepareOfficialSeedancePayloadForArk(auth.db, auth.user, body, { prepareImages: true });
      payload.Moderation = { Strategy: "Skip" };
      let lastSubmitError = "";
      for (let attempt = 0; attempt < 18; attempt += 1) {
        try {
          raw = await arkRequest("POST", "/contents/generations/tasks", payload);
          break;
        } catch (error) {
          lastSubmitError = error.message || String(error);
          if (!/asset is still processing|not available yet/i.test(lastSubmitError)) throw error;
          await delay(10000);
        }
      }
      if (!raw) {
        const error = new Error(lastSubmitError || "Upstream asset still processing, Seedance submit failed.");
        error.statusCode = 502;
        throw error;
      }
      task = normalizeTask(raw);
    }
    const taskId = fallbackTaskId;
    const submittedAt = new Date().toISOString();
    await upsertGenerationRecord({
      taskId,
      upstreamTaskId: task.taskId || "",
      status: task.status || "submitted",
      model: recordModel,
      provider: "seedance",
      upstreamSource,
      upstreamModel: useExternalSeedanceHttp ? (payload.params?.model || payload.model || "") : "",
      source: "volcengine-compatible",
      kind: "advanced-video",
      userId: auth.user.id,
      prompt,
      finalPrompt: prompt,
      params: requestParams,
      upstreamPayload: payload,
      ratio: requestParams.ratio || payload.ratio || "",
      resolution: requestParams.resolution || payload.resolution || "",
      duration: requestParams.duration || payload.duration || "",
      remoteVideoUrl: task.videoUrl || "",
      preDeductedCredits: cost,
      originalPreDeductedCredits: pricing.originalCredits,
      finalCredits: cost,
      originalFinalCredits: pricing.originalCredits,
      userPricingMultiplier: pricing.userPricingMultiplier,
      billingStatus: cost > 0 ? "settled" : "free",
      billingSettledAt: cost > 0 ? new Date().toISOString() : "",
      pricingEstimate: pricing,
      createResponse: raw,
      awaitingUpstreamTask: false,
      apiTokenId: auth.tokenRecord?.id || "",
      apiTokenName: auth.tokenRecord?.name || "",
      apiTokenType: auth.tokenRecord?.quotaType || "",
      apiTokenSource: auth.tokenSource || "",
    });
    if (useExternalSeedanceHttp) {
      return sendJson(res, 200, officialSeedanceResponseFromRecord({
        taskId,
        upstreamTaskId: task.taskId || "",
        status: task.status || "submitted",
        model: recordModel,
        remoteVideoUrl: task.videoUrl || "",
        error: task.error || "",
        createdAt: submittedAt,
        updatedAt: submittedAt,
      }));
    }
    return sendJson(res, 200, raw);
  } catch (error) {
    await upsertGenerationRecord({
      taskId: fallbackTaskId,
      status: "failed",
      model: recordModel,
      provider: "seedance",
      upstreamSource,
      upstreamModel: useExternalSeedanceHttp ? (payload?.params?.model || payload?.model || "") : "",
      source: "volcengine-compatible",
      kind: "advanced-video",
      userId: auth.user.id,
      prompt,
      finalPrompt: prompt,
      params: requestParams,
      upstreamPayload: payload,
      ratio: requestParams.ratio || payload.ratio || "",
      resolution: requestParams.resolution || payload.resolution || "",
      duration: requestParams.duration || payload.duration || "",
      error: error.message || "Upstream submit failed.",
      preDeductedCredits: cost,
      originalPreDeductedCredits: pricing.originalCredits,
      finalCredits: 0,
      originalFinalCredits: 0,
      userPricingMultiplier: pricing.userPricingMultiplier,
      billingStatus: cost > 0 ? "refunded" : "free",
      billingSettledAt: new Date().toISOString(),
      billingError: "",
      pricingEstimate: pricing,
      createResponse: error.payload || null,
      awaitingUpstreamTask: false,
      apiTokenId: auth.tokenRecord?.id || "",
      apiTokenName: auth.tokenRecord?.name || "",
      apiTokenType: auth.tokenRecord?.quotaType || "",
      apiTokenSource: auth.tokenSource || "",
    });
    if (cost > 0) {
      await changeUserCredits(auth.db, auth.user.id, cost, "volcengine_generation_submit_refund", {
        taskId: fallbackTaskId,
        provider: "seedance",
        reason: error.message || "submit failed",
      });
      await recordSubtokenAdjustment(auth, {
        taskId: fallbackTaskId,
        type: "volcengine_generation_submit_refund",
        amount: -cost,
        meta: { provider: "seedance", reason: error.message || "submit failed" },
      });
      if (!dbEnabled()) await writeDb(auth.db);
    }
    return sendJson(res, error.statusCode || 502, {
      error: {
        code: error.code || "UPSTREAM_SUBMIT_FAILED",
        message: error.message || "Upstream submit failed.",
      },
      detail: error.payload?.error?.message || error.payload?.message || "",
    });
  }
}

