async function monitorChatLiveSession(session = {}) {
  if (!session?.id || session.settled === true || !session.liveId) return session;
  if (chatLiveBillingLocks.has(session.id)) return session;
  chatLiveBillingLocks.add(session.id);
  try {
    const detail = await viduLiveRequest('/live/v1/lives/' + encodeURIComponent(session.liveId), { timeoutMs: 12000, region: session.viduRegion || '' });
    const liveInfo = detail?.live || detail || {};
    const billingEvidence = chatLiveUpstreamBillingEvidence(liveInfo);
    const upstreamSeconds = billingEvidence.seconds;
    const liveStatus = normalizeChatLiveUpstreamStatus(liveInfo.status || "");
    const terminalStatus = chatLiveUpstreamIsTerminal(liveStatus);
    const auth = await chatLiveSettlementAuth(session.userId);
    /*
     * A monitor tick and a final settlement can race. Serialize the balance
     * check, hold reservation, and session snapshot with the same per-session
     * advisory lock used by settlement. Upstream polling stays outside the
     * transaction, and settlement is triggered only after the lock commits.
     */
    const result = await withChatLiveSessionSettlementLockInDb(session.id, async (lockedSession) => {
      const current = lockedSession || session;
      if (current.settled === true || !current.liveId) {
        return { session: null, value: { session: current, shouldSettle: false, closeInsufficient: false } };
      }
      const liveStartedMs = Date.parse(current.billableStartedAt || current.createdAt || "");
      const activeLiveStatus = ["on_live", "live", "running", "active", "started", "starting", "connected"].includes(liveStatus);
      const sharedRoomViewer = current.sharedRoomViewer === true;
      const hasWallClock = (sharedRoomViewer || activeLiveStatus) && Number.isFinite(liveStartedMs);
      const wallLiveSeconds = hasWallClock
        ? Math.max(0, Math.floor((Date.now() - liveStartedMs) / 1000))
        : 0;
      let diagnostics = appendChatLiveDiagnostic(current, {
        phase: "upstream_poll",
        event: "vidu_live_status",
        traceId: liveInfo.trace_id || detail?.trace_id || "",
        liveId: session.liveId,
        data: { response: chatLiveUpstreamSummary(detail, 200) },
      });
      /*
       * A terminal snapshot is settlement evidence, never a reason to reserve
       * another prepaid block. Trigger the normal settlement gate after this
       * transaction commits; that gate still requires authoritative
       * billed_seconds before it can charge or mark the session settled.
       */
      if (terminalStatus) {
        const terminalAt = new Date().toISOString();
        const terminal = {
          ...current,
          upstreamStatus: liveInfo.status || current.upstreamStatus || "",
          upstreamBilledSeconds: sharedRoomViewer
            ? 0
            : (billingEvidence.known
              ? upstreamSeconds
              : Math.max(0, Number(current.upstreamBilledSeconds || 0) || 0)),
          hostUpstreamBilledSeconds: sharedRoomViewer && billingEvidence.known
            ? upstreamSeconds
            : Math.max(0, Number(current.hostUpstreamBilledSeconds || 0) || 0),
          upstreamCredits: Math.max(0, Number(liveInfo.credits_cost ?? current.upstreamCredits ?? 0) || 0),
          diagnostics,
          endedAt: sharedRoomViewer ? (current.endedAt || terminalAt) : (current.endedAt || ""),
          updatedAt: terminalAt,
        };
        return {
          session: terminal,
          value: {
            session: terminal,
            shouldSettle: sharedRoomViewer || billingEvidence.known,
            closeInsufficient: false,
          },
        };
      }
      // During an active live, billed_seconds is not final evidence. Prefer the
      // local wall clock so an anomalous in-progress snapshot cannot
      // skip prepaid accounting or trigger an early close. Only use upstream
      // seconds as a fallback when no wall clock is available, and always cap
      // the running estimate to the product limit.
      const observedLiveSeconds = sharedRoomViewer
        ? chatLiveLocalBillableSeconds(current)
        : Math.min(
          chatLiveBillableLimitSeconds(current),
          hasWallClock ? wallLiveSeconds : Math.min(upstreamSeconds, chatLiveBillableLimitSeconds(current)),
        );
      const coverage = chatLivePaidCoverageStatus(current, observedLiveSeconds);
      const { freeSeconds, paidSeconds } = coverage;
      if (freeSeconds > 0 && observedLiveSeconds < freeSeconds) {
        const waiting = {
          ...current,
          upstreamBilledSeconds: sharedRoomViewer ? 0 : upstreamSeconds,
          hostUpstreamBilledSeconds: sharedRoomViewer && billingEvidence.known
            ? upstreamSeconds
            : Math.max(0, Number(current.hostUpstreamBilledSeconds || 0) || 0),
          billedSeconds: observedLiveSeconds,
          billingObservedAt: new Date().toISOString(),
          diagnostics: appendChatLiveDiagnostic({ ...current, diagnostics }, {
            phase: "billing",
            event: "free_allowance_active",
            data: {
              observedLiveSeconds,
              freeSeconds,
              paidSeconds,
              balance: Number(auth?.user?.credits || 0) || 0,
              decision: "waiting_for_free_allowance",
            },
          }),
          updatedAt: new Date().toISOString(),
        };
        return { session: waiting, value: { session: waiting, shouldSettle: false, closeInsufficient: false } };
      }
      const prepaidBeforeTopUp = coverage.prepaidSeconds;
      const topUpTarget = Math.min(
        chatLiveBillableLimitSeconds(current),
        Math.max(paidSeconds + CHAT_LIVE_BILLING_TARGET_SECONDS, prepaidBeforeTopUp + CHAT_LIVE_BILLING_TARGET_SECONDS),
      );
      diagnostics = appendChatLiveDiagnostic({ ...current, diagnostics }, {
        phase: "billing",
        event: "balance_check",
        data: {
          observedLiveSeconds,
          upstreamBilledSeconds: upstreamSeconds,
          paidSeconds,
          prepaidSeconds: current.prepaidSeconds || 0,
          prepaidCredits: current.prepaidCredits || 0,
          balance: Number(auth?.user?.credits || 0) || 0,
          decision: "checking_renewal",
        },
      });
      if (!sharedRoomViewer && !current.billableStartedAt && billingEvidence.known && upstreamSeconds > 0) {
        current.billableStartedAt = new Date().toISOString();
      }
      if (sharedRoomViewer) {
        current.upstreamBilledSeconds = 0;
        if (billingEvidence.known) current.hostUpstreamBilledSeconds = upstreamSeconds;
      } else if (billingEvidence.known) {
        current.upstreamBilledSeconds = upstreamSeconds;
      }
      current.billedSeconds = observedLiveSeconds;
      current.billingObservedAt = new Date().toISOString();
      let prepaidSeconds = prepaidBeforeTopUp;
      let prepaidCredits = Math.max(0, Number(current.prepaidCredits || 0) || 0);
      while (auth && prepaidSeconds - paidSeconds <= 15 && prepaidSeconds < topUpTarget) {
        /*
         * Reserve only what is still uncovered. A user who enters with 30 of
         * the first 40 billing seconds prepaid must get those 10 seconds before
         * the server attempts to reserve another block; asking for a full block
         * here would disconnect someone whose current paid coverage is intact.
         */
        const block = Math.min(
          CHAT_LIVE_BILLING_BLOCK_SECONDS,
          topUpTarget - paidSeconds,
          topUpTarget - prepaidSeconds,
        );
        try {
          const hold = await reserveChatLiveBlock(auth, current, block);
          diagnostics = appendChatLiveDiagnostic({ ...current, diagnostics }, {
            phase: "billing",
            event: "prepaid_block_reserved",
            data: { seconds: hold.seconds, credits: hold.credits, holdSequence: hold.holdSequence, balanceAfter: Number(auth?.user?.credits || 0) || 0 },
          });
          prepaidSeconds += hold.seconds;
          prepaidCredits += hold.credits;
          current.holdSequence = hold.holdSequence;
        } catch (error) {
          const renewalError = error?.message || '积分不足，已停止续费';
          diagnostics = appendChatLiveDiagnostic({ ...current, diagnostics }, {
            phase: "billing",
            event: "prepaid_block_rejected",
            data: {
              requestedSeconds: block,
              requestedCredits: chatLiveBlockCredits(current, block),
              balance: Number(auth?.user?.credits || 0) || 0,
              error: renewalError,
              freeSeconds,
              paidSeconds,
              prepaidSeconds,
              paidCoverageRemainingSeconds: Math.max(0, prepaidSeconds - paidSeconds),
            },
          });
          const coverageAfterFailure = chatLivePaidCoverageStatus({
            ...current,
            prepaidSeconds,
            prepaidCredits,
          }, observedLiveSeconds);
          if (coverageAfterFailure.hasPaidCoverage) {
            /*
             * Renewal can fail while an earlier hold still covers the current
             * second. Keep the user connected and retry on the next tick; only
             * disconnect after the paid coverage is actually exhausted.
             */
            diagnostics = appendChatLiveDiagnostic({ ...current, diagnostics }, {
              phase: "billing",
              event: "prepaid_coverage_active",
              data: {
                paidCoverageRemainingSeconds: coverageAfterFailure.paidCoverageRemainingSeconds,
                decision: "retry_renewal_after_coverage",
              },
            });
            const next = {
              ...current,
              prepaidSeconds,
              prepaidCredits,
              billingBlocked: false,
              billingRenewalError: renewalError,
              diagnostics,
              updatedAt: new Date().toISOString(),
            };
            return { session: next, value: { session: next, shouldSettle: false, closeInsufficient: false } };
          }
          current.billingBlocked = true;
          current.chargeError = renewalError;
          current.endReason = 'insufficient_credits';
          const blocked = {
            ...current,
            prepaidSeconds,
            prepaidCredits,
            diagnostics,
            status: 'ended',
            settled: false,
            holdSettled: false,
            endedAt: current.endedAt || new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          };
          return { session: blocked, value: { session: blocked, shouldSettle: true, closeInsufficient: true } };
        }
      }
      current.prepaidSeconds = prepaidSeconds;
      current.prepaidCredits = prepaidCredits;
      const coverageAfterTopUp = chatLivePaidCoverageStatus(current, observedLiveSeconds);
      current.billingBlocked = !coverageAfterTopUp.hasPaidCoverage && observedLiveSeconds > 0;
      if (coverageAfterTopUp.hasPaidCoverage) current.billingRenewalError = current.billingRenewalError || "";
      const next = { ...current, diagnostics, updatedAt: new Date().toISOString() };
      return { session: next, value: { session: next, shouldSettle: false, closeInsufficient: current.billingBlocked } };
    });
    const next = result?.session || session;
    if (result?.closeInsufficient) await closeChatLiveForInsufficientCredits(next);
    if (result?.shouldSettle && next?.id) {
      /* Return all unused prepaid blocks after the session lock commits. The
         normal settlement path is idempotent and records the refund ledger. */
      return await settleChatLiveSessionById(next.id).catch(() => next);
    }
    return next;
  } catch (error) {
    console.warn("[chat-live-billing-monitor-failed]", session.id, error?.message || error);
    return session;
  } finally { chatLiveBillingLocks.delete(session.id); }
}

async function handleEndChatLiveSession(req, res, sessionId = "") {
  const auth = await requireUser(req, res);
  if (!auth) return;
  const session = await getChatLiveSessionInDb(String(sessionId || "").trim());
  if (!session || session.userId !== auth.user.id) return sendJson(res, 404, { ok: false, message: "会话不存在。" });
  const body = await readJson(req).catch(() => ({}));
  const clientReason = String(body?.reason || body?.endReason || "").trim().slice(0, 64).replace(/[^a-z0-9_.-]/gi, "");
  const note = sanitizeChatLiveDiagnosticText(body?.note || "", 180);
  if (clientReason) {
    session.clientEndReason = clientReason;
    if (!session.endReason) session.endReason = clientReason;
  }
  if (note) session.clientEndNote = note;
  if (!session.endedAt) session.endedAt = new Date().toISOString();
  await publishChatLiveRoomEvent(session, { role: "system", content: `${String(session.username || auth.user.username || "有人")} 离开了房间`, userId: auth.user.id }).catch(() => {});
  if (isAbnormalChatLiveReason(clientReason)) {
    session.issues = mergeChatLiveIssues(session.issues, [{
      code: clientReason,
      message: note,
      at: new Date().toISOString(),
    }]);
  }
  if (session.mode === "component" && session.liveId && session.sharedRoomViewer !== true) {
    try { chatLiveComponent.stopComponentSession(session.liveId); } catch {}
  }
  if (session.status === "ended" && session.settled === true) {
    /*
     * A late end request may race a settlement or another client write. Merge
     * only request metadata while holding the same lock as settlement, so this
     * path can never write an old snapshot back over charged/settled fields.
     */
    const result = await withChatLiveSessionSettlementLockInDb(session.id, async (lockedSession) => {
      if (!lockedSession) return { session: null, value: { session: null, settlementCommitted: false } };
      const issues = mergeChatLiveIssues(lockedSession.issues, session.issues);
      const next = {
        ...lockedSession,
        clientEndReason: session.clientEndReason || lockedSession.clientEndReason || "",
        clientEndNote: session.clientEndNote || lockedSession.clientEndNote || "",
        endReason: lockedSession.endReason || session.endReason || "",
        endedAt: lockedSession.endedAt || session.endedAt || "",
        issues,
        updatedAt: new Date().toISOString(),
      };
      return {
        session: next,
        value: {
          session: next,
          settlementCommitted: next.status === "ended" && next.settled === true,
        },
      };
    });
    const updated = result?.session;
    if (!updated) return sendJson(res, 404, { ok: false, message: "会话不存在。" });
    if (!result.settlementCommitted) {
      const settled = await settleChatLiveSession(updated, { auth });
      await persistChatLiveCallHistory(settled || updated).catch((error) => {
        console.warn("[chat-live-history] late-end persist failed", updated.id, error?.message || error);
      });
      return sendJson(res, 200, { ok: true, session: publicChatLiveSession(settled) });
    }
    await persistChatLiveCallHistory(updated).catch((error) => {
      console.warn("[chat-live-history] settled-end persist failed", updated.id, error?.message || error);
    });
    if (updated?.billableStartedAt && Number(updated.billedSeconds || 0) > 0) {
      await recordEffectiveInteractionDay(auth.user.id, updated.characterId, "video").catch((error) => {
        console.warn("[companion-video-day-failed]", String(error?.message || error).slice(0, 180));
      });
    }
    return sendJson(res, 200, { ok: true, session: publicChatLiveSession(updated) });
  }
  const settled = await settleChatLiveSession(session, { auth });
  if (settled?.billableStartedAt && Number(settled.billedSeconds || 0) > 0) {
    await recordEffectiveInteractionDay(auth.user.id, settled.characterId, "video").catch((error) => {
      console.warn("[companion-video-day-failed]", String(error?.message || error).slice(0, 180));
    });
  }
  return sendJson(res, 200, { ok: true, session: publicChatLiveSession(settled) });
}

async function handleReportChatLiveSessionIssue(req, res, sessionId = "") {
  const auth = await requireUser(req, res);
  if (!auth) return;
  const id = String(sessionId || "").trim();
  const session = await getChatLiveSessionInDb(id);
  if (!session || session.userId !== auth.user.id) return sendJson(res, 404, { ok: false, message: "会话不存在。" });
  const body = await readJson(req).catch(() => ({}));
  const code = String(body?.code || body?.reason || "").trim().slice(0, 48).replace(/[^a-z0-9_.-]/gi, "");
  const message = sanitizeChatLiveDiagnosticText(body?.message || body?.note || "", 180);
  if (!code && !message) return sendJson(res, 422, { ok: false, message: "缺少问题信息。" });
  const issue = { code: code || "client", message, at: new Date().toISOString() };
  /*
   * Issues and diagnostics are appended under the settlement lock. Using a
   * whole-session snapshot here could overwrite a concurrent settled result.
   */
  const result = await withChatLiveSessionSettlementLockInDb(id, async (lockedSession) => {
    if (!lockedSession) return { session: null, value: { stored: false } };
    const issues = mergeChatLiveIssues(lockedSession.issues, [issue]);
    if (JSON.stringify(normalizeChatLiveIssues(lockedSession.issues)) === JSON.stringify(issues)) {
      return { session: null, value: { stored: false } };
    }
    const next = {
      ...lockedSession,
      issues,
      diagnostics: appendChatLiveDiagnostic(lockedSession, {
        phase: "client_watch",
        event: code || "client_issue",
        data: { message, code },
      }),
      updatedAt: new Date().toISOString(),
    };
    return { session: next, value: { stored: true } };
  });
  return sendJson(res, 200, { ok: true, stored: result?.stored === true });
}

async function handleSaveChatLiveStoryState(req, res, sessionId = "") {
  const auth = await requireUser(req, res);
  if (!auth) return;
  const session = await getChatLiveSessionInDb(String(sessionId || "").trim());
  if (!session || session.userId !== auth.user.id) return sendJson(res, 404, { ok: false, message: "会话不存在。" });
  if (session.mode !== "component") return sendJson(res, 400, { ok: false, code: "NOT_COMPONENT_SESSION", message: "该会话不是组件版。" });
  if (session.settled === true || ["ended", "closed", "failed"].includes(String(session.status || ""))) {
    return sendJson(res, 409, { ok: false, message: "会话已经结束。" });
  }
  const body = await readJson(req).catch(() => ({}));
  const character = await getChatLiveCharacterInDb(session.characterId);
  const story = normalizeChatLiveStory(character?.liveStory || {});
  if (!story.enabled || !story.locations.length) return sendJson(res, 422, { ok: false, message: "这个角色没有启用固定场景。" });
  const targetLocationId = normalizeChatLiveStoryId(body.locationId);
  const targetLocation = chatLiveStoryLocation(story, targetLocationId);
  if (!targetLocation) return sendJson(res, 422, { ok: false, message: "目标场景不存在。" });
  const currentLocationId = story.locations.some((item) => item.id === normalizeChatLiveStoryId(session.liveStoryLocationId))
    ? normalizeChatLiveStoryId(session.liveStoryLocationId)
    : story.initialLocationId;
  const stage = CHAT_LIVE_STORY_STAGES.includes(String(body.stage || "")) ? String(body.stage) : "casual";
  const actionId = normalizeChatLiveStoryId(body.actionId);
  const action = chatLiveStoryAction(story, actionId);
  if (actionId && (!action || !action.locations.includes(targetLocationId) || !action.stages.includes(stage))) {
    return sendJson(res, 422, { ok: false, message: "动作和当前场景或阶段不匹配。" });
  }
  const recent = [
    ...(Array.isArray(session.liveStoryRecentActionIds) ? session.liveStoryRecentActionIds : []),
    action?.id || "",
  ].filter(Boolean).slice(-8);
  const saved = await saveChatLiveStoryState(session.id, {
    locationId: targetLocationId,
    stage,
    recentActionIds: recent,
    lastSwitchAt: body.lastSwitchAt || new Date().toISOString(),
  });
  return sendJson(res, 200, {
    ok: true,
    story: {
      locationId: targetLocationId,
      stage,
      recentActionIds: (Array.isArray(saved?.liveStoryRecentActionIds) ? saved.liveStoryRecentActionIds : recent)
        .map((item) => normalizeChatLiveStoryId(item))
        .filter(Boolean)
        .slice(-8),
      lastSwitchAt: saved?.liveStoryLastSwitchAt || "",
    },
  });
}

async function handleChatLiveSay(req, res, sessionId = "") {
  const auth = await requireUser(req, res);
  if (!auth) return;
  const session = await getChatLiveSessionInDb(String(sessionId || "").trim());
  if (!session || session.userId !== auth.user.id) return sendJson(res, 404, { ok: false, message: "会话不存在。" });
  if (session.mode !== "component") return sendJson(res, 400, { ok: false, code: "NOT_COMPONENT_SESSION", message: "该会话不是组件版。" });
  const body = await readJson(req);
  const text = String(body.text || "").trim().slice(0, 2000);
  if (!text) return sendJson(res, 422, { ok: false, message: "消息不能为空。" });
  try {
    if (session.roomId || session.sharedRoomViewer === true || session.exclusive === false) {
      await publishChatLiveRoomEvent(session, { role: "user", content: text, userId: auth.user.id }).catch(() => {});
    }
    const sayMemory = await loadChatCharacterMemory(auth.user.id, session.characterId);
    const character = await getChatLiveCharacterInDb(session.characterId);
    const liveStory = normalizeChatLiveStory(character?.liveStory || {});
    liveStory.looks = normalizeChatLiveLooks(character?.looks);
    let director = chatLiveSceneSelectionForText(liveStory, {
      text,
      currentStage: session.liveStoryStage || "casual",
      currentLocationId: session.liveStoryLocationId || "",
      recentActionIds: session.liveStoryRecentActionIds || [],
      history: Array.isArray(sayMemory?.turns) ? sayMemory.turns : [],
      lastSwitchAt: session.liveStoryLastSwitchAt || 0,
    });
    if (director) {
      try {
        const ai = await aiSelectChatLiveScene({ ...director, story: liveStory }, {
          text,
          history: Array.isArray(sayMemory?.turns) ? sayMemory.turns : [],
        });
        if (ai) {
          const currentId = director.locationId;
          const changedLocation = ai.locationId && ai.locationId !== currentId;
          const locationId = ai.locationId;
          const location = chatLiveStoryLocation(liveStory, locationId);
          const action = liveStory.actions.find((item) => item.id === ai.actionId
            && item.locations.includes(locationId) && item.stages.includes(ai.stageId)) || null;
          const explicitLook = /换|穿|拿|戴|脱|背景|衣服|服装|道具|手里/.test(text);
          const look = explicitLook
            ? liveStory.looks.find((item) => item.id === ai.lookId && item.enabled !== false && item.imageUrl) || null
            : null;
          director = {
            ...director,
            stage: ai.stageId,
            stageLabel: CHAT_LIVE_STORY_STAGE_LABELS[ai.stageId] || ai.stageId,
            locationId,
            requestedLocationId: changedLocation ? ai.locationId : director.requestedLocationId,
            locationChanged: locationId !== currentId,
            actionId: action?.id || "",
            actionName: action?.name || "",
            action: action?.action || "",
            spot: action?.spot || "",
            poseLabel: action?.poseLabel || "",
            imageUrl: action?.imageUrl || "",
            userText: action?.userText || "",
            sceneSource: "ai",
            sceneReason: ai.reason,
            ...(look ? { look: publicChatLiveLook(look) } : {}),
          };
        }
      } catch (error) {
        console.warn("[chat-live-scene-ai]", JSON.stringify({
          sessionId: session.id,
          code: error?.code || "",
          message: String(error?.message || "").slice(0, 200),
        }));
      }
    }
    const storyBlock = director
      ? `\nCURRENT LIVE SCENE: location=${director.locationId}; stage=${director.stageLabel}; suggested physical beat=${director.action || "none"}. The physical beat is direction only, never spoken narration. Keep the character in this location and stage unless the user explicitly changes it; do not invent a jump to another room.`
      : "";
    const reply = await chatLiveComponent.componentSay(session.liveId, text, {
      room: Boolean(session.roomId || session.sharedRoomViewer === true || session.exclusive === false),
      memoryBlock: chatCharacterMemoryBlock(sayMemory, auth.user),
      userBlock: chatLiveUserContext(auth.user),
      storyBlock,
      stage: director?.stage || session.liveStoryStage || "",
    });
    await rememberChatCharacterTurn(auth.user.id, session.characterId, "user", text, "component");
    await rememberChatCharacterTurn(auth.user.id, session.characterId, "assistant", reply, "component");
    if (director) {
      const recent = [...(Array.isArray(session.liveStoryRecentActionIds) ? session.liveStoryRecentActionIds : []), director.actionId].filter(Boolean).slice(-8);
      /* The client confirms successful playback through story-state. */
      await saveChatLiveStoryState(session.id, {
        locationId: director.locationId,
        stage: director.stage,
        recentActionIds: recent,
        lastSwitchAt: session.liveStoryLastSwitchAt || "",
      }).catch(() => {});
    }
    return sendJson(res, 200, { ok: true, reply: "", director });
  } catch (error) {
    const status = Number(error?.statusCode || 424);
    console.warn("[chat-live-say]", JSON.stringify({
      sessionId: session.id,
      liveId: session.liveId,
      status: status === 409 ? 409 : 424,
      code: error?.code || "CHAT_LIVE_COMPONENT_SAY_FAILED",
      message: String(error?.message || "").slice(0, 300),
    }));
    return sendJson(res, status === 409 ? 409 : 424, { ok: false, code: error.code || "CHAT_LIVE_COMPONENT_SAY_FAILED", message: error.message || "这句话没发出去，请再发一次。" });
  }
}

async function transcribeChatLiveVoice(audioBase64, mime) {
  const raw = String(audioBase64 || "").trim();
  const payload = raw.replace(/^data:[^,]*,/, "");
  const bytes = Buffer.from(payload, "base64");
  if (!bytes.length || bytes.length > 8 * 1024 * 1024) {
    const error = new Error("语音太短或太大，请再说一次。");
    error.statusCode = 422;
    throw error;
  }
  if (!ALIYUN_DASHSCOPE_API_KEY) {
    const error = new Error("语音识别还没配好，请先用文字。");
    error.statusCode = 503;
    throw error;
  }
  const safeMime = /^audio\/[a-z0-9.+-]+/i.test(String(mime || "")) ? String(mime).split(";")[0] : "audio/webm";
  const response = await fetch(`${ALIYUN_DASHSCOPE_BASE_URL}/api/v1/services/aigc/multimodal-generation/generation`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${ALIYUN_DASHSCOPE_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "qwen3-asr-flash",
      input: { messages: [{ role: "user", content: [{ audio: `data:${safeMime};base64,${payload}` }] }] },
    }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data?.message || "语音没有识别出来，请再说一次。");
    error.statusCode = response.status === 429 ? 429 : 424;
    throw error;
  }
  const text = String(data?.output?.choices?.[0]?.message?.content?.map?.((item) => item?.text || "").join("") || data?.output?.text || "").trim();
  return text.slice(0, 2000);
}

async function handleChatLiveVoice(req, res, sessionId = "") {
  const auth = await requireUser(req, res);
  if (!auth) return;
  if (!await enforceBusinessRateLimit(req, res, auth, { action: "chat_live_voice", limit: 20, windowMs: 60_000 })) return;
  const session = await getChatLiveSessionInDb(String(sessionId || "").trim());
  if (!session || session.userId !== auth.user.id) return sendJson(res, 404, { ok: false, message: "会话不存在。" });
  if (session.mode !== "component") return sendJson(res, 400, { ok: false, code: "NOT_COMPONENT_SESSION", message: "这一路请直接开麦说话。" });
  const body = await readJson(req, JSON_MEDIA_BODY_MAX_BYTES);
  let text = "";
  try {
    text = await transcribeChatLiveVoice(body.audioBase64, body.mime);
  } catch (error) {
    return sendJson(res, Number(error.statusCode || 424), { ok: false, message: error.message || "语音没有识别出来，请再说一次。" });
  }
  if (!text) return sendJson(res, 422, { ok: false, message: "没有听清，请再说一次。" });
  try {
    if (session.roomId || session.sharedRoomViewer === true || session.exclusive === false) {
      await publishChatLiveRoomEvent(session, { role: "user", content: text, userId: auth.user.id }).catch(() => {});
    }
    const sayMemory = await loadChatCharacterMemory(auth.user.id, session.characterId);
    await chatLiveComponent.componentSay(session.liveId, text, {
      room: Boolean(session.roomId || session.sharedRoomViewer === true || session.exclusive === false),
      memoryBlock: chatCharacterMemoryBlock(sayMemory, auth.user),
      userBlock: chatLiveUserContext(auth.user),
      stage: session.liveStoryStage || "",
    });
    await rememberChatCharacterTurn(auth.user.id, session.characterId, "user", text, "component");
    return sendJson(res, 200, { ok: true, text });
  } catch (error) {
    const status = Number(error?.statusCode || 424);
    return sendJson(res, status === 409 ? 409 : 424, { ok: false, code: error.code || "CHAT_LIVE_COMPONENT_SAY_FAILED", message: error.message || "这句话没发出去，请再发一次。", text });
  }
}

async function handleChatLiveGift(req, res, sessionId = "") {
  const auth = await requireUser(req, res); if (!auth) return;
  if (!await enforceBusinessRateLimit(req, res, auth, { action: "chat_live_gift", limit: 30, windowMs: 60_000 })) return;
  let session = await getChatLiveSessionInDb(String(sessionId || "").trim());
  if (!session || session.userId !== auth.user.id) return sendJson(res, 404, { ok: false, message: "会话不存在。" });
  const settled = session.settled === true || String(session.settled || "").toLowerCase() === "true";
  if (settled) return sendJson(res, 409, { ok: false, code: "CHAT_LIVE_ENDED", message: "会话已经结束。" });
  const status = String(session.status || "").toLowerCase();
  if (["ended", "closed", "failed"].includes(status)) {
    let upstreamActive = false;
    if (session.mode === "component") {
      upstreamActive = Boolean(session.liveId && chatLiveComponent.hasComponentSession?.(session.liveId));
    } else if (session.liveId) {
      try {
        const detail = await viduLiveRequest(`/live/v1/lives/${encodeURIComponent(session.liveId)}`, { timeoutMs: 8000, region: session.viduRegion || "" });
        const live = detail?.live || detail || {};
        upstreamActive = ["waiting", "on_live", "live", "running", "active", "started", "starting", "connected"].includes(String(live.status || "").toLowerCase());
      } catch {}
    }
    console.warn("[chat-live-gift-session-check]", JSON.stringify({ sessionId: session.id, liveId: session.liveId, status, settled: false, upstreamActive }));
    if (!upstreamActive) return sendJson(res, 409, { ok: false, code: "CHAT_LIVE_ENDED", message: "会话已经结束。" });
    const resumed = await withChatLiveSessionSettlementLockInDb(session.id, async (lockedSession) => {
      const current = lockedSession || session;
      if (current.settled === true || String(current.settled || "").toLowerCase() === "true") {
        return { session: null, value: current };
      }
      const next = {
        ...current,
        status: "waiting",
        settled: false,
        endedAt: "",
        endReason: "",
        updatedAt: new Date().toISOString(),
      };
      return { session: next, value: next };
    }).catch(() => null);
    session = resumed || session;
  }
  const body = await readJson(req); const live = chatLiveConfigValue(await readAppConfig());
  const gift = live.gifts.find((item) => item.id === String(body.giftId || "").trim() && item.enabled !== false);
  if (!gift) return sendJson(res, 404, { ok: false, message: "这个礼物暂时不可用。" });
  const eventId = String(body.eventId || "").replace(/[^a-z0-9_.-]/gi, "").slice(0, 80) || randomId("event");
  const taskId = `chat-live-gift:${session.id}:${eventId}`;
  try { await chargeUserWithSubtoken(auth, { cost: gift.credits, type: "chat_live_gift", taskId, meta: { taskId, sessionId: session.id, liveId: session.liveId, giftId: gift.id, giftName: gift.name, characterId: session.characterId || "", characterName: session.characterName || "", portraitUrl: session.portraitUrl || "" } }); }
  catch (error) { if (error.code === "INSUFFICIENT_CREDITS" || error.statusCode === 402) return sendJson(res, 402, { ok: false, code: "INSUFFICIENT_CREDITS", message: "积分不够了，请先充值。", credits: Number(auth.user?.credits || 0), cost: gift.credits }); return sendJson(res, 502, { ok: false, message: "礼物暂时没有送出，请稍后再试。" }); }
  try {
    if (session.mode === "component") {
      await publishChatLiveRoomEvent(session, { role: "gift", content: `${String(session.username || auth.user.username || "有人")} 打赏了 ${gift.name}`, userId: auth.user.id }).catch(() => {});
      const reply = await chatLiveComponent.componentSay(session.liveId, gift.userText, { kind: "gift", room: Boolean(session.roomId || session.sharedRoomViewer === true || session.exclusive === false), stage: session.liveStoryStage || "" });
      await recordCreatorUsageEarningInDb({
        eventKey: taskId,
        earningType: "video_gift_earning",
        viewerUserId: auth.user.id,
        characterId: session.characterId || "",
        sourceCredits: gift.credits,
        earningRate: 0.3,
        meta: { taskId, sessionId: session.id, giftId: gift.id, giftName: gift.name },
      }).catch((error) => console.warn("[creator-earning] gift failed", taskId, error?.message || error));
      return sendJson(res, 200, { ok: true, gift: publicChatLiveGift(gift), reply: "" });
    }
    await publishChatLiveRoomEvent(session, { role: "gift", content: `${String(session.username || auth.user.username || "有人")} 打赏了 ${gift.name}`, userId: auth.user.id }).catch(() => {});
    await recordCreatorUsageEarningInDb({
      eventKey: taskId,
      earningType: "video_gift_earning",
      viewerUserId: auth.user.id,
      characterId: session.characterId || "",
      sourceCredits: gift.credits,
      earningRate: 0.3,
      meta: { taskId, sessionId: session.id, giftId: gift.id, giftName: gift.name },
    }).catch((error) => console.warn("[creator-earning] gift failed", taskId, error?.message || error));
    return sendJson(res, 200, { ok: true, gift: publicChatLiveGift(gift), text: gift.userText, reaction: gift.reaction, needsRealtimeSignal: true });
  } catch (error) {
    await changeUserCredits(auth.db, auth.user.id, gift.credits, "chat_live_gift_refund", { taskId, sessionId: session.id, giftId: gift.id, reason: error.message || "gift dispatch failed" }).catch(() => {});
    return sendJson(res, 502, { ok: false, message: "礼物暂时没有送出，积分已退回。" });
  }
}

async function handleChatLiveLook(req, res, sessionId = "") {
  const auth = await requireUser(req, res);
  if (!auth) return;
  const session = await getChatLiveSessionInDb(String(sessionId || "").trim());
  if (!session || session.userId !== auth.user.id) return sendJson(res, 404, { ok: false, message: "会话不存在。" });
  if (session.mode !== "component") return sendJson(res, 400, { ok: false, code: "NOT_COMPONENT_SESSION", message: "实时版请在通话画面里直接切换。" });
  if (session.settled === true || ["ended", "closed", "failed"].includes(String(session.status || ""))) {
    return sendJson(res, 409, { ok: false, message: "会话已经结束。" });
  }
  const model = String(session.model || "");
  if (model && model !== "vidu-s2") {
    return sendJson(res, 422, { ok: false, code: "PROMPT_OP_MODEL_NOT_SUPPORTED", message: chatLiveLookFailureMessage("PROMPT_OP_MODEL_NOT_SUPPORTED") });
  }
  const body = await readJson(req);
  const op = String(body.op || body.opType || "");
  const remove = op === "remove";
  let operation;
  if (remove) {
    operation = { opType: "remove" };
  } else if (op === "undress") {
    const character = await getChatLiveCharacterInDb(session.characterId);
    const imageUrl = publicChatLiveUndressImageUrl(character || {});
    if (!imageUrl) return sendJson(res, 422, { ok: false, message: "这个角色还没有 Undress 图。" });
    operation = {
      opType: "switch",
      imageUrl,
      imageId: `ud${Date.now().toString(36)}${crypto.randomBytes(3).toString("hex")}`.slice(0, 128),
      kind: "garment",
      userText: CHAT_LIVE_UNDRESS_USER_TEXT,
    };
  } else {
    const lookId = String(body.lookId || "").trim();
    const sessionId = String(body.sessionId || "").trim();
    const live = chatLiveConfigValue(await readAppConfig());
    let look = live.looks.find((item) => item.id === lookId && item.enabled !== false);
    if (!look && sessionId) {
      const lookSession = await getChatLiveSessionInDb(sessionId);
      if (lookSession && lookSession.userId === auth.user.id) {
        const character = await getChatLiveCharacterInDb(lookSession.characterId);
        const story = normalizeChatLiveStory(character?.liveStory || {});
        story.looks = normalizeChatLiveLooks(character?.looks);
        look = story.looks.find((item) => item.id === lookId && item.enabled !== false);
      }
    }
    if (!look && lookId.startsWith("story-")) {
      const character = await getChatLiveCharacterInDb(session.characterId);
      const story = normalizeChatLiveStory(character?.liveStory || {});
      const location = story.locations.find((item) => (item.lookId || `story-location-${item.id}`) === lookId);
      const action = story.actions.find((item) => `story-action-${item.id}` === lookId);
      const scene = action || location;
      if (scene?.imageUrl) {
        look = {
          id: lookId,
          kind: "background",
          name: action ? action.name : location?.name,
          imageUrl: scene.imageUrl,
          userText: action?.userText || (action
            ? `按照参考图改成这个动作：${action.action || action.name}。保持当前场景${location?.name || ""}。`
            : `把画面背景切换成${location?.name || "这个场景"}，保持人物和镜头连续。`),
        };
      }
    }
    if (!look && lookId.startsWith("embed-look-")) {
      const character = await getChatLiveCharacterInDb(session.characterId);
      look = (Array.isArray(character?.embedLooks) ? character.embedLooks : []).find((item) => item.id === lookId);
    }
    if (!look) return sendJson(res, 404, { ok: false, message: "这个素材不存在或已停用。" });
    const embedLook = lookId.startsWith("embed-look-");
    if (!embedLook && !isManagedChatLiveAssetUrl(look.imageUrl)) return sendJson(res, 422, { ok: false, message: "素材图片无效，请在后台重新上传。" });
    if (embedLook && !/^https:\/\/\S+$/i.test(String(look.imageUrl || ""))) return sendJson(res, 422, { ok: false, message: "素材图片无效。" });
    operation = {
      opType: "switch",
      imageUrl: look.imageUrl,
      imageId: `lk${Date.now().toString(36)}${crypto.randomBytes(3).toString("hex")}`.slice(0, 128),
      kind: look.kind,
      userText: look.userText || CHAT_LIVE_LOOK_TEXT[look.kind],
    };
  }
  const operationId = String(body.id || `look-${Date.now().toString(36)}-${crypto.randomBytes(3).toString("hex")}`)
    .replace(/[^a-z0-9_.-]/gi, "")
    .slice(0, 80) || `look-${Date.now().toString(36)}`;
  await appendChatLiveOperation(session.id, {
    id: operationId,
    action: operation.opType === "remove" ? "remove_look" : (op === "undress" ? "undress" : "switch_look"),
    phase: "started",
    success: null,
    kind: operation.kind || "",
    message: "已发送画面切换请求",
  });
  try {
    await chatLiveComponent.componentApplyLook(session.liveId, operation);
    await appendChatLiveOperation(session.id, { id: operationId, action: operation.opType === "remove" ? "remove_look" : (op === "undress" ? "undress" : "switch_look"), phase: "ack", success: true, kind: operation.kind || "", message: "Vidu 已确认画面切换" });
    return sendJson(res, 200, { ok: true, operationId });
  } catch (error) {
    await appendChatLiveOperation(session.id, { id: operationId, action: operation.opType === "remove" ? "remove_look" : (op === "undress" ? "undress" : "switch_look"), phase: "ack", success: false, code: error.code || "CHAT_LIVE_LOOK_FAILED", kind: operation.kind || "", message: error.message || "画面切换失败" });
    return sendJson(res, error.statusCode || 502, {
      ok: false,
      operationId,
      code: error.code || "CHAT_LIVE_LOOK_FAILED",
      message: chatLiveLookFailureMessage(error.code),
    });
  }
}

async function handleGetChatLiveSession(req, res, sessionId = "") {
  const auth = await requireUser(req, res);
  if (!auth) return;
  await refreshChatLiveAuthUser(auth, req);
  const session = await getChatLiveSessionInDb(String(sessionId || "").trim());
  if (!session || session.userId !== auth.user.id) return sendJson(res, 404, { ok: false, message: "会话不存在。" });
  let upstream = null;
  if (session.liveId) {
    try {
      upstream = await viduLiveRequest(`/live/v1/lives/${encodeURIComponent(session.liveId)}`, { timeoutMs: 15000, region: session.viduRegion || "" });
    } catch (error) {
      upstream = null;
    }
  }
  const liveInfo = upstream?.live || upstream || {};
  const displayUpstream = chatLiveDisplayUpstreamEvidence(session, upstream);
  const hostUpstreamBilledSeconds = displayUpstream.seconds;
  const sharedRoomViewer = session.sharedRoomViewer === true;
  const upstreamBilledSeconds = sharedRoomViewer ? 0 : hostUpstreamBilledSeconds;
  const displayBilling = chatLiveDisplayBilling(
    session,
    sharedRoomViewer ? 0 : (displayUpstream.known ? upstreamBilledSeconds : 0),
  );
  const billedSeconds = displayBilling.billedSeconds;
  return sendJson(res, 200, {
    ok: true,
    session: {
      ...publicChatLiveSession({ ...session, billedSeconds }),
      upstreamStatus: liveInfo.status || "",
      upstreamBilledSeconds,
      hostUpstreamBilledSeconds: sharedRoomViewer ? hostUpstreamBilledSeconds : Math.max(0, Number(session.hostUpstreamBilledSeconds || 0) || 0),
      billingSource: sharedRoomViewer ? "shared_viewer_local" : (displayUpstream.source || ""),
      billingLimitSeconds: displayBilling.billingLimitSeconds,
      upstreamCredits: Math.max(0, Number(liveInfo.credits_cost || session.upstreamCredits || 0) || 0),
      balance: Number(auth.user?.credits || 0) || 0,
      prepaidSeconds: Math.max(0, Number(session.prepaidSeconds || 0) || 0),
      affordableSeconds: (() => {
        const rate = Number(session.saleCreditsPerMinute || 0) || 0;
        const perSecond = rate > 0 ? rate / 60 : 0;
        const balance = Number(auth.user?.credits || 0) || 0;
        const prepaidLeft = Math.max(0, (Number(session.prepaidSeconds || 0) || 0) - billedSeconds);
        const fromBalance = perSecond > 0 ? Math.floor(balance / perSecond) : 3600;
        return prepaidLeft + fromBalance;
      })(),
    },
  });
}

function publicChatLiveSession(session = {}) {
  const billingLimitSeconds = chatLiveBillableLimitSeconds(session);
  const billedSeconds = Math.min(
    billingLimitSeconds,
    Math.max(0, Number(session.billedSeconds || 0) || 0),
  );
  return {
    id: session.id,
    liveId: session.liveId,
    status: session.status,
    billedSeconds,
    chargedCredits: Number(session.chargedCredits || 0) || 0,
    saleCreditsPerMinute: Number(session.saleCreditsPerMinute || 0) || 0,
    freeSeconds: Math.max(0, Number(session.freeSeconds || 0) || 0),
    freeAllowanceSeconds: Math.max(0, Number(session.freeAllowanceSeconds ?? session.freeSeconds ?? 0) || 0),
    freeAllocatedSeconds: Math.max(0, Number(session.freeAllocatedSeconds || 0) || 0),
    freeUsedSeconds: Math.max(0, Number(session.freeUsedSeconds || 0) || 0),
    freeRemainingSeconds: Math.max(0, Number(session.freeRemainingSeconds || 0) || 0),
    freeAllocationVersion: String(session.freeAllocationVersion || ""),
    freeAllocationFinalized: session.freeAllocationFinalized === true,
    endedAt: session.endedAt || "",
    endReason: session.endReason || "",
  };
}

function publicAdminChatLiveSession(session = {}, extras = {}) {
  const billedSeconds = Math.max(0, Number(session.billedSeconds || 0) || 0);
  const startedMs = Date.parse(session.createdAt || "");
  const endedMs = Date.parse(session.endedAt || "");
  const wallSeconds = Number.isFinite(startedMs)
    ? Math.max(0, Math.round(((Number.isFinite(endedMs) ? endedMs : Date.now()) - startedMs) / 1000))
    : 0;
  const chargedCredits = Number(session.chargedCredits || 0) || 0;
  const chargeExpected = chatLiveChargeExpected(session, billedSeconds);
  return {
    id: session.id || "",
    userId: session.userId || "",
    username: extras.username || session.username || "",
    characterId: session.characterId || "",
    characterName: extras.characterName || session.characterName || "",
    status: session.status || "",
    settled: session.settled === true,
    mode: session.mode === "component" ? "component" : "realtime",
    viduRegion: session.viduRegion === "cn" ? "cn" : "overseas",
    sourceHost: session.sourceHost || hostnameFromOrigin(session.sourceOrigin || ""),
    billedSeconds,
    upstreamBilledSeconds: Math.max(0, Number(session.upstreamBilledSeconds ?? session.billedSeconds ?? 0) || 0),
    hostUpstreamBilledSeconds: Math.max(0, Number(session.hostUpstreamBilledSeconds || 0) || 0),
    billingSource: String(session.billingSource || ""),
    billingLimitSeconds: chatLiveBillableLimitSeconds(session),
    chargeableSeconds: Math.max(0, Number(session.chargeableSeconds || 0) || 0),
    prepaidSeconds: Math.max(0, Number(session.prepaidSeconds || 0) || 0),
    prepaidCredits: Math.max(0, Number(session.prepaidCredits || 0) || 0),
    refundedCredits: Math.max(0, Number(session.refundedCredits || 0) || 0),
    durationSeconds: billedSeconds > 0 ? billedSeconds : wallSeconds,
    durationEstimated: !(billedSeconds > 0),
    chargedCredits,
    chargeExpected,
    chargeGap: Math.max(0, chargeExpected - chargedCredits),
    chargeError: sanitizeChatLiveDiagnosticText(session.chargeError || ""),
    freeSeconds: Math.max(0, Number(session.freeSeconds || 0) || 0),
    freeAllowanceSeconds: Math.max(0, Number(session.freeAllowanceSeconds ?? session.freeSeconds ?? 0) || 0),
    freeAllocatedSeconds: Math.max(0, Number(session.freeAllocatedSeconds || 0) || 0),
    freeUsedSeconds: Math.max(0, Number(session.freeUsedSeconds || 0) || 0),
    freeRemainingSeconds: Math.max(0, Number(session.freeRemainingSeconds || 0) || 0),
    freeAllocationVersion: String(session.freeAllocationVersion || ""),
    freeAllocationFinalized: session.freeAllocationFinalized === true,
    saleCreditsPerMinute: Math.max(0, Number(session.saleCreditsPerMinute || 0) || 0),
    upstreamCredits: Math.max(0, Number(session.upstreamCredits || 0) || 0),
    upstreamStatus: sanitizeChatLiveDiagnosticText(session.upstreamStatus || "", 64),
    upstreamError: sanitizeChatLiveDiagnosticText(session.upstreamError || ""),
    upstreamTraceId: String(session.upstreamTraceId || "").slice(0, 100),
    liveId: String(session.liveId || ""),
    model: String(session.model || ""),
    callMode: String(session.callMode || ""),
    voiceProvider: String(session.voiceProvider || ""),
    clientEndNote: sanitizeChatLiveDiagnosticText(session.clientEndNote || ""),
    issues: normalizeChatLiveIssues(session.issues),
    operations: normalizeChatLiveOperations(session.operations),
    diagnostics: Array.isArray(session.diagnostics) ? session.diagnostics.slice(-30).map((item) => chatLiveDiagnosticValue(item, 2200)) : [],
    billableStartedAt: session.billableStartedAt || "",
    endReason: session.endReason || "",
    clientEndReason: session.clientEndReason || "",
    createdAt: session.createdAt || "",
    endedAt: session.endedAt || "",
  };
}

async function handleAdminListChatLiveSessions(req, res, url) {
  const auth = await requireAdmin(req, res, { loadDb: false });
  if (!auth) return;
  const page = Math.max(1, Number.parseInt(url?.searchParams?.get("page") || "1", 10) || 1);
  const limit = Math.max(1, Math.min(100, Number.parseInt(url?.searchParams?.get("limit") || "20", 10) || 20));
  const listed = await listChatLiveSessionsInDb({ limit, offset: (page - 1) * limit, withTotal: true });
  const sessions = Array.isArray(listed?.items) ? listed.items : [];
  const total = Math.max(0, Number(listed?.total || 0) || 0);
  const userIds = [...new Set(sessions.map((session) => String(session?.userId || "")).filter(Boolean))];
  const users = userIds.length ? await getUsersByIdsInDb(userIds) : [];
  const userMap = new Map((users || []).map((user) => [String(user.id || ""), user]));
  let characters = [];
  try {
    characters = await listChatLiveCharactersInDb({ includeDisabled: true });
  } catch {
    characters = [];
  }
  const characterMap = new Map((characters || []).map((character) => [String(character.id || ""), character]));
  return sendJson(res, 200, {
    ok: true,
    page,
    limit,
    total,
    totalPages: Math.max(1, Math.ceil(total / limit) || 1),
    sessions: sessions.map((session) => publicAdminChatLiveSession(session, {
      username: userMap.get(String(session.userId || ""))?.username || "",
      characterName: characterMap.get(String(session.characterId || ""))?.name || "",
    })),
  });
}

/* Server-side auth stand-in so a session can be settled after the browser left. */
async function chatLiveSettlementAuth(userId = "") {
  const id = String(userId || "");
  if (!id) return null;
  const user = await getUserByIdInDb(id);
  if (!user) return null;
  return { db: await readDb(), user, session: null, token: "", tokenSource: "server", tokenRecord: null };
}

async function settleChatLiveSessionById(sessionId = "") {
  const session = await getChatLiveSessionInDb(String(sessionId || "").trim());
  if (!session) return null;
  const auth = await chatLiveSettlementAuth(session.userId);
  return settleChatLiveSession(session, { auth });
}

/*
 * Transparent WebSocket proxy for the Vidu control channel.
 * The API key never reaches the browser: the browser talks to
 * /api/chat-live/ws and this server re-issues the handshake to Vidu with
 * `authorization=Token <key>` in the query string, then pipes both ways.
 */
async function handleChatLiveUpgrade(req, socket, head) {
  let parsed;
  try {
    parsed = new URL(req.url, "http://127.0.0.1");
  } catch {
    socket.destroy();
    return;
  }
  if (parsed.pathname !== "/api/chat-live/ws") {
    socket.destroy();
    return;
  }
  const sessionId = String(parsed.searchParams.get("session") || "").trim();
  const token = String(parsed.searchParams.get("token") || "").trim();
  const session = sessionId ? await getChatLiveSessionInDb(sessionId) : null;
  if (!session || !session.liveId) {
    socket.destroy();
    return;
  }
  let allowed = false;
  if (token && dbEnabled()) {
    const sessionRecord = await getSessionByTokenInDb(token);
    allowed = Boolean(sessionRecord && String(sessionRecord.userId) === String(session.userId));
  }
  if (!allowed) {
    socket.destroy();
    return;
  }
  const creds = viduCredentialsForRegion(session.viduRegion || "");
  if (!creds.key) {
    socket.destroy();
    return;
  }

  const connId = String(parsed.searchParams.get("conn") || `app-${session.id}`).slice(0, 64);
  const upstreamHost = new URL(creds.base).hostname;
  /* Vidu 的 WS 校验的是 Authorization 请求头（不是 query），这里由服务端注入，
     浏览器永远拿不到密钥。 */
  const upstreamPath = `/live/ws/live/connect?live_id=${encodeURIComponent(session.liveId)}&conn_id=${encodeURIComponent(connId)}`;

  const upstream = tls.connect({ host: upstreamHost, port: 443, servername: upstreamHost });
  let clientFrameBuffer = Buffer.alloc(0);
  let upstreamFrameBuffer = Buffer.alloc(0);
  let lastPromptSeq = "";
  const inspectWsFrames = (buffer, masked, source) => {
    let offset = 0;
    while (buffer.length - offset >= 2) {
      const first = buffer[offset];
      const second = buffer[offset + 1];
      const opcode = first & 0x0f;
      const isMasked = (second & 0x80) !== 0;
      let length = second & 0x7f;
      let header = 2;
      if (length === 126) {
        if (buffer.length - offset < 4) break;
        length = buffer.readUInt16BE(offset + 2);
        header = 4;
      } else if (length === 127) {
        if (buffer.length - offset < 10) break;
        const big = buffer.readBigUInt64BE(offset + 2);
        if (big > BigInt(2 ** 31)) return Buffer.alloc(0);
        length = Number(big);
        header = 10;
      }
      const maskBytes = isMasked ? 4 : 0;
      if (buffer.length - offset < header + maskBytes + length) break;
      let payload = buffer.subarray(offset + header + maskBytes, offset + header + maskBytes + length);
      if (isMasked) {
        const mask = buffer.subarray(offset + header, offset + header + 4);
        const decoded = Buffer.alloc(payload.length);
        for (let i = 0; i < payload.length; i += 1) decoded[i] = payload[i] ^ mask[i % 4];
        payload = decoded;
      }
      if (opcode === 1) {
        try {
          const message = JSON.parse(payload.toString("utf8"));
          const type = Number(message?.type || 0);
          if (source === "client" && type === 11) {
            const prompt = message?.payload?.prompt_operation || {};
            lastPromptSeq = String(message?.seq_id || "");
            void appendChatLiveOperation(session.id, {
              id: `proxy-${lastPromptSeq || Date.now().toString(36)}`,
              action: prompt?.op_type === "remove" ? "remove_look" : "undress",
              phase: "proxy_signal",
              success: true,
              code: "",
              kind: prompt?.images?.[0]?.kind || "",
              message: JSON.stringify({ seq_id: message?.seq_id, op_type: prompt?.op_type, image_uri: prompt?.images?.[0]?.image_uri || "", image_id: prompt?.images?.[0]?.image_id || "", user_text: prompt?.images?.[0]?.user_text || "" }).slice(0, 900),
            }).catch(() => {});
          }
          if (source === "upstream" && (type === 9 || type === 10) && session.exclusive !== false && !session.roomId) {
            const spoken = message?.payload?.transcription?.text || message?.payload?.text_msg?.content || message?.payload?.text || "";
            void rememberChatCharacterTurn(session.userId, session.characterId, type === 9 ? "user" : "assistant", spoken, "realtime");
          }
          if (source === "upstream" && type === 12) {
            const ack = message?.payload?.prompt_operation_ack || {};
            void appendChatLiveOperation(session.id, {
              id: `proxy-${lastPromptSeq || Date.now().toString(36)}`,
              action: ack?.op_type === "remove" ? "remove_look" : "undress",
              phase: "proxy_ack",
              success: ack?.success === true,
              code: ack?.error_code || "",
              kind: "",
              message: JSON.stringify({ seq_id: lastPromptSeq, type: 12, success: ack?.success === true, error_code: ack?.error_code || "", status: ack?.status || "", message: ack?.message || "", keys: Object.keys(ack || {}).slice(0, 20) }).slice(0, 900),
            }).catch(() => {});
          }
        } catch {}
      }
      offset += header + maskBytes + length;
    }
    return buffer.subarray(offset);
  };
  const closeBoth = () => {
    chatLiveSockets.delete(session.id);
    try { socket.destroy(); } catch {}
    try { upstream.destroy(); } catch {}
  };
  upstream.setTimeout(0);
  upstream.on("error", closeBoth);
  upstream.on("close", () => {
    closeBoth();
    settleChatLiveSessionById(session.id).catch(() => {});
  });
  socket.on("error", closeBoth);
  socket.on("close", () => {
    chatLiveSockets.delete(session.id);
    try { upstream.destroy(); } catch {}
  });
  chatLiveSockets.set(session.id, socket);
  upstream.on("secureConnect", () => {
    const lines = [`GET ${upstreamPath} HTTP/1.1`, `Host: ${upstreamHost}`, `Authorization: Token ${creds.key}`];
    for (const [key, value] of Object.entries(req.headers)) {
      const lower = String(key).toLowerCase();
      if (["host", "origin", "authorization", "referer"].includes(lower)) continue;
      if (Array.isArray(value)) {
        value.forEach((entry) => lines.push(`${key}: ${entry}`));
      } else if (value !== undefined) {
        lines.push(`${key}: ${value}`);
      }
    }
    lines.push("", "");
    upstream.write(lines.join("\r\n"));
    if (head && head.length) upstream.write(head);
    socket.pipe(upstream);
    upstream.pipe(socket);
    socket.on("data", (chunk) => {
      clientFrameBuffer = inspectWsFrames(Buffer.concat([clientFrameBuffer, chunk]), true, "client");
    });
    upstream.on("data", (chunk) => {
      upstreamFrameBuffer = inspectWsFrames(Buffer.concat([upstreamFrameBuffer, chunk]), false, "upstream");
    });
  });
}

async function settleStaleChatLiveSessions() {
  if (!dbEnabled()) return;
  /*
   * Backfill terminal calls even when settlement cannot complete. Real calls
   * can end through reconnect/insufficient-credit paths without a final billed
   * snapshot, and they still belong in the user's chat history exactly once.
   */
  try {
    const historyCandidates = await listTerminalChatLiveSessionsMissingHistoryInDb({ limit: 25, minAgeSeconds: 30 });
    for (const session of historyCandidates) {
      await persistChatLiveCallHistory(session).catch((error) => {
        console.warn("[chat-live-history] backfill failed", session.id, error?.message || error);
      });
    }
  } catch (error) {
    console.warn("[chat-live-history] backfill scan failed", String(error?.message || error).slice(0, 180));
  }
  if (!(VIDU_API_KEY_OVERSEAS || VIDU_API_KEY_CN || VIDU_API_KEY)) return;
  let sessions = [];
  try {
    sessions = await listUnsettledChatLiveSessionsInDb({ limit: 50, minAgeSeconds: 60 });
  } catch {
    return;
  }
  for (const session of sessions) {
    if (!session?.id || !session.liveId || session.settled === true) continue;
    try {
      await settleChatLiveSessionById(session.id);
    } catch (error) {
      /* retry on the next sweep */
    }
  }
}

async function cleanupOrphanedChatLiveFreeAllocations() {
  if (!dbEnabled()) return [];
  return cleanupOrphanedChatLiveFreeAllocationsInDb({ minAgeSeconds: 600, limit: 100 }).catch((error) => {
    console.warn("[chat-live-free-orphan-cleanup]", String(error?.message || error).slice(0, 180));
    return [];
  });
}

function normalizePlatformConfig(platform = {}) {
  const fallback = DEFAULT_CONFIG.platform || {};
  const categories = Array.isArray(platform.categories) ? platform.categories : fallback.categories || [];
  const templates = Array.isArray(platform.templates) ? platform.templates : fallback.templates || [];
  const advancedPricing = normalizeAdvancedPricing(platform.advancedPricing || fallback.advancedPricing || DEFAULT_ADVANCED_PRICING);
  const chatLive = normalizeChatLiveConfig(platform.chatLive || fallback.chatLive || {});
  const rawAnalytics = platform.analytics && typeof platform.analytics === "object" && !Array.isArray(platform.analytics)
    ? platform.analytics
    : fallback.analytics || {};
  const googleMeasurementId = String(
    rawAnalytics.googleMeasurementId
    || platform.googleMeasurementId
    || platform.googleAnalyticsId
    || platform.gaMeasurementId
    || "",
  ).trim();
  return {
    ...fallback,
    ...platform,
    brand: String(platform.brand || fallback.brand || "Vipeak AI"),
    heroTitle: cleanPlatformHeroCopy(platform.heroTitle, fallback.heroTitle || "Create AI videos"),
    heroSubtitle: cleanPlatformHeroCopy(platform.heroSubtitle, fallback.heroSubtitle || ""),
    notice: cleanPlatformHeroCopy(platform.notice, fallback.notice || ""),
    accessCopy: cleanPlatformPublicCopy(platform.accessCopy, fallback.accessCopy || ""),
    analytics: {
      ...(fallback.analytics || {}),
      ...rawAnalytics,
      googleMeasurementId,
    },
    advancedPricing,
    chatLive,
    advanced: normalizePlatformAdvancedConfig(platform.advanced || fallback.advanced || {}, advancedPricing),
    categories: categories
      .map((category, index) => ({
        id: String(category.id || `cat-${index + 1}`).trim().replace(/[^a-z0-9_-]/gi, "-") || `cat-${index + 1}`,
        name: String(category.name || category.id || `Category ${index + 1}`).trim(),
      }))
      .filter((category) => !isHiddenPlatformCategory(category)),
    templates: templates
      .map(normalizePlatformTemplate)
      .filter((template) => template.enabled !== false)
      .filter((template) => !isHiddenPlatformCategory({ id: template.category, name: template.category }))
      .sort((a, b) => a.sort - b.sort),
  };
}

function findPlatformTemplate(config, templateId) {
  const platform = normalizePlatformConfig(config.platform || {});
  return platform.templates.find((template) => template.id === String(templateId || "").trim()) || null;
}

function makeHomeVideoItemId() {
  return `home-${Date.now()}-${crypto.randomBytes(3).toString("hex")}`;
}

function makeSceneEntryId() {
  return `entry-${Date.now()}-${crypto.randomBytes(3).toString("hex")}`;
}

function normalizeSceneEntry(entry = {}, scene = {}) {
  const id = String(entry.id || "default").trim().replace(/[^a-z0-9_-]/gi, "-").slice(0, 48) || "default";
  const fallbackName = scene.shortName || scene.name || "Default";
  return {
    id,
    name: String(entry.name || fallbackName).trim().slice(0, 40) || fallbackName,
    enabled: entry.enabled !== false,
    createdAt: entry.createdAt || "",
    updatedAt: entry.updatedAt || "",
  };
}

function normalizeSceneEntries(scene = {}) {
  const entries = Array.isArray(scene.entries) ? scene.entries : [];
  const normalized = entries
    .map((entry) => normalizeSceneEntry(entry, scene))
    .filter((entry, index, list) => list.findIndex((item) => item.id === entry.id) === index);
  if (!normalized.length) {
    normalized.push(normalizeSceneEntry({
      id: "default",
      name: scene.shortName || scene.name || "Default",
    }, scene));
  }
  return normalized;
}

function normalizeSceneConfig(scene = {}) {
  return {
    ...scene,
    entries: normalizeSceneEntries(scene),
  };
}

function findSceneEntryConfig(scene = {}, entryId = "") {
  const entries = normalizeSceneEntries(scene);
  const requestedId = String(entryId || "").trim();
  return (
    entries.find((entry) => entry.id === requestedId && entry.enabled !== false) ||
    entries.find((entry) => entry.id === "default" && entry.enabled !== false) ||
    entries.find((entry) => entry.enabled !== false) ||
    entries[0] ||
    normalizeSceneEntry({ id: "default", name: scene.shortName || scene.name || "Default" }, scene)
  );
}

function makeSceneVideoKey(sceneId, sceneEntryId = "default") {
  const cleanSceneId = String(sceneId || "").trim();
  const cleanEntryId = String(sceneEntryId || "default").trim() || "default";
  return cleanEntryId === "default" ? cleanSceneId : `${cleanSceneId}__${cleanEntryId}`;
}

function sceneIdFromVideoKey(videoKey = "") {
  return String(videoKey || "").split("__")[0] || "";
}

function publicCharacterVideoList(item = {}) {
  const sceneVideos = [
    ...Object.entries(item.homeSceneVideos || {}).map(([key, entry]) => ({ key, entry })),
    ...Object.entries(item.sceneVideos || {}).map(([key, entry]) => ({ key, entry })),
    ...Object.entries(item.unlockVideos || {}).map(([key, entry]) => ({ key, entry, unlockOnly: true })),
  ];
  const seen = new Set();
  const videos = [];
  for (const { key, entry, unlockOnly } of sceneVideos) {
    const raw = entry || {};
    const sceneId = raw.sceneId || sceneIdFromVideoKey(key);
    const sceneEntryId = raw.sceneEntryId || "default";
    const videoUrl = String(raw.cdnVideoUrl || raw.videoUrl || raw.localVideoUrl || raw.remoteVideoUrl || "").trim();
    const taskId = String(raw.taskId || "").trim();
    const posterUrl = String(raw.cdnPosterUrl || raw.posterUrl || raw.coverUrl || raw.thumbnailUrl || "").trim();
    if (!sceneId || (!videoUrl && !taskId && !posterUrl)) continue;
    const dedupeKey = [sceneId, sceneEntryId, taskId, videoUrl, key].join("|");
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);
    videos.push({
      key,
      unlockOnly: Boolean(unlockOnly),
      entry: {
        ...raw,
        sceneId,
        sceneEntryId,
        sceneName: raw.sceneName || "",
        title: raw.title || raw.sceneEntryName || raw.sceneName || key,
      },
    });
    if (videos.length >= 4) break;
  }
  return videos;
}

