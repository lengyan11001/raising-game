#!/usr/bin/env node
"use strict";

const path = require("node:path");
const ROOT = path.resolve(__dirname, "..");
const RUNTIME_ROOT = path.resolve(process.env.DB_MIGRATION_RUNTIME_ROOT || ROOT);

const MIGRATIONS = Object.freeze([
  Object.freeze({
    version: "2026-11-11-schema-bootstrap-v1",
    description: "Create and upgrade the application PostgreSQL schema before service restart",
    kind: "schema",
  }),
  Object.freeze({
    version: "2026-11-11-webhook-deliveries-v1",
    description: "Create durable multi-process webhook delivery claims",
    kind: "schema",
  }),
  Object.freeze({
    version: "2026-11-11-generation-records-kv-v1",
    description: "Fingerprint-gated generation-record KV import with a durable completion marker",
    kind: "data",
  }),
]);

const SCHEMA_LOCK_KEY = "raising_game_schema_migrations_v1";
const SCHEMA_LEDGER_DDL = Object.freeze([
  `CREATE TABLE IF NOT EXISTS app_catalog_migration_state (
     migration_key TEXT PRIMARY KEY,
     imported_count INTEGER NOT NULL DEFAULT 0,
     migrated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
   );`,
  `ALTER TABLE app_catalog_migration_state
     ADD COLUMN IF NOT EXISTS imported_count INTEGER NOT NULL DEFAULT 0,
     ADD COLUMN IF NOT EXISTS migrated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();`,
]);
const WEBHOOK_DELIVERIES_DDL = Object.freeze([
  `CREATE TABLE IF NOT EXISTS app_webhook_deliveries (
     provider TEXT NOT NULL,
     delivery_id TEXT NOT NULL,
     event_type TEXT NOT NULL DEFAULT '',
     task_id TEXT NOT NULL DEFAULT '',
     status TEXT NOT NULL DEFAULT 'completed',
     claim_token TEXT NOT NULL DEFAULT '',
     lease_until TIMESTAMPTZ,
     attempts INTEGER NOT NULL DEFAULT 0,
     last_error TEXT NOT NULL DEFAULT '',
     received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
     updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
     completed_at TIMESTAMPTZ,
     PRIMARY KEY (provider, delivery_id)
   );`,
  `ALTER TABLE app_webhook_deliveries
     ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'completed',
     ADD COLUMN IF NOT EXISTS claim_token TEXT NOT NULL DEFAULT '',
     ADD COLUMN IF NOT EXISTS lease_until TIMESTAMPTZ,
     ADD COLUMN IF NOT EXISTS attempts INTEGER NOT NULL DEFAULT 0,
     ADD COLUMN IF NOT EXISTS last_error TEXT NOT NULL DEFAULT '',
     ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
     ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;`,
  `CREATE INDEX IF NOT EXISTS app_webhook_deliveries_received_idx ON app_webhook_deliveries (received_at);`,
  `CREATE INDEX IF NOT EXISTS app_webhook_deliveries_recovery_idx ON app_webhook_deliveries (status, lease_until) WHERE status = 'claimed';`,
]);

async function runStatements(client, statements) {
  for (const statement of statements) await client.query(statement);
}

function requireMigrationRuntime() {
  const { Client } = require(path.join(RUNTIME_ROOT, "node_modules", "pg"));
  return {
    createDatabaseClient(databaseUrl, connectionTimeoutMillis) {
      return new Client({ connectionString: databaseUrl, connectionTimeoutMillis });
    },
    loadDatabaseModule() {
      return require(path.join(RUNTIME_ROOT, "db.js"));
    },
    async closeDatabaseModule() {
      const db = require(path.join(RUNTIME_ROOT, "db.js"));
      const pools = [db.getPool?.(), db.getSchedulerPool?.()].filter(Boolean);
      await Promise.allSettled(pools.map((pool) => pool.end()));
    },
  };
}

function requireDatabaseUrl(env = process.env) {
  const databaseUrl = String(env.DATABASE_URL || "").trim();
  if (!databaseUrl) throw new Error("DATABASE_URL is required; local JSON fallback is not supported");
  return databaseUrl;
}

async function inspectDatabase({ databaseUrl, lockTimeoutMs = 5000 } = {}) {
  databaseUrl = String(databaseUrl || requireDatabaseUrl()).trim();
  const { createDatabaseClient } = requireMigrationRuntime();
  const client = createDatabaseClient(databaseUrl, lockTimeoutMs);
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
    } else if (arg.startsWith("--database-url=")) {
      options.databaseUrl = arg.slice("--database-url=".length);
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
    unsupported: [],
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

async function applyMigrations({ databaseUrl, lockTimeoutMs = 5000 } = {}) {
  databaseUrl = String(databaseUrl || requireDatabaseUrl()).trim();
  const { createDatabaseClient, loadDatabaseModule, closeDatabaseModule } = requireMigrationRuntime();
  const applied = [];
  let result;
  const db = loadDatabaseModule();
  const schemaLockClient = createDatabaseClient(databaseUrl, lockTimeoutMs);
  await schemaLockClient.connect();
  try {
    await schemaLockClient.query("SELECT set_config('lock_timeout', $1, false)", [`${Math.max(1, Math.trunc(lockTimeoutMs))}ms`]);
    await schemaLockClient.query("SELECT pg_advisory_lock(hashtextextended($1, 0))", [SCHEMA_LOCK_KEY]);
    await runStatements(schemaLockClient, SCHEMA_LEDGER_DDL);
    const bootstrap = MIGRATIONS.find((item) => item.version === "2026-11-11-schema-bootstrap-v1");
    if (bootstrap) {
      /* Bootstrap means "the baseline schema has been checked", not "every
         later schema version exists". Older deployments recorded only this
         key, so later migrations must still be evaluated independently. */
      const baseline = await schemaLockClient.query(
        `SELECT to_regclass('public.app_users') IS NOT NULL
            AND to_regclass('public.app_generation_records') IS NOT NULL
            AND to_regclass('public.app_catalog_migration_state') IS NOT NULL AS ready`,
      );
      if (!baseline.rows[0]?.ready) {
        await db.ensureSchemaInner({ client: schemaLockClient });
      }
      const completed = await schemaLockClient.query(
        "SELECT 1 FROM app_catalog_migration_state WHERE migration_key = $1 LIMIT 1",
        [bootstrap.version],
      );
      if (!completed.rows.length) {
        await schemaLockClient.query(
          `INSERT INTO app_catalog_migration_state(migration_key, imported_count, migrated_at)
           VALUES ($1, 0, NOW())
           ON CONFLICT (migration_key) DO NOTHING`,
          [bootstrap.version],
        );
        applied.push(bootstrap.version);
      }
    }
    for (const migration of MIGRATIONS.filter((item) => item.kind === "schema" && item !== bootstrap)) {
      if (migration.version === "2026-11-11-webhook-deliveries-v1") {
        /* DDL is idempotent. Execute it even when the ledger says completed,
           so a restored or partially-created schema can never pass readiness
           with a missing v2 table. */
        await runStatements(schemaLockClient, WEBHOOK_DELIVERIES_DDL);
      } else {
        throw new Error(`Unknown schema migration: ${migration.version}`);
      }
      const completed = await schemaLockClient.query(
        "SELECT 1 FROM app_catalog_migration_state WHERE migration_key = $1 LIMIT 1",
        [migration.version],
      );
      if (completed.rows.length) continue;
      await schemaLockClient.query(
        `INSERT INTO app_catalog_migration_state(migration_key, imported_count, migrated_at)
         VALUES ($1, 0, NOW())
         ON CONFLICT (migration_key) DO NOTHING`,
        [migration.version],
      );
      applied.push(migration.version);
    }
  } finally {
    await schemaLockClient.query("SELECT pg_advisory_unlock(hashtextextended($1, 0))", [SCHEMA_LOCK_KEY]).catch(() => {});
    await schemaLockClient.end();
  }
  const dataLockClient = createDatabaseClient(databaseUrl, lockTimeoutMs);
  await dataLockClient.connect();
  try {
    await dataLockClient.query("SELECT set_config('lock_timeout', $1, false)", [`${Math.max(1, Math.trunc(lockTimeoutMs))}ms`]);
    await dataLockClient.query("SELECT pg_advisory_lock(hashtextextended($1, 0))", ["raising_game_data_migrations_v1"]);
    for (const migration of MIGRATIONS.filter((item) => item.kind === "data")) {
      const prior = await dataLockClient.query(
        "SELECT 1 FROM app_catalog_migration_state WHERE migration_key = $1 LIMIT 1",
        [migration.version],
      );
      if (prior.rows.length) continue;
      if (migration.version !== "2026-11-11-generation-records-kv-v1") {
        throw new Error(`Unknown data migration: ${migration.version}`);
      }
      const result = await db.migrateGenerationRecordsKvToTable();
      if (result?.migrationKey) {
        await dataLockClient.query(
          `INSERT INTO app_catalog_migration_state(migration_key, imported_count, migrated_at)
           VALUES ($1, $2, NOW())
           ON CONFLICT (migration_key) DO UPDATE SET imported_count = EXCLUDED.imported_count, migrated_at = NOW()`,
          [migration.version, Math.max(0, Number(result.migrated || 0))],
        );
        applied.push(migration.version);
      } else if (result?.skipped) {
        await dataLockClient.query(
          `INSERT INTO app_catalog_migration_state(migration_key, imported_count, migrated_at)
           VALUES ($1, 0, NOW())
           ON CONFLICT (migration_key) DO UPDATE SET migrated_at = NOW()`,
          [migration.version],
        );
        applied.push(migration.version);
      } else {
        throw new Error("Generation KV migration did not return a durable completion key.");
      }
    }
    result = { ok: true, applied };
  } finally {
    await dataLockClient.query("SELECT pg_advisory_unlock(hashtextextended($1, 0))", ["raising_game_data_migrations_v1"]).catch(() => {});
    await dataLockClient.end();
    await closeDatabaseModule().catch((error) => {
      process.stderr.write(`[migration-runtime-close] ${error.message || error}\n`);
    });
  }
  return result;
}

async function main(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);
  if (options.help) {
    process.stdout.write("Usage: node ops/run-db-migrations.js [--dry-run|--apply] [--json] [--lock-timeout-ms=5000]\n");
    return;
  }
  const databaseUrl = String(options.databaseUrl || process.env.DATABASE_URL || "").trim();
  if (databaseUrl) process.env.DATABASE_URL = databaseUrl;
  if (options.dryRun) {
    const database = databaseUrl ? await inspectDatabase({ databaseUrl, lockTimeoutMs: options.lockTimeoutMs }) : null;
    const plan = createMigrationPlan({
      completedKeys: database?.completedKeys || [],
      dryRun: true,
      lockTimeoutMs: options.lockTimeoutMs,
    });
    const output = database ? { ...plan, database } : plan;
    process.stdout.write(options.json ? `${JSON.stringify(output, null, 2)}\n` : `${renderPlan(plan)}${database ? `\ndatabase_ledger=${database.ledgerPresent ? "present" : "missing"}` : ""}\n`);
    return;
  }
  if (!options.apply) throw new Error("Migration apply requires --apply.");
  const result = await applyMigrations({ databaseUrl, lockTimeoutMs: options.lockTimeoutMs });
  process.stdout.write(options.json ? `${JSON.stringify(result, null, 2)}\n` : `migration_mode=apply\napplied=${result.applied.join(",") || "none"}\n`);
}

if (require.main === module) {
  Promise.resolve().then(main).catch((error) => {
    process.stderr.write(`${error.message || error}\n`);
    process.exitCode = 2;
  });
}

module.exports = {
  MIGRATIONS,
  applyMigrations,
  createMigrationPlan,
  inspectDatabase,
  inspectLoadedDatabase,
  parseArgs,
  renderPlan,
};
