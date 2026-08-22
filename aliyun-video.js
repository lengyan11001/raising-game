"use strict";

const VIDEO_SYNTHESIS_PATH = "/api/v1/services/aigc/video-generation/video-synthesis";
const ANIMATE_SYNTHESIS_PATH = "/api/v1/services/aigc/image2video/video-synthesis";

const CAPABILITIES = Object.freeze({
  "wan30-video": Object.freeze({
    provider: "wan30",
    model: "wan3.0-video",
    endpoint: VIDEO_SYNTHESIS_PATH,
    mediaKind: "wan30",
    duration: [2, 30],
    resolutions: ["480P", "720P", "1080P"],
    billing: "output",
  }),
  "wan30-video-prime": Object.freeze({
    provider: "wan30",
    model: "wan3.0-video-prime",
    endpoint: VIDEO_SYNTHESIS_PATH,
    mediaKind: "wan30",
    duration: [2, 30],
    resolutions: ["480P", "720P", "1080P"],
    billing: "output",
  }),
  "wan27-t2v": Object.freeze({
    provider: "wan27",
    model: "wan2.7-t2v-2026-06-12",
    endpoint: VIDEO_SYNTHESIS_PATH,
    mediaKind: "none",
    duration: [2, 15],
    resolutions: ["720P", "1080P"],
    billing: "output",
  }),
  "wan27-i2v": Object.freeze({
    provider: "wan27",
    model: "wan2.7-i2v-2026-04-25",
    endpoint: VIDEO_SYNTHESIS_PATH,
    mediaKind: "wan-i2v",
    duration: [2, 15],
    resolutions: ["720P", "1080P"],
    billing: "output",
  }),
  "wan27-r2v": Object.freeze({
    provider: "wan27",
    model: "wan2.7-r2v-2026-06-12",
    endpoint: VIDEO_SYNTHESIS_PATH,
    mediaKind: "wan-r2v",
    duration: [2, 15],
    resolutions: ["720P", "1080P"],
    billing: "input_output",
  }),
  "wan27-video-edit": Object.freeze({
    provider: "wan27",
    model: "wan2.7-videoedit",
    endpoint: VIDEO_SYNTHESIS_PATH,
    mediaKind: "video-edit",
    duration: [0, 10],
    resolutions: ["720P", "1080P"],
    billing: "input_output",
  }),
  "wan-legacy": Object.freeze({
    provider: "wan27",
    model: "",
    endpoint: VIDEO_SYNTHESIS_PATH,
    mediaKind: "wan-legacy",
    duration: [2, 15],
    resolutions: ["480P", "720P", "1080P"],
    billing: "output",
  }),
  "wan-animate-move": Object.freeze({
    provider: "wan27",
    model: "wan2.2-animate-move",
    endpoint: ANIMATE_SYNTHESIS_PATH,
    mediaKind: "animate",
    duration: [2, 30],
    resolutions: [],
    billing: "output",
  }),
  "wan-animate-mix": Object.freeze({
    provider: "wan27",
    model: "wan2.2-animate-mix",
    endpoint: ANIMATE_SYNTHESIS_PATH,
    mediaKind: "animate",
    duration: [2, 30],
    resolutions: [],
    billing: "output",
  }),
  "happyhorse-t2v": Object.freeze({
    provider: "happyhorse",
    model: "happyhorse-1.1-t2v",
    endpoint: VIDEO_SYNTHESIS_PATH,
    mediaKind: "none",
    duration: [3, 15],
    resolutions: ["720P", "1080P"],
    billing: "output",
  }),
  "happyhorse-i2v": Object.freeze({
    provider: "happyhorse",
    model: "happyhorse-1.1-i2v",
    endpoint: VIDEO_SYNTHESIS_PATH,
    mediaKind: "happyhorse-i2v",
    duration: [3, 15],
    resolutions: ["720P", "1080P"],
    billing: "output",
  }),
  "happyhorse-r2v": Object.freeze({
    provider: "happyhorse",
    model: "happyhorse-1.1-r2v",
    endpoint: VIDEO_SYNTHESIS_PATH,
    mediaKind: "happyhorse-r2v",
    duration: [3, 15],
    resolutions: ["720P", "1080P"],
    billing: "output",
  }),
  "happyhorse-video-edit": Object.freeze({
    provider: "happyhorse",
    model: "happyhorse-1.0-video-edit",
    endpoint: VIDEO_SYNTHESIS_PATH,
    mediaKind: "happyhorse-video-edit",
    duration: [0, 15],
    resolutions: ["720P", "1080P"],
    billing: "input_output",
  }),
});

const CAPABILITY_ALIASES = Object.freeze({
  "wan30": "wan30-video",
  "wan3": "wan30-video",
  "wan3-video": "wan30-video",
  "wan3.0": "wan30-video",
  "wan3.0-video": "wan30-video",
  "wan30-prime": "wan30-video-prime",
  "wan3-prime": "wan30-video-prime",
  "wan3.0-prime": "wan30-video-prime",
  "wan3.0-video-prime": "wan30-video-prime",
  "wan-t2v": "wan27-t2v",
  "wan-text-to-video": "wan27-t2v",
  "text-to-video": "wan27-t2v",
  "wan-i2v": "wan27-i2v",
  "wan-image-to-video": "wan27-i2v",
  "image-to-video": "wan27-i2v",
  "wan-r2v": "wan27-r2v",
  "wan-reference-to-video": "wan27-r2v",
  "reference-to-video": "wan27-r2v",
  "wan-video-edit": "wan27-video-edit",
  "video-edit": "wan27-video-edit",
  "legacy": "wan-legacy",
  "early": "wan-legacy",
  "animate-move": "wan-animate-move",
  "image-to-action": "wan-animate-move",
  "animate-mix": "wan-animate-mix",
  "character-replace": "wan-animate-mix",
  "video-character-replace": "wan-animate-mix",
  "happyhorse-text-to-video": "happyhorse-t2v",
  "happyhorse-image-to-video": "happyhorse-i2v",
  "happyhorse-reference-to-video": "happyhorse-r2v",
  "happyhorse-edit": "happyhorse-video-edit",
});

const MODEL_CAPABILITIES = Object.freeze(Object.fromEntries(
  Object.entries(CAPABILITIES)
    .filter(([, definition]) => definition.model)
    .map(([key, definition]) => [definition.model, key]),
));

const LEGACY_WAN_MODELS = Object.freeze(new Set([
  "wan2.6-t2v",
  "wan2.5-t2v-preview",
  "wan2.2-t2v-plus",
  "wan2.1-t2v-turbo",
  "wan2.1-t2v-plus",
  "wan2.6-i2v-flash",
  "wan2.6-i2v",
  "wan2.5-i2v-preview",
  "wan2.2-i2v-flash",
  "wan2.2-i2v-plus",
  "wan2.1-i2v-turbo",
  "wan2.1-i2v-plus",
  "wan2.6-r2v-flash",
  "wan2.6-r2v",
  "wan2.1-kf2v-plus",
  "wan2.1-vace-plus",
]));

// Alibaba Cloud Model Studio international pricing for Singapore, checked 2026-07-26.
const OFFICIAL_SINGAPORE_USD_PER_SECOND = Object.freeze({
  "wan27-t2v": Object.freeze({ "720P": 0.10, "1080P": 0.15 }),
  "wan27-i2v": Object.freeze({ "720P": 0.10, "1080P": 0.15 }),
  "wan27-r2v": Object.freeze({ "720P": 0.10, "1080P": 0.15 }),
  "wan27-video-edit": Object.freeze({ "720P": 0.10, "1080P": 0.15 }),
  "wan-animate-move": Object.freeze({ "wan-std": 0.12, "wan-pro": 0.18 }),
  "wan-animate-mix": Object.freeze({ "wan-std": 0.18, "wan-pro": 0.26 }),
  "happyhorse-t2v": Object.freeze({ "720P": 0.084, "1080P": 0.108 }),
  "happyhorse-i2v": Object.freeze({ "720P": 0.084, "1080P": 0.108 }),
  "happyhorse-r2v": Object.freeze({ "720P": 0.084, "1080P": 0.108 }),
  "happyhorse-video-edit": Object.freeze({ "720P": 0.112, "1080P": 0.192 }),
});

const OFFICIAL_SINGAPORE_LIST_USD_PER_SECOND = Object.freeze({
  "happyhorse-t2v": Object.freeze({ "720P": 0.14, "1080P": 0.18 }),
  "happyhorse-i2v": Object.freeze({ "720P": 0.14, "1080P": 0.18 }),
  "happyhorse-r2v": Object.freeze({ "720P": 0.14, "1080P": 0.18 }),
  "happyhorse-video-edit": Object.freeze({ "720P": 0.14, "1080P": 0.24 }),
});

const OFFICIAL_SINGAPORE_DISCOUNT_PERCENT = Object.freeze({
  "happyhorse-t2v": 40,
  "happyhorse-i2v": 40,
  "happyhorse-r2v": 40,
  "happyhorse-video-edit": 20,
});

const OFFICIAL_SINGAPORE_LEGACY_USD_PER_SECOND = Object.freeze({
  "wan2.6-t2v": Object.freeze({ "720P": 0.10, "1080P": 0.15 }),
  "wan2.5-t2v-preview": Object.freeze({ "480P": 0.05, "720P": 0.10, "1080P": 0.15 }),
  "wan2.2-t2v-plus": Object.freeze({ "480P": 0.02, "1080P": 0.10 }),
  "wan2.1-t2v-turbo": Object.freeze({ "480P": 0.036, "720P": 0.036 }),
  "wan2.1-t2v-plus": Object.freeze({ "720P": 0.10 }),
  "wan2.6-i2v-flash": Object.freeze({
    "720P-audio": 0.05,
    "1080P-audio": 0.075,
    "720P-silent": 0.025,
    "1080P-silent": 0.0375,
  }),
  "wan2.6-i2v": Object.freeze({ "720P": 0.10, "1080P": 0.15 }),
  "wan2.5-i2v-preview": Object.freeze({ "480P": 0.05, "720P": 0.10, "1080P": 0.15 }),
  "wan2.2-i2v-flash": Object.freeze({ "480P": 0.015, "720P": 0.036 }),
  "wan2.2-i2v-plus": Object.freeze({ "480P": 0.02, "1080P": 0.10 }),
  "wan2.1-i2v-turbo": Object.freeze({ "480P": 0.036, "720P": 0.036 }),
  "wan2.1-i2v-plus": Object.freeze({ "720P": 0.10 }),
  "wan2.6-r2v-flash": Object.freeze({
    "720P-audio": 0.05,
    "1080P-audio": 0.075,
    "720P-silent": 0.025,
    "1080P-silent": 0.0375,
  }),
  "wan2.6-r2v": Object.freeze({ "720P": 0.10, "1080P": 0.15 }),
  "wan2.1-kf2v-plus": Object.freeze({ "720P": 0.10 }),
  "wan2.1-vace-plus": Object.freeze({ "720P": 0.10 }),
});

function requestError(code, message, details = {}) {
  const error = new Error(message);
  error.name = "AliyunVideoValidationError";
  error.code = code;
  error.statusCode = 400;
  error.details = details;
  return error;
}

function normalizeKey(value = "") {
  return String(value || "").trim().toLowerCase().replace(/[\s_]+/g, "-");
}

function normalizeProvider(value = "") {
  const normalized = normalizeKey(value);
  if (["wan30", "wan3", "wan3.0"].includes(normalized) || normalized.includes("wan30") || normalized.includes("wan3.0")) return "wan30";
  if (normalized.includes("happyhorse") || normalized === "horse") return "happyhorse";
  return "wan27";
}

function capabilityForModel(model = "") {
  const normalized = String(model || "").trim().toLowerCase();
  if (!normalized) return "";
  if (MODEL_CAPABILITIES[normalized]) return MODEL_CAPABILITIES[normalized];
  if (LEGACY_WAN_MODELS.has(normalized)) return "wan-legacy";
  return "";
}

function normalizeCapability(value = "", { provider = "wan27", model = "", media = [] } = {}) {
  const modelCapability = capabilityForModel(model);
  if (modelCapability) return modelCapability;
  const normalized = normalizeKey(value);
  if (CAPABILITIES[normalized]) return normalized;
  if (CAPABILITY_ALIASES[normalized]) return CAPABILITY_ALIASES[normalized];
  if (normalizeProvider(provider) === "wan30") return "wan30-video";
  if (normalizeProvider(provider) === "happyhorse") {
    const hasVideo = media.some((item) => item?.type === "video" || item?.type === "reference_video");
    const hasImage = media.some((item) => item?.type === "first_frame" || item?.type === "reference_image");
    if (hasVideo) return "happyhorse-video-edit";
    if (hasImage) return "happyhorse-i2v";
    return "happyhorse-t2v";
  }
  const hasReferenceVideo = media.some((item) => item?.type === "reference_video");
  const hasEditVideo = media.some((item) => item?.type === "video");
  const hasFrame = media.some((item) => ["first_frame", "last_frame", "first_clip", "driving_audio"].includes(item?.type));
  if (hasEditVideo) return "wan27-video-edit";
  if (hasReferenceVideo || media.some((item) => item?.type === "reference_image")) return "wan27-r2v";
  if (hasFrame) return "wan27-i2v";
  return "wan27-t2v";
}

function normalizeResolution(value = "720P") {
  const normalized = String(value || "720P").trim().toUpperCase();
  return normalized === "1080P" || normalized === "480P" ? normalized : "720P";
}

function normalizeMode(value = "wan-std") {
  return String(value || "").trim().toLowerCase() === "wan-pro" ? "wan-pro" : "wan-std";
}

function normalizeMedia(media = []) {
  if (!Array.isArray(media)) throw requestError("INVALID_MEDIA", "media must be an array.");
  return media.filter(Boolean).map((item, index) => {
    const type = normalizeKey(item.type).replace(/-/g, "_");
    const url = String(item.url || "").trim();
    if (!type || !url) throw requestError("INVALID_MEDIA_ITEM", `Media ${index + 1} requires type and url.`);
    const normalized = { type, url };
    const referenceVoice = String(item.reference_voice || item.referenceVoice || "").trim();
    if (referenceVoice) normalized.reference_voice = referenceVoice;
    return normalized;
  });
}

function assertMediaTypes(media, allowed, capability) {
  const invalid = media.find((item) => !allowed.has(item.type));
  if (invalid) throw requestError("INVALID_MEDIA_TYPE", `${capability} does not accept ${invalid.type}.`, { type: invalid.type });
}

function assertCount(media, type, min, max, capability) {
  const count = media.filter((item) => item.type === type).length;
  if (count < min || count > max) {
    throw requestError("INVALID_MEDIA_COUNT", `${capability} requires ${min === max ? min : `${min}-${max}`} ${type} item(s).`, { type, count, min, max });
  }
}

function validateMedia(definition, media, parameters, capability) {
  if (definition.mediaKind === "wan30") {
    const referenceTypes = new Set(["reference_image", "reference_video", "reference_audio", "file"]);
    const frameTypes = new Set(["first_frame", "last_frame"]);
    assertMediaTypes(media, new Set([...referenceTypes, ...frameTypes]), capability);
    const fileCount = media.filter((item) => item.type === "file").length;
    if (fileCount > 1) throw requestError("INVALID_MEDIA_COUNT", `${capability} accepts at most one file.`, { type: "file", count: fileCount, max: 1 });
    if (fileCount && media.length > 1) throw requestError("INVALID_MEDIA_COMBINATION", `${capability} cannot mix a document with other media inputs.`);
    const hasReferences = media.some((item) => referenceTypes.has(item.type));
    const hasFrames = media.some((item) => frameTypes.has(item.type));
    if (hasReferences && hasFrames) {
      throw requestError("INVALID_MEDIA_COMBINATION", `${capability} cannot mix reference media with first/last frames.`);
    }
    assertCount(media, "reference_image", 0, 10, capability);
    assertCount(media, "reference_video", 0, 5, capability);
    assertCount(media, "reference_audio", 0, 5, capability);
    assertCount(media, "first_frame", hasFrames ? 1 : 0, 1, capability);
    assertCount(media, "last_frame", 0, 1, capability);
    if (media.some((item) => item.type === "last_frame") && media[0]?.type !== "first_frame") {
      throw requestError("INVALID_MEDIA_COMBINATION", `${capability} requires first_frame before last_frame.`);
    }
    return;
  }
  if (definition.mediaKind === "none") {
    if (media.length) throw requestError("MEDIA_NOT_SUPPORTED", `${capability} does not accept media inputs.`);
    return;
  }
  if (definition.mediaKind === "wan-i2v") {
    assertMediaTypes(media, new Set(["first_frame", "last_frame", "driving_audio", "first_clip"]), capability);
    const signature = media.map((item) => item.type).join("|");
    const allowed = new Set([
      "first_frame",
      "first_frame|last_frame",
      "first_frame|driving_audio",
      "first_frame|last_frame|driving_audio",
      "first_clip",
      "first_clip|last_frame",
    ]);
    if (!allowed.has(signature)) throw requestError("INVALID_MEDIA_COMBINATION", `${capability} does not support media combination ${signature || "empty"}.`);
    return;
  }
  if (definition.mediaKind === "wan-r2v") {
    assertMediaTypes(media, new Set(["first_frame", "reference_image", "reference_video"]), capability);
    assertCount(media, "first_frame", 0, 1, capability);
    const referenceCount = media.filter((item) => item.type === "reference_image" || item.type === "reference_video").length;
    if (referenceCount < 1 || referenceCount > 5) throw requestError("INVALID_REFERENCE_COUNT", `${capability} requires 1-5 reference images/videos in total.`, { referenceCount });
    if (media.some((item) => item.type === "reference_video") && Number(parameters.duration) > 10) {
      throw requestError("INVALID_DURATION", `${capability} duration must be 2-10 seconds when a reference video is used.`);
    }
    return;
  }
  if (definition.mediaKind === "video-edit") {
    assertMediaTypes(media, new Set(["video", "reference_image"]), capability);
    assertCount(media, "video", 1, 1, capability);
    assertCount(media, "reference_image", 0, 4, capability);
    return;
  }
  if (definition.mediaKind === "happyhorse-i2v") {
    assertMediaTypes(media, new Set(["first_frame"]), capability);
    assertCount(media, "first_frame", 1, 1, capability);
    return;
  }
  if (definition.mediaKind === "happyhorse-r2v") {
    assertMediaTypes(media, new Set(["reference_image"]), capability);
    assertCount(media, "reference_image", 1, 9, capability);
    return;
  }
  if (definition.mediaKind === "happyhorse-video-edit") {
    assertMediaTypes(media, new Set(["video", "reference_image"]), capability);
    assertCount(media, "video", 1, 1, capability);
    assertCount(media, "reference_image", 0, 5, capability);
    return;
  }
  if (definition.mediaKind === "animate") {
    assertMediaTypes(media, new Set(["image_url", "video_url"]), capability);
    assertCount(media, "image_url", 1, 1, capability);
    assertCount(media, "video_url", 1, 1, capability);
    return;
  }
  if (definition.mediaKind === "wan-legacy") {
    if (!media.length) return;
    assertMediaTypes(media, new Set([
      "first_frame", "last_frame", "first_clip", "driving_audio",
      "reference_image", "reference_video", "video",
    ]), capability);
  }
}

function boundedInteger(value, fallback, min, max, field = "duration") {
  const number = Number(value ?? fallback);
  if (!Number.isInteger(number) || number < min || number > max) {
    throw requestError("INVALID_PARAMETER", `${field} must be an integer between ${min} and ${max}.`, { field, value });
  }
  return number;
}

function buildAliyunVideoRequest(options = {}) {
  const media = normalizeMedia(options.media || []);
  const capability = normalizeCapability(options.capability || options.videoCapability, {
    provider: options.provider,
    model: options.model,
    media,
  });
  const definition = CAPABILITIES[capability];
  if (!definition) throw requestError("INVALID_CAPABILITY", `Unsupported Alibaba video capability: ${capability || "empty"}.`);
  const model = String(options.model || definition.model || "").trim();
  if (!model) throw requestError("MODEL_REQUIRED", `${capability} requires model.`);
  if (capability === "wan-legacy" && !LEGACY_WAN_MODELS.has(model.toLowerCase())) {
    throw requestError("INVALID_LEGACY_MODEL", `Unsupported Singapore legacy Wan model: ${model}.`);
  }

  const sourceParameters = options.parameters && typeof options.parameters === "object" ? options.parameters : {};
  const prompt = String(options.prompt || "").trim();
  if (!prompt && !(definition.mediaKind === "wan30" && media.length)) {
    throw requestError("PROMPT_OR_MEDIA_REQUIRED", definition.mediaKind === "wan30" ? "prompt or media is required." : "prompt is required.");
  }
  if (definition.mediaKind === "wan30" && prompt.length > 5000) {
    throw requestError("PROMPT_TOO_LONG", "Wan 3.0 prompt must be 5000 characters or fewer.", { length: prompt.length, max: 5000 });
  }

  if (definition.mediaKind === "animate") {
    validateMedia(definition, media, sourceParameters, capability);
    const image = media.find((item) => item.type === "image_url");
    const video = media.find((item) => item.type === "video_url");
    return {
      capability,
      definition,
      endpoint: definition.endpoint,
      payload: {
        model,
        input: {
          image_url: image.url,
          video_url: video.url,
          watermark: Boolean(sourceParameters.watermark),
        },
        parameters: { mode: normalizeMode(sourceParameters.mode) },
      },
    };
  }

  const resolution = normalizeResolution(sourceParameters.resolution || options.resolution || (definition.mediaKind === "wan30" ? "1080P" : "720P"));
  if (!definition.resolutions.includes(resolution)) {
    throw requestError("INVALID_RESOLUTION", `${capability} supports ${definition.resolutions.join(", ")}.`, { resolution });
  }
  const rawDuration = sourceParameters.duration ?? options.duration;
  const duration = definition.mediaKind === "wan30" && Number(rawDuration) === -1
    ? -1
    : boundedInteger(
        rawDuration,
        definition.duration[0] === 0 ? 0 : Math.max(5, definition.duration[0]),
        definition.duration[0],
        definition.duration[1],
      );
  if (definition.mediaKind === "wan30") {
    const allowedRatios = new Set(["16:9", "4:3", "1:1", "3:4", "9:16", "adaptive"]);
    const ratio = String(sourceParameters.ratio || options.ratio || "adaptive").trim().toLowerCase();
    if (!allowedRatios.has(ratio)) {
      throw requestError("INVALID_RATIO", `${capability} supports ${[...allowedRatios].join(", ")}.`, { ratio });
    }
    const seedValue = sourceParameters.seed;
    let seed;
    if (seedValue !== undefined && seedValue !== "") {
      seed = boundedInteger(seedValue, 0, 0, 2147483647, "seed");
    }
    validateMedia(definition, media, { duration }, capability);
    return {
      capability,
      definition,
      endpoint: definition.endpoint,
      payload: {
        model,
        input: {
          ...(prompt ? { prompt } : {}),
          ...(media.length ? { media } : {}),
        },
        parameters: {
          resolution,
          ratio,
          duration,
          audio: sourceParameters.audio === undefined ? true : Boolean(sourceParameters.audio),
          enable_thinking: false,
          watermark: sourceParameters.watermark === undefined ? false : Boolean(sourceParameters.watermark),
          ...(seed === undefined ? {} : { seed }),
        },
      },
    };
  }
  const parameters = {
    resolution,
    duration,
  };
  if (sourceParameters.ratio || options.ratio) parameters.ratio = String(sourceParameters.ratio || options.ratio);
  if (sourceParameters.prompt_extend !== undefined || options.promptExtend !== undefined) {
    parameters.prompt_extend = Boolean(sourceParameters.prompt_extend ?? options.promptExtend);
  }
  if (sourceParameters.watermark !== undefined || options.watermark !== undefined) {
    parameters.watermark = Boolean(sourceParameters.watermark ?? options.watermark);
  }
  if (sourceParameters.seed !== undefined && sourceParameters.seed !== "") parameters.seed = Number(sourceParameters.seed);
  if (sourceParameters.audio !== undefined) parameters.audio = Boolean(sourceParameters.audio);
  if (sourceParameters.audio_setting) parameters.audio_setting = String(sourceParameters.audio_setting).toLowerCase() === "origin" ? "origin" : "auto";

  validateMedia(definition, media, parameters, capability);
  return {
    capability,
    definition,
    endpoint: definition.endpoint,
    payload: {
      model,
      input: {
        prompt,
        ...(media.length ? { media } : {}),
      },
      parameters,
    },
  };
}

function officialSingaporePurchaseDetails(capability, {
  resolution = "720P",
  mode = "wan-std",
  model = "",
  audio = true,
} = {}) {
  const normalizedCapability = normalizeCapability(capability, { model });
  const normalizedResolution = normalizeResolution(resolution);
  let table = OFFICIAL_SINGAPORE_USD_PER_SECOND[normalizedCapability] || null;
  let rateKey = normalizedCapability === "wan-animate-move" || normalizedCapability === "wan-animate-mix"
    ? normalizeMode(mode)
    : normalizedResolution;
  const normalizedModel = String(model || "").trim().toLowerCase();
  if (normalizedCapability === "wan-legacy") {
    table = OFFICIAL_SINGAPORE_LEGACY_USD_PER_SECOND[normalizedModel] || null;
    if (table && Object.keys(table).some((key) => key.endsWith("-audio") || key.endsWith("-silent"))) {
      rateKey = `${normalizedResolution}-${audio === false ? "silent" : "audio"}`;
    } else {
      rateKey = normalizedResolution;
    }
  }
  if (!table) return null;
  const usdPerSecond = Number(table[rateKey]);
  if (!Number.isFinite(usdPerSecond)) return null;
  const listTable = OFFICIAL_SINGAPORE_LIST_USD_PER_SECOND[normalizedCapability] || null;
  const listUsdPerSecond = Number(listTable?.[rateKey]);
  const discountPercent = Number(OFFICIAL_SINGAPORE_DISCOUNT_PERCENT[normalizedCapability]);
  return {
    capability: normalizedCapability,
    model: normalizedModel,
    rateKey,
    usdPerSecond,
    listUsdPerSecond: Number.isFinite(listUsdPerSecond) ? listUsdPerSecond : usdPerSecond,
    discountPercent: Number.isFinite(discountPercent) ? discountPercent : 0,
    limitedTimeDiscount: Number.isFinite(discountPercent) && discountPercent > 0,
  };
}

function officialSingaporePurchaseRate(capability, options = {}) {
  return officialSingaporePurchaseDetails(capability, options)?.usdPerSecond ?? null;
}

function officialSingaporeLegacyPricingRows() {
  return Object.entries(OFFICIAL_SINGAPORE_LEGACY_USD_PER_SECOND).flatMap(([model, rates]) => (
    Object.keys(rates).map((rawRateKey) => {
      const [resolution, variant = ""] = rawRateKey.toLowerCase().split("-");
      return {
        key: `aliyun-wan-legacy-${model}-${rawRateKey.toLowerCase()}`,
        provider: "wan27",
        providerLabel: model,
        capability: "wan-legacy",
        model,
        resolution,
        variant,
        rateKey: rawRateKey.toLowerCase(),
        rateKind: "output",
        unit: "output_second",
      };
    })
  ));
}

module.exports = {
  ANIMATE_SYNTHESIS_PATH,
  CAPABILITIES,
  LEGACY_WAN_MODELS,
  OFFICIAL_SINGAPORE_DISCOUNT_PERCENT,
  OFFICIAL_SINGAPORE_LEGACY_USD_PER_SECOND,
  OFFICIAL_SINGAPORE_LIST_USD_PER_SECOND,
  OFFICIAL_SINGAPORE_USD_PER_SECOND,
  VIDEO_SYNTHESIS_PATH,
  buildAliyunVideoRequest,
  capabilityForModel,
  normalizeCapability,
  normalizeProvider,
  normalizeResolution,
  officialSingaporeLegacyPricingRows,
  officialSingaporePurchaseDetails,
  officialSingaporePurchaseRate,
};
