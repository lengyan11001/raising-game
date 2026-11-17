"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

function handlerBody(source, name) {
  const start = source.indexOf(`async function ${name}(`);
  assert.notEqual(start, -1, `${name} missing`);
  return source.slice(start, source.indexOf("\n}\n", start));
}

function storyNumberingHelpers() {
  const source = read("server.parts/part-03.js");
  const start = source.indexOf("function storyStartEpisodeNoForScript(");
  const end = source.indexOf("async function analyzeStoryScript(", start);
  assert.notEqual(start, -1, "storyStartEpisodeNoForScript missing");
  assert.notEqual(end, -1, "analyzeStoryScript missing");
  const context = {};
  vm.runInNewContext(`${source.slice(start, end)}\nthis.storyStartEpisodeNoForScript = storyStartEpisodeNoForScript; this.storyRenumberAnalysis = storyRenumberAnalysis;`, context);
  return context;
}

test("story continuation numbering starts after the manuscript and re-analysis keeps its segment range", () => {
  const { storyStartEpisodeNoForScript, storyRenumberAnalysis } = storyNumberingHelpers();
  const episodes = [
    { id: "e1", episodeNo: 1, sourceScriptVersionId: "v1", sourceManuscriptId: "m1" },
    { id: "e2", episodeNo: 2, sourceScriptVersionId: "v1", sourceManuscriptId: "m1" },
    { id: "e3", episodeNo: 3, sourceScriptVersionId: "v1", sourceManuscriptId: "m1" },
  ];
  assert.equal(storyStartEpisodeNoForScript({ id: "new" }, []), 1);
  assert.equal(storyStartEpisodeNoForScript({ id: "v2", manuscriptId: "m1" }, episodes), 4);
  assert.equal(storyStartEpisodeNoForScript({ id: "v1", manuscriptId: "m1" }, episodes), 1);
  const renumbered = storyRenumberAnalysis({ episodes: [{ title: "A" }, { title: "B" }] }, 4);
  assert.deepEqual(renumbered.episodes.map((episode) => episode.episodeNo), [4, 5]);
});

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
    assert.match(handlerBody(handlers, name), /requireAdmin\(req, res, \{ loadDb: false \}\)/, `${name} must require admin without loading the full app snapshot`);
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
  assert.match(db, /async function importStoryAnalysisInDb[\s\S]*BEGIN[\s\S]*DELETE FROM app_story_episodes WHERE project_id = \$1 AND source_script_version_id = \$2[\s\S]*ON CONFLICT \(project_id, source_script_version_id, episode_no\)[\s\S]*DO UPDATE[\s\S]*COMMIT/);
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
  assert.match(story, /function planStoryEpisodePrompts\(targetShotId = "", revisionFeedback = ""\)/);
  assert.match(story, /body: \{ provider: videoModel, optimizerModel, resolution, shotId: shot\.id, revisionFeedback \}/);
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

test("story creation keeps manuscripts and versions independent while retaining shot workspace targeting", () => {
  const story = read("platform.story.js");
  const css = read("platform.css");
  const db = read("db.js");
  const handlers = read("server.parts/part-03.js");
  const routes = read("server.parts/part-42.js");
  assert.match(story, /id="storyScriptCreateForm"/);
  assert.match(story, /id="storyScriptCreateContent"/);
  assert.match(story, /id="storyScriptCreateTargetEpisodes"/);
  assert.match(story, /id="storyScriptCreateDuration"/);
  assert.match(story, /data-story-script-create/);
  assert.match(story, /data-story-script-version-source/);
  assert.match(story, /function selectStoryScriptVersion\(/);
  assert.match(story, /event\.target\.closest\("\[data-story-script-id\]"\)/);
  assert.match(story, /function renderStoryManuscriptCard\(/);
  assert.match(story, /function storyManuscriptGroups\(/);
  assert.match(story, /collapsedManuscriptIds: \[\]/);
  assert.match(story, /collapsedEpisodeIds: \[\]/);
  assert.match(story, /expandedManuscriptIds\.includes\(group\.id\) && !storyState\.collapsedManuscriptIds\.includes\(group\.id\)/);
  assert.match(story, /expandedEpisodeIds\.includes\(episode\.id\) && !storyState\.collapsedEpisodeIds\.includes\(episode\.id\)/);
  assert.match(story, /function toggleStoryManuscript[\s\S]*collapsedManuscriptIds/);
  assert.match(story, /function toggleStoryEpisode[\s\S]*collapsedEpisodeIds/);
  const openEpisode = story.slice(story.indexOf("async function openStoryEpisode("), story.indexOf("function closeStoryEpisode("));
  assert.match(openEpisode, /sameEpisode && episodeExpanded[\s\S]*collapsedEpisodeIds\.push\(id\)[\s\S]*return/);
  assert.match(openEpisode, /selectStoryManuscriptById\(manuscriptId, episode\?\.sourceScriptVersionId \|\| ""\)/);
  assert.match(story, /sameManuscript && manuscriptExpanded[\s\S]*collapsedManuscriptIds\.push\(manuscriptId\)/);
  assert.match(story, /data-story-analysis-target-episodes/);
  assert.match(story, /data-story-analysis-duration/);
  assert.match(story, /const mode = storyState\.scriptCreateMode === "continue" \? "continue" : "new"/);
  assert.match(story, /body: \{[\s\S]*mode,[\s\S]*manuscriptId,[\s\S]*sourceScriptId: storyState\.scriptCreateSourceId/);
  assert.match(story, /sourceScriptId: storyState\.scriptCreateSourceId/);
  assert.match(story, /scriptCreateManuscriptId: ""/);
  assert.match(story, /episodeCreateManuscriptId: ""/);
  assert.match(story, /episodeCreateScriptId: ""/);
  assert.match(story, /targetEpisodeCount,/);
  assert.match(story, /estimatedDurationSeconds,/);
  assert.match(story, /body: \{ analysis, scriptVersionId \}/);
  assert.match(story, /const scriptVersionId = storyState\.analysisScriptId \|\| selectedStoryScript\(\)\?\.id \|\| ""/);
  assert.match(handlerBody(handlers, "handleCreateStoryScript"), /requestedMode === "continue" \|\| requestedMode === "version" \? "continue" : "new"/);
  assert.match(handlerBody(handlers, "handleCreateStoryScript"), /mode === "continue"[\s\S]*sourceScript\.manuscriptId \|\| sourceScript\.id/);
  assert.match(handlerBody(handlers, "handleCreateStoryEpisode"), /sourceScriptVersionId: sourceScript\.id/);
  assert.match(handlerBody(handlers, "handleCreateStoryEpisode"), /sourceManuscriptId,/);
  assert.match(handlerBody(handlers, "handleImportStoryAnalysis"), /sourceManuscriptId: sourceScript\.manuscriptId/);
  assert.match(db, /ADD COLUMN IF NOT EXISTS manuscript_id/);
  assert.match(db, /ADD COLUMN IF NOT EXISTS target_episode_count/);
  assert.match(db, /ADD COLUMN IF NOT EXISTS source_script_version_id/);
  assert.match(db, /ADD COLUMN IF NOT EXISTS source_manuscript_id/);
  assert.match(db, /ON CONFLICT \(project_id, source_script_version_id, episode_no\)/);
  assert.match(db, /app_story_episodes_version_episode_uidx/);
  assert.match(story, /episodesByVersion/);
  assert.match(story, /sourceScriptVersionId/);
  assert.match(story, /function storyScriptEpisodeRange\(/);
  assert.match(story, /story-tree-segment/);
  assert.match(story, /data-story-open-script-segment=/);
  assert.match(story, /segmentActive \? " is-active" : ""/);
  assert.match(story, /第 \$\{String\(version\.versionNo \|\| 1\)\.padStart\(2, "0"\)\} 段录入/);
  assert.match(story, /此段尚未拆解/);
  assert.match(handlers, /function storyStartEpisodeNoForScript\([\s\S]*ownEpisodeNos[\s\S]*manuscriptEpisodeNos/);
  assert.match(handlers, /function storyRenumberAnalysis\(/);
  assert.match(handlerBody(handlers, "handleAnalyzeStoryProject"), /const startEpisodeNo = storyStartEpisodeNoForScript\(script, existingEpisodes \|\| \[\]\)[\s\S]*startEpisodeNo,/);
  assert.match(db, /DROP CONSTRAINT IF EXISTS app_story_script_versions_project_id_version_no_key/);
  assert.match(db, /app_story_script_versions_manuscript_version_uidx/);
  assert.match(db, /async function createStoryEpisodeInDb\(\{[^}]*sourceScriptVersionId[^}]*sourceManuscriptId/);
  assert.match(db, /INSERT INTO app_story_episodes\(id, project_id, source_script_version_id, source_manuscript_id, episode_no/);
  assert.match(db, /WHERE project_id = \$1 AND \(\$2 = '' OR source_manuscript_id = \$2\)/);
  assert.match(css, /\.story-manuscript-card \{/);
  assert.match(css, /\.story-script-modal \{/);
  assert.match(css, /\.story-tree-disclosure \{/);
  assert.match(routes, /storyShotGenerationRefsMatch[\s\S]*handleCreateStoryGenerationRef/);
  assert.match(routes, /storyGenerationRefMatch[\s\S]*handleUpdateStoryGenerationRef/);

  const workspace = story.slice(story.indexOf("function renderStoryShotWorkspace("), story.indexOf("function storyShotFilterKey("));
  assert.match(workspace, /本镜所需资产/);
  assert.match(workspace, /生成视频/);
  assert.match(workspace, /data-story-generate-shot-video/);
  assert.match(workspace, /data-story-open-asset-library/);
  assert.doesNotMatch(workspace, /返回分集|剧情大纲|分镜清单/);

  const openShot = story.slice(story.indexOf("async function openStoryShot("), story.indexOf("async function createStoryShot("));
  assert.doesNotMatch(openShot, /data-story-open-episode|data-story-episode-view/);
  assert.match(story, /锁定大纲，AI 拆分镜/);
  assert.match(css, /\.story-shot-workspace-grid \{[^}]*grid-template-columns/);
  assert.match(css, /@media \(max-width: 900px\)[\s\S]*\.story-shot-workspace-grid \{ grid-template-columns: 1fr;/);
});

test("story analyzer requests production-length episode outlines", () => {
  const handlers = `${read("server.parts/part-03.js")}\n${read("server.parts/part-49.js")}`;
  assert.match(handlers, /本集可制作剧情大纲，建议300-900个中文字符/);
  assert.match(handlers, /通常一章或一个完整情节单元拆为一集/);
  assert.match(handlers, /不得把长集压成一句话/);
  assert.match(handlers, /开场 → 发展 → 转折 → 结尾/);
  assert.match(handlers, /repairStoryAnalysisHooks/);
  assert.match(handlers, /缺少结尾钩子/);
});

test("story episode workbench persists outline edits and AI-planned shots", () => {
  const handlers = `${read("server.parts/part-03.js")}\n${read("server.parts/part-49.js")}`;
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
    assert.match(handlerBody(handlers, name), /requireAdmin\(req, res, \{ loadDb: false \}\)/, `${name} must require admin without loading the full app snapshot`);
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
  assert.match(handlers, /recommendedDurationSeconds/);
  assert.match(handlers, /镜头数量必须按本集大纲的实际剧情密度决定/);
  assert.match(handlers, /不得默认输出 90 秒/);
  assert.match(db, /async function replaceStoryShotsInDb[\s\S]*DELETE FROM app_story_shots/);
  assert.match(db, /async function replaceStoryShotsInDb[\s\S]*duration_seconds = COALESCE\(\$5::int, duration_seconds\)/);
});

test("story episodes and durations are AI-planned unless the user explicitly overrides them", () => {
  const handlers = `${read("server.parts/part-03.js")}\n${read("server.parts/part-49.js")}`;
  const story = read("platform.story.js");
  const css = read("platform.css");
  const html = read("platform.html");
  const db = read("db.js");
  assert.match(handlers, /"durationSeconds": 0/);
  assert.match(handlers, /durationSeconds 必须由你按本集实际制作内容计算/);
  assert.match(handlers, /禁止默认套用 90 秒/);
  assert.match(handlers, /目标集数或目标时长时，它们是硬约束/);
  assert.match(handlers, /durationSeconds 总和必须在该目标上下 10% 以内/);
  assert.match(handlers, /targetDurationSeconds: body\.targetDurationSeconds/);
  assert.match(handlers, /episodeTarget = Math\.max\(0,/);
  assert.match(story, /class="story-script-modal-planning"/);
  assert.match(story, /目标集数<em>可选<\/em>/);
  assert.match(story, /目标时长<em>可选<\/em>/);
  assert.match(story, /本段目标集数<em>可选<\/em>[\s\S]*placeholder="AI 规划"/);
  assert.match(story, /本段目标时长<em>可选<\/em>[\s\S]*placeholder="AI 规划"/);
  assert.match(story, /续写段会自动从已有最大集号之后继续/);
  assert.match(story, /function renderStoryWindowHeader\(\)/);
  assert.match(story, /classList\.toggle\("is-detail"/);
  assert.match(story, /class="story-project-inline-head"/);
  assert.match(story, /class="story-project-inline-stats"/);
  assert.match(story, /data-story-add-episode[^>]*>[\s\S]*<span>新增分集<\/span>/);
  assert.doesNotMatch(story, /isDetail\)[\s\S]{0,500}data-story-create-open/);
  assert.match(story, /id="storyCreateProjectToggle"[\s\S]*<span>新增项目<\/span>/);
  assert.match(story, /document\.querySelector\("\.story-library-head"\)\?\.addEventListener\("click"/);
  assert.match(story, /function openStoryEpisodeCreate\(\)/);
  assert.match(story, /\[data-story-add-episode\][\s\S]*openStoryEpisodeCreate\(\)/);
  assert.match(story, /\[data-story-open-asset-library\][\s\S]*openStoryAssetLibrary\(\)/);
  assert.match(story, /body: \{ scriptVersionId: script\.id, targetEpisodes, targetDurationSeconds \}/);
  assert.match(story, /analysisTargetEpisodesDirty = true/);
  assert.match(story, /analysisDurationDirty = true/);
  assert.match(html, /预计集数（可选）[\s\S]*留空由 AI 判断/);
  assert.match(css, /\.story-analysis-toolbar \{[^}]*display: flex/);
  assert.match(css, /\.story-script-modal-planning \{[^}]*display: flex/);
  assert.match(css, /\.story-library-head\.is-detail \{[^}]*min-height: 34px[^}]*margin-bottom: 6px/);
  assert.match(css, /\.story-shell\.is-detail \{ margin-top: -8px; padding-top: 0; \}/);
  assert.match(css, /\.story-library-head\.is-detail \.story-project-inline-head h2 \{[^}]*margin: 0[^}]*line-height: 1/);
  assert.match(css, /\.story-detail \{ min-width: 0; padding: 0; \}/);
  assert.match(db, /episode_target INTEGER NOT NULL DEFAULT 0/);
  assert.match(db, /ALTER COLUMN episode_target SET DEFAULT 0/);
});

test("story episode workbench exposes AI storyboard flow and hook repair", () => {
  const story = read("platform.story.js");
  const css = read("platform.css");
  assert.match(story, /data-story-open-episode=/);
  assert.match(story, /data-story-close-episode/);
  assert.match(story, /data-story-toggle-episode/);
  assert.match(story, /function toggleStoryEpisode\(/);
  assert.match(story, /storyEpisodeShotsFromCache\(episode\.id\)/);
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
    assert.match(handlerBody(handlers, name), /requireAdmin\(req, res, \{ loadDb: false \}\)/, `${name} must require admin without loading the full app snapshot`);
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
  const handlers = `${read("server.parts/part-03.js")}\n${read("server.parts/part-49.js")}`;
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
  assert.match(story, /function openStoryRevisionRequest[\s\S]*storyRevisionFeedback/);
  assert.match(story, /storyAssetHasGeneratedImage\(asset\) && !revisionFeedback[\s\S]*openStoryRevisionRequest/);
  assert.match(story, /本次重新生成的修改要求：\$\{revisionFeedback\}/);
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
  assert.match(story, /body: \{ provider: videoModel, optimizerModel, resolution, shotId: shot\.id, revisionFeedback \}/);
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
  const handlers = `${read("server.parts/part-03.js")}\n${read("server.parts/part-49.js")}`;
  const routes = read("server.parts/part-42.js");

  const workspace = story.slice(story.indexOf("function renderStoryShotWorkspace("), story.indexOf("function storyShotFilterKey("));
  assert.match(workspace, /storyDisplayAssetVariant\(asset\)/);
  assert.match(workspace, /storyAssetVariantThumbnailUrl\(displayVariant \|\| \{\}\)/);
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
  assert.match(library, /assetLibraryPreviewAssetId/);
  assert.match(library, /storyAssetVariantThumbnailUrl\(cover \|\| \{\}\)/);
  assert.match(library, /const thumbnailUrl = storyAssetVariantThumbnailUrl\(variant\)/);
  assert.match(library, /<img src="\$\{storyEscape\(thumbnailUrl\)\}"/);
  assert.match(library, /data-story-library-preview-asset/);
  assert.match(library, /story-library-preview/);
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
  assert.match(css, /\.story-shot-workspace-asset-visual \{[^}]*width: 82px[^}]*max-height: 108px/);
  assert.match(css, /\.story-shot-asset-reuse \{/);
  assert.match(css, /\.story-library-message \{/);
  assert.match(css, /\.story-library-asset-cover \{/);
  assert.match(css, /\.story-library-preview-backdrop \{/);
});

test("generation record media supports cached image thumbnails", () => {
  const handlers = read("server.parts/part-41.js");
  assert.match(handlers, /async function generationRecordThumbnailFile\(/);
  assert.match(handlers, /scale='min\(480,iw\)':-2/);
  assert.match(handlers, /wantsThumbnail && isImageGenerationRecord\(record\)/);
  assert.match(handlers, /makeOssSignedImageCdnUrl\(\{ key: storage\.key, process: "thumbnail", config: OSS \}\)/);
  assert.match(handlers, /location: thumbnailUrl/);
  assert.match(handlers, /max-age=86400, immutable/);
});

test("story asset images use refreshed authenticated media URLs instead of persisted signed URLs", () => {
  const handlers = `${read("server.parts/part-03.js")}\n${read("server.parts/part-49.js")}`;
  const generation = read("server.parts/part-41.js");
  const story = read("platform.story.js");
  assert.match(handlers, /function storyAssetVariantClientView[\s\S]*adminGenerationMediaUrl\(generationRecordId\)/);
  assert.match(handlers, /assetVariants: \(assetVariants \|\| \[\]\)\.map\(storyAssetVariantClientView\)/);
  assert.match(handlers, /已定稿参考图记录：\$\{String\(variant\.metadata\.generationRecordId\)\.trim\(\)\}/);
  assert.doesNotMatch(handlers, /已定稿参考图：\$\{variant\.metadata\.imageUrl\}/);
  assert.match(story, /function storyAssetVariantImageUrl\(variant = \{\}\)[\s\S]*variant\.mediaUrl[\s\S]*metadata\?\.mediaUrl/);
  assert.match(story, /src="\$\{storyEscape\(storyAssetVariantThumbnailUrl\(variant\)\)\}"/);
  assert.match(story, /<a href="\$\{storyEscape\(imageUrl\)\}"[\s\S]*?<img src="\$\{storyEscape\(thumbnailUrl\)\}"/);
  assert.match(generation, /function generationRecordInlineMediaUrl\(target = \{\}\)/);
  assert.match(generation, /makeOssSignedCdnUrl\(\{[\s\S]*download: false/);
  assert.match(generation, /proxyRemoteMedia\(req, res, inlineUrl/);
});

test("story asset replanning removes stale episode scope and invalidates frozen prompts", () => {
  const db = read("db.js");
  const handlers = `${read("server.parts/part-03.js")}\n${read("server.parts/part-49.js")}`;
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

test("story video jobs bind approved asset IDs and sync completed backend records", () => {
  const story = read("platform.story.js");
  const handlers = `${read("server.parts/part-03.js")}\n${read("server.parts/part-49.js")}`;
  const generation = read("server.parts/part-20.js");

  assert.match(story, /function storyGenerationResultAssetId\(record = \{\}\)/);
  assert.match(story, /function storyGenerationResultAssetIds\(record = \{\}\)/);
  assert.match(story, /async function storyApprovedAssetReferences\(episode = \{\}, shot = \{\}\)/);
  assert.match(story, /generationRecordId\)\}\/add-asset[\s\S]*materialized\.asset\?\.id/);
  assert.match(story, /function storyVideoMediaParams\(model = \{\}, references = \[\]\)/);
  assert.match(story, /function storyIsWanVideoModel\(model = \{\}\)/);
  assert.match(story, /if \(storyIsWanVideoModel\(model\)\)[\s\S]*provider: wan30 \? "wan30" : "wan27"/);
  assert.match(story, /videoCapability: wan30Prime \? "wan30-video-prime" : wan30 \? "wan30-video" : "wan27-r2v"/);
  assert.match(story, /mediaMode: wan30 \? "multimodal" : "wan27-r2v"/);
  assert.match(story, /if \(storyIsVegaVideoModel\(model\)\)[\s\S]*mediaMode: "reference_video"/);
  assert.match(story, /if \(storyIsSeedanceVideoModel\(model\)\)[\s\S]*seedanceMode: "reference_video"/);
  assert.match(story, /const mediaEntry = \(reference\) => \(\{ assetId: reference\.assetId \}\)/);
  assert.match(story, /referenceImages: limited\.map\(mediaEntry\)/);
  assert.match(story, /firstFrameAssetId: limited\[0\]\.assetId/);
  assert.doesNotMatch(story, /storyGenerationReferenceImageUrl|upstreamUrlForProtectedGenerationMedia|UPSTREAM_REFERENCE_NOT_PUBLIC/);
  assert.match(story, /duration,[\s\S]*\.\.\.mediaParams,[\s\S]*params: \{/);
  assert.match(story, /const canGenerateVideo = promptReady && assetsApproved && !storyState\.action/);
  assert.doesNotMatch(story, /async function generateStoryShotVideo[\s\S]{0,900}if \(!storyShotAssetsConfirmed\(shot\)\)/);
  assert.match(story, /storyApprovedAssetReferences\(episode, shot\)/);
  assert.match(story, /if \(!Object\.keys\(mediaParams\)\.length\)[\s\S]*已阻止无素材生成/);
  assert.doesNotMatch(story, /await pollStoryVideoGenerationRecord\(taskId\)[\s\S]*loadStoryDetail\(projectId\)[\s\S]*视频已生成/);

  assert.match(story, /async function syncStoryVideoGenerationRefs\(projectId = ""\)/);
  assert.match(story, /function storyGenerationStatusSucceeded\(status = ""\)/);
  assert.match(story, /status: "succeeded"[\s\S]*videoUrl\b/);
  assert.match(story, /storyGenerationStatusSucceeded\(status\)[\s\S]*status: "succeeded"[\s\S]*mediaSyncPending: true/);
  assert.match(story, /mediaSyncPending: true[\s\S]*return;[\s\S]*\["failed", "error", "canceled", "cancelled"\]/);
  assert.match(story, /后台已完成，正在同步视频地址/);
  assert.match(story, /status: "failed"[\s\S]*record\.error \|\| record\.message/);
  assert.match(story, /syncStoryVideoGenerationRefs\(id\)/);
  assert.match(story, /addEventListener\("visibilitychange"/);
  assert.match(story, /scheduleStoryVideoGenerationSync\(15000\)/);
  assert.match(story, /data-story-generation-video data-generation-record-id/);
  assert.match(story, /const failed = \["failed", "error", "canceled", "cancelled"\]\.includes\(status\.toLowerCase\(\)\)/);
  assert.match(story, /const videoUrl = failed \? "" : storyGenerationRefVideoUrl\(ref\)/);
  assert.match(story, /async function refreshStoryGenerationVideoSource\(video = null\)/);
  assert.match(story, /refreshStoryGenerationVideoSource\(image\)/);
  assert.match(story, /\/api\/generation-records\/\$\{encodeURIComponent\(recordId\)\}/);
  assert.match(story, /video\.src = nextUrl[\s\S]*video\.load\(\)/);

  assert.match(handlers, /function storyGenerationRefClientView\(ref = \{\}\)/);
  assert.match(handlers, /const completed = \["succeeded", "success", "completed", "complete"\]\.includes\(status\)/);
  assert.match(handlers, /const mediaUrl = generationRecordId && ref\.kind === "video" && completed/);
  assert.match(handlers, /if \(mediaUrl\) metadata\.videoUrl = mediaUrl/);
  assert.match(handlers, /generationRefs: \(generationRefs \|\| \[\]\)\.map\(storyGenerationRefClientView\)/);
  assert.match(handlers, /generationRef: storyGenerationRefClientView\(ref\)/);
  assert.match(handlers, /metadata\.resultAssetId = String\(generatedRecord\.resultAssetId/);
  assert.match(handlers, /metadata\.resultAssetIds = Array\.isArray\(generatedRecord\.resultAssetIds\)/);
  assert.match(generation, /resultAssetId: String\(record\.resultAssetId \|\| ""\)/);
  assert.match(generation, /resultAssetIds: Array\.isArray\(record\.resultAssetIds\)/);
});
