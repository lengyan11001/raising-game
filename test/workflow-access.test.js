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

test("workflow story prompt nodes are executable inputs for downstream video prompts", () => {
  const ui = read("platform.ui.js");
  const config = read("platform.config.js");

  assert.match(config, /type: "prompt", title: "Story Prompt"/);
  assert.match(ui, /function workflowUpstreamPromptNodes\(node = \{\}\)/);
  assert.match(ui, /function workflowEffectivePrompt\(node = \{\}\)[\s\S]*?workflowUpstreamPromptNodes\(node\)/);
  assert.match(ui, /data-workflow-story-prompt=/);
  assert.match(ui, /data-workflow-action="add-prompt"/);
  assert.match(ui, /if \(action === "add-prompt"\) addWorkflowPromptNode\(\);/);
  assert.match(ui, /function addWorkflowPromptNode\(\)/);
});
