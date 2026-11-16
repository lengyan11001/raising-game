(() => {
  const storyState = {
    initialized: false,
    loaded: false,
    loading: false,
    view: "library",
    createOpen: false,
    projects: [],
    selectedId: "",
    detail: null,
    contract: null,
    message: "",
  };

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
    if (badge) badge.textContent = contract?.version ? `P0 · ${contract.version}` : "P0 · 契约未加载";
  }

  function renderStoryDetail() {
    const host = storyEl("storyProjectDetail");
    if (!host) return;
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
    const { project, episodes = [], canvasLinks = [], contracts = {} } = storyState.detail;
    const projectCanvas = canvasLinks.find((link) => link.scopeType === "project");
    const episodeCanvasMap = new Map(canvasLinks.filter((link) => link.scopeType === "episode").map((link) => [link.scopeId, link]));
    const episodeRows = episodes.length ? episodes.map((episode) => {
      const link = episodeCanvasMap.get(episode.id);
      return `
        <article class="story-episode-row">
          <div class="story-episode-index">E${String(episode.episodeNo).padStart(2, "0")}</div>
          <div class="story-episode-copy">
            <strong>${storyEscape(episode.title || `第 ${episode.episodeNo} 集`)}</strong>
            <p>${storyEscape(episode.synopsis || "尚未填写单集梗概。")}</p>
            <small>${episode.shotCount} 个镜头 · ${storyEscape(link?.canvasId || `story-episode-${episode.id}`)}</small>
          </div>
          <span class="story-status-pill">${storyEscape(episode.status)}</span>
        </article>`;
    }).join("") : `<div class="story-list-state">尚未拆集。创建第一集后，单集画布入口会固定为 <code>story-episode-&lt;id&gt;</code>。</div>`;
    const scopeCards = (contracts.scopes || []).map((scope) => `
      <div class="story-scope-card">
        <span>${storyEscape(scope.scope)} canvas</span>
        <strong>${storyEscape(scope.purpose)}</strong>
        <small>${storyEscape(scope.maxNodes)} nodes · ${storyEscape(scope.maxEdges)} edges</small>
      </div>
    `).join("");
    const flow = ["原始文稿", "定稿", "拆集/拆场", "角色/场景/道具", "分镜", "最终提示词", "图片", "视频", "审核"];
    host.innerHTML = `
      <div class="story-detail-panel">
        <div class="story-detail-topbar">
          <button class="story-back-button" data-story-back type="button"><i data-lucide="arrow-left"></i><span>全部项目</span></button>
          <span>STORY PROJECT · ${storyEscape(project.status)}</span>
        </div>
        <div class="story-detail-head">
          <div>
            <p class="eyebrow">PROJECT</p>
            <h2>${storyEscape(project.name)}</h2>
            <p>${storyEscape(project.description || "尚未填写项目说明。")}</p>
          </div>
          <div class="story-detail-badges"><span>${storyEscape(project.aspectRatio)}</span><span>目标 ${project.episodeTarget} 集</span></div>
        </div>
        <div class="story-metrics">
          ${storyMetric("剧本版本", project.scriptVersionCount)}
          ${storyMetric("剧集", project.episodeCount)}
          ${storyMetric("资产", project.assetCount)}
          ${storyMetric("镜头", project.shotCount)}
        </div>
        <section class="story-section">
          <div class="story-section-head"><div><p class="eyebrow">PIPELINE</p><h3>剧集生产流程</h3></div><span>契约冻结</span></div>
          <div class="story-flow">${flow.map((item, index) => `<span><b>${index + 1}</b>${storyEscape(item)}</span>`).join("")}</div>
        </section>
        <section class="story-section">
          <div class="story-section-head"><div><p class="eyebrow">CANVAS SCOPE</p><h3>三级画布结构</h3></div><code>${storyEscape(projectCanvas?.canvasId || `story-project-${project.id}`)}</code></div>
          <div class="story-scope-grid">${scopeCards}</div>
        </section>
        <section class="story-section">
          <div class="story-section-head"><div><p class="eyebrow">EPISODES</p><h3>剧集</h3></div><span>${episodes.length} / ${project.episodeTarget}</span></div>
          <div class="story-episode-list">${episodeRows}</div>
          <form class="story-episode-form" id="storyEpisodeForm">
            <label>集标题<input id="storyEpisodeTitle" maxlength="160" placeholder="可选" /></label>
            <label>单集梗概<textarea id="storyEpisodeSynopsis" maxlength="8000" rows="2" placeholder="本集冲突、场景与结尾钩子"></textarea></label>
            <button class="story-create-button" type="submit"><i data-lucide="plus"></i><span>新增剧集</span></button>
          </form>
          <p class="story-message" id="storyEpisodeMessage"></p>
        </section>
        <section class="story-section story-p0-note">
          <div class="story-section-head"><div><p class="eyebrow">P0 BOUNDARY</p><h3>当前只冻结结构</h3></div><span>${storyEscape(contracts.version || "story-p0-v1")}</span></div>
          <p>画布只保存布局与引用；剧本、资产、镜头、提示词版本、生成引用和归属记录全部写入 PostgreSQL。LLM 自动拆解、人物形象生成和镜头视频生成在后续阶段接入。</p>
        </section>
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
      storyState.loading = false;
      renderStoryDetail();
    } catch (error) {
      storyState.loading = false;
      storyState.detail = null;
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
          episodeTarget: Number(storyEl("storyProjectEpisodes")?.value || 1),
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

  function initStoryPanel() {
    if (storyState.initialized) return;
    storyState.initialized = true;
    storyEl("storyProjectForm")?.addEventListener("submit", createStoryProject);
    storyEl("storyRefreshProjects")?.addEventListener("click", () => loadStoryProjects(storyState.view === "detail" ? storyState.selectedId : ""));
    storyEl("storyCreateProjectToggle")?.addEventListener("click", () => setStoryCreateOpen(!storyState.createOpen));
    storyEl("storyCreateProjectClose")?.addEventListener("click", () => setStoryCreateOpen(false));
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
      if (event.target.closest("[data-story-back]")) openStoryLibrary();
    });
    storyEl("storyProjectDetail")?.addEventListener("submit", (event) => {
      if (event.target?.id === "storyEpisodeForm") createStoryEpisode(event);
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
