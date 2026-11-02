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
  const first = nextCharacterRelationship(null, "character-a", new Date("2026-10-23T08:00:00+07:00"), "text");
  assert.equal(first.effectiveDays, 1);
  assert.equal(first.lastEffectiveDay, "2026-10-23");
  assert.equal(first.activityDays["2026-10-23"], 1);
  assert.equal(first.activitySources["2026-10-23"], "text");
  const sameDay = nextCharacterRelationship(first, "character-a", new Date("2026-10-23T20:00:00+07:00"), "video");
  assert.equal(sameDay.effectiveDays, 1);
  assert.equal(sameDay.activitySources["2026-10-23"], "video");
  const otherCharacter = nextCharacterRelationship(null, "character-b", new Date("2026-10-23T20:00:00+07:00"));
  assert.equal(otherCharacter.effectiveDays, 1);
  const nextDay = nextCharacterRelationship(sameDay, "character-a", new Date("2026-10-24T09:00:00+07:00"), "video");
  assert.equal(nextDay.effectiveDays, 2);
  assert.equal(nextDay.activityDays["2026-10-24"], 1);
});

test("public relationship always returns the six stages and current copy", () => {
  const relationship = publicCharacterRelationship({ effectiveDays: 15 }, "character-a");
  assert.equal(relationship.stage, "默契");
  assert.equal(relationship.stageDescription, "会主动提起你以前说过的事");
  assert.equal(relationship.stages.length, 6);
  assert.equal(relationship.nextStage, "依恋");
  assert.equal(relationship.remainingDays, 15);
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

test("creator card fields survive the public character mapping", () => {
  const server = read("server.js");
  assert.match(server, /creator: creator && Object\.keys\(creator\)\.length \? creator : null/);
  assert.match(server, /callMe: String\(creator\.callMe \|\| character\.callMe \|\| ""\)/);
  assert.match(server, /personalityTags: Array\.isArray\(creator\.tags\)/);
  assert.match(server, /voiceStyle: String\(creator\.voice/);
  assert.match(server, /relationStart: String\(creator\.relation/);
  assert.match(server, /greeting: String\(creator\.intro/);
});
