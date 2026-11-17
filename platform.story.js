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
    selectedEpisodeId: "",
    episodeTab: "outline",
    selectedShotId: "",
    shots: [],
    assetLibraryOpen: false,
    assetLibraryLoading: false,
    assetLibraryEpisodeId: "",
    assetLibraryShotKey: "",
    assetLibraryQuery: "",
    assetLibraryShots: [],
    imageModel: "qwen-image3",
    videoModel: "seedance-nsfw",
    optimizerModel: "",
    promptResolution: "720p",
    generatingAssetId: "",
    analysis: null,
    analysisScriptId: "",
    action: "",
    actionMessage: "",
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
    { id: "episodes", label: "剧本树", icon: "list-video" },
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

  function renderStoryStructureTree(episodes = [], selectedEpisode = null) {
    const script = selectedStoryScript();
    const nodes = episodes.map((episode) => {
      const selected = episode.id === selectedEpisode?.id;
      const shots = selected ? [...storyState.shots].sort((a, b) => a.shotNo - b.shotNo) : [];
      return `
        <div class="story-tree-node ${selected ? "is-selected" : ""}">
          <button class="story-tree-episode" type="button" data-story-open-episode="${storyEscape(episode.id)}" data-story-episode-view="outline">
            <span class="story-tree-node-mark">E${String(episode.episodeNo).padStart(2, "0")}</span>
            <span class="story-tree-node-copy"><strong>${storyEscape(episode.title || `第 ${episode.episodeNo} 集`)}</strong><small>${storyEscape(storyEpisodeStatusLabel(episode.status))} · ${Number(episode.shotCount || 0)} 镜</small></span>
            <i data-lucide="${selected ? "chevron-down" : "chevron-right"}"></i>
          </button>
          ${selected ? `<div class="story-tree-shots">
            ${shots.length ? shots.map((shot) => `
              <button class="story-tree-shot ${shot.id === storyState.selectedShotId ? "is-active" : ""}" type="button" data-story-open-shot="${storyEscape(shot.id)}">
                <b>S${String(shot.shotNo).padStart(2, "0")}</b><span>${storyEscape(shot.title || `镜头 ${shot.shotNo}`)}</span><em>${storyShotAssetsConfirmed(shot) ? "已确认" : "待确认"}</em>
              </button>`).join("") : `<div class="story-tree-loading">${selected ? "正在读取分镜…" : "展开分集后显示分镜"}</div>`}
          </div>` : ""}
        </div>`;
    }).join("");
    return `
      <section class="story-structure">
        <div class="story-structure-head"><div><p class="eyebrow">STORY TREE</p><h3>剧本结构</h3></div><button class="story-icon-button" type="button" title="刷新项目结构" data-story-refresh-detail><i data-lucide="refresh-cw"></i></button></div>
        <div class="story-tree-root">
          <button class="story-tree-script ${storyState.detailTab === "script" ? "is-active" : ""}" type="button" data-story-tab="script">
            <span class="story-tree-node-mark"><i data-lucide="file-text"></i></span>
            <span class="story-tree-node-copy"><strong>${storyEscape(script?.title || "原始剧本")}</strong><small>${storyState.scripts.length} 个版本 · AI 拆解为分集</small></span>
          </button>
          <div class="story-tree-branch">${nodes || `<div class="story-tree-loading">保存剧本并执行 AI 拆解后，这里会出现分集节点。</div>`}</div>
        </div>
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

  function storyApprovedAssetVariant(asset = {}) {
    const approvedId = String(asset.metadata?.approvedVariantId || "");
    const variants = storyAssetVariants(asset.id);
    return variants.find((variant) => variant.id === approvedId && variant.status === "approved")
      || variants.find((variant) => variant.status === "approved")
      || null;
  }

  function storyAssetVariantImageUrl(variant = {}) {
    return String(variant.mediaUrl || variant.metadata?.mediaUrl || variant.metadata?.imageUrl || "").trim();
  }

  function storyAssetHasGeneratedImage(asset = {}) {
    return storyAssetVariants(asset.id).some((variant) => variant.status !== "failed" && Boolean(storyAssetVariantImageUrl(variant)));
  }

  function storyAssetHasApprovedImage(asset = {}) {
    const approved = storyApprovedAssetVariant(asset);
    return Boolean(approved && approved.status === "approved" && storyAssetVariantImageUrl(approved));
  }

  function storyAssetsNeedingImage(assets = []) {
    return assets.filter((asset) => !storyAssetHasApprovedImage(asset) && !storyAssetHasGeneratedImage(asset));
  }

  function storyAssetKindLabel(kind = "") {
    return ({ character: "角色", scene: "场景", prop: "道具", style: "风格", audio: "声音" })[kind] || "资产";
  }

  function storyVariantStatusLabel(status = "") {
    return ({ approved: "已定稿", ready: "可审核", generating: "生成中", queued: "排队中", pending: "等待中", rejected: "未选", failed: "失败", draft: "草稿" })[status] || status || "待处理";
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
          ${approved && storyAssetVariantImageUrl(approved) ? `<img class="story-production-asset-image" src="${storyEscape(storyAssetVariantImageUrl(approved))}" alt="${storyEscape(asset.name)} 定稿设计图" loading="lazy" />` : ""}
          <div class="story-asset-variant-list">
            ${visibleVariants.length ? visibleVariants.map((variant) => `
              <div class="story-asset-variant ${variant.status === "approved" ? "is-approved" : ""}">
                ${storyAssetVariantImageUrl(variant) ? `<img src="${storyEscape(storyAssetVariantImageUrl(variant))}" alt="${storyEscape(asset.name)} 设计变体" loading="lazy" />` : `<span>${storyEscape(storyVariantStatusLabel(variant.status))}</span>`}
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
          <p>资产图只在“资产库”弹窗中审核，主工作区不再铺设大量图片。当前 ${approvedCount} / ${assets.length} 个本集资产已定稿。</p>
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
      const variants = storyAssetVariants(asset.id)
        .filter((variant) => variant.status !== "failed")
        .sort((a, b) => (b.status === "approved") - (a.status === "approved") || String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")));
      const failedCount = storyAssetVariants(asset.id).filter((variant) => variant.status === "failed").length;
      const approved = storyApprovedAssetVariant(asset);
      const shotLabels = storyAssetShotLabels(asset);
      return `<article class="story-library-asset-card ${approved ? "is-approved" : ""}">
        <div class="story-library-asset-head"><div><span>${storyEscape(storyAssetKindLabel(asset.kind))}</span><strong>${storyEscape(asset.name)}</strong></div><em>${approved ? "已定稿" : variants.length ? "待审核" : "未出图"}</em></div>
        <div class="story-library-asset-shots">${shotLabels.length ? shotLabels.map((label) => `<span>${storyEscape(label)}</span>`).join("") : "<span>未绑定分镜</span>"}</div>
        <details><summary>图片提示词</summary><p>${storyEscape(asset.metadata?.imagePrompt || asset.description || "暂无提示词")}</p></details>
        <div class="story-library-variant-grid">${variants.length ? variants.map((variant) => {
          const imageUrl = storyAssetVariantImageUrl(variant);
          const pending = ["generating", "queued", "pending"].includes(variant.status);
          return `<div class="story-library-variant ${variant.status === "approved" ? "is-approved" : ""}">
            ${imageUrl ? `<img src="${storyEscape(imageUrl)}" alt="${storyEscape(asset.name)} 设计图" loading="lazy" />` : `<span>${pending ? storyEscape(storyVariantStatusLabel(variant.status)) : "图片地址刷新中，稍后重开资产库"}</span>`}
            <small>${storyEscape(storyVariantStatusLabel(variant.status))}</small>
            ${imageUrl && variant.status !== "approved" ? `<button type="button" data-story-approve-variant="${storyEscape(variant.id)}" data-story-asset-id="${storyEscape(asset.id)}">设为定稿</button>` : ""}
          </div>`;
        }).join("") : `<div class="story-library-variant-empty"><i data-lucide="image-off"></i><span>尚未生成设计图</span></div>`}</div>
        ${failedCount ? `<small class="story-library-failed-count">已收起 ${failedCount} 个失败变体</small>` : ""}
      </article>`;
    }).join("");
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
        <div class="story-asset-library-grid">${cards || `<div class="story-library-state"><strong>当前筛选没有资产</strong><span>切换分集或分镜，或先让 AI 提取本集资产。</span></div>`}</div>
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
      const isLocked = ["outline_locked", "shots_planned", "assets_planned", "assets_ready", "prompts_planned", "ready", "complete"].includes(String(selectedEpisode.status || ""));
      const episodeAssets = storyEpisodeAssets(selectedEpisode);
      const nextStageButton = `<button class="story-create-button" type="button" data-story-episode-view="production"><i data-lucide="arrow-right"></i><span>${episodeAssets.length ? "下一步：逐镜确认资产与提示词" : "下一步：AI 提取本集资产"}</span></button>`;
      const shotRows = storyState.shots.length ? storyState.shots.map((shot) => `
        <article class="story-shot-row">
          <b>S${String(shot.shotNo).padStart(2, "0")}</b>
          <div>
            <strong>${storyEscape(shot.title || `镜头 ${shot.shotNo}`)}</strong>
            <p>${storyEscape(shot.description || "尚未填写镜头描述。")}</p>
            <small>${Number(shot.durationSeconds || 5)} 秒${shot.metadata?.shotSize ? ` · ${storyEscape(shot.metadata.shotSize)}` : ""}${shot.metadata?.camera ? ` · ${storyEscape(shot.metadata.camera)}` : ""}${shot.metadata?.location ? ` · ${storyEscape(shot.metadata.location)}` : ""}</small>
            ${shot.metadata?.dialogue ? `<p class="story-shot-dialogue"><b>对白</b>${storyEscape(shot.metadata.dialogue)}</p>` : ""}
          </div>
          <button class="story-episode-delete" type="button" data-story-delete-shot="${storyEscape(shot.id)}" title="删除镜头" aria-label="删除镜头"><i data-lucide="trash-2"></i></button>
        </article>`).join("") : `<div class="story-shot-ai-empty"><i data-lucide="sparkles"></i><div><strong>等待 AI 拆分镜</strong><p>锁定大纲后会自动生成镜头；如果中途失败，可以在这里重新执行。</p></div><button class="story-create-button" type="button" data-story-plan-shots ${isLocked ? "" : "disabled"}><span>AI 生成分镜</span></button></div>`;
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
            <button class="${storyState.episodeTab === "production" ? "is-active" : ""}" data-story-episode-view="production" type="button"><b>3</b>资产与提示词</button>
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
                <button class="story-create-button" type="button" data-story-lock-episode="${isLocked ? "draft" : "outline_locked"}">${isLocked ? "恢复草稿" : "锁定大纲，AI 拆分镜"}</button>
              </div>
            </form>` : storyState.episodeTab === "shots" ? `
            <div class="story-shot-actions">
              <div><p>AI 已按定稿大纲拆成可审核镜头。下一步由 AI 提取本集人物、场景和关键道具，再按所选出图模型生成设计图。</p><strong>${storyState.shots.length} 个镜头</strong></div>
              <div class="story-shot-action-buttons">
                <button class="story-secondary-button" type="button" data-story-plan-shots ${isLocked && !storyState.action ? "" : "disabled"}><i data-lucide="sparkles"></i><span>${storyState.shots.length ? "重新 AI 分镜" : "AI 生成分镜"}</span></button>
                ${storyState.shots.length ? nextStageButton : ""}
              </div>
            </div>
            <div class="story-shot-list">${shotRows}</div>
            ${storyState.action === "plan-shots" ? `<div class="story-list-state is-loading"><i data-lucide="loader-circle"></i>AI 正在拆分镜并写入 PostgreSQL…</div>` : ""}
          <p class="story-message" id="storyEpisodeMessage">${storyEscape(storyState.actionMessage || "")}</p>
          </section>` : renderStoryShotProduction(selectedEpisode)}
        `;
    })() : "";
    const scopeCards = (contracts.scopes || []).map((scope) => `
      <div class="story-scope-card">
        <span>${storyEscape(scope.scope)} canvas</span>
        <strong>${storyEscape(scope.purpose)}</strong>
        <small>${storyEscape(scope.maxNodes)} nodes · ${storyEscape(scope.maxEdges)} edges</small>
      </div>
    `).join("");
    const storyTree = renderStoryStructureTree(episodes, selectedEpisode);
    const emptyEpisodeWorkspace = `
      <section class="story-section story-tree-empty">
        <div class="story-shot-ai-empty"><i data-lucide="git-branch"></i><div><strong>${episodes.length ? "从左侧选择一集继续制作" : "等待 AI 拆解出分集节点"}</strong><p>${episodes.length ? "分集节点下会显示 S01、S02 等分镜；每镜独立管理资产清单、图片提示词和视频提示词。" : "先保存剧本并执行 AI 拆解，确认写入后这里会生成下级分集节点。"}</p></div><button class="story-create-button" type="button" data-story-tab="script"><i data-lucide="file-text"></i><span>回到剧本</span></button></div>
        <form class="story-episode-form" id="storyEpisodeForm">
          <label>集标题<input id="storyEpisodeTitle" maxlength="160" placeholder="可选" /></label>
          <label>单集大纲<textarea id="storyEpisodeSynopsis" maxlength="8000" rows="3" placeholder="本集开场、发展、转折、结尾钩子与关键场景"></textarea></label>
          <button class="story-create-button" type="submit"><i data-lucide="plus"></i><span>手动新增剧集</span></button>
        </form>
      </section>`;
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
          <div class="story-detail-head-actions">
            <div class="story-detail-badges"><span>${storyEscape(project.aspectRatio)}</span><span>目标 ${project.episodeTarget} 集</span></div>
            <button class="story-secondary-button" type="button" data-story-open-asset-library><i data-lucide="library"></i><span>资产库</span></button>
          </div>
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
          <section class="story-section">
            <div class="story-section-head"><div><p class="eyebrow">STORY TREE</p><h3>剧本 · 分集 · 分镜</h3></div><span>${episodes.length} / ${project.episodeTarget} 集</span></div>
            <p class="story-tab-lead">剧本是根节点；AI 拆解后生成分集节点，分集下再生成 S01、S02 分镜。每镜的资产和提示词在右侧独立完成。</p>
            <div class="story-tree-layout">${storyTree}<div class="story-tree-workspace">${episodeWorkspace || emptyEpisodeWorkspace}</div></div>
          </section>
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
      storyState.selectedEpisodeId = "";
      storyState.selectedShotId = "";
      storyState.assetLibraryEpisodeId = "";
      storyState.assetLibraryShotKey = "";
      storyState.assetLibraryOpen = false;
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
    await loadStoryAssetLibraryEpisode(episodeId);
    storyState.assetLibraryShotKey = selectedShotKey;
    renderStoryDetail();
  }

  function closeStoryAssetLibrary() {
    storyState.assetLibraryOpen = false;
    renderStoryDetail();
  }

  function storyEpisodeTabId(value = "") {
    if (value === "assets" || value === "prompts" || value === "production") return "production";
    return ["outline", "shots"].includes(value) ? value : "outline";
  }

  async function openStoryEpisode(episodeId = "", view = "outline") {
    storyState.selectedEpisodeId = episodeId;
    storyState.episodeTab = storyEpisodeTabId(view);
    storyState.selectedShotId = "";
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
    if (!shotId) return;
    storyState.selectedShotId = shotId;
    storyState.episodeTab = "production";
    renderStoryDetail();
    const card = [...document.querySelectorAll("[data-story-shot-card]")].find((item) => item.dataset.storyShotCard === shotId);
    card?.scrollIntoView({ behavior: "smooth", block: "center" });
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

  async function createStoryAssetImageVariant(asset = {}) {
    const projectId = storyState.selectedId;
    const episodeId = storyState.selectedEpisodeId;
    if (!projectId || !episodeId || !asset.id) return;
    const models = Array.isArray(storyState.productionModels?.image) ? storyState.productionModels.image : [];
    const modelId = storyState.imageModel || models[0]?.id || "qwen-image3";
    const model = models.find((item) => item.id === modelId) || models[0] || { id: modelId, label: modelId };
    const prompt = String(asset.metadata?.imagePrompt || asset.description || "").trim();
    if (!prompt) throw new Error(`${asset.name} 缺少设计图提示词，请先重新提取资产。`);
    const payload = await requestJson("/api/advanced/generate", {
      method: "POST",
      body: {
        provider: model.id,
        prompt,
        resolution: model.resolution || "2K",
        ratio: model.ratio || storyState.detail?.project?.aspectRatio || "3:4",
        duration: 1,
        params: { createKind: "story-asset", projectId, episodeId, storyAssetId: asset.id, storyImageModel: model.id },
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
        metadata: { model: model.id, modelLabel: model.label, episodeId },
      },
    });
    const variant = created.variant;
    try {
      let imageUrl = storyGenerationImageUrl(payload.record || {}) || storyAssetVariantImageUrl(variant);
      let generationStatus = "ready";
      if (!imageUrl) {
        const record = await pollStoryGenerationRecord(taskId);
        imageUrl = storyGenerationImageUrl(record);
        generationStatus = String(record.status || "ready");
      }
      if (imageUrl && variant?.id) {
        const updated = await requestJson(`/api/story/projects/${encodeURIComponent(projectId)}/assets/${encodeURIComponent(asset.id)}/variants/${encodeURIComponent(variant.id)}`, {
          method: "PUT",
          body: { status: "ready", metadata: { imageUrl, generationStatus } },
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
      storyState.actionMessage = failures.length ? `部分资产生成失败：${failures.slice(0, 3).join("；")}` : `S${String(shot.shotNo).padStart(2, "0")} 的资产设计图已生成，请到右上角资产库审核定稿。`;
    } catch (error) {
      storyState.actionMessage = error.message || String(error);
    } finally {
      storyState.action = "";
      storyState.generatingAssetId = "";
      renderStoryDetail();
    }
  }

  async function generateStoryAssetImage(assetId = "", shotId = "") {
    const asset = storyEpisodeAssets(selectedStoryEpisode() || {}).find((item) => item.id === assetId);
    if (!asset || storyState.action) return;
    const shot = shotId ? storyState.shots.find((item) => item.id === shotId) : null;
    if (shot && !storyShotAssetsConfirmed(shot)) {
      storyState.actionMessage = "请先确认此镜的资产清单，再生成设计图。";
      renderStoryDetail();
      return;
    }
    storyState.action = "generate-asset";
    storyState.generatingAssetId = asset.id;
    storyState.actionMessage = `AI 正在生成「${asset.name}」的资产设计图…`;
    renderStoryDetail();
    try {
      await createStoryAssetImageVariant(asset);
      await loadStoryDetail(storyState.selectedId);
      storyState.episodeTab = "production";
      storyState.actionMessage = `「${asset.name}」设计图已生成，请审核后设为定稿。`;
    } catch (error) {
      storyState.actionMessage = error.message || String(error);
    } finally {
      storyState.action = "";
      storyState.generatingAssetId = "";
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
    renderStoryDetail();
    try {
      await requestJson(`/api/story/projects/${encodeURIComponent(projectId)}/assets/${encodeURIComponent(assetId)}/variants/${encodeURIComponent(variantId)}/approve`, { method: "POST" });
      await loadStoryDetail(projectId);
      storyState.episodeTab = "production";
      storyState.actionMessage = "资产已定稿。全部资产定稿后可进入模型与提示词。";
    } catch (error) {
      storyState.actionMessage = error.message || String(error);
    } finally {
      storyState.action = "";
      renderStoryDetail();
    }
  }

  async function planStoryEpisodePrompts(targetShotId = "") {
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
            body: { provider: videoModel, optimizerModel, resolution, shotId: shot.id },
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
      if (event.target.classList?.contains("story-asset-library-backdrop") || event.target.closest("button[data-story-close-asset-library]")) closeStoryAssetLibrary();
      else if (event.target.closest("[data-story-open-asset-library]")) openStoryAssetLibrary();
      else if (event.target.closest("[data-story-refresh-detail]")) loadStoryProjects(storyState.selectedId);
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
      else if (event.target.closest("[data-story-plan-shot-prompt]")) planStoryEpisodePrompts(event.target.closest("[data-story-plan-shot-prompt]")?.dataset.storyPlanShotPrompt || "");
      else if (event.target.closest("[data-story-plan-prompts]")) planStoryEpisodePrompts();
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
      else if (event.target?.id === "storyEpisodeEditForm") event.preventDefault();
    });
    storyEl("storyProjectDetail")?.addEventListener("change", (event) => {
      if (event.target?.matches("[data-story-library-episode]")) {
        loadStoryAssetLibraryEpisode(event.target.value || "");
        return;
      }
      else if (event.target?.matches("[data-story-library-shot]")) storyState.assetLibraryShotKey = event.target.value || "";
      else if (event.target?.matches("[data-story-image-model]")) storyState.imageModel = event.target.value || storyState.imageModel;
      else if (event.target?.matches("[data-story-video-model]")) storyState.videoModel = event.target.value || storyState.videoModel;
      else if (event.target?.matches("[data-story-optimizer-model]")) storyState.optimizerModel = event.target.value || storyState.optimizerModel;
      else if (event.target?.matches("[data-story-prompt-resolution]")) storyState.promptResolution = event.target.value || storyState.promptResolution;
      else return;
      renderStoryDetail();
    });
    storyEl("storyProjectDetail")?.addEventListener("input", (event) => {
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
