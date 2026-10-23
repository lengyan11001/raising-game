// Main-site case library. Static showcase metadata lives in assets/showcase,
// while users and generation records remain in PostgreSQL through the API.
let caseLibraryItems = null;
let caseLibraryPromise = null;
let caseLibraryPayload = null;
let caseLibraryCategory = "all";
let caseLibraryQuery = "";
let caseLibraryShown = 24;
let caseLibraryActiveItem = null;
const CASE_LIBRARY_PAGE_SIZE = 24;
const CASE_LIBRARY_CATEGORY_ORDER = ["image_gen", "i2v", "image_edit", "swap"];

function caseLibraryLanguage() {
  return String(state.lang || "en").toLowerCase().startsWith("zh") ? "zh" : "en";
}

function caseLibraryText(item, key) {
  const lang = caseLibraryLanguage();
  const localized = item?.[`${key}_${lang}`];
  if (localized) return String(localized);
  const alternate = item?.[`${key}_${lang === "zh" ? "en" : "zh"}`];
  return String(item?.[key] || alternate || "");
}

function caseLibraryCategoryLabel(id = "") {
  const labels = caseLibraryLanguage() === "zh"
    ? { image_gen: "文生图", i2v: "图生视频", image_edit: "图像编辑", swap: "换脸 / 换头" }
    : { image_gen: "Text to image", i2v: "Image to video", image_edit: "Image editing", swap: "Face / head swap" };
  return labels[id] || id || t("case.all");
}

function caseLibraryOutput(item = {}) {
  return Array.isArray(item.outputs) && item.outputs.length ? item.outputs[0] : null;
}

function caseLibraryModelLabel(item = {}) {
  const raw = String(item.model_label || item.model_key || "");
  return raw.replace(/\s*\(([^)]+)\)\s*$/, (_, suffix) => ` · ${suffix}`);
}

function caseLibraryMatches(item = {}) {
  if (caseLibraryCategory !== "all" && item.category !== caseLibraryCategory) return false;
  const needle = caseLibraryQuery.trim().toLowerCase();
  if (!needle) return true;
  return [
    caseLibraryText(item, "prompt"),
    item.prompt,
    item.model_label,
    item.model_key,
    ...(Array.isArray(item.tags) ? item.tags : []),
  ].join("\n").toLowerCase().includes(needle);
}

function caseLibraryMediaMarkup(asset = null, options = {}) {
  if (!asset?.url) return `<div class="case-library-media-empty">${escapeHtml(t("common.preview"))}</div>`;
  const className = String(options.className || "");
  const alt = String(options.alt || "");
  if (String(asset.kind || "") === "video") {
    return `<video class="${escapeHtml(className)}" src="${escapeHtml(asset.url)}" ${asset.poster ? `poster="${escapeHtml(asset.poster)}"` : ""} controls playsinline preload="metadata"></video>`;
  }
  return `<img class="${escapeHtml(className)}" src="${escapeHtml(asset.url)}" alt="${escapeHtml(alt)}" loading="lazy" decoding="async" />`;
}

function renderCaseLibraryTabs() {
  const tabs = document.getElementById("caseCategoryTabs");
  if (!tabs || !Array.isArray(caseLibraryItems)) return;
  const totals = caseLibraryPayload?.totals || {};
  const counts = { all: Number(totals.all || caseLibraryItems.length), ...(totals.byCategory || {}) };
  const categories = ["all", ...CASE_LIBRARY_CATEGORY_ORDER.filter((id) => counts[id])];
  tabs.innerHTML = categories.map((id) => {
    const label = id === "all" ? t("case.all") : caseLibraryCategoryLabel(id);
    const active = caseLibraryCategory === id;
    return `<button class="case-category-tab${active ? " is-active" : ""}" type="button" role="tab" aria-selected="${active}" data-case-category="${escapeHtml(id)}"><span>${escapeHtml(label)}</span><small>${counts[id] || 0}</small></button>`;
  }).join("");
}

function renderCaseLibraryCards(reset = false) {
  const grid = document.getElementById("caseLibraryGrid");
  if (!grid || !Array.isArray(caseLibraryItems)) return;
  if (reset) caseLibraryShown = CASE_LIBRARY_PAGE_SIZE;
  const items = caseLibraryItems.filter(caseLibraryMatches);
  const visible = items.slice(0, caseLibraryShown);
  const count = document.getElementById("caseLibraryCount");
  const status = document.getElementById("caseLibraryStatus");
  const more = document.getElementById("caseLibraryMore");
  const unlocked = caseLibraryPayload?.unlocked === true;
  const totalCount = Number(caseLibraryPayload?.totals?.all || caseLibraryItems.length);
  if (count) count.textContent = unlocked
    ? t("case.count", { count: items.length })
    : t("case.previewCount", { count: items.length, total: totalCount });
  if (status) {
    status.textContent = caseLibraryQuery.trim()
      ? `“${caseLibraryQuery.trim()}”`
      : (!unlocked ? t("case.previewLimit") : "");
  }
  if (!visible.length) {
    grid.innerHTML = `<div class="case-library-empty">${escapeHtml(t("case.empty"))}</div>`;
  } else {
    grid.innerHTML = visible.map((item) => {
      const output = caseLibraryOutput(item);
      const poster = output?.poster || (output?.kind === "image" ? output?.url : "") || "";
      const isVideo = String(output?.kind || "") === "video";
      const prompt = caseLibraryText(item, "prompt").replace(/\s+/g, " ").trim();
      return `<button class="case-library-card" type="button" data-case-id="${escapeHtml(item.id)}" aria-label="${escapeHtml(caseLibraryModelLabel(item))}">
        <span class="case-library-thumb">
          ${poster ? `<img src="${escapeHtml(poster)}" alt="" loading="lazy" decoding="async" />` : `<span class="case-library-media-empty">${escapeHtml(t("common.preview"))}</span>`}
          ${isVideo ? `<span class="case-library-play"><i data-lucide="play"></i></span>` : ""}
          <span class="case-library-kind">${escapeHtml(caseLibraryCategoryLabel(item.category))}</span>
        </span>
        <span class="case-library-card-copy">
          <strong>${escapeHtml(caseLibraryModelLabel(item))}</strong>
          <span>${escapeHtml(prompt || t("case.prompt"))}</span>
          <small>${escapeHtml(String(item.created_at_str || ""))}</small>
        </span>
      </button>`;
    }).join("") + (!unlocked ? `<div class="case-library-locked">
      <span class="case-library-locked-icon"><i data-lucide="lock"></i></span>
      <div><strong>${escapeHtml(t("case.unlockTitle"))}</strong><span>${escapeHtml(t("case.unlockBody"))}</span></div>
      <button class="primary-button compact" type="button" data-case-unlock>${escapeHtml(state.user ? t("case.unlockCta") : t("case.unlockLogin"))}</button>
    </div>` : "");
  }
  if (more) more.hidden = !unlocked || items.length <= caseLibraryShown;
  refreshIcons();
}

function caseLibraryParamFacts(item = {}) {
  const params = item.params && typeof item.params === "object" ? item.params : {};
  const labels = caseLibraryLanguage() === "zh"
    ? { resolution: "分辨率", ratio: "比例", duration: "时长", audio: "音频", prompt_extend: "提示词增强", seed: "种子" }
    : { resolution: "Resolution", ratio: "Ratio", duration: "Duration", audio: "Audio", prompt_extend: "Prompt enhance", seed: "Seed" };
  return Object.entries(params)
    .filter(([key, value]) => key !== "prompt" && value !== "" && value != null)
    .map(([key, value]) => {
      let display = value;
      if (value === true) display = caseLibraryLanguage() === "zh" ? "开启" : "On";
      if (value === false) display = caseLibraryLanguage() === "zh" ? "关闭" : "Off";
      return `${labels[key] || key}: ${display}`;
    });
}

function openCaseLibraryItem(item = null) {
  const dialog = document.getElementById("caseDetailDialog");
  if (!dialog || !item) return;
  caseLibraryActiveItem = item;
  const output = caseLibraryOutput(item);
  const inputs = Array.isArray(item.inputs) ? item.inputs : [];
  const kicker = document.getElementById("caseDetailKicker");
  const title = document.getElementById("caseDetailTitle");
  const model = document.getElementById("caseDetailModel");
  const media = document.getElementById("caseDetailMedia");
  const prompt = document.getElementById("caseDetailPrompt");
  const paramsSection = document.getElementById("caseDetailParamsSection");
  const params = document.getElementById("caseDetailParams");
  const tagsSection = document.getElementById("caseDetailTagsSection");
  const tags = document.getElementById("caseDetailTags");
  const copy = document.getElementById("caseDetailCopy");
  if (kicker) kicker.textContent = caseLibraryCategoryLabel(item.category);
  if (title) title.textContent = caseLibraryModelLabel(item);
  if (model) model.textContent = item.category_label || caseLibraryCategoryLabel(item.category);
  if (media) {
    media.innerHTML = `
      ${output ? `<div class="case-detail-main">${caseLibraryMediaMarkup(output, { className: "case-detail-main-media", alt: t("case.output") })}</div>` : ""}
      ${inputs.length ? `<div class="case-detail-references">${inputs.map((asset, index) => `<figure>${caseLibraryMediaMarkup(asset, { className: "case-detail-reference-media", alt: `${t("case.references")} ${index + 1}` })}<figcaption>${escapeHtml(asset.label || `${t("case.references")} ${index + 1}`)}</figcaption></figure>`).join("")}</div>` : ""}
    `;
  }
  if (prompt) prompt.textContent = caseLibraryText(item, "prompt") || t("case.prompt");
  const facts = caseLibraryParamFacts(item);
  if (paramsSection) paramsSection.hidden = !facts.length;
  if (params) params.innerHTML = facts.map((fact) => `<span>${escapeHtml(fact)}</span>`).join("");
  const tagList = Array.isArray(item.tags) ? item.tags.filter(Boolean) : [];
  if (tagsSection) tagsSection.hidden = !tagList.length;
  if (tags) tags.innerHTML = tagList.map((tag) => `<span>${escapeHtml(tag)}</span>`).join("");
  if (copy) copy.textContent = t("case.copy");
  if (typeof prepareModalOpen === "function") prepareModalOpen();
  if (!dialog.open) dialog.showModal();
  refreshIcons();
}

function pauseCaseLibraryVideos(root = document) {
  root.querySelectorAll?.("video").forEach((video) => {
    try { video.pause(); } catch (error) {}
  });
}

function bindCaseLibraryEvents() {
  const tabs = document.getElementById("caseCategoryTabs");
  const search = document.getElementById("caseLibrarySearch");
  const grid = document.getElementById("caseLibraryGrid");
  const more = document.getElementById("caseLibraryMore");
  const dialog = document.getElementById("caseDetailDialog");
  const copy = document.getElementById("caseDetailCopy");
  if (!tabs || tabs.dataset.bound === "1") return;
  tabs.dataset.bound = "1";
  tabs.addEventListener("click", (event) => {
    const button = event.target.closest("[data-case-category]");
    if (!button) return;
    caseLibraryCategory = button.dataset.caseCategory || "all";
    renderCaseLibraryTabs();
    renderCaseLibraryCards(true);
  });
  search?.addEventListener("input", () => {
    caseLibraryQuery = search.value || "";
    renderCaseLibraryCards(true);
  });
  more?.addEventListener("click", () => {
    caseLibraryShown += CASE_LIBRARY_PAGE_SIZE;
    renderCaseLibraryCards(false);
  });
  grid?.addEventListener("click", (event) => {
    if (event.target.closest("[data-case-unlock]")) {
      if (!state.user) return openLogin();
      if (typeof openBillingPaymentChoice === "function") {
        openBillingPaymentChoice({ billingPlanId: "plan-main-creator" });
      }
      return;
    }
    const card = event.target.closest("[data-case-id]");
    if (!card) return;
    const item = (caseLibraryItems || []).find((candidate) => String(candidate.id) === String(card.dataset.caseId));
    if (item) openCaseLibraryItem(item);
  });
  copy?.addEventListener("click", async () => {
    if (!caseLibraryActiveItem) return;
    const text = caseLibraryText(caseLibraryActiveItem, "prompt");
    try {
      await navigator.clipboard.writeText(text);
      copy.textContent = t("case.copied");
    } catch (error) {
      const field = document.createElement("textarea");
      field.value = text;
      field.style.position = "fixed";
      field.style.opacity = "0";
      document.body.appendChild(field);
      field.select();
      const copied = document.execCommand("copy");
      field.remove();
      copy.textContent = copied ? t("case.copied") : t("case.copyFailed");
    }
    window.setTimeout(() => { copy.textContent = t("case.copy"); }, 1600);
  });
  dialog?.addEventListener("close", () => {
    pauseCaseLibraryVideos(dialog);
    caseLibraryActiveItem = null;
  });
}

async function loadCaseLibrary() {
  if (Array.isArray(caseLibraryItems)) return caseLibraryItems;
  if (caseLibraryPromise) return caseLibraryPromise;
  caseLibraryPromise = requestJson("/api/cases")
    .then((payload) => {
      const items = Array.isArray(payload.items) ? payload.items : [];
      items.sort((a, b) => Number(b.id || 0) - Number(a.id || 0));
      caseLibraryPayload = payload;
      caseLibraryItems = items;
      return items;
    })
    .catch((error) => {
      caseLibraryPromise = null;
      throw error;
    });
  return caseLibraryPromise;
}

function resetCaseLibrary() {
  caseLibraryItems = null;
  caseLibraryPromise = null;
  caseLibraryPayload = null;
  caseLibraryCategory = "all";
  caseLibraryQuery = "";
  caseLibraryShown = CASE_LIBRARY_PAGE_SIZE;
}

function refreshCaseLibraryAccess() {
  resetCaseLibrary();
  if (state.tab === "cases") renderCaseLibrary();
}

async function renderCaseLibrary() {
  bindCaseLibraryEvents();
  const grid = document.getElementById("caseLibraryGrid");
  const status = document.getElementById("caseLibraryStatus");
  try {
    await loadCaseLibrary();
    renderCaseLibraryTabs();
    renderCaseLibraryCards(true);
    const section = document.querySelector('[data-panel="cases"]');
    if (section) section.dataset.loaded = "true";
  } catch (error) {
    if (status) status.textContent = t("case.loadFailed");
    if (grid) grid.innerHTML = `<div class="case-library-empty">${escapeHtml(t("case.loadFailed"))}</div>`;
  }
}
