#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const TEMPLATE_CODE = "NEWUSER_30_5OFF";
const GRANT_SOURCE = "backfill_all_20261119";

function parseArgs(argv) {
  const args = { apply: false, envFile: process.env.ENV_FILE || "" };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--apply") args.apply = true;
    else if (arg === "--dry-run") args.apply = false;
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
    "Usage: node ops/backfill-coupon-all-users-20261119.js [options]",
    "",
    "Options:",
    "  --dry-run       Count active users missing the coupon (default)",
    "  --apply         Issue the coupon to every active user missing it",
    "  --env <path>    Load DATABASE_URL from an env file",
  ].join("\n");
}

async function missingCouponCount(database) {
  const { rows } = await database.query(`
    SELECT COUNT(*)::int AS count
    FROM app_users u
    WHERE u.deleted_at IS NULL
      AND NOT EXISTS (
        SELECT 1
        FROM user_coupon c
        JOIN coupon_template ct ON ct.id = c.template_id
        WHERE c.user_id = u.id AND ct.code = $1
      )
  `, [TEMPLATE_CODE]);
  return Number(rows?.[0]?.count || 0);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(usage());
    return;
  }
  loadEnvFile(args.envFile);
  process.chdir(ROOT);
  const database = require(path.join(ROOT, "db"));
  await database.ensureSchema();
  const template = await database.getCouponTemplateByCodeInDb(TEMPLATE_CODE);
  if (!template || Number(template.status) !== 1) throw new Error(`Active coupon template ${TEMPLATE_CODE} was not found.`);
  const targetCount = await missingCouponCount(database);
  if (!args.apply) {
    console.log(JSON.stringify({ apply: false, target_count: targetCount, template_code: TEMPLATE_CODE }, null, 2));
    return;
  }
  const result = targetCount > 0
    ? await database.backfillCouponForAllActiveUsersInDb({ templateCode: TEMPLATE_CODE, grantSource: GRANT_SOURCE })
    : { target_count: 0, inserted_count: 0 };
  const remainingCount = await missingCouponCount(database);
  if (remainingCount !== 0) throw new Error(`Backfill left ${remainingCount} active users without ${TEMPLATE_CODE}.`);
  console.log(JSON.stringify({
    apply: true,
    target_count: targetCount,
    inserted_count: Number(result?.inserted_count || 0),
    remaining_count: remainingCount,
    template_code: TEMPLATE_CODE,
    grant_source: GRANT_SOURCE,
  }, null, 2));
}

if (require.main === module) {
  main().then(() => process.exit(process.exitCode || 0)).catch((error) => {
    console.error(`[backfill-coupon-all-users-20261119] ${error.message || error}`);
    process.exit(1);
  });
}

module.exports = { GRANT_SOURCE, TEMPLATE_CODE, loadEnvFile, missingCouponCount, parseArgs };
