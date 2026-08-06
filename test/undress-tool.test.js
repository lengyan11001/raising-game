"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const server = read("server.js");
const db = read("db.js");
const loader = read("platform.js");
const frontend = read("platform.undress-tool.js");
const history = read("platform.create.js");
const css = read("tool-undress.css");

test("undress.14vips.com is an isolated tenant without API or asset-library access", () => {
  assert.match(server, /undress\.14vips\.com=undress/);
  assert.match(server, /tenantId: "tool-undress-14vips"/);
  assert.match(server, /allowedTabs: \["gallery", "history", "topups", "spending"\]/);
  assert.match(server, /assetLibrary: false/);
  assert.match(db, /'tool-undress-14vips'/);
  assert.match(server, /function undressToolApiPathAllowed/);
  assert.match(server, /undressToolRequestAllowed\(req\) && url\.pathname\.startsWith\("\/api\/"\)/);
  assert.doesNotMatch(
    server.slice(server.indexOf("function undressToolApiPathAllowed"), server.indexOf("function undressToolFreeImageClaimId")),
    /video-tools|public\/characters|workflow|advanced/,
  );
  assert.match(server, /if \(undressToolRequestAllowed\(req\)\)[\s\S]*?allowedToolPath[\s\S]*?return sendText\(res, 404, "Not Found"\)/);
});

test("the first image claim is atomic, persistent, and released only after a failed claim", () => {
  assert.match(db, /async function claimToolFreeGenerationInDb/);
  assert.match(db, /ON CONFLICT \(id\) DO NOTHING/);
  assert.match(db, /app_credit_ledger_task_event_uidx/);
  assert.match(db, /ON CONFLICT DO NOTHING/);
  assert.match(db, /async function releaseToolFreeGenerationClaimInDb/);
  assert.match(db, /COALESCE\(payload->>'status', 'claimed'\) = 'claimed'/);
  assert.match(server, /claimToolFreeGenerationInDb\(\{/);
  assert.match(server, /freeImageGeneration \? 0 : pricing\.credits/);
  assert.match(server, /billingStatus: freeImageGeneration \? "free_generating"/);
  assert.match(server, /refundVideoToolTask[\s\S]*?releaseToolFreeGenerationClaimInDb/);
});

test("locked free results expose no media and cannot be downloaded or added to assets", () => {
  const publicView = server.slice(server.indexOf("function publicGenerationRecord"), server.indexOf("function adminGenerationRecordView"));
  assert.match(publicView, /record\.resultLocked === true/);
  assert.match(publicView, /publicRecord\.imageResultUrls = \[\]/);
  assert.match(publicView, /publicRecord\.mediaAssets = \[\]/);
  assert.match(publicView, /publicRecord\.prompt = ""/);
  assert.match(server, /code: "RESULT_LOCKED"/);
  assert.match(server, /saveGeneratedImageFile\(taskId, downloaded\.bytes, mime, \{ publish: !freeImageGeneration \}\)/);
  assert.match(server, /lockedRecord\?\.resultLocked === true/);
  assert.match(server, /objectStoragePath\("generated", "images", fileName\)/);
  assert.match(server, /async function handleUnlockUndressToolResult/);
  assert.match(server, /type: "undress_tool_image_unlock"/);
});

test("image and video share one upload control while video is always precharged and segmented", () => {
  assert.match(loader, /"platform\.undress-tool\.js"/);
  assert.match(frontend, /accept="image\/jpeg,image\/png,image\/webp,image\/bmp,video\/mp4/);
  assert.match(frontend, /requestJson\("\/api\/undress-tool\/generate"/);
  assert.match(frontend, /showPlayfluxSubmittedHistory/);
  assert.match(server, /const action = mediaKind === "video" \? "undress-video" : "undress"/);
  assert.match(server, /const freeClaimId = mediaKind === "image"/);
  assert.match(server, /planVideoEditSegments\(actualDuration\)/);
  assert.match(server, /composeVideoToolSegments\(taskId, generatedPaths\)/);
  assert.match(css, /\.video-tool-upload-preview[\s\S]*?object-fit: contain/);
});

test("History renders an unlock action instead of media for locked results", () => {
  assert.match(history, /const resultLocked = record\.resultLocked === true/);
  assert.match(history, /history-unlock-overlay/);
  assert.match(history, /const detailAction = isUndressHistory \? ""/);
  assert.match(history, /isUndressHistory \? "" : `<div class="history-card-actions/);
  assert.match(history, /\/api\/undress-tool\/tasks\/\$\{encodeURIComponent\(taskId\)\}\/unlock/);
  assert.match(history, /is-result-locked/);
});

test("insufficient unlock balance opens a top-up dialog", () => {
  assert.match(history, /async function showUndressInsufficientCreditsDialog/);
  assert.match(history, /error\.statusCode === 402 \|\| error\.code === "INSUFFICIENT_CREDITS"/);
  assert.match(history, /if \(result === "confirm"\) openTopupDialog\(\)/);
  assert.match(frontend, /showUndressInsufficientCreditsDialog\(error\)/);
  assert.match(css, /\.history-unlock-overlay[\s\S]*?position: absolute/);
});
