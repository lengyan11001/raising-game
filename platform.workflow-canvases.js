const WORKFLOW_CANVAS_ACTIVE_KEY = `${WORKFLOW_STORAGE_KEY}:active`;
const WORKFLOW_CANVAS_SAVE_DELAY_MS = 1200;

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
  };
}

function activeWorkflowCanvasSummary() {
  return (state.workflowCanvases || []).find((canvas) => canvas.id === state.workflowActiveCanvasId) || null;
}

function updateWorkflowCanvasSaveStatus() {
  const element = els.workflowRoot?.querySelector(".workflow-canvas-save-status");
  if (element) element.textContent = state.workflowCanvasMessage || (state.user ? "Saved" : "Local only");
}

function setActiveWorkflowCanvas(canvas = {}) {
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
  state.workflowActiveCanvasId = summary.id;
  state.workflow = canvas.workflow && Array.isArray(canvas.workflow.nodes)
    ? workflowCanvasStateFromPayload(canvas.workflow)
    : cloneWorkflowDefault();
  state.workflowSelectedNodeId = state.workflow.nodes[0]?.id || "";
  state.workflowPickerNodeId = "";
  state.workflowPickerSearch = "";
  state.workflowMessage = "";
  state.workflowLogs = [];
  localStorage.setItem(workflowCanvasScopedKey(WORKFLOW_CANVAS_ACTIVE_KEY), summary.id);
  persistWorkflowState({ skipServer: true });
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
    if (state.tab === "workflow") renderWorkflowPanel();
    return;
  }
  if (state.workflowCanvasesLoading || (state.workflowCanvasesLoaded && !force)) return;
  state.workflowCanvasesLoading = true;
  state.workflowCanvasMessage = "Loading...";
  if (state.tab === "workflow") renderWorkflowPanel();
  try {
    const payload = await requestJson("/api/workflow/canvases");
    state.workflowCanvases = (payload.canvases || []).map(workflowCanvasSummary).filter((canvas) => canvas.id);
    const preferredId = localStorage.getItem(workflowCanvasScopedKey(WORKFLOW_CANVAS_ACTIVE_KEY)) || "";
    const selected = state.workflowCanvases.find((canvas) => canvas.id === preferredId) || state.workflowCanvases[0];
    if (selected) {
      const canvas = await fetchWorkflowCanvas(selected.id);
      if (!canvas) throw new Error("Workflow could not be loaded.");
      setActiveWorkflowCanvas(canvas);
    } else {
      state.workflowActiveCanvasId = "";
      state.workflow = cloneWorkflowDefault();
      state.workflowSelectedNodeId = "";
    }
    state.workflowCanvasesLoaded = true;
    const migrated = typeof migrateWorkflowEmbeddedMedia === "function"
      ? await migrateWorkflowEmbeddedMedia()
      : false;
    if (migrated) await saveWorkflowCanvas({ quiet: true });
    state.workflowCanvasMessage = "Saved";
  } catch (error) {
    state.workflowCanvasMessage = error.message || String(error);
  } finally {
    state.workflowCanvasesLoading = false;
    if (state.tab === "workflow") renderWorkflowPanel();
  }
}

function scheduleWorkflowCanvasSave() {
  if (!state.user || !state.workflowCanvasesLoaded || !state.workflowActiveCanvasId) return;
  window.clearTimeout(state.workflowCanvasSaveTimer);
  state.workflowCanvasSaveQueued = true;
  state.workflowCanvasMessage = "Unsaved";
  updateWorkflowCanvasSaveStatus();
  if (state.workflowCanvasSaving) return;
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
  const canvasId = state.workflowActiveCanvasId;
  const current = activeWorkflowCanvasSummary();
  if (!canvasId || !current) return null;
  if (name) current.name = String(name).trim().slice(0, 80) || "Untitled workflow";
  window.clearTimeout(state.workflowCanvasSaveTimer);
  state.workflowCanvasSaveTimer = 0;
  state.workflowCanvasSaveQueued = true;
  if (state.workflowCanvasSavePromise) return state.workflowCanvasSavePromise;
  state.workflowCanvasSaving = true;
  state.workflowCanvasMessage = "Saving...";
  updateWorkflowCanvasSaveStatus();
  if (!quiet && state.tab === "workflow") renderWorkflowPanel();
  state.workflowCanvasSavePromise = (async () => {
    let savedCanvas = null;
    try {
      while (state.workflowCanvasSaveQueued && state.workflowActiveCanvasId === canvasId) {
        state.workflowCanvasSaveQueued = false;
        const latest = activeWorkflowCanvasSummary();
        const nextName = String(latest?.name || "Untitled workflow").trim().slice(0, 80) || "Untitled workflow";
        const payload = await requestJson(`/api/workflow/canvases/${encodeURIComponent(canvasId)}`, {
          method: "PUT",
          body: { name: nextName, workflow: workflowCanvasSnapshot() },
        });
        savedCanvas = payload.canvas || null;
        if (state.workflowActiveCanvasId === canvasId && savedCanvas) {
          const updated = workflowCanvasSummary(savedCanvas);
          state.workflowCanvases = (state.workflowCanvases || []).map((canvas) => canvas.id === canvasId ? updated : canvas);
        }
      }
      if (state.workflowActiveCanvasId === canvasId) state.workflowCanvasMessage = "Saved";
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

async function switchWorkflowCanvas(canvasId = "") {
  const nextId = String(canvasId || "").trim();
  if (!nextId || nextId === state.workflowActiveCanvasId || state.workflowCanvasesLoading) return;
  try {
    await saveWorkflowCanvas({ quiet: true });
    state.workflowCanvasesLoading = true;
    state.workflowCanvasMessage = "Loading...";
    renderWorkflowPanel();
    const canvas = await fetchWorkflowCanvas(nextId);
    if (canvas) setActiveWorkflowCanvas(canvas);
    const migrated = typeof migrateWorkflowEmbeddedMedia === "function"
      ? await migrateWorkflowEmbeddedMedia()
      : false;
    if (migrated) await saveWorkflowCanvas({ quiet: true });
    state.workflowCanvasMessage = "Saved";
  } catch (error) {
    state.workflowCanvasMessage = error.message || String(error);
  } finally {
    state.workflowCanvasesLoading = false;
    renderWorkflowPanel();
  }
}

async function createWorkflowCanvas() {
  if (!state.user) return openLogin();
  await showInlineDialog({
    title: "New workflow",
    body: `<label class="field"><span>Name</span><input data-workflow-new-name maxlength="80" value="Untitled workflow" autocomplete="off" /></label><p class="job-note"></p>`,
    confirmText: "Create",
    onOpen: (root) => root.querySelector("[data-workflow-new-name]")?.select(),
    onConfirm: async (root) => {
      const name = root.querySelector("[data-workflow-new-name]")?.value || "Untitled workflow";
      const payload = await requestJson("/api/workflow/canvases", {
        method: "POST",
        body: { name, workflow: cloneWorkflowDefault() },
      });
      if (payload.canvas) setActiveWorkflowCanvas(payload.canvas);
      state.workflowCanvasesLoaded = true;
      state.workflowCanvasMessage = "Saved";
    },
  });
  renderWorkflowPanel();
}

async function deleteWorkflowCanvas() {
  if (!state.user) return openLogin();
  const current = activeWorkflowCanvasSummary();
  if (!current) return;
  await showInlineDialog({
    title: "Delete workflow?",
    body: `<p class="job-note">${escapeHtml(current.name)} will be permanently deleted.</p>`,
    confirmText: "Delete",
    onConfirm: async () => {
      window.clearTimeout(state.workflowCanvasSaveTimer);
      state.workflowCanvasSaveTimer = 0;
      state.workflowCanvasSaveQueued = false;
      const payload = await requestJson(`/api/workflow/canvases/${encodeURIComponent(current.id)}`, { method: "DELETE" });
      state.workflowCanvases = (payload.canvases || []).map(workflowCanvasSummary).filter((canvas) => canvas.id);
      const next = state.workflowCanvases[0];
      const canvas = next ? await fetchWorkflowCanvas(next.id) : null;
      if (canvas) setActiveWorkflowCanvas(canvas);
      state.workflowCanvasMessage = "Saved";
    },
  });
  renderWorkflowPanel();
}

function renderWorkflowCanvasManager() {
  const disabled = !state.user || !state.workflowCanvasesLoaded || state.workflowCanvasesLoading || state.workflowCanvasSaving;
  const current = activeWorkflowCanvasSummary();
  const options = state.user
    ? (state.workflowCanvases || []).map((canvas) => `<option value="${escapeHtml(canvas.id)}" ${canvas.id === state.workflowActiveCanvasId ? "selected" : ""}>${escapeHtml(canvas.name)}</option>`).join("")
    : `<option value="">Sign in to save workflows</option>`;
  return `
    <div class="workflow-canvas-manager">
      <select data-workflow-canvas-select aria-label="Saved workflow" ${disabled ? "disabled" : ""}>${options}</select>
      <input data-workflow-canvas-name maxlength="80" value="${escapeHtml(current?.name || "Untitled workflow")}" aria-label="Workflow name" ${disabled ? "disabled" : ""} />
      <button type="button" data-workflow-canvas-action="new" title="New workflow" aria-label="New workflow" ${disabled ? "disabled" : ""}><i data-lucide="plus"></i></button>
      <button type="button" data-workflow-canvas-action="save" title="Save workflow" aria-label="Save workflow" ${disabled ? "disabled" : ""}><i data-lucide="save"></i></button>
      <button class="is-danger" type="button" data-workflow-canvas-action="delete" title="Delete workflow" aria-label="Delete workflow" ${disabled ? "disabled" : ""}><i data-lucide="trash-2"></i></button>
      <span class="workflow-canvas-save-status">${escapeHtml(state.workflowCanvasMessage || (state.user ? "Saved" : "Local only"))}</span>
    </div>
  `;
}

function handleWorkflowCanvasClick(event) {
  const button = event.target.closest("[data-workflow-canvas-action]");
  if (!button) return false;
  if (button.disabled) return true;
  event.preventDefault();
  event.stopPropagation();
  const action = button.dataset.workflowCanvasAction || "";
  if (action === "new") createWorkflowCanvas().catch((error) => { state.workflowCanvasMessage = error.message || String(error); renderWorkflowPanel(); });
  if (action === "save") {
    const name = els.workflowRoot?.querySelector("[data-workflow-canvas-name]")?.value || "";
    saveWorkflowCanvas({ name }).catch(() => {});
  }
  if (action === "delete") deleteWorkflowCanvas().catch((error) => { state.workflowCanvasMessage = error.message || String(error); renderWorkflowPanel(); });
  return true;
}

function handleWorkflowCanvasInput(event) {
  const target = event.target;
  if (target.matches("[data-workflow-canvas-select]")) {
    switchWorkflowCanvas(target.value).catch(() => {});
    return true;
  }
  if (target.matches("[data-workflow-canvas-name]")) {
    const current = activeWorkflowCanvasSummary();
    if (current) {
      current.name = String(target.value || "").slice(0, 80);
      const option = els.workflowRoot?.querySelector(`[data-workflow-canvas-select] option[value="${CSS.escape(current.id)}"]`);
      if (option) option.textContent = current.name || "Untitled workflow";
    }
    state.workflowCanvasMessage = "Unsaved";
    updateWorkflowCanvasSaveStatus();
    scheduleWorkflowCanvasSave();
    return true;
  }
  return false;
}
