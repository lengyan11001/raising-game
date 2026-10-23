const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

function showcaseCasesViewFromServer() {
  const server = read("server.js");
  const start = server.indexOf("const SHOWCASE_CASE_TITLE_TERMS");
  const end = server.indexOf("\n}\n\nfunction userHasApiDocsAccess", start);
  assert.ok(start >= 0 && end > start, "case view and title helpers should be present");
  return new Function("const SHOWCASE_CASES_PREVIEW_LIMIT = 2;\n" + `${server.slice(start, end + 2)}\nreturn { showcaseCasesView, showcaseCaseTitle };`)();
}

test("case API returns every case while withholding locked case content", () => {
  const server = read("server.js");
  const frontend = read("platform.cases.js");
  const cases = JSON.parse(read("assets/showcase/spicy/cases.json"));
  const { showcaseCasesView: view, showcaseCaseTitle } = showcaseCasesViewFromServer();
  const locked = view(cases, false);
  const unlocked = view(cases, true);

  assert.equal(locked.items.length, 146);
  assert.equal(unlocked.items.length, 146);
  assert.equal(locked.previewCount, 8);
  assert.equal(locked.lockedCount, 138);
  assert.deepEqual(locked.totals.byCategory, {
    image_gen: 69,
    i2v: 44,
    swap: 3,
    image_edit: 30,
  });
  for (const category of Object.keys(locked.totals.byCategory)) {
    const items = locked.items.filter((item) => item.category === category);
    assert.equal(items.length, locked.totals.byCategory[category]);
    assert.equal(items.filter((item) => item.locked === false).length, 2);
  }
  const lockedItem = locked.items.find((item) => item.locked);
  assert.ok(lockedItem);
  assert.deepEqual(Object.keys(lockedItem).sort(), [
    "category",
    "category_label",
    "created_at_str",
    "id",
    "locked",
    "model_key",
    "model_label",
    "title_en",
    "title_zh",
  ]);
  assert.equal(lockedItem.prompt, undefined);
  assert.equal(lockedItem.outputs, undefined);
  assert.equal(lockedItem.inputs, undefined);
  assert.equal(lockedItem.params, undefined);
  assert.ok(lockedItem.title_zh);
  assert.ok(lockedItem.title_en);
  const unlockedTitles = unlocked.items.map((item) => item.title_zh);
  assert.equal(new Set(unlockedTitles).size, unlocked.items.length);
  assert.ok(unlocked.items.every((item) => item.title_zh !== item.model_label));
  assert.match(showcaseCaseTitle(cases[0], "zh"), /深喉|口爆/);
  assert.match(showcaseCaseTitle(cases[0], "en"), /POV/);
  assert.match(server, /url\.pathname === "\/api\/cases"/);
  assert.match(server, /userHasCreatorMembership\(auth\.user\)/);
  assert.match(server, /items:\s*view\.items/);
  assert.match(server, /const user = auth\.user \|\| \{\};/);
  assert.match(server, /publicCreatorMembership\(user\)/);
  assert.match(server, /"\/assets\/showcase\/spicy\/cases\.json"/);
  assert.doesNotMatch(frontend, /fetch\("\/assets\/showcase\/spicy\/cases\.json"/);
  assert.match(frontend, /requestJson\("\/api\/cases"\)/);
  assert.match(frontend, /data-case-unlock/);
  assert.match(frontend, /item\.locked/);
  assert.match(frontend, /case-library-card is-locked/);
  assert.match(frontend, /function caseLibraryTitle\(/);
  assert.match(frontend, /caseLibraryTitle\(item\)/);
  assert.match(frontend, /billingPlanId:\s*"plan-main-creator"/);
  const payloadStart = server.indexOf("function creatorMembershipPayload(");
  const membershipEnd = server.indexOf("\n}\n\nconst SHOWCASE_CASES_FILE", payloadStart);
  const membershipSource = server.slice(payloadStart, membershipEnd + 2);
  const userHasCreatorMembership = new Function(`${membershipSource}\nreturn userHasCreatorMembership;`)();
  assert.equal(userHasCreatorMembership(null), false);
  assert.equal(userHasCreatorMembership({}), false);
});
