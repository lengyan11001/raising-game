"use strict";

const INTIMACY_STAGES = Object.freeze([
  Object.freeze({ id: "初识", threshold: 0, description: "还在客气地认识你" }),
  Object.freeze({ id: "熟悉", threshold: 3, description: "开始记住你的事，也有了自己的喜好" }),
  Object.freeze({ id: "亲近", threshold: 7, description: "会用你告诉 Ta 的名字叫你，会主动找话聊" }),
  Object.freeze({ id: "默契", threshold: 15, description: "会主动提起你以前说过的事" }),
  Object.freeze({ id: "依恋", threshold: 30, description: "有了只属于你的称呼，会主动来找你" }),
  Object.freeze({ id: "唯一", threshold: 60, description: "你们相处过的痕迹，会出现在 Ta 的世界里" }),
]);

const COMPANION_LEVELS = Object.freeze([
  Object.freeze({ id: "V1", thresholdUsd: 0, title: "任意充值", benefits: ["解除试看限制", "基础装扮"] }),
  Object.freeze({ id: "V2", thresholdUsd: 20, title: "累计 $20", benefits: ["每日赠送时长", "更高画质"] }),
  Object.freeze({ id: "V3", thresholdUsd: 50, title: "累计 $50", benefits: ["单次通话时长提升", "优先接通"] }),
  Object.freeze({ id: "V4", thresholdUsd: 100, title: "累计 $100", benefits: ["专属场景与装扮", "新角色优先体验"] }),
  Object.freeze({ id: "V5", thresholdUsd: 300, title: "累计 $300", benefits: ["新功能内测", "专属客服通道"] }),
]);

function intimacyStageForDays(days = 0) {
  const value = Math.max(0, Number(days || 0));
  return [...INTIMACY_STAGES].reverse().find((stage) => value >= stage.threshold) || INTIMACY_STAGES[0];
}

function localDayKey(value = Date.now()) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return localDayKey(Date.now());
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function publicCharacterRelationship(relationship = null, characterId = "") {
  const effectiveDays = Math.max(0, Math.round(Number(relationship?.effectiveDays || 0)));
  const stage = intimacyStageForDays(effectiveDays);
  return {
    characterId: String(characterId || relationship?.characterId || ""),
    stage: stage.id,
    stageDescription: stage.description,
    effectiveDays,
    lastEffectiveDay: String(relationship?.lastEffectiveDay || ""),
    firstChatAt: String(relationship?.firstChatAt || ""),
    lastChatAt: String(relationship?.lastChatAt || ""),
    stages: INTIMACY_STAGES.map((item) => ({ ...item })),
  };
}

function nextCharacterRelationship(relationship = null, characterId = "", now = new Date()) {
  const effectiveDays = Math.max(0, Number(relationship?.effectiveDays || 0));
  const today = localDayKey(now);
  const nowIso = now.toISOString();
  const lastDay = String(relationship?.lastEffectiveDay || "");
  const nextDays = lastDay === today ? effectiveDays : effectiveDays + 1;
  return {
    ...(relationship || {}),
    characterId: String(characterId || relationship?.characterId || ""),
    effectiveDays: nextDays,
    lastEffectiveDay: today,
    firstChatAt: String(relationship?.firstChatAt || nowIso),
    lastChatAt: nowIso,
    updatedAt: nowIso,
  };
}

function companionLevelForRechargeUsd(value = 0) {
  const totalUsd = Math.max(0, Math.round(Number(value || 0) * 100) / 100);
  return [...COMPANION_LEVELS].reverse().find((level) => totalUsd >= level.thresholdUsd) || COMPANION_LEVELS[0];
}

function companionLevelSummary(db = {}, userId = "") {
  const paidOrders = (db.walletOrders || []).filter((order) => (
    String(order.userId || "") === String(userId || "")
    && String(order.status || "").toLowerCase() === "paid"
    && String(order.currency || "USD").toUpperCase() === "USD"
    && String(order.orderKind || "topup") === "topup"
  ));
  const totalUsd = Math.round(paidOrders.reduce((sum, order) => {
    const refunded = Math.max(0, Number(order.refundedAmount ?? order.refundAmount ?? order.stripeRefundedAmount ?? 0));
    return sum + Math.max(0, Number(order.baseAmount ?? order.amountUsd ?? order.amount ?? 0) - refunded);
  }, 0) * 100) / 100;
  const current = companionLevelForRechargeUsd(totalUsd);
  const currentIndex = COMPANION_LEVELS.findIndex((level) => level.id === current.id);
  const next = COMPANION_LEVELS[currentIndex + 1] || null;
  const progress = next
    ? Math.max(0, Math.min(1, (totalUsd - current.thresholdUsd) / Math.max(1, next.thresholdUsd - current.thresholdUsd)))
    : 1;
  return {
    level: current.id,
    title: current.title,
    totalRechargeUsd: totalUsd,
    nextLevel: next?.id || "",
    nextThresholdUsd: next?.thresholdUsd ?? null,
    remainingUsd: next ? Math.max(0, Math.round((next.thresholdUsd - totalUsd) * 100) / 100) : 0,
    progress,
    levels: COMPANION_LEVELS.map((level) => ({ ...level, current: level.id === current.id, reached: totalUsd >= level.thresholdUsd })),
  };
}

module.exports = {
  COMPANION_LEVELS,
  INTIMACY_STAGES,
  companionLevelForRechargeUsd,
  companionLevelSummary,
  intimacyStageForDays,
  localDayKey,
  nextCharacterRelationship,
  publicCharacterRelationship,
};
