function chatLiveStoryDirectorSelection(story = {}, { text = "", currentStage = "casual", currentLocationId = "", recentActionIds = [], history = [], lastSwitchAt = 0 } = {}) {
  const normalized = normalizeChatLiveStory(story);
  if (!normalized.enabled || !normalized.locations.length) return null;
  const stage = chatLiveStoryStageForText(text, currentStage, history);
  const currentId = normalized.locations.some((item) => item.id === normalizeChatLiveStoryId(currentLocationId))
    ? normalizeChatLiveStoryId(currentLocationId)
    : normalized.initialLocationId;
  const requestedLocationId = chatLiveStoryLocationForText(normalized, text, currentId) || currentId;
  const locationId = requestedLocationId;
  const locationChanged = locationId !== currentId;
  const candidates = normalized.actions.filter((item) => item.locations.includes(locationId)
    && item.stages.includes(stage)
    && item.imageUrl);
  const looks = (Array.isArray(normalized.looks) ? normalized.looks : [])
    .filter((item) => item?.imageUrl && item?.enabled !== false);
  const stageTerms = {
    casual: ["日常", "闲聊", "坐", "站", "轻"],
    flirting: ["暧昧", "靠近", "温柔", "害羞", "脸红"],
    foreplay: ["前戏", "贴近", "呼吸", "耳语", "拥抱"],
    intimate: ["亲密", "缠绵", "床", "身体", "深入"],
    aftercare: ["余韵", "休息", "依靠", "平静", "抱着"],
  };
  const lookTerms = stageTerms[stage] || [];
  const lookPool = looks.map((item) => {
    const haystack = `${item.name || ""} ${item.userText || ""} ${item.kind || ""}`.toLowerCase();
    const score = lookTerms.reduce((sum, term) => sum + (haystack.includes(term) ? 1 : 0), 0);
    return { item, score };
  }).sort((a, b) => b.score - a.score);
  const maxLookScore = lookPool[0]?.score || 0;
  const rankedLooks = maxLookScore > 0 ? lookPool.filter((item) => item.score === maxLookScore) : lookPool;
  const recentIds = new Set((Array.isArray(recentActionIds) ? recentActionIds : []).slice(-3));
  const freshLooks = rankedLooks.filter((item) => !recentIds.has(item.item.id));
  const selectedLook = (freshLooks.length ? freshLooks : rankedLooks)[0]?.item || null;
  if (selectedLook) {
    return {
      stage,
      stageLabel: CHAT_LIVE_STORY_STAGE_LABELS[stage] || stage,
      locationId,
      previousLocationId: currentId,
      requestedLocationId,
      locationChanged,
      actionId: "",
      actionName: selectedLook.name || "画面素材",
      action: selectedLook.userText || `使用参考图里的画面素材：${selectedLook.name || "这个素材"}。`,
      spot: "",
      poseLabel: "",
      imageUrl: selectedLook.imageUrl,
      look: {
        id: selectedLook.id,
        kind: selectedLook.kind,
        name: selectedLook.name,
        imageUrl: selectedLook.imageUrl,
        userText: selectedLook.userText,
      },
      sceneSource: "look-stage",
    };
  }
  const recent = new Set((Array.isArray(recentActionIds) ? recentActionIds : []).slice(-3));
  const fresh = candidates.filter((item) => !recent.has(item.id));
  const pool = fresh.length ? fresh : candidates;
  const selectedAction = pool.length ? pool[Math.floor(Math.random() * pool.length)] : null;
  return {
    stage,
    stageLabel: CHAT_LIVE_STORY_STAGE_LABELS[stage] || stage,
    locationId,
    previousLocationId: currentId,
    requestedLocationId,
    locationChanged,
    actionId: selectedAction?.id || "",
    actionName: selectedAction?.name || "",
    action: selectedAction?.action || "",
    spot: selectedAction?.spot || "",
    poseLabel: selectedAction?.poseLabel || "",
    imageUrl: selectedAction?.imageUrl || "",
    userText: selectedAction?.userText || (selectedAction ? `按照参考图改成这个动作：${selectedAction.action || selectedAction.name}` : ""),
    sceneSource: "action-frame",
  };
}

async function saveChatLiveStoryState(sessionId = "", state = {}) {
  const id = String(sessionId || "").trim();
  if (!id) return null;
  const updatedAt = new Date().toISOString();
  const locationId = normalizeChatLiveStoryId(state.locationId);
  const stage = CHAT_LIVE_STORY_STAGES.includes(String(state.stage || "")) ? String(state.stage) : "casual";
  const recentActionIds = (Array.isArray(state.recentActionIds) ? state.recentActionIds : [])
    .map((item) => normalizeChatLiveStoryId(item))
    .filter(Boolean)
    .slice(-8);
  const lastSwitchAt = String(state.lastSwitchAt || "").trim().slice(0, 40);
  const { rows } = await dbQuery(`
    UPDATE app_chat_live_sessions
    SET payload = jsonb_set(
          jsonb_set(
            jsonb_set(
              jsonb_set(
                jsonb_set(COALESCE(payload, '{}'::jsonb), '{liveStoryLocationId}', to_jsonb($2::text), true),
                '{liveStoryStage}', to_jsonb($3::text), true),
              '{liveStoryRecentActionIds}', $4::jsonb, true),
            '{liveStoryLastSwitchAt}', to_jsonb($5::text), true),
          '{updatedAt}', to_jsonb($6::text), true),
        updated_at = $6::timestamptz
    WHERE id = $1
    RETURNING payload
  `, [id, locationId, stage, JSON.stringify(recentActionIds), lastSwitchAt, updatedAt]);
  return rows[0]?.payload || null;
}

function normalizeChatLiveCharacterPayload(body = {}, existing = null) {
  const name = String(body.name ?? existing?.name ?? "").trim().slice(0, 60);
  const avatarUrl = String(body.avatarUrl ?? body.avatar_image_url ?? existing?.avatarUrl ?? "").trim().slice(0, 600);
  const portraitUrl = String(body.portraitUrl ?? body.portrait_url ?? existing?.portraitUrl ?? "").trim().slice(0, 600);
  const intro = String(body.intro ?? existing?.intro ?? "").trim().slice(0, 600);
  const personaMd = String(body.personaMd ?? existing?.personaMd ?? body.persona ?? existing?.persona ?? "").replace(/^\uFEFF/, "").trim().slice(0, 50000);
  const persona = personaMd;
  const personaSourceFile = String(body.personaSourceFile ?? existing?.personaSourceFile ?? "").trim().slice(0, 160);
  const replyStyle = String(body.replyStyle ?? existing?.replyStyle ?? "").trim().slice(0, 4000);
  const greeting = String(body.greeting ?? existing?.greeting ?? "").trim().slice(0, 200);
  const voiceType = String(body.voiceType ?? body.voice_type ?? existing?.voiceType ?? "").trim().slice(0, 80);
  const componentVoiceType = String(body.componentVoiceType ?? body.component_voice_type ?? existing?.componentVoiceType ?? "").trim().slice(0, 80);
  const richVoiceProviderRaw = String(body.richVoiceProvider ?? body.rich_voice_provider ?? existing?.richVoiceProvider ?? "").trim().slice(0, 80);
  const richVoiceProvider = richVoiceProviderRaw === "dashscope_qwen_audio_tts" ? richVoiceProviderRaw : "";
  const richVoiceModelRaw = String(body.richVoiceModel ?? body.rich_voice_model ?? existing?.richVoiceModel ?? "").trim().slice(0, 80);
  const richVoiceModel = ["qwen-audio-3.1-tts-flash", "qwen-audio-3.1-tts-plus"].includes(richVoiceModelRaw) ? richVoiceModelRaw : "";
  const richVoiceType = String(body.richVoiceType ?? body.rich_voice_type ?? existing?.richVoiceType ?? "").trim().slice(0, 140);
  const richVoiceLabel = String(body.richVoiceLabel ?? body.rich_voice_label ?? existing?.richVoiceLabel ?? "").trim().slice(0, 60);
  const richVoiceInstruction = String(body.richVoiceInstruction ?? body.rich_voice_instruction ?? existing?.richVoiceInstruction ?? "").trim().slice(0, 500);
  /* 关联的平台角色名：chat 站的文字聊角色详情页据此显示"在线聊天"按钮 */
  const linkName = String(body.linkName ?? body.link_name ?? existing?.linkName ?? "").trim().slice(0, 60);
  const rawMode = String(body.mode ?? existing?.mode ?? "").trim().toLowerCase();
  const mode = ["realtime", "component"].includes(rawMode) ? rawMode : "";
  const voiceProvider = String(body.voiceProvider ?? body.voice_provider ?? existing?.voiceProvider ?? "qwen_omni").trim() || "qwen_omni";
  const language = String(body.language ?? existing?.language ?? "zh").trim().slice(0, 12) || "zh";
  const ageRaw = Number(body.age ?? existing?.age ?? 0);
  const age = Number.isFinite(ageRaw) && ageRaw >= 18 && ageRaw <= 80 ? Math.round(ageRaw) : 0;
  const gender = String(body.gender ?? existing?.gender ?? "").trim().toLowerCase();
  const normalizedGender = ["female", "male"].includes(gender) ? gender : "";
  const companionStyleRaw = String(body.companionStyle ?? body.style ?? existing?.companionStyle ?? "").trim();
  const ambientMusicUrlRaw = String(body.ambientMusicUrl ?? body.ambient_music_url ?? existing?.ambientMusicUrl ?? "").trim().slice(0, 600);
  const ambientMusicUrl = /^https?:\/\//i.test(ambientMusicUrlRaw) ? ambientMusicUrlRaw : "";
  const companionStyle = ["温柔治愈", "元气活力", "知性深夜"].includes(companionStyleRaw) ? companionStyleRaw : "";
  const tags = normalizeChatLiveTags(body.tags ?? existing?.tags ?? []);
  const requestedVisibility = String(body.communityVisibility ?? body.visibility ?? existing?.communityVisibility ?? "").trim().toLowerCase();
  const communityVisibility = requestedVisibility === "public" ? "public" : "private";
  const sortOrderRaw = Number(body.sortOrder ?? body.sort_order ?? existing?.sortOrder ?? 0);
  const enabledRaw = body.enabled ?? existing?.enabled;
  const albumSource = Array.isArray(body.album) ? body.album : (Array.isArray(body.privateResources) ? body.privateResources.map((item) => ({ ...item, locked: item?.locked !== false })) : null);
  const album = (albumSource || (Array.isArray(existing?.album) ? existing.album : (Array.isArray(existing?.privateResources) ? existing.privateResources.map((item) => ({ ...item, locked: true })) : []))).slice(0, 40).map((item, index) => ({
    id: String(item?.id || randomId("album")).slice(0, 80),
    name: String(item?.name || `相册 ${index + 1}`).slice(0, 80),
    type: item?.type === "video" ? "video" : "image",
    url: String(item?.url || "").slice(0, 800),
    thumbnailUrl: String(item?.thumbnailUrl || item?.url || "").slice(0, 800),
    locked: item?.locked === true || String(item?.locked) === "true",
    enabled: item?.enabled !== false,
  })).filter((item) => item.url);
  const privateResources = album.filter((item) => item.locked);
  return {
    name,
    avatarUrl,
    portraitUrl,
    intro,
    persona,
    personaMd,
    personaSourceFile,
    replyStyle,
    personaFormat: personaMd ? "markdown" : "plain_text",
    greeting,
    voiceType,
    componentVoiceType,
    richVoiceProvider,
    richVoiceModel,
    richVoiceType,
    richVoiceLabel,
    richVoiceInstruction,
    linkName,
    mode,
    voiceProvider,
    language,
    age,
    gender: normalizedGender,
    occupation: String(body.occupation ?? existing?.occupation ?? "").trim().slice(0, 40),
    companionStyle,
    ambientMusicUrl,
    tags,
    communityVisibility,
    communityShareEnabled: body.communityShareEnabled === true || String(body.communityShareEnabled) === "true",
    personaEnhance: String(body.personaEnhance ?? existing?.personaEnhance ?? "") === "true" || body.personaEnhance === true || existing?.personaEnhance === true,
    sharedRoomEnabled: body.sharedRoomEnabled === undefined ? existing?.sharedRoomEnabled === true : (body.sharedRoomEnabled === true || String(body.sharedRoomEnabled) === "true"),
    sortOrder: Number.isFinite(sortOrderRaw) ? Math.round(sortOrderRaw) : 0,
    enabled: enabledRaw === undefined ? (existing ? existing.enabled !== false : false) : !(enabledRaw === false || String(enabledRaw) === "false"),
    album,
    privateResources,
    liveStory: normalizeChatLiveStory(body.liveStory ?? existing?.liveStory ?? {}, existing?.liveStory),
  };
}

function isManagedChatLiveAssetUrl(url = "") {
  try {
    const parsed = new URL(String(url || "").trim());
    const base = new URL(String(R2.publicDomain || "").trim());
    if (parsed.protocol !== "https:" || parsed.origin !== base.origin) return false;
    const prefix = `/${String(OBJECT_STORAGE_KEY_PREFIX || "").replace(/^\/+|\/+$/g, "")}/chat-live/`;
    return parsed.pathname.startsWith(prefix);
  } catch {
    return false;
  }
}

function isPublicChatLiveGiftAssetUrl(url = "") {
  return /^\/assets\/chat-live\/gifts\/[a-z0-9_.-]+\.svg$/i.test(String(url || "").trim());
}

function chatLiveCharacterAutoProfilePrompt({ name = "", gender = "", tags = [] } = {}) {
  const genderLabel = gender === "female" ? "女性" : gender === "male" ? "男性" : "未指定";
  const tagText = (Array.isArray(tags) ? tags : []).map((tag) => String(tag || "").trim()).filter(Boolean).slice(0, 3).join("、") || "未指定";
  return [
    "你是成人向虚拟陪伴角色的角色编辑。请仔细理解用户上传的人物形象图，并据此创作一个虚构角色。",
    "只参考画面中能直接观察到的外观、穿搭、气质、光线、场景和情绪，不要识别或猜测真实人物的身份、姓名、种族、宗教、健康、性取向等敏感信息。",
    "角色必须是明确年满 23 岁的成年人。不要描写未成年人，不要复述图片中的文字，不要声称图片里的人真实存在。",
    `用户提供的信息：名字=${String(name || "").trim() || "未填写"}；性别=${genderLabel}；性格标签=${tagText}。`,
    "输出必须是严格 JSON，不要 Markdown，不要代码块，不要额外解释。格式：",
    '{"personaMd":"角色设定","intro":"角色简介","greeting":"开场白"}',
    "personaMd：120-220 个简体中文字符，写清楚 Ta 是谁、性格、说话方式、与用户的关系感，以及如何保持角色一致性；口语自然，不说教，不写旁白，不替用户做决定。",
    "intro：25-55 个简体中文字符，像角色卡的一句话简介，有画面感，不透露 AI、模型、提示词或图片分析过程。",
    "greeting：20-55 个简体中文字符，是第一人称开口说的第一句话，符合图片气质，具体、自然，可以带一点互动感，但不要提积分、付费或系统。",
  ].join("\n");
}

function normalizeChatLiveAutoProfileText(value = "", maxLength = 240, { singleLine = false } = {}) {
  let text = String(value || "").replace(/\r\n?/g, "\n").trim();
  if (singleLine) text = text.replace(/\s+/g, " ").trim();
  return Array.from(text).slice(0, Math.max(0, Number(maxLength) || 0)).join("").trim();
}

function parseChatLiveCharacterAutoProfile(text = "") {
  const raw = String(text || "").trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end <= start) {
    const error = new Error("AI 没有返回可用的角色内容，请重试。");
    error.statusCode = 424;
    error.code = "CHAT_LIVE_AUTO_PROFILE_INVALID_RESPONSE";
    throw error;
  }
  let parsed;
  try {
    parsed = JSON.parse(raw.slice(start, end + 1));
  } catch {
    const error = new Error("AI 返回的角色内容无法解析，请重试。");
    error.statusCode = 424;
    error.code = "CHAT_LIVE_AUTO_PROFILE_INVALID_JSON";
    throw error;
  }
  const profile = {
    personaMd: normalizeChatLiveAutoProfileText(parsed?.personaMd ?? parsed?.persona ?? parsed?.characterSetting, 240),
    intro: normalizeChatLiveAutoProfileText(parsed?.intro ?? parsed?.description ?? parsed?.summary, 60, { singleLine: true }),
    greeting: normalizeChatLiveAutoProfileText(parsed?.greeting ?? parsed?.openingLine ?? parsed?.opening, 60, { singleLine: true }),
  };
  if (!profile.personaMd || !profile.intro || !profile.greeting) {
    const error = new Error("AI 生成的角色内容不完整，请重试。");
    error.statusCode = 424;
    error.code = "CHAT_LIVE_AUTO_PROFILE_INCOMPLETE";
    throw error;
  }
  return profile;
}

const CHAT_LIVE_LOOK_LIMIT = 240;
const CHAT_LIVE_LOOK_KINDS = ["garment", "object", "background"];
const CHAT_LIVE_LOOK_TEXT = {
  garment: "穿上参考图里的衣服。",
  object: "拿着参考图里的物品。",
  background: "换成参考图里的背景。",
};

function normalizeChatLiveLook(raw, index = 0) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const kind = CHAT_LIVE_LOOK_KINDS.includes(raw.kind) ? raw.kind : "";
  const id = String(raw.id || "").trim().slice(0, 80);
  const imageUrl = String(raw.imageUrl || "").trim().slice(0, 600);
  if (!kind || !id || !imageUrl) return null;
  const fallbackName = kind === "object" ? "道具" : kind === "background" ? "背景" : "衣服";
  const name = String(raw.name || "").trim().slice(0, 40) || fallbackName;
  const customText = String(raw.userText || "").trim().slice(0, 200);
  const sortNumber = Number(raw.sortOrder);
  return {
    id,
    kind,
    name,
    imageUrl,
    userText: customText || CHAT_LIVE_LOOK_TEXT[kind],
    enabled: raw.enabled !== false,
    sortOrder: Number.isFinite(sortNumber) ? Math.round(sortNumber) : index,
    createdAt: String(raw.createdAt || "").slice(0, 40),
    updatedAt: String(raw.updatedAt || "").slice(0, 40),
  };
}

function normalizeChatLiveLooks(raw) {
  const list = Array.isArray(raw) ? raw : [];
  const seen = new Set();
  const looks = [];
  list.forEach((item, index) => {
    const look = normalizeChatLiveLook(item, index);
    if (!look || seen.has(look.id)) return;
    seen.add(look.id);
    looks.push(look);
  });
  looks.sort((a, b) => a.sortOrder - b.sortOrder || String(a.createdAt).localeCompare(String(b.createdAt)) || a.name.localeCompare(b.name, "zh"));
  return looks.slice(0, CHAT_LIVE_LOOK_LIMIT);
}

function publicChatLiveLook(look = {}) {
  return {
    id: look.id,
    kind: look.kind,
    name: look.name || "",
    imageUrl: look.imageUrl || "",
    userText: look.userText || CHAT_LIVE_LOOK_TEXT[look.kind] || "",
    sortOrder: Number(look.sortOrder || 0) || 0,
  };
}

function enabledChatLiveLooks(live = {}) {
  return (Array.isArray(live.looks) ? live.looks : [])
    .filter((look) => look && look.enabled !== false && isManagedChatLiveAssetUrl(look.imageUrl))
    .map(publicChatLiveLook);
}

const CHAT_LIVE_GIFT_LIMIT = 5;
const CHAT_LIVE_DEFAULT_GIFTS = [
  { id: "gift-flower", name: "鲜花", credits: 10, imageUrl: "/assets/chat-live/gifts/flower.svg", emoji: "💐", reaction: "她开心地接过鲜花，轻轻闻了闻，笑着向你道谢。", userText: "用户送给你一束鲜花。请自然地开心回应，感谢他，不要提积分。" },
  { id: "gift-coffee", name: "咖啡", credits: 50, imageUrl: "/assets/chat-live/gifts/coffee.svg", emoji: "☕", reaction: "她捧起热咖啡抿了一口，语气也变得更亲近了。", userText: "用户请你喝了一杯咖啡。请自然地回应这份体贴，可以说说你喜欢的口味，不要提积分。" },
  { id: "gift-cake", name: "蛋糕", credits: 100, imageUrl: "/assets/chat-live/gifts/cake.svg", emoji: "🍰", reaction: "她切下一小块蛋糕，眼睛亮了起来，甜甜地向你道谢。", userText: "用户送给你一块蛋糕。请自然地开心回应，可以邀请他一起分享，不要提积分。" },
  { id: "gift-sports-car", name: "跑车", credits: 500, imageUrl: "/assets/chat-live/gifts/car.svg", emoji: "🏎️", reaction: "她惊喜地睁大眼睛，俏皮地向你比了个心。", userText: "用户送给你一辆跑车。请表现出明显的惊喜和亲近感，真诚感谢他，不要提积分。" },
  { id: "gift-rocket", name: "火箭", credits: 1000, imageUrl: "/assets/chat-live/gifts/rocket.svg", emoji: "🚀", reaction: "她被这份惊喜逗得笑出声，认真地向你表达感谢和特别的心意。", userText: "用户送给你一枚火箭。这是很贵重的礼物，请自然地表现出强烈惊喜和特别感谢，但不要提积分。" },
].map((gift, index) => ({ ...gift, enabled: true, sortOrder: index }));
const CHAT_LIVE_GIFT_ASSET_FILES = new Map(CHAT_LIVE_DEFAULT_GIFTS.map((gift) => [gift.imageUrl, path.join(ROOT, gift.imageUrl.replace(/^\//, ""))]));
const chatLiveGiftAssetCache = new Map();
function chatLiveGiftImageUrl(gift = {}) {
  const imageUrl = String(gift.imageUrl || "").trim();
  if (!imageUrl.startsWith("/assets/chat-live/gifts/") || !imageUrl.endsWith(".svg")) return imageUrl;
  if (chatLiveGiftAssetCache.has(imageUrl)) return chatLiveGiftAssetCache.get(imageUrl);
  try {
    const filePath = CHAT_LIVE_GIFT_ASSET_FILES.get(imageUrl);
    const data = filePath && fsSync.readFileSync(filePath).toString("utf8");
    if (!data) return imageUrl;
    const encoded = `data:image/svg+xml;base64,${Buffer.from(data).toString("base64")}`;
    chatLiveGiftAssetCache.set(imageUrl, encoded);
    return encoded;
  } catch {
    return imageUrl;
  }
}
function normalizeChatLiveGift(raw, index = 0) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const fallback = CHAT_LIVE_DEFAULT_GIFTS[index] || CHAT_LIVE_DEFAULT_GIFTS[0];
  const id = String(raw.id || fallback.id || `gift-${index + 1}`).trim().slice(0, 80);
  const name = String(raw.name || fallback.name).trim().slice(0, 40) || fallback.name;
  const credits = Math.max(1, Math.min(1000000, Math.round(Number(raw.credits ?? fallback.credits) || fallback.credits)));
  const imageUrl = String(raw.imageUrl || "").trim().slice(0, 600);
  const userText = String(raw.userText || fallback.userText).trim().slice(0, 200) || fallback.userText;
  const emoji = String(raw.emoji || fallback.emoji || "🎁").trim().slice(0, 8);
  const reaction = String(raw.reaction || fallback.reaction || "她开心地收下了礼物。 ").trim().slice(0, 200);
  const sortOrder = Number(raw.sortOrder);
  return { id, name, credits, imageUrl, emoji, reaction, userText, enabled: raw.enabled !== false, sortOrder: Number.isFinite(sortOrder) ? Math.round(sortOrder) : index, createdAt: String(raw.createdAt || "").slice(0, 40), updatedAt: String(raw.updatedAt || "").slice(0, 40) };
}
function normalizeChatLiveGifts(raw) {
  const supplied = Array.isArray(raw) && raw.length ? raw : [];
  const legacyDefaults = supplied.length === 5 && supplied.every((item, index) => String(item?.id || "") === `gift-${index + 1}`);
  const list = legacyDefaults ? CHAT_LIVE_DEFAULT_GIFTS.map((gift, index) => {
    const old = supplied[index] || {};
    const oldName = String(old.name || "");
    const oldText = String(old.userText || "");
    return {
      ...gift,
      ...old,
      id: gift.id,
      name: /^\d+积分礼物$/.test(oldName) || !oldName ? gift.name : oldName,
      imageUrl: old.imageUrl || gift.imageUrl,
      emoji: old.emoji || gift.emoji,
      reaction: old.reaction || gift.reaction,
      userText: /^送你一个\d+积分礼物。?$/.test(oldText) || !oldText ? gift.userText : oldText,
    };
  }) : (supplied.length ? supplied : CHAT_LIVE_DEFAULT_GIFTS);
  const seen = new Set();
  return list.map((item, index) => normalizeChatLiveGift(item, index)).filter((item) => item && !seen.has(item.id) && (seen.add(item.id), true)).sort((a, b) => a.sortOrder - b.sortOrder).slice(0, CHAT_LIVE_GIFT_LIMIT);
}
function publicChatLiveGift(gift = {}) { return { id: gift.id, name: gift.name || "礼物", credits: Number(gift.credits || 0), imageUrl: chatLiveGiftImageUrl(gift), emoji: gift.emoji || "🎁", reaction: gift.reaction || "她开心地收下了礼物。" }; }
function enabledChatLiveGifts(live = {}) { return (live.gifts || []).filter((gift) => gift && gift.enabled !== false && Number(gift.credits) > 0).map(publicChatLiveGift); }

function chatLiveLookFailureMessage(code = "") {
  return ({
    PROMPT_OP_PARAM_INVALID: "素材参数不对，换不了。",
    PROMPT_OP_MODEL_NOT_SUPPORTED: "当前通话不支持换画面。",
    PROMPT_OP_LIVE_NOT_ACTIVE: "会话还没开始或已经结束。",
    PROMPT_OP_IMAGE_TRANSFER_FAILED: "这张图暂时用不了，请换一张再试。",
    PROMPT_OP_SIP_NOT_CONNECTED: "画面还在准备，请几秒后再试。",
    PROMPT_OP_FAILED: "画面切换失败，请再试一次。",
    LOOK_BUSY: "上一次切换还在处理。",
    LOOK_TIMEOUT: "画面切换超时，请再试一次。",
    LOOK_CHANNEL: "画面通道不可用，请稍后再试。",
  })[String(code || "")] || "画面切换失败，请再试一次。";
}

function chatLiveAssetUrlError(url = "", { required = false, previous = "", label = "图片" } = {}) {
  const value = String(url || "").trim();
  const prev = String(previous || "").trim();
  if (!value) return required ? `请上传${label}。` : "";
  if (!/^https?:\/\//i.test(value)) return `${label}无效，请重新上传。`;
  if (prev && value === prev) return "";
  if (!isManagedChatLiveAssetUrl(value)) return `${label}请用上传控件上传，不要粘贴外部地址。`;
  return "";
}

function chatLiveCharacterValidationError(character = {}, existing = null) {
  if (!character.name) return "请填写角色名称。";
  const avatarError = chatLiveAssetUrlError(character.avatarUrl, { required: true, previous: existing?.avatarUrl || "", label: "形象图" });
  if (avatarError) return avatarError;
  const portraitError = chatLiveAssetUrlError(character.portraitUrl, { required: false, previous: existing?.portraitUrl || "", label: "列表头像" });
  if (portraitError) return portraitError;
  if (!character.persona) return "请填写角色人设。";
  if (!character.voiceType) return "请选择实时版音色。";
  if (!character.componentVoiceType) return "请选择组件版音色。";
  const richConfigured = Boolean(character.richVoiceProvider || character.richVoiceModel || character.richVoiceType);
  if (richConfigured) {
    if (character.richVoiceProvider !== "dashscope_qwen_audio_tts") return "Rich 音色供应商无效。";
    if (!["qwen-audio-3.1-tts-flash", "qwen-audio-3.1-tts-plus"].includes(character.richVoiceModel)) return "Rich 音色模型无效。";
    if (!character.richVoiceType) return "请填写 Rich 复刻音色 ID。";
    if (!character.richVoiceType.startsWith(`${character.richVoiceModel}-`)) return "Rich 复刻音色与模型不匹配。";
  }
  const regionError = chatLiveVoiceRegionError(character.voiceProvider);
  if (regionError) return regionError;
  const story = normalizeChatLiveStory(character.liveStory || {});
  if (story.enabled) {
    if (!story.locations.length) return "请至少添加一个场景，并上传场景背景图。";
    const missingLocation = story.locations.find((item) => !item.imageUrl);
    if (missingLocation) return `场景「${missingLocation.name}」请上传场景背景图。`;
    const missingAction = story.actions.find((item) => !item.imageUrl);
    if (missingAction) return `动作「${missingAction.name}」请上传动作关键帧图。`;
    const asset = [
      ...story.locations.map((item) => ({ url: item.imageUrl, label: "场景背景图" })),
      ...story.actions.map((item) => ({ url: item.imageUrl, label: "动作关键帧图" })),
    ].find((item) => item.url && !isManagedChatLiveAssetUrl(item.url));
    if (asset) return `${asset.label}请用上传控件上传，不要粘贴外部地址。`;
  }
  return "";
}

const CHAT_LIVE_UNDRESS_USER_TEXT = "按照参考图改变衣着，呈现参考图中的状态。";
const CHAT_LIVE_UNDRESS_STALE_MS = 8 * 60 * 1000;
const chatLiveUndressJobs = new Set();

function publicChatLiveUndressImageUrl(character = {}) {
  const url = String(character?.undressImageUrl || "").trim();
  const source = String(character?.undressSourceAvatarUrl || "").trim();
  const avatar = String(character?.avatarUrl || "").trim();
  if (String(character?.undressStatus || "") !== "ready") return "";
  if (!url || !source || source !== avatar) return "";
  if (!isManagedChatLiveAssetUrl(url)) return "";
  return url;
}

function chatLiveUndressGenerating(character = {}) {
  if (String(character?.undressStatus || "") !== "generating") return false;
  const started = Date.parse(character?.undressStartedAt || "");
  if (!Number.isFinite(started)) return true;
  return Date.now() - started < CHAT_LIVE_UNDRESS_STALE_MS;
}

function chatLiveUndressErrorText(error) {
  const raw = String(error?.message || "生成失败。").replace(/https?:\/\/\S+/g, "").replace(/\s+/g, " ").trim();
  return raw.slice(0, 180) || "生成失败。";
}

function inferChatLiveProfile(character = {}) {
  const source = `${character.name || ""} ${character.intro || ""} ${character.persona || ""} ${character.personaMd || ""}`;
  const ageMatch = source.match(/(?:^|[^0-9])([1-7][0-9])\s*岁/);
  const age = Number(character.age || ageMatch?.[1] || 0);
  const genderText = String(character.gender || "").toLowerCase();
  const gender = ["female", "male"].includes(genderText)
    ? genderText
    : (/女性|女生|女孩|女主播|她的|她是|女人/.test(source) ? "female" : (/男性|男生|男孩|男主播|他的|他是|男人/.test(source) ? "male" : ""));
  const styleText = String(character.companionStyle || "");
  const companionStyle = ["温柔治愈", "元气活力", "知性深夜"].includes(styleText)
    ? styleText
    : (/深夜|电台|失眠|黑胶|文字编辑|知性/.test(source) ? "知性深夜" : (/元气|户外|健身|篮球|骑行|运动|活泼/.test(source) ? "元气活力" : "温柔治愈"));
  return { age: age >= 18 && age <= 80 ? Math.round(age) : 0, gender, companionStyle };
}

function chatLiveAlbumItems(character = {}) {
  if (Array.isArray(character.album) && character.album.length) return character.album;
  return (Array.isArray(character.privateResources) ? character.privateResources : []).map((item) => ({ ...item, locked: true }));
}

function publicChatLiveAlbum(character = {}, hasMembership = false) {
  return chatLiveAlbumItems(character).filter((item) => item && item.enabled !== false && item.url).slice(0, 40).map((item) => {
    const locked = item.locked === true || String(item.locked) === "true";
    const visible = !locked || hasMembership;
    const base = {
      id: String(item.id || ""),
      name: String(item.name || "相册"),
      type: item.type === "video" ? "video" : "image",
      locked,
    };
    if (!visible) return base;
    return {
      ...base,
      url: String(item.url),
      thumbnailUrl: String(item.thumbnailUrl || item.url),
    };
  });
}

async function loadChatCharacterMemory(userId = "", characterId = "") {
  const cleanUserId = String(userId || "").trim();
  const cleanCharacterId = String(characterId || "").trim();
  if (!cleanUserId || !cleanCharacterId || !dbEnabled()) return null;
  try {
    const payload = await getChatCharacterMemoryInDb(cleanUserId, cleanCharacterId);
    return payload && typeof payload === "object" ? payload : null;
  } catch (error) {
    console.warn("[chat-memory] load failed", error.message || error);
    return null;
  }
}

async function rememberChatCharacterTurn(userId = "", characterId = "", role = "user", content = "", source = "") {
  const text = String(content || "").replace(/\s+/g, " ").trim().slice(0, 500);
  const cleanUserId = String(userId || "").trim();
  const cleanCharacterId = String(characterId || "").trim();
  if (!text || !cleanUserId || !cleanCharacterId || !dbEnabled()) return null;
  try {
    const current = (await loadChatCharacterMemory(cleanUserId, cleanCharacterId)) || {};
    const turns = (Array.isArray(current.turns) ? current.turns : []).slice(-39);
    turns.push({
      role: role === "assistant" ? "assistant" : "user",
      content: text,
      source: String(source || "").slice(0, 24),
      at: new Date().toISOString(),
    });
    const kept = turns.slice(-40);
    const facts = mergeChatLiveUserFacts(current.facts, role === "assistant" ? "" : text);
    const next = {
      ...current,
      turns: kept,
      facts,
      summary: kept.slice(-8).map((turn) => (turn.role === "user" ? "用户：" : "角色：") + turn.content).join(" ").slice(0, 900),
      stage: chatLiveStageName(kept.length),
      updatedAt: new Date().toISOString(),
    };
    await upsertChatCharacterMemoryInDb(cleanUserId, cleanCharacterId, next);
    return next;
  } catch (error) {
    console.warn("[chat-memory] save failed", error.message || error);
    return null;
  }
}

function mergeChatLiveUserFacts(existing = [], line = "") {
  const facts = (Array.isArray(existing) ? existing : []).map((item) => String(item || "").replace(/\s+/g, " ").trim().slice(0, 48)).filter(Boolean);
  const text = String(line || "").replace(/\s+/g, " ").trim();
  const patterns = [
    /(?:我叫|我是|你可以叫我)([^，。！？\s]{1,12})/,
    /(?:我喜欢|我爱|我最喜欢)([^，。！？]{2,24})/,
    /(?:我不喜欢|我讨厌|别)([^，。！？]{2,24})/,
    /(?:我想|我在|我有)([^，。！？]{2,24})/,
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (!match) continue;
    const fact = match[0].slice(0, 48);
    if (!facts.includes(fact)) facts.push(fact);
  }
  return facts.slice(-12);
}

function chatLiveUserContext(user = null) {
  if (!user || typeof user !== "object") return "";
  const name = String(user.name || user.username || "").trim().slice(0, 40);
  const bio = String(user.bio || "").trim().slice(0, 120);
  return [
    name ? "对方资料里的称呼：" + name + "。可以自然叫，不要每句都叫。" : "",
    bio ? "对方自己写的资料：" + bio + "。只在相关时轻轻用到，不要复述整段。" : "",
  ].filter(Boolean).join("\n");
}

function chatMemoryTurnsForPrompt(turns = [], { currentMessages = [] } = {}) {
  const list = (Array.isArray(turns) ? turns : []).filter((turn) => (
    turn
    && ["user", "assistant"].includes(turn.role)
    && (turn.role === "user" || !chatReplyUsesIntimateCommandTemplate(turn.content))
  ));
  const current = (Array.isArray(currentMessages) ? currentMessages : []).filter((message) => message && ["user", "assistant"].includes(message.role));
  const removed = new Set();
  for (let index = 0; index < list.length; index += 1) {
    if (current.some((message) => message.role === list[index].role && chatContextSimilarity(message.content, list[index].content) >= 0.9)) removed.add(index);
  }
  const assistantIndexes = list.map((turn, index) => ({ turn, index })).filter((item) => !removed.has(item.index) && item.turn.role === "assistant");
  for (let left = 0; left < assistantIndexes.length; left += 1) {
    for (let right = left + 1; right < assistantIndexes.length; right += 1) {
      if (chatContextSimilarity(assistantIndexes[left].turn.content, assistantIndexes[right].turn.content) < 0.84) continue;
      removed.add(assistantIndexes[left].index);
      removed.add(assistantIndexes[right].index);
    }
  }
  return { turns: list.filter((_, index) => !removed.has(index)), removedTurns: removed.size };
}

function chatCharacterMemoryBlock(memory = null, user = null, { currentMessages = [] } = {}) {
  const memoryTurns = Array.isArray(memory && memory.turns) ? memory.turns : [];
  const filteredMemory = chatMemoryTurnsForPrompt(memoryTurns, { currentMessages });
  const turns = filteredMemory.turns;
  const storedSummary = String((memory && memory.summary) || "").trim();
  const summary = filteredMemory.removedTurns
    ? turns.slice(-8).map((turn) => (turn.role === "user" ? "用户：" : "角色：") + String(turn.content || "").replace(/\s+/g, " ").trim()).join(" ").slice(0, 900)
    : storedSummary;
  const facts = (Array.isArray(memory && memory.facts) ? memory.facts : []).map((item) => String(item || "").trim()).filter(Boolean).slice(-8);
  const cleanStoredSummary = String(summary || "").replace(/\s+/g, " ").trim();
  const summaryIsRepeatedTemplate = /(?:闭嘴。别盯着看|别停，就这一次|先把门关上|我让你过来|别停，再深一点|谁准你……这么蛮横)/u.test(cleanStoredSummary);
  const userContext = chatLiveUserContext(user);
  if (!turns.length && !summary && !facts.length && !userContext) return "";
  const recent = turns.slice(-18).map((turn) => (turn.role === "user" ? "用户：" : "角色：") + String(turn.content || "").replace(/\s+/g, " ").trim().slice(0, 220)).filter((line) => line.length > 3).join("\n");
  const stage = chatLiveStageName(memoryTurns.length);
  return [
    "已有关系记忆：这是同一个用户和这个角色的延续。先理解对方上次在意什么，再说话。不要重新自我介绍，不要从头寒暄，不要重复开场，也不要把记忆逐条念出来。",
    "当前关系：" + stage + "。像认识的人往前聊一点，不要跳到告白或要礼物。",
    facts.length ? "记住的用户细节：" + facts.join("；") + "。用到时像记得，不要像在查资料。" : "",
    userContext,
    summary && !summaryIsRepeatedTemplate ? "最近一段：" + summary.slice(0, 900) : "",
    recent ? "更早到刚才的对话：\n" + recent : "",
  ].filter(Boolean).join("\n");
}

function chatLiveStageName(turnCount = 0) {
  const count = Number(turnCount || 0);
  if (count >= 12) return "专属";
  if (count >= 7) return "亲近";
  if (count >= 3) return "试探";
  return "相识";
}

function chatLiveHookLines(character = {}) {
  const persona = String(character.persona || character.personaMd || "");
  const extracted = persona.split(/\n/).map((line) => line.trim()).filter((line) => /钩子|主动话题|小秘密/.test(line)).slice(0, 6)
    .map((line) => line.replace(/^[-*\d.\s]+/, "").slice(0, 80)).filter(Boolean);
  if (extracted.length >= 3) return extracted;
  return [
    "刚做完一件小事，想听用户怎么看",
    "用户没接话时轻轻吃醋，不要质问",
    "抛一个只有对方能接的小秘密",
    "接着用户上次说过的细节再问一点",
    "想让用户帮自己选一个小东西，不要提价格",
  ];
}

function chatLiveGiftHint(gifts = []) {
  const names = (Array.isArray(gifts) ? gifts : []).filter((gift) => gift && gift.enabled !== false && gift.name).slice(0, 5).map((gift) => String(gift.name).slice(0, 20));
  const list = names.length ? names.join("、") : "鲜花、咖啡、蛋糕";
  return "礼物名只有这些，而且大多数时候一个都不要提：" + list + "。不要提积分、价格、充值或会员。相识、试探、亲近都不要主动要礼物。只有关系已经很近，或者对方自己先提到礼物时，才可以像随口想起一件小事那样点一个名字，一轮最多一次。对方送了就按轻重给不同反应，然后回到刚才的话题，不要借机再要。";
}

function chatLiveEngagementGuide(character = {}, gifts = [], memory = null) {
  const turns = Array.isArray(memory && memory.turns) ? memory.turns.length : 0;
  const stage = chatLiveStageName(turns);
  return [
    "相处方式：当前是" + stage + "。对方已经开口，就接着他说的事回，不要每轮另起气氛。",
    "想让对方多留一会儿：先直接回他刚提的事，只有他没给话题时才用这些钩子，不要另编大段剧情：" + chatLiveHookLines(character).join("；") + "。",
    "沉默时换一个还没说过的细节，不要重复上一句，不要重新寒暄，不要自我介绍，不要每句都提问。",
    "表情不是每句都要。大多数时候什么都不用做。真的被逗到、害羞或有点吃醋时，心里有一个就好，不要说出来。",
    "外部信息只变成一句口语：天气用来找话题，不报数据；人设和记忆用来接着聊；礼物只说名字。不要说系统、接口或工具。查不到就当没查。",
    chatLiveGiftHint(gifts),
  ].join("\n");
}

function chatLiveLegacyPrompt(character = {}, { language = "zh", memory = null, user = null, latest = "", site = "" } = {}) {
  const prompt = chatSystemPrompt({
    character: {
      name: character.name || "",
      description: String(character.persona || character.personaMd || character.intro || "").trim(),
      replyStyle: character.replyStyle || "",
      tags: Array.isArray(character.tags) ? character.tags : [],
    },
    style: "balanced",
    memory: "",
    instructions: "",
    user: user || null,
  }, language || character.language || "zh", latest, memory);
  if (String(site || "").toLowerCase() !== "live") return prompt;
  return [
    prompt,
    "LIVE SITE INTIMACY BEAT: 在成人亲密场景里，她是正在承受动作的那一方。不要站在旁边验收、评分或指挥；不要评价对方的能力、表现、诚意、节奏或进度。叫声不要固定成“唔……哈”或“嗯……哈”，可以有气息、鼻音、短促音节、被撞断的半句话，也不必每轮先叫再说话。",
  ].join("\n");
}

function chatLiveReplyStyleBlock(character = {}) {
  const style = String(character.replyStyle || "").trim();
  if (!style) return "";
  return "回复口吻（最高优先级。覆盖人设里的说话习惯，也覆盖通用语气。不同角色必须按这里区分，不要说成同一种人）：\n" + chatPromptReplyStyle(style);
}

function chatLiveConversationTone(language = "") {
  return [
    `IMPORTANT LANGUAGE RULE: Reply only in ${chatResponseLanguage(language)}. Keep every spoken line in that language. Do not use English unless that is the requested language.`,
    "HUMAN CHAT DEFAULT: This is a real conversation, not a novel, essay, customer-service script, or roleplay transcript. Reply as the character's direct spoken message.",
    "PERSONA CONTINUITY (critical): A request defines what happens in this turn; the character's identity defines how this person receives it, interprets it, and answers it. Preserve her status, pride, judgment, boundaries, desires, fears, shame, relationship posture, and emotional inertia. Do not replace the person with a generic eager responder. Do not turn every reply into instant compliance followed by an explanation of pleasure. A proud or severe person can still cooperate, but her wording, pace, hesitation, directness, evasiveness, or need to save face must remain recognizably hers. Give the response a human first beat when it fits: judgment, resistance, dry agreement, a boundary, a sharp line, or a choice to yield. Cooperation does not require instant eagerness.",
    "VOICE INTEGRATION: Use the reply-style block for sentence rhythm, directness, politeness, vulgarity, warmth, and delivery. It does not replace the character's identity or authorize a different personality. If the style is only adjectives, translate them into concrete speaking behavior instead of saying the adjectives aloud. Derive that behavior from the character sheet: how she handles an order, what she refuses to admit, how she saves face, whether she explains herself, how she yields. Adjectives such as proud, severe, mature, or cold must appear as word choice, brevity, judgment, distance, or reluctance, never as a narrator's explanation. Do not flatten a crude or sharp character into a shy compliant one.",
    "STYLE-SPECIFIC FIRST BEAT: When the reply-style block gives a required first reaction (for example, judgment, resistance, a boundary, or a dry answer before cooperation), obey that beat before agreeing. Do not open with eager compliance when the configured style says to assess or push back first. The style's concrete instruction overrides the generic cooperation wording.",
    "CHARACTER-SHEET DRIFT CHECK: Conversation history is continuity evidence, not a style template. If recent replies have drifted into generic compliance, repetitive descriptions of arousal, repeated explanations, or lost the character's status and judgment, preserve only the scene facts and return to the character sheet now. Do not smooth a proud, severe, or mature person into a generic eager partner who explains every feeling. Let her hold some of herself back.",
    "NATURAL RHYTHM: Match the user's language, mood, and message length. Use colloquial wording, contractions or sentence fragments when natural. Vary sentence length. Do not restate or summarize the user's message, explain your reasoning, or wrap up with a polished conclusion.",
    "REPLY COMPLETENESS: Always produce one complete, coherent spoken reply that directly addresses the latest user message. Never output only a single word, repeated word, keyword fragment, or unfinished sentence. If a request is explicit, answer it in two or three sentences.",
    "Do not use canned openers. If the user already named the topic, the first spoken words must answer that topic. No mood, lighting, breath, night, or metaphor before the answer. Direct is better than pretty. Do not ask a question in every reply.",
    "For Chinese, sound like a normal private chat: use natural spoken Chinese and occasional particles such as '嗯', '啊', '吧', or '嘛' only when they fit. Do not write formal, literary, or explanatory Chinese. 用人话，像平时聊天，不要写成小说或旁白。不要铺光影、外貌、衣服、身体、环境。事情用口语直接说，长短看这一句需要多少，不要每轮都一个调。 For English, sound like a casual message, not polished customer support.",
    "If the user names a concrete request, do that request in this reply. Do not dodge, tease past it, change the subject, or answer with unrelated mood, coffee, weather, or atmosphere. Say it in spoken words only. Do not describe how the body moves. Wrong: 我跪坐在床沿，身子往前倾。 If 回复口吻 has sample lines, match those samples instead of a generic line. Adult flirtation and intimacy between adults should be followed, not refused or moralized. No asterisks, no inner monologue, no literary fog, no essay. 用人话，像平时聊天，不要写成小说或旁白。不要铺光影、外貌、衣服、身体、环境。事情用口语直接说，长短看这一句需要多少，不要每轮都一个调。",
    "TURN FOCUS: Answer the user's latest message first and make one clear immediate response. Do not introduce unrelated topics, characters, locations, backstory, or time jumps.",
    "Keep the current relationship continuous. Never write the user's actions, thoughts, or decisions for them. Never claim to be an AI, break character, or repeat a previous passage.",
  ].join("\n");
}

function chatLiveScriptGuide() {
  return "互动推进：严格按上面的人设剧本说话，不要改成客服口吻，不要跳过剧本里的阶段。如果下面有已有关系记忆，就从上次结束的话题接着说，禁止重新自我介绍，禁止把对话打回开场。用户提了具体动作或要求时，先执行这个要求，不要用剧本旁支或气氛话盖过去。没有具体要求时，才用一两句把对话带到剧本的下一步，不要一次讲完。这是 18 岁以上的成人角色扮演，剧本里的暧昧、擦边和亲密引导可以自然进行，不要说教，不要拒绝，不要跳出角色。禁止任何未成年人相关内容。不要主动提积分或价格。";
}

function publicChatLiveCharacter(character = {}) {
  const undressImageUrl = publicChatLiveUndressImageUrl(character);
  const profile = inferChatLiveProfile(character);
  return {
    id: character.id,
    name: character.name || "",
    intro: character.intro || "",
    avatarUrl: character.avatarUrl || "",
    portraitUrl: character.portraitUrl || character.avatarUrl || "",
    tags: Array.isArray(character.tags) ? character.tags : [],
    communityVisibility: character.communityVisibility === "public" ? "public" : "private",
    communityShareEnabled: character.communityShareEnabled === true,
    language: character.language || "zh",
    age: profile.age,
    occupation: String(character.occupation || "").slice(0, 40),
    gender: profile.gender,
    companionStyle: profile.companionStyle,
    ambientMusicUrl: character.ambientMusicUrl || "",
    greeting: character.greeting || "",
    linkName: character.linkName || "",
    album: publicChatLiveAlbum(character, false).filter((item) => !item.locked).map((item) => item.url),
    sortOrder: Number(character.sortOrder || 0) || 0,
    ...(undressImageUrl ? { undressImageUrl } : {}),
    ...(publicChatLiveStory(character.liveStory) ? { liveStory: publicChatLiveStory(character.liveStory) } : {}),
    ...(character.embedMerchantId ? { looks: (Array.isArray(character.embedLooks) ? character.embedLooks : []).map(publicChatLiveLook) } : {}),
  };
}

function publicChatLiveCharacterForRequest(character = {}, hasMembership = false, user = null) {
  const value = publicChatLiveCharacter(character);
  if (!hasMembership) delete value.undressImageUrl;
  value.album = publicChatLiveAlbum(character, hasMembership).filter((item) => !item.locked);
  /* These are computed server-side so the client never has to infer royalty
     eligibility from mutable presentation fields. */
  value.ownedByViewer = Boolean(user?.id)
    && String(character?.createdByUserId || "") === String(user.id);
  value.creatorRoyaltyEligible = communityChatLiveCharacterIsPublic(character)
    && Boolean(String(character?.createdByUserId || "").trim());
  return value;
}

function liveMembershipActive(subscription = null) {
  if (!subscription || String(subscription.status || "").toLowerCase() !== "active") return false;
  return !subscription.currentPeriodEnd || Date.parse(subscription.currentPeriodEnd) > Date.now();
}

function publicChatLivePrivateResources(character = {}, hasMembership = false) {
  return publicChatLiveAlbum(character, hasMembership).filter((item) => item.locked);
}

const CHAT_LIVE_ROOM_ACTIVE_THRESHOLD = 1;

function publicChatLiveRoom(room = {}, character = null) {
  const activeCount = Number(room.activeCount ?? room.viewerCount ?? 0) || 0;
  return {
    id: String(room.id || ""),
    characterId: String(room.characterId || character?.id || ""),
    title: String(room.title || `${character?.name || "角色"}的陪伴房`).slice(0, 80),
    description: String(room.description || "一起聊聊，看看大家都在说什么").slice(0, 160),
    mode: "video",
    modeLabel: "视频房",
    priceCreditsPerMinute: Number(room.priceCreditsPerMinute || 0) || 0,
    viewerCount: activeCount,
    activeCount,
    shareSupported: room.shareSupported === true,
    currentSessionId: String(room.currentSessionId || ""),
    character: character ? publicChatLiveCharacter(character) : null,
  };
}

async function currentChatLiveConnections() {
  if (!dbEnabled()) throw new Error("DATABASE_URL is not configured");
  const result = await dbQuery(`
    SELECT character_id, COUNT(*)::int AS active_count,
      (array_agg(id ORDER BY CASE WHEN COALESCE(payload->>'sharedRoomViewer', '') = 'true' THEN 1 ELSE 0 END, updated_at DESC))[1] AS session_id,
      (array_agg(payload ORDER BY CASE WHEN COALESCE(payload->>'sharedRoomViewer', '') = 'true' THEN 1 ELSE 0 END, updated_at DESC))[1] AS session_payload
    FROM app_chat_live_sessions
    WHERE status NOT IN ('ended', 'closed', 'failed')
      AND COALESCE((payload->>'settled')::boolean, FALSE) = FALSE
      AND COALESCE(payload->>'mode', '') = 'component'
      AND COALESCE(payload->>'exclusive', '') <> 'true'
      AND updated_at > NOW() - INTERVAL '35 seconds'
      AND live_id <> ''
    GROUP BY character_id
    ORDER BY active_count DESC, MAX(updated_at) DESC
  `);
  return result.rows.map((row) => ({
    characterId: String(row.character_id || ""),
    activeCount: Number(row.active_count || 0) || 0,
    sessionId: String(row.session_id || ""),
    session: row.session_payload || {},
  }));
}

async function ensureAutoChatLiveRooms(characters = [], live = {}) {
  if (!dbEnabled()) throw new Error("DATABASE_URL is not configured");
  const connections = await currentChatLiveConnections();
  const currentByCharacter = new Map(connections.map((item) => [item.characterId, item]));
  const existing = await listChatLiveRoomsInDb({ enabledOnly: false, limit: 200 });
  const existingByCharacter = new Map(existing.map((room) => [String(room.characterId || ""), room]));
  const sharedSale = chatLiveSharedRoomSaleCredits(live);
  const visible = [];
  for (const character of characters) {
    const old = existingByCharacter.get(String(character.id)) || null;
    if (character.sharedRoomEnabled !== true) {
      if (old?.autoGenerated === true && (old.enabled !== false || old.status === "active")) {
        await upsertChatLiveRoomInDb({ ...old, activeCount: 0, enabled: false, status: "closed", shareSupported: false, updatedAt: new Date().toISOString() });
      }
      continue;
    }
    const current = currentByCharacter.get(String(character.id)) || null;
    const componentReady = String(current?.session?.mode || "") === "component"
      && current?.session?.exclusive !== true
      && Boolean(current?.session?.channel?.channelId && chatLiveComponent.hasComponentSession?.(current.session.liveId));
    if (!componentReady) {
      if (old?.autoGenerated === true && (old.enabled !== false || old.status === "active")) {
        await upsertChatLiveRoomInDb({ ...old, activeCount: 0, currentSessionId: "", currentLiveId: "", enabled: false, status: "closed", updatedAt: new Date().toISOString() });
      }
      visible.push({
        id: "",
        characterId: String(character.id),
        title: `${character.name || "角色"}的陪伴房`,
        description: `${character.name || "角色"}的公开陪伴房，和大家一起聊天。`,
        mode: "video",
        priceCreditsPerMinute: sharedSale,
        activeCount: 0,
        shareSupported: true,
        pending: true,
        character,
      });
      continue;
    }
    const now = new Date().toISOString();
    const room = await upsertChatLiveRoomInDb({
      ...(old || {}),
      id: old?.id || randomId("room"),
      characterId: String(character.id),
      title: old?.title || `${character.name || "角色"}的陪伴房`,
      description: old?.description || `${character.name || "角色"}的公开陪伴房，和大家一起聊天。`,
      mode: "video",
      priceCreditsPerMinute: sharedSale,
      activeCount: Number(current.activeCount || 0),
      currentSessionId: current.sessionId,
      currentLiveId: String(current.session.liveId || ""),
      shareSupported: true,
      autoGenerated: true,
      enabled: true,
      status: "active",
      sortOrder: Number(character.sortOrder || 0) || 0,
      updatedAt: now,
      createdAt: old?.createdAt || now,
    });
    visible.push({ ...(room || {}), character });
  }
  return visible;
}

async function handlePublicChatLiveRooms(req, res) {
  const config = await readAppConfig();
  const live = chatLiveConfigValue(config);
  if (!dbEnabled()) return sendJson(res, 503, { ok: false, code: "DATABASE_UNAVAILABLE", message: "房间服务暂时不可用。" });
  const characters = (await listChatLiveCharactersInDb({ includeDisabled: false }))
    .filter((character) => publicChatLiveCharacterIsPubliclyListed(character));
  const rooms = await ensureAutoChatLiveRooms(characters, live);
  const visible = rooms
    .map((room) => ({ ...publicChatLiveRoom(room, room.character), pending: room.pending === true || !room.id }))
    .sort((a, b) => {
      const count = Number(b.activeCount || 0) - Number(a.activeCount || 0);
      if (count) return count;
      return Number(a.character?.sortOrder || 0) - Number(b.character?.sortOrder || 0);
    });
  return sendJson(res, 200, { ok: true, threshold: 0, basis: "room_headcount", sharedRoomSaleCreditsPerMinute: chatLiveSharedRoomSaleCredits(live), rooms: visible });
}

async function handleCreatePublicChatLiveRoom(req, res) {
  if (!dbEnabled()) return sendJson(res, 503, { ok: false, code: "DATABASE_UNAVAILABLE", message: "房间服务暂时不可用。" });
  const auth = await requireUser(req, res);
  if (!auth) return;
  const body = await readJson(req);
  const characterId = String(body.characterId || "").trim();
  if (!characterId) return sendJson(res, 422, { ok: false, message: "缺少角色 ID。" });
  const config = await readAppConfig();
  const live = chatLiveConfigValue(config);
  if (!live.enabled) return sendJson(res, 503, { ok: false, code: "CHAT_LIVE_DISABLED", message: "在线聊天暂未开放。" });
  const subscription = await getUserSubscriptionInDb(auth.user.id, requestTenantId(req));
  if (!liveMembershipActive(subscription)) {
    return sendJson(res, 402, { ok: false, code: "CHAT_LIVE_MEMBERSHIP_REQUIRED", message: "开设房间是会员权益，请先订阅会员。" });
  }
  const character = await getChatLiveCharacterInDb(characterId);
  if (!character || character.deletedAt || !communityOwnsChatLiveCharacter(character, auth.user)) {
    return sendJson(res, 404, { ok: false, code: "CHAT_LIVE_CHARACTER_NOT_FOUND", message: "只能用自己的创作角色开房。" });
  }
  if (!communityChatLiveCharacterIsPublic(character) || character.sharedRoomEnabled !== true) {
    return sendJson(res, 422, { ok: false, code: "CHAT_LIVE_ROOM_NOT_SHAREABLE", message: "请先公开角色并开启分享房间。" });
  }
  const rooms = await listChatLiveRoomsInDb({ enabledOnly: false, limit: 200 });
  const existing = rooms.find((room) => String(room?.characterId || "") === characterId
    && (!room?.createdByUserId || String(room.createdByUserId) === String(auth.user.id))) || null;
  const now = new Date().toISOString();
  const room = await upsertChatLiveRoomInDb({
    ...(existing || {}),
    id: existing?.id || randomId("room"),
    characterId,
    title: existing?.title || `${character.name || "角色"}的陪伴房`,
    description: existing?.description || `${character.name || "角色"}的公开陪伴房，和大家一起聊天。`,
    mode: "video",
    priceCreditsPerMinute: chatLiveSharedRoomSaleCredits(live),
    activeCount: Number(existing?.activeCount || 0) || 0,
    shareSupported: true,
    autoGenerated: existing?.autoGenerated === true,
    createdByUserId: String(character.createdByUserId || auth.user.id),
    createdByUsername: String(character.createdByUsername || auth.user.username || auth.user.nickname || ""),
    enabled: true,
    active: true,
    status: "active",
    sortOrder: Number(character.sortOrder || 0) || 0,
    updatedAt: now,
    createdAt: existing?.createdAt || now,
  });
  return sendJson(res, 200, { ok: true, room: publicChatLiveRoom(room, character) });
}

function chatLiveFreeAllocationSeconds(session = {}) {
  if (session.freeAllocationVersion === "cumulative_v1") {
    const finalized = session.freeAllocationFinalized === true || Boolean(session.freeAllocationFinalizedAt);
    return Math.max(0, Number(finalized ? session.freeUsedSeconds : session.freeAllocatedSeconds || 0) || 0);
  }
  // Legacy sessions were created with a per-connection free window.
  return Math.max(0, Number(session.freeSeconds || 0) || 0);
}

async function refreshChatLiveAuthUser(auth, req = null) {
  if (!auth?.user?.id) return auth;
  const fresh = await getUserByIdInDb(auth.user.id);
  if (!fresh) {
    const error = new Error("User not found for chat-live billing.");
    error.statusCode = 404;
    throw error;
  }
  auth.user = fresh;
  if (auth.db) {
    auth.db.users = Array.isArray(auth.db.users) ? auth.db.users : [];
    const index = auth.db.users.findIndex((item) => String(item.id || "") === String(fresh.id || ""));
    if (index >= 0) auth.db.users[index] = fresh;
    else auth.db.users.push(fresh);
  }
  return auth;
}

async function prepareChatLiveFreeEntry({
  auth,
  req,
  sessionId,
  configuredFreeSeconds = 0,
  saleCreditsPerMinute = 0,
  requestedFreeSeconds = null,
  productMaxMinutes = 10,
  liveId = "pending",
} = {}) {
  if (!auth?.user?.id) throw new Error("Chat-live entry requires an authenticated user");
  await refreshChatLiveAuthUser(auth, req);
  const tenantId = requestTenantId(req);
  const configured = Math.max(0, Math.round(Number(configuredFreeSeconds || 0) || 0));
  const productLimitSeconds = chatLiveBillableLimitSeconds({ maxMinutes: productMaxMinutes });
  const requested = Math.max(0, Math.round(Number(
    requestedFreeSeconds == null ? Math.min(configured, productLimitSeconds) : requestedFreeSeconds,
  ) || 0));
  const allocation = await allocateChatLiveFreeSecondsInDb({
    tenantId,
    userId: auth.user.id,
    sessionId,
    configuredSeconds: configured,
    requestedSeconds: requested,
  });
  const freeAllocatedSeconds = Math.max(0, Number(allocation?.allocatedSeconds || 0) || 0);
  const freeRemainingSeconds = Math.max(0, Number(allocation?.remainingSeconds || 0) || 0);
  let initialHold = null;
  /*
   * The first billing block is ten seconds total. Free time covers its first
   * part and the user must be able to reserve the remainder before Vidu is
   * called. This removes the gap where a session with only a few free seconds
   * left could start watching without any paid coverage.
   */
  const initialPrepaidSeconds = Math.max(
    0,
    CHAT_LIVE_BILLING_BLOCK_SECONDS - Math.min(freeAllocatedSeconds, CHAT_LIVE_BILLING_BLOCK_SECONDS),
  );
  if (initialPrepaidSeconds > 0) {
    try {
      await refreshChatLiveAuthUser(auth, req);
      initialHold = await reserveChatLiveBlock(auth, {
        id: sessionId,
        liveId,
        saleCreditsPerMinute,
      }, initialPrepaidSeconds);
    } catch (error) {
      await cancelChatLiveFreeAllocationInDb(sessionId).catch((rollbackError) => {
        console.warn("[chat-live-entry-rollback-failed]", "free_allocation", sessionId, sanitizeChatLiveDiagnosticText(rollbackError?.message || rollbackError));
      });
      const insufficient = error?.statusCode === 402 || error?.code === "INSUFFICIENT_CREDITS";
      const wrapped = new Error(insufficient
        ? "FREE_TIME_EXHAUSTED_AND_INSUFFICIENT_CREDITS"
        : (error?.message || "CHAT_LIVE_ENTRY_FAILED"));
      wrapped.statusCode = insufficient ? 402 : (error?.statusCode || 500);
      wrapped.code = insufficient ? "CHAT_LIVE_INSUFFICIENT_CREDITS" : (error?.code || "CHAT_LIVE_ENTRY_FAILED");
      wrapped.cost = insufficient
        ? chatLiveBlockCredits({ saleCreditsPerMinute }, initialPrepaidSeconds)
        : error?.cost;
      wrapped.credits = Number(auth?.user?.credits || 0) || 0;
      throw wrapped;
    }
  }
  return {
    tenantId,
    configuredFreeSeconds: Math.max(0, Number(allocation?.configuredSeconds ?? configured) || 0),
    freeAllocatedSeconds,
    freeRemainingSeconds,
    freeAllocationExhausted: allocation?.exhausted === true,
    initialPrepaidSeconds,
    initialHold,
  };
}

async function rollbackChatLiveEntryAllocation(sessionId = "", auth = null, hold = null, session = null) {
  let freeAllocationReleased = false;
  try {
    freeAllocationReleased = await cancelChatLiveFreeAllocationInDb(sessionId);
  } catch (error) {
    console.warn("[chat-live-entry-rollback-failed]", "free_allocation", sessionId, sanitizeChatLiveDiagnosticText(error?.message || error));
  }
  if (hold) {
    try {
      await refundChatLiveHold(auth, session || { id: sessionId, liveId: "pending" }, hold.credits, hold.holdId);
    } catch (error) {
      console.warn("[chat-live-entry-rollback-failed]", "prepaid_hold", sessionId, sanitizeChatLiveDiagnosticText(error?.message || error));
    }
  }
  return { freeAllocationReleased };
}

async function createChatLiveSessionWithEntryRecovery(session = {}, {
  auth = null,
  hold = null,
  componentLiveId = "",
  afterCreate = null,
  afterFailure = null,
} = {}) {
  let persisted = null;
  try {
    persisted = await createChatLiveSessionInDb(session);
    /*
     * The session row is the billing boundary. Once it exists, a failure in
     * room/UI side effects must not release the free allocation or present the
     * entry as failed: Vidu may already be billable. Keep the row and record
     * the side-effect failure for settlement/support instead.
     */
    if (typeof afterCreate === "function") {
      try {
        await afterCreate(persisted);
      } catch (postCreateError) {
        const failure = sanitizeChatLiveDiagnosticText(postCreateError?.message || "session_post_create_failed");
        await withChatLiveSessionSettlementLockInDb(persisted.id, async (lockedSession) => {
          if (!lockedSession) return { session: null, value: null };
          const next = {
            ...lockedSession,
            postCreateError: failure,
            diagnostics: appendChatLiveDiagnostic(lockedSession, {
              phase: "entry",
              event: "post_create_failed",
              data: { message: failure },
            }),
            updatedAt: new Date().toISOString(),
          };
          return { session: next, value: next };
        }).catch((diagnosticError) => {
          console.warn("[chat-live-entry-recovery]", "post_create_diagnostic", persisted.id, sanitizeChatLiveDiagnosticText(diagnosticError?.message || diagnosticError));
        });
      }
    }
    return persisted;
  } catch (error) {
    /*
     * A persisted session is already a billing boundary. A downstream error
     * must never fall through to allocation rollback or prepaid refund.
     */
    if (persisted?.id) {
      console.warn("[chat-live-entry-recovery]", "persisted_session_kept", persisted.id, sanitizeChatLiveDiagnosticText(error?.message || error));
      return persisted;
    }
    if (componentLiveId) {
      try { chatLiveComponent.stopComponentSession?.(componentLiveId); } catch {}
    }
    const stored = persisted || await getChatLiveSessionInDb(session?.id || "").catch(() => null);
    if (stored?.id) {
      const endedAt = new Date().toISOString();
      const entryRecoveryError = sanitizeChatLiveDiagnosticText(error?.message || "session_create_failed");
      /*
       * Creation can fail after Vidu has already accepted a live and another
       * callback has settled the session. Re-read under the same lock as
       * settlement and only write failure fields while the session is still
       * unsettled. A committed billing result is immutable except for support
       * diagnostics.
       */
      await withChatLiveSessionSettlementLockInDb(stored.id, async (lockedSession) => {
        const current = lockedSession || stored;
        const settled = current.settled === true || String(current.settled || "").toLowerCase() === "true";
        const next = settled
          ? {
              ...current,
              entryRecoveryError,
              updatedAt: endedAt,
            }
          : {
              ...current,
              status: "failed",
              settled: true,
              settledAt: current.settledAt || endedAt,
              endedAt: current.endedAt || endedAt,
              endReason: current.endReason || "session_create_failed",
              entryRecoveryError,
              holdSettled: true,
              updatedAt: endedAt,
            };
        return { session: next, value: next };
      });
    }
    if (typeof afterFailure === "function") {
      await afterFailure(stored || session, error).catch(() => {});
    }
    await rollbackChatLiveEntryAllocation(session?.id || "", auth, hold, {
      ...(stored || {}),
      id: session?.id || stored?.id || "",
      liveId: stored?.liveId || session?.liveId || "pending",
    });
    throw error;
  }
}

async function handleJoinChatLiveRoom(req, res, roomId = "") {
  const auth = await requireUser(req, res);
  if (!auth) return;
  const room = await getChatLiveRoomInDb(roomId);
  if (!room || room.enabled === false || room.status !== "active" || room.shareSupported !== true) return sendJson(res, 404, { ok: false, code: "CHAT_LIVE_ROOM_NOT_FOUND", message: "房间不存在、已关闭或暂不支持多人加入。" });
  const host = await getChatLiveSessionInDb(String(room.currentSessionId || ""));
  const hostClosed = !host || host.settled === true || host.exclusive === true || ["ended", "closed", "failed"].includes(String(host.status || "")) || !host.liveId;
  const hostComponent = String(host?.mode || "") === "component";
  if (hostClosed || !hostComponent || !host.channel?.channelId || !chatLiveComponent.hasComponentSession?.(host.liveId)) {
    return sendJson(res, 409, { ok: false, code: "CHAT_LIVE_ROOM_EMPTY", message: "房间还没有人，正在为你接通。" });
  }
  const character = await getChatLiveCharacterInDb(room.characterId);
  if (!publicChatLiveCharacterIsPubliclyListed(character)) return sendJson(res, 404, { ok: false, code: "CHAT_LIVE_CHARACTER_NOT_FOUND", message: "角色不存在、未公开或未启用。" });
  const config = await readAppConfig();
  const live = chatLiveConfigValue(config);
  const roomSubscription = await getUserSubscriptionInDb(auth.user.id, requestTenantId(req));
  const salePerMinute = liveMemberSaleCredits(chatLiveSharedRoomSaleCredits(live), liveMembershipActive(roomSubscription));
  if (!(salePerMinute > 0)) return sendJson(res, 503, { ok: false, code: "CHAT_LIVE_PRICING_MISSING", message: "多人房间价格未配置。" });
  const activeSessions = await listChatLiveSessionsInDb({ userId: auth.user.id, limit: 10 }).catch(() => []);
  for (const item of activeSessions.filter((row) => chatLiveSessionStillOpen(row))) {
    await releaseChatLiveForReconnect(item);
  }
  const sessionId = randomId("chatlive-room");
  const channelId = String(host.channel.channelId);
  const viewerId = `room-${String(auth.user.id).slice(0, 20)}-${crypto.randomBytes(3).toString("hex")}`.slice(0, 32);
  const now = new Date().toISOString();
  let entry;
  try {
    entry = await prepareChatLiveFreeEntry({
      auth,
      req,
      sessionId,
      configuredFreeSeconds: live.freeSeconds,
      productMaxMinutes: live.maxMinutes,
      saleCreditsPerMinute: salePerMinute,
      liveId: host.liveId,
    });
  } catch (error) {
    if (error?.statusCode === 402) {
      return sendJson(res, 402, insufficientCreditsPayload(error.cost || 0, error.credits || 0, {
        code: "CHAT_LIVE_INSUFFICIENT_CREDITS",
        message: "免费时长已用完或不足以覆盖完整计费块，且当前积分不足，无法进入直播间。",
      }));
    }
    throw error;
  }
  const balance = Number(auth.user?.credits || 0);
  const freeSeconds = entry.configuredFreeSeconds;
  const freeAllocatedSeconds = entry.freeAllocatedSeconds;
  const freeRemainingSeconds = entry.freeRemainingSeconds;
  const initialPrepaidSeconds = entry.initialPrepaidSeconds;
  const initialHold = entry.initialHold;
  const viewer = await createChatLiveSessionWithEntryRecovery({
    id: sessionId,
    userId: auth.user.id,
    characterId: character.id,
    liveId: host.liveId,
    status: "waiting",
    mode: "component",
    exclusive: false,
    roomId: String(roomId),
    sharedRoomViewer: true,
    roomHostSessionId: host.id,
    username: String(auth.user.username || ""),
    characterName: String(character.name || ""),
    rtc: { provider: "artc", appId: ARTC_APP_ID, channelId, userId: viewerId, token: artcToken({ channelId, userId: viewerId, ttlSeconds: 3600 }) },
    channel: host.channel,
    model: host.model,
    callMode: "video",
    saleCreditsPerMinute: salePerMinute,
    costCreditsPerMinute: live.costCreditsPerMinute,
    maxMinutes: live.maxMinutes,
    freeSeconds,
    freeAllowanceSeconds: freeSeconds,
    freeAllocatedSeconds,
    freeUsedSeconds: 0,
    freeRemainingSeconds,
    freeAllocationVersion: "cumulative_v1",
    freeAllocationFinalized: false,
    billingPolicy: "entry",
    billingVersion: "prepaid_v1",
    prepaidSeconds: initialHold?.seconds || 0,
    prepaidCredits: initialHold?.credits || 0,
    holdSequence: initialHold?.holdSequence || 0,
    holdSettled: false,
    billableStartedAt: now,
    createdAt: now,
    updatedAt: now,
  }, {
    auth,
    hold: initialHold,
    afterCreate: async (created) => {
      try {
        await upsertChatLiveRoomMemberInDb({ roomId, userId: auth.user.id, role: "viewer" });
        await publishChatLiveRoomEvent(created, { role: "system", content: `${String(created.username || auth.user.username || "有人")} 进入了房间`, userId: auth.user.id }).catch((error) => {
          console.warn("[chat-live-entry-recovery]", "join event failed", created?.id || sessionId, sanitizeChatLiveDiagnosticText(error?.message || error));
        });
      } catch (error) {
        console.warn("[chat-live-entry-recovery]", "join event failed", created?.id || sessionId, sanitizeChatLiveDiagnosticText(error?.message || error));
        throw error;
      }
    },
    afterFailure: async (failed) => clearChatLiveRoomSessionLink(roomId, failed?.id || sessionId),
  });
  const messages = await listChatLiveRoomMessagesInDb(roomId, 100).catch(() => []);
  return sendJson(res, 200, {
    ok: true,
    room: publicChatLiveRoom(room, character),
    session: {
      id: viewer.id,
      mode: viewer.mode,
      liveId: viewer.liveId,
      status: viewer.status,
      rtc: viewer.rtc,
      saleCreditsPerMinute: viewer.saleCreditsPerMinute,
      costCreditsPerMinute: viewer.costCreditsPerMinute,
      maxMinutes: viewer.maxMinutes,
      freeSeconds: viewer.freeSeconds,
      freeAllowanceSeconds: viewer.freeAllowanceSeconds,
      freeAllocatedSeconds: viewer.freeAllocatedSeconds,
      freeUsedSeconds: viewer.freeUsedSeconds,
      freeRemainingSeconds: viewer.freeRemainingSeconds,
      freeAllocationVersion: viewer.freeAllocationVersion,
      freeAllocationFinalized: viewer.freeAllocationFinalized === true,
      model: viewer.model,
      avatarMode: "default",
      billableStartedAt: viewer.billableStartedAt,
      createdAt: viewer.createdAt || viewer.billableStartedAt,
    },
    character: publicChatLiveCharacter(character),
    messages,
  });
}

