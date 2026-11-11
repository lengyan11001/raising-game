# Single-node resilience plan

This plan separates concerns that are often conflated:

1. **Capacity** - CPU, RAM, disk, database limits, and per-process event-loop pressure.
2. **Process resilience** - an application process crashes, hangs, or must be replaced.
3. **State architecture** - authoritative facts, shared ephemeral state, cache, and coordination.
4. **Infrastructure resilience** - the host, disk, kernel, PostgreSQL instance, or network is lost.

The target architecture is defined independently of today's implementation:

- Application processes should be disposable and interchangeable for HTTP traffic.
- PostgreSQL remains the authoritative durable store for business and security facts.
- Redis is used only where shared, short-lived state or cache materially improves correctness or
  capacity: cross-process cache, short-window rate limits, idempotency, and optional event fan-out.
- Background work must have explicit ownership, bounded concurrency, retry limits, and takeover
  behavior. A scheduler must not depend on being the only process by accident.
- Every stage must have health signals, fault injection, rollback, and measured acceptance.

Existing code is a migration baseline, not the design ceiling. Prefer the simplest architecture
that meets these invariants; do not preserve a local-only implementation merely because it exists.

A bigger server or several processes on one server improves only capacity and process resilience.
It does not replace a verified off-host backup or a second failure domain.

## Current evidence (2026-11-11, Old)

- Runtime: one `raising-game-demo` Node process behind Nginx on `127.0.0.1:4174`.
- systemd: `Restart=always`, `RestartSec=2`, graceful SIGTERM drain implemented; watchdog is
  currently disabled (`WatchdogUSec=0`).
- Host: 4 vCPU, 7.1 GiB RAM, 49 GiB root disk, about 19 GiB free; load average was 0.69 and no
  OOM events were found.
- PostgreSQL: 16.15, database 726 MB, 13 of 100 connections in use during inspection.
- Daily cron backup: 04:30, PostgreSQL custom format, 14-day retention, mode 0600, same host and
  same filesystem as PostgreSQL.
- Restore evidence:
  - Existing daily backup restored successfully in 21 seconds; 67 tables, 6 sequences, 163
    indexes, 4 foreign keys, no invalid indexes or unvalidated constraints.
  - That daily backup was 21.5 hours old and omitted 642 generation records, 764 credit-ledger
    rows, 593 asset rows, and 20 users. The observed daily RPO is therefore about 24 hours.
  - A repeatable-read snapshot drill on 2026-11-11 restored a 74.9 MB dump in 35 seconds.
    The exported snapshot manifest and the restored database matched exactly across all 67 tables;
    the restore had 172 indexes, 4 foreign keys, no invalid indexes, and no unvalidated constraints.
  - A transitional off-host copy was transferred to the operator workstation and SHA-256 verified.
    This is useful evidence, not a durable disaster-recovery service.
- Current RPO remains about 24 hours because the only automatic schedule is daily. The verified
  fresh dump is an operator-triggered drill, not a replacement for scheduled off-host backups.

## Failure and control matrix

| Failure | Current control | Remaining gap | Next control |
| --- | --- | --- | --- |
| Node process exits | systemd restarts it | none material | Keep restart policy |
| Event loop hangs but process stays alive | none | systemd sees the process as alive | External watchdog timer |
| PostgreSQL unavailable | `/api/readyz` returns 503 | one database instance, no failover | Backup, recovery runbook, later standby/failover |
| Disk fills | alerts not confirmed | backups and DB share the filesystem | Disk/backup-age monitoring, off-host retention |
| Host or zone lost | daily dump on the same host | no independent failure domain | Dedicated encrypted off-host backup |
| Bad deploy | release audit and rollback path | shared-process restart | Keep isolated release and staged checks |
| One HTTP handler is slow | bounded timeouts | a single event loop can still affect all requests | Worker isolation only after scheduler ownership is fixed |
| Shared hot reads hit every process | per-process caches | duplicated work and inconsistent cache state | Redis cache-aside with bounded TTLs |
| Concurrent duplicate submissions | in-process maps and database guards | not equivalent across processes | Redis idempotency plus durable PostgreSQL result |
| Redis unavailable | not applicable yet | optional dependency must not remove protection | PostgreSQL fallback or fail closed |

## Stages and gates

### P1 - Backup and restore hardening (restore path verified; off-host schedule pending)

1. Run `ops/verify-postgres-backup.sh` against a real backup into an isolated database.
2. Require TOC readability, restore success, schema counts, invalid-index checks, orphan checks,
   and exact counts for a freshly generated snapshot.
3. Move at least one encrypted, checksummed dump to a dedicated off-host location daily.
4. Monitor backup age, dump size, checksum, and free disk space.
5. Keep an operator runbook that can rebuild an empty host from the release branch plus a dump.

Target proposal: RPO at most 15 minutes for business data and RTO at most 30 minutes for database
service. The current daily-only backup does not meet the RPO target. Do not claim either target
until the off-host schedule and a restore drill have both been verified.

### P2 - Process-hang detection

1. Test `ops/service-watchdog.sh` against healthy, failing, and recovering local endpoints.
2. Use `ops/install-service-watchdog.sh --mode dry-run` first. Dry-run installs the timer and records
   one `would restart` event at the threshold without restarting the application.
3. Require three consecutive `/api/livez` failures before an actual restart; reset the counter on
   success and after one dry-run alert so observation does not repeatedly page on the same outage.
4. Skip health decisions during a 45-second post-start warm-up, then use asynchronous
   `systemctl --no-block restart` so a slow graceful drain cannot stall the watchdog itself.
5. Enforce a 60-second minimum restart cooldown with exponential backoff up to 15 minutes, and a
   hard limit of three dispatches per rolling hour. Dispatch failure is recorded and also backs off.
6. Enable actual restarts only with `--mode active --confirm-active` after the dry-run observation
   window is healthy and the rollback path has been tested.
7. Roll back with `--mode rollback`. It disables/removes only the watchdog units and never restarts
   `raising-game-demo`.
8. Preserve Nginx-level readiness and graceful shutdown. Do not use `/api/health` as the restart
   signal because it intentionally remains a shallow liveness contract.

The 2026-11-11 Old dry-run drill used isolated unit names, URL, state file, and a fake service
manager. The timer stayed stable while healthy, produced exactly one dry-run alert after three
failures, reset after recovery, and skipped checks when the service was inactive. A second
isolated systemd drill exercised a real asynchronous restart of a disposable local service:
three failures dispatched exactly one restart, no duplicate loop followed, the 45-second warm-up
window suppressed false failure checks, and post-restart recovery cleared the pending marker.
Production remained `active` with `NRestarts=0` throughout.

### P3 - Capacity and shared-state review

Measure before changing the machine. Consider an upgrade only if one or more signals persists:

- CPU above 70% for 15 minutes, or load average above available vCPU count.
- Available memory below 20% or sustained swap use.
- PostgreSQL connections above 70% of `max_connections`.
- Root filesystem above 75% or backup directory growth outpaces retention.
- p95 API latency above 1 second during normal traffic.
- PostgreSQL cache hit ratio falls or I/O wait remains high.

A vertical upgrade is a maintenance event and must have rollback, capacity comparison, and
post-change load evidence. It is not a substitute for backups.

Redis is introduced here only if measured evidence shows shared cache, short-window rate limiting,
cross-process idempotency, or event fan-out is the better solution. It is not a prerequisite for
vertical capacity and is never a second source of truth. The detailed workload split, flags,
failure contracts, and R0-R5 rollout live in `ops/REDIS-PLAN.md`; the resilience stages below are
the governing sequence.

#### P3.5 - Redis shared-state and cache track (conditional, default off)

1. R0: record PostgreSQL QPS, p95 latency, per-process cache hit rates, rate-limit writes, and
   duplicate request evidence. Add flags that default off and preserve PostgreSQL-only behavior.
2. R1: verify locally with a disposable Redis: TTLs, namespace prefix, memory limit, timeout,
   reconnect, redaction, and process behavior when Redis is killed mid-request.
3. R2: enable cache-aside first for public config, templates, platform HTML, and compact
   generation polling. Require mutation invalidation and prove no stale balance, authorization,
   order, or completion state.
4. R3: shadow Redis rate limiting against PostgreSQL, compare decisions, then enable Redis primary
   with PostgreSQL fallback and durable audit events.
5. R4: enable cross-process idempotency only with a durable PostgreSQL result; prove one provider
   submission and one charge per client key after a process crash.
6. R5: add Pub/Sub or shared presence only for actual multi-process realtime needs. A same-host
   Redis does not improve host-loss resilience; managed/off-host Redis requires a second failure
   domain and measured RTO.
7. Rollback at every step is a flag change. Redis loss must cause cache misses or controlled
   fallback, never startup failure or silent loss of security controls.

Promotion gates for P3.5:

- measured reduction in PostgreSQL reads or p95 latency, not just a configured Redis connection;
- zero mismatches in the rate-limit shadow period;
- zero duplicate charges/provider submissions in concurrent fault tests;
- explicit cache invalidation and TTL evidence for every cached contract;
- Redis outage and eviction drills pass without data loss or unauthenticated fallback.

### P4 - Same-host multi-process (conditional)

Do not run multiple copies of `server.js` yet. The startup path starts many background schedulers,
so multiple processes can duplicate wallet scans, notifications, queue drains, and cleanup work.
PostgreSQL locks protect some business mutations but do not by themselves make every scheduler
single-owner.

Required before this stage:

1. Scheduler single-owner is implemented through per-tick PostgreSQL advisory leases. Do not treat
   this alone as permission to run multiple `server.js` processes.
2. Verify each job is idempotent under two simultaneous processes.
3. Complete the relevant P3.5 gates: shared cache behavior is consistent, Redis-backed rate-limit
   fallback is proven, and request idempotency prevents duplicate submissions and charges.
4. Add multiple Nginx upstream ports and health-based removal.
5. Test rolling process replacement without dropping in-flight submissions.
6. Run a fault-injection test that kills one process while traffic continues.
7. Keep the database as the durable result source if Redis fails between claim and commit.

Without those gates, same-host multi-process is more likely to duplicate work than improve
availability.

### P5 - Real infrastructure resilience

1. Put PostgreSQL in a managed service or a tested primary/standby topology.
2. Put a second application failure domain behind an external load balancer.
3. Put shared Redis, if still required, in a managed/off-host topology with its own failure and
   recovery test; never make Redis a single point of failure for authoritative data.
4. Rehearse DNS/origin failover, database promotion, and Redis recovery with measured RTO.
5. Keep the off-host backup independent of both production hosts.

## Change discipline

- No production schema or data mutation during backup drills; restore only into a new isolated
  database and drop it after evidence is recorded.
- No direct deployment from `old-site`; use the repository release and deployment entrypoints.
- Never put credentials, `DATABASE_URL`, or backup contents in Git or logs.
- Every stage records commands, timings, row-count evidence, rollback, and post-change health.
- Plans define the target invariants first; implementation choices must be justified by measured
  evidence and the safest failure mode, not merely by the current code layout.
