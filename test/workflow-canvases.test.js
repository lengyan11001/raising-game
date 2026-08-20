const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

test("workflow canvas state is normalized and bounded", () => {
  const {
    defaultWorkflowCanvasState,
    normalizeWorkflowCanvasName,
    normalizeWorkflowCanvasState,
  } = require("../workflow-canvases");

  const initial = defaultWorkflowCanvasState();
  assert.equal(initial.nodes.length, 0);
  assert.equal(initial.edges.length, 0);
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
  });
  assert.equal(normalized.zoom, 1.8);
  assert.equal(normalized.directorPrompt.length, 6000);
  assert.equal(normalized.canvasWidth, 8000);
  assert.equal(normalized.canvasHeight, 1800);
  assert.equal(normalized.scrollLeft, 2400);
  assert.equal(normalized.scrollTop, 320);
  assert.throws(
    () => normalizeWorkflowCanvasState({ ...initial, nodes: Array.from({ length: 101 }, (_, index) => ({ id: `n-${index}` })) }),
    /100 nodes/,
  );
});

test("workflow canvas database operations are owner scoped", () => {
  const db = read("db.js");

  assert.match(db, /pool\.on\("error", \(error\) =>/);
  assert.match(db, /\[db-pool-error\]/);
  assert.match(db, /CREATE TABLE IF NOT EXISTS app_workflow_canvases/);
  assert.match(db, /CREATE INDEX IF NOT EXISTS app_workflow_canvases_user_updated_idx ON app_workflow_canvases \(user_id, updated_at DESC/);
  assert.match(db, /SELECT id, user_id, name, created_at, updated_at FROM app_workflow_canvases/);
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

test("workflow canvas UI supports selection, create, save and delete", () => {
  const loader = read("platform.js");
  const manager = read("platform.workflow-canvases.js");
  const ui = read("platform.ui.js");
  const explore = read("platform.explore.js");

  assert.match(loader, /"platform\.workflow-canvases\.js"/);
  assert.match(manager, /function loadWorkflowCanvases/);
  assert.doesNotMatch(manager, /migrateLegacyWorkflowCanvas|legacyWorkflowCanvasValue/);
  assert.match(manager, /function scheduleWorkflowCanvasSave/);
  assert.match(manager, /function createWorkflowCanvas/);
  assert.match(manager, /function saveWorkflowCanvas/);
  assert.match(manager, /function deleteWorkflowCanvas/);
  assert.match(manager, /button\.disabled/);
  assert.match(manager, /data-workflow-canvas-select/);
  assert.match(ui, /scheduleWorkflowCanvasSave\(\);/);
  assert.match(explore, /loadWorkflowCanvases\(\);/);
});

test("workflow rerenders preserve the viewport without a side panel", () => {
  const ui = read("platform.ui.js");
  const main = read("platform.main.js");
  const css = read("platform.css");

  assert.match(ui, /function captureWorkflowCanvasViewport/);
  assert.match(ui, /function restoreWorkflowCanvasViewport/);
  assert.match(ui, /const viewport = captureWorkflowCanvasViewport\(\);[\s\S]*?els\.workflowRoot\.innerHTML[\s\S]*?restoreWorkflowCanvasViewport\(viewport\);/);
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

  assert.match(ui, /function revealWorkflowNode/);
  assert.match(ui, /renderWorkflowPanel\(\{ focusNodeId: node\.id \}\)/);
  assert.match(ui, /suppressWorkflowClickUntil = Date\.now\(\) \+ 80/);
  assert.doesNotMatch(ui, /suppressWorkflowClickUntil = Date\.now\(\) \+ 250/);
});

test("workflow toolbar exposes only real controls", () => {
  const ui = read("platform.ui.js");

  assert.match(ui, /data-workflow-action="add-image"/);
  assert.match(ui, /data-workflow-action="add-video"/);
  assert.doesNotMatch(ui, /data-workflow-action="add-branch"/);
  assert.doesNotMatch(ui, /data-workflow-action="refiner"/);
  assert.doesNotMatch(ui, /data-workflow-action="add-prompt"/);
  assert.doesNotMatch(ui, /data-workflow-action="physics"/);
});

test("workflow nodes are freeform image and video nodes", () => {
  const ui = read("platform.ui.js");
  assert.match(ui, /function addWorkflowImageNode\(\)/);
  assert.match(ui, /type: "imageReference"/);
  assert.match(ui, /function addWorkflowVideoNode/);
  assert.match(ui, /workflowImageNodes\(\)\.length/);
  assert.match(ui, /type: "videoReference"/);
  assert.match(ui, /if \(!node\) return false;/);
  assert.match(ui, /async function handleWorkflowDrop\(event\)/);
  assert.match(ui, /type: isImage \? "imageReference" : "videoReference"/);
});

test("inline workflow dialogs use an explicit async confirm handler", () => {
  const ui = read("platform.ui.js");
  const manager = read("platform.workflow-canvases.js");
  assert.match(ui, /els\.inlineDialogConfirm\.type = "button"/);
  assert.match(ui, /if \(els\.inlineDialogConfirm\) els\.inlineDialogConfirm\.onclick = submitHandler/);
  assert.match(manager, /if \(button\.disabled\) return true;/);
});
