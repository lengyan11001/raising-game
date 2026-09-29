(() => {
  const TOKEN_KEY = "raisingGameToken";
  const app = document.querySelector("#liveApp");
  const loginDialog = document.querySelector("#loginDialog");
  const state = { config: null, characters: [], user: null, loading: false };
  const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
  const token = () => { try { return localStorage.getItem(TOKEN_KEY) || ""; } catch { return ""; } };
  async function api(url, options = {}) {
    const headers = { "content-type": "application/json", ...(options.headers || {}) };
    if (token()) headers.authorization = `Bearer ${token()}`;
    const response = await fetch(url, { ...options, headers });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.message || `请求失败（${response.status}）`);
    return payload;
  }
  function imageOf(character) { return character.avatarUrl || character.portraitUrl || "/assets/brand/logo-mark.svg"; }
  function setAccountLabel() { const node = document.querySelector("[data-account-label]"); if (node) node.textContent = state.user?.username || state.user?.email || (token() ? "我的账户" : "登录"); }
  function renderLoading() { app.innerHTML = '<div class="loading-state">正在加载在线角色…</div>'; }
  function renderHome() {
    document.querySelectorAll("[data-nav]").forEach((item) => item.classList.toggle("is-active", item.dataset.nav === "home"));
    const chars = state.characters;
    app.innerHTML = `<section class="hero"><div><span class="eyebrow">LIVE CHARACTER ROOMS</span><h1>今晚，和谁聊一会儿？</h1><p>选择一位在线角色，进入真实的实时视频对话。</p></div><div class="hero-note">单角色直播间已开放<br>多人同场直播正在准备中</div></section><div class="section-head"><h2>在线角色</h2><span>${chars.length} 位正在等待你</span></div><section class="character-grid">${chars.map((character) => `<article class="character-card"><div class="portrait-wrap"><img loading="lazy" src="${esc(imageOf(character))}" alt="${esc(character.name || "角色")}"><span class="live-pill">在线</span></div><div class="card-info"><div class="card-title"><h3>${esc(character.name || "未命名角色")}</h3><span class="online-count">实时视频</span></div><p class="card-intro">${esc(character.intro || character.greeting || "和她聊聊今天的事。")}</p><div class="tags">${(character.tags || []).slice(0, 3).map((tag) => `<span class="tag">${esc(tag)}</span>`).join("")}</div><button class="enter-button" type="button" data-character-id="${esc(character.id)}">进入直播间</button></div></article>`).join("")}</section>`;
  }
  function renderRooms() { document.querySelectorAll("[data-nav]").forEach((item) => item.classList.toggle("is-active", item.dataset.nav === "rooms")); app.innerHTML = '<div class="empty-state"><h2>直播间</h2><p>从首页选择角色即可进入直播间。你最近的直播记录会显示在这里。</p><button class="enter-button" style="max-width:180px" data-action="home">浏览在线角色</button></div>'; }
  async function load() {
    renderLoading(); state.loading = true;
    try { state.config = await window.ChatLive.loadConfig(true); state.characters = window.ChatLive.characters(); renderHome(); } catch (error) { app.innerHTML = `<div class="empty-state error-state">暂时无法加载在线角色<br><small>${esc(error.message)}</small></div>`; } finally { state.loading = false; }
    if (token()) { try { state.user = (await api("/api/auth/me")).user; } catch { state.user = null; } } setAccountLabel();
  }
  function openCharacter(id) {
    if (!token()) { loginDialog.showModal(); loginDialog.dataset.pendingCharacter = id; return; }
    const character = state.characters.find((item) => String(item.id) === String(id));
    if (character && window.ChatLive?.open) window.ChatLive.open(character.id).catch((error) => { app.insertAdjacentHTML("afterbegin", `<div class="empty-state error-state">${esc(error.message)}</div>`); });
  }
  document.addEventListener("click", (event) => {
    const characterButton = event.target.closest("[data-character-id]"); if (characterButton) return openCharacter(characterButton.dataset.characterId);
    const action = event.target.closest("[data-action]")?.dataset.action;
    if (action === "refresh") return load();
    if (action === "home") { location.hash = "home"; return renderHome(); }
    if (action === "account") { if (token()) { localStorage.removeItem(TOKEN_KEY); state.user = null; setAccountLabel(); } else loginDialog.showModal(); }
  });
  document.addEventListener("click", (event) => { const nav = event.target.closest("[data-nav]")?.dataset.nav; if (nav === "rooms") { location.hash = "rooms"; renderRooms(); } if (nav === "home") { location.hash = "home"; renderHome(); } });
  document.querySelector("[data-login-form]").addEventListener("submit", async (event) => { event.preventDefault(); const form = event.currentTarget; const message = form.querySelector("[data-login-message]"); message.textContent = "正在登录…"; try { const result = await api("/api/auth/login-or-register", { method: "POST", body: JSON.stringify({ username: form.username.value.trim(), password: form.password.value }) }); localStorage.setItem(TOKEN_KEY, result.token); state.user = result.user || null; loginDialog.close(); setAccountLabel(); const pending = loginDialog.dataset.pendingCharacter; delete loginDialog.dataset.pendingCharacter; if (pending) openCharacter(pending); } catch (error) { message.textContent = error.message; } });
  window.addEventListener("hashchange", () => { if (location.hash === "#rooms") renderRooms(); else renderHome(); });
  load();
})();
