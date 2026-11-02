"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const deploySite = fs.readFileSync(path.join(root, "scripts", "deploy_site.py"), "utf8");
const deployPull = fs.readFileSync(path.join(root, "scripts", "deploy_pull.py"), "utf8");

test("production deploy targets verify their intended domain surfaces", () => {
  assert.match(deploySite, /"health_url": "https:\/\/123vips\.com\/api\/health"/);
  assert.match(deploySite, /"health_url": "https:\/\/live\.123vipeak\.com\/api\/health"/);
  assert.match(deploySite, /"https:\/\/123vips\.com\/=platform\.css"/);
  assert.match(deploySite, /"https:\/\/live\.123vipeak\.com\/=live\.css"/);
  assert.match(deploySite, /"verify_urls": \("https:\/\/live\.123vipeak\.com\/", "https:\/\/123vips\.com\/"\)/);
  assert.match(deployPull, /--verify-url/);
  assert.match(deployPull, /--verify-contains/);
  assert.match(deployPull, /Verified page missing expected content/);
  assert.match(deployPull, /Page verification failed/);
  assert.match(deployPull, /Health check returned HTTP/);
  assert.match(deploySite, /expected_commit/);
  assert.match(deploySite, /"--commit"/);
  assert.match(deployPull, /Deployed commit mismatch/);
});

test("platform and live deploy targets reject frontend paths owned by the other surface", () => {
  const oldStart = deploySite.indexOf('"old": {');
  const liveStart = deploySite.indexOf('"live": {');
  const new2Start = deploySite.indexOf('"new2": {');
  const oldTarget = deploySite.slice(oldStart, liveStart);
  const liveTarget = deploySite.slice(liveStart, new2Start);

  assert.match(oldTarget, /"forbidden_changed_paths": \("live\.html", "live\.css", "live\.js"\)/);
  assert.match(liveTarget, /"forbidden_changed_paths": \("platform\.html", "platform\.css", "platform\*\.js"/);
  assert.match(liveTarget, /"admin\.html", "admin\.css", "admin\.js"/);
});
