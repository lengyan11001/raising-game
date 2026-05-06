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
  getKv,
  setKv,
  migrateFileDataToDb,
};
