"use strict";

/*
 * Background schedulers must have exactly one owner across application
 * processes. PostgreSQL session advisory locks are released automatically if
 * the owner disconnects or dies, so a standby process can take over without a
 * separate leader-election service.
 */

const DEFAULT_LOCK_NAMESPACE = "raising-game-scheduler:";

function normalizedSchedulerName(name = "") {
  const clean = String(name || "").trim();
  if (!clean) throw new Error("Scheduler lease name is required.");
  if (clean.length > 160) throw new Error("Scheduler lease name is too long.");
  return clean;
}

function leaseKeyFor(name = "", namespace = DEFAULT_LOCK_NAMESPACE) {
  return `${namespace}${normalizedSchedulerName(name)}`;
}

async function runWithSchedulerLease(name, fn, {
  connect,
  namespace = DEFAULT_LOCK_NAMESPACE,
  onSkipped = null,
  onError = null,
} = {}) {
  if (typeof fn !== "function") throw new TypeError("Scheduler lease callback must be a function.");
  if (typeof connect !== "function") throw new TypeError("Scheduler lease requires a PostgreSQL connect function.");
  const leaseName = normalizedSchedulerName(name);
  const lockKey = leaseKeyFor(leaseName, namespace);
  let client;
  let acquired = false;
  try {
    client = await connect();
    if (!client || typeof client.query !== "function") {
      throw new Error("Scheduler lease connection must provide query().");
    }
    const result = await client.query("SELECT pg_try_advisory_lock(hashtextextended($1, 0)) AS acquired", [lockKey]);
    acquired = result?.rows?.[0]?.acquired === true;
    if (!acquired) {
      onSkipped?.(leaseName, lockKey);
      return { acquired: false, skipped: true, value: undefined };
    }
    const value = await fn();
    return { acquired: true, skipped: false, value };
  } catch (error) {
    if (onError) {
      onError(error, leaseName, lockKey);
      return { acquired, skipped: false, value: undefined, error };
    }
    throw error;
  } finally {
    if (client) {
      let reusable = true;
      if (acquired) {
        try {
          await client.query("SELECT pg_advisory_unlock(hashtextextended($1, 0))", [lockKey]);
        } catch {
          /*
           * A failed unlock may leave the session lock held. Destroy this
           * connection instead of returning a poisoned session to the pool.
           */
          reusable = false;
        }
      }
      client.release?.(!reusable);
    }
  }
}

module.exports = {
  DEFAULT_LOCK_NAMESPACE,
  leaseKeyFor,
  normalizedSchedulerName,
  runWithSchedulerLease,
};
