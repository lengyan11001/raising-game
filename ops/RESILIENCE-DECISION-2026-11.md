# Old single-node resilience decision and staged roadmap

Date: 2026-11-11
Scope: Old (`123vips.com`) only. Live is out of scope for every stage below.

## Decision

Do not treat "more Node processes on the same host" as the resilience goal. The target is:

1. HTTP processes are disposable and interchangeable.
2. Background jobs have one explicit PostgreSQL-leased owner per tick.
3. Durable business and security facts remain in PostgreSQL.
4. Nginx removes an unhealthy upstream before replacement.
5. Recovery from host/database loss is provided by off-host backups and a second failure domain,
   not by Redis or by extra processes on the same machine.

Recommended order:

1. Observe production long enough to establish a measured baseline.
2. Complete an isolated Nginx upstream-failover and rolling-replacement drill.
3. Decide whether vertical capacity is justified by CPU, memory, disk, database, event-loop, and
   p95 latency evidence after slow-path work.
4. Enable a second HTTP process only after all promotion gates below pass.
5. Add Redis cache only if measured PostgreSQL read/CPU pressure justifies it.
6. Add off-host backup recovery and a second failure domain.

## What already works

- PostgreSQL advisory leases own background scheduler ticks.
- The generation submit queue has durable PostgreSQL claims, leases, retry fencing, and
  reconciliation.
- Request idempotency is durable in PostgreSQL.
- Graceful SIGTERM drains in-flight generation submissions with a bounded timeout.
- A disposable-database Old-host drill proved two HTTP processes can start, coexist, hand over a
  scheduler lease, survive stopping one peer, and exit cleanly.
- A production-shaped transient-systemd drill proved two independent services can share one
  release and one PostgreSQL database, survive SIGKILL with automatic restart, stop and restart
  independently, and leave no unit or database residue. It deliberately disabled schedulers and
  the generation-submit worker; the peer-isolation and lease drills cover those controls.
- A fault-injection drill proved one winning request claim, one charge, one provider submission,
  crash-window recovery, refund idempotency, and reconciliation.
- An isolated Old-host Nginx drill proved health removal and automatic failover between two
  application ports, rolling replacement while the other process serves HTTP, and SIGKILL
  failover with 80/80 successful edge probes.
- The same isolated drill proved a transaction-shaped cutover: three independently named traffic
  upstreams move to the replacement in one atomic file replacement and one Nginx reload. A bad
  health route restores all three together.
- A single-upstream switch tool refuses ambiguous configuration and rolls back the exact original
  file when Nginx validation, reload, or an explicit HTTP 200 check fails.

## What is not proven yet

- Production cutover using every real traffic upstream together, with rollback of the full
  original Nginx configuration.
- A sustained capacity measurement proving that the second process improves p95 latency or
  headroom enough to justify permanent production enablement.
- Sustained capacity and latency benefit from a second process.
- End-to-end crash recovery for every externally triggered mutation under live traffic; isolated
  race and refund tests pass, but production promotion still requires measured evidence.

## Promotion gates for same-host multi-process

All must pass before production traffic is load-balanced across two Node processes:

- A measured baseline period exists; no promotion is approved from plan review alone.

- Two app instances run the same release and read the same PostgreSQL database.
- Only one instance owns each scheduler tick at a time; a killed owner is taken over.
- Every externally triggered mutation is protected by PostgreSQL idempotency or an equivalent
  durable result guard.
- A duplicate request across different ports produces one charge and one provider submission.
- Nginx marks a stopped/failed upstream unavailable within the configured retry window and keeps
  serving from the healthy peer. Isolated drill evidence exists; production wiring is still a gate.
- A rolling replacement drains one process with zero failed health checks at the external URL.
- SIGKILL of one process does not duplicate a generation charge, provider submit, webhook, or
  settlement.
- Database connection count, pool waits, CPU, memory, event-loop lag, and p95 latency are measured
  before and after the second process.
- Rollback to the single-process service is tested and does not require a data migration.

## Capacity decision

Do not upgrade the server merely because it is "single node". Upgrade only when measured signals
persist:

- CPU above 70% for 15 minutes, or load average above vCPU count.
- Available memory below 20% or sustained swap.
- PostgreSQL connections above 70% of `max_connections`.
- Root filesystem above 75%, or backup growth threatens retention.
- p95 API latency above 1 second under normal traffic.
- PostgreSQL cache hit ratio declines or sustained I/O wait appears.

A vertical upgrade improves capacity. It does not replace Nginx failover, off-host backups, or a
second failure domain.

## Redis boundary

Redis is optional and default-off. It must never become authoritative for:

- users, sessions, balances, ledger entries, wallet orders, refunds;
- generation records, provider reconciliation, idempotency results;
- templates, pricing, support data, or analytics history;
- one-time security tickets unless a PostgreSQL durable record fences the decision.

Potential Redis workloads, in order:

1. Public config, public template, platform HTML, and public pricing cache.
2. Short-window rate-limit buckets after shadow comparison with PostgreSQL.
3. Cross-process fast idempotency lease after the PostgreSQL result guard exists.
4. Cache invalidation and optional realtime fan-out after multi-process is real.

Redis is not a prerequisite for the first two Node processes. PostgreSQL leases, durable claims,
and idempotency already protect the critical paths. A same-host Redis does not provide host-loss
resilience.

## Staged execution

### Stage A: Measured baseline (read-only)

- Collect CPU, memory, disk, PostgreSQL connections/pool wait, event-loop delay, and HTTP p95
  over a representative window before any topology change.
- Record generation success/failure counts, refund uniqueness, and restart counts in the same
  window.
- Treat a passing health probe as availability evidence only, not capacity evidence.

### Stage B: Isolated Nginx failover and rolling replacement (verified)

Isolated evidence on 2026-11-11:

- `raising_game_nginx_drill_20261111102348` restored from a verified backup and ran on isolated
  app ports 4181/4182 with edge port 48080.
- Two HTTP instances were ready with schedulers and the durable submit worker disabled.
- A drained peer was replaced while the edge kept serving.
- `SIGKILL` of one peer during an 80-request edge probe produced zero failures.
- Three transaction-shaped upstreams switched together in one file write/reload; one bad route
  restored all three together.
- Cleanup is verified by a second PostgreSQL metadata query, not by assuming `dropdb` succeeded.

The production shape has now been validated with transient units, but production remains
single-process on port 4174. The next promotion stage is a measured, reversible production
cutover: start a second service on a spare port, verify all readiness endpoints, transaction-switch
every real traffic upstream together, observe, then stop the old listener only after the new one
has served real traffic. Do not expose a partial traffic mix or depend on Nginx `max_fails` to hide
a release gap.

## Stage B design (historical)

- Run two disposable DB-backed app instances.
- Put them behind a disposable Nginx upstream.
- Stop one instance during a steady request loop; require the peer to serve all subsequent requests.
- Replace the stopped instance and repeat in the other direction.
- Record upstream errors, retry count, HTTP failures, process exit status, and database lock waits.

### Stage C: Crash-fault drill

- SIGKILL one process while it has a claimed scheduler tick and an in-flight generation submission.
- Require lease takeover, one durable result, one charge, one provider submission, and no stuck
  claim.
- Restore the killed process and verify it does not replay completed work.

### Stage D: Production-shaped rollout

- The isolated systemd topology has passed: two transient units, one shared release/database,
  distinct cgroups and ports, SIGKILL auto-restart, independent stop/restart, and verified cleanup.
- Next, create a permanent but disabled second unit template only after the release artifact and
  environment ownership are reviewed. Keep the primary unit unchanged until the cutover window.
- Start the second instance on a spare port with schedulers disabled; use PostgreSQL leases to
  move background ownership only after HTTP cutover is stable.
- Transaction-switch every real traffic upstream together. Require all public and internal
  health URLs to return HTTP 200 before accepting the new configuration.
- Observe error rate, p95 latency, database connections/pool waits, restart count, generation
  success/refund uniqueness, and provider-submit anomalies.
- Roll the entire Nginx file back if any check fails, then stop the new instance. Never cut a
  single upstream to a partially prepared topology.

### Stage E: Capacity review

- Compare the same traffic window before and after.
- Upgrade only when the measured signals above persist.
- Do not justify an upgrade solely by "multi-process is running".

### Stage F: Redis

- Start with cache-aside if the evidence supports it.
- Add rate limits and idempotency fast paths only after shadow and fault-injection gates.
- Keep PostgreSQL fallback and durable records for every security-sensitive decision.

### Stage G: Infrastructure recovery

- Off-host PostgreSQL backup with a measured RTO/RPO.
- Second application failure domain.
- Managed or off-host Redis only if still justified.
- DNS/origin failover and database promotion rehearsal.

## Rollback rules

- Redis disabled must restore the existing PostgreSQL-only behavior immediately.
- Remove a second upstream without touching the shared database.
- Never roll back by restoring local JSON state; PostgreSQL is authoritative.
- Do not deploy Live as part of an Old-only experiment.
