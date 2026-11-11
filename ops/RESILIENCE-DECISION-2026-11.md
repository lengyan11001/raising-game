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
- A fault-injection drill proved one winning request claim, one charge, one provider submission,
  crash-window recovery, refund idempotency, and reconciliation.

## What is not proven yet

- Nginx upstream health removal and automatic failover between two application ports.
- Rolling replacement of one process while the other serves real HTTP traffic.
- A real crash (SIGKILL), not only SIGTERM, followed by recovery without duplicate work.
- A full production-like deployment topology with two systemd instances and one shared release.
- Sustained capacity and latency benefit from a second process.

## Promotion gates for same-host multi-process

All must pass before production traffic is load-balanced across two Node processes:

- A measured baseline period exists; no promotion is approved from plan review alone.

- Two app instances run the same release and read the same PostgreSQL database.
- Only one instance owns each scheduler tick at a time; a killed owner is taken over.
- Every externally triggered mutation is protected by PostgreSQL idempotency or an equivalent
  durable result guard.
- A duplicate request across different ports produces one charge and one provider submission.
- Nginx marks a stopped/failed upstream unavailable within the configured retry window and keeps
  serving from the healthy peer.
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

### Stage B: Isolated Nginx failover and rolling replacement (no production topology change)

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

- Keep one systemd service initially; add a second instance only behind a tested upstream.
- Start the second instance with schedulers disabled only if promotion is staged; then move
  background ownership through PostgreSQL leases.
- Use health-based removal, not ad hoc restarts.
- Roll back to the single upstream if any error, charge, or lock anomaly appears.

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
