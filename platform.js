"use strict";

const TOKEN_KEY = "raisingGameToken";
const ADVANCED_SEEDANCE_CREDITS_PER_SECOND = 150;
const ADVANCED_WAN27_720P_CREDITS_PER_SECOND = 100;
const ADVANCED_WAN27_1080P_CREDITS_PER_SECOND = 150;
const ADVANCED_GENERATION_CREDITS_PER_SECOND = ADVANCED_SEEDANCE_CREDITS_PER_SECOND;

const state = {
  config: null,
  templates: [],
  categories: [],
  estimates: {},
  tab: "gallery",
  category: "all",
  advancedCases: [],
  activeAdvancedCaseId: "",
  activeTemplate: null,
  uploadDataUrl: "",
  advancedUploadDataUrl: "",
  wallet: null,
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
  historyList: document.querySelector("#historyList"),
  refreshHistoryBtn: document.querySelector("#refreshHistoryBtn"),
  topupPanel: document.querySelector("#topupPanel"),
  topupAmount: document.querySelector("#topupAmount"),
  topupCredits: document.querySelector("#topupCredits"),
  topupRate: document.querySelector("#topupRate"),
  createTopupBtn: document.querySelector("#createTopupBtn"),
  topupOrder: document.querySelector("#topupOrder"),
  previewDialog: document.querySelector("#previewDialog"),
  previewTitle: document.querySelector("#previewTitle"),
  previewVideo: document.querySelector("#previewVideo"),
  advancedGate: document.querySelector("#advancedGate"),
  advancedWorkspace: document.querySelector("#advancedWorkspace"),
  advancedPrompt: document.querySelector("#advancedPrompt"),
  advancedImage: document.querySelector("#advancedImage"),
  advancedUploadBox: document.querySelector("#advancedUploadBox"),
  advancedUploadPreview: document.querySelector("#advancedUploadPreview"),
  advancedProvider: document.querySelector("#advancedProvider"),
  advancedRatio: document.querySelector("#advancedRatio"),
  advancedResolution: document.querySelector("#advancedResolution"),
  advancedDuration: document.querySelector("#advancedDuration"),
  advancedPreprocessReference: document.querySelector("#advancedPreprocessReference"),
  advancedWanSeed: document.querySelector("#advancedWanSeed"),
  advancedSubmitBtn: document.querySelector("#advancedSubmitBtn"),
  advancedNote: document.querySelector("#advancedNote"),
  advancedCaseGrid: document.querySelector("#advancedCaseGrid"),
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
  advancedTitle: "Advanced Generate",
  advancedSubtitle: "Direct Seedance controls for approved accounts.",
  advancedNotice: "Approval is required before direct generation is enabled.",
  historyTitle: "Generation History",
  historySubtitle: "Review your generated videos, prompts, parameters and billing in one compact list.",
  historyNotice: "Only your own generation records are shown.",
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

Gallery template:
{
  "templateId": "template-id",
  "dataUrl": "data:image/png;base64,...",
  "prompt": ""
}

Advanced Seedance:
POST https://123vips.com/api/advanced/generate
{
  "provider": "seedance",
  "prompt": "your prompt",
  "dataUrl": "data:image/png;base64,...",
  "resolution": "720p",
  "duration": 5,
  "preprocessReference": true
}

Advanced Wan2.7:
POST https://123vips.com/api/advanced/generate
{
  "provider": "wan27",
  "prompt": "your prompt",
  "dataUrl": "data:image/png;base64,...",
  "resolution": "1080p",
  "duration": 5
}`;

const TYPE_SCRIPT_ACCESS_COPY = `const token = "<user-token>";
const galleryBody = {
  templateId: "template-id",
  dataUrl: "data:image/png;base64,...",
  prompt: ""
};

const advancedBody = {
  provider: "wan27", // "seedance" or "wan27"
  prompt: "your prompt",
  dataUrl: "data:image/png;base64,...",
  resolution: "720p",
  duration: 5,
  preprocessReference: true
};

const res = await fetch("https://123vips.com/api/advanced/generate", {
  method: "POST",
  headers: {
    authorization: \`Bearer \${token}\`,
    "content-type": "application/json"
  },
  body: JSON.stringify(advancedBody)
});
console.log(await res.json());`;

const PYTHON_ACCESS_COPY = `import requests

token = "<user-token>"
gallery_payload = {
    "templateId": "template-id",
    "dataUrl": "data:image/png;base64,...",
    "prompt": "",
}

advanced_payload = {
    "provider": "seedance",  # or "wan27"
    "prompt": "your prompt",
    "dataUrl": "data:image/png;base64,...",
    "resolution": "720p",
    "duration": 5,
    "preprocessReference": True,
}

resp = requests.post(
    "https://123vips.com/api/advanced/generate",
    headers={"Authorization": f"Bearer {token}"},
    json=advanced_payload,
    timeout=120,
)
print(resp.json())`;

const CLI_ACCESS_COPY = `curl -X POST "https://123vips.com/api/platform/generate" \\
  -H "Authorization: Bearer <user-token>" \\
  -H "Content-Type: application/json" \\
  -d '{"templateId":"template-id","dataUrl":"data:image/png;base64,...","prompt":""}'

curl -X POST "https://123vips.com/api/advanced/generate" \\
  -H "Authorization: Bearer <user-token>" \\
  -H "Content-Type: application/json" \\
  -d '{"provider":"wan27","prompt":"your prompt","dataUrl":"data:image/png;base64,...","resolution":"1080p","duration":5}'`;

const AGENT_ACCESS_COPY = `Use this video API:
Gallery templates:
POST https://123vips.com/api/platform/generate
Authorization: Bearer <user-token>
Body:
{"templateId":"template-id","dataUrl":"data:image/png;base64,...","prompt":""}

Advanced direct generation:
POST https://123vips.com/api/advanced/generate
Body:
{"provider":"seedance","prompt":"your prompt","dataUrl":"data:image/png;base64,...","resolution":"720p","duration":5,"preprocessReference":true}
or:
{"provider":"wan27","prompt":"your prompt","dataUrl":"data:image/png;base64,...","resolution":"1080p","duration":5}

Check records:
GET https://123vips.com/api/generation-records`;

const MCP_ACCESS_COPY = `MCP wrapper target:
POST https://123vips.com/api/platform/generate
Authorization: Bearer <user-token>
Input:
{"templateId":"string","dataUrl":"string","prompt":"string"}

Advanced MCP wrapper target:
POST https://123vips.com/api/advanced/generate
Authorization: Bearer <user-token>
Input:
{"provider":"seedance|wan27","prompt":"string","dataUrl":"data:image/png;base64,...","resolution":"720p|1080p","duration":5,"preprocessReference":true,"seed":123456 optional}`;

PUBLIC_COPY.galleryTitle = "Create AI videos";
PUBLIC_COPY.gallerySubtitle = "Choose a template, upload an image or enter text, and create a new video.";
PUBLIC_COPY.galleryNotice = "Generated results are saved in your history.";
PUBLIC_COPY.accessTitle = "API Access";
PUBLIC_COPY.accessSubtitle = "Connect your product, scripts, agents, or MCP wrapper to the production generation API.";
PUBLIC_COPY.accessNotice = "All examples below call the current production API. Upstream JSON stays server-side.";
PUBLIC_COPY.accessCopy = LIVE_HTTP_ACCESS_COPY;
PUBLIC_COPY.advancedTitle = "Advanced Generate";
PUBLIC_COPY.advancedSubtitle = "Direct model controls for approved accounts.";
PUBLIC_COPY.advancedNotice = "Apply once. After approval, cases can fill the form automatically.";
PUBLIC_COPY.historyTitle = "Generation History";
PUBLIC_COPY.historySubtitle = "Review your generated videos, prompts, parameters and billing in one compact list.";
PUBLIC_COPY.historyNotice = "Only your own generation records are shown.";

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
let historyLoading = false;

function refreshIcons() {
  window.lucide?.createIcons();
}

function cleanPublicCopy(value, fallback) {
  const text = String(value || "").trim();
  if (!text || /ap[i]z|upstream|admin|上游|后台|api\s*接入/i.test(text)) return fallback;
  return text;
}

function setUser(user, { refreshHistory = false } = {}) {
  state.user = user || null;
  if (state.user) {
    els.loginBtn.textContent = `${state.user.username} · ${Number(state.user.credits || 0)} credits`;
  } else {
    els.loginBtn.textContent = "Login / Sign up";
  }
  renderTokenDisplays();
  renderTopupSummary();
  renderAccessGuides();
  renderAdvanced();
  if (refreshHistory && state.tab === "history") loadHistory();
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
      ? "Copied snippets use the full token. The page masks it by default."
      : "Login first, then snippets below will use your token automatically.";
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
  return `Generate - ${templateCostLabel(templateId)}`;
}

function updateSubmitButtonCost() {
  if (!els.submitTemplateBtn) return;
  const templateId = state.activeTemplate?.id || "";
  els.submitTemplateBtn.innerHTML = `<i data-lucide="wand-sparkles"></i>${escapeHtml(templateGenerateLabel(templateId))}`;
  refreshIcons();
}

function advancedCaseDuration(item = {}) {
  const params = item.params && typeof item.params === "object" ? item.params : {};
  const duration = Number(params.duration ?? item.duration ?? 5);
  if (!Number.isFinite(duration)) return 5;
  return Math.min(15, Math.max(5, duration));
}

function normalizeAdvancedProvider(value = "") {
  const normalized = String(value || "").trim().toLowerCase().replace(/[\s_-]+/g, "");
  return normalized === "wan27" || normalized === "wan2.7" || normalized === "wan" ? "wan27" : "seedance";
}

function advancedCaseProvider(item = {}) {
  const params = item.params && typeof item.params === "object" ? item.params : {};
  return normalizeAdvancedProvider(item.provider || params.provider || params.modelProvider || params.model_provider || "seedance");
}

function normalizeAdvancedResolution(value = "", provider = "seedance") {
  const raw = String(value || "").trim().toLowerCase();
  if (normalizeAdvancedProvider(provider) === "wan27") return raw === "1080p" ? "1080p" : "720p";
  return raw || "720p";
}

function advancedDurationBounds(provider = "seedance") {
  return normalizeAdvancedProvider(provider) === "wan27"
    ? { min: 2, max: 15, fallback: 5 }
    : { min: 5, max: 15, fallback: 5 };
}

function advancedPricing(duration, provider = "seedance", resolution = "720p") {
  const normalizedProvider = normalizeAdvancedProvider(provider);
  const bounds = advancedDurationBounds(normalizedProvider);
  const rawSeconds = Number(duration || bounds.fallback);
  const seconds = Number.isFinite(rawSeconds) ? Math.min(bounds.max, Math.max(bounds.min, rawSeconds)) : bounds.fallback;
  const configPricing = state.config?.platform?.advancedPricing || {};
  if (normalizedProvider === "wan27") {
    const normalizedResolution = normalizeAdvancedResolution(resolution, normalizedProvider);
    const byResolution = configPricing.wan27CreditsPerSecondByResolution || {};
    const fallbackPerSecond = normalizedResolution === "1080p" ? ADVANCED_WAN27_1080P_CREDITS_PER_SECOND : ADVANCED_WAN27_720P_CREDITS_PER_SECOND;
    const perSecond = Number(byResolution[normalizedResolution] || fallbackPerSecond) || fallbackPerSecond;
    return {
      provider: "wan27",
      duration: seconds,
      resolution: normalizedResolution,
      credits: Math.max(0, Math.round(seconds * perSecond)),
    };
  }
  const seedancePerSecond = Number(configPricing.seedanceCreditsPerSecond || ADVANCED_SEEDANCE_CREDITS_PER_SECOND) || ADVANCED_SEEDANCE_CREDITS_PER_SECOND;
  return {
    provider: "seedance",
    duration: seconds,
    resolution: normalizeAdvancedResolution(resolution, normalizedProvider),
    credits: Math.max(0, Math.round(seconds * seedancePerSecond)),
  };
}

function advancedCostForDuration(duration, provider = "seedance", resolution = "720p") {
  return advancedPricing(duration, provider, resolution).credits;
}

function currentAdvancedProvider() {
  return normalizeAdvancedProvider(els.advancedProvider?.value || "seedance");
}

function currentAdvancedResolution() {
  return normalizeAdvancedResolution(els.advancedResolution?.value || "720p", currentAdvancedProvider());
}

function advancedCostLabel(duration, provider = "seedance", resolution = "720p") {
  const pricing = advancedPricing(duration, provider, resolution);
  const suffix = pricing.provider === "wan27" ? ` - ${pricing.resolution}` : "";
  return `${formatCredits(pricing.credits)} credits - ${formatDurationSeconds(pricing.duration)}${suffix}`;
}

function updateAdvancedButtonCost() {
  if (!els.advancedSubmitBtn) return;
  const rawDuration = Number(els.advancedDuration?.value || 5);
  const bounds = advancedDurationBounds(currentAdvancedProvider());
  const duration = Number.isFinite(rawDuration) ? Math.min(bounds.max, Math.max(bounds.min, rawDuration)) : bounds.fallback;
  els.advancedSubmitBtn.innerHTML = `<i data-lucide="sparkles"></i>Generate - ${escapeHtml(advancedCostLabel(duration, currentAdvancedProvider(), currentAdvancedResolution()))}`;
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
  if (tab === "history") loadHistory();
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
  if (state.tab === "advanced") {
    els.heroEyebrow.textContent = "Advanced";
    els.heroTitle.textContent = PUBLIC_COPY.advancedTitle;
    els.heroSubtitle.textContent = PUBLIC_COPY.advancedSubtitle;
    els.heroBadge.textContent = "Permission";
    els.heroNotice.textContent = PUBLIC_COPY.advancedNotice;
    return;
  }
  if (state.tab === "history") {
    els.heroEyebrow.textContent = "History";
    els.heroTitle.textContent = PUBLIC_COPY.historyTitle;
    els.heroSubtitle.textContent = PUBLIC_COPY.historySubtitle;
    els.heroBadge.textContent = "Records";
    els.heroNotice.textContent = PUBLIC_COPY.historyNotice;
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
      <img class="template-cover" src="${escapeHtml(template.coverUrl || "/assets/admin/home/default-hero.jpg")}" alt="${escapeHtml(template.title)}" loading="lazy" />
      ${template.previewUrl ? `<button class="preview-play" data-preview-id="${escapeHtml(template.id)}" type="button" aria-label="Play preview"><i data-lucide="play"></i><span>Preview</span></button>` : ""}
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
  els.templateGrid.querySelectorAll("[data-preview-id]").forEach((button) => {
    button.addEventListener("pointerdown", (event) => {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation?.();
    });
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation?.();
      openPreview(button.dataset.previewId);
    }, { capture: true });
  });
  refreshIcons();
}

function isHiddenCategory(category) {
  const value = `${category?.id || ""} ${category?.name || ""}`.toLowerCase();
  return value.includes("business") || value.includes("商业接入");
}

function playPreview({ title = "Preview", previewUrl = "" } = {}) {
  if (!previewUrl || !els.previewDialog || !els.previewVideo) return;
  els.previewTitle.textContent = title || "Preview";
  els.previewVideo.pause();
  els.previewVideo.src = previewUrl;
  els.previewVideo.load();
  if (!els.previewDialog.open) els.previewDialog.showModal();
  window.setTimeout(() => els.previewVideo.play().catch(() => {}), 80);
}

function openPreview(templateId) {
  const template = state.templates.find((item) => item.id === templateId);
  playPreview({ title: template?.title, previewUrl: template?.previewUrl });
}

function openAdvancedPreview(index) {
  const cases = state.advancedCases.filter((item) => item.enabled !== false);
  const item = cases[Number(index || 0)];
  playPreview({ title: item?.title, previewUrl: item?.previewUrl });
}

function walletCreditsForAmount(amount) {
  const rate = Number(state.wallet?.cnyCentsPerUsdt || 720);
  return Math.max(0, Math.round(Number(amount || 0) * rate));
}

function renderTopupSummary() {
  if (!els.topupPanel) return;
  if (els.topupOrder && !els.topupOrder.hidden) return;
  const amount = Number(els.topupAmount?.value || 0);
  const credits = walletCreditsForAmount(amount);
  const asset = state.wallet?.asset || "USDT";
  const network = state.wallet?.network || "TRC20";
  if (els.topupCredits) els.topupCredits.textContent = `${credits} credits`;
  if (els.topupRate) {
    els.topupRate.textContent = state.user
      ? `${amount || 0} ${asset} via ${network}. Credits use RMB cents.`
      : "Login to create a payment order.";
  }
}

function renderTopupOrder(order) {
  if (!els.topupOrder || !order) return;
  els.topupOrder.hidden = false;
  els.topupOrder.innerHTML = `
    <div>
      <span>Pay exactly</span>
      <strong>${escapeHtml(order.payableAmountText || order.payableAmount || order.baseAmount)} ${escapeHtml(order.asset || "USDT")}</strong>
      <small>${escapeHtml(order.network || "")} · ${escapeHtml(order.creditAmount || 0)} credits · ${escapeHtml(order.status || "pending")}</small>
    </div>
    <code>${escapeHtml(order.address || "")}</code>
    <button class="ghost-button" type="button" data-copy-address><i data-lucide="copy"></i>Copy address</button>
  `;
  els.topupOrder.querySelector("[data-copy-address]")?.addEventListener("click", () => {
    navigator.clipboard?.writeText(order.address || "").then(() => {
      if (els.topupRate) els.topupRate.textContent = "Address copied. Transfer the exact amount shown.";
    });
  });
  if (els.topupCredits) els.topupCredits.textContent = `${order.creditAmount || 0} credits`;
  refreshIcons();
}

async function createTopupOrder() {
  if (!state.user) return openLogin();
  const amount = Number(els.topupAmount?.value || 0);
  if (!Number.isFinite(amount) || amount <= 0) {
    if (els.topupRate) els.topupRate.textContent = "Enter a valid USDT amount.";
    return;
  }
  els.createTopupBtn.disabled = true;
  if (els.topupRate) els.topupRate.textContent = "Creating payment order...";
  try {
    const payload = await requestJson("/api/pay/orders", {
      method: "POST",
      body: { amount },
    });
    renderTopupOrder(payload.order);
    if (els.topupRate) els.topupRate.textContent = "Order created. Transfer the exact amount including suffix.";
  } catch (error) {
    if (els.topupRate) els.topupRate.textContent = error.message;
  } finally {
    els.createTopupBtn.disabled = false;
  }
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

function userHasAdvancedAccess() {
  return state.user?.role === "admin" || state.user?.advancedAccess === true;
}

function renderAdvanced() {
  if (!els.advancedGate || !els.advancedWorkspace) return;
  if (!state.user) {
    els.advancedWorkspace.hidden = true;
    els.advancedGate.innerHTML = `
      <div class="permission-card">
        <span class="copy-kicker"><i data-lucide="lock-keyhole"></i> APPROVAL REQUIRED</span>
        <h2>Advanced generation is invite-only.</h2>
        <p>Login first, then submit an access request.</p>
        <button class="generate-btn" id="advancedLoginBtn" type="button">Login / Sign up</button>
      </div>
    `;
    document.querySelector("#advancedLoginBtn")?.addEventListener("click", openLogin);
    refreshIcons();
    return;
  }
  if (!userHasAdvancedAccess()) {
    const requested = Boolean(state.user.advancedAccessRequestedAt);
    const telegram = state.config?.platform?.advanced?.telegram || "";
    els.advancedWorkspace.hidden = true;
    els.advancedGate.innerHTML = `
      <div class="permission-card">
        <span class="copy-kicker"><i data-lucide="shield-check"></i> APPROVAL REQUIRED</span>
        <h2>${requested ? "Request submitted" : "Apply for advanced generation"}</h2>
        <p>${requested ? "Your request is waiting for review." : "Direct model controls require manual approval."}</p>
        ${telegram ? `<a class="ghost-button" href="${escapeHtml(telegram)}" target="_blank" rel="noopener">Contact support</a>` : ""}
        <button class="generate-btn" id="requestAdvancedBtn" type="button" ${requested ? "disabled" : ""}>${requested ? "Waiting for approval" : "Apply access"}</button>
      </div>
    `;
    document.querySelector("#requestAdvancedBtn")?.addEventListener("click", requestAdvancedAccess);
    refreshIcons();
    return;
  }
  els.advancedGate.innerHTML = "";
  els.advancedWorkspace.hidden = false;
  renderAdvancedCases();
  updateAdvancedModelControls();
  updateAdvancedButtonCost();
}

function updateAdvancedModelControls() {
  const provider = currentAdvancedProvider();
  const bounds = advancedDurationBounds(provider);
  if (els.advancedDuration) {
    els.advancedDuration.min = String(bounds.min);
    els.advancedDuration.max = String(bounds.max);
  }
  document.querySelectorAll(".advanced-wan-option").forEach((item) => {
    item.hidden = provider !== "wan27";
  });
  document.querySelectorAll(".advanced-seedance-option").forEach((item) => {
    item.hidden = provider !== "seedance";
  });
  if (els.advancedNote && state.advancedUploadDataUrl) {
    if (provider === "seedance") {
      const mode = els.advancedPreprocessReference?.value === "no" ? "original image" : "safe reference";
      els.advancedNote.textContent = `Reference selected. Seedance will use ${mode}.`;
    } else {
      els.advancedNote.textContent = "Reference selected. Wan2.7 will use the uploaded image as the first frame.";
    }
  }
  updateAdvancedButtonCost();
}

function renderAdvancedCases() {
  if (!els.advancedCaseGrid) return;
  const cases = state.advancedCases.filter((item) => item.enabled !== false);
  els.advancedCaseGrid.innerHTML = cases.length ? cases.map((item, index) => `
    <article class="advanced-case-card" data-case-index="${index}">
      <img src="${escapeHtml(item.coverUrl || item.previewUrl || "/assets/admin/home/default-hero.jpg")}" alt="${escapeHtml(item.title || "Case")}" loading="lazy" />
      ${item.previewUrl ? `<button class="preview-play advanced-preview-play" data-advanced-preview-index="${index}" type="button" aria-label="Play preview"><i data-lucide="play"></i></button>` : ""}
      <div>
        <span>${escapeHtml(item.category || "Case")} - ${escapeHtml(advancedCostLabel(advancedCaseDuration(item), advancedCaseProvider(item), item.params?.resolution))}</span>
        <strong>${escapeHtml(item.title || "Advanced case")}</strong>
        <p>${escapeHtml(item.description || item.prompt || "").slice(0, 96)}</p>
      </div>
    </article>
  `).join("") : '<div class="job-note">No cases configured yet.</div>';
  els.advancedCaseGrid.querySelectorAll("[data-case-index]").forEach((card) => {
    card.addEventListener("click", () => fillAdvancedCase(cases[Number(card.dataset.caseIndex || 0)]));
  });
  els.advancedCaseGrid.querySelectorAll("[data-advanced-preview-index]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      openAdvancedPreview(button.dataset.advancedPreviewIndex);
    });
  });
}

function fillAdvancedCase(item = {}) {
  const params = item.params && typeof item.params === "object" ? item.params : {};
  const provider = advancedCaseProvider(item);
  state.activeAdvancedCaseId = item.id || "";
  if (els.advancedProvider) els.advancedProvider.value = provider;
  if (els.advancedPrompt) els.advancedPrompt.value = item.prompt || params.prompt || "";
  if (els.advancedRatio) els.advancedRatio.value = params.ratio || params.aspect_ratio || item.ratio || "9:16";
  if (els.advancedResolution) els.advancedResolution.value = params.resolution || item.resolution || "720p";
  if (els.advancedDuration) els.advancedDuration.value = params.duration || item.duration || 5;
  if (els.advancedPreprocessReference) els.advancedPreprocessReference.value = params.preprocessReference === false ? "no" : "yes";
  if (els.advancedWanSeed) els.advancedWanSeed.value = params.seed || "";
  updateAdvancedModelControls();
  updateAdvancedButtonCost();
  if (els.advancedNote) els.advancedNote.textContent = `Loaded case: ${item.title || "Advanced case"} - ${advancedCostLabel(advancedCaseDuration(item), provider, params.resolution)}`;
}

async function requestAdvancedAccess() {
  if (!state.user) return openLogin();
  try {
    const payload = await requestJson("/api/advanced/request-access", { method: "POST" });
    if (payload.user) setUser(payload.user);
    if (els.advancedNote) els.advancedNote.textContent = "Request submitted.";
  } catch (error) {
    if (els.advancedNote) els.advancedNote.textContent = error.message;
  }
}

async function submitAdvancedGenerate() {
  if (!state.user) return openLogin();
  if (!userHasAdvancedAccess()) return renderAdvanced();
  const prompt = els.advancedPrompt?.value.trim() || "";
  if (!prompt) {
    if (els.advancedNote) els.advancedNote.textContent = "Prompt is required.";
    return;
  }
  const currentCase = state.advancedCases.find((item) => item.id === state.activeAdvancedCaseId);
  if (currentCase?.prompt && currentCase.prompt !== prompt) state.activeAdvancedCaseId = "";
  els.advancedSubmitBtn.disabled = true;
  const provider = currentAdvancedProvider();
  const bounds = advancedDurationBounds(provider);
  const duration = Math.min(bounds.max, Math.max(bounds.min, Number(els.advancedDuration?.value || bounds.fallback)));
  const resolution = currentAdvancedResolution();
  const preprocessReference = els.advancedPreprocessReference?.value !== "no";
  const referenceNote = state.advancedUploadDataUrl
    ? provider === "seedance"
      ? (preprocessReference ? " - preparing safe reference first" : " - using original image")
      : " - using uploaded image as first frame"
    : "";
  if (els.advancedNote) els.advancedNote.textContent = `Submitting advanced generation${referenceNote} - ${advancedCostLabel(duration, provider, resolution)}...`;
  try {
    const payload = await requestJson("/api/advanced/generate", {
      method: "POST",
      body: {
        caseId: state.activeAdvancedCaseId,
        provider,
        prompt,
        dataUrl: state.advancedUploadDataUrl,
        fileName: els.advancedImage?.files?.[0]?.name || "",
        ratio: els.advancedRatio?.value || "9:16",
        resolution: els.advancedResolution?.value || "720p",
        duration,
        preprocessReference,
        seed: els.advancedWanSeed?.value || "",
      },
    });
    if (payload.user) setUser(payload.user);
    const charged = payload.cost ?? advancedCostForDuration(duration, provider, resolution);
    if (els.advancedNote) els.advancedNote.textContent = `Job submitted: ${payload.taskId || payload.task?.taskId || ""} - ${formatCredits(charged)} credits`;
    loadHistory();
  } catch (error) {
    if (els.advancedNote) els.advancedNote.textContent = error.message;
  } finally {
    els.advancedSubmitBtn.disabled = false;
    updateAdvancedButtonCost();
  }
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
  if (!state.user) {
    els.historyList.innerHTML = `
      <div class="history-empty-card">
        <strong>Login required</strong>
        <p>Sign in to view your generation records.</p>
        <button class="generate-btn" type="button" data-login-history>Login</button>
      </div>
    `;
    els.historyList.querySelector("[data-login-history]")?.addEventListener("click", openLogin);
    refreshIcons();
    return;
  }
  if (!records.length) {
    els.historyList.innerHTML = '<div class="history-empty-card"><strong>No generation records yet.</strong><p>Your submitted gallery and advanced jobs will appear here.</p></div>';
    return;
  }
  els.historyList.innerHTML = records.map((record) => {
    const videoUrl = generationVideoUrl(record);
    const title = record.templateTitle || record.sceneEntryName || record.sceneName || "Generation job";
    const created = record.createdAt ? new Date(record.createdAt).toLocaleString() : "";
    const duration = record.duration ? `${record.duration}s` : "";
    const cost = billingLabel(record.billing || {});
    return `
      <article class="history-item">
        <div class="history-media">
          ${videoUrl ? `<video src="${escapeHtml(videoUrl)}" controls playsinline preload="metadata"></video>` : `<div class="history-placeholder"><i data-lucide="loader-circle"></i><span>${escapeHtml(statusLabel(record.status))}</span></div>`}
        </div>
        <div class="history-info">
          <header>
            <div>
              <strong>${escapeHtml(title)}</strong>
              <small>${escapeHtml(record.taskId || "")}</small>
            </div>
            <small>${escapeHtml(statusLabel(record.status))}</small>
          </header>
          <div class="history-meta">
            ${record.model ? `<span>${escapeHtml(record.model)}</span>` : ""}
            ${record.provider ? `<span>${escapeHtml(record.provider)}</span>` : ""}
            ${duration ? `<span>${escapeHtml(duration)}</span>` : ""}
            <span>${escapeHtml(cost)}</span>
            ${created ? `<span>${escapeHtml(created)}</span>` : ""}
          </div>
          <details class="history-details">
            <summary>View parameters</summary>
            <pre>${escapeHtml(JSON.stringify({ taskId: record.taskId || "", provider: record.provider || "", source: record.source || "", prompt: record.finalPrompt || record.prompt || "", params: record.params || null, ratio: record.ratio, resolution: record.resolution, duration: record.duration, billing: record.billing || null }, null, 2))}</pre>
          </details>
        </div>
      </article>
    `;
  }).join("");
  refreshIcons();
}

async function loadHistory() {
  if (!els.historyList) return;
  if (!state.user) {
    renderHistory([]);
    return;
  }
  if (historyLoading) return;
  historyLoading = true;
  els.historyList.innerHTML = '<div class="job-note">Loading generation records...</div>';
  try {
    const payload = await requestJson("/api/generation-records?limit=50");
    if (payload.user) setUser(payload.user);
    renderHistory(payload.records || []);
  } catch (error) {
    els.historyList.innerHTML = `<div class="job-note">Load failed: ${escapeHtml(error.message || String(error))}</div>`;
  } finally {
    historyLoading = false;
  }
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
  if (state.tab === "history") renderHistory([]);
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
    if (state.tab === "history") loadHistory();
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
  state.wallet = payload.config?.wallet || null;
  state.templates = platform.templates || [];
  state.categories = platform.categories || [];
  state.advancedCases = platform.advanced?.cases || [];
  els.brandName.textContent = platform.brand || "Vipeak AI";
  renderHero();
  renderCategories();
  renderTemplates();
  renderAccessGuides();
  renderAdvanced();
  renderTopupSummary();
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
els.advancedImage?.addEventListener("change", async () => {
  const file = els.advancedImage.files?.[0];
  if (!file) return;
  if (file.size > 8 * 1024 * 1024) {
    state.advancedUploadDataUrl = "";
    els.advancedImage.value = "";
    els.advancedUploadBox?.classList.remove("has-image");
    if (els.advancedUploadPreview) els.advancedUploadPreview.removeAttribute("src");
    if (els.advancedNote) els.advancedNote.textContent = "Image must be 8MB or smaller.";
    return;
  }
  state.advancedUploadDataUrl = await readFileAsDataUrl(file);
  if (els.advancedUploadPreview) els.advancedUploadPreview.src = state.advancedUploadDataUrl;
  els.advancedUploadBox?.classList.add("has-image");
  updateAdvancedModelControls();
});
els.submitTemplateBtn?.addEventListener("click", submitTemplate);
els.refreshHistoryBtn?.addEventListener("click", loadHistory);
els.topupAmount?.addEventListener("input", () => {
  if (els.topupOrder) {
    els.topupOrder.hidden = true;
    els.topupOrder.innerHTML = "";
  }
  renderTopupSummary();
});
els.createTopupBtn?.addEventListener("click", createTopupOrder);
els.previewDialog?.addEventListener("close", () => {
  if (!els.previewVideo) return;
  els.previewVideo.pause();
  els.previewVideo.removeAttribute("src");
  els.previewVideo.load();
});
els.advancedSubmitBtn?.addEventListener("click", submitAdvancedGenerate);
els.advancedDuration?.addEventListener("input", updateAdvancedButtonCost);
els.advancedProvider?.addEventListener("change", updateAdvancedModelControls);
els.advancedResolution?.addEventListener("change", updateAdvancedButtonCost);
els.advancedPreprocessReference?.addEventListener("change", updateAdvancedModelControls);
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
    els.copyAccessBtn.innerHTML = '<i data-lucide="clipboard"></i>Copy snippet';
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
