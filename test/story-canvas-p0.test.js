"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

const STORY_TABLES = [
  "app_story_projects",
  "app_story_script_versions",
  "app_story_episodes",
  "app_story_assets",
  "app_story_asset_variants",
  "app_story_shots",
  "app_story_prompt_versions",
  "app_story_generation_refs",
  "app_story_canvas_links",
];

test("story P0 schema is registered in runtime, readiness, and migration ledger", () => {
  const db = read("db.js");
  const migrations = read("ops/run-db-migrations.js");
  for (const table of STORY_TABLES) {
    assert.match(db, new RegExp(`CREATE TABLE IF NOT EXISTS ${table} \\(`), table);
    assert.match(migrations, new RegExp(`CREATE TABLE IF NOT EXISTS ${table} \\(`), `migration ${table}`);
    assert.match(db, new RegExp(`"${table}"`), `required table ${table}`);
  }
  assert.match(db, /"2026-11-16-story-canvas-p0-v1"/);
  assert.match(db, /"2026-11-17-story-script-targeting-v1"/);
  assert.match(db, /"2026-11-17-story-manuscript-lineage-v1"/);
  assert.match(db, /"2026-11-17-story-legacy-manuscript-group-v1"/);
  assert.match(db, /"2026-11-17-story-version-episode-ownership-v1"/);
  assert.match(migrations, /version: "2026-11-16-story-canvas-p0-v1"/);
  assert.match(migrations, /version: "2026-11-17-story-script-targeting-v1"/);
  assert.match(migrations, /version: "2026-11-17-story-manuscript-lineage-v1"/);
  assert.match(migrations, /version: "2026-11-17-story-legacy-manuscript-group-v1"/);
  assert.match(migrations, /version: "2026-11-17-story-version-episode-ownership-v1"/);
  assert.match(migrations, /const STORY_CANVAS_P0_DDL = Object\.freeze\(\[/);
  assert.match(migrations, /migration\.version === "2026-11-16-story-canvas-p0-v1"[\s\S]*STORY_CANVAS_P0_DDL/);
  assert.match(migrations, /const STORY_SCRIPT_TARGETING_DDL = Object\.freeze\(\[/);
  assert.match(migrations, /migration\.version === "2026-11-17-story-script-targeting-v1"[\s\S]*STORY_SCRIPT_TARGETING_DDL/);
  assert.match(migrations, /const STORY_MANUSCRIPT_LINEAGE_DDL = Object\.freeze\(\[/);
  assert.match(migrations, /migration\.version === "2026-11-17-story-manuscript-lineage-v1"[\s\S]*STORY_MANUSCRIPT_LINEAGE_DDL/);
  assert.match(migrations, /const STORY_LEGACY_MANUSCRIPT_GROUP_DDL = Object\.freeze\(\[/);
  assert.match(migrations, /migration\.version === "2026-11-17-story-legacy-manuscript-group-v1"[\s\S]*STORY_LEGACY_MANUSCRIPT_GROUP_DDL/);
  assert.match(migrations, /const STORY_VERSION_EPISODE_OWNERSHIP_DDL = Object\.freeze\(\[/);
  assert.match(migrations, /migration\.version === "2026-11-17-story-version-episode-ownership-v1"[\s\S]*STORY_VERSION_EPISODE_OWNERSHIP_DDL/);
  assert.match(db, /DROP CONSTRAINT IF EXISTS app_story_script_versions_project_id_version_no_key/);
  assert.match(db, /app_story_script_versions_manuscript_version_uidx[\s\S]*project_id, manuscript_id, version_no/);
  assert.match(migrations, /app_story_episodes_version_episode_uidx[\s\S]*project_id, source_script_version_id, episode_no/);
  assert.match(db, /PARTITION BY project_id, title[\s\S]*canonical_manuscript_id/);
});

test("story APIs are admin-session gated and use PostgreSQL data functions", () => {
  const handlers = read("server.parts/part-03.js");
  const routes = read("server.parts/part-42.js");
  const dbImports = read("server.parts/part-01.js");
  for (const handler of [
    "handleStoryContracts",
    "handleListStoryProjects",
    "handleCreateStoryProject",
    "handleGetStoryProject",
    "handleUpdateStoryProject",
    "handleListStoryEpisodes",
    "handleCreateStoryEpisode",
  ]) {
    const start = handlers.indexOf(`async function ${handler}(`);
    assert.notEqual(start, -1, `${handler} missing`);
    const end = handlers.indexOf("\n}\n", start);
    const body = handlers.slice(start, end);
    assert.match(body, /requireAdmin\(req, res, \{ loadDb: false \}\)/, `${handler} must require admin without loading the full app snapshot`);
  }
  const createEpisodeStart = handlers.indexOf("async function handleCreateStoryEpisode(");
  const createEpisodeBody = handlers.slice(createEpisodeStart, handlers.indexOf("\n}\n", createEpisodeStart));
  assert.match(createEpisodeBody, /DATABASE_UNAVAILABLE/, "database failures must not be reported as a missing project");
  for (const route of ["/api/story/contracts", "/api/story/projects", "/episodes"]) {
    assert.match(routes, new RegExp(route.replaceAll("/", "\\/")), `route ${route}`);
  }
  for (const fn of [
    "listStoryProjectsFromDb",
    "getStoryProjectFromDb",
    "createStoryProjectInDb",
    "updateStoryProjectInDb",
    "listStoryEpisodesFromDb",
    "createStoryEpisodeInDb",
    "listStoryCanvasLinksFromDb",
  ]) {
    assert.match(dbImports, new RegExp(fn), `server import ${fn}`);
  }
});

test("episodes tab is separate, admin-only, and loads its own module", () => {
  const config = read("platform.config.js");
  const html = read("platform.html");
  const loader = read("platform.js");
  const allowlist = read("server.parts/part-01.js");
  const storyModule = read("platform.story.js");
  const storyPanel = html.match(/<section class="story-panel"[\s\S]*?<\/section>\s*<section class="access-panel"/)?.[0] || "";
  assert.match(config, /"episodes"/);
  assert.match(config, /normalized === "episodes"\) return state\.user\?\.role === "admin"/);
  assert.match(html, /data-tab="episodes"/);
  assert.match(html, /data-panel="episodes"/);
  assert.match(html, /id="storyProjectForm"/);
  assert.ok(storyPanel, "story panel should be present");
  assert.doesNotMatch(storyPanel, /workflowRoot|workflow-react-host/);
  assert.match(loader, /"platform\.story\.js"/);
  assert.match(allowlist, /"platform\.story\.js"/);
  assert.match(storyModule, /\/api\/story\/projects/);
  assert.doesNotMatch(storyModule, /localStorage|data\/.*\.json/i);
});

test("episodes library uses the Old-site dark theme and canvas-style project cards", () => {
  const css = read("platform.css");
  const html = read("platform.html");
  const storyModule = read("platform.story.js");
  assert.match(css, /\.story-panel \{[\s\S]*--story-pink: var\(--cyan\)/);
  assert.match(css, /\.story-panel \{[\s\S]*#111014/);
  assert.match(css, /\.story-project-library \{[^}]*grid-template-columns: repeat\(4/);
  assert.match(css, /\.story-project-preview \{[^}]*aspect-ratio: 16 \/ 9/);
  assert.match(html, /id="storyCreateSheet"/);
  assert.match(html, /class="story-project-library" id="storyProjectList"/);
  assert.match(storyModule, /class="story-project-card/);
  assert.match(storyModule, /class="story-project-preview"/);
  assert.match(storyModule, /data-story-back/);
  assert.match(storyModule, /const form = event\.currentTarget;/);
  assert.doesNotMatch(storyModule, /await[\s\S]{0,1200}event\.currentTarget\.reset\(\)/);
  assert.match(storyModule, /form\.reset\(\);[\s\S]*setStoryCreateOpen\(false\);/);
});
