"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const server = fs.readFileSync(path.join(__dirname, "..", "server.js"), "utf8");
const client = fs.readFileSync(path.join(__dirname, "..", "chat-live.js"), "utf8");
const admin = fs.readFileSync(path.join(__dirname, "..", "admin.js"), "utf8");

function extractFunction(name) {
  const start = server.indexOf(`function ${name}(`);
  assert.ok(start >= 0, `${name} exists`);
  const next = server.indexOf("\nfunction ", start + 1);
  assert.ok(next > start, `${name} has a following function`);
  return server.slice(start, next).trim();
}

function loadStoryFunctions() {
  const code = [
    'const CHAT_LIVE_STORY_STAGES = ["casual", "flirting", "foreplay", "intimate", "aftercare"];',
    'const CHAT_LIVE_STORY_STAGE_LABELS = { casual: "日常", flirting: "暧昧", foreplay: "前戏", intimate: "亲密", aftercare: "余韵" };',
    extractFunction("normalizeChatLiveStoryUrl"),
    extractFunction("normalizeChatLiveStoryId"),
    extractFunction("normalizeChatLiveStory"),
    extractFunction("chatLiveStoryLocation"),
    extractFunction("chatLiveStoryAction"),
    extractFunction("chatLiveStoryTransition"),
    extractFunction("publicChatLiveStory"),
    extractFunction("chatLiveStoryStageForText"),
    extractFunction("chatLiveStoryLocationKeywords"),
    extractFunction("chatLiveStoryLocationForText"),
    extractFunction("chatLiveStoryDirectorSelection"),
    'module.exports = { normalizeChatLiveStory, chatLiveStoryDirectorSelection, publicChatLiveStory, chatLiveStoryTransition, chatLiveStoryLocationForText };',
  ].join("\n");
  const sandbox = { module: { exports: {} }, exports: {}, console, Math };
  const patched = code.replace(/function chatLiveStoryStageForText[\s\S]*?\n}/, `function chatLiveStoryStageForText(text = "", currentStage = "casual") {
    const value = String(text || "");
    if (/(?:插进去|插进来|别停|操我|干我|顶我|抽插|高潮|射进)/u.test(value)) return "intimate";
    if (/(?:亲我|吻我|抱我|摸我|脱掉|前戏|想要)/u.test(value)) return "foreplay";
    if (/(?:喜欢|想你|暧昧|撩|约会)/u.test(value)) return "flirting";
    return currentStage || "casual";
  }`);
  vm.runInNewContext(patched, sandbox);
  return sandbox.module.exports;
}

const storyFixture = {
  enabled: true,
  initialLocationId: "living_room",
  switchCooldownSeconds: 45,
  locations: [
    { id: "kitchen", name: "厨房", imageUrl: "https://example.test/kitchen.jpg" },
    { id: "living_room", name: "客厅沙发", imageUrl: "https://example.test/living.jpg" },
  ],
  actions: [
    { id: "kiss", name: "接吻", imageUrl: "https://example.test/kiss.jpg", action: "kissing", stages: ["flirting", "foreplay"], locations: ["kitchen", "living_room"] },
    { id: "intimate_sofa", name: "沙发亲密", imageUrl: "https://example.test/sofa.jpg", action: "intimate on sofa", stages: ["intimate"], locations: ["living_room"] },
  ],
  transitions: [{ from: "kitchen", to: "living_room", videoUrl: "https://example.test/kitchen-to-living.mp4" }],
};

test("every location is independent from stage, including intimate scenes in the living room", () => {
  const { normalizeChatLiveStory, chatLiveStoryDirectorSelection } = loadStoryFunctions();
  const story = normalizeChatLiveStory(storyFixture);
  assert.deepEqual(Array.from(story.locations, (item) => item.id), ["kitchen", "living_room"]);
  assert.deepEqual(Array.from(story.stages), ["casual", "flirting", "foreplay", "intimate", "aftercare"]);
  const selection = chatLiveStoryDirectorSelection(story, {
    text: "我已经插进去了，别停",
    currentStage: "casual",
    currentLocationId: "living_room",
    recentActionIds: [],
    history: [{ role: "user", content: "我插进去，别停" }],
  });
  assert.equal(selection.locationId, "living_room");
  assert.equal(selection.stage, "intimate");
  assert.equal(selection.actionId, "intimate_sofa");
});

test("action selection respects both stage and location", () => {
  const { normalizeChatLiveStory, chatLiveStoryDirectorSelection } = loadStoryFunctions();
  const story = normalizeChatLiveStory(storyFixture);
  const selection = chatLiveStoryDirectorSelection(story, {
    text: "先亲我一下",
    currentStage: "casual",
    currentLocationId: "kitchen",
    recentActionIds: ["kiss"],
    history: [],
  });
  assert.equal(selection.locationId, "kitchen");
  assert.ok(["flirting", "foreplay"].includes(selection.stage));
  assert.equal(selection.actionId, "kiss");
});

test("transition lookup supports explicit and location-entry transition videos", () => {
  const { normalizeChatLiveStory, chatLiveStoryTransition } = loadStoryFunctions();
  const story = normalizeChatLiveStory(storyFixture);
  assert.equal(chatLiveStoryTransition(story, "kitchen", "living_room"), "https://example.test/kitchen-to-living.mp4");
  assert.equal(chatLiveStoryTransition(story, "living_room", "kitchen"), "");
});

test("location keywords switch rooms but negated mentions do not", () => {
  const { normalizeChatLiveStory, chatLiveStoryDirectorSelection } = loadStoryFunctions();
  const story = normalizeChatLiveStory(storyFixture);
  const kitchen = chatLiveStoryDirectorSelection(story, {
    text: "去客厅沙发坐一会儿",
    currentStage: "casual",
    currentLocationId: "kitchen",
    lastSwitchAt: new Date(Date.now() - 60_000).toISOString(),
  });
  assert.equal(kitchen.locationId, "living_room");
  assert.equal(kitchen.locationChanged, true);
  assert.equal(kitchen.transitionUrl, "https://example.test/kitchen-to-living.mp4");

  const negated = chatLiveStoryDirectorSelection(story, {
    text: "别去卧室，就在这里",
    currentStage: "casual",
    currentLocationId: "living_room",
    lastSwitchAt: new Date(Date.now() - 60_000).toISOString(),
  });
  assert.equal(negated.locationId, "living_room");
  assert.equal(negated.locationChanged, false);
});

test("location cooldown keeps the current room and reports why", () => {
  const { normalizeChatLiveStory, chatLiveStoryDirectorSelection } = loadStoryFunctions();
  const story = normalizeChatLiveStory(storyFixture);
  const selection = chatLiveStoryDirectorSelection(story, {
    text: "去厨房",
    currentStage: "casual",
    currentLocationId: "living_room",
    lastSwitchAt: new Date().toISOString(),
  });
  assert.equal(selection.locationId, "living_room");
  assert.equal(selection.requestedLocationId, "kitchen");
  assert.equal(selection.blockedByCooldown, true);
  assert.equal(selection.transitionUrl, "");
});

test("public story omits private prompt fields and keeps render data", () => {
  const { publicChatLiveStory } = loadStoryFunctions();
  const view = publicChatLiveStory(storyFixture);
  assert.equal(view.initialLocationId, "living_room");
  assert.equal(view.locations[1].name, "客厅沙发");
  assert.equal(view.actions[0].action, "kissing");
  assert.equal("userText" in view.actions[0], false);
});

test("admin and client wire story editing and director playback", () => {
  assert.match(admin, /固定场景 \/ 阶段 \/ 动作/);
  assert.match(admin, /liveStory: \{/);
  assert.match(admin, /data-story-action-stage/);
  assert.match(client, /applyLiveStoryDirector/);
  assert.match(client, /playLiveStoryTransition/);
  assert.match(client, /sent\?\.director/);
  assert.match(client, /chat-live-story-transition/);
  assert.match(client, /scheduleLiveStoryRetry/);
  assert.match(client, /applyLiveStoryDirector\(pending, \{ retry: true \}\)/);
  assert.match(client, /if \(!targetLook \|\| state\.ended\) return;/);
  assert.doesNotMatch(client, /if \(!targetLook \|\| !lookChannelReady\(\)/);
  assert.match(admin, /storyLocationOptionsFor\(item\.from\)/);
  assert.match(admin, /storyLocationOptionsFor\(item\.to\)/);
  assert.match(admin, /item\.id === selectedId \? "selected"/);
  assert.match(server, /请至少添加一个场景，并上传场景背景图。/);
  assert.match(server, /场景「\$\{missingLocation\.name\}」请上传场景背景图。/);
  assert.match(server, /动作「\$\{missingAction\.name\}」请上传动作关键帧图。/);
  assert.match(admin, /data-story-location-image[\s\S]{0,500}filter\(\(item\) => item\.id && item\.name\)/);
  assert.doesNotMatch(admin, /filter\(\(item\) => item\.id && item\.name && item\.imageUrl\)/);
  assert.match(client, /director\.transitionUrl/);
  assert.match(admin, /data-story-file/);
  assert.match(server, /if \(!embedLook && !isManagedChatLiveAssetUrl\(look\.imageUrl\)\)/);
  assert.doesNotMatch(server, /managedStoryAsset/);
  assert.doesNotMatch(client, /if \(!targetLook \|\| !lookChannelReady\(\)[\s\S]{0,220}state\.liveStoryLocationId = locationId/);
});
