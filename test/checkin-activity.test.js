"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const {
  CHECKIN_DEFAULT_CONFIG,
  checkinDateKey,
  checkinMonthKey,
  shiftDateKey,
  checkinCalendarForMonth,
  cycleDayForReward,
  cycleDayForDisplay,
  dailyRewardForCycleDay,
  calculateCheckinReward,
} = require("../checkin-core");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

test("daily rewards follow the seven-day cycle and restart at day one", () => {
  assert.deepEqual([1, 2, 3, 4, 5, 6, 7].map((day) => dailyRewardForCycleDay(day)), [5, 5, 8, 8, 8, 8, 30]);
  assert.equal(cycleDayForReward(1), 1);
  assert.equal(cycleDayForReward(7), 7);
  assert.equal(cycleDayForReward(8), 1);
  assert.equal(cycleDayForReward(14), 7);
  assert.equal(cycleDayForReward(15), 1);
});

test("display day separates current streak from today's checked state", () => {
  assert.equal(cycleDayForDisplay(3, false), 4);
  assert.equal(cycleDayForDisplay(3, true), 3);
  assert.equal(cycleDayForDisplay(7, false), 1);
  assert.equal(cycleDayForDisplay(7, true), 7);
});

test("check-in dates use the Asia/Shanghai UTC+8 day boundary", () => {
  assert.equal(checkinDateKey(new Date("2026-11-18T15:59:59.999Z")), "2026-11-18");
  assert.equal(checkinDateKey(new Date("2026-11-18T16:00:00.000Z")), "2026-11-19");
  assert.equal(checkinMonthKey("2026-11-19"), "2026-11");
  assert.equal(shiftDateKey("2026-11-30", 1), "2026-12-01");
  assert.equal(shiftDateKey("2026-03-01", -1), "2026-02-28");
});

test("monthly calendar includes every day and only checked days carry points", () => {
  const calendar = checkinCalendarForMonth("2026-11", [
    { date: "2026-11-01", points: 5 },
    { date: "2026-11-10", points: 28 },
  ]);
  assert.equal(calendar.length, 30);
  assert.deepEqual(calendar[0], { date: "2026-11-01", checked: true, points: 5 });
  assert.deepEqual(calendar[1], { date: "2026-11-02", checked: false, points: 0 });
  assert.deepEqual(calendar[9], { date: "2026-11-10", checked: true, points: 28 });
});

test("monthly milestone bonuses are paid once and respect the monthly cap", () => {
  const atTen = calculateCheckinReward({ cycleDay: 4, monthCount: 10, monthPoints: 80 });
  assert.equal(atTen.base, 8);
  assert.equal(atTen.bonus, 20);
  assert.equal(atTen.points, 28);

  const claimedTen = calculateCheckinReward({
    cycleDay: 4,
    monthCount: 10,
    monthPoints: 80,
    claimedMilestones: { 10: true },
  });
  assert.equal(claimedTen.bonus, 0);
  assert.equal(claimedTen.points, 8);

  const atTwenty = calculateCheckinReward({ cycleDay: 3, monthCount: 20, monthPoints: 200 });
  assert.equal(atTwenty.bonus, 50);
  assert.equal(atTwenty.points, 58);

  const capped = calculateCheckinReward({ cycleDay: 1, monthCount: 20, monthPoints: 395 });
  assert.equal(capped.base, 5);
  assert.equal(capped.bonus, 0);
  assert.equal(capped.points, 5);
  assert.equal(capped.capped, true);
});

test("check-in schema stores one durable row per user and Beijing date", () => {
  const db = read("db.js");
  const migrations = read("ops/run-db-migrations.js");
  for (const source of [db, migrations]) {
    assert.match(source, /CREATE TABLE IF NOT EXISTS app_checkin_records/);
    assert.match(source, /UNIQUE \(user_id, checkin_date\)/);
    assert.match(source, /CREATE TABLE IF NOT EXISTS app_checkin_stats/);
    assert.match(source, /ADD COLUMN IF NOT EXISTS expire_at TIMESTAMPTZ/);
  }
  assert.match(db, /new Date\(now\.getTime\(\) \+ config\.creditExpiryDays \* DAY_MS\)\.toISOString\(\)/);
  assert.match(db, /ORDER BY expire_at ASC, created_at ASC, id ASC/);
  assert.match(db, /WHERE user_id = \$1 AND expire_at IS NOT NULL AND COALESCE\(remaining, 0\) > 0/);
});

test("check-in API is idempotent and does not expose a makeup endpoint", () => {
  const routes = read("server.parts/part-42.js");
  const handlers = read("server.parts/part-50.js");
  const db = read("db.js");
  assert.match(routes, /url\.pathname === "\/api\/checkin\/status"/);
  assert.match(routes, /url\.pathname === "\/api\/checkin"/);
  assert.doesNotMatch(routes, /\/api\/checkin\/makeup/);
  assert.match(handlers, /return sendJson\(res, statusCode, \{ code, msg, data \}/);
  assert.match(db, /already: true/);
  assert.match(db, /capped: reward\.capped/);
  assert.match(handlers, /sendCheckinResponse\(res, 200, 0, "ok", result\)/);
  assert.match(handlers, /limit: 1/);
  assert.match(handlers, /windowMs: 1000/);
});

test("sidebar card is an entry only and sits between navigation groups", () => {
  const html = read("platform.html");
  const tabsEnd = html.indexOf("</nav>", html.indexOf('<nav class="top-tabs"'));
  const card = html.indexOf('class="checkin-entry"');
  const utility = html.indexOf('class="side-utility-nav"');
  assert.ok(tabsEnd >= 0 && card > tabsEnd && utility > card);

  const cardMarkup = html.slice(html.indexOf("<button class=\"checkin-entry\""), html.indexOf("</button>", html.indexOf("<button class=\"checkin-entry\"")));
  assert.doesNotMatch(cardMarkup, /id="checkinAction"/);
  assert.match(html, /id="checkinModal"/);
  assert.match(html, /id="checkinMessage"/);
  assert.match(html, /class="checkin-milestones"/);
  assert.doesNotMatch(html, /checkin-miletones/);
});

test("check-in frontend initializes modal, keyboard, overlay, cross-day, and account state handling", () => {
  const script = read("platform.checkin.js");
  assert.match(script, /function cacheElements\(\)/);
  assert.match(script, /els\.action\?\.addEventListener\("click", submitCheckin\)/);
  assert.match(script, /event\.key === "Escape"/);
  assert.match(script, /querySelectorAll\("\[data-checkin-close\]"\)/);
  assert.match(script, /document\.addEventListener\("visibilitychange"/);
  assert.match(script, /window\.setInterval\(\(\) => syncAccountState\(\), ACCOUNT_WATCH_MS\)/);
  assert.match(script, /currentCheckinDate\(\) === ui\.currentDate/);
  assert.match(script, /function trapModalFocus\(event\)/);
  assert.match(script, /document\.readyState === "loading"/);
  assert.match(script, /function clearCheckinFly\(\)/);
  assert.match(script, /ui\.flyTimer = window\.setTimeout\(clearCheckinFly, 1300\)/);
  assert.match(script, /ui\.open = true;\s*clearCheckinFly\(\);\s*setMessage\("", \{\}\);/);
});

test("successful check-in keeps the modal open and refreshes authoritative status", () => {
  const script = read("platform.checkin.js");
  const start = script.indexOf("async function submitCheckin()");
  const end = script.indexOf("function openCheckinModal()", start);
  const submitSource = script.slice(start, end);
  assert.match(submitSource, /patchStatusFromResult\(result\)/);
  assert.match(submitSource, /await loadCheckinStatus\(\{ silent: true \}\)/);
  assert.match(submitSource, /setMessage\(/);
  assert.doesNotMatch(submitSource, /closeCheckinModal\(\)/);
});

test("check-in assets are loaded and publicly served", () => {
  const html = read("platform.html");
  const loader = read("platform.js");
  const siteHttp = read("site-http.js");
  const serverAssets = read("server.parts/part-01.js");
  const releaseSnapshot = read("scripts/build_release_snapshot.py");
  const syncScript = read("scripts/sync_old_to_new2.py");
  const deployScript = read("scripts/deploy_site.py");
  assert.match(html, /platform\.checkin\.css\?v=coupon-20261119-7/);
  assert.match(html, /platform\.js\?v=coupon-20261119-7/);
  assert.match(loader, /"platform\.checkin\.js"/);
  assert.match(siteHttp, /"\/platform\.checkin\.css"/);
  assert.match(serverAssets, /"platform\.checkin\.css"/);
  assert.match(releaseSnapshot, /"platform\.checkin\.css"/);
  assert.match(releaseSnapshot, /"checkin-core\.js"/);
  assert.match(syncScript, /"platform\.checkin\.css"/);
  assert.match(syncScript, /"checkin-core\.js"/);
  assert.match(deployScript, /"platform\.checkin\.css"/);
  assert.match(deployScript, /"checkin-core\.js"/);
});

test("check-in rewards appear in the admin recharge ledger", () => {
  const database = read("db.js");
  const server = read("server.parts/part-40.js");
  const admin = read("admin.js");
  assert.match(database, /'checkin_reward' AS source/);
  assert.match(database, /WHERE l\.type = 'checkin' AND l\.delta > 0/);
  assert.match(database, /row\.payload\?\.meta\?\.checkinDate/);
  assert.match(database, /checkinCount: Number\(first\.checkin_count \|\| 0\)/);
  assert.match(server, /source === "checkin_reward" \? "Daily check-in reward"/);
  assert.match(admin, /<option value="checkin_reward"/);
  assert.match(admin, /statCard\("签到奖励"/);
});

