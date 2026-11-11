#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");

const DRILL_DATABASE_PREFIX = "raising_game_migration_drill_";

function escapeIdentifier(value) {
  return `"${String(value).replaceAll('"', '""')}"`;
}

function parseArgs(argv = []) {
  const options = { apply: false, databaseUrl: "", json: false };
  for (const arg of argv) {
    if (arg === "--apply") options.apply = true;
    else if (arg === "--dry-run") options.apply = false;
    else if (arg === "--json") options.json = true;
    else if (arg === "--help" || arg === "-h") options.help = true;
    else if (arg.startsWith("--database-url=")) options.databaseUrl = arg.slice("--database-url=".length);
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return options;
}

function drillDatabaseName(databaseUrl = "") {
  try {
    const parsed = new URL(databaseUrl);
    return decodeURIComponent(parsed.pathname.replace(/^\//, ""));
  } catch {
    return "";
  }
}

function assertDrillDatabase(databaseUrl = "") {
  const database = drillDatabaseName(databaseUrl);
  if (!database.startsWith(DRILL_DATABASE_PREFIX)) {
    throw new Error(`Migration drills require a disposable database named ${DRILL_DATABASE_PREFIX}*; got ${database || "<missing>"}`);
  }
  return database;
}

function sampleRecords() {
  return [
    { taskId: "drill-a", userId: "drill-user", status: "completed", updatedAt: "2026-11-11T01:00:00.000Z", value: 1 },
    { taskId: "drill-b", userId: "drill-user", status: "failed", updatedAt: "2026-11-11T02:00:00.000Z", value: 2 },
  ];
}

async function runDrill({ databaseUrl = process.env.DATABASE_URL, apply = false } = {}) {
  databaseUrl = String(databaseUrl || "").trim();
  if (!databaseUrl) throw new Error("DATABASE_URL is required; migration drills never use an implicit database");
  const database = assertDrillDatabase(databaseUrl);
  if (!apply) return { ok: true, apply: false, database, planned: ["schema", "seed-legacy-kv", "concurrent-import", "idempotent-replay", "locked-timeout", "rollback"] };

  const { Client } = require("pg");
  const client = new Client({ connectionString: databaseUrl, connectionTimeoutMillis: 5000 });
  await client.connect();
  try {
    await client.query("BEGIN");
    await client.query("SET LOCAL lock_timeout = '2s'");
    await client.query(`CREATE TABLE app_kv (key TEXT PRIMARY KEY, value JSONB NOT NULL, updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
    await client.query(`CREATE TABLE app_generation_records (
      task_id TEXT PRIMARY KEY,
      payload JSONB NOT NULL,
      created_at TIMESTAMPTZ NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL
    )`);
    await client.query(`CREATE TABLE app_catalog_migration_state (
      migration_key TEXT PRIMARY KEY,
      imported_count INTEGER NOT NULL DEFAULT 0,
      migrated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`);
    await client.query(`INSERT INTO app_kv(key, value) VALUES ('generation_records', $1::jsonb)`, [JSON.stringify(sampleRecords())]);
    await client.query("COMMIT");

    const importOnce = async (connection) => {
      await connection.query("BEGIN");
      await connection.query("SELECT set_config('lock_timeout', '2s', true)");
      await connection.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", ["generation_records_kv_v1"]);
      const prior = await connection.query("SELECT 1 FROM app_catalog_migration_state WHERE migration_key = $1", ["generation_records_kv_v1"]);
      if (prior.rows.length) {
        await connection.query("COMMIT");
        return 0;
      }
      const records = sampleRecords();
      for (const record of records) {
        await connection.query(`
          INSERT INTO app_generation_records(task_id, payload, created_at, updated_at)
          VALUES ($1, $2::jsonb, $3::timestamptz, $4::timestamptz)
          ON CONFLICT (task_id) DO UPDATE SET payload = EXCLUDED.payload WHERE EXCLUDED.updated_at > app_generation_records.updated_at
        `, [record.taskId, JSON.stringify(record), record.updatedAt, record.updatedAt]);
      }
      await connection.query("INSERT INTO app_catalog_migration_state(migration_key, imported_count) VALUES ($1, $2)", ["generation_records_kv_v1", records.length]);
      await connection.query("COMMIT");
      return records.length;
    };

    const first = new Client({ connectionString: databaseUrl });
    const second = new Client({ connectionString: databaseUrl });
    await Promise.all([first.connect(), second.connect()]);
    const counts = await Promise.all([importOnce(first), importOnce(second)]);
    assert.equal(counts.reduce((sum, count) => sum + count, 0), sampleRecords().length);
    const replay = await importOnce(first);
    const rows = await first.query("SELECT COUNT(*)::int AS count FROM app_generation_records");
    const ledger = await first.query("SELECT imported_count FROM app_catalog_migration_state WHERE migration_key = $1", ["generation_records_kv_v1"]);
    assert.equal(rows.rows[0].count, sampleRecords().length);
    assert.equal(ledger.rows.length, 1);
    assert.equal(Number(ledger.rows[0].imported_count), sampleRecords().length);
    assert.equal(replay, 0);
    await Promise.all([first.end(), second.end()]);

    const locker = new Client({ connectionString: databaseUrl });
    const waiter = new Client({ connectionString: databaseUrl });
    await Promise.all([locker.connect(), waiter.connect()]);
    await locker.query("BEGIN");
    await locker.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", ["drill_rollback"]);
    await waiter.query("BEGIN");
    await waiter.query("SELECT set_config('lock_timeout', '100ms', true)");
    await assert.rejects(
      waiter.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", ["drill_rollback"]),
      (error) => String(error.code || "") === "55P03",
    );
    await waiter.query("ROLLBACK");
    await locker.query("ROLLBACK");
    await Promise.all([locker.end(), waiter.end()]);

    const rollback = new Client({ connectionString: databaseUrl });
    await rollback.connect();
    await rollback.query("BEGIN");
    await rollback.query("INSERT INTO app_catalog_migration_state(migration_key, imported_count) VALUES ($1, 1)", ["drill_rollback_marker"]);
    await rollback.query("ROLLBACK");
    const rolledBack = await rollback.query("SELECT 1 FROM app_catalog_migration_state WHERE migration_key = $1", ["drill_rollback_marker"]);
    assert.equal(rolledBack.rows.length, 0);
    await rollback.end();

    return { ok: true, apply: true, database, concurrentImports: counts, replayImported: replay, records: rows.rows[0].count };
  } finally {
    await client.end();
  }
}

async function main(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);
  if (options.help) {
    process.stdout.write("Usage: node ops/drill-generation-kv-migration.js [--apply|--dry-run] [--json] [--database-url=postgres://...]\n");
    return;
  }
  const result = await runDrill({ databaseUrl: options.databaseUrl || process.env.DATABASE_URL, apply: options.apply });
  process.stdout.write(options.json ? `${JSON.stringify(result, null, 2)}\n` : `${JSON.stringify(result)}\n`);
}

if (require.main === module) {
  Promise.resolve().then(main).catch((error) => {
    process.stderr.write(`${error.message || error}\n`);
    process.exitCode = 2;
  });
}

module.exports = { DRILL_DATABASE_PREFIX, assertDrillDatabase, drillDatabaseName, parseArgs, runDrill };
