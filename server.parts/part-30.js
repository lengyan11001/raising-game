function characterVideoEntryFromGenerationRecord(record = {}, body = {}, item = {}) {
  const videoUrl = generationRecordVideoUrl(record);
  const posterUrl = String(
    record.localPosterUrl ||
    record.posterUrl ||
    record.coverUrl ||
    record.thumbnailUrl ||
    record.cdnCoverUrl ||
    record.localCoverUrl ||
    record.imageUrl ||
    record.localImageUrl ||
    item.posterUrl ||
    item.localImageUrl ||
    "",
  ).trim();
  const taskId = String(record.taskId || "").trim();
  const baseId = storagePathSegment(taskId || record.upstreamTaskId || Date.now(), "video");
  const title = String(body.title || record.templateTitle || record.sceneEntryName || record.sceneName || record.companionName || "Generated video").trim().slice(0, 80);
  const sceneId = String(body.sceneId || `record-${baseId}`).trim().slice(0, 80);
  const sceneEntryId = String(body.sceneEntryId || "default").trim() || "default";
  const nowIso = new Date().toISOString();
  return {
    sceneId,
    sceneName: title,
    sceneEntryId,
    sceneEntryName: title,
    title,
    posterUrl,
    coverUrl: posterUrl,
    thumbnailUrl: posterUrl,
    prompt: record.prompt || "",
    finalPrompt: record.finalPrompt || record.prompt || "",
    provider: record.provider || "",
    model: record.model || "",
    ratio: record.ratio || record.params?.ratio || record.params?.aspect_ratio || "",
    resolution: record.resolution || record.params?.resolution || "",
    duration: Number(record.duration || record.params?.duration || 0),
    taskId,
    upstreamTaskId: record.upstreamTaskId || "",
    status: record.status || "succeeded",
    videoUrl,
    localVideoUrl: record.localVideoUrl || "",
    remoteVideoUrl: record.remoteVideoUrl || record.videoUrl || "",
    source: "admin-generation-record",
    createdAt: nowIso,
    updatedAt: nowIso,
  };
}

async function handleAdminAttachRecordToCharacterVideo(req, res, taskId) {
  const auth = await requireAdmin(req, res);
  if (!auth) return;
  const body = await readJson(req);
  const characterId = String(body.characterId || body.itemId || "").trim();
  if (!characterId) return sendJson(res, 400, { ok: false, message: "Character is required." });
  const record = await getGenerationRecord(decodeURIComponent(taskId));
  if (!record) return sendJson(res, 404, { ok: false, message: "Generation record not found." });
  const sourceVideoUrl = generationRecordVideoUrl(record);
  if (!sourceVideoUrl) return sendJson(res, 400, { ok: false, message: "This record has no video result." });

  const config = await readAppConfig();
  config.homeVideo = normalizeHomeVideo(config.homeVideo || {});
  const item = findHomeVideoItem(config.homeVideo, characterId);
  if (!item) return sendJson(res, 404, { ok: false, message: "Character not found." });

  const entry = characterVideoEntryFromGenerationRecord(record, body, item);
  const currentVideos = item.unlockVideos && typeof item.unlockVideos === "object" ? item.unlockVideos : {};
  const existingKey = Object.entries(currentVideos).find(([, value]) => (
    String(value?.taskId || "") === String(record.taskId || "")
    || String(value?.videoUrl || value?.localVideoUrl || value?.remoteVideoUrl || "") === sourceVideoUrl
  ))?.[0];
  let videoKey = existingKey || makeSceneVideoKey(entry.sceneId, entry.sceneEntryId);
  if (!existingKey && currentVideos[videoKey]) {
    videoKey = `${videoKey}-${String(Date.now()).slice(-6)}`;
  }
  const nextUnlockVideos = { [videoKey]: entry };
  Object.entries(currentVideos).forEach(([key, value]) => {
    if (key !== videoKey) nextUnlockVideos[key] = value;
  });
  const nextItem = {
    ...item,
    unlockVideos: nextUnlockVideos,
    videoCount: Object.keys(normalizeHomeSceneVideosForItem(item)).length
      + Object.keys(item.sceneVideos || {}).length
      + Object.keys(nextUnlockVideos).length,
    updatedAt: new Date().toISOString(),
  };
  config.homeVideo = replaceHomeVideoItem(config.homeVideo, nextItem);
  await writeAppConfig(config);
  return sendJson(res, 200, { ok: true, item: nextItem, videoKey, video: entry, homeVideo: config.homeVideo });
}

async function makePlatformEstimate(template, overrides = {}, user = null, options = {}) {
  const prompt =
    typeof overrides.prompt === "string" && overrides.prompt.trim()
      ? overrides.prompt
      : template.prompt || "";
  const upstreamPayload = platformApizPayload({
    template,
    prompt,
    imageUrl: "",
    overrides: overrides.params,
  });
  const rawPricingEstimate = await estimatePlatformPreDeductCredits(upstreamPayload.model, upstreamPayload.params, template);
  const pricingEstimate = user ? applyUserPricingToEstimate(rawPricingEstimate, user, options) : rawPricingEstimate;
  const durationSeconds = durationSecondsFromParams(upstreamPayload.params) || apizPricingNumber(pricingEstimate.pricing?._default_duration_seconds) || 0;
  return {
    templateId: template.id,
    credits: creditsAmount(pricingEstimate.credits),
    baseCredits: creditsAmount(pricingEstimate.baseCredits ?? pricingEstimate.credits),
    originalCredits: pricingEstimate.originalCredits === undefined || pricingEstimate.originalCredits === null ? null : creditsAmount(pricingEstimate.originalCredits),
    userPricingMultiplier: pricingEstimate.userPricingMultiplier ?? normalizeUserPricingMultiplier(user || 1, options),
    markup: pricingEstimate.markup ?? GENERATION_PRICE_MARKUP,
    source: pricingEstimate.source,
    model: upstreamPayload.model,
    requestModel: upstreamPayload.params.model || upstreamPayload.model,
    durationSeconds,
    available: true,
  };
}

async function handlePlatformEstimates(req, res, url) {
  const auth = await getAuth(req, { loadDb: false });
  const body = req.method === "POST" ? await readJson(req) : {};
  const config = await readAppConfig();
  const requestedTemplateId = String(url.searchParams.get("templateId") || body.templateId || "").trim();
  const platform = normalizePlatformConfig(config.platform || {});
  const requestedTemplate = requestedTemplateId
    ? platform.templates.find((template) => template.id === requestedTemplateId)
    : null;
  if (requestedTemplateId && !requestedTemplate) {
    return sendJson(res, 404, { ok: false, message: "Template not found." });
  }
  if (requestedTemplate && !isExternalPlatformTemplate(requestedTemplate)) {
    return sendJson(res, 400, { ok: false, code: "TEMPLATE_NOT_GENERATABLE", message: "This template is a gallery shortcut and cannot be generated from this endpoint." });
  }
  const templates = requestedTemplate
    ? [requestedTemplate]
    : platform.templates.filter(isExternalPlatformTemplate);

  const estimates = await Promise.all(templates.map(async (template) => {
    try {
      return await makePlatformEstimate(template, requestedTemplateId === template.id ? body : {}, auth.user, pricingContextForAuth(auth));
    } catch (error) {
      return {
        templateId: template.id,
        credits: null,
        source: "",
        available: false,
        code: error.code || "PRICING_UNAVAILABLE",
        message: error.message || "Pricing is unavailable.",
      };
    }
  }));

  return sendJson(res, 200, {
    ok: true,
    userPricing: pricingMultiplierView(auth.user || 1, pricingContextForAuth(auth)),
    estimates,
  });
}

function docsJsonBlock(value) {
  return JSON.stringify(value, null, 2);
}

function markdownCodeBlock(language, value) {
  return [
    `\`\`\`${language}`,
    typeof value === "string" ? value : docsJsonBlock(value),
    "```",
  ].join("\n");
}

function markdownText(value, fallback = "") {
  return String(value || fallback || "")
    .replace(/\r?\n+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function markdownTableCell(value = "") {
  return String(value ?? "")
    .replace(/\r?\n+/g, "<br>")
    .replace(/\|/g, "\\|")
    .trim();
}

function markdownTable(headers = [], rows = []) {
  return [
    `| ${headers.map(markdownTableCell).join(" | ")} |`,
    `| ${headers.map(() => "---").join(" | ")} |`,
    ...rows.map((row) => `| ${headers.map((header) => markdownTableCell(row[header] ?? "")).join(" | ")} |`),
  ].join("\n");
}

function docsMb(bytes = 0) {
  return `${Math.round(Number(bytes || 0) / 1024 / 1024)}MB`;
}

function seedancePublicParameterFields(origin = "") {
  const uploadEndpoint = `${String(origin || "").replace(/\/$/, "")}/api/user-assets`.replace(/^\/api/, "/api");
  const imageRules = `Image inputs must be JPG/PNG/WebP/BMP, max ${docsMb(IMAGE_UPLOAD_MAX_BYTES)}, width and height each ${SEEDANCE_IMAGE_DIMENSION_MIN}-${SEEDANCE_IMAGE_DIMENSION_MAX}px, aspect ratio ${SEEDANCE_IMAGE_ASPECT_RATIO_MIN}-${SEEDANCE_IMAGE_ASPECT_RATIO_MAX}.`;
  const videoRules = `Up to ${ADVANCED_SEEDANCE_VIDEO_REFERENCE_LIMIT} videos; each video pixel count must be ${SEEDANCE_VIDEO_PIXEL_COUNT_MIN}-${SEEDANCE_VIDEO_PIXEL_COUNT_MAX}.`;
  const audioRules = `Up to ${ADVANCED_SEEDANCE_AUDIO_REFERENCE_LIMIT} audios. Audio references must be combined with image or video references; audio-only generation is rejected. Supported uploaded/data URL audio types: MP3, WAV, M4A/MP4 audio, AAC, OGG, WebM. Upload max ${docsMb(MEDIA_UPLOAD_MAX_BYTES)}.`;
  return [
    { name: uploadEndpoint, type: "endpoint", required: "No", description: `Optional reusable upload endpoint. Send url/imageUrl/videoUrl/audioUrl or dataUrl; reuse the returned asset.id. Upload limits: images max ${docsMb(IMAGE_UPLOAD_MAX_BYTES)}; video/audio max ${docsMb(MEDIA_UPLOAD_MAX_BYTES)}.`, default: "-" },
    { name: "provider", type: "string", required: "Yes", description: "Use `seedance` for Seedance video generation.", default: "seedance" },
    { name: "model", type: "string", required: "Yes", description: "`dreamina-seedance-2-0-260128` for standard or `dreamina-seedance-2-0-fast-260128` for fast. Fast supports only `480p` and `720p`.", default: "dreamina-seedance-2-0-260128" },
    { name: "prompt", type: "string", required: "Yes", description: "Non-empty video prompt. Put dialogue in quotes if synced speech should be generated.", default: "-" },
    { name: "seedanceMode", type: "string", required: "No", description: "`text_to_video`, `first_frame`, `first_last_frame`, `reference_images`, or `reference_video`. `first_frame` and `first_last_frame` cannot be mixed with referenceImages/referenceVideos/referenceAudios/raw reference content.", default: "reference_video" },
    { name: "imageUrl / firstFrameUrl / firstFrameDataUrl / dataUrl", type: "string", required: "For first_frame and first_last_frame", description: `First-frame image URL or base64 data URL. Exactly one first-frame image is required in first-frame modes. ${imageRules}`, default: "-" },
    { name: "firstFrameAssetId / imageAssetId", type: "string", required: "No", description: `Uploaded image asset id for the first frame. ${imageRules}`, default: "-" },
    { name: "endImageUrl / lastFrameUrl / endImageDataUrl", type: "string", required: "For first_last_frame", description: `Last-frame image URL or base64 data URL. Required for first_last_frame. ${imageRules}`, default: "-" },
    { name: "endImageAssetId / lastFrameAssetId", type: "string", required: "No", description: `Uploaded image asset id for the last frame. ${imageRules}`, default: "-" },
    { name: "referenceImages", type: "array", required: "For reference_images; optional for reference_video", description: `Image references. Each item may use assetId, url/imageUrl + fileName, or dataUrl + fileName. Up to ${ADVANCED_SEEDANCE_REFERENCE_LIMIT} images total. ${imageRules} Prompt labels follow array order: Image 1, Image 2, etc.`, default: "[]" },
    { name: "referenceVideoUrls", type: "array", required: "No", description: `Video reference URLs for reference_video. ${videoRules} Prompt labels follow array order: Video 1, Video 2, etc.`, default: "[]" },
    { name: "referenceVideoAssetIds", type: "array", required: "No", description: `Uploaded video asset ids for reference_video. ${videoRules}`, default: "[]" },
    { name: "referenceVideoDurationSeconds / inputVideoSeconds", type: "number", required: "No", description: "Optional known total duration of video references, in seconds. Use a positive number when supplied.", default: "0" },
    { name: "referenceAudioUrls / referenceAudioAssetIds", type: "array", required: "No", description: `${audioRules} Prompt labels follow array order: Audio 1, Audio 2, etc.`, default: "[]" },
    { name: "ratio", type: "string", required: "No", description: `Output aspect ratio in width:height format. Examples: 9:16, 16:9, 1:1. Ratio must stay between ${SEEDANCE_IMAGE_ASPECT_RATIO_MIN} and ${SEEDANCE_IMAGE_ASPECT_RATIO_MAX}.`, default: "9:16" },
    { name: "resolution", type: "string", required: "No", description: "Standard model supports `480p`, `720p`, `1080p`, `4k`; fast model supports `480p`, `720p`.", default: "720p" },
    { name: "duration", type: "integer", required: "No", description: `Video duration in seconds, integer ${advancedDurationBounds("seedance").min}-${advancedDurationBounds("seedance").max}.`, default: String(advancedDurationBounds("seedance").fallback) },
    { name: "generateAudio / generate_audio", type: "boolean", required: "No", description: "Default true. Set false to disable generated voice, effects, or background music.", default: "true" },
    { name: "prompt asset labels", type: "string", required: "No", description: "Use Image 1, Video 1, Audio 1 in prompt text when referring to uploaded/reference media. Labels follow each array's order.", default: "-" },
  ];
}

function seedancePublicParameterMarkdown(origin = "") {
  const rows = seedancePublicParameterFields(origin).map((field) => ({
    Parameter: field.name,
    Type: field.type,
    Required: String(field.required),
    Description: field.description,
    Default: field.default ?? "-",
  }));
  return markdownTable(["Parameter", "Type", "Required", "Description", "Default"], rows);
}

function docsParameterMarkdown(fields = []) {
  const rows = fields.map((field) => ({
    Parameter: field.name,
    Type: field.type,
    Required: String(field.required),
    Description: field.description,
    Default: field.default ?? "-",
  }));
  return markdownTable(["Parameter", "Type", "Required", "Description", "Default"], rows);
}

function wan27VideoParameterFields() {
  const bounds = advancedDurationBounds("wan27");
  return [
    { name: "/api/advanced/generate", type: "endpoint", required: "Yes", description: "Create an asynchronous Wan2.7 image-to-video task.", default: "-" },
    { name: "provider", type: "string", required: "Yes", description: "Use `wan27`.", default: "wan27" },
    { name: "videoCapability", type: "string", required: "Yes", description: "Use the Mulerouter node `wan2.7-i2v-spicy`.", default: "wan2.7-i2v-spicy" },
    { name: "prompt", type: "string", required: "Yes", description: "Non-empty video prompt.", default: "-" },
    { name: "firstFrameUrl / firstFrameDataUrl / firstFrameAssetId", type: "string", required: "Yes", description: `First-frame image. Use a public URL, supported data URL, or uploaded asset id. Images max ${docsMb(IMAGE_UPLOAD_MAX_BYTES)}.`, default: "-" },
    { name: "drivingAudioUrl / drivingAudioDataUrl / drivingAudioAssetId", type: "string", required: "No", description: `Optional driving audio. Use a public URL, supported data URL, or uploaded asset id. Uploaded audio max ${docsMb(MEDIA_UPLOAD_MAX_BYTES)}.`, default: "-" },
    { name: "negative_prompt / negativePrompt", type: "string", required: "No", description: "Optional negative prompt passed to the Mulerouter node.", default: "-" },
    { name: "resolution", type: "string", required: "No", description: "`720p` or `1080p`.", default: "720p" },
    { name: "duration", type: "integer", required: "No", description: `Output duration in seconds, integer ${Math.max(2, bounds.min)}-${Math.min(15, bounds.max)}.`, default: String(Math.min(5, bounds.fallback)) },
    { name: "generateAudio / generate_audio / audio", type: "boolean", required: "No", description: "Whether the output should include an audio track when supported.", default: "true" },
    { name: "seed", type: "integer", required: "No", description: "Integer from 0 to 2147483647.", default: "-" },
    { name: "prompt_extend / promptExtend", type: "boolean", required: "No", description: "Whether to enable prompt extension.", default: "true" },
    { name: "watermark", type: "boolean", required: "No", description: "Whether to add a watermark.", default: "false" },
  ];
}

function wan27ImageParameterFields() {
  return [
    { name: "/api/wan27/image-edit", type: "endpoint", required: "Yes", description: "Wan2.7 image generation/edit endpoint.", default: "-" },
    { name: "prompt", type: "string", required: "Yes", description: "Non-empty image prompt or edit instruction.", default: "-" },
    { name: "imageUrls / imageAssetIds", type: "array", required: "No", description: `0-9 reference images. Use public image URLs or uploaded image asset ids. Images max ${docsMb(IMAGE_UPLOAD_MAX_BYTES)}.`, default: "[]" },
    { name: "imageUrl / imageAssetId", type: "string", required: "No", description: "Single reference image URL or uploaded image asset id.", default: "-" },
    { name: "ratio", type: "string", required: "No", description: "`1:1`, `3:4`, `4:3`, `9:16`, or `16:9`.", default: "9:16" },
    { name: "resolution", type: "string", required: "No", description: "`1K`, `2K`, or `4K`. 4K is text-to-image only; reference-image generation supports `1K` or `2K`.", default: "2K" },
    { name: "model", type: "string", required: "No", description: "Wan image model id when explicitly supplied.", default: WAN27_IMAGE_PRO_MODEL },
    { name: "watermark", type: "boolean", required: "No", description: "Pass-through watermark flag.", default: "false" },
    { name: "async / asyncResponse / returnImmediately", type: "boolean", required: "No", description: "Return immediately with task info instead of waiting for the image result.", default: "false" },
  ];
}

function zImageSpicyProParameterFields() {
  return [
    { name: "/api/wan27/image-edit", type: "endpoint", required: "Yes", description: "Create a Z-Image Spicy Pro text-to-image task. Send no input image.", default: "-" },
    { name: "prompt", type: "string", required: "Yes", description: "Non-empty image prompt.", default: "-" },
    { name: "imageUrls / imageAssetIds", type: "array", required: "No", description: "Leave empty for text-to-image. Supplying one or more images switches the request to image editing.", default: "[]" },
    { name: "imageUrl / imageAssetId", type: "string", required: "No", description: "Leave empty for text-to-image.", default: "-" },
    { name: "ratio", type: "string", required: "No", description: "`1:1`, `3:4`, `4:3`, `9:16`, or `16:9`.", default: "9:16" },
    { name: "resolution", type: "string", required: "No", description: "`1K` or `2K`.", default: "2K" },
    { name: "size", type: "string", required: "No", description: "Explicit output size as `width*height`, for example `1440*2560`. Width and height must each stay within 256-2560px. When omitted, the platform derives it from `resolution` and `ratio`.", default: "derived from resolution + ratio" },
    { name: "model", type: "string", required: "No", description: "Optional explicit model id. The platform normally selects the serving model from the request shape, so most callers omit this field.", default: "-" },
    { name: "n", type: "integer", required: "No", description: "Number of output images. Keep it at `1`; single-image output is the supported shape for this engine.", default: "1" },
    { name: "prompt_extend", type: "boolean", required: "No", description: "Whether to expand the prompt before generation.", default: "true" },
    { name: "seed", type: "integer", required: "No", description: "Integer 0-2147483647.", default: "random" },
    { name: "watermark", type: "boolean", required: "No", description: "Whether to add a watermark.", default: "false" },
    { name: "async / asyncResponse / returnImmediately", type: "boolean", required: "No", description: "Return immediately with task info instead of waiting for the image result.", default: "false" },
  ];
}

function qwenImageEditSpicyParameterFields() {
  return [
    { name: "/api/wan27/image-edit", type: "endpoint", required: "Yes", description: "Create a Qwen Image Edit Spicy image-editing task.", default: "-" },
    { name: "prompt", type: "string", required: "Yes", description: "Non-empty edit instruction.", default: "-" },
    { name: "imageUrls / imageAssetIds", type: "array", required: "Yes", description: "1-3 images. The first image is the picture being edited; the remaining ones are optional references. Use public image URLs or uploaded image asset ids.", default: "[]" },
    { name: "imageUrl / imageAssetId", type: "string", required: "Yes", description: "Single input image URL or uploaded image asset id.", default: "-" },
    { name: "ratio", type: "string", required: "No", description: "`1:1`, `3:4`, `4:3`, `9:16`, or `16:9`. The output size also follows the input image.", default: "9:16" },
    { name: "resolution", type: "string", required: "No", description: "`1K` or `2K`.", default: "2K" },
    { name: "size", type: "string", required: "No", description: "Explicit output size as `width*height`. When omitted, the platform derives it from `resolution` and `ratio`.", default: "derived from resolution + ratio" },
    { name: "model", type: "string", required: "No", description: "Optional explicit model id. The platform normally selects the serving model from the request shape, so most callers omit this field.", default: "-" },
    { name: "n", type: "integer", required: "No", description: "Number of output images. Keep it at `1`; single-image output is the supported shape for this engine.", default: "1" },
    { name: "seed", type: "integer", required: "No", description: "Integer 0-2147483647.", default: "random" },
    { name: "watermark", type: "boolean", required: "No", description: "Whether to add a watermark.", default: "false" },
    { name: "async / asyncResponse / returnImmediately", type: "boolean", required: "No", description: "Return immediately with task info instead of waiting for the image result.", default: "false" },
  ];
}

function mulerouterRoutingMarkdown() {
  return [
    "## Mulerouter Routing",
    "",
    "Generation requests are fulfilled by Mulerouter. The platform keeps a stable public API surface and maps every request to the matching Mulerouter model, so callers only ever send their Vipeak AI token.",
    "",
    "| Public model | Platform provider | `videoCapability` / Mulerouter node | Result type |",
    "|--------------|-------------------|-----------------------------------|-------------|",
    "| W3.0 | `wan30` | `w3.0-video` | video |",
    "| W3.0-Pro | `wan30` | `w3.0-video-pro` | video |",
    "| W3.0-Prime | `wan30` | `w3.0-video-prime` | video |",
    "| W3.0-VSR-Prime | `wan30` | `w3.0-video-prime-pro` | video |",
    "| Z-Image Spicy Pro | — | `z-image-spicy-pro` | text-to-image |",
    "| Qwen Image Edit Spicy | — | `qwen-image-edit-spicy` | image edit |",
    "",
  ].join("\n");
}

function seedream5ImageParameterFields() {
  return [
    { name: "/api/v3/images/generations", type: "endpoint", required: "Yes", description: "Create a Seedream 5.0 Pro image task. The create response returns id/task_id and status.", default: "-" },
    { name: "/api/v3/contents/generations/tasks/<taskId>", type: "endpoint", required: "Yes", description: "Query progress and final content.image_url.", default: "-" },
    { name: "model", type: "string", required: "Yes", description: "Use `seedream-5.0-pro`.", default: "seedream-5.0-pro" },
    { name: "prompt", type: "string", required: "Yes", description: "Non-empty image prompt or edit instruction.", default: "-" },
    { name: "image", type: "string or array", required: "No", description: `Optional reference image or images. Use public image URLs, supported image data URLs, or asset:// ids returned by upload. Up to ${ADVANCED_SEEDANCE_REFERENCE_LIMIT} reference images.`, default: "-" },
    { name: "size", type: "string", required: "No", description: "Supported values here: `1K`, `2K`.", default: "2K" },
    { name: "response_format", type: "enum", required: "No", description: "Use `url`. This async create endpoint returns a task id; read the final URL from task detail.", default: "url" },
    { name: "watermark", type: "boolean", required: "No", description: "Pass-through watermark flag.", default: "false" },
    { name: "output_format", type: "enum", required: "No", description: "`png` or `jpeg`.", default: "-" },
    { name: "optimize_prompt_options.mode", type: "enum", required: "No", description: "`standard` or `fast` when prompt optimization is needed.", default: "-" },
    { name: "image input limits", type: "rule", required: "For image", description: `Supported image uploads are max ${docsMb(IMAGE_UPLOAD_MAX_BYTES)}. Upstream reference images must be larger than 14x14px, aspect ratio between 1/16 and 16, and total pixels no more than 36000000.`, default: "-" },
  ];
}

function qwenImage3ParameterFields() {
  return [
    { name: "/api/v3/images/generations", type: "endpoint", required: "Yes", description: "Create an asynchronous Qwen Image 3.0 task.", default: "-" },
    { name: "/api/v3/contents/generations/tasks/<taskId>", type: "endpoint", required: "Yes", description: "Query progress and final content.image_url, content.image_urls, or data[].url.", default: "-" },
    { name: "model", type: "enum", required: "Yes", description: "`qwen-image-3.0-pro` or `qwen-image-3.0`.", default: "qwen-image-3.0-pro" },
    { name: "prompt", type: "string", required: "Yes", description: "Non-empty image prompt or edit instruction.", default: "-" },
    { name: "image", type: "string or array", required: "No", description: `Optional 1-${QWEN_IMAGE3_REFERENCE_LIMIT} reference images. Use public image URLs, supported image data URLs, or asset:// ids returned by upload.`, default: "-" },
    { name: "size", type: "string", required: "No", description: "Use `1K`, `2K`, or `width*height`. Pixel area must be 512*512 through 2048*2048 and aspect ratio must be 1:8 through 8:1.", default: "2K" },
    { name: "n", type: "integer", required: "No", description: `Number of output images, integer 1-${QWEN_IMAGE3_OUTPUT_MAX}.`, default: "1" },
    { name: "negative_prompt", type: "string", required: "No", description: "Optional negative prompt supplied by the caller.", default: "-" },
    { name: "prompt_extend", type: "boolean", required: "No", description: "Enable prompt extension.", default: "true" },
    { name: "prompt_extend_mode", type: "enum", required: "No", description: "`direct`; `agent` is accepted only for text-to-image without reference images.", default: "direct" },
    { name: "seed", type: "integer", required: "No", description: `Integer 0-${QWEN_IMAGE3_SEED_MAX}.`, default: "-" },
    { name: "watermark", type: "boolean", required: "No", description: "Whether to add an upstream watermark.", default: "false" },
    { name: "image input limits", type: "rule", required: "For image", description: "JPG/JPEG, PNG, BMP, TIFF, WebP, or GIF; max 10MB per image. Recommended width and height are 384-2048px.", default: "-" },
  ];
}

function advancedAssetParameterFields() {
  return [
    { name: "/api/user-assets", type: "endpoint", required: "No", description: "Upload a reusable image, video, audio, or (with provider=wan30) document for Advanced generation. Reuse the returned asset.id in later requests.", default: "-" },
    { name: "url / imageUrl / videoUrl / audioUrl", type: "string", required: "For URL upload", description: "Public http(s) media URL. The server imports the file into your asset library.", default: "-" },
    { name: "dataUrl", type: "string", required: "For inline upload", description: "Base64 image, video, audio, or Wan 3.0 document data URL.", default: "-" },
    { name: "name / fileName", type: "string", required: "No", description: "Asset display name and original file name.", default: "Upload" },
    { name: "durationSeconds", type: "number", required: "No", description: "Known media duration in seconds. Supplying it avoids an extra duration probe when applicable.", default: "-" },
    { name: "provider", type: "string", required: "No", description: "Set to `wan30` when uploading media for Wan 3.0 so its media-size limits are applied.", default: "-" },
  ];
}

function wan30VideoParameterFields(capability = "w3.0-video") {
  const definitions = {
    "w3.0-video": { model: "W3.0", resolutions: "`480p`, `720p`, or `1080p`", defaultResolution: "1080p" },
    "w3.0-video-pro": { model: "W3.0-Pro", resolutions: "`1080p`, `2k`, or `4k`", defaultResolution: "1080p" },
    "w3.0-video-prime": { model: "W3.0-Prime", resolutions: "`480p`, `720p`, or `1080p`", defaultResolution: "1080p" },
    "w3.0-video-prime-pro": { model: "W3.0-VSR-Prime", resolutions: "`1080p`, `2k`, or `4k`", defaultResolution: "1080p" },
  };
  const definition = definitions[capability] || definitions["w3.0-video"];
  return [
    { name: "/api/advanced/generate", type: "endpoint", required: "Yes", description: `Create an asynchronous ${definition.model} video task.`, default: "-" },
    { name: "provider", type: "string", required: "Yes", description: "Use `wan30`.", default: "wan30" },
    { name: "videoCapability", type: "enum", required: "Yes", description: `Use the Mulerouter node \`${capability}\` for ${definition.model}.`, default: capability },
    { name: "prompt", type: "string", required: "Unless media is supplied", description: "Video prompt, up to 5000 characters. When using references, name them in request order as Image 1, Video 1, Audio 1, etc.", default: "-" },
    { name: "mediaMode", type: "enum", required: "No", description: "`multimodal` for reference media or `first_last_frame` for explicit first and last frames. These modes cannot be mixed.", default: "multimodal" },
    { name: "referenceImages", type: "array", required: "For image references", description: "0-10 images. Each item accepts assetId, url/imageUrl, or dataUrl plus optional fileName.", default: "[]" },
    { name: "referenceVideos", type: "array", required: "For video references", description: "0-5 videos. Each item accepts assetId, url/videoUrl, or dataUrl plus optional fileName.", default: "[]" },
    { name: "referenceAudios", type: "array", required: "For audio references", description: "0-5 audios. Each item accepts assetId, url/audioUrl, or dataUrl plus optional fileName.", default: "[]" },
    { name: "referenceFileAssetId / referenceFile", type: "string/object", required: "For document input", description: "One PDF, Word, Excel, PowerPoint, TXT, or Markdown document, up to 100MB. It cannot be combined with other media inputs.", default: "-" },
    { name: "firstFrameUrl / firstFrameDataUrl / firstFrameAssetId", type: "string", required: "For first_last_frame", description: "First-frame image.", default: "-" },
    { name: "lastFrameUrl / lastFrameDataUrl / lastFrameAssetId", type: "string", required: "For first_last_frame", description: "Last-frame image. Both frame images are required.", default: "-" },
    { name: "resolution", type: "enum", required: "No", description: `${definition.resolutions}.`, default: definition.defaultResolution },
    { name: "ratio", type: "enum", required: "No", description: "`16:9`, `4:3`, `1:1`, `3:4`, `9:16`, or `adaptive`.", default: "adaptive" },
    { name: "duration", type: "integer", required: "No", description: "Output duration from 2-30 seconds. Use `-1` for adaptive output duration.", default: "5" },
    { name: "generateAudio / generate_audio", type: "boolean", required: "No", description: "Whether the output should include generated audio.", default: "true" },
    { name: "prompt_extend", type: "boolean", required: "No", description: "Whether to rewrite and expand the prompt before generation. Disable it for strict professional prompt adherence; it is enabled by default.", default: "true" },
    { name: "seed", type: "integer", required: "No", description: "Integer from 0 to 2147483647.", default: "-" },
    { name: "watermark", type: "boolean", required: "No", description: "Whether to add a watermark.", default: "false" },
    { name: "image limits", type: "rule", required: "For image", description: "JPG/JPEG, PNG, BMP, or WebP; max 20MB; width and height 240-8000px; aspect ratio no wider than 8:1. PNG transparency is not supported.", default: "-" },
    { name: "video limits", type: "rule", required: "For video", description: "MP4 or MOV; smaller than 100MB; width and height 240-4096px; aspect ratio no wider than 8:1; each video 1-15 seconds; all reference videos together at most 15 seconds.", default: "-" },
    { name: "audio limits", type: "rule", required: "For audio", description: "MP3 or WAV; smaller than 15MB; each audio 1-15 seconds; all reference audios together at most 15 seconds.", default: "-" },
    { name: "duration combination", type: "rule", required: "When video references are used", description: "If duration is not `-1`, total input-video seconds plus output duration must not exceed 30 seconds.", default: "-" },
  ];
}

function seedance25VideoParameterFields() {
  return [
    { name: "/api/advanced/generate", type: "endpoint", required: "Yes", description: "Create an asynchronous Seedance 2.5 video task.", default: "-" },
    { name: "provider", type: "string", required: "Yes", description: "Use `seedance25`.", default: "seedance25" },
    { name: "prompt", type: "string", required: "Yes", description: "Video prompt, 1-5000 characters.", default: "-" },
    { name: "functionMode / seedanceMode / mediaMode", type: "enum", required: "No", description: "`reference` (multimodal reference generation) or `first_last_frame`. `omini` is accepted as the reference-mode alias.", default: "reference" },
    { name: "referenceImages", type: "array", required: "For reference mode", description: "0-30 images. Each item accepts assetId, url/imageUrl, or dataUrl plus optional fileName.", default: "[]" },
    { name: "referenceVideos / referenceVideoUrls / referenceVideoAssetIds", type: "array", required: "For video references", description: "Reference mode accepts 0-10 videos.", default: "[]" },
    { name: "referenceAudios / referenceAudioUrls / referenceAudioAssetIds", type: "array", required: "For reference mode", description: "0-10 audios. Audio-only reference generation is not supported; include at least one image or video.", default: "[]" },
    { name: "firstFrameUrl / firstFrameDataUrl / firstFrameAssetId", type: "string", required: "For first_last_frame", description: "First-frame image.", default: "-" },
    { name: "lastFrameUrl / lastFrameDataUrl / lastFrameAssetId", type: "string", required: "For first_last_frame", description: "Last-frame image. Both frames are required and cannot be mixed with reference media.", default: "-" },
    { name: "resolution", type: "enum", required: "No", description: "`480p` or `720p`.", default: "480p" },
    { name: "ratio", type: "enum", required: "No", description: "`21:9`, `16:9`, `4:3`, `1:1`, `3:4`, or `9:16`.", default: "16:9" },
    { name: "duration", type: "integer", required: "No", description: "Integer 4-30 seconds for 480p, or 4-29 seconds for 720p.", default: "4" },
    { name: "generateAudio / generate_audio", type: "boolean", required: "No", description: "Generate native audio. This does not change the upstream price.", default: "true" },
    { name: "reference total", type: "rule", required: "For reference mode", description: "At least one reference is required; at most 50 images, videos, and audios combined.", default: "-" },
  ];
}

function seedanceNsfwVideoParameterFields() {
  return [
    { name: "/api/advanced/generate", type: "endpoint", required: "Yes", description: `Create an asynchronous ${SEEDANCE25_DIRECT_LABEL} video task.`, default: "-" },
    { name: "provider", type: "string", required: "Yes", description: "Use `seedance-nsfw`.", default: "seedance-nsfw" },
    { name: "prompt", type: "string", required: "Unless media is supplied", description: "Video prompt, up to 6000 characters. References keep request order as Image 1, Video 1, Audio 1, etc.", default: "-" },
    { name: "functionMode / seedanceMode / mediaMode", type: "enum", required: "No", description: "`reference`/`omini`, `first_last_frame`, `edit`, or `extend`.", default: "reference" },
    { name: "referenceImages", type: "array", required: "For image references", description: "0-30 images. Each item accepts assetId, url/imageUrl, or dataUrl plus optional fileName.", default: "[]" },
    { name: "referenceVideos / referenceVideoAssetIds", type: "array", required: "For video references", description: "Reference mode accepts 0-10 videos. Edit and extend require exactly one source video.", default: "[]" },
    { name: "referenceAudios / referenceAudioAssetIds", type: "array", required: "For audio references", description: "0-10 audios. Audio-only reference generation is supported by this direct model.", default: "[]" },
    { name: "firstFrameUrl / firstFrameDataUrl / firstFrameAssetId", type: "string", required: "For first_last_frame", description: "First-frame image.", default: "-" },
    { name: "lastFrameUrl / lastFrameDataUrl / lastFrameAssetId", type: "string", required: "For first_last_frame", description: "Last-frame image. Both frames are required and cannot be mixed with reference media.", default: "-" },
    { name: "resolution", type: "enum", required: "No", description: "`480p` or `720p`.", default: "480p" },
    { name: "ratio", type: "enum", required: "No", description: "`16:9`, `21:9`, `9:16`, `4:3`, `3:4`, `1:1`, or `adaptive`.", default: "adaptive" },
    { name: "duration", type: "integer", required: "No", description: "Output duration from 4-30 seconds. Edit follows the source-video duration.", default: "4" },
    { name: "generateAudio / generate_audio", type: "boolean", required: "No", description: "Generate output audio. The upstream default is true.", default: "true" },
    { name: "seed", type: "integer", required: "No", description: "`-1` for random, or an integer from 0 to 4294967295.", default: "-1" },
    { name: "reference total", type: "rule", required: "For reference mode", description: "At most 50 images, videos, and audios combined.", default: "-" },
  ];
}

function vegaVideoParameterFields(provider = "seedance25-vega") {
  const definition = vegaProviderDefinition(provider) || vegaProviderDefinition("seedance25-vega");
  const caps = vegaProviderCapabilities(definition.id);
  const bounds = vegaDurationBounds(definition.id);
  const resolutions = caps?.resolutions || VEGA_ALL_RESOLUTIONS;
  const ratios = caps?.ratios || VEGA_ALL_RATIOS;
  return [
    { name: "/api/advanced/generate", type: "endpoint", required: "Yes", description: `Create an asynchronous ${definition.label} video task through Tencent VOD.`, default: "-" },
    { name: "provider", type: "string", required: "Yes", description: `Use \`${definition.id}\`.`, default: definition.id },
    { name: "prompt", type: "string", required: "Yes", description: "Non-empty video prompt. Prompt enhancement is controlled by enhancePromptMode.", default: "-" },
    { name: "mediaMode", type: "enum", required: "No", description: "`text_to_video`, `first_frame`, `last_frame`, `first_last_frame`, `reference_video`, or `draft_followup`.", default: "text_to_video" },
    { name: "firstFrameUrl", type: "string", required: "For first_frame / first_last_frame", description: "Public HTTP(S) first-frame image URL. Asset IDs and data URLs are not accepted.", default: "-" },
    { name: "lastFrameUrl", type: "string", required: "For last_frame / first_last_frame", description: "Public HTTP(S) last-frame image URL. This is a standalone mode and does not require a first frame.", default: "-" },
    { name: "referenceImages", type: "array", required: "No", description: "Public HTTP(S) image reference URLs.", default: "[]" },
    { name: "referenceVideos", type: "array", required: "No", description: "Public HTTP(S) video reference URLs. Edit and extend require at least one.", default: "[]" },
    { name: "referenceAudios", type: "array", required: "No", description: "Public HTTP(S) audio reference URLs. Audio must be paired with an image or video.", default: "[]" },
    { name: "resolution", type: "enum", required: "No", description: resolutions.map((item) => `\`${item}\``).join(", "), default: "1080P" },
    { name: "ratio", type: "enum", required: "No", description: ratios.map((item) => `\`${item}\``).join(", "), default: "16:9" },
    { name: "duration", type: "integer", required: "No", description: `Integer ${bounds.min}-${bounds.max} seconds${bounds.smart ? ", or -1 for smart duration" : ""}. Edit requires -1.`, default: String(bounds.fallback) },
    { name: "seed", type: "integer", required: "No", description: "Optional non-negative integer seed.", default: "-" },
    { name: "taskType", type: "enum", required: "No", description: caps?.taskTypes.includes("edit") ? "`auto`, `reference`, `edit`, or `extend`." : "`auto` or `reference`.", default: "auto" },
    { name: "draft / draftTaskId", type: "boolean / string", required: "No", description: caps?.draft ? "Draft requires 480P. Draft to Final sends the previous draft task ID and no media or prompt." : "Not supported for this model.", default: "-" },
    { name: "assetGroupId", type: "string", required: "No", description: "Optional upstream asset group id.", default: "-" },
    { name: "generateAudio", type: "boolean", required: "No", description: "Maps to OutputConfig.AudioGeneration Enabled/Disabled.", default: "true" },
    { name: "returnLastFrame", type: "boolean", required: "No", description: "Maps to ExtInfo.AdditionalParameters.return_last_frame.", default: "false" },
    { name: "returnVegaUsage", type: "boolean", required: "No", description: "Maps to WandVegaParameters.ReturnVegaUsage.", default: "false" },
    { name: "enhancePromptMode", type: "enum", required: "No", description: "`auto`, `enable`, or `disable`.", default: "auto" },
    { name: "moderationMode", type: "enum", required: "No", description: "`Moderation_L1` or `Moderation_L2`.", default: "Moderation_L1" },
    { name: "generateMode", type: "enum", required: "No", description: "`Standard`, `Fast`, or `StandardMovie`.", default: "Standard" },
    { name: "videoQualityMode", type: "enum", required: "No", description: "`Standard`, `Fast`, or `SuperFast`.", default: "Standard" },
    { name: "outputFormat", type: "enum", required: "No", description: "`mp4` or `mov`.", default: "mp4" },
    { name: "pricing", type: "rule", required: "Yes", description: "Vega pricing is not configured. Requests fail with HTTP 422 `MODEL_PRICING_UNAVAILABLE` before charging or calling upstream.", default: "-" },
    { name: "media transport", type: "rule", required: "Yes", description: "Inputs are sent as `FileInfos` with `Usage` values `FirstFrame`, `LastFrame`, or `Reference`. Use public URLs only; never send asset IDs or data URLs.", default: "-" },
  ];
}

function vegaProviderExample(provider = "seedance25-vega") {
  const definition = vegaProviderDefinition(provider) || vegaProviderDefinition("seedance25-vega");
  return {
    provider: definition.id,
    prompt: definition.id === "h3-vega"
      ? "Create a premium cinematic product reveal with precise motion."
      : "Use the supplied references to create a cinematic shot.",
    ...(definition.id === "h3-vega"
      ? { referenceVideos: ["https://example.com/reference.mp4"] }
      : { referenceImages: ["https://example.com/reference.png"] }),
    ratio: definition.id === "h3-vega" ? "21:9" : "16:9",
    resolution: definition.id === "seedance25-vega" ? "2K" : "1080P",
    duration: advancedDurationBounds(definition.id).fallback,
  };
}

function happyhorseVideoParameterFields() {
  return [
    { name: "/api/advanced/generate", type: "endpoint", required: "Yes", description: "Create an asynchronous HappyHorse video task.", default: "-" },
    { name: "provider", type: "string", required: "Yes", description: "Use `happyhorse`.", default: "happyhorse" },
    { name: "videoCapability", type: "enum", required: "Yes", description: "`happyhorse-t2v`, `happyhorse-i2v`, `happyhorse-r2v`, or `happyhorse-video-edit`.", default: "happyhorse-i2v" },
    { name: "prompt", type: "string", required: "Yes", description: "Non-empty video prompt or edit instruction.", default: "-" },
    { name: "firstFrameUrl / firstFrameDataUrl / firstFrameAssetId", type: "string", required: "For happyhorse-i2v", description: "Exactly one first-frame image.", default: "-" },
    { name: "referenceImages", type: "array", required: "For happyhorse-r2v", description: "Reference generation requires 1-9 images. Video edit accepts 0-5 reference images. Each item accepts assetId, url/imageUrl, or dataUrl.", default: "[]" },
    { name: "videoUrl / videoDataUrl / videoAssetId", type: "string", required: "For happyhorse-video-edit", description: "Exactly one source video.", default: "-" },
    { name: "resolution", type: "enum", required: "No", description: "`720p` or `1080p`.", default: "720p" },
    { name: "duration", type: "integer", required: "No", description: "Integer 3-15 seconds.", default: "5" },
    { name: "seed", type: "integer", required: "No", description: "Optional deterministic seed when supported.", default: "-" },
    { name: "prompt_extend / promptExtend", type: "boolean", required: "No", description: "Whether to enable prompt extension.", default: "false" },
    { name: "watermark", type: "boolean", required: "No", description: "Whether to add a watermark.", default: "false" },
  ];
}

function wanAnimateVideoParameterFields() {
  return [
    { name: "/api/advanced/generate", type: "endpoint", required: "Yes", description: "Create an asynchronous Wan Animate task.", default: "-" },
    { name: "provider", type: "string", required: "Yes", description: "Use `wan27`.", default: "wan27" },
    { name: "videoCapability", type: "enum", required: "Yes", description: "`wan-animate-move` for image animation or `wan-animate-mix` for character replacement.", default: "wan-animate-move" },
    { name: "prompt", type: "string", required: "Yes", description: "Non-empty animation or replacement instruction.", default: "-" },
    { name: "firstFrameUrl / firstFrameDataUrl / firstFrameAssetId", type: "string", required: "Yes", description: "Exactly one source/reference image.", default: "-" },
    { name: "videoUrl / videoDataUrl / videoAssetId", type: "string", required: "Yes", description: "Exactly one motion/source video.", default: "-" },
    { name: "parameters.mode", type: "enum", required: "No", description: "`wan-std` or `wan-pro`.", default: "wan-std" },
    { name: "duration", type: "integer", required: "No", description: "Omit this field. Output duration follows the source video; supported source duration is 2-30 seconds.", default: "source video duration" },
    { name: "watermark", type: "boolean", required: "No", description: "Whether to add a watermark.", default: "false" },
  ];
}

function byteplusV3ParameterFields() {
  return [
    { name: "model", type: "string", required: "Yes", description: "`dreamina-seedance-2-0-260128` for standard or `dreamina-seedance-2-0-fast-260128` for fast. `dreamina-seedance-2-0-hc`, `dreamina-seedance-2-0-fast-hc`, and `dreamina-seedance-2-0-mini-hc` aliases are accepted.", default: "-" },
    { name: "content", type: "array", required: "Yes", description: "1-16 content blocks. Include one non-empty text block. Images max 9, videos max 3, audios max 3.", default: "-" },
    { name: "content[].type", type: "enum", required: "Yes", description: "`text`, `image_url`, `video_url`, or `audio_url`.", default: "-" },
    { name: "content[].text", type: "string", required: "For text", description: "Prompt text. Use Image 1, Video 1, Audio 1 labels yourself when referring to references.", default: "-" },
    { name: "content[].image_url.url", type: "string", required: "For image_url", description: "Public image URL, supported image data URL, or `asset://<asset-id>`. JPG/PNG/WebP/BMP, max 20MB, width and height 300-6000px, aspect ratio 0.4-2.5.", default: "-" },
    { name: "content[].video_url.url", type: "string", required: "For video_url", description: "Public video URL, supported video data URL, or `asset://<asset-id>`. Max 3 videos; pixel count 409600-8847360.", default: "-" },
    { name: "content[].audio_url.url", type: "string", required: "For audio_url", description: "Public audio URL, supported audio data URL, or `asset://<asset-id>`. Max 3 audios; MP3/WAV/M4A/MP4 audio/AAC/OGG/WebM, max 30MB. Audio-only generation is rejected.", default: "-" },
    { name: "content[].role", type: "enum", required: "For media", description: "Images: `first_frame`, `last_frame`, or `reference_image`. Videos: `reference_video`. Audios: `reference_audio`. First/last frame roles cannot be mixed with reference media.", default: "reference_image for image_url" },
    { name: "ratio", type: "string", required: "No", description: "Output aspect ratio, for example `9:16`, `16:9`, or `1:1`. Ratio must stay between 0.4 and 2.5.", default: "9:16" },
    { name: "resolution", type: "string", required: "No", description: "Standard model supports `480p`, `720p`, `1080p`, `4k`; fast/mini supports `480p`, `720p`.", default: "720p" },
    { name: "duration", type: "integer", required: "No", description: `Video duration in seconds, integer ${advancedDurationBounds("seedance").min}-${advancedDurationBounds("seedance").max}.`, default: String(advancedDurationBounds("seedance").fallback) },
    { name: "generate_audio", type: "boolean", required: "No", description: "Default true. Set false to disable generated voice, effects, or background music.", default: "true" },
    { name: "watermark", type: "boolean", required: "No", description: "Pass-through watermark flag.", default: "false" },
    { name: "callback_url", type: "string(url)", required: "No", description: "Optional upstream callback URL when supported by the selected model/provider.", default: "-" },
    { name: "return_last_frame / priority / service_tier / execution_expires_after / seed / fps / camera_fixed", type: "mixed", required: "No", description: "Provider-specific pass-through fields. The request forwards them when supported; unsupported fields are decided by the upstream model.", default: "-" },
  ];
}

function byteplusV3ParameterMarkdown() {
  const rows = byteplusV3ParameterFields().map((field) => ({
    Parameter: field.name,
    Type: field.type,
    Required: field.required,
    Description: field.description,
    Default: field.default,
  }));
  return markdownTable(["Parameter", "Type", "Required", "Description", "Default"], rows);
}

function docsPlatformExampleBody(template = {}) {
  const body = {
    templateId: template.id || "template-id",
  };
  if (template.type === "image-to-video") body.dataUrl = "data:image/png;base64,...";
  body.prompt = "optional override";
  return body;
}

function docsAdvancedExampleBody(item = {}) {
  const params = item.params && typeof item.params === "object" && !Array.isArray(item.params) ? item.params : {};
  const provider = normalizeAdvancedProvider(item.provider || params.provider);
  const body = {
    caseId: item.id || "case-id",
    provider,
    prompt: item.prompt || params.prompt || "your prompt",
    ratio: params.ratio || params.aspect_ratio || "9:16",
    resolution: params.resolution || "720p",
    duration: durationSecondsFromParams(params) || 5,
  };
  if (provider === "wan27") {
    const seed = optionalWan27Seed(params.seed);
    body.mediaMode = params.mediaMode || "first_frame";
    body.dataUrl = "data:image/png;base64,...";
    if (seed !== undefined) body.seed = seed;
  }
  if (provider === "seedance") {
    body.model = normalizeSeedanceTier(params.seedanceTier) === "fast"
      ? "dreamina-seedance-2-0-fast-260128"
      : "dreamina-seedance-2-0-260128";
    body.seedanceMode = normalizeSeedanceMode(params.seedanceMode || params.mediaMode || item.mediaMode || "reference_video");
    body.generateAudio = params.generateAudio !== false;
    body.referenceImages = [
      { url: "https://example.com/image1.png", fileName: "image1.png" },
      { url: "https://example.com/image2.png", fileName: "image2.png" },
    ];
    if (normalizeSeedanceMode(params.seedanceMode || params.mediaMode || item.mediaMode) === "reference_video") {
      body.referenceVideoUrls = ["https://example.com/video1.mp4"];
      body.referenceAudioUrls = ["https://example.com/audio1.mp3"];
    }
  }
  return body;
}

function advancedGenerateConstraintsDoc() {
  return {
    common: {
      routes: ["/api/v3/contents/generations/tasks", "/api/v3/images/generations", "/api/advanced/generate", "/api/wan27/image-edit"],
      auth: "Authorization: Bearer <user-token>",
      prompt: "Required non-empty string.",
      ratio: {
        format: "width:height",
        minAspectRatio: SEEDANCE_IMAGE_ASPECT_RATIO_MIN,
        maxAspectRatio: SEEDANCE_IMAGE_ASPECT_RATIO_MAX,
        examples: ["9:16", "16:9", "1:1"],
      },
      errorShape: { error: { code: "InvalidParameter", message: "Human readable error.", param: "duration" } },
    },
    seedance: {
      provider: "seedance",
      model: {
        standard: "dreamina-seedance-2-0-260128",
        fast: "dreamina-seedance-2-0-fast-260128",
      },
      seedanceMode: ["text_to_video", "first_frame", "first_last_frame", "reference_images", "reference_video"],
      durationSeconds: { integer: true, min: advancedDurationBounds("seedance").min, max: advancedDurationBounds("seedance").max },
      resolution: {
        standard: ["480p", "720p", "1080p", "4k"],
        fast: ["480p", "720p"],
      },
      imageInput: {
        formats: ["JPG", "PNG", "WebP", "BMP"],
        maxBytes: IMAGE_UPLOAD_MAX_BYTES,
        widthPx: { min: SEEDANCE_IMAGE_DIMENSION_MIN, max: SEEDANCE_IMAGE_DIMENSION_MAX },
        heightPx: { min: SEEDANCE_IMAGE_DIMENSION_MIN, max: SEEDANCE_IMAGE_DIMENSION_MAX },
        aspectRatio: { min: SEEDANCE_IMAGE_ASPECT_RATIO_MIN, max: SEEDANCE_IMAGE_ASPECT_RATIO_MAX },
        maxTotalImages: ADVANCED_SEEDANCE_REFERENCE_LIMIT,
      },
      videoInput: {
        maxBytes: MEDIA_UPLOAD_MAX_BYTES,
        pixelCount: { min: SEEDANCE_VIDEO_PIXEL_COUNT_MIN, max: SEEDANCE_VIDEO_PIXEL_COUNT_MAX },
        maxTotalVideos: ADVANCED_SEEDANCE_VIDEO_REFERENCE_LIMIT,
      },
      audioInput: {
        formats: ["MP3", "WAV", "M4A/MP4 audio", "AAC", "OGG", "WebM"],
        maxBytes: MEDIA_UPLOAD_MAX_BYTES,
        maxTotalAudios: ADVANCED_SEEDANCE_AUDIO_REFERENCE_LIMIT,
      },
      referenceLimits: {
        images: ADVANCED_SEEDANCE_REFERENCE_LIMIT,
        videos: ADVANCED_SEEDANCE_VIDEO_REFERENCE_LIMIT,
        audios: ADVANCED_SEEDANCE_AUDIO_REFERENCE_LIMIT,
      },
      modeRules: {
        text_to_video: "Prompt-only video generation. Do not send image, video, or audio reference inputs.",
        first_frame: "Requires exactly one first-frame image input. Do not mix with referenceImages, referenceVideos, referenceAudios, or raw reference content.",
        first_last_frame: "Requires first-frame and last-frame image inputs. Do not mix with referenceImages, referenceVideos, referenceAudios, or raw reference content.",
        reference_images: "Multimodal image references. Send up to 9 image inputs total; refer to them in the prompt as Image 1, Image 2, etc.",
        reference_video: "Multimodal video references. Send supported image, video, and optional audio references; refer to them in the prompt as Image 1, Video 1, Audio 1, etc.",
      },
      mediaUrl: "Use public http(s) URLs, supported data URLs, or asset:// ids returned by CreateAsset.",
    },
    wan30: {
      provider: "wan30",
      route: "/api/advanced/generate",
      capabilities: ["w3.0-video", "w3.0-video-pro", "w3.0-video-prime", "w3.0-video-prime-pro"],
      models: [
        { id: "w3.0-video", providerModel: "wan3.0-video" },
        { id: "w3.0-video-pro", providerModel: "wan3.0-video-pro" },
        { id: "w3.0-video-prime", providerModel: "wan3.0-video-prime" },
        { id: "w3.0-video-prime-pro", providerModel: "wan3.0-video-prime-pro" },
      ],
      mediaMode: ["multimodal", "first_last_frame"],
      durationSeconds: { integer: true, min: 2, max: 30, adaptive: -1 },
      resolutionsByCapability: {
        "w3.0-video": ["480p", "720p", "1080p"],
        "w3.0-video-pro": ["1080p", "2k", "4k"],
        "w3.0-video-prime": ["480p", "720p", "1080p"],
        "w3.0-video-prime-pro": ["1080p", "2k", "4k"],
      },
      ratio: ["16:9", "4:3", "1:1", "3:4", "9:16", "adaptive"],
      referenceLimits: { images: 10, videos: 5, audios: 5 },
      imageInput: { formats: ["JPG", "JPEG", "PNG", "BMP", "WebP"], maxBytes: IMAGE_UPLOAD_MAX_BYTES, widthPx: { min: 240, max: 8000 }, heightPx: { min: 240, max: 8000 }, maxAspectRatio: 8, pngTransparency: false },
      videoInput: { formats: ["MP4", "MOV"], maxBytesExclusive: WAN30_VIDEO_UPLOAD_MAX_BYTES, widthPx: { min: 240, max: 4096 }, heightPx: { min: 240, max: 4096 }, maxAspectRatio: 8, durationSeconds: { min: 1, max: 15 }, maxTotalDurationSeconds: 15 },
      audioInput: { formats: ["MP3", "WAV"], maxBytesExclusive: WAN30_AUDIO_UPLOAD_MAX_BYTES, durationSeconds: { min: 1, max: 15 }, maxTotalDurationSeconds: 15 },
      modeRules: {
        multimodal: "Accepts image, video, and audio references within the listed limits.",
        first_last_frame: "Requires both frame images and cannot be mixed with reference media.",
      },
    },
    seedance25: {
      provider: "seedance25",
      route: "/api/advanced/generate",
      modes: ["reference", "first_last_frame"],
      durationSeconds: { integer: true, byResolution: { "480p": { min: 4, max: 30 }, "720p": { min: 4, max: 29 } } },
      resolution: ["480p", "720p"],
      ratio: SEEDANCE25_RATIOS,
      referenceLimits: { images: 30, videos: 10, audios: 10, total: 50 },
      generateAudio: { type: "boolean", default: true, affectsPrice: false },
      modeRules: {
        reference: "Requires at least one image, video, or audio. Audio-only generation is not supported.",
        first_last_frame: "Requires both frame images and cannot be mixed with reference media.",
      },
    },
    seedanceNsfw: {
      provider: SEEDANCE25_DIRECT_PROVIDER,
      route: "/api/advanced/generate",
      model: SEEDANCE25_DIRECT_LABEL,
      modes: ["reference", "first_last_frame", "edit", "extend"],
      durationSeconds: { integer: true, min: 4, max: 30, sourceDurationFor: ["edit"] },
      resolution: [...SEEDANCE25_DIRECT_RESOLUTIONS],
      ratio: [...SEEDANCE25_DIRECT_RATIOS],
      referenceLimits: { images: 30, videos: 10, audios: 10, total: 50 },
      audioOnly: true,
      generateAudio: { type: "boolean", default: true },
      seed: { integer: true, min: -1, max: 4294967295 },
      modeRules: {
        reference: "Accepts image, video, and audio references. Audio-only reference generation is supported.",
        first_last_frame: "Requires both frame images and cannot be mixed with reference media.",
        edit: "Requires exactly one source video; output duration follows the source-video duration.",
        extend: "Requires exactly one source video; duration is the number of seconds to extend.",
      },
    },
    vega: {
      providers: [
        { id: "seedance25-vega", label: "Vega 1.5 Pro", modelName: "wand-vega-video", modelVersion: "1.5-pro" },
        { id: "h3-vega", label: "Vega 1.5 Lite", modelName: "wand-vega-video", modelVersion: "1.5-lite" },
      ],
      route: "/api/advanced/generate",
      modes: ["text_to_video", "first_frame", "last_frame", "first_last_frame", "reference_video", "draft_followup"],
      taskTypes: { "seedance25-vega": ["auto", "reference", "edit", "extend"], otherModels: ["auto", "reference"] },
      durationSeconds: { integer: true, min: 2, max: 30, smart: -1, defaults: { "seedance25-vega": 5, "h3-vega": 6 } },
      resolution: ["480P", "720P", "768P", "1080P", "2K", "4K"],
      ratio: ["21:9", "16:9", "4:3", "1:1", "3:4", "9:16", "adaptive"],
      fileInfoUsage: ["FirstFrame", "LastFrame", "Reference"],
      lastFrameRule: "FirstFrame, LastFrame, and first_last_frame are separate modes; LastFrame is not required to be paired with FirstFrame.",
      promptEnhancement: "auto, enable, or disable through WandVegaParameters.EnhancePromptMode.",
      taskTypeRule: "edit requires a reference video, adaptive ratio, and duration -1; extend requires a reference video and adaptive ratio.",
      draftRule: "Draft requires 480P; Draft to Final uses draft_task_id with no prompt or media inputs.",
      mediaTransport: "Media: public HTTP(S) URLs only. FileInfos use Usage FirstFrame, LastFrame, or Reference. Asset IDs and data URLs are rejected.",
      extInfo: ["return_last_frame", "draft", "draft_task_id", "omni_reference_task_type", "asset_group_id", "output_format", "EnhancePromptMode", "ModerationMode", "ReturnVegaUsage", "GenerateMode", "VideoQualityMode"],
      pricing: "Vega pricing is not configured; requests fail closed with HTTP 422 MODEL_PRICING_UNAVAILABLE before charging or calling upstream.",
    },
    wan27: {
      provider: "wan27",
      route: "/api/advanced/generate",
      model: ALIYUN_WAN27_MODEL,
      capabilities: ["wan2.7-i2v-spicy"],
      mediaMode: Array.from(WAN27_MEDIA_MODE),
      durationSeconds: { integer: true, min: advancedDurationBounds("wan27").min, max: advancedDurationBounds("wan27").max },
      resolution: ["720p", "1080p"],
      mediaCombinations: [
        "first_frame",
        "first_frame + driving_audio",
      ],
      imageInput: {
        formats: ["JPG", "PNG", "WebP", "BMP"],
        maxBytes: IMAGE_UPLOAD_MAX_BYTES,
      },
      videoInput: {
        maxBytes: MEDIA_UPLOAD_MAX_BYTES,
      },
      audioInput: {
        formats: ["MP3", "WAV", "M4A/MP4 audio", "AAC", "OGG", "WebM"],
        maxBytes: MEDIA_UPLOAD_MAX_BYTES,
      },
      mediaUrl: "Use public http(s) URLs, supported data URLs, or uploaded asset ids.",
    },
    seedream5Image: {
      provider: "seedream5-image",
      route: "/api/v3/images/generations",
      model: "seedream-5.0-pro",
      referenceImages: { min: 0, max: ADVANCED_SEEDANCE_REFERENCE_LIMIT },
      size: ["1K", "2K"],
      response_format: ["url"],
      output_format: ["png", "jpeg"],
      optimize_prompt_options: { mode: ["standard", "fast"] },
      imageInput: {
        formats: ["JPG", "PNG", "WebP", "BMP", "TIFF", "GIF", "HEIC", "HEIF"],
        maxBytes: IMAGE_UPLOAD_MAX_BYTES,
        widthPx: { min: 15 },
        heightPx: { min: 15 },
        aspectRatio: { min: 1 / 16, max: 16 },
        maxPixelCount: 36000000,
      },
      unsupportedFields: ["sequential_image_generation", "sequential_image_generation_options", "seed", "guidance_scale"],
      mediaUrl: "Use public http(s) image URLs, supported image data URLs, or asset:// ids returned by upload.",
    },
    qwenImage3: {
      provider: "qwen-image3",
      route: "/api/v3/images/generations",
      models: QWEN_IMAGE3_MODELS,
      referenceImages: { min: 0, max: QWEN_IMAGE3_REFERENCE_LIMIT },
      outputImages: { min: 1, max: QWEN_IMAGE3_OUTPUT_MAX },
      size: {
        presets: ["1K", "2K"],
        minPixelArea: QWEN_IMAGE3_SIZE_MIN_PIXELS,
        maxPixelArea: QWEN_IMAGE3_SIZE_MAX_PIXELS,
        minAspectRatio: 1 / 8,
        maxAspectRatio: 8,
      },
      imageInput: {
        formats: ["JPG", "JPEG", "PNG", "BMP", "TIFF", "WebP", "GIF"],
        maxBytes: 10 * 1024 * 1024,
        recommendedWidthPx: { min: 384, max: 2048 },
        recommendedHeightPx: { min: 384, max: 2048 },
      },
      promptExtendMode: ["direct", "agent"],
      seed: { integer: true, min: 0, max: QWEN_IMAGE3_SEED_MAX },
      mediaUrl: "Use public http(s) image URLs, supported image data URLs, or asset:// ids returned by upload.",
      region: "Singapore",
    },
  };
}

function externalAdvancedApiDoc(origin) {
  const byteplusGenerate = `${origin}/api/v3/contents/generations/tasks`;
  const byteplusTaskDetail = `${origin}/api/v3/contents/generations/tasks/<taskId>`;
  const seedream5ImageGenerate = `${origin}/api/v3/images/generations`;
  const seedream5ImageTaskDetail = byteplusTaskDetail;
  const qwenImage3Generate = seedream5ImageGenerate;
  const qwenImage3TaskDetail = byteplusTaskDetail;
  const byteplusAssetAction = `${origin}/?Action=CreateAsset&Version=2024-01-01`;
  const userAssets = `${origin}/api/user-assets`;
  const advancedGenerate = `${origin}/api/advanced/generate`;
  const wan27ImageEdit = `${origin}/api/wan27/image-edit`;
  const generationRecordDetail = `${origin}/api/generation-records/<taskId>`;
  return {
    baseUrl: origin,
    summary: "Seedance 2.0 uses the V3 task route. Seedream 5.0 Pro and Qwen Image 3.0 use the V3 images route. W3.0, W3.0-Pro, W3.0-Prime, W3.0-VSR-Prime, Seedance 2.5, and the two Vega video models use the asynchronous Advanced route. Z-Image Spicy Pro and Qwen Image Edit Spicy use the dedicated image endpoint.",
    recommendedRoute: byteplusGenerate,
    constraints: advancedGenerateConstraintsDoc(),
    supportedModels: [
      { name: "Seedance 2.0 Standard", model: "dreamina-seedance-2-0-260128", create: "/api/v3/contents/generations/tasks", result: "/api/v3/contents/generations/tasks/<taskId>" },
      { name: "Seedance 2.0 Fast", model: "dreamina-seedance-2-0-fast-260128", create: "/api/v3/contents/generations/tasks", result: "/api/v3/contents/generations/tasks/<taskId>" },
      { name: "W3.0", provider: "wan30", capability: "w3.0-video", create: "/api/advanced/generate", result: "/api/generation-records/<taskId>" },
      { name: "W3.0-Pro", provider: "wan30", capability: "w3.0-video-pro", create: "/api/advanced/generate", result: "/api/generation-records/<taskId>" },
      { name: "W3.0-Prime", provider: "wan30", capability: "w3.0-video-prime", create: "/api/advanced/generate", result: "/api/generation-records/<taskId>" },
      { name: "W3.0-VSR-Prime", provider: "wan30", capability: "w3.0-video-prime-pro", create: "/api/advanced/generate", result: "/api/generation-records/<taskId>" },
      { name: "Seedance 2.5", provider: "seedance25", capability: "reference / first_last_frame", create: "/api/advanced/generate", result: "/api/generation-records/<taskId>" },
      { name: SEEDANCE25_DIRECT_LABEL, provider: SEEDANCE25_DIRECT_PROVIDER, capability: "reference / first_last_frame / edit / extend", create: "/api/advanced/generate", result: "/api/generation-records/<taskId>" },
      { name: "Vega 1.5 Pro", provider: "seedance25-vega", model: "wand-vega-video / 1.5-pro", capability: "text / frames / references / edit / extend / draft", create: "/api/advanced/generate", result: "/api/generation-records/<taskId>" },
      { name: "Vega 1.5 Lite", provider: "h3-vega", model: "wand-vega-video / 1.5-lite", capability: "text / frames / references", create: "/api/advanced/generate", result: "/api/generation-records/<taskId>" },
      { name: "Seedream 5.0 Pro", model: "seedream-5.0-pro", create: "/api/v3/images/generations", result: "/api/v3/contents/generations/tasks/<taskId>" },
      { name: "Qwen Image 3.0", model: "qwen-image-3.0-pro / qwen-image-3.0", create: "/api/v3/images/generations", result: "/api/v3/contents/generations/tasks/<taskId>" },
      { name: "Z-Image Spicy Pro", model: "z-image-spicy-pro", capability: "text-to-image", create: "/api/wan27/image-edit", result: "/api/generation-records/<taskId>" },
      { name: "Qwen Image Edit Spicy", model: "qwen-image-edit-spicy", capability: "image-edit", create: "/api/wan27/image-edit", result: "/api/generation-records/<taskId>" },
    ],
    endpoints: {
      byteplusGenerate,
      byteplusTaskDetail,
      seedream5ImageGenerate,
      seedream5ImageTaskDetail,
      qwenImage3Generate,
      qwenImage3TaskDetail,
      byteplusAssetAction,
      userAssets,
      advancedGenerate,
      wan27ImageEdit,
      generationRecordDetail,
    },
    byteplusExample: {
      method: "POST",
      url: byteplusGenerate,
      headers: {
        Authorization: "Bearer <user-token>",
        "Content-Type": "application/json",
      },
      body: {
        model: "dreamina-seedance-2-0-260128",
        content: [
          { type: "text", text: "Use Image 1 as the subject reference and Video 1 as motion reference. Create a cinematic 5 second product promo video." },
          { type: "image_url", image_url: { url: "asset://asset-id-from-upload" }, role: "reference_image" },
          { type: "video_url", video_url: { url: "https://example.com/video1.mp4" }, role: "reference_video" },
        ],
        ratio: "9:16",
        resolution: "720p",
        duration: 5,
        generate_audio: true,
        watermark: false,
      },
    },
    responseShape: {
      id: "cgt-...",
    },
    seedream5ImageResponseShape: {
      id: "img-...",
      task_id: "img-...",
      status: "queued",
      data: [],
    },
    seedream5ImageExample: {
      method: "POST",
      url: seedream5ImageGenerate,
      headers: {
        Authorization: "Bearer <user-token>",
        "Content-Type": "application/json",
      },
      body: {
        model: "seedream-5.0-pro",
        prompt: "Create a cinematic portrait while preserving the selected subject identity.",
        image: ["asset://asset-id-from-upload"],
        size: "2K",
        watermark: false,
        output_format: "png",
        optimize_prompt_options: { mode: "standard" },
      },
    },
    qwenImage3ResponseShape: {
      id: "img-...",
      task_id: "img-...",
      status: "queued",
      data: [],
    },
    qwenImage3Example: {
      method: "POST",
      url: qwenImage3Generate,
      headers: {
        Authorization: "Bearer <user-token>",
        "Content-Type": "application/json",
      },
      body: {
        model: QWEN_IMAGE3_MODELS.pro,
        prompt: "Keep the subject identity and create a clean studio campaign image.",
        image: ["asset://asset-id-from-upload"],
        size: "2K",
        n: 1,
        prompt_extend: true,
        prompt_extend_mode: "direct",
        watermark: false,
      },
    },
    wan30Example: {
      method: "POST",
      url: advancedGenerate,
      headers: { Authorization: "Bearer <user-token>", "Content-Type": "application/json" },
      body: {
        provider: "wan30", videoCapability: "w3.0-video", mediaMode: "multimodal",
        prompt: "Use Image 1 as the character and Video 1 as the motion reference.",
        referenceImages: [{ assetId: "uploaded-image-asset-id" }],
        referenceVideos: [{ assetId: "uploaded-video-asset-id" }],
        ratio: "9:16", resolution: "720p", duration: 8, generateAudio: true,
      },
    },
    wan30ProExample: {
      method: "POST",
      url: advancedGenerate,
      headers: { Authorization: "Bearer <user-token>", "Content-Type": "application/json" },
      body: {
        provider: "wan30", videoCapability: "w3.0-video-pro", mediaMode: "multimodal",
        prompt: "Create a high-detail cinematic product shot.",
        referenceImages: [{ assetId: "uploaded-image-asset-id" }],
        ratio: "16:9", resolution: "2k", duration: 5, generateAudio: true,
      },
    },
    wan30PrimeExample: {
      method: "POST",
      url: advancedGenerate,
      headers: { Authorization: "Bearer <user-token>", "Content-Type": "application/json" },
      body: {
        provider: "wan30", videoCapability: "w3.0-video-prime", mediaMode: "multimodal",
        prompt: "Create a cinematic character performance with natural motion.",
        referenceImages: [{ assetId: "uploaded-image-asset-id" }],
        ratio: "9:16", resolution: "1080p", duration: 5, generateAudio: true,
      },
    },
    wan30PrimeProExample: {
      method: "POST",
      url: advancedGenerate,
      headers: { Authorization: "Bearer <user-token>", "Content-Type": "application/json" },
      body: {
        provider: "wan30", videoCapability: "w3.0-video-prime-pro", mediaMode: "multimodal",
        prompt: "Create a premium cinematic shot with precise identity and motion.",
        referenceImages: [{ assetId: "uploaded-image-asset-id" }],
        ratio: "16:9", resolution: "2k", duration: 5, generateAudio: true,
      },
    },
    seedance25Example: {
      method: "POST",
      url: advancedGenerate,
      headers: {
        Authorization: "Bearer <user-token>",
        "Content-Type": "application/json",
      },
      body: {
        provider: "seedance25",
        functionMode: "reference",
        prompt: "Use Image 1 as the subject and Video 1 as the action reference.",
        referenceImages: [{ assetId: "uploaded-image-asset-id" }],
        referenceVideos: [{ assetId: "uploaded-video-asset-id" }],
        ratio: "9:16",
        resolution: "720p",
        duration: 8,
        generateAudio: true,
      },
    },
    seedanceNsfwExample: {
      method: "POST",
      url: advancedGenerate,
      headers: {
        Authorization: "Bearer <user-token>",
        "Content-Type": "application/json",
      },
      body: {
        provider: SEEDANCE25_DIRECT_PROVIDER,
        functionMode: "reference",
        prompt: "Use Image 1 as the subject and Video 1 as the action reference.",
        referenceImages: [{ assetId: "uploaded-image-asset-id" }],
        referenceVideos: [{ assetId: "uploaded-video-asset-id" }],
        ratio: "9:16",
        resolution: "720p",
        duration: 8,
        generateAudio: true,
      },
    },
    seedance25VegaExample: {
      method: "POST",
      url: advancedGenerate,
      headers: { Authorization: "Bearer <user-token>", "Content-Type": "application/json" },
      body: {
        provider: "seedance25-vega",
        prompt: "Use the first and last frames to create a smooth cinematic transition.",
        firstFrameUrl: "https://example.com/first-frame.png",
        lastFrameUrl: "https://example.com/last-frame.png",
        ratio: "9:16",
        resolution: "2K",
        duration: 5,
      },
    },
    h3VegaExample: {
      method: "POST",
      url: advancedGenerate,
      headers: { Authorization: "Bearer <user-token>", "Content-Type": "application/json" },
      body: {
        provider: "h3-vega",
        prompt: "Create a premium cinematic product reveal with precise motion.",
        referenceVideos: ["https://example.com/reference.mp4"],
        ratio: "21:9",
        resolution: "4K",
        duration: 6,
      },
    },
    wan27Example: {
      method: "POST",
      url: advancedGenerate,
      headers: {
        Authorization: "Bearer <user-token>",
        "Content-Type": "application/json",
      },
      body: {
        provider: "wan27",
        videoCapability: "wan2.7-i2v-spicy",
        prompt: "Create a cinematic shot that follows the first-frame image and the driving audio.",
        firstFrameAssetId: "uploaded-image-asset-id",
        drivingAudioAssetId: "uploaded-audio-asset-id",
        resolution: "720p",
        duration: 5,
        prompt_extend: true,
        watermark: false,
      },
    },
    happyhorseExample: {
      method: "POST",
      url: advancedGenerate,
      headers: {
        Authorization: "Bearer <user-token>",
        "Content-Type": "application/json",
      },
      body: {
        provider: "happyhorse",
        videoCapability: "happyhorse-video-edit",
        prompt: "Keep the source timing and replace the subject using Image 1.",
        videoAssetId: "uploaded-video-asset-id",
        referenceImages: [{ assetId: "uploaded-image-asset-id" }],
        resolution: "720p",
        duration: 5,
      },
    },
    wanAnimateExample: {
      method: "POST",
      url: advancedGenerate,
      headers: {
        Authorization: "Bearer <user-token>",
        "Content-Type": "application/json",
      },
      body: {
        provider: "wan27",
        videoCapability: "wan-animate-mix",
        prompt: "Replace the source-video character with the person in the image.",
        firstFrameAssetId: "uploaded-image-asset-id",
        videoAssetId: "uploaded-video-asset-id",
        parameters: { mode: "wan-pro" },
      },
    },
    wan27ImageExample: {
      method: "POST",
      url: wan27ImageEdit,
      headers: {
        Authorization: "Bearer <user-token>",
        "Content-Type": "application/json",
      },
      body: {
        prompt: "Edit the reference image into a cinematic portrait while preserving identity.",
        imageUrls: ["https://example.com/reference.png"],
        ratio: "9:16",
        resolution: "2K",
        watermark: false,
      },
    },
    zImageSpicyProExample: {
      method: "POST",
      url: wan27ImageEdit,
      headers: {
        Authorization: "Bearer <user-token>",
        "Content-Type": "application/json",
      },
      body: {
        prompt: "A cinematic portrait of a traveler in a rain-soaked neon city, ultra detailed.",
        ratio: "9:16",
        resolution: "2K",
        prompt_extend: true,
        seed: 123456,
        watermark: false,
        async: true,
      },
    },
    qwenImageEditSpicyExample: {
      method: "POST",
      url: wan27ImageEdit,
      headers: {
        Authorization: "Bearer <user-token>",
        "Content-Type": "application/json",
      },
      body: {
        prompt: "Turn the subject into a cinematic portrait while preserving identity.",
        imageUrls: ["https://example.com/reference.png"],
        ratio: "9:16",
        resolution: "2K",
        seed: 42,
        watermark: false,
        async: true,
      },
    },
    polling: {
      method: "GET",
      url: byteplusTaskDetail,
      headers: { Authorization: "Bearer <user-token>" },
    },
  };
}

function docsPricingView(estimate = {}) {
  if (!estimate.available) {
    return {
      available: false,
      credits: null,
      source: "",
      message: estimate.message || "Pricing is unavailable.",
    };
  }
  return {
    available: true,
    credits: creditsAmount(estimate.credits),
    baseCredits: creditsAmount(estimate.baseCredits ?? estimate.credits),
    originalCredits: estimate.originalCredits === undefined || estimate.originalCredits === null ? null : creditsAmount(estimate.originalCredits),
    userPricingMultiplier: estimate.userPricingMultiplier ?? 1,
    markup: estimate.markup ?? GENERATION_PRICE_MARKUP,
    source: estimate.source || "model_pricing",
    durationSeconds: estimate.durationSeconds || 0,
  };
}

function tenantDocsPricingView(pricing = {}) {
  return pricing && pricing.available === false
    ? {
      available: false,
      credits: null,
      message: pricing.message || "Pricing is unavailable.",
    }
    : {
      available: true,
      credits: creditsAmount(pricing.credits),
    };
}

async function buildUserAdvancedEstimate(provider = "seedance", params = {}, user = null, options = {}) {
  const config = await readAppConfig();
  if (isWan27ImageProvider(provider)) {
    return wan27ImageModifyPricing(config, user || null, options);
  }
  const normalizedProvider = normalizeAdvancedProvider(provider);
  const inputVideoSeconds = normalizedProvider === "seedance"
    ? await seedanceVideoInputSecondsForPricingWithProbe(params, { requestParams: params })
    : firstPresent(params.inputVideoSeconds, params.videoInputSeconds, params.referenceVideoDurationSeconds, params.referenceVideoSeconds);
  const referenceVideoDurations = Array.isArray(params.referenceVideoDurations) ? params.referenceVideoDurations : [];
  const rawPricing = advancedModelPricing(provider, {
    duration: params.duration ?? params.durationSeconds,
    resolution: params.resolution,
    ratio: params.ratio || params.aspect_ratio,
    inputVideoSeconds,
    referenceVideoDurations,
    seedanceTier: params.seedanceTier,
    videoCapability: params.videoCapability,
    model: params.model,
    mode: firstPresent(params.mode, params.functionMode, params.seedanceMode),
    seedreamTier: firstPresent(params.seedreamTier, params.seedream5Tier, params.seedanceTier),
    qwenTier: firstPresent(params.qwenTier, params.qwenImageTier, params.tier),
    inputTokens: firstPresent(params.inputTokens, params.promptTokens),
    outputTokens: firstPresent(params.outputTokens, params.completionTokens, params.max_tokens, params.maxTokens),
    size: params.size,
    outputImageCount: firstPresent(params.outputImageCount, params.n),
    referenceImageCount: firstPresent(params.referenceImageCount, params.imageCount),
    advancedPricing: config.platform?.advancedPricing,
  });
  return applyUserPricingToEstimate(rawPricing, user || 1, options);
}

async function handleAdvancedEstimate(req, res) {
  const auth = await getAuth(req, { loadDb: false });
  const body = req.method === "POST" ? await readJson(req) : {};
  const url = new URL(req.url || "/", "http://localhost");
  const tenantPublic = requestTenantOptions(req).tenantPublic;
  const rawProvider = body.provider || url.searchParams.get("provider");
  const duration = body.duration ?? url.searchParams.get("duration");
  const params = {
    ...plainObject(body.params),
    ...body,
    duration,
    resolution: body.resolution ?? url.searchParams.get("resolution"),
    ratio: body.ratio ?? body.aspect_ratio ?? url.searchParams.get("ratio") ?? url.searchParams.get("aspect_ratio"),
  };
  const tenant = requestTenantDescriptor(req);
  const isToolVideoTemplateEstimate = tenant.toolId === "video";
  const effectiveProvider = isToolVideoTemplateEstimate
    ? "seedance"
    : rawProvider;
  const provider = isWan27ImageProvider(effectiveProvider) ? "wan27-image" : normalizeAdvancedProvider(effectiveProvider);
  if (publicAliyunModelBlockedForRequest(req, provider)) return sendPublicAliyunModelUnavailable(res);
  if (isToolVideoTemplateEstimate) {
    params.videoCapability = "";
    params.model = TOOL_VIDEO_SEEDANCE_MODEL;
    params.seedanceTier = "standard";
  }
  params.inputVideoSeconds = firstPresent(
    body.inputVideoSeconds,
    body.videoInputSeconds,
    body.referenceVideoDurationSeconds,
    body.referenceVideoSeconds,
    url.searchParams.get("inputVideoSeconds"),
    url.searchParams.get("referenceVideoDurationSeconds"),
  );
  params.referenceVideoDurations = Array.isArray(body.referenceVideoDurations)
    ? body.referenceVideoDurations
    : Array.isArray(body.params?.referenceVideoDurations)
    ? body.params.referenceVideoDurations
    : [];
  if (["qwen37-flash", "byteplus-language", "papaya"].includes(provider)) {
    params.inputTokens = firstPresent(
      body.inputTokens,
      body.promptTokens,
      Math.max(1, Buffer.byteLength(String(params.prompt || ""), "utf8") + 64),
    );
    params.outputTokens = firstPresent(params.outputTokens, params.max_tokens, params.maxTokens, 1024);
  }
  let pricing;
  try {
    pricing = await buildUserAdvancedEstimate(provider, params, auth.user, pricingContextForAuth(auth));
  } catch (error) {
    return sendAdvancedValidationError(res, error, "Model pricing is unavailable.");
  }
  const publicPricing = tenantPublic
    ? {
      provider: publicProviderId(pricing.provider),
      credits: pricing.credits,
      duration: pricing.duration,
      resolution: pricing.resolution,
      ratio: pricing.ratio,
    }
    : publicPricingValue(pricing);
  return sendJson(res, 200, {
    ok: true,
    userPricing: pricingMultiplierView(auth.user || 1, pricingContextForAuth(auth)),
    pricing: publicPricing,
  });
}

