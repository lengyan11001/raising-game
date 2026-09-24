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
    micOn: false,
    listening: false,
    recognition: null,
    unbindViewport: null,
    remoteUserId: "",
    lastFrameAt: 0,
    lastPictureAt: 0,
    lastVideoTime: -1,
    seenPicture: false,
    seenBright: false,
    placeholderOn: true,
    videoFixes: 0,
    videoFixTotal: 0,
    boundUserId: "",
    remoteBoundOnce: false,
    rtcRecoveries: 0,
    frameWatch: 0,
    frameCallback: 0,
    rtcRecoverTimer: 0,
    controlReady: false,
    lookBusy: false,
    lookWait: null,
    lookStack: [],
    rtcClock: null,
    rtcClockStart: null,
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
    const raw = await response.text();
    let payload = {};
    try { payload = raw ? JSON.parse(raw) : {}; } catch { payload = {}; }
    if (!response.ok) {
      let message = payload?.message || payload?.error?.message || "";
      if (!message) {
        message = response.status === 502 || response.status === 504
          ? "数字人暂时没有接通，请再试一次。"
          : `请求失败（${response.status}）`;
      }
      const error = new Error(message);
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
.chat-live-overlay { position:fixed; inset:0; z-index:400; display:flex; align-items:center; justify-content:center; background:rgba(5,6,10,.96); -webkit-backdrop-filter:none; backdrop-filter:none; }
.chat-live-shell { position:relative; width:min(980px,100%); height:min(92vh,760px); display:grid; grid-template-columns:minmax(0,1.55fr) minmax(280px,1fr); gap:0; overflow:hidden; border:1px solid rgba(255,255,255,.12); border-radius:18px; background:#0b0d12; color:#f8fafc; }
.chat-live-stage { position:relative; background:#05060a; display:flex; align-items:center; justify-content:center; }
.chat-live-stage video { width:100%; height:100%; object-fit:cover; background:#05060a; }
.chat-live-placeholder { position:absolute; inset:0; z-index:2; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:8px; color:#94a3b8; text-align:center; padding:20px; background:#05060a; }
.chat-live-call-avatar { position:relative; width:148px; height:148px; display:grid; place-items:center; }
.chat-live-call-avatar img { width:112px; height:112px; border-radius:50%; object-fit:cover; position:relative; z-index:1; border:3px solid rgba(255,255,255,.92); box-shadow:0 10px 28px rgba(0,0,0,.35); }
.chat-live-rings { position:absolute; inset:0; pointer-events:none; }
.chat-live-rings i { position:absolute; inset:8px; border-radius:50%; border:2px solid rgba(125,211,252,.8); animation:chatLiveRing 1.8s ease-out infinite; }
.chat-live-rings i:nth-child(2) { animation-delay:.45s; }
.chat-live-rings i:nth-child(3) { animation-delay:.9s; }
@keyframes chatLiveRing { 0% { transform:scale(.62); opacity:.8; } 100% { transform:scale(1.28); opacity:0; } }
.chat-live-call-label { margin-top:14px; font-size:20px; font-weight:700; color:#f8fafc; letter-spacing:.12em; }
.chat-live-call-detail { font-style:normal; max-width:280px; font-size:14px; line-height:1.45; color:#94a3b8; }
.chat-live-placeholder.is-failed .chat-live-rings i { animation:none; opacity:0; }
.chat-live-placeholder.is-failed .chat-live-call-label { color:#f87171; letter-spacing:0; }
.chat-live-badge { position:absolute; top:14px; left:14px; z-index:4; display:inline-flex; align-items:center; gap:6px; padding:6px 12px; border-radius:999px; background:rgba(0,0,0,.55); font-size:12px; }
.chat-live-timer { position:absolute; top:14px; right:14px; z-index:4; padding:6px 12px; border-radius:999px; background:rgba(0,0,0,.55); font-size:12px; font-variant-numeric:tabular-nums; }
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
.chat-live-voice, .chat-live-close { display:none; }
.chat-live-voice { min-width:52px; height:42px; padding:0 10px; border:0; border-radius:999px; background:rgba(255,255,255,.14); color:#fff; font-size:13px; font-weight:700; flex:0 0 auto; }
.chat-live-voice.is-on { background:#ef4444; }
.chat-live-close { width:36px; height:36px; border:0; border-radius:999px; background:rgba(0,0,0,.45); color:#fff; font-size:22px; line-height:1; }
.chat-live-listen { display:none; position:absolute; left:50%; bottom:108px; transform:translateX(-50%); padding:10px 16px; border-radius:999px; background:rgba(0,0,0,.62); color:#fff; font-size:13px; }
.chat-live-listen.is-on { display:block; }
.chat-live-looks { position:absolute; z-index:5; right:14px; top:50%; transform:translateY(-50%); display:flex; flex-direction:column; gap:8px; padding:8px; border-radius:26px; background:rgba(8,10,16,.48); border:1px solid rgba(255,255,255,.16); box-shadow:0 12px 32px rgba(0,0,0,.28); }
.chat-live-look-btn { width:58px; min-height:58px; padding:6px 4px; border:0; border-radius:18px; background:rgba(255,255,255,.08); color:#fff; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:4px; font-size:10px; font-weight:700; line-height:1.1; cursor:pointer; }
.chat-live-look-icon { width:22px; height:22px; display:block; }
.chat-live-look-icon svg { width:22px; height:22px; display:block; }
.chat-live-look-btn[disabled] { opacity:.38; cursor:not-allowed; }
.chat-live-look-btn.is-on { background:rgba(255,255,255,.24); box-shadow:inset 0 0 0 1px rgba(255,255,255,.55); }
.chat-live-picker { position:absolute; inset:0; z-index:8; display:flex; align-items:center; justify-content:center; background:rgba(0,0,0,.62); padding:16px; }
.chat-live-picker-card { width:min(460px,100%); max-height:min(70vh,560px); display:flex; flex-direction:column; gap:12px; padding:14px; border-radius:16px; background:#12151c; color:#fff; }
.chat-live-picker-head { display:flex; align-items:center; justify-content:space-between; gap:12px; }
.chat-live-picker-head strong { font-size:15px; }
.chat-live-picker-x { width:32px; height:32px; border:0; border-radius:999px; background:rgba(255,255,255,.12); color:#fff; font-size:20px; line-height:1; cursor:pointer; }
.chat-live-picker-grid { overflow:auto; display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:10px; }
.chat-live-pick { display:flex; flex-direction:column; gap:6px; min-width:0; padding:6px; border-radius:12px; border:1px solid rgba(255,255,255,.14); background:transparent; color:#fff; cursor:pointer; text-align:left; }
.chat-live-pick img { width:100%; aspect-ratio:1; object-fit:cover; border-radius:8px; background:#000; pointer-events:none; user-select:none; }
.chat-live-pick span { font-size:12px; line-height:1.3; }
.chat-live-pick.is-on { border-color:#fff; }
.chat-live-pick[disabled] { opacity:.5; cursor:not-allowed; }
.chat-live-picker-empty { grid-column:1 / -1; margin:8px 0; color:#94a3b8; font-size:13px; }
.chat-live-picker-undo { width:100%; }
@media (max-width:880px) {
  .chat-live-overlay { align-items:stretch; background:#000; overflow:hidden; -webkit-backdrop-filter:none; backdrop-filter:none; }
  .chat-live-shell { width:100%; height:100%; border:0; border-radius:0; display:block; }
  .chat-live-stage { position:absolute; inset:0; width:100%; height:100%; transform:none; }
  .chat-live-stage video { width:100%; height:100%; object-fit:cover; transform:none; }
  .chat-live-badge, .chat-live-timer { top:calc(12px + env(safe-area-inset-top)); }
  .chat-live-timer { right:58px; }
  .chat-live-side { position:absolute; inset:0; border:0; background:transparent; pointer-events:none; display:flex; flex-direction:column; justify-content:flex-end; }
  .chat-live-head { position:absolute; top:0; left:0; right:120px; z-index:2; pointer-events:none; border:0; background:linear-gradient(to bottom, rgba(0,0,0,.55), transparent); padding:calc(12px + env(safe-area-inset-top)) 12px 28px; display:block; }
  .chat-live-head p { display:none; }
  .chat-live-head h3 { font-size:16px; text-shadow:0 1px 2px rgba(0,0,0,.6); }
  .chat-live-close { display:inline-flex; align-items:center; justify-content:center; position:absolute; z-index:6; top:calc(12px + env(safe-area-inset-top)); right:calc(12px + env(safe-area-inset-right)); pointer-events:auto; }
  .chat-live-log { pointer-events:none; flex:0 1 auto; max-height:34vh; background:transparent; padding:0 14px 8px; gap:4px; -webkit-mask-image:linear-gradient(to bottom, transparent, #000 18%); mask-image:linear-gradient(to bottom, transparent, #000 18%); }
  .chat-live-line { background:transparent !important; color:#fff; text-shadow:0 1px 2px rgba(0,0,0,.85); border-radius:0; padding:2px 0; max-width:86%; font-size:15px; align-self:flex-start; }
  .chat-live-line.is-user::before, .chat-live-line.is-bot::before { content:attr(data-who) "："; color:#7dd3fc; margin-right:4px; }
  .chat-live-line.is-sys { align-self:center; font-size:12px; color:rgba(255,255,255,.78); }
  .chat-live-actions { pointer-events:auto; border:0; background:linear-gradient(to top, rgba(0,0,0,.72), transparent); padding:8px 12px calc(12px + env(safe-area-inset-bottom)); }
  .chat-live-input input { height:42px; border:0; border-radius:999px; background:rgba(255,255,255,.16); }
  .chat-live-input .chat-live-btn { width:auto; min-width:52px; padding:0 12px; border-radius:999px; }
  .chat-live-voice { display:inline-flex; align-items:center; justify-content:center; }
  .chat-live-row, .chat-live-cost { display:none; }
  .chat-live-listen { bottom:calc(78px + env(safe-area-inset-bottom)); pointer-events:none; }
  .chat-live-looks { top:auto; bottom:calc(78px + env(safe-area-inset-bottom)); left:50%; right:auto; transform:translateX(-50%); flex-direction:row; }
  .chat-live-picker { align-items:flex-end; padding:0; }
  .chat-live-picker-card { width:100%; max-height:68%; border-radius:16px 16px 0 0; padding-bottom:calc(14px + env(safe-area-inset-bottom)); }
}
`;
    document.head.appendChild(style);
  }

  /* 不同 SDK 版本方法名不一致，逐个尝试存在的方法（模块作用域，供 joinRtc 使用） */
  async function callIfPresent(engine, names, ...args) {
    for (const name of names) {
      if (typeof engine?.[name] === "function") {
        try { await engine[name](...args); return true; } catch { /* 试下一个 */ }
      }
    }
    return false;
  }

  /* 阿里云 SDK 的 Clock 单例一创建就每 30 秒请求 time.akamai.com，destroy 不会停。
     包一层，挂断时停表，下次进房再开。 */
  function hookRtcClock() {
    const rtc = window.AliRTS;
    const Clock = rtc && rtc.Clock;
    if (!Clock || Clock.__chatLiveWrapped || typeof Clock.prototype?.startSyncClock !== "function") return;
    const origStart = Clock.prototype.startSyncClock;
    Clock.prototype.startSyncClock = function startSyncClock() {
      if (this.__chatLiveHold) return;
      return origStart.call(this);
    };
    function WrappedClock(...args) {
      const instance = new Clock(...args);
      state.rtcClock = instance;
      return instance;
    }
    WrappedClock.__chatLiveWrapped = true;
    WrappedClock.prototype = Clock.prototype;
    rtc.Clock = WrappedClock;
    state.rtcClockStart = origStart;
  }

  function pauseRtcClock() {
    const clock = state.rtcClock;
    if (!clock) return;
    clock.__chatLiveHold = true;
    try { clock.stopSyncClock(); } catch {}
  }

  function resumeRtcClock() {
    const clock = state.rtcClock;
    if (!clock || !clock.__chatLiveHold) return;
    clock.__chatLiveHold = false;
    try { state.rtcClockStart?.call(clock); } catch {}
  }

  async function releaseRtc() {
    pauseRtcClock();
    const engine = state.engine;
    state.engine = null;
    if (!engine) return;
    try { await engine.leaveChannel?.(); } catch {}
    try {
      const done = engine.destroy?.();
      if (done && typeof done.then === "function") await done;
    } catch {}
  }

  function loadRtcSdk() {
    if (window.AliRtcEngine) {
      hookRtcClock();
      return Promise.resolve();
    }
    return new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = RTC_SDK_URL;
      script.async = true;
      script.onload = () => {
        hookRtcClock();
        resolve();
      };
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
    video.muted = true;
    video.setAttribute("playsinline", "true");
    video.setAttribute("webkit-playsinline", "true");
    const placeholder = el("div", "chat-live-placeholder is-calling");
    const avatarWrap = el("div", "chat-live-call-avatar");
    const rings = el("div", "chat-live-rings");
    rings.append(el("i"), el("i"), el("i"));
    const avatar = document.createElement("img");
    avatar.src = character.portraitUrl || character.avatarUrl || "";
    avatar.alt = "";
    avatarWrap.append(rings, avatar);
    const callLabel = el("strong", "chat-live-call-label", "正在呼叫");
    const callDetail = el("em", "chat-live-call-detail", character.name || "");
    placeholder.append(avatarWrap, callLabel, callDetail);
    const badge = el("span", "chat-live-badge", "");
    badge.hidden = true;
    const timer = el("span", "chat-live-timer", "00:00");
    const lookRail = el("div", "chat-live-looks");
    lookRail.hidden = true;
    const lookIcons = {
      garment: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M8 7 12 4l4 3 3 2-2 2v9H7v-9L5 9l3-2z"/></svg>',
      object: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M8 11V7a4 4 0 0 1 8 0v4"/><path d="M6 11h12v8a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2v-8z"/></svg>',
      background: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><rect x="4" y="5" width="16" height="14" rx="2"/><path d="m8 15 2.5-3 2 2.2L16 10l4 5"/></svg>',
    };
    [["garment", "换装"], ["object", "拿物"], ["background", "背景"]].forEach(([kind, label]) => {
      const button = el("button", "chat-live-look-btn");
      button.type = "button";
      button.dataset.lookKind = kind;
      button.disabled = true;
      const icon = el("span", "chat-live-look-icon");
      icon.innerHTML = lookIcons[kind];
      button.append(icon, el("span", "", label));
      lookRail.appendChild(button);
    });
    const undressBtn = el("button", "chat-live-look-btn");
    undressBtn.type = "button";
    undressBtn.dataset.lookKind = "undress";
    undressBtn.disabled = true;
    undressBtn.hidden = !String(character.undressImageUrl || "");
    undressBtn.setAttribute("aria-pressed", "false");
    const undressIcon = el("span", "chat-live-look-icon");
    undressIcon.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M12 3v3"/><path d="m7 6 2 2"/><path d="m17 6-2 2"/><circle cx="12" cy="14" r="5"/></svg>';
    undressBtn.append(undressIcon, el("span", "", "Undress"));
    lookRail.appendChild(undressBtn);
    stage.append(video, placeholder, badge, timer, lookRail);

    const side = el("div", "chat-live-side");
    const head = el("div", "chat-live-head");
    const title = el("h3", "", character.name || "在线聊天");
    const subtitle = el("p", "", "直接说话，或在下面打字。");
    const closeBtn = el("button", "chat-live-close", "×");
    closeBtn.type = "button";
    closeBtn.setAttribute("aria-label", "挂断");
    head.append(title, subtitle);

    const log = el("div", "chat-live-log");
    const actions = el("div", "chat-live-actions");
    const inputRow = el("div", "chat-live-input");
    const voiceBtn = el("button", "chat-live-voice", "语音");
    voiceBtn.type = "button";
    voiceBtn.setAttribute("aria-pressed", "false");
    const input = document.createElement("input");
    input.placeholder = "说点什么…";
    input.enterKeyHint = "send";
    const sendBtn = el("button", "chat-live-btn is-primary", "发送");
    sendBtn.type = "button";
    inputRow.append(voiceBtn, input, sendBtn);
    const listen = el("div", "chat-live-listen", "正在听…");
    const row = el("div", "chat-live-row");
    const muteBtn = el("button", "chat-live-btn is-ghost", "静音");
    muteBtn.type = "button";
    const hangBtn = el("button", "chat-live-btn is-danger", "挂断");
    hangBtn.type = "button";
    row.append(muteBtn, hangBtn);
    const cost = el("div", "chat-live-cost", `${saleCreditsPerMinute()} 积分/分钟 · 最长 ${pricing.maxMinutes || 10} 分钟`);
    actions.append(inputRow, row, cost);
    side.append(head, log, actions, listen);
    shell.append(stage, side, closeBtn);
    overlay.appendChild(shell);
    document.body.appendChild(overlay);

    state.overlay = { root: overlay, video, placeholder, callLabel, callDetail, badge, timer, log, input, sendBtn, muteBtn, hangBtn, cost, voiceBtn, closeBtn, listen, lookRail, picker: null };
    state.unbindViewport = bindViewport(overlay);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    state.overlay.restoreOverflow = previousOverflow;
    return state.overlay;
  }

  function appendLine(kind, text) {
    if (!state.overlay || !text) return;
    const line = el("div", `chat-live-line is-${kind}`, text);
    if (kind === "user") line.dataset.who = "我";
    else if (kind === "bot") line.dataset.who = state.character?.name || "她";
    state.overlay.log.appendChild(line);
    while (state.overlay.log.children.length > 30) state.overlay.log.firstChild.remove();
    state.overlay.log.scrollTop = state.overlay.log.scrollHeight;
  }

  function isPhoneLayout() {
    return window.matchMedia("(max-width: 880px)").matches;
  }

  function bindViewport(overlay) {
    const vv = window.visualViewport;
    if (!vv) return () => {};
    const side = overlay.querySelector(".chat-live-side");
    const sync = () => {
      overlay.style.height = "";
      overlay.style.top = "";
      overlay.style.bottom = "";
      if (!side) return;
      if (!isPhoneLayout()) {
        side.style.paddingBottom = "";
        return;
      }
      /* 键盘只抬输入栏。不要改视频舞台尺寸，iOS 上缩放 WebRTC video 会把画面打成黑屏，计时器还在走。 */
      const lift = Math.max(0, Math.round(window.innerHeight - (vv.offsetTop + vv.height)));
      side.style.paddingBottom = lift > 8 ? `${lift}px` : "";
    };
    vv.addEventListener("resize", sync);
    vv.addEventListener("scroll", sync);
    window.addEventListener("orientationchange", sync);
    sync();
    return () => {
      vv.removeEventListener("resize", sync);
      vv.removeEventListener("scroll", sync);
      window.removeEventListener("orientationchange", sync);
    };
  }

  function setVoiceUi(on) {
    state.listening = !!on;
    const button = state.overlay?.voiceBtn;
    if (!button) return;
    button.classList.toggle("is-on", !!on || state.micOn);
    button.textContent = on ? "聆听" : (state.micOn ? "开麦" : "语音");
    button.setAttribute("aria-pressed", (on || state.micOn) ? "true" : "false");
    state.overlay.listen?.classList.toggle("is-on", !!on);
  }

  async function setMicPublished(on) {
    if (!state.engine || typeof state.engine.publishLocalAudioStream !== "function") return false;
    try {
      await state.engine.publishLocalAudioStream(!!on);
      state.micOn = !!on;
      if (state.overlay?.muteBtn) state.overlay.muteBtn.textContent = state.micOn ? "静音" : "开麦";
      setVoiceUi(state.listening);
      return true;
    } catch {
      state.micOn = false;
      setVoiceUi(false);
      return false;
    }
  }

  function stopRecognition() {
    const rec = state.recognition;
    state.recognition = null;
    if (!rec) return;
    try { rec.onresult = null; rec.onerror = null; rec.onend = null; rec.stop(); } catch {}
    setVoiceUi(false);
  }

  function toggleComponentVoice() {
    if (state.recognition) {
      stopRecognition();
      return;
    }
    const Rec = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Rec) {
      appendLine("sys", "这个浏览器不能直接发语音，请用文字。");
      return;
    }
    const rec = new Rec();
    const lang = String(state.character?.language || "zh");
    rec.lang = lang.startsWith("en") ? "en-US" : "zh-CN";
    rec.interimResults = false;
    rec.continuous = false;
    rec.onresult = (event) => {
      const heard = String(event.results?.[0]?.[0]?.transcript || "").trim();
      if (heard) state.sendUserText?.(heard);
    };
    rec.onerror = () => setVoiceUi(false);
    rec.onend = () => {
      state.recognition = null;
      setVoiceUi(false);
    };
    state.recognition = rec;
    try {
      rec.start();
      setVoiceUi(true);
    } catch {
      state.recognition = null;
      appendLine("sys", "语音没有打开，请允许麦克风或改用文字。");
    }
  }

  function setStageStatus(text, tone = "", detail = "") {
    if (!state.overlay) return;
    if (tone === "error") {
      state.overlay.placeholder?.classList.add("is-failed");
      state.overlay.placeholder?.classList.remove("is-calling");
      if (state.overlay.callLabel) state.overlay.callLabel.textContent = text || "创建失败";
      if (detail && state.overlay.callDetail) state.overlay.callDetail.textContent = detail;
      state.overlay.badge.hidden = false;
      state.overlay.badge.textContent = `● ${text}`;
      state.overlay.badge.style.color = "#f87171";
      return;
    }
    state.overlay.badge.hidden = true;
    state.overlay.badge.textContent = "";
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
      if (seconds >= maxSeconds) finishSession("client_timeout", "达到单次最长时长");
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
        state.controlReady = true;
        setStageStatus("已连接", "ok");
        syncLookRail();
        /* 控制通道连上不等于画面出来了，占位头像留到第一帧再关 */
      } else {
        setStageStatus("准备中", "");
        window.setTimeout(() => sendSignal(buildSignal(1, { conn_init: { version: 1 } })), 2000);
      }
      return;
    }
    if (type === 12) {
      const ack = payload.prompt_operation_ack || {};
      state.lookWait?.settle(ack);
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
      const raw = String(payload.hangup?.hangup_reason || "").replace(/[A-Za-z0-9_-]{24,}/g, "[redacted]").replace(/\s+/g, " ").trim().slice(0, 80);
      const safe = raw.replace(/[^a-z0-9_.-]/gi, "").slice(0, 48) || "upstream_hangup";
      appendLine("sys", `会话已结束（${raw || "服务端结束"}）。`);
      failLookWait("会话已经结束。");
      finishSession(safe, raw || "服务端结束");
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
      socket.addEventListener("error", () => {
        setStageStatus("控制通道异常", "error");
        reportSessionIssue("socket_error", "控制通道异常");
      });
      socket.addEventListener("close", () => {
        if (!state.ended) {
          finishSession("socket_closed", "控制通道断开");
        }
      });
    });
  }


  function showPlaceholder() {
    const overlay = state.overlay;
    if (!overlay) return;
    state.placeholderOn = true;
    overlay.placeholder.style.display = "flex";
  }

  function hidePlaceholder() {
    const overlay = state.overlay;
    if (!overlay) return;
    state.placeholderOn = false;
    overlay.placeholder.style.display = "none";
  }

  function sampleBrightness(video) {
    if (!video || video.readyState < 2 || !video.videoWidth) return null;
    try {
      const canvas = sampleBrightness.canvas || (sampleBrightness.canvas = document.createElement("canvas"));
      canvas.width = 8;
      canvas.height = 8;
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      ctx.drawImage(video, 0, 0, 8, 8);
      const data = ctx.getImageData(0, 0, 8, 8).data;
      let sum = 0;
      for (let i = 0; i < data.length; i += 4) sum += data[i] + data[i + 1] + data[i + 2];
      return sum;
    } catch {
      return null;
    }
  }

  function bindRemoteVideo(userId, force = false) {
    const engine = state.engine;
    const video = state.overlay?.video;
    const uid = userId || state.remoteUserId;
    if (!engine || !video || !uid || state.ended) return;
    state.remoteUserId = uid;
    video.playsInline = true;
    video.setAttribute("playsinline", "true");
    video.setAttribute("webkit-playsinline", "true");
    /* 已经绑上时只 play。setRemoteViewConfig 会 load() 重绑，正常画面会被刷黑。 */
    if (!force && state.boundUserId === uid && video.srcObject) {
      video.play().catch(() => {});
      return;
    }
    state.boundUserId = uid;
    try { engine.setRemoteViewConfig(video, uid, 1); } catch {}
    video.play().catch(() => {});
  }

  async function resubscribeVideo() {
    const engine = state.engine;
    if (!engine || state.ended) return;
    const userId = state.remoteUserId;
    if (userId && typeof engine.subscribeRemoteMediaStream === "function") {
      try {
        await engine.subscribeRemoteMediaStream(userId, 1, true, true);
        bindRemoteVideo(userId, true);
        return;
      } catch {}
    }
    await callIfPresent(engine, ["subscribeAllRemoteVideoStreams", "setDefaultSubscribeAllRemoteVideoStreams"], true);
    bindRemoteVideo(userId, true);
  }

  function reportSessionIssue(code, message) {
    const sessionId = state.session?.id;
    if (!sessionId) return Promise.resolve(false);
    const cleanCode = String(code || "").replace(/[^a-z0-9_.-]/gi, "").slice(0, 48);
    const cleanMessage = String(message || "").replace(/\s+/g, " ").trim().slice(0, 180);
    if (!cleanCode && !cleanMessage) return Promise.resolve(false);
    const key = `${cleanCode}|${cleanMessage}`;
    if (!state.reportedIssues) state.reportedIssues = new Set();
    if (state.reportedIssues.has(key)) return Promise.resolve(false);
    state.reportedIssues.add(key);
    return apiFetch(`/api/chat-live/sessions/${encodeURIComponent(sessionId)}/issues`, {
      method: "POST",
      body: JSON.stringify({ code: cleanCode, message: cleanMessage }),
    }).then(() => true).catch(() => false);
  }

  function videoIssue(reason) {
    if (reason === "black") return { code: "video_black", message: "画面变黑" };
    if (reason === "offline") return { code: "video_offline", message: "数字人画面断开" };
    if (reason === "unsubscribe") return { code: "video_unsubscribe", message: "视频订阅中断" };
    return { code: "video_stall", message: "画面卡住，时间还在走" };
  }

  function recoverVideoOnce(reason) {
    if (state.ended) return;
    if (state.videoFixes >= 1 || state.videoFixTotal >= 2) return;
    state.videoFixes += 1;
    state.videoFixTotal += 1;
    state.boundUserId = "";
    const now = Date.now();
    state.lastFrameAt = now;
    state.lastPictureAt = now;
    showPlaceholder();
    const issue = videoIssue(reason);
    reportSessionIssue(issue.code, issue.message);
    appendLine("sys", reason === "offline" ? "数字人画面断开，正在重拉…" : "画面卡住了，正在重新拉取…");
    resubscribeVideo();
  }

  function scheduleRtcRecover(reason, code) {
    if (state.ended) return;
    const byeCode = code == null || typeof code === "object" ? "" : String(code).replace(/[^a-z0-9_.-]/gi, "").slice(0, 24);
    const issueCode = reason === "bye" ? "rtc_bye" : "remote_offline";
    reportSessionIssue(issueCode, byeCode ? `RTC 断开 ${byeCode}` : (reason === "bye" ? "RTC 连接断开" : "远端离线"));
    if (state.rtcRecoveries >= 1) {
      appendLine("sys", "画面恢复失败，已结束通话，避免继续计费。");
      finishSession(issueCode, byeCode ? `RTC 断开 ${byeCode}` : "画面恢复失败");
      return;
    }
    state.rtcRecoveries += 1;
    showPlaceholder();
    state.lastFrameAt = Date.now();
    state.lastPictureAt = Date.now();
    appendLine("sys", `画面断了（${code ?? reason}），正在重连…`);
    if (state.rtcRecoverTimer) window.clearTimeout(state.rtcRecoverTimer);
    state.rtcRecoverTimer = window.setTimeout(async () => {
      state.rtcRecoverTimer = 0;
      if (state.ended) return;
      const session = state.session;
      const engine = state.engine;
      if (!session?.rtc?.token || !engine) {
        finishSession("rtc_bye", "缺少重连凭证");
        return;
      }
      try {
        await engine.joinChannel(session.rtc.token, session.rtc.user_id);
        await callIfPresent(engine, ["setDefaultSubscribeAllRemoteVideoStreams", "subscribeAllRemoteVideoStreams"], true);
        await resubscribeVideo();
      } catch {
        finishSession("rtc_bye", "重连失败");
      }
    }, 800);
  }

  function noteHealthyPicture(now) {
    state.lastPictureAt = now;
    state.lastFrameAt = now;
    state.videoFixes = 0;
    state.seenPicture = true;
    hidePlaceholder();
  }

  function stopVideoWatch() {
    if (state.frameWatch) window.clearInterval(state.frameWatch);
    state.frameWatch = 0;
    if (state.rtcRecoverTimer) window.clearTimeout(state.rtcRecoverTimer);
    state.rtcRecoverTimer = 0;
    const video = state.overlay?.video;
    if (video && state.frameCallback && typeof video.cancelVideoFrameCallback === "function") {
      try { video.cancelVideoFrameCallback(state.frameCallback); } catch {}
    }
    state.frameCallback = 0;
  }

  function startVideoWatch() {
    if (state.frameWatch || state.ended) return;
    const arm = () => {
      const video = state.overlay?.video;
      if (!video || state.ended || typeof video.requestVideoFrameCallback !== "function") return;
      state.frameCallback = video.requestVideoFrameCallback(() => {
        if (!state.ended && document.visibilityState !== "hidden") state.lastFrameAt = Date.now();
        arm();
      });
    };
    arm();
    state.frameWatch = window.setInterval(() => {
      if (state.ended || !state.overlay) return;
      if (document.visibilityState === "hidden") {
        const nowHidden = Date.now();
        state.lastFrameAt = nowHidden;
        state.lastPictureAt = nowHidden;
        return;
      }
      const video = state.overlay.video;
      const now = Date.now();
      let frameMoved = false;
      if (video && video.readyState >= 2 && video.currentTime > state.lastVideoTime + 0.01) {
        state.lastVideoTime = video.currentTime;
        state.lastFrameAt = now;
        frameMoved = true;
      }
      const bright = video ? sampleBrightness(video) : null;
      const pictureOk = bright != null && bright >= 400;
      if (pictureOk) {
        state.seenBright = true;
        noteHealthyPicture(now);
      } else if (bright == null && frameMoved && video && video.videoWidth > 0) {
        noteHealthyPicture(now);
      } else if (!state.seenBright && frameMoved && video && video.videoWidth > 0) {
        /* 采样失败或首帧偏暗时先把画面放出来，不能一直挡在头像后面 */
        noteHealthyPicture(now);
      }
      const sinceStart = state.startedAt ? now - state.startedAt : 0;
      const noFrameFor = state.lastFrameAt ? now - state.lastFrameAt : sinceStart;
      const noPictureFor = state.lastPictureAt ? now - state.lastPictureAt : sinceStart;
      const frameLimit = state.lastFrameAt ? 12000 : 25000;
      const pictureBlack = state.seenBright && bright != null && bright < 400 && noPictureFor >= 12000;
      const framesDead = noFrameFor >= frameLimit;
      if (!framesDead && !pictureBlack) return;
      if (state.videoFixes < 1 && state.videoFixTotal < 2) {
        recoverVideoOnce(pictureBlack ? "black" : "stall");
        return;
      }
      appendLine("sys", "画面中断，已结束通话，避免继续计费。");
      finishSession(pictureBlack ? "video_black" : "video_stalled", pictureBlack ? "画面黑屏超过 12 秒" : "画面卡住后未能恢复");
    }, 1000);
  }

  async function joinRtc(session) {
    await loadRtcSdk();
    const supported = await window.AliRtcEngine.isSupported();
    if (!supported?.support) throw new Error(`当前浏览器不支持实时通话（${supported?.reason || "unknown"}）`);
    window.AliRtcEngine.setLogLevel(0);
    const engine = window.AliRtcEngine.getInstance();
    state.engine = engine;
    resumeRtcClock();
    engine.on("bye", (code) => scheduleRtcRecover("bye", code));
    engine.on("remoteUserOffLineNotify", (userId) => {
      if (userId) state.remoteUserId = userId;
      showPlaceholder();
      setStageStatus("画面中断", "error");
      recoverVideoOnce("offline");
    });
    engine.on("videoSubscribeStateChanged", (userId, _oldState, newState) => {
      if (userId) state.remoteUserId = userId;
      /* 0 idle, 1 not subscribed, 2 subscribing, 3 subscribed */
      if (newState === 3) {
        state.remoteBoundOnce = true;
        bindRemoteVideo(userId);
        return;
      }
      /* 开播前就会先报未订阅，这时重拉会把恢复机会提前用掉 */
      if (newState === 1 && (state.seenPicture || state.remoteBoundOnce)) {
        showPlaceholder();
        recoverVideoOnce("unsubscribe");
      }
    });
    engine.on("userVideoMuted", (userId, muted) => {
      if (userId) state.remoteUserId = userId;
      if (muted) showPlaceholder();
      else bindRemoteVideo(userId || state.remoteUserId);
    });
    engine.on("remoteVideoAutoPlayFail", () => {
      state.overlay?.video?.play?.().catch(() => {});
    });
    engine.on("authInfoWillExpire", () => appendLine("sys", "凭证即将过期，请尽快结束本轮对话。"));
    const video = state.overlay?.video;
    if (video) {
      video.addEventListener("pause", () => {
        if (state.ended || document.visibilityState === "hidden") return;
        video.play().catch(() => {});
      });
    }
    /* SDK 版本之间方法名不一致：存在才调，避免 "is not a function" 直接中断接入 */
    await callIfPresent(engine, ["setChannelProfile"], "communication");
    await callIfPresent(engine, ["setDefaultPublishLocalAudioStream", "publishLocalAudioStreamEnabled"], true);
    await callIfPresent(engine, ["setDefaultPublishLocalVideoStream", "publishLocalVideoStreamEnabled"], false); /* 单向：不推摄像头 */
    await callIfPresent(engine, ["setDefaultSubscribeAllRemoteAudioStreams", "subscribeAllRemoteAudioStreams"], true);
    await callIfPresent(engine, ["setDefaultSubscribeAllRemoteVideoStreams", "subscribeAllRemoteVideoStreams"], true);
    await engine.joinChannel(session.rtc.token, session.rtc.user_id);
    try {
      await engine.publishLocalAudioStream(true);
      state.micOn = true;
      setVoiceUi(false);
    } catch (error) {
      state.micOn = false;
      setVoiceUi(false);
      appendLine("sys", "麦克风未授权，你可以先用文字聊天。");
      setStageStatus("无麦克风权限", "error");
    }
    setStageStatus("连线中", "");
  }

  async function endSessionRequest(sessionId, reason = "", note = "") {
    try {
      const payload = await apiFetch(`/api/chat-live/sessions/${encodeURIComponent(sessionId)}/end`, {
        method: "POST",
        body: JSON.stringify({ reason: String(reason || ""), note: String(note || "").slice(0, 180) }),
      });
      return payload?.session || null;
    } catch {
      return null;
    }
  }

  async function finishSession(reason = "user_end", note = "") {
    if (state.ended) return;
    state.ended = true;
    pauseRtcClock();
    failLookWait("会话已经结束。");
    state.lookBusy = false;
    closeLookPicker();
    syncLookRail();
    stopVideoWatch();
    if (state.heartbeat) window.clearInterval(state.heartbeat);
    state.heartbeat = 0;
    const sessionId = state.session?.id;
    const diagnosticNote = String(note || "").slice(0, 180);
    if (sessionId && /^(video_|rtc_bye$|remote_offline$|join_failed$|socket_closed$|socket_error$|upstream_hangup$|idle_timeout$|client_reconnect_timeout$)/.test(String(reason || ""))) {
      await reportSessionIssue(reason, diagnosticNote);
    }
    try {
      if (state.ws && state.ws.readyState === WebSocket.OPEN) {
        state.ws.send(JSON.stringify(buildSignal(5, { hangup: { hangup_reason: reason } })));
        state.ws.close();
      }
    } catch {}
    state.ws = null;
    await releaseRtc();
    const settled = sessionId ? await endSessionRequest(sessionId, reason, diagnosticNote) : null;
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
      if (state.overlay.voiceBtn) state.overlay.voiceBtn.disabled = true;
      stopRecognition();
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
      failLookWait("会话已经结束。");
      state.lookBusy = false;
      closeLookPicker();
      syncLookRail();
      stopVideoWatch();
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
      pauseRtcClock();
      try { state.engine?.leaveChannel?.(); state.engine?.destroy?.(); } catch {}
      state.engine = null;
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
      state.lastFrameAt = Date.now();
      state.lastPictureAt = Date.now();
      state.overlay?.video?.play?.().catch(() => {});
    });
  }

  function closeOverlay() {
    stopVideoWatch();
    failLookWait("会话已经结束。");
    closeLookPicker();
    if (state.heartbeat) window.clearInterval(state.heartbeat);
    stopRecognition();
    try { state.unbindViewport?.(); } catch {}
    state.unbindViewport = null;
    if (state.overlay?.restoreOverflow !== undefined) document.body.style.overflow = state.overlay.restoreOverflow;
    state.overlay?.root?.remove();
    state.overlay = null;
    state.session = null;
    state.character = null;
    state.ended = false;
    state.micOn = false;
    state.seqId = 1;
    state.sendUserText = null;
    state.controlReady = false;
    state.lookBusy = false;
    state.lookStack = [];
  }

  const LOOK_TEXT = {
    garment: "穿上参考图里的衣服。",
    object: "拿着参考图里的物品。",
    background: "换成参考图里的背景。",
  };
  const UNDRESS_LOOK_TEXT = "按照参考图改变衣着，呈现参考图中的状态。";
  const LOOK_TITLE = { garment: "换装", object: "手里拿东西", background: "换背景" };

  function lookFailureMessage(code) {
    return ({
      PROMPT_OP_PARAM_INVALID: "素材参数不对，换不了。",
      PROMPT_OP_MODEL_NOT_SUPPORTED: "当前数字人不是 vidu-s2，不能换画面。",
      PROMPT_OP_LIVE_NOT_ACTIVE: "会话还没开始或已经结束。",
      PROMPT_OP_IMAGE_TRANSFER_FAILED: "数字人拉不到这张图，请换一张再试。",
      PROMPT_OP_SIP_NOT_CONNECTED: "画面还在准备，请几秒后再试。",
      PROMPT_OP_FAILED: "画面切换失败，请再试一次。",
    })[String(code || "")] || "画面切换失败，请再试一次。";
  }

  function looksSupported() {
    const model = String(state.session?.model || state.config?.pricing?.model || "");
    const callMode = String(state.session?.callMode || state.config?.pricing?.callMode || "video");
    if (callMode === "audio") return false;
    if (model && model !== "vidu-s2") return false;
    return true;
  }

  function lookChannelReady() {
    if (state.ended || !state.session) return false;
    if (state.session.mode === "component") return true;
    return state.controlReady === true;
  }

  function syncLookRail() {
    const rail = state.overlay?.lookRail;
    if (!rail) return;
    rail.hidden = !state.session || !looksSupported() || state.ended;
    const ready = lookChannelReady() && !state.lookBusy;
    const undressOn = state.lookStack[state.lookStack.length - 1] === "undress";
    rail.querySelectorAll("button").forEach((button) => {
      if (button.dataset.lookKind === "undress") {
        button.hidden = !String(state.character?.undressImageUrl || "");
        button.classList.toggle("is-on", undressOn && !button.hidden);
        button.setAttribute("aria-pressed", undressOn && !button.hidden ? "true" : "false");
      }
      button.disabled = !ready;
    });
    state.overlay.picker?.querySelectorAll("button").forEach((button) => {
      if (button.classList.contains("chat-live-picker-x")) return;
      button.disabled = state.lookBusy || state.ended;
    });
  }

  function failLookWait(message) {
    const wait = state.lookWait;
    state.lookWait = null;
    if (!wait) return;
    window.clearTimeout(wait.timer);
    wait.reject(new Error(message || "画面切换失败，请再试一次。"));
  }

  function beginLookWait() {
    failLookWait("画面切换已取消。");
    return new Promise((resolve, reject) => {
      const wait = {
        resolve,
        reject,
        timer: window.setTimeout(() => {
          if (state.lookWait !== wait) return;
          state.lookWait = null;
          reject(new Error("画面切换超时，请再试一次。"));
        }, 12000),
        settle(ack) {
          if (state.lookWait !== wait) return;
          window.clearTimeout(wait.timer);
          state.lookWait = null;
          if (ack?.success === true) resolve(ack);
          else reject(new Error(lookFailureMessage(ack?.error_code)));
        },
      };
      state.lookWait = wait;
    });
  }

  function closeLookPicker() {
    state.overlay?.picker?.remove();
    if (state.overlay) state.overlay.picker = null;
  }

  function looksOf(kind) {
    return (Array.isArray(state.config?.looks) ? state.config.looks : []).filter((item) => item && item.kind === kind && item.imageUrl);
  }

  async function sendLookOperation({ look = null, remove = false, undress = false } = {}) {
    if (state.lookBusy) throw new Error("上一次切换还在处理。");
    if (!lookChannelReady()) throw new Error("画面还在准备，请几秒后再试。");
    state.lookBusy = true;
    syncLookRail();
    try {
      if (state.session?.mode === "component") {
        const body = remove ? { op: "remove" } : undress ? { op: "undress" } : { lookId: look?.id || "" };
        await apiFetch(`/api/chat-live/sessions/${encodeURIComponent(state.session.id)}/look`, {
          method: "POST",
          body: JSON.stringify(body),
        });
        return;
      }
      const pending = beginLookWait();
      const prompt = remove
        ? { op_type: "remove" }
        : {
            op_type: "switch",
            images: [{
              image_uri: String(look?.imageUrl || ""),
              image_id: `${undress ? "ud" : "lk"}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`.slice(0, 128),
              kind: undress ? "garment" : look.kind,
              user_text: String(undress ? UNDRESS_LOOK_TEXT : (look.userText || LOOK_TEXT[look.kind] || "")).slice(0, 200),
            }],
          };
      const sent = sendSignal(buildSignal(11, { prompt_operation: prompt }));
      if (!sent) failLookWait("画面通道不可用，请稍后再试。");
      await pending;
    } finally {
      state.lookBusy = false;
      syncLookRail();
    }
  }

  async function chooseLook(look) {
    try {
      await sendLookOperation({ look });
      state.lookStack.push(look.id);
      syncLookRail();
      appendLine("sys", `已切换：${look.name || LOOK_TITLE[look.kind] || "素材"}`);
      closeLookPicker();
    } catch (error) {
      if (state.ended) return;
      appendLine("sys", error.message || "画面切换失败，请再试一次。");
    }
  }

  async function undoLook() {
    try {
      await sendLookOperation({ remove: true });
      state.lookStack.pop();
      syncLookRail();
      appendLine("sys", "已撤销上一次画面。");
      closeLookPicker();
    } catch (error) {
      if (state.ended) return;
      appendLine("sys", error.message || "撤销失败，请再试一次。");
    }
  }

  function openLookPicker(kind) {
    if (!state.overlay || state.ended) return;
    if (!lookChannelReady()) {
      appendLine("sys", "画面还在准备，请几秒后再试。");
      return;
    }
    closeLookPicker();
    const looks = looksOf(kind);
    const activeId = state.lookStack[state.lookStack.length - 1] || "";
    const picker = el("div", "chat-live-picker");
    const card = el("div", "chat-live-picker-card");
    const head = el("div", "chat-live-picker-head");
    head.append(el("strong", "", LOOK_TITLE[kind] || "画面素材"));
    const close = el("button", "chat-live-picker-x", "×");
    close.type = "button";
    close.setAttribute("aria-label", "关闭");
    head.appendChild(close);
    const grid = el("div", "chat-live-picker-grid");
    if (!looks.length) grid.appendChild(el("p", "chat-live-picker-empty", "这类素材还没配置。"));
    looks.forEach((look) => {
      const button = el("button", `chat-live-pick${look.id === activeId ? " is-on" : ""}`);
      button.type = "button";
      const img = document.createElement("img");
      img.src = look.imageUrl;
      img.alt = look.name || "";
      img.draggable = false;
      button.append(img, el("span", "", look.name || LOOK_TITLE[kind] || "素材"));
      button.addEventListener("click", () => chooseLook(look));
      grid.appendChild(button);
    });
    const undo = el("button", "chat-live-btn is-ghost chat-live-picker-undo", "撤销上一次");
    undo.type = "button";
    undo.addEventListener("click", () => undoLook());
    card.append(head, grid, undo);
    picker.appendChild(card);
    picker.addEventListener("click", (event) => { if (event.target === picker) closeLookPicker(); });
    close.addEventListener("click", () => closeLookPicker());
    state.overlay.root.appendChild(picker);
    state.overlay.picker = picker;
  }

  async function toggleUndress() {
    if (!state.overlay || state.ended) return;
    const imageUrl = String(state.character?.undressImageUrl || "");
    if (!imageUrl) return;
    if (!lookChannelReady()) {
      appendLine("sys", "画面还在准备，请几秒后再试。");
      return;
    }
    const active = state.lookStack[state.lookStack.length - 1] === "undress";
    try {
      if (active) {
        await sendLookOperation({ remove: true });
        state.lookStack.pop();
        syncLookRail();
        appendLine("sys", "已恢复上一个画面。");
        return;
      }
      await sendLookOperation({
        undress: true,
        look: {
          id: "undress",
          kind: "garment",
          imageUrl,
          name: "Undress",
          userText: UNDRESS_LOOK_TEXT,
        },
      });
      state.lookStack.push("undress");
      syncLookRail();
      appendLine("sys", "已切换 Undress。");
    } catch (error) {
      if (state.ended) return;
      appendLine("sys", error.message || "画面切换失败，请再试一次。");
    }
  }

  async function open(characterId) {
    try { await loadConfig(true); } catch {}
    const requested = typeof characterId === "object" ? characterId : null;
    const character = characterById(requested?.id || characterId) || requested;
    if (!character) throw new Error("角色不存在。");
    if (!authToken()) throw new Error("请先登录再开始在线聊天。");
    state.character = character;
    state.ended = false;
    state.seqId = 1;
    state.remoteUserId = "";
    state.lastFrameAt = 0;
    state.lastPictureAt = 0;
    state.lastVideoTime = -1;
    state.seenPicture = false;
    state.seenBright = false;
    state.placeholderOn = true;
    state.videoFixes = 0;
    state.videoFixTotal = 0;
    state.reportedIssues = new Set();
    state.boundUserId = "";
    state.remoteBoundOnce = false;
    state.rtcRecoveries = 0;
    state.controlReady = false;
    state.lookBusy = false;
    state.lookStack = [];
    state.connId = `app-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    buildOverlay(character);
    state.overlay.lookRail?.querySelectorAll("[data-look-kind]").forEach((button) => {
      button.addEventListener("click", () => {
        const kind = button.dataset.lookKind || "";
        if (kind === "undress") {
          toggleUndress();
          return;
        }
        openLookPicker(kind);
      });
    });
    syncLookRail();
    const overlay = state.overlay;
    overlay.hangBtn.onclick = () => finishSession("user_end");
    overlay.closeBtn.onclick = async () => {
      overlay.closeBtn.disabled = true;
      try { await finishSession("user_end"); } finally { closeOverlay(); }
    };
    overlay.voiceBtn.onclick = async () => {
      if (state.ended) return;
      if ((state.session?.mode || "") === "component") {
        toggleComponentVoice();
        return;
      }
      const ok = await setMicPublished(!state.micOn);
      if (!ok) appendLine("sys", "麦克风没打开。请允许浏览器使用麦克风，或改用文字。");
    };
    async function sendUserText(text) {
      const value = String(text || "").trim();
      if (!value || state.ended) return;
      appendLine("user", value);
      if (state.session?.mode === "component") {
        overlay.sendBtn.disabled = true;
        try {
          const payload = await apiFetch(`/api/chat-live/sessions/${encodeURIComponent(state.session.id)}/say`, { method: "POST", body: JSON.stringify({ text: value }) });
          if (payload?.reply) appendLine("bot", payload.reply);
        } catch (error) {
          appendLine("sys", error.message || "数字人回复失败。");
        } finally {
          overlay.sendBtn.disabled = false;
        }
        return;
      }
      sendSignal(buildSignal(99, { text_msg: { msg_id: `c-${Date.now()}`, content: value, timestamp: Date.now() } }));
    }
    state.sendUserText = sendUserText;
    overlay.sendBtn.onclick = async () => {
      const text = overlay.input.value.trim();
      if (!text) return;
      overlay.input.value = "";
      await sendUserText(text);
    };
    overlay.input.addEventListener("keydown", (event) => {
      if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        overlay.sendBtn.click();
      }
    });
    overlay.muteBtn.onclick = async () => {
      const ok = await setMicPublished(!state.micOn);
      if (!ok) appendLine("sys", "麦克风没打开。请允许浏览器使用麦克风，或改用文字。");
    };

    let payload;
    try {
      payload = await apiFetch("/api/chat-live/sessions", { method: "POST", body: JSON.stringify({ characterId: character.id }) });
    } catch (error) {
      const message = error.message || "创建会话失败。";
      setStageStatus("创建失败", "error", message);
      appendLine("sys", message);
      overlay.sendBtn.disabled = true;
      return;
    }
    state.session = payload.session;
    if (payload.character) {
      state.character = {
        ...(state.character || {}),
        undressImageUrl: payload.character.undressImageUrl || "",
      };
    }
    syncLookRail();
    bindUnloadGuard();
    startTimer();
    startVideoWatch();
    try {
      if (payload.session.mode === "component") {
        /* 组件版：服务端负责 LLM/TTS/推流，浏览器只进我们自己的 RTC 频道 */
        await joinRtc(payload.session);
        appendLine("sys", "已进入在线聊天，直接说话或打字都可以。");
      } else {
        await Promise.all([connectSignaling(payload.session), joinRtc(payload.session)]);
        if (!state.ended) appendLine("sys", "已进入，可以直接说话，或在下面打字。");
      }
    } catch (error) {
      const message = String(error?.message || "接入实时音视频失败").replace(/\s+/g, " ").trim().slice(0, 160);
      setStageStatus("接入失败", "error", message || "接入实时音视频失败。");
      appendLine("sys", message || "接入实时音视频失败。");
      reportSessionIssue("join_failed", message || "接入实时音视频失败");
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
