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
    selectedScriptId: "",
    selectedEpisodeId: "",
    episodeTab: "outline",
    shots: [],
    analysis: null,
    analysisScriptId: "",
    action: "",
    actionMessage: "",
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

  function storyEpisodeStatusLabel(value = "") {
    return ({
      draft: "草稿",
      outline_locked: "大纲定稿",
      shots_planned: "分镜规划",
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

  const STORY_DETAIL_TABS = [
    { id: "script", label: "剧本与拆解", icon: "file-text" },
    { id: "episodes", label: "分集", icon: "list-video" },
    { id: "assets", label: "资产库", icon: "library" },
    { id: "production", label: "制作路径", icon: "route" },
  ];

  function storyDetailTabId(value = "") {
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

  function renderStoryScriptSection() {
    const script = selectedStoryScript();
    const versions = storyState.scripts.map((item) => `
      <button class="story-script-version${item.id === script?.id ? " is-active" : ""}" data-story-script-id="${storyEscape(item.id)}" type="button">
        <span>V${storyEscape(item.versionNo)}</span>
        <strong>${storyEscape(item.title || "未命名文稿")}</strong>
        <small>${storyEscape(storyDate(item.createdAt))}</small>
      </button>`).join("");
    return `
      <section class="story-section story-script-section">
        <div class="story-section-head">
          <div><p class="eyebrow">SCRIPT WORKSPACE</p><h3>剧本与版本</h3></div>
          <span>${storyState.scripts.length} 个版本</span>
        </div>
        <div class="story-script-layout">
          <aside class="story-script-versions" aria-label="剧本版本">
            <div class="story-script-versions-head"><strong>版本记录</strong><small>每次保存都会新增版本</small></div>
            ${versions || `<div class="story-script-empty">尚未保存剧本</div>`}
          </aside>
          <div class="story-script-editor">
            <div class="story-script-editor-grid">
              <label>文稿标题<input id="storyScriptTitle" maxlength="160" value="${storyEscape(script?.title || `第 ${storyState.scripts.length + 1} 版文稿`)}" placeholder="例如：夜班便利店 第一季" /></label>
              <label>目标集数<input id="storyAnalysisTarget" type="number" min="1" max="50" value="${Number(storyState.detail?.project?.episodeTarget || 1)}" /></label>
            </div>
            <label class="story-script-content">正文<textarea id="storyScriptContent" rows="16" maxlength="1500000" placeholder="粘贴完整小说、故事大纲或分集草案。建议先保存版本，再让 AI 拆解。">${storyEscape(script?.content || "")}</textarea></label>
            <div class="story-script-actions">
              <p class="story-message" id="storyScriptMessage">${storyEscape(storyState.actionMessage)}</p>
              <div>
                <button class="story-secondary-button" data-story-save-script type="button" ${storyState.action ? "disabled" : ""}><i data-lucide="save"></i><span>保存为新版本</span></button>
                <button class="story-create-button" data-story-analyze type="button" ${storyState.action || !script ? "disabled" : ""}><i data-lucide="sparkles"></i><span>AI 拆解</span></button>
              </div>
            </div>
          </div>
        </div>
      </section>`;
  }

  function renderStoryAnalysisSection() {
    const analysis = storyState.analysis;
    if (!analysis) {
      return `
        <section class="story-section story-analysis-section">
          <div class="story-section-head"><div><p class="eyebrow">AI BREAKDOWN</p><h3>拆解预览</h3></div><span>只预览，不写库</span></div>
          <div class="story-analysis-empty"><i data-lucide="wand-sparkles"></i><div><strong>先保存剧本，再执行 AI 拆解</strong><span>模型会给出分集梗概、角色与场景建议；确认后才写入 PostgreSQL。</span></div></div>
        </section>`;
    }
    const episodes = (analysis.episodes || []).map((episode) => {
      const hook = String(episode.metadata?.hook || episode.hook || "").trim();
      const characters = Array.isArray(episode.metadata?.characters) ? episode.metadata.characters : [];
      const scenes = Array.isArray(episode.metadata?.scenes) ? episode.metadata.scenes : [];
      return `
        <article class="story-analysis-episode">
          <b>E${String(episode.episodeNo).padStart(2, "0")}</b>
          <div>
            <strong>${storyEscape(episode.title || `第 ${episode.episodeNo} 集`)}</strong>
            <p>${storyEscape(episode.synopsis || episode.summary || "暂无梗概")}</p>
            ${hook ? `<p class="story-analysis-hook"><b>结尾钩子</b>${storyEscape(hook)}</p>` : ""}
            <small>${Number(episode.durationSeconds || 0)} 秒${characters.length ? ` · 角色：${storyEscape(characters.join("、"))}` : ""}${scenes.length ? ` · 场景：${storyEscape(scenes.join("、"))}` : ""}</small>
          </div>
        </article>`;
    }).join("");
    const characters = (analysis.characters || []).map((item) => `<span>${storyEscape(item.name)}</span>`).join("");
    const scenes = (analysis.scenes || []).map((item) => `<span>${storyEscape(item.name)}</span>`).join("");
    return `
      <section class="story-section story-analysis-section">
        <div class="story-section-head">
          <div><p class="eyebrow">AI BREAKDOWN</p><h3>拆解预览</h3></div>
          <span>${analysis.episodes?.length || 0} 集 · 建议 ${Number(analysis.totalEpisodeSuggestion || 0) || "待定"} 集</span>
        </div>
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
          <span class="story-status-pill">${storyEscape(storyEpisodeStatusLabel(episode.status))}</span>
          <div class="story-episode-actions">
            <button type="button" data-story-open-episode="${storyEscape(episode.id)}"><i data-lucide="pen-line"></i><span>编辑大纲</span></button>
            <button type="button" data-story-open-episode="${storyEscape(episode.id)}" data-story-episode-view="shots"><i data-lucide="clapperboard"></i><span>分镜清单</span></button>
            <button class="story-episode-delete" data-story-delete-episode="${storyEscape(episode.id)}" type="button" title="删除剧集" aria-label="删除第 ${Number(episode.episodeNo)} 集"><i data-lucide="trash-2"></i></button>
          </div>
        </article>`;
    }).join("") : `<div class="story-list-state">尚未拆集。创建第一集后，单集画布入口会固定为 <code>story-episode-&lt;id&gt;</code>。</div>`;
    const selectedEpisode = episodes.find((episode) => episode.id === storyState.selectedEpisodeId);
    const episodeWorkspace = selectedEpisode ? (() => {
      const metadata = selectedEpisode.metadata && typeof selectedEpisode.metadata === "object" ? selectedEpisode.metadata : {};
      const characters = Array.isArray(metadata.characters) ? metadata.characters.join("、") : "";
      const scenes = Array.isArray(metadata.scenes) ? metadata.scenes.join("、") : "";
      const isLocked = selectedEpisode.status === "outline_locked";
      const shotRows = storyState.shots.length ? storyState.shots.map((shot) => `
        <article class="story-shot-row">
          <b>S${String(shot.shotNo).padStart(2, "0")}</b>
          <div><strong>${storyEscape(shot.title || `镜头 ${shot.shotNo}`)}</strong><p>${storyEscape(shot.description || "尚未填写镜头描述。")}</p><small>${Number(shot.durationSeconds || 5)} 秒 · ${storyEscape(shot.status || "draft")}</small></div>
          <button class="story-episode-delete" type="button" data-story-delete-shot="${storyEscape(shot.id)}" title="删除镜头" aria-label="删除镜头"><i data-lucide="trash-2"></i></button>
        </article>`).join("") : `<div class="story-list-state">还没有镜头。先保存大纲，再按镜头顺序添加。</div>`;
      return `
        <section class="story-section story-episode-workspace">
          <div class="story-workbench-head">
            <button class="story-back-button" data-story-close-episode type="button"><i data-lucide="arrow-left"></i><span>返回分集</span></button>
            <div><p class="eyebrow">EPISODE WORKBENCH</p><h3>E${String(selectedEpisode.episodeNo).padStart(2, "0")} · ${storyEscape(selectedEpisode.title || "未命名剧集")}</h3></div>
            <span class="story-status-pill">${storyEscape(storyEpisodeStatusLabel(selectedEpisode.status))}</span>
          </div>
          <nav class="story-episode-stages" aria-label="本集制作阶段">
            <button class="${storyState.episodeTab === "outline" ? "is-active" : ""}" data-story-episode-view="outline" type="button"><b>1</b>剧情大纲</button>
            <button class="${storyState.episodeTab === "shots" ? "is-active" : ""}" data-story-episode-view="shots" type="button"><b>2</b>分镜清单</button>
            <span><b>3</b>提示词冻结<small>下一步</small></span>
            <span><b>4</b>图片/视频<small>后续接入</small></span>
          </nav>
          ${storyState.episodeTab === "outline" ? `
            <form class="story-episode-edit-form" id="storyEpisodeEditForm">
              <label>集标题<input id="storyEpisodeEditTitle" maxlength="160" value="${storyEscape(selectedEpisode.title)}" /></label>
              <label>时长（秒）<input id="storyEpisodeEditDuration" type="number" min="0" max="86400" value="${Number(selectedEpisode.durationSeconds || 0)}" /></label>
              <label class="story-field-wide">单集大纲<textarea id="storyEpisodeEditSynopsis" rows="9" maxlength="8000">${storyEscape(selectedEpisode.synopsis)}</textarea></label>
              <label class="story-field-wide">结尾钩子<textarea id="storyEpisodeEditHook" rows="3" maxlength="2000">${storyEscape(metadata.hook || "")}</textarea></label>
              <label>出场角色<input id="storyEpisodeEditCharacters" value="${storyEscape(characters)}" placeholder="用顿号或逗号分隔" /></label>
              <label>场景<input id="storyEpisodeEditScenes" value="${storyEscape(scenes)}" placeholder="用顿号或逗号分隔" /></label>
              <div class="story-episode-edit-actions story-field-wide">
                <p>先修正事实和人物动机，再锁定大纲。锁定后仍可调整，但会显示定稿状态。</p>
                <button class="story-secondary-button" type="button" data-story-save-episode>保存修改</button>
                <button class="story-create-button" type="button" data-story-lock-episode="${isLocked ? "draft" : "outline_locked"}">${isLocked ? "恢复草稿" : "锁定大纲，进入分镜"}</button>
              </div>
            </form>` : `
            <div class="story-shot-actions"><p>这里按顺序记录镜头。后续提示词、图片和视频会绑定到同一镜号。</p><strong>${storyState.shots.length} 个镜头</strong></div>
            <div class="story-shot-list">${shotRows}</div>
            <form class="story-shot-form" id="storyShotForm">
              <label>镜头标题<input id="storyShotTitle" maxlength="160" placeholder="例如：白洁走进校长办公室" /></label>
              <label>时长（秒）<input id="storyShotDuration" type="number" min="1" max="300" value="5" /></label>
              <label class="story-field-wide">镜头描述<textarea id="storyShotDescription" rows="3" placeholder="景别、人物动作、对白、环境与连续性"></textarea></label>
              <button class="story-create-button" type="submit"><i data-lucide="plus"></i><span>新增镜头</span></button>
            </form>`}
          <p class="story-message" id="storyEpisodeMessage">${storyEscape(storyState.actionMessage || "")}</p>
        </section>`;
    })() : "";
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
        ${renderStoryDetailTabs()}
        <div class="story-tab-panel" data-story-tab-panel="script" ${storyState.detailTab === "script" ? "" : "hidden"}>
          ${renderStoryScriptSection()}
          ${renderStoryAnalysisSection()}
        </div>
        <div class="story-tab-panel" data-story-tab-panel="episodes" ${storyState.detailTab === "episodes" ? "" : "hidden"}>
          ${episodeWorkspace || `
          <section class="story-section">
            <div class="story-section-head"><div><p class="eyebrow">EPISODES</p><h3>分集剧本</h3></div><span>${episodes.length} / ${project.episodeTarget}</span></div>
            <p class="story-tab-lead">这里存放 AI 拆解后确认写入的每一集。每集应保留可制作的长大纲、出场角色、场景和结尾钩子。</p>
            <div class="story-episode-list">${episodeRows}</div>
            <form class="story-episode-form" id="storyEpisodeForm">
              <label>集标题<input id="storyEpisodeTitle" maxlength="160" placeholder="可选" /></label>
              <label>单集大纲<textarea id="storyEpisodeSynopsis" maxlength="8000" rows="3" placeholder="本集开场、发展、转折、结尾钩子与关键场景"></textarea></label>
              <button class="story-create-button" type="submit"><i data-lucide="plus"></i><span>新增剧集</span></button>
            </form>
            <p class="story-message" id="storyEpisodeMessage"></p>
          </section>`}
        </div>
        <div class="story-tab-panel" data-story-tab-panel="assets" ${storyState.detailTab === "assets" ? "" : "hidden"}>
          ${renderStoryAssetsSection()}
        </div>
        <div class="story-tab-panel" data-story-tab-panel="production" ${storyState.detailTab === "production" ? "" : "hidden"}>
          <section class="story-section">
            <div class="story-section-head"><div><p class="eyebrow">PIPELINE</p><h3>剧集生产流程</h3></div><span>契约冻结</span></div>
            <div class="story-flow">${flow.map((item, index) => `<span><b>${index + 1}</b>${storyEscape(item)}</span>`).join("")}</div>
          </section>
          <section class="story-section">
            <div class="story-section-head"><div><p class="eyebrow">CANVAS SCOPE</p><h3>三级画布结构</h3></div><code>${storyEscape(projectCanvas?.canvasId || `story-project-${project.id}`)}</code></div>
            <div class="story-scope-grid">${scopeCards}</div>
          </section>
          <section class="story-section story-p0-note">
            <div class="story-section-head"><div><p class="eyebrow">CURRENT BOUNDARY</p><h3>当前制作边界</h3></div><span>${storyEscape(contracts.version || "story-p0-v1")}</span></div>
            <p>剧本版本、AI 拆解结果、剧集与角色场景资产全部写入 PostgreSQL。画布仍只保存布局与引用；角色形象生成、分镜和镜头视频生成在后续阶段接入。</p>
          </section>
        </div>
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
    if (storyState.selectedId !== id) storyState.detailTab = "script";
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
      const episodes = Array.isArray(payload.episodes) ? payload.episodes : [];
      if (storyState.selectedEpisodeId && !episodes.some((episode) => episode.id === storyState.selectedEpisodeId)) {
        storyState.selectedEpisodeId = "";
        storyState.shots = [];
      }
      const selectedScript = storyState.scripts.find((script) => script.id === storyState.selectedScriptId);
      storyState.selectedScriptId = selectedScript?.id || storyState.scripts[0]?.id || "";
      if (storyState.analysisScriptId && storyState.analysisScriptId !== storyState.selectedScriptId) {
        storyState.analysis = null;
        storyState.analysisScriptId = "";
      }
      storyState.action = "";
      storyState.actionMessage = "";
      storyState.loading = false;
      renderStoryDetail();
    } catch (error) {
      storyState.loading = false;
      storyState.detail = null;
      storyState.scripts = [];
      storyState.assets = [];
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

  function selectedStoryEpisode() {
    return (storyState.detail?.episodes || []).find((episode) => episode.id === storyState.selectedEpisodeId) || null;
  }

  function parseStoryNames(value = "") {
    return String(value || "").split(/[、,，\n]+/).map((item) => item.trim()).filter(Boolean);
  }

  async function loadStoryEpisodeShots() {
    const projectId = storyState.selectedId;
    const episodeId = storyState.selectedEpisodeId;
    if (!projectId || !episodeId) return;
    const payload = await requestJson(`/api/story/projects/${encodeURIComponent(projectId)}/episodes/${encodeURIComponent(episodeId)}/shots`);
    storyState.shots = Array.isArray(payload.shots) ? payload.shots : [];
  }

  async function openStoryEpisode(episodeId = "", view = "outline") {
    storyState.selectedEpisodeId = episodeId;
    storyState.episodeTab = view === "shots" ? "shots" : "outline";
    storyState.shots = [];
    storyState.action = "";
    storyState.actionMessage = "";
    renderStoryDetail();
    try {
      await loadStoryEpisodeShots();
    } catch (error) {
      storyState.actionMessage = error.message || String(error);
    }
    renderStoryDetail();
  }

  function closeStoryEpisode() {
    storyState.selectedEpisodeId = "";
    storyState.shots = [];
    storyState.actionMessage = "";
    renderStoryDetail();
  }

  async function setStoryEpisodeView(view = "outline") {
    if (!storyState.selectedEpisodeId || storyState.action) return;
    storyState.episodeTab = view === "shots" ? "shots" : "outline";
    storyState.actionMessage = "";
    renderStoryDetail();
    if (storyState.episodeTab !== "shots") return;
    try {
      await loadStoryEpisodeShots();
    } catch (error) {
      storyState.actionMessage = error.message || String(error);
    }
    renderStoryDetail();
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
    storyState.actionMessage = status === "outline_locked" ? "正在锁定大纲…" : "正在保存本集…";
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
      storyState.actionMessage = status === "outline_locked" ? "大纲已定稿，可以继续拆分镜。" : "本集修改已保存。";
      if (status === "outline_locked") storyState.episodeTab = "shots";
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

  async function saveStoryScriptDraft() {
    const projectId = storyState.selectedId;
    if (!projectId || storyState.action) return;
    const title = storyEl("storyScriptTitle")?.value || "";
    const content = storyEl("storyScriptContent")?.value || "";
    if (!content.trim()) {
      storyState.actionMessage = "请输入剧本或小说正文。";
      renderStoryDetail();
      return;
    }
    storyState.action = "save";
    storyState.actionMessage = "正在保存剧本版本…";
    renderStoryDetail();
    try {
      const payload = await requestJson(`/api/story/projects/${encodeURIComponent(projectId)}/scripts`, {
        method: "POST",
        body: { title, content },
      });
      storyState.selectedScriptId = payload.script?.id || storyState.selectedScriptId;
      storyState.analysis = null;
      storyState.analysisScriptId = "";
      await loadStoryDetail(projectId);
      storyState.actionMessage = `已保存 V${payload.script?.versionNo || ""} 剧本版本。`;
      renderStoryDetail();
    } catch (error) {
      storyState.action = "";
      storyState.actionMessage = error.message || String(error);
      renderStoryDetail();
    }
  }

  async function analyzeStoryDraft() {
    const projectId = storyState.selectedId;
    const script = selectedStoryScript();
    if (!projectId || !script || storyState.action) return;
    const targetEpisodes = Math.max(0, Number(storyEl("storyAnalysisTarget")?.value || 0) || 0);
    storyState.action = "analyze";
    storyState.actionMessage = "AI 正在拆解剧本，通常需要几十秒…";
    renderStoryDetail();
    try {
      const payload = await requestJson(`/api/story/projects/${encodeURIComponent(projectId)}/analyze`, {
        method: "POST",
        body: { scriptVersionId: script.id, targetEpisodes },
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
    storyState.action = "import";
    storyState.actionMessage = "正在写入剧集与资产…";
    renderStoryDetail();
    try {
      await requestJson(`/api/story/projects/${encodeURIComponent(projectId)}/import`, {
        method: "POST",
        body: { analysis },
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
      else if (event.target.closest("[data-story-tab]")) setStoryDetailTab(event.target.closest("[data-story-tab]")?.dataset.storyTab || "");
      else if (event.target.closest("[data-story-close-episode]")) closeStoryEpisode();
      else if (event.target.closest("[data-story-open-episode]")) {
        const button = event.target.closest("[data-story-open-episode]");
        openStoryEpisode(button.dataset.storyOpenEpisode || "", button.dataset.storyEpisodeView || "outline");
      }
      else if (event.target.closest("[data-story-episode-view]")) setStoryEpisodeView(event.target.closest("[data-story-episode-view]")?.dataset.storyEpisodeView || "outline");
      else if (event.target.closest("[data-story-save-episode]")) saveStoryEpisode();
      else if (event.target.closest("[data-story-lock-episode]")) saveStoryEpisode({ status: event.target.closest("[data-story-lock-episode]")?.dataset.storyLockEpisode || "outline_locked" });
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
          storyState.action = "";
          storyState.actionMessage = "";
          if (storyState.analysisScriptId !== storyState.selectedScriptId) storyState.analysis = null;
          renderStoryDetail();
        }
      }
    });
    storyEl("storyProjectDetail")?.addEventListener("submit", (event) => {
      if (event.target?.id === "storyEpisodeForm") createStoryEpisode(event);
      else if (event.target?.id === "storyShotForm") createStoryShot(event);
      else if (event.target?.id === "storyEpisodeEditForm") event.preventDefault();
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
