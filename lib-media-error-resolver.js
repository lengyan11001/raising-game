"use strict";

const {
  normalizeErrorLang,
  formatErrorInfo,
  catalogCategory,
  catalogRetryable,
  hasCatalogCode,
} = require("./platform.errors");

function cleanUrlPath(rawUrl = "") {
  const text = String(rawUrl || "").trim();
  if (!text) return "";
  try {
    const parsed = new URL(text);
    return `${parsed.host.toLowerCase()}${parsed.pathname}`;
  } catch {
    return text.split("?")[0].trim().toLowerCase();
  }
}

function slotMention(slot = "", index = 0) {
  const n = Number(index || 0);
  if (!Number.isInteger(n) || n <= 0) return "";
  if (slot === "reference_image") return `@Image ${n}`;
  if (slot === "reference_video") return `@Video ${n}`;
  if (slot === "reference_audio") return `@Audio ${n}`;
  return "";
}

function normalizeSlotName(raw = "") {
  const value = String(raw || "").trim().toLowerCase().replace(/[\s-]+/g, "_");
  if (["prompt", "text"].includes(value)) return "prompt";
  if (["first_frame", "firstframe", "first"].includes(value)) return "first_frame";
  if (["last_frame", "lastframe", "last"].includes(value)) return "last_frame";
  if (["reference_image", "image", "input_image"].includes(value)) return "reference_image";
  if (["reference_video", "video", "input_video"].includes(value)) return "reference_video";
  if (["reference_audio", "audio", "input_audio", "driving_audio"].includes(value)) return "reference_audio";
  if (["reference_file", "file", "document"].includes(value)) return "reference_file";
  return "";
}

function extractFileNameFromEntry(entry = {}) {
  if (!entry || typeof entry !== "object") return "";
  return String(entry.fileName || entry.name || entry.label || "").trim();
}

function extractUrlsFromEntry(entry = {}) {
  if (!entry || typeof entry !== "object") return [];
  return [
    entry.url,
    entry.publicUrl,
    entry.cdnUrl,
    entry.imageUrl,
    entry.videoUrl,
    entry.audioUrl,
    entry.previewUrl,
    entry.sourceUrl,
    entry.localUrl,
  ].map((value) => String(value || "").trim()).filter(Boolean);
}

function buildMediaSlotMap(record = {}) {
  try {
    if (!record || typeof record !== "object") return [];
    if (Array.isArray(record.mediaSlotMap) && record.mediaSlotMap.length) {
      return record.mediaSlotMap;
    }
    const entries = [];
    const counters = { reference_image: 0, reference_video: 0, reference_audio: 0, reference_file: 0 };
    const mediaAssets = Array.isArray(record.mediaAssets) ? record.mediaAssets : [];

    const metaByAssetId = new Map();
    const metaByUri = new Map();
    const metaByUrlPath = new Map();

    const registerMeta = (asset = {}) => {
      if (!asset || typeof asset !== "object") return;
      const meta = {
        assetId: String(asset.userAssetId || asset.assetId || asset.id || "").trim(),
        assetUri: String(asset.assetUri || asset.referenceAssetUri || asset.seedanceAssetUri || "").trim(),
        fileName: extractFileNameFromEntry(asset),
      };
      if (meta.assetId) metaByAssetId.set(meta.assetId, meta);
      if (meta.assetUri) {
        metaByUri.set(meta.assetUri.toLowerCase(), meta);
        const stripped = meta.assetUri.replace(/^asset:\/\//i, "").toLowerCase();
        if (stripped) metaByUri.set(stripped, meta);
      }
      for (const u of extractUrlsFromEntry(asset)) {
        const key = cleanUrlPath(u);
        if (key) metaByUrlPath.set(key, meta);
      }
    };

    mediaAssets.forEach(registerMeta);

    const enrich = (item) => {
      const candidates = [
        item.assetId && metaByAssetId.get(item.assetId),
        item.assetUri && metaByUri.get(item.assetUri.toLowerCase()),
        item.assetUri && metaByUri.get(item.assetUri.replace(/^asset:\/\//i, "").toLowerCase()),
        item.url && metaByUrlPath.get(cleanUrlPath(item.url)),
      ].filter(Boolean);
      for (const meta of candidates) {
        if (!item.assetId && meta.assetId) item.assetId = meta.assetId;
        if (!item.assetUri && meta.assetUri) item.assetUri = meta.assetUri;
        if (!item.fileName && meta.fileName) item.fileName = meta.fileName;
      }
      if (!item.mention && item.slot && item.index > 0) {
        item.mention = slotMention(item.slot, item.index);
      }
      return item;
    };

    const nextIndex = (slot) => {
      if (!Object.prototype.hasOwnProperty.call(counters, slot)) return 0;
      counters[slot] += 1;
      return counters[slot];
    };

    const upstream = record.upstreamPayload && typeof record.upstreamPayload === "object"
      ? record.upstreamPayload
      : null;

    if (upstream && Array.isArray(upstream.content)) {
      upstream.content.forEach((item, contentIndex) => {
        if (!item || typeof item !== "object") return;
        const type = String(item.type || "").toLowerCase();
        if (type === "text") {
          entries.push({ contentIndex, slot: "prompt", index: 0, mention: "" });
          return;
        }
        const role = normalizeSlotName(item.role || "");
        const kindSlot = type.includes("video")
          ? "reference_video"
          : type.includes("audio")
            ? "reference_audio"
            : "reference_image";
        const slot = role || kindSlot;
        const rawUrl = String(item.image_url?.url || item.video_url?.url || item.audio_url?.url || item.url || "").trim();
        const isAssetUri = /^asset:\/\//i.test(rawUrl);
        entries.push(enrich({
          contentIndex,
          slot,
          index: nextIndex(slot),
          url: isAssetUri ? "" : rawUrl,
          assetUri: isAssetUri ? rawUrl : "",
          assetId: "",
          fileName: "",
        }));
      });
    } else if (upstream && Array.isArray(upstream.FileInfos)) {
      upstream.FileInfos.forEach((fileInfo, fileInfoIndex) => {
        if (!fileInfo || typeof fileInfo !== "object") return;
        const usage = String(fileInfo.Usage || "").toLowerCase();
        const category = String(fileInfo.Category || "").toLowerCase();
        const slot = usage === "firstframe"
          ? "first_frame"
          : usage === "lastframe"
            ? "last_frame"
            : category === "video"
              ? "reference_video"
              : category === "audio"
                ? "reference_audio"
                : "reference_image";
        const rawUrl = String(fileInfo.Url || "").trim();
        const isAssetUri = /^asset:\/\//i.test(rawUrl);
        entries.push(enrich({
          fileInfoIndex,
          slot,
          index: nextIndex(slot),
          url: isAssetUri ? "" : rawUrl,
          assetUri: isAssetUri ? rawUrl : "",
          assetId: "",
          fileName: "",
        }));
      });
    }

    if (!entries.length && mediaAssets.length) {
      mediaAssets.forEach((asset) => {
        if (!asset || typeof asset !== "object") return;
        const slot = normalizeSlotName(asset.type || asset.role || asset.kind || "reference_image") || "reference_image";
        const urls = extractUrlsFromEntry(asset);
        const assetUri = String(asset.assetUri || asset.referenceAssetUri || asset.seedanceAssetUri || "").trim();
        entries.push(enrich({
          slot,
          index: nextIndex(slot),
          url: urls[0] || "",
          assetUri,
          assetId: String(asset.userAssetId || asset.assetId || asset.id || "").trim(),
          fileName: extractFileNameFromEntry(asset),
        }));
      });
    }

    return entries;
  } catch {
    return [];
  }
}

function publicTargetFromSlot(entry = null) {
  if (!entry || typeof entry !== "object") return null;
  const slot = normalizeSlotName(entry.slot || "");
  const index = Number(entry.index || 0);
  const mention = String(entry.mention || slotMention(slot, index) || "").trim();
  const assetId = String(entry.assetId || "").trim();
  const fileName = String(entry.fileName || entry.name || "").trim();
  if (!slot && !mention && !fileName && !assetId) return null;
  return {
    ...(slot ? { slot } : {}),
    ...(Number.isInteger(index) && index > 0 ? { index } : {}),
    ...(mention ? { mention } : {}),
    ...(assetId ? { assetId } : {}),
    ...(fileName ? { fileName } : {}),
  };
}

function extractRawUpstreamSignals(record = {}) {
  const parts = [];
  let rawCode = "";
  let rawParam = "";
  const inspect = (obj) => {
    if (!obj || typeof obj !== "object") return;
    const candidates = [
      obj.error,
      obj.Error,
      obj.Response?.Error,
      obj.Response?.AigcVideoTask,
      obj.output,
      obj.data,
      obj,
    ];
    for (const c of candidates) {
      if (!c || typeof c !== "object") continue;
      const code = String(c.code || c.Code || c.ErrCodeExt || c.ErrCode || "").trim();
      const param = String(c.param || "").trim();
      const msg = String(c.message || c.Message || c.error_message || c.fail_reason || c.msg || "").trim();
      if (code && !rawCode) rawCode = code;
      if (param && !rawParam) rawParam = param;
      if (msg) parts.push(msg);
    }
  };
  inspect(record.queryResponse);
  inspect(record.createResponse);
  if (typeof record.error === "string" && record.error.trim()) parts.push(record.error.trim());
  return {
    rawCode,
    rawParam,
    rawText: [rawCode, rawParam, ...parts].filter(Boolean).join(" | "),
  };
}

function findSlotByKindAndIndex(slotMap = [], slot = "", index = 0) {
  const normalizedSlot = normalizeSlotName(slot);
  if (!normalizedSlot) return null;
  const matched = slotMap.find((item) => item.slot === normalizedSlot && (!index || Number(item.index || 0) === Number(index)));
  if (matched) return publicTargetFromSlot(matched);
  return publicTargetFromSlot({ slot: normalizedSlot, index });
}

function pinpointMediaTarget(rawText = "", rawParam = "", slotMap = [], explicitTarget = null) {
  if (explicitTarget && typeof explicitTarget === "object") {
    const base = publicTargetFromSlot(explicitTarget);
    if (base) {
      if (base.slot && (!base.fileName || !base.assetId)) {
        const enriched = findSlotByKindAndIndex(slotMap, base.slot, base.index || 0);
        if (enriched) return { ...enriched, ...base, fileName: base.fileName || enriched.fileName, assetId: base.assetId || enriched.assetId };
      }
      return base;
    }
  }
  const combined = `${rawParam || ""} ${rawText || ""}`;
  if (!combined.trim()) return null;

  // 1. BytePlus/Seedance content[k]
  const contentMatch = combined.match(/content\[(\d+)\](?:\.([a-z_]+))?/i);
  if (contentMatch) {
    const idx = Number(contentMatch[1]);
    const byIndex = slotMap.find((item) => Number(item.contentIndex) === idx);
    if (byIndex) return publicTargetFromSlot(byIndex);
    const subField = String(contentMatch[2] || "").toLowerCase();
    if (idx === 0 && !subField) return { slot: "prompt" };
    if (subField.includes("video")) return publicTargetFromSlot({ slot: "reference_video", index: idx });
    if (subField.includes("audio")) return publicTargetFromSlot({ slot: "reference_audio", index: idx });
    if (subField.includes("image")) return publicTargetFromSlot({ slot: "reference_image", index: idx });
  }

  // 2. Tencent VOD FileInfos[k]
  const fileInfoMatch = combined.match(/FileInfos\[(\d+)\]/i);
  if (fileInfoMatch) {
    const idx = Number(fileInfoMatch[1]);
    const byIndex = slotMap.find((item) => Number(item.fileInfoIndex) === idx);
    if (byIndex) return publicTargetFromSlot(byIndex);
  }

  // 3. Explicit text index ("reference image 2", "reference video 1", "file 1", "first frame", "last frame")
  const explicitRefMatch = combined.match(/\breference[\s_]+(image|video|audio|file)\s+(\d+)\b/i);
  if (explicitRefMatch) {
    return findSlotByKindAndIndex(slotMap, `reference_${explicitRefMatch[1].toLowerCase()}`, Number(explicitRefMatch[2]));
  }
  const fileNumMatch = combined.match(/\bwan\s*3\.0\s+file\s+(\d+)\b/i);
  if (fileNumMatch) {
    return findSlotByKindAndIndex(slotMap, "reference_file", Number(fileNumMatch[1]));
  }
  if (/\bfirst[\s_-]?frame\b/i.test(combined)) {
    return findSlotByKindAndIndex(slotMap, "first_frame", 0);
  }
  if (/\blast[\s_-]?frame\b/i.test(combined)) {
    return findSlotByKindAndIndex(slotMap, "last_frame", 0);
  }

  // 4. URL match (before scrubbing URLs!)
  const urlMatches = combined.match(/https?:\/\/[^\s"'<>]+/gi) || [];
  for (const rawUrl of urlMatches) {
    const key = cleanUrlPath(rawUrl.replace(/[.,;)]+$/, ""));
    if (!key) continue;
    const byUrl = slotMap.find((item) => item.url && cleanUrlPath(item.url) === key);
    if (byUrl) return publicTargetFromSlot(byUrl);
  }

  // 5. asset:// or ResourceNotFound `<asset-id>` match
  const assetUriMatch = combined.match(/asset:\/\/([a-z0-9._-]+)/i);
  const resourceIdMatch = combined.match(/resource\s+[`'"]([a-z0-9._-]+)[`'"]/i);
  const candidateId = String(assetUriMatch?.[1] || resourceIdMatch?.[1] || "").trim().toLowerCase();
  if (candidateId) {
    const byAsset = slotMap.find((item) => {
      const uri = String(item.assetUri || "").toLowerCase();
      const id = String(item.assetId || "").toLowerCase();
      return uri === `asset://${candidateId}` || uri.endsWith(`/${candidateId}`) || uri === candidateId || id === candidateId;
    });
    if (byAsset) return publicTargetFromSlot(byAsset);
  }

  return null;
}

function inferSingleMediaTarget(slotMap = [], preferredKind = "") {
  const mediaOnly = slotMap.filter((item) => item && item.slot && item.slot !== "prompt");
  if (!mediaOnly.length) return null;
  if (preferredKind) {
    const ofKind = mediaOnly.filter((item) => item.slot.includes(preferredKind));
    if (ofKind.length === 1) return publicTargetFromSlot(ofKind[0]);
  }
  if (mediaOnly.length === 1) return publicTargetFromSlot(mediaOnly[0]);
  return null;
}

function extractNumericParams(rawText = "") {
  const params = {};
  const dimActual = rawText.match(/\b(\d{2,5})\s*[x×]\s*(\d{2,5})\b/i);
  if (dimActual) params.actual = `${dimActual[1]}x${dimActual[2]}`;
  const pxRange = rawText.match(/\b(?:between|within)\s+(\d{2,5})(?:px)?\s*(?:and|-|to)\s*(\d{2,5})px\b/i);
  if (pxRange) {
    params.minPx = Number(pxRange[1]);
    params.maxPx = Number(pxRange[2]);
  }
  const secRange = rawText.match(/\b(?:from|between)\s+(\d+(?:\.\d+)?)\s*(?:to|and|-)\s*(\d+(?:\.\d+)?)\s*seconds?\b/i);
  if (secRange) {
    params.minSec = Number(secRange[1]);
    params.maxSec = Number(secRange[2]);
  } else {
    const maxSec = rawText.match(/\b(?:exceed|total|<=?)\s*(?:the\s+)?(\d+(?:\.\d+)?)\s*s(?:econds?)?\b/i);
    if (maxSec) params.maxSec = Number(maxSec[1]);
  }
  const maxChars = rawText.match(/\b(?:exceed|fewer|max(?:imum)?)\D{0,10}(\d{3,6})\s*characters?\b/i)
    || rawText.match(/\b(\d{3,6})\s*characters?\s+or\s+fewer\b/i);
  if (maxChars) params.maxChars = Number(maxChars[1]);
  return params;
}

const CODE_ALIASES = Object.freeze({
  ASSET_FILE_MISSING: "MEDIA_NOT_FOUND",
  REFERENCE_ASSET_UNAVAILABLE: "MEDIA_NOT_FOUND",
  REFERENCE_IMAGE_NOT_FOUND: "MEDIA_NOT_FOUND",
  REFERENCE_VIDEO_NOT_FOUND: "MEDIA_NOT_FOUND",
  REFERENCE_AUDIO_NOT_FOUND: "MEDIA_NOT_FOUND",
  R2_PUBLIC_NOT_READY: "MEDIA_STILL_PREPARING",
  INVALID_REMOTE_MEDIA: "MEDIA_DOWNLOAD_FAILED",
  INVALID_REMOTE_MEDIA_URL: "MEDIA_URL_REQUIRED",
  PUBLIC_URL_REQUIRED: "MEDIA_URL_REQUIRED",
  IMAGE_DIMENSIONS_UNREADABLE: "MEDIA_DIMENSIONS_UNREADABLE",
  IMAGE_DIMENSIONS_UNSUPPORTED: "MEDIA_DIMENSIONS_INVALID",
  WAN30_IMAGE_DIMENSIONS_INVALID: "MEDIA_DIMENSIONS_INVALID",
  WAN30_VIDEO_DIMENSIONS_INVALID: "MEDIA_DIMENSIONS_INVALID",
  IMAGE_NORMALIZE_FAILED: "MEDIA_NORMALIZE_FAILED",
  SEEDANCE_IMAGE_ASPECT_RATIO_INVALID: "MEDIA_ASPECT_RATIO_INVALID",
  WAN30_IMAGE_FORMAT_INVALID: "MEDIA_FORMAT_INVALID",
  WAN30_VIDEO_FORMAT_INVALID: "MEDIA_FORMAT_INVALID",
  WAN30_AUDIO_FORMAT_INVALID: "MEDIA_FORMAT_INVALID",
  MEDIA_KIND_INVALID: "MEDIA_FORMAT_INVALID",
  MEDIA_DURATION_LIMIT_EXCEEDED: "MEDIA_DURATION_INVALID",
  WAN30_AUDIO_DURATION_INVALID: "MEDIA_DURATION_INVALID",
  WAN30_TOTAL_VIDEO_DURATION_INVALID: "MEDIA_DURATION_INVALID",
  WAN30_VIDEO_TOTAL_DURATION_INVALID: "MEDIA_DURATION_INVALID",
  MEDIA_LIMIT_EXCEEDED: "MEDIA_COUNT_EXCEEDED",
  INVALID_MEDIA_COUNT: "MEDIA_COUNT_EXCEEDED",
  INVALID_MEDIA_COMBINATION: "MEDIA_COMBINATION_INVALID",
  DATABASE_REQUIRED: "DATABASE_UNAVAILABLE",
  RATE_LIMITED: "UPSTREAM_RATE_LIMITED",
  INVALID_TARGET: "MEDIA_TARGET_INVALID",
  WRONG_TYPE: "MEDIA_WRONG_TYPE",
  MISSING_ARK_API_KEY: "MODEL_NOT_CONFIGURED",
  MISSING_ALIYUN_DASHSCOPE_API_KEY: "MODEL_NOT_CONFIGURED",
  MISSING_MULEROUTER_API_KEY: "MODEL_NOT_CONFIGURED",
  TENCENT_VOD_NOT_CONFIGURED: "MODEL_NOT_CONFIGURED",
  VIDU_NOT_CONFIGURED: "MODEL_NOT_CONFIGURED",
  STRIPE_NOT_CONFIGURED: "PAYMENT_NOT_CONFIGURED",
  PAYPAL_NOT_CONFIGURED: "PAYMENT_NOT_CONFIGURED",
  AIRWALLEX_NOT_CONFIGURED: "PAYMENT_NOT_CONFIGURED",
  STRIPE_CHECKOUT_NOT_FOUND: "CHECKOUT_NOT_FOUND",
  PAYPAL_CHECKOUT_NOT_FOUND: "CHECKOUT_NOT_FOUND",
  AIRWALLEX_CHECKOUT_NOT_FOUND: "CHECKOUT_NOT_FOUND",
  CHAT_LIVE_CHARACTER_NOT_FOUND: "CHARACTER_NOT_FOUND",
  VIDU_LIVE_CHARACTER_NOT_FOUND: "CHARACTER_NOT_FOUND",
  CHAT_LIVE_ENDED: "CHAT_SESSION_ENDED",
  CHAT_LIVE_MEMBERSHIP_REQUIRED: "MEMBERSHIP_REQUIRED",
  STORY_ASSET_VARIANT_NOT_FOUND: "STORY_ASSET_NOT_FOUND",
  INVALID_PROMPT_EXTEND: "INVALID_PARAMETERS",
  INVALID_TASK_TYPE: "INVALID_PARAMETERS",
  INVALID_DRAFT_RESOLUTION: "DRAFT_RESOLUTION_480P_REQUIRED",
  TELEGRAM_LOGIN_NOT_CONFIGURED: "MODEL_NOT_CONFIGURED",
  MODEL_TEMPORARILY_UNAVAILABLE: "MODEL_NOT_CONFIGURED",
  SUBSCRIPTIONS_DISABLED: "MEMBERSHIP_DISABLED",
  INVALID_AIRWALLEX_AMOUNT: "PAYMENT_AMOUNT_INVALID",
  OBJECT_STORAGE_REQUIRED: "SERVICE_UNAVAILABLE",
  MULEROUTER_TASK_NOT_READY: "SERVICE_UNAVAILABLE",
  WORKFLOW_CANVAS_UPDATE_IN_PROGRESS: "WORKFLOW_CANVAS_BUSY",
  CHAT_LIVE_COMPONENT_VOICE_REQUIRED: "VOICE_REQUIRED",
  CHAT_LIVE_COMPONENT_VOICE_INVALID: "VOICE_UNAVAILABLE",
  STORY_SCRIPT_REQUIRED: "STORY_CONTENT_REQUIRED",
  STORY_SOURCE_SCRIPT_NOT_FOUND: "STORY_PROJECT_NOT_FOUND",
  STORY_SCRIPT_NOT_FOUND: "STORY_PROJECT_NOT_FOUND",
  STORY_TARGET_EPISODE_NOT_FOUND: "STORY_EPISODE_NOT_FOUND",
  STORY_TARGET_SHOT_NOT_FOUND: "STORY_SHOT_NOT_FOUND",
  LIVE_DAILY_TASK_NOT_FOUND: "RESOURCE_NOT_FOUND",
});

function classifyCodeFromSignals({ prepCode = "", rawCode = "", rawText = "", target = null } = {}) {
  const explicit = String(prepCode || rawCode || "").trim();
  const text = String(rawText || "").trim();

  // 1. Specific copyright disambiguation (output audio / video / image vs input)
  if (/output.?audio.*copyright|outputaudiocopyright|outputaudiosensitivecontentdetected\.policyviolation|output video contains.*(?:bgm|music)|background music.*copyright|生成结果.*背景音乐.*版权/i.test(text)) {
    return "COPYRIGHT_OUTPUT_AUDIO";
  }
  if (/output.?video.*copyright|outputvideosensitivecontentdetected\.policyviolation/i.test(text)) {
    return "COPYRIGHT_OUTPUT_VIDEO";
  }
  if (/output.?image.*copyright|outputimagesensitivecontentdetected\.policyviolation/i.test(text)) {
    return "COPYRIGHT_OUTPUT_IMAGE";
  }
  if (/copyright|infring(?:e|ement)|版权|侵权/i.test(text)) {
    return "COPYRIGHT_INPUT_MEDIA";
  }

  // 2. Specific moderation disambiguation (real human face / input text / input media / output video / output image)
  if (/real human faces?/i.test(text)) return "MODERATION_INPUT_REAL_FACE";
  if ((/input text|content\[0\]/i.test(text) || target?.slot === "prompt")
    && /sensitive|content.?policy|moderation|safety|violat|prohibited|blocked|审核|违规|敏感/i.test(text)) {
    return "MODERATION_INPUT_TEXT";
  }
  if (/inputimagesensitivecontentdetected|input (?:image|video|audio) may contain sensitive/i.test(text)
    || (target && target.slot && target.slot !== "prompt"
      && /sensitive|content.?policy|moderation|safety|violat|prohibited|blocked|审核|违规|敏感/i.test(text))) {
    return "MODERATION_INPUT_MEDIA";
  }
  if (/outputvideosensitivecontentdetected|green net check rejected video/i.test(text)) {
    return "MODERATION_OUTPUT_VIDEO";
  }
  if (/outputimagesensitivecontentdetected|green net check rejected image/i.test(text)) {
    return "MODERATION_OUTPUT_IMAGE";
  }
  if (/content.?policy|moderation|safety|sensitive|nsfw|violat|prohibited|inappropriate|blocked|risk.?control|green net check|审核|违规|敏感|违法|色情|涉黄|内容不(?:合规|安全)/i.test(text)) {
    return "MODERATION_GENERAL";
  }

  // 3. Specific Seedance task-type constraint
  if (/TaskTypeConstraint|identified your task as video editing/i.test(text)) {
    return "SEEDANCE_EDIT_CONSTRAINT";
  }

  // 4. Direct mapped preparation/API error codes
  if (explicit) {
    if (hasCatalogCode(explicit)) return explicit;
    if (CODE_ALIASES[explicit]) return CODE_ALIASES[explicit];
  }

  // 5. Media / asset errors from raw text
  if (/resourcenotfound|specified resource .* is not found|reference (?:image|video|audio) not found|asset not found|file \d+ asset not found/i.test(text)) {
    return "MEDIA_NOT_FOUND";
  }
  if (/downloadfailed|timeout while downloading|failed to download (?:file|asset|media)/i.test(text)) {
    return "MEDIA_DOWNLOAD_FAILED";
  }
  if (/heighttoosmall|widthtoosmall|heighttoolarge|widthtoolarge|cannot be normalized within|width and height must each be between|dimensions? (?:are )?unsupported/i.test(text)) {
    return "MEDIA_DIMENSIONS_INVALID";
  }
  if (/dimensions could not be read/i.test(text)) return "MEDIA_DIMENSIONS_UNREADABLE";
  if (/could not be normalized/i.test(text)) return "MEDIA_NORMALIZE_FAILED";
  if (/aspect ratio/i.test(text) && /image|video|reference|pixel|frame/i.test(text)) return "MEDIA_ASPECT_RATIO_INVALID";
  if (/must be jpg, jpeg, png|unsupported (?:image|video|audio) format/i.test(text)) return "MEDIA_FORMAT_INVALID";
  if (/readable duration/i.test(text)) return "MEDIA_DURATION_REQUIRED";
  if (/reference (?:audio|video) \d+ duration must be|exceeds the \d+s total limit|input video duration plus output duration/i.test(text)) {
    return "MEDIA_DURATION_INVALID";
  }
  if (/requires a public (?:http\(s\) )?url/i.test(text)) return "MEDIA_URL_REQUIRED";
  if (/requires first frame|requires at least one reference/i.test(text)) return "MEDIA_COMBINATION_INVALID";

  // 6. Task parameter errors
  if (/prompt must (?:be \d+ characters or fewer|not exceed \d+)/i.test(text)) return "PROMPT_TOO_LONG";
  if (/model has been retired/i.test(text)) return "MODEL_RETIRED";
  if (/provider must be an available generation model id|unknown (?:vega )?provider/i.test(text)) return "INVALID_PROVIDER";
  if (/duration must be an integer from \d+ to \d+/i.test(text)) return "INVALID_DURATION";

  // 7. Network / rate limit / billing / auth
  if (/generation submission timed out/i.test(text)) return "GENERATION_SUBMIT_TIMEOUT";
  if (/rate.?limit|requestlimitexceeded|maximum concurrency|concurrency limit|too many requests|429\b|限流|并发(?:已满|超限)|请求过于频繁/i.test(text)) return "UPSTREAM_RATE_LIMITED";
  if (/insufficient (?:balance|credits?|quota)|balance (?:is )?(?:insufficient|low|zero)|not enough (?:balance|credits?|quota)|out of credits|quota exceeded|payment required|billing|402\b|余额|额度|欠费|积分不足/i.test(text)) {
    return "INSUFFICIENT_CREDITS";
  }
  if (/timeout|timed out|etimedout|econnreset|socket hang up|network|fetch failed|eai_again|enotfound|502\b|503\b|504\b|网络|超时/i.test(text)) {
    return "UPSTREAM_NETWORK_ERROR";
  }
  if (/unauthorized|invalid.?api.?key|authentication|401\b|403\b|鉴权|认证失败/i.test(text)) {
    return "UPSTREAM_AUTH_ERROR";
  }
  if (/invalid|unsupported|validation|bad request|400\b|parameter|not support|参数|不支持/i.test(text)) {
    return "INVALID_PARAMETERS";
  }

  return "";
}

function resolveGenerationErrorInfo(recordOrValue = null, options = {}) {
  try {
    const isRecordObj = recordOrValue && typeof recordOrValue === "object";
    const record = isRecordObj ? recordOrValue : (options.record && typeof options.record === "object" ? options.record : null);
    const rawValue = isRecordObj ? (record.error || "") : String(recordOrValue ?? "");
    const existingInfo = record?.errorInfo && typeof record.errorInfo === "object" ? record.errorInfo : null;

    const slotMap = Array.isArray(options.mediaSlotMap) && options.mediaSlotMap.length
      ? options.mediaSlotMap
      : (record ? buildMediaSlotMap(record) : []);

    const signals = record ? extractRawUpstreamSignals(record) : { rawCode: "", rawParam: "", rawText: rawValue };
    const combinedRawText = [signals.rawText, rawValue].filter(Boolean).join(" | ");
    if (!combinedRawText.trim() && !existingInfo?.code) return null;

    const explicitTarget = options.target || existingInfo?.target || null;
    let target = pinpointMediaTarget(combinedRawText, signals.rawParam, slotMap, explicitTarget);

    const prepCode = String(options.code || existingInfo?.code || record?.preparationErrorCode || "").trim();
    let code = hasCatalogCode(existingInfo?.code)
      ? existingInfo.code
      : classifyCodeFromSignals({ prepCode, rawCode: signals.rawCode, rawText: combinedRawText, target });

    // Infer single media target for clearly input-media errors when no explicit index was given
    if (!target && [
      "MODERATION_INPUT_MEDIA",
      "MODERATION_INPUT_REAL_FACE",
      "COPYRIGHT_INPUT_MEDIA",
      "MEDIA_NOT_FOUND",
      "MEDIA_DOWNLOAD_FAILED",
      "MEDIA_DIMENSIONS_INVALID",
      "MEDIA_DIMENSIONS_UNREADABLE",
      "MEDIA_NORMALIZE_FAILED",
      "MEDIA_ASPECT_RATIO_INVALID",
      "MEDIA_FORMAT_INVALID",
      "MEDIA_DURATION_INVALID",
      "MEDIA_DURATION_REQUIRED",
    ].includes(code)) {
      const preferredKind = /audio/i.test(combinedRawText)
        ? "audio"
        : /video/i.test(combinedRawText)
          ? "video"
          : /image|frame|height|width|pixel/i.test(combinedRawText)
            ? "image"
            : "";
      target = inferSingleMediaTarget(slotMap, preferredKind);
    }

    const extractedParams = extractNumericParams(combinedRawText);
    const params = {
      ...extractedParams,
      ...(existingInfo?.params && typeof existingInfo.params === "object" ? existingInfo.params : {}),
      ...(options.params && typeof options.params === "object" ? options.params : {}),
    };

    // Preserve friendly pure-Chinese manual messages if no catalog code matched
    if (!code) {
      const scrubbed = String(rawValue || "").replace(/https?:\/\/\S+/gi, "").replace(/\s+/g, " ").trim();
      if (/[\u3400-\u9fff]/.test(scrubbed) && !/[A-Za-z]{4,}/.test(scrubbed)) {
        return {
          code: "CUSTOM_MESSAGE",
          category: "unknown",
          stage: String(record?.failureStage || "upstream"),
          retryable: false,
          refunded: record?.billingStatus === "refunded",
          passthroughMessage: scrubbed.slice(0, 160),
        };
      }
      code = "GENERATION_FAILED";
    }

    return {
      code,
      category: catalogCategory(code),
      stage: String(existingInfo?.stage || record?.failureStage || "upstream"),
      retryable: catalogRetryable(code),
      refunded: record?.billingStatus === "refunded" || existingInfo?.refunded === true,
      ...(target ? { target } : {}),
      ...(Object.keys(params).length ? { params } : {}),
    };
  } catch {
    return {
      code: "GENERATION_FAILED",
      category: "unknown",
      stage: "upstream",
      retryable: true,
      refunded: false,
    };
  }
}

function publicGenerationErrorText(value = "", options = {}) {
  try {
    const lang = normalizeErrorLang(options.lang, "zh");
    const hasRecord = Boolean(options.record && typeof options.record === "object");
    const rawStr = String(value ?? "").trim();
    if (!rawStr && !hasRecord) return "";
    if (!rawStr && hasRecord && !options.record.error && !options.record.errorInfo) return "";

    const info = resolveGenerationErrorInfo(hasRecord ? options.record : rawStr, options);
    if (!info) return "";
    if (info.code === "CUSTOM_MESSAGE" && info.passthroughMessage) return info.passthroughMessage;
    const formatted = formatErrorInfo(info, lang);
    if (formatted) return formatted;
    return formatErrorInfo({ code: "GENERATION_FAILED" }, lang);
  } catch {
    return "";
  }
}

function classifyHttpDomainCode(rawCode = "", rawMessage = "", statusCode = 0) {
  const code = String(rawCode || "").trim();
  const msg = String(rawMessage || "").trim();
  if (code) {
    if (hasCatalogCode(code)) return code;
    if (CODE_ALIASES[code]) return CODE_ALIASES[code];
  }
  if (!msg) {
    if (statusCode === 401) return "LOGIN_REQUIRED";
    if (statusCode === 403) return "FORBIDDEN";
    if (statusCode === 404) return "API_NOT_FOUND";
    if (statusCode >= 500) return "SERVER_ERROR";
    return "";
  }
  // Exact / high-confidence domain matches across the whole platform API
  if (/^api not found\.?$/i.test(msg)) return "API_NOT_FOUND";
  if (/^forbidden\.?$/i.test(msg)) return "FORBIDDEN";
  if (/^prompt is required\.?$/i.test(msg)) return "PROMPT_REQUIRED";
  if (/first[- ]frame image is required|first frame is required|requires first frame/i.test(msg)) return "FIRST_FRAME_REQUIRED";
  if (/last[- ]frame image is required|last frame is required|requires last frame/i.test(msg)) return "LAST_FRAME_REQUIRED";
  if (/^audio is required\.?$|reference audio is required/i.test(msg)) return "AUDIO_REQUIRED";
  if (/source video is required/i.test(msg)) return "SOURCE_VIDEO_REQUIRED";
  if (/^image is required\.?$/i.test(msg)) return "IMAGE_REQUIRED";
  if (/^generation record not found\.?$/i.test(msg)) return "GENERATION_RECORD_NOT_FOUND";
  if (/cannot be regenerated yet/i.test(msg)) return "RECORD_CANNOT_REGENERATE";
  if (/record has no video result/i.test(msg)) return "RECORD_NO_VIDEO_RESULT";
  if (/^(?:asset|video|generated media) (?:not found|is unavailable)\.?$|^素材不存在。?$/i.test(msg)) return "ASSET_NOT_FOUND";
  if (/^(?:character not found\.?|角色不存在。?|没有找到这个角色。?|角色不存在、未公开或未启用。?)$/i.test(msg)) return "CHARACTER_NOT_FOUND";
  if (/^(?:chat not found\.?|message not found\.?|会话不存在。?|房间不存在或已关闭。?)$/i.test(msg)) return "CHAT_NOT_FOUND";
  if (/^会话已经结束。?$|session has (?:already )?ended/i.test(msg)) return "CHAT_SESSION_ENDED";
  if (/^在线聊天暂未开放。?$/i.test(msg)) return "CHAT_LIVE_DISABLED";
  if (/^消息不能为空。?$/i.test(msg)) return "CHAT_MESSAGE_REQUIRED";
  if (/^(?:礼物不存在。?|这个礼物暂时不可用。?)$/i.test(msg)) return "GIFT_UNAVAILABLE";
  if (/^礼物暂时没有送出，积分已退回。?$/i.test(msg)) return "GIFT_SEND_FAILED_REFUNDED";
  if (/^(?:工单不存在。?|support ticket not found\.?)$/i.test(msg)) return "SUPPORT_TICKET_NOT_FOUND";
  if (/^workflow (?:canvas )?not found\.?$/i.test(msg)) return "WORKFLOW_CANVAS_NOT_FOUND";
  if (/^workflow storage is unavailable\.?$|^this tool requires database storage\.?$/i.test(msg)) return "DATABASE_UNAVAILABLE";
  if (/^剧集项目不存在。?$/i.test(msg)) return "STORY_PROJECT_NOT_FOUND";
  if (/^剧集不存在。?$/i.test(msg)) return "STORY_EPISODE_NOT_FOUND";
  if (/^资产不存在。?$|^资产设计图不存在。?$/i.test(msg)) return "STORY_ASSET_NOT_FOUND";
  if (/^镜头不存在。?$/i.test(msg)) return "STORY_SHOT_NOT_FOUND";
  if (/^sub token not found\.?$/i.test(msg)) return "SUBTOKEN_NOT_FOUND";
  if (/^(?:通知不存在。?|notification not found\.?)$/i.test(msg)) return "NOTIFICATION_NOT_FOUND";
  if (/^(?:场景不存在。?|scene not found\.?)$/i.test(msg)) return "SCENE_NOT_FOUND";
  if (/^(?:用户不存在。?|user not found\.?)$/i.test(msg)) return "USER_NOT_FOUND";
  if (/^至少要保留一名管理员。?$/i.test(msg)) return "ADMIN_MINIMUM_REQUIRED";
  if (/enter a valid email address/i.test(msg)) return "INVALID_EMAIL";
  if (/invalid or expired verification code/i.test(msg)) return "INVALID_VERIFICATION_CODE";
  if (/invalid username or password|invalid email or password/i.test(msg)) return "INVALID_CREDENTIALS";
  if (/paypal amount must be between|stripe amount|invalid amount/i.test(msg)) return "PAYMENT_AMOUNT_INVALID";
  if (/checkout session not found/i.test(msg)) return "CHECKOUT_NOT_FOUND";
  if (/payment order not found/i.test(msg)) return "ORDER_NOT_FOUND";
  if (/unlock video is still generating/i.test(msg)) return "UNLOCK_GENERATING";
  if (/unlock this result first/i.test(msg)) return "RESULT_LOCKED";
  if (/must be \d+mb or smaller/i.test(msg)) return "MEDIA_TOO_LARGE";
  if (/source video duration could not be read|read the source video duration/i.test(msg)) return "MEDIA_DURATION_REQUIRED";
  if (/^please sign in to continue\.?$/i.test(msg)) return "LOGIN_REQUIRED";
  if (/^unlock required\.?$/i.test(msg)) return "RESULT_LOCKED";
  if (/link expired\.?$/i.test(msg)) return "MEDIA_LINK_EXPIRED";
  if (/document assets are currently supported only for wan 3\.0/i.test(msg)) return "DOCUMENT_WAN30_ONLY";
  if (/^(?:请填写有效邮箱。?)$/.test(msg)) return "INVALID_EMAIL";
  if (/^(?:请填写问题描述。?|标题和内容不能为空。?)$/.test(msg)) return "SUPPORT_MESSAGE_REQUIRED";
  if (/^(?:消息不存在。?)$/.test(msg)) return "CHAT_NOT_FOUND";
  if (/^method not allowed\.?$/i.test(msg)) return "METHOD_NOT_ALLOWED";
  if (/^server error\.?$/i.test(msg)) return "SERVER_ERROR";
  return "";
}

function genericStatusCodeFallback(statusCode = 0) {
  if (statusCode === 401) return "LOGIN_REQUIRED";
  if (statusCode === 402) return "INSUFFICIENT_CREDITS";
  if (statusCode === 403) return "FORBIDDEN";
  if (statusCode === 404 || statusCode === 410) return "RESOURCE_NOT_FOUND";
  if (statusCode === 405) return "METHOD_NOT_ALLOWED";
  if (statusCode === 409) return "CONFLICT";
  if (statusCode === 413) return "MEDIA_TOO_LARGE";
  if (statusCode === 429) return "UPSTREAM_RATE_LIMITED";
  if (statusCode === 502 || statusCode === 504) return "UPSTREAM_NETWORK_ERROR";
  if (statusCode === 503) return "SERVICE_UNAVAILABLE";
  if (statusCode >= 500) return "SERVER_ERROR";
  if (statusCode >= 400) return "REQUEST_INVALID";
  return "";
}

function messageLanguageHint(text = "") {
  const s = String(text || "").trim();
  if (!s) return "";
  if (/[\u3400-\u9fff]/.test(s)) return "zh";
  if (/[A-Za-z]{3,}/.test(s)) return "en";
  return "";
}

function resolveHttpErrorInfo(payload = {}, options = {}) {
  try {
    if (!payload || typeof payload !== "object") return null;
    if (payload.errorInfo && typeof payload.errorInfo === "object" && hasCatalogCode(payload.errorInfo.code)) {
      return payload.errorInfo;
    }
    const rawCode = String(payload.code || "").trim();
    const rawMessage = String(payload.message || payload.error || "").trim();
    const statusCode = Number(options.statusCode || 0);
    if (!rawCode && !rawMessage && !statusCode) return null;
    const target = pinpointMediaTarget(rawMessage, "", options.mediaSlotMap || [], payload.target || options.target || null);
    let generic = false;
    let code = classifyHttpDomainCode(rawCode, rawMessage, statusCode);
    if (!code) {
      const signaled = classifyCodeFromSignals({ prepCode: rawCode, rawCode, rawText: rawMessage, target });
      if (signaled && !(signaled === "INVALID_PARAMETERS" && !rawCode)) {
        code = signaled;
      }
    }
    if (!code) {
      code = genericStatusCodeFallback(statusCode);
      generic = Boolean(code);
    }
    if (!code) return null;
    const params = {
      ...extractNumericParams(rawMessage),
      ...(payload.details && typeof payload.details === "object" ? {
        ...(Number(payload.details.min || 0) > 0 && /duration/i.test(rawCode + rawMessage) ? { minSec: Number(payload.details.min) } : {}),
        ...(Number(payload.details.max || 0) > 0 && /duration/i.test(rawCode + rawMessage) ? { maxSec: Number(payload.details.max) } : {}),
      } : {}),
      ...(payload.errorParams && typeof payload.errorParams === "object" ? payload.errorParams : {}),
    };
    const sourceLang = generic ? messageLanguageHint(rawMessage) : "";
    return {
      code,
      category: catalogCategory(code),
      stage: "validation",
      retryable: catalogRetryable(code),
      ...(generic ? { generic: true } : {}),
      ...(sourceLang ? { sourceLang } : {}),
      ...(target ? { target } : {}),
      ...(Object.keys(params).length ? { params } : {}),
    };
  } catch {
    return null;
  }
}

module.exports = {
  buildMediaSlotMap,
  pinpointMediaTarget,
  resolveGenerationErrorInfo,
  resolveHttpErrorInfo,
  publicGenerationErrorText,
  extractNumericParams,
};


