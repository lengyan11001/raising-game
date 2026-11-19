"use strict";

const CHECKIN_TIME_ZONE = "Asia/Shanghai";
const CHECKIN_UTC_OFFSET_MS = 8 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

function positiveNumber(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : fallback;
}

function nonNegativeInteger(value, fallback) {
  const number = Math.floor(Number(value));
  return Number.isFinite(number) && number >= 0 ? number : fallback;
}

function configList(value, fallback) {
  if (!Array.isArray(value) || !value.length) return fallback;
  const parsed = value.map((item) => Number(item));
  return parsed.every((item) => Number.isFinite(item) && item >= 0) ? parsed : fallback;
}

const CHECKIN_DEFAULT_CONFIG = Object.freeze({
  timeZone: CHECKIN_TIME_ZONE,
  dailyRewards: Object.freeze([5, 5, 8, 8, 8, 8, 30]),
  monthlyMilestones: Object.freeze([
    Object.freeze({ count: 10, points: 20 }),
    Object.freeze({ count: 20, points: 50 }),
  ]),
  monthlyCap: 400,
  creditExpiryDays: 90,
});

function checkinConfigFromEnv(env = process.env) {
  const rewards = configList(envJsonValue(env, "CHECKIN_DAILY_REWARDS"), [...CHECKIN_DEFAULT_CONFIG.dailyRewards]);
  const milestonesRaw = envJsonValue(env, "CHECKIN_MONTHLY_MILESTONES");
  const milestones = Array.isArray(milestonesRaw)
    ? milestonesRaw
      .map((item) => ({ count: nonNegativeInteger(item?.count, 0), points: nonNegativeInteger(item?.points, 0) }))
      .filter((item) => item.count > 0 && item.points >= 0)
    : [...CHECKIN_DEFAULT_CONFIG.monthlyMilestones].map((item) => ({ ...item }));
  return Object.freeze({
    timeZone: CHECKIN_TIME_ZONE,
    dailyRewards: Object.freeze(rewards.length === 7 ? rewards : [...CHECKIN_DEFAULT_CONFIG.dailyRewards]),
    monthlyMilestones: Object.freeze(milestones.length ? milestones : CHECKIN_DEFAULT_CONFIG.monthlyMilestones.map((item) => ({ ...item }))),
    monthlyCap: positiveNumber(env.CHECKIN_MONTHLY_CAP, CHECKIN_DEFAULT_CONFIG.monthlyCap),
    creditExpiryDays: positiveNumber(env.CHECKIN_CREDIT_EXPIRY_DAYS, CHECKIN_DEFAULT_CONFIG.creditExpiryDays),
  });
}

function envJsonValue(env, name) {
  const raw = String(env?.[name] || "").trim();
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch (error) {
    return null;
  }
}

function checkinDateKey(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) throw new TypeError("Invalid check-in date");
  return new Date(date.getTime() + CHECKIN_UTC_OFFSET_MS).toISOString().slice(0, 10);
}

function checkinMonthKey(dateKey = "") {
  const key = String(dateKey || "").slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(key) ? key.slice(0, 7) : "";
}

function shiftDateKey(dateKey = "", days = 0) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(dateKey || ""))) return "";
  const date = new Date(`${dateKey}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + Math.trunc(Number(days) || 0));
  return date.toISOString().slice(0, 10);
}

function checkinCalendarForMonth(monthKey = "", records = []) {
  const key = String(monthKey || "").trim();
  if (!/^\d{4}-\d{2}$/.test(key)) return [];
  const recordByDate = new Map((Array.isArray(records) ? records : []).map((record) => {
    const date = normalizeCheckinDateValue(record?.date || record?.checkin_date || record?.checkinDate);
    return [date, record];
  }).filter(([date]) => date.startsWith(`${key}-`)));
  const start = `${key}-01`;
  const nextMonthStart = `${checkinMonthKey(shiftDateKey(start, 32))}-01`;
  const calendar = [];
  for (let date = start; date < nextMonthStart; date = shiftDateKey(date, 1)) {
    const record = recordByDate.get(date) || null;
    calendar.push({ date, checked: Boolean(record), points: record ? Math.max(0, Number(record.points || 0) || 0) : 0 });
  }
  return calendar;
}

function cycleDayForReward(streak = 0) {
  const safeStreak = Math.max(0, Math.floor(Number(streak) || 0));
  return safeStreak > 0 ? ((safeStreak - 1) % 7) + 1 : 1;
}

function cycleDayForDisplay(streak = 0, checkedToday = false) {
  const safeStreak = Math.max(0, Math.floor(Number(streak) || 0));
  if (checkedToday) return cycleDayForReward(safeStreak);
  return (safeStreak % 7) + 1;
}

function dailyRewardForCycleDay(cycleDay = 1, config = CHECKIN_DEFAULT_CONFIG) {
  const safeDay = Math.min(7, Math.max(1, Math.floor(Number(cycleDay) || 1)));
  return Number(config.dailyRewards[safeDay - 1] || 0);
}

function requiredStreakForCycleDay(cycleDay = 1) {
  const safeDay = Math.min(7, Math.max(1, Math.floor(Number(cycleDay) || 1)));
  return safeDay === 1 ? 1 : safeDay;
}

function monthMilestones(config = CHECKIN_DEFAULT_CONFIG) {
  return (config.monthlyMilestones || CHECKIN_DEFAULT_CONFIG.monthlyMilestones).map((item) => ({ ...item }));
}

function nextMonthlyMilestone(monthCount = 0, config = CHECKIN_DEFAULT_CONFIG) {
  return monthMilestones(config).find((item) => Number(monthCount || 0) < item.count) || null;
}

function milestoneClaimed(count = 0, claimedMilestones = null) {
  const target = Number(count || 0);
  if (target <= 0 || !claimedMilestones) return false;
  if (Array.isArray(claimedMilestones)) return claimedMilestones.map(Number).includes(target);
  if (typeof claimedMilestones === "object") {
    return Boolean(claimedMilestones[target] || claimedMilestones[`count${target}`] || claimedMilestones[`got${target}`]);
  }
  return false;
}

function calculateCheckinReward({
  cycleDay = 1,
  monthCount = 0,
  monthPoints = 0,
  claimedMilestones = null,
  config = CHECKIN_DEFAULT_CONFIG,
} = {}) {
  const base = dailyRewardForCycleDay(cycleDay, config);
  const milestone = monthMilestones(config)
    .find((item) => Number(monthCount || 0) === item.count && !milestoneClaimed(item.count, claimedMilestones)) || null;
  const bonus = milestone ? Number(milestone.points || 0) : 0;
  const proposed = base + bonus;
  const remaining = Math.max(0, Number(config.monthlyCap || 0) - Number(monthPoints || 0));
  const issuedBase = Math.min(base, remaining);
  const issuedBonus = Math.min(bonus, Math.max(0, remaining - issuedBase));
  const points = issuedBase + issuedBonus;
  return {
    base: issuedBase,
    bonus: issuedBonus,
    proposed,
    points,
    capped: points < proposed,
    milestoneCount: milestone?.count || 0,
  };
}

function normalizeCheckinDateValue(value) {
  if (!value) return "";
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const year = value.getFullYear();
    const month = String(value.getMonth() + 1).padStart(2, "0");
    const day = String(value.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }
  const text = String(value).trim();
  return /^\d{4}-\d{2}-\d{2}/.test(text) ? text.slice(0, 10) : "";
}

module.exports = {
  CHECKIN_TIME_ZONE,
  CHECKIN_DEFAULT_CONFIG,
  checkinConfigFromEnv,
  checkinDateKey,
  checkinMonthKey,
  shiftDateKey,
  checkinCalendarForMonth,
  cycleDayForReward,
  cycleDayForDisplay,
  dailyRewardForCycleDay,
  requiredStreakForCycleDay,
  monthMilestones,
  nextMonthlyMilestone,
  calculateCheckinReward,
  normalizeCheckinDateValue,
};
