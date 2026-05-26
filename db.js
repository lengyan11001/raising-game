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
}

module.exports = {
  dbEnabled,
  ensureSchema,
  query,
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
