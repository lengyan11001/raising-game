async function handleListChatLiveRoomMessages(req, res, roomId = "") {
  const auth = await requireUser(req, res);
  if (!auth) return;
  const room = await getChatLiveRoomInDb(roomId);
  if (!room || room.enabled === false) return sendJson(res, 404, { ok: false, message: "房间不存在或已关闭。" });
  const messages = await listChatLiveRoomMessagesInDb(roomId, 100);
  return sendJson(res, 200, { ok: true, messages });
}

async function handleChatLiveRoomMessage(req, res, roomId = "") {
  const auth = await requireUser(req, res);
  if (!auth) return;
  const room = await getChatLiveRoomInDb(roomId);
  if (!room || room.enabled === false || room.status !== "active") return sendJson(res, 404, { ok: false, message: "房间不存在或已关闭。" });
  const body = await readJson(req);
  const content = String(body.content || body.text || "").trim().slice(0, 500);
  if (!content) return sendJson(res, 422, { ok: false, message: "消息不能为空。" });
  await upsertChatLiveRoomMemberInDb({ roomId, userId: auth.user.id, role: "viewer" });
  const subscription = await getUserSubscriptionInDb(auth.user.id, requestTenantId(req));
  const member = liveMembershipActive(subscription);
  const message = await insertChatLiveRoomMessageInDb({
    roomId,
    userId: auth.user.id,
    role: "user",
    content,
    payload: {
      name: String(auth.user.username || auth.user.nickname || "我").slice(0, 40),
      member,
      isMember: member,
    },
  });
  return sendJson(res, 201, { ok: true, message });
}

async function handlePublicChatLiveCharacters(req, res) {
  const config = await readAppConfig();
  const live = chatLiveConfigValue(config);
  if (!live.enabled) return sendJson(res, 200, { ok: true, enabled: false, characters: [], looks: [], gifts: [], pricing: livePricingView(live) });
  const auth = await getAuth(req, { loadDb: false });
  if (auth.quarantined) return sendJson(res, 403, { ok: false, code: "ACCOUNT_QUARANTINED", message: "This account is under security review. Please contact support." });
  const subscription = auth?.user ? await getUserSubscriptionInDb(auth.user.id, requestTenantId(req)) : null;
  const hasMembership = liveMembershipActive(subscription);
  const characters = (await listChatLiveCharactersInDb({ includeDisabled: false }))
    .filter((character) => publicChatLiveCharacterIsVisible(character, auth?.user || null));
  return sendJson(res, 200, {
    ok: true,
    enabled: true,
    pricing: livePricingView(live),
    membership: { active: hasMembership, plans: (await listBillingPlansInDb(requestTenantId(req))).filter((plan) => /^plan-tool-chat-(weekly|monthly|quarterly|yearly)$/.test(plan.id)).map(publicBillingPlan) },
    topupPackages: toolTopupPackagesForPlan((await listBillingPlansInDb(requestTenantId(req))).find((plan) => /^plan-tool-chat-(weekly|monthly|quarterly|yearly)$/.test(plan.id)) || null),
    characters: characters.map((character) => ({ ...publicChatLiveCharacterForRequest(character, hasMembership, auth?.user || null), privateResources: publicChatLivePrivateResources(character, hasMembership) })),
    looks: enabledChatLiveLooks(live),
    gifts: enabledChatLiveGifts(live),
  });
}

async function handlePublicChatLiveCharacter(req, res, characterId = "") {
  const id = String(characterId || "").trim();
  if (!id) return sendJson(res, 400, { ok: false, message: "缺少角色 ID。" });
  const config = await readAppConfig();
  const live = chatLiveConfigValue(config);
  if (!live.enabled) return sendJson(res, 404, { ok: false, message: "角色不存在或已关闭。" });
  const auth = await getAuth(req, { loadDb: false });
  if (auth.quarantined) return sendJson(res, 403, { ok: false, code: "ACCOUNT_QUARANTINED", message: "This account is under security review. Please contact support." });
  const character = await getChatLiveCharacterInDb(id);
  if (!character || character.deletedAt || !publicChatLiveCharacterIsVisible(character, auth?.user || null)) {
    return sendJson(res, 404, { ok: false, code: "CHAT_LIVE_CHARACTER_NOT_FOUND", message: "角色不存在或未公开。" });
  }
  const subscription = auth?.user ? await getUserSubscriptionInDb(auth.user.id, requestTenantId(req)) : null;
  const hasMembership = liveMembershipActive(subscription);
  return sendJson(res, 200, {
    ok: true,
    character: {
      ...publicChatLiveCharacterForRequest(character, hasMembership, auth?.user || null),
      privateResources: publicChatLivePrivateResources(character, hasMembership),
    },
  });
}

function livePricingView(live = {}) {
  return {
    enabled: live.enabled !== false,
    costCreditsPerMinute: Number(live.costCreditsPerMinute || 0),
    saleCreditsPerMinute: Number(live.saleCreditsPerMinute || 0),
    sharedRoomSaleCreditsPerMinute: chatLiveSharedRoomSaleCredits(live),
    textMessageCredits: CHAT_MESSAGE_CREDITS,
    freeSeconds: Number(live.freeSeconds || 0),
    maxMinutes: Number(live.maxMinutes || 10),
    callMode: live.callMode || "video",
    defaultMode: live.defaultMode === "component" ? "component" : "realtime",
    languageModel: live.languageModel === "papaya" ? "papaya" : "byteplus",
    model: live.model || VIDU_LIVE_MODEL,
    videoChatEnabled: live.videoChatEnabled !== false,
    region: live.region === "cn" ? "cn" : "overseas",
  };
}

async function handleAdminChatLiveGifts(req, res) {
  const auth = await requireAdmin(req, res, { loadDb: false }); if (!auth) return;
  const live = chatLiveConfigValue(await readAppConfig());
  return sendJson(res, 200, { ok: true, gifts: live.gifts });
}
async function handleAdminSaveChatLiveGift(req, res, giftId = "") {
  const auth = await requireAdmin(req, res); if (!auth) return;
  const body = await readJson(req); const live = chatLiveConfigValue(await readAppConfig());
  const id = String(giftId || body.id || "").trim(); const existing = id ? live.gifts.find((item) => item.id === id) : null;
  if (id && !existing) return sendJson(res, 404, { ok: false, message: "礼物不存在。" });
  if (!existing && live.gifts.length >= CHAT_LIVE_GIFT_LIMIT) return sendJson(res, 422, { ok: false, message: "礼物最多配置 5 个。" });
  const imageUrl = String(body.imageUrl ?? existing?.imageUrl ?? "").trim();
  if (imageUrl && !isManagedChatLiveAssetUrl(imageUrl) && !isPublicChatLiveGiftAssetUrl(imageUrl)) return sendJson(res, 422, { ok: false, message: "请上传站内 GIF 素材。" });
  const now = new Date().toISOString();
  const gift = normalizeChatLiveGift({ ...existing, ...body, id: id || randomId("gift"), imageUrl, createdAt: existing?.createdAt || now, updatedAt: now }, existing ? live.gifts.indexOf(existing) : live.gifts.length);
  const gifts = existing ? live.gifts.map((item) => item.id === existing.id ? gift : item) : live.gifts.concat(gift);
  const saved = await writeChatLiveConfig({ ...live, gifts });
  return sendJson(res, 200, { ok: true, gift: saved.gifts.find((item) => item.id === gift.id) || gift });
}
async function handleAdminDeleteChatLiveGift(req, res, giftId = "") {
  const auth = await requireAdmin(req, res); if (!auth) return;
  const live = chatLiveConfigValue(await readAppConfig());
  if (!live.gifts.some((item) => item.id === giftId)) return sendJson(res, 404, { ok: false, message: "礼物不存在。" });
  await writeChatLiveConfig({ ...live, gifts: live.gifts.filter((item) => item.id !== giftId) });
  return sendJson(res, 200, { ok: true });
}

async function handleAdminUploadChatLiveAsset(req, res, options = {}) {
  const auth = options.auth || await requireAdmin(req, res);
  if (!auth) return;
  const body = await readJson(req);
  let decoded;
  const requestedKind = String(body.kind || "avatar");
  try {
    if (requestedKind === "ambient-music") {
      decoded = decodeAudioDataUrl(body.dataUrl || "");
    } else {
      decoded = requestedKind === "private-video" ? decodeWanMediaDataUrl(body.dataUrl || "") : decodeImageDataUrl(body.dataUrl || "");
    }
  } catch {
    return sendJson(res, 400, { ok: false, message: requestedKind === "private-video" ? "只支持 MP4、WEBM 视频。" : (requestedKind === "ambient-music" ? "只支持 MP3、WAV、OGG、M4A 音频。" : "只支持 PNG、JPG、WEBP、GIF 图片。") });
  }
  const allowedMimes = requestedKind === "private-video" ? ["video/mp4", "video/webm", "video/quicktime"] : (requestedKind === "ambient-music" ? ["audio/mpeg", "audio/wav", "audio/ogg", "audio/mp4"] : ["image/png", "image/jpeg", "image/webp", "image/gif"]);
  if (!allowedMimes.includes(decoded.mime)) {
    return sendJson(res, 400, { ok: false, message: "只支持 PNG、JPG、WEBP、GIF 图片。" });
  }
  if (decoded.bytes.byteLength > (requestedKind === "private-video" ? 80 : (requestedKind === "ambient-music" ? 15 : 8)) * 1024 * 1024) {
    return sendJson(res, 400, { ok: false, message: requestedKind === "private-video" ? "视频不能超过 80MB。" : (requestedKind === "ambient-music" ? "音频不能超过 15MB。" : "图片不能超过 8MB。") });
  }
  if (decoded.bytes.byteLength < 32) {
    return sendJson(res, 400, { ok: false, message: "图片内容无效。" });
  }
  const kind = requestedKind === "private-video" ? "private-video" : (requestedKind === "ambient-music" ? "ambient-music" : (requestedKind === "private-image" ? "private-image" : (requestedKind === "portrait" ? "portrait" : (requestedKind === "look" ? "look" : (requestedKind === "gift" ? "gift" : "avatar")))));
  const ext = requestedKind === "private-video" ? ".mp4" : (requestedKind === "ambient-music" ? audioExtFromMime(decoded.mime) : imageExtFromMime(decoded.mime));
  const stamp = `${Date.now().toString(36)}-${crypto.randomBytes(4).toString("hex")}`;
  const key = `${String(OBJECT_STORAGE_KEY_PREFIX || "seedance-assets/raising-game").replace(/^\/+|\/+$/g, "")}/chat-live/${kind}-${stamp}${ext}`;
  try {
    const uploaded = await uploadStaticAssetToR2({ key, bytes: decoded.bytes, mime: decoded.mime });
    if (!isManagedChatLiveAssetUrl(uploaded.publicUrl)) {
      return sendJson(res, 502, { ok: false, message: "素材已上传，但公网地址不可用。" });
    }
    return sendJson(res, 200, { ok: true, url: uploaded.publicUrl, kind });
  } catch (error) {
    return sendJson(res, error.statusCode || 502, { ok: false, message: "素材上传到 R2 失败，请稍后再试。" });
  }
}

async function handleAdminChatLiveCharacters(req, res) {
  const auth = await requireAdmin(req, res, { loadDb: false });
  if (!auth) return;
  const config = await readAppConfig();
  const live = chatLiveConfigValue(config);
  const characters = (await listChatLiveCharactersInDb({ includeDisabled: true }))
    .filter((character) => character?.source !== "community");
  return sendJson(res, 200, {
    ok: true,
    pricing: livePricingView(live),
    characters: characters.map((item) => ({ ...item, looks: normalizeChatLiveLooks(item.looks) })),
    looks: live.looks,
    gifts: live.gifts,
    defaults: {
      model: live.model,
      callMode: live.callMode,
      voiceProvider: "qwen_omni",
      viduRegion: live.region === "cn" ? "cn" : "overseas",
      viduConfigured: Boolean(viduCredentialsForRegion(live.region).key),
      regions: {
        overseas: { configured: Boolean(VIDU_API_KEY_OVERSEAS) },
        cn: { configured: Boolean(VIDU_API_KEY_CN) },
      },
    },
  });
}

function creatorOwnsChatLiveCharacter(character, user) {
  return Boolean(character)
    && character.source !== "community"
    && String(character.createdByUserId || "") === String(user?.id || "");
}

function communityChatLiveCharacterIsPublic(character = {}) {
  return character?.source === "community"
    && character?.communityShareEnabled === true
    && character?.communityVisibility === "public"
    && character?.enabled !== false
    && !character?.embedMerchantId;
}

function publicChatLiveCharacterIsPubliclyListed(character = {}) {
  if (character?.embedMerchantId) return false;
  if (character?.source === "community") return communityChatLiveCharacterIsPublic(character);
  return character?.enabled !== false;
}

function publicChatLiveCharacterIsVisible(character = {}, user = null) {
  if (publicChatLiveCharacterIsPubliclyListed(character)) return true;
  return Boolean(user?.id)
    && character?.source === "community"
    && String(character?.createdByUserId || "") === String(user.id);
}

function creatorChatLiveCharacterView(character = {}) {
  return {
    id: character.id,
    name: character.name || "",
    intro: character.intro || "",
    avatarUrl: character.avatarUrl || "",
    portraitUrl: character.portraitUrl || "",
    age: Number(character.age || 0) || 0,
    occupation: character.occupation || "",
    language: character.language || "zh",
    tags: Array.isArray(character.tags) ? character.tags : [],
    gender: character.gender || "",
    communityVisibility: character.communityVisibility === "public" ? "public" : "private",
    communityShareEnabled: character.communityShareEnabled === true,
    sortOrder: Number(character.sortOrder || 0) || 0,
    greeting: character.greeting || "",
    linkName: character.linkName || "",
    mode: character.mode || "",
    personaEnhance: character.personaEnhance === true,
    sharedRoomEnabled: character.sharedRoomEnabled === true,
    enabled: character.enabled !== false,
    personaMd: character.personaMd || character.persona || "",
    replyStyle: character.replyStyle || "",
    personaSourceFile: character.personaSourceFile || "",
    voiceType: character.voiceType || "",
    componentVoiceType: character.componentVoiceType || "",
    richVoiceProvider: character.richVoiceProvider || "",
    richVoiceModel: character.richVoiceModel || "",
    richVoiceType: character.richVoiceType || "",
    richVoiceLabel: character.richVoiceLabel || "",
    richVoiceInstruction: character.richVoiceInstruction || "",
    voiceProvider: character.voiceProvider || "",
    album: Array.isArray(character.album) ? character.album : [],
    undressStatus: character.undressStatus || "",
    undressImageUrl: character.undressStatus === "ready" ? (character.undressImageUrl || "") : "",
    undressError: character.undressError || "",
    createdByUserId: character.createdByUserId || "",
    createdByUsername: character.createdByUsername || "",
    createdAt: character.createdAt || "",
    updatedAt: character.updatedAt || "",
  };
}

async function handleCreatorChatLiveCharacters(req, res) {
  const auth = await requireUser(req, res);
  if (!auth) return;
  const userId = String(auth.user?.id || "");
  const characters = (await listChatLiveCharactersInDb({ includeDisabled: true }))
    .filter((item) => item?.source !== "community" && String(item?.createdByUserId || "") === userId)
    .map(creatorChatLiveCharacterView);
  return sendJson(res, 200, { ok: true, characters });
}

function communityChatLiveCharacterView(character = {}) {
  return {
    ...creatorChatLiveCharacterView(character),
    communityVisibility: character.communityVisibility === "public" ? "public" : "private",
    communityShareEnabled: character.communityShareEnabled === true,
  };
}

function communityOwnsChatLiveCharacter(character, user) {
  return Boolean(character)
    && character.source === "community"
    && String(character.createdByUserId || "") === String(user?.id || "");
}

async function handleCommunityChatLiveCharacters(req, res) {
  const auth = await requireUser(req, res);
  if (!auth) return;
  const userId = String(auth.user?.id || "");
  const characters = (await listChatLiveCharactersInDb({ includeDisabled: true }))
    .filter((item) => item?.source === "community" && String(item?.createdByUserId || "") === userId)
    .map(communityChatLiveCharacterView);
  return sendJson(res, 200, { ok: true, characters });
}

async function handleCommunityDeleteChatLiveCharacter(req, res, characterId = "") {
  const auth = await requireUser(req, res);
  if (!auth) return;
  const id = String(characterId || "").trim();
  if (!id) return sendJson(res, 400, { ok: false, message: "缺少角色 ID。" });
  const existing = await getChatLiveCharacterInDb(id);
  if (!existing || existing.deletedAt) return sendJson(res, 404, { ok: false, message: "角色不存在。" });
  if (!communityOwnsChatLiveCharacter(existing, auth.user)) {
    return sendJson(res, 403, { ok: false, message: "只能删除自己创作的角色。" });
  }
  const removed = await softDeleteChatLiveCharacterInDb(id);
  if (!removed) return sendJson(res, 404, { ok: false, message: "角色不存在。" });
  return sendJson(res, 200, { ok: true, character: communityChatLiveCharacterView(removed) });
}

async function handleCommunitySaveChatLiveCharacter(req, res, characterId = "") {
  const auth = await requireUser(req, res);
  if (!auth) return;
  const body = await readJson(req);
  const id = String(characterId || body.id || "").trim();
  const existing = id ? await getChatLiveCharacterInDb(id) : null;
  if (id && !existing) return sendJson(res, 404, { ok: false, message: "角色不存在。" });
  if (existing && !communityOwnsChatLiveCharacter(existing, auth.user)) {
    return sendJson(res, 403, { ok: false, message: "只能修改创作页创建的角色。" });
  }
  if (!existing) {
    const owned = (await listChatLiveCharactersInDb({ includeDisabled: true }))
      .filter((item) => String(item?.createdByUserId || "") === String(auth.user?.id || "") && item?.communityShareEnabled === true);
    if (owned.length >= 30) return sendJson(res, 422, { ok: false, message: "最多创建 30 个角色。" });
  }
  const requestedVisibility = String(body.visibility ?? body.communityVisibility ?? existing?.communityVisibility ?? "private").trim().toLowerCase();
  const communityVisibility = requestedVisibility === "public" ? "public" : "private";
  const requestedComponentVoice = String(body.componentVoiceType ?? body.component_voice_type ?? existing?.componentVoiceType ?? "").trim();
  if (!requestedComponentVoice) return sendJson(res, 422, { ok: false, code: "CHAT_LIVE_COMPONENT_VOICE_REQUIRED", message: "请选择一个角色声音。" });
  if (!CHAT_LIVE_COMPONENT_VOICE_ALLOWLIST.has(requestedComponentVoice)) {
    return sendJson(res, 422, { ok: false, code: "CHAT_LIVE_COMPONENT_VOICE_INVALID", message: "这个角色声音不可用，请重新选择。" });
  }
  /* Community-created characters always use the component voice path. The
     legacy realtime voice fields are mirrored for runtime compatibility, but
     the client cannot select or override them. */
  const payload = normalizeChatLiveCharacterPayload({
    ...body,
    mode: "component",
    voiceType: requestedComponentVoice,
    voiceProvider: "dashscope_cosyvoice",
    componentVoiceType: requestedComponentVoice,
    communityVisibility,
    communityShareEnabled: true,
  }, existing);
  payload.communityVisibility = communityVisibility;
  payload.communityShareEnabled = true;
  payload.enabled = communityVisibility === "public";
  const invalid = chatLiveCharacterValidationError(payload, existing);
  if (invalid) return sendJson(res, 422, { ok: false, code: "INVALID_CHAT_LIVE_CHARACTER", message: invalid });
  const now = new Date().toISOString();
  const character = {
    ...(existing || {}),
    ...payload,
    id: existing?.id || randomId("chatlive-char"),
    createdAt: existing?.createdAt || now,
    updatedAt: now,
    updatedBy: auth.user?.username || auth.user?.id || "",
    createdByUserId: existing?.createdByUserId || auth.user?.id || "",
    createdByUsername: existing?.createdByUsername || auth.user?.username || auth.user?.nickname || "",
    source: "community",
  };
  if (String(existing?.avatarUrl || "") !== String(payload.avatarUrl || "")) {
    character.undressImageUrl = "";
    character.undressSourceAvatarUrl = "";
    character.undressStatus = "";
    character.undressError = "";
    character.undressGeneratedAt = "";
    character.undressStartedAt = "";
    character.undressTaskId = "";
  }
  const saved = await upsertChatLiveCharacterInDb(character);
  return sendJson(res, 200, { ok: true, character: communityChatLiveCharacterView(saved) });
}

async function handleCommunityAutoProfileChatLiveCharacter(req, res) {
  const auth = await requireUser(req, res);
  if (!auth) return;
  const body = await readJson(req, 2 * 1024 * 1024).catch(() => ({}));
  const imageUrl = String(body.imageUrl || body.avatarUrl || "").trim();
  if (!imageUrl) return sendJson(res, 422, { ok: false, code: "CHAT_LIVE_AUTO_PROFILE_IMAGE_REQUIRED", message: "请先上传角色形象图，再自动生成。" });
  if (!isManagedChatLiveAssetUrl(imageUrl)) {
    return sendJson(res, 422, { ok: false, code: "CHAT_LIVE_AUTO_PROFILE_IMAGE_INVALID", message: "角色形象图无效，请重新上传后再试。" });
  }
  const chatLive = chatLiveConfigValue(await readAppConfig());
  const usePapayaChat = chatLive.languageModel === "papaya";
  if (usePapayaChat && !String(process.env.MULEROUTER_API_KEY || "").trim()) {
    return sendJson(res, 503, { ok: false, code: "MISSING_MULEROUTER_API_KEY", message: "AI 角色生成还没有配置，请联系管理员。" });
  }
  if (!usePapayaChat && !ARK_API_KEY) {
    return sendJson(res, 503, { ok: false, code: "MISSING_ARK_API_KEY", message: "AI 角色生成还没有配置，请联系管理员。" });
  }
  const name = String(body.name || "").trim().slice(0, 12);
  const gender = ["female", "male"].includes(String(body.gender || "").trim().toLowerCase()) ? String(body.gender).trim().toLowerCase() : "";
  const tags = normalizeChatLiveTags(body.tags).slice(0, 3);
  const prompt = chatLiveCharacterAutoProfilePrompt({ name, gender, tags });
  const chatModel = usePapayaChat ? PAPAYA_MODEL : BYTEPLUS_LANGUAGE_MODEL;
  const requestBody = {
    model: chatModel,
    messages: [{
      role: "user",
      content: [
        { type: "image_url", image_url: { url: imageUrl } },
        { type: "text", text: prompt },
      ],
    }],
    temperature: 0.7,
    max_tokens: 800,
  };
  let payload = {};
  try {
    payload = await (usePapayaChat
      ? papayaLanguageRequest(requestBody, { timeoutMs: 60000 })
      : byteplusLanguageRequest(requestBody, { timeoutMs: 60000 }));
  } catch (error) {
    console.warn("[chat-live-auto-profile]", JSON.stringify({ userId: auth.user?.id || "", model: chatModel, statusCode: error?.statusCode || 0, code: error?.code || "CHAT_MODEL_REQUEST_FAILED", message: String(error?.message || error).slice(0, 180) }));
    const statusCode = Number(error?.statusCode || 0);
    if (statusCode === 429) return sendJson(res, 424, { ok: false, code: "CHAT_LIVE_AUTO_PROFILE_UPSTREAM_REJECTED", message: "图片理解请求太频繁，请稍后再试。" });
    return sendJson(res, statusCode >= 400 && statusCode < 500 ? statusCode : 502, { ok: false, code: "CHAT_LIVE_AUTO_PROFILE_UPSTREAM_FAILED", message: "聊天模型暂时无法生成角色内容，请稍后重试。" });
  }
  try {
    const profile = parseChatLiveCharacterAutoProfile(qwen37FlashResponseText(payload));
    return sendJson(res, 200, { ok: true, profile });
  } catch (error) {
    return sendJson(res, Number(error.statusCode || 424), { ok: false, code: error.code || "CHAT_LIVE_AUTO_PROFILE_INVALID_RESPONSE", message: error.message || "AI 生成结果不可用，请重试。" });
  }
}

async function handleCreatorSaveChatLiveCharacter(req, res, characterId = "") {
  const auth = await requireUser(req, res);
  if (!auth) return;
  const body = await readJson(req);
  const id = String(characterId || "").trim();
  const existing = id ? await getChatLiveCharacterInDb(id) : null;
  if (id && !existing) return sendJson(res, 404, { ok: false, message: "角色不存在。" });
  if (existing && !creatorOwnsChatLiveCharacter(existing, auth.user)) {
    return sendJson(res, 403, { ok: false, message: "只能修改自己创建的角色。" });
  }
  if (existing?.communityShareEnabled === true) {
    return sendJson(res, 409, { ok: false, message: "创作页创建的角色请在「创作」页维护。" });
  }
  if (!existing) {
    const owned = (await listChatLiveCharactersInDb({ includeDisabled: true }))
      .filter((item) => String(item?.createdByUserId || "") === String(auth.user?.id || "") && item?.communityShareEnabled !== true);
    if (owned.length >= 30) return sendJson(res, 422, { ok: false, message: "最多创建 30 个内部角色。" });
  }
  const requestedComponentVoice = String(body.componentVoiceType ?? body.component_voice_type ?? existing?.componentVoiceType ?? "").trim();
  if (!requestedComponentVoice) return sendJson(res, 422, { ok: false, code: "CHAT_LIVE_COMPONENT_VOICE_REQUIRED", message: "请选择一个角色声音。" });
  if (!CHAT_LIVE_COMPONENT_VOICE_ALLOWLIST.has(requestedComponentVoice)) {
    return sendJson(res, 422, { ok: false, code: "CHAT_LIVE_COMPONENT_VOICE_INVALID", message: "这个角色声音不可用，请重新选择。" });
  }
  const payload = normalizeChatLiveCharacterPayload({
    ...body,
    mode: "component",
    voiceType: requestedComponentVoice,
    voiceProvider: "dashscope_cosyvoice",
    componentVoiceType: requestedComponentVoice,
  }, existing);
  payload.enabled = existing ? existing.enabled !== false : false;
  /* Internal creator-center characters are never community royalty sources. */
  payload.communityShareEnabled = false;
  payload.communityVisibility = "private";
  const invalid = chatLiveCharacterValidationError(payload, existing);
  if (invalid) return sendJson(res, 422, { ok: false, code: "INVALID_CHAT_LIVE_CHARACTER", message: invalid });
  const now = new Date().toISOString();
  const character = {
    ...(existing || {}),
    ...payload,
    id: existing?.id || randomId("chatlive-char"),
    createdAt: existing?.createdAt || now,
    updatedAt: now,
    updatedBy: auth.user?.username || auth.user?.id || "",
    createdByUserId: existing?.createdByUserId || auth.user?.id || "",
    createdByUsername: existing?.createdByUsername || auth.user?.username || auth.user?.nickname || "",
    source: "creator",
  };
  if (String(existing?.avatarUrl || "") !== String(payload.avatarUrl || "")) {
    character.undressImageUrl = "";
    character.undressSourceAvatarUrl = "";
    character.undressStatus = "";
    character.undressError = "";
    character.undressGeneratedAt = "";
    character.undressStartedAt = "";
    character.undressTaskId = "";
  }
  const saved = await upsertChatLiveCharacterInDb(character);
  return sendJson(res, 200, { ok: true, character: creatorChatLiveCharacterView(saved) });
}

async function handleCreatorUploadChatLiveAsset(req, res) {
  const auth = await requireUser(req, res);
  if (!auth) return;
  return handleAdminUploadChatLiveAsset(req, res, { auth });
}

async function handleCreatorChatLiveVoices(req, res, url) {
  const auth = await requireUser(req, res);
  if (!auth) return;
  return handleAdminChatLiveVoices(req, res, url, { auth });
}

const CHAT_LIVE_VOICE_DISPLAY = {
  Tina: { style: "甜美", gender: "女声", title: "甜美 · 女声", desc: "甜暖亲昵，适合恋爱陪伴" },
  Cindy: { style: "可爱", gender: "女声", title: "可爱 · 女声", desc: "软糯俏皮，适合撒娇互动" },
  "Liora Mira": { style: "温柔", gender: "女声", title: "温柔 · 女声", desc: "轻声细语，适合安静倾诉" },
  Sunnybobi: { style: "元气", gender: "女声", title: "元气 · 女声", desc: "活泼直率，像熟悉的邻家女孩" },
  Raymond: { style: "清爽", gender: "男声", title: "清爽 · 男声", desc: "清亮自然，适合轻松日常聊天" },
  Ethan: { style: "阳光", gender: "男声", title: "阳光 · 男声", desc: "温暖有活力，像开朗的大男孩" },
  "Theo Calm": { style: "治愈", gender: "男声", title: "治愈 · 男声", desc: "平静温和，适合倾听和安慰" },
  Serena: { style: "温柔", gender: "女声", title: "温柔 · 女声", desc: "成熟柔和，适合慢节奏陪伴" },
  Harvey: { style: "低沉", gender: "男声", title: "低沉磁性 · 男声", desc: "沉稳成熟，有故事感" },
  Maia: { style: "知性", gender: "女声", title: "知性 · 女声", desc: "温柔从容，适合深入交流" },
  Evan: { style: "少年", gender: "男声", title: "少年感 · 男声", desc: "年轻亲近，像黏人的年下男友" },
  Qiao: { style: "俏皮", gender: "女声", title: "俏皮 · 女声", desc: "甜妹外表，个性直率有反差" },
  longanyang: { style: "阳光", gender: "男声", title: "阳光 · 男声", desc: "开朗自然，适合日常陪伴" },
  longanhuan: { style: "元气", gender: "女声", title: "元气 · 女声", desc: "欢快有感染力，适合活泼互动" },
  longyingxiao_v3: { style: "甜美", gender: "女声", title: "甜美 · 女声", desc: "甜而不腻，亲和自然" },
  longyingxun_v3: { style: "清新", gender: "男声", title: "清新 · 男声", desc: "年轻自然，像耐心的同龄人" },
  longyingtao_v3: { style: "温柔", gender: "女声", title: "温柔 · 女声", desc: "沉稳柔和，适合安静倾诉" },
  longanli_v3: { style: "清脆", gender: "女声", title: "清脆 · 女声", desc: "明亮沉稳，表达干净利落" },
  longanwen_v3: { style: "知性", gender: "女声", title: "知性 · 女声", desc: "优雅从容，表达清晰" },
  longanlang_v3: { style: "清爽", gender: "男声", title: "清爽 · 男声", desc: "干净年轻，适合轻松聊天" },
  longanzhi_v3: { style: "成熟", gender: "男声", title: "成熟磁性 · 男声", desc: "稳重可靠，语气有分寸" },
  longanqin_v3: { style: "亲和", gender: "女声", title: "亲和 · 女声", desc: "活泼友善，容易拉近距离" },
  longhua_v3: { style: "甜美", gender: "女声", title: "甜美活力 · 女声", desc: "明快甜美，情绪饱满" },
  longwan_v3: { style: "轻柔", gender: "女声", title: "轻柔 · 女声", desc: "细腻轻声，适合私密聊天" },
  longanya_v3: { style: "优雅", gender: "女声", title: "优雅 · 女声", desc: "成熟优雅，语气温柔" },
  longanyun_v3: { style: "温暖", gender: "男声", title: "温暖 · 男声", desc: "居家暖男，语气耐心" },
};

function chatLiveVoiceDisplayMeta(voice = {}, scope = "realtime") {
  const voiceType = String(voice.voiceType || voice.voice_type || "");
  const explicit = CHAT_LIVE_VOICE_DISPLAY[voiceType];
  if (explicit) return explicit;
  const desc = String(voice.desc || voice.description || "").trim();
  const style = /童|儿童|男童|女童/u.test(desc)
    ? "童声"
    : (/甜/u.test(desc) ? "甜美"
      : /温柔|温和/u.test(desc) ? "温柔"
        : /元气|活力|活泼/u.test(desc) ? "元气"
          : /知性|优雅/u.test(desc) ? "知性"
            : /成熟|沉稳/u.test(desc) ? "成熟"
              : /清爽|清亮/u.test(desc) ? "清爽"
                : /低沉|磁性/u.test(desc) ? "低沉磁性"
                  : scope === "component" ? "自然" : "特色");
  const gender = /女/u.test(desc) ? "女声" : /男/u.test(desc) ? "男声" : "";
  return {
    style,
    gender,
    title: [style, gender].filter(Boolean).join(" · "),
    desc: desc.replace(/[，,。].*$/u, "").slice(0, 30) || "自然真实的声音",
  };
}

const CHAT_LIVE_COMPONENT_VOICE_ALLOWLIST = new Set([
  "longanyang", "longanhuan", "longyingxiao_v3", "longyingxun_v3",
  "longyingtao_v3", "longanyun_v3", "longanwen_v3", "longanli_v3",
  "longanlang_v3", "longyingmu_v3", "longhua_v3", "longwan_v3",
  "longanzhi_v3", "longanya_v3", "longanqin_v3", "longwanjun_v3",
  "longyichen_v3", "longdaiyu_v3", "longanxuan_v3",
]);

function filterChatLiveComponentVoiceCatalog(list = []) {
  return (Array.isArray(list) ? list : []).filter((voice) => {
    const voiceType = String(voice?.voiceType || voice?.voice_type || "");
    return voiceType
      && String(voice?.provider || "") === "dashscope_cosyvoice"
      && CHAT_LIVE_COMPONENT_VOICE_ALLOWLIST.has(voiceType);
  }).map((voice) => ({
    ...voice,
    ...chatLiveVoiceDisplayMeta(voice, "component"),
    preview: true,
  }));
}

async function readChatLiveVoiceCatalog(scope = "realtime") {
  const live = chatLiveConfigValue(await readAppConfig());
  const catalogScope = scope === "component" ? "component" : "realtime";
  const region = live.region === "cn" ? "cn" : "overseas";
  /* User-created characters use the component voice path. Realtime catalog
     entries are intentionally not exposed because no exact preview exists. */
  if (catalogScope !== "component") return { region, scope: catalogScope, voices: [] };
  const parsed = await listCatalogEntriesFromDb("chat_live_voices", { scope: "component" });
  const voices = filterChatLiveComponentVoiceCatalog(parsed || []);
  return { region, scope: catalogScope, voices };
}

const chatLiveVoicePreviewCache = new Map();
const CHAT_LIVE_VOICE_PREVIEW_TTL_MS = 30 * 60 * 1000;
const CHAT_LIVE_VOICE_PREVIEW_LIMIT = 32;

function cachedChatLiveVoicePreview(key = "") {
  const hit = chatLiveVoicePreviewCache.get(key);
  if (!hit) return null;
  if (hit.expiresAt < Date.now()) {
    chatLiveVoicePreviewCache.delete(key);
    return null;
  }
  return hit;
}

function cacheChatLiveVoicePreview(key = "", audio = null) {
  if (!key || !audio?.buffer?.length) return;
  chatLiveVoicePreviewCache.set(key, { ...audio, expiresAt: Date.now() + CHAT_LIVE_VOICE_PREVIEW_TTL_MS });
  while (chatLiveVoicePreviewCache.size > CHAT_LIVE_VOICE_PREVIEW_LIMIT) {
    chatLiveVoicePreviewCache.delete(chatLiveVoicePreviewCache.keys().next().value);
  }
}

async function handleCreatorChatLiveVoicePreview(req, res) {
  const auth = await requireUser(req, res);
  if (!auth) return;
  const body = await readJson(req);
  const scope = String(body.scope || "component");
  if (scope !== "component") {
    return sendJson(res, 422, { ok: false, code: "VOICE_SCOPE_UNSUPPORTED", message: "用户创建角色只使用组件音色，实时音色不可试听。" });
  }
  const voiceType = String(body.voiceType || body.voice_type || "").trim();
  if (!voiceType) return sendJson(res, 422, { ok: false, code: "VOICE_REQUIRED", message: "请选择一个声音后再试听。" });
  let catalog;
  try {
    catalog = await readChatLiveVoiceCatalog(scope);
  } catch (error) {
    return sendJson(res, 503, { ok: false, code: "VOICE_CATALOG_UNAVAILABLE", message: "声音清单暂时不可用。" });
  }
  const voice = catalog.voices.find((item) => String(item.voiceType || "") === voiceType);
  if (!voice) return sendJson(res, 422, { ok: false, code: "VOICE_NOT_AVAILABLE", message: "这个声音当前不可用，请重新选择。" });
  const cacheKey = `${catalog.region}:${scope}:${voice.provider}:${voiceType}`;
  let audio = cachedChatLiveVoicePreview(cacheKey);
  if (!audio) {
    try {
      audio = { buffer: await chatLiveComponent.__test.componentVoicePreviewWav("你好呀，今天想和我聊点什么？", voiceType), mime: "audio/wav" };
      cacheChatLiveVoicePreview(cacheKey, audio);
    } catch (error) {
      console.warn("[chat-live-voice-preview] failed", JSON.stringify({ scope, provider: voice.provider, voiceType, region: catalog.region, message: String(error?.message || error).slice(0, 180) }));
      return sendJson(res, 503, { ok: false, code: "VOICE_PREVIEW_UNAVAILABLE", message: "这个声音暂时无法试听，请换一个或稍后再试。" });
    }
  }
  res.writeHead(200, {
    "content-type": audio.mime || "audio/wav",
    "content-length": audio.buffer.length,
    "cache-control": "private, max-age=1800",
    "x-content-type-options": "nosniff",
  });
  res.end(audio.buffer);
}

async function handleAdminChatLiveVoicePreview(req, res) {
  const auth = await requireAdmin(req, res);
  if (!auth) return;
  const body = await readJson(req);
  const characterId = String(body.characterId || body.id || "").trim();
  const character = characterId ? await getChatLiveCharacterInDb(characterId) : null;
  if (!character) return sendJson(res, 404, { ok: false, code: "CHAT_LIVE_CHARACTER_NOT_FOUND", message: "角色不存在。" });
  const savedRich = {
    richVoiceProvider: character.richVoiceProvider,
    richVoiceModel: character.richVoiceModel,
    richVoiceType: character.richVoiceType,
    richVoiceLabel: character.richVoiceLabel,
    richVoiceInstruction: character.richVoiceInstruction,
  };
  let richVoice;
  try {
    richVoice = chatLiveComponent.__test.componentRichVoiceConfig(savedRich);
  } catch (error) {
    return sendJson(res, 422, { ok: false, code: "RICH_VOICE_INVALID", message: error.message });
  }
  if (!richVoice) return sendJson(res, 422, { ok: false, code: "RICH_VOICE_NOT_CONFIGURED", message: "这个角色还没有配置富标签音色。" });
  const cacheKey = `admin-rich:${character.id}:${richVoice.model}:${richVoice.voiceType}`;
  let audio = cachedChatLiveVoicePreview(cacheKey);
  if (!audio) {
    try {
      audio = {
        buffer: await chatLiveComponent.__test.componentVoicePreviewWav(
          chatLiveComponent.__test.COMPONENT_INTIMATE_PREVIEW_TEXT,
          "",
          { richVoice, stage: "intimate" },
        ),
        mime: "audio/wav",
      };
      cacheChatLiveVoicePreview(cacheKey, audio);
    } catch (error) {
      console.warn("[chat-live-rich-preview] failed", JSON.stringify({ characterId, model: richVoice.model, voiceType: richVoice.voiceType, message: String(error?.message || error).slice(0, 180) }));
      return sendJson(res, 503, { ok: false, code: "RICH_VOICE_PREVIEW_UNAVAILABLE", message: "富标签音色试听失败，请检查模型和复刻音色 ID。" });
    }
  }
  res.writeHead(200, {
    "content-type": audio.mime || "audio/wav",
    "content-length": audio.buffer.length,
    "cache-control": "private, max-age=1800",
    "x-content-type-options": "nosniff",
  });
  res.end(audio.buffer);
}

async function handleCreatorGenerateChatLiveUndress(req, res, characterId = "") {
  const auth = await requireUser(req, res);
  if (!auth) return;
  const id = String(characterId || "").trim();
  const character = id ? await getChatLiveCharacterInDb(id) : null;
  if (!character) return sendJson(res, 404, { ok: false, message: "角色不存在。" });
  const isCommunity = character.source === "community";
  const owns = isCommunity
    ? communityOwnsChatLiveCharacter(character, auth.user)
    : creatorOwnsChatLiveCharacter(character, auth.user);
  if (!owns) return sendJson(res, 403, { ok: false, message: "只能操作自己创建的角色。" });
  return handleAdminGenerateChatLiveUndress(req, res, id, { auth, allowCommunity: isCommunity });
}

async function handleAdminSaveChatLiveCharacter(req, res, characterId = "") {
  const auth = await requireAdmin(req, res);
  if (!auth) return;
  const body = await readJson(req);
  const id = String(characterId || body.id || "").trim();
  const existing = id ? await getChatLiveCharacterInDb(id) : null;
  if (characterId && !existing) return sendJson(res, 404, { ok: false, code: "CHAT_LIVE_CHARACTER_NOT_FOUND", message: "角色不存在。" });
  if (existing?.source === "community") {
    return sendJson(res, 409, { ok: false, code: "COMMUNITY_CHARACTER_ADMIN_READONLY", message: "用户创作角色请在「创作」页维护，后台不能修改。" });
  }
  const payload = normalizeChatLiveCharacterPayload(body, existing);
  payload.communityShareEnabled = false;
  payload.communityVisibility = "private";
  await chatLiveConfigValue(await readAppConfig());
  const invalid = chatLiveCharacterValidationError(payload, existing);
  if (invalid) return sendJson(res, 422, { ok: false, code: "INVALID_CHAT_LIVE_CHARACTER", message: invalid });
  const now = new Date().toISOString();
  const character = {
    ...(existing || {}),
    ...payload,
    id: id || randomId("chatlive-char"),
    createdAt: existing?.createdAt || now,
    updatedAt: now,
    updatedBy: auth.user?.username || auth.user?.id || "",
    source: existing?.source || "admin",
  };
  if (String(existing?.avatarUrl || "") !== String(payload.avatarUrl || "")) {
    character.undressImageUrl = "";
    character.undressSourceAvatarUrl = "";
    character.undressStatus = "";
    character.undressError = "";
    character.undressGeneratedAt = "";
    character.undressStartedAt = "";
    character.undressTaskId = "";
  }
  const saved = await upsertChatLiveCharacterInDb(character);
  return sendJson(res, 200, { ok: true, character: saved });
}

async function handleAdminShelfChatLiveCharacter(req, res, characterId = "") {
  const auth = await requireAdmin(req, res);
  if (!auth) return;
  const id = String(characterId || "").trim();
  if (!id) return sendJson(res, 400, { ok: false, message: "缺少角色 ID。" });
  const existing = await getChatLiveCharacterInDb(id);
  if (!existing) return sendJson(res, 404, { ok: false, code: "CHAT_LIVE_CHARACTER_NOT_FOUND", message: "角色不存在。" });
  if (existing.source === "community") return sendJson(res, 409, { ok: false, code: "COMMUNITY_CHARACTER_ADMIN_READONLY", message: "用户创作角色请在「创作」页维护。" });
  const body = await readJson(req).catch(() => ({}));
  const enabled = body && Object.prototype.hasOwnProperty.call(body || {}, "enabled") ? body.enabled !== false : existing.enabled === false;
  const saved = await upsertChatLiveCharacterInDb({
    ...existing,
    enabled,
    updatedAt: new Date().toISOString(),
  });
  return sendJson(res, 200, { ok: true, character: saved, enabled });
}

async function handleAdminDeleteChatLiveCharacter(req, res, characterId = "") {
  const auth = await requireAdmin(req, res);
  if (!auth) return;
  const id = String(characterId || "").trim();
  if (!id) return sendJson(res, 400, { ok: false, message: "缺少角色 ID。" });
  const existing = await getChatLiveCharacterInDb(id);
  if (existing?.source === "community") return sendJson(res, 409, { ok: false, code: "COMMUNITY_CHARACTER_ADMIN_READONLY", message: "用户创作角色请在「创作」页维护。" });
  const removed = await softDeleteChatLiveCharacterInDb(id);
  if (!removed) return sendJson(res, 404, { ok: false, code: "CHAT_LIVE_CHARACTER_NOT_FOUND", message: "角色不存在。" });
  return sendJson(res, 200, { ok: true, character: removed });
}

async function patchChatLiveUndressIfCurrent(characterId, startedAt, patch = {}) {
  const latest = await getChatLiveCharacterInDb(characterId);
  if (!latest) return null;
  if (String(latest.undressStartedAt || "") !== String(startedAt || "")) return null;
  return upsertChatLiveCharacterInDb({
    ...latest,
    ...patch,
    id: latest.id,
    updatedAt: new Date().toISOString(),
  });
}

async function runChatLiveCharacterUndress(characterId, avatarUrl, startedAt) {
  try {
    const config = await readAppConfig();
    const prompt = String(undressPromptForAction("undress", config.undressPrompts) || VIDEO_TOOL_UNDRESS_TARGET_PROMPT).trim();
    if (!prompt) throw new Error("Undress 提示词为空。");
    const imageOptions = wan27ImageRequestOptions({}, {
      defaultModel: normalizeAdvancedPricing(config.platform?.advancedPricing).wan27ImagePro.model || WAN27_IMAGE_PRO_MODEL,
      defaultRatio: "9:16",
      defaultResolution: "2K",
    });
    const submit = USE_GATEWAY_UPSTREAM ? gatewaySubmitWan27ImageEditTask : submitWan27ImageModify;
    const submitted = await submit({
      imageUrls: [avatarUrl],
      prompt,
      ratio: imageOptions.ratio,
      resolution: imageOptions.resolution,
      model: imageOptions.model,
      input: imageOptions.input,
      parameters: imageOptions.parameters,
      waitForResult: false,
    });
    const upstreamTaskId = String(submitted.task?.taskId || "").trim();
    let completed = submitted;
    const immediateUrl = submitted.task?.imageUrls?.[0] || submitted.task?.imageUrl || "";
    if (!immediateUrl) {
      if (!upstreamTaskId) throw new Error("出图没有返回任务号。");
      await patchChatLiveUndressIfCurrent(characterId, startedAt, { undressTaskId: upstreamTaskId });
      completed = await waitForWan27ImageToolTask(upstreamTaskId, { timeoutMs: 15 * 60 * 1000 });
    }
    const remoteUrl = completed.task?.imageUrls?.[0] || completed.task?.imageUrl || "";
    if (!remoteUrl) throw new Error("出图没有返回图片。");
    const downloaded = await downloadRemoteFileToBuffer(remoteUrl, { label: "chat live undress", maxBytes: 20 * 1024 * 1024 });
    let mime = String(downloaded.mime || "").toLowerCase();
    if (!["image/png", "image/jpeg", "image/webp"].includes(mime)) mime = "image/jpeg";
    const stamp = `${Date.now().toString(36)}-${crypto.randomBytes(4).toString("hex")}`;
    const key = `${String(OBJECT_STORAGE_KEY_PREFIX || "seedance-assets/raising-game").replace(/^\/+|\/+$/g, "")}/chat-live/undress-${stamp}${imageExtFromMime(mime)}`;
    const uploaded = await uploadStaticAssetToR2({ key, bytes: downloaded.bytes, mime });
    if (!isManagedChatLiveAssetUrl(uploaded.publicUrl)) throw new Error("生成图公网地址不可用。");
    const latest = await getChatLiveCharacterInDb(characterId);
    if (!latest || String(latest.undressStartedAt || "") !== startedAt) return;
    if (String(latest.avatarUrl || "").trim() !== avatarUrl) {
      await patchChatLiveUndressIfCurrent(characterId, startedAt, {
        undressStatus: "failed",
        undressError: "形象图已更换，这次生成作废。",
        undressImageUrl: "",
        undressGeneratedAt: "",
      });
      return;
    }
    await patchChatLiveUndressIfCurrent(characterId, startedAt, {
      undressStatus: "ready",
      undressError: "",
      undressImageUrl: uploaded.publicUrl,
      undressSourceAvatarUrl: avatarUrl,
      undressGeneratedAt: new Date().toISOString(),
      undressTaskId: upstreamTaskId,
    });
  } catch (error) {
    console.error("[chat-live-undress-failed]", characterId, error?.message || error);
    await patchChatLiveUndressIfCurrent(characterId, startedAt, {
      undressStatus: "failed",
      undressError: chatLiveUndressErrorText(error),
      undressImageUrl: "",
      undressGeneratedAt: "",
    }).catch((patchError) => {
      console.error("[chat-live-undress-status-failed]", characterId, patchError?.message || patchError);
    });
  }
}

async function handleAdminGenerateChatLiveUndress(req, res, characterId = "", options = {}) {
  const auth = options.auth || await requireAdmin(req, res);
  if (!auth) return;
  const id = String(characterId || "").trim();
  const character = id ? await getChatLiveCharacterInDb(id) : null;
  if (!character) return sendJson(res, 404, { ok: false, code: "CHAT_LIVE_CHARACTER_NOT_FOUND", message: "角色不存在。" });
  if (character.source === "community" && options.allowCommunity !== true) {
    return sendJson(res, 409, {
      ok: false,
      code: "COMMUNITY_CHARACTER_ADMIN_READONLY",
      message: "用户创作角色请在「创作」页维护。"
    });
  }
  const avatarUrl = String(character.avatarUrl || "").trim();
  if (!avatarUrl || !isManagedChatLiveAssetUrl(avatarUrl)) {
    return sendJson(res, 422, { ok: false, message: "请先保存形象图，再用上传控件上传。" });
  }
  if (chatLiveUndressJobs.has(id) || chatLiveUndressGenerating(character)) {
    return sendJson(res, 409, { ok: false, message: "Undress 图正在生成，请稍等。" });
  }
  chatLiveUndressJobs.add(id);
  const startedAt = new Date().toISOString();
  try {
    const marked = await upsertChatLiveCharacterInDb({
      ...character,
      undressStatus: "generating",
      undressError: "",
      undressStartedAt: startedAt,
      undressImageUrl: "",
      undressSourceAvatarUrl: avatarUrl,
      undressGeneratedAt: "",
      undressTaskId: "",
      updatedAt: startedAt,
    });
    sendJson(res, 202, { ok: true, character: marked });
  } catch (error) {
    chatLiveUndressJobs.delete(id);
    return sendJson(res, error.statusCode || 502, { ok: false, message: "暂时生成不了，请稍后再试。" });
  }
  void runChatLiveCharacterUndress(id, avatarUrl, startedAt).finally(() => {
    chatLiveUndressJobs.delete(id);
  });
}

async function handleAdminChatLiveVoices(req, res, url = null, options = {}) {
  const auth = options.auth || await requireAdmin(req, res, { loadDb: false });
  if (!auth) return;
  const scope = String(url?.searchParams?.get("scope") || "realtime");
  try {
    const catalog = await readChatLiveVoiceCatalog(scope);
    return sendJson(res, 200, { ok: true, voices: catalog.voices, viduRegion: catalog.region, scope: catalog.scope });
  } catch (error) {
    return sendJson(res, 200, { ok: true, voices: [], message: "音色清单尚未生成。" });
  }
}

async function handleAdminGetChatLivePricing(req, res) {
  const auth = await requireAdmin(req, res, { loadDb: false });
  if (!auth) return;
  const config = await readAppConfig();
  return sendJson(res, 200, { ok: true, pricing: livePricingView(chatLiveConfigValue(config)) });
}

async function handleAdminGetChatLiveMembershipPlans(req, res) {
  const auth = await requireAdmin(req, res, { loadDb: false }); if (!auth) return;
  const tenantId = "tool-chat-5vips";
  return sendJson(res, 200, { ok: true, plans: (await listBillingPlansInDb(tenantId, { includeInactive: true })).filter((plan) => plan.id.startsWith("plan-tool-chat-weekly") || plan.id.startsWith("plan-tool-chat-monthly") || plan.id.startsWith("plan-tool-chat-quarterly") || plan.id.startsWith("plan-tool-chat-yearly")).map(publicBillingPlan) });
}

async function handleAdminSaveChatLiveMembershipPlans(req, res) {
  const auth = await requireAdmin(req, res); if (!auth) return;
  const body = await readJson(req);
  const plans = await updateBillingPlansInDb("tool-chat-5vips", body.plans);
  return sendJson(res, 200, { ok: true, plans: plans.map(publicBillingPlan) });
}

async function handleAdminSaveChatLivePricing(req, res) {
  const auth = await requireAdmin(req, res);
  if (!auth) return;
  const body = await readJson(req);
  const current = await readAppConfig();
  const currentLive = chatLiveConfigValue(current);
  const next = normalizeChatLiveConfig({
    ...currentLive,
    ...(body.pricing && typeof body.pricing === "object" ? body.pricing : body),
    looks: currentLive.looks,
    updatedAt: new Date().toISOString(),
  });
  if (!viduCredentialsForRegion(next.region).key) {
    chatLiveRegionCache = chatLiveConfigValue(current).region;
    const label = next.region === "cn" ? "国内" : "海外";
    return sendJson(res, 422, { ok: false, code: "VIDU_REGION_KEY_MISSING", message: `${label} Vidu 密钥未配置，不能切换。` });
  }
  chatLiveRegionCache = next.region;
  await writeAppConfig({
    ...current,
    platform: normalizePlatformConfig({ ...(current.platform || {}), chatLive: next }),
    updatedAt: new Date().toISOString(),
  });
  return sendJson(res, 200, { ok: true, pricing: livePricingView(next) });
}

async function writeChatLiveConfig(nextLive) {
  const current = await readAppConfig();
  const next = normalizeChatLiveConfig({ ...nextLive, updatedAt: new Date().toISOString() });
  chatLiveRegionCache = next.region === "cn" ? "cn" : "overseas";
  await writeAppConfig({
    ...current,
    platform: normalizePlatformConfig({ ...(current.platform || {}), chatLive: next }),
    updatedAt: new Date().toISOString(),
  });
  return next;
}

async function handleAdminSaveChatLiveLook(req, res, lookId = "") {
  const auth = await requireAdmin(req, res);
  if (!auth) return;
  const body = await readJson(req);
  const live = chatLiveConfigValue(await readAppConfig());
  const id = String(lookId || body.id || "").trim();
  const existing = id ? live.looks.find((item) => item.id === id) : null;
  if (id && !existing) return sendJson(res, 404, { ok: false, message: "素材不存在。" });
  if (!existing && live.looks.length >= CHAT_LIVE_LOOK_LIMIT) {
    return sendJson(res, 422, { ok: false, message: "素材最多 240 个。" });
  }
  const kind = String(body.kind || existing?.kind || "").trim();
  if (!CHAT_LIVE_LOOK_KINDS.includes(kind)) {
    return sendJson(res, 422, { ok: false, message: "请选择类别：换衣服、手里拿东西或换背景。" });
  }
  const name = String(body.name ?? existing?.name ?? "").trim().slice(0, 40);
  if (!name) return sendJson(res, 422, { ok: false, message: "请填写素材名称。" });
  const imageUrl = String(body.imageUrl ?? existing?.imageUrl ?? "").trim().slice(0, 600);
  const imageError = chatLiveAssetUrlError(imageUrl, { required: true, previous: existing?.imageUrl || "", label: "素材图" });
  if (imageError) return sendJson(res, 422, { ok: false, message: imageError });
  const customText = String(body.userText !== undefined ? body.userText : (existing?.userText || "")).trim().slice(0, 200);
  const now = new Date().toISOString();
  const sortNumber = Number(body.sortOrder ?? existing?.sortOrder ?? 0);
  const enabledRaw = body.enabled ?? existing?.enabled;
  const look = {
    id: existing?.id || randomId("look"),
    kind,
    name,
    imageUrl,
    userText: customText || CHAT_LIVE_LOOK_TEXT[kind],
    enabled: enabledRaw === undefined ? true : !(enabledRaw === false || String(enabledRaw) === "false"),
    sortOrder: Number.isFinite(sortNumber) ? Math.round(sortNumber) : 0,
    createdAt: existing?.createdAt || now,
    updatedAt: now,
  };
  const looks = existing
    ? live.looks.map((item) => (item.id === existing.id ? look : item))
    : live.looks.concat(look);
  const saved = await writeChatLiveConfig({ ...live, looks });
  return sendJson(res, 200, { ok: true, look: saved.looks.find((item) => item.id === look.id) || look });
}

async function handleAdminDeleteChatLiveLook(req, res, lookId = "") {
  const auth = await requireAdmin(req, res);
  if (!auth) return;
  const id = String(lookId || "").trim();
  const live = chatLiveConfigValue(await readAppConfig());
  if (!live.looks.some((item) => item.id === id)) return sendJson(res, 404, { ok: false, message: "素材不存在。" });
  await writeChatLiveConfig({ ...live, looks: live.looks.filter((item) => item.id !== id) });
  return sendJson(res, 200, { ok: true });
}

function chatLiveSessionIdentity(req, auth, character) {
  const referer = String(req?.headers?.referer || req?.headers?.referrer || "").trim();
  let refererOrigin = "";
  try {
    if (referer) refererOrigin = new URL(referer).origin;
  } catch {
    refererOrigin = "";
  }
  const sourceOrigin = String(refererOrigin || pageOriginFromRequest(req) || "").slice(0, 200);
  return {
    username: String(auth?.embed?.displayName || auth?.user?.username || "").trim().slice(0, 80),
    externalUserId: String(auth?.embed?.externalUserId || "").slice(0, 120),
    embed: Boolean(auth?.embed),
    characterName: String(character?.name || "").trim().slice(0, 80),
    sourceOrigin,
    sourceHost: hostnameFromOrigin(sourceOrigin),
  };
}

async function resolveChatLiveRoomId(session = {}) {
  const direct = String(session?.roomId || "").trim();
  if (direct) return direct;
  const rooms = await listChatLiveRoomsInDb().catch(() => []);
  const found = (Array.isArray(rooms) ? rooms : []).find((room) => String(room?.currentSessionId || "") === String(session?.id || "") || (session?.liveId && String(room?.currentLiveId || "") === String(session.liveId)));
  return String(found?.id || "");
}

async function publishChatLiveRoomEvent(session = {}, { role = "system", content = "", userId = "" } = {}) {
  const roomId = await resolveChatLiveRoomId(session);
  const text = String(content || "").trim().slice(0, 500);
  if (!roomId || !text) return null;
  const name = String(session?.username || "").trim().slice(0, 40) || "有人";
  const memberUserId = String(userId || session?.userId || "");
  const subscription = memberUserId
    ? await getUserSubscriptionInDb(memberUserId, session?.tenantId || DEFAULT_TENANT_ID).catch(() => null)
    : null;
  const member = liveMembershipActive(subscription);
  return insertChatLiveRoomMessageInDb({
    roomId,
    userId: memberUserId,
    role,
    content: text,
    payload: { name, member, isMember: member },
  });
}

async function linkChatLiveSessionToRoom(roomId = "", session = {}) {
  const id = String(roomId || "").trim();
  if (!id || !session?.id) return;
  const room = await getChatLiveRoomInDb(id).catch(() => null);
  if (!room || String(room.characterId || "") !== String(session.characterId || "")) return;
  await upsertChatLiveRoomInDb({
    ...room,
    currentSessionId: session.exclusive === true ? String(room.currentSessionId || "") : String(session.id),
    currentLiveId: session.exclusive === true ? String(room.currentLiveId || "") : String(session.liveId || ""),
    currentMode: String(session.mode || "realtime"),
    shareSupported: String(session.mode || "") === "component" && session.exclusive !== true,
    activeCount: session.exclusive === true ? Number(room.activeCount || 0) : Math.max(1, Number(room.activeCount || 0)),
    updatedAt: new Date().toISOString(),
  });
}

/*
 * Session creation can persist the session and then fail while linking or
 * publishing it. Clear the room pointer only when it still belongs to that
 * failed session; a newer session must never be removed by a stale rollback.
 */
async function clearChatLiveRoomSessionLink(roomId = "", sessionId = "") {
  const id = String(roomId || "").trim();
  const failedSessionId = String(sessionId || "").trim();
  if (!id || !failedSessionId) return false;
  const room = await getChatLiveRoomInDb(id).catch(() => null);
  if (!room || String(room.currentSessionId || "") !== failedSessionId) return false;
  await upsertChatLiveRoomInDb({
    ...room,
    currentSessionId: "",
    currentLiveId: "",
    currentMode: "",
    shareSupported: false,
    activeCount: 0,
    updatedAt: new Date().toISOString(),
  });
  return true;
}

async function handleListChatLiveContacts(req, res) {
  const auth = await requireUser(req, res);
  if (!auth) return;
  const sessions = await listChatLiveSessionsInDb({ userId: auth.user.id, limit: 200 }).catch(() => []);
  const seen = new Set();
  const contacts = [];
  for (const session of sessions || []) {
    const characterId = String(session.characterId || "");
    if (!characterId || seen.has(characterId)) continue;
    seen.add(characterId);
    const character = await getChatLiveCharacterInDb(characterId).catch(() => null);
    contacts.push(publicAssetUrlsForClient({
      characterId,
      name: character && character.name || session.characterName || "视频聊天",
      portraitUrl: character && (character.portraitUrl || character.avatarUrl || character.posterUrl) || "",
      updatedAt: session.updatedAt || session.createdAt || "",
    }));
    if (contacts.length >= 50) break;
  }
  return sendJson(res, 200, { ok: true, contacts });
}

async function releaseChatLiveForReconnect(session = {}) {
  if (!session?.id) return;
  if (String(session.mode || "") === "component" && session.liveId) {
    try { chatLiveComponent.stopComponentSession?.(session.liveId); } catch {}
  }
  const endedAt = new Date().toISOString();
  await withChatLiveSessionSettlementLockInDb(session.id, async (lockedSession) => {
    const current = lockedSession || session;
    if (current.settled === true || String(current.settled || "").toLowerCase() === "true") {
      return { session: null, value: current };
    }
    const next = {
      ...current,
      status: "ended",
      settled: false,
      endedAt: current.endedAt || endedAt,
      endReason: current.endReason || "replaced_by_reconnect",
      endedByReconnectAt: endedAt,
      updatedAt: endedAt,
    };
    return { session: next, value: next };
  });
  /*
   * Free time is cumulative per user. The old allocation remains reserved
   * until settlement releases any unused seconds, so the replacement
   * connection must not allocate its entry allowance before this finishes.
   */
  const settled = await settleChatLiveSessionById(session.id);
  const committed = settled?.settled === true || String(settled?.settled || "").toLowerCase() === "true";
  if (!committed) {
    const error = new Error("上一场直播还未完成结算，请稍后再进入。");
    error.code = "CHAT_LIVE_PREVIOUS_SESSION_SETTLEMENT_PENDING";
    error.statusCode = 503;
    throw error;
  }
}

function chatLiveSessionStillOpen(item = {}, embedExternalUserId = "") {
  if (!item) return false;
  const settled = item.settled === true || String(item.settled || "").toLowerCase() === "true";
  const status = String(item.status || "").toLowerCase();
  const active = !settled && !["ended", "closed", "failed"].includes(status);
  if (!active) return false;
  if (embedExternalUserId) return String(item.externalUserId || "") === embedExternalUserId;
  if (item.embed) return false;
  return true;
}

