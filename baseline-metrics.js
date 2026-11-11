"use strict";

// Low-overhead, process-local baseline metrics for the resilience rollout.
// This is intentionally not a Redis client and not a durable business store.
// It is enabled by an environment flag and never changes request behavior.

const { performance } = require("node:perf_hooks");

const DEFAULT_MAX_ROUTES = 256;
const DEFAULT_RESERVOIR_SIZE = 2048;
const DEFAULT_WINDOW_MS = 5 * 60 * 1000;

function envFlag(value, fallback = false) {
  if (value === undefined || value === null || value === "") return fallback;
  return /^(1|true|yes|on)$/i.test(String(value).trim());
}

function positiveInteger(value, fallback, max = Number.MAX_SAFE_INTEGER) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(max, Math.floor(parsed));
}

function normalizeRouteName(value = "") {
  const route = String(value || "").trim();
  if (!route) return "unknown";
  return route.length > 160 ? `${route.slice(0, 157)}...` : route;
}

function statusClass(statusCode) {
  const status = Number(statusCode) || 0;
  if (status >= 500) return "5xx";
  if (status >= 400) return "4xx";
  if (status >= 300) return "3xx";
  if (status >= 200) return "2xx";
  return "other";
}

function createBaselineMetrics({
  enabled = false,
  maxRoutes = DEFAULT_MAX_ROUTES,
  reservoirSize = DEFAULT_RESERVOIR_SIZE,
  now = () => Date.now(),
  monoNow = () => performance.now(),
} = {}) {
  const routeLimit = positiveInteger(maxRoutes, DEFAULT_MAX_ROUTES, 4096);
  const sampleLimit = positiveInteger(reservoirSize, DEFAULT_RESERVOIR_SIZE, 20000);
  const startedAt = now();
  const routes = new Map();
  const statuses = Object.create(null);
  let requests = 0;
  let bytesIn = 0;
  let bytesOut = 0;
  let inFlight = 0;
  let peakInFlight = 0;
  let droppedRoutes = 0;
  const durationSamples = [];
  let durationCursor = 0;
  const cache = Object.create(null);
  const events = Object.create(null);

  function routeBucket(route = "") {
    const key = normalizeRouteName(route);
    let bucket = routes.get(key);
    if (bucket) return bucket;
    if (routes.size >= routeLimit) {
      droppedRoutes += 1;
      return null;
    }
    bucket = {
      requests: 0,
      inFlight: 0,
      peakInFlight: 0,
      statuses: Object.create(null),
      durationTotalMs: 0,
      durationMaxMs: 0,
      durationSamples: [],
      durationCursor: 0,
    };
    routes.set(key, bucket);
    return bucket;
  }

  function recordRequest({ route = "unknown", statusCode = 0, durationMs = 0, bytesInBytes = 0, bytesOutBytes = 0 } = {}) {
    if (!enabled) return;
    const bucket = routeBucket(route);
    const duration = Math.max(0, Number(durationMs) || 0);
    const input = Math.max(0, Number(bytesInBytes) || 0);
    const output = Math.max(0, Number(bytesOutBytes) || 0);
    requests += 1;
    bytesIn += input;
    bytesOut += output;
    const cls = statusClass(statusCode);
    statuses[cls] = (statuses[cls] || 0) + 1;
    if (!bucket) return;
    bucket.requests += 1;
    bucket.statuses[cls] = (bucket.statuses[cls] || 0) + 1;
    bucket.durationTotalMs += duration;
    bucket.durationMaxMs = Math.max(bucket.durationMaxMs, duration);
    if (bucket.durationSamples.length < sampleLimit) {
      bucket.durationSamples.push(duration);
    } else {
      bucket.durationSamples[bucket.durationCursor % sampleLimit] = duration;
      bucket.durationCursor += 1;
    }
    if (durationSamples.length < sampleLimit) {
      durationSamples.push(duration);
    } else {
      durationSamples[durationCursor % sampleLimit] = duration;
      durationCursor += 1;
    }
  }

  function beginRequest(route = "unknown") {
    if (!enabled) return () => {};
    inFlight += 1;
    peakInFlight = Math.max(peakInFlight, inFlight);
    const bucket = routeBucket(route);
    if (bucket) {
      bucket.inFlight += 1;
      bucket.peakInFlight = Math.max(bucket.peakInFlight, bucket.inFlight);
    }
    let ended = false;
    return () => {
      if (ended) return;
      ended = true;
      inFlight = Math.max(0, inFlight - 1);
      if (bucket) bucket.inFlight = Math.max(0, bucket.inFlight - 1);
    };
  }

  function recordCache(name = "", hit = false) {
    if (!enabled) return;
    const key = normalizeRouteName(name);
    if (!cache[key]) cache[key] = { hits: 0, misses: 0 };
    if (hit) cache[key].hits += 1;
    else cache[key].misses += 1;
  }

  function recordEvent(name = "", count = 1) {
    if (!enabled) return;
    const key = normalizeRouteName(name);
    events[key] = (events[key] || 0) + Math.max(0, Number(count) || 0);
  }

  function percentile(values, p) {
    if (!values.length) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
    return Math.round(sorted[index] * 1000) / 1000;
  }

  function p95Summary(bucket) {
    const samples = bucket?.durationSamples || [];
    return {
      p50Ms: percentile(samples, 50),
      p95Ms: percentile(samples, 95),
      p99Ms: percentile(samples, 99),
      maxMs: Math.round((bucket?.durationMaxMs || 0) * 1000) / 1000,
    };
  }

  function snapshot() {
    return {
      enabled: Boolean(enabled),
      startedAt: new Date(startedAt).toISOString(),
      uptimeSeconds: Math.max(0, Math.round((now() - startedAt) / 1000)),
      windowMs: DEFAULT_WINDOW_MS,
      requests,
      inFlight,
      peakInFlight,
      bytesIn,
      bytesOut,
      droppedRoutes,
      statuses: { ...statuses },
      latency: p95Summary({ durationSamples }),
      cache: Object.fromEntries(Object.entries(cache).map(([name, item]) => {
        const total = item.hits + item.misses;
        return [name, {
          hits: item.hits,
          misses: item.misses,
          hitRate: total ? Math.round((item.hits / total) * 10000) / 10000 : 0,
        }];
      })),
      events: { ...events },
      routes: Object.fromEntries([...routes.entries()].map(([name, bucket]) => [name, {
        requests: bucket.requests,
        inFlight: bucket.inFlight,
        peakInFlight: bucket.peakInFlight,
        statuses: { ...bucket.statuses },
        latency: p95Summary(bucket),
      }])),
    };
  }

  return {
    enabled: Boolean(enabled),
    recordRequest,
    beginRequest,
    recordCache,
    recordEvent,
    snapshot,
    monoNow,
  };
}

module.exports = {
  DEFAULT_MAX_ROUTES,
  DEFAULT_RESERVOIR_SIZE,
  DEFAULT_WINDOW_MS,
  createBaselineMetrics,
  envFlag,
  normalizeRouteName,
  statusClass,
};
