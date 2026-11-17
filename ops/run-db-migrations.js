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
    version: "2026-11-11-request-idempotency-v1",
    description: "Create durable multi-process request idempotency claims and replayable results",
    kind: "schema",
  }),
  Object.freeze({
    version: "2026-11-11-generation-submit-jobs-v1",
    description: "Create durable generation submit jobs with fenced claims and submission-outcome states",
    kind: "schema",
  }),
  Object.freeze({
    version: "2026-11-16-story-canvas-p0-v1",
    description: "Create screenplay project, episode, asset, shot, prompt, generation, and canvas-link storage",
    kind: "schema",
  }),
  Object.freeze({
    version: "2026-11-17-story-script-targeting-v1",
    description: "Add episode, shot, and duration targeting columns to story script versions",
    kind: "schema",
  }),
  Object.freeze({
    version: "2026-11-17-story-manuscript-lineage-v1",
    description: "Add manuscript lineage to script versions and episode sets",
    kind: "schema",
  }),
  Object.freeze({
    version: "2026-11-17-story-legacy-manuscript-group-v1",
    description: "Group legacy script rows created before manuscript lineage by project and title",
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

const REQUEST_IDEMPOTENCY_DDL = Object.freeze([
  `CREATE TABLE IF NOT EXISTS app_request_idempotency (
     user_id TEXT NOT NULL,
     action TEXT NOT NULL,
     idempotency_key TEXT NOT NULL,
     payload_hash TEXT NOT NULL,
     status TEXT NOT NULL DEFAULT 'claimed',
     claim_token TEXT NOT NULL DEFAULT '',
     lease_until TIMESTAMPTZ,
     task_id TEXT NOT NULL DEFAULT '',
     result_payload JSONB,
     attempts INTEGER NOT NULL DEFAULT 0,
     last_error TEXT NOT NULL DEFAULT '',
     created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
     updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
     completed_at TIMESTAMPTZ,
     PRIMARY KEY (user_id, action, idempotency_key)
   );`,
  `ALTER TABLE app_request_idempotency
     ADD COLUMN IF NOT EXISTS payload_hash TEXT NOT NULL DEFAULT '',
     ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'claimed',
     ADD COLUMN IF NOT EXISTS claim_token TEXT NOT NULL DEFAULT '',
     ADD COLUMN IF NOT EXISTS lease_until TIMESTAMPTZ,
     ADD COLUMN IF NOT EXISTS task_id TEXT NOT NULL DEFAULT '',
     ADD COLUMN IF NOT EXISTS result_payload JSONB,
     ADD COLUMN IF NOT EXISTS attempts INTEGER NOT NULL DEFAULT 0,
     ADD COLUMN IF NOT EXISTS last_error TEXT NOT NULL DEFAULT '',
     ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
     ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
     ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;`,
  `CREATE INDEX IF NOT EXISTS app_request_idempotency_recovery_idx ON app_request_idempotency (status, lease_until) WHERE status = 'claimed';`,
  `CREATE INDEX IF NOT EXISTS app_request_idempotency_completed_idx ON app_request_idempotency (completed_at DESC) WHERE status = 'completed';`,
]);

const GENERATION_SUBMIT_JOBS_DDL = Object.freeze([
  `CREATE TABLE IF NOT EXISTS app_generation_submit_jobs (
     task_id TEXT PRIMARY KEY,
     user_id TEXT NOT NULL DEFAULT '',
     kind TEXT NOT NULL DEFAULT 'platform-template',
     payload JSONB NOT NULL DEFAULT '{}'::jsonb,
     status TEXT NOT NULL DEFAULT 'queued',
     claim_token TEXT NOT NULL DEFAULT '',
     lease_until TIMESTAMPTZ,
     attempts INTEGER NOT NULL DEFAULT 0,
     max_attempts INTEGER NOT NULL DEFAULT 5,
     submit_state TEXT NOT NULL DEFAULT 'pending',
     submit_attempt_id TEXT NOT NULL DEFAULT '',
     available_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
     started_at TIMESTAMPTZ,
     completed_at TIMESTAMPTZ,
     last_error TEXT NOT NULL DEFAULT '',
     created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
     updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
   );`,
  `ALTER TABLE app_generation_submit_jobs
     ADD COLUMN IF NOT EXISTS user_id TEXT NOT NULL DEFAULT '',
     ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'platform-template',
     ADD COLUMN IF NOT EXISTS payload JSONB NOT NULL DEFAULT '{}'::jsonb,
     ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'queued',
     ADD COLUMN IF NOT EXISTS claim_token TEXT NOT NULL DEFAULT '',
     ADD COLUMN IF NOT EXISTS lease_until TIMESTAMPTZ,
     ADD COLUMN IF NOT EXISTS attempts INTEGER NOT NULL DEFAULT 0,
     ADD COLUMN IF NOT EXISTS max_attempts INTEGER NOT NULL DEFAULT 5,
     ADD COLUMN IF NOT EXISTS submit_state TEXT NOT NULL DEFAULT 'pending',
     ADD COLUMN IF NOT EXISTS submit_attempt_id TEXT NOT NULL DEFAULT '',
     ADD COLUMN IF NOT EXISTS available_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
     ADD COLUMN IF NOT EXISTS started_at TIMESTAMPTZ,
     ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ,
     ADD COLUMN IF NOT EXISTS last_error TEXT NOT NULL DEFAULT '',
     ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
     ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();`,
  `CREATE INDEX IF NOT EXISTS app_generation_submit_jobs_ready_idx ON app_generation_submit_jobs (status, available_at, created_at) WHERE status IN ('queued', 'retry');`,
  `CREATE INDEX IF NOT EXISTS app_generation_submit_jobs_lease_idx ON app_generation_submit_jobs (status, lease_until) WHERE status = 'processing';`,
  `CREATE INDEX IF NOT EXISTS app_generation_submit_jobs_unknown_idx ON app_generation_submit_jobs (updated_at DESC) WHERE status = 'unknown';`,
]);

const STORY_CANVAS_P0_DDL = Object.freeze([
  `CREATE TABLE IF NOT EXISTS app_story_projects (
     id TEXT PRIMARY KEY,
     owner_user_id TEXT NOT NULL DEFAULT '',
     name TEXT NOT NULL DEFAULT '',
     description TEXT NOT NULL DEFAULT '',
     status TEXT NOT NULL DEFAULT 'draft',
     aspect_ratio TEXT NOT NULL DEFAULT '9:16',
     episode_target INTEGER NOT NULL DEFAULT 1,
     settings JSONB NOT NULL DEFAULT '{}'::jsonb,
     created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
     updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
   );`,
  `CREATE INDEX IF NOT EXISTS app_story_projects_owner_updated_idx ON app_story_projects (owner_user_id, updated_at DESC, created_at DESC);`,
  `CREATE TABLE IF NOT EXISTS app_story_script_versions (
     id TEXT PRIMARY KEY,
     project_id TEXT NOT NULL REFERENCES app_story_projects(id) ON DELETE CASCADE,
     version_no INTEGER NOT NULL DEFAULT 1,
     title TEXT NOT NULL DEFAULT '',
     content TEXT NOT NULL DEFAULT '',
     status TEXT NOT NULL DEFAULT 'draft',
     created_by TEXT NOT NULL DEFAULT '',
     frozen_at TIMESTAMPTZ,
     created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
     UNIQUE (project_id, version_no)
   );`,
  `CREATE INDEX IF NOT EXISTS app_story_script_versions_project_idx ON app_story_script_versions (project_id, version_no DESC);`,
  `CREATE TABLE IF NOT EXISTS app_story_episodes (
     id TEXT PRIMARY KEY,
     project_id TEXT NOT NULL REFERENCES app_story_projects(id) ON DELETE CASCADE,
     episode_no INTEGER NOT NULL DEFAULT 1,
     title TEXT NOT NULL DEFAULT '',
     synopsis TEXT NOT NULL DEFAULT '',
     status TEXT NOT NULL DEFAULT 'draft',
     duration_seconds INTEGER NOT NULL DEFAULT 0,
     metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
     created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
     updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
     UNIQUE (project_id, episode_no)
   );`,
  `CREATE INDEX IF NOT EXISTS app_story_episodes_project_idx ON app_story_episodes (project_id, episode_no ASC);`,
  `CREATE TABLE IF NOT EXISTS app_story_assets (
     id TEXT PRIMARY KEY,
     project_id TEXT NOT NULL REFERENCES app_story_projects(id) ON DELETE CASCADE,
     kind TEXT NOT NULL DEFAULT 'character',
     name TEXT NOT NULL DEFAULT '',
     description TEXT NOT NULL DEFAULT '',
     status TEXT NOT NULL DEFAULT 'planned',
     metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
     created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
     updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
   );`,
  `CREATE INDEX IF NOT EXISTS app_story_assets_project_kind_idx ON app_story_assets (project_id, kind, updated_at DESC);`,
  `CREATE TABLE IF NOT EXISTS app_story_asset_variants (
     id TEXT PRIMARY KEY,
     asset_id TEXT NOT NULL REFERENCES app_story_assets(id) ON DELETE CASCADE,
     name TEXT NOT NULL DEFAULT '',
     description TEXT NOT NULL DEFAULT '',
     status TEXT NOT NULL DEFAULT 'planned',
     metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
     created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
     updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
   );`,
  `CREATE INDEX IF NOT EXISTS app_story_asset_variants_asset_idx ON app_story_asset_variants (asset_id, updated_at DESC);`,
  `CREATE TABLE IF NOT EXISTS app_story_shots (
     id TEXT PRIMARY KEY,
     project_id TEXT NOT NULL REFERENCES app_story_projects(id) ON DELETE CASCADE,
     episode_id TEXT NOT NULL REFERENCES app_story_episodes(id) ON DELETE CASCADE,
     shot_no INTEGER NOT NULL DEFAULT 1,
     title TEXT NOT NULL DEFAULT '',
     description TEXT NOT NULL DEFAULT '',
     image_prompt TEXT NOT NULL DEFAULT '',
     video_prompt TEXT NOT NULL DEFAULT '',
     duration_seconds INTEGER NOT NULL DEFAULT 5,
     status TEXT NOT NULL DEFAULT 'draft',
     metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
     created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
     updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
     UNIQUE (episode_id, shot_no)
   );`,
  `CREATE INDEX IF NOT EXISTS app_story_shots_episode_idx ON app_story_shots (episode_id, shot_no ASC);`,
  `CREATE TABLE IF NOT EXISTS app_story_prompt_versions (
     id TEXT PRIMARY KEY,
     shot_id TEXT NOT NULL REFERENCES app_story_shots(id) ON DELETE CASCADE,
     kind TEXT NOT NULL DEFAULT 'video',
     version_no INTEGER NOT NULL DEFAULT 1,
     prompt TEXT NOT NULL DEFAULT '',
     negative_prompt TEXT NOT NULL DEFAULT '',
     status TEXT NOT NULL DEFAULT 'draft',
     created_by TEXT NOT NULL DEFAULT '',
     created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
     UNIQUE (shot_id, kind, version_no)
   );`,
  `CREATE TABLE IF NOT EXISTS app_story_generation_refs (
     id TEXT PRIMARY KEY,
     project_id TEXT NOT NULL REFERENCES app_story_projects(id) ON DELETE CASCADE,
     shot_id TEXT NOT NULL REFERENCES app_story_shots(id) ON DELETE CASCADE,
     prompt_version_id TEXT REFERENCES app_story_prompt_versions(id) ON DELETE SET NULL,
     generation_record_id TEXT NOT NULL DEFAULT '',
     kind TEXT NOT NULL DEFAULT 'video',
     status TEXT NOT NULL DEFAULT 'queued',
     metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
     created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
   );`,
  `CREATE INDEX IF NOT EXISTS app_story_generation_refs_shot_idx ON app_story_generation_refs (shot_id, created_at DESC);`,
  `CREATE TABLE IF NOT EXISTS app_story_canvas_links (
     id TEXT PRIMARY KEY,
     project_id TEXT NOT NULL REFERENCES app_story_projects(id) ON DELETE CASCADE,
     scope_type TEXT NOT NULL DEFAULT 'project',
     scope_id TEXT NOT NULL DEFAULT '',
     canvas_id TEXT NOT NULL DEFAULT '',
     created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
     UNIQUE (scope_type, scope_id, canvas_id)
   );`,
  `CREATE INDEX IF NOT EXISTS app_story_canvas_links_project_idx ON app_story_canvas_links (project_id, scope_type, scope_id);`,
]);

const STORY_SCRIPT_TARGETING_DDL = Object.freeze([
  `ALTER TABLE app_story_script_versions
     ADD COLUMN IF NOT EXISTS target_episode_id TEXT NOT NULL DEFAULT '',
     ADD COLUMN IF NOT EXISTS target_shot_id TEXT NOT NULL DEFAULT '',
     ADD COLUMN IF NOT EXISTS estimated_duration_seconds INTEGER NOT NULL DEFAULT 0;`,
  `CREATE INDEX IF NOT EXISTS app_story_script_versions_target_idx
     ON app_story_script_versions (project_id, target_episode_id, target_shot_id);`,
]);

const STORY_MANUSCRIPT_LINEAGE_DDL = Object.freeze([
  `ALTER TABLE app_story_script_versions
     ADD COLUMN IF NOT EXISTS manuscript_id TEXT NOT NULL DEFAULT '',
     ADD COLUMN IF NOT EXISTS target_episode_count INTEGER NOT NULL DEFAULT 0;`,
  `UPDATE app_story_script_versions SET manuscript_id = id WHERE manuscript_id = '';`,
  `ALTER TABLE app_story_script_versions DROP CONSTRAINT IF EXISTS app_story_script_versions_project_id_version_no_key;`,
  `DROP INDEX IF EXISTS app_story_script_versions_project_id_version_no_key;`,
  `CREATE INDEX IF NOT EXISTS app_story_script_versions_manuscript_idx
     ON app_story_script_versions (project_id, manuscript_id, version_no DESC);`,
  `CREATE UNIQUE INDEX IF NOT EXISTS app_story_script_versions_manuscript_version_uidx
     ON app_story_script_versions (project_id, manuscript_id, version_no)
     WHERE manuscript_id <> '';`,
  `ALTER TABLE app_story_episodes
     ADD COLUMN IF NOT EXISTS source_script_version_id TEXT NOT NULL DEFAULT '',
     ADD COLUMN IF NOT EXISTS source_manuscript_id TEXT NOT NULL DEFAULT '';`,
  `UPDATE app_story_episodes e
   SET source_script_version_id = sv.id,
       source_manuscript_id = sv.manuscript_id
   FROM (
     SELECT DISTINCT ON (project_id) project_id, id, manuscript_id
     FROM app_story_script_versions
     ORDER BY project_id, version_no DESC, created_at DESC
   ) sv
   WHERE e.project_id = sv.project_id
     AND e.source_manuscript_id = '';`,
  `ALTER TABLE app_story_episodes DROP CONSTRAINT IF EXISTS app_story_episodes_project_id_episode_no_key;`,
  `CREATE UNIQUE INDEX IF NOT EXISTS app_story_episodes_manuscript_episode_uidx
     ON app_story_episodes (project_id, source_manuscript_id, episode_no);`,
]);

const STORY_LEGACY_MANUSCRIPT_GROUP_DDL = Object.freeze([
  `WITH legacy_manuscripts AS (
     SELECT id,
            first_value(id) OVER (
              PARTITION BY project_id, title
              ORDER BY version_no ASC, created_at ASC, id ASC
            ) AS canonical_manuscript_id
     FROM app_story_script_versions
     WHERE manuscript_id = id
   )
   UPDATE app_story_script_versions sv
   SET manuscript_id = legacy_manuscripts.canonical_manuscript_id
   FROM legacy_manuscripts
   WHERE sv.id = legacy_manuscripts.id
     AND sv.manuscript_id = sv.id;`,
  `UPDATE app_story_episodes e
   SET source_manuscript_id = sv.manuscript_id
   FROM app_story_script_versions sv
   WHERE e.source_script_version_id = sv.id
     AND e.source_manuscript_id <> sv.manuscript_id;`,
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
      } else if (migration.version === "2026-11-11-request-idempotency-v1") {
        await runStatements(schemaLockClient, REQUEST_IDEMPOTENCY_DDL);
      } else if (migration.version === "2026-11-11-generation-submit-jobs-v1") {
        await runStatements(schemaLockClient, GENERATION_SUBMIT_JOBS_DDL);
      } else if (migration.version === "2026-11-16-story-canvas-p0-v1") {
        await runStatements(schemaLockClient, STORY_CANVAS_P0_DDL);
      } else if (migration.version === "2026-11-17-story-script-targeting-v1") {
        await runStatements(schemaLockClient, STORY_SCRIPT_TARGETING_DDL);
      } else if (migration.version === "2026-11-17-story-manuscript-lineage-v1") {
        await runStatements(schemaLockClient, STORY_MANUSCRIPT_LINEAGE_DDL);
      } else if (migration.version === "2026-11-17-story-legacy-manuscript-group-v1") {
        await runStatements(schemaLockClient, STORY_LEGACY_MANUSCRIPT_GROUP_DDL);
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
