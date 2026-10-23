const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

function showcaseCasesViewFromServer() {
  const server = read("server.js");
  const start = server.indexOf("function showcaseCasesView(");
  const end = server.indexOf("\n}\n\nfunction userHasApiDocsAccess", start);
  assert.ok(start >= 0 && end > start, "showcaseCasesView should be present");
  return new Function("const SHOWCASE_CASES_PREVIEW_LIMIT = 2;\n" + `${server.slice(start, end + 2)}\nreturn showcaseCasesView;`)();
}

test("case API returns only two preview items per category until membership is active", () => {
  const server = read("server.js");
  const frontend = read("platform.cases.js");
  const cases = JSON.parse(read("assets/showcase/spicy/cases.json"));
  const view = showcaseCasesViewFromServer();
  const locked = view(cases, false);
  const unlocked = view(cases, true);

  assert.equal(locked.items.length, 8);
  assert.equal(unlocked.items.length, 146);
  assert.deepEqual(locked.totals.byCategory, {
    image_gen: 69,
    i2v: 44,
    swap: 3,
    image_edit: 30,
  });
  for (const category of Object.keys(locked.totals.byCategory)) {
    assert.equal(locked.items.filter((item) => item.category === category).length, 2);
  }
  assert.match(server, /url\.pathname === "\/api\/cases"/);
  assert.match(server, /userHasCreatorMembership\(auth\.user\)/);
  assert.match(server, /items:\s*view\.items/);
  assert.match(server, /const user = auth\.user \|\| \{\};/);
  assert.match(server, /publicCreatorMembership\(user\)/);
  assert.match(server, /"\/assets\/showcase\/spicy\/cases\.json"/);
  assert.doesNotMatch(frontend, /fetch\("\/assets\/showcase\/spicy\/cases\.json"/);
  assert.match(frontend, /requestJson\("\/api\/cases"\)/);
  assert.match(frontend, /data-case-unlock/);
  assert.match(frontend, /billingPlanId:\s*"plan-main-creator"/);
  const payloadStart = server.indexOf("function creatorMembershipPayload(");
  const membershipEnd = server.indexOf("\n}\n\nconst SHOWCASE_CASES_FILE", payloadStart);
  const membershipSource = server.slice(payloadStart, membershipEnd + 2);
  const userHasCreatorMembership = new Function(`${membershipSource}\nreturn userHasCreatorMembership;`)();
  assert.equal(userHasCreatorMembership(null), false);
  assert.equal(userHasCreatorMembership({}), false);
});
