const WORKFLOW_CANVAS_ACTIVE_KEY = `${WORKFLOW_STORAGE_KEY}:active`;
const WORKFLOW_CANVAS_SAVE_DELAY_MS = 3000;
const WORKFLOW_CANVAS_SAVE_RETRY_DELAY_MS = 650;
let savedWorkflowViewport = null;

function workflowCanvasUserSuffix() {
  return String(state.user?.id || state.user?.username || "guest").trim().toLowerCase() || "guest";
}

function workflowCanvasScopedKey(baseKey = "") {
  return `${baseKey}:${workflowCanvasUserSuffix()}`;
}

function workflowCanvasSummary(canvas = {}) {
  return {
    id: String(canvas.id || "").trim(),
    name: String(canvas.name || "Untitled workflow").trim().slice(0, 80) || "Untitled workflow",
    createdAt: String(canvas.createdAt || "").trim(),
    updatedAt: String(canvas.updatedAt || "").trim(),
    thumbnailUrl: String(canvas.thumbnailUrl || canvas.thumbnail_url || canvas.coverUrl || canvas.cover_url || "").trim(),
    thumbnailVideoUrl: String(canvas.thumbnailVideoUrl || canvas.thumbnail_video_url || "").trim(),
    previewNodes: Array.isArray(canvas.previewNodes) ? canvas.previewNodes : [],
  };
}

function migrateWorkflowNodeGraph(workflow = {}) {
  const nodes = Array.isArray(workflow.nodes) ? workflow.nodes.map((node) => ({ ...node, data: { ...(node.data || {}) } })) : [];
  const edges = Array.isArray(workflow.edges) ? workflow.edges.map((edge) => ({ ...edge })) : [];
  const migratedNodes = [];
  const migratedEdges = [...edges];
  nodes.forEach((node) => {
    const isImageGeneration = node.type === "imageDisplay";
    const isVideoGeneration = node.type === "unifiedVideoGen" || node.type === "video";
    if (!isImageGeneration && !isVideoGeneration) {
      migratedNodes.push(node);
      return;
    }
    const generation = { ...node, type: isImageGeneration ? "imageGenerate" : "unifiedVideoGen", data: { ...(node.data || {}) } };
    const mediaGroups = [
      ["referenceImages", "imageReference", "imageUrl", "Image input"],
      ["referenceVideos", "videoReference", "videoUrl", "Video input"],
    ];
    mediaGroups.forEach(([field, type, valueField, title], groupIndex) => {
      const values = Array.isArray(generation.data[field]) ? generation.data[field].filter(Boolean) : [];
      values.forEach((value, index) => {
        const sourceId = `${generation.id}-${type}-${index + 1}`;
        if (nodes.some((item) => item.id === sourceId) || migratedNodes.some((item) => item.id === sourceId)) return;
        migratedNodes.push({
          id: sourceId,
          type,
          title,
          x: Math.max(0, Number(generation.x || 0) - WORKFLOW_NODE_WIDTH - WORKFLOW_NODE_GAP),
          y: Math.max(0, Number(generation.y || 0) + groupIndex * 330 + index * 36),
          data: { [valueField]: value },
        });
        migratedEdges.push({ from: sourceId, to: generation.id });
      });
      delete generation.data[field];
    });
    delete generation.data.referenceAudios;
    migratedNodes.push(generation);
  });
  const nodeIds = new Set(migratedNodes.map((node) => node.id));
  return {
    ...workflow,
    nodes: migratedNodes,
    edges: migratedEdges.filter((edge, index, all) => edge.from !== edge.to && nodeIds.has(edge.from) && nodeIds.has(edge.to)
      && all.findIndex((item) => item.from === edge.from && item.to === edge.to) === index),
    layoutVersion: WORKFLOW_NODE_LAYOUT_VERSION,
  };
}

function workflowCanvasStateFromPayload(value = {}) {
  const original = value && typeof value === "object" ? value : {};
  const workflow = Number(original.layoutVersion || 0) < WORKFLOW_NODE_LAYOUT_VERSION ? migrateWorkflowNodeGraph(original) : original;
  const layoutVersion = Number(workflow.layoutVersion || 0);
  if (layoutVersion < WORKFLOW_NODE_LAYOUT_VERSION && !Array.isArray(workflow.nodes)) {
    return {
      nodes: [],
      edges: [],
      physics: [],
      directorPrompt: "",
      zoom: normalizeWorkflowZoom(1),
      layoutVersion: WORKFLOW_NODE_LAYOUT_VERSION,
      canvasWidth: Number(WORKFLOW_CANVAS_BASE_WIDTH),
      canvasHeight: Number(WORKFLOW_CANVAS_BASE_HEIGHT),
      scrollLeft: 0,
      scrollTop: 0,
      viewport: null,
    };
  }
  return {
    nodes: Array.isArray(workflow.nodes) ? workflow.nodes.map((node) => ({ ...node, data: { ...(node.data || {}) } })) : [],
    edges: Array.isArray(workflow.edges) ? workflow.edges.map((edge) => ({ ...edge })) : [],
    physics: Array.isArray(workflow.physics) ? [...workflow.physics] : [],
    directorPrompt: String(workflow.directorPrompt || ""),
    zoom: normalizeWorkflowZoom(workflow.zoom),
    layoutVersion: Number(workflow.layoutVersion || 0),
    canvasWidth: Number(workflow.canvasWidth || WORKFLOW_CANVAS_BASE_WIDTH),
    canvasHeight: Number(workflow.canvasHeight || WORKFLOW_CANVAS_BASE_HEIGHT),
    scrollLeft: Number(workflow.scrollLeft || 0),
    scrollTop: Number(workflow.scrollTop || 0),
    viewport: workflow.viewport && Number.isFinite(Number(workflow.viewport.zoom))
      ? { x: Number(workflow.viewport.x || 0), y: Number(workflow.viewport.y || 0), zoom: Number(workflow.viewport.zoom) }
      : null,
  };
}

function workflowCanvasSnapshot() {
  const workflow = ensureWorkflowState();
  const viewport = captureWorkflowCanvasViewport();
  workflow.scrollLeft = viewport.left;
  workflow.scrollTop = viewport.top;
  return {
    nodes: workflow.nodes,
    edges: workflow.edges,
    physics: workflow.physics,
    directorPrompt: workflow.directorPrompt || "",
    zoom: normalizeWorkflowZoom(workflow.zoom),
    layoutVersion: workflow.layoutVersion || WORKFLOW_NODE_LAYOUT_VERSION,
    canvasWidth: Number(workflow.canvasWidth || WORKFLOW_CANVAS_BASE_WIDTH),
    canvasHeight: Number(workflow.canvasHeight || WORKFLOW_CANVAS_BASE_HEIGHT),
    scrollLeft: Number(workflow.scrollLeft || 0),
    scrollTop: Number(workflow.scrollTop || 0),
    viewport: workflow.viewport && Number.isFinite(Number(workflow.viewport.zoom))
      ? { x: Number(workflow.viewport.x || 0), y: Number(workflow.viewport.y || 0), zoom: Number(workflow.viewport.zoom) }
      : null,
  };
}

function activeWorkflowCanvasSummary() {
  return (state.workflowCanvases || []).find((canvas) => canvas.id === state.workflowActiveCanvasId) || null;
}

function updateWorkflowCanvasSaveStatus() {
  const element = els.workflowRoot?.querySelector(".workflow-canvas-save-status");
  if (element) element.textContent = state.workflowCanvasMessage || (state.user ? "Saved" : "Local only");
}

window.updateWorkflowCanvasSaveStatus = updateWorkflowCanvasSaveStatus;

function workflowCanvasGraphSignature(workflow = {}) {
  const nodes = (Array.isArray(workflow.nodes) ? workflow.nodes : []).map((node) => ({
    id: String(node.id || ""),
    type: String(node.type || ""),
    x: Number(node.x || 0),
    y: Number(node.y || 0),
  }));
  const edges = (Array.isArray(workflow.edges) ? workflow.edges : []).map((edge) => `${edge.from || ""}->${edge.to || ""}`);
  return JSON.stringify({ nodes, edges });
}

function beginWorkflowCanvasLoad() {
  const loadSeq = Number(state.workflowCanvasLoadSeq || 0) + 1;
  state.workflowCanvasLoadSeq = loadSeq;
  return loadSeq;
}

function workflowCanvasLoadIsCurrent(loadSeq = 0) {
  return Number(loadSeq || 0) === Number(state.workflowCanvasLoadSeq || 0);
}

function workflowCanvasJson(value) {
  try {
    return JSON.stringify(value == null ? null : value);
  } catch (_) {
    return "";
  }
}

function workflowCanvasNodeChanged(current = null, baseline = null) {
  if (!current || !baseline) return Boolean(current) !== Boolean(baseline);
  return workflowCanvasJson(current) !== workflowCanvasJson(baseline);
}

function mergeWorkflowCanvasWithLocalEdits(serverWorkflow = {}, localWorkflow = null, baselineWorkflow = null) {
  const server = workflowCanvasStateFromPayload(serverWorkflow);
  if (!localWorkflow || !Array.isArray(localWorkflow.nodes)) return server;
  const local = workflowCanvasStateFromPayload(localWorkflow);
  const baseline = baselineWorkflow && Array.isArray(baselineWorkflow.nodes) ? baselineWorkflow : { nodes: [], edges: [] };
  const baselineNodes = new Set((baseline.nodes || []).map((node) => String(node.id || "")));
  const nodeIds = new Set(local.nodes.map((node) => String(node.id || "")));
  const nodes = [...local.nodes];
  server.nodes.forEach((node) => {
    const id = String(node.id || "");
    if (!id || baselineNodes.has(id) || nodeIds.has(id)) return;
    nodes.push(node);
    nodeIds.add(id);
  });
  const baselineEdges = new Set((baseline.edges || []).map((edge) => `${edge.from || ""}->${edge.to || ""}`));
  const edgeKeys = new Set();
  const edges = [];
  const appendEdge = (edge) => {
    const key = `${edge.from || ""}->${edge.to || ""}`;
    if (!edge.from || !edge.to || !nodeIds.has(String(edge.from)) || !nodeIds.has(String(edge.to)) || edgeKeys.has(key)) return;
    edgeKeys.add(key);
    edges.push(edge);
  };
  local.edges.forEach(appendEdge);
  server.edges.forEach((edge) => {
    if (!baselineEdges.has(`${edge.from || ""}->${edge.to || ""}`)) appendEdge(edge);
  });
  return {
    ...local,
    nodes,
    edges,
  };
}

function setActiveWorkflowCanvas(canvas = {}, { preserveLocalEdits = false, baselineWorkflow = null, requestSeq = 0 } = {}) {
  if (requestSeq && !workflowCanvasLoadIsCurrent(requestSeq)) return false;
  window.clearTimeout(state.workflowCanvasSaveTimer);
  state.workflowCanvasSaveTimer = 0;
  state.workflowCanvasSaveQueued = false;
  window.clearTimeout(state.workflowViewportSaveTimer);
  state.workflowViewportSaveTimer = 0;
  const summary = workflowCanvasSummary(canvas);
  state.workflowCanvases = [
    summary,
    ...(state.workflowCanvases || []).filter((item) => item.id !== summary.id),
  ].sort((left, right) => String(right.updatedAt || "").localeCompare(String(left.updatedAt || "")));
  const previousWorkflow = state.workflow;
  state.workflowActiveCanvasId = summary.id;
  state.workflow = canvas.workflow && Array.isArray(canvas.workflow.nodes)
    ? (preserveLocalEdits
      ? mergeWorkflowCanvasWithLocalEdits(canvas.workflow, previousWorkflow, baselineWorkflow)
      : workflowCanvasStateFromPayload(canvas.workflow))
    : cloneWorkflowDefault();
  // Opening a saved canvas starts with no node selected so generation controls
  // stay hidden until the user creates or clicks a node.
  state.workflowSelectedNodeId = "";
  state.workflowPickerNodeId = "";
  state.workflowPickerSearch = "";
  state.workflowMessage = "";
  state.workflowLogs = [];
  localStorage.setItem(workflowCanvasScopedKey(WORKFLOW_CANVAS_ACTIVE_KEY), summary.id);
  persistWorkflowState({ skipServer: true });
  return true;
}

// React owns the project list/editor shell. This bridge only swaps the active
// PostgreSQL-backed canvas into the existing site workflow state before the
// canvas mounts, so autosave and uploads always target the opened project.
async function activateWorkflowCanvasProject(canvas = {}) {
  if (!canvas || !canvas.id) return false;
  const requestSeq = beginWorkflowCanvasLoad();
  if (!setActiveWorkflowCanvas(canvas, { requestSeq })) return false;
  state.workflowCanvasView = "detail";
  state.workflowCanvasMessage = "已保存";
  savedWorkflowViewport = null;
  const migrated = typeof migrateWorkflowEmbeddedMedia === "function"
    ? await migrateWorkflowEmbeddedMedia()
    : false;
  if (!workflowCanvasLoadIsCurrent(requestSeq)) return false;
  const refreshed = typeof refreshWorkflowUploadedMediaUrls === "function"
    ? await refreshWorkflowUploadedMediaUrls()
    : false;
  if (!workflowCanvasLoadIsCurrent(requestSeq)) return false;
  if (migrated || refreshed) await saveWorkflowCanvas({ quiet: true });
  return true;
}

function deactivateWorkflowCanvasProject() {
  window.clearTimeout(state.workflowCanvasSaveTimer);
  state.workflowCanvasSaveTimer = 0;
  state.workflowCanvasView = "list";
  state.workflowCanvasMessage = "";
}

async function fetchWorkflowCanvas(canvasId = "") {
  const payload = await requestJson(`/api/workflow/canvases/${encodeURIComponent(canvasId)}`);
  return payload.canvas || null;
}

async function loadWorkflowCanvases({ force = false } = {}) {
  if (!canUseWorkflow()) return;
  if (!state.user) {
    state.workflowCanvases = [];
    state.workflowCanvasesLoaded = true;
    state.workflowCanvasesLoading = false;
    state.workflowCanvasView = "list";
    if (state.tab === "workflow") renderWorkflowPanel();
    return;
  }
  if (state.workflowCanvasesLoading || (state.workflowCanvasesLoaded && !force)) return;
  const loadSeq = beginWorkflowCanvasLoad();
  state.workflowCanvasesLoading = true;
  state.workflowCanvasMessage = "加载中...";
  if (state.tab === "workflow") renderWorkflowPanel();
  try {
    const payload = await requestJson("/api/workflow/canvases");
    if (!workflowCanvasLoadIsCurrent(loadSeq)) return;
    state.workflowCanvases = (payload.canvases || []).map(workflowCanvasSummary).filter((canvas) => canvas.id);
    state.workflowCanvasesLoaded = true;
    state.workflowCanvasView = "list";
    state.workflowCanvasMessage = "";
  } catch (error) {
    if (workflowCanvasLoadIsCurrent(loadSeq)) state.workflowCanvasMessage = error.message || String(error);
  } finally {
    if (workflowCanvasLoadIsCurrent(loadSeq)) state.workflowCanvasesLoading = false;
    if (state.tab === "workflow") renderWorkflowPanel();
  }
}

function scheduleWorkflowCanvasSave() {
  if (!state.user || !state.workflowActiveCanvasId || state.workflowCanvasView !== "detail") return;
  state.workflowCanvasMessage = "未保存";
  updateWorkflowCanvasSaveStatus();
  window.clearTimeout(state.workflowCanvasSaveTimer);
  state.workflowCanvasSaveTimer = window.setTimeout(() => {
    state.workflowCanvasSaveTimer = 0;
    saveWorkflowCanvas({ quiet: true }).catch(() => {});
  }, WORKFLOW_CANVAS_SAVE_DELAY_MS);
}

async function saveWorkflowCanvas({ quiet = false, name = "" } = {}) {
  if (!state.user) {
    openLogin();
    return null;
  }
  if (state.workflowCanvasSavePromise) {
    state.workflowCanvasSaveQueued = true;
    if (name) state.workflowCanvasSavePendingName = String(name).trim().slice(0, 80);
    return state.workflowCanvasSavePromise;
  }
  const canvasId = String(state.workflowActiveCanvasId || "");
  if (!canvasId) return null;
  window.clearTimeout(state.workflowCanvasSaveTimer);
  state.workflowCanvasSaveTimer = 0;
  state.workflowCanvasSaving = true;
  state.workflowCanvasMessage = "保存中...";
  updateWorkflowCanvasSaveStatus();
  state.workflowCanvasSavePromise = (async () => {
    try {
      let savedCanvas = null;
      do {
        state.workflowCanvasSaveQueued = false;
        const latest = activeWorkflowCanvasSummary();
        const pendingName = name || state.workflowCanvasSavePendingName || "";
        if (pendingName) latest && (latest.name = String(pendingName).trim().slice(0, 80) || latest.name);
        const nextName = String(latest?.name || "未命名画布").trim().slice(0, 80) || "未命名画布";
        let payload = null;
        for (let attempt = 0; attempt < 4; attempt += 1) {
          try {
            payload = await requestJson(`/api/workflow/canvases/${encodeURIComponent(canvasId)}`, {
              method: "PUT",
              body: { name: nextName, workflow: workflowCanvasSnapshot() },
            });
            break;
          } catch (error) {
            const conflict = error.code === "WORKFLOW_CANVAS_UPDATE_IN_PROGRESS" || error.statusCode === 429;
            if (!conflict || attempt === 3) throw error;
            await new Promise((resolve) => window.setTimeout(resolve, WORKFLOW_CANVAS_SAVE_RETRY_DELAY_MS * (attempt + 1)));
          }
        }
        state.workflowCanvasSavePendingName = "";
        savedCanvas = payload.canvas || null;
        if (state.workflowActiveCanvasId === canvasId && savedCanvas) {
          const updated = workflowCanvasSummary(savedCanvas);
          state.workflowCanvases = (state.workflowCanvases || []).map((canvas) => canvas.id === canvasId ? updated : canvas);
        }
      } while (state.workflowCanvasSaveQueued && state.workflowActiveCanvasId === canvasId);
      if (state.workflowActiveCanvasId === canvasId) state.workflowCanvasMessage = "已保存";
      updateWorkflowCanvasSaveStatus();
      return savedCanvas;
    } catch (error) {
      if (state.workflowActiveCanvasId === canvasId) state.workflowCanvasMessage = error.message || String(error);
      updateWorkflowCanvasSaveStatus();
      throw error;
    } finally {
      state.workflowCanvasSaving = false;
      state.workflowCanvasSavePromise = null;
      if (!quiet && state.tab === "workflow") renderWorkflowPanel();
    }
  })();
  return state.workflowCanvasSavePromise;
}

async function openWorkflowCanvas(canvasId = "") {
  const nextId = String(canvasId || "").trim();
  if (!nextId) return false;
  let switchSeq = 0;
  try {
    if (state.workflowActiveCanvasId && state.workflowActiveCanvasId !== nextId) {
      await saveWorkflowCanvas({ quiet: true });
    }
    switchSeq = beginWorkflowCanvasLoad();
    const startRevision = Number(state.workflowLocalRevision || 0);
    const baselineWorkflow = state.workflow && Array.isArray(state.workflow.nodes)
      ? workflowCanvasStateFromPayload(workflowCanvasSnapshot())
      : null;
    state.workflowCanvasesLoading = true;
    state.workflowCanvasMessage = "加载中...";
    renderWorkflowPanel();
    const canvas = await fetchWorkflowCanvas(nextId);
    if (!workflowCanvasLoadIsCurrent(switchSeq)) return false;
    if (!canvas) throw new Error("画布不存在或无权访问");
    const preserveLocalEdits = Number(state.workflowLocalRevision || 0) !== startRevision;
    if (!setActiveWorkflowCanvas(canvas, { preserveLocalEdits, baselineWorkflow, requestSeq: switchSeq })) return false;
    state.workflowCanvasView = "detail";
    state.workflowCanvasMessage = "已保存";
    savedWorkflowViewport = null;
    const migrated = typeof migrateWorkflowEmbeddedMedia === "function" ? await migrateWorkflowEmbeddedMedia() : false;
    if (!workflowCanvasLoadIsCurrent(switchSeq)) return false;
    const refreshed = typeof refreshWorkflowUploadedMediaUrls === "function"
      ? await refreshWorkflowUploadedMediaUrls()
      : false;
    if (!workflowCanvasLoadIsCurrent(switchSeq)) return false;
    if (migrated || refreshed) await saveWorkflowCanvas({ quiet: true });
    return true;
  } catch (error) {
    if (workflowCanvasLoadIsCurrent(switchSeq)) state.workflowCanvasMessage = error.message || String(error);
    return false;
  } finally {
    if (!switchSeq || workflowCanvasLoadIsCurrent(switchSeq)) state.workflowCanvasesLoading = false;
    renderWorkflowPanel();
  }
}

function switchWorkflowCanvas(canvasId = "") {
  return openWorkflowCanvas(canvasId);
}

function closeWorkflowCanvas() {
  window.clearTimeout(state.workflowCanvasSaveTimer);
  state.workflowCanvasSaveTimer = 0;
  state.workflowCanvasView = "list";
  state.workflowCanvasMessage = "";
  renderWorkflowPanel();
}

async function createWorkflowCanvas() {
  if (!state.user) return openLogin();
  await showInlineDialog({
    title: "新增画布项目",
    body: `<label class="field"><span>项目名称</span><input data-workflow-new-name maxlength="80" value="未命名画布" autocomplete="off" /></label><p class="job-note">创建后会进入干净的画布详情。</p>`,
    confirmText: "创建",
    onOpen: (root) => root.querySelector("[data-workflow-new-name]")?.select(),
    onConfirm: async (root) => {
      const name = String(root.querySelector("[data-workflow-new-name]")?.value || "").trim().slice(0, 80) || "未命名画布";
      const createSeq = beginWorkflowCanvasLoad();
      const payload = await requestJson("/api/workflow/canvases", {
        method: "POST",
        body: { name, workflow: cloneWorkflowDefault() },
      });
      if (!workflowCanvasLoadIsCurrent(createSeq)) return;
      if (payload.canvas) {
        setActiveWorkflowCanvas(payload.canvas, { requestSeq: createSeq });
        state.workflowCanvasView = "detail";
        state.workflowCanvasMessage = "已保存";
        savedWorkflowViewport = null;
      }
      state.workflowCanvasesLoaded = true;
    },
  });
  renderWorkflowPanel();
}

async function deleteWorkflowCanvas(canvasId = "") {
  if (!state.user) return openLogin();
  const current = (state.workflowCanvases || []).find((canvas) => canvas.id === String(canvasId || state.workflowActiveCanvasId || "")) || activeWorkflowCanvasSummary();
  if (!current) return;
  await showInlineDialog({
    title: "删除画布项目？",
    body: `<p class="job-note">“${escapeHtml(current.name)}”将被永久删除，此操作无法撤销。</p>`,
    confirmText: "删除",
    onConfirm: async () => {
      window.clearTimeout(state.workflowCanvasSaveTimer);
      state.workflowCanvasSaveTimer = 0;
      state.workflowCanvasSaveQueued = false;
      const deleteSeq = beginWorkflowCanvasLoad();
      const payload = await requestJson(`/api/workflow/canvases/${encodeURIComponent(current.id)}`, { method: "DELETE" });
      if (!workflowCanvasLoadIsCurrent(deleteSeq)) return;
      state.workflowCanvases = (payload.canvases || []).map(workflowCanvasSummary).filter((canvas) => canvas.id);
      if (state.workflowActiveCanvasId === current.id) {
        state.workflowActiveCanvasId = "";
        state.workflow = cloneWorkflowDefault();
        state.workflowSelectedNodeId = "";
        state.workflowCanvasView = "list";
        localStorage.removeItem(workflowCanvasScopedKey(WORKFLOW_CANVAS_ACTIVE_KEY));
        persistWorkflowState({ skipServer: true });
      }
      state.workflowCanvasMessage = "";
    },
  });
  renderWorkflowPanel();
}

function workflowCanvasDisplayTime(value = "") {
  const time = Date.parse(String(value || ""));
  if (!Number.isFinite(time)) return "";
  try {
    return new Intl.DateTimeFormat("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).format(time);
  } catch (_) {
    return new Date(time).toLocaleString();
  }
}

function workflowCanvasProjectPreview(canvas = {}) {
  const imageUrl = String(canvas.thumbnailUrl || canvas.thumbnail_url || canvas.coverUrl || canvas.cover_url || "").trim();
  const videoUrl = String(canvas.thumbnailVideoUrl || canvas.thumbnail_video_url || "").trim();
  if (imageUrl) {
    return `<div class="workflow-canvas-project-preview is-image"><img src="${escapeHtml(imageUrl)}" alt="${escapeHtml(canvas.name || "画布预览")}" loading="lazy" decoding="async" /></div>`;
  }
  if (videoUrl) {
    return `<div class="workflow-canvas-project-preview is-video"><video src="${escapeHtml(videoUrl)}" muted playsinline preload="metadata" aria-label="${escapeHtml(canvas.name || "画布预览")}"></video><span class="workflow-canvas-project-kind"><i data-lucide="play"></i></span></div>`;
  }
  return `<div class="workflow-canvas-project-preview is-placeholder"><i data-lucide="frames"></i><span>${escapeHtml(String(canvas.name || "画").slice(0, 1))}</span></div>`;
}

function renderWorkflowCanvasList() {
  const loading = !state.workflowCanvasesLoaded || state.workflowCanvasesLoading;
  const canvases = state.workflowCanvases || [];
  return `<section class="workflow-canvas-list-page" aria-label="画布项目列表">
    <header class="workflow-canvas-list-head">
      <div><span class="workflow-canvas-kicker">CANVAS</span><h2>画布</h2><p>创建、打开和管理你的生成画布项目。</p></div>
      <div class="workflow-canvas-list-actions">
        <button type="button" data-workflow-canvas-action="new" ${!state.user || state.workflowCanvasesLoading ? "disabled" : ""}><i data-lucide="plus"></i><span>新增项目</span></button>
        <button type="button" class="is-danger" data-workflow-canvas-action="delete" ${canvases.length ? "" : "disabled"}><i data-lucide="trash-2"></i><span>删除</span></button>
      </div>
    </header>
    ${state.user ? "" : `<div class="workflow-canvas-empty"><i data-lucide="log-in"></i><strong>登录后使用画布</strong><p>画布项目会保存到你的账号。</p></div>`}
    ${state.user && loading ? `<div class="workflow-canvas-loading"><i data-lucide="loader-circle"></i><span>加载画布项目...</span></div>` : ""}
    ${state.user && !loading && !canvases.length ? `<div class="workflow-canvas-empty"><i data-lucide="layout-dashboard"></i><strong>还没有画布项目</strong><p>点击“新增项目”开始。</p></div>` : ""}
    ${canvases.length ? `<div class="workflow-canvas-grid">${canvases.map((canvas) => `
      <article class="workflow-canvas-project" data-workflow-open-canvas="${escapeHtml(canvas.id)}" tabindex="0" role="button">
        ${workflowCanvasProjectPreview(canvas)}
        <div class="workflow-canvas-project-copy"><strong>${escapeHtml(canvas.name)}</strong><small>${escapeHtml(workflowCanvasDisplayTime(canvas.updatedAt || canvas.createdAt) || "刚刚")}</small></div>
        <button type="button" class="workflow-canvas-project-delete" data-workflow-delete-canvas="${escapeHtml(canvas.id)}" title="删除项目" aria-label="删除 ${escapeHtml(canvas.name)}"><i data-lucide="trash-2"></i></button>
      </article>
    `).join("")}</div>` : ""}
    <span class="workflow-canvas-save-status" aria-live="polite">${escapeHtml(state.workflowCanvasMessage || "")}</span>
  </section>`;
}

function renderWorkflowCanvasManager() {
  if (state.workflowCanvasView !== "detail") return renderWorkflowCanvasList();
  const current = activeWorkflowCanvasSummary();
  const disabled = !state.user || state.workflowCanvasesLoading || state.workflowCanvasSaving;
  return `<div class="workflow-canvas-detail-bar">
    <button type="button" class="workflow-canvas-back" data-workflow-canvas-action="back"><i data-lucide="arrow-left"></i><span>返回</span></button>
    <div class="workflow-canvas-title"><span>画布</span><strong>${escapeHtml(current?.name || "未命名画布")}</strong></div>
    <div class="workflow-canvas-detail-actions">
      <span class="workflow-canvas-save-status" aria-live="polite">${escapeHtml(state.workflowCanvasMessage || "已保存")}</span>
      <button type="button" data-workflow-canvas-action="save" ${disabled ? "disabled" : ""}><i data-lucide="save"></i><span>保存</span></button>
      <button type="button" data-workflow-canvas-action="new" ${disabled ? "disabled" : ""}><i data-lucide="plus"></i><span>新建</span></button>
    </div>
  </div>`;
}

function handleWorkflowCanvasClick(event) {
  const openProject = event.target.closest("[data-workflow-open-canvas]");
  const deleteProject = event.target.closest("[data-workflow-delete-canvas]");
  if (deleteProject) {
    event.preventDefault();
    event.stopPropagation();
    if (!deleteProject.disabled) deleteWorkflowCanvas(deleteProject.dataset.workflowDeleteCanvas || "").catch((error) => { state.workflowCanvasMessage = error.message || String(error); renderWorkflowPanel(); });
    return true;
  }
  if (openProject) {
    event.preventDefault();
    event.stopPropagation();
    openWorkflowCanvas(openProject.dataset.workflowOpenCanvas || "").catch(() => {});
    return true;
  }
  const button = event.target.closest("[data-workflow-canvas-action]");
  if (!button) return false;
  if (button.disabled) return true;
  event.preventDefault();
  event.stopPropagation();
  const action = button.dataset.workflowCanvasAction || "";
  if (action === "new") createWorkflowCanvas().catch((error) => { state.workflowCanvasMessage = error.message || String(error); renderWorkflowPanel(); });
  if (action === "back") closeWorkflowCanvas();
  if (action === "save") saveWorkflowCanvas().catch(() => {});
  if (action === "delete") {
    const selected = state.workflowCanvases.find((canvas) => canvas.id === state.workflowActiveCanvasId) || state.workflowCanvases[0];
    deleteWorkflowCanvas(selected?.id || "").catch((error) => { state.workflowCanvasMessage = error.message || String(error); renderWorkflowPanel(); });
  }
  return true;
}

function handleWorkflowCanvasKeydown(event) {
  const project = event.target.closest("[data-workflow-open-canvas]");
  if (!project || !["Enter", " "].includes(event.key)) return false;
  event.preventDefault();
  openWorkflowCanvas(project.dataset.workflowOpenCanvas || "").catch(() => {});
  return true;
}

function handleWorkflowCanvasInput(event) {
  const target = event.target;
  if (target.matches("[data-workflow-canvas-name]")) {
    const current = activeWorkflowCanvasSummary();
    if (current) {
      current.name = String(target.value || "").slice(0, 80);
      state.workflowCanvasMessage = "未保存";
      scheduleWorkflowCanvasSave();
      updateWorkflowCanvasSaveStatus();
    }
    return true;
  }
  return false;
}

window.activateWorkflowCanvasProject = activateWorkflowCanvasProject;
window.saveWorkflowCanvasNow = (options = {}) => {
  // React Flow and the legacy site shell can both observe one edit. Keep a
  // single in-flight PUT for the active canvas so the server never sees two
  // concurrent updates for the same user/project.
  if (state.workflowCanvasSavePromise) {
    state.workflowCanvasSaveQueued = true;
    if (options?.name) state.workflowCanvasSavePendingName = String(options.name).trim().slice(0, 80);
    return state.workflowCanvasSavePromise;
  }
  return saveWorkflowCanvas(options);
};
window.deactivateWorkflowCanvasProject = deactivateWorkflowCanvasProject;
