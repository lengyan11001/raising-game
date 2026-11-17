(() => {
  const storyState = {
    initialized: false,
    loaded: false,
    loading: false,
    view: "library",
    createOpen: false,
    detailTab: "script",
    projects: [],
    selectedId: "",
    detail: null,
    contract: null,
    message: "",
    scripts: [],
    assets: [],
    assetVariants: [],
    productionModels: null,
    selectedScriptId: "",
    selectedManuscriptId: "",
    scriptCreateOpen: false,
    scriptCreateMode: "new",
    scriptCreateSourceId: "",
    scriptTargetEpisodeId: "",
    scriptTargetDirty: false,
    analysisTargetEpisodes: "",
    analysisTargetEpisodesDirty: false,
    analysisDurationMinutes: "",
    analysisDurationDirty: false,
    selectedEpisodeId: "",
    expandedManuscriptIds: [],
    collapsedManuscriptIds: [],
    expandedEpisodeIds: [],
    collapsedEpisodeIds: [],
    shotCache: {},
    shotLoadingEpisodeIds: [],
    episodeTab: "outline",
    selectedShotId: "",
    shots: [],
    assetLibraryOpen: false,
    assetLibraryLoading: false,
    assetLibraryEpisodeId: "",
    assetLibraryShotKey: "",
    assetLibraryQuery: "",
    assetLibraryShots: [],
    assetLibraryPreviewAssetId: "",
    assetLibraryMessage: "",
    revisionRequest: null,
    imageModel: "qwen-image3",
    videoModel: "seedance-nsfw",
    videoDuration: 5,
    optimizerModel: "",
    promptResolution: "720p",
    generatingAssetId: "",
    analysis: null,
    analysisScriptId: "",
    action: "",
    actionMessage: "",
    syncingGenerationRefs: false,
    videoSyncTimer: null,
  };
  let storyLibrarySearchTimer = null;

  function storyEscape(value = "") {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function storyEl(id = "") {
    return document.getElementById(id);
  }

  function storyRefreshIcons() {
    if (typeof window.refreshIcons === "function") window.refreshIcons();
    else window.lucide?.createIcons?.();
  }

  function storyDate(value = "") {
    const date = new Date(value || "");
    if (Number.isNaN(date.getTime())) return "尚未编辑";
    return new Intl.DateTimeFormat("zh-CN", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(date);
  }

  function storyMetric(label, value) {
    return `<div class="story-metric"><span>${storyEscape(label)}</span><strong>${storyEscape(value)}</strong></div>`;
  }

  function storyEpisodeStatusLabel(value = "") {
    return ({
      draft: "草稿",
      outline_locked: "大纲定稿",
      shots_planned: "分镜规划",
      assets_planned: "资产待定稿",
      assets_ready: "资产已定稿",
      prompts_planned: "提示词部分完成",
      ready: "可生成",
      complete: "已完成",
    })[value] || value || "草稿";
  }

  function storyProjectPreview(project = {}) {
    const initial = String(project.name || "剧").trim().slice(0, 1) || "剧";
    return `
      <span class="story-project-preview">
        <span class="story-project-preview-grid" aria-hidden="true"></span>
        <span class="story-project-preview-flow" aria-hidden="true">
          <b class="is-script">文</b><i></i><b class="is-episode">集</b><i></i><b class="is-cast">角</b><i></i><b class="is-shot">镜</b>
        </span>
        <span class="story-project-preview-mark">${storyEscape(initial)}</span>
        <span class="story-project-preview-count">${Number(project.episodeCount || 0)} 集</span>
      </span>`;
  }

  function storySyncVisibility() {
    const library = storyEl("storyProjectList");
    const detail = storyEl("storyProjectDetail");
    const createSheet = storyEl("storyCreateSheet");
    if (library) library.hidden = storyState.view !== "library";
    if (detail) detail.hidden = storyState.view !== "detail";
    if (createSheet) createSheet.hidden = !storyState.createOpen || storyState.view !== "library";
  }

  function renderStoryProjectList() {
    const host = storyEl("storyProjectList");
    if (!host) return;
    renderStoryWindowHeader();
    storySyncVisibility();
    if (storyState.view !== "library") return;
    if (storyState.loading && !storyState.projects.length) {
      host.innerHTML = `<div class="story-library-state is-loading"><i data-lucide="loader-circle"></i><strong>正在读取剧集项目</strong><span>数据来自 PostgreSQL</span></div>`;
      storyRefreshIcons();
      return;
    }
    if (!storyState.projects.length) {
      host.innerHTML = `
        <button class="story-empty-project" data-story-create-open type="button">
          <span class="story-empty-project-mark">＋</span>
          <strong>创建第一个剧集项目</strong>
          <small>从剧本定稿开始，建立剧集、角色、场景与镜头资产</small>
        </button>`;
      storyRefreshIcons();
      return;
    }
    host.innerHTML = storyState.projects.map((project) => `
      <button class="story-project-card${project.id === storyState.selectedId ? " is-active" : ""}" data-story-project-id="${storyEscape(project.id)}" type="button">
        ${storyProjectPreview(project)}
        <span class="story-project-card-body">
          <span class="story-project-card-title-row">
            <strong>${storyEscape(project.name)}</strong>
            <em>${storyEscape(project.status)}</em>
          </span>
          <span class="story-project-card-meta">${Number(project.assetCount || 0)} 资产 · ${Number(project.shotCount || 0)} 镜头 · ${storyEscape(project.aspectRatio || "9:16")}</span>
          <small>${storyEscape(storyDate(project.updatedAt))}</small>
        </span>
      </button>
    `).join("");
    storyRefreshIcons();
  }

  function renderStoryContract(detail = null) {
    const badge = storyEl("storyContractBadge");
    const contract = detail?.contracts || storyState.contract;
    if (badge) badge.textContent = contract?.version ? `P1 · ${contract.version}` : "P1 · 契约未加载";
  }

  function renderStoryWindowHeader() {
    const head = document.querySelector(".story-library-head");
    if (!head) return;
    const title = head.querySelector(".story-library-title");
    const actions = head.querySelector(".story-library-actions");
    if (!title || !actions) return;
    const project = storyState.detail?.project || storyState.projects.find((item) => item.id === storyState.selectedId) || null;
    const isDetail = storyState.view === "detail" && project;
    head.closest(".story-shell")?.classList.toggle("is-detail", Boolean(isDetail));
    head.classList.toggle("is-detail", Boolean(isDetail));
    if (isDetail) {
      title.innerHTML = `
        <button class="story-back-button story-inline-back" data-story-back type="button"><i data-lucide="arrow-left"></i><span>剧集</span></button>
        <div class="story-project-inline-head">
          <h2>${storyEscape(project.name || "未命名剧集")}</h2>
          <div class="story-project-inline-stats">
            <span><b>${Number(project.scriptVersionCount || 0)}</b> 文稿</span>
            <span><b>${Number(project.episodeCount || 0)}</b> 集</span>
            <span><b>${Number(project.assetCount || 0)}</b> 资产</span>
            <span><b>${Number(project.shotCount || 0)}</b> 分镜</span>
            <span>${storyEscape(project.aspectRatio || "9:16")}</span>
          </div>
        </div>`;
      actions.innerHTML = `
        <button class="story-create-button" type="button" data-story-add-episode title="新增剧集"><i data-lucide="plus"></i><span>新增剧集</span></button>
        <button class="story-secondary-button" type="button" data-story-open-asset-library><i data-lucide="library"></i><span>资产库</span></button>
        <button class="story-icon-button" type="button" data-story-refresh-detail title="刷新项目" aria-label="刷新项目"><i data-lucide="refresh-cw"></i></button>`;
    } else {
      title.innerHTML = `
        <span class="story-kicker"><i data-lucide="clapperboard"></i> STORY WORKBENCH · ADMIN</span>
        <h2>剧集</h2>
        <p>文稿、剧集、角色与场景集中管理。</p>`;
      actions.innerHTML = `
        <span class="story-contract-badge" id="storyContractBadge">P1 · 加载中</span>
        <button class="story-icon-button" id="storyRefreshProjects" type="button" title="刷新项目" aria-label="刷新项目"><i data-lucide="refresh-cw"></i></button>
        <button class="story-create-button" id="storyCreateProjectToggle" type="button"><i data-lucide="plus"></i><span>新增项目</span></button>`;
      renderStoryContract();
    }
    storyRefreshIcons();
  }

  const STORY_DETAIL_TABS = [
    { id: "script", label: "创建文稿", icon: "file-text" },
    { id: "episodes", label: "分集分镜树", icon: "list-video" },
  ];

  function storyDetailTabId(value = "") {
    if (value === "production") return "episodes";
    return STORY_DETAIL_TABS.some((tab) => tab.id === value) ? value : "script";
  }

  function renderStoryDetailTabs() {
    return `
      <nav class="story-detail-tabs" aria-label="剧集项目工作区">
        ${STORY_DETAIL_TABS.map((tab) => `
          <button class="story-detail-tab${storyState.detailTab === tab.id ? " is-active" : ""}" data-story-tab="${tab.id}" type="button" aria-selected="${storyState.detailTab === tab.id}">
            <i data-lucide="${tab.icon}"></i><span>${tab.label}</span>
          </button>`).join("")}
      </nav>`;
  }

  function setStoryDetailTab(value = "") {
    const tab = storyDetailTabId(value);
    storyState.detailTab = tab;
    const host = storyEl("storyProjectDetail");
    if (!host) return;
    host.querySelectorAll("[data-story-tab]").forEach((button) => {
      const active = button.dataset.storyTab === tab;
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-selected", active ? "true" : "false");
    });
    host.querySelectorAll("[data-story-tab-panel]").forEach((panel) => {
      panel.hidden = panel.dataset.storyTabPanel !== tab;
    });
  }

  function selectedStoryScript() {
    return storyState.scripts.find((script) => script.id === storyState.selectedScriptId) || storyState.scripts[0] || null;
  }

  function storyScriptManuscriptId(script = {}) {
    return String(script.manuscriptId || script.id || "").trim();
  }

  function storyManuscriptGroups() {
    const groups = new Map();
    for (const script of storyState.scripts) {
      const manuscriptId = storyScriptManuscriptId(script);
      if (!manuscriptId) continue;
      if (!groups.has(manuscriptId)) groups.set(manuscriptId, { id: manuscriptId, versions: [], episodes: [] });
      groups.get(manuscriptId).versions.push(script);
    }
    const episodes = Array.isArray(storyState.detail?.episodes) ? storyState.detail.episodes : [];
    for (const group of groups.values()) {
      group.versions.sort((a, b) => Number(b.versionNo || 0) - Number(a.versionNo || 0));
      group.latest = group.versions[0] || null;
      group.episodes = episodes
        .filter((episode) => String(episode.sourceManuscriptId || "") === group.id)
        .sort((a, b) => Number(a.episodeNo || 0) - Number(b.episodeNo || 0));
    }
    return [...groups.values()].sort((a, b) => String(b.latest?.createdAt || "").localeCompare(String(a.latest?.createdAt || "")));
  }

  function selectedStoryManuscript() {
    const script = selectedStoryScript();
    const manuscriptId = storyState.selectedManuscriptId || storyScriptManuscriptId(script || {});
    return storyManuscriptGroups().find((group) => group.id === manuscriptId) || null;
  }

  function selectStoryManuscript(manuscript = null, versionId = "") {
    if (!manuscript) return;
    const script = manuscript.versions.find((item) => item.id === versionId) || manuscript.latest || null;
    storyState.selectedManuscriptId = manuscript.id;
    storyState.selectedScriptId = script?.id || "";
    syncStoryScriptTargetFromSelection();
  }

  function storyManuscriptById(manuscriptId = "") {
    return storyManuscriptGroups().find((group) => group.id === String(manuscriptId || "")) || null;
  }

  function selectStoryManuscriptById(manuscriptId = "", versionId = "") {
    const manuscript = storyManuscriptById(manuscriptId);
    if (!manuscript) return null;
    const script = manuscript.versions.find((item) => item.id === versionId) || manuscript.latest || null;
    storyState.selectedManuscriptId = manuscript.id;
    storyState.selectedScriptId = script?.id || "";
    storyState.analysisDurationMinutes = "";
    storyState.analysisDurationDirty = false;
    storyState.analysis = null;
    storyState.analysisScriptId = "";
    syncStoryScriptTargetFromSelection();
    return manuscript;
  }

  function selectStoryScriptVersion(scriptId = "") {
    const script = storyState.scripts.find((item) => item.id === String(scriptId || ""));
    if (!script) return false;
    const manuscript = storyManuscriptForScript(script);
    storyState.selectedManuscriptId = manuscript?.id || storyScriptManuscriptId(script);
    storyState.selectedScriptId = script.id;
    storyState.analysisDurationMinutes = "";
    storyState.analysisDurationDirty = false;
    storyState.analysis = null;
    storyState.analysisScriptId = "";
    syncStoryScriptTargetFromSelection();
    return true;
  }

  function storyEpisodeShotsFromCache(episodeId = "") {
    return storyState.shotCache[String(episodeId || "")]?.shots || [];
  }

  function storyEpisodeShotsLoaded(episodeId = "") {
    return Boolean(storyState.shotCache[String(episodeId || "")]?.loaded);
  }

  function setStoryEpisodeShotsCache(episodeId = "", shots = []) {
    const id = String(episodeId || "");
    if (!id) return;
    storyState.shotCache[id] = { shots: Array.isArray(shots) ? shots : [], loaded: true };
  }

  function openStoryScriptCreate(mode = "new", sourceScriptId = "") {
    if (!storyState.detail || storyState.action) return;
    storyState.scriptCreateMode = mode === "version" ? "version" : "new";
    storyState.scriptCreateSourceId = storyState.scriptCreateMode === "version" ? String(sourceScriptId || "") : "";
    storyState.scriptCreateOpen = true;
    renderStoryDetail();
    requestAnimationFrame(() => storyEl("storyScriptCreateTitle")?.focus());
  }

  function closeStoryScriptCreate() {
    storyState.scriptCreateOpen = false;
    storyState.scriptCreateSourceId = "";
    renderStoryDetail();
  }

  function storyManuscriptForEpisode(episode = {}) {
    const manuscriptId = String(episode.sourceManuscriptId || "");
    return storyManuscriptGroups().find((group) => group.id === manuscriptId) || null;
  }

  function storyManuscriptForScript(script = {}) {
    const manuscriptId = storyScriptManuscriptId(script);
    return storyManuscriptGroups().find((group) => group.id === manuscriptId) || null;
  }

  function storyScriptTargetSummary(script = {}) {
    const episode = (storyState.detail?.episodes || []).find((item) => item.id === script.targetEpisodeId);
    const duration = Number(script.estimatedDurationSeconds || 0);
    const parts = [];
    if (episode) parts.push(`E${String(episode.episodeNo).padStart(2, "0")}`);
    else if (script.targetEpisodeId) parts.push("指定分集");
    if (duration) parts.push(storyDurationLabel(duration));
    return parts.length ? parts.join(" · ") : "AI 自动规划";
  }

  function storyDurationMinutesValue(seconds = 0) {
    const value = Math.max(0, Number(seconds || 0) || 0);
    return value ? String(Math.round((value / 60) * 10) / 10) : "";
  }

  function storyDurationLabel(seconds = 0) {
    const value = Math.max(0, Math.round(Number(seconds || 0) || 0));
    if (!value) return "AI 规划时长";
    if (value < 60) return `${value} 秒`;
    const minutes = Math.round((value / 60) * 10) / 10;
    return `${minutes} 分钟`;
  }

  function storyPlanningEpisodeTargetValue(script = selectedStoryScript()) {
    if (storyState.analysisTargetEpisodesDirty) return storyState.analysisTargetEpisodes;
    const scriptTarget = Math.max(0, Number(script?.targetEpisodeCount || 0) || 0);
    return scriptTarget ? String(scriptTarget) : "";
  }

  function storyPlanningDurationValue(script = {}) {
    if (storyState.analysisDurationDirty) return storyState.analysisDurationMinutes;
    return storyDurationMinutesValue(script?.estimatedDurationSeconds);
  }

  function syncStoryScriptTargetFromSelection() {
    const script = selectedStoryScript();
    storyState.scriptTargetEpisodeId = String(script?.targetEpisodeId || "");
    storyState.scriptTargetDirty = false;
  }

  function renderStoryManuscriptCard(group = {}) {
    const active = selectedStoryManuscript()?.id === group.id;
    const latest = group.latest || {};
    const targetEpisodes = Number(latest.targetEpisodeCount || 0);
    const preview = String(latest.content || "").replace(/\s+/g, " ").trim().slice(0, 180);
    const versions = group.versions.map((version) => `
      <button class="story-script-version${version.id === storyState.selectedScriptId ? " is-active" : ""}" data-story-script-id="${storyEscape(version.id)}" type="button">
        <span>V${String(version.versionNo || 1).padStart(2, "0")}</span>
        <strong>${storyEscape(storyDate(version.createdAt))}</strong>
        <small>${storyEscape(version.targetEpisodeCount ? `目标 ${version.targetEpisodeCount} 集` : "集数由 AI 规划")}</small>
      </button>`).join("");
    return `
      <article class="story-manuscript-card${active ? " is-active" : ""}">
        <button class="story-manuscript-main" data-story-select-manuscript="${storyEscape(group.id)}" type="button">
          <span class="story-manuscript-mark"><i data-lucide="file-text"></i></span>
          <span class="story-manuscript-copy">
            <strong>${storyEscape(latest.title || "未命名文稿")}</strong>
            <small>${group.versions.length} 个版本 · ${group.episodes.length} 集 · ${storyEscape(storyDate(latest.createdAt))}</small>
            <p>${storyEscape(preview || "暂无正文预览。")}</p>
          </span>
          <span class="story-manuscript-badges"><em>V${String(latest.versionNo || 1).padStart(2, "0")}</em><em>${targetEpisodes ? `${targetEpisodes} 集目标` : "AI 规划"}</em></span>
        </button>
        <div class="story-manuscript-actions">
          <button class="story-secondary-button" data-story-script-version-source="${storyEscape(active ? (storyState.selectedScriptId || latest.id || "") : (latest.id || ""))}" type="button" ${storyState.action ? "disabled" : ""}><i data-lucide="copy-plus"></i><span>存为新版本</span></button>
          <button class="story-create-button" data-story-analyze-manuscript="${storyEscape(group.id)}" type="button" ${storyState.action || !latest.id ? "disabled" : ""}><i data-lucide="sparkles"></i><span>${group.episodes.length ? "重新 AI 拆解" : "AI 拆解"}</span></button>
        </div>
        ${active ? `<div class="story-manuscript-versions"><div class="story-manuscript-versions-head"><strong>版本记录</strong><small>选中要拆解的版本</small></div>${versions}</div>` : ""}
      </article>`;
  }

  function renderStoryScriptSection() {
    const groups = storyManuscriptGroups();
    return `
      <section class="story-section story-script-section">
        <div class="story-section-head story-manuscript-head">
          <div><p class="eyebrow">MANUSCRIPT</p><h3>我的文稿</h3></div>
          <button class="story-icon-button story-add-manuscript" data-story-script-create type="button" title="新增文稿" aria-label="新增文稿"><i data-lucide="plus"></i></button>
        </div>
        <div class="story-manuscript-list">
          ${groups.length ? groups.map(renderStoryManuscriptCard).join("") : `
            <button class="story-manuscript-empty" data-story-script-create type="button"><i data-lucide="plus"></i><strong>新增第一份文稿</strong><span>输入标题和原文后保存，再从下方执行 AI 拆解。</span></button>`}
        </div>
        <p class="story-message" id="storyScriptMessage">${storyEscape(storyState.actionMessage)}</p>
      </section>`;
  }

  function renderStoryAnalysisControls(script = {}) {
    return `
      <div class="story-analysis-toolbar">
        <span>当前版本：${storyEscape(script?.title || "未选择文稿")}${script?.versionNo ? ` · V${String(script.versionNo).padStart(2, "0")}` : ""}</span>
        <label>目标集数<input data-story-analysis-target-episodes type="number" min="0" max="30" step="1" value="${storyEscape(storyPlanningEpisodeTargetValue())}" placeholder="AI" /><em>集</em></label>
        <label>目标时长<input data-story-analysis-duration type="number" min="0" max="1440" step="0.5" value="${storyEscape(storyPlanningDurationValue(script))}" placeholder="AI" /><em>分</em></label>
        <button class="story-create-button" data-story-analyze type="button" ${storyState.action || !script?.id ? "disabled" : ""}><i data-lucide="sparkles"></i><span>${storyState.action === "analyze" ? "拆解中…" : "AI 拆解"}</span></button>
      </div>`;
  }

  function renderStoryAnalysisSection() {
    const analysis = storyState.analysis;
    const script = selectedStoryScript();
    if (!analysis) {
      return `
        <section class="story-section story-analysis-section">
          <div class="story-section-head"><div><p class="eyebrow">AI BREAKDOWN</p><h3>大纲与分集预览</h3></div><span>先预览，确认后再产生分集记录</span></div>
          ${renderStoryAnalysisControls(script)}
          <div class="story-analysis-empty"><i data-lucide="wand-sparkles"></i><div><strong>选中文稿后执行 AI 拆解</strong><span>左侧选择一份文稿和要使用的版本；参数留空时由 AI 根据原文完整短剧结构规划。这里只审一次大纲结果。</span></div></div>
        </section>`;
    }
    const totalDurationSeconds = (analysis.episodes || []).reduce((total, episode) => total + Math.max(0, Number(episode.durationSeconds || 0) || 0), 0);
    const episodes = (analysis.episodes || []).map((episode) => {
      const hook = String(episode.metadata?.hook || episode.hook || "").trim();
      const durationBasis = String(episode.metadata?.durationBasis || "").trim();
      const characters = Array.isArray(episode.metadata?.characters) ? episode.metadata.characters : [];
      const scenes = Array.isArray(episode.metadata?.scenes) ? episode.metadata.scenes : [];
      return `
        <article class="story-analysis-episode">
          <b>E${String(episode.episodeNo).padStart(2, "0")}</b>
          <div>
            <strong>${storyEscape(episode.title || `第 ${episode.episodeNo} 集`)}</strong>
            <p>${storyEscape(episode.synopsis || episode.summary || "暂无梗概")}</p>
            ${hook ? `<p class="story-analysis-hook"><b>结尾钩子</b>${storyEscape(hook)}</p>` : ""}
            ${durationBasis ? `<p class="story-analysis-duration-basis"><b>时长依据</b>${storyEscape(durationBasis)}</p>` : ""}
            <small>${storyDurationLabel(episode.durationSeconds)}${characters.length ? ` · 角色：${storyEscape(characters.join("、"))}` : ""}${scenes.length ? ` · 场景：${storyEscape(scenes.join("、"))}` : ""}</small>
          </div>
        </article>`;
    }).join("");
    const characters = (analysis.characters || []).map((item) => `<span>${storyEscape(item.name)}</span>`).join("");
    const scenes = (analysis.scenes || []).map((item) => `<span>${storyEscape(item.name)}</span>`).join("");
    return `
      <section class="story-section story-analysis-section">
        <div class="story-section-head">
          <div><p class="eyebrow">AI BREAKDOWN</p><h3>拆解预览</h3></div>
          <span>${analysis.episodes?.length || 0} 集 · 共 ${storyDurationLabel(totalDurationSeconds)} · 建议 ${Number(analysis.totalEpisodeSuggestion || 0) || "待定"} 集</span>
        </div>
        ${renderStoryAnalysisControls(script)}
        <p class="story-analysis-summary">${storyEscape(analysis.summary || "模型未返回整体梗概。")}</p>
        <div class="story-analysis-list">${episodes}</div>
        <div class="story-analysis-tags">
          <div><span>角色</span>${characters || "<em>无</em>"}</div>
          <div><span>场景</span>${scenes || "<em>无</em>"}</div>
        </div>
        <div class="story-analysis-actions">
          <p>确认后会按集号写入或更新剧集，并同步角色与场景资产。</p>
          <button class="story-create-button" data-story-import-analysis type="button" ${storyState.action ? "disabled" : ""}><i data-lucide="database-zap"></i><span>确认写入剧集</span></button>
        </div>
      </section>`;
  }

  function renderStoryAssetsSection() {
    const definitions = [
      { kind: "character", label: "角色资产", icon: "users" },
      { kind: "scene", label: "场景资产", icon: "clapperboard" },
    ];
    const groups = definitions.map((definition) => {
      const items = storyState.assets.filter((asset) => asset.kind === definition.kind);
      return `
        <div class="story-asset-group">
          <div class="story-asset-head"><span><i data-lucide="${definition.icon}"></i>${definition.label}</span><small>${items.length}</small></div>
          ${items.length ? items.map((asset) => `
            <article class="story-asset-row">
              <strong>${storyEscape(asset.name)}</strong>
              <p>${storyEscape(asset.description || "尚未填写资产说明。")}</p>
              <small>${storyEscape(asset.status)} · ${Number(asset.variantCount || 0)} 个变体</small>
            </article>`).join("") : `<div class="story-asset-empty">拆解确认后自动建立${definition.label}。</div>`}
        </div>`;
    }).join("");
    return `
      <section class="story-section">
        <div class="story-section-head"><div><p class="eyebrow">ASSETS</p><h3>角色与场景</h3></div><span>${storyState.assets.length} 项</span></div>
        <div class="story-asset-grid">${groups}</div>
      </section>`;
  }

  function renderStoryStructureTree(episodes = [], selectedEpisode = null) {
    const groups = storyManuscriptGroups();
    const selectedManuscript = selectedStoryManuscript();
    const nodes = groups.map((group) => {
      const expanded = storyState.expandedManuscriptIds.includes(group.id) && !storyState.collapsedManuscriptIds.includes(group.id);
      const active = selectedManuscript?.id === group.id;
      const latest = group.latest || group.versions[0] || {};
      const episodeNodes = group.episodes.map((episode) => {
        const selected = episode.id === selectedEpisode?.id;
        const episodeExpanded = storyState.expandedEpisodeIds.includes(episode.id) && !storyState.collapsedEpisodeIds.includes(episode.id);
        const cachedShots = selected && storyState.shots.length ? storyState.shots : storyEpisodeShotsFromCache(episode.id);
        const shots = episodeExpanded ? [...cachedShots].sort((a, b) => Number(a.shotNo || 0) - Number(b.shotNo || 0)) : [];
        const loadingShots = storyState.shotLoadingEpisodeIds.includes(episode.id);
        const shotsLoaded = (selected && storyState.shots.length > 0) || storyEpisodeShotsLoaded(episode.id);
        return `
          <div class="story-tree-node ${selected ? "is-selected" : ""}" data-story-episode-node="${storyEscape(episode.id)}">
            <div class="story-tree-row">
              <button class="story-tree-episode" type="button" data-story-open-episode="${storyEscape(episode.id)}" data-story-episode-view="outline">
                <span class="story-tree-node-mark">E${String(episode.episodeNo).padStart(2, "0")}</span>
                <span class="story-tree-node-copy"><strong>${storyEscape(episode.title || `第 ${episode.episodeNo} 集`)}</strong><small>${storyEscape(storyEpisodeStatusLabel(episode.status))} · ${Number(episode.shotCount || 0)} 镜 · ${storyDurationLabel(episode.durationSeconds)}</small></span>
              </button>
              <button class="story-tree-disclosure" type="button" data-story-toggle-episode="${storyEscape(episode.id)}" aria-label="${episodeExpanded ? "收起分镜" : "展开分镜"}" aria-expanded="${episodeExpanded}"><i data-lucide="${episodeExpanded ? "chevron-down" : "chevron-right"}"></i></button>
            </div>
            ${episodeExpanded ? `<div class="story-tree-shots">
              ${shots.length ? shots.map((shot) => `
                <button class="story-tree-shot ${shot.id === storyState.selectedShotId ? "is-active" : ""}" type="button" data-story-open-shot="${storyEscape(shot.id)}">
                  <b>S${String(shot.shotNo).padStart(2, "0")}</b><span>${storyEscape(shot.title || `镜头 ${shot.shotNo}`)}</span><em>${storyShotAssetsConfirmed(shot) ? "已确认" : "待确认"}</em>
                </button>`).join("") : `<div class="story-tree-loading">${loadingShots ? "正在读取分镜…" : shotsLoaded ? "此集暂无分镜。" : "展开后读取分镜。"}</div>`}
            </div>` : ""}
          </div>`;
      }).join("");
      return `
        <div class="story-tree-script-group ${active ? "is-active" : ""}">
          <div class="story-tree-row story-tree-manuscript-row">
            <button class="story-tree-script" type="button" data-story-select-manuscript="${storyEscape(group.id)}">
              <span class="story-tree-node-mark"><i data-lucide="file-text"></i></span>
              <span class="story-tree-node-copy"><strong>${storyEscape(latest.title || "未命名文稿")}</strong><small>V${String(latest.versionNo || 1).padStart(2, "0")} · ${group.versions.length} 个版本 · ${group.episodes.length} 集</small></span>
            </button>
            <button class="story-tree-disclosure" type="button" data-story-toggle-manuscript="${storyEscape(group.id)}" aria-label="${expanded ? "收起文稿分集" : "展开文稿分集"}" aria-expanded="${expanded}"><i data-lucide="${expanded ? "chevron-down" : "chevron-right"}"></i></button>
          </div>
          ${expanded ? `<div class="story-tree-branch">${episodeNodes || `<div class="story-tree-loading">尚未拆解。切到“创建文稿”，选中此文稿后执行 AI 拆解。</div>`}</div>` : ""}
        </div>`;
    }).join("");
    return `
      <section class="story-structure">
        <div class="story-structure-head"><div><p class="eyebrow">STORY TREE</p><h3>文稿 · 分集 · 分镜</h3></div><button class="story-icon-button" type="button" title="刷新项目结构" data-story-refresh-detail><i data-lucide="refresh-cw"></i></button></div>
        <div class="story-tree-root">${nodes || `<div class="story-tree-loading">先创建文稿，再从“创建文稿”页执行 AI 拆解。</div>`}</div>
      </section>`;
  }

  function storyTextList(value = [], maxItems = 40, maxLength = 120) {
    const source = Array.isArray(value) ? value : String(value || "").split(/[、,，\n]+/);
    return source.map((item) => String(item || "").trim().slice(0, maxLength)).filter(Boolean).slice(0, maxItems);
  }

  function storyAssetBelongsToEpisode(asset = {}, episode = {}) {
    const episodeId = String(episode.id || "");
    const episodeIds = storyTextList(asset.metadata?.episodeIds || [], 100, 80).map(String);
    if (episodeIds.length) return episodeIds.includes(episodeId);
    const episodeMetadata = episode.metadata && typeof episode.metadata === "object" ? episode.metadata : {};
    const names = [...storyTextList(episodeMetadata.characters, 80, 100), ...storyTextList(episodeMetadata.scenes, 80, 120)];
    const assetName = String(asset.name || "").trim();
    return Boolean(assetName && names.some((name) => name.includes(assetName) || assetName.includes(name)));
  }

  function storyEpisodeAssets(episode = {}) {
    return storyState.assets.filter((asset) => storyAssetBelongsToEpisode(asset, episode));
  }

  function storyShotUsesAsset(asset = {}, shot = {}) {
    const shotNos = storyTextList(asset.metadata?.shotNos || []).map(Number).filter(Number.isFinite);
    if (shotNos.length) return shotNos.includes(Number(shot.shotNo || 0));
    const name = String(asset.name || "").trim();
    if (!name) return false;
    const metadata = shot.metadata && typeof shot.metadata === "object" ? shot.metadata : {};
    if (asset.kind === "style") return true;
    if (asset.kind === "character" && storyTextList(metadata.characters).some((item) => item.includes(name) || name.includes(item))) return true;
    const location = String(metadata.location || "").trim();
    if (asset.kind === "scene" && location && (location.includes(name) || name.includes(location))) return true;
    return [shot.title, shot.description, metadata.location, metadata.dialogue, metadata.storyBeat]
      .filter(Boolean)
      .join("\n")
      .includes(name);
  }

  function storyShotAssets(episode = {}, shot = {}) {
    return storyEpisodeAssets(episode).filter((asset) => storyShotUsesAsset(asset, shot));
  }

  function storyShotAssetsConfirmed(shot = {}) {
    return Boolean(shot.metadata?.assetsConfirmedAt);
  }

  function storyAssetVariants(assetId = "") {
    return storyState.assetVariants.filter((variant) => variant.assetId === assetId);
  }

  function storyAssetVariantById(variantId = "") {
    const id = String(variantId || "");
    return storyState.assetVariants.find((variant) => variant.id === id) || null;
  }

  function storyApprovedAssetVariant(asset = {}) {
    const approvedId = String(asset.metadata?.approvedVariantId || "");
    const variants = storyAssetVariants(asset.id);
    return storyAssetVariantById(approvedId)?.status === "approved" ? storyAssetVariantById(approvedId)
      : variants.find((variant) => variant.id === approvedId && variant.status === "approved")
      || variants.find((variant) => variant.status === "approved")
      || null;
  }

  function storyAssetVariantImageUrl(variant = {}) {
    return String(variant.mediaUrl || variant.metadata?.mediaUrl || variant.metadata?.imageUrl || "").trim();
  }

  function storyAssetVariantThumbnailUrl(variant = {}) {
    const url = storyAssetVariantImageUrl(variant);
    if (!url || !url.includes("/api/admin/generation-records/") || !url.includes("/media?")) return url;
    return `${url}${url.includes("?") ? "&" : "?"}thumb=1`;
  }

  function storyAssetHasGeneratedImage(asset = {}) {
    return storyAssetVariants(asset.id).some((variant) => variant.status !== "failed" && Boolean(storyAssetVariantImageUrl(variant)))
      || Boolean(storyApprovedAssetVariant(asset) && storyAssetVariantImageUrl(storyApprovedAssetVariant(asset)));
  }

  function storyAssetHasApprovedImage(asset = {}) {
    const approved = storyApprovedAssetVariant(asset);
    return Boolean(approved && approved.status === "approved" && storyAssetVariantImageUrl(approved));
  }

  function storyAssetsNeedingImage(assets = []) {
    return assets.filter((asset) => !storyAssetHasApprovedImage(asset) && !storyAssetHasGeneratedImage(asset));
  }

  function storyDisplayAssetVariant(asset = {}) {
    const approved = storyApprovedAssetVariant(asset);
    const variants = storyAssetVariants(asset.id)
      .filter((variant) => variant.status !== "failed" && storyAssetVariantImageUrl(variant))
      .sort((a, b) => String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")));
    return [...new Map([approved, ...variants].filter(Boolean).map((variant) => [variant.id, variant])).values()]
      .sort((a, b) => String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")))[0] || null;
  }

  function storyReusableAssetVariants(asset = {}) {
    return storyState.assetVariants.filter((variant) => {
      if (variant.status !== "approved" || variant.assetId === asset.id) return false;
      const sourceAsset = storyState.assets.find((item) => item.id === variant.assetId);
      return sourceAsset && sourceAsset.kind === asset.kind;
    }).sort((a, b) => String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")));
  }

  function storyAssetKindLabel(kind = "") {
    return ({ character: "角色", scene: "场景", prop: "道具", style: "风格", audio: "声音" })[kind] || "资产";
  }

  function storyVariantStatusLabel(status = "") {
    return ({ approved: "已定稿", ready: "可审核", generating: "生成中", queued: "排队中", pending: "等待中", processing: "生成中", running: "生成中", succeeded: "已完成", success: "已完成", completed: "已完成", complete: "已完成", rejected: "未选", failed: "失败", error: "失败", canceled: "已取消", cancelled: "已取消", draft: "草稿" })[status] || status || "待处理";
  }

  function renderStoryEpisodeAssets(episode = {}) {
    const assets = storyEpisodeAssets(episode);
    const approvedCount = assets.filter((asset) => storyAssetHasApprovedImage(asset)).length;
    const missingImageAssets = storyAssetsNeedingImage(assets);
    const models = Array.isArray(storyState.productionModels?.image) ? storyState.productionModels.image : [];
    const imageModel = models.some((model) => model.id === storyState.imageModel) ? storyState.imageModel : (models[0]?.id || "qwen-image3");
    const cards = assets.map((asset) => {
      const variants = storyAssetVariants(asset.id);
      const visibleVariants = variants.filter((variant) => variant.status === "approved" || (variant.status !== "failed" && Boolean(storyAssetVariantImageUrl(variant))) || ["generating", "queued", "pending"].includes(variant.status));
      const failedCount = variants.filter((variant) => variant.status === "failed").length;
      const approved = storyApprovedAssetVariant(asset);
      const approvedImage = Boolean(approved && storyAssetVariantImageUrl(approved));
      const generating = storyState.generatingAssetId === asset.id;
      return `
        <article class="story-production-asset ${approvedImage ? "is-approved" : ""}">
          <div class="story-production-asset-head">
            <div><span>${storyEscape(storyAssetKindLabel(asset.kind))}</span><strong>${storyEscape(asset.name)}</strong></div>
            <span class="story-status-pill">${approvedImage ? "已定稿" : "待定稿"}</span>
          </div>
          <p>${storyEscape(asset.description || "AI 尚未补全视觉描述。")}</p>
          ${asset.metadata?.continuity ? `<small>连续性：${storyEscape(asset.metadata.continuity)}</small>` : ""}
          <details><summary>查看设计图提示词</summary><p>${storyEscape(asset.metadata?.imagePrompt || asset.description || "无")}</p></details>
          ${approved && storyAssetVariantImageUrl(approved) ? `<img class="story-production-asset-image" src="${storyEscape(storyAssetVariantThumbnailUrl(approved))}" alt="${storyEscape(asset.name)} 定稿设计图缩略图" loading="lazy" decoding="async" />` : ""}
          <div class="story-asset-variant-list">
            ${visibleVariants.length ? visibleVariants.map((variant) => `
              <div class="story-asset-variant ${variant.status === "approved" ? "is-approved" : ""}">
                ${storyAssetVariantImageUrl(variant) ? `<img src="${storyEscape(storyAssetVariantThumbnailUrl(variant))}" alt="${storyEscape(asset.name)} 设计变体缩略图" loading="lazy" decoding="async" />` : `<span>${storyEscape(storyVariantStatusLabel(variant.status))}</span>`}
                <small>${storyEscape(storyVariantStatusLabel(variant.status))}</small>
                ${storyAssetVariantImageUrl(variant) && variant.status !== "approved" ? `<button type="button" data-story-approve-variant="${storyEscape(variant.id)}" data-story-asset-id="${storyEscape(asset.id)}">设为定稿</button>` : ""}
              </div>`).join("") : `<span class="story-asset-empty">还没有设计图。</span>`}
          </div>
          ${failedCount ? `<small class="story-asset-history">历史失败 ${failedCount} 次，已收起，不占用设计图区。</small>` : ""}
          <button class="story-secondary-button" type="button" data-story-generate-asset="${storyEscape(asset.id)}" ${generating || storyState.action ? "disabled" : ""}>
            <i data-lucide="${generating ? "loader-circle" : "image-plus"}"></i><span>${generating ? "正在生成设计图…" : variants.length ? "再生成一版" : "AI 生成设计图"}</span>
          </button>
        </article>`;
    }).join("");
    const assetsReady = Boolean(assets.length && assets.every((asset) => storyAssetHasApprovedImage(asset)));
    const allImagesReady = Boolean(assets.length && !missingImageAssets.length);
    const workflowStatus = assetsReady
      ? "全部资产已定稿。下一步进入“模型与提示词”，按所选视频模型逐镜优化。"
      : !assets.length
        ? "下一步：先点“AI 提取本集资产”。AI 只抽取本集分镜会用到的人物、场景和关键道具。"
        : missingImageAssets.length
          ? `下一步：点“补齐 ${missingImageAssets.length} 个资产图”，生成后逐项审核并设为定稿。`
          : "下一步：逐张审核设计图，满意后点“设为定稿”；全部定稿才解锁视频提示词。";
    return `
      <section class="story-production-panel">
        <div class="story-production-toolbar">
          <div><p class="eyebrow">ASSET DESIGN</p><h3>本集资产设计与定稿</h3><p>AI 只提取本集镜头会用到的人物、场景和关键道具；资产定稿后才会解锁视频提示词。</p></div>
          <div class="story-production-controls">
            <label>出图模型<select data-story-image-model>${models.map((model) => `<option value="${storyEscape(model.id)}" ${model.id === imageModel ? "selected" : ""}>${storyEscape(model.label)}</option>`).join("")}</select></label>
            <button class="story-secondary-button" type="button" data-story-plan-assets ${storyState.action ? "disabled" : ""}><i data-lucide="sparkles"></i><span>${assets.length ? "重新提取资产" : "AI 提取本集资产"}</span></button>
            ${assetsReady
              ? `<button class="story-create-button" type="button" data-story-episode-view="prompts"><i data-lucide="arrow-right"></i><span>下一步：选模型并生成提示词</span></button>`
              : `<button class="story-create-button" type="button" data-story-generate-assets ${!missingImageAssets.length || storyState.action ? "disabled" : ""}><i data-lucide="images"></i><span>${missingImageAssets.length ? `补齐 ${missingImageAssets.length} 个资产图` : assets.length ? "设计图已齐，待审核" : "先提取资产"}</span></button>`}
          </div>
        </div>
        <div class="story-workflow-guide ${assetsReady ? "is-ready" : ""}">
          <span><b>资产阶段</b>① 选出图模型 → ② AI 提取资产 → ③ 生成设计图 → ④ 逐项设为定稿</span>
          <strong>${allImagesReady && !assetsReady ? "只差审核定稿" : assetsReady ? "可进入下一步" : "尚未完成"}</strong>
          <p>${workflowStatus}</p>
        </div>
        <div class="story-production-summary ${assetsReady ? "is-ready" : "is-warning"}"><strong>${approvedCount} / ${assets.length}</strong><span>${assetsReady ? "全部资产已定稿，可进入模型与提示词。" : "资产尚未全部定稿；定稿图会作为后续镜头提示词和视频参考。"}</span></div>
        <div class="story-production-assets">${cards || `<div class="story-shot-ai-empty"><i data-lucide="boxes"></i><div><strong>等待 AI 提取资产</strong><p>先按已生成的分镜提取人物、场景和关键道具，再生成设计图。</p></div></div>`}</div>
        <p class="story-message" id="storyEpisodeMessage">${storyEscape(storyState.actionMessage || "")}</p>
      </section>`;
  }

  function renderStoryShotProduction(episode = {}) {
    const assets = storyEpisodeAssets(episode);
    const approvedCount = assets.filter((asset) => storyAssetHasApprovedImage(asset)).length;
    const assetsReady = Boolean(assets.length && assets.every((asset) => storyAssetHasApprovedImage(asset)));
    const imageModels = Array.isArray(storyState.productionModels?.image) ? storyState.productionModels.image : [];
    const imageModel = imageModels.some((model) => model.id === storyState.imageModel) ? storyState.imageModel : (imageModels[0]?.id || "qwen-image3");
    const videoModels = Array.isArray(storyState.productionModels?.video) ? storyState.productionModels.video : [];
    const optimizerModels = Array.isArray(storyState.productionModels?.optimizer) ? storyState.productionModels.optimizer.filter((model) => model.configured !== false) : [];
    const videoModel = storyState.videoModel || videoModels[0]?.id || "seedance-nsfw";
    const optimizerModel = storyState.optimizerModel || optimizerModels[0]?.id || "";
    const selectedVideoModel = videoModels.find((model) => model.id === videoModel);
    const resolution = storyState.promptResolution;
    const currentPromptCount = storyState.shots.filter((shot) => storyShotPromptMatchesModel(shot, videoModel, resolution)).length;
    const promptsReady = Boolean(storyState.shots.length && currentPromptCount === storyState.shots.length);
    const confirmedCount = storyState.shots.filter(storyShotAssetsConfirmed).length;
    const shotCards = storyState.shots.map((shot) => {
      const shotAssets = storyShotAssets(episode, shot);
      const confirmed = storyShotAssetsConfirmed(shot);
      const generatedAssets = shotAssets.filter((asset) => storyAssetHasGeneratedImage(asset));
      const approvedShotAssets = shotAssets.filter((asset) => storyAssetHasApprovedImage(asset));
      const missingShotAssets = shotAssets.filter((asset) => !storyAssetHasGeneratedImage(asset));
      const shotAssetsReady = Boolean(shotAssets.length && approvedShotAssets.length === shotAssets.length);
      const promptReady = storyShotPromptMatchesModel(shot, videoModel, resolution);
      return `
        <article class="story-shot-production-card ${shot.id === storyState.selectedShotId ? "is-selected" : ""} ${promptReady ? "is-ready" : ""}" data-story-shot-card="${storyEscape(shot.id)}">
          <header class="story-shot-production-head">
            <div><b>S${String(shot.shotNo).padStart(2, "0")}</b><span><strong>${storyEscape(shot.title || `镜头 ${shot.shotNo}`)}</strong><small>${Number(shot.durationSeconds || 5)} 秒${shot.metadata?.shotSize ? ` · ${storyEscape(shot.metadata.shotSize)}` : ""}${shot.metadata?.camera ? ` · ${storyEscape(shot.metadata.camera)}` : ""}</small></span></div>
            <em class="${confirmed ? "is-confirmed" : ""}">${confirmed ? "资产清单已确认" : "待确认资产清单"}</em>
          </header>
          <p class="story-shot-production-copy">${storyEscape(shot.description || "暂无镜头描述")}</p>
          <div class="story-shot-asset-list">
            ${shotAssets.length ? shotAssets.map((asset) => {
              const approved = storyAssetHasApprovedImage(asset);
              const generated = storyAssetHasGeneratedImage(asset);
              return `<div class="story-shot-asset-row">
                <div><span>${storyEscape(storyAssetKindLabel(asset.kind))}</span><strong>${storyEscape(asset.name)}</strong><small>${approved ? "已定稿" : generated ? "设计图待审核" : "未出图"}</small></div>
                <details><summary>设计图提示词</summary><p>${storyEscape(asset.metadata?.imagePrompt || asset.description || "AI 尚未补写设计图提示词。")}</p></details>
                <button type="button" data-story-generate-asset="${storyEscape(asset.id)}" data-story-generate-asset-shot="${storyEscape(shot.id)}" ${confirmed && !generated && !storyState.action ? "" : "disabled"}>${generated ? "已出图" : "生成此资产"}</button>
              </div>`;
            }).join("") : `<div class="story-shot-assets-empty">AI 尚未为此镜提取资产。先执行“提取本集资产”，再逐镜确认清单。</div>`}
          </div>
          <div class="story-shot-prompt-block ${promptReady ? "is-ready" : shot.videoPrompt ? "is-stale" : ""}">
            <div><strong>视频提示词</strong><small>${promptReady ? "已按当前模型优化" : shot.videoPrompt ? "模型已变，需刷新" : "等待资产定稿后生成"}</small></div>
            ${shot.videoPrompt ? `<pre>${storyEscape(shot.videoPrompt)}</pre>` : `<p>资产全部定稿后，AI 会按所选视频模型、分辨率和本镜资产生成最终可执行提示词。</p>`}
            <button type="button" data-story-plan-shot-prompt="${storyEscape(shot.id)}" ${shotAssetsReady && selectedVideoModel?.promptOptimizer && optimizerModel && !storyState.action ? "" : "disabled"}><i data-lucide="wand-sparkles"></i><span>${shot.videoPrompt ? "按当前模型刷新本镜" : "生成本镜视频提示词"}</span></button>
          </div>
          <footer class="story-shot-production-actions">
            <button class="story-secondary-button" type="button" data-story-confirm-shot-assets="${storyEscape(shot.id)}"><i data-lucide="${confirmed ? "badge-check" : "check-check"}"></i><span>${confirmed ? "重新确认资产清单" : "确认此镜资产清单"}</span></button>
            <button class="story-create-button" type="button" data-story-generate-shot-assets="${storyEscape(shot.id)}" ${confirmed && missingShotAssets.length && !storyState.action ? "" : "disabled"}><i data-lucide="images"></i><span>${missingShotAssets.length ? `确认后生成 ${missingShotAssets.length} 个资产` : "本镜资产均已出图"}</span></button>
            <small>${approvedShotAssets.length} / ${shotAssets.length} 个资产已定稿${generatedAssets.length ? ` · ${generatedAssets.length} 个已出图` : ""}</small>
          </footer>
        </article>`;
    }).join("");
    return `
      <section class="story-production-panel story-shot-production">
        <div class="story-production-toolbar">
          <div><p class="eyebrow">SHOT ASSETS & PROMPTS</p><h3>逐镜确认资产与提示词</h3><p>AI 先按 S01、S02 列出每镜所需资产和图片提示词。你确认清单后才允许出图；资产定稿后再冻结对应视频提示词。</p></div>
          <div class="story-production-controls">
            <label>出图模型<select data-story-image-model>${imageModels.map((model) => `<option value="${storyEscape(model.id)}" ${model.id === imageModel ? "selected" : ""}>${storyEscape(model.label)}</option>`).join("")}</select></label>
            <button class="story-secondary-button" type="button" data-story-plan-assets ${storyState.action ? "disabled" : ""}><i data-lucide="sparkles"></i><span>${assets.length ? "重新提取资产" : "AI 提取本集资产"}</span></button>
          </div>
        </div>
        <div class="story-workflow-guide ${promptsReady ? "is-ready" : confirmedCount === storyState.shots.length && storyState.shots.length ? "is-warning" : ""}">
          <span><b>确认门禁</b>AI 提取资产清单 → 逐镜检查图片提示词 → 确认清单 → 出图并定稿 → 生成视频提示词</span>
          <strong>${confirmedCount} / ${storyState.shots.length} 镜已确认</strong>
          <p>资产图在分镜卡片内直接生成、重生成和定稿；资产库只用于查看全项目记录。当前 ${approvedCount} / ${assets.length} 个本集资产已定稿。</p>
        </div>
        <div class="story-shot-production-toolbar">
          <div><strong>视频模型</strong><label>模型<select data-story-video-model>${videoModels.map((model) => `<option value="${storyEscape(model.id)}" ${model.id === videoModel ? "selected" : ""}>${storyEscape(model.label)}${model.promptOptimizer ? "" : "（无独立规则）"}</option>`).join("")}</select></label><label>优化模型<select data-story-optimizer-model>${optimizerModels.map((model) => `<option value="${storyEscape(model.id)}" ${model.id === optimizerModel ? "selected" : ""}>${storyEscape(model.label)}</option>`).join("")}</select></label><label>分辨率<select data-story-prompt-resolution>${["480p", "720p", "1080p", "4K"].map((item) => `<option value="${item}" ${item === resolution ? "selected" : ""}>${item}</option>`).join("")}</select></label></div>
          <button class="story-create-button" type="button" data-story-plan-prompts ${assetsReady && storyState.shots.length && selectedVideoModel?.promptOptimizer && optimizerModel && !storyState.action ? "" : "disabled"}><i data-lucide="wand-sparkles"></i><span>${storyState.action === "plan-prompts" ? "AI 正在逐镜优化…" : promptsReady ? "重新优化全部视频提示词" : "生成全部视频提示词"}</span></button>
        </div>
        <div class="story-shot-production-list">${shotCards || `<div class="story-shot-ai-empty"><i data-lucide="clapperboard"></i><div><strong>先生成 AI 分镜</strong><p>分镜完成后，这里会按 S01、S02 展示每镜资产、图片提示词和视频提示词。</p></div></div>`}</div>
        ${storyState.action === "plan-prompts" ? `<div class="story-list-state is-loading"><i data-lucide="loader-circle"></i>AI 正在逐镜优化视频提示词，镜头多时需要几分钟…</div>` : ""}
        <p class="story-message" id="storyEpisodeMessage">${storyEscape(storyState.actionMessage || "")}</p>
      </section>`;
  }

  function renderStoryShotWorkspace(episode = {}) {
    const shot = storyState.shots.find((item) => item.id === storyState.selectedShotId);
    if (!shot) return "";
    const metadata = shot.metadata && typeof shot.metadata === "object" ? shot.metadata : {};
    const assets = storyShotAssets(episode, shot);
    const confirmed = storyShotAssetsConfirmed(shot);
    const approvedAssets = assets.filter((asset) => storyAssetHasApprovedImage(asset));
    const generatedAssets = assets.filter((asset) => storyAssetHasGeneratedImage(asset));
    const assetsApproved = Boolean(assets.length && approvedAssets.length === assets.length);
    const videoModels = Array.isArray(storyState.productionModels?.video) ? storyState.productionModels.video : [];
    const optimizerModels = Array.isArray(storyState.productionModels?.optimizer) ? storyState.productionModels.optimizer.filter((model) => model.configured !== false) : [];
    const selectedVideoModel = videoModels.find((model) => model.id === storyState.videoModel) || videoModels[0] || { id: storyState.videoModel, label: storyState.videoModel };
    const optimizerModel = storyState.optimizerModel || optimizerModels[0]?.id || "";
    const promptReady = storyShotPromptMatchesModel(shot, selectedVideoModel.id, storyState.promptResolution);
    const canGenerateVideo = promptReady && assetsApproved && !storyState.action;
    const generationRefs = (Array.isArray(storyState.detail?.generationRefs) ? storyState.detail.generationRefs : [])
      .filter((ref) => ref.shotId === shot.id && ref.kind === "video")
      .sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));
    const shotLabel = `S${String(shot.shotNo).padStart(2, "0")}`;
    const episodeLabel = `E${String(episode.episodeNo || 0).padStart(2, "0")}`;
    const assetRows = assets.length ? assets.map((asset) => {
      const approved = storyAssetHasApprovedImage(asset);
      const generated = storyAssetHasGeneratedImage(asset);
      const displayVariant = storyDisplayAssetVariant(asset);
      const imageUrl = storyAssetVariantThumbnailUrl(displayVariant || {});
      const reusableVariants = storyReusableAssetVariants(asset);
      const prompt = asset.metadata?.imagePrompt || asset.description || "AI 尚未补写图片提示词。";
      return `
        <article class="story-shot-workspace-asset ${approved ? "is-approved" : ""}">
          <div class="story-shot-workspace-asset-head">
            <div><span>${storyEscape(storyAssetKindLabel(asset.kind))}</span><strong>${storyEscape(asset.name)}</strong></div>
            <em>${approved ? "已定稿" : displayVariant ? storyEscape(storyVariantStatusLabel(displayVariant.status)) : "未出图"}</em>
          </div>
          <div class="story-shot-workspace-asset-visual">
            ${imageUrl ? `<img src="${storyEscape(imageUrl)}" alt="${storyEscape(asset.name)} 已生成设计图缩略图" loading="lazy" decoding="async" referrerpolicy="no-referrer" data-story-media-image /><span class="story-media-fallback" data-story-media-fallback hidden>图片加载失败，可重新生成</span>` : `<span class="story-shot-workspace-asset-empty-image">${generated ? "图片地址刷新中" : "尚未生成设计图"}</span>`}
          </div>
          <label class="story-shot-asset-prompt"><span>AI 建议图片提示词</span><p>${storyEscape(prompt)}</p></label>
          <div class="story-shot-workspace-asset-actions">
            <button type="button" data-story-generate-asset="${storyEscape(asset.id)}" data-story-generate-asset-shot="${storyEscape(shot.id)}" ${storyState.action ? "disabled" : ""}>${storyState.generatingAssetId === asset.id ? "生成中…" : generated ? "重新生成" : "生成图片"}</button>
            ${displayVariant && displayVariant.status !== "approved" ? `<button class="is-approve" type="button" data-story-approve-variant="${storyEscape(displayVariant.id)}" data-story-asset-id="${storyEscape(asset.id)}" ${storyState.action ? "disabled" : ""}>${storyState.action === "approve-asset" ? "正在定稿…" : "设为定稿"}</button>` : ""}
          </div>
          ${reusableVariants.length ? `<div class="story-shot-asset-reuse"><select data-story-reuse-variant="${storyEscape(asset.id)}"><option value="">选择已有定稿素材</option>${reusableVariants.map((variant) => {
            const sourceAsset = storyState.assets.find((item) => item.id === variant.assetId);
            return `<option value="${storyEscape(variant.id)}">${storyEscape(sourceAsset?.name || "资产")} · ${storyEscape(storyDate(variant.updatedAt))}</option>`;
          }).join("")}</select><button type="button" data-story-use-variant="${storyEscape(asset.id)}" ${storyState.action ? "disabled" : ""}>复用</button></div>` : ""}
        </article>`;
    }).join("") : `<div class="story-shot-assets-empty">此镜还没有资产清单。先让 AI 按本集分镜提取资产。</div>`;
    const generationRows = generationRefs.length ? generationRefs.map((ref) => {
      const status = String(ref.status || ref.metadata?.generationStatus || "queued");
      const failed = ["failed", "error", "canceled", "cancelled"].includes(status.toLowerCase());
      const videoUrl = failed ? "" : storyGenerationRefVideoUrl(ref);
      return `
        <article class="story-shot-video-result">
          <div><strong>${storyEscape(ref.metadata?.modelLabel || ref.metadata?.model || selectedVideoModel.label)}</strong><span>${storyEscape(storyVariantStatusLabel(status))}</span></div>
          ${videoUrl ? `<video controls preload="metadata" src="${storyEscape(videoUrl)}" data-story-generation-video data-generation-record-id="${storyEscape(ref.generationRecordId || "")}"></video><a href="${storyEscape(videoUrl)}" data-story-generation-video-link target="_blank" rel="noopener">打开视频</a><span class="story-video-refresh-status" data-story-video-status hidden></span>` : `<p>${ref.status === "failed" ? storyEscape(ref.metadata?.error || "生成失败") : ["succeeded", "success", "completed", "complete"].includes(String(ref.status || ref.metadata?.generationStatus || "").toLowerCase()) ? "后台已完成，正在同步视频地址…" : "后台任务处理中，完成后会自动显示视频预览。"}</p>`}
          ${ref.generationRecordId ? `<small>记录 ${storyEscape(ref.generationRecordId)}</small>` : ""}
          ${ref.metadata?.prompt ? `<details><summary>本次视频提示词</summary><pre>${storyEscape(ref.metadata.prompt)}</pre></details>` : ""}
        </article>`;
    }).join("") : `<div class="story-shot-workspace-empty"><i data-lucide="film"></i><span>尚未生成此镜视频</span></div>`;

    return `
      <section class="story-section story-shot-workspace">
        <header class="story-shot-workspace-head">
          <div>
            <p class="eyebrow">${episodeLabel} · SHOT WORKSPACE</p>
            <h3>${shotLabel} · ${storyEscape(shot.title || `镜头 ${shot.shotNo}`)}</h3>
            <p>${storyEscape(shot.description || "尚未填写镜头描述。")}</p>
          </div>
          <span class="story-status-pill">${approvedAssets.length} / ${assets.length} 资产定稿</span>
        </header>
        <div class="story-shot-context">
          ${storyMetric("时长", `${Number(shot.durationSeconds || 5)} 秒`)}
          ${storyMetric("景别", metadata.shotSize || "未设置")}
          ${storyMetric("运镜", metadata.camera || "未设置")}
          ${storyMetric("地点", metadata.location || "未设置")}
        </div>
        ${metadata.dialogue || metadata.storyBeat ? `<div class="story-shot-copy-blocks">${metadata.dialogue ? `<div><span>对白</span><p>${storyEscape(metadata.dialogue)}</p></div>` : ""}${metadata.storyBeat ? `<div><span>剧情节拍</span><p>${storyEscape(metadata.storyBeat)}</p></div>` : ""}</div>` : ""}
        <div class="story-shot-workspace-grid">
          <section class="story-shot-workspace-card">
            <div class="story-shot-workspace-card-head">
              <div><p class="eyebrow">SHOT ASSETS</p><h4>本镜所需资产</h4></div>
              <button class="story-secondary-button" type="button" data-story-open-asset-library><i data-lucide="library"></i><span>打开全局资产库</span></button>
            </div>
            <p class="story-shot-workspace-hint">这里直接完成本镜资产生成、重生成、定稿和复用已有素材。资产库只用于查看全项目记录。</p>
            <div class="story-shot-workspace-assets">${assetRows}</div>
            <div class="story-shot-workspace-actions">
              <button class="story-secondary-button" type="button" data-story-confirm-shot-assets="${storyEscape(shot.id)}" ${storyState.action ? "disabled" : ""}><i data-lucide="${confirmed ? "badge-check" : "check-check"}"></i><span>${confirmed ? "重新确认资产清单" : "确认此镜资产清单"}</span></button>
              <button class="story-create-button" type="button" data-story-generate-shot-assets="${storyEscape(shot.id)}" ${confirmed && generatedAssets.length < assets.length && !storyState.action ? "" : "disabled"}><i data-lucide="images"></i><span>生成未完成资产图</span></button>
              <small>${generatedAssets.length} 张已出图 · ${approvedAssets.length} 张已定稿</small>
            </div>
            <p class="story-message">${storyEscape(storyState.actionMessage || "")}</p>
          </section>
          <section class="story-shot-workspace-card">
            <div class="story-shot-workspace-card-head">
              <div><p class="eyebrow">VIDEO GENERATION</p><h4>生成视频</h4></div>
              <span class="story-status-pill">${promptReady ? "提示词已优化" : "待优化提示词"}</span>
            </div>
            <div class="story-shot-generation-controls">
              <label>视频模型<select data-story-video-model>${videoModels.map((model) => `<option value="${storyEscape(model.id)}" ${model.id === selectedVideoModel.id ? "selected" : ""}>${storyEscape(model.label)}</option>`).join("")}</select></label>
              <label>提示词优化模型<select data-story-optimizer-model>${optimizerModels.map((model) => `<option value="${storyEscape(model.id)}" ${model.id === optimizerModel ? "selected" : ""}>${storyEscape(model.label)}</option>`).join("")}</select></label>
              <label>分辨率<select data-story-prompt-resolution>${["480p", "720p", "1080p", "4K"].map((resolution) => `<option value="${resolution}" ${resolution === storyState.promptResolution ? "selected" : ""}>${resolution}</option>`).join("")}</select></label>
              <label>时长（秒）<input id="storyShotVideoDuration" data-story-video-duration type="number" min="1" max="30" value="${Number(shot.durationSeconds || storyState.videoDuration || 5)}" /></label>
            </div>
            <div class="story-shot-prompt-block ${promptReady ? "is-ready" : shot.videoPrompt ? "is-stale" : ""}">
              <div><strong>最终视频提示词</strong><small>${promptReady ? `已按 ${storyEscape(selectedVideoModel.label)} · ${storyEscape(storyState.promptResolution)} 优化` : shot.videoPrompt ? "模型或分辨率已变化，需要刷新" : "等待资产定稿后由 AI 生成"}</small></div>
              ${shot.videoPrompt ? `<pre>${storyEscape(shot.videoPrompt)}</pre>` : `<p>完成图片定稿后，再按所选模型优化此镜提示词。</p>`}
              <button type="button" data-story-plan-shot-prompt="${storyEscape(shot.id)}" ${assetsApproved && selectedVideoModel.promptOptimizer && optimizerModel && !storyState.action ? "" : "disabled"}><i data-lucide="wand-sparkles"></i><span>${shot.videoPrompt ? "按当前模型刷新此镜提示词" : "AI 生成本镜视频提示词"}</span></button>
            </div>
            <div class="story-shot-generation-gate ${canGenerateVideo ? "is-ready" : ""}">
              <strong>${canGenerateVideo ? "可以生成视频" : "生成门禁未通过"}</strong>
              <span>${!assetsApproved ? `还需定稿 ${assets.length - approvedAssets.length} 个资产图。` : !promptReady ? "请按当前视频模型和分辨率优化提示词。" : "资产、提示词和模型均已就绪。"}</span>
            </div>
            <button class="story-create-button story-shot-generate-video" type="button" data-story-generate-shot-video="${storyEscape(shot.id)}" ${canGenerateVideo ? "" : "disabled"}><i data-lucide="${storyState.action === "generate-video" ? "loader-circle" : "clapperboard"}"></i><span>${storyState.action === "generate-video" ? "视频生成中…" : "生成视频"}</span></button>
            <p class="story-message">${storyEscape(storyState.actionMessage || "")}</p>
            <div class="story-shot-video-results">${generationRows}</div>
          </section>
        </div>
      </section>`;
  }

  function storyShotFilterKey(episodeId = "", shotNo = "") {
    return episodeId && shotNo ? `${episodeId}:${Number(shotNo)}` : "";
  }

  function storyAssetShotLabels(asset = {}) {
    const episodeIds = storyTextList(asset.metadata?.episodeIds || [], 100, 80).map(String);
    const matched = storyState.assetLibraryShots
      .filter((shot) => (!episodeIds.length || episodeIds.includes(String(shot.episodeId || ""))) && storyShotUsesAsset(asset, shot))
      .map((shot) => `E${String(shot.episodeNo).padStart(2, "0")}-S${String(shot.shotNo).padStart(2, "0")}`);
    if (matched.length) return [...new Set(matched)].slice(0, 12);
    const declared = storyTextList(asset.metadata?.shotNos || []).map((value) => Number(value)).filter(Number.isFinite);
    return [...new Set(declared.map((value) => `S${String(value).padStart(2, "0")}`))];
  }

  function renderStoryScriptCreateModal() {
    if (!storyState.scriptCreateOpen) return "";
    const source = storyState.scripts.find((script) => script.id === storyState.scriptCreateSourceId) || null;
    const isVersion = storyState.scriptCreateMode === "version" && source;
    const group = source ? storyManuscriptGroups().find((item) => item.id === storyScriptManuscriptId(source)) : null;
    const nextVersionNo = group ? Math.max(0, ...group.versions.map((script) => Number(script.versionNo || 0))) + 1 : Number(source?.versionNo || 0) + 1;
    const versionTitle = source ? `${String(source.title || "未命名文稿").replace(/ · V\d+$/i, "")} · V${String(nextVersionNo).padStart(2, "0")}` : "";
    return `
      <div class="story-script-modal-backdrop" data-story-close-script-modal>
        <form class="story-script-modal" id="storyScriptCreateForm">
          <div class="story-script-modal-head">
            <div><p class="eyebrow">${isVersion ? "NEW VERSION" : "NEW MANUSCRIPT"}</p><h3>${isVersion ? "存为新版本" : "新增文稿"}</h3></div>
            <button class="story-icon-button" data-story-close-script-modal type="button" aria-label="关闭"><i data-lucide="x"></i></button>
          </div>
          <p class="story-script-modal-note">${isVersion ? `归入「${storyEscape(group?.latest?.title || source?.title || "当前文稿")}」这条手稿主线，原版本保留。` : "创建一条独立的手稿主线，不会覆盖已有文稿。"}</p>
          <label>文稿标题<input id="storyScriptCreateTitle" maxlength="160" value="${storyEscape(isVersion ? versionTitle : "")}" placeholder="${storyEscape(isVersion ? "默认使用下一版本名称" : "例如：夜班便利店 第一季")}" /></label>
          <label>原文<textarea id="storyScriptCreateContent" rows="13" maxlength="1500000" placeholder="粘贴完整小说、剧本文本或本轮修改稿。">${storyEscape(isVersion ? source?.content || "" : "")}</textarea></label>
          <div class="story-script-modal-planning">
            <label>目标集数<em>可选</em><input id="storyScriptCreateTargetEpisodes" type="number" min="0" max="30" step="1" value="${storyEscape(source?.targetEpisodeCount || "")}" placeholder="AI 规划" /></label>
            <label>目标时长<em>可选</em><input id="storyScriptCreateDuration" type="number" min="0" max="1440" step="0.5" value="${storyEscape(storyDurationMinutesValue(source?.estimatedDurationSeconds))}" placeholder="AI 规划" /></label>
          </div>
          <p class="story-message" id="storyScriptCreateMessage"></p>
          <div class="story-script-modal-actions">
            <button class="story-secondary-button" data-story-close-script-modal type="button">取消</button>
            <button class="story-create-button" type="submit" ${storyState.action ? "disabled" : ""}><i data-lucide="save"></i><span>${isVersion ? "保存新版本" : "保存文稿"}</span></button>
          </div>
        </form>
      </div>`;
  }

  function renderStoryRevisionModal() {
    const request = storyState.revisionRequest;
    if (!request) return "";
    return `<div class="story-revision-backdrop" data-story-close-revision>
      <section class="story-revision-modal" role="dialog" aria-modal="true" aria-labelledby="storyRevisionTitle">
        <header><div><p class="eyebrow">REVISION BRIEF</p><h3 id="storyRevisionTitle">${storyEscape(request.title || "补充修改意见")}</h3><p>${storyEscape(request.message || "")}</p></div><button class="story-icon-button" type="button" data-story-close-revision title="关闭"><i data-lucide="x"></i></button></header>
        <label>修改意见<textarea id="storyRevisionFeedback" rows="6" maxlength="4000" placeholder="例如：人物脸部更瘦一些，西装改为深灰色，场景增加窗外夜景；保留原有构图和身份特征。"></textarea></label>
        <footer><small>重新生成会结合这次意见，而不是重复上一次提示词。</small><div><button class="story-secondary-button" type="button" data-story-close-revision>取消</button><button class="story-create-button" type="button" data-story-submit-revision><i data-lucide="refresh-cw"></i><span>带着修改意见重新生成</span></button></div></footer>
      </section>
    </div>`;
  }

  function renderStoryAssetLibraryModal() {
    if (!storyState.assetLibraryOpen) return "";
    const episodes = Array.isArray(storyState.detail?.episodes) ? storyState.detail.episodes : [];
    const selectedEpisode = episodes.find((episode) => episode.id === storyState.assetLibraryEpisodeId) || null;
    const shotOptions = selectedEpisode
      ? storyState.assetLibraryShots
        .filter((shot) => shot.episodeId === selectedEpisode.id)
        .sort((a, b) => a.shotNo - b.shotNo)
      : [];
    const selectedShot = shotOptions.find((shot) => storyShotFilterKey(shot.episodeId, shot.shotNo) === storyState.assetLibraryShotKey) || null;
    const query = String(storyState.assetLibraryQuery || "").trim().toLowerCase();
    const visibleAssets = storyState.assets.filter((asset) => {
      if (selectedEpisode && !storyAssetBelongsToEpisode(asset, selectedEpisode)) return false;
      if (selectedShot && !storyShotUsesAsset(asset, selectedShot)) return false;
      const haystack = [asset.name, asset.description, asset.metadata?.imagePrompt, asset.metadata?.continuity].filter(Boolean).join(" ").toLowerCase();
      return !query || haystack.includes(query);
    });
    const cards = visibleAssets.map((asset) => {
      const variants = storyAssetVariants(asset.id).filter((variant) => variant.status !== "failed");
      const approved = storyApprovedAssetVariant(asset);
      const cover = approved || variants[0] || null;
      const imageUrl = storyAssetVariantThumbnailUrl(cover || {});
      const shotLabels = storyAssetShotLabels(asset);
      return `<button class="story-library-asset-card ${approved ? "is-approved" : ""}" type="button" data-story-library-preview-asset="${storyEscape(asset.id)}">
        <span class="story-library-asset-cover">${imageUrl ? `<img src="${storyEscape(imageUrl)}" alt="${storyEscape(asset.name)} 缩略图" loading="lazy" decoding="async" fetchpriority="low" referrerpolicy="no-referrer" data-story-media-image /><span class="story-media-fallback" data-story-media-fallback hidden>图片加载失败</span>` : `<span class="story-library-cover-empty"><i data-lucide="image-off"></i></span>`}</span>
        <span class="story-library-asset-summary"><span>${storyEscape(storyAssetKindLabel(asset.kind))}</span><strong>${storyEscape(asset.name)}</strong><small>${approved ? "已定稿" : variants.length ? "待审核" : "未出图"} · ${shotLabels.length} 个分镜</small></span>
      </button>`;
    }).join("");
    const previewAsset = visibleAssets.find((asset) => asset.id === storyState.assetLibraryPreviewAssetId) || null;
    const previewVariants = previewAsset ? [...new Map([
      storyApprovedAssetVariant(previewAsset),
      ...storyAssetVariants(previewAsset.id).filter((variant) => variant.status !== "failed"),
    ].filter(Boolean).map((variant) => [variant.id, variant])).values()].sort((a, b) => (b.status === "approved") - (a.status === "approved") || String(b.updatedAt || "").localeCompare(String(a.updatedAt || ""))) : [];
    const previewShots = previewAsset ? storyAssetShotLabels(previewAsset) : [];
    const previewApproved = previewAsset ? storyApprovedAssetVariant(previewAsset) : null;
    return `<div class="story-asset-library-backdrop" data-story-close-asset-library>
      <section class="story-asset-library-modal" role="dialog" aria-modal="true" aria-label="资产库">
        <header><div><p class="eyebrow">ASSET LIBRARY</p><h3>资产库 · 按分集与分镜查询</h3><p>这里只查看已生成的图片、图片提示词和定稿状态；打开资产库不会自动生成图片。</p></div><button class="story-icon-button" type="button" data-story-close-asset-library title="关闭资产库"><i data-lucide="x"></i></button></header>
        <div class="story-asset-library-filters">
          <label>分集<select data-story-library-episode><option value="">全部分集</option>${episodes.map((episode) => `<option value="${storyEscape(episode.id)}" ${episode.id === storyState.assetLibraryEpisodeId ? "selected" : ""}>E${String(episode.episodeNo).padStart(2, "0")} · ${storyEscape(episode.title || "未命名")}</option>`).join("")}</select></label>
          <label>分镜<select data-story-library-shot ${selectedEpisode ? "" : "disabled"}><option value="">${selectedEpisode ? "全部分镜" : "先选择分集"}</option>${shotOptions.map((shot) => {
            const key = storyShotFilterKey(shot.episodeId, shot.shotNo);
            return `<option value="${storyEscape(key)}" ${key === storyState.assetLibraryShotKey ? "selected" : ""}>E${String(shot.episodeNo).padStart(2, "0")}-S${String(shot.shotNo).padStart(2, "0")} · ${storyEscape(shot.title || "未命名镜头")}</option>`;
          }).join("")}</select></label>
          <label class="story-library-search">搜索<input type="search" value="${storyEscape(storyState.assetLibraryQuery)}" placeholder="按资产名、说明或提示词搜索" data-story-library-query /></label>
          <span>${storyState.assetLibraryLoading ? "正在读取当前分集分镜…" : `${visibleAssets.length} / ${storyState.assets.length} 个资产${selectedShot ? ` · 当前 ${storyAssetShotLabels({ metadata: { episodeIds: [selectedShot.episodeId], shotNos: [selectedShot.shotNo] } })[0] || ""}` : ""}`}</span>
        </div>
        <p class="story-library-message ${storyState.action === "approve-asset" ? "is-loading" : ""}" ${storyState.assetLibraryMessage ? "" : "hidden"}>${storyEscape(storyState.assetLibraryMessage)}</p>
        <div class="story-asset-library-grid">${cards || `<div class="story-library-state"><strong>当前筛选没有资产</strong><span>切换分集或分镜，或先让 AI 提取本集资产。</span></div>`}</div>
        ${previewAsset ? `<div class="story-library-preview-backdrop" data-story-library-preview-close>
          <article class="story-library-preview" role="dialog" aria-modal="true" aria-label="${storyEscape(previewAsset.name)} 资产预览">
            <header><div><span>${storyEscape(storyAssetKindLabel(previewAsset.kind))} · ${previewApproved ? "已定稿" : previewVariants.length ? "待审核" : "未出图"}</span><h4>${storyEscape(previewAsset.name)}</h4></div><button class="story-icon-button" type="button" data-story-library-preview-close title="关闭预览"><i data-lucide="x"></i></button></header>
            <div class="story-library-preview-meta"><div>${previewShots.length ? previewShots.map((label) => `<span>${storyEscape(label)}</span>`).join("") : "<span>未绑定分镜</span>"}</div><p>${storyEscape(previewAsset.metadata?.imagePrompt || previewAsset.description || "暂无图片提示词")}</p></div>
            <div class="story-library-preview-variants">${previewVariants.length ? previewVariants.map((variant) => {
              const imageUrl = storyAssetVariantImageUrl(variant);
              const thumbnailUrl = storyAssetVariantThumbnailUrl(variant);
              const pending = ["generating", "queued", "pending"].includes(variant.status);
              return `<div class="story-library-preview-variant ${variant.status === "approved" ? "is-approved" : ""}">
                ${imageUrl ? `<a href="${storyEscape(imageUrl)}" target="_blank" rel="noopener"><img src="${storyEscape(thumbnailUrl)}" alt="${storyEscape(previewAsset.name)} 设计图缩略图" loading="lazy" decoding="async" referrerpolicy="no-referrer" data-story-media-image /></a><span class="story-media-fallback" data-story-media-fallback hidden>图片加载失败，请重新生成</span>` : `<span class="story-library-cover-empty">${pending ? storyEscape(storyVariantStatusLabel(variant.status)) : "图片地址刷新中"}</span>`}
                <footer><small>${storyEscape(storyVariantStatusLabel(variant.status))}</small>${imageUrl && variant.status !== "approved" ? `<button type="button" data-story-approve-variant="${storyEscape(variant.id)}" data-story-asset-id="${storyEscape(previewAsset.id)}" ${storyState.action ? "disabled" : ""}>${storyState.action === "approve-asset" ? "正在定稿…" : "设为定稿"}</button>` : ""}</footer>
              </div>`;
            }).join("") : `<div class="story-library-variant-empty"><i data-lucide="image-off"></i><span>尚未生成设计图</span></div>`}</div>
          </article>
        </div>` : ""}
      </section>
    </div>`;
  }

  function storyShotPromptMatchesModel(shot = {}, videoModel = "", resolution = "") {
    if (!String(shot.videoPrompt || "").trim()) return false;
    const meta = shot.metadata?.videoPromptMeta || {};
    return String(meta.provider || "") === String(videoModel || "")
      && String(meta.resolution || "") === String(resolution || "");
  }

  function renderStoryEpisodePrompts(episode = {}) {
    const assets = storyEpisodeAssets(episode);
    const approvedCount = assets.filter((asset) => storyAssetHasApprovedImage(asset)).length;
    const assetsReady = Boolean(assets.length && assets.every((asset) => storyAssetHasApprovedImage(asset)));
    const promptReadyCount = storyState.shots.filter((shot) => Boolean(String(shot.videoPrompt || "").trim())).length;
    const videoModels = Array.isArray(storyState.productionModels?.video) ? storyState.productionModels.video : [];
    const optimizerModels = Array.isArray(storyState.productionModels?.optimizer) ? storyState.productionModels.optimizer.filter((model) => model.configured !== false) : [];
    const videoModel = storyState.videoModel || videoModels[0]?.id || "seedance-nsfw";
    const optimizerModel = storyState.optimizerModel || optimizerModels[0]?.id || "";
    const selectedVideoModel = videoModels.find((model) => model.id === videoModel);
    const resolution = storyState.promptResolution;
    const currentModelPromptCount = storyState.shots.filter((shot) => storyShotPromptMatchesModel(shot, videoModel, resolution)).length;
    const promptsReady = Boolean(storyState.shots.length && currentModelPromptCount === storyState.shots.length);
    const promptsOutdated = promptReadyCount > 0 && !promptsReady;
    const promptButtonLabel = promptsReady
      ? "按当前模型重新优化全部"
      : promptsOutdated
        ? "刷新过期提示词"
        : "按所选模型生成全部提示词";
    const rows = storyState.shots.map((shot) => {
      const promptMeta = shot.metadata?.videoPromptMeta || {};
      const promptMatchesModel = storyShotPromptMatchesModel(shot, videoModel, resolution);
      return `
        <article class="story-prompt-shot ${promptMatchesModel ? "is-ready" : shot.videoPrompt ? "is-stale" : ""}">
          <div class="story-prompt-shot-head"><b>S${String(shot.shotNo).padStart(2, "0")}</b><strong>${storyEscape(shot.title || `镜头 ${shot.shotNo}`)}</strong><span>${promptMatchesModel ? "已按当前模型优化" : shot.videoPrompt ? "模型已变，需刷新" : "待优化"}</span></div>
          <p>${storyEscape(shot.description || "无镜头描述")}</p>
          ${shot.videoPrompt ? `<details open><summary>最终视频提示词 · ${storyEscape(promptMeta.providerLabel || selectedVideoModel?.label || videoModel)}${promptMeta.resolution ? ` · ${storyEscape(promptMeta.resolution)}` : ""}</summary><pre>${storyEscape(shot.videoPrompt)}</pre></details>` : `<small>资产定稿后，AI 会按所选模型规则生成本镜头的最终视频提示词。</small>`}
        </article>`;
    }).join("");
    return `
      <section class="story-production-panel">
        <div class="story-production-toolbar">
          <div><p class="eyebrow">MODEL & PROMPT</p><h3>选模型，冻结最终提示词</h3><p>先用定稿资产约束画面，再由对应模型规则优化。写入镜头的 videoPrompt 就是最终可执行版本。</p></div>
          <div class="story-production-controls story-prompt-controls">
            <label>视频模型<select data-story-video-model>${videoModels.map((model) => `<option value="${storyEscape(model.id)}" ${model.id === videoModel ? "selected" : ""}>${storyEscape(model.label)}${model.promptOptimizer ? "" : "（无独立优化规则）"}</option>`).join("")}</select></label>
            <label>优化模型<select data-story-optimizer-model>${optimizerModels.map((model) => `<option value="${storyEscape(model.id)}" ${model.id === optimizerModel ? "selected" : ""}>${storyEscape(model.label)}</option>`).join("")}</select></label>
            <label>视频分辨率<select data-story-prompt-resolution>${["480p", "720p", "1080p", "4K"].map((resolution) => `<option value="${resolution}" ${resolution === storyState.promptResolution ? "selected" : ""}>${resolution}</option>`).join("")}</select></label>
            <button class="story-create-button" type="button" data-story-plan-prompts ${assetsReady && storyState.shots.length && selectedVideoModel?.promptOptimizer && optimizerModel && !storyState.action ? "" : "disabled"}><i data-lucide="wand-sparkles"></i><span>${storyState.action === "plan-prompts" ? "AI 正在逐镜优化…" : promptButtonLabel}</span></button>
          </div>
        </div>
        <div class="story-workflow-guide ${promptsReady ? "is-ready" : promptsOutdated ? "is-warning" : ""}">
          <span><b>提示词阶段</b>资产全部定稿 → 选视频模型/优化模型/分辨率 → AI 逐镜优化 → 冻结最终提示词</span>
          <strong>${promptsReady ? `${currentModelPromptCount} / ${storyState.shots.length} 已冻结` : `${currentModelPromptCount} / ${storyState.shots.length} 与当前模型一致`}</strong>
          <p>${!assetsReady ? "资产门禁尚未通过。先回“资产设计”完成生成和定稿。" : promptsReady ? `本集提示词已按 ${selectedVideoModel?.label || videoModel} 优化并冻结。下一步：进入图片/视频生成（后续接入）。` : promptsOutdated ? `已检测到视频模型或分辨率变化。当前 ${storyState.shots.length - currentModelPromptCount} 个镜头需要按 ${selectedVideoModel?.label || videoModel} 重新优化，旧提示词不会作为最终版本使用。` : "模型选择已就绪。点“按所选模型生成全部提示词”，AI 会逐镜优化并写入 PostgreSQL。"}</p>
          ${!assetsReady ? `<button class="story-secondary-button" type="button" data-story-episode-view="assets"><i data-lucide="arrow-left"></i><span>回到资产设计</span></button>` : ""}
        </div>
        <div class="story-production-summary ${assetsReady ? "is-ready" : "is-warning"}">
          <strong>${assetsReady ? "资产门禁已通过" : `资产 ${approvedCount} / ${assets.length} 已定稿`}</strong>
          <span>${assetsReady ? "现在可以按所选视频模型批量优化本集镜头提示词。" : "所有本集资产定稿后才允许冻结提示词，避免画面身份和场景漂移。"}</span>
        </div>
        <div class="story-prompt-shot-list">${rows || `<div class="story-list-state">请先生成并审核分镜。</div>`}</div>
        ${storyState.action === "plan-prompts" ? `<div class="story-list-state is-loading"><i data-lucide="loader-circle"></i>AI 正在逐镜优化并写入 PostgreSQL，镜头多时需要几分钟…</div>` : ""}
        <p class="story-message" id="storyEpisodeMessage">${storyEscape(storyState.actionMessage || "")}</p>
      </section>`;
  }

  function renderStoryDetail() {
    const host = storyEl("storyProjectDetail");
    if (!host) return;
    renderStoryWindowHeader();
    renderStoryContract(storyState.detail);
    storySyncVisibility();
    if (storyState.view !== "detail") return;
    if (storyState.loading && !storyState.detail) {
      host.innerHTML = `
        <div class="story-detail-loading">
          <button class="story-back-button" data-story-back type="button"><i data-lucide="arrow-left"></i><span>全部项目</span></button>
          <div class="story-library-state is-loading"><i data-lucide="loader-circle"></i><strong>正在加载项目结构</strong><span>读取剧集与画布引用</span></div>
        </div>`;
      storyRefreshIcons();
      return;
    }
    if (!storyState.detail) {
      host.innerHTML = `
        <div class="story-detail-panel">
          <button class="story-back-button" data-story-back type="button"><i data-lucide="arrow-left"></i><span>全部项目</span></button>
          <div class="story-empty">
            <i data-lucide="clapperboard"></i>
            <h3>选择一个剧集项目</h3>
            <p>项目中会承载剧本版本、剧集、角色、场景、镜头和生成引用。</p>
          </div>
        </div>`;
      storyRefreshIcons();
      return;
    }
    const { project, episodes = [] } = storyState.detail;
    const selectedEpisode = episodes.find((episode) => episode.id === storyState.selectedEpisodeId);
    const episodeWorkspace = selectedEpisode ? (() => {
      const shotWorkspace = renderStoryShotWorkspace(selectedEpisode);
      if (shotWorkspace) return shotWorkspace;
      const metadata = selectedEpisode.metadata && typeof selectedEpisode.metadata === "object" ? selectedEpisode.metadata : {};
      const characters = Array.isArray(metadata.characters) ? metadata.characters.join("、") : "";
      const scenes = Array.isArray(metadata.scenes) ? metadata.scenes.join("、") : "";
      const isLocked = ["outline_locked", "shots_planned", "assets_planned", "assets_ready", "prompts_planned", "ready", "complete"].includes(String(selectedEpisode.status || ""));
      const shotCount = Number(selectedEpisode.shotCount || storyState.shots.length || 0);
      const shotPlanLabel = shotCount ? "重新 AI 分镜" : "AI 生成分镜";
      return `
        <section class="story-section story-episode-workspace">
          <form class="story-episode-edit-form" id="storyEpisodeEditForm">
            <label>集标题<input id="storyEpisodeEditTitle" maxlength="160" value="${storyEscape(selectedEpisode.title)}" /></label>
            <label>时长（秒）<input id="storyEpisodeEditDuration" type="number" min="0" max="86400" value="${Number(selectedEpisode.durationSeconds || 0)}" /></label>
            <label class="story-field-wide">单集大纲<textarea id="storyEpisodeEditSynopsis" rows="9" maxlength="8000">${storyEscape(selectedEpisode.synopsis)}</textarea></label>
            <label class="story-field-wide">结尾钩子<textarea id="storyEpisodeEditHook" rows="3" maxlength="2000">${storyEscape(metadata.hook || "")}</textarea></label>
            <label>出场角色<input id="storyEpisodeEditCharacters" value="${storyEscape(characters)}" placeholder="用顿号或逗号分隔" /></label>
            <label>场景<input id="storyEpisodeEditScenes" value="${storyEscape(scenes)}" placeholder="用顿号或逗号分隔" /></label>
            <div class="story-shot-actions story-field-wide">
              <div><p>${shotCount ? `已生成 ${shotCount} 个分镜，可直接在左侧树中选择。` : "锁定大纲后由 AI 自动拆分镜。"}</p><strong>${shotCount} 个镜头</strong></div>
              <div class="story-shot-action-buttons">
                <button class="story-secondary-button" type="button" data-story-save-episode ${storyState.action ? "disabled" : ""}>保存修改</button>
                ${isLocked ? `<button class="story-secondary-button" type="button" data-story-plan-shots ${storyState.action ? "disabled" : ""}><i data-lucide="sparkles"></i><span>${shotPlanLabel}</span></button>` : ""}
                <button class="story-create-button" type="button" data-story-lock-episode="${isLocked ? "draft" : "outline_locked"}" ${storyState.action ? "disabled" : ""}>${isLocked ? "恢复草稿" : "锁定大纲，AI 拆分镜"}</button>
              </div>
            </div>
            ${storyState.action === "plan-shots" ? `<div class="story-list-state is-loading story-field-wide"><i data-lucide="loader-circle"></i>AI 正在拆分镜并写入 PostgreSQL…</div>` : ""}
            <p class="story-message story-field-wide" id="storyEpisodeMessage">${storyEscape(storyState.actionMessage || "")}</p>
          </form>
        </section>
        `;
    })() : "";
    const storyTree = renderStoryStructureTree(episodes, selectedEpisode);
    const emptyEpisodeWorkspace = `
      <section class="story-section story-tree-empty">
        <div class="story-shot-ai-empty"><i data-lucide="git-branch"></i><div><strong>${episodes.length ? "从左侧选择一集继续制作" : "等待 AI 拆解出分集节点"}</strong><p>${episodes.length ? "分集节点下会显示 S01、S02 等分镜；每镜独立管理资产清单、图片提示词和视频提示词。" : "先保存剧本并执行 AI 拆解，确认写入后这里会生成下级分集节点。"}</p></div></div>
        <form class="story-episode-form" id="storyEpisodeForm">
          <label>集标题<input id="storyEpisodeTitle" maxlength="160" placeholder="可选" /></label>
          <label>单集大纲<textarea id="storyEpisodeSynopsis" maxlength="8000" rows="3" placeholder="本集开场、发展、转折、结尾钩子与关键场景"></textarea></label>
          <button class="story-create-button" type="submit"><i data-lucide="plus"></i><span>手动新增剧集</span></button>
        </form>
      </section>`;
    host.innerHTML = `
      <div class="story-detail-panel">
        ${renderStoryDetailTabs()}
        <div class="story-tab-panel" data-story-tab-panel="script" ${storyState.detailTab === "script" ? "" : "hidden"}>
          ${renderStoryScriptSection()}
          ${renderStoryAnalysisSection()}
        </div>
        <div class="story-tab-panel" data-story-tab-panel="episodes" ${storyState.detailTab === "episodes" ? "" : "hidden"}>
          <section class="story-section">
            <div class="story-section-head"><div><p class="eyebrow">STORY TREE</p><h3>剧本 · 分集 · 分镜</h3></div><span>${Number(project.episodeTarget || 0) > 0 ? `${episodes.length} / ${Number(project.episodeTarget)} 集` : `已拆出 ${episodes.length} 集 · AI 规划`}</span></div>
            <div class="story-tree-layout">${storyTree}<div class="story-tree-workspace">${episodeWorkspace || emptyEpisodeWorkspace}</div></div>
          </section>
        </div>
        ${renderStoryScriptCreateModal()}
        ${renderStoryRevisionModal()}
        ${renderStoryAssetLibraryModal()}
      </div>`;
    storyRefreshIcons();
  }

  function setStoryCreateOpen(open = false) {
    storyState.createOpen = Boolean(open);
    storySyncVisibility();
    if (storyState.createOpen) {
      storyEl("storyProjectName")?.focus();
      storyRefreshIcons();
    }
  }

  function openStoryLibrary() {
    storyState.view = "library";
    storyState.createOpen = false;
    renderStoryProjectList();
    renderStoryDetail();
  }

  function openStoryEpisodeCreate() {
    if (!storyState.detail || storyState.action) return;
    storyState.detailTab = "episodes";
    storyState.selectedEpisodeId = "";
    storyState.selectedShotId = "";
    storyState.shots = [];
    storyState.actionMessage = "";
    renderStoryDetail();
    requestAnimationFrame(() => storyEl("storyEpisodeTitle")?.focus());
  }

  async function loadStoryProjects(selectId = "") {
    if (!document.querySelector('[data-panel="episodes"]')) return;
    storyState.loading = true;
    storyState.message = "";
    renderStoryProjectList();
    try {
      const [contractPayload, projectsPayload] = await Promise.all([
        storyState.contract ? Promise.resolve({ contract: storyState.contract }) : requestJson("/api/story/contracts"),
        requestJson("/api/story/projects"),
      ]);
      storyState.contract = contractPayload.contract || storyState.contract;
      storyState.projects = Array.isArray(projectsPayload.projects) ? projectsPayload.projects : [];
      const requested = String(selectId || "").trim();
      const hasRequested = storyState.projects.some((project) => project.id === requested);
      storyState.selectedId = hasRequested ? requested : (storyState.projects[0]?.id || "");
      storyState.loaded = true;
      storyState.loading = false;
      renderStoryContract();
      if (hasRequested) {
        storyState.view = "detail";
        await loadStoryDetail(requested);
        return;
      }
      storyState.view = "library";
      storyState.detail = null;
      renderStoryProjectList();
      renderStoryDetail();
    } catch (error) {
      storyState.loading = false;
      storyState.message = error.message || String(error);
      const host = storyEl("storyProjectList");
      if (host) host.innerHTML = `<div class="story-library-state is-error"><strong>项目读取失败</strong><span>${storyEscape(storyState.message)}</span></div>`;
      renderStoryDetail();
    }
  }

  async function loadStoryDetail(projectId = "") {
    const id = String(projectId || "").trim();
    if (!id) return;
    if (storyState.selectedId !== id) {
      storyState.detailTab = "script";
      storyState.selectedManuscriptId = "";
      storyState.scriptCreateOpen = false;
      storyState.scriptCreateSourceId = "";
      storyState.selectedEpisodeId = "";
      storyState.selectedShotId = "";
      storyState.expandedManuscriptIds = [];
      storyState.collapsedManuscriptIds = [];
      storyState.expandedEpisodeIds = [];
      storyState.collapsedEpisodeIds = [];
      storyState.shotCache = {};
      storyState.shotLoadingEpisodeIds = [];
      storyState.assetLibraryEpisodeId = "";
      storyState.assetLibraryShotKey = "";
      storyState.assetLibraryOpen = false;
      storyState.analysisTargetEpisodes = "";
      storyState.analysisTargetEpisodesDirty = false;
      storyState.analysisDurationMinutes = "";
      storyState.analysisDurationDirty = false;
    }
    storyState.view = "detail";
    storyState.createOpen = false;
    storyState.selectedId = id;
    storyState.loading = true;
    renderStoryDetail();
    try {
      const payload = await requestJson(`/api/story/projects/${encodeURIComponent(id)}`);
      if (storyState.selectedId !== id) return;
      storyState.detail = payload;
      storyState.contract = payload.contracts || storyState.contract;
      storyState.scripts = Array.isArray(payload.scripts) ? payload.scripts : [];
      storyState.assets = Array.isArray(payload.assets) ? payload.assets : [];
      storyState.assetVariants = Array.isArray(payload.assetVariants) ? payload.assetVariants : [];
      storyState.productionModels = payload.productionModels || storyState.productionModels;
      const episodes = Array.isArray(payload.episodes) ? payload.episodes : [];
      if (storyState.selectedEpisodeId && !episodes.some((episode) => episode.id === storyState.selectedEpisodeId)) {
        storyState.selectedEpisodeId = "";
        storyState.selectedShotId = "";
        storyState.shots = [];
      }
      const selectedScript = storyState.scripts.find((script) => script.id === storyState.selectedScriptId) || storyState.scripts[0] || null;
      storyState.selectedScriptId = selectedScript?.id || storyState.scripts[0]?.id || "";
      storyState.selectedManuscriptId = storyScriptManuscriptId(selectedScript || storyState.scripts[0] || {});
      if (!storyState.selectedManuscriptId) storyState.selectedManuscriptId = "";
      const selectedEpisode = episodes.find((episode) => episode.id === storyState.selectedEpisodeId) || null;
      if (selectedEpisode) {
        const episodeManuscriptId = String(selectedEpisode.sourceManuscriptId || "");
        if (episodeManuscriptId) storyState.selectedManuscriptId = episodeManuscriptId;
      }
      if (storyState.selectedManuscriptId
        && !storyState.collapsedManuscriptIds.includes(storyState.selectedManuscriptId)
        && !storyState.expandedManuscriptIds.includes(storyState.selectedManuscriptId)) {
        storyState.expandedManuscriptIds.push(storyState.selectedManuscriptId);
      }
      if (storyState.analysisScriptId && storyState.analysisScriptId !== storyState.selectedScriptId) {
        storyState.analysis = null;
        storyState.analysisScriptId = "";
      }
      syncStoryScriptTargetFromSelection();
      storyState.action = "";
      storyState.actionMessage = "";
      storyState.loading = false;
      renderStoryDetail();
      if (!document.hidden) {
        void syncStoryVideoGenerationRefs(id).finally(() => {
          if (storyState.selectedId === id) scheduleStoryVideoGenerationSync(15000);
        });
      }
    } catch (error) {
      storyState.loading = false;
      storyState.detail = null;
      storyState.scripts = [];
      storyState.assets = [];
      storyState.assetVariants = [];
      storyState.selectedScriptId = "";
      storyState.analysis = null;
      storyState.analysisScriptId = "";
      const host = storyEl("storyProjectDetail");
      if (host) host.innerHTML = `
        <div class="story-detail-panel">
          <button class="story-back-button" data-story-back type="button"><i data-lucide="arrow-left"></i><span>全部项目</span></button>
          <div class="story-library-state is-error"><strong>项目加载失败</strong><span>${storyEscape(error.message || String(error))}</span></div>
        </div>`;
      storyRefreshIcons();
    }
  }

  async function createStoryProject(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const message = storyEl("storyProjectMessage");
    const name = storyEl("storyProjectName")?.value || "";
    if (!name.trim()) {
      if (message) message.textContent = "请输入项目名。";
      return;
    }
    const button = form.querySelector('button[type="submit"]');
    if (button) button.disabled = true;
    if (message) message.textContent = "正在创建…";
    try {
      const payload = await requestJson("/api/story/projects", {
        method: "POST",
        body: {
          name,
          description: storyEl("storyProjectDescription")?.value || "",
          aspectRatio: storyEl("storyProjectAspect")?.value || "9:16",
          episodeTarget: Math.max(0, Number(storyEl("storyProjectEpisodes")?.value || 0) || 0),
        },
      });
      form.reset();
      if (message) message.textContent = "";
      setStoryCreateOpen(false);
      await loadStoryProjects(payload.project?.id || "");
    } catch (error) {
      if (message) message.textContent = error.message || String(error);
    } finally {
      if (button) button.disabled = false;
    }
  }

  async function createStoryEpisode(event) {
    event.preventDefault();
    const id = storyState.selectedId;
    const message = storyEl("storyEpisodeMessage");
    if (!id) return;
    const button = event.currentTarget.querySelector('button[type="submit"]');
    if (button) button.disabled = true;
    if (message) message.textContent = "正在新增…";
    try {
      await requestJson(`/api/story/projects/${encodeURIComponent(id)}/episodes`, {
        method: "POST",
        body: {
          title: storyEl("storyEpisodeTitle")?.value || "",
          synopsis: storyEl("storyEpisodeSynopsis")?.value || "",
        },
      });
      await loadStoryProjects(id);
    } catch (error) {
      if (message) message.textContent = error.message || String(error);
    } finally {
      if (button) button.disabled = false;
    }
  }

  function selectedStoryEpisode() {
    return (storyState.detail?.episodes || []).find((episode) => episode.id === storyState.selectedEpisodeId) || null;
  }

  function parseStoryNames(value = "") {
    return String(value || "").split(/[、,，\n]+/).map((item) => item.trim()).filter(Boolean);
  }

  async function loadStoryEpisodeShots(episodeId = storyState.selectedEpisodeId, { syncCurrent = episodeId === storyState.selectedEpisodeId } = {}) {
    const projectId = storyState.selectedId;
    const id = String(episodeId || "");
    if (!projectId || !id) return [];
    if (!storyState.shotLoadingEpisodeIds.includes(id)) storyState.shotLoadingEpisodeIds.push(id);
    try {
      const payload = await requestJson(`/api/story/projects/${encodeURIComponent(projectId)}/episodes/${encodeURIComponent(id)}/shots`);
      const shots = Array.isArray(payload.shots) ? payload.shots : [];
      setStoryEpisodeShotsCache(id, shots);
      if (syncCurrent || storyState.selectedEpisodeId === id) storyState.shots = shots;
      return shots;
    } finally {
      storyState.shotLoadingEpisodeIds = storyState.shotLoadingEpisodeIds.filter((item) => item !== id);
    }
  }

  function toggleStoryManuscript(manuscriptId = "") {
    const id = String(manuscriptId || "");
    if (!id) return;
    const isCollapsed = storyState.collapsedManuscriptIds.includes(id);
    if (!isCollapsed && storyState.expandedManuscriptIds.includes(id)) {
      storyState.expandedManuscriptIds = storyState.expandedManuscriptIds.filter((item) => item !== id);
      if (!storyState.collapsedManuscriptIds.includes(id)) storyState.collapsedManuscriptIds.push(id);
    } else {
      storyState.collapsedManuscriptIds = storyState.collapsedManuscriptIds.filter((item) => item !== id);
      if (!storyState.expandedManuscriptIds.includes(id)) storyState.expandedManuscriptIds.push(id);
    }
    renderStoryDetail();
  }

  async function toggleStoryEpisode(episodeId = "") {
    const id = String(episodeId || "");
    if (!id) return;
    const isCollapsed = storyState.collapsedEpisodeIds.includes(id);
    if (!isCollapsed && storyState.expandedEpisodeIds.includes(id)) {
      storyState.expandedEpisodeIds = storyState.expandedEpisodeIds.filter((item) => item !== id);
      if (!storyState.collapsedEpisodeIds.includes(id)) storyState.collapsedEpisodeIds.push(id);
      renderStoryDetail();
      return;
    }
    storyState.collapsedEpisodeIds = storyState.collapsedEpisodeIds.filter((item) => item !== id);
    if (!storyState.expandedEpisodeIds.includes(id)) storyState.expandedEpisodeIds.push(id);
    renderStoryDetail();
    if (storyEpisodeShotsLoaded(id)) return;
    try {
      await loadStoryEpisodeShots(id, { syncCurrent: false });
    } catch (error) {
      storyState.actionMessage = error.message || String(error);
    }
    renderStoryDetail();
  }

  async function loadStoryAssetLibraryShots(episodeId = storyState.assetLibraryEpisodeId) {
    const projectId = storyState.selectedId;
    const episodes = Array.isArray(storyState.detail?.episodes) ? storyState.detail.episodes : [];
    const episode = episodes.find((item) => item.id === episodeId) || null;
    if (!projectId || !episode) {
      storyState.assetLibraryShots = [];
      return;
    }
    const payload = await requestJson(`/api/story/projects/${encodeURIComponent(projectId)}/episodes/${encodeURIComponent(episode.id)}/shots`);
    storyState.assetLibraryShots = (Array.isArray(payload.shots) ? payload.shots : []).map((shot) => ({
      ...shot,
      episodeId: episode.id,
      episodeNo: Number(episode.episodeNo || 0),
      episodeTitle: episode.title || "",
    }));
  }

  async function loadStoryAssetLibraryEpisode(episodeId = "") {
    storyState.assetLibraryEpisodeId = episodeId || "";
    storyState.assetLibraryShotKey = "";
    storyState.assetLibraryLoading = Boolean(episodeId);
    renderStoryDetail();
    try {
      await loadStoryAssetLibraryShots(episodeId);
    } catch (error) {
      storyState.actionMessage = error.message || String(error);
    } finally {
      storyState.assetLibraryLoading = false;
      renderStoryDetail();
    }
  }

  async function openStoryAssetLibrary() {
    const episodes = Array.isArray(storyState.detail?.episodes) ? storyState.detail.episodes : [];
    const episodeId = storyState.selectedEpisodeId || storyState.assetLibraryEpisodeId || episodes[0]?.id || "";
    const selectedShot = storyState.shots.find((shot) => shot.id === storyState.selectedShotId);
    const selectedShotKey = episodeId && selectedShot ? storyShotFilterKey(episodeId, selectedShot.shotNo) : "";
    storyState.assetLibraryOpen = true;
    storyState.assetLibraryPreviewAssetId = "";
    storyState.assetLibraryMessage = "";
    await loadStoryAssetLibraryEpisode(episodeId);
    storyState.assetLibraryShotKey = selectedShotKey;
    renderStoryDetail();
  }

  function closeStoryAssetLibrary() {
    storyState.assetLibraryOpen = false;
    storyState.assetLibraryPreviewAssetId = "";
    storyState.assetLibraryMessage = "";
    renderStoryDetail();
  }

  function storyEpisodeTabId(value = "") {
    if (value === "assets" || value === "prompts" || value === "production") return "production";
    return ["outline", "shots"].includes(value) ? value : "outline";
  }

  async function openStoryEpisode(episodeId = "", view = "outline") {
    const id = String(episodeId || "");
    if (!id) return;
    const sameEpisode = storyState.selectedEpisodeId === id;
    const episodeExpanded = storyState.expandedEpisodeIds.includes(id) && !storyState.collapsedEpisodeIds.includes(id);
    if (sameEpisode && episodeExpanded) {
      storyState.expandedEpisodeIds = storyState.expandedEpisodeIds.filter((item) => item !== id);
      if (!storyState.collapsedEpisodeIds.includes(id)) storyState.collapsedEpisodeIds.push(id);
      renderStoryDetail();
      return;
    }
    const episode = (storyState.detail?.episodes || []).find((item) => item.id === id);
    const manuscriptId = String(episode?.sourceManuscriptId || "");
    if (manuscriptId) {
      selectStoryManuscriptById(manuscriptId);
      storyState.collapsedManuscriptIds = storyState.collapsedManuscriptIds.filter((item) => item !== manuscriptId);
      if (!storyState.expandedManuscriptIds.includes(manuscriptId)) storyState.expandedManuscriptIds.push(manuscriptId);
    }
    storyState.collapsedEpisodeIds = storyState.collapsedEpisodeIds.filter((item) => item !== id);
    if (!storyState.expandedEpisodeIds.includes(id)) storyState.expandedEpisodeIds.push(id);
    storyState.selectedEpisodeId = id;
    storyState.episodeTab = storyEpisodeTabId(view);
    if (!sameEpisode) {
      storyState.selectedShotId = "";
      storyState.shots = storyEpisodeShotsFromCache(id);
    }
    storyState.action = "";
    storyState.actionMessage = "";
    renderStoryDetail();
    if (storyEpisodeShotsLoaded(id)) return;
    try {
      await loadStoryEpisodeShots(id);
    } catch (error) {
      storyState.actionMessage = error.message || String(error);
    }
    renderStoryDetail();
  }

  function closeStoryEpisode() {
    storyState.selectedEpisodeId = "";
    storyState.selectedShotId = "";
    storyState.shots = [];
    storyState.actionMessage = "";
    renderStoryDetail();
  }

  async function setStoryEpisodeView(view = "outline") {
    if (!storyState.selectedEpisodeId || storyState.action) return;
    storyState.episodeTab = storyEpisodeTabId(view);
    storyState.actionMessage = "";
    renderStoryDetail();
    if (storyState.episodeTab !== "shots" && storyState.episodeTab !== "production") return;
    try {
      await loadStoryEpisodeShots();
    } catch (error) {
      storyState.actionMessage = error.message || String(error);
    }
    renderStoryDetail();
  }

  async function openStoryShot(shotId = "") {
    if (!shotId || !storyState.selectedEpisodeId || storyState.action) return;
    storyState.selectedShotId = shotId;
    storyState.episodeTab = "production";
    storyState.actionMessage = "";
    if (!storyState.shots.some((shot) => shot.id === shotId)) {
      try {
        await loadStoryEpisodeShots();
      } catch (error) {
        storyState.actionMessage = error.message || String(error);
      }
    }
    if (!storyState.shots.some((shot) => shot.id === shotId)) {
      storyState.selectedShotId = "";
      storyState.actionMessage = "没有读取到这个分镜，请刷新项目结构后重试。";
    }
    renderStoryDetail();
  }

  async function generateStoryEpisodeShots({ confirmReplace = true } = {}) {
    const projectId = storyState.selectedId;
    const episode = selectedStoryEpisode();
    if (!projectId || !episode || storyState.action) return;
    if (!["outline_locked", "shots_planned"].includes(String(episode.status || ""))) {
      storyState.actionMessage = "请先锁定本集大纲，再由 AI 拆分镜。";
      renderStoryDetail();
      return;
    }
    if (confirmReplace && storyState.shots.length && !window.confirm("重新生成会替换当前全部镜头，继续吗？")) return;
    storyState.action = "plan-shots";
    storyState.actionMessage = "AI 正在按定稿大纲拆分镜，通常需要几十秒…";
    storyState.episodeTab = "shots";
    renderStoryDetail();
    try {
      const payload = await requestJson(`/api/story/projects/${encodeURIComponent(projectId)}/episodes/${encodeURIComponent(episode.id)}/shots/plan`, { method: "POST" });
      storyState.shots = Array.isArray(payload.shots) ? payload.shots : [];
      storyState.detail.episodes = (storyState.detail.episodes || []).map((item) => item.id === episode.id
        ? { ...item, ...payload.episode, shotCount: payload.shots?.length || 0 }
        : item);
      storyState.actionMessage = `AI 分镜完成 · ${payload.shots?.length || 0} 个镜头 · ${payload.model || "分析模型"}`;
    } catch (error) {
      storyState.actionMessage = error.message || String(error);
    } finally {
      storyState.action = "";
      renderStoryDetail();
    }
  }

  async function saveStoryEpisode({ status = "" } = {}) {
    const projectId = storyState.selectedId;
    const episode = selectedStoryEpisode();
    if (!projectId || !episode || storyState.action) return;
    const title = storyEl("storyEpisodeEditTitle")?.value || "";
    const durationSeconds = Number(storyEl("storyEpisodeEditDuration")?.value || 0);
    const synopsis = storyEl("storyEpisodeEditSynopsis")?.value || "";
    if (!synopsis.trim()) {
      storyState.actionMessage = "单集大纲不能为空。";
      renderStoryDetail();
      return;
    }
    const metadata = { ...(episode.metadata || {}) };
    metadata.hook = storyEl("storyEpisodeEditHook")?.value || "";
    metadata.characters = parseStoryNames(storyEl("storyEpisodeEditCharacters")?.value || "");
    metadata.scenes = parseStoryNames(storyEl("storyEpisodeEditScenes")?.value || "");
    storyState.action = "save-episode";
    storyState.actionMessage = status === "outline_locked" ? "正在锁定大纲，随后由 AI 拆分镜…" : "正在保存本集…";
    renderStoryDetail();
    try {
      const payload = await requestJson(`/api/story/projects/${encodeURIComponent(projectId)}/episodes/${encodeURIComponent(episode.id)}`, {
        method: "PUT",
        body: {
          title,
          synopsis,
          durationSeconds,
          status: status || episode.status || "draft",
          metadata,
        },
      });
      storyState.detail.episodes = (storyState.detail.episodes || []).map((item) => item.id === episode.id
        ? { ...item, ...payload.episode, shotCount: payload.episode?.shotCount ?? item.shotCount }
        : item);
      if (status === "outline_locked") {
        storyState.action = "plan-shots";
        storyState.actionMessage = "大纲已定稿，AI 正在拆分镜，通常需要几十秒…";
        storyState.episodeTab = "shots";
        renderStoryDetail();
        const planPayload = await requestJson(`/api/story/projects/${encodeURIComponent(projectId)}/episodes/${encodeURIComponent(episode.id)}/shots/plan`, { method: "POST" });
        storyState.shots = Array.isArray(planPayload.shots) ? planPayload.shots : [];
        storyState.detail.episodes = (storyState.detail.episodes || []).map((item) => item.id === episode.id
          ? { ...item, ...planPayload.episode, shotCount: planPayload.shots?.length || 0 }
          : item);
        storyState.actionMessage = `大纲已定稿，AI 已拆分 ${planPayload.shots?.length || 0} 个镜头 · ${planPayload.model || "分析模型"}`;
      } else {
        storyState.actionMessage = "本集修改已保存。";
      }
    } catch (error) {
      storyState.actionMessage = error.message || String(error);
    } finally {
      storyState.action = "";
      renderStoryDetail();
    }
  }

  async function createStoryShot(event) {
    event.preventDefault();
    const projectId = storyState.selectedId;
    const episodeId = storyState.selectedEpisodeId;
    if (!projectId || !episodeId || storyState.action) return;
    const title = storyEl("storyShotTitle")?.value || "";
    if (!title.trim()) {
      storyState.actionMessage = "请填写镜头标题。";
      renderStoryDetail();
      return;
    }
    storyState.action = "create-shot";
    storyState.actionMessage = "正在新增镜头…";
    try {
      await requestJson(`/api/story/projects/${encodeURIComponent(projectId)}/episodes/${encodeURIComponent(episodeId)}/shots`, {
        method: "POST",
        body: {
          title,
          durationSeconds: Number(storyEl("storyShotDuration")?.value || 5),
          description: storyEl("storyShotDescription")?.value || "",
        },
      });
      await loadStoryEpisodeShots();
      const selected = selectedStoryEpisode();
      if (selected) selected.shotCount = storyState.shots.length;
      if (storyState.detail?.project) storyState.detail.project.shotCount = Math.max(0, Number(storyState.detail.project.shotCount || 0) + 1);
      storyState.actionMessage = "镜头已新增。";
    } catch (error) {
      storyState.actionMessage = error.message || String(error);
    } finally {
      storyState.action = "";
      renderStoryDetail();
    }
  }

  async function deleteStoryShot(shotId = "") {
    const projectId = storyState.selectedId;
    const episodeId = storyState.selectedEpisodeId;
    if (!projectId || !episodeId || !shotId || storyState.action) return;
    storyState.action = "delete-shot";
    storyState.actionMessage = "正在删除镜头…";
    try {
      await requestJson(`/api/story/projects/${encodeURIComponent(projectId)}/episodes/${encodeURIComponent(episodeId)}/shots/${encodeURIComponent(shotId)}`, { method: "DELETE" });
      await loadStoryEpisodeShots();
      const selected = selectedStoryEpisode();
      if (selected) selected.shotCount = storyState.shots.length;
      if (storyState.detail?.project) storyState.detail.project.shotCount = Math.max(0, Number(storyState.detail.project.shotCount || 0) - 1);
      storyState.actionMessage = "镜头已删除。";
    } catch (error) {
      storyState.actionMessage = error.message || String(error);
    } finally {
      storyState.action = "";
      renderStoryDetail();
    }
  }

  function storyGenerationImageUrl(record = {}) {
    return [
      record.imageResultUrl,
      record.imageUrl,
      record.resultImageUrl,
      record.cdnImageUrl,
      record.publicImageUrl,
      record.remoteImageUrl,
      record.localImageUrl,
      record.posterUrl,
      record.resultUrl,
      record.outputUrl,
    ].map((value) => String(value || "").trim()).find(Boolean) || "";
  }

  function storyGenerationMediaAssetIds(record = {}) {
    const mediaAssets = Array.isArray(record.mediaAssets) ? record.mediaAssets : [];
    return mediaAssets.flatMap((asset) => {
      if (!asset || typeof asset !== "object") return [];
      return [
        asset.userAssetId,
        asset.assetId,
        asset.mediaAssetId,
        asset.id,
        ...(Array.isArray(asset.userAssetIds) ? asset.userAssetIds : []),
      ].map((value) => String(value || "").trim()).filter(Boolean);
    });
  }

  function storyGenerationResultAssetIds(record = {}) {
    return [...new Set([
      record.resultAssetId,
      ...(Array.isArray(record.resultAssetIds) ? record.resultAssetIds : []),
      record.userAssetId,
      ...(Array.isArray(record.userAssetIds) ? record.userAssetIds : []),
      ...storyGenerationMediaAssetIds(record),
    ].map((value) => String(value || "").trim()).filter(Boolean))];
  }

  function storyGenerationResultAssetId(record = {}) {
    return storyGenerationResultAssetIds(record)[0] || "";
  }

  function storyGenerationVideoUrl(record = {}) {
    const arrays = [record.resultVideoUrls, record.videoUrls, record.outputUrls]
      .filter(Array.isArray)
      .flat()
      .map((item) => typeof item === "string" ? item : item?.url || item?.videoUrl || "");
    return [
      record.cdnVideoUrl,
      record.remoteVideoUrl,
      record.providerVideoUrl,
      record.upstreamVideoUrl,
      record.localVideoUrl,
      record.videoUrl,
      record.resultVideoUrl,
      record.resultUrl,
      record.outputUrl,
      ...arrays,
    ].map((value) => String(value || "").trim()).find(Boolean) || "";
  }

  function storyGenerationRefVideoUrl(ref = {}) {
    return storyGenerationVideoUrl(ref.metadata || {});
  }

  function storyGenerationStatusSucceeded(status = "") {
    return ["succeeded", "success", "completed", "complete"].includes(String(status || "").toLowerCase());
  }

  async function pollStoryGenerationRecord(taskId = "") {
    for (let attempt = 0; attempt < 120; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, attempt ? 3000 : 1000));
      const payload = await requestJson(`/api/generation-records/${encodeURIComponent(taskId)}`);
      const record = payload.record || payload.generation || {};
      const status = String(record.status || "").toLowerCase();
      if (["failed", "error", "canceled", "cancelled"].includes(status)) throw new Error(record.error || "资产设计图生成失败。");
      if (storyGenerationImageUrl(record)) return record;
      if (["succeeded", "success", "completed", "complete"].includes(status)) break;
    }
    throw new Error("资产设计图生成超时，请稍后刷新项目查看结果。");
  }

  async function pollStoryVideoGenerationRecord(taskId = "") {
    for (let attempt = 0; attempt < 180; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, attempt ? 3000 : 1000));
      const payload = await requestJson(`/api/generation-records/${encodeURIComponent(taskId)}`);
      const record = payload.record || payload.generation || {};
      const status = String(record.status || "").toLowerCase();
      if (["failed", "error", "canceled", "cancelled"].includes(status)) throw new Error(record.error || record.message || "视频生成失败。");
      const videoUrl = storyGenerationVideoUrl(record);
      if (videoUrl) return { ...record, resolvedVideoUrl: videoUrl };
      if (["succeeded", "success", "completed", "complete"].includes(status)) break;
    }
    throw new Error("视频生成超时，请稍后在当前分镜刷新查看结果。");
  }

  function storyVideoRefPending(ref = {}) {
    const status = String(ref.status || ref.metadata?.generationStatus || "queued").toLowerCase();
    return Boolean(ref.generationRecordId)
      && ref.kind === "video"
      && !["failed", "error", "canceled", "cancelled"].includes(status)
      && !storyGenerationRefVideoUrl(ref);
  }

  async function refreshStoryGenerationVideoSource(video = null) {
    if (!video?.matches?.("video[data-story-generation-video]")) return;
    const recordId = String(video.dataset.generationRecordId || "").trim();
    if (!recordId) return;
    const status = video.parentElement?.querySelector("[data-story-video-status]");
    if (video.dataset.storyVideoRefreshing === "1" || video.dataset.storyVideoRefreshAttempted === "1") {
      if (status) {
        status.textContent = "视频链接刷新失败，请稍后重试。";
        status.hidden = false;
      }
      return;
    }
    video.dataset.storyVideoRefreshAttempted = "1";
    video.dataset.storyVideoRefreshing = "1";
    if (status) {
      status.textContent = "视频链接已过期，正在刷新…";
      status.hidden = false;
    }
    try {
      const payload = await requestJson(`/api/generation-records/${encodeURIComponent(recordId)}`);
      const record = payload.record || payload.generation || {};
      const nextUrl = storyGenerationVideoUrl(record);
      if (!nextUrl) throw new Error("视频地址尚未同步。");
      video.src = nextUrl;
      const link = video.parentElement?.querySelector("a[data-story-generation-video-link]");
      if (link) link.href = nextUrl;
      if (status) status.textContent = "视频链接已刷新，正在加载…";
      video.addEventListener("loadeddata", () => {
        if (status) status.hidden = true;
      }, { once: true });
      video.load();
    } catch (error) {
      if (status) {
        status.textContent = error?.message || "视频链接刷新失败，请稍后重试。";
        status.hidden = false;
      }
    } finally {
      delete video.dataset.storyVideoRefreshing;
    }
  }

  function storyIsVegaVideoModel(model = {}) {
    return String(model.family || "") === "vega" || /vega/i.test(String(model.id || ""));
  }

  function storyIsSeedanceVideoModel(model = {}) {
    return !storyIsVegaVideoModel(model)
      && (String(model.family || "") === "seedance" || /seedance/i.test(String(model.id || "")));
  }

  function storyIsWanVideoModel(model = {}) {
    return String(model.family || "") === "wan" || /wan/i.test(String(model.id || ""));
  }

  function storyVideoReferenceLimit(model = {}) {
    if (storyIsVegaVideoModel(model)) return 30;
    if (String(model.family || "") === "wan" || /wan/i.test(String(model.id || ""))) return 10;
    return 9;
  }

  function storyAssetVariantReferenceIds(variant = {}) {
    const metadata = variant.metadata && typeof variant.metadata === "object" ? variant.metadata : {};
    return [...new Set([
      metadata.resultAssetId,
      ...(Array.isArray(metadata.resultAssetIds) ? metadata.resultAssetIds : []),
      metadata.userAssetId,
      ...(Array.isArray(metadata.userAssetIds) ? metadata.userAssetIds : []),
      metadata.assetId,
      metadata.mediaAssetId,
    ].map((value) => String(value || "").trim()).filter(Boolean))];
  }

  async function storyApprovedAssetReferences(episode = {}, shot = {}) {
    const assets = storyShotAssets(episode, shot);
    const references = [];
    for (const asset of assets) {
      const variant = storyApprovedAssetVariant(asset);
      if (!variant || variant.status !== "approved") continue;
      let assetIds = storyAssetVariantReferenceIds(variant);
      if (!assetIds.length && variant.metadata?.generationRecordId) {
        const materialized = await requestJson(`/api/generation-records/${encodeURIComponent(variant.metadata.generationRecordId)}/add-asset`, { method: "POST" });
        assetIds = [materialized.asset?.id].map((value) => String(value || "").trim()).filter(Boolean);
        if (assetIds.length) {
          const updated = await requestJson(`/api/story/projects/${encodeURIComponent(storyState.selectedId)}/assets/${encodeURIComponent(asset.id)}/variants/${encodeURIComponent(variant.id)}`, {
            method: "PUT",
            body: { metadata: { resultAssetId: assetIds[0], resultAssetIds: assetIds } },
          });
          if (updated.variant) {
            storyState.assetVariants = storyState.assetVariants.map((item) => item.id === updated.variant.id ? updated.variant : item);
          }
        }
      }
      if (!assetIds.length) {
        throw new Error(`「${asset.name}」已定稿，但没有可复用的资产 ID。请打开资产库重新加入资产后再生成视频。`);
      }
      assetIds.forEach((assetId) => {
        references.push({
          assetId,
          assetName: String(asset.name || ""),
        });
      });
    }
    const seen = new Set();
    return references.filter((reference) => {
      const key = reference.assetId ? `id:${reference.assetId}` : `url:${reference.url}`;
      if ((!reference.assetId && !reference.url) || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  function storyVideoMediaParams(model = {}, references = []) {
    const limited = references.slice(0, storyVideoReferenceLimit(model));
    if (!limited.length) return {};
    const mediaEntry = (reference) => ({ assetId: reference.assetId });
    const modelId = String(model.id || "");
    if (storyIsWanVideoModel(model)) {
      const wan30Prime = /wan30-prime|wan3\.0-prime|w3-prime/i.test(modelId);
      const wan30 = wan30Prime || /wan30|wan3\.0|w3/i.test(modelId);
      return {
        provider: wan30 ? "wan30" : "wan27",
        videoCapability: wan30Prime ? "wan30-video-prime" : wan30 ? "wan30-video" : "wan27-r2v",
        mediaMode: wan30 ? "multimodal" : "wan27-r2v",
        referenceImages: limited.map(mediaEntry),
      };
    }
    if (storyIsVegaVideoModel(model)) {
      return {
        provider: modelId,
        mediaMode: "reference_video",
        referenceImages: limited.map(mediaEntry),
        referenceImageAssetIds: limited.map((reference) => reference.assetId),
      };
    }
    if (storyIsSeedanceVideoModel(model)) {
      return {
        seedanceMode: "reference_video",
        ...(/seedance25|seedance-nsfw/i.test(modelId) ? { functionMode: "reference_video" } : {}),
        referenceImages: limited.map(mediaEntry),
      };
    }
    return {
      firstFrameAssetId: limited[0].assetId,
      ...(limited.length > 1 ? {
        referenceImageAssetIds: limited.slice(1).map((reference) => reference.assetId).filter(Boolean),
        referenceImages: limited.slice(1).map(mediaEntry),
      } : {}),
    };
  }

  async function updateStoryVideoGenerationRef(projectId = "", ref = {}, patch = {}) {
    if (!projectId || !ref?.id) return ref;
    const payload = await requestJson(`/api/story/projects/${encodeURIComponent(projectId)}/generation-refs/${encodeURIComponent(ref.id)}`, {
      method: "PUT",
      body: {
        generationRecordId: ref.generationRecordId || "",
        ...patch,
      },
    });
    const updated = payload.generationRef || ref;
    if (storyState.selectedId === projectId && Array.isArray(storyState.detail?.generationRefs)) {
      storyState.detail.generationRefs = storyState.detail.generationRefs.map((item) => item.id === updated.id ? updated : item);
    }
    return updated;
  }

  async function syncStoryVideoGenerationRefs(projectId = "") {
    const id = String(projectId || storyState.selectedId || "").trim();
    if (!id || storyState.syncingGenerationRefs || storyState.selectedId !== id) return false;
    const refs = (Array.isArray(storyState.detail?.generationRefs) ? storyState.detail.generationRefs : [])
      .filter(storyVideoRefPending);
    if (!refs.length) return false;
    storyState.syncingGenerationRefs = true;
    let changed = false;
    try {
      await Promise.all(refs.map(async (ref) => {
        try {
          const payload = await requestJson(`/api/generation-records/${encodeURIComponent(ref.generationRecordId)}`);
          const record = payload.record || payload.generation || {};
          const status = String(record.status || "").toLowerCase();
          const videoUrl = storyGenerationVideoUrl(record);
          if (videoUrl) {
            await updateStoryVideoGenerationRef(id, ref, {
              status: "succeeded",
              metadata: {
                videoUrl,
                posterUrl: record.posterUrl || record.coverUrl || "",
                generationStatus: record.status || "succeeded",
                syncedAt: new Date().toISOString(),
              },
            });
            changed = true;
            return;
          }
          if (storyGenerationStatusSucceeded(status)) {
            await updateStoryVideoGenerationRef(id, ref, {
              status: "succeeded",
              metadata: {
                generationStatus: record.status || status,
                mediaSyncPending: true,
                syncedAt: new Date().toISOString(),
              },
            });
            changed = true;
            return;
          }
          if (["failed", "error", "canceled", "cancelled"].includes(status)) {
            await updateStoryVideoGenerationRef(id, ref, {
              status: "failed",
              metadata: {
                error: record.error || record.message || "视频生成失败。",
                generationStatus: record.status || status,
                syncedAt: new Date().toISOString(),
              },
            });
            changed = true;
          }
        } catch (error) {
          // Transient record lookups must not turn a running task into a failed task,
          // but keep the failure visible so sync bugs are not silently swallowed.
          console.warn("[story-video-sync]", ref.id || "", ref.generationRecordId || "", status || "", error?.message || error);
        }
      }));
    } finally {
      storyState.syncingGenerationRefs = false;
    }
    if (changed && storyState.selectedId === id) renderStoryDetail();
    return changed;
  }

  function scheduleStoryVideoGenerationSync(delay = 15000) {
    clearTimeout(storyState.videoSyncTimer);
    storyState.videoSyncTimer = null;
    if (document.hidden || !storyState.selectedId) return;
    const refs = (Array.isArray(storyState.detail?.generationRefs) ? storyState.detail.generationRefs : []).filter(storyVideoRefPending);
    if (!refs.length) return;
    const projectId = storyState.selectedId;
    storyState.videoSyncTimer = setTimeout(async () => {
      await syncStoryVideoGenerationRefs(projectId);
      if (storyState.selectedId === projectId) scheduleStoryVideoGenerationSync(15000);
    }, Math.max(0, Number(delay) || 0));
  }

  function openStoryRevisionRequest(request = {}) {
    storyState.revisionRequest = {
      kind: String(request.kind || ""),
      itemId: String(request.itemId || ""),
      shotId: String(request.shotId || ""),
      title: String(request.title || "补充修改意见"),
      message: String(request.message || ""),
    };
    renderStoryDetail();
    requestAnimationFrame(() => storyEl("storyRevisionFeedback")?.focus());
  }

  function closeStoryRevisionRequest() {
    if (!storyState.revisionRequest) return;
    storyState.revisionRequest = null;
    renderStoryDetail();
  }

  async function submitStoryRevisionRequest() {
    const request = storyState.revisionRequest;
    if (!request) return;
    const feedback = String(storyEl("storyRevisionFeedback")?.value || "").trim();
    if (!feedback) {
      storyState.actionMessage = "请填写本次重新生成要修改的地方。";
      renderStoryDetail();
      requestAnimationFrame(() => storyEl("storyRevisionFeedback")?.focus());
      return;
    }
    storyState.revisionRequest = null;
    if (request.kind === "asset") {
      await generateStoryAssetImage(request.itemId, request.shotId, feedback);
    } else if (request.kind === "prompt") {
      await planStoryEpisodePrompts(request.shotId, feedback);
    }
  }

  async function createStoryAssetImageVariant(asset = {}, revisionFeedback = "") {
    const projectId = storyState.selectedId;
    const episodeId = storyState.selectedEpisodeId;
    if (!projectId || !episodeId || !asset.id) return;
    const models = Array.isArray(storyState.productionModels?.image) ? storyState.productionModels.image : [];
    const modelId = storyState.imageModel || models[0]?.id || "qwen-image3";
    const model = models.find((item) => item.id === modelId) || models[0] || { id: modelId, label: modelId };
    const basePrompt = String(asset.metadata?.imagePrompt || asset.description || "").trim();
    if (!basePrompt) throw new Error(`${asset.name} 缺少设计图提示词，请先重新提取资产。`);
    const prompt = [
      basePrompt,
      revisionFeedback ? `本次重新生成的修改要求：${revisionFeedback}` : "",
    ].filter(Boolean).join("\n\n");
    const payload = await requestJson("/api/advanced/generate", {
      method: "POST",
      body: {
        provider: model.id,
        prompt,
        resolution: model.resolution || "2K",
        ratio: model.ratio || storyState.detail?.project?.aspectRatio || "3:4",
        duration: 1,
        params: { createKind: "story-asset", projectId, episodeId, storyAssetId: asset.id, storyImageModel: model.id, revisionFeedback },
      },
    });
    const taskId = payload.taskId || payload.task?.taskId || payload.record?.taskId || "";
    if (!taskId) throw new Error("出图任务没有返回 taskId。");
    const created = await requestJson(`/api/story/projects/${encodeURIComponent(projectId)}/assets/${encodeURIComponent(asset.id)}/variants`, {
      method: "POST",
      body: {
        name: `${asset.name} · ${model.label}`,
        description: prompt,
        prompt,
        provider: model.id,
        generationRecordId: taskId,
        status: "generating",
        metadata: { model: model.id, modelLabel: model.label, episodeId, revisionFeedback },
      },
    });
    const variant = created.variant;
    try {
      let generationRecord = payload.record || {};
      let imageUrl = storyGenerationImageUrl(generationRecord) || storyAssetVariantImageUrl(variant);
      let generationStatus = "ready";
      if (!imageUrl) {
        generationRecord = await pollStoryGenerationRecord(taskId);
        imageUrl = storyGenerationImageUrl(generationRecord);
        generationStatus = String(generationRecord.status || "ready");
      }
      if (imageUrl && variant?.id) {
        const updated = await requestJson(`/api/story/projects/${encodeURIComponent(projectId)}/assets/${encodeURIComponent(asset.id)}/variants/${encodeURIComponent(variant.id)}`, {
          method: "PUT",
          body: {
            status: "ready",
            metadata: {
              imageUrl,
              generationStatus,
              resultAssetId: storyGenerationResultAssetId(generationRecord),
              resultAssetIds: storyGenerationResultAssetIds(generationRecord),
            },
          },
        });
        storyState.assetVariants = [updated.variant, ...storyState.assetVariants.filter((item) => item.id !== updated.variant.id)];
      }
    } catch (error) {
      if (variant?.id) {
        await requestJson(`/api/story/projects/${encodeURIComponent(projectId)}/assets/${encodeURIComponent(asset.id)}/variants/${encodeURIComponent(variant.id)}`, {
          method: "PUT",
          body: { status: "failed", metadata: { generationError: error.message || String(error) } },
        }).catch(() => {});
      }
      throw error;
    }
    return variant;
  }

  async function planStoryEpisodeAssets() {
    const projectId = storyState.selectedId;
    const episode = selectedStoryEpisode();
    if (!projectId || !episode || storyState.action) return;
    if (!storyState.shots.length) await loadStoryEpisodeShots();
    if (!storyState.shots.length) {
      storyState.actionMessage = "请先生成本集分镜，再让 AI 提取资产。";
      renderStoryDetail();
      return;
    }
    storyState.action = "plan-assets";
    storyState.episodeTab = "production";
    storyState.actionMessage = "AI 正在根据本集分镜提取角色、场景和关键道具…";
    renderStoryDetail();
    try {
      const payload = await requestJson(`/api/story/projects/${encodeURIComponent(projectId)}/episodes/${encodeURIComponent(episode.id)}/assets/plan`, { method: "POST" });
      await clearStoryShotAssetConfirmations();
      await loadStoryDetail(projectId);
      storyState.episodeTab = "production";
      storyState.actionMessage = `已提取 ${payload.assets?.length || 0} 个本集资产 · ${payload.model || "分析模型"}`;
    } catch (error) {
      storyState.actionMessage = error.message || String(error);
    } finally {
      storyState.action = "";
      renderStoryDetail();
    }
  }

  async function saveStoryShotState(shot = {}, metadataPatch = {}) {
    const projectId = storyState.selectedId;
    const episode = selectedStoryEpisode();
    if (!projectId || !episode || !shot.id) return null;
    const payload = await requestJson(`/api/story/projects/${encodeURIComponent(projectId)}/episodes/${encodeURIComponent(episode.id)}/shots/${encodeURIComponent(shot.id)}`, {
      method: "PUT",
      body: {
        title: shot.title || "",
        description: shot.description || "",
        imagePrompt: shot.imagePrompt || "",
        videoPrompt: shot.videoPrompt || "",
        durationSeconds: Number(shot.durationSeconds || 5),
        status: shot.status || "draft",
        metadata: { ...(shot.metadata || {}), ...metadataPatch },
      },
    });
    const saved = payload.shot || null;
    if (saved) storyState.shots = storyState.shots.map((item) => item.id === saved.id ? { ...item, ...saved } : item);
    return saved;
  }

  async function clearStoryShotAssetConfirmations() {
    for (const shot of storyState.shots) {
      if (!shot.metadata?.assetsConfirmedAt) continue;
      await saveStoryShotState(shot, { assetsConfirmedAt: null, assetsConfirmedCount: 0 }).catch(() => null);
    }
  }

  async function confirmStoryShotAssets(shotId = "") {
    const episode = selectedStoryEpisode();
    const shot = storyState.shots.find((item) => item.id === shotId);
    if (!episode || !shot || storyState.action) return;
    const shotAssets = storyShotAssets(episode, shot);
    if (!shotAssets.length) {
      storyState.actionMessage = "此镜还没有资产清单，请先让 AI 按分镜提取资产。";
      renderStoryDetail();
      return;
    }
    storyState.action = "confirm-shot-assets";
    storyState.selectedShotId = shot.id;
    storyState.actionMessage = `正在确认 S${String(shot.shotNo).padStart(2, "0")} 的资产清单…`;
    renderStoryDetail();
    try {
      await saveStoryShotState(shot, { assetsConfirmedAt: new Date().toISOString(), assetsConfirmedCount: shotAssets.length });
      storyState.actionMessage = `S${String(shot.shotNo).padStart(2, "0")} 已确认 ${shotAssets.length} 个资产，可以按镜生成设计图。`;
    } catch (error) {
      storyState.actionMessage = error.message || String(error);
    } finally {
      storyState.action = "";
      renderStoryDetail();
    }
  }

  async function generateStoryShotAssets(shotId = "") {
    const episode = selectedStoryEpisode();
    const shot = storyState.shots.find((item) => item.id === shotId);
    if (!episode || !shot || storyState.action) return;
    if (!storyShotAssetsConfirmed(shot)) {
      storyState.actionMessage = "请先确认此镜的资产清单，再生成设计图。";
      renderStoryDetail();
      return;
    }
    const assets = storyShotAssets(episode, shot).filter((asset) => !storyAssetHasGeneratedImage(asset));
    if (!assets.length) return;
    storyState.action = "generate-shot-assets";
    storyState.selectedShotId = shot.id;
    renderStoryDetail();
    const failures = [];
    try {
      for (const [index, asset] of assets.entries()) {
        storyState.generatingAssetId = asset.id;
        storyState.actionMessage = `S${String(shot.shotNo).padStart(2, "0")} 正在生成「${asset.name}」…（${index + 1}/${assets.length}）`;
        renderStoryDetail();
        try {
          await createStoryAssetImageVariant(asset);
        } catch (error) {
          failures.push(`${asset.name}：${error.message || String(error)}`);
        }
      }
      await loadStoryDetail(storyState.selectedId);
      await loadStoryEpisodeShots();
      storyState.episodeTab = "production";
      storyState.actionMessage = failures.length ? `部分资产生成失败：${failures.slice(0, 3).join("；")}` : `S${String(shot.shotNo).padStart(2, "0")} 的资产设计图已生成，可直接在分镜卡片内定稿。`;
    } catch (error) {
      storyState.actionMessage = error.message || String(error);
    } finally {
      storyState.action = "";
      storyState.generatingAssetId = "";
      renderStoryDetail();
    }
  }

  async function generateStoryAssetImage(assetId = "", shotId = "", revisionFeedback = "") {
    const asset = storyEpisodeAssets(selectedStoryEpisode() || {}).find((item) => item.id === assetId);
    if (!asset || storyState.action) return;
    const shot = shotId ? storyState.shots.find((item) => item.id === shotId) : null;
    if (shot && !storyShotAssetsConfirmed(shot)) {
      storyState.actionMessage = "请先确认此镜的资产清单，再生成设计图。";
      renderStoryDetail();
      return;
    }
    if (storyAssetHasGeneratedImage(asset) && !revisionFeedback) {
      openStoryRevisionRequest({
        kind: "asset",
        itemId: asset.id,
        shotId,
        title: `重新生成「${asset.name}」`,
        message: "上一次结果不会自动变化。请说明这次要改什么，AI 会带着修改要求重新生成。",
      });
      return;
    }
    storyState.action = "generate-asset";
    storyState.generatingAssetId = asset.id;
    storyState.actionMessage = `AI 正在生成「${asset.name}」的资产设计图…`;
    renderStoryDetail();
    try {
      await createStoryAssetImageVariant(asset, revisionFeedback);
      await loadStoryDetail(storyState.selectedId);
      storyState.episodeTab = "production";
      storyState.actionMessage = `「${asset.name}」设计图已生成，可在当前分镜直接设为定稿。`;
    } catch (error) {
      storyState.actionMessage = error.message || String(error);
    } finally {
      storyState.action = "";
      storyState.generatingAssetId = "";
      renderStoryDetail();
    }
  }

  async function generateStoryShotVideo(shotId = "") {
    const projectId = storyState.selectedId;
    const episode = selectedStoryEpisode();
    const shot = storyState.shots.find((item) => item.id === shotId);
    if (!projectId || !episode || !shot || storyState.action) return;
    const prompt = String(shot.videoPrompt || "").trim();
    const assets = storyShotAssets(episode, shot);
    const models = Array.isArray(storyState.productionModels?.video) ? storyState.productionModels.video : [];
    const model = models.find((item) => item.id === storyState.videoModel) || models[0] || { id: storyState.videoModel, label: storyState.videoModel };
    if (!assets.length || !assets.every((asset) => storyAssetHasApprovedImage(asset))) {
      storyState.actionMessage = "请先在当前分镜定稿全部资产图。";
      renderStoryDetail();
      return;
    }
    if (!storyShotPromptMatchesModel(shot, model.id, storyState.promptResolution)) {
      storyState.actionMessage = "请先按当前视频模型和分辨率优化此镜提示词。";
      renderStoryDetail();
      return;
    }
    const duration = Math.max(1, Math.min(30, Number(storyEl("storyShotVideoDuration")?.value || shot.durationSeconds || storyState.videoDuration || 5) || 5));
    storyState.videoDuration = duration;
    storyState.action = "generate-video";
    storyState.selectedShotId = shot.id;
    storyState.actionMessage = `正在绑定 S${String(shot.shotNo).padStart(2, "0")} 的定稿素材并提交视频任务…`;
    renderStoryDetail();
    let generationRef = null;
    try {
      const mediaReferences = await storyApprovedAssetReferences(episode, shot);
      const mediaParams = storyVideoMediaParams(model, mediaReferences);
      if (!Object.keys(mediaParams).length) {
        throw new Error("没有解析到可用的定稿素材 ID 或图片地址，已阻止无素材生成。请重新定稿此镜资产后再试。");
      }
      const payload = await requestJson("/api/advanced/generate", {
        method: "POST",
        body: {
          provider: model.id,
          prompt,
          resolution: storyState.promptResolution,
          ratio: storyState.detail?.project?.aspectRatio || "9:16",
          duration,
          ...mediaParams,
          params: {
            createKind: "story-shot-video",
            projectId,
            episodeId: episode.id,
            shotId: shot.id,
            shotNo: shot.shotNo,
          },
        },
      });
      const taskId = payload.taskId || payload.task?.taskId || payload.task?.id || payload.record?.taskId || payload.record?.id || "";
      if (!taskId) throw new Error("视频任务没有返回 taskId。");
      const referenceAssetIds = [
        mediaParams.firstFrameAssetId,
        ...(Array.isArray(mediaParams.referenceImageAssetIds) ? mediaParams.referenceImageAssetIds : []),
        ...(Array.isArray(mediaParams.referenceImages) ? mediaParams.referenceImages.map((item) => item?.assetId || "") : []),
      ].map((value) => String(value || "").trim()).filter((value, index, list) => value && list.indexOf(value) === index);
      const created = await requestJson(`/api/story/projects/${encodeURIComponent(projectId)}/shots/${encodeURIComponent(shot.id)}/generation-refs`, {
        method: "POST",
        body: {
          generationRecordId: taskId,
          kind: "video",
          status: "queued",
          metadata: {
            model: model.id,
            modelLabel: model.label,
            resolution: storyState.promptResolution,
            duration,
            prompt,
            episodeId: episode.id,
            shotNo: shot.shotNo,
            referenceAssetIds,
            referenceImageCount: mediaReferences.length,
            mediaMode: mediaParams.mediaMode || mediaParams.seedanceMode || (mediaParams.firstFrameAssetId ? "first_frame_with_references" : "reference_images"),
          },
        },
      });
      generationRef = created.generationRef || null;
      storyState.detail.generationRefs = [generationRef, ...(storyState.detail.generationRefs || []).filter((item) => item?.id !== generationRef?.id)].filter(Boolean);
      storyState.actionMessage = `S${String(shot.shotNo).padStart(2, "0")} 视频任务已提交后台，已绑定 ${mediaReferences.length} 张定稿素材，可继续操作；完成后会自动回填。`;
      scheduleStoryVideoGenerationSync(1200);
    } catch (error) {
      if (generationRef?.id) {
        await requestJson(`/api/story/projects/${encodeURIComponent(projectId)}/generation-refs/${encodeURIComponent(generationRef.id)}`, {
          method: "PUT",
          body: { status: "failed", metadata: { error: error.message || String(error) } },
        }).catch(() => {});
      }
      storyState.actionMessage = error.message || String(error);
    } finally {
      storyState.action = "";
      renderStoryDetail();
    }
  }

  async function generateMissingStoryAssets() {
    const assets = storyAssetsNeedingImage(storyEpisodeAssets(selectedStoryEpisode() || {}));
    if (!assets.length || storyState.action) return;
    storyState.action = "generate-assets";
    storyState.episodeTab = "production";
    storyState.actionMessage = `AI 正在依次生成 ${assets.length} 个资产设计图…`;
    renderStoryDetail();
    const failures = [];
    try {
      for (const [index, asset] of assets.entries()) {
        storyState.generatingAssetId = asset.id;
        storyState.actionMessage = `正在生成「${asset.name}」…（已完成 ${index} / ${assets.length}，剩余 ${assets.length - index - 1}）`;
        renderStoryDetail();
        try {
          await createStoryAssetImageVariant(asset);
        } catch (error) {
          failures.push(`${asset.name}：${error.message || String(error)}`);
        }
      }
      await loadStoryDetail(storyState.selectedId);
      storyState.episodeTab = "production";
      storyState.actionMessage = failures.length ? `部分资产生成失败：${failures.slice(0, 3).join("；")}` : "本集未定稿资产已全部生成，请逐个审核定稿。";
    } catch (error) {
      storyState.actionMessage = error.message || String(error);
    } finally {
      storyState.action = "";
      storyState.generatingAssetId = "";
      renderStoryDetail();
    }
  }

  async function approveStoryAssetImage(assetId = "", variantId = "") {
    const projectId = storyState.selectedId;
    if (!projectId || !assetId || !variantId || storyState.action) return;
    storyState.action = "approve-asset";
    storyState.actionMessage = "正在定稿资产设计图…";
    storyState.assetLibraryMessage = "正在定稿这张资产设计图…";
    renderStoryDetail();
    try {
      const payload = await requestJson(`/api/story/projects/${encodeURIComponent(projectId)}/assets/${encodeURIComponent(assetId)}/variants/${encodeURIComponent(variantId)}/approve`, { method: "POST" });
      await loadStoryDetail(projectId);
      storyState.episodeTab = "production";
      storyState.actionMessage = `「${payload.asset?.name || "资产"}」已定稿。`;
      storyState.assetLibraryMessage = storyState.actionMessage;
    } catch (error) {
      storyState.actionMessage = error.message || String(error);
      storyState.assetLibraryMessage = `定稿失败：${storyState.actionMessage}`;
    } finally {
      storyState.action = "";
      renderStoryDetail();
    }
  }

  async function useStoryAssetVariant(assetId = "") {
    const projectId = storyState.selectedId;
    const id = String(assetId || "");
    const selector = [...document.querySelectorAll("[data-story-reuse-variant]")]
      .find((select) => select.dataset.storyReuseVariant === id);
    const variantId = String(selector?.value || "");
    if (!projectId || !id || !variantId || storyState.action) {
      storyState.actionMessage = "请先从已有定稿素材中选择一张。";
      renderStoryDetail();
      return;
    }
    storyState.action = "reuse-asset";
    storyState.actionMessage = "正在关联已有定稿素材…";
    renderStoryDetail();
    try {
      const payload = await requestJson(`/api/story/projects/${encodeURIComponent(projectId)}/assets/${encodeURIComponent(id)}/use-variant`, {
        method: "POST",
        body: { variantId },
      });
      await loadStoryDetail(projectId);
      storyState.episodeTab = "production";
      storyState.actionMessage = `已关联「${payload.asset?.name || "资产"}」的已有定稿素材。`;
    } catch (error) {
      storyState.actionMessage = error.message || String(error);
    } finally {
      storyState.action = "";
      renderStoryDetail();
    }
  }

  async function planStoryEpisodePrompts(targetShotId = "", revisionFeedback = "") {
    const projectId = storyState.selectedId;
    const episode = selectedStoryEpisode();
    if (!projectId || !episode || storyState.action) return;
    const requestedShotId = String(targetShotId || "").trim();
    const shots = [...storyState.shots]
      .filter((shot) => !requestedShotId || shot.id === requestedShotId)
      .sort((a, b) => a.shotNo - b.shotNo);
    if (!shots.length) {
      storyState.actionMessage = "请先生成本集分镜。";
      renderStoryDetail();
      return;
    }
    if (!revisionFeedback && shots.some((shot) => String(shot.videoPrompt || "").trim())) {
      openStoryRevisionRequest({
        kind: "prompt",
        shotId: requestedShotId,
        title: requestedShotId ? "刷新此镜提示词" : "批量刷新本集提示词",
        message: "已有提示词不会自动变好。请说明这次要调整什么，AI 会在上一版基础上按意见重写。",
      });
      return;
    }
    const videoModel = storyEl("storyVideoModel")?.value || storyState.videoModel;
    const optimizerModel = storyEl("storyOptimizerModel")?.value || storyState.optimizerModel;
    const resolution = storyEl("storyPromptResolution")?.value || storyState.promptResolution;
    storyState.videoModel = videoModel;
    storyState.optimizerModel = optimizerModel;
    storyState.promptResolution = resolution;
    storyState.action = "plan-prompts";
    storyState.episodeTab = "production";
    storyState.selectedShotId = requestedShotId || storyState.selectedShotId;
    storyState.actionMessage = `AI 正在逐镜优化 0/${shots.length}…`;
    renderStoryDetail();
    const updatedShots = [];
    const failures = [];
    let modelLabel = videoModel;
    try {
      for (let index = 0; index < shots.length; index += 1) {
        const shot = shots[index];
        storyState.actionMessage = `AI 正在优化 ${index + 1}/${shots.length} · S${String(shot.shotNo).padStart(2, "0")} ${shot.title || ""}…`;
        renderStoryDetail();
        try {
          const payload = await requestJson(`/api/story/projects/${encodeURIComponent(projectId)}/episodes/${encodeURIComponent(episode.id)}/prompts/plan`, {
            method: "POST",
            body: { provider: videoModel, optimizerModel, resolution, shotId: shot.id, revisionFeedback },
          });
          modelLabel = payload.model?.label || modelLabel;
          const savedShot = payload.shots?.[0];
          if (savedShot) {
            updatedShots.push(savedShot);
            storyState.shots = storyState.shots.map((item) => item.id === savedShot.id ? { ...item, ...savedShot } : item);
          }
          if (Array.isArray(payload.failures)) failures.push(...payload.failures);
        } catch (error) {
          failures.push({ shotId: shot.id, shotNo: shot.shotNo, message: error.message || String(error) });
        }
        storyState.actionMessage = `AI 已优化 ${index + 1}/${shots.length} 个镜头，正在同步结果…`;
        renderStoryDetail();
      }
      await loadStoryEpisodeShots();
      await loadStoryDetail(projectId);
      storyState.episodeTab = "production";
      const successCount = updatedShots.length;
      const failureText = failures.length
        ? `，失败 ${failures.length} 个：${failures.slice(0, 3).map((item) => `S${item.shotNo} ${item.message}`).join("；")}`
        : "";
      storyState.actionMessage = successCount
        ? `已按 ${modelLabel} 生成并冻结 ${successCount} 个镜头的最终提示词${failureText}。`
        : (failures[0]?.message || "全部镜头提示词优化失败，请重试。");
    } catch (error) {
      storyState.actionMessage = error.message || String(error);
    } finally {
      storyState.action = "";
      renderStoryDetail();
    }
  }

  async function saveStoryScriptDraft() {
    const projectId = storyState.selectedId;
    if (!projectId || storyState.action) return;
    const title = storyEl("storyScriptCreateTitle")?.value || "";
    const content = storyEl("storyScriptCreateContent")?.value || "";
    const targetEpisodeCount = Math.max(0, Math.min(1000, Math.round(Number(storyEl("storyScriptCreateTargetEpisodes")?.value || 0) || 0)));
    const durationMinutes = storyEl("storyScriptCreateDuration")?.value || "";
    const estimatedDurationSeconds = Math.max(0, Math.min(86400, Math.round((Number(durationMinutes || 0) || 0) * 60)));
    if (!content.trim()) {
      const message = storyEl("storyScriptCreateMessage");
      if (message) message.textContent = "请输入剧本或小说正文。";
      return;
    }
    storyState.action = "save";
    storyState.actionMessage = "正在保存剧本版本…";
    const submitButton = document.querySelector('#storyScriptCreateForm button[type="submit"]');
    if (submitButton) submitButton.disabled = true;
    try {
      const payload = await requestJson(`/api/story/projects/${encodeURIComponent(projectId)}/scripts`, {
        method: "POST",
        body: {
          mode: storyState.scriptCreateMode,
          sourceScriptId: storyState.scriptCreateSourceId,
          title,
          content,
          targetEpisodeCount,
          estimatedDurationSeconds,
        },
      });
      storyState.action = "";
      storyState.scriptCreateOpen = false;
      storyState.scriptCreateSourceId = "";
      storyState.selectedScriptId = payload.script?.id || storyState.selectedScriptId;
      storyState.selectedManuscriptId = storyScriptManuscriptId(payload.script || {}) || storyState.selectedManuscriptId;
      storyState.analysisDurationMinutes = "";
      storyState.analysisDurationDirty = false;
      storyState.analysis = null;
      storyState.analysisScriptId = "";
      await loadStoryDetail(projectId);
      storyState.actionMessage = `已保存 ${payload.script?.title || "文稿"} · V${String(payload.script?.versionNo || 1).padStart(2, "0")}。`;
      renderStoryDetail();
    } catch (error) {
      storyState.action = "";
      if (submitButton) submitButton.disabled = false;
      const message = storyEl("storyScriptCreateMessage");
      if (message) message.textContent = error.message || String(error);
    }
  }

  async function analyzeStoryDraft() {
    const projectId = storyState.selectedId;
    const script = selectedStoryScript();
    if (!projectId || !script || storyState.action) return;
    const targetEpisodes = Math.max(0, Math.min(30, Math.round(Number(document.querySelector("[data-story-analysis-target-episodes]")?.value || 0) || 0)));
    const durationMinutes = document.querySelector("[data-story-analysis-duration]")?.value || "";
    const targetDurationSeconds = Math.max(0, Math.min(86400, Math.round((Number(durationMinutes || 0) || 0) * 60)));
    storyState.analysisTargetEpisodes = targetEpisodes ? String(targetEpisodes) : "";
    storyState.analysisTargetEpisodesDirty = true;
    storyState.analysisDurationMinutes = durationMinutes;
    storyState.analysisDurationDirty = true;
    storyState.action = "analyze";
    storyState.actionMessage = "AI 正在拆解剧本，通常需要几十秒…";
    renderStoryDetail();
    try {
      const payload = await requestJson(`/api/story/projects/${encodeURIComponent(projectId)}/analyze`, {
        method: "POST",
        body: { scriptVersionId: script.id, targetEpisodes, targetDurationSeconds },
      });
      storyState.analysis = payload.analysis || null;
      storyState.analysisScriptId = payload.scriptVersionId || script.id;
      storyState.action = "";
      storyState.actionMessage = `拆解完成 · ${payload.model || "分析模型"} · ${payload.attempts || 1} 次尝试`;
      renderStoryDetail();
    } catch (error) {
      storyState.action = "";
      storyState.actionMessage = error.message || String(error);
      renderStoryDetail();
    }
  }

  async function importStoryAnalysis() {
    const projectId = storyState.selectedId;
    const analysis = storyState.analysis;
    if (!projectId || !analysis || storyState.action) return;
    const scriptVersionId = storyState.analysisScriptId || selectedStoryScript()?.id || "";
    if (!scriptVersionId) {
      storyState.actionMessage = "拆解结果缺少来源文稿，请重新拆解。";
      renderStoryDetail();
      return;
    }
    storyState.action = "import";
    storyState.actionMessage = "正在写入剧集与资产…";
    renderStoryDetail();
    try {
      await requestJson(`/api/story/projects/${encodeURIComponent(projectId)}/import`, {
        method: "POST",
        body: { analysis, scriptVersionId },
      });
      storyState.analysis = null;
      storyState.analysisScriptId = "";
      await loadStoryDetail(projectId);
      storyState.detailTab = "episodes";
      storyState.actionMessage = `已写入 ${analysis.episodes?.length || 0} 集。`;
      renderStoryDetail();
    } catch (error) {
      storyState.action = "";
      storyState.actionMessage = error.message || String(error);
      renderStoryDetail();
    }
  }

  async function deleteStoryEpisode(episodeId = "") {
    const projectId = storyState.selectedId;
    const id = String(episodeId || "").trim();
    if (!projectId || !id || storyState.action) return;
    if (!window.confirm("删除这一集？已关联的单集画布引用也会移除。")) return;
    storyState.action = "delete";
    storyState.actionMessage = "正在删除剧集…";
    renderStoryDetail();
    try {
      await requestJson(`/api/story/projects/${encodeURIComponent(projectId)}/episodes/${encodeURIComponent(id)}`, { method: "DELETE" });
      await loadStoryDetail(projectId);
      storyState.actionMessage = "剧集已删除。";
      renderStoryDetail();
    } catch (error) {
      storyState.action = "";
      storyState.actionMessage = error.message || String(error);
      renderStoryDetail();
    }
  }

  function initStoryPanel() {
    if (storyState.initialized) return;
    storyState.initialized = true;
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) {
        clearTimeout(storyState.videoSyncTimer);
        storyState.videoSyncTimer = null;
        return;
      }
      if (storyState.selectedId && storyState.detail) {
        void syncStoryVideoGenerationRefs(storyState.selectedId).finally(() => scheduleStoryVideoGenerationSync(15000));
      }
    });
    storyEl("storyProjectForm")?.addEventListener("submit", createStoryProject);
    storyEl("storyCreateProjectClose")?.addEventListener("click", () => setStoryCreateOpen(false));
    document.querySelector(".story-library-head")?.addEventListener("click", (event) => {
      if (event.target.closest("[data-story-add-episode]")) {
        openStoryEpisodeCreate();
        return;
      }
      if (event.target.closest("#storyCreateProjectToggle") || event.target.closest("[data-story-create-open]")) {
        if (storyState.view !== "library") openStoryLibrary();
        setStoryCreateOpen(true);
        return;
      }
      if (event.target.closest("#storyRefreshProjects")) loadStoryProjects(storyState.view === "detail" ? storyState.selectedId : "");
      else if (event.target.closest("[data-story-refresh-detail]")) loadStoryProjects(storyState.selectedId);
      else if (event.target.closest("[data-story-open-asset-library]")) openStoryAssetLibrary();
      else if (event.target.closest("[data-story-back]")) openStoryLibrary();
    });
    storyEl("storyProjectList")?.addEventListener("click", (event) => {
      const create = event.target.closest("[data-story-create-open]");
      if (create) {
        setStoryCreateOpen(true);
        return;
      }
      const button = event.target.closest("[data-story-project-id]");
      if (button) loadStoryDetail(button.dataset.storyProjectId || "");
    });
    storyEl("storyProjectDetail")?.addEventListener("click", (event) => {
      if (event.target.classList?.contains("story-script-modal-backdrop") || event.target.closest("button[data-story-close-script-modal]")) closeStoryScriptCreate();
      else if (event.target.closest("[data-story-script-create]")) openStoryScriptCreate("new");
      else if (event.target.closest("[data-story-script-version-source]")) openStoryScriptCreate("version", event.target.closest("[data-story-script-version-source]")?.dataset.storyScriptVersionSource || "");
      else if (event.target.closest("[data-story-script-id]")) {
        if (selectStoryScriptVersion(event.target.closest("[data-story-script-id]")?.dataset.storyScriptId || "")) renderStoryDetail();
      }
      else if (event.target.closest("[data-story-select-manuscript]")) {
        const manuscriptId = event.target.closest("[data-story-select-manuscript]")?.dataset.storySelectManuscript || "";
        const sameManuscript = storyState.selectedManuscriptId === manuscriptId;
        const manuscriptExpanded = storyState.expandedManuscriptIds.includes(manuscriptId) && !storyState.collapsedManuscriptIds.includes(manuscriptId);
        selectStoryManuscriptById(manuscriptId);
        if (sameManuscript && manuscriptExpanded) {
          storyState.expandedManuscriptIds = storyState.expandedManuscriptIds.filter((item) => item !== manuscriptId);
          if (!storyState.collapsedManuscriptIds.includes(manuscriptId)) storyState.collapsedManuscriptIds.push(manuscriptId);
        } else {
          storyState.collapsedManuscriptIds = storyState.collapsedManuscriptIds.filter((item) => item !== manuscriptId);
          if (!storyState.expandedManuscriptIds.includes(manuscriptId)) storyState.expandedManuscriptIds.push(manuscriptId);
        }
        renderStoryDetail();
      }
      else if (event.target.closest("[data-story-toggle-manuscript]")) toggleStoryManuscript(event.target.closest("[data-story-toggle-manuscript]")?.dataset.storyToggleManuscript || "");
      else if (event.target.closest("[data-story-toggle-episode]")) toggleStoryEpisode(event.target.closest("[data-story-toggle-episode]")?.dataset.storyToggleEpisode || "");
      else if (event.target.closest("[data-story-analyze-manuscript]")) {
        selectStoryManuscriptById(event.target.closest("[data-story-analyze-manuscript]")?.dataset.storyAnalyzeManuscript || "");
        analyzeStoryDraft();
      }
      else if (event.target.classList?.contains("story-revision-backdrop") || event.target.closest("button[data-story-close-revision]")) closeStoryRevisionRequest();
      else if (event.target.closest("[data-story-submit-revision]")) submitStoryRevisionRequest();
      else if (event.target.classList?.contains("story-asset-library-backdrop") || event.target.closest("button[data-story-close-asset-library]")) closeStoryAssetLibrary();
      else if (event.target.closest("[data-story-open-asset-library]")) openStoryAssetLibrary();
      else if (event.target.closest("[data-story-library-preview-close]")) {
        storyState.assetLibraryPreviewAssetId = "";
        renderStoryDetail();
      }
      else if (event.target.closest("[data-story-library-preview-asset]")) {
        storyState.assetLibraryPreviewAssetId = event.target.closest("[data-story-library-preview-asset]")?.dataset.storyLibraryPreviewAsset || "";
        renderStoryDetail();
      }
      else if (event.target.closest("[data-story-refresh-detail]")) loadStoryProjects(storyState.selectedId);
      else if (event.target.closest("#storyRefreshProjects")) loadStoryProjects(storyState.view === "detail" ? storyState.selectedId : "");
      else if (event.target.closest("#storyCreateProjectToggle")) setStoryCreateOpen(!storyState.createOpen);
      else if (event.target.closest("[data-story-back]")) openStoryLibrary();
      else if (event.target.closest("[data-story-tab]")) setStoryDetailTab(event.target.closest("[data-story-tab]")?.dataset.storyTab || "");
      else if (event.target.closest("[data-story-close-episode]")) closeStoryEpisode();
      else if (event.target.closest("[data-story-open-episode]")) {
        const button = event.target.closest("[data-story-open-episode]");
        openStoryEpisode(button.dataset.storyOpenEpisode || "", button.dataset.storyEpisodeView || "outline");
      }
      else if (event.target.closest("[data-story-open-shot]")) openStoryShot(event.target.closest("[data-story-open-shot]")?.dataset.storyOpenShot || "");
      else if (event.target.closest("[data-story-episode-view]")) setStoryEpisodeView(event.target.closest("[data-story-episode-view]")?.dataset.storyEpisodeView || "outline");
      else if (event.target.closest("[data-story-save-episode]")) saveStoryEpisode();
      else if (event.target.closest("[data-story-lock-episode]")) saveStoryEpisode({ status: event.target.closest("[data-story-lock-episode]")?.dataset.storyLockEpisode || "outline_locked" });
      else if (event.target.closest("[data-story-plan-shots]")) generateStoryEpisodeShots();
      else if (event.target.closest("[data-story-plan-assets]")) planStoryEpisodeAssets();
      else if (event.target.closest("[data-story-confirm-shot-assets]")) confirmStoryShotAssets(event.target.closest("[data-story-confirm-shot-assets]")?.dataset.storyConfirmShotAssets || "");
      else if (event.target.closest("[data-story-generate-shot-assets]")) generateStoryShotAssets(event.target.closest("[data-story-generate-shot-assets]")?.dataset.storyGenerateShotAssets || "");
      else if (event.target.closest("[data-story-generate-assets]")) generateMissingStoryAssets();
      else if (event.target.closest("[data-story-generate-asset]")) {
        const button = event.target.closest("[data-story-generate-asset]");
        generateStoryAssetImage(button?.dataset.storyGenerateAsset || "", button?.dataset.storyGenerateAssetShot || "");
      }
      else if (event.target.closest("[data-story-approve-variant]")) {
        const button = event.target.closest("[data-story-approve-variant]");
        approveStoryAssetImage(button.dataset.storyAssetId || "", button.dataset.storyApproveVariant || "");
      }
      else if (event.target.closest("[data-story-use-variant]")) useStoryAssetVariant(event.target.closest("[data-story-use-variant]")?.dataset.storyUseVariant || "");
      else if (event.target.closest("[data-story-plan-shot-prompt]")) planStoryEpisodePrompts(event.target.closest("[data-story-plan-shot-prompt]")?.dataset.storyPlanShotPrompt || "");
      else if (event.target.closest("[data-story-plan-prompts]")) planStoryEpisodePrompts();
      else if (event.target.closest("[data-story-generate-shot-video]")) generateStoryShotVideo(event.target.closest("[data-story-generate-shot-video]")?.dataset.storyGenerateShotVideo || "");
      else if (event.target.closest("[data-story-save-script]")) saveStoryScriptDraft();
      else if (event.target.closest("[data-story-analyze]")) analyzeStoryDraft();
      else if (event.target.closest("[data-story-import-analysis]")) importStoryAnalysis();
      else {
        const deleteButton = event.target.closest("[data-story-delete-episode]");
        if (deleteButton) {
          deleteStoryEpisode(deleteButton.dataset.storyDeleteEpisode || "");
          return;
        }
        const deleteShotButton = event.target.closest("[data-story-delete-shot]");
        if (deleteShotButton) {
          deleteStoryShot(deleteShotButton.dataset.storyDeleteShot || "");
          return;
        }
        const scriptButton = event.target.closest("[data-story-script-id]");
        if (scriptButton) {
          storyState.selectedScriptId = scriptButton.dataset.storyScriptId || "";
          storyState.analysisDurationMinutes = "";
          storyState.analysisDurationDirty = false;
          storyState.action = "";
          storyState.actionMessage = "";
          if (storyState.analysisScriptId !== storyState.selectedScriptId) storyState.analysis = null;
          syncStoryScriptTargetFromSelection();
          renderStoryDetail();
        }
      }
    });
    storyEl("storyProjectDetail")?.addEventListener("error", (event) => {
      const image = event.target;
      if (image?.matches?.("video[data-story-generation-video]")) {
        void refreshStoryGenerationVideoSource(image);
        return;
      }
      if (!image?.matches?.("img[data-story-media-image]")) return;
      image.hidden = true;
      const fallback = image.parentElement?.querySelector("[data-story-media-fallback]");
      if (fallback) fallback.hidden = false;
    }, true);
    storyEl("storyProjectDetail")?.addEventListener("submit", (event) => {
      if (event.target?.id === "storyScriptCreateForm") {
        event.preventDefault();
        saveStoryScriptDraft();
      }
      else if (event.target?.id === "storyEpisodeForm") createStoryEpisode(event);
      else if (event.target?.id === "storyEpisodeEditForm") event.preventDefault();
    });
    storyEl("storyProjectDetail")?.addEventListener("change", (event) => {
      if (event.target?.matches("[data-story-library-episode]")) {
        loadStoryAssetLibraryEpisode(event.target.value || "");
        return;
      }
      else if (event.target?.matches("[data-story-library-shot]")) storyState.assetLibraryShotKey = event.target.value || "";
      else if (event.target?.matches("[data-story-script-target-episode]")) {
        storyState.scriptTargetDirty = true;
        storyState.scriptTargetEpisodeId = event.target.value || "";
        renderStoryDetail();
        return;
      }
      else if (event.target?.matches("[data-story-image-model]")) storyState.imageModel = event.target.value || storyState.imageModel;
      else if (event.target?.matches("[data-story-video-model]")) storyState.videoModel = event.target.value || storyState.videoModel;
      else if (event.target?.matches("[data-story-optimizer-model]")) storyState.optimizerModel = event.target.value || storyState.optimizerModel;
      else if (event.target?.matches("[data-story-prompt-resolution]")) storyState.promptResolution = event.target.value || storyState.promptResolution;
      else if (event.target?.matches("[data-story-video-duration]")) {
        storyState.videoDuration = Math.max(1, Number(event.target.value || 5) || 5);
        return;
      }
      else return;
      renderStoryDetail();
    });
    storyEl("storyProjectDetail")?.addEventListener("input", (event) => {
      if (event.target?.matches("[data-story-analysis-target-episodes]")) {
        storyState.analysisTargetEpisodes = event.target.value || "";
        storyState.analysisTargetEpisodesDirty = true;
        return;
      }
      if (event.target?.matches("[data-story-analysis-duration]")) {
        storyState.analysisDurationMinutes = event.target.value || "";
        storyState.analysisDurationDirty = true;
        return;
      }
      if (!event.target?.matches("[data-story-library-query]")) return;
      storyState.assetLibraryQuery = event.target.value || "";
      clearTimeout(storyLibrarySearchTimer);
      storyLibrarySearchTimer = setTimeout(() => {
        renderStoryDetail();
        const input = document.querySelector("[data-story-library-query]");
        if (input) {
          input.focus();
          input.setSelectionRange(input.value.length, input.value.length);
        }
      }, 180);
    });
  }

  window.PlatformStory = {
    open() {
      initStoryPanel();
      if (!storyState.loaded || !storyState.projects.length) loadStoryProjects(storyState.view === "detail" ? storyState.selectedId : "");
      else {
        renderStoryProjectList();
        renderStoryDetail();
      }
    },
    refresh() {
      initStoryPanel();
      return loadStoryProjects(storyState.view === "detail" ? storyState.selectedId : "");
    },
  };

  initStoryPanel();
})();
