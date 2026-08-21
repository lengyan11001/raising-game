const WORKFLOW_CANVAS_LIMIT = 50;
const WORKFLOW_CANVAS_NAME_LIMIT = 80;
const WORKFLOW_CANVAS_NODE_LIMIT = 100;
const WORKFLOW_CANVAS_EDGE_LIMIT = 200;
const WORKFLOW_DIRECTOR_PROMPT_LIMIT = 6000;
const WORKFLOW_CANVAS_PAYLOAD_BYTES = 64 * 1024 * 1024;

// New canvases start empty. Nodes are added explicitly, as in the reference editor.
const DEFAULT_NODES = Object.freeze([]);
const DEFAULT_EDGES = Object.freeze([]);

function plainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function boundedNumber(value, fallback, min, max) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.max(min, Math.min(max, numeric));
}

function safeJsonClone(value, fallback = {}) {
  try {
    const json = JSON.stringify(value);
    if (Buffer.byteLength(json, "utf8") > WORKFLOW_CANVAS_PAYLOAD_BYTES) {
      throw new Error("Workflow canvas is too large.");
    }
    return JSON.parse(json);
  } catch (error) {
    if (error?.message === "Workflow canvas is too large.") throw error;
    return fallback;
  }
}

function normalizeWorkflowCanvasName(value = "", fallback = "Untitled workflow") {
  return String(value || "").trim().slice(0, WORKFLOW_CANVAS_NAME_LIMIT) || fallback;
}

function defaultWorkflowCanvasState() {
  return {
    nodes: DEFAULT_NODES.map((node) => ({ ...node, data: { ...node.data } })),
    edges: DEFAULT_EDGES.map((edge) => ({ ...edge })),
    physics: [],
    directorPrompt: "",
    zoom: 1,
    layoutVersion: 6,
    canvasWidth: 3200,
    canvasHeight: 720,
    scrollLeft: 0,
    scrollTop: 0,
  };
}

function normalizeWorkflowCanvasState(value = {}) {
  if (!plainObject(value)) throw new Error("Workflow canvas must be an object.");
  const nodes = Array.isArray(value.nodes) ? value.nodes : [];
  const edges = Array.isArray(value.edges) ? value.edges : [];
  if (nodes.length > WORKFLOW_CANVAS_NODE_LIMIT) throw new Error(`Workflow canvas supports up to ${WORKFLOW_CANVAS_NODE_LIMIT} nodes.`);
  if (edges.length > WORKFLOW_CANVAS_EDGE_LIMIT) throw new Error(`Workflow canvas supports up to ${WORKFLOW_CANVAS_EDGE_LIMIT} edges.`);

  const normalizedNodes = nodes.map((node, index) => {
    if (!plainObject(node)) throw new Error(`Workflow node ${index + 1} is invalid.`);
    const id = String(node.id || "").trim().slice(0, 120);
    if (!id) throw new Error(`Workflow node ${index + 1} is missing an id.`);
    return {
      ...safeJsonClone(node, {}),
      id,
      type: String(node.type || "video").trim().slice(0, 40) || "video",
      title: String(node.title || "Node").trim().slice(0, 120) || "Node",
      x: boundedNumber(node.x, 0, -20000, 20000),
      y: boundedNumber(node.y, 0, -20000, 20000),
      data: plainObject(node.data) ? safeJsonClone(node.data, {}) : {},
    };
  });
  const nodeIds = new Set(normalizedNodes.map((node) => node.id));
  if (nodeIds.size !== normalizedNodes.length) throw new Error("Workflow node ids must be unique.");
  const normalizedEdges = edges
    .map((edge) => ({ from: String(edge?.from || "").trim().slice(0, 120), to: String(edge?.to || "").trim().slice(0, 120) }))
    .filter((edge) => edge.from && edge.to && edge.from !== edge.to && nodeIds.has(edge.from) && nodeIds.has(edge.to));

  const state = {
    nodes: normalizedNodes,
    edges: normalizedEdges,
    physics: Array.from(new Set((Array.isArray(value.physics) ? value.physics : []).map((item) => String(item || "").trim().slice(0, 80)).filter(Boolean))).slice(0, 3),
    directorPrompt: String(value.directorPrompt || "").slice(0, WORKFLOW_DIRECTOR_PROMPT_LIMIT),
    zoom: boundedNumber(value.zoom, 1, 0.55, 1.8),
    layoutVersion: Math.max(0, Math.min(100, Math.trunc(Number(value.layoutVersion || 0) || 0))),
    canvasWidth: boundedNumber(value.canvasWidth, 3200, 3200, 12000),
    canvasHeight: boundedNumber(value.canvasHeight, 720, 720, 3200),
    scrollLeft: boundedNumber(value.scrollLeft, 0, 0, 12000),
    scrollTop: boundedNumber(value.scrollTop, 0, 0, 3200),
  };
  safeJsonClone(state);
  return state;
}

function publicWorkflowCanvasView(record = {}) {
  return {
    id: String(record.id || "").trim(),
    name: normalizeWorkflowCanvasName(record.name),
    workflow: normalizeWorkflowCanvasState(record.workflow || defaultWorkflowCanvasState()),
    createdAt: String(record.createdAt || record.created_at || "").trim(),
    updatedAt: String(record.updatedAt || record.updated_at || "").trim(),
  };
}

function publicWorkflowCanvasSummary(record = {}) {
  return {
    id: String(record.id || "").trim(),
    name: normalizeWorkflowCanvasName(record.name),
    createdAt: String(record.createdAt || record.created_at || "").trim(),
    updatedAt: String(record.updatedAt || record.updated_at || "").trim(),
  };
}

module.exports = {
  WORKFLOW_CANVAS_LIMIT,
  WORKFLOW_CANVAS_NAME_LIMIT,
  WORKFLOW_CANVAS_NODE_LIMIT,
  WORKFLOW_CANVAS_EDGE_LIMIT,
  defaultWorkflowCanvasState,
  normalizeWorkflowCanvasName,
  normalizeWorkflowCanvasState,
  publicWorkflowCanvasSummary,
  publicWorkflowCanvasView,
};
