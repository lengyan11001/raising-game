"use strict";

const TOKEN_KEY = "raisingGameToken";

const state = {
  config: null,
  templates: [],
  categories: [],
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

const ACCESS_GUIDES = [
  {
    id: "http",
    title: "HTTP API",
    subtitle: "直接提交任务",
    desc: "服务端提交生成任务，查询进度，读取结果。",
    copy:
      "POST /api/platform/generate\nAuthorization: Bearer <user-token>\nContent-Type: application/json\n\n{\"templateId\":\"template-id\",\"prompt\":\"...\",\"dataUrl\":\"data:image/png;base64,...\"}\n\nGET /api/generation-records\nGET /api/generation-records/<taskId>",
  },
  {
    id: "mcp",
    title: "MCP",
    subtitle: "工具调用",
    desc: "把模板生成封装成工具，由业务系统按模板 ID 和素材调用。",
    copy:
      "tool: create_template_video\ninput:\n  templateId: template-id\n  prompt: optional user prompt\n  image: uploaded image url or data url\noutput:\n  taskId\n  status\n  videoUrl",
  },
  {
    id: "typescript",
    title: "TypeScript",
    subtitle: "服务端接入",
    desc: "在服务端用 token 调用本站接口，前端只负责传素材和展示记录。",
    copy:
      "const res = await fetch('https://123vips.com/api/platform/generate', {\n  method: 'POST',\n  headers: {\n    authorization: `Bearer ${userToken}`,\n    'content-type': 'application/json',\n  },\n  body: JSON.stringify({ templateId, prompt, dataUrl }),\n});\nconst job = await res.json();",
  },
  {
    id: "python",
    title: "Python",
    subtitle: "服务端接入",
    desc: "后端任务、脚本或内部系统都可以按同一套接口提交和查询。",
    copy:
      "import requests\n\nresp = requests.post(\n    'https://123vips.com/api/platform/generate',\n    headers={'Authorization': f'Bearer {user_token}'},\n    json={'templateId': template_id, 'prompt': prompt, 'dataUrl': data_url},\n)\njob = resp.json()",
  },
  {
    id: "cli",
    title: "CLI",
    subtitle: "命令行调用",
    desc: "适合内部运营或自动化脚本，直接用 HTTP 提交任务。",
    copy:
      "curl -X POST https://123vips.com/api/platform/generate \\\n  -H \"Authorization: Bearer <user-token>\" \\\n  -H \"Content-Type: application/json\" \\\n  -d '{\"templateId\":\"template-id\",\"prompt\":\"...\",\"dataUrl\":\"...\"}'",
  },
];

let activeAccessGuide = ACCESS_GUIDES[0];

function refreshIcons() {
  window.lucide?.createIcons();
}

function cleanPublicCopy(value, fallback) {
  const text = String(value || "").trim();
  if (!text || /ap[i]z|上游|后台|api\s*接入/i.test(text)) return fallback;
  return text;
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
    els.heroBadge.textContent = "接入方式";
    els.heroNotice.textContent = PUBLIC_COPY.accessNotice;
    return;
  }
  const platform = state.config?.platform || {};
  els.heroEyebrow.textContent = "Template Plaza";
  els.heroTitle.textContent = cleanPublicCopy(platform.heroTitle, PUBLIC_COPY.galleryTitle);
  els.heroSubtitle.textContent = cleanPublicCopy(platform.heroSubtitle, PUBLIC_COPY.gallerySubtitle);
  els.heroBadge.textContent = "模板广场";
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
      <img class="template-cover" src="${escapeHtml(template.coverUrl || "/assets/admin/home/default-hero.jpg")}" alt="${escapeHtml(template.title)}" loading="lazy" />
      <div class="template-meta">
        <span>${escapeHtml(template.badge || (template.type === "image-to-video" ? "Image to Video" : "Text to Video"))}</span>
        <strong>${escapeHtml(template.title)}</strong>
        <p>${escapeHtml(template.prompt || "").slice(0, 72)}${String(template.prompt || "").length > 72 ? "..." : ""}</p>
        <button class="use-template" data-template-id="${escapeHtml(template.id)}" type="button">生成同款</button>
      </div>
    </article>
  `).join("") : `<div class="job-note">暂无可用模板，请稍后再试。</div>`;

  els.templateGrid.querySelectorAll("[data-template-id]").forEach((button) => {
    button.addEventListener("click", () => openTemplate(button.dataset.templateId));
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
    els.jobNote.innerHTML = `任务已提交：<code>${escapeHtml(payload.taskId)}</code>。可在生成记录里查看进度。`;
  } catch (error) {
    els.jobNote.textContent = error.message;
  } finally {
    els.submitTemplateBtn.disabled = false;
  }
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
    state.user = payload.user;
    localStorage.setItem(TOKEN_KEY, payload.token);
    els.loginBtn.textContent = payload.user.username;
    els.loginDialog.close();
  } catch (error) {
    els.loginMessage.textContent = error.message;
  }
}

async function loadMe() {
  if (!state.token) return;
  try {
    const payload = await requestJson("/api/auth/me");
    state.user = payload.user;
    els.loginBtn.textContent = payload.user?.username || "账号";
  } catch {
    state.token = "";
    localStorage.removeItem(TOKEN_KEY);
  }
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
els.loginBtn?.addEventListener("click", openLogin);
els.toggleLoginMode?.addEventListener("click", () => {
  state.loginMode = state.loginMode === "login" ? "register" : "login";
  renderLoginMode();
});
els.loginSubmit?.addEventListener("click", submitLogin);
els.copyAccessBtn?.addEventListener("click", async () => {
  await navigator.clipboard.writeText(els.accessCopy.textContent || "");
  els.copyAccessBtn.innerHTML = '<i data-lucide="check"></i>已复制';
  refreshIcons();
  setTimeout(() => {
    els.copyAccessBtn.innerHTML = '<i data-lucide="clipboard"></i>复制接入说明';
    refreshIcons();
  }, 1600);
});

bootstrap().catch((error) => {
  document.body.insertAdjacentHTML("beforeend", `<div class="job-note" style="position:fixed;left:20px;bottom:20px;background:#11182b;padding:14px 16px;border-radius:14px;">${escapeHtml(error.message)}</div>`);
});
