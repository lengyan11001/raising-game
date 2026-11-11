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

## Final state choices

- Single-process rollback: primary active on 4174, secondary disabled, all
  upstreams on 4174.
- Stable dual-process: both HTTP instances active, all traffic upstreams on
  4175, schedulers explicitly assigned by measured ownership, no partial
  upstream mix.
