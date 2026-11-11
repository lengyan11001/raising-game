#!/usr/bin/env node
"use strict";

const MIGRATIONS = Object.freeze([
  Object.freeze({
    version: "2026-11-11-generation-records-kv-v1",
    description: "Fingerprint-gated generation-record KV import with a durable completion marker",
  }),
]);

function requireDatabaseUrl(env = process.env) {
  const databaseUrl = String(env.DATABASE_URL || "").trim();
  if (!databaseUrl) throw new Error("DATABASE_URL is required; local JSON fallback is not supported");
  return databaseUrl;
}

async function inspectDatabase({ databaseUrl, lockTimeoutMs = 5000 } = {}) {
  databaseUrl = String(databaseUrl || requireDatabaseUrl()).trim();
  const { Client } = require("pg");
  const client = new Client({ connectionString: databaseUrl, connectionTimeoutMillis: lockTimeoutMs });
  await client.connect();
  try {
    await client.query("SELECT set_config('lock_timeout', $1, false)", [`${Math.max(1, Math.trunc(lockTimeoutMs))}ms`]);
    const ledger = await client.query(`
      SELECT migration_key, imported_count, migrated_at
      FROM app_catalog_migration_state
      ORDER BY migration_key ASC
    `).catch((error) => {
      if (String(error?.code || "") !== "42P01") throw error;
      return { rows: [], missing: true };
    });
    return {
      ok: true,
      ledgerPresent: !ledger.missing,
      completedKeys: ledger.rows.map((row) => String(row.migration_key || "")).filter(Boolean),
      imported: Object.fromEntries(ledger.rows.map((row) => [String(row.migration_key || ""), Number(row.imported_count || 0)])),
    };
  } finally {
    await client.end();
  }
}

function parseArgs(argv = []) {
  const options = { apply: false, dryRun: true, json: false, lockTimeoutMs: 5000, databaseUrl: "" };
  for (const arg of argv) {
    if (arg === "--apply") {
      options.apply = true;
      options.dryRun = false;
    } else if (arg === "--dry-run") {
      options.apply = false;
      options.dryRun = true;
    } else if (arg === "--json") {
      options.json = true;
    } else if (arg === "--help" || arg === "-h") {
      options.help = true;
    } else if (arg.startsWith("--lock-timeout-ms=")) {
      options.lockTimeoutMs = Number(arg.slice("--lock-timeout-ms=".length));
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  if (!Number.isFinite(options.lockTimeoutMs) || options.lockTimeoutMs < 100 || options.lockTimeoutMs > 300000) {
    throw new Error("--lock-timeout-ms must be between 100 and 300000");
  }
  return options;
}

function createMigrationPlan({ completedKeys = [], lockTimeoutMs = 5000, dryRun = true } = {}) {
  const completed = new Set(completedKeys.map(String));
  const pending = MIGRATIONS.filter((item) => !completed.has(item.version)).map((item) => ({ ...item }));
  return {
    dryRun: Boolean(dryRun),
    lockTimeoutMs,
    pending,
    completed: MIGRATIONS.filter((item) => completed.has(item.version)).map((item) => item.version),
    unsupported: completed.size ? [] : [],
  };
}

function renderPlan(plan) {
  return [
    `migration_mode=${plan.dryRun ? "dry-run" : "apply"}`,
    `lock_timeout_ms=${plan.lockTimeoutMs}`,
    `pending=${plan.pending.length}`,
    ...plan.pending.map((item) => `pending_version=${item.version}`),
    `completed=${plan.completed.length}`,
    ...plan.completed.map((version) => `completed_version=${version}`),
  ].join("\n");
}

async function inspectLoadedDatabase({ lockTimeoutMs = 5000 } = {}) {
  const db = require("../db");
  if (!db.dbEnabled()) throw new Error("DATABASE_URL is required; local JSON fallback is not supported");
  const [version, ledger] = await Promise.all([
    db.query("SELECT current_database() AS database, version() AS server_version"),
    db.listCatalogMigrationStatesInDb(),
  ]);
  return {
    ok: true,
    database: String(version.rows[0]?.database || ""),
    serverVersion: String(version.rows[0]?.server_version || "").split(",")[0],
    ledgerPresent: true,
    completedKeys: ledger.map((row) => row.migrationKey).filter(Boolean),
    imported: Object.fromEntries(ledger.map((row) => [row.migrationKey, row.importedCount])),
    lockTimeoutMs,
  };
}

async function main(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);
  if (options.help) {
    process.stdout.write("Usage: node ops/run-db-migrations.js [--dry-run|--apply] [--lock-timeout-ms=5000] [--json]\n");
    return;
  }
  if (!options.apply) {
    const databaseUrl = String(process.env.DATABASE_URL || "").trim();
    const database = databaseUrl
      ? await inspectDatabase({ databaseUrl, lockTimeoutMs: options.lockTimeoutMs })
      : null;
    const plan = createMigrationPlan({
      completedKeys: database?.completedKeys || [],
      dryRun: true,
      lockTimeoutMs: options.lockTimeoutMs,
    });
    const output = database ? { ...plan, database } : plan;
    process.stdout.write(options.json ? `${JSON.stringify(output, null, 2)}\n` : `${renderPlan(plan)}${database ? `\ndatabase_ledger=${database.ledgerPresent ? "present" : "missing"}` : ""}\n`);
    return;
  }
  throw new Error("Migration apply is not enabled until the migration ledger and isolated database drill are complete.");
}

if (require.main === module) {
  Promise.resolve().then(main).catch((error) => {
    process.stderr.write(`${error.message || error}\n`);
    process.exitCode = 2;
  });
}

module.exports = {
  MIGRATIONS,
  createMigrationPlan,
  inspectDatabase,
  inspectLoadedDatabase,
  parseArgs,
  renderPlan,
};
