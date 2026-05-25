const fs = require("node:fs/promises");
const path = require("node:path");
const { Pool } = require("pg");

const ROOT = __dirname;
const APP_DB_PATH = path.join(ROOT, "data", "app-db.json");
const APP_CONFIG_PATH = path.join(ROOT, "data", "app-config.json");
const GENERATION_RECORDS_PATH = path.join(ROOT, "data", "generation-records.json");
const CHARACTER_ASSETS_PATH = path.join(ROOT, "data", "character-assets.json");

function dbEnabled() {
  return Boolean(process.env.DATABASE_URL);
}

function clone(value) {
  return structuredClone(value);
}

async function readJsonFile(filePath, fallback) {
  try {
    const data = await fs.readFile(filePath, "utf8");
    const parsed = JSON.parse(data.replace(/^\uFEFF/, ""));
    if (Array.isArray(fallback)) return Array.isArray(parsed) ? parsed : clone(fallback);
    return parsed && typeof parsed === "object" ? parsed : clone(fallback);
  } catch {
    return clone(fallback);
  }
}

let pool;

function getPool() {
  if (!dbEnabled()) return null;
  if (!pool) {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.PGSSLMODE === "disable" ? false : undefined,
      max: Number(process.env.PGPOOL_MAX || 20),
      idleTimeoutMillis: Number(process.env.PGPOOL_IDLE_TIMEOUT_MS || 30000),
      connectionTimeoutMillis: Number(process.env.PGPOOL_CONNECTION_TIMEOUT_MS || 5000),
      maxUses: Number(process.env.PGPOOL_MAX_USES || 7500),
    });
  }
  return pool;
}

async function query(text, params = []) {
  const p = getPool();
  if (!p) throw new Error("DATABASE_URL is not configured");
  return p.query(text, params);
}

async function ensureSchema() {
  if (!dbEnabled()) return;
  await query(`
    CREATE TABLE IF NOT EXISTS app_kv (
      key TEXT PRIMARY KEY,
      value JSONB NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
  await query(`
    CREATE TABLE IF NOT EXISTS app_generation_records (
      task_id TEXT PRIMARY KEY,
      payload JSONB NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
  await query(`
    ALTER TABLE app_generation_records
      ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
  `);
  await query(`
    CREATE INDEX IF NOT EXISTS app_generation_records_created_at_idx
      ON app_generation_records (created_at DESC);
  `);
  await query(`
    CREATE INDEX IF NOT EXISTS app_generation_records_user_created_idx
      ON app_generation_records ((payload->>'userId'), created_at DESC);
  `);
}

function generationRecordCreatedAt(record = {}) {
  const parsed = Date.parse(record.createdAt || record.updatedAt || "");
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : new Date().toISOString();
}

function generationRecordUpdatedAt(record = {}) {
  const parsed = Date.parse(record.updatedAt || record.createdAt || "");
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : new Date().toISOString();
}

async function getKv(key, fallback) {
  if (!dbEnabled()) return readJsonFile(filePathForKey(key), fallback);
  await ensureSchema();
  const { rows } = await query(`SELECT value FROM app_kv WHERE key = $1`, [key]);
  if (!rows.length) return clone(fallback);
  return rows[0].value ?? clone(fallback);
}

async function setKv(key, value) {
  if (!dbEnabled()) return writeJsonFile(filePathForKey(key), value);
  await ensureSchema();
  await query(
    `
      INSERT INTO app_kv(key, value, updated_at)
      VALUES ($1, $2::jsonb, NOW())
      ON CONFLICT (key)
      DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()
    `,
    [key, JSON.stringify(value)],
  );
}

async function generationRecordsTableCount() {
  if (!dbEnabled()) return 0;
  await ensureSchema();
  const { rows } = await query(`SELECT COUNT(*)::int AS count FROM app_generation_records`);
  return rows[0]?.count || 0;
}

async function migrateGenerationRecordsKvToTable() {
  if (!dbEnabled()) return { migrated: 0, skipped: true };
  await ensureSchema();
  const existing = await generationRecordsTableCount();
  let records = await getKv("generation_records", []);
  if (!Array.isArray(records) || !records.length) {
    records = await readJsonFile(GENERATION_RECORDS_PATH, []);
  }
  if (!Array.isArray(records) || !records.length) return { migrated: 0, existing };
  let migrated = 0;
  for (const record of records) {
    const taskId = String(record?.taskId || "").trim();
    if (!taskId) continue;
    const result = await query(
      `
        INSERT INTO app_generation_records(task_id, payload, created_at, updated_at)
        VALUES ($1, $2::jsonb, $3::timestamptz, $4::timestamptz)
        ON CONFLICT (task_id)
        DO UPDATE SET
          payload = EXCLUDED.payload,
          created_at = LEAST(app_generation_records.created_at, EXCLUDED.created_at),
          updated_at = EXCLUDED.updated_at
        WHERE EXCLUDED.updated_at > app_generation_records.updated_at
        RETURNING task_id
      `,
      [
        taskId,
        JSON.stringify(record),
        generationRecordCreatedAt(record),
        generationRecordUpdatedAt(record),
      ],
    );
    migrated += result.rowCount || 0;
  }
  return { migrated, existing };
}

async function getGenerationRecordsFromDb({ limit = 500, userId = "", includeDeleted = true } = {}) {
  if (!dbEnabled()) return null;
  await ensureSchema();
  const safeLimit = Math.min(500, Math.max(1, Number(limit || 500)));
  const params = [];
  const where = [];
  if (userId) {
    params.push(String(userId));
    where.push(`payload->>'userId' = $${params.length}`);
  }
  if (!includeDeleted) {
    where.push(`COALESCE(payload->>'deletedAt', '') = ''`);
  }
  params.push(safeLimit);
  const { rows } = await query(
    `
      SELECT payload
      FROM app_generation_records
      ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
      ORDER BY created_at DESC, updated_at DESC
      LIMIT $${params.length}
    `,
    params,
  );
  return rows.map((row) => row.payload);
}

async function getGenerationRecordFromDb(taskId) {
  if (!dbEnabled()) return null;
  const id = String(taskId || "").trim();
  if (!id) return null;
  await ensureSchema();
  const { rows } = await query(`SELECT payload FROM app_generation_records WHERE task_id = $1`, [id]);
  return rows[0]?.payload || null;
}

async function upsertGenerationRecordInDb(nextRecord) {
  if (!dbEnabled()) return null;
  const taskId = String(nextRecord?.taskId || "").trim();
  if (!taskId) throw new Error("Generation record taskId is required");
  await ensureSchema();
  const now = new Date().toISOString();
  const { rows } = await query(
    `
      INSERT INTO app_generation_records(task_id, payload, created_at, updated_at)
      VALUES (
        $1::text,
        ($2::jsonb || jsonb_build_object('taskId', $1::text, 'createdAt', COALESCE($2::jsonb->>'createdAt', $3::text), 'updatedAt', $3::text)),
        COALESCE(NULLIF($2::jsonb->>'createdAt', '')::timestamptz, $3::timestamptz),
        $3::timestamptz
      )
      ON CONFLICT (task_id)
      DO UPDATE SET
        payload = app_generation_records.payload
          || EXCLUDED.payload
          || jsonb_build_object(
            'taskId', EXCLUDED.task_id,
            'createdAt', COALESCE(app_generation_records.payload->>'createdAt', EXCLUDED.payload->>'createdAt', $3::text),
            'updatedAt', $3::text,
            'deletedAt', COALESCE(EXCLUDED.payload->'deletedAt', app_generation_records.payload->'deletedAt', to_jsonb(''::text))
          ),
        updated_at = $3::timestamptz
      RETURNING payload
    `,
    [taskId, JSON.stringify(nextRecord), now],
  );
  return rows[0]?.payload || null;
}

async function replaceGenerationRecordsInDb(records) {
  if (!dbEnabled()) return null;
  if (!Array.isArray(records)) return [];
  await ensureSchema();
  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    for (const record of records) {
      const taskId = String(record?.taskId || "").trim();
      if (!taskId) continue;
      await client.query(
        `
          INSERT INTO app_generation_records(task_id, payload, created_at, updated_at)
          VALUES ($1, $2::jsonb, $3::timestamptz, $4::timestamptz)
          ON CONFLICT (task_id)
          DO UPDATE SET
            payload = EXCLUDED.payload,
            created_at = EXCLUDED.created_at,
            updated_at = EXCLUDED.updated_at
        `,
        [
          taskId,
          JSON.stringify(record),
          generationRecordCreatedAt(record),
          generationRecordUpdatedAt(record),
        ],
      );
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
  return records;
}

async function patchGenerationRecordsInDb(predicate, updates) {
  if (!dbEnabled()) return null;
  if (!predicate || typeof predicate !== "object") return [];
  await ensureSchema();
  const now = new Date().toISOString();
  const params = [JSON.stringify({ ...updates, updatedAt: now })];
  const where = [];
  if (predicate.userId) {
    params.push(String(predicate.userId));
    where.push(`payload->>'userId' = $${params.length}`);
  }
  if (predicate.companionId) {
    params.push(String(predicate.companionId));
    where.push(`payload->>'companionId' = $${params.length}`);
  }
  if (predicate.notDeleted) {
    where.push(`COALESCE(payload->>'deletedAt', '') = ''`);
  }
  if (!where.length) return [];
  const { rows } = await query(
    `
      UPDATE app_generation_records
      SET payload = payload || $1::jsonb,
          updated_at = $${params.length + 1}::timestamptz
      WHERE ${where.join(" AND ")}
      RETURNING payload
    `,
    [...params, now],
  );
  return rows.map((row) => row.payload);
}

async function writeJsonFile(filePath, payload) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(payload, null, 2)}\n`);
}

function filePathForKey(key) {
  switch (key) {
    case "app_db":
      return APP_DB_PATH;
    case "app_config":
      return APP_CONFIG_PATH;
    case "generation_records":
      return GENERATION_RECORDS_PATH;
    case "character_assets":
      return CHARACTER_ASSETS_PATH;
    default:
      return path.join(ROOT, "data", `${key}.json`);
  }
}

async function migrateFileDataToDb({ defaultDb, defaultConfig }) {
  if (!dbEnabled()) return;
  await ensureSchema();

  const pairs = [
    ["app_db", await readJsonFile(APP_DB_PATH, defaultDb)],
    ["app_config", await readJsonFile(APP_CONFIG_PATH, defaultConfig)],
    ["generation_records", await readJsonFile(GENERATION_RECORDS_PATH, [])],
    ["character_assets", await readJsonFile(CHARACTER_ASSETS_PATH, {})],
  ];

  for (const [key, fallback] of pairs) {
    const { rows } = await query(`SELECT 1 FROM app_kv WHERE key = $1`, [key]);
    if (!rows.length) {
      await setKv(key, fallback);
    }
  }
}

module.exports = {
  dbEnabled,
  ensureSchema,
  query,
  getKv,
  setKv,
  migrateFileDataToDb,
  migrateGenerationRecordsKvToTable,
  getGenerationRecordsFromDb,
  getGenerationRecordFromDb,
  upsertGenerationRecordInDb,
  replaceGenerationRecordsInDb,
  patchGenerationRecordsInDb,
};
