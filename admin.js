"use strict";

const TOKEN_KEY = "raisingGameAdminToken";
const LEGACY_TOKEN_KEY = "raisingGameToken";
const ADVANCED_SEEDANCE_FPS = 24;
const ADVANCED_SEEDANCE_720P_CREDITS_PER_SECOND = 30;
const ADVANCED_SEEDANCE_1080P_CREDITS_PER_SECOND = 60;
const ADVANCED_SEEDANCE_VIDEO_INPUT_720P_CREDITS_PER_SECOND = 20;
const ADVANCED_SEEDANCE_VIDEO_INPUT_1080P_CREDITS_PER_SECOND = 40;
const ADVANCED_WAN27_720P_CREDITS_PER_SECOND = 20;
const ADVANCED_WAN27_1080P_CREDITS_PER_SECOND = 50;
const ADVANCED_CREDITS_PER_USD = 100;
const INTERNAL_CNY_PER_USD = 5;
const ADVANCED_CREDITS_PER_CNY = ADVANCED_CREDITS_PER_USD / INTERNAL_CNY_PER_USD;
const ADVANCED_GENERATION_MARKUP = 1.5;
const ADVANCED_SEEDANCE_REFERENCE_LIMIT = 6;
const ADVANCED_SEEDANCE_REFERENCE_MAX_BYTES = 8 * 1024 * 1024;
const ADVANCED_WAN_CLIP_MAX_BYTES = 30 * 1024 * 1024;
const ADVANCED_WAN_CLIP_MAX_SECONDS = 5.05;
const WAN27_MEDIA_MODES = [
  ["first_frame", "单图首帧"],
  ["first_last_frame", "首帧 + 尾帧"],
  ["first_frame_audio", "首帧 + 音频"],
  ["first_last_frame_audio", "首帧 + 尾帧 + 音频"],
  ["first_clip", "视频续写"],
  ["first_clip_last_frame", "视频续写 + 尾帧"],
];

function pricingMultiplierText(value) {
  const next = Number(value || 1);
  return Number.isFinite(next) ? String(Math.round(next * 10000) / 10000) : "1";
}

const ROUTES = [
  { id: "dashboard", title: "仪表盘", render: renderDashboard },
  { id: "platform", title: "首页广场", render: renderPlatform },
  { id: "advanced-cases", title: "高级案例", render: renderAdvancedCases },
  { id: "characters", title: "角色管理", render: renderCharacters },
  { id: "videos", title: "视频管理", render: renderVideos },
  { id: "records", title: "生成记录", render: renderGenerationRecords },
  { id: "scenes", title: "场景管理", render: renderScenes },
  { id: "users", title: "用户管理", render: renderUsers },
  { id: "support", title: "站内信", render: renderSupportMessages },
  { id: "wallet", title: "钱包订单", render: renderWallet },
  { id: "pricing", title: "价格配置", render: renderPricing },
  { id: "config", title: "系统配置", render: renderConfig },
];
ROUTES.splice(Math.max(0, ROUTES.findIndex((route) => route.id === "config")), 0, {
  id: "geo",
  title: "GEO",
  render: renderGeo,
});
const TENANT_HIDDEN_ADMIN_ROUTES = new Set(["characters", "videos", "scenes", "config"]);

function isTenantAdminHost() {
  return /(^|\.)(cloudtoken\.ai|667zui\.video)$/i.test(window.location.hostname || "");
}

function visibleAdminRoutes() {
  if (!isTenantAdminHost()) return ROUTES;
  return ROUTES.filter((route) => !TENANT_HIDDEN_ADMIN_ROUTES.has(route.id));
}

const state = {
  token: localStorage.getItem(TOKEN_KEY) || localStorage.getItem(LEGACY_TOKEN_KEY) || "",
  user: null,
  config: null,
  route: "dashboard",
  cache: {},
};

let adminHistoryPollTimer = null;
let adminRecordPollTimer = null;
let adminHistorySignature = "";
let adminRecordSignature = "";
const ADMIN_GENERATION_POLL_MS = 12000;

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

function isActiveRoute(routeId) {
  return state.route === routeId && !els.appView?.hidden;
}

function activeRoutePane(id, routeId) {
  const pane = byId(id);
  if (!pane || !pane.isConnected || !isActiveRoute(routeId)) return null;
  return pane;
}

function renderRouteError(routeId, err) {
  if (!routeId || isActiveRoute(routeId)) {
    renderError(err);
    return;
  }
  console.warn("Ignored stale admin render error:", err);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function maskMiddle(value = "") {
  const text = String(value || "");
  if (!text) return "—";
  if (text.length <= 16) return `${text.slice(0, 4)}...${text.slice(-4)}`;
  return `${text.slice(0, 10)}...${text.slice(-8)}`;
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

function shortText(value, length = 90) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  return text.length > length ? `${text.slice(0, length - 1)}…` : text;
}

function jsonPretty(value) {
  if (value === undefined || value === null || value === "") return "";
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function copyText(text, success = "Copied.") {
  if (!text) return;
  navigator.clipboard?.writeText(text)
    .then(() => toast(success, "success"))
    .catch(() => toast("Copy failed.", "error"));
}

function readVideoDuration(file) {
  return new Promise((resolve, reject) => {
    const video = document.createElement("video");
    const url = URL.createObjectURL(file);
    const cleanup = () => URL.revokeObjectURL(url);
    video.preload = "metadata";
    video.onloadedmetadata = () => {
      const duration = Number(video.duration || 0);
      cleanup();
      resolve(duration);
    };
    video.onerror = () => {
      cleanup();
      reject(new Error("读取视频失败"));
    };
    video.src = url;
  });
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
  applyAdminNavVisibility();
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
function ensureGeoNavItem() {
  if (!els.adminNav || els.adminNav.querySelector('[data-route="geo"]')) return;
  const link = document.createElement("a");
  link.href = "#/geo";
  link.dataset.route = "geo";
  link.innerHTML = '<i data-lucide="radar"></i><span>GEO</span>';
  const configLink = els.adminNav.querySelector('[data-route="config"]');
  if (configLink) els.adminNav.insertBefore(link, configLink);
  else els.adminNav.appendChild(link);
}

function applyAdminNavVisibility() {
  ensureGeoNavItem();
  els.adminNav?.querySelectorAll("a[data-route]").forEach((a) => {
    const hidden = isTenantAdminHost() && TENANT_HIDDEN_ADMIN_ROUTES.has(a.dataset.route);
    a.hidden = hidden;
    a.setAttribute("aria-hidden", hidden ? "true" : "false");
  });
}

function routeFromHash() {
  const hash = window.location.hash.replace(/^#\//, "").trim();
  const routes = visibleAdminRoutes();
  const route = routes.find((r) => r.id === hash) || routes[0] || ROUTES[0];
  if (hash && route.id !== hash && isTenantAdminHost() && TENANT_HIDDEN_ADMIN_ROUTES.has(hash)) {
    window.history.replaceState(null, "", `#/${route.id}`);
  }
  const routeId = route.id;
  state.route = routeId;
  stopAdminAutoRefresh();
  els.adminNav.querySelectorAll("a").forEach((a) => {
    a.classList.toggle("is-active", a.dataset.route === route.id);
  });
  els.pageTitle.textContent = route.title;
  els.adminContent.innerHTML = '<div class="adm-loading"><div class="adm-spinner"></div></div>';
  document.body.classList?.remove("is-nav-open");
  els.appView.classList?.remove("is-nav-open");
  Promise.resolve()
    .then(() => route.render())
    .catch((err) => renderRouteError(routeId, err));
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

function isTerminalGenerationStatus(status) {
  return ["succeeded", "success", "done", "completed", "failed", "error", "cancelled", "canceled", "reference_failed", "rejected", "refunded", "deleted", "hidden"]
    .includes(String(status || "").toLowerCase().trim());
}

function shouldPollGenerationRecord(record = {}) {
  return Boolean(record.taskId) && !isTerminalGenerationStatus(record.status);
}

function hasPollableGenerationRecords(records = []) {
  return Array.isArray(records) && records.some(shouldPollGenerationRecord);
}

function recordPreviewUrl(record = {}) {
  return record.localVideoUrl || record.videoUrl || record.remoteVideoUrl || "";
}

function generationRecordSignature(record = {}) {
  const billing = record.billing || {};
  return [
    record.taskId,
    record.updatedAt,
    record.status,
    record.error,
    recordPreviewUrl(record),
    record.ratio,
    record.resolution,
    record.duration,
    JSON.stringify(record.mediaAssets || []),
    billing.status,
    billing.final,
    billing.settled,
  ].map((value) => String(value ?? "")).join("|");
}

function generationRecordsSignature(records = []) {
  return [...records]
    .sort((left, right) => String(left.taskId || "").localeCompare(String(right.taskId || "")))
    .map(generationRecordSignature)
    .join("\n");
}

function stopAdminHistoryPoll() {
  if (adminHistoryPollTimer) window.clearTimeout(adminHistoryPollTimer);
  adminHistoryPollTimer = null;
}

function stopAdminRecordPoll() {
  if (adminRecordPollTimer) window.clearTimeout(adminRecordPollTimer);
  adminRecordPollTimer = null;
}

function stopAdminAutoRefresh() {
  stopAdminHistoryPoll();
  stopAdminRecordPoll();
  adminHistorySignature = "";
  adminRecordSignature = "";
}

function scheduleAdminHistoryPoll(records = []) {
  stopAdminHistoryPoll();
  if (!hasPollableGenerationRecords(records)) return;
  if (!activeRoutePane("videoPaneBody", "videos")) return;
  if ((sessionStorage.getItem("admTabVideos") || "scene") !== "history") return;
  adminHistoryPollTimer = window.setTimeout(() => {
    adminHistoryPollTimer = null;
    if (!activeRoutePane("videoPaneBody", "videos")) return;
    if ((sessionStorage.getItem("admTabVideos") || "scene") !== "history") return;
    renderHistory({ silent: true, refresh: true }).catch((err) => renderRouteError("videos", err));
  }, ADMIN_GENERATION_POLL_MS);
}

function scheduleAdminRecordPoll(records = [], load) {
  stopAdminRecordPoll();
  if (!hasPollableGenerationRecords(records) || typeof load !== "function") return;
  if (!activeRoutePane("recordTablePane", "records")) return;
  adminRecordPollTimer = window.setTimeout(() => {
    adminRecordPollTimer = null;
    if (!activeRoutePane("recordTablePane", "records")) return;
    load({ silent: true, refresh: true }).catch((err) => renderRouteError("records", err));
  }, ADMIN_GENERATION_POLL_MS);
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
function openDialog({ title, body, confirmText = "确定", cancelText = "取消", showCancel = true, hideConfirm = false, onConfirm, onOpen }) {
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
      const value = event.submitter?.value || "close";
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
      resolve(els.dialog.returnValue || "close");
    };
    els.dialogForm.addEventListener("submit", handler);
    els.dialog.addEventListener("close", closeHandler);
    els.dialog.showModal();
    if (typeof onOpen === "function") {
      onOpen(els.dialogBody);
    }
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
  const dashboard = await api("/api/admin/dashboard");
  if (!isActiveRoute("dashboard")) return;
  const s = dashboard.stats || {};
  const recent = dashboard.recentRecords || [];

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
          <h3>最近 5 条生成记录</h3>
          <a class="adm-btn adm-btn-ghost adm-btn-sm" href="#/records"><i data-lucide="arrow-up-right"></i>查看记录</a>
        </header>
        <div class="adm-card-body adm-table-wrap">
          ${recent.length ? `
            <table class="adm-table adm-dashboard-table">
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
  const pane = activeRoutePane("charPaneBody", "characters");
  if (!pane || (sessionStorage.getItem("admTabCharacters") || "preset") !== "preset") return;
  const items = config.homeVideo?.items || [];
  const activeId = config.homeVideo?.activeItemId || "";
  const scenes = config.scenes || [];
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
  if (!confirm("将清空旧的合成参考图并重新生成素材，可能耗时 1-3 分钟。继续？")) return;
  try {
    await api(`/api/admin/home-items/${encodeURIComponent(itemId)}/rebuild-reference`, {
      method: "POST",
      body: JSON.stringify({ force: true }),
    });
    toast("已开始重建参考图，需要时请手动点击刷新。");
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
        <button class="adm-btn adm-btn-sm adm-btn-ghost" data-act="bind-scene"><i data-lucide="map-pinned"></i>场景视频</button>
        <button class="adm-btn adm-btn-sm adm-btn-ghost" data-act="regen"><i data-lucide="clapperboard"></i>主视频</button>
        <button class="adm-btn adm-btn-sm adm-btn-ghost" data-act="rebuild-ref" title="清空旧的合成参考图，重新生成一次素材"><i data-lucide="image-down"></i>重建参考图</button>
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
      return "创建中";
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
    <div class="adm-form-row"><span>Prompt（保存后生成视频时原样使用）</span><textarea id="presetPrompt" placeholder="可留空。填写后只作为视频 prompt 保存，不会附加到参考图 prompt。"></textarea></div>
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
      const prompt = tpl.querySelector("#presetPrompt").value;
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
          prompt: tpl.querySelector("#editPrompt").value,
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
  const homeSceneVideos = item.homeSceneVideos || {};
  tpl.innerHTML = `
    <p class="adm-muted">Configure the main video shown on the home page for "${escapeHtml(item.name)}". You can save the prompt only, or submit generation now.</p>
    <div class="adm-form-row adm-mt"><span>Provider</span><select id="genProvider"><option value="seedance">Seedance / Ark</option><option value="ifilm-cli">ifilm CLI (when available)</option></select></div>
    <div class="adm-form-row"><span>Scene</span><select id="genHomeScene">
      ${scenes.map((scene) => {
        const entry = homeSceneVideos[scene.id] || {};
        const tag = entry.taskId ? `(${statusText(entry.status)})` : entry.userPrompt ? "(prompt saved)" : "(not generated)";
        return `<option value="${escapeHtml(scene.id)}" data-default-prompt="${escapeHtml(scene.prompt || "")}">${escapeHtml(scene.name || scene.id)} ${tag}</option>`;
      }).join("")}
    </select></div>
    <div class="adm-form-row"><span>Prompt</span><textarea id="genPrompt" rows="6" placeholder="Enter a prompt, then save it or generate the main video."></textarea></div>
    <p class="adm-muted adm-mt" id="genPromptHint"></p>
  `;

  const select = tpl.querySelector("#genHomeScene");
  const promptEl = tpl.querySelector("#genPrompt");
  const hintEl = tpl.querySelector("#genPromptHint");
  function syncMainPrompt() {
    const sceneId = select.value;
    const entry = homeSceneVideos[sceneId] || {};
    const savedPrompt = String(entry.userPrompt || entry.savedPrompt || "").trim();
    const fallback = String(entry.prompt || item.prompt || select.options[select.selectedIndex]?.dataset.defaultPrompt || "").trim();
    promptEl.value = savedPrompt || "";
    promptEl.placeholder = fallback || "Save this prompt to prefill the user creation dialog.";
    const lines = [];
    if (entry.taskId) lines.push(`Existing main video task ${entry.taskId} (${statusText(entry.status)}).`);
    if (savedPrompt) lines.push("Saved prompt will prefill the user creation dialog.");
    else if (fallback) lines.push("No saved prompt yet; generation can still use the fallback prompt.");
    hintEl.textContent = lines.join(" ");
  }
  select.addEventListener("change", syncMainPrompt);
  setTimeout(syncMainPrompt, 0);

  openDialog({
    title: `Main video - ${item.name || item.id}`,
    body: tpl,
    confirmText: "Generate",
    cancelText: "Save prompt only",
    onConfirm: async () => {
      const provider = tpl.querySelector("#genProvider").value;
      const sceneId = select.value || "room";
      const prompt = promptEl.value;
      await api("/api/admin/home-video", {
        method: "POST",
        body: { itemId, sceneId, provider, prompt, name: item.name, title: item.title },
      });
      toast("Main video task submitted. Check the Videos page for progress.", "success");
      state.config = null;
      renderCharacters();
    },
  }).then(async (value) => {
    if (value !== "cancel") return;
    const sceneId = select.value || "room";
    const prompt = promptEl.value;
    try {
      await api("/api/admin/home-video", {
        method: "POST",
        body: { itemId, sceneId, provider: tpl.querySelector("#genProvider").value, prompt, name: item.name, title: item.title, saveOnly: true },
      });
      toast("Main video prompt saved.", "success");
      state.config = null;
      renderCharacters();
    } catch (err) {
      toast(err.message, "error");
    }
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
      <p class="adm-muted">Configure the scene video users create from the popup for "${escapeHtml(item.name)}". You can save the prompt only, or submit generation now.</p>
      <label class="adm-field adm-mt">
        <span>Scene</span>
        <select id="sceneBindScene">
          ${scenes.map((scene) => {
            const entry = sceneVideos[scene.id] || {};
            const tag = entry.taskId ? `(${statusText(entry.status)})` : entry.userPrompt ? "(prompt saved)" : "(not generated)";
            return `<option value="${escapeHtml(scene.id)}" data-default-prompt="${escapeHtml(scene.prompt || "")}">${escapeHtml(scene.name || scene.id)} ${tag}</option>`;
          }).join("")}
        </select>
      </label>
      <label class="adm-field adm-mt">
        <span>Prompt</span>
        <textarea id="sceneBindPrompt" rows="6" placeholder="Enter a prompt, then save it or generate the scene video."></textarea>
      </label>
      <p class="adm-muted adm-mt" id="sceneBindHint"></p>
    `;
    const select = tpl.querySelector("#sceneBindScene");
    const promptEl = tpl.querySelector("#sceneBindPrompt");
    const hintEl = tpl.querySelector("#sceneBindHint");
    function syncHint() {
      const sceneId = select.value;
      const entry = sceneVideos[sceneId] || {};
      const savedPrompt = String(entry.userPrompt || entry.savedPrompt || "").trim();
      const fallback = String(entry.prompt || select.options[select.selectedIndex]?.dataset.defaultPrompt || "").trim();
      promptEl.value = savedPrompt || "";
      promptEl.placeholder = fallback || "Save this prompt to prefill the user creation dialog.";
      const lines = [];
      if (entry.taskId) lines.push(`Existing scene video task ${entry.taskId} (${statusText(entry.status)}); submitting again will overwrite the record.`);
      if (savedPrompt) lines.push("Saved prompt will prefill the user creation dialog.");
      else if (fallback) lines.push(`Fallback prompt: ${fallback.length > 80 ? fallback.slice(0, 80) + "..." : fallback}`);
      hintEl.textContent = lines.join(" ");
    }
    select.addEventListener("change", syncHint);
    setTimeout(syncHint, 0);
    openDialog({
      title: `Scene video - ${item.name || item.id}`,
      body: tpl,
      confirmText: "Generate",
      cancelText: "Save prompt only",
      onConfirm: async () => {
        const sceneId = select.value;
        const prompt = promptEl.value;
        try {
          await api("/api/admin/character-scene-video", {
            method: "POST",
            body: { itemId, sceneId, prompt },
          });
          toast(`Scene video task submitted for ${sceneId}.`, "success");
          state.config = null;
          sessionStorage.setItem("admTabVideos", "scene");
          window.location.hash = "#/videos";
        } catch (err) {
          toast(err.message, "error");
          throw err;
        }
      },
    }).then(async (value) => {
      if (value !== "cancel") return;
      const sceneId = select.value;
      const prompt = promptEl.value;
      try {
        await api("/api/admin/character-scene-video", {
          method: "POST",
          body: { itemId, sceneId, prompt, saveOnly: true },
        });
        toast("Scene video prompt saved.", "success");
        state.config = null;
        renderCharacters();
      } catch (err) {
        toast(err.message, "error");
      }
    });
  });
}

async function renderUserCharacters() {
  const payload = await api("/api/admin/my-characters");
  const pane = activeRoutePane("charPaneBody", "characters");
  if (!pane || (sessionStorage.getItem("admTabCharacters") || "preset") !== "user") return;
  const list = payload.characters || [];
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
    card.querySelector('[data-act="add-user-credits"]')?.addEventListener("click", () => {
      openAddCreditsFromCharacterDialog(id, list);
    });
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
        ${c.userId ? `<button class="adm-btn adm-btn-sm adm-btn-primary" data-act="add-user-credits"><i data-lucide="gem"></i>加积分</button>` : ""}
        <button class="adm-btn adm-btn-sm adm-btn-danger" data-act="delete-user-char"><i data-lucide="trash-2"></i>删除</button>
      </div>
    </article>
  `;
}

function openAddCreditsFromCharacterDialog(id, characters) {
  const character = (characters || []).find((item) => item.id === id);
  if (!character?.userId) {
    toast("找不到这个角色的归属账号。", "error");
    return;
  }

  const account = character.username || character.userId;
  const tpl = document.createElement("div");
  tpl.innerHTML = `
    <div class="adm-form-row"><span>账号</span><input value="${escapeHtml(account)}" disabled /></div>
    <div class="adm-form-row"><span>增加积分</span><input id="addCreditsAmount" type="number" min="1" step="1" inputmode="numeric" placeholder="例如 100" /></div>
    <p class="adm-muted">会直接增加到该账号余额，不生成充值订单。</p>
  `;

  openDialog({
    title: "增加积分",
    body: tpl,
    confirmText: "确认增加",
    onConfirm: async () => {
      const amount = Number(tpl.querySelector("#addCreditsAmount")?.value);
      if (!Number.isFinite(amount) || amount <= 0) {
        toast("请输入大于 0 的积分。", "error");
        return false;
      }
      const creditsDelta = Math.round(amount);
      if (creditsDelta <= 0) {
        toast("积分必须至少增加 1。", "error");
        return false;
      }
      await api(`/api/admin/users/${encodeURIComponent(character.userId)}`, {
        method: "PATCH",
        body: { creditsDelta },
      });
      toast(`已给 ${account} 增加 ${creditsDelta} 积分。`, "success");
      renderCharacters();
    },
  });
  setTimeout(() => tpl.querySelector("#addCreditsAmount")?.focus(), 60);
}

/* ============ VIDEOS ============ */
async function renderVideos() {
  const stored = sessionStorage.getItem("admTabVideos");
  const tab = ["scene", "history"].includes(stored) ? stored : "scene";
  if (tab !== "history") stopAdminHistoryPoll();
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

  const pane = activeRoutePane("videoPaneBody", "videos");
  if (pane) pane.innerHTML = '<div class="adm-loading"><div class="adm-spinner"></div></div>';
  if (tab === "scene") await renderSceneVideos();
  else await renderHistory();
}

async function renderSceneVideos() {
  const initialPane = activeRoutePane("videoPaneBody", "videos");
  const previousScrollTop = initialPane?.scrollTop || 0;
  const [config, myChars] = await Promise.all([
    loadConfig(true),
    api("/api/admin/my-characters"),
  ]);
  const pane = activeRoutePane("videoPaneBody", "videos");
  if (!pane || (sessionStorage.getItem("admTabVideos") || "scene") !== "scene") return;
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

  pane.innerHTML = cards.length ? `
    <div class="adm-row adm-mt" style="justify-content:space-between;align-items:center;">
      <p class="adm-muted" style="margin:0;">共 ${cards.length} 条场景视频（后台 ${adminCount} · 用户 ${userCount}）。点「查询」拉取最新状态，点「重新生成」基于原 prompt 再发一次任务。</p>
      <button class="adm-btn adm-btn-ghost adm-btn-sm" id="refreshSceneVideosBtn"><i data-lucide="refresh-cw"></i>刷新列表</button>
    </div>
    <div class="adm-video-grid adm-mt">
      ${cards.map((c, idx) => sceneVideoCardHtml(c, idx)).join("")}
    </div>` : `<div class="adm-card adm-mt"><div class="adm-empty"><i data-lucide="link"></i><p>还没有场景视频。在「角色」页面里给角色生成场景视频，会出现在这里。</p></div></div>`;
  refreshIcons();
  pane.scrollTop = previousScrollTop;

  byId("refreshSceneVideosBtn")?.addEventListener("click", () => renderSceneVideos());

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
        renderSceneVideos();
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
        renderSceneVideos();
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

async function renderHistory({ silent = false, refresh = false } = {}) {
  stopAdminHistoryPoll();
  const initialPane = activeRoutePane("videoPaneBody", "videos");
  const previousScrollTop = initialPane?.scrollTop || 0;
  const payload = await api(`/api/admin/generation-records?limit=120${refresh ? "&refresh=1" : ""}`);
  const pane = activeRoutePane("videoPaneBody", "videos");
  if (!pane || (sessionStorage.getItem("admTabVideos") || "scene") !== "history") return;
  const records = payload.records || [];
  const nextSignature = generationRecordsSignature(records);
  if (silent && nextSignature === adminHistorySignature) {
    scheduleAdminHistoryPoll(records);
    return;
  }
  adminHistorySignature = nextSignature;
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
  pane.scrollTop = previousScrollTop;
  scheduleAdminHistoryPoll(records);
  byId("refreshHistoryBtn")?.addEventListener("click", () => renderHistory({ refresh: true }));
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
        renderHistory();
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
        <summary>查看完整 Prompt（${(finalPrompt || "").length} chars${sameAsFinal ? "" : "，历史任务可能含旧版拼接"}）</summary>
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

/* ============ GENERATION RECORDS ============ */
function recordVideoUrl(record) {
  return record.localVideoUrl || "";
}

function recordRemoteVideoUrl(record) {
  return record.remoteVideoUrl || record.videoUrl || "";
}

function recordImageResultUrl(record) {
  return record.localImageUrl || record.imageResultUrl || record.cdnImageUrl || record.remoteImageUrl || "";
}

function recordMediaAssetPreviewUrl(asset = {}) {
  return asset.imageUrl || asset.localUrl || asset.url || asset.sourceImageUrl || "";
}

function recordMediaAssetLabel(asset = {}, index = 0) {
  if (asset.type === "first_frame" || asset.key === "firstFrame") return "First frame";
  if (asset.type === "last_frame" || asset.key === "lastFrame") return "Last frame";
  if (asset.type === "reference_image") return `Reference ${index + 1}`;
  return String(asset.type || asset.key || `Image ${index + 1}`).replace(/_/g, " ");
}

function recordImageAssets(record = {}) {
  const images = [];
  const seen = new Set();
  const pushImage = (asset = {}, fallbackLabel = "") => {
    const url = recordMediaAssetPreviewUrl(asset);
    if (!url || seen.has(url)) return;
    seen.add(url);
    images.push({ ...asset, label: asset.label || fallbackLabel || recordMediaAssetLabel(asset, images.length) });
  };
  (Array.isArray(record.mediaAssets) ? record.mediaAssets : [])
    .filter((asset) => !["driving_audio", "first_clip"].includes(asset.type))
    .forEach((asset) => pushImage(asset));
  const upstreamMedia = Array.isArray(record.upstreamPayload?.input?.media) ? record.upstreamPayload.input.media : [];
  upstreamMedia
    .filter((asset) => !["driving_audio", "first_clip"].includes(asset.type))
    .forEach((asset) => pushImage(asset));
  pushImage({ imageUrl: record.imageUrl, type: "reference_image" }, "Reference");
  pushImage({ imageUrl: record.sourceImageUrl, type: "source_image" }, "Source image");
  return images;
}

function recordPrimaryImageUrl(record = {}) {
  const images = recordImageAssets(record);
  return toAbsoluteHttpUrl(images[0] ? recordMediaAssetPreviewUrl(images[0]) : "")
    || toAbsoluteHttpUrl(record.sourceImageUrl || record.imageUrl || record.localPosterUrl || record.posterUrl || "");
}

function recordMediaAssetVideoUrl(asset = {}) {
  return asset.videoUrl || asset.url || asset.localUrl || "";
}

function recordInputVideoAsset(record = {}) {
  const assets = Array.isArray(record.mediaAssets) ? record.mediaAssets : [];
  return assets.find((asset) => asset && ["reference_video", "first_clip"].includes(asset.type)) || null;
}

function recordInputVideoUrl(record = {}) {
  const asset = recordInputVideoAsset(record);
  return toAbsoluteHttpUrl(asset ? recordMediaAssetVideoUrl(asset) : "")
    || toAbsoluteHttpUrl(record.params?.firstClipUrl || record.params?.first_clip_url || "");
}

function recordInputVideoPosterUrl(record = {}) {
  const asset = recordInputVideoAsset(record);
  return toAbsoluteHttpUrl(asset?.posterUrl || asset?.imageUrl || asset?.thumbnailUrl || asset?.localPosterUrl || "")
    || toAbsoluteHttpUrl(record.localPosterUrl || record.posterUrl || record.imageUrl || "");
}

function recordImageAssetsHtml(record = {}) {
  const images = recordImageAssets(record);
  if (!images.length) return "";
  return `
    <div class="adm-record-reference-grid">
      ${images.map((asset) => `
        <figure>
          <img src="${escapeHtml(recordMediaAssetPreviewUrl(asset))}" alt="" />
          <figcaption>${escapeHtml(asset.label || "")}</figcaption>
        </figure>
      `).join("")}
    </div>
  `;
}

function toAbsoluteHttpUrl(value = "") {
  const url = String(value || "").trim();
  if (/^https?:\/\//i.test(url)) return url;
  if (url.startsWith("/")) return `${window.location.origin}${url}`;
  return "";
}

function recordRatioStyle(record = {}) {
  const ratio = normalizeVideoRatio(record.ratio || record.params?.ratio || record.params?.aspect_ratio || record.upstreamPayload?.ratio || record.upstreamPayload?.aspect_ratio);
  const [width, height] = ratio.split(":").map((part) => Math.max(1, Number(part) || 1));
  return `--video-ratio:${width} / ${height};`;
}

function recordPreviewHtml(record) {
  const localVideo = recordVideoUrl(record);
  const remoteVideo = recordRemoteVideoUrl(record);
  const imageResult = recordImageResultUrl(record);
  if (localVideo) return `<video src="${escapeHtml(localVideo)}" controls preload="metadata" playsinline style="${escapeHtml(recordRatioStyle(record))}"></video>`;
  if (imageResult) return `<img src="${escapeHtml(imageResult)}" alt="" />`;
  if (remoteVideo) {
    return `
      <div class="adm-record-preview-missing">
        <i data-lucide="video-off"></i>
        <strong>Remote preview unavailable</strong>
        <p>${escapeHtml(record.error || "The upstream temporary video link may have expired before it was cached locally.")}</p>
        <a class="adm-btn adm-btn-sm adm-btn-ghost" href="${escapeHtml(remoteVideo)}" target="_blank" rel="noopener"><i data-lucide="external-link"></i>Open original URL</a>
      </div>
    `;
  }
  if (record.imageUrl) return `<img src="${escapeHtml(record.imageUrl)}" alt="" />`;
  return '<div class="adm-empty"><i data-lucide="video-off"></i><p>No preview yet.</p></div>';
}

function recordBillingText(record) {
  const billing = record.billing || {};
  const final = billing.final === null || billing.final === undefined ? "" : billing.final;
  const pre = billing.preDeducted || 0;
  if (billing.settled && final !== "") return `${final} / pre ${pre}`;
  return pre ? `pre ${pre}` : "0";
}

function recordOwnerText(record) {
  return record.username || record.userId || "unknown";
}

async function renderGenerationRecords() {
  const saved = JSON.parse(sessionStorage.getItem("admRecordFilters") || "{}");
  const query = saved.q || "";
  const provider = saved.provider || "";
  const kind = saved.kind || "";
  const status = saved.status || "";
  const limit = saved.limit || 160;
  els.adminContent.innerHTML = `
    <section class="adm-page adm-records-page">
      <div class="adm-page-head adm-records-head">
        <div>
          <h2>Generation Records</h2>
          <p class="adm-muted">All user/API generation jobs. Compact table for browsing; open details for prompt, params and result preview.</p>
        </div>
        <div class="adm-page-actions">
          <button class="adm-btn adm-btn-ghost" id="refreshRecordsBtn"><i data-lucide="refresh-cw"></i>Refresh</button>
        </div>
      </div>
      <form class="adm-record-filters" id="recordFilters">
        <input id="recordQuery" type="search" placeholder="Search task, user, prompt, template..." value="${escapeHtml(query)}" />
        <select id="recordProvider">
          <option value="">All providers</option>
          <option value="apiz" ${provider === "apiz" ? "selected" : ""}>apiz</option>
          <option value="seedance" ${provider === "seedance" ? "selected" : ""}>seedance</option>
        </select>
        <select id="recordKind">
          <option value="">All kinds</option>
          <option value="image-to-video" ${kind === "image-to-video" ? "selected" : ""}>image-to-video</option>
          <option value="text-to-video" ${kind === "text-to-video" ? "selected" : ""}>text-to-video</option>
          <option value="advanced-video" ${kind === "advanced-video" ? "selected" : ""}>advanced-video</option>
          <option value="scene-video" ${kind === "scene-video" ? "selected" : ""}>scene-video</option>
          <option value="main-video" ${kind === "main-video" ? "selected" : ""}>main-video</option>
        </select>
        <select id="recordStatus">
          <option value="">All status</option>
          <option value="submitted" ${status === "submitted" ? "selected" : ""}>submitted</option>
          <option value="running" ${status === "running" ? "selected" : ""}>running</option>
          <option value="succeeded" ${status === "succeeded" ? "selected" : ""}>succeeded</option>
          <option value="completed" ${status === "completed" ? "selected" : ""}>completed</option>
          <option value="failed" ${status === "failed" ? "selected" : ""}>failed</option>
        </select>
        <select id="recordLimit">
          <option value="80" ${String(limit) === "80" ? "selected" : ""}>80</option>
          <option value="160" ${String(limit) === "160" ? "selected" : ""}>160</option>
          <option value="300" ${String(limit) === "300" ? "selected" : ""}>300</option>
          <option value="500" ${String(limit) === "500" ? "selected" : ""}>500</option>
        </select>
        <button class="adm-btn adm-btn-primary" type="submit"><i data-lucide="search"></i>Apply</button>
      </form>
      <div id="recordTablePane" class="adm-card adm-mt">
        <div class="adm-loading"><div class="adm-spinner"></div></div>
      </div>
    </section>
  `;

  const load = async ({ silent = false, refresh = false } = {}) => {
    stopAdminRecordPoll();
    const tablePane = activeRoutePane("recordTablePane", "records");
    if (!tablePane) return;
    const scrollHost = tablePane?.querySelector(".adm-record-table-wrap");
    const previousScrollTop = scrollHost?.scrollTop || 0;
    const previousScrollLeft = scrollHost?.scrollLeft || 0;
    const params = new URLSearchParams();
    const next = {
      q: byId("recordQuery")?.value.trim() || "",
      provider: byId("recordProvider")?.value || "",
      kind: byId("recordKind")?.value || "",
      status: byId("recordStatus")?.value || "",
      limit: byId("recordLimit")?.value || "160",
    };
    Object.entries(next).forEach(([key, value]) => { if (value) params.set(key, value); });
    if (refresh) params.set("refresh", "1");
    sessionStorage.setItem("admRecordFilters", JSON.stringify(next));
    if (!silent) tablePane.innerHTML = '<div class="adm-loading"><div class="adm-spinner"></div></div>';
    const payload = await api(`/api/admin/generation-records?${params.toString()}`);
    if (!activeRoutePane("recordTablePane", "records")) return;
    const records = payload.records || [];
    const nextSignature = generationRecordsSignature(records);
    if (silent && nextSignature === adminRecordSignature) {
      scheduleAdminRecordPoll(records, load);
      return;
    }
    adminRecordSignature = nextSignature;
    renderGenerationRecordTable(records, payload);
    const nextScrollHost = byId("recordTablePane")?.querySelector(".adm-record-table-wrap");
    if (nextScrollHost) {
      nextScrollHost.scrollTop = previousScrollTop;
      nextScrollHost.scrollLeft = previousScrollLeft;
    }
    scheduleAdminRecordPoll(records, load);
  };

  byId("recordFilters")?.addEventListener("submit", (event) => {
    event.preventDefault();
    load().catch((err) => renderRouteError("records", err));
  });
  byId("refreshRecordsBtn")?.addEventListener("click", () => load({ refresh: true }).catch((err) => renderRouteError("records", err)));
  refreshIcons();
  await load();
}

function renderGenerationRecordTable(records, payload = {}) {
  const pane = activeRoutePane("recordTablePane", "records");
  if (!pane) return;
  pane.innerHTML = `
    <header class="adm-card-head adm-record-summary">
      <h3>${records.length} shown</h3>
      <span class="adm-muted">filtered ${payload.filtered ?? records.length} / total ${payload.total ?? records.length}</span>
    </header>
    <div class="adm-table-wrap adm-record-table-wrap">
      ${records.length ? `
        <table class="adm-table adm-record-table">
          <thead>
            <tr>
              <th>Time</th>
              <th>User</th>
              <th>Type</th>
              <th>Status</th>
              <th>Cost</th>
              <th>Task</th>
              <th>Prompt</th>
              <th>Result</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            ${records.map((record, index) => generationRecordRowHtml(record, index)).join("")}
          </tbody>
        </table>
      ` : '<div class="adm-empty"><i data-lucide="inbox"></i><p>No generation records found.</p></div>'}
    </div>
  `;
  refreshIcons();
  pane.querySelectorAll("[data-act='record-detail']").forEach((button) => {
    button.addEventListener("click", () => {
      const record = records[Number(button.dataset.index || 0)];
      if (record) openGenerationRecordDetail(record);
    });
  });
  pane.querySelectorAll("[data-act='copy-record']").forEach((button) => {
    button.addEventListener("click", () => {
      const record = records[Number(button.dataset.index || 0)];
      if (record) copyText(record.finalPrompt || record.prompt || "", "Prompt copied.");
    });
  });
  pane.querySelectorAll("[data-act='promote-advanced']").forEach((button) => {
    button.addEventListener("click", () => {
      const record = records[Number(button.dataset.index || 0)];
      if (record) promoteRecordToAdvancedCaseWithCategory(record, button);
    });
  });
  pane.querySelectorAll("[data-act='promote-platform']").forEach((button) => {
    button.addEventListener("click", () => {
      const record = records[Number(button.dataset.index || 0)];
      if (record) promoteRecordToPlatformGallery(record, button);
    });
  });
}

function generationRecordRowHtml(record, index) {
  const video = recordVideoUrl(record);
  const remoteVideo = recordRemoteVideoUrl(record);
  const imageResult = recordImageResultUrl(record);
  const canPromote = Boolean(video || remoteVideo);
  const label = record.templateTitle || record.sceneEntryName || record.sceneName || record.companionName || record.kind || "job";
  const ratioStyle = recordRatioStyle(record);
  return `
    <tr>
      <td><span class="adm-mono">${escapeHtml(fmtDate(record.createdAt).slice(5))}</span><span class="adm-block adm-muted">${escapeHtml(fmtRelative(record.updatedAt || record.createdAt))}</span></td>
      <td><strong>${escapeHtml(recordOwnerText(record))}</strong><span class="adm-block adm-mono adm-record-id">${escapeHtml((record.userId || "").slice(0, 12))}</span></td>
      <td><span class="adm-pill">${escapeHtml(record.provider || "n/a")}</span><span class="adm-block adm-muted">${escapeHtml(record.kind || record.source || "")}</span><span class="adm-block adm-truncate" title="${escapeHtml(label)}">${escapeHtml(label)}</span></td>
      <td>${statusPill(record.status)}${record.error ? `<span class="adm-block adm-error-text" title="${escapeHtml(record.error)}">${escapeHtml(shortText(record.error, 54))}</span>` : ""}</td>
      <td><span class="adm-mono">${escapeHtml(recordBillingText(record))}</span><span class="adm-block adm-muted">${escapeHtml(record.billing?.status || "")}</span></td>
      <td><span class="adm-mono adm-truncate" title="${escapeHtml(record.taskId)}">${escapeHtml(shortText(record.taskId, 24))}</span><span class="adm-block adm-muted">${escapeHtml(record.model || "")}</span></td>
      <td class="adm-record-prompt-cell" title="${escapeHtml(record.finalPrompt || record.prompt || "")}">${escapeHtml(shortText(record.finalPrompt || record.prompt || "", 150))}</td>
      <td>${video ? `<video class="adm-record-thumb" src="${escapeHtml(video)}" preload="metadata" muted playsinline style="${escapeHtml(ratioStyle)}"></video>` : imageResult ? `<img class="adm-record-thumb" src="${escapeHtml(imageResult)}" alt="" />` : record.imageUrl ? `<img class="adm-record-thumb" src="${escapeHtml(record.imageUrl)}" alt="" />` : remoteVideo ? '<span class="adm-muted">Remote only</span>' : '<span class="adm-muted">No result</span>'}</td>
      <td class="adm-record-actions">
        <button class="adm-btn adm-btn-sm adm-btn-ghost" data-act="record-detail" data-index="${index}"><i data-lucide="eye"></i>Detail</button>
        <button class="adm-btn adm-btn-sm adm-btn-ghost" data-act="copy-record" data-index="${index}"><i data-lucide="copy"></i>Prompt</button>
        ${canPromote ? `<button class="adm-btn adm-btn-sm adm-btn-ghost" data-act="promote-platform" data-index="${index}"><i data-lucide="layout-template"></i>Gallery</button>` : ""}
        ${canPromote ? `<button class="adm-btn adm-btn-sm adm-btn-primary" data-act="promote-advanced" data-index="${index}"><i data-lucide="wand-sparkles"></i>Advanced</button>` : ""}
      </td>
    </tr>
  `;
}

function advancedProviderFromRecord(record = {}) {
  const provider = String(record.provider || record.params?.provider || "").toLowerCase();
  if (provider.includes("wan")) return "wan27";
  if (provider.includes("seedance")) return "seedance";
  return "wan27";
}

function advancedCaseFromRecord(record = {}, index = 0, category = "hot") {
  const provider = advancedProviderFromRecord(record);
  const params = {
    provider,
    ratio: normalizeVideoRatio(record.ratio || record.params?.ratio || record.params?.aspect_ratio || record.upstreamPayload?.ratio || "9:16"),
    resolution: normalizeAdvancedResolution(record.resolution || record.params?.resolution || record.upstreamPayload?.resolution || "720p"),
    duration: advancedCaseDuration({
      provider,
      params: {
        provider,
        duration: record.duration || record.params?.duration || record.upstreamPayload?.duration || 5,
      },
    }),
  };
  if (provider === "wan27" && record.params?.seed) params.seed = record.params.seed;
  const title = record.templateTitle || record.sceneEntryName || record.sceneName || record.companionName || "Advanced generation";
  const sourceVideoUrl = toAbsoluteHttpUrl(recordVideoUrl(record) || recordRemoteVideoUrl(record));
  const sourceCoverUrl = toAbsoluteHttpUrl(record.coverUrl || record.posterUrl || record.imageUrl || "");
  const inputImageUrl = recordPrimaryImageUrl(record);
  const inputVideoUrl = recordInputVideoUrl(record);
  const inputVideoPosterUrl = recordInputVideoPosterUrl(record);
  return {
    id: `advanced-record-${String(record.taskId || Date.now()).replace(/[^a-z0-9_-]/gi, "-").slice(0, 48)}`,
    title: String(title || "Advanced generation").slice(0, 80),
    category: normalizeAdvancedCaseCategory(category),
    provider,
    price: advancedCaseCredits({ provider, params }),
    coverUrl: "",
    previewUrl: sourceVideoUrl,
    inputImageUrl,
    inputVideoUrl,
    inputVideoPosterUrl,
    sourceImageUrl: inputImageUrl,
    sourceVideoUrl,
    sourceCoverUrl,
    description: `${recordOwnerText(record)} · ${fmtDate(record.createdAt)}`,
    prompt: record.finalPrompt || record.prompt || "",
    params,
    enabled: true,
    sort: index,
  };
}

async function promoteRecordToAdvancedCase(record = {}, button = null) {
  const sourceVideoUrl = toAbsoluteHttpUrl(recordVideoUrl(record) || recordRemoteVideoUrl(record));
  if (!sourceVideoUrl) {
    toast("该记录没有可用视频，不能设置到 Advanced 广场。", "error");
    return;
  }
  const originalHtml = button?.innerHTML || "";
  try {
    const config = await loadConfig(true);
    const platform = config.platform || {};
    const advanced = defaultAdvancedConfig(platform);
    const draft = advancedCaseFromRecord(record, advanced.cases.length);
    const result = await openDialog({
      title: "设置到 Advanced 广场",
      body: advancedCaseEditor(draft, advanced.cases.length),
      confirmText: "加入 Advanced",
      cancelText: "取消",
      onConfirm: async () => {
        if (button) {
          button.disabled = true;
          button.innerHTML = '<i data-lucide="loader-circle"></i>Saving';
          refreshIcons();
        }
        const editor = els.dialogBody.querySelector("[data-advanced-index]");
        let nextCase = collectAdvancedCaseFromCard(editor, draft);
        nextCase = await ingestAdvancedCaseMediaForSave(nextCase);
        const nextAdvanced = {
          ...advanced,
          cases: [...advanced.cases.filter((item) => item.id !== nextCase.id), nextCase],
        };
        const payload = await api("/api/admin/config", {
          method: "PUT",
          body: { config: { ...config, platform: { ...platform, advanced: nextAdvanced } } },
        });
        state.config = payload.config;
      },
    });
    if (result !== "confirm") return;
    toast("已加入 Advanced 广场。", "success");
  } catch (error) {
    toast(error.message || "加入 Advanced 失败。", "error");
  } finally {
    if (button) {
      button.disabled = false;
      button.innerHTML = originalHtml;
      refreshIcons();
    }
  }
}

async function promoteRecordToAdvancedCaseWithCategory(record = {}, button = null) {
  const sourceVideoUrl = toAbsoluteHttpUrl(recordVideoUrl(record) || recordRemoteVideoUrl(record));
  if (!sourceVideoUrl) {
    toast("该记录没有可用视频，不能设置到 Advanced。", "error");
    return;
  }
  const title = record.templateTitle || record.sceneEntryName || record.sceneName || record.companionName || record.taskId || "Advanced generation";
  const originalHtml = button?.innerHTML || "";
  const detectedInputVideoUrl = recordInputVideoUrl(record);
  const detectedInputVideoPosterUrl = recordInputVideoPosterUrl(record);
  const detectedInputImageUrl = recordPrimaryImageUrl(record);
  await openDialog({
    title: "设置到 Advanced",
    body: `
      <div class="adm-form-row">
        <span>视频</span>
        <input value="${escapeHtml(title)}" disabled />
      </div>
      <div class="adm-form-row">
        <span>分类</span>
        <select id="promoteAdvancedCategory">${advancedCaseCategoryOptions("hot")}</select>
      </div>
      <div id="promoteReplaceFields" hidden>
        <div class="adm-form-row">
          <span>Replace 左侧输入视频 URL（必填）</span>
          <input id="promoteInputVideoUrl" value="${escapeHtml(detectedInputVideoUrl)}" placeholder="https://.../input-video.mp4" />
        </div>
        <div class="adm-form-row">
          <span>Replace 左侧输入视频首帧 URL</span>
          <input id="promoteInputVideoPosterUrl" value="${escapeHtml(detectedInputVideoPosterUrl)}" placeholder="https://.../first-frame.jpg" />
        </div>
        <div class="adm-form-row">
          <span>Replace 左侧替换图片 URL</span>
          <input id="promoteInputImageUrl" value="${escapeHtml(detectedInputImageUrl)}" placeholder="https://.../replace-image.jpg" />
        </div>
      </div>
      <p class="adm-muted" style="margin:0;">保存时会把右侧结果视频下载到本地素材，并自动生成封面。Replace 分类会同时保存左侧输入视频和右侧结果视频；移出展示不会删除视频文件。</p>
    `,
    confirmText: "加入 Advanced",
    cancelText: "取消",
    onOpen: () => {
      const categorySelect = els.dialogBody.querySelector("#promoteAdvancedCategory");
      const replaceFields = els.dialogBody.querySelector("#promoteReplaceFields");
      const syncReplaceFields = () => {
        if (replaceFields) replaceFields.hidden = categorySelect?.value !== "replace";
      };
      categorySelect?.addEventListener("change", syncReplaceFields);
      syncReplaceFields();
    },
    onConfirm: async () => {
      if (button) {
        button.disabled = true;
        button.innerHTML = '<i data-lucide="loader-circle"></i>Saving';
        refreshIcons();
      }
      try {
        const category = els.dialogBody.querySelector("#promoteAdvancedCategory")?.value || "hot";
        const inputVideoUrl = els.dialogBody.querySelector("#promoteInputVideoUrl")?.value.trim() || "";
        const inputVideoPosterUrl = els.dialogBody.querySelector("#promoteInputVideoPosterUrl")?.value.trim() || "";
        const inputImageUrl = els.dialogBody.querySelector("#promoteInputImageUrl")?.value.trim() || "";
        if (category === "replace" && !isHttpUrl(inputVideoUrl)) {
          throw new Error("Replace 分类必须填写左侧输入视频 URL，否则前台左侧视频会缺失。");
        }
        if (category === "replace" && inputVideoPosterUrl && !isHttpUrl(inputVideoPosterUrl)) {
          throw new Error("输入视频首帧 URL 必须是 http/https。");
        }
        if (category === "replace" && inputImageUrl && !isHttpUrl(inputImageUrl)) {
          throw new Error("替换图片 URL 必须是 http/https。");
        }
        const config = await loadConfig(true);
        const platform = config.platform || {};
        const advanced = defaultAdvancedConfig(platform);
        let nextCase = advancedCaseFromRecord(record, advanced.cases.length, category);
        if (category === "replace") {
          nextCase = {
            ...nextCase,
            inputVideoUrl,
            inputVideoPosterUrl: inputVideoPosterUrl || nextCase.inputVideoPosterUrl || "",
            inputImageUrl: inputImageUrl || nextCase.inputImageUrl || "",
            sourceImageUrl: inputImageUrl || nextCase.sourceImageUrl || "",
          };
        }
        nextCase = await ingestAdvancedCaseMediaForSave(nextCase);
        const nextAdvanced = {
          ...advanced,
          cases: [...advanced.cases.filter((item) => item.id !== nextCase.id), nextCase],
        };
        const payload = await api("/api/admin/config", {
          method: "PUT",
          body: { config: { ...config, platform: { ...platform, advanced: nextAdvanced } } },
        });
        state.config = payload.config;
        toast("已加入 Advanced。", "success");
      } finally {
        if (button) {
          button.disabled = false;
          button.innerHTML = originalHtml;
          refreshIcons();
        }
      }
    },
  });
}

async function promoteRecordToPlatformGallery(record = {}, button = null) {
  const sourceVideoUrl = toAbsoluteHttpUrl(recordVideoUrl(record) || recordRemoteVideoUrl(record));
  if (!sourceVideoUrl) {
    toast("该记录没有可用视频，不能加入普通广场。", "error");
    return;
  }
  const title = record.templateTitle || record.sceneEntryName || record.sceneName || record.companionName || record.taskId || "Gallery video";
  const ok = await confirmAction(
    "加入首页普通广场",
    `确认把「${title}」加入首页普通广场？前台点击这个视频会跳到 Advanced，不弹出普通生成窗口。`,
    { confirmText: "加入普通广场" },
  );
  if (!ok) return;
  const originalHtml = button?.innerHTML || "";
  if (button) {
    button.disabled = true;
    button.innerHTML = '<i data-lucide="loader-circle"></i>Saving';
    refreshIcons();
  }
  try {
    const payload = await api(`/api/admin/generation-records/${encodeURIComponent(record.taskId)}/promote-platform`, { method: "POST" });
    if (payload.config) state.config = payload.config;
    toast("已加入首页普通广场。", "success");
  } catch (error) {
    toast(error.message || "加入普通广场失败。", "error");
  } finally {
    if (button) {
      button.disabled = false;
      button.innerHTML = originalHtml;
      refreshIcons();
    }
  }
}

function openGenerationRecordDetail(record) {
  const video = recordVideoUrl(record);
  const remoteVideo = recordRemoteVideoUrl(record);
  const imageResult = recordImageResultUrl(record);
  const paramsText = jsonPretty(record.params);
  const upstreamText = jsonPretty(record.upstreamPayload);
  const createText = jsonPretty(record.createResponse);
  const queryText = jsonPretty(record.queryResponse);
  const body = `
    <div class="adm-record-detail">
      <div class="adm-record-preview">
        ${recordPreviewHtml(record)}
      </div>
      ${recordImageAssetsHtml(record)}
      <div class="adm-record-kv">
        <span>User</span><strong>${escapeHtml(recordOwnerText(record))}</strong>
        <span>Status</span><strong>${statusPill(record.status)}</strong>
        <span>Task</span><code>${escapeHtml(record.taskId || "")}</code>
        ${record.upstreamTaskId ? `<span>Upstream</span><code>${escapeHtml(record.upstreamTaskId)}</code>` : ""}
        <span>Provider</span><strong>${escapeHtml(record.provider || "")}</strong>
        <span>Kind</span><strong>${escapeHtml(record.kind || "")}</strong>
        <span>Cost</span><strong>${escapeHtml(recordBillingText(record))}</strong>
        <span>Created</span><strong>${escapeHtml(fmtDate(record.createdAt))}</strong>
        <span>Updated</span><strong>${escapeHtml(fmtDate(record.updatedAt))}</strong>
      </div>
      ${record.referenceAssetUri ? `<div class="adm-record-line"><span>Reference</span><code>${escapeHtml(record.referenceAssetUri)}</code></div>` : ""}
      ${record.imageUrl ? `<div class="adm-record-line"><span>Image</span><a href="${escapeHtml(record.imageUrl)}" target="_blank" rel="noopener">${escapeHtml(record.imageUrl)}</a></div>` : ""}
      ${video ? `<div class="adm-record-line"><span>Result</span><a href="${escapeHtml(video)}" target="_blank" rel="noopener">${escapeHtml(video)}</a></div>` : ""}
      ${imageResult ? `<div class="adm-record-line"><span>Image result</span><a href="${escapeHtml(imageResult)}" target="_blank" rel="noopener">${escapeHtml(imageResult)}</a></div>` : ""}
      ${!video && remoteVideo ? `<div class="adm-record-line"><span>Remote result</span><a href="${escapeHtml(remoteVideo)}" target="_blank" rel="noopener">${escapeHtml(remoteVideo)}</a></div>` : ""}
      ${record.error ? `<div class="adm-record-line"><span>Error</span><code>${escapeHtml(record.error)}</code></div>` : ""}
      <section class="adm-record-section">
        <header><strong>Prompt</strong><button class="adm-btn adm-btn-sm adm-btn-ghost" data-copy-detail="prompt"><i data-lucide="copy"></i>Copy</button></header>
        <pre>${escapeHtml(record.finalPrompt || record.prompt || "")}</pre>
      </section>
      ${record.prompt && record.finalPrompt && record.prompt !== record.finalPrompt ? `<section class="adm-record-section"><header><strong>User Prompt</strong></header><pre>${escapeHtml(record.prompt)}</pre></section>` : ""}
      <section class="adm-record-section">
        <header><strong>Params</strong><button class="adm-btn adm-btn-sm adm-btn-ghost" data-copy-detail="params"><i data-lucide="copy"></i>Copy</button></header>
        <pre>${escapeHtml(paramsText || "{}")}</pre>
      </section>
      ${upstreamText ? `<section class="adm-record-section"><header><strong>Upstream Payload</strong><button class="adm-btn adm-btn-sm adm-btn-ghost" data-copy-detail="upstream"><i data-lucide="copy"></i>Copy</button></header><pre>${escapeHtml(upstreamText)}</pre></section>` : ""}
      ${createText ? `<section class="adm-record-section"><header><strong>Create Response</strong><button class="adm-btn adm-btn-sm adm-btn-ghost" data-copy-detail="create"><i data-lucide="copy"></i>Copy</button></header><pre>${escapeHtml(createText)}</pre></section>` : ""}
      ${queryText ? `<section class="adm-record-section"><header><strong>Query Response</strong><button class="adm-btn adm-btn-sm adm-btn-ghost" data-copy-detail="query"><i data-lucide="copy"></i>Copy</button></header><pre>${escapeHtml(queryText)}</pre></section>` : ""}
    </div>
  `;
  openDialog({
    title: `Generation Detail · ${record.taskId || ""}`,
    body,
    hideConfirm: true,
    cancelText: "Close",
  });
  const copyMap = {
    prompt: record.finalPrompt || record.prompt || "",
    params: paramsText,
    upstream: upstreamText,
    create: createText,
    query: queryText,
  };
  setTimeout(() => {
    els.dialogBody.querySelectorAll("[data-copy-detail]").forEach((button) => {
      button.addEventListener("click", () => copyText(copyMap[button.dataset.copyDetail] || ""));
    });
    refreshIcons();
  }, 0);
}

/* ============ SCENES ============ */
async function renderScenes() {
  const config = await loadConfig(true);
  if (!isActiveRoute("scenes")) return;
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
  if (!isActiveRoute("scenes")) return;
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
  if (!isActiveRoute("users")) return;
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
          <table class="adm-table adm-user-table">
            <thead><tr><th>账号</th><th>角色</th><th>积分</th><th>API Token</th><th>折扣</th><th>自定义角色</th><th>钱包订单</th><th>注册时间</th><th class="adm-text-right">操作</th></tr></thead>
            <tbody>
              ${users.map((u) => `
                <tr data-id="${escapeHtml(u.id)}">
                  <td><strong>${escapeHtml(u.username)}</strong><br/><span class="adm-muted adm-mono">${escapeHtml(u.id)}</span></td>
                  <td><span class="adm-pill ${u.role === "admin" ? "is-admin" : ""}">${escapeHtml(u.role)}</span></td>
                  <td><strong>${escapeHtml(u.credits)}</strong></td>
                  <td><span class="adm-muted adm-mono">${escapeHtml(maskMiddle(u.apiToken || ""))}</span></td>
                  <td><span class="adm-mono">${escapeHtml(pricingMultiplierText(u.pricingMultiplier))}</span></td>
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
    <div class="adm-form-row"><span>API Token</span><input class="adm-mono" value="${escapeHtml(user.apiToken || "")}" disabled /><small class="adm-muted">用户 Access API 页面展示和接口 Bearer 使用的就是这个 token。</small></div>
    <div class="adm-form-row"><span>价格折扣比例</span><input id="editPricingMultiplier" type="number" min="0.01" max="100" step="0.01" value="${escapeHtml(pricingMultiplierText(user.pricingMultiplier))}" /><small class="adm-muted">1 = 原价，0.9 = 九折，1.1 = 加价 10%。用于高级生成和首页广场生成的展示与最终扣费。</small></div>
  `;
  openDialog({
    title: `编辑用户：${user.username}`,
    body: tpl,
    confirmText: "保存",
    onConfirm: async () => {
      const role = tpl.querySelector("#editRole").value;
      const credits = Number(tpl.querySelector("#editCredits").value);
      const delta = Number(tpl.querySelector("#editCreditsDelta").value);
      const pricingMultiplier = Number(tpl.querySelector("#editPricingMultiplier").value);
      if (!Number.isFinite(pricingMultiplier) || pricingMultiplier <= 0 || pricingMultiplier > 100) {
        toast("价格折扣比例必须大于 0，且不超过 100。", "error");
        return false;
      }
      const body = { role };
      if (Number.isFinite(delta) && delta !== 0) body.creditsDelta = delta;
      else if (Number.isFinite(credits)) body.credits = credits;
      body.pricingMultiplier = pricingMultiplier;
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
  if (!isActiveRoute("wallet")) return;
  const orders = payload.orders || [];
  els.adminContent.innerHTML = `
    <section class="adm-page">
      <div class="adm-page-head">
        <div>
          <h2>Wallet Orders</h2>
          <p class="adm-muted">USDT top-up orders. Auto scan matches chain, address, exact amount, transaction hash and confirmations.</p>
        </div>
        <button class="adm-btn adm-btn-primary" id="scanWalletOrdersBtn" type="button"><i data-lucide="radar"></i>Scan chain</button>
      </div>
      <div class="adm-card">
        <div class="adm-card-body adm-table-wrap">
          ${orders.length ? `
            <table class="adm-table adm-wallet-table">
              <thead><tr><th>Order</th><th>User</th><th>Top up</th><th>Pay exactly</th><th>Chain / Address</th><th>Transaction</th><th>Status</th><th>Time</th><th class="adm-text-right">Actions</th></tr></thead>
              <tbody>
                ${orders.map((o) => `
                  <tr data-id="${escapeHtml(o.id)}">
                    <td class="adm-mono adm-truncate">${escapeHtml(o.id)}</td>
                    <td>${escapeHtml(o.username || o.userId)}</td>
                    <td><strong>${escapeHtml(o.baseAmount)}</strong> ${escapeHtml(o.asset || "")}<br/><span class="adm-muted">${escapeHtml(o.paymentProvider || "manual")} &middot; Credits: ${escapeHtml(o.creditAmount || 0)}</span></td>
                    <td><strong>${escapeHtml(o.payableAmountText || "")}</strong></td>
                    <td class="adm-mono adm-truncate"><strong>${escapeHtml(o.network || o.chain || "-")}</strong><br/>${escapeHtml(o.address || o.paypalOrderId || "-")}</td>
                    <td class="adm-mono adm-truncate">${o.transactionHash ? `${escapeHtml(o.transactionHash)}<br/><span class="adm-muted">${escapeHtml(o.confirmations || 0)} conf &middot; ${escapeHtml(o.scanSource || "")}</span>` : `<span class="adm-muted">Not matched</span>`}</td>
                    <td>${statusPill(o.status)}</td>
                    <td>${fmtDate(o.createdAt)}</td>
                    <td>
                      <div class="adm-row-actions">
                        ${o.status !== "paid" ? `<button class="adm-btn adm-btn-sm adm-btn-primary" data-act="mark-paid"><i data-lucide="check"></i>Mark paid</button>` : ""}
                        ${o.status !== "cancelled" && o.status !== "paid" ? `<button class="adm-btn adm-btn-sm adm-btn-ghost" data-act="cancel-order"><i data-lucide="x"></i>Cancel</button>` : ""}
                      </div>
                    </td>
                  </tr>`).join("")}
              </tbody>
            </table>
          ` : `<div class="adm-empty"><i data-lucide="wallet"></i><p>No orders</p></div>`}
        </div>
      </div>
    </section>
  `;
  refreshIcons();
  els.adminContent.querySelector("#scanWalletOrdersBtn")?.addEventListener("click", async () => {
    const button = els.adminContent.querySelector("#scanWalletOrdersBtn");
    button.disabled = true;
    button.innerHTML = `<i data-lucide="loader-2"></i>Scanning`;
    refreshIcons();
    try {
      const result = await api("/api/admin/wallet-orders/scan", { method: "POST" });
      toast(`Scan done: matched ${result.matched || 0}, errors ${result.errors?.length || 0}`, result.errors?.length ? "warn" : "success");
    } finally {
      renderWallet();
    }
  });
  els.adminContent.querySelectorAll("tr[data-id]").forEach((tr) => {
    const id = tr.dataset.id;
    tr.querySelector('[data-act="mark-paid"]')?.addEventListener("click", async () => {
      await api(`/api/admin/wallet-orders/${encodeURIComponent(id)}`, { method: "PATCH", body: { status: "paid" } });
      toast("Marked paid and credits added.", "success");
      renderWallet();
    });
    tr.querySelector('[data-act="cancel-order"]')?.addEventListener("click", async () => {
      await api(`/api/admin/wallet-orders/${encodeURIComponent(id)}`, { method: "PATCH", body: { status: "cancelled" } });
      toast("Order cancelled.", "success");
      renderWallet();
    });
  });
}

async function renderSupportMessages() {
  const routeId = "support";
  if (!isActiveRoute(routeId)) return;
  const payload = await api("/api/admin/support-messages");
  const messages = Array.isArray(payload.messages) ? payload.messages : [];
  els.adminContent.innerHTML = `
    <section class="adm-page">
      <div class="adm-page-head">
        <div>
          <h1>站内信</h1>
          <p>查看用户提交的邮箱与问题，并直接回复。</p>
        </div>
        <button class="adm-btn adm-btn-ghost" data-act="refresh"><i data-lucide="refresh-cw"></i>刷新</button>
      </div>
      <div class="adm-card">
        ${messages.length ? `
          <div class="adm-table-wrap">
            <table class="adm-table">
              <thead>
                <tr>
                  <th>用户</th>
                  <th>邮箱</th>
                  <th>问题</th>
                  <th>状态</th>
                  <th>时间</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                ${messages.map((item) => `
                  <tr>
                    <td>${escapeHtml(item.username || item.userId || "-")}</td>
                    <td>${escapeHtml(item.email || "-")}</td>
                    <td>
                      <div style="display:grid;gap:6px;min-width:240px;">
                        ${item.subject ? `<strong>${escapeHtml(item.subject)}</strong>` : ""}
                        <span>${escapeHtml(item.message || "")}</span>
                        ${item.reply ? `<small style="color:var(--adm-muted);">回复：${escapeHtml(item.reply)}</small>` : ""}
                      </div>
                    </td>
                    <td>${escapeHtml(item.status || "open")}</td>
                    <td>${escapeHtml(fmtDate(item.createdAt))}</td>
                    <td>
                      <button class="adm-btn adm-btn-ghost" type="button" data-reply-support="${escapeHtml(item.id)}">回复</button>
                    </td>
                  </tr>
                `).join("")}
              </tbody>
            </table>
          </div>
        ` : '<div class="adm-empty"><i data-lucide="inbox"></i><p>暂无站内信</p></div>'}
      </div>
    </section>
  `;
  els.adminContent.querySelector('[data-act="refresh"]')?.addEventListener("click", () => renderSupportMessages().catch((err) => renderRouteError(routeId, err)));
  els.adminContent.querySelectorAll("[data-reply-support]").forEach((button) => {
    button.addEventListener("click", async () => {
      const record = messages.find((item) => item.id === button.dataset.replySupport);
      if (!record) return;
      const result = await openDialog({
        title: `回复 ${record.email || record.username || ""}`,
        confirmText: "发送回复",
        body: `
          <div class="adm-form-row"><span>用户问题</span><div class="adm-inline-note">${escapeHtml(record.message || "")}</div></div>
          <div class="adm-form-row"><span>回复内容</span><textarea id="supportReplyText" rows="6">${escapeHtml(record.reply || "")}</textarea></div>
        `,
      });
      if (!result.confirmed) return;
      const reply = byId("supportReplyText")?.value.trim() || "";
      if (!reply) return toast("回复内容不能为空", "error");
      await api(`/api/admin/support-messages/${encodeURIComponent(record.id)}/reply`, {
        method: "POST",
        body: { reply },
      });
      toast("已回复", "success");
      renderSupportMessages().catch((err) => renderRouteError(routeId, err));
    });
  });
  refreshIcons();
}

/* ============ PRICING ============ */
function fmtPrice(value, digits = 6) {
  const next = Number(value);
  if (!Number.isFinite(next)) return "-";
  return String(Math.round(next * 10 ** digits) / 10 ** digits);
}

function fmtPriceRange(values = [], suffix = "") {
  if (!Array.isArray(values) || values.length < 2) return "";
  return `${fmtPrice(values[0])}-${fmtPrice(values[1])}${suffix}`;
}

function isImagePricingRow(row = {}) {
  return String(row.provider || "").toLowerCase() === "wan27-image" || String(row.unit || "").toLowerCase() === "image";
}

function rowPriceUnit(row = {}, credits = false) {
  return isImagePricingRow(row) ? (credits ? "credits/image" : "USD/image") : (credits ? "credits/s" : "USD/s");
}

async function renderPricingLegacy() {
  const payload = await api("/api/admin/pricing");
  if (!isActiveRoute("pricing")) return;
  const pricing = payload.pricing || {};
  const rows = pricing.rows || [];
  els.adminContent.innerHTML = `
    <section class="adm-page">
      <div class="adm-page-head">
        <div>
          <h2>价格配置</h2>
          <p class="adm-muted">配置 Advanced 对外价格，采购价只展示用于核对。保存后估价和扣费马上使用新价格。</p>
        </div>
        <div class="adm-page-actions">
          <button class="adm-btn adm-btn-ghost" id="reloadPricingBtn" type="button"><i data-lucide="refresh-cw"></i>刷新</button>
          <button class="adm-btn adm-btn-primary" id="savePricingBtn" type="button"><i data-lucide="save"></i>保存</button>
        </div>
      </div>
      <div class="adm-card">
        <div class="adm-card-head">
          <div>
            <h3>Advanced 价格</h3>
            <p class="adm-muted">Billing unit: 1 USD = ${escapeHtml(String(pricing.creditsPerUsd || ADVANCED_CREDITS_PER_USD))} credits. Upstream source: ${escapeHtml(pricing.upstreamMode || "direct")}</p>
          </div>
        </div>
        <div class="adm-table-wrap">
          <table class="adm-table adm-pricing-table">
            <thead>
              <tr>
                <th>模型</th>
                <th>分辨率</th>
                <th>采购价</th>
                <th>对外价</th>
                <th>Credits</th>
              </tr>
            </thead>
            <tbody>
              ${rows.map((row) => `
                <tr data-provider="${escapeHtml(row.provider)}" data-resolution="${escapeHtml(row.resolution)}" data-rate-kind="${escapeHtml(row.rateKind || "")}" data-key="${escapeHtml(row.key || "")}" data-unit="${escapeHtml(row.unit || "")}">
                  <td><strong>${escapeHtml(row.providerLabel || row.provider)}</strong><br/><small class="adm-muted adm-mono">${escapeHtml(row.provider)}</small></td>
                  <td>${escapeHtml(row.resolution)}${row.rateKind === "video_input" ? `<br/><small class="adm-muted">视频输入秒数</small>` : ""}</td>
                  <td>
                    <strong>${row.purchaseUsdPerSecondRange ? fmtPriceRange(row.purchaseUsdPerSecondRange, ` ${rowPriceUnit(row)}`) : row.purchaseUsdPerSecond === null || row.purchaseUsdPerSecond === undefined ? "-" : `${fmtPrice(row.purchaseUsdPerSecond)} ${rowPriceUnit(row)}`}</strong>
                    <br/><small class="adm-muted">${row.purchaseCreditsPerSecondRange ? fmtPriceRange(row.purchaseCreditsPerSecondRange, ` ${rowPriceUnit(row, true)}`) : row.purchaseCreditsPerSecond === null || row.purchaseCreditsPerSecond === undefined ? "-" : `${fmtPrice(row.purchaseCreditsPerSecond)} ${rowPriceUnit(row, true)}`} · ${escapeHtml(row.purchaseSource || "")}</small>
                    ${row.purchaseMessage ? `<br/><small class="adm-muted">${escapeHtml(row.purchaseMessage)}</small>` : ""}
                  </td>
                  <td><input class="adm-price-input" data-f="saleUsdPerSecond" type="number" min="0" step="0.0001" value="${escapeHtml(fmtPrice(row.saleUsdPerSecond))}" /></td>
                  <td class="adm-mono" data-price-credits>${escapeHtml(fmtPrice(row.saleCreditsPerSecond))}</td>
                </tr>
              `).join("")}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  `;
  refreshIcons();

  const updateCredits = () => {
    els.adminContent.querySelectorAll("tr[data-provider]").forEach((tr) => {
      const input = tr.querySelector('[data-f="saleUsdPerSecond"]');
      const target = tr.querySelector("[data-price-credits]");
      const usd = Number(input?.value || 0);
      target.textContent = Number.isFinite(usd) && usd >= 0
        ? fmtPrice(usd * Number(pricing.creditsPerUsd || ADVANCED_CREDITS_PER_USD))
        : "-";
    });
  };

  els.adminContent.querySelectorAll('[data-f="saleUsdPerSecond"]').forEach((input) => {
    input.addEventListener("input", updateCredits);
  });
  byId("reloadPricingBtn")?.addEventListener("click", () => renderPricing());
  byId("savePricingBtn")?.addEventListener("click", async () => {
    try {
      const nextRows = Array.from(els.adminContent.querySelectorAll("tr[data-provider]")).map((tr) => ({
        provider: tr.dataset.provider,
        resolution: tr.dataset.resolution,
        rateKind: tr.dataset.rateKind,
        key: tr.dataset.key,
        unit: tr.dataset.unit,
        saleUsdPerSecond: Number(tr.querySelector('[data-f="saleUsdPerSecond"]')?.value || 0),
      }));
      const payload = await api("/api/admin/pricing", {
        method: "PUT",
        body: { rows: nextRows },
      });
      state.config = payload.config || null;
      toast("价格已保存。", "success");
      renderPricing();
    } catch (err) {
      toast(err.message, "error");
    }
  });
}

function pricingRowTitle(row = {}) {
  const key = String(row.key || "");
  const provider = String(row.provider || "").toLowerCase();
  if (key.startsWith("seedance-video-input")) return "Seedance 视频输入加收";
  if (provider === "seedance") return "Seedance 基础生成";
  return row.providerLabel || row.provider || "Model";
}

function pricingRowUsage(row = {}) {
  if (isImagePricingRow(row)) return "按生成图片张数";
  if (String(row.rateKind || "") === "video_input") return "按输入视频秒数额外加收";
  return "按生成视频秒数";
}

function renderPricingTable(rows = []) {
  if (!rows.length) return `<div class="adm-empty">暂无价格项</div>`;
  return `
    <div class="adm-table-wrap">
      <table class="adm-table adm-pricing-table">
        <thead>
          <tr>
            <th>计费项</th>
            <th>分辨率</th>
            <th>采购价</th>
            <th>对外价</th>
            <th>Credits</th>
          </tr>
        </thead>
        <tbody>
          ${rows.map((row) => `
            <tr data-provider="${escapeHtml(row.provider)}" data-resolution="${escapeHtml(row.resolution)}" data-rate-kind="${escapeHtml(row.rateKind || "")}" data-key="${escapeHtml(row.key || "")}" data-unit="${escapeHtml(row.unit || "")}">
              <td><strong>${escapeHtml(pricingRowTitle(row))}</strong><br/><small class="adm-muted adm-mono">${escapeHtml(row.key || row.provider || "")}</small></td>
              <td>${escapeHtml(row.resolution)}<br/><small class="adm-muted">${escapeHtml(pricingRowUsage(row))}</small></td>
              <td>
                <strong>${row.purchaseUsdPerSecondRange ? fmtPriceRange(row.purchaseUsdPerSecondRange, ` ${rowPriceUnit(row)}`) : row.purchaseUsdPerSecond === null || row.purchaseUsdPerSecond === undefined ? "-" : `${fmtPrice(row.purchaseUsdPerSecond)} ${rowPriceUnit(row)}`}</strong>
                <br/><small class="adm-muted">${row.purchaseCreditsPerSecondRange ? fmtPriceRange(row.purchaseCreditsPerSecondRange, ` ${rowPriceUnit(row, true)}`) : row.purchaseCreditsPerSecond === null || row.purchaseCreditsPerSecond === undefined ? "-" : `${fmtPrice(row.purchaseCreditsPerSecond)} ${rowPriceUnit(row, true)}`} · ${escapeHtml(row.purchaseSource || "")}</small>
                ${row.purchaseMessage ? `<br/><small class="adm-muted">${escapeHtml(row.purchaseMessage)}</small>` : ""}
              </td>
              <td>
                <input class="adm-price-input" data-f="saleUsdPerSecond" type="number" min="0" step="0.0001" value="${escapeHtml(fmtPrice(row.saleUsdPerSecond))}" />
                <small class="adm-muted adm-block">${escapeHtml(rowPriceUnit(row))}</small>
              </td>
              <td class="adm-mono" data-price-credits>${escapeHtml(fmtPrice(row.saleCreditsPerSecond))}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  `;
}

async function renderPricing() {
  const payload = await api("/api/admin/pricing");
  if (!isActiveRoute("pricing")) return;
  const pricing = payload.pricing || {};
  const rows = pricing.rows || [];
  const seedanceOutputRows = rows.filter((row) => String(row.provider || "").toLowerCase() === "seedance" && String(row.rateKind || "output") !== "video_input");
  const seedanceInputRows = rows.filter((row) => String(row.provider || "").toLowerCase() === "seedance" && String(row.rateKind || "") === "video_input");
  const otherRows = rows.filter((row) => String(row.provider || "").toLowerCase() !== "seedance");

  els.adminContent.innerHTML = `
    <section class="adm-page">
      <div class="adm-page-head">
        <div>
          <h2>价格配置</h2>
          <p class="adm-muted">配置 Advanced 对外价格。Seedance 视频输入任务按两段计费：基础生成价 + 视频输入加收价。</p>
        </div>
        <div class="adm-page-actions">
          <button class="adm-btn adm-btn-ghost" id="reloadPricingBtn" type="button"><i data-lucide="refresh-cw"></i>刷新</button>
          <button class="adm-btn adm-btn-primary" id="savePricingBtn" type="button"><i data-lucide="save"></i>保存</button>
        </div>
      </div>
      <div class="adm-card">
        <div class="adm-card-head">
          <div>
            <h3>Advanced 价格</h3>
            <p class="adm-muted">Billing unit: 1 USD = ${escapeHtml(String(pricing.creditsPerUsd || ADVANCED_CREDITS_PER_USD))} credits. Upstream source: ${escapeHtml(pricing.upstreamMode || "direct")}</p>
          </div>
        </div>
        <div class="adm-pricing-formula">
          Seedance 视频输入任务总扣费 = 基础生成对外价 x 生成视频秒数 + 视频输入加收价 x 输入视频秒数。
        </div>
        <div class="adm-pricing-groups">
          <section class="adm-pricing-section">
            <div class="adm-pricing-section-head">
              <div>
                <h4>Seedance 基础生成价格</h4>
                <p class="adm-muted">所有 Seedance 任务都会按生成出来的视频秒数收这一段。</p>
              </div>
            </div>
            ${renderPricingTable(seedanceOutputRows)}
          </section>
          <section class="adm-pricing-section">
            <div class="adm-pricing-section-head">
              <div>
                <h4>Seedance 视频输入加收价格</h4>
                <p class="adm-muted">仅在传入视频作为参考、编辑、续写等输入时，按输入视频秒数额外加收。这里不是总价。</p>
              </div>
            </div>
            ${renderPricingTable(seedanceInputRows)}
          </section>
          <section class="adm-pricing-section">
            <div class="adm-pricing-section-head">
              <div>
                <h4>其他模型价格</h4>
                <p class="adm-muted">Wan2.7 视频和图片价格。</p>
              </div>
            </div>
            ${renderPricingTable(otherRows)}
          </section>
        </div>
      </div>
    </section>
  `;
  refreshIcons();

  const updateCredits = () => {
    els.adminContent.querySelectorAll("tr[data-provider]").forEach((tr) => {
      const input = tr.querySelector('[data-f="saleUsdPerSecond"]');
      const target = tr.querySelector("[data-price-credits]");
      const usd = Number(input?.value || 0);
      target.textContent = Number.isFinite(usd) && usd >= 0
        ? fmtPrice(usd * Number(pricing.creditsPerUsd || ADVANCED_CREDITS_PER_USD))
        : "-";
    });
  };

  els.adminContent.querySelectorAll('[data-f="saleUsdPerSecond"]').forEach((input) => {
    input.addEventListener("input", updateCredits);
  });
  byId("reloadPricingBtn")?.addEventListener("click", () => renderPricing());
  byId("savePricingBtn")?.addEventListener("click", async () => {
    try {
      const nextRows = Array.from(els.adminContent.querySelectorAll("tr[data-provider]")).map((tr) => ({
        provider: tr.dataset.provider,
        resolution: tr.dataset.resolution,
        rateKind: tr.dataset.rateKind,
        key: tr.dataset.key,
        unit: tr.dataset.unit,
        saleUsdPerSecond: Number(tr.querySelector('[data-f="saleUsdPerSecond"]')?.value || 0),
      }));
      const result = await api("/api/admin/pricing", {
        method: "PUT",
        body: { rows: nextRows },
      });
      state.config = result.config || null;
      toast("价格已保存。", "success");
      renderPricing();
    } catch (err) {
      toast(err.message, "error");
    }
  });
}

/* ============ PLATFORM ============ */
const FIXED_PLATFORM_CATEGORIES = [
  { id: "featured", name: "精选模板" },
  { id: "i2v", name: "图生视频" },
  { id: "t2v", name: "文生视频" },
];

const ADVANCED_CASE_CATEGORIES = [
  { id: "hot", name: "Hot" },
  { id: "extend", name: "Extend" },
  { id: "replace", name: "Replace" },
];

function defaultAdvancedConfig(platform = {}) {
  const advanced = platform.advanced && typeof platform.advanced === "object" ? platform.advanced : {};
  return {
    telegram: advanced.telegram || "",
    cases: Array.isArray(advanced.cases) ? advanced.cases : [],
  };
}

function platformTemplateRequestJson(template = {}) {
  if (template.requestJson && typeof template.requestJson === "object" && !Array.isArray(template.requestJson)) return template.requestJson;
  return {
    model: template.model || (template.type === "text-to-video" ? "bytedance/seedance-2.0/fast/text-to-video" : "bytedance/seedance-2.0/fast/image-to-video"),
    ...(template.params && typeof template.params === "object" && !Array.isArray(template.params) ? template.params : {}),
    ...(template.prompt ? { prompt: template.prompt } : {}),
    ...(template.negativePrompt ? { negative_prompt: template.negativePrompt } : {}),
  };
}

function platformCategoryOptions(categories = [], selected = "") {
  return categories.map((category) => `
    <option value="${escapeHtml(category.id)}" ${category.id === selected ? "selected" : ""}>${escapeHtml(category.name || category.id)}</option>
  `).join("");
}

function normalizeAdvancedCaseCategory(value = "") {
  const raw = String(value || "").trim().toLowerCase();
  if (raw.includes("extend")) return "extend";
  if (raw.includes("replace")) return "replace";
  if (raw === "hot" || raw.includes("popular")) return "hot";
  return "hot";
}

function advancedCaseCategoryLabel(value = "") {
  const id = normalizeAdvancedCaseCategory(value);
  return ADVANCED_CASE_CATEGORIES.find((item) => item.id === id)?.name || id;
}

function advancedCaseCategoryOptions(selected = "") {
  const current = normalizeAdvancedCaseCategory(selected);
  return ADVANCED_CASE_CATEGORIES.map((category) => `
    <option value="${escapeHtml(category.id)}" ${category.id === current ? "selected" : ""}>${escapeHtml(category.name || category.id)}</option>
  `).join("");
}

function platformTemplatePreview(template = {}) {
  const src = template.coverUrl || template.previewUrl || "";
  if (!src) return '<div class="platform-mini-preview"><i data-lucide="image"></i></div>';
  return `<img class="platform-mini-preview" src="${escapeHtml(src)}" alt="" loading="lazy" />`;
}

function isVideoUrl(url = "") {
  return /\.(mp4|webm|mov|m4v)(?:[?#]|$)/i.test(String(url || ""));
}

function captureVideoFrameDataUrl(videoUrl = "") {
  return new Promise((resolve) => {
    if (!videoUrl || !isVideoUrl(videoUrl)) return resolve("");
    const video = document.createElement("video");
    video.crossOrigin = "anonymous";
    video.muted = true;
    video.playsInline = true;
    video.preload = "auto";
    video.src = videoUrl;
    let timer = 0;
    const cleanup = () => {
      window.clearTimeout(timer);
      video.removeAttribute("src");
      video.load();
    };
    const fail = () => {
      cleanup();
      resolve("");
    };
    timer = window.setTimeout(fail, 8000);
    video.addEventListener("loadeddata", () => {
      try {
        video.currentTime = Math.min(0.25, Number(video.duration || 1) / 3);
      } catch {
        fail();
      }
    }, { once: true });
    video.addEventListener("seeked", () => {
      try {
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(240, video.videoWidth || 640);
        canvas.height = Math.max(135, video.videoHeight || 360);
        const ctx = canvas.getContext("2d");
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const dataUrl = canvas.toDataURL("image/jpeg", 0.82);
        cleanup();
        resolve(dataUrl);
      } catch {
        fail();
      }
    }, { once: true });
    video.addEventListener("error", fail, { once: true });
  });
}

async function ensurePlatformTemplateCover(template = {}) {
  if (template.coverUrl || !isVideoUrl(template.previewUrl)) return template;
  const dataUrl = await captureVideoFrameDataUrl(template.previewUrl);
  if (!dataUrl) return template;
  const payload = await api("/api/admin/platform-cover", {
    method: "POST",
    body: { dataUrl, name: template.id || template.title || "platform-cover" },
  });
  return { ...template, coverUrl: payload.url || template.coverUrl || "" };
}

function platformTemplateSummary(template = {}, index = 0, categories = []) {
  const category = categories.find((item) => item.id === template.category);
  const requestJson = platformTemplateRequestJson(template);
  const model = requestJson.model || template.model || "—";
  const prompt = requestJson.prompt || template.prompt || "";
  return `
    <tr data-template-index="${index}">
      <td>${platformTemplatePreview(template)}</td>
      <td>
        <strong>${escapeHtml(template.title || `Template ${index + 1}`)}</strong>
        <small class="adm-muted adm-block adm-mono">${escapeHtml(template.id || "")}</small>
      </td>
      <td>${escapeHtml(category?.name || template.category || "—")}</td>
      <td>${escapeHtml(template.type === "text-to-video" ? "Text to Video" : "Image to Video")}</td>
      <td class="adm-mono adm-truncate" title="${escapeHtml(String(model))}">${escapeHtml(String(model)).slice(0, 42)}</td>
      <td class="adm-truncate" title="${escapeHtml(prompt)}">${escapeHtml(prompt).slice(0, 80)}</td>
      <td>${template.enabled === false ? '<span class="adm-pill is-cancelled">Off</span>' : '<span class="adm-pill is-success">On</span>'}</td>
      <td>${Number.isFinite(Number(template.sort)) ? Number(template.sort) : index}</td>
      <td>
        <div class="adm-actions">
          <button class="adm-btn adm-btn-sm adm-btn-ghost" data-act="edit-template" type="button"><i data-lucide="pencil"></i>编辑</button>
          <button class="adm-btn adm-btn-sm adm-btn-danger" data-act="delete-template" type="button"><i data-lucide="trash-2"></i>删除</button>
        </div>
      </td>
    </tr>
  `;
}

function platformTemplateEditor(template = {}, index = 0, categories = []) {
  const requestJson = JSON.stringify(platformTemplateRequestJson(template), null, 2);
  return `
    <div class="platform-template-editor" data-template-index="${index}">
      <div class="adm-grid adm-grid-3">
        <div class="adm-form-row"><span>模板标题</span><input data-f="title" value="${escapeHtml(template.title || "")}" /></div>
        <div class="adm-form-row"><span>分类</span><select data-f="category">${platformCategoryOptions(categories, template.category || "")}</select></div>
        <div class="adm-form-row"><span>类型</span><select data-f="type">
          <option value="image-to-video" ${template.type !== "text-to-video" ? "selected" : ""}>Image to Video</option>
          <option value="text-to-video" ${template.type === "text-to-video" ? "selected" : ""}>Text to Video</option>
        </select></div>
      </div>
      <div class="adm-grid adm-grid-3">
        <div class="adm-form-row"><span>徽标</span><input data-f="badge" value="${escapeHtml(template.badge || "")}" placeholder="Hot / Image to Video" /></div>
        <div class="adm-form-row"><span>排序</span><input data-f="sort" type="number" value="${escapeHtml(template.sort ?? index)}" /></div>
        <div class="adm-form-row"><span>启用</span><label class="adm-flex" style="gap:8px;align-items:center;"><input data-f="enabled" type="checkbox" ${template.enabled !== false ? "checked" : ""} style="width:18px;height:18px;" /><span class="adm-muted">用户端展示</span></label></div>
      </div>
      <div class="adm-grid adm-grid-2">
        <div class="adm-form-row"><span>预览 URL（用户看到的演示视频或图片）</span><input data-f="previewUrl" value="${escapeHtml(template.previewUrl || "")}" placeholder="https://.../preview.mp4" /></div>
        <div class="adm-form-row"><span>封面 URL（可选，视频未加载前展示）</span><input data-f="coverUrl" value="${escapeHtml(template.coverUrl || "")}" placeholder="https://.../cover.jpg" /></div>
      </div>
      <div class="adm-form-row">
        <span>上游 JSON 参数（生成时只替换里面的图片字段为用户上传图）</span>
        <textarea data-f="requestJson" rows="16" spellcheck="false">${escapeHtml(requestJson)}</textarea>
      </div>
    </div>
  `;
}

function collectPlatformTemplateFromCard(card, existing = {}) {
  const get = (field) => card.querySelector(`[data-f="${field}"]`);
  let requestJson;
  try {
    requestJson = JSON.parse(get("requestJson")?.value || "{}");
  } catch {
    throw new Error("上游 JSON 参数格式不正确，请检查逗号和引号。");
  }
  if (!requestJson || typeof requestJson !== "object" || Array.isArray(requestJson)) throw new Error("上游 JSON 参数必须是对象。");
  const type = get("type")?.value === "text-to-video" ? "text-to-video" : "image-to-video";
  return {
    ...existing,
    title: get("title")?.value.trim() || existing.title || "Untitled template",
    category: get("category")?.value || existing.category || (type === "text-to-video" ? "t2v" : "i2v"),
    type,
    badge: get("badge")?.value.trim() || "",
    previewUrl: get("previewUrl")?.value.trim() || "",
    coverUrl: get("coverUrl")?.value.trim() || "",
    enabled: Boolean(get("enabled")?.checked),
    sort: Number(get("sort")?.value || 0),
    requestJson,
    model: String(requestJson.model || existing.model || "").trim(),
    prompt: typeof requestJson.prompt === "string" ? requestJson.prompt : "",
    params: {},
  };
}

function defaultPlatformTemplate(categories = [], index = 0) {
  const fixedCategories = categories.length ? categories : FIXED_PLATFORM_CATEGORIES;
  return {
    id: `template-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
    title: "New Template",
    category: fixedCategories[0]?.id || "featured",
    type: "image-to-video",
    badge: "Image to Video",
    previewUrl: "",
    coverUrl: "",
    enabled: true,
    sort: index,
    requestJson: {
      model: "dreamina-seedance-2-0-fast-260128",
      prompt: "女孩跳舞",
      functionMode: "omni_reference",
      ratio: "16:9",
      duration: 5,
      image_file_1: "https://example.com/reference.png",
    },
  };
}

function defaultAdvancedCase(index = 0) {
  return {
    id: `advanced-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
    title: "Advanced Case",
    category: "hot",
    provider: "wan27",
    price: 500,
    coverUrl: "",
    previewUrl: "",
    description: "",
    prompt: "A cinematic video, tasteful motion, premium lighting.",
    params: { provider: "wan27", ratio: "9:16", resolution: "720p", duration: 5, mediaMode: "first_frame" },
    enabled: true,
    sort: index,
  };
}

function advancedCaseDuration(item = {}) {
  const params = item.params && typeof item.params === "object" ? item.params : {};
  const provider = String(item.provider || params.provider || "seedance").toLowerCase().replace(/[\s_-]+/g, "");
  const min = provider === "wan27" || provider === "wan2.7" ? 2 : 5;
  const duration = Number(params.duration ?? item.duration ?? 5);
  if (!Number.isFinite(duration)) return 5;
  return Math.min(15, Math.max(min, duration));
}

function normalizeAdvancedResolution(value = "") {
  return String(value || "").trim().toLowerCase() === "1080p" ? "1080p" : "720p";
}

function normalizeWanMediaMode(value = "") {
  const normalized = String(value || "").trim().toLowerCase().replace(/[\s-]+/g, "_");
  return WAN27_MEDIA_MODES.some(([mode]) => mode === normalized) ? normalized : "first_frame";
}

function normalizeVideoRatio(value = "") {
  const normalized = String(value || "").trim().replace(/[：xX]/g, ":");
  if (/^\d+\s*:\s*\d+$/.test(normalized)) {
    const [width, height] = normalized.split(":").map((part) => Math.max(1, Number(part.trim()) || 1));
    return `${width}:${height}`;
  }
  return "16:9";
}

function videoPixelDimensions(resolution = "720p", ratio = "16:9") {
  const shortSide = normalizeAdvancedResolution(resolution) === "1080p" ? 1080 : 720;
  const [ratioW, ratioH] = normalizeVideoRatio(ratio).split(":").map((part) => Math.max(1, Number(part) || 1));
  if (ratioW >= ratioH) {
    return {
      width: Math.max(1, Math.round((shortSide * ratioW) / ratioH)),
      height: shortSide,
    };
  }
  const width = shortSide;
  const height = Math.max(1, Math.round((shortSide * ratioH) / ratioW));
  return { width, height };
}

function advancedCaseCredits(item = {}) {
  const params = item.params && typeof item.params === "object" ? item.params : {};
  const provider = String(item.provider || params.provider || "seedance").toLowerCase().replace(/[\s_-]+/g, "");
  const duration = advancedCaseDuration(item);
  const resolution = normalizeAdvancedResolution(params.resolution);
  const isWan = provider === "wan27" || provider === "wan2.7";
  const perSecond = isWan
    ? (resolution === "1080p" ? ADVANCED_WAN27_1080P_CREDITS_PER_SECOND : ADVANCED_WAN27_720P_CREDITS_PER_SECOND)
    : (resolution === "1080p" ? ADVANCED_SEEDANCE_1080P_CREDITS_PER_SECOND : ADVANCED_SEEDANCE_720P_CREDITS_PER_SECOND);
  return Math.round(duration * perSecond);
}

function advancedCaseSummary(item = {}, index = 0) {
  return `
    <tr data-advanced-index="${index}">
      <td>${platformTemplatePreview(item)}</td>
      <td><strong>${escapeHtml(item.title || `Case ${index + 1}`)}</strong><br/><small class="adm-muted adm-mono">${escapeHtml(item.id || "")}</small></td>
      <td>${escapeHtml(advancedCaseCategoryLabel(item.category))}</td>
      <td>${escapeHtml(item.provider || item.params?.provider || "seedance")} / ${advancedCaseCredits(item)}（${advancedCaseDuration(item)}s）</td>
      <td class="adm-truncate" title="${escapeHtml(item.prompt || "")}">${escapeHtml(item.prompt || "").slice(0, 80)}</td>
      <td>${item.enabled === false ? '<span class="adm-pill is-cancelled">Off</span>' : '<span class="adm-pill is-success">On</span>'}</td>
      <td>
        <div class="adm-actions">
          <button class="adm-btn adm-btn-sm adm-btn-ghost" data-act="edit-advanced" type="button"><i data-lucide="pencil"></i>编辑</button>
          <button class="adm-btn adm-btn-sm adm-btn-primary" data-act="generate-advanced" type="button"><i data-lucide="wand-sparkles"></i>生成</button>
          <button class="adm-btn adm-btn-sm adm-btn-ghost" data-act="delete-advanced" type="button"><i data-lucide="eye-off"></i>移出展示</button>
        </div>
      </td>
    </tr>
  `;
}

function advancedCaseEditor(item = {}, index = 0) {
  const params = JSON.stringify(item.params && typeof item.params === "object" ? item.params : { ratio: "9:16", resolution: "720p", duration: 5 }, null, 2);
  const provider = String(item.provider || item.params?.provider || "seedance").toLowerCase().replace(/[\s_-]+/g, "") === "wan27" ? "wan27" : "seedance";
  const mediaMode = normalizeWanMediaMode(item.mediaMode || item.params?.mediaMode);
  const videoInput = item.sourceVideoUrl || (/^https?:\/\//i.test(item.previewUrl || "") ? item.previewUrl : "");
  const coverInput = item.sourceCoverUrl || (/^https?:\/\//i.test(item.coverUrl || "") ? item.coverUrl : "");
  const inputImage = item.inputImageUrl || item.sourceImageUrl || "";
  const inputVideo = item.inputVideoUrl || "";
  const inputVideoPoster = item.inputVideoPosterUrl || "";
  return `
    <div class="platform-template-editor" data-advanced-index="${index}">
      <div class="adm-grid adm-grid-3">
        <div class="adm-form-row"><span>标题</span><input data-f="title" value="${escapeHtml(item.title || "")}" /></div>
        <div class="adm-form-row"><span>分类</span><select data-f="category">${advancedCaseCategoryOptions(item.category || "hot")}</select></div>
        <div class="adm-form-row"><span>模型</span><select data-f="provider"><option value="seedance" ${provider === "seedance" ? "selected" : ""}>Seedance</option><option value="wan27" ${provider === "wan27" ? "selected" : ""}>Wan2.7</option></select></div>
      </div>
      <div class="adm-grid adm-grid-3">
        <div class="adm-form-row"><span>Wan2.7 输入组合</span><select data-f="mediaMode">${WAN27_MEDIA_MODES.map(([mode, label]) => `<option value="${mode}" ${mediaMode === mode ? "selected" : ""}>${label}</option>`).join("")}</select></div>
        <div class="adm-form-row"><span>默认音频 URL</span><input data-f="drivingAudioUrl" value="${escapeHtml(item.params?.drivingAudioUrl || item.params?.driving_audio_url || "")}" placeholder="https://.../audio.mp3" /></div>
        <div class="adm-form-row"><span>默认续写视频 URL</span><input data-f="firstClipUrl" value="${escapeHtml(item.params?.firstClipUrl || item.params?.first_clip_url || "")}" placeholder="https://.../clip.mp4" /></div>
      </div>
      <div class="adm-grid adm-grid-3">
        <div class="adm-form-row"><span>排序</span><input data-f="sort" type="number" value="${escapeHtml(item.sort ?? index)}" /></div>
        <div class="adm-form-row"><span>启用</span><label class="adm-flex" style="gap:8px;align-items:center;"><input data-f="enabled" type="checkbox" ${item.enabled !== false ? "checked" : ""} style="width:18px;height:18px;" /><span class="adm-muted">用户端展示</span></label></div>
      </div>
      <div class="adm-grid adm-grid-2">
        <div class="adm-form-row"><span>样例视频链接（必填，http/https）</span><input data-f="sourceVideoUrl" value="${escapeHtml(videoInput)}" placeholder="https://.../case-preview.mp4" /></div>
        <div class="adm-form-row"><span>封面链接（选填，http/https）</span><input data-f="sourceCoverUrl" value="${escapeHtml(coverInput)}" placeholder="不填则保存时从视频抽帧" /></div>
      </div>
      <div class="adm-form-row"><span>输入图片 URL（Extend/Replace 左侧展示）</span><input data-f="inputImageUrl" value="${escapeHtml(inputImage)}" placeholder="https://.../input.jpg" /></div>
      <div class="adm-grid adm-grid-2">
        <div class="adm-form-row"><span>输入视频 URL（Replace 左侧展示）</span><input data-f="inputVideoUrl" value="${escapeHtml(inputVideo)}" placeholder="https://.../input.mp4" /></div>
        <div class="adm-form-row"><span>输入视频首帧 URL</span><input data-f="inputVideoPosterUrl" value="${escapeHtml(inputVideoPoster)}" placeholder="https://.../first-frame.jpg" /></div>
      </div>
      ${(item.localVideoUrl || item.cdnVideoUrl || item.localCoverUrl || item.cdnCoverUrl) ? `
        <div class="adm-form-row">
          <span>已入库素材</span>
          <input value="${escapeHtml(item.cdnVideoUrl || item.localVideoUrl || item.previewUrl || "")}" disabled />
        </div>
      ` : ""}
      <div class="adm-form-row"><span>描述</span><textarea data-f="description" rows="3">${escapeHtml(item.description || "")}</textarea></div>
      <div class="adm-form-row"><span>Prompt（点案例后自动填到前台）</span><textarea data-f="prompt" rows="5">${escapeHtml(item.prompt || "")}</textarea></div>
      <div class="adm-form-row"><span>参数 JSON（点案例后自动带入；Seedance 默认使用原图；Wan2.7: seed / resolution）</span><textarea data-f="params" rows="8" spellcheck="false">${escapeHtml(params)}</textarea></div>
    </div>
  `;
}

function collectAdvancedCaseFromCard(card, existing = {}) {
  const get = (field) => card.querySelector(`[data-f="${field}"]`);
  let params;
  try {
    params = JSON.parse(get("params")?.value || "{}");
  } catch {
    throw new Error("高级案例参数 JSON 格式不正确。");
  }
  if (!params || typeof params !== "object" || Array.isArray(params)) throw new Error("高级案例参数必须是对象。");
  const provider = get("provider")?.value === "wan27" ? "wan27" : "seedance";
  params.provider = provider;
  if (provider === "wan27") {
    params.mediaMode = normalizeWanMediaMode(get("mediaMode")?.value || params.mediaMode);
    const audioUrl = get("drivingAudioUrl")?.value.trim() || "";
    const clipUrl = get("firstClipUrl")?.value.trim() || "";
    if (audioUrl) params.drivingAudioUrl = audioUrl;
    else delete params.drivingAudioUrl;
    if (clipUrl) params.firstClipUrl = clipUrl;
    else delete params.firstClipUrl;
  }
  return {
    ...existing,
    title: get("title")?.value.trim() || existing.title || "Advanced Case",
    category: normalizeAdvancedCaseCategory(get("category")?.value || existing.category || "hot"),
    provider,
    mediaMode: provider === "wan27" ? params.mediaMode : "",
    price: advancedCaseCredits({ params, provider }),
    sourceVideoUrl: get("sourceVideoUrl")?.value.trim() || existing.sourceVideoUrl || "",
    sourceCoverUrl: get("sourceCoverUrl")?.value.trim() || existing.sourceCoverUrl || "",
    inputImageUrl: get("inputImageUrl")?.value.trim() || existing.inputImageUrl || "",
    inputVideoUrl: get("inputVideoUrl")?.value.trim() || existing.inputVideoUrl || "",
    inputVideoPosterUrl: get("inputVideoPosterUrl")?.value.trim() || existing.inputVideoPosterUrl || "",
    sourceImageUrl: get("inputImageUrl")?.value.trim() || existing.sourceImageUrl || "",
    coverUrl: existing.coverUrl || "",
    previewUrl: existing.previewUrl || "",
    description: get("description")?.value.trim() || "",
    prompt: get("prompt")?.value.trim() || "",
    params,
    enabled: Boolean(get("enabled")?.checked),
    sort: Number(get("sort")?.value || 0),
  };
}

function isHttpUrl(value = "") {
  try {
    const parsed = new URL(String(value || "").trim());
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

async function ingestAdvancedCaseMediaForSave(item = {}) {
  const sourceVideoUrl = String(item.sourceVideoUrl || "").trim();
  const sourceCoverUrl = String(item.sourceCoverUrl || "").trim();
  if (!isHttpUrl(sourceVideoUrl)) {
    throw new Error("样例视频链接必须是 http 或 https 格式。");
  }
  if (sourceCoverUrl && !isHttpUrl(sourceCoverUrl)) {
    throw new Error("封面链接必须是 http 或 https 格式。");
  }
  const unchanged =
    sourceVideoUrl === item.mediaSourceVideoUrl &&
    sourceCoverUrl === (item.mediaSourceCoverUrl || "");
  if (unchanged && item.localVideoUrl && item.previewUrl) return item;
  const payload = await api("/api/admin/advanced-case-media", {
    method: "POST",
    body: {
      caseId: item.id || item.title || "advanced-case",
      videoUrl: sourceVideoUrl,
      coverUrl: sourceCoverUrl,
    },
  });
  const media = payload.media || {};
  if (media.cdnError) toast(`素材已本地入库，CDN 上传失败：${media.cdnError}`, "warning");
  return {
    ...item,
    mediaSourceVideoUrl: sourceVideoUrl,
    mediaSourceCoverUrl: sourceCoverUrl,
    sourceVideoUrl,
    sourceCoverUrl,
    localVideoUrl: media.localVideoUrl || item.localVideoUrl || "",
    localCoverUrl: media.localCoverUrl || item.localCoverUrl || "",
    cdnVideoUrl: media.cdnVideoUrl || "",
    cdnCoverUrl: media.cdnCoverUrl || "",
    previewUrl: media.previewUrl || media.cdnVideoUrl || media.localVideoUrl || item.previewUrl || "",
    coverUrl: media.coverUrl || media.cdnCoverUrl || media.localCoverUrl || item.coverUrl || "",
  };
}

function advancedGenerateForm(item = {}) {
  const params = item.params && typeof item.params === "object" ? item.params : {};
  const provider = String(item.provider || params.provider || "wan27") === "seedance" ? "seedance" : "wan27";
  const mediaMode = normalizeWanMediaMode(item.mediaMode || params.mediaMode);
  return `
    <div class="platform-template-editor">
      <div class="adm-grid adm-grid-3">
        <div class="adm-form-row"><span>模型</span><select data-g="provider"><option value="wan27" ${provider === "wan27" ? "selected" : ""}>Wan2.7</option><option value="seedance" ${provider === "seedance" ? "selected" : ""}>Seedance</option></select></div>
        <div class="adm-form-row" data-provider-section="wan27"><span>Wan 组合</span><select data-g="mediaMode">${WAN27_MEDIA_MODES.map(([mode, label]) => `<option value="${mode}" ${mediaMode === mode ? "selected" : ""}>${label}</option>`).join("")}</select></div>
        <div class="adm-form-row"><span>分辨率</span><select data-g="resolution"><option value="720p" ${normalizeAdvancedResolution(params.resolution) === "720p" ? "selected" : ""}>720p</option><option value="1080p" ${normalizeAdvancedResolution(params.resolution) === "1080p" ? "selected" : ""}>1080p</option></select></div>
      </div>
      <div class="adm-grid adm-grid-3">
        <div class="adm-form-row"><span>比例</span><input data-g="ratio" value="${escapeHtml(params.ratio || params.aspect_ratio || "9:16")}" /></div>
        <div class="adm-form-row"><span>时长</span><input data-g="duration" type="number" min="2" max="15" value="${escapeHtml(params.duration || 5)}" /></div>
        <div class="adm-form-row"><span>Seed</span><input data-g="seed" type="number" min="0" value="${escapeHtml(params.seed || "")}" /></div>
      </div>
      <div class="adm-form-row"><span>Prompt</span><textarea data-g="prompt" rows="5">${escapeHtml(item.prompt || params.prompt || "")}</textarea></div>
      <div class="adm-grid adm-grid-2" data-provider-section="wan27">
        <div class="adm-form-row"><span>首帧/主参考图</span><input data-g="firstFrame" type="file" accept="image/*" /></div>
        <div class="adm-form-row"><span>尾帧图片</span><input data-g="lastFrame" type="file" accept="image/*" /></div>
      </div>
      <div class="adm-form-row" data-provider-section="seedance"><span>Seedance 参考图（可多选）</span><input data-g="seedanceReferences" type="file" accept="image/*" multiple /></div>
      <div class="adm-grid adm-grid-2" data-provider-section="wan27">
        <div class="adm-form-row"><span>音频 URL</span><input data-g="drivingAudioUrl" value="${escapeHtml(params.drivingAudioUrl || "")}" placeholder="https://.../audio.mp3" /></div>
        <div class="adm-form-row"><span>续写视频文件（5秒以内）</span><input data-g="firstClipFile" type="file" accept="video/mp4,video/webm,video/quicktime,video/*" /><input data-g="firstClipUrl" value="${escapeHtml(params.firstClipUrl || "")}" placeholder="https://.../clip.mp4" /></div>
      </div>
      <p class="adm-muted">后台生成会直接创建到当前管理员账号的 History。Seedance 在一个控件内多选参考图；Wan2.7 按组合使用首帧、尾帧、音频或续写视频。</p>
    </div>
  `;
}

function bindAdvancedGenerateForm(dialogBody) {
  const providerSelect = dialogBody.querySelector('[data-g="provider"]');
  const resolutionSelect = dialogBody.querySelector('[data-g="resolution"]');
  const sections = Array.from(dialogBody.querySelectorAll("[data-provider-section]"));
  const sync = () => {
    const provider = providerSelect?.value || "wan27";
    sections.forEach((section) => {
      section.hidden = section.dataset.providerSection !== provider;
    });
    if (resolutionSelect) {
      const options = provider === "seedance" ? ["480p", "720p", "1080p"] : ["720p", "1080p"];
      const current = normalizeAdvancedResolution(resolutionSelect.value, provider);
      resolutionSelect.innerHTML = options.map((value) => `<option value="${escapeHtml(value)}" ${value === current ? "selected" : ""}>${escapeHtml(value)}</option>`).join("");
      resolutionSelect.value = options.includes(current) ? current : options[0];
    }
  };
  providerSelect?.addEventListener("change", sync);
  sync();
}

async function collectAdvancedGenerateBody(dialogBody, item = {}) {
  const get = (field) => dialogBody.querySelector(`[data-g="${field}"]`);
  const readDataUrl = (input, options = {}) => new Promise(async (resolve, reject) => {
    const file = input?.files?.[0];
    if (!file) return resolve({ dataUrl: "", fileName: "" });
    if (options.maxBytes && file.size > options.maxBytes) return reject(new Error(options.maxBytesMessage || "文件过大"));
    if (options.maxDurationSeconds) {
      const duration = await readVideoDuration(file).catch(() => 0);
      if (!duration || duration > options.maxDurationSeconds) return reject(new Error(options.maxDurationMessage || "视频时长不能超过限制"));
    }
    const reader = new FileReader();
    reader.onload = () => resolve({ dataUrl: String(reader.result || ""), fileName: file.name || "" });
    reader.onerror = () => reject(new Error("读取文件失败"));
    reader.readAsDataURL(file);
  });
  const readMultipleDataUrls = async (input) => {
    const files = Array.from(input?.files || []);
    if (files.length > ADVANCED_SEEDANCE_REFERENCE_LIMIT) {
      throw new Error(`Seedance 参考图最多 ${ADVANCED_SEEDANCE_REFERENCE_LIMIT} 张`);
    }
    if (files.some((file) => file.size > ADVANCED_SEEDANCE_REFERENCE_MAX_BYTES)) {
      throw new Error("Seedance 参考图每张不能超过 8MB");
    }
    return Promise.all(files.map((file) => new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve({ dataUrl: String(reader.result || ""), fileName: file.name || "" });
      reader.onerror = () => reject(new Error("读取文件失败"));
      reader.readAsDataURL(file);
    })));
  };
  const first = await readDataUrl(get("firstFrame"));
  const last = await readDataUrl(get("lastFrame"));
  const clip = await readDataUrl(get("firstClipFile"), {
    maxBytes: ADVANCED_WAN_CLIP_MAX_BYTES,
    maxBytesMessage: "续写视频文件不能超过 30MB",
    maxDurationSeconds: ADVANCED_WAN_CLIP_MAX_SECONDS,
    maxDurationMessage: "续写视频必须 5 秒以内",
  });
  const seedanceReferences = await readMultipleDataUrls(get("seedanceReferences"));
  const provider = get("provider")?.value || item.provider || "wan27";
  if (provider === "seedance" && !seedanceReferences.length) {
    throw new Error("请至少上传一张 Seedance 参考图");
  }
  return {
    caseId: item.id || "",
    provider,
    prompt: get("prompt")?.value.trim() || item.prompt || "",
    mediaMode: normalizeWanMediaMode(get("mediaMode")?.value),
    dataUrl: first.dataUrl,
    firstFrameDataUrl: first.dataUrl,
    firstFrameFileName: first.fileName,
    referenceImages: provider === "seedance" ? seedanceReferences : undefined,
    lastFrameDataUrl: last.dataUrl,
    lastFrameFileName: last.fileName,
    drivingAudioUrl: get("drivingAudioUrl")?.value.trim() || "",
    firstClipDataUrl: clip.dataUrl,
    firstClipFileName: clip.fileName,
    firstClipUrl: get("firstClipUrl")?.value.trim() || "",
    ratio: get("ratio")?.value.trim() || "9:16",
    resolution: get("resolution")?.value || "720p",
    duration: Number(get("duration")?.value || 5),
    seed: get("seed")?.value || "",
  };
}

async function renderAdvancedCases() {
  await renderPlatform({ advancedOnly: true });
}

async function renderPlatform(options = {}) {
  const advancedOnly = Boolean(options.advancedOnly);
  const config = await loadConfig(true);
  const routeId = advancedOnly ? "advanced-cases" : "platform";
  if (!isActiveRoute(routeId)) return;
  const platform = config.platform || {};
  const categories = FIXED_PLATFORM_CATEGORIES;
  const templates = Array.isArray(platform.templates) ? platform.templates : [];
  const advanced = defaultAdvancedConfig(platform);
  const rerenderPlatform = () => renderPlatform({ advancedOnly });
  els.adminContent.innerHTML = `
    <section class="adm-page">
      <div class="adm-page-head">
        <div>
          <h2>${advancedOnly ? "高级案例" : "首页广场"}</h2>
          <p class="adm-muted">${advancedOnly ? "配置前台 Advanced tab 的样例视频、封面、提示词和模型参数。" : "只配置模板记录。首页品牌、标题、公告和分类已固定，不在后台反复改。"}</p>
        </div>
        <div class="adm-page-actions">
          <a class="adm-btn adm-btn-ghost" href="/" target="_blank" rel="noopener"><i data-lucide="external-link"></i>预览首页</a>
          ${advancedOnly ? '<a class="adm-btn adm-btn-ghost" href="#/platform"><i data-lucide="layout-template"></i>模板列表</a>' : '<a class="adm-btn adm-btn-ghost" href="#/advanced-cases"><i data-lucide="wand-sparkles"></i>高级案例</a>'}
          ${advancedOnly ? '<button class="adm-btn adm-btn-ghost" id="addAdvancedCaseTopBtn"><i data-lucide="plus"></i>新增案例</button>' : '<button class="adm-btn adm-btn-ghost" id="addPlatformTemplateBtn"><i data-lucide="plus"></i>新增模板</button>'}
          <button class="adm-btn adm-btn-primary" id="${advancedOnly ? "saveAdvancedTopBtn" : "savePlatformBtn"}"><i data-lucide="save"></i>${advancedOnly ? "保存高级配置" : "保存全部"}</button>
        </div>
      </div>
      ${advancedOnly ? "" : `<div class="adm-card adm-mt">
        <div class="adm-card-head">
          <div>
            <h3>模板列表</h3>
            <span class="adm-muted">${templates.length} 条。点击新增或编辑维护预览 URL、封面和上游 JSON。</span>
          </div>
          <input class="platform-template-search" id="platformTemplateSearch" placeholder="搜索标题 / ID / prompt / model" />
        </div>
        <div class="adm-card-body adm-table-wrap platform-template-table-wrap">
          ${templates.length ? `
            <table class="adm-table platform-template-table">
              <thead><tr><th>预览</th><th>标题 / ID</th><th>分类</th><th>类型</th><th>模型</th><th>Prompt</th><th>状态</th><th>排序</th><th></th></tr></thead>
              <tbody id="platformTemplateList">
                ${templates.map((template, index) => platformTemplateSummary(template, index, categories)).join("")}
              </tbody>
            </table>
          ` : `<div class="adm-empty"><i data-lucide="layout-template"></i><p>暂无模板，点击「新增模板」。</p></div>`}
        </div>
      </div>`}
      <div class="adm-card adm-mt" id="advancedCasesCard">
        <div class="adm-card-head">
          <div>
            <h3>高级生成案例</h3>
            <span class="adm-muted">用于前台 Advanced tab。新增案例可配置样例视频、封面、提示词和模型参数。</span>
          </div>
          <div class="adm-page-actions">
            <button class="adm-btn adm-btn-ghost" id="addAdvancedCaseBtn"><i data-lucide="plus"></i>新增案例</button>
            <button class="adm-btn adm-btn-primary" id="saveAdvancedBtn"><i data-lucide="save"></i>保存高级配置</button>
          </div>
        </div>
        <div class="adm-card-body">
          <div class="adm-form-row"><span>Telegram 客服链接</span><input id="advancedTelegram" value="${escapeHtml(advanced.telegram || "")}" placeholder="https://t.me/..." /></div>
          <div class="adm-table-wrap platform-template-table-wrap adm-mt">
            ${advanced.cases.length ? `
              <table class="adm-table platform-template-table">
                <thead><tr><th>封面</th><th>标题 / ID</th><th>分类</th><th>自动计费</th><th>Prompt</th><th>状态</th><th></th></tr></thead>
                <tbody id="advancedCaseList">
                  ${advanced.cases.map((item, index) => advancedCaseSummary(item, index)).join("")}
                </tbody>
              </table>
            ` : `<div class="adm-empty"><i data-lucide="sparkles"></i><p>暂无高级案例，点击「新增案例」配置样例视频和参数。</p></div>`}
          </div>
        </div>
      </div>
    </section>
  `;
  refreshIcons();

  const saveAll = async () => {
    const nextPlatform = {
      ...platform,
      categories,
      templates,
    };
    const payload = await api("/api/admin/config", { method: "PUT", body: { config: { ...config, platform: nextPlatform } } });
    state.config = payload.config;
    toast("首页广场已保存。", "success");
    rerenderPlatform();
  };

  byId("savePlatformBtn")?.addEventListener("click", async () => {
    try {
      await saveAll();
    } catch (err) {
      toast(err.message, "error");
    }
  });

  byId("addPlatformTemplateBtn")?.addEventListener("click", async () => {
    try {
      const draft = defaultPlatformTemplate(categories, templates.length);
      const result = await openDialog({
        title: "新增模板",
        body: platformTemplateEditor(draft, templates.length, categories),
        confirmText: "保存模板",
        cancelText: "取消",
        onConfirm: async () => {
          const editor = els.dialogBody.querySelector("[data-template-index]");
          const collected = await ensurePlatformTemplateCover(collectPlatformTemplateFromCard(editor, draft));
          const nextTemplates = [...templates, collected];
          const payload = await api("/api/admin/config", {
            method: "PUT",
            body: { config: { ...config, platform: { ...platform, categories, templates: nextTemplates } } },
          });
          state.config = payload.config;
          toast("模板已新增。", "success");
        },
      });
      if (result === "confirm") rerenderPlatform();
    } catch (err) {
      toast(err.message, "error");
    }
  });

  const saveAdvanced = async (nextCases = advanced.cases) => {
    const nextAdvanced = {
      ...advanced,
      telegram: byId("advancedTelegram")?.value.trim() || "",
      cases: nextCases,
    };
    const payload = await api("/api/admin/config", {
      method: "PUT",
      body: { config: { ...config, platform: { ...platform, categories, templates, advanced: nextAdvanced } } },
    });
    state.config = payload.config;
    toast("高级生成配置已保存。", "success");
    rerenderPlatform();
  };

  byId("saveAdvancedBtn")?.addEventListener("click", async () => {
    try {
      await saveAdvanced();
    } catch (err) {
      toast(err.message, "error");
    }
  });
  byId("saveAdvancedTopBtn")?.addEventListener("click", async () => {
    try {
      await saveAdvanced();
    } catch (err) {
      toast(err.message, "error");
    }
  });

  const openAddAdvancedCaseDialog = async () => {
    try {
      const draft = defaultAdvancedCase(advanced.cases.length);
      const result = await openDialog({
        title: "新增高级案例",
        body: advancedCaseEditor(draft, advanced.cases.length),
        confirmText: "保存案例",
        cancelText: "取消",
        onConfirm: async () => {
          const editor = els.dialogBody.querySelector("[data-advanced-index]");
          let collected = collectAdvancedCaseFromCard(editor, draft);
          collected = await ingestAdvancedCaseMediaForSave(collected);
          await saveAdvanced([...advanced.cases, collected]);
        },
      });
      if (result === "confirm") rerenderPlatform();
    } catch (err) {
      toast(err.message, "error");
    }
  };
  byId("addAdvancedCaseBtn")?.addEventListener("click", openAddAdvancedCaseDialog);
  byId("addAdvancedCaseTopBtn")?.addEventListener("click", openAddAdvancedCaseDialog);

  byId("platformTemplateSearch")?.addEventListener("input", (event) => {
    const keyword = event.target.value.trim().toLowerCase();
    els.adminContent.querySelectorAll("#platformTemplateList tr[data-template-index]").forEach((row) => {
      row.hidden = keyword && !row.textContent.toLowerCase().includes(keyword);
    });
  });

  els.adminContent.querySelectorAll("#platformTemplateList tr[data-template-index]").forEach((row) => {
    row.querySelector('[data-act="edit-template"]')?.addEventListener("click", async () => {
      const index = Number(row.dataset.templateIndex || 0);
      const result = await openDialog({
        title: `编辑模板：${templates[index]?.title || `Template ${index + 1}`}`,
        body: platformTemplateEditor(templates[index] || {}, index, categories),
        confirmText: "保存模板",
        cancelText: "取消",
        onConfirm: async () => {
          const editor = els.dialogBody.querySelector("[data-template-index]");
          const collected = await ensurePlatformTemplateCover(collectPlatformTemplateFromCard(editor, templates[index]));
          const nextTemplates = templates.map((item, itemIndex) => (
            itemIndex === index ? collected : item
          ));
          const payload = await api("/api/admin/config", {
            method: "PUT",
            body: {
              config: {
                ...config,
                platform: {
                  ...platform,
                  categories,
                  templates: nextTemplates,
                },
              },
            },
          });
          state.config = payload.config;
          toast("模板已保存。", "success");
        },
      });
      if (result === "confirm") rerenderPlatform();
    });
    row.querySelector('[data-act="delete-template"]')?.addEventListener("click", async () => {
      const index = Number(row.dataset.templateIndex || 0);
      const ok = await confirmAction("删除模板", `确认删除「${templates[index]?.title || "Template"}」？`, { danger: true, confirmText: "删除" });
      if (!ok) return;
      const nextTemplates = templates.filter((_, i) => i !== index);
      const payload = await api("/api/admin/config", {
        method: "PUT",
        body: { config: { ...config, platform: { ...platform, templates: nextTemplates } } },
      });
      state.config = payload.config;
      toast("模板已删除。", "success");
      rerenderPlatform();
    });
  });

  els.adminContent.querySelectorAll("#advancedCaseList tr[data-advanced-index]").forEach((row) => {
    row.querySelector('[data-act="generate-advanced"]')?.addEventListener("click", async () => {
      const index = Number(row.dataset.advancedIndex || 0);
      const item = advanced.cases[index] || {};
      const result = await openDialog({
        title: `后台高级生成：${item.title || `Case ${index + 1}`}`,
        body: advancedGenerateForm(item),
        confirmText: "提交生成",
        cancelText: "取消",
        onOpen: bindAdvancedGenerateForm,
        onConfirm: async () => {
          const body = await collectAdvancedGenerateBody(els.dialogBody, item);
          const payload = await api("/api/admin/advanced/generate", { method: "POST", body });
          toast(`已提交：${payload.taskId || payload.task?.taskId || ""}`, "success");
        },
      });
      if (result === "confirm") window.location.hash = "#/records";
    });
    row.querySelector('[data-act="edit-advanced"]')?.addEventListener("click", async () => {
      const index = Number(row.dataset.advancedIndex || 0);
      const result = await openDialog({
        title: `编辑高级案例：${advanced.cases[index]?.title || `Case ${index + 1}`}`,
        body: advancedCaseEditor(advanced.cases[index] || {}, index),
        confirmText: "保存案例",
        cancelText: "取消",
        onConfirm: async () => {
          const editor = els.dialogBody.querySelector("[data-advanced-index]");
          let collected = collectAdvancedCaseFromCard(editor, advanced.cases[index]);
          collected = await ingestAdvancedCaseMediaForSave(collected);
          const nextCases = advanced.cases.map((item, itemIndex) => (itemIndex === index ? collected : item));
          await saveAdvanced(nextCases);
        },
      });
      if (result === "confirm") rerenderPlatform();
    });
    row.querySelector('[data-act="delete-advanced"]')?.addEventListener("click", async () => {
      const index = Number(row.dataset.advancedIndex || 0);
      const ok = await confirmAction(
        "移出高级案例展示",
        `确认把「${advanced.cases[index]?.title || "Case"}」从 Advanced 案例展示移出？只会删除展示配置，不会删除视频、封面、生成记录或素材文件。`,
        { confirmText: "移出展示" },
      );
      if (!ok) return;
      await saveAdvanced(advanced.cases.filter((_, i) => i !== index));
    });
  });
}

/* ============ CONFIG ============ */
async function renderConfig() {
  const config = await loadConfig(true);
  if (!isActiveRoute("config")) return;
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

/* ============ GEO ============ */
async function renderGeo() {
  const payload = await api("/api/admin/geo-report");
  if (!isActiveRoute("geo")) return;
  const summary = payload.summary || {};
  const checks = payload.checks || [];
  const samples = payload.sampleCharacters || [];
  const topics = payload.sampleTopics || [];
  const coverage = payload.coverage || {};
  const indexNowHistory = payload.indexNowHistory || [];
  els.adminContent.innerHTML = `
    <section class="adm-page adm-geo-page">
      <div class="adm-page-head">
        <div>
          <h2>GEO</h2>
          <p class="adm-muted">Check AI-search entry files, structured metadata, sitemap coverage, and crawlable character pages.</p>
        </div>
        <div class="adm-page-actions">
          <a class="adm-btn adm-btn-ghost" href="${escapeHtml(summary.sitemapUrl || "/sitemap.xml")}" target="_blank" rel="noopener"><i data-lucide="map"></i>Sitemap</a>
          <a class="adm-btn adm-btn-ghost" href="${escapeHtml(summary.llmsUrl || "/llms.txt")}" target="_blank" rel="noopener"><i data-lucide="file-text"></i>llms.txt</a>
          <button class="adm-btn adm-btn-ghost" id="geoSubmitIndexNowBtn" type="button"><i data-lucide="send"></i>Submit IndexNow</button>
          <button class="adm-btn adm-btn-primary" id="geoRunChecksBtn" type="button"><i data-lucide="radar"></i>Run checks</button>
        </div>
      </div>

      <div class="adm-grid adm-grid-4">
        ${statCard("Base URL", payload.baseUrl || "-", payload.brand || "", "globe-2", "rose")}
        ${statCard("GEO Score", summary.geoScore || 0, coverage.status || "needs work", "activity", "violet")}
        ${statCard("Content quality", `${summary.contentQualityPercent || 0}%`, `${summary.characterCount || 0} profiles`, "badge-check", "mint")}
        ${statCard("IndexNow URLs", summary.indexNowUrlCount || summary.sitemapUrlCount || 0, "ready to submit", "send", "amber")}
      </div>

      <div class="adm-card adm-geo-score-card">
        <header class="adm-card-head">
          <h3>GEO effect dashboard</h3>
          <span class="adm-pill ${coverage.status === "healthy" ? "is-success" : coverage.status === "warming up" ? "is-pending" : "is-failed"}">${escapeHtml(coverage.status || "unknown")}</span>
        </header>
        <div class="adm-card-body adm-geo-score-body">
          <div class="adm-geo-score-ring">
            <strong>${escapeHtml(String(coverage.score || 0))}</strong>
            <span>score</span>
          </div>
          <div class="adm-geo-metrics">
            ${(coverage.metrics || []).map(renderGeoMetric).join("")}
          </div>
          <div class="adm-geo-tags">
            <span class="adm-kicker">Top discovery tags</span>
            <div>${(coverage.topTags || []).map((item) => `<small>${escapeHtml(item.tag)} · ${escapeHtml(String(item.count))}</small>`).join("") || '<em class="adm-muted">No tags yet.</em>'}</div>
          </div>
        </div>
      </div>

      <div class="adm-card">
        <header class="adm-card-head">
          <h3>Content quality</h3>
          <span class="adm-muted">${escapeHtml(String(summary.contentQualityPercent || 0))}% ready</span>
        </header>
        <div class="adm-card-body adm-geo-quality-grid">
          ${(coverage.qualityMetrics || []).map(renderGeoMetric).join("")}
        </div>
      </div>

      <div class="adm-card adm-geo-indexnow">
        <header class="adm-card-head">
          <h3>IndexNow</h3>
          <span class="adm-muted" id="geoIndexNowStatus">${escapeHtml(String(summary.indexNowUrlCount || 0))} URLs ready</span>
        </header>
        <div class="adm-card-body adm-geo-indexnow-body">
          <div>
            <span class="adm-kicker">Key file</span>
            <a class="adm-mono" href="${escapeHtml(summary.indexNowKeyLocation || "#")}" target="_blank" rel="noopener">${escapeHtml(summary.indexNowKeyLocation || "-")}</a>
          </div>
          <div>
            <span class="adm-kicker">Crawler visits</span>
            <strong>${escapeHtml(String(summary.crawlerVisits || 0))}</strong>
            <small>${escapeHtml(String(summary.crawlerBotCount || 0))} bot types recorded</small>
          </div>
        </div>
      </div>

      <div class="adm-card">
        <header class="adm-card-head">
          <h3>Important bot coverage</h3>
          <span class="adm-muted">${escapeHtml(String(summary.crawledCharacterPathCount || 0))} character pages crawled</span>
        </header>
        <div class="adm-card-body adm-table-wrap">
          <table class="adm-table adm-geo-bot-table">
            <thead><tr><th>Bot</th><th>Visits</th><th>Last seen</th><th>Last path</th></tr></thead>
            <tbody>
              ${(coverage.importantBots || []).map(renderGeoImportantBotRow).join("")}
            </tbody>
          </table>
        </div>
      </div>

      <div class="adm-card">
        <header class="adm-card-head">
          <h3>Live GEO checks</h3>
          <span class="adm-muted" id="geoCheckSummary">Not run yet</span>
        </header>
        <div class="adm-card-body adm-table-wrap">
          <table class="adm-table adm-geo-table">
            <thead><tr><th>Target</th><th>Status</th><th>Signals</th><th>Size</th><th>Open</th></tr></thead>
            <tbody id="geoCheckRows">
              ${checks.map((check) => renderGeoCheckRow(check)).join("")}
            </tbody>
          </table>
        </div>
      </div>

      <div class="adm-card">
        <header class="adm-card-head">
          <h3>IndexNow submit history</h3>
          <span class="adm-muted">${escapeHtml(String(indexNowHistory.length))} attempts</span>
        </header>
        <div class="adm-card-body adm-table-wrap">
          <table class="adm-table adm-geo-indexnow-table">
            <thead><tr><th>Time</th><th>Status</th><th>URLs</th><th>Response</th></tr></thead>
            <tbody>
              ${indexNowHistory.map(renderGeoIndexNowHistoryRow).join("") || '<tr><td colspan="4" class="adm-muted">No submit history yet.</td></tr>'}
            </tbody>
          </table>
        </div>
      </div>

      <div class="adm-card">
        <header class="adm-card-head">
          <h3>Content issues</h3>
          <span class="adm-muted">${escapeHtml(String(coverage.issueCount || 0))} profiles need attention</span>
        </header>
        <div class="adm-card-body adm-table-wrap">
          <table class="adm-table adm-geo-issue-table">
            <thead><tr><th>Character</th><th>Missing</th><th>Open</th></tr></thead>
            <tbody>
              ${(coverage.issues || []).map(renderGeoIssueRow).join("") || '<tr><td colspan="3" class="adm-muted">No obvious content issues.</td></tr>'}
            </tbody>
          </table>
        </div>
      </div>

      <div class="adm-card">
        <header class="adm-card-head">
          <h3>Recent crawler visits</h3>
          <span class="adm-muted">${escapeHtml(String((payload.crawlerStats?.recent || []).length))} recent</span>
        </header>
        <div class="adm-card-body adm-table-wrap">
          <table class="adm-table adm-geo-crawler-table">
            <thead><tr><th>Bot</th><th>Path</th><th>Time</th><th>User agent</th></tr></thead>
            <tbody>
              ${(payload.crawlerStats?.recent || []).map(renderGeoCrawlerRow).join("") || '<tr><td colspan="4" class="adm-muted">No crawler visits recorded yet.</td></tr>'}
            </tbody>
          </table>
        </div>
      </div>

      <div class="adm-card">
        <header class="adm-card-head">
          <h3>Sample character pages</h3>
          <span class="adm-muted">${escapeHtml(String(samples.length))} samples</span>
        </header>
        <div class="adm-card-body">
          <div class="adm-geo-sample-grid">
            ${samples.map(renderGeoSampleCard).join("") || '<div class="adm-empty"><i data-lucide="user-x"></i><p>No characters found.</p></div>'}
          </div>
        </div>
      </div>

      <div class="adm-card">
        <header class="adm-card-head">
          <h3>Sample topic pages</h3>
          <span class="adm-muted">${escapeHtml(String(summary.categoryCount || 0))} categories · ${escapeHtml(String(summary.tagCount || 0))} tags</span>
        </header>
        <div class="adm-card-body">
          <div class="adm-geo-topic-grid">
            ${topics.map(renderGeoTopicCard).join("") || '<div class="adm-empty"><i data-lucide="tags"></i><p>No topic pages found.</p></div>'}
          </div>
        </div>
      </div>

      <div class="adm-card">
        <header class="adm-card-head"><h3>Recommended workflow</h3></header>
        <div class="adm-card-body">
          <ul class="adm-geo-list">
            ${(payload.recommendations || []).map((item) => `<li>${escapeHtml(item)}</li>`).join("")}
          </ul>
        </div>
      </div>
    </section>
  `;
  refreshIcons();
  const run = () => runGeoChecks(checks);
  byId("geoRunChecksBtn")?.addEventListener("click", run);
  byId("geoSubmitIndexNowBtn")?.addEventListener("click", submitGeoIndexNow);
  run();
}

function renderGeoCheckRow(check = {}, result = null) {
  const stateClass = !result ? "" : result.ok ? "is-success" : "is-failed";
  const stateText = !result ? "pending" : result.ok ? `${result.status}` : result.error || `${result.status || "failed"}`;
  const signalText = result
    ? `${result.matched}/${result.total} matched${result.missing?.length ? ` - missing: ${result.missing.join(", ")}` : ""}`
    : (check.expect || []).join(", ");
  return `
    <tr data-geo-check-row="${escapeHtml(check.id || "")}">
      <td><strong>${escapeHtml(check.label || check.id || "")}</strong><span class="adm-block adm-muted adm-mono">${escapeHtml(check.path || "")}</span></td>
      <td><span class="adm-pill ${stateClass}">${escapeHtml(stateText)}</span></td>
      <td class="adm-truncate" title="${escapeHtml(signalText)}">${escapeHtml(signalText)}</td>
      <td>${escapeHtml(result ? fmtBytes(result.bytes || 0) : "-")}</td>
      <td><a class="adm-btn adm-btn-sm adm-btn-ghost" href="${escapeHtml(check.url || check.path || "#")}" target="_blank" rel="noopener"><i data-lucide="external-link"></i>Open</a></td>
    </tr>
  `;
}

function renderGeoSampleCard(item = {}) {
  const tags = (item.tags || []).slice(0, 4);
  return `
    <article class="adm-geo-sample-card">
      <img src="${escapeHtml(item.posterUrl || "")}" alt="${escapeHtml(item.name || "")}" loading="lazy" />
      <div>
        <strong>${escapeHtml(item.name || item.id || "Character")}</strong>
        <span>${escapeHtml(item.videoCount || 0)} videos</span>
        <p>${escapeHtml(shortText(item.summary || "", 120))}</p>
        ${tags.length ? `<div>${tags.map((tag) => `<small>${escapeHtml(tag)}</small>`).join("")}</div>` : ""}
        <a class="adm-btn adm-btn-sm adm-btn-ghost" href="${escapeHtml(item.url || item.path || "#")}" target="_blank" rel="noopener"><i data-lucide="external-link"></i>Open</a>
      </div>
    </article>
  `;
}

function renderGeoMetric(metric = {}) {
  const percent = Math.max(0, Math.min(100, Number(metric.percent || 0)));
  return `
    <div class="adm-geo-metric">
      <div>
        <strong>${escapeHtml(metric.label || "-")}</strong>
        <span>${escapeHtml(String(metric.count || 0))}/${escapeHtml(String(metric.total || 0))}</span>
      </div>
      <span class="adm-geo-meter"><i style="width:${percent}%"></i></span>
    </div>
  `;
}

function renderGeoImportantBotRow(item = {}) {
  return `
    <tr>
      <td><strong>${escapeHtml(item.bot || "-")}</strong></td>
      <td>${escapeHtml(String(item.count || 0))}</td>
      <td>${escapeHtml(item.lastSeen ? fmtDate(item.lastSeen) : "-")}</td>
      <td class="adm-mono adm-truncate" title="${escapeHtml(item.lastPath || "")}">${escapeHtml(item.lastPath || "-")}</td>
    </tr>
  `;
}

function renderGeoIndexNowHistoryRow(item = {}) {
  const stateClass = item.ok ? "is-success" : "is-failed";
  const stateText = item.status ? `${item.status} ${item.statusText || ""}`.trim() : (item.statusText || "failed");
  return `
    <tr>
      <td>${escapeHtml(item.at ? fmtDate(item.at) : "-")}</td>
      <td><span class="adm-pill ${stateClass}">${escapeHtml(stateText)}</span></td>
      <td>${escapeHtml(String(item.urlCount || 0))}</td>
      <td class="adm-truncate" title="${escapeHtml(item.responseText || "")}">${escapeHtml(item.responseText || "-")}</td>
    </tr>
  `;
}

function renderGeoIssueRow(item = {}) {
  return `
    <tr>
      <td><strong>${escapeHtml(item.name || item.id || "-")}</strong><span class="adm-block adm-muted adm-mono">${escapeHtml(item.path || "")}</span></td>
      <td>${(item.missing || []).map((value) => `<span class="adm-pill is-failed">${escapeHtml(value)}</span>`).join(" ")}</td>
      <td><a class="adm-btn adm-btn-sm adm-btn-ghost" href="${escapeHtml(item.path || "#")}" target="_blank" rel="noopener"><i data-lucide="external-link"></i>Open</a></td>
    </tr>
  `;
}

function renderGeoTopicCard(item = {}) {
  return `
    <article class="adm-geo-topic-card">
      <div>
        <strong>${escapeHtml(item.label || item.id || "Topic")}</strong>
        <span>${escapeHtml(item.type || "topic")} · ${escapeHtml(String(item.count || 0))} profiles</span>
      </div>
      <p>${escapeHtml(shortText(item.summary || "", 120))}</p>
      <a class="adm-btn adm-btn-sm adm-btn-ghost" href="${escapeHtml(item.url || item.path || "#")}" target="_blank" rel="noopener"><i data-lucide="external-link"></i>Open</a>
    </article>
  `;
}

function renderGeoCrawlerRow(item = {}) {
  return `
    <tr>
      <td><strong>${escapeHtml(item.bot || "-")}</strong></td>
      <td class="adm-mono">${escapeHtml(item.path || "-")}</td>
      <td>${escapeHtml(item.at ? fmtDate(item.at) : "-")}</td>
      <td class="adm-truncate" title="${escapeHtml(item.userAgent || "")}">${escapeHtml(item.userAgent || "-")}</td>
    </tr>
  `;
}

async function submitGeoIndexNow() {
  const button = byId("geoSubmitIndexNowBtn");
  const status = byId("geoIndexNowStatus");
  if (!button) return;
  const previous = button.innerHTML;
  button.disabled = true;
  button.innerHTML = '<i data-lucide="loader-2"></i>Submitting';
  if (status) status.textContent = "Submitting...";
  refreshIcons();
  try {
    const payload = await api("/api/admin/geo/indexnow", { method: "POST", body: {} });
    const result = payload.result || {};
    const message = `IndexNow ${payload.accepted ? "accepted" : "rejected"} ${result.status || ""}: ${result.urlCount || 0} URLs`;
    if (status) status.textContent = message;
    toast(message, payload.accepted ? "success" : "error");
  } catch (err) {
    if (status) status.textContent = err.message || "Submit failed";
    toast(err.message || "IndexNow submit failed", "error");
  } finally {
    button.disabled = false;
    button.innerHTML = previous;
    refreshIcons();
  }
}

async function runGeoChecks(checks = []) {
  const rows = byId("geoCheckRows");
  const summary = byId("geoCheckSummary");
  if (!rows || !summary) return;
  summary.textContent = "Running...";
  let passed = 0;
  for (const check of checks) {
    const result = await fetchGeoCheck(check);
    if (result.ok) passed += 1;
    const row = [...rows.querySelectorAll("[data-geo-check-row]")].find((item) => item.dataset.geoCheckRow === String(check.id || ""));
    if (row) row.outerHTML = renderGeoCheckRow(check, result);
    refreshIcons();
  }
  summary.textContent = `${passed}/${checks.length} passed`;
  summary.className = passed === checks.length ? "adm-muted adm-geo-pass" : "adm-muted adm-geo-fail";
}

async function fetchGeoCheck(check = {}) {
  try {
    const response = await fetch(check.path || check.url || "/", { cache: "no-store" });
    const text = await response.text();
    const expects = check.expect || [];
    const missing = expects.filter((needle) => !text.includes(String(needle)));
    return {
      ok: response.ok && missing.length === 0,
      status: response.status,
      bytes: text.length,
      matched: expects.length - missing.length,
      total: expects.length,
      missing,
    };
  } catch (err) {
    return {
      ok: false,
      status: 0,
      bytes: 0,
      matched: 0,
      total: (check.expect || []).length,
      missing: check.expect || [],
      error: err.message || "fetch failed",
    };
  }
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
