async function handleWorkflowDrop(event) {
  const canvas = event.target.closest?.(".workflow-canvas");
  if (!canvas) return;
  const files = Array.from(event.dataTransfer?.files || []).filter((file) => /^(image|video)\//i.test(String(file.type || "")));
  if (canvas.closest?.(".workflow-react-host") || canvas.classList?.contains("workflow-react-host")) {
    if (!files.length) return;
    event.preventDefault();
    const target = event.target.closest?.(".react-flow__node");
    const nodeId = String(target?.dataset?.id || target?.getAttribute?.("data-id") || "");
    if (nodeId && typeof window.uploadWorkflowFilesToNode === "function") {
      await window.uploadWorkflowFilesToNode(files, nodeId);
    }
    return;
  }
  const paletteAction = event.dataTransfer?.getData("application/x-workflow-node") || "";
  if (!files.length && !paletteAction) return;
  event.preventDefault();
  const point = workflowCanvasPointFromEvent(event);
  if (paletteAction) {
    addWorkflowNodeAt(paletteAction, point);
    return;
  }
  if (files.length && typeof window.uploadWorkflowFilesToNode === "function") {
    const selected = selectedWorkflowNode();
    const target = selected && ["imageGenerate", "unifiedVideoGen", "video"].includes(selected.type)
      ? selected
      : workflowImageNodes()[0] || workflowVideoNodes()[0];
    if (target) await window.uploadWorkflowFilesToNode(files, target.id);
  }
}

function workflowInsertionPreviousNode() {
  const workflow = ensureWorkflowState();
  const output = workflowNodeByType("output");
  const selected = selectedWorkflowNode();
  const outputIncoming = output ? workflowIncomingEdges(output.id)[0] : null;
  const outputPrevious = workflowNodeById(outputIncoming?.from || "");
  return selected && selected.type !== "output"
    ? selected
    : outputPrevious && outputPrevious.type !== "output"
      ? outputPrevious
      : workflowVideoNodes()[workflowVideoNodes().length - 1] || workflowUploadNode();
}

function workflowNewNodePosition() {
  const workflow = ensureWorkflowState();
  const index = workflow.nodes.length;
  const column = index % 4;
  const row = Math.floor(index / 4);
  return clampWorkflowNodePosition(
    80 + column * (WORKFLOW_NODE_WIDTH + WORKFLOW_NODE_GAP),
    80 + row * 520,
  );
}

function addWorkflowImageNode() {
  addWorkflowNodeAt("add-image");
}

function insertWorkflowNodeAfter(node = {}, previous = null) {
  const workflow = ensureWorkflowState();
  const output = workflowNodeByType("output");
  const insertionX = Number(previous?.x || 30) + WORKFLOW_NODE_WIDTH + WORKFLOW_NODE_GAP;
  workflow.nodes.forEach((item) => {
    if (item.id !== previous?.id && Number(item.x || 0) >= insertionX) {
      item.x = Math.min(
        WORKFLOW_CANVAS_MAX_WIDTH - WORKFLOW_NODE_WIDTH,
        Number(item.x || 0) + WORKFLOW_NODE_WIDTH + WORKFLOW_NODE_GAP,
      );
    }
  });
  node.x = insertionX;
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
  renderWorkflowPanel({ focusNodeId: node.id });
}

function workflowNodePaletteItem(action = "") {
  return {
    "add-image": { type: "imageGenerate", icon: "wand-sparkles", label: "图片生成", hint: "使用我们的图片模型" },
    "add-video": { type: "unifiedVideoGen", icon: "clapperboard", label: "视频生成", hint: "使用我们的视频模型" },
  }[action] || null;
}

function selectWorkflowNode(nodeId = "", { render = true } = {}) {
  const id = String(nodeId || "");
  state.workflowSelectedNodeId = id;
  if (window.WorkflowReactCanvas?.selectNode) window.WorkflowReactCanvas.selectNode(id);
  if (render && !window.WorkflowReactCanvas?.sync?.()) renderWorkflowPanel({ focusNodeId: id });
  return workflowNodeById(id);
}

function workflowNodePositionIsFree(candidate = {}, workflow = ensureWorkflowState()) {
  const width = 440;
  const height = 620;
  return !(workflow.nodes || []).some((node) => (
    Math.abs(Number(node.x || 0) - Number(candidate.x || 0)) < width
    && Math.abs(Number(node.y || 0) - Number(candidate.y || 0)) < height
  ));
}

function workflowAvailableNodePosition(position = null) {
  const base = clampWorkflowNodePosition(position?.x, position?.y);
  if (workflowNodePositionIsFree(base)) return base;
  const stepX = 76;
  const stepY = 64;
  for (let ring = 1; ring <= 40; ring += 1) {
    for (let row = -ring; row <= ring; row += 1) {
      for (let column = -ring; column <= ring; column += 1) {
        if (Math.max(Math.abs(row), Math.abs(column)) !== ring) continue;
        const candidate = clampWorkflowNodePosition(base.x + column * stepX, base.y + row * stepY);
        if (workflowNodePositionIsFree(candidate)) return candidate;
      }
    }
  }
  return workflowNewNodePosition();
}

function createWorkflowNode(action = "", position = null) {
  const workflow = ensureWorkflowState();
  const point = position ? workflowAvailableNodePosition(position) : workflowNewNodePosition();
  const stamp = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
  let node = null;
  if (action === "add-image") {
    node = {
      id: `image-${stamp}`,
      type: "imageGenerate",
      title: `图片生成 ${workflowImageNodes().length + 1}`,
      x: point.x,
      y: point.y,
      data: { modelId: "qwen-image3", prompt: "", ratio: "1:1", resolution: "2K", referenceImages: [] },
    };
  } else if (action === "add-video") {
    node = {
      id: `video-${stamp}`,
      type: "unifiedVideoGen",
      title: `视频生成 ${workflowVideoNodes().length + 1}`,
      x: point.x,
      y: point.y,
      data: { modelId: "seedance", prompt: "", ratio: "16:9", resolution: "720p", duration: 5, referenceImages: [], referenceVideos: [], referenceAudios: [], addSound: true },
    };
  }
  if (!node) return null;
  workflow.nodes.push(node);
  state.workflowSelectedNodeId = node.id;
  return node;
}

function workflowVisibleCenterPosition() {
  const canvas = els.workflowRoot?.querySelector(".workflow-canvas");
  if (!canvas) return workflowNewNodePosition();
  if (canvas.classList.contains("workflow-react-host") && window.WorkflowReactCanvas?.screenToFlowPosition) {
    const rect = canvas.getBoundingClientRect();
    return window.WorkflowReactCanvas.screenToFlowPosition({
      x: rect.left + Math.max(180, rect.width * 0.32),
      y: rect.top + Math.max(160, rect.height * 0.28),
    });
  }
  const zoom = workflowZoom();
  return clampWorkflowNodePosition(
    (canvas.scrollLeft + canvas.clientWidth / 2) / zoom - 120,
    (canvas.scrollTop + canvas.clientHeight / 2) / zoom - 80,
  );
}

function workflowVisibleNodePosition() {
  const canvas = els.workflowRoot?.querySelector(".workflow-react-host");
  if (!canvas || typeof window.WorkflowReactCanvas?.screenToFlowPosition !== "function") return workflowVisibleCenterPosition();
  const rect = canvas.getBoundingClientRect();
  const nodeWidth = 420;
  const nodeHeight = 590;
  const gap = 28;
  const left = rect.left + 36;
  const top = rect.top + 30;
  const right = rect.left + Math.max(nodeWidth, rect.width - 36);
  const bottom = rect.top + rect.height - 112;
  const maxColumns = Math.max(1, Math.floor((right - left + gap) / (nodeWidth + gap)));
  const maxRows = Math.max(1, Math.floor((bottom - top + gap) / (nodeHeight + gap)));
  for (let row = 0; row < maxRows; row += 1) {
    for (let column = 0; column < maxColumns; column += 1) {
      const flowPosition = window.WorkflowReactCanvas.screenToFlowPosition({
        x: left + column * (nodeWidth + gap),
        y: top + row * (nodeHeight + gap),
      });
      const candidate = clampWorkflowNodePosition(flowPosition.x, flowPosition.y);
      if (workflowNodePositionIsFree(candidate)) return candidate;
    }
  }
  return workflowVisibleCenterPosition();
}

function addWorkflowNodeAt(action = "", position = null) {
  const node = createWorkflowNode(action, position || workflowVisibleNodePosition());
  if (!node) return "";
  persistWorkflowState();
  if (window.WorkflowReactCanvas?.sync?.()) {
    window.WorkflowReactCanvas.selectNode(node.id);
  } else {
    renderWorkflowPanel({ focusNodeId: node.id });
  }
  return node.id;
}

window.createWorkflowNode = createWorkflowNode;
window.activeWorkflowSelectedNodeId = () => String(state.workflowSelectedNodeId || "");
window.selectWorkflowNode = selectWorkflowNode;
window.addWorkflowNodeAt = addWorkflowNodeAt;
window.workflowCanConnectNodes = workflowCanConnectNodes;
window.removeWorkflowNode = removeWorkflowNode;
window.deleteSelectedWorkflowNodes = deleteSelectedWorkflowNodes;
window.connectWorkflowNodes = connectWorkflowNodes;
window.reconnectWorkflowEdge = reconnectWorkflowEdge;
window.runWorkflowSingleNode = runWorkflowSingleNode;

function workflowConnectionRuleMatches(from = {}, to = {}) {
  const generationTypes = new Set(["imageGenerate", "unifiedVideoGen"]);
  return generationTypes.has(from?.type || "") && generationTypes.has(to?.type || "");
}

function workflowCanConnectNodes(fromId = "", toId = "", ignoredEdge = null) {
  const from = workflowNodeById(fromId);
  const to = workflowNodeById(toId);
  if (!from || !to || fromId === toId) return false;
  if (!workflowNodeAcceptsOutput(from) || !workflowNodeAcceptsInput(to)) return false;
  if (!workflowConnectionRuleMatches(from, to)) return false;
  if (workflowGraphReachesWithoutEdge(toId, fromId, ignoredEdge)) return false;
  return true;
}

function workflowGraphReachesWithoutEdge(startId = "", targetId = "", ignoredEdge = null) {
  const visited = new Set();
  const queue = [startId];
  while (queue.length) {
    const current = queue.shift();
    if (!current || visited.has(current)) continue;
    if (current === targetId) return true;
    visited.add(current);
    workflowOutgoingEdges(current).forEach((edge) => {
      if (ignoredEdge && edge.from === ignoredEdge.from && edge.to === ignoredEdge.to) return;
      queue.push(edge.to);
    });
  }
  return false;
}

function workflowAutoInputAction() {
  return "";
}

function createWorkflowInputNodeAndConnect() {
  return false;
}

function workflowCanceledError() {
  const error = new Error("Workflow canceled.");
  error.workflowCanceled = true;
  return error;
}

function workflowThrowIfCancelled(nodeId = state.workflowActiveNodeId || "") {
  if (!state.workflowCancelRequested) return;
  const ids = Array.isArray(state.workflowCancelNodeIds) ? state.workflowCancelNodeIds.map(String) : [];
  if (!ids.length || ids.includes(String(nodeId || ""))) throw workflowCanceledError();
}

function requestWorkflowCancel() {
  const running = Array.isArray(state.workflowRunningNodeIds) ? state.workflowRunningNodeIds.filter(Boolean) : [];
  if (!running.length) return;
  state.workflowCancelRequested = true;
  state.workflowCancelNodeIds = running.map(String);
  state.workflowMessage = "Canceling workflow...";
  renderWorkflowPanel();
}

function workflowHandleExecutionError(error = {}, nodeId = state.workflowActiveNodeId || "") {
  const activeNode = workflowNodeById(nodeId || "");
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

async function pollWorkflowTask(nodeId = "", taskId = "", kind = "video") {
  let lastRecord = null;
  for (let attempt = 0; attempt < 150; attempt += 1) {
    workflowThrowIfCancelled(node.id);
    await new Promise((resolve) => setTimeout(resolve, attempt ? 4000 : 1200));
    workflowThrowIfCancelled(node.id);
    const payload = await requestJson(`/api/generation-records/${encodeURIComponent(taskId)}`);
    const record = payload.record || payload.generation || null;
    if (!record?.taskId) continue;
    lastRecord = record;
    workflowSetNodeData(nodeId, {
      status: record.status || "running",
      record,
      taskId: record.taskId,
    });
    if (isTerminalGenerationStatus(record.status)) break;
  }
  return lastRecord;
}

function workflowMediaValueList(values = []) {
  return [...new Set(values.map((value) => String(value || "").trim()).filter(Boolean))];
}

function workflowMediaBodyValue(value = "") {
  const raw = String(value || "").trim();
  return {
    dataUrl: dataUrlValue(raw),
    url: dataUrlValue(raw) ? "" : absoluteHttpUrl(raw),
  };
}

function workflowNodeCanvasReferences(node = {}) {
  const incoming = workflowNodeIncomingMedia(node);
  return {
    images: workflowMediaValueList([
      ...incoming.images,
      ...workflowNodeReferences(node, "referenceImages"),
    ]),
    videos: workflowMediaValueList([
      ...incoming.videos,
      ...workflowNodeReferences(node, "referenceVideos"),
    ]),
    audios: workflowMediaValueList(workflowNodeReferences(node, "referenceAudios")),
  };
}

function workflowNodeImageInputs(node = {}) {
  return workflowNodeCanvasReferences(node).images;
}

function workflowNodeVideoInputs(node = {}) {
  return workflowNodeCanvasReferences(node).videos;
}

function workflowNodeAudioInputs(node = {}) {
  return workflowNodeCanvasReferences(node).audios;
}

window.workflowNodeCanvasReferences = workflowNodeCanvasReferences;

function workflowGeneratedNodeAction(kind = "image") {
  return kind === "video" ? "add-video" : "add-image";
}

function workflowGeneratedNodePosition(source = {}) {
  // Site generation cards are 420px wide. Keep a sibling result immediately
  // beside its source card instead of using the legacy 520px layout width,
  // which made the new node look like it jumped across the canvas.
  const cardWidth = 420;
  const columnGap = 28;
  const rowGap = 24;
  const index = workflowGeneratedResultChildren(source).length;
  return {
    x: Number(source.x || 0) + cardWidth + columnGap,
    y: Number(source.y || 0) + index * (620 + rowGap),
  };
}

function createWorkflowGeneratedResultNode(sourceNode = {}, result = {}, kind = "image") {
  if (!sourceNode?.id) return null;
  const newNode = createWorkflowNode(workflowGeneratedNodeAction(kind), workflowGeneratedNodePosition(sourceNode));
  if (!newNode) return null;
  const sourceData = sourceNode.data || {};
  const resultNumber = workflowGeneratedResultChildren(sourceNode).length + 1;
  newNode.title = `${kind === "video" ? "视频结果" : "图片结果"} ${resultNumber}`;
  const commonData = {
    ...(newNode.data || {}),
    modelId: sourceData.modelId || newNode.data?.modelId,
    prompt: sourceData.prompt || "",
    ratio: sourceData.ratio || newNode.data?.ratio,
    resolution: sourceData.resolution || newNode.data?.resolution,
    qwenTier: sourceData.qwenTier,
    seedreamTier: sourceData.seedreamTier,
    outputImageCount: sourceData.outputImageCount,
    promptExtend: sourceData.promptExtend,
    watermark: sourceData.watermark,
    duration: sourceData.duration,
    mode: sourceData.mode,
    addSound: sourceData.addSound,
    referenceImages: [],
    referenceVideos: [],
    referenceAudios: [],
    source: "generated",
    generatedFromNodeId: sourceNode.id,
    status: "succeeded",
    error: "",
    record: result.record || null,
    taskId: result.taskId || "",
  };
  if (kind === "video") {
    newNode.data = {
      ...commonData,
      resultVideoUrl: result.videoUrl || "",
      resultVideoUrls: [result.videoUrl].filter(Boolean),
      posterUrl: result.posterUrl || "",
    };
  } else {
    const imageUrls = Array.isArray(result.imageUrls) ? result.imageUrls : [result.imageUrl].filter(Boolean);
    newNode.data = {
      ...commonData,
      resultImageUrl: imageUrls[0] || result.imageUrl || "",
      resultImageUrls: imageUrls,
      posterUrl: result.posterUrl || imageUrls[0] || "",
    };
  }
  window.connectWorkflowNodes?.(sourceNode.id, newNode.id);
  state.workflowSelectedNodeId = newNode.id;
  persistWorkflowState();
  window.WorkflowReactCanvas?.sync?.();
  window.WorkflowReactCanvas?.selectNode?.(newNode.id);
  return newNode;
}

window.createWorkflowGeneratedResultNode = createWorkflowGeneratedResultNode;

function workflowNodeHasStartedGeneration(node = {}) {
  return ["submitting", "preparing", "processing", "running", "queued"].includes(String(node.data?.status || ""));
}

function workflowNodeHasOwnContent(node = {}) {
  if (!node?.id) return false;
  if (node.data?.generationRunPlaceholder) return true;
  const data = node.data || {};
  const hasInput = workflowNodeReferences(node, "referenceImages").length
    || workflowNodeReferences(node, "referenceVideos").length
    || workflowNodeReferences(node, "referenceAudios").length;
  if (hasInput) return true;
  if (["upload", "generated"].includes(data.source)) return true;
  if (["imageDisplay", "imageGenerate"].includes(node.type)) {
    return Boolean(workflowNodeOwnResultImages(node).length || data.record || data.taskId);
  }
  return Boolean(workflowNodeOwnResultVideos(node).length || data.posterUrl || data.record || data.taskId);
}

function cloneWorkflowInputEdges(sourceNodeId = "", targetNodeId = "") {
  if (!sourceNodeId || !targetNodeId || sourceNodeId === targetNodeId) return;
  const workflow = ensureWorkflowState();
  const existingSources = new Set(
    workflow.edges
      .filter((edge) => edge.to === targetNodeId)
      .map((edge) => edge.from),
  );
  workflow.edges
    .filter((edge) => edge.to === sourceNodeId && edge.from !== targetNodeId && !existingSources.has(edge.from))
    .forEach((edge) => {
      existingSources.add(edge.from);
      workflow.edges.push({ from: edge.from, to: targetNodeId });
    });
}

function workflowGenerationRunNode(node = {}) {
  if (!node?.id) return null;
  if (node.data?.generationRunPlaceholder) return node;
  if (!workflowNodeHasOwnContent(node)) return node;
  const kind = ["imageDisplay", "imageGenerate"].includes(node.type) ? "image" : "video";
  const newNode = createWorkflowNode(kind === "video" ? "add-video" : "add-image", workflowGeneratedNodePosition(node));
  if (!newNode) return node;
  newNode.title = `${kind === "video" ? "视频结果" : "图片结果"} ${workflowGeneratedResultChildren(node).length + 1}`;
  newNode.data = {
    ...(newNode.data || {}),
    resultImageUrl: "",
    resultImageUrls: [],
    resultVideoUrl: "",
    resultVideoUrls: [],
    videoUrl: "",
    videoUrls: [],
    posterUrl: "",
    record: null,
    taskId: "",
    lastFrameUrl: "",
    modelId: node.data?.modelId || newNode.data?.modelId,
    prompt: node.data?.prompt || "",
    ratio: node.data?.ratio || newNode.data?.ratio,
    resolution: node.data?.resolution || newNode.data?.resolution,
    qwenTier: node.data?.qwenTier,
    seedreamTier: node.data?.seedreamTier,
    outputImageCount: node.data?.outputImageCount,
    promptExtend: node.data?.promptExtend,
    watermark: node.data?.watermark,
    duration: node.data?.duration,
    mode: node.data?.mode,
    addSound: node.data?.addSound,
    referenceImages: workflowNodeReferences(node, "referenceImages"),
    referenceVideos: workflowNodeReferences(node, "referenceVideos"),
    referenceAudios: workflowNodeReferences(node, "referenceAudios"),
    source: "generated",
    generatedFromNodeId: node.id,
    generationRunPlaceholder: true,
    status: "submitting",
    error: "",
  };
  // A repeat generation must receive the same upstream inputs and explicit
  // references as the source node. Connecting source -> new would feed the
  // source's own result back as a reference, which is not part of its params.
  cloneWorkflowInputEdges(node.id, newNode.id);
  state.workflowSelectedNodeId = newNode.id;
  persistWorkflowState();
  window.WorkflowReactCanvas?.sync?.();
  window.WorkflowReactCanvas?.selectNode?.(newNode.id);
  return newNode;
}

function workflowStoreCompletedNodeResult(node = {}, kind = "image", result = {}, record = null, taskId = "") {
  if (kind === "video") {
    workflowSetNodeData(node.id, {
      status: "succeeded",
      generationRunPlaceholder: false,
      record,
      taskId,
      resultVideoUrl: result.videoUrl || "",
      resultVideoUrls: [result.videoUrl].filter(Boolean),
      posterUrl: result.posterUrl || "",
    });
    return;
  }
  const imageUrls = Array.isArray(result.imageUrls) ? result.imageUrls.filter(Boolean) : [result.imageUrl].filter(Boolean);
  workflowSetNodeData(node.id, {
    status: "succeeded",
    generationRunPlaceholder: false,
    record,
    taskId,
    resultImageUrl: imageUrls[0] || result.imageUrl || "",
    resultImageUrls: imageUrls,
    posterUrl: result.posterUrl || imageUrls[0] || "",
  });
}

function workflowSeedancePromptAliases(prompt = "") {
  return String(prompt || "").replace(/@(image|图片|video|视频|audio|音频)\s*(\d+)/gi, (_, kind, index) => {
    const normalized = String(kind).toLowerCase();
    if (normalized === "image" || normalized === "图片") return `Image ${index}`;
    if (normalized === "video" || normalized === "视频") return `Video ${index}`;
    return `Audio ${index}`;
  });
}

function workflowVideoProviderConfig(node = {}) {
  const modelId = workflowVideoModelById(node.data?.modelId).id;
  const images = workflowNodeImageInputs(node);
  const videos = workflowNodeVideoInputs(node);
  if (modelId === "wan30-prime") return { provider: "wan30", videoCapability: "wan30-video-prime" };
  if (modelId === "wan30") return { provider: "wan30", videoCapability: "wan30-video" };
  if (modelId === "wan27") {
    const selectedMode = workflowVideoMode(node, workflowVideoModelById(modelId));
    if (selectedMode !== "auto" && selectedMode.startsWith("wan27-")) return { provider: "wan27", videoCapability: selectedMode };
    if (videos.length) return { provider: "wan27", videoCapability: "wan27-video-edit" };
    if (images.length > 1) return { provider: "wan27", videoCapability: "wan27-r2v" };
    if (images.length) return { provider: "wan27", videoCapability: "wan27-i2v" };
    return { provider: "wan27", videoCapability: "wan27-t2v" };
  }
  if (modelId === "wan-animate") {
    const selectedMode = workflowVideoMode(node, workflowVideoModelById(modelId));
    if (selectedMode === "wan-animate-move" || selectedMode === "wan-animate-mix") return { provider: "wan27", videoCapability: selectedMode };
    return { provider: "wan27", videoCapability: videos.length ? "wan-animate-mix" : "wan-animate-move" };
  }
  if (modelId === "happyhorse") {
    const selectedMode = workflowVideoMode(node, workflowVideoModelById(modelId));
    if (selectedMode !== "auto" && selectedMode.startsWith("happyhorse-")) return { provider: "happyhorse", videoCapability: selectedMode };
    if (videos.length) return { provider: "happyhorse", videoCapability: "happyhorse-video-edit" };
    if (images.length > 1) return { provider: "happyhorse", videoCapability: "happyhorse-r2v" };
    if (images.length) return { provider: "happyhorse", videoCapability: "happyhorse-i2v" };
    return { provider: "happyhorse", videoCapability: "happyhorse-t2v" };
  }
  return { provider: modelId, videoCapability: "" };
}

function workflowReferencePayload(values = []) {
  return workflowMediaValueList(values).map((value, index) => {
    const media = workflowMediaBodyValue(value);
    return {
      ...(media.dataUrl ? { dataUrl: media.dataUrl } : {}),
      ...(media.url ? { url: media.url } : {}),
      fileName: `workflow-reference-${index + 1}`,
    };
  });
}

function workflowImageGenerationBody(node = {}) {
  const model = workflowImageModelById(node.data?.modelId);
  const references = workflowNodeImageInputs(node);
  const body = {
    provider: model.id,
    prompt: workflowEffectivePrompt(node),
    referenceImages: workflowReferencePayload(references),
    ratio: node.data?.ratio || model.ratio,
    resolution: node.data?.resolution || model.resolution,
    duration: 1,
    params: {
      createKind: "workflow",
      workflowNodeId: node.id,
      workflowModelId: model.id,
      workflowInputCount: references.length,
    },
  };
  if (model.id === "qwen-image3") {
    body.model = node.data?.qwenTier === "standard" ? "qwen-image-3.0" : "qwen-image-3.0-pro";
    body.qwenTier = node.data?.qwenTier || model.defaultTier || "pro";
    body.n = Math.max(1, Math.min(6, Number(node.data?.outputImageCount || 1) || 1));
    body.prompt_extend = node.data?.promptExtend !== false;
    body.prompt_extend_mode = "direct";
    body.watermark = node.data?.watermark === true;
  } else if (model.id === "seedream5-image") {
    body.seedreamTier = node.data?.seedreamTier || model.defaultTier || "pro";
  }
  if (model.id === "qwen-image-edit-spicy") {
    const first = workflowMediaBodyValue(references[0] || "");
    return { ...body, dataUrl: first.dataUrl || undefined, imageUrl: first.url || undefined, imageAssetId: "" };
  }
  return body;
}

function workflowVideoGenerationBody(node = {}) {
  const model = workflowVideoModelById(node.data?.modelId);
  const config = workflowVideoProviderConfig(node);
  const images = workflowNodeImageInputs(node);
  const videos = workflowNodeVideoInputs(node);
  const audios = workflowNodeAudioInputs(node);
  const selectedMode = String(node.data?.mode || "").trim();
  const seedanceFrameMode = ["seedance", "seedance25", "seedance-nsfw"].includes(config.provider)
    && ["first_frame", "first_last_frame"].includes(selectedMode);
  const imagePayload = seedanceFrameMode ? [] : workflowReferencePayload(images);
  const videoPayload = workflowMediaValueList(videos).map(workflowMediaBodyValue);
  const seedanceProvider = ["seedance", "seedance25", "seedance-nsfw"].includes(config.provider);
  const audioPayload = workflowMediaValueList(audios).map(workflowMediaBodyValue);
  const videoUrls = videoPayload.map((item) => item.url).filter(Boolean);
  const audioUrls = audioPayload.map((item) => item.url).filter(Boolean);
  const firstImage = workflowMediaBodyValue(images[0] || "");
  const lastImage = workflowMediaBodyValue(images[1] || "");
  const firstVideo = videoPayload[0] || {};
  const firstFrameFields = seedanceFrameMode
    ? {
      firstFrameDataUrl: firstImage.dataUrl || undefined,
      firstFrameUrl: firstImage.url || undefined,
      lastFrameDataUrl: selectedMode === "first_last_frame" ? lastImage.dataUrl || undefined : undefined,
      lastFrameUrl: selectedMode === "first_last_frame" ? lastImage.url || undefined : undefined,
    }
    : {};
  const body = {
    provider: config.provider,
    videoCapability: config.videoCapability || undefined,
    prompt: seedanceProvider ? workflowSeedancePromptAliases(workflowEffectivePrompt(node)) : workflowEffectivePrompt(node),
    referenceImages: imagePayload,
    referenceVideos: videoPayload,
    referenceVideoUrls: videoUrls,
    referenceAudios: audioPayload,
    referenceAudioUrls: audioUrls,
    referenceVideoDurationSeconds: videos.length ? Number(node.data?.duration || model.duration || 5) : 0,
    videoDataUrl: firstVideo.dataUrl || undefined,
    videoUrl: firstVideo.url || undefined,
    audioDataUrl: audioPayload[0]?.dataUrl || undefined,
    audioUrl: audioPayload[0]?.url || undefined,
    ...firstFrameFields,
    seedanceMode: seedanceProvider ? (selectedMode || (config.provider === "seedance" ? "reference_video" : "omini")) : undefined,
    functionMode: ["seedance25", "seedance-nsfw"].includes(config.provider) ? (selectedMode || "omini") : undefined,
    mediaMode: config.provider === "wan30" ? (selectedMode || "multimodal") : undefined,
    generateAudio: node.data?.addSound !== false,
    generate_audio: node.data?.addSound !== false,
    ratio: node.data?.ratio || model.ratio,
    resolution: node.data?.resolution || model.resolution,
    duration: Number(node.data?.duration || model.duration || 5),
    inputVideoSeconds: videos.length ? Number(node.data?.duration || model.duration || 5) : 0,
    params: {
      createKind: "workflow",
      workflowNodeId: node.id,
      workflowModelId: model.id,
      workflowInputImages: images.length,
      workflowInputVideos: videos.length,
      workflowInputAudios: audios.length,
      generateAudio: node.data?.addSound !== false,
      generate_audio: node.data?.addSound !== false,
    },
  };
  if (["wan27-i2v", "happyhorse-i2v", "wan-animate-move", "wan-animate-mix"].includes(config.videoCapability)) {
    body.dataUrl = firstImage.dataUrl || undefined;
    body.imageUrl = firstImage.url || undefined;
  }
  if (config.videoCapability === "wan-animate-move" || config.videoCapability === "wan-animate-mix") {
    body.animateMode = config.videoCapability === "wan-animate-mix" ? "wan-pro" : "wan-std";
    body.params.parameters = { mode: body.animateMode };
  }
  return body;
}

async function runWorkflowImageNode(node = {}) {
  const model = workflowImageModelById(node.data?.modelId);
  const references = workflowNodeImageInputs(node);
  if (model.id === "qwen-image-edit-spicy" && !references.length) throw new Error("Qwen Image Edit Spicy requires an input image.");
  state.workflowMessage = `Running ${model.label}...`;
  let payload;
  if (model.id === "qwen-image-edit-spicy") {
    const source = await workflowEnsureImageEditSources(references, `${node.id}-image`, "Workflow image input");
    payload = await requestJson("/api/wan27/image-edit", {
      method: "POST",
      body: {
        ...source,
        prompt: workflowEffectivePrompt(node),
        ratio: node.data?.ratio || model.ratio,
        resolution: node.data?.resolution || model.resolution,
        params: { createKind: "workflow", workflowNodeId: node.id, workflowModelId: model.id },
      },
    });
  } else {
    payload = await requestJson("/api/advanced/generate", { method: "POST", body: workflowImageGenerationBody(node) });
  }
  if (payload.user) setUser(payload.user);
  const submitted = workflowRecordFromPayload(payload, { prompt: node.data?.prompt || "", model: model.label, resolution: node.data?.resolution || model.resolution, ratio: node.data?.ratio || model.ratio, duration: 1 });
  const taskId = payload.taskId || payload.task?.taskId || submitted.taskId || "";
  const immediateImage = payload.imageUrl || payload.localImageUrl || generationImageResultUrl(submitted);
  if (!taskId && !immediateImage) throw new Error("Image generation did not return a task or image.");
  if (payload.user) setUser(payload.user);
  if (immediateImage && !taskId) {
    workflowStoreCompletedNodeResult(node, "image", {
      imageUrl: immediateImage,
      imageUrls: [immediateImage],
    }, submitted, "");
    return { taskId: "", imageUrl: immediateImage, record: submitted };
  }
  workflowSetNodeData(node.id, { status: submitted.status || "submitted", record: submitted, taskId });
  mergeAdvancedResultRecord(submitted);
  const finalRecord = await pollWorkflowTask(node.id, taskId, "image");
  if (!finalRecord || !isSucceededGenerationStatus(finalRecord.status)) throw new Error(finalRecord?.error || `${model.label} failed.`);
  const imageUrl = generationImageResultUrl(finalRecord) || workflowNodeResultImage(node);
  if (!imageUrl) throw new Error(`${model.label} completed without an image result.`);
  workflowStoreCompletedNodeResult(node, "image", {
    imageUrl,
    imageUrls: generationImageResultUrls(finalRecord),
    posterUrl: generationPosterUrl(finalRecord),
  }, finalRecord, taskId);
  return { taskId, imageUrl, record: finalRecord };
}

async function runWorkflowVideoNode(node = {}) {
  const model = workflowVideoModelById(node.data?.modelId);
  const body = workflowVideoGenerationBody(node);
  if (!String(body.prompt || "").trim() && !body.referenceImages?.length && !body.referenceVideoUrls?.length && !body.videoDataUrl) {
    throw new Error("Add a prompt or connect reference media first.");
  }
  state.workflowMessage = `Running ${model.label}...`;
  const payload = await requestJson("/api/advanced/generate", { method: "POST", body });
  if (payload.user) setUser(payload.user);
  const record = workflowRecordFromPayload(payload, { prompt: body.prompt, model: model.label, resolution: body.resolution, duration: body.duration, ratio: body.ratio });
  const taskId = payload.taskId || payload.task?.taskId || record.taskId || "";
  if (!taskId) throw new Error("Video generation did not return a task id.");
  workflowSetNodeData(node.id, { status: record.status || "submitted", record, taskId });
  mergeAdvancedResultRecord(record);
  const finalRecord = await pollWorkflowTask(node.id, taskId, "video");
  if (!finalRecord || !isSucceededGenerationStatus(finalRecord.status)) throw new Error(finalRecord?.error || `${model.label} failed.`);
  const videoUrl = generationVideoUrl(finalRecord) || workflowNodeResultVideo(node);
  if (!videoUrl) throw new Error(`${model.label} completed without a result video.`);
  workflowStoreCompletedNodeResult(node, "video", {
    videoUrl,
    posterUrl: generationPosterUrl(finalRecord),
  }, finalRecord, taskId);
  return { taskId, videoUrl, record: finalRecord };
}

async function runWorkflowNode(node = {}) {
  workflowThrowIfCancelled(node.id);
  state.workflowActiveNodeId = node.id;
  state.workflowSelectedNodeId = node.id;
  if (["imageDisplay", "imageGenerate"].includes(node.type)) return runWorkflowImageNode(node);
  if (["unifiedVideoGen", "video"].includes(node.type)) return runWorkflowVideoNode(node);
  throw new Error("Workflow node not found.");
}

async function workflowExtractTailFrame(node = {}, taskId = "", videoUrl = "", duration = 5) {
  if (!taskId || !videoUrl) return "";
  workflowThrowIfCancelled(node.id);
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

async function runWorkflowNodeLegacyDisabled(node = {}, { previousFrameUrl = "", previousVideoUrl = "", firstNode = false } = {}) {
  const workflow = ensureWorkflowState();
  const upload = workflowUploadNode();
  const sourceImage = upload?.data?.imageUrl || upload?.data?.startImage || "";
  const endImage = upload?.data?.endImage || "";
  const faceImage = workflowNodeOptionEnabled(node, "faceSwapMode") ? (upload?.data?.faceImage || "") : "";
  if (!node?.id) throw new Error("Video node not found.");
  if (!sourceImage) throw new Error("Upload a start image first.");

  const model = workflowNodeModel(node);
  const duration = Number(node.data?.duration || 5);
  const resolution = node.data?.resolution || "720p";

  state.workflowActiveNodeId = node.id;
  state.workflowSelectedNodeId = node.id;
  state.workflowMessage = `Preparing ${model.label}...`;
  workflowSetNodeData(node.id, { status: "preparing", error: "", taskId: "", record: null, lastFrameUrl: "" });
  workflowThrowIfCancelled(node.id);

  const continuityImage = previousFrameUrl || sourceImage;
  const keyframeStorageNode = firstNode ? upload : node;
  const keyframeImage = await workflowPrepareNodeKeyframe(node, {
    baseImage: continuityImage,
    faceImage,
    model,
    firstNode,
    storageNode: keyframeStorageNode,
  });
  workflowThrowIfCancelled(node.id);

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
  workflowSetNodeData(node.id, { status: "submitting", error: "", taskId: "", record: null, lastFrameUrl: "" });
  workflowLog(`Submitting ${model.label}.`);
  workflowThrowIfCancelled(node.id);

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
  const imageUrls = [];
  let allComplete = Boolean(nodes.length);
  nodes.forEach((node) => {
    const videoUrl = workflowNodeResultVideo(node);
    const imageUrl = workflowNodeResultImage(node);
    const taskId = node.data?.taskId || node.data?.record?.taskId || "";
    if (!workflowNodeHasSuccessfulResult(node) || (!videoUrl && !imageUrl)) {
      allComplete = false;
      return;
    }
    if (videoUrl) videoUrls.push(videoUrl);
    if (imageUrl) imageUrls.push(imageUrl);
    if (taskId) taskIds.push(taskId);
  });
  return { allComplete, taskIds, videoUrls, imageUrls };
}

async function composeWorkflowOutput(taskIds = [], videoUrls = []) {
  const output = workflowNodeByType("output");
  if (!output || !videoUrls.length) return false;
  workflowThrowIfCancelled(output.id);
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
  if (!state.user) return openLogin();
  const nodes = workflowOrderedExecutableNodes();
  const node = nodes.find((item) => item.id === nodeId);
  const runState = workflowNodeRunState(node || {});
  if (!node || !runState.canRun) {
    state.workflowMessage = runState.reason || "This node cannot run yet.";
    renderWorkflowPanel();
    return;
  }
  const runNode = workflowGenerationRunNode(node);
  if (!runNode) throw new Error("Could not create a generation node.");
  state.workflowRunningNodeIds = [...new Set([...(state.workflowRunningNodeIds || []), String(runNode.id)])];
  state.workflowRunning = state.workflowRunningNodeIds.length > 0;
  state.workflowActiveNodeId = runNode.id;
  state.workflowMessage = "Running node...";
  renderWorkflowPanel();
  try {
    await runWorkflowNode(runNode);
    state.workflowMessage = `${runNode.title || "Node"} completed.`;
  } catch (error) {
    workflowHandleExecutionError(error, runNode.id);
  } finally {
    state.workflowRunningNodeIds = (state.workflowRunningNodeIds || []).filter((id) => id !== String(runNode.id));
    state.workflowRunning = state.workflowRunningNodeIds.length > 0;
    state.workflowActiveNodeId = state.workflowRunningNodeIds[state.workflowRunningNodeIds.length - 1] || "";
    persistWorkflowState();
    renderWorkflowPanel();
  }
}

async function runWorkflow() {
  if (!state.user) return openLogin();
  const nodes = workflowOrderedExecutableNodes();
  if (!nodes.length) {
    state.workflowMessage = "Add an image or video node first.";
    renderWorkflowPanel();
    return;
  }
  state.workflowRunning = true;
  state.workflowCancelRequested = false;
  state.workflowActiveNodeId = "";
  clearWorkflowExecutionResults({ message: "Running workflow...", render: false });
  renderWorkflowPanel();
  try {
    workflowLog(`Run order: ${nodes.map((node) => workflowNodeModel(node).label).join(" -> ")}`);
    for (const node of nodes) {
      workflowThrowIfCancelled(node.id);
      const dependencies = workflowIncomingEdges(node.id)
        .map((edge) => workflowNodeById(edge.from))
        .filter((item) => item && ["imageDisplay", "imageGenerate", "unifiedVideoGen", "video"].includes(item.type));
      if (dependencies.some((dependency) => !workflowNodeHasSuccessfulResult(dependency))) {
        throw new Error(`${node.title || "Node"} is waiting for a connected input.`);
      }
      await runWorkflowNode(node);
    }
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
  state.workflowSelectedNodeId = "";
  state.workflowMessage = "";
  state.workflowLogs = [];
  persistWorkflowState();
  renderWorkflowPanel();
}

function handleWorkflowPaletteDragStart(event) {
  const paletteButton = event.target.closest?.("[data-workflow-palette]");
  if (!paletteButton || !event.dataTransfer) return;
  const action = paletteButton.dataset.workflowPalette || "";
  event.dataTransfer.setData("application/reactflow", action);
  event.dataTransfer.setData("application/x-workflow-node", action);
  event.dataTransfer.effectAllowed = "move";
}

function handleWorkflowCanvasDoubleClick(event) {
  const canvas = event.target.closest?.(".workflow-canvas");
  if (!canvas || canvas.classList.contains("workflow-react-host") || event.target.closest?.("[data-workflow-node]") || workflowControlInteractionTarget(event.target)) return;
  event.preventDefault();
  addWorkflowNodeAt(event.shiftKey ? "add-video" : "add-image", workflowCanvasPointFromEvent(event));
}

function workflowCanvasPointFromEvent(event) {
  if (window.WorkflowReactCanvas?.screenToFlowPosition) {
    return window.WorkflowReactCanvas.screenToFlowPosition({ x: event.clientX, y: event.clientY });
  }
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
  const from = workflowNodeById(activeWorkflowConnection?.mode === "edge-from" ? activeWorkflowConnection?.edgeFrom : activeWorkflowConnection?.fromId || "");
  if (from && !workflowCanConnectNodes(from.id, nodeId, activeWorkflowConnection?.edgeFrom ? { from: activeWorkflowConnection.edgeFrom, to: activeWorkflowConnection.edgeTo } : null)) return null;
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
  const to = workflowNodeById(activeWorkflowConnection?.edgeTo || "");
  if (to && !workflowCanConnectNodes(nodeId, to.id, { from: activeWorkflowConnection?.edgeFrom, to: activeWorkflowConnection?.edgeTo })) return null;
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

function workflowWheelZoomBlockedTarget(target) {
  return Boolean(target?.closest?.("[data-workflow-node]"));
}

function handleWorkflowWheel(event) {
  const canvas = event.target.closest?.(".workflow-canvas");
  if (!canvas || canvas.classList.contains("workflow-react-host")) return;
  if (workflowWheelZoomBlockedTarget(event.target)) return;
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
  const draggedNodeId = activeWorkflowNodeDrag.nodeId || "";
  els.workflowRoot?.querySelectorAll(".workflow-node.is-dragging").forEach((node) => node.classList.remove("is-dragging"));
  els.workflowRoot?.classList.remove("is-dragging-node");
  activeWorkflowNodeDrag = null;
  if (didMove) {
    suppressWorkflowClickNodeId = draggedNodeId;
    suppressWorkflowClickUntil = Date.now() + 80;
    setTimeout(() => {
      if (Date.now() >= suppressWorkflowClickUntil) {
        suppressWorkflowClickUntil = 0;
        suppressWorkflowClickNodeId = "";
      }
    }, 90);
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
  if (!workflowCanConnectNodes(fromId, toId)) return false;
  if (!workflow.edges.some((edge) => edge.from === fromId && edge.to === toId)) workflow.edges.push({ from: fromId, to: toId });
  state.workflowSelectedNodeId = toId;
  persistWorkflowState();
  if (window.WorkflowReactCanvas?.sync?.()) window.WorkflowReactCanvas.selectNode(toId);
  return true;
}

function reconnectWorkflowEdge(oldFromId = "", oldToId = "", nextFromId = "", nextToId = "") {
  const workflow = ensureWorkflowState();
  if (!workflowCanConnectNodes(nextFromId, nextToId, { from: oldFromId, to: oldToId })) return false;
  workflow.edges = workflow.edges.filter((edge) => !(edge.from === oldFromId && edge.to === oldToId));
  if (!workflow.edges.some((edge) => edge.from === nextFromId && edge.to === nextToId)) workflow.edges.push({ from: nextFromId, to: nextToId });
  persistWorkflowState();
  if (window.WorkflowReactCanvas?.sync?.()) window.WorkflowReactCanvas.selectNode(nextToId);
  return true;
}

function workflowGraphReaches(startId = "", targetId = "") {
  const visited = new Set();
  const queue = [startId];
  while (queue.length) {
    const current = queue.shift();
    if (!current || visited.has(current)) continue;
    if (current === targetId) return true;
    visited.add(current);
    workflowOutgoingEdges(current).forEach((edge) => queue.push(edge.to));
  }
  return false;
}

function deleteSelectedWorkflowNodes() {
  var selected = state.workflowSelectedNodeId ? [state.workflowSelectedNodeId] : [];
  if (!selected.length) return false;
  selected.forEach((nodeId) => removeWorkflowNode(nodeId));
  if (window.WorkflowReactCanvas?.sync?.()) window.WorkflowReactCanvas.selectNode(state.workflowSelectedNodeId);
  return true;
}

function removeWorkflowNode(nodeId = "", { selectFallback = false } = {}) {
  const workflow = ensureWorkflowState();
  const node = workflow.nodes.find((item) => item.id === nodeId);
  if (!node) return false;
  const incoming = workflow.edges
    .filter((edge) => edge.to === nodeId)
    .map((edge) => workflowNodeById(edge.from))
    .filter((item) => workflowNodeAcceptsOutput(item));
  const outgoing = workflow.edges
    .filter((edge) => edge.from === nodeId)
    .map((edge) => workflowNodeById(edge.to))
    .filter((item) => workflowNodeAcceptsInput(item));
  workflow.nodes = workflow.nodes.filter((item) => item.id !== nodeId);
  workflow.edges = workflow.edges.filter((edge) => edge.from !== nodeId && edge.to !== nodeId);
  const from = incoming[0];
  const to = outgoing[0];
  if (from && to && from.id !== to.id) workflow.edges.push({ from: from.id, to: to.id });
  workflow.edges = workflow.edges.filter((edge, edgeIndex, edges) => (
    edge.from && edge.to
    && edges.findIndex((item) => item.from === edge.from && item.to === edge.to) === edgeIndex
  ));
  // Normal deletion leaves nothing selected. Switching projects may explicitly
  // request a fallback so a freshly opened canvas still has a sensible target.
  state.workflowSelectedNodeId = selectFallback
    ? (workflowVideoNodes()[0]?.id || workflowImageNodes()[0]?.id || workflow.nodes[0]?.id || "")
    : "";
  persistWorkflowState();
  return true;
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
  if (event.target.closest?.(".workflow-react-host")) return;
  const edgeEl = event.target.closest?.("[data-workflow-edge-handle], [data-workflow-edge-drag]");
  if (edgeEl) {
    startWorkflowEdgeDrag(event, edgeEl);
    return;
  }
  const inputHandle = event.target.closest('[data-workflow-connect="in"]');
  if (inputHandle) {
    const inputNodeId = inputHandle.dataset.nodeId || "";
    if (workflowIncomingEdges(inputNodeId).length || !workflowAutoInputAction(workflowNodeById(inputNodeId) || {})) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    createWorkflowInputNodeAndConnect(inputNodeId);
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

