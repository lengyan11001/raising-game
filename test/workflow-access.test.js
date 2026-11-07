const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

test("main old and new2 sites expose Workflow to every user while tool tenants keep it disabled", () => {
  const config = read("platform.config.js");
  const ui = read("platform.ui.js");
  const tenants = read("lib-tenants.js");

  assert.match(config, /function canUseWorkflow\(\) \{[\s\S]*?return tenantFeature\("workflow", true\);[\s\S]*?\}/);
  assert.match(config, /if \(candidate === "workflow" && !canUseWorkflow\(\)\) continue;/);
  assert.match(config, /if \(normalized === "workflow"\) return canUseWorkflow\(\);/);
  assert.match(ui, /const workflowEnabled = canUseWorkflow\(\);/);
  assert.match(tenants, /tenantId: "tool-undress-14vips"[\s\S]*?disabledTabs: \[[^\]]*"workflow"/);
  assert.match(tenants, /tenantId: "tool-video-123tops"[\s\S]*?disabledTabs: \[[^\]]*"workflow"/);
  assert.match(config, /function canUseAnimeTemplates\(\) \{[\s\S]*?return isWorkflowTester\(\);/);
});

test("workflow wheel zoom only runs over empty canvas space", () => {
  const ui = read("platform.ui.js");

  assert.match(ui, /function workflowWheelZoomBlockedTarget\(target\)/);
  assert.match(ui, /target\.closest\("\[data-workflow-node\]"\)/);
  assert.match(ui, /function handleWorkflowWheel\(event\) \{[\s\S]*?if \(workflowWheelZoomBlockedTarget\(event\.target\)\) return;[\s\S]*?event\.preventDefault\(\);/);
});

test("workflow exposes only image and video generation nodes", () => {
  const ui = read("platform.ui.js");
  const config = read("platform.config.js");
  const bridge = read("workflow-react/src/site/SiteBridge.js");

  assert.match(config, /const WORKFLOW_DEFAULT_NODES = \[\];/);
  assert.match(ui, /function workflowImageNodes\(\)/);
  assert.match(ui, /function workflowGenerationNodes\(\)/);
  assert.match(ui, /if \(action === "add-image"\) addWorkflowNodeAt\("add-image"\);/);
  assert.match(ui, /if \(action === "add-video"\) addWorkflowNodeAt\("add-video"\);/);
  assert.match(bridge, /IMAGE_NODE_TYPES = new Set\(\["imageGenerate"\]\)/);
  assert.match(bridge, /VIDEO_NODE_TYPES = new Set\(\["unifiedVideoGen"\]\)/);
  assert.doesNotMatch(ui, /data-workflow-action="add-image-reference"/);
  assert.doesNotMatch(ui, /data-workflow-action="add-video-reference"/);
  assert.doesNotMatch(ui, /data-workflow-action="add-prompt"/);
  assert.doesNotMatch(ui, /data-workflow-action="add-output"/);
});
