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
  assert.equal(initial.nodes.length, 4);
  assert.equal(initial.edges.length, 3);
  assert.equal(normalizeWorkflowCanvasName("  My workflow  "), "My workflow");
  assert.equal(normalizeWorkflowCanvasName(" "), "Untitled workflow");

  const normalized = normalizeWorkflowCanvasState({
    ...initial,
    zoom: 99,
    directorPrompt: "x".repeat(7000),
  });
  assert.equal(normalized.zoom, 1.8);
  assert.equal(normalized.directorPrompt.length, 6000);
  assert.throws(
    () => normalizeWorkflowCanvasState({ ...initial, nodes: Array.from({ length: 101 }, (_, index) => ({ id: `n-${index}` })) }),
    /100 nodes/,
  );
});

test("workflow canvas database operations are owner scoped", () => {
  const db = read("db.js");

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

test("workflow canvas UI supports migration, selection, create, save and delete", () => {
  const loader = read("platform.js");
  const manager = read("platform.workflow-canvases.js");
  const ui = read("platform.ui.js");
  const explore = read("platform.explore.js");

  assert.match(loader, /"platform\.workflow-canvases\.js"/);
  assert.match(manager, /function loadWorkflowCanvases/);
  assert.match(manager, /function migrateLegacyWorkflowCanvas/);
  assert.match(manager, /function scheduleWorkflowCanvasSave/);
  assert.match(manager, /function createWorkflowCanvas/);
  assert.match(manager, /function saveWorkflowCanvas/);
  assert.match(manager, /function deleteWorkflowCanvas/);
  assert.match(manager, /data-workflow-canvas-select/);
  assert.match(ui, /scheduleWorkflowCanvasSave\(\);/);
  assert.match(explore, /loadWorkflowCanvases\(\);/);
});
