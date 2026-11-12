# Old production dual-instance cutover runbook

Scope: Old (`123vips.com`) only. Live is out of scope. This runbook does not
authorize an immediate deployment; it defines the controlled sequence after
the measured baseline and change window are approved.

## Safety invariants

- PostgreSQL through `DATABASE_URL` remains the only source of truth.
- The second instance uses the same release and the same database as the primary.
- The second instance starts with `BACKGROUND_SCHEDULERS_ENABLED=0`,
  `GENERATION_SUBMIT_QUEUE_ENABLED=0`, and
  `GENERATION_SUBMIT_WORKER_ENABLED=0`. PostgreSQL advisory leases may only be
  promoted after HTTP cutover is stable.
- Every real traffic upstream moves in one journaled cross-file Nginx transaction. Never
  leave `raising_game_app`, `raising_game_app_chat`, or `raising_game_app_live`
  on different releases.
- Nginx validation, reload, every explicit health URL, and public critical
  entry checks must pass, or restore the complete original Nginx file and stop
  the new instance.
- No user, session, balance, order, refund, generation, webhook, or security
  fact is written to Redis or a local file as part of this change.

## Before the window

1. Record the current service, release, Nginx file hash, and baseline:
   ```bash
   systemctl show raising-game-demo -p ActiveState -p SubState -p MainPID -p NRestarts
   git -C /opt/raising-game-demo rev-parse HEAD
   sha256sum /etc/nginx/sites-enabled/default
   ```
2. Confirm `/etc/raising-game-demo-b.env` matches the template:
   ```text
   PORT=4175
   DB_SCHEMA_MIGRATION_MODE=verify
   BACKGROUND_SCHEDULERS_ENABLED=0
   GENERATION_SUBMIT_QUEUE_ENABLED=0
   GENERATION_SUBMIT_WORKER_ENABLED=0
   ```
   It must not contain credentials, a different `DATABASE_URL`, or any
   provider/test override.
3. Confirm port 4175 is free and the current production health is green:
   ```bash
   ss -ltnp 'sport = :4175'
   curl -fsS http://127.0.0.1:4174/api/health
   curl -fsS http://127.0.0.1:4174/api/livez
   curl -fsS http://127.0.0.1:4174/api/readyz
   ```
4. Keep the previous release tree and the exact original Nginx file available.
   Do not edit the primary service or 4174 during the preparatory step.

## Start the candidate

1. Install the unit and environment from the committed release only:
   ```bash
   install -m 0644 /opt/raising-game-demo/ops/systemd/raising-game-demo-b.service \
     /etc/systemd/system/raising-game-demo-b.service
   install -m 0600 /opt/raising-game-demo/ops/systemd/raising-game-demo-b.env.example \
     /etc/raising-game-demo-b.env
   install -m 0600 /dev/null /etc/raising-game-demo-b.disabled
   systemctl daemon-reload
   ```
   The disabled marker is mandatory until the change window starts. Verify the
   unit is inactive and still refuses to start:
   ```bash
   systemctl show raising-game-demo-b.service \
     -p LoadState -p UnitFileState -p ActiveState -p SubState
   systemctl start raising-game-demo-b.service || true
   systemctl show raising-game-demo-b.service \
     -p ActiveState -p SubState -p MainPID
   ! ss -ltn 'sport = :4175' | grep -q LISTEN
   ```
   The deliberately blocked start may return success because the systemd
   condition prevented activation; the required evidence is that the unit is
   still inactive/dead, `MainPID=0`, and port 4175 has no listener. Only after
   every pre-window check passes and the window is explicitly approved:
   ```bash
   rm /etc/raising-game-demo-b.disabled
   systemctl start raising-game-demo-b.service
   ```
   Edit `/etc/raising-game-demo-b.env` only for the five explicit overrides
   above before starting. Never copy secrets into the repository or release.
2. Require all three local checks on 4175:
   ```bash
   for path in /api/health /api/livez /api/readyz; do
     curl -fsS -o /dev/null -w "$path %{http_code}\n" "http://127.0.0.1:4175$path"
   done
   ```
3. Confirm the candidate has schedulers and the worker disabled, is a separate
   cgroup, and has not touched 4174:
   ```bash
   systemctl show raising-game-demo-b.service -p MainPID -p ControlGroup -p ActiveState -p SubState
   ss -ltnp 'sport = :4175'
   ss -ltnp 'sport = :4174'
   ```
4. Run the read-only verifier before traffic moves:
   ```bash
   python3 /opt/raising-game-demo/ops/verify-production-cutover.py \
     --candidate-port 4175 --phase candidate
   ```

## Cutover

1. Capture a read-only pre-cutover observation sample:
   ```bash
   python3 /opt/raising-game-demo/ops/verify-production-cutover.py --phase pre
   ```
2. Switch every real traffic upstream together. The current production port is
   4174 and the candidate is 4175. Health URLs must include each public edge,
   not only the loopback port:
   ```bash
   python3 /opt/raising-game-demo/ops/nginx-upstream-switch.py \
     --file-switch '/etc/nginx/sites-enabled/default=raising_game_app=4174:4175' \
     --file-switch '/etc/nginx/sites-enabled/chat.5vips.com=raising_game_app_chat=4174:4175' \
     --file-switch '/etc/nginx/sites-enabled/live.123vipeak.com=raising_game_app_live=4174:4175' \
     --health-url https://123vips.com/api/health \
     --health-url https://chat.5vips.com/api/health \
     --health-url https://live.123vipeak.com/api/health \
     --reload-command 'systemctl reload nginx' --apply
   ```
   The script writes the full file once, runs one `nginx -t`, one reload, and
   checks every URL. Any failure restores the complete old file and reloads it.
3. Require the tool's `UPSTREAM_SWITCH_COMMIT_OK` output. If it is absent,
   do not stop either process and do not continue.
4. Run the public/path/DB acceptance sample:
   ```bash
   python3 /opt/raising-game-demo/ops/verify-production-cutover.py --phase post
   ```
5. Keep the old 4174 process alive while observing. It is the immediate
   rollback target and must not be restarted or stopped yet.

## Observation window

Observe at least 30 minutes under representative traffic. Compare with the
pre-change baseline for:

- HTTP 5xx rate and request p95 latency on public critical entries.
- Node memory/CPU, event-loop responsiveness, and systemd restart count.
- PostgreSQL active connections, pool waiting, rollback/deadlock deltas, and
  cache hit ratio.
- Generation submit success/failure counts, one-charge/one-provider-submit
  invariants, refund uniqueness, and stale claims.
- Telegram/webhook duplicate-processing indicators. Do not change the
  Telegram `Unauthorized` path in this window.

Abort and roll back immediately on any sustained 5xx increase, a readiness
failure, duplicated charge/submit evidence, a scheduler ownership violation,
or DB pool exhaustion.

## Rollback

1. Switch all three upstreams back atomically:
   ```bash
   python3 /opt/raising-game-demo/ops/nginx-upstream-switch.py \
     --file-switch '/etc/nginx/sites-enabled/default=raising_game_app=4175:4174' \
     --file-switch '/etc/nginx/sites-enabled/chat.5vips.com=raising_game_app_chat=4175:4174' \
     --file-switch '/etc/nginx/sites-enabled/live.123vipeak.com=raising_game_app_live=4175:4174' \
     --health-url https://123vips.com/api/health \
     --health-url https://chat.5vips.com/api/health \
     --health-url https://live.123vipeak.com/api/health \
     --reload-command 'systemctl reload nginx' --apply
   ```
2. Verify public and loopback health, then stop only the secondary:
   ```bash
   systemctl stop raising-game-demo-b.service
   systemctl disable raising-game-demo-b.service
   ```
3. Confirm 4174 is healthy, 4175 is closed, and the primary service did not
   restart. Do not roll back the database; there is no schema change in this
   cutover.

## Promotion of background work

Only after the HTTP observation window passes:

1. Keep one process owning schedulers first. Do not enable them on both at once
   merely to increase parallelism.
2. If PostgreSQL lease contention is measured, choose one explicit owner and
   leave the other with `BACKGROUND_SCHEDULERS_ENABLED=0`.
3. Enable the generation submit worker only after a duplicate-submit/crash test
   confirms one durable claim, one charge, and one provider submission.
4. Redis remains disabled unless measured Postgres read/CPU/p95 pressure
   justifies the separate cache plan. Redis cannot own durable facts.

## Optional automatic process takeover

The current Nginx topology is single-active with a manual atomic rollback. Do
not add a backup member directly on production before the isolated drill and a
separate change window both pass.

1. Install the reviewed release and run the full
   `ops/nginx-multi-upstream-drill.sh` with a disposable populated database.
   Require `EDGE_BACKUP_FAILOVER_PROBE_OK`, `AUTOMATIC_BACKUP_FAILOVER_OK`,
   `AUTOMATIC_BACKUP_STOP_TAKEOVER_OK`, `PRIMARY_RECOVERY_WITHOUT_BACKUP_OK`,
   and `BACKUP_RESTORED_OK`.
2. Dry-run the three-file conversion first. It must change every upstream and
   leave all live files untouched:
   ```bash
   python3 /opt/raising-game-demo/ops/nginx-upstream-switch.py \
     --file-backup '/etc/nginx/sites-enabled/default=raising_game_app=4174:4175' \
     --file-backup '/etc/nginx/sites-enabled/chat.5vips.com=raising_game_app_chat=4174:4175' \
     --file-backup '/etc/nginx/sites-enabled/live.123vipeak.com=raising_game_app_live=4174:4175' \
     --health-url https://123vips.com/api/health \
     --health-url https://chat.5vips.com/api/health \
     --health-url https://live.123vipeak.com/api/health \
     --reload-command 'systemctl reload nginx'
   ```
   Require all three plans and `changed=1`, then verify every file hash is
   unchanged. The command above is intentionally a dry-run.
3. Apply only in a measured change window. Re-run the dry-run command with
   `--apply`. The tool validates and reloads all three files as one journaled transaction. Keep 4174 schedulers enabled and
   4175 schedulers disabled until durable background ownership is verified.
   The backup member handles connection failures, timeouts, and configured
   upstream 5xx responses; it does not prove an event-loop hang is detected.
   Install a separate host-level watchdog for both loopback `livez` endpoints
   before describing this topology as hang-tolerant.
4. Prove the backup path with a controlled, short drill only after traffic and
   error baselines are recorded. A production SIGKILL is not part of routine
   rollout; prefer a dedicated maintenance window with immediate kill-switch
   rollback.
5. Roll back all three files together, then verify health and 5xx:
   ```bash
   python3 /opt/raising-game-demo/ops/nginx-upstream-switch.py \
     --file-switch '/etc/nginx/sites-enabled/default=raising_game_app=4175:4174' \
     --file-switch '/etc/nginx/sites-enabled/chat.5vips.com=raising_game_app_chat=4175:4174' \
     --file-switch '/etc/nginx/sites-enabled/live.123vipeak.com=raising_game_app_live=4175:4174' \
     --health-url https://123vips.com/api/health \
     --health-url https://chat.5vips.com/api/health \
     --health-url https://live.123vipeak.com/api/health \
     --reload-command 'systemctl reload nginx' --apply
   ```

The backup conversion itself does not make background jobs or in-process
generation submissions durable. Those require the PostgreSQL queue and
worker-lease gate described above.

## Permanent rolling deployment transaction

Use `ops/rolling-deploy-transaction.py` for release replacement once the
release snapshot is already present on the host. The command starts and verifies
the idle candidate before moving any traffic, runs migration hooks while the
original upstream is still active, and moves every traffic upstream in one
journaled transaction. It never replays request methods or bodies.

The permanent transaction requires the same non-symlink shared runtime media
root in the service environment and both release markers:

```text
RUNTIME_MEDIA_ROOT=/path/to/shared-assets
```

Prerequisites for a real run:

1. Build the release from a committed integration commit and deploy the
   snapshot to the inactive release path with the repository deployment
   entrypoint. Do not edit the active checkout or run migrations during the
   release-copy step.
2. Confirm both app units exist, the inactive port is free, the candidate
   environment has schedulers and queues disabled, and the active unit is
   healthy.
3. Record service PIDs and `NRestarts`, all three Nginx hashes, public health,
   Nginx 5xx/499, PostgreSQL connections/locks, load, memory, and disk.

Dry-run against the installed release first. It is the default and must not
start, stop, migrate, validate, reload, or alter any file:

```bash
python3 /opt/raising-game-demo/ops/rolling-deploy-transaction.py \
  --release /opt/raising-game-demo \
  --candidate-health-base http://127.0.0.1:4175
```

Require `OBSERVED active_port=...`, an upstream plan for every traffic group,
and unchanged Nginx hashes. Apply only in an approved low-traffic window and
only after the dry-run, full resilience suite, and release verification pass:

```bash
python3 /opt/raising-game-demo/ops/rolling-deploy-transaction.py \
  --release /opt/raising-game-demo \
  --candidate-health-base http://127.0.0.1:4175 \
  --apply
```

The command succeeds only after Nginx validation, reload, complete upstream
topology verification, and all three public health URLs return HTTP 200. It
prints `ROLLING_DEPLOY_OK`. If a failure occurs after cutover, it restores the
complete original topology and prints `ROLLBACK_OK`. If recovery cannot be
validated, it prints `ROLLBACK_FAILED ... manual intervention required`, keeps
the journal, and exits non-zero; do not report that run as recovered.

An already-active candidate is a safe no-op only when the candidate and public
health checks pass. It prints `ROLLING_DEPLOY_NOOP active_port=...` and never
performs a reverse switch. A missing, symlinked, invalid, or inconsistent
`RUNTIME_MEDIA_ROOT` must stop before candidate startup or traffic mutation.

## Shared runtime media cutover

Prepare the shared tree from the active release without copying release-owned
static assets. The preparation command is dry-run by default and must never
overwrite an existing target:

```bash
python3 /opt/raising-game-demo/ops/prepare-runtime-media-root.py \
  --source-assets /opt/raising-game-demo/assets \
  --target /opt/raising-game-shared/assets
```

Require `RUNTIME_MEDIA_PLAN_OK` and inspect every included and empty runtime
path. Apply only during a quiet window, then require
`RUNTIME_MEDIA_READY` and preserve its file count, directory count, byte count,
and target path as the baseline. The tool hashes every copied file; it aborts
if runtime source files change during preparation.

The cutover order is fixed:

1. Start only the idle 4175 unit against the prepared shared root and verify
   health, livez, readyz, a read, and a controlled upload while 4174 still
   serves all traffic.
2. Move all three upstream files to 4175 in one journaled transaction.
3. Stop 4174 so it can no longer write to its release-local asset tree.
4. Perform one final incremental synchronization from 4174's old runtime tree
   to the shared root. Never use delete flags, never copy a missing file over a
   file already created by 4175, and never copy an older file over a newer
   standby-written file. Prefer an explicit collision report.
5. Hash-compare the completed shared tree. A collision or content mismatch
   requires a reviewed merge decision, not an overwrite.
6. Point 4174 at the same `RUNTIME_MEDIA_ROOT`, start it, and verify both
   instances before enabling any non-HTTP background workload.

Do not reuse the preparation tool to synchronize into an existing target; its
no-overwrite rule is intentional. Do not copy the entire `assets/` tree. Keep
release-owned branding, templates, and gallery files in the release. Any
failure during this sequence must restore the original environment files and
the complete original Nginx topology.

## Final state choices

- Single-process rollback: primary active on 4174, secondary disabled, all
  upstreams on 4174.
- Stable dual-process: both HTTP instances active, all traffic upstreams on
  4175, schedulers explicitly assigned by measured ownership, no partial
  upstream mix.
