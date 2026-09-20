/*
 * Chat live — 在线聊天（Vidu S2-Avatar 实时数字人）
 * 123 主站 chat 面板与 chat.5vips.com 共用这一个客户端。
 * 单向：只上传麦克风；数字人出视频；支持语音与文字输入。
 */
(() => {
  const state = {
    config: null,
    engine: null,
    ws: null,
    session: null,
    character: null,
    connId: "",
    seqId: 1,
    overlay: null,
    remoteVideo: null,
    heartbeat: 0,
    startedAt: 0,
    ended: false,
  };

  const RTC_SDK_URL = "https://g.alicdn.com/apsara-media-box/imp-web-rtc/7.1.9/aliyun-rtc-sdk.js";
  const TOKEN_KEYS = ["raisingGameToken", "vipsChatToken"];

  function authToken() {
    try {
      if (typeof getRaisingToken === "function") {
        const value = getRaisingToken();
        if (value) return value;
      }
    } catch {}
    try {
      for (const key of TOKEN_KEYS) {
        const value = localStorage.getItem(key);
        if (value) return value;
      }
    } catch {}
    return "";
  }

  async function apiFetch(url, options = {}) {
    const headers = { "content-type": "application/json", ...(options.headers || {}) };
    const token = authToken();
    if (token) headers.authorization = `Bearer ${token}`;
    const response = await fetch(url, { ...options, headers });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(payload?.message || payload?.error?.message || `请求失败（${response.status}）`);
      Object.assign(error, payload, { status: response.status });
      throw error;
    }
    return payload;
  }

  async function loadConfig(force = false) {
    if (state.config && !force) return state.config;
    const payload = await apiFetch("/api/chat-live/characters");
    state.config = payload || null;
    return state.config;
  }

  function saleCreditsPerMinute() {
    return Number(state.config?.pricing?.saleCreditsPerMinute || 0) || 0;
  }

  function characters() {
    return Array.isArray(state.config?.characters) ? state.config.characters : [];
  }

  function characterById(id) {
    return characters().find((item) => String(item.id) === String(id)) || null;
  }

  /* 入口是否可用：后台开启 + 至少一个角色 + 已经定价 */
  function available() {
    return Boolean(state.config && state.config.enabled !== false && characters().length && saleCreditsPerMinute() > 0);
  }

  function injectStyles() {
    if (document.getElementById("chatLiveStyles")) return;
    const style = document.createElement("style");
    style.id = "chatLiveStyles";
    style.textContent = `
.chat-live-entry { display:inline-flex; align-items:center; gap:6px; }
.chat-live-overlay { position:fixed; inset:0; z-index:400; display:flex; align-items:center; justify-content:center; background:rgba(5,6,10,.92); backdrop-filter:blur(6px); }
.chat-live-shell { position:relative; width:min(980px,100%); height:min(92vh,760px); display:grid; grid-template-columns:minmax(0,1.55fr) minmax(280px,1fr); gap:0; overflow:hidden; border:1px solid rgba(255,255,255,.12); border-radius:18px; background:#0b0d12; color:#f8fafc; }
.chat-live-stage { position:relative; background:#05060a; display:flex; align-items:center; justify-content:center; }
.chat-live-stage video { width:100%; height:100%; object-fit:cover; background:#05060a; }
.chat-live-placeholder { position:absolute; inset:0; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:10px; color:#94a3b8; text-align:center; padding:20px; }
.chat-live-placeholder img { width:96px; height:96px; border-radius:50%; object-fit:cover; opacity:.9; }
.chat-live-dot { width:12px; height:12px; border-radius:50%; background:rgba(255,255,255,.75); animation:chatLivePulse 1.2s ease-in-out infinite; }
@keyframes chatLivePulse { 0%,100% { opacity:.35; transform:scale(.85); } 50% { opacity:1; transform:scale(1.15); } }
.chat-live-badge { position:absolute; top:14px; left:14px; display:inline-flex; align-items:center; gap:6px; padding:6px 12px; border-radius:999px; background:rgba(0,0,0,.55); font-size:12px; }
.chat-live-timer { position:absolute; top:14px; right:14px; padding:6px 12px; border-radius:999px; background:rgba(0,0,0,.55); font-size:12px; font-variant-numeric:tabular-nums; }
.chat-live-side { display:flex; flex-direction:column; min-height:0; border-left:1px solid rgba(255,255,255,.08); background:#0e1118; }
.chat-live-head { padding:16px 18px; border-bottom:1px solid rgba(255,255,255,.08); }
.chat-live-head h3 { margin:0; font-size:16px; }
.chat-live-head p { margin:6px 0 0; color:#94a3b8; font-size:12px; }
.chat-live-log { flex:1; min-height:0; overflow-y:auto; padding:14px 16px; display:flex; flex-direction:column; gap:10px; font-size:13px; }
.chat-live-line { padding:9px 11px; border-radius:12px; line-height:1.5; max-width:92%; }
.chat-live-line.is-user { align-self:flex-end; background:#1d4ed8; }
.chat-live-line.is-bot { align-self:flex-start; background:rgba(255,255,255,.08); }
.chat-live-line.is-sys { align-self:center; background:transparent; color:#94a3b8; font-size:12px; }
.chat-live-actions { padding:12px 14px; border-top:1px solid rgba(255,255,255,.08); display:flex; flex-direction:column; gap:10px; }
.chat-live-input { display:flex; gap:8px; }
.chat-live-input input { flex:1; height:40px; padding:0 12px; border-radius:10px; border:1px solid rgba(255,255,255,.14); background:rgba(255,255,255,.05); color:#fff; }
.chat-live-btn { height:40px; padding:0 14px; border:0; border-radius:10px; font-weight:600; cursor:pointer; }
.chat-live-btn.is-primary { background:#fff; color:#0b0d12; }
.chat-live-btn.is-danger { background:#dc2626; color:#fff; }
.chat-live-btn.is-ghost { background:rgba(255,255,255,.08); color:#fff; }
.chat-live-btn[disabled] { opacity:.5; cursor:not-allowed; }
.chat-live-row { display:flex; gap:8px; }
.chat-live-row .chat-live-btn { flex:1; }
.chat-live-cost { color:#94a3b8; font-size:12px; text-align:center; }
@media (max-width:880px) { .chat-live-shell { grid-template-columns:1fr; grid-template-rows:minmax(0,1.2fr) minmax(0,1fr); height:100vh; border-radius:0; } .chat-live-side { border-left:0; border-top:1px solid rgba(255,255,255,.08); } }
`;
    document.head.appendChild(style);
  }

  function loadRtcSdk() {
    /* 不同 SDK 版本方法名不一致，逐个尝试存在的方法 */
    async function callIfPresent(engine, names, ...args) {
      for (const name of names) {
        if (typeof engine?.[name] === "function") {
          try { await engine[name](...args); return true; } catch { /* 试下一个 */ }
        }
      }
      return false;
    }
    if (window.AliRtcEngine) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = RTC_SDK_URL;
      script.async = true;
      script.onload = () => resolve();
      script.onerror = () => reject(new Error("实时音视频组件加载失败，请检查网络后重试。"));
      document.head.appendChild(script);
    });
  }

  function el(tag, className = "", text = "") {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text) node.textContent = text;
    return node;
  }

  function buildOverlay(character) {
    injectStyles();
    const pricing = state.config?.pricing || {};
    const overlay = el("div", "chat-live-overlay");
    const shell = el("div", "chat-live-shell");
    const stage = el("div", "chat-live-stage");
    const video = document.createElement("video");
    video.autoplay = true;
    video.playsInline = true;
    video.setAttribute("playsinline", "");
    const placeholder = el("div", "chat-live-placeholder");
    const avatar = document.createElement("img");
    avatar.src = character.portraitUrl || character.avatarUrl || "";
    avatar.alt = "";
    /* 不再显示"正在连接数字人"这类过程文案：只放头像 + 呼吸点 */
    const placeholderText = el("span", "chat-live-dot", "");
    placeholderText.setAttribute("aria-hidden", "true");
    placeholder.append(avatar, placeholderText);
    const badge = el("span", "chat-live-badge", "");
    badge.hidden = true;
    const timer = el("span", "chat-live-timer", "00:00");
    stage.append(video, placeholder, badge, timer);

    const side = el("div", "chat-live-side");
    const head = el("div", "chat-live-head");
    const title = el("h3", "", character.name || "在线聊天");
    const subtitle = el("p", "", "语音通话中，直接说话即可；也可以打字。");
    head.append(title, subtitle);

    const log = el("div", "chat-live-log");
    const actions = el("div", "chat-live-actions");
    const inputRow = el("div", "chat-live-input");
    const input = document.createElement("input");
    input.placeholder = "输入消息…";
    const sendBtn = el("button", "chat-live-btn is-primary", "发送");
    sendBtn.type = "button";
    inputRow.append(input, sendBtn);
    const row = el("div", "chat-live-row");
    const muteBtn = el("button", "chat-live-btn is-ghost", "静音");
    muteBtn.type = "button";
    const hangBtn = el("button", "chat-live-btn is-danger", "挂断");
    hangBtn.type = "button";
    row.append(muteBtn, hangBtn);
    const cost = el("div", "chat-live-cost", `${saleCreditsPerMinute()} 积分/分钟 · 最长 ${pricing.maxMinutes || 10} 分钟`);
    actions.append(inputRow, row, cost);
    side.append(head, log, actions);
    shell.append(stage, side);
    overlay.appendChild(shell);
    document.body.appendChild(overlay);

    state.overlay = { root: overlay, video, placeholder, placeholderText, badge, timer, log, input, sendBtn, muteBtn, hangBtn, cost };
    return state.overlay;
  }

  function appendLine(kind, text) {
    if (!state.overlay || !text) return;
    const line = el("div", `chat-live-line is-${kind}`, text);
    state.overlay.log.appendChild(line);
    state.overlay.log.scrollTop = state.overlay.log.scrollHeight;
  }

  function setStageStatus(text, tone = "") {
    if (!state.overlay) return;
    /* 只在出错时显示状态；连接过程不打扰用户 */
    if (tone !== "error") {
      state.overlay.badge.hidden = true;
      state.overlay.badge.textContent = "";
      return;
    }
    state.overlay.badge.hidden = false;
    state.overlay.badge.textContent = `● ${text}`;
    state.overlay.badge.style.color = tone === "ok" ? "#34d399" : tone === "error" ? "#f87171" : "#e2e8f0";
  }

  function startTimer() {
    state.startedAt = Date.now();
    state.heartbeat = window.setInterval(() => {
      if (!state.overlay) return;
      const seconds = Math.floor((Date.now() - state.startedAt) / 1000);
      const mm = String(Math.floor(seconds / 60)).padStart(2, "0");
      const ss = String(seconds % 60).padStart(2, "0");
      state.overlay.timer.textContent = `${mm}:${ss}`;
      const maxSeconds = Number(state.config?.pricing?.maxMinutes || 10) * 60;
      if (seconds >= maxSeconds) hangup("timeout");
    }, 1000);
  }

  function wsUrl(session) {
    const url = new URL(session.wsPath || `/api/chat-live/ws?session=${encodeURIComponent(session.id)}`, window.location.href);
    url.protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    url.searchParams.set("token", authToken());
    url.searchParams.set("conn", state.connId);
    return url.toString();
  }

  function sendSignal(payload) {
    if (!state.ws || state.ws.readyState !== WebSocket.OPEN) return false;
    state.ws.send(JSON.stringify(payload));
    return true;
  }

  function buildSignal(type, payload = {}) {
    return { type, live_id: String(state.session?.liveId || ""), conn_id: state.connId, seq_id: state.seqId++, payload };
  }

  function handleSignal(raw) {
    let message;
    try {
      message = JSON.parse(raw);
    } catch {
      return;
    }
    const type = Number(message?.type || 0);
    const payload = message?.payload || {};
    if (type === 2) {
      const ack = payload.conn_init_ack || {};
      if (ack.success === true) {
        setStageStatus("已连接", "ok");
        state.overlay.placeholder.style.display = "none";
      } else {
        setStageStatus("准备中", "");
        window.setTimeout(() => sendSignal(buildSignal(1, { conn_init: { version: 1 } })), 2000);
      }
      return;
    }
    if (type === 9) {
      const text = payload.transcription?.text || payload.text || "";
      if (text) appendLine("user", text);
      return;
    }
    if (type === 10) {
      const text = payload.transcription?.text || payload.text || "";
      if (text) appendLine("bot", text);
      return;
    }
    if (type === 6) {
      const reason = payload.hangup?.hangup_reason || "服务端结束";
      appendLine("sys", `会话已结束（${reason}）。`);
      finishSession(reason);
    }
  }

  function connectSignaling(session) {
    return new Promise((resolve) => {
      const socket = new WebSocket(wsUrl(session));
      state.ws = socket;
      socket.addEventListener("open", () => {
        socket.send(JSON.stringify(buildSignal(1, { conn_init: { version: 1 } })));
        resolve();
      });
      socket.addEventListener("message", (event) => handleSignal(event.data));
      socket.addEventListener("error", () => setStageStatus("控制通道异常", "error"));
      socket.addEventListener("close", () => {
        if (!state.ended) {
          finishSession("socket_closed");
        }
      });
    });
  }

  async function joinRtc(session) {
    await loadRtcSdk();
    const supported = await window.AliRtcEngine.isSupported();
    if (!supported?.support) throw new Error(`当前浏览器不支持实时通话（${supported?.reason || "unknown"}）`);
    window.AliRtcEngine.setLogLevel(0);
    const engine = window.AliRtcEngine.getInstance();
    state.engine = engine;
    engine.on("bye", (code) => appendLine("sys", `通话已结束（${code}）。`));
    engine.on("remoteUserOffLineNotify", () => setStageStatus("数字人离线", "error"));
    engine.on("videoSubscribeStateChanged", (userId, _oldState, newState) => {
      if (newState !== 3) return;
      state.overlay.video.style.display = "block";
      state.overlay.placeholder.style.display = "none";
      engine.setRemoteViewConfig(state.overlay.video, userId, 1);
      state.overlay.video.play().catch(() => {});
    });
    engine.on("authInfoWillExpire", () => appendLine("sys", "凭证即将过期，请尽快结束本轮对话。"));
    /* SDK 版本之间方法名不一致：存在才调，避免 "is not a function" 直接中断接入 */
    await callIfPresent(engine, ["setChannelProfile"], "communication");
    await callIfPresent(engine, ["setDefaultPublishLocalAudioStream", "publishLocalAudioStreamEnabled"], true);
    await callIfPresent(engine, ["setDefaultPublishLocalVideoStream", "publishLocalVideoStreamEnabled"], false); /* 单向：不推摄像头 */
    await callIfPresent(engine, ["setDefaultSubscribeAllRemoteAudioStreams", "subscribeAllRemoteAudioStreams"], true);
    await callIfPresent(engine, ["setDefaultSubscribeAllRemoteVideoStreams", "subscribeAllRemoteVideoStreams"], true);
    await engine.joinChannel(session.rtc.token, session.rtc.user_id);
    try {
      await engine.publishLocalAudioStream(true);
    } catch (error) {
      appendLine("sys", "麦克风未授权，你可以先用文字聊天。");
      setStageStatus("无麦克风权限", "error");
    }
    setStageStatus("连线中", "");
  }

  async function endSessionRequest(sessionId) {
    try {
      const payload = await apiFetch(`/api/chat-live/sessions/${encodeURIComponent(sessionId)}/end`, { method: "POST" });
      return payload?.session || null;
    } catch {
      return null;
    }
  }

  async function finishSession(reason = "user_end") {
    if (state.ended) return;
    state.ended = true;
    if (state.heartbeat) window.clearInterval(state.heartbeat);
    state.heartbeat = 0;
    const sessionId = state.session?.id;
    try {
      if (state.ws && state.ws.readyState === WebSocket.OPEN) {
        state.ws.send(JSON.stringify(buildSignal(5, { hangup: { hangup_reason: reason } })));
        state.ws.close();
      }
    } catch {}
    state.ws = null;
    try {
      await state.engine?.leaveChannel?.();
      state.engine?.destroy?.();
    } catch {}
    state.engine = null;
    const settled = sessionId ? await endSessionRequest(sessionId) : null;
    if (state.overlay) {
      setStageStatus("已结束", "");
      if (settled) {
        const seconds = Number(settled.billedSeconds || 0);
        const charged = Number(settled.chargedCredits || 0);
        appendLine("sys", `本次通话 ${seconds} 秒，扣费 ${charged} 积分。`);
      }
      state.overlay.cost.textContent = "已结束，可以关闭窗口。";
      state.overlay.sendBtn.disabled = true;
      state.overlay.input.disabled = true;
      state.overlay.muteBtn.disabled = true;
      state.overlay.hangBtn.textContent = "关闭";
      state.overlay.hangBtn.onclick = () => closeOverlay();
    }
  }

  /* 浏览器被直接关掉 / 切走 / 崩溃：立刻通知服务端结算，别留下僵尸会话 */
  function bindUnloadGuard() {
    const endNow = (reason) => {
      const sessionId = state.session?.id;
      if (!sessionId || state.ended) return;
      state.ended = true;
      try {
        if (state.ws && state.ws.readyState === WebSocket.OPEN) {
          state.ws.send(JSON.stringify({ type: 5, live_id: String(state.session?.liveId || ""), conn_id: state.connId, seq_id: state.seqId++, payload: { hangup: { hangup_reason: reason } } }));
        }
      } catch {}
      try {
        const url = `/api/chat-live/sessions/${encodeURIComponent(sessionId)}/end`;
        if (navigator.sendBeacon) navigator.sendBeacon(url, new Blob([JSON.stringify({ reason })], { type: "application/json" }));
        else fetch(url, { method: "POST", keepalive: true, headers: { "content-type": "application/json" }, body: JSON.stringify({ reason }) });
      } catch {}
      try { state.engine?.leaveChannel?.(); state.engine?.destroy?.(); } catch {}
    };
    window.addEventListener("pagehide", () => endNow("page_hidden"));
    window.addEventListener("beforeunload", () => endNow("before_unload"));
    /* 切到后台不立刻挂断（手机常见），但超过 60 秒没回来就结束，避免静默计费 */
    let hiddenTimer = 0;
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") {
        if (hiddenTimer) window.clearTimeout(hiddenTimer);
        hiddenTimer = window.setTimeout(() => endNow("tab_hidden"), 60000);
        return;
      }
      if (hiddenTimer) { window.clearTimeout(hiddenTimer); hiddenTimer = 0; }
    });
  }

  function closeOverlay() {
    if (state.heartbeat) window.clearInterval(state.heartbeat);
    state.overlay?.root?.remove();
    state.overlay = null;
    state.session = null;
    state.character = null;
    state.ended = false;
    state.seqId = 1;
  }

  async function open(characterId) {
    const character = typeof characterId === "object" ? characterId : characterById(characterId);
    if (!character) throw new Error("角色不存在。");
    if (!authToken()) throw new Error("请先登录再开始在线聊天。");
    state.character = character;
    state.ended = false;
    state.seqId = 1;
    state.connId = `app-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    buildOverlay(character);
    const overlay = state.overlay;
    overlay.hangBtn.onclick = () => finishSession("user_end");
    overlay.sendBtn.onclick = async () => {
      const text = overlay.input.value.trim();
      if (!text) return;
      overlay.input.value = "";
      appendLine("user", text);
      if (state.session?.mode === "component") {
        overlay.sendBtn.disabled = true;
        try {
          const payload = await apiFetch(`/api/chat-live/sessions/${encodeURIComponent(state.session.id)}/say`, { method: "POST", body: JSON.stringify({ text }) });
          if (payload?.reply) appendLine("bot", payload.reply);
        } catch (error) {
          appendLine("sys", error.message || "数字人回复失败。");
        } finally {
          overlay.sendBtn.disabled = false;
        }
        return;
      }
      sendSignal(buildSignal(99, { text_msg: { msg_id: `c-${Date.now()}`, content: text, timestamp: Date.now() } }));
    };
    overlay.input.addEventListener("keydown", (event) => {
      if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        overlay.sendBtn.click();
      }
    });
    let muted = false;
    overlay.muteBtn.onclick = async () => {
      muted = !muted;
      try {
        await state.engine?.publishLocalAudioStream?.(!muted);
        overlay.muteBtn.textContent = muted ? "取消静音" : "静音";
      } catch {}
    };

    let payload;
    try {
      payload = await apiFetch("/api/chat-live/sessions", { method: "POST", body: JSON.stringify({ characterId: character.id }) });
    } catch (error) {
      setStageStatus("创建失败", "error");
      appendLine("sys", error.message || "创建会话失败。");
      overlay.sendBtn.disabled = true;
      return;
    }
    state.session = payload.session;
    bindUnloadGuard();
    startTimer();
    try {
      if (payload.session.mode === "component") {
        /* 组件版：服务端负责 LLM/TTS/推流，浏览器只进我们自己的 RTC 频道 */
        await joinRtc(payload.session);
        appendLine("sys", "已进入在线聊天，直接说话或打字都可以。");
      } else {
        await Promise.all([connectSignaling(payload.session), joinRtc(payload.session)]);
      }
    } catch (error) {
      setStageStatus("接入失败", "error");
      appendLine("sys", error.message || "接入实时音视频失败。");
    }
    return state.session;
  }

  window.ChatLive = {
    loadConfig,
    available,
    characters,
    characterById,
    open,
    close: closeOverlay,
    saleCreditsPerMinute,
  };
})();
