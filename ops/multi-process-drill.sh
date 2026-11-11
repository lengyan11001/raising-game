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
runuser -u postgres -- psql -X -v ON_ERROR_STOP=1 -q -d "$DRILL_DB" <<'SQL'
ALTER SCHEMA public OWNER TO raising_game_app;
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
  set +e
  for pid in "$http_a" "$http_b" "$lock_holder"; do
    [[ -n "$pid" ]] && kill -TERM "$pid" 2>/dev/null
  done
  for pid in "$http_a" "$http_b" "$lock_holder"; do
    [[ -n "$pid" ]] && timeout 10 tail --pid="$pid" -f /dev/null 2>/dev/null
  done
  rm -rf "$RUN_ROOT"
  runuser -u postgres -- dropdb --if-exists "$DRILL_DB" >/dev/null 2>&1
  echo "MULTI_PROCESS_DRILL_CLEANUP db=$DRILL_DB"
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

cd "$APP_ROOT"
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

# Graceful replacement: stop B, keep A serving; then stop A. Both must exit 0.
kill -TERM "$http_b"
wait_exit "$http_b" || { echo "HTTP B did not drain cleanly." >&2; exit 8; }
http_b=""
wait_http "$PORT_A" "$http_a" || { echo "HTTP A failed after peer drain." >&2; exit 9; }
echo "PEER_DRAIN_SURVIVED=1"
kill -TERM "$http_a"
wait_exit "$http_a" || { echo "HTTP A did not drain cleanly." >&2; exit 9; }
http_a=""
echo "MULTI_PROCESS_DRILL_OK http_instances=2 scheduler_takeover=1"
