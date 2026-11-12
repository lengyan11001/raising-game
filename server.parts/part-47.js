/* ------------------------------------------------------------------ *
 * Vidu Live merchant API: characters, programmatic sessions, relay.  *
 * ------------------------------------------------------------------ */

const VIDU_LIVE_CHARACTER_MAX_LOOKS = 12;
const VIDU_LIVE_LOOK_KINDS = new Set(["garment", "object", "background"]);
const VIDU_LIVE_RELAY_PUBLIC_ORIGIN = "https://live.123vipeak.com";

function viduLiveMerchantAuth(auth) {
  if (!auth?.user?.id) return false;
  const source = String(auth.tokenSource || "").toLowerCase();
  return source === "api_token" || source === "subtoken" || auth?.isApiToken === true;
}

function viduLiveRequireMerchant(req, res) {
  return requireUser(req, res).then((auth) => {
    if (!auth) return null;
    if (!viduLiveMerchantAuth(auth)) {
      sendJson(res, 403, { ok: false, code: "VIDU_LIVE_MERCHANT_TOKEN_REQUIRED", message: "请使用商家 API Token 或子 Token。" });
      return null;
    }
    return auth;
  });
}

function viduLiveRelayWebSocketUrl(session = {}) {
  const token = viduLiveRelay.makeToken(session);
  return `${VIDU_LIVE_RELAY_PUBLIC_ORIGIN.replace(/^http/i, "ws")}/api/embed/live/sessions/${encodeURIComponent(session.id)}/relay?token=${encodeURIComponent(token)}`;
}

function viduLivePublicCharacter(character = {}) {
  const base = publicChatLiveCharacter(character);
  return {
    ...base,
    defaultMode: character.defaultMode === "compute-relay" ? "compute-relay" : (character.defaultMode === "component" ? "component" : "realtime"),
    voice: {
      provider: String(character.voiceProvider || ""),
      voiceType: String(character.voiceType || ""),
    },
    looks: (Array.isArray(character.embedLooks) ? character.embedLooks : []).map((look) => ({
      id: String(look.id || ""),
      kind: VIDU_LIVE_LOOK_KINDS.has(String(look.kind || "")) ? String(look.kind) : "",
      name: String(look.name || ""),
      imageUrl: String(look.imageUrl || ""),
      userText: String(look.userText || ""),
    })),
    createdAt: character.createdAt || "",
    updatedAt: character.updatedAt || "",
  };
}

async function viduLiveResolveHttpOrAssetUrl(auth, input = {}, { label = "图片" } = {}) {
  const assetId = String(input.assetId || input.imageAssetId || input.asset_id || input.image_asset_id || "").trim();
  const directUrl = String(input.imageUrl || input.image_url || input.url || "").trim();
  if (assetId) {
    const asset = await getUserAssetFromDb(assetId);
    if (!asset || String(asset.userId || "") !== String(auth.user.id)) {
      const error = new Error(`${label}素材不存在或不属于当前商家。`);
      error.statusCode = 404;
      error.code = "VIDU_LIVE_ASSET_NOT_FOUND";
      throw error;
    }
    const ensured = await ensurePublicUrlForUserAsset(auth.db, asset);
    const publicUrl = String(ensured?.publicUrl || asset.publicUrl || "").trim();
    if (!isPublicHttpUrl(publicUrl)) {
      const error = new Error(`${label}素材无法生成公网地址。`);
      error.statusCode = 422;
      error.code = "VIDU_LIVE_ASSET_NOT_PUBLIC";
      throw error;
    }
    return { assetId: asset.id, imageUrl: publicUrl };
  }
  if (!/^https:\/\/\S+$/i.test(directUrl) || !isPublicHttpUrl(directUrl)) {
    const error = new Error(`${label}必须是可公网访问的 https 地址，或传站内 assetId。`);
    error.statusCode = 422;
    error.code = "VIDU_LIVE_IMAGE_URL";
    throw error;
  }
  return { assetId: "", imageUrl: directUrl };
}

async function viduLiveNormalizeLooks(auth, value) {
  const list = Array.isArray(value) ? value : [];
  if (list.length > VIDU_LIVE_CHARACTER_MAX_LOOKS) {
    const error = new Error(`looks 最多 ${VIDU_LIVE_CHARACTER_MAX_LOOKS} 项。`);
    error.statusCode = 422;
    error.code = "VIDU_LIVE_LOOKS_LIMIT";
    throw error;
  }
  const looks = [];
  for (let i = 0; i < list.length; i += 1) {
    const item = list[i] && typeof list[i] === "object" ? list[i] : {};
    const kind = String(item.kind || "").trim();
    if (!VIDU_LIVE_LOOK_KINDS.has(kind)) {
      const error = new Error("look.kind 只支持 garment、object、background。");
      error.statusCode = 422;
      error.code = "VIDU_LIVE_LOOK_KIND";
      throw error;
    }
    const resolved = await viduLiveResolveHttpOrAssetUrl(auth, item, { label: "换装" });
    looks.push({
      id: `embed-look-${i + 1}`,
      kind,
      name: String(item.name || kind).trim().slice(0, 40) || kind,
      imageUrl: resolved.imageUrl,
      assetId: resolved.assetId,
      userText: String(item.userText || item.user_text || CHAT_LIVE_LOOK_TEXT[kind] || "").trim().slice(0, 200),
      sortOrder: i,
    });
  }
  return looks;
}

async function viduLiveNormalizeCharacterInput(auth, input = {}, existing = null) {
  const avatar = await viduLiveResolveHttpOrAssetUrl(auth, {
    imageUrl: input.imageUrl || input.avatarUrl || existing?.avatarUrl || "",
    assetId: input.avatarAssetId || input.imageAssetId || input.assetId || existing?.avatarAssetId || "",
  }, { label: "角色形象图" });
  const name = String(input.name || existing?.name || "").trim().slice(0, 80);
  const script = String(input.script || input.directScript || "").trim().slice(0, 4000);
  const persona = script || String(input.persona || input.intro || existing?.persona || existing?.intro || "").trim().slice(0, 4000);
  const intro = String(input.intro || persona).trim().slice(0, 500);
  if (!name || !persona) {
    const error = new Error("请提供 name，以及 intro、persona 或 script。");
    error.statusCode = 422;
    error.code = "VIDU_LIVE_CHARACTER";
    throw error;
  }
  const voiceInput = input.voice && typeof input.voice === "object" ? input.voice : {};
  const voice = await resolveEmbedLiveVoice({
    ...input,
    voiceType: voiceInput.voiceType || input.voiceType || existing?.voiceType || "",
    voiceProvider: voiceInput.provider || input.voiceProvider || existing?.voiceProvider || "",
  });
  const looks = Object.prototype.hasOwnProperty.call(input, "looks")
    ? await viduLiveNormalizeLooks(auth, input.looks)
    : (Array.isArray(existing?.embedLooks) ? existing.embedLooks : []);
  const defaultMode = input.defaultMode === "compute-relay"
    ? "compute-relay"
    : (input.defaultMode === "component" ? "component" : "realtime");
  const now = new Date().toISOString();
  return {
    ...(existing || {}),
    id: existing?.id || `embedchar-${crypto.randomBytes(12).toString("hex")}`,
    name,
    intro,
    persona,
    greeting: String(input.greeting || existing?.greeting || "").trim().slice(0, 1000),
    embedDirectScript: Boolean(script),
    avatarUrl: avatar.imageUrl,
    avatarAssetId: avatar.assetId,
    portraitUrl: String(input.portraitUrl || avatar.imageUrl).trim(),
    voiceType: voice.voiceType,
    voiceProvider: voice.provider,
    componentVoiceType: String(input.componentVoiceType || existing?.componentVoiceType || "longanyang").trim().slice(0, 80) || "longanyang",
    language: String(input.language || existing?.language || "zh").trim().slice(0, 16) || "zh",
    defaultMode,
    mode: defaultMode,
    embedLooks: looks,
    enabled: false,
    ownerMerchantUserId: String(auth.user.id),
    embedMerchantId: String(auth.user.id),
    createdByUserId: existing?.createdByUserId || String(auth.user.id),
    updatedByUserId: String(auth.user.id),
    sortOrder: Number(existing?.sortOrder ?? 100000) || 100000,
    createdAt: existing?.createdAt || now,
    updatedAt: now,
  };
}

async function handleViduLiveListCharacters(req, res, url) {
  const auth = await viduLiveRequireMerchant(req, res);
  if (!auth) return;
  const limit = Math.max(1, Math.min(200, Number(url?.searchParams?.get("limit") || 50) || 50));
  const offset = Math.max(0, Number(url?.searchParams?.get("offset") || 0) || 0);
  const all = await listChatLiveCharactersByOwnerInDb(auth.user.id, { includeDisabled: true });
  return sendJson(res, 200, { ok: true, total: all.length, limit, offset, characters: all.slice(offset, offset + limit).map(viduLivePublicCharacter) });
}

async function handleViduLiveCreateCharacter(req, res) {
  const auth = await viduLiveRequireMerchant(req, res);
  if (!auth) return;
  const body = await readJson(req);
  try {
    const character = await viduLiveNormalizeCharacterInput(auth, body);
    const saved = await upsertChatLiveCharacterInDb(character);
    return sendJson(res, 201, { ok: true, character: viduLivePublicCharacter(saved) });
  } catch (error) {
    return sendJson(res, error.statusCode || 422, { ok: false, code: error.code || "VIDU_LIVE_CHARACTER", message: error.message || "角色创建失败。" });
  }
}

async function handleViduLiveGetCharacter(req, res, id = "") {
  const auth = await viduLiveRequireMerchant(req, res);
  if (!auth) return;
  const character = await getChatLiveCharacterByOwnerInDb(auth.user.id, id);
  if (!character) return sendJson(res, 404, { ok: false, code: "VIDU_LIVE_CHARACTER_NOT_FOUND", message: "角色不存在。" });
  return sendJson(res, 200, { ok: true, character: viduLivePublicCharacter(character) });
}

async function handleViduLiveUpdateCharacter(req, res, id = "") {
  const auth = await viduLiveRequireMerchant(req, res);
  if (!auth) return;
  const existing = await getChatLiveCharacterByOwnerInDb(auth.user.id, id);
  if (!existing) return sendJson(res, 404, { ok: false, code: "VIDU_LIVE_CHARACTER_NOT_FOUND", message: "角色不存在。" });
  const body = await readJson(req);
  try {
    const character = await viduLiveNormalizeCharacterInput(auth, body, existing);
    const saved = await upsertChatLiveCharacterInDb(character);
    return sendJson(res, 200, { ok: true, character: viduLivePublicCharacter(saved) });
  } catch (error) {
    return sendJson(res, error.statusCode || 422, { ok: false, code: error.code || "VIDU_LIVE_CHARACTER", message: error.message || "角色更新失败。" });
  }
}

async function handleViduLiveDeleteCharacter(req, res, id = "") {
  const auth = await viduLiveRequireMerchant(req, res);
  if (!auth) return;
  const existing = await getChatLiveCharacterByOwnerInDb(auth.user.id, id);
  if (!existing) return sendJson(res, 404, { ok: false, code: "VIDU_LIVE_CHARACTER_NOT_FOUND", message: "角色不存在。" });
  const active = await listActiveChatLiveSessionsByCharacterIdInDb(existing.id);
  if (active.length) return sendJson(res, 409, { ok: false, code: "VIDU_LIVE_CHARACTER_IN_USE", message: "角色还有进行中的会话，结束后再删除。", activeSessionIds: active.slice(0, 10).map((row) => row.id) });
  const deleted = await softDeleteChatLiveCharacterInDb(existing.id, new Date().toISOString());
  return sendJson(res, 200, { ok: true, characterId: existing.id, deletedAt: deleted?.deletedAt || new Date().toISOString() });
}

function viduLiveExternalUserId(value = "") {
  return embedLiveExternalUserId(value);
}

async function handleViduLiveCreateSession(req, res) {
  const auth = await viduLiveRequireMerchant(req, res);
  if (!auth) return;
  const body = await readJson(req);
  const externalUserId = viduLiveExternalUserId(body.externalUserId || body.external_user_id);
  if (!externalUserId) return sendJson(res, 422, { ok: false, code: "VIDU_LIVE_USER", message: "externalUserId 必填，只能包含字母、数字和 _.:@-。" });
  const characterId = String(body.characterId || body.character_id || "").trim();
  const character = await getChatLiveCharacterByOwnerInDb(auth.user.id, characterId);
  if (!character) return sendJson(res, 404, { ok: false, code: "VIDU_LIVE_CHARACTER_NOT_FOUND", message: "角色不存在或不属于当前商家。" });
  if (String(body.mode || character.defaultMode || "compute-relay") !== "compute-relay") {
    return sendJson(res, 422, { ok: false, code: "VIDU_LIVE_MODE", message: "程序化会话只支持 mode=compute-relay。" });
  }
  const config = await readAppConfig();
  const live = chatLiveConfigValue(config);
  const saleCreditsPerMinute = Number(live.computeRelaySaleCreditsPerMinute || 0) || 0;
  if (!(saleCreditsPerMinute > 0)) return sendJson(res, 503, { ok: false, code: "VIDU_LIVE_PRICING_MISSING", message: "compute-relay 售价未配置，生成未启动。" });
  if (!live.enabled) return sendJson(res, 503, { ok: false, code: "VIDU_LIVE_DISABLED", message: "在线聊天暂未开放。" });
  if (live.region === "cn") return sendJson(res, 503, { ok: false, code: "VIDU_LIVE_INTERNATIONAL_ONLY", message: "商家算力中转仅支持 Vidu 国际站。" });
  const creds = viduCredentialsForRegion("overseas");
  if (!creds.key) return sendJson(res, 503, { ok: false, code: "VIDU_NOT_CONFIGURED", message: "Vidu Live 暂未配置。" });
  if (!ARTC_APP_ID || !ARTC_APP_KEY) return sendJson(res, 503, { ok: false, code: "VIDU_LIVE_RTC_NOT_CONFIGURED", message: "服务器未配置 ARTC。" });

  const activeSessions = await listChatLiveSessionsInDb({ userId: auth.user.id, limit: 50 }).catch(() => []);
  for (const item of activeSessions.filter((row) => row.mode === "compute-relay" && row.externalUserId === externalUserId && chatLiveSessionStillOpen(row, externalUserId))) {
    await releaseChatLiveForReconnect(item);
  }

  const sessionId = randomId("chatlive-relay");
  const channelId = `aiyes-relay-${sessionId.replace(/[^a-z0-9]/gi, "").slice(-20)}`;
  const pusherId = `aiyes-relay-push-${Date.now().toString(36)}`;
  const viewerId = `relay-view-${crypto.randomBytes(4).toString("hex")}`;
  let entry;
  try {
    entry = await prepareChatLiveFreeEntry({
      auth,
      req,
      sessionId,
      configuredFreeSeconds: 0,
      requestedFreeSeconds: 0,
      productMaxMinutes: live.maxMinutes,
      saleCreditsPerMinute,
      liveId: "pending",
    });
  } catch (error) {
    if (error?.statusCode === 402) return sendJson(res, 402, insufficientCreditsPayload(error.cost || 0, error.credits || 0, { code: "VIDU_LIVE_INSUFFICIENT_CREDITS", message: "余额不足以预留首段算力。" }));
    return sendJson(res, error?.statusCode || 500, { ok: false, code: error?.code || "VIDU_LIVE_ENTRY_FAILED", message: error?.message || "创建会话失败。" });
  }

  let upstream;
  try {
    upstream = await viduLiveRequestRetry("/live/s_avatar/component", {
      method: "POST",
      timeoutMs: 45000,
      region: live.region,
      body: {
        model: live.model,
        extra_motion: false,
        moderation: "disabled",
        image_uri: character.avatarUrl,
        action: { enabled: true },
        rtc_info: {
          provider: "artc",
          app_id: ARTC_APP_ID,
          channel_id: channelId,
          user_id: pusherId,
          token: artcToken({ channelId, userId: pusherId }),
        },
      },
    }, { characterId: character.id, model: live.model, callMode: "video" });
  } catch (error) {
    await rollbackChatLiveEntryAllocation(sessionId, auth, entry.initialHold, { id: sessionId, liveId: "pending" });
    return sendChatLiveCreateError(res, error);
  }

  const now = new Date().toISOString();
  const upstreamLive = upstream?.live || upstream || {};
  const liveId = String(upstreamLive.id || upstream?.live_id || "");
  if (!liveId) {
    await rollbackChatLiveEntryAllocation(sessionId, auth, entry.initialHold, { id: sessionId, liveId: "pending" });
    return sendJson(res, 502, { ok: false, code: "VIDU_LIVE_NO_LIVE_ID", message: "上游没有返回会话 ID，生成未启动。" });
  }
  const identity = chatLiveSessionIdentity(req, auth, character);
  const session = await createChatLiveSessionWithEntryRecovery({
    id: sessionId,
    userId: auth.user.id,
    characterId: character.id,
    liveId,
    status: "waiting",
    mode: "compute-relay",
    exclusive: true,
    ...identity,
    externalUserId,
    username: externalUserId,
    clientSecret: String(upstream?.client_secret || upstreamLive.client_secret || ""),
    upstreamTraceId: String(upstreamLive.trace_id || upstream?.trace_id || "").slice(0, 100),
    channel: { provider: "artc", appId: ARTC_APP_ID, channelId, pusherId },
    rtc: {
      provider: "artc",
      appId: ARTC_APP_ID,
      channelId,
      userId: viewerId,
      token: artcToken({ channelId, userId: viewerId, ttlSeconds: 3600 }),
    },
    viduRegion: "overseas",
    costCreditsPerMinute: live.computeRelayCostCreditsPerMinute,
    saleCreditsPerMinute,
    maxMinutes: live.maxMinutes,
    freeSeconds: 0,
    freeAllowanceSeconds: 0,
    freeAllocatedSeconds: 0,
    freeUsedSeconds: 0,
    freeRemainingSeconds: 0,
    freeAllocationVersion: "compute_relay_v1",
    freeAllocationFinalized: true,
    avatarMode: "default",
    model: live.model,
    callMode: "video",
    billingPolicy: "entry",
    billingVersion: "compute_relay_prepaid_v1",
    prepaidSeconds: entry.initialPrepaidSeconds || 0,
    prepaidCredits: entry.initialHold?.credits || 0,
    holdSequence: entry.initialHold?.holdSequence || 0,
    holdSettled: false,
    billableStartedAt: now,
    createdAt: now,
    updatedAt: now,
    diagnostics: [chatLiveDiagnosticEvent({ liveId, upstreamTraceId: String(upstreamLive.trace_id || "") }, {
      phase: "create",
      event: "vidu_compute_relay_create",
      traceId: String(upstreamLive.trace_id || ""),
      liveId,
      data: { response: chatLiveUpstreamSummary(upstream, 200), initialHold: { seconds: entry.initialPrepaidSeconds || 0, credits: entry.initialHold?.credits || 0 } },
    })],
  }, {
    auth,
    hold: entry.initialHold,
  });
  const relayUrl = viduLiveRelayWebSocketUrl(session);
  return sendJson(res, 201, {
    ok: true,
    session: {
      id: session.id,
      mode: session.mode,
      status: session.status,
      liveId: session.liveId,
      externalUserId,
      characterId: character.id,
      rtc: session.rtc,
      relay: { url: relayUrl, protocol: "vidu-live-relay.v1", pcm: { format: "pcm_s16le", sampleRate: 24000, channels: 1, frameBytes: 960 } },
      saleCreditsPerMinute,
      maxMinutes: live.maxMinutes,
      billableStartedAt: session.billableStartedAt,
      createdAt: session.createdAt,
    },
    character: viduLivePublicCharacter(character),
  });
}

async function handleViduLiveGetSession(req, res, id = "") {
  const auth = await viduLiveRequireMerchant(req, res);
  if (!auth) return;
  const session = await getChatLiveSessionInDb(String(id || "").trim());
  if (!session || session.userId !== auth.user.id || session.mode !== "compute-relay") return sendJson(res, 404, { ok: false, code: "VIDU_LIVE_SESSION_NOT_FOUND", message: "会话不存在。" });
  return sendJson(res, 200, { ok: true, session: { ...publicChatLiveSession(session), mode: session.mode, externalUserId: session.externalUserId || "", characterId: session.characterId || "", rtc: session.rtc || null, relayActive: viduLiveRelay.hasSession(session.id) } });
}

async function handleViduLiveEndSession(req, res, id = "") {
  const auth = await viduLiveRequireMerchant(req, res);
  if (!auth) return;
  const session = await getChatLiveSessionInDb(String(id || "").trim());
  if (!session || session.userId !== auth.user.id || session.mode !== "compute-relay") return sendJson(res, 404, { ok: false, code: "VIDU_LIVE_SESSION_NOT_FOUND", message: "会话不存在。" });
  const body = await readJson(req).catch(() => ({}));
  const clientReason = String(body?.reason || "merchant_end").slice(0, 64).replace(/[^a-z0-9_.-]/gi, "") || "merchant_end";
  viduLiveRelay.closeSession(session.id, true, clientReason);
  session.clientEndReason = clientReason;
  session.endReason = session.endReason || clientReason;
  session.endedAt = session.endedAt || new Date().toISOString();
  const settled = await settleChatLiveSession(session, { auth });
  return sendJson(res, 200, { ok: true, session: publicChatLiveSession(settled || session) });
}

async function handleViduLiveRoutes(req, res, url) {
  if (req.method === "GET" && url.pathname === "/docs/vidu-live-integration.md") {
    const markdown = await fs.readFile(path.join(ROOT, "docs", "vidu-live-integration.md"), "utf8").catch(() => "");
    if (!markdown) return sendJson(res, 404, { ok: false, message: "文档不存在。" });
    res.writeHead(200, { "Content-Type": "text/markdown; charset=utf-8", "Cache-Control": "public, max-age=300" });
    res.end(markdown);
    return;
  }
  if (url.pathname === "/api/embed/live/voices" && req.method === "GET") return handleEmbedLiveVoices(req, res, url);
  if (url.pathname === "/api/embed/live/tickets" && req.method === "POST") return handleEmbedLiveTicket(req, res);
  if (url.pathname === "/api/embed/live/bootstrap" && req.method === "POST") return handleEmbedLiveBootstrap(req, res);

  if (url.pathname === "/api/embed/live/characters") {
    if (req.method === "GET") return handleViduLiveListCharacters(req, res, url);
    if (req.method === "POST") return handleViduLiveCreateCharacter(req, res);
    return sendJson(res, 405, { ok: false, code: "METHOD_NOT_ALLOWED", message: "Method not allowed" });
  }
  const characterMatch = url.pathname.match(/^\/api\/embed\/live\/characters\/([^/]+)$/);
  if (characterMatch) {
    const id = decodeURIComponent(characterMatch[1]);
    if (req.method === "GET") return handleViduLiveGetCharacter(req, res, id);
    if (req.method === "PATCH" || req.method === "PUT") return handleViduLiveUpdateCharacter(req, res, id);
    if (req.method === "DELETE") return handleViduLiveDeleteCharacter(req, res, id);
    return sendJson(res, 405, { ok: false, code: "METHOD_NOT_ALLOWED", message: "Method not allowed" });
  }
  if (url.pathname === "/api/embed/live/sessions" && req.method === "POST") return handleViduLiveCreateSession(req, res);
  const sessionMatch = url.pathname.match(/^\/api\/embed\/live\/sessions\/([^/]+)$/);
  if (sessionMatch && req.method === "GET") return handleViduLiveGetSession(req, res, decodeURIComponent(sessionMatch[1]));
  const endMatch = url.pathname.match(/^\/api\/embed\/live\/sessions\/([^/]+)\/end$/);
  if (endMatch && req.method === "POST") return handleViduLiveEndSession(req, res, decodeURIComponent(endMatch[1]));
  return sendJson(res, 404, { ok: false, code: "VIDU_LIVE_ROUTE_NOT_FOUND", message: "接口不存在。" });
}

viduLiveRelay.configure({
  secret: `${unlockStreamSecret()}|vidu-live-relay`,
  getSession: getChatLiveSessionInDb,
  credentialsForRegion: viduCredentialsForRegion,
});
