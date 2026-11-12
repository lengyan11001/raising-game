#!/usr/bin/env bash
set -euo pipefail
umask 077

# Run on the Old host as root. This drill requires a disposable database
# restored from a verified snapshot. It never opens the production app port.
#
# The two HTTP processes intentionally disable schedulers: a restored copy of
# production contains real pending work, and a drill must not invoke providers,
# send notifications, or mutate production-adjacent side effects. Scheduler
# ownership takeover is tested separately with a namespaced advisory lock.

if [[ "$(id -u)" -ne 0 ]]; then
  echo "Run as root on the isolated Old-host drill environment." >&2
  exit 1
fi

DRILL_DB="${DRILL_DB:-}"
APP_ROOT="${APP_ROOT:-/opt/raising-game-demo}"
ENV_FILE="${ENV_FILE:-/etc/raising-game-demo.env}"
PORT_A="${PORT_A:-4181}"
PORT_B="${PORT_B:-4182}"
RUN_ROOT="${RUN_ROOT:-/tmp/raising-game-multi-process-drill}"
PROBE_REQUESTS="${PROBE_REQUESTS:-60}"

if [[ ! "$DRILL_DB" =~ ^raising_game_multi_drill_[0-9]{14}$ ]]; then
  echo "DRILL_DB must be a disposable raising_game_multi_drill_YYYYMMDDHHMMSS database." >&2
  exit 2
fi
for port in "$PORT_A" "$PORT_B"; do
  if [[ ! "$port" =~ ^[0-9]+$ ]] || (( port < 1024 || port > 65535 )); then
    echo "Invalid drill port: $port" >&2
    exit 2
  fi
  if ss -ltn "sport = :$port" | grep -q LISTEN; then
    echo "Drill port is already in use: $port" >&2
    exit 3
  fi
done
if [[ ! "$PROBE_REQUESTS" =~ ^[1-9][0-9]*$ ]] || (( PROBE_REQUESTS > 1000 )); then
  echo "PROBE_REQUESTS must be an integer between 1 and 1000." >&2
  exit 2
fi
if [[ "$PORT_A" == "4174" || "$PORT_B" == "4174" ]]; then
  echo "The production port 4174 must not be used for this drill." >&2
  exit 2
fi

runuser -u postgres -- psql -X -A -t -d postgres \
  -c "SELECT count(*) FROM pg_database WHERE datname = '$DRILL_DB'" \
  | grep -qx 1 || {
    echo "Drill database must exist before the drill: $DRILL_DB" >&2
    exit 4
  }
# The drill restores with --no-owner so the dump cannot create or alter roles.
# Reassign the disposable database's restored objects to the same application
# owner used by production; grants alone do not permit schema-migration DDL.
runuser -u postgres -- psql -X -v ON_ERROR_STOP=1 -q -d "$DRILL_DB" <<'SQL'
ALTER SCHEMA public OWNER TO raising_game_app;
DO $$
DECLARE
  item record;
BEGIN
  FOR item IN
    SELECT c.oid::regclass AS object_name
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind IN ('r', 'p', 'v', 'm', 'f')
  LOOP
    EXECUTE format('ALTER TABLE %s OWNER TO raising_game_app', item.object_name);
  END LOOP;
  -- Serial/identity sequences follow their owning table. Changing a linked
  -- sequence directly is rejected by PostgreSQL.
  FOR item IN
    SELECT c.oid::regclass AS object_name
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind = 'S'
      AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.objid = c.oid AND d.deptype IN ('a', 'i'))
  LOOP
    EXECUTE format('ALTER SEQUENCE %s OWNER TO raising_game_app', item.object_name);
  END LOOP;
END
$$;
GRANT USAGE, CREATE ON SCHEMA public TO raising_game_app;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO raising_game_app;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO raising_game_app;
SQL

mkdir -p "$RUN_ROOT"
chmod 0700 "$RUN_ROOT"
logs="$RUN_ROOT/logs"
mkdir -p "$logs"
chmod 0700 "$logs"
pid_a=""
pid_b=""
lock_holder=""
http_a=""
http_b=""

cleanup() {
  local status=$?
  local remaining
  set +e
  for pid in "$http_a" "$http_b" "$lock_holder"; do
    [[ -n "$pid" ]] && kill -TERM "$pid" 2>/dev/null
  done
  for pid in "$http_a" "$http_b" "$lock_holder"; do
    [[ -n "$pid" ]] && timeout 10 tail --pid="$pid" -f /dev/null 2>/dev/null
  done
  rm -rf "$RUN_ROOT"
  if ! runuser -u postgres -- dropdb --if-exists -- "$DRILL_DB"; then
    echo "MULTI_PROCESS_DRILL_CLEANUP_FAILED db=$DRILL_DB reason=dropdb" >&2
    [[ "$status" -eq 0 ]] && status=1
  else
    remaining="$(runuser -u postgres -- psql -X -A -t -d postgres -c "SELECT count(*) FROM pg_database WHERE datname = '$DRILL_DB'")"
    if [[ "$remaining" == "0" ]]; then
      echo "MULTI_PROCESS_DRILL_CLEANUP_OK=1 db=$DRILL_DB"
    else
      echo "MULTI_PROCESS_DRILL_CLEANUP_FAILED db=$DRILL_DB remaining=${remaining:-unknown}" >&2
      [[ "$status" -eq 0 ]] && status=1
    fi
  fi
  exit "$status"
}
trap cleanup EXIT

set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a
DRILL_DATABASE_URL="${DRILL_DATABASE_URL:-}"
if [[ -z "$DRILL_DATABASE_URL" ]]; then
  echo "DRILL_DATABASE_URL is required; the drill never falls back to DATABASE_URL." >&2
  exit 4
fi
# The application env file is a source of credentials only. Replace its
# database URL with the explicitly supplied disposable drill URL before any
# process starts, and reject anything that does not target $DRILL_DB.
DATABASE_URL="$DRILL_DATABASE_URL"
if ! DRILL_DB_RESOLVED="$(DATABASE_URL="$DRILL_DATABASE_URL" node -e '
const { URL } = require("node:url");
try {
  const parsed = new URL(process.env.DATABASE_URL);
  if (!["postgres:", "postgresql:"].includes(parsed.protocol)) process.exit(2);
  process.stdout.write(decodeURIComponent(parsed.pathname.replace(/^\//, "")));
} catch {
  process.exit(2);
}
')"; then
  echo "DRILL_DATABASE_URL must be a valid PostgreSQL URL." >&2
  exit 4
fi
if [[ "$DRILL_DB_RESOLVED" != "$DRILL_DB" ]]; then
  echo "DRILL_DATABASE_URL must target DRILL_DB exactly ($DRILL_DB), got: ${DRILL_DB_RESOLVED:-<empty>}" >&2
  exit 4
fi
if [[ "${DRILL_CONFIRM_DISPOSABLE_DATABASE:-}" != "1" ]]; then
  echo "DRILL_CONFIRM_DISPOSABLE_DATABASE=1 is required before schema migration." >&2
  exit 4
fi
# Migrations create the catalog table but intentionally do not seed runtime
# data. Refuse an empty disposable database before migrations or app startup;
# a production-like drill must be restored from a populated verified snapshot.
catalog_probe="$(
  runuser -u postgres -- psql "$DRILL_DATABASE_URL" -X -A -t -v ON_ERROR_STOP=1 -c "
    SELECT
      to_regclass('public.app_catalog_entries') IS NOT NULL,
      COALESCE((SELECT COUNT(*) FROM app_catalog_entries WHERE catalog = 'ourdream_presets' AND deleted_at IS NULL), 0),
      COALESCE((SELECT COUNT(*) FROM app_catalog_entries WHERE catalog = 'ourdream_actions' AND deleted_at IS NULL), 0),
      COALESCE((SELECT COUNT(*) FROM app_catalog_entries WHERE catalog = 'chat_live_voices' AND scope = 'realtime' AND deleted_at IS NULL), 0),
      COALESCE((SELECT COUNT(*) FROM app_catalog_entries WHERE catalog = 'chat_live_voices' AND scope = 'component' AND deleted_at IS NULL), 0),
      COALESCE((SELECT COUNT(*) FROM app_catalog_entries WHERE catalog = 'showcase_cases' AND deleted_at IS NULL), 0)
  " 2>/dev/null
)" || {
  echo "DRILL_DB must be restored from a populated disposable snapshot; catalog probe failed." >&2
  exit 4
}
IFS='|' read -r catalog_table_ready presets_count actions_count realtime_count component_count showcase_count <<<"$catalog_probe"
if [[ "$catalog_table_ready" != "t" ]] \
  || (( ${presets_count:-0} <= 0 )) \
  || (( ${actions_count:-0} <= 0 )) \
  || (( ${realtime_count:-0} <= 0 )) \
  || (( ${component_count:-0} <= 0 )) \
  || (( ${showcase_count:-0} <= 0 )); then
  echo "DRILL_DB must be restored from a populated disposable snapshot; required runtime catalogs are missing or empty." >&2
  echo "catalog probe: table=${catalog_table_ready:-unknown} presets=${presets_count:-0} actions=${actions_count:-0} realtime=${realtime_count:-0} component=${component_count:-0} showcase=${showcase_count:-0}" >&2
  exit 4
fi
echo "DRILL_CATALOG_PROBE_OK presets=$presets_count actions=$actions_count realtime=$realtime_count component=$component_count showcase=$showcase_count"
cd "$APP_ROOT"
# Restored histories can carry data without a trusted migration ledger. The
# readiness gate intentionally refuses to start then; reconcile the disposable
# copy first and inspect it before any application process is launched.
DATABASE_URL="$DRILL_DATABASE_URL" node ops/run-db-migrations.js --dry-run
DATABASE_URL="$DRILL_DATABASE_URL" node ops/run-db-migrations.js --apply
DATABASE_URL="$DRILL_DATABASE_URL" node ops/run-db-migrations.js --dry-run | tee "$RUN_ROOT/migrations-ready.log"
if ! grep -q '^pending=0$' "$RUN_ROOT/migrations-ready.log"; then
  echo "Disposable drill database still has pending migrations." >&2
  exit 4
fi

start_app() {
  local port="$1"
  local log="$2"
  DRILL_DATABASE_URL="$DRILL_DATABASE_URL" ENV_FILE="$ENV_FILE" DRILL_PORT="$port" BACKGROUND_SCHEDULERS_ENABLED=0 \
    setsid bash -c 'set -a; source "$1"; set +a; export DATABASE_URL="$3" PORT="$2" BACKGROUND_SCHEDULERS_ENABLED=0; exec node server.js' _ "$ENV_FILE" "$port" "$DRILL_DATABASE_URL" \
    >"$log" 2>&1 &
  echo "$!"
}

wait_http() {
  local port="$1"
  local pid="$2"
  local deadline=$((SECONDS + 60))
  while (( SECONDS < deadline )); do
    if ! kill -0 "$pid" 2>/dev/null; then
      return 1
    fi
    if curl -fsS --max-time 2 "http://127.0.0.1:$port/api/health" >/dev/null 2>&1 \
      && curl -fsS --max-time 2 "http://127.0.0.1:$port/api/livez" >/dev/null 2>&1 \
      && curl -fsS --max-time 2 "http://127.0.0.1:$port/api/readyz" >/dev/null 2>&1; then
      return 0
    fi
    sleep 0.25
  done
  return 1
}

wait_exit() {
  local pid="$1"
  local deadline=$((SECONDS + 30))
  while kill -0 "$pid" 2>/dev/null; do
    if (( SECONDS >= deadline )); then
      return 1
    fi
    sleep 0.1
  done
  return 0
}

http_a="$(start_app "$PORT_A" "$logs/http-a.log")"
http_b="$(start_app "$PORT_B" "$logs/http-b.log")"
wait_http "$PORT_A" "$http_a" || { cat "$logs/http-a.log" >&2; echo "HTTP A failed readiness" >&2; exit 5; }
wait_http "$PORT_B" "$http_b" || { cat "$logs/http-b.log" >&2; echo "HTTP B failed readiness" >&2; exit 5; }
echo "HTTP_INSTANCES_READY=2 ports=$PORT_A,$PORT_B schedulers=disabled"
if grep -q 'startWalletScanScheduler\\|wallet-chain-scan' "$logs/http-a.log" "$logs/http-b.log"; then
  echo "Scheduler unexpectedly started while disabled." >&2
  exit 6
fi

# Prove cross-process ownership with a disposable key. The holder dies first;
# the standby may run only after the holder process has terminated.
lock_name="multi-process-drill-$(date -u +%Y%m%d%H%M%S)-$$"
DATABASE_URL="$DRILL_DATABASE_URL" node - "$lock_name" <<'NODE' >"$logs/lock-holder.log" 2>&1 &
const { Pool } = require("pg");
const name = process.argv[2];
const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
(async () => {
  const client = await pool.connect();
  const result = await client.query("SELECT pg_try_advisory_lock(hashtextextended($1, 0)) AS acquired", [`raising-game-scheduler:${name}`]);
  if (!result.rows[0].acquired) throw new Error("holder could not acquire drill lock");
  process.stdout.write("LOCK_HELD\n");
  await new Promise(() => {});
})().catch((error) => { console.error(error); process.exit(1); });
NODE
lock_holder=$!
deadline=$((SECONDS + 20))
while ! grep -q '^LOCK_HELD$' "$logs/lock-holder.log" 2>/dev/null; do
  if (( SECONDS >= deadline )) || ! kill -0 "$lock_holder" 2>/dev/null; then
    cat "$logs/lock-holder.log" >&2
    echo "Lock holder failed to start." >&2
    exit 7
  fi
  sleep 0.1
done
TEST_DATABASE_URL="$DRILL_DATABASE_URL" node - "$lock_name" <<'NODE'
const assert = require("node:assert/strict");
const { Pool } = require("pg");
const { runWithSchedulerLease } = require("./lib-scheduler-lease");
const name = process.argv[2];
const pool = new Pool({ connectionString: process.env.TEST_DATABASE_URL, max: 2 });
(async () => {
  let ran = 0;
  const skipped = await runWithSchedulerLease(name, async () => { ran += 1; }, { connect: () => pool.connect() });
  assert.equal(skipped.acquired, false);
  assert.equal(ran, 0);
  process.stdout.write("STANDBY_SKIPPED_WHILE_OWNER_ALIVE=1\n");
  await pool.end();
})().catch((error) => { console.error(error); process.exit(1); });
NODE
kill -TERM "$lock_holder"
wait "$lock_holder" 2>/dev/null || true
lock_holder=""
TEST_DATABASE_URL="$DRILL_DATABASE_URL" node - "$lock_name" <<'NODE'
const assert = require("node:assert/strict");
const { Pool } = require("pg");
const { runWithSchedulerLease } = require("./lib-scheduler-lease");
const name = process.argv[2];
const pool = new Pool({ connectionString: process.env.TEST_DATABASE_URL, max: 2 });
(async () => {
  let ran = 0;
  const takeover = await runWithSchedulerLease(name, async () => { ran += 1; return "takeover"; }, { connect: () => pool.connect() });
  assert.equal(takeover.acquired, true);
  assert.equal(ran, 1);
  process.stdout.write("SCHEDULER_TAKEOVER_COUNT=1\n");
  await pool.end();
})().catch((error) => { console.error(error); process.exit(1); });
NODE

# A request probe keeps exercising A while B is killed without shutdown. This
# proves that loss of one process does not make the other process unhealthy;
# the Nginx drill separately proves that the edge retries away from the dead
# peer without a user-visible error.
probe_log="$logs/survivor-probe.log"
(
  ok=0
  failed=0
  for _ in $(seq 1 "$PROBE_REQUESTS"); do
    if curl -fsS --max-time 2 "http://127.0.0.1:$PORT_A/api/health" >/dev/null 2>&1; then
      ok=$((ok + 1))
    else
      failed=$((failed + 1))
    fi
    sleep 0.05
  done
  printf 'SURVIVOR_PROBE_OK requests=%s failures=%s\n' "$ok" "$failed"
) >"$probe_log" 2>&1 &
probe_pid=$!
sleep 0.75
kill -KILL "$http_b"
wait "$http_b" 2>/dev/null || true
http_b=""
wait "$probe_pid"
cat "$probe_log"
grep -qx "SURVIVOR_PROBE_OK requests=$PROBE_REQUESTS failures=0" "$probe_log" || {
  echo "Surviving process had failed or incomplete requests after SIGKILL." >&2
  exit 8
}
wait_http "$PORT_A" "$http_a" || { echo "HTTP A failed after peer SIGKILL." >&2; exit 9; }
echo "SIGKILL_PEER_SURVIVED=1 killed_port=$PORT_B"

# Graceful replacement: stop the surviving A and require a clean drain.
kill -TERM "$http_a"
wait_exit "$http_a" || { echo "HTTP A did not drain cleanly." >&2; exit 9; }
http_a=""
echo "MULTI_PROCESS_DRILL_OK http_instances=2 scheduler_takeover=1 sigkill_failover=1"
