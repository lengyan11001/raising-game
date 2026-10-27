#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");

function parseArgs(argv) {
  const args = {
    apply: false,
    staleHours: 2,
    limit: 100,
    taskIds: [],
    envFile: process.env.ENV_FILE || "",
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--apply") args.apply = true;
    else if (arg === "--dry-run") args.apply = false;
    else if (arg === "--stale-hours") args.staleHours = Number(argv[++index] || 0);
    else if (arg === "--limit") args.limit = Number(argv[++index] || 0);
    else if (arg === "--task-id") args.taskIds.push(String(argv[++index] || "").trim());
    else if (arg === "--env") args.envFile = argv[++index] || "";
    else if (arg === "--help" || arg === "-h") args.help = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return args;
}

function loadEnvFile(filePath = "") {
  if (!filePath || !fs.existsSync(filePath)) return;
  const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/);
  for (const line of lines) {
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
    "Usage: node scripts/repair-stalled-generation-records.js [options]",
    "",
    "Options:",
    "  --dry-run             Inspect matching records without writing (default)",
    "  --apply               Query upstream and terminalize stranded records",
    "  --stale-hours <n>     Only active records older than n hours (default: 2)",
    "  --limit <n>           Maximum records to inspect (default: 100, max: 500)",
    "  --task-id <id>        Restrict to one task id; repeatable",
    "  --env <path>          Load DATABASE_URL and provider settings from an env file",
  ].join("\n");
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
  const staleMs = Math.max(0, Number(args.staleHours || 0) * 60 * 60 * 1000);
  const server = require("../server");
  const summary = await server.repairStalledGenerationRecords({
    apply: args.apply,
    staleMs,
    limit: args.limit,
    taskIds: args.taskIds,
  });
  const safeSummary = {
    ...summary,
    results: summary.results.map(({ userId, ...item }) => item),
  };
  console.log(JSON.stringify(safeSummary, null, 2));
  if (summary.failed) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error.stack || error.message || error);
  process.exitCode = 1;
});
