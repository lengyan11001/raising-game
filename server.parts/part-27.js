function byteplusSeedanceTierFromModel(model = "") {
  const alias = seedanceModelAliasKind(model);
  if (alias) return alias;
  const normalized = String(model || "").toLowerCase();
  return normalized.includes("fast") || normalized.includes("mini") ? "fast" : "standard";
}

function byteplusV3SupportedSeedanceModel(model = "") {
  const raw = String(model || "").trim();
  if (!raw) return false;
  const compact = (value) => String(value || "").trim().toLowerCase().replace(/[\s_-]+/g, "");
  const wanted = compact(raw);
  if (!wanted) return false;
  if ([MODEL_QUALITY, MODEL_FAST, SEEDANCE_QUALITY_ENDPOINT_ID, SEEDANCE_FAST_ENDPOINT_ID]
    .map(compact)
    .filter(Boolean)
    .includes(wanted)) return true;
  if (seedanceModelAliasKind(raw)) return true;
  // Seedance 2.5 is a different product that runs on the advanced route, so reject it here
  // even though its id is Seedance-branded.
  if (wanted.includes("seedance25") || wanted.includes("seedance2.5")) return false;
  // Allow any other Seedance-branded model id so future Seedance 2.0 revisions keep working;
  // reject everything else (Wan, HappyHorse, ...) with a route hint instead of a silent async failure.
  return wanted.includes("seedance");
}

function byteplusV3TaskToAdvancedBody(body = {}, auth = {}) {
  const source = { ...requestParamsFromBody(body), ...body };
  const model = String(source.model || "").trim();
  if (!model) throw byteplusHttpError(400, "model is required.", "model");
  if (!byteplusV3SupportedSeedanceModel(model)) {
    throw byteplusHttpError(
      400,
      `model "${model}" is not supported on POST /api/v3/contents/generations/tasks. This endpoint only accepts Seedance models. Wan 3.0, Wan2.7, HappyHorse, and other video models use POST /api/advanced/generate.`,
      "model",
      "InvalidParameter.UnsupportedModel",
    );
  }
  if (!Array.isArray(source.content) || source.content.length < 1 || source.content.length > 16) {
    throw byteplusHttpError(400, "content must be an array with 1 to 16 items.", "content");
  }
  const promptParts = [];
  const target = {
    referenceImages: [],
    referenceImageAssetUris: [],
    referenceVideoUrls: [],
    referenceVideoAssetIds: [],
    referenceAudioUrls: [],
    referenceAudioAssetIds: [],
  };
  let hasFirstFrame = false;
  let hasLastFrame = false;
  let hasReferenceImage = false;
  let hasReferenceVideo = false;
  let hasReferenceAudio = false;
  let imageCount = 0;
  let videoCount = 0;
  let audioCount = 0;

  source.content.forEach((rawItem, index) => {
    const param = `content[${index}]`;
    const item = normalizeSeedanceContentItem(rawItem);
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      throw byteplusHttpError(400, `${param} must be an object.`, param);
    }
    const type = String(item.type || "").trim().toLowerCase();
    if (type === "text") {
      const text = String(item.text || "").trim();
      if (text) promptParts.push(text);
      return;
    }
    const rawRole = String(item.role || "").trim().toLowerCase();
    if (type === "image_url") {
      const role = rawRole || "reference_image";
      if (!["first_frame", "last_frame", "reference_image"].includes(role)) {
        throw byteplusHttpError(400, "image_url role must be first_frame, last_frame, or reference_image.", `${param}.role`);
      }
      const url = byteplusNestedMediaUrl(item, type);
      pushByteplusV3AssetReference(auth, target, role, url, `${param}.image_url.url`, item);
      imageCount += 1;
      hasFirstFrame = hasFirstFrame || role === "first_frame";
      hasLastFrame = hasLastFrame || role === "last_frame";
      hasReferenceImage = hasReferenceImage || role === "reference_image";
      return;
    }
    if (type === "video_url") {
      const role = rawRole || "";
      if (role !== "reference_video") {
        throw byteplusHttpError(400, "reference videos require role=reference_video.", `${param}.role`);
      }
      const url = byteplusNestedMediaUrl(item, type);
      pushByteplusV3AssetReference(auth, target, role, url, `${param}.video_url.url`, item);
      videoCount += 1;
      hasReferenceVideo = true;
      return;
    }
    if (type === "audio_url") {
      const role = rawRole || "";
      if (role !== "reference_audio") {
        throw byteplusHttpError(400, "reference audios require role=reference_audio.", `${param}.role`);
      }
      const url = byteplusNestedMediaUrl(item, type);
      pushByteplusV3AssetReference(auth, target, role, url, `${param}.audio_url.url`, item);
      audioCount += 1;
      hasReferenceAudio = true;
      return;
    }
    throw byteplusHttpError(400, `content type ${type || "(empty)"} is not supported.`, `${param}.type`);
  });

  const prompt = promptParts.join("\n").trim();
  if (!prompt) throw byteplusHttpError(400, "content must include a non-empty text prompt.", "content");
  if (imageCount > ADVANCED_SEEDANCE_REFERENCE_LIMIT) {
    throw byteplusHttpError(400, `Seedance supports at most ${ADVANCED_SEEDANCE_REFERENCE_LIMIT} image inputs.`, "content");
  }
  if (videoCount > ADVANCED_SEEDANCE_VIDEO_REFERENCE_LIMIT) {
    throw byteplusHttpError(400, `Seedance supports at most ${ADVANCED_SEEDANCE_VIDEO_REFERENCE_LIMIT} video inputs.`, "content");
  }
  if (audioCount > ADVANCED_SEEDANCE_AUDIO_REFERENCE_LIMIT) {
    throw byteplusHttpError(400, `Seedance supports at most ${ADVANCED_SEEDANCE_AUDIO_REFERENCE_LIMIT} audio inputs.`, "content");
  }
  if (hasLastFrame && !hasFirstFrame) {
    throw byteplusHttpError(400, "last_frame requires a matching first_frame image.", "content");
  }
  if ((hasFirstFrame || hasLastFrame) && (hasReferenceImage || hasReferenceVideo || hasReferenceAudio)) {
    throw byteplusHttpError(400, "first_frame and last_frame roles cannot be mixed with reference media.", "content");
  }
  if (hasReferenceAudio && !hasReferenceImage && !hasReferenceVideo) {
    throw byteplusHttpError(400, "audio_url references must be combined with at least one image_url or video_url reference.", "content");
  }

  const seedanceMode = hasFirstFrame || hasLastFrame
    ? (hasLastFrame ? "first_last_frame" : "first_frame")
    : (hasReferenceVideo || hasReferenceAudio ? "reference_video" : hasReferenceImage ? "reference_images" : "text_to_video");
  const seedanceTier = byteplusSeedanceTierFromModel(model);
  const advancedBody = {
    provider: "seedance",
    model,
    seedanceTier,
    prompt,
    seedanceMode,
    ratio: firstPresent(source.ratio, source.aspect_ratio, "9:16"),
    resolution: firstPresent(source.resolution, "720p"),
    duration: firstPresent(source.duration, source.durationSeconds, 5),
    generate_audio: boolFromRequest(firstPresent(source.generate_audio, source.generateAudio), true),
    watermark: boolFromRequest(source.watermark, false),
    parameters: plainObject(source.parameters),
  };
  [
    "callback_url",
    "return_last_frame",
    "service_tier",
    "execution_expires_after",
    "draft",
    "safety_identifier",
    "priority",
    "seed",
    "frames",
    "fps",
    "camera_fixed",
    "web_search",
  ].forEach((field) => {
    if (source[field] !== undefined) advancedBody[field] = source[field];
  });
  if (target.image_url) advancedBody.image_url = target.image_url;
  if (target.end_image_url) advancedBody.end_image_url = target.end_image_url;
  if (target.firstFrameAssetId) advancedBody.firstFrameAssetId = target.firstFrameAssetId;
  if (target.endImageAssetId) advancedBody.endImageAssetId = target.endImageAssetId;
  if (target.referenceImages.length) advancedBody.referenceImages = target.referenceImages;
  if (target.referenceImageAssetUris.length) advancedBody.referenceImageAssetUris = target.referenceImageAssetUris;
  if (target.referenceVideoUrls.length) advancedBody.referenceVideoUrls = target.referenceVideoUrls;
  if (target.referenceVideoAssetIds.length) advancedBody.referenceVideoAssetIds = target.referenceVideoAssetIds;
  if (target.referenceAudioUrls.length) advancedBody.referenceAudioUrls = target.referenceAudioUrls;
  if (target.referenceAudioAssetIds.length) advancedBody.referenceAudioAssetIds = target.referenceAudioAssetIds;
  return advancedBody;
}

function byteplusTaskStatus(status = "") {
  const normalized = String(status || "").trim().toLowerCase();
  if (isSucceededStatus(normalized)) return "succeeded";
  if (isFailedStatus(normalized)) return "failed";
  if (["running", "processing"].includes(normalized)) return "running";
  if (["cancelled", "canceled", "expired"].includes(normalized)) return normalized === "canceled" ? "cancelled" : normalized;
  return "queued";
}

function unixSecondsFromIso(value = "") {
  const ms = Date.parse(String(value || ""));
  return Number.isFinite(ms) ? Math.floor(ms / 1000) : Math.floor(Date.now() / 1000);
}

function usageFromGenerationRecord(record = {}) {
  const candidates = [
    record.queryResponse?.usage,
    record.createResponse?.usage,
    record.queryResponse?.data?.usage,
    record.createResponse?.data?.usage,
    record.queryResponse?.task?.usage,
    record.createResponse?.task?.usage,
  ].filter(Boolean);
  const usage = candidates.find((item) => item && typeof item === "object") || {};
  const completion = Number(firstPresent(usage.completion_tokens, usage.completionTokens, usage.total_tokens, usage.totalTokens, record.pricingEstimate?.outputTokens));
  if (!Number.isFinite(completion) || completion <= 0) return undefined;
  return { completion_tokens: completion, total_tokens: completion };
}

function byteplusTaskFromRecord(record = {}, options = {}) {
  const publicRecord = publicGenerationRecord(record, options);
  const status = byteplusTaskStatus(publicRecord.status);
  const params = publicRecord.params && typeof publicRecord.params === "object" ? publicRecord.params : {};
  const response = {
    id: publicRecord.taskId || record.taskId || "",
    model: publicRecord.model || params.model || "",
    status,
    created_at: unixSecondsFromIso(publicRecord.createdAt || record.createdAt),
    updated_at: unixSecondsFromIso(publicRecord.updatedAt || record.updatedAt || record.createdAt),
    generate_audio: boolFromRequest(firstPresent(params.generate_audio, params.generateAudio), true),
    seed: firstPresent(params.seed, -1),
    resolution: publicRecord.resolution || params.resolution || "720p",
    ratio: publicRecord.ratio || params.ratio || "9:16",
    duration: publicRecord.duration || params.duration || 5,
    framespersecond: Number(firstPresent(params.fps, params.framespersecond, 24)),
    priority: Number(firstPresent(params.priority, 0)),
    draft: boolFromRequest(params.draft, false),
    service_tier: String(params.service_tier || "default"),
    execution_expires_after: Number(firstPresent(params.execution_expires_after, 172800)),
  };
  if (status === "succeeded") {
    const content = {};
    if (publicRecord.videoUrl || publicRecord.downloadUrl) content.video_url = publicRecord.videoUrl || publicRecord.downloadUrl;
    if (publicRecord.imageResultUrl) content.image_url = publicRecord.imageResultUrl;
    if (Array.isArray(publicRecord.imageResultUrls) && publicRecord.imageResultUrls.length) {
      content.image_urls = publicRecord.imageResultUrls;
      response.data = publicRecord.imageResultUrls.map((url) => ({ url }));
    }
    if (Object.keys(content).length) response.content = content;
    const usage = usageFromGenerationRecord(record);
    if (usage) response.usage = usage;
  }
  if (status === "failed") {
    response.error = {
      code: publicRecord.error ? "TaskFailed" : "500",
      message: publicRecord.error || "Task failed",
    };
  }
  return response;
}

async function handleByteplusV3CreateTask(req, res) {
  const auth = await requireUser(req, res);
  if (!auth) return;
  try {
    const body = await readJson(req);
    const advancedBody = byteplusV3TaskToAdvancedBody(body, auth);
    const captured = captureJsonResponse();
    await handleAdvancedGenerate(withJsonBody(req, advancedBody), captured);
    const payload = capturedJsonPayload(captured);
    if (captured.statusCode >= 400 || !payload?.taskId) {
      return sendByteplusError(res, captured.statusCode || 400, {
        code: payload?.code || payload?.error?.code || "InvalidParameter",
        message: payload?.message || payload?.error?.message || "Failed to create task.",
        param: payload?.param || payload?.error?.param || "",
        byteplusError: payload?.error ? payload : null,
      });
    }
    return sendJson(res, 200, { id: payload.taskId });
  } catch (error) {
    return sendByteplusError(res, error.statusCode || 400, error);
  }
}

async function handleByteplusV3GetTask(req, res, taskId) {
  const auth = await requireUser(req, res);
  if (!auth) return;
  const captured = captureJsonResponse();
  await handleGetGenerationRecord(req, captured, taskId);
  const payload = capturedJsonPayload(captured);
  if (captured.statusCode >= 400 || !payload?.record) {
    return sendByteplusError(res, captured.statusCode || 404, {
      code: payload?.code || "ResourceNotFound",
      message: payload?.message || "Task not found.",
      byteplusError: payload?.error ? payload : null,
    });
  }
  const record = await getGenerationRecord(taskId);
  return sendJson(res, 200, byteplusTaskFromRecord(record || payload.record, generationRecordResponseOptionsForAuth(auth)));
}

function byteplusV3ImageGenerationToAdvancedBody(body = {}) {
  const source = { ...requestParamsFromBody(body), ...body };
  const model = String(source.model || "").trim();
  if (!model) throw byteplusHttpError(400, "model is required.", "model");
  const qwenTier = normalizeQwenImage3Tier("", model);
  const qwenModel = qwenImage3ModelForTier(qwenTier, model);
  if (model === QWEN_IMAGE3_MODELS.pro || model === QWEN_IMAGE3_MODELS.standard) {
    const prompt = String(source.prompt || "").trim();
    if (!prompt) throw byteplusHttpError(400, "prompt is required.", "prompt");
    const advancedBody = {
      provider: "qwen-image3",
      model: qwenModel,
      qwenTier,
      prompt,
      resolution: normalizeQwenImage3Resolution(firstPresent(source.resolution, "2K")),
      size: firstPresent(source.size, source.resolution, "2K"),
      ratio: firstPresent(source.ratio, source.aspect_ratio, "1:1"),
      n: firstPresent(source.n, 1),
      negative_prompt: String(firstPresent(source.negative_prompt, source.negativePrompt, "")),
      prompt_extend: boolFromRequest(firstPresent(source.prompt_extend, source.promptExtend), true),
      prompt_extend_mode: firstPresent(source.prompt_extend_mode, source.promptExtendMode, "direct"),
      watermark: boolFromRequest(source.watermark, false),
    };
    if (source.seed !== undefined) advancedBody.seed = source.seed;
    [
      "image", "images", "imageUrls", "image_urls", "referenceImages", "reference_images",
      "referenceImageUrls", "reference_image_urls", "imageAssetId", "imageAssetIds",
      "referenceImageAssetId", "referenceImageAssetIds", "assetId", "assetIds", "userAssetId", "userAssetIds",
    ].forEach((field) => {
      if (source[field] !== undefined) advancedBody[field] = source[field];
    });
    return advancedBody;
  }
  const resolvedModel = seedream5ModelForTier(model, "pro");
  if (resolvedModel !== SEEDREAM5_PRO_ENDPOINT_ID) {
    throw byteplusHttpError(400, "model must be seedream-5.0-pro.", "model", "InvalidParameter.UnsupportedModel");
  }
  const prompt = String(source.prompt || "").trim();
  if (!prompt) throw byteplusHttpError(400, "prompt is required.", "prompt");
  const resolution = normalizeSeedream5Resolution(firstPresent(source.size, source.resolution, "2K"));
  const advancedBody = {
    provider: "seedream5-image",
    model: resolvedModel,
    seedreamTier: "pro",
    prompt,
    resolution,
    size: resolution,
    watermark: boolFromRequest(source.watermark, false),
  };
  [
    "image",
    "images",
    "imageUrls",
    "image_urls",
    "referenceImages",
    "reference_images",
    "referenceImageUrls",
    "reference_image_urls",
    "imageAssetId",
    "imageAssetIds",
    "referenceImageAssetId",
    "referenceImageAssetIds",
    "assetId",
    "assetIds",
    "userAssetId",
    "userAssetIds",
  ].forEach((field) => {
    if (source[field] !== undefined) advancedBody[field] = source[field];
  });
  const outputFormat = normalizeSeedream5OutputFormat(firstPresent(source.output_format, source.outputFormat));
  const optimizePromptOptions = normalizeSeedream5OptimizePromptOptions(firstPresent(source.optimize_prompt_options, source.optimizePromptOptions));
  if (outputFormat) advancedBody.output_format = outputFormat;
  if (optimizePromptOptions) advancedBody.optimize_prompt_options = optimizePromptOptions;
  return advancedBody;
}

async function handleByteplusV3ImageGeneration(req, res) {
  const auth = await requireUser(req, res);
  if (!auth) return;
  try {
    const body = await readJson(req);
    const advancedBody = byteplusV3ImageGenerationToAdvancedBody(body);
    if (publicAliyunModelBlockedForRequest(req, advancedBody.provider)) return sendPublicAliyunModelUnavailable(res);
    const captured = captureJsonResponse();
    if (advancedBody.provider === "qwen-image3") {
      await handleAdvancedQwenImage3Generate(withJsonBody(req, advancedBody), captured, { auth });
    } else {
      await handleAdvancedSeedream5ImageGenerate(withJsonBody(req, advancedBody), captured, { auth });
    }
    const payload = capturedJsonPayload(captured);
    if (captured.statusCode >= 400 || !payload?.taskId) {
      return sendByteplusError(res, captured.statusCode || 400, {
        code: payload?.code || payload?.error?.code || "InvalidParameter",
        message: payload?.message || payload?.error?.message || "Failed to generate image.",
        param: payload?.param || payload?.error?.param || "",
        byteplusError: payload?.error ? payload : null,
      });
    }
    const record = payload.record || publicGenerationRecord(await getGenerationRecord(payload.taskId) || { taskId: payload.taskId }, generationRecordResponseOptionsForAuth(auth));
    const status = byteplusTaskStatus(record.status || "queued");
    const rawImageUrl = payload.imageUrl || record.imageResultUrl || record.imageUrl || record.downloadUrl || "";
    const imageUrl = rawImageUrl ? (publicUrlForAssetPath(rawImageUrl) || absoluteUrlFromBase(rawImageUrl, publicOriginFromRequest(req)) || rawImageUrl) : "";
    const data = status === "succeeded" && imageUrl ? [{ url: imageUrl }] : [];
    return sendJson(res, 200, {
      created: Math.floor(Date.now() / 1000),
      id: payload.taskId,
      task_id: payload.taskId,
      model: advancedBody.model,
      object: "image.generation.task",
      status,
      data,
    });
  } catch (error) {
    return sendByteplusError(res, error.statusCode || 400, error);
  }
}

function byteplusActionEnvelope(action = "", result = {}) {
  return {
    ResponseMetadata: {
      RequestId: byteplusRequestId(),
      Action: action,
      Version: "2024-01-01",
      Service: "ark",
      Region: "ap-southeast-1",
    },
    Result: result,
  };
}

function byteplusActionErrorPayload(action = "", statusCode = 400, message = "Invalid parameter.", code = "InvalidParameter", param = "") {
  return {
    ResponseMetadata: {
      RequestId: byteplusRequestId(),
      Action: action,
      Version: "2024-01-01",
      Service: "ark",
      Region: "ap-southeast-1",
      Error: {
        Code: code,
        Message: message,
        Data: {
          "__Message.parameter": param,
        },
      },
    },
  };
}

function byteplusAssetGroupsKey(userId = "") {
  return `byteplus_asset_groups:${String(userId || "").trim()}`;
}

async function listByteplusAssetGroups(userId = "") {
  const groups = await getKv(byteplusAssetGroupsKey(userId), []);
  return Array.isArray(groups) ? groups : [];
}

async function saveByteplusAssetGroups(userId = "", groups = []) {
  await setKv(byteplusAssetGroupsKey(userId), Array.isArray(groups) ? groups : []);
}

function byteplusAssetTypeFromMime(mime = "") {
  const normalized = String(mime || "").toLowerCase();
  if (normalized.startsWith("video/")) return "Video";
  if (normalized.startsWith("audio/")) return "Audio";
  return "Image";
}

function byteplusAssetTypeFromUrl(url = "", explicitType = "") {
  const requested = String(explicitType || "").trim();
  if (requested) return requested;
  let pathname = "";
  try {
    pathname = new URL(String(url || "")).pathname;
  } catch {}
  if (videoMimeFromKnownPath(pathname)) return "Video";
  if (audioMimeFromKnownPath(pathname)) return "Audio";
  return "Image";
}

function byteplusMimeForUpstreamAsset(assetType = "Image", sourceUrl = "") {
  let pathname = "";
  try {
    pathname = new URL(String(sourceUrl || "")).pathname;
  } catch {}
  if (assetType === "Video") return videoMimeFromKnownPath(pathname) || "video/mp4";
  if (assetType === "Audio") return audioMimeFromKnownPath(pathname) || "audio/mpeg";
  return imageMimeFromKnownPath(pathname) || "image/jpeg";
}

async function createByteplusUpstreamAsset(payload = {}) {
  if (USE_GATEWAY_UPSTREAM) {
    const response = await gatewayRequest("POST", "/?Action=CreateAsset&Version=2024-01-01", payload);
    return response?.Result || response;
  }
  return arkOpenApiAction("CreateAsset", payload);
}

async function registerByteplusUpstreamAsset(auth, {
  assetId = "",
  assetType = "Image",
  sourceUrl = "",
  name = "",
  groupId = "",
  moderation = null,
  projectName = "default",
} = {}) {
  const id = String(assetId || "").trim();
  const now = new Date().toISOString();
  const existing = (auth.db.userAssets || []).find((asset) => asset.id === id) || null;
  if (existing && existing.userId !== auth.user.id) {
    throw byteplusHttpError(409, "The upstream asset id is already registered.", "Id", "Conflict.asset_id");
  }
  const assetUri = `asset://${id}`;
  const asset = {
    ...(existing || {}),
    id,
    userId: auth.user.id,
    username: auth.user.username || "",
    name: String(name || path.basename(new URL(sourceUrl).pathname) || id).slice(0, 64),
    mime: byteplusMimeForUpstreamAsset(assetType, sourceUrl),
    localUrl: "",
    publicUrl: sourceUrl,
    sourceUrl,
    originalUrl: sourceUrl,
    assetUri,
    assetId: id,
    seedanceVideoAssetId: assetType === "Video" ? id : "",
    seedanceVideoAssetUri: assetType === "Video" ? assetUri : "",
    seedanceAudioAssetId: assetType === "Audio" ? id : "",
    seedanceAudioAssetUri: assetType === "Audio" ? assetUri : "",
    byteplusUpstreamAsset: true,
    byteplusGroupId: groupId,
    upstreamCreatedAt: now,
    createdAt: existing?.createdAt || now,
    updatedAt: now,
    deletedAt: "",
    meta: {
      ...(existing?.meta && typeof existing.meta === "object" ? existing.meta : {}),
      byteplusUpstreamAsset: true,
      byteplusGroupId: groupId,
      Moderation: moderation || { Strategy: "Skip" },
      ProjectName: projectName,
    },
  };
  auth.db.userAssets = existing
    ? auth.db.userAssets.map((entry) => (entry.id === id ? asset : entry))
    : [asset, ...(auth.db.userAssets || [])];
  if (dbEnabled()) await upsertUserAssetInDb(asset);
  else await writeDb(auth.db);
  return asset;
}

function byteplusAssetGroupId(asset = {}) {
  return String(asset.byteplusGroupId || asset.groupId || asset.meta?.byteplusGroupId || asset.meta?.GroupId || "").trim();
}

function byteplusAssetView(asset = {}) {
  return {
    Id: String(asset.id || ""),
    Name: String(asset.name || ""),
    URL: String(asset.publicUrl || asset.cdnUrl || asset.localUrl || asset.sourceUrl || ""),
    AssetType: byteplusAssetTypeFromMime(asset.mime),
    GroupId: byteplusAssetGroupId(asset),
    Status: isSoftDeleted(asset) ? "Deleted" : "Active",
    Moderation: asset.meta?.Moderation || asset.meta?.moderation || { Strategy: "Default" },
    ProjectName: String(asset.meta?.ProjectName || asset.meta?.projectName || "default"),
    CreateTime: String(asset.createdAt || ""),
    UpdateTime: String(asset.updatedAt || asset.createdAt || ""),
  };
}

function byteplusGroupView(group = {}) {
  return {
    Id: String(group.Id || group.id || ""),
    Name: String(group.Name || group.name || ""),
    Description: String(group.Description || group.description || ""),
    GroupType: String(group.GroupType || group.groupType || "AIGC"),
    ProjectName: String(group.ProjectName || group.projectName || "default"),
    CreateTime: String(group.CreateTime || group.createdAt || ""),
    UpdateTime: String(group.UpdateTime || group.updatedAt || group.createdAt || ""),
  };
}

async function handleByteplusAssetAction(req, res, url) {
  const action = String(url.searchParams.get("Action") || url.searchParams.get("action") || "").trim();
  const auth = await requireUser(req, res);
  if (!auth) return;
  try {
    const queryBody = Object.fromEntries(url.searchParams.entries());
    delete queryBody.Action;
    delete queryBody.action;
    delete queryBody.Version;
    delete queryBody.version;
    const rawBody = req.method === "GET" ? {} : await readJson(req);
    const body = { ...queryBody, ...(rawBody && typeof rawBody === "object" && !Array.isArray(rawBody) ? rawBody : {}) };
    const nowIso = new Date().toISOString();
    const actionKey = action.toLowerCase();
    if (actionKey === "createassetgroup") {
      const name = String(body.Name || body.name || "").trim();
      if (!name) throw byteplusHttpError(400, "Name is required.", "Name");
      const group = {
        Id: localGenerationTaskId("group"),
        Name: name.slice(0, 64),
        Description: String(body.Description || body.description || "").slice(0, 300),
        GroupType: String(body.GroupType || body.groupType || "AIGC") || "AIGC",
        ProjectName: String(body.ProjectName || body.projectName || "default") || "default",
        CreateTime: nowIso,
        UpdateTime: nowIso,
      };
      const groups = await listByteplusAssetGroups(auth.user.id);
      groups.unshift(group);
      await saveByteplusAssetGroups(auth.user.id, groups);
      return sendJson(res, 200, byteplusActionEnvelope("CreateAssetGroup", { Id: group.Id }));
    }
    if (actionKey === "getassetgroup") {
      const id = String(body.Id || body.id || "").trim();
      const group = (await listByteplusAssetGroups(auth.user.id)).find((item) => String(item.Id || item.id) === id && !item.DeletedAt);
      if (!group) return sendJson(res, 404, byteplusActionErrorPayload("GetAssetGroup", 404, `The specified asset group ${id} is not found.`, "NotFound.group_id", "Id"));
      return sendJson(res, 200, byteplusActionEnvelope("GetAssetGroup", byteplusGroupView(group)));
    }
    if (actionKey === "listassetgroups") {
      const pageNumber = Math.max(1, Number(body.PageNumber || body.page || 1));
      const pageSize = Math.min(100, Math.max(1, Number(body.PageSize || body.pageSize || 10)));
      const filter = body.Filter && typeof body.Filter === "object" ? body.Filter : {};
      const wantedIds = new Set(arrayFromBody(filter.GroupIds).map((item) => String(item || "").trim()).filter(Boolean));
      const name = String(filter.Name || "").trim().toLowerCase();
      const groups = (await listByteplusAssetGroups(auth.user.id))
        .filter((item) => !item.DeletedAt)
        .filter((item) => !wantedIds.size || wantedIds.has(String(item.Id || item.id || "")))
        .filter((item) => !name || String(item.Name || item.name || "").toLowerCase().includes(name))
        .map(byteplusGroupView);
      const start = (pageNumber - 1) * pageSize;
      return sendJson(res, 200, byteplusActionEnvelope("ListAssetGroups", {
        TotalCount: groups.length,
        Items: groups.slice(start, start + pageSize),
        PageNumber: pageNumber,
        PageSize: pageSize,
      }));
    }
    if (actionKey === "updateassetgroup") {
      const id = String(body.Id || body.id || "").trim();
      const groups = await listByteplusAssetGroups(auth.user.id);
      const index = groups.findIndex((item) => String(item.Id || item.id) === id && !item.DeletedAt);
      if (index < 0) return sendJson(res, 404, byteplusActionErrorPayload("UpdateAssetGroup", 404, `The specified asset group ${id} is not found.`, "NotFound.group_id", "Id"));
      groups[index] = {
        ...groups[index],
        Name: body.Name !== undefined ? String(body.Name || "").slice(0, 64) : groups[index].Name,
        Description: body.Description !== undefined ? String(body.Description || "").slice(0, 300) : groups[index].Description,
        UpdateTime: nowIso,
      };
      await saveByteplusAssetGroups(auth.user.id, groups);
      return sendJson(res, 200, byteplusActionEnvelope("UpdateAssetGroup", { Id: id }));
    }
    if (actionKey === "deleteassetgroup") {
      const id = String(body.Id || body.id || "").trim();
      const groups = await listByteplusAssetGroups(auth.user.id);
      const index = groups.findIndex((item) => String(item.Id || item.id) === id && !item.DeletedAt);
      if (index < 0) return sendJson(res, 404, byteplusActionErrorPayload("DeleteAssetGroup", 404, `The specified asset group ${id} is not found.`, "NotFound.group_id", "Id"));
      groups[index] = { ...groups[index], DeletedAt: nowIso, UpdateTime: nowIso };
      await saveByteplusAssetGroups(auth.user.id, groups);
      return sendJson(res, 200, byteplusActionEnvelope("DeleteAssetGroup", { Id: id }));
    }
    if (actionKey === "createasset") {
      const sourceUrl = String(body.URL || body.Url || body.url || "").trim();
      if (!sourceUrl) throw byteplusHttpError(400, "URL is required.", "URL");
      if (!isPublicHttpUrl(sourceUrl)) throw byteplusHttpError(400, "URL must be a public http(s) URL.", "URL");
      const assetType = byteplusAssetTypeFromUrl(sourceUrl, body.AssetType || body.assetType);
      if (assetType && !["Image", "Video", "Audio"].includes(assetType)) {
        throw byteplusHttpError(400, "AssetType must be Image, Video, or Audio.", "AssetType");
      }
      const groupId = String(body.GroupId || body.groupId || "").trim();
      const moderation = body.Moderation || body.moderation || { Strategy: "Skip" };
      const projectName = String(body.ProjectName || body.projectName || ARK_OPENAPI.projectName || "default");
      const assetName = String(body.Name || body.name || path.basename(new URL(sourceUrl).pathname) || "reference asset");
      const created = await createByteplusUpstreamAsset({
        GroupId: USE_GATEWAY_UPSTREAM ? "" : ARK_OPENAPI.groupId,
        URL: sourceUrl,
        AssetType: assetType,
        Moderation: moderation,
        Name: assetName,
        ProjectName: USE_GATEWAY_UPSTREAM ? "" : ARK_OPENAPI.projectName,
      });
      const assetId = extractAssetId(created);
      if (!assetId) throw byteplusHttpError(502, "Upstream CreateAsset did not return an asset id.", "Result.Id", "Upstream.InvalidResponse");
      await registerByteplusUpstreamAsset(auth, {
        assetId,
        assetType,
        sourceUrl,
        name: assetName,
        groupId,
        moderation,
        projectName,
      });
      return sendJson(res, 200, byteplusActionEnvelope("CreateAsset", { Id: assetId }));
    }
    if (actionKey === "getasset") {
      const id = String(body.Id || body.id || "").trim();
      const asset = (auth.db.userAssets || []).find((entry) => entry.id === id && entry.userId === auth.user.id && !isSoftDeleted(entry));
      if (!asset) return sendJson(res, 404, byteplusActionErrorPayload("GetAsset", 404, `The specified asset ${id} is not found.`, "NotFound.asset_id", "Id"));
      return sendJson(res, 200, byteplusActionEnvelope("GetAsset", byteplusAssetView(asset)));
    }
    if (actionKey === "listassets") {
      const pageNumber = Math.max(1, Number(body.PageNumber || body.page || 1));
      const pageSize = Math.min(100, Math.max(1, Number(body.PageSize || body.pageSize || 10)));
      const filter = body.Filter && typeof body.Filter === "object" ? body.Filter : {};
      const wantedGroups = new Set(arrayFromBody(filter.GroupIds).map((item) => String(item || "").trim()).filter(Boolean));
      const wantedStatuses = new Set(arrayFromBody(filter.Statuses).map((item) => String(item || "").trim()).filter(Boolean));
      const name = String(filter.Name || "").trim().toLowerCase();
      const type = String(filter.AssetType || filter.Type || body.AssetType || "").trim();
      const assets = (auth.db.userAssets || [])
        .filter((asset) => asset.userId === auth.user.id)
        .filter((asset) => !wantedStatuses.size ? !isSoftDeleted(asset) : wantedStatuses.has(isSoftDeleted(asset) ? "Deleted" : "Active"))
        .filter((asset) => !wantedGroups.size || wantedGroups.has(byteplusAssetGroupId(asset)))
        .filter((asset) => !type || byteplusAssetTypeFromMime(asset.mime) === type)
        .filter((asset) => !name || String(asset.name || "").toLowerCase().includes(name))
        .sort((left, right) => String(right.createdAt || "").localeCompare(String(left.createdAt || "")))
        .map(byteplusAssetView);
      const start = (pageNumber - 1) * pageSize;
      return sendJson(res, 200, byteplusActionEnvelope("ListAssets", {
        PageNumber: pageNumber,
        PageSize: pageSize,
        Items: assets.slice(start, start + pageSize),
        TotalCount: assets.length,
      }));
    }
    if (actionKey === "updateasset") {
      const id = String(body.Id || body.id || "").trim();
      const asset = (auth.db.userAssets || []).find((entry) => entry.id === id && entry.userId === auth.user.id && !isSoftDeleted(entry));
      if (!asset) return sendJson(res, 404, byteplusActionErrorPayload("UpdateAsset", 404, `The specified asset ${id} is not found.`, "NotFound.asset_id", "Id"));
      if (body.Name !== undefined) asset.name = String(body.Name || "").slice(0, 64);
      asset.updatedAt = nowIso;
      auth.db.userAssets = auth.db.userAssets.map((entry) => (entry.id === asset.id ? asset : entry));
      if (dbEnabled()) await upsertUserAssetInDb(asset);
      else await writeDb(auth.db);
      return sendJson(res, 200, byteplusActionEnvelope("UpdateAsset", { Id: id }));
    }
    if (actionKey === "deleteasset") {
      const id = String(body.Id || body.id || "").trim();
      const asset = (auth.db.userAssets || []).find((entry) => entry.id === id && entry.userId === auth.user.id);
      if (!asset || isSoftDeleted(asset)) return sendJson(res, 404, byteplusActionErrorPayload("DeleteAsset", 404, `The specified asset ${id} is not found.`, "NotFound.asset_id", "Id"));
      asset.deletedAt = nowIso;
      asset.updatedAt = nowIso;
      auth.db.userAssets = auth.db.userAssets.map((entry) => (entry.id === asset.id ? asset : entry));
      if (dbEnabled()) await upsertUserAssetInDb(asset);
      else await writeDb(auth.db);
      return sendJson(res, 200, byteplusActionEnvelope("DeleteAsset", { Id: id }));
    }
    return sendJson(res, 404, byteplusActionErrorPayload(action || "Unknown", 404, "Action not found.", "ResourceNotFound", "Action"));
  } catch (error) {
    return sendJson(res, error.statusCode || 400, byteplusActionErrorPayload(action || "Unknown", error.statusCode || 400, error.message || "Invalid parameter.", error.code || "InvalidParameter", error.param || ""));
  }
}

function seedream5ReferenceInputsFromBody(body = {}) {
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
  const assetIds = [...new Set([
    body.userAssetId,
    body.assetId,
    body.imageAssetId,
    body.referenceImageAssetId,
    ...arrayFromBody(body.userAssetIds),
    ...arrayFromBody(body.assetIds),
    ...arrayFromBody(body.imageAssetIds),
    ...arrayFromBody(body.referenceImageAssetIds),
  ].map((item) => String(item || "").trim()).filter(Boolean))];
  const inputs = uniqueSeedanceReferenceImageInputs([
    ...assetIds.map((assetId) => ({ assetId })),
    ...directInputs,
  ].filter((item) => {
    if (!item) return false;
    if (typeof item === "string") return Boolean(item.trim());
    return item.assetId || item.assetUri || item.referenceAssetUri || item.seedanceAssetUri || item.dataUrl || item.url || item.imageUrl;
  }).map((item) => {
    if (typeof item !== "string") {
      const rawAssetUri = String(item.assetUri || item.referenceAssetUri || item.seedanceAssetUri || item.url || item.imageUrl || "").trim();
      if (rawAssetUri.startsWith("asset://")) return { assetId: item.assetId || byteplusAssetIdFromUri(rawAssetUri) };
      return rawAssetUri && !item.url && !item.imageUrl ? { ...item, url: rawAssetUri } : item;
    }
    const text = item.trim();
    return text.startsWith("asset://") ? { assetId: byteplusAssetIdFromUri(text) } : text;
  }));
  if (inputs.length > ADVANCED_SEEDANCE_REFERENCE_LIMIT) {
    throw advancedValidationError("TOO_MANY_SEEDREAM_IMAGES", `Seedream 5.0 Image supports at most ${ADVANCED_SEEDANCE_REFERENCE_LIMIT} reference images.`, {
      count: inputs.length,
      max: ADVANCED_SEEDANCE_REFERENCE_LIMIT,
    });
  }
  return inputs;
}

async function createSeedream5ImageAssetUriFromUrl(url = "", name = "Seedream reference image") {
  const sourceUrl = String(url || "").trim();
  if (!sourceUrl) return "";
  if (sourceUrl.startsWith("asset://")) return sourceUrl;
  if (!isPublicHttpUrl(sourceUrl)) {
    throw advancedValidationError("SEEDREAM_REFERENCE_NOT_PUBLIC", "Seedream 5.0 Image reference must be a public URL before upstream asset upload.", { url: sourceUrl });
  }
  const cacheKey = `seedream5:image:${sourceUrl}`;
  const cached = SEEDREAM5_ASSET_URI_CACHE.get(cacheKey) || String(await getKv(cacheKey, "") || "").trim();
  if (cached) {
    SEEDREAM5_ASSET_URI_CACHE.set(cacheKey, cached);
    return cached;
  }
  const created = await arkOpenApiAction("CreateAsset", {
    GroupId: ARK_OPENAPI.groupId,
    URL: sourceUrl,
    AssetType: "Image",
    Moderation: { Strategy: "Skip" },
    Name: name || storageObjectName("seedream5", "reference"),
    ProjectName: ARK_OPENAPI.projectName,
  });
  const assetId = extractAssetId(created);
  if (!assetId) {
    const error = new Error(`CreateAsset did not return asset id: ${JSON.stringify(created)}`);
    error.statusCode = 502;
    throw error;
  }
  const assetUri = `asset://${assetId}`;
  SEEDREAM5_ASSET_URI_CACHE.set(cacheKey, assetUri);
  await setKv(cacheKey, assetUri);
  return assetUri;
}

async function createSeedream5ImageAssetUrisFromUrls(urls = [], { name = "Seedream reference image" } = {}) {
  const assetUris = [];
  for (let index = 0; index < urls.length; index += 1) {
    const sourceUrl = String(urls[index] || "").trim();
    if (!sourceUrl) continue;
    const assetUri = await createSeedream5ImageAssetUriFromUrl(sourceUrl, `${name} ${index + 1}`);
    if (assetUri && !assetUris.includes(assetUri)) assetUris.push(assetUri);
  }
  return assetUris;
}

async function prepareSeedream5ReferenceImages(db, user, body = {}) {
  const inputs = seedream5ReferenceInputsFromBody(body);
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
  const assets = await createUserImageAssetsFromInputs(db, user, localInputs, { name: "Seedream reference image" });
  const preparedAssets = [];
  const publicImageUrls = [...publicInputs];
  const upstreamImageAssetUris = [];
  for (const asset of assets) {
    validateWan27MediaKind(asset, "image", "Seedream reference image");
    const prepared = USE_GATEWAY_UPSTREAM
      ? await ensurePublicUrlForUserMediaAsset(db, asset)
      : await ensureSeedanceAssetForUserAsset(db, asset);
    const publicUrl = publicUrlForLocalAsset(prepared);
    const assetUri = String(prepared.assetUri || "").trim();
    if (!USE_GATEWAY_UPSTREAM && !assetUri.startsWith("asset://")) {
      throw advancedValidationError("SEEDREAM_REFERENCE_ASSET_UPLOAD_FAILED", "Failed to upload Seedream reference image to the upstream asset library.", { assetId: asset.id || "" });
    }
    if (publicUrl && !isPublicHttpUrl(publicUrl)) {
      throw advancedValidationError("SEEDREAM_REFERENCE_NOT_PUBLIC", "Failed to prepare Seedream reference image public URL.", { assetId: asset.id || "" });
    }
    preparedAssets.push(prepared);
    if (publicUrl) publicImageUrls.push(publicUrl);
    if (assetUri) upstreamImageAssetUris.push(assetUri);
  }
  if (!USE_GATEWAY_UPSTREAM && publicInputs.length) {
    upstreamImageAssetUris.push(...await createSeedream5ImageAssetUrisFromUrls(publicInputs, { name: "Seedream gateway reference image" }));
  }
  return {
    inputs,
    assets: preparedAssets,
    publicImageUrls: [...new Set(publicImageUrls)],
    upstreamImageAssetUris: [...new Set(upstreamImageAssetUris)],
  };
}

function seedream5OutputImageUrls(raw = {}) {
  return [
    ...collectOutputImageUrls(raw),
    ...(Array.isArray(raw?.data) ? raw.data.map((item) => item?.url || item?.image_url || item?.image) : []),
  ].map((item) => String(item || "").trim()).filter(Boolean);
}

function seedream5SubmitRetryPolicy(error) {
  const message = String(error?.message || error || "");
  const statusCode = Number(error?.statusCode || 0);
  if (/asset is still processing|not available yet/i.test(message)) {
    return { attempts: 18, waitMs: 10000, reason: "asset-processing" };
  }
  if (/timeout while downloading url|timed? out while downloading|failed to download[^\n]*(?:timeout|timed? out)/i.test(message)) {
    return { attempts: 4, waitMs: 5000, reason: "reference-download" };
  }
  if (
    [408, 425, 429, 500, 502, 503, 504, 520, 522].includes(statusCode)
    || /unexpected internal error|internal server error|temporarily unavailable/i.test(message)
  ) {
    return { attempts: 3, waitMs: 3000, reason: "upstream-transient" };
  }
  return null;
}

async function submitSeedream5ImageGeneration(payload = {}, label = "image") {
  console.log(`[seedream5-image-submit-${label || "image"}]`, JSON.stringify(payload, null, 2));
  let raw;
  let lastSubmitError = "";
  for (let attempt = 1; attempt <= 18; attempt += 1) {
    try {
      raw = await arkRequest("POST", "/images/generations", payload);
      break;
    } catch (error) {
      lastSubmitError = error.message || String(error);
      const retry = seedream5SubmitRetryPolicy(error);
      if (!retry || attempt >= retry.attempts) {
        error.upstreamPayload = payload;
        throw error;
      }
      console.warn(`[seedream5-image-submit-retry] reason=${retry.reason} attempt=${attempt}/${retry.attempts} waitMs=${retry.waitMs}`);
      await delay(retry.waitMs);
    }
  }
  if (!raw) {
    const error = new Error(lastSubmitError || "Upstream asset still processing, Seedream 5.0 Image submit failed.");
    error.statusCode = 502;
    error.upstreamPayload = payload;
    throw error;
  }
  return raw;
}

async function createSeedream5ImageDirect({
  prompt = "",
  imageUrls = [],
  resolution = "2K",
  model = "",
  tier = "pro",
  watermark = false,
  outputFormat = "",
  sequentialImageGeneration = undefined,
} = {}) {
  const finalPrompt = String(prompt || "").trim();
  if (!finalPrompt) {
    const error = new Error("Prompt is required.");
    error.statusCode = 400;
    throw error;
  }
  const preparedImageUrls = arrayFromBody(imageUrls)
    .map((url) => {
      const text = typeof url === "string" ? url : (url?.url || url?.imageUrl || url?.image_url || "");
      const trimmed = String(text || "").trim();
      if (!trimmed) return "";
      return trimmed.startsWith("/") ? (publicUrlForAssetPath(trimmed) || trimmed) : trimmed;
    })
    .filter((url) => isPublicHttpUrl(url) || String(url || "").startsWith("asset://"));
  const resolvedModel = seedream5ModelForTier(model, tier);
  const payload = {
    model: resolvedModel,
    prompt: finalPrompt,
    response_format: "url",
    size: normalizeSeedream5Resolution(resolution),
    stream: false,
    watermark: Boolean(watermark),
    Moderation: { Strategy: "Skip" },
  };
  const resolvedOutputFormat = normalizeSeedream5OutputFormat(outputFormat);
  if (resolvedOutputFormat) payload.output_format = resolvedOutputFormat;
  const sequential = seedream5SequentialImageGenerationValue(sequentialImageGeneration, { model: resolvedModel, tier });
  if (sequential) payload.sequential_image_generation = sequential;
  const imageAssetUris = await createSeedream5ImageAssetUrisFromUrls(preparedImageUrls, { name: "Seedream direct reference image" });
  const publicImageUrls = preparedImageUrls.filter((url) => isPublicHttpUrl(url));
  if (preparedImageUrls.length && !publicImageUrls.length) {
    throw advancedValidationError("SEEDREAM_REFERENCE_NOT_PUBLIC", "Seedream 5.0 Image reference must be a public URL for image generation.");
  }
  if (publicImageUrls.length) payload.image = publicImageUrls;
  const raw = await submitSeedream5ImageGeneration(payload, "direct");
  const imageUrl = seedream5OutputImageUrls(raw)[0] || "";
  if (!imageUrl) {
    const error = new Error("Seedream 5.0 Image returned no image.");
    error.statusCode = 502;
    error.payload = raw;
    throw error;
  }
  return { raw, imageUrl, payload, upstreamReferenceAssetUris: imageAssetUris };
}

async function runSeedream5ImageGenerationJob(job = {}) {
  const {
    taskId = "",
    userId = "",
    body = {},
    bodyParams = {},
    mergedProviderParameters = {},
    initialParams = {},
    model = "",
    prompt = "",
    tier = "pro",
    resolution = "2K",
    outputFormat = "",
    optimizePromptOptions = null,
    pricing = {},
    cost = 0,
  } = job;
  if (!taskId || !userId) return;

  let upstreamPayload = null;
  try {
    const db = await readGenerationJobDb(userId);
    const user = (db.users || []).find((entry) => entry.id === userId);
    if (!user) {
      const error = new Error("User not found for Seedream 5.0 Image job.");
      error.statusCode = 404;
      throw error;
    }

    const prepared = await prepareSeedream5ReferenceImages(db, user, { ...bodyParams, ...body });
    const referencePreviewUrls = prepared.assets.map((asset) => asset.localUrl || asset.publicUrl || "").filter(Boolean);
    const referencePayloadUrls = prepared.publicImageUrls.filter((url) => isPublicHttpUrl(url));
    if (prepared.inputs.length && !referencePayloadUrls.length) {
      throw advancedValidationError("SEEDREAM_REFERENCE_NOT_PUBLIC", "Failed to prepare Seedream reference image public URL.");
    }
    await upsertGenerationRecord({
      taskId,
      userAssetIds: prepared.assets.map((asset) => asset.id),
      userAssetId: prepared.assets[0]?.id || "",
      imageUrl: referencePreviewUrls[0] || "",
      imageUrls: referencePreviewUrls,
      sourceImageUrl: referencePreviewUrls[0] || "",
      sourceImageUrls: referencePreviewUrls,
      upstreamReferenceAssetUris: prepared.upstreamImageAssetUris,
      status: "running",
      params: {
        ...initialParams,
        referenceImageCount: referencePayloadUrls.length,
      },
    });

    const payload = {
      model,
      prompt,
      response_format: "url",
      size: resolution,
      stream: false,
      watermark: boolFromRequest(firstPresent(body.watermark, bodyParams.watermark, mergedProviderParameters.watermark), false),
      Moderation: { Strategy: "Skip" },
    };
    if (outputFormat) payload.output_format = outputFormat;
    if (optimizePromptOptions) payload.optimize_prompt_options = optimizePromptOptions;
    const sequential = firstPresent(
      body.sequential_image_generation,
      body.sequentialImageGeneration,
      bodyParams.sequential_image_generation,
      bodyParams.sequentialImageGeneration,
      mergedProviderParameters.sequential_image_generation,
      mergedProviderParameters.sequentialImageGeneration,
    );
    const sequentialValue = seedream5SequentialImageGenerationValue(sequential, { model, tier });
    if (sequentialValue) payload.sequential_image_generation = sequentialValue;
    if (referencePayloadUrls.length) payload.image = referencePayloadUrls;
    upstreamPayload = payload;
    await upsertGenerationRecord({ taskId, upstreamPayload });

    if (USE_GATEWAY_UPSTREAM) {
      const gatewayBody = {
        provider: "seedream5-image",
        model,
        prompt,
        resolution,
        size: resolution,
        seedreamTier: tier,
        referenceImages: referencePayloadUrls.map((url) => ({ url })),
        preservePublicMediaUrls: true,
        watermark: payload.watermark,
        ...(outputFormat ? { output_format: outputFormat } : {}),
        ...(optimizePromptOptions ? { optimize_prompt_options: optimizePromptOptions } : {}),
        ...(sequentialValue ? { sequential_image_generation: sequentialValue } : {}),
      };
      const submitted = await gatewaySubmitAdvancedTask(gatewayBody);
      if (!submitted.taskId) {
        const error = new Error("Seedream gateway did not return a task id.");
        error.statusCode = 502;
        error.payload = submitted.raw || submitted;
        throw error;
      }
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

    const raw = await submitSeedream5ImageGeneration(payload, taskId);
    const imageUrl = seedream5OutputImageUrls(raw)[0] || "";
    await upsertGenerationRecord({
      taskId,
      upstreamTaskId: String(raw.id || raw.task_id || raw.taskId || ""),
      awaitingUpstreamTask: false,
      status: imageUrl ? "succeeded" : "failed",
      upstreamPayload: payload,
      createResponse: raw,
      remoteImageUrl: imageUrl,
      error: imageUrl ? "" : "Seedream 5.0 Image returned no image.",
    });
    if (!imageUrl) {
      const error = new Error("Seedream 5.0 Image returned no image.");
      error.statusCode = 502;
      error.payload = raw;
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
  } catch (error) {
    const errorInfo = normalizeErrorPayload(error);
    console.warn("[seedream5-image-error]", taskId, errorInfo.message || error.message || error, JSON.stringify(errorInfo.payload || {}).slice(0, 1000));
    const currentRecord = await getGenerationRecord(taskId).catch(() => null);
    let refunded = cost <= 0;
    let refundError = null;
    if (cost > 0) {
      const result = await refundCreditsWithSubtoken(currentRecord || { taskId, userId }, userId, cost, "advanced_seedream5_image_refund", {
        taskId,
        error: error.message || "Seedream 5.0 Image failed.",
      }, { logTag: "seedream5-image" });
      refunded = result.refunded;
      refundError = result.error;
    }
    await upsertGenerationRecord({
      taskId,
      status: "failed",
      awaitingUpstreamTask: false,
      error: errorInfo.message || "Seedream 5.0 Image failed.",
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
  }
}

function startSeedream5ImageGenerationJob(job = {}) {
  setImmediate(() => {
    runSeedream5ImageGenerationJob(job).catch((error) => {
      console.error("[seedream5-image-job-unhandled]", job.taskId || "", error.message || error);
    });
  });
}

async function handleAdvancedSeedream5ImageGenerate(req, res, context = {}) {
  const auth = context.auth || await requireUser(req, res);
  if (!auth) return;
  if (!USE_GATEWAY_UPSTREAM && !ARK_API_KEY) {
    return sendJson(res, 503, { ok: false, code: "MISSING_ARK_API_KEY", message: "Seedream 5.0 Image generation is not configured." });
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

  const tier = normalizeSeedream5Tier(firstPresent(
    body.seedreamTier,
    body.seedream5Tier,
    bodyParams.seedreamTier,
    bodyParams.seedream5Tier,
    mergedProviderParameters.seedreamTier,
    mergedProviderParameters.seedream5Tier,
    caseParams.seedreamTier,
    caseParams.seedream5Tier,
  ));
  const resolution = normalizeSeedream5Resolution(firstPresent(
    body.resolution,
    body.size,
    bodyParams.resolution,
    bodyParams.size,
    mergedProviderParameters.resolution,
    mergedProviderParameters.size,
    caseParams.resolution,
    caseParams.size,
    config.platform?.advancedPricing?.seedream5Image?.defaultResolution,
    "2K",
  ));
  const model = seedream5ModelForTier(firstPresent(body.model, bodyParams.model, mergedProviderParameters.model, caseParams.model), tier);
  const outputFormat = normalizeSeedream5OutputFormat(firstPresent(
    body.output_format,
    body.outputFormat,
    bodyParams.output_format,
    bodyParams.outputFormat,
    mergedProviderParameters.output_format,
    mergedProviderParameters.outputFormat,
    caseParams.output_format,
    caseParams.outputFormat,
  ));
  const optimizePromptOptions = normalizeSeedream5OptimizePromptOptions(firstPresent(
    body.optimize_prompt_options,
    body.optimizePromptOptions,
    bodyParams.optimize_prompt_options,
    bodyParams.optimizePromptOptions,
    mergedProviderParameters.optimize_prompt_options,
    mergedProviderParameters.optimizePromptOptions,
    caseParams.optimize_prompt_options,
    caseParams.optimizePromptOptions,
  ));
  let referenceInputs = [];
  try {
    referenceInputs = seedream5ReferenceInputsFromBody({ ...bodyParams, ...body });
  } catch (error) {
    return sendAdvancedValidationError(res, error, "Seedream 5.0 Image reference input is invalid.");
  }
  const requestFingerprint = seedream5ImageRequestFingerprint({
    userId: auth.user.id,
    model,
    prompt,
    resolution,
    tier,
    outputFormat,
    optimizePromptOptions,
    referenceInputs,
  });
  const requestTrace = requestTraceForGeneration(req);
  return await withSeedream5ImageInFlight(requestFingerprint, async () => {
    const duplicateRecord = await findActiveSeedream5ImageDuplicate({
      userId: auth.user.id,
      fingerprint: requestFingerprint,
    });
    if (duplicateRecord) {
      const publicRecord = publicGenerationRecord(duplicateRecord, generationRecordResponseOptionsForAuth(auth));
      const duplicateDone = isSucceededStatus(duplicateRecord.status);
      return sendJson(res, 200, {
        ok: true,
        async: !duplicateDone,
        duplicate: true,
        taskId: duplicateRecord.taskId,
        upstreamTaskId: duplicateRecord.upstreamTaskId || "",
        imageUrl: publicRecord.imageResultUrl || publicRecord.imageUrl || "",
        record: publicRecord,
        message: duplicateDone ? "A matching Seedream 5.0 Image task was recently completed." : "A matching Seedream 5.0 Image task is already running.",
      });
    }
    const rawPricing = advancedModelPricing("seedream5-image", {
      advancedPricing: config.platform?.advancedPricing,
      seedreamTier: tier,
      resolution,
      model,
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
  const initialRecord = {
    taskId,
    status: "submitting",
    model,
    source: "advanced-seedream5-image",
    kind: "advanced-image",
    provider: "seedream5-image",
    upstreamSource: USE_GATEWAY_UPSTREAM ? "gateway" : "direct",
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
      provider: "seedream5-image",
      seedreamTier: tier,
      resolution,
      size: resolution,
      ...(outputFormat ? { output_format: outputFormat } : {}),
      ...(optimizePromptOptions ? { optimize_prompt_options: optimizePromptOptions } : {}),
      referenceImageCount: referenceInputs.length,
      action: referenceInputs.length ? "image_reference" : "text_to_image",
      requestFingerprint,
    },
    requestFingerprint,
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
      type: "advanced_seedream5_image",
      taskId,
      meta: {
        taskId,
        provider: "seedream5-image",
        model,
        seedreamTier: tier,
        resolution,
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

  startSeedream5ImageGenerationJob({
    taskId,
    userId: auth.user.id,
    body,
    bodyParams,
    mergedProviderParameters,
    initialParams: initialRecord.params,
    model,
    prompt,
    tier,
    resolution,
    outputFormat,
    optimizePromptOptions,
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
      provider: "seedream5-image",
      seedreamTier: tier,
      resolution,
      size: resolution,
      referenceImageCount: referenceInputs.length,
    },
  });
  });
}

