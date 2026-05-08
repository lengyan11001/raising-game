"use strict";

const TOKEN_KEY = "raisingGameToken";

const state = {
  config: null,
  templates: [],
  categories: [],
  estimates: {},
  tab: "gallery",
  category: "all",
  activeTemplate: null,
  uploadDataUrl: "",
  token: localStorage.getItem(TOKEN_KEY) || "",
  user: null,
  loginMode: "login",
};

const els = {
  brandName: document.querySelector("#brandName"),
  heroTitle: document.querySelector("#heroTitle"),
  heroEyebrow: document.querySelector("#heroEyebrow"),
  heroSubtitle: document.querySelector("#heroSubtitle"),
  heroBadge: document.querySelector("#heroBadge"),
  heroNotice: document.querySelector("#heroNotice"),
  categoryRow: document.querySelector("#categoryRow"),
  templateGrid: document.querySelector("#templateGrid"),
  templateDialog: document.querySelector("#templateDialog"),
  modalType: document.querySelector("#modalType"),
  modalTitle: document.querySelector("#modalTitle"),
  templateImage: document.querySelector("#templateImage"),
  uploadBox: document.querySelector("#uploadBox"),
  uploadPreview: document.querySelector("#uploadPreview"),
  templatePrompt: document.querySelector("#templatePrompt"),
  submitTemplateBtn: document.querySelector("#submitTemplateBtn"),
  jobNote: document.querySelector("#jobNote"),
  accessTabs: document.querySelector("#accessTabs"),
  accessGuideTitle: document.querySelector("#accessGuideTitle"),
  accessGuideDesc: document.querySelector("#accessGuideDesc"),
  accessCopy: document.querySelector("#accessCopy"),
  copyAccessBtn: document.querySelector("#copyAccessBtn"),
  historyBtn: document.querySelector("#historyBtn"),
  historyDialog: document.querySelector("#historyDialog"),
  historyList: document.querySelector("#historyList"),
  refreshHistoryBtn: document.querySelector("#refreshHistoryBtn"),
  loginBtn: document.querySelector("#loginBtn"),
  loginDialog: document.querySelector("#loginDialog"),
  loginTitle: document.querySelector("#loginTitle"),
  loginUsername: document.querySelector("#loginUsername"),
  loginPassword: document.querySelector("#loginPassword"),
  toggleLoginMode: document.querySelector("#toggleLoginMode"),
  loginSubmit: document.querySelector("#loginSubmit"),
  loginMessage: document.querySelector("#loginMessage"),
};

const PUBLIC_COPY = {
  galleryTitle: "一键生成同款视频",
  gallerySubtitle: "选择模板，上传图片或输入文字，生成图生视频 / 文生视频。",
  galleryNotice: "上传素材后即可生成，结果会保存到生成记录。",
  accessTitle: "业务接入",
  accessSubtitle: "复制接入说明，把生成能力接到你的产品或工作流。",
  accessNotice: "接入说明只放必要参数和返回结果，不混入模板广场的用户流程。",
  accessCopy:
    "POST /api/platform/generate\nAuthorization: Bearer <user-token>\nContent-Type: application/json\n\n{\"templateId\":\"template-id\",\"prompt\":\"...\",\"dataUrl\":\"data:image/png;base64,...\"}\n\nGET /api/generation-records\nGET /api/generation-records/<taskId>",
};

let ACCESS_GUIDES = [
  {
    id: "http",
    title: "HTTP API",
    subtitle: "Available now",
    desc: "This is the live integration path. Submit a template generation task, then query history or a task detail for progress and result video.",
    copy:
      "POST /api/platform/generate\nAuthorization: Bearer <user-token>\nContent-Type: application/json\n\n{\"templateId\":\"template-id\",\"prompt\":\"...\",\"dataUrl\":\"data:image/png;base64,...\"}\n\nGET /api/generation-records\nGET /api/generation-records/<taskId>",
  },
];

const LIVE_HTTP_ACCESS_COPY = `POST https://123vips.com/api/platform/generate
Authorization: Bearer <user-token>
Content-Type: application/json

{
  "templateId": "template-id",
  "dataUrl": "data:image/png;base64,...",
  "prompt": "optional override"
}

Response:
{
  "ok": true,
  "taskId": "...",
  "record": { "status": "submitted", "billing": { "preDeducted": 485 } },
  "user": { "credits": 12345 }
}

GET https://123vips.com/api/generation-records
GET https://123vips.com/api/generation-records/<taskId>`;

PUBLIC_COPY.galleryTitle = "Create videos from templates";
PUBLIC_COPY.gallerySubtitle = "Choose a template, upload an image or enter text, and generate the same style.";
PUBLIC_COPY.galleryNotice = "Generated results are saved in your history.";
PUBLIC_COPY.accessTitle = "API Access";
PUBLIC_COPY.accessSubtitle = "Use the same template generation flow from your own service through our HTTP API.";
PUBLIC_COPY.accessNotice = "Currently available: HTTP API.";
PUBLIC_COPY.accessCopy = LIVE_HTTP_ACCESS_COPY;

ACCESS_GUIDES = [{
  id: "http",
  title: "HTTP API",
  subtitle: "Available now",
  desc: "This is the live integration path. Submit a template generation task, then query history or a task detail for progress and result video.",
  copy: LIVE_HTTP_ACCESS_COPY,
}];

let activeAccessGuide = ACCESS_GUIDES[0];

function refreshIcons() {
  window.lucide?.createIcons();
}

function cleanPublicCopy(value, fallback) {
  const text = String(value || "").trim();
  if (!text || /ap[i]z|上游|后台|api\s*接入/i.test(text)) return fallback;
  return text;
}

function setUser(user) {
  state.user = user || null;
  if (state.user) {
    els.loginBtn.textContent = `${state.user.username} · ${Number(state.user.credits || 0)}积分`;
  } else {
    els.loginBtn.textContent = "登录 / 注册";
  }
}

function generationVideoUrl(record) {
  return record?.videoUrl || record?.localVideoUrl || record?.remoteVideoUrl || "";
}

function statusLabel(status) {
  const value = String(status || "").toLowerCase();
  if (["succeeded", "success", "done", "completed"].includes(value)) return "已完成";
  if (["failed", "error", "cancelled", "canceled"].includes(value)) return "失败";
  if (["running", "processing", "in_progress"].includes(value)) return "生成中";
  return status || "已提交";
}

function billingLabel(billing = {}) {
  const pre = Number(billing.preDeducted || 0);
  const final = billing.final === null || billing.final === undefined ? null : Number(billing.final || 0);
  if (billing.status === "settle_pending_insufficient") return `预扣 ${pre}，实际 ${final}，待补扣`;
  if (billing.settled && final !== null) return `预扣 ${pre}，实际 ${final}`;
  return pre > 0 ? `预扣 ${pre}` : "未扣费";
}

function formatCredits(value) {
  const next = Number(value);
  if (!Number.isFinite(next)) return "";
  return Number.isInteger(next) ? String(next) : next.toFixed(4).replace(/0+$/, "").replace(/\.$/, "");
}

function templateCostLabel(templateId) {
  const estimate = state.estimates?.[templateId];
  if (!estimate) return "Checking cost...";
  if (estimate.available === false || estimate.credits === null || estimate.credits === undefined) return "Cost unavailable";
  return `${formatCredits(estimate.credits)} credits`;
}

function templateGenerateLabel(templateId) {
  return `Generate · ${templateCostLabel(templateId)}`;
}

function updateSubmitButtonCost() {
  if (!els.submitTemplateBtn) return;
  const templateId = state.activeTemplate?.id || "";
  els.submitTemplateBtn.innerHTML = `<i data-lucide="wand-sparkles"></i>${escapeHtml(templateGenerateLabel(templateId))}`;
  refreshIcons();
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

async function requestJson(url, options = {}) {
  const headers = { "content-type": "application/json", ...(options.headers || {}) };
  if (state.token) headers.authorization = `Bearer ${state.token}`;
  const response = await fetch(url, {
    method: options.method || "GET",
    headers,
    body: options.body === undefined ? undefined : typeof options.body === "string" ? options.body : JSON.stringify(options.body),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.ok === false) throw new Error(payload.message || payload.detail || `请求失败：${response.status}`);
  return payload;
}

function setTab(tab) {
  state.tab = tab;
  document.querySelectorAll("[data-panel]").forEach((panel) => {
    panel.hidden = panel.dataset.panel !== tab;
  });
  document.querySelectorAll("[data-tab]").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.tab === tab);
  });
  renderHero();
}

function renderHero() {
  if (state.tab === "access") {
    els.heroEyebrow.textContent = "Integration";
    els.heroTitle.textContent = PUBLIC_COPY.accessTitle;
    els.heroSubtitle.textContent = PUBLIC_COPY.accessSubtitle;
    els.heroBadge.textContent = "HTTP API";
    els.heroNotice.textContent = PUBLIC_COPY.accessNotice;
    return;
  }
  const platform = state.config?.platform || {};
  els.heroEyebrow.textContent = "Template Plaza";
  els.heroTitle.textContent = cleanPublicCopy(platform.heroTitle, PUBLIC_COPY.galleryTitle);
  els.heroSubtitle.textContent = cleanPublicCopy(platform.heroSubtitle, PUBLIC_COPY.gallerySubtitle);
  els.heroBadge.textContent = "Template Plaza";
  els.heroNotice.textContent = cleanPublicCopy(platform.notice, PUBLIC_COPY.galleryNotice);
}

function setCategory(category) {
  state.category = category;
  renderCategories();
  renderTemplates();
}

function renderCategories() {
  const visibleCategories = state.categories.filter((category) => !isHiddenCategory(category));
  const chips = [{ id: "all", name: "全部" }, ...visibleCategories];
  els.categoryRow.innerHTML = chips.map((category) => `
    <button class="category-chip ${state.category === category.id ? "is-active" : ""}" data-category="${escapeHtml(category.id)}" type="button">
      ${escapeHtml(category.name)}
    </button>
  `).join("");
  els.categoryRow.querySelectorAll("[data-category]").forEach((button) => {
    button.addEventListener("click", () => setCategory(button.dataset.category));
  });
}

function renderTemplates() {
  const list = state.templates.filter((template) => {
    if (isHiddenCategory({ id: template.category, name: template.category })) return false;
    if (state.category !== "all" && template.category !== state.category) return false;
    return true;
  });

  els.templateGrid.innerHTML = list.length ? list.map((template) => `
    <article class="template-card">
      ${template.previewUrl
        ? `<video class="template-cover" src="${escapeHtml(template.previewUrl)}" poster="${escapeHtml(template.coverUrl || "")}" muted loop playsinline preload="metadata"></video>`
        : `<img class="template-cover" src="${escapeHtml(template.coverUrl || "/assets/admin/home/default-hero.jpg")}" alt="${escapeHtml(template.title)}" loading="lazy" />`}
      <div class="template-meta">
        <span>${escapeHtml(template.badge || (template.type === "image-to-video" ? "Image to Video" : "Text to Video"))}</span>
        <strong>${escapeHtml(template.title)}</strong>
        <p>${escapeHtml(template.prompt || "").slice(0, 72)}${String(template.prompt || "").length > 72 ? "..." : ""}</p>
        <button class="use-template" data-template-id="${escapeHtml(template.id)}" type="button">${escapeHtml(templateGenerateLabel(template.id))}</button>
      </div>
    </article>
  `).join("") : `<div class="job-note">暂无可用模板，请稍后再试。</div>`;

  els.templateGrid.querySelectorAll("[data-template-id]").forEach((button) => {
    button.addEventListener("click", () => openTemplate(button.dataset.templateId));
  });
  els.templateGrid.querySelectorAll("video.template-cover").forEach((video) => {
    video.play().catch(() => {});
  });
}

function isHiddenCategory(category) {
  const value = `${category?.id || ""} ${category?.name || ""}`.toLowerCase();
  return value.includes("business") || value.includes("商业接入");
}

function renderAccessGuides() {
  els.accessTabs.innerHTML = ACCESS_GUIDES.map((guide) => `
    <button class="access-tab ${activeAccessGuide.id === guide.id ? "is-active" : ""}" data-access-guide="${escapeHtml(guide.id)}" type="button">
      <strong>${escapeHtml(guide.title)}</strong>
      <span>${escapeHtml(guide.subtitle)}</span>
    </button>
  `).join("");
  els.accessGuideTitle.textContent = activeAccessGuide.title;
  els.accessGuideDesc.textContent = activeAccessGuide.desc;
  els.accessCopy.textContent = cleanPublicCopy(activeAccessGuide.copy, PUBLIC_COPY.accessCopy);
  els.accessTabs.querySelectorAll("[data-access-guide]").forEach((button) => {
    button.addEventListener("click", () => {
      activeAccessGuide = ACCESS_GUIDES.find((guide) => guide.id === button.dataset.accessGuide) || ACCESS_GUIDES[0];
      renderAccessGuides();
      refreshIcons();
    });
  });
}

function openTemplate(templateId) {
  const template = state.templates.find((item) => item.id === templateId);
  if (!template) return;
  state.activeTemplate = template;
  state.uploadDataUrl = "";
  els.modalType.textContent = template.type === "image-to-video" ? "图生视频" : "文生视频";
  els.modalTitle.textContent = template.title;
  els.templatePrompt.value = template.prompt || "";
  els.jobNote.textContent = "用户输入的 prompt 会原样提交；不填则使用模板 prompt。";
  els.uploadBox.hidden = template.type !== "image-to-video";
  els.uploadBox.classList.remove("has-image");
  els.uploadPreview.removeAttribute("src");
  els.templateImage.value = "";
  updateSubmitButtonCost();
  els.templateDialog.showModal();
  refreshIcons();
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("图片读取失败"));
    reader.readAsDataURL(file);
  });
}

async function submitTemplate() {
  if (!state.activeTemplate) return;
  if (!state.user) {
    openLogin();
    els.jobNote.textContent = "请先登录后再生成。";
    return;
  }
  els.submitTemplateBtn.disabled = true;
  els.jobNote.textContent = "正在提交生成任务...";
  try {
    const payload = await requestJson("/api/platform/generate", {
      method: "POST",
      body: {
        templateId: state.activeTemplate.id,
        prompt: els.templatePrompt.value,
        dataUrl: state.uploadDataUrl,
      },
    });
    if (payload.user) setUser(payload.user);
    els.jobNote.innerHTML = `任务已提交：<code>${escapeHtml(payload.taskId)}</code>。可在生成记录里查看进度。`;
    loadHistory();
  } catch (error) {
    els.jobNote.textContent = error.message;
  } finally {
    els.submitTemplateBtn.disabled = false;
    updateSubmitButtonCost();
  }
}

function renderHistory(records = []) {
  if (!els.historyList) return;
  if (!records.length) {
    els.historyList.innerHTML = '<div class="job-note">暂无生成记录。</div>';
    return;
  }
  els.historyList.innerHTML = records.map((record) => {
    const videoUrl = generationVideoUrl(record);
    return `
      <article class="history-item">
        <header>
          <div>
            <strong>${escapeHtml(record.templateTitle || record.sceneEntryName || "生成任务")}</strong>
            <small>${escapeHtml(record.taskId || "")}</small>
          </div>
          <small>${escapeHtml(statusLabel(record.status))}</small>
        </header>
        ${videoUrl ? `<video src="${escapeHtml(videoUrl)}" controls playsinline></video>` : ""}
        <div class="history-meta">
          <span>${escapeHtml(record.kind || "")}</span>
          <span>${escapeHtml(billingLabel(record.billing || {}))}</span>
          <span>${escapeHtml(record.createdAt ? new Date(record.createdAt).toLocaleString() : "")}</span>
        </div>
        <p class="history-prompt">${escapeHtml(record.finalPrompt || record.prompt || "")}</p>
      </article>
    `;
  }).join("");
}

async function loadHistory() {
  if (!state.user || !els.historyList) return;
  els.historyList.innerHTML = '<div class="job-note">正在加载生成记录...</div>';
  try {
    const payload = await requestJson("/api/generation-records?limit=50");
    if (payload.user) setUser(payload.user);
    renderHistory(payload.records || []);
  } catch (error) {
    els.historyList.innerHTML = `<div class="job-note">加载失败：${escapeHtml(error.message || String(error))}</div>`;
  }
}

function openHistory() {
  if (!state.user) return openLogin();
  els.historyDialog.showModal();
  loadHistory();
  refreshIcons();
}

function openLogin() {
  renderLoginMode();
  els.loginDialog.showModal();
}

function renderLoginMode() {
  const isRegister = state.loginMode === "register";
  els.loginTitle.textContent = isRegister ? "注册" : "登录";
  els.loginSubmit.textContent = isRegister ? "注册并登录" : "登录";
  els.toggleLoginMode.textContent = isRegister ? "已有账号，去登录" : "注册账号";
  els.loginMessage.textContent = "";
}

async function submitLogin() {
  const username = els.loginUsername.value.trim();
  const password = els.loginPassword.value;
  if (!username || password.length < 6) {
    els.loginMessage.textContent = "请输入用户名和至少 6 位密码。";
    return;
  }
  const endpoint = state.loginMode === "register" ? "/api/auth/register" : "/api/auth/login";
  try {
    const payload = await requestJson(endpoint, {
      method: "POST",
      body: { username, password },
    });
    state.token = payload.token;
    setUser(payload.user);
    localStorage.setItem(TOKEN_KEY, payload.token);
    els.loginDialog.close();
  } catch (error) {
    els.loginMessage.textContent = error.message;
  }
}

async function loadMe() {
  if (!state.token) return;
  try {
    const payload = await requestJson("/api/auth/me");
    setUser(payload.user);
  } catch {
    state.token = "";
    localStorage.removeItem(TOKEN_KEY);
    setUser(null);
  }
}

async function loadPlatformEstimates() {
  if (!state.templates.length) return;
  try {
    const payload = await requestJson("/api/platform/estimates");
    state.estimates = {};
    (payload.estimates || []).forEach((estimate) => {
      if (estimate?.templateId) state.estimates[estimate.templateId] = estimate;
    });
  } catch (error) {
    state.estimates = Object.fromEntries(state.templates.map((template) => [
      template.id,
      { templateId: template.id, available: false, credits: null, message: error.message },
    ]));
  }
  renderTemplates();
  updateSubmitButtonCost();
}

async function bootstrap() {
  await loadMe();
  const payload = await requestJson("/api/config/public");
  const platform = payload.config?.platform || {};
  state.config = payload.config;
  state.templates = platform.templates || [];
  state.categories = platform.categories || [];
  els.brandName.textContent = platform.brand || "Vipeak AI";
  renderHero();
  renderCategories();
  renderTemplates();
  renderAccessGuides();
  refreshIcons();
  loadPlatformEstimates();
}

document.querySelectorAll("[data-tab]").forEach((button) => {
  button.addEventListener("click", () => setTab(button.dataset.tab));
});
els.templateImage?.addEventListener("change", async () => {
  const file = els.templateImage.files?.[0];
  if (!file) return;
  state.uploadDataUrl = await readFileAsDataUrl(file);
  els.uploadPreview.src = state.uploadDataUrl;
  els.uploadBox.classList.add("has-image");
});
els.submitTemplateBtn?.addEventListener("click", submitTemplate);
els.historyBtn?.addEventListener("click", openHistory);
els.refreshHistoryBtn?.addEventListener("click", loadHistory);
els.loginBtn?.addEventListener("click", openLogin);
els.toggleLoginMode?.addEventListener("click", () => {
  state.loginMode = state.loginMode === "login" ? "register" : "login";
  renderLoginMode();
});
els.loginSubmit?.addEventListener("click", submitLogin);
els.copyAccessBtn?.addEventListener("click", async () => {
  await navigator.clipboard.writeText(els.accessCopy.textContent || "");
  els.copyAccessBtn.innerHTML = '<i data-lucide="check"></i>Copied';
  refreshIcons();
  setTimeout(() => {
    els.copyAccessBtn.innerHTML = '<i data-lucide="clipboard"></i>Copy API guide';
    refreshIcons();
  }, 1600);
});

bootstrap().catch((error) => {
  document.body.insertAdjacentHTML("beforeend", `<div class="job-note" style="position:fixed;left:20px;bottom:20px;background:#11182b;padding:14px 16px;border-radius:14px;">${escapeHtml(error.message)}</div>`);
});
