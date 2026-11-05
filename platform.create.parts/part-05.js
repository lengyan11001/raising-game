function syncAdvancedPromptMentionLabels(previousRefs = [], nextRefs = advancedPromptMentionSnapshot()) {
  const textarea = els.advancedPrompt;
  if (!textarea || !previousRefs.length) return;
  let value = String(textarea.value || "");
  if (!value.includes("@")) return;
  const nextLabelByKey = new Map();
  nextRefs.forEach((entry) => {
    if (entry.key && entry.label) nextLabelByKey.set(entry.key, entry.label);
  });
  let changed = false;
  const boundary = "(?=$|[^A-Za-z0-9_-])";
  const replacements = [];
  previousRefs
    .filter((entry) => entry.label && entry.key)
    .forEach((entry) => {
      const nextLabel = nextLabelByKey.get(entry.key) || "";
      const from = `@${entry.label}`;
      const to = nextLabel ? `@${nextLabel}` : "";
      if (from === to) return;
      replacements.push({ from, to });
    });
  replacements
    .sort((left, right) => right.from.length - left.from.length)
    .forEach((entry, index) => {
      const token = `\u0000MENTION${index}\u0000`;
      const pattern = new RegExp(`${escapeAdvancedPromptMentionRegExp(entry.from)}${boundary}`, "gi");
      value = value.replace(pattern, () => {
        changed = true;
        return token;
      });
      entry.token = token;
    });
  replacements.forEach((entry) => {
    value = value.split(entry.token).join(entry.to);
  });
  if (!changed) return;
  const cursor = Number(textarea.selectionStart || 0);
  textarea.value = value
    .replace(/[ \t]{2,}/g, " ")
    .replace(/[ \t]+([.,;:!?\uFF0C\u3002\uFF1B\uFF1A\uFF01\uFF1F\u3001])/g, "$1");
  const nextCursor = Math.min(cursor, textarea.value.length);
  textarea.setSelectionRange?.(nextCursor, nextCursor);
  textarea.dispatchEvent(new Event("input", { bubbles: true }));
}

function advancedPromptMentionContext(textarea = els.advancedPrompt) {
  if (!textarea || textarea.selectionStart !== textarea.selectionEnd) return null;
  if (textarea.hidden || textarea.closest("[hidden]")) return null;
  const cursor = Number(textarea.selectionStart || 0);
  const before = String(textarea.value || "").slice(0, cursor);
  const atIndex = before.lastIndexOf("@");
  if (atIndex < 0) return null;
  const fragment = before.slice(atIndex + 1);
  if (/[\s.,;:!?()[\]{}<>\uFF0C\u3002\uFF1B\uFF1A\uFF01\uFF1F\u3001]/.test(fragment)) return null;
  return {
    start: atIndex,
    end: cursor,
    query: fragment.trim().toLowerCase(),
  };
}

function advancedPromptMentionItems() {
  const items = advancedReferenceDisplayItems(currentAdvancedProvider())
    .filter(({ item }) => item && !item.isPending && !item.pendingId)
    .map((entry) => {
      const rawName = entry.item.name || entry.item.fileName || entry.item.assetId || entry.item.url || entry.label;
      return {
        ...entry,
        mention: `@${entry.label}`,
        title: String(rawName || entry.label),
        url: entry.item.dataUrl || entry.item.previewUrl || entry.item.url || "",
        pinKey: advancedPromptMentionStableKey(entry),
      };
    });
  const pin = String(state.advancedPinnedMentionKey || "");
  if (!pin) return items;
  return [...items].sort((left, right) => Number(right.pinKey === pin) - Number(left.pinKey === pin));
}

function textareaCaretClientRect(textarea, position = 0) {
  if (!textarea) return null;
  const style = window.getComputedStyle(textarea);
  const mirror = document.createElement("div");
  const span = document.createElement("span");
  const text = String(textarea.value || "").slice(0, position);
  const properties = [
    "boxSizing", "width", "fontFamily", "fontSize", "fontWeight", "fontStyle", "letterSpacing",
    "textTransform", "wordSpacing", "textIndent", "lineHeight", "paddingTop", "paddingRight",
    "paddingBottom", "paddingLeft", "borderTopWidth", "borderRightWidth", "borderBottomWidth",
    "borderLeftWidth", "whiteSpace", "overflowWrap", "wordBreak",
  ];
  properties.forEach((name) => { mirror.style[name] = style[name]; });
  mirror.style.position = "fixed";
  mirror.style.left = "-9999px";
  mirror.style.top = "0";
  mirror.style.height = "auto";
  mirror.style.minHeight = "0";
  mirror.style.overflow = "hidden";
  mirror.style.whiteSpace = "pre-wrap";
  mirror.style.overflowWrap = "break-word";
  mirror.style.visibility = "hidden";
  mirror.textContent = text;
  span.textContent = "\u200b";
  mirror.appendChild(span);
  document.body.appendChild(mirror);
  const textRect = textarea.getBoundingClientRect();
  const mirrorRect = mirror.getBoundingClientRect();
  const spanRect = span.getBoundingClientRect();
  const rect = {
    left: textRect.left + (spanRect.left - mirrorRect.left) - textarea.scrollLeft,
    top: textRect.top + (spanRect.top - mirrorRect.top) - textarea.scrollTop,
    bottom: textRect.top + (spanRect.bottom - mirrorRect.top) - textarea.scrollTop,
  };
  mirror.remove();
  return rect;
}

function positionAdvancedPromptMentionMenu() {
  const textarea = els.advancedPrompt;
  const menu = els.advancedPromptMentions;
  if (!textarea || !menu || menu.hidden) return;
  const field = textarea.closest(".advanced-prompt-field") || textarea.parentElement;
  if (!field) return;
  const context = state.advancedPromptMentionContext || advancedPromptMentionContext(textarea);
  const caret = textareaCaretClientRect(textarea, context?.end ?? textarea.selectionStart ?? 0);
  const fieldRect = field.getBoundingClientRect();
  const textareaRect = textarea.getBoundingClientRect();
  const width = Math.max(220, Math.min(340, fieldRect.width - 16));
  const fallbackLeft = textareaRect.left - fieldRect.left + 10;
  const fallbackTop = textareaRect.bottom - fieldRect.top + 6;
  const rawLeft = caret ? caret.left - fieldRect.left : fallbackLeft;
  const rawTop = caret ? caret.bottom - fieldRect.top + 8 : fallbackTop;
  const left = Math.max(8, Math.min(rawLeft, Math.max(8, fieldRect.width - width - 8)));
  const top = Math.max(34, rawTop);
  menu.style.setProperty("--mention-left", `${Math.round(left)}px`);
  menu.style.setProperty("--mention-top", `${Math.round(top)}px`);
  menu.style.setProperty("--mention-width", `${Math.round(width)}px`);
}

function closeAdvancedPromptMentions() {
  state.advancedPromptMentionContext = null;
  state.advancedPromptMentionItems = [];
  state.advancedPromptMentionIndex = 0;
  if (els.advancedPromptMentions) {
    els.advancedPromptMentions.hidden = true;
    els.advancedPromptMentions.innerHTML = "";
  }
}

function renderAdvancedPromptMentionMenu() {
  const textarea = els.advancedPrompt;
  const menu = els.advancedPromptMentions;
  const context = advancedPromptMentionContext(textarea);
  if (!textarea || !menu || !context) {
    closeAdvancedPromptMentions();
    return;
  }
  const query = context.query || "";
  const items = advancedPromptMentionItems()
    .filter((item) => {
      const text = `${item.mention} ${item.title} ${item.kind}`.toLowerCase();
      return !query || text.includes(query);
    })
;
  if (!items.length) {
    closeAdvancedPromptMentions();
    return;
  }
  const selected = Math.max(0, Math.min(Number(state.advancedPromptMentionIndex || 0), items.length - 1));
  state.advancedPromptMentionContext = context;
  state.advancedPromptMentionItems = items;
  state.advancedPromptMentionIndex = selected;
  menu.hidden = false;
  menu.innerHTML = items.map((entry, index) => {
    const url = entry.url || "";
    const thumb = entry.kind === "video" && url
      ? `<video src="${escapeHtml(url)}" muted playsinline preload="metadata"></video>`
      : entry.kind === "image" && url
        ? `<img src="${escapeHtml(url)}" alt="" />`
        : `<i data-lucide="${entry.kind === "audio" ? "audio-lines" : entry.kind === "video" ? "film" : "image"}"></i>`;
    const title = entry.title && entry.title !== entry.label ? entry.title : (entry.kind === "audio" ? "Audio reference" : entry.kind === "video" ? "Video reference" : "Image reference");
    return `
      <button class="advanced-prompt-mention ${index === selected ? "is-active" : ""} ${entry.pinKey && entry.pinKey === state.advancedPinnedMentionKey ? "is-pinned" : ""}" type="button" role="option" aria-selected="${index === selected ? "true" : "false"}" data-advanced-prompt-mention="${index}">
        <span class="advanced-prompt-mention-thumb is-${escapeHtml(entry.kind)}">${thumb}</span>
        <span class="advanced-prompt-mention-copy">
          <strong>${escapeHtml(entry.mention)}</strong>
          <small>${escapeHtml(title)}</small>
        </span>
      </button>
    `;
  }).join("");
  positionAdvancedPromptMentionMenu();
  refreshIcons();
}

function insertAdvancedPromptMention(index = state.advancedPromptMentionIndex || 0) {
  const textarea = els.advancedPrompt;
  const context = state.advancedPromptMentionContext || advancedPromptMentionContext(textarea);
  const item = (state.advancedPromptMentionItems || [])[index];
  if (!textarea || !context || !item) return false;
  const value = String(textarea.value || "");
  const before = value.slice(0, context.start);
  const after = value.slice(context.end);
  const needsSpace = after && /^\s/.test(after) ? "" : " ";
  const inserted = `${item.mention}${needsSpace}`;
  textarea.value = `${before}${inserted}${after}`;
  const cursor = before.length + inserted.length;
  textarea.focus?.();
  textarea.setSelectionRange?.(cursor, cursor);
  textarea.dispatchEvent(new Event("input", { bubbles: true }));
  closeAdvancedPromptMentions();
  return true;
}

function handleAdvancedPromptMentionInput() {
  state.advancedPromptMentionIndex = 0;
  renderAdvancedPromptMentionMenu();
}

function handleAdvancedPromptMentionKeydown(event) {
  if (!els.advancedPromptMentions || els.advancedPromptMentions.hidden) return;
  const items = state.advancedPromptMentionItems || [];
  if (!items.length) return;
  if (event.key === "ArrowDown" || event.key === "ArrowUp") {
    event.preventDefault();
    const delta = event.key === "ArrowDown" ? 1 : -1;
    state.advancedPromptMentionIndex = (Number(state.advancedPromptMentionIndex || 0) + delta + items.length) % items.length;
    renderAdvancedPromptMentionMenu();
    return;
  }
  if (event.key === "Enter" || event.key === "Tab") {
    event.preventDefault();
    insertAdvancedPromptMention();
    return;
  }
  if (event.key === "Escape") {
    event.preventDefault();
    closeAdvancedPromptMentions();
  }
}

function handleAdvancedPromptMentionPointer(event) {
  const button = event.target.closest("[data-advanced-prompt-mention]");
  if (!button) return;
  event.preventDefault();
  event.stopPropagation();
  insertAdvancedPromptMention(Number(button.dataset.advancedPromptMention || 0));
}

function renderAdvancedReferencePreviews() {
  if (!els.advancedUploadPreview) return;
  const provider = currentAdvancedProvider();
  const images = selectedAdvancedReferenceImages();
  const frameMode = isVegaAdvancedProvider(provider) && advancedVegaModeNeedsFrames();
  const refs = frameMode ? [] : advancedReferenceDisplayItems(provider);
  els.advancedUploadPreview.innerHTML = refs.map(({ kind, index, label, item }) => {
    const pending = Boolean(item.isPending || item.pendingId);
    const url = item.dataUrl || item.previewUrl || item.url || "";
    const removeAttr = kind === "image"
      ? `data-remove-advanced-ref="${index}"`
      : kind === "document"
        ? `data-remove-advanced-document="${index}"`
      : `data-remove-shared-${kind}="${index}"`;
    const pendingText = t("advanced.uploadingReference", {}, "Uploading...");
    const media = pending && url && (kind === "image" || kind === "video")
      ? `<div class="advanced-reference-pending has-preview">${kind === "video" ? `<video src="${escapeHtml(url)}" muted playsinline preload="metadata"></video>` : `<img src="${escapeHtml(url)}" alt="" />`}<div class="advanced-reference-upload-status"><i data-lucide="loader-2"></i><span>${escapeHtml(pendingText)}</span></div></div>`
      : pending
        ? `<div class="advanced-reference-pending"><i data-lucide="loader-2"></i><span>${escapeHtml(pendingText)}</span></div>`
      : kind === "video"
      ? `<video src="${escapeHtml(url)}" muted playsinline preload="metadata"></video>`
      : kind === "audio"
        ? `<div class="advanced-audio-ref"><i data-lucide="audio-lines"></i></div>`
        : kind === "document"
          ? `<div class="advanced-audio-ref"><i data-lucide="file-text"></i><span>${escapeHtml(item.fileName || item.name || "Document")}</span></div>`
        : (url ? `<img src="${escapeHtml(url)}" alt="" loading="lazy" decoding="async" />` : `<div class="history-placeholder"><i data-lucide="image"></i></div>`);
    return `
      <figure class="advanced-reference-chip is-${escapeHtml(kind)} ${pending ? "is-pending" : ""}" title="${escapeHtml(item.name || item.fileName || label)}">
        ${pending ? "" : `<button class="advanced-preview-remove" type="button" ${removeAttr} aria-label="${escapeHtml(t("common.remove", {}, "Remove"))}">&times;</button>`}
        <span class="advanced-reference-label">${escapeHtml(label)}</span>
        ${media}
      </figure>
    `;
  }).join("");
  els.advancedUploadPreview.querySelectorAll("[data-remove-advanced-ref]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      removeAdvancedReferenceImage(Number(button.dataset.removeAdvancedRef));
    });
  });
  els.advancedUploadPreview.querySelectorAll("[data-remove-shared-video]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      removeAdvancedSeedanceMediaReference("video", Number(button.dataset.removeSharedVideo));
    });
  });
  els.advancedUploadPreview.querySelectorAll("[data-remove-shared-audio]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      removeAdvancedSeedanceMediaReference("audio", Number(button.dataset.removeSharedAudio));
    });
  });
  els.advancedUploadPreview.querySelectorAll("[data-remove-advanced-document]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.preventDefault();
      state.advancedDocumentReference = null;
      renderAdvancedReferencePreviews();
      updateAdvancedModelControls();
      updateAdvancedButtonCost();
    });
  });
  els.advancedUploadBox?.classList.toggle("has-image", refs.length > 0);
  if (els.advancedPromptMentions && !els.advancedPromptMentions.hidden) renderAdvancedPromptMentionMenu();
  if (els.advancedWanFirstFramePreview) {
    const firstFrame = images[0]?.dataUrl || state.advancedUploadDataUrl || "";
    if ((provider === "wan27" || provider === "happyhorse" || isAdvancedImageProvider(provider)) && firstFrame) {
      els.advancedWanFirstFramePreview.src = firstFrame;
      els.advancedWanFirstFramePreview.classList.add("is-visible");
      els.advancedWanFirstFrame?.closest(".wan-frame-upload")?.classList.add("has-image");
    } else {
      els.advancedWanFirstFramePreview.removeAttribute("src");
      els.advancedWanFirstFramePreview.classList.remove("is-visible");
      els.advancedWanFirstFrame?.closest(".wan-frame-upload")?.classList.remove("has-image");
    }
  }
  if (els.advancedSeedanceFirstFramePreview) {
    const firstFrame = state.advancedSeedanceFirstFrameDataUrl || "";
    if ((isVegaAdvancedProvider(provider) ? advancedVegaModeNeedsFrames() : ["seedance", "seedance25", "seedance-nsfw", "wan30"].includes(provider) && seedanceModeNeedsFirstFrame(els.advancedSeedanceMediaMode?.value || "")) && firstFrame) {
      els.advancedSeedanceFirstFramePreview.src = firstFrame;
      els.advancedSeedanceFirstFramePreview.classList.add("is-visible");
      els.advancedSeedanceFirstFrame?.closest(".wan-frame-upload")?.classList.add("has-image");
    } else {
      els.advancedSeedanceFirstFramePreview.removeAttribute("src");
      els.advancedSeedanceFirstFramePreview.classList.remove("is-visible");
      els.advancedSeedanceFirstFrame?.closest(".wan-frame-upload")?.classList.remove("has-image");
    }
  }
  if (els.advancedSeedanceLastFramePreview) {
    if ((isVegaAdvancedProvider(provider) ? advancedVegaModeNeedsFrames() : ["seedance", "seedance25", "seedance-nsfw", "wan30"].includes(provider)) && state.advancedSeedanceLastFrameDataUrl) {
      els.advancedSeedanceLastFramePreview.src = state.advancedSeedanceLastFrameDataUrl;
      els.advancedSeedanceLastFramePreview.classList.add("is-visible");
      els.advancedSeedanceLastFrame?.closest(".wan-frame-upload")?.classList.add("has-image");
    } else {
      els.advancedSeedanceLastFramePreview.removeAttribute("src");
      els.advancedSeedanceLastFramePreview.classList.remove("is-visible");
      els.advancedSeedanceLastFrame?.closest(".wan-frame-upload")?.classList.remove("has-image");
    }
  }
}

function updateAdvancedReferenceSummary() {
  if (!els.advancedReferenceSummary) return;
  els.advancedReferenceSummary.textContent = "";
}

function renderAssets(assets = state.userAssets || []) {
  if (!els.assetGrid) return;
  if (!state.user) {
    if (els.assetPager) els.assetPager.innerHTML = "";
    els.assetGrid.innerHTML = `
      <div class="history-empty-card">
        <strong>${escapeHtml(t("assets.loginRequired"))}</strong>
        <p>${escapeHtml(t("assets.loginDesc"))}</p>
        <button class="generate-btn" type="button" data-login-assets>${escapeHtml(t("history.login"))}</button>
      </div>
    `;
    els.assetGrid.querySelector("[data-login-assets]")?.addEventListener("click", openLogin);
    return;
  }
  if (!assets.length) {
    els.assetGrid.innerHTML = `<div class="history-empty-card"><strong>${escapeHtml(t("assets.emptyTitle"))}</strong><p>${escapeHtml(t("assets.emptyDesc"))}</p></div>`;
    renderSimplePager(els.assetPager, {
      page: state.userAssetsPage,
      totalPages: state.userAssetsTotalPages,
      total: state.userAssetsTotal,
    }, loadUserAssets);
    return;
  }
  els.assetGrid.innerHTML = assets.map((asset) => {
    const url = assetPreviewUrl(asset);
    const video = isVideoAsset(asset);
    const audio = isAudioAsset(asset);
    const document = isDocumentAsset(asset);
    const typeLabel = video ? t("assets.video") : audio ? t("assets.audio") : document ? "Document" : t("assets.image");
    return `
      <article class="asset-card">
        <div class="asset-preview ${audio ? "is-audio" : ""}" ${!audio ? `data-asset-preview="${escapeHtml(asset.id)}"` : ""}>
          ${video
            ? `<video src="${escapeHtml(url)}" muted playsinline preload="metadata" controls></video>`
            : audio
              ? `<div class="audio-asset-preview"><i data-lucide="audio-lines"></i><audio src="${escapeHtml(url)}" controls preload="metadata"></audio></div>`
              : document
                ? `<div class="audio-asset-preview"><i data-lucide="file-text"></i></div>`
              : `<img src="${escapeHtml(url)}" alt="${escapeHtml(asset.name || "")}" loading="lazy" />`}
        </div>
        <div class="asset-info">
          <strong>${escapeHtml(asset.name || asset.id)}</strong>
          <span>${escapeHtml(typeLabel)}</span>
        </div>
        <div class="asset-actions">
          ${!video && !audio && !document ? `<button class="ghost-button" type="button" data-asset-use="${escapeHtml(asset.id)}">${escapeHtml(t("assets.use"))}</button>` : ""}
          ${!video && !audio && !document ? `<button class="copy-btn" type="button" data-asset-modify="${escapeHtml(asset.id)}">${escapeHtml(t("assets.modify"))}</button>` : ""}
          ${!video && !audio && !document ? `<button class="ghost-button" type="button" data-asset-extend="${escapeHtml(asset.id)}">${escapeHtml(t("assets.extend"))}</button>` : ""}
          ${video ? `<button class="copy-btn" type="button" data-asset-replace="${escapeHtml(asset.id)}">${escapeHtml(t("assets.replace"))}</button>` : ""}
          ${video ? `<button class="ghost-button" type="button" data-asset-frame="${escapeHtml(asset.id)}">${escapeHtml(t("assets.extractFrame"))}</button>` : ""}
          <button class="ghost-button danger" type="button" data-asset-delete="${escapeHtml(asset.id)}">${escapeHtml(t("assets.delete"))}</button>
        </div>
      </article>
    `;
  }).join("");
  els.assetGrid.querySelectorAll("[data-asset-use]").forEach((button) => {
    button.addEventListener("click", () => useAssetInAdvanced(state.userAssets.find((asset) => asset.id === button.dataset.assetUse), "use"));
  });
  els.assetGrid.querySelectorAll("[data-asset-modify]").forEach((button) => {
    button.addEventListener("click", () => openAssetModifyDialog(state.userAssets.find((asset) => asset.id === button.dataset.assetModify)));
  });
  els.assetGrid.querySelectorAll("[data-asset-extend]").forEach((button) => {
    button.addEventListener("click", () => openAssetExtendDialog(state.userAssets.find((asset) => asset.id === button.dataset.assetExtend)));
  });
  els.assetGrid.querySelectorAll("[data-asset-replace]").forEach((button) => {
    button.addEventListener("click", () => openAssetReplaceDialog(state.userAssets.find((asset) => asset.id === button.dataset.assetReplace)));
  });
  els.assetGrid.querySelectorAll("[data-asset-frame]").forEach((button) => {
    button.addEventListener("click", () => openAssetFrameDialog(state.userAssets.find((asset) => asset.id === button.dataset.assetFrame)));
  });
  els.assetGrid.querySelectorAll("[data-asset-delete]").forEach((button) => {
    button.addEventListener("click", () => deleteUserAsset(button.dataset.assetDelete || "", { source: "assets", button }));
  });
  els.assetGrid.querySelectorAll("[data-asset-preview]").forEach((node) => {
    node.addEventListener("click", (event) => {
      if (event.target.closest("button, audio, video")) return;
      const asset = state.userAssets.find((item) => item.id === node.dataset.assetPreview);
      if (!asset) return;
      const previewUrl = assetPreviewUrl(asset);
      if (isVideoAsset(asset)) {
        playPreview({ title: asset.name || asset.id, previewUrl, ratio: "16:9" });
      } else if (!isAudioAsset(asset)) {
        previewImage({ title: asset.name || asset.id, imageUrl: previewUrl });
      }
    });
  });
  renderSimplePager(els.assetPager, {
    page: state.userAssetsPage,
    totalPages: state.userAssetsTotalPages,
    total: state.userAssetsTotal,
  }, loadUserAssets);
  refreshIcons();
}

async function loadUserAssets(page = state.userAssetsPage || 1) {
  if (!els.assetGrid) return;
  if (!state.user) {
    renderAssets([]);
    return;
  }
  const params = new URLSearchParams();
  if (els.assetSearch?.value) params.set("q", els.assetSearch.value);
  if (els.assetTypeFilter?.value) params.set("type", els.assetTypeFilter.value);
  params.set("page", String(page));
  params.set("limit", String(state.userAssetsLimit || 8));
  if (els.assetNote) els.assetNote.textContent = t("assets.loading");
  try {
    const payload = await requestJson(`/api/user-assets?${params.toString()}`);
    state.userAssets = payload.assets || [];
    state.userAssetsPage = payload.page || page;
    state.userAssetsLimit = payload.limit || state.userAssetsLimit || 8;
    state.userAssetsTotal = payload.total || 0;
    state.userAssetsTotalPages = payload.totalPages || 1;
    if (els.assetNote) els.assetNote.textContent = "";
    renderAssets();
    if (state.tab === "characters" && state.characterSource === "custom") renderGalleryCharacters(els.characterGrid);
  } catch (error) {
    if (els.assetNote) els.assetNote.textContent = t("assets.loadFailed", { message: error.message || String(error) });
  }
}

async function uploadUserAssets(files = []) {
  if (!state.user) return openLogin();
  const selected = Array.from(files || []);
  if (!selected.length) return;
  if (els.assetNote) els.assetNote.textContent = t("assets.uploading");
  let uploaded = 0;
  try {
    for (const file of selected) {
      const dataUrl = await readFileAsDataUrl(file);
      const durationSeconds = file.type.startsWith("video/") || file.type.startsWith("audio/")
        ? await readVideoDuration(file).catch(() => 0)
        : 0;
      await requestJson("/api/user-assets", {
        method: "POST",
        body: { dataUrl, name: file.name || "Upload", fileName: file.name || "", durationSeconds },
      });
      uploaded += 1;
    }
    if (els.assetNote) els.assetNote.textContent = t("assets.uploaded", { count: uploaded });
    await loadUserAssets(1);
  } catch (error) {
    if (els.assetNote) els.assetNote.textContent = t("assets.uploadFailed", { message: error.message || String(error) });
  } finally {
    if (els.assetUploadInput) els.assetUploadInput.value = "";
    updateFilePickerLabel(els.assetUploadInput);
  }
}

function clearDeletedAdvancedAssetReference(assetId = "") {
  if (!assetId) return;
  const previousPromptRefs = advancedPromptMentionSnapshot();
  let changed = false;
  const images = Array.isArray(state.advancedReferenceImages) ? state.advancedReferenceImages : [];
  const nextImages = images.filter((item) => item?.assetId !== assetId);
  if (nextImages.length !== images.length) {
    state.advancedReferenceImages = nextImages;
    state.advancedUploadDataUrl = nextImages[0]?.dataUrl || "";
    if (state.advancedFirstFrameAssetId === assetId) state.advancedFirstFrameAssetId = nextImages[0]?.assetId || "";
    if (state.advancedSourceImageAssetId === assetId) state.advancedSourceImageAssetId = nextImages[0]?.assetId || "";
    if (!nextImages.length && els.advancedImage) els.advancedImage.value = "";
    changed = true;
  }
  if (state.advancedFirstFrameAssetId === assetId) {
    state.advancedFirstFrameAssetId = "";
    state.advancedUploadDataUrl = nextImages[0]?.dataUrl || "";
    changed = true;
  }
  if (state.advancedSeedanceFirstFrameAssetId === assetId) {
    removeAdvancedMediaSlot("seedanceFirstFrame");
    changed = true;
  }
  if (state.advancedSourceImageAssetId === assetId) {
    state.advancedSourceImageAssetId = "";
    state.advancedUploadDataUrl = nextImages[0]?.dataUrl || "";
    changed = true;
  }
  if (state.advancedSeedanceLastFrameAssetId === assetId) {
    removeAdvancedMediaSlot("seedanceLastFrame");
    changed = true;
  }
  if (state.advancedWanLastFrameAssetId === assetId) {
    removeAdvancedMediaSlot("wanLastFrame");
    changed = true;
  }
  if (state.advancedWanClipAssetId === assetId) {
    removeAdvancedMediaSlot("wanClip");
    changed = true;
  }
  if (state.advancedSeedanceVideoAssetId === assetId) {
    state.advancedSeedanceVideoAssetId = "";
    state.advancedSeedanceVideoPreviewUrl = "";
    changed = true;
  }
  const seedanceVideos = advancedSeedanceVideoReferences();
  const nextSeedanceVideos = seedanceVideos.filter((item) => item.assetId !== assetId);
  if (nextSeedanceVideos.length !== seedanceVideos.length) {
    setAdvancedSeedanceVideoReferences(nextSeedanceVideos);
    changed = true;
  }
  if (state.advancedAudioAssetId === assetId) {
    removeAdvancedMediaSlot("wanAudio");
    changed = true;
  }
  const seedanceAudios = advancedSeedanceAudioReferences();
  const nextSeedanceAudios = seedanceAudios.filter((item) => item.assetId !== assetId);
  if (nextSeedanceAudios.length !== seedanceAudios.length) {
    setAdvancedSeedanceAudioReferences(nextSeedanceAudios);
    changed = true;
  }
  if (state.advancedDocumentReference?.assetId === assetId) {
    state.advancedDocumentReference = null;
    changed = true;
  }
  if (!changed) return;
  syncAdvancedPromptMentionLabels(previousPromptRefs);
  renderAdvancedReferencePreviews();
  updateAdvancedReferenceSummary();
  updateAdvancedModelControls();
  updateAdvancedButtonCost();
}

async function deleteUserAsset(assetId = "", options = {}) {
  if (!assetId) return;
  const source = options?.source || "assets";
  const button = options?.button || null;
  if (button) button.disabled = true;
  try {
    await requestJson(`/api/user-assets/${encodeURIComponent(assetId)}`, { method: "DELETE" });
    clearDeletedAdvancedAssetReference(assetId);
    if (Array.isArray(state.userAssets)) state.userAssets = state.userAssets.filter((asset) => asset.id !== assetId);
    if (Array.isArray(state.advancedAssets)) state.advancedAssets = state.advancedAssets.filter((asset) => asset.id !== assetId);
    if (state.tab === "assets") await loadUserAssets(state.userAssetsPage || 1);
    if (source === "advanced" || state.tab === "advanced") {
      await loadAdvancedAssets(state.advancedAssetPage || 1);
    } else if (state.advancedAssetsLoaded) {
      renderAdvancedAssets();
    }
  } catch (error) {
    const note = source === "advanced" ? els.advancedAssetNote : els.assetNote;
    if (note) note.textContent = error.message || String(error);
    if (button) button.disabled = false;
  }
}

async function submitTemplate() {
  if (!state.activeTemplate) return;
  const template = state.activeTemplate;
  if (els.templateDialog?.open) els.templateDialog.close();
  setTab("advanced");
  state.advancedCreateKind = "video";
  state.advancedCreateMode = template.type === "text-to-video" ? "video-text" : "video-image";
  state.activeTemplate = null;
  state.activeAdvancedCaseId = "";
  if (els.advancedProvider) els.advancedProvider.value = "seedance";
  if (els.advancedPrompt) {
    els.advancedPrompt.value = els.templatePrompt?.value || template.prompt || template.description || "";
    autoSizeAdvancedPrompt({ force: true, resetManual: true });
  }
  if (els.advancedSeedanceMediaMode) els.advancedSeedanceMediaMode.value = "reference_video";
  if (state.uploadDataUrl) {
    state.advancedReferenceImages = [{ dataUrl: state.uploadDataUrl, fileName: "reference.png" }];
    state.advancedUploadDataUrl = state.uploadDataUrl;
  }
  updateAdvancedModelControls();
  setAdvancedSideTab("assets");
}

function isMobileHistoryLayout() {
  return window.matchMedia("(max-width: 720px)").matches;
}

function disconnectHistoryLoadMoreObserver() {
  if (historyLoadMoreObserver) historyLoadMoreObserver.disconnect();
  historyLoadMoreObserver = null;
}

function mergeHistoryRecordPages(primary = [], secondary = []) {
  const seen = new Set();
  return [...primary, ...secondary].filter((record, index) => {
    const key = String(record?.taskId || record?.id || `${record?.createdAt || ""}-${index}`);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function setupHistoryInfiniteScroll() {
  disconnectHistoryLoadMoreObserver();
  if (!isMobileHistoryLayout() || state.tab !== "history" || !state.user) return;
  if (Number(state.historyRecordsPage || 1) >= Number(state.historyRecordsTotalPages || 1)) return;
  const sentinel = els.historyList?.querySelector("[data-history-load-more]");
  if (!sentinel || !("IntersectionObserver" in window)) return;
  historyLoadMoreObserver = new IntersectionObserver((entries) => {
    if (!entries.some((entry) => entry.isIntersecting) || historyLoading || historyRefreshInFlight) return;
    disconnectHistoryLoadMoreObserver();
    sentinel.classList.add("is-loading");
    loadHistory({
      silent: true,
      append: true,
      page: Number(state.historyRecordsPage || 1) + 1,
    }).finally(() => {
      if (state.tab === "history" && document.contains(sentinel)) setupHistoryInfiniteScroll();
    });
  }, { rootMargin: "360px 0px", threshold: 0.01 });
  historyLoadMoreObserver.observe(sentinel);
}

function renderHistory(records = []) {
  if (!els.historyList) return;
  disconnectHistoryLoadMoreObserver();
  const mobileLayout = isMobileHistoryLayout();
  if (els.historyPager) {
    els.historyPager.hidden = mobileLayout;
    if (mobileLayout) els.historyPager.innerHTML = "";
  }
  const sortedRecords = [...records].sort((left, right) => new Date(right.createdAt || right.updatedAt || 0) - new Date(left.createdAt || left.updatedAt || 0));
  if (!state.user) {
    if (els.historyPager) els.historyPager.innerHTML = "";
    els.historyList.innerHTML = `
      <div class="history-empty-card">
        <strong>${escapeHtml(t("history.loginRequired"))}</strong>
        <p>${escapeHtml(t("history.loginDesc"))}</p>
        <button class="generate-btn" type="button" data-login-history>${escapeHtml(t("history.login"))}</button>
      </div>
    `;
    els.historyList.querySelector("[data-login-history]")?.addEventListener("click", openLogin);
    refreshIcons();
    return;
  }
  if (!sortedRecords.length) {
    els.historyList.innerHTML = `<div class="history-empty-card"><strong>${escapeHtml(t("history.emptyTitle"))}</strong><p>${escapeHtml(t("history.emptyDesc"))}</p></div>`;
    if (!mobileLayout) {
      renderSimplePager(els.historyPager, {
        page: state.historyRecordsPage,
        totalPages: state.historyRecordsTotalPages,
        total: state.historyRecordsTotal,
      }, (page) => loadHistory({ page }), { jump: true });
    }
    refreshIcons();
    return;
  }
  state.historyRecords = sortedRecords;
  const loadMoreHtml = mobileLayout && Number(state.historyRecordsPage || 1) < Number(state.historyRecordsTotalPages || 1)
    ? `<div class="history-load-sentinel" data-history-load-more><i data-lucide="loader-circle"></i></div>`
    : "";
  els.historyList.innerHTML = `${sortedRecords.map((record, index) => {
    const resultExpired = isGenerationResultExpired(record);
    const videoUrl = resultExpired ? "" : generationVideoUrl(record);
    const imageResultUrl = resultExpired ? "" : generationImageResultUrl(record);
    const hasExpiredResult = resultExpired;
    const textResult = String(record.textResult || record.responseText || "").trim();
    const resultLocked = record.resultLocked === true;
    const isSucceeded = isSucceededGenerationStatus(record.status) || Boolean(videoUrl || imageResultUrl || textResult);
    const taskId = record.taskId || "";
    const mediaKey = `history-video-${Math.random().toString(36).slice(2)}`;
    const recordRatio = record.ratio || record.params?.ratio || record.params?.aspect_ratio;
    const mediaStyle = ratioStyle(recordRatio);
    const posterUrl = isSucceeded ? generationPosterUrl(record) : "";
    // The newest result is the primary thing users are waiting for. Start it
    // immediately; keep older, potentially large media lazy to protect the
    // connection when the history page contains several results.
    const imageLoading = index === 0 ? "eager" : "lazy";
    const imageFetchPriority = index === 0 ? "high" : "auto";
    const canDownload = !resultExpired && canDownloadGenerationRecord(record);
    const canAdvancedDownload = !resultExpired && canAdvancedDownloadGenerationRecord(record);
    const advancedDownloadState = record?.r2DownloadReady ? "ready" : "idle";
    const isUndressHistory = isTenantTool("undress");
    const recordStatusClass = statusClass(record.status);
    const recordStatusLabel = statusLabel(record.status);
    const recordStatusIcon = resultLocked
      ? "lock-keyhole"
      : recordStatusClass === "failed"
        ? "circle-alert"
        : isSucceeded
          ? "check-circle-2"
          : "loader-circle";
    const regenerateAction = taskId && !resultLocked && !isTenantTool("undress") ? `
      <button class="history-download history-regenerate" type="button" data-history-regenerate="${escapeHtml(taskId)}">
        <i data-lucide="refresh-cw"></i>${escapeHtml(t("history.regenerate"))}
      </button>
    ` : "";
    const unlockAction = taskId && resultLocked && !isUndressHistory ? `
      <button class="history-download history-unlock" type="button" data-history-unlock="${escapeHtml(taskId)}">
        <i data-lucide="unlock"></i>${escapeHtml(t("history.unlockResult", { credits: formatCredits(record.unlockCredits || 0) }, `Unlock · ${formatCredits(record.unlockCredits || 0)} credits`))}
      </button>
    ` : "";
    const unlockOverlay = taskId && resultLocked && isUndressHistory ? `
      <button class="history-unlock-overlay" type="button" data-history-unlock="${escapeHtml(taskId)}">
        <i data-lucide="unlock"></i>
        <span>${escapeHtml(state.lang === "zh" ? "解锁" : "Unlock")}</span>
      </button>
    ` : "";
    const undressDownloadAction = isUndressHistory && !resultLocked && canDownload && (videoUrl || imageResultUrl) ? `
      <button class="history-undress-download" type="button" data-history-download="${escapeHtml(String(index))}" aria-label="${escapeHtml(t("history.download"))}" title="${escapeHtml(t("history.download"))}">
        <i data-lucide="download"></i>
      </button>
    ` : "";
    const undressDeleteAction = isUndressHistory && !resultLocked && taskId && (videoUrl || imageResultUrl || statusClass(record.status) === "failed") ? `
      <button class="history-undress-delete" type="button" data-history-delete="${escapeHtml(taskId)}" aria-label="${escapeHtml(t("history.delete"))}" title="${escapeHtml(t("history.delete"))}">
        <i data-lucide="trash-2"></i>
      </button>
    ` : "";
    const undressResultActions = undressDownloadAction || undressDeleteAction ? `
      <div class="history-undress-result-actions">${undressDownloadAction}${undressDeleteAction}</div>
    ` : "";
    const resultActions = !isUndressHistory && taskId && (videoUrl || imageResultUrl) ? `
      ${canDownload ? `
        <button class="history-download history-download-file" type="button" data-history-download="${escapeHtml(String(index))}">
          <i data-lucide="download"></i>${escapeHtml(t("history.download"))}
        </button>
      ` : ""}
      <button class="history-download history-r2-download${advancedDownloadState === "ready" ? " is-ready" : ""}" type="button" data-history-r2-download="${escapeHtml(String(index))}" data-download-state="${advancedDownloadState}" ${canAdvancedDownload ? "" : "disabled"}>
        <span class="advanced-result-download-hint" aria-hidden="true">如果下载素材慢请点击我保存</span>
        <i data-lucide="cloud-download"></i>${escapeHtml(advancedDownloadState === "ready" ? (state.lang === "zh" ? "download2 可下载" : "download2 available") : t("history.advancedDownload"))}
      </button>
      <button class="history-download history-add-asset" type="button" data-history-add-asset="${escapeHtml(taskId)}">
        <i data-lucide="folder-plus"></i>${escapeHtml(t("history.addAsset"))}
      </button>
    ` : "";
    const videoActions = taskId && videoUrl && !isTenantTool("undress") ? `
      <button class="history-download history-extend" type="button" data-history-extend="${escapeHtml(taskId)}">
        <i data-lucide="stretch-horizontal"></i>${escapeHtml(t("assets.extend"))}
      </button>
      <button class="history-download history-replace" type="button" data-history-replace="${escapeHtml(taskId)}">
        <i data-lucide="replace"></i>${escapeHtml(t("assets.replace"))}
      </button>
      <button class="history-download history-frame" type="button" data-history-frame="${escapeHtml(taskId)}">
        <i data-lucide="scan-line"></i>${escapeHtml(t("assets.extractFrame"))}
      </button>
    ` : "";
    const detailAction = isUndressHistory ? "" : `
      <button class="history-download history-params" type="button" data-history-detail="${index}">
        <i data-lucide="sliders-horizontal"></i>${escapeHtml(t("history.viewParameters"))}
      </button>
    `;
    const deleteAction = taskId && !isUndressHistory ? `
      <button class="history-download history-delete" type="button" data-history-delete="${escapeHtml(taskId)}">
        <i data-lucide="trash-2"></i>${escapeHtml(t("history.delete"))}
      </button>
    ` : "";
    const primaryActions = `${unlockAction}${regenerateAction}${resultActions}${videoActions}`;
    const allActions = `${primaryActions}${detailAction}${deleteAction}`;
    return `
      <article class="history-item is-${escapeHtml(statusClass(record.status))}${resultLocked ? " is-result-locked" : ""}${hasExpiredResult ? " is-result-expired" : ""}" data-history-index="${index}">
        <div class="history-media" style="${escapeHtml(mediaStyle)}">
          ${hasExpiredResult ? `<div class="history-placeholder history-expired-preview-wrap">
            <img class="history-expired-preview" src="${escapeHtml(generationExpiredPlaceholderUrl())}" alt="内容已经过期" loading="lazy" decoding="async" />
            <span class="generation-expired-label">内容已经过期</span>
          </div>` : resultLocked ? `<div class="history-placeholder history-locked-preview-wrap">
            ${record.lockedPreviewUrl ? `<img class="history-locked-preview" src="${escapeHtml(record.lockedPreviewUrl)}" alt="" loading="lazy" decoding="async" draggable="false" /><span class="history-locked-scrim" aria-hidden="true"></span>` : ""}
            <span class="history-locked-mark" aria-hidden="true"><i data-lucide="lock-keyhole"></i></span>
            ${unlockOverlay}
          </div>` : videoUrl ? `
            <button class="history-poster" type="button" data-history-load-video="${escapeHtml(mediaKey)}" aria-label="${escapeHtml(t("common.preview"))}">
              ${posterUrl ? `<img src="${escapeHtml(posterUrl)}" alt="" loading="lazy" decoding="async" />` : `<span>${escapeHtml(statusLabel(record.status))}</span>`}
              <i data-lucide="play"></i>
            </button>
            <video data-src="${escapeHtml(videoUrl)}" ${posterUrl ? `poster="${escapeHtml(posterUrl)}"` : ""} muted loop playsinline preload="none" data-history-video="${escapeHtml(mediaKey)}" hidden></video>
          ` : imageResultUrl ? `<img class="history-result-image" data-history-image="${index}" src="${escapeHtml(imageResultUrl)}" alt="" loading="${imageLoading}" fetchpriority="${imageFetchPriority}" decoding="async" />` : textResult ? `<div class="history-result-text">${escapeHtml(textResult)}</div>` : `<div class="history-placeholder"><i data-lucide="${recordStatusIcon}"></i><span>${escapeHtml(recordStatusLabel)}</span></div>`}
        </div>
        ${isUndressHistory ? `<div class="undress-history-footer">
          ${undressResultActions}
        </div>` : ""}
        ${isUndressHistory ? "" : `<div class="history-card-actions">
          <div class="history-record-actions${taskId || videoUrl ? "" : " history-record-actions-empty"}">
            ${primaryActions}
          </div>
          ${detailAction}
          ${deleteAction}
        </div>
        <details class="history-actions-menu">
          <summary class="history-download history-actions-trigger">
            <i data-lucide="ellipsis"></i><span>${escapeHtml(t("history.actions"))}</span><i data-lucide="chevron-down"></i>
          </summary>
          <div class="history-actions-popover" role="menu">${allActions}</div>
        </details>`}
      </article>
    `;
  }).join("")}${loadMoreHtml}`;
  const allowInlinePreview = !mobileLayout && window.matchMedia("(hover: hover) and (pointer: fine)").matches;
  els.historyList.querySelectorAll("[data-history-load-video]").forEach((button) => {
    const showVideo = () => {
      const key = button.dataset.historyLoadVideo || "";
      const escapedKey = window.CSS?.escape ? CSS.escape(key) : key.replace(/["\\]/g, "\\$&");
      const video = els.historyList.querySelector(`[data-history-video="${escapedKey}"]`);
      if (!video) return;
      if (!video.src) video.src = video.dataset.src || "";
      video.muted = true;
      video.loop = true;
      video.controls = false;
      video.hidden = false;
      button.hidden = true;
      video.play?.().catch(() => {});
    };
    const openModalPreview = () => {
      const key = button.dataset.historyLoadVideo || "";
      const escapedKey = window.CSS?.escape ? CSS.escape(key) : key.replace(/["\\]/g, "\\$&");
      const video = els.historyList.querySelector(`[data-history-video="${escapedKey}"]`);
      const previewUrl = video?.dataset?.src || video?.src || "";
      const index = Number(button.closest(".history-item")?.dataset.historyIndex || -1);
      const record = Number.isInteger(index) && index >= 0 ? sortedRecords[index] : null;
      if (!previewUrl) return;
      playPreview({
        title: record ? publicGenerationDisplayTitle(record, t("common.preview")) : t("common.preview"),
        previewUrl,
        posterUrl: generationPosterUrl(record),
        ratio: record?.ratio || record?.params?.ratio || record?.params?.aspect_ratio || "16:9",
      });
    };
    if (allowInlinePreview) {
      button.addEventListener("mouseenter", showVideo, { once: true });
      button.addEventListener("focus", showVideo, { once: true });
    }
    button.addEventListener("click", openModalPreview);
  });
  els.historyList.querySelectorAll(".history-result-image").forEach((image) => {
    image.addEventListener("click", () => {
      const index = Number(image.dataset.historyImage || -1);
      const record = sortedRecords[index];
      const previewUrl = image.getAttribute("src") || generationImageResultUrl(record);
      if (!previewUrl) return;
      previewImage({
        title: record ? publicGenerationDisplayTitle(record, t("common.preview")) : t("common.preview"),
        imageUrl: previewUrl,
      });
    });
  });
  els.historyList.querySelectorAll("[data-history-regenerate]").forEach((button) => {
    button.addEventListener("click", () => regenerateHistoryRecord(button.dataset.historyRegenerate || "", button));
  });
  els.historyList.querySelectorAll("[data-history-unlock]").forEach((button) => {
    button.addEventListener("click", () => {
      const taskId = button.dataset.historyUnlock || "";
      const record = sortedRecords.find((item) => String(item.taskId || "") === String(taskId));
      unlockHistoryRecord(taskId, button, record);
    });
  });
  els.historyList.querySelectorAll("[data-history-add-asset]").forEach((button) => {
    button.addEventListener("click", () => addHistoryRecordToAssets(button.dataset.historyAddAsset || "", button));
  });
  els.historyList.querySelectorAll("[data-history-download]").forEach((button) => {
    button.addEventListener("click", async () => {
      const record = sortedRecords[Number(button.dataset.historyDownload || 0)];
      button.disabled = true;
      try {
        await downloadGenerationRecord(record);
      } finally {
        button.disabled = false;
      }
    });
  });
  els.historyList.querySelectorAll("[data-history-r2-download]").forEach((button) => {
    button.addEventListener("click", async () => {
      const record = sortedRecords[Number(button.dataset.historyR2Download || 0)];
      setAdvancedDownloadButtonState(button, "transferring");
      const ok = await downloadGenerationRecord(record, { advanced: true });
      setAdvancedDownloadButtonState(button, ok ? "ready" : "failed");
    });
  });
  els.historyList.querySelectorAll("[data-history-replace]").forEach((button) => {
    button.addEventListener("click", () => openHistoryRecordAssetAction(button.dataset.historyReplace || "", "replace", button));
  });
  els.historyList.querySelectorAll("[data-history-extend]").forEach((button) => {
    button.addEventListener("click", () => openHistoryRecordAssetAction(button.dataset.historyExtend || "", "extend", button));
  });
  els.historyList.querySelectorAll("[data-history-frame]").forEach((button) => {
    button.addEventListener("click", () => openHistoryRecordAssetAction(button.dataset.historyFrame || "", "frame", button));
  });
  els.historyList.querySelectorAll("[data-history-detail]").forEach((button) => {
    button.addEventListener("click", () => openHistoryDetail(button.dataset.historyDetail || 0));
  });
  els.historyList.querySelectorAll("[data-history-delete]").forEach((button) => {
    button.addEventListener("click", () => deleteHistoryRecord(button.dataset.historyDelete || "", button));
  });
  const actionMenus = Array.from(els.historyList.querySelectorAll(".history-actions-menu"));
  actionMenus.forEach((menu) => {
    menu.addEventListener("toggle", () => {
      if (!menu.open) return;
      actionMenus.forEach((other) => {
        if (other !== menu) other.open = false;
      });
    });
    menu.querySelectorAll("button").forEach((button) => {
      button.addEventListener("click", () => { menu.open = false; });
    });
  });
  if (mobileLayout) {
    setupHistoryInfiniteScroll();
  } else {
    renderSimplePager(els.historyPager, {
      page: state.historyRecordsPage,
      totalPages: state.historyRecordsTotalPages,
      total: state.historyRecordsTotal,
    }, (page) => loadHistory({ page }), { jump: true });
  }
  refreshIcons();
}

async function showUndressInsufficientCreditsDialog(error) {
  const zh = state.lang === "zh";
  const cost = Number(error?.payload?.cost || 0);
  const credits = Number(error?.payload?.credits || state.user?.credits || 0);
  const detail = cost > 0
    ? (zh
      ? `\u9700\u8981 ${formatCredits(cost)} \u79ef\u5206\uff0c\u5f53\u524d\u4f59\u989d ${formatCredits(credits)} \u79ef\u5206\u3002`
      : `Unlocking needs ${formatCredits(cost)} credits. Your balance is ${formatCredits(credits)} credits.`)
    : (zh ? "\u4f59\u989d\u4e0d\u8db3\uff0c\u8bf7\u5145\u503c\u540e\u518d\u89e3\u9501\u3002" : "Your balance is insufficient. Top up before unlocking.");
  const result = await showInlineDialog({
    title: zh ? "\u4f59\u989d\u4e0d\u8db3" : "Insufficient balance",
    body: `<div class="undress-credit-alert"><i data-lucide="wallet-cards"></i><p>${escapeHtml(detail)}</p></div>`,
    confirmText: zh ? "\u53bb\u5145\u503c" : "Top up",
    onOpen: () => {
      if (els.inlineDialogConfirm) {
        els.inlineDialogConfirm.innerHTML = `<i data-lucide="wallet"></i>${escapeHtml(zh ? "\u53bb\u5145\u503c" : "Top up")}`;
      }
      refreshIcons();
    },
  });
  if (result === "confirm") openTopupDialog();
}

async function showUndressUnlockConfirm(record = {}) {
  const zh = state.lang === "zh";
  const cost = formatCredits(record.unlockCredits || 0);
  const result = await showInlineDialog({
    title: zh ? "确认解锁" : "Unlock result?",
    dialogClass: "is-undress-unlock",
    body: `<div class="undress-unlock-confirm">
      <span>${escapeHtml(zh ? "本次解锁将扣除" : "This unlock will deduct")}</span>
      <strong>${escapeHtml(cost)} <small>${escapeHtml(zh ? "积分" : "credits")}</small></strong>
    </div>`,
    confirmText: zh ? "确认解锁" : "Unlock",
    onOpen: () => {
      if (els.inlineDialogConfirm) {
        els.inlineDialogConfirm.innerHTML = `<i data-lucide="unlock"></i>${escapeHtml(zh ? "确认解锁" : "Unlock")}`;
      }
      refreshIcons();
    },
  });
  return result === "confirm";
}

async function unlockHistoryRecord(taskId, button, record = {}) {
  if (!taskId || !button) return;
  if (!(await showUndressUnlockConfirm(record))) return;
  const originalHtml = button.innerHTML;
  button.disabled = true;
  button.innerHTML = `<i data-lucide="loader-circle"></i>${escapeHtml(t("history.unlocking", {}, "Unlocking..."))}`;
  refreshIcons();
  try {
    const payload = await requestJson(`/api/undress-tool/tasks/${encodeURIComponent(taskId)}/unlock`, { method: "POST" });
    if (payload.user) setUser(payload.user);
    if (payload.record) {
      state.historyRecords = (state.historyRecords || []).map((record) => (
        String(record.taskId || "") === String(taskId) ? payload.record : record
      ));
      renderHistory(state.historyRecords);
    } else {
      await loadHistory({ silent: true });
    }
  } catch (error) {
    button.disabled = false;
    button.innerHTML = originalHtml;
    refreshIcons();
    if (error.statusCode === 402 || error.code === "INSUFFICIENT_CREDITS") {
      await showUndressInsufficientCreditsDialog(error);
      return;
    }
    const note = document.createElement("div");
    note.className = "job-note history-action-note";
    note.textContent = error.message || String(error);
    els.historyList?.prepend(note);
    window.setTimeout(() => note.remove(), 5000);
    refreshIcons();
  }
}

async function regenerateHistoryRecord(taskId, button) {
  if (!taskId || !button) return;
  const originalHtml = button.innerHTML;
  button.disabled = true;
  button.innerHTML = `<i data-lucide="loader-circle"></i>${escapeHtml(t("history.regenerating"))}`;
  refreshIcons();
  try {
    let record = (state.historyRecords || []).find((item) => String(item.taskId || "") === String(taskId));
    if (!record) {
      const payload = await requestJson(`/api/generation-records/${encodeURIComponent(taskId)}`);
      record = payload.record || payload.generation || null;
      if (payload.user) setUser(payload.user);
    } else {
      // List responses can omit structured media asset IDs. Reload the
      // authoritative detail before restoring the form so Regenerate never
      // silently drops selected library assets.
      record = await refreshedRegenerationRecord(record);
    }
    if (!record) throw new Error(t("history.loadFailed", { message: "record not found" }));
    restoreRecordToAdvancedCreate(record, button);
    button.innerHTML = `<i data-lucide="check"></i>${escapeHtml(t("history.regenerateSubmitted"))}`;
    refreshIcons();
  } catch (error) {
    button.innerHTML = `<i data-lucide="alert-circle"></i>${escapeHtml(error.message || String(error))}`;
    refreshIcons();
    window.setTimeout(() => {
      button.disabled = false;
      button.innerHTML = originalHtml;
      refreshIcons();
    }, 2500);
    return;
  }
  button.disabled = false;
}

async function addHistoryRecordToAssets(taskId, button) {
  if (!taskId || !button) return;
  const originalHtml = button.innerHTML;
  button.disabled = true;
  button.innerHTML = `<i data-lucide="loader-circle"></i>${escapeHtml(t("history.addingAsset"))}`;
  refreshIcons();
  try {
    const payload = await requestJson(`/api/generation-records/${encodeURIComponent(taskId)}/add-asset`, { method: "POST" });
    if (payload.asset) {
      state.userAssets = [payload.asset, ...(state.userAssets || []).filter((asset) => asset.id !== payload.asset.id)];
    }
    button.innerHTML = `<i data-lucide="check"></i>${escapeHtml(t("history.assetAdded"))}`;
    refreshIcons();
    window.setTimeout(() => {
      button.disabled = false;
      button.innerHTML = originalHtml;
      refreshIcons();
    }, 1800);
  } catch (error) {
    button.disabled = false;
    button.innerHTML = originalHtml;
    if (els.historyList) {
      const note = document.createElement("div");
      note.className = "job-note history-action-note";
      note.textContent = error.message || String(error);
      els.historyList.prepend(note);
      window.setTimeout(() => note.remove(), 5000);
    }
    refreshIcons();
  }
}

async function historyRecordToVideoAsset(taskId, button) {
  if (!taskId) return null;
  const originalHtml = button?.innerHTML || "";
  if (button) {
    button.disabled = true;
    button.innerHTML = `<i data-lucide="loader-circle"></i>${escapeHtml(t("history.addingAsset"))}`;
    refreshIcons();
  }
  try {
    const payload = await requestJson(`/api/generation-records/${encodeURIComponent(taskId)}/add-asset`, { method: "POST" });
    if (payload.asset) {
      state.userAssets = [payload.asset, ...(state.userAssets || []).filter((asset) => asset.id !== payload.asset.id)];
      state.userAssetsTotal += 1;
    }
    return payload.asset || null;
  } finally {
    if (button) {
      button.disabled = false;
      button.innerHTML = originalHtml;
      refreshIcons();
    }
  }
}

async function openHistoryRecordAssetAction(taskId, action = "replace", button = null) {
  const videoAsset = await historyRecordToVideoAsset(taskId, button).catch((error) => {
    if (els.historyList) {
      const note = document.createElement("div");
      note.className = "job-note history-action-note";
      note.textContent = error.message || String(error);
      els.historyList.prepend(note);
      window.setTimeout(() => note.remove(), 5000);
    }
    refreshIcons();
    return null;
  });
  if (!videoAsset) return;
  if (action === "frame") return openAssetFrameDialog(videoAsset);
  if (action === "extend") return openAssetVideoExtendDialog(videoAsset);
  if (action === "replace") return openAssetReplaceDialog(videoAsset);
}

async function deleteHistoryRecord(taskId = "", button = null) {
  if (!taskId) return;
  const originalHtml = button?.innerHTML || "";
  if (button) {
    button.disabled = true;
    button.innerHTML = `<i data-lucide="loader-circle"></i>${escapeHtml(t("history.deleting"))}`;
    refreshIcons();
  }
  try {
    await requestJson(`/api/generation-records/${encodeURIComponent(taskId)}`, { method: "DELETE" });
    state.historyRecords = (state.historyRecords || []).filter((record) => String(record.taskId || "") !== String(taskId));
    state.historyRecordsTotal = Math.max(0, Number(state.historyRecordsTotal || 0) - 1);
    historyRecordsSignature = "";
    // Stay on the page the visitor was on; loadHistory steps back if that page
    // no longer exists after the delete.
    await loadHistory({ silent: true, page: currentHistoryPage(), preserveMobile: true });
  } catch (error) {
    if (button) {
      button.disabled = false;
      button.innerHTML = originalHtml;
      refreshIcons();
    }
    if (els.historyList) {
      const note = document.createElement("div");
      note.className = "job-note history-action-note";
      note.textContent = t("history.deleteFailed", { message: error.message || String(error) });
      els.historyList.prepend(note);
      window.setTimeout(() => note.remove(), 5000);
    }
  }
}

function isPendingGenerationRecord(record = {}) {
  if (generationVideoUrl(record)) return false;
  if (generationImageResultUrl(record)) return false;
  return !["succeeded", "success", "done", "completed", "failed", "error", "cancelled", "canceled", "reference_failed", "rejected", "refunded", "deleted", "hidden"]
    .includes(String(record.status || "").toLowerCase().trim());
}

async function requestVideoFullscreen(video) {
  if (!video) return;
  try {
    if (video.requestFullscreen) await video.requestFullscreen();
    else if (video.webkitEnterFullscreen) video.webkitEnterFullscreen();
    else if (video.webkitRequestFullscreen) await video.webkitRequestFullscreen();
    await video.play().catch(() => {});
  } catch {
    video.controls = true;
  }
}

function currentHistoryPage() {
  return Math.max(1, Number(state.historyRecordsPage || 1) || 1);
}

