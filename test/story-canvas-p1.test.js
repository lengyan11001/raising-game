"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

function handlerBody(source, name) {
  const start = source.indexOf(`async function ${name}(`);
  assert.notEqual(start, -1, `${name} missing`);
  return source.slice(start, source.indexOf("\n}\n", start));
}

test("story P1 script, analyze, import, and delete APIs are admin-only routes", () => {
  const handlers = read("server.parts/part-03.js");
  const routes = read("server.parts/part-42.js");
  for (const name of [
    "handleListStoryScripts",
    "handleCreateStoryScript",
    "handleAnalyzeStoryProject",
    "handleImportStoryAnalysis",
    "handleDeleteStoryEpisode",
  ]) {
    assert.match(handlerBody(handlers, name), /requireAdmin\(req, res\)/, `${name} must require admin`);
  }
  assert.match(routes, /storyProjectScriptsMatch[\s\S]*req\.method === "GET"[\s\S]*handleListStoryScripts/);
  assert.match(routes, /storyProjectScriptsMatch[\s\S]*req\.method === "POST"[\s\S]*handleCreateStoryScript/);
  assert.match(routes, /storyProjectAnalyzeMatch[\s\S]*handleAnalyzeStoryProject/);
  assert.match(routes, /storyProjectImportMatch[\s\S]*handleImportStoryAnalysis/);
  assert.match(routes, /storyEpisodeMatch[\s\S]*req\.method === "DELETE"[\s\S]*handleDeleteStoryEpisode/);
});

test("story P1 data functions stay PostgreSQL-only and enforce project ownership", () => {
  const db = read("db.js");
  const imports = read("server.parts/part-01.js");
  for (const fn of [
    "listStoryScriptVersionsFromDb",
    "createStoryScriptVersionInDb",
    "listStoryAssetsFromDb",
    "importStoryAnalysisInDb",
    "deleteStoryEpisodeFromDb",
  ]) {
    assert.match(db, new RegExp(`async function ${fn}\\(`), `db function ${fn}`);
    assert.match(db, new RegExp(`\\b${fn},`), `db export ${fn}`);
    assert.match(imports, new RegExp(`\\b${fn},`), `server import ${fn}`);
  }
  assert.match(db, /async function importStoryAnalysisInDb[\s\S]*BEGIN[\s\S]*ON CONFLICT \(project_id, episode_no\) DO UPDATE[\s\S]*COMMIT/);
  assert.match(db, /async function deleteStoryEpisodeFromDb[\s\S]*DELETE FROM app_story_episodes[\s\S]*DELETE FROM app_story_canvas_links/);
  assert.match(db, /async function listStoryScriptVersionsFromDb[\s\S]*p\.owner_user_id = \$2/);
  assert.doesNotMatch(handlerBody(read("server.parts/part-03.js"), "handleImportStoryAnalysis"), /writeFile|data\/.*\.json/i);
});

test("story P1 frontend implements script version, analysis preview, import, and episode deletion", () => {
  const html = read("platform.html");
  const story = read("platform.story.js");
  assert.match(html, /P1 · 加载中/);
  assert.match(story, /scripts: \[\]/);
  assert.match(story, /analysis: null/);
  assert.match(story, /renderStoryScriptSection\(\)/);
  assert.match(story, /data-story-save-script/);
  assert.match(story, /data-story-script-id/);
  assert.match(story, /data-story-analyze/);
  assert.match(story, /data-story-import-analysis/);
  assert.match(story, /data-story-delete-episode/);
  assert.match(story, /\/scripts`[\s\S]*method: "POST"/);
  assert.match(story, /\/analyze`[\s\S]*method: "POST"/);
  assert.match(story, /\/import`[\s\S]*method: "POST"/);
  assert.match(story, /\/episodes\/\$\{encodeURIComponent\(id\)\}`[\s\S]*method: "DELETE"/);
  assert.doesNotMatch(story, /localStorage|data\/.*\.json/i);
});

test("story P1 UI has bounded responsive script and analysis surfaces", () => {
  const css = read("platform.css");
  assert.match(css, /\.story-script-layout \{[^}]*grid-template-columns: minmax\(190px, 240px\)/);
  assert.match(css, /\.story-script-content textarea \{[^}]*min-height: 290px/);
  assert.match(css, /\.story-analysis-list \{[^}]*display: grid/);
  assert.match(css, /\.story-asset-grid \{[^}]*grid-template-columns: 1fr 1fr/);
  assert.match(css, /@media \(max-width: 900px\)[\s\S]*\.story-script-layout \{ grid-template-columns: 1fr; \}/);
  assert.match(css, /@media \(max-width: 720px\)[\s\S]*\.story-analysis-tags,[\s\S]*\.story-asset-grid \{ grid-template-columns: 1fr; \}/);
});

test("story P1 uses a script-episode-shot tree with confirmation-gated assets", () => {
  const story = read("platform.story.js");
  const css = read("platform.css");
  assert.match(story, /const STORY_DETAIL_TABS = \[/);
  for (const tab of ["script", "episodes"]) {
    assert.match(story, new RegExp(`id: "${tab}"`));
    assert.match(story, new RegExp(`data-story-tab-panel="${tab}"`));
  }
  assert.doesNotMatch(story, /id: "production"/);
  assert.doesNotMatch(story, /data-story-tab-panel="production"/);
  assert.doesNotMatch(story, /\{ id: "assets", label: "资产库"/);
  assert.match(story, /function renderStoryStructureTree\(/);
  assert.match(story, /function renderStoryShotProduction\(/);
  assert.match(story, /function renderStoryAssetLibraryModal\(/);
  assert.match(story, /data-story-open-asset-library/);
  assert.match(story, /data-story-library-episode/);
  assert.match(story, /data-story-library-shot/);
  assert.match(story, /loadStoryAssetLibraryEpisode\(event\.target\.value/);
  assert.match(story, /function storyShotAssetsConfirmed[\s\S]*assetsConfirmedAt/);
  assert.match(story, /data-story-confirm-shot-assets/);
  assert.match(story, /data-story-generate-shot-assets/);
  assert.match(story, /data-story-plan-shot-prompt/);
  assert.match(story, /function planStoryEpisodePrompts\(targetShotId = ""\)/);
  assert.match(story, /body: \{ provider: videoModel, optimizerModel, resolution, shotId: shot\.id \}/);
  const openLibrary = story.slice(story.indexOf("async function openStoryAssetLibrary("), story.indexOf("function closeStoryAssetLibrary("));
  assert.doesNotMatch(openLibrary, /advanced\/generate|createStoryAssetImageVariant|\/variants/);
  assert.match(story, /data-story-tab="\$\{tab\.id\}"/);
  assert.match(story, /function setStoryDetailTab\(/);
  assert.match(story, /setStoryDetailTab\(event\.target\.closest\("\[data-story-tab\]"\)/);
  assert.match(story, /storyState\.detailTab = "episodes"/);
  assert.match(css, /\.story-detail-tabs \{[^}]*display: flex/);
  assert.match(css, /\.story-tab-panel\[hidden\] \{ display: none; \}/);
  assert.match(css, /\.story-tree-layout \{/);
  assert.match(css, /\.story-shot-production-card \{/);
  assert.match(css, /\.story-asset-library-modal \{/);
});

test("story creation targets an episode and shot and opens a dedicated shot workspace", () => {
  const story = read("platform.story.js");
  const css = read("platform.css");
  const db = read("db.js");
  const handlers = read("server.parts/part-03.js");
  const routes = read("server.parts/part-42.js");
  assert.match(story, /id="storyScriptTargetEpisode" data-story-script-target-episode/);
  assert.match(story, /id="storyScriptTargetShot" data-story-script-target-shot/);
  assert.match(story, /placeholder="留空由 AI 规划"/);
  assert.match(story, /body: \{ title, content, targetEpisodeId, targetShotId, estimatedDurationSeconds \}/);
  const saveScript = story.slice(story.indexOf("async function saveStoryScriptDraft("), story.indexOf("async function analyzeStoryDraft("));
  assert.match(saveScript, /targetEpisodeSelect \? targetEpisodeSelect\.value/);
  assert.match(saveScript, /targetShotSelect \? targetShotSelect\.value/);
  assert.doesNotMatch(saveScript, /targetEpisodeSelect\?\.value \|\| storyState\.scriptTargetEpisodeId/);
  assert.match(story, /\/episodes\/\$\{encodeURIComponent\(episodeId\)\}\/shots/);
  assert.match(db, /ADD COLUMN IF NOT EXISTS target_episode_id/);
  assert.match(db, /ADD COLUMN IF NOT EXISTS target_shot_id/);
  assert.match(db, /ADD COLUMN IF NOT EXISTS estimated_duration_seconds/);
  assert.match(handlerBody(handlers, "handleCreateStoryScript"), /targetEpisodeId[\s\S]*targetShotId[\s\S]*estimatedDurationSeconds/);
  assert.match(handlers, /async function analyzeStoryScript\(\{ project = \{\}, script = \{\}, targetEpisodes = 0, targetEpisode = null, targetShot = null \}/);
  assert.match(handlers, /目标分集：\$\{targetEpisodeLabel\}/);
  assert.match(handlers, /目标分镜：\$\{targetShotLabel\}/);
  assert.match(handlers, /预计时长：约 \$\{estimatedDurationSeconds\} 秒/);
  assert.match(handlerBody(handlers, "handleAnalyzeStoryProject"), /script\.targetEpisodeId[\s\S]*script\.targetShotId[\s\S]*targetEpisode, targetShot/);
  assert.match(routes, /storyShotGenerationRefsMatch[\s\S]*handleCreateStoryGenerationRef/);
  assert.match(routes, /storyGenerationRefMatch[\s\S]*handleUpdateStoryGenerationRef/);

  const workspace = story.slice(story.indexOf("function renderStoryShotWorkspace("), story.indexOf("function storyShotFilterKey("));
  assert.match(workspace, /本镜所需资产/);
  assert.match(workspace, /生成视频/);
  assert.match(workspace, /data-story-generate-shot-video/);
  assert.match(workspace, /data-story-open-asset-library/);
  assert.doesNotMatch(workspace, /返回分集|剧情大纲|分镜清单/);

  const openShot = story.slice(story.indexOf("async function openStoryShot("), story.indexOf("async function generateStoryEpisodeShots("));
  assert.match(openShot, /await loadStoryEpisodeShots\(\)/);
  assert.match(openShot, /storyState\.episodeTab = "production"/);
  assert.doesNotMatch(openShot, /scrollIntoView|data-story-shot-card|advanced\/generate|generateStoryShotVideo/);
  assert.match(story, /class="story-tree-script is-static"/);
  assert.match(story, /锁定大纲，AI 拆分镜/);
  assert.match(css, /\.story-tree-script\.is-static \{ cursor: default; \}/);
  assert.match(css, /\.story-tree-episode:hover, \.story-tree-script\.is-active/);
  assert.match(css, /\.story-shot-workspace-grid \{[^}]*grid-template-columns/);
  assert.match(css, /@media \(max-width: 900px\)[\s\S]*\.story-shot-workspace-grid \{ grid-template-columns: 1fr;/);
});

test("story analyzer requests production-length episode outlines", () => {
  const handlers = read("server.parts/part-03.js");
  assert.match(handlers, /本集可制作剧情大纲，240-500个中文字符/);
  assert.match(handlers, /通常一章或一个完整情节单元拆为一集/);
  assert.match(handlers, /禁止只写一句话摘要/);
  assert.match(handlers, /开场 → 发展 → 转折 → 结尾/);
  assert.match(handlers, /repairStoryAnalysisHooks/);
  assert.match(handlers, /缺少结尾钩子/);
});

test("story episode workbench persists outline edits and AI-planned shots", () => {
  const handlers = read("server.parts/part-03.js");
  const routes = read("server.parts/part-42.js");
  const db = read("db.js");
  const imports = read("server.parts/part-01.js");
  for (const name of [
    "handleUpdateStoryEpisode",
    "handlePlanStoryEpisodeShots",
    "handleListStoryShots",
    "handleCreateStoryShot",
    "handleUpdateStoryShot",
    "handleDeleteStoryShot",
  ]) {
    assert.match(handlerBody(handlers, name), /requireAdmin\(req, res\)/, `${name} must require admin`);
  }
  assert.match(routes, /storyEpisodeMatch[\s\S]*req\.method === "PUT"[\s\S]*handleUpdateStoryEpisode/);
  assert.match(routes, /storyEpisodeShotsMatch[\s\S]*req\.method === "GET"[\s\S]*handleListStoryShots/);
  assert.match(routes, /storyEpisodeShotsMatch[\s\S]*req\.method === "POST"[\s\S]*handleCreateStoryShot/);
  assert.match(routes, /storyEpisodeShotsPlanMatch[\s\S]*req\.method === "POST"[\s\S]*handlePlanStoryEpisodeShots/);
  assert.match(routes, /storyShotMatch[\s\S]*req\.method === "PUT"[\s\S]*handleUpdateStoryShot/);
  assert.match(routes, /storyShotMatch[\s\S]*req\.method === "DELETE"[\s\S]*handleDeleteStoryShot/);
  for (const fn of ["updateStoryEpisodeInDb", "listStoryShotsFromDb", "createStoryShotInDb", "updateStoryShotInDb", "deleteStoryShotFromDb", "replaceStoryShotsInDb"]) {
    assert.match(db, new RegExp(`async function ${fn}\\(`), `db function ${fn}`);
    assert.match(db, new RegExp(`\\b${fn},`), `db export ${fn}`);
    assert.match(imports, new RegExp(`\\b${fn},`), `server import ${fn}`);
  }
  assert.match(db, /async function listStoryShotsFromDb[\s\S]*p\.owner_user_id = \$3[\s\S]*ORDER BY s\.shot_no ASC/);
  assert.match(db, /async function createStoryShotInDb[\s\S]*SELECT COALESCE\(MAX\(shot_no\), 0\) \+ 1/);
  assert.match(handlers, /STORY_SHOT_PLANNER_SYSTEM_PROMPT/);
  assert.match(handlers, /通常每5-10秒一个镜头/);
  assert.match(db, /async function replaceStoryShotsInDb[\s\S]*DELETE FROM app_story_shots/);
});

test("story episode workbench exposes AI storyboard flow and hook repair", () => {
  const story = read("platform.story.js");
  const css = read("platform.css");
  assert.match(story, /data-story-open-episode=/);
  assert.match(story, /data-story-close-episode/);
  assert.match(story, /data-story-episode-view="shots"/);
  assert.match(story, /data-story-save-episode/);
  assert.match(story, /data-story-lock-episode/);
  assert.match(story, /data-story-plan-shots/);
  assert.match(story, /data-story-delete-shot/);
  assert.match(story, /function setStoryEpisodeView\(/);
  assert.match(story, /function saveStoryEpisode\(/);
  assert.match(story, /function generateStoryEpisodeShots\(/);
  assert.match(story, /锁定大纲，AI 拆分镜/);
  assert.match(story, /shots\/plan/);
  assert.match(story, /function deleteStoryShot\(/);
  assert.match(story, /const title = storyEl\("storyEpisodeEditTitle"\)\?\.value/);
  assert.match(story, /\/shots\/\$\{encodeURIComponent\(shotId\)\}`[\s\S]*method: "DELETE"/);
  assert.match(css, /\.story-episode-workspace \{/);
  assert.match(css, /\.story-workbench-head \{[^}]*grid-template-columns/);
  assert.match(css, /\.story-shot-ai-empty \{[^}]*grid-template-columns/);
  assert.match(css, /\.story-shot-row \{[^}]*grid-template-columns/);
  assert.match(css, /@media \(max-width: 720px\)[\s\S]*\.story-episode-actions \{ grid-column: 2; grid-row: 3/);
});

test("story production pipeline gates approved assets before model-optimized prompts", () => {
  const handlers = `${read("server.parts/part-03.js")}\n${read("server.parts/part-49.js")}`;
  const routes = read("server.parts/part-42.js");
  const db = read("db.js");
  const imports = read("server.parts/part-01.js");
  for (const name of [
    "handlePlanStoryEpisodeAssets",
    "handleCreateStoryAssetVariant",
    "handleUpdateStoryAssetVariant",
    "handleApproveStoryAssetVariant",
    "handlePlanStoryEpisodePrompts",
  ]) {
    assert.match(handlerBody(handlers, name), /requireAdmin\(req, res\)/, `${name} must require admin`);
  }
  for (const route of [
    /storyEpisodeAssetsPlanMatch[\s\S]*handlePlanStoryEpisodeAssets/,
    /storyAssetVariantsMatch[\s\S]*handleCreateStoryAssetVariant/,
    /storyAssetVariantMatch[\s\S]*handleUpdateStoryAssetVariant/,
    /storyAssetVariantApproveMatch[\s\S]*handleApproveStoryAssetVariant/,
    /storyEpisodePromptsPlanMatch[\s\S]*handlePlanStoryEpisodePrompts/,
  ]) assert.match(routes, route);
  for (const fn of [
    "upsertStoryAssetPlanInDb",
    "listStoryAssetVariantsFromDb",
    "createStoryAssetVariantInDb",
    "updateStoryAssetVariantInDb",
    "approveStoryAssetVariantInDb",
    "createStoryPromptVersionInDb",
  ]) {
    assert.match(db, new RegExp(`async function ${fn}\\(`), `db function ${fn}`);
    assert.match(db, new RegExp(`\\b${fn},`), `db export ${fn}`);
    assert.match(imports, new RegExp(`\\b${fn},`), `server import ${fn}`);
  }
  assert.match(handlers, /STORY_ASSETS_NOT_APPROVED/);
  assert.match(handlers, /function storyAssetDesignReady[\s\S]*storyApprovedVariantHasImage/);
  assert.match(handlers, /const episodeAssets = \(allAssets \|\| \[\]\)\.filter\(\(asset\) => storyAssetBelongsToEpisode\(asset, episode\)\)/);
  assert.match(handlers, /const assets = targetShot \? episodeAssets\.filter\(\(asset\) => storyShotUsesAsset\(asset, targetShot\)\) : episodeAssets/);
  assert.match(handlers, /const unapproved = assets\.filter\(\(asset\) => !storyAssetDesignReady\(asset, variants \|\| \[\]\)\)/);
  assert.match(handlers, /if \(unapproved\.length\)[\s\S]*STORY_ASSETS_NOT_APPROVED/);
  assert.match(handlers, /provider\.promptOptimizer[\s\S]*STORY_VIDEO_MODEL_OPTIMIZER_UNAVAILABLE/);
  assert.match(handlers, /promptOptimizerRequestForPayload/);
  assert.match(handlers, /includes\("vega"\)[\s\S]*"Seedance"[\s\S]*【\$\{label\} 执行约束】单一连续镜头/);
  assert.match(db, /async function createStoryPromptVersionInDb[\s\S]*COALESCE\(MAX\(version_no\), 0\) \+ 1/);
  assert.match(db, /async function createStoryPromptVersionInDb[\s\S]*video_prompt = \$3[\s\S]*status = 'prompt_ready'/);
  assert.match(handlers, /const targetShotId = storyInputText\(body\.shotId, 120\)/);
  assert.match(handlers, /const promptShots = targetShotId[\s\S]*shots\.filter\(\(shot\) => shot\.id === targetShotId\)/);
  assert.match(handlers, /createStoryPromptVersionInDb\(\{[\s\S]*prompt: optimized\.optimizedPrompt/);
});

test("story shot prompt source never injects the episode hook into every shot", () => {
  const handlers = read("server.parts/part-03.js");
  const start = handlers.indexOf("function storyShotProductionPrompt(");
  assert.notEqual(start, -1);
  const promptSource = handlers.slice(start, handlers.indexOf("\n}\n", start));
  assert.match(promptSource, /关键对白/);
  assert.doesNotMatch(promptSource, /本集钩子/);
});

test("story production UI selects image and video models and writes only optimized shot prompts", () => {
  const story = read("platform.story.js");
  const css = read("platform.css");
  assert.match(story, /data-story-image-model/);
  assert.match(story, /data-story-video-model/);
  assert.match(story, /data-story-optimizer-model/);
  assert.match(story, /data-story-prompt-resolution/);
  assert.match(story, /AI 提取本集资产/);
  assert.match(story, /补齐 \$\{missingImageAssets\.length\} 个资产图/);
  assert.match(story, /storyAssetsNeedingImage/);
  assert.match(story, /function storyAssetHasApprovedImage[\s\S]*storyAssetVariantImageUrl\(approved\)/);
  assert.match(story, /assets\.every\(\(asset\) => storyAssetHasApprovedImage\(asset\)\)/);
  assert.match(story, /function storyVariantStatusLabel[\s\S]*可审核/);
  assert.match(story, /设计图已齐，待审核/);
  assert.match(story, /历史失败 \$\{failedCount\} 次，已收起/);
  assert.match(story, /已完成 \$\{index\} \/ \$\{assets\.length\}，剩余/);
  assert.match(story, /资产定稿后才会解锁视频提示词/);
  assert.match(story, /AI 提取本集资产/);
  assert.match(story, /下一步：选模型并生成提示词/);
  assert.match(story, /按所选模型生成全部提示词/);
  assert.match(story, /本集提示词已按 \$\{selectedVideoModel\?\.label \|\| videoModel\} 优化并冻结/);
  assert.match(story, /function storyShotPromptMatchesModel[\s\S]*videoPromptMeta[\s\S]*meta\.provider[\s\S]*meta\.resolution/);
  assert.match(story, /const promptsOutdated = promptReadyCount > 0 && !promptsReady/);
  assert.match(story, /模型已变，需刷新/);
  assert.match(story, /刷新过期提示词/);
  assert.match(story, /旧提示词不会作为最终版本使用/);
  assert.match(story, /\/assets\/plan/);
  assert.match(story, /\/variants\/\$\{encodeURIComponent\(variantId\)\}\/approve/);
  assert.match(story, /\/prompts\/plan/);
  assert.match(story, /for \(let index = 0; index < shots\.length; index \+= 1\)/);
  assert.match(story, /body: \{ provider: videoModel, optimizerModel, resolution, shotId: shot\.id \}/);
  assert.match(story, /promptMatchesModel \? "已按当前模型优化"[\s\S]*模型已变，需刷新[\s\S]*待优化/);
  assert.match(story, /cdnImageUrl/);
  assert.match(story, /createKind: "story-asset"[\s\S]*storyAssetId: asset\.id/);
  assert.doesNotMatch(story, /createKind: "story-asset"[\s\S]{0,120}assetId: asset\.id/);
  assert.match(css, /\.story-production-toolbar \{/);
  assert.match(css, /\.story-production-controls \{/);
  assert.match(css, /\.story-production-assets \{/);
  assert.match(css, /\.story-asset-variant-list \{/);
  assert.match(css, /\.story-workflow-guide \{/);
  assert.match(css, /\.story-prompt-shot\.is-stale \{/);
  assert.match(css, /\.story-shot-action-buttons \{/);
});

test("shot assets generate, regenerate, approve, and reuse materials in place", () => {
  const story = read("platform.story.js");
  const css = read("platform.css");
  const db = read("db.js");
  const handlers = read("server.parts/part-03.js");
  const routes = read("server.parts/part-42.js");

  const workspace = story.slice(story.indexOf("function renderStoryShotWorkspace("), story.indexOf("function storyShotFilterKey("));
  assert.match(workspace, /storyDisplayAssetVariant\(asset\)/);
  assert.match(workspace, /data-story-media-image/);
  assert.match(workspace, /data-story-generate-asset=/);
  assert.match(workspace, /generated \? "重新生成" : "生成图片"/);
  assert.match(workspace, /data-story-generate-asset-shot="[\s\S]*?\$\{storyState\.action \? "disabled" : ""\}/);
  assert.match(workspace, /data-story-approve-variant=/);
  assert.match(workspace, /data-story-reuse-variant=/);
  assert.match(workspace, /data-story-use-variant=/);
  assert.match(workspace, /资产库只用于查看全项目记录/);
  assert.doesNotMatch(workspace, /在资产库审核|图片在资产库中审核定稿/);

  const library = story.slice(story.indexOf("function renderStoryAssetLibraryModal("), story.indexOf("function storyShotPromptMatchesModel("));
  assert.match(library, /assetLibraryExpandedAssetId/);
  assert.match(library, /const displayVariants = expanded \? expandedVariants : cover \? \[cover\] : \[\]/);
  assert.match(library, /data-story-library-expand-asset/);
  assert.match(library, /data-story-media-fallback/);
  assert.match(library, /assetLibraryMessage/);
  assert.match(story, /function storyReusableAssetVariants[\s\S]*variant\.status !== "approved"[\s\S]*sourceAsset\.kind === asset\.kind/);
  assert.match(story, /addEventListener\("error"[\s\S]*img\[data-story-media-image\]/);

  assert.match(db, /function canonicalStoryAssetName\(/);
  assert.match(db, /async function useStoryAssetVariantInDb\(/);
  assert.match(db, /approvedSourceAssetId[\s\S]*approvalMode: "reused"/);
  assert.match(db, /candidate\.includes\(canonical\) \|\| canonical\.includes\(candidate\)/);
  assert.match(handlers, /function storyApprovedVariantForAsset[\s\S]*variants\.find\(\(variant\) => variant\.id === approvedId/);
  assert.match(handlers, /async function handleUseStoryAssetVariant\(/);
  assert.match(routes, /storyAssetVariantUseMatch[\s\S]*handleUseStoryAssetVariant/);
  assert.match(css, /\.story-shot-workspace-asset-visual \{/);
  assert.match(css, /\.story-shot-asset-reuse \{/);
  assert.match(css, /\.story-library-message \{/);
});

test("story asset images use refreshed authenticated media URLs instead of persisted signed URLs", () => {
  const handlers = read("server.parts/part-03.js");
  const generation = read("server.parts/part-41.js");
  const story = read("platform.story.js");
  assert.match(handlers, /function storyAssetVariantClientView[\s\S]*adminGenerationMediaUrl\(generationRecordId\)/);
  assert.match(handlers, /assetVariants: \(assetVariants \|\| \[\]\)\.map\(storyAssetVariantClientView\)/);
  assert.match(handlers, /已定稿参考图记录：\$\{String\(variant\.metadata\.generationRecordId\)\.trim\(\)\}/);
  assert.doesNotMatch(handlers, /已定稿参考图：\$\{variant\.metadata\.imageUrl\}/);
  assert.match(story, /function storyAssetVariantImageUrl\(variant = \{\}\)[\s\S]*variant\.mediaUrl[\s\S]*metadata\?\.mediaUrl/);
  assert.match(story, /src="\$\{storyEscape\(storyAssetVariantImageUrl\(variant\)\)\}"/);
  assert.match(generation, /function generationRecordInlineMediaUrl\(target = \{\}\)/);
  assert.match(generation, /makeOssSignedCdnUrl\(\{[\s\S]*download: false/);
  assert.match(generation, /proxyRemoteMedia\(req, res, inlineUrl/);
});

test("story asset replanning removes stale episode scope and invalidates frozen prompts", () => {
  const db = read("db.js");
  const handlers = read("server.parts/part-03.js");
  const story = read("platform.story.js");
  assert.match(db, /async function invalidateStoryEpisodeProductionPrompts\(/);
  assert.match(db, /UPDATE app_story_prompt_versions[\s\S]*SET status = 'stale'/);
  assert.match(db, /UPDATE app_story_shots[\s\S]*SET video_prompt = ''/);
  assert.match(db, /metadata->'episodeIds' \? \$2/);
  assert.match(db, /filter\(\(id\) => id && id !== scopedEpisodeId\)/);
  assert.match(db, /if \(definitionChanged\)[\s\S]*delete metadata\.approvedVariantId/);
  assert.match(handlers, /if \(Array\.isArray\(metadata\.episodeIds\)\) return metadata\.episodeIds\.map\(String\)\.includes\(episodeId\)/);
  assert.match(story, /function storyAssetBelongsToEpisode[\s\S]*if \(episodeIds\.length\) return episodeIds\.includes\(episodeId\)/);
});
