const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

test("main site and both tool tenants use the 100-credit referral reward", () => {
  const server = read("server.js");
  const html = read("platform.html");
  const copy = read("platform.copy.js");

  assert.match(server, /const REFERRAL_REWARD_CREDITS = 100;/);
  assert.match(server, /tenantId: "tool-undress-14vips"[\s\S]*?allowedTabs: \[[^\]]*"referral"[\s\S]*?disabledTabs: \[(?![^\]]*"referral")/);
  assert.match(server, /tenantId: "tool-video-123tops"[\s\S]*?allowedTabs: \[[^\]]*"referral"[\s\S]*?disabledTabs: \[(?![^\]]*"referral")/);
  assert.match(html, /class="menu-item" data-tab="referral"/);
  assert.doesNotMatch(`${html}\n${copy}`, /750(?:-credit| credits| 积分)/);
});
