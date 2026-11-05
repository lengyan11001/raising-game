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

function stopModalMedia(root) {
  root?.querySelectorAll?.("video, audio").forEach((media) => {
    try {
      media.pause();
    } catch {
      /* ignore */
    }
    media.removeAttribute("src");
    media.querySelectorAll?.("source").forEach((source) => source.removeAttribute("src"));
    try {
      media.load();
    } catch {
      /* ignore */
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
  stopModalMedia(els.inlineDialogBody);
  els.inlineDialogBody.innerHTML = body || "";
  if (els.inlineDialogConfirm) {
    // Handle the button explicitly so dialog's native method=dialog behavior
    // cannot close the modal before the async action finishes.
    els.inlineDialogConfirm.type = "button";
    els.inlineDialogConfirm.onclick = null;
    els.inlineDialogConfirm.disabled = false;
    els.inlineDialogConfirm.innerHTML = `<i data-lucide="sparkles"></i>${escapeHtml(confirmText || t("common.generate"))}`;
  }
  refreshIcons();
  return new Promise((resolve) => {
    const cleanup = () => {
      stopModalMedia(els.inlineDialogBody);
      els.inlineDialogForm.removeEventListener("submit", submitHandler);
      if (els.inlineDialogConfirm?.onclick === submitHandler) els.inlineDialogConfirm.onclick = null;
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
    if (els.inlineDialogConfirm) els.inlineDialogConfirm.onclick = submitHandler;
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

function downloadTextFile(filename = "api-doc.md", text = "", type = "text/markdown;charset=utf-8") {
  const blob = new Blob([text], { type });
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

function apiDocInlineMarkdown(value = "") {
  let html = escapeHtml(value);
  html = html.replace(/`([^`]+)`/g, "<code>$1</code>");
  html = html.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  html = html.replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
  return html;
}

function apiDocMarkdownTable(lines = []) {
  const rows = lines
    .filter((line) => !/^\|\s*:?-{3,}/.test(line))
    .map((line) => line.replace(/^\||\|$/g, "").split("|").map((cell) => cell.trim()));
  if (!rows.length) return "";
  const [head, ...body] = rows;
  return `
    <div class="api-doc-table-wrap">
      <table>
        <thead><tr>${head.map((cell) => `<th>${apiDocInlineMarkdown(cell)}</th>`).join("")}</tr></thead>
        <tbody>${body.map((row) => `<tr>${row.map((cell) => `<td>${apiDocInlineMarkdown(cell)}</td>`).join("")}</tr>`).join("")}</tbody>
      </table>
    </div>
  `;
}

function apiDocMarkdownHtml(markdown = "") {
  const lines = String(markdown || "").replace(/\r\n/g, "\n").split("\n");
  const output = [];
  let paragraph = [];
  let listType = "";
  let listItems = [];
  let codeLines = [];
  let codeLanguage = "";
  let inCode = false;
  let tableLines = [];

  const flushParagraph = () => {
    if (!paragraph.length) return;
    output.push(`<p>${apiDocInlineMarkdown(paragraph.join(" ").trim())}</p>`);
    paragraph = [];
  };
  const flushList = () => {
    if (!listItems.length) return;
    const tag = listType === "ol" ? "ol" : "ul";
    output.push(`<${tag}>${listItems.map((item) => `<li>${apiDocInlineMarkdown(item)}</li>`).join("")}</${tag}>`);
    listItems = [];
    listType = "";
  };
  const flushTable = () => {
    if (tableLines.length) output.push(apiDocMarkdownTable(tableLines));
    tableLines = [];
  };
  const flushCode = () => {
    const code = codeLines.join("\n");
    output.push(`
      <div class="api-doc-code">
        <div class="api-doc-code-head">
          <span>${escapeHtml(codeLanguage || "code")}</span>
          <button class="ghost-button" type="button" data-api-copy-code><i data-lucide="copy"></i>复制代码</button>
        </div>
        <pre><code>${escapeHtml(code)}</code></pre>
      </div>
    `);
    codeLines = [];
    codeLanguage = "";
  };
  const flushAll = () => {
    flushParagraph();
    flushList();
    flushTable();
  };

  for (const line of lines) {
    const fence = line.match(/^```\s*([^\s]*)\s*$/);
    if (fence) {
      if (inCode) {
        flushCode();
        inCode = false;
      } else {
        flushAll();
        inCode = true;
        codeLanguage = fence[1] || "code";
      }
      continue;
    }
    if (inCode) {
      codeLines.push(line);
      continue;
    }
    if (!line.trim()) {
      flushAll();
      continue;
    }
    const heading = line.match(/^(#{3,5})\s+(.+)$/);
    if (heading) {
      flushAll();
      const level = Math.min(6, heading[1].length + 1);
      output.push(`<h${level}>${apiDocInlineMarkdown(heading[2])}</h${level}>`);
      continue;
    }
    if (/^\s*---+\s*$/.test(line)) {
      flushAll();
      continue;
    }
    if (/^\s*\|/.test(line)) {
      flushParagraph();
      flushList();
      tableLines.push(line.trim());
      continue;
    }
    flushTable();
    const unordered = line.match(/^\s*[-*]\s+(.+)$/);
    const ordered = line.match(/^\s*\d+\.\s+(.+)$/);
    if (unordered || ordered) {
      flushParagraph();
      const nextType = ordered ? "ol" : "ul";
      if (listType && listType !== nextType) flushList();
      listType = nextType;
      listItems.push((ordered || unordered)[1]);
      continue;
    }
    flushList();
    paragraph.push(line.trim());
  }
  if (inCode) flushCode();
  flushAll();
  return output.join("\n");
}

async function copyTextToClipboard(text = "") {
  const value = String(text ?? "");
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(value);
      return;
    } catch (error) {
      console.warn("[clipboard-api]", error?.message || error);
    }
  }
  const textarea = document.createElement("textarea");
  textarea.value = value;
  textarea.setAttribute("readonly", "readonly");
  textarea.style.position = "fixed";
  textarea.style.left = "-9999px";
  textarea.style.top = "0";
  document.body.appendChild(textarea);
  textarea.select();
  textarea.setSelectionRange(0, textarea.value.length);
  const copied = document.execCommand("copy");
  textarea.remove();
  if (!copied) throw new Error("浏览器拒绝了剪贴板访问，请允许复制后重试");
}

function showApiDocCopyResult(button, successText = "已复制") {
  if (!button) return;
  const original = button.innerHTML;
  button.innerHTML = `<i data-lucide="check"></i>${escapeHtml(successText)}`;
  button.classList.add("is-copied");
  refreshIcons();
  window.setTimeout(() => {
    button.innerHTML = original;
    button.classList.remove("is-copied");
    refreshIcons();
  }, 1400);
}

async function copyApiDocText(button, text = "", successText = "已复制") {
  try {
    await copyTextToClipboard(text);
    showApiDocCopyResult(button, successText);
    return true;
  } catch (error) {
    showApiDocCopyResult(button, "复制失败");
    console.warn("[api-doc-copy]", error?.message || error);
    return false;
  }
}

function activeApiDocSection() {
  const sections = state.apiDocsCenter?.sections || [];
  return sections.find((section) => section.id === state.apiDocsCenterActiveId) || sections[0] || null;
}

function apiDocSectionFilename(section = {}) {
  return `${String(section.id || "api-section").replace(/[^a-z0-9-]+/gi, "-")}.md`;
}

async function fetchCanonicalApiDocsMarkdown() {
  const response = await fetch(apiUrl("/docs/api.md"), {
    cache: "no-store",
    headers: state.token ? { authorization: `Bearer ${state.token}` } : {},
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload.message || `Documentation download failed: ${response.status}`);
  }
  return response.text();
}

function renderApiDocsCenter() {
  if (!els.apiDocsCenter) return;
  if (state.apiDocsCenterLoading && !state.apiDocsCenter) {
    els.apiDocsCenter.innerHTML = `<div class="api-doc-center-loading"><i data-lucide="loader-circle"></i>加载接口文档...</div>`;
    refreshIcons();
    return;
  }
  if (state.apiDocsCenterError) {
    els.apiDocsCenter.innerHTML = `
      <div class="api-doc-center-error">
        <strong>接口文档加载失败</strong>
        <p>${escapeHtml(state.apiDocsCenterError)}</p>
        <button class="ghost-button" id="retryApiDocsBtn" type="button"><i data-lucide="refresh-cw"></i>重新加载</button>
      </div>
    `;
    els.apiDocsCenter.querySelector("#retryApiDocsBtn")?.addEventListener("click", () => loadApiDocsCenter({ force: true }));
    refreshIcons();
    return;
  }
  const docs = state.apiDocsCenter;
  if (!docs) {
    loadApiDocsCenter();
    return;
  }
  const sections = Array.isArray(docs.sections) ? docs.sections : [];
  const groups = Array.isArray(docs.groups) && docs.groups.length ? docs.groups : [
    { id: "basics", title: "基础与接入" },
    { id: "video", title: "视频生成" },
    { id: "image", title: "图片生成" },
    { id: "assets", title: "素材管理" },
    { id: "live", title: "实时聊天嵌入" },
  ];
  const active = activeApiDocSection();
  if (active && state.apiDocsCenterActiveId !== active.id) state.apiDocsCenterActiveId = active.id;
  const nav = groups.map((group) => {
    const children = sections.filter((section) => section.group === group.id);
    if (!children.length) return "";
    return `
      <section class="api-doc-nav-group">
        <strong>${escapeHtml(group.title)}</strong>
        ${children.map((section) => `
          <button class="${section.id === active?.id ? "is-active" : ""}" type="button" data-api-doc-section="${escapeHtml(section.id)}">
            <span>${escapeHtml(section.title)}</span>
          </button>
        `).join("")}
      </section>
    `;
  }).join("");
  els.apiDocsCenter.innerHTML = `
    <header class="api-doc-center-head">
      <div>
        <span class="copy-kicker"><i data-lucide="book-open-text"></i>API Documentation</span>
        <h3>${escapeHtml(docs.title || "API Documentation")}</h3>
        <p>${escapeHtml(docs.summary || "")}</p>
        <div class="api-doc-meta">
          <span>Version ${escapeHtml(docs.version || "1.0")}</span>
          <span>Updated ${escapeHtml(formatDateTime(docs.updatedAt) || docs.updatedAt || "-")}</span>
          <code>${escapeHtml(docs.baseUrl || "")}</code>
        </div>
      </div>
      <div class="api-doc-center-actions">
        <button class="ghost-button" id="copyAllApiDocsBtn" type="button"><i data-lucide="clipboard-copy"></i>复制全部</button>
        <button class="ghost-button" id="downloadAllApiDocsBtn" type="button"><i data-lucide="file-down"></i>下载 Markdown</button>
        <button class="ghost-button" id="downloadApiDocsJsonBtn" type="button"><i data-lucide="braces"></i>下载 JSON</button>
      </div>
    </header>
    <div class="api-doc-layout">
      <aside class="api-doc-nav" aria-label="API documentation sections">${nav}</aside>
      <article class="api-doc-article">
        ${active ? `
          <div class="api-doc-article-head">
            <div>
              <span>${escapeHtml(groups.find((group) => group.id === active.group)?.title || "")}</span>
              <h4>${escapeHtml(active.title)}</h4>
            </div>
            <div class="api-doc-section-actions">
              <button class="ghost-button" type="button" data-copy-api-section="${escapeHtml(active.id)}"><i data-lucide="copy"></i>复制本节</button>
              <button class="ghost-button" type="button" data-download-api-section="${escapeHtml(active.id)}"><i data-lucide="download"></i>下载本节</button>
            </div>
          </div>
          <div class="api-doc-markdown">${apiDocMarkdownHtml(active.markdown)}</div>
        ` : `<div class="api-doc-center-loading">No documentation sections available.</div>`}
      </article>
    </div>
  `;
  els.apiDocsCenter.querySelectorAll("[data-api-doc-section]").forEach((button) => {
    button.addEventListener("click", () => {
      state.apiDocsCenterActiveId = button.dataset.apiDocSection || "";
      renderApiDocsCenter();
      els.apiDocsCenter?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  });
  els.apiDocsCenter.querySelectorAll("[data-copy-api-section]").forEach((button) => {
    button.addEventListener("click", async () => {
      const section = (state.apiDocsCenter?.sections || []).find((item) => item.id === button.dataset.copyApiSection);
      if (!section) return;
      await copyApiDocText(button, section.markdown || "", "已复制");
    });
  });
  els.apiDocsCenter.querySelectorAll("[data-download-api-section]").forEach((button) => {
    button.addEventListener("click", () => {
      const section = (state.apiDocsCenter?.sections || []).find((item) => item.id === button.dataset.downloadApiSection);
      if (!section) return;
      downloadTextFile(apiDocSectionFilename(section), section.markdown || "");
    });
  });
  els.apiDocsCenter.querySelectorAll("[data-api-copy-code]").forEach((button) => {
    button.addEventListener("click", async () => {
      const code = button.closest(".api-doc-code")?.querySelector("pre code")?.textContent || "";
      await copyApiDocText(button, code, "已复制");
    });
  });
  els.apiDocsCenter.querySelector("#copyAllApiDocsBtn")?.addEventListener("click", async (event) => {
    const button = event.currentTarget;
    button.disabled = true;
    try {
      const markdown = await fetchCanonicalApiDocsMarkdown();
      await copyTextToClipboard(markdown);
      button.innerHTML = `<i data-lucide="check"></i>已复制全部`;
    } catch (error) {
      button.innerHTML = `<i data-lucide="triangle-alert"></i>${escapeHtml(error.message || "复制失败")}`;
    } finally {
      button.disabled = false;
      refreshIcons();
      window.setTimeout(() => renderApiDocsCenter(), 1600);
    }
  });
  els.apiDocsCenter.querySelector("#downloadAllApiDocsBtn")?.addEventListener("click", async (event) => {
    const button = event.currentTarget;
    button.disabled = true;
    try {
      const markdown = await fetchCanonicalApiDocsMarkdown();
      downloadTextFile("vipeak-api-docs.md", markdown);
      button.innerHTML = `<i data-lucide="check"></i>已下载`;
      refreshIcons();
      window.setTimeout(() => renderApiDocsCenter(), 1400);
    } catch (error) {
      button.innerHTML = `<i data-lucide="triangle-alert"></i>${escapeHtml(error.message || "下载失败")}`;
      refreshIcons();
      window.setTimeout(() => renderApiDocsCenter(), 1800);
    } finally {
      button.disabled = false;
    }
  });
  els.apiDocsCenter.querySelector("#downloadApiDocsJsonBtn")?.addEventListener("click", () => {
    downloadTextFile("vipeak-api-docs.json", JSON.stringify(state.apiDocsCenter, null, 2), "application/json;charset=utf-8");
  });
  refreshIcons();
}

async function loadApiDocsCenter({ force = false } = {}) {
  if (!els.apiDocsCenter || !tenantFeature("apiAccess", true)) return;
  if (state.apiDocsCenterLoading) return;
  if (state.apiDocsCenter && !force) {
    renderApiDocsCenter();
    return;
  }
  state.apiDocsCenterLoading = true;
  state.apiDocsCenterError = "";
  renderApiDocsCenter();
  try {
    const docs = await requestJson(apiUrl("/docs/api.json"));
    state.apiDocsCenter = docs;
    state.apiDocsCenterActiveId = state.apiDocsCenterActiveId || docs.sections?.[0]?.id || "";
  } catch (error) {
    state.apiDocsCenterError = error.message || String(error);
  } finally {
    state.apiDocsCenterLoading = false;
    renderApiDocsCenter();
  }
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
  applySiteProfileChrome();
  const assetEnabled = tenantFeature("assetLibrary", true);
  const workflowEnabled = canUseWorkflow();
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
  document.querySelectorAll(".tenant-main-only").forEach((element) => {
    element.hidden = toolOnly;
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
  const hiddenNavTabs = tenantListFeature("hiddenNavTabs");
  if (hiddenNavTabs.length) {
    document.querySelectorAll("[data-tab]").forEach((element) => {
      if (hiddenNavTabs.includes(element.dataset.tab || "")) element.hidden = true;
    });
  }
  // The welcome-page entry only exists for site profiles that enable it.
  document.querySelectorAll('[data-tab="home"]').forEach((element) => {
    element.hidden = !tenantFeature("navHome", false) || !isTabAllowed("home");
  });
  document.querySelectorAll("[data-gallery-shortcut]").forEach((element) => {
    const shortcut = element.dataset.galleryShortcut || "";
    element.hidden = !isTabAllowed(DEFAULT_PLATFORM_TAB)
      || !isGalleryModeAllowed(shortcut)
      || (shortcut === "playflux-anime" && !animeEnabled);
  });
  if (typeof syncSideNavigationMore === "function") syncSideNavigationMore();
  document.querySelectorAll("[data-panel='access'], #accessTokenCard").forEach((element) => {
    element.hidden = !apiAccessEnabled || element.hidden;
  });
  [els.copyTokenBtn, els.menuCopyTokenBtn, els.toggleAccessTokenBtn, els.copyAccountTokenBtn, els.toggleAccountTokenBtn].forEach((element) => {
    if (element) element.hidden = !apiAccessEnabled;
  });
  const accountTokenBox = els.accountToken?.closest(".token-box");
  if (accountTokenBox) accountTokenBox.hidden = !apiAccessEnabled;
  renderHomePanel();
}

// Site-profile chrome: the 123vip.fans welcome page and its own naming.
function applySiteProfileChrome() {
  if (!isSiteProfile("custom-workflow")) return;
  const brand = document.querySelector("a.brand");
  if (brand) brand.setAttribute("href", "#home");
  document.querySelectorAll('[data-tab="custom"] [data-i18n]').forEach((element) => {
    element.dataset.i18n = "nav.create";
    setLocalizedContent(element, t("nav.create", {}, element.textContent));
  });
}

function renderHomePanel() {
  if (!isSiteProfile("custom-workflow")) return;
  const loggedIn = Boolean(state.user);
  document.querySelectorAll("[data-home-action]").forEach((button) => {
    button.hidden = (button.dataset.homeAction || "") === "create" ? !loggedIn : loggedIn;
  });
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
  if (state.tab === "chat") renderChatPanel();
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
  if (state.tab === "advanced" && state.advancedCreateKind === ADVANCED_CUSTOM_KIND.id) loadAdvancedAssets();
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
  const nextUserId = user?.id || "";
  const userChanged = nextUserId !== previousUserId;
  if (userChanged && typeof stopAdvancedResultRefresh === "function") stopAdvancedResultRefresh();
  state.user = user || null;
  renderHomePanel();
  if (userChanged) {
    state.generationCompletionNotified = {};
    state.generationCompletionRecords = [];
    state.generationCompletionStatuses = typeof readGenerationCompletionStatuses === "function"
      ? readGenerationCompletionStatuses(nextUserId)
      : {};
  }
  const nextMultiplier = Number(state.user?.pricingMultiplier || 1);
  if ((state.user?.id || "") !== previousUserId) {
    if (state.billing) state.billing = { ...state.billing, subscription: null };
    state.galleryUnlocks = [];
    state.galleryUnlocksLoaded = false;
    state.galleryUnlockMessage = "";
    state.chatConversations = [];
    state.chatActiveConversationId = "";
    state.chatMessages = [];
    state.referral = null;
    state.referralLoadedUserId = "";
    state.referralLoadedAt = 0;
    state.advancedAssets = [];
    state.advancedAssetsLoaded = false;
    state.advancedAssetPage = 1;
    state.advancedAssetTotal = 0;
    state.advancedAssetTotalPages = 1;
    state.workflow = null;
    window.clearTimeout(state.workflowCanvasSaveTimer);
    state.workflowCanvasSaveTimer = 0;
    state.workflowCanvases = [];
    state.workflowCanvasesLoaded = false;
    state.workflowCanvasesLoading = false;
    state.workflowActiveCanvasId = "";
    state.workflowCanvasMessage = "";
    state.workflowCanvasSaving = false;
    state.workflowCanvasSaveQueued = false;
    state.workflowCanvasSavePromise = null;
    window.clearTimeout(state.workflowViewportSaveTimer);
    state.workflowViewportSaveTimer = 0;
    state.workflowSelectedNodeId = "video-1";
    state.workflowPickerNodeId = "";
    state.workflowPickerSearch = "";
    state.workflowMessage = "";
    state.workflowLogs = [];
    if (typeof resetCaseLibrary === "function") resetCaseLibrary();
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
  if (userChanged && state.tab === "topups") loadTopupRecords(1);
  if (userChanged && state.tab === "spending") loadSpendingRecords(1);
  if (userChanged && state.tab === "assets") loadUserAssets();
  if (userChanged && state.tab === "advanced") loadAdvancedAssets();
  if (userChanged && state.tab === "access") loadApiSubtokens({ force: true });
  if (userChanged && state.tab === "chat") loadChatConversations({ selectFirst: true });
  if (userChanged && state.tab === "workflow") loadWorkflowCanvases({ force: true });
  if (userChanged && state.tab === "cases") renderCaseLibrary();
  if (state.tab === "referral") {
    if (userChanged && state.user && !skipReferralRefresh) loadReferralSummary({ force: true });
    else renderReferral();
  }
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
    state.advancedEstimateFailureKey = "";
    state.advancedEstimateFailureAt = 0;
    loadPlatformEstimates();
    updateAdvancedButtonCost();
    renderPricing();
  }
  syncTopupAutoRefresh();
  syncGenerationCompletionRefresh();
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
  const withEmbed = `${markdown}\n\n---\n\n${EMBED_LIVE_ACCESS_MARKDOWN.trim()}\n`;
  return revealToken ? withEmbed.replaceAll("<user-token>", token) : withEmbed;
}

async function fetchLatestModelDocsMarkdown({ revealToken = false } = {}) {
  const token = state.token && state.user?.apiToken ? state.user.apiToken : "<user-token>";
  const docsUrl = apiUrl("/docs/api.md");
  try {
    const headers = state.token ? { authorization: `Bearer ${state.token}` } : {};
    const response = await fetch(docsUrl, { cache: "no-store", headers });
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

const EMBED_LIVE_ACCESS_MARKDOWN = `## Embedded Live Chat

Put a live character inside another website. Keep the merchant API token on the merchant server. The browser only receives a one-time ticket. The same merchant token serves every downstream user. \`externalUserId\` separates those users. Calls are billed to the merchant wallet, and the credit record includes \`externalUserId\`.

Do not sign the merchant into the iframe. A normal site login is single-session and would disconnect the merchant's other sessions.

### Create a ticket

\`\`\`http
POST ${apiUrl("/api/embed/live/tickets")}
Authorization: Bearer <merchant-api-token>
Content-Type: application/json

{
  "externalUserId": "user-10001",
  "user": { "name": "小王", "avatarUrl": "https://example.com/user.png" },
  "origin": "https://merchant.example",
  "character": {
    "name": "林夏",
    "intro": "晚间电台主播，说话轻、会接话。",
    "persona": "你是林夏，语气温柔，回答短一些。",
    "script": "可选。传了就原样交给实时供应商，不再套用站内引导。",
    "greeting": "可选开场。",
    "imageUrl": "https://example.com/character.png",
    "voiceType": "Cindy",
    "voiceProvider": "qwen_omni",
    "looks": [
      { "kind": "garment", "name": "红裙", "imageUrl": "https://example.com/dress.png" },
      { "kind": "object", "name": "花束", "imageUrl": "https://example.com/flower.png" },
      { "kind": "background", "name": "夜景", "imageUrl": "https://example.com/night.png" }
    ]
  }
}
\`\`\`

The response contains \`ticket\`, \`expiresAt\`, and \`embedUrl\`. A ticket lasts 10 minutes and can be redeemed once.

Open \`embedUrl\` on https://live.123vipeak.com:

\`\`\`html
<iframe src="EMBED_URL" allow="microphone; camera; autoplay" allowfullscreen style="width:100%;height:100%;border:0"></iframe>
\`\`\`

If \`origin\` is set, the parent page origin must match it. Leave \`origin\` empty to allow any parent.

### Fields

- \`externalUserId\` (required): stable downstream user id, unique for this merchant. Letters, numbers, and \`_. : @ -\` only, up to 120 characters.
- \`user.name\`, \`user.avatarUrl\`: display name and avatar for that user.
- \`character.name\` (required).
- \`character.intro\` or \`character.persona\`: conversation guidance. One of \`intro\`, \`persona\`, or \`script\` is required. If \`script\` is omitted, the server adds its own live-chat guidance around \`persona\`.
- \`character.script\`: optional exact instruction sent to the live provider. When this is present, it replaces \`persona\` and the server does not append its own guidance.
- \`character.greeting\`: optional opening instruction.
- \`character.imageUrl\` (required): public https image. It is sent to the live provider as the character image.
- \`character.voiceType\`: optional. Pass a \`voiceType\` from the voice list. Defaults to \`Cindy\`.
- \`character.voiceProvider\`: optional. Use it with \`voiceType\` when the same id exists for more than one provider. Current values are \`qwen_omni\` and the Doubao provider for the active region.
- \`character.looks\`: optional, at most 12 items. \`kind\` is \`garment\` (换衣服), \`object\` (手里拿东西), or \`background\` (换背景). Each item needs a public https \`imageUrl\`. These appear in the iframe picker. If omitted, the embed call does not use the platform look catalog.
- \`origin\`: optional parent origin, such as \`https://merchant.example\`.

### Gifts

The iframe has the platform gift button. Gift names, pictures, and prices are the live site catalog. A gift is charged to the merchant wallet and the credit record includes \`externalUserId\`. Do not pass gift prices in the ticket. Insufficient balance returns 402.

### Voice list

The voice catalog is long and depends on the current live region. Query it with the merchant token. Do not expect the full list inside this copied package.

\`\`\`http
GET ${apiUrl("/api/embed/live/voices")}?provider=qwen_omni&q=Tina&limit=50&offset=0
Authorization: Bearer <merchant-api-token>
\`\`\`

The response includes \`viduRegion\`, \`providers\`, \`total\`, and \`voices[]\` with \`name\`, \`voiceType\`, \`provider\`, \`desc\`, and \`languages\`. Use \`voiceType\` as \`character.voiceType\`. \`limit\` defaults to 50 and cannot exceed 200.

### Billing and errors

Price, free preview, and prepaid blocks follow the live site. The merchant balance is checked before the call and again about every 10 seconds. If the next block cannot be reserved, the call is hung up. One \`externalUserId\` can have only one active call. Other downstream users of the same merchant are not blocked.

- 401: merchant token or ticket is missing, invalid, or expired.
- 403: parent origin does not match \`origin\`.
- 409: this ticket was already used, or this downstream user already has an active call.
- 422: user id, character name, intro/persona/script, https image, or voice is invalid.
- 402: the merchant balance cannot cover the next prepaid block.
`;

