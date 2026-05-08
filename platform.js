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
  showAccessToken: false,
  showAccountToken: false,
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
  accessTokenDisplay: document.querySelector("#accessTokenDisplay"),
  accessTokenHint: document.querySelector("#accessTokenHint"),
  toggleAccessTokenBtn: document.querySelector("#toggleAccessTokenBtn"),
  copyTokenBtn: document.querySelector("#copyTokenBtn"),
  historyBtn: document.querySelector("#historyBtn"),
  historyDialog: document.querySelector("#historyDialog"),
  historyList: document.querySelector("#historyList"),
  refreshHistoryBtn: document.querySelector("#refreshHistoryBtn"),
  loginBtn: document.querySelector("#loginBtn"),
  accountDialog: document.querySelector("#accountDialog"),
  accountName: document.querySelector("#accountName"),
  accountCredits: document.querySelector("#accountCredits"),
  accountRole: document.querySelector("#accountRole"),
  accountToken: document.querySelector("#accountToken"),
  toggleAccountTokenBtn: document.querySelector("#toggleAccountTokenBtn"),
  copyAccountTokenBtn: document.querySelector("#copyAccountTokenBtn"),
  logoutAccountBtn: document.querySelector("#logoutAccountBtn"),
  loginDialog: document.querySelector("#loginDialog"),
  loginTitle: document.querySelector("#loginTitle"),
  loginUsername: document.querySelector("#loginUsername"),
  loginPassword: document.querySelector("#loginPassword"),
  toggleLoginMode: document.querySelector("#toggleLoginMode"),
  loginSubmit: document.querySelector("#loginSubmit"),
  loginMessage: document.querySelector("#loginMessage"),
};

const PUBLIC_COPY = {
  galleryTitle: "Create AI videos",
  gallerySubtitle: "Choose a template, upload an image or enter text, and create a new video.",
  galleryNotice: "Generated results are saved in your history.",
  accessTitle: "API Access",
  accessSubtitle: "Connect your product or workflow to the production generation API.",
  accessNotice: "Only the required parameters and response format are shown here.",
  accessCopy:
    "POST /api/platform/generate\nAuthorization: Bearer <user-token>\nContent-Type: application/json\n\n{\"templateId\":\"template-id\",\"prompt\":\"...\",\"dataUrl\":\"data:image/png;base64,...\"}\n\nGET /api/generation-records\nGET /api/generation-records/<taskId>",
};

let ACCESS_GUIDES = [
  {
    id: "http",
    title: "HTTP API",
    subtitle: "Available now",
    desc: "This is the live integration path. Submit a generation job, then query history or a task detail for progress and result video.",
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

const TYPE_SCRIPT_ACCESS_COPY = `const USER_TOKEN = "<user-token>";

async function createTemplateVideo({ templateId, dataUrl, prompt = "", userToken = USER_TOKEN }) {
  const response = await fetch("https://123vips.com/api/platform/generate", {
    method: "POST",
    headers: {
      "authorization": \`Bearer \${userToken}\`,
      "content-type": "application/json"
    },
    body: JSON.stringify({ templateId, dataUrl, prompt })
  });
  const payload = await response.json();
  if (!response.ok || payload.ok === false) {
    throw new Error(payload.message || "Generation failed");
  }
  return payload;
}

async function listGenerationRecords(userToken = USER_TOKEN) {
  const response = await fetch("https://123vips.com/api/generation-records", {
    headers: { "authorization": \`Bearer \${userToken}\` }
  });
  return response.json();
}`;

const PYTHON_ACCESS_COPY = `import requests

BASE_URL = "https://123vips.com"
USER_TOKEN = "<user-token>"

def create_template_video(template_id, data_url, prompt="", user_token=USER_TOKEN):
    resp = requests.post(
        f"{BASE_URL}/api/platform/generate",
        headers={
            "Authorization": f"Bearer {user_token}",
            "Content-Type": "application/json",
        },
        json={
            "templateId": template_id,
            "dataUrl": data_url,
            "prompt": prompt,
        },
        timeout=120,
    )
    resp.raise_for_status()
    return resp.json()

def list_generation_records(user_token=USER_TOKEN):
    resp = requests.get(
        f"{BASE_URL}/api/generation-records",
        headers={"Authorization": f"Bearer {user_token}"},
        timeout=60,
    )
    resp.raise_for_status()
    return resp.json()`;

const CLI_ACCESS_COPY = `curl -X POST "https://123vips.com/api/platform/generate" \\
  -H "Authorization: Bearer <user-token>" \\
  -H "Content-Type: application/json" \\
  -d '{
    "templateId": "template-id",
    "dataUrl": "data:image/png;base64,...",
    "prompt": "optional override"
  }'

curl "https://123vips.com/api/generation-records" \\
  -H "Authorization: Bearer <user-token>"`;

const AGENT_ACCESS_COPY = `Agent instruction:

Use the 123vips generation API.

When the user asks to create a video:
1. Ask for or use a configured generation templateId.
2. Convert the uploaded image to a data URL.
3. POST https://123vips.com/api/platform/generate with:
   - Authorization: Bearer <user-token>
   - JSON body: { templateId, dataUrl, prompt }
4. Return taskId and tell the user to check generation history.
5. To check progress, GET /api/generation-records or /api/generation-records/<taskId>.

Never invent upstream parameters on the client side. The generation JSON is configured in the admin console; client code only sends templateId, image data, and optional prompt override.`;

const MCP_ACCESS_COPY = `MCP wrapper approach:

There is no separate hosted MCP endpoint yet. To use MCP today, create a tiny MCP tool that wraps the live HTTP API above.

Tool: create_template_video
Input schema:
{
  "templateId": "string",
  "dataUrl": "string",
  "prompt": "string optional"
}

Handler behavior:
POST https://123vips.com/api/platform/generate
Authorization: Bearer <user-token>
Content-Type: application/json

Return:
{
  "taskId": "...",
  "status": "...",
  "record": { ... }
}

This is usable as an MCP integration once your wrapper supplies the user token.`;

PUBLIC_COPY.galleryTitle = "Create AI videos";
PUBLIC_COPY.gallerySubtitle = "Choose a template, upload an image or enter text, and create a new video.";
PUBLIC_COPY.galleryNotice = "Generated results are saved in your history.";
PUBLIC_COPY.accessTitle = "API Access";
PUBLIC_COPY.accessSubtitle = "Connect your product, scripts, agents, or MCP wrapper to the production generation API.";
PUBLIC_COPY.accessNotice = "All examples below call the current production API. Upstream JSON stays server-side.";
PUBLIC_COPY.accessCopy = LIVE_HTTP_ACCESS_COPY;

ACCESS_GUIDES = [
  {
    id: "http",
    title: "HTTP API",
    subtitle: "Direct endpoint",
    desc: "Production endpoint. Submit generation jobs and query records/results.",
    copy: LIVE_HTTP_ACCESS_COPY,
  },
  {
    id: "typescript",
    title: "TypeScript",
    subtitle: "Server code",
    desc: "A working fetch wrapper around the same production HTTP API.",
    copy: TYPE_SCRIPT_ACCESS_COPY,
  },
  {
    id: "python",
    title: "Python",
    subtitle: "Server code",
    desc: "A working requests wrapper around the same production HTTP API.",
    copy: PYTHON_ACCESS_COPY,
  },
  {
    id: "cli",
    title: "CLI",
    subtitle: "curl",
    desc: "Direct curl commands for submitting and checking generation jobs.",
    copy: CLI_ACCESS_COPY,
  },
  {
    id: "agent",
    title: "Agent Kit",
    subtitle: "Prompt rules",
    desc: "Copy these rules into an agent so it calls the production API instead of inventing upstream parameters.",
    copy: AGENT_ACCESS_COPY,
  },
  {
    id: "mcp",
    title: "MCP",
    subtitle: "HTTP wrapper",
    desc: "MCP is available through a wrapper around the current HTTP API; there is no separate hosted MCP endpoint yet.",
    copy: MCP_ACCESS_COPY,
  },
];

let activeAccessGuide = ACCESS_GUIDES[0];

function refreshIcons() {
  window.lucide?.createIcons();
}

function cleanPublicCopy(value, fallback) {
  const text = String(value || "").trim();
  if (!text || /ap[i]z|upstream|admin|上游|后台|api\s*接入/i.test(text)) return fallback;
  return text;
}

function setUser(user) {
  state.user = user || null;
  if (state.user) {
    els.loginBtn.textContent = `${state.user.username} · ${Number(state.user.credits || 0)} credits`;
  } else {
    els.loginBtn.textContent = "Login / Sign up";
  }
  renderTokenDisplays();
  renderAccessGuides();
}

function maskToken(token = "") {
  const value = String(token || "");
  if (!value) return "";
  if (value.length <= 12) return `${value.slice(0, 3)}...${value.slice(-3)}`;
  return `${value.slice(0, 8)}...${value.slice(-6)}`;
}

function currentTokenLabel(showFull = false) {
  if (!state.token || !state.user) return "Login to auto-fill your token";
  return showFull ? state.token : maskToken(state.token);
}

function hydrateAccessCopy(copy = "", { revealToken = false } = {}) {
  const token = state.token && state.user ? state.token : "<user-token>";
  const tokenLabel = state.token && state.user ? (revealToken ? token : maskToken(token)) : "<user-token>";
  return String(copy || PUBLIC_COPY.accessCopy).replaceAll("<user-token>", tokenLabel);
}

function fullAccessCopy() {
  return hydrateAccessCopy(activeAccessGuide.copy, { revealToken: true });
}

function renderTokenDisplays() {
  if (els.accessTokenDisplay) {
    els.accessTokenDisplay.textContent = currentTokenLabel(state.showAccessToken);
  }
  if (els.accessTokenHint) {
    els.accessTokenHint.textContent = state.user
      ? "Copied guides use the full token. The page masks it by default."
      : "Login first, then the examples below will use your token automatically.";
  }
  if (els.toggleAccessTokenBtn) {
    els.toggleAccessTokenBtn.textContent = state.showAccessToken ? "Hide" : "Show full";
    els.toggleAccessTokenBtn.disabled = !state.token || !state.user;
  }
  if (els.copyTokenBtn) {
    els.copyTokenBtn.disabled = !state.token || !state.user;
  }
  if (els.accountName) els.accountName.textContent = state.user?.username || "Account";
  if (els.accountCredits) els.accountCredits.textContent = String(Number(state.user?.credits || 0));
  if (els.accountRole) els.accountRole.textContent = state.user?.role || "user";
  if (els.accountToken) els.accountToken.textContent = currentTokenLabel(state.showAccountToken);
  if (els.toggleAccountTokenBtn) {
    els.toggleAccountTokenBtn.textContent = state.showAccountToken ? "Hide" : "Show full";
    els.toggleAccountTokenBtn.disabled = !state.token || !state.user;
  }
  if (els.copyAccountTokenBtn) {
    els.copyAccountTokenBtn.disabled = !state.token || !state.user;
  }
}

function generationVideoUrl(record) {
  return record?.videoUrl || record?.localVideoUrl || record?.remoteVideoUrl || "";
}

function statusLabel(status) {
  const value = String(status || "").toLowerCase();
  if (["succeeded", "success", "done", "completed"].includes(value)) return "Completed";
  if (["failed", "error", "cancelled", "canceled"].includes(value)) return "Failed";
  if (["running", "processing", "in_progress"].includes(value)) return "Processing";
  return status || "Submitted";
}

function billingLabel(billing = {}) {
  const pre = Number(billing.preDeducted || 0);
  const final = billing.final === null || billing.final === undefined ? null : Number(billing.final || 0);
  if (billing.status === "settle_pending_insufficient") return `Prepaid ${pre}, final ${final}, pending`;
  if (billing.settled && final !== null) return `Prepaid ${pre}, final ${final}`;
  return pre > 0 ? `Prepaid ${pre}` : "No charge";
}

function formatCredits(value) {
  const next = Number(value);
  if (!Number.isFinite(next)) return "";
  return Number.isInteger(next) ? String(next) : next.toFixed(4).replace(/0+$/, "").replace(/\.$/, "");
}

function formatDurationSeconds(value) {
  const next = Number(value);
  if (!Number.isFinite(next) || next <= 0) return "";
  return `${Number.isInteger(next) ? next : next.toFixed(1).replace(/0+$/, "").replace(/\.$/, "")}s`;
}

function templateCostLabel(templateId) {
  const estimate = state.estimates?.[templateId];
  if (!estimate) return "Checking cost...";
  if (estimate.available === false || estimate.credits === null || estimate.credits === undefined) return "Cost unavailable";
  const duration = formatDurationSeconds(estimate.durationSeconds);
  return `${formatCredits(estimate.credits)} credits${duration ? ` · ${duration}` : ""}`;
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
  if (!response.ok || payload.ok === false) throw new Error(payload.message || payload.detail || `Request failed: ${response.status}`);
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
  els.heroEyebrow.textContent = "Gallery";
  els.heroTitle.textContent = cleanPublicCopy(platform.heroTitle, PUBLIC_COPY.galleryTitle);
  els.heroSubtitle.textContent = cleanPublicCopy(platform.heroSubtitle, PUBLIC_COPY.gallerySubtitle);
  els.heroBadge.textContent = "Templates";
  els.heroNotice.textContent = cleanPublicCopy(platform.notice, PUBLIC_COPY.galleryNotice);
}

function setCategory(category) {
  state.category = category;
  renderCategories();
  renderTemplates();
}

function renderCategories() {
  const visibleCategories = state.categories.filter((category) => !isHiddenCategory(category));
  const chips = [{ id: "all", name: "All" }, ...visibleCategories];
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
  `).join("") : `<div class="job-note">No templates available yet.</div>`;

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
  els.accessCopy.textContent = hydrateAccessCopy(activeAccessGuide.copy || PUBLIC_COPY.accessCopy, { revealToken: state.showAccessToken });
  renderTokenDisplays();
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
  els.modalType.textContent = template.type === "image-to-video" ? "Image to Video" : "Text to Video";
  els.modalTitle.textContent = template.title;
  els.templatePrompt.value = template.prompt || "";
  els.jobNote.textContent = "The prompt is submitted exactly as entered. Leave it empty to use the saved prompt.";
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
    reader.onerror = () => reject(new Error("Failed to read image"));
    reader.readAsDataURL(file);
  });
}

async function submitTemplate() {
  if (!state.activeTemplate) return;
  if (!state.user) {
    openLogin();
    els.jobNote.textContent = "Please log in before generating.";
    return;
  }
  els.submitTemplateBtn.disabled = true;
  els.jobNote.textContent = "Submitting generation job...";
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
    els.jobNote.innerHTML = `Job submitted: <code>${escapeHtml(payload.taskId)}</code>. Check progress in history.`;
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
    els.historyList.innerHTML = '<div class="job-note">No generation records yet.</div>';
    return;
  }
  els.historyList.innerHTML = records.map((record) => {
    const videoUrl = generationVideoUrl(record);
    return `
      <article class="history-item">
        <header>
          <div>
            <strong>${escapeHtml(record.templateTitle || record.sceneEntryName || "Generation job")}</strong>
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
  els.historyList.innerHTML = '<div class="job-note">Loading generation records...</div>';
  try {
    const payload = await requestJson("/api/generation-records?limit=50");
    if (payload.user) setUser(payload.user);
    renderHistory(payload.records || []);
  } catch (error) {
    els.historyList.innerHTML = `<div class="job-note">Load failed: ${escapeHtml(error.message || String(error))}</div>`;
  }
}

function openHistory() {
  if (!state.user) return openLogin();
  els.historyDialog.showModal();
  loadHistory();
  refreshIcons();
}

function openLogin() {
  if (state.user) return openAccount();
  renderLoginMode();
  els.loginDialog.showModal();
}

function openAccount() {
  renderTokenDisplays();
  els.accountDialog?.showModal();
  refreshIcons();
}

function logout() {
  state.token = "";
  state.user = null;
  state.showAccessToken = false;
  state.showAccountToken = false;
  localStorage.removeItem(TOKEN_KEY);
  els.accountDialog?.close();
  setUser(null);
}

function renderLoginMode() {
  const isRegister = state.loginMode === "register";
  els.loginTitle.textContent = isRegister ? "Create account" : "Login";
  els.loginSubmit.textContent = isRegister ? "Create and login" : "Login";
  els.toggleLoginMode.textContent = isRegister ? "Already have an account" : "Create account";
  els.loginMessage.textContent = "";
}

async function submitLogin() {
  const username = els.loginUsername.value.trim();
  const password = els.loginPassword.value;
  if (!username || password.length < 6) {
    els.loginMessage.textContent = "Enter a username and a password with at least 6 characters.";
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
    if (state.tab === "access") renderAccessGuides();
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
  renderTokenDisplays();
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
els.loginBtn?.addEventListener("click", () => {
  if (state.user) openAccount();
  else openLogin();
});
els.toggleLoginMode?.addEventListener("click", () => {
  state.loginMode = state.loginMode === "login" ? "register" : "login";
  renderLoginMode();
});
els.loginSubmit?.addEventListener("click", submitLogin);
els.copyAccessBtn?.addEventListener("click", async () => {
  await navigator.clipboard.writeText(fullAccessCopy());
  els.copyAccessBtn.innerHTML = '<i data-lucide="check"></i>Copied';
  refreshIcons();
  setTimeout(() => {
    els.copyAccessBtn.innerHTML = '<i data-lucide="clipboard"></i>Copy API guide';
    refreshIcons();
  }, 1600);
});
els.toggleAccessTokenBtn?.addEventListener("click", () => {
  state.showAccessToken = !state.showAccessToken;
  renderAccessGuides();
});
els.copyTokenBtn?.addEventListener("click", async () => {
  if (!state.token || !state.user) return openLogin();
  await navigator.clipboard.writeText(state.token);
  els.copyTokenBtn.innerHTML = '<i data-lucide="check"></i>Copied token';
  refreshIcons();
  setTimeout(() => {
    els.copyTokenBtn.innerHTML = '<i data-lucide="key-round"></i>Copy token';
    refreshIcons();
  }, 1600);
});
els.toggleAccountTokenBtn?.addEventListener("click", () => {
  state.showAccountToken = !state.showAccountToken;
  renderTokenDisplays();
});
els.copyAccountTokenBtn?.addEventListener("click", async () => {
  if (!state.token || !state.user) return openLogin();
  await navigator.clipboard.writeText(state.token);
  els.copyAccountTokenBtn.innerHTML = '<i data-lucide="check"></i>Copied';
  refreshIcons();
  setTimeout(() => {
    els.copyAccountTokenBtn.innerHTML = '<i data-lucide="copy"></i>Copy token';
    refreshIcons();
  }, 1600);
});
els.logoutAccountBtn?.addEventListener("click", logout);

bootstrap().catch((error) => {
  document.body.insertAdjacentHTML("beforeend", `<div class="job-note" style="position:fixed;left:20px;bottom:20px;background:#11182b;padding:14px 16px;border-radius:14px;">${escapeHtml(error.message)}</div>`);
});
