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
  const createUniqueIndex = async (sql) => {
    try {
      await query(sql);
    } catch (error) {
      if (String(error.code || "") !== "23505") throw error;
      console.warn("[db-schema] skipped unique index because existing duplicate rows need cleanup:", error.constraint || error.message);
    }
  };
  await query(`
    CREATE TABLE IF NOT EXISTS app_kv (
      key TEXT PRIMARY KEY,
      value JSONB NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
  await query(`
    CREATE TABLE IF NOT EXISTS app_users (
      id TEXT PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      api_token TEXT UNIQUE,
      role TEXT NOT NULL DEFAULT 'user',
      password_hash TEXT NOT NULL DEFAULT '',
      credits NUMERIC(24, 6) NOT NULL DEFAULT 0,
      pricing_multiplier NUMERIC(12, 6) NOT NULL DEFAULT 1,
      api_pricing_multiplier NUMERIC(12, 6) NOT NULL DEFAULT 1,
      payload JSONB NOT NULL DEFAULT '{}'::jsonb,
      deleted_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
  await query(`
    ALTER TABLE app_users
      ADD COLUMN IF NOT EXISTS username TEXT NOT NULL DEFAULT '',
      ADD COLUMN IF NOT EXISTS api_token TEXT,
      ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'user',
      ADD COLUMN IF NOT EXISTS password_hash TEXT NOT NULL DEFAULT '',
      ADD COLUMN IF NOT EXISTS credits NUMERIC(24, 6) NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS pricing_multiplier NUMERIC(12, 6) NOT NULL DEFAULT 1,
      ADD COLUMN IF NOT EXISTS api_pricing_multiplier NUMERIC(12, 6) NOT NULL DEFAULT 1,
      ADD COLUMN IF NOT EXISTS payload JSONB NOT NULL DEFAULT '{}'::jsonb,
      ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
  `);
  await query(`
    UPDATE app_users
    SET username = COALESCE(NULLIF(username, ''), NULLIF(payload->>'username', ''), id)
    WHERE username = '';
  `);
  await query(`CREATE INDEX IF NOT EXISTS app_users_created_idx ON app_users (created_at DESC);`);
  await createUniqueIndex(`CREATE UNIQUE INDEX IF NOT EXISTS app_users_username_uidx ON app_users (username) WHERE deleted_at IS NULL;`);
  await createUniqueIndex(`CREATE UNIQUE INDEX IF NOT EXISTS app_users_api_token_uidx ON app_users (api_token) WHERE api_token IS NOT NULL AND api_token <> '';`);
  await query(`
    CREATE TABLE IF NOT EXISTS app_sessions (
      token TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      payload JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
  await query(`
    ALTER TABLE app_sessions
      ADD COLUMN IF NOT EXISTS user_id TEXT NOT NULL DEFAULT '',
      ADD COLUMN IF NOT EXISTS payload JSONB NOT NULL DEFAULT '{}'::jsonb,
      ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
  `);
  await query(`CREATE INDEX IF NOT EXISTS app_sessions_user_idx ON app_sessions (user_id, created_at DESC);`);
  await query(`
    CREATE TABLE IF NOT EXISTS app_wallet_orders (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      chain TEXT NOT NULL DEFAULT '',
      transaction_hash TEXT NOT NULL DEFAULT '',
      paypal_order_id TEXT NOT NULL DEFAULT '',
      payload JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
  await query(`
    ALTER TABLE app_wallet_orders
      ADD COLUMN IF NOT EXISTS user_id TEXT NOT NULL DEFAULT '',
      ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'pending',
      ADD COLUMN IF NOT EXISTS chain TEXT NOT NULL DEFAULT '',
      ADD COLUMN IF NOT EXISTS transaction_hash TEXT NOT NULL DEFAULT '',
      ADD COLUMN IF NOT EXISTS paypal_order_id TEXT NOT NULL DEFAULT '',
      ADD COLUMN IF NOT EXISTS payload JSONB NOT NULL DEFAULT '{}'::jsonb,
      ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
  `);
  await query(`CREATE INDEX IF NOT EXISTS app_wallet_orders_user_created_idx ON app_wallet_orders (user_id, created_at DESC);`);
  await query(`CREATE INDEX IF NOT EXISTS app_wallet_orders_status_idx ON app_wallet_orders (status, created_at DESC);`);
  await createUniqueIndex(`
    CREATE UNIQUE INDEX IF NOT EXISTS app_wallet_orders_chain_tx_uidx
      ON app_wallet_orders (chain, transaction_hash)
      WHERE transaction_hash <> '';
  `);
  await createUniqueIndex(`
    CREATE UNIQUE INDEX IF NOT EXISTS app_wallet_orders_paypal_uidx
      ON app_wallet_orders (paypal_order_id)
      WHERE paypal_order_id <> '';
  `);
  await query(`
    CREATE TABLE IF NOT EXISTS app_credit_ledger (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      delta NUMERIC(24, 6) NOT NULL,
      balance_after NUMERIC(24, 6) NOT NULL DEFAULT 0,
      type TEXT NOT NULL DEFAULT '',
      meta JSONB NOT NULL DEFAULT '{}'::jsonb,
      payload JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
  await query(`
    ALTER TABLE app_credit_ledger
      ADD COLUMN IF NOT EXISTS user_id TEXT NOT NULL DEFAULT '',
      ADD COLUMN IF NOT EXISTS delta NUMERIC(24, 6) NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS balance_after NUMERIC(24, 6) NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS type TEXT NOT NULL DEFAULT '',
      ADD COLUMN IF NOT EXISTS meta JSONB NOT NULL DEFAULT '{}'::jsonb,
      ADD COLUMN IF NOT EXISTS payload JSONB NOT NULL DEFAULT '{}'::jsonb,
      ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
  `);
  await query(`CREATE INDEX IF NOT EXISTS app_credit_ledger_user_created_idx ON app_credit_ledger (user_id, created_at DESC);`);
  await createUniqueIndex(`
    CREATE UNIQUE INDEX IF NOT EXISTS app_credit_ledger_order_event_uidx
      ON app_credit_ledger (type, (meta->>'orderId'))
      WHERE COALESCE(meta->>'orderId', '') <> '';
  `);
  await createUniqueIndex(`
    CREATE UNIQUE INDEX IF NOT EXISTS app_credit_ledger_task_event_uidx
      ON app_credit_ledger (type, (meta->>'taskId'))
      WHERE COALESCE(meta->>'taskId', '') <> '';
  `);
  await query(`
    CREATE TABLE IF NOT EXISTS app_user_assets (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      mime TEXT NOT NULL DEFAULT '',
      payload JSONB NOT NULL DEFAULT '{}'::jsonb,
      deleted_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
  await query(`
    ALTER TABLE app_user_assets
      ADD COLUMN IF NOT EXISTS user_id TEXT NOT NULL DEFAULT '',
      ADD COLUMN IF NOT EXISTS mime TEXT NOT NULL DEFAULT '',
      ADD COLUMN IF NOT EXISTS payload JSONB NOT NULL DEFAULT '{}'::jsonb,
      ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
  `);
  await query(`CREATE INDEX IF NOT EXISTS app_user_assets_user_created_idx ON app_user_assets (user_id, created_at DESC);`);
  await query(`
    CREATE TABLE IF NOT EXISTS app_user_characters (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      payload JSONB NOT NULL DEFAULT '{}'::jsonb,
      deleted_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
  await query(`
    ALTER TABLE app_user_characters
      ADD COLUMN IF NOT EXISTS user_id TEXT NOT NULL DEFAULT '',
      ADD COLUMN IF NOT EXISTS payload JSONB NOT NULL DEFAULT '{}'::jsonb,
      ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
  `);
  await query(`CREATE INDEX IF NOT EXISTS app_user_characters_user_created_idx ON app_user_characters (user_id, created_at DESC);`);
  await query(`
    CREATE TABLE IF NOT EXISTS app_user_unlocks (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      payload JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
  await query(`
    ALTER TABLE app_user_unlocks
      ADD COLUMN IF NOT EXISTS user_id TEXT NOT NULL DEFAULT '',
      ADD COLUMN IF NOT EXISTS payload JSONB NOT NULL DEFAULT '{}'::jsonb,
      ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
  `);
  await query(`CREATE INDEX IF NOT EXISTS app_user_unlocks_user_created_idx ON app_user_unlocks (user_id, created_at DESC);`);
  await query(`
    CREATE TABLE IF NOT EXISTS app_admin_home_items (
      id TEXT PRIMARY KEY,
      payload JSONB NOT NULL DEFAULT '{}'::jsonb,
      deleted_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
  await query(`
    ALTER TABLE app_admin_home_items
      ADD COLUMN IF NOT EXISTS payload JSONB NOT NULL DEFAULT '{}'::jsonb,
      ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
  `);
  await query(`CREATE INDEX IF NOT EXISTS app_admin_home_items_created_idx ON app_admin_home_items (created_at DESC);`);
  await query(`
    CREATE TABLE IF NOT EXISTS app_workflow_presets (
      id TEXT PRIMARY KEY,
      payload JSONB NOT NULL DEFAULT '{}'::jsonb,
      deleted_at TIMESTAMPTZ,
      sort_order INT NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
  await query(`
    ALTER TABLE app_workflow_presets
      ADD COLUMN IF NOT EXISTS payload JSONB NOT NULL DEFAULT '{}'::jsonb,
      ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS sort_order INT NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
  `);
  await query(`CREATE INDEX IF NOT EXISTS app_workflow_presets_sort_idx ON app_workflow_presets (sort_order ASC, updated_at DESC);`);
  await query(`
    CREATE TABLE IF NOT EXISTS app_support_messages (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL DEFAULT '',
      payload JSONB NOT NULL DEFAULT '{}'::jsonb,
      deleted_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
  await query(`
    ALTER TABLE app_support_messages
      ADD COLUMN IF NOT EXISTS user_id TEXT NOT NULL DEFAULT '',
      ADD COLUMN IF NOT EXISTS payload JSONB NOT NULL DEFAULT '{}'::jsonb,
      ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
  `);
  await query(`CREATE INDEX IF NOT EXISTS app_support_messages_user_created_idx ON app_support_messages (user_id, created_at DESC);`);
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
  await query(`
    CREATE TABLE IF NOT EXISTS app_api_subtokens (
      id TEXT PRIMARY KEY,
      token TEXT NOT NULL UNIQUE,
      parent_user_id TEXT NOT NULL,
      name TEXT NOT NULL,
      quota_type TEXT NOT NULL CHECK (quota_type IN ('amount', 'count')),
      quota_limit NUMERIC(24, 6) NOT NULL DEFAULT 0,
      used_amount NUMERIC(24, 6) NOT NULL DEFAULT 0,
      used_count INTEGER NOT NULL DEFAULT 0,
      expires_at TIMESTAMPTZ,
      revoked_at TIMESTAMPTZ,
      last_used_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
  await query(`
    CREATE TABLE IF NOT EXISTS app_api_subtoken_usage (
      id BIGSERIAL PRIMARY KEY,
      token_id TEXT NOT NULL REFERENCES app_api_subtokens(id) ON DELETE CASCADE,
      event_key TEXT NOT NULL,
      parent_user_id TEXT NOT NULL,
      delta_amount NUMERIC(24, 6) NOT NULL DEFAULT 0,
      delta_count INTEGER NOT NULL DEFAULT 0,
      meta JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (token_id, event_key)
    );
  `);
  await query(`
    CREATE INDEX IF NOT EXISTS app_api_subtokens_parent_created_idx
      ON app_api_subtokens (parent_user_id, created_at DESC);
  `);
  await query(`
    CREATE INDEX IF NOT EXISTS app_api_subtokens_created_idx
      ON app_api_subtokens (created_at DESC);
  `);
  await query(`
    CREATE INDEX IF NOT EXISTS app_api_subtoken_usage_token_created_idx
      ON app_api_subtoken_usage (token_id, created_at DESC);
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

function payloadCreatedAt(record = {}) {
  const parsed = Date.parse(record.createdAt || "");
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : new Date().toISOString();
}

function payloadUpdatedAt(record = {}) {
  const parsed = Date.parse(record.updatedAt || record.createdAt || "");
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : payloadCreatedAt(record);
}

function deletedAtOrNull(record = {}) {
  const value = record.deletedAt || record.deleted_at || "";
  if (!value) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null;
}

function creditNumber(value, fallback = 0) {
  const next = Number(value);
  if (!Number.isFinite(next)) return fallback;
  return Math.round(next * 1000000) / 1000000;
}

function rowPayload(row = {}) {
  return row.payload && typeof row.payload === "object" ? row.payload : {};
}

function userFromRow(row = {}) {
  const payload = rowPayload(row);
  return {
    ...payload,
    id: String(row.id || payload.id || ""),
    username: String(row.username || payload.username || ""),
    apiToken: String(row.api_token || payload.apiToken || ""),
    role: String(row.role || payload.role || "user"),
    passwordHash: String(row.password_hash || payload.passwordHash || ""),
    credits: creditNumber(row.credits ?? payload.credits ?? 0),
    pricingMultiplier: creditNumber(row.pricing_multiplier ?? payload.pricingMultiplier ?? 1, 1),
    apiPricingMultiplier: creditNumber(row.api_pricing_multiplier ?? payload.apiPricingMultiplier ?? payload.apiPriceMultiplier ?? payload.apiDiscount ?? 1, 1),
    deletedAt: row.deleted_at ? new Date(row.deleted_at).toISOString() : (payload.deletedAt || ""),
    createdAt: row.created_at ? new Date(row.created_at).toISOString() : (payload.createdAt || ""),
    updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : (payload.updatedAt || ""),
  };
}

function recordFromPayloadRow(row = {}) {
  const payload = rowPayload(row);
  return {
    ...payload,
    id: String(row.id || payload.id || ""),
    userId: String(row.user_id || payload.userId || ""),
    deletedAt: row.deleted_at ? new Date(row.deleted_at).toISOString() : (payload.deletedAt || ""),
    createdAt: row.created_at ? new Date(row.created_at).toISOString() : (payload.createdAt || ""),
    updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : (payload.updatedAt || ""),
  };
}

function walletOrderFromRow(row = {}) {
  const payload = recordFromPayloadRow(row);
  return {
    ...payload,
    status: String(row.status || payload.status || "pending"),
    chain: String(row.chain || payload.chain || payload.network || ""),
    transactionHash: String(row.transaction_hash || payload.transactionHash || payload.txHash || ""),
    paypalOrderId: String(row.paypal_order_id || payload.paypalOrderId || ""),
  };
}

function sessionFromRow(row = {}) {
  const payload = rowPayload(row);
  return {
    ...payload,
    token: String(row.token || payload.token || ""),
    userId: String(row.user_id || payload.userId || ""),
    createdAt: row.created_at ? new Date(row.created_at).toISOString() : (payload.createdAt || ""),
    updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : (payload.updatedAt || ""),
  };
}

function ledgerFromRow(row = {}) {
  const payload = rowPayload(row);
  return {
    ...payload,
    id: String(row.id || payload.id || ""),
    userId: String(row.user_id || payload.userId || ""),
    delta: creditNumber(row.delta ?? payload.delta ?? 0),
    balanceAfter: creditNumber(row.balance_after ?? payload.balanceAfter ?? 0),
    type: String(row.type || payload.type || ""),
    meta: row.meta && typeof row.meta === "object" ? row.meta : (payload.meta || {}),
    createdAt: row.created_at ? new Date(row.created_at).toISOString() : (payload.createdAt || ""),
  };
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

async function tableCounts() {
  if (!dbEnabled()) return {};
  await ensureSchema();
  const { rows } = await query(`
    SELECT 'users' AS name, COUNT(*)::int AS count FROM app_users
    UNION ALL SELECT 'sessions', COUNT(*)::int FROM app_sessions
    UNION ALL SELECT 'wallet_orders', COUNT(*)::int FROM app_wallet_orders
    UNION ALL SELECT 'credit_ledger', COUNT(*)::int FROM app_credit_ledger
    UNION ALL SELECT 'user_assets', COUNT(*)::int FROM app_user_assets
    UNION ALL SELECT 'user_characters', COUNT(*)::int FROM app_user_characters
    UNION ALL SELECT 'user_unlocks', COUNT(*)::int FROM app_user_unlocks
    UNION ALL SELECT 'admin_home_items', COUNT(*)::int FROM app_admin_home_items
    UNION ALL SELECT 'support_messages', COUNT(*)::int FROM app_support_messages
  `);
  return Object.fromEntries(rows.map((row) => [row.name, row.count]));
}

async function readAppDbFromTables(defaultDb = {}) {
  if (!dbEnabled()) return null;
  await ensureSchema();
  const [
    users,
    sessions,
    walletOrders,
    creditLedger,
    userAssets,
    userCharacters,
    userUnlocks,
    adminHomeItems,
    supportMessages,
  ] = await Promise.all([
    query(`SELECT * FROM app_users WHERE deleted_at IS NULL ORDER BY created_at ASC`),
    query(`SELECT * FROM app_sessions ORDER BY created_at ASC`),
    query(`SELECT * FROM app_wallet_orders ORDER BY created_at DESC`),
    query(`SELECT * FROM app_credit_ledger ORDER BY created_at DESC LIMIT 1000`),
    query(`SELECT * FROM app_user_assets ORDER BY created_at DESC`),
    query(`SELECT * FROM app_user_characters ORDER BY created_at DESC`),
    query(`SELECT * FROM app_user_unlocks ORDER BY created_at DESC`),
    query(`SELECT * FROM app_admin_home_items ORDER BY created_at DESC`),
    query(`SELECT * FROM app_support_messages ORDER BY created_at DESC`),
  ]);
  return {
    users: users.rows.map(userFromRow),
    sessions: sessions.rows.map(sessionFromRow),
    walletOrders: walletOrders.rows.map(walletOrderFromRow),
    creditLedger: creditLedger.rows.map(ledgerFromRow),
    userAssets: userAssets.rows.map(recordFromPayloadRow),
    userCharacters: userCharacters.rows.map(recordFromPayloadRow),
    userUnlocks: userUnlocks.rows.map(recordFromPayloadRow),
    adminHomeItems: adminHomeItems.rows.map(recordFromPayloadRow),
    supportMessages: supportMessages.rows.map(recordFromPayloadRow),
    apiSubtokens: Array.isArray(defaultDb.apiSubtokens) ? defaultDb.apiSubtokens : [],
  };
}

async function replaceAppDbTables(db = {}, options = {}) {
  if (!dbEnabled()) return null;
  await ensureSchema();
  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    if (options.replaceAll === true) {
      await client.query("DELETE FROM app_support_messages");
      await client.query("DELETE FROM app_admin_home_items");
      await client.query("DELETE FROM app_user_unlocks");
      await client.query("DELETE FROM app_user_characters");
      await client.query("DELETE FROM app_user_assets");
      await client.query("DELETE FROM app_credit_ledger");
      await client.query("DELETE FROM app_wallet_orders");
      await client.query("DELETE FROM app_sessions");
      await client.query("DELETE FROM app_users");
    }

    for (const message of Array.isArray(db.supportMessages) ? db.supportMessages : []) {
      const id = String(message?.id || "").trim();
      if (!id) continue;
      await client.query(
        `
          INSERT INTO app_support_messages(id, user_id, payload, deleted_at, created_at, updated_at)
          VALUES ($1, $2, $3::jsonb, $4::timestamptz, $5::timestamptz, $6::timestamptz)
          ON CONFLICT (id) DO UPDATE SET
            user_id = EXCLUDED.user_id,
            payload = EXCLUDED.payload,
            deleted_at = EXCLUDED.deleted_at,
            updated_at = EXCLUDED.updated_at
        `,
        [
          id,
          String(message.userId || ""),
          JSON.stringify(message),
          message.deletedAt || null,
          message.createdAt || new Date().toISOString(),
          message.updatedAt || message.createdAt || new Date().toISOString(),
        ],
      );
    }

    for (const user of Array.isArray(db.users) ? db.users : []) {
      await client.query(
        `
          INSERT INTO app_users(id, username, api_token, role, password_hash, credits, pricing_multiplier, api_pricing_multiplier, payload, deleted_at, created_at, updated_at)
          VALUES ($1, $2, NULLIF($3, ''), $4, $5, $6::numeric, $7::numeric, $8::numeric, $9::jsonb, $10::timestamptz, $11::timestamptz, $12::timestamptz)
          ON CONFLICT (id) DO UPDATE SET
            username = EXCLUDED.username,
            api_token = EXCLUDED.api_token,
            role = EXCLUDED.role,
            password_hash = EXCLUDED.password_hash,
            pricing_multiplier = EXCLUDED.pricing_multiplier,
            api_pricing_multiplier = EXCLUDED.api_pricing_multiplier,
            payload = EXCLUDED.payload,
            deleted_at = EXCLUDED.deleted_at,
            updated_at = EXCLUDED.updated_at
        `,
        [
          String(user.id || ""),
          String(user.username || ""),
          String(user.apiToken || ""),
          String(user.role || "user"),
          String(user.passwordHash || ""),
          creditNumber(user.credits || 0),
          creditNumber(user.pricingMultiplier ?? user.priceMultiplier ?? user.discount ?? 1, 1),
          creditNumber(user.apiPricingMultiplier ?? user.apiPriceMultiplier ?? user.apiDiscount ?? 1, 1),
          JSON.stringify(user),
          deletedAtOrNull(user),
          payloadCreatedAt(user),
          payloadUpdatedAt(user),
        ],
      );
    }
    for (const session of Array.isArray(db.sessions) ? db.sessions : []) {
      await client.query(
        `
          INSERT INTO app_sessions(token, user_id, payload, created_at, updated_at)
          VALUES ($1, $2, $3::jsonb, $4::timestamptz, $5::timestamptz)
          ON CONFLICT (token) DO UPDATE SET user_id = EXCLUDED.user_id, payload = EXCLUDED.payload, updated_at = EXCLUDED.updated_at
        `,
        [String(session.token || ""), String(session.userId || ""), JSON.stringify(session), payloadCreatedAt(session), payloadUpdatedAt(session)],
      );
    }
    for (const order of Array.isArray(db.walletOrders) ? db.walletOrders : []) {
      await client.query(
        `
          INSERT INTO app_wallet_orders(id, user_id, status, chain, transaction_hash, paypal_order_id, payload, created_at, updated_at)
          VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::timestamptz, $9::timestamptz)
          ON CONFLICT (id) DO UPDATE SET
            user_id = EXCLUDED.user_id,
            status = EXCLUDED.status,
            chain = EXCLUDED.chain,
            transaction_hash = EXCLUDED.transaction_hash,
            paypal_order_id = EXCLUDED.paypal_order_id,
            payload = EXCLUDED.payload,
            updated_at = EXCLUDED.updated_at
          WHERE app_wallet_orders.status <> 'paid' OR EXCLUDED.status = 'paid'
        `,
        [
          String(order.id || ""),
          String(order.userId || ""),
          String(order.status || "pending"),
          String(order.chain || order.network || ""),
          String(order.transactionHash || order.txHash || ""),
          String(order.paypalOrderId || ""),
          JSON.stringify(order),
          payloadCreatedAt(order),
          payloadUpdatedAt(order),
        ],
      );
    }
    for (const entry of Array.isArray(db.creditLedger) ? db.creditLedger : []) {
      await client.query(
        `
          INSERT INTO app_credit_ledger(id, user_id, delta, balance_after, type, meta, payload, created_at)
          VALUES ($1, $2, $3::numeric, $4::numeric, $5, $6::jsonb, $7::jsonb, $8::timestamptz)
          ON CONFLICT DO NOTHING
        `,
        [
          String(entry.id || ""),
          String(entry.userId || ""),
          creditNumber(entry.delta || 0),
          creditNumber(entry.balanceAfter || 0),
          String(entry.type || ""),
          JSON.stringify(entry.meta || {}),
          JSON.stringify(entry),
          payloadCreatedAt(entry),
        ],
      );
    }
    const insertPayloadTable = async (table, record) => {
      await client.query(
        `
          INSERT INTO ${table}(id, user_id, payload, deleted_at, created_at, updated_at)
          VALUES ($1, $2, $3::jsonb, $4::timestamptz, $5::timestamptz, $6::timestamptz)
          ON CONFLICT (id) DO UPDATE SET
            user_id = EXCLUDED.user_id,
            payload = EXCLUDED.payload,
            deleted_at = EXCLUDED.deleted_at,
            updated_at = EXCLUDED.updated_at
        `,
        [String(record.id || ""), String(record.userId || ""), JSON.stringify(record), deletedAtOrNull(record), payloadCreatedAt(record), payloadUpdatedAt(record)],
      );
    };
    for (const record of Array.isArray(db.userAssets) ? db.userAssets : []) await insertPayloadTable("app_user_assets", record);
    for (const record of Array.isArray(db.userCharacters) ? db.userCharacters : []) await insertPayloadTable("app_user_characters", record);
    for (const record of Array.isArray(db.userUnlocks) ? db.userUnlocks : []) await insertPayloadTable("app_user_unlocks", record);
    for (const record of Array.isArray(db.adminHomeItems) ? db.adminHomeItems : []) {
      await client.query(
        `
          INSERT INTO app_admin_home_items(id, payload, deleted_at, created_at, updated_at)
          VALUES ($1, $2::jsonb, $3::timestamptz, $4::timestamptz, $5::timestamptz)
          ON CONFLICT (id) DO UPDATE SET payload = EXCLUDED.payload, deleted_at = EXCLUDED.deleted_at, updated_at = EXCLUDED.updated_at
        `,
        [String(record.id || ""), JSON.stringify(record), deletedAtOrNull(record), payloadCreatedAt(record), payloadUpdatedAt(record)],
      );
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
  return db;
}

async function deleteUserSessionsInDb(userId = "", exceptToken = "") {
  if (!dbEnabled()) return { rowCount: 0 };
  const cleanUserId = String(userId || "").trim();
  if (!cleanUserId) return { rowCount: 0 };
  await ensureSchema();
  return await query(
    `
      DELETE FROM app_sessions
      WHERE user_id = $1
        AND ($2 = '' OR token <> $2)
    `,
    [cleanUserId, String(exceptToken || "")],
  );
}

async function deleteUserWalletOrdersInDb(userId = "") {
  if (!dbEnabled()) return { rowCount: 0 };
  const cleanUserId = String(userId || "").trim();
  if (!cleanUserId) return { rowCount: 0 };
  await ensureSchema();
  return await query(`DELETE FROM app_wallet_orders WHERE user_id = $1`, [cleanUserId]);
}

async function createWalletOrderInDb(order = {}) {
  if (!dbEnabled()) return null;
  const id = String(order.id || "").trim();
  if (!id) return null;
  await ensureSchema();
  const payload = { ...order };
  const result = await query(
    `
      INSERT INTO app_wallet_orders(id, user_id, status, chain, transaction_hash, paypal_order_id, payload, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::timestamptz, $9::timestamptz)
      ON CONFLICT DO NOTHING
      RETURNING id
    `,
    [
      id,
      String(order.userId || ""),
      String(order.status || "pending"),
      String(order.chain || order.network || ""),
      String(order.transactionHash || order.txHash || ""),
      String(order.paypalOrderId || ""),
      JSON.stringify(payload),
      payloadCreatedAt(payload),
      payloadUpdatedAt(payload),
    ],
  );
  return result.rows.length ? order : null;
}

async function createManualWalletOrderInDb({ order = {}, suffixDigits = 6, maxAttempts = 25 } = {}) {
  if (!dbEnabled()) return order;
  let lastOrder = order;
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const suffixNumber = Math.floor(Math.random() * 9999) + 1;
    const suffix = `00${String(suffixNumber).padStart(4, "0")}`;
    const baseAmount = Math.max(1, Math.round(Number(order.baseAmount || 0)));
    const payableAmountText = `${baseAmount}.${suffix}`;
    const next = {
      ...order,
      baseAmount,
      suffix,
      payableAmount: Number(payableAmountText),
      payableAmountText,
    };
    try {
      const created = await createWalletOrderInDb(next);
      if (created) return created;
      lastOrder = next;
    } catch (error) {
      if (String(error.code || "") !== "23505") throw error;
      lastOrder = next;
    }
  }
  const error = new Error("Unable to allocate a unique wallet payment amount.");
  error.statusCode = 409;
  error.lastOrder = lastOrder;
  throw error;
}

async function getUserByUsernameInDb(username = "") {
  if (!dbEnabled()) return null;
  const cleanUsername = String(username || "").trim().toLowerCase();
  if (!cleanUsername) return null;
  await ensureSchema();
  const { rows } = await query(`SELECT * FROM app_users WHERE username = $1 AND deleted_at IS NULL`, [cleanUsername]);
  return rows[0] ? userFromRow(rows[0]) : null;
}

async function getUserByIdInDb(userId = "") {
  if (!dbEnabled()) return null;
  const cleanUserId = String(userId || "").trim();
  if (!cleanUserId) return null;
  await ensureSchema();
  const { rows } = await query(`SELECT * FROM app_users WHERE id = $1 AND deleted_at IS NULL`, [cleanUserId]);
  return rows[0] ? userFromRow(rows[0]) : null;
}

async function createSessionInDb(session = {}) {
  if (!dbEnabled()) return null;
  const token = String(session.token || "").trim();
  if (!token) return null;
  await ensureSchema();
  const payload = { ...session };
  await query(
    `
      INSERT INTO app_sessions(token, user_id, payload, created_at, updated_at)
      VALUES ($1, $2, $3::jsonb, $4::timestamptz, $5::timestamptz)
      ON CONFLICT (token) DO NOTHING
    `,
    [token, String(session.userId || ""), JSON.stringify(payload), payloadCreatedAt(payload), payloadUpdatedAt(payload)],
  );
  return session;
}

async function getSessionByTokenInDb(token = "") {
  if (!dbEnabled()) return null;
  const cleanToken = String(token || "").trim();
  if (!cleanToken) return null;
  await ensureSchema();
  const { rows } = await query(`SELECT * FROM app_sessions WHERE token = $1`, [cleanToken]);
  return rows[0] ? sessionFromRow(rows[0]) : null;
}

async function getWalletOrderByIdInDb(orderId = "") {
  if (!dbEnabled()) return null;
  const id = String(orderId || "").trim();
  if (!id) return null;
  await ensureSchema();
  const { rows } = await query(`SELECT * FROM app_wallet_orders WHERE id = $1`, [id]);
  return rows[0] ? walletOrderFromRow(rows[0]) : null;
}

async function getWalletOrderByPaypalIdInDb(paypalOrderId = "") {
  if (!dbEnabled()) return null;
  const id = String(paypalOrderId || "").trim();
  if (!id) return null;
  await ensureSchema();
  const { rows } = await query(`SELECT * FROM app_wallet_orders WHERE paypal_order_id = $1`, [id]);
  return rows[0] ? walletOrderFromRow(rows[0]) : null;
}

async function updateWalletOrderInDb(order = {}) {
  if (!dbEnabled()) return null;
  const id = String(order.id || "").trim();
  if (!id) return null;
  await ensureSchema();
  const payload = { ...order };
  await query(
    `
      INSERT INTO app_wallet_orders(id, user_id, status, chain, transaction_hash, paypal_order_id, payload, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::timestamptz, $9::timestamptz)
      ON CONFLICT (id) DO UPDATE SET
        user_id = EXCLUDED.user_id,
        status = EXCLUDED.status,
        chain = EXCLUDED.chain,
        transaction_hash = EXCLUDED.transaction_hash,
        paypal_order_id = EXCLUDED.paypal_order_id,
        payload = EXCLUDED.payload,
        updated_at = EXCLUDED.updated_at
      WHERE app_wallet_orders.status <> 'paid' OR EXCLUDED.status = 'paid'
    `,
    [
      id,
      String(order.userId || ""),
      String(order.status || "pending"),
      String(order.chain || order.network || ""),
      String(order.transactionHash || order.txHash || ""),
      String(order.paypalOrderId || ""),
      JSON.stringify(payload),
      payloadCreatedAt(payload),
      payloadUpdatedAt(payload),
    ],
  );
  return order;
}

async function updateUserInDb(user = {}) {
  if (!dbEnabled()) return null;
  const id = String(user.id || "").trim();
  if (!id) return null;
  await ensureSchema();
  const payload = { ...user };
  await query(
    `
      INSERT INTO app_users(id, username, api_token, role, password_hash, credits, pricing_multiplier, api_pricing_multiplier, payload, deleted_at, created_at, updated_at)
      VALUES ($1, $2, NULLIF($3, ''), $4, $5, $6::numeric, $7::numeric, $8::numeric, $9::jsonb, $10::timestamptz, $11::timestamptz, $12::timestamptz)
      ON CONFLICT (id) DO UPDATE SET
        username = EXCLUDED.username,
        api_token = EXCLUDED.api_token,
        role = EXCLUDED.role,
        password_hash = EXCLUDED.password_hash,
        credits = EXCLUDED.credits,
        pricing_multiplier = EXCLUDED.pricing_multiplier,
        api_pricing_multiplier = EXCLUDED.api_pricing_multiplier,
        payload = EXCLUDED.payload,
        deleted_at = EXCLUDED.deleted_at,
        updated_at = EXCLUDED.updated_at
    `,
    [
      id,
      String(user.username || ""),
      String(user.apiToken || ""),
      String(user.role || "user"),
      String(user.passwordHash || ""),
      creditNumber(user.credits || 0),
      creditNumber(user.pricingMultiplier ?? user.priceMultiplier ?? user.discount ?? 1, 1),
      creditNumber(user.apiPricingMultiplier ?? user.apiPriceMultiplier ?? user.apiDiscount ?? 1, 1),
      JSON.stringify(payload),
      deletedAtOrNull(payload),
      payloadCreatedAt(payload),
      payloadUpdatedAt(payload),
    ],
  );
  return user;
}

async function upsertUserAssetInDb(asset = {}) {
  if (!dbEnabled()) return null;
  const id = String(asset.id || "").trim();
  if (!id) return null;
  await ensureSchema();
  const payload = { ...asset };
  await query(
    `
      INSERT INTO app_user_assets(id, user_id, mime, payload, deleted_at, created_at, updated_at)
      VALUES ($1, $2, $3, $4::jsonb, $5::timestamptz, $6::timestamptz, $7::timestamptz)
      ON CONFLICT (id) DO UPDATE SET
        user_id = EXCLUDED.user_id,
        mime = EXCLUDED.mime,
        payload = EXCLUDED.payload,
        deleted_at = EXCLUDED.deleted_at,
        updated_at = EXCLUDED.updated_at
    `,
    [
      id,
      String(asset.userId || ""),
      String(asset.mime || ""),
      JSON.stringify(payload),
      deletedAtOrNull(payload),
      payloadCreatedAt(payload),
      payloadUpdatedAt(payload),
    ],
  );
  return asset;
}

async function upsertUserCharacterInDb(character = {}) {
  if (!dbEnabled()) return null;
  const id = String(character.id || "").trim();
  if (!id) return null;
  await ensureSchema();
  const payload = { ...character };
  await query(
    `
      INSERT INTO app_user_characters(id, user_id, payload, deleted_at, created_at, updated_at)
      VALUES ($1, $2, $3::jsonb, $4::timestamptz, $5::timestamptz, $6::timestamptz)
      ON CONFLICT (id) DO UPDATE SET
        user_id = EXCLUDED.user_id,
        payload = EXCLUDED.payload,
        deleted_at = EXCLUDED.deleted_at,
        updated_at = EXCLUDED.updated_at
    `,
    [
      id,
      String(character.userId || ""),
      JSON.stringify(payload),
      deletedAtOrNull(payload),
      payloadCreatedAt(payload),
      payloadUpdatedAt(payload),
    ],
  );
  return character;
}

async function upsertUserUnlockInDb(unlock = {}) {
  if (!dbEnabled()) return null;
  const id = String(unlock.id || "").trim();
  if (!id) return null;
  await ensureSchema();
  const payload = { ...unlock };
  await query(
    `
      INSERT INTO app_user_unlocks(id, user_id, payload, created_at, updated_at)
      VALUES ($1, $2, $3::jsonb, $4::timestamptz, $5::timestamptz)
      ON CONFLICT (id) DO UPDATE SET
        user_id = EXCLUDED.user_id,
        payload = EXCLUDED.payload,
        updated_at = EXCLUDED.updated_at
    `,
    [
      id,
      String(unlock.userId || ""),
      JSON.stringify(payload),
      payloadCreatedAt(payload),
      payloadUpdatedAt(payload),
    ],
  );
  return unlock;
}

async function listAdminHomeItemsFromDb({ includeDeleted = false } = {}) {
  if (!dbEnabled()) return null;
  await ensureSchema();
  const { rows } = await query(
    `
      SELECT *
      FROM app_admin_home_items
      ${includeDeleted ? "" : "WHERE deleted_at IS NULL"}
      ORDER BY updated_at DESC, created_at DESC
    `,
  );
  return rows.map(recordFromPayloadRow);
}

async function upsertAdminHomeItemInDb(item = {}) {
  if (!dbEnabled()) return null;
  const id = String(item.id || "").trim();
  if (!id) return null;
  await ensureSchema();
  const payload = { ...item };
  await query(
    `
      INSERT INTO app_admin_home_items(id, payload, deleted_at, created_at, updated_at)
      VALUES ($1, $2::jsonb, $3::timestamptz, $4::timestamptz, $5::timestamptz)
      ON CONFLICT (id) DO UPDATE SET
        payload = EXCLUDED.payload,
        deleted_at = EXCLUDED.deleted_at,
        updated_at = EXCLUDED.updated_at
    `,
    [
      id,
      JSON.stringify(payload),
      deletedAtOrNull(payload),
      payloadCreatedAt(payload),
      payloadUpdatedAt(payload),
    ],
  );
  return item;
}

async function replaceAdminHomeItemsInDb(items = []) {
  if (!dbEnabled()) return null;
  await ensureSchema();
  const normalized = (Array.isArray(items) ? items : [])
    .filter((item) => item && String(item.id || "").trim())
    .map((item) => ({ ...item }));
  for (const item of normalized) {
    await upsertAdminHomeItemInDb(item);
  }
  const activeIds = normalized.map((item) => String(item.id || "").trim()).filter(Boolean);
  const now = new Date().toISOString();
  await query(
    `
      UPDATE app_admin_home_items
      SET deleted_at = COALESCE(deleted_at, $2::timestamptz),
          payload = payload || jsonb_build_object('deletedAt', COALESCE(payload->>'deletedAt', $2::text), 'updatedAt', $2::text),
          updated_at = $2::timestamptz
      WHERE NOT (id = ANY($1::text[]))
        AND deleted_at IS NULL
    `,
    [activeIds, now],
  );
  return normalized;
}

async function softDeleteAdminHomeItemInDb(itemId = "", deletedAt = new Date().toISOString()) {
  if (!dbEnabled()) return null;
  const id = String(itemId || "").trim();
  if (!id) return null;
  await ensureSchema();
  const { rows } = await query(`SELECT * FROM app_admin_home_items WHERE id = $1`, [id]);
  const current = rows[0] ? recordFromPayloadRow(rows[0]) : null;
  if (!current) return null;
  const payload = { ...current, deletedAt, updatedAt: deletedAt };
  await query(
    `
      UPDATE app_admin_home_items
      SET payload = $2::jsonb,
          deleted_at = $3::timestamptz,
          updated_at = $3::timestamptz
      WHERE id = $1
    `,
    [id, JSON.stringify(payload), deletedAt],
  );
  return payload;
}

async function listWorkflowPresetsFromDb({ includeDeleted = false } = {}) {
  if (!dbEnabled()) return null;
  await ensureSchema();
  const { rows } = await query(
    `
      SELECT *
      FROM app_workflow_presets
      ${includeDeleted ? "" : "WHERE deleted_at IS NULL"}
      ORDER BY sort_order ASC, updated_at DESC, created_at DESC
    `,
  );
  return rows.map(recordFromPayloadRow);
}

async function upsertWorkflowPresetInDb(preset = {}) {
  if (!dbEnabled()) return null;
  const id = String(preset.id || "").trim();
  if (!id) return null;
  await ensureSchema();
  const now = new Date().toISOString();
  const payload = {
    ...preset,
    id,
    createdAt: preset.createdAt || now,
    updatedAt: preset.updatedAt || now,
  };
  await query(
    `
      INSERT INTO app_workflow_presets(id, payload, deleted_at, sort_order, created_at, updated_at)
      VALUES ($1, $2::jsonb, $3::timestamptz, $4::int, $5::timestamptz, $6::timestamptz)
      ON CONFLICT (id) DO UPDATE SET
        payload = EXCLUDED.payload,
        deleted_at = EXCLUDED.deleted_at,
        sort_order = EXCLUDED.sort_order,
        updated_at = EXCLUDED.updated_at
    `,
    [
      id,
      JSON.stringify(payload),
      deletedAtOrNull(payload),
      Number(payload.sortOrder || 0) || 0,
      payloadCreatedAt(payload),
      payloadUpdatedAt(payload),
    ],
  );
  return payload;
}

async function replaceWorkflowPresetsInDb(presets = []) {
  if (!dbEnabled()) return null;
  await ensureSchema();
  const normalized = (Array.isArray(presets) ? presets : [])
    .filter((preset) => preset && String(preset.id || "").trim())
    .map((preset, index) => ({ ...preset, sortOrder: Number(preset.sortOrder ?? index) || 0 }));
  for (const preset of normalized) await upsertWorkflowPresetInDb(preset);
  const activeIds = normalized.map((preset) => String(preset.id || "").trim()).filter(Boolean);
  const now = new Date().toISOString();
  await query(
    `
      UPDATE app_workflow_presets
      SET deleted_at = COALESCE(deleted_at, $2::timestamptz),
          payload = payload || jsonb_build_object('deletedAt', COALESCE(payload->>'deletedAt', $2::text), 'updatedAt', $2::text),
          updated_at = $2::timestamptz
      WHERE NOT (id = ANY($1::text[]))
        AND deleted_at IS NULL
    `,
    [activeIds, now],
  );
  return normalized;
}

async function findUserUnlockInDb({ userId = "", itemId = "", sceneId = "", sceneEntryId = "default" } = {}) {
  if (!dbEnabled()) return null;
  const cleanUserId = String(userId || "").trim();
  const cleanItemId = String(itemId || "").trim();
  const cleanSceneId = String(sceneId || "").trim();
  const cleanSceneEntryId = String(sceneEntryId || "default").trim() || "default";
  if (!cleanUserId || !cleanItemId || !cleanSceneId) return null;
  await ensureSchema();
  const { rows } = await query(
    `
      SELECT *
      FROM app_user_unlocks
      WHERE user_id = $1
        AND payload->>'itemId' = $2
        AND payload->>'sceneId' = $3
        AND COALESCE(NULLIF(payload->>'sceneEntryId', ''), 'default') = $4
      ORDER BY created_at DESC
      LIMIT 1
    `,
    [cleanUserId, cleanItemId, cleanSceneId, cleanSceneEntryId],
  );
  return rows[0] ? recordFromPayloadRow(rows[0]) : null;
}

async function applyCreditDeltaInDb({ id = "", userId = "", delta = 0, type = "", meta = {}, payload = {} } = {}) {
  if (!dbEnabled()) return null;
  const cleanUserId = String(userId || "").trim();
  const cleanType = String(type || "").trim();
  const cleanId = String(id || "").trim();
  const eventOrderId = String(meta?.orderId || "").trim();
  const eventTaskId = String(meta?.taskId || "").trim();
  const amount = creditNumber(delta || 0);
  if (!cleanUserId || !cleanId || !cleanType || amount === 0) return null;
  await ensureSchema();
  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const findExistingLedger = async () => client.query(
      `
        SELECT payload, user_id
        FROM app_credit_ledger
        WHERE id = $1
           OR (
             type = $2
             AND (
               ($3 <> '' AND meta->>'orderId' = $3)
               OR ($4 <> '' AND meta->>'taskId' = $4)
             )
           )
        LIMIT 1
      `,
      [cleanId, cleanType, eventOrderId, eventTaskId],
    );
    const userById = async (id) => {
      const targetId = String(id || cleanUserId || "").trim();
      const { rows } = await client.query(`SELECT * FROM app_users WHERE id = $1`, [targetId]);
      return rows[0] ? userFromRow(rows[0]) : null;
    };
    const existing = await findExistingLedger();
    if (existing.rows.length) {
      const existingUserId = existing.rows[0].user_id || cleanUserId;
      const existingUser = await userById(existingUserId);
      await client.query("COMMIT");
      return { user: existingUser, ledger: existing.rows[0].payload, inserted: false };
    }
    const userRows = await client.query(`SELECT * FROM app_users WHERE id = $1 FOR UPDATE`, [cleanUserId]);
    const row = userRows.rows[0];
    if (!row) {
      const error = new Error("User not found for billing.");
      error.statusCode = 404;
      throw error;
    }
    const existingAfterLock = await findExistingLedger();
    if (existingAfterLock.rows.length) {
      await client.query("COMMIT");
      const existingUser = await userById(existingAfterLock.rows[0].user_id || cleanUserId);
      return { user: existingUser || userFromRow(row), ledger: existingAfterLock.rows[0].payload, inserted: false };
    }
    const current = creditNumber(row.credits || 0);
    const nextCredits = creditNumber(current + amount);
    if (nextCredits < -0.000001) {
      const error = new Error(`Not enough credits. This generation needs ${creditNumber(-amount)} credits; your balance is ${current}. Please top up and try again.`);
      error.statusCode = 402;
      error.code = "INSUFFICIENT_CREDITS";
      error.credits = current;
      error.cost = creditNumber(-amount);
      throw error;
    }
    const now = new Date().toISOString();
    const ledger = {
      ...payload,
      id: cleanId,
      userId: cleanUserId,
      delta: amount,
      balanceAfter: nextCredits,
      type: cleanType,
      meta,
      createdAt: payload.createdAt || now,
    };
    await client.query(
      `
        UPDATE app_users
        SET credits = $2::numeric,
            payload = payload || jsonb_build_object('credits', $2::numeric, 'updatedAt', $3::text),
            updated_at = $3::timestamptz
        WHERE id = $1
      `,
      [cleanUserId, nextCredits, now],
    );
    const inserted = await client.query(
      `
        INSERT INTO app_credit_ledger(id, user_id, delta, balance_after, type, meta, payload, created_at)
        VALUES ($1, $2, $3::numeric, $4::numeric, $5, $6::jsonb, $7::jsonb, $8::timestamptz)
        ON CONFLICT DO NOTHING
        RETURNING id
      `,
      [cleanId, cleanUserId, amount, nextCredits, cleanType, JSON.stringify(meta || {}), JSON.stringify(ledger), ledger.createdAt],
    );
    if (!inserted.rows.length) {
      await client.query("ROLLBACK");
      return await applyCreditDeltaInDb({ id: cleanId, userId: cleanUserId, delta: amount, type: cleanType, meta, payload });
    }
    const updatedRows = await client.query(`SELECT * FROM app_users WHERE id = $1`, [cleanUserId]);
    await client.query("COMMIT");
    return { user: userFromRow(updatedRows.rows[0]), ledger, inserted: true };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
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

async function listApiSubtokensFromDb(parentUserId = "") {
  if (!dbEnabled()) {
    const records = await getKv("api_subtokens", []);
    return (Array.isArray(records) ? records : [])
      .map(normalizeApiSubtokenRecord)
      .filter((record) => !parentUserId || record.parentUserId === String(parentUserId))
      .sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));
  }
  await ensureSchema();
  const params = [];
  let where = "";
  if (parentUserId) {
    params.push(String(parentUserId));
    where = `WHERE parent_user_id = $1`;
  }
  const { rows } = await query(`
    SELECT *
    FROM app_api_subtokens
    ${where}
    ORDER BY created_at DESC
  `, params);
  return rows.map((row) => normalizeApiSubtokenRecord(row));
}

async function getApiSubtokenFromDbByToken(token = "") {
  const clean = String(token || "").trim();
  if (!clean) return null;
  if (!dbEnabled()) {
    const records = await getKv("api_subtokens", []);
    const found = (Array.isArray(records) ? records : []).find((record) => String(record.token || "") === clean);
    return found ? normalizeApiSubtokenRecord(found) : null;
  }
  await ensureSchema();
  const { rows } = await query(`SELECT * FROM app_api_subtokens WHERE token = $1`, [clean]);
  return rows[0] ? normalizeApiSubtokenRecord(rows[0]) : null;
}

async function getApiSubtokenFromDbById(id = "", parentUserId = "") {
  const clean = String(id || "").trim();
  if (!clean) return null;
  if (!dbEnabled()) {
    const records = await getKv("api_subtokens", []);
    const found = (Array.isArray(records) ? records : []).find((record) => (
      String(record.id || "") === clean &&
      (!parentUserId || String(record.parentUserId || record.parent_user_id || "") === String(parentUserId))
    ));
    return found ? normalizeApiSubtokenRecord(found) : null;
  }
  await ensureSchema();
  const params = [clean];
  let where = `WHERE id = $1`;
  if (parentUserId) {
    params.push(String(parentUserId));
    where += ` AND parent_user_id = $2`;
  }
  const { rows } = await query(`SELECT * FROM app_api_subtokens ${where}`, params);
  return rows[0] ? normalizeApiSubtokenRecord(rows[0]) : null;
}

async function createApiSubtokenInDb(record) {
  const next = normalizeApiSubtokenRecord(record);
  if (!next.id || !next.token || !next.parentUserId) {
    throw new Error("Invalid subtoken record");
  }
  if (!dbEnabled()) {
    const records = await getKv("api_subtokens", []);
    const list = Array.isArray(records) ? records : [];
    list.unshift(next);
    await setKv("api_subtokens", list);
    return next;
  }
  await ensureSchema();
  const { rows } = await query(`
    INSERT INTO app_api_subtokens (
      id, token, parent_user_id, name, quota_type, quota_limit,
      used_amount, used_count, expires_at, revoked_at, last_used_at,
      created_at, updated_at
    )
    VALUES (
      $1, $2, $3, $4, $5, $6::numeric, $7::numeric, $8::int,
      NULLIF($9, '')::timestamptz, NULLIF($10, '')::timestamptz, NULLIF($11, '')::timestamptz,
      NULLIF($12, '')::timestamptz, NULLIF($13, '')::timestamptz
    )
    RETURNING *
  `, [
    next.id,
    next.token,
    next.parentUserId,
    next.name,
    next.quotaType,
    next.quotaLimit,
    next.usedAmount,
    next.usedCount,
    next.expiresAt,
    next.revokedAt,
    next.lastUsedAt,
    next.createdAt,
    next.updatedAt,
  ]);
  return normalizeApiSubtokenRecord(rows[0]);
}

async function updateApiSubtokenInDb(id, parentUserId, updates = {}) {
  const cleanId = String(id || "").trim();
  if (!cleanId) return null;
  if (!dbEnabled()) {
    const records = await getKv("api_subtokens", []);
    const list = Array.isArray(records) ? records : [];
    const index = list.findIndex((record) => (
      String(record.id || "") === cleanId &&
      (!parentUserId || String(record.parentUserId || record.parent_user_id || "") === String(parentUserId))
    ));
    if (index < 0) return null;
    const current = normalizeApiSubtokenRecord(list[index]);
    const merged = normalizeApiSubtokenRecord({
      ...current,
      ...updates,
      id: current.id,
      token: current.token,
      parentUserId: current.parentUserId,
      createdAt: current.createdAt,
      usedAmount: updates.usedAmount ?? current.usedAmount,
      usedCount: updates.usedCount ?? current.usedCount,
    });
    list[index] = merged;
    await setKv("api_subtokens", list);
    return merged;
  }
  await ensureSchema();
  const sets = [];
  const params = [cleanId];
  if (parentUserId) params.push(String(parentUserId));
  const push = (column, value) => {
    params.push(value);
    sets.push(`${column} = $${params.length}`);
  };
  if (Object.prototype.hasOwnProperty.call(updates, "name")) push("name", String(updates.name || "").trim());
  if (Object.prototype.hasOwnProperty.call(updates, "quotaType")) push("quota_type", normalizeApiSubtokenQuotaType(updates.quotaType));
  if (Object.prototype.hasOwnProperty.call(updates, "quotaLimit")) push("quota_limit", roundCredits(updates.quotaLimit));
  if (Object.prototype.hasOwnProperty.call(updates, "usedAmount")) push("used_amount", roundCredits(updates.usedAmount));
  if (Object.prototype.hasOwnProperty.call(updates, "usedCount")) push("used_count", Math.max(0, Math.round(Number(updates.usedCount || 0) || 0)));
  if (Object.prototype.hasOwnProperty.call(updates, "expiresAt")) push("expires_at", updates.expiresAt ? toIsoString(updates.expiresAt) : null);
  if (Object.prototype.hasOwnProperty.call(updates, "revokedAt")) push("revoked_at", updates.revokedAt ? toIsoString(updates.revokedAt) : null);
  if (Object.prototype.hasOwnProperty.call(updates, "lastUsedAt")) push("last_used_at", updates.lastUsedAt ? toIsoString(updates.lastUsedAt) : null);
  if (!sets.length) return await getApiSubtokenFromDbById(cleanId, parentUserId);
  const where = parentUserId ? `WHERE id = $1 AND parent_user_id = $2` : `WHERE id = $1`;
  const { rows } = await query(`
    UPDATE app_api_subtokens
    SET ${sets.join(", ")},
        updated_at = NOW()
    ${where}
    RETURNING *
  `, params);
  return rows[0] ? normalizeApiSubtokenRecord(rows[0]) : null;
}

async function revokeApiSubtokenInDb(id, parentUserId, revokedAt = new Date().toISOString()) {
  return await updateApiSubtokenInDb(id, parentUserId, { revokedAt });
}

async function recordApiSubtokenUsageInDb({
  tokenId = "",
  parentUserId = "",
  eventKey = "",
  deltaAmount = 0,
  deltaCount = 0,
  meta = {},
} = {}) {
  const cleanTokenId = String(tokenId || "").trim();
  const cleanEventKey = String(eventKey || "").trim();
  if (!cleanTokenId || !cleanEventKey) return null;
  const amountDelta = roundCredits(deltaAmount);
  const countDelta = Math.trunc(Number(deltaCount || 0) || 0);
  if (!dbEnabled()) {
    const subtokens = await getKv("api_subtokens", []);
    const usage = await getKv("api_subtoken_usage", []);
    const list = Array.isArray(subtokens) ? subtokens : [];
    const tokenIndex = list.findIndex((record) => (
      String(record.id || "") === cleanTokenId &&
      (!parentUserId || String(record.parentUserId || record.parent_user_id || "") === String(parentUserId))
    ));
    if (tokenIndex < 0) return null;
    const current = normalizeApiSubtokenRecord(list[tokenIndex]);
    const existing = Array.isArray(usage) ? usage.find((entry) => (
      String(entry.tokenId || entry.token_id || "") === cleanTokenId &&
      String(entry.eventKey || entry.event_key || "") === cleanEventKey
    )) : null;
    if (existing) return { token: current, inserted: false };
    const nextAmount = Math.max(0, roundCredits(current.usedAmount + amountDelta));
    const nextCount = Math.max(0, Math.round(current.usedCount + countDelta));
    if (current.quotaType === "amount" && nextAmount - current.quotaLimit > 0.000001) {
      const error = new Error("Subtoken quota exceeded.");
      error.statusCode = 402;
      error.code = "SUBTOKEN_QUOTA_EXCEEDED";
      throw error;
    }
    if (current.quotaType === "count" && nextCount - current.quotaLimit > 0.000001) {
      const error = new Error("Subtoken quota exceeded.");
      error.statusCode = 402;
      error.code = "SUBTOKEN_QUOTA_EXCEEDED";
      throw error;
    }
    const now = new Date().toISOString();
    usage.unshift({
      id: `usage-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
      tokenId: current.id,
      eventKey: cleanEventKey,
      parentUserId: current.parentUserId,
      deltaAmount: amountDelta,
      deltaCount: countDelta,
      meta,
      createdAt: now,
      updatedAt: now,
    });
    list[tokenIndex] = normalizeApiSubtokenRecord({
      ...current,
      usedAmount: nextAmount,
      usedCount: nextCount,
      lastUsedAt: now,
      updatedAt: now,
    });
    await setKv("api_subtoken_usage", usage.slice(0, 5000));
    await setKv("api_subtokens", list);
    return { token: list[tokenIndex], inserted: true };
  }
  await ensureSchema();
  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows: tokenRows } = await client.query(
      `SELECT * FROM app_api_subtokens WHERE id = $1${parentUserId ? " AND parent_user_id = $2" : ""} FOR UPDATE`,
      parentUserId ? [cleanTokenId, String(parentUserId)] : [cleanTokenId],
    );
    const tokenRow = tokenRows[0];
    if (!tokenRow) {
      const error = new Error("Subtoken not found.");
      error.statusCode = 404;
      error.code = "SUBTOKEN_NOT_FOUND";
      throw error;
    }
    const token = normalizeApiSubtokenRecord(tokenRow);
    const { rows: existingRows } = await client.query(
      `SELECT 1 FROM app_api_subtoken_usage WHERE token_id = $1 AND event_key = $2`,
      [token.id, cleanEventKey],
    );
    if (existingRows.length) {
      await client.query("COMMIT");
      return { token, inserted: false };
    }
    const nextAmount = Math.max(0, roundCredits(Number(token.usedAmount || 0) + amountDelta));
    const nextCount = Math.max(0, Math.round(Number(token.usedCount || 0) + countDelta));
    if (token.quotaType === "amount" && nextAmount - Number(token.quotaLimit || 0) > 0.000001) {
      const error = new Error("Subtoken quota exceeded.");
      error.statusCode = 402;
      error.code = "SUBTOKEN_QUOTA_EXCEEDED";
      throw error;
    }
    if (token.quotaType === "count" && nextCount - Number(token.quotaLimit || 0) > 0.000001) {
      const error = new Error("Subtoken quota exceeded.");
      error.statusCode = 402;
      error.code = "SUBTOKEN_QUOTA_EXCEEDED";
      throw error;
    }
    await client.query(
      `
        INSERT INTO app_api_subtoken_usage (
          token_id, event_key, parent_user_id, delta_amount, delta_count, meta, created_at, updated_at
        )
        VALUES ($1, $2, $3, $4::numeric, $5::int, $6::jsonb, NOW(), NOW())
      `,
      [token.id, cleanEventKey, token.parentUserId || String(parentUserId || ""), amountDelta, countDelta, JSON.stringify(meta || {})],
    );
    const { rows: updatedRows } = await client.query(
      `
        UPDATE app_api_subtokens
        SET used_amount = $2::numeric,
            used_count = $3::int,
            last_used_at = NOW(),
            updated_at = NOW()
        WHERE id = $1
        RETURNING *
      `,
      [token.id, nextAmount, nextCount],
    );
    await client.query("COMMIT");
    return { token: normalizeApiSubtokenRecord(updatedRows[0] || tokenRow), inserted: true };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

function toIsoString(value) {
  if (!value) return "";
  if (value instanceof Date) return value.toISOString();
  const parsed = Date.parse(value);
  if (Number.isFinite(parsed)) return new Date(parsed).toISOString();
  return String(value).trim();
}

function roundCredits(value, digits = 6) {
  const scale = 10 ** Math.max(0, Math.min(8, Math.floor(Number(digits) || 6)));
  const next = Number(value);
  if (!Number.isFinite(next)) return 0;
  return Math.round(next * scale) / scale;
}

function normalizeApiSubtokenQuotaType(value = "") {
  return String(value || "").trim().toLowerCase() === "count" ? "count" : "amount";
}

function maskApiSubtokenToken(token = "") {
  const value = String(token || "");
  if (!value) return "";
  if (value.length <= 12) return `${value.slice(0, 3)}...${value.slice(-3)}`;
  return `${value.slice(0, 8)}...${value.slice(-6)}`;
}

function normalizeApiSubtokenRecord(record = {}) {
  const quotaType = normalizeApiSubtokenQuotaType(record.quotaType ?? record.quota_type);
  const quotaLimit = roundCredits(record.quotaLimit ?? record.quota_limit ?? 0);
  const usedAmount = roundCredits(record.usedAmount ?? record.used_amount ?? 0);
  const usedCount = Math.max(0, Math.round(Number(record.usedCount ?? record.used_count ?? 0) || 0));
  const expiresAt = toIsoString(record.expiresAt ?? record.expires_at ?? "");
  const revokedAt = toIsoString(record.revokedAt ?? record.revoked_at ?? "");
  const lastUsedAt = toIsoString(record.lastUsedAt ?? record.last_used_at ?? "");
  const createdAt = toIsoString(record.createdAt ?? record.created_at ?? "");
  const updatedAt = toIsoString(record.updatedAt ?? record.updated_at ?? "");
  const token = String(record.token ?? "").trim();
  const expired = expiresAt && Date.parse(expiresAt) <= Date.now();
  const status = revokedAt ? "revoked" : (expired ? "expired" : "active");
  const remaining = quotaType === "count"
    ? Math.max(0, roundCredits(quotaLimit - usedCount, 6))
    : Math.max(0, roundCredits(quotaLimit - usedAmount, 6));
  return {
    id: String(record.id ?? "").trim(),
    token,
    tokenPreview: maskApiSubtokenToken(token),
    parentUserId: String(record.parentUserId ?? record.parent_user_id ?? "").trim(),
    name: String(record.name ?? "").trim(),
    quotaType,
    quotaLimit,
    usedAmount,
    usedCount,
    quotaUsed: quotaType === "count" ? usedCount : usedAmount,
    remaining,
    expiresAt,
    revokedAt,
    lastUsedAt,
    createdAt,
    updatedAt,
    status,
    active: !revokedAt && !expired,
  };
}

function normalizeApiSubtokenUsageRecord(record = {}) {
  return {
    id: Number(record.id ?? 0),
    tokenId: String(record.tokenId ?? record.token_id ?? "").trim(),
    eventKey: String(record.eventKey ?? record.event_key ?? "").trim(),
    parentUserId: String(record.parentUserId ?? record.parent_user_id ?? "").trim(),
    deltaAmount: roundCredits(record.deltaAmount ?? record.delta_amount ?? 0),
    deltaCount: Math.trunc(Number(record.deltaCount ?? record.delta_count ?? 0) || 0),
    meta: record.meta && typeof record.meta === "object" ? record.meta : {},
    createdAt: toIsoString(record.createdAt ?? record.created_at ?? ""),
    updatedAt: toIsoString(record.updatedAt ?? record.updated_at ?? ""),
  };
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
  const counts = await tableCounts();
  const appDb = await getKv("app_db", defaultDb || {});
  if (Array.isArray(appDb.users) && appDb.users.length && (counts.users || 0) === 0) {
    await replaceAppDbTables(appDb, { replaceAll: true });
  } else if (shouldBackfillAppDbTables(appDb, counts)) {
    const currentDb = await readAppDbFromTables(defaultDb || {}) || {};
    await replaceAppDbTables(mergeAppDbRecords(appDb, currentDb), { replaceAll: true });
  }
}

function shouldBackfillAppDbTables(appDb = {}, counts = {}) {
  const checks = [
    ["users", "users"],
    ["sessions", "sessions"],
    ["walletOrders", "wallet_orders"],
    ["creditLedger", "credit_ledger"],
    ["userAssets", "user_assets"],
    ["userCharacters", "user_characters"],
    ["userUnlocks", "user_unlocks"],
    ["adminHomeItems", "admin_home_items"],
  ];
  return checks.some(([sourceKey, countKey]) => {
    const sourceCount = Array.isArray(appDb[sourceKey]) ? appDb[sourceKey].length : 0;
    return sourceCount > 0 && (counts[countKey] || 0) < sourceCount;
  });
}

function mergeRecordArrays(sourceRecords = [], currentRecords = [], idKey = "id") {
  const merged = new Map();
  for (const record of Array.isArray(sourceRecords) ? sourceRecords : []) {
    const id = String(record?.[idKey] || "").trim();
    if (id) merged.set(id, record);
  }
  for (const record of Array.isArray(currentRecords) ? currentRecords : []) {
    const id = String(record?.[idKey] || "").trim();
    if (id && !merged.has(id)) merged.set(id, record);
  }
  return Array.from(merged.values());
}

function mergeAppDbRecords(sourceDb = {}, currentDb = {}) {
  return {
    ...sourceDb,
    users: mergeRecordArrays(sourceDb.users, currentDb.users),
    sessions: mergeRecordArrays(sourceDb.sessions, currentDb.sessions, "token"),
    walletOrders: mergeRecordArrays(sourceDb.walletOrders, currentDb.walletOrders),
    creditLedger: mergeRecordArrays(sourceDb.creditLedger, currentDb.creditLedger),
    userAssets: mergeRecordArrays(sourceDb.userAssets, currentDb.userAssets),
    userCharacters: mergeRecordArrays(sourceDb.userCharacters, currentDb.userCharacters),
    userUnlocks: mergeRecordArrays(sourceDb.userUnlocks, currentDb.userUnlocks),
    adminHomeItems: mergeRecordArrays(sourceDb.adminHomeItems, currentDb.adminHomeItems),
    apiSubtokens: mergeRecordArrays(sourceDb.apiSubtokens, currentDb.apiSubtokens),
    supportMessages: mergeRecordArrays(sourceDb.supportMessages, currentDb.supportMessages),
  };
}

module.exports = {
  dbEnabled,
  ensureSchema,
  query,
  readAppDbFromTables,
  replaceAppDbTables,
  applyCreditDeltaInDb,
  deleteUserSessionsInDb,
  deleteUserWalletOrdersInDb,
  createWalletOrderInDb,
  createManualWalletOrderInDb,
  getUserByUsernameInDb,
  getUserByIdInDb,
  createSessionInDb,
  getSessionByTokenInDb,
  getWalletOrderByIdInDb,
  getWalletOrderByPaypalIdInDb,
  updateWalletOrderInDb,
  updateUserInDb,
  upsertUserAssetInDb,
  upsertUserCharacterInDb,
  upsertUserUnlockInDb,
  listAdminHomeItemsFromDb,
  upsertAdminHomeItemInDb,
  replaceAdminHomeItemsInDb,
  softDeleteAdminHomeItemInDb,
  listWorkflowPresetsFromDb,
  upsertWorkflowPresetInDb,
  replaceWorkflowPresetsInDb,
  findUserUnlockInDb,
  normalizeApiSubtokenRecord,
  listApiSubtokensFromDb,
  getApiSubtokenFromDbByToken,
  getApiSubtokenFromDbById,
  createApiSubtokenInDb,
  updateApiSubtokenInDb,
  revokeApiSubtokenInDb,
  recordApiSubtokenUsageInDb,
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
