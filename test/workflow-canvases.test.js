const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

function extractFunction(source, name) {
  const start = source.indexOf(`function ${name}(`);
  assert.ok(start >= 0, `${name} exists`);
  const next = source.indexOf("\nfunction ", start + 1);
  assert.ok(next > start, `${name} has a following function`);
  return source.slice(start, next).trim();
}

test("workflow canvas state is normalized and bounded", () => {
  const {
    defaultWorkflowCanvasState,
    normalizeWorkflowCanvasName,
    normalizeWorkflowCanvasState,
  } = require("../workflow-canvases");

  const initial = defaultWorkflowCanvasState();
  assert.equal(initial.nodes.length, 0);
  assert.equal(initial.edges.length, 0);
  assert.equal(initial.layoutVersion, 7);
  assert.equal(normalizeWorkflowCanvasName("  My workflow  "), "My workflow");
  assert.equal(normalizeWorkflowCanvasName(" "), "Untitled workflow");

  const normalized = normalizeWorkflowCanvasState({
    ...initial,
    zoom: 99,
    directorPrompt: "x".repeat(7000),
    canvasWidth: 8000,
    canvasHeight: 1800,
    scrollLeft: 2400,
    scrollTop: 320,
    viewport: { x: -123.5, y: 44, zoom: 0.73 },
  });
  assert.equal(normalized.zoom, 1.8);
  assert.equal(normalized.directorPrompt.length, 6000);
  assert.equal(normalized.canvasWidth, 8000);
  assert.equal(normalized.canvasHeight, 1800);
  assert.equal(normalized.scrollLeft, 2400);
  assert.equal(normalized.scrollTop, 320);
  assert.deepEqual(normalized.viewport, { x: -123.5, y: 44, zoom: 0.73 });
  assert.throws(
    () => normalizeWorkflowCanvasState({ ...initial, nodes: Array.from({ length: 101 }, (_, index) => ({ id: `n-${index}` })) }),
    /100 nodes/,
  );
});

test("workflow canvas writes reject embedded media and oversized payloads", () => {
  const {
    WORKFLOW_CANVAS_WRITE_PAYLOAD_BYTES,
    defaultWorkflowCanvasState,
    validateWorkflowCanvasForWrite,
  } = require("../workflow-canvases");

  const initial = defaultWorkflowCanvasState();
  assert.equal(validateWorkflowCanvasForWrite(initial), initial);
  assert.throws(
    () => validateWorkflowCanvasForWrite({
      ...initial,
      nodes: [{ id: "source", data: { imageUrl: "data:image/png;base64,aGVsbG8=" } }],
    }),
    (error) => error.code === "WORKFLOW_EMBEDDED_MEDIA_NOT_ALLOWED" && error.statusCode === 400,
  );
  assert.throws(
    () => validateWorkflowCanvasForWrite({ ...initial, directorPrompt: "x".repeat(WORKFLOW_CANVAS_WRITE_PAYLOAD_BYTES) }),
    (error) => error.code === "WORKFLOW_CANVAS_TOO_LARGE" && error.statusCode === 413,
  );
});

test("workflow canvas database operations are owner scoped", () => {
  const db = read("db.js");

  assert.match(db, /pool\.on\("error", \(error\) =>/);
  assert.match(db, /\[db-pool-error\]/);
  assert.match(db, /CREATE TABLE IF NOT EXISTS app_workflow_canvases/);
  assert.match(db, /CREATE INDEX IF NOT EXISTS app_workflow_canvases_user_updated_idx ON app_workflow_canvases \(user_id, updated_at DESC/);
  assert.match(db, /SELECT id, user_id, name, payload, created_at, updated_at FROM app_workflow_canvases/);
  assert.match(db, /function workflowCanvasFromRow/);
  assert.match(db, /WHERE id = \$1 AND user_id = \$2/);
  assert.match(db, /DELETE FROM app_workflow_canvases[\s\S]*?WHERE id = \$1 AND user_id = \$2/);
});

test("workflow canvas CRUD is authenticated and unavailable on tool tenants", () => {
  const server = read("server.js");

  assert.match(server, /async function handleListWorkflowCanvases/);
  assert.match(server, /async function handleCreateWorkflowCanvas/);
  assert.match(server, /async function handleUpdateWorkflowCanvas/);
  assert.match(server, /async function handleDeleteWorkflowCanvas/);
  assert.match(server, /if \(requestTenantDescriptor\(req\)\.toolOnly\) return sendJson\(res, 404/);
  assert.match(server, /url\.pathname === "\/api\/workflow\/canvases"/);
  assert.ok(server.includes("const workflowCanvasMatch = url.pathname.match(/^\\/api\\/workflow\\/canvases\\/([^/]+)\\/?$/);"));
  assert.match(server, /WORKFLOW_CANVAS_LIMIT/);
});

test("workflow canvas API requests reuse the site bearer token", async () => {
  const source = read("workflow-react/src/components/workflow/canvasApi.js")
    .replace("export async function requestCanvasJson", "async function requestCanvasJson");
  const module = { exports: {} };
  let request = null;
  const window = {
    localStorage: {
      getItem(key) {
        assert.equal(key, "raisingGameToken");
        return "site-session-token";
      },
    },
  };
  const fetch = async (path, options) => {
    request = { path, options };
    return {
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ ok: true, canvases: [] }),
    };
  };

  new Function("window", "fetch", "module", "exports", `${source}\nmodule.exports.requestCanvasJson = requestCanvasJson;`)(window, fetch, module, module.exports);
  const payload = await module.exports.requestCanvasJson("/api/workflow/canvases", {
    method: "post",
    headers: { "X-Canvas-Test": "1" },
    body: { name: "test" },
  });

  assert.deepEqual(payload, { ok: true, canvases: [] });
  assert.equal(request.path, "/api/workflow/canvases");
  assert.equal(request.options.method, "POST");
  assert.equal(request.options.credentials, "include");
  assert.equal(request.options.headers.Authorization, "Bearer site-session-token");
  assert.equal(request.options.headers["X-Canvas-Test"], "1");
  assert.equal(request.options.headers["Content-Type"], "application/json");
  assert.equal(request.options.body, JSON.stringify({ name: "test" }));
});

test("workflow canvas API surfaces a missing-token rejection", async () => {
  const source = read("workflow-react/src/components/workflow/canvasApi.js")
    .replace("export async function requestCanvasJson", "async function requestCanvasJson");
  const module = { exports: {} };
  const window = { localStorage: { getItem: () => "" } };
  const fetch = async () => ({
    ok: false,
    status: 401,
    text: async () => JSON.stringify({ ok: false, message: "Please sign in to continue" }),
  });

  new Function("window", "fetch", "module", "exports", `${source}\nmodule.exports.requestCanvasJson = requestCanvasJson;`)(window, fetch, module, module.exports);
  await assert.rejects(
    module.exports.requestCanvasJson("/api/workflow/canvases"),
    /Please sign in to continue/,
  );
});

test("workflow canvas UI supports selection, create, save and delete", () => {
  const loader = read("platform.js");
  const manager = read("platform.workflow-canvases.js");
  const ui = read("platform.ui.js");
  const explore = read("platform.explore.js");

  assert.match(loader, /"platform\.workflow-canvases\.js"/);
  assert.match(loader, /"workflow-react\/dist\/canvas\.js"/);
  assert.doesNotMatch(loader, /"platform\.workflow-react\.js"/);
  assert.match(manager, /function loadWorkflowCanvases/);
  assert.doesNotMatch(manager, /migrateLegacyWorkflowCanvas|legacyWorkflowCanvasValue/);
  assert.match(manager, /function scheduleWorkflowCanvasSave/);
  assert.match(manager, /function createWorkflowCanvas/);
  assert.match(manager, /function saveWorkflowCanvas/);
  assert.match(manager, /state\.workflowCanvasSavePromise/);
  assert.match(manager, /while \(state\.workflowCanvasSaveQueued/);
  assert.match(manager, /function deleteWorkflowCanvas/);
  assert.match(manager, /function migrateWorkflowNodeGraph/);
  assert.match(manager, /button\.disabled/);
  assert.match(manager, /function renderWorkflowCanvasList/);
  assert.match(manager, /data-workflow-open-canvas/);
  assert.match(manager, /data-workflow-delete-canvas/);
  assert.match(manager, /function renderWorkflowCanvasManager/);
  assert.match(manager, /data-workflow-canvas-action="back"/);
  assert.match(manager, /data-workflow-canvas-action="save"/);
  assert.match(manager, /data-workflow-canvas-action="new"/);
  assert.match(ui, /scheduleWorkflowCanvasSave\(\);/);
  assert.match(explore, /loadWorkflowCanvases\(\)/);
});

test("workflow saving uses one serialized path and retries transient conflicts", () => {
  const canvas = read("workflow-react/src/components/canvas/Canvas.js");
  const editor = read("workflow-react/src/components/workflow/WorkflowEditor.js");
  const manager = read("platform.workflow-canvases.js");

  assert.doesNotMatch(canvas, /useDebouncedCallback/);
  assert.doesNotMatch(canvas, /debouncedSave/);
  assert.match(editor, /window\.saveWorkflowCanvasNow\(\{ name: titleRef\.current \}\)/);
  assert.doesNotMatch(editor, /requestCanvasJson\(`\/api\/workflow\/canvases/);
  assert.match(manager, /const WORKFLOW_CANVAS_SAVE_DELAY_MS = 3000/);
  assert.match(manager, /WORKFLOW_CANVAS_UPDATE_IN_PROGRESS/);
  assert.match(manager, /error\.statusCode === 429/);
  assert.match(manager, /WORKFLOW_CANVAS_SAVE_RETRY_DELAY_MS/);
  assert.match(manager, /window\.saveWorkflowCanvasNow =/);
});

test("video prompt exposes connected media in an @ mention picker", () => {
  const videoNode = read("workflow-react/src/components/canvas/siteNodes/SiteVideoGenerationNode.js");
  const picker = read("workflow-react/src/components/canvas/siteNodes/PromptMentionTextarea.js");
  const css = read("workflow-react/src/site/site.css");

  assert.match(videoNode, /PromptMentionTextarea/);
  assert.match(videoNode, /alias: `image\$\{index \+ 1\}`/);
  assert.match(videoNode, /alias: `video\$\{index \+ 1\}`/);
  assert.match(picker, /lastIndexOf\('@'/);
  assert.match(picker, /ArrowDown/);
  assert.match(picker, /ArrowUp/);
  assert.match(picker, /insertMention/);
  assert.match(picker, /@\$\{alias\}/);
  assert.match(picker, /role="listbox"/);
  assert.match(picker, /onPointerDown=\{\(event\) => event\.stopPropagation\(\)\}/);
  assert.match(css, /\.site-prompt-mentions/);
  assert.match(css, /\.site-prompt-mention\.is-active/);
});

test("canvas media controls open an in-app preview without download links", () => {
  const preview = read("workflow-react/src/components/canvas/siteNodes/MediaPreview.js");
  const results = read("workflow-react/src/components/canvas/siteNodes/GenerationResultMedia.js");
  const upload = read("workflow-react/src/components/canvas/siteNodes/SiteNodeUpload.js");
  const css = read("workflow-react/src/site/site.css");

  assert.match(preview, /site-media-preview-overlay/);
  assert.match(preview, /createPortal/);
  assert.match(preview, /event\.preventDefault\(\)/);
  assert.match(preview, /event\.stopPropagation\(\)/);
  assert.match(preview, /onContextMenu=\{\(event\) => event\.preventDefault\(\)\}/);
  assert.match(preview, /if \(event\.key === 'Escape'\) onClose\(\)/);
  assert.match(results, /MediaPreviewTrigger/);
  assert.match(results, /useMediaPreview/);
  assert.doesNotMatch(results, /<a\b/);
  assert.doesNotMatch(results, /href=/);
  assert.doesNotMatch(results, /target="_blank"/);
  assert.match(upload, /MediaPreviewTrigger/);
  assert.doesNotMatch(upload, /<a\b/);
  assert.doesNotMatch(upload, /href=/);
  assert.match(css, /\.site-media-preview-overlay/);
  assert.match(css, /\.site-media-preview-frame video/);
  assert.match(css, /\.site-node-upload-thumbs \.site-media-preview-trigger[\s\S]*?width: 36px;[\s\S]*?height: 36px;/);
  assert.match(css, /\.site-node-upload-progress/);
  assert.match(css, /\.site-generation-uploading-track/);
  assert.match(css, /\.site-media-preview-stage \{[\s\S]*?width: min\(960px, calc\(100vw - 48px\)\)/);
  assert.match(css, /\.site-media-preview-stage \{[\s\S]*?height: min\(680px, calc\(100vh - 80px\)\)/);
  assert.match(css, /@media \(max-width: 640px\)/);
  assert.match(preview, /site-media-preview-frame/);
  assert.match(preview, /export function fitPreviewDimensions/);
  assert.match(preview, /if \(!size \|\| typeof size !== 'object'\) return null/);
  assert.match(preview, /onLoadedMetadata=\{rememberMediaSize\}/);
  assert.match(preview, /onLoadedData=\{rememberMediaSize\}/);
  assert.match(preview, /onLoad=\{rememberMediaSize\}/);
  assert.match(preview, /data-preview-width/);
  assert.match(css, /\.site-media-preview-frame\.has-size/);
  assert.match(css, /\.site-image-result img \{[\s\S]*?width: auto;[\s\S]*?max-width: 100%;[\s\S]*?max-height: min\(360px, 42vh\);[\s\S]*?aspect-ratio: auto;[\s\S]*?object-fit: contain;/);
  assert.doesNotMatch(css, /\.site-image-result img \{[\s\S]*?aspect-ratio: 1 \/ 1;/);
  assert.match(css, /\.site-generation-result \{[\s\S]*?min-height: 190px;[\s\S]*?overflow: visible;/);
  assert.doesNotMatch(css, /\.site-generation-result \{[\s\S]*?max-height: 210px;/);
  assert.match(css, /\.site-media-preview-close \{[\s\S]*?position: absolute;[\s\S]*?top: 10px;[\s\S]*?right: 10px;/);
});

test("workflow generation runs concurrently per node", () => {
  const config = read("platform.config.js");
  const nodeUi = read("platform.ui.parts/part-05.js");
  const runner = read("platform.ui.parts/part-06.js");

  assert.match(config, /workflowRunningNodeIds: \[\]/);
  assert.match(nodeUi, /function workflowNodeIsRunning/);
  assert.match(nodeUi, /workflowRunningNodeIds\.includes/);
  assert.doesNotMatch(nodeUi, /if \(state\.workflowRunning\) \{\s*return \{ canRun: false/);
  assert.match(runner, /workflowRunningNodeIds = \[\.\.\.new Set/);
  assert.match(runner, /filter\(\(id\) => id !== String\(runNode\.id\)\)/);
});

test("workflow uploads store asset references instead of embedded media", () => {
  const ui = read("platform.ui.js");
  const part = read("platform.ui.parts/part-05.js");
  const manager = read("platform.workflow-canvases.js");
  const server = read("server.js");

  assert.match(ui, /async function uploadWorkflowMediaDataUrl/);
  assert.match(ui, /async function migrateWorkflowEmbeddedMedia/);
  assert.match(part, /async function refreshWorkflowUploadedMediaUrls/);
  assert.match(part, /\/api\/user-assets\/resolve/);
  assert.match(part, /body: \{ assetIds \}/);
  assert.match(part, /data\.source !== "upload"/);
  assert.match(part, /resultImageAssetId/);
  assert.match(part, /resultVideoAssetId/);
  assert.match(part, /resultImageUrl: url/);
  assert.match(part, /resultVideoUrl: url/);
  assert.match(manager, /refreshWorkflowUploadedMediaUrls/);
  assert.match(manager, /if \(migrated \|\| refreshed\) await saveWorkflowCanvas/);
  assert.match(ui, /publicUrl \|\| asset\?\.localUrl/);
  assert.doesNotMatch(ui, /values\.push\(await readFileAsDataUrl\(file\)\)/);
  assert.match(server, /readJson\(req, WORKFLOW_CANVAS_WRITE_PAYLOAD_BYTES\)/);
  assert.match(server, /validateWorkflowCanvasForWrite\(body\.workflow\)/);
  assert.match(server, /canvas: publicWorkflowCanvasSummary\(canvas\)/);
  assert.match(server, /workflowCanvasUpdatesInFlight\.has\(updateKey\)/);
  assert.match(server, /WORKFLOW_CANVAS_UPDATE_IN_PROGRESS/);
});

test("react canvas activation refreshes uploaded media before opening", async () => {
  const vm = require("node:vm");
  const manager = read("platform.workflow-canvases.js");
  const events = [];
  const loadedCanvas = {
    id: "canvas-expired-assets",
    workflow: { nodes: [{ id: "uploaded", data: { source: "upload", resultImageAssetId: "asset-1" } }] },
  };
  const context = vm.createContext({
    state: {},
    beginWorkflowCanvasLoad: () => 42,
    setActiveWorkflowCanvas: (canvas, options) => {
      events.push(`activate:${canvas.id}:${options.requestSeq}`);
      return true;
    },
    workflowCanvasLoadIsCurrent: (seq) => seq === 42,
    migrateWorkflowEmbeddedMedia: async () => {
      events.push("migrate");
      return false;
    },
    refreshWorkflowUploadedMediaUrls: async () => {
      events.push("refresh");
      loadedCanvas.workflow.nodes[0].data.resultImageUrl = "https://cdn.example/fresh.png";
      return true;
    },
    saveWorkflowCanvas: async () => {
      events.push("save");
    },
  });
  const activationStart = manager.indexOf("async function activateWorkflowCanvasProject(");
  const activationEnd = manager.indexOf("\nfunction deactivateWorkflowCanvasProject(", activationStart);
  assert.ok(activationStart >= 0 && activationEnd > activationStart, "activateWorkflowCanvasProject is extractable");
  vm.runInContext(`${manager.slice(activationStart, activationEnd)}
this.activateWorkflowCanvasProject = activateWorkflowCanvasProject;`, context);

  const activated = await context.activateWorkflowCanvasProject(loadedCanvas);

  assert.equal(activated, true);
  assert.deepEqual(events, ["activate:canvas-expired-assets:42", "migrate", "refresh", "save"]);
  assert.equal(loadedCanvas.workflow.nodes[0].data.resultImageUrl, "https://cdn.example/fresh.png");
});

test("react project bridge waits for canvas activation and media refresh", () => {
  const index = read("workflow-react/src/index.js");
  assert.match(index, /const activated = await window\.activateWorkflowCanvasProject\(canvas\);/);
  assert.match(index, /const activated = await window\.activateWorkflowCanvasProject\(\{ \.\.\.canvas, workflow \}\);/);
});

test("workflow rerenders preserve the viewport without a side panel", () => {
  const ui = read("platform.ui.js");
  const part = read("platform.ui.parts/part-05.js");
  const main = read("platform.main.js");
  const css = read("platform.css");

  assert.match(ui, /function captureWorkflowCanvasViewport/);
  assert.match(ui, /function restoreWorkflowCanvasViewport/);
  assert.match(part, /if \(!window\.WorkflowReactCanvas\?\.mount\) \{[\s\S]*?画布组件未能加载/);
  assert.doesNotMatch(part, /restoreWorkflowCanvasViewport\(viewport\;[\s\S]*?revealWorkflowNode/);
  assert.match(part, /window\.WorkflowReactCanvas\.isMounted\?\.\(reactHost\)/);
  assert.match(ui, /Math\.max\(WORKFLOW_CANVAS_BASE_WIDTH, storedWidth/);
  assert.doesNotMatch(ui, /<aside class="workflow-side">/);
  assert.doesNotMatch(ui, /data-workflow-action="toggle-details"/);
  assert.match(css, /\.workflow-shell \{[\s\S]*?height: 100%;[\s\S]*?grid-template-rows: auto auto minmax\(0, 1fr\)/);
  assert.match(css, /\.workflow-layout \{[\s\S]*?grid-template-columns: minmax\(0, 1fr\)/);
  assert.match(css, /\.workflow-canvas \{[\s\S]*?height: 100%/);
  assert.match(ui, /if \(Date\.now\(\) < suppressWorkflowViewportSaveUntil\) return/);
  assert.match(main, /addEventListener\("scroll", handleWorkflowCanvasScroll, \{ capture: true, passive: true \}\)/);
});

test("workflow add and delete actions remain responsive after dragging", () => {
  const ui = read("platform.ui.js");
  const part = read("platform.ui.parts/part-05.js");

  assert.match(ui, /function revealWorkflowNode/);
  assert.match(part, /window\.WorkflowReactCanvas\?\.sync\?\.\(\)/);
  assert.doesNotMatch(part, /async function handleWorkflowFileInput[\s\S]{0,900}?renderWorkflowPanel\(/);
  assert.match(ui, /suppressWorkflowClickUntil = Date\.now\(\) \+ 80/);
  assert.doesNotMatch(ui, /suppressWorkflowClickUntil = Date\.now\(\) \+ 250/);
});

test("workflow toolbar exposes only back, save, and new controls", () => {
  const ui = read("platform.ui.parts/part-04.js");
  const manager = read("platform.workflow-canvases.js");

  assert.match(manager, /data-workflow-canvas-action="back"/);
  assert.match(manager, /data-workflow-canvas-action="save"/);
  assert.match(manager, /data-workflow-canvas-action="new"/);
  assert.doesNotMatch(manager, /data-workflow-action="add-image"/);
  assert.doesNotMatch(manager, /data-workflow-action="add-video"/);
  assert.doesNotMatch(ui, /data-workflow-action="add-image-reference"/);
  assert.doesNotMatch(ui, /data-workflow-action="add-video-reference"/);
  assert.doesNotMatch(ui, /data-workflow-action="add-prompt"/);
  assert.doesNotMatch(ui, /data-workflow-action="add-output"/);
});

test("workflow canvas loading cannot overwrite edits made while the request is in flight", () => {
  const manager = read("platform.workflow-canvases.js");
  const ui = read("platform.ui.parts/part-04.js");
  const part = read("platform.ui.parts/part-05.js");
  const drop = read("platform.ui.parts/part-06.js");
  const canvas = read("workflow-react/src/components/canvas/Canvas.js");
  const bridge = read("workflow-react/src/site/SiteBridge.js");

  assert.match(ui, /function markWorkflowCanvasLocalEdit\(\)/);
  assert.match(ui, /state\.workflowLocalRevision = Number\(state\.workflowLocalRevision \|\| 0\) \+ 1/);
  assert.match(ui, /function persistWorkflowState[\s\S]*?markWorkflowCanvasLocalEdit\(\)/);
  assert.match(manager, /function beginWorkflowCanvasLoad\(\)[\s\S]*?state\.workflowCanvasLoadSeq = loadSeq/);
  assert.match(manager, /function workflowCanvasLoadIsCurrent\(loadSeq = 0\)/);
  assert.match(manager, /const startRevision = Number\(state\.workflowLocalRevision \|\| 0\)/);
  assert.match(manager, /if \(!workflowCanvasLoadIsCurrent\(loadSeq\)\) return/);
  assert.match(manager, /const preserveLocalEdits = Number\(state\.workflowLocalRevision \|\| 0\) !== startRevision/);
  assert.match(manager, /setActiveWorkflowCanvas\(canvas, \{ preserveLocalEdits, baselineWorkflow, requestSeq: switchSeq \}\)/);
  assert.match(manager, /mergeWorkflowCanvasWithLocalEdits\(canvas\.workflow, previousWorkflow, baselineWorkflow\)/);
  assert.match(manager, /requestSeq: switchSeq/);
  assert.match(manager, /if \(requestSeq && !workflowCanvasLoadIsCurrent\(requestSeq\)\) return false/);
  assert.match(manager, /switchSeq = beginWorkflowCanvasLoad\(\)/);
  assert.match(manager, /const deleteSeq = beginWorkflowCanvasLoad\(\)/);
  assert.match(manager, /state\.workflowSelectedNodeId = ""/);
  assert.match(part, /window\.markWorkflowCanvasLocalEdit\(\)/);
  assert.doesNotMatch(part, /WorkflowReactCanvas\?\.captureViewport/);
  assert.match(part, /window\.WorkflowReactCanvas\.isMounted\?\.\(reactHost\)/);
  assert.match(part, /async function uploadWorkflowFilesToNode\(files = \[\], nodeId = ""\)/);
  assert.doesNotMatch(part, /async function uploadWorkflowFilesToNode[\s\S]{0,1800}?renderWorkflowPanel\(/);
  assert.doesNotMatch(part, /async function handleWorkflowFileInput[\s\S]{0,1200}?renderWorkflowPanel\(/);
  assert.match(part, /uploadWorkflowFile\(file, node\.id\)/);
  assert.match(drop, /window\.uploadWorkflowFilesToNode\(files, nodeId\)/);
  assert.doesNotMatch(drop, /uploadPending: true/);
  assert.match(bridge, /function readCanvasViewport\(\)/);
  assert.match(bridge, /function writeCanvasViewport\(viewport = \{\}\)/);
  assert.match(canvas, /const viewportRef = useRef\(readCanvasViewport\(\)\)/);
  assert.match(canvas, /const shouldAutoFitInitialGraphRef = useRef\(initialNodes\.length > 0\)/);
  assert.match(canvas, /if \(!shouldAutoFitInitialGraphRef\.current \|\| !nodesRef\.current\.length \|\| viewportRef\.current\) return undefined/);
  assert.match(canvas, /const fitCanvasSafely = useCallback/);
  assert.match(canvas, /onMoveEnd=\{\(_, viewport\) =>/);
  assert.match(canvas, /fitView=\{false\}/);
  assert.match(canvas, /defaultViewport=\{viewportRef\.current \|\| \{ x: 0, y: 0, zoom: 1 \}\}/);
  assert.match(canvas, /workflow-react:sync/);
  assert.doesNotMatch(canvas, /ReactDOM\.render/);
});

test("workflow canvas merge preserves local uploads, new nodes, and new edges", () => {
  const vm = require("node:vm");
  const source = read("platform.workflow-canvases.js");
  const context = vm.createContext({
    state: {
      user: { id: "test-user" },
      workflowCanvases: [],
      workflowActiveCanvasId: "canvas-1",
      workflowCanvasLoadSeq: 2,
      workflowCanvasSaveTimer: 0,
      workflowCanvasSaveQueued: false,
      workflowViewportSaveTimer: 0,
      workflow: null,
    },
    window: { clearTimeout() {} },
    localStorage: { getItem() { return ""; }, setItem() {}, removeItem() {} },
    WORKFLOW_STORAGE_KEY: "raisingGameWorkflowState",
    WORKFLOW_NODE_LAYOUT_VERSION: 7,
    WORKFLOW_NODE_WIDTH: 300,
    WORKFLOW_NODE_GAP: 60,
    WORKFLOW_CANVAS_BASE_WIDTH: 3200,
    WORKFLOW_CANVAS_BASE_HEIGHT: 720,
    normalizeWorkflowZoom(value) { return Number(value || 1); },
    captureWorkflowCanvasViewport() { return { left: 0, top: 0 }; },
    ensureWorkflowState() { return context.state.workflow; },
    cloneWorkflowDefault() { return { nodes: [], edges: [] }; },
    persistWorkflowState() {},
    renderWorkflowPanel() {},
  });
  vm.runInContext(`${source}\nthis.mergeWorkflowCanvasWithLocalEdits = mergeWorkflowCanvasWithLocalEdits;\nthis.setActiveWorkflowCanvas = setActiveWorkflowCanvas;\nthis.workflowCanvasGraphSignature = workflowCanvasGraphSignature;`, context);

  const baseline = {
    layoutVersion: 7,
    nodes: [
      { id: "source", type: "imageReference", title: "Image", x: 10, y: 20, data: { imageUrl: "" } },
      { id: "generation", type: "imageGenerate", title: "Image generation", x: 400, y: 20, data: {} },
    ],
    edges: [{ from: "source", to: "generation" }],
  };
  const server = JSON.parse(JSON.stringify(baseline));
  const local = {
    ...baseline,
    nodes: [
      { ...baseline.nodes[0], data: { imageUrl: "https://cdn.example/upload.png", imageUrlAssetId: "asset-1", uploadPending: false } },
      baseline.nodes[1],
      { id: "prompt", type: "prompt", title: "Prompt", x: 400, y: 320, data: { prompt: "hello" } },
    ],
    edges: [
      ...baseline.edges,
      { from: "prompt", to: "generation" },
    ],
  };

  const merged = context.mergeWorkflowCanvasWithLocalEdits(server, local, baseline);
  assert.equal(merged.nodes.length, 3);
  assert.deepEqual(Array.from(merged.edges, (edge) => ({ from: edge.from, to: edge.to })), local.edges);
  assert.equal(merged.nodes.find((node) => node.id === "source").data.imageUrl, "https://cdn.example/upload.png");
  assert.equal(merged.nodes.find((node) => node.id === "source").data.imageUrlAssetId, "asset-1");
  assert.ok(merged.nodes.some((node) => node.id === "prompt"));

  const localAfterDelete = {
    ...local,
    nodes: local.nodes.filter((node) => node.id !== "source"),
    edges: [],
  };
  const deleted = context.mergeWorkflowCanvasWithLocalEdits(server, localAfterDelete, baseline);
  assert.ok(!deleted.nodes.some((node) => node.id === "source"));
  assert.equal(deleted.edges.length, 0);

  const serverWithRemoteAddition = {
    ...server,
    nodes: [...server.nodes, { id: "remote", type: "prompt", title: "Remote", x: 800, y: 20, data: {} }],
    edges: [...server.edges, { from: "remote", to: "generation" }],
  };
  const mergedRemote = context.mergeWorkflowCanvasWithLocalEdits(serverWithRemoteAddition, local, baseline);
  assert.ok(mergedRemote.nodes.some((node) => node.id === "remote"));
  assert.ok(mergedRemote.edges.some((edge) => edge.from === "remote" && edge.to === "generation"));

  context.state.workflowActiveCanvasId = "canvas-current";
  context.state.workflow = { nodes: [], edges: [] };
  assert.equal(context.setActiveWorkflowCanvas({ id: "stale-canvas", workflow: server }, { requestSeq: 1 }), false);
  assert.equal(context.state.workflowActiveCanvasId, "canvas-current");
});

test("workflow React Flow adapter owns creation, connection, and business deletion", () => {
  const ui = read("platform.ui.js");
  const canvas = read("workflow-react/src/components/canvas/Canvas.js");
  const bridge = read("workflow-react/src/site/SiteBridge.js");
  const layout = read("workflow-react/src/components/canvas/nodes/NodeLayout.js");
  const css = read("workflow-react/src/site/site.css");

  assert.match(canvas, /import \{[\s\S]*?ReactFlow,[\s\S]*?\} from '@xyflow\/react'/);
  assert.match(canvas, /const handleDoubleClick = useCallback/);
  assert.match(canvas, /application\/x-workflow-media-result/);
  assert.match(canvas, /window\.connectWorkflowNodes\(sourceNodeId, targetNodeId\)/);
  assert.match(canvas, /const onDrop = useCallback/);
  assert.match(canvas, /window\.workflowCanConnectNodes\(connection\.source, connection\.target\)/);
  assert.match(canvas, /onNodesDelete=\{\(deleted\) =>/);
  assert.match(canvas, /onEdgesDelete=\{\(deleted\) =>/);
  assert.match(canvas, /minZoom=\{0\.25\}/);
  assert.match(canvas, /maxZoom=\{1\.5\}/);
  assert.match(canvas, /nodeTypes=\{nodeTypes\}/);
  assert.match(canvas, /screenToFlowPosition/);
  assert.match(bridge, /function toReactFlowGraph/);
  assert.match(bridge, /function writeReactFlowGraph/);
  assert.match(bridge, /IMAGE_NODE_TYPES = new Set\(\["imageGenerate"\]\)/);
  assert.match(bridge, /VIDEO_NODE_TYPES = new Set\(\["unifiedVideoGen"\]\)/);
  assert.match(layout, /import \{ Handle, Position, useReactFlow \} from '@xyflow\/react'/);
  assert.match(layout, /type="target"[\s\S]*?position=\{Position\.Left\}/);
  assert.match(layout, /type="source"[\s\S]*?position=\{Position\.Right\}/);
  assert.match(layout, /selected = false/);
  assert.match(layout, /site-generation-card\$\{selected \? ' is-selected'/);
  assert.match(css, /\.site-generation-controls\.is-selected-only \{\s*display: none;/);
  assert.match(css, /\.site-generation-card\.is-selected \.site-generation-controls\.is-selected-only \{\s*display: grid;/);
  assert.match(layout, /site-generation-drag-handle/);
  assert.match(ui, /function workflowAvailableNodePosition\(position = null\)/);
  assert.match(ui, /function workflowNodePositionIsFree\(candidate = \{\}/);
  assert.match(ui, /const point = position \? workflowAvailableNodePosition\(position\) : workflowNewNodePosition\(\)/);
  assert.match(ui, /const stepX = 448;[\s\S]*?const stepY = 644;/);
  assert.match(ui, /const cardWidth = 420;[\s\S]*?const columnGap = 28;[\s\S]*?cardWidth \+ columnGap/);
  assert.match(ui, /function syncWorkflowStatusText\(\)/);
  assert.match(css, /\.site-generation-card \{[\s\S]*?border-radius: 14px/);
  assert.match(css, /\.site-generation-card \.react-flow__handle-left \{[\s\S]*?left: 0 !important;[\s\S]*?transform: translate\(-50%, -50%\) !important/);
  assert.match(css, /\.site-generation-card \.react-flow__handle-right \{[\s\S]*?right: 0 !important;[\s\S]*?transform: translate\(50%, -50%\) !important/);
  assert.match(css, /width: 420px/);
});

test("source canvas supports double-click creation and only two site node types", () => {
  const ui = read("platform.ui.parts/part-06.js");
  const part = read("platform.ui.parts/part-05.js");
  const canvas = read("workflow-react/src/components/canvas/Canvas.js");
  const siteNodes = read("workflow-react/src/components/canvas/nodes/siteNodeTypes.js");

  assert.match(ui, /function createWorkflowNode\(action = "", position = null\)/);
  assert.match(ui, /function addWorkflowNodeAt\(action = "", position = null\)/);
  assert.doesNotMatch(ui, /data-workflow-palette="add-image"/);
  assert.doesNotMatch(ui, /data-workflow-palette="add-video"/);
  assert.match(canvas, /onDoubleClick=\{handleDoubleClick\}/);
  assert.match(canvas, /window\.addWorkflowNodeAt\(event\.shiftKey \? 'add-video' : 'add-image', position\)/);
  assert.match(canvas, /screenToFlowPosition\(\{ x: event\.clientX, y: event\.clientY \}\)/);
  assert.match(siteNodes, /siteImageGeneration: SiteImageGenerationNode/);
  assert.match(siteNodes, /siteVideoGeneration: SiteVideoGenerationNode/);
  assert.doesNotMatch(siteNodes, /prompt|imageReference|videoReference|imageResult|videoResult|output/i);
  assert.match(ui, /type: "imageGenerate"/);
  assert.match(ui, /type: "unifiedVideoGen"/);
});

test("workflow connection types and empty input handles are validated", () => {
  const ui = read("platform.ui.js");

  assert.match(ui, /function workflowConnectionRuleMatches\(from = \{\}, to = \{\}\)/);
  assert.match(ui, /function workflowCanConnectNodes\(fromId = "", toId = "", ignoredEdge = null\)/);
  assert.match(ui, /function workflowGraphReachesWithoutEdge\(startId = "", targetId = "", ignoredEdge = null\)/);
  assert.match(ui, /if \(!workflowConnectionRuleMatches\(from, to\)\) return false/);
  assert.match(ui, /if \(workflowGraphReachesWithoutEdge\(toId, fromId, ignoredEdge\)\) return false/);
  assert.match(ui, /function workflowConnectionRuleMatches\(from = \{\}, to = \{\}\)/);
  assert.match(ui, /generationTypes\.has\(from\?\.type \|\| ""\)/);
  const part = read("platform.ui.parts/part-06.js");
  assert.doesNotMatch(part, /"add-prompt"|"add-image-reference"|"add-video-reference"|"add-output"/);
  assert.doesNotMatch(part, /window\.createWorkflowInputNodeAndConnect/);
});

test("workflow generation nodes own their input media without standalone input nodes", () => {
  const ui = read("platform.ui.js");
  const part = read("platform.ui.parts/part-06.js");
  const imageNode = read("workflow-react/src/components/canvas/siteNodes/SiteImageGenerationNode.js");
  const videoNode = read("workflow-react/src/components/canvas/siteNodes/SiteVideoGenerationNode.js");

  assert.match(part, /type: "imageGenerate"/);
  assert.match(part, /referenceImages: \[\]/);
  assert.match(part, /type: "unifiedVideoGen"/);
  assert.match(part, /referenceImages: \[\], referenceVideos: \[\]/);
  assert.match(imageNode, /SiteNodeUpload/);
  assert.match(imageNode, /accept="image\/\*"/);
  assert.match(imageNode, /selected = false/);
  assert.match(imageNode, /site-generation-controls is-selected-only/);
  assert.match(videoNode, /selected = false/);
  assert.match(videoNode, /site-generation-controls is-selected-only/);
  assert.match(videoNode, /accept="image\/\*,video\/\*"/);
  assert.match(ui, /function renderWorkflowImageEditor\(node = \{\}\)/);
  assert.match(ui, /function renderWorkflowVideoEditor\(node = \{\}\)/);
});

test("workflow media results feed downstream generation with model-specific payloads", () => {
  const ui = read("platform.ui.js");
  const incoming = read("platform.ui.parts/part-05.js");
  const part = read("platform.ui.parts/part-06.js");
  const videoNode = read("workflow-react/src/components/canvas/siteNodes/SiteVideoGenerationNode.js");

  assert.match(ui, /function workflowNodeIncomingMedia\(node = \{\}\)/);
  assert.match(incoming, /workflowNodeResultImages\(source\)/);
  assert.match(incoming, /workflowNodeResultVideos\(source\)/);
  assert.match(incoming, /map\(\(value\) => String\(value \|\| ""\)\.trim\(\)\)/);
  assert.doesNotMatch(incoming, /\.map\(String\)\.filter\(Boolean\)/);
  assert.match(incoming, /Number\(left\.source\.y \|\| 0\) - Number\(right\.source\.y \|\| 0\)/);
  assert.match(part, /function workflowMediaValueList\(values = \[\]\)/);
  assert.match(part, /return \[\.\.\.new Set\(values\.map/);
  assert.match(part, /function workflowNodeCanvasReferences\(node = \{\}\)/);
  assert.match(part, /workflowNodeCanvasReferences\(node\)\.images/);
  assert.match(part, /window\.workflowNodeCanvasReferences = workflowNodeCanvasReferences/);
  assert.doesNotMatch(part, /linkedReferenceImages|linkedReferenceVideos|workflowSyncCanvasNodeReferences/);
  assert.match(part, /function workflowSeedancePromptAliases/);
  assert.match(part, /return `Image \$\{index\}`/);
  assert.match(part, /const imagePayload = seedanceFrameMode \? \[\] : workflowReferencePayload\(images\)/);
  assert.match(part, /referenceImages: imagePayload/);
  assert.match(part, /referenceVideoUrls: videoUrls/);
  assert.match(part, /\["wan27-i2v", "happyhorse-i2v", "wan-animate-move", "wan-animate-mix"\]/);
  assert.match(part, /function workflowGenerationRunNode\(node = \{\}\)/);
  assert.match(part, /workflowStoreCompletedNodeResult\(node, "image", \{[\s\S]*?imageUrl/);
  assert.match(part, /workflowStoreCompletedNodeResult\(node, "video", \{[\s\S]*?videoUrl/);
  assert.match(part, /generationRunPlaceholder: false/);
  assert.match(videoNode, /workflowNodeCanvasReferences/);
  assert.match(videoNode, /references=\{referenceValues\}/);
  assert.match(videoNode, /referenceLabels=\{referenceLabels\}/);
});

test("workflow render helpers tolerate null nodes and keep Seedance 2.5 model identity", () => {
  const source = read("platform.ui.parts/part-05.js");
  const helpers = [
    extractFunction(source, "workflowImageModelById"),
    extractFunction(source, "workflowVideoModelById"),
    extractFunction(source, "workflowCostLabel"),
    extractFunction(source, "workflowNodeIncomingMedia"),
  ].join("\n");
  const context = new Function(`
    const WORKFLOW_IMAGE_MODEL_LIBRARY = [{ id: "qwen-image3", ratio: "1:1", resolution: "2K" }];
    const WORKFLOW_VIDEO_MODEL_LIBRARY = [
      { id: "seedance", ratio: "16:9", resolution: "720p" },
      { id: "seedance-nsfw", ratio: "adaptive", resolution: "480p" },
    ];
    ${helpers}
    return { workflowImageModelById, workflowVideoModelById, workflowCostLabel, workflowNodeIncomingMedia };
  `)();

  assert.equal(context.workflowCostLabel(null), "0");
  assert.deepEqual(context.workflowNodeIncomingMedia(null), { images: [], videos: [] });
  assert.equal(context.workflowVideoModelById("seedance25").id, "seedance-nsfw");
  assert.equal(context.workflowVideoModelById("missing").id, "seedance");
  assert.equal(context.workflowImageModelById("missing").id, "qwen-image3");

  const emptyModels = new Function(`
    const WORKFLOW_IMAGE_MODEL_LIBRARY = [];
    const WORKFLOW_VIDEO_MODEL_LIBRARY = [];
    ${extractFunction(source, "workflowImageModelById")}
    ${extractFunction(source, "workflowVideoModelById")}
    return [workflowImageModelById("x"), workflowVideoModelById("x")];
  `)();
  emptyModels.forEach((model) => assert.equal(typeof model.id, "string"));
});

test("workflow graph supports fan-in, rejects loops, and migrates embedded references", () => {
  const ui = read("platform.ui.js");
  const manager = read("platform.workflow-canvases.js");

  assert.doesNotMatch(ui, /workflow\.edges = workflow\.edges\.filter\(\(edge\) => edge\.to !== toId\)/);
  assert.match(ui, /function workflowGraphReachesWithoutEdge\(startId = "", targetId = "", ignoredEdge = null\)/);
  assert.match(ui, /if \(workflowGraphReachesWithoutEdge\(toId, fromId, ignoredEdge\)\) return false/);
  assert.match(manager, /\["referenceImages", "imageReference", "imageUrl", "Image input"\]/);
  assert.match(manager, /delete generation\.data\[field\]/);
});

test("workflow viewport is persisted and stale edges are filtered", () => {
  const bridge = read("workflow-react/src/site/SiteBridge.js");
  const ui = read("platform.ui.parts/part-04.js");
  const manager = read("platform.workflow-canvases.js");
  assert.match(bridge, /function toReactFlowGraph\(workflow = siteWorkflow\(\)\)/);
  assert.match(bridge, /nodeIds\.has\(String\(edge\.from\)\) && nodeIds\.has\(String\(edge\.to\)\)/);
  assert.match(bridge, /String\(edge\.from\) !== String\(edge\.to\)/);
  assert.match(bridge, /const seenEdges = new Set\(\)/);
  assert.match(bridge, /function writeCanvasViewport\(viewport = \{\}\)/);
  assert.match(bridge, /affectedTargets\.forEach\(\(nodeId\) =>/);
  assert.match(bridge, /workflow-react-node-change/);
  assert.match(ui, /viewport: workflow\.viewport/);
  assert.match(manager, /viewport/);
});

test("workflow upload creates a selected linked preview node with generation controls", () => {
  const part = read("platform.ui.parts/part-05.js");
  const upload = read("workflow-react/src/components/canvas/siteNodes/SiteNodeUpload.js");
  const media = read("workflow-react/src/components/canvas/siteNodes/GenerationResultMedia.js");
  const bridge = read("workflow-react/src/site/SiteBridge.js");
  const canvas = read("workflow-react/src/components/canvas/Canvas.js");
  const drop = read("platform.ui.parts/part-06.js");
  const videoNode = read("workflow-react/src/components/canvas/siteNodes/SiteVideoGenerationNode.js");
  assert.match(part, /const WORKFLOW_UPLOAD_NODE_TYPES = new Set\(\["imageGenerate", "unifiedVideoGen"\]\)/);
  assert.match(part, /const canvasId = String\(state\.workflowActiveCanvasId \|\| ""\)/);
  assert.match(part, /if \(String\(state\.workflowActiveCanvasId \|\| ""\) !== canvasId\) return false/);
  assert.match(part, /const jobs = accepted\.map\(\(file, index\) => \{/);
  assert.match(part, /const newNode = createWorkflowNode\(action, workflowUploadedNodePosition\(current, index\)\)/);
  assert.match(part, /\.\.\.workflowUploadingPreviewPatch\(file\)/);
  assert.match(part, /uploadProgress: 5/);
  assert.match(part, /uploadFileName: file\.name/);
  assert.match(part, /const results = await Promise\.all\(jobs\.map/);
  assert.match(part, /uploadNode\.data = \{ \.\.\.\(uploadNode\.data \|\| \{\}\), uploadProgress: progress \}/);
  assert.match(part, /persistWorkflowState\(\{ skipServer: true \}\)/);
  assert.match(part, /resultImageUrl: uploaded\.url/);
  assert.match(part, /resultVideoUrl: uploaded\.url/);
  assert.match(part, /window\.connectWorkflowNodes\?\.\(newNode\.id, current\.id\)/);
  assert.match(part, /state\.workflowSelectedNodeId = newNode\.id/);
  assert.match(part, /window\.WorkflowReactCanvas\?\.selectNode\?\.\(jobs\[jobs\.length - 1\]\.nodeId\)/);
  assert.match(part, /requestWorkflowUploadJson/);
  assert.match(part, /request\.upload\.addEventListener\("progress"/);
  assert.match(drop, /window\.activeWorkflowSelectedNodeId = \(\) => String\(state\.workflowSelectedNodeId/);
  assert.match(bridge, /selected: String\(node\.id \|\| ""\) === String\(selectedNodeId \|\| ""\)/);
  assert.match(drop, /function addWorkflowNodeAt[\s\S]*?window\.WorkflowReactCanvas\.selectNode\(node\.id\);[\s\S]*?return node\.id/);
  assert.doesNotMatch(drop, /function addWorkflowNodeAt[\s\S]*?workflow-react:fit-view[\s\S]*?return node\.id/);
  assert.doesNotMatch(part, /async function uploadWorkflowFilesToNode[\s\S]{0,2200}?workflowNodeReferences\(current, field\)/);
  assert.doesNotMatch(part, /async function uploadWorkflowFilesToNode[\s\S]{0,2400}?clearWorkflowExecutionResults/);
  assert.match(canvas, /window\.uploadWorkflowFilesToNode\(files, targetNodeId\)/);
  assert.match(drop, /window\.uploadWorkflowFilesToNode\(files, nodeId\)/);
  assert.match(read("platform.workflow-react.js"), /window\.uploadWorkflowFilesToNode\(files, node\.id\)/);
  assert.match(videoNode, /workflowNodeResultVideos/);
  assert.match(upload, /上传中 \$\{uploadProgress\}%/);
  assert.match(upload, /提示词中输入 <b>@<\/b> 即可引用素材/);
  assert.doesNotMatch(upload, /Image1|Image2|按显示顺序编号|提示词写/);
  assert.doesNotMatch(upload, /site-node-upload-index/);
  assert.match(media, /status === 'uploading'/);
  assert.match(media, /site-generation-uploading-track/);
  assert.match(media, /urls\.map\(\(url, index\)/);
  assert.match(media, /beginMediaDrag\(event, \{ kind, url, index, sourceNodeId \}\)/);
});

test("workflow generations create a selected same-type node without replacing prior previews", () => {
  const ui = read("platform.ui.parts/part-05.js");
  const part = read("platform.ui.parts/part-06.js");
  const imageNode = read("workflow-react/src/components/canvas/siteNodes/SiteImageGenerationNode.js");
  const videoNode = read("workflow-react/src/components/canvas/siteNodes/SiteVideoGenerationNode.js");

  assert.match(part, /function createWorkflowGeneratedResultNode\(sourceNode = \{\}, result = \{\}, kind = "image"\)/);
  assert.match(part, /source: "generated"/);
  assert.match(part, /generatedFromNodeId: sourceNode\.id/);
  assert.match(part, /window\.connectWorkflowNodes\?\.\(sourceNode\.id, newNode\.id\)/);
  assert.match(part, /state\.workflowSelectedNodeId = newNode\.id/);
  assert.match(part, /window\.WorkflowReactCanvas\?\.selectNode\?\.\(newNode\.id\)/);
  assert.match(part, /function workflowGenerationRunNode\(node = \{\}\)/);
  assert.match(part, /if \(!workflowNodeHasOwnContent\(node\)\) return node/);
  assert.match(part, /generationRunPlaceholder: true/);
  assert.match(part, /resultImageUrls: \[\]/);
  assert.match(part, /resultVideoUrls: \[\]/);
  assert.match(part, /referenceImages: workflowNodeReferences\(node, "referenceImages"\)/);
  assert.match(part, /referenceVideos: workflowNodeReferences\(node, "referenceVideos"\)/);
  assert.match(part, /workflow\.edges = workflow\.edges\.filter\(\(edge\) => edge\.to !== newNode\.id \|\| edge\.from === node\.id\)/);
  assert.match(part, /workflow\.edges\.push\(\{ from: node\.id, to: newNode\.id \}\)/);
  assert.doesNotMatch(part, /cloneWorkflowInputEdges\(node\.id, newNode\.id\)/);
  assert.doesNotMatch(part, /window\.connectWorkflowNodes\?\.\(node\.id, newNode\.id\)/);
  assert.match(part, /async function runWorkflowImageNode\(node = \{\}\) \{\n  workflowSetNodeData\(node\.id, \{ status: "preparing", error: "", record: null, taskId: "" \}\)/);
  assert.match(part, /async function runWorkflowVideoNode\(node = \{\}\) \{\n  workflowSetNodeData\(node\.id, \{ status: "preparing", error: "", record: null, taskId: "" \}\)/);
  assert.match(part, /const runNode = workflowGenerationRunNode\(node\)/);
  assert.doesNotMatch(part, /clearWorkflowExecutionResults\(\{ fromNodeId: node\.id/);
  assert.match(part, /workflowStoreCompletedNodeResult\(node, "image", \{[\s\S]*?imageUrl/);
  assert.match(part, /workflowStoreCompletedNodeResult\(node, "video", \{[\s\S]*?videoUrl/);
  assert.doesNotMatch(part, /async function runWorkflowImageNode[\s\S]*?createWorkflowGeneratedResultNode\(node, \{[\s\S]*?imageUrl/);
  assert.doesNotMatch(part, /async function runWorkflowVideoNode[\s\S]*?createWorkflowGeneratedResultNode\(node, \{[\s\S]*?videoUrl/);
  assert.match(part, /resultImageUrl: imageUrls\[0\]/);
  assert.match(part, /resultVideoUrl: result\.videoUrl/);
  assert.match(ui, /function workflowGeneratedResultChildren\(node = \{\}\)/);
  assert.match(ui, /\.\.\.workflowGeneratedResultChildren\(node\)\.flatMap\(\(child\) => workflowNodeOwnResultImages\(child\)\)/);
  assert.match(ui, /\.\.\.workflowGeneratedResultChildren\(node\)\.flatMap\(\(child\) => workflowNodeOwnResultVideos\(child\)\)/);
  assert.match(ui, /window\.workflowNodeOwnResultImages = workflowNodeOwnResultImages/);
  assert.match(ui, /window\.workflowNodeOwnResultVideos = workflowNodeOwnResultVideos/);
  assert.match(ui, /const uploadSource = data\.source === "upload"/);
  assert.match(ui, /const uploadSource = data\.source === "upload"/);
  assert.match(ui, /\.\.\.\(!uploadSource \? recordVideos : \[\]\)/);
  assert.match(ui, /\.\.\.\(!uploadSource \? record : \[\]\)/);
  assert.match(imageNode, /workflowNodeOwnResultImages/);
  assert.match(videoNode, /workflowNodeOwnResultVideos/);
  assert.doesNotMatch(ui, /resultImageUrl: "",\s+resultImageUrls: \[\],\s+posterUrl: ""/);
  assert.doesNotMatch(part, /status: "submitting"[\s\S]{0,160}?resultImageUrl: ""/);
  assert.doesNotMatch(part, /status: "submitting"[\s\S]{0,160}?resultVideoUrl: ""/);
  assert.doesNotMatch(part, /status: "succeeded", record: finalRecord, taskId, resultVideoUrl: videoUrl/);
});

test("workflow generation runs from video and connects the result to that video node", () => {
  const vm = require("node:vm");
  const part = read("platform.ui.parts/part-06.js");
  const workflow = {
    nodes: [
      { id: "reference-image", type: "imageGenerate", x: 0, y: 0, data: { resultImageUrl: "https://cdn.example/ref.png" } },
      { id: "video-source", type: "unifiedVideoGen", x: 500, y: 0, data: { prompt: "move", referenceImages: [] } },
    ],
    edges: [{ from: "reference-image", to: "video-source" }],
  };
  const selected = [];
  const context = vm.createContext({
    state: { workflow, workflowSelectedNodeId: "" },
    workflow,
    ensureWorkflowState: () => workflow,
    workflowNodeHasOwnContent: () => true,
    workflowGeneratedResultChildren: () => [],
    workflowNodeReferences: (node, field) => Array.isArray(node?.data?.[field]) ? node.data[field] : [],
    createWorkflowNode: (action, position) => {
      const node = { id: "video-result", type: action === "add-video" ? "unifiedVideoGen" : "imageGenerate", x: position.x, y: position.y, data: {} };
      workflow.nodes.push(node);
      return node;
    },
    workflowGeneratedNodePosition: (node) => ({ x: node.x + 448, y: node.y }),
    workflowCanConnectNodes: () => true,
    persistWorkflowState: () => {},
    window: { WorkflowReactCanvas: { sync() {}, selectNode(id) { selected.push(id); } } },
  });
  vm.runInContext(`${extractFunction(part, "workflowGenerationRunNode")}
this.workflowGenerationRunNode = workflowGenerationRunNode;`, context);

  const result = context.workflowGenerationRunNode(workflow.nodes[1]);

  assert.equal(result.id, "video-result");
  assert.deepEqual(Array.from(workflow.edges, (edge) => `${edge.from}->${edge.to}`), [
    "reference-image->video-source",
    "video-source->video-result",
  ]);
  assert.ok(!workflow.edges.some((edge) => edge.to === "video-result" && edge.from !== "video-source"));
  assert.equal(context.state.workflowSelectedNodeId, "video-result");
  assert.deepEqual(selected, ["video-result"]);
});

test("inline workflow dialogs use an explicit async confirm handler", () => {
  const ui = read("platform.ui.js");
  const manager = read("platform.workflow-canvases.js");
  assert.match(ui, /els\.inlineDialogConfirm\.type = "button"/);
  assert.match(ui, /if \(els\.inlineDialogConfirm\) els\.inlineDialogConfirm\.onclick = submitHandler/);
  assert.match(manager, /if \(button\.disabled\) return true;/);
});

test("browser back stays in canvas and deletes only the current selection", () => {
  const index = read("workflow-react/src/index.js");
  const canvas = read("workflow-react/src/components/canvas/Canvas.js");

  const main = read("platform.main.js");
  assert.match(main, /if \(window\.handleWorkflowCanvasHistoryBack\?\.\(\)\) return;/);
  assert.match(index, /window\.handleWorkflowCanvasHistoryBack = \(\) =>/);
  assert.match(index, /window\.history\.replaceState\(state, '', `\$\{window\.location\.pathname\}\$\{window\.location\.search\}#workflow`\)/);
  assert.match(index, /window\.deleteSelectedWorkflowNodeFromCanvas/);
  assert.doesNotMatch(index, /leaveEditorForHistory/);
  assert.match(index, /rememberEditorHistory\(canvas\.id\)/);
  assert.match(index, /state\[WORKFLOW_CANVAS_HISTORY_KEY\] = String\(canvasId \|\| ''\)/);
  assert.match(index, /editorOpenRef\.current = false/);
  assert.match(canvas, /Always consume Backspace\/Delete while the canvas owns focus/);
  assert.match(canvas, /window\.deleteSelectedWorkflowNodeFromCanvas = deleteCanvasSelection/);
  assert.match(canvas, /onNodeClick=\{\(_, node\) =>/);
});

test("workflow delete keys only remove selected canvas elements", () => {
  const canvas = read("workflow-react/src/components/canvas/Canvas.js");
  const layout = read("workflow-react/src/components/canvas/nodes/NodeLayout.js");
  const css = read("workflow-react/src/site/site.css");

  assert.match(canvas, /deleteKeyCode=\{null\}/);
  assert.match(canvas, /const selectedNodes = getNodes\(\)\.filter\(\(node\) => node\.selected\)/);
  assert.match(canvas, /const selectedEdges = getEdges\(\)\.filter\(\(edge\) => edge\.selected\)/);
  assert.match(canvas, /if \(!selectedNodes\.length && !selectedEdges\.length\) return false/);
  assert.match(canvas, /const removedBusinessNode = removedNodeIds\.length > 0/);
  assert.match(canvas, /window\.removeWorkflowNode\(node\.id\)/);
  assert.match(canvas, /deleteElements\(\{ nodes: selectedNodes, edges: selectedEdges \}\)/);
  assert.match(canvas, /document\.addEventListener\('keydown', handleDeleteKeyDown, true\)/);
  // Backspace must be consumed even with no selection so it cannot navigate
  // browser history and tear down the canvas.
  assert.match(canvas, /event\.preventDefault\(\);\s+event\.stopPropagation\(\);\s+deleteCanvasSelection\(\)/);
  assert.match(layout, /className="nodrag nopan site-generation-delete"/);
  assert.match(layout, /aria-label="删除节点"/);
  assert.match(layout, /<i className="bi bi-trash3" aria-hidden="true" \/>/);
  assert.doesNotMatch(layout, />\s*×\s*<\/button>/);
  assert.match(layout, /window\.removeWorkflowNode\(id\)/);
  assert.match(layout, /new CustomEvent\('workflow-react:sync'\)/);
  assert.match(layout, /deleteElements\(\{ nodes: \[\{ id \}\] \}\)/);
  assert.match(css, /\.site-generation-delete \{/);
});

test("canvas generation nodes download their generated content", () => {
  const layout = read("workflow-react/src/components/canvas/nodes/NodeLayout.js");
  const imageNode = read("workflow-react/src/components/canvas/siteNodes/SiteImageGenerationNode.js");
  const videoNode = read("workflow-react/src/components/canvas/siteNodes/SiteVideoGenerationNode.js");
  const part = read("platform.ui.parts/part-06.js");
  const css = read("workflow-react/src/site/site.css");

  assert.match(layout, /className="nodrag nopan site-generation-download"/);
  assert.match(layout, /aria-label="下载节点生成内容"/);
  assert.match(layout, /window\.downloadWorkflowNodeResult\?\.\(id\)/);
  assert.match(imageNode, /canDownload=\{results\.length > 0\}/);
  assert.match(videoNode, /canDownload=\{results\.length > 0\}/);
  assert.match(part, /async function downloadWorkflowNodeResult\(nodeId = ""\)/);
  assert.match(part, /workflowNodeOwnResultVideos\(node\)/);
  assert.match(part, /workflowNodeOwnResultImages\(node\)/);
  assert.match(part, /downloadGenerationRecord\(record\)/);
  assert.match(part, /window\.downloadWorkflowNodeResult = downloadWorkflowNodeResult/);
  assert.match(css, /\.site-generation-download,/);
  assert.match(css, /\.site-generation-download:disabled/);
});

test("workflow project summary uses the last content-bearing node as its thumbnail", () => {
  const { publicWorkflowCanvasSummary } = require("../workflow-canvases");
  const summary = publicWorkflowCanvasSummary({
    id: "canvas-thumb",
    name: "Thumbnail canvas",
    workflow: {
      nodes: [
        { id: "image-old", type: "imageGenerate", x: 10, y: 20, data: { resultImageUrl: "https://cdn.example/old.png" } },
        { id: "empty", type: "imageGenerate", x: 30, y: 40, data: { status: "idle" } },
        { id: "video-last", type: "unifiedVideoGen", x: 50, y: 60, data: { posterUrl: "https://cdn.example/last-poster.jpg" } },
      ],
    },
  });

  assert.equal(summary.thumbnailUrl, "https://cdn.example/last-poster.jpg");
  assert.equal(summary.thumbnailVideoUrl, "");
  assert.equal(summary.previewNodes.length, 3);

  const records = publicWorkflowCanvasSummary({
    id: "canvas-record-thumb",
    workflow: {
      nodes: [{
        id: "record-image",
        type: "imageGenerate",
        data: { record: { imageUrls: ["https://cdn.example/record.png"] } },
      }],
    },
  });
  assert.equal(records.thumbnailUrl, "https://cdn.example/record.png");

  const videoOnly = publicWorkflowCanvasSummary({
    id: "canvas-video-thumb",
    workflow: {
      nodes: [{ id: "video", type: "unifiedVideoGen", data: { resultVideoUrl: "https://cdn.example/video.mp4" } }],
    },
  });
  assert.equal(videoOnly.thumbnailUrl, "");
  assert.equal(videoOnly.thumbnailVideoUrl, "https://cdn.example/video.mp4");
});

test("workflow task polling never references an undefined node", () => {
  const part = read("platform.ui.parts/part-06.js");
  const poll = extractFunction(part, "pollWorkflowTask");

  assert.match(poll, /workflowThrowIfCancelled\(nodeId\)/);
  assert.doesNotMatch(poll, /workflowThrowIfCancelled\(node\.id\)/);
  assert.doesNotMatch(poll, /\bnode\.id\b/);
});
