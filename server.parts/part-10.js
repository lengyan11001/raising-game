function characterUnlockedByRecord(db = {}, userId = "", itemId = "") {
  if (!userId || !itemId) return false;
  return (db.userUnlocks || []).some((record) => (
    !isSoftDeleted(record)
    && record.userId === userId
    && record.itemId === itemId
    && (record.unlockType === "character_bundle" || record.sceneId === "__character__")
  ));
}

function publicCharacterSceneVideo(entry = {}, { playable = false, locked = true, price = CHARACTER_UNLOCK_COST_CREDITS } = {}) {
  const video = publicSceneVideo(entry) || publicUnlockVideo(entry, entry.sceneId || "");
  if (!video) return null;
  const posterUrl = String(video.cdnPosterUrl || video.posterUrl || video.localPosterUrl || video.coverUrl || video.thumbnailUrl || entry.cdnPosterUrl || entry.posterUrl || entry.localPosterUrl || entry.coverUrl || entry.thumbnailUrl || "").trim();
  return {
    ...video,
    posterUrl,
    localPosterUrl: String(video.localPosterUrl || entry.localPosterUrl || posterUrl || "").trim(),
    coverUrl: String(video.coverUrl || entry.coverUrl || posterUrl || "").trim(),
    thumbnailUrl: String(video.thumbnailUrl || entry.thumbnailUrl || posterUrl || "").trim(),
    videoUrl: playable ? String(DISABLE_GENERATED_R2_STORAGE
      ? (entry.remoteVideoUrl || entry.videoUrl || entry.cdnVideoUrl || entry.localVideoUrl || "")
      : (entry.cdnVideoUrl || entry.videoUrl || entry.localVideoUrl || entry.remoteVideoUrl || "")).trim() : "",
    locked: Boolean(locked),
    price,
  };
}

function characterVideoPublicUrl(entry = {}, item = {}, auth = null, videoKey = "") {
  if (!auth?.user || !item?.id || !entry?.sceneId) return "";
  return secureUnlockVideoUrl({
    userId: auth.user.id,
    itemId: item.id,
    sceneId: entry.sceneId,
    sceneEntryId: entry.sceneEntryId || "default",
    videoKey: videoKey || makeSceneVideoKey(entry.sceneId, entry.sceneEntryId || "default"),
  });
}

function publicCharacterVideoMaps(item = {}, auth = null) {
  const videos = publicCharacterVideoList(item);
  const loggedIn = Boolean(auth?.user);
  const member = loggedIn && userHasCreatorMembership(auth.user);
  const bundleUnlocked = characterUnlockedByRecord(auth?.db || {}, auth?.user?.id || "", item.id || "");
  const homeSceneVideos = {};
  const unlockVideos = {};
  videos.forEach(({ key, entry }, index) => {
    const singleUnlocked = loggedIn && !bundleUnlocked && Boolean(findUserUnlock(auth?.db || {}, auth?.user?.id || "", item.id || "", entry.sceneId || "", entry.sceneEntryId || "default"));
    const playable = loggedIn && (member || bundleUnlocked || singleUnlocked);
    const locked = !playable;
    const publicVideo = publicCharacterSceneVideo(entry, {
      playable,
      locked,
      price: CHARACTER_UNLOCK_COST_CREDITS,
    });
    if (!publicVideo) return;
    const outKey = key || makeSceneVideoKey(publicVideo.sceneId, publicVideo.sceneEntryId || "default");
    if (playable) publicVideo.videoUrl = characterVideoPublicUrl(entry, item, auth, outKey);
    if (index === 0) homeSceneVideos[outKey] = publicVideo;
    else unlockVideos[outKey] = publicVideo;
  });
  return { homeSceneVideos, sceneVideos: {}, unlockVideos, unlocked: member || bundleUnlocked, membershipRequired: !member };
}

function publicHomeVideoItem(item, auth = null) {
  const hasSynth = Boolean(item.syntheticReferenceLocalUrl || item.syntheticReferenceUrl);
  const hasAsset = Boolean(item.referenceAssetUri);
  const characterVideos = publicCharacterVideoMaps(item, auth);
  const characterImageUrl = item.publicImageUrl || item.cdnImageUrl || item.cdnPosterUrl || item.sourceImageUrl || item.localImageUrl || item.syntheticReferenceLocalUrl || item.imageUrl || "";
  const posterUrl = item.cdnPosterUrl || item.cdnImageUrl || item.publicImageUrl || item.posterUrl || characterImageUrl || item.coverUrl || "";
  let referenceState = "missing";
  if (hasSynth && hasAsset) referenceState = "ready";
  else if (hasSynth) referenceState = "asset_pending";
  else if (item.status === "reference_failed") referenceState = "failed";
  else if (item.status === "image_uploaded") referenceState = "synth_pending";
  return {
    id: item.id || "",
    name: item.name || "Featured",
    title: item.title || "Featured drama",
    posterUrl,
    localImageUrl: item.localImageUrl || "",
    characterImageUrl,
    referenceImageUrl: characterImageUrl,
    syntheticReferenceLocalUrl: item.syntheticReferenceLocalUrl || "",
    sourceImageUrl: item.publicImageUrl || item.cdnImageUrl || item.sourceImageUrl || "",
    publicImageUrl: item.publicImageUrl || "",
    cdnImageUrl: item.cdnImageUrl || "",
    cdnPosterUrl: item.cdnPosterUrl || "",
    coverUrl: item.coverUrl || "",
    thumbnailUrl: item.thumbnailUrl || "",
    thumbUrl: item.thumbUrl || "",
    listPosterUrl: item.listPosterUrl || "",
    cardPosterUrl: item.cardPosterUrl || "",
    posterThumbUrl: item.posterThumbUrl || "",
    videoUrl: "",
    localVideoUrl: "",
    remoteVideoUrl: "",
    taskId: item.taskId || "",
    status: item.status || "",
    provider: item.provider || "",
    resolution: item.resolution || "",
    duration: item.duration || 0,
    source: item.source || "",
    sourceDisplayId: item.sourceDisplayId || "",
    description: item.description || "",
    age: item.age || 0,
    gender: item.gender || "",
    style: item.style || "",
    model: item.model || "",
    tags: Array.isArray(item.tags) ? item.tags : [],
    likeCount: Number(item.likeCount || 0),
    estimatedMessageCount: Number(item.estimatedMessageCount || 0),
    creatorUsername: item.creatorUsername || "",
    creatorAvatarUrl: item.creatorAvatarUrl || "",
    videoCount: Number(item.videoCount || Object.keys(characterVideos.homeSceneVideos).length + Object.keys(characterVideos.unlockVideos).length),
    referenceAssetUri: item.referenceAssetUri || "",
    referenceState,
    deletedAt: item.deletedAt || "",
    createdAt: item.createdAt || "",
    homeSceneVideos: characterVideos.homeSceneVideos,
    sceneVideos: characterVideos.sceneVideos,
    unlockVideos: characterVideos.unlockVideos,
    unlocked: characterVideos.unlocked,
    membershipRequired: characterVideos.membershipRequired,
    unlockCost: CHARACTER_UNLOCK_COST_CREDITS,
  };
}

function publicGameCharacterVideoMaps(item = {}, auth = null) {
  const videos = publicCharacterVideoList(item);
  const loggedIn = Boolean(auth?.user);
  const bundleUnlocked = characterUnlockedByRecord(auth?.db || {}, auth?.user?.id || "", item.id || "");
  const homeSceneVideos = {};
  const unlockVideos = {};
  videos.forEach(({ key, entry }, index) => {
    const singleUnlocked = loggedIn && !bundleUnlocked && Boolean(findUserUnlock(auth?.db || {}, auth?.user?.id || "", item.id || "", entry.sceneId || "", entry.sceneEntryId || "default"));
    const firstPlayable = index === 0;
    const playable = firstPlayable || (loggedIn && (bundleUnlocked || singleUnlocked));
    const publicVideo = publicCharacterSceneVideo(entry, {
      playable,
      locked: !playable,
      price: CHARACTER_UNLOCK_COST_CREDITS,
    });
    if (!publicVideo) return;
    const outKey = key || makeSceneVideoKey(publicVideo.sceneId, publicVideo.sceneEntryId || "default");
    if (firstPlayable) {
      publicVideo.videoUrl = publicGameVideoUrl({
        itemId: item.id,
        sceneId: entry.sceneId,
        sceneEntryId: entry.sceneEntryId || "default",
        videoKey: outKey,
      });
      publicVideo.locked = false;
    } else if (playable) {
      publicVideo.videoUrl = characterVideoPublicUrl(entry, item, auth, outKey);
    }
    if (index === 0) homeSceneVideos[outKey] = publicVideo;
    else unlockVideos[outKey] = publicVideo;
  });
  return { homeSceneVideos, sceneVideos: {}, unlockVideos, unlocked: bundleUnlocked };
}

function publicGameHomeVideoItem(item, auth = null) {
  const base = publicHomeVideoItem(item, auth);
  const characterVideos = publicGameCharacterVideoMaps(item, auth);
  return {
    ...base,
    homeSceneVideos: characterVideos.homeSceneVideos,
    sceneVideos: characterVideos.sceneVideos,
    unlockVideos: characterVideos.unlockVideos,
    unlocked: characterVideos.unlocked,
    videoCount: Number(item.videoCount || Object.keys(characterVideos.homeSceneVideos).length + Object.keys(characterVideos.unlockVideos).length),
  };
}

function normalizeHomeVideo(homeVideo = {}) {
  const items = Array.isArray(homeVideo.items) ? homeVideo.items.filter(Boolean) : [];
  const normalized = items
    .filter((item) => !isSoftDeleted(item))
    .map((item) => ({
      ...item,
      homeSceneVideos: normalizeHomeSceneVideosForItem(item),
      sceneVideos: item.sceneVideos && typeof item.sceneVideos === "object" ? item.sceneVideos : {},
      unlockVideos: item.unlockVideos && typeof item.unlockVideos === "object" ? item.unlockVideos : {},
    }));
  const activeItemId = homeVideo.activeItemId || normalized[0]?.id || "";
  const active = normalized.find((item) => item.id === activeItemId) || normalized[0] || {};
  return {
    ...homeVideo,
    activeItemId: active.id || activeItemId,
    items: normalized,
    posterUrl: active.cdnPosterUrl || active.cdnImageUrl || active.publicImageUrl || active.posterUrl || active.localImageUrl || homeVideo.posterUrl || "",
    localImageUrl: active.localImageUrl || active.posterUrl || homeVideo.localImageUrl || "",
    imageMime: active.imageMime || homeVideo.imageMime || "",
    publicImageUrl: active.publicImageUrl || active.cdnImageUrl || homeVideo.publicImageUrl || "",
    cdnImageUrl: active.cdnImageUrl || homeVideo.cdnImageUrl || "",
    cdnPosterUrl: active.cdnPosterUrl || homeVideo.cdnPosterUrl || "",
    referenceAssetUri: active.referenceAssetUri || homeVideo.referenceAssetUri || "",
    videoUrl: active.cdnVideoUrl || active.videoUrl || active.localVideoUrl || homeVideo.videoUrl || "",
    localVideoUrl: active.localVideoUrl || active.videoUrl || homeVideo.localVideoUrl || "",
    remoteVideoUrl: active.remoteVideoUrl || homeVideo.remoteVideoUrl || "",
    cdnVideoUrl: active.cdnVideoUrl || homeVideo.cdnVideoUrl || "",
    localVideoPath: active.localVideoPath || homeVideo.localVideoPath || "",
    taskId: active.taskId || homeVideo.taskId || "",
    status: active.status || homeVideo.status || "",
  };
}

function normalizeHomeSceneVideosForItem(item = {}) {
  const homeSceneVideos =
    item.homeSceneVideos && typeof item.homeSceneVideos === "object"
      ? { ...item.homeSceneVideos }
      : {};
  if (!Object.keys(homeSceneVideos).length && !homeSceneVideos.room) {
    const videoUrl = String(item.videoUrl || item.localVideoUrl || item.remoteVideoUrl || "").trim();
    const taskId = String(item.taskId || "").trim();
    if (videoUrl || taskId) {
      homeSceneVideos.room = {
        sceneId: "room",
        sceneName: "Suite Night",
        posterUrl: item.posterUrl || item.localImageUrl || "",
        prompt: item.prompt || "",
        finalPrompt: item.finalPrompt || item.prompt || "",
        referenceAssetUri: item.referenceAssetUri || "",
        model: item.model || MODEL_QUALITY,
        ratio: item.ratio || DEFAULT_CONFIG.video.ratio,
        resolution: item.resolution || DEFAULT_CONFIG.video.resolution,
        duration: item.duration || DEFAULT_CONFIG.video.duration,
        provider: item.provider || "seedance",
        taskId,
        status: item.status || "",
        videoUrl,
        localVideoUrl: item.localVideoUrl || "",
        localVideoPath: item.localVideoPath || "",
        remoteVideoUrl: item.remoteVideoUrl || "",
        createdAt: item.createdAt || "",
        updatedAt: item.updatedAt || item.createdAt || "",
        error: item.error || "",
        source: "legacy-home-video",
      };
    }
  }
  return homeSceneVideos;
}

function syncHomeVideoActiveFields(homeVideo = {}) {
  const normalized = normalizeHomeVideo(homeVideo);
  return normalized;
}

function findHomeVideoItem(homeVideo = {}, itemId = "") {
  const normalized = normalizeHomeVideo(homeVideo);
  if (itemId) return normalized.items.find((item) => item.id === itemId) || null;
  return normalized.items.find((item) => item.id === normalized.activeItemId) || normalized.items[0];
}

function normalizeUnlockVideo(entry = {}, videoKey = "") {
  if (!entry || typeof entry !== "object") return null;
  const sceneId = String(entry.sceneId || sceneIdFromVideoKey(videoKey) || "").trim();
  const videoUrl = String(entry.cdnVideoUrl || entry.videoUrl || entry.localVideoUrl || entry.remoteVideoUrl || "").trim();
  const taskId = String(entry.taskId || "").trim();
  if (!sceneId || (!videoUrl && !taskId)) return null;
  return {
    ...entry,
    sceneId,
    sceneName: entry.sceneName || "",
    sceneEntryId: entry.sceneEntryId || "default",
    sceneEntryName: entry.sceneEntryName || "",
    title: String(entry.title || entry.sceneEntryName || entry.sceneName || "Unlocked video").trim(),
    price: clampNumber(entry.price, DEFAULT_CONFIG.prices.unlockVideo, 0, 9999),
    videoUrl,
    cdnVideoUrl: entry.cdnVideoUrl || "",
    localVideoUrl: entry.localVideoUrl || "",
    remoteVideoUrl: entry.remoteVideoUrl || "",
    taskId,
    status: entry.status || "",
  };
}

function publicUnlockVideo(entry = {}, videoKey = "") {
  const normalized = normalizeUnlockVideo(entry, videoKey);
  if (!normalized) return null;
  const posterUrl = String(normalized.cdnPosterUrl || normalized.posterUrl || normalized.localPosterUrl || normalized.coverUrl || normalized.thumbnailUrl || "").trim();
  return {
    sceneId: normalized.sceneId,
    sceneName: normalized.sceneName || "",
    sceneEntryId: normalized.sceneEntryId || "default",
    sceneEntryName: normalized.sceneEntryName || "",
    title: normalized.title || "Unlocked video",
    posterUrl,
    cdnPosterUrl: normalized.cdnPosterUrl || "",
    localPosterUrl: normalized.localPosterUrl || posterUrl || "",
    coverUrl: normalized.coverUrl || posterUrl || "",
    thumbnailUrl: normalized.thumbnailUrl || posterUrl || "",
    videoUrl: "",
    taskId: normalized.taskId || "",
    status: normalized.status || "",
    price: normalized.price,
    provider: normalized.provider || "seedance",
    updatedAt: normalized.updatedAt || "",
    createdAt: normalized.createdAt || "",
    error: normalized.error || "",
  };
}

function publicUnlockVideoMap(unlockVideos = {}) {
  if (!unlockVideos || typeof unlockVideos !== "object") return {};
  const out = {};
  Object.keys(unlockVideos).forEach((videoKey) => {
    const entry = publicUnlockVideo(unlockVideos[videoKey], videoKey);
    if (entry) out[videoKey] = entry;
  });
  Object.keys(out).forEach((videoKey) => {
    const entry = out[videoKey];
    if (entry.sceneEntryId === "default" && entry.sceneId && !out[entry.sceneId]) {
      out[entry.sceneId] = entry;
    }
  });
  return out;
}

function findUnlockVideoForItem(item = {}, sceneId = "", sceneEntryId = "") {
  const videos = item.unlockVideos && typeof item.unlockVideos === "object" ? item.unlockVideos : {};
  const requestedScene = String(sceneId || "").trim();
  const requestedEntry = String(sceneEntryId || "").trim();
  const exactKey = requestedEntry ? makeSceneVideoKey(requestedScene, requestedEntry) : requestedScene;
  const candidates = [
    exactKey,
    requestedScene,
    ...Object.keys(videos),
  ].filter(Boolean);
  for (const key of candidates) {
    const raw = videos[key];
    const entry = normalizeUnlockVideo(raw, key);
    if (!entry || entry.sceneId !== requestedScene) continue;
    if (requestedEntry && entry.sceneEntryId !== requestedEntry) continue;
    return { key, entry };
  }
  return null;
}

function findCharacterVideoForItem(item = {}, sceneId = "", sceneEntryId = "") {
  const requestedScene = String(sceneId || "").trim();
  const requestedEntry = String(sceneEntryId || "default").trim() || "default";
  return publicCharacterVideoList(item).find(({ entry }) => (
    String(entry.sceneId || "") === requestedScene
    && String(entry.sceneEntryId || "default") === requestedEntry
  )) || null;
}

function makeUnlockRecordKey(itemId, sceneId, sceneEntryId = "default") {
  return [itemId, sceneId, sceneEntryId || "default"].map((part) => String(part || "").trim()).join("::");
}

function characterBundleUnlockRecord(item = {}, userId = "") {
  if (!item?.id || !userId) return null;
  return {
    id: randomId("unlock"),
    userId,
    itemId: item.id,
    itemName: item.name || "",
    sceneId: "__character__",
    sceneName: "Character videos",
    sceneEntryId: "bundle",
    sceneEntryName: "Character bundle",
    videoKey: "__character__",
    unlockType: "character_bundle",
    cost: CHARACTER_UNLOCK_COST_CREDITS,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    deletedAt: "",
  };
}

function isCharacterBundleUnlock(record = {}) {
  return record.unlockType === "character_bundle" || record.sceneId === "__character__";
}

function publicUserUnlock(record = {}) {
  return {
    id: record.id || "",
    itemId: record.itemId || "",
    itemName: record.itemName || "",
    sceneId: record.sceneId || "",
    sceneName: record.sceneName || "",
    sceneEntryId: record.sceneEntryId || "default",
    sceneEntryName: record.sceneEntryName || "",
    videoKey: record.videoKey || "",
    unlockType: record.unlockType || "",
    cost: Number(record.cost || 0),
    createdAt: record.createdAt || "",
  };
}

function findUserCharacterUnlock(db, userId, itemId) {
  return (db.userUnlocks || []).find((record) => (
    !isSoftDeleted(record)
    && record.userId === userId
    && record.itemId === itemId
    && isCharacterBundleUnlock(record)
  )) || null;
}

function findUserUnlock(db, userId, itemId, sceneId, sceneEntryId = "default") {
  const bundle = findUserCharacterUnlock(db, userId, itemId);
  if (bundle) return bundle;
  const key = makeUnlockRecordKey(itemId, sceneId, sceneEntryId);
  return (db.userUnlocks || []).find((record) => {
    if (isSoftDeleted(record)) return false;
    if (record.userId !== userId) return false;
    const recordKey = makeUnlockRecordKey(record.itemId, record.sceneId, record.sceneEntryId || "default");
    return recordKey === key;
  }) || null;
}

const UNLOCK_STREAM_TTL_MS = 6 * 60 * 60 * 1000;

const EMBED_LIVE_TICKET_TTL_MS = 10 * 60 * 1000;
const EMBED_LIVE_BROWSER_TTL_MS = 6 * 60 * 60 * 1000;
const embedLiveUsedTickets = new Map();

function signEmbedLivePayload(encodedPayload) {
  return crypto.createHmac("sha256", unlockStreamSecret()).update(`embed-live:${encodedPayload}`).digest("base64url");
}

function makeEmbedLiveToken(prefix, payload) {
  const encoded = base64UrlJson(payload);
  return `${prefix}.${encoded}.${signEmbedLivePayload(encoded)}`;
}

function readEmbedLiveToken(token = "", prefix = "") {
  const parts = String(token || "").split(".");
  if (parts.length !== 3 || parts[0] !== prefix) return null;
  const encoded = parts[1];
  const signature = parts[2];
  const expected = signEmbedLivePayload(encoded);
  const actualBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (actualBuffer.length !== expectedBuffer.length || !crypto.timingSafeEqual(actualBuffer, expectedBuffer)) return null;
  try {
    const decoded = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
    if (!decoded || Number(decoded.exp || 0) < Date.now()) return null;
    return decoded;
  } catch {
    return null;
  }
}

function pruneEmbedLiveTickets() {
  const now = Date.now();
  for (const [id, exp] of embedLiveUsedTickets) {
    if (exp < now) embedLiveUsedTickets.delete(id);
  }
}

function embedLiveExternalUserId(value = "") {
  const id = String(value || "").trim();
  if (!id || id.length > 120 || !/^[A-Za-z0-9_.:@-]+$/.test(id)) return "";
  return id;
}

function embedLiveOrigin(value = "") {
  const raw = String(value || "").trim();
  if (!raw) return "";
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:" && url.protocol !== "http:") return "";
    return url.origin;
  } catch {
    return "";
  }
}

async function listEmbedLiveVoices() {
  const live = chatLiveConfigValue(await readAppConfig());
  const region = live.region === "cn" ? "cn" : "overseas";
  const blocked = region === "overseas" ? "doubao_cn" : "doubao_overseas";
  const parsed = await listCatalogEntriesFromDb("chat_live_voices", { scope: "realtime" });
  const voices = (Array.isArray(parsed) ? parsed : []).filter((voice) => {
    const provider = String(voice?.provider || "");
    if (!provider || provider === "offline" || provider === blocked) return false;
    return provider === "qwen_omni" || provider === "doubao_cn" || provider === "doubao_overseas";
  }).map((voice) => ({
    name: String(voice.name || ""),
    voiceType: String(voice.voiceType || ""),
    provider: String(voice.provider || ""),
    desc: String(voice.desc || ""),
    languages: String(voice.languages || ""),
  })).filter((voice) => voice.voiceType);
  return { region, voices };
}

async function resolveEmbedLiveVoice(input = {}) {
  const catalog = await listEmbedLiveVoices();
  const requestedType = String(input.voiceType || "").trim();
  const requestedProvider = String(input.voiceProvider || "").trim();
  if (!requestedType) {
    const fallback = catalog.voices.find((voice) => voice.voiceType === "Cindy" && voice.provider === "qwen_omni") || catalog.voices.find((voice) => voice.provider === "qwen_omni");
    if (!fallback) {
      const error = new Error("当前没有可用音色。");
      error.statusCode = 503;
      error.code = "EMBED_VOICE_UNAVAILABLE";
      throw error;
    }
    return fallback;
  }
  const found = catalog.voices.find((voice) => voice.voiceType === requestedType && (!requestedProvider || voice.provider === requestedProvider));
  if (!found) {
    const error = new Error("voiceType 不在当前可用音色列表里。请先调用 GET /api/embed/live/voices。");
    error.statusCode = 422;
    error.code = "EMBED_VOICE";
    throw error;
  }
  return found;
}

function normalizeEmbedLiveLooks(raw) {
  if (raw == null || raw === "") return [];
  if (!Array.isArray(raw)) {
    const error = new Error("character.looks 必须是数组。");
    error.statusCode = 422;
    error.code = "EMBED_LOOKS";
    throw error;
  }
  if (raw.length > 12) {
    const error = new Error("换装、道具、背景一共最多 12 张。");
    error.statusCode = 422;
    error.code = "EMBED_LOOKS";
    throw error;
  }
  const labels = { garment: "换衣服", object: "手里拿东西", background: "换背景" };
  return raw.map((item, index) => {
    const kind = String(item?.kind || "").trim();
    if (!labels[kind]) {
      const error = new Error("looks.kind 只能是 garment、object 或 background。");
      error.statusCode = 422;
      error.code = "EMBED_LOOKS";
      throw error;
    }
    const imageUrl = String(item?.imageUrl || item?.image_url || "").trim();
    if (!/^https:\/\/\S+$/i.test(imageUrl)) {
      const error = new Error("换装、道具、背景图片必须是可公网访问的 https 地址。");
      error.statusCode = 422;
      error.code = "EMBED_LOOKS";
      throw error;
    }
    return {
      id: `embed-look-${index + 1}`,
      kind,
      name: String(item?.name || labels[kind]).trim().slice(0, 40) || labels[kind],
      imageUrl: imageUrl.slice(0, 500),
      userText: String(item?.userText || item?.user_text || CHAT_LIVE_LOOK_TEXT[kind] || "").trim().slice(0, 200),
      sortOrder: index,
    };
  });
}

async function upsertEmbedLiveCharacter(merchantId, input = {}) {
  const imageUrl = String(input.imageUrl || input.avatarUrl || "").trim();
  if (!/^https:\/\/\S+$/i.test(imageUrl)) {
    const error = new Error("角色形象图必须是可公网访问的 https 地址。");
    error.statusCode = 422;
    error.code = "EMBED_IMAGE_URL";
    throw error;
  }
  const name = String(input.name || "").trim().slice(0, 80);
  const script = String(input.script || input.directScript || "").trim().slice(0, 4000);
  const embedDirectScript = Boolean(script);
  const persona = embedDirectScript ? script : String(input.persona || input.intro || "").trim().slice(0, 4000);
  const intro = String(input.intro || persona).trim().slice(0, 500);
  if (!name || !persona) {
    const error = new Error("请提供角色名称，以及 intro、persona 或 script。");
    error.statusCode = 422;
    error.code = "EMBED_CHARACTER";
    throw error;
  }
  const voice = await resolveEmbedLiveVoice(input);
  const voiceType = voice.voiceType;
  const voiceProvider = voice.provider;
  const embedLooks = normalizeEmbedLiveLooks(input.looks);
  const id = `embedchar-${crypto.createHash("sha256").update([merchantId, name, imageUrl, voiceType, voiceProvider, persona, JSON.stringify(embedLooks)].join("\n")).digest("hex").slice(0, 24)}`;
  const now = new Date().toISOString();
  const existing = await getChatLiveCharacterInDb(id);
  return upsertChatLiveCharacterInDb({
    ...(existing || {}),
    id,
    name,
    intro,
    persona,
    greeting: String(input.greeting || "").trim().slice(0, 1000),
    embedDirectScript,
    avatarUrl: imageUrl,
    portraitUrl: String(input.portraitUrl || imageUrl).trim(),
    voiceType,
    embedLooks,
    componentVoiceType: String(input.componentVoiceType || existing?.componentVoiceType || "longanyang").trim().slice(0, 80) || "longanyang",
    voiceProvider,
    language: String(input.language || existing?.language || "zh").trim().slice(0, 16) || "zh",
    enabled: false,
    embedMerchantId: String(merchantId),
    sortOrder: 100000,
    createdAt: existing?.createdAt || now,
    updatedAt: now,
  });
}

async function handleEmbedLiveVoices(req, res, url) {
  const auth = await requireUser(req, res);
  if (!auth) return;
  if (auth.tokenSource === "embed_live") return sendJson(res, 403, { ok: false, code: "EMBED_TOKEN_FORBIDDEN", message: "请使用商家 API token 查询音色。" });
  let catalog;
  try {
    catalog = await listEmbedLiveVoices();
  } catch (error) {
    return sendJson(res, 503, { ok: false, code: "EMBED_VOICE_UNAVAILABLE", message: "音色列表暂时不可用。" });
  }
  const provider = String(url?.searchParams?.get("provider") || "").trim();
  const query = String(url?.searchParams?.get("q") || "").trim().toLowerCase();
  const limit = Math.max(1, Math.min(200, Number(url?.searchParams?.get("limit") || 50) || 50));
  const offset = Math.max(0, Number(url?.searchParams?.get("offset") || 0) || 0);
  let voices = catalog.voices;
  if (provider) voices = voices.filter((voice) => voice.provider === provider);
  if (query) voices = voices.filter((voice) => `${voice.name} ${voice.voiceType} ${voice.desc}`.toLowerCase().includes(query));
  const providers = {};
  for (const voice of catalog.voices) providers[voice.provider] = (providers[voice.provider] || 0) + 1;
  return sendJson(res, 200, {
    ok: true,
    viduRegion: catalog.region,
    providers: Object.entries(providers).map(([name, count]) => ({ provider: name, count })),
    total: voices.length,
    limit,
    offset,
    voices: voices.slice(offset, offset + limit),
  });
}

async function handleEmbedLiveTicket(req, res) {
  const auth = await requireUser(req, res);
  if (!auth) return;
  if (auth.tokenSource === "embed_live") return sendJson(res, 403, { ok: false, code: "EMBED_TOKEN_FORBIDDEN", message: "请使用商家 API token 创建接入票。" });
  const body = await readJson(req);
  const externalUserId = embedLiveExternalUserId(body.externalUserId || body.external_user_id);
  if (!externalUserId) return sendJson(res, 422, { ok: false, code: "EMBED_USER", message: "externalUserId 必填，只能包含字母、数字和 _.:@-。" });
  const user = body.user && typeof body.user === "object" ? body.user : {};
  const origin = body.origin ? embedLiveOrigin(body.origin) : "";
  if (body.origin && !origin) return sendJson(res, 422, { ok: false, code: "EMBED_ORIGIN", message: "origin 必须是 http(s) 来源。" });
  let character;
  try {
    character = await upsertEmbedLiveCharacter(auth.user.id, body.character || {});
  } catch (error) {
    return sendJson(res, error.statusCode || 422, { ok: false, code: error.code || "EMBED_CHARACTER", message: error.message || "角色资料不正确。" });
  }
  const ticketId = randomId("embedticket");
  const exp = Date.now() + EMBED_LIVE_TICKET_TTL_MS;
  const ticket = makeEmbedLiveToken("elt1", {
    kind: "ticket",
    jti: ticketId,
    merchantUserId: auth.user.id,
    externalUserId,
    displayName: String(user.name || externalUserId).trim().slice(0, 80),
    avatarUrl: String(user.avatarUrl || "").trim().slice(0, 500),
    characterId: character.id,
    origin,
    exp,
  });
  return sendJson(res, 201, {
    ok: true,
    ticket,
    expiresAt: new Date(exp).toISOString(),
    embedUrl: `https://live.123vipeak.com/embed?ticket=${encodeURIComponent(ticket)}`,
    character: { id: character.id, name: character.name },
  });
}

async function handleEmbedLiveBootstrap(req, res) {
  const body = await readJson(req);
  const ticket = readEmbedLiveToken(body.ticket, "elt1");
  if (!ticket || ticket.kind !== "ticket") return sendJson(res, 401, { ok: false, code: "EMBED_TICKET_INVALID", message: "接入票无效或已过期。" });
  pruneEmbedLiveTickets();
  if (embedLiveUsedTickets.has(ticket.jti)) return sendJson(res, 409, { ok: false, code: "EMBED_TICKET_USED", message: "这张接入票已经使用过。" });
  const parentOrigin = embedLiveOrigin(body.parentOrigin || "");
  if (ticket.origin && parentOrigin !== ticket.origin) {
    return sendJson(res, 403, { ok: false, code: "EMBED_ORIGIN_MISMATCH", message: "当前页面来源不在允许的域名内。" });
  }
  const character = await getChatLiveCharacterInDb(ticket.characterId);
  if (!character || String(character.embedMerchantId || "") !== String(ticket.merchantUserId)) {
    return sendJson(res, 404, { ok: false, code: "EMBED_CHARACTER_NOT_FOUND", message: "角色不存在。" });
  }
  embedLiveUsedTickets.set(ticket.jti, ticket.exp);
  const exp = Date.now() + EMBED_LIVE_BROWSER_TTL_MS;
  const browserToken = makeEmbedLiveToken("elv1", {
    kind: "browser",
    merchantUserId: ticket.merchantUserId,
    externalUserId: ticket.externalUserId,
    displayName: ticket.displayName,
    avatarUrl: ticket.avatarUrl || "",
    characterId: ticket.characterId,
    exp,
  });
  return sendJson(res, 200, {
    ok: true,
    browserToken,
    expiresAt: new Date(exp).toISOString(),
    character: publicChatLiveCharacter(character),
  });
}

async function embedLiveAuthFromToken(token, tenantId, loadDb) {
  const embed = readEmbedLiveToken(token, "elv1");
  if (!embed || embed.kind !== "browser" || !embed.merchantUserId) return null;
  const db = loadDb ? await readDb() : lightweightAuthDb();
  const user = dbEnabled()
    ? await getUserByIdInDb(embed.merchantUserId)
    : (db.users || []).find((item) => item.id === embed.merchantUserId) || null;
  if (!user || !recordBelongsToTenant(user, tenantId)) return null;
  const auth = { db, user, session: null, embed, ...authUserContext(user, token, "embed_live", null) };
  const store = requestContext.getStore();
  if (store) store.auth = auth;
  return auth;
}

function embedLiveIntegrationMarkdown() {
  return [
    "## Embedded Live Chat",
    "",
    "Put a live character inside another site. Keep the merchant API token on the server. The browser only receives a one-time ticket.",
    "",
    "The same merchant token serves every downstream user. `externalUserId` separates those users. Calls are billed to the merchant wallet, and the credit record includes `externalUserId`.",
    "",
    "Do not sign the merchant into the iframe. A normal site login is single-session and would disconnect the merchant's other sessions.",
    "",
    "### Create a ticket",
    "",
    markdownCodeBlock("http", [
      "POST /api/embed/live/tickets",
      "Authorization: Bearer <merchant-api-token>",
      "Content-Type: application/json",
      "",
      JSON.stringify({
        externalUserId: "user-10001",
        user: { name: "小王", avatarUrl: "https://example.com/user.png" },
        origin: "https://merchant.example",
        character: {
          name: "林夏",
          intro: "晚间电台主播，说话轻、会接话。",
          persona: "你是林夏，语气温柔，回答短一些。",
          imageUrl: "https://example.com/character.png",
          voiceType: "Cindy",
        },
      }, null, 2),
    ].join("\n")),
    "",
    "The response contains `ticket`, `expiresAt`, and `embedUrl`. A ticket lasts 10 minutes and can be redeemed once.",
    "",
    "### Iframe",
    "",
    "Open `embedUrl` on `https://live.123vipeak.com`. The parent page must allow microphone, camera, and autoplay:",
    "",
    markdownCodeBlock("html", '<iframe src="EMBED_URL" allow="microphone; camera; autoplay" allowfullscreen style="width:100%;height:100%;border:0"></iframe>'),
    "",
    "If `origin` is set, the parent page origin must match it. Leave `origin` empty to allow any parent.",
    "",
    "### Fields",
    "",
    "- `externalUserId` (required): stable downstream user id, unique for this merchant. Letters, numbers, and `_. : @ -` only, up to 120 characters.",
    "- `user.name`, `user.avatarUrl`: display name and avatar for that user.",
    "- `character.name` (required).",
    "- `character.intro` or `character.persona`: conversation guidance. One of `intro`, `persona`, or `script` is required. If `script` is omitted, the server adds its own live-chat guidance around `persona`.",
    "- `character.script`: optional exact instruction sent to the live provider. When this is present, it replaces `persona` and the server does not append its own guidance.",
    "- `character.greeting`: optional opening instruction.",
    "- `character.imageUrl` (required): public `https` image. It is sent to the live provider as the character image.",
    "- `character.voiceType`: optional. Pass a `voiceType` from `GET /api/embed/live/voices`. Defaults to `Cindy`.",
    "- `character.voiceProvider`: optional. Use it together with `voiceType` when the same id exists for more than one provider. Current values are `qwen_omni` and the Doubao provider for the active region.",
    "- `character.looks`: optional array, at most 12 items. Each item is { kind: garment | object | background, name, imageUrl }. garment changes clothes, object puts something in the hands, background changes the scene. Pass public https images. If omitted, the embed call does not use the platform look catalog.",
    "- `origin`: optional parent origin, such as `https://merchant.example`.",
    "",
    "### Gifts",
    "",
    "The iframe includes the platform gift button. Gift names, images, and credit prices come from the live site, not from the ticket. Sending a gift charges the merchant wallet, and the credit record includes externalUserId. Do not send gift prices in the ticket. If the merchant balance cannot cover the gift, the API returns 402.",
    "",
    "### Voices",
    "",
    "The voice catalog is not inlined here because it is long and depends on the current live region. Query it with the merchant token:",
    "",
    markdownCodeBlock("http", [
      "GET /api/embed/live/voices?provider=qwen_omni&q=Tina&limit=50&offset=0",
      "Authorization: Bearer <merchant-api-token>",
    ].join("\n")),
    "",
    "The response includes `viduRegion`, `providers`, `total`, and `voices[]` with `name`, `voiceType`, `provider`, `desc`, and `languages`. Use `voiceType` as `character.voiceType` when creating a ticket. `limit` defaults to 50 and cannot exceed 200.",
    "",
    "### Billing and concurrency",
    "",
    "Free time is a cumulative per-user allowance, not a per-connection preview. Billing starts when the live becomes billable, consumes any remaining free allowance first, and then uses prepaid blocks at the live-site price. Once the allowance is exhausted, the merchant balance is checked before entry and again about every 10 seconds. If the next block cannot be reserved, the call is hung up. One `externalUserId` can have only one active call. Other downstream users of the same merchant are not blocked.",
    "",
    "### Errors",
    "",
    "- `401`: merchant token or ticket is missing, invalid, or expired.",
    "- `403`: parent origin does not match `origin`.",
    "- `409`: this ticket was already used, or this downstream user already has an active call.",
    "- `422`: user id, character name, intro/persona, or https image is missing.",
    "- `402`: the merchant balance cannot cover the next prepaid block.",
    "",
  ].join("\n");
}

function unlockStreamSecret() {
  return process.env.UNLOCK_STREAM_SECRET || process.env.SESSION_SECRET || ARK_API_KEY || "raising-game-unlock-stream";
}

function base64UrlEncode(value) {
  return Buffer.from(value).toString("base64url");
}

function base64UrlJson(value) {
  return base64UrlEncode(JSON.stringify(value));
}

function signUnlockStreamPayload(encodedPayload) {
  return crypto.createHmac("sha256", unlockStreamSecret()).update(encodedPayload).digest("base64url");
}

function makeUnlockStreamToken({ userId, itemId, sceneId, sceneEntryId = "default", videoKey = "" }) {
  const payload = base64UrlJson({
    userId,
    itemId,
    sceneId,
    sceneEntryId: sceneEntryId || "default",
    videoKey,
    exp: Date.now() + UNLOCK_STREAM_TTL_MS,
  });
  return `${payload}.${signUnlockStreamPayload(payload)}`;
}

function parseUnlockStreamToken(token = "") {
  const [payload, signature] = String(token || "").split(".");
  if (!payload || !signature) return null;
  const expected = signUnlockStreamPayload(payload);
  const actualBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (actualBuffer.length !== expectedBuffer.length || !crypto.timingSafeEqual(actualBuffer, expectedBuffer)) return null;
  try {
    const decoded = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (!decoded || Number(decoded.exp || 0) < Date.now()) return null;
    return decoded;
  } catch {
    return null;
  }
}

function getUnlockVideoUrl(entry = {}) {
  return String(entry.cdnVideoUrl || entry.videoUrl || entry.localVideoUrl || entry.remoteVideoUrl || "").trim();
}

function secureUnlockVideoUrl({ userId, itemId, sceneId, sceneEntryId = "default", videoKey = "" }) {
  const token = makeUnlockStreamToken({ userId, itemId, sceneId, sceneEntryId, videoKey });
  return `/api/unlock-video/stream/${encodeURIComponent(token)}`;
}

function makePublicGameVideoToken({ itemId, sceneId, sceneEntryId = "default", videoKey = "" }) {
  const payload = base64UrlJson({
    userId: "__game_public__",
    itemId,
    sceneId,
    sceneEntryId: sceneEntryId || "default",
    videoKey,
    exp: Date.now() + UNLOCK_STREAM_TTL_MS,
  });
  return `${payload}.${signUnlockStreamPayload(payload)}`;
}

function publicGameVideoUrl({ itemId, sceneId, sceneEntryId = "default", videoKey = "" }) {
  const token = makePublicGameVideoToken({ itemId, sceneId, sceneEntryId, videoKey });
  return `/api/game/video/${encodeURIComponent(token)}`;
}

function normalizePublicAssetPath(value = "") {
  const clean = String(value || "").split("?")[0].trim();
  if (!clean || /^https?:\/\//i.test(clean)) return "";
  return `/${clean.replace(/^\/+/, "")}`;
}

async function isProtectedUnlockAssetPath(publicPath = "") {
  const normalizedPath = normalizePublicAssetPath(publicPath);
  const config = await readAppConfig();
  const homeVideo = normalizeHomeVideo(config.homeVideo || {});
  return (homeVideo.items || []).some((item) => {
    return publicCharacterVideoList(item).some(({ entry }) => {
      const localVideoPath = normalizePublicAssetPath(entry?.videoUrl || entry?.localVideoUrl || "");
      return localVideoPath && localVideoPath === normalizedPath;
    });
  });
}

function upsertHomeVideoItem(homeVideo = {}, item) {
  const normalized = normalizeHomeVideo(homeVideo);
  const items = normalized.items.filter((next) => next.id !== item.id);
  items.unshift(item);
  return syncHomeVideoActiveFields({ ...normalized, activeItemId: item.id, items });
}

function replaceHomeVideoItem(homeVideo = {}, item) {
  const normalized = normalizeHomeVideo(homeVideo);
  let found = false;
  const items = normalized.items.map((next) => {
    if (next.id !== item.id) return next;
    found = true;
    return { ...next, ...item };
  });
  return syncHomeVideoActiveFields(found ? { ...normalized, items } : normalized);
}

function userView(user) {
  if (!user) return null;
  // userView() is reused by login, profile, payment, and generation responses.
  // Never put the long-lived primary token in those payloads: a single XSS,
  // browser extension, or response log would otherwise leak it. The owner can
  // retrieve it explicitly from /api/access/token when they choose to view or
  // copy it.
  const apiToken = String(user.apiToken || "");
  return {
    id: user.id,
    tenantId: recordTenantId(user),
    username: user.username,
    email: String(user.email || ""),
    profilePhotos: Array.isArray(user.profilePhotos) ? user.profilePhotos.slice(0, 6).map(String) : [],
    gender: ["male", "female", "other"].includes(String(user.gender || "")) ? String(user.gender) : "",
    birthday: String(user.birthday || ""),
    occupation: String(user.occupation || ""),
    city: String(user.city || ""),
    bio: String(user.bio || ""),
    interests: Array.isArray(user.interests) ? user.interests.slice(0, 8).map(String) : [],
    voiceIntroUrl: String(user.voiceIntroUrl || ""),
    profilePrivacy: {
      showDistance: user.profilePrivacy?.showDistance !== false,
      showActivity: user.profilePrivacy?.showActivity === true,
    },
    role: user.role || "user",
    credits: Number(user.credits || 0),
    apiToken: "",
    apiTokenPreview: apiToken ? `${apiToken.slice(0, 8)}...${apiToken.slice(-6)}` : "",
    pricingMultiplier: normalizeUserPricingMultiplier(user, { channel: "web" }),
    apiPricingMultiplier: normalizeUserPricingMultiplier(user, { channel: "api" }),
    advancedAccess: user.advancedAccess === true,
    advancedAccessLevel: user.advancedAccess === true ? "advanced" : "platform",
    advancedAccessRequestedAt: user.advancedAccessRequestedAt || "",
    membership: publicCreatorMembership(user),
    membershipActive: userHasCreatorMembership(user),
    apiDocs: publicApiDocsEntitlement(user),
    apiDocsAccess: userHasApiDocsAccess(user),
    createdAt: user.createdAt,
    riskStatus: user.riskStatus === "quarantined" ? "quarantined" : "clear",
    riskReasons: Array.isArray(user.riskReasons) ? user.riskReasons.slice(0, 8).map(String) : [],
    riskReviewedAt: String(user.riskReviewedAt || ""),
  };
}

function normalizeProfilePrivacy(value = {}) {
  const source = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  return {
    showDistance: source.showDistance !== false,
    showActivity: source.showActivity === true,
  };
}

function publicProfileStats(db = {}, user = {}) {
  const userId = String(user.id || "");
  const ownCharacters = new Set((db.userCharacters || [])
    .filter((entry) => String(entry.userId || "") === userId && !isSoftDeleted(entry))
    .map((entry) => String(entry.id || entry.characterId || ""))
    .filter(Boolean));
  const giftsReceived = (db.creditLedger || []).filter((entry) => {
    if (!/gift/i.test(String(entry.type || "")) || Number(entry.delta || 0) >= 0) return false;
    const meta = entry.meta && typeof entry.meta === "object" ? entry.meta : {};
    return ownCharacters.has(String(meta.characterId || meta.creatorCharacterId || ""));
  }).length;
  return {
    // There is no follow/creator-income model yet. Do not derive these from
    // per-character intimacy rows or gift senders because that changes meaning.
    following: 0,
    followers: 0,
    giftsReceived,
    creatorIncomeCredits: 0,
  };
}

async function handleAccountProfile(req, res) {
  const auth = await requireUser(req, res); if (!auth) return;
  if (!dbEnabled()) return sendJson(res, 503, { ok: false, code: "DATABASE_REQUIRED", message: "资料保存需要数据库服务。" });
  const body = await readJson(req);
  const username = String(body.username ?? "").trim().replace(/\s+/g, " ");
  if (username.length < 2 || username.length > 40) return sendJson(res, 400, { ok: false, message: "昵称长度需为 2-40 个字符。" });
  const duplicate = await getUserByUsernameInDb(username, requestTenantId(req));
  if (duplicate && duplicate.id !== auth.user.id) return sendJson(res, 409, { ok: false, message: "这个昵称已被使用。" });
  auth.user.username = username;
  auth.user.gender = ["male", "female", "other"].includes(String(body.gender || "")) ? String(body.gender) : "";
  auth.user.birthday = /^\d{4}-\d{2}-\d{2}$/.test(String(body.birthday || "")) ? String(body.birthday) : "";
  auth.user.occupation = String(body.occupation || "").trim().slice(0, 40);
  auth.user.city = String(body.city || "").trim().slice(0, 60);
  auth.user.bio = String(body.bio || "").trim().slice(0, 120);
  auth.user.interests = (Array.isArray(body.interests) ? body.interests : []).map((item) => String(item || "").trim().slice(0, 20)).filter(Boolean).slice(0, 8);
  if (body.profilePrivacy !== undefined) auth.user.profilePrivacy = normalizeProfilePrivacy(body.profilePrivacy);
  if (Array.isArray(body.profilePhotos)) {
    const existing = new Set(Array.isArray(auth.user.profilePhotos) ? auth.user.profilePhotos.map(String) : []);
    auth.user.profilePhotos = body.profilePhotos.map(String).filter((url) => existing.has(url)).slice(0, 6);
  }
  auth.user.updatedAt = new Date().toISOString();
  await updateUserInDb(auth.user);
  return sendJson(res, 200, { ok: true, user: userView(auth.user), profileStats: publicProfileStats(auth.db, auth.user) });
}

async function handleAccountProfileMedia(req, res) {
  const auth = await requireUser(req, res); if (!auth) return;
  if (!await enforceBusinessRateLimit(req, res, auth, { action: "account_profile_media", limit: 20, windowMs: 60 * 60_000 })) return;
  if (!dbEnabled()) return sendJson(res, 503, { ok: false, code: "DATABASE_REQUIRED", message: "照片上传需要数据库服务。" });
  const body = await readJson(req, JSON_MEDIA_BODY_MAX_BYTES);
  if (body.kind === "voice") {
    let decoded;
    try { decoded = decodeWanMediaDataUrl(body.dataUrl || ""); } catch { return sendJson(res, 400, { ok: false, message: "只支持 MP3、WAV、M4A、OGG、WEBM 音频。" }); }
    if (!decoded.mime.startsWith("audio/") || decoded.bytes.byteLength > 8 * 1024 * 1024) return sendJson(res, 400, { ok: false, message: "请上传 8MB 以内的语音文件。" });
    const ext = audioExtFromMime(decoded.mime);
    const key = `${String(OBJECT_STORAGE_KEY_PREFIX || "seedance-assets/raising-game").replace(/^\/+|\/+$/g, "")}/live-profile/${auth.user.id}-${Date.now().toString(36)}-${crypto.randomBytes(4).toString("hex")}${ext}`;
    const uploaded = await uploadStaticAssetToR2({ key, bytes: decoded.bytes, mime: decoded.mime });
    auth.user.voiceIntroUrl = uploaded.publicUrl;
    auth.user.updatedAt = new Date().toISOString();
    await updateUserInDb(auth.user);
    return sendJson(res, 200, { ok: true, url: uploaded.publicUrl, user: userView(auth.user) });
  }
  const current = Array.isArray(auth.user.profilePhotos) ? auth.user.profilePhotos.map(String) : [];
  if (current.length >= 6) return sendJson(res, 422, { ok: false, message: "最多上传 6 张照片。" });
  let decoded;
  try { decoded = decodeImageDataUrl(body.dataUrl || ""); } catch { return sendJson(res, 400, { ok: false, message: "只支持 PNG、JPG、WEBP 图片。" }); }
  if (!["image/png", "image/jpeg", "image/webp"].includes(decoded.mime) || decoded.bytes.byteLength > 8 * 1024 * 1024) return sendJson(res, 400, { ok: false, message: "请上传 8MB 以内的 PNG、JPG 或 WEBP 图片。" });
  const key = `${String(OBJECT_STORAGE_KEY_PREFIX || "seedance-assets/raising-game").replace(/^\/+|\/+$/g, "")}/live-profile/${auth.user.id}-${Date.now().toString(36)}-${crypto.randomBytes(4).toString("hex")}${imageExtFromMime(decoded.mime)}`;
  const uploaded = await uploadStaticAssetToR2({ key, bytes: decoded.bytes, mime: decoded.mime });
  auth.user.profilePhotos = current.concat(uploaded.publicUrl).slice(0, 6);
  auth.user.updatedAt = new Date().toISOString();
  await updateUserInDb(auth.user);
  return sendJson(res, 200, { ok: true, url: uploaded.publicUrl, user: userView(auth.user) });
}

function referralCodeForUser(user = {}) {
  const id = String(user.id || "").trim();
  if (!id) return "";
  return Buffer.from(id, "utf8").toString("base64url").replace(/=+$/, "");
}

function userIdFromReferralCode(code = "") {
  const clean = String(code || "").trim();
  if (!/^[a-z0-9_-]{6,128}$/i.test(clean)) return "";
  try {
    return Buffer.from(clean, "base64url").toString("utf8");
  } catch {
    return "";
  }
}

function referralPayload(user = {}) {
  return user.referral && typeof user.referral === "object" ? user.referral : {};
}

function normalizeReferralCode(value = "") {
  return String(value || "").trim().replace(/^#/, "");
}

async function referralRewardAlreadyGranted(db = {}, referrerUserId = "", referredUserId = "") {
  const cleanReferrerId = String(referrerUserId || "").trim();
  const cleanReferredId = String(referredUserId || "").trim();
  const loaded = (db.creditLedger || []).some((entry) => (
    entry.type === "referral_reward"
    && String(entry.userId || entry.meta?.referrerUserId || "") === cleanReferrerId
    && String(entry.meta?.referredUserId || "") === cleanReferredId
  ));
  if (loaded || !dbEnabled()) return loaded;
  return hasReferralRewardInDb(cleanReferrerId, cleanReferredId);
}

function referredUsersForUser(db = {}, user = {}) {
  return (db.users || []).filter((entry) => (
    entry?.id
    && !isSoftDeleted(entry)
    && recordBelongsToTenant(entry, recordTenantId(user))
    && referralPayload(entry).referredByUserId === user.id
  ));
}

function paidReferralUserIds(db = {}, user = {}) {
  const invitedIds = new Set(referredUsersForUser(db, user).map((entry) => entry.id));
  return new Set((db.walletOrders || [])
    .filter((order) => invitedIds.has(order.userId) && String(order.status || "").toLowerCase() === "paid")
    .map((order) => String(order.userId || ""))
    .filter(Boolean));
}

async function ensureCreatorMembershipFromReferrals(db = {}, user = {}) {
  if (!user?.id || userHasCreatorMembership(user)) return user;
  const invitedCount = referredUsersForUser(db, user).length;
  if (invitedCount < CREATOR_MEMBERSHIP_REFERRAL_TARGET) return user;
  await activateCreatorMembership(db, user, {
    source: "referral_registrations",
    referralCount: invitedCount,
  });
  return user;
}

function publicReferralSummary(req, db = {}, user = {}) {
  const referral = referralPayload(user);
  const code = referralCodeForUser(user);
  const invitedUserIds = new Set(referredUsersForUser(db, user).map((entry) => entry.id));
  if (referral.invitedUserId) invitedUserIds.add(referral.invitedUserId);
  const paidUserIds = paidReferralUserIds(db, user);
  const rewardedUserIds = new Set((db.creditLedger || [])
    .filter((entry) => entry.type === "referral_reward" && entry.userId === user.id)
    .map((entry) => String(entry.meta?.referredUserId || ""))
    .filter(Boolean));
  const rewardCount = Math.max(
    rewardedUserIds.size,
    Math.max(0, Number(referral.rewardCount || 0)),
    referral.rewardedAt ? 1 : 0,
  );
  const membershipActive = userHasCreatorMembership(user);
  const referralWallet = referral.walletAddress || "";
  const totalCommissionUsd = Number(referral.totalCommissionUsd || 0);
  const withdrawnCommissionUsd = Number(referral.withdrawnCommissionUsd || 0);
  const lockedCommissionUsd = Number(referral.lockedCommissionUsd || 0);
  const availableWithdrawableUsd = Math.max(0, totalCommissionUsd - withdrawnCommissionUsd - lockedCommissionUsd);
  const withdrawalRecords = (db.referralWithdrawals || [])
    .filter((record) => String(record.userId || "") === String(user.id || ""))
    .sort((left, right) => String(right.createdAt || "").localeCompare(String(left.createdAt || "")))
    .slice(0, 20)
    .map((record) => referralWithdrawalView(record, user));
  const availableRewards = Math.max(0, paidUserIds.size - rewardCount);
  const rewardEligible = true;
  const origin = pageOriginFromRequest(req);
  return {
    code,
    inviteUrl: `${origin}/?ref=${encodeURIComponent(code)}`,
    rewardCredits: REFERRAL_REWARD_CREDITS,
    invitedCount: invitedUserIds.size,
    invitedUsers: invitedUserIds.size,
    paidInviteCount: paidUserIds.size,
    rewardCount,
    remainingRewards: availableRewards,
    maxRewards: Math.max(paidUserIds.size, rewardCount),
    rewardEligible,
    membershipActive,
    membershipTarget: CREATOR_MEMBERSHIP_REFERRAL_TARGET,
    remainingToMembership: Math.max(0, CREATOR_MEMBERSHIP_REFERRAL_TARGET - invitedUserIds.size),
    rewardedAt: referral.rewardedAt || "",
    referredByUserId: referral.referredByUserId || "",
    referredByUsername: referral.referredByUsername || "",
    walletAddress: referralWallet,
    totalCommissionUsd: Number(totalCommissionUsd.toFixed(6)),
    withdrawnCommissionUsd: Number(withdrawnCommissionUsd.toFixed(6)),
    lockedCommissionUsd: Number(lockedCommissionUsd.toFixed(6)),
    availableWithdrawableUsd: Number(availableWithdrawableUsd.toFixed(6)),
    withdrawableUsd: Number(availableWithdrawableUsd.toFixed(6)),
    totalEarnedUsd: Number(totalCommissionUsd.toFixed(6)),
    withdrawals: withdrawalRecords,
  };
}

function apiSubtokenView(record = {}, { includeToken = false } = {}) {
  const normalized = typeof record === "object" && record && record.id ? record : null;
  if (!normalized) return null;
  const quotaType = String(record.quotaType || "").trim().toLowerCase() === "count" ? "count" : "amount";
  const quotaLimit = roundCredits(record.quotaLimit || 0, 6);
  const usedAmount = roundCredits(record.usedAmount || 0, 6);
  const usedCount = Math.max(0, Math.round(Number(record.usedCount || 0) || 0));
  const remaining = quotaType === "count"
    ? Math.max(0, roundCredits(quotaLimit - usedCount, 6))
    : Math.max(0, roundCredits(quotaLimit - usedAmount, 6));
  return {
    id: String(record.id || ""),
    token: includeToken ? String(record.token || "") : "",
    tokenPreview: String(record.tokenPreview || ""),
    parentUserId: String(record.parentUserId || ""),
    name: String(record.name || ""),
    quotaType,
    quotaLimit,
    usedAmount,
    usedCount,
    remaining,
    expiresAt: String(record.expiresAt || ""),
    revokedAt: String(record.revokedAt || ""),
    lastUsedAt: String(record.lastUsedAt || ""),
    createdAt: String(record.createdAt || ""),
    updatedAt: String(record.updatedAt || ""),
    status: String(record.status || ""),
    active: record.active === true,
  };
}

function creditsAmount(value, fallback = 0) {
  const next = Number(value);
  if (!Number.isFinite(next)) return Math.max(0, Math.round(Number(fallback || 0) * 10000) / 10000);
  return Math.max(0, Math.round(next * 10000) / 10000);
}

function roundCredits(value, digits = 6) {
  const next = Number(value);
  if (!Number.isFinite(next)) return 0;
  const scale = 10 ** Math.max(0, Math.min(8, Math.floor(Number(digits) || 6)));
  return Math.round(next * scale) / scale;
}

function normalizePricingChannel(value = "web") {
  const normalized = String(value || "").trim().toLowerCase();
  return normalized === "api" || normalized === "interface" || normalized === "bearer" ? "api" : "web";
}

function pricingContextForAuth(auth = {}) {
  const tokenSource = String(auth?.tokenSource || "").toLowerCase();
  return { channel: tokenSource === "api_token" || tokenSource === "subtoken" || auth?.isApiToken === true ? "api" : "web" };
}

function pricingContextForRecord(record = {}) {
  const source = String(record.apiTokenSource || record.tokenSource || "").toLowerCase();
  return { channel: source === "api_token" || source === "subtoken" ? "api" : "web" };
}

function normalizeUserPricingMultiplier(userOrValue = 1, options = {}) {
  const channel = normalizePricingChannel(options.channel);
  const raw = userOrValue && typeof userOrValue === "object"
    ? channel === "api"
      ? (userOrValue.apiPricingMultiplier ?? userOrValue.apiPriceMultiplier ?? userOrValue.apiDiscountMultiplier ?? userOrValue.apiDiscount ?? 1)
      : (userOrValue.pricingMultiplier ?? userOrValue.priceMultiplier ?? userOrValue.discountMultiplier ?? userOrValue.discount)
    : userOrValue;
  const next = Number(raw);
  if (!Number.isFinite(next) || next <= 0) return 1;
  return Math.round(Math.max(0.01, Math.min(100, next)) * 10000) / 10000;
}

function applyUserPricingMultiplierToCredits(credits, userOrValue = 1, options = {}) {
  const multiplier = normalizeUserPricingMultiplier(userOrValue, options);
  return creditsAmount(Number(credits || 0) * multiplier);
}

function pricingMultiplierView(userOrValue = 1, options = {}) {
  return {
    multiplier: normalizeUserPricingMultiplier(userOrValue, options),
    channel: normalizePricingChannel(options.channel),
  };
}

function applyUserPricingToEstimate(estimate = {}, userOrValue = 1, options = {}) {
  const channel = normalizePricingChannel(options.channel);
  const multiplier = normalizeUserPricingMultiplier(userOrValue, { channel });
  const originalCredits = creditsAmount(estimate.credits || 0);
  const originalBaseCredits = estimate.baseCredits === undefined || estimate.baseCredits === null
    ? originalCredits
    : creditsAmount(estimate.baseCredits || 0);
  return {
    ...estimate,
    credits: applyUserPricingMultiplierToCredits(originalCredits, multiplier),
    baseCredits: originalBaseCredits,
    originalCredits,
    userPricingMultiplier: multiplier,
    pricingMultiplier: multiplier,
    pricingChannel: channel,
  };
}

function sellingCredits(value) {
  return creditsAmount(Number(value || 0) * GENERATION_PRICE_MARKUP);
}

function costBreakdown(baseCredits, source = "") {
  const base = creditsAmount(baseCredits);
  const credits = sellingCredits(base);
  return {
    credits,
    baseCredits: base,
    markup: GENERATION_PRICE_MARKUP,
    source,
  };
}

function fixedCreditsBreakdown(credits, source = "") {
  const amount = creditsAmount(credits);
  return {
    credits: amount,
    baseCredits: amount,
    markup: 1,
    source,
  };
}

function fixedCnyPricingEstimate(cny, source = "", details = {}, creditsPerCny = ADVANCED_CREDITS_PER_CNY) {
  const baseCredits = creditsAmount(Number(cny || 0) * Number(creditsPerCny || ADVANCED_CREDITS_PER_CNY));
  return {
    ...fixedCreditsBreakdown(baseCredits, source ? `${source}_sale_price` : "fixed_sale_price"),
    baseCredits,
    originalCredits: baseCredits,
    userPricingMultiplier: 1,
    pricingMultiplier: 1,
    ...details,
  };
}

