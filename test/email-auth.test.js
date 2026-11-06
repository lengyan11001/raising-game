"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const { readServerSource } = require("../server-source");

const server = readServerSource();
const html = fs.readFileSync(path.join(__dirname, "..", "platform.html"), "utf8");
const create = [
  "part-01.js",
  "part-02.js",
  "part-03.js",
  "part-04.js",
  "part-05.js",
  "part-06.js",
].map((file) => fs.readFileSync(path.join(__dirname, "..", "platform.create.parts", file), "utf8")).join("\n");
const config = fs.readFileSync(path.join(__dirname, "..", "platform.config.js"), "utf8");

test("email authentication supports SMTP code login, binding and password reset", () => {
  assert.match(server, /sendEmailMessage\(/);
  assert.match(server, /sendSmtpMail\(/);
  assert.doesNotMatch(server, /resend\.com|RESEND_API_KEY/i);
  assert.match(server, /upsertEmailChallengeInDb\(/);
  assert.match(server, /consumeEmailChallengeInDb\(/);
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

test("email verification is the default login method with password as an explicit fallback", () => {
  assert.match(html, /id="emailLoginTab"[^>]*aria-selected="true"/);
  assert.match(html, /id="emailLoginPanel"/);
  assert.match(html, /id="passwordLoginTab"[^>]*aria-selected="false"/);
  assert.match(html, /id="passwordLoginPanel"[^>]*hidden/);
  assert.match(create, /function setLoginMethod\(method = "email"\)/);
  assert.match(create, /setLoginMethod\("email"\)/);
  assert.match(create, /if \(!emailEnabled\) setLoginMethod\("password"\)/);
  assert.match(config, /emailLoginTab: document\.querySelector\("#emailLoginTab"\)/);
  assert.match(config, /passwordLoginPanel: document\.querySelector\("#passwordLoginPanel"\)/);
});

test("email verification challenges are persisted in PostgreSQL with expiry and attempt limits", () => {
  const database = fs.readFileSync(path.join(__dirname, "..", "db.js"), "utf8");
  assert.match(database, /CREATE TABLE IF NOT EXISTS app_email_challenges/);
  assert.match(database, /challenge_key TEXT PRIMARY KEY/);
  assert.match(database, /code_hash TEXT NOT NULL/);
  assert.match(database, /attempts INTEGER NOT NULL DEFAULT 0/);
  assert.match(database, /expires_at TIMESTAMPTZ NOT NULL/);
  assert.match(database, /WHERE challenge_key = \$1 AND expires_at > NOW\(\) FOR UPDATE/);
  assert.match(database, /attempts >= 5/);
  assert.match(database, /WHERE app_email_challenges\.sent_at <= \$6::timestamptz/);
  assert.match(database, /minimumIntervalMs = 60_000/);
  assert.match(database, /code_hash = \$2/);
  assert.match(database, /DATABASE_URL is required for email verification codes/);
  assert.match(database, /const crypto = require\("node:crypto"\)/);
});
