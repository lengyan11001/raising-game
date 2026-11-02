"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const server = fs.readFileSync(path.resolve(__dirname, "..", "server.js"), "utf8");

function extractFunction(source, name) {
  const start = source.indexOf(`function ${name}(`);
  if (start === -1) throw new Error(`missing function ${name}`);
  let depth = 0;
  for (let index = source.indexOf("{", start); index < source.length; index += 1) {
    const char = source[index];
    if (char === "{") depth += 1;
    else if (char === "}") {
      depth -= 1;
      if (depth === 0) return source.slice(start, index + 1);
    }
  }
  throw new Error(`unterminated function ${name}`);
}

function buildUserView(auth) {
  return new Function(
    "currentAuthContext",
    "recordTenantId",
    "normalizeUserPricingMultiplier",
    "publicCreatorMembership",
    "userHasCreatorMembership",
    "publicApiDocsEntitlement",
    "userHasApiDocsAccess",
    `${extractFunction(server, "userView")}\nreturn userView;`,
  )(
    () => auth,
    (user) => String(user.tenantId || "main"),
    (_user, options = {}) => (options.channel === "api" ? 2 : 1),
    () => ({ active: false }),
    () => false,
    () => ({ enabled: false }),
    () => false,
  );
}

const user = {
  id: "user-parent",
  tenantId: "main",
  username: "parent",
  apiToken: "sk-parent-secret",
  credits: 100,
  role: "user",
  createdAt: "2026-10-22T00:00:00.000Z",
};

test("a sub token never receives the parent account API token", () => {
  const view = buildUserView({ tokenSource: "subtoken", tokenRecord: { id: "sat-child" } })(user);
  assert.equal(view.apiToken, "");
  assert.equal(view.id, user.id);
  assert.equal(view.credits, user.credits);
});

test("primary API tokens and browser sessions still receive their own API token", () => {
  assert.equal(buildUserView({ tokenSource: "api_token" })(user).apiToken, user.apiToken);
  assert.equal(buildUserView({ tokenSource: "session" })(user).apiToken, user.apiToken);
});
