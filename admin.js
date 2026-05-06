"use strict";

const TOKEN_KEY = "raisingGameAdminToken";
const LEGACY_TOKEN_KEY = "raisingGameToken";

const ROUTES = [
  { id: "dashboard", title: "仪表盘", render: renderDashboard },
  { id: "characters", title: "角色管理", render: renderCharacters },
  { id: "videos", title: "视频管理", render: renderVideos },
  { id: "scenes", title: "场景管理", render: renderScenes },
  { id: "users", title: "用户管理", render: renderUsers },
  { id: "wallet", title: "钱包订单", render: renderWallet },
  { id: "config", title: "系统配置", render: renderConfig },
];

const state = {
  token: localStorage.getItem(TOKEN_KEY) || localStorage.getItem(LEGACY_TOKEN_KEY) || "",
  user: null,
  config: null,
  route: "dashboard",
  cache: {},
};

const els = {
  loginView: byId("loginView"),
  loginForm: byId("loginForm"),
  loginUsername: byId("loginUsername"),
  loginPassword: byId("loginPassword"),
  loginSubmit: byId("loginSubmit"),
  loginError: byId("loginError"),
  appView: byId("appView"),
  appLoadingScreen: byId("appLoadingScreen"),
  pageTitle: byId("pageTitle"),
  adminContent: byId("adminContent"),
  adminUserBadge: byId("adminUserBadge"),
  adminNav: byId("adminNav"),
  logoutBtn: byId("logoutBtn"),
  sidebarToggle: byId("sidebarToggle"),
  navToggle: byId("navToggle"),
  toast: byId("adminToast"),
  dialog: byId("adminDialog"),
  dialogForm: byId("adminDialogForm"),
  dialogTitle: byId("adminDialogTitle"),
  dialogBody: byId("adminDialogBody"),
  dialogConfirm: byId("adminDialogConfirm"),
  dialogCancel: byId("adminDialogCancel"),
};

function byId(id) { return document.getElementById(id); }
function refreshIcons() { if (window.lucide) window.lucide.createIcons(); }

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function fmtDate(value) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value).slice(0, 19);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd} ${hh}:${mi}`;
}

function fmtRelative(value) {
  if (!value) return "—";
  const t = new Date(value).getTime();
  if (!t) return "—";
  const diff = Date.now() - t;
  const sec = Math.round(diff / 1000);
  if (sec < 60) return `${sec}秒前`;
  if (sec < 3600) return `${Math.round(sec / 60)}分钟前`;
  if (sec < 86400) return `${Math.round(sec / 3600)}小时前`;
  if (sec < 604800) return `${Math.round(sec / 86400)}天前`;
  return fmtDate(value);
}

function fmtBytes(n) {
  if (!Number.isFinite(n) || n <= 0) return "—";
  const u = ["B", "KB", "MB", "GB"]; let i = 0;
  while (n >= 1024 && i < u.length - 1) { n /= 1024; i++; }
  return `${n.toFixed(1)} ${u[i]}`;
}

/* ============ toast ============ */
let toastTimer = 0;
function toast(message, kind = "") {
  if (!els.toast) return;
  els.toast.textContent = message;
  els.toast.className = "adm-toast";
  if (kind) els.toast.classList.add(`is-${kind}`);
  els.toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => { els.toast.hidden = true; }, 2800);
}

/* ============ api ============ */
async function api(url, options = {}) {
  const opts = {
    method: options.method || "GET",
    headers: {
      "content-type": "application/json",
      ...(options.headers || {}),
    },
  };
  if (state.token) opts.headers.authorization = `Bearer ${state.token}`;
  if (options.body !== undefined && opts.method !== "GET") {
    opts.body = typeof options.body === "string" ? options.body : JSON.stringify(options.body);
  }
  let response;
  try {
    response = await fetch(url, opts);
  } catch (err) {
    throw new Error("网络异常，请稍后重试。");
  }
  let payload = null;
  try { payload = await response.json(); } catch { payload = null; }
  if (response.status === 401 || payload?.code === "LOGIN_REQUIRED") {
    handleAuthExpired();
    throw new Error(payload?.message || "登录已过期，请重新登录。");
  }
  if (response.status === 403 || payload?.code === "ADMIN_REQUIRED") {
    throw new Error(payload?.message || "需要管理员权限。");
  }
  if (!response.ok || payload?.ok === false) {
    throw new Error(payload?.message || payload?.detail || `请求失败（${response.status}）`);
  }
  return payload || {};
}

function handleAuthExpired() {
  state.token = "";
  state.user = null;
  localStorage.removeItem(TOKEN_KEY);
  showLogin();
}

/* ============ auth ============ */
async function doLogin(event) {
  event?.preventDefault();
  const username = els.loginUsername.value.trim();
  const password = els.loginPassword.value;
  if (!username || password.length < 6) {
    els.loginError.textContent = "请输入账号和至少 6 位的密码。";
    els.loginError.hidden = false;
    return;
  }
  els.loginError.hidden = true;
  els.loginSubmit.disabled = true;
  try {
    const payload = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ username, password }),
    }).then(async (r) => {
      const data = await r.json().catch(() => ({}));
      if (!r.ok || data.ok === false) throw new Error(data.message || "登录失败。");
      return data;
    });
    if (payload.user?.role !== "admin") {
      throw new Error("该账号不是管理员，无法进入后台。");
    }
    state.token = payload.token;
    state.user = payload.user;
    localStorage.setItem(TOKEN_KEY, payload.token);
    showApp();
    toast(`欢迎回来，${payload.user.username}`, "success");
  } catch (err) {
    els.loginError.textContent = err.message;
    els.loginError.hidden = false;
  } finally {
    els.loginSubmit.disabled = false;
  }
}

async function doLogout() {
  state.token = "";
  state.user = null;
  state.cache = {};
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(LEGACY_TOKEN_KEY);
  showLogin();
  toast("已退出登录。", "success");
}

/* ============ view switching ============ */
function showLogin() {
  els.loginView.hidden = false;
  els.appView.hidden = true;
  hideAppLoading();
  setTimeout(() => els.loginUsername?.focus(), 50);
}

function showApp() {
  els.loginView.hidden = true;
  els.appView.hidden = false;
  hideAppLoading();
  if (state.user) {
    els.adminUserBadge.innerHTML = `<i data-lucide="user-round"></i>${escapeHtml(state.user.username)}`;
  }
  refreshIcons();
  routeFromHash();
}

function hideAppLoading() {
  if (!els.appLoadingScreen) return;
  els.appLoadingScreen.classList.add("is-hidden");
  setTimeout(() => { els.appLoadingScreen.style.display = "none"; }, 300);
}

/* ============ routing ============ */
function routeFromHash() {
  const hash = window.location.hash.replace(/^#\//, "").trim();
  const route = ROUTES.find((r) => r.id === hash) || ROUTES[0];
  state.route = route.id;
  els.adminNav.querySelectorAll("a").forEach((a) => {
    a.classList.toggle("is-active", a.dataset.route === route.id);
  });
  els.pageTitle.textContent = route.title;
  els.adminContent.innerHTML = '<div class="adm-loading"><div class="adm-spinner"></div></div>';
  document.body.classList?.remove("is-nav-open");
  els.appView.classList?.remove("is-nav-open");
  Promise.resolve()
    .then(() => route.render())
    .catch((err) => renderError(err));
}

function renderError(err) {
  els.adminContent.innerHTML = `<div class="adm-error-banner">${escapeHtml(err.message || String(err))}</div>`;
}

/* ============ helpers used by pages ============ */
async function loadConfig(force = false) {
  if (!force && state.config) return state.config;
  const payload = await api("/api/admin/config");
  state.config = payload.config || {};
  return state.config;
}

function statusPill(status) {
  const value = String(status || "").toLowerCase().trim();
  if (!value) return '<span class="adm-pill">—</span>';
  const cls = ["succeeded", "success", "done", "completed", "paid"].includes(value) ? "is-success"
    : ["pending", "image_uploaded", "queued", "submitted"].includes(value) ? "is-pending"
    : ["failed", "error", "cancelled", "canceled", "reference_failed"].includes(value) ? "is-failed"
    : ["running", "in_progress"].includes(value) ? "is-running"
    : "";
  return `<span class="adm-pill ${cls}">${escapeHtml(status)}</span>`;
}

function videoOrPoster(item) {
  const video = item.videoUrl || item.localVideoUrl || "";
  const poster = item.posterUrl || item.localImageUrl || "";
  if (video) {
    return `<video src="${escapeHtml(video)}" controls preload="metadata" playsinline poster="${escapeHtml(poster)}"></video>`;
  }
  if (poster) {
    return `<img src="${escapeHtml(poster)}" alt="" />`;
  }
  return `<div class="adm-empty"><i data-lucide="image-off"></i><p>暂无素材</p></div>`;
}

/* ============ dialog helpers ============ */
function openDialog({ title, body, confirmText = "确定", cancelText = "取消", showCancel = true, hideConfirm = false, onConfirm }) {
  els.dialogTitle.textContent = title || "";
  els.dialogBody.innerHTML = "";
  if (typeof body === "string") {
    els.dialogBody.innerHTML = body;
  } else if (body instanceof Node) {
    els.dialogBody.appendChild(body);
  }
  els.dialogConfirm.textContent = confirmText;
  els.dialogCancel.textContent = cancelText;
  els.dialogCancel.style.display = showCancel ? "" : "none";
  els.dialogConfirm.style.display = hideConfirm ? "none" : "";
  refreshIcons();
  return new Promise((resolve) => {
    const handler = async (event) => {
      const value = event.submitter?.value || "cancel";
      if (value === "confirm" && typeof onConfirm === "function") {
        event.preventDefault();
        try {
          els.dialogConfirm.disabled = true;
          const result = await onConfirm();
          if (result === false) {
            els.dialogConfirm.disabled = false;
            return;
          }
          els.dialogConfirm.disabled = false;
          els.dialog.close("confirm");
        } catch (err) {
          els.dialogConfirm.disabled = false;
          toast(err.message || "操作失败", "error");
          return;
        }
      }
      els.dialogForm.removeEventListener("submit", handler);
      els.dialog.removeEventListener("close", closeHandler);
      resolve(value);
    };
    const closeHandler = () => {
      els.dialogForm.removeEventListener("submit", handler);
      els.dialog.removeEventListener("close", closeHandler);
      resolve("cancel");
    };
    els.dialogForm.addEventListener("submit", handler);
    els.dialog.addEventListener("close", closeHandler);
    els.dialog.showModal();
  });
}

async function confirmAction(title, message, { danger = false, confirmText = "确认" } = {}) {
  const result = await openDialog({
    title,
    body: `<p style="margin:0;color:var(--adm-muted);">${escapeHtml(message)}</p>`,
    confirmText,
    cancelText: "取消",
  });
  if (result === "confirm") {
    if (danger) {
      els.dialogConfirm.classList.add("adm-btn-danger");
      els.dialogConfirm.classList.remove("adm-btn-primary");
    }
    return true;
  }
  els.dialogConfirm.classList.remove("adm-btn-danger");
  els.dialogConfirm.classList.add("adm-btn-primary");
  return false;
}

/* ============ DASHBOARD ============ */
async function renderDashboard() {
  const [dashboard, config] = await Promise.all([
    api("/api/admin/dashboard"),
    loadConfig(),
  ]);
  const s = dashboard.stats || {};
  const recent = dashboard.recentRecords || [];
  const items = (config.homeVideo?.items) || [];
  const activeId = dashboard.activeHomeItemId;
  const activeItem = items.find((i) => i.id === activeId) || items[0];

  els.adminContent.innerHTML = `
    <section class="adm-page">
      <div class="adm-page-head">
        <div>
          <h2>仪表盘</h2>
          <p class="adm-muted">用户、角色、视频与订单的关键指标。</p>
        </div>
        <div class="adm-page-actions">
          <button class="adm-btn adm-btn-ghost" data-act="refresh"><i data-lucide="refresh-cw"></i>刷新</button>
        </div>
      </div>

      <div class="adm-grid adm-grid-4">
        ${statCard("用户总数", s.users, `${s.admins || 0} 名管理员`, "users-round", "rose")}
        ${statCard("预设角色", s.adminCharacters, `${s.sceneBindings || 0} 个场景已绑定`, "user-round", "violet")}
        ${statCard("用户自定义角色", s.userCharacters, `${s.userSceneVideos || 0} 个用户场景视频`, "user-plus", "mint")}
        ${statCard("钱包订单", s.walletOrders, `${s.pendingOrders || 0} 待确认`, "wallet", "amber")}
        ${statCard("生成历史", s.generationRecords, "Seedance / Apiz 任务记录", "history", "rose")}
        ${statCard("活跃场景", s.scenes, "用户端可用场景数量", "map-pinned", "violet")}
        ${statCard("流通爱心币", s.totalCredits, "全部用户余额合计", "gem", "mint")}
        ${statCard("用户素材库", s.userAssets, "上传图片素材数量", "images", "amber")}
      </div>

      <div class="adm-card">
        <header class="adm-card-head">
          <h3>当前主推角色</h3>
          <a class="adm-btn adm-btn-ghost adm-btn-sm" href="#/characters"><i data-lucide="arrow-up-right"></i>去角色管理</a>
        </header>
        <div class="adm-card-body">
          ${activeItem ? `
            <div class="adm-grid adm-grid-2">
              <div class="adm-char-poster" style="max-width:280px;">${videoOrPoster(activeItem)}</div>
              <div class="adm-grid">
                <div><span class="adm-muted">名字</span><br/><strong>${escapeHtml(activeItem.name || "—")}</strong></div>
                <div><span class="adm-muted">短剧标题</span><br/><strong>${escapeHtml(activeItem.title || "—")}</strong></div>
                <div><span class="adm-muted">状态</span> ${statusPill(activeItem.status)}</div>
                <div><span class="adm-muted">任务 ID</span> <span class="adm-mono">${escapeHtml(activeItem.taskId || "—")}</span></div>
                <div><span class="adm-muted">创建时间</span> ${escapeHtml(fmtDate(activeItem.createdAt))}</div>
              </div>
            </div>
          ` : '<div class="adm-empty"><i data-lucide="image-off"></i><p>尚未配置首页角色</p></div>'}
        </div>
      </div>

      <div class="adm-card">
        <header class="adm-card-head">
          <h3>最近 5 条生成记录</h3>
          <a class="adm-btn adm-btn-ghost adm-btn-sm" href="#/videos"><i data-lucide="arrow-up-right"></i>查看视频</a>
        </header>
        <div class="adm-card-body adm-table-wrap">
          ${recent.length ? `
            <table class="adm-table">
              <thead><tr><th>任务 ID</th><th>状态</th><th>本地视频</th><th>错误</th><th>时间</th></tr></thead>
              <tbody>
                ${recent.map((r) => `
                  <tr>
                    <td class="adm-mono">${escapeHtml((r.taskId || "").slice(0, 32))}</td>
                    <td>${statusPill(r.status)}</td>
                    <td>${r.localVideoUrl ? `<a class="adm-mono" href="${escapeHtml(r.localVideoUrl)}" target="_blank" rel="noopener">${escapeHtml(r.localVideoUrl.slice(-32))}</a>` : "—"}</td>
                    <td class="adm-truncate">${escapeHtml((r.error || "").slice(0, 80))}</td>
                    <td>${fmtRelative(r.updatedAt || r.createdAt)}</td>
                  </tr>`).join("")}
              </tbody>
            </table>` : '<div class="adm-empty"><i data-lucide="inbox"></i><p>暂无生成记录</p></div>'}
        </div>
      </div>
    </section>
  `;
  els.adminContent.querySelector('[data-act="refresh"]')?.addEventListener("click", () => routeFromHash());
  refreshIcons();
}

function statCard(label, value, detail, icon, color) {
  return `
    <div class="adm-stat is-${color}">
      <span class="adm-stat-icon"><i data-lucide="${icon}"></i></span>
      <span class="adm-stat-label">${escapeHtml(label)}</span>
      <strong class="adm-stat-value">${escapeHtml(value ?? 0)}</strong>
      <span class="adm-stat-detail">${escapeHtml(detail || "")}</span>
    </div>
  `;
}

/* ============ CHARACTERS ============ */
async function renderCharacters() {
  const tab = sessionStorage.getItem("admTabCharacters") || "preset";
  els.adminContent.innerHTML = `
    <section class="adm-page">
      <div class="adm-page-head">
        <div>
          <h2>角色管理</h2>
          <p class="adm-muted">维护后台预设角色与用户自定义角色。</p>
        </div>
        <div class="adm-tabs" id="charTabs">
          <button data-tab="preset" class="${tab === "preset" ? "is-active" : ""}">后台预设角色</button>
          <button data-tab="user" class="${tab === "user" ? "is-active" : ""}">用户自定义角色</button>
        </div>
      </div>
      <div id="charPaneBody"></div>
    </section>
  `;
  const tabs = els.adminContent.querySelector("#charTabs");
  tabs.addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-tab]");
    if (!btn) return;
    sessionStorage.setItem("admTabCharacters", btn.dataset.tab);
    renderCharacters();
  });
  if (tab === "preset") {
    await renderPresetCharacters();
  } else {
    await renderUserCharacters();
  }
}

async function renderPresetCharacters() {
  const config = await loadConfig(true);
  const items = config.homeVideo?.items || [];
  const activeId = config.homeVideo?.activeItemId || "";
  const scenes = config.scenes || [];
  const pane = byId("charPaneBody");
  pane.innerHTML = `
    <div class="adm-page-actions adm-mt">
      <button class="adm-btn adm-btn-primary" id="newPresetBtn"><i data-lucide="plus"></i>上传角色图</button>
      <button class="adm-btn adm-btn-ghost" id="refreshPresetBtn"><i data-lucide="refresh-cw"></i>刷新</button>
    </div>
    ${items.length ? `
      <div class="adm-char-grid adm-mt">
        ${items.map((item) => presetCharCard(item, activeId, scenes)).join("")}
      </div>
    ` : `<div class="adm-card adm-mt"><div class="adm-empty"><i data-lucide="image-plus"></i><p>还没有预设角色，点击「上传角色图」创建第一个。</p></div></div>`}
  `;
  refreshIcons();

  byId("newPresetBtn")?.addEventListener("click", () => openCreatePresetDialog());
  byId("refreshPresetBtn")?.addEventListener("click", () => renderCharacters());

  pane.querySelectorAll(".adm-char-card").forEach((card) => {
    const id = card.dataset.id;
    card.querySelector('[data-act="set-active"]')?.addEventListener("click", () => setHomeActive(id));
    card.querySelector('[data-act="edit"]')?.addEventListener("click", () => openEditPresetDialog(id));
    card.querySelector('[data-act="regen"]')?.addEventListener("click", () => openRegenPresetDialog(id));
    card.querySelector('[data-act="delete"]')?.addEventListener("click", () => deletePresetItem(id));
    card.querySelector('[data-act="bind-scene"]')?.addEventListener("click", () => openSceneBindDialog(id, scenes));
    card.querySelector('[data-act="rebuild-ref"]')?.addEventListener("click", () => rebuildPresetReference(id));
  });
}

async function rebuildPresetReference(itemId) {
  if (!confirm("将清空旧的合成参考图并重新跑 apiz Seedream + Seedance CreateAsset，可能耗时 1-3 分钟。继续？")) return;
  try {
    await api(`/api/admin/home-items/${encodeURIComponent(itemId)}/rebuild-reference`, {
      method: "POST",
      body: JSON.stringify({ force: true }),
    });
    toast("已开始重建参考图，状态会在列表里更新。");
    setTimeout(() => renderCharacters(), 5000);
    setTimeout(() => renderCharacters(), 30000);
    setTimeout(() => renderCharacters(), 90000);
  } catch (error) {
    toast(`重建失败：${error.message}`);
  }
}

function presetCharCard(item, activeId, scenes) {
  const sceneVideos = item.sceneVideos || {};
  const sceneCount = Object.keys(sceneVideos).length;
  const refState = item.referenceState || referenceStateOf(item);
  const refLabel = referenceStateLabel(refState);
  const refClass = `adm-ref-state adm-ref-${refState}`;
  return `
    <article class="adm-char-card" data-id="${escapeHtml(item.id)}">
      <div class="adm-char-poster">
        ${item.id === activeId ? `<span class="adm-active-flag">主推</span>` : ""}
        ${videoOrPoster(item)}
      </div>
      <div class="adm-char-meta">
        <strong>${escapeHtml(item.name || "—")}</strong>
        <em>${escapeHtml(item.title || "短剧角色")} · ${statusText(item.status)}</em>
        <em>${sceneCount}/${scenes.length} 场景已绑定</em>
        <em class="${refClass}" title="生成场景视频前必须有合成参考图">参考资产: ${refLabel}</em>
      </div>
      <div class="adm-char-actions">
        ${item.id !== activeId ? `<button class="adm-btn adm-btn-sm" data-act="set-active"><i data-lucide="star"></i>设为主推</button>` : ""}
        <button class="adm-btn adm-btn-sm adm-btn-ghost" data-act="edit"><i data-lucide="pencil"></i>编辑</button>
        <button class="adm-btn adm-btn-sm adm-btn-ghost" data-act="regen"><i data-lucide="refresh-cw"></i>重新生成</button>
        <button class="adm-btn adm-btn-sm adm-btn-ghost" data-act="bind-scene"><i data-lucide="map-pinned"></i>场景视频</button>
        <button class="adm-btn adm-btn-sm adm-btn-ghost" data-act="rebuild-ref" title="清空旧的合成参考图，重新跑一次 apiz Seedream + Seedance CreateAsset"><i data-lucide="image-down"></i>重建参考图</button>
        <button class="adm-btn adm-btn-sm adm-btn-danger" data-act="delete"><i data-lucide="trash-2"></i>删除</button>
      </div>
    </article>
  `;
}

function referenceStateOf(item) {
  const hasSynth = Boolean(item.syntheticReferenceLocalUrl || item.syntheticReferenceUrl);
  const hasAsset = Boolean(item.referenceAssetUri);
  if (hasSynth && hasAsset) return "ready";
  if (hasSynth) return "asset_pending";
  if (item.status === "reference_failed") return "failed";
  if (item.status === "image_uploaded") return "synth_pending";
  return "missing";
}

function referenceStateLabel(state) {
  switch (state) {
    case "ready":
      return "已就绪";
    case "asset_pending":
      return "上游创建中";
    case "synth_pending":
      return "合成中";
    case "failed":
      return "失败，可重建";
    default:
      return "缺失，需重建";
  }
}

function statusText(status) {
  if (!status) return "待生成";
  const map = {
    image_uploaded: "已上传图片",
    succeeded: "已生成",
    success: "已生成",
    pending: "排队中",
    running: "生成中",
    failed: "失败",
    reference_failed: "参考失败",
  };
  return map[String(status).toLowerCase()] || status;
}

function openCreatePresetDialog() {
  const tpl = document.createElement("div");
  tpl.innerHTML = `
    <label class="adm-upload">
      <input id="presetFile" type="file" accept="image/png,image/jpeg,image/webp" />
      <i data-lucide="image-up"></i>
      <span>点击或拖拽上传角色图（建议竖版 9:16，全身）</span>
      <img id="presetPreview" hidden />
    </label>
    <div class="adm-form-row adm-mt"><span>角色名</span><input id="presetName" type="text" maxlength="20" placeholder="例如 暮悠悠" /></div>
    <div class="adm-form-row"><span>短剧标题</span><input id="presetTitle" type="text" maxlength="20" placeholder="例如 雨夜套房" /></div>
    <div class="adm-form-row"><span>补充 Prompt（可留空，使用全身美腿默认 Prompt）</span><textarea id="presetPrompt" placeholder="留空即可。这里写的会附加在系统默认 Prompt 后面。"></textarea></div>
  `;
  let dataUrl = "";
  setTimeout(() => {
    const file = tpl.querySelector("#presetFile");
    const preview = tpl.querySelector("#presetPreview");
    file.addEventListener("change", () => {
      const f = file.files?.[0];
      if (!f) return;
      const reader = new FileReader();
      reader.onload = () => {
        dataUrl = String(reader.result || "");
        preview.src = dataUrl;
        preview.hidden = false;
      };
      reader.readAsDataURL(f);
    });
    refreshIcons();
  }, 0);
  openDialog({
    title: "新建后台预设角色",
    body: tpl,
    confirmText: "保存为新角色",
    onConfirm: async () => {
      const name = tpl.querySelector("#presetName").value.trim();
      const title = tpl.querySelector("#presetTitle").value.trim();
      const prompt = tpl.querySelector("#presetPrompt").value.trim();
      if (!dataUrl) { toast("请先选择一张角色图。", "error"); return false; }
      if (!name || !title) { toast("请填写角色名和短剧标题。", "error"); return false; }
      await api("/api/admin/home-image", {
        method: "POST",
        body: { dataUrl, name, title, prompt },
      });
      toast("角色已保存。可以在卡片上点「重新生成」生成视频。", "success");
      state.config = null;
      renderCharacters();
    },
  });
}

async function openEditPresetDialog(itemId) {
  const config = await loadConfig();
  const item = (config.homeVideo?.items || []).find((i) => i.id === itemId);
  if (!item) return;
  const tpl = document.createElement("div");
  tpl.innerHTML = `
    <div class="adm-form-row"><span>角色名</span><input id="editName" type="text" maxlength="20" value="${escapeHtml(item.name || "")}" /></div>
    <div class="adm-form-row"><span>短剧标题</span><input id="editTitle" type="text" maxlength="20" value="${escapeHtml(item.title || "")}" /></div>
    <div class="adm-form-row"><span>Prompt（保存后下次生成视频时使用）</span><textarea id="editPrompt">${escapeHtml(item.prompt || "")}</textarea></div>
  `;
  openDialog({
    title: `编辑：${item.name || item.id}`,
    body: tpl,
    confirmText: "保存",
    onConfirm: async () => {
      await api(`/api/admin/home-items/${encodeURIComponent(itemId)}`, {
        method: "PATCH",
        body: {
          name: tpl.querySelector("#editName").value.trim(),
          title: tpl.querySelector("#editTitle").value.trim(),
          prompt: tpl.querySelector("#editPrompt").value.trim(),
        },
      });
      toast("已更新。", "success");
      state.config = null;
      renderCharacters();
    },
  });
}

async function openRegenPresetDialog(itemId) {
  const config = await loadConfig();
  const item = (config.homeVideo?.items || []).find((i) => i.id === itemId);
  if (!item) return;
  const tpl = document.createElement("div");
  const scenes = config.scenes || [];
  tpl.innerHTML = `
    <p class="adm-muted">为「${escapeHtml(item.name)}」重新生成首页主视频。流程：</p>
    <ol class="adm-muted" style="padding-left:18px;line-height:1.6;">
      <li>用 Apiz Seedream 生成"贴近原图"的合成参考图</li>
      <li>提交 Seedance（或 ifilm CLI）15 秒短剧任务</li>
      <li>任务完成后会自动写回该角色的 videoUrl</li>
    </ol>
    <div class="adm-form-row adm-mt"><span>生成流程</span><select id="genProvider"><option value="seedance">Seedance / Ark</option><option value="ifilm-cli">ifilm CLI（本机已安装时）</option></select></div>
    <div class="adm-form-row"><span>额外 Prompt（可留空，使用角色保存的 Prompt）</span><textarea id="genPrompt" placeholder="留空使用角色保存的 Prompt 与默认全身美腿 Prompt。"></textarea></div>
  `;
  const providerRow = tpl.querySelector("#genProvider")?.closest(".adm-form-row");
  if (providerRow && scenes.length) {
    const sceneRow = document.createElement("div");
    sceneRow.className = "adm-form-row";
    sceneRow.innerHTML = `<span>Home scene</span><select id="genHomeScene">${scenes.map((s) => `<option value="${escapeHtml(s.id)}">${escapeHtml(s.name || s.id)}</option>`).join("")}</select>`;
    providerRow.insertAdjacentElement("afterend", sceneRow);
  }

  openDialog({
    title: "重新生成主视频",
    body: tpl,
    confirmText: "开始生成",
    onConfirm: async () => {
      const provider = tpl.querySelector("#genProvider").value;
      const sceneId = tpl.querySelector("#genHomeScene")?.value || "room";
      const prompt = tpl.querySelector("#genPrompt").value.trim();
      await api("/api/admin/home-video", {
        method: "POST",
        body: { itemId, sceneId, provider, prompt, name: item.name, title: item.title },
      });
      toast("已提交任务，可在「视频」页面查看进度。", "success");
      state.config = null;
      renderCharacters();
    },
  });
}

async function setHomeActive(itemId) {
  await api(`/api/admin/home-items/${encodeURIComponent(itemId)}/active`, { method: "POST" });
  toast("已设为首页主推。", "success");
  state.config = null;
  renderCharacters();
}

async function deletePresetItem(itemId) {
  const ok = await confirmAction("删除角色", "确认删除该角色？已生成的视频文件不会被物理删除。", { danger: true, confirmText: "删除" });
  if (!ok) return;
  await api(`/api/admin/home-items/${encodeURIComponent(itemId)}`, { method: "DELETE" });
  toast("已删除。", "success");
  state.config = null;
  renderCharacters();
}

function openSceneBindDialog(itemId, scenes) {
  loadConfig().then((config) => {
    const item = (config.homeVideo?.items || []).find((i) => i.id === itemId);
    if (!item) return;
    const sceneVideos = item.sceneVideos || {};
    const tpl = document.createElement("div");
    tpl.innerHTML = `
      <p class="adm-muted">为「${escapeHtml(item.name)}」选择一个场景，输入提示词后立即提交。提交后会自动跳转到「视频管理」页查看进度、查询状态、再次生成。</p>
      <label class="adm-field adm-mt">
        <span>选择场景</span>
        <select id="sceneBindScene">
          ${scenes.map((s) => {
            const entry = sceneVideos[s.id] || {};
            const tag = entry.taskId ? `（${statusText(entry.status)}）` : "（未生成）";
            return `<option value="${escapeHtml(s.id)}" data-prompt="${escapeHtml(s.prompt || "")}">${escapeHtml(s.name || s.id)} ${tag}</option>`;
          }).join("")}
        </select>
      </label>
      <label class="adm-field adm-mt">
        <span>提示词（留空则用场景默认提示词，发什么写什么）</span>
        <textarea id="sceneBindPrompt" rows="6" placeholder="支持长 prompt，原样发到 Seedance 2.0"></textarea>
      </label>
      <p class="adm-muted adm-mt" id="sceneBindHint"></p>
    `;
    const select = tpl.querySelector('#sceneBindScene');
    const promptEl = tpl.querySelector('#sceneBindPrompt');
    const hintEl = tpl.querySelector('#sceneBindHint');
    function syncHint() {
      const opt = select.options[select.selectedIndex];
      const sceneId = opt?.value;
      const entry = sceneVideos[sceneId] || {};
      const def = opt?.dataset.prompt || "";
      const lines = [];
      if (entry.taskId) lines.push(`已有任务 ${entry.taskId}（${statusText(entry.status)}）。再次提交会覆盖记录。`);
      if (def) lines.push(`场景默认提示词：${def.length > 80 ? def.slice(0, 80) + "…" : def}`);
      hintEl.textContent = lines.join("  ");
      if (!promptEl.value) promptEl.placeholder = def || "支持长 prompt，原样发到 Seedance 2.0";
    }
    select.addEventListener('change', syncHint);
    setTimeout(syncHint, 0);
    openDialog({
      title: `生成场景视频 · ${item.name || item.id}`,
      body: tpl,
      confirmText: "提交并跳转视频页",
      cancelText: "取消",
      onConfirm: async () => {
        const sceneId = select.value;
        const prompt = promptEl.value.trim();
        try {
          await api("/api/admin/character-scene-video", {
      method: "POST",
            body: { itemId, sceneId, prompt },
          });
          toast(`已提交「${sceneId}」任务，跳转到视频管理。`, "success");
          state.config = null;
          sessionStorage.setItem("admTabVideos", "scene");
          window.location.hash = "#/videos";
        } catch (err) {
          toast(err.message, "error");
          throw err;
        }
      },
    });
  });
}

async function renderUserCharacters() {
  const payload = await api("/api/admin/my-characters");
  const list = payload.characters || [];
  const pane = byId("charPaneBody");
  pane.innerHTML = `
    <div class="adm-page-actions adm-mt">
      <button class="adm-btn adm-btn-ghost" id="refreshUserCharBtn"><i data-lucide="refresh-cw"></i>刷新</button>
    </div>
    ${list.length ? `
      <div class="adm-char-grid adm-mt">
        ${list.map((c) => userCharCard(c)).join("")}
      </div>` : `<div class="adm-card adm-mt"><div class="adm-empty"><i data-lucide="user-x"></i><p>用户还没有创建任何自定义角色。</p></div></div>`}
  `;
  refreshIcons();
  byId("refreshUserCharBtn")?.addEventListener("click", () => renderCharacters());
  pane.querySelectorAll('.adm-char-card').forEach((card) => {
    const id = card.dataset.id;
    card.querySelector('[data-act="delete-user-char"]')?.addEventListener("click", async () => {
      const ok = await confirmAction("删除用户角色", "确认删除该用户自定义角色（不会删除用户账号）？", { danger: true, confirmText: "删除" });
      if (!ok) return;
      await api(`/api/admin/my-characters/${encodeURIComponent(id)}`, { method: "DELETE" });
      toast("已删除。", "success");
      renderCharacters();
    });
  });
}

function userCharCard(c) {
  const sceneCount = Object.keys(c.sceneVideos || {}).length;
  return `
    <article class="adm-char-card" data-id="${escapeHtml(c.id)}">
      <div class="adm-char-poster">${videoOrPoster(c)}</div>
      <div class="adm-char-meta">
        <strong>${escapeHtml(c.name || "—")}</strong>
        <em>归属用户：${escapeHtml(c.username || c.userId)}</em>
        <em>${escapeHtml(c.title || "")} · ${statusText(c.status)} · ${sceneCount} 个场景</em>
        <em class="adm-mono">${escapeHtml((c.id || "").slice(0, 22))}</em>
      </div>
      <div class="adm-char-actions">
        ${c.videoUrl ? `<a class="adm-btn adm-btn-sm adm-btn-ghost" href="${escapeHtml(c.videoUrl)}" target="_blank" rel="noopener"><i data-lucide="play"></i>播放</a>` : ""}
        <button class="adm-btn adm-btn-sm adm-btn-danger" data-act="delete-user-char"><i data-lucide="trash-2"></i>删除</button>
      </div>
    </article>
  `;
}

/* ============ VIDEOS ============ */
async function renderVideos() {
  const stored = sessionStorage.getItem("admTabVideos");
  const tab = ["scene", "history"].includes(stored) ? stored : "scene";
  els.adminContent.innerHTML = `
    <section class="adm-page">
      <div class="adm-page-head">
        <div>
          <h2>视频管理</h2>
          <p class="adm-muted">查看所有「角色 × 场景」短剧视频以及底层任务历史。角色主视频在「角色」页面里直接预览。</p>
        </div>
        <div class="adm-tabs" id="videoTabs">
          <button data-tab="scene" class="${tab === "scene" ? "is-active" : ""}">场景视频</button>
          <button data-tab="history" class="${tab === "history" ? "is-active" : ""}">生成历史</button>
        </div>
      </div>
      <div id="videoPaneBody"></div>
    </section>
  `;
  const tabs = els.adminContent.querySelector("#videoTabs");
  tabs.addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-tab]");
    if (!btn) return;
    sessionStorage.setItem("admTabVideos", btn.dataset.tab);
    renderVideos();
  });

  const pane = byId("videoPaneBody");
  pane.innerHTML = '<div class="adm-loading"><div class="adm-spinner"></div></div>';
  if (tab === "scene") await renderSceneVideos();
  else await renderHistory();
}

async function renderSceneVideos() {
  const [config, myChars] = await Promise.all([
    loadConfig(true),
    api("/api/admin/my-characters"),
  ]);
  const scenes = config.scenes || [];
  const sceneNameById = new Map(scenes.map((s) => [s.id, s.name]));
  const cards = [];

  (config.homeVideo?.items || []).forEach((item) => {
    Object.entries(item.sceneVideos || {}).forEach(([sceneId, entry]) => {
      cards.push({
        owner: "后台预设",
        ownerKind: "admin",
        itemId: item.id,
        characterId: item.id,
        characterName: item.name || "—",
        sceneName: sceneNameById.get(sceneId) || entry.sceneName || sceneId,
        sceneId,
        status: entry.status,
        taskId: entry.taskId,
        videoUrl: entry.videoUrl,
        localVideoUrl: entry.localVideoUrl || "",
        remoteVideoUrl: entry.remoteVideoUrl || "",
        posterUrl: entry.posterUrl || item.posterUrl,
        prompt: entry.prompt || "",
        userPrompt: entry.userPrompt || "",
        finalPrompt: entry.finalPrompt || entry.prompt || "",
        referenceAssetUri: entry.referenceAssetUri || item.referenceAssetUri || "",
        model: entry.model || "",
        ratio: entry.ratio || "",
        resolution: entry.resolution || "",
        duration: entry.duration || 0,
        provider: entry.provider || "seedance",
        error: entry.error || "",
        updatedAt: entry.updatedAt || entry.createdAt,
      });
    });
  });

  (myChars.characters || []).forEach((c) => {
    Object.entries(c.sceneVideos || {}).forEach(([sceneId, entry]) => {
      cards.push({
        owner: `用户 ${c.username || c.userId}`,
        ownerKind: "user",
        itemId: c.id,
        characterId: c.id,
        username: c.username || c.userId,
        characterName: c.name || "—",
        sceneName: sceneNameById.get(sceneId) || entry.sceneName || sceneId,
        sceneId,
        status: entry.status,
        taskId: entry.taskId,
        videoUrl: entry.videoUrl,
        localVideoUrl: entry.localVideoUrl || "",
        remoteVideoUrl: entry.remoteVideoUrl || "",
        posterUrl: entry.posterUrl || c.posterUrl,
        prompt: entry.prompt || "",
        userPrompt: entry.userPrompt || "",
        finalPrompt: entry.finalPrompt || entry.prompt || "",
        referenceAssetUri: entry.referenceAssetUri || c.referenceAssetUri || "",
        model: entry.model || "",
        ratio: entry.ratio || "",
        resolution: entry.resolution || "",
        duration: entry.duration || 0,
        provider: entry.provider || "seedance",
        error: entry.error || "",
        updatedAt: entry.updatedAt || entry.createdAt,
      });
    });
  });

  cards.sort((a, b) => String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")));

  const adminCount = cards.filter((c) => c.ownerKind === "admin").length;
  const userCount = cards.filter((c) => c.ownerKind === "user").length;

  const pane = byId("videoPaneBody");
  pane.innerHTML = cards.length ? `
    <div class="adm-row adm-mt" style="justify-content:space-between;align-items:center;">
      <p class="adm-muted" style="margin:0;">共 ${cards.length} 条场景视频（后台 ${adminCount} · 用户 ${userCount}）。点「查询」拉取最新状态，点「重新生成」基于原 prompt 再发一次任务。</p>
      <button class="adm-btn adm-btn-ghost adm-btn-sm" id="refreshSceneVideosBtn"><i data-lucide="refresh-cw"></i>刷新列表</button>
    </div>
    <div class="adm-video-grid adm-mt">
      ${cards.map((c, idx) => sceneVideoCardHtml(c, idx)).join("")}
    </div>` : `<div class="adm-card adm-mt"><div class="adm-empty"><i data-lucide="link"></i><p>还没有场景视频。在「角色」页面里给角色生成场景视频，会出现在这里。</p></div></div>`;
  refreshIcons();

  byId("refreshSceneVideosBtn")?.addEventListener("click", () => renderVideos());

  pane.querySelectorAll('.adm-video-card').forEach((card, idx) => {
    const c = cards[idx];
    if (!c) return;
    card.querySelector('[data-act="refresh-task"]')?.addEventListener("click", async (ev) => {
      const btn = ev.currentTarget;
      if (!c.taskId) { toast("该记录还没有 taskId。", "error"); return; }
      btn.disabled = true;
      try {
        await api(`/api/admin/character-scene-video/${encodeURIComponent(c.taskId)}`);
        toast("已刷新任务状态。", "success");
        state.config = null;
        renderVideos();
      } catch (err) {
        toast(err.message, "error");
      } finally {
        btn.disabled = false;
      }
    });
    card.querySelector('[data-act="regenerate"]')?.addEventListener("click", async (ev) => {
      const btn = ev.currentTarget;
      if (c.ownerKind !== "admin") {
        toast("用户角色×场景视频请由用户在前端重新生成。", "warning");
        return;
      }
      const ok = await confirmAction("重新生成", `将基于现有 prompt 为「${c.characterName} × ${c.sceneName}」再次提交一次 Seedance 任务，会覆盖现有记录。继续？`, { confirmText: "再次生成" });
      if (!ok) return;
      btn.disabled = true;
      try {
        await api("/api/admin/character-scene-video", {
      method: "POST",
          body: { itemId: c.itemId, sceneId: c.sceneId, prompt: c.userPrompt || c.prompt || "" },
        });
        toast("已提交新任务。", "success");
        state.config = null;
        renderVideos();
      } catch (err) {
        toast(err.message, "error");
  } finally {
        btn.disabled = false;
      }
    });
    card.querySelectorAll('[data-act="copy-text"]').forEach((b) => {
      b.addEventListener("click", () => {
        const text = b.dataset.text || "";
        if (!text) return;
        navigator.clipboard?.writeText(text).then(() => toast("已复制。", "success")).catch(() => toast("复制失败。", "error"));
      });
    });
  });
}

function sceneVideoCardHtml(c, idx) {
  const params = [
    c.model ? `model: ${c.model}` : "",
    c.ratio ? `ratio: ${c.ratio}` : "",
    c.resolution ? `resolution: ${c.resolution}` : "",
    c.duration ? `duration: ${c.duration}s` : "",
    c.provider ? `provider: ${c.provider}` : "",
  ].filter(Boolean).join(" · ");
  const reGenLabel = c.ownerKind === "admin" ? "重新生成" : "用户角色（仅查询）";
  const reGenDisabled = c.ownerKind === "admin" ? "" : "disabled";
  const promptText = c.finalPrompt || c.prompt || "";
  const hasPrompt = promptText.trim().length > 0;
  return `
    <article class="adm-video-card" data-idx="${idx}">
      <div class="adm-video-media">${videoOrPoster(c)}</div>
      <div class="adm-video-meta">
        <strong>${escapeHtml(c.characterName)} × ${escapeHtml(c.sceneName)}</strong>
        <em>${escapeHtml(c.owner)} · ${statusPill(c.status)} · ${escapeHtml(fmtRelative(c.updatedAt))}</em>
        <em class="adm-mono adm-truncate" title="${escapeHtml(c.taskId || "")}">taskId: ${escapeHtml(c.taskId || "—")}</em>
        ${params ? `<em class="adm-mono adm-truncate" title="${escapeHtml(params)}">${escapeHtml(params)}</em>` : ""}
        ${c.referenceAssetUri ? `<em class="adm-mono adm-truncate" title="${escapeHtml(c.referenceAssetUri)}">ref: ${escapeHtml(c.referenceAssetUri)}</em>` : ""}
        ${c.error ? `<em class="adm-error-text">${escapeHtml(c.error)}</em>` : ""}
        <details class="adm-prompt-box adm-mt">
          <summary>查看完整 Prompt（${hasPrompt ? promptText.length + " chars" : "空"}）</summary>
          <pre class="adm-prompt-pre">${escapeHtml(promptText || "（未记录 prompt）")}</pre>
          <div class="adm-row adm-mt">
            <button class="adm-btn adm-btn-sm adm-btn-ghost" data-act="copy-text" data-text="${escapeHtml(promptText)}"><i data-lucide="copy"></i>复制 Prompt</button>
            ${c.referenceAssetUri ? `<button class="adm-btn adm-btn-sm adm-btn-ghost" data-act="copy-text" data-text="${escapeHtml(c.referenceAssetUri)}"><i data-lucide="link"></i>复制 ref URI</button>` : ""}
          </div>
        </details>
        <div class="adm-row adm-mt">
          <button class="adm-btn adm-btn-sm adm-btn-ghost" data-act="refresh-task"><i data-lucide="refresh-cw"></i>查询</button>
          <button class="adm-btn adm-btn-sm" data-act="regenerate" ${reGenDisabled}><i data-lucide="rotate-cw"></i>${reGenLabel}</button>
          ${c.videoUrl ? `<a class="adm-btn adm-btn-sm adm-btn-ghost" href="${escapeHtml(c.videoUrl)}" target="_blank" rel="noopener"><i data-lucide="external-link"></i>原视频</a>` : ""}
        </div>
      </div>
    </article>
  `;
}

async function renderHistory() {
  const payload = await api("/api/admin/generation-records?limit=120");
  const records = payload.records || [];
  const pane = byId("videoPaneBody");
  pane.innerHTML = `
    <div class="adm-card adm-mt">
      <header class="adm-card-head">
        <h3>生成历史（最近 ${records.length} / ${payload.total || 0}）</h3>
        <button class="adm-btn adm-btn-ghost adm-btn-sm" id="refreshHistoryBtn"><i data-lucide="refresh-cw"></i>刷新</button>
      </header>
      <div class="adm-card-body">
        ${records.length ? `
          <div class="adm-history-list">
            ${records.map((r, idx) => historyRecordHtml(r, idx)).join("")}
          </div>
        ` : '<div class="adm-empty"><i data-lucide="inbox"></i><p>暂无生成记录</p></div>'}
      </div>
    </div>
  `;
  refreshIcons();
  byId("refreshHistoryBtn")?.addEventListener("click", () => renderVideos());
  pane.querySelectorAll('[data-act="copy-text"]').forEach((btn) => {
    btn.addEventListener("click", () => {
      const text = btn.dataset.text || "";
      if (!text) return;
      navigator.clipboard?.writeText(text).then(() => toast("已复制。", "success")).catch(() => toast("复制失败。", "error"));
    });
  });
  pane.querySelectorAll('[data-act="refresh-history-task"]').forEach((btn) => {
    btn.addEventListener("click", async () => {
      const taskId = btn.dataset.taskId;
      const source = btn.dataset.source || "";
      if (!taskId) return;
      btn.disabled = true;
      try {
        if (source.startsWith("admin")) {
          await api(`/api/admin/character-scene-video/${encodeURIComponent(taskId)}`).catch(() => api(`/api/admin/home-video/${encodeURIComponent(taskId)}`));
        } else {
          await api(`/api/admin/character-scene-video/${encodeURIComponent(taskId)}`).catch(() => null);
        }
        toast("已尝试刷新任务状态。", "success");
        renderVideos();
      } catch (err) {
        toast(err.message || "刷新失败。", "error");
  } finally {
        btn.disabled = false;
      }
    });
  });
}

function historyRecordHtml(r, idx) {
  const finalPrompt = r.finalPrompt || r.prompt || "";
  const userPrompt = r.prompt || "";
  const sameAsFinal = finalPrompt === userPrompt;
  const params = [
    r.model ? `model: ${r.model}` : "",
    r.ratio ? `ratio: ${r.ratio}` : "",
    r.resolution ? `resolution: ${r.resolution}` : "",
    r.duration ? `duration: ${r.duration}s` : "",
    r.quality ? `quality: ${r.quality}` : "",
    r.source ? `source: ${r.source}` : "",
  ].filter(Boolean).join(" · ");
  const ownerLine = [
    r.companionName ? `角色 ${r.companionName}` : "",
    r.sceneName ? `场景 ${r.sceneName}` : "",
    r.userId ? `用户 ${r.userId}` : "",
  ].filter(Boolean).join(" · ");
  return `
    <article class="adm-history-item" data-idx="${idx}">
      <header class="adm-history-head">
        <div>
          <strong>${escapeHtml(ownerLine || r.taskId || "—")}</strong>
          <em>${statusPill(r.status)} · ${escapeHtml(fmtRelative(r.updatedAt || r.createdAt))}</em>
        </div>
        <div class="adm-row">
          ${r.localVideoUrl ? `<a class="adm-btn adm-btn-sm adm-btn-ghost" href="${escapeHtml(r.localVideoUrl)}" target="_blank" rel="noopener"><i data-lucide="play"></i>本地视频</a>` : ""}
          ${r.remoteVideoUrl ? `<a class="adm-btn adm-btn-sm adm-btn-ghost" href="${escapeHtml(r.remoteVideoUrl)}" target="_blank" rel="noopener"><i data-lucide="external-link"></i>原视频</a>` : ""}
          ${r.taskId ? `<button class="adm-btn adm-btn-sm adm-btn-ghost" data-act="refresh-history-task" data-task-id="${escapeHtml(r.taskId)}" data-source="${escapeHtml(r.source || "")}"><i data-lucide="refresh-cw"></i>查询</button>` : ""}
        </div>
      </header>
      <div class="adm-history-meta">
        <em class="adm-mono adm-truncate" title="${escapeHtml(r.taskId || "")}">taskId: ${escapeHtml(r.taskId || "—")}</em>
        ${params ? `<em class="adm-mono adm-truncate" title="${escapeHtml(params)}">${escapeHtml(params)}</em>` : ""}
        ${r.referenceAssetUri ? `<em class="adm-mono adm-truncate" title="${escapeHtml(r.referenceAssetUri)}">ref: ${escapeHtml(r.referenceAssetUri)}</em>` : ""}
        ${r.error ? `<em class="adm-error-text">${escapeHtml(r.error)}</em>` : ""}
      </div>
      <details class="adm-prompt-box adm-mt"${idx === 0 ? " open" : ""}>
        <summary>查看完整 Prompt（${(finalPrompt || "").length} chars${sameAsFinal ? "" : "，含装饰约束"}）</summary>
        ${userPrompt && !sameAsFinal ? `<div class="adm-prompt-section"><h4>用户原始 prompt</h4><pre class="adm-prompt-pre">${escapeHtml(userPrompt)}</pre></div>` : ""}
        <div class="adm-prompt-section"><h4>${sameAsFinal ? "Prompt（原样发送）" : "实际发送 prompt"}</h4><pre class="adm-prompt-pre">${escapeHtml(finalPrompt || "（无）")}</pre></div>
        <div class="adm-row adm-mt">
          <button class="adm-btn adm-btn-sm adm-btn-ghost" data-act="copy-text" data-text="${escapeHtml(finalPrompt)}"><i data-lucide="copy"></i>复制完整 Prompt</button>
          ${r.referenceAssetUri ? `<button class="adm-btn adm-btn-sm adm-btn-ghost" data-act="copy-text" data-text="${escapeHtml(r.referenceAssetUri)}"><i data-lucide="link"></i>复制 ref URI</button>` : ""}
        </div>
      </details>
    </article>
  `;
}

/* ============ SCENES ============ */
async function renderScenes() {
  const config = await loadConfig(true);
  const scenes = config.scenes || [];
  els.adminContent.innerHTML = `
    <section class="adm-page">
      <div class="adm-page-head">
        <div>
          <h2>场景管理</h2>
          <p class="adm-muted">维护用户端可用场景与场景预制 Prompt（用户自定义角色一键生成时使用）。</p>
        </div>
      </div>
      ${scenes.length ? `
        <div class="adm-grid adm-mt">
          ${scenes.map((s) => sceneCard(s)).join("")}
        </div>` : `<div class="adm-card adm-mt"><div class="adm-empty"><i data-lucide="map"></i><p>暂无场景</p></div></div>`}
    </section>
  `;
  refreshIcons();
  els.adminContent.querySelectorAll(".adm-card").forEach((card) => {
    const id = card.dataset.id;
    if (!id) return;
    card.querySelector('[data-act="save-scene"]')?.addEventListener("click", async () => {
      try {
        await api(`/api/admin/scenes/${encodeURIComponent(id)}`, {
          method: "PATCH",
          body: {
            name: card.querySelector('[data-f="name"]').value.trim(),
            shortName: card.querySelector('[data-f="shortName"]').value.trim(),
            icon: card.querySelector('[data-f="icon"]').value.trim(),
            price: Number(card.querySelector('[data-f="price"]').value) || 0,
            enabled: card.querySelector('[data-f="enabled"]').checked,
            prompt: card.querySelector('[data-f="prompt"]').value,
          },
        });
        toast("场景已保存。", "success");
        state.config = null;
      } catch (err) {
        toast(err.message, "error");
      }
    });
  });
}

function sceneCard(scene) {
  return `
    <article class="adm-card" data-id="${escapeHtml(scene.id)}">
      <header class="adm-card-head">
        <h3>${escapeHtml(scene.name)}（${escapeHtml(scene.id)}）</h3>
        <span class="adm-pill">${escapeHtml(scene.icon || "—")}</span>
      </header>
      <div class="adm-card-body">
        <div class="adm-grid adm-grid-3">
          <div class="adm-form-row"><span>名字</span><input data-f="name" type="text" value="${escapeHtml(scene.name)}" /></div>
          <div class="adm-form-row"><span>短名</span><input data-f="shortName" type="text" value="${escapeHtml(scene.shortName || "")}" /></div>
          <div class="adm-form-row"><span>图标 (lucide)</span><input data-f="icon" type="text" value="${escapeHtml(scene.icon || "")}" /></div>
          <div class="adm-form-row"><span>消耗（爱心币）</span><input data-f="price" type="number" min="0" value="${escapeHtml(scene.price ?? 0)}" /></div>
          <div class="adm-form-row"><span>启用</span><label class="adm-flex" style="gap:6px;align-items:center;"><input data-f="enabled" type="checkbox" ${scene.enabled ? "checked" : ""} style="width:18px;height:18px;" /><span class="adm-muted">用户端可见</span></label></div>
        </div>
        <div class="adm-form-row"><span>预制 Prompt（用户自定义角色一键生成时使用）</span><textarea data-f="prompt" rows="6">${escapeHtml(scene.prompt || "")}</textarea></div>
        <div class="adm-form-actions">
          <button class="adm-btn adm-btn-primary" data-act="save-scene"><i data-lucide="save"></i>保存场景</button>
        </div>
      </div>
    </article>
  `;
}

/* Scene-entry aware override. Kept after the legacy scene renderer so the
   route uses the latest definition without disturbing the rest of admin.js. */
async function renderScenes() {
  const config = await loadConfig(true);
  const scenes = config.scenes || [];
  els.adminContent.innerHTML = `
    <section class="adm-page">
      <div class="adm-page-head">
        <div>
          <h2>场景管理</h2>
          <p class="adm-muted">一个场景可以配置多个入口；用户端会直接展示这些入口。</p>
        </div>
      </div>
      ${scenes.length ? `
        <div class="adm-grid adm-mt">
          ${scenes.map((s) => sceneCard(s)).join("")}
        </div>` : `<div class="adm-card adm-mt"><div class="adm-empty"><i data-lucide="map"></i><p>暂无场景</p></div></div>`}
    </section>
  `;
  refreshIcons();
  els.adminContent.querySelectorAll(".adm-card").forEach((card) => {
    const id = card.dataset.id;
    if (!id) return;
    card.querySelector('[data-act="save-scene"]')?.addEventListener("click", async () => {
      try {
        await api(`/api/admin/scenes/${encodeURIComponent(id)}`, {
          method: "PATCH",
          body: {
            name: card.querySelector('[data-f="name"]').value.trim(),
            shortName: card.querySelector('[data-f="shortName"]').value.trim(),
            icon: card.querySelector('[data-f="icon"]').value.trim(),
            price: Number(card.querySelector('[data-f="price"]').value) || 0,
            enabled: card.querySelector('[data-f="enabled"]').checked,
            prompt: card.querySelector('[data-f="prompt"]').value,
          },
        });
        toast("场景已保存。", "success");
        state.config = null;
      } catch (err) {
        toast(err.message, "error");
      }
    });
    card.querySelector('[data-act="add-entry"]')?.addEventListener("click", async () => {
      const name = prompt("入口名字", "新入口");
      if (!name) return;
      try {
        await api(`/api/admin/scenes/${encodeURIComponent(id)}/entries`, {
          method: "POST",
          body: { name: name.trim() },
        });
        toast("入口已新增。", "success");
        state.config = null;
        renderScenes();
      } catch (err) {
        toast(err.message, "error");
      }
    });
    card.querySelectorAll("[data-entry-id]").forEach((row) => {
      row.querySelector('[data-act="save-entry"]')?.addEventListener("click", async () => {
        const entryId = row.dataset.entryId;
        try {
          await api(`/api/admin/scenes/${encodeURIComponent(id)}/entries/${encodeURIComponent(entryId)}`, {
            method: "PATCH",
            body: {
              name: row.querySelector('[data-f="entryName"]').value.trim(),
              enabled: row.querySelector('[data-f="entryEnabled"]').checked,
            },
          });
          toast("入口已保存。", "success");
          state.config = null;
          renderScenes();
        } catch (err) {
          toast(err.message, "error");
        }
      });
    });
  });
}

function sceneCard(scene) {
  const entries = Array.isArray(scene.entries) && scene.entries.length
    ? scene.entries
    : [{ id: "default", name: scene.shortName || scene.name || "Default", enabled: true }];
  return `
    <article class="adm-card" data-id="${escapeHtml(scene.id)}">
      <header class="adm-card-head">
        <h3>${escapeHtml(scene.name)} (${escapeHtml(scene.id)})</h3>
        <span class="adm-pill">${escapeHtml(scene.icon || "—")}</span>
      </header>
      <div class="adm-card-body">
        <div class="adm-grid adm-grid-3">
          <div class="adm-form-row"><span>名字</span><input data-f="name" type="text" value="${escapeHtml(scene.name)}" /></div>
          <div class="adm-form-row"><span>短名</span><input data-f="shortName" type="text" value="${escapeHtml(scene.shortName || "")}" /></div>
          <div class="adm-form-row"><span>图标 (lucide)</span><input data-f="icon" type="text" value="${escapeHtml(scene.icon || "")}" /></div>
          <div class="adm-form-row"><span>消耗（爱心币）</span><input data-f="price" type="number" min="0" value="${escapeHtml(scene.price ?? 0)}" /></div>
          <div class="adm-form-row"><span>启用</span><label class="adm-flex" style="gap:6px;align-items:center;"><input data-f="enabled" type="checkbox" ${scene.enabled ? "checked" : ""} style="width:18px;height:18px;" /><span class="adm-muted">用户端可见</span></label></div>
        </div>
        <div class="adm-form-row"><span>预制 Prompt</span><textarea data-f="prompt" rows="6">${escapeHtml(scene.prompt || "")}</textarea></div>
        <div class="adm-form-row">
          <span>入口</span>
          <div class="adm-entry-list">
            ${entries.map((entry) => `
              <div class="adm-entry-row" data-entry-id="${escapeHtml(entry.id)}">
                <input data-f="entryName" type="text" value="${escapeHtml(entry.name || "")}" />
                <label class="adm-flex" style="gap:6px;align-items:center;"><input data-f="entryEnabled" type="checkbox" ${entry.enabled !== false ? "checked" : ""} style="width:18px;height:18px;" /><span class="adm-muted">启用</span></label>
                <button class="adm-btn adm-btn-sm adm-btn-ghost" data-act="save-entry" type="button"><i data-lucide="save"></i>保存入口</button>
              </div>
            `).join("")}
          </div>
        </div>
        <div class="adm-form-actions">
          <button class="adm-btn adm-btn-primary" data-act="save-scene"><i data-lucide="save"></i>保存场景</button>
          <button class="adm-btn adm-btn-ghost" data-act="add-entry" type="button"><i data-lucide="plus"></i>新增入口</button>
        </div>
      </div>
    </article>
  `;
}

/* ============ USERS ============ */
async function renderUsers() {
  const payload = await api("/api/admin/users");
  const users = payload.users || [];
  els.adminContent.innerHTML = `
    <section class="adm-page">
      <div class="adm-page-head">
        <div>
          <h2>用户管理</h2>
          <p class="adm-muted">编辑积分、重置密码、切换角色或删除用户。</p>
        </div>
      </div>
      <div class="adm-card">
        <div class="adm-card-body adm-table-wrap">
          <table class="adm-table">
            <thead><tr><th>账号</th><th>角色</th><th>积分</th><th>自定义角色</th><th>钱包订单</th><th>注册时间</th><th class="adm-text-right">操作</th></tr></thead>
            <tbody>
              ${users.map((u) => `
                <tr data-id="${escapeHtml(u.id)}">
                  <td><strong>${escapeHtml(u.username)}</strong><br/><span class="adm-muted adm-mono">${escapeHtml(u.id)}</span></td>
                  <td><span class="adm-pill ${u.role === "admin" ? "is-admin" : ""}">${escapeHtml(u.role)}</span></td>
                  <td><strong>${escapeHtml(u.credits)}</strong></td>
                  <td>${escapeHtml(u.customCharacters || 0)}</td>
                  <td>${escapeHtml(u.walletOrders || 0)}</td>
                  <td>${fmtDate(u.createdAt)}</td>
                  <td>
                    <div class="adm-row-actions">
                      <button class="adm-btn adm-btn-sm adm-btn-ghost" data-act="edit-user"><i data-lucide="pencil"></i>编辑</button>
                      <button class="adm-btn adm-btn-sm adm-btn-ghost" data-act="reset-pwd"><i data-lucide="key-round"></i>重置密码</button>
                      <button class="adm-btn adm-btn-sm adm-btn-danger" data-act="delete-user"><i data-lucide="trash-2"></i>删除</button>
                    </div>
                  </td>
                </tr>`).join("")}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  `;
  refreshIcons();
  els.adminContent.querySelectorAll("tr[data-id]").forEach((tr) => {
    const id = tr.dataset.id;
    tr.querySelector('[data-act="edit-user"]')?.addEventListener("click", () => openEditUserDialog(id, users));
    tr.querySelector('[data-act="reset-pwd"]')?.addEventListener("click", () => openResetPwdDialog(id, users));
    tr.querySelector('[data-act="delete-user"]')?.addEventListener("click", () => deleteUser(id, users));
  });
}

function openEditUserDialog(id, users) {
  const user = users.find((u) => u.id === id);
  if (!user) return;
  const tpl = document.createElement("div");
  tpl.innerHTML = `
    <div class="adm-form-row"><span>账号</span><input value="${escapeHtml(user.username)}" disabled /></div>
    <div class="adm-form-row"><span>角色</span><select id="editRole">
      <option value="user" ${user.role === "user" ? "selected" : ""}>普通用户</option>
      <option value="admin" ${user.role === "admin" ? "selected" : ""}>管理员</option>
    </select></div>
    <div class="adm-form-row"><span>积分（直接设定）</span><input id="editCredits" type="number" min="0" value="${escapeHtml(user.credits)}" /></div>
    <div class="adm-form-row"><span>积分增减（可选）</span><input id="editCreditsDelta" type="number" placeholder="例如 +50 或 -10" /></div>
  `;
  openDialog({
    title: `编辑用户：${user.username}`,
    body: tpl,
    confirmText: "保存",
    onConfirm: async () => {
      const role = tpl.querySelector("#editRole").value;
      const credits = Number(tpl.querySelector("#editCredits").value);
      const delta = Number(tpl.querySelector("#editCreditsDelta").value);
      const body = { role };
      if (Number.isFinite(delta) && delta !== 0) body.creditsDelta = delta;
      else if (Number.isFinite(credits)) body.credits = credits;
      await api(`/api/admin/users/${encodeURIComponent(id)}`, { method: "PATCH", body });
      toast("已更新。", "success");
      renderUsers();
    },
  });
}

function openResetPwdDialog(id, users) {
  const user = users.find((u) => u.id === id);
  if (!user) return;
  const tpl = document.createElement("div");
  tpl.innerHTML = `
    <div class="adm-form-row"><span>账号</span><input value="${escapeHtml(user.username)}" disabled /></div>
    <div class="adm-form-row"><span>新密码（至少 6 位）</span><input id="newPwd" type="text" minlength="6" placeholder="新密码（明文，给用户）" /></div>
    <p class="adm-muted">操作后该用户其他设备的会话会被注销。</p>
  `;
  openDialog({
    title: `重置密码：${user.username}`,
    body: tpl,
    confirmText: "重置",
    onConfirm: async () => {
      const password = tpl.querySelector("#newPwd").value;
      if (password.length < 6) { toast("密码至少 6 位。", "error"); return false; }
      await api(`/api/admin/users/${encodeURIComponent(id)}/password`, { method: "POST", body: { password } });
      toast("密码已重置。", "success");
    },
  });
}

async function deleteUser(id, users) {
  const user = users.find((u) => u.id === id);
  if (!user) return;
  const ok = await confirmAction("删除用户", `确认删除用户 ${user.username}？该用户的会话/订单/素材/自定义角色都会一并删除（不可恢复）。`, { danger: true, confirmText: "删除" });
  if (!ok) return;
  await api(`/api/admin/users/${encodeURIComponent(id)}`, { method: "DELETE" });
  toast("已删除。", "success");
  renderUsers();
}

/* ============ WALLET ============ */
async function renderWallet() {
  const payload = await api("/api/admin/wallet-orders");
  const orders = payload.orders || [];
  els.adminContent.innerHTML = `
    <section class="adm-page">
      <div class="adm-page-head">
        <div>
          <h2>钱包订单</h2>
          <p class="adm-muted">USDT 充值订单列表。把订单标记为「paid」会同步把对应金额加到用户积分。</p>
        </div>
      </div>
      <div class="adm-card">
        <div class="adm-card-body adm-table-wrap">
          ${orders.length ? `
            <table class="adm-table">
              <thead><tr><th>订单</th><th>用户</th><th>充值</th><th>到账金额</th><th>地址</th><th>状态</th><th>时间</th><th class="adm-text-right">操作</th></tr></thead>
              <tbody>
                ${orders.map((o) => `
                  <tr data-id="${escapeHtml(o.id)}">
                    <td class="adm-mono adm-truncate">${escapeHtml(o.id)}</td>
                    <td>${escapeHtml(o.username || o.userId)}</td>
                    <td><strong>${escapeHtml(o.baseAmount)}</strong> ${escapeHtml(o.asset || "")}</td>
                    <td><strong>${escapeHtml(o.payableAmountText || "")}</strong></td>
                    <td class="adm-mono adm-truncate">${escapeHtml(o.address || "—")}</td>
                    <td>${statusPill(o.status)}</td>
                    <td>${fmtDate(o.createdAt)}</td>
                    <td>
                      <div class="adm-row-actions">
                        ${o.status !== "paid" ? `<button class="adm-btn adm-btn-sm adm-btn-primary" data-act="mark-paid"><i data-lucide="check"></i>标为已到账</button>` : ""}
                        ${o.status !== "cancelled" && o.status !== "paid" ? `<button class="adm-btn adm-btn-sm adm-btn-ghost" data-act="cancel-order"><i data-lucide="x"></i>取消</button>` : ""}
                      </div>
                    </td>
                  </tr>`).join("")}
              </tbody>
            </table>
          ` : `<div class="adm-empty"><i data-lucide="wallet"></i><p>暂无订单</p></div>`}
        </div>
      </div>
    </section>
  `;
  refreshIcons();
  els.adminContent.querySelectorAll("tr[data-id]").forEach((tr) => {
    const id = tr.dataset.id;
    tr.querySelector('[data-act="mark-paid"]')?.addEventListener("click", async () => {
      await api(`/api/admin/wallet-orders/${encodeURIComponent(id)}`, { method: "PATCH", body: { status: "paid" } });
      toast("已标为到账，用户积分已增加。", "success");
      renderWallet();
    });
    tr.querySelector('[data-act="cancel-order"]')?.addEventListener("click", async () => {
      await api(`/api/admin/wallet-orders/${encodeURIComponent(id)}`, { method: "PATCH", body: { status: "cancelled" } });
      toast("订单已取消。", "success");
      renderWallet();
    });
  });
}

/* ============ CONFIG ============ */
async function renderConfig() {
  const config = await loadConfig(true);
  els.adminContent.innerHTML = `
    <section class="adm-page">
      <div class="adm-page-head">
        <div>
          <h2>系统配置</h2>
          <p class="adm-muted">直接编辑底层 JSON 配置（高级模式）。常规改动建议在「角色 / 场景 / 钱包」页面操作。</p>
        </div>
        <div class="adm-page-actions">
          <button class="adm-btn adm-btn-ghost" id="reloadConfigBtn"><i data-lucide="refresh-cw"></i>刷新</button>
          <button class="adm-btn adm-btn-primary" id="saveConfigBtn"><i data-lucide="save"></i>保存</button>
        </div>
      </div>
      <div class="adm-card">
        <div class="adm-card-body">
          <textarea id="configEditor" spellcheck="false">${escapeHtml(JSON.stringify(config, null, 2))}</textarea>
          <p class="adm-muted adm-mt">保存后用户端刷新即可看到新配置。</p>
        </div>
      </div>
    </section>
  `;
  refreshIcons();
  byId("reloadConfigBtn")?.addEventListener("click", async () => {
    state.config = null;
    renderConfig();
    toast("已重新拉取配置。", "success");
  });
  byId("saveConfigBtn")?.addEventListener("click", async () => {
    try {
      const config = JSON.parse(byId("configEditor").value);
      const payload = await api("/api/admin/config", { method: "PUT", body: { config } });
      state.config = payload.config || config;
      toast("配置已保存。", "success");
    } catch (err) {
      toast(err.message, "error");
    }
  });
}

/* ============ boot ============ */
async function bootstrap() {
  if (!state.token) {
    showLogin();
    return;
  }
  try {
    const me = await fetch("/api/auth/me", {
      headers: { authorization: `Bearer ${state.token}` },
    }).then((r) => r.json()).catch(() => ({}));
    if (!me?.user || me.user.role !== "admin") {
      throw new Error(me?.message || "需要管理员账号");
    }
    state.user = me.user;
    showApp();
  } catch (err) {
    state.token = "";
    state.user = null;
    localStorage.removeItem(TOKEN_KEY);
    showLogin();
  }
}

els.loginForm?.addEventListener("submit", doLogin);
els.logoutBtn?.addEventListener("click", doLogout);
els.sidebarToggle?.addEventListener("click", () => els.appView.classList.toggle("is-nav-open"));
els.navToggle?.addEventListener("click", () => els.appView.classList.toggle("is-nav-open"));
els.adminNav?.addEventListener("click", (e) => {
  const a = e.target.closest("a[data-route]");
  if (!a) return;
  // Let hashchange take over; but also close mobile nav.
  els.appView.classList.remove("is-nav-open");
});

window.addEventListener("hashchange", () => {
  if (state.token && state.user) routeFromHash();
});

bootstrap();
