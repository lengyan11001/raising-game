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
