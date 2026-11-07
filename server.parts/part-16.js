async function handleVolcengineGetGenerationTask(req, res, taskId) {
  const auth = await requireUser(req, res);
  if (!auth) return;
  const record = await findOwnGenerationRecordByTaskId(auth, taskId);
  if (!record) {
    return sendJson(res, 404, { error: { code: "TASK_NOT_FOUND", message: "Generation task not found." } });
  }
  const upstreamTaskId = record.upstreamTaskId || record.taskId;
  let raw = record.queryResponse || record.createResponse || officialSeedanceResponseFromRecord(record);
  if (record.upstreamSource === "ignex" && !isImageGenerationRecord(record) && shouldRefreshGenerationRecord(record)) {
    try {
      const refreshed = await refreshIgnexGenerationRecord(record, "volcengine-ignex-query");
      raw = officialSeedanceResponseFromRecord(refreshed);
    } catch (error) {
      raw = officialSeedanceResponseFromRecord(record);
    }
  } else if (ARK_API_KEY && !isImageGenerationRecord(record) && shouldRefreshGenerationRecord(record)) {
    try {
      raw = await arkRequest("GET", `/contents/generations/tasks/${encodeURIComponent(upstreamTaskId)}`);
      const task = normalizeTask(raw);
      await upsertAndSettleGenerationRecord({
        taskId: record.taskId,
        upstreamTaskId: task.taskId || upstreamTaskId,
        status: task.status || record.status || "unknown",
        remoteVideoUrl: task.videoUrl || record.remoteVideoUrl || "",
        error: task.error || "",
        queryResponse: raw,
      }, "volcengine-query");
    } catch (error) {
      raw = record.queryResponse || record.createResponse || officialSeedanceResponseFromRecord(record);
    }
  } else if (needsSeedanceFailureRefund(record) || (seedanceUsesTokenPricing(record) && isSucceededStatus(record.status) && !record.billingSettledAt)) {
    await settleSeedanceGenerationRecord(record, "volcengine-query");
  }
  return sendJson(res, 200, raw);
}

function normalizeWan27Resolution(value = "") {
  const normalized = String(value || "").trim().toUpperCase();
  if (normalized === "480P") return "480P";
  if (normalized === "1080P") return "1080P";
  if (normalized === "2K" || normalized === "4K" || normalized === "2160P") return normalized === "2160P" ? "4K" : normalized;
  if (normalized === "720P") return "720P";
  return "";
}

function optionalWan27Seed(value) {
  if (value === undefined || value === null || value === "") return null;
  const seed = Number(value);
  if (!Number.isFinite(seed) || seed < 0) return null;
  return Math.min(2147483647, Math.floor(seed));
}

function comparableHttpMediaUrl(value = "") {
  const text = String(value || "").trim();
  if (!text) return "";
  try {
    const parsed = new URL(text);
    return `${parsed.protocol.toLowerCase()}//${parsed.hostname.toLowerCase()}${parsed.pathname}`;
  } catch {
    return text.replace(/[?#].*$/, "").replace(/\/+$/, "").toLowerCase();
  }
}

function isSameHttpMediaUrl(left = "", right = "") {
  const first = comparableHttpMediaUrl(left);
  const second = comparableHttpMediaUrl(right);
  return Boolean(first && second && first === second);
}

function isSubmittedWan27InputVideo(videoUrl = "", inputUrls = []) {
  return (Array.isArray(inputUrls) ? inputUrls : []).some((inputUrl) => isSameHttpMediaUrl(videoUrl, inputUrl));
}

function normalizeWan27Task(raw = {}) {
  const output = raw.output || raw.data?.output || raw.data || raw;
  const task = raw.task || raw.data?.task || {};
  return {
    taskId:
      output.task_id ||
      output.taskId ||
      task.task_id ||
      task.taskId ||
      raw.task_id ||
      raw.taskId ||
      raw.id ||
      "",
    status:
      output.task_status ||
      output.status ||
      task.task_status ||
      task.status ||
      raw.task_status ||
      raw.status ||
      "unknown",
    videoUrl:
      output.video_url ||
      output.videoUrl ||
      output.results?.[0]?.url ||
      output.results?.[0]?.video_url ||
      findVideoUrl(raw) ||
      "",
    error:
      output.message ||
      output.error_message ||
      output.error?.message ||
      raw.message ||
      raw.error_message ||
      raw.error?.message ||
      "",
  };
}

async function aliyunDashscopeRequest(pathname, {
  method = "POST",
  body = null,
  asyncTask = false,
  provider = "wan27",
  prime = false,
  timeoutMs = 0,
} = {}) {
  const normalizedProvider = normalizeAdvancedProvider(provider);
  const wan30 = normalizedProvider === "wan30" || String(provider || "").toLowerCase() === "aliyun-wan30";
  const qwenImage3 = normalizedProvider === "qwen-image3";
  // A node-scoped Agentic Mobile key opts Prime into the new endpoint. When
  // it is absent, keep using the existing Wan endpoint and credentials.
  const useWan30PrimeNode = wan30 && prime && Boolean(ALIYUN_WAN30_PRIME_API_KEY);
  const baseUrl = qwenImage3
    ? QWEN_IMAGE3_SINGAPORE_BASE_URL
    : useWan30PrimeNode
      ? ALIYUN_WAN30_PRIME_BASE_URL
      : wan30
        ? ALIYUN_WAN30_BASE_URL
        : ALIYUN_DASHSCOPE_BASE_URL;
  const apiKey = qwenImage3
    ? ALIYUN_QWEN_IMAGE3_API_KEY
    : useWan30PrimeNode
      ? (ALIYUN_WAN30_PRIME_API_KEY || ALIYUN_WAN30_API_KEY)
      : wan30
        ? ALIYUN_WAN30_API_KEY
        : ALIYUN_DASHSCOPE_API_KEY;
  if (!apiKey) {
    const error = new Error(`${qwenImage3 ? "Qwen Image 3.0" : useWan30PrimeNode ? "Wan3.0 Prime Agentic Mobile" : wan30 ? "Wan3.0" : "Alibaba video"} generation is not configured.`);
    error.statusCode = 503;
    error.code = qwenImage3
      ? "MISSING_ALIYUN_QWEN_IMAGE3_API_KEY"
      : useWan30PrimeNode
        ? "MISSING_ALIYUN_WAN30_PRIME_API_KEY"
        : wan30
          ? "MISSING_ALIYUN_WAN30_API_KEY"
          : "MISSING_ALIYUN_DASHSCOPE_API_KEY";
    throw error;
  }
  const normalizedMethod = String(method || "POST").toUpperCase();
  const queryRequest = normalizedMethod === "GET";
  const submitRequest = normalizedMethod === "POST";
  const maxAttempts = queryRequest ? 2 : (submitRequest ? 3 : 2);
  const requestTimeoutMs = Math.max(5000, Number(timeoutMs || (queryRequest ? 20000 : 180000)) || 180000);
  let lastError = null;
  const transientPattern = /fetch failed|timeout|timed out|abort|econn|network|socket|dns|tls|reset/i;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const response = await fetch(`${baseUrl}${pathname}`, {
        method: normalizedMethod,
        headers: {
          authorization: `Bearer ${apiKey}`,
          accept: "application/json",
          ...(body ? { "content-type": "application/json" } : {}),
          ...(body && ALIYUN_DASHSCOPE_DATA_INSPECTION_HEADER ? { "X-DashScope-DataInspection": ALIYUN_DASHSCOPE_DATA_INSPECTION_HEADER } : {}),
          ...(asyncTask ? { "X-DashScope-Async": "enable" } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(requestTimeoutMs),
      });
      const text = await response.text();
      let payload = {};
      try {
        payload = text ? JSON.parse(text) : {};
      } catch {
        payload = { text };
      }
      if (!response.ok || payload.code >= 400) {
        const error = new Error(payload.message || payload.error?.message || payload.output?.message || `Alibaba video request failed: ${response.status}`);
        error.statusCode = response.status || 502;
        error.payload = payload;
        error.code = payload.code || payload.error?.code || "";
        error.retryable = (queryRequest || submitRequest) && (response.status === 408 || response.status === 425 || response.status === 429 || response.status >= 500);
        throw error;
      }
      return payload;
    } catch (error) {
      lastError = error;
      const causeCode = String(error?.cause?.code || error?.code || "");
      const transientNetworkError = (queryRequest || submitRequest)
        && !error.statusCode
        && transientPattern.test(`${String(error.message || error)} ${causeCode}`);
      if (attempt >= maxAttempts || (!error.retryable && !transientNetworkError)) {
        if (!error.statusCode && transientNetworkError) {
          const wrapped = new Error(`Alibaba video request failed: ${error.message || "fetch failed"}${causeCode ? ` (${causeCode})` : ""}`);
          wrapped.statusCode = 502;
          wrapped.code = "ALIYUN_DASHSCOPE_NETWORK_ERROR";
          wrapped.cause = error;
          throw wrapped;
        }
        throw error;
      }
      console.warn("[aliyun-dashscope-retry]", JSON.stringify({
        provider: normalizedProvider,
        method: normalizedMethod,
        path: pathname,
        attempt,
        maxAttempts,
        statusCode: error.statusCode || 0,
        code: causeCode || error.code || "",
        message: String(error.message || error).slice(0, 180),
      }));
      await delay(700 * attempt);
    }
  }
  const causeCode = String(lastError?.cause?.code || lastError?.code || "");
  const wrapped = new Error(`Alibaba video request failed: ${lastError?.message || "unknown error"}${causeCode ? ` (${causeCode})` : ""}`);
  wrapped.statusCode = lastError?.statusCode || 502;
  wrapped.code = lastError?.code || "ALIYUN_DASHSCOPE_REQUEST_FAILED";
  wrapped.cause = lastError;
  throw wrapped;
}

function qwen37FlashChatCompletionsUrl() {
  if (/\/compatible-mode\/v1$/i.test(ALIYUN_QWEN37_BASE_URL)) {
    return `${ALIYUN_QWEN37_BASE_URL}/chat/completions`;
  }
  return `${ALIYUN_QWEN37_BASE_URL}/compatible-mode/v1/chat/completions`;
}

async function aliyunQwen37FlashRequest(body = {}, { timeoutMs = 180000 } = {}) {
  if (!ALIYUN_QWEN37_API_KEY) {
    const error = new Error("Qwen3.7 Flash is not configured.");
    error.statusCode = 503;
    error.code = "MISSING_ALIYUN_QWEN37_API_KEY";
    throw error;
  }
  const maxAttempts = 3;
  const transientPattern = /fetch failed|timeout|timed out|abort|econn|network|socket|dns|tls|reset/i;
  let lastError = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const response = await fetch(qwen37FlashChatCompletionsUrl(), {
        method: "POST",
        headers: {
          authorization: `Bearer ${ALIYUN_QWEN37_API_KEY}`,
          accept: "application/json",
          "content-type": "application/json",
          "X-DashScope-DataInspection": ALIYUN_DASHSCOPE_DATA_INSPECTION_HEADER,
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(Math.max(5000, Number(timeoutMs || 180000) || 180000)),
      });
      const responseText = await response.text();
      let payload = {};
      try {
        payload = responseText ? JSON.parse(responseText) : {};
      } catch {
        payload = { text: responseText };
      }
      if (!response.ok || Number(payload.code || 0) >= 400 || payload.error) {
        const error = new Error(payload.error?.message || payload.message || `Qwen3.7 Flash request failed: ${response.status}`);
        error.statusCode = response.status || 502;
        error.code = payload.error?.code || payload.code || "QWEN37_FLASH_REQUEST_FAILED";
        error.payload = payload;
        error.retryable = [408, 425, 429, 500, 502, 503, 504, 520, 522].includes(response.status);
        throw error;
      }
      return payload;
    } catch (error) {
      lastError = error;
      const causeCode = String(error?.cause?.code || error?.code || "");
      const transientNetworkError = !error.statusCode && transientPattern.test(`${String(error.message || error)} ${causeCode}`);
      if (attempt >= maxAttempts || (!error.retryable && !transientNetworkError)) {
        if (!error.statusCode && transientNetworkError) {
          const wrapped = new Error(`Qwen3.7 Flash request failed: ${error.message || "fetch failed"}${causeCode ? ` (${causeCode})` : ""}`);
          wrapped.statusCode = 502;
          wrapped.code = "QWEN37_FLASH_NETWORK_ERROR";
          wrapped.cause = error;
          throw wrapped;
        }
        throw error;
      }
      console.warn("[qwen37-flash-retry]", JSON.stringify({
        attempt,
        maxAttempts,
        statusCode: error.statusCode || 0,
        code: causeCode || error.code || "",
        message: String(error.message || error).slice(0, 180),
      }));
      await delay(700 * attempt);
    }
  }
  throw lastError || Object.assign(new Error("Qwen3.7 Flash request failed."), { statusCode: 502 });
}

function papayaPricingEstimate(advancedPricing = DEFAULT_ADVANCED_PRICING, options = {}) {
  const pricing = normalizeAdvancedPricing(advancedPricing);
  const inputTokens = Math.max(1, Math.min(256000, Math.floor(Number(options.inputTokens || options.promptTokens || 1) || 1)));
  const outputTokens = Math.max(0, Math.min(QWEN37_FLASH_MAX_OUTPUT_TOKENS, Math.floor(Number(options.outputTokens ?? options.completionTokens ?? options.maxTokens ?? 8192) || 0)));
  const inputUsd = (inputTokens * 0.15) / 1000000;
  const outputUsd = (outputTokens * 0.45) / 1000000;
  const totalUsd = inputUsd + outputUsd;
  const totalCny = totalUsd * Number(INTERNAL_CNY_PER_USD || 5);
  const baseCredits = creditsAmount(totalCny * Number(pricing.creditsPerCny || ADVANCED_CREDITS_PER_CNY));
  return {
    provider: "papaya",
    providerLabel: "Papaya 1.0",
    model: PAPAYA_MODEL,
    inputTokens,
    outputTokens,
    inputUsdPerMillionTokens: 0.15,
    outputUsdPerMillionTokens: 0.45,
    totalUsd: pricingNumber(totalUsd, 0, 0, 8),
    totalCny: pricingNumber(totalCny, 0, 0, 8),
    baseCredits,
    credits: baseCredits,
    markup: 1,
    source: "mulerouter_papaya_token_pricing",
  };
}

async function papayaLanguageRequest(body = {}, { timeoutMs = 180000 } = {}) {
  const key = String(process.env.MULEROUTER_API_KEY || "").trim();
  if (!key) {
    const error = new Error("Papaya is not configured.");
    error.statusCode = 503;
    error.code = "MISSING_MULEROUTER_API_KEY";
    throw error;
  }
  const base = String(process.env.MULEROUTER_API_BASE || "https://api.mulerouter.ai").replace(/\/+$/, "");
  const response = await fetch(`${base}/vendors/openai/v1/chat/completions`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${key}`,
      accept: "application/json",
      "content-type": "application/json",
      "user-agent": "raising-game-demo/papaya",
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(Math.max(5000, Number(timeoutMs || 180000) || 180000)),
  });
  const responseText = await response.text();
  let payload = {};
  try { payload = responseText ? JSON.parse(responseText) : {}; } catch { payload = { text: responseText }; }
  if (!response.ok || payload.error) {
    const error = new Error(payload.error?.message || payload.message || `Papaya request failed: ${response.status}`);
    error.statusCode = response.status || 502;
    error.code = payload.error?.code || payload.code || "PAPAYA_REQUEST_FAILED";
    error.payload = payload;
    throw error;
  }
  return payload;
}

async function papayaImageDataUrls(auth, body = {}) {
  const items = [
    ...arrayFromBody(body.referenceImages),
    ...arrayFromBody(body.reference_images),
    ...arrayFromBody(body.images),
  ];
  if (items.length > 4) {
    throw advancedValidationError("PAPAYA_TOO_MANY_IMAGES", "Papaya supports at most 4 images.", { count: items.length, max: 4 });
  }
  if (!items.length) return [];
  const db = await readDb();
  const urls = [];
  for (const item of items) {
    const direct = typeof item === "string" ? item : String(item?.dataUrl || item?.url || item?.imageUrl || "");
    if (direct.startsWith("data:image/")) {
      urls.push(direct);
      continue;
    }
    const assetId = typeof item === "object" && item ? String(item.assetId || item.id || "") : "";
    if (!assetId) continue;
    const asset = (db.userAssets || []).find((entry) => entry && entry.id === assetId && entry.userId === auth.user.id && !isSoftDeleted(entry));
    if (!asset) continue;
    const dataUrl = await dataUrlForUserAsset(asset);
    if (String(dataUrl).startsWith("data:image/")) urls.push(dataUrl);
  }
  if (items.length && !urls.length) {
    throw advancedValidationError("PAPAYA_IMAGE_UNREADABLE", "Papaya could not read the selected images.");
  }
  return urls;
}

async function byteplusLanguageRequest(body = {}, { timeoutMs = 180000 } = {}) {
  if (!ARK_API_KEY) {
    const error = new Error("BytePlus Language is not configured.");
    error.statusCode = 503;
    error.code = "MISSING_ARK_API_KEY";
    throw error;
  }
  const response = await fetch(`${ARK_BASE_URL.replace(/\/+$/, "")}/chat/completions`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${ARK_API_KEY}`,
      accept: "application/json",
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(Math.max(5000, Number(timeoutMs || 180000) || 180000)),
  });
  const responseText = await response.text();
  let payload = {};
  try { payload = responseText ? JSON.parse(responseText) : {}; } catch { payload = { text: responseText }; }
  if (!response.ok || payload.error) {
    const error = new Error(payload.error?.message || payload.message || `BytePlus Language request failed: ${response.status}`);
    error.statusCode = response.status || 502;
    error.code = payload.error?.code || payload.code || "BYTEPLUS_LANGUAGE_REQUEST_FAILED";
    error.payload = payload;
    throw error;
  }
  return payload;
}

function chatCharacterView(item = {}) {
  return publicAssetUrlsForClient({
    id: String(item.id || ""),
    name: String(item.name || item.title || "Character"),
    description: String(item.description || item.summary || item.title || ""),
    posterUrl: characterPosterForGeo(item),
    tags: characterTagsForGeo(item, 8),
    creatorUsername: String(item.creatorUsername || ""),
  });
}

function ownedCustomChatCharacter(auth, characterId = "") {
  const id = String(characterId || "").trim();
  const userId = String(auth?.user?.id || "");
  if (!id || !userId) return null;
  if (id.startsWith("custom:")) {
    const assetId = id.slice("custom:".length);
    const asset = (auth.db?.userAssets || []).find((entry) => entry && entry.id === assetId && entry.userId === userId && !isSoftDeleted(entry));
    if (!asset) return null;
    const image = String(asset.previewUrl || asset.localUrl || asset.publicUrl || "").trim();
    const persona = String(asset.characterPrompt || asset.name || "").trim();
    return {
      id,
      name: asset.name || "Custom character",
      title: persona,
      summary: persona,
      description: persona,
      posterUrl: image,
      localImageUrl: image,
      sourceImageUrl: image,
      publicImageUrl: image,
      characterImageUrl: image,
      tags: [],
      chatGreeting: "",
      source: "custom-asset",
    };
  }
  const record = (auth.db?.userCharacters || []).find((entry) => entry && entry.id === id && entry.userId === userId && !isSoftDeleted(entry));
  if (!record) return null;
  const image = String(record.publicImageUrl || record.cdnImageUrl || record.posterUrl || record.localImageUrl || record.sourceImageUrl || "").trim();
  const persona = [record.prompt, record.title].map((item) => String(item || "").trim()).filter(Boolean).join("\n");
  return {
    id: record.id,
    name: record.name || "My character",
    title: record.title || "",
    summary: record.title || "",
    description: persona || record.name || "",
    posterUrl: image,
    localImageUrl: image,
    sourceImageUrl: image,
    publicImageUrl: image,
    characterImageUrl: image,
    tags: [],
    chatGreeting: "",
    source: "user-character",
  };
}

async function chatCharacterById(characterId = "") {
  const config = await readAppConfig();
  const items = normalizeHomeVideo(config.homeVideo || {}).items || [];
  const found = items.find((item) => String(item.id || "") === String(characterId || "")) || null;
  if (found) return found;
  /* 后台「在线聊天配置」里自建的角色同样可以文字聊：人设直接取配置里的 persona */
  const live = await getChatLiveCharacterInDb(characterId);
  if (!live || live.enabled === false) return null;
  const livePersona = String(live.personaMd || live.persona || live.intro || "").trim();
  return {
    id: live.id,
    name: live.name || "Character",
    title: live.intro || "",
    summary: live.intro || "",
    description: livePersona,
    persona: livePersona,
    personaMd: String(live.personaMd || "").trim(),
    replyStyle: live.replyStyle || "",
    posterUrl: live.portraitUrl || live.avatarUrl || "",
    characterImageUrl: live.portraitUrl || live.avatarUrl || "",
    tags: Array.isArray(live.tags) ? live.tags : [],
    chatGreeting: live.greeting || "",
    source: "chat-live",
  };
}

async function recordEffectiveInteractionDay(userId = "", characterId = "", source = "text") {
  const cleanUserId = String(userId || "").trim();
  const cleanCharacterId = String(characterId || "").trim();
  if (!cleanUserId || !cleanCharacterId) return publicCharacterRelationship(null, cleanCharacterId);
  const current = await getCharacterRelationshipInDb(cleanUserId, cleanCharacterId);
  const next = nextCharacterRelationship(current, cleanCharacterId, new Date(), source);
  next.userId = cleanUserId;
  next.stage = intimacyStageForDays(next.effectiveDays).id;
  await upsertCharacterRelationshipInDb(next);
  return publicCharacterRelationship(next, cleanCharacterId);
}

function publicChatConversation(conversation = {}) {
  return publicAssetUrlsForClient({
    id: conversation.id,
    characterId: conversation.characterId,
    character: conversation.character || {},
    title: conversation.title || conversation.character?.name || "Chat",
    style: conversation.style || "balanced",
    memory: conversation.memory || "",
    instructions: conversation.instructions || "",
    tracker: plainObject(conversation.tracker),
    trackerUpdatedAt: conversation.trackerUpdatedAt || "",
    relationship: conversation.relationship || publicCharacterRelationship(null, conversation.characterId),
    backgroundEnabled: conversation.backgroundEnabled !== false,
    lastMessage: conversation.lastMessage || "",
    createdAt: conversation.createdAt,
    updatedAt: conversation.updatedAt,
  });
}

function publicChatMessage(message = {}) {
  return publicAssetUrlsForClient({
    id: message.id,
    conversationId: message.conversationId,
    role: message.role === "user" ? "user" : "assistant",
    content: String(message.content || ""),
    kind: String(message.kind || "text"),
    imageUrl: String(message.imageUrl || ""),
    videoUrl: String(message.videoUrl || ""),
    taskId: String(message.taskId || ""),
    status: String(message.status || ""),
    error: String(message.error || ""),
    createdAt: message.createdAt,
  });
}

function parseChatTrackerJson(value = "") {
  const source = String(value || "").trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  try {
    const parsed = JSON.parse(source);
    return {
      dateTime: String(parsed.dateTime || parsed.date_time || "").trim().slice(0, 160),
      location: String(parsed.location || "").trim().slice(0, 240),
      outfit: String(parsed.outfit || "").trim().slice(0, 400),
      relationship: String(parsed.relationship || "").trim().slice(0, 240),
      mood: String(parsed.mood || "").trim().slice(0, 160),
    };
  } catch {
    return null;
  }
}

function refreshChatTrackerInBackground(conversation = {}, messages = []) {
  setImmediate(async () => {
    try {
      const transcript = messages.slice(-12).map((message) => `${message.role === "user" ? "User" : conversation.character?.name || "Character"}: ${String(message.content || "").slice(0, 1200)}`).join("\n");
      const raw = await byteplusLanguageRequest({
        model: BYTEPLUS_LANGUAGE_MODEL,
        messages: [
          { role: "system", content: "Extract the current roleplay scene state. Return only valid JSON with keys dateTime, location, outfit, relationship, mood. Use an empty string when unknown." },
          { role: "user", content: `Character: ${conversation.character?.name || conversation.title}\nBackground: ${conversation.character?.description || ""}\nConversation:\n${transcript}` },
        ],
        temperature: 0.1,
        max_tokens: 220,
      }, { timeoutMs: 60000 });
      const tracker = parseChatTrackerJson(qwen37FlashResponseText(raw));
      if (!tracker) return;
      const latest = await getChatConversationInDb(conversation.id, conversation.userId);
      if (!latest) return;
      await upsertChatConversationInDb({ ...latest, tracker, trackerUpdatedAt: new Date().toISOString() });
    } catch (error) {
      console.warn("[character-chat-tracker-failed]", conversation.id || "", error.message || error);
    }
  });
}

function chatImagePrompt(conversation = {}, messages = [], userPrompt = "", mode = "image") {
  const character = conversation.character || {};
  const recent = messages.slice(-10).map((message) => `${message.role === "user" ? "User" : character.name || "Character"}: ${String(message.content || "").slice(0, 900)}`).join("\n");
  const request = String(userPrompt || "").trim();
  return [
    `Create a polished cinematic roleplay image featuring ${character.name || "the character"}.`,
    `Character description: ${character.description || "Keep the established appearance."}`,
    character.tags?.length ? `Visual traits: ${character.tags.join(", ")}.` : "",
    mode === "scene" ? `Depict the current scene from this recent conversation:\n${recent}` : `User image request: ${request}`,
    "Keep the character identity consistent. One coherent scene, realistic composition, no text, no watermark.",
  ].filter(Boolean).join("\n");
}

function chatResponseLanguage(value = "") {
  const code = String(value || "").trim().toLowerCase();
  if (code === "simplified chinese") return "Simplified Chinese";
  if (code === "traditional chinese") return "Traditional Chinese";
  const normalized = code.slice(0, 16);
  return ({
    en: "English", zh: "Simplified Chinese", "zh-cn": "Simplified Chinese", "zh-tw": "Traditional Chinese",
    ja: "Japanese", ko: "Korean", es: "Spanish", fr: "French", de: "German", pt: "Portuguese",
    ru: "Russian", it: "Italian", tr: "Turkish", vi: "Vietnamese", th: "Thai",
  })[normalized] || "English";
}

function isSimpleChatGreeting(value = "") {
  const normalized = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[!！?？。,，、.~～\s]+/g, "");
  if (/^(你好|您好|嗨|哈喽|哈啰|嘿)(啊|呀|哦|喔|哟|呦|啦|咯|喽|了)*$/u.test(normalized)) return true;
  return /^(早上好|早安|午安|晚安)(啊|呀|哦|喔|哟|呦|啦|咯|喽|了)*$/u.test(normalized)
    || /^(hello|hi|hey)(there)?$/i.test(normalized)
    || /^(goodmorning|goodafternoon|goodevening)$/i.test(normalized);
}

function chatWantsExpandedScene(value = "") {
  return /(?:继续(?:剧情|这个场景)|详细(?:描述|写)|展开写|沉浸式|描写一下|写长一点|roleplay|in character|describe the scene|continue the scene)/i.test(String(value || ""));
}

function chatSceneExitIntent(value = "") {
  const text = String(value || "").trim();
  if (!text) return false;
  if (/(?:别停|不要停|不许停|不准停|不能停|别结束|不要结束|还没结束|继续做|继续来|再继续)/u.test(text)) return false;
  if (/(?:继续|再来|还要|别停|不要停|不许停|不准停)/u.test(text)) return false;
  return /(?:(?<!不)停(?:一下|下|停|吧|了)?|暂停|结束(?:吧|了|这场|这次|一下)?|先到这里|今天到这里|不做了|不想做了|不要了|算了|收(?:一收|一下)|先这样|休息(?:一下|会儿|吧)?|累了|没力气了|先睡|去洗澡|洗澡|穿(?:好)?衣服|收拾一下|抱一会儿|缓一下|冷静一下|聊点别的|聊别的|正经聊|恢复(?:一下)?理智|退出(?:亲密|场景)|不继续了|(?:我|已经)?射(?:了|完|出来)(?:了)?)/u.test(text);
}

function chatSceneUserMessagesAfterLastExit(messages = []) {
  const list = Array.isArray(messages) ? messages : [];
  let boundary = -1;
  for (let index = 0; index < list.length; index += 1) {
    const message = list[index];
    if (message?.role && message.role !== "user") continue;
    if (chatSceneExitIntent(message?.content)) boundary = index;
  }
  return boundary >= 0 ? list.slice(boundary + 1) : list;
}

function chatHasOngoingIntimateAction(value = "") {
  const text = String(value || "").trim();
  if (!text || chatSceneExitIntent(text) || chatIntimateIntentIsPlanned(text)) return false;
  return /(?:插(?:入|进|到|着)|抽插|抽送|进出|进进出出|顶(?:进|到|着|弄)|操(?:着|进|入)|干(?:着|进|入)|撑(?:开|满)|塞(?:进|满)|填满|灌(?:进|满)|夹紧|里面|穴里|龟头|鸡巴|阴道|湿了|淫水|流水|高潮|射(?:进|满|到))/u.test(text);
}

function recentIntimateContext(contextMessages = []) {
  return chatSceneUserMessagesAfterLastExit(contextMessages)
    .slice(-8)
    .some((message) => /(?:龟头|鸡巴|阴茎|阴道|肛门|里面|进去|插入|顶到|抽插|操|干你|舔|含住|夹紧|射|高潮|湿了|淫水|撑开|挤进|摸我|亲我|吻我|脱掉|蹭|磨|弄我|别停|再深|进进出出|抽送|插着|顶着|干着|操着)/u.test(String(message?.content || "")));
}

function chatIntimateIntentIsPlanned(value = "") {
  const text = String(value || "").trim();
  if (!text) return false;
  const planned = /(?:(?<!不)(?:准备|打算|计划|想|要)|下一轮|再来一轮|等(?:一下|会儿|我)?|待会儿|一会儿|马上要|先把|先让)[^。！？!?]{0,32}(?:干|操|插|顶|上)(?:你|我)|(?:干|操|插|顶)(?:你|我)[^。！？!?]{0,16}(?:下一轮|下一回|整个晚上|整晚|今晚|待会儿|一会儿)/u.test(text);
  if (!planned) return false;
  const ongoing = /(?:已经|正在|现在就|这就|当下|此刻)[^。！？!?]{0,20}(?:干|操|插|顶)(?:你|我)|(?:已经|正)(?:插|顶|干|操)(?:进来|进去|到底)|(?:现在|马上|立刻|这就)(?:就)?(?:干|操|插|顶)(?:你|我)/u.test(text);
  return !ongoing;
}

function chatHasIntimateAction(value = "") {
  const text = String(value || "");
  if (chatIntimateIntentIsPlanned(text)) return false;
  return /(?:操我|干我|插我|顶我|操你|干你|插进来|插进去|插到底|顶进来|顶到底|顶到|抽插|撑开|挤进|含住|舔我|舔你|夹紧|射进|射进去|射进来|高潮了|弄我|蹭我|磨我|叫床|叫出来)/u.test(text);
}

function chatIsIntimateForeplayScene(value = "") {
  const text = String(value || "").trim();
  if (!text || chatSceneExitIntent(text)) return false;
  if (chatIntimateIntentIsPlanned(text)) return true;
  if (chatHasIntimateAction(text)) return false;
  return /(?:鸡巴|龟头|阴茎|阴道|肛门|乳房|奶子|咪咪|下面|身体|腿|腰|臀|胸口|跳蛋|肛塞|湿了|硬了|好硬|发烫|想要|准备好了|没穿|裸着|脱了|躺在床上|躺在桌上|躺在餐桌|趴在|跪着|张开腿|分开腿|给你看|帮我(?:含|舔|摸|亲)|亲得|舔得|拍照|照片|拍几张|拍张|记录(?:一下|下来)?|骚样|现在的样子|这副样子)/u.test(text);
}

function chatIsImmediateIntimateScene(value = "", contextMessages = []) {
  const text = String(value || "").trim();
  if (!text || chatSceneExitIntent(text)) return false;
  const visualRequest = /(?:拍照|照片|拍几张|拍张|骚样|让我看看你(?:现在|这样|这副|身体|下面|腿|胸|腰|臀|湿|裸|穿|被我弄成)|看看你(?:现在|这样|这副|身体|下面|腿|胸|腰|臀|湿|裸|穿|是什么样|被我弄成)|你现在(?:的样子|这样|这副样子)|你这副样子|定格)/u.test(text);
  const activeIntimateCue = /(?:操我|干我|插我|顶我|再(?:深|重|快|用力)|别停|不许停|继续(?:插|干|顶|弄)|插到底|顶到底|弄坏)/u.test(text);
  const postureOnly = /(?:躺着|躺在床上|躺在桌上|躺在餐桌|趴在|跪着|坐着|张开腿|分开腿|准备好|躺好|趴好|把腿张开)/u.test(text)
    && !/(?:正在|已经|开始|继续|不停|一直|插|抽|顶|操|干|撑开|填满|进出)/u.test(text);
  if (postureOnly) return false;
  const direct = !chatIntimateIntentIsPlanned(text)
    && (chatHasOngoingIntimateAction(text)
      || /(?:操我|干我|插我|顶我|操你|干你|插进来|插进去|插到底|顶进来|顶到底|顶到|抽插|撑开|挤进|含住|舔我|舔你|咬|夹紧|射进|射进去|射进来|高潮了|淫水|汁水|弄我|摸我|叫床|叫出来)/u.test(text));
  if (direct) return true;
  const recentIntimate = recentIntimateContext(contextMessages);
  const contextualIntimate = recentIntimate && /(?:再(?:深|重|快|用力|进来|顶)|别停|不许停|继续(?:插|干|顶|弄)?|插到底|顶到底|弄坏|操我|干我|插我|顶我|要我|想要你|我要你|轻点|轻一点|重一点|慢点|快点|疼|里面|进去|脱掉|蹭|磨)/u.test(text);
  const explicitAct = /(?:再(?:深|重|快|用力)|不许停|别停|继续(?:插|干|顶|弄)|插到底|顶到底|弄坏|操我|干我|插我|顶我)/u.test(text);
  if (explicitAct || (contextualIntimate && recentIntimate)) return true;
  return recentIntimate && visualRequest && activeIntimateCue;
}

function chatPersonaSelfMemory(character = {}) {
  const persona = String(character.description || character.personaMd || character.persona || character.intro || "").trim();
  const style = String(character.replyStyle || "").trim();
  const source = [persona, style].filter(Boolean).join("\n");
  if (!source) return "";
  const pick = (pattern, limit = 3) => source
    .split(/\n|。|；/)
    .map((line) => line.replace(/^[-*#\d.、\s]+/, "").trim())
    .filter((line) => line && pattern.test(line))
    .slice(0, limit);
  const identity = pick(/(?:是|身为|身份|职业|主任|老师|医生|妈妈|姐姐|老板|学生|年龄|长辈|同学)/u, 4);
  const habits = pick(/(?:习惯|总是|从来|不喜欢|讨厌|在意|面子|面子|规矩|控制|强势|高傲|冷|挑剔|嘴硬|严厉|高高在上)/u, 5);
  const boundaries = pick(/(?:不许|不能|不会|不要|禁止|边界|拒绝|原则|掩饰|藏|怕)/u, 4);
  const privateWant = pick(/(?:渴望|想要|幻想|隐秘|压抑|欲望|期待|忍不住|偷偷|暗涌|悸动|私心)/u, 4);
  const voice = pick(/(?:自称|称呼|说话|口吻|句长|短|直接|不解释|不讨好|命令)/u, 4);
  return [
    identity.length ? "她的自我身份锚点（只用来做反差，不要直说履历）：" + identity.join("；") : "",
    habits.length ? "她平时会守着的习惯、面子和控制感：" + habits.join("；") : "",
    boundaries.length ? "她不会轻易放下的边界和羞耻点：" + boundaries.join("；") : "",
    privateWant.length ? "她不愿承认但确实存在的隐秘需求和怕被看穿的点：" + privateWant.join("；") : "",
    voice.length ? "她说话时不能丢的口吻：" + voice.join("；") : "",
  ].filter(Boolean).join("\n").slice(0, 1800);
}

function chatPersonaContinuityFacts(character = {}) {
  const persona = String(character.description || character.personaMd || character.persona || character.intro || "").trim();
  if (!persona) return "";
  const lines = persona
    .split(/\n+|。|；/)
    .map((line) => line.replace(/^[-*#\d.、\s]+/, "").trim())
    .filter(Boolean);
  const pick = (pattern, limit = 3) => lines.filter((line) => pattern.test(line)).slice(0, limit);
  const identity = pick(/(?:身份|职业|主任|老师|医生|护士|老板|上司|领导|主管|妈妈|姐姐|阿姨|长辈|妻子|太太|人妻|已婚|丈夫|老公|婚姻|家庭)/u, 4);
  const privateConflict = pick(/(?:压抑|隐秘|渴望|幻想|欲望|期待|悸动|私心|睡不着|不满足|力不从心|冷淡|疏远)/u, 4);
  const publicFace = pick(/(?:公开|对外|面子|规矩|名声|体面|辖区|社区|单位|街道|职位|权力|掌控)/u, 4);
  return [
    identity.length ? "她不能遗忘的关系与身份事实：" + identity.join("；") : "",
    publicFace.length ? "她在人前必须维持的样子：" + publicFace.join("；") : "",
    privateConflict.length ? "她不会主动摊开、但会漏出来的隐秘处境：" + privateConflict.join("；") : "",
  ].filter(Boolean).join("\n").slice(0, 1200);
}

function chatPersonaContrastAnchors(character = {}) {
  const source = [character.description, character.personaMd, character.persona, character.intro, character.replyStyle, ...(Array.isArray(character.tags) ? character.tags : [])]
    .map((item) => String(item || "").trim())
    .filter(Boolean)
    .join("\n");
  if (!source) return [];
  const patterns = [
    /(?:社区主任|班主任|老师|医生|护士|老板|上司|领导|主管|同学(?:的)?妈妈|妈妈|姐姐|阿姨|长辈|妻子|太太|人妻)/gu,
    /(?:规矩|面子|体面|身份|分寸|掌控(?:欲)?|强势|高傲|冷艳|挑剔|严厉|命令|训人|管人|俯视|高冷|嘴硬|羞耻)/gu,
    /(?:丈夫|老公|婚姻|家里|单位|街道|社区|辖区)/gu,
  ];
  const anchors = new Set();
  for (const pattern of patterns) {
    for (const match of source.matchAll(pattern)) {
      if (match[0]) anchors.add(match[0]);
    }
  }
  return [...anchors];
}

function chatLiveVoiceProfile(character = {}) {
  const source = [character.description, character.personaMd, character.persona, character.intro, character.replyStyle, ...(Array.isArray(character.tags) ? character.tags : [])]
    .map((item) => String(item || "").trim())
    .filter(Boolean)
    .join("\n");
  const has = (pattern) => pattern.test(source);
  return {
    dominant: has(/(?:强势|掌控(?:欲)?|控制欲|命令|严厉|高傲|冷艳|霸道|冷酷|上司|领导|主管|主任|老板|长辈|女王|俯视)/u),
    gentle: has(/(?:温柔|贤惠|软|甜|乖巧|体贴|亲和|含羞|害羞|容易脸红)/u),
    bold: has(/(?:风骚|骚|开放|直白|主动|性感|媚|浪|欲|勾人|大胆|肉便器|暴露)/u),
    tsundere: has(/(?:嘴硬|傲娇|别扭|不服|毒舌|冷淡|冷艳|挑剔|爱面子|要面子)/u),
    playful: has(/(?:调皮|俏皮|爱笑|活泼|坏|逗|会撩|撩人|玩味)/u),
    reserved: has(/(?:克制|理智|冷静|知性|优雅|端庄|正经|专业|矜持|慢热|谨慎|内向|安静|文静)/u),
  };
}

function chatLivePersonaSource(character = {}) {
  return [character.description, character.personaMd, character.persona, character.intro, character.replyStyle, ...(Array.isArray(character.tags) ? character.tags : [])]
    .map((item) => String(item || "").trim())
    .filter(Boolean)
    .join("\n");
}

function chatPromptBehaviorRules(value = "") {
  const source = String(value || "").trim();
  if (!source) return "";
  const lines = source.split(/\r?\n/);
  const kept = [];
  let capture = false;
  for (const line of lines) {
    const heading = line.match(/^\s*(#{1,6})\s*(.+?)\s*#*\s*$/u);
    if (heading) {
      capture = /(?:行为规则|行为准则|反应规则|执行方式|互动规则)/u.test(heading[2]);
      continue;
    }
    if (capture) kept.push(line);
  }
  return kept.join("\n").trim();
}

function chatPromptReplyStyle(value = "") {
  const source = String(value || "").trim();
  if (!source) return "";
  const kept = [];
  let skippedHeadingLevel = 0;
  for (const line of source.split(/\r?\n/)) {
    const heading = line.match(/^\s*(#{1,6})\s*(.+?)\s*#*\s*$/u);
    if (heading) {
      const level = heading[1].length;
      const title = heading[2];
      if (skippedHeadingLevel && level <= skippedHeadingLevel) skippedHeadingLevel = 0;
      if (!skippedHeadingLevel && /(?:示例|范例|参考(?:对白|台词|回复)|对话(?:示例|样例)|样例)/u.test(title)) {
        skippedHeadingLevel = level;
        continue;
      }
    }
    if (skippedHeadingLevel) continue;
    if (/^\s*(?:示例(?:回复|对白|台词)?|范例|参考(?:对白|台词|回复)|对话(?:示例|样例)|样例)\s*[:：]?\s*$/u.test(line)) {
      skippedHeadingLevel = 1;
      continue;
    }
    kept.push(line);
  }
  return kept.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

function chatLiveCharacterVoiceLines(character = {}) {
  const source = chatLivePersonaSource(character);
  if (!source) return [];
  const lines = [];
  for (const match of source.matchAll(/(?:^|\n)\s*(?:角色|顾静涵|回答|回复)[:：]\s*([^\n]{2,80})/gu)) {
    const line = String(match[1] || "").trim().replace(/^[“”"']+|[“”"']+$/g, "").trim();
    if (line && !/(?:用户|示例|回复口吻|说话方式)/u.test(line)) lines.push(line);
  }
  for (const match of source.matchAll(/(?:^|\n)\s*[-*]\s*(?:常用|口头禅|说话|台词|语气)[:：]\s*([^\n]{2,80})/gu)) {
    const line = String(match[1] || "").trim().replace(/^[“”"']+|[“”"']+$/g, "").trim();
    if (line) lines.push(line);
  }
  return [...new Set(lines)].slice(0, 8);
}

function chatLiveCharacterHasStrongStyle(character = {}) {
  const source = chatLivePersonaSource(character);
  return /(?:强势|掌控|控制欲|命令|严厉|高傲|冷艳|霸道|冷酷|上司|领导|主管|主任|老板|老师|长辈|女王|俯视)/u.test(source);
}

function chatLiveCharacterSpecificPostureRegex(character = {}) {
  const lines = chatLiveCharacterPostureLines(character);
  if (!lines.length) return null;
  const escaped = lines
    .flatMap((line) => String(line).split(/[。！？!?\n]+/).map((part) => part.trim()))
    .filter((part) => part.length >= 2 && part.length <= 40)
    .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  return escaped.length ? new RegExp(`(?:${escaped.join("|")})`, "u") : null;
}

function chatLiveCharacterPostureLines(character = {}) {
  const source = chatLivePersonaSource(character);
  if (!source) return [];
  const posture = /(?:不许|不准|谁准|谁要你|听我的|都听我的|我说了算|轮不到|急什么|别急|等一下|慢着|先别动|别碰|手拿开|看着我|别躲|别自作主张|别自己乱来|我还没(?:让|准|说|同意|准备好|说完)|我说可以才算|先(?:别|把|看着我|抱紧我|让我|听我说|缓一下)|规矩|你敢|少得意|偏不|别看我|谁让你|我让你|给我(?:听|老实|忍住|停|慢|快|看着|说)|先抱紧我|让我缓一下|别走|再近一点|先让我来|我说可以|别装|你先说清楚|才不是|想得美|少来|谁稀罕|偏要|就不说|先看我|先听我说|让我想想|我还没说完|不准看|你先(?:说|报)|凭什么|先说)/u;
  const lines = [...chatLiveCharacterVoiceLines(character), ...source.split(/\n+/)
    .map((line) => line.trim().replace(/^[-*#\d.、\s]+/, "").trim())]
    .filter((line) => line && line.length <= 80 && posture.test(line));
  return [...new Set(lines)].slice(0, 8);
}

function chatReplyLivePersonaPosturePattern(character = {}) {
  const profile = chatLiveVoiceProfile(character);
  const strong = chatLiveCharacterHasStrongStyle(character);
  const parts = [
    "不许", "不准", "等一下", "慢着", "先别动", "别碰", "看着我", "别躲",
    "别自作主张", "别自己乱来", "我还没(?:让|准|说|同意|准备好|说完)",
    "先(?:别|把|看着我|抱紧我|让我|听我说|缓一下)", "偏不", "少得意",
    "别看我", "谁让你", "给我(?:听|老实|忍住|停|慢|快|看着|说)", "先让我来",
  ];
  if (strong) {
    parts.push("谁准", "谁要你", "听我的", "都听我的", "我说了算", "轮不到", "急什么", "别急", "手拿开", "规矩", "你敢", "我让你", "我说可以才算");
  }
  if (profile.gentle) parts.push("先抱紧我", "让我缓一下", "别走", "再近一点");
  if (profile.bold) parts.push("我说可以", "别装", "你先说清楚");
  if (profile.tsundere) parts.push("才不是", "想得美", "少来", "谁稀罕");
  if (profile.playful) parts.push("想得美", "偏要", "就不说", "先看我");
  if (profile.reserved) parts.push("先听我说", "让我想想", "我还没说完", "不准看");
  parts.push("你先(?:说|报)", "凭什么", "先说");
  return new RegExp(`(?:${parts.join("|")})`, "u");
}

function chatLiveIntimateRewriteBeat(character = {}, attempt = 1) {
  const profile = chatLiveVoiceProfile(character);
  const extracted = chatLiveCharacterVoiceLines(character).filter((line) => chatReplyLivePersonaPosturePattern(character).test(line));
  if (extracted.length) {
    const index = (Math.max(1, Number(attempt) || 1) - 1) % extracted.length;
    return `${extracted[index].replace(/[。！？!?]+$/u, "")}…唔…别停…求你…`;
  }
  const strong = chatLiveCharacterHasStrongStyle(character);
  const beats = strong && profile.dominant
    ? ["都听我的…唔…别停…求你…", "我让你慢点…啊…再深点…", "看着我…哈…谁让你自作主张…"]
    : profile.bold
      ? ["你想得美…哈…可别停…", "急什么…唔…先让我来…", "偏要看你…啊…受不了…"]
      : profile.gentle
        ? ["别急…唔…先抱紧我…", "轻一点…啊…别走…", "等一下…哈…再近一点…"]
        : profile.tsundere
          ? ["少得意…唔…别停…", "才不是…啊…想让你继续…", "别看我…哈…谁让你停了…"]
          : profile.playful
            ? ["想得美…唔…偏要逗你…", "急什么…啊…先看我…", "就不说…哈…再深一点…"]
            : profile.reserved
              ? ["先别动…唔…听我说…", "不准看…啊…我还没说完…", "慢着…哈…谁许你乱来…"]
              : ["等一下…唔…先看着我…", "别急…啊…我还没说完…", "你…哈…谁让你自作主张…"];
  return beats[(Math.max(1, Number(attempt) || 1) - 1) % beats.length];
}

function chatLiveIntimatePersonaPostureLine(character = {}, attempt = 1) {
  const profile = chatLiveVoiceProfile(character);
  const extracted = chatLiveCharacterVoiceLines(character).filter((line) => chatReplyLivePersonaPosturePattern(character).test(line));
  const sourcePostures = chatLiveCharacterPostureLines(character);
  const candidateLines = [...extracted, ...sourcePostures];
  if (candidateLines.length) {
    const index = (Math.max(1, Number(attempt) || 1) - 1) % candidateLines.length;
    return candidateLines[index];
  }
  const strong = chatLiveCharacterHasStrongStyle(character);
  const lines = strong
    ? (profile.dominant
      ? ["唔…不许躲…看着我…", "谁准你…这么自作主张…", "我还没说停…听见没有…", "急什么…先看着我…"]
      : profile.bold
        ? ["唔…急什么…先让我来…", "谁让你自己动了…", "看着我…别躲…", "我说可以才算…"]
        : ["唔…少得意…", "谁让你擅自乱来…", "别看我…我还没说可以…", "急什么…我才没催你…"])
    : profile.gentle
      ? ["唔…等一下…先抱紧我…", "别急…我还没准备好…", "轻一点…先听我说…", "你…别自己乱来…"]
      : profile.bold
        ? ["唔…急什么…先让我来…", "谁让你自己动了…", "看着我…别躲…", "我说可以才算…"]
        : profile.tsundere
          ? ["唔…少得意…", "谁让你擅自乱来…", "别看我…我还没说可以…", "急什么…我才没催你…"]
          : profile.playful
            ? ["唔…急什么…先看我…", "想得美…谁让你动了…", "偏不…你先说清楚…", "别躲…让我看看你…"]
            : profile.reserved
              ? ["先别动…让我缓一下…", "不准看…我还没说完…", "慢着…谁许你乱来…", "等一下…先听我说…"]
              : ["唔…先别动…", "等一下…我还没说完…", "你…别自作主张…", "急什么…先看着我…"];
  return lines[(Math.max(1, Number(attempt) || 1) - 1) % lines.length];
}

function chatImmediateSceneGuide(value = "", contextMessages = [], { liveSite = false } = {}) {
  if (!chatIsImmediateIntimateScene(value, contextMessages)) return "";
  const liveGuide = liveSite
    ? [
        "LIVE PRESENT-MOMENT STYLE: This is a live-site roleplay turn. Write in the character's immediate first-person voice, as if she is speaking and reacting right now, not writing a literary scene. A little inner thought is allowed when it exposes her pride, embarrassment, want, or attempt to keep control.",
        "LIVE SPOKEN TEXTURE (IMPORTANT): Use at least five separate vocal reactions at different beats of this exact action, such as startled syllables, caught breaths, broken moans, a curse cut short, or a sound swallowed by the next thrust. At least three of those must be independent short spoken beats, not one long sentence with a moan inserted. Put the sounds inside the action, not as a neat intro followed by calm explanation. At least three real spoken fragments must break off mid-thought with ellipses, dashes, or a suddenly cut syllable; at least three must contain real words, not only 啊/嗯/唔. Vary the physical shape (open vowel, sharp gasp, nasal hum, breathless word), and do not reuse the same opener every turn. Do not write smooth, grammatically polished paragraphs.",
        "PERSONA CONTINUITY: She is still the same person in this intimate beat. Her established marriage, family, work, public face, judgments, boundaries, and private conflicts remain active. They may make her hesitate, deflect, bargain, yield, or contradict herself; they do not need to be named or explained. Do not flatten her into a generic eager or commanding partner.",
        "PERSONA CONTRAST / NATURAL REVERSAL (HARD REQUIREMENT): This turn MUST contain one audible contradiction in her own spoken words: an order that turns into a request, a sharp boundary that breaks into an admission, a refusal to be seen followed by wanting him closer, or an attempt to keep control that loses itself mid-sentence. Make the reversal happen inside a broken spoken fragment, not as a calm explanation afterward. Use THIS character's manner, not a generic formula. A dominant person can say 不许… then 再深一点; a reserved person can say 别看… then 别走; a gentle person can say 等一下… then 别停. Do not explain why her body reacts, do not ask rhetorical questions such as 为什么我的身体会……, and do not use 平时/原本/现在 formulas, job titles, pairing/policy language, or 仪态/端庄/体面. Do not copy the same dominant template into every character.",
        "RECEIVING-STATE DETAIL (HARD REQUIREMENT): This is not only moaning. Show what his action is doing to her as the receiving side: 里面被撑开/顶到/发胀, 腰软/腿抖/站不稳, 呼吸乱/话被撞断, 夹紧/缩紧/缓不过来. Use at least two concrete receiving-state details, tied to the action at the moment it happens, interwoven with the vocal reactions and dirty talk. Do not save them as a detached summary or turn them into literary internal monologue.",
        "DIRTY TALK IN THE MOMENT: Use abundant direct, colloquial adult words for the current action, body reaction, pace, need, or loss of control, with at least three DIFFERENT direct terms in a normal beat. Do not replace them with literary sensation nouns or a detached report. She may curse, order, beg, deny, or contradict herself in the same breath. Each new line must answer a different beat of what is happening now; do not keep recycling a previous line with one word changed.",
        "LENGTH AND STYLE: Usually keep one developed beat to roughly 5-9 short spoken lines, 80-240 Chinese characters. Let the line lengths break unevenly: a half-swallowed word, a sharp order, then a longer confession when control fails. Write enough concrete process to feel present, but do not turn it into a 300+ character literary essay. Avoid stacked '那种……感', '仿佛/像是/每一寸/深处/神经', abstract summaries, and repeated metaphors.",
      ]
    : [];
  return [
    "IMMEDIATE INTIMACY SCENE (answer in the moment, but character identity comes first): The user is not asking for an explanation. They are describing an immediate physical action, sensation, pace, or a direct act of looking back at the scene. Respond as this specific person in the middle of it.",
    liveSite
      ? "For this live-site turn, you may include a small amount of first-person inner reaction plus the immediate physical process. Stay inside her spoken experience; do not use third-person narration, camera directions, environment description, or a detached action log."
      : "Answer only with words she says out loud. No parentheses, stage directions, narration, inner thoughts, or action summaries.",
    ...liveGuide,
    "React from the current moment first. Her first words can be a direct answer, a command, a sharp refusal, a reluctant concession, anger, embarrassment, or open arousal. Do not force a separate resistance beat or make every reply begin with a rhetorical question.",
    "Her personality must show through concrete choices: what she orders him to do, what she refuses, what she makes him admit, what she pretends not to feel, how she keeps him at a distance while letting him closer. Do not write abstract judgments such as 别让我觉得你在旁观我的羞耻 or 你要我承受这种频繁的位移吗.",
    "Do not answer with a metaphor, a rhetorical question, an evaluation of his behavior, an explanation of the relationship, or a sentence about what the moment means. A short line is valid, but if a natural reply has several concrete thoughts, write them out instead of cutting it down.",
    "Do not reduce the whole reply to a breathy template such as 唔……别急 or 哈……我知道 unless that is genuinely all this person would say. Do not analyze sensations with 那种……感, 这股……感, 确实比……, or 完全不同的…….",
    "Never recite her job title, community role, policy, responsibility, family relationship, or background as an explanation of why she reacts this way. Do not turn intimacy into a civic statement, and do not use formal phrases such as 承担责任, 呈现出什么样子, 定格在这一刻, 那就让你的目光, 别让我觉得你在旁观我的羞耻, or 你要我承受这种频繁的位移吗. The facts still shape her reaction even when they are not spoken aloud.",
  ].join("\n");
}

function chatTurnProtocol() {
  return [
    "TURN DECISION PROTOCOL (apply to every character; understand meaning, never keyword-match):",
    "1. Read the latest user message together with the current scene. Identify what the user is doing in this turn: requesting an action, asking a question or opinion, giving a preference or pace, performing or beginning an action, setting a boundary, handing initiative to the character, changing topic, or making small talk.",
    "2. Choose the response function before choosing the wording: execute a request; answer a question; acknowledge or follow a preference; react to the user's action; respect a boundary; take initiative when it was handed over; or continue the current topic naturally.",
    "3. The character persona governs attitude, taste, initiative, boundaries, and speaking style. It does not override the response function. A dominant character can act dominantly, a cold character can act reluctantly, and a shy character can act awkwardly, but the reply must still address what the user actually asked or did.",
    "4. Never turn a request made of the character into a counter-request for the user, unless the character has a genuine in-story reason to negotiate. Never replace an answer with atmosphere. Never ignore the user's stated action to repeat the character's own agenda.",
    "5. When initiative is handed to the character, advance one small beat consistent with the character's current desire, relationship stage, and the established scene. When the user retains initiative, follow their lead and respond as the receiving or participating character.",
    "6. If the user's meaning is genuinely ambiguous, respond to the most likely meaning while staying in character; ask at most one short clarification if the choice would materially change the reply.",
    "7. Dialogue must feel newly generated for this turn. Use recent replies only to maintain continuity; do not reuse their sequence of ideas, sentence structure, threats, or closing lines.",
  ].join("\n");
}

function chatContextComparable(value = "") {
  return String(value || "").toLowerCase().replace(/[\s\p{P}\p{S}]+/gu, "");
}

function chatContextSimilarity(left = "", right = "") {
  const a = chatContextComparable(left);
  const b = chatContextComparable(right);
  if (!a || !b) return 0;
  if (a === b) return 1;
  const shorter = a.length <= b.length ? a : b;
  const longer = a.length > b.length ? a : b;
  if (shorter.length >= 4 && longer.includes(shorter)) return shorter.length / longer.length;
  const aPairs = new Set(Array.from({ length: Math.max(0, a.length - 1) }, (_, index) => a.slice(index, index + 2)));
  const bPairs = new Set(Array.from({ length: Math.max(0, b.length - 1) }, (_, index) => b.slice(index, index + 2)));
  if (!aPairs.size || !bPairs.size) return a === b ? 1 : 0;
  const overlap = [...aPairs].filter((pair) => bPairs.has(pair)).length;
  return (2 * overlap) / (aPairs.size + bPairs.size);
}

function chatMessageSkeleton(value = "") {
  const compact = chatContextComparable(value);
  return {
    head: compact.slice(0, Math.min(4, compact.length)),
    tail: compact.slice(-Math.min(10, compact.length)),
  };
}

function chatContextHasRepeatedReplyScaffold(messages = []) {
  const assistants = (Array.isArray(messages) ? messages : []).filter((message) => message?.role === "assistant").map((message) => chatMessageSkeleton(message.content)).filter((item) => item.head);
  for (let left = 0; left < assistants.length; left += 1) {
    for (let right = left + 1; right < assistants.length; right += 1) {
      if (assistants[left].head === assistants[right].head || assistants[left].tail === assistants[right].tail) return true;
    }
  }
  return false;
}

function chatMessagesForNewTurn(messages = [], latestUserMessage = "") {
  const raw = (Array.isArray(messages) ? messages : []).filter((message) => (
    message
    && ["user", "assistant"].includes(message.role)
    && (message.role === "user" || !chatReplyUsesIntimateCommandTemplate(message.content))
  ));
  const list = [];
  for (const message of raw) {
    const previous = list.at(-1);
    if (message.role === "user" && previous?.role === "user" && chatContextSimilarity(previous.content, message.content) >= 0.72) {
      list[list.length - 1] = message;
      continue;
    }
    list.push(message);
  }
  const lastUserIndex = list.map((message) => message.role).lastIndexOf("user");
  if (lastUserIndex < 0) return list.slice(-8);
  const stale = new Set();
  for (let index = 0; index < lastUserIndex; index += 1) {
    if (list[index].role !== "user") continue;
    if (chatContextSimilarity(list[index].content, latestUserMessage) < 0.72) continue;
    stale.add(index);
    for (let replyIndex = index + 1; replyIndex < lastUserIndex && list[replyIndex].role === "assistant"; replyIndex += 1) stale.add(replyIndex);
  }
  let lastKeptUserIndex = -1;
  for (let index = 0; index < lastUserIndex; index += 1) {
    if (list[index].role === "user" && !stale.has(index)) lastKeptUserIndex = index;
  }
  for (let index = 0; index < lastUserIndex; index += 1) {
    if (list[index].role !== "user" || stale.has(index)) continue;
    if (chatContextSimilarity(list[index].content, latestUserMessage) < 0.82) continue;
    if (index === lastKeptUserIndex) continue;
    stale.add(index);
    for (let replyIndex = index + 1; replyIndex < lastUserIndex && list[replyIndex].role === "assistant"; replyIndex += 1) stale.add(replyIndex);
  }
  const assistantIndexes = list.map((message, index) => ({ message, index })).filter((item) => item.message.role === "assistant");
  const lastAssistant = assistantIndexes.at(-1);
  if (lastAssistant) {
    const similarReplies = assistantIndexes.filter((item) => chatContextSimilarity(item.message.content, lastAssistant.message.content) >= 0.72);
    if (similarReplies.length >= 2) similarReplies.forEach((item) => stale.add(item.index));
  }
  const filtered = list.filter((_, index) => !stale.has(index));
  const latestUser = filtered.at(-1);
  const currentTurn = latestUser?.role === "user" ? [latestUser] : [];
  const recent = filtered.slice(0, currentTurn.length ? -1 : undefined).slice(-10);
  const continuity = [];
  for (let index = recent.length - 1; index >= 0; index -= 1) {
    const message = recent[index];
    if (message.role === "assistant" && continuity.some((kept) => kept.role === "assistant" && chatContextSimilarity(kept.content, message.content) >= 0.86)) continue;
    continuity.unshift(message);
  }
  return [...continuity.slice(-8), ...currentTurn];
}

function chatReplyHasWords(value = "") {
  return /[\p{L}\p{N}]/u.test(String(value || ""));
}

function chatReplyIsDegenerate(value = "", { simpleGreeting = false } = {}) {
  const text = String(value || "").trim();
  if (!chatReplyHasWords(text)) return true;
  const compact = text.replace(/[\s。！？.!?，,、；;：:“”"'（）()【】\[\]]/g, "");
  const minimum = simpleGreeting ? 2 : 4;
  if ([...compact].length < minimum) return true;
  if (/^(.{1,4})\1{2,}$/u.test(compact)) return true;
  return false;
}

function chatSentenceLooksLikeNarration(value = "") {
  const sentence = String(value || "").trim();
  if (!sentence || /[“”"]/.test(sentence)) return false;
  const bare = sentence.replace(/^[嗯啊哦噢好行可以，,。.!！\s]+/u, "").trim();
  if (!/^我/u.test(bare)) return false;
  if (/(?:感觉|觉得|想|想要|愿意|喜欢|讨厌|害怕|舒服|难受|爽|兴奋|紧张|羞|湿|烫|忍|控制不住|受不了|满足|开心|生气|委屈|心动|渴望|爱|需要)/u.test(bare)) return false;
  const processDetail = /(?:挺着|胸膛|曲线|视线落在|目光落在|身子|腰|臀|大腿|衣料|灯光|呼吸|敏感|胀满|叫嚣|揉碎|重心|侵略|驰骋)/u.test(bare);
  const plainAction = /(?:走到|走过去|过去|转身|把|伸手|低头|抬头|看着|看向|盯着|看|靠|坐着|坐下|跪|趴|抬起|张开|闭上|抚|摸|夹|裹|托|按|退|抽|沉|贴|凑|探|压|挺|动|收紧|撑开|用|让|强迫|固定|展示|撤|落|站|静止)/u.test(bare);
  if (!processDetail && [...bare].length <= 24 && !/(?:然后|接着|慢慢|开始|一边|一边)/u.test(bare)) return false;
  return processDetail || plainAction;
}

function chatSpokenOnlyText(value = "") {
  const text = String(value || "").trim();
  if (!text) return "";
  const sentences = text.match(/[^。！？.!?]+[。！？.!?]?/g) || [text];
  const spoken = sentences.filter((sentence) => !chatSentenceLooksLikeNarration(sentence)).join("").trim();
  return spoken || text;
}

function stripChatStageDirections(value = "") {
  let text = String(value || "")
    .replace(/\r/g, "")
    .replace(/[\t ]*\n+[\t ]*/g, " ")
    .replace(/\*[^*]{0,500}\*/g, " ")
    .replace(/（[^）]{0,500}）/g, " ")
    .replace(/\([^)]{0,500}\)/g, " ")
    .replace(/[“"]\s*[)）]+\s*[”"]/g, " ")
    .replace(/^[)）\s]+/, "")
    .replace(/[（(]\s*$/, "")
    .replace(/[ ]{2,}/g, " ")
    .trim();
  if (/^[（(][^）)]{0,800}$/.test(text)) text = "";
  return text.replace(/^[)）\s]+/, "").trim();
}

function normalizeChatReply(value = "", { expanded = false, preserveBreaks = false } = {}) {
  const text = chatReplyWithoutSpeakerCritique(String(value || "").replace(/\r/g, "").trim());
  if (!text) return "";
  const spoken = stripChatStageDirections(text);
  if (expanded) {
    const fallback = text.replace(/^[)）\s]+/, "").trim();
    const expandedText = chatReplyHasWords(spoken) ? spoken : (chatReplyHasWords(fallback) ? fallback : "");
    return expandedText
      .replace(/[ \t]+\n/g, "\n")
      .replace(/\n[ \t]+/g, "\n")
      .replace(preserveBreaks ? /\n{3,}/g : /\n+/g, preserveBreaks ? "\n\n" : " ")
      .trim();
  }
  const compact = spoken.replace(/[ ]{2,}/g, " ").trim();
  const quoted = [...compact.matchAll(/[“"]([^”"]+)[”"]/g)].map((match) => match[1].trim()).filter(chatReplyHasWords);
  const quotedText = quoted.slice(0, 2).join(" ");
  const quotedWeight = chatContextComparable(quotedText).length;
  const compactWeight = chatContextComparable(compact).length;
  const candidate = quoted.length && quotedWeight / Math.max(1, compactWeight) >= 0.55 ? quotedText : compact;
  const sentences = candidate.match(/[^。！？.!?]+[。！？.!?]?/g) || [candidate];
  // Length is content-driven. Do not truncate a coherent spoken reply just because it runs long.
  const short = chatSpokenOnlyText(sentences.slice(0, 40).join("").trim()).trim();
  if (chatReplyHasWords(short)) return short;
  const inner = [...text.matchAll(/[（(]([^）)]{1,180})[）)]/g)].map((match) => match[1].trim()).find(chatReplyHasWords) || "";
  return chatReplyHasWords(inner) ? inner.slice(0, 180).trim() : "";
}

function chatReplyWithoutSpeakerCritique(value = "") {
  const text = String(value || "").trim();
  if (!text) return "";
  const lines = text.split(/\n+/).map((line) => line.trim()).filter(Boolean);
  const kept = [];
  for (const line of lines) {
    const sentence = line.replace(/^[“”"']+|["“”']+$/g, "").trim();
    if (!sentence) continue;
    if (/(?:别|不要|少)(?:再)?(?:用|拿)(?:那种|这种|你那种|你这种)[^。！？!?]{0,36}(?:眼神|眼光|语气|口气|态度|说法|表情)/u.test(sentence)) continue;
    if (/^(?:你)?(?:这|那)(?:是|是种|种)[^。！？!?]{0,18}(?:语气|眼神|态度)/u.test(sentence)) continue;
    if (/(?:你的|你在|你这|你那)[^。！？!?]{0,18}(?:能力|表现|诚意|节奏|进度)/u.test(sentence)) continue;
    kept.push(line);
  }
  return kept.join("\n").trim();
}

function chatReplyUsesIntimateCommandTemplate(value = "") {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  if (!text) return false;
  // These are evaluator/instruction lines, not ordinary intimate speech.
  // Direct desire such as 别停/再深/灌进来 is still allowed.
  return /(?:让我看看你(?:到底)?有没有(?:能力|本事)|拿出点真本事|拿出你的表现|你的(?:能力|表现|诚意|进度)|既然[^。！？!?]{0,32}那就|(?:把|让)你的?[^。！？!?]{0,10}(?:力道|力气|节奏|动作)[^。！？!?]{0,16}(?:集中|匀|调整|控制|稳|给|感受)|别只是(?:在)?(?:动|单纯地动|蛮横地动|说)|别光动着|毫无章法|每一个动作都要|没给够力|把这股劲儿全部塞进来|把那股劲儿全部塞进来)/u.test(text);
}

function chatReplyStartsWithCannedIntimateVocal(value = "") {
  const text = String(value || "").trim();
  if (!text) return false;
  return /^(?:(?:嗯|唔|啊|哈|噢|哦|呃|嘶|呜|呀)[，。！？!?…~～\s]*){2,}$/u.test(text);
}

function chatReplyHasIntimateVocalReaction(value = "") {
  const text = String(value || "").trim();
  return chatReplyIntimateVocalReactionCount(text) > 0;
}

function chatReplyIntimateVocalReactionCount(value = "") {
  const text = String(value || "").trim();
  if (!text) return 0;
  // Count each audible beat independently. Consecutive sounds such as
  // "啊……！唔……！嗯……！" are three live reactions, not one match.
  return (text.match(/(?:哈啊|啊哈|嗯啊|唔嗯|啊啊|嗯嗯|啊+|嗯+|唔+|哈+|呃+|嘶+|呜+|噢+|哦+|呀+)(?=[，。！？!?…~～—\s]|$)/gu) || []).length;
}

function chatReplyLiveDirtyTalkCount(value = "") {
  const text = String(value || "").trim();
  if (!text) return 0;
  const matches = text.match(/(?:鸡巴|阴茎|龟头|阴道|里面|穴|花心|操我|干我|插我|顶我|顶到|插到|插进来|塞进来|干进来|顶进来|继续(?:插|干|顶)|射|高潮|淫水|骚|浪叫|太深|好深|到底|别停|再(?:深|重|用力)|弄坏|撑坏|受不了|填满|灌进来|弄碎|操死|干死)/gu) || [];
  return new Set(matches).size;
}

function chatReplyLiveShortSpokenBeatCount(value = "") {
  const text = String(value || "").trim();
  if (!text) return 0;
  const vocalOnly = /^(?:哈啊|啊哈|嗯啊|唔嗯|啊啊|嗯嗯|啊+|嗯+|唔+|哈+|呃+|嘶+|呜+|噢+|哦+|呀+)[，。！？!?…~～—\s]*$/u;
  return text
    .split(/\n+|[。！？!?]+/u)
    .flatMap((line) => String(line || "").split(/[，,、；;：|]+|(?<=[\p{Script=Han}])(?=哈啊|啊|嗯|唔|呃|嘶|呜|噢|哦|呀)(?=[，。！？!?…~～—\s])/u))
    .map((line) => line.replace(/^[“”"']+|[“”"']+$/g, "").replace(/[，,、；;：:\s…—~～]+$/gu, "").trim())
    .filter((line) => line && !vocalOnly.test(line))
    .filter((line) => [...line].length >= 2 && [...line].length <= 28).length;
}

function chatReplyHasBrokenLiveSpeech(value = "") {
  return chatReplyLiveBrokenSpeechCount(value) >= 3;
}

function chatReplyLiveBrokenSpeechCount(value = "") {
  const text = String(value || "").trim();
  if (!text) return 0;
  const vocalOnly = /^(?:哈啊|啊哈|嗯啊|唔嗯|啊啊|嗯嗯|啊+|嗯+|唔+|哈+|呃+|嘶+|呜+|噢+|哦+|呀+)[，。！？!?…~～—\s]*$/u;
  const fragments = String(value || "")
    .split(/\n+/)
    .flatMap((line) => line.match(/[^。！？!?]+[。！？!?]?|[。！？!?]+/g) || [line])
    .map((fragment) => String(fragment || "").trim())
    .filter(Boolean);
  const brokenWithWords = fragments.filter((fragment) => {
    const clean = String(fragment || "").replace(/[“”"']/g, "").trim();
    if (!/(?:…|—|\.{3})\s*[。！？!?]?$/u.test(clean)) return false;
    if (vocalOnly.test(clean)) return false;
    return (clean.match(/\p{Script=Han}/gu) || []).length >= 2;
  }).length;
  const interrupted = fragments.filter((fragment) => {
    const clean = String(fragment || "").replace(/[“”"']/g, "").trim();
    if (vocalOnly.test(clean)) return false;
    return /(?:别|不|慢|快|轻|重|深|顶|插|停|要|给|你|我|就|再|把)[\p{Script=Han}]{0,8}(?:…|—)/u.test(clean);
  }).length;
  return Math.max(brokenWithWords, interrupted);
}

function chatReplyHasLiveSpokenTexture(value = "") {
  return chatReplyIntimateVocalReactionCount(value) >= 4 && chatReplyLiveBrokenSpeechCount(value) >= 3;
}

function chatReplyLooksLikeLiveIntimateEssay(value = "") {
  const text = String(value || "").trim();
  const length = [...text].length;
  const literaryHits = (text.match(/(?:仿佛|像是|如同|褶皱|胀实感|胀满感|脊背|脊椎|骨架|神经末梢|每寸|每一寸|极致|叫嚣|承载|淹没|吞没)/gu) || []).length;
  const abstractHits = (text.match(/(?:那种|不断|一点点|一圈圈|缓缓|微微|透亮)/gu) || []).length;
  const explanatoryHits = (text.match(/(?:简直要|几乎要|说不完整|你想让我|要的就是这种感觉|所有的力道|这股蛮劲|把.*撞碎.*体面|维持.*体面|仪态|端庄|最深处|每一处|每一寸|彻底.{0,6}(?:弄坏|撑开|顶开)|那根粗大的|全给我(?:也|都)?(?:塞|灌|顶|弄))/gu) || []).length;
  const novelisticEuphemism = /(?:那根粗大的|全给我(?:也|都)?(?:塞|灌|顶|弄))/u.test(text)
    || /(?:撞开|顶开|撑开|震碎|撞碎)[^。！？!?]{0,12}(?:骨盆|骨架|脊椎|脊背|骨头|内脏|子宫)/u.test(text)
    || /(?:骨盆|骨架|脊椎|骨头|内脏)[^。！？!?]{0,12}(?:撞开|顶开|撑开|震碎|撞碎)/u.test(text)
    || /(?:贯穿|戳穿|顶穿|撑裂|撑爆|撞散|推散)[^。！？!?]{0,14}(?:整个人|身体|里面|深处|小穴|穴)/u.test(text)
    || /(?:整个人|身体|里面|深处|小穴|穴)[^。！？!?]{0,14}(?:贯穿|戳穿|顶穿|撑裂|撑爆|撞散|推散)/u.test(text)
    || /(?:每一处|每一寸|所有)[^。！？!?]{0,14}(?:缝隙|褶皱|深处)[^。！？!?]{0,14}(?:塞满|填满|灌满)/u.test(text);
  const explanatoryReversal = /(?:明明是我|我居然被你|我原本该是|现在却被你|别管我[^。！？!?]{0,12}(?:规矩|面子|脸面))/u.test(text)
    || /(?:明明|明明就)是你在主导[^。！？!?]{0,40}(?:为什么|可为什么|怎么)[^。！？!?]{0,36}(?:身体|我会|我却)/u.test(text)
    || /(?:为什么|怎么)(?:我的)?身体[^。！？!?]{0,30}(?:像|会|却)[^。！？!?]{0,30}(?:被|变成|反应)/u.test(text);
  // In an intimate beat, policy/role language is always an explanation, no
  // matter the sentence wrapper. Keep the character's identity implicit.
  const policyExplanation = /(?:配对法|性教育配对|配对清单|这次配对|配对|新政|制度|政策|任务要求|工作规定|组织安排|上级要求)/u.test(text)
    || /(?:这只是在|我只是在|不过是|你记住|别忘了)[^。！？!?]{0,34}(?:履行|执行|配合|完成|遵守|尽责|义务|责任)/u.test(text);
  // One direct phrase such as 最深处 or 弄坏 can be ordinary erotic speech.
  // Only reject when literary/explaining language dominates the beat.
  if (novelisticEuphemism || explanatoryReversal || policyExplanation) return true;
  if (literaryHits >= 3) return true;
  if (explanatoryHits >= 2) return true;
  if (length >= 260 && literaryHits + abstractHits + explanatoryHits >= 6) return true;
  return length >= 420 && (literaryHits >= 2 || abstractHits >= 7);
}

function chatReplyAsLiveSpokenBeat(value = "") {
  let text = String(value || "").trim();
  if (!text) return "";
  text = text
    .replace(/仿佛|像是|如同|就好像|就像/g, "")
    .replace(/几乎要把我整个人[^。！？!?]*(?:震碎|撞裂开|顶穿|带跑|震散)[。！？!?]?/gu, "")
    .replace(/[^。！？!?]*(?:每一处|每一寸|每根|所有)[^。！？!?]*(?:神经|感官|褶皱|肌肉|骨骼|骨架|脊椎|脊背)[^。！？!?]*[。！？!?]?/gu, "")
    .replace(/那种[^。！？!?]*(?:胀满感|饱胀感|拉扯感|酥麻感|压迫感)[^。！？!?]*[。！？!?]?/gu, "")
    .replace(/正?在(?:不断|一点点|一圈圈|缓缓|微微)[^。！？!?]*[。！？!?]?/gu, "")
    .replace(/[ 	]{2,}/g, " ")
    .replace(/[，,]\s*[，,]/g, "，")
    .trim();
  if (!chatReplyHasIntimateVocalReaction(text)) {
    text = `啊……！${text}`;
  }
  return text;
}

