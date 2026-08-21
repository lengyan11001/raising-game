const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

test("main old and new2 sites expose Workflow to every user while tool tenants keep it disabled", () => {
  const config = read("platform.config.js");
  const ui = read("platform.ui.js");
  const server = read("server.js");

  assert.match(config, /function canUseWorkflow\(\) \{[\s\S]*?return tenantFeature\("workflow", true\);[\s\S]*?\}/);
  assert.match(config, /if \(candidate === "workflow" && !canUseWorkflow\(\)\) continue;/);
  assert.match(config, /if \(normalized === "workflow"\) return canUseWorkflow\(\);/);
  assert.match(ui, /const workflowEnabled = canUseWorkflow\(\);/);
  assert.match(server, /tenantId: "tool-undress-14vips"[\s\S]*?disabledTabs: \[[^\]]*"workflow"/);
  assert.match(server, /tenantId: "tool-video-123tops"[\s\S]*?disabledTabs: \[[^\]]*"workflow"/);
  assert.match(config, /function canUseAnimeTemplates\(\) \{[\s\S]*?return isWorkflowTester\(\);/);
});

test("workflow wheel zoom only runs over empty canvas space", () => {
  const ui = read("platform.ui.js");

  assert.match(ui, /function workflowWheelZoomBlockedTarget\(target\)/);
  assert.match(ui, /target\.closest\("\[data-workflow-node\]"\)/);
  assert.match(ui, /function handleWorkflowWheel\(event\) \{[\s\S]*?if \(workflowWheelZoomBlockedTarget\(event\.target\)\) return;[\s\S]*?event\.preventDefault\(\);/);
});

test("workflow source, prompt, generation, and output nodes have separate roles", () => {
  const ui = read("platform.ui.js");
  const config = read("platform.config.js");

  assert.match(config, /const WORKFLOW_DEFAULT_NODES = \[\];/);
  assert.match(ui, /function workflowImageNodes\(\)/);
  assert.match(ui, /function workflowSourceNodes\(\)/);
  assert.match(ui, /function workflowUploadNode\(\) \{[\s\S]*?imageReference/);
  assert.match(ui, /data-workflow-action="add-image-reference"/);
  assert.match(ui, /data-workflow-action="add-video-reference"/);
  assert.match(ui, /data-workflow-action="add-prompt"/);
  assert.match(ui, /data-workflow-action="add-output"/);
  assert.match(ui, /if \(action === "add-image"\) addWorkflowImageNode\(\);/);
  assert.match(ui, /function workflowVideoReferenceNodes\(\)/);
  assert.match(ui, /if \(action === "add-video"\) addWorkflowVideoNode\(\);/);
  assert.match(ui, /function workflowGenerationNodes\(\)/);
});
