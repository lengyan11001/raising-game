let googleAnalyticsMeasurementId = "";
let playfluxGalleryRenderToken = 0;
let playfluxGalleryBatchObserver = null;
let playfluxGalleryMediaObserver = null;
let playfluxGalleryScrollHandler = null;

const PLAYFLUX_MOBILE_INITIAL_COUNT = 6;
const PLAYFLUX_MOBILE_BATCH_SIZE = 6;

function initGoogleAnalytics(measurementId = "") {
  const id = String(measurementId || "").trim();
  if (!/^G-[A-Z0-9]+$/i.test(id) || googleAnalyticsMeasurementId === id) return;
  googleAnalyticsMeasurementId = id;
  window.dataLayer = window.dataLayer || [];
  window.gtag = window.gtag || function gtag() { window.dataLayer.push(arguments); };
  const script = document.createElement("script");
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(id)}`;
  document.head.appendChild(script);
  window.gtag("js", new Date());
  window.gtag("config", id, { send_page_view: false });
}

function trackGooglePageView() {
  if (!googleAnalyticsMeasurementId || typeof window.gtag !== "function") return;
  window.gtag("event", "page_view", {
    page_title: document.title || "Vipeak AI",
    page_location: window.location.href,
    page_path: `${window.location.pathname}${window.location.search}${window.location.hash}`,
  });
}

function trackAnalyticsEvent(eventName, params = {}) {
  const name = String(eventName || "").trim();
  if (!name || !googleAnalyticsMeasurementId || typeof window.gtag !== "function") return;
  window.gtag("event", name, params);
}

function setTab(tab) {
  const previousTab = state.tab;
  const customAdvancedRoute = isAdvancedCustomRoute(tab);
  const hashRoute = platformHashParts(tab);
  let routeGalleryMode = galleryModeFromPlatformRoute(tab);
  if (routeGalleryMode && !isGalleryModeAllowed(routeGalleryMode)) routeGalleryMode = "";
  const routeCharacterId = characterRouteParamFrom(hashRoute.params);
  if (routeCharacterId) {
    state.routeCharacterId = routeCharacterId;
    state.routeCharacterSource = String(hashRoute.params.get("source") || "").trim().toLowerCase();
  } else if (String(tab || "").trim().startsWith("#")) {
    state.routeCharacterId = "";
    state.routeCharacterSource = "";
    state.activeGalleryCharacterId = "";
  }
  let nextTab = routeGalleryMode ? DEFAULT_PLATFORM_TAB : normalizePlatformTab(tab);
  if (!isTabAllowed(nextTab)) nextTab = tenantDefaultTab();
  if ((nextTab === DEFAULT_PLATFORM_TAB || nextTab === "characters") && state.routeCharacterId) {
    applyRouteCharacterDetail({ allowTabSwitch: true });
    nextTab = state.tab || nextTab;
  }
  state.tab = nextTab;
  if (nextTab === "advanced") {
    if (customAdvancedRoute) {
      state.advancedCreateKind = ADVANCED_CUSTOM_KIND.id;
      state.advancedCreateMode = ADVANCED_CUSTOM_MODE.id;
      state.advancedSideTab = "assets";
    } else if (state.advancedCreateKind === ADVANCED_CUSTOM_KIND.id) {
      state.advancedCreateKind = "video";
      state.advancedCreateMode = advancedCreateModesForKind("video")[0]?.id || "video-image";
      state.advancedSideTab = "result";
      if (state.advancedMobileTab === "assets") state.advancedMobileTab = "create";
    }
  }
  if (nextTab === "characters") {
    state.characterPanelTab = state.routeCharacterId || state.activeGalleryCharacterId
      ? "list"
      : previousTab === "characters" ? normalizeCharacterPanelTab(state.characterPanelTab) : "create";
  }
  if (routeGalleryMode) state.galleryMode = routeGalleryMode;
  if (nextTab === DEFAULT_PLATFORM_TAB && !isGalleryModeAllowed(state.galleryMode)) {
    state.galleryMode = tenantDefaultGalleryMode();
  }
  localStorage.setItem(TAB_KEY, nextTab);
  const nextHash = state.routeCharacterId && (nextTab === DEFAULT_PLATFORM_TAB || nextTab === "characters")
    ? characterDetailHash(nextTab, state.routeCharacterId, state.routeCharacterSource)
    : nextTab === DEFAULT_PLATFORM_TAB
      ? galleryModeHash(state.galleryMode)
      : nextTab === "advanced" && state.advancedCreateKind === ADVANCED_CUSTOM_KIND.id
        ? "#custom"
        : `#${nextTab}`;
  if (window.location.hash !== nextHash) {
    const nextUrl = `${window.location.pathname}${sanitizedSearchWithoutCharacterParams()}${nextHash}`;
    window.history.replaceState(null, "", nextUrl);
  }
  if (nextTab !== "history") {
    stopHistoryRefresh();
    disconnectHistoryLoadMoreObserver();
    historyRecordsSignature = "";
  }
  if (nextTab !== "assets") {
    window.clearTimeout(state.assetSearchTimer);
    state.assetSearchTimer = 0;
  }
  if (nextTab !== "advanced") {
    window.clearTimeout(state.advancedAssetSearchTimer);
    state.advancedAssetSearchTimer = 0;
    stopAdvancedResultRefresh();
  }
  syncTopupAutoRefresh();
  document.querySelectorAll("[data-panel]").forEach((panel) => {
    panel.hidden = panel.dataset.panel !== nextTab;
  });
  if (typeof syncUndressAmbientVideo === "function") syncUndressAmbientVideo(nextTab === DEFAULT_PLATFORM_TAB);
  document.querySelectorAll("[data-history-expiry-info]").forEach((control) => {
    control.hidden = nextTab !== "history";
    if (control.hidden) control.open = false;
  });
  syncMainTabState();
  syncGalleryShortcutNav();
  if (typeof renderVideoToolActions === "function") renderVideoToolActions();
  if (nextTab === DEFAULT_PLATFORM_TAB) {
    renderTemplates();
    // Undress keeps its home workspace mounted while Result/History is open.
    // Re-render it on return so a submitted file/result cannot remain visible
    // until the user changes the tool tab again.
    if (typeof renderUndressToolHomeState === "function") renderUndressToolHomeState();
  }
  if (nextTab === "history") loadHistory({ page: isMobileHistoryLayout() ? 1 : state.historyRecordsPage || 1 });
  if (nextTab === "topups") loadTopupRecords();
  if (nextTab === "spending") loadSpendingRecords();
  if (nextTab === "referral") loadReferralSummary({ force: true });
  if (nextTab === "pricing") renderPricing();
  if (nextTab === "chat") loadChatConversations({ selectFirst: true });
  if (nextTab === "assets") {
    if (state.user) loadUserAssets();
    else renderAssets([]);
  }
  if (nextTab === "characters") {
    applyRouteCharacterDetail({ allowTabSwitch: false });
    renderCharactersPanel();
    loadGalleryUnlocks();
    if (state.user) loadMyCharacters({ silent: true }).catch(() => {});
    if (state.user) loadUserAssets(state.userAssetsPage || 1).catch(() => {});
  }
  if (nextTab === "access") loadApiSubtokens();
  if (nextTab === "advanced") {
    renderAdvanced();
    if (state.advancedCreateKind === ADVANCED_CUSTOM_KIND.id) loadAdvancedAssets();
    renderAdvancedResultPanel();
    if (state.advancedSideTab === "result" && state.advancedResultTaskId) scheduleAdvancedResultRefresh({ delayMs: 1000, force: true });
  }
  if (nextTab === "workflow") {
    renderWorkflowPanel();
    loadWorkflowPresets();
    loadWorkflowCanvases();
  }
  closeAccountMenu();
  closeMobileDrawer();
  trackGooglePageView();
}

function syncMainTabState() {
  const customActive = state.tab === "advanced" && state.advancedCreateKind === ADVANCED_CUSTOM_KIND.id;
  document.querySelectorAll("[data-tab]").forEach((button) => {
    const buttonTab = button.dataset.tab || "";
    const active = buttonTab === "custom"
      ? customActive
      : buttonTab === state.tab
        && !(buttonTab === "advanced" && customActive)
        && (buttonTab !== DEFAULT_PLATFORM_TAB || normalizeGalleryMode(state.galleryMode) === DEFAULT_GALLERY_MODE);
    button.classList.toggle("is-active", active);
  });
}

function setCategory(category) {
  state.category = category;
  renderCategories();
  renderTemplates();
}

function galleryModeHash(mode = state.galleryMode) {
  const normalized = normalizeGalleryMode(mode);
  if (normalized === "playflux-video") return "#video";
  if (normalized === "playflux-image") return "#image";
  if (normalized === "playflux-anime" && canUseAnimeTemplates()) return "#anime";
  return "";
}

function playfluxTabFromGalleryMode(mode = state.galleryMode) {
  const normalized = normalizeGalleryMode(mode);
  if (normalized === "playflux-image") return "image";
  if (normalized === "playflux-anime" && canUseAnimeTemplates()) return "anime";
  return "video";
}

function isPlayfluxGalleryMode(mode = state.galleryMode) {
  const normalized = normalizeGalleryMode(mode);
  if (normalized === "playflux-anime") return canUseAnimeTemplates();
  return ["playflux-video", "playflux-image"].includes(normalized);
}

function setGalleryMode(mode = DEFAULT_GALLERY_MODE) {
  const normalized = normalizeGalleryMode(mode || DEFAULT_GALLERY_MODE);
  state.galleryMode = normalized;
  state.routeCharacterId = "";
  state.routeCharacterSource = "";
  state.activeGalleryCharacterId = "";
  const nextHash = galleryModeHash(state.galleryMode);
  window.history.replaceState(null, "", `${window.location.pathname}${sanitizedSearchWithoutCharacterParams()}${nextHash}`);
  renderTemplates();
  if (typeof renderVideoToolActions === "function") renderVideoToolActions();
  closeMobileDrawer();
}

function galleryCharacterItemsForSource(source = "system") {
  return source === "custom"
    ? customCharacterItems()
    : state.homeCharacters.filter((item) => item && !item.deletedAt);
}

function mergeHomeCharacters(items = []) {
  const byId = new Map((state.homeCharacters || [])
    .filter((item) => item && item.id)
    .map((item) => [String(item.id), item]));
  (Array.isArray(items) ? items : []).forEach((item) => {
    if (!item?.id) return;
    byId.set(String(item.id), item);
  });
  state.homeCharacters = Array.from(byId.values());
}

async function loadMoreHomeCharacters() {
  if (state.homeCharactersLoadingMore) return;
  if (Number(state.homeCharactersTotal || 0) && state.homeCharacters.length >= Number(state.homeCharactersTotal || 0)) return;
  state.homeCharactersLoadingMore = true;
  try {
    const nextPage = Number(state.homeCharactersPage || 1) + 1;
    const limit = Number(state.homeCharactersLimit || CHARACTER_PAGE_SIZE) || CHARACTER_PAGE_SIZE;
    const payload = await requestJson(`/api/public/characters?page=${encodeURIComponent(String(nextPage))}&limit=${encodeURIComponent(String(limit))}`);
    mergeHomeCharacters(payload.items || []);
    state.homeCharactersPage = Number(payload.page || nextPage) || nextPage;
    state.homeCharactersLimit = Number(payload.limit || limit) || limit;
    state.homeCharactersTotal = Number(payload.total || state.homeCharacters.length) || state.homeCharacters.length;
    state.homeCharactersTotalPages = Number(payload.totalPages || state.homeCharactersTotalPages || 1) || 1;
  } finally {
    state.homeCharactersLoadingMore = false;
  }
}

async function ensureRouteHomeCharacterLoaded() {
  const id = String(state.routeCharacterId || "").trim();
  const source = String(state.routeCharacterSource || "").trim();
  if (!id || source === "custom" || id.startsWith("custom:") || id.startsWith("mychar")) return;
  if (state.homeCharacters.some((item) => String(item?.id || "") === id)) return;
  const payload = await requestJson(`/api/public/characters?id=${encodeURIComponent(id)}&limit=1`);
  mergeHomeCharacters(payload.items || []);
}

function characterSourceForId(characterId = "") {
  const id = String(characterId || "");
  if (!id) return "";
  if (state.homeCharacters.some((item) => String(item?.id || "") === id)) return "system";
  if (customCharacterItems().some((item) => String(item?.id || "") === id)) return "custom";
  if (id.startsWith("custom:") || id.startsWith("mychar")) return "custom";
  return "";
}

function findGalleryCharacterInSource(characterId = "", source = "") {
  const id = String(characterId || "");
  if (!id) return null;
  const preferredSource = source || characterSourceForId(id) || "system";
  return galleryCharacterItemsForSource(preferredSource).find((item) => String(item?.id || "") === id) || null;
}

function trackSystemCharacterView(characterId = "", source = "") {
  const id = String(characterId || "").trim();
  if (!id || characterSourceForId(id) !== "system") return;
  const normalizedSource = ["home", "direct", "external"].includes(source) ? source : "";
  const key = id;
  if (state.characterViewTrackKeys?.has(key)) return;
  state.characterViewTrackKeys?.add(key);
  requestJson("/api/analytics/character-view", {
    method: "POST",
    body: { characterId: id, source: normalizedSource },
  }).catch((error) => console.warn("character view tracking failed", error.message || error));
}

function applyRouteCharacterDetail({ allowTabSwitch = true } = {}) {
  const liveRoute = currentCharacterRouteParams({ includeSearch: true });
  if (liveRoute.characterId) {
    state.routeCharacterId = liveRoute.characterId;
    state.routeCharacterSource = liveRoute.source || state.routeCharacterSource || "";
  }
  const characterId = String(state.routeCharacterId || "").trim();
  if (!characterId) return false;
  const source = state.routeCharacterSource === "custom" || state.routeCharacterSource === "system"
    ? state.routeCharacterSource
    : characterSourceForId(characterId);
  if (!source) return false;
  const targetTab = source === "custom" ? "characters" : DEFAULT_PLATFORM_TAB;
  if (allowTabSwitch && state.tab !== targetTab) {
    state.tab = targetTab;
    localStorage.setItem(TAB_KEY, targetTab);
  }
  state.characterSource = source;
  state.activeGalleryCharacterId = characterId;
  state.routeCharacterSource = source;
  if (source === "system") trackSystemCharacterView(characterId, liveRoute.source === "home" ? "home" : "");
  return true;
}

function renderCategories() {
  if (!els.categoryRow) return;
  const visibleCategories = state.categories.filter((category) => !isHiddenCategory(category));
  const chips = [{ id: "all", name: t("common.all") }, ...visibleCategories];
  els.categoryRow.innerHTML = chips.map((category) => `
    <button class="category-chip ${state.category === category.id ? "is-active" : ""}" data-category="${escapeHtml(category.id)}" type="button">
      ${escapeHtml(localizedCategoryName(category))}
    </button>
  `).join("");
  els.categoryRow.querySelectorAll("[data-category]").forEach((button) => {
    button.addEventListener("click", () => setCategory(button.dataset.category));
  });
}

function bindHoverPreviewCard({ card, video, cover, fallbackCover = DEFAULT_TEMPLATE_COVER, tapToPreview = false } = {}) {
  if (!card || !video) return;
  let active = false;
  let loadTimer = null;
  let retryTimer = null;
  let playbackToken = 0;
  const isCoarsePointer = () => Boolean(window.matchMedia?.("(hover: none), (pointer: coarse)")?.matches);
  const showVideo = () => {
    if (!active || video.readyState < 2) return;
    card.classList.remove("is-loading-preview");
    card.classList.add("is-previewing");
  };
  const requestPlay = (token) => {
    if (!active || token !== playbackToken) return;
    video.muted = true;
    video.loop = true;
    video.playsInline = true;
    if (!video.src && video.dataset.src) {
      video.src = video.dataset.src;
      video.load();
    }
    const playPromise = video.play();
    if (playPromise && typeof playPromise.then === "function") {
      playPromise.then(showVideo).catch(() => {
        if (!active || token !== playbackToken) return;
        clearTimeout(retryTimer);
        retryTimer = window.setTimeout(() => requestPlay(token), 350);
      });
    } else {
      showVideo();
    }
  };
  const stop = () => {
    active = false;
    playbackToken += 1;
    if (activeHoverPreviewStop === stop) activeHoverPreviewStop = null;
    clearTimeout(loadTimer);
    clearTimeout(retryTimer);
    video.pause();
    try {
      video.currentTime = 0;
    } catch (error) {}
    card.classList.remove("is-loading-preview", "is-previewing");
  };
  const start = ({ immediate = false } = {}) => {
    if (activeHoverPreviewStop && activeHoverPreviewStop !== stop) {
      activeHoverPreviewStop();
    }
    active = true;
    playbackToken += 1;
    const token = playbackToken;
    activeHoverPreviewStop = stop;
    card.classList.add("is-loading-preview");
    clearTimeout(loadTimer);
    clearTimeout(retryTimer);
    if (immediate) {
      requestPlay(token);
    } else {
      loadTimer = window.setTimeout(() => requestPlay(token), 180);
    }
  };
  video.addEventListener("loadeddata", showVideo);
  video.addEventListener("canplay", showVideo);
  video.addEventListener("playing", showVideo);
  video.addEventListener("timeupdate", showVideo);
  video.addEventListener("pause", () => {
    if (!active) return;
    const token = playbackToken;
    clearTimeout(retryTimer);
    retryTimer = window.setTimeout(() => requestPlay(token), 300);
  });
  video.addEventListener("stalled", () => {
    if (!active) return;
    card.classList.add("is-loading-preview");
    requestPlay(playbackToken);
  });
  video.addEventListener("waiting", () => {
    if (!active) return;
    card.classList.add("is-loading-preview");
  });
  video.addEventListener("error", () => {
    clearTimeout(loadTimer);
    clearTimeout(retryTimer);
    card.classList.remove("cover-failed", "is-loading-preview", "is-previewing");
    if (cover && fallbackCover && cover.getAttribute("src") !== fallbackCover) {
      cover.src = fallbackCover;
    }
  });
  card.addEventListener("pointerenter", () => {
    if (tapToPreview && isCoarsePointer()) return;
    start();
  });
  card.addEventListener("pointerleave", stop);
  card.addEventListener("focusin", start);
  card.addEventListener("focusout", stop);
  if (tapToPreview) {
    card.addEventListener("click", (event) => {
      if (!isCoarsePointer() || isInteractiveTarget(event.target)) return;
      event.preventDefault();
      start({ immediate: true });
    });
  }
}

function renderTemplates() {
  activeHoverPreviewStop?.();
  activeHoverPreviewStop = null;
  resetPlayfluxGalleryObservers();
  applyRouteCharacterDetail({ allowTabSwitch: true });
  renderGalleryModeTabs();
  if (state.tab === "characters") {
    renderCharactersPanel();
    return;
  }
  if (state.galleryMode === "characters") {
    state.characterSource = "system";
    renderGalleryCharacters(els.templateGrid);
    return;
  }
  if (isPlayfluxGalleryMode()) {
    if (!state.playfluxTemplatesLoaded && !state.playfluxTemplatesLoading) {
      els.templateGrid.innerHTML = `<div class="job-note">Loading templates…</div>`;
      void loadPlayfluxTemplates();
      return;
    }
    renderPlayfluxTemplateGallery();
    return;
  }
  renderGalleryCases();
}

function renderGalleryCases() {
  const cases = state.advancedCases.filter((item) => item.enabled !== false);
  const activeTab = normalizeAdvancedCaseTab(state.galleryMode);
  const pageSize = ADVANCED_CASE_PAGE_SIZE[activeTab] || 9;
  const entries = cases
    .map((item, index) => ({ item, index }))
    .filter(({ item }) => normalizeAdvancedCaseTab(item.category || item.caseCategory || item.tab) === activeTab)
    .slice(0, pageSize);
  els.templateGrid.className = `template-grid gallery-advanced-grid ${activeTab === "hot" ? "" : "is-case-list"}`;
  els.templateGrid.innerHTML = entries.length
    ? entries.map((entry) => (activeTab === "hot" ? renderAdvancedCaseCard(entry) : renderAdvancedCaseRow(entry))).join("")
    : `<div class="job-note">${escapeHtml(t("gallery.noTemplates"))}</div>`;
  bindGalleryCaseActions();
  refreshIcons();
}

function playfluxTemplateTabMeta(tab = playfluxTabFromGalleryMode()) {
  return PLAYFLUX_TEMPLATE_TABS.find((item) => item.id === tab) || PLAYFLUX_TEMPLATE_TABS[0];
}

function allPlayfluxTemplates() {
  return (Array.isArray(state.playfluxTemplates) ? state.playfluxTemplates : [])
    .filter((item) => item && item.id && item.tab);
}

function playfluxTemplateById(templateId = "") {
  const id = String(templateId || "");
  return allPlayfluxTemplates().find((item) => item.id === id) || null;
}

function playfluxTemplatesForActiveTab() {
  const activeTab = playfluxTemplateTabMeta().id;
  return allPlayfluxTemplates().filter((item) => item.tab === activeTab);
}

function renderPlayfluxTemplateGallery() {
  if (!els.templateGrid) return;
  const templates = playfluxTemplatesForActiveTab();
  const mobile = Boolean(window.matchMedia?.("(max-width: 720px)")?.matches);
  const batchSize = mobile ? PLAYFLUX_MOBILE_BATCH_SIZE : Math.max(templates.length, 1);
  const initialCount = mobile ? PLAYFLUX_MOBILE_INITIAL_COUNT : templates.length;
  const renderToken = ++playfluxGalleryRenderToken;
  let renderedCount = 0;
  els.templateGrid.className = "template-grid playflux-template-shell";
  els.templateGrid.innerHTML = `
    <section class="playflux-template-page">
      <div class="playflux-card-grid" data-playflux-card-grid></div>
      <div class="playflux-load-sentinel" data-playflux-load-sentinel aria-hidden="true"></div>
    </section>
  `;
  const grid = els.templateGrid.querySelector("[data-playflux-card-grid]");
  const sentinel = els.templateGrid.querySelector("[data-playflux-load-sentinel]");
  const appendBatch = (count = batchSize) => {
    if (!grid || renderToken !== playfluxGalleryRenderToken) return;
    const next = templates.slice(renderedCount, renderedCount + count);
    if (!next.length) {
      sentinel?.remove();
      playfluxGalleryBatchObserver?.disconnect();
      playfluxGalleryBatchObserver = null;
      if (playfluxGalleryScrollHandler) window.removeEventListener("scroll", playfluxGalleryScrollHandler);
      playfluxGalleryScrollHandler = null;
      return;
    }
    grid.insertAdjacentHTML("beforeend", next.map((template, index) => renderPlayfluxTemplateCard(template, {
      eager: mobile && renderedCount + index < PLAYFLUX_MOBILE_INITIAL_COUNT,
    })).join(""));
    renderedCount += next.length;
    bindPlayfluxTemplateCards(grid);
    bindGalleryImageFallbacks(grid);
    observePlayfluxTemplateMedia(grid);
    refreshIcons();
    if (renderedCount >= templates.length) {
      sentinel?.remove();
      playfluxGalleryBatchObserver?.disconnect();
      playfluxGalleryBatchObserver = null;
      if (playfluxGalleryScrollHandler) window.removeEventListener("scroll", playfluxGalleryScrollHandler);
      playfluxGalleryScrollHandler = null;
    }
  };
  appendBatch(initialCount);
  if (mobile && renderedCount < templates.length && sentinel) {
    let scheduled = false;
    playfluxGalleryScrollHandler = () => {
      if (scheduled || renderToken !== playfluxGalleryRenderToken) return;
      scheduled = true;
      window.requestAnimationFrame(() => {
        scheduled = false;
        if (!sentinel.isConnected || window.scrollY <= 0) return;
        if (sentinel.getBoundingClientRect().top <= window.innerHeight + 160) appendBatch();
      });
    };
    window.addEventListener("scroll", playfluxGalleryScrollHandler, { passive: true });
  } else if (renderedCount < templates.length) {
    appendBatch(templates.length - renderedCount);
  }
}

function resetPlayfluxGalleryObservers() {
  playfluxGalleryRenderToken += 1;
  playfluxGalleryBatchObserver?.disconnect();
  playfluxGalleryMediaObserver?.disconnect();
  if (playfluxGalleryScrollHandler) window.removeEventListener("scroll", playfluxGalleryScrollHandler);
  playfluxGalleryBatchObserver = null;
  playfluxGalleryMediaObserver = null;
  playfluxGalleryScrollHandler = null;
}

function bindPlayfluxTemplateCards(root) {
  root?.querySelectorAll("[data-playflux-template]:not([data-playflux-bound])").forEach((button) => {
    button.dataset.playfluxBound = "1";
    button.addEventListener("click", () => openPlayfluxTemplateDialog(button.dataset.playfluxTemplate || ""));
  });
}

function loadPlayfluxTemplateVideo(video) {
  if (!video || !video.dataset.src) return;
  const revealVideo = () => video.closest(".playflux-template-media")?.classList.add("is-video-ready");
  if (video.readyState >= 2) revealVideo();
  else video.addEventListener("loadeddata", revealVideo, { once: true });
  if (!video.src) {
    video.src = video.dataset.src;
    video.load();
  }
  video.play().catch(() => {});
}

function observePlayfluxTemplateMedia(root) {
  const videos = Array.from(root?.querySelectorAll("video[data-src]:not([data-playflux-observed])") || []);
  if (!videos.length) return;
  if (!("IntersectionObserver" in window)) {
    videos.forEach(loadPlayfluxTemplateVideo);
    return;
  }
  if (!playfluxGalleryMediaObserver) {
    playfluxGalleryMediaObserver = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        const video = entry.target;
        if (entry.isIntersecting) loadPlayfluxTemplateVideo(video);
        else video.pause();
      });
    }, {
      rootMargin: window.matchMedia?.("(max-width: 720px)")?.matches ? "80px 0px" : "180px 0px",
      threshold: 0.01,
    });
  }
  videos.forEach((video) => {
    video.dataset.playfluxObserved = "1";
    playfluxGalleryMediaObserver.observe(video);
  });
}

function renderPlayfluxTemplateCard(template = {}, { eager = false } = {}) {
  const isVideo = template.previewType === "video";
  const title = localizedTemplateTitle(template);
  const posterUrl = template.posterUrl || (isVideo ? DEFAULT_TEMPLATE_COVER : template.previewUrl) || DEFAULT_TEMPLATE_COVER;
  return `
    <button class="playflux-template-card" type="button" data-playflux-template="${escapeHtml(template.id || "")}">
      <span class="playflux-template-media">
        <img class="playflux-template-poster" src="${escapeHtml(posterUrl)}" data-cover-fallback="${escapeHtml(DEFAULT_TEMPLATE_COVER)}" alt="${escapeHtml(title)}" loading="${eager ? "eager" : "lazy"}" decoding="async"${eager ? ' fetchpriority="high"' : ""} />
        ${isVideo
          ? `<video class="playflux-template-video" data-src="${escapeHtml(template.previewUrl || "")}" muted loop playsinline preload="none"></video>`
          : ""}
        <span class="playflux-template-shade"></span>
        ${template.badge ? `<small class="playflux-template-badge">${escapeHtml(template.badge)}</small>` : ""}
        <span class="playflux-template-fav"><i data-lucide="heart"></i></span>
        ${isVideo ? `<span class="playflux-template-play"><i data-lucide="play"></i></span>` : ""}
      </span>
      <strong>${escapeHtml(title)}</strong>
    </button>
  `;
}

function playfluxTemplateDialogMedia(template = {}) {
  const title = localizedTemplateTitle(template);
  if (template.previewType === "video") {
    return `<video src="${escapeHtml(template.previewUrl || "")}" ${template.posterUrl ? `poster="${escapeHtml(template.posterUrl)}"` : ""} muted loop autoplay playsinline controls preload="metadata"></video>`;
  }
  return `<img src="${escapeHtml(template.previewUrl || DEFAULT_TEMPLATE_COVER)}" alt="${escapeHtml(title)}" loading="lazy" />`;
}

function playfluxTemplatePromptBlock(template = {}) {
  return `
    <div class="playflux-template-meta playflux-template-public-meta">
      <span>Resolution: ${escapeHtml(template.ratio || "9:16")}</span>
      ${template.tab === "anime" ? `<span>Base style: ${escapeHtml(template.animeBaseStyleLabel || "Nova Anime XL")}</span>` : ""}
    </div>
  `;
}

function playfluxTemplateAnimePanel(template = {}) {
  const title = localizedTemplateTitle(template);
  return `
    <div class="playflux-anime-direct">
      <div class="playflux-anime-selected">
        <img src="${escapeHtml(template.previewUrl || DEFAULT_TEMPLATE_COVER)}" alt="${escapeHtml(title)}" loading="lazy" />
        <span>
          <small>Anime action</small>
          <strong>${escapeHtml(title)}</strong>
        </span>
      </div>
      <div class="playflux-anime-style">
        <span class="playflux-anime-style-icon"><i data-lucide="sparkles"></i></span>
        <span>
          <small>Base style</small>
          <strong>${escapeHtml(template.animeBaseStyleLabel || "Nova Anime XL")}</strong>
        </span>
      </div>
      <button class="playflux-preview-panel playflux-anime-preview" type="button" data-playflux-template-preview="${escapeHtml(template.id || "")}">
        ${playfluxTemplateDialogMedia(template)}
        <span>Preview</span>
      </button>
    </div>
  `;
}

function openPlayfluxTemplateDialog(templateId = "") {
  const template = playfluxTemplateById(templateId);
  if (!template) return;
  const tab = playfluxTemplateTabMeta(template.tab);
  const title = localizedTemplateTitle(template);
  showInlineDialog({
    title,
    body: `
      <div class="playflux-template-dialog">
        <div class="playflux-template-kicker"><i data-lucide="${escapeHtml(tab.icon)}"></i>${escapeHtml(tab.label)}</div>
        <div class="playflux-template-flow">
          <div class="playflux-source-panel">
            <button class="ghost-button playflux-upload-btn" type="button" aria-label="${escapeHtml(t("advancedPreset.uploadLocalImage"))}" data-playflux-template-upload="${escapeHtml(template.id || "")}">
              <i data-lucide="upload"></i><span>上传</span>
            </button>
            <button class="playflux-character-pick" type="button" data-playflux-template-character="${escapeHtml(template.id || "")}">
              <span class="playflux-character-thumb"><i data-lucide="user-round"></i></span>
              <strong>PICK A CHARACTER</strong>
            </button>
          </div>
          <span class="playflux-flow-arrow"><i data-lucide="arrow-right"></i></span>
          <button class="playflux-preview-panel" type="button" data-playflux-template-preview="${escapeHtml(template.id || "")}">
            ${playfluxTemplateDialogMedia(template)}
            <span>预览</span>
          </button>
        </div>
        ${false && template.previewType === "video" ? `
          <div class="playflux-source-modes" aria-label="Seedance source mode">
            ${[
              { id: "reference_images", label: "参考" },
              { id: "first_last_frame", label: "首/尾帧" },
              { id: "reference_video", label: "参考视频" },
            ].map((mode) => `
              <button class="${(template.seedanceMode || "reference_images") === mode.id ? "is-active" : ""}" type="button" data-playflux-source-mode="${escapeHtml(mode.id)}">
                ${escapeHtml(mode.label)}
              </button>
            `).join("")}
          </div>
        ` : ""}
        ${playfluxTemplatePromptBlock(template)}
        <p class="job-note">All generations must be consensual. Illegal or underage content is prohibited.</p>
      </div>
    `,
    confirmText: template.sourceRequired ? "Add Source First" : "Use this template",
    dialogClass: "is-media-action is-playflux-template",
    onOpen: (root) => {
      root.querySelectorAll("[data-playflux-source-mode]").forEach((button) => {
        button.addEventListener("click", () => {
          root.querySelectorAll("[data-playflux-source-mode]").forEach((item) => item.classList.remove("is-active"));
          button.classList.add("is-active");
          refreshPlayfluxTemplateCost(root, template, button.dataset.playfluxSourceMode || "");
        });
      });
      refreshPlayfluxTemplateCost(root, template);
      root.querySelector("[data-playflux-template-preview]")?.addEventListener("click", () => {
        if (template.previewType === "video") playPreview({ title, previewUrl: template.previewUrl, ratio: template.ratio || "9:16" });
        else previewImage({ title, imageUrl: template.previewUrl });
      });
      root.querySelector("[data-playflux-template-character]")?.addEventListener("click", () => {
        const sourceMode = root.querySelector("[data-playflux-source-mode].is-active")?.dataset.playfluxSourceMode || "";
        els.inlineDialog?.close("character");
        applyPlayfluxTemplateToCreate(template, { openCharacter: true, sourceMode });
      });
      root.querySelector("[data-playflux-template-upload]")?.addEventListener("click", () => {
        const sourceMode = root.querySelector("[data-playflux-source-mode].is-active")?.dataset.playfluxSourceMode || "";
        els.inlineDialog?.close("upload");
        applyPlayfluxTemplateToCreate(template, { openUpload: true, sourceMode });
      });
    },
    onConfirm: (root) => {
      const sourceMode = root.querySelector("[data-playflux-source-mode].is-active")?.dataset.playfluxSourceMode || "";
      applyPlayfluxTemplateToCreate(template, { sourceMode });
    },
  });
}

function playfluxTemplateNeedsSource(template = {}) {
  return playfluxTemplateRequiredSourceCount(template) > 0;
}

function playfluxTemplateVideoProvider() {
  const provider = tenantStringFeature("videoProvider", "wan27");
  return ["wan30", "wan27", "happyhorse", "seedance"].includes(provider) ? provider : "wan27";
}

const PLAYFLUX_WAN_VIDEO_CAPABILITY = "wan30-video";
const PLAYFLUX_WAN27_VIDEO_EDIT_CAPABILITY = "wan27-video-edit";

function playfluxTemplateVideoCapability(provider = playfluxTemplateVideoProvider()) {
  if (provider === "wan30") return PLAYFLUX_WAN_VIDEO_CAPABILITY;
  if (provider === "wan27") return PLAYFLUX_WAN27_VIDEO_EDIT_CAPABILITY;
  if (provider === "happyhorse") return "happyhorse-video-edit";
  return "";
}

function playfluxTemplateOutputDuration(template = {}, provider = playfluxTemplateVideoProvider()) {
  const configuredDuration = Number(template.duration || 5) || 5;
  if (provider !== "wan27" || playfluxTemplateVideoCapability(provider) !== PLAYFLUX_WAN27_VIDEO_EDIT_CAPABILITY) return configuredDuration;
  const referenceDuration = Number(template.referenceVideoDurationSeconds || configuredDuration) || configuredDuration;
  return Math.max(2, Math.min(10, Math.round(referenceDuration)));
}

function playfluxTemplateRequiredSourceCount(template = {}) {
  if (template.tab === "video") return 1;
  if (!template.sourceRequired) return 0;
  return Math.max(1, Math.min(9, Number(template.sourceCount || 1)));
}

function playfluxTemplateDefaultSourceMode(template = {}) {
  if (template.tab !== "video") return "";
  if (playfluxTemplateVideoProvider() !== "seedance") return "reference_video";
  return playfluxNormalizeSeedanceMediaMode(template.seedanceMode || "reference_images");
}

function playfluxTemplateSelectedSource(root) {
  return playfluxTemplateSelectedSources(root)[0] || null;
}

function playfluxTemplateSelectedSources(root) {
  const input = root?.querySelector("#playfluxTemplateImageInput");
  return Array.from(input?.files || []).slice(0, 9);
}

function updatePlayfluxTemplateSourcePreview(root, files = []) {
  const selected = Array.isArray(files) ? files : (files ? [files] : []);
  const preview = root?.querySelector("[data-playflux-source-preview]");
  const label = root?.querySelector("[data-playflux-source-name]");
  const clearButton = root?.querySelector("[data-playflux-source-clear]");
  if (!preview) return;
  let objectUrls = [];
  try {
    objectUrls = JSON.parse(preview.dataset.objectUrls || "[]");
  } catch (error) {
    objectUrls = [];
  }
  objectUrls.forEach((url) => URL.revokeObjectURL(url));
  preview.dataset.objectUrls = "[]";
  if (!selected.length) {
    preview.innerHTML = `<i data-lucide="image-up"></i>`;
    if (label) label.textContent = "Upload local image";
    if (clearButton) clearButton.hidden = true;
    refreshIcons();
    return;
  }
  const urls = selected.slice(0, 4).map((file) => URL.createObjectURL(file));
  preview.dataset.objectUrls = JSON.stringify(urls);
  preview.innerHTML = `
    <span class="playflux-source-stack is-count-${Math.min(urls.length, 4)}">
      ${urls.map((url) => `<img src="${escapeHtml(url)}" alt="" />`).join("")}
    </span>
  `;
  if (label) label.textContent = selected.length === 1 ? (selected[0].name || "Local image") : `${selected.length} local images`;
  if (clearButton) clearButton.hidden = false;
}

function cleanupPlayfluxTemplateSourcePreview(root) {
  const preview = root?.querySelector("[data-playflux-source-preview]");
  let objectUrls = [];
  try {
    objectUrls = JSON.parse(preview?.dataset.objectUrls || "[]");
  } catch (error) {
    objectUrls = [];
  }
  objectUrls.forEach((url) => URL.revokeObjectURL(url));
}

function playfluxTemplateStatus(root, message = "") {
  const status = root?.querySelector("[data-playflux-template-status]");
  if (status) status.textContent = message;
}

function showPlayfluxSubmittedHistory(record = null) {
  const taskId = record?.taskId || "";
  if (record?.taskId) {
    state.historyRecords = [record, ...(state.historyRecords || []).filter((item) => item.taskId !== record.taskId)];
  }
  state.historyRecordsPage = 1;
  historyRecordsSignature = "";
  els.inlineDialog?.close("submitted");
  setTab("history");
  if ((state.historyRecords || []).length) {
    renderHistory((state.historyRecords || []).slice(0, state.historyRecordsLimit || 8));
  }
  loadHistory({ page: 1, refresh: true, silent: true }).catch(() => {});
  if (taskId) scheduleHistoryRefresh({ delayMs: 3000, force: true });
}

function playfluxTemplatePrompt(template = {}) {
  return "";
}

function playfluxNormalizeSeedanceMediaMode(mode = "") {
  if (typeof window.normalizeSeedanceMediaMode === "function") return window.normalizeSeedanceMediaMode(mode);
  const normalized = String(mode || "").trim().toLowerCase().replace(/[\s-]+/g, "_");
  if (["text", "t2v", "text_video", "text_to_video"].includes(normalized)) return "text_to_video";
  if (["image", "i2v", "first", "first_image", "first_frame", "image_to_video"].includes(normalized)) return "first_frame";
  if (["first_last", "first_last_frame", "first_and_last", "start_end", "last_frame"].includes(normalized)) return "first_last_frame";
  if (["reference", "references", "reference_images", "multi_reference"].includes(normalized)) return "reference_images";
  if (["reference_video", "video_reference", "video"].includes(normalized)) return "reference_video";
  return "text_to_video";
}

function playfluxSeedanceModeNeedsFirstFrame(mode = "") {
  if (typeof window.seedanceModeNeedsFirstFrame === "function") return window.seedanceModeNeedsFirstFrame(mode);
  return ["first_frame", "first_last_frame"].includes(playfluxNormalizeSeedanceMediaMode(mode));
}

function playfluxSeedanceModeNeedsReferenceImages(mode = "") {
  if (typeof window.seedanceModeNeedsReferenceImages === "function") return window.seedanceModeNeedsReferenceImages(mode);
  return playfluxNormalizeSeedanceMediaMode(mode) === "reference_images";
}

function playfluxSeedanceModeNeedsReferenceVideo(mode = "") {
  if (typeof window.seedanceModeNeedsReferenceVideo === "function") return window.seedanceModeNeedsReferenceVideo(mode);
  return playfluxNormalizeSeedanceMediaMode(mode) === "reference_video";
}

function playfluxTemplateVideoPrompt(template = {}, { usesReferenceVideo = false, hasSourceImage = false } = {}) {
  if (template.tab !== "video" || !usesReferenceVideo || !hasSourceImage) return "";
  return "将视频中的人物替换成图片中的人物。保持图片中人物的身份、脸部、发型、体型、肤色和服装特征，严格参考原视频的动作顺序、姿态变化、节奏、运镜、构图、场景、光线、剪辑、音频和时长。除人物身份替换外，不改变原视频内容，不添加文字、字幕、标志、水印或其他人物。";
}

function playfluxTemplateFromDialog(template = {}, root = null) {
  return template;
}

function playfluxTemplateShouldUsePreviewImageReference(template = {}, sourceImageCount = 0) {
  if (template.tab === "video" || !template.previewUrl) return false;
  if (sourceImageCount < 1) return false;
  const requiredCount = Number(template.sourceCount || 0);
  return requiredCount <= 1 && sourceImageCount <= 1;
}

function playfluxTemplateImagePrompt(template = {}, sourceImageCount = 0, previewImageUrl = "") {
  return "";
}

function playfluxTemplateEstimateCacheKey(template = {}, sourceMode = playfluxTemplateDefaultSourceMode(template)) {
  const provider = template.tab === "video" ? playfluxTemplateVideoProvider() : "wan27-image-edit";
  const usesReferenceVideo = provider === "seedance" && playfluxSeedanceModeNeedsReferenceVideo(sourceMode);
  return [
    provider,
    template.id || "",
    template.tab || "",
    sourceMode || "",
    playfluxTemplateOutputDuration(template, provider),
    template.resolution || "720p",
    template.ratio || "9:16",
    usesReferenceVideo ? Number(template.referenceVideoDurationSeconds || template.duration || 5) : 0,
    Number(state.user?.pricingMultiplier || 1),
  ].join("|");
}

function playfluxTemplateCachedEstimate(template = {}, sourceMode = playfluxTemplateDefaultSourceMode(template)) {
  const key = playfluxTemplateEstimateCacheKey(template, sourceMode);
  return state.playfluxTemplateEstimates?.[key] || null;
}

function playfluxTemplateVideoInputSeconds(template = {}, sourceMode = playfluxTemplateDefaultSourceMode(template), duration = Number(template.duration || 5)) {
  const provider = playfluxTemplateVideoProvider();
  if (provider === "seedance" && !playfluxSeedanceModeNeedsReferenceVideo(sourceMode)) return 0;
  const cached = playfluxTemplateCachedEstimate(template, sourceMode);
  const seconds = Number(cached?.videoInputSeconds || template.referenceVideoDurationSeconds || duration);
  return provider === "wan27" ? Math.min(duration, seconds) : seconds;
}

function playfluxTemplateCostLabel(template = {}, sourceMode = playfluxTemplateDefaultSourceMode(template)) {
  if (template.tab === "video") {
    const provider = playfluxTemplateVideoProvider();
    const duration = playfluxTemplateOutputDuration(template, provider);
    const resolution = template.resolution || "720p";
    const ratio = template.ratio || "9:16";
    const cached = playfluxTemplateCachedEstimate(template, sourceMode);
    const pricing = cached || advancedPricing(duration, provider, resolution, ratio, {
      seedanceTier: "standard",
      inputVideoSeconds: playfluxTemplateVideoInputSeconds(template, sourceMode, duration),
      videoCapability: playfluxTemplateVideoCapability(provider),
    });
    return t("cost.credits", { credits: formatCredits(pricing.credits) });
  }
  return assetImageModifyCostLabel();
}

function renderPlayfluxTemplateCost(root, template = {}, sourceMode = playfluxTemplateDefaultSourceMode(template)) {
  const label = playfluxTemplateCostLabel(template, sourceMode);
  root?.querySelectorAll("[data-playflux-template-cost]").forEach((item) => {
    item.textContent = label;
  });
  if (els.inlineDialogConfirm && root && els.inlineDialogBody?.contains(root)) {
    els.inlineDialogConfirm.innerHTML = `<i data-lucide="sparkles"></i>${escapeHtml(t("template.generate", { cost: label }))}`;
    refreshIcons();
  }
}

async function refreshPlayfluxTemplateCost(root, template = {}, sourceMode = "") {
  const mode = sourceMode || root?.querySelector("[data-playflux-source-mode].is-active")?.dataset.playfluxSourceMode || playfluxTemplateDefaultSourceMode(template);
  renderPlayfluxTemplateCost(root, template, mode);
  if (!state.user || template.tab !== "video") return;
  state.playfluxTemplateEstimates = state.playfluxTemplateEstimates || {};
  const key = playfluxTemplateEstimateCacheKey(template, mode);
  if (state.playfluxTemplateEstimates[key]) {
    renderPlayfluxTemplateCost(root, template, mode);
    return;
  }
  const provider = playfluxTemplateVideoProvider();
  const duration = playfluxTemplateOutputDuration(template, provider);
  const resolution = template.resolution || "720p";
  const ratio = normalizeVideoRatio(template.ratio || "9:16");
    const usesReferenceVideo = provider !== "seedance" || playfluxSeedanceModeNeedsReferenceVideo(mode);
  try {
    const payload = await requestJson("/api/advanced/estimate", {
      method: "POST",
      body: {
        provider,
        ...(provider === "seedance"
          ? { seedanceTier: "standard" }
          : {
              videoCapability: playfluxTemplateVideoCapability(provider),
            }),
        templateId: template.id || "",
        duration,
        resolution,
        ratio,
        inputVideoSeconds: usesReferenceVideo ? playfluxTemplateVideoInputSeconds(template, mode, duration) : 0,
        params: {
          source: "playflux",
          templateTab: "video",
        },
      },
    });
    const pricing = payload.pricing || payload.estimate || null;
    if (!pricing) return;
    state.playfluxTemplateEstimates[key] = pricing;
    if (Number(pricing.videoInputSeconds || 0) > 0) template.referenceVideoDurationSeconds = Number(pricing.videoInputSeconds || 0);
    renderPlayfluxTemplateCost(root, template, mode);
  } catch (error) {
    console.warn("playflux estimate failed", error);
  }
}

function playfluxTemplateAbsoluteUrl(value = "") {
  const text = String(value || "").trim();
  if (!text) return "";
  try {
    return new URL(text, window.location.origin).toString();
  } catch (error) {
    return text;
  }
}

function playfluxTemplateRecordBase(template = {}, taskId = "", provider = "seedance", options = {}) {
  return {
    taskId,
    status: "submitting",
    model: isTenantTool("video") && template.tab === "video"
      ? "Video"
      : provider === "seedance" ? "Seedance" : provider === "happyhorse" ? "HappyHorse" : (provider === "wan27" ? "Wan 2.7" : "Wan 2.7 Image"),
    provider,
    source: "playflux-template",
    kind: template.tab === "video" ? "advanced-video" : "asset-image",
    params: {
      createKind: template.tab === "video" ? "video" : "image",
      createMode: template.tab === "video" ? "playflux-video" : (template.createMode || (template.sourceRequired ? "image-edit" : "image-create")),
      templateId: template.id || "",
      templateTitle: localizedTemplateTitle(template),
      templateTab: template.tab || "",
      sourceCount: Number(template.sourceCount || 0),
      animeBaseStyleLabel: template.animeBaseStyleLabel || "",
      source: "playflux",
    },
    ratio: template.ratio || "9:16",
    resolution: template.resolution || (template.tab === "video" ? "720p" : "1K"),
    duration: template.tab === "video" ? Number(template.duration || 5) : undefined,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

async function uploadPlayfluxTemplateImageAsset(file) {
  const dataUrl = await readFileAsDataUrl(file);
  const payload = await requestJson("/api/user-assets", {
    method: "POST",
    body: {
      dataUrl,
      name: file.name || "Template source image",
      fileName: file.name || "template-source.png",
    },
  });
  const asset = payload.asset || null;
  if (asset?.id) {
    state.advancedAssets = [asset, ...(state.advancedAssets || []).filter((item) => item.id !== asset.id)];
    state.userAssets = [asset, ...(state.userAssets || []).filter((item) => item.id !== asset.id)];
  }
  return { asset, dataUrl };
}

async function uploadPlayfluxTemplateImageAssets(files = []) {
  const uploaded = [];
  for (const file of files) {
    uploaded.push(await uploadPlayfluxTemplateImageAsset(file));
  }
  return uploaded;
}

async function submitPlayfluxTemplate(template = {}, root) {
  if (!state.user) {
    openLogin();
    throw new Error("Log in first.");
  }
  const effectiveTemplate = playfluxTemplateFromDialog(template, root);
  const files = playfluxTemplateSelectedSources(root);
  const requiredSourceCount = playfluxTemplateRequiredSourceCount(effectiveTemplate);
  if (files.length < requiredSourceCount) {
    throw new Error(requiredSourceCount > 1 ? `Upload ${requiredSourceCount} local images first.` : "Upload a local image first.");
  }
  if (files.some((file) => !String(file.type || "").startsWith("image/"))) throw new Error("Please upload image files only.");
  playfluxTemplateStatus(root, "Submitting...");
  const isVideo = effectiveTemplate.tab === "video";
  const isAnime = effectiveTemplate.tab === "anime";
  const provider = isVideo ? playfluxTemplateVideoProvider() : "wan27-image-edit";
  const selectedVideoSourceMode = isVideo
    ? (provider !== "seedance"
        ? "reference_video"
        : playfluxNormalizeSeedanceMediaMode(root.querySelector("[data-playflux-source-mode].is-active")?.dataset.playfluxSourceMode || effectiveTemplate.seedanceMode || "reference_images"))
    : "";
  const pendingTaskId = `pending-playflux-${Date.now().toString(36)}`;
  mergeAdvancedResultRecord(playfluxTemplateRecordBase(effectiveTemplate, pendingTaskId, provider));
  state.advancedResultTaskId = pendingTaskId;
  renderAdvancedResultPanel();
  try {
    if (isVideo) {
      const file = files[0] || null;
      const dataUrl = file ? await readFileAsDataUrl(file) : "";
      const sourceMode = selectedVideoSourceMode;
      const duration = playfluxTemplateOutputDuration(effectiveTemplate, provider);
      const resolution = effectiveTemplate.resolution || "720p";
      const ratio = normalizeVideoRatio(effectiveTemplate.ratio || "9:16");
      const reference = dataUrl ? { dataUrl, fileName: file.name || "", name: file.name || "Template source image" } : null;
      const usesReferenceVideo = playfluxSeedanceModeNeedsReferenceVideo(sourceMode);
      const referenceVideoSeconds = playfluxTemplateVideoInputSeconds(effectiveTemplate, sourceMode, duration);
      const recordBase = playfluxTemplateRecordBase(effectiveTemplate, "", provider);
      const generateBody = provider === "wan30"
        ? {
            provider,
            templateId: effectiveTemplate.id || "",
            videoCapability: PLAYFLUX_WAN_VIDEO_CAPABILITY,
            mediaMode: "multimodal",
            referenceImages: reference ? [reference] : [],
            referenceVideoUrls: [playfluxTemplateAbsoluteUrl(effectiveTemplate.referenceVideoUrl || effectiveTemplate.previewUrl || "")].filter(Boolean),
            ratio,
            resolution,
            duration,
            inputVideoSeconds: referenceVideoSeconds,
            referenceVideoDurationSeconds: referenceVideoSeconds,
            generateAudio: true,
            params: { ...recordBase.params },
          }
        : provider === "wan27"
        ? {
            provider,
            templateId: effectiveTemplate.id || "",
            videoCapability: PLAYFLUX_WAN27_VIDEO_EDIT_CAPABILITY,
            prompt: playfluxTemplateVideoPrompt(effectiveTemplate, { usesReferenceVideo: true, hasSourceImage: Boolean(reference) }),
            referenceImages: reference ? [reference] : [],
            videoUrl: playfluxTemplateAbsoluteUrl(effectiveTemplate.referenceVideoUrl || effectiveTemplate.previewUrl || ""),
            ratio,
            resolution,
            duration,
            inputVideoSeconds: referenceVideoSeconds,
            followInputDuration: true,
            params: { ...recordBase.params },
          }
        : provider === "happyhorse"
        ? {
            provider,
            templateId: effectiveTemplate.id || "",
            videoCapability: "happyhorse-video-edit",
            referenceImages: reference ? [reference] : [],
            videoUrl: playfluxTemplateAbsoluteUrl(effectiveTemplate.referenceVideoUrl || effectiveTemplate.previewUrl || ""),
            ratio,
            resolution,
            duration,
            inputVideoSeconds: referenceVideoSeconds,
            params: { ...recordBase.params },
          }
        : {
            provider,
            seedanceTier: "standard",
            templateId: effectiveTemplate.id || "",
            seedanceMode: sourceMode,
            referenceImages: (playfluxSeedanceModeNeedsReferenceImages(sourceMode) || usesReferenceVideo) && reference ? [seedanceImageRefPayload(reference)] : undefined,
            referenceVideoUrls: usesReferenceVideo
              ? [effectiveTemplate.referenceVideoUrl || effectiveTemplate.previewUrl || ""].filter(Boolean)
              : undefined,
            firstFrameDataUrl: playfluxSeedanceModeNeedsFirstFrame(sourceMode) && reference ? dataUrl : undefined,
            firstFrameUrl: "",
            ratio,
            resolution,
            duration,
            inputVideoSeconds: referenceVideoSeconds,
            referenceVideoDurationSeconds: referenceVideoSeconds,
            params: { ...recordBase.params },
          };
      const payload = await requestJson("/api/advanced/generate", {
        method: "POST",
        body: generateBody,
      });
      if (payload.user) setUser(payload.user);
      state.advancedResultRecords = (state.advancedResultRecords || []).filter((record) => record.taskId !== pendingTaskId);
      const taskId = payload.taskId || payload.task?.taskId || payload.record?.taskId || "";
      if (payload.record) {
        state.historyRecords = [payload.record, ...(state.historyRecords || []).filter((record) => record.taskId !== payload.record.taskId)];
        mergeAdvancedResultRecord(payload.record);
      } else if (taskId) {
        mergeAdvancedResultRecord({
          ...playfluxTemplateRecordBase(effectiveTemplate, taskId, provider),
          status: payload.task?.status || "submitted",
          updatedAt: new Date().toISOString(),
        });
      }
      state.advancedResultTaskId = taskId || payload.record?.taskId || "";
      playfluxTemplateStatus(root, "Submitted.");
      if (state.advancedResultTaskId) scheduleAdvancedResultRefresh({ delayMs: 1200, force: true });
      showPlayfluxSubmittedHistory(payload.record || (taskId ? {
        ...playfluxTemplateRecordBase(effectiveTemplate, taskId, provider),
        status: payload.task?.status || "submitted",
        updatedAt: new Date().toISOString(),
      } : null));
      return;
    }

    if (isAnime) {
      const payload = await requestJson("/api/wan27/image-edit", {
        method: "POST",
        body: {
          templateId: effectiveTemplate.id || "",
          imageAssetIds: [],
          imageUrls: [],
          ratio: effectiveTemplate.ratio || "9:16",
          resolution: effectiveTemplate.resolution || "1K",
          params: {
            ...playfluxTemplateRecordBase(effectiveTemplate, "", provider).params,
            createMode: "anime-text-image",
            animeBaseStyleLabel: effectiveTemplate.animeBaseStyleLabel || "Nova Anime XL",
          },
          async: true,
        },
      });
      if (payload.user) setUser(payload.user);
      state.advancedResultRecords = (state.advancedResultRecords || []).filter((record) => record.taskId !== pendingTaskId);
      if (payload.record) {
        state.historyRecords = [payload.record, ...(state.historyRecords || []).filter((record) => record.taskId !== payload.record.taskId)];
        mergeAdvancedResultRecord(payload.record);
      }
      state.advancedResultTaskId = payload.taskId || payload.record?.taskId || "";
      playfluxTemplateStatus(root, "Submitted.");
      if (state.advancedResultTaskId) scheduleAdvancedResultRefresh({ delayMs: 1200, force: true });
      showPlayfluxSubmittedHistory(payload.record || (state.advancedResultTaskId ? {
        ...playfluxTemplateRecordBase(effectiveTemplate, state.advancedResultTaskId, provider),
        status: payload.task?.status || "submitted",
        updatedAt: new Date().toISOString(),
      } : null));
      return;
    }

    const uploaded = await uploadPlayfluxTemplateImageAssets(files);
    const payload = await requestJson("/api/wan27/image-edit", {
      method: "POST",
      body: {
        templateId: effectiveTemplate.id || "",
        imageAssetIds: uploaded.map((item) => item.asset?.id).filter(Boolean),
        imageUrls: [],
        ratio: effectiveTemplate.ratio || "9:16",
        resolution: effectiveTemplate.resolution || "1K",
        params: {
          ...playfluxTemplateRecordBase(effectiveTemplate, "", provider).params,
        },
        async: true,
      },
    });
    if (payload.user) setUser(payload.user);
    state.advancedResultRecords = (state.advancedResultRecords || []).filter((record) => record.taskId !== pendingTaskId);
    if (payload.record) {
      state.historyRecords = [payload.record, ...(state.historyRecords || []).filter((record) => record.taskId !== payload.record.taskId)];
      mergeAdvancedResultRecord(payload.record);
    }
    state.advancedResultTaskId = payload.taskId || payload.record?.taskId || "";
    playfluxTemplateStatus(root, "Submitted.");
    if (state.advancedResultTaskId) scheduleAdvancedResultRefresh({ delayMs: 1200, force: true });
    showPlayfluxSubmittedHistory(payload.record || (state.advancedResultTaskId ? {
      ...playfluxTemplateRecordBase(effectiveTemplate, state.advancedResultTaskId, provider),
      status: payload.task?.status || "submitted",
      updatedAt: new Date().toISOString(),
    } : null));
  } catch (error) {
    state.advancedResultRecords = (state.advancedResultRecords || []).map((record) => (
      record.taskId === pendingTaskId
        ? { ...record, status: "failed", error: error.message || String(error), updatedAt: new Date().toISOString() }
        : record
    ));
    if (state.advancedResultTaskId === pendingTaskId) state.advancedResultTaskId = "";
    renderAdvancedResultPanel();
    throw error;
  }
}

function openPlayfluxTemplateDialog(templateId = "") {
  const template = playfluxTemplateById(templateId);
  if (!template) return;
  const tab = playfluxTemplateTabMeta(template.tab);
  const isAnime = template.tab === "anime";
  const needsSource = playfluxTemplateNeedsSource(template);
  const requiredSourceCount = playfluxTemplateRequiredSourceCount(template);
  const sourceHint = requiredSourceCount > 1 ? `Required: ${requiredSourceCount} images` : (needsSource ? "Required" : "Optional");
  const title = localizedTemplateTitle(template);
  showInlineDialog({
    title,
    body: `
      <div class="playflux-template-dialog">
        <div class="playflux-template-kicker"><i data-lucide="${escapeHtml(tab.icon)}"></i>${escapeHtml(tab.label)}</div>
        ${isAnime ? playfluxTemplateAnimePanel(template) : `
          <div class="playflux-template-flow">
            <div class="playflux-source-panel">
              <input id="playfluxTemplateImageInput" type="file" accept="image/*" ${template.tab === "video" ? "" : "multiple"} hidden />
              <button class="playflux-local-source" type="button" data-playflux-template-upload="${escapeHtml(template.id || "")}">
                <span class="playflux-local-source-media" data-playflux-source-preview><i data-lucide="image-up"></i></span>
                <strong data-playflux-source-name>Upload local image</strong>
                <small>${escapeHtml(sourceHint)}</small>
              </button>
              <button class="ghost-button playflux-source-clear" type="button" data-playflux-source-clear hidden>Remove</button>
            </div>
            <span class="playflux-flow-arrow"><i data-lucide="arrow-right"></i></span>
            <button class="playflux-preview-panel" type="button" data-playflux-template-preview="${escapeHtml(template.id || "")}">
              ${playfluxTemplateDialogMedia(template)}
              <span>Preview</span>
            </button>
          </div>
        `}
        ${false && !isAnime && template.previewType === "video" ? `
          <div class="playflux-source-modes" aria-label="Seedance source mode">
            ${[
              { id: "reference_video", label: "Preview video" },
              { id: "reference_images", label: "Image only" },
              { id: "first_frame", label: "First frame" },
            ].map((mode) => `
              <button class="${playfluxTemplateDefaultSourceMode(template) === mode.id ? "is-active" : ""}" type="button" data-playflux-source-mode="${escapeHtml(mode.id)}">
                ${escapeHtml(mode.label)}
              </button>
            `).join("")}
          </div>
        ` : ""}
        ${playfluxTemplatePromptBlock(template)}
        <p class="job-note" data-playflux-template-status></p>
      </div>
    `,
    confirmText: "Generate",
    dialogClass: "is-media-action is-playflux-template",
    keepOpenOnConfirm: true,
    onOpen: (root) => {
      if (!isAnime) updatePlayfluxTemplateSourcePreview(root, null);
      root.querySelectorAll("[data-playflux-source-mode]").forEach((button) => {
        button.addEventListener("click", () => {
          root.querySelectorAll("[data-playflux-source-mode]").forEach((item) => item.classList.remove("is-active"));
          button.classList.add("is-active");
          refreshPlayfluxTemplateCost(root, template, button.dataset.playfluxSourceMode || "");
        });
      });
      refreshPlayfluxTemplateCost(root, template);
      root.querySelector("[data-playflux-template-preview]")?.addEventListener("click", () => {
        if (template.previewType === "video") playPreview({ title, previewUrl: template.previewUrl, ratio: template.ratio || "9:16" });
        else previewImage({ title, imageUrl: template.previewUrl });
      });
      root.querySelector("[data-playflux-template-upload]")?.addEventListener("click", () => {
        root.querySelector("#playfluxTemplateImageInput")?.click();
      });
      root.querySelector("#playfluxTemplateImageInput")?.addEventListener("change", () => {
        updatePlayfluxTemplateSourcePreview(root, playfluxTemplateSelectedSources(root));
        playfluxTemplateStatus(root, "");
      });
      root.querySelector("[data-playflux-source-clear]")?.addEventListener("click", () => {
        const input = root.querySelector("#playfluxTemplateImageInput");
        if (input) input.value = "";
        updatePlayfluxTemplateSourcePreview(root, null);
        playfluxTemplateStatus(root, "");
      });
    },
    onConfirm: async (root) => {
      await submitPlayfluxTemplate(template, root);
    },
  });
}

function applyPlayfluxTemplateToCreate(template = {}, { openCharacter = false, openUpload = false, sourceMode = "" } = {}) {
  if (!template?.id) return;
  state.activeTemplate = null;
  state.activeAdvancedCaseId = "";
  state.advancedSelectedPresets = {};
  state.advancedReferenceImages = [];
  state.advancedUploadDataUrl = "";
  state.advancedSourceImageAssetId = "";
  state.advancedFirstFrameAssetId = "";
  state.advancedSeedanceVideoAssetId = "";
  state.advancedSeedanceVideoPreviewUrl = "";
  const videoProvider = playfluxTemplateVideoProvider();
  if (template.tab === "video") {
    state.advancedCreateKind = "video";
    state.advancedCreateMode = "video-image";
    if (els.advancedProvider) els.advancedProvider.value = videoProvider;
    if (videoProvider === "wan27") {
      if (els.advancedWanMediaMode) els.advancedWanMediaMode.value = "first_frame";
    } else if (videoProvider === "seedance" && els.advancedSeedanceMediaMode) {
      els.advancedSeedanceMediaMode.value = playfluxNormalizeSeedanceMediaMode(sourceMode || template.seedanceMode || "reference_images");
    }
    if (els.advancedDuration) els.advancedDuration.value = String(template.duration || 5);
    if (els.advancedResolution) els.advancedResolution.value = template.resolution || "720p";
    if (els.advancedRatio) els.advancedRatio.value = normalizeVideoRatio(template.ratio || "9:16");
    if (els.advancedSeedanceTier) els.advancedSeedanceTier.value = "standard";
  } else {
    state.advancedCreateKind = "image";
    state.advancedCreateMode = template.createMode || (template.sourceRequired ? "image-edit" : "image-create");
    if (els.advancedProvider) els.advancedProvider.value = "wan27-image-edit";
    if (els.advancedResolution) els.advancedResolution.value = "1K";
    if (els.advancedRatio) els.advancedRatio.value = "9:16";
  }
  if (els.advancedPrompt) els.advancedPrompt.value = template.prompt || "";
  setTab("advanced");
  updateAdvancedModelControls();
  updateAdvancedButtonCost();
  setAdvancedSideTab("assets");
  if (els.advancedNote) {
    els.advancedNote.textContent = template.sourceRequired || template.tab === "video"
      ? "Template loaded. Add a source image or character before generating."
      : "Template loaded. Review the prompt, then generate.";
  }
  if (openCharacter) {
    window.setTimeout(() => openAdvancedPresetDialog("character"), 120);
  } else if (openUpload) {
    triggerAdvancedLocalImageUpload({
      sourceMode: videoProvider === "seedance" ? (sourceMode === "first_last_frame" ? "first_last_frame" : "reference_images") : "reference_video",
    });
  }
}

function normalizeCharacterPanelTab(value = "") {
  return String(value || "").trim().toLowerCase() === "list" ? "list" : "create";
}

function renderCharacterPageTabs() {
  if (!els.characterPageTabs) return;
  const activeTab = normalizeCharacterPanelTab(state.characterPanelTab);
  const tabs = [
    { id: "create", label: t("characters.createTab"), icon: "sparkles" },
    { id: "list", label: t("characters.listTab"), icon: "images", count: customCharacterItems().length },
  ];
  els.characterPageTabs.innerHTML = tabs.map((tab) => `
    <button class="gallery-mode-tab ${activeTab === tab.id ? "is-active" : ""}" data-character-panel-tab="${escapeHtml(tab.id)}" type="button">
      <i data-lucide="${escapeHtml(tab.icon)}"></i>${escapeHtml(tab.label)}${tab.count === undefined ? "" : `<span>${escapeHtml(String(tab.count))}</span>`}
    </button>
  `).join("");
  els.characterPageTabs.querySelectorAll("[data-character-panel-tab]").forEach((button) => {
    button.addEventListener("click", () => {
      const nextTab = normalizeCharacterPanelTab(button.dataset.characterPanelTab || "create");
      state.characterPanelTab = nextTab;
      if (nextTab === "create") {
        state.routeCharacterId = "";
        state.routeCharacterSource = "";
        state.activeGalleryCharacterId = "";
        replacePlatformUrlForCharacter("", "", "characters");
      }
      renderCharactersPanel();
      if (nextTab === "list" && state.user) loadMyCharacters({ silent: true }).catch(() => {});
    });
  });
}

function renderCharactersPanel({ forceCreator = false } = {}) {
  if (state.routeCharacterId || state.activeGalleryCharacterId) state.characterPanelTab = "list";
  state.characterPanelTab = normalizeCharacterPanelTab(state.characterPanelTab);
  renderCharacterPageTabs();
  const showCreate = state.characterPanelTab === "create";
  if (els.characterCreatorCard) els.characterCreatorCard.hidden = !showCreate;
  if (els.characterListPanel) els.characterListPanel.hidden = showCreate;
  if (showCreate) {
    bindCharacterCreator({ force: forceCreator });
  } else {
    renderGalleryCharacters(els.characterGrid);
  }
  refreshIcons();
}

function renderGalleryCharacters(root = els.templateGrid) {
  if (!root) return;
  const myCharactersOnly = root === els.characterGrid;
  if (myCharactersOnly) {
    state.characterSource = "custom";
    if (els.characterSourceTabs) {
      els.characterSourceTabs.innerHTML = "";
      els.characterSourceTabs.hidden = true;
    }
  } else {
    renderCharacterSourceTabs();
  }
  const source = myCharactersOnly || state.characterSource === "custom" ? "custom" : "system";
  const characters = source === "custom" ? customCharacterItems() : state.homeCharacters.filter((item) => item && !item.deletedAt);
  if (!state.config && source === "system") {
    root.className = "template-grid character-grid character-grid-main";
    root.innerHTML = "";
    return;
  }
  if (source === "custom" && state.user && !state.myCharactersLoaded) {
    root.className = "template-grid character-grid character-grid-main";
    root.innerHTML = "";
    return;
  }
  const activeCharacter = state.activeGalleryCharacterId
    ? characters.find((item) => String(item.id || "") === String(state.activeGalleryCharacterId || ""))
    : null;
  if (activeCharacter) {
    renderGalleryCharacterDetail(activeCharacter, root);
    return;
  }
  if (
    state.routeCharacterId &&
    String(state.routeCharacterId) === String(state.activeGalleryCharacterId || "") &&
    source === "custom" &&
    state.user &&
    !state.myCharactersLoaded
  ) {
    root.className = "template-grid character-grid character-grid-main";
    root.innerHTML = `<div class="job-note character-filter-empty">Loading character...</div>`;
    return;
  }
  state.activeGalleryCharacterId = "";
  root.className = "template-grid character-grid character-grid-main";
  const filteredCharacters = filterGalleryCharacters(characters);
  const filterBar = source === "system" ? renderCharacterFilterBar(characters, filteredCharacters.length) : "";
  const serverTotal = source === "system" ? Math.max(Number(state.homeCharactersTotal || 0), filteredCharacters.length) : filteredCharacters.length;
  const emptyMessage = !state.user && source === "custom"
    ? t("characters.customLogin")
    : characters.length && !filteredCharacters.length
    ? "No characters match these filters."
    : source === "custom" ? t("characters.customEmpty") : t("gallery.character.empty");
  const visibleCount = source === "system"
    ? filteredCharacters.length
    : Math.max(CHARACTER_PAGE_SIZE, Number(state.visibleCharacterCount || CHARACTER_PAGE_SIZE));
  const visibleCharacters = source === "system" ? filteredCharacters : filteredCharacters.slice(0, visibleCount);
  root.innerHTML = `${filterBar}${
    visibleCharacters.length
      ? `${visibleCharacters.map((item, index) => renderGalleryCharacterCard(item, index)).join("")}${renderCharacterLoadMore(visibleCharacters.length, serverTotal, source)}`
      : `<div class="job-note character-filter-empty">${escapeHtml(emptyMessage)}</div>`
  }`;
  bindCharacterFilterActions(root);
  bindCharacterLoadMore(root, serverTotal, source);
  bindGalleryImageFallbacks(root);
  bindGalleryCharacterCards(root);
  refreshIcons();
}

function resetCharacterPagination() {
  state.visibleCharacterCount = CHARACTER_PAGE_SIZE;
  if (state.characterLoadObserver) {
    state.characterLoadObserver.disconnect();
    state.characterLoadObserver = null;
  }
}

function renderCharacterLoadMore(visibleCount = 0, totalCount = 0, source = "system") {
  if (!totalCount || visibleCount >= totalCount) return "";
  const loading = source === "system" && state.homeCharactersLoadingMore;
  return `
    <div class="character-load-more" data-character-load-more>
      <span>${escapeHtml(String(visibleCount))} / ${escapeHtml(String(totalCount))} characters</span>
      <button class="ghost-button" data-character-load-more-button type="button" ${loading ? "disabled" : ""}><i data-lucide="${loading ? "loader-circle" : "chevrons-down"}"></i>${loading ? "Loading" : "Load more"}</button>
      <i class="character-load-sentinel" data-character-load-sentinel aria-hidden="true"></i>
    </div>
  `;
}

function bindCharacterLoadMore(root = els.templateGrid, totalCount = 0, source = "system") {
  if (state.characterLoadObserver) {
    state.characterLoadObserver.disconnect();
    state.characterLoadObserver = null;
  }
  const loadMore = async () => {
    if (source === "system") {
      if (state.homeCharactersLoadingMore || state.homeCharacters.length >= totalCount) return;
      await loadMoreHomeCharacters();
      renderGalleryCharacters(root);
      return;
    }
    if (Number(state.visibleCharacterCount || CHARACTER_PAGE_SIZE) >= totalCount) return;
    state.visibleCharacterCount = Number(state.visibleCharacterCount || CHARACTER_PAGE_SIZE) + CHARACTER_PAGE_SIZE;
    renderGalleryCharacters(root);
  };
  root.querySelector("[data-character-load-more-button]")?.addEventListener("click", () => loadMore().catch((error) => console.warn("load more characters failed", error.message || error)));
  const sentinel = root.querySelector("[data-character-load-sentinel]");
  if (!sentinel) return;
  if (!("IntersectionObserver" in window)) return;
  state.characterLoadObserver = new IntersectionObserver((entries) => {
    if (entries.some((entry) => entry.isIntersecting)) loadMore().catch((error) => console.warn("load more characters failed", error.message || error));
  }, { rootMargin: "220px 0px", threshold: 0.01 });
  state.characterLoadObserver.observe(sentinel);
}

function bindGalleryCharacterCards(root = els.templateGrid) {
  if (!root) return;
  root.querySelectorAll("[data-character-refresh]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      refreshMyCharacterImage(button.dataset.characterRefresh || "", { render: true }).catch((error) => {
        if (els.characterCreateStatus) els.characterCreateStatus.textContent = error.message || String(error);
      });
    });
  });
  root.querySelectorAll("[data-character-alive]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      useHomeCharacter(button.dataset.characterAlive || "");
    });
  });
  root.querySelectorAll("[data-character-alive-picker]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      openCharacterAliveQuickGenerateDialog(button.dataset.characterAlivePicker || "");
    });
  });
  root.querySelectorAll("[data-character-use]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      useHomeCharacter(button.dataset.characterUse);
    });
  });
  root.querySelectorAll("[data-character-cases]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      openGalleryCharacter(button.dataset.characterCases);
    });
  });
  root.querySelectorAll("[data-character-takeoff]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      openSystemCharacterTakeOffDialog(button.dataset.characterTakeoff);
    });
  });
  root.querySelectorAll("[data-character-modify]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      openSystemCharacterModifyDialog(button.dataset.characterModify);
    });
  });
  root.querySelectorAll("[data-character-delete]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      deleteCustomCharacter(button.dataset.characterDelete || "", button);
    });
  });
  root.querySelectorAll("[data-character-id]").forEach((card) => {
    card.addEventListener("click", (event) => {
      if (isInteractiveTarget(event.target)) return;
      openGalleryCharacter(card.dataset.characterId);
    });
  });
}

function characterUsableImage(item = {}) {
  return characterAppearanceImageUrl(item);
}

function characterAppearanceImageUrl(item = {}) {
  return uniqueTruthy([
    item.characterImageUrl,
    item.referenceImageUrl,
    item.sourceImageUrl,
    item.localImageUrl,
    item.syntheticReferenceLocalUrl,
    item.publicImageUrl,
    item.imageUrl,
    item.assetImageUrl,
    item.params?.characterImageUrl,
    item.params?.sourceImageUrl,
  ]).find((value) => !isVideoMediaUrl(value) && !isGenericCharacterPoster(value)) || "";
}

function isMyCharacterGenerating(item = {}) {
  const status = String(item.status || "").toLowerCase();
  return Boolean(item.myCharacter && (status.includes("generating") || status.includes("submitted") || status.includes("pending") || status.includes("processing")));
}

function myCharacterStatusLabel(item = {}) {
  const status = String(item.status || "").toLowerCase();
  if (status === "image_ready" || characterUsableImage(item)) return state.lang === "zh" ? "已生成" : "Ready";
  if (status === "image_failed" || status.includes("failed") || status.includes("error")) return state.lang === "zh" ? "失败" : "Failed";
  if (status.includes("generating") || status.includes("submitted") || status.includes("pending") || status.includes("processing")) return state.lang === "zh" ? "生成中" : "Generating";
  return item.status || (state.lang === "zh" ? "处理中" : "Processing");
}

function myCharacterToGalleryItem(character = {}) {
  const posterUrl = characterUsableImage(character);
  return {
    ...character,
    id: character.id,
    name: character.name || "My character",
    title: character.title || character.prompt || "",
    posterUrl,
    localImageUrl: character.localImageUrl || posterUrl,
    publicImageUrl: character.publicImageUrl || "",
    sourceImageUrl: character.sourceImageUrl || posterUrl,
    status: character.status || "",
    custom: true,
    myCharacter: true,
    videoCount: character.videoUrl ? 1 : 0,
    tags: [myCharacterStatusLabel(character)].filter(Boolean),
  };
}

function customCharacterItems() {
  const myCharacters = (state.myCharacters || [])
    .filter((character) => character && !character.deletedAt)
    .map(myCharacterToGalleryItem);
  const legacyAssets = (state.userAssets || [])
    .filter((asset) => asset?.kind === "image" && (asset.isCharacterAsset || String(asset.name || "").toLowerCase().includes("character")))
    .map((asset) => ({
      id: `custom:${asset.id}`,
      assetId: asset.id,
      name: asset.name || "Custom character",
      title: asset.characterPrompt || "",
      posterUrl: asset.previewUrl || asset.localUrl || asset.publicUrl || "",
      localImageUrl: asset.localUrl || asset.previewUrl || asset.publicUrl || "",
      publicImageUrl: asset.publicUrl || "",
      sourceImageUrl: asset.previewUrl || asset.localUrl || asset.publicUrl || "",
      status: "Ready",
      referenceState: "ready",
      custom: true,
      createdAt: asset.createdAt || "",
    }));
  return [...myCharacters, ...legacyAssets];
}

function compactNumber(value = 0) {
  const number = Number(value || 0);
  if (!Number.isFinite(number) || number <= 0) return "0";
  if (number >= 1000000) return `${(number / 1000000).toFixed(number >= 10000000 ? 0 : 1).replace(/\.0$/, "")}M`;
  if (number >= 1000) return `${(number / 1000).toFixed(number >= 10000 ? 0 : 1).replace(/\.0$/, "")}K`;
  return String(Math.round(number));
}

function characterTags(item = {}, limit = 3) {
  return (Array.isArray(item.tags) ? item.tags : [])
    .map((tag) => String(tag || "").trim())
    .filter(Boolean)
    .slice(0, limit);
}

function characterProfileLine(item = {}) {
  return uniqueTruthy([
    item.age ? `${item.age}` : "",
    item.gender,
    item.style,
  ]).join(" / ");
}

function normalizeCharacterFilterValue(value = "") {
  return String(value || "").trim().toLowerCase();
}

function characterTagSet(item = {}) {
  return new Set((Array.isArray(item.tags) ? item.tags : []).map(normalizeCharacterFilterValue).filter(Boolean));
}

function characterAgeBucket(item = {}) {
  const age = Number(item.age || 0);
  if (!Number.isFinite(age) || age <= 0) return "";
  if (age <= 24) return "18-24";
  if (age <= 34) return "25-34";
  return "35+";
}

function characterVideoCount(item = {}) {
  return Number(item.videoCount || characterAllVideos(item).length || 0);
}

function characterSearchText(item = {}) {
  return [
    item.id,
    item.name,
    item.title,
    item.description,
    item.gender,
    item.style,
    item.model,
    item.creatorUsername,
    ...(Array.isArray(item.tags) ? item.tags : []),
  ].map((value) => String(value || "")).join(" ").toLowerCase();
}

function characterMatchesFilters(item = {}) {
  const filters = state.characterFilters || {};
  const tagSet = characterTagSet(item);
  if (filters.tag && !tagSet.has(normalizeCharacterFilterValue(filters.tag))) return false;
  if (filters.gender && normalizeCharacterFilterValue(item.gender) !== normalizeCharacterFilterValue(filters.gender)) return false;
  if (filters.style && normalizeCharacterFilterValue(item.style) !== normalizeCharacterFilterValue(filters.style)) return false;
  if (filters.age && characterAgeBucket(item) !== filters.age) return false;
  if (filters.q && !characterSearchText(item).includes(normalizeCharacterFilterValue(filters.q))) return false;
  return true;
}

function sortGalleryCharacters(characters = []) {
  const sort = state.characterFilters?.sort || "recommended";
  return [...characters].sort((a, b) => {
    if (sort === "popular") return Number(b.likeCount || 0) - Number(a.likeCount || 0);
    if (sort === "videos") return characterVideoCount(b) - characterVideoCount(a);
    if (sort === "newest") return new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime();
    return 0;
  });
}

function filterGalleryCharacters(characters = []) {
  return sortGalleryCharacters(characters.filter(characterMatchesFilters));
}

function characterFilterOptions(characters = []) {
  const tagCounts = new Map();
  const genders = new Map();
  const styles = new Map();
  characters.forEach((item) => {
    if (item.gender) genders.set(String(item.gender), (genders.get(String(item.gender)) || 0) + 1);
    if (item.style) styles.set(String(item.style), (styles.get(String(item.style)) || 0) + 1);
    (Array.isArray(item.tags) ? item.tags : []).forEach((tag) => {
      const label = String(tag || "").trim();
      if (!label) return;
      const key = normalizeCharacterFilterValue(label);
      const current = tagCounts.get(key) || { label, count: 0 };
      current.count += 1;
      tagCounts.set(key, current);
    });
  });
  const tags = CHARACTER_FILTER_TAGS
    .map((label) => tagCounts.get(normalizeCharacterFilterValue(label)))
    .filter(Boolean);
  return {
    tags,
    genders: [...genders.entries()].map(([label, count]) => ({ label, count })).sort((a, b) => a.label.localeCompare(b.label)),
    styles: [...styles.entries()].map(([label, count]) => ({ label, count })).sort((a, b) => a.label.localeCompare(b.label)),
  };
}

function characterFilterButton({ type, value, label, active = false, count = null, icon = "" } = {}) {
  return `
    <button class="character-filter-chip ${active ? "is-active" : ""}" data-character-filter="${escapeHtml(type)}" data-character-filter-value="${escapeHtml(value)}" type="button">
      ${icon ? `<i data-lucide="${escapeHtml(icon)}"></i>` : ""}
      <span>${escapeHtml(label)}</span>
      ${count === null ? "" : `<small>${escapeHtml(String(count))}</small>`}
    </button>
  `;
}

function renderCharacterFilterBar(characters = [], filteredCount = 0) {
  const filters = state.characterFilters || {};
  const options = characterFilterOptions(characters);
  const sort = CHARACTER_SORT_OPTIONS.find((item) => item.id === filters.sort) || CHARACTER_SORT_OPTIONS[0];
  const activeTag = options.tags.find((item) => normalizeCharacterFilterValue(item.label) === normalizeCharacterFilterValue(filters.tag));
  const hasFilters = Boolean(filters.tag || filters.gender || filters.style || filters.age || filters.q || (filters.sort && filters.sort !== "recommended"));
  const hasAdvancedFilters = Boolean(filters.tag || filters.gender || filters.style || filters.age);
  const advancedOpen = Boolean(state.characterFiltersExpanded || hasAdvancedFilters);
  const tagButtons = [
    characterFilterButton({ type: "tag", value: "", label: "All", active: !filters.tag }),
    ...options.tags.map((tag) => characterFilterButton({
      type: "tag",
      value: tag.label,
      label: tag.label,
      active: normalizeCharacterFilterValue(filters.tag) === normalizeCharacterFilterValue(tag.label),
      count: tag.count,
    })),
  ].join("");
  const genderOptions = [
    characterFilterButton({ type: "gender", value: "", label: "Any gender", active: !filters.gender }),
    ...options.genders.map((item) => characterFilterButton({
      type: "gender",
      value: item.label,
      label: item.label,
      active: normalizeCharacterFilterValue(filters.gender) === normalizeCharacterFilterValue(item.label),
      count: item.count,
    })),
  ].join("");
  const styleOptions = [
    characterFilterButton({ type: "style", value: "", label: "Any style", active: !filters.style }),
    ...options.styles.map((item) => characterFilterButton({
      type: "style",
      value: item.label,
      label: item.label,
      active: normalizeCharacterFilterValue(filters.style) === normalizeCharacterFilterValue(item.label),
      count: item.count,
    })),
  ].join("");
  const ageOptions = [
    characterFilterButton({ type: "age", value: "", label: "Any age", active: !filters.age }),
    ...CHARACTER_AGE_FILTERS.map((item) => characterFilterButton({
      type: "age",
      value: item.id,
      label: item.label,
      active: filters.age === item.id,
    })),
  ].join("");
  return `
    <section class="character-filter-bar">
      <div class="character-filter-top">
        <div class="character-selected-filter ${activeTag ? "has-tag" : ""}">
          ${activeTag ? `<button class="character-selected-tag" data-character-filter="tag" data-character-filter-value="" type="button">${escapeHtml(activeTag.label)} <i data-lucide="x"></i></button>` : ""}
          <input id="characterFilterSearch" data-character-filter-search type="search" value="${escapeHtml(filters.q || "")}" placeholder="${escapeHtml(activeTag ? "Search within tag..." : "Search within all characters")}" autocomplete="off" />
        </div>
        <div class="character-sort-menu">
          <button class="character-filter-chip is-active" data-character-menu-toggle="sort" type="button">
            <span>${escapeHtml(sort.label)}</span><i data-lucide="chevron-down"></i>
          </button>
          <div class="character-filter-menu" data-character-menu="sort">
            ${CHARACTER_SORT_OPTIONS.map((item) => characterFilterButton({
              type: "sort",
              value: item.id,
              label: item.label,
              active: (filters.sort || "recommended") === item.id,
            })).join("")}
          </div>
        </div>
      </div>
      <div class="character-filter-summary">
        <span>${escapeHtml(String(filteredCount))} characters</span>
        <div class="character-filter-summary-actions">
          <button class="character-filter-clear" data-character-filter-clear type="button" ${hasFilters ? "" : "hidden"}>${escapeHtml(t("gallery.character.clearFilters"))}</button>
          <button class="character-filter-advanced-toggle ${advancedOpen ? "is-open" : ""}" data-character-filter-advanced-toggle type="button" aria-expanded="${advancedOpen ? "true" : "false"}">
            <i data-lucide="sliders-horizontal"></i><span>${escapeHtml(t(advancedOpen ? "gallery.character.hideFilters" : "gallery.character.advancedQuery"))}</span>
          </button>
        </div>
      </div>
      <div class="character-filter-advanced ${advancedOpen ? "is-open" : ""}" ${advancedOpen ? "" : "hidden"}>
        <div class="character-filter-dropdowns">
          <div class="character-sort-menu">
            <button class="character-filter-chip" data-character-menu-toggle="gender" type="button"><span>${escapeHtml(filters.gender || "Any gender")}</span><i data-lucide="chevron-down"></i></button>
            <div class="character-filter-menu" data-character-menu="gender">${genderOptions}</div>
          </div>
          <div class="character-sort-menu">
            <button class="character-filter-chip" data-character-menu-toggle="style" type="button"><span>${escapeHtml(filters.style || "Any style")}</span><i data-lucide="chevron-down"></i></button>
            <div class="character-filter-menu" data-character-menu="style">${styleOptions}</div>
          </div>
          <div class="character-sort-menu">
            <button class="character-filter-chip" data-character-menu-toggle="age" type="button"><span>${escapeHtml(filters.age || "Any age")}</span><i data-lucide="chevron-down"></i></button>
            <div class="character-filter-menu" data-character-menu="age">${ageOptions}</div>
          </div>
        </div>
        <div class="character-filter-tags">${tagButtons}</div>
      </div>
    </section>
  `;
}

function bindCharacterFilterActions(root = els.templateGrid) {
  if (!root) return;
  root.querySelectorAll("[data-character-menu-toggle]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      const menu = button.closest(".character-sort-menu")?.querySelector(".character-filter-menu");
      root.querySelectorAll(".character-filter-menu.is-open").forEach((openMenu) => {
        if (openMenu !== menu) openMenu.classList.remove("is-open");
      });
      menu?.classList.toggle("is-open");
    });
  });
  root.querySelectorAll("[data-character-filter]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      const type = button.dataset.characterFilter || "";
      const value = button.dataset.characterFilterValue || "";
      state.characterFilters = {
        ...(state.characterFilters || {}),
        [type]: value,
      };
      resetCharacterPagination();
      renderGalleryCharacters(root);
    });
  });
  root.querySelector("[data-character-filter-clear]")?.addEventListener("click", (event) => {
    event.stopPropagation();
    window.clearTimeout(state.characterFilterSearchTimer);
    state.characterFilters = { sort: "recommended", tag: "", gender: "", style: "", age: "", q: "" };
    state.characterFiltersExpanded = false;
    resetCharacterPagination();
    renderGalleryCharacters(root);
  });
  root.querySelector("[data-character-filter-advanced-toggle]")?.addEventListener("click", (event) => {
    event.stopPropagation();
    state.characterFiltersExpanded = !state.characterFiltersExpanded;
    renderGalleryCharacters(root);
  });
  root.querySelector("[data-character-filter-search]")?.addEventListener("input", (event) => {
    const value = event.currentTarget.value || "";
    state.characterFilters = {
      ...(state.characterFilters || {}),
      q: value,
    };
    window.clearTimeout(state.characterFilterSearchTimer);
    state.characterFilterSearchTimer = window.setTimeout(() => {
      resetCharacterPagination();
      renderGalleryCharacters(root);
      const nextInput = root.querySelector("[data-character-filter-search]");
      if (nextInput) {
        nextInput.focus();
        try {
          nextInput.setSelectionRange(value.length, value.length);
        } catch (error) {}
      }
    }, 260);
  });
}

function characterAllVideos(item = {}) {
  const sceneVideos = characterSceneVideos(item);
  const unlockVideos = characterUnlockVideos(item);
  if (sceneVideos.length || unlockVideos.length) return uniqueCharacterVideos([...sceneVideos, ...unlockVideos], { dedupeByUrl: false });
  return uniqueCharacterVideos([...characterRoleVideos(item), ...characterSceneVideos(item), ...characterUnlockVideos(item)], { dedupeByUrl: false });
}

function renderCharacterSourceTabs() {
  if (!els.characterSourceTabs) return;
  if (state.tab === "characters") {
    els.characterSourceTabs.innerHTML = "";
    els.characterSourceTabs.hidden = true;
    return;
  }
  const tabs = [
    { id: "system", label: t("characters.systemTab"), count: state.homeCharacters.filter((item) => item && !item.deletedAt).length },
    { id: "custom", label: t("characters.customTab"), count: customCharacterItems().length },
  ];
  els.characterSourceTabs.innerHTML = tabs.map((tab) => `
    <button class="gallery-mode-tab ${state.characterSource === tab.id ? "is-active" : ""}" data-character-source="${escapeHtml(tab.id)}" type="button">
      ${escapeHtml(tab.label)}<span>${escapeHtml(String(tab.count))}</span>
    </button>
  `).join("");
  els.characterSourceTabs.querySelectorAll("[data-character-source]").forEach((button) => {
    button.addEventListener("click", () => {
      state.characterSource = button.dataset.characterSource === "custom" ? "custom" : "system";
      state.routeCharacterId = "";
      state.routeCharacterSource = "";
      state.activeGalleryCharacterId = "";
      replacePlatformUrlForCharacter("", "", state.tab);
      resetCharacterPagination();
      renderGalleryCharacters(els.templateGrid);
      if (state.characterSource === "custom" && state.user) loadUserAssets(state.userAssetsPage || 1).catch(() => {});
    });
  });
}

function renderGalleryCharacterCard(item = {}, index = 0) {
  const videoUrl = characterMainVideoUrl(item);
  const poster = characterAppearanceImageUrl(item) || DEFAULT_TEMPLATE_COVER;
  const fallbackPoster = DEFAULT_TEMPLATE_COVER;
  const videoCount = item.videoCount || characterAllVideos(item).length;
  const custom = item.custom === true;
  const mine = item.myCharacter === true;
  const deletable = mine || custom;
  const imageReady = Boolean(characterUsableImage(item));
  const generating = isMyCharacterGenerating(item);
  const tags = characterTags(item, 2);
  const profileLine = characterProfileLine(item);
  const stats = uniqueTruthy([
    `${compactNumber(item.likeCount)} likes`,
    `${videoCount} videos`,
  ]).join(" / ");
  const actionMarkup = mine
    ? `
          ${generating ? `<button class="ghost-button" data-character-refresh="${escapeHtml(item.id || "")}" type="button"><i data-lucide="refresh-cw"></i>Refresh</button>` : ""}
          ${imageReady ? `<button class="primary-button" data-character-alive="${escapeHtml(item.id || "")}" type="button"><i data-lucide="sparkles"></i>Bring alive</button>` : ""}
          ${imageReady ? `<button class="copy-btn" data-character-alive-picker="${escapeHtml(item.id || "")}" type="button"><i data-lucide="clapperboard"></i>Scene</button>` : ""}
      `
    : `
          <button class="ghost-button" data-character-use="${escapeHtml(item.id || "")}" type="button"><i data-lucide="image-plus"></i>${escapeHtml(t("gallery.character.use"))}</button>
          <button class="ghost-button" data-character-takeoff="${escapeHtml(item.id || "")}" type="button"><i data-lucide="shirt"></i>${escapeHtml(t("characters.takeOff"))}</button>
          <button class="copy-btn" data-character-modify="${escapeHtml(item.id || "")}" type="button"><i data-lucide="wand-sparkles"></i>${escapeHtml(t("characters.modify"))}</button>
      `;
  return `
    <article class="character-card explore-character-card ${deletable ? "has-card-delete" : ""}" data-character-id="${escapeHtml(item.id || "")}">
      <div class="character-card-media">
        ${renderSmartCoverMedia({ className: "character-cover-media", posterUrl: poster, videoUrl: "", alt: item.name || "", fallbackUrl: fallbackPoster, eager: index < 6, defer: index >= 6 })}
        ${videoUrl ? `<span class="character-card-video-mark"><i data-lucide="radio"></i>LIVE</span>` : ""}
        ${mine ? `<span class="character-card-status ${generating ? "is-pending" : imageReady ? "is-ready" : "is-failed"}">${escapeHtml(myCharacterStatusLabel(item))}</span>` : ""}
        ${deletable ? `<button class="character-card-delete" data-character-delete="${escapeHtml(item.id || "")}" type="button" aria-label="${escapeHtml(t("characters.delete"))}" title="${escapeHtml(t("characters.delete"))}"><i data-lucide="trash-2"></i></button>` : ""}
        <div class="character-card-meta">
          <span>${escapeHtml(mine ? myCharacterStatusLabel(item) : custom ? t("characters.customTab") : stats)}</span>
          <strong>${escapeHtml(item.name || "Character")}</strong>
          <p>${escapeHtml(profileLine || item.title || "")}</p>
          ${tags.length ? `<div class="character-card-tags">${tags.map((tag) => `<small>${escapeHtml(tag)}</small>`).join("")}</div>` : ""}
        </div>
        <div class="character-card-actions">
          ${actionMarkup}
        </div>
      </div>
    </article>
  `;
}

async function deleteCustomCharacter(characterId = "", button = null) {
  const assetId = String(characterId || "").startsWith("custom:") ? String(characterId).slice("custom:".length) : "";
  const isMyCharacter = !assetId && (state.myCharacters || []).some((item) => String(item.id || "") === String(characterId || ""));
  if (!assetId && !isMyCharacter) return;
  const originalHtml = button?.innerHTML || "";
  if (button) {
    button.disabled = true;
    button.innerHTML = `<i data-lucide="loader-circle"></i>${escapeHtml(t("common.deleting"))}`;
    refreshIcons();
  }
  try {
    if (isMyCharacter) {
      await requestJson(`/api/my/characters/${encodeURIComponent(characterId)}`, { method: "DELETE" });
      state.myCharacters = (state.myCharacters || []).filter((item) => String(item.id || "") !== String(characterId || ""));
    } else {
      await requestJson(`/api/user-assets/${encodeURIComponent(assetId)}`, { method: "DELETE" });
      state.userAssets = (state.userAssets || []).filter((asset) => asset.id !== assetId);
      state.userAssetsTotal = Math.max(0, Number(state.userAssetsTotal || 0) - 1);
    }
    renderCharactersPanel();
    if (state.tab === "assets") await loadUserAssets(state.userAssetsPage || 1);
  } catch (error) {
    if (els.characterCreateStatus) els.characterCreateStatus.textContent = t("characters.deleteFailed", { message: error.message || String(error) });
    if (button) {
      button.disabled = false;
      button.innerHTML = originalHtml;
      refreshIcons();
    }
  }
}

async function loadMyCharacters({ silent = false } = {}) {
  if (!state.user) {
    state.myCharacters = [];
    state.myCharactersLoaded = true;
    if (state.tab === "characters") renderCharactersPanel();
    return [];
  }
  if (!silent && els.characterCreateStatus) els.characterCreateStatus.textContent = "Loading characters...";
  const payload = await requestJson("/api/my/characters");
  state.myCharacters = payload.characters || [];
  state.myCharactersLoaded = true;
  scheduleMyCharacterProgressRefreshes();
  if (state.routeCharacterId) applyRouteCharacterDetail({ allowTabSwitch: true });
  if (!silent && els.characterCreateStatus) els.characterCreateStatus.textContent = "";
  if (state.tab === "characters") renderCharactersPanel();
  return state.myCharacters;
}

function updateMyCharacterInState(character = {}) {
  if (!character?.id) return;
  state.myCharacters = [
    character,
    ...(state.myCharacters || []).filter((item) => String(item.id || "") !== String(character.id || "")),
  ];
  state.myCharactersLoaded = true;
}

function scheduleMyCharacterProgressRefreshes() {
  (state.myCharacters || []).forEach((character) => {
    if (!character?.id || !character.imageTaskId) return;
    if (!isMyCharacterGenerating(myCharacterToGalleryItem(character))) return;
    if (state.myCharacterRefreshTimers?.[character.id]) return;
    state.myCharacterRefreshTimers[character.id] = window.setTimeout(async () => {
      delete state.myCharacterRefreshTimers[character.id];
      await refreshMyCharacterImage(character.id, { render: state.tab === "characters", reschedule: true }).catch(() => {});
    }, 5000);
  });
}

async function refreshMyCharacterImage(characterId = "", { render = false, reschedule = false } = {}) {
  const id = String(characterId || "").trim();
  if (!id) return null;
  const payload = await requestJson(`/api/my/characters/${encodeURIComponent(id)}/image`);
  if (payload.character) updateMyCharacterInState(payload.character);
  if (render && state.tab === "characters") renderCharactersPanel();
  const item = payload.character ? myCharacterToGalleryItem(payload.character) : null;
  if (reschedule && item && isMyCharacterGenerating(item)) scheduleMyCharacterProgressRefreshes();
  return payload.character || null;
}

function characterCreatorOption(field = "", value = "") {
  return (CHARACTER_CREATOR_OPTIONS[field] || []).find((item) => item.id === value) || null;
}

function characterCreatorLabel(item = {}) {
  return state.lang === "zh" ? (item.zh || item.label || item.id || "") : (item.label || item.zh || item.id || "");
}

function characterCreatorFieldLabel(field = "") {
  const labels = {
    style: ["Style", "风格"],
    gender: ["Gender", "性别"],
    ethnicity: ["Ethnicity", "种族"],
    skinTone: ["Skin tone", "肤色"],
    hairStyle: ["Hair style", "发型"],
    eyeColor: ["Eye color", "眼睛颜色"],
    hairColor: ["Hair color", "头发颜色"],
    bodyType: ["Body type", "体型"],
    breastSize: ["Chest size", "胸部大小"],
    buttSize: ["Hip size", "臀部大小"],
    name: ["Character name", "角色名称"],
    age: ["Age", "年龄"],
    voice: ["Voice", "声音"],
    personality: ["Personality", "个性"],
    occupation: ["Occupation", "职业"],
    relationship: ["Relationship", "关系"],
    hobby: ["Hobby", "爱好"],
    fetish: ["Preference", "偏好"],
    customPhysicalDetails: ["Appearance details", "自定义外貌细节"],
    customFaceDetails: ["Face details", "自定义面部细节"],
  };
  const pair = labels[field] || [field, field];
  return state.lang === "zh" ? pair[1] : pair[0];
}

const CHARACTER_CREATOR_DETAIL_FIELDS = ["voice", "personality", "occupation", "relationship", "hobby", "fetish"];

function characterCreatorFieldIcon(field = "") {
  const icons = {
    voice: "mic",
    personality: "sparkles",
    occupation: "briefcase",
    relationship: "heart",
    hobby: "gamepad-2",
    fetish: "flame",
  };
  return icons[field] || "sparkles";
}

function characterCreatorUiText(key = "") {
  const copy = {
    select: ["Select", "\u9009\u62e9"],
    search: ["Search", "\u641c\u7d22"],
    moreDetails: ["More details", "\u66f4\u591a\u7ec6\u8282"],
  };
  const pair = copy[key] || [key, key];
  return state.lang === "zh" ? pair[1] : pair[0];
}

function characterCreatorCopy(key = "") {
  const copy = {
    next: ["Next", "下一步"],
    back: ["Back", "上一步"],
    generate: ["Generate", "生成角色"],
    aiPrompt: ["Optional custom prompt", "自定义提示词（可选）"],
    aiPromptPlaceholder: ["Describe extra face, outfit, mood, lighting, or anything not covered above.", "补充面部、服装、气质、光线或上面没有覆盖的细节。"],
    customPhysicalPlaceholder: ["Body, outfit, tattoos, accessories...", "身体、服装、纹身、配饰..."],
    customFacePlaceholder: ["Face shape, makeup, expression...", "脸型、妆容、表情..."],
    previewTitle: ["Prompt preview", "提示词预览"],
  };
  const pair = copy[key] || [key, key];
  return state.lang === "zh" ? pair[1] : pair[0];
}

function characterCreatorAsset(fileName = "") {
  return `${CHARACTER_CREATOR_ASSET_BASE}${encodeURIComponent(fileName)}`;
}

function selectedCharacterCreatorPrompts() {
  const creator = state.characterCreator || CHARACTER_CREATOR_DEFAULT;
  return [
    ["gender", creator.gender],
    ["style", creator.style],
    ["ethnicity", creator.ethnicity],
    ["skinTone", creator.skinTone],
    ["hairStyle", creator.hairStyle],
    ["eyeColor", creator.eyeColor],
    ["hairColor", creator.hairColor],
    ["bodyType", creator.bodyType],
    ["breastSize", creator.breastSize],
    ["buttSize", creator.buttSize],
    ["personality", creator.personality],
    ["occupation", creator.occupation],
    ["relationship", creator.relationship],
    ["hobby", creator.hobby],
    ["fetish", creator.fetish],
  ].map(([field, value]) => characterCreatorOption(field, value)?.prompt || "").filter(Boolean);
}

function buildCharacterCreatorPrompt() {
  const creator = state.characterCreator || CHARACTER_CREATOR_DEFAULT;
  const name = String(creator.name || "").trim();
  const age = Math.max(18, Math.min(80, Number(creator.age) || 23));
  return [
    "Create one high quality adult character portrait",
    name ? `character name: ${name}` : "",
    `${age} years old`,
    ...selectedCharacterCreatorPrompts(),
    String(creator.customPhysicalDetails || "").trim(),
    String(creator.customFaceDetails || "").trim(),
    String(creator.prompt || "").trim(),
    "solo character, clear face, detailed identity reference, polished lighting, no watermark, no text",
  ].filter(Boolean).join(", ");
}

function renderCharacterCreatorSteps() {
  const activeIndex = CHARACTER_CREATOR_STEPS.findIndex((step) => step.id === state.characterCreator.step);
  return `
    <div class="character-creator-steps">
      ${CHARACTER_CREATOR_STEPS.map((step, index) => `
        <button class="${index <= activeIndex ? "is-reachable" : ""} ${step.id === state.characterCreator.step ? "is-active" : ""}" data-creator-step="${escapeHtml(step.id)}" type="button" ${index > activeIndex ? "disabled" : ""}>
          <i data-lucide="${escapeHtml(step.icon)}"></i>
        </button>
      `).join("")}
    </div>
  `;
}

function renderCharacterCreatorSegment(field = "") {
  const value = state.characterCreator[field];
  return `
    <div class="creator-segment">
      ${(CHARACTER_CREATOR_OPTIONS[field] || []).map((item) => `
        <button class="${value === item.id ? "is-active" : ""}" data-creator-set="${escapeHtml(field)}" data-creator-value="${escapeHtml(item.id)}" type="button">${escapeHtml(characterCreatorLabel(item))}</button>
      `).join("")}
    </div>
  `;
}

function renderCharacterCreatorTiles(field = "") {
  const value = state.characterCreator[field];
  return `
    <div class="creator-tile-grid">
      ${(CHARACTER_CREATOR_OPTIONS[field] || []).map((item) => `
        <button class="creator-tile ${value === item.id ? "is-active" : ""}" data-creator-set="${escapeHtml(field)}" data-creator-value="${escapeHtml(item.id)}" type="button">
          ${item.image ? `<img src="${escapeHtml(characterCreatorAsset(item.image))}" alt="${escapeHtml(characterCreatorLabel(item))}" loading="lazy" />` : ""}
          <span>${escapeHtml(characterCreatorLabel(item))}</span>
        </button>
      `).join("")}
    </div>
  `;
}

function renderCharacterCreatorSwatches(field = "") {
  const value = state.characterCreator[field];
  return `
    <div class="creator-swatch-row">
      ${(CHARACTER_CREATOR_OPTIONS[field] || []).map((item) => `
        <button class="creator-swatch ${value === item.id ? "is-active" : ""}" data-creator-set="${escapeHtml(field)}" data-creator-value="${escapeHtml(item.id)}" type="button" title="${escapeHtml(characterCreatorLabel(item))}">
          <span style="background:${escapeHtml(item.color || "#fff")}"></span>
          <small>${escapeHtml(characterCreatorLabel(item))}</small>
        </button>
      `).join("")}
    </div>
  `;
}

function renderCharacterCreatorChips(field = "") {
  const value = state.characterCreator[field];
  return `
    <div class="creator-chip-row">
      ${(CHARACTER_CREATOR_OPTIONS[field] || []).map((item) => `
        <button class="${value === item.id ? "is-active" : ""}" data-creator-set="${escapeHtml(field)}" data-creator-value="${escapeHtml(item.id)}" type="button">${escapeHtml(characterCreatorLabel(item))}</button>
      `).join("")}
    </div>
  `;
}

function renderCharacterCreatorSummaryCard(field = "") {
  const selected = characterCreatorOption(field, state.characterCreator[field]);
  const selectedLabel = selected ? characterCreatorLabel(selected) : characterCreatorUiText("select");
  return `
    <button class="creator-summary-card" data-creator-picker="${escapeHtml(field)}" type="button">
      <span class="creator-summary-icon"><i data-lucide="${escapeHtml(characterCreatorFieldIcon(field))}"></i></span>
      <span class="creator-summary-text">
        <small>${escapeHtml(characterCreatorFieldLabel(field))}</small>
        <strong>${escapeHtml(selectedLabel)}</strong>
      </span>
      <i class="creator-summary-arrow" data-lucide="chevron-right"></i>
    </button>
  `;
}

function renderCharacterCreatorSummaryGrid() {
  return `
    <div class="creator-summary-grid">
      ${CHARACTER_CREATOR_DETAIL_FIELDS.map(renderCharacterCreatorSummaryCard).join("")}
    </div>
  `;
}

function renderCharacterCreatorField(field = "", content = "") {
  return `<section class="creator-field creator-field-${escapeHtml(field)}"><h4>${escapeHtml(characterCreatorFieldLabel(field))}</h4>${content}</section>`;
}

function renderCharacterCreatorHeroTitle() {
  if (state.characterCreator.step !== "style") return "";
  return `
    <div class="character-creator-hero-title">
      <span>Create Your</span>
      <strong>AI Character</strong>
    </div>
  `;
}

function renderCharacterCreatorStepBody() {
  const creator = state.characterCreator;
  if (creator.step === "style") return `${renderCharacterCreatorSegment("gender")}${renderCharacterCreatorField("style", renderCharacterCreatorTiles("style"))}`;
  if (creator.step === "general") return `${renderCharacterCreatorField("ethnicity", renderCharacterCreatorTiles("ethnicity"))}${renderCharacterCreatorField("skinTone", renderCharacterCreatorSwatches("skinTone"))}`;
  if (creator.step === "face") return `${renderCharacterCreatorField("hairStyle", renderCharacterCreatorTiles("hairStyle"))}${renderCharacterCreatorField("eyeColor", renderCharacterCreatorSwatches("eyeColor"))}${renderCharacterCreatorField("hairColor", renderCharacterCreatorSwatches("hairColor"))}`;
  if (creator.step === "body") return `${renderCharacterCreatorField("bodyType", renderCharacterCreatorTiles("bodyType"))}${renderCharacterCreatorField("breastSize", renderCharacterCreatorTiles("breastSize"))}${renderCharacterCreatorField("buttSize", renderCharacterCreatorTiles("buttSize"))}`;
  if (creator.step === "details") {
    return `
      <label class="field creator-detail-input creator-detail-name"><span>${escapeHtml(characterCreatorFieldLabel("name"))}</span><input data-creator-input="name" type="text" value="${escapeHtml(creator.name || "")}" placeholder="${escapeHtml(characterCreatorFieldLabel("name"))}" /></label>
      <label class="field creator-detail-input creator-detail-age"><span>${escapeHtml(characterCreatorFieldLabel("age"))}</span><input data-creator-input="age" type="number" min="18" max="80" value="${escapeHtml(creator.age)}" /></label>
      ${renderCharacterCreatorSummaryGrid()}
      <details class="creator-extra-details">
        <summary>${escapeHtml(characterCreatorUiText("moreDetails"))}</summary>
        <div class="creator-extra-grid">
          <label class="field"><span>${escapeHtml(characterCreatorFieldLabel("customPhysicalDetails"))}</span><textarea data-creator-input="customPhysicalDetails" rows="3" placeholder="${escapeHtml(characterCreatorCopy("customPhysicalPlaceholder"))}">${escapeHtml(creator.customPhysicalDetails || "")}</textarea></label>
          <label class="field"><span>${escapeHtml(characterCreatorFieldLabel("customFaceDetails"))}</span><textarea data-creator-input="customFaceDetails" rows="3" placeholder="${escapeHtml(characterCreatorCopy("customFacePlaceholder"))}">${escapeHtml(creator.customFaceDetails || "")}</textarea></label>
        </div>
      </details>
    `;
  }
  return `
    <label class="field"><span>${escapeHtml(characterCreatorCopy("aiPrompt"))}</span><textarea data-creator-input="prompt" rows="5" placeholder="${escapeHtml(characterCreatorCopy("aiPromptPlaceholder"))}">${escapeHtml(creator.prompt || "")}</textarea></label>
    <div class="creator-prompt-preview"><strong>${escapeHtml(characterCreatorCopy("previewTitle"))}</strong><p>${escapeHtml(buildCharacterCreatorPrompt())}</p></div>
  `;
}

function renderCharacterCreator() {
  if (!els.characterCreatorRoot) return;
  const currentIndex = Math.max(0, CHARACTER_CREATOR_STEPS.findIndex((step) => step.id === state.characterCreator.step));
  const isFirst = currentIndex <= 0;
  const isLast = currentIndex >= CHARACTER_CREATOR_STEPS.length - 1;
  const createCostLabel = assetImageModifyCostLabel();
  const submitLabel = isLast ? `${characterCreatorCopy("generate")} - ${createCostLabel}` : characterCreatorCopy("next");
  els.characterCreatorRoot.className = `character-creator-root is-step-${state.characterCreator.step}`;
  els.characterCreatorRoot.innerHTML = `
    ${renderCharacterCreatorSteps()}
    ${renderCharacterCreatorHeroTitle()}
    <div class="character-creator-body">${renderCharacterCreatorStepBody()}</div>
    <div class="character-creator-actions">
      <button class="ghost-button" data-creator-nav="back" type="button" ${isFirst ? "disabled" : ""}><i data-lucide="chevron-left"></i>${escapeHtml(characterCreatorCopy("back"))}</button>
      <button class="generate-btn" id="characterCreateBtn" data-creator-submit="${isLast ? "true" : "false"}" data-creator-nav="${isLast ? "" : "next"}" type="button">
        <i data-lucide="${isLast ? "wand-sparkles" : "chevron-right"}"></i><span>${escapeHtml(submitLabel)}</span>
      </button>
    </div>
    <p class="job-note" id="characterCreateStatus"></p>
  `;
  els.characterCreateBtn = els.characterCreatorRoot.querySelector("#characterCreateBtn");
  els.characterCreateStatus = els.characterCreatorRoot.querySelector("#characterCreateStatus");
  els.characterCreatorRoot.dataset.rendered = "true";
  refreshIcons();
}

function updateCharacterCreatorInput(input) {
  if (!input?.dataset?.creatorInput) return;
  const field = input.dataset.creatorInput;
  state.characterCreator[field] = field === "age" ? Math.max(18, Math.min(80, Number(input.value) || 23)) : (input.value || "");
}

function scrollCharacterCreatorIntoView() {
  const target = els.characterCreatorCard || els.characterCreatorRoot;
  if (!target) return;
  window.requestAnimationFrame(() => {
    target.scrollIntoView({ block: "start", behavior: "smooth" });
  });
}

function navigateCharacterCreator(direction = "next") {
  const currentIndex = Math.max(0, CHARACTER_CREATOR_STEPS.findIndex((step) => step.id === state.characterCreator.step));
  const nextIndex = direction === "back" ? Math.max(0, currentIndex - 1) : Math.min(CHARACTER_CREATOR_STEPS.length - 1, currentIndex + 1);
  state.characterCreator.step = CHARACTER_CREATOR_STEPS[nextIndex].id;
  renderCharacterCreator();
  scrollCharacterCreatorIntoView();
}

function closeCharacterCreatorPicker() {
  const picker = document.querySelector(".creator-picker-shell");
  if (!picker) return;
  const onKeydown = picker._creatorPickerKeydown;
  if (onKeydown) document.removeEventListener("keydown", onKeydown);
  picker.remove();
  document.body.classList.remove("creator-picker-open");
}

function characterCreatorPickerOptionsHtml(field = "", query = "") {
  const normalizedQuery = String(query || "").trim().toLowerCase();
  const value = state.characterCreator[field];
  const options = (CHARACTER_CREATOR_OPTIONS[field] || []).filter((item) => {
    if (!normalizedQuery) return true;
    const label = `${item.label || ""} ${item.zh || ""} ${item.id || ""}`.toLowerCase();
    return label.includes(normalizedQuery);
  });
  return options.map((item) => {
    const label = characterCreatorLabel(item);
    return `
      <button class="creator-picker-option ${value === item.id ? "is-active" : ""}" data-creator-picker-value="${escapeHtml(item.id)}" type="button" title="${escapeHtml(label)}">
        <span class="creator-picker-option-icon"><i data-lucide="${escapeHtml(characterCreatorFieldIcon(field))}"></i></span>
        <span>${escapeHtml(label)}</span>
      </button>
    `;
  }).join("");
}

function openCharacterCreatorPicker(field = "") {
  if (!CHARACTER_CREATOR_DETAIL_FIELDS.includes(field)) return;
  closeCharacterCreatorPicker();
  const shell = document.createElement("div");
  shell.className = "creator-picker-shell";
  shell.innerHTML = `
    <button class="creator-picker-backdrop" data-creator-picker-close="true" type="button" aria-label="Close"></button>
    <section class="creator-picker-panel" role="dialog" aria-modal="true" aria-label="${escapeHtml(characterCreatorFieldLabel(field))}">
      <header class="creator-picker-header">
        <strong>${escapeHtml(state.lang === "zh" ? `\u9009\u62e9${characterCreatorFieldLabel(field)}` : `Select ${characterCreatorFieldLabel(field)}`)}</strong>
        <label class="creator-picker-search">
          <i data-lucide="search"></i>
          <input data-creator-picker-search type="search" placeholder="${escapeHtml(characterCreatorUiText("search"))}" autocomplete="off" />
        </label>
        <button class="icon-btn creator-picker-close" data-creator-picker-close="true" type="button" aria-label="Close"><i data-lucide="x"></i></button>
      </header>
      <div class="creator-picker-options" data-creator-picker-options>
        ${characterCreatorPickerOptionsHtml(field)}
      </div>
    </section>
  `;
  const close = () => closeCharacterCreatorPicker();
  const renderOptions = () => {
    const grid = shell.querySelector("[data-creator-picker-options]");
    const search = shell.querySelector("[data-creator-picker-search]");
    if (!grid) return;
    grid.innerHTML = characterCreatorPickerOptionsHtml(field, search?.value || "");
    refreshIcons();
  };
  shell.addEventListener("click", (event) => {
    if (event.target.closest("[data-creator-picker-close]")) {
      close();
      return;
    }
    const option = event.target.closest("[data-creator-picker-value]");
    if (option) {
      state.characterCreator[field] = option.dataset.creatorPickerValue || "";
      renderCharacterCreator();
      close();
    }
  });
  shell.addEventListener("input", (event) => {
    if (event.target.matches("[data-creator-picker-search]")) renderOptions();
  });
  const onKeydown = (event) => {
    if (event.key === "Escape") close();
  };
  shell._creatorPickerKeydown = onKeydown;
  document.addEventListener("keydown", onKeydown);
  document.body.appendChild(shell);
  document.body.classList.add("creator-picker-open");
  refreshIcons();
  window.requestAnimationFrame(() => shell.querySelector("[data-creator-picker-search]")?.focus());
}

function bindCharacterCreatorEvents() {
  if (!els.characterCreatorRoot || els.characterCreatorRoot.dataset.bound === "true") return;
  els.characterCreatorRoot.dataset.bound = "true";
  els.characterCreatorRoot.addEventListener("click", (event) => {
    const pickerButton = event.target.closest("[data-creator-picker]");
    if (pickerButton) {
      els.characterCreatorRoot.querySelectorAll("[data-creator-input]").forEach(updateCharacterCreatorInput);
      openCharacterCreatorPicker(pickerButton.dataset.creatorPicker || "");
      return;
    }
    const setButton = event.target.closest("[data-creator-set]");
    if (setButton) {
      state.characterCreator[setButton.dataset.creatorSet || ""] = setButton.dataset.creatorValue || "";
      renderCharacterCreator();
      return;
    }
    const stepButton = event.target.closest("[data-creator-step]");
    if (stepButton && !stepButton.disabled) {
      state.characterCreator.step = stepButton.dataset.creatorStep || state.characterCreator.step;
      renderCharacterCreator();
      scrollCharacterCreatorIntoView();
      return;
    }
    const navButton = event.target.closest("[data-creator-nav]");
    if (navButton && navButton.dataset.creatorNav) {
      els.characterCreatorRoot.querySelectorAll("[data-creator-input]").forEach(updateCharacterCreatorInput);
      navigateCharacterCreator(navButton.dataset.creatorNav);
      return;
    }
    if (event.target.closest("[data-creator-submit='true']")) {
      els.characterCreatorRoot.querySelectorAll("[data-creator-input]").forEach(updateCharacterCreatorInput);
      createCharacterFromPrompt();
    }
  });
  els.characterCreatorRoot.addEventListener("input", (event) => {
    updateCharacterCreatorInput(event.target);
    if (state.characterCreator.step === "prompt") {
      const preview = els.characterCreatorRoot.querySelector(".creator-prompt-preview p");
      if (preview) preview.textContent = buildCharacterCreatorPrompt();
    }
  });
}

function bindCharacterCreator({ force = false } = {}) {
  if (els.characterCreatorRoot) {
    if (force || els.characterCreatorRoot.dataset.rendered !== "true") renderCharacterCreator();
    bindCharacterCreatorEvents();
    return;
  }
}

async function createCharacterFromPrompt() {
  if (!state.user) return openLogin();
  const prompt = els.characterCreatorRoot ? buildCharacterCreatorPrompt() : (els.characterCreatePrompt?.value.trim() || "");
  if (!prompt) {
    if (els.characterCreateStatus) els.characterCreateStatus.textContent = t("advanced.promptRequired");
    return;
  }
  const button = els.characterCreateBtn;
  const originalHtml = button?.innerHTML || "";
  if (button) {
    button.disabled = true;
    button.innerHTML = `<i data-lucide="loader-circle"></i>${escapeHtml(t("characters.creating"))}`;
    refreshIcons();
  }
  if (els.characterCreateStatus) els.characterCreateStatus.textContent = t("characters.creating");
  try {
    const creatorState = els.characterCreatorRoot ? { ...(state.characterCreator || {}) } : null;
    const payload = await requestJson("/api/my/characters/generate-image", {
      method: "POST",
      body: {
        prompt,
        name: creatorState?.name || "My character",
        title: creatorState?.relationship || creatorState?.personality || "My character",
        creator: creatorState,
      },
    });
    if (payload.user) setUser(payload.user);
    if (payload.character) updateMyCharacterInState(payload.character);
    if (payload.record) {
      state.historyRecords = [
        payload.record,
        ...(state.historyRecords || []).filter((record) => record.taskId !== payload.record.taskId),
      ];
    }
    if (els.characterCreatePrompt) els.characterCreatePrompt.value = "";
    if (els.characterCreatorRoot) {
      state.characterCreator = { ...CHARACTER_CREATOR_DEFAULT };
      renderCharacterCreator();
    }
    if (els.characterCreateStatus) els.characterCreateStatus.textContent = state.lang === "zh" ? "角色已加入我的角色，正在生成。" : "Character added. Generating image...";
    if (els.characterCreateStatus) els.characterCreateStatus.textContent = "";
    state.activeGalleryCharacterId = "";
    state.characterPanelTab = "list";
    renderCharactersPanel();
    scheduleMyCharacterProgressRefreshes();
  } catch (error) {
    if (els.characterCreateStatus) els.characterCreateStatus.textContent = t("characters.createFailed", { message: error.message || String(error) });
  } finally {
    if (button) {
      button.disabled = false;
      button.innerHTML = originalHtml;
      refreshIcons();
    }
  }
}

async function modifySystemCharacter(characterId = "", { mode = "modify", prompt = "" } = {}) {
  if (!state.user) return openLogin();
  if (String(characterId || "").startsWith("custom:")) {
    const assetId = String(characterId || "").slice("custom:".length);
    const promptText = mode === "take_off" ? (prompt || t("characters.takeOffPrompt")) : prompt;
    if (!promptText) throw new Error(t("advanced.promptRequired"));
    const payload = await requestJson(`/api/user-assets/${encodeURIComponent(assetId)}/modify`, {
      method: "POST",
      body: { prompt: promptText },
    });
    if (payload.user) setUser(payload.user);
    if (payload.record) {
      state.historyRecords = [payload.record, ...(state.historyRecords || []).filter((record) => record.taskId !== payload.record.taskId)];
    }
    await loadHistory({ silent: true }).catch(() => {});
    return payload;
  }
  const body = mode === "take_off"
    ? { mode: "take_off", prompt: prompt || t("characters.takeOffPrompt") }
    : { mode: "modify", prompt };
  const payload = await requestJson(`/api/characters/${encodeURIComponent(characterId)}/modify`, {
    method: "POST",
    body,
  });
  if (payload.user) setUser(payload.user);
  if (payload.record) {
    state.historyRecords = [payload.record, ...(state.historyRecords || []).filter((record) => record.taskId !== payload.record.taskId)];
  }
  await loadHistory({ silent: true }).catch(() => {});
  return payload;
}

function characterResultImageUrl(payload = {}) {
  return payload.asset?.previewUrl || payload.asset?.localUrl || payload.asset?.publicUrl || payload.record?.imageResultUrl || generationImageResultUrl(payload.record || {}) || "";
}

async function openSystemCharacterTakeOffDialog(characterId = "") {
  const character = state.homeCharacters.find((entry) => String(entry.id || "") === String(characterId || ""));
  if (!character) return;
  if (!state.user) return openLogin();
  const poster = characterReferenceImageUrl(character) || DEFAULT_TEMPLATE_COVER;
  await showInlineDialog({
    title: t("characters.takeOff"),
    body: `
      <div class="asset-generate-form character-action-form">
        <div class="asset-modify-preview character-action-preview">
          <img src="${escapeHtml(poster)}" alt="${escapeHtml(character.name || "")}" data-cover-fallback="${escapeHtml(DEFAULT_TEMPLATE_COVER)}" />
        </div>
        <p class="job-note" id="characterTakeoffStatus">${escapeHtml(t("characters.takeOffConfirm"))}</p>
        <div class="character-action-result" id="characterTakeoffResult" hidden></div>
      </div>
    `,
    confirmText: t("characters.takeOff"),
    dialogClass: "is-media-action",
    keepOpenOnConfirm: true,
    onOpen: () => {
      bindGalleryImageFallbacks(els.inlineDialogBody);
      if (els.inlineDialogConfirm) {
        els.inlineDialogConfirm.innerHTML = `<i data-lucide="shirt"></i>${escapeHtml(t("template.generate", { cost: assetImageModifyCostLabel() }))}`;
        refreshIcons();
      }
    },
    onConfirm: async (root) => {
      const status = root.querySelector("#characterTakeoffStatus");
      const result = root.querySelector("#characterTakeoffResult");
      if (status) status.textContent = t("characters.takeOffRunning");
      if (result) {
        result.hidden = true;
        result.innerHTML = "";
      }
      try {
        const payload = await modifySystemCharacter(characterId, { mode: "take_off" });
        const imageUrl = characterResultImageUrl(payload);
        if (status) status.textContent = t("characters.takeOffDone");
        if (result) {
          result.hidden = false;
          result.innerHTML = imageUrl
            ? `<img src="${escapeHtml(imageUrl)}" alt="" /><p class="job-note">${escapeHtml(t("characters.takeOffSaved"))}</p>`
            : `<p class="job-note">${escapeHtml(t("characters.modifyDone"))}</p>`;
        }
        if (els.inlineDialogConfirm) {
          els.inlineDialogConfirm.type = "button";
          els.inlineDialogConfirm.disabled = false;
          els.inlineDialogConfirm.onclick = () => els.inlineDialog?.close("confirm");
          els.inlineDialogConfirm.innerHTML = `<i data-lucide="check"></i>${escapeHtml(t("characters.takeOffDoneButton"))}`;
        }
        if (els.characterCreateStatus) els.characterCreateStatus.textContent = t("characters.modifyDone");
        refreshIcons();
      } catch (error) {
        if (status) status.textContent = t("characters.createFailed", { message: error.message || String(error) });
        if (els.inlineDialogConfirm) {
          els.inlineDialogConfirm.disabled = false;
          els.inlineDialogConfirm.innerHTML = `<i data-lucide="shirt"></i>${escapeHtml(t("characters.takeOff"))}`;
          refreshIcons();
        }
        throw error;
      }
    },
  });
}

async function openSystemCharacterModifyDialog(characterId = "") {
  const character = state.homeCharacters.find((entry) => String(entry.id || "") === String(characterId || ""));
  if (!character) return;
  if (!state.user) return openLogin();
  await showInlineDialog({
    title: t("characters.modifyTitle"),
    body: `
      <div class="asset-generate-form">
        <label class="field"><span>${escapeHtml(t("field.prompt"))}</span><textarea id="characterModifyPrompt" rows="5" placeholder="${escapeHtml(t("characters.modifyPlaceholder"))}"></textarea></label>
        <p class="job-note" id="characterModifyStatus"></p>
      </div>
    `,
    confirmText: t("characters.modify"),
    dialogClass: "is-media-action",
    onOpen: () => {
      if (els.inlineDialogConfirm) {
        els.inlineDialogConfirm.innerHTML = `<i data-lucide="wand-sparkles"></i>${escapeHtml(t("template.generate", { cost: assetImageModifyCostLabel() }))}`;
        refreshIcons();
      }
    },
    onConfirm: async (root) => {
      const prompt = root.querySelector("#characterModifyPrompt")?.value.trim() || "";
      if (!prompt) throw new Error(t("advanced.promptRequired"));
      const status = root.querySelector("#characterModifyStatus");
      if (status) status.textContent = t("assets.generating");
      const payload = await modifySystemCharacter(characterId, { mode: "modify", prompt });
      const imageUrl = characterResultImageUrl(payload);
      if (status) status.textContent = t("assets.modified");
      if (imageUrl) {
        const result = document.createElement("div");
        result.className = "character-action-result";
        result.innerHTML = `<img src="${escapeHtml(imageUrl)}" alt="" />`;
        root.querySelector(".asset-generate-form")?.append(result);
      }
    },
  });
}

function openGalleryCharacter(characterId = "", { updateRoute = true } = {}) {
  const source = characterSourceForId(characterId) || (state.tab === "characters" ? "custom" : "system");
  const item = findGalleryCharacterInSource(characterId, source);
  if (!item) return;
  const targetTab = source === "custom" ? "characters" : DEFAULT_PLATFORM_TAB;
  state.characterSource = source;
  state.activeGalleryCharacterId = item.id || "";
  state.routeCharacterId = item.id || "";
  state.routeCharacterSource = source;
  if (targetTab === "characters") state.characterPanelTab = "list";
  if (source === "system") trackSystemCharacterView(item.id || "", "home");
  if (updateRoute) replacePlatformUrlForCharacter(item.id || "", source, targetTab);
  if (state.tab !== targetTab) {
    setTab(targetTab);
    return;
  }
  if (state.tab === "characters") renderCharactersPanel();
  else renderTemplates();
  if (state.user) loadGalleryUnlocks();
  else {
    state.galleryUnlocks = [];
    state.galleryUnlocksLoaded = false;
    state.galleryUnlockMessage = "";
  }
}

async function loadGalleryUnlocks() {
  if (!state.user) {
    state.galleryUnlocks = [];
    state.galleryUnlocksLoaded = false;
    state.galleryUnlockMessage = "";
    if (state.activeGalleryCharacterId && (state.tab === "gallery" || state.tab === "characters")) {
      if (state.tab === "characters") renderCharactersPanel();
      else renderTemplates();
    }
    return;
  }
  try {
    const payload = await requestJson("/api/unlocks");
    state.galleryUnlocks = payload.unlocks || [];
    state.galleryUnlocksLoaded = true;
    state.galleryUnlockMessage = "";
    if (state.activeGalleryCharacterId && (state.tab === "gallery" || state.tab === "characters")) {
      if (state.tab === "characters") renderCharactersPanel();
      else renderTemplates();
    }
  } catch (error) {
    state.galleryUnlockMessage = error.message || "";
    state.galleryUnlocksLoaded = false;
    if (state.activeGalleryCharacterId && (state.tab === "gallery" || state.tab === "characters")) {
      if (state.tab === "characters") renderCharactersPanel();
      else renderTemplates();
    }
  }
}

function galleryUnlockKey(itemId = "", sceneId = "", sceneEntryId = "default") {
  return [itemId, sceneId, sceneEntryId || "default"].map((part) => String(part || "").trim()).join("::");
}

function galleryCharacterUnlockKey(itemId = "") {
  return galleryUnlockKey(itemId, "__character__", "bundle");
}

function galleryUnlockedSet() {
  const keys = new Set();
  (state.galleryUnlocks || []).forEach((record) => {
    keys.add(galleryUnlockKey(record.itemId, record.sceneId, record.sceneEntryId || "default"));
    if (record.unlockType === "character_bundle" || record.sceneId === "__character__") {
      keys.add(galleryCharacterUnlockKey(record.itemId));
    }
  });
  return keys;
}

function isGalleryVideoUnlocked(character = {}, video = {}) {
  if (creatorMembershipActive()) return true;
  const set = galleryUnlockedSet();
  return set.has(galleryCharacterUnlockKey(character.id || "")) || set.has(galleryUnlockKey(character.id || "", video.sceneId || "", video.sceneEntryId || "default"));
}

function isOwnGalleryCharacter(character = {}) {
  const id = String(character.id || "");
  return Boolean(
    character.myCharacter === true ||
    character.custom === true ||
    (state.myCharacters || []).some((item) => String(item?.id || "") === id),
  );
}

function applyUnlockedCharacterVideos(characterId = "", videos = []) {
  const item = state.homeCharacters.find((entry) => String(entry.id || "") === String(characterId || ""));
  if (!item || !Array.isArray(videos)) return;
  const homeSceneVideos = {};
  const unlockVideos = {};
  videos.forEach((video = {}, index) => {
    const key = [video.sceneId || `scene-${index}`, video.sceneEntryId || "default"].join("__");
    const entry = { ...video, locked: false };
    if (index === 0) homeSceneVideos[key] = entry;
    else unlockVideos[key] = entry;
  });
  item.homeSceneVideos = homeSceneVideos;
  item.sceneVideos = {};
  item.unlockVideos = unlockVideos;
  item.unlocked = true;
}

async function unlockGallerySceneVideo(characterId = "") {
  if (!state.user) return openLogin();
  if (!creatorMembershipActive()) {
    const confirmed = await showInlineDialog({
      title: "Creator Membership",
      body: '<p class="job-note">A $99 lifetime membership unlocks watching and downloading every Explore video, referral rewards, and top-up bonuses.</p>',
      confirmText: "Buy for $99",
      dialogClass: "is-frame-action",
    });
    if (confirmed === "confirm") {
      openBillingPaymentChoice({ billingPlanId: "plan-main-creator" });
    }
    return;
  }
  const renderActiveCharacterView = () => {
    if (state.tab === "characters") renderCharactersPanel();
    else renderTemplates();
  };
  const key = galleryCharacterUnlockKey(characterId);
  state.galleryUnlockLoadingKey = key;
  state.galleryUnlockMessage = t("gallery.character.unlocking");
  renderActiveCharacterView();
  try {
    const payload = await requestJson("/api/unlock-video", {
      method: "POST",
      body: { itemId: characterId },
    });
    state.user = payload.user || state.user;
    state.galleryUnlocks = payload.unlocks || state.galleryUnlocks || [];
    applyUnlockedCharacterVideos(characterId, payload.videos || []);
    state.galleryUnlockMessage = t("gallery.character.unlockReady");
  } catch (error) {
    state.galleryUnlockMessage = t("gallery.character.unlockFailed", { message: error.message || "Unknown error" });
  } finally {
    state.galleryUnlockLoadingKey = "";
    renderActiveCharacterView();
    renderAccountMenu();
    renderTopupSummary();
  }
}

function uniqueTruthy(values = []) {
  const seen = new Set();
  return values.map((value) => String(value || "").trim()).filter((value) => {
    if (!value || seen.has(value)) return false;
    seen.add(value);
    return true;
  });
}

function isGenericCharacterPoster(url = "") {
  const value = String(url || "").toLowerCase();
  return !value || value.includes("/assets/admin/home/default-hero.") || value.includes("/assets/placeholders/") || value === DEFAULT_TEMPLATE_COVER.toLowerCase();
}

function isVideoMediaUrl(url = "") {
  return /\.(?:mp4|webm|mov|m4v)(?:[?#].*)?$/i.test(String(url || "").trim());
}

function adminHomeCoverFromVideoUrl(videoUrl = "") {
  const raw = String(videoUrl || "").split("?")[0].trim();
  const match = raw.match(/\/assets\/generated\/videos\/([^/?#]+)\.(?:mp4|webm|mov|m4v)$/i);
  if (!match) return "";
  return `/assets/admin/home/cover-${match[1]}.jpg`;
}

function videoPosterCandidates(videoUrl = "") {
  return uniqueTruthy([
    adminHomeCoverFromVideoUrl(videoUrl),
    generatedPosterFromVideoUrl(videoUrl),
  ]);
}

function characterPosterUrl(item = {}) {
  const mainVideo = characterMainVideoUrl(item);
  const imageCandidates = [
    item.cdnImageUrl,
    item.cdnPosterUrl,
    item.publicImageUrl,
    item.localImageUrl,
    item.posterUrl,
    item.syntheticReferenceLocalUrl,
    item.imageUrl,
    item.coverUrl,
    item.thumbnailUrl,
    item.sourceImageUrl,
  ];
  const imagePoster = uniqueTruthy(imageCandidates).find((value) => !isVideoMediaUrl(value) && !isGenericCharacterPoster(value));
  if (imagePoster) return imagePoster;
  const fallbackImage = uniqueTruthy(imageCandidates).find((value) => !isVideoMediaUrl(value));
  if (fallbackImage) return fallbackImage;
  const candidates = [
    ...videoPosterCandidates(mainVideo),
    item.homeSceneVideos && Object.values(item.homeSceneVideos).find(Boolean)?.posterUrl,
    item.sceneVideos && Object.values(item.sceneVideos).find(Boolean)?.posterUrl,
    item.unlockVideos && Object.values(item.unlockVideos).find(Boolean)?.posterUrl,
  ];
  return uniqueTruthy(candidates).find((value) => !isGenericCharacterPoster(value)) || (mainVideo ? "" : DEFAULT_TEMPLATE_COVER);
}

function characterListPosterUrl(item = {}) {
  const candidates = [
    item.cdnPosterUrl,
    item.cdnImageUrl,
    item.publicImageUrl,
    item.thumbnailUrl,
    item.thumbUrl,
    item.listPosterUrl,
    item.cardPosterUrl,
    item.posterThumbUrl,
  ];
  return uniqueTruthy(candidates).find((value) => !isVideoMediaUrl(value) && !isGenericCharacterPoster(value)) || characterPosterUrl(item);
}

function characterReferenceImageUrl(item = {}) {
  return characterAppearanceImageUrl(item);
}

function characterMainVideoUrl(item = {}) {
  const candidates = [
    item.cdnVideoUrl,
    item.videoUrl,
    item.localVideoUrl,
    item.remoteVideoUrl,
    item.homeSceneVideos && Object.values(item.homeSceneVideos).find((entry) => entry?.cdnVideoUrl || entry?.videoUrl)?.cdnVideoUrl,
    item.homeSceneVideos && Object.values(item.homeSceneVideos).find((entry) => entry?.cdnVideoUrl || entry?.videoUrl)?.videoUrl,
    item.sceneVideos && Object.values(item.sceneVideos).find((entry) => entry?.cdnVideoUrl || entry?.videoUrl)?.cdnVideoUrl,
    item.sceneVideos && Object.values(item.sceneVideos).find((entry) => entry?.cdnVideoUrl || entry?.videoUrl)?.videoUrl,
  ];
  return candidates.map((value) => String(value || "").trim()).find(Boolean) || "";
}

function sceneIdFromVideoKey(videoKey = "") {
  return String(videoKey || "").split("__")[0] || "";
}

function uniqueCharacterVideos(entries = [], { dedupeByUrl = true } = {}) {
  const seen = new Set();
  return entries.map((entry) => entry || {}).filter((entry, index) => {
    if (!entry || (!entry.videoUrl && !entry.taskId && !entry.posterUrl)) return false;
    const key = dedupeByUrl
      ? [entry.videoUrl, entry.sceneId, entry.sceneEntryId, entry.taskId, entry.title, index].join("|")
      : [entry.sceneId || index, entry.sceneEntryId || "default", entry.taskId || entry.videoUrl || index, entry.title || ""].join("|");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function characterRoleVideos(item = {}) {
  const poster = characterPosterUrl(item);
  const mainVideo = characterMainVideoUrl(item);
  const roleVideos = [];
  if (mainVideo || item.taskId || poster) {
    roleVideos.push({
      sceneId: "role",
      sceneEntryId: "default",
      title: item.title || item.name || "Character video",
      sceneName: t("gallery.character.roleVideos"),
      videoUrl: mainVideo,
      posterUrl: poster,
      status: item.status || "",
      provider: item.provider || "seedance",
      resolution: item.resolution || "",
      duration: item.duration || 0,
    });
  }
  return uniqueCharacterVideos(roleVideos);
}

function characterSceneVideos(item = {}) {
  const entries = [
    ...Object.entries(item.homeSceneVideos || {}).map(([key, entry]) => ({
      ...(entry || {}),
      kind: "scene",
      sceneId: entry?.sceneId || sceneIdFromVideoKey(key),
      title: entry?.title || entry?.sceneEntryName || entry?.sceneName || key,
    })),
    ...Object.entries(item.sceneVideos || {}).map(([key, entry]) => ({
      ...(entry || {}),
      kind: "scene",
      sceneId: entry?.sceneId || sceneIdFromVideoKey(key),
      title: entry?.title || entry?.sceneEntryName || entry?.sceneName || key,
    })),
  ];
  return uniqueCharacterVideos(entries, { dedupeByUrl: false });
}

function characterUnlockVideos(item = {}) {
  return uniqueCharacterVideos(Object.entries(item.unlockVideos || {}).map(([key, entry]) => ({
    ...(entry || {}),
    kind: "scene",
    sceneId: entry?.sceneId || sceneIdFromVideoKey(key),
    title: entry?.title || entry?.sceneEntryName || entry?.sceneName || key,
    locked: true,
  })), { dedupeByUrl: false });
}

function characterVideoTitle(video = {}, fallback = "") {
  return video.title || video.sceneEntryName || video.sceneName || fallback || t("gallery.character.sceneVideos");
}

function characterVideoPoster(video = {}, character = {}) {
  const videoUrl = video.cdnVideoUrl || video.videoUrl || video.localVideoUrl || video.remoteVideoUrl || "";
  const candidates = [
    video.cdnPosterUrl,
    video.cdnCoverUrl,
    video.outputPosterUrl,
    video.resultPosterUrl,
    video.localPosterUrl,
    video.posterUrl,
    video.coverUrl,
    video.thumbnailUrl,
    ...videoPosterCandidates(videoUrl),
  ];
  const poster = uniqueTruthy(candidates).find((value) => !isGenericCharacterPoster(value));
  if (poster) return poster;
  if (videoUrl) return "";
  return uniqueTruthy([characterPosterUrl(character), DEFAULT_TEMPLATE_COVER]).find(Boolean) || DEFAULT_TEMPLATE_COVER;
}

function renderSmartCoverMedia({ className = "", posterUrl = "", videoUrl = "", fallbackUrl = DEFAULT_TEMPLATE_COVER, alt = "", eager = false, defer = false } = {}) {
  const poster = String(posterUrl || "").trim();
  const video = String(videoUrl || "").trim();
  const fallback = String(fallbackUrl || DEFAULT_TEMPLATE_COVER).trim();
  const loading = eager ? "eager" : "lazy";
  const priority = eager ? ` fetchpriority="high"` : ` fetchpriority="low"`;
  if (poster) {
    const sourceAttr = defer
      ? `data-lazy-src="${escapeHtml(poster)}"`
      : `src="${escapeHtml(poster)}"`;
    return `<img class="${escapeHtml(className)}" ${sourceAttr} alt="${escapeHtml(alt)}" loading="${loading}" decoding="async"${priority} data-cover-fallback="${escapeHtml(video || fallback)}" data-cover-final-fallback="${escapeHtml(fallback)}" />`;
  }
  if (video) {
    return `<video class="${escapeHtml(className)}" ${defer ? `data-lazy-src="${escapeHtml(video)}"` : `src="${escapeHtml(video)}"`} aria-label="${escapeHtml(alt)}" muted playsinline preload="${eager ? "metadata" : "none"}" data-video-cover-fallback="${escapeHtml(fallback)}"></video>`;
  }
  return `<img class="${escapeHtml(className)}" ${defer ? `data-lazy-src="${escapeHtml(fallback)}"` : `src="${escapeHtml(fallback)}"`} alt="${escapeHtml(alt)}" loading="${loading}" decoding="async"${priority} />`;
}

function renderGalleryCharacterDetail(item = {}, root = els.templateGrid) {
  const videos = characterAllVideos(item);
  const poster = characterPosterUrl(item);
  const tags = characterTags(item, 6);
  const profileLine = characterProfileLine(item);
  const description = String(item.description || item.title || "").trim();
  const stats = uniqueTruthy([
    `${compactNumber(item.likeCount)} likes`,
    `${compactNumber(item.estimatedMessageCount)} chats`,
    `${videos.length} videos`,
  ]).join(" / ");
  if (!root) return;
  root.className = "template-grid character-detail";
  root.innerHTML = `
    <section class="character-detail-hero">
      <button class="ghost-button character-back" data-character-back type="button"><i data-lucide="chevron-left"></i>${escapeHtml(t("gallery.character.back"))}</button>
      <div class="character-detail-profile">
        ${renderSmartCoverMedia({ className: "character-detail-cover-media", posterUrl: poster, videoUrl: characterMainVideoUrl(item), alt: item.name || "", fallbackUrl: DEFAULT_TEMPLATE_COVER })}
        <div class="character-detail-copy">
          <span title="${escapeHtml(profileLine || item.status || "Public profile")}">${escapeHtml(profileLine || item.status || "Public profile")}</span>
          <h3 title="${escapeHtml(item.name || "Character")}">${escapeHtml(item.name || "Character")}</h3>
          <p title="${escapeHtml(description)}">${escapeHtml(description)}</p>
          ${tags.length ? `<div class="character-detail-tags">${tags.map((tag) => `<small>${escapeHtml(tag)}</small>`).join("")}</div>` : ""}
          <div class="character-detail-stats">
            <strong>${escapeHtml(stats || "Ready")}</strong>
            ${item.creatorUsername ? `<span>@${escapeHtml(item.creatorUsername)}</span>` : ""}
          </div>
        </div>
        <div class="character-detail-actions">
          <button class="primary-button compact" data-character-chat="${escapeHtml(item.id || "")}" type="button"><i data-lucide="message-circle-heart"></i>Chat</button>
          <button class="primary-button compact" data-character-use="${escapeHtml(item.id || "")}" type="button"><i data-lucide="image-plus"></i>${escapeHtml(t("gallery.character.useThis"))}</button>
          ${item.custom ? `<button class="ghost-button danger compact" data-character-delete="${escapeHtml(item.id || "")}" type="button"><i data-lucide="trash-2"></i>${escapeHtml(t("characters.delete"))}</button>` : ""}
        </div>
      </div>
      ${state.galleryUnlockMessage ? `<div class="job-note">${escapeHtml(state.galleryUnlockMessage)}</div>` : ""}
    </section>
    ${renderCharacterVideoSection(t("gallery.character.sceneVideos"), videos, item)}
  `;
  root.querySelector("[data-character-back]")?.addEventListener("click", () => {
    state.routeCharacterId = "";
    state.routeCharacterSource = "";
    state.activeGalleryCharacterId = "";
    replacePlatformUrlForCharacter("", "", state.tab);
    if (state.tab === "characters") renderGalleryCharacters(root);
    else renderTemplates();
  });
  root.querySelector("[data-character-use]")?.addEventListener("click", () => useHomeCharacter(item.id || ""));
  root.querySelector("[data-character-chat]")?.addEventListener("click", () => startCharacterChat(item.id || ""));
  root.querySelector("[data-character-delete]")?.addEventListener("click", (event) => {
    event.stopPropagation();
    deleteCustomCharacter(item.id || "", event.currentTarget);
  });
  root.querySelectorAll("[data-character-play]").forEach((button) => {
    button.addEventListener("click", () => {
      const video = findGalleryCharacterVideo(item, button.dataset.characterPlay, button.dataset.characterSceneEntry);
      if (video) playCharacterVideo(video, characterVideoTitle(video, item.name));
    });
  });
  root.querySelectorAll("[data-character-unlock]").forEach((button) => {
    button.addEventListener("click", () => unlockGallerySceneVideo(item.id || ""));
  });
  bindGalleryImageFallbacks(root);
  refreshIcons();
}

function renderCharacterVideoSection(title = "", videos = [], character = {}, { locked = false } = {}) {
  const visibleVideos = videos;
  const ownCharacter = isOwnGalleryCharacter(character);
  return `
    <section class="character-video-section">
      <div class="character-video-section-head">
        <h4>${escapeHtml(title)}</h4>
        <span>${escapeHtml(String(visibleVideos.length))}</span>
      </div>
      <div class="character-video-list">
        ${visibleVideos.length ? visibleVideos.map((video, index) => renderCharacterVideoCard(video, character, { locked: Boolean(video.locked), index, ownCharacter })).join("") : `<div class="job-note">${escapeHtml(t("gallery.character.noVideos"))}</div>`}
      </div>
    </section>
  `;
}

function renderCharacterVideoCard(video = {}, character = {}, { locked = false, index = 0, ownCharacter = false } = {}) {
  const sceneId = video.sceneId || `role-${index}`;
  const sceneEntryId = video.sceneEntryId || "default";
  const poster = characterVideoPoster(video, character);
  const hasVideo = Boolean(video.videoUrl);
  const characterUnlocked = isGalleryVideoUnlocked(character, video);
  const guest = !state.user;
  const unlocked = ownCharacter || (Boolean(state.user) && characterUnlocked);
  const loading = state.galleryUnlockLoadingKey === galleryCharacterUnlockKey(character.id || "");
  const canPlay = unlocked && hasVideo;
  const title = characterVideoTitle(video, locked ? t("gallery.character.sceneVideos") : t("gallery.character.roleVideos"));
  const meta = [video.duration ? `${video.duration}s` : "", video.likes ? `${compactNumber(video.likes)} likes` : ""].filter(Boolean).join(" / ");
  const action = ownCharacter
    ? ""
    : canPlay
    ? ""
    : guest
      ? `<button class="primary-button compact" data-character-unlock="${escapeHtml(sceneId)}" data-character-scene-entry="${escapeHtml(sceneEntryId)}" type="button"><i data-lucide="lock-keyhole"></i>${escapeHtml(t("gallery.character.unlockLogin"))}</button>`
    : `<button class="primary-button compact" data-character-unlock="${escapeHtml(sceneId)}" data-character-scene-entry="${escapeHtml(sceneEntryId)}" type="button"${loading ? " disabled" : ""}><i data-lucide="crown"></i>${escapeHtml(loading ? t("gallery.character.unlocking") : "Unlock with membership")}</button>`;
  const mediaAction = !canPlay && !ownCharacter
    ? `data-character-unlock="${escapeHtml(sceneId)}" data-character-scene-entry="${escapeHtml(sceneEntryId)}"`
    : canPlay
      ? `data-character-play="${escapeHtml(sceneId)}" data-character-scene-entry="${escapeHtml(sceneEntryId)}"`
      : "";
  return `
    <article class="character-video-card ${!canPlay ? "is-locked" : ""}">
      <button class="character-video-media" ${mediaAction || "disabled"} type="button">
        ${renderSmartCoverMedia({ className: "character-video-cover-media", posterUrl: poster, videoUrl: canPlay ? (video.videoUrl || video.localVideoUrl || video.remoteVideoUrl || "") : "", alt: title, fallbackUrl: characterPosterUrl(character) || DEFAULT_TEMPLATE_COVER })}
        <span class="character-video-play"><i data-lucide="${canPlay ? "play" : "lock"}"></i></span>
        <span class="character-video-chip">${escapeHtml(meta || "Video")}</span>
      </button>
      <div class="character-video-info">
        <strong title="${escapeHtml(title)}">${escapeHtml(title)}</strong>
        ${action}
      </div>
    </article>
  `;
}

function findGalleryCharacterVideo(character = {}, sceneId = "", sceneEntryId = "default") {
  const candidates = characterAllVideos(character);
  return candidates.find((video) => String(video.sceneId || "") === String(sceneId || "") && String(video.sceneEntryId || "default") === String(sceneEntryId || "default")) || null;
}

function playCharacterVideo(video = {}, title = "") {
  const url = video.videoUrl || "";
  if (!url) return;
  playPreview({ title, previewUrl: url, ratio: video.ratio || "9:16" });
}

function bindGalleryCoverVideo(video) {
  if (!video || video.dataset.coverBound) return;
  video.dataset.coverBound = "1";
  const fallback = video.dataset.videoCoverFallback || DEFAULT_TEMPLATE_COVER;
  const captureFrame = () => {
    if (video.dataset.coverReady || !video.videoWidth || !video.videoHeight) return;
    try {
      const canvas = document.createElement("canvas");
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const context = canvas.getContext("2d");
      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      video.poster = canvas.toDataURL("image/jpeg", 0.84);
      video.dataset.coverReady = "1";
    } catch (error) {}
  };
  video.addEventListener("loadedmetadata", () => {
    try {
      video.currentTime = Math.min(0.2, Math.max(0, Number(video.duration || 0) / 10 || 0.2));
    } catch (error) {}
  }, { once: true });
  video.addEventListener("loadeddata", captureFrame, { once: true });
  video.addEventListener("seeked", captureFrame, { once: true });
  video.addEventListener("error", () => {
    const img = document.createElement("img");
    img.className = video.className;
    img.src = fallback || DEFAULT_TEMPLATE_COVER;
    img.alt = video.getAttribute("aria-label") || "";
    img.loading = "lazy";
    video.replaceWith(img);
  }, { once: true });
  video.load();
}

function replaceImageWithCoverVideo(img, videoUrl = "", fallback = DEFAULT_TEMPLATE_COVER) {
  if (!img || !videoUrl) return false;
  const video = document.createElement("video");
  video.className = img.className;
  video.src = videoUrl;
  video.setAttribute("aria-label", img.alt || "");
  video.muted = true;
  video.playsInline = true;
  video.preload = "metadata";
  video.dataset.videoCoverFallback = fallback || DEFAULT_TEMPLATE_COVER;
  img.replaceWith(video);
  bindGalleryCoverVideo(video);
  return true;
}

function bindGalleryImageFallbacks(root = els.templateGrid) {
  bindLazyMedia(root);
  root?.querySelectorAll?.("img[data-cover-fallback]")?.forEach((img) => {
    const fallback = img.dataset.coverFallback || DEFAULT_TEMPLATE_COVER;
    const finalFallback = img.dataset.coverFinalFallback || DEFAULT_TEMPLATE_COVER;
    const applyFallback = () => {
      const current = img.getAttribute("src") || "";
      if (fallback && current !== fallback) {
        if (isVideoMediaUrl(fallback)) {
          replaceImageWithCoverVideo(img, fallback, finalFallback);
          return;
        }
        img.src = fallback;
      } else if (finalFallback && current !== finalFallback) {
        img.src = finalFallback;
      }
    };
    img.addEventListener("error", applyFallback);
    if (img.getAttribute("src") && img.complete && img.naturalWidth === 0) applyFallback();
  });
  root?.querySelectorAll?.("video[data-video-cover-fallback]")?.forEach(bindGalleryCoverVideo);
}

function loadLazyMediaElement(element) {
  if (!element?.dataset?.lazySrc) return;
  element.src = element.dataset.lazySrc;
  element.removeAttribute("data-lazy-src");
  if (element.tagName === "VIDEO") element.load();
}

function bindLazyMedia(root = document) {
  const items = Array.from(root?.querySelectorAll?.("[data-lazy-src]") || []);
  if (!items.length) return;
  if (!("IntersectionObserver" in window)) {
    items.forEach(loadLazyMediaElement);
    return;
  }
  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      loadLazyMediaElement(entry.target);
      observer.unobserve(entry.target);
    });
  }, { rootMargin: "180px 0px", threshold: 0.01 });
  items.forEach((item) => observer.observe(item));
}

function bindGalleryCaseActions() {
  els.templateGrid.querySelectorAll("[data-case-index]").forEach((card) => {
    card.addEventListener("click", () => {
      const item = advancedCaseById(card.dataset.caseId) || state.advancedCases.filter((entry) => entry.enabled !== false)[Number(card.dataset.caseIndex || 0)];
      fillAdvancedCase(item);
      setTab("advanced");
    });
    const isCaseRow = card.classList.contains("advanced-case-row");
    bindHoverPreviewCard({
      card,
      video: isCaseRow ? null : card.querySelector(".advanced-case-hover-video"),
      cover: isCaseRow ? null : card.querySelector(".advanced-case-cover"),
    });
  });
  els.templateGrid.querySelectorAll("[data-advanced-fill-prompt-id]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      fillAdvancedCasePrompt(advancedCaseById(button.dataset.advancedFillPromptId));
      setTab("advanced");
    });
  });
  els.templateGrid.querySelectorAll("[data-advanced-row-preview-id]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      openAdvancedRowPreview(button.dataset.advancedRowPreviewId, button.dataset.advancedRowPreviewKind || "output");
    });
  });
  els.templateGrid.querySelectorAll("[data-advanced-preview-index]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      openAdvancedPreview(button.dataset.advancedPreviewIndex);
    });
  });
}

function findGalleryCharacterById(characterId = "") {
  const id = String(characterId || "");
  return [
    ...(state.homeCharacters || []),
    ...customCharacterItems(),
  ].find((entry) => String(entry.id || "") === id) || null;
}

async function useHomeCharacter(characterId = "") {
  const item = findGalleryCharacterById(characterId);
  if (!item) return;
  const imageUrl = characterReferenceImageUrl(item);
  state.advancedCreateKind = "video";
  state.advancedCreateMode = "video-image";
  renderAdvancedCreateControls();
  if (els.advancedProvider) els.advancedProvider.value = "seedance";
  if (els.advancedSeedanceMediaMode) els.advancedSeedanceMediaMode.value = "reference_images";
  state.activeAdvancedCaseId = "";
  state.advancedSeedanceVideoAssetId = "";
  state.advancedSeedanceVideoPreviewUrl = "";
  const preset = {
    id: item.id || "character",
    label: item.name || "Character",
    prompt: item.prompt || item.title || `Use ${item.name || "the selected character"} as the main subject.`,
    imageUrl,
    referenceImageUrl: imageUrl,
    category: item.myCharacter ? "My characters" : "Characters",
  };
  state.advancedSelectedPresets = { ...(state.advancedSelectedPresets || {}), character: preset };
  state.advancedReferenceImages = imageUrl ? [{
    dataUrl: imageUrl,
    url: imageUrl,
    previewUrl: imageUrl,
    fileName: item.name || "Character",
    name: item.name || "Character",
    fromPreset: true,
    presetId: item.id || "",
    presetSlot: "character",
  }] : [];
  state.advancedUploadDataUrl = imageUrl || "";
  if (els.advancedPrompt) {
    els.advancedPrompt.value = `Use Image 1 as the main character reference. Create a cinematic video featuring ${item.name || "the character"}.`;
  }
  setTab("advanced");
  updateAdvancedModelControls();
  renderAdvancedPresetBuilder();
  updateAdvancedButtonCost();
  if (els.advancedNote) {
    els.advancedNote.textContent = imageUrl
      ? `${item.name || "Character"} selected. Choose a case or generate directly.`
      : `Failed to load ${item.name || "character"} image.`;
  }
}

function renderAlivePresetSelect(slot = "") {
  const label = advancedPresetLabel(slot);
  const items = advancedPresetItems(slot);
  return `
    <label class="field">
      <span>${escapeHtml(label)}</span>
      <select data-alive-preset="${escapeHtml(slot)}">
        <option value="">${escapeHtml(slot === "action" ? `Choose ${label}` : `Optional ${label}`)}</option>
        ${items.map((item) => `<option value="${escapeHtml(item.id || "")}">${escapeHtml(item.label || item.id || "")}</option>`).join("")}
      </select>
    </label>
  `;
}

async function openCharacterAliveQuickGenerateDialog(characterId = "") {
  if (!state.user) return openLogin();
  await loadAdvancedPresets();
  await useHomeCharacter(characterId);
  const item = findGalleryCharacterById(characterId);
  if (!item) return;
  await showInlineDialog({
    title: state.lang === "zh" ? "选择场景并生成" : "Choose scene and generate",
    body: `
      <div class="asset-generate-form character-alive-form">
        <p class="job-note">${escapeHtml(state.lang === "zh" ? "选择动作、服装和场景后会跳到 Create，并在 Result 中显示进度。" : "Choose action, outfit, and scene. Generation will open Create and show progress in Result.")}</p>
        ${renderAlivePresetSelect("action")}
        ${renderAlivePresetSelect("outfit")}
        ${renderAlivePresetSelect("scene")}
        <p class="job-note" id="characterAliveStatus"></p>
      </div>
    `,
    confirmText: t("common.generate"),
    onConfirm: async (root) => {
      const selected = {};
      root.querySelectorAll("[data-alive-preset]").forEach((select) => {
        const slot = select.dataset.alivePreset || "";
        const presetId = select.value || "";
        if (!slot || !presetId) return;
        const preset = advancedPresetItems(slot).find((entry) => entry.id === presetId);
        if (preset) selected[slot] = preset;
      });
      if (!selected.action) {
        throw new Error(state.lang === "zh" ? "请先选择动作。" : "Choose an action first.");
      }
      state.advancedSelectedPresets = {
        ...(state.advancedSelectedPresets || {}),
        ...selected,
      };
      renderAdvancedPresetBuilder();
      updateAdvancedModelControls();
      setTab("advanced");
      setAdvancedSideTab("result");
      await submitAdvancedGenerate();
    },
  });
}

async function imageUrlToDataUrl(url = "") {
  const raw = String(url || "").trim();
  if (!raw) return "";
  if (raw.startsWith("data:")) return raw;
  const response = await fetch(raw);
  if (!response.ok) throw new Error(`Failed to load character image: ${response.status}`);
  const blob = await response.blob();
  return await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error || new Error("Failed to read character image."));
    reader.readAsDataURL(blob);
  });
}

function renderLegacyTemplates() {
  const list = state.templates.filter((template) => {
    if (isHiddenCategory({ id: template.category, name: template.category })) return false;
    if (state.category !== "all" && template.category !== state.category) return false;
    return true;
  });

  els.templateGrid.innerHTML = list.length ? list.map((template) => `
    <article class="template-card" data-card-template-id="${escapeHtml(template.id)}">
      <img class="template-cover" src="${escapeHtml(template.coverUrl || DEFAULT_TEMPLATE_COVER)}" alt="${escapeHtml(localizedTemplateTitle(template))}" loading="lazy" />
      ${template.previewUrl || template.hoverPreviewUrl ? `<video class="template-hover-video" data-src="${escapeHtml(template.hoverPreviewUrl || template.previewUrl)}" poster="${escapeHtml(template.coverUrl || DEFAULT_TEMPLATE_COVER)}" muted loop playsinline preload="none" disablepictureinpicture></video>` : ""}
      <div class="template-meta">
        <button class="use-template" data-template-id="${escapeHtml(template.id)}" type="button">${escapeHtml(templateActionLabel(template))}</button>
      </div>
    </article>
  `).join("") : `<div class="job-note">${escapeHtml(t("gallery.noTemplates"))}</div>`;

  els.templateGrid.querySelectorAll("[data-template-id]").forEach((button) => {
    button.addEventListener("click", () => openTemplate(button.dataset.templateId));
  });
  els.templateGrid.querySelectorAll(".template-card").forEach((card) => {
    const video = card.querySelector(".template-hover-video");
    const cover = card.querySelector(".template-cover");
    const useFallbackCover = () => {
      if (!cover || cover.dataset.fallbackApplied === "1") return;
      cover.dataset.fallbackApplied = "1";
      if (video) {
        card.classList.add("cover-failed");
        video.load();
        return;
      }
      if (cover.getAttribute("src") !== DEFAULT_TEMPLATE_COVER) {
        cover.src = DEFAULT_TEMPLATE_COVER;
      }
    };
    cover?.addEventListener("error", useFallbackCover);
    if (cover?.complete && cover.naturalWidth === 0) useFallbackCover();
    bindHoverPreviewCard({
      card,
      video,
      cover,
      fallbackCover: DEFAULT_TEMPLATE_COVER,
      tapToPreview: true,
    });
  });
  refreshIcons();
}

function isHiddenCategory(category) {
  const value = `${category?.id || ""} ${category?.name || ""}`.toLowerCase();
  return value.includes("business") || value.includes("商业接入");
}

function previewRatioFromItem(item = {}) {
  const params = item.params && typeof item.params === "object" ? item.params : {};
  const requestJson = item.requestJson && typeof item.requestJson === "object" ? item.requestJson : {};
  return item.ratio || params.ratio || params.aspect_ratio || requestJson.ratio || requestJson.aspect_ratio || "16:9";
}

function playPreview({ title = "", previewUrl = "", posterUrl = "", ratio = "16:9" } = {}) {
  if (!previewUrl || !els.previewDialog || !els.previewVideo || !els.previewImage) return;
  prepareModalOpen();
  document.querySelectorAll(".history-media video").forEach((video) => video.pause());
  els.previewTitle.textContent = title || t("common.preview");
  els.previewImage.hidden = true;
  els.previewImage.removeAttribute("src");
  els.previewVideo.pause();
  els.previewVideo.preload = "metadata";
  els.previewVideo.setAttribute("style", ratioStyle(ratio));
  if (posterUrl) els.previewVideo.poster = posterUrl;
  else els.previewVideo.removeAttribute("poster");
  els.previewVideo.src = previewUrl;
  els.previewVideo.hidden = false;
  if (els.previewActions) els.previewActions.hidden = false;
  if (els.previewDownloadBtn) {
    els.previewDownloadBtn.href = previewUrl;
    els.previewDownloadBtn.setAttribute("download", `${String(title || "explore-video").replace(/[^a-z0-9_-]+/gi, "-") || "explore-video"}.mp4`);
  }
  if (!els.previewDialog.open) els.previewDialog.showModal();
  els.previewVideo.load();
  els.previewVideo.play().catch(() => {});
}

function previewImage({ title = "", imageUrl = "" } = {}) {
  if (!imageUrl || !els.previewDialog || !els.previewVideo || !els.previewImage) return;
  prepareModalOpen();
  els.previewTitle.textContent = title || t("common.preview");
  els.previewVideo.pause();
  els.previewVideo.hidden = true;
  els.previewVideo.removeAttribute("src");
  els.previewVideo.removeAttribute("style");
  els.previewVideo.load();
  els.previewImage.src = imageUrl;
  els.previewImage.hidden = false;
  if (els.previewActions) els.previewActions.hidden = true;
  if (els.previewDownloadBtn) els.previewDownloadBtn.removeAttribute("href");
  if (!els.previewDialog.open) els.previewDialog.showModal();
}

async function submitSupportMessage() {
  if (!state.user) {
    if (els.supportStatus) els.supportStatus.textContent = "Login is required to send a site message. Telegram support is available above.";
    return;
  }
  const email = String(els.supportEmail?.value || "").trim();
  const subject = String(els.supportSubject?.value || "").trim();
  const message = String(els.supportMessage?.value || "").trim();
  if (els.supportStatus) els.supportStatus.textContent = "";
  if (!email) {
    if (els.supportStatus) els.supportStatus.textContent = "Email is required.";
    return;
  }
  if (!message) {
    if (els.supportStatus) els.supportStatus.textContent = "Message is required.";
    return;
  }
  if (els.supportSubmitBtn) {
    els.supportSubmitBtn.disabled = true;
    els.supportSubmitBtn.innerHTML = `<i data-lucide="loader-circle"></i>Sending...`;
    refreshIcons();
  }
  try {
    await requestJson("/api/support-messages", {
      method: "POST",
      body: { email, subject, message },
    });
    if (els.supportStatus) els.supportStatus.textContent = "Sent. We will reply in admin.";
    if (els.supportSubject) els.supportSubject.value = "";
    if (els.supportMessage) els.supportMessage.value = "";
  } catch (error) {
    if (els.supportStatus) els.supportStatus.textContent = error.message || String(error);
  } finally {
    if (els.supportSubmitBtn) {
      els.supportSubmitBtn.disabled = false;
      els.supportSubmitBtn.innerHTML = `<i data-lucide="send"></i>Send`;
      refreshIcons();
    }
  }
}

function historyDetailPayload(record = {}) {
  return {
    taskId: record.taskId || "",
    status: statusLabel(record.status),
    source: publicModelText(record.source || ""),
    prompt: record.finalPrompt || record.prompt || "",
    params: record.upstreamPayload || record.params || null,
    ratio: record.upstreamPayload?.ratio || record.upstreamPayload?.aspect_ratio || record.ratio || record.params?.ratio || record.params?.aspect_ratio || "",
    resolution: record.upstreamPayload?.resolution || record.resolution || record.params?.resolution || "",
    duration: record.upstreamPayload?.duration || record.duration || "",
    mediaMode: publicModelText(record.mediaMode || record.params?.mediaMode || ""),
    billing: record.billing || null,
    error: record.error || "",
    poster: generationPosterUrl(record) || "",
    result: generationVideoUrl(record) || generationImageResultUrl(record) || "",
    createdAt: record.createdAt || "",
    updatedAt: record.updatedAt || "",
  };
}

function publicHistoryParams(value) {
  if (value === null || value === undefined) return value;
  if (Array.isArray(value)) return value.map(publicHistoryParams);
  if (typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [publicModelKey(key), publicHistoryParams(item)]));
  }
  return typeof value === "string" ? publicModelText(value) : value;
}

function openHistoryDetail(index) {
  const record = state.historyRecords?.[Number(index || 0)];
  if (!record || !els.historyDetailDialog || !els.historyDetailBody) return;
  prepareModalOpen();
  const title = publicModelText(record.templateTitle || record.sceneEntryName || record.sceneName || t("history.detailTitle"));
  const videoUrl = generationVideoUrl(record);
  // The local generated copy is served by the site's optimized static
  // handler and supports byte ranges. Prefer it for the detail preview when
  // it is still present, while retaining the R2 URL as a fallback after the
  // local retention cleanup runs.
  const localVideoUrl = String(record.localVideoUrl || "").trim();
  const previewVideoUrl = localVideoUrl || videoUrl;
  const imageResultUrl = generationImageResultUrl(record);
  const recordRatio = record.ratio || record.params?.ratio || record.params?.aspect_ratio || "16:9";
  const images = recordImageAssets(record);
  const videos = recordVideoAssets(record);
  const canDownload = canDownloadGenerationRecord(record);
  els.historyDetailTitle.textContent = title || t("history.detailTitle");
  stopModalMedia(els.historyDetailBody);
  els.historyDetailBody.innerHTML = `
    <section class="history-detail-section">
      <header>
        <strong>${escapeHtml(t("history.result"))}</strong>
        <span>${escapeHtml(record.taskId || "")}</span>
        ${canDownload ? `
          <button class="history-download history-detail-download" type="button" data-history-detail-download>
            <i data-lucide="download"></i>${escapeHtml(t("history.download"))}
          </button>
        ` : ""}
      </header>
      ${previewVideoUrl ? `
        <video data-history-detail-result-video src="${escapeHtml(previewVideoUrl)}" ${generationPosterUrl(record) ? `poster="${escapeHtml(generationPosterUrl(record))}"` : ""} controls playsinline preload="metadata" style="${escapeHtml(ratioStyle(recordRatio))}"></video>
      ` : imageResultUrl ? `
        <div class="history-detail-images">
          <figure>
            <img src="${escapeHtml(imageResultUrl)}" alt="" loading="lazy" />
            <figcaption>${escapeHtml(t("history.result"))}</figcaption>
          </figure>
        </div>
      ` : `<pre>${escapeHtml(record.error || statusLabel(record.status))}</pre>`}
    </section>
    <section class="history-detail-section">
      <header><strong>${escapeHtml(t("history.parameters"))}</strong></header>
      <pre>${escapeHtml(JSON.stringify(historyDetailPayload(record), null, 2))}</pre>
    </section>
    <section class="history-detail-section">
      <header>
        <strong>${escapeHtml(t("history.inputImages"))}</strong>
      </header>
      ${images.length || videos.length ? `
        <div class="history-detail-images">
          ${videos.map((asset) => `
            <figure>
              <video src="${escapeHtml(asset.videoUrl)}" muted playsinline preload="metadata" controls></video>
              <figcaption>${escapeHtml(asset.label || "")}</figcaption>
            </figure>
          `).join("")}
          ${images.map((asset) => `
            <figure>
              <img src="${escapeHtml(mediaAssetPreviewUrl(asset))}" alt="" loading="lazy" />
              <figcaption>${escapeHtml(asset.label || "")}</figcaption>
            </figure>
          `).join("")}
        </div>
      ` : `<p class="history-detail-empty">${escapeHtml(t("history.noInputImages"))}</p>`}
    </section>
  `;
  els.historyDetailBody.querySelector("[data-history-detail-download]")?.addEventListener("click", () => {
    downloadGenerationRecord(record);
  });
  const detailVideo = els.historyDetailBody.querySelector("[data-history-detail-result-video]");
  if (detailVideo && localVideoUrl && videoUrl && localVideoUrl !== videoUrl) {
    detailVideo.addEventListener("error", () => {
      if (detailVideo.dataset.fallbackTried === "1") return;
      detailVideo.dataset.fallbackTried = "1";
      detailVideo.src = videoUrl;
      detailVideo.load();
    }, { once: true });
  }
  if (!els.historyDetailDialog.open) els.historyDetailDialog.showModal();
  refreshIcons();
}

function openPreview(templateId) {
  const template = state.templates.find((item) => item.id === templateId);
  playPreview({ title: template?.title, previewUrl: template?.previewUrl, ratio: previewRatioFromItem(template) });
}

function openAdvancedPreview(index) {
  const cases = state.advancedCases.filter((item) => item.enabled !== false);
  const item = cases[Number(index || 0)];
  playPreview({ title: item?.title, previewUrl: advancedCaseOutputVideo(item), ratio: previewRatioFromItem(item) });
}

function advancedCaseById(id = "") {
  const target = String(id || "").trim();
  return state.advancedCases.find((item) => String(item.id || "") === target) || null;
}

function advancedCaseInputImage(item = {}) {
  const candidates = [
    item.inputImageUrl,
    item.sourceImageUrl,
    item.referenceImageUrl,
    item.referenceUrl,
    item.imageUrl,
    item.params?.inputImageUrl,
    item.params?.sourceImageUrl,
    item.params?.referenceImageUrl,
    item.mediaAssets?.find?.((asset) => asset && !["reference_video", "first_clip", "driving_audio"].includes(asset.type))?.imageUrl,
    item.mediaAssets?.find?.((asset) => asset && !["reference_video", "first_clip", "driving_audio"].includes(asset.type))?.localUrl,
    item.sourceCoverUrl,
  ];
  return candidates.map((value) => String(value || "").trim()).find(Boolean) || item.coverUrl || DEFAULT_TEMPLATE_COVER;
}

function advancedCaseInputVideo(item = {}) {
  const candidates = [
    item.inputVideoUrl,
    item.params?.inputVideoUrl,
    item.params?.sourceVideoUrl,
    item.params?.firstClipUrl,
    item.params?.first_clip_url,
    item.mediaAssets?.find?.((asset) => asset && ["reference_video", "first_clip"].includes(asset.type))?.videoUrl,
    item.mediaAssets?.find?.((asset) => asset && ["reference_video", "first_clip"].includes(asset.type))?.url,
    item.mediaAssets?.find?.((asset) => asset && ["reference_video", "first_clip"].includes(asset.type))?.localUrl,
  ];
  return candidates.map((value) => String(value || "").trim()).find(Boolean) || "";
}

function advancedCaseInputVideoPoster(item = {}) {
  const inputVideoUrl = advancedCaseInputVideo(item);
  const candidates = [
    item.inputVideoPosterUrl,
    item.sourceVideoPosterUrl,
    item.params?.inputVideoPosterUrl,
    item.params?.sourceVideoPosterUrl,
    item.mediaAssets?.find?.((asset) => asset && ["reference_video", "first_clip"].includes(asset.type))?.posterUrl,
    item.mediaAssets?.find?.((asset) => asset && ["reference_video", "first_clip"].includes(asset.type))?.imageUrl,
    item.mediaAssets?.find?.((asset) => asset && ["reference_video", "first_clip"].includes(asset.type))?.thumbnailUrl,
    item.mediaAssets?.find?.((asset) => asset && ["reference_video", "first_clip"].includes(asset.type))?.localPosterUrl,
    generatedPosterFromVideoUrl(inputVideoUrl),
  ];
  return candidates.map((value) => String(value || "").trim()).find(Boolean) || item.sourceCoverUrl || item.localCoverUrl || item.coverUrl || item.inputImageUrl || item.sourceImageUrl || DEFAULT_TEMPLATE_COVER;
}

function syncGalleryShortcutNav() {
  document.querySelectorAll("[data-gallery-shortcut]").forEach((button) => {
    const mode = normalizeGalleryMode(button.dataset.galleryShortcut || "");
    const disabled = !isGalleryModeAllowed(button.dataset.galleryShortcut || "");
    button.hidden = disabled;
    const active = state.tab === DEFAULT_PLATFORM_TAB && mode === normalizeGalleryMode(state.galleryMode);
    button.classList.toggle("is-active", active);
    const countEl = button.querySelector("[data-gallery-shortcut-count]");
    if (countEl) {
      countEl.textContent = !disabled && isPlayfluxGalleryMode(mode) ? String(allPlayfluxTemplates().filter((item) => item.tab === playfluxTabFromGalleryMode(mode)).length) : "";
    }
  });
}

function renderGalleryModeTabs() {
  if (!els.galleryModeTabs) return;
  els.galleryModeTabs.hidden = true;
  els.galleryModeTabs.innerHTML = "";
  syncGalleryShortcutNav();
}

function advancedCaseOutputVideo(item = {}) {
  const candidates = [
    item.previewUrl,
    item.localVideoUrl,
    item.cdnVideoUrl,
    item.hoverPreviewUrl,
    item.sourceVideoUrl,
    item.mediaSourceVideoUrl,
  ];
  return candidates.map((value) => String(value || "").trim()).find(Boolean) || "";
}

function generatedPosterFromVideoUrl(videoUrl = "") {
  const raw = String(videoUrl || "").trim();
  const match = raw.match(/^(.*\/assets\/generated\/)videos\/([^/?#]+)\.(?:mp4|webm|mov|m4v)([?#].*)?$/i);
  if (!match) return "";
  return `${match[1]}posters/${match[2]}.jpg`;
}

function advancedCaseOutputPoster(item = {}) {
  const candidates = [
    item.outputPosterUrl,
    item.resultPosterUrl,
    item.posterUrl,
    generatedPosterFromVideoUrl(item.sourceVideoUrl),
    generatedPosterFromVideoUrl(item.mediaSourceVideoUrl),
    generatedPosterFromVideoUrl(item.localVideoUrl),
    generatedPosterFromVideoUrl(item.previewUrl),
    item.localCoverUrl,
    item.coverUrl,
    item.cdnCoverUrl,
    item.sourceCoverUrl,
    item.mediaSourceCoverUrl,
  ];
  return candidates.map((value) => String(value || "").trim()).find(Boolean) || DEFAULT_TEMPLATE_COVER;
}

function openAdvancedRowPreview(caseId, kind = "output") {
  const item = advancedCaseById(caseId);
  if (!item) return;
  const previewUrl = kind === "input" ? advancedCaseInputVideo(item) : advancedCaseOutputVideo(item);
  playPreview({ title: item.title || t("advanced.defaultCase"), previewUrl, ratio: previewRatioFromItem(item) });
}

function advancedCaseStageTile({ className = "", imageUrl = "", videoUrl = "", label = "", isVideo = false, caseId = "", previewKind = "" } = {}) {
  const playable = Boolean(isVideo && previewKind && videoUrl);
  const poster = imageUrl || DEFAULT_TEMPLATE_COVER;
  const media = `<img src="${escapeHtml(poster)}" alt="" loading="lazy" />`;
  return `
    <div class="advanced-case-row-media ${className} ${isVideo ? "is-video" : "is-image"}">
      ${media}
      <span class="advanced-case-stage-label">${escapeHtml(label)}</span>
      ${isVideo ? `<span class="advanced-case-video-mark"><i data-lucide="play"></i></span>` : ""}
      ${playable ? `<button class="advanced-case-stage-hit" data-advanced-row-preview-id="${escapeHtml(caseId)}" data-advanced-row-preview-kind="${escapeHtml(previewKind)}" type="button" aria-label="${escapeHtml(t("common.preview"))}"></button>` : ""}
    </div>
  `;
}

function advancedCasePromptText(item = {}) {
  const params = item.params && typeof item.params === "object" ? item.params : {};
  return String(item.prompt || params.prompt || t("advanced.casePromptFallback")).trim();
}

function fillAdvancedCasePrompt(item = {}) {
  if (!item) return;
  const prompt = advancedCasePromptText(item);
  const provider = advancedCaseProvider(item);
  if (els.advancedProvider) {
    els.advancedProvider.value = provider;
    updateAdvancedModelControls();
  }
  if (els.advancedPrompt) {
    els.advancedPrompt.value = prompt;
    els.advancedPrompt.focus?.();
  }
  state.activeAdvancedCaseId = "";
  updateAdvancedButtonCost();
  if (els.advancedNote) els.advancedNote.textContent = t("advanced.casePromptLoaded");
}

function renderAdvancedCaseCard({ item, index }) {
  const title = item.title || t("advanced.defaultCase");
  const provider = advancedCaseProvider(item);
  const params = item.params && typeof item.params === "object" ? item.params : {};
  const duration = advancedCaseDuration(item);
  const resolution = normalizeAdvancedResolution(params.resolution || item.resolution || "720p", provider);
  const cover = advancedCaseOutputPoster(item) || item.coverUrl || DEFAULT_TEMPLATE_COVER;
  const preview = advancedCaseOutputVideo(item) || item.previewUrl || item.hoverPreviewUrl || "";
  return `
    <article class="advanced-case-card" data-case-index="${index}" data-case-id="${escapeHtml(item.id || "")}">
      <img class="advanced-case-cover" src="${escapeHtml(cover)}" alt="${escapeHtml(title)}" loading="lazy" />
      ${preview ? `<video class="advanced-case-hover-video" data-src="${escapeHtml(preview)}" poster="${escapeHtml(cover)}" muted loop playsinline preload="none" disablepictureinpicture></video>` : ""}
      ${preview ? `<button class="preview-play advanced-preview-play" data-advanced-preview-index="${index}" type="button" aria-label="${escapeHtml(t("common.preview"))}"><i data-lucide="play"></i></button>` : ""}
      <div class="advanced-case-card-meta">
        <span>${escapeHtml(resolution)} / ${escapeHtml(t("cost.seconds", { value: duration }))}</span>
        <strong>${escapeHtml(title)}</strong>
      </div>
    </article>
  `;
}

function renderAdvancedCaseRow({ item, index }) {
  const caseId = String(item.id || "");
  const title = item.title || t("advanced.defaultCase");
  const inputImage = advancedCaseInputImage(item);
  const inputVideo = advancedCaseInputVideo(item);
  const inputVideoPoster = advancedCaseInputVideoPoster(item);
  const outputVideo = advancedCaseOutputVideo(item);
  const outputPoster = advancedCaseOutputPoster(item);
  const tab = normalizeAdvancedCaseTab(item.category || item.caseCategory || item.tab);
  const showReplaceVideoSlot = tab === "replace" && (inputVideo || inputVideoPoster);
  return `
    <article class="advanced-case-row" data-case-index="${index}" data-case-id="${escapeHtml(caseId)}">
      <div class="advanced-case-row-input ${tab === "replace" ? "is-replace" : ""}">
        ${showReplaceVideoSlot ? `
          ${advancedCaseStageTile({ className: "advanced-case-row-source-video", imageUrl: inputVideoPoster, videoUrl: inputVideo, label: t("advanced.caseInputVideo"), isVideo: true, caseId, previewKind: inputVideo ? "input" : "" })}
        ` : ""}
        ${advancedCaseStageTile({ className: "advanced-case-row-image", imageUrl: inputImage, label: tab === "replace" ? t("advanced.caseImage") : t("advanced.caseInputImage"), isVideo: false, caseId })}
      </div>
      <div class="advanced-case-row-arrow"><i data-lucide="arrow-right"></i></div>
      ${advancedCaseStageTile({ className: "advanced-case-row-video", imageUrl: outputPoster, videoUrl: outputVideo, label: t("advanced.caseResultVideo"), isVideo: true, caseId, previewKind: outputVideo ? "output" : "" })}
      <div class="advanced-case-row-action">
        <strong>${escapeHtml(title)}</strong>
        <button class="ghost-button advanced-case-use-prompt" data-advanced-fill-prompt-id="${escapeHtml(caseId)}" type="button"><i data-lucide="text-cursor-input"></i>${escapeHtml(t("advanced.usePrompt"))}</button>
        <p class="advanced-case-row-hint">${escapeHtml(t("advanced.casePromptHint"))}</p>
      </div>
    </article>
  `;
}

function renderAdvancedCasePager(tab, page, totalPages) {
  if (totalPages <= 1) return "";
  return `
    <div class="advanced-case-pager">
      <button class="ghost-button" type="button" data-case-page="${page - 1}" ${page <= 1 ? "disabled" : ""}><i data-lucide="chevron-left"></i></button>
      <span>${page} / ${totalPages}</span>
      <button class="ghost-button" type="button" data-case-page="${page + 1}" ${page >= totalPages ? "disabled" : ""}><i data-lucide="chevron-right"></i></button>
    </div>
  `;
}

function normalizeAdvancedCaseTab(value = "") {
  const raw = String(value || "").trim().toLowerCase();
  if (raw === "characters" || raw.includes("character") || raw.includes("explore")) return "characters";
  if (raw.includes("extend")) return "extend";
  if (raw.includes("replace")) return "replace";
  if (raw === "hot" || raw.includes("热门") || raw.includes("popular")) return "hot";
  return "hot";
}

function normalizeGalleryMode(value = "") {
  const raw = String(value || "").trim().toLowerCase();
  if (isGalleryModeAllowed(raw)) return raw;
  return tenantDefaultGalleryMode();
}

function advancedCaseTabLabel(tab = "hot") {
  const item = ADVANCED_CASE_TABS.find((entry) => entry.id === tab) || ADVANCED_CASE_TABS[0];
  return t(item.labelKey, {}, item.id);
}

let stripeConfigPromise = null;

function stripeCheckoutVisible() {
  return Boolean(
    els.topupDialog?.open &&
    state.topupStep === "payment" &&
    state.topupMethod === "stripe" &&
    !els.topupPaymentStage?.hidden &&
    !els.topupStripePanel?.hidden,
  );
}

function topupPayableAmountText(order = {}) {
  return String(order.payableAmountText || order.payableAmount || order.baseAmount || order.amount || "").trim();
}

function topupCurrentTronAddress() {
  return String(
    window.tronWeb?.defaultAddress?.base58 ||
    window.tronLink?.tronWeb?.defaultAddress?.base58 ||
    "",
  ).trim();
}

function topupTronLinkTransferUri({ orderId = "", address = "", amount = "", network = "TRC20" } = {}) {
  const from = topupCurrentTronAddress();
  const to = String(address || "").trim();
  if (!to || !/tron|trc20/i.test(String(network || ""))) return "";
  const origin = window.location.origin || "";
  const pathname = window.location.pathname || "/platform.html";
  const param = {
    url: `${origin}${pathname}`,
    callbackUrl: `${origin}/api/pay/tronlink/callback`,
    dappName: "Vipeak AI",
    protocol: "TronLink",
    version: "1.0",
    chainId: "0x2b6653dc",
    memo: orderId ? `Top up ${orderId}` : "Top up",
    from,
    to,
    loginAddress: from,
    tokenId: "",
    contract: TRON_USDT_CONTRACT,
    amount: String(amount || ""),
    action: "transfer",
    actionId: String(orderId || ""),
  };
  return `tronlinkoutside://pull.activity?param=${encodeURIComponent(JSON.stringify(param))}`;
}

function topupPaymentUri({ orderId = "", address = "", amount = "", asset = "USDT", network = "TRC20" } = {}) {
  const cleanAddress = String(address || "").trim();
  if (!cleanAddress) return "";
  const deepLink = topupTronLinkTransferUri({ orderId, address: cleanAddress, amount, network });
  if (deepLink) return deepLink;
  const params = new URLSearchParams();
  if (amount) params.set("amount", String(amount));
  params.set("asset", String(asset || "USDT").toUpperCase());
  params.set("network", String(network || "TRC20").toUpperCase());
  return `tron:${cleanAddress}?${params.toString()}`;
}

function qrImageUrlForData(data = "") {
  const text = String(data || "").trim();
  if (!text) return "";
  return `https://api.qrserver.com/v1/create-qr-code/?size=236x236&margin=12&data=${encodeURIComponent(text)}`;
}

function topupUsdtUnits(amountText = "") {
  const cleaned = String(amountText || "").trim().replace(/[^\d.]/g, "");
  if (!cleaned) return "0";
  const [wholeRaw = "0", fractionRaw = ""] = cleaned.split(".");
  const whole = wholeRaw.replace(/^0+(?=\d)/, "") || "0";
  const fraction = `${fractionRaw.replace(/\D/g, "")}000000`.slice(0, 6);
  return `${whole}${fraction}`.replace(/^0+(?=\d)/, "") || "0";
}

function setTopupConfirmStatus(message = "", tone = "") {
  if (!els.topupConfirmStatus) return;
  els.topupConfirmStatus.textContent = message;
  els.topupConfirmStatus.dataset.tone = tone || "";
}

function setTopupQrStep(step = "transfer") {
  const next = step === "confirm" ? "confirm" : "transfer";
  state.topupPayStep = next;
  if (els.topupTransferStep) els.topupTransferStep.hidden = next !== "transfer";
  if (els.topupConfirmStep) els.topupConfirmStep.hidden = next !== "confirm";
  [els.topupStepTransfer, els.topupStepConfirm].forEach((button) => {
    if (!button) return;
    const active = button.dataset.topupPayStep === next;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-selected", active ? "true" : "false");
  });
  if (next === "confirm") {
    window.setTimeout(() => els.topupTxHashInput?.focus(), 50);
  }
  syncTopupBackButtons();
}

function copyTopupValue(value = "", message = "") {
  const text = String(value || "").trim();
  if (!text) return;
  navigator.clipboard?.writeText(text).then(() => {
    if (els.topupRate && message) els.topupRate.textContent = message;
    setTopupConfirmStatus(message || t("topup.addressCopied"), "success");
  }).catch(() => {
    setTopupConfirmStatus(t("common.copyFailed", {}, "Copy failed. Please copy manually."), "error");
  });
}

function topupPackages() {
  const configured = Array.isArray(state.wallet?.topupPackages) ? state.wallet.topupPackages : [];
  const fallback = tenantFeature("subscriptions", false) ? DEFAULT_TOOL_TOPUP_PACKAGES : DEFAULT_TOPUP_PACKAGES;
  const packages = configured.length ? configured : fallback;
  return packages
    .map((item) => ({
      id: String(item.id || `usd-${item.amount || ""}`).trim(),
      amount: Number(item.amount || 0),
      credits: creditsAmount(item.credits),
      currency: String(item.currency || "USD").trim().toUpperCase() || "USD",
    }))
    .filter((item) => item.id && item.amount > 0 && item.credits > 0);
}

function billingEnabled() {
  return Boolean(state.billing?.enabled && (tenantFeature("subscriptions", false) || membershipProgramEnabled()));
}

function billingPlans() {
  return billingEnabled() && Array.isArray(state.billing?.plans) ? state.billing.plans : [];
}

function isHiddenToolSubscriptionPlan(plan = {}) {
  return Boolean(
    tenantFeature("subscriptions", false) &&
    Number(plan.amount || 0) === 20 &&
    String(plan.intervalUnit || "").toLowerCase() === "month" &&
    Number(plan.intervalCount || 1) === 1,
  );
}

function selectedBillingPlan() {
  const plans = billingPlans();
  if (!plans.length) return null;
  return plans.find((item) => item.id === state.selectedBillingPlanId) || null;
}

function selectedBillingProduct() {
  const products = Array.isArray(state.billing?.products) ? state.billing.products : [];
  if (!products.length) return null;
  return products.find((item) => item.id === state.selectedProductId) || null;
}

function selectBillingPlan(planId = "") {
  const plan = billingPlans().find((item) => item.id === planId) || billingPlans()[0];
  if (!plan) return;
  state.selectedBillingPlanId = plan.id;
  state.selectedProductId = "";
  state.selectedTopupPackageId = "";
  setTopupMethod("stripe", { skipSummary: true });
  setTopupStep("payment");
}

function billingPeriodLabel(plan = {}) {
  const count = Math.max(1, Number(plan.intervalCount || 1) || 1);
  const unit = String(plan.intervalUnit || "month").toLowerCase();
  if (unit === "lifetime") return "lifetime";
  if (count === 1) return unit === "year" ? "year" : unit === "day" ? "day" : "month";
  return `${count} ${unit}s`;
}

function renderToolSubscription() {
  if (!els.toolSubscriptionPanel) return;
  const plan = billingPlans().find((item) => !isHiddenToolSubscriptionPlan(item)) || null;
  const visible = Boolean(plan && !membershipProgramEnabled());
  els.toolSubscriptionPanel.hidden = !visible;
  if (els.toolTopupLabel) els.toolTopupLabel.hidden = !visible;
  if (!plan) return;
  const subscription = state.billing?.subscription || null;
  const active = subscription?.status === "active" && (!subscription.currentPeriodEnd || Date.parse(subscription.currentPeriodEnd) > Date.now());
  if (els.toolSubscriptionName) els.toolSubscriptionName.textContent = plan.name || "Pro";
  if (els.toolSubscriptionPrice) els.toolSubscriptionPrice.textContent = `$${formatCredits(plan.amount)} / ${billingPeriodLabel(plan)}`;
  if (els.toolSubscriptionCredits) els.toolSubscriptionCredits.textContent = `${formatCredits(plan.includedCredits)} ${t("common.credits")}`;
  if (els.toolSubscriptionBtn) {
    els.toolSubscriptionBtn.textContent = active ? "Renew" : "Subscribe";
    els.toolSubscriptionBtn.onclick = () => selectBillingPlan(plan.id);
  }
  if (els.toolSubscriptionStatus) {
    const end = active && subscription.currentPeriodEnd
      ? new Date(subscription.currentPeriodEnd).toLocaleDateString(state.lang || undefined)
      : "";
    els.toolSubscriptionStatus.textContent = active ? `Active until ${end}` : "";
  }
}

function selectedTopupPackage() {
  if (state.selectedBillingPlanId || state.selectedProductId) return null;
  const packages = topupPackages();
  if (!packages.length) return null;
  return packages.find((item) => item.id === state.selectedTopupPackageId) || packages[0];
}

function setTopupStep(step = "packages") {
  state.topupStep = step === "payment" ? "payment" : "packages";
  if (els.topupPackageStage) els.topupPackageStage.hidden = state.topupStep !== "packages";
  if (els.topupPaymentStage) els.topupPaymentStage.hidden = state.topupStep !== "payment";
  syncTopupBackButtons();
  renderTopupSummary();
  if (stripeCheckoutVisible()) renderStripeCheckout();
  refreshIcons();
}

function selectTopupPackage(packageId = "") {
  const packages = topupPackages();
  const selected = packages.find((item) => item.id === packageId) || packages[0];
  if (!selected) return;
  state.selectedBillingPlanId = "";
  state.selectedProductId = "";
  state.selectedTopupPackageId = selected.id;
  setTopupMethod("stripe", { skipSummary: true });
  setTopupStep("payment");
}

function walletCreditsForAmount(amount) {
  const matched = topupPackages().find((item) => Number(item.amount) === Number(amount));
  if (matched) return matched.credits;
  const rate = Number(state.wallet?.creditsPerUsd || 100);
  return Math.max(0, Math.round(Number(amount || 0) * rate * 10000) / 10000);
}

function walletOptionList() {
  const options = Array.isArray(state.wallet?.options) ? state.wallet.options.filter((option) => option?.address) : [];
  if (options.length) return options;
  if (state.wallet?.address) {
    return [{
      id: state.wallet.network || "wallet",
      label: state.wallet.network || "USDT",
      network: state.wallet.network || "TRC20",
      asset: state.wallet.asset || "USDT",
      address: state.wallet.address,
      qrUrl: state.wallet.qrUrl || "",
      explorerUrl: state.wallet.explorerUrl || "",
    }];
  }
  return [];
}

function selectedWalletOption() {
  const options = walletOptionList();
  const selectedId = String(state.selectedWalletOptionId || "").trim();
  return options.find((option) => option.id === selectedId) || options[0] || null;
}

function ensureSelectedWalletOption() {
  const options = walletOptionList();
  if (!options.length) {
    state.selectedWalletOptionId = "";
    return null;
  }
  if (!options.some((option) => option.id === state.selectedWalletOptionId)) {
    state.selectedWalletOptionId = options[0].id || "";
  }
  return selectedWalletOption();
}

function renderWalletOptions() {
  if (!els.topupWalletOptions) return;
  const options = walletOptionList();
  const selected = ensureSelectedWalletOption();
  if (options.length <= 1) {
    els.topupWalletOptions.innerHTML = "";
    return;
  }
  els.topupWalletOptions.innerHTML = `
    <div class="topup-wallet-options-head">
      <span>${escapeHtml(t("topup.walletNetwork"))}</span>
      <small>${escapeHtml(t("topup.walletNetworkHint"))}</small>
    </div>
    <div class="topup-wallet-option-grid">
      ${options.map((option) => `
        <button class="topup-wallet-option ${option.id === selected?.id ? "is-active" : ""}" type="button" data-wallet-option="${escapeHtml(option.id)}">
          <strong>${escapeHtml(option.label || option.network || option.asset || "USDT")}</strong>
          <small>${escapeHtml(option.network || "")}</small>
        </button>
      `).join("")}
    </div>
  `;
  els.topupWalletOptions.querySelectorAll("[data-wallet-option]").forEach((button) => {
    button.addEventListener("click", () => {
      state.selectedWalletOptionId = button.dataset.walletOption || "";
      renderTopupSummary();
    });
  });
}

function setTopupMethod(method = "stripe", options = {}) {
  const next = String(method || "").toLowerCase() === "stripe" ? "stripe" : "usdt";
  state.topupMethod = next;
  els.topupMethodTabs?.querySelectorAll("[data-topup-method]").forEach((button) => {
    const active = button.dataset.topupMethod === next;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-selected", active ? "true" : "false");
  });
  if (els.topupStripePanel) els.topupStripePanel.hidden = next !== "stripe";
  if (els.topupUsdtPanel) els.topupUsdtPanel.hidden = next !== "usdt";
  if (next === "stripe" && state.topupStep === "payment") renderStripeCheckout();
  if (!options.skipSummary) renderTopupSummary();
  refreshIcons();
}

function renderTopupQrDialog(order = null) {
  if (!order || !els.topupQrDialog) return;
  state.activeTopupOrder = order;
  const wallet = state.wallet || {};
  const selected = selectedWalletOption();
  const address = order?.address || selected?.address || wallet.address || "";
  const explorerUrl = order?.explorerUrl || selected?.explorerUrl || wallet.explorerUrl || "";
  const asset = order?.asset || selected?.asset || wallet.asset || "USDT";
  const network = order?.network || selected?.network || wallet.network || "TRC20";
  const amount = topupPayableAmountText(order);
  const paymentUri = topupPaymentUri({ orderId: order.id, address, amount, asset, network });
  const qrUrl = paymentUri ? qrImageUrlForData(paymentUri) : "";
  if (els.topupQrAmount) {
    els.topupQrAmount.textContent = `${amount} ${asset}`.trim();
  }
  if (els.topupQrAmountValue) {
    els.topupQrAmountValue.textContent = amount;
  }
  if (els.topupQrSubtitle) {
    els.topupQrSubtitle.textContent = t("topup.useNetwork", { network }, `Use ${network} network`);
  }
  if (els.topupWalletQr) {
    els.topupWalletQr.hidden = !qrUrl;
    if (qrUrl) els.topupWalletQr.src = qrUrl;
  }
  if (els.topupWalletNetwork) els.topupWalletNetwork.textContent = t("topup.assetNetwork", { asset, network }, `${asset} / ${network}`);
  if (els.topupWalletAddress) els.topupWalletAddress.textContent = address;
  if (els.topupQrCopyBtn) {
    els.topupQrCopyBtn.onclick = () => copyTopupAddress(address);
  }
  if (els.topupQrCopyAmountBtn) {
    els.topupQrCopyAmountBtn.onclick = () => copyTopupValue(amount, t("topup.amountCopied", {}, "Amount copied. Transfer this exact value."));
  }
  const explorerLink = document.querySelector("#topupWalletExplorer");
  if (explorerLink) {
    explorerLink.hidden = !explorerUrl;
    explorerLink.href = explorerUrl || "#";
  }
  if (els.topupTronLinkBtn) {
    els.topupTronLinkBtn.onclick = () => payTopupWithTronLink(order);
  }
  if (els.topupTransferDoneBtn) {
    els.topupTransferDoneBtn.onclick = () => setTopupQrStep("confirm");
  }
  if (els.topupQrBackBtn) els.topupQrBackBtn.onclick = handleTopupBack;
  if (els.topupSubmitHashBtn) {
    els.topupSubmitHashBtn.onclick = () => submitTopupHash(order.id, els.topupTxHashInput?.value || "");
  }
  if (els.topupTxHashInput) {
    els.topupTxHashInput.value = order.confirmationHash || "";
  }
  setTopupConfirmStatus(order.confirmationSubmittedAt ? t("topup.confirmSubmitted", {}, "Confirmation submitted. Waiting for chain verification.") : "", order.confirmationSubmittedAt ? "success" : "");
  setTopupQrStep("transfer");
  prepareModalOpen();
  if (els.topupDialog?.open) els.topupDialog.close();
  if (!els.topupQrDialog.open) els.topupQrDialog.showModal();
  syncTopupAutoRefresh();
  refreshIcons();
}

function copyTopupAddress(address = "") {
  if (!address) return;
  copyTopupValue(address, t("topup.addressCopied"));
}

function renderTopupPackages() {
  if (!els.topupPackageGrid) return;
  const packages = topupPackages();
  if (!state.selectedTopupPackageId && !state.selectedBillingPlanId && !state.selectedProductId && packages[0]) {
    state.selectedTopupPackageId = packages[0].id;
  }
  els.topupPackageGrid.innerHTML = packages.map((item) => {
    const active = item.id === state.selectedTopupPackageId;
    return `
      <button class="topup-package-card ${active ? "is-active" : ""}" type="button" data-topup-package="${escapeHtml(item.id)}">
        <span>${escapeHtml(item.currency)}</span>
        <strong>$${escapeHtml(formatCredits(item.amount))}</strong>
        <small>${escapeHtml(formatCredits(item.credits))} ${escapeHtml(t("common.credits"))}</small>
      </button>
    `;
  }).join("");
  els.topupPackageGrid.querySelectorAll("[data-topup-package]").forEach((button) => {
    button.addEventListener("click", () => selectTopupPackage(button.dataset.topupPackage || ""));
  });
}

function renderTopupSummary() {
  if (!els.topupPanel) return;
  renderToolSubscription();
  renderTopupPackages();
  const selectedPlan = selectedBillingPlan();
  const selectedProduct = selectedBillingProduct();
  const selectedPackage = selectedTopupPackage();
  const amount = selectedProduct?.amount || selectedPlan?.amount || selectedPackage?.amount || DEFAULT_TOPUP_AMOUNT;
  const credits = selectedProduct?.includedCredits || selectedPlan?.includedCredits || selectedPackage?.credits || walletCreditsForAmount(amount);
  const asset = state.wallet?.asset || "USDT";
  const selected = ensureSelectedWalletOption();
  const network = selected?.network || state.wallet?.network || "TRC20";
  if (els.topupCredits) els.topupCredits.textContent = t("cost.credits", { credits });
  if (els.topupSelectedPackage) {
    els.topupSelectedPackage.textContent = selectedProduct
      ? `${selectedProduct.name || "API Documentation Access"} / $${formatCredits(selectedProduct.amount)} / ${formatCredits(selectedProduct.includedCredits)} ${t("common.credits")}`
      : selectedPlan
      ? `${selectedPlan.name || "Pro"} / $${formatCredits(selectedPlan.amount)} / ${formatCredits(selectedPlan.includedCredits)} ${t("common.credits")}`
      : selectedPackage
      ? `$${formatCredits(selectedPackage.amount)} / ${formatCredits(selectedPackage.credits)} ${t("common.credits")}`
      : "";
  }
  if (els.topupPackageStage) els.topupPackageStage.hidden = state.topupStep !== "packages";
  if (els.topupPaymentStage) els.topupPaymentStage.hidden = state.topupStep !== "payment";
  syncTopupBackButtons();
  if (els.topupRate) {
    els.topupRate.textContent = state.user
      ? state.topupStep === "packages"
        ? t("topup.packages")
        : state.topupMethod === "stripe"
        ? t("topup.stripeReady", {}, "Continue on the secure payment page.")
        : t("topup.rate", { amount: amount || 0, asset, network })
      : t("topup.login");
  }
  renderWalletOptions();
}

function setBackButtonVisibility(button, visible) {
  if (!button) return;
  button.classList.toggle("is-hidden", !visible);
  button.setAttribute("aria-hidden", visible ? "false" : "true");
  if (visible) button.removeAttribute("tabindex");
  else button.setAttribute("tabindex", "-1");
}

function syncTopupBackButtons() {
  setBackButtonVisibility(els.topupBackBtn, state.topupStep === "payment");
  if (els.topupBackBtn) {
    const label = els.topupBackBtn.querySelector("span");
    if (label) label.textContent = state.selectedProductId ? t("common.back", {}, "Back") : t("topup.changePackage", {}, "Packages");
  }
  if (els.topupQrBackBtn) {
    const label = els.topupQrBackBtn.querySelector("span");
    if (label) label.textContent = state.topupPayStep === "confirm" ? t("topup.stepTransfer", {}, "Transfer") : t("common.back", {}, "Back");
  }
}

function handleTopupBack() {
  if (els.topupQrDialog?.open) {
    if (state.topupPayStep === "confirm") {
      setTopupQrStep("transfer");
      syncTopupBackButtons();
      refreshIcons();
      return;
    }
    els.topupQrDialog.close();
    prepareModalOpen();
    if (!els.topupDialog?.open) els.topupDialog?.showModal();
    setTopupStep("payment");
    setTopupMethod("usdt");
    renderTopupSummary();
    syncTopupAutoRefresh();
    refreshIcons();
    return;
  }
  if (els.topupDialog?.open && state.selectedProductId) {
    els.topupDialog.close();
    state.selectedProductId = "";
    return;
  }
  if (els.topupDialog?.open) setTopupStep("packages");
}

function renderTopupOrder(order) {
  if (!order) return;
  const isStripe = order.paymentProvider === "stripe" || order.network === "Stripe";
  if (els.topupCredits) els.topupCredits.textContent = t("cost.credits", { credits: order.creditAmount || 0 });
  if (isStripe) {
    if (els.topupRate) {
      els.topupRate.textContent = `${t("topup.stripeOrder", {}, "Stripe order")}: ${order.stripeCheckoutSessionId || order.id || ""}`;
    }
    refreshIcons();
    return;
  }
  renderTopupQrDialog(order);
  refreshIcons();
}

async function loadStripeConfig() {
  if (!stripeConfigPromise) {
    stripeConfigPromise = requestJson("/api/pay/stripe/config")
      .then((payload) => payload.stripe || {})
      .catch((error) => {
        stripeConfigPromise = null;
        throw error;
      });
  }
  return stripeConfigPromise;
}

async function startStripeRedirectCheckout() {
  if (!state.user) return openLogin();
  const billingPlan = selectedBillingPlan();
  const billingProduct = selectedBillingProduct();
  const topupPackage = selectedTopupPackage();
  const amount = Number(billingProduct?.amount || billingPlan?.amount || topupPackage?.amount || 0);
  if ((!billingProduct && !billingPlan && !topupPackage) || !Number.isFinite(amount) || amount < MIN_TOPUP_AMOUNT) {
    if (els.stripeStatus) els.stripeStatus.textContent = t("topup.invalid");
    return;
  }
  const button = els.stripeButtons?.querySelector("[data-stripe-start]");
  if (button) button.disabled = true;
  if (els.stripeStatus) els.stripeStatus.textContent = t("topup.stripeCreating");
  try {
    const returnUrl = `${window.location.origin}${window.location.pathname}#topups`;
    const payload = await requestJson("/api/pay/stripe/checkout-sessions", {
      method: "POST",
      body: {
        amount,
        ...(billingProduct
          ? { productId: billingProduct.id }
          : billingPlan
          ? { billingPlanId: billingPlan.id }
          : { packageId: topupPackage.id }),
        returnUrl,
        cancelUrl: returnUrl,
      },
    });
    const checkoutUrl = String(payload.checkoutUrl || payload.session?.checkoutUrl || "").trim();
    if (!checkoutUrl) throw new Error("Stripe checkout page was not created.");
    window.location.href = checkoutUrl;
  } catch (error) {
    if (els.stripeStatus) els.stripeStatus.textContent = error.message || String(error);
    if (button) button.disabled = false;
  }
}

async function renderStripeCheckout() {
  if (!els.stripeBox || !els.stripeButtons) return;
  if (!stripeCheckoutVisible()) return;
  try {
    const config = await loadStripeConfig();
    const billingPlan = selectedBillingPlan();
    const billingProduct = selectedBillingProduct();
    const topupPackage = selectedTopupPackage();
    const amount = Number(billingProduct?.amount || billingPlan?.amount || topupPackage?.amount || 0);
    if (!config.enabled) {
      els.stripeBox.hidden = false;
      els.stripeButtons.hidden = false;
      els.stripeButtons.innerHTML = "";
      if (els.stripeStatus) els.stripeStatus.textContent = t("topup.stripeUnavailable");
      return;
    }
    els.stripeBox.hidden = false;
    if (els.stripeStatus) {
      els.stripeStatus.textContent = amount
        ? `${t("topup.stripeReady")} ${formatCredits(amount)} ${config.currency || "USD"}`
        : t("topup.stripeReady");
    }
    els.stripeButtons.innerHTML = `
      <button class="paypal-redirect-button" type="button" data-stripe-start>
        <i data-lucide="external-link"></i>
        <span>${escapeHtml(t("topup.stripeContinue", {}, "Continue to Stripe"))}</span>
      </button>
      <p class="stripe-payment-method-note"><i data-lucide="badge-check"></i><strong>${escapeHtml(t("topup.stripeMethods", {}, "支持微信支付和信用卡"))}</strong><span>${escapeHtml(t("topup.stripeMethodsEn", {}, "Supports WeChat Pay and credit cards"))}</span></p>
      <p class="paypal-redirect-note">${escapeHtml(t("topup.stripeRedirectNote", {}, "You will continue on the secure payment page."))}</p>
    `;
    els.stripeButtons.hidden = false;
    const button = els.stripeButtons.querySelector("[data-stripe-start]");
    if (button) {
      button.disabled = false;
      button.onclick = startStripeRedirectCheckout;
    }
  } catch (error) {
    els.stripeBox.hidden = false;
    els.stripeButtons.hidden = false;
    els.stripeButtons.innerHTML = "";
    if (els.stripeStatus) els.stripeStatus.textContent = error.message || String(error);
  }
}

async function submitTopupHash(orderId = "", hash = "") {
  const cleanId = String(orderId || state.activeTopupOrder?.id || "").trim();
  const cleanHash = String(hash || "").trim();
  if (!cleanId) return;
  if (!cleanHash || cleanHash.length < 20) {
    setTopupConfirmStatus(t("topup.enterValidHash", {}, "Enter a valid transaction hash."), "error");
    return;
  }
  if (els.topupSubmitHashBtn) els.topupSubmitHashBtn.disabled = true;
  setTopupConfirmStatus(t("topup.submittingConfirm", {}, "Submitting confirmation..."), "");
  try {
    const payload = await requestJson(`/api/pay/orders/${encodeURIComponent(cleanId)}/confirm`, {
      method: "POST",
      body: { transactionHash: cleanHash },
    });
    if (payload.order) {
      state.activeTopupOrder = payload.order;
      renderTopupQrDialog(payload.order);
      setTopupQrStep("confirm");
    }
    setTopupConfirmStatus(t("topup.confirmSubmitted", {}, "Confirmation submitted. Waiting for chain verification."), "success");
    if (state.tab === "topups") loadTopupRecords(1);
  } catch (error) {
    setTopupConfirmStatus(error.message || t("topup.confirmFailed", {}, "Confirmation failed."), "error");
  } finally {
    if (els.topupSubmitHashBtn) els.topupSubmitHashBtn.disabled = false;
  }
}

async function payTopupWithTronLink(order = {}) {
  const activeOrder = order?.id ? order : state.activeTopupOrder;
  if (!activeOrder?.id) return;
  const selected = selectedWalletOption();
  const address = activeOrder.address || selected?.address || state.wallet?.address || "";
  const amount = topupPayableAmountText(activeOrder);
  if (!address || !amount) {
    setTopupConfirmStatus(t("topup.orderIncomplete", {}, "Payment order is incomplete. Please recreate the order."), "error");
    return;
  }
  const tronProvider = window.tron || window.tronLink || null;
  const tronWeb = window.tronWeb || tronProvider?.tronWeb || null;
  if (!tronWeb?.contract) {
    setTopupConfirmStatus(t("topup.walletUnavailable", {}, "Open this page in TronLink, or copy the exact amount and address to transfer manually."), "error");
    return;
  }
  if (els.topupTronLinkBtn) els.topupTronLinkBtn.disabled = true;
  setTopupConfirmStatus(t("topup.walletRequesting", {}, "Requesting wallet approval..."), "");
  try {
    if (tronProvider?.request) {
      await tronProvider.request({ method: "tron_requestAccounts" }).catch(() => null);
    }
    const contract = await tronWeb.contract().at(TRON_USDT_CONTRACT);
    const amountUnits = topupUsdtUnits(amount);
    const txId = await contract.transfer(address, amountUnits).send({ feeLimit: 100_000_000 });
    const hash = typeof txId === "string" ? txId : txId?.txid || txId?.transactionHash || "";
    if (els.topupTxHashInput && hash) els.topupTxHashInput.value = hash;
    setTopupQrStep("confirm");
    if (hash) {
      await submitTopupHash(activeOrder.id, hash);
    } else {
      setTopupConfirmStatus(t("topup.walletBroadcasted", {}, "Transfer broadcasted. Paste the transaction hash to confirm."), "success");
    }
  } catch (error) {
    setTopupConfirmStatus(error?.message || t("topup.walletFailed", {}, "Wallet payment was cancelled or failed."), "error");
  } finally {
    if (els.topupTronLinkBtn) els.topupTronLinkBtn.disabled = false;
  }
}

async function createTopupOrder() {
  if (!state.user) return openLogin();
  const billingPlan = selectedBillingPlan();
  const billingProduct = selectedBillingProduct();
  const topupPackage = selectedTopupPackage();
  const amount = Number(billingProduct?.amount || billingPlan?.amount || topupPackage?.amount || 0);
  if ((!billingProduct && !billingPlan && !topupPackage) || !Number.isFinite(amount) || amount < MIN_TOPUP_AMOUNT) {
    if (els.topupRate) els.topupRate.textContent = t("topup.invalid");
    return;
  }
  els.createTopupBtn.disabled = true;
  if (els.topupRate) els.topupRate.textContent = t("topup.creating");
  try {
    const endpoint = billingPlan ? "/api/billing/subscription/orders" : "/api/pay/orders";
    const payload = await requestJson(endpoint, {
      method: "POST",
      body: billingPlan
        ? { planId: billingPlan.id, walletOptionId: selectedWalletOption()?.id || "" }
        : billingProduct
        ? { productId: billingProduct.id, walletOptionId: selectedWalletOption()?.id || "" }
        : { amount, packageId: topupPackage.id, walletOptionId: selectedWalletOption()?.id || "" },
    });
    renderTopupOrder(payload.order);
    if (els.topupRate) els.topupRate.textContent = t("topup.created");
  } catch (error) {
    if (els.topupRate) els.topupRate.textContent = error.message;
  } finally {
    els.createTopupBtn.disabled = false;
  }
}

function renderAccessGuides() {
  const enabled = tenantFeature("apiAccess", true) && membershipProgramEnabled();
  const active = apiDocsAccessActive();
  if (els.apiDocsPurchaseCard) els.apiDocsPurchaseCard.hidden = !enabled || active;
  if (els.apiDocsUnlockedContent) els.apiDocsUnlockedContent.hidden = !enabled || !active;
  if (els.buyApiDocsBtn) {
    els.buyApiDocsBtn.disabled = !state.user || active;
    els.buyApiDocsBtn.innerHTML = state.user
      ? '<i data-lucide="lock-keyhole-open"></i>Unlock docs'
      : '<i data-lucide="log-in"></i>Sign in to unlock';
  }
  if (els.apiDocsPurchaseStatus) {
    els.apiDocsPurchaseStatus.textContent = active
      ? "API documentation access is active."
      : state.user ? "" : "Sign in before purchasing access.";
  }
  ensureActiveAccessGuide();
  if (els.accessModeTabs) {
    els.accessModeTabs.hidden = true;
    els.accessModeTabs.innerHTML = "";
  }
  if (els.accessTabs) {
    els.accessTabs.hidden = true;
    els.accessTabs.innerHTML = "";
  }
  if (els.accessGuideTitle) els.accessGuideTitle.textContent = "";
  if (els.accessGuideDesc) els.accessGuideDesc.textContent = "";
  if (els.accessCopy) {
    const copyCard = els.accessCopy.closest(".copy-card");
    if (copyCard) copyCard.hidden = true;
    els.accessCopy.textContent = "";
  }
  if (els.copyAccessBtn) els.copyAccessBtn.hidden = true;
  if (els.accessDocs) {
    els.accessDocs.hidden = true;
    els.accessDocs.innerHTML = "";
  }
  renderTokenDisplays();
  renderApiSubtokens();
  refreshIcons();
}

function userHasAdvancedAccess() {
  return Boolean(state.user);
}
