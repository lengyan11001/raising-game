"use strict";

// Read-only PostgreSQL operational counters used by the resilience baseline.
// This module never mutates application data and never replaces PostgreSQL as
// the authoritative store. It is only called by an authenticated operator
// endpoint when the diagnostics flag is enabled.

function finiteNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function counterValue(row = {}, name = "") {
  return finiteNumber(row?.[name]);
}

function normalizeStatsRow(row = {}) {
  const txCommit = counterValue(row, "xact_commit");
  const txRollback = counterValue(row, "xact_rollback");
  const blksRead = counterValue(row, "blks_read");
  const blksHit = counterValue(row, "blks_hit");
  const tuplesReturned = counterValue(row, "tup_returned");
  const tuplesFetched = counterValue(row, "tup_fetched");
  const tuplesInserted = counterValue(row, "tup_inserted");
  const tuplesUpdated = counterValue(row, "tup_updated");
  const tuplesDeleted = counterValue(row, "tup_deleted");
  const conflicts = counterValue(row, "conflicts");
  const deadlocks = counterValue(row, "deadlocks");
  const tempFiles = counterValue(row, "temp_files");
  const tempBytes = counterValue(row, "temp_bytes");
  const sessions = counterValue(row, "sessions");
  const sessionsAbandoned = counterValue(row, "sessions_abandoned");
  const sessionsFatal = counterValue(row, "sessions_fatal");
  const sessionsKilled = counterValue(row, "sessions_killed");
  const totalBlocks = blksRead + blksHit;
  const totalTuples = tuplesReturned + tuplesFetched;
  return {
    database: String(row.datname || ""),
    statsReset: row.stats_reset ? new Date(row.stats_reset).toISOString() : "",
    transactions: {
      commit: txCommit,
      rollback: txRollback,
      total: txCommit + txRollback,
    },
    blocks: {
      read: blksRead,
      hit: blksHit,
      hitRatio: totalBlocks ? Math.round((blksHit / totalBlocks) * 10000) / 10000 : 0,
    },
    tuples: {
      returned: tuplesReturned,
      fetched: tuplesFetched,
      inserted: tuplesInserted,
      updated: tuplesUpdated,
      deleted: tuplesDeleted,
      fetchedRatio: totalTuples ? Math.round((tuplesFetched / totalTuples) * 10000) / 10000 : 0,
    },
    conflicts,
    deadlocks,
    temp: {
      files: tempFiles,
      bytes: tempBytes,
    },
    sessions: {
      total: sessions,
      abandoned: sessionsAbandoned,
      fatal: sessionsFatal,
      killed: sessionsKilled,
    },
  };
}

function normalizePoolStats(stats = {}) {
  return {
    total: finiteNumber(stats.totalCount),
    idle: finiteNumber(stats.idleCount),
    waiting: finiteNumber(stats.waitingCount),
    max: finiteNumber(stats.max),
  };
}

function deltaCounters(previous, current) {
  if (!previous) return null;
  const elapsedMs = Math.max(0, finiteNumber(current?.capturedAtMs) - finiteNumber(previous?.capturedAtMs));
  const elapsedSeconds = Math.max(0.001, elapsedMs / 1000);
  const previousTransactions = finiteNumber(previous?.transactions?.total);
  const currentTransactions = finiteNumber(current?.transactions?.total);
  const previousBlocks = finiteNumber(previous?.blocks?.read) + finiteNumber(previous?.blocks?.hit);
  const currentBlocks = finiteNumber(current?.blocks?.read) + finiteNumber(current?.blocks?.hit);
  const previousTuples = finiteNumber(previous?.tuples?.returned) + finiteNumber(previous?.tuples?.fetched);
  const currentTuples = finiteNumber(current?.tuples?.returned) + finiteNumber(current?.tuples?.fetched);
  return {
    elapsedSeconds: Math.round(elapsedSeconds * 1000) / 1000,
    transactionsPerSecond: Math.round((Math.max(0, currentTransactions - previousTransactions) / elapsedSeconds) * 1000) / 1000,
    blocksPerSecond: Math.round((Math.max(0, currentBlocks - previousBlocks) / elapsedSeconds) * 1000) / 1000,
    tuplesPerSecond: Math.round((Math.max(0, currentTuples - previousTuples) / elapsedSeconds) * 1000) / 1000,
    rollbackDelta: Math.max(0, finiteNumber(current?.transactions?.rollback) - finiteNumber(previous?.transactions?.rollback)),
    deadlockDelta: Math.max(0, finiteNumber(current?.deadlocks) - finiteNumber(previous?.deadlocks)),
  };
}

function createOperationalStatsReader({ query, getPool, dbEnabled = () => true, now = () => Date.now() } = {}) {
  let previous = null;
  async function read() {
    if (typeof query !== "function") throw new Error("Operational stats query function is required.");
    const startedAt = now();
    const { rows } = await query(
      `SELECT datname, stats_reset, xact_commit, xact_rollback, blks_read, blks_hit,
              tup_returned, tup_fetched, tup_inserted, tup_updated, tup_deleted,
              conflicts, deadlocks, temp_files, temp_bytes, sessions,
              sessions_abandoned, sessions_fatal, sessions_killed
         FROM pg_stat_database
        WHERE datname = current_database()`,
    );
    const current = {
      ...normalizeStatsRow(rows[0] || {}),
      capturedAt: new Date(startedAt).toISOString(),
      capturedAtMs: startedAt,
      queryDurationMs: Math.round((now() - startedAt) * 1000) / 1000,
      pool: normalizePoolStats(typeof getPool === "function" ? getPool() : {}),
      delta: null,
      databaseEnabled: Boolean(dbEnabled()),
    };
    current.delta = deltaCounters(previous, current);
    previous = current;
    return current;
  }
  return { read };
}

module.exports = {
  createOperationalStatsReader,
  deltaCounters,
  normalizePoolStats,
  normalizeStatsRow,
};
