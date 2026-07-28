const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

test("base and tool shells load the Web Vitals collector", () => {
  const html = read("platform.html");
  const collector = read("platform.vitals.js");
  assert.match(html, /platform\.vitals\.js/);
  assert.match(collector, /largest-contentful-paint/);
  assert.match(collector, /layout-shift/);
  assert.match(collector, /interactionId/);
  assert.match(collector, /\/api\/analytics\/web-vitals/);
});

test("Web Vitals are stored and aggregated in PostgreSQL", () => {
  const db = read("db.js");
  assert.match(db, /CREATE TABLE IF NOT EXISTS app_web_vitals/);
  assert.match(db, /percentile_cont\(0\.75\)/);
  assert.match(db, /insertWebVitalSamplesInDb/);
  assert.match(db, /getWebVitalsSummaryFromDb/);
});

test("server validates public metrics and exposes an admin summary", () => {
  const server = read("server.js");
  const admin = read("admin.js");
  assert.match(server, /function webVitalRating/);
  assert.match(server, /url\.pathname === "\/api\/analytics\/web-vitals"/);
  assert.match(server, /getWebVitalsSummaryFromDb\(\{ days: 28 \}\)/);
  assert.match(admin, /renderGeoTabButton\("vitals", "网站性能"/);
  assert.match(admin, /路径与设备明细/);
});
