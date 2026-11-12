#!/usr/bin/env bash
set -euo pipefail
umask 077

# Run on the Old host as root. Validate two production-shaped transient
# systemd services without touching the production unit, port, database, or
# Nginx. The caller supplies a disposable database already restored from a
# verified snapshot.
#
# Required:
#   DRILL_DATABASE_URL=postgresql://.../raising_game_systemd_drill_YYYYMMDDHHMMSS
#   DRILL_CONFIRM_DISPOSABLE_DATABASE=1
# Optional:
#   APP_ROOT=/opt/raising-game-systemd-drill-src
#   ENV_FILE=/etc/raising-game-demo.env (credential source only)
#   PORT_A=4184 PORT_B=4185 RUN_ROOT=/tmp/raising-game-systemd-drill

if [[ "$(id -u)" -ne 0 ]]; then
  echo "Run as root on the isolated Old-host drill environment." >&2
  exit 1
fi

DRILL_DB="${DRILL_DB:-}"
DRILL_DATABASE_URL="${DRILL_DATABASE_URL:-}"
APP_ROOT="${APP_ROOT:-/opt/raising-game-systemd-drill-src}"
APP_ROOT="$(realpath -e "$APP_ROOT")"
ENV_FILE="${ENV_FILE:-/etc/raising-game-demo.env}"
PORT_A="${PORT_A:-4184}"
PORT_B="${PORT_B:-4185}"
RUN_ROOT="${RUN_ROOT:-/tmp/raising-game-systemd-drill}"
UNIT_PREFIX="raising-game-systemd-drill-$$"
UNIT_A="${UNIT_PREFIX}-a.service"
UNIT_B="${UNIT_PREFIX}-b.service"
ENV_A="${RUN_ROOT}/instance-a.env"
ENV_B="${RUN_ROOT}/instance-b.env"

if [[ ! "$DRILL_DB" =~ ^raising_game_systemd_drill_[0-9]{14}$ ]]; then
  echo "DRILL_DB must be a disposable raising_game_systemd_drill_YYYYMMDDHHMMSS database." >&2
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
if [[ "$PORT_A" == "$PORT_B" ]]; then
  echo "Drill ports must differ." >&2
  exit 2
fi
case "$APP_ROOT" in
  /tmp|/tmp/*)
    echo "APP_ROOT must not be under /tmp because the drill units use PrivateTmp=yes: $APP_ROOT" >&2
    exit 2
    ;;
esac
if [[ ! -d "$APP_ROOT" || ! -f "$APP_ROOT/server.js" || ! -f "$APP_ROOT/ops/run-db-migrations.js" ]]; then
  echo "APP_ROOT is not a drill release checkout with migrations: $APP_ROOT" >&2
  exit 2
fi
if [[ ! -f "$ENV_FILE" ]]; then
  echo "ENV_FILE is required as a credential source: $ENV_FILE" >&2
  exit 2
fi
for binary in systemctl systemd-run curl ss runuser psql dropdb timeout; do
  command -v "$binary" >/dev/null || { echo "Required binary not found: $binary" >&2; exit 2; }
done
if [[ "${DRILL_CONFIRM_DISPOSABLE_DATABASE:-}" != "1" ]]; then
  echo "DRILL_CONFIRM_DISPOSABLE_DATABASE=1 is required before schema migration." >&2
  exit 4
fi
if [[ -z "$DRILL_DATABASE_URL" ]]; then
  echo "DRILL_DATABASE_URL is required; the drill never falls back to production DATABASE_URL." >&2
  exit 4
fi
if ! DRILL_DB_RESOLVED="$(DATABASE_URL="$DRILL_DATABASE_URL" node -e '
const { URL } = require("node:url");
try {
  const parsed = new URL(process.env.DATABASE_URL);
  if (!["postgres:", "postgresql:"].includes(parsed.protocol)) process.exit(2);
  process.stdout.write(decodeURIComponent(parsed.pathname.replace(/^\//, "")));
} catch { process.exit(2); }
')"; then
  echo "DRILL_DATABASE_URL must be a valid PostgreSQL URL." >&2
  exit 4
fi
if [[ "$DRILL_DB_RESOLVED" != "$DRILL_DB" ]]; then
  echo "DRILL_DATABASE_URL must target DRILL_DB exactly ($DRILL_DB), got: ${DRILL_DB_RESOLVED:-<empty>}" >&2
  exit 4
fi
runuser -u postgres -- psql -X -A -t -d postgres \
  -c "SELECT count(*) FROM pg_database WHERE datname = '$DRILL_DB'" \
  | grep -qx 1 || {
    echo "Drill database must exist before the drill: $DRILL_DB" >&2
    exit 4
  }

mkdir -p "$RUN_ROOT"
chmod 0700 "$RUN_ROOT"
logs="$RUN_ROOT/logs"
mkdir -p "$logs"
chmod 0700 "$logs"
unit_a_started=0
unit_b_started=0

show_unit_failure() {
  local unit="$1"
  echo "--- $unit status ---" >&2
  systemctl status "$unit" --no-pager -l >&2 || true
  echo "--- $unit journal ---" >&2
  journalctl -u "$unit" --no-pager -n 80 >&2 || true
}

cleanup() {
  local status=$?
  local remaining
  set +e
  if [[ "$unit_a_started" == "1" || "$unit_b_started" == "1" ]]; then
    systemctl stop "$UNIT_A" "$UNIT_B" >/dev/null 2>&1
    systemctl reset-failed "$UNIT_A" "$UNIT_B" >/dev/null 2>&1
  fi
  rm -f "$ENV_A" "$ENV_B"
  rm -rf "$RUN_ROOT"
  if ! runuser -u postgres -- dropdb --if-exists -- "$DRILL_DB"; then
    echo "SYSTEMD_DRILL_CLEANUP_FAILED db=$DRILL_DB reason=dropdb" >&2
    [[ "$status" -eq 0 ]] && status=1
  else
    remaining="$(runuser -u postgres -- psql -X -A -t -d postgres -c "SELECT count(*) FROM pg_database WHERE datname = '$DRILL_DB'")"
    if [[ "$remaining" == "0" ]]; then
      echo "SYSTEMD_DRILL_CLEANUP_OK=1 db=$DRILL_DB"
    else
      echo "SYSTEMD_DRILL_CLEANUP_FAILED db=$DRILL_DB remaining=${remaining:-unknown}" >&2
      [[ "$status" -eq 0 ]] && status=1
    fi
  fi
  exit "$status"
}
trap cleanup EXIT

# The app environment file supplies credentials only. Both transient units
# receive explicit overrides for database, port, and side-effect scheduling.
set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a
for file in "$ENV_A" "$ENV_B"; do
  {
    printf 'DATABASE_URL=%q\n' "$DRILL_DATABASE_URL"
    printf 'BACKGROUND_SCHEDULERS_ENABLED=0\n'
    printf 'GENERATION_SUBMIT_QUEUE_ENABLED=0\n'
    printf 'GENERATION_SUBMIT_WORKER_ENABLED=0\n'
  } >"$file"
done
printf 'PORT=%s\n' "$PORT_A" >>"$ENV_A"
printf 'PORT=%s\n' "$PORT_B" >>"$ENV_B"

# A disposable copy restored with --no-owner must be made usable by the
# application role without changing production ownership.
runuser -u postgres -- psql -X -v ON_ERROR_STOP=1 -q -d "$DRILL_DB" <<'SQL'
ALTER SCHEMA public OWNER TO raising_game_app;
DO $$
DECLARE item record;
BEGIN
  FOR item IN
    SELECT c.oid::regclass AS object_name
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p', 'v', 'm', 'f')
  LOOP
    EXECUTE format('ALTER TABLE %s OWNER TO raising_game_app', item.object_name);
  END LOOP;
  FOR item IN
    SELECT c.oid::regclass AS object_name
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'S'
      AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.objid = c.oid AND d.deptype IN ('a', 'i'))
  LOOP
    EXECUTE format('ALTER SEQUENCE %s OWNER TO raising_game_app', item.object_name);
  END LOOP;
END $$;
GRANT USAGE, CREATE ON SCHEMA public TO raising_game_app;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO raising_game_app;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO raising_game_app;
SQL

catalog_probe="$(
  psql "$DRILL_DATABASE_URL" -X -A -t -v ON_ERROR_STOP=1 -c "
    SELECT to_regclass('public.app_catalog_entries') IS NOT NULL,
      COALESCE((SELECT COUNT(*) FROM app_catalog_entries WHERE catalog = 'ourdream_presets' AND deleted_at IS NULL), 0),
      COALESCE((SELECT COUNT(*) FROM app_catalog_entries WHERE catalog = 'ourdream_actions' AND deleted_at IS NULL), 0),
      COALESCE((SELECT COUNT(*) FROM app_catalog_entries WHERE catalog = 'chat_live_voices' AND scope = 'realtime' AND deleted_at IS NULL), 0),
      COALESCE((SELECT COUNT(*) FROM app_catalog_entries WHERE catalog = 'chat_live_voices' AND scope = 'component' AND deleted_at IS NULL), 0),
      COALESCE((SELECT COUNT(*) FROM app_catalog_entries WHERE catalog = 'showcase_cases' AND deleted_at IS NULL), 0)
  " 2>/dev/null
)" || { echo "DRILL_DB catalog probe failed." >&2; exit 4; }
IFS='|' read -r catalog_ready presets actions realtime component showcase <<<"$catalog_probe"
if [[ "$catalog_ready" != "t" ]] || (( ${presets:-0} <= 0 )) || (( ${actions:-0} <= 0 )) \
  || (( ${realtime:-0} <= 0 )) || (( ${component:-0} <= 0 )) || (( ${showcase:-0} <= 0 )); then
  echo "DRILL_DB must be restored from a populated disposable snapshot." >&2
  exit 4
fi
echo "SYSTEMD_DRILL_CATALOG_PROBE_OK presets=$presets actions=$actions realtime=$realtime component=$component showcase=$showcase"

cd "$APP_ROOT"
DATABASE_URL="$DRILL_DATABASE_URL" node ops/run-db-migrations.js --dry-run
DATABASE_URL="$DRILL_DATABASE_URL" node ops/run-db-migrations.js --apply
DATABASE_URL="$DRILL_DATABASE_URL" node ops/run-db-migrations.js --dry-run | tee "$RUN_ROOT/migrations-ready.log"
grep -qx 'pending=0' "$RUN_ROOT/migrations-ready.log" || {
  echo "Disposable drill database still has pending migrations." >&2
  exit 4
}

wait_http() {
  local port="$1"
  local deadline=$((SECONDS + 90))
  while (( SECONDS < deadline )); do
    if curl -fsS --max-time 2 "http://127.0.0.1:$port/api/health" >/dev/null 2>&1 \
      && curl -fsS --max-time 2 "http://127.0.0.1:$port/api/livez" >/dev/null 2>&1 \
      && curl -fsS --max-time 2 "http://127.0.0.1:$port/api/readyz" >/dev/null 2>&1; then
      return 0
    fi
    sleep 0.25
  done
  return 1
}

wait_unit_active() {
  local unit="$1"
  local port="$2"
  systemctl start "$unit"
  for _ in $(seq 1 240); do
    if systemctl is-active --quiet "$unit" && wait_http "$port"; then return 0; fi
    sleep 0.25
  done
  show_unit_failure "$unit"
  return 1
}

start_unit() {
  local unit="$1"
  local port="$2"
  local description="$3"
  systemd-run --unit="$unit" --description="$description" \
    --property=Type=simple \
    --property=WorkingDirectory="$APP_ROOT" \
    --property=EnvironmentFile="$ENV_FILE" \
    --property=EnvironmentFile="$4" \
    --property=Restart=always \
    --property=RestartSec=2 \
    --property=TimeoutStopSec=300 \
    --property=KillMode=control-group \
    --property=User=root \
    --property=NoNewPrivileges=yes \
    --property=PrivateTmp=yes \
    --property=ProtectSystem=full \
    --property=ProtectHome=yes \
    --property=UMask=0077 \
    --property=LimitNOFILE=65535 \
    --property=TasksMax=8192 \
    -- /usr/bin/node "$APP_ROOT/server.js" >/dev/null
}

start_unit "$UNIT_A" "$PORT_A" "Raising Game systemd drill A" "$ENV_A"
unit_a_started=1
wait_unit_active "$UNIT_A" "$PORT_A" || { echo "Systemd instance A failed readiness." >&2; exit 5; }
start_unit "$UNIT_B" "$PORT_B" "Raising Game systemd drill B" "$ENV_B"
unit_b_started=1
wait_unit_active "$UNIT_B" "$PORT_B" || { echo "Systemd instance B failed readiness." >&2; exit 5; }
echo "SYSTEMD_INSTANCES_READY=2 ports=$PORT_A,$PORT_B schedulers=disabled worker=disabled"

pid_a="$(systemctl show "$UNIT_A" -p MainPID --value)"
pid_b="$(systemctl show "$UNIT_B" -p MainPID --value)"
[[ "$pid_a" =~ ^[1-9][0-9]*$ && "$pid_b" =~ ^[1-9][0-9]*$ && "$pid_a" != "$pid_b" ]] || {
  echo "Both systemd instances must have distinct live MainPIDs." >&2
  exit 6
}
ss -ltnp "sport = :$PORT_A" | grep -q "pid=$pid_a" || { echo "Port A is not owned by unit A." >&2; exit 6; }
ss -ltnp "sport = :$PORT_B" | grep -q "pid=$pid_b" || { echo "Port B is not owned by unit B." >&2; exit 6; }
echo "SYSTEMD_MAIN_PIDS_DISTINCT=1 a=$pid_a b=$pid_b"

# Cross-instance health must remain intact when one unit is deliberately
# stopped. systemd itself is the restart controller for the remaining peer.
kill -KILL "$pid_a"
for _ in $(seq 1 120); do
  if systemctl is-active --quiet "$UNIT_A"; then
    new_pid_a="$(systemctl show "$UNIT_A" -p MainPID --value)"
    if [[ "$new_pid_a" =~ ^[1-9][0-9]*$ && "$new_pid_a" != "$pid_a" ]] && wait_http "$PORT_A"; then break; fi
  fi
  sleep 0.25
done
new_pid_a="$(systemctl show "$UNIT_A" -p MainPID --value)"
[[ "$new_pid_a" =~ ^[1-9][0-9]*$ && "$new_pid_a" != "$pid_a" ]] || {
  show_unit_failure "$UNIT_A"
  echo "Unit A did not restart after SIGKILL." >&2
  exit 7
}
wait_http "$PORT_B" || { echo "Unit B became unhealthy after peer crash." >&2; exit 7; }
echo "SYSTEMD_AUTO_RESTART_OK unit=$UNIT_A old_pid=$pid_a new_pid=$new_pid_a peer_healthy=1"

# Stop B gracefully and prove A keeps serving and B can be started again.
systemctl stop "$UNIT_B"
unit_b_started=0
wait_http "$PORT_A" || { echo "Unit A became unhealthy after stopping B." >&2; exit 8; }
if ss -ltn "sport = :$PORT_B" | grep -q LISTEN; then
  echo "Port B remained open after stopping unit B." >&2
  exit 8
fi
echo "SYSTEMD_SINGLE_STOP_ISOLATED=1 stopped=$UNIT_B peer_healthy=1"

start_unit "$UNIT_B" "$PORT_B" "Raising Game systemd drill B" "$ENV_B"
unit_b_started=1
wait_unit_active "$UNIT_B" "$PORT_B" || { echo "Systemd instance B failed restart." >&2; exit 8; }
wait_http "$PORT_A" || { echo "Unit A became unhealthy after restarting B." >&2; exit 8; }
echo "SYSTEMD_RESTART_ISOLATED=1 restarted=$UNIT_B peer_healthy=1"

# Both services must have their own cgroup and no production listener.
for unit in "$UNIT_A" "$UNIT_B"; do
  systemctl show "$unit" -p ControlGroup -p ActiveState -p SubState
done
if ss -ltnp 'sport = :4174' | grep -q 'raising-game-systemd-drill'; then
  echo "A drill unit unexpectedly owns production port 4174." >&2
  exit 9
fi
echo "SYSTEMD_MULTI_INSTANCE_DRILL_OK units=2 shared_release=1 shared_database=1 restart=1 isolation=1"
