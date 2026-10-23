"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const {
  companionLevelSummary,
  intimacyStageForDays,
  nextCharacterRelationship,
  publicCharacterRelationship,
} = require("../companion-domain");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

test("intimacy stages follow the prototype thresholds", () => {
  assert.equal(intimacyStageForDays(0).id, "初识");
  assert.equal(intimacyStageForDays(2).id, "初识");
  assert.equal(intimacyStageForDays(3).id, "熟悉");
  assert.equal(intimacyStageForDays(7).id, "亲近");
  assert.equal(intimacyStageForDays(15).id, "默契");
  assert.equal(intimacyStageForDays(30).id, "依恋");
  assert.equal(intimacyStageForDays(60).id, "唯一");
});

test("effective interaction days increase once per day and never carry across characters", () => {
  const first = nextCharacterRelationship(null, "character-a", new Date("2026-10-23T08:00:00+07:00"));
  assert.equal(first.effectiveDays, 1);
  assert.equal(first.lastEffectiveDay, "2026-10-23");
  const sameDay = nextCharacterRelationship(first, "character-a", new Date("2026-10-23T20:00:00+07:00"));
  assert.equal(sameDay.effectiveDays, 1);
  const otherCharacter = nextCharacterRelationship(null, "character-b", new Date("2026-10-23T20:00:00+07:00"));
  assert.equal(otherCharacter.effectiveDays, 1);
  const nextDay = nextCharacterRelationship(sameDay, "character-a", new Date("2026-10-24T09:00:00+07:00"));
  assert.equal(nextDay.effectiveDays, 2);
});

test("public relationship always returns the six stages and current copy", () => {
  const relationship = publicCharacterRelationship({ effectiveDays: 15 }, "character-a");
  assert.equal(relationship.stage, "默契");
  assert.equal(relationship.stageDescription, "会主动提起你以前说过的事");
  assert.equal(relationship.stages.length, 6);
});

test("companion level counts only paid USD topups and subtracts refunds", () => {
  const db = {
    walletOrders: [
      { userId: "u1", status: "paid", currency: "USD", orderKind: "topup", amount: 50 },
      { userId: "u1", status: "paid", currency: "USD", orderKind: "topup", amount: 25, refundedAmount: 5 },
      { userId: "u1", status: "pending", currency: "USD", orderKind: "topup", amount: 100 },
      { userId: "u1", status: "paid", currency: "CNY", orderKind: "topup", amount: 100 },
      { userId: "u1", status: "paid", currency: "USD", orderKind: "gift", amount: 100 },
      { userId: "u2", status: "paid", currency: "USD", orderKind: "topup", amount: 300 },
    ],
  };
  const level = companionLevelSummary(db, "u1");
  assert.equal(level.totalRechargeUsd, 70);
  assert.equal(level.level, "V3");
  assert.equal(level.nextLevel, "V4");
});

test("guide and relationship state are persisted in PostgreSQL", () => {
  const db = read("db.js");
  assert.match(db, /CREATE TABLE IF NOT EXISTS app_character_relationships/);
  assert.match(db, /CREATE TABLE IF NOT EXISTS app_user_guides/);
  assert.match(db, /async function getCharacterRelationshipInDb/);
  assert.match(db, /async function upsertGuideStateInDb/);
});

test("prototype entry points and controls are wired without replacing the design", () => {
  const html = read("platform.html");
  const explore = read("platform.explore.js");
  const chat = read("platform.chat.js");
  const ui = read("platform.ui.js");
  assert.match(html, /data-panel="characters"/);
  assert.match(html, /我的角色卡/);
  assert.match(html, /id="characterCreateOverlay"/);
  assert.match(html, /id="chatRelationshipPill"/);
  assert.match(html, /不只是聊天框/);
  assert.match(html, /Ta 能和你视频见面/);
  assert.match(html, /立即体验/);
  assert.match(html, /data-panel="relationship"/);
  assert.match(html, /data-panel="level"/);
  assert.match(html, /data-panel="profile-edit"/);
  assert.match(html, /头像与照片（最多 6 张，第一张为主图）/);
  assert.match(html, /兴趣标签（已选/);
  assert.match(html, /语音介绍（有助于提升匹配率）/);
  assert.match(html, /显示距离/);
  assert.match(html, /对陌生人展示我的动态/);
  assert.match(html, /等级在哪里看/);
  assert.match(explore, /callMe: String\(creator\.callMe \|\| ""\)/);
  assert.match(explore, /companion-profile-route/);
  assert.match(chat, /亲密度 · \$\{escapeHtml\(stage\)\}/);
  assert.match(ui, /syncCompanionGuideStateAfterLogin/);
  assert.match(ui, /loadRelationshipPanelData/);
  assert.match(ui, /\/api\/account\/profile/);
  assert.match(ui, /\/api\/account\/profile\/media/);
  assert.match(ui, /profilePrivacy/);
});

test("profile view and media persistence use the PostgreSQL-backed account payload", () => {
  const server = read("server.js");
  const ui = read("platform.ui.js");
  assert.match(server, /profileStats: publicProfileStats/);
  assert.match(server, /following: 0,/);
  assert.match(server, /followers: 0,/);
  assert.match(server, /giftsReceived,/);
  assert.match(server, /voiceIntroUrl: String\(user\.voiceIntroUrl \|\| ""\)/);
  assert.match(server, /showActivity: user\.profilePrivacy\?\.showActivity === true/);
  assert.match(server, /body\.profilePrivacy !== undefined/);
  assert.match(server, /kind === "voice"/);
  assert.match(ui, /voiceIntroUrl: String\(user\.voiceIntroUrl \|\| ""\)/);
  assert.match(ui, /showActivity: user\.profilePrivacy\?\.showActivity === true/);
});

test("creator card fields survive the public character mapping", () => {
  const server = read("server.js");
  assert.match(server, /creator: creator && Object\.keys\(creator\)\.length \? creator : null/);
  assert.match(server, /callMe: String\(creator\.callMe \|\| character\.callMe \|\| ""\)/);
  assert.match(server, /personalityTags: Array\.isArray\(creator\.tags\)/);
  assert.match(server, /voiceStyle: String\(creator\.voice/);
  assert.match(server, /relationStart: String\(creator\.relation/);
  assert.match(server, /greeting: String\(creator\.intro/);
});
