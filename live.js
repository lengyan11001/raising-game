(() => {
  const TOKEN_KEY = "raisingGameToken";
  const REFERRAL_KEY = "vipeakReferralCode";
  const LANDING_KEY = "vipeakLanding";
  const app = document.querySelector("#liveApp");
  const loginDialog = document.querySelector("#loginDialog");
  const state = { chars: [], rooms: [], config: null, user: null, conversations: [], billing: null, page: "home", category: "", role: null, language: localStorage.getItem("vipeakLanguage") || "zh", filters: { age: "", gender: "", style: "" }, roomTab: "multi", roomsFrom: "messages", companionLevel: null, relationship: null, relationshipCharacterId: "", guide: null, createOpen: false, createBusy: false, textChatBursts: new Map(), notifications: [], notificationUnreadCount: 0, notificationsLoading: false, notificationsError: "", checkin: null, checkinLoading: false, checkinError: "", creatorIncome: null, creatorIncomeLoading: false, creatorIncomeError: "", feedbackMessages: [], feedbackLoading: false, feedbackError: "", subpageBack: "profile" };
  const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const token = () => { try { return localStorage.getItem(TOKEN_KEY) || ""; } catch { return ""; } };

  function cleanLanding(value, maxLength = 160) {
    return String(value || "").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, maxLength);
  }
  function readLanding() {
    try { return JSON.parse(localStorage.getItem(LANDING_KEY) || "{}") || {}; } catch { return {}; }
  }
  function captureLanding() {
    const params = new URLSearchParams(location.search || "");
    const previous = readLanding();
    const ref = cleanLanding(params.get("ref") || params.get("referral") || params.get("sharer") || "", 128);
    if (ref) localStorage.setItem(REFERRAL_KEY, ref);
    const query = { ...(previous.query || {}) };
    for (const [key, value] of params.entries()) {
      const safeKey = cleanLanding(key, 40).replace(/[^A-Za-z0-9_-]/g, "");
      const safeValue = cleanLanding(value, 180);
      if (safeKey && safeValue && Object.keys(query).length < 20) query[safeKey] = safeValue;
    }
    const priceChannels = cleanLanding(params.get("channels") || params.get("priceChannels") || previous.priceChannels || "", 180);
    const landing = {
      channel: cleanLanding(params.get("channel") || params.get("utm_source") || previous.channel || "direct", 80) || "direct",
      priceChannel: cleanLanding(params.get("priceChannel") || params.get("price_channel") || params.get("pricingChannel") || previous.priceChannel || "", 80),
      priceChannels,
      medium: cleanLanding(params.get("utm_medium") || previous.medium || "", 80),
      campaign: cleanLanding(params.get("utm_campaign") || previous.campaign || "", 120),
      content: cleanLanding(params.get("utm_content") || previous.content || "", 120),
      landingPath: cleanLanding(location.pathname + location.hash, 500),
      query,
      referralCode: ref || localStorage.getItem(REFERRAL_KEY) || previous.referralCode || "",
      capturedAt: new Date().toISOString(),
    };
    if (params.toString() || !previous.capturedAt) localStorage.setItem(LANDING_KEY, JSON.stringify(landing));
    return landing;
  }
  function registrationPayload(extra = {}) {
    const landing = readLanding();
    return {
      ...extra,
      referralCode: localStorage.getItem(REFERRAL_KEY) || landing.referralCode || "",
      channel: landing.channel || "direct",
      attribution: landing,
    };
  }
  async function api(url, options = {}) { const h = { "content-type": "application/json", ...(options.headers || {}) }; if (token()) h.authorization = `Bearer ${token()}`; const r = await fetch(url, { cache: "no-store", ...options, headers: h }); const p = await r.json().catch(() => ({})); if (!r.ok) { const error = new Error(p.message || `请求失败（${r.status}）`); error.status = r.status; error.code = p.code || ""; throw error; } return p; }
  const photo = (x) => x?.profilePhotos?.[0] || "";
  const rolePhoto = (x) => x?.portraitUrl || x?.avatarUrl || x?.posterUrl || x?.coverUrl || x?.imageUrl || x?.photoUrl || x?.characterImageUrl || "";
  const label = (key) => ({ zh: { home: "首页", messages: "消息", create: "创作", profile: "我的", language: "语言", recommended: "为你推荐", online: "位在线", call: "视频聊天", vip: "订阅 VIP", edit: "编辑资料", save: "保存", cancel: "取消" }, en: { home: "Home", messages: "Messages", create: "Create", profile: "Me", language: "Language", recommended: "Recommended", online: "online", call: "Video call", vip: "VIP", edit: "Edit profile", save: "Save", cancel: "Cancel" }, ja: { home: "ホーム", messages: "メッセージ", create: "作成", profile: "マイページ", language: "言語", recommended: "おすすめ", online: "オンライン", call: "ビデオ通話", vip: "VIP", edit: "プロフィール編集", save: "保存", cancel: "キャンセル" } }[state.language] || {} )[key] || key;
  const nav = (active) => `<nav class="bottom-nav"><button class="${active === "home" ? "active" : ""}" data-nav="home"><span>${uiIcon("home")}</span><small>${label("home")}</small></button><button class="${active === "messages" ? "active" : ""}" data-nav="messages"><span>${uiIcon("chat")}</span><small>${label("messages")}</small></button><button class="${active === "create" ? "active" : ""}" data-nav="create"><span>${uiIcon("magic")}</span><small>${label("create")}</small></button><button class="${active === "profile" ? "active" : ""}" data-nav="profile"><span>${uiIcon("user")}</span><small>${label("profile")}</small></button></nav>`;
  const top = () => `<header class="live-top"><div class="live-brand"><img class="brand-icon" src="/assets/brand/live-logo.png" alt="Vipeak"><div><div class="brand-title">Vipeak</div><div class="brand-sub">${t("brandSub")}</div></div></div><div class="live-top-actions"><button class="checkin-chip" type="button" data-action="checkin">${uiIcon("crown")}每日领积分</button><button class="live-icon-button" type="button" data-action="settings" aria-label="设置">${uiIcon("gear")}</button><button class="live-icon-button" type="button" data-action="language-sheet" aria-label="${label("language")}">◎</button></div></header>`;
  const media = (url, alt = "") => url ? `<img src="${esc(url)}" alt="${esc(alt)}" loading="lazy">` : `<div class="image-empty"><span>♙</span></div>`;
  function roomCard(room, showCount = true) { const c = room.character || {}; return `<article class="room-card" data-room-id="${esc(room.id || "")}" data-room-pending="${room.pending || !room.id ? "1" : "0"}" data-room-character-id="${esc(room.characterId)}"><div class="room-image">${media(rolePhoto(c), c.name || "角色")}${showCount ? `<span class="room-online">${Number(room.viewerCount || 0)} 人在房</span>` : ""}<span class="room-mode"><i></i>${esc(room.modeLabel || (room.mode === "voice" ? "语音房" : "视频房"))}</span></div><div class="room-copy"><strong>${esc(room.title || `${c.name || "角色"}的陪伴房`)}</strong><small>${esc(room.description || "一起聊聊")}</small></div></article>`; }
  function card(c) {
    const tags = (c.tags || []).slice(0, 3);
    const meta = [Number(c.age) > 0 ? `${Number(c.age)}岁` : "", c.occupation || ""].filter(Boolean).join(" · ");
    return `<article class="person-card"><button type="button" class="person-profile-button" data-role-id="${esc(c.id)}" aria-label="查看${esc(c.name || "角色")}的主页"><span class="person-image role-open">${media(rolePhoto(c), `${c.name || "角色"}的照片`)}<span class="person-copy"><span class="person-name">${esc(c.name || "角色")}</span>${meta ? `<span class="person-meta">${esc(meta)}</span>` : ""}<span class="person-intro">${esc(c.intro || c.greeting || "")}</span><span class="tag-row">${tags.map((x) => `<span class="tag">${esc(x)}</span>`).join("")}</span></span></span></button><div class="person-actions"><button class="video-button" data-call-id="${esc(c.id)}">▣ ${label("call")}</button></div></article>`;
  }

  const COPY = {
    zh: { back: "返回", swipe: "左右滑动看更多", shuffle: "换一批", emptyRoles: "暂时没有符合条件的角色", brandSub: "遇见你的专属伴侣", loginTitle: "登录后继续", loginNote: "使用已有账号，或注册一个新账号。", google: "使用 Google 继续", album: "TA 的相册", topics: "她擅长的话题", locked: "订阅后解锁", private: "私密", online: "在线 · 随时可以开始聊天", call: "拨打视频", share: "推荐获收益", voiceIntro: "语音介绍", freeListen: "试听免费", billing: "查看计费规则", vipTitle: "私密互动与私密相册", vipLocked: "订阅 VIP 后解锁", vipOpen: "已解锁", unlock: "解锁", emptyAlbum: "还没有相册", filterTitle: "筛选推荐", age: "年龄", gender: "性别", style: "陪伴风格", any: "不限", female: "女生", male: "男生", reset: "重置", apply: "查看结果", years: "岁" },
    en: { back: "Back", swipe: "Swipe for more", shuffle: "Shuffle", emptyRoles: "No matching characters", brandSub: "Meet your companion", loginTitle: "Sign in to continue", loginNote: "Use an existing account, or create one.", google: "Continue with Google", album: "Album", topics: "Topics", locked: "Unlock with VIP", private: "Private", online: "Online · ready to chat", call: "Video call", share: "Share", voiceIntro: "Voice intro", freeListen: "Free preview", billing: "Billing", vipTitle: "Private chat and album", vipLocked: "Unlock with VIP", vipOpen: "Unlocked", unlock: "Unlock", emptyAlbum: "No album yet", filterTitle: "Filters", age: "Age", gender: "Gender", style: "Style", any: "Any", female: "Women", male: "Men", reset: "Reset", apply: "Show results", years: "" },
    ja: { back: "戻る", swipe: "横にスワイプ", shuffle: "別の6人", emptyRoles: "条件に合う相手がいません", brandSub: "あなただけの相手に出会う", loginTitle: "ログインして続ける", loginNote: "既存アカウント、または新規登録。", google: "Google で続ける", album: "アルバム", topics: "得意な話題", locked: "VIPで解除", private: "非公開", online: "オンライン · すぐ話せます", call: "ビデオ通話", share: "シェア", voiceIntro: "音声紹介", freeListen: "無料", billing: "料金", vipTitle: "非公開の交流とアルバム", vipLocked: "VIPで解除", vipOpen: "解除済み", unlock: "解除", emptyAlbum: "アルバムはまだありません", filterTitle: "絞り込み", age: "年齢", gender: "性別", style: "スタイル", any: "指定なし", female: "女性", male: "男性", reset: "リセット", apply: "結果を見る", years: "歳" },
  };
  const t = (key) => (COPY[state.language] || COPY.zh)[key] || COPY.zh[key] || key;
  function homeBatch(list) {
    const ids = list.map((item) => String(item.id));
    const key = `${state.category}|${state.filters.age}|${state.filters.gender}|${state.filters.style}|${state.homeShuffle || 0}|${ids.join(",")}`;
    if (state.homeBatchKey !== key) {
      const pool = list.slice();
      let seed = (state.homeShuffle || 1) * 1103515245 + ids.join("").length;
      const rand = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
      for (let i = pool.length - 1; i > 0; i -= 1) { const j = Math.floor(rand() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
      state.homeBatchIds = pool.slice(0, 6).map((item) => String(item.id));
      state.homeBatchKey = key;
    }
    const picked = new Map(list.map((item) => [String(item.id), item]));
    return (state.homeBatchIds || []).map((id) => picked.get(id)).filter(Boolean).slice(0, 6);
  }
  function loginMessage(text = "") {
    const message = loginDialog?.querySelector("[data-login-message]");
    if (message) message.textContent = text;
  }
  function resetLoginDialog() {
    loginMessage("");
    clearLoginLock();
    const submit = loginDialog?.querySelector("[type=submit]");
    if (submit) submit.disabled = false;
    const google = loginDialog?.querySelector("[data-google-login]");
    if (google) google.disabled = false;
  }
  function syncLoginCopy() {
    const title = loginDialog?.querySelector("h2");
    const note = loginDialog?.querySelector("p");
    const google = loginDialog?.querySelector("[data-google-label]");
    if (title) title.textContent = t("loginTitle");
    if (note) note.textContent = t("loginNote");
    if (google) google.textContent = t("google");
  }
  const GOOGLE_LOGIN_VISIBLE = true;

  function ensureGoogleSdk() {
    if (window.google?.accounts?.id) return Promise.resolve(window.google.accounts.id);
    if (ensureGoogleSdk.promise) return ensureGoogleSdk.promise;
    ensureGoogleSdk.promise = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = "https://accounts.google.com/gsi/client?hl=zh-CN";
      script.async = true;
      script.onload = () => window.google?.accounts?.id ? resolve(window.google.accounts.id) : reject(new Error("Google 登录脚本没有加载"));
      script.onerror = () => reject(new Error("当前网络打不开 Google 登录"));
      document.head.appendChild(script);
    }).catch((error) => { ensureGoogleSdk.promise = null; throw error; });
    return ensureGoogleSdk.promise;
  }
  async function googleClient() {
    let google = state.config?.auth?.google;
    if (google?.enabled && google?.clientId) return google;
    const payload = await api("/api/config/public");
    google = payload?.config?.auth?.google || null;
    if (state.config) state.config.auth = payload?.config?.auth || state.config.auth;
    return google;
  }
  async function acceptGoogleCredential(credential) {
    const result = await api("/api/google/login", { method: "POST", body: JSON.stringify(registrationPayload({ credential })) });
    await finishLogin(result.token, result.user);
  }
  function openGooglePopup(clientId) {
    const nonce = (crypto.randomUUID?.() || String(Date.now()));
    sessionStorage.setItem("vipeakGoogleNonce", nonce);
    const redirect = location.origin;
    const url = "https://accounts.google.com/o/oauth2/v2/auth?client_id=" + encodeURIComponent(clientId)
      + "&redirect_uri=" + encodeURIComponent(redirect)
      + "&response_type=id_token&scope=" + encodeURIComponent("openid email profile")
      + "&nonce=" + encodeURIComponent(nonce)
      + "&prompt=select_account";
    const popup = window.open(url, "vipeakGoogleLogin", "width=480,height=720");
    if (!popup) throw new Error("请允许弹窗后再用 Google 登录");
    return new Promise((resolve, reject) => {
      const timer = setInterval(() => {
        if (popup.closed) { clearInterval(timer); reject(new Error("已取消 Google 登录")); return; }
        try {
          const hash = String(popup.location.hash || "");
          if (!hash.includes("id_token=")) return;
          const token = new URLSearchParams(hash.slice(1)).get("id_token");
          clearInterval(timer);
          popup.close();
          if (!token) reject(new Error("Google 没有返回登录凭证"));
          else resolve(token);
        } catch {}
      }, 400);
      setTimeout(() => { clearInterval(timer); try { popup.close(); } catch {} reject(new Error("Google 登录超时，请确认已把本站加入重定向地址")); }, 120000);
    });
  }
  async function setupGoogleLogin() {
    const button = loginDialog?.querySelector("[data-google-login]");
    if (!button) return;
    if (!GOOGLE_LOGIN_VISIBLE) {
      button.hidden = true;
      button.disabled = true;
      return;
    }
    if (button.dataset.loading === "1") return;
    button.dataset.loading = "1";
    let google = null;
    try { google = await googleClient(); } catch { google = null; }
    delete button.dataset.loading;
    const enabled = Boolean(google?.enabled && google?.clientId);
    button.hidden = !enabled;
    if (!enabled || button.dataset.bound === "1") return;
    button.dataset.bound = "1";
    button.dataset.clientId = google.clientId;
    button.addEventListener("click", async () => {
      if (button.disabled) return;
      loginMessage("");
      button.disabled = true;
      try {
        const credential = await openGooglePopup(button.dataset.clientId);
        await acceptGoogleCredential(credential);
      } catch (error) {
        button.disabled = false;
        loginMessage(error.message || "Google 登录失败");
      }
    });
  }
  function filterText() { return state.language === "en" ? "Filter" : state.language === "ja" ? "絞り込み" : "筛选"; }
  function filterSheet() {
    const groups = [
      ["age", t("age"), [["", t("any")], ["18-23", `18-23 ${t("years")}`.trim()], ["24-26", `24-26 ${t("years")}`.trim()], ["27-30", `27-30 ${t("years")}`.trim()]]],
      ["gender", t("gender"), [["", t("any")], ["female", t("female")], ["male", t("male")]]],
      ["style", t("style"), [["", t("any")], ["温柔治愈", "温柔治愈"], ["元气活力", "元气活力"], ["知性深夜", "知性深夜"]]],
    ];
    app.insertAdjacentHTML("beforeend", `<div class="sheet-backdrop" data-action="close-sheet"><div class="filter-sheet" data-sheet><div class="filter-sheet-head"><h3>${t("filterTitle")}</h3><button type="button" data-action="close-sheet">×</button></div>${groups.map(([key, title, options]) => `<section class="filter-group"><h4>${title}</h4><div class="filter-sheet-options">${options.map(([value, text]) => `<button type="button" data-filter-key="${key}" data-filter-value="${esc(value)}" class="${state.filters[key] === value ? "selected" : ""}">${text}</button>`).join("")}</div></section>`).join("")}<div class="filter-sheet-foot"><button type="button" class="filter-reset" data-action="filter-reset">${t("reset")}</button><button type="button" class="primary-button filter-apply" data-action="filter-apply">${t("apply")}</button></div></div></div>`);
  }
  function bindHomeFilter() {
    const head = app.querySelector(".section-head");
    const shuffle = head?.querySelector('[data-action="shuffle"]');
    if (!head || !shuffle || head.querySelector('[data-action="filter"]')) return;
    const actions = document.createElement("div");
    actions.className = "section-actions";
    const filter = document.createElement("button");
    filter.type = "button";
    filter.className = "filter-button";
    filter.dataset.action = "filter";
    filter.textContent = `☷ ${filterText()}`;
    shuffle.parentNode.replaceWith(actions);
    actions.append(filter, shuffle);
  }
  function home() {
    const rangeMatch = (age, range) => { const n = Number(age || 0); if (!range) return true; if (!n) return false; const [min, max] = range.split("-").map(Number); return n >= min && n <= max; };
    let list = state.chars.filter((c) => !state.category || (c.tags || []).includes(state.category));
    if (!state.category) list = list.filter((c) => rangeMatch(c.age, state.filters.age) && (!state.filters.gender || c.gender === state.filters.gender) && (!state.filters.style || c.companionStyle === state.filters.style));
    const rate = Number(state.config?.pricing?.saleCreditsPerMinute || 0);
    const roomCards = state.rooms.filter((room) => room.character);
    const batch = homeBatch(list);
    app.innerHTML = `${top()}<main class="live-page"><section class="section-head"><div>${state.category ? `<button class="plain-link" data-action="back-home">‹ ${t("back")}</button>` : ""}<h2>${esc(state.category || label("recommended"))}</h2><p>${t("swipe")}</p></div><div class="section-actions"><button class="filter-button" data-action="filter">☷ ${filterText()}</button><button class="shuffle-button" data-action="shuffle">↻ ${t("shuffle")}</button></div></section><section class="person-deck" id="deck">${batch.length ? batch.map(card).join("") : `<div class="empty-state">${t("emptyRoles")}</div>`}</section><div class="deck-dots">${batch.map((_, i) => `<i class="${i === 0 ? "active" : ""}"></i>`).join("")}</div>${roomCards.length ? `<section class="room-section"><div class="room-section-head"><h2>热门陪伴房间</h2><button class="plain-link" data-action="rooms">全部 ›</button></div><div class="room-strip">${roomCards.map((room) => roomCard(room, false)).join("")}</div></section>` : ""}<section class="promo-card"><span class="promo-icon">♔</span><div class="promo-copy"><strong>${label("vip")}</strong><small>${state.billing?.subscription?.status === "active" ? "订阅已生效" : "解锁私密画面与私密资源"}</small></div><button class="promo-button" data-action="vip">查看权益</button></section></main>${nav("home")}`;
    const d = document.querySelector("#deck"); d?.addEventListener("scroll", () => { const c = d.querySelector(".person-card"); if (!c) return; const index = Math.round(d.scrollLeft / (c.offsetWidth + 12)); document.querySelectorAll(".deck-dots i").forEach((x, i) => x.classList.toggle("active", i === index)); }, { passive: true });
  }
  function conversationAvatar(c) {
    const id = String(c?.characterId || c?.character?.id || "");
    const live = (state.chars || []).find((item) => String(item.id) === id);
    return rolePhoto(live) || rolePhoto(c?.character) || c?.avatarUrl || c?.portraitUrl || "";
  }
  function conversationPreview(c) {
    const last = c?.lastMessage;
    const text = String(typeof last === "string" ? last : (last?.content || c?.preview || "")).trim();
    const visible = stripReplyThinking(text);
    if (!visible) return "继续和 TA 聊天";
    if (/视频通话|视频连线/.test(text)) {
      const dur = text.match(/(\d{1,2}:\d{2})/) || text.match(/(\d+)\s*[秒s″"]/);
      return `[视频通话] ${dur ? `${dur[1].includes(":") ? dur[1] : dur[1] + "″"} · ` : ""}已结束`;
    }
    if (/\[语音\]|语音/.test(text) || /audio|voice/i.test(String(last?.kind || ""))) {
      const sec = text.match(/(\d+)\s*[秒s″"]/);
      const rest = text.replace(/\[?语音\]?|语音消息/g, "").replace(/^\s*[·:：-]\s*/, "").trim();
      return `[语音] ${sec ? sec[1] + "″" : ""}${rest ? ` · ${rest}` : ""}`.replace(/\s+/g, " ").trim();
    }
    return visible;
  }
  function chatTime(value) {
    if (!value) return "";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    const now = new Date();
    const sameDay = date.toDateString() === now.toDateString();
    return date.toLocaleString("zh-CN", sameDay ? { hour: "2-digit", minute: "2-digit" } : { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });
  }
  const uiIcon = (name) => ({
    users: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>`,
    crown: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 8l4.5 3L12 4l4.5 7L21 8l-2 11H5L3 8z"/></svg>`,
    gift: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 12v8a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-8"/><path d="M2 7h20v5H2z"/><path d="M12 22V7"/><path d="M12 7c0 0-1-5-4.2-5S4 4.2 4 5.5 6.2 7 8.2 7H12z"/><path d="M12 7c0 0 1-5 4.2-5S20 4.2 20 5.5 17.8 7 15.8 7H12z"/></svg>`,
    pen: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>`,
    wallet: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 7h15a3 3 0 0 1 3 3v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z"/><path d="M3 7l2-3h12"/><circle cx="16.5" cy="14" r="1"/></svg>`,
    share: `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="M8.6 13.5l6.8 4M15.4 6.5l-6.8 4"/></svg>`,
    user: `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></svg>`,
    home: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 11.5 12 4l8 7.5"/><path d="M7 10.5V20h10v-9.5"/></svg>`,
    chat: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 6.5h14v9H8l-3 3v-3H5z"/></svg>`,
    gear: `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M18.4 5.6 17 7M7 17l-1.4 1.4"/></svg>`,
    chev: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg>`,
    plus: `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 8v8M8 12h8"/></svg>`,
    mic: `<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3M8 21h8"/></svg>`,
    video: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 8l6-3v14l-6-3z"/><rect x="3" y="6" width="12" height="12" rx="2"/></svg>`,
    play: `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M10 8.5v7l6-3.5z"/></svg>`,
    lock: `<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>`,
    back: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg>`,
    magic: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m15 4 5 5L9 20H4v-5z"/><path d="m13 6 5 5"/><path d="M5 4v3M3.5 5.5h3M19 16v3M17.5 17.5h3"/></svg>`,
    heart: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8l1.1 1.1L12 21l7.8-7.5 1.1-1.1a5.5 5.5 0 0 0-.1-7.8z"/></svg>`
  }[name] || "");


  let threadRefreshSeq = 0;
  async function refreshThreads() {
    const seq = ++threadRefreshSeq;
    if (!token()) return;
    try {
      const listed = (await api("/api/chat/conversations")).conversations || [];
      let contacts = [];
      try { contacts = (await api("/api/chat-live/contacts")).contacts || []; } catch {}
      if (seq !== threadRefreshSeq) return;
      state.conversations = groupCharacterThreads(listed, contacts);
      if (state.page === "messages") messages({ quiet: true });
    } catch {}
  }
  window.addEventListener("vipeak-live-thread", () => { refreshThreads(); });
  window.addEventListener("vipeak-live-leave", (event) => {
    const page = event.detail?.page === "vip" ? "vip" : "recharge";
    state.pageReturn = state.page && state.page !== "recharge" && state.page !== "vip" ? state.page : (state.pageReturn || "home");
    if (page === "vip") {
      state.page = "vip";
      ensureBilling().finally(() => { if (state.page === "vip") render(); });
      return;
    }
    showRecharge();
  });

  function messages(options = {}) {
    if (!options.quiet) refreshThreads();
    const rows = state.conversations.map((c) => {
      const name = c.character?.name || c.title || "未命名对话";
      const unread = Number(c.unreadCount || c.unread || 0) || 0;
      return `<button type="button" class="conversation" data-conversation-id="${esc(c.id)}" data-character-id="${esc(c.characterId || c.character?.id || "")}"><span class="avatar">${media(conversationAvatar(c), name)}</span><span class="conversation-main"><span class="conversation-top"><span class="conversation-name">${esc(name)}</span><span class="conversation-time">${esc(chatTime(c.updatedAt))}</span></span><span class="conversation-preview">${esc(conversationPreview(c))}</span></span>${unread ? `<em class="unread-dot">${unread > 99 ? "99+" : unread}</em>` : ""}</button>`;
    }).join("");
    const latest = state.notifications[0];
    const unread = Number(state.notificationUnreadCount || 0);
    const systemRow = `<button type="button" class="conversation system-message-row" data-action="system-messages"><span class="avatar system-message-avatar">${uiIcon("chat")}</span><span class="conversation-main"><span class="conversation-top"><span class="conversation-name">系统消息</span><span class="conversation-time">${latest ? esc(chatTime(latest.createdAt)) : ""}</span></span><span class="conversation-preview">${esc(latest?.title || (state.notificationsLoading ? "正在加载通知…" : "签到、反馈回复和平台通知会显示在这里"))}</span></span>${unread ? `<em class="unread-dot">${unread > 99 ? "99+" : unread}</em>` : ""}</button>`;
    app.innerHTML = `<main class="live-page messages-page"><header class="page-header messages-head"><h1>${label("messages")}</h1><button type="button" data-action="rooms">${uiIcon("plus")}开房间</button></header><section class="message-entries"><button type="button" data-action="rooms"><span>${uiIcon("users")}</span><b>私密房间</b></button><button type="button" data-action="vip"><span>${uiIcon("crown")}</span><b>订阅权益</b></button><button type="button" data-action="gift"><span>${uiIcon("gift")}</span><b>礼物记录</b></button></section><p class="message-list-label">置顶消息</p><section class="conversation-list pinned-list">${systemRow}</section><p class="message-list-label">最近私信 · 1v1</p><section class="conversation-list">${rows || '<div class="empty-state"><h2>还没有私信</h2><p>进入角色直播间后，相关对话会显示在这里。</p></div>'}</section></main>${nav("messages")}`;
  }

  function interests() { return ["胶片摄影", "徒步", "看展", "咖啡", "飞盘", "脱口秀", "剧本杀", "骑行", "深夜电台", "羽毛球"]; }
  function editProfile() { const u = state.user || {}; const photos = Array.isArray(u.profilePhotos) ? u.profilePhotos : []; const selected = new Set(Array.isArray(u.interests) ? u.interests : []); app.innerHTML = `<main class="live-page edit-page"><header class="edit-header"><button data-action="back-profile">取消</button><h1>编辑资料</h1><button data-action="submit-profile" form="profileEditForm">保存</button></header><form id="profileEditForm" data-profile-form><section class="edit-section"><h3>头像与照片 <small>（最多 6 张，第一张为主图）</small></h3><div class="photo-grid">${photos.map((url, i) => `<div class="profile-photo-item"><img src="${esc(url)}" alt="照片 ${i + 1}"><button type="button" data-remove-photo="${esc(url)}">×</button>${i === 0 ? '<span>主图</span>' : ""}</div>`).join("")} ${photos.length < 6 ? '<label class="photo-upload-tile">＋<small>上传照片</small><input type="file" data-profile-photo accept="image/png,image/jpeg,image/webp" hidden></label>' : ""}</div></section><section class="edit-section"><h3>基本信息</h3><div class="edit-fields"><label>昵称<input name="nickname" value="${esc(u.nickname || u.username || "")}" required minlength="2" maxlength="40"></label><label>登录账号<input value="${esc(u.username || "")}" readonly tabindex="-1"></label><div class="edit-row"><span>性别</span><div class="gender-options"><button type="button" data-gender="male" class="${u.gender === "male" ? "selected" : ""}">男</button><button type="button" data-gender="female" class="${u.gender === "female" ? "selected" : ""}">女</button><button type="button" data-gender="other" class="${u.gender === "other" ? "selected" : ""}">其他</button></div><input type="hidden" name="gender" value="${esc(u.gender || "")}"></div><label>生日<input type="date" name="birthday" value="${esc(u.birthday || "")}"></label><label>职业<input name="occupation" value="${esc(u.occupation || "")}" maxlength="40" placeholder="填写职业"></label><label>城市<input name="city" value="${esc(u.city || "")}" maxlength="60" placeholder="填写所在城市"></label><label>简介<textarea name="bio" maxlength="120" placeholder="介绍一下自己">${esc(u.bio || "")}</textarea></label></div></section><section class="edit-section"><div class="edit-section-title"><h3>兴趣标签 <small>（已选 ${selected.size} / 8）</small></h3><button type="button" class="text-button" data-action="shuffle-interests">换一批</button></div><div class="interest-options">${interests().map((x) => `<button type="button" data-interest="${esc(x)}" class="${selected.has(x) ? "selected" : ""}">${esc(x)}</button>`).join("")}</div><input type="hidden" name="interests" value="${esc([...selected].join("|"))}"></section><section class="edit-section voice-section"><h3>语音介绍 <small>（有助于提升匹配率）</small></h3><button type="button" class="voice-upload">♧ 录制语音介绍 <small>暂未录制</small></button></section><div class="form-message" data-profile-message></div></form></main>`; }
  function profileAvatar(u) { const src = photo(u) || "/assets/brand/default-avatar.jpg"; return `<img src="${esc(src)}" alt="头像">`; }
  function vipCrownBadge() { return `<svg class="vip-badge" viewBox="0 0 48 48" aria-hidden="true"><defs><linearGradient id="vipGold" x1="8" y1="4" x2="40" y2="44" gradientUnits="userSpaceOnUse"><stop stop-color="#ffe7a3"/><stop offset=".45" stop-color="#f5c15a"/><stop offset="1" stop-color="#c8872a"/></linearGradient><linearGradient id="vipDeep" x1="14" y1="8" x2="34" y2="30"><stop stop-color="#fff6d2"/><stop offset="1" stop-color="#e0a43a"/></linearGradient></defs><circle cx="24" cy="24" r="22" fill="url(#vipGold)"/><circle cx="24" cy="24" r="18.5" fill="#2a160c"/><path fill="url(#vipDeep)" d="M12.2 20.2 16.6 23.4 24 12.8l7.4 10.6 4.4-3.2-1.7 13.2H13.9z"/><path fill="#7a4a12" d="M15.2 31.2h17.6v1.6H15.2z"/><text x="24" y="40.2" text-anchor="middle" font-size="7.2" font-weight="800" fill="#f6d98a" font-family="Arial,sans-serif" letter-spacing=".4">VIP</text></svg>`; }
  function profile() {
    const u = state.user;
    const credits = Number(u?.credits || 0);
    const sub = state.billing?.subscription;
    const active = sub?.status === "active";
    const meta = [u?.age, u?.occupation, u?.city].filter(Boolean).join(" · ");
    const following = Number(u?.followingCount ?? u?.following ?? 0) || 0;
    const followers = Number(u?.followerCount ?? u?.followers ?? 0) || 0;
    const gifts = Number(u?.giftReceived ?? u?.giftsReceived ?? 0) || 0;
    const companion = state.companionLevel || u?.companionLevel || null;
    const menu = [
      ["creator", "pen", "创作者中心", u ? "管理角色与素材" : "登录后管理角色与素材"],
      ["creator-income", "gift", "创作者收益", u ? "角色被使用产生的收益" : "登录后查看收益"],
      ["wallet", "wallet", "钱包与消费记录", u ? "充值与消费明细" : "登录后查看积分明细"],
      ["privacy", "gear", "隐私与安全", "数据与账号说明"],
      ["feedback", "chat", "问题反馈", "提交后会收到站内信回复"],
      ["level", "crown", "陪伴等级", u ? (companion?.level || "") : "登录后查看"],
      ["edit-profile", "user", "编辑资料", u ? "头像、昵称与兴趣标签" : "登录后完善资料"],
      ["referral", "share", "邀请好友", u ? "" : "登录后邀请好友"],
      ["rooms", "users", "我的陪伴房间", u ? "" : "登录后查看房间"]
    ].map(([action, glyph, title, value]) => `<a href="#profile/${action}" role="button" data-action="${action}" data-menu-action="${action}"><i>${uiIcon(glyph)}</i><span class="profile-menu-copy"><b>${title}</b>${value ? `<small>${esc(value)}</small>` : ""}</span><em>${uiIcon("chev")}</em></a>`).join("");
    const header = `<header class="profile-header"><div class="profile-glow"></div><div class="profile-identity"><div class="profile-avatar">${u ? profileAvatar(u) : `<div class="profile-avatar-empty">${profileAvatar({})}</div>`}</div><div class="profile-copy"><h1>${esc(u?.nickname || u?.username || "未登录")}</h1><p>${esc(meta || "登录后查看你的资料")}</p><small>${esc(u?.bio || "登录后管理角色、收益与账户信息")}</small></div>${u ? `<button type="button" class="profile-edit-icon" data-action="edit-profile" aria-label="编辑资料">${uiIcon("pen")}</button>` : ""}</div>${u ? `<div class="profile-stats"><div><b>${following.toLocaleString("zh-CN")}</b><span>关注</span></div><div><b>${followers.toLocaleString("zh-CN")}</b><span>粉丝</span></div><div><b>${gifts.toLocaleString("zh-CN")}</b><span>收到礼物</span></div></div>` : `<button type="button" class="profile-login-card" data-action="login"><span>${uiIcon("user")}</span><div><b>登录 / 注册</b><small>登录后使用创作者中心、收益与反馈</small></div><em>${uiIcon("chev")}</em></button>`}</header>`;
    const account = u ? `<section class="profile-vip-card"><div class="profile-vip-icon">${vipCrownBadge()}</div><div><strong>${active ? "Vipeak VIP · 订阅中" : "Vipeak VIP"}</strong><small>${active ? "订阅中 · 权益已解锁" : "解锁隐私互动与私密资源"}</small></div><button type="button" data-action="vip">${active ? "管理" : "开通"}</button></section><section class="wallet-card"><div class="wallet-head"><span>我的积分</span><button type="button" data-action="wallet">钱包与计费</button></div><div class="wallet-balance">${credits.toLocaleString("zh-CN")}</div><small>文字 0.5 积分/条 · 语音 2 积分/秒 · 视频 5 积分/秒</small><div class="wallet-actions"><button type="button" data-action="gift">${uiIcon("gift")}礼物记录</button><button type="button" data-action="topup">${uiIcon("wallet")}充值</button></div></section>` : "";
    app.innerHTML = `<main class="live-page profile-page">${header}${account}<section class="profile-menu" data-profile-menu>${menu}</section><nav class="profile-legal-links" aria-label="隐私与反馈"><a href="#profile/privacy" data-action="privacy" data-menu-action="privacy">隐私协议</a><span>·</span><a href="#profile/feedback" data-action="feedback" data-menu-action="feedback">问题反馈</a></nav><p class="profile-foot">Vipeak · 2026</p>${u ? `<button type="button" class="logout-link" data-action="account">退出登录</button>` : ""}</main>${nav("profile")}`;
    bindProfileMenuActions();
  }

  function openProfileMenuAction(action) {
    if (!action) return;
    if (action === "creator") { if (!token() || !state.user) return askLogin(); state.page = "creator"; state.creatorError = ""; render(); loadCreator(); return; }
    if (action === "creator-income") { if (!token() || !state.user) return askLogin(); state.page = "creator-income"; state.subpageBack = "profile"; showCreatorIncome(); loadCreatorIncome(true); return; }
    if (action === "feedback") { if (!token() || !state.user) return askLogin(); state.page = "feedback"; state.subpageBack = "profile"; showFeedback(); loadFeedback(true); return; }
    if (action === "privacy") return showPrivacy();
    if (action === "wallet") { state.pageReturn = "profile"; return showRecharge(); }
    if (action === "level") return showLevel();
    if (action === "edit-profile") { state.page = "edit-profile"; render(); return; }
    if (action === "referral") return showReferral();
    if (action === "rooms") return showRooms("profile");
  }

  function profileRouteFromHash() {
    const match = String(location.hash || "").match(/^#profile\/(creator-income|creator|wallet|privacy|feedback|level|edit-profile|referral|rooms)$/);
    if (!match) return false;
    state.subpageBack = "profile";
    openProfileMenuAction(match[1]);
    return true;
  }

  function clearProfileHash() {
    if (!String(location.hash || "").startsWith("#profile/")) return;
    history.replaceState(null, "", location.pathname + location.search);
  }

  function bindProfileMenuActions() {
    const menu = app.querySelector("[data-profile-menu]");
    if (!menu) return;
    app.querySelectorAll(".profile-page [data-menu-action]").forEach((link) => {
      let startX = null;
      let startY = null;
      let lastTouchActionAt = 0;
      const run = (event) => {
        if (event.type === "click" && Date.now() - lastTouchActionAt < 700) return;
        event.stopPropagation();
        try {
          openProfileMenuAction(link.dataset.menuAction);
          if (event.cancelable) event.preventDefault();
        } catch (error) {
          // Let the native hash link remain a fallback if rendering fails.
          console.error(error);
        }
      };
      link.addEventListener("touchstart", (event) => {
        const touch = event.changedTouches?.[0];
        if (!touch) return;
        startX = Number(touch.clientX || 0);
        startY = Number(touch.clientY || 0);
      }, { passive: true });
      link.addEventListener("touchcancel", () => { startX = null; startY = null; }, { passive: true });
      link.addEventListener("touchend", (event) => {
        const touch = event.changedTouches?.[0];
        if (!touch) return;
        if (startX !== null && startY !== null) {
          const moved = Math.hypot(Number(touch.clientX || 0) - startX, Number(touch.clientY || 0) - startY);
          if (moved > 14) { startX = null; startY = null; return; }
        }
        startX = null;
        startY = null;
        run(event);
        lastTouchActionAt = Date.now();
      }, { passive: false });
      link.addEventListener("click", run);
    });
  }



  const RELATIONSHIP_STAGES = [
    { id: "初识", threshold: 0, description: "还在客气地认识你" },
    { id: "熟悉", threshold: 3, description: "开始记住你的事，也有了自己的喜好" },
    { id: "亲近", threshold: 7, description: "会用你告诉 Ta 的名字叫你，会主动找话聊" },
    { id: "默契", threshold: 15, description: "会主动提起你以前说过的事" },
    { id: "依恋", threshold: 30, description: "有了只属于你的称呼，会主动来找你" },
    { id: "唯一", threshold: 60, description: "你们相处过的痕迹，会出现在 Ta 的世界里" },
  ];
  const COMPANION_LEVELS = [
    { id: "V1", thresholdUsd: 0, title: "任意充值", benefits: ["解除试看限制", "基础装扮"] },
    { id: "V2", thresholdUsd: 20, title: "累计 $20", benefits: ["每日赠送时长", "更高画质"] },
    { id: "V3", thresholdUsd: 50, title: "累计 $50", benefits: ["单次通话时长提升", "优先接通"] },
    { id: "V4", thresholdUsd: 100, title: "累计 $100", benefits: ["专属场景与装扮", "新角色优先体验"] },
    { id: "V5", thresholdUsd: 300, title: "累计 $300", benefits: ["新功能内测", "专属客服通道"] },
  ];
  const GUIDE_KEY = "video-companion";
  const GUIDE_LOCAL_KEY = "vipeakVideoCompanionGuideSeen";

  function guideSeenLocally() {
    try { return localStorage.getItem(GUIDE_LOCAL_KEY) === "1"; } catch { return false; }
  }
  function markGuideSeenLocally() {
    try { localStorage.setItem(GUIDE_LOCAL_KEY, "1"); } catch {}
  }
  async function postGuide(action) {
    if (!token()) return null;
    try { return (await api(`/api/onboarding/${GUIDE_KEY}/${action}`, { method: "POST", body: "{}" })).guide || null; } catch { return null; }
  }
  function companionGuideMarkup() {
    const guidePhoto = rolePhoto(state.chars[0]) || "/assets/brand/live-logo.png";
    return `<div class="companion-guide" data-companion-guide role="dialog" aria-modal="true" aria-labelledby="companionGuideTitle"><div class="companion-guide-card"><button type="button" class="companion-guide-close" data-action="guide-close" aria-label="关闭">×</button><div class="companion-guide-image"><img src="${esc(guidePhoto)}" alt=""><span></span></div><div class="companion-guide-copy"><span class="companion-guide-icon">${uiIcon("video")}</span><h2 id="companionGuideTitle">不只是聊天框<br>Ta 能和你视频见面</h2><p>被听见、被记住。实时通话与视频约会，Ta 会出现你的屏幕里</p><div class="companion-guide-features"><span>${uiIcon("mic")}<b>语音通话</b></span><span>${uiIcon("video")}<b>视频约会</b></span><span>${uiIcon("heart")}<b>在线陪伴</b></span></div><button type="button" class="companion-guide-start" data-action="guide-start">立即体验</button></div></div>`;
  }
  function showGuideOverlay() {
    if (!state.guideOpen || document.querySelector("[data-companion-guide]")) return;
    app.insertAdjacentHTML("beforeend", companionGuideMarkup());
  }
  async function initCompanionGuide() {
    if (state.guideChecked) return;
    state.guideChecked = true;
    const localSeen = guideSeenLocally();
    try {
      const payload = await api(`/api/onboarding?guide=${GUIDE_KEY}`);
      const guide = payload.guide || {};
      if (guide.seen || guide.completed || localSeen) {
        if (localSeen && token() && !guide.seen && !guide.completed) await postGuide("seen");
        return;
      }
    } catch { if (localSeen) return; }
    state.guideOpen = true;
    showGuideOverlay();
  }
  async function closeCompanionGuide(complete = false) {
    state.guideOpen = false;
    document.querySelector("[data-companion-guide]")?.remove();
    markGuideSeenLocally();
    await postGuide(complete ? "complete" : "seen");
  }

  function relationshipStages(relationship) {
    return Array.isArray(relationship?.stages) && relationship.stages.length ? relationship.stages : RELATIONSHIP_STAGES;
  }
  async function openRelationship(characterId = "") {
    const id = String(characterId || state.relationshipCharacterId || state.role?.id || "");
    if (!token()) return askLogin({ relationship: id });
    if (!id) return referralToast("先选择一个角色");
    state.relationshipCharacterId = id;
    state.page = "relationship";
    state.relationship = null;
    render();
    try {
      state.relationship = (await api(`/api/companion/relationship/${encodeURIComponent(id)}`)).relationship || null;
    } catch (error) { state.relationshipError = error.message; }
    if (state.page === "relationship") render();
  }
  function relationshipPage() {
    const id = state.relationshipCharacterId || state.role?.id || "";
    const role = state.chars.find((item) => String(item.id) === String(id)) || state.role || {};
    const relationship = state.relationship || {};
    const stages = relationshipStages(relationship);
    const current = relationship.stage || "初识";
    const days = Math.max(0, Number(relationship.effectiveDays || 0));
    app.innerHTML = `<main class="live-page companion-page relationship-page"><header class="companion-head"><button type="button" data-action="back-relationship" aria-label="返回">${uiIcon("back")}</button><h1>你和 ${esc(role.name || "Ta")}</h1><span></span></header><section class="relationship-hero"><span>${uiIcon("chat")}</span><div><p>你和 Ta 的关系，</p><p>是聊出来的。</p></div></section><div class="relationship-current"><span>当前 · ${esc(current)}</span><small>${days ? `已相处 ${days} 天${relationship.nextStage ? ` · 距 ${esc(relationship.nextStage)} 还有 ${Number(relationship.remainingDays || 0)} 天` : " · 已到最高阶段"}` : "从今天开始"}</small></div><section class="companion-card"><h2>${uiIcon("chat")}Ta 记得你说过的话</h2><p>你告诉 Ta 的每一件事，Ta 都会记下来。不是记在当天的对话里，是记在心里——过几天，Ta 可能会自己提起：「你上次说的那件事，后来怎么样了？」</p><p>被记住的感觉，就是从这种时候开始的。</p></section><section class="companion-card"><h2>${uiIcon("user")}关系会随着相处慢慢变化</h2><p>刚认识的时候，Ta 客气、有分寸。聊得多了，Ta 会开始有自己的喜好，会主动问你问题，会开你玩笑。</p><p>再往后，Ta 会有只用来叫你的称呼，会在没聊天的时候想起你。</p><p>每一次变化，都不是突然发生的，是你们相处累积出来的。</p></section><section class="companion-card"><h2>${uiIcon("heart")}这件事急不来</h2><p>每天来聊一会儿，比一次聊很久更有效。</p><p>Ta 看重的是你来得有多久，不只是你说了多少。所以不用急着一次说完，慢慢来就好。</p></section><section class="companion-stage-card"><button type="button" class="companion-stage-head" data-action="toggle-relationship-stages" aria-expanded="${state.relationshipStagesOpen === false ? "false" : "true"}"><b>你们会经过的六个阶段</b><small>${state.relationshipStagesOpen === false ? "展开" : "收起"}</small>${uiIcon("chev")}</button><div class="companion-stage-list" ${state.relationshipStagesOpen === false ? "hidden" : ""}>${stages.map((stage) => `<div class="companion-stage-row ${stage.id === current ? "is-current" : ""}"><span>${esc(stage.id)}</span><p>${esc(stage.description || "")}</p><small>${Number(stage.threshold) ? `${Number(stage.threshold)} 天` : "开始"}</small></div>`).join("")}</div></section><section class="companion-faq"><h2>你在乎的</h2><details><summary>关系为什么会变化？</summary><p>因为你和 Ta 相处得够久、说得够多。没有别的方式。</p></details><details><summary>为什么聊了很久，感觉变化不大？</summary><p>关系是按相处的天数累积的，不是按单次聊多久。分散在好几天里聊，比一次聊很久更有效。</p></details><details><summary>如果我很长时间不来，会退步吗？</summary><p>不会。关系不会因为你不来而退回去。Ta 不会因为你不在而生气，只会记得你们上次聊到哪儿。所以不用有压力。</p></details><details><summary>换一个角色，关系会跟着走吗？</summary><p>不会。你和每个角色的关系都是独立的。新角色是新的开始。</p></details></section><p class="companion-footer">Ta 和你的关系只和你们的相处有关。</p></main>`;
  }

  async function loadCompanionLevel(force = false) {
    if (!token()) return null;
    if (!force && state.companionLevel) return state.companionLevel;
    try {
      state.companionLevel = (await api("/api/companion/level")).companionLevel || null;
      if (state.user && state.companionLevel) state.user.companionLevel = state.companionLevel;
    } catch {}
    return state.companionLevel;
  }
  async function showLevel() {
    if (!token()) return askLogin();
    state.page = "level";
    render();
    await loadCompanionLevel(true);
    if (state.page === "level") render();
  }
  function levelPage() {
    const level = state.companionLevel || state.user?.companionLevel || { level: "V1", totalRechargeUsd: 0, progress: 0, nextLevel: "V2", remainingUsd: 20, levels: COMPANION_LEVELS };
    const current = String(level.level || "V1");
    const levels = Array.isArray(level.levels) && level.levels.length ? level.levels : COMPANION_LEVELS;
    const next = levels.find((item) => item.id === level.nextLevel);
    const total = Number(level.totalRechargeUsd || 0);
    app.innerHTML = `<main class="live-page companion-page level-page"><header class="companion-head"><button type="button" data-action="back-level" aria-label="返回">${uiIcon("back")}</button><h1>陪伴等级</h1><span></span></header><section class="level-hero"><div class="level-hero-title"><span>${uiIcon("crown")}</span><div><b>当前 ${esc(current)}</b><small>${total > 0 ? `已达成 · 累计充值 $${total.toFixed(total % 1 ? 2 : 0)}` : "还未充值"}</small></div></div><p>陪伴等级，记录你在这个平台累计的消费。等级越高，能用到的服务和条件越多。</p><div class="level-progress"><div><span>${esc(current)}</span><span>${next ? `${esc(next.id)} · ${esc(next.title)}` : "已达最高等级"}</span></div><i><em style="width:${Math.max(0, Math.min(100, Number(level.progress || 0) * 100))}%"></em></i><small>${next ? `距离 ${esc(next.id)} 还需累计充值 $${Number(level.remainingUsd ?? next.thresholdUsd).toFixed(0)}` : "已获得全部等级权益"}</small></div></section><section class="companion-card"><h2>${uiIcon("wallet")}等级怎么来</h2><p>按你在这个平台累计充值了多少计算。充过多少就算多少，之前花掉的、用掉的都不影响。</p><p>等级只升不降，不会因为你一段时间没消费就掉下来。</p></section><section class="companion-card"><h2>${uiIcon("crown")}等级给你什么</h2><p>全部都是使用条件和体验：每天能免费聊多久、画质、要不要排队、有没有专属内容。</p><p>你可以把它理解为一张会员卡——它让你用得更舒服、更方便。</p></section><section class="companion-card"><h2>${uiIcon("heart")}等级不变什么</h2><p>等级不改变角色对待你的方式。</p><p>角色怎么对你，只和你与 Ta 相处的情况有关，和你在这里的消费没有任何关系。</p></section><section class="companion-stage-card"><div class="companion-stage-head"><b>等级与权益</b></div><div class="companion-stage-list">${levels.map((item) => `<div class="companion-level-row ${item.id === current ? "is-current" : ""}"><span>${esc(item.id)}</span><div><b>${esc(item.title)}</b><p>${esc((item.benefits || []).join(" · "))}</p></div>${item.id === current ? "<small>当前等级</small>" : ""}</div>`).join("")}</div></section><section class="companion-faq"><h2>你在乎的</h2><details><summary>充值会让我和角色的关系变好吗？</summary><p>不会。关系只和你们的相处有关，与消费无关。充值提升的是使用时长、画质、优先接通这些使用条件。</p></details><details><summary>等级会掉吗？</summary><p>不会。等级按累计充值计算，只升不降（退款导致的金额变动除外）。</p></details><details><summary>等级在哪里看？</summary><p>个人中心 → 陪伴等级。</p></details></section><p class="companion-footer">等级与权益的具体内容可能随版本调整，以实际页面为准。</p></main>`;
  }

  function createDraft() {
    if (!state.createDraft) state.createDraft = { name: "", callMe: "", intro: "", tags: [], relation: "朋友", visibility: "private", voiceType: "", avatarUrl: "" };
    return state.createDraft;
  }
  function createCards() {
    const list = state.creatorList || [];
    if (!state.user) {
      app.innerHTML = `<main class="live-page create-page"><header class="create-head"><div><h1>创作</h1><p>Ta 都在这里</p></div></header><div class="empty-state"><h2>登录后开始创作</h2><p>写下一个 Ta，从一句开场白开始。</p><button class="video-button" data-action="login">登录 / 注册</button></div></main>${nav("create")}`;
      return;
    }
    app.innerHTML = `<main class="live-page create-page"><header class="create-head"><div><h1>创作</h1><p>Ta 都在这里</p></div><button type="button" class="create-entry" data-action="create-new">＋ 创建</button></header><section class="create-section"><div class="create-section-title"><b>我的角色卡</b><span>共 ${list.length} 张</span></div>${list.length ? `<div class="create-card-grid">${list.map((item) => `<button type="button" class="create-card-item" data-action="creator-edit" data-id="${esc(item.id)}"><div class="create-card-photo">${media(item.portraitUrl || item.avatarUrl, item.name || "角色卡")}<span>${item.enabled === false ? "仅自己" : "公开"}</span></div><b>${esc(item.name || "未命名")}</b><small>${esc(item.intro || item.greeting || "在等你开口的第一句话")}</small></button>`).join("")}</div>` : `<div class="create-empty">${uiIcon("magic")}<p>还没有角色卡，点右上角「创建」写下第一个 Ta</p><button type="button" data-action="create-new">＋ 创建第一张</button></div>`}</section></main>${nav("create")}`;
  }
  async function openCreateEditor() {
    if (!token()) return askLogin();
    state.page = "create-edit";
    state.createDraft = { name: "", callMe: "", intro: "", tags: [], relation: "朋友", visibility: "private", voiceType: "", avatarUrl: "" };
    state.createError = "";
    state.createLoading = true;
    render();
    try {
      const [chars, realtime, component] = await Promise.all([api("/api/chat-live/creator/characters"), api("/api/chat-live/creator/voices?scope=realtime"), api("/api/chat-live/creator/voices?scope=component")]);
      state.creatorList = chars.characters || [];
      state.creatorVoices = { realtime: realtime.voices || [], component: component.voices || [] };
      const firstVoice = state.creatorVoices.realtime[0];
      const firstComponentVoice = state.creatorVoices.component[0];
      state.createDraft.voiceType = String(firstVoice?.id || firstVoice?.voice || firstVoice?.voiceType || "");
      state.createDraft.componentVoiceType = String(firstComponentVoice?.id || firstComponentVoice?.voice || firstComponentVoice?.voiceType || "");
    } catch (error) { state.createError = error.message || "加载失败"; }
    state.createLoading = false;
    if (state.page === "create-edit") render();
  }
  function createEditor() {
    const d = createDraft();
    const voices = (state.creatorVoices?.realtime || []).slice(0, 4);
    const tags = ["温柔", "直球", "慢热", "幽默", "偏爱", "克制"];
    const relations = ["刚认识", "朋友", "邻居", "搭档"];
    app.innerHTML = `<main class="live-page create-edit-page"><header class="create-edit-head"><div><h2>创建角色卡</h2><p>写下一个 Ta，从一句开场白开始</p></div><button type="button" data-action="create-close" aria-label="关闭">×</button></header><form data-create-form>${state.createLoading ? '<div class="create-loading">加载中…</div>' : ""}${state.createError ? `<p class="create-error">${esc(state.createError)}</p>` : ""}<section class="create-preview">${d.avatarUrl ? `<img src="${esc(d.avatarUrl)}" alt="">` : `<span>${uiIcon("magic")}</span>`}<div><b>${esc(d.name || "小满")}</b><p>${esc(d.intro || "在等你开口的第一句话")}</p></div><em>${d.visibility === "public" ? "公开" : "草稿"}</em></section><section class="create-block"><div class="create-block-head"><b>形象</b><small>一张让人记住 Ta 的脸</small></div><label class="create-avatar-upload">${d.avatarUrl ? `<img src="${esc(d.avatarUrl)}" alt="">` : `<span>＋</span>`}<b>${d.avatarUrl ? "更换形象" : "上传形象"}</b><input type="file" accept="image/png,image/jpeg,image/webp" data-create-upload hidden /></label></section><section class="create-block"><label>Ta 的名字<input name="name" maxlength="20" value="${esc(d.name)}" placeholder="给 Ta 起个名字" required /></label><div class="create-count"><span>第一印象，从这里开始</span><small data-create-name-count>${String(d.name).length} / 20</small></div><label>Ta 怎么叫你<input name="callMe" maxlength="20" value="${esc(d.callMe)}" placeholder="例如：阿南" /></label><label>一句话介绍 Ta<textarea name="intro" maxlength="80" rows="3" placeholder="写下 Ta 开口说的第一句话">${esc(d.intro)}</textarea></label><div class="create-count"><span>让 Ta 的第一句话有画面</span><small data-create-intro-count>${String(d.intro).length} / 80</small></div></section><section class="create-block"><div class="create-block-head"><b>标签</b><small>最多选 3 个</small></div><div class="create-options">${tags.map((tag) => `<button type="button" data-create-tag="${tag}" class="${d.tags.includes(tag) ? "selected" : ""}">${tag}</button>`).join("")}</div></section><section class="create-block"><div class="create-block-head"><b>声音</b><small>选一个 Ta 的声音</small></div><div class="create-options voice">${voices.length ? voices.map((voice, index) => { const id = String(voice.id || voice.voice || voice.voiceType || ""); const name = voice.name || voice.label || id || `声音 ${index + 1}`; return `<button type="button" data-create-voice="${esc(id)}" class="${d.voiceType === id ? "selected" : ""}">▷ ${esc(name)}</button>`; }).join("") : '<span class="create-muted">声音正在准备中</span>'}</div></section><section class="create-block"><div class="create-block-head"><b>关系设定</b><small>Ta 从哪里认识你</small></div><div class="create-options">${relations.map((relation) => `<button type="button" data-create-relation="${relation}" class="${d.relation === relation ? "selected" : ""}">${relation}</button>`).join("")}</div></section><section class="create-block"><div class="create-block-head"><b>公开</b><small>公开后其他用户可以看到并使用这张卡</small></div><div class="create-options two">${[["public", "公开"], ["private", "仅自己"]].map(([value, text]) => `<button type="button" data-create-visibility="${value}" class="${d.visibility === value ? "selected" : ""}">${text}</button>`).join("")}</div></section><p class="create-foot-note">角色卡的可见范围随时可以再调整</p><button type="submit" class="create-submit" ${state.createBusy ? "disabled" : ""}>${state.createBusy ? "创建中…" : "创建角色卡"}</button></form></main>`;
  }
  function readCreateDraftFromForm() {
    const form = document.querySelector("[data-create-form]");
    const draft = createDraft();
    if (!form) return draft;
    draft.name = form.name.value.trim();
    draft.callMe = form.callMe.value.trim();
    draft.intro = form.intro.value.trim();
    return draft;
  }
  async function saveCreateCard() {
    const d = readCreateDraftFromForm();
    if (!d.name) { state.createError = "请填写 Ta 的名字"; createEditor(); return; }
    if (!d.avatarUrl) { state.createError = "请先上传 Ta 的形象图"; createEditor(); return; }
    if (!d.voiceType || !d.componentVoiceType) { state.createError = "音色还在加载，请稍后重试"; createEditor(); return; }
    state.createBusy = true;
    createEditor();
    const persona = [`关系起点：${d.relation || "刚认识"}`, d.callMe ? `称呼用户为：${d.callMe}` : "", d.intro].filter(Boolean).join("\n");
    const body = { name: d.name, age: 23, occupation: "", language: "zh", tags: d.tags, sortOrder: 0, intro: d.intro, greeting: d.intro, linkName: "", mode: "", personaEnhance: false, sharedRoomEnabled: false, enabled: d.visibility === "public", personaMd: persona, persona, replyStyle: persona, voiceType: d.voiceType, componentVoiceType: d.componentVoiceType, voiceProvider: "", album: [], avatarUrl: d.avatarUrl, portraitUrl: d.avatarUrl };
    try {
      const saved = await api("/api/chat-live/creator/characters", { method: "POST", body: JSON.stringify(body) });
      state.creatorList = [saved.character, ...(state.creatorList || []).filter((item) => item.id !== saved.character?.id)];
      state.page = "create";
      state.createBusy = false;
      state.createError = "";
      render();
      referralToast("角色卡已创建");
    } catch (error) {
      state.createBusy = false;
      state.createError = error.message || "创建失败";
      createEditor();
    }
  }

  function albumParts(role) {
    const raw = Array.isArray(role?.album) ? role.album : [];
    const priv = Array.isArray(role?.privateResources) ? role.privateResources.slice() : [];
    const urls = [];
    raw.forEach((item) => {
      if (item && typeof item === "object") {
        if (item.locked) priv.push(item);
        else if (item.url) urls.push(String(item.url));
      } else if (item) urls.push(String(item));
    });
    const seen = new Set();
    return {
      urls: urls.filter((url) => url && !seen.has(url) && seen.add(url)),
      priv: priv.filter((item) => item && item.locked !== false),
    };
  }
  function isLiveMember() {
    return Boolean(state.config?.membership?.active || state.billing?.subscription?.status === "active");
  }

  function roleDetail(c) {
    const member = isLiveMember();
    const rate = Number(state.config?.pricing?.saleCreditsPerMinute || 0) || 0;
    const parts = albumParts(c);
    const resources = parts.priv;
    const publicPhotos = parts.urls;
    const lockedCount = resources.length;
    const totalCount = publicPhotos.length + lockedCount;
    const preview = publicPhotos.slice(0, lockedCount ? 3 : 4);
    const topic = (c.tags || []).map((x) => `<span class="topic-pill">${esc(x)}</span>`).join("") || '<span class="detail-empty">暂无配置话题</span>';
    const albumCells = preview.map((url) => `<button class="album-cell" data-action="open-album" data-photo="${esc(url)}">${media(url, c.name || "相册")}</button>`).join("");
    const lockedCell = lockedCount ? `<button class="album-cell is-locked" data-action="${member ? "open-album" : "unlock-private"}"><span class="lock-shade"><b>私密</b><small>${lockedCount} 张</small></span></button>` : "";
    app.innerHTML = `<main class="live-page role-detail-page"><section class="role-cover">${media(rolePhoto(c), c.name || "角色")}<div class="role-cover-shade"></div><div class="role-cover-actions"><button data-action="back-home" aria-label="返回">‹</button><span></span><button class="refer-earn" data-action="share-role">推荐获收益</button></div><div class="role-cover-copy"><div class="role-title-row"><h1>${esc(c.name || "角色")}</h1>${[Number(c.age) > 0 ? String(Number(c.age)) : "", c.occupation || ""].filter(Boolean).length ? `<span>${esc([Number(c.age) > 0 ? String(Number(c.age)) : "", c.occupation || ""].filter(Boolean).join(" · "))}</span>` : ""}</div><div class="role-status"><span class="ready-pill"><i></i>随时可以开始聊天</span><b>AI 互动</b></div></div></section><section class="relationship-entry"><button type="button" data-action="relationship" data-character-id="${esc(c.id)}"><span>${uiIcon("heart")}</span><b>亲密度 <i>·</i> <em>了解关系如何积累</em></b><small>每天来聊一会儿，比一次聊很久更有效</small><strong>${uiIcon("chev")}</strong></button></section><section class="role-intro-card"><div class="role-intro-avatar">${media(rolePhoto(c), "")}</div><div class="role-intro-copy"><strong>${esc(c.greeting || c.intro || "欢迎来到我的房间")}</strong><small>${esc(c.intro || "和 TA 聊聊今天的事")}</small></div><button data-action="text-chat">文字聊天</button></section><section class="detail-section"><div class="detail-section-title"><h2>${t("topics")}</h2></div><div class="topic-list">${topic}</div></section><section class="detail-section"><button class="detail-section-title album-open" data-action="open-album"><h2>${t("album")}</h2><span>共 ${totalCount} 张 ›</span></button><div class="album-grid">${albumCells}${lockedCell}${(albumCells || lockedCell) ? "" : '<span class="detail-empty">还没有相册</span>'}</div></section><section class="detail-section"><button class="vip-unlock" data-action="${member ? "open-album" : "unlock-private"}"><span>♔</span><div><strong>私密互动与私密相册</strong><small>${member ? "会员已解锁，可查看专属内容" : `订阅 VIP 后解锁${lockedCount ? `，共 ${lockedCount} 张私密照片` : ""}`}</small></div><b>${member ? "已解锁" : "解锁"}</b></button></section><div class="fixed-call-bar"><button type="button" class="bar-icon" data-action="recharge" aria-label="礼物"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 12v8a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-8"/><path d="M2 7h20v5H2z"/><path d="M12 22V7"/><path d="M12 7H7.5a2.5 2.5 0 1 1 0-5C11 2 12 7 12 7z"/><path d="M12 7h4.5a2.5 2.5 0 1 0 0-5C13 2 12 7 12 7z"/></svg></button><button type="button" class="primary-button" data-call-id="${esc(c.id)}">视频聊天</button></div></main>`;
  }


  function shareLink() {
    const id = state.role?.id || "";
    const url = new URL(location.origin + location.pathname);
    if (id) url.hash = `role/${encodeURIComponent(id)}`;
    const code = state.referral?.code || localStorage.getItem(REFERRAL_KEY) || "";
    if (code) url.searchParams.set("ref", code);
    return url.toString();
  }
  async function ensureReferral() {
    if (!token() || state.referral) return state.referral;
    try { state.referral = (await api("/api/referral")).referral || null; } catch { state.referral = null; }
    return state.referral;
  }
  async function copyShareLink(note) {
    const link = shareLink();
    try { await navigator.clipboard.writeText(link); if (note) note.textContent = "链接已复制。浏览器里不能直接打开微信，把链接发给好友即可。"; }
    catch { if (note) note.textContent = link; }
  }
  function openShareSheet() {
    document.querySelector("[data-role-sheet]")?.remove();
    const name = state.role?.name || "\u89d2\u8272";
    app.insertAdjacentHTML("beforeend", `<div class="sheet-backdrop" data-role-sheet data-action="close-sheet"><div class="language-sheet album-sheet" data-sheet><div class="sheet-handle"></div><div class="filter-sheet-head"><h3>TA的相册</h3><span>共 ${total} 张</span></div><div class="album-sheet-grid">${cells}${locks}</div><button class="sheet-close" data-action="close-sheet">关闭</button></div></div>`)
    ensureReferral();
  }
  function qrDataUrl(value) {
    if (!window.qrcode) return "";
    const qr = window.qrcode(0, "M");
    qr.addData(String(value || ""));
    qr.make();
    const count = qr.getModuleCount();
    const scale = 6;
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = count * scale;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#121218";
    for (let y = 0; y < count; y += 1) {
      for (let x = 0; x < count; x += 1) if (qr.isDark(y, x)) ctx.fillRect(x * scale, y * scale, scale, scale);
    }
    return canvas.toDataURL("image/png");
  }
  async function openSharePoster() {
    if (!token()) {
      if (loginDialog) loginDialog.dataset.pendingShare = "1";
      return askLogin();
    }
    await ensureReferral();
    const role = state.role || {};
    document.querySelector("[data-poster]")?.remove();
    const photo = rolePhoto(role);
    const qr = qrDataUrl(shareLink());
    state.posterQr = qr;
    ensurePosterFont();
    app.insertAdjacentHTML("beforeend", `<div class="sheet-backdrop poster-backdrop" data-poster data-action="close-poster"><div class="poster-card" data-poster-card data-sheet><div class="poster-scroll"><div class="poster-photo">${photo ? `<img src="${esc(photo)}" alt="">` : ""}</div><div class="poster-copy"><div class="poster-name-row"><div class="poster-name"><strong>${esc(role.name || "Vipor")}</strong><em></em><small>AI 互动伙伴</small><p>和我来一场实时的视频聊天吧</p></div><button class="poster-unlock" type="button">解锁专属私密互动 ›</button></div><div class="poster-feats"><div><b><svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M9 7.5v9l8-4.5-8-4.5z"/></svg></b><strong>实时视频</strong><span>面对面交流</span></div><div><b><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><circle cx="12" cy="12" r="6.2" stroke-dasharray="2.2 2.4"/></svg></b><strong>专属陪伴</strong><span>只属于你</span></div><div><b><svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 19s-6.2-3.7-8.2-7.2C2.4 9.4 3.2 6.8 5.6 6.1 7.2 5.6 8.7 6.2 12 8.6c3.3-2.4 4.8-3 6.4-2.5 2.4.7 3.2 3.3 1.8 5.7C18.2 15.3 12 19 12 19z"/></svg></b><strong>更真实的互动</strong><span>拉近彼此距离</span></div></div></div><div class="poster-foot"><div class="poster-brand"><strong>Vipor</strong><small>遇见你的专属伴侣</small></div><div class="poster-scan">长按扫描二维码<br>遇见你的专属伴侣</div><div class="poster-qr">${qr ? `<img src="${qr}" alt="二维码">` : ""}</div></div></div><div class="poster-actions"><p data-sheet-note></p><div class="poster-action-row"><button data-action="save-poster">保存图片</button><button class="poster-share" data-action="poster-share">分享</button></div><button data-action="close-poster">关闭</button></div></div></div>`);
  }
  async function loadPosterPhoto(src) {
    if (!src) return null;
    const sameOrigin = src.startsWith("/") || src.startsWith(location.origin);
    const url = sameOrigin ? src : "/api/poster-image?url=" + encodeURIComponent(src);
    const response = await fetch(url, { credentials: "same-origin" });
    if (!response.ok) return null;
    const blob = await response.blob();
    if (!String(blob.type || "").startsWith("image/")) return null;
    const objectUrl = URL.createObjectURL(blob);
    try {
      return await new Promise((resolve, reject) => {
        const image = new Image();
        image.onload = () => resolve(image);
        image.onerror = () => reject(new Error("poster photo"));
        image.src = objectUrl;
      });
    } catch {
      return null;
    } finally {
      URL.revokeObjectURL(objectUrl);
    }
  }
  function drawPosterCover(ctx, image, x, y, w, h) {
    const scale = Math.max(w / image.width, h / image.height);
    const sw = w / scale;
    const sh = h / scale;
    ctx.drawImage(image, (image.width - sw) / 2, Math.max(0, (image.height - sh) * 0.18), sw, sh, x, y, w, h);
  }
      async function ensurePosterFont() {
    if (!document.getElementById("poster-script-font")) {
      const style = document.createElement("style");
      style.id = "poster-script-font";
      style.textContent = '@font-face{font-family:PosterScript;src:url(/assets/brand/MaShanZheng-Regular.ttf) format("truetype");font-display:swap}';
      document.head.appendChild(style);
    }
    try { await document.fonts.load('64px PosterScript'); } catch {}
  }
  async function saveSharePoster() {
    const note = document.querySelector("[data-poster] [data-sheet-note]");
    const role = state.role || {};
    const canvas = document.createElement("canvas");
    canvas.width = 720; canvas.height = 1120;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, 720, 1120);
    ctx.save(); roundRect(ctx, 24, 24, 672, 1072, 36); ctx.clip();
    ctx.fillStyle = "#fff"; ctx.fillRect(24, 24, 672, 1072);
    const img = await loadPosterPhoto(rolePhoto(role));
    if (img && img.width) drawPosterCover(ctx, img, 24, 24, 672, 700);
    else { ctx.fillStyle = "#f3e7ea"; ctx.fillRect(24, 24, 672, 700); }
    ctx.fillStyle = "#111"; ctx.font = "850 52px sans-serif"; ctx.textAlign = "left";
    ctx.fillText(String(role.name || "Vipor").slice(0, 8), 48, 772);
    ctx.save(); ctx.translate(56, 786); ctx.rotate(-0.2); ctx.fillStyle = "#ff4d88"; roundRect(ctx, 0, 0, 58, 8, 4); ctx.fill(); ctx.restore();
    ctx.fillStyle = "#8a8a8a"; ctx.font = "18px sans-serif"; ctx.fillText("AI 互动伙伴", 48, 812);
    ctx.fillStyle = "#222"; ctx.font = "750 20px sans-serif"; ctx.fillText("和我来一场实时的视频聊天吧", 48, 842);
    ctx.fillStyle = "#ff5b93"; roundRect(ctx, 430, 746, 230, 44, 22); ctx.fill();
    ctx.fillStyle = "#fff"; ctx.font = "700 16px sans-serif"; ctx.textAlign = "center"; ctx.fillText("解锁专属私密互动  ›", 545, 774);
    const feats = [["实时视频", "面对面交流", "▶"], ["专属陪伴", "只属于你", "◌"], ["更真实的互动", "拉近彼此距离", "♥"]];
    feats.forEach((item, i) => {
      const x = 40 + i * 220;
      ctx.fillStyle = "#ffe4ee"; ctx.beginPath(); ctx.arc(x + 96, 900, 24, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#ff4d88"; ctx.font = "700 18px sans-serif"; ctx.textAlign = "center"; ctx.fillText(item[2], x + 96, 906);
      ctx.fillStyle = "#111"; ctx.font = "700 16px sans-serif"; ctx.fillText(item[0], x + 96, 948);
      ctx.fillStyle = "#9a9a9a"; ctx.font = "13px sans-serif"; ctx.fillText(item[1], x + 96, 968);
      if (i) { ctx.strokeStyle = "#f0e4e8"; ctx.beginPath(); ctx.moveTo(x, 874); ctx.lineTo(x, 974); ctx.stroke(); }
    });
    ctx.strokeStyle = "#f1e6ea"; ctx.beginPath(); ctx.moveTo(48, 992); ctx.lineTo(672, 992); ctx.stroke();
    ctx.textAlign = "left"; ctx.fillStyle = "#111"; ctx.font = "800 32px sans-serif"; ctx.fillText("Vipor", 48, 1036);
    ctx.fillStyle = "#8d8d8d"; ctx.font = "15px sans-serif"; ctx.fillText("遇见你的专属伴侣", 48, 1062);
    ctx.textAlign = "right"; ctx.fillText("长按扫描二维码", 560, 1032); ctx.fillText("遇见你的专属伴侣", 560, 1054);
    ctx.fillStyle = "#fff"; ctx.strokeStyle = "#eee"; roundRect(ctx, 580, 1004, 84, 84, 8); ctx.fill(); ctx.stroke();
    const qrImage = await loadPosterQr(state.posterQr || qrDataUrl(shareLink()));
    if (qrImage) ctx.drawImage(qrImage, 586, 1010, 72, 72);
    ctx.restore();
    const a = document.createElement("a");
    let href = "";
    try { href = canvas.toDataURL("image/png"); }
    catch { if (note) note.textContent = "照片跨域，保存失败。请刷新后再试。"; return; }
    a.href = href;
    a.download = `${role.name || "vipeak"}-poster.png`;
    a.click();
    if (note) note.textContent = img && img.width ? "图片已保存。" : "照片没有加载成功，请刷新后再保存。";
  }

  function loadPosterQr(src) {
    return new Promise((resolve) => {
      if (!src) return resolve(null);
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => resolve(null);
      image.src = src;
    });
  }
  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  }
  function vcoin(usd) { return Math.round(Number(usd || 0) * 1000) / 10; }
  function referralToast(text) {
    let toast = document.querySelector("[data-referral-toast]");
    if (!toast) { document.body.insertAdjacentHTML("beforeend", `<div class="referral-toast" data-referral-toast></div>`); toast = document.querySelector("[data-referral-toast]"); }
    toast.textContent = text; toast.classList.add("show");
    clearTimeout(referralToast.timer); referralToast.timer = setTimeout(() => toast.classList.remove("show"), 1800);
  }

  function openUnlockPrivate() {
    if (!token()) return askLogin();
    const role = state.role || {};
    const cover = rolePhoto(role);
    document.querySelector("[data-unlock-modal]")?.remove();
    const count = Array.isArray(role.privateResources) ? role.privateResources.length : 0;
    app.insertAdjacentHTML("beforeend", `<div class="sheet-backdrop unlock-backdrop" data-unlock-modal data-action="close-unlock"><div class="private-lock-card" data-sheet><div class="private-lock-preview">${cover ? `<img src="${esc(cover)}" alt="">` : ""}<span class="private-lock-icon">锁</span></div><h3>解锁私密照片</h3><p>${esc(role.name || "TA")} 有 ${count} 张私密照片。订阅 VIP 后可以查看，未开通前保持锁定。</p><button class="primary-button" data-action="vip">立即解锁</button><button class="ghost-button" data-action="close-unlock">稍后再说</button></div></div>`);
  }
  async function openTextChat(conversationId) {
    if (!token()) return askLogin();
    state.page = "text-chat";
    state.textChatId = conversationId || state.textChatId || "";
    if (!state.textChatId && state.role?.id) {
      const existing = state.conversations.find((item) => String(item.characterId || item.character?.id || "") === String(state.role.id) && item.id && !String(item.id).startsWith("live-contact-"));
      if (existing) state.textChatId = existing.id;
    }
    if (!state.textChatId && state.role?.id) {
      try {
        const created = await api("/api/chat/conversations", { method: "POST", body: JSON.stringify({ characterId: state.role.id, language: state.language }) });
        state.textChatId = created.conversation?.id || "";
        state.conversations = [created.conversation, ...state.conversations.filter((item) => item.id !== created.conversation?.id)];
      } catch (error) {
        app.innerHTML = `<main class="live-page text-chat-page"><header class="sub-head"><button type="button" data-action="back-from-sub">‹</button><h1>文字聊天</h1></header><div class="empty-state"><h2>暂时无法开始对话</h2><p>${esc(error.message)}</p><button class="primary-button" data-action="recharge">去充值</button></div></main>`;
        return;
      }
    }
    await showTextChat();
  }
  function voiceSeconds(item) {
    const text = String(item?.content || "");
    const hit = text.match(/(\d+)\s*[秒s″"]/) || text.match(/(\d{1,2}:\d{2})/);
    if (!hit) return "";
    return hit[1].includes(":") ? hit[1] : `${hit[1]}″`;
  }
  function stripReplyThinking(value) {
    return String(value || "")
      .replace(/<think(?:ing)?>[\s\S]*?<\/think(?:ing)?>/gi, "")
      .replace(/```(?:thinking|reasoning|thought)[\s\S]*?```/gi, "")
      .replace(/(?:^|\n)\s*(?:思考过程|推理过程|分析过程|内心独白|思考|推理|分析)[:：][^\n]*/g, "")
      .replace(/正在回复[…\.。]*|正在思考[…\.。]*|思考中[…\.。]*/g, "")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }
  function renderChatItem(item, avatar, name) {
    const mine = item.role === "user";
    const text = mine ? String(item.content || "") : stripReplyThinking(item.content);
    if (!mine && !text && !item.kind && !item.audioUrl && !item.voiceUrl) return "";
    const kind = String(item.kind || "").toLowerCase();
    const locked = item.locked || item.status === "locked" || /仅订阅|私密语音|订阅可见/.test(text);
    const voice = kind === "audio" || kind === "voice" || /\[语音\]|语音消息/.test(text);
    const call = kind === "call" || kind === "video-call" || /视频通话|视频连线/.test(text);
    const head = mine ? "" : `<span class="chat-avatar">${avatar}</span>`;
    if (locked && !mine) return `<button type="button" class="chat-lock" data-action="vip"><span>${uiIcon("lock")}</span><span><b>${esc(name)}发来一段仅订阅可见的私密语音</b><small>订阅 VIP 解锁隐私互动后即可播放</small></span><em>去解锁</em></button>`;
    if (voice) {
      const audio = item.audioUrl || item.voiceUrl || item.mediaUrl || "";
      return `<div class="chat-row${mine ? " mine" : ""}">${head}<button type="button" class="voice-bar" data-action="play-voice" data-audio="${esc(audio)}">${uiIcon("play")}<span class="wave"><i></i><i></i><i></i><i></i><i></i></span><b>${esc(voiceSeconds(item) || "语音")}</b></button></div>`;
    }
    if (call) return `<div class="chat-row${mine ? " mine" : ""}">${head}<div class="call-chip">${uiIcon("video")}<span>视频通话${voiceSeconds(item) ? ` · ${esc(voiceSeconds(item))}` : ""}</span></div></div>`;
    if (kind === "gift") return `<div class="chat-row mine"><div class="gift-bubble"><i>${uiIcon("gift")}</i><span>${esc(text || "送出了礼物")}</span></div></div>`;
    return `<div class="chat-row${mine ? " mine" : ""}">${head}<p class="text-bubble${mine ? " mine" : ""}">${esc(text)}</p></div>`;
  }

  async function openTextGiftSheet() {
    if (!token()) return askLogin();
    document.querySelector("[data-gift-sheet]")?.remove();
    if (!state.textChatId || String(state.textChatId).startsWith("live-contact-")) {
      if (!state.role?.id) { referralToast("先进入一个角色对话"); return; }
      try {
        const created = await api("/api/chat/conversations", { method: "POST", body: JSON.stringify({ characterId: state.role.id, language: state.language }) });
        state.textChatId = created.conversation?.id || state.textChatId;
        if (created.conversation) state.conversations = [created.conversation, ...state.conversations.filter((item) => item.id !== created.conversation.id)];
      } catch (error) {
        if (error.status === 402) { state.pageReturn = "text-chat"; showRecharge(); return; }
        referralToast(error.message || "暂时无法送礼物");
        return;
      }
    }
    const gifts = (state.config?.gifts || []).filter((item) => item && item.id && Number(item.credits) > 0);
    let credits = Number(state.user?.credits || 0);
    try { state.user = (await api("/api/auth/me")).user || state.user; credits = Number(state.user?.credits || 0); } catch {}
    const cards = gifts.map((gift) => `<button type="button" class="gift-sheet-card" data-gift-id="${esc(gift.id)}" data-gift-cost="${esc(gift.credits)}"><img src="${esc(gift.imageUrl || "")}" alt=""><b>${esc(gift.name || "礼物")}</b><small>${esc(gift.credits)} 积分</small></button>`).join("");
    app.insertAdjacentHTML("beforeend", `<div class="sheet-backdrop" data-gift-sheet data-action="close-sheet"><div class="gift-sheet" data-sheet><div class="sheet-handle"></div><div class="gift-sheet-head"><h3>礼物打赏</h3><span>余额 <b>${credits.toLocaleString("zh-CN")}</b> 积分</span></div><div class="gift-sheet-grid">${cards || '<p class="detail-empty">礼物还没有准备好</p>'}</div><button type="button" class="gift-sheet-more" data-action="recharge">去充值更多积分</button><button type="button" class="gift-sheet-cancel" data-action="close-sheet">取消</button></div></div>`);
  }
  function showTextGiftEffect(gift) {
    document.querySelector("[data-live-gift-effect]")?.remove();
    const image = String(gift?.imageUrl || "");
    const name = String(gift?.name || "礼物");
    app.insertAdjacentHTML("beforeend", `<div class="live-gift-effect" data-live-gift-effect aria-live="polite"><div class="live-gift-rays"></div><div class="live-gift-sparks"><i></i><i></i><i></i><i></i><i></i><i></i></div><div class="live-gift-art">${image ? `<img src="${esc(image)}" alt="${esc(name)}">` : `<span>🎁</span>`}</div><div class="live-gift-caption"><small>礼物已送达</small><b>${esc(name)}</b></div></div>`);
    const node = document.querySelector("[data-live-gift-effect]");
    window.setTimeout(() => node?.remove(), 2400);
  }
  async function sendTextGift(giftId, cost) {
    const credits = Number(state.user?.credits || 0);
    if (credits < Number(cost || 0)) {
      document.querySelector("[data-gift-sheet]")?.remove();
      state.pageReturn = "text-chat";
      referralToast("积分不够，去充值");
      showRecharge();
      return;
    }
    const button = document.querySelector(`[data-gift-id="${giftId}"]`);
    if (button) button.disabled = true;
    try {
      const result = await api(`/api/chat/conversations/${encodeURIComponent(state.textChatId)}/gift`, { method: "POST", body: JSON.stringify({ giftId, eventId: `gift-${Date.now().toString(36)}` }) });
      document.querySelector("[data-gift-sheet]")?.remove();
      if (state.user) state.user.credits = result.credits ?? Math.max(0, credits - Number(cost || 0));
      const gift = (state.config?.gifts || []).find((item) => String(item.id) === String(giftId));
      showTextGiftEffect(gift || { name: "礼物" });
      const thread = document.querySelector("[data-text-thread]");
      const known = state.conversations.find((item) => String(item.id) === String(state.textChatId));
      const name = known?.character?.name || state.role?.name || "对话";
      const avatar = media(conversationAvatar(known || { character: state.role }) || rolePhoto(state.role), name);
      for (const item of result.messages || []) thread?.insertAdjacentHTML("beforeend", renderChatItem(item, avatar, name));
      thread?.scrollTo(0, thread.scrollHeight);
      if (known) { known.lastMessage = result.messages?.[1]?.content || known.lastMessage; known.updatedAt = new Date().toISOString(); known.preview = known.lastMessage; }
    } catch (error) {
      if (button) button.disabled = false;
      if (error.status === 402 || String(error.code || "").includes("CREDIT")) {
        document.querySelector("[data-gift-sheet]")?.remove();
        state.pageReturn = "text-chat";
        showRecharge();
        return;
      }
      referralToast(error.message || "礼物没有送出");
    }
  }

  function textChatBurstState(conversationId) {
    const key = String(conversationId || "");
    if (!state.textChatBursts.has(key)) state.textChatBursts.set(key, { timer: 0, pending: [], sending: false, blocked: false });
    return state.textChatBursts.get(key);
  }
  function textChatDraft() {
    return String(app.querySelector("[data-text-form] input[name=content]")?.value || "");
  }
  function restoreTextChatDraft(draft = "") {
    const input = app.querySelector("[data-text-form] input[name=content]");
    if (!input) return;
    if (draft) input.value = draft;
    input.focus();
  }
  function scheduleTextChatBurst(conversationId, delay = 1000) {
    const burst = textChatBurstState(conversationId);
    if (burst.timer) window.clearTimeout(burst.timer);
    burst.timer = window.setTimeout(() => {
      burst.timer = 0;
      flushTextChatBurst(conversationId).catch(() => {});
    }, delay);
  }
  function queueTextChatMessage(conversationId, content) {
    const value = String(content || "").trim();
    if (!value) return;
    const burst = textChatBurstState(conversationId);
    burst.pending.push(value);
    scheduleTextChatBurst(conversationId);
  }
  async function flushTextChatBurst(conversationId) {
    const burst = textChatBurstState(conversationId);
    if (burst.sending || !burst.pending.length) return;
    if (burst.blocked) return;
    const queued = burst.pending.slice();
    const contents = queued.map((item) => String(item || "").trim()).filter(Boolean);
    if (!contents.length) {
      burst.pending = burst.pending.filter((item) => !queued.includes(item));
      return;
    }
    burst.blocked = false;
    burst.sending = true;
    try {
      const result = await api(`/api/chat/conversations/${encodeURIComponent(conversationId)}/messages`, {
        method: "POST",
        body: JSON.stringify({ contents, content: contents[contents.length - 1], action: "send", language: state.language }),
      });
      burst.pending = burst.pending.filter((item) => !queued.includes(item));
      if (state.user && result.credits != null) state.user.credits = result.credits;
      await refreshTextChatMessages(conversationId);
    } catch (error) {
      burst.pending = burst.pending.filter((item) => !queued.includes(item));
      if (error.status === 402) {
        state.pageReturn = "text-chat";
        showRecharge();
        return;
      }
      burst.blocked = Boolean(error.status === 402 || String(error.code || "").includes("INSUFFICIENT"));
      if (!burst.blocked && state.page === "text-chat" && state.textChatId === conversationId) {
        const note = document.querySelector("[data-text-error]");
        if (note) note.textContent = error.message || "消息没有发出去，可以继续发送。";
      }
    } finally {
      burst.sending = false;
      if (!burst.blocked && burst.pending.length) scheduleTextChatBurst(conversationId);
    }
  }
  function renderTextChatThread(messages, avatar, name) {
    const thread = document.querySelector("[data-text-thread]");
    if (!thread) return;
    const pending = textChatBurstState(state.textChatId).pending.map((item) => renderChatItem({ role: "user", content: item }, avatar, name)).join("");
    const next = messages.map((item) => renderChatItem(item, avatar, name)).join("") + pending || `<p class="detail-empty">开始和 TA 聊聊。</p>`;
    if (thread.innerHTML !== next) thread.innerHTML = next;
    thread.scrollTo(0, thread.scrollHeight);
  }
  async function refreshTextChatMessages(conversationId, avatar = "", name = "") {
    if (state.page !== "text-chat" || state.textChatId !== conversationId) return;
    const payload = await api(`/api/chat/conversations/${encodeURIComponent(conversationId)}`);
    if (state.page !== "text-chat" || state.textChatId !== conversationId) return;
    const messages = payload.messages || [];
    const conversation = payload.conversation || {};
    const character = conversation.character || state.role || {};
    const peerName = name || character.name || conversation.title || document.querySelector(".chat-peer b")?.textContent || "对话";
    const peerAvatar = avatar || media(rolePhoto(character) || conversationAvatar(conversation) || rolePhoto(state.role), peerName);
    renderTextChatThread(messages, peerAvatar, peerName);
  }
  async function showTextChat(options = {}) {
    if (!state.textChatId) { state.page = "messages"; render(); return; }
    const known = state.conversations.find((item) => String(item.id) === String(state.textChatId));
    const knownName = known?.character?.name || known?.title || state.role?.name || "对话";
    const knownPhoto = conversationAvatar(known || { character: state.role, characterId: state.role?.id }) || rolePhoto(state.role);
    const characterId = known?.characterId || known?.character?.id || state.role?.id || "";
    app.innerHTML = `<main class="live-page text-chat-page"><header class="chat-head"><button type="button" data-action="back-messages" aria-label="返回">${uiIcon("back")}</button><button type="button" class="chat-peer" data-character-id="${esc(characterId)}"><span class="chat-avatar">${media(knownPhoto, knownName)}</span><span><b>${esc(knownName)}</b><small>在线 · AI 陪伴</small></span></button><button type="button" class="chat-video" data-call-id="${esc(characterId)}">${uiIcon("video")}<span>视频</span></button></header><button type="button" class="chat-relationship-strip" data-action="relationship" data-character-id="${esc(characterId)}"><span>${uiIcon("heart")}</span><b>亲密度</b><small data-relationship-summary>每天来聊一会儿，关系会慢慢变化</small>${uiIcon("chev")}</button><div class="text-thread" data-text-thread style="${knownPhoto ? `background-image:linear-gradient(rgba(11,11,16,.62),rgba(11,11,16,.82)),url('${esc(knownPhoto)}')` : ""}"><p class="detail-empty">正在读取对话…</p></div><button type="button" class="gift-fab" data-action="open-text-gifts"><span class="gift-badge">礼</span>${uiIcon("gift")}<span>送礼物</span></button><form class="text-composer" data-text-form><button type="button" class="mic-btn" data-action="text-mic" aria-label="语音">${uiIcon("mic")}</button><input name="content" maxlength="4000" placeholder="说点什么…" autocomplete="off" required /><button type="submit">发送</button><p data-text-error></p></form></main>`;
    try {
      const payload = await api(`/api/chat/conversations/${encodeURIComponent(state.textChatId)}`);
      const messages = payload.messages || [];
      const character = payload.conversation?.character || known?.character || state.role || {};
      const name = character.name || payload.conversation?.title || knownName;
      const photo = rolePhoto(character) || character.posterUrl || character.characterImageUrl || knownPhoto;
      const id = payload.conversation?.characterId || character.id || characterId;
      const peer = document.querySelector(".chat-peer");
      const video = document.querySelector(".chat-video");
      const relationship = document.querySelector(".chat-relationship-strip");
      if (peer) { peer.dataset.characterId = id || ""; peer.querySelector("b").textContent = name; peer.querySelector(".chat-avatar").innerHTML = media(photo, name); }
      if (video) video.dataset.callId = id || "";
      if (relationship) relationship.dataset.characterId = id || "";
      try {
        const status = (await api(`/api/companion/relationship/${encodeURIComponent(id)}`)).relationship || {};
        const summary = document.querySelector("[data-relationship-summary]");
        if (summary && status.stage) summary.textContent = `当前 ${status.stage} · ${status.stageDescription || "关系会随着相处慢慢变化"}`;
      } catch {}
      const thread = document.querySelector("[data-text-thread]");
      if (photo && thread) thread.style.backgroundImage = `linear-gradient(rgba(11,11,16,.62),rgba(11,11,16,.82)),url('${photo}')`;
      const avatar = media(photo, name);
      renderTextChatThread(messages, avatar, name);
    } catch (error) {
      const thread = document.querySelector("[data-text-thread]");
      if (thread) thread.innerHTML = `<p class="detail-empty">${esc(error.message)}</p>`;
    }
  }

  function referralDetailRows(referral) {
    const rows = (referral.withdrawals || []).map((item) => {
      const coins = vcoin(item.amountUsd);
      const when = moneyTime(item.createdAt || item.requestedAt);
      const status = item.status === "pending" ? "\u5904\u7406\u4e2d" : (item.status || "");
      return `<div class="earn-row"><span class="earn-ico wallet">\u5e01</span><div><b>\u63d0\u73b0\u7533\u8bf7</b><small>${esc(status)} \u00b7 ${esc(when)}</small></div><em class="down">-${coins} \u5e01</em></div>`;
    });
    return rows.join("") || `<div class="earn-empty">\u8fd8\u6ca1\u6709\u6536\u76ca\u660e\u7ec6</div>`;
  }
  async function showReferral() {
    if (!token()) return askLogin();
    state.page = "referral";
    app.innerHTML = `<main class="live-page referral-page"><header class="referral-head"><button type="button" data-action="back-profile" aria-label="\u8fd4\u56de">\u2039</button><h1>\u63a8\u8350\u83b7\u6536\u76ca</h1><button type="button" data-action="vip">\u8ba2\u9605\u6743\u76ca</button></header><div class="empty-state">\u6b63\u5728\u8bfb\u53d6\u63a8\u5e7f\u6570\u636e\u2026</div></main>`;
    try {
      const referral = (await api("/api/referral")).referral || {};
      state.referral = referral;
      const link = referral.inviteUrl || shareLink();
      const total = vcoin(referral.totalCommissionUsd);
      const available = vcoin(referral.availableWithdrawableUsd);
      const count = (referral.withdrawals || []).length;
      app.innerHTML = `<main class="live-page referral-page"><header class="referral-head"><button type="button" data-action="back-profile" aria-label="\u8fd4\u56de">\u2039</button><h1>\u63a8\u8350\u83b7\u6536\u76ca</h1><button type="button" data-action="vip">\u8ba2\u9605\u6743\u76ca</button></header><section class="earn-card"><div class="earn-card-top"><span>\u7d2f\u8ba1\u83b7\u5f97\u6536\u76ca</span><small>1USD=100V\u5e01</small></div><div class="earn-card-main"><strong>${total} <em>V\u5e01</em></strong><button type="button" data-action="withdraw-referral">\u63d0\u73b0</button></div><div class="earn-stats"><div><b>${Number(referral.invitedCount || 0)}</b><small>\u5df2\u9080\u8bf7\u4eba\u6570</small></div><div><b>${available}</b><small>\u53ef\u63d0\u73b0\u6536\u76ca</small></div></div></section><button class="earn-link" data-copy-referral="${esc(link)}">\u83b7\u53d6\u4e13\u5c5e\u5206\u4eab\u94fe\u63a5</button><p class="earn-note">\u5206\u4eab\u597d\u53cb\uff0cTA \u901a\u8fc7\u4f60\u7684\u5206\u4eab\u4e0b\u5355\u5373\u8ba1\u5165\u4f60\u7684\u63a8\u8350\u6536\u76ca\u3002</p><section class="earn-block"><div class="earn-block-head"><h2>\u6536\u76ca\u660e\u7ec6</h2><span>\u5171 ${count} \u7b14 \u00b7 \u5408\u8ba1 ${total} V\u5e01</span></div><div class="earn-list">${referralDetailRows(referral)}</div></section><section class="earn-block"><h2>\u6536\u76ca\u89c4\u5219</h2><div class="earn-rules"><div class="earn-rule-row"><span class="earn-ico doc">\u6587</span><div><p><i>1.</i>\u7528\u6237\u901a\u8fc7\u63a8\u8350\u8005\u5206\u4eab\u4e0b\u5355\u7684 VIP \u8ba2\u9605\u3001\u8d2d\u4e70 V\u5e01 \u6240\u4ea7\u751f\u7684\u652f\u4ed8\u4ea4\u6613\uff0c\u6309\u4ea4\u6613\u91d1\u989d\u7684 5% \u7ed3\u7b97\u7ed9\u63a8\u8350\u8005\u3002</p><p><i>2.</i>\u63d0\u73b0\u7ed3\u7b97\u9700\u8981\u6263\u96646%\u670d\u52a1\u8d39\u3002</p></div></div><div class="earn-rule-tip">\u82e5\u88ab\u9080\u8bf7\u8005\u6d89\u53ca\u8ba2\u5355\u9000\u6b3e\uff0c\u5219\u9700\u6263\u9664\u63a8\u8350\u8005\u76f8\u5e94\u7ed3\u7b97\u6536\u76ca\u3002\u4e00\u7ecf\u53d1\u73b0\u5f02\u5e38\u9080\u8bf7\u5206\u4eab\u884c\u4e3a\uff0cVipor\u6709\u6743\u51bb\u7ed3\u76f8\u5e94\u7ed3\u7b97\u6536\u76ca\u3002</div></div></section><p class="earn-footer">Vipor \u00b72026</p></main>`;
    } catch (error) {
      app.innerHTML = `<main class="live-page referral-page"><header class="referral-head"><button type="button" data-action="back-profile" aria-label="\u8fd4\u56de">\u2039</button><h1>\u63a8\u8350\u83b7\u6536\u76ca</h1><button type="button" data-action="vip">\u8ba2\u9605\u6743\u76ca</button></header><div class="empty-state"><p>${esc(error.message)}</p></div></main>`;
    }
  }
  async function withdrawReferral() {
    const referral = state.referral || {};
    const available = Number(referral.availableWithdrawableUsd || 0);
    if (available < 1) { referralToast("\u53ef\u63d0\u73b0\u4e0d\u8db3 1 \u7f8e\u5143"); return; }
    let address = String(referral.walletAddress || "").trim();
    if (address.length < 20) {
      address = String(window.prompt("\u8bf7\u8f93\u5165\u63d0\u73b0\u94b1\u5305\u5730\u5740", "") || "").trim();
      if (address.length < 20) { referralToast("\u8bf7\u5148\u586b\u5199\u94b1\u5305\u5730\u5740"); return; }
    }
    const amount = Math.floor(available * 100) / 100;
    try {
      const result = await api("/api/referral/withdrawals", { method: "POST", body: JSON.stringify({ amountUsd: amount, walletAddress: address }) });
      state.referral = result.referral || state.referral;
      referralToast("\u63d0\u73b0\u7533\u8bf7\u5df2\u63d0\u4ea4");
      showReferral();
    } catch (error) {
      referralToast(error.message || "\u63d0\u73b0\u6ca1\u6709\u63d0\u4ea4");
    }
  }

  function languageSheet() { app.insertAdjacentHTML("beforeend", `<div class="sheet-backdrop" data-action="close-sheet"><div class="language-sheet" data-sheet><h3>选择语言</h3>${[["zh", "简体中文"],["en", "English"],["ja", "日本語"]].map(([id,name]) => `<button data-language="${id}" class="${state.language === id ? "selected" : ""}">${name}<span>${state.language === id ? "✓" : ""}</span></button>`).join("")}</div></div>`); }
  
  function subpage(title, body, back = state.subpageBack || "profile") {
    const navKey = ["home", "messages", "profile"].includes(back) ? back : "profile";
    app.innerHTML = `<main class="live-page vip-page"><header class="detail-header"><button class="icon-button" data-action="back-subpage">‹</button><h1>${esc(title)}</h1></header>${body}</main>${nav(navKey)}`;
  }
  function showCheckin() {
    if (!token()) return askLogin();
    state.page = "checkin";
    state.subpageBack = "home";
    const data = state.checkin || {};
    const checked = data.checkedIn === true;
    const streak = Number(data.streak || 0);
    const today = data.today || null;
    const recent = new Set(data.recentDates || []);
    const weekdays = ["日", "一", "二", "三", "四", "五", "六"];
    const days = Array.from({ length: 7 }, (_, index) => {
      const date = new Date();
      date.setDate(date.getDate() - (6 - index));
      const key = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
      return { key, day: date.getDate(), weekday: weekdays[date.getDay()], active: recent.has(key), today: index === 6 };
    });
    const calendar = days.map((item) => `<div class="checkin-day${item.active ? " checked" : ""}${item.today ? " today" : ""}"><small>${item.weekday}</small><b>${item.active ? "✓" : item.day}</b><span>${item.today ? "今天" : ""}</span></div>`).join("");
    const award = Number(data.credits || 0);
    const awardText = award > 0 ? `${award} 积分` : "今日奖励";
    subpage("每日领积分", `<section class="checkin-hero"><div class="checkin-coin">V</div><div><span>今日可领</span><strong>${award > 0 ? `${award} <small>积分</small>` : awardText}</strong><p>每日 24:00 重置，连续签到保持记录</p></div></section><section class="checkin-streak"><div><b>${streak}</b><small>连续签到天数</small></div><div><b>${checked ? "已领取" : "待领取"}</b><small>今日状态</small></div></section><p class="section-label">最近 7 天</p><section class="checkin-week">${calendar}</section><section class="benefit-rows checkin-tasks"><div><span class="rule-ico gold">${uiIcon("crown")}</span><div><b>每日签到</b><small>${checked ? `今天已领取${award > 0 ? ` ${award} 积分` : ""}${today?.createdAt ? ` · ${moneyTime(today.createdAt)}` : ""}` : "领取后 积分自动到账"}</small></div><em>${award > 0 ? `+${award}` : "奖励"}</em></div><div><span class="rule-ico pink">${uiIcon("heart")}</span><div><b>连续签到</b><small>保持每天回来看看 TA</small></div><em>${streak} 天</em></div></section><button class="checkin-claim" type="button" data-action="checkin-claim" ${checked || state.checkinLoading ? "disabled" : ""}>${checked ? "今日已领取" : state.checkinLoading ? "领取中…" : `领取${award > 0 ? ` ${award} 积分` : ""}`}</button>${state.checkinError ? `<p class="form-error">${esc(state.checkinError)}</p>` : ""}<p class="pay-foot">签到 积分会直接进入钱包，可在钱包与消费记录中查看。</p>`, "home");
  }
  async function loadCheckin(force = false) {
    if (!token() || (state.checkin && !force)) return state.checkin;
    state.checkinLoading = true;
    state.checkinError = "";
    if (state.page === "checkin") showCheckin();
    try {
      const result = await api("/api/live/checkin");
      state.checkin = result.checkin || null;
      if (result.user) state.user = result.user;
      return state.checkin;
    } catch (error) {
      state.checkinError = error.message || "签到信息加载失败";
      return null;
    } finally {
      state.checkinLoading = false;
      if (state.page === "checkin") showCheckin();
    }
  }
  async function claimCheckin() {
    if (!token()) return askLogin();
    if (state.checkinLoading) return;
    state.checkinLoading = true;
    state.checkinError = "";
    showCheckin();
    try {
      const result = await api("/api/live/checkin", { method: "POST", body: "{}" });
      state.checkin = result.checkin || state.checkin;
      if (result.user) state.user = result.user;
      referralToast(result.alreadyChecked ? "今天已经签到过了" : (Number(result.awardedCredits || 0) > 0 ? `签到成功，+${Number(result.awardedCredits || 0)} 积分` : "签到成功"));
    } catch (error) {
      state.checkinError = error.message || "签到失败，请稍后重试";
    } finally {
      state.checkinLoading = false;
      if (state.page === "checkin") showCheckin();
    }
  }
  function showSettings() {
    state.page = "settings";
    state.subpageBack = "profile";
    const version = "1.0.0";
    subpage("设置", `<section class="settings-list"><button type="button" data-action="language-sheet"><i>${uiIcon("chat")}</i><div><b>语言</b><small>${state.language === "en" ? "English" : state.language === "ja" ? "日本語" : "简体中文"}</small></div><em>${uiIcon("chev")}</em></button><a href="/downloads/vipeak-live.apk" download><i>${uiIcon("home")}</i><div><b>Android 下载</b><small>安装 Vipeak Live APK</small></div><em>${uiIcon("chev")}</em></a><button type="button" data-action="settings-ios"><i>${uiIcon("crown")}</i><div><b>iOS 下载</b><small>安装描述文件或使用网页版</small></div><em>${uiIcon("chev")}</em></button><div class="settings-static"><i>${uiIcon("gear")}</i><div><b>当前版本</b><small>Vipeak Live ${version}</small></div></div></section><p class="pay-foot">Vipeak Live · 用心陪伴每一次对话</p>`, "profile");
  }
  function moneyTime(value) {
    const date = new Date(value || "");
    if (Number.isNaN(date.getTime())) return String(value || "").replace("T", " ").slice(0, 16);
    return new Intl.DateTimeFormat("zh-CN", { timeZone: "Asia/Shanghai", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false }).format(date);
  }
  function recordRows(items, empty) {
    if (!items.length) return `<div class="empty-state"><p>${esc(empty)}</p></div>`;
    return `<section class="benefit-list">${items.map((item) => `<div><b>${esc(item.title)}</b><small>${esc(item.meta)}</small><em>${esc(item.amount)}</em></div>`).join("")}</section>`;
  }
  async function startCheckout(body){ state.pendingCheckout=body; const note=document.querySelector("[data-pay-status]"); if(!token()){ if(note) note.textContent="请先登录，登录后会继续打开收银台。"; return askLogin(); } if(note) note.textContent="正在打开收银台…"; try{ const result=await api("/api/pay/airwallex/checkout-sessions",{method:"POST",body:JSON.stringify(body)}); if(result.checkoutUrl){ location.href=result.checkoutUrl; return;} if(note) note.textContent="收银台地址没有返回"; }catch(error){ if(note) note.textContent=error.message||"支付没有拉起"; } }
  function askLogin(pending = {}) {
    if (!loginDialog) return;
    if (pending.characterId) loginDialog.dataset.pending = pending.characterId;
    if (pending.roomId) loginDialog.dataset.pendingRoom = pending.roomId;
    if (pending.relationship) loginDialog.dataset.pendingRelationship = pending.relationship;
    resetLoginDialog();
    setupGoogleLogin();
    if (!loginDialog.open) loginDialog.showModal();
  }
  function lockLogin() {
    if (!loginDialog) return;
    loginDialog.dataset.locked = "1";
    loginDialog.classList.add("login-locked");
    askLogin();
  }
  function clearLoginLock() {
    if (!loginDialog) return;
    loginDialog.classList.remove("login-locked");
    delete loginDialog.dataset.locked;
  }
  async function finishLogin(nextToken, user) {
    localStorage.setItem(TOKEN_KEY, nextToken);
    if (user) state.user = user;
    const locked = loginDialog?.dataset.locked === "1";
    const id = loginDialog?.dataset.pending || "";
    const roomId = loginDialog?.dataset.pendingRoom || "";
    const pendingShare = loginDialog?.dataset.pendingShare === "1";
    const pendingRelationship = loginDialog?.dataset.pendingRelationship || "";
    const pending = state.pendingCheckout;
    state.pendingCheckout = null;
    if (pendingShare && state.role) state.page = "role-detail";
    else if (locked && state.role) state.page = "role-detail";
    else if (!id && !pending) state.page = "profile";
    resetLoginDialog();
    if (loginDialog) {
      delete loginDialog.dataset.pending;
      delete loginDialog.dataset.pendingRoom;
      delete loginDialog.dataset.pendingShare;
      delete loginDialog.dataset.pendingRelationship;
    }
    loginDialog?.close();
    render();
    try {
      await load({ quiet: true });
      if (guideSeenLocally()) await postGuide("seen");
    } catch {}
    if (pending) return startCheckout(pending);
    if (id) return openCall(id, roomId);
    if (pendingRelationship) return openRelationship(pendingRelationship);
    if (pendingShare && state.role) return openSharePoster();
  }
  function openRole(role) {
    if (!role) return;
    state.role = role;
    state.page = "role-detail";
    render();
  }
  function intervalLabel(plan) {
    return ({ month: "月", quarter: "季", year: "年", lifetime: "永久" })[String(plan?.intervalUnit || "month")] || "期";
  }
  async function ensureBilling() {
    if (state.billing?.plans?.length && Array.isArray(state.billing?.topupPackages)) return state.billing;
    try { state.billing = (await api("/api/billing/summary")).billing || state.billing; } catch {}
    return state.billing;
  }
  function planShort(plan){return ({week:"周卡",month:"月卡",quarter:"季卡",year:"年卡",lifetime:"永久"})[String(plan?.intervalUnit||"")]||(plan?.name||"会员");}
  function moneyText(v){const n=Number(v||0);return Number.isInteger(n)?String(n):String(Math.round(n*100)/100);}
  function topupBonus(item){const amount=Number(item?.amount||0); const credits=Number(item?.credits||0); return Math.max(0, credits-Math.round(amount*100));}
  function topupHint(item, packages){
    const amount=Number(item?.amount||0); const credits=Number(item?.credits||0); const bonus=topupBonus(item);
    const ratio=amount?bonus/amount:0;
    const best=Math.max(0, ...packages.map((p)=>{const a=Number(p.amount||0); return a?topupBonus(p)/a:0;}));
    const n=credits.toLocaleString("zh-CN"); const b=bonus.toLocaleString("zh-CN");
    if(!bonus) return `基础档 · 到账 ${n} 积分，按原价充`;
    if(best && Math.abs(ratio-best)<0.001) return `最划算 · 加赠 ${b} 积分`;
    if(ratio>=10) return `大额加赠 · 多送 ${b} 积分`;
    if(ratio>=5) return `常用档 · 加赠 ${b} 积分`;
    return `小额加赠 · 多送 ${b} 积分`;
  }
  async function loadNotifications(force = false) {
    if (!token()) return [];
    if (!force && state.notifications.length) return state.notifications;
    state.notificationsLoading = true;
    state.notificationsError = "";
    try {
      const result = await api("/api/live/notifications");
      state.notifications = Array.isArray(result.notifications) ? result.notifications : [];
      state.notificationUnreadCount = Number(result.unreadCount || 0);
      return state.notifications;
    } catch (error) {
      state.notificationsError = error.message || "系统消息加载失败";
      return [];
    } finally {
      state.notificationsLoading = false;
    }
  }
  function notificationIcon(kind) {
    if (/gift|income/.test(kind)) return uiIcon("gift");
    if (/feedback|support/.test(kind)) return uiIcon("chat");
    return uiIcon("crown");
  }
  function showSystemMessages() {
    if (!token()) return askLogin();
    state.page = "system-messages";
    state.subpageBack = "messages";
    const loading = state.notificationsLoading && !state.notifications.length;
    const rows = state.notifications.map((item) => `<article class="notification-card${item.readAt ? "" : " unread"}" data-notification-id="${esc(item.id)}"><div class="notification-icon">${notificationIcon(item.kind)}</div><div><div class="notification-title"><b>${esc(item.title || "系统消息")}</b>${item.pinned ? "<span>置顶</span>" : ""}</div><p>${esc(item.body || "")}</p><small>${esc(moneyTime(item.createdAt))}</small></div>${item.readAt ? "" : "<i></i>"}</article>`).join("");
    subpage("系统消息", `<section class="notification-list">${loading ? '<div class="empty-state"><p>正在加载系统消息…</p></div>' : rows || `<div class="empty-state"><h2>暂时没有系统消息</h2><p>${esc(state.notificationsError || "签到、反馈回复和平台通知会显示在这里。")}</p></div>`}</section>`, "messages");
  }
  async function openSystemMessages() {
    if (!token()) return askLogin();
    state.page = "system-messages";
    state.subpageBack = "messages";
    showSystemMessages();
    await loadNotifications(true);
    if (state.page === "system-messages") showSystemMessages();
    if (state.notificationUnreadCount) {
      try {
        await api("/api/live/notifications/read-all", { method: "POST", body: "{}" });
        state.notificationUnreadCount = 0;
        state.notifications = state.notifications.map((item) => ({ ...item, readAt: item.readAt || new Date().toISOString() }));
        if (state.page === "system-messages") showSystemMessages();
      } catch {}
    }
  }
  function creatorIncomeTypeText(type) {
    return ({ video_view_earning: "视频通话分成", withdrawal_hold: "提现冻结", withdrawal_refund: "提现退回" })[type] || "创作者账本";
  }
  function creatorWithdrawalStatusText(status) {
    return ({ processing: "审核中", paid: "已打款", rejected: "已拒绝" })[status] || status || "审核中";
  }
  function showCreatorIncome() {
    if (!token()) return askLogin();
    state.page = "creator-income";
    state.subpageBack = "profile";
    const income = state.creatorIncome || { availableCredits: 0, totalEarnedCredits: 0, withdrawnCredits: 0, lockedCredits: 0, earningCount: 0, earningRate: .3, records: [], withdrawals: [] };
    const rows = (income.records || []).map((item) => {
      const earning = String(item.type || "") === "video_view_earning";
      const title = earning ? `${item.characterName || "角色"} · 视频通话分成` : creatorIncomeTypeText(item.type);
      const detail = earning ? `实扣 ${creditText(item.sourceCredits)} 积分 × ${Math.round(Number(item.earningRate || .3) * 100)}%` : moneyTime(item.createdAt);
      return { title, meta: `${detail} · ${moneyTime(item.createdAt)}`, amount: `${Number(item.credits || 0) >= 0 ? "+" : ""}${creditText(item.credits)}`, kind: earning ? "crown" : "wallet" };
    });
    const withdrawals = (income.withdrawals || []).map((item) => `<article class="creator-withdrawal-row"><div><b>${esc(creditText(item.amountCredits))} 积分</b><small>${esc(item.network || "USDT")} · ${esc(item.withdrawalAddress || "")}</small></div><span class="creator-withdrawal-status ${esc(item.status || "processing")}">${esc(creatorWithdrawalStatusText(item.status))}</span><small>${esc(moneyTime(item.createdAt))}${item.txHash ? ` · ${esc(item.txHash)}` : ""}${item.rejectionReason ? ` · ${esc(item.rejectionReason)}` : ""}</small></article>`).join("");
    const available = Number(income.availableCredits || 0);
    subpage("创作者收益", `<section class="income-hero"><span>可提现积分</span><strong>${creditText(available)} <small>积分</small></strong><p>累计收益 ${creditText(income.totalEarnedCredits)} 积分 · 已提现 ${creditText(income.withdrawnCredits)} 积分 · ${Number(income.earningCount || 0).toLocaleString("zh-CN")} 次分成</p></section><section class="income-settlement"><div><span>分成比例</span><b>${Math.round(Number(income.earningRate || .3) * 100)}%</b></div><div><span>审核中</span><b>${creditText(income.lockedCredits)} 积分</b></div><div><span>提现网络</span><b>USDT</b></div></section><section class="income-note"><span>${uiIcon("crown")}</span><p>视频通话实际扣除的积分，30% 作为角色创作者可提现收益。该收益独立计算，不累计到普通积分余额；提现通过 USDT 打款，需填写收款地址并等待后台审核。</p></section><section class="creator-withdraw-card"><div class="creator-withdraw-head"><div><b>申请提现</b><small>最低提现 2000 积分（20 USDT），提交后从可提现余额冻结</small></div><button type="button" data-action="creator-income-refresh">刷新</button></div><form data-creator-withdraw-form><label>提现积分<input name="amountCredits" type="number" min="2000" step="0.000001" value="${esc(available >= 2000 ? creditText(available) : "2000")}" placeholder="填写提现积分" required></label><label>USDT 网络<select name="network"><option value="USDT-TRC20">USDT · TRC20</option><option value="USDT-ERC20">USDT · ERC20</option><option value="USDT-BEP20">USDT · BEP20</option></select></label><label>USDT 收款地址<input name="address" type="text" autocomplete="off" autocapitalize="none" spellcheck="false" minlength="20" maxlength="128" placeholder="填写你的 USDT 钱包地址" required></label><button class="pay-cta" type="submit" ${available >= 2000 ? "" : "disabled"}>提交提现申请</button><p class="form-message" data-creator-withdraw-message></p></form></section><p class="section-label">收益流水</p>${state.creatorIncomeLoading && !income.records?.length ? '<div class="empty-state"><p>正在加载收益记录…</p></div>' : ledgerRows(rows, state.creatorIncomeError || "还没有视频通话收益。")}<p class="section-label">提现记录</p>${withdrawals ? `<section class="creator-withdrawal-list">${withdrawals}</section>` : '<div class="empty-state"><p>还没有提现申请。</p></div>'}<p class="pay-foot">收益数据来自 PostgreSQL 创作者独立账本，不会累加到普通积分余额。</p>`);
  }
  async function loadCreatorIncome(force = false) {
    if (!token()) return null;
    if (state.creatorIncome && !force) return state.creatorIncome;
    state.creatorIncomeLoading = true;
    state.creatorIncomeError = "";
    if (state.page === "creator-income") showCreatorIncome();
    try {
      const result = await api("/api/live/creator-income?limit=50");
      state.creatorIncome = result.income || { availableCredits: 0, totalEarnedCredits: 0, withdrawnCredits: 0, lockedCredits: 0, earningCount: 0, earningRate: .3, records: [], withdrawals: [] };
      return state.creatorIncome;
    } catch (error) {
      state.creatorIncomeError = error.message || "创作者收益加载失败";
      return null;
    } finally {
      state.creatorIncomeLoading = false;
      if (state.page === "creator-income") showCreatorIncome();
    }
  }
  function feedbackStatusText(status) {
    return ({ open: "待处理", processing: "处理中", resolved: "已解决", closed: "已关闭" })[status] || status || "待处理";
  }
  function showFeedback() {
    if (!token()) return askLogin();
    state.page = "feedback";
    state.subpageBack = "profile";
    const history = (state.feedbackMessages || []).map((item) => `<article class="feedback-card"><div class="feedback-card-head"><b>${esc(item.subject || "问题反馈")}</b><span class="feedback-status ${esc(item.status || "open")}">${esc(feedbackStatusText(item.status))}</span></div><p>${esc(item.message || "")}</p><small>${esc(moneyTime(item.createdAt))}</small>${item.reply ? `<div class="feedback-reply"><b>站内信回复</b><p>${esc(item.reply)}</p><small>${esc(moneyTime(item.repliedAt || item.updatedAt))}</small></div>` : ""}</article>`).join("");
    subpage("问题反馈", `<form class="feedback-form" data-feedback-form><label>问题类型<select name="subject"><option>功能异常</option><option>充值与订单</option><option>内容与体验</option><option>账号问题</option><option>其他建议</option></select></label><label>问题描述<textarea name="message" maxlength="5000" minlength="5" required placeholder="请描述发生了什么、在哪个页面、你期望的结果。"></textarea></label><button class="pay-cta feedback-submit" type="submit">提交反馈</button><p class="form-message" data-feedback-message></p></form><section class="feedback-history"><div class="feedback-history-head"><h2>我的反馈</h2><button type="button" data-action="feedback-refresh">刷新</button></div>${state.feedbackLoading && !history ? '<div class="empty-state"><p>正在加载反馈…</p></div>' : history || `<div class="empty-state"><h2>还没有提交过反馈</h2><p>${esc(state.feedbackError || "提交后会进入后台站内信，回复也会显示在这里。")}</p></div>`}</section>`);
  }
  async function loadFeedback(force = false) {
    if (!token()) return [];
    if (state.feedbackMessages.length && !force) return state.feedbackMessages;
    state.feedbackLoading = true;
    state.feedbackError = "";
    try {
      const result = await api("/api/support-messages?limit=30");
      state.feedbackMessages = Array.isArray(result.messages) ? result.messages : [];
      return state.feedbackMessages;
    } catch (error) {
      state.feedbackError = error.message || "反馈记录加载失败";
      return [];
    } finally {
      state.feedbackLoading = false;
      if (state.page === "feedback") showFeedback();
    }
  }

  function planHint(plan){
    const unit=String(plan?.intervalUnit||""); const price=moneyText(plan?.amount);
    if(unit==="year"){ const daily=Math.round(Number(plan.amount)/365*100)/100; return `年卡最划算，日均 $${moneyText(daily)}`; }
    if(unit==="week") return `周卡 $${price} · 尝鲜体验`;
    if(unit==="month") return `月卡 $${price} · 单次购买`;
    if(unit==="quarter") return `季卡 $${price} · 比月付更省`;
    if(unit==="lifetime") return `永久 $${price} · 一次解锁`;
    return `${planShort(plan)} $${price} · 单次购买`;
  }

  function vip(){
    const plans=(state.billing?.plans?.length?state.billing.plans:(state.config?.membership?.plans||[])).slice().sort((a,b)=>Number(a.amount)-Number(b.amount));
    const active=state.config?.membership?.active||state.billing?.subscription?.status==="active";
    const picked=plans.find((plan)=>String(plan.intervalUnit)==="year")||plans[plans.length-1]||plans[0];
    const week=plans.find((plan)=>String(plan.intervalUnit)==="week");
    const cards=plans.map((plan)=>{
      const month=plans.find((item)=>String(item.intervalUnit)==="month"); const unit=String(plan.intervalUnit); const base=unit==="month"&&week?Number(week.amount)*4:unit==="year"&&month?Number(month.amount)*12:0; const save=base?Math.max(0, Math.round((base-Number(plan.amount))*10)/10):0;
      return `<button type="button" class="pay-plan${plan.id===picked?.id?" selected":""}" data-plan-id="${esc(plan.id)}" data-plan-amount="${esc(moneyText(plan.amount))}" data-plan-name="${esc(planShort(plan))}" data-plan-tip="${esc(planHint(plan))}"><p>${esc(planShort(plan))}</p><b>$${esc(moneyText(plan.amount))}</b>${save?`<small>省 $${esc(moneyText(save))}</small>`:""}</button>`;
    }).join("")||`<p class="detail-empty">暂时没有可购买的订阅档位。</p>`;
    const rate=Number(state.config?.pricing?.saleCreditsPerMinute||0)||0;
    const freeSeconds=Number(state.config?.pricing?.freeSeconds||0)||0;
    const rateText=rate>0?`${creditText(rate)} 积分/分钟`:"以实际计费为准";
    const freeText=freeSeconds>0?`${freeSeconds} 秒`:"以实际计费为准";
    app.innerHTML=`<main class="live-page vip-page"><header class="sub-head"><button type="button" data-action="back-from-sub">‹</button><h1>订阅与权益</h1><button type="button" class="head-link" data-action="wallet">消费记录</button></header><section class="pay-hero"><div class="vip-card-title"><span>♔</span><div><strong>Vipeak VIP</strong><small>${active?"订阅已生效":"单次购买 · 解锁隐私互动"}</small></div></div><h2>${active?"会员权益正在生效":"开通即解锁隐私互动，和 TA 聊得更近一点"}</h2>${active?'<div class="vip-pills"><span>隐私互动已解锁</span></div>':""}</section><div class="plan-label-row"><p class="section-label">选择套餐</p><span data-plan-tip>${esc(picked?planHint(picked):"选择一个套餐")}</span></div><div class="pay-plans pay-plans-3">${cards}</div><button type="button" class="pay-cta" data-action="subscribe-selected">${picked?`立即开通 $${moneyText(picked.amount)} ${planShort(picked)}`:"立即开通"}</button><p class="pay-status" data-pay-status></p><p class="section-label">会员权益</p><section class="benefit-rows"><div><div><b>解锁隐私互动</b><small>私密相册与私密画面</small></div><em class="ok">已含</em></div><div><div><b>私密内容</b><small>角色详情里的锁定内容</small></div><em class="ok">已含</em></div><div><div><b>视频通话</b><small>会员不把通话改成免费，余额不够会挂断</small></div><em>${rateText}</em></div><div><div><b>免费试看</b><small>每个连接开始后</small></div><em>${freeText}</em></div><div><div><b>房间一起看</b><small>进入已有房间，不重复创建上游</small></div><em class="ok">可用</em></div></section></main>`;
  }
  function showRecharge(){
    state.pageReturn=state.pageReturn||(state.page==="role-detail"?"role-detail":(state.page==="vip"?"vip":"profile"));
    state.page="recharge";
    const packages=(state.billing?.topupPackages?.length?state.billing.topupPackages:(state.config?.topupPackages||[])).slice().sort((a,b)=>Number(a.amount)-Number(b.amount));
    const credits=Number(state.user?.credits||0);
    const rate=Math.max(0,Number(state.config?.pricing?.saleCreditsPerMinute??0)||0);
    const freeSeconds=Math.max(0,Number(state.config?.pricing?.freeSeconds??0)||0);
    const picked=packages[packages.length-1]||packages[0];
    const cards=packages.map((item)=>{
      const amount=Number(item.amount||0); const got=Number(item.credits||0); const bonus=topupBonus(item);
      const price=bonus?`$${moneyText(amount)} · 送 ${bonus.toLocaleString("zh-CN")}`:`$${moneyText(amount)}`;
      return `<button type="button" class="pay-plan${item.id===picked?.id?" selected":""}" data-topup-id="${esc(item.id)}" data-topup-amount="${esc(moneyText(amount))}" data-topup-tip="${esc(topupHint(item, packages))}"><p>${got.toLocaleString("zh-CN")}</p><small class="${bonus?"bonus":""}">${esc(price)}</small></button>`;
    }).join("")||`<p class="detail-empty">当前没有充值档位。</p>`;
    const tip=picked?topupHint(picked, packages):"";
    app.innerHTML=`<main class="live-page vip-page"><header class="sub-head"><button type="button" data-action="back-from-sub">‹</button><h1>钱包与计费</h1><button type="button" class="head-link" data-action="vip">订阅权益</button></header><section class="pay-hero"><div class="wallet-top"><span>我的积分</span><button type="button" data-action="vip">开通会员更划算</button></div><strong class="wallet-balance">${state.user?credits.toLocaleString("zh-CN"):"登录后显示"}</strong><div class="wallet-stats"><div><b>${rate>0?creditText(rate):"-"}</b><small>积分/分钟</small></div><div><b>${freeSeconds>0?`${freeSeconds} 秒`:"-"}</b><small>免费试看</small></div><div><b>10 秒</b><small>扣一次</small></div></div></section><p class="section-label">充值积分</p><div class="pay-plans pay-plans-3">${cards}</div><p class="pay-tip" data-pay-tip>${esc(tip)}</p><button type="button" class="pay-cta" data-action="pay-topup">${picked?`确认充值 $${moneyText(picked.amount)}`:"确认充值"}</button><p class="pay-status" data-pay-status></p><p class="section-label">聊天付费规则</p><section class="benefit-rows rule-rows"><div><span class="rule-ico pink">${uiIcon("chat")}</span><div><b>文字私信</b><small>按条计费 · 会员期内免文字费</small></div><em>0.5 积分/条</em></div><div><span class="rule-ico blue">${uiIcon("mic")}</span><div><b>语音通话 / 语音消息</b><small>按秒计费 · 会员 8 折</small></div><em class="blue">2 积分/秒</em></div><div><span class="rule-ico gold">${uiIcon("video")}</span><div><b>视频通话</b><small>按秒计费 · 创作者分成 30%</small></div><em class="gold">5 积分/秒</em></div><div><span class="rule-ico green">${uiIcon("users")}</span><div><b>陪伴房间</b><small>按秒计费 · 进房即开始计时</small></div><em class="green">5 积分/秒</em></div><div><span class="rule-ico pink">${uiIcon("gift")}</span><div><b>礼物打赏</b><small>私信与房间内均可赠送</small></div><button type="button" data-action="rooms">去房间</button></div></section><p class="section-label">最近消费</p><section class="ledger-card" data-recent-spend><div><div><b>正在读取</b><small>消费记录</small></div></div></section><p class="pay-foot">视频通话实扣积分的 30% 计入角色创作者独立收益，不进入普通积分余额。</p></main>`;
    loadRecentSpend();
  }



  function creditText(value) {
    const rounded = Math.round(Number(value || 0) * 10) / 10;
    return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
  }
  function textMessageCredits() {
    return Math.max(0, Number(state.config?.pricing?.textMessageCredits || 0) || 0);
  }
  function spendName(item) {
    if (item.characterName) return item.characterName;
    const title = String(item.title || "");
    const matched = title.match(/视频聊天\s*[·•]\s*(.+)$/);
    return matched ? matched[1].trim() : "";
  }
  function spendSeconds(item, group) {
    const fromMeta = Number(item.duration || 0);
    if (fromMeta > 0) return fromMeta;
    if (group && group.end > group.start) return Math.round((group.end - group.start) / 1000);
    return 0;
  }
  function formatDuration(seconds) {
    const n = Math.max(0, Math.round(Number(seconds) || 0));
    if (!n) return "";
    const minutes = Math.floor(n / 60);
    const rest = n % 60;
    if (minutes && rest) return `${minutes} 分 ${rest} 秒`;
    if (minutes) return `${minutes} 分钟`;
    return `${rest} 秒`;
  }
  function spendDisplayTitle(item, grouped, group) {
    const type = String(item.type || "");
    if (/gift/i.test(type)) {
      const name = item.giftName || item.title || "礼物";
      const count = Number(item.giftCount || item.count || 0);
      return count > 1 ? `送出礼物「${name}」× ${count}` : `送出礼物「${name}」`;
    }
    if (/character_chat/i.test(type)) {
      const who = spendName(item);
      const times = Number(group?.count || 1);
      return `${who ? `与${who}的文字对话` : "文字对话"}${times > 1 ? ` · ${times} 次` : ""}`;
    }
    const who = spendName(item);
    const dur = formatDuration(spendSeconds(item, group));
    if (who) return `与${who}的${/text/i.test(type) ? "文字私信" : "视频通话"}${dur ? ` · ${dur}` : ""}`;
    return spendTitle(item, grouped);
  }
  function spendPortrait(item) {
    const name = item.characterName || spendName(item);
    const id = item.characterId || "";
    const found = (state.chars || []).find((role) => (id && role.id === id) || (name && (role.name === name || role.displayName === name)));
    return found?.portraitUrl || found?.coverUrl || found?.imageUrl || item.portraitUrl || "";
  }
  function spendWhen(value) {
    const date = new Date(value || 0);
    if (Number.isNaN(date.getTime())) return "";
    const dayKey = (input) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit" }).format(input);
    const time = new Intl.DateTimeFormat("zh-CN", { timeZone: "Asia/Shanghai", hour: "2-digit", minute: "2-digit", hour12: false }).format(date);
    const today = dayKey(new Date());
    const yesterday = dayKey(new Date(Date.now() - 86400000));
    if (dayKey(date) === today) return `今天 ${time}`;
    if (dayKey(date) === yesterday) return `昨天 ${time}`;
    return moneyTime(date);
  }
  function ledgerInner(items, emptyTitle, emptyMeta) {
    if (!items.length) return `<div><span class="ledger-ico">${uiIcon("chat")}</span><div class="ledger-copy"><b>${esc(emptyTitle)}</b><small>${esc(emptyMeta || "")}</small></div></div>`;
    return items.map((item) => {
      const avatar = item.portraitUrl
        ? `<img src="${esc(item.portraitUrl)}" alt="">`
        : `<span class="ledger-ico">${uiIcon(item.kind === "gift" ? "gift" : "chat")}</span>`;
      return `<div>${avatar}<div class="ledger-copy"><b>${esc(item.title || "消费")}</b><small>${esc(item.meta || "")}</small></div><em>${esc(item.amount || "")}</em></div>`;
    }).join("");
  }
  function ledgerRows(items, empty) {
    if (!items.length) return `<div class="empty-state"><p>${esc(empty)}</p></div>`;
    return `<section class="ledger-card">${ledgerInner(items)}</section>`;
  }
  async function loadRecentSpend() {
    const box = document.querySelector("[data-recent-spend]");
    if (!box) return;
    if (!token()) {
      box.innerHTML = ledgerInner([], "登录后查看消费记录", "通话和礼物会记在这里");
      return;
    }
    try {
      const data = await api("/api/billing/spending?limit=200");
      const rows = groupSpend(data.records || []).slice(0, 3);
      box.innerHTML = ledgerInner(rows, "还没有消费记录", "通话和礼物会记在这里");
    } catch (error) {
      box.innerHTML = ledgerInner([], "消费记录没有加载出来", error.message || "请稍后重试");
    }
  }

  function spendSessionKey(item) {
    const type = String(item.type || "");
    const task = String(item.taskId || item.id || "");
    if (/character_chat/i.test(type)) return `text:${item.conversationId || item.id || task}`;
    if (/gift/i.test(type)) return `gift:${item.id || task}`;
    if (/chat_live/i.test(type) || /:hold:/i.test(task)) return `live:${item.sessionId || task.replace(/:(hold|hold-refund):.*$/i, "")}`;
    return `row:${item.id || task}`;
  }
  function spendTitle(item, grouped) {
    const type = String(item.type || "");
    if (/gift/i.test(type)) return item.giftName || item.title || "礼物";
    if (grouped || /chat_live/i.test(type)) return item.title || "视频聊天";
    return item.title || item.type || "消费";
  }
  function spendPeriod(start, end) {
    if (!start) return "";
    const a = new Date(start);
    const b = new Date(end || start);
    if (Number.isNaN(a.getTime())) return "";
    const fmt = (date, withDay) => new Intl.DateTimeFormat("zh-CN", { timeZone: "Asia/Shanghai", ...(withDay ? { month: "numeric", day: "numeric" } : {}), hour: "2-digit", minute: "2-digit", hour12: false }).format(date);
    const dayKey = (date) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
    const day = fmt(a, true);
    const endText = dayKey(a) === dayKey(b) ? fmt(b, false) : fmt(b, true);
    return start === end ? day : `${day} – ${endText}`;
  }
  function groupSpend(records) {
    const groups = new Map();
    for (const item of records || []) {
      if (Number(item.delta) > 0) continue;
      const key = spendSessionKey(item);
      const at = new Date(item.startedAt || item.createdAt || 0).getTime() || 0;
      const endAt = new Date(item.endedAt || item.createdAt || 0).getTime() || at;
      const amount = Math.abs(Number(item.amount) || 0);
      const current = groups.get(key);
      if (!current) groups.set(key, { key, item, start: at, end: endAt, amount, count: 1 });
      else {
        current.amount += amount;
        current.count += 1;
        current.start = Math.min(current.start, at || current.start);
        current.end = Math.max(current.end, endAt || current.end);
      }
    }
    return [...groups.values()].sort((a, b) => (b.end || 0) - (a.end || 0)).map((group) => {
      const item = group.item || {};
      const grouped = group.count > 1 || String(group.key).startsWith("live:");
      const name = spendName(item);
      return {
        ...item,
        characterName: name,
        title: spendDisplayTitle(item, grouped, group),
        meta: spendWhen(group.end || group.start),
        amount: group.amount ? `-${creditText(group.amount)}` : "",
        portraitUrl: spendPortrait({ ...item, characterName: name }),
        kind: /gift/i.test(String(item.type || "")) ? "gift" : "spend",
      };
    });
  }

  async function showWallet(kind) {
    if (!token()) return askLogin();
    state.page = "wallet";
    state.walletKind = kind || "spend";
    const title = kind === "topup" ? "充值记录" : kind === "gift" ? "礼物记录" : "钱包与消费记录";
    subpage(title, `<div class="empty-state"><p>正在加载…</p></div>`);
    try {
      if (kind === "topup") {
        const data = await api("/api/billing/topups?limit=30");
        const rows = (data.records || []).map((item) => ({
          title: `${item.asset || "USDT"} ${item.payableAmountText || item.amount || ""}`.trim(),
          meta: `${item.status || ""} ${moneyTime(item.createdAt)}`.trim(),
          amount: item.creditAmount ? `+${item.creditAmount}` : "",
        }));
        if (state.page === "wallet" && state.walletKind === kind) subpage(title, recordRows(rows, "还没有充值记录。"));
        return;
      }
      const data = await api("/api/billing/spending?limit=200");
      let records = data.records || [];
      if (kind === "gift") records = records.filter((item) => /gift/i.test(`${item.type || ""} ${item.title || ""} ${item.giftName || ""}`));
      const rows = groupSpend(records);
      if (state.page === "wallet" && state.walletKind === kind) subpage(title, ledgerRows(rows, kind === "gift" ? "还没有礼物记录。" : "还没有消费记录。"));
    } catch (error) {
      if (state.page === "wallet") subpage(title, `<div class="empty-state"><p>${esc(error.message)}</p></div>`);
    }
  }
  function topupOrderHtml(order) {
    if (!order) return "";
    return `<section class="benefit-list"><h3>待支付</h3><div><b>${esc(order.payableAmountText || order.payableAmount || "")} ${esc(order.asset || "")}</b><small>${esc(order.network || "")}</small><small>${esc(order.address || "")}</small></div></section><form data-topup-confirm><input name="hash" placeholder="转账后填写交易哈希" required /><button class="primary-button" type="submit">提交哈希</button><p data-topup-note></p></form>`;
  }
  function showTopup() {
    if (!token()) return askLogin();
    state.page = "topup";
    const packages = state.billing?.topupPackages || [];
    const cards = packages.length
      ? `<section class="plan-select"><div class="plan-cards">${packages.map((item) => `<button class="plan-option" data-topup-id="${esc(item.id)}"><strong>$${esc(item.amount)}</strong><b>${esc(item.credits)}</b><small>积分</small></button>`).join("")}</div></section>`
      : `<div class="empty-state"><p>当前没有可购买的充值档位。</p></div>`;
    subpage("充值", `${cards}${topupOrderHtml(state.topupOrder)}`);
  }
  function characterMatchesFilters(character) {
    const age = Number(character?.age || 0);
    const range = state.filters.age;
    if (range) {
      if (!age) return false;
      const [min, max] = range.split("-").map(Number);
      if (age < min || age > max) return false;
    }
    if (state.filters.gender && character?.gender !== state.filters.gender) return false;
    if (state.filters.style && character?.companionStyle !== state.filters.style) return false;
    return true;
  }
  function fmtWatch(n) {
    const count = Number(n || 0);
    return count >= 10000 ? `${(count / 10000).toFixed(1)}万` : String(count);
  }
  function plazaCard(room) {
    const c = room.character || {};
    const title = room.title || `${c.name || "角色"}的房间`;
    const kind = room.mode === "voice" ? "语音房" : "视频房";
    return `<article class="plaza-card" data-room-id="${esc(room.id || "")}" data-room-pending="${room.pending || !room.id ? "1" : "0"}" data-room-character-id="${esc(room.characterId)}"><div class="plaza-cover">${media(rolePhoto(c), `${title}封面`)}<span class="plaza-live"><i></i>LIVE</span><span class="plaza-kind">${esc(kind)}</span><p>${esc(title)}</p></div><div class="plaza-foot"><span>◉ ${fmtWatch(room.viewerCount)} 人在看</span><em>›</em></div></article>`;
  }
  function dateCard(character) {
    const tags = (character.tags || []).slice(0, 3);
    const meta = [Number(character.age) > 0 ? `${Number(character.age)}岁` : "", character.occupation || character.companionStyle || ""].filter(Boolean).join(" · ");
    const note = character.intro || character.greeting || character.description || "现在可以开始视频约会";
    return `<article class="date-card"><div class="date-cover">${media(rolePhoto(character), `${character.name || "角色"}的封面`)}</div><div class="date-copy"><div class="date-name">${esc(character.name || "角色")}</div>${meta ? `<div class="date-meta">${esc(meta)}</div>` : ""}<p>${esc(note)}</p><div class="date-tags">${tags.map((tag) => `<span>${esc(tag)}</span>`).join("")}</div><div class="date-actions"><button type="button" class="date-home" data-role-id="${esc(character.id)}">${media(rolePhoto(character), "头像")}<span>主页</span></button><button type="button" class="date-call" data-call-id="${esc(character.id)}">▣ 激情视频</button></div></div></article>`;
  }
  function showRooms(from) {
    if (from) state.roomsFrom = from;
    state.page = "rooms";
    const tab = state.roomTab === "single" ? "single" : "multi";
    const multi = state.rooms.filter((room) => characterMatchesFilters(room.character || {}));
    const single = state.chars.filter(characterMatchesFilters);
    const list = tab === "single"
      ? `<section class="date-panel"><div class="date-head"><p>♡ 1V1 私密互动，双向选择</p><span><i></i>${single.length} 人在线</span></div>${single.length ? `<div class="date-list">${single.map(dateCard).join("")}</div>` : `<div class="empty-state"><h2>没有可约会的角色</h2><p>换个筛选，或者先看看直播间。</p></div>`}<p class="room-end">没有更多可约会的角色了</p></section>`
      : `<section class="plaza-panel"><p class="plaza-note">◉ 正在直播 · 点开即刻进入</p>${multi.length ? `<div class="plaza-grid">${multi.map(plazaCard).join("")}</div>` : `<div class="empty-state"><h2>还没有直播间</h2><p>有人开了共享房间后会出现在这里。</p></div>`}<p class="room-end">没有更多房间了</p></section>`;
    app.innerHTML = `<main class="live-page rooms-page"><header class="rooms-top"><button class="icon-button" data-action="back-rooms" aria-label="返回">${uiIcon("back")}</button><h1>私密房间</h1><button type="button" class="rooms-filter" data-action="filter">${filterText()}</button></header><nav class="room-segment"><button type="button" class="${tab === "multi" ? "selected" : ""}" data-room-tab="multi">直播间</button><button type="button" class="${tab === "single" ? "selected" : ""}" data-room-tab="single">视频约会</button></nav>${list}</main>${nav(state.roomsFrom === "profile" ? "profile" : (state.roomsFrom === "home" ? "home" : "messages"))}`;
  }
  function showPrivacy() {
    state.page = "privacy";
    state.subpageBack = "profile";
    const u = state.user;
    const account = u ? `<section class="privacy-block"><h3>当前账号</h3><p>登录账号是 <b>${esc(u.username || "")}</b>。昵称只用于页面展示，修改昵称不会改变登录账号。这个账号与主站共用，退出只退出本站登录状态。</p></section>` : `<section class="privacy-block"><h3>当前账号</h3><p>未登录也可以查看这份说明。登录后可以在这里核对登录账号和昵称。</p></section>`;
    subpage("隐私与安全", `${account}
      <section class="privacy-block"><h3>我们保存什么</h3><p>账号、登录凭证、昵称和资料、积分与支付记录、你和角色的文字对话、视频通话连接记录。视频画面由实时通道传输，不作为公开内容保存。支付由收银台处理，我们只保存订单状态和积分结果，不保存完整银行卡号。</p></section>
      <section class="privacy-block"><h3>这些信息用来做什么</h3><p>用来登录、扣积分、恢复对话记忆、处理充值和客服排查。不会把对话拿去卖，也不会拿去给无关的人看。排查故障时，工作人员只能看到连接记录和必要的错误信息。</p></section>
      <section class="privacy-block"><h3>对话与视频</h3><p>文字对话会按角色保存，方便下次接着聊。视频通话按次记录时长和扣费。房间里的发言只在当前房间内展示。私密模式和会员内容只对已开通的账号开放。</p></section>
      <section class="privacy-block"><h3>账号安全</h3><p>请不要把登录密码发给任何人，包括自称客服的人。本站是 18 岁以上内容。发现账号异常，先退出登录，再到主站修改密码。改密码、绑定邮箱不在这个页面操作。</p></section>
      <section class="privacy-block"><h3>你可以做什么</h3><p>可以随时改昵称、退出登录、停止充值。如果要删除对话或账号，联系主站客服并提供登录账号。删除后，未完成的订单和已消耗的积分不会自动退回。</p></section>
      ${u ? `<button class="logout-link" data-action="account">退出登录</button>` : ""}`);
  }

  (function consumeGoogleRedirect() {
    if (!GOOGLE_LOGIN_VISIBLE) return;
    const hash = String(location.hash || "");
    if (!hash.includes("id_token=")) return;
    const token = new URLSearchParams(hash.slice(1)).get("id_token");
    history.replaceState(null, "", location.pathname + location.search);
    if (token) acceptGoogleCredential(token).catch((error) => loginMessage(error.message || "Google 登录失败"));
  })();

  async function loadCreator() {
    if (!token()) return;
    state.creatorLoading = true;
    try {
      const data = await api("/api/chat-live/creator/characters");
      state.creatorList = data.characters || [];
    } catch (error) {
      state.creatorError = error.message || "加载失败";
    } finally {
      state.creatorLoading = false;
      if (state.page === "creator" || state.page === "create") render();
    }
  }
  function creatorListPage() {
    if (!state.user) {
      app.innerHTML = `<main class="live-page edit-page"><header class="edit-header"><button data-action="back-profile">返回</button><h1>创作者</h1><span></span></header><section class="edit-section"><p>登录后可以上传自己的角色。</p><button class="primary-button" data-action="ask-login">登录</button></section></main>`;
      return;
    }
    const list = state.creatorList || [];
    app.innerHTML = `<main class="live-page edit-page creator-page"><header class="edit-header"><button data-action="back-profile">返回</button><h1>创作者</h1><button data-action="creator-new">新建</button></header><section class="edit-section"><p class="creator-note">配置和后台在线聊天角色一样。角色会记录为你创建，上架后会出现在首页。</p>${state.creatorError ? `<p class="creator-error">${esc(state.creatorError)}</p>` : ""}${state.creatorLoading ? `<p>加载中…</p>` : ""}${list.length ? `<div class="creator-list">${list.map((item) => `<button type="button" class="creator-card" data-action="creator-edit" data-id="${esc(item.id)}"><img src="${esc(item.portraitUrl || item.avatarUrl || "")}" alt="" /><div><b>${esc(item.name || "未命名")}</b><small>${item.enabled === false ? "已下架" : "已上架"} · ${esc(item.createdByUsername || "")}</small></div></button>`).join("")}</div>` : `<p>还没有角色。</p>`}</section></main>`;
  }
  function creatorVoiceOptions(list, selected) {
    const rows = Array.isArray(list) ? list : [];
    const current = String(selected || "");
    const has = rows.some((item) => String(item.id || item.voice || item.voiceType || "") === current);
    const head = current && !has ? `<option value="${esc(current)}" selected>${esc(current)}</option>` : `<option value="">请选择</option>`;
    return head + rows.map((item) => {
      const id = String(item.id || item.voice || item.voiceType || "");
      const label = item.name || item.label || id;
      return `<option value="${esc(id)}" ${id === current ? "selected" : ""}>${esc(label)}</option>`;
    }).join("");
  }
  async function openCreatorEditor(id = "") {
    if (!token()) return askLogin();
    state.page = "creator-edit";
    state.creatorDraft = null;
    state.creatorError = "";
    render();
    try {
      const [chars, realtime, component] = await Promise.all([
        api("/api/chat-live/creator/characters"),
        api("/api/chat-live/creator/voices?scope=realtime"),
        api("/api/chat-live/creator/voices?scope=component"),
      ]);
      state.creatorList = chars.characters || [];
      state.creatorVoices = { realtime: realtime.voices || [], component: component.voices || [] };
      state.creatorDraft = id ? (state.creatorList.find((item) => item.id === id) || null) : {
        name: "", age: 23, occupation: "", language: "zh", tags: [], sortOrder: 0, intro: "", linkName: "", greeting: "", mode: "", personaEnhance: false, sharedRoomEnabled: false, enabled: false, personaMd: "", replyStyle: "", voiceType: "", componentVoiceType: "", voiceProvider: "", album: [], avatarUrl: "", portraitUrl: "",
      };
      if (id && !state.creatorDraft) state.creatorError = "角色不存在或不是你创建的。";
    } catch (error) {
      state.creatorError = error.message || "加载失败";
    }
    if (state.page === "creator-edit") render();
  }
  function creatorEditor() {
    const value = state.creatorDraft;
    if (!value) {
      app.innerHTML = `<main class="live-page edit-page"><header class="edit-header"><button data-action="creator">返回</button><h1>${state.creatorDraftId ? "编辑角色" : "新建角色"}</h1><span></span></header><section class="edit-section"><p>${esc(state.creatorError || "加载中…")}</p></section></main>`;
      return;
    }
    const album = Array.isArray(value.album) ? value.album : [];
    app.innerHTML = `<main class="live-page edit-page creator-page"><header class="edit-header"><button data-action="creator">返回</button><h1>${value.id ? "编辑角色" : "新建角色"}</h1><button data-action="creator-save">保存</button></header><form id="creatorForm" class="creator-form"><section class="edit-section"><h3>形象</h3><label class="creator-upload">形象图<input type="file" accept="image/*" data-creator-upload="avatar" /></label>${value.avatarUrl ? `<img class="creator-preview" src="${esc(value.avatarUrl)}" alt="" />` : `<p>请上传形象图</p>`}<button type="button" data-action="creator-undress" ${value.id && value.avatarUrl ? "" : "disabled"}>生成私密图</button><p class="creator-note">${esc(value.undressStatus === "generating" ? "私密图生成中，保存后可刷新查看。" : value.undressImageUrl ? "私密图已生成。" : value.undressError || "先保存角色，再生成私密图。")}</p><label class="creator-upload">列表头像<input type="file" accept="image/*" data-creator-upload="portrait" /></label>${value.portraitUrl ? `<img class="creator-preview" src="${esc(value.portraitUrl)}" alt="" />` : ""}</section><section class="edit-section creator-grid"><label>角色名称<input name="name" value="${esc(value.name || "")}" maxlength="60" required /></label><label>年龄<input name="age" type="number" min="18" max="80" value="${esc(value.age || "")}" /></label><label>职业<input name="occupation" value="${esc(value.occupation || "")}" maxlength="40" /></label><label>语言<input name="language" value="${esc(value.language || "zh")}" /></label><label>标签<input name="tags" value="${esc((value.tags || []).join(","))}" placeholder="温柔,御姐" /></label><label>排序<input name="sortOrder" type="number" value="${esc(value.sortOrder ?? 0)}" /></label><label class="span2">介绍<input name="intro" value="${esc(value.intro || "")}" maxlength="600" /></label><label class="span2">关联平台角色名<input name="linkName" value="${esc(value.linkName || "")}" /></label><label>开场白<input name="greeting" value="${esc(value.greeting || "")}" /></label><label>对话模式<select name="mode"><option value="">跟随全局默认</option><option value="realtime" ${value.mode === "realtime" ? "selected" : ""}>实时版</option><option value="component" ${value.mode === "component" ? "selected" : ""}>组件版</option></select></label><label class="check"><input name="personaEnhance" type="checkbox" ${value.personaEnhance ? "checked" : ""} />人设增强</label><label class="check"><input name="sharedRoomEnabled" type="checkbox" ${value.sharedRoomEnabled ? "checked" : ""} />支持多人房间</label></section><section class="edit-section"><h3>音色</h3><label>实时版<select name="voiceType" data-provider="${esc(value.voiceProvider || "")}">${creatorVoiceOptions(state.creatorVoices?.realtime, value.voiceType)}</select></label><label>组件版<select name="componentVoiceType">${creatorVoiceOptions(state.creatorVoices?.component, value.componentVoiceType)}</select></label><label>口吻<textarea name="replyStyle" rows="4" maxlength="4000">${esc(value.replyStyle || "")}</textarea></label><label>人设 Markdown<textarea name="personaMd" rows="10">${esc(value.personaMd || "")}</textarea></label><label class="creator-upload">导入 MD<input type="file" accept=".md,text/markdown,text/plain" data-creator-md="1" /></label></section><section class="edit-section"><h3>相册</h3><div id="creatorAlbum">${album.map((item, index) => `<div class="creator-album-row" data-album-index="${index}"><img src="${esc(item.thumbnailUrl || item.url || "")}" alt="" /><input data-album-name value="${esc(item.name || "")}" /><select data-album-type><option value="image" ${item.type !== "video" ? "selected" : ""}>图片</option><option value="video" ${item.type === "video" ? "selected" : ""}>视频</option></select><label><input data-album-locked type="checkbox" ${item.locked ? "checked" : ""} />锁定</label><button type="button" data-action="creator-album-remove">删除</button><input type="hidden" data-album-url value="${esc(item.url || "")}" /></div>`).join("")}</div><label class="creator-upload">添加图片<input type="file" accept="image/*" data-creator-upload="private-image" /></label><label class="creator-upload">添加视频<input type="file" accept="video/mp4,video/webm" data-creator-upload="private-video" /></label><p class="creator-note" data-creator-status></p></section></form></main>`;
  }
  function readCreatorForm() {
    const form = document.getElementById("creatorForm");
    if (!form) return null;
    const val = (name) => form.querySelector(`[name="${name}"]`)?.value ?? "";
    const voice = form.querySelector("[name=voiceType]");
    const selectedVoice = (state.creatorVoices?.realtime || []).find((item) => String(item.id || item.voice || item.voiceType || "") === voice?.value);
    return {
      ...(state.creatorDraft || {}),
      name: val("name"),
      age: Number(val("age") || 0),
      occupation: val("occupation"),
      language: val("language"),
      tags: val("tags"),
      sortOrder: Number(val("sortOrder") || 0),
      intro: val("intro"),
      linkName: val("linkName"),
      greeting: val("greeting"),
      mode: val("mode"),
      personaEnhance: form.querySelector("[name=personaEnhance]")?.checked === true,
      sharedRoomEnabled: form.querySelector("[name=sharedRoomEnabled]")?.checked === true,
      enabled: state.creatorDraft?.id ? state.creatorDraft.enabled !== false : false,
      voiceType: val("voiceType"),
      voiceProvider: selectedVoice?.provider || state.creatorDraft?.voiceProvider || "",
      componentVoiceType: val("componentVoiceType"),
      replyStyle: val("replyStyle"),
      personaMd: val("personaMd"),
      persona: val("personaMd"),
      album: Array.from(form.querySelectorAll(".creator-album-row")).map((row, index) => ({
        id: state.creatorDraft?.album?.[index]?.id || `album-${Date.now()}-${index}`,
        name: row.querySelector("[data-album-name]")?.value || `相册 ${index + 1}`,
        type: row.querySelector("[data-album-type]")?.value === "video" ? "video" : "image",
        url: row.querySelector("[data-album-url]")?.value || "",
        locked: row.querySelector("[data-album-locked]")?.checked === true,
        enabled: true,
      })).filter((item) => item.url),
    };
  }
  async function uploadCreatorAsset(file, kind) {
    const dataUrl = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ""));
      reader.onerror = () => reject(new Error("读取文件失败"));
      reader.readAsDataURL(file);
    });
    return api("/api/chat-live/creator/assets", { method: "POST", body: JSON.stringify({ dataUrl, kind }) });
  }
  async function saveCreator() {
    const body = readCreatorForm();
    if (!body) return;
    const status = document.querySelector("[data-creator-status]");
    if (status) status.textContent = "保存中…";
    try {
      const saved = body.id
        ? await api(`/api/chat-live/creator/characters/${encodeURIComponent(body.id)}`, { method: "PUT", body: JSON.stringify(body) })
        : await api("/api/chat-live/creator/characters", { method: "POST", body: JSON.stringify(body) });
      state.creatorDraft = saved.character;
      state.creatorError = "";
      if (status) status.textContent = "已保存";
    } catch (error) {
      if (status) status.textContent = error.message || "保存失败";
    }
  }


  function render() { syncLoginCopy(); setupGoogleLogin(); if (state.page === "messages") messages(); else if (state.page === "create") { createCards(); if (state.user && !state.creatorList && !state.creatorLoading) loadCreator(); } else if (state.page === "create-edit") createEditor(); else if (state.page === "profile") profile(); else if (state.page === "edit-profile") editProfile(); else if (state.page === "relationship") relationshipPage(); else if (state.page === "level") levelPage(); else if (state.page === "vip") vip(); else if (state.page === "recharge") showRecharge(); else if (state.page === "wallet") showWallet(state.walletKind || "spend"); else if (state.page === "topup") showTopup(); else if (state.page === "rooms") showRooms(); else if (state.page === "privacy") showPrivacy(); else if (state.page === "creator") creatorListPage(); else if (state.page === "creator-edit") creatorEditor(); else if (state.page === "creator-income") showCreatorIncome(); else if (state.page === "feedback") showFeedback(); else if (state.page === "system-messages") showSystemMessages(); else if (state.page === "checkin") showCheckin(); else if (state.page === "settings") showSettings(); else if (state.page === "referral") showReferral(); else if (state.page === "text-chat") showTextChat(); else if (state.page === "role-detail" && state.role) roleDetail(state.role); else { home(); bindHomeFilter(); } showGuideOverlay(); }

  function groupCharacterThreads(listed, contacts) {
    const groups = new Map();
    const touch = (key, patch) => {
      const current = groups.get(key) || { characterId: key, id: "", character: { id: key }, updatedAt: "", updatedAtMs: 0, hasText: false, hasVideo: false };
      const at = new Date(patch.updatedAt || 0).getTime() || 0;
      if (patch.character) current.character = { ...current.character, ...patch.character, id: key };
      if (patch.name && !current.character.name) current.character.name = patch.name;
      if (patch.portraitUrl) {
        current.character.portraitUrl = current.character.portraitUrl || patch.portraitUrl;
        current.character.avatarUrl = current.character.avatarUrl || patch.portraitUrl;
      }
      if (at >= current.updatedAtMs) {
        current.updatedAt = patch.updatedAt || current.updatedAt;
        current.updatedAtMs = at;
        if (patch.preview) current.preview = patch.preview;
        if (patch.lastMessage) current.lastMessage = patch.lastMessage;
      }
      if (patch.textId && (!current.id || String(current.id).startsWith("live-contact-") || at >= current.updatedAtMs)) current.id = patch.textId;
      if (patch.video) current.hasVideo = true;
      if (patch.textId) {
        current.hasText = true;
        if (!current.textAt || at >= current.textAt) {
          current.textAt = at;
          current.textPreview = patch.preview || "";
        }
      }
      current.title = current.character.name || current.title || "对话";
      groups.set(key, current);
    };
    for (const item of listed || []) {
      const key = String(item.characterId || item.character?.id || "");
      if (!key) continue;
      const last = item.lastMessage;
      const preview = typeof last === "string" ? last : (last?.content || item.preview || "文字对话");
      touch(key, { updatedAt: item.updatedAt || item.createdAt, character: item.character || {}, name: item.title, preview, lastMessage: last, textId: item.id });
    }
    for (const item of contacts || []) {
      const key = String(item.characterId || "");
      if (!key) continue;
      touch(key, { updatedAt: item.updatedAt, character: { id: key, name: item.name, portraitUrl: item.portraitUrl, avatarUrl: item.portraitUrl }, name: item.name, portraitUrl: item.portraitUrl, preview: "视频连线", lastMessage: { content: "视频连线" }, video: true });
    }
    return [...groups.values()].map((item) => {
      if (!item.id) item.id = `live-contact-${item.characterId}`;
      if (item.hasText && item.hasVideo) {
        const textPreview = item.textPreview && item.textPreview !== "视频连线" ? item.textPreview : "";
        item.preview = textPreview ? `视频连线 · ${textPreview}` : "视频连线";
      }
      return item;
    }).sort((a, b) => b.updatedAtMs - a.updatedAtMs);
  }

  async function load(options = {}) {
    const quiet = options.quiet === true;
    const loadToken = token(); if (!quiet) app.innerHTML = '<div class="empty-state">正在加载在线角色…</div>';
    try { state.config = await window.ChatLive.loadConfig(true); state.chars = window.ChatLive.characters(); try { state.rooms = ((await api("/api/chat-live/rooms")).rooms || []).slice().sort((a, b) => Number(b.activeCount || b.viewerCount || 0) - Number(a.activeCount || a.viewerCount || 0)); } catch { state.rooms = []; } render(); }
    catch (e) { app.innerHTML = `<div class="empty-state"><h2>暂时无法加载</h2><p>${esc(e.message)}</p></div>`; }
    if (loadToken && loadToken === token()) {
      try {
        const session = await api("/api/auth/me");
        state.user = session.user || null;
        if (!state.user) {
          localStorage.removeItem(TOKEN_KEY);
          state.companionLevel = null;
          state.billing = null;
          render();
          return;
        }
        state.companionLevel = state.user?.companionLevel || null;
        try { state.billing = (await api("/api/billing/summary")).billing || null; } catch {}
        const [notifications, checkin, income, feedback] = await Promise.allSettled([
          api("/api/live/notifications"),
          api("/api/live/checkin"),
          api("/api/live/creator-income?limit=50"),
          api("/api/support-messages?limit=30"),
        ]);
        if (notifications.status === "fulfilled") { state.notifications = notifications.value.notifications || []; state.notificationUnreadCount = Number(notifications.value.unreadCount || 0); }
        else state.notificationsError = notifications.reason?.message || "系统消息加载失败";
        if (checkin.status === "fulfilled") { state.checkin = checkin.value.checkin || null; if (checkin.value.user) state.user = checkin.value.user; }
        else state.checkinError = checkin.reason?.message || "签到信息加载失败";
        if (income.status === "fulfilled") state.creatorIncome = income.value.income || null;
        else state.creatorIncomeError = income.reason?.message || "创作者收益加载失败";
        if (feedback.status === "fulfilled") state.feedbackMessages = feedback.value.messages || [];
        else state.feedbackError = feedback.reason?.message || "反馈记录加载失败";
        const listed = (await api("/api/chat/conversations")).conversations || [];
        let contacts = [];
        try { contacts = (await api("/api/chat-live/contacts")).contacts || []; } catch {}
        state.conversations = groupCharacterThreads(listed, contacts);
      } catch (error) {
        if (error.status === 401) {
          localStorage.removeItem(TOKEN_KEY);
          state.user = null;
          state.companionLevel = null;
          state.billing = null;
          render();
          return;
        }
      }
      if (loadToken === token()) render();
    }
  }
  function openCall(id, roomId = "", sharedRoom = false) {
    const c = state.chars.find((x) => String(x.id) === String(id)) || state.role;
    if (!c) return referralToast("角色信息还没加载完成，请稍后重试");
    if (!token()) return askLogin({ characterId: c.id, roomId });
    if (!window.ChatLive?.open) return referralToast("视频服务还在加载，请刷新后重试");
    Promise.resolve(window.ChatLive.open(c.id, roomId ? { roomId } : (sharedRoom ? { sharedRoom: true } : {}))).catch((error) => referralToast(error?.message || "视频聊天没有接通，请稍后重试"));
  }
  async function saveProfile(form) { try { const result = await api("/api/account/profile", { method: "PATCH", body: JSON.stringify({ nickname: form.nickname.value.trim(), gender: form.gender.value, birthday: form.birthday.value, occupation: form.occupation.value, city: form.city.value, bio: form.bio.value, interests: form.interests.value ? form.interests.value.split("|").filter(Boolean) : [], profilePhotos: state.user.profilePhotos || [] }) }); state.user = result.user; state.page = "profile"; render(); } catch (error) { form.querySelector("[data-profile-message]").textContent = error.message; } }
    app.addEventListener("change", async (e) => {
    const createUpload = e.target.closest("[data-create-upload]");
    if (createUpload?.files?.[0]) {
      const file = createUpload.files[0];
      createUpload.value = "";
      if (!/^image\/(png|jpeg|webp)$/.test(file.type) || file.size > 8 * 1024 * 1024) { state.createError = "请上传 8MB 以内的 PNG、JPG 或 WEBP 图片。"; createEditor(); return; }
      try {
        const result = await uploadCreatorAsset(file, "avatar");
        readCreateDraftFromForm();
        createDraft().avatarUrl = result.url || "";
        createEditor();
      } catch (error) { state.createError = error.message || "上传失败"; createEditor(); }
      return;
    }
    const upload = e.target.closest("[data-creator-upload]");
    const md = e.target.closest("[data-creator-md]");
    if (!upload && !md) return;
    const note = document.querySelector("[data-creator-status]");
    try {
      if (md) {
        const file = md.files?.[0];
        if (!file) return;
        const text = await file.text();
        const box = document.querySelector("[name=personaMd]");
        if (box) box.value = text.slice(0, 50000);
        if (note) note.textContent = "人设已导入";
        return;
      }
      const file = upload.files?.[0];
      if (!file) return;
      if (note) note.textContent = "上传中…";
      const kind = upload.dataset.creatorUpload;
      const result = await uploadCreatorAsset(file, kind);
      state.creatorDraft = readCreatorForm() || state.creatorDraft || {};
      if (kind === "avatar") state.creatorDraft.avatarUrl = result.url;
      else if (kind === "portrait") state.creatorDraft.portraitUrl = result.url;
      else state.creatorDraft.album = [...(state.creatorDraft.album || []), { id: `album-${Date.now()}`, name: file.name.replace(/\.[^.]+$/, ""), type: kind === "private-video" ? "video" : "image", url: result.url, locked: false, enabled: true }];
      if (state.page === "creator-edit") render();
    } catch (error) {
      if (note) note.textContent = error.message || "上传失败";
    }
  });
document.addEventListener("click", async (e) => {
    const call = e.target.closest("[data-call-id]")?.dataset.callId;
    if (call) { e.stopPropagation(); return openCall(call); }
    const room = e.target.closest("[data-room-id]");
    if (room && !e.target.closest("button")) {
      const characterId = room.dataset.roomCharacterId;
      if (!token()) { loginDialog.dataset.pending = characterId; loginDialog.dataset.pendingRoom = room.dataset.roomId || ""; loginDialog.showModal(); return; }
      return openCall(characterId, room.dataset.roomId || "", room.dataset.roomPending === "1");
    }
    const roleId = e.target.closest("[data-role-id]")?.dataset.roleId;
    if (roleId && !e.target.closest("[data-call-id]")) { openRole(state.chars.find((x) => String(x.id) === String(roleId))); return; }
    const roomTab = e.target.closest("[data-room-tab]")?.dataset.roomTab;
    if (roomTab) { state.roomTab = roomTab; showRooms(); return; }
    const filterButton = e.target.closest("[data-filter-key]");
    if (filterButton) { state.filters[filterButton.dataset.filterKey] = filterButton.dataset.filterValue || ""; filterButton.parentElement?.querySelectorAll("[data-filter-key]").forEach((button) => button.classList.toggle("selected", button === filterButton)); return; }
    const lang = e.target.closest("[data-language]")?.dataset.language;
    if (lang) { state.language = lang; localStorage.setItem("vipeakLanguage", lang); render(); return; }
    const createTag = e.target.closest("[data-create-tag]")?.dataset.createTag;
    if (createTag) { readCreateDraftFromForm(); const d = createDraft(); d.tags = d.tags.includes(createTag) ? d.tags.filter((x) => x !== createTag) : (d.tags.length >= 3 ? d.tags : [...d.tags, createTag]); createEditor(); return; }
    const createVoice = e.target.closest("[data-create-voice]")?.dataset.createVoice;
    if (createVoice) { readCreateDraftFromForm(); createDraft().voiceType = createVoice; createEditor(); return; }
    const createRelation = e.target.closest("[data-create-relation]")?.dataset.createRelation;
    if (createRelation) { readCreateDraftFromForm(); createDraft().relation = createRelation; createEditor(); return; }
    const createVisibility = e.target.closest("[data-create-visibility]")?.dataset.createVisibility;
    if (createVisibility) { readCreateDraftFromForm(); createDraft().visibility = createVisibility; createEditor(); return; }
    if (e.target.closest("[data-action=close-sheet]") && !e.target.closest("[data-sheet]")) { e.target.closest(".sheet-backdrop")?.remove(); return; }
    const n = e.target.closest("[data-nav]")?.dataset.nav;
    if (n) { clearProfileHash(); state.page = n; render(); return; }
    const cid = e.target.closest("[data-conversation-id]")?.dataset.conversationId;
    if (cid) { const row = e.target.closest("[data-conversation-id]"); const characterId = row?.dataset.characterId || (String(cid).startsWith("live-contact-") ? cid.slice("live-contact-".length) : ""); const role = state.chars.find((item) => String(item.id) === String(characterId)); if (role) state.role = role; else if (characterId) state.role = { id: characterId, name: row?.querySelector(".conversation-name")?.textContent || "对话" }; if (String(cid).startsWith("live-contact-")) openTextChat(""); else openTextChat(cid); return; }
    const payPlan = e.target.closest(".pay-plan");
    if (payPlan) { payPlan.parentElement?.querySelectorAll(".pay-plan").forEach((node) => node.classList.toggle("selected", node === payPlan)); const cta=document.querySelector(".pay-cta"); if (cta && payPlan.dataset.planId){ cta.textContent=`立即开通 $${payPlan.dataset.planAmount} ${payPlan.dataset.planName||""}`.trim(); const tip=document.querySelector("[data-plan-tip]"); if(tip && payPlan.dataset.planTip) tip.textContent=payPlan.dataset.planTip; } if (cta && payPlan.dataset.topupId){ cta.textContent=`确认充值 $${payPlan.dataset.topupAmount}`; const tip=document.querySelector("[data-pay-tip]"); if(tip) tip.textContent=payPlan.dataset.topupTip||""; } return; }
    const planBtn = e.target.closest(".plan-option"); if (planBtn && !planBtn.dataset.topupId) { document.querySelectorAll(".plan-option").forEach((node) => node.classList.toggle("selected", node === planBtn)); return; }
    const a = e.target.closest("[data-action]")?.dataset.action;
    if (a === "language-sheet") return languageSheet();
    if (a === "checkin") { showCheckin(); loadCheckin(true); return; }
    if (a === "checkin-claim") return claimCheckin();
    if (a === "settings") return showSettings();
    if (a === "system-messages") return openSystemMessages();
    if (a === "creator-income") { if (!token() || !state.user) return askLogin(); state.page = "creator-income"; state.subpageBack = "profile"; showCreatorIncome(); loadCreatorIncome(true); return; }
    if (a === "creator-income-refresh") { loadCreatorIncome(true); return; }
    if (a === "feedback") { if (!token() || !state.user) return askLogin(); state.page = "feedback"; state.subpageBack = "profile"; showFeedback(); loadFeedback(true); return; }
    if (a === "feedback-refresh") return loadFeedback(true);
    if (a === "back-subpage") { clearProfileHash(); state.page = state.subpageBack || "profile"; render(); return; }
    if (a === "settings-ios") { referralToast("iOS 版正在准备中，可先使用网页版"); return; }
    if (a === "filter") return filterSheet();
    if (a === "filter-reset") { state.filters = { age: "", gender: "", style: "" }; e.target.closest(".sheet-backdrop")?.remove(); render(); return; }
    if (a === "filter-apply") { e.target.closest(".sheet-backdrop")?.remove(); render(); return; }
    const giftPick = e.target.closest("[data-gift-id]");
    if (giftPick && !giftPick.disabled) { sendTextGift(giftPick.dataset.giftId, giftPick.dataset.giftCost); return; }
    if (a === "close-sheet") { e.target.closest(".sheet-backdrop")?.remove(); return; }
    if (a === "refresh") return load();
    if (a === "shuffle") { state.homeBatchKey = ""; state.homeShuffle = (state.homeShuffle || 0) + 1; render(); return; }
    if (a === "back-home") { state.category = ""; state.role = null; state.page = "home"; render(); return; }
    if (a === "back-profile") { clearProfileHash(); state.page = "profile"; render(); return; }
    if (a === "edit-profile") { state.page = "edit-profile"; render(); return; }
    if (a === "creator") { if (!token() || !state.user) return askLogin(); state.page = "creator"; state.creatorError = ""; render(); loadCreator(); return; }
    if (a === "creator-new") { openCreatorEditor(""); return; }
    if (a === "creator-edit") { openCreatorEditor(e.target.closest("[data-id]")?.dataset.id || ""); return; }
    if (a === "creator-save") { saveCreator(); return; }
    if (a === "creator-undress") { const id = state.creatorDraft?.id; if (!id) { const note = document.querySelector("[data-creator-status]"); if (note) note.textContent = "请先保存角色。"; return; } api(`/api/chat-live/creator/characters/${encodeURIComponent(id)}/undress`, { method: "POST", body: "{}" }).then(() => { const note = document.querySelector("[data-creator-status]"); if (note) note.textContent = "私密图生成中。"; }).catch((error) => { const note = document.querySelector("[data-creator-status]"); if (note) note.textContent = error.message || "生成失败"; }); return; }
    if (a === "creator-album-remove") { const row = e.target.closest(".creator-album-row"); row?.remove(); return; }
    if (a === "create-new") { openCreateEditor(); return; }
    if (a === "create-close") { state.page = "create"; state.createDraft = null; state.createBusy = false; render(); return; }
    if (a === "back-relationship") { state.page = state.relationshipReturn || "text-chat"; render(); return; }
    if (a === "toggle-relationship-stages") { state.relationshipStagesOpen = state.relationshipStagesOpen === false; render(); return; }
    if (a === "back-level") { state.page = "profile"; render(); return; }
    if (a === "guide-close") { closeCompanionGuide(false); return; }
    if (a === "guide-start") {
      closeCompanionGuide(true);
      const firstCharacter = state.chars[0] || null;
      if (firstCharacter) { state.role = firstCharacter; state.page = "role-detail"; }
      else { state.page = "home"; }
      render();
      return;
    }
    if (a === "relationship") { state.relationshipReturn = state.page === "role-detail" ? "role-detail" : "text-chat"; openRelationship(e.target.closest("[data-character-id]")?.dataset.characterId || ""); return; }
    if (a === "level") { showLevel(); return; }
    if (a === "vip") { state.pageReturn = state.page === "role-detail" ? "role-detail" : "profile"; state.page = "vip"; ensureBilling().finally(() => { if (state.page === "vip") render(); }); return; }
    if (a === "play-greeting") { const text = state.role?.greeting || ""; if (text && window.speechSynthesis) window.speechSynthesis.speak(new SpeechSynthesisUtterance(text)); return; }
    if (a === "favorite-role") { e.currentTarget.classList.toggle("selected"); return; }
    if (a === "share-role") { openSharePoster(); return; }
    if (a === "share-poster") { openSharePoster(); return; }
    if (a === "save-poster") { saveSharePoster(); return; }
    if (a === "poster-share") { document.querySelector("[data-poster]")?.remove(); openShareSheet(); return; }
    if (a === "close-poster") { document.querySelector("[data-poster]")?.remove(); return; }
    if (a === "withdraw-referral") { withdrawReferral(); return; }
    if (a === "unlock-private") { openUnlockPrivate(); return; }
    if (a === "close-unlock") { document.querySelector("[data-unlock-modal]")?.remove(); return; }
    if (a === "text-chat") { openTextChat(""); return; }
    if (a === "open-text-gifts") { openTextGiftSheet(); return; }
    if (a === "text-mic") { referralToast("语音请在视频通话里发送"); return; }
    if (a === "play-voice") { const url = e.target.closest("[data-audio]")?.dataset.audio || ""; if (!url) { referralToast("这条语音没有可播放的音频"); return; } const audio = new Audio(url); audio.play().catch(() => referralToast("语音播放失败")); return; }
    if (a === "referral") { state.page = "referral"; showReferral(); return; }
    if (a === "back-messages") { state.page = "messages"; render(); return; }
    const peer = e.target.closest(".chat-peer");
    if (peer?.dataset.characterId) { const role = state.chars.find((item) => String(item.id) === String(peer.dataset.characterId)); if (role) { state.role = role; state.page = "role-detail"; render(); } return; }
    if (a === "send-text") { document.querySelector("[data-text-form]")?.requestSubmit(); return; }
    if (a === "copy-role-link") { await copyShareLink(document.querySelector("[data-sheet-note]")); return; }
    const referralCopy = e.target.closest("[data-copy-referral]");
    if (referralCopy) { try { await navigator.clipboard.writeText(referralCopy.dataset.copyReferral); referralToast("邀请链接已复制"); } catch { alert(referralCopy.dataset.copyReferral); } return; }
    if (a === "report-role") {
      const note = document.querySelector("[data-sheet-note]");
      if (note) note.textContent = "已收到举报，我们会查看这个角色。";
      return;
    }
    if (a === "open-album") {
      if (!state.role) return;
      const direct = e.target.closest(".album-cell[data-photo]")?.dataset.photo || "";
      if (direct) {
        document.querySelector("[data-photo-view]")?.remove();
        app.insertAdjacentHTML("beforeend", `<div class="photo-lightbox" data-photo-view><button class="photo-lightbox-close" data-action="close-photo" aria-label="关闭">×</button><img src="${esc(direct)}" alt=""><p>TA 的相册</p></div>`);
        return;
      }
      const member = isLiveMember();
      const parts = albumParts(state.role);
      const photos = parts.urls;
      const priv = parts.priv;
      document.querySelector("[data-role-sheet]")?.remove();
      const cells = photos.map((url) => `<button class="album-item" data-action="view-photo" data-photo="${esc(url)}"><img src="${esc(url)}" alt=""></button>`).join("");
      const locks = priv.map((item) => member && item.url ? `<button class="album-item" data-action="view-photo" data-photo="${esc(item.url)}"><img src="${esc(item.url)}" alt=""></button>` : `<button class="album-item is-locked" data-action="unlock-private"><span class="lock-shade"><b>私密</b><small>订阅后查看</small></span></button>`).join("");
      const total = photos.length + priv.length;
      app.insertAdjacentHTML("beforeend", `<div class="sheet-backdrop" data-role-sheet data-action="close-sheet"><div class="language-sheet album-sheet" data-sheet><div class="sheet-handle"></div><div class="filter-sheet-head"><h3>TA 的相册</h3><button data-action="close-sheet">×</button></div><div class="album-sheet-grid">${cells}${locks || '<p class="detail-empty">还没有相册</p>'}</div></div></div>`);
      return;
    }
    if (a === "view-photo") {
      const url = e.target.closest("[data-photo]")?.dataset.photo || "";
      if (!url) return;
      document.querySelector("[data-photo-view]")?.remove();
      app.insertAdjacentHTML("beforeend", `<div class="photo-lightbox" data-photo-view><button class="photo-lightbox-close" data-action="close-photo" aria-label="关闭">×</button><img src="${esc(url)}" alt=""><p>TA 的相册</p></div>`);
      return;
    }
    if (a === "close-photo" || a === "back-album") { document.querySelector("[data-photo-view]")?.remove(); if (a === "back-album") document.querySelector(".album-open")?.click(); return; }

    if (a === "subscribe-selected") { const selected=document.querySelector(".pay-plan.selected[data-plan-id]")?.dataset.planId; if(!selected){ const note=document.querySelector("[data-pay-status]"); if(note) note.textContent="请先选择套餐"; return; } return startCheckout({ planId: selected }); }
    if (a === "pay-topup") { const selected=document.querySelector(".pay-plan.selected[data-topup-id]")?.dataset.topupId; if(!selected){ const note=document.querySelector("[data-pay-status]"); if(note) note.textContent="请先选择充值档位"; return; } return startCheckout({ packageId: selected }); }
    if (a === "rooms-all") return showRooms("home");
    if (a === "wallet") { state.pageReturn = state.page === "role-detail" ? "role-detail" : "profile"; return showRecharge(); }
    if (a === "gift") return showWallet("gift");
    if (a === "recharge") { if (document.querySelector("[data-gift-sheet]") || state.page === "text-chat") state.pageReturn = "text-chat"; else state.pageReturn = state.page === "role-detail" ? "role-detail" : (state.page === "vip" ? "vip" : "profile"); showRecharge(); return; }
    if (a === "back-from-sub") { state.page = state.pageReturn || "profile"; state.pageReturn = ""; render(); return; }
    if (a === "topup") return showRecharge();
    if (a === "rooms") return showRooms(state.page === "profile" ? "profile" : (state.page === "home" ? "home" : "messages"));
    if (a === "back-rooms") { state.page = state.roomsFrom === "home" ? "home" : (state.roomsFrom === "profile" ? "profile" : "messages"); state.role = state.page === "home" ? null : state.role; render(); return; }
    if (a === "privacy") return showPrivacy();
    const topupId = e.target.closest("[data-topup-id]")?.dataset.topupId;
    if (topupId) {
      if (!token()) return askLogin();
      try {
        const result = await api("/api/pay/airwallex/checkout-sessions", { method: "POST", body: JSON.stringify({ packageId: topupId }) });
        if (result.checkoutUrl) { location.href = result.checkoutUrl; return; }
        alert("收银台地址没有返回");
      } catch (error) { alert(error.message); }
      return;
    }
    if (a === "login") return askLogin();
    if (a === "account") { if (!token()) return askLogin(); api("/api/auth/logout", { method: "POST" }).catch(() => {}); localStorage.removeItem(TOKEN_KEY); state.user = null; state.billing = null; state.page = "profile"; resetLoginDialog(); render(); }
    if (a === "submit-profile") document.querySelector("#profileEditForm")?.requestSubmit();
    if (a === "shuffle-interests") { render(); }
  });
  document.addEventListener("change", async (e) => { const input = e.target.closest("[data-profile-photo]"); if (!input?.files?.[0]) return; const file = input.files[0]; input.value = ""; if (!/^image\/(png|jpeg|webp)$/.test(file.type) || file.size > 8 * 1024 * 1024) return alert("请上传 8MB 以内的 PNG、JPG 或 WEBP 图片。"); const reader = new FileReader(); reader.onload = async () => { try { const result = await api("/api/account/profile/media", { method: "POST", body: JSON.stringify({ dataUrl: reader.result }) }); state.user = result.user; editProfile(); } catch (error) { alert(error.message); } }; reader.readAsDataURL(file); });
  document.addEventListener("click", async (e) => { const gender = e.target.closest("[data-gender]"); if (gender) { const form = document.querySelector("#profileEditForm"); form?.querySelector('[name="gender"]')?.setAttribute("value", gender.dataset.gender); form?.querySelectorAll("[data-gender]").forEach((x) => x.classList.toggle("selected", x === gender)); } const interest = e.target.closest("[data-interest]"); if (interest) { interest.classList.toggle("selected"); const form = document.querySelector("#profileEditForm"); if (form) form.interests.value = [...form.querySelectorAll("[data-interest].selected")].map((x) => x.dataset.interest).join("|"); } const remove = e.target.closest("[data-remove-photo]"); if (remove) { state.user.profilePhotos = (state.user.profilePhotos || []).filter((x) => x !== remove.dataset.removePhoto); editProfile(); } });
  document.querySelector("[data-login-form]").addEventListener("submit", async (e) => { e.preventDefault(); const f = e.currentTarget; try { const r = await api("/api/auth/login-or-register", { method: "POST", body: JSON.stringify(registrationPayload({ username: f.username.value.trim(), password: f.password.value })) }); await finishLogin(r.token, r.user); } catch (err) { f.querySelector("[data-login-message]").textContent = err.message; } });
  loginDialog?.addEventListener("cancel", (e) => { if (loginDialog.dataset.locked === "1") e.preventDefault(); });
  loginDialog?.querySelector("[data-dialog-close]")?.addEventListener("click", () => { if (loginDialog.dataset.locked === "1") return; loginDialog.close(); });
  app.addEventListener("input", (e) => {
    const form = e.target.closest("[data-create-form]");
    if (!form) return;
    if (e.target.name === "name") { const count = form.querySelector("[data-create-name-count]"); if (count) count.textContent = `${e.target.value.length} / 20`; const preview = form.querySelector(".create-preview b"); if (preview) preview.textContent = e.target.value || "小满"; }
    if (e.target.name === "intro") { const count = form.querySelector("[data-create-intro-count]"); if (count) count.textContent = `${e.target.value.length} / 80`; const preview = form.querySelector(".create-preview p"); if (preview) preview.textContent = e.target.value || "在等你开口的第一句话"; }
  });
  document.addEventListener("submit", async (e) => {
    const createForm = e.target.closest("[data-create-form]");
    if (createForm) { e.preventDefault(); saveCreateCard(); return; }
    const textForm = e.target.closest("[data-text-form]");
    if (textForm) {
      e.preventDefault();
      const content = textForm.content.value.trim();
      if (!content || !state.textChatId) return;
      const messageCost = textMessageCredits();
      if (messageCost > 0 && Number(state.user?.credits || 0) < messageCost) {
        state.pageReturn = "text-chat";
        referralToast("积分不够，去充值");
        showRecharge();
        return;
      }
      const conversationId = state.textChatId;
      const thread = document.querySelector("[data-text-thread]");
      const peerName = document.querySelector(".chat-peer b")?.textContent || "对话";
      const avatar = document.querySelector(".chat-peer .chat-avatar")?.innerHTML || "";
      thread?.querySelector(".detail-empty")?.remove();
      thread?.insertAdjacentHTML("beforeend", renderChatItem({ role: "user", content }, avatar, peerName));
      thread?.scrollTo(0, thread.scrollHeight);
      textForm.reset();
      textForm.content.focus();
      const note = textForm.querySelector("[data-text-error]");
      if (note) note.textContent = "";
      queueTextChatMessage(conversationId, content);
      return;
    }
    const creatorWithdrawForm = e.target.closest("[data-creator-withdraw-form]");
    if (creatorWithdrawForm) {
      e.preventDefault();
      const button = creatorWithdrawForm.querySelector("button[type=submit]");
      const note = creatorWithdrawForm.querySelector("[data-creator-withdraw-message]");
      const amountCredits = Number(creatorWithdrawForm.amountCredits.value || 0);
      const network = creatorWithdrawForm.network.value;
      const address = creatorWithdrawForm.address.value.trim();
      if (!(amountCredits >= 2000)) { if (note) note.textContent = "最低提现 2000 积分（20 USDT）。"; return; }
      if (amountCredits > Number(state.creatorIncome?.availableCredits || 0)) { if (note) note.textContent = "提现积分不能超过可提现余额。"; return; }
      if (button) button.disabled = true;
      if (note) note.textContent = "正在提交…";
      try {
        const result = await api("/api/live/creator-withdrawals", { method: "POST", body: JSON.stringify({ amountCredits, network, address }) });
        state.creatorIncome = result.income || state.creatorIncome;
        referralToast("提现申请已提交，等待后台审核");
        if (state.page === "creator-income") showCreatorIncome();
      } catch (error) {
        if (note) note.textContent = error.message || "提交失败，请稍后重试";
      } finally {
        const current = document.querySelector("[data-creator-withdraw-form] button[type=submit]");
        if (current) current.disabled = !(Number(state.creatorIncome?.availableCredits || 0) >= 2000);
      }
      return;
    }
    const feedbackForm = e.target.closest("[data-feedback-form]");
    if (feedbackForm) {
      e.preventDefault();
      const message = feedbackForm.message.value.trim();
      const subject = feedbackForm.subject.value;
      const note = feedbackForm.querySelector("[data-feedback-message]");
      if (message.length < 5) { if (note) note.textContent = "请至少填写 5 个字。"; return; }
      const submit = feedbackForm.querySelector("button[type=submit]");
      if (submit) submit.disabled = true;
      if (note) note.textContent = "正在提交…";
      try {
        await api("/api/support-messages", { method: "POST", body: JSON.stringify({ subject, message, source: "live feedback" }) });
        feedbackForm.reset();
        state.feedbackError = "";
        await loadFeedback(true);
        referralToast("反馈已提交，我们会通过站内信回复你");
        if (state.page === "feedback") showFeedback();
      } catch (error) {
        if (note) note.textContent = error.message || "提交失败，请稍后重试";
      } finally {
        if (submit) submit.disabled = false;
      }
      return;
    }
    const form = e.target.closest("[data-profile-form]");
    if (form) { e.preventDefault(); saveProfile(form); return; }
    const pay = e.target.closest("[data-topup-confirm]");
    if (!pay || !state.topupOrder?.id) return;
    e.preventDefault();
    const note = pay.querySelector("[data-topup-note]");
    try {
      const result = await api(`/api/pay/orders/${encodeURIComponent(state.topupOrder.id)}/confirm`, { method: "POST", body: JSON.stringify({ transactionHash: pay.hash.value.trim() }) });
      state.topupOrder = result.order || state.topupOrder;
      if (note) note.textContent = "已提交，等待到账确认。";
    } catch (error) { if (note) note.textContent = error.message; }
  });
  captureLanding();
  load().then(() => {
    initCompanionGuide();
    if (profileRouteFromHash()) return;
    const match = location.hash.match(/^#role\/(.+)$/);
    if (!match) return;
    const id = decodeURIComponent(match[1]);
    const role = state.chars.find((item) => String(item.id) === id);
    if (role) openRole(role);
  });
  window.addEventListener("hashchange", () => {
    if (profileRouteFromHash()) return;
    const match = location.hash.match(/^#role\/(.+)$/);
    if (!match) return;
    const id = decodeURIComponent(match[1]);
    const role = state.chars.find((item) => String(item.id) === id);
    if (role) openRole(role);
  });
})();
