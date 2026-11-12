async function handleCreateChatLiveSession(req, res) {
  const auth = await requireUser(req, res);
  if (!auth) return;
  const body = await readJson(req);
  const roomId = String(body.roomId || "").trim();
  const room = roomId ? await getChatLiveRoomInDb(roomId) : null;
  if (roomId && (!room || room.enabled === false || room.status !== "active")) return sendJson(res, 404, { ok: false, code: "CHAT_LIVE_ROOM_NOT_FOUND", message: "房间不存在或已关闭。" });
  const character = await getChatLiveCharacterInDb(String(body.characterId || room?.characterId || "").trim());
  if (roomId && character && String(room.characterId || "") !== String(character.id || "")) return sendJson(res, 422, { ok: false, code: "CHAT_LIVE_ROOM_CHARACTER_MISMATCH", message: "房间角色已变化，请刷新后再试。" });
  const embedCharacterOk = Boolean(auth.embed) && String(character?.embedMerchantId || "") === String(auth.user.id) && String(auth.embed.characterId || "") === String(character?.id || "");
  const characterVisible = publicChatLiveCharacterIsVisible(character, auth.user);
  if (!character || (!characterVisible && !embedCharacterOk)) return sendJson(res, 404, { ok: false, code: "CHAT_LIVE_CHARACTER_NOT_FOUND", message: "角色不存在、未公开或未启用。" });
  if (auth.embed && !embedCharacterOk) return sendJson(res, 403, { ok: false, code: "EMBED_CHARACTER_MISMATCH", message: "这张接入票不能打开这个角色。" });
  const wantsSharedRoom = body.sharedRoom === true || String(body.sharedRoom) === "true" || Boolean(roomId);
  if (auth.embed && wantsSharedRoom) return sendJson(res, 422, { ok: false, code: "EMBED_SHARED_ROOM_UNSUPPORTED", message: "嵌入接入当前只支持一对一通话。" });
  if (wantsSharedRoom && character.sharedRoomEnabled !== true) {
    return sendJson(res, 422, { ok: false, code: "CHAT_LIVE_SHARED_ROOM_DISABLED", message: "这个角色没有开放多人房间。" });
  }
  if (wantsSharedRoom && roomId && String(room.createdByUserId || "") !== String(auth.user.id)) {
    return sendJson(res, 403, { ok: false, code: "CHAT_LIVE_ROOM_HOST_FORBIDDEN", message: "只有房间创建者可以开启主播会话。" });
  }
  if (wantsSharedRoom && roomId && room.currentSessionId) {
    const existingHost = await getChatLiveSessionInDb(String(room.currentSessionId));
    if (chatLiveSessionStillOpen(existingHost)) {
      return sendJson(res, 409, { ok: false, code: "CHAT_LIVE_ROOM_OCCUPIED", message: "房间已经有人开始了，请直接加入房间。" });
    }
  }
  const sessionExclusive = !wantsSharedRoom;
  const config = await readAppConfig();
  const live = chatLiveConfigValue(config);
  const avatarMode = body.avatarMode === "undress" ? "undress" : "default";
  const liveSubscription = await getUserSubscriptionInDb(auth.user.id, requestTenantId(req));
  if (avatarMode === "undress" && !liveMembershipActive(liveSubscription)) {
    return sendJson(res, 402, { ok: false, code: "CHAT_LIVE_MEMBERSHIP_REQUIRED", message: "Undress 是会员权益，请先订阅会员。" });
  }
  const replacingSession = String(body.replaceSessionId || "").trim();
  const avatarImageUrl = avatarMode === "undress"
    ? publicChatLiveUndressImageUrl(character)
    : character.avatarUrl;
  if (avatarMode === "undress" && !avatarImageUrl) {
    return sendJson(res, 422, { ok: false, code: "CHAT_LIVE_UNDRESS_IMAGE_NOT_READY", message: "这个角色还没有可用的 Undress 图片。" });
  }
  if (!viduCredentialsForRegion(live.region).key) return sendJson(res, 503, { ok: false, code: "VIDU_NOT_CONFIGURED", message: "在线聊天暂未开通。" });
  if (!live.enabled) return sendJson(res, 503, { ok: false, code: "CHAT_LIVE_DISABLED", message: "在线聊天暂未开放。" });
  const liveMember = liveMembershipActive(liveSubscription);
  const salePerMinute = liveMemberSaleCredits(wantsSharedRoom ? chatLiveSharedRoomSaleCredits(live) : Number(live.saleCreditsPerMinute || 0), liveMember);
  if (!(salePerMinute > 0)) return sendJson(res, 503, { ok: false, code: "CHAT_LIVE_PRICING_MISSING", message: "在线聊天价格未配置。" });
  const requestedMode = String(body.mode || auth.embed?.mode || character.mode || live.defaultMode || "realtime");
  const conversationMode = wantsSharedRoom
    ? "component"
    : (["component", "compute-relay"].includes(requestedMode) ? requestedMode : "realtime");
  if (conversationMode === "compute-relay") {
    return sendJson(res, 409, {
      ok: false,
      code: "VIDU_LIVE_USE_PROGRAMMATIC_API",
      message: "算力中转会话必须通过 POST /api/embed/live/sessions 创建，并使用返回的 relay WebSocket。",
    });
  }
  if (conversationMode === "component" && (!ARTC_APP_ID || !ARTC_APP_KEY)) {
    return sendJson(res, 503, {
      ok: false,
      code: "CHAT_LIVE_COMPONENT_NOT_CONFIGURED",
      message: "该角色配置为「外接 LLM（组件版）」，但服务器还没配置自建 RTC（缺 ARTC_APP_ID / ARTC_APP_KEY）。",
    });
  }
  const activeSessions = await listChatLiveSessionsInDb({ userId: auth.user.id, limit: 10 }).catch(() => []);
  /* Older rows stored settled as the JSON string "true". Treat both forms as
     settled so a stale waiting row cannot block a new character connection. */
  const embedExternalUserId = String(auth.embed?.externalUserId || "");
  for (const item of activeSessions.filter((row) => chatLiveSessionStillOpen(row, embedExternalUserId))) {
    await releaseChatLiveForReconnect(item);
  }
  const initialSessionId = randomId("chatlive");
  /*
   * Free time is a user-level allowance, not a per-connection window. The
   * database allocates at most the remaining allowance to this session and
   * reserves an initial paid block only when no free seconds remain.
   */
  let entry;
  try {
    entry = await prepareChatLiveFreeEntry({
      auth,
      req,
      sessionId: initialSessionId,
      configuredFreeSeconds: live.freeSeconds,
      productMaxMinutes: live.maxMinutes,
      saleCreditsPerMinute: salePerMinute,
      liveId: "pending",
    });
  } catch (error) {
    if (error?.statusCode === 402) {
      return sendJson(res, 402, insufficientCreditsPayload(error.cost || 0, error.credits || 0, {
        code: "CHAT_LIVE_INSUFFICIENT_CREDITS",
        message: "免费时长已用完或不足以覆盖完整计费块，且当前积分不足，无法进入直播间。",
      }));
    }
    return sendJson(res, error?.statusCode || 500, {
      ok: false,
      code: error?.code || "CHAT_LIVE_ENTRY_FAILED",
      message: error?.message || "进入直播间失败。",
    });
  }
  const balance = Number(auth.user?.credits || 0);
  const effectiveFreeSeconds = entry.configuredFreeSeconds;
  const freeAllocatedSeconds = entry.freeAllocatedSeconds;
  const freeRemainingSeconds = entry.freeRemainingSeconds;
  const initialPrepaidSeconds = entry.initialPrepaidSeconds;
  const initialHold = entry.initialHold;

  /* —— 组件版：我们自建 RTC 频道，Vidu 只把数字人推进来 —— */
  if (conversationMode === "component") {
    const sessionId = initialSessionId;
    const channelId = `aiyes-live-${sessionId.replace(/[^a-z0-9]/gi, "").slice(-16)}`;
    const pusherId = `aiyes-push-${Date.now().toString(36)}`;
    const viewerId = `${auth.user.id}`.slice(0, 32);
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
          image_uri: avatarImageUrl,
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
      await rollbackChatLiveEntryAllocation(sessionId, auth, initialHold, { id: sessionId, liveId: "pending" });
      return sendChatLiveCreateError(res, error);
    }
    const now = new Date().toISOString();
    const componentLive = upstream?.live || upstream || {};
    const componentTraceId = String(componentLive.trace_id || upstream?.trace_id || componentLive.traceId || "").slice(0, 100);
    /* 启动服务端流水线：连 Vidu 外部 live 流，之后「用户话 → 我们的 LLM → TTS → 推流」 */
    const componentCreds = viduCredentialsForRegion(live.region);
    const componentMemory = sessionExclusive ? await loadChatCharacterMemory(auth.user.id, character.id) : null;
    chatLiveComponent.startComponentSession({
      liveId: String(upstream?.live?.id || ""),
      clientSecret: String(upstream?.client_secret || ""),
      character,
      memoryBlock: "",
      engagementBlock: "",
      conversationTone: "",
      spokenPrompt: chatLiveLegacyPrompt(character, { language: character.language || "zh", memory: sessionExclusive ? componentMemory : null, user: auth.user, site: requestTenantDescriptor(req).toolId }),
      language: character.language || "zh",
      languageModel: live.languageModel === "papaya" ? "papaya" : "byteplus",
      site: requestTenantDescriptor(req).toolId,
      userBlock: chatLiveUserContext(auth.user),
      viduBase: componentCreds.base,
      viduKey: componentCreds.key,
    }).catch((error) => console.warn("[chat-live-component] start failed", error.message || error));
    const componentLiveId = String(upstream?.live?.id || "");
    const session = await createChatLiveSessionWithEntryRecovery({
      id: sessionId,
      userId: auth.user.id,
      characterId: character.id,
      liveId: String(upstream?.live?.id || ""),
      status: "waiting",
      mode: "component",
      exclusive: sessionExclusive,
      ...chatLiveSessionIdentity(req, auth, character),
      clientSecret: String(upstream?.client_secret || ""),
      upstreamTraceId: componentTraceId,
      diagnostics: [chatLiveDiagnosticEvent({ liveId: String(componentLive.id || ""), upstreamTraceId: componentTraceId }, {
        phase: "create",
        event: "vidu_component_create",
        traceId: componentTraceId,
        liveId: String(componentLive.id || ""),
        data: {
          request: { path: "/live/s_avatar/component", method: "POST", body: { model: live.model, extra_motion: false, moderation: "disabled", image_uri: avatarImageUrl, action: { enabled: true }, rtc_info: { provider: "artc", app_id: ARTC_APP_ID, channel_id: channelId, user_id: pusherId } } },
          response: chatLiveUpstreamSummary(upstream, 200),
          balanceBeforeCreate: balance,
          initialHold: { seconds: initialHold?.seconds || 0, credits: initialHold?.credits || 0 },
        },
      })],
      channel: { provider: "artc", appId: ARTC_APP_ID, channelId, pusherId },
      viduRegion: live.region === "cn" ? "cn" : "overseas",
      costCreditsPerMinute: live.costCreditsPerMinute,
      saleCreditsPerMinute: salePerMinute,
      maxMinutes: live.maxMinutes,
      freeSeconds: effectiveFreeSeconds,
      freeAllowanceSeconds: effectiveFreeSeconds,
      freeAllocatedSeconds,
      freeUsedSeconds: 0,
      freeRemainingSeconds,
      freeAllocationVersion: "cumulative_v1",
      freeAllocationFinalized: false,
      avatarMode,
      model: live.model,
      callMode: "video",
      billingPolicy: "entry",
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
      componentLiveId,
      afterCreate: async (created) => {
        try {
          await linkChatLiveSessionToRoom(roomId, created);
          if (roomId) await publishChatLiveRoomEvent({ ...created, roomId }, { role: "system", content: `${String(created.username || "有人")} 进入了房间`, userId: created.userId }).catch((error) => {
            console.warn("[chat-live-entry-recovery]", "component join event failed", created?.id || sessionId, sanitizeChatLiveDiagnosticText(error?.message || error));
          });
        } catch (error) {
          console.warn("[chat-live-entry-recovery]", "component join event failed", created?.id || sessionId, sanitizeChatLiveDiagnosticText(error?.message || error));
          throw error;
        }
      },
      afterFailure: async (failed) => clearChatLiveRoomSessionLink(roomId, failed?.id || sessionId),
    });
    return sendJson(res, 201, {
      ok: true,
      session: {
        id: session.id,
        mode: "component",
        liveId: session.liveId,
        status: session.status,
        /* 浏览器进的是我们自己的频道，用一次性 viewer token */
        rtc: {
          provider: "artc",
          appId: ARTC_APP_ID,
          channelId,
          userId: viewerId,
          token: artcToken({ channelId, userId: viewerId, ttlSeconds: 3600 }),
        },
        saleCreditsPerMinute: salePerMinute,
        costCreditsPerMinute: live.costCreditsPerMinute,
        maxMinutes: live.maxMinutes,
        freeSeconds: session.freeSeconds,
        freeAllowanceSeconds: session.freeAllowanceSeconds,
        freeAllocatedSeconds: session.freeAllocatedSeconds,
        freeUsedSeconds: session.freeUsedSeconds,
        freeRemainingSeconds: session.freeRemainingSeconds,
        freeAllocationVersion: session.freeAllocationVersion,
        freeAllocationFinalized: session.freeAllocationFinalized === true,
        model: live.model,
        billableStartedAt: session.billableStartedAt,
        createdAt: session.createdAt || session.billableStartedAt,
      },
      character: publicChatLiveCharacter(character),
    });
  }

  const avatar = {
    persona: character.persona,
    image_uri: avatarImageUrl,
    name: character.name,
    voice: character.voiceType,
    idle_action: true,
  };
  const privateMemory = sessionExclusive ? await loadChatCharacterMemory(auth.user.id, character.id) : null;
  const memoryBlock = sessionExclusive ? chatCharacterMemoryBlock(privateMemory, auth.user) : "";
  avatar.persona = chatLiveLegacyPrompt(character, { language: character.language || "zh", memory: privateMemory, user: auth.user, site: requestTenantDescriptor(req).toolId });
  if (memoryBlock) avatar.greeting_instruction = "你们已经认识。不要重新自我介绍。用一两句短话接上上次的话题，然后停下来等用户说。不要推进新剧情，不要提礼物。";
  else if (character.greeting) avatar.greeting_instruction = String(character.greeting).trim();
  else avatar.greeting_instruction = "用一两句自然的话打招呼，不要自我介绍，不要提礼物，说完就停。";
  if (character.personaEnhance === true) avatar.persona_enhance = true;
  if (!live.videoChatEnabled) avatar.farewell_enabled = false;
  const voiceRegionError = chatLiveVoiceRegionError(character.voiceProvider);
  if (voiceRegionError) {
    await rollbackChatLiveEntryAllocation(initialSessionId, auth, initialHold, { id: initialSessionId, liveId: "pending" });
    return sendJson(res, 422, { ok: false, code: "CHAT_LIVE_VOICE_REGION", message: voiceRegionError });
  }
  const voiceProviderName = String(character.voiceProvider || "qwen_omni");
  const realtimeBody = {
    model: live.model,
    extra_motion: false,
    moderation: "disabled",
    call_mode: live.callMode,
    avatar,
    audio: { enable_transcription: true },
    vad: { type: "semantic", idle_timeout_ms: 0 },
    idle_timeout_seconds: Math.min(7200, Math.max(10, Math.round(live.maxMinutes * 60))),
  };
  if (voiceProviderName === "doubao_cn" || voiceProviderName === "doubao_overseas" || voiceProviderName === "doubao") {
    realtimeBody.voice_model = {
      provider: "doubao",
      doubao: { voice: character.voiceType },
    };
  }

  let upstream;
  try {
    upstream = await viduLiveRequestRetry("/live/s_avatar/realtime", {
      method: "POST",
      timeoutMs: 45000,
      region: live.region,
      body: realtimeBody,
    }, { characterId: character.id, model: live.model, callMode: live.callMode });
  } catch (error) {
    await rollbackChatLiveEntryAllocation(initialSessionId, auth, initialHold, { id: initialSessionId, liveId: "pending" });
    return sendChatLiveCreateError(res, error);
  }

  const now = new Date().toISOString();
  const upstreamLive = upstream?.live || upstream || {};
  const upstreamTraceId = String(upstreamLive.trace_id || upstream?.trace_id || upstreamLive.traceId || "").slice(0, 100);
  const session = await createChatLiveSessionWithEntryRecovery({
    id: initialSessionId,
    userId: auth.user.id,
    characterId: character.id,
    liveId: String(upstream?.live?.id || ""),
    status: "waiting",
    mode: "realtime",
    exclusive: sessionExclusive,
    ...chatLiveSessionIdentity(req, auth, character),
    rtc: upstream?.rtc || null,
    costCreditsPerMinute: live.costCreditsPerMinute,
    saleCreditsPerMinute: salePerMinute,
    maxMinutes: live.maxMinutes,
    freeSeconds: effectiveFreeSeconds,
    freeAllowanceSeconds: effectiveFreeSeconds,
    freeAllocatedSeconds,
    freeUsedSeconds: 0,
    freeRemainingSeconds,
    freeAllocationVersion: "cumulative_v1",
    freeAllocationFinalized: false,
    avatarMode,
    model: live.model,
    callMode: live.callMode,
    billingPolicy: "entry",
    billingVersion: "prepaid_v1",
    prepaidSeconds: initialHold?.seconds || 0,
    prepaidCredits: initialHold?.credits || 0,
    holdSequence: initialHold?.holdSequence || 0,
    holdSettled: false,
    billableStartedAt: now,
    voiceProvider: upstream?.live?.voice_model?.provider || character.voiceProvider || "",
    upstreamTraceId,
    diagnostics: [chatLiveDiagnosticEvent({ liveId: String(upstreamLive.id || ""), upstreamTraceId }, {
      phase: "create",
      event: "vidu_create",
      traceId: upstreamTraceId,
      liveId: String(upstreamLive.id || ""),
      data: {
        request: { path: "/live/s_avatar/realtime", method: "POST", body: realtimeBody },
        response: chatLiveUpstreamSummary(upstream, 200),
        balanceBeforeCreate: balance,
        initialHold: { seconds: initialHold?.seconds || 0, credits: initialHold?.credits || 0 },
        balanceCheck: { requiredCredits: initialPrepaidSeconds > 0 ? chatLiveBlockCredits({ saleCreditsPerMinute: salePerMinute }, initialPrepaidSeconds) : 0, decision: "create_allowed" },
      },
    })],
    viduRegion: live.region === "cn" ? "cn" : "overseas",
    createdAt: now,
    updatedAt: now,
  }, {
    auth,
    hold: initialHold,
    afterCreate: async (created) => {
      await linkChatLiveSessionToRoom(roomId, created);
    },
    afterFailure: async (failed) => clearChatLiveRoomSessionLink(roomId, failed?.id || initialSessionId),
  });
  return sendJson(res, 201, {
    ok: true,
    session: {
      id: session.id,
      mode: "realtime",
      liveId: session.liveId,
      status: session.status,
      rtc: session.rtc,
      model: session.model,
      callMode: session.callMode,
      voiceProvider: session.voiceProvider,
      saleCreditsPerMinute: salePerMinute,
      costCreditsPerMinute: live.costCreditsPerMinute,
      maxMinutes: live.maxMinutes,
      freeSeconds: session.freeSeconds,
      freeAllowanceSeconds: session.freeAllowanceSeconds,
      freeAllocatedSeconds: session.freeAllocatedSeconds,
      freeUsedSeconds: session.freeUsedSeconds,
      freeRemainingSeconds: session.freeRemainingSeconds,
      freeAllocationVersion: session.freeAllocationVersion,
      freeAllocationFinalized: session.freeAllocationFinalized === true,
      avatarMode,
      billableStartedAt: session.billableStartedAt,
      createdAt: session.createdAt || session.billableStartedAt,
      wsPath: `/api/chat-live/ws?session=${encodeURIComponent(session.id)}`,
    },
    character: publicChatLiveCharacter(character),
  });
}

function sanitizeChatLiveDiagnosticText(value, max = 180) {
  return String(value || "")
    .replace(/bearer\s+\S+/gi, "bearer [redacted]")
    .replace(/[A-Za-z0-9_-]{24,}/g, "[redacted]")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

function isAbnormalChatLiveReason(reason = "") {
  const key = String(reason || "").trim();
  return key.startsWith("video_") || ["rtc_bye", "remote_offline", "idle_timeout", "client_reconnect_timeout", "join_failed", "socket_closed", "socket_error", "upstream_hangup"].includes(key);
}

function normalizeChatLiveIssues(issues) {
  const list = Array.isArray(issues) ? issues : [];
  const out = [];
  const seen = new Set();
  for (const item of list) {
    const code = String(item?.code || "").trim().slice(0, 48).replace(/[^a-z0-9_.-]/gi, "");
    const message = sanitizeChatLiveDiagnosticText(item?.message || "", 180);
    const at = String(item?.at || "").slice(0, 40);
    if (!code && !message) continue;
    const key = `${code}|${message}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ code, message, at });
    if (out.length >= 8) break;
  }
  return out;
}

function normalizeChatLiveOperations(operations) {
  const list = Array.isArray(operations) ? operations : [];
  return list.slice(-40).map((item) => ({
    id: String(item?.id || "").slice(0, 80),
    action: String(item?.action || "").slice(0, 32),
    phase: String(item?.phase || "").slice(0, 24),
    success: item?.success === true ? true : item?.success === false ? false : null,
    code: String(item?.code || "").slice(0, 48),
    message: sanitizeChatLiveDiagnosticText(item?.message || "", 180),
    kind: String(item?.kind || "").slice(0, 24),
    at: String(item?.at || "").slice(0, 40),
  })).filter((item) => item.id || item.action || item.message);
}

function mergeChatLiveIssues(...groups) {
  const flat = [];
  for (const group of groups) {
    if (Array.isArray(group)) flat.push(...group);
  }
  return normalizeChatLiveIssues(flat);
}

function chatLiveChargeExpected(session = {}, billedSeconds = null) {
  const freeSeconds = chatLiveFreeAllocationSeconds(session);
  const salePerMinute = Math.max(0, Number(session.saleCreditsPerMinute || 0) || 0);
  const chargeableSeconds = billedSeconds == null
    ? Math.max(0, Number(session.chargeableSeconds ?? Math.max(0, (Number(session.billedSeconds || 0) || 0) - freeSeconds)) || 0)
    : Math.max(0, (Number(billedSeconds || 0) || 0) - freeSeconds);
  if (!(salePerMinute > 0 && chargeableSeconds > 0)) return 0;
  return Math.max(1, Math.ceil(chargeCreditsFromSeconds(chargeableSeconds, salePerMinute)));
}

function chatLiveBillableLimitSeconds(session = {}) {
  const rawMaxMinutes = Number(session.maxMinutes || 0);
  const maxMinutes = Number.isFinite(rawMaxMinutes) && rawMaxMinutes > 0
    ? Math.min(120, Math.max(1, rawMaxMinutes))
    : 10;
  return Math.max(60, Math.round(maxMinutes * 60));
}

/* Shared-room viewers share the host's upstream live id. Vidu therefore
   reports the host's whole broadcast duration, not the viewer's stay. Their
   billable duration must come exclusively from the local entry/exit clock. */
function chatLiveLocalBillableSeconds(session = {}, now = Date.now()) {
  const startMs = Date.parse(session.billableStartedAt || session.createdAt || "");
  if (!Number.isFinite(startMs)) return 0;
  const endedMs = Date.parse(session.endedAt || "");
  const endMs = Number.isFinite(endedMs) ? endedMs : Number(now);
  if (!Number.isFinite(endMs)) return 0;
  return Math.min(
    chatLiveBillableLimitSeconds(session),
    Math.max(0, Math.floor((endMs - startMs) / 1000)),
  );
}

/* Vidu's billed_seconds is the authoritative upstream duration, but the
   customer-facing product limit is maxMinutes from the session snapshot.
   Keep the raw upstream value for diagnostics and cap only the sellable
   duration. The result must not depend on how many prepaid blocks happened
   to be reserved before the live ended. */
function chatLiveSettlementBilling(session = {}, upstreamBilledSeconds = 0) {
  const rawUpstreamSeconds = Number(upstreamBilledSeconds || 0);
  const upstreamSeconds = Number.isFinite(rawUpstreamSeconds) ? Math.max(0, rawUpstreamSeconds) : 0;
  const billingLimitSeconds = chatLiveBillableLimitSeconds(session);
  const cappedUpstreamSeconds = Math.min(upstreamSeconds, billingLimitSeconds);
  const freeSeconds = chatLiveFreeAllocationSeconds(session);
  const chargeableSeconds = Math.max(0, cappedUpstreamSeconds - freeSeconds);
  const rawSalePerMinute = Number(session.saleCreditsPerMinute || 0);
  const salePerMinute = Number.isFinite(rawSalePerMinute) ? Math.max(0, rawSalePerMinute) : 0;
  const chargeCredits = salePerMinute > 0 && chargeableSeconds > 0
    ? Math.max(1, Math.ceil(chargeCreditsFromSeconds(chargeableSeconds, salePerMinute)))
    : 0;
  return {
    upstreamSeconds,
    billingLimitSeconds,
    cappedUpstreamSeconds,
    freeSeconds,
    chargeableSeconds,
    chargeCredits,
  };
}

/* User-facing duration is always capped by the product limit. The raw Vidu
   value remains available separately for support diagnostics; it must never be
   rendered as the customer's billed duration. */
function chatLiveDisplayBilling(session = {}, upstreamBilledSeconds = null) {
  const billingLimitSeconds = chatLiveBillableLimitSeconds(session);
  const rawUpstream = upstreamBilledSeconds == null
    ? Number(session.upstreamBilledSeconds ?? session.billedSeconds ?? 0)
    : Number(upstreamBilledSeconds);
  const upstreamSeconds = Number.isFinite(rawUpstream) ? Math.max(0, rawUpstream) : 0;
  const readyMs = Date.parse(session.billableStartedAt || "");
  const endedMs = Date.parse(session.endedAt || "");
  const visibleNowMs = Number.isFinite(endedMs) ? endedMs : Date.now();
  const wallSeconds = Number.isFinite(readyMs)
    ? Math.max(0, Math.floor((visibleNowMs - readyMs) / 1000))
    : 0;
  const visibleSeconds = Math.min(billingLimitSeconds, wallSeconds);
  const cappedUpstreamSeconds = Math.min(billingLimitSeconds, upstreamSeconds);
  const billedSeconds = session.sharedRoomViewer === true
    ? chatLiveLocalBillableSeconds(session)
    : (session.billingPolicy === "entry"
      ? (cappedUpstreamSeconds > 0 ? Math.min(cappedUpstreamSeconds, visibleSeconds) : visibleSeconds)
      : cappedUpstreamSeconds);
  return {
    upstreamSeconds,
    billingLimitSeconds,
    visibleSeconds,
    cappedUpstreamSeconds,
    billedSeconds,
  };
}

function chatLiveSettlementLedgerAdjustment(ledgerTotals = null, chargeCredits = 0) {
  const rawExpected = Number(chargeCredits || 0);
  const expected = Number.isFinite(rawExpected)
    ? Math.max(0, Math.round(rawExpected * 10000) / 10000)
    : 0;
  if (!ledgerTotals) {
    return { known: false, expected, actual: 0, chargeDue: 0, refundDue: 0, matches: false };
  }
  const rawActual = Number(ledgerTotals.netCharge || 0);
  const actual = Number.isFinite(rawActual) ? Math.round(rawActual * 10000) / 10000 : 0;
  const difference = Math.round((expected - actual) * 10000) / 10000;
  return {
    known: true,
    expected,
    actual,
    chargeDue: Math.max(0, difference),
    refundDue: Math.max(0, -difference),
    matches: Math.abs(difference) < 0.0001,
  };
}

async function appendChatLiveOperation(sessionId, operation = {}) {
  const id = String(sessionId || "").trim();
  if (!id) return [];
  const entry = normalizeChatLiveOperations([{
    ...operation,
    at: operation.at || new Date().toISOString(),
  }])[0];
  if (!entry) return [];
  const result = await dbQuery(`
    UPDATE app_chat_live_sessions
    SET payload = jsonb_set(payload, '{operations}',
      (SELECT COALESCE(jsonb_agg(value ORDER BY ord), '[]'::jsonb)
       FROM jsonb_array_elements(COALESCE(payload->'operations', '[]'::jsonb) || $2::jsonb) WITH ORDINALITY AS entries(value, ord)
       WHERE ord >= GREATEST(1, jsonb_array_length(COALESCE(payload->'operations', '[]'::jsonb)) + 2 - 40)), true),
        updated_at = NOW()
    WHERE id = $1 RETURNING payload->'operations' AS operations
  `, [id, JSON.stringify([entry])]);
  return normalizeChatLiveOperations(result.rows[0]?.operations);
}

async function appendChatLiveDiagnosticInDb(sessionId = "", event = {}) {
  const id = String(sessionId || "").trim();
  if (!id) return [];
  const entry = chatLiveDiagnosticEvent(event, event);
  const result = await dbQuery(`
    UPDATE app_chat_live_sessions
    SET payload = jsonb_set(
          COALESCE(payload, '{}'::jsonb),
          '{diagnostics}',
          (SELECT COALESCE(jsonb_agg(value ORDER BY ord), '[]'::jsonb)
           FROM jsonb_array_elements(COALESCE(payload->'diagnostics', '[]'::jsonb) || $2::jsonb)
             WITH ORDINALITY AS entries(value, ord)
           WHERE ord >= GREATEST(
             1,
             jsonb_array_length(COALESCE(payload->'diagnostics', '[]'::jsonb)) + 2 - 30
           )),
          true
        ),
        updated_at = NOW()
    WHERE id = $1
    RETURNING payload->'diagnostics' AS diagnostics
  `, [id, JSON.stringify([entry])]);
  return Array.isArray(result.rows[0]?.diagnostics) ? result.rows[0].diagnostics : [];
}

async function touchChatLiveSessionInDb(sessionId = "") {
  const id = String(sessionId || "").trim();
  if (!id) return false;
  const result = await dbQuery(`
    UPDATE app_chat_live_sessions
    SET updated_at = NOW()
    WHERE id = $1
      AND COALESCE(payload->>'settled', 'false') NOT IN ('true', '1')
      AND COALESCE(payload->>'status', '') NOT IN ('ended', 'closed', 'failed')
    RETURNING id
  `, [id]);
  return Boolean(result.rows[0]?.id);
}

async function handleMarkChatLiveReady(req, res, sessionId = "") {
  const auth = await requireUser(req, res);
  if (!auth) return;
  const id = String(sessionId || "").trim();
  const session = await getChatLiveSessionInDb(id);
  if (!session || session.userId !== auth.user.id) return sendJson(res, 404, { ok: false, message: "会话不存在。" });
  /*
   * First frame is a diagnostic milestone only. Billing starts when the
   * entry response is created, so this endpoint must never create or replace
   * billableStartedAt, even for a legacy row that lacks the field.
   */
  const observedAt = new Date().toISOString();
  await appendChatLiveOperation(id, { id: `ready-${Date.now().toString(36)}`, action: "video_ready", phase: "success", success: true, message: "首个有效画面已到达", at: observedAt });
  await appendChatLiveDiagnosticInDb(id, {
    liveId: session.liveId,
    traceId: session.upstreamTraceId,
    phase: "first_frame",
    event: "video_ready",
    data: { source: "client", observedAt, billableStartedAt: session.billableStartedAt || "" },
  });
  const latest = await getChatLiveSessionInDb(id).catch(() => null);
  return sendJson(res, 200, { ok: true, billableStartedAt: latest?.billableStartedAt || session.billableStartedAt || "" });
}

async function handleReportChatLiveOperation(req, res, sessionId = "") {
  const auth = await requireUser(req, res);
  if (!auth) return;
  const id = String(sessionId || "").trim();
  const session = await getChatLiveSessionInDb(id);
  if (!session || session.userId !== auth.user.id) return sendJson(res, 404, { ok: false, message: "会话不存在。" });
  const body = await readJson(req).catch(() => ({}));
  const operationId = String(body?.id || `op-${Date.now().toString(36)}-${crypto.randomBytes(3).toString("hex")}`).slice(0, 80);
  const action = String(body?.action || "look").slice(0, 32);
  const phase = String(body?.phase || "result").slice(0, 24);
  if (action === "presence" && phase === "heartbeat" && session.settled !== true && !["ended", "closed", "failed"].includes(String(session.status || ""))) {
    await touchChatLiveSessionInDb(id);
  }
  const operations = await appendChatLiveOperation(id, {
    id: operationId,
    action,
    phase,
    success: body?.success === true ? true : body?.success === false ? false : null,
    code: String(body?.code || "").replace(/[^a-z0-9_.-]/gi, "").slice(0, 48),
    message: sanitizeChatLiveDiagnosticText(body?.message || "", 180),
    kind: String(body?.kind || "").slice(0, 24),
    at: new Date().toISOString(),
  });
  if (["rtc_subscribe", "client", "client_watch", "transport", "proxy_signal", "proxy_ack"].includes(String(body?.phase || ""))) {
    await appendChatLiveDiagnosticInDb(id, {
      liveId: session.liveId,
      traceId: session.upstreamTraceId,
      phase: String(body?.phase || "runtime"),
      event: String(body?.action || "operation"),
      data: { success: body?.success, code: body?.code || "", message: body?.message || "", kind: body?.kind || "", details: body?.details || null },
    });
  }
  return sendJson(res, 200, { ok: true, operationId, operations });
}

function normalizeChatLiveUpstreamStatus(value = "") {
  return String(value || "").trim().toLowerCase();
}

function chatLiveUpstreamIsTerminal(value = "") {
  return CHAT_LIVE_UPSTREAM_TERMINAL_STATUSES.has(normalizeChatLiveUpstreamStatus(value));
}

function chatLiveUpstreamBillingEvidence(payload = {}) {
  const liveInfo = payload?.live || payload || {};
  const hasSnakeCase = Object.prototype.hasOwnProperty.call(liveInfo, "billed_seconds");
  const hasCamelCase = Object.prototype.hasOwnProperty.call(liveInfo, "billedSeconds");
  const raw = hasSnakeCase ? liveInfo.billed_seconds : liveInfo.billedSeconds;
  if ((!hasSnakeCase && !hasCamelCase) || raw === null || raw === undefined || (typeof raw === "string" && !raw.trim())) {
    return { known: false, seconds: 0 };
  }
  if (!["number", "string"].includes(typeof raw)) return { known: false, seconds: 0 };
  const text = typeof raw === "string" ? raw.trim() : "";
  if (typeof raw === "string" && !/^\d+(?:\.\d+)?$/.test(text)) return { known: false, seconds: 0 };
  const seconds = Number(typeof raw === "string" ? text : raw);
  if (!Number.isFinite(seconds) || seconds < 0) return { known: false, seconds: 0 };
  return { known: true, seconds };
}

function chatLiveUpstreamEndedAt(payload = {}) {
  const liveInfo = payload?.live || payload || {};
  const raw = liveInfo.ended_at || liveInfo.end_time || liveInfo.endedAt || liveInfo.endTime || "";
  if (!raw) return "";
  const parsed = Date.parse(raw);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : "";
}

/* Display must use the same finality gate as settlement. An in-progress or
   malformed upstream snapshot is diagnostics only and cannot replace the
   already stored duration. A settled session may use its stored raw value when
   a later upstream query is temporarily unavailable. */
function chatLiveDisplayUpstreamEvidence(session = {}, detail = null) {
  const liveInfo = detail?.live || detail || {};
  const evidence = chatLiveUpstreamBillingEvidence(liveInfo);
  const terminalBillingKnown = Boolean(detail)
    && chatLiveUpstreamIsTerminal(liveInfo.status || "")
    && evidence.known;
  if (terminalBillingKnown) {
    return { known: true, seconds: evidence.seconds, source: "terminal_upstream" };
  }
  const settled = session.settled === true || String(session.settled || "").toLowerCase() === "true";
  if (settled) {
    const storedSeconds = Math.max(0, Number(session.upstreamBilledSeconds ?? session.billedSeconds ?? 0) || 0);
    return { known: true, seconds: storedSeconds, source: "settled_session" };
  }
  return { known: false, seconds: 0, source: "" };
}

/*
 * Chat-live billing is final only after Vidu explicitly reports a terminal
 * status together with an authoritative billed_seconds value. A wait timeout,
 * an on_live snapshot, a client endedAt, or a local age limit must never settle
 * a live session.
 */
function chatLiveSettlementDecision({ session = {}, detail = null, now = Date.now() } = {}) {
  const liveInfo = detail?.live || detail || {};
  const upstreamStatus = normalizeChatLiveUpstreamStatus(liveInfo.status || "");
  const terminalStatus = chatLiveUpstreamIsTerminal(upstreamStatus);
  const billingEvidence = chatLiveUpstreamBillingEvidence(liveInfo);
  const hasLiveId = Boolean(session.liveId);
  const sharedRoomViewer = session.sharedRoomViewer === true;
  const terminalBillingKnown = Boolean(detail) && terminalStatus && billingEvidence.known;
  const shouldFinalize = sharedRoomViewer || !hasLiveId || terminalBillingKnown;
  const localBilledSeconds = sharedRoomViewer ? chatLiveLocalBillableSeconds(session, now) : 0;
  return {
    liveInfo,
    upstreamStatus,
    terminalStatus,
    terminalBillingKnown,
    billingEvidence,
    shouldFinalize,
    finalBilledSeconds: sharedRoomViewer
      ? localBilledSeconds
      : (hasLiveId ? billingEvidence.seconds : 0),
    billingSource: sharedRoomViewer ? "shared_viewer_local" : (hasLiveId ? "terminal_upstream" : "local_session"),
    upstreamEndedAt: !sharedRoomViewer && hasLiveId && terminalBillingKnown ? chatLiveUpstreamEndedAt(liveInfo) : "",
  };
}

async function waitForChatLiveUpstreamEnd(liveId, region = "", timeoutMs = 60000) {
  const deadline = Date.now() + Math.max(0, Number(timeoutMs) || 60000);
  let last = null;
  while (Date.now() <= deadline) {
    try {
      last = await viduLiveRequest('/live/v1/lives/' + encodeURIComponent(liveId), { timeoutMs: 20000, region });
      const info = last?.live || last || {};
      if (chatLiveUpstreamIsTerminal(info.status)) return last;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, Math.min(5000, Math.max(250, deadline - Date.now()))));
  }
  return last;
}

async function chatLiveLedgerTotalsInDb(session = {}) {
  if (!dbEnabled() || !session?.id || !session?.userId) return null;
  const result = await dbQuery(`
    SELECT
      COALESCE(SUM(delta), 0)::numeric AS net_delta,
      COALESCE(SUM(CASE WHEN type = 'chat_live_hold' AND delta < 0 THEN -delta ELSE 0 END), 0)::numeric AS hold_debits,
      COALESCE(SUM(CASE WHEN type IN ('chat_live_hold_refund', 'chat_live_hold_subtoken_refund', 'chat_live_settlement_refund', 'chat_live_settlement_subtoken_refund') AND delta > 0 THEN delta ELSE 0 END), 0)::numeric AS hold_refund_credits,
      COALESCE(SUM(CASE WHEN type IN ('chat_live', 'chat_live_settlement') AND delta < 0 THEN -delta ELSE 0 END), 0)::numeric AS final_debits,
      COUNT(*) FILTER (WHERE type IN ('chat_live', 'chat_live_settlement') AND delta < 0)::int AS final_events,
      COUNT(*) FILTER (WHERE type = 'chat_live_settlement_refund' AND delta > 0)::int AS settlement_refund_events,
      COALESCE(SUM(CASE WHEN delta > 0 THEN delta ELSE 0 END), 0)::numeric AS refunded_credits
    FROM app_credit_ledger
    WHERE user_id = $1
      AND type LIKE 'chat_live%'
      AND type NOT LIKE '%gift%'
      AND COALESCE(
        NULLIF(meta->>'sessionId', ''),
        NULLIF(regexp_replace(COALESCE(meta->>'taskId', ''), ':(hold|hold-refund):.*$', ''), '')
      ) = $2
  `, [String(session.userId), String(session.id)]);
  const netDelta = Number(result.rows[0]?.net_delta || 0) || 0;
  const netCharge = Math.round(-netDelta * 10000) / 10000;
  return {
    netDelta,
    netCharge,
    chargedCredits: Math.max(0, netCharge),
    refundedCredits: Math.round(Math.max(0, Number(result.rows[0]?.refunded_credits || 0) || 0) * 10000) / 10000,
    holdDebits: Math.round(Math.max(0, Number(result.rows[0]?.hold_debits || 0) || 0) * 10000) / 10000,
    holdRefundCredits: Math.round(Math.max(0, Number(result.rows[0]?.hold_refund_credits || 0) || 0) * 10000) / 10000,
    finalDebits: Math.round(Math.max(0, Number(result.rows[0]?.final_debits || 0) || 0) * 10000) / 10000,
    finalEvents: Math.max(0, Number(result.rows[0]?.final_events || 0) || 0),
    settlementRefundEvents: Math.max(0, Number(result.rows[0]?.settlement_refund_events || 0) || 0),
  };
}

/*
 * Prepaid holds are real debits in app_credit_ledger. Refund only the unused
 * portion of hold debits; never derive a refund from stale session fields.
 * Existing refund rows make this idempotent across retries and processes.
 */
function chatLiveHoldRefundDue(ledgerTotals = null, chargeCredits = 0) {
  if (!ledgerTotals) return 0;
  const holdNet = Math.max(0,
    (Number(ledgerTotals.holdDebits || 0) || 0)
      - (Number(ledgerTotals.holdRefundCredits || 0) || 0));
  if ((Number(ledgerTotals.finalDebits || 0) || 0) > 0.0001) return Math.round(holdNet * 10000) / 10000;
  const finalCharge = Math.max(0, Number(chargeCredits || 0) || 0);
  return Math.round(Math.max(0, holdNet - finalCharge) * 10000) / 10000;
}

function chatLiveLedgerMatchesCharge(ledgerTotals = null, chargeCredits = 0) {
  if (!ledgerTotals) return false;
  const expected = Math.max(0, Number(chargeCredits || 0) || 0);
  const actual = Number(ledgerTotals.netCharge || 0) || 0;
  return Math.abs(actual - expected) < 0.0001;
}

function chatLiveCallDurationText(seconds = 0) {
  const total = Math.max(0, Math.floor(Number(seconds || 0) || 0));
  const minutes = Math.floor(total / 60);
  const remainder = total % 60;
  return `${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`;
}

function chatLiveSessionHistoryTerminal(session = {}) {
  if (session.settled === true) return true;
  const status = normalizeChatLiveUpstreamStatus(session.status);
  const upstreamStatus = normalizeChatLiveUpstreamStatus(session.upstreamStatus);
  return CHAT_LIVE_UPSTREAM_TERMINAL_STATUSES.has(status)
    || CHAT_LIVE_UPSTREAM_TERMINAL_STATUSES.has(upstreamStatus)
    || Boolean(String(session.endedAt || "").trim());
}

function chatLiveHistoryDurationSeconds(session = {}) {
  const limit = chatLiveBillableLimitSeconds(session);
  const billed = Math.max(0, Number(session.billedSeconds || session.upstreamBilledSeconds || 0) || 0);
  if (billed > 0) return Math.min(limit, Math.floor(billed));
  const startMs = Date.parse(session.billableStartedAt || session.createdAt || "");
  const endMs = Date.parse(session.endedAt || session.upstreamEndedAt || session.updatedAt || "");
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) return 0;
  return Math.min(limit, Math.max(0, Math.floor((endMs - startMs) / 1000)));
}

async function persistChatLiveCallHistory(session = {}) {
  const userId = String(session.userId || "").trim();
  const characterId = String(session.characterId || "").trim();
  const sessionId = String(session.id || "").trim();
  if (!dbEnabled() || !userId || !characterId || !sessionId || !chatLiveSessionHistoryTerminal(session)) return null;
  const billedSeconds = chatLiveHistoryDurationSeconds(session);
  const endedAt = String(session.endedAt || session.upstreamEndedAt || session.updatedAt || new Date().toISOString());
  let conversation = await findChatConversationByCharacterInDb(userId, characterId).catch(() => null);
  const now = new Date().toISOString();
  if (!conversation) {
    const character = await getChatLiveCharacterInDb(characterId).catch(() => null);
    const name = String(session.characterName || character?.name || "TA").trim();
    conversation = {
      id: `chat-live-history-${userId}-${characterId}`,
      userId,
      characterId,
      character: chatCharacterView(character || { id: characterId, name }),
      title: name,
      style: "balanced",
      memory: "",
      instructions: "",
      backgroundEnabled: true,
      lastMessage: "",
      createdAt: endedAt,
      updatedAt: endedAt,
    };
    // Messages have a PostgreSQL foreign key to the conversation, so the
    // conversation must exist before insertChatMessagesIfAbsentInDb runs.
    await upsertChatConversationInDb(conversation);
  }
  const duration = chatLiveCallDurationText(billedSeconds);
  const message = {
    id: `video-call-${sessionId}`,
    conversationId: String(conversation.id || ""),
    userId,
    role: "assistant",
    kind: "video_call",
    content: `视频通话 · ${duration} · 已结束`,
    sessionId,
    durationSeconds: billedSeconds,
    startedAt: String(session.billableStartedAt || session.createdAt || ""),
    endedAt,
    status: "ended",
    createdAt: endedAt,
    updatedAt: now,
  };
  const nextConversation = {
    ...conversation,
    lastMessage: message.content,
    updatedAt: message.createdAt,
  };
  /*
   * Backfilling an old call must never replace a newer chat preview. The
   * message is still inserted, while the conversation row is only touched when
   * this call is at least as recent as the conversation's current message.
   */
  const conversationUpdatedMs = Date.parse(conversation.updatedAt || conversation.createdAt || "");
  const callUpdatedMs = Date.parse(message.createdAt || "");
  const shouldUpdateConversation = !Number.isFinite(conversationUpdatedMs)
    || !Number.isFinite(callUpdatedMs)
    || callUpdatedMs >= conversationUpdatedMs;
  const saved = await insertChatMessagesIfAbsentInDb([message], shouldUpdateConversation ? nextConversation : null);
  if (saved?.inserted) console.log("[chat-live-history] stored", sessionId, message.content);
  return saved?.messages?.[0] || message;
}

async function settleChatLiveSession(session = {}, { auth = null } = {}) {
  if (!session?.id) return null;
  const initialLatest = await getChatLiveSessionInDb(session.id).catch(() => null);
  const requestedEndedAt = String(session.endedAt || "").trim();
  const initial = {
    ...(initialLatest || session),
    endedAt: initialLatest?.endedAt || requestedEndedAt || "",
  };
  if (initial.status === "ended" && initial.settled === true) {
    const settledCredits = Number(initial.chargedCredits || 0);
    if (settledCredits > 0) {
      try {
        await recordCreatorVideoViewEarningInDb({
          sessionId: initial.id,
          viewerUserId: initial.userId,
          characterId: initial.characterId,
          sourceCredits: settledCredits,
          earningRate: 0.3,
        });
      } catch (error) {
        console.warn("[creator-earning] retry failed", initial.id, error?.message || error);
      }
    }
    await persistChatLiveCallHistory(initial).catch((error) => {
      console.warn("[chat-live-history] retry failed", initial.id, error?.message || error);
    });
    return initial;
  }
  let detail = null;
  let upstreamError = "";
  const storedTerminalStatus = normalizeChatLiveUpstreamStatus(initial.upstreamStatus);
  const storedUpstreamSeconds = Number(initial.upstreamBilledSeconds);
  const hasStoredTerminalEvidence = initial.sharedRoomViewer !== true
    && chatLiveUpstreamIsTerminal(storedTerminalStatus)
    && Number.isFinite(storedUpstreamSeconds)
    && storedUpstreamSeconds >= 0;
  if (hasStoredTerminalEvidence) {
    /*
     * The monitor already persisted an authoritative terminal snapshot. Do
     * not hit Vidu again on every settlement retry: a ledger reconciliation
     * failure must not turn into an endless upstream polling loop.
     */
    detail = {
      live: {
        status: storedTerminalStatus,
        billed_seconds: storedUpstreamSeconds,
        credits_cost: Math.max(0, Number(initial.upstreamCredits || 0) || 0),
        close_reason: initial.endReason || "",
      },
    };
  } else if (initial.liveId && initial.sharedRoomViewer !== true) {
    try {
      detail = await waitForChatLiveUpstreamEnd(initial.liveId, initial.viduRegion || "", 60000);
    } catch (error) {
      detail = null;
      const code = String(error?.code || "").trim();
      upstreamError = sanitizeChatLiveDiagnosticText(code ? `${code}: ${error?.message || "upstream_query_failed"}` : (error?.message || "upstream_query_failed"));
    }
  }
  /*
   * Upstream polling happens outside the database lock so an API timeout does
   * not hold a transaction open. The read/reconcile/charge/refund/write phase
   * is serialized per session: a slow retry cannot overwrite a newer settled
   * snapshot, and concurrent callbacks cannot split the same hold twice.
   */
  const lockedResult = await withChatLiveSessionSettlementLockInDb(initial.id, async (lockedSession, client) => {
    const current = lockedSession
      ? { ...lockedSession, endedAt: lockedSession.endedAt || requestedEndedAt || "" }
      : initial;
    if (current.status === "ended" && current.settled === true) {
      return { session: null, value: { session: current, settlementCommitted: true } };
    }
    const settlement = chatLiveSettlementDecision({ session: current, detail });
    const { liveInfo, upstreamStatus, terminalStatus, terminalBillingKnown, shouldFinalize, billingSource } = settlement;
    const startedMs = Date.parse(current.createdAt || "");
    const maxAgeMs = chatLiveBillableLimitSeconds(current) * 1000 + 120000;
    const localAgeExceeded = Number.isFinite(startedMs) && Date.now() - startedMs > maxAgeMs;
    const observedUpstreamBilledSeconds = Math.max(0, Number(current.upstreamBilledSeconds ?? current.billedSeconds ?? 0) || 0);
    const observedHostUpstreamBilledSeconds = Math.max(
      0,
      Number(current.hostUpstreamBilledSeconds ?? 0) || 0,
      current.sharedRoomViewer === true ? observedUpstreamBilledSeconds : 0,
      current.sharedRoomViewer === true && settlement.billingEvidence.known ? settlement.billingEvidence.seconds : 0,
    );
    const upstreamBilledSeconds = current.sharedRoomViewer === true
      ? 0
      : (settlement.billingEvidence.known ? settlement.billingEvidence.seconds : observedUpstreamBilledSeconds);
    const hostUpstreamBilledSeconds = current.sharedRoomViewer === true
      ? observedHostUpstreamBilledSeconds
      : Math.max(0, Number(current.hostUpstreamBilledSeconds || 0) || 0);
    const upstreamCredits = Math.max(0, Number(liveInfo.credits_cost ?? current.upstreamCredits ?? 0) || 0);
    const finalUpstreamSeconds = shouldFinalize
      ? (settlement.billingSource === "shared_viewer_local"
        ? settlement.finalBilledSeconds
        : (current.liveId ? settlement.finalBilledSeconds : Math.max(0, Number(current.billedSeconds || 0) || 0)))
      : Math.max(0, Number(current.billedSeconds || 0) || 0);
    let billingSession = current;
    if (shouldFinalize && current.freeAllocationVersion === "cumulative_v1") {
      const finalized = await finalizeChatLiveFreeAllocationInDb(
        current.id,
        Math.min(
          chatLiveBillableLimitSeconds(current),
          finalUpstreamSeconds,
          Math.max(0, Number(current.freeAllocatedSeconds || 0) || 0),
        ),
        client,
      );
      if (finalized.found) {
        billingSession = {
          ...current,
          freeAllowanceSeconds: finalized.configuredSeconds,
          freeAllocatedSeconds: finalized.allocatedSeconds,
          freeUsedSeconds: finalized.allocatedSeconds,
          freeRemainingSeconds: finalized.remainingSeconds,
          freeAllocationFinalized: true,
          freeAllocationFinalizedAt: current.freeAllocationFinalizedAt || new Date().toISOString(),
        };
      }
    }
    const billing = chatLiveSettlementBilling(billingSession, finalUpstreamSeconds);
    let diagnostics = Array.isArray(current.diagnostics) ? [...current.diagnostics] : [];
    diagnostics = appendChatLiveDiagnostic(current, {
      phase: "settlement",
      event: "vidu_final_status",
      traceId: liveInfo.trace_id || detail?.trace_id || "",
      liveId: current.liveId,
      data: {
        response: chatLiveUpstreamSummary(detail, 200),
        terminalStatus,
        terminalBillingKnown,
        shouldFinalize,
        billingSource,
        localAgeExceeded,
        upstreamBilledSeconds: settlement.billingEvidence.seconds,
        localBillableSeconds: settlement.billingSource === "shared_viewer_local" ? settlement.finalBilledSeconds : undefined,
        billingLimitSeconds: billing.billingLimitSeconds,
        cappedUpstreamSeconds: billing.cappedUpstreamSeconds,
        chargeableSeconds: billing.chargeableSeconds,
        chargeCredits: billing.chargeCredits,
      },
    });
    const now = new Date().toISOString();
    let ledgerTotals = null;
    let ledgerAdjustment = chatLiveSettlementLedgerAdjustment(null, billing.chargeCredits);
    let settlementError = "";
    let finalChargedCredits = Math.max(0, Number(current.chargedCredits || 0) || 0);
    let refundedCredits = Math.max(0, Number(current.refundedCredits || 0) || 0);
    if (shouldFinalize) {
      if (!auth && billing.chargeCredits > 0) {
        settlementError = "找不到用户，未能完成结算对账";
      } else if (auth) {
        ledgerTotals = await chatLiveLedgerTotalsInDb(current).catch(() => null);
        ledgerAdjustment = chatLiveSettlementLedgerAdjustment(ledgerTotals, billing.chargeCredits);
        if (!ledgerTotals) {
          settlementError = "结算账本读取失败，稍后重试";
        } else {
          try {
            if (ledgerAdjustment.chargeDue > 0) {
              await chargeChatLiveSettlementBalance(
                auth,
                {
                  ...current,
                  chargeableSeconds: billing.chargeableSeconds,
                  upstreamBilledSeconds,
                  hostUpstreamBilledSeconds,
                  billingSource,
                },
                ledgerAdjustment.chargeDue,
                ledgerTotals.finalEvents,
              );
            } else if (ledgerAdjustment.refundDue > 0) {
              await refundChatLiveSettlementCredits(
                auth,
                current,
                ledgerAdjustment.refundDue,
                ledgerTotals.settlementRefundEvents,
              );
            }
          } catch (error) {
            settlementError = sanitizeChatLiveDiagnosticText(error?.message || "结算账本调整失败");
          }
          ledgerTotals = await chatLiveLedgerTotalsInDb(current).catch(() => null);
          ledgerAdjustment = chatLiveSettlementLedgerAdjustment(ledgerTotals, billing.chargeCredits);
          if (ledgerTotals) {
            finalChargedCredits = Math.max(0, Number(ledgerTotals.chargedCredits || 0) || 0);
            refundedCredits = Math.max(0, Number(ledgerTotals.refundedCredits || 0) || 0);
          }
        }
      }
    }
    const canFinalizeBilling = shouldFinalize && (auth ? ledgerAdjustment.matches : billing.chargeCredits <= 0);
    if (shouldFinalize && !canFinalizeBilling && !settlementError) {
      settlementError = `结算账本未对齐：应扣 ${ledgerAdjustment.expected}，实际净扣 ${ledgerAdjustment.actual}`;
    }
    const issues = mergeChatLiveIssues(current.issues);
    const preservedUpstreamStatus = upstreamStatus || current.upstreamStatus || "";
    const preservedUpstreamError = upstreamError || (detail ? "" : (current.upstreamError || ""));
    const preservedChargeError = canFinalizeBilling
      ? ""
      : (settlementError || current.chargeError || "");
    const updated = {
      ...billingSession,
      status: canFinalizeBilling ? "ended" : (billingSession.status || "waiting"),
      billedSeconds: canFinalizeBilling ? billing.cappedUpstreamSeconds : Math.max(0, Number(current.billedSeconds || 0) || 0),
      upstreamBilledSeconds,
      hostUpstreamBilledSeconds,
      billingSource,
      billingLimitSeconds: billing.billingLimitSeconds,
      chargeableSeconds: canFinalizeBilling ? billing.chargeableSeconds : Math.max(0, Number(current.chargeableSeconds || 0) || 0),
      billableStartedAt: current.billableStartedAt || "",
      operations: normalizeChatLiveOperations(current.operations),
      upstreamCredits,
      upstreamStatus: preservedUpstreamStatus,
      upstreamError: preservedUpstreamError,
      chargeError: preservedChargeError,
      chargedCredits: finalChargedCredits,
      charged: canFinalizeBilling ? finalChargedCredits > 0 : current.charged === true,
      refundedCredits,
      holdSettled: canFinalizeBilling ? true : current.holdSettled === true,
      settled: canFinalizeBilling,
      endReason: liveInfo.close_reason || current.endReason || "",
      clientEndReason: current.clientEndReason || "",
      clientEndNote: current.clientEndNote || "",
      issues,
      diagnostics,
      upstreamEndedAt: settlement.upstreamEndedAt || current.upstreamEndedAt || "",
      endedAt: canFinalizeBilling
        ? (settlement.billingSource === "shared_viewer_local"
          ? (current.endedAt || now)
          : (settlement.upstreamEndedAt || current.endedAt || now))
        : (current.endedAt || ""),
      updatedAt: now,
    };
    return { session: updated, value: { session: updated, settlementCommitted: canFinalizeBilling } };
  });
  if (!lockedResult?.session) return null;
  const updated = lockedResult.session;
  // Creator royalties are based on the credits actually settled for this call.
  // Recording happens after the session transaction commits; the creator
  // ledger is keyed by session ID, so retries cannot split earnings twice.
  const earningSourceCredits = Number(updated?.chargedCredits || 0);
  if (lockedResult.settlementCommitted === true && earningSourceCredits > 0) {
    try {
      await recordCreatorVideoViewEarningInDb({
        sessionId: updated.id,
        viewerUserId: updated.userId,
        characterId: updated.characterId,
        sourceCredits: earningSourceCredits,
        earningRate: 0.3,
      });
    } catch (error) {
      console.warn("[creator-earning] record failed", updated.id, error?.message || error);
    }
  }
  if (chatLiveSessionHistoryTerminal(updated)) {
    try {
      await persistChatLiveCallHistory(updated);
    } catch (error) {
      console.warn("[chat-live-history] persist failed", updated.id, error?.message || error);
    }
  }
  return updated;
}

async function chargeChatLiveSettlementBalance(auth, session = {}, credits = 0, priorFinalEvents = 0) {
  const amount = Math.max(0, Math.round(Number(credits || 0) * 10000) / 10000);
  if (!(amount > 0)) return;
  const attempt = Math.max(1, Number(priorFinalEvents || 0) + 1);
  const taskId = `${session.id}:settlement:${attempt}`;
  await chargeUserWithSubtoken(auth, {
    cost: amount,
    type: "chat_live_settlement",
    taskId,
    meta: {
      taskId,
      sessionId: session.id,
      liveId: session.liveId,
      characterId: session.characterId,
      seconds: session.chargeableSeconds,
      upstreamBilledSeconds: session.upstreamBilledSeconds,
      model: session.model,
      externalUserId: session.externalUserId || "",
    },
  });
}

async function refundChatLiveSettlementCredits(auth, session = {}, credits = 0, priorRefundEvents = 0) {
  const amount = Math.max(0, Math.round(Number(credits || 0) * 10000) / 10000);
  if (!(amount > 0) || !auth?.user?.id) return;
  const attempt = Math.max(1, Number(priorRefundEvents || 0) + 1);
  const taskId = `${session.id}:settlement-refund:${attempt}`;
  await changeUserCredits(auth.db, auth.user.id, amount, "chat_live_settlement_refund", {
    taskId,
    sessionId: session.id,
    liveId: session.liveId,
    refundId: taskId,
  });
  try {
    await recordSubtokenAdjustment(auth, {
      taskId,
      type: "chat_live_settlement_refund",
      amount: -amount,
      meta: { taskId, sessionId: session.id, liveId: session.liveId },
    });
  } catch {}
}

function chargeCreditsFromSeconds(seconds, creditsPerMinute) {
  return (Number(seconds || 0) / 60) * Number(creditsPerMinute || 0);
}

async function chargeChatLiveSession(auth, session, credits) {
  try {
    await chargeUserWithSubtoken(auth, {
      cost: credits,
      type: "chat_live",
      taskId: session.id,
      meta: { taskId: session.id, liveId: session.liveId, characterId: session.characterId, seconds: session.billedSeconds, model: session.model, externalUserId: session.externalUserId || "" },
    });
    return { ok: true, error: "" };
  } catch (error) {
    const message = sanitizeChatLiveDiagnosticText(error?.message || "扣费失败");
    console.warn("[chat-live] charge failed", message || "charge_failed");
    return { ok: false, error: message || "扣费失败" };
  }
}

function chatLiveBlockCredits(session = {}, seconds = CHAT_LIVE_BILLING_BLOCK_SECONDS) {
  const rate = Math.max(0, Number(session.saleCreditsPerMinute || 0) || 0);
  return Math.max(1, Math.ceil(chargeCreditsFromSeconds(seconds, rate)));
}

/*
 * Free seconds are consumed before paid coverage. prepaidSeconds is therefore
 * measured on the paid clock, not on total session time. Keeping this mapping
 * in one helper prevents the monitor and API from closing a session while the
 * user still has unused prepaid seconds.
 */
function chatLivePaidCoverageStatus(session = {}, observedLiveSeconds = 0) {
  const observed = Math.max(0, Math.floor(Number(observedLiveSeconds || 0) || 0));
  const freeSeconds = chatLiveFreeAllocationSeconds(session);
  const paidSeconds = Math.max(0, observed - freeSeconds);
  const prepaidSeconds = Math.max(0, Number(session.prepaidSeconds || 0) || 0);
  const paidCoverageRemainingSeconds = Math.max(0, prepaidSeconds - paidSeconds);
  return {
    observedLiveSeconds: observed,
    freeSeconds,
    paidSeconds,
    prepaidSeconds,
    paidCoverageRemainingSeconds,
    hasPaidCoverage: paidCoverageRemainingSeconds > 0,
  };
}

async function reserveChatLiveBlock(auth, session = {}, seconds = CHAT_LIVE_BILLING_BLOCK_SECONDS) {
  const holdSequence = Math.max(0, Number(session.holdSequence || 0) || 0) + 1;
  const credits = chatLiveBlockCredits(session, seconds);
  const holdId = session.id + ':hold:' + holdSequence;
  await chargeUserWithSubtoken(auth, {
    cost: credits,
    type: 'chat_live_hold',
    taskId: holdId,
    meta: { taskId: holdId, liveId: session.liveId, holdId, holdSequence, seconds, sessionId: session.id, externalUserId: session.externalUserId || "" },
  });
  return { holdSequence, holdId, credits, seconds };
}

async function refundChatLiveHold(auth, session = {}, credits = 0, holdId = '') {
  const amount = Math.max(0, Number(credits || 0) || 0);
  if (!(amount > 0) || !auth?.user?.id) return;
  const refundId = session.id + ':hold-refund:' + (holdId || Date.now());
  await changeUserCredits(auth.db, auth.user.id, amount, 'chat_live_hold_refund', { taskId: refundId, liveId: session.liveId, sessionId: session.id, holdId, refundId });
  try { await recordSubtokenAdjustment(auth, { taskId: refundId, type: 'chat_live_hold_refund', amount: -amount, meta: { taskId: refundId, liveId: session.liveId, holdId, refundId } }); } catch {}
}

async function closeChatLiveForInsufficientCredits(session = {}) {
  const socket = chatLiveSockets.get(String(session.id || ''));
  if (socket) { try { socket.destroy(); } catch {} }
  if (session.mode === 'component' && session.liveId && session.sharedRoomViewer !== true) { try { chatLiveComponent.stopComponentSession(session.liveId); } catch {} }
  if (session.mode === 'compute-relay') viduLiveRelay.closeSession(session.id, true, "insufficient_credits");
}

