# Single-node resilience plan

This plan separates three different concerns that are often conflated:

1. **Capacity** - more CPU, RAM, disk, or database limits.
2. **Process resilience** - one application process crashes or hangs.
3. **Infrastructure resilience** - the host, disk, kernel, PostgreSQL instance, or network is lost.

A bigger server or several processes on one server improves only the first two. It does not
replace a verified off-host database backup or a second failure domain.

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
2. Install the systemd timer only after a dedicated staging/replay test.
3. Require three consecutive `/api/livez` failures before restarting; reset the counter on success.
4. Preserve Nginx-level readiness and graceful shutdown. Do not use `/api/health` as the restart
   signal because it intentionally remains a shallow liveness contract.

### P3 - Capacity review

Measure before changing the machine. Consider an upgrade only if one or more signals persists:

- CPU above 70% for 15 minutes, or load average above available vCPU count.
- Available memory below 20% or sustained swap use.
- PostgreSQL connections above 70% of `max_connections`.
- Root filesystem above 75% or backup directory growth outpaces retention.
- p95 API latency above 1 second during normal traffic.
- PostgreSQL cache hit ratio falls or I/O wait remains high.

A vertical upgrade is a maintenance event and must have rollback, capacity comparison, and
post-change load evidence. It is not a substitute for backups.

### P4 - Same-host multi-process (conditional)

Do not run multiple copies of `server.js` yet. The startup path starts many background schedulers,
so multiple processes can duplicate wallet scans, notifications, queue drains, and cleanup work.
PostgreSQL locks protect some business mutations but do not by themselves make every scheduler
single-owner.

Required before this stage:

1. Split HTTP serving from background workers, or add a tested PostgreSQL advisory-lock leader for
   every scheduler.
2. Verify each job is idempotent under two simultaneous processes.
3. Add multiple Nginx upstream ports and health-based removal.
4. Test rolling process replacement without dropping in-flight submissions.
5. Run a fault-injection test that kills one process while traffic continues.

Without those gates, same-host multi-process is more likely to duplicate work than improve
availability.

### P5 - Real infrastructure resilience

1. Put PostgreSQL in a managed service or a tested primary/standby topology.
2. Put a second application failure domain behind an external load balancer.
3. Rehearse DNS/origin failover and database promotion with measured RTO.
4. Keep the off-host backup independent of both production hosts.

## Change discipline

- No production schema or data mutation during backup drills; restore only into a new isolated
  database and drop it after evidence is recorded.
- No direct deployment from `old-site`; use the repository release and deployment entrypoints.
- Never put credentials, `DATABASE_URL`, or backup contents in Git or logs.
- Every stage records commands, timings, row-count evidence, rollback, and post-change health.
