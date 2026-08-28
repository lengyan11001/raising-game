"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const server = fs.readFileSync(path.join(__dirname, "..", "server.js"), "utf8");
const html = fs.readFileSync(path.join(__dirname, "..", "platform.html"), "utf8");
const create = fs.readFileSync(path.join(__dirname, "..", "platform.create.js"), "utf8");
const config = fs.readFileSync(path.join(__dirname, "..", "platform.config.js"), "utf8");

test("email authentication supports code login, binding and password reset", () => {
  assert.match(server, /sendEmailMessage\(/);
  assert.match(server, /api\.resend\.com\/emails/);
  assert.match(server, /consumeEmailCode\("login"/);
  assert.match(server, /consumeEmailCode\("reset"/);
  assert.match(server, /consumeEmailCode\("bind"/);
  assert.match(server, /\/api\/auth\/email\/request/);
  assert.match(server, /\/api\/auth\/password\/reset/);
  assert.match(server, /\/api\/account\/email\/verify/);
  assert.match(html, /id="loginEmail"/);
  assert.match(html, /id="loginEmailCode"/);
  assert.match(html, /id="accountEmail"/);
  assert.match(create, /requestEmailLoginCode/);
  assert.match(create, /forgotPassword/);
  assert.match(config, /accountSecurityMessage/);
});
