#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "../..");
const TEMPLATE_CODE = "NEWUSER_30_5OFF";
const GRANT_SOURCE = "backfill_20261119";
const DEFAULT_EXPECTED = 603;

function parseArgs(argv) {
  const args = { apply: false, expected: DEFAULT_EXPECTED, allowMismatch: false, envFile: process.env.ENV_FILE || "" };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--apply") args.apply = true;
    else if (arg === "--dry-run") args.apply = false;
    else if (arg === "--expected") args.expected = Number(argv[++index] || 0);
    else if (arg === "--allow-mismatch") args.allowMismatch = true;
    else if (arg === "--env") args.envFile = String(argv[++index] || "");
    else if (arg === "--help" || arg === "-h") args.help = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return args;
}

function loadEnvFile(filePath = "") {
  if (!filePath || !fs.existsSync(filePath)) return;
  for (const line of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const separator = trimmed.indexOf("=");
    if (separator <= 0) continue;
    const key = trimmed.slice(0, separator).trim();
    let value = trimmed.slice(separator + 1).trim();
    if ((value.startsWith("\"") && value.endsWith("\"")) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value;
  }
}

function usage() {
  return [
    "Usage: node ops/archive/backfill-coupon-20261119.js [options]",
    "",
    "Options:",
    "  --dry-run            Count eligible users without writing (default)",
    "  --apply              Insert the one-time coupon batch",
    "  --expected <n>       Required target count (default: 603)",
    "  --allow-mismatch     Continue despite a target-count mismatch",
    "  --env <path>         Load DATABASE_URL from an env file",
  ].join("\n");
}

function evaluateBackfillCounts({ targetCount = 0, existingBackfillCount = 0, expected = DEFAULT_EXPECTED, allowMismatch = false } = {}) {
  const target = Math.max(0, Math.trunc(Number(targetCount || 0)));
  const existing = Math.max(0, Math.trunc(Number(existingBackfillCount || 0)));
  const required = Math.max(0, Math.trunc(Number(expected || 0)));
  const alreadyComplete = target === 0 && existing >= required;
  const firstRunMatches = existing === 0 && target === required;
  const partialRunMatches = existing > 0 && target + existing === required;
  return {
    targetCount: target,
    existingBackfillCount: existing,
    expected: required,
    alreadyComplete,
    safeToApply: allowMismatch || alreadyComplete || firstRunMatches || partialRunMatches,
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(usage());
    return;
  }
  loadEnvFile(args.envFile);
  process.chdir(ROOT);
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is required. Pass --env /etc/raising-game-demo.env or set it in the environment.");
  }
  const database = require("../../db");
  await database.ensureSchema();
  const countResult = await database.query(`
    SELECT COUNT(*)::int AS count
    FROM app_users u
    WHERE u.deleted_at IS NULL
      AND COALESCE(u.credits, 0) = 0
      AND NOT EXISTS (
        SELECT 1 FROM app_wallet_orders o
        WHERE o.user_id = u.id AND o.status = 'paid'
      )
      AND NOT EXISTS (
        SELECT 1 FROM user_coupon c WHERE c.user_id = u.id
      )
  `);
  const targetCount = Number(countResult.rows?.[0]?.count || 0);
  const existingResult = await database.query(`
    SELECT COUNT(*)::int AS count
    FROM user_coupon
    WHERE grant_source = $1
  `, [GRANT_SOURCE]);
  const existingBackfillCount = Number(existingResult.rows?.[0]?.count || 0);
  const expected = Math.max(0, Math.trunc(Number(args.expected || DEFAULT_EXPECTED)));
  const countState = evaluateBackfillCounts({
    targetCount,
    existingBackfillCount,
    expected,
    allowMismatch: args.allowMismatch,
  });
  if (!countState.safeToApply) {
    throw new Error(
      `Eligible user count is ${targetCount}, existing ${GRANT_SOURCE} rows are ${existingBackfillCount}, expected ${expected}. `
      + "Re-run with --allow-mismatch only after verifying the diff.",
    );
  }
  if (!args.apply) {
    console.log(JSON.stringify({
      apply: false,
      target_count: targetCount,
      existing_backfill_count: existingBackfillCount,
      expected,
      already_complete: countState.alreadyComplete,
      grant_source: GRANT_SOURCE,
    }, null, 2));
    return;
  }
  if (countState.alreadyComplete) {
    console.log(JSON.stringify({
      apply: true,
      target_count: 0,
      inserted_count: 0,
      existing_backfill_count: existingBackfillCount,
      grant_source_count: existingBackfillCount,
      already_complete: true,
      grant_source: GRANT_SOURCE,
    }, null, 2));
    return;
  }
  const result = await database.backfillZeroBalanceCouponsInDb({ templateCode: TEMPLATE_CODE, grantSource: GRANT_SOURCE });
  const verifyResult = await database.query(`SELECT COUNT(*)::int AS count FROM user_coupon WHERE grant_source = $1`, [GRANT_SOURCE]);
  const grantSourceCount = Number(verifyResult.rows?.[0]?.count || 0);
  if (grantSourceCount !== expected && !args.allowMismatch) {
    throw new Error(`Backfill verification count is ${grantSourceCount}, expected ${expected}.`);
  }
  console.log(JSON.stringify({
    apply: true,
    target_count: Number(result?.target_count || targetCount),
    inserted_count: Number(result?.inserted_count || 0),
    existing_backfill_count: existingBackfillCount,
    grant_source_count: grantSourceCount,
    already_complete: false,
    grant_source: GRANT_SOURCE,
  }, null, 2));
}

if (require.main === module) {
  main().then(() => process.exit(process.exitCode || 0)).catch((error) => {
    console.error(`[backfill-coupon-20261119] ${error.message || error}`);
    process.exit(1);
  });
}

module.exports = { evaluateBackfillCounts, parseArgs };
