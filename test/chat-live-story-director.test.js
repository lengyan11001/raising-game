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
    extractFunction("publicChatLiveStory"),
    extractFunction("chatLiveStoryStageForText"),
    extractFunction("chatLiveStoryLocationKeywords"),
    extractFunction("chatLiveStoryLocationForText"),
    extractFunction("chatLiveStoryDirectorSelection"),
    'module.exports = { normalizeChatLiveStory, chatLiveStoryDirectorSelection, publicChatLiveStory, chatLiveStoryLocationForText };',
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
    { id: "bedroom", name: "卧室", imageUrl: "https://example.test/bedroom.jpg" },
  ],
  actions: [
    { id: "kiss", name: "接吻", spot: "料理台前", poseLabel: "侧身靠近", imageUrl: "https://example.test/kiss.jpg", action: "kissing", stages: ["flirting", "foreplay"], locations: ["kitchen", "living_room"] },
    { id: "intimate_sofa", name: "沙发亲密", spot: "客厅沙发", poseLabel: "侧卧", imageUrl: "https://example.test/sofa.jpg", action: "intimate on sofa", stages: ["intimate"], locations: ["living_room"] },
  ],
};

test("every location is independent from stage, including intimate scenes in the living room", () => {
  const { normalizeChatLiveStory, chatLiveStoryDirectorSelection } = loadStoryFunctions();
  const story = normalizeChatLiveStory(storyFixture);
  assert.deepEqual(Array.from(story.locations, (item) => item.id), ["kitchen", "living_room", "bedroom"]);
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

  const negated = chatLiveStoryDirectorSelection(story, {
    text: "别去卧室，就在这里",
    currentStage: "casual",
    currentLocationId: "living_room",
    lastSwitchAt: new Date(Date.now() - 60_000).toISOString(),
  });
  assert.equal(negated.locationId, "living_room");
  assert.equal(negated.locationChanged, false);
});

test("public story omits private prompt fields and keeps render data", () => {
  const { publicChatLiveStory } = loadStoryFunctions();
  const view = publicChatLiveStory(storyFixture);
  assert.equal(view.initialLocationId, "living_room");
  assert.equal(view.locations[1].name, "客厅沙发");
  assert.equal(view.locations[2].name, "卧室");
  assert.equal(view.actions[0].action, "kissing");
  assert.equal(view.actions[0].spot, "料理台前");
  assert.equal(view.actions[0].poseLabel, "侧身靠近");
  assert.equal("userText" in view.actions[0], false);
});

test("one room can keep ordinary stages sparse and rotate intimate poses", () => {
  const { normalizeChatLiveStory, chatLiveStoryDirectorSelection } = loadStoryFunctions();
  const story = normalizeChatLiveStory({
    ...storyFixture,
    switchCooldownSeconds: 0,
    locations: [
      { id: "living_room", name: "客厅沙发", imageUrl: "https://example.test/living.jpg" },
    ],
    actions: [
      { id: "daily_sofa", name: "沙发日常", spot: "客厅沙发", poseLabel: "坐姿", imageUrl: "https://example.test/daily.jpg", stages: ["casual"], locations: ["living_room"] },
      { id: "intimate_recline", name: "沙发侧卧", spot: "客厅沙发", poseLabel: "侧卧", imageUrl: "https://example.test/recline.jpg", stages: ["intimate"], locations: ["living_room"] },
      { id: "intimate_lean", name: "沙发前倾", spot: "客厅沙发", poseLabel: "前倾", imageUrl: "https://example.test/lean.jpg", stages: ["intimate"], locations: ["living_room"] },
      { id: "intimate_sit", name: "沙发坐姿", spot: "客厅沙发", poseLabel: "坐姿", imageUrl: "https://example.test/sit.jpg", stages: ["intimate"], locations: ["living_room"] },
    ],
  });

  const daily = chatLiveStoryDirectorSelection(story, {
    text: "",
    currentStage: "casual",
    currentLocationId: "living_room",
  });
  assert.equal(daily.actionId, "daily_sofa");

  const intimate = chatLiveStoryDirectorSelection(story, {
    text: "我已经插进去了，别停",
    currentStage: "intimate",
    currentLocationId: "living_room",
    recentActionIds: ["intimate_recline", "intimate_lean"],
    history: [{ role: "user", content: "我插进去了，别停" }],
  });
  assert.equal(intimate.locationId, "living_room");
  assert.equal(intimate.stage, "intimate");
  assert.equal(intimate.actionId, "intimate_sit");
  assert.equal(intimate.spot, "客厅沙发");
  assert.equal(intimate.poseLabel, "坐姿");
});

test("entering a room applies the location look before any action image", () => {
  assert.match(client, /async function applyLiveStoryDirector\(director = \{\}, \{ retry = true, initial = false \} = \{\}\)/);
  assert.match(client, /const actionLook = initial && !director\.look\?\.imageUrl && !director\.lookImageUrl/);
  assert.match(client, /initialLocationId/);
  assert.match(client, /\}, \{ initial: true \}\)/);
  assert.match(client, /state\.liveStoryLocationId = initialLocation\.id/);
});

test("admin and client wire story editing, character looks, and director playback", () => {
  assert.match(admin, /固定场景 \/ 阶段 \/ 动作/);
  assert.match(admin, /liveStory: \{/);
  assert.match(admin, /data-story-action-stage/);
  assert.match(admin, /data-story-action-spot/);
  assert.match(admin, /data-story-action-pose/);
  assert.match(admin, /chatLiveStoryInitialLocation/);
  assert.match(admin, /同一地点、同一阶段可以添加多张不同位置和姿势的单人图/);
  assert.match(client, /applyLiveStoryDirector/);
  assert.match(client, /sent\?\.director/);
  assert.doesNotMatch(client, /video\.play\(\)\.catch\(done\)/);
  assert.match(client, /scheduleLiveStoryRetry/);
  assert.match(client, /applyLiveStoryDirector\(pending, \{ retry: true \}\)/);
  assert.match(client, /if \(!targetLook \|\| state\.ended\) return;/);
  assert.doesNotMatch(client, /if \(!targetLook \|\| !lookChannelReady\(\)/);
  assert.match(server, /looks: normalizeChatLiveLooks\(item\.looks\)/);
  assert.match(client, /sessionId: state\.session\?\.id \|\| ""/);
  assert.match(server, /请至少添加一个场景，并上传场景背景图。/);
  assert.match(server, /场景「\$\{missingLocation\.name\}」请上传场景背景图。/);
  assert.match(server, /动作「\$\{missingAction\.name\}」请上传动作关键帧图。/);
  assert.match(admin, /data-story-location-image[\s\S]{0,500}filter\(\(item\) => item\.id && item\.name\)/);
  assert.doesNotMatch(admin, /filter\(\(item\) => item\.id && item\.name && item\.imageUrl\)/);
  assert.match(client, /confirmLiveStoryState/);
  assert.match(client, /story-state/);
  assert.match(server, /handleSaveChatLiveStoryState/);
  assert.match(admin, /data-story-file/);
  assert.match(server, /if \(!embedLook && !isManagedChatLiveAssetUrl\(look\.imageUrl\)\)/);
  assert.doesNotMatch(server, /managedStoryAsset/);
  assert.doesNotMatch(client, /if \(!targetLook \|\| !lookChannelReady\(\)[\s\S]{0,220}state\.liveStoryLocationId = locationId/);
});

test("server picks a character look and the client applies it as the first scene frame", () => {
  assert.match(server, /function chatLiveSceneSelectionForText/);
  assert.match(server, /function aiSelectChatLiveScene/);
  assert.match(server, /sceneSource: "ai"/);
  assert.match(server, /\.\.\.\(look \? \{ look: publicChatLiveLook\(look\) \} : \{\}\)/);
  assert.match(client, /function liveStorySceneLook/);
  assert.match(client, /const actionLook = initial && !director\.look\?\.imageUrl && !director\.lookImageUrl/);
});
