#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { Client } = require("pg");

const ROOT = path.resolve(__dirname, "..");
const TERMINAL_FAILURE_STATUSES = ["failed", "error", "cancelled", "canceled", "image_failed"];
const BILLING_BUCKETS = ["pre_deducted", "refund_failed", "refunded", "settled", "free", "charge_not_found_reversed", "other"];

function parseArgs(argv) {
  const args = { sinceDays: 30, envFile: process.env.ENV_FILE || "", json: false, limit: 20 };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--since-days") args.sinceDays = Number(argv[++index] || 0);
    else if (arg === "--env") args.envFile = argv[++index] || "";
    else if (arg === "--json") args.json = true;
    else if (arg === "--limit") args.limit = Number(argv[++index] || 0);
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
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    if (!process.env[key]) process.env[key] = value;
  }
}

function usage() {
  return [
    "Usage: node scripts/audit-generation-failures.js [options]",
    "",
    "Read-only failure audit grouped by billing state, provider, and normalized error class.",
    "The separate failed-pre-deducted repair command is required to change billing state.",
    "",
    "  --since-days <n>  Lookback window (default: 30)",
    "  --limit <n>       Maximum sample errors and anomalous task ids (default: 20, max: 200)",
    "  --json            Print machine-readable JSON",
    "  --env <path>      Load DATABASE_URL from an env file",
  ].join("\n");
}

function safeLimit(value) {
  return Math.max(1, Math.min(200, Math.trunc(Number(value || 20) || 20)));
}

function normalizeErrorClass(value = "") {
  const text = String(value || "").trim().toLowerCase();
  if (!text) return "no-error-message";
  if (/unauthorized|invalid.?api.?key|authentication|401\b/.test(text)) return "auth-or-credentials";
  if (/timeout|timed out|etimedout|econnreset|socket hang up|network|fetch failed|eai_again|enotfound/.test(text)) return "network-or-timeout";
  if (/rate.?limit|too many requests|429\b|quota/.test(text)) return "rate-limit-or-quota";
  if (/moderation|safety|sensitive|nsfw|content.?policy|rejected/.test(text)) return "moderation-or-policy";
  if (/invalid.?parameter|invalid.?input|validation|bad request|400\b/.test(text)) return "invalid-input";
  if (/not found|404\b|object.?missing|expired|signature|403\b/.test(text)) return "media-or-resource-missing";
  if (/billing|charge|refund|insufficient|credit/.test(text)) return "billing-or-refund";
  if (/upstream|provider|server error|internal|502\b|503\b|504\b|500\b/.test(text)) return "upstream-or-server";
  return "other";
}

async function auditGenerationFailures({ databaseUrl, sinceDays = 30, limit = 20 } = {}) {
  if (!databaseUrl) throw new Error("DATABASE_URL is required. Pass --env /etc/raising-game-demo.env or set it in the environment.");
  const safeDays = Math.max(1, Math.min(3650, Number(sinceDays || 30) || 30));
  const sampleLimit = safeLimit(limit);
  const client = new Client({ connectionString: databaseUrl, application_name: "raising-generation-failure-audit" });
  await client.connect();
  try {
    await client.query("SET TRANSACTION READ ONLY");
    const params = [TERMINAL_FAILURE_STATUSES, new Date(Date.now() - safeDays * 24 * 60 * 60 * 1000).toISOString()];
    const baseWhere = `
      COALESCE(payload->>'deletedAt', '') = ''
      AND LOWER(COALESCE(payload->>'status', '')) = ANY($1::text[])
      AND COALESCE(NULLIF(payload->>'createdAt', '')::timestamptz, created_at) >= $2::timestamptz
    `;
    const [billing, providers, errors, anomalies, records] = await Promise.all([
      client.query(`
        SELECT COALESCE(NULLIF(LOWER(payload->>'billingStatus'), ''), 'other') AS billing_status, COUNT(*)::int AS count
        FROM app_generation_records WHERE ${baseWhere}
        GROUP BY 1 ORDER BY 2 DESC
      `, params),
      client.query(`
        SELECT COALESCE(NULLIF(payload->>'provider', ''), NULLIF(payload->>'model', ''), '<unknown>') AS provider,
               COALESCE(NULLIF(LOWER(payload->>'billingStatus'), ''), 'other') AS billing_status,
               COUNT(*)::int AS count
        FROM app_generation_records WHERE ${baseWhere}
        GROUP BY 1, 2 ORDER BY 3 DESC LIMIT 50
      `, params),
      client.query(`
        SELECT COALESCE(NULLIF(LEFT(REGEXP_REPLACE(payload->>'error', '\\s+', ' ', 'g'), 240), ''), '<none>') AS error_sample, COUNT(*)::int AS count
        FROM app_generation_records WHERE ${baseWhere}
        GROUP BY 1 ORDER BY 2 DESC LIMIT $3
      `, [...params, sampleLimit]),
      client.query(`
        SELECT task_id, COALESCE(payload->>'provider', '') AS provider,
               COALESCE(payload->>'status', '') AS status,
               COALESCE(payload->>'billingStatus', '') AS billing_status,
               COALESCE(NULLIF(payload->>'preDeductedCredits', '')::numeric, 0) AS pre_deducted_credits
        FROM app_generation_records
        WHERE ${baseWhere}
          AND LOWER(COALESCE(payload->>'billingStatus', '')) IN ('pre_deducted', 'refund_failed')
          AND COALESCE(NULLIF(payload->>'preDeductedCredits', '')::numeric, 0) > 0
        ORDER BY COALESCE(NULLIF(payload->>'createdAt', '')::timestamptz, created_at) ASC
        LIMIT $3
      `, [...params, sampleLimit]),
      client.query(`
        SELECT task_id, COALESCE(payload->>'provider', '') AS provider,
               COALESCE(payload->>'status', '') AS status,
               COALESCE(payload->>'billingStatus', '') AS billing_status,
               LEFT(COALESCE(payload->>'error', ''), 240) AS error_sample,
               COALESCE(NULLIF(payload->>'createdAt', '')::timestamptz, created_at) AS created_at
        FROM app_generation_records
        WHERE ${baseWhere}
        ORDER BY COALESCE(NULLIF(payload->>'createdAt', '')::timestamptz, created_at) DESC
        LIMIT $3
      `, [...params, sampleLimit]),
    ]);
    const billingCounts = Object.fromEntries(BILLING_BUCKETS.map((bucket) => [bucket, 0]));
    for (const row of billing.rows) billingCounts[row.billing_status] = Number(row.count || 0);
    const total = Object.values(billingCounts).reduce((sum, count) => sum + count, 0);
    const errorClasses = {};
    for (const row of errors.rows) {
      const key = normalizeErrorClass(row.error_sample);
      errorClasses[key] = (errorClasses[key] || 0) + Number(row.count || 0);
    }
    const refundAnomalyCredits = anomalies.rows.reduce((sum, row) => sum + Number(row.pre_deducted_credits || 0), 0);
    return {
      mode: "generation-failure-read-only-audit",
      sinceDays: safeDays,
      totalFailures: total,
      billingCounts,
      refundAnomalies: {
        count: anomalies.rowCount,
        credits: Math.round(refundAnomalyCredits * 10000) / 10000,
        taskIds: anomalies.rows.map((row) => row.task_id),
      },
      providers: providers.rows,
      errorClasses,
      errorSamples: errors.rows.map((row) => ({ count: Number(row.count || 0), error: row.error_sample })),
      recent: records.rows,
    };
  } finally {
    await client.end().catch(() => {});
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(usage());
    return;
  }
  loadEnvFile(args.envFile);
  process.chdir(ROOT);
  const report = await auditGenerationFailures({
    databaseUrl: process.env.DATABASE_URL,
    sinceDays: args.sinceDays,
    limit: args.limit,
  });
  if (args.json) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }
  console.log(`Generation failures (${report.sinceDays}d): ${report.totalFailures}`);
  console.log(`Billing: ${Object.entries(report.billingCounts).map(([key, value]) => `${key}=${value}`).join(" ")}`);
  console.log(`Refund anomalies: count=${report.refundAnomalies.count} credits=${report.refundAnomalies.credits}`);
  if (report.refundAnomalies.taskIds.length) console.log(`Anomaly task ids: ${report.refundAnomalies.taskIds.join(", ")}`);
  console.log(`Error classes: ${Object.entries(report.errorClasses).map(([key, value]) => `${key}=${value}`).join(" ")}`);
  console.log("Providers:");
  for (const row of report.providers) console.log(`  ${row.provider} ${row.billing_status} ${row.count}`);
  console.log("Top errors:");
  for (const row of report.errorSamples) console.log(`  ${row.count} ${row.error}`);
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error.stack || error.message || error);
    process.exit(1);
  });
}

module.exports = {
  auditGenerationFailures,
  normalizeErrorClass,
  parseArgs,
};
