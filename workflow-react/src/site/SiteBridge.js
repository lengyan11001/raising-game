const SITE_NODE_TYPES = Object.freeze({
  image: "siteImageGeneration",
  video: "siteVideoGeneration",
});

const IMAGE_NODE_TYPES = new Set(["imageGenerate"]);
const VIDEO_NODE_TYPES = new Set(["unifiedVideoGen"]);

function siteWorkflow() {
  return typeof window.ensureWorkflowState === "function"
    ? window.ensureWorkflowState()
    : { nodes: [], edges: [] };
}

function selectSiteNode(nodeId = "") {
  if (typeof window.selectWorkflowNode === "function") {
    return window.selectWorkflowNode(String(nodeId || ""), { render: false });
  }
  // Standalone canvas builds may not include the legacy platform panel. Keep
  // React Flow selection and the persisted node contract aligned in that case.
  const workflow = siteWorkflow();
  if (!Array.isArray(workflow.nodes)) return null;
  const id = String(nodeId || "");
  if (id) return (workflow.nodes || []).find((node) => String(node.id) === id) || null;
  return null;
}

function siteNode(nodeId = "") {
  return typeof window.workflowNodeById === "function"
    ? window.workflowNodeById(nodeId)
    : (siteWorkflow().nodes || []).find((node) => node.id === nodeId) || null;
}

function isSiteGenerationNode(node = {}) {
  return IMAGE_NODE_TYPES.has(node.type) || VIDEO_NODE_TYPES.has(node.type);
}

function toReactFlowNode(node = {}, selectedNodeId = "") {
  const isVideo = VIDEO_NODE_TYPES.has(node.type);
  return {
    id: String(node.id || ""),
    type: isVideo ? SITE_NODE_TYPES.video : SITE_NODE_TYPES.image,
    selected: String(node.id || "") === String(selectedNodeId || ""),
    position: { x: Number(node.x || 0), y: Number(node.y || 0) },
    data: {
      siteNodeId: String(node.id || ""),
      siteType: node.type,
    },
    dragHandle: ".site-generation-drag-handle",
  };
}

function toReactFlowEdge(edge = {}, index = 0) {
  return {
    id: String(edge.id || `site-edge-${edge.from || "from"}-${edge.to || "to"}-${index}`),
    source: String(edge.from || ""),
    target: String(edge.to || ""),
    type: "default",
  };
}

function toReactFlowGraph(workflow = siteWorkflow()) {
  const selectedNodeId = typeof window.activeWorkflowSelectedNodeId === "function"
    ? window.activeWorkflowSelectedNodeId()
    : "";
  const nodes = (Array.isArray(workflow.nodes) ? workflow.nodes : [])
    .filter(isSiteGenerationNode)
    .map((node) => toReactFlowNode(node, selectedNodeId));
  const nodeIds = new Set(nodes.map((node) => node.id));
  const seenEdges = new Set();
  const edges = (Array.isArray(workflow.edges) ? workflow.edges : [])
    .filter((edge) => edge && edge.from && edge.to
      && nodeIds.has(String(edge.from)) && nodeIds.has(String(edge.to))
      && String(edge.from) !== String(edge.to))
    .filter((edge) => {
      const key = `${edge.from}->${edge.to}`;
      if (seenEdges.has(key)) return false;
      seenEdges.add(key);
      return true;
    })
    .map(toReactFlowEdge);
  return { nodes, edges };
}

function writeNodePositions(nodes = []) {
  const workflow = siteWorkflow();
  const byId = new Map((workflow.nodes || []).map((node) => [node.id, node]));
  let changed = false;
  nodes.forEach((reactNode) => {
    const node = byId.get(reactNode.id);
    if (!node) return;
    const x = Math.round(Number(reactNode.position?.x || 0));
    const y = Math.round(Number(reactNode.position?.y || 0));
    if (Number(node.x) !== x || Number(node.y) !== y) {
      node.x = x;
      node.y = y;
      changed = true;
    }
  });
  if (changed && typeof window.persistWorkflowState === "function") {
    window.persistWorkflowState();
  }
  return changed;
}

function writeEdges(edges = []) {
  const workflow = siteWorkflow();
  const nextEdges = edges
    .filter((edge) => edge && edge.source && edge.target)
    .map((edge) => ({ from: String(edge.source), to: String(edge.target) }));
  const signature = (items) => (items || []).map((edge) => `${edge.from}->${edge.to}`).sort().join("|");
  if (signature(workflow.edges) === signature(nextEdges)) return false;
  const affectedTargets = new Set([
    ...(Array.isArray(workflow.edges) ? workflow.edges : []).map((edge) => String(edge.to || "")),
    ...nextEdges.map((edge) => String(edge.to || "")),
  ].filter(Boolean));
  workflow.edges = nextEdges;
  if (typeof window.persistWorkflowState === "function") window.persistWorkflowState();
  affectedTargets.forEach((nodeId) => {
    window.dispatchEvent(new CustomEvent("workflow-react-node-change", { detail: { nodeId } }));
  });
  return true;
}

function writeReactFlowGraph(nodes = [], edges = []) {
  const positions = writeNodePositions(nodes);
  const graph = writeEdges(edges);
  return positions || graph;
}

function readCanvasViewport() {
  const viewport = siteWorkflow().viewport || {};
  const x = Number(viewport.x);
  const y = Number(viewport.y);
  const zoom = Number(viewport.zoom);
  return Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(zoom) && zoom > 0
    ? { x, y, zoom }
    : null;
}

function writeCanvasViewport(viewport = {}) {
  const x = Number(viewport.x);
  const y = Number(viewport.y);
  const zoom = Number(viewport.zoom);
  if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(zoom) || zoom <= 0) return false;
  const workflow = siteWorkflow();
  const previous = workflow.viewport || {};
  if (Math.abs(Number(previous.x) - x) < 0.01
    && Math.abs(Number(previous.y) - y) < 0.01
    && Math.abs(Number(previous.zoom) - zoom) < 0.001) return false;
  workflow.viewport = { x, y, zoom };
  if (typeof window.persistWorkflowState === "function") {
    window.clearTimeout(window.__workflowViewportPersistTimer);
    window.__workflowViewportPersistTimer = window.setTimeout(() => {
      window.__workflowViewportPersistTimer = 0;
      window.persistWorkflowState();
    }, 300);
  }
  return true;
}

function notifyNodeChanged(nodeId = "") {
  const workflow = siteWorkflow();
  const node = (workflow.nodes || []).find((item) => item.id === nodeId);
  if (node && typeof window.persistWorkflowState === "function") window.persistWorkflowState();
  window.dispatchEvent(new CustomEvent("workflow-react-node-change", { detail: { nodeId } }));
}

function canConnect(sourceId = "", targetId = "") {
  return typeof window.workflowCanConnectNodes === "function"
    ? Boolean(window.workflowCanConnectNodes(sourceId, targetId))
    : false;
}

function addSiteNode(kind = "image", position = null) {
  if (typeof window.addWorkflowNodeAt !== "function") return "";
  return window.addWorkflowNodeAt(kind === "video" ? "add-video" : "add-image", position);
}

function runSiteNode(nodeId = "") {
  return typeof window.runWorkflowSingleNode === "function"
    ? window.runWorkflowSingleNode(nodeId)
    : null;
}

function updateSiteNode(nodeId = "", patch = {}) {
  const node = siteNode(nodeId);
  if (!node) return null;
  node.data = { ...(node.data || {}), ...patch };
  if (typeof window.persistWorkflowState === "function") window.persistWorkflowState();
  window.dispatchEvent(new CustomEvent("workflow-react-node-change", { detail: { nodeId } }));
  return node;
}

function deleteSiteNode(nodeId = "") {
  if (typeof window.removeWorkflowNode !== "function") return false;
  const removed = Boolean(window.removeWorkflowNode(nodeId));
  if (removed) notifyNodeChanged("");
  return removed;
}

export {
  SITE_NODE_TYPES,
  toReactFlowGraph,
  writeReactFlowGraph,
  readCanvasViewport,
  writeCanvasViewport,
  writeNodePositions,
  writeEdges,
  siteNode,
  siteWorkflow,
  notifyNodeChanged,
  canConnect,
  selectSiteNode,
  addSiteNode,
  runSiteNode,
  updateSiteNode,
  deleteSiteNode,
};
