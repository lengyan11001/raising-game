# Redis adoption plan (part of the resilience roadmap)

This is the detailed execution track for P3.5 in `ops/RESILIENCE-PLAN.md`. The resilience plan is
the governing sequence; this document defines Redis-specific workloads, failure contracts, and
verification gates. Redis is a means to measured capacity and cross-process correctness, not an
architectural requirement.

## Decision

Do not introduce Redis as a second source of truth. PostgreSQL remains authoritative for
users, sessions, balances, ledger entries, wallet orders, generation records, characters,
templates, pricing, support data, and analytics. Redis is an optional, short-lived coordination
and cache layer.

The current repository has no Redis dependency and no `REDIS_URL` configuration. This plan is
therefore additive and must preserve the existing PostgreSQL-only behavior when Redis is absent.

## Decision rule

Do not choose Redis merely to match a common architecture. Choose the simplest control that
satisfies the measured failure mode:

| Measured problem | First choice | Redis becomes justified when |
| --- | --- | --- |
| CPU/RAM/disk pressure | vertical capacity upgrade or query/index tuning | cache/coordination would remove repeated work more cheaply than a larger host |
| Slow hot reads | fix query/index or use local in-process cache | multiple processes need a consistent shared cache or local cache misses materially amplify DB load |
| Rate-limit DB row contention | keep PostgreSQL for security facts | short-window buckets have high write volume and shadow comparison proves equivalent decisions |
| Duplicate submissions across processes | PostgreSQL idempotency/result guard | multiple interchangeable HTTP processes need fast cross-process request coordination |
| Realtime events across processes | keep process-local until required | realtime traffic actually spans multiple processes/hosts and fan-out is measured |
| Host/power/disk loss | off-host backup and second failure domain | never solved by same-host Redis |

Default decision: no Redis. A vertical upgrade and PostgreSQL tuning are preferred while one
process is not saturated. Same-host multi-process remains conditional on scheduler ownership,
idempotency, and fault-injection gates; do not infer permission from CPU headroom alone.

## What should use Redis

### 1. Cross-process read cache (first useful stage)

Move hot read-only snapshots from per-process memory to a shared bounded cache:

- public config response (currently a local 30-second cache);
- Playflux templates (currently a local 5-minute cache);
- platform HTML snapshots (currently a local 20-second cache);
- compact generation-list polling snapshots, with a very short TTL and mutation invalidation;
- optional admin dashboard aggregates where a few seconds of staleness is acceptable.

Redis is appropriate here because losing it only causes a cache miss. Keys must always have a
TTL, memory must be bounded, and cache values must contain no secrets or raw database rows.

### 2. Short-window rate limits

The existing `app_rate_limits` table is correct and durable, but every protected request performs
a PostgreSQL transaction and row lock. Redis `INCR` plus expiry is a better fit for high-frequency
short-window buckets once traffic or process count grows.

Security audit events remain in PostgreSQL. Login-failure counters and account lockouts that
must survive Redis loss remain in PostgreSQL. A Redis outage must either fall back to PostgreSQL
or fail closed for security-sensitive paths; it must never silently remove protection.

### 3. Request idempotency across application processes

When more than one `server.js` process serves the same user traffic, an in-process `Map` is no
longer sufficient. Redis `SET ... NX EX` can deduplicate repeated generation submissions or
media mutations when the client supplies an idempotency key.

This is a coordination layer only. The database must still enforce balance/ledger correctness.
If the Redis result is uncertain, the safe behavior is to reject or fall back to the existing
PostgreSQL mutation guards, not to create an unverified duplicate operation.

### 4. Cache invalidation and optional realtime fan-out

Redis Pub/Sub can invalidate shared cache entries or fan out events between processes if the
application later grows realtime connections on multiple processes. This is optional. Short TTLs
and explicit database reads are sufficient for the first cache stage.

## What should remain in PostgreSQL

- Sessions and login state. Redis may cache a session lookup later, but the session record must
  remain in PostgreSQL and logout/revocation must invalidate the cache.
- Balances, credit ledger, wallet orders, payment settlement, and refunds.
- Generation records, media ownership metadata, task queues, and task leases.
- Scheduler ownership. Existing PostgreSQL advisory leases release automatically when a process
  dies and are safer than adding a second distributed lock implementation.
- Telegram/payment notification claims and at-most-once delivery state.
- Login failures, security audit events, support tickets, notifications, pricing, and catalogs.

## What should not use Redis

- Do not store large images, videos, or generated media in Redis. Use R2/object storage and CDN.
- Do not make Redis the only home for sessions, balances, orders, or generation state.
- Do not add a Redis lock merely because multiple processes exist; PostgreSQL advisory locks and
  transaction fences already protect the critical mutations.
- Do not put Redis on the public network. A same-host Redis does not increase host-level
  resilience; an off-host managed Redis is a later infrastructure stage.

## Staged rollout

### R0 - Baseline and feature flags (no behavior change)

- Record PostgreSQL QPS, p95 API latency, generation polling rate, rate-limit writes, and cache
  hit characteristics.
- Add an optional Redis client module only if implementation begins.
- Feature flags default off: `REDIS_ENABLED`, `REDIS_CACHE_ENABLED`,
  `REDIS_RATE_LIMIT_ENABLED`, and `REDIS_IDEMPOTENCY_ENABLED`.
- Keep the existing PostgreSQL path intact. Redis connection failure must not prevent startup.

### R1 - Local isolated verification

- Run a disposable local Redis for tests only.
- Verify key namespace/prefix, TTL, bounded memory, reconnect behavior, timeout, and redacted logs.
- Kill Redis during reads and writes: cache paths must fall back; security-sensitive paths must
  fall back to PostgreSQL or fail closed according to the endpoint contract.
- Do not deploy to production in this stage.

### R2 - Cache-aside only

- Enable public config, templates, platform HTML, and compact generation polling caches.
- Use short TTLs plus explicit invalidation after mutations.
- Acceptance: cache hit rate, PostgreSQL read reduction, p95 latency, and no stale balance,
  authorization, order, or generation-completion state.
- Contract: every key has a namespace, a hard TTL, bounded value size, and an explicit
  invalidation trigger. Never cache per-user authorization decisions without a tested revoke
  invalidation path; never serve a stale balance or order state.
- Failure behavior: Redis timeout/crash is a cache miss, not a request failure. If the fallback
  database read fails too, return the normal bounded service error.
- Rollback: disable the cache flag and let TTL keys expire; no schema migration required.

### R3 - Rate-limit shadow then primary

- First run Redis and PostgreSQL rate-limit calculations in shadow mode and compare decisions.
- Enable Redis primary only after mismatch analysis, with PostgreSQL fallback and durable audit
  events still written.
- Test Redis restart, timeout, and eviction behavior under concurrent login attempts.

### R4 - Idempotency for multi-process

- Require this before accepting concurrent duplicate generation/media mutations across processes.
- Use a client request key, Redis NX lease, and a PostgreSQL durable result record.
- Verify: one accepted submission per key, no double charge, no duplicate provider job, and a
  safe outcome after a process crash between Redis and PostgreSQL writes.

### R5 - Realtime and infrastructure resilience (conditional)

- Add Pub/Sub or a shared presence store only if realtime connections are served by multiple
  processes or hosts.
- Move from same-host Redis to a managed/off-host Redis only when the application itself has a
  second failure domain. Until then, Redis improves coordination and load, not host-loss recovery.

## Deployment constraints

- Never expose Redis on the public network; bind to loopback or a private network.
- Keep credentials in the production environment file, never in Git or logs.
- Set an explicit memory limit and eviction policy; use separate instances if cache eviction and
  security/idempotency keys require different policies.
- Redis is optional for the first stages. A Redis outage must leave the site serving traffic.
- No Redis rollout should restart or alter Live as part of Old-only work.

## Recommended first increment

Start with R2 cache-aside for public config, templates, platform HTML, and compact generation
polling. It gives measurable PostgreSQL/CPU relief without touching financial or authorization
state. Rate limiting and idempotency follow only after the cache stage proves stable.
