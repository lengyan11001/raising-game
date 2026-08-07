function refreshIcons() {
  window.lucide?.createIcons();
}
window.addEventListener("DOMContentLoaded", refreshIcons, { once: true });

function showAgeForbidden() {
  state.ageGateDecision = "denied";
  document.body.classList.add("age-gate-denied");
  document.body.classList.remove("age-gate-accepted", "age-gate-locked");
  if (els.ageGate) els.ageGate.hidden = true;
  if (els.ageForbidden) els.ageForbidden.hidden = false;
}

function ensureAgeGate() {
  if (!els.ageGate || !els.ageGateConfirmBtn || !els.ageGateDeclineBtn) return Promise.resolve(true);
  if (localStorage.getItem(AGE_GATE_ACCEPTED_KEY) === "1") {
    state.ageGateDecision = "accepted";
    document.body.classList.add("age-gate-accepted");
    document.body.classList.remove("age-gate-denied", "age-gate-locked");
    if (els.ageGate) els.ageGate.hidden = true;
    if (els.ageForbidden) els.ageForbidden.hidden = true;
    return Promise.resolve(true);
  }
  if (state.ageGateDecision === "accepted") return Promise.resolve(true);
  if (state.ageGateDecision === "denied") return Promise.resolve(false);

  els.ageGate.hidden = false;
  if (els.ageForbidden) els.ageForbidden.hidden = true;

  return new Promise((resolve) => {
    const cleanup = () => {
      els.ageGateConfirmBtn.removeEventListener("click", onConfirm);
      els.ageGateDeclineBtn.removeEventListener("click", onDecline);
    };

    const onConfirm = () => {
      state.ageGateDecision = "accepted";
      try {
        localStorage.setItem(AGE_GATE_ACCEPTED_KEY, "1");
      } catch (error) {}
      document.body.classList.add("age-gate-accepted");
      document.body.classList.remove("age-gate-denied", "age-gate-locked");
      els.ageGate.hidden = true;
      if (els.ageForbidden) els.ageForbidden.hidden = true;
      cleanup();
      resolve(true);
    };

    const onDecline = () => {
      cleanup();
      showAgeForbidden();
      resolve(false);
    };

    els.ageGateConfirmBtn.addEventListener("click", onConfirm, { once: true });
    els.ageGateDeclineBtn.addEventListener("click", onDecline, { once: true });
  });
}

function isInteractiveTarget(target) {
  return Boolean(target?.closest?.("button, a, input, textarea, select, label"));
}

function cleanPublicCopy(value, fallback) {
  const text = String(value || "").trim();
  if (!text || /ap[i]z|upstream|admin|上游|后台|api\s*接入/i.test(text)) return fallback;
  return text;
}

function t(key, vars = {}, fallback = "") {
  const value = I18N[state.lang]?.[key] ?? I18N.en[key] ?? fallback ?? key;
  return publicModelText(String(value).replace(/\{(\w+)\}/g, (_, name) => vars[name] ?? ""));
}

function fileInputLabel(input) {
  const files = Array.from(input?.files || []);
  if (!files.length) return t("file.none");
  if (files.length === 1) return files[0].name || t("file.choose");
  return t("file.multipleSelected", { count: files.length });
}

function updateFilePickerLabel(input) {
  if (!input?.id) return;
  const label = document.querySelector(`[data-file-name-for="${input.id}"]`);
  if (label) label.textContent = fileInputLabel(input);
}

function updateAllFilePickerLabels(root = document) {
  root.querySelectorAll("input[type='file']").forEach(updateFilePickerLabel);
}

function localizedPublicCopy(configValue, key) {
  const fallback = t(`copy.${key}`, {}, PUBLIC_COPY[key] || "");
  if (state.lang !== "en") return fallback;
  return cleanPublicCopy(configValue, fallback);
}

function withExpiryNotice(text = "") {
  const notice = t("copy.videoExpiryShort", {}, VIDEO_EXPIRY_NOTICE);
  const value = String(text || "").trim();
  if (!value) return notice;
  if (/24/.test(value)) return value;
  return `${value} ${notice}`;
}

function renderSimplePager(holder, data, onPage, options = {}) {
  if (!holder) return;
  const page = Math.max(1, Number(data.page || 1));
  const totalPages = Math.max(1, Number(data.totalPages || 1));
  const total = Number(data.total || 0);
  const firstLabel = state.lang === "zh" ? "首页" : t("ledger.first", {}, "First");
  const jumpLabel = state.lang === "zh" ? "确定" : t("ledger.go", {}, "Go");
  holder.innerHTML = `
    ${options.jump ? `<button class="ghost-button" type="button" data-page="first" ${page <= 1 ? "disabled" : ""}>${escapeHtml(firstLabel)}</button>` : ""}
    <button class="ghost-button" type="button" data-page="prev" ${page <= 1 ? "disabled" : ""}>${escapeHtml(t("ledger.prev"))}</button>
    <span>${escapeHtml(t("ledger.page", { page, totalPages, total }))}</span>
    ${options.jump ? `
      <label class="pager-jump">
        <input type="number" min="1" max="${escapeHtml(String(totalPages))}" value="${escapeHtml(String(page))}" data-page-jump-input aria-label="${escapeHtml(state.lang === "zh" ? "跳转页码" : "Jump to page")}" />
        <button class="ghost-button" type="button" data-page-jump>${escapeHtml(jumpLabel)}</button>
      </label>
    ` : ""}
    <button class="ghost-button" type="button" data-page="next" ${page >= totalPages ? "disabled" : ""}>${escapeHtml(t("ledger.next"))}</button>
  `;
  holder.querySelector('[data-page="prev"]')?.addEventListener("click", () => {
    if (page > 1) onPage(page - 1);
  });
  holder.querySelector('[data-page="next"]')?.addEventListener("click", () => {
    if (page < totalPages) onPage(page + 1);
  });
  holder.querySelector('[data-page="first"]')?.addEventListener("click", () => {
    if (page > 1) onPage(1);
  });
  const jumpInput = holder.querySelector("[data-page-jump-input]");
  const jumpToPage = () => {
    const nextPage = Math.min(totalPages, Math.max(1, Number.parseInt(jumpInput?.value || "", 10) || page));
    if (jumpInput) jumpInput.value = String(nextPage);
    if (nextPage !== page) onPage(nextPage);
  };
  holder.querySelector("[data-page-jump]")?.addEventListener("click", jumpToPage);
  jumpInput?.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      jumpToPage();
    }
  });
}

function showInlineDialog({ title = "", body = "", confirmText = "", dialogClass = "", keepOpenOnConfirm = false, onOpen, onConfirm } = {}) {
  if (!els.inlineDialog || !els.inlineDialogForm || !els.inlineDialogBody) return Promise.resolve("close");
  prepareModalOpen();
  els.inlineDialog.classList.remove("is-media-action", "is-frame-action", "is-playflux-template", "is-undress-unlock");
  String(dialogClass || "")
    .split(/\s+/)
    .filter(Boolean)
    .forEach((className) => els.inlineDialog.classList.add(className));
  els.inlineDialogTitle.textContent = title || "";
  els.inlineDialogBody.innerHTML = body || "";
  if (els.inlineDialogConfirm) {
    els.inlineDialogConfirm.type = "submit";
    els.inlineDialogConfirm.onclick = null;
    els.inlineDialogConfirm.disabled = false;
    els.inlineDialogConfirm.innerHTML = `<i data-lucide="sparkles"></i>${escapeHtml(confirmText || t("common.generate"))}`;
  }
  refreshIcons();
  return new Promise((resolve) => {
    const cleanup = () => {
      els.inlineDialogForm.removeEventListener("submit", submitHandler);
      els.inlineDialogClose?.removeEventListener("click", closeHandler);
      els.inlineDialog.removeEventListener("close", dialogCloseHandler);
      els.inlineDialog.classList.remove("is-media-action", "is-frame-action", "is-playflux-template", "is-undress-unlock");
    };
    const closeHandler = () => els.inlineDialog.close("close");
    const dialogCloseHandler = () => {
      cleanup();
      resolve(els.inlineDialog.returnValue || "close");
    };
    const submitHandler = async (event) => {
      event.preventDefault();
      try {
        if (els.inlineDialogConfirm) els.inlineDialogConfirm.disabled = true;
        if (typeof onConfirm === "function") await onConfirm(els.inlineDialogBody);
        if (keepOpenOnConfirm) {
          if (els.inlineDialogConfirm) els.inlineDialogConfirm.disabled = true;
          return;
        }
        cleanup();
        els.inlineDialog.close("confirm");
        resolve("confirm");
      } catch (error) {
        const status = els.inlineDialogBody.querySelector(".job-note:last-child");
        if (status) status.textContent = error.message || String(error);
        if (els.inlineDialogConfirm) els.inlineDialogConfirm.disabled = false;
      }
    };
    els.inlineDialogForm.addEventListener("submit", submitHandler);
    els.inlineDialogClose?.addEventListener("click", closeHandler);
    els.inlineDialog.addEventListener("close", dialogCloseHandler);
    els.inlineDialog.showModal();
    if (typeof onOpen === "function") onOpen(els.inlineDialogBody);
  });
}

function guideText(guide, field) {
  const translated = I18N[state.lang]?.[`guide.${guide.id}.${field}`] ?? I18N.en[`guide.${guide.id}.${field}`];
  return String(translated ?? guide[field] ?? "");
}

function accessDoc(guide = activeAccessGuide) {
  return ACCESS_DOCS[guide.docs || guide.id] || ACCESS_DOCS.advanced;
}

function accessText(value = "") {
  return String(tenantScopedAccessText(value || ""));
}

function accessGuidesForMode(mode = activeAccessMode) {
  return mode === "params" ? ACCESS_PARAM_GUIDES : ACCESS_INTEGRATION_GUIDES;
}

function ensureActiveAccessGuide() {
  const guides = accessGuidesForMode();
  if (!guides.includes(activeAccessGuide)) activeAccessGuide = guides[0] || ACCESS_GUIDES[0];
  return guides;
}

function accessFieldTable(rows = []) {
  if (!rows.length) return "";
  const hasParamRows = rows.some((row) => row && typeof row === "object" && !Array.isArray(row));
  if (hasParamRows) {
    return `
      <div class="access-doc-table access-param-table">
        <div class="access-param-row access-param-head">
          <strong>Parameter</strong>
          <strong>Type</strong>
          <strong>Required</strong>
          <strong>Description</strong>
          <strong>Default</strong>
        </div>
        ${rows.map((row) => {
          const item = Array.isArray(row)
            ? { name: row[0], type: "", required: "", description: row[1], default: "" }
            : row;
          return `
            <div class="access-param-row">
              <strong>${escapeHtml(accessText(item.name || ""))}</strong>
              <span><code>${escapeHtml(accessText(item.type || "-"))}</code></span>
              <span>${escapeHtml(accessText(item.required || "No"))}</span>
              <span>${escapeHtml(accessText(item.description || ""))}</span>
              <span>${escapeHtml(accessText(item.default || "-"))}</span>
            </div>
          `;
        }).join("")}
      </div>
    `;
  }
  return `
    <div class="access-doc-table">
      ${rows.map(([name, desc]) => `
        <div class="access-doc-row">
          <strong>${escapeHtml(accessText(name))}</strong>
          <span>${escapeHtml(accessText(desc))}</span>
        </div>
      `).join("")}
    </div>
  `;
}

function accessQuickList(items = []) {
  if (!items.length) return "";
  return `<ul class="access-doc-quick">${items.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>`;
}

function markdownTable(rows = []) {
  if (!rows.length) return "";
  const paramRows = rows.map((row) => (Array.isArray(row)
    ? { name: row[0], type: "-", required: "No", description: row[1], default: "-" }
    : row));
  const lines = [
    "| Parameter | Type | Required | Description | Default |",
    "| --- | --- | --- | --- | --- |",
    ...paramRows.map((row) => `| ${markdownCell(row.name)} | ${markdownCell(row.type || "-")} | ${markdownCell(row.required || "No")} | ${markdownCell(row.description || "")} | ${markdownCell(row.default || "-")} |`),
  ];
  return lines.join("\n");
}

function markdownCell(value = "") {
  return accessText(value || "")
    .replace(/\|/g, "\\|")
    .replace(/\r?\n/g, " ")
    .trim();
}

function accessDocMarkdown(doc = accessDoc(activeAccessGuide)) {
  return [
    `# ${accessText(doc.title)}`,
    "",
    accessText(doc.summary || ""),
    "",
    "## Request",
    "",
    markdownTable(doc.request),
    "",
    "## Response",
    "",
    markdownTable(doc.response),
    "",
    "## Example",
    "",
    "```http",
    accessText(doc.example || "").trim(),
    "```",
    "",
  ].join("\n");
}

function downloadTextFile(filename = "api-doc.md", text = "") {
  const blob = new Blob([text], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function copyAccessMarkdown(button = null, doc = accessDoc(activeAccessGuide)) {
  const markdown = accessDocMarkdown(doc);
  await navigator.clipboard.writeText(markdown);
  if (!button) return;
  const original = button.innerHTML;
  button.innerHTML = `<i data-lucide="check"></i>${escapeHtml(t("common.copied"))}`;
  refreshIcons();
  setTimeout(() => {
    button.innerHTML = original;
    refreshIcons();
  }, 1200);
}

function downloadAccessMarkdown(doc = accessDoc(activeAccessGuide)) {
  const slug = String(activeAccessGuide?.id || "api-doc").replace(/[^a-z0-9-]+/gi, "-").toLowerCase();
  downloadTextFile(`${slug}.md`, accessDocMarkdown(doc));
}

function legalDoc(type) {
  return LEGAL_DOCS[state.lang]?.[type] || LEGAL_DOCS.en[type] || LEGAL_DOCS.en.privacy;
}

function renderLegalDialog(type = "privacy") {
  const doc = legalDoc(type);
  if (!doc || !els.legalTitle || !els.legalBody) return;
  els.legalTitle.textContent = doc.title;
  els.legalBody.innerHTML = `
    <p class="legal-updated">${escapeHtml(t("legal.updated", { date: LEGAL_UPDATED_AT }))}</p>
    ${doc.sections.map(([heading, body]) => `
      <section>
        <h3>${escapeHtml(heading)}</h3>
        <p>${escapeHtml(body)}</p>
      </section>
    `).join("")}
  `;
}

function openLegalDialog(type = "privacy") {
  prepareModalOpen();
  if (els.legalDialog) els.legalDialog.dataset.doc = type;
  renderLegalDialog(type);
  els.legalDialog?.showModal();
  refreshIcons();
}

function normalizeCopyKey(value = "") {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[\s_-]+/g, "")
    .replace(/[：:]/g, "");
}

function localizedCategoryName(category = {}) {
  const id = normalizeCopyKey(category.id);
  const name = normalizeCopyKey(category.name);
  if (id === "featured" || name === "精选模板" || name === "featured") return t("category.featured");
  if (id === "i2v" || name === "图生视频" || name === "imagetovideo") return t("category.i2v");
  if (id === "t2v" || name === "文生视频" || name === "texttovideo") return t("category.t2v");
  return category.name || category.id || "";
}

function localizedTemplateBadge(template = {}) {
  const badge = String(template.badge || "").trim();
  const normalized = normalizeCopyKey(badge);
  if (!badge) return template.type === "image-to-video" ? t("template.imageToVideo") : t("template.textToVideo");
  if (normalized === "图生视频" || normalized === "imagetovideo") return t("template.imageToVideo");
  if (normalized === "文生视频" || normalized === "texttovideo") return t("template.textToVideo");
  if (normalized === "精选模板" || normalized === "featured") return t("category.featured");
  return badge;
}

function titleFromTemplateId(id = "") {
  const normalized = String(id || "")
    .trim()
    .replace(/^pf-(video|image|anime)-\d+-/i, "")
    .replace(/^pf-(video|image|anime)-/i, "");
  const title = normalized
    .split(/[-_]+/)
    .filter(Boolean)
    .map((part) => {
      const lower = part.toLowerCase();
      if (/^v\d+$/i.test(part) || ["ai", "pov", "nsfw", "sdxl"].includes(lower)) return part.toUpperCase();
      return part.charAt(0).toUpperCase() + part.slice(1);
    })
    .join(" ")
    .replace(/\b(\d) (\d)\b/g, "$1.$2");
  return title;
}

function localizedTemplateField(template = {}, base = "title") {
  const lang = state.lang || "en";
  const suffix = lang.charAt(0).toUpperCase() + lang.slice(1);
  const candidates = lang === "zh"
    ? [template[`${base}Zh`], template[`${base}_zh`], template.zhTitle, template.titleZh, template.title]
    : [template[`${base}${suffix}`], template[`${base}_${lang}`], template[`${base}En`], template[`${base}_en`], template.enTitle, template.titleEn, template.englishTitle];
  return String(candidates.find((value) => String(value || "").trim()) || "").trim();
}

function localizedTemplateTitle(template = {}) {
  const key = `templateTitle.${template.id || ""}`;
  const translated = I18N[state.lang]?.[key] || I18N.en[key];
  if (translated) return translated;
  const localized = localizedTemplateField(template, "title");
  if (localized) return localized;
  const rawTitle = String(template.title || "").trim();
  if (state.lang !== "zh" && /[\u4e00-\u9fff]/.test(rawTitle)) return titleFromTemplateId(template.id) || "Template";
  return rawTitle || titleFromTemplateId(template.id) || "Template";
}

function setLocalizedContent(element, text) {
  if (!element) return;
  const icon = element.querySelector(":scope > svg, :scope > i");
  if (icon) {
    element.innerHTML = `${icon.outerHTML} ${escapeHtml(text)}`;
    return;
  }
  element.textContent = text;
}

function applyStaticTranslations() {
  document.documentElement.lang = state.lang;
  if (els.languageSelect) els.languageSelect.value = state.lang;
  document.querySelectorAll("[data-i18n]").forEach((element) => {
    setLocalizedContent(element, t(element.dataset.i18n, {}, element.textContent));
  });
  document.querySelectorAll("[data-i18n-placeholder]").forEach((element) => {
    element.setAttribute("placeholder", t(element.dataset.i18nPlaceholder, {}, element.getAttribute("placeholder") || ""));
  });
  document.querySelectorAll("[data-i18n-aria]").forEach((element) => {
    element.setAttribute("aria-label", t(element.dataset.i18nAria, {}, element.getAttribute("aria-label") || ""));
  });
}

function applyTenantFeatures() {
  const assetEnabled = tenantFeature("assetLibrary", true);
  const workflowEnabled = isWorkflowTester();
  const animeEnabled = canUseAnimeTemplates();
  const apiAccessEnabled = tenantFeature("apiAccess", true);
  const toolOnly = tenantFeature("toolOnly", false);
  const toolId = tenantStringFeature("toolId", "");
  const accountMenuEnabled = tenantFeature("accountMenu", true);
  document.body.classList.toggle("tenant-tool-shell", toolOnly);
  Array.from(document.body.classList).forEach((className) => {
    if (/^tenant-tool-[a-z0-9-]+$/i.test(className) && className !== "tenant-tool-shell") {
      document.body.classList.remove(className);
    }
  });
  if (toolOnly && toolId) document.body.classList.add(`tenant-tool-${toolId}`);
  [els.toolDownloadBtn, els.mobileToolDownloadBtn].forEach((element) => {
    if (element) element.hidden = !toolOnly;
  });
  document.querySelectorAll(".tenant-menu-only").forEach((element) => {
    element.hidden = !accountMenuEnabled;
  });
  document.querySelectorAll(".tenant-compact-only").forEach((element) => {
    element.hidden = accountMenuEnabled;
  });
  document.querySelectorAll(".tenant-old-tab").forEach((element) => {
    element.hidden = !assetEnabled;
  });
  document.querySelectorAll("[data-tab]").forEach((element) => {
    const tab = element.dataset.tab || "";
    const hiddenByToolGallery = toolOnly
      && tab === DEFAULT_PLATFORM_TAB
      && tenantDefaultGalleryMode() !== DEFAULT_GALLERY_MODE;
    element.hidden = hiddenByToolGallery || !isTabAllowed(tab);
  });
  document.querySelectorAll("[data-gallery-shortcut]").forEach((element) => {
    const shortcut = element.dataset.galleryShortcut || "";
    element.hidden = !isGalleryModeAllowed(shortcut) || (shortcut === "playflux-anime" && !animeEnabled);
  });
  document.querySelectorAll("[data-panel='access'], #accessTokenCard").forEach((element) => {
    element.hidden = !apiAccessEnabled || element.hidden;
  });
  [els.copyTokenBtn, els.menuCopyTokenBtn, els.toggleAccessTokenBtn, els.copyAccountTokenBtn, els.toggleAccountTokenBtn].forEach((element) => {
    if (element) element.hidden = !apiAccessEnabled;
  });
  const accountTokenBox = els.accountToken?.closest(".token-box");
  if (accountTokenBox) accountTokenBox.hidden = !apiAccessEnabled;
}

function applyLanguage() {
  applyStaticTranslations();
  applyTenantFeatures();
  if (typeof renderVideoToolActions === "function") renderVideoToolActions();
  if (!state.config) {
    renderAccountMenu();
    renderTopupSummary();
    renderTokenDisplays();
    return;
  }
  renderCategories();
  renderTemplates();
  bindCharacterCreator();
  renderAccessGuides();
  renderAdvanced();
  renderAssets();
  if (state.tab === "characters") renderCharactersPanel({ forceCreator: true });
  renderAccountMenu();
  renderTopupSummary();
  renderPricing();
  renderTokenDisplays();
  renderApiSubtokens();
  renderLoginForm();
  if (els.legalDialog?.open) renderLegalDialog(els.legalDialog.dataset.doc || "privacy");
  updateSubmitButtonCost();
  updateAdvancedButtonCost();
  if (state.tab === "history" && !historyLoading) loadHistory();
  if (state.tab === "topups") loadTopupRecords();
  if (state.tab === "spending") loadSpendingRecords();
  if (state.tab === "referral") renderReferral();
  if (state.tab === "assets") loadUserAssets();
  if (state.tab === "advanced") loadAdvancedAssets();
  if (state.tab === "access") loadApiSubtokens();
  refreshIcons();
}

function setLanguage(lang) {
  const next = SUPPORTED_LANGS.has(lang) ? lang : "en";
  state.lang = next;
  localStorage.setItem(LANG_KEY, next);
  applyLanguage();
}

function setUser(user, { refreshHistory = false, skipReferralRefresh = false } = {}) {
  const previousMultiplier = Number(state.user?.pricingMultiplier || 1);
  const previousUserId = state.user?.id || "";
  state.user = user || null;
  const nextMultiplier = Number(state.user?.pricingMultiplier || 1);
  if ((state.user?.id || "") !== previousUserId) {
    if (state.billing) state.billing = { ...state.billing, subscription: null };
    state.galleryUnlocks = [];
    state.galleryUnlocksLoaded = false;
    state.galleryUnlockMessage = "";
    state.referral = null;
    state.referralLoadedUserId = "";
    state.referralLoadedAt = 0;
    state.advancedAssets = [];
    state.advancedAssetsLoaded = false;
    state.advancedAssetPage = 1;
    state.advancedAssetTotal = 0;
    state.advancedAssetTotalPages = 1;
    state.workflow = null;
    state.workflowSelectedNodeId = "video-1";
    state.workflowPickerNodeId = "";
    state.workflowPickerSearch = "";
    state.workflowMessage = "";
    state.workflowLogs = [];
  }
  const accountLabel = state.user
    ? state.user.username
    : t("nav.login");
  if (els.accountMenuLabel) els.accountMenuLabel.textContent = accountLabel;
  applyTenantFeatures();
  if (!isTabAllowed(state.tab)) setTab(tenantDefaultTab());
  renderTokenDisplays();
  renderTopupSummary();
  renderPricing();
  renderAccessGuides();
  renderApiSubtokens();
  renderAdvanced();
  renderAssets();
  renderAccountMenu();
  if (state.tab === "topups") loadTopupRecords(1);
  if (state.tab === "spending") loadSpendingRecords(1);
  if (state.tab === "assets") loadUserAssets();
  if (state.tab === "advanced") loadAdvancedAssets();
  if (state.tab === "access") loadApiSubtokens({ force: true });
  if (state.tab === "referral" && !state.user) renderReferral();
  if (state.tab === "characters") {
    renderCharactersPanel();
    if (state.user) loadMyCharacters({ silent: true }).catch(() => {});
    loadUserAssets(state.userAssetsPage || 1).catch(() => {});
    if (state.activeGalleryCharacterId) loadGalleryUnlocks();
  }
  if (refreshHistory && state.tab === "history") loadHistory();
  if (previousMultiplier !== nextMultiplier) {
    state.advancedEstimate = null;
    state.advancedEstimateKey = "";
    loadPlatformEstimates();
    updateAdvancedButtonCost();
    renderPricing();
  }
  syncTopupAutoRefresh();
}

function maskToken(token = "") {
  const value = String(token || "");
  if (!value) return "";
  if (value.length <= 12) return `${value.slice(0, 3)}...${value.slice(-3)}`;
  return `${value.slice(0, 8)}...${value.slice(-6)}`;
}

function currentTokenLabel(showFull = false) {
  const token = state.user?.apiToken || "";
  if (!state.token || !state.user || !token) return t("access.tokenLogin");
  return showFull ? token : maskToken(token);
}

function hydrateAccessCopy(copy = "", { revealToken = false } = {}) {
  const token = state.token && state.user?.apiToken ? state.user.apiToken : "<user-token>";
  const tokenLabel = token !== "<user-token>" ? (revealToken ? token : maskToken(token)) : "<user-token>";
  const rawCopy = String(copy || "");
  const staleAccessCopy = /api\/platform\/generate/i.test(rawCopy)
    || (/api\/advanced\/generate/i.test(rawCopy) && /Seedance|Vipeak 2/i.test(rawCopy));
  const source = staleAccessCopy
    ? LIVE_HTTP_ACCESS_COPY
    : (copy || PUBLIC_COPY.accessCopy);
  return tenantScopedAccessText(source).replaceAll("<user-token>", tokenLabel);
}

function fullAccessCopy() {
  return hydrateAccessCopy(activeAccessGuide.copy, { revealToken: true });
}

function allParameterDocsMarkdown({ revealToken = false } = {}) {
  const token = state.token && state.user?.apiToken ? state.user.apiToken : "<user-token>";
  const markdown = ACCESS_PARAM_GUIDES
    .map((guide) => accessDocMarkdown(accessDoc(guide)))
    .join("\n\n---\n\n");
  return revealToken ? markdown.replaceAll("<user-token>", token) : markdown;
}

async function fetchLatestModelDocsMarkdown({ revealToken = false } = {}) {
  const token = state.token && state.user?.apiToken ? state.user.apiToken : "<user-token>";
  const docsUrl = PARAM_DOC_MARKDOWN_URL || apiUrl("/docs/models.md");
  try {
    const response = await fetch(docsUrl, { cache: "no-store" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const markdown = await response.text();
    if (markdown && markdown.trim()) {
      const scoped = tenantScopedAccessText(markdown);
      return revealToken ? scoped.replaceAll("<user-token>", token) : scoped;
    }
  } catch (error) {
    console.warn("[access-docs-copy-fallback]", error?.message || error);
  }
  return allParameterDocsMarkdown({ revealToken });
}

async function tokenAccessPackageMarkdown() {
  const token = state.token && state.user?.apiToken ? state.user.apiToken : "<user-token>";
  const baseUrl = API_ORIGIN || window.location.origin || "";
  const docsUrl = PARAM_DOC_MARKDOWN_URL || apiUrl("/docs/models.md");
  const modelsJsonUrl = apiUrl("/api/models");
  const taskUrl = apiUrl("/api/v3/contents/generations/tasks/<taskId>");
  const seedreamImageUrl = apiUrl("/api/v3/images/generations");
  const modelDocs = await fetchLatestModelDocsMarkdown({ revealToken: true });
  return [
    "# Vipeak AI API Access Package",
    "",
    `Base URL: ${baseUrl}`,
    `API Token: ${token}`,
    `Full parameter docs: ${docsUrl}`,
    `Models JSON: ${modelsJsonUrl}`,
    `Task API: ${taskUrl}`,
    "",
    "This package includes the production token plus the core docs a client needs to integrate without extra clarification.",
    "",
    "## Supported Endpoints",
    "",
    `- Seedance V3 generate: ${apiUrl("/api/v3/contents/generations/tasks")}`,
    `- Seedream 5.0 image generate: ${seedreamImageUrl}`,
    `- V3 task detail: ${taskUrl}`,
    `- BytePlus-compatible asset upload: ${apiUrl("/?Action=CreateAsset&Version=2024-01-01")}`,
    "",
    "Preferred path: Seedance video uses `/api/v3/contents/generations/tasks`; Seedream image uses `/api/v3/images/generations`; both return a task id and use `/api/v3/contents/generations/tasks/<taskId>` for progress and results.",
    "",
    "## Quick Start",
    "",
    "```http",
    hydrateAccessCopy(LIVE_HTTP_ACCESS_COPY, { revealToken: true }).trim(),
    "```",
    "",
    "## Detailed Parameters",
    "",
    modelDocs.trim(),
    "",
  ].join("\n");
}

function apiSubtokenStatusLabel(token = {}) {
  const status = String(token.status || "").toLowerCase();
  if (status === "revoked") return t("access.subtokenRevoked");
  if (status === "expired") return t("access.subtokenExpired");
  return t("access.subtokenActive");
}

function apiSubtokenQuotaLabel(token = {}) {
  const quotaType = String(token.quotaType || "") === "count" ? "count" : "amount";
  const unit = quotaType === "count" ? t("access.subtokenCount") : t("common.credits");
  return `${formatCredits(token.remaining)} / ${formatCredits(token.quotaLimit)} ${unit}`;
}

function apiSubtokenUsedLabel(token = {}) {
  if (String(token.quotaType || "") === "count") {
    return `${formatCredits(token.usedCount || 0)} ${t("access.subtokenCount")}`;
  }
  return `${formatCredits(token.usedAmount || 0)} ${t("common.credits")}`;
}

function apiSubtokenRemainingStep(token = {}) {
  return String(token.quotaType || "") === "count" ? "1" : "0.000001";
}

function apiSubtokenRemainingEditLabel(token = {}) {
  return String(token.quotaType || "") === "count"
    ? t("access.subtokenRemainingCountEdit")
    : t("access.subtokenRemainingAmountEdit");
}

function apiSubtokenExpiresInputValue(value = "") {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const offsetMs = date.getTimezoneOffset() * 60 * 1000;
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16);
}

function renderApiSubtokens() {
  if (!els.accessSubtokens) return;
  if (!tenantFeature("apiAccess", true)) {
    els.accessSubtokens.innerHTML = "";
    return;
  }
  if (!state.user) {
    els.accessSubtokens.innerHTML = `
      <article class="access-doc-card access-subtoken-card">
        <div class="access-doc-head">
          <div>
            <span class="copy-kicker"><i data-lucide="key-round"></i>${escapeHtml(t("access.subtokensTitle"))}</span>
            <p>${escapeHtml(t("access.subtokensLogin"))}</p>
          </div>
        </div>
      </article>
    `;
    refreshIcons();
    return;
  }

  const created = state.createdApiSubtoken;
  const rows = (state.apiSubtokens || []).map((token) => `
    <article class="subtoken-row ${token.active ? "" : "is-disabled"}">
      <div class="subtoken-main">
        <strong>${escapeHtml(token.name || token.id)}</strong>
        <code>${escapeHtml(token.tokenPreview || maskToken(token.token || ""))}</code>
      </div>
      <div class="subtoken-metrics">
        <span><small>${escapeHtml(t("access.subtokenRemaining"))}</small><b>${escapeHtml(apiSubtokenQuotaLabel(token))}</b></span>
        <span><small>${escapeHtml(t("access.subtokenUsed"))}</small><b>${escapeHtml(apiSubtokenUsedLabel(token))}</b></span>
        <span><small>${escapeHtml(t("access.subtokenStatus"))}</small><b>${escapeHtml(apiSubtokenStatusLabel(token))}</b></span>
        <span><small>${escapeHtml(t("access.subtokenLastUsed"))}</small><b>${escapeHtml(token.lastUsedAt ? formatDateTime(token.lastUsedAt) : t("access.subtokenNever"))}</b></span>
      </div>
      <form class="subtoken-edit" id="subtoken-edit-${escapeHtml(token.id)}" data-edit-subtoken="${escapeHtml(token.id)}">
        <label class="field"><span>${escapeHtml(apiSubtokenRemainingEditLabel(token))}</span><input name="remaining" type="number" min="0" step="${escapeHtml(apiSubtokenRemainingStep(token))}" value="${escapeHtml(formatCredits(token.remaining || 0))}" ${token.revokedAt ? "disabled" : ""} /></label>
        <label class="field"><span>${escapeHtml(t("access.subtokenExpires"))}</span><input name="expiresAt" type="datetime-local" value="${escapeHtml(apiSubtokenExpiresInputValue(token.expiresAt))}" ${token.revokedAt ? "disabled" : ""} /></label>
      </form>
      <div class="subtoken-actions">
        <button class="ghost-button" type="button" disabled><i data-lucide="lock-keyhole"></i>${escapeHtml(t("access.subtokenMasked"))}</button>
        <button class="ghost-button" type="submit" form="subtoken-edit-${escapeHtml(token.id)}" data-save-subtoken="${escapeHtml(token.id)}" ${token.revokedAt ? "disabled" : ""}><i data-lucide="save"></i>${escapeHtml(t("access.subtokenSave"))}</button>
        <button class="ghost-button danger-link" type="button" data-revoke-subtoken="${escapeHtml(token.id)}" ${token.active ? "" : "disabled"}><i data-lucide="ban"></i>${escapeHtml(t("access.subtokenRevoke"))}</button>
      </div>
    </article>
  `).join("");

  els.accessSubtokens.innerHTML = `
    <article class="access-doc-card access-subtoken-card">
      <div class="access-doc-head subtoken-head">
        <div>
          <span class="copy-kicker"><i data-lucide="key-round"></i>${escapeHtml(t("access.subtokensTitle"))}</span>
          <p>${escapeHtml(t("access.subtokensDesc"))}</p>
        </div>
        <button class="ghost-button" type="button" id="refreshSubtokensBtn" ${state.apiSubtokensLoading ? "disabled" : ""}><i data-lucide="refresh-cw"></i>${escapeHtml(t("history.refresh"))}</button>
      </div>
      <form class="subtoken-create" id="subtokenCreateForm">
        <label class="field"><span>${escapeHtml(t("access.subtokenName"))}</span><input id="subtokenName" type="text" maxlength="80" placeholder="${escapeHtml(t("access.subtokenNamePlaceholder"))}" required /></label>
        <label class="field"><span>${escapeHtml(t("access.subtokenQuotaType"))}</span><select id="subtokenQuotaType"><option value="amount">${escapeHtml(t("access.subtokenAmount"))}</option><option value="count">${escapeHtml(t("access.subtokenCount"))}</option></select></label>
        <label class="field"><span>${escapeHtml(t("access.subtokenQuota"))}</span><input id="subtokenQuotaLimit" type="number" min="0.000001" step="0.000001" placeholder="${escapeHtml(t("access.subtokenQuotaPlaceholder"))}" required /></label>
        <label class="field"><span>${escapeHtml(t("access.subtokenExpires"))}</span><input id="subtokenExpiresAt" type="datetime-local" /></label>
        <button class="copy-btn" type="submit" ${state.apiSubtokensLoading ? "disabled" : ""}><i data-lucide="plus"></i>${escapeHtml(t("access.createSubtoken"))}</button>
      </form>
      ${created?.token ? `
        <div class="subtoken-created">
          <div>
            <strong>${escapeHtml(t("access.subtokenCreated"))}</strong>
            <code>${escapeHtml(created.token)}</code>
          </div>
          <button class="copy-btn" type="button" data-copy-created-subtoken="${escapeHtml(created.token)}"><i data-lucide="copy"></i>${escapeHtml(t("access.subtokenCopyNew"))}</button>
        </div>
      ` : ""}
      ${state.apiSubtokenMessage ? `<p class="job-note subtoken-message">${escapeHtml(state.apiSubtokenMessage)}</p>` : ""}
      <div class="subtoken-list">
        ${state.apiSubtokensLoading ? `<div class="job-note">${escapeHtml(t("assets.loading"))}</div>` : (rows || `<div class="job-note">${escapeHtml(t("access.subtokenEmpty"))}</div>`)}
      </div>
    </article>
  `;

  els.accessSubtokens.querySelector("#refreshSubtokensBtn")?.addEventListener("click", () => loadApiSubtokens({ force: true }));
  els.accessSubtokens.querySelector("#subtokenCreateForm")?.addEventListener("submit", submitApiSubtokenCreate);
  els.accessSubtokens.querySelectorAll("[data-copy-created-subtoken]").forEach((button) => {
    button.addEventListener("click", async () => {
      const token = button.dataset.copyCreatedSubtoken || "";
      if (!token) return;
      await navigator.clipboard.writeText(token);
      button.innerHTML = `<i data-lucide="check"></i>${escapeHtml(t("access.subtokenCopiedShort"))}`;
      refreshIcons();
      window.setTimeout(() => renderApiSubtokens(), 1400);
    });
  });
  els.accessSubtokens.querySelectorAll("[data-revoke-subtoken]").forEach((button) => {
    button.addEventListener("click", () => revokeApiSubtoken(button.dataset.revokeSubtoken || "", button));
  });
  els.accessSubtokens.querySelectorAll("[data-edit-subtoken]").forEach((form) => {
    form.addEventListener("submit", submitApiSubtokenUpdate);
  });
  refreshIcons();
}

async function loadApiSubtokens({ force = false } = {}) {
  if (!tenantFeature("apiAccess", true) || !state.user || !els.accessSubtokens) {
    state.apiSubtokens = [];
    state.apiSubtokensLoaded = false;
    renderApiSubtokens();
    return;
  }
  if (state.apiSubtokensLoading || (state.apiSubtokensLoaded && !force)) {
    renderApiSubtokens();
    return;
  }
  state.apiSubtokensLoading = true;
  state.apiSubtokenMessage = "";
  renderApiSubtokens();
  try {
    const payload = await requestJson("/api/access/subtokens");
    state.apiSubtokens = payload.subtokens || [];
    state.apiSubtokensLoaded = true;
  } catch (error) {
    state.apiSubtokenMessage = t("access.subtokenLoadFailed", { message: error.message || String(error) });
  } finally {
    state.apiSubtokensLoading = false;
    renderApiSubtokens();
  }
}

async function submitApiSubtokenCreate(event) {
  event.preventDefault();
  if (!tenantFeature("apiAccess", true)) return;
  if (!state.user) return openLogin();
  const root = els.accessSubtokens;
  const name = root?.querySelector("#subtokenName")?.value.trim() || "";
  const quotaType = root?.querySelector("#subtokenQuotaType")?.value || "amount";
  const quotaLimit = Number(root?.querySelector("#subtokenQuotaLimit")?.value || 0);
  const expiresInput = root?.querySelector("#subtokenExpiresAt")?.value || "";
  const expiresAt = expiresInput ? new Date(expiresInput).toISOString() : "";
  if (!name || !Number.isFinite(quotaLimit) || quotaLimit <= 0) return;
  state.apiSubtokensLoading = true;
  state.apiSubtokenMessage = "";
  renderApiSubtokens();
  try {
    const payload = await requestJson("/api/access/subtokens", {
      method: "POST",
      body: { name, quotaType, quotaLimit, expiresAt },
    });
    state.createdApiSubtoken = payload.subtoken || null;
    state.apiSubtokens = payload.subtoken
      ? [payload.subtoken, ...(state.apiSubtokens || []).filter((token) => token.id !== payload.subtoken.id)]
      : state.apiSubtokens;
    state.apiSubtokensLoaded = true;
    state.apiSubtokenMessage = "";
  } catch (error) {
    state.apiSubtokenMessage = t("access.subtokenCreateFailed", { message: error.message || String(error) });
  } finally {
    state.apiSubtokensLoading = false;
    renderApiSubtokens();
  }
}

async function revokeApiSubtoken(tokenId, button = null) {
  if (!tenantFeature("apiAccess", true)) return;
  if (!tokenId) return;
  const originalHtml = button?.innerHTML || "";
  if (button) {
    button.disabled = true;
    button.innerHTML = `<i data-lucide="loader-circle"></i>${escapeHtml(t("access.subtokenRevoke"))}`;
    refreshIcons();
  }
  try {
    const payload = await requestJson(`/api/access/subtokens/${encodeURIComponent(tokenId)}`, { method: "DELETE" });
    state.apiSubtokens = (state.apiSubtokens || []).map((token) => token.id === tokenId ? (payload.subtoken || token) : token);
    state.apiSubtokenMessage = "";
  } catch (error) {
    state.apiSubtokenMessage = t("access.subtokenRevokeFailed", { message: error.message || String(error) });
  } finally {
    if (button) {
      button.disabled = false;
      button.innerHTML = originalHtml;
    }
    renderApiSubtokens();
  }
}

async function submitApiSubtokenUpdate(event) {
  event.preventDefault();
  if (!tenantFeature("apiAccess", true)) return;
  const form = event.currentTarget;
  const tokenId = form?.dataset?.editSubtoken || "";
  if (!tokenId) return;
  const remainingInput = form.querySelector("[name='remaining']");
  const expiresInput = form.querySelector("[name='expiresAt']");
  const remaining = Number(remainingInput?.value || 0);
  if (!Number.isFinite(remaining) || remaining < 0) return;
  const expiresAt = expiresInput?.value ? new Date(expiresInput.value).toISOString() : "";
  const button = Array.from(els.accessSubtokens?.querySelectorAll("[data-save-subtoken]") || [])
    .find((item) => item.dataset.saveSubtoken === tokenId);
  const originalHtml = button?.innerHTML || "";
  if (button) {
    button.disabled = true;
    button.innerHTML = `<i data-lucide="loader-circle"></i>${escapeHtml(t("access.subtokenSave"))}`;
    refreshIcons();
  }
  try {
    const payload = await requestJson(`/api/access/subtokens/${encodeURIComponent(tokenId)}`, {
      method: "PATCH",
      body: { remaining, expiresAt },
    });
    state.apiSubtokens = (state.apiSubtokens || []).map((token) => token.id === tokenId ? (payload.subtoken || token) : token);
    state.apiSubtokenMessage = "";
  } catch (error) {
    state.apiSubtokenMessage = t("access.subtokenUpdateFailed", { message: error.message || String(error) });
  } finally {
    if (button) {
      button.disabled = false;
      button.innerHTML = originalHtml;
    }
    renderApiSubtokens();
  }
}

function renderTokenDisplays() {
  const apiAccessEnabled = tenantFeature("apiAccess", true);
  if (els.accessTokenDisplay) {
    els.accessTokenDisplay.textContent = currentTokenLabel(state.showAccessToken);
  }
  if (els.accessTokenHint) {
    els.accessTokenHint.textContent = state.user
      ? t("access.tokenHintUser")
      : t("access.tokenHintGuest");
  }
  if (els.toggleAccessTokenBtn) {
    els.toggleAccessTokenBtn.textContent = state.showAccessToken ? t("common.hide") : t("common.showFull");
    els.toggleAccessTokenBtn.disabled = !state.token || !state.user;
  }
  if (els.copyTokenBtn) {
    els.copyTokenBtn.disabled = !state.token || !state.user?.apiToken;
    els.copyTokenBtn.hidden = !apiAccessEnabled;
    els.copyTokenBtn.innerHTML = `<i data-lucide="key-round"></i>Copy token + docs`;
  }
  const accountTokenBox = els.accountToken?.closest(".token-box");
  if (accountTokenBox) accountTokenBox.hidden = !apiAccessEnabled;
  if (els.supportFab) {
    els.supportFab.hidden = !state.user;
  }
  if (els.accountName) els.accountName.textContent = state.user?.username || t("account.title");
  if (els.accountCredits) els.accountCredits.textContent = String(Number(state.user?.credits || 0));
  if (els.menuBalanceValue) els.menuBalanceValue.textContent = String(Number(state.user?.credits || 0));
  if (els.mobileDrawerUserName) els.mobileDrawerUserName.textContent = state.user?.username || t("nav.login");
  if (els.mobileDrawerCredits) {
    els.mobileDrawerCredits.hidden = !state.user;
    els.mobileDrawerCredits.textContent = state.user ? `${Number(state.user?.credits || 0)} credits` : "";
  }
  if (els.accountRole) els.accountRole.textContent = state.user?.role || "user";
  if (els.accountToken) els.accountToken.textContent = currentTokenLabel(state.showAccountToken);
  if (els.toggleAccountTokenBtn) {
    els.toggleAccountTokenBtn.textContent = state.showAccountToken ? t("common.hide") : t("common.showFull");
    els.toggleAccountTokenBtn.disabled = !state.token || !state.user?.apiToken;
    els.toggleAccountTokenBtn.hidden = !apiAccessEnabled;
  }
  if (els.copyAccountTokenBtn) {
    els.copyAccountTokenBtn.disabled = !state.token || !state.user?.apiToken;
    els.copyAccountTokenBtn.hidden = !apiAccessEnabled;
  }
}

function renderAccountMenu() {
  const loggedIn = Boolean(state.user);
  const apiAccessEnabled = tenantFeature("apiAccess", true);
  if (els.menuBalance) els.menuBalance.hidden = !loggedIn;
  if (els.topupHeadBtn) els.topupHeadBtn.hidden = !loggedIn;
  if (els.topupTriggerBtn) els.topupTriggerBtn.hidden = !loggedIn;
  if (els.mobileDrawerTopupBtn) els.mobileDrawerTopupBtn.hidden = !loggedIn;
  if (els.mobileDrawerUser) els.mobileDrawerUser.hidden = !loggedIn;
  if (els.mobileDrawerLoginBtn) els.mobileDrawerLoginBtn.hidden = loggedIn;
  document.querySelectorAll(".account-menu [data-tab]").forEach((button) => {
    button.hidden = !isTabAllowed(button.dataset.tab || "") || (!loggedIn && button.dataset.tab !== "pricing");
  });
  if (els.menuLoginBtn) els.menuLoginBtn.hidden = loggedIn;
  if (els.menuCopyTokenBtn) els.menuCopyTokenBtn.disabled = !state.token || !state.user?.apiToken;
  if (els.menuCopyTokenBtn) els.menuCopyTokenBtn.hidden = !apiAccessEnabled || !loggedIn;
  if (els.menuLogoutBtn) {
    els.menuLogoutBtn.hidden = !loggedIn;
    els.menuLogoutBtn.disabled = !loggedIn;
  }
}

function closeAccountMenu() {
  if (els.accountMenu) els.accountMenu.hidden = true;
  document.querySelectorAll(".account-menu [data-tab]").forEach((button) => {
    button.classList.remove("is-active");
  });
}

function toggleAccountMenu() {
  if (!els.accountMenu) return;
  els.accountMenu.hidden = !els.accountMenu.hidden;
  renderAccountMenu();
  refreshIcons();
}

function generationVideoUrl(record) {
  return record?.cdnVideoUrl || record?.localVideoUrl || record?.videoUrl || record?.remoteVideoUrl || "";
}

function generationImageResultUrl(record) {
  return record?.cdnImageUrl || record?.imageResultUrl || record?.localImageUrl || record?.remoteImageUrl || "";
}

function generationImageResultUrls(record = {}) {
  return [...new Set([
    ...(Array.isArray(record.cdnImageUrls) ? record.cdnImageUrls : []),
    ...(Array.isArray(record.imageResultUrls) ? record.imageResultUrls : []),
    ...(Array.isArray(record.localImageUrls) ? record.localImageUrls : []),
    ...(Array.isArray(record.remoteImageUrls) ? record.remoteImageUrls : []),
    generationImageResultUrl(record),
  ].map((item) => String(item || "").trim()).filter(Boolean))];
}

function generationPosterUrl(record) {
  return record?.cdnPosterUrl || record?.posterUrl || record?.localPosterUrl || generationImageResultUrl(record) || "";
}

function generationRecordDownloadHref(record = {}) {
  const cdnUrl = record?.cdnVideoUrl || record?.cdnImageUrl || "";
  const mediaUrl = cdnUrl || generationVideoUrl(record) || generationImageResultUrl(record) || record?.downloadUrl || "";
  if (mediaUrl) return mediaUrl;
  const taskId = String(record?.taskId || "").trim();
  return taskId && !taskId.startsWith("pending-")
    ? `/api/generation-records/${encodeURIComponent(taskId)}/download`
    : "";
}

function generationRecordDownloadName(record = {}) {
  const taskId = String(record?.taskId || "generation").replace(/[^a-z0-9_-]/gi, "_") || "generation";
  const resultUrl = generationVideoUrl(record) || generationImageResultUrl(record) || record?.downloadUrl || "";
  const cleanPath = String(resultUrl || "").split("?")[0].toLowerCase();
  const match = cleanPath.match(/\.(mp4|webm|mov|m4v|png|jpe?g|webp|bmp)$/i);
  return `${taskId}${match ? match[0] : (generationVideoUrl(record) ? ".mp4" : ".png")}`;
}

function canDownloadGenerationRecord(record = {}) {
  return Boolean(generationRecordDownloadHref(record) && (generationVideoUrl(record) || generationImageResultUrl(record) || record?.downloadUrl));
}

function triggerBrowserDownload(href, fileName, options = {}) {
  const link = document.createElement("a");
  link.href = href;
  link.download = fileName;
  link.rel = "noopener";
  if (options.newTab) link.target = "_blank";
  document.body.appendChild(link);
  link.click();
  link.remove();
}

function generationRecordDownloadFetchHref(href = "") {
  const value = String(href || "");
  if (!/^https:\/\/media\.123vips\.com\//i.test(value)) return value;
  try {
    const url = new URL(value);
    url.searchParams.set("download", "1");
    return url.toString();
  } catch {
    return value;
  }
}

async function saveDownloadFromFetch(href = "", fileName = "generation") {
  const headers = {};
  if (state.token && href.startsWith("/api/")) headers.authorization = `Bearer ${state.token}`;
  const fetchHref = generationRecordDownloadFetchHref(href);
  const response = await fetch(fetchHref, {
    headers,
    credentials: fetchHref.startsWith("/") ? "same-origin" : "omit",
  });
  if (!response.ok) throw new Error(`Download failed: ${response.status}`);
  const blob = await response.blob();
  const objectUrl = URL.createObjectURL(blob);
  triggerBrowserDownload(objectUrl, fileName);
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 30000);
}

async function downloadGenerationRecord(record = {}) {
  let href = generationRecordDownloadHref(record);
  if (!href) return;
  let fileName = generationRecordDownloadName(record);
  const taskId = String(record?.taskId || "").trim();
  const legacyHref = taskId && !taskId.startsWith("pending-")
    ? `/api/generation-records/${encodeURIComponent(taskId)}/download`
    : "";
  if (taskId && !taskId.startsWith("pending-")) {
    try {
      const payload = await requestJson(`/api/generation-records/${encodeURIComponent(taskId)}/download-url`);
      if (payload.url) {
        href = payload.url;
        fileName = payload.fileName || fileName;
      }
    } catch {
      // Fall through to the public URL or legacy download endpoint.
    }
  }
  try {
    await saveDownloadFromFetch(href, fileName);
  } catch {
    if (legacyHref && legacyHref !== href) {
      try {
        await saveDownloadFromFetch(legacyHref, fileName);
      } catch {
        // Keep the click on the current page; do not open a preview tab.
      }
    }
  }
}

function stripModelParams(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value || null;
  const next = { ...value };
  ["model", "provider", "modelProvider", "model_provider"].forEach((key) => delete next[key]);
  return next;
}

function mediaAssetPreviewUrl(asset = {}) {
  return asset.imageUrl || asset.videoUrl || asset.localUrl || asset.url || asset.sourceImageUrl || "";
}

function mediaAssetLabel(asset = {}, index = 0) {
  const type = String(asset.type || asset.key || "").replace(/_/g, " ");
  if (asset.type === "first_frame" || asset.key === "firstFrame") return "First frame";
  if (asset.type === "last_frame" || asset.key === "lastFrame") return "Last frame";
  if (asset.type === "reference_video") return "Video 1";
  if (asset.type === "first_clip") return "First clip";
  if (asset.type === "reference_image") return `Reference ${index + 1}`;
  return type || `Image ${index + 1}`;
}

function recordImageAssets(record = {}) {
  const images = [];
  const seen = new Set();
  const pushImage = (asset = {}, fallbackLabel = "") => {
    const url = mediaAssetPreviewUrl(asset);
    if (!url || seen.has(url)) return;
    seen.add(url);
    images.push({ ...asset, label: asset.label || fallbackLabel || mediaAssetLabel(asset, images.length) });
  };
  (Array.isArray(record.mediaAssets) ? record.mediaAssets : [])
    .filter((asset) => !["driving_audio", "first_clip"].includes(asset.type))
    .forEach((asset) => pushImage(asset));
  pushImage({ imageUrl: record.imageUrl, type: "reference_image" }, "Reference");
  pushImage({ imageUrl: record.sourceImageUrl, type: "source_image" }, "Source image");
  return images;
}

function recordVideoAssets(record = {}) {
  return (Array.isArray(record.mediaAssets) ? record.mediaAssets : [])
    .filter((asset) => ["reference_video", "first_clip"].includes(asset.type))
    .map((asset, index) => ({
      ...asset,
      label: asset.label || (asset.type === "first_clip" ? "First clip" : `Video ${index + 1}`),
      videoUrl: asset.videoUrl || asset.url || asset.localUrl || "",
    }))
    .filter((asset) => asset.videoUrl);
}

function generationRecordSignature(record = {}) {
  const billing = record.billing || {};
  return [
    record.taskId,
    record.updatedAt,
    record.status,
    generationVideoUrl(record),
    record.error,
    record.ratio,
    record.resolution,
    record.duration,
    generationImageResultUrl(record),
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

function statusLabel(status) {
  const value = String(status || "").toLowerCase();
  if (["succeeded", "success", "done", "completed"].includes(value)) return t("status.completed");
  if (["cancelled", "canceled"].includes(value)) return "Canceled";
  if (["failed", "error"].includes(value)) return t("status.failed");
  if (["running", "processing", "in_progress", "preparing", "submitting", "queued"].includes(value)) return t("status.processing");
  return status || t("status.submitted");
}

function openMobileDrawer() {
  if (document.querySelector("dialog[open]")) return;
  document.body.classList.add("mobile-drawer-open");
  if (els.mobileDrawerToggle) els.mobileDrawerToggle.setAttribute("aria-expanded", "true");
  if (els.mobileDrawerBackdrop) els.mobileDrawerBackdrop.hidden = false;
}

function closeMobileDrawer() {
  document.body.classList.remove("mobile-drawer-open");
  if (els.mobileDrawerToggle) els.mobileDrawerToggle.setAttribute("aria-expanded", "false");
  if (els.mobileDrawerBackdrop) els.mobileDrawerBackdrop.hidden = true;
}

function toggleMobileDrawer() {
  if (document.body.classList.contains("mobile-drawer-open")) closeMobileDrawer();
  else openMobileDrawer();
}

function statusClass(status) {
  const value = String(status || "").toLowerCase();
  if (["succeeded", "success", "done", "completed"].includes(value)) return "succeeded";
  if (["failed", "error", "cancelled", "canceled"].includes(value)) return "failed";
  if (["preparing", "submitting", "running", "processing", "in_progress", "queued"].includes(value)) return "running";
  return "submitted";
}

function isSucceededGenerationStatus(status) {
  return statusClass(status) === "succeeded";
}

function isTerminalGenerationStatus(status) {
  const value = String(status || "").toLowerCase();
  return ["succeeded", "success", "done", "completed", "failed", "error", "cancelled", "canceled"].includes(value);
}

function billingLabel(billing = {}) {
  const pre = Number(billing.preDeducted || 0);
  const final = billing.final === null || billing.final === undefined ? null : Number(billing.final || 0);
  if (billing.status === "settle_pending_insufficient") return t("billing.pending", { pre, final });
  if (billing.settled && final !== null) return t("billing.final", { pre, final });
  return pre > 0 ? t("billing.prepaid", { pre }) : t("billing.noCharge");
}

function formatCredits(value) {
  const next = Number(value);
  if (!Number.isFinite(next)) return "";
  return Number.isInteger(next) ? String(next) : next.toFixed(4).replace(/0+$/, "").replace(/\.$/, "");
}

function creditsAmount(value) {
  const next = Number(value);
  if (!Number.isFinite(next)) return 0;
  return Math.max(0, Math.round(next * 10000) / 10000);
}

function userPricingMultiplier() {
  const next = Number(state.user?.pricingMultiplier || 1);
  if (!Number.isFinite(next) || next <= 0) return 1;
  return Math.max(0.01, Math.min(100, next));
}

function formatDurationSeconds(value) {
  const next = Number(value);
  if (!Number.isFinite(next) || next <= 0) return "";
  return t("cost.seconds", { value: Number.isInteger(next) ? next : next.toFixed(1).replace(/0+$/, "").replace(/\.$/, "") });
}

function formatDateTime(value) {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString();
}

function templateCostLabel(templateId) {
  const estimate = state.estimates?.[templateId];
  if (!estimate) return t("cost.checking");
  if (estimate.available === false || estimate.credits === null || estimate.credits === undefined) return t("cost.unavailable");
  const duration = formatDurationSeconds(estimate.durationSeconds);
  const credits = formatCredits(estimate.credits);
  return duration ? `${t("cost.credits", { credits })} · ${duration}` : t("cost.credits", { credits });
}

function templateGenerateLabel(templateId) {
  return t("template.generate", { cost: templateCostLabel(templateId) });
}

function templateActionLabel(template = {}) {
  if (template.action === "advanced" || template.targetTab === "advanced") {
    return template.buttonLabel || "Advanced";
  }
  return templateGenerateLabel(template.id);
}

function updateSubmitButtonCost() {
  if (!els.submitTemplateBtn) return;
  const templateId = state.activeTemplate?.id || "";
  els.submitTemplateBtn.innerHTML = `<i data-lucide="wand-sparkles"></i>${escapeHtml(templateGenerateLabel(templateId))}`;
  refreshIcons();
}

function advancedCaseDuration(item = {}) {
  const params = item.params && typeof item.params === "object" ? item.params : {};
  const bounds = advancedDurationBounds(advancedCaseProvider(item));
  const duration = Number(params.duration ?? item.duration ?? 5);
  if (!Number.isFinite(duration)) return bounds.fallback;
  return Math.min(bounds.max, Math.max(bounds.min, duration));
}

function normalizeAdvancedProvider(value = "") {
  const normalized = String(value || "").trim().toLowerCase().replace(/[\s_-]+/g, "");
  if (!normalized) return DEFAULT_ADVANCED_PROVIDER;
  if (["qwenimage3", "qwenimage30", "qwenimage3pro", "qwenimage30pro"].includes(normalized) || normalized.includes("qwenimage3.0")) return "qwen-image3";
  if (["seedream", "seedream5", "seedream50", "seedreamimage", "seedream5image", "seedream50image", "seedream5img", "seedream5imageedit"].includes(normalized) || normalized.includes("seedream5") || normalized.includes("seedream50")) return "seedream5-image";
  if (["seedance25", "seedance2.5", "seedancev25"].includes(normalized) || normalized.includes("seedance25") || normalized.includes("seedance2.5")) return "seedance25";
  if (["wan27imageedit", "wan2.7imageedit", "wanimageedit", "imageedit", "wan27image", "vipeak1image", "vipeak1imageedit"].includes(normalized)) return "wan27-image-edit";
  if (["wan30", "wan3", "wan3.0", "wan3video", "wan3.0video"].includes(normalized) || normalized.includes("wan30") || normalized.includes("wan3.0")) return "wan30";
  if (normalized.includes("happyhorse") || normalized === "horse" || normalized === "hh") return "happyhorse";
  if (normalized.startsWith("wananimate") || normalized === "wanlegacy") return "wan27";
  if (["wan27", "wan2.7", "wan", "vipeak1", "vp1"].includes(normalized)) return "wan27";
  if (["seedance", "vipeak2", "vp2"].includes(normalized)) return "seedance";
  return normalized.includes("vipeak1") || normalized.includes("wan27") || normalized.includes("wan2.7") ? "wan27" : "seedance";
}

function advancedProviderLabel(provider = currentAdvancedProvider()) {
  const normalized = normalizeAdvancedProvider(provider);
  const capability = currentAdvancedVideoCapability(provider);
  if (normalized === "qwen-image3") return "Qwen Image 3.0";
  if (normalized === "seedream5-image") return "Seedream 5.0 Image";
  if (normalized === "wan27-image-edit") return "Wan 2.7 Image";
  if (normalized === "wan30") return "Wan 3.0";
  if (normalized === "seedance25") return "Seedance 2.5";
  const labels = {
    "wan27-t2v": "Wan 2.7 - Text to Video",
    "wan27-i2v": "Wan 2.7 - Image to Video",
    "wan27-r2v": "Wan 2.7 - Reference to Video",
    "wan27-video-edit": "Wan 2.7 - Video Edit",
    "wan-legacy": "Wan Legacy",
    "wan-animate-move": "Wan Animate - Image Animation",
    "wan-animate-mix": "Wan Animate - Character Replacement",
    "happyhorse-t2v": "HappyHorse - Text to Video",
    "happyhorse-i2v": "HappyHorse - Image to Video",
    "happyhorse-r2v": "HappyHorse - Reference to Video",
    "happyhorse-video-edit": "HappyHorse - Video Edit",
  };
  if (labels[capability]) return labels[capability];
  if (normalized === "happyhorse") return "HappyHorse";
  return normalized === "wan27" ? "Wan 2.7" : "Seedance 2.0";
}

function prepareModalOpen() {
  closeMobileDrawer();
  closeAccountMenu();
}

const ADVANCED_ALIYUN_VIDEO_CAPABILITIES = new Set([
  "wan30-video",
  "wan27-t2v", "wan27-i2v", "wan27-r2v", "wan27-video-edit", "wan-legacy",
  "wan-animate-move", "wan-animate-mix", "happyhorse-t2v", "happyhorse-i2v",
  "happyhorse-r2v", "happyhorse-video-edit",
]);

const ADVANCED_VIDEO_CAPABILITY_GROUPS = Object.freeze({
  wan30: Object.freeze([
    Object.freeze({ value: "wan30-video", label: "Wan 3.0 Video" }),
  ]),
  wan27: Object.freeze([
    Object.freeze({ value: "wan27-i2v", label: "Image to Video" }),
    Object.freeze({ value: "wan27-t2v", label: "Text to Video" }),
    Object.freeze({ value: "wan27-r2v", label: "Reference to Video" }),
    Object.freeze({ value: "wan27-video-edit", label: "Video Edit" }),
  ]),
  "wan-legacy": Object.freeze([
    Object.freeze({ value: "wan-legacy", label: "Legacy Model" }),
  ]),
  "wan-animate": Object.freeze([
    Object.freeze({ value: "wan-animate-move", label: "Image Animation" }),
    Object.freeze({ value: "wan-animate-mix", label: "Character Replacement" }),
  ]),
  happyhorse: Object.freeze([
    Object.freeze({ value: "happyhorse-i2v", label: "First Frame" }),
    Object.freeze({ value: "happyhorse-t2v", label: "Text Prompt" }),
    Object.freeze({ value: "happyhorse-r2v", label: "Reference Images" }),
    Object.freeze({ value: "happyhorse-video-edit", label: "Source Video + References" }),
  ]),
});

function advancedEngineValue(provider = els.advancedProvider?.value || "", capability = "") {
  const normalizedCapability = String(capability || "").trim().toLowerCase().replace(/[\s_]+/g, "-");
  if (normalizedCapability === "wan-legacy") return "wan-legacy";
  if (["wan-animate-move", "wan-animate-mix"].includes(normalizedCapability)) return "wan-animate";
  if (normalizedCapability.startsWith("happyhorse-")) return "happyhorse";
  if (normalizedCapability.startsWith("wan30-")) return "wan30";
  if (normalizedCapability.startsWith("wan27-")) return "wan27";
  const raw = String(provider || "").trim().toLowerCase().replace(/[\s_]+/g, "-");
  if (["wan-legacy", "wan-animate", "happyhorse", "seedance", "seedance25", "wan30", "wan27", "wan27-image-edit", "seedream5-image", "qwen-image3"].includes(raw)) return raw;
  if (ADVANCED_ALIYUN_VIDEO_CAPABILITIES.has(raw)) return advancedEngineValue("", raw);
  return normalizeAdvancedProvider(provider);
}

function advancedVideoCapabilityOptions(engine = advancedEngineValue()) {
  return ADVANCED_VIDEO_CAPABILITY_GROUPS[advancedEngineValue(engine)] || [];
}

function syncAdvancedVideoCapabilityOptions(preferredCapability = "") {
  if (!els.advancedVideoCapability) return;
  const options = advancedVideoCapabilityOptions();
  const current = String(preferredCapability || els.advancedVideoCapability.value || "").trim();
  els.advancedVideoCapability.innerHTML = options
    .map((item) => `<option value="${escapeHtml(item.value)}">${escapeHtml(item.label)}</option>`)
    .join("");
  els.advancedVideoCapability.value = options.some((item) => item.value === current) ? current : (options[0]?.value || "");
  const field = els.advancedVideoCapability.closest(".field");
  field?.toggleAttribute("hidden", options.length <= 1);
  const label = field?.querySelector(":scope > span");
  if (label) label.textContent = "Mode";
}

const ADVANCED_SEEDANCE_MODE_OPTIONS = Object.freeze({
  seedance: Object.freeze([
    Object.freeze({ value: "reference_video", label: "Multimodal References" }),
    Object.freeze({ value: "first_last_frame", label: "First + Last Frame" }),
  ]),
  seedance25: Object.freeze([
    Object.freeze({ value: "omini", label: "Multimodal References" }),
    Object.freeze({ value: "edit", label: "Video Edit" }),
    Object.freeze({ value: "extend", label: "Video Extend" }),
    Object.freeze({ value: "first_last_frame", label: "First + Last Frame" }),
  ]),
  wan30: Object.freeze([
    Object.freeze({ value: "reference_video", label: "Multimodal References" }),
    Object.freeze({ value: "first_last_frame", label: "First + Last Frame" }),
  ]),
});

function syncAdvancedSeedanceModeOptions(provider = currentAdvancedProvider()) {
  if (!els.advancedSeedanceMediaMode) return;
  const normalizedProvider = normalizeAdvancedProvider(provider);
  const options = ADVANCED_SEEDANCE_MODE_OPTIONS[normalizedProvider] || [];
  const current = normalizeSeedanceMediaMode(els.advancedSeedanceMediaMode.value || "");
  els.advancedSeedanceMediaMode.innerHTML = options
    .map((item) => `<option value="${escapeHtml(item.value)}">${escapeHtml(item.label)}</option>`)
    .join("");
  els.advancedSeedanceMediaMode.value = options.some((item) => item.value === current)
    ? current
    : (options[0]?.value || "reference_video");
}

function currentAdvancedVideoCapability(value = els.advancedProvider?.value || "") {
  const normalized = String(value || "").trim().toLowerCase().replace(/[\s_]+/g, "-");
  if (ADVANCED_ALIYUN_VIDEO_CAPABILITIES.has(normalized)) return normalized;
  const options = advancedVideoCapabilityOptions(advancedEngineValue(value));
  const selected = String(els.advancedVideoCapability?.value || "").trim();
  if (options.some((item) => item.value === selected)) return selected;
  if (options.length) return options[0].value;
  return "";
}

function advancedVideoEditUsesSourceDuration(capability = currentAdvancedVideoCapability()) {
  return String(capability || "").trim() === "wan27-video-edit";
}

function advancedVideoInputDurationRule(provider = currentAdvancedProvider(), capability = currentAdvancedVideoCapability()) {
  const normalizedProvider = normalizeAdvancedProvider(provider);
  if (normalizedProvider === "seedance25") return null;
  if (normalizedProvider === "seedance") {
    return { min: 1.8, max: 15.2, displayMin: 2, displayMax: 15 };
  }
  const rules = {
    "wan30-video": { min: 1, max: 15.2, displayMin: 1, displayMax: 15 },
    "wan27-i2v": { min: 1.8, max: 10.2, displayMin: 2, displayMax: 10 },
    "wan27-r2v": { min: 1.8, max: 10.2, displayMin: 2, displayMax: 10 },
    "wan27-video-edit": { min: 1.8, max: 10.2, displayMin: 2, displayMax: 10 },
    "wan-animate-move": { min: 1.8, max: 30.2, displayMin: 2, displayMax: 30 },
    "wan-animate-mix": { min: 1.8, max: 30.2, displayMin: 2, displayMax: 30 },
    "happyhorse-video-edit": { min: 2.8, max: 60.2, displayMin: 3, displayMax: 60 },
    "wan-legacy": { min: 1.8, max: ADVANCED_WAN_CLIP_MAX_SECONDS, displayMin: 2, displayMax: 5 },
  };
  return rules[String(capability || "").trim()] || null;
}

function advancedVideoInputDurationMessage(durationSeconds, provider = currentAdvancedProvider(), capability = currentAdvancedVideoCapability(), { allowUnknown = false } = {}) {
  const seconds = Number(durationSeconds || 0);
  if (!Number.isFinite(seconds) || seconds <= 0) {
    return allowUnknown ? "" : t("advanced.clipDurationUnreadable");
  }
  const rule = advancedVideoInputDurationRule(provider, capability);
  if (!rule || (seconds >= rule.min && seconds <= rule.max)) return "";
  return t("advanced.clipDurationRange", {
    min: rule.displayMin,
    max: rule.displayMax,
  });
}

function publicModelText(value = "") {
  return String(value ?? "")
    .replace(/\/api\/seedance\/characters\/upload/gi, "/api/vipeak2/characters/upload")
    .replace(/\/api\/wan27\/image-edit/gi, "/api/vipeak1/image-edit")
    .replace(/dreamina-seedance-2-0-fast-260128/gi, "vipeak2-fast")
    .replace(/dreamina-seedance-2-0-260128/gi, "vipeak2-standard")
    .replace(/ep-20260721180102-9hm6g/gi, "seedream5-lite")
    .replace(/ep-20260721175949-xw978/gi, "seedream5-pro")
    .replace(/wan2\.7-image-pro/gi, "vipeak1-image")
    .replace(/wan2\.7-i2v-2026-04-25/gi, "vipeak1-video")
    .replace(/Wan2\.7 Image Edit/gi, "Vipeak 1 Image")
    .replace(/Wan2\.7 Image Pro/gi, "Vipeak 1 Image")
    .replace(/Wan2\.7/gi, "Vipeak 1")
    .replace(/\bseedanceMode\b/g, "vipeak2Mode")
    .replace(/\bseedanceTier\b/g, "vipeak2Tier")
    .replace(/\bseedanceReferenceAssetUri\b/g, "vipeak2ReferenceAssetUri")
    .replace(/\bseedanceCharacterAssetUri\b/g, "vipeak2CharacterAssetUri")
    .replace(/\bseedanceReferenceAssetUris\b/g, "vipeak2ReferenceAssetUris")
    .replace(/\bseedance\s+callers\b/gi, "Vipeak 2 callers")
    .replace(/\bseedance\b/g, "vipeak2")
    .replace(/\bwan27-image\b/g, "vipeak1-image")
    .replace(/\bwan27\b/g, "vipeak1")
    .replace(/\bSeedance\b/g, "Vipeak 2");
}

function publicModelKey(key = "") {
  return String(key || "")
    .replace(/seedance/g, "vipeak2")
    .replace(/Seedance/g, "Vipeak2")
    .replace(/wan27Image/g, "vipeak1Image")
    .replace(/wan27/g, "vipeak1")
    .replace(/Wan27/g, "Vipeak1");
}

function advancedCaseProvider(item = {}) {
  const params = item.params && typeof item.params === "object" ? item.params : {};
  return normalizeAdvancedProvider(item.provider || params.provider || params.modelProvider || params.model_provider);
}

function normalizeAdvancedResolution(value = "", provider = "seedance") {
  const raw = String(value || "").trim().toLowerCase();
  if (normalizeAdvancedProvider(provider) === "qwen-image3") return raw === "1k" ? "1K" : "2K";
  if (normalizeAdvancedProvider(provider) === "seedream5-image") return raw === "1k" ? "1K" : "2K";
  if (normalizeAdvancedProvider(provider) === "wan27-image-edit") return raw === "4k" ? "4K" : raw === "1k" ? "1K" : "2K";
  if (normalizeAdvancedProvider(provider) === "wan30") return raw === "480p" ? "480p" : raw === "720p" ? "720p" : "1080p";
  if (["wan27", "happyhorse"].includes(normalizeAdvancedProvider(provider))) return raw === "1080p" ? "1080p" : "720p";
  if (raw === "480p") return "480p";
  if (raw === "4k" || raw === "2160p") return "4k";
  return raw === "1080p" ? "1080p" : "720p";
}

function advancedDurationBounds(provider = "seedance", capability = "") {
  const normalized = normalizeAdvancedProvider(provider);
  if (normalized === "qwen-image3") return { min: 1, max: 1, fallback: 1 };
  if (normalized === "seedream5-image") return { min: 1, max: 1, fallback: 1 };
  if (normalized === "wan27-image-edit") return { min: 1, max: 1, fallback: 1 };
  if (normalized === "wan30") return { min: -1, max: 30, fallback: 5 };
  if (normalized === "seedance25") return { min: 4, max: 30, fallback: 4 };
  const resolvedCapability = capability || (
    typeof currentAdvancedVideoCapability === "function"
    && typeof currentAdvancedProvider === "function"
    && normalizeAdvancedProvider(currentAdvancedProvider()) === normalized
      ? currentAdvancedVideoCapability()
      : ""
  );
  if (resolvedCapability === "wan27-video-edit") return { min: 2, max: 10, fallback: 5 };
  if (resolvedCapability === "wan27-r2v"
    && typeof state !== "undefined"
    && (state.advancedWanClipAssetId || state.advancedWanClipDataUrl || String(els.advancedWanClipUrl?.value || "").trim())) {
    return { min: 2, max: 10, fallback: 5 };
  }
  if (["wan-animate-move", "wan-animate-mix"].includes(resolvedCapability)) return { min: 2, max: 30, fallback: 5 };
  if (normalized === "happyhorse") return { min: 3, max: 15, fallback: 5 };
  return normalized === "wan27"
    ? { min: 2, max: 15, fallback: 5 }
    : { min: 5, max: 15, fallback: 5 };
}

function normalizeVideoRatio(value = "") {
  if (String(value || "").trim().toLowerCase() === "adaptive") return "adaptive";
  const normalized = String(value || "").trim().replace(/[：xX]/g, ":");
  if (/^\d+\s*:\s*\d+$/.test(normalized)) {
    const [width, height] = normalized.split(":").map((part) => Math.max(1, Number(part.trim()) || 1));
    return `${width}:${height}`;
  }
  return "16:9";
}

function ratioStyle(value = "") {
  if (normalizeVideoRatio(value) === "adaptive") return "--video-ratio:16 / 9;--video-ratio-value:1.7777777778;";
  const [width, height] = normalizeVideoRatio(value).split(":").map((part) => Math.max(1, Number(part) || 1));
  return `--video-ratio:${width} / ${height};--video-ratio-value:${width / height};`;
}

function videoPixelDimensions(resolution = "720p", ratio = "16:9") {
  const normalizedResolution = normalizeAdvancedResolution(resolution);
  const shortSide = normalizedResolution === "4k" ? 2160 : normalizedResolution === "1080p" ? 1080 : normalizedResolution === "480p" ? 480 : 720;
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

function positiveDurationSeconds(value, fallback = 0) {
  const next = Number(value);
  if (!Number.isFinite(next) || next <= 0) return Math.max(0, Number(fallback || 0) || 0);
  return Math.round(next * 10000) / 10000;
}

function currentAdvancedAliyunSourceVideoSeconds(fallback = 0) {
  const selectedAsset = state.advancedWanClipAssetId
    ? [...(state.advancedAssets || []), ...(state.userAssets || [])]
      .find((asset) => asset.id === state.advancedWanClipAssetId)
    : null;
  const hasVideo = Boolean(
    state.advancedWanClipAssetId
    || state.advancedWanClipDataUrl
    || String(els.advancedWanClipUrl?.value || "").trim()
  );
  return positiveDurationSeconds(
    state.advancedWanClipDurationSeconds || selectedAsset?.durationSeconds || selectedAsset?.duration,
    hasVideo ? fallback : 0,
  );
}

function selectedSeedanceVideoAsset() {
  const id = state.advancedSeedanceVideoAssetId || "";
  if (!id) return null;
  return (state.userAssets || []).find((asset) => asset.id === id)
    || (state.advancedAssets || []).find((asset) => asset.id === id)
    || (state.assetVideoChoices || []).find((asset) => asset.id === id)
    || null;
}

function currentSeedanceVideoInputSeconds(duration = 5, provider = currentAdvancedProvider()) {
  if (!["seedance", "seedance25"].includes(normalizeAdvancedProvider(provider))) return 0;
  const videoUrlCount = splitUrlList(els.advancedSeedanceVideoUrls?.value || "").length;
  const hasVideoUrl = videoUrlCount > 0;
  const videoRefs = typeof advancedSeedanceVideoReferences === "function" ? advancedSeedanceVideoReferences() : [];
  const selectedAsset = selectedSeedanceVideoAsset();
  const refs = videoRefs.length ? videoRefs : (selectedAsset ? [selectedAsset] : []);
  if (!refs.length && !hasVideoUrl) return 0;
  const assetSeconds = refs.reduce((sum, item) => sum + positiveDurationSeconds(item?.durationSeconds || item?.duration), 0);
  const assetCount = refs.length;
  const fallbackSeconds = positiveDurationSeconds(duration, 5);
  return assetSeconds + (assetCount && !assetSeconds ? fallbackSeconds : 0) + (hasVideoUrl ? fallbackSeconds * videoUrlCount : 0) || fallbackSeconds;
}

function currentSeedanceEstimateReferenceVideoUrls(provider = currentAdvancedProvider()) {
  if (!["seedance", "seedance25"].includes(normalizeAdvancedProvider(provider))) return [];
  const seedanceMode = normalizeSeedanceMediaMode(els.advancedSeedanceMediaMode?.value || "reference_video");
  if (seedanceModeNeedsFirstFrame(seedanceMode)) return [];
  const videoRefs = typeof advancedSeedanceVideoReferences === "function" ? advancedSeedanceVideoReferences() : [];
  const refUrls = videoRefs
    .filter((item) => !item?.assetId)
    .map((item) => item.url || item.previewUrl || "")
    .filter(Boolean);
  return [...new Set([...refUrls, ...splitUrlList(els.advancedSeedanceVideoUrls?.value || "")])];
}

function advancedPricing(duration, provider = "seedance", resolution = "720p", ratio = "16:9", options = {}) {
  const normalizedProvider = normalizeAdvancedProvider(provider);
  if (normalizedProvider === "wan30") {
    const requestedDuration = Number(duration ?? 5);
    return {
      provider: "wan30",
      capability: "wan30-video",
      duration: requestedDuration === -1 ? -1 : Math.min(30, Math.max(2, Number.isFinite(requestedDuration) ? requestedDuration : 5)),
      resolution: normalizeAdvancedResolution(resolution || "1080p", normalizedProvider),
      ratio: normalizeVideoRatio(ratio || "adaptive"),
      billing: "free",
      baseCredits: 0,
      originalCredits: 0,
      credits: 0,
      markup: 1,
      userPricingMultiplier: 1,
    };
  }
  if (normalizedProvider === "qwen-image3") {
    const configPricing = state.config?.platform?.advancedPricing || {};
    const qwenPricing = configPricing.qwenImage3 || {};
    const creditsPerUsd = Number(configPricing.creditsPerUsd || state.wallet?.creditsPerUsd || 100) || 100;
    const tier = options.qwenTier || currentQwenImage3Tier();
    const normalizedTier = tier === "standard" ? "standard" : "pro";
    const normalizedResolution = normalizeAdvancedResolution(resolution || qwenPricing.defaultResolution || "2K", normalizedProvider);
    const referenceImageCount = Math.max(0, Math.min(ADVANCED_QWEN_IMAGE3_REFERENCE_LIMIT, Number(options.referenceImageCount ?? selectedAdvancedReferenceImages("qwen-image3").length) || 0));
    const outputImageCount = Math.max(1, Math.min(6, Number(options.outputImageCount ?? els.advancedQwenOutputCount?.value ?? 1) || 1));
    const tierPricing = qwenPricing[normalizedTier] || {};
    const fallbackOutputUsd = normalizedTier === "standard"
      ? ADVANCED_QWEN_IMAGE3_STANDARD_USD_PER_IMAGE
      : normalizedResolution === "1K"
      ? ADVANCED_QWEN_IMAGE3_PRO_1K_USD_PER_IMAGE
      : ADVANCED_QWEN_IMAGE3_PRO_2K_USD_PER_IMAGE;
    const outputUsdPerImage = Number(tierPricing.saleUsdPerImageByResolution?.[normalizedResolution] ?? fallbackOutputUsd);
    const inputUsdPerReferenceImage = Number(tierPricing.saleUsdPerReferenceImage ?? ADVANCED_QWEN_IMAGE3_USD_PER_REFERENCE_IMAGE);
    const outputUsd = Math.max(0, outputUsdPerImage * outputImageCount);
    const inputUsd = Math.max(0, inputUsdPerReferenceImage * referenceImageCount);
    const totalUsd = outputUsd + inputUsd;
    const originalCredits = creditsAmount(totalUsd * creditsPerUsd);
    const multiplier = userPricingMultiplier();
    return {
      provider: "qwen-image3",
      qwenTier: normalizedTier,
      duration: 1,
      resolution: normalizedResolution,
      referenceImageCount,
      outputImageCount,
      outputUsdPerImage,
      inputUsdPerReferenceImage,
      outputUsd,
      inputUsd,
      totalUsd,
      baseCredits: originalCredits,
      originalCredits,
      credits: creditsAmount(originalCredits * multiplier),
      markup: 1,
      userPricingMultiplier: multiplier,
    };
  }
  if (normalizedProvider === "seedream5-image") {
    const configPricing = state.config?.platform?.advancedPricing || {};
    const seedreamPricing = configPricing.seedream5Image || {};
    const creditsPerUsd = Number(configPricing.creditsPerUsd || state.wallet?.creditsPerUsd || 100) || 100;
    const tier = "pro";
    const normalizedResolution = normalizeAdvancedResolution(resolution || seedreamPricing.defaultResolution || "2K", normalizedProvider);
    const referenceImageCount = Math.max(0, Number(options.referenceImageCount ?? selectedAdvancedReferenceImages("seedream5-image").length) || 0);
    const proResolutionUsd = seedreamPricing.pro?.saleUsdPerImageByResolution || {};
    const outputUsdPerImage = Number(proResolutionUsd[normalizedResolution] ?? (normalizedResolution === "1K" ? ADVANCED_SEEDREAM5_PRO_1K_USD_PER_IMAGE : ADVANCED_SEEDREAM5_PRO_2K_USD_PER_IMAGE));
    const referenceUsdPerImage = Number(seedreamPricing.pro?.referenceUsdPerImageAfterFirst ?? ADVANCED_SEEDREAM5_PRO_REFERENCE_USD_PER_IMAGE_AFTER_FIRST);
    const billableReferenceImages = Math.max(0, referenceImageCount - 1);
    const totalUsd = Math.max(0, outputUsdPerImage + referenceUsdPerImage * billableReferenceImages);
    const originalCredits = creditsAmount(totalUsd * creditsPerUsd);
    const multiplier = userPricingMultiplier();
    return {
      provider: "seedream5-image",
      seedreamTier: tier,
      duration: 1,
      resolution: normalizedResolution,
      size: normalizedResolution,
      referenceImageCount,
      billableReferenceImages,
      outputUsdPerImage,
      referenceUsdPerImage,
      totalUsd,
      baseCredits: originalCredits,
      originalCredits,
      credits: creditsAmount(originalCredits * multiplier),
      markup: 1,
      userPricingMultiplier: multiplier,
    };
  }
  if (normalizedProvider === "wan27-image-edit") {
    const credits = assetImageModifyCostCredits();
    return {
      provider: "wan27-image-edit",
      duration: 1,
      resolution: normalizeAdvancedResolution(resolution, normalizedProvider),
      ratio: normalizeVideoRatio(ratio),
      baseCredits: credits,
      originalCredits: credits,
      credits,
      markup: 1,
      userPricingMultiplier: userPricingMultiplier(),
    };
  }
  const bounds = advancedDurationBounds(normalizedProvider, options.videoCapability);
  const rawSeconds = Number(duration || bounds.fallback);
  const seconds = Number.isFinite(rawSeconds) ? Math.min(bounds.max, Math.max(bounds.min, rawSeconds)) : bounds.fallback;
  const configPricing = state.config?.platform?.advancedPricing || {};
  const multiplier = userPricingMultiplier();
  if (normalizedProvider === "seedance25") {
    const normalizedResolution = normalizeAdvancedResolution(resolution, normalizedProvider);
    const mode = normalizeSeedanceMediaMode(options.mode || els.advancedSeedanceMediaMode?.value || "omini");
    const inputVideoSeconds = positiveDurationSeconds(options.inputVideoSeconds ?? options.videoInputSeconds, 0);
    const billingSeconds = mode === "edit" ? inputVideoSeconds : seconds;
    const byResolution = configPricing.seedance25CreditsPerSecondByResolution || {};
    const fallbackPerSecond = normalizedResolution === "720p"
      ? ADVANCED_SEEDANCE25_720P_CREDITS_PER_SECOND
      : ADVANCED_SEEDANCE25_480P_CREDITS_PER_SECOND;
    const perSecond = Number(byResolution[normalizedResolution] || fallbackPerSecond) || fallbackPerSecond;
    const originalCredits = creditsAmount(billingSeconds * perSecond);
    return {
      provider: "seedance25",
      mode,
      duration: billingSeconds,
      requestedDuration: mode === "edit" ? null : seconds,
      inputVideoSeconds: mode === "edit" ? inputVideoSeconds : 0,
      resolution: normalizedResolution,
      ratio: mode === "omini" ? normalizeVideoRatio(ratio) : "adaptive",
      creditsPerSecond: perSecond,
      outputCredits: originalCredits,
      baseCredits: originalCredits,
      originalCredits,
      credits: creditsAmount(originalCredits * multiplier),
      markup: 1,
      userPricingMultiplier: multiplier,
    };
  }
  if (normalizedProvider === "wan27" || normalizedProvider === "happyhorse") {
    const capability = options.videoCapability || currentAdvancedVideoCapability();
    const normalizedResolution = normalizeAdvancedResolution(resolution, normalizedProvider);
    const animateMode = String(options.mode || options.animateMode || els.advancedWanAnimateMode?.value || "wan-std") === "wan-pro" ? "wan-pro" : "wan-std";
    const rateKey = ["wan-animate-move", "wan-animate-mix"].includes(capability) ? animateMode : normalizedResolution;
    const familyPricing = normalizedProvider === "happyhorse"
      ? configPricing.happyhorseCreditsPerSecondByResolution
      : configPricing.wan27CreditsPerSecondByResolution;
    const byResolution = ["wan-animate-move", "wan-animate-mix"].includes(capability)
      ? configPricing.aliyunVideoCreditsPerSecondByCapability?.[capability] || {}
      : familyPricing || {};
    const fallbackPerSecond = normalizedResolution === "1080p" ? ADVANCED_WAN27_1080P_CREDITS_PER_SECOND : ADVANCED_WAN27_720P_CREDITS_PER_SECOND;
    const perSecond = Number(byResolution[rateKey] || fallbackPerSecond) || fallbackPerSecond;
    const inputBillingCapabilities = new Set(["wan27-r2v", "wan27-video-edit", "happyhorse-video-edit"]);
    const rawInputVideoSeconds = inputBillingCapabilities.has(capability)
      ? positiveDurationSeconds(options.inputVideoSeconds ?? options.videoInputSeconds, 0)
      : 0;
    const inputVideoSeconds = capability === "wan27-r2v" ? Math.min(seconds, rawInputVideoSeconds) : rawInputVideoSeconds;
    const outputCredits = creditsAmount(seconds * perSecond);
    const inputVideoCredits = creditsAmount(inputVideoSeconds * perSecond);
    const originalCredits = creditsAmount(outputCredits + inputVideoCredits);
    return {
      provider: normalizedProvider,
      capability,
      duration: seconds,
      resolution: normalizedResolution,
      animateMode: ["wan-animate-move", "wan-animate-mix"].includes(capability) ? animateMode : undefined,
      creditsPerSecond: perSecond,
      outputCredits,
      inputVideoSeconds,
      inputVideoCreditsPerSecond: perSecond,
      inputVideoCredits,
      baseCredits: originalCredits,
      originalCredits,
      credits: creditsAmount(originalCredits * multiplier),
      markup: 1,
      userPricingMultiplier: multiplier,
    };
  }
  const normalizedResolution = normalizeAdvancedResolution(resolution, normalizedProvider);
  const normalizedRatio = normalizeVideoRatio(ratio);
  const seedanceTier = String(options.seedanceTier || "").trim().toLowerCase() === "fast" ? "fast" : "standard";
  const isFast = seedanceTier === "fast";
  const byResolution = isFast
    ? (configPricing.seedanceFastCreditsPerSecondByResolution || {})
    : (configPricing.seedanceCreditsPerSecondByResolution || {});
  const fallbackPerSecond = isFast
    ? normalizedResolution === "480p"
      ? ADVANCED_SEEDANCE_FAST_480P_CREDITS_PER_SECOND
      : ADVANCED_SEEDANCE_FAST_720P_CREDITS_PER_SECOND
    : normalizedResolution === "4k"
    ? ADVANCED_SEEDANCE_4K_CREDITS_PER_SECOND
    : normalizedResolution === "1080p"
    ? ADVANCED_SEEDANCE_1080P_CREDITS_PER_SECOND
    : normalizedResolution === "480p"
    ? ADVANCED_SEEDANCE_480P_CREDITS_PER_SECOND
    : ADVANCED_SEEDANCE_720P_CREDITS_PER_SECOND;
  const perSecond = Number(byResolution[normalizedResolution] || fallbackPerSecond) || fallbackPerSecond;
  const videoInputSeconds = positiveDurationSeconds(options.inputVideoSeconds ?? options.videoInputSeconds, 0);
  const videoInputByResolution = isFast
    ? (configPricing.seedanceFastVideoInputCreditsPerSecondByResolution || {})
    : (configPricing.seedanceVideoInputCreditsPerSecondByResolution || {});
  const fallbackVideoInputPerSecond = isFast
    ? normalizedResolution === "480p"
      ? ADVANCED_SEEDANCE_FAST_VIDEO_INPUT_480P_CREDITS_PER_SECOND
      : ADVANCED_SEEDANCE_FAST_VIDEO_INPUT_720P_CREDITS_PER_SECOND
    : normalizedResolution === "4k"
    ? ADVANCED_SEEDANCE_VIDEO_INPUT_4K_CREDITS_PER_SECOND
    : normalizedResolution === "1080p"
    ? ADVANCED_SEEDANCE_VIDEO_INPUT_1080P_CREDITS_PER_SECOND
    : normalizedResolution === "480p"
    ? ADVANCED_SEEDANCE_VIDEO_INPUT_480P_CREDITS_PER_SECOND
    : ADVANCED_SEEDANCE_VIDEO_INPUT_720P_CREDITS_PER_SECOND;
  const videoInputCreditsPerSecond = Number(videoInputByResolution[normalizedResolution] || fallbackVideoInputPerSecond) || fallbackVideoInputPerSecond;
  const seedanceDiscount = 1;
  const outputCredits = creditsAmount(seconds * perSecond * seedanceDiscount);
  const videoInputCredits = creditsAmount(videoInputSeconds * videoInputCreditsPerSecond * seedanceDiscount);
  const originalCredits = creditsAmount(outputCredits + videoInputCredits);
  return {
    provider: "seedance",
    seedanceTier,
    seedanceDiscount,
    duration: seconds,
    resolution: normalizedResolution,
    ratio: normalizedRatio,
    creditsPerSecond: perSecond,
    outputCredits,
    videoInputSeconds,
    videoInputCreditsPerSecond,
    videoInputCredits,
    baseCredits: originalCredits,
    originalCredits,
    credits: creditsAmount(originalCredits * multiplier),
    markup: 1,
    userPricingMultiplier: multiplier,
  };
}

function advancedCostForDuration(duration, provider = "seedance", resolution = "720p", ratio = "16:9", options = {}) {
  const key = advancedEstimateKey(duration, provider, resolution, ratio, options);
  if (state.advancedEstimate && state.advancedEstimateKey === key) {
    return state.advancedEstimate.credits;
  }
  return advancedPricing(duration, provider, resolution, ratio, options).credits;
}

function currentAdvancedProvider() {
  return normalizeAdvancedProvider(els.advancedProvider?.value);
}

function currentSeedanceTier() {
  return (String(els.advancedSeedanceTier?.value || "").trim().toLowerCase() === "fast") ? "fast" : "standard";
}

function currentSeedreamTier() {
  return "pro";
}

function currentQwenImage3Tier() {
  return els.advancedQwenTier?.value === "standard" ? "standard" : "pro";
}

function currentAdvancedResolution() {
  const provider = currentAdvancedProvider();
  const normalizedProvider = normalizeAdvancedProvider(provider);
  const fallback = ["seedream5-image", "qwen-image3"].includes(normalizedProvider) ? "2K" : ["seedance", "seedance25"].includes(normalizedProvider) ? "480p" : "720p";
  return normalizeAdvancedResolution(els.advancedResolution?.value || fallback, provider);
}

function advancedVideoSettingsVisible() {
  return state.advancedCreateKind === "video"
    && !advancedCreateModeIsSimpleEdit()
    && !["wan-animate-move", "wan-animate-mix"].includes(currentAdvancedVideoCapability())
    && !advancedVideoEditUsesSourceDuration()
    && !(currentAdvancedProvider() === "seedance25" && normalizeSeedanceMediaMode(els.advancedSeedanceMediaMode?.value || "") === "edit");
}

function advancedVideoResolutionOptions(provider = currentAdvancedProvider()) {
  if (normalizeAdvancedProvider(provider) === "qwen-image3") return ["1K", "2K"];
  if (normalizeAdvancedProvider(provider) === "seedream5-image") return ["1K", "2K"];
  if (normalizeAdvancedProvider(provider) === "seedance25") return ["480p", "720p"];
  return normalizeAdvancedProvider(provider) === "seedance"
    ? ["480p", "720p", "1080p", "4k"]
    : ["720p", "1080p"];
}

function advancedVideoDurationOptions(provider = currentAdvancedProvider()) {
  const bounds = advancedDurationBounds(provider);
  const base = [bounds.min, 5, 8, 10, bounds.max]
    .filter((value, index, list) => Number.isFinite(value) && value >= bounds.min && value <= bounds.max && list.indexOf(value) === index);
  const current = Number(els.advancedDuration?.value || bounds.min);
  if (Number.isFinite(current) && current >= bounds.min && current <= bounds.max && !base.includes(current)) base.push(current);
  return base.sort((a, b) => a - b);
}

function advancedVideoResolutionLabel(value = "") {
  return String(value || "").toLowerCase() === "4k" ? "4K" : String(value || "");
}

function syncAdvancedVideoSettingsControls() {
  const visible = advancedVideoSettingsVisible();
  if (els.advancedVideoSettings) els.advancedVideoSettings.hidden = !visible;
  if (!visible) return;
  const provider = currentAdvancedProvider();
  const resolutionOptions = advancedVideoResolutionOptions(provider);
  const currentResolution = currentAdvancedResolution();
  if (els.advancedResolution && !resolutionOptions.includes(currentResolution)) {
    els.advancedResolution.value = resolutionOptions[0];
  }
  const selectedResolution = currentAdvancedResolution();
  if (els.advancedVideoResolutionChoices) {
    els.advancedVideoResolutionChoices.innerHTML = resolutionOptions.map((value) => `
      <button class="advanced-video-choice ${value === selectedResolution ? "is-active" : ""}" type="button" data-advanced-video-resolution="${escapeHtml(value)}">
        ${escapeHtml(advancedVideoResolutionLabel(value))}
      </button>
    `).join("");
  }

  const bounds = advancedDurationBounds(provider);
  const rawDuration = Number(els.advancedDuration?.value || bounds.min);
  const selectedDuration = Math.min(bounds.max, Math.max(bounds.min, Number.isFinite(rawDuration) ? rawDuration : bounds.min));
  if (els.advancedDuration && Number(els.advancedDuration.value) !== selectedDuration) {
    els.advancedDuration.value = String(selectedDuration);
  }
  if (els.advancedVideoDurationChoices) {
    els.advancedVideoDurationChoices.innerHTML = advancedVideoDurationOptions(provider).map((value) => `
      <button class="advanced-video-choice ${value === selectedDuration ? "is-active" : ""}" type="button" data-advanced-video-duration="${escapeHtml(value)}">
        ${escapeHtml(value)}s
      </button>
    `).join("");
  }
  refreshIcons();
}

function imageCreateHasReferences() {
  return selectedAdvancedReferenceImages("wan27-image-edit").length > 0;
}

function imageCreateResolutionOptions() {
  return imageCreateHasReferences() ? ["1K", "2K"] : ["1K", "2K", "4K"];
}

function currentAdvancedRatio() {
  return normalizeVideoRatio(els.advancedRatio?.value || "16:9");
}

function advancedPresetMeta(slot = "") {
  return ADVANCED_PRESET_SLOT_META[slot] || ADVANCED_PRESET_SLOT_META.action;
}

function advancedPresetLabel(slot = "") {
  return t(advancedPresetMeta(slot).labelKey);
}

function advancedPresetSet(slot = "") {
  return (state.advancedPresetData?.sets || []).find((set) => set.slot === slot) || { slot, items: [] };
}

function advancedCharacterPresetFromItem(item = {}, source = "system") {
  const imageUrl = characterReferenceImageUrl(item) || characterUsableImage(item);
  if (!item?.id || !imageUrl || isGenericCharacterPoster(imageUrl)) return null;
  const sourceLabel = source === "custom" ? t("characters.customTab") : t("characters.systemTab");
  const label = item.name || item.title || "Character";
  return {
    id: String(item.id || ""),
    label,
    category: item.category || sourceLabel,
    section: sourceLabel,
    prompt: item.prompt || item.description || item.title || `Use ${label} as the main subject.`,
    description: item.description || item.title || "",
    imageUrl,
    referenceImageUrl: imageUrl,
    tags: Array.isArray(item.tags) ? item.tags : [],
    assetId: item.assetId || "",
    sourceType: source,
    characterId: item.id || "",
    myCharacter: source === "custom",
  };
}

function advancedCharacterPresetItems(source = state.advancedPresetCharacterSource || "system") {
  const systemItems = (state.homeCharacters || [])
    .filter((item) => item && !item.deletedAt)
    .map((item) => advancedCharacterPresetFromItem(item, "system"))
    .filter(Boolean);
  const customItems = customCharacterItems()
    .filter((item) => item && !item.deletedAt && characterUsableImage(item))
    .map((item) => advancedCharacterPresetFromItem(item, "custom"))
    .filter(Boolean);
  const seen = new Set();
  const pool = source === "custom" ? customItems : systemItems;
  return pool.filter((item) => {
    const key = `${item.sourceType}:${item.id}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function advancedPresetItems(slot = "") {
  if (slot === "character") return advancedCharacterPresetItems();
  return Array.isArray(advancedPresetSet(slot).items) ? advancedPresetSet(slot).items : [];
}

function hasMoreSystemCharacterPresets() {
  const total = Number(state.homeCharactersTotal || 0) || 0;
  if (!total) return false;
  return advancedCharacterPresetItems("system").length < total;
}

function systemCharacterPresetTotal() {
  return Math.max(
    Number(state.homeCharactersTotal || 0) || 0,
    advancedCharacterPresetItems("system").length,
  );
}

function renderAdvancedPresetCharacterPager() {
  if (state.advancedPresetDialogSlot !== "character" || state.advancedPresetCharacterSource === "custom") return "";
  const loaded = advancedCharacterPresetItems("system").length;
  const total = systemCharacterPresetTotal();
  if (!total || loaded >= total) return "";
  const loading = state.homeCharactersLoadingMore;
  return `
    <div class="advanced-preset-load-more">
      <span>${escapeHtml(String(loaded))} / ${escapeHtml(String(total))}</span>
      <button class="ghost-button" type="button" data-advanced-preset-load-more ${loading ? "disabled" : ""}>
        <i data-lucide="${loading ? "loader-circle" : "chevrons-down"}"></i>${escapeHtml(loading ? "Loading" : "Load more")}
      </button>
    </div>
  `;
}

async function loadMoreAdvancedPresetCharacters() {
  if (state.advancedPresetDialogSlot !== "character" || state.advancedPresetCharacterSource === "custom") return;
  if (!hasMoreSystemCharacterPresets()) return;
  renderAdvancedPresetDialog();
  await loadMoreHomeCharacters();
  if (state.advancedPresetDialogSlot === "character" && els.advancedPresetDialog?.open) renderAdvancedPresetDialog();
  renderAdvancedPresetBuilder();
}

function selectedAdvancedPreset(slot = "") {
  return state.advancedSelectedPresets?.[slot] || null;
}

function clearAdvancedPreset(slot = "") {
  if (!slot) return;
  state.advancedSelectedPresets = { ...(state.advancedSelectedPresets || {}), [slot]: null };
  if (slot === "character") clearAdvancedCharacterPresetReference();
  renderAdvancedPresetBuilder();
}

function clearAdvancedCharacterPresetReference() {
  const refs = Array.isArray(state.advancedReferenceImages) ? state.advancedReferenceImages : [];
  const removedActivePresetRef = refs.some((item) => item?.fromPreset && item.dataUrl === state.advancedUploadDataUrl);
  const nextRefs = refs.filter((item) => !item?.fromPreset);
  state.advancedReferenceImages = nextRefs;
  if (removedActivePresetRef || !nextRefs.length) state.advancedUploadDataUrl = nextRefs[0]?.dataUrl || "";
  if (!nextRefs.length) {
    state.advancedFirstFrameAssetId = "";
    state.advancedSourceImageAssetId = "";
  } else if (currentAdvancedProvider() === "wan27-image-edit") {
    state.advancedSourceImageAssetId = nextRefs[0]?.assetId || "";
    state.advancedFirstFrameAssetId = "";
  } else {
    state.advancedFirstFrameAssetId = nextRefs[0]?.assetId || "";
    state.advancedSourceImageAssetId = "";
  }
  updateAdvancedModelControls();
}

function resetAdvancedPresets() {
  state.advancedSelectedPresets = {};
  state.advancedPresetDialogSlot = "";
  state.advancedPresetCategory = "All";
  state.advancedPresetSearch = "";
}

async function loadAdvancedPresets() {
  if (state.advancedPresetsLoaded || state.advancedPresetsLoading) return;
  state.advancedPresetsLoading = true;
  try {
    const response = await fetch(`${OURDREAM_PRESET_URL}?v=2`, { cache: "force-cache" });
    if (!response.ok) throw new Error(`Preset request failed: ${response.status}`);
    const payload = await response.json();
    state.advancedPresetData = {
      sets: Array.isArray(payload.sets) ? payload.sets : [],
      categories: payload.categories && typeof payload.categories === "object" ? payload.categories : {},
    };
    state.advancedPresetsLoaded = true;
  } catch (error) {
    console.warn("advanced presets failed", error);
  } finally {
    state.advancedPresetsLoading = false;
    renderAdvancedPresetBuilder();
  }
}

function presetImageUrl(item = {}) {
  return item.imageUrl || item.referenceImageUrl || "";
}

function presetPromptText(item = {}) {
  return String(item.prompt || item.description || item.label || "").trim();
}

function advancedPresetReferenceImage(slot = "", item = selectedAdvancedPreset(slot)) {
  if (!slot || !item) return null;
  const url = presetImageUrl(item);
  if (!url) return null;
  return {
    dataUrl: url,
    url,
    imageUrl: url,
    fileName: `${item.id || slot}.jpg`,
    name: `${advancedPresetLabel(slot)}: ${item.label || slot}`,
    presetId: item.id || "",
    presetSlot: slot,
    fromPreset: true,
    localUpload: Boolean(item.localUpload),
    sourceUrl: item.localUpload ? "" : url,
  };
}

function advancedPresetReferenceImages() {
  return advancedCreateModeActivePresetSlots()
    .map((slot) => advancedPresetReferenceImage(slot))
    .filter(Boolean)
    .slice(0, ADVANCED_SEEDANCE_REFERENCE_LIMIT);
}

function setAdvancedLocalCharacterPreset(ref = {}) {
  const url = ref.dataUrl || ref.url || ref.imageUrl || ref.previewUrl || "";
  if (!url) return;
  state.advancedSelectedPresets = {
    ...(state.advancedSelectedPresets || {}),
    character: {
      id: "local-upload-character",
      label: t("advancedPreset.localImage"),
      category: t("advancedPreset.character"),
      prompt: "Use the uploaded image as the main consenting adult subject. Preserve identity, face, hairstyle, body type, and overall character consistency.",
      imageUrl: url,
      referenceImageUrl: url,
      localUpload: true,
    },
  };
}

function advancedPresetSupplementalReferenceImages(seedanceMode = "") {
  const refs = advancedPresetReferenceImages();
  if (!seedanceModeNeedsFirstFrame(seedanceMode)) return refs;
  return refs.filter((item) => item.presetSlot !== "character");
}

function advancedSimpleActionCostLabel(provider = currentAdvancedProvider(), duration = Number(els.advancedDuration?.value || 5), resolution = currentAdvancedResolution(), ratio = currentAdvancedRatio()) {
  const options = {
    inputVideoSeconds: provider === "seedance" ? currentSeedanceVideoInputSeconds(duration, provider) : 0,
    seedanceTier: currentSeedanceTier(),
  };
  return advancedButtonCostLabel(duration, provider, resolution, ratio, options);
}

async function confirmAdvancedSimpleActionCost(costLabel = "") {
  const cost = String(costLabel || "").trim();
  const result = await showInlineDialog({
    title: "",
    body: `<p class="job-note">${escapeHtml(t("advanced.confirmCostOnly", { cost }, cost))}</p>`,
    confirmText: t("common.generate"),
    dialogClass: "is-frame-action",
  });
  return result === "confirm";
}

function advancedPresetImageRolePrompt() {
  const refs = advancedPresetReferenceImages();
  if (!refs.length) return "";
  const roles = {
    character: "character identity and first-frame subject",
    action: "action, pose, and motion direction",
    outfit: "outfit and styling",
    scene: "environment, lighting, and background",
  };
  const lines = refs.map((item, index) => (
    `Image ${index + 1}: ${roles[item.presetSlot] || item.presetSlot} reference (${item.name || item.label || item.presetSlot}).`
  ));
  return [
    "Follow the selected reference images exactly for their roles.",
    ...lines,
    "Image 1 is the highest-priority character identity reference. The final video must use Image 1 for the main subject's face, identity, hairstyle, body type, and overall character consistency.",
    "Use later reference images only for their assigned role: action references only for pose and motion, outfit references only for clothing and styling, and scene references only for environment, lighting, and background.",
    "Do not copy faces, identities, body types, or extra people from the action, outfit, or scene reference images unless they are explicitly described in the prompt.",
    "Do not ignore the action or scene references when composing the video.",
  ].join(" ");
}

function renderAdvancedPresetBuilder() {
  if (!els.advancedPresetBuilder) return;
  const slots = advancedCreateModeActivePresetSlots();
  const hidden = state.advancedCreateKind === "custom" || !slots.length;
  els.advancedPresetBuilder.hidden = hidden;
  if (hidden) {
    els.advancedPresetBuilder.innerHTML = "";
    return;
  }
  if (state.advancedPresetsLoading && !state.advancedPresetsLoaded) {
    els.advancedPresetBuilder.innerHTML = `<div class="advanced-preset-status">${escapeHtml(t("advancedPreset.loading"))}</div>`;
    return;
  }
  const showLocalUpload = slots.includes("character") && nonCustomAdvancedNeedsCharacterImage();
  const uploadAction = showLocalUpload
    ? `<button class="advanced-preset-upload" type="button" data-advanced-preset-upload="character"><i data-lucide="upload"></i>${escapeHtml(t("advancedPreset.uploadLocalImage"))}</button>`
    : "";
  els.advancedPresetBuilder.innerHTML = `${uploadAction}${slots.map((slot) => {
    const meta = advancedPresetMeta(slot);
    const selected = selectedAdvancedPreset(slot);
    const image = presetImageUrl(selected || {});
    return `
      <button class="advanced-preset-slot ${selected ? "has-preset" : ""}" type="button" data-advanced-preset-slot="${escapeHtml(slot)}">
        <span class="advanced-preset-slot-media">
          ${image ? `<img src="${escapeHtml(image)}" alt="${escapeHtml(selected?.label || advancedPresetLabel(slot))}" loading="lazy" />` : `<i data-lucide="${escapeHtml(meta.icon)}"></i>`}
        </span>
        <span class="advanced-preset-slot-copy">
          <strong>${escapeHtml(selected?.label || advancedPresetLabel(slot))}</strong>
          <small>${escapeHtml(selected ? advancedPresetLabel(slot) : t(meta.required ? "advancedPreset.required" : "advancedPreset.optional"))}</small>
        </span>
        ${selected ? `<span class="advanced-preset-clear" data-advanced-preset-clear="${escapeHtml(slot)}" aria-label="${escapeHtml(t("advancedPreset.clear"))}">&times;</span>` : ""}
      </button>
    `;
  }).join("")}`;
  els.advancedPresetBuilder.querySelectorAll("[data-advanced-preset-upload]").forEach((button) => {
    const openUpload = (event) => {
      event.preventDefault();
      event.stopPropagation();
      triggerAdvancedLocalImageUpload({ sourceMode: "reference_video", presetSlot: "character" });
    };
    button.addEventListener("click", openUpload);
    button.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") openUpload(event);
    });
  });
  els.advancedPresetBuilder.querySelectorAll("[data-advanced-preset-slot]").forEach((button) => {
    button.addEventListener("click", (event) => {
      if (event.target.closest("[data-advanced-preset-clear]")) return;
      if (event.target.closest("[data-advanced-preset-upload]")) return;
      openAdvancedPresetDialog(button.dataset.advancedPresetSlot || "");
    });
  });
  els.advancedPresetBuilder.querySelectorAll("[data-advanced-preset-clear]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      clearAdvancedPreset(button.dataset.advancedPresetClear || "");
    });
  });
  refreshIcons();
}

function advancedPresetCategoriesForSlot(slot = "") {
  const configured = Array.isArray(state.advancedPresetData?.categories?.[slot]) ? state.advancedPresetData.categories[slot] : [];
  const itemCategories = [...new Set(advancedPresetItems(slot).map((item) => item.category || "").filter(Boolean))];
  const categories = configured.length ? configured : ["All", ...itemCategories];
  return [...new Set(["All", ...categories.filter(Boolean)])];
}

function openAdvancedPresetDialog(slot = "") {
  if (!slot || !els.advancedPresetDialog) return;
  prepareModalOpen();
  state.advancedPresetDialogSlot = slot;
  if (slot === "character" && !["system", "custom"].includes(state.advancedPresetCharacterSource)) {
    state.advancedPresetCharacterSource = "system";
  }
  state.advancedPresetCategory = "All";
  state.advancedPresetSearch = "";
  if (els.advancedPresetSearch) els.advancedPresetSearch.value = "";
  if (els.advancedPresetDialogKicker) els.advancedPresetDialogKicker.textContent = "Preset";
  if (els.advancedPresetDialogTitle) {
    els.advancedPresetDialogTitle.textContent = t("advancedPreset.choose", { slot: advancedPresetLabel(slot) });
  }
  renderAdvancedPresetDialog();
  els.advancedPresetDialog.showModal();
  window.setTimeout(() => els.advancedPresetSearch?.focus(), 80);
  if (slot === "character" && state.user) {
    Promise.allSettled([
      state.myCharactersLoaded ? Promise.resolve() : loadMyCharacters({ silent: true }),
      loadUserAssets(state.userAssetsPage || 1),
    ]).then(() => {
      if (state.advancedPresetDialogSlot === "character" && els.advancedPresetDialog?.open) {
        renderAdvancedPresetDialog();
      }
      renderAdvancedPresetBuilder();
    });
  }
}

function renderAdvancedPresetDialog() {
  const slot = state.advancedPresetDialogSlot;
  if (!slot || !els.advancedPresetGrid) return;
  const categories = advancedPresetCategoriesForSlot(slot);
  if (els.advancedPresetCategories) {
    const sourceTabs = slot === "character" ? `
      <div class="advanced-preset-source-tabs" role="tablist" aria-label="${escapeHtml(t("advancedPreset.choose", { slot: advancedPresetLabel(slot) }))}">
        ${[
          { id: "system", label: t("characters.systemTab"), count: systemCharacterPresetTotal() },
          { id: "custom", label: t("characters.customTab"), count: advancedCharacterPresetItems("custom").length },
        ].map((source) => `
          <button class="advanced-preset-source-tab ${state.advancedPresetCharacterSource === source.id ? "is-active" : ""}" type="button" data-advanced-preset-source="${escapeHtml(source.id)}">
            ${escapeHtml(source.label)}<span>${escapeHtml(String(source.count))}</span>
          </button>
        `).join("")}
      </div>
    ` : "";
    els.advancedPresetCategories.innerHTML = `${sourceTabs}${categories.map((category) => `
      <button class="advanced-preset-category ${category === state.advancedPresetCategory ? "is-active" : ""}" type="button" data-advanced-preset-category="${escapeHtml(category)}">
        ${escapeHtml(category)}
      </button>
    `).join("")}`;
    els.advancedPresetCategories.querySelectorAll("[data-advanced-preset-source]").forEach((button) => {
      button.addEventListener("click", () => {
        state.advancedPresetCharacterSource = button.dataset.advancedPresetSource === "custom" ? "custom" : "system";
        state.advancedPresetCategory = "All";
        renderAdvancedPresetDialog();
      });
    });
    els.advancedPresetCategories.querySelectorAll("[data-advanced-preset-category]").forEach((button) => {
      button.addEventListener("click", () => {
        state.advancedPresetCategory = button.dataset.advancedPresetCategory || "All";
        renderAdvancedPresetDialog();
      });
    });
  }
  const query = String(state.advancedPresetSearch || "").trim().toLowerCase();
  const selectedCategory = String(state.advancedPresetCategory || "All").toLowerCase();
  const localUploadCard = slot === "character" && nonCustomAdvancedNeedsCharacterImage() ? `
    <button class="advanced-preset-card advanced-preset-local-card" type="button" data-advanced-preset-local-upload>
      <span><i data-lucide="image-up"></i></span>
      <strong>${escapeHtml(t("advancedPreset.uploadLocalImage"))}</strong>
    </button>
  ` : "";
  const bindLocalUploadCard = () => {
    els.advancedPresetGrid.querySelector("[data-advanced-preset-local-upload]")?.addEventListener("click", () => {
      els.advancedPresetDialog?.close();
      triggerAdvancedLocalImageUpload({ sourceMode: "reference_video", presetSlot: "character" });
    });
  };
  const items = advancedPresetItems(slot).filter((item) => {
    const tagList = (item.tags || []).map((tag) => String(tag || "").toLowerCase());
    const categoryOk = state.advancedPresetCategory === "All" || String(item.category || "").toLowerCase() === selectedCategory || tagList.includes(selectedCategory);
    const haystack = [item.label, item.category, item.section, item.description, item.prompt, ...(item.tags || [])].join(" ").toLowerCase();
    return categoryOk && (!query || haystack.includes(query));
  });
  if (!items.length) {
    els.advancedPresetGrid.innerHTML = `${localUploadCard}<div class="advanced-preset-empty">${escapeHtml(t("advancedPreset.none"))}</div>${renderAdvancedPresetCharacterPager()}`;
    bindLocalUploadCard();
    els.advancedPresetGrid.querySelector("[data-advanced-preset-load-more]")?.addEventListener("click", () => {
      loadMoreAdvancedPresetCharacters().catch((error) => console.warn("load more preset characters failed", error.message || error));
    });
    refreshIcons();
    return;
  }
  els.advancedPresetGrid.innerHTML = `${localUploadCard}${items.map((item) => {
    const image = presetImageUrl(item);
    const active = selectedAdvancedPreset(slot)?.id === item.id;
    return `
      <button class="advanced-preset-card ${active ? "is-active" : ""}" type="button" data-advanced-preset-id="${escapeHtml(item.id)}">
        ${image ? `<img src="${escapeHtml(image)}" alt="${escapeHtml(item.label || "")}" loading="lazy" />` : `<span><i data-lucide="${escapeHtml(advancedPresetMeta(slot).icon)}"></i></span>`}
        <strong>${escapeHtml(item.label || "")}</strong>
      </button>
    `;
  }).join("")}${renderAdvancedPresetCharacterPager()}`;
  bindLocalUploadCard();
  els.advancedPresetGrid.querySelectorAll("[data-advanced-preset-id]").forEach((button) => {
    button.addEventListener("click", () => selectAdvancedPreset(slot, button.dataset.advancedPresetId || ""));
  });
  els.advancedPresetGrid.querySelector("[data-advanced-preset-load-more]")?.addEventListener("click", () => {
    loadMoreAdvancedPresetCharacters().catch((error) => console.warn("load more preset characters failed", error.message || error));
  });
  refreshIcons();
}

function selectAdvancedPreset(slot = "", presetId = "") {
  const preset = advancedPresetItems(slot).find((item) => item.id === presetId);
  if (!preset) return;
  state.advancedSelectedPresets = { ...(state.advancedSelectedPresets || {}), [slot]: preset };
  if (slot === "character") applyAdvancedCharacterPreset(preset);
  els.advancedPresetDialog?.close();
  renderAdvancedPresetBuilder();
  if (els.advancedNote) els.advancedNote.textContent = "";
}

function applyAdvancedCharacterPreset(preset = {}) {
  const url = preset.referenceImageUrl || preset.imageUrl || "";
  if (!url) return;
  const rawRef = {
    assetId: preset.assetId || "",
    dataUrl: url,
    url,
    fileName: `${preset.id || "character"}.jpg`,
    name: preset.label || "Character",
    fromPreset: true,
    sourceType: preset.sourceType || "",
    characterId: preset.characterId || preset.id || "",
  };
  const ref = typeof stampAdvancedReferenceOrder === "function" ? stampAdvancedReferenceOrder(rawRef) : rawRef;
  const provider = currentAdvancedProvider();
  if (provider === "wan27-image-edit") {
    state.advancedSourceImageAssetId = "";
    state.advancedFirstFrameAssetId = "";
    state.advancedReferenceImages = [ref];
  } else {
    state.advancedFirstFrameAssetId = "";
    state.advancedSourceImageAssetId = "";
    state.advancedReferenceImages = [ref];
    if (provider === "seedance" && els.advancedSeedanceMediaMode) {
      const mode = normalizeSeedanceMediaMode(els.advancedSeedanceMediaMode.value || "");
      if (!seedanceModeNeedsFirstFrame(mode)) els.advancedSeedanceMediaMode.value = "reference_video";
    }
  }
  state.advancedUploadDataUrl = url;
  if (els.advancedImage) els.advancedImage.value = "";
  updateAdvancedModelControls();
}

function advancedPresetPromptParts() {
  const parts = [advancedPresetImageRolePrompt()];
  advancedCreateModeActivePresetSlots().forEach((slot) => {
    const item = selectedAdvancedPreset(slot);
    if (!item) return;
    const label = advancedPresetLabel(slot);
    const prompt = presetPromptText(item);
    parts.push(`${label}: ${slot === "character" ? `${item.label}. ` : ""}${prompt}`);
  });
  return parts.map((part) => part.trim()).filter(Boolean);
}

function advancedPresetSelectionPayload() {
  return Object.fromEntries(advancedCreateModeActivePresetSlots().map((slot) => {
    const item = selectedAdvancedPreset(slot);
    return [slot, item ? {
      id: item.id,
      label: item.label,
      category: item.category || "",
      prompt: presetPromptText(item),
      imageUrl: item.localUpload ? "" : presetImageUrl(item),
      sourceType: item.localUpload ? "local" : item.sourceType || "",
    } : null];
  }));
}

function hydrateAdvancedPresetsFromParams(params = {}) {
  const saved = params.presets && typeof params.presets === "object" && !Array.isArray(params.presets) ? params.presets : null;
  if (!saved) return false;
  const next = {};
  ADVANCED_PRESET_SLOT_ORDER.forEach((slot) => {
    const savedItem = saved[slot];
    if (!savedItem) return;
    const matched = advancedPresetItems(slot).find((item) => item.id === savedItem.id) || null;
    next[slot] = matched || {
      id: savedItem.id || `${slot}-restored`,
      label: savedItem.label || advancedPresetLabel(slot),
      category: savedItem.category || "",
      prompt: savedItem.prompt || "",
      imageUrl: savedItem.imageUrl || "",
      referenceImageUrl: savedItem.imageUrl || "",
    };
  });
  state.advancedSelectedPresets = next;
  return Object.values(next).some(Boolean);
}

function promptWithoutPresetParts(prompt = "", params = {}) {
  const saved = params.presets && typeof params.presets === "object" && !Array.isArray(params.presets) ? params.presets : null;
  let text = String(prompt || "");
  if (!saved) return text.trim();
  Object.entries(saved).forEach(([slot, item]) => {
    if (!item) return;
    const label = item.label || "";
    const promptText = item.prompt || "";
    const slotTitle = slot.charAt(0).toUpperCase() + slot.slice(1);
    const patterns = [
      `${slotTitle}: ${label}. ${promptText}`,
      `${slotTitle}: ${promptText}`,
      promptText,
    ].filter((value) => String(value || "").trim().length > 8);
    patterns.forEach((pattern) => {
      text = text.replace(pattern, "");
    });
  });
  return text
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .join("\n")
    .trim();
}

function advancedEffectivePrompt(basePrompt = "") {
  const prompt = String(basePrompt || "").trim();
  if (state.advancedCreateKind === "custom") return prompt;
  return [...advancedPresetPromptParts(), prompt]
    .filter(Boolean)
    .join("\n");
}

function nonCustomAdvancedNeedsCharacterImage() {
  if (state.advancedCreateKind === "custom") return false;
  const provider = currentAdvancedProvider();
  if (provider === "wan27-image-edit") return false;
  return provider === "seedance" && advancedCreateModeActivePresetSlots().includes("character");
}

function hasAdvancedCharacterImage() {
  return Boolean(
    state.advancedUploadDataUrl ||
    state.advancedSeedanceFirstFrameDataUrl ||
    state.advancedSeedanceFirstFrameAssetId ||
    state.advancedFirstFrameAssetId ||
    state.advancedSourceImageAssetId ||
    selectedAdvancedReferenceImages("seedance").length ||
    selectedAdvancedReferenceImages("wan27-image-edit").length
  );
}

function advancedCreateKindConfig(kind = state.advancedCreateKind) {
  return ADVANCED_CREATE_KINDS.find((item) => item.id === kind) || ADVANCED_CREATE_KINDS[1];
}

function advancedCreateModesForKind(kind = state.advancedCreateKind) {
  const normalizedKind = advancedCreateKindConfig(kind).id;
  return ADVANCED_CREATE_MODES[normalizedKind] || ADVANCED_CREATE_MODES.video;
}

function advancedCreateModeConfig(kind = state.advancedCreateKind, mode = state.advancedCreateMode) {
  if (advancedCreateKindConfig(kind).id === "custom") return ADVANCED_CUSTOM_MODE;
  const modes = advancedCreateModesForKind(kind);
  return modes.find((item) => item.id === mode) || modes[0];
}

function clearAdvancedMediaInputs() {
  const previousPromptRefs = typeof advancedPromptMentionSnapshot === "function" ? advancedPromptMentionSnapshot() : [];
  state.activeAdvancedCaseId = "";
  state.advancedUploadDataUrl = "";
  state.advancedSourceImageAssetId = "";
  state.advancedFirstFrameAssetId = "";
  state.advancedReferenceImages = [];
  state.advancedSeedanceVideoReferences = [];
  state.advancedSeedanceAudioReferences = [];
  state.advancedSeedanceFirstFrameDataUrl = "";
  state.advancedSeedanceFirstFrameAssetId = "";
  state.advancedSeedanceLastFrameDataUrl = "";
  state.advancedSeedanceLastFrameAssetId = "";
  state.advancedSeedanceVideoAssetId = "";
  state.advancedSeedanceVideoPreviewUrl = "";
  state.advancedWanLastFrameDataUrl = "";
  state.advancedWanLastFrameAssetId = "";
  state.advancedWanClipDataUrl = "";
  state.advancedWanClipFileName = "";
  state.advancedWanClipAssetId = "";
  state.advancedWanClipOrder = 0;
  state.advancedAudioAssetId = "";
  state.advancedAudioPreviewUrl = "";
  state.advancedAudioFileName = "";
  state.advancedAudioOrder = 0;
  resetAdvancedPresets();
  [
    els.advancedSeedanceVideoUrls,
    els.advancedSeedanceAudioUrls,
    els.advancedWanAudioUrl,
    els.advancedWanClipUrl,
  ].forEach((input) => {
    if (input) input.value = "";
  });
  [
    els.advancedImage,
    els.advancedSeedanceFirstFrame,
    els.advancedSeedanceLastFrame,
    els.advancedWanFirstFrame,
    els.advancedWanLastFrame,
    els.advancedWanClipFile,
  ].forEach((input) => {
    if (input) input.value = "";
  });
  [
    [els.advancedWanFirstFramePreview, els.advancedWanFirstFrame],
    [els.advancedSeedanceFirstFramePreview, els.advancedSeedanceFirstFrame],
    [els.advancedSeedanceLastFramePreview, els.advancedSeedanceLastFrame],
    [els.advancedWanLastFramePreview, els.advancedWanLastFrame],
    [els.advancedWanClipPreview, els.advancedWanClipFile],
  ].forEach(([preview, input]) => {
    preview?.removeAttribute("src");
    preview?.classList.remove("is-visible");
    input?.closest(".wan-frame-upload")?.classList.remove("has-image");
  });
  if (els.advancedUploadPreview) els.advancedUploadPreview.innerHTML = "";
  els.advancedUploadBox?.classList.remove("has-image");
  if (typeof syncAdvancedPromptMentionLabels === "function") syncAdvancedPromptMentionLabels(previousPromptRefs);
  renderAdvancedPresetBuilder();
}

function applyAdvancedCreateMode({ clearMedia = false } = {}) {
  const kind = advancedCreateKindConfig().id;
  const config = advancedCreateModeConfig(kind);
  state.advancedCreateKind = kind;
  state.advancedCreateMode = config.id;
  if (clearMedia) clearAdvancedMediaInputs();
  const custom = Boolean(config.custom);
  if (els.advancedWorkspace) {
    els.advancedWorkspace.classList.toggle("is-create-custom", custom);
    els.advancedWorkspace.classList.toggle("is-create-image", kind === "image");
    els.advancedWorkspace.classList.toggle("is-create-video", kind === "video");
    els.advancedWorkspace.classList.toggle("is-create-custom-kind", kind === "custom");
    els.advancedWorkspace.classList.toggle("is-create-auto-prompt", !custom && advancedCreateModeUsesAutoPrompt(config.id));
    els.advancedWorkspace.classList.toggle("is-create-simple-edit", !custom && advancedCreateModeIsSimpleEdit(config.id));
    Object.values(ADVANCED_CREATE_MODES).flat().forEach((mode) => {
      els.advancedWorkspace.classList.toggle(`is-create-${mode.id}`, mode.id === config.id);
    });
    els.advancedWorkspace.dataset.createMode = config.id;
  }
  if (!custom) {
    if (els.advancedProvider && config.provider) els.advancedProvider.value = config.provider;
    if (config.seedanceMode && els.advancedSeedanceMediaMode) els.advancedSeedanceMediaMode.value = advancedCreateModePreferredSeedanceMode(config);
    if (config.wanMode && els.advancedWanMediaMode) els.advancedWanMediaMode.value = normalizeWanMediaMode(config.wanMode);
    if (config.assetTarget) {
      const targetIds = advancedAssetTargetItems().map((target) => target.id);
      if (clearMedia || !targetIds.includes(state.advancedAssetTarget)) state.advancedAssetTarget = config.assetTarget;
    }
    if (els.advancedRatio) els.advancedRatio.value = "9:16";
    if (kind === "image") {
      if (els.advancedResolution) els.advancedResolution.value = "2K";
      if (els.advancedDuration) els.advancedDuration.value = "1";
    }
    if (kind === "video") {
      const videoResolutions = advancedVideoResolutionOptions(config.provider || "seedance");
      const currentResolution = normalizeAdvancedResolution(els.advancedResolution?.value || videoResolutions[0], config.provider || "seedance");
      if (els.advancedResolution && !videoResolutions.includes(currentResolution)) els.advancedResolution.value = videoResolutions[0];
      const bounds = advancedDurationBounds(config.provider || "seedance");
      const currentDuration = Number(els.advancedDuration?.value || 0);
      if (els.advancedDuration && (!Number.isFinite(currentDuration) || currentDuration < bounds.min || currentDuration > bounds.max)) {
        els.advancedDuration.value = String(bounds.min);
      }
    }
  }
  if (els.advancedPrompt) {
    els.advancedPrompt.setAttribute("placeholder", t(config.placeholderKey || "advanced.promptPlaceholder"));
  }
  if (els.advancedImage) {
    els.advancedImage.accept = advancedCreateUploadAcceptValue(config.id);
    els.advancedImage.multiple = !advancedCreateUploadIsVideo(config.id) && !advancedCreateModeUsesSingleUpload(config.id);
  }
  renderAdvancedPresetBuilder();
}

function renderAdvancedCreateControls() {
  if (els.advancedCreateKindTabs) {
    els.advancedCreateKindTabs.innerHTML = ADVANCED_CREATE_KINDS.map((kind) => `
      <button class="advanced-create-kind ${kind.id === state.advancedCreateKind ? "is-active" : ""}" data-advanced-create-kind="${escapeHtml(kind.id)}" type="button" role="tab" aria-selected="${kind.id === state.advancedCreateKind ? "true" : "false"}">
        <i data-lucide="${escapeHtml(kind.icon)}"></i><span>${escapeHtml(t(kind.labelKey))}</span>
      </button>
    `).join("");
  }
  if (els.advancedCreateModeTabs) {
    const modes = advancedCreateModesForKind();
    if (!modes.some((mode) => mode.id === state.advancedCreateMode)) {
      state.advancedCreateMode = modes[0]?.id || "video-image";
    }
    els.advancedCreateModeTabs.hidden = state.advancedCreateKind === "custom";
    els.advancedCreateModeTabs.innerHTML = modes.map((mode) => `
      <button class="advanced-create-mode ${mode.id === state.advancedCreateMode ? "is-active" : ""}" data-advanced-create-mode="${escapeHtml(mode.id)}" type="button" role="tab" aria-selected="${mode.id === state.advancedCreateMode ? "true" : "false"}">
        <i data-lucide="${escapeHtml(mode.icon)}"></i><span>${escapeHtml(t(mode.labelKey))}</span>
      </button>
    `).join("");
  }
  applyAdvancedCreateMode();
  refreshIcons();
}

function setAdvancedCreateKind(kind = "video") {
  const nextKind = advancedCreateKindConfig(kind).id;
  const previousKind = state.advancedCreateKind;
  state.advancedCreateKind = nextKind;
  state.advancedCreateMode = nextKind === "custom"
    ? ADVANCED_CUSTOM_MODE.id
    : advancedCreateModesForKind(nextKind)[0]?.id || state.advancedCreateMode;
  if (previousKind !== nextKind) resetAdvancedPresets();
  renderAdvancedCreateControls();
  applyAdvancedCreateMode({ clearMedia: previousKind !== nextKind && nextKind !== "custom" });
  updateAdvancedModelControls();
  updateAdvancedButtonCost();
}

function setAdvancedCreateMode(mode = "") {
  if (state.advancedCreateKind === "custom") return;
  const modes = advancedCreateModesForKind();
  const previousMode = state.advancedCreateMode;
  const nextMode = modes.find((item) => item.id === mode)?.id || modes[0]?.id || state.advancedCreateMode;
  state.advancedCreateMode = nextMode;
  const nextConfig = advancedCreateModeConfig(state.advancedCreateKind, nextMode);
  if (previousMode !== nextMode) resetAdvancedPresets();
  renderAdvancedCreateControls();
  applyAdvancedCreateMode({ clearMedia: previousMode !== nextMode && !nextConfig.custom });
  updateAdvancedModelControls();
  updateAdvancedButtonCost();
}

function normalizeWanMediaMode(value = "") {
  const normalized = String(value || "").trim().toLowerCase().replace(/[\s-]+/g, "_");
  const allowed = new Set(["multimodal", "first_frame", "first_last_frame", "first_frame_audio", "first_last_frame_audio", "first_clip", "first_clip_last_frame"]);
  return allowed.has(normalized) ? normalized : "multimodal";
}

function wanModeNeedsFirstFrame(mode) {
  return ["multimodal", "first_frame", "first_last_frame", "first_frame_audio", "first_last_frame_audio"].includes(normalizeWanMediaMode(mode));
}

function wanModeNeedsLastFrame(mode) {
  return ["first_last_frame", "first_last_frame_audio", "first_clip_last_frame"].includes(normalizeWanMediaMode(mode));
}

function wanModeNeedsAudio(mode) {
  return ["multimodal", "first_frame_audio", "first_last_frame_audio"].includes(normalizeWanMediaMode(mode));
}

function wanModeNeedsClip(mode) {
  return ["multimodal", "first_clip", "first_clip_last_frame"].includes(normalizeWanMediaMode(mode));
}

function advancedCostLabel(duration, provider = "seedance", resolution = "720p", ratio = "16:9", options = {}) {
  if (normalizeAdvancedProvider(provider) === "qwen-image3") {
    const key = advancedEstimateKey(duration, provider, resolution, ratio, options);
    const pricing = state.advancedEstimate && state.advancedEstimateKey === key
      ? state.advancedEstimate
      : advancedPricing(duration, provider, resolution, ratio, options);
    const tier = String(pricing.qwenTier || options.qwenTier || "pro") === "standard" ? "Standard" : "Pro";
    return `${t("cost.credits", { credits: formatCredits(pricing.credits) })} - ${tier} ${pricing.resolution || normalizeAdvancedResolution(resolution, provider)}`;
  }
  if (normalizeAdvancedProvider(provider) === "seedream5-image") {
    const key = advancedEstimateKey(duration, provider, resolution, ratio, options);
    const pricing = state.advancedEstimate && state.advancedEstimateKey === key
      ? state.advancedEstimate
      : advancedPricing(duration, provider, resolution, ratio, options);
    return `${t("cost.credits", { credits: formatCredits(pricing.credits) })} - Pro ${pricing.resolution || normalizeAdvancedResolution(resolution, provider)}`;
  }
  if (normalizeAdvancedProvider(provider) === "wan27-image-edit") {
    return `${assetImageModifyCostLabel()} - ${normalizeAdvancedResolution(resolution, provider)}`;
  }
  const key = advancedEstimateKey(duration, provider, resolution, ratio, options);
  const pricing = state.advancedEstimate && state.advancedEstimateKey === key
    ? state.advancedEstimate
    : advancedPricing(duration, provider, resolution, ratio, options);
  const suffix = ` - ${pricing.resolution || normalizeAdvancedResolution(resolution, provider)}`;
  const inputSuffix = Number(pricing.videoInputSeconds || 0) > 0
    ? ` + input ${formatDurationSeconds(pricing.videoInputSeconds)}`
    : "";
  return `${t("cost.creditsDuration", { credits: formatCredits(pricing.credits), duration: formatDurationSeconds(pricing.duration) })}${inputSuffix}${suffix}`;
}

function assetImageModifyCostCredits() {
  return Number(state.config?.assetImageModify?.costCredits ?? DEFAULT_ASSET_IMAGE_MODIFY_CREDITS);
}

function assetImageModifyCostLabel() {
  return t("cost.credits", { credits: formatCredits(assetImageModifyCostCredits()) });
}

function pricingCreditLabel(value) {
  return t("cost.credits", { credits: formatCredits(creditsAmount(value)) });
}

function seedanceInputCreditsPerSecond(resolution = "720p", seedanceTier = "standard") {
  const normalizedResolution = normalizeAdvancedResolution(resolution, "seedance");
  const isFast = String(seedanceTier || "").trim().toLowerCase() === "fast";
  const byResolution = isFast
    ? (state.config?.platform?.advancedPricing?.seedanceFastVideoInputCreditsPerSecondByResolution || {})
    : (state.config?.platform?.advancedPricing?.seedanceVideoInputCreditsPerSecondByResolution || {});
  const fallback = isFast
    ? normalizedResolution === "480p"
      ? ADVANCED_SEEDANCE_FAST_VIDEO_INPUT_480P_CREDITS_PER_SECOND
      : ADVANCED_SEEDANCE_FAST_VIDEO_INPUT_720P_CREDITS_PER_SECOND
    : normalizedResolution === "4k"
    ? ADVANCED_SEEDANCE_VIDEO_INPUT_4K_CREDITS_PER_SECOND
    : normalizedResolution === "1080p"
    ? ADVANCED_SEEDANCE_VIDEO_INPUT_1080P_CREDITS_PER_SECOND
    : normalizedResolution === "480p"
    ? ADVANCED_SEEDANCE_VIDEO_INPUT_480P_CREDITS_PER_SECOND
    : ADVANCED_SEEDANCE_VIDEO_INPUT_720P_CREDITS_PER_SECOND;
  return Number(byResolution[normalizedResolution] || fallback) || fallback;
}

function pricingTable(title, description, columns = [], rows = []) {
  return `
    <section class="pricing-rule-block">
      <div class="pricing-rule-head">
        <h3>${escapeHtml(title)}</h3>
        ${description ? `<p>${escapeHtml(description)}</p>` : ""}
      </div>
      <div class="pricing-table-wrap">
        <table class="pricing-table">
          <thead>
            <tr>${columns.map((column) => `<th>${escapeHtml(column)}</th>`).join("")}</tr>
          </thead>
          <tbody>
            ${rows.map((row) => `<tr>${row.map((cell) => `<td>${cell}</td>`).join("")}</tr>`).join("")}
          </tbody>
        </table>
      </div>
    </section>
  `;
}

function renderPricing() {
  if (!els.pricingRules) return;
  const seedanceResolutions = ["480p", "720p", "1080p", "4k"];
  const seedanceFastResolutions = ["480p", "720p"];
  const wanResolutions = ["720p", "1080p"];
  const commonDurations = [5, 10, 15];
  const creditsPerUsd = Number(state.config?.platform?.advancedPricing?.creditsPerUsd || 100) || 100;
  const unlockCost = Number(state.config?.homeVideo?.characterUnlockCost ?? state.config?.prices?.unlockVideo ?? 750) || 750;
  const packages = topupPackages();

  const publicCredits = (value) => `${formatCredits(creditsAmount(value))} 积分`;
  const publicPricingCredits = (pricing = {}) => creditsAmount(pricing.originalCredits ?? pricing.baseCredits ?? pricing.credits ?? 0);
  const durationSummary = (provider, resolution, options = {}) => commonDurations
    .map((duration) => `${duration}s ${publicCredits(publicPricingCredits(advancedPricing(duration, provider, resolution, "16:9", options)))}`)
    .join(" / ");
  const generationRow = (category, model, resolution, provider, options, note) => {
    const pricing = advancedPricing(5, provider, resolution, "16:9", options);
    return {
      category,
      model,
      spec: resolution,
      unit: `${publicCredits(pricing.creditsPerSecond || publicPricingCredits(pricing) / 5)}/秒`,
      common: durationSummary(provider, resolution, options),
      note,
    };
  };
  const videoInputRow = (resolution, tier) => {
    const inputPerSecond = seedanceInputCreditsPerSecond(resolution, tier);
    return {
      category: "参考视频加收",
      model: `Vipeak 2 ${tier === "fast" ? "Fast" : "Standard"}`,
      spec: resolution,
      unit: `${publicCredits(inputPerSecond)}/秒`,
      common: commonDurations.map((duration) => `${duration}s +${publicCredits(inputPerSecond * duration)}`).join(" / "),
      note: "仅上传参考视频时叠加",
    };
  };
  const seedreamPrice = (resolution) => publicPricingCredits(advancedPricing(1, "seedream5-image", resolution, "1:1", { referenceImageCount: 0 }));
  const seedreamReferenceExtra = creditsAmount(
    Number(state.config?.platform?.advancedPricing?.seedream5Image?.pro?.referenceUsdPerImageAfterFirst ?? ADVANCED_SEEDREAM5_PRO_REFERENCE_USD_PER_IMAGE_AFTER_FIRST)
    * creditsPerUsd
  );
  const rows = [
    ...seedanceResolutions.map((resolution) => generationRow("视频生成", "Vipeak 2 Standard", resolution, "seedance", { seedanceTier: "standard" }, "支持 5-15 秒")),
    ...seedanceFastResolutions.map((resolution) => generationRow("视频生成", "Vipeak 2 Fast", resolution, "seedance", { seedanceTier: "fast" }, "Fast 支持 480p / 720p")),
    ...wanResolutions.map((resolution) => generationRow("视频生成", "Vipeak 1", resolution, "wan27", {}, "支持 2-15 秒")),
    ...seedanceResolutions.map((resolution) => videoInputRow(resolution, "standard")),
    ...seedanceFastResolutions.map((resolution) => videoInputRow(resolution, "fast")),
    {
      category: "图片生成/编辑",
      model: "Vipeak 1 Image",
      spec: "1K / 2K / 4K",
      unit: `${publicCredits(assetImageModifyCostCredits())}/张`,
      common: `单张 ${publicCredits(assetImageModifyCostCredits())}`,
      note: "4K 仅文生图",
    },
    {
      category: "图片生成",
      model: "Seedream 5.0 Pro",
      spec: "1K",
      unit: `${publicCredits(seedreamPrice("1K"))}/张`,
      common: `单张 ${publicCredits(seedreamPrice("1K"))}`,
      note: `第 2 张起参考图 +${publicCredits(seedreamReferenceExtra)}/张`,
    },
    {
      category: "图片生成",
      model: "Seedream 5.0 Pro",
      spec: "2K",
      unit: `${publicCredits(seedreamPrice("2K"))}/张`,
      common: `单张 ${publicCredits(seedreamPrice("2K"))}`,
      note: `第 2 张起参考图 +${publicCredits(seedreamReferenceExtra)}/张`,
    },
    {
      category: "角色解锁",
      model: "Character unlock",
      spec: "每个角色",
      unit: "-",
      common: publicCredits(unlockCost),
      note: "解锁角色剩余视频",
    },
  ];
  const packageChips = packages.length
    ? packages.map((item) => `<span><strong>${escapeHtml(item.currency)} $${escapeHtml(formatCredits(item.amount))}</strong>${escapeHtml(publicCredits(item.credits))}</span>`).join("")
    : "";
  els.pricingRules.innerHTML = `
    <div class="pricing-shot-card">
      <div class="pricing-shot-title">
        <div>
          <p>Vipeak AI</p>
          <h3>公开价格表</h3>
        </div>
        <span>1 USD = ${escapeHtml(formatCredits(creditsPerUsd))} 积分</span>
      </div>
      <div class="pricing-shot-table-wrap">
        <table class="pricing-shot-table">
          <thead>
            <tr>
              <th>类型</th>
              <th>模型/项目</th>
              <th>规格</th>
              <th>单价</th>
              <th>常用价格</th>
              <th>说明</th>
            </tr>
          </thead>
          <tbody>
            ${rows.map((row) => `
              <tr>
                <td>${escapeHtml(row.category)}</td>
                <td><strong>${escapeHtml(row.model)}</strong></td>
                <td>${escapeHtml(row.spec)}</td>
                <td>${escapeHtml(row.unit)}</td>
                <td>${escapeHtml(row.common)}</td>
                <td>${escapeHtml(row.note)}</td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>
      <div class="pricing-shot-foot">
        <span>视频最终扣分 = 生成视频价格 + 参考视频加收（如有）。公开价不包含用户专属折扣。</span>
        ${packageChips ? `<div class="pricing-package-list">${packageChips}</div>` : ""}
      </div>
    </div>
  `;
}

function advancedButtonCostLabel(duration, provider = "seedance", resolution = "720p", ratio = "16:9", options = {}) {
  const fullLabel = advancedCostLabel(duration, provider, resolution, ratio, options);
  if (state.advancedCreateKind === "custom") return fullLabel;
  const normalizedProvider = normalizeAdvancedProvider(provider);
  if (["seedream5-image", "qwen-image3"].includes(normalizedProvider)) return fullLabel;
  if (normalizedProvider === "wan27-image-edit") return assetImageModifyCostLabel();
  const pricing = state.advancedEstimate && state.advancedEstimateKey === advancedEstimateKey(duration, provider, resolution, ratio, options)
    ? state.advancedEstimate
    : advancedPricing(duration, provider, resolution, ratio, options);
  return t("cost.credits", { credits: formatCredits(pricing.credits) });
}

function advancedEstimateKey(duration, provider = "seedance", resolution = "720p", ratio = "16:9", options = {}) {
  const normalizedProvider = normalizeAdvancedProvider(provider);
  if (normalizedProvider === "qwen-image3") {
    return [
      normalizedProvider,
      options.qwenTier || currentQwenImage3Tier(),
      normalizeAdvancedResolution(resolution, normalizedProvider),
      normalizeVideoRatio(ratio),
      Math.max(0, Number(options.referenceImageCount ?? selectedAdvancedReferenceImages("qwen-image3").length) || 0),
      Math.max(1, Number(options.outputImageCount ?? els.advancedQwenOutputCount?.value ?? 1) || 1),
      Number(state.user?.pricingMultiplier || 1),
    ].join("|");
  }
  if (normalizedProvider === "seedream5-image") {
    return [
      normalizedProvider,
      "pro",
      normalizeAdvancedResolution(resolution, normalizedProvider),
      Math.max(0, Number(options.referenceImageCount ?? selectedAdvancedReferenceImages("seedream5-image").length) || 0),
      Number(state.user?.pricingMultiplier || 1),
    ].join("|");
  }
  if (normalizedProvider === "wan27-image-edit") {
    return [
      normalizedProvider,
      normalizeAdvancedResolution(resolution, normalizedProvider),
      normalizeVideoRatio(ratio),
      Number(state.user?.pricingMultiplier || 1),
    ].join("|");
  }
  const bounds = advancedDurationBounds(normalizedProvider);
  const rawDuration = Number(duration || bounds.fallback);
  const seconds = Number.isFinite(rawDuration) ? Math.min(bounds.max, Math.max(bounds.min, rawDuration)) : bounds.fallback;
  const inputVideoSeconds = ["seedance", "seedance25", "wan27", "happyhorse"].includes(normalizedProvider)
    ? positiveDurationSeconds(options.inputVideoSeconds ?? options.videoInputSeconds, 0)
    : 0;
  const referenceVideoSignature = ["seedance", "seedance25"].includes(normalizedProvider)
    ? (Array.isArray(options.referenceVideoUrls) ? options.referenceVideoUrls : []).map((item) => String(item || "").trim()).filter(Boolean).join(",")
    : "";
  return [
    normalizedProvider,
    normalizedProvider === "seedance" ? (String(options.seedanceTier || "").trim().toLowerCase() === "fast" ? "fast" : "standard") : "",
    options.videoCapability || (typeof currentAdvancedVideoCapability === "function" ? currentAdvancedVideoCapability() : ""),
    options.mode || options.animateMode || "",
    normalizeAdvancedResolution(resolution, normalizedProvider),
    normalizeVideoRatio(ratio),
    seconds,
    inputVideoSeconds,
    referenceVideoSignature,
    options.qwenTier || "",
    Math.max(0, Number(options.referenceImageCount || 0) || 0),
    Math.max(1, Number(options.outputImageCount || 1) || 1),
    Number(state.user?.pricingMultiplier || 1),
  ].join("|");
}

function requestAdvancedEstimate(duration, provider = "seedance", resolution = "720p", ratio = "16:9", options = {}) {
  if (tenantFeature("toolOnly", false)) return;
  if (normalizeAdvancedProvider(provider) === "wan27-image-edit") return;
  const key = advancedEstimateKey(duration, provider, resolution, ratio, options);
  if (!state.user || state.advancedEstimateKey === key) return;
  window.clearTimeout(state.advancedEstimateTimer);
  state.advancedEstimateTimer = window.setTimeout(async () => {
    try {
      const payload = await requestJson("/api/advanced/estimate", {
        method: "POST",
        body: {
          provider,
          duration,
          resolution,
          ratio,
          inputVideoSeconds: positiveDurationSeconds(options.inputVideoSeconds ?? options.videoInputSeconds, 0),
          referenceVideoUrls: Array.isArray(options.referenceVideoUrls) ? options.referenceVideoUrls : [],
          seedanceTier: options.seedanceTier,
          videoCapability: options.videoCapability,
          model: options.model,
          mode: options.mode || options.animateMode,
          seedreamTier: options.seedreamTier || options.seedream5Tier,
          qwenTier: options.qwenTier,
          outputImageCount: Math.max(1, Number(options.outputImageCount || 1) || 1),
          n: Math.max(1, Number(options.outputImageCount || 1) || 1),
          referenceImageCount: Math.max(0, Number(options.referenceImageCount || 0) || 0),
        },
      });
      state.advancedEstimate = payload.pricing || null;
      state.advancedEstimateKey = key;
      updateAdvancedButtonCost();
      renderAdvancedAssetTargets();
    } catch (error) {
      console.warn("advanced estimate failed", error);
    }
  }, 180);
}

function updateAdvancedButtonCost() {
  if (!els.advancedSubmitBtn) return;
  const rawDuration = Number(els.advancedDuration?.value || 5);
  const bounds = advancedDurationBounds(currentAdvancedProvider());
  const provider = currentAdvancedProvider();
  const videoCapability = currentAdvancedVideoCapability();
  const configuredDuration = Number.isFinite(rawDuration) ? Math.min(bounds.max, Math.max(bounds.min, rawDuration)) : bounds.fallback;
  const sourceVideoSeconds = advancedVideoEditUsesSourceDuration(videoCapability)
    ? currentAdvancedAliyunSourceVideoSeconds(0)
    : provider === "seedance25" && normalizeSeedanceMediaMode(els.advancedSeedanceMediaMode?.value || "") === "edit"
    ? currentSeedanceVideoInputSeconds(0, provider)
    : 0;
  const duration = sourceVideoSeconds > 0
    ? Math.min(bounds.max, Math.max(bounds.min, Math.ceil(sourceVideoSeconds)))
    : configuredDuration;
  const seedanceTier = currentSeedanceTier();
  if (state.advancedCreateKind === "video" && advancedCreateModeUsesAutoPrompt()) {
    els.advancedSubmitBtn.innerHTML = `<i data-lucide="sparkles"></i>${escapeHtml(t("common.generate"))}`;
    refreshIcons();
    return;
  }
  if (provider === "wan27-image-edit") {
    els.advancedSubmitBtn.innerHTML = `<i data-lucide="wand-sparkles"></i>${escapeHtml(t("template.generate", { cost: advancedButtonCostLabel(duration, provider, currentAdvancedResolution(), currentAdvancedRatio()) }))}`;
    refreshIcons();
    return;
  }
  const options = {
    inputVideoSeconds: ["seedance", "seedance25"].includes(provider)
      ? currentSeedanceVideoInputSeconds(duration, provider)
      : ["wan27", "happyhorse"].includes(provider)
      ? currentAdvancedAliyunSourceVideoSeconds(duration)
      : 0,
    referenceVideoUrls: ["seedance", "seedance25"].includes(provider) ? currentSeedanceEstimateReferenceVideoUrls(provider) : [],
    seedanceTier: provider === "seedream5-image" ? currentSeedreamTier() : seedanceTier,
    qwenTier: provider === "qwen-image3" ? currentQwenImage3Tier() : undefined,
    outputImageCount: provider === "qwen-image3" ? Number(els.advancedQwenOutputCount?.value || 1) : 1,
    referenceImageCount: ["seedream5-image", "qwen-image3"].includes(provider) ? selectedAdvancedReferenceImages(provider).length : 0,
    videoCapability,
    model: videoCapability === "wan-legacy" ? String(els.advancedLegacyWanModel?.value || "") : undefined,
    mode: provider === "seedance25"
      ? normalizeSeedanceMediaMode(els.advancedSeedanceMediaMode?.value || "omini")
      : ["wan-animate-move", "wan-animate-mix"].includes(videoCapability)
      ? String(els.advancedWanAnimateMode?.value || "wan-std")
      : undefined,
  };
  requestAdvancedEstimate(duration, provider, currentAdvancedResolution(), currentAdvancedRatio(), options);
  els.advancedSubmitBtn.innerHTML = `<i data-lucide="sparkles"></i>${escapeHtml(t("template.generate", { cost: advancedButtonCostLabel(duration, provider, currentAdvancedResolution(), currentAdvancedRatio(), options) }))}`;
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
  if (!response.ok || payload.ok === false) {
    const error = new Error(payload.message || payload.detail || `Request failed: ${response.status}`);
    error.statusCode = response.status;
    error.code = payload.code || "";
    error.payload = payload;
    error.details = payload.details || null;
    throw error;
  }
  return payload;
}

function cloneWorkflowDefault() {
  return {
    nodes: WORKFLOW_DEFAULT_NODES.map((node) => ({ ...node, data: { ...(node.data || {}) } })),
    edges: WORKFLOW_DEFAULT_EDGES.map(([from, to]) => ({ from, to })),
    physics: [],
    directorPrompt: "",
    zoom: 1,
    layoutVersion: WORKFLOW_NODE_LAYOUT_VERSION,
  };
}

function normalizeWorkflowLayout(workflow = {}) {
  if (!workflow || !Array.isArray(workflow.nodes)) return workflow;
  const step = WORKFLOW_NODE_WIDTH + WORKFLOW_NODE_GAP;
  const upload = workflow.nodes.find((node) => node.type === "upload");
  const output = workflow.nodes.find((node) => node.type === "output");
  const videoNodes = workflow.nodes.filter((node) => node.type === "video");
  videoNodes.forEach((node) => {
    const data = { ...(node.data || {}) };
    const aliasedModelId = WORKFLOW_MODEL_ALIASES?.[data.modelId] || data.modelId || "nude";
    node.data = {
      ...data,
      modelId: aliasedModelId,
      activeTab: data.activeTab || "preview",
      stripFirst: data.stripFirst !== false,
      faceSwapMode: data.faceSwapMode !== false,
      addSound: data.addSound !== false,
    };
  });
  if (videoNodes[0] && (videoNodes[0].title === "Nude V3 (Kling)" || videoNodes[0].data?.modelId === "nude")) {
    videoNodes[0].title = "Nude";
    videoNodes[0].data.modelId = "nude";
  }
  if (videoNodes[1] && videoNodes[1].id === "video-2" && videoNodes[1].title === "Deepthroat") {
    videoNodes[1].title = "Nude Video";
    videoNodes[1].data.modelId = "nude-video";
  }
  if (Number(workflow.layoutVersion || 0) >= WORKFLOW_NODE_LAYOUT_VERSION) return workflow;
  if (upload) {
    upload.x = 30;
    upload.y = 150;
  }
  videoNodes.forEach((node, index) => {
    node.x = 30 + step * (index + 1);
    node.y = 150 + Math.max(0, index - 1) * 24;
  });
  if (output) {
    output.x = 30 + step * (videoNodes.length + 1);
    output.y = 150;
  }
  workflow.layoutVersion = WORKFLOW_NODE_LAYOUT_VERSION;
  return workflow;
}

function normalizeWorkflowPreset(preset = {}) {
  const id = String(preset.id || preset.sourceId || "").trim();
  const label = String(preset.label || preset.name || id || "Workflow preset").trim();
  return {
    id: id || label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""),
    label,
    prompt: String(preset.prompt || preset.defaultPrompt || "").trim(),
    previewUrl: String(preset.previewUrl || preset.demoUrl || "").trim(),
    posterUrl: String(preset.posterUrl || "").trim(),
    category: String(preset.category || "PlayFlux").trim() || "PlayFlux",
    sourceId: String(preset.sourceId || "").trim(),
  };
}

function workflowPresetLibrary() {
  const remote = (state.workflowPresets || []).map(normalizeWorkflowPreset).filter((preset) => preset.id && preset.label);
  if (!remote.length) return WORKFLOW_MODEL_LIBRARY;
  const byId = new Map(WORKFLOW_MODEL_LIBRARY.map((preset) => [preset.id, { ...preset }]));
  remote.forEach((preset) => {
    const existing = byId.get(preset.id);
    byId.set(preset.id, existing ? { ...existing, ...preset, prompt: preset.prompt || existing.prompt } : preset);
  });
  return [...byId.values()];
}

function workflowModelById(modelId = "") {
  const library = workflowPresetLibrary();
  const normalizedModelId = WORKFLOW_MODEL_ALIASES?.[modelId] || modelId;
  return library.find((model) => model.id === normalizedModelId) || library[0] || WORKFLOW_MODEL_LIBRARY[0];
}

function workflowUserStorageKey() {
  const userId = String(state.user?.id || "").trim();
  const username = String(state.user?.username || "").trim().toLowerCase();
  const fallback = state.token ? `token:${String(state.token).slice(-16)}` : "guest";
  return `${WORKFLOW_STORAGE_KEY}:${userId || username || fallback}`;
}

function ensureWorkflowState() {
  if (state.workflow?.nodes?.length) {
    normalizeWorkflowLayout(state.workflow);
    return state.workflow;
  }
  try {
    const saved = JSON.parse(localStorage.getItem(workflowUserStorageKey()) || "null");
    if (saved?.nodes?.length) {
      state.workflow = {
        nodes: saved.nodes.map((node) => ({ ...node, data: { ...(node.data || {}) } })),
        edges: Array.isArray(saved.edges) ? saved.edges : [],
        physics: Array.isArray(saved.physics) ? saved.physics : [],
        directorPrompt: saved.directorPrompt || "",
        zoom: normalizeWorkflowZoom(saved.zoom),
        layoutVersion: Number(saved.layoutVersion || 0),
      };
      normalizeWorkflowLayout(state.workflow);
      return state.workflow;
    }
  } catch (_) {}
  state.workflow = cloneWorkflowDefault();
  normalizeWorkflowLayout(state.workflow);
  return state.workflow;
}

function persistWorkflowState() {
  try {
    const workflow = ensureWorkflowState();
    localStorage.setItem(workflowUserStorageKey(), JSON.stringify({
      nodes: workflow.nodes,
      edges: workflow.edges,
      physics: workflow.physics,
      directorPrompt: workflow.directorPrompt || "",
      zoom: normalizeWorkflowZoom(workflow.zoom),
      layoutVersion: workflow.layoutVersion || WORKFLOW_NODE_LAYOUT_VERSION,
    }));
  } catch (_) {}
}

function workflowNodeById(nodeId = "") {
  return ensureWorkflowState().nodes.find((node) => node.id === nodeId) || null;
}

function normalizeWorkflowZoom(value = 1) {
  const numeric = Number(value || 1);
  if (!Number.isFinite(numeric)) return 1;
  return Math.max(0.55, Math.min(1.8, Math.round(numeric * 100) / 100));
}

function workflowZoom() {
  const workflow = ensureWorkflowState();
  workflow.zoom = normalizeWorkflowZoom(workflow.zoom);
  return workflow.zoom;
}

const WORKFLOW_CANVAS_BASE_WIDTH = 3200;
const WORKFLOW_CANVAS_BASE_HEIGHT = 720;
const WORKFLOW_CANVAS_PADDING = 140;
const WORKFLOW_CANVAS_MAX_WIDTH = 12000;
const WORKFLOW_CANVAS_MAX_HEIGHT = 3200;

function workflowCanvasLogicalSize() {
  const canvas = els.workflowRoot?.querySelector(".workflow-canvas");
  const zoom = workflowZoom();
  const visibleWidth = canvas ? Math.ceil(canvas.clientWidth / zoom) : WORKFLOW_CANVAS_BASE_WIDTH;
  const visibleHeight = canvas ? Math.ceil(canvas.clientHeight / zoom) : WORKFLOW_CANVAS_BASE_HEIGHT;
  const nodes = state.workflow?.nodes || [];
  const nodeMaxX = nodes.reduce((max, node) => Math.max(max, Number(node.x || 0) + WORKFLOW_NODE_WIDTH + WORKFLOW_CANVAS_PADDING), 0);
  const nodeMaxY = nodes.reduce((max, node) => Math.max(max, Number(node.y || 0) + 420 + WORKFLOW_CANVAS_PADDING), 0);
  return {
    width: Math.min(WORKFLOW_CANVAS_MAX_WIDTH, Math.max(WORKFLOW_CANVAS_BASE_WIDTH, visibleWidth + WORKFLOW_CANVAS_PADDING, nodeMaxX)),
    height: Math.min(WORKFLOW_CANVAS_MAX_HEIGHT, Math.max(WORKFLOW_CANVAS_BASE_HEIGHT, visibleHeight + WORKFLOW_CANVAS_PADDING, nodeMaxY)),
  };
}

function workflowCanvasStageStyle() {
  const size = workflowCanvasLogicalSize();
  return `--workflow-zoom:${workflowZoom()};--workflow-stage-width:${size.width}px;--workflow-stage-height:${size.height}px`;
}

function syncWorkflowCanvasStageSize() {
  const size = workflowCanvasLogicalSize();
  const stage = els.workflowRoot?.querySelector(".workflow-canvas-stage");
  if (stage) {
    stage.style.setProperty("--workflow-stage-width", `${size.width}px`);
    stage.style.setProperty("--workflow-stage-height", `${size.height}px`);
  }
  const svg = els.workflowRoot?.querySelector(".workflow-edges");
  if (svg) svg.setAttribute("viewBox", `0 0 ${size.width} ${size.height}`);
}

function workflowVideoNodes() {
  return ensureWorkflowState().nodes
    .filter((node) => node.type === "video")
    .sort((left, right) => Number(left.x || 0) - Number(right.x || 0));
}

function workflowNodeByType(type = "") {
  return ensureWorkflowState().nodes.find((node) => node.type === type) || null;
}

function workflowOutgoingEdges(nodeId = "") {
  return ensureWorkflowState().edges.filter((edge) => edge.from === nodeId);
}

function workflowIncomingEdges(nodeId = "") {
  return ensureWorkflowState().edges.filter((edge) => edge.to === nodeId);
}

function workflowOrderedVideoNodes() {
  const workflow = ensureWorkflowState();
  const upload = workflowUploadNode();
  if (!upload) return workflowVideoNodes();
  const nodeById = new Map(workflow.nodes.map((node) => [node.id, node]));
  const videoNodes = workflowVideoNodes();
  const reachableIds = new Set();
  const queue = [upload.id];
  for (let guard = 0; queue.length && guard < workflow.nodes.length * 4 + 8; guard += 1) {
    const currentId = queue.shift();
    workflow.edges
      .filter((edge) => edge.from === currentId)
      .sort((left, right) => Number(nodeById.get(left.to)?.x || 0) - Number(nodeById.get(right.to)?.x || 0))
      .forEach((edge) => {
        const next = nodeById.get(edge.to);
        if (!next || next.type === "output" || reachableIds.has(next.id)) return;
        if (next.type === "video") reachableIds.add(next.id);
        queue.push(next.id);
      });
  }
  const candidates = reachableIds.size === videoNodes.length
    ? videoNodes.filter((node) => reachableIds.has(node.id))
    : videoNodes;
  if (!candidates.length) return [];

  const candidateIds = new Set(candidates.map((node) => node.id));
  const incomingCounts = new Map(candidates.map((node) => [node.id, 0]));
  workflow.edges.forEach((edge) => {
    if (candidateIds.has(edge.from) && candidateIds.has(edge.to)) {
      incomingCounts.set(edge.to, (incomingCounts.get(edge.to) || 0) + 1);
    }
  });
  const ordered = [];
  const ready = candidates
    .filter((node) => (incomingCounts.get(node.id) || 0) === 0)
    .sort((left, right) => Number(left.x || 0) - Number(right.x || 0));
  while (ready.length) {
    const node = ready.shift();
    if (!node || ordered.some((item) => item.id === node.id)) continue;
    ordered.push(node);
    workflow.edges
      .filter((edge) => edge.from === node.id && candidateIds.has(edge.to))
      .forEach((edge) => {
        incomingCounts.set(edge.to, Math.max(0, (incomingCounts.get(edge.to) || 0) - 1));
        if ((incomingCounts.get(edge.to) || 0) === 0) {
          const next = nodeById.get(edge.to);
          if (next && !ordered.some((item) => item.id === next.id) && !ready.some((item) => item.id === next.id)) {
            ready.push(next);
            ready.sort((left, right) => Number(left.x || 0) - Number(right.x || 0));
          }
        }
      });
  }
  const missing = candidates.filter((node) => !ordered.some((item) => item.id === node.id));
  return [...ordered, ...missing].sort((left, right) => {
    const leftIndex = ordered.findIndex((node) => node.id === left.id);
    const rightIndex = ordered.findIndex((node) => node.id === right.id);
    if (leftIndex >= 0 && rightIndex >= 0) return leftIndex - rightIndex;
    if (leftIndex >= 0) return -1;
    if (rightIndex >= 0) return 1;
    return Number(left.x || 0) - Number(right.x || 0);
  });
}

function workflowFirstVideoNode() {
  return workflowOrderedVideoNodes()[0] || null;
}

function workflowUploadNode() {
  return workflowNodeByType("upload");
}

function selectedWorkflowNode() {
  return workflowNodeById(state.workflowSelectedNodeId) || workflowVideoNodes()[0] || workflowUploadNode();
}

function workflowLog(message = "") {
  const text = String(message || "").trim();
  if (!text) return;
  state.workflowLogs = [{ time: new Date().toLocaleTimeString(), message: text }, ...(state.workflowLogs || [])].slice(0, 12);
  renderWorkflowPanel();
}

async function loadWorkflowPresets() {
  if (state.workflowPresetsLoaded || state.workflowPresetsLoading) return;
  state.workflowPresetsLoading = true;
  try {
    const payload = await requestJson("/api/workflow/presets");
    state.workflowPresets = (payload.presets || []).map(normalizeWorkflowPreset).filter((preset) => preset.id && preset.label);
    state.workflowPresetsLoaded = true;
  } catch (_) {
    state.workflowPresetsLoaded = true;
  } finally {
    state.workflowPresetsLoading = false;
    if (state.tab === "workflow") renderWorkflowPanel();
  }
}

function workflowNodeStatusText(node = {}) {
  return node.data?.status ? statusLabel(node.data.status) : "Ready";
}

function workflowNodeHasSuccessfulResult(node = {}) {
  const status = node.data?.status || node.data?.record?.status || "";
  return Boolean(workflowNodeResultVideo(node)) && isSucceededGenerationStatus(status || "succeeded");
}

function workflowExecutionClearPatch() {
  return {
    status: "",
    taskId: "",
    record: null,
    resultVideoUrl: "",
    posterUrl: "",
    lastFrameUrl: "",
    keyframeImageUrl: "",
    keyframeTaskId: "",
    keyframeRecord: null,
    keyframeSourceKey: "",
    stripTargetImageUrl: "",
    stripTargetTaskId: "",
    stripTargetRecord: null,
    stripTargetSourceKey: "",
    error: "",
    videoUrls: [],
    taskIds: [],
  };
}

function workflowClearNodeExecution(node = null) {
  if (!node) return;
  node.data = { ...(node.data || {}), ...workflowExecutionClearPatch() };
}

function clearWorkflowExecutionResults({ fromNodeId = "", message = "Execution cleared.", render = true } = {}) {
  const ordered = workflowOrderedVideoNodes();
  const startIndex = fromNodeId ? ordered.findIndex((node) => node.id === fromNodeId) : 0;
  if (!fromNodeId) workflowClearNodeExecution(workflowUploadNode());
  ordered.slice(Math.max(0, startIndex)).forEach(workflowClearNodeExecution);
  workflowClearNodeExecution(workflowNodeByType("output"));
  state.workflowCancelRequested = false;
  state.workflowActiveNodeId = "";
  state.workflowMessage = message;
  persistWorkflowState();
  if (render) renderWorkflowPanel();
}

function workflowNodeRunState(node = {}) {
  const active = state.workflowRunning && state.workflowActiveNodeId === node.id;
  if (active) {
    return { canRun: false, disabled: true, icon: "loader-circle", label: "Running", reason: "This node is running." };
  }
  if (state.workflowRunning) {
    return { canRun: false, disabled: true, icon: "play", label: "Run", reason: "Workflow is running." };
  }
  const upload = workflowUploadNode();
  if (!upload?.data?.startImage) {
    return { canRun: false, disabled: true, icon: "play", label: "Run", reason: "Upload a start image first." };
  }
  if (node.type === "upload") {
    const firstVideo = workflowFirstVideoNode();
    if (!firstVideo) {
      return { canRun: false, disabled: true, icon: "play", label: "Run first", reason: "Connect a video node first." };
    }
    const model = workflowModelById(firstVideo.data?.modelId);
    return {
      canRun: true,
      disabled: false,
      icon: "play",
      label: node.data?.keyframeImageUrl ? "Prepare again" : "Prepare",
      reason: `Prepare ${model.label} keyframe from this input.`,
    };
  }
  const ordered = workflowOrderedVideoNodes();
  const index = ordered.findIndex((item) => item.id === node.id);
  if (index < 0) {
    return { canRun: false, disabled: true, icon: "play", label: "Run", reason: "Connect this node into the workflow first." };
  }
  const previous = index > 0 ? ordered[index - 1] : null;
  if (previous && !workflowNodeHasSuccessfulResult(previous)) {
    return { canRun: false, disabled: true, icon: "play", label: "Run", reason: "Run the previous node first." };
  }
  return {
    canRun: true,
    disabled: false,
    icon: "play",
    label: workflowNodeHasSuccessfulResult(node) ? "Run again" : "Run",
    reason: "Run this node.",
  };
}

function workflowNodeResultVideo(node = {}) {
  return node.data?.resultVideoUrl || generationVideoUrl(node.data?.record || {}) || "";
}

function workflowNodePoster(node = {}) {
  return node.data?.posterUrl
    || node.data?.lastFrameUrl
    || node.data?.stripTargetImageUrl
    || node.data?.keyframeImageUrl
    || generationPosterUrl(node.data?.record || {})
    || node.data?.sourceImage
    || "";
}

function workflowPhysicsPrompt() {
  const active = new Set(ensureWorkflowState().physics || []);
  return WORKFLOW_PHYSICS_MODULES
    .filter((module) => active.has(module.id))
    .map((module) => module.prompt)
    .join(", ");
}

function workflowEffectivePrompt(node = {}) {
  const model = workflowModelById(node.data?.modelId);
  const base = String(node.data?.prompt || "").trim() || model.prompt;
  const physics = workflowPhysicsPrompt();
  return [base, physics].filter(Boolean).join(". ");
}

function workflowImageKey(value = "") {
  const text = String(value || "");
  let hash = 0;
  for (let index = 0; index < text.length; index += 1) {
    hash = ((hash << 5) - hash + text.charCodeAt(index)) | 0;
  }
  return `${text.length}:${Math.abs(hash)}`;
}

function workflowCostLabel(node = {}) {
  const duration = Number(node.data?.duration || 5);
  const resolution = node.data?.resolution || "720p";
  return formatCredits(advancedPricing(duration, "seedance", resolution, node.data?.ratio || "9:16", {
    seedanceTier: "standard",
    inputVideoSeconds: 0,
  }).credits);
}

function workflowPromptPreview(model = {}, customPrompt = "") {
  const custom = String(customPrompt || "").trim();
  return custom || model.prompt || "";
}

function workflowReferenceImagePayload(sourceImage = "") {
  if (!sourceImage) return [];
  return [{
    dataUrl: dataUrlValue(sourceImage) || undefined,
    imageUrl: absoluteHttpUrl(sourceImage) || undefined,
    fileName: "workflow-source.png",
  }];
}

function workflowReferenceImageItems(images = []) {
  return images.filter(Boolean).map((image, index) => ({
    dataUrl: dataUrlValue(image) || undefined,
    imageUrl: absoluteHttpUrl(image) || (String(image || "").startsWith("/") ? image : undefined),
    fileName: `workflow-reference-${index + 1}.png`,
  }));
}

function workflowSeedanceReferenceImages(images = []) {
  const seen = new Set();
  return images
    .map((image, index) => {
      const value = String(image || "").trim();
      const dataUrl = dataUrlValue(value);
      const url = dataUrl ? "" : (absoluteHttpUrl(value) || (value.startsWith("/") ? value : ""));
      const key = dataUrl || url;
      if (!key || seen.has(key)) return null;
      seen.add(key);
      return {
        ...(dataUrl ? { dataUrl } : { imageUrl: url }),
        fileName: `workflow-reference-${index + 1}.png`,
        name: index === 0 ? "Workflow subject state" : "Workflow scene reference",
      };
    })
    .filter(Boolean)
    .slice(0, ADVANCED_SEEDANCE_REFERENCE_LIMIT);
}

function workflowModelReferenceImage(model = {}) {
  return String(model.posterUrl || model.imageUrl || model.referenceImageUrl || "").trim();
}

function workflowModelReferenceVideo(model = {}) {
  const value = String(model.previewUrl || model.videoUrl || "").trim();
  return absoluteHttpUrl(value) || (value.startsWith("data:") ? value : "");
}

function workflowImageRequestFields(value = "", prefix = "first") {
  const dataUrl = dataUrlValue(value);
  const publicUrl = absoluteHttpUrl(value) || (String(value || "").startsWith("/") ? value : "");
  if (prefix === "end") {
    return dataUrl
      ? { endImageDataUrl: dataUrl, endImageFileName: "workflow-end.png" }
      : publicUrl
        ? { endImageUrl: publicUrl }
        : {};
  }
  return dataUrl
    ? { firstFrameDataUrl: dataUrl, firstFrameFileName: "workflow-start.png" }
    : publicUrl
      ? { firstFrameUrl: publicUrl }
      : {};
}

function workflowFacePrompt(faceImage = "") {
  return faceImage ? "Preserve the same adult face identity and facial features consistently across all clips." : "";
}

function workflowNodeOptionEnabled(node = {}, key = "") {
  return node?.data?.[key] !== false;
}

function workflowStripPrompt(node = {}) {
  if (!workflowNodeOptionEnabled(node, "stripFirst")) return "";
  return "Strip Her Nude First is enabled: begin with the provided clothed first frame, then make the same consenting adult subject visibly remove clothing and transition into a nude state before continuing the selected action. Preserve the same face, body, pose continuity, lighting, and camera direction.";
}

function workflowKeyframeSourceKey(node = {}, baseImage = "", faceImage = "", { firstNode = false } = {}) {
  return [
    workflowImageKey(baseImage),
    workflowImageKey(faceImage),
    node.data?.modelId || "",
    workflowEffectivePrompt(node),
    node.data?.ratio || "9:16",
    firstNode ? "first" : "next",
    workflowNodeOptionEnabled(node, "stripFirst") ? "strip" : "no-strip",
  ].join("|");
}

function workflowStripSourceKey(node = {}, keyframeImage = "") {
  return [
    workflowImageKey(keyframeImage),
    node.data?.modelId || "",
    workflowEffectivePrompt(node),
    node.data?.ratio || "9:16",
  ].join("|");
}

function workflowKeyframePrompt(node = {}, { hasFaceReference = false, firstNode = false } = {}) {
  const action = workflowEffectivePrompt(node);
  const stripFirst = firstNode && workflowNodeOptionEnabled(node, "stripFirst");
  return [
    "Use Image 1 as the exact same consenting adult subject identity reference.",
    hasFaceReference ? "Use Image 2 as the face identity reference and preserve facial features closely." : "",
    stripFirst
      ? "Create the opening keyframe before clothing removal. Keep the clothing and outfit from Image 1, while setting up the scene, pose, camera angle, and action context."
      : firstNode
      ? "Create the opening keyframe for this workflow video segment."
      : "Create the next keyframe for this workflow video segment, continuing from Image 1 while changing only what the segment requires.",
    "Render one photorealistic full-frame image that already contains the intended scene, pose, action setup, camera angle, lighting, and composition.",
    "Keep the same person, face, hairstyle, body type, and visual continuity. Do not invent a different character.",
    action ? `Segment direction: ${action}` : "",
    "Do not create a collage, split screen, storyboard, text, subtitles, watermark, UI, or multiple frames.",
  ].filter(Boolean).join(" ");
}

function workflowStripImagePrompt(node = {}) {
  const action = workflowEffectivePrompt(node);
  return [
    "Use Image 1 as the exact same keyframe, consenting adult subject, face, hairstyle, body type, camera angle, lighting, and background.",
    "Create one photorealistic target frame in the same scene and composition after the subject has removed clothing and is nude.",
    "Keep identity, framing, pose continuity, scene, camera direction, and lighting consistent with Image 1. Do not redesign the person or scene.",
    action ? `The target frame should be suitable as the end frame for this video action: ${action}` : "",
    "No text, no watermark, no collage, no split screen.",
  ].filter(Boolean).join(" ");
}

async function workflowEnsureImageEditSources(images = [], nodeId = "", label = "Workflow keyframe source") {
  const imageAssetIds = [];
  for (let index = 0; index < images.length; index += 1) {
    const value = String(images[index] || "").trim();
    if (!value) continue;
    const dataUrl = dataUrlValue(value);
    const url = dataUrl ? "" : (absoluteHttpUrl(value) || (value.startsWith("/") ? absoluteHttpUrl(value) : ""));
    if (!dataUrl && !url) throw new Error("Workflow source image is not accessible.");
    const payload = await requestJson("/api/user-assets", {
      method: "POST",
      body: {
          ...(dataUrl ? { dataUrl } : { url }),
          name: label,
          fileName: `${nodeId || "workflow"}-${index + 1}.png`,
      },
    });
    const asset = payload.asset || null;
    if (!asset?.id) throw new Error("Failed to prepare workflow source image.");
    state.advancedAssets = [asset, ...(state.advancedAssets || []).filter((item) => item.id !== asset.id)];
    state.userAssets = [asset, ...(state.userAssets || []).filter((item) => item.id !== asset.id)];
    imageAssetIds.push(asset.id);
  }
  if (!imageAssetIds.length) throw new Error("Workflow source image is not accessible.");
  return { imageAssetIds };
}

async function workflowPrepareNodeKeyframe(node = {}, { baseImage = "", faceImage = "", model = {}, firstNode = false, storageNode = null } = {}) {
  const targetNode = storageNode || node;
  const sourceKey = workflowKeyframeSourceKey(node, baseImage, faceImage, { firstNode });
  if (targetNode.data?.keyframeImageUrl && targetNode.data?.keyframeSourceKey === sourceKey) {
    return targetNode.data.keyframeImageUrl;
  }
  workflowSetNodeData(targetNode.id, {
    status: "preparing",
    error: "",
    keyframeImageUrl: "",
    keyframeTaskId: "",
    keyframeRecord: null,
    keyframeSourceKey: sourceKey,
    stripTargetImageUrl: "",
    stripTargetTaskId: "",
    stripTargetRecord: null,
    stripTargetSourceKey: "",
  });
  state.workflowMessage = `Preparing keyframe for ${model.label || "workflow"}...`;
  workflowLog(`Preparing keyframe for ${model.label || "workflow"}.`);
  workflowThrowIfCancelled();
  const source = await workflowEnsureImageEditSources(
    [baseImage, faceImage].filter(Boolean),
    `${node.id}-keyframe`,
    "Workflow keyframe source",
  );
  workflowThrowIfCancelled();
  const payload = await requestJson("/api/wan27/image-edit", {
    method: "POST",
    body: {
      ...source,
      prompt: workflowKeyframePrompt(node, { hasFaceReference: Boolean(faceImage), firstNode }),
      ratio: node.data?.ratio || "9:16",
      resolution: "2K",
      params: {
        createKind: "workflow",
        workflowNodeId: node.id,
        workflowModelId: model.id || "",
        workflowStep: "node_keyframe",
      },
    },
  });
  if (payload.user) setUser(payload.user);
  const record = payload.record || null;
  const imageUrl = payload.imageUrl || record?.imageResultUrl || record?.localImageUrl || record?.cdnImageUrl || "";
  if (!imageUrl) throw new Error("Keyframe generation returned no image.");
  workflowSetNodeData(targetNode.id, {
    keyframeImageUrl: imageUrl,
    keyframeTaskId: payload.taskId || record?.taskId || "",
    keyframeRecord: record,
    keyframeSourceKey: sourceKey,
  });
  workflowLog("Keyframe ready.");
  return imageUrl;
}

async function workflowPrepareStripTargetImage(node = {}, keyframeImage = "", model = {}, { storageNode = null } = {}) {
  const targetNode = storageNode || node;
  const sourceKey = workflowStripSourceKey(node, keyframeImage);
  if (targetNode.data?.stripTargetImageUrl && targetNode.data?.stripTargetSourceKey === sourceKey) {
    return targetNode.data.stripTargetImageUrl;
  }
  workflowSetNodeData(targetNode.id, {
    status: "preparing",
    error: "",
    stripTargetImageUrl: "",
    stripTargetTaskId: "",
    stripTargetRecord: null,
    stripTargetSourceKey: sourceKey,
  });
  state.workflowMessage = `Preparing target frame for ${model.label || "workflow"}...`;
  workflowLog(`Preparing target frame for ${model.label || "workflow"}.`);
  workflowThrowIfCancelled();
  const source = await workflowEnsureImageEditSources([keyframeImage], `${node.id}-target`, "Workflow target frame source");
  workflowThrowIfCancelled();
  const payload = await requestJson("/api/wan27/image-edit", {
    method: "POST",
    body: {
      ...source,
      prompt: workflowStripImagePrompt(node),
      ratio: node.data?.ratio || "9:16",
      resolution: "2K",
      params: {
        createKind: "workflow",
        workflowNodeId: node.id,
        workflowModelId: model.id || "",
        workflowStep: "strip_target_image",
      },
    },
  });
  if (payload.user) setUser(payload.user);
  const record = payload.record || null;
  const imageUrl = payload.imageUrl || record?.imageResultUrl || record?.localImageUrl || record?.cdnImageUrl || "";
  if (!imageUrl) throw new Error("Target frame generation returned no image.");
  workflowSetNodeData(targetNode.id, {
    stripTargetImageUrl: imageUrl,
    stripTargetTaskId: payload.taskId || record?.taskId || "",
    stripTargetRecord: record,
    stripTargetSourceKey: sourceKey,
  });
  workflowLog("Target frame ready.");
  return imageUrl;
}

function workflowRecordFromPayload(payload = {}, fallback = {}) {
  const taskId = payload.taskId || payload.task?.taskId || payload.record?.taskId || payload.generation?.taskId || "";
  return payload.record || payload.generation || {
    taskId,
    status: payload.task?.status || "submitted",
    provider: "seedance",
    source: "workflow",
    kind: "workflow-video",
    prompt: fallback.prompt || "",
    model: fallback.model || "",
    ratio: fallback.ratio || "9:16",
    resolution: fallback.resolution || "720p",
    duration: fallback.duration || 5,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

function workflowSetNodeData(nodeId = "", patch = {}) {
  const node = workflowNodeById(nodeId);
  if (!node) return null;
  node.data = { ...(node.data || {}), ...patch };
  persistWorkflowState();
  renderWorkflowPanel();
  return node;
}

function workflowNodeActiveTab(node = {}) {
  return node.type === "video" && node.data?.activeTab === "params" ? "params" : "preview";
}

function workflowPreviewKindFromUrl(url = "", fallback = "video") {
  const value = String(url || "");
  if (/^data:image\//i.test(value) || /\.(?:avif|bmp|gif|jpe?g|png|svg|webp)(?:[?#].*)?$/i.test(value)) return "image";
  if (/^data:video\//i.test(value) || /\.(?:m4v|mov|mp4|webm)(?:[?#].*)?$/i.test(value)) return "video";
  return fallback;
}

function workflowPreviewAttrs({ url = "", kind = "", title = "", ratio = "9:16" } = {}) {
  if (!url) return "";
  return `data-workflow-preview-url="${escapeHtml(url)}" data-workflow-preview-kind="${escapeHtml(kind || workflowPreviewKindFromUrl(url))}" data-workflow-preview-title="${escapeHtml(title || "Workflow preview")}" data-workflow-preview-ratio="${escapeHtml(ratio || "9:16")}"`;
}

function renderWorkflowPreviewThumb({ url = "", poster = "", title = "", kind = "", badge = "", ratio = "9:16", icon = "play", className = "" } = {}) {
  const mediaKind = kind || workflowPreviewKindFromUrl(url);
  const previewAttrs = workflowPreviewAttrs({ url, kind: mediaKind, title, ratio });
  const media = url
    ? mediaKind === "image"
      ? `<img src="${escapeHtml(url)}" alt="" loading="lazy" decoding="async" />`
      : `<video src="${escapeHtml(url)}" ${poster ? `poster="${escapeHtml(poster)}"` : ""} muted loop playsinline autoplay preload="metadata"></video>`
    : `<img src="${escapeHtml(DEFAULT_TEMPLATE_COVER)}" alt="" loading="lazy" decoding="async" />`;
  return `
    <button class="workflow-node-preview-button ${escapeHtml(className)}" type="button" ${previewAttrs} ${url ? "" : "disabled"}>
      ${media}
      <span class="workflow-node-preview-play"><i data-lucide="${escapeHtml(icon)}"></i></span>
      ${badge ? `<span class="workflow-node-demo-badge">${escapeHtml(badge)}</span>` : ""}
    </button>
  `;
}

function renderWorkflowUploadSlot(node = {}, field = "startImage", label = "Start", icon = "image") {
  const value = node.data?.[field] || "";
  const fieldClass = [
    "workflow-upload-field",
    field === "startImage" ? "is-start" : "",
    field === "endImage" ? "is-end" : "",
    field === "faceImage" ? "is-face" : "",
  ].filter(Boolean).join(" ");
  const slotClass = [
    "workflow-upload-slot",
    field === "startImage" ? "is-primary" : "is-small",
    field === "faceImage" ? "is-face" : "",
  ].filter(Boolean).join(" ");
  const hint = field === "startImage" ? "required" : field === "faceImage" ? "for face swap" : "optional";
  const emptyText = field === "faceImage" ? "Drop face photo here" : "Drop here";
  return `
    <div class="${fieldClass}">
      <div class="workflow-upload-label">
        <strong>${escapeHtml(label)}</strong>
        <span>${escapeHtml(hint)}</span>
      </div>
      <div class="${slotClass}">
        <label class="workflow-upload-pick">
          <input type="file" accept="image/*" data-workflow-file="${escapeHtml(field)}" data-node-id="${escapeHtml(node.id)}" />
          <span class="workflow-upload-preview">
            ${value
              ? `<img src="${escapeHtml(value)}" alt="" loading="lazy" decoding="async" />`
              : `<span class="workflow-upload-empty"><i data-lucide="${escapeHtml(icon)}"></i><em>${escapeHtml(emptyText)}</em><b>Browse</b></span>`}
          </span>
        </label>
        ${value ? `
          <button class="workflow-upload-preview-open" type="button" ${workflowPreviewAttrs({ url: value, kind: "image", title: label, ratio: "1:1" })} aria-label="Preview ${escapeHtml(label)}">
            <i data-lucide="maximize-2"></i>
          </button>
        ` : ""}
      </div>
    </div>
  `;
}

function renderWorkflowUploadPreparedPreview(node = {}) {
  const keyframeUrl = node.data?.keyframeImageUrl || "";
  const targetUrl = node.data?.stripTargetImageUrl || "";
  if (!keyframeUrl && !targetUrl) return "";
  const item = (url, label) => url ? `
    <button class="workflow-upload-ready-pill" type="button" ${workflowPreviewAttrs({ url, kind: "image", title: label, ratio: "9:16" })}>
      <i data-lucide="check"></i>${escapeHtml(label)} Ready
    </button>
  ` : "";
  return `
    <div class="workflow-upload-ready-row">
      ${item(keyframeUrl, "Start Frame")}
      ${item(targetUrl, "Target")}
    </div>
  `;
}

function renderWorkflowMediaPreview(node = {}, model = null) {
  if (node.type === "upload") {
    const image = node.data?.startImage || "";
    return image
      ? renderWorkflowPreviewThumb({ url: image, title: node.title || "Start image", kind: "image", badge: "Start", ratio: "1:1", icon: "maximize-2" })
      : `<i data-lucide="image-up"></i><span>Start image</span>`;
  }
  const videoUrl = workflowNodeResultVideo(node);
  const posterUrl = workflowNodePoster(node);
  const preset = model || workflowModelById(node.data?.modelId);
  const preparedImageUrl = !videoUrl ? (node.data?.stripTargetImageUrl || node.data?.keyframeImageUrl || "") : "";
  const previewUrl = videoUrl || preparedImageUrl || preset.previewUrl || "";
  const previewPoster = videoUrl ? posterUrl : (preset.posterUrl || posterUrl || "");
  const preparedBadge = node.data?.stripTargetImageUrl ? "Target" : "Keyframe";
  const badge = videoUrl ? "Result" : preparedImageUrl ? preparedBadge : "Demo";
  if (previewUrl) {
    return renderWorkflowPreviewThumb({
      url: previewUrl,
      poster: previewPoster,
      title: node.title || preset.label || "Workflow preview",
      kind: preparedImageUrl ? "image" : "video",
      badge,
      ratio: node.data?.ratio || "9:16",
      icon: preparedImageUrl ? "maximize-2" : "play",
    });
  }
  if (previewPoster) {
    return renderWorkflowPreviewThumb({
      url: previewPoster,
      title: node.title || preset.label || "Workflow preview",
      kind: "image",
      badge,
      ratio: node.data?.ratio || "9:16",
      icon: "maximize-2",
    });
  }
  const fallbackBadge = node.data?.status ? workflowNodeStatusText(node) : "Preview";
  return renderWorkflowPreviewThumb({
    badge: fallbackBadge,
    icon: node.data?.status === "running" ? "loader-circle" : "play",
  });
}

let activeWorkflowConnection = null;
let activeWorkflowNodeDrag = null;
let suppressWorkflowClickUntil = 0;

function workflowNodeAcceptsInput(node = null) {
  return Boolean(node && node.type !== "upload");
}

function workflowNodeAcceptsOutput(node = null) {
  return Boolean(node && node.type !== "output");
}

function workflowNodeAnchor(node = {}, side = "out") {
  const yOffset = node.type === "video" ? 186 : 92;
  return {
    x: Number(node.x || 0) + (side === "out" ? WORKFLOW_NODE_WIDTH : 0),
    y: Number(node.y || 0) + yOffset,
  };
}

function workflowConnectionPath(x1 = 0, y1 = 0, x2 = 0, y2 = 0) {
  const direction = x2 >= x1 ? 1 : -1;
  const mid = Math.max(34, Math.round(Math.abs(x2 - x1) / 2));
  return `M ${x1} ${y1} C ${x1 + mid * direction} ${y1}, ${x2 - mid * direction} ${y2}, ${x2} ${y2}`;
}

function renderWorkflowConnectors(node = {}) {
  const nodeId = escapeHtml(node.id || "");
  return `
    ${workflowNodeAcceptsInput(node) ? `<button class="workflow-node-connect workflow-node-connect-in" type="button" data-workflow-connect="in" data-node-id="${nodeId}" aria-label="Connect into ${escapeHtml(node.title || "node")}"></button>` : ""}
    ${workflowNodeAcceptsOutput(node) ? `<button class="workflow-node-connect workflow-node-connect-out" type="button" data-workflow-connect="out" data-node-id="${nodeId}" aria-label="Connect from ${escapeHtml(node.title || "node")}"></button>` : ""}
  `;
}

function renderWorkflowNode(node = {}) {
  const selected = selectedWorkflowNode()?.id === node.id;
  const statusClassName = statusClass(node.data?.status || "ready");
  const style = `left:${Number(node.x || 0)}px;top:${Number(node.y || 0)}px`;
  if (node.type === "upload") {
    const runState = workflowNodeRunState(node);
    return `
      <article class="workflow-node workflow-node-upload ${selected ? "is-selected" : ""}" style="${style}" data-workflow-node="${escapeHtml(node.id)}">
        ${renderWorkflowConnectors(node)}
        <header>
          <span class="workflow-node-title-icon"><i data-lucide="image"></i></span>
          <strong>${escapeHtml(node.title || "Image Upload")}</strong>
          <button class="workflow-node-header-run ${state.workflowActiveNodeId === node.id ? "is-running" : ""}" type="button" data-workflow-run-node="${escapeHtml(node.id)}" title="${escapeHtml(runState.reason)}" ${runState.disabled ? "disabled" : ""}>
            <i data-lucide="${escapeHtml(runState.icon)}"></i><span>${escapeHtml(runState.label)}</span>
          </button>
        </header>
        <div class="workflow-upload-grid">
          ${renderWorkflowUploadSlot(node, "startImage", "Start", "image-up")}
          ${renderWorkflowUploadSlot(node, "endImage", "End", "image")}
          ${renderWorkflowUploadSlot(node, "faceImage", "Face", "scan-face")}
        </div>
        ${renderWorkflowUploadPreparedPreview(node)}
      </article>
    `;
  }
  if (node.type === "output") {
    const completedVideos = workflowVideoNodes().filter((item) => workflowNodeResultVideo(item));
    const finalVideoUrl = workflowNodeResultVideo(node);
    const finalPosterUrl = workflowNodePoster(node);
    return `
      <article class="workflow-node workflow-node-output ${selected ? "is-selected" : ""}" style="${style}" data-workflow-node="${escapeHtml(node.id)}">
        ${renderWorkflowConnectors(node)}
        <header><i data-lucide="sparkles"></i><strong>${escapeHtml(node.title || "Final Output")}</strong></header>
        ${finalVideoUrl ? `
          <div class="workflow-node-media">
            <button class="workflow-node-preview-button" type="button" data-workflow-preview="${escapeHtml(node.id)}">
              <video src="${escapeHtml(finalVideoUrl)}" ${finalPosterUrl ? `poster="${escapeHtml(finalPosterUrl)}"` : ""} muted loop playsinline autoplay preload="metadata"></video>
              <span class="workflow-node-preview-play"><i data-lucide="play"></i></span>
              <span class="workflow-node-demo-badge">Final</span>
            </button>
          </div>
        ` : ""}
        <div class="workflow-output-box">
          ${completedVideos.length
            ? completedVideos.map((item) => `<button type="button" data-workflow-preview="${escapeHtml(item.id)}">${escapeHtml(workflowModelById(item.data?.modelId).label)}</button>`).join("")
            : `<span>Run nodes to collect output</span>`}
        </div>
      </article>
    `;
  }
  const model = workflowModelById(node.data?.modelId);
  const promptPreview = workflowPromptPreview(model, node.data?.prompt);
  const activeTab = workflowNodeActiveTab(node);
  const runState = workflowNodeRunState(node);
  const modelPreview = model.previewUrl
    ? `<video src="${escapeHtml(model.previewUrl)}" ${model.posterUrl ? `poster="${escapeHtml(model.posterUrl)}"` : ""} muted loop playsinline autoplay preload="metadata"></video>`
    : `<i data-lucide="clapperboard"></i>`;
  return `
    <article class="workflow-node workflow-node-video ${selected ? "is-selected" : ""} is-${escapeHtml(statusClassName)}" style="${style}" data-workflow-node="${escapeHtml(node.id)}">
      ${renderWorkflowConnectors(node)}
      <header>
        <span class="workflow-node-title-icon"><i data-lucide="video"></i></span>
        <strong>${escapeHtml(node.title || model.label)}</strong>
        <button class="workflow-node-header-run ${state.workflowActiveNodeId === node.id ? "is-running" : ""}" type="button" data-workflow-run-node="${escapeHtml(node.id)}" title="${escapeHtml(runState.reason)}" ${runState.disabled ? "disabled" : ""}>
          <i data-lucide="${escapeHtml(runState.icon)}"></i><span>${escapeHtml(runState.label)}</span>
        </button>
        <button type="button" data-workflow-delete="${escapeHtml(node.id)}" aria-label="Delete"><i data-lucide="trash-2"></i></button>
      </header>
      <div class="workflow-node-tabs" role="tablist" aria-label="Video node view">
        <button class="${activeTab === "preview" ? "is-active" : ""}" type="button" data-workflow-node-tab="preview" data-node-id="${escapeHtml(node.id)}" aria-label="Preview" title="Preview"><i data-lucide="video"></i></button>
        <button class="${activeTab === "params" ? "is-active" : ""}" type="button" data-workflow-node-tab="params" data-node-id="${escapeHtml(node.id)}" aria-label="Params" title="Params"><i data-lucide="sliders-horizontal"></i></button>
      </div>
      ${activeTab === "preview" ? `
        <div class="workflow-node-tab-panel workflow-node-preview-panel">
          <div class="workflow-node-media">${renderWorkflowMediaPreview(node, model)}</div>
        </div>
      ` : `
        <div class="workflow-node-tab-panel workflow-node-params-panel">
          <button class="workflow-model-card" type="button" data-workflow-open-picker="${escapeHtml(node.id)}">
            <span class="workflow-model-thumb">${modelPreview}</span>
            <span class="workflow-model-copy">
              <em>Scene / action</em>
              <strong>${escapeHtml(model.label)}</strong>
              <small>${escapeHtml(promptPreview)}</small>
            </span>
            <i data-lucide="chevron-down"></i>
          </button>
          <label class="workflow-field">
            <span>Custom prompt</span>
            <textarea rows="3" data-workflow-prompt="${escapeHtml(node.id)}" placeholder="${escapeHtml(model.prompt)}">${escapeHtml(node.data?.prompt || "")}</textarea>
          </label>
          <div class="workflow-inline-fields">
            <label><span>Duration</span><select data-workflow-duration="${escapeHtml(node.id)}">${[5, 8, 10, 15].map((value) => `<option value="${value}" ${Number(node.data?.duration || 5) === value ? "selected" : ""}>${value}s</option>`).join("")}</select></label>
            <label><span>Quality</span><select data-workflow-resolution="${escapeHtml(node.id)}">${["480p", "720p", "1080p", "4k"].map((value) => `<option value="${value}" ${String(node.data?.resolution || "720p").toLowerCase() === value ? "selected" : ""}>${escapeHtml(advancedVideoResolutionLabel(value))}</option>`).join("")}</select></label>
          </div>
          <div class="workflow-node-toggles">
            ${renderWorkflowNodeToggle(node, "stripFirst", "Strip Her Nude First", "", "sparkles")}
            ${renderWorkflowNodeToggle(node, "faceSwapMode", "Face Swap Mode", "Swap face onto start and end frames", "scan-face")}
            ${renderWorkflowNodeToggle(node, "addSound", "Add Sound", "MMAudio post-processing", "volume-2")}
          </div>
        </div>
      `}
      <footer>
        <span>${escapeHtml(workflowNodeStatusText(node))}${node.data?.taskId ? ` - ${escapeHtml(node.data.taskId)}` : ""}</span>
        <strong>${escapeHtml(workflowCostLabel(node))} credits</strong>
      </footer>
    </article>
  `;
}

function renderWorkflowNodeToggle(node = {}, key = "", label = "", hint = "", icon = "circle") {
  const checked = workflowNodeOptionEnabled(node, key);
  return `
    <label class="workflow-node-toggle">
      <input type="checkbox" data-workflow-toggle="${escapeHtml(key)}" data-node-id="${escapeHtml(node.id)}" ${checked ? "checked" : ""} />
      <span class="workflow-node-toggle-icon"><i data-lucide="${escapeHtml(icon)}"></i></span>
      <span class="workflow-node-toggle-copy">
        <strong>${escapeHtml(label)}</strong>
        ${hint ? `<small>${escapeHtml(hint)}</small>` : ""}
      </span>
    </label>
  `;
}

function renderWorkflowEdges() {
  const workflow = ensureWorkflowState();
  const nodeById = new Map(workflow.nodes.map((node) => [node.id, node]));
  return workflow.edges.map((edge) => {
    const from = nodeById.get(edge.from);
    const to = nodeById.get(edge.to);
    if (!from || !to) return "";
    const fromPoint = workflowNodeAnchor(from, "out");
    const toPoint = workflowNodeAnchor(to, "in");
    const path = workflowConnectionPath(fromPoint.x, fromPoint.y, toPoint.x, toPoint.y);
    const edgeAttrs = `data-edge-from="${escapeHtml(edge.from)}" data-edge-to="${escapeHtml(edge.to)}"`;
    return `
      <path class="workflow-edge-hit" d="${path}" data-workflow-edge-drag="to" ${edgeAttrs} />
      <path class="workflow-edge-path" d="${path}" />
      <circle class="workflow-edge-handle workflow-edge-handle-out" cx="${fromPoint.x}" cy="${fromPoint.y}" r="8" data-workflow-edge-handle="from" ${edgeAttrs} />
      <circle class="workflow-edge-handle workflow-edge-handle-in" cx="${toPoint.x}" cy="${toPoint.y}" r="8" data-workflow-edge-handle="to" ${edgeAttrs} />
    `;
  }).join("");
}

function renderWorkflowPicker() {
  const node = workflowNodeById(state.workflowPickerNodeId || "");
  if (!node || node.type !== "video") return "";
  const selectedModel = workflowModelById(node.data?.modelId);
  const search = String(state.workflowPickerSearch || "").trim().toLowerCase();
  const presets = workflowFilteredPresets(search);
  return `
    <div class="workflow-picker-backdrop" data-workflow-close-picker>
      <section class="workflow-picker" aria-modal="true" role="dialog" aria-label="Choose workflow scene" data-workflow-picker>
        <header>
          <div>
            <span>Scene / action</span>
            <strong>Choose preview</strong>
          </div>
          <button type="button" data-workflow-close-picker aria-label="Close"><i data-lucide="x"></i></button>
        </header>
        <div class="workflow-picker-search">
          <i data-lucide="search"></i>
          <input type="search" value="${escapeHtml(state.workflowPickerSearch || "")}" placeholder="Search..." data-workflow-picker-search />
        </div>
        <div class="workflow-picker-grid">${renderWorkflowPickerCards(presets, selectedModel)}</div>
      </section>
    </div>
  `;
}

function workflowFilteredPresets(searchText = "") {
  const search = String(searchText || "").trim().toLowerCase();
  return workflowPresetLibrary()
    .map(normalizeWorkflowPreset)
    .filter((preset) => {
      if (!search) return true;
      return preset.label.toLowerCase().includes(search)
        || preset.id.toLowerCase().includes(search)
        || preset.category.toLowerCase().includes(search)
        || preset.prompt.toLowerCase().includes(search);
    });
}

function renderWorkflowPickerCards(presets = [], selectedModel = {}) {
  return presets.map((preset) => {
    const active = selectedModel.id === preset.id;
    const media = preset.previewUrl
      ? `<video src="${escapeHtml(preset.previewUrl)}" ${preset.posterUrl ? `poster="${escapeHtml(preset.posterUrl)}"` : ""} muted loop playsinline autoplay preload="metadata"></video>`
      : `<span class="workflow-picker-empty"><i data-lucide="clapperboard"></i></span>`;
    return `
      <button class="workflow-picker-card ${active ? "is-active" : ""}" type="button" data-workflow-select-model="${escapeHtml(preset.id)}" aria-label="${escapeHtml(preset.label || "Workflow action")}" title="${escapeHtml(preset.label || "Workflow action")}">
        <span class="workflow-picker-media">${media}</span>
      </button>
    `;
  }).join("");
}

function renderWorkflowPanel() {
  if (!els.workflowRoot) return;
  const workflow = ensureWorkflowState();
  const selected = selectedWorkflowNode();
  const selectedModel = workflowModelById(selected?.data?.modelId);
  const activePhysics = new Set(workflow.physics || []);
  const selectedPrompt = workflowPromptPreview(selectedModel, selected?.data?.prompt);
  els.workflowRoot.innerHTML = `
    <div class="workflow-toolbar">
      <button class="workflow-run ${state.workflowRunning ? "is-cancel" : ""}" type="button" data-workflow-action="${state.workflowRunning ? "cancel" : "run"}"><i data-lucide="${state.workflowRunning ? "square" : "play"}"></i>${state.workflowRunning ? "Cancel" : "Run all"}</button>
      <button type="button" data-workflow-action="clear-results" ${state.workflowRunning ? "disabled" : ""}><i data-lucide="eraser"></i>Clear results</button>
      <button type="button" data-workflow-action="add-video"><i data-lucide="plus"></i>Video</button>
      <button type="button" data-workflow-action="add-branch"><i data-lucide="git-branch"></i>Branch</button>
      <button type="button" data-workflow-action="physics" class="${state.workflowShowPhysics ? "is-active" : ""}"><i data-lucide="zap"></i>Physics</button>
      <button type="button" data-workflow-action="refiner"><i data-lucide="expand"></i>Refiner</button>
      <button type="button" data-workflow-action="director"><i data-lucide="wand-sparkles"></i>Director</button>
      <button type="button" data-workflow-action="reset"><i data-lucide="rotate-ccw"></i>Reset</button>
      <span class="workflow-status">${escapeHtml(state.workflowMessage || `${workflowVideoNodes().length} video nodes`)}</span>
    </div>
    <div class="workflow-director">
      <textarea rows="2" data-workflow-director placeholder="Describe your video workflow...">${escapeHtml(workflow.directorPrompt || "")}</textarea>
      <button type="button" data-workflow-action="director-build"><i data-lucide="sparkles"></i>Generate</button>
    </div>
    ${state.workflowShowPhysics ? `
      <section class="workflow-physics">
        <header><strong>Physics Engine</strong><span>${activePhysics.size}/3 modules active</span></header>
        <div>
          ${WORKFLOW_PHYSICS_MODULES.map((module) => `
            <button type="button" class="${activePhysics.has(module.id) ? "is-active" : ""}" data-workflow-physics="${escapeHtml(module.id)}">
              <i data-lucide="${activePhysics.has(module.id) ? "check" : "circle"}"></i>${escapeHtml(module.label)}
            </button>
          `).join("")}
        </div>
      </section>
    ` : ""}
    <div class="workflow-layout">
      <section class="workflow-canvas" aria-label="Workflow canvas">
        <div class="workflow-canvas-stage" style="${workflowCanvasStageStyle()}">
          <svg class="workflow-edges" viewBox="0 0 ${workflowCanvasLogicalSize().width} ${workflowCanvasLogicalSize().height}" preserveAspectRatio="none">
            ${renderWorkflowEdges()}
            <path class="workflow-edge-draft" data-workflow-draft-edge hidden />
          </svg>
          ${workflow.nodes.map(renderWorkflowNode).join("")}
        </div>
        <div class="workflow-minimap">
          ${workflow.nodes.map((node) => `<span style="left:${Math.max(0, Number(node.x || 0) / 14)}px;top:${Math.max(0, Number(node.y || 0) / 12)}px"></span>`).join("")}
        </div>
      </section>
      <aside class="workflow-side">
        <section>
          <div class="workflow-side-head">
            <strong>${escapeHtml(selected?.type === "video" ? selectedModel.label : selected?.title || "Workflow")}</strong>
            <span>${escapeHtml(selected?.type || "")}</span>
          </div>
          ${selected?.type === "video" ? `
            <p>${escapeHtml(workflowCostLabel(selected))} credits - ${escapeHtml(selected.data?.resolution || "720p")} - ${escapeHtml(String(selected.data?.duration || 5))}s</p>
            <button class="workflow-change-preset" type="button" data-workflow-open-picker="${escapeHtml(selected.id)}"><i data-lucide="layout-grid"></i>Choose scene</button>
            <div class="workflow-prompt-preview">${escapeHtml(selectedPrompt || selectedModel.prompt || "")}</div>
          ` : ""}
        </section>
        <section>
          <div class="workflow-side-head"><strong>Quick nodes</strong></div>
          <div class="workflow-quick-list">
            ${WORKFLOW_QUICK_TEMPLATES.map((item) => `<button type="button" data-workflow-template="${escapeHtml(item.id)}">${escapeHtml(item.label)}</button>`).join("")}
          </div>
        </section>
        <section>
          <div class="workflow-side-head"><strong>Log</strong></div>
          <div class="workflow-log">
            ${(state.workflowLogs || []).length ? state.workflowLogs.map((log) => `<p><span>${escapeHtml(log.time)}</span>${escapeHtml(log.message)}</p>`).join("") : `<p>No runs yet.</p>`}
          </div>
        </section>
      </aside>
    </div>
    ${renderWorkflowPicker()}
  `;
  refreshIcons();
}

function updateWorkflowNodeFromControl(control) {
  const nodeId = control.dataset.workflowPrompt || control.dataset.workflowDuration || control.dataset.workflowResolution || "";
  const node = workflowNodeById(nodeId);
  if (!node) return;
  if (control.dataset.workflowPrompt) {
    node.data.prompt = control.value || "";
  } else if (control.dataset.workflowDuration) {
    node.data.duration = Number(control.value || 5);
  } else if (control.dataset.workflowResolution) {
    node.data.resolution = control.value || "720p";
  } else if (control.dataset.workflowToggle) {
    node.data[control.dataset.workflowToggle] = Boolean(control.checked);
  }
  persistWorkflowState();
  const nodeEl = Array.from(els.workflowRoot?.querySelectorAll("[data-workflow-node]") || [])
    .find((item) => item.dataset.workflowNode === node.id);
  const costEl = nodeEl?.querySelector("footer strong");
  if (costEl) costEl.textContent = `${workflowCostLabel(node)} credits`;
}

async function handleWorkflowFileInput(input) {
  const nodeId = input.dataset.nodeId || "";
  const field = input.dataset.workflowFile || "startImage";
  const file = input.files?.[0];
  if (!file) return;
  const dataUrl = await readFileAsDataUrl(file);
  const node = workflowNodeById(nodeId);
  if (node) {
    node.data = { ...(node.data || {}), [field]: dataUrl };
    clearWorkflowExecutionResults({ message: "Input updated. Run the first video again.", render: false });
    persistWorkflowState();
    renderWorkflowPanel();
  } else {
    workflowSetNodeData(nodeId, { [field]: dataUrl });
  }
  if (field === "startImage") workflowLog("Source image ready.");
}

function addWorkflowVideoNode(modelId = "") {
  const workflow = ensureWorkflowState();
  const videoNodes = workflowVideoNodes();
  const index = videoNodes.length + 1;
  const output = workflowNodeByType("output");
  const selected = selectedWorkflowNode();
  const outputIncoming = output ? workflowIncomingEdges(output.id)[0] : null;
  const outputPrevious = workflowNodeById(outputIncoming?.from || "");
  const previous = (selected?.type === "video" || selected?.type === "upload")
    ? selected
    : (outputPrevious?.type === "video" || outputPrevious?.type === "upload")
      ? outputPrevious
      : videoNodes[videoNodes.length - 1] || workflowUploadNode();
  const model = workflowModelById(modelId || WORKFLOW_MODEL_LIBRARY[index % WORKFLOW_MODEL_LIBRARY.length]?.id || "");
  const node = {
    id: `video-${Date.now().toString(36)}`,
    type: "video",
    title: model.label,
    x: Number(previous?.x || 30) + WORKFLOW_NODE_WIDTH + WORKFLOW_NODE_GAP,
    y: 150 + Math.max(0, index - 2) * 38,
    data: { modelId: model.id, duration: 5, resolution: "720p", ratio: "9:16", prompt: "", activeTab: "preview" },
  };
  workflow.nodes.splice(Math.max(1, workflow.nodes.length - 1), 0, node);
  const displacedTargets = previous ? workflowOutgoingEdges(previous.id).map((edge) => edge.to).filter((toId) => toId !== node.id) : [];
  if (previous) {
    workflow.edges = workflow.edges.filter((edge) => edge.from !== previous.id && edge.to !== node.id);
    workflow.edges.push({ from: previous.id, to: node.id });
  }
  const nextTargets = displacedTargets.length ? displacedTargets : output ? [output.id] : [];
  nextTargets.forEach((toId) => {
    if (toId && toId !== node.id) workflow.edges.push({ from: node.id, to: toId });
  });
  workflow.edges = workflow.edges.filter((edge, edgeIndex, edges) => (
    edge.from && edge.to && edge.from !== edge.to
    && edges.findIndex((item) => item.from === edge.from && item.to === edge.to) === edgeIndex
  ));
  state.workflowSelectedNodeId = node.id;
  persistWorkflowState();
  renderWorkflowPanel();
}

function applyWorkflowTemplate(templateId = "") {
  const template = WORKFLOW_QUICK_TEMPLATES.find((item) => item.id === templateId);
  if (!template) return;
  addWorkflowVideoNode(template.modelId);
}

function applyWorkflowDirectorPrompt() {
  const workflow = ensureWorkflowState();
  const text = String(workflow.directorPrompt || "").trim();
  if (!text) return;
  const parts = text.split(/[.;\n]+/).map((part) => part.trim()).filter(Boolean).slice(0, 4);
  if (!parts.length) return;
  const upload = workflowUploadNode();
  const output = workflow.nodes.find((node) => node.type === "output");
  workflow.nodes = [upload, ...parts.map((part, index) => {
    const model = WORKFLOW_MODEL_LIBRARY[index % WORKFLOW_MODEL_LIBRARY.length];
    return {
      id: `video-${Date.now().toString(36)}-${index}`,
      type: "video",
      title: model.label,
      x: 30 + (WORKFLOW_NODE_WIDTH + WORKFLOW_NODE_GAP) * (index + 1),
      y: 150 + index * 16,
      data: { modelId: model.id, prompt: part, duration: 5, resolution: "720p", ratio: "9:16", activeTab: "preview" },
    };
  }), output].filter(Boolean);
  if (output) {
    output.x = 30 + (WORKFLOW_NODE_WIDTH + WORKFLOW_NODE_GAP) * (parts.length + 1);
    output.y = 150;
  }
  const ordered = workflowVideoNodes();
  workflow.edges = [];
  if (upload && ordered[0]) workflow.edges.push({ from: upload.id, to: ordered[0].id });
  ordered.forEach((node, index) => {
    const next = ordered[index + 1] || output;
    if (next) workflow.edges.push({ from: node.id, to: next.id });
  });
  state.workflowSelectedNodeId = ordered[0]?.id || "video-1";
  persistWorkflowState();
  renderWorkflowPanel();
}

function workflowCanceledError() {
  const error = new Error("Workflow canceled.");
  error.workflowCanceled = true;
  return error;
}

function workflowThrowIfCancelled() {
  if (state.workflowCancelRequested) throw workflowCanceledError();
}

function requestWorkflowCancel() {
  if (!state.workflowRunning) return;
  state.workflowCancelRequested = true;
  state.workflowMessage = "Canceling workflow...";
  renderWorkflowPanel();
}

function workflowHandleExecutionError(error = {}) {
  const activeNode = workflowNodeById(state.workflowActiveNodeId || "");
  if (error.workflowCanceled) {
    state.workflowMessage = "Workflow canceled.";
    if (activeNode && !workflowNodeHasSuccessfulResult(activeNode)) {
      workflowSetNodeData(activeNode.id, { status: "canceled", error: "Canceled locally." });
    }
    workflowLog("Workflow canceled.");
    return;
  }
  state.workflowMessage = error.message || String(error);
  if (activeNode?.id) workflowSetNodeData(activeNode.id, { status: "failed", error: state.workflowMessage });
  workflowLog(state.workflowMessage);
}

async function pollWorkflowTask(nodeId = "", taskId = "") {
  let lastRecord = null;
  for (let attempt = 0; attempt < 150; attempt += 1) {
    workflowThrowIfCancelled();
    await new Promise((resolve) => setTimeout(resolve, attempt ? 4000 : 1200));
    workflowThrowIfCancelled();
    const payload = await requestJson(`/api/generation-records/${encodeURIComponent(taskId)}`);
    const record = payload.record || payload.generation || null;
    if (!record?.taskId) continue;
    lastRecord = record;
    workflowSetNodeData(nodeId, {
      status: record.status || "running",
      record,
      resultVideoUrl: generationVideoUrl(record),
      posterUrl: generationPosterUrl(record),
      taskId: record.taskId,
    });
    if (isTerminalGenerationStatus(record.status)) break;
  }
  return lastRecord;
}

async function workflowExtractTailFrame(node = {}, taskId = "", videoUrl = "", duration = 5) {
  if (!taskId || !videoUrl) return "";
  workflowThrowIfCancelled();
  const framePayload = await requestJson("/api/workflow/extract-frame", {
    method: "POST",
    body: { taskId, videoUrl, duration },
  });
  const frameUrl = framePayload.frameUrl || framePayload.localFrameUrl || "";
  if (frameUrl && node?.id) workflowSetNodeData(node.id, { lastFrameUrl: frameUrl, posterUrl: frameUrl });
  return frameUrl;
}

async function workflowContinuationFromPrevious(previousNode = null) {
  if (!previousNode) return { previousFrameUrl: "", previousVideoUrl: "" };
  const previousVideoUrl = workflowNodeResultVideo(previousNode);
  let previousFrameUrl = previousNode.data?.lastFrameUrl || "";
  if (!previousFrameUrl && previousVideoUrl && previousNode.data?.taskId) {
    try {
      workflowLog("Preparing previous tail frame.");
      previousFrameUrl = await workflowExtractTailFrame(previousNode, previousNode.data.taskId, previousVideoUrl, Number(previousNode.data?.duration || 5));
    } catch (frameError) {
      previousFrameUrl = "";
      workflowLog(`Tail frame skipped: ${frameError.message || frameError}`);
    }
  }
  return { previousFrameUrl, previousVideoUrl };
}

async function runWorkflowNode(node = {}, { previousFrameUrl = "", previousVideoUrl = "", firstNode = false } = {}) {
  const workflow = ensureWorkflowState();
  const upload = workflowUploadNode();
  const sourceImage = upload?.data?.startImage || "";
  const endImage = upload?.data?.endImage || "";
  const faceImage = workflowNodeOptionEnabled(node, "faceSwapMode") ? (upload?.data?.faceImage || "") : "";
  if (!node?.id) throw new Error("Video node not found.");
  if (!sourceImage) throw new Error("Upload a start image first.");

  const model = workflowModelById(node.data?.modelId);
  const duration = Number(node.data?.duration || 5);
  const resolution = node.data?.resolution || "720p";

  state.workflowActiveNodeId = node.id;
  state.workflowSelectedNodeId = node.id;
  state.workflowMessage = `Preparing ${model.label}...`;
  workflowSetNodeData(node.id, { status: "preparing", error: "", taskId: "", record: null, resultVideoUrl: "", posterUrl: "", lastFrameUrl: "" });
  workflowThrowIfCancelled();

  const continuityImage = previousFrameUrl || sourceImage;
  const keyframeStorageNode = firstNode ? upload : node;
  const keyframeImage = await workflowPrepareNodeKeyframe(node, {
    baseImage: continuityImage,
    faceImage,
    model,
    firstNode,
    storageNode: keyframeStorageNode,
  });
  workflowThrowIfCancelled();

  const shouldPrepareStripTarget = firstNode
    && workflowNodeOptionEnabled(node, "stripFirst")
    && !endImage
    && !previousVideoUrl;
  const stripTargetImage = shouldPrepareStripTarget
    ? await workflowPrepareStripTargetImage(node, keyframeImage, model, { storageNode: firstNode ? upload : node })
    : "";
  const stripPrompt = stripTargetImage
    ? "Image 1 is the prepared consenting adult subject state after clothing removal. Use it for the main subject identity and body state. Follow the selected scene/action reference for pose, motion, camera, environment, and composition; do not treat Image 1 as a frozen first or last frame."
    : firstNode ? workflowStripPrompt(node) : "";
  const prompt = [workflowEffectivePrompt(node), stripPrompt, workflowFacePrompt(faceImage)].filter(Boolean).join(". ");
  const continuationPrompt = previousFrameUrl || previousVideoUrl
    ? "Continue naturally from the previous clip's final frame, preserving subject identity, pose continuity, lighting, and camera direction."
    : "";
  const finalPrompt = [prompt, continuationPrompt].filter(Boolean).join(". ");
  const modelReferenceImage = workflowModelReferenceImage(model);
  const modelReferenceVideo = workflowModelReferenceVideo(model);
  const mediaBody = stripTargetImage
    ? {
      seedanceMode: "reference_images",
      referenceImages: workflowSeedanceReferenceImages([stripTargetImage, modelReferenceImage, faceImage]),
      referenceVideoUrls: modelReferenceVideo ? [modelReferenceVideo] : [],
      inputVideoSeconds: modelReferenceVideo ? duration : 0,
      referenceVideoDurationSeconds: modelReferenceVideo ? duration : 0,
    }
    : endImage
      ? {
        seedanceMode: "first_last_frame",
        ...workflowImageRequestFields(keyframeImage, "first"),
        ...workflowImageRequestFields(endImage, "end"),
      }
      : {
        seedanceMode: "first_frame",
        ...workflowImageRequestFields(keyframeImage, "first"),
      };

  state.workflowMessage = `Running ${model.label}...`;
  workflowSetNodeData(node.id, { status: "submitting", error: "", taskId: "", record: null, resultVideoUrl: "", posterUrl: "", lastFrameUrl: "" });
  workflowLog(`Submitting ${model.label}.`);
  workflowThrowIfCancelled();

  const body = {
    provider: "seedance",
    seedanceTier: "standard",
    prompt: finalPrompt,
    ...mediaBody,
    ratio: node.data?.ratio || "9:16",
    resolution,
    duration,
    generateAudio: workflowNodeOptionEnabled(node, "addSound"),
    params: {
      createKind: "workflow",
      workflowNodeId: node.id,
      workflowModelId: model.id,
      workflowModelLabel: model.label,
      workflowInputMode: mediaBody.seedanceMode,
      workflowKeyframeImageUrl: keyframeImage || "",
      workflowKeyframeTaskId: keyframeStorageNode?.data?.keyframeTaskId || "",
      workflowStripTargetImageUrl: stripTargetImage || "",
      workflowStripTargetTaskId: (firstNode ? upload : node).data?.stripTargetTaskId || "",
      workflowUsesEndFrame: firstNode && Boolean(endImage) && mediaBody.seedanceMode === "first_last_frame",
      workflowUsesGeneratedEndFrame: false,
      workflowUsesGeneratedReferenceState: firstNode && Boolean(stripTargetImage) && mediaBody.seedanceMode === "reference_images",
      workflowUsesEndReference: Boolean(endImage) && mediaBody.seedanceMode === "reference_images",
      workflowUsesFaceReference: Boolean(faceImage) && mediaBody.seedanceMode === "reference_images",
      workflowStripFirst: workflowNodeOptionEnabled(node, "stripFirst"),
      workflowAddSound: workflowNodeOptionEnabled(node, "addSound"),
      physics: workflow.physics || [],
    },
  };
  const payload = await requestJson("/api/advanced/generate", { method: "POST", body });
  if (payload.user) setUser(payload.user);
  const record = workflowRecordFromPayload(payload, {
    prompt: finalPrompt,
    model: model.label,
    resolution,
    duration,
    ratio: node.data?.ratio || "9:16",
  });
  const taskId = record.taskId || payload.taskId || "";
  if (!taskId) throw new Error("Upstream did not return task id.");
  workflowSetNodeData(node.id, { status: record.status || "submitted", record, taskId });
  mergeAdvancedResultRecord(record);

  const finalRecord = await pollWorkflowTask(node.id, taskId);
  if (!finalRecord || !isSucceededGenerationStatus(finalRecord.status)) {
    throw new Error(finalRecord?.error || `${model.label} failed.`);
  }
  const videoUrl = generationVideoUrl(finalRecord);
  if (!videoUrl) throw new Error(`${model.label} completed without a result video.`);

  let frameUrl = "";
  try {
    frameUrl = await workflowExtractTailFrame(node, taskId, videoUrl, duration);
  } catch (frameError) {
    workflowLog(`Tail frame skipped: ${frameError.message || frameError}`);
  }
  workflowLog(`${model.label} completed.`);
  return { taskId, videoUrl, frameUrl, record: finalRecord, model };
}

function workflowCompletedRunData(nodes = workflowOrderedVideoNodes()) {
  const taskIds = [];
  const videoUrls = [];
  let allComplete = Boolean(nodes.length);
  nodes.forEach((node) => {
    const videoUrl = workflowNodeResultVideo(node);
    const taskId = node.data?.taskId || node.data?.record?.taskId || "";
    if (!workflowNodeHasSuccessfulResult(node) || !videoUrl) {
      allComplete = false;
      return;
    }
    videoUrls.push(videoUrl);
    if (taskId) taskIds.push(taskId);
  });
  return { allComplete, taskIds, videoUrls };
}

async function composeWorkflowOutput(taskIds = [], videoUrls = []) {
  const output = workflowNodeByType("output");
  if (!output || !videoUrls.length) return false;
  workflowThrowIfCancelled();
  workflowSetNodeData(output.id, { status: "processing", resultVideoUrl: "", posterUrl: "", taskIds });
  try {
    const composed = await requestJson("/api/workflow/compose", {
      method: "POST",
      body: { taskIds, videoUrls },
    });
    workflowSetNodeData(output.id, {
      status: "succeeded",
      resultVideoUrl: composed.videoUrl || composed.localVideoUrl || "",
      posterUrl: composed.posterUrl || composed.localPosterUrl || "",
      videoUrls,
      taskIds,
    });
    workflowLog("Final output composed.");
    return true;
  } catch (composeError) {
    workflowSetNodeData(output.id, { status: "failed", error: composeError.message || String(composeError), videoUrls, taskIds });
    workflowLog(`Compose skipped: ${composeError.message || composeError}`);
    return false;
  }
}

async function runWorkflowUploadPreprocess(uploadNode = null) {
  const upload = uploadNode || workflowUploadNode();
  if (!state.user) return openLogin();
  if (!upload?.data?.startImage) {
    state.workflowMessage = "Upload a start image first.";
    renderWorkflowPanel();
    return;
  }
  const firstVideo = workflowFirstVideoNode();
  if (!firstVideo) {
    state.workflowMessage = "Connect a video node first.";
    renderWorkflowPanel();
    return;
  }
  const model = workflowModelById(firstVideo.data?.modelId);
  const faceImage = workflowNodeOptionEnabled(firstVideo, "faceSwapMode") ? (upload.data?.faceImage || "") : "";
  const sourceKey = workflowKeyframeSourceKey(firstVideo, upload.data.startImage, faceImage, { firstNode: true });
  const needsNewKeyframe = upload.data?.keyframeSourceKey !== sourceKey || !upload.data?.keyframeImageUrl;
  if (needsNewKeyframe) clearWorkflowExecutionResults({ fromNodeId: firstVideo.id, message: "Preparing first video keyframe...", render: false });
  state.workflowRunning = true;
  state.workflowCancelRequested = false;
  state.workflowActiveNodeId = upload.id;
  state.workflowSelectedNodeId = upload.id;
  renderWorkflowPanel();
  try {
    const keyframeImage = await workflowPrepareNodeKeyframe(firstVideo, {
      baseImage: upload.data.startImage,
      faceImage,
      model,
      firstNode: true,
      storageNode: upload,
    });
    if (workflowNodeOptionEnabled(firstVideo, "stripFirst") && !upload.data?.endImage) {
      await workflowPrepareStripTargetImage(firstVideo, keyframeImage, model, { storageNode: upload });
    } else {
      workflowSetNodeData(upload.id, { stripTargetImageUrl: "", stripTargetTaskId: "", stripTargetRecord: null, stripTargetSourceKey: "" });
    }
    state.workflowMessage = "Preprocess ready. Run the first video node when you are ready.";
    workflowLog("First video preprocess ready.");
  } catch (error) {
    workflowHandleExecutionError(error);
  } finally {
    state.workflowRunning = false;
    state.workflowCancelRequested = false;
    state.workflowActiveNodeId = "";
    persistWorkflowState();
    renderWorkflowPanel();
  }
}

async function runWorkflowSingleNode(nodeId = "") {
  const requestedNode = workflowNodeById(nodeId);
  if (requestedNode?.type === "upload") {
    await runWorkflowUploadPreprocess(requestedNode);
    return;
  }
  if (!state.user) return openLogin();
  const nodes = workflowOrderedVideoNodes();
  const node = nodes.find((item) => item.id === nodeId);
  const runState = workflowNodeRunState(node || {});
  if (!node || !runState.canRun) {
    state.workflowMessage = runState.reason || "This node cannot run yet.";
    renderWorkflowPanel();
    return;
  }
  const nodeIndex = nodes.findIndex((item) => item.id === node.id);
  state.workflowRunning = true;
  state.workflowCancelRequested = false;
  state.workflowActiveNodeId = node.id;
  clearWorkflowExecutionResults({ fromNodeId: node.id, message: "Running node...", render: false });
  renderWorkflowPanel();
  try {
    const previous = nodeIndex > 0 ? nodes[nodeIndex - 1] : null;
    const context = await workflowContinuationFromPrevious(previous);
    workflowThrowIfCancelled();
    await runWorkflowNode(node, { ...context, firstNode: nodeIndex === 0 });
    const completed = workflowCompletedRunData();
    if (completed.allComplete) {
      await composeWorkflowOutput(completed.taskIds, completed.videoUrls);
      state.workflowMessage = "Workflow completed.";
    } else {
      state.workflowMessage = "Node completed. Run the next node.";
    }
  } catch (error) {
    workflowHandleExecutionError(error);
  } finally {
    state.workflowRunning = false;
    state.workflowCancelRequested = false;
    state.workflowActiveNodeId = "";
    persistWorkflowState();
    renderWorkflowPanel();
  }
}

async function runWorkflow() {
  if (!state.user) return openLogin();
  const upload = workflowUploadNode();
  const sourceImage = upload?.data?.startImage || "";
  const nodes = workflowOrderedVideoNodes();
  if (!nodes.length) {
    state.workflowMessage = "Add a video node first.";
    renderWorkflowPanel();
    return;
  }
  if (!sourceImage) {
    state.workflowMessage = "Upload a start image first.";
    renderWorkflowPanel();
    return;
  }
  state.workflowRunning = true;
  state.workflowCancelRequested = false;
  state.workflowActiveNodeId = "";
  clearWorkflowExecutionResults({ message: "Running workflow...", render: false });
  renderWorkflowPanel();
  let previousFrameUrl = "";
  let previousVideoUrl = "";
  const completedTaskIds = [];
  const completedVideoUrls = [];
  try {
    workflowLog(`Run order: ${nodes.map((node) => workflowModelById(node.data?.modelId).label).join(" -> ")}`);
    for (const node of nodes) {
      workflowThrowIfCancelled();
      const result = await runWorkflowNode(node, {
        previousFrameUrl,
        previousVideoUrl,
        firstNode: completedTaskIds.length === 0,
      });
      previousFrameUrl = result.frameUrl || "";
      previousVideoUrl = result.videoUrl || "";
      if (result.videoUrl) completedVideoUrls.push(result.videoUrl);
      if (result.taskId) completedTaskIds.push(result.taskId);
    }
    workflowThrowIfCancelled();
    await composeWorkflowOutput(completedTaskIds, completedVideoUrls);
    state.workflowMessage = "Workflow completed.";
  } catch (error) {
    workflowHandleExecutionError(error);
  } finally {
    state.workflowRunning = false;
    state.workflowCancelRequested = false;
    state.workflowActiveNodeId = "";
    persistWorkflowState();
    renderWorkflowPanel();
  }
}

function resetWorkflow() {
  state.workflow = cloneWorkflowDefault();
  normalizeWorkflowLayout(state.workflow);
  state.workflowSelectedNodeId = "video-1";
  state.workflowMessage = "";
  state.workflowLogs = [];
  persistWorkflowState();
  renderWorkflowPanel();
}

function workflowCanvasPointFromEvent(event) {
  const canvas = els.workflowRoot?.querySelector(".workflow-canvas");
  const rect = canvas?.getBoundingClientRect();
  if (!rect) return { x: 0, y: 0 };
  const zoom = workflowZoom();
  return {
    x: Math.max(0, Math.round((event.clientX - rect.left) / zoom)),
    y: Math.max(0, Math.round((event.clientY - rect.top) / zoom)),
  };
}

function workflowDraftEdgeElement() {
  return els.workflowRoot?.querySelector("[data-workflow-draft-edge]") || null;
}

function clearWorkflowConnectionTarget() {
  els.workflowRoot?.querySelectorAll(".workflow-node.is-connection-target, .workflow-node.is-connection-source").forEach((node) => {
    node.classList.remove("is-connection-target");
    node.classList.remove("is-connection-source");
  });
}

function workflowConnectionTargetFromPoint(event) {
  const target = document.elementFromPoint(event.clientX, event.clientY);
  let handle = target?.closest?.('[data-workflow-connect="in"]') || null;
  if (!handle) {
    handle = Array.from(els.workflowRoot?.querySelectorAll('[data-workflow-connect="in"]') || []).find((item) => {
      const rect = item.getBoundingClientRect();
      const hitPadding = 18;
      return event.clientX >= rect.left - hitPadding
        && event.clientX <= rect.right + hitPadding
        && event.clientY >= rect.top - hitPadding
        && event.clientY <= rect.bottom + hitPadding;
    }) || null;
  }
  const nodeId = handle?.dataset.nodeId || "";
  const node = workflowNodeById(nodeId);
  if (!workflowNodeAcceptsInput(node) || nodeId === activeWorkflowConnection?.fromId) return null;
  return { handle, node };
}

function workflowConnectionSourceFromPoint(event) {
  const target = document.elementFromPoint(event.clientX, event.clientY);
  let handle = target?.closest?.('[data-workflow-connect="out"]') || null;
  if (!handle) {
    handle = Array.from(els.workflowRoot?.querySelectorAll('[data-workflow-connect="out"]') || []).find((item) => {
      const rect = item.getBoundingClientRect();
      const hitPadding = 18;
      return event.clientX >= rect.left - hitPadding
        && event.clientX <= rect.right + hitPadding
        && event.clientY >= rect.top - hitPadding
        && event.clientY <= rect.bottom + hitPadding;
    }) || null;
  }
  const nodeId = handle?.dataset.nodeId || "";
  const node = workflowNodeById(nodeId);
  if (!workflowNodeAcceptsOutput(node) || nodeId === activeWorkflowConnection?.toId) return null;
  return { handle, node };
}

function updateWorkflowConnectionTarget(event) {
  clearWorkflowConnectionTarget();
  if (activeWorkflowConnection?.mode === "edge-from") {
    const source = workflowConnectionSourceFromPoint(event);
    if (!source) return;
    source.handle.closest("[data-workflow-node]")?.classList.add("is-connection-source");
    return;
  }
  const target = workflowConnectionTargetFromPoint(event);
  if (!target) return;
  target.handle.closest("[data-workflow-node]")?.classList.add("is-connection-target");
}

function updateWorkflowDraftEdge(event) {
  if (!activeWorkflowConnection) return;
  const path = workflowDraftEdgeElement();
  if (!path) return;
  const point = workflowCanvasPointFromEvent(event);
  const d = activeWorkflowConnection.mode === "edge-from"
    ? workflowConnectionPath(point.x, point.y, activeWorkflowConnection.x2, activeWorkflowConnection.y2)
    : workflowConnectionPath(activeWorkflowConnection.x1, activeWorkflowConnection.y1, point.x, point.y);
  path.setAttribute("d", d);
  path.removeAttribute("hidden");
}

function stopWorkflowConnectionDrag() {
  const path = workflowDraftEdgeElement();
  path?.setAttribute("hidden", "");
  path?.removeAttribute("d");
  activeWorkflowConnection = null;
  clearWorkflowConnectionTarget();
  els.workflowRoot?.classList.remove("is-connecting");
}

function updateWorkflowRenderedEdges() {
  const svg = els.workflowRoot?.querySelector(".workflow-edges");
  if (!svg) return;
  const draft = workflowDraftEdgeElement();
  const draftD = draft?.getAttribute("d") || "";
  const draftHidden = !draft || draft.hasAttribute("hidden");
  svg.innerHTML = `
    ${renderWorkflowEdges()}
    <path class="workflow-edge-draft" data-workflow-draft-edge ${draftHidden ? "hidden" : ""} ${draftD ? `d="${escapeHtml(draftD)}"` : ""} />
  `;
}

function workflowNodeDragBlockedTarget(target) {
  return Boolean(target.closest("button, input, textarea, select, label, a, [data-workflow-connect], [data-workflow-preview], [data-workflow-preview-url], [data-workflow-open-picker], [data-workflow-delete], .workflow-node-tabs, .workflow-model-card"));
}

function workflowControlInteractionTarget(target) {
  return Boolean(target.closest("input, textarea, select, label, [contenteditable], .workflow-field, .workflow-inline-fields"));
}

function clampWorkflowNodePosition(x = 0, y = 0) {
  return {
    x: Math.max(0, Math.min(Math.round(x), WORKFLOW_CANVAS_MAX_WIDTH - WORKFLOW_NODE_WIDTH)),
    y: Math.max(0, Math.min(Math.round(y), WORKFLOW_CANVAS_MAX_HEIGHT - 100)),
  };
}

function startWorkflowNodeDrag(event) {
  if (event.button !== undefined && event.button !== 0) return false;
  if (workflowNodeDragBlockedTarget(event.target)) return false;
  const nodeEl = event.target.closest("[data-workflow-node]");
  const node = workflowNodeById(nodeEl?.dataset.workflowNode || "");
  if (!node) return false;
  activeWorkflowNodeDrag = {
    nodeId: node.id,
    pointerId: event.pointerId,
    startClientX: event.clientX,
    startClientY: event.clientY,
    originX: Number(node.x || 0),
    originY: Number(node.y || 0),
    moved: false,
  };
  state.workflowSelectedNodeId = node.id;
  nodeEl.classList.add("is-dragging");
  els.workflowRoot?.classList.add("is-dragging-node");
  event.preventDefault();
  event.stopPropagation();
  nodeEl.setPointerCapture?.(event.pointerId);
  return true;
}

function updateWorkflowNodeDrag(event) {
  if (!activeWorkflowNodeDrag) return;
  const node = workflowNodeById(activeWorkflowNodeDrag.nodeId);
  const nodeEl = Array.from(els.workflowRoot?.querySelectorAll("[data-workflow-node]") || [])
    .find((item) => item.dataset.workflowNode === activeWorkflowNodeDrag.nodeId);
  if (!node || !nodeEl) return;
  const zoom = workflowZoom();
  const dx = (event.clientX - activeWorkflowNodeDrag.startClientX) / zoom;
  const dy = (event.clientY - activeWorkflowNodeDrag.startClientY) / zoom;
  if (Math.abs(dx) > 2 || Math.abs(dy) > 2) activeWorkflowNodeDrag.moved = true;
  syncWorkflowCanvasStageSize();
  const next = clampWorkflowNodePosition(activeWorkflowNodeDrag.originX + dx, activeWorkflowNodeDrag.originY + dy);
  node.x = next.x;
  node.y = next.y;
  nodeEl.style.left = `${next.x}px`;
  nodeEl.style.top = `${next.y}px`;
  syncWorkflowCanvasStageSize();
  updateWorkflowRenderedEdges();
}

function handleWorkflowWheel(event) {
  const canvas = event.target.closest?.(".workflow-canvas");
  if (!canvas) return;
  const workflow = ensureWorkflowState();
  const current = workflowZoom();
  const direction = event.deltaY > 0 ? -1 : 1;
  const multiplier = direction > 0 ? 1.08 : 0.92;
  const nextZoom = normalizeWorkflowZoom(current * multiplier);
  if (nextZoom === current) return;
  event.preventDefault();
  workflow.zoom = nextZoom;
  persistWorkflowState();
  const stage = canvas.querySelector(".workflow-canvas-stage");
  if (stage) stage.style.setProperty("--workflow-zoom", String(nextZoom));
  syncWorkflowCanvasStageSize();
  updateWorkflowRenderedEdges();
}

function stopWorkflowNodeDrag({ commit = true } = {}) {
  if (!activeWorkflowNodeDrag) return;
  const didMove = activeWorkflowNodeDrag.moved;
  els.workflowRoot?.querySelectorAll(".workflow-node.is-dragging").forEach((node) => node.classList.remove("is-dragging"));
  els.workflowRoot?.classList.remove("is-dragging-node");
  activeWorkflowNodeDrag = null;
  if (didMove) {
    suppressWorkflowClickUntil = Date.now() + 250;
    setTimeout(() => {
      if (Date.now() >= suppressWorkflowClickUntil) suppressWorkflowClickUntil = 0;
    }, 260);
  }
  if (commit && didMove) {
    persistWorkflowState();
    renderWorkflowPanel();
  }
}

function connectWorkflowNodes(fromId = "", toId = "") {
  const workflow = ensureWorkflowState();
  const from = workflow.nodes.find((node) => node.id === fromId);
  const to = workflow.nodes.find((node) => node.id === toId);
  if (!workflowNodeAcceptsOutput(from) || !workflowNodeAcceptsInput(to) || fromId === toId) return false;
  workflow.edges = workflow.edges.filter((edge) => edge.from !== fromId && edge.to !== toId);
  workflow.edges.push({ from: fromId, to: toId });
  state.workflowSelectedNodeId = to.type === "output" ? fromId : toId;
  persistWorkflowState();
  renderWorkflowPanel();
  return true;
}

function reconnectWorkflowEdge(oldFromId = "", oldToId = "", nextFromId = "", nextToId = "") {
  const workflow = ensureWorkflowState();
  const from = workflow.nodes.find((node) => node.id === nextFromId);
  const to = workflow.nodes.find((node) => node.id === nextToId);
  if (!workflowNodeAcceptsOutput(from) || !workflowNodeAcceptsInput(to) || nextFromId === nextToId) return false;
  workflow.edges = workflow.edges.filter((edge) => !(edge.from === oldFromId && edge.to === oldToId));
  return connectWorkflowNodes(nextFromId, nextToId);
}

function startWorkflowEdgeDrag(event, edgeEl) {
  const edgeFrom = edgeEl.dataset.edgeFrom || "";
  const edgeTo = edgeEl.dataset.edgeTo || "";
  const from = workflowNodeById(edgeFrom);
  const to = workflowNodeById(edgeTo);
  if (!from || !to) return false;
  const fromPoint = workflowNodeAnchor(from, "out");
  const toPoint = workflowNodeAnchor(to, "in");
  const handle = edgeEl.dataset.workflowEdgeHandle || edgeEl.dataset.workflowEdgeDrag || "to";
  activeWorkflowConnection = {
    mode: handle === "from" ? "edge-from" : "edge-to",
    edgeFrom,
    edgeTo,
    fromId: edgeFrom,
    toId: edgeTo,
    pointerId: event.pointerId,
    x1: fromPoint.x,
    y1: fromPoint.y,
    x2: toPoint.x,
    y2: toPoint.y,
  };
  event.preventDefault();
  event.stopPropagation();
  els.workflowRoot?.classList.add("is-connecting");
  updateWorkflowDraftEdge(event);
  updateWorkflowConnectionTarget(event);
  edgeEl.setPointerCapture?.(event.pointerId);
  return true;
}

function handleWorkflowPointerDown(event) {
  const edgeEl = event.target.closest?.("[data-workflow-edge-handle], [data-workflow-edge-drag]");
  if (edgeEl) {
    startWorkflowEdgeDrag(event, edgeEl);
    return;
  }
  const handle = event.target.closest('[data-workflow-connect="out"]');
  if (!handle) {
    startWorkflowNodeDrag(event);
    return;
  }
  const fromId = handle.dataset.nodeId || "";
  const from = workflowNodeById(fromId);
  if (!workflowNodeAcceptsOutput(from)) return;
  const anchor = workflowNodeAnchor(from, "out");
  activeWorkflowConnection = {
    mode: "from-node",
    fromId,
    pointerId: event.pointerId,
    x1: anchor.x,
    y1: anchor.y,
  };
  event.preventDefault();
  event.stopPropagation();
  els.workflowRoot?.classList.add("is-connecting");
  updateWorkflowDraftEdge(event);
  updateWorkflowConnectionTarget(event);
  handle.setPointerCapture?.(event.pointerId);
}

function handleWorkflowPointerMove(event) {
  if (activeWorkflowNodeDrag && activeWorkflowNodeDrag.pointerId === event.pointerId) {
    event.preventDefault();
    updateWorkflowNodeDrag(event);
    return;
  }
  if (!activeWorkflowConnection || activeWorkflowConnection.pointerId !== event.pointerId) return;
  event.preventDefault();
  updateWorkflowDraftEdge(event);
  updateWorkflowConnectionTarget(event);
}

function handleWorkflowPointerUp(event) {
  if (activeWorkflowNodeDrag && activeWorkflowNodeDrag.pointerId === event.pointerId) {
    event.preventDefault();
    stopWorkflowNodeDrag();
    return;
  }
  if (!activeWorkflowConnection || activeWorkflowConnection.pointerId !== event.pointerId) return;
  event.preventDefault();
  const connection = activeWorkflowConnection;
  const target = connection.mode === "edge-from" ? null : workflowConnectionTargetFromPoint(event);
  const source = connection.mode === "edge-from" ? workflowConnectionSourceFromPoint(event) : null;
  stopWorkflowConnectionDrag();
  if (connection.mode === "edge-from") {
    if (source?.node?.id) reconnectWorkflowEdge(connection.edgeFrom, connection.edgeTo, source.node.id, connection.edgeTo);
    return;
  }
  if (!target?.node?.id) return;
  if (connection.edgeFrom && connection.edgeTo) {
    reconnectWorkflowEdge(connection.edgeFrom, connection.edgeTo, connection.fromId, target.node.id);
  } else {
    connectWorkflowNodes(connection.fromId, target.node.id);
  }
}

function handleWorkflowPointerCancel(event) {
  if (activeWorkflowNodeDrag && activeWorkflowNodeDrag.pointerId === event.pointerId) {
    stopWorkflowNodeDrag();
    return;
  }
  if (!activeWorkflowConnection || activeWorkflowConnection.pointerId !== event.pointerId) return;
  stopWorkflowConnectionDrag();
}

function handleWorkflowClick(event) {
  if (Date.now() < suppressWorkflowClickUntil) {
    event.preventDefault();
    event.stopPropagation();
    return;
  }
  if (event.target.closest("[data-workflow-connect]")) {
    event.preventDefault();
    return;
  }
  const openPickerButton = event.target.closest("[data-workflow-open-picker]");
  if (openPickerButton) {
    event.stopPropagation();
    state.workflowPickerNodeId = openPickerButton.dataset.workflowOpenPicker || "";
    state.workflowPickerSearch = "";
    renderWorkflowPanel();
    return;
  }
  const selectModelButton = event.target.closest("[data-workflow-select-model]");
  if (selectModelButton) {
    event.stopPropagation();
    const node = workflowNodeById(state.workflowPickerNodeId || "");
    if (node?.type === "video") {
      const model = workflowModelById(selectModelButton.dataset.workflowSelectModel || "");
      node.data.modelId = model.id;
      node.title = model.label;
      state.workflowSelectedNodeId = node.id;
      state.workflowPickerNodeId = "";
      state.workflowPickerSearch = "";
      persistWorkflowState();
      renderWorkflowPanel();
    }
    return;
  }
  const closePicker = event.target.closest("[data-workflow-close-picker]");
  if (closePicker && (!event.target.closest("[data-workflow-picker]") || closePicker.tagName === "BUTTON")) {
    state.workflowPickerNodeId = "";
    state.workflowPickerSearch = "";
    renderWorkflowPanel();
    return;
  }
  const deleteButton = event.target.closest("[data-workflow-delete]");
  if (deleteButton) {
    event.stopPropagation();
    const nodeId = deleteButton.dataset.workflowDelete || "";
    const workflow = ensureWorkflowState();
    workflow.nodes = workflow.nodes.filter((node) => node.id !== nodeId);
    workflow.edges = workflow.edges.filter((edge) => edge.from !== nodeId && edge.to !== nodeId);
    state.workflowSelectedNodeId = workflowVideoNodes()[0]?.id || "upload-1";
    persistWorkflowState();
    renderWorkflowPanel();
    return;
  }
  const nodeTabButton = event.target.closest("[data-workflow-node-tab]");
  if (nodeTabButton) {
    event.stopPropagation();
    const node = workflowNodeById(nodeTabButton.dataset.nodeId || "");
    if (node?.type === "video") {
      node.data = { ...(node.data || {}), activeTab: nodeTabButton.dataset.workflowNodeTab === "params" ? "params" : "preview" };
      state.workflowSelectedNodeId = node.id;
      persistWorkflowState();
      renderWorkflowPanel();
    }
    return;
  }
  const runNodeButton = event.target.closest("[data-workflow-run-node]");
  if (runNodeButton) {
    event.stopPropagation();
    if (!runNodeButton.disabled) runWorkflowSingleNode(runNodeButton.dataset.workflowRunNode || "");
    return;
  }
  const directPreviewButton = event.target.closest("[data-workflow-preview-url]");
  if (directPreviewButton) {
    event.preventDefault();
    event.stopPropagation();
    const url = directPreviewButton.dataset.workflowPreviewUrl || "";
    const kind = directPreviewButton.dataset.workflowPreviewKind || workflowPreviewKindFromUrl(url);
    const title = directPreviewButton.dataset.workflowPreviewTitle || "Workflow preview";
    const ratio = directPreviewButton.dataset.workflowPreviewRatio || "9:16";
    if (!url) return;
    if (kind === "image") previewImage({ title, imageUrl: url });
    else playPreview({ title, previewUrl: url, ratio });
    return;
  }
  const previewButton = event.target.closest("[data-workflow-preview]");
  if (previewButton) {
    event.preventDefault();
    event.stopPropagation();
    const node = workflowNodeById(previewButton.dataset.workflowPreview || "");
    const model = workflowModelById(node?.data?.modelId);
    const videoUrl = workflowNodeResultVideo(node || {}) || model.previewUrl || "";
    const imageUrl = node?.data?.stripTargetImageUrl || node?.data?.keyframeImageUrl || node?.data?.startImage || "";
    if (videoUrl) playPreview({ title: node?.title || model.label || "Workflow preview", previewUrl: videoUrl, ratio: node?.data?.ratio || "9:16" });
    else if (imageUrl) previewImage({ title: node?.title || model.label || "Workflow preview", imageUrl });
    return;
  }
  if (workflowControlInteractionTarget(event.target)) {
    event.stopPropagation();
    return;
  }
  const action = event.target.closest("[data-workflow-action]")?.dataset.workflowAction || "";
  if (action) {
    event.stopPropagation();
    if (action === "run") runWorkflow();
    if (action === "cancel") requestWorkflowCancel();
    if (action === "clear-results") clearWorkflowExecutionResults();
    if (action === "add-video" || action === "add-branch") addWorkflowVideoNode();
    if (action === "physics") {
      state.workflowShowPhysics = !state.workflowShowPhysics;
      renderWorkflowPanel();
    }
    if (action === "refiner") addWorkflowVideoNode("imagine-realistic");
    if (action === "director") {
      const input = els.workflowRoot?.querySelector("[data-workflow-director]");
      input?.focus();
    }
    if (action === "director-build") applyWorkflowDirectorPrompt();
    if (action === "reset") resetWorkflow();
    return;
  }
  const nodeEl = event.target.closest("[data-workflow-node]");
  if (nodeEl) {
    state.workflowSelectedNodeId = nodeEl.dataset.workflowNode || "";
    renderWorkflowPanel();
    return;
  }
  const physicsButton = event.target.closest("[data-workflow-physics]");
  if (physicsButton) {
    const workflow = ensureWorkflowState();
    const active = new Set(workflow.physics || []);
    const id = physicsButton.dataset.workflowPhysics || "";
    if (active.has(id)) active.delete(id);
    else if (active.size < 3) active.add(id);
    workflow.physics = [...active];
    persistWorkflowState();
    renderWorkflowPanel();
  }
  const templateButton = event.target.closest("[data-workflow-template]");
  if (templateButton) applyWorkflowTemplate(templateButton.dataset.workflowTemplate || "");
}

function handleWorkflowInput(event) {
  const target = event.target;
  if (target.matches("[data-workflow-picker-search]")) {
    state.workflowPickerSearch = target.value || "";
    const node = workflowNodeById(state.workflowPickerNodeId || "");
    const grid = els.workflowRoot?.querySelector(".workflow-picker-grid");
    if (grid) {
      grid.innerHTML = renderWorkflowPickerCards(workflowFilteredPresets(state.workflowPickerSearch), workflowModelById(node?.data?.modelId));
      refreshIcons();
    }
    return;
  }
  if (target.matches("[data-workflow-director]")) {
    ensureWorkflowState().directorPrompt = target.value || "";
    persistWorkflowState();
    return;
  }
  if (target.matches("[data-workflow-prompt]")) {
    const node = workflowNodeById(target.dataset.workflowPrompt || "");
    if (node) {
      node.data.prompt = target.value || "";
      persistWorkflowState();
    }
    return;
  }
  if (target.matches("[data-workflow-prompt], [data-workflow-duration], [data-workflow-resolution], [data-workflow-toggle]")) {
    updateWorkflowNodeFromControl(target);
  }
}
