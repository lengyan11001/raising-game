#!/usr/bin/env bash
set -euo pipefail
umask 077

# Run on the Old host as root. This drill validates Nginx failover and rolling
# replacement against disposable app processes. It never edits the production
# Nginx configuration, never listens on 4174, and never enables schedulers,
# generation submit workers, webhooks, or provider side effects.
#
# Required:
#   DRILL_DATABASE_URL=postgresql://.../raising_game_nginx_drill_YYYYMMDDHHMMSS
#   DRILL_CONFIRM_DISPOSABLE_DATABASE=1
#   APP_ROOT=/opt/raising-game-demo (default)
#   ENV_FILE=/etc/raising-game-demo.env (default; source credentials only)
# Optional:
#   PORT_A=4181 PORT_B=4182 EDGE_PORT=48080
#   RUN_ROOT=/tmp/raising-game-nginx-drill

if [[ "$(id -u)" -ne 0 ]]; then
  echo "Run as root on the isolated Old-host drill environment." >&2
  exit 1
fi

DRILL_DB="${DRILL_DB:-}"
APP_ROOT="${APP_ROOT:-/opt/raising-game-demo}"
ENV_FILE="${ENV_FILE:-/etc/raising-game-demo.env}"
PORT_A="${PORT_A:-4181}"
PORT_B="${PORT_B:-4182}"
EDGE_PORT="${EDGE_PORT:-48080}"
RUN_ROOT="${RUN_ROOT:-/tmp/raising-game-nginx-drill}"
NGINX_BIN="${NGINX_BIN:-nginx}"

if [[ ! "$DRILL_DB" =~ ^raising_game_nginx_drill_[0-9]{14}$ ]]; then
  echo "DRILL_DB must be a disposable raising_game_nginx_drill_YYYYMMDDHHMMSS database." >&2
  exit 2
fi
for port in "$PORT_A" "$PORT_B" "$EDGE_PORT"; do
  if [[ ! "$port" =~ ^[0-9]+$ ]] || (( port < 1024 || port > 65535 )); then
    echo "Invalid drill port: $port" >&2
    exit 2
  fi
  if ss -ltn "sport = :$port" | grep -q LISTEN; then
    echo "Drill port is already in use: $port" >&2
    exit 3
  fi
done
if [[ "$PORT_A" == "4174" || "$PORT_B" == "4174" || "$EDGE_PORT" == "4174" ]]; then
  echo "The production port 4174 must not be used for this drill." >&2
  exit 2
fi
if [[ ! -d "$APP_ROOT" || ! -f "$APP_ROOT/server.js" || ! -f "$APP_ROOT/ops/run-db-migrations.js" ]]; then
  echo "APP_ROOT is not a release checkout: $APP_ROOT" >&2
  exit 2
fi
if [[ ! -f "$ENV_FILE" ]]; then
  echo "ENV_FILE is required as a credential source: $ENV_FILE" >&2
  exit 2
fi
command -v "$NGINX_BIN" >/dev/null || { echo "nginx binary not found: $NGINX_BIN" >&2; exit 2; }
command -v curl >/dev/null || { echo "curl is required" >&2; exit 2; }
command -v psql >/dev/null || { echo "psql is required" >&2; exit 2; }

runuser -u postgres -- psql -X -A -t -d postgres \
  -c "SELECT count(*) FROM pg_database WHERE datname = '$DRILL_DB'" \
  | grep -qx 1 || {
    echo "Drill database must exist before the drill: $DRILL_DB" >&2
    exit 4
  }

mkdir -p "$RUN_ROOT"
chmod 0700 "$RUN_ROOT"
logs="$RUN_ROOT/logs"
nginx_prefix="$RUN_ROOT/nginx"
mkdir -p "$logs" "$nginx_prefix/logs" "$nginx_prefix/conf" "$nginx_prefix/client_body" "$nginx_prefix/proxy" "$nginx_prefix/fastcgi" "$nginx_prefix/uwsgi" "$nginx_prefix/scgi"
chmod 0700 "$logs" "$nginx_prefix"
# nginx writes temporary files as its worker user; keep the disposable temp
# directories writable without granting access to the drill logs or config.
chmod 0777 "$nginx_prefix/client_body" "$nginx_prefix/proxy" "$nginx_prefix/fastcgi" "$nginx_prefix/uwsgi" "$nginx_prefix/scgi"

pid_a=""
pid_b=""
nginx_pid=""
request_loop_pid=""

cleanup() {
  set +e
  for pid in "$request_loop_pid" "$nginx_pid" "$pid_a" "$pid_b"; do
    [[ -n "$pid" ]] && kill -TERM "$pid" 2>/dev/null
  done
  for pid in "$request_loop_pid" "$nginx_pid" "$pid_a" "$pid_b"; do
    [[ -n "$pid" ]] && timeout 10 tail --pid="$pid" -f /dev/null 2>/dev/null
  done
  rm -rf "$RUN_ROOT"
  echo "NGINX_DRILL_CLEANUP db=$DRILL_DB"
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
  echo "DRILL_CONFIRM_DISPOSABLE_DATABASE=1 is required before validating the drill database." >&2
  exit 4
fi

# A migrated empty database cannot boot this application because required
# runtime catalogs are intentionally PostgreSQL-only. Require a disposable
# copy restored from a populated snapshot before starting Nginx or any app.
catalog_probe="$(
  psql "$DRILL_DATABASE_URL" -X -A -t -v ON_ERROR_STOP=1 -c "
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

# Restores created with --no-owner do not inherit the application role's schema
# privileges. Refuse before migrations instead of discovering this mid-drill.
schema_privileges="$(
  psql "$DRILL_DATABASE_URL" -X -A -t -v ON_ERROR_STOP=1 -c "
    SELECT has_schema_privilege(current_user, 'public', 'USAGE')
       AND has_schema_privilege(current_user, 'public', 'CREATE')
  " 2>/dev/null
)" || {
  echo "DRILL_DB schema privilege probe failed." >&2
  exit 4
}
if [[ "$schema_privileges" != "t" ]]; then
  echo "DRILL_DB application role needs USAGE and CREATE on schema public before the drill." >&2
  exit 4
fi
echo "DRILL_SCHEMA_PRIVILEGES_OK=1"

cd "$APP_ROOT"
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
  DRILL_DATABASE_URL="$DRILL_DATABASE_URL" ENV_FILE="$ENV_FILE" DRILL_PORT="$port" BACKGROUND_SCHEDULERS_ENABLED=0 GENERATION_SUBMIT_WORKER_ENABLED=0 \
    setsid bash -c 'set -a; source "$1"; set +a; export DATABASE_URL="$3" PORT="$2" BACKGROUND_SCHEDULERS_ENABLED=0 GENERATION_SUBMIT_WORKER_ENABLED=0; exec node server.js' _ "$ENV_FILE" "$port" "$DRILL_DATABASE_URL" \
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
  local deadline=$((SECONDS + 45))
  while kill -0 "$pid" 2>/dev/null; do
    if (( SECONDS >= deadline )); then
      return 1
    fi
    sleep 0.1
  done
  return 0
}

cat >"$nginx_prefix/conf/nginx.conf" <<NGINX
worker_processes 1;
pid $nginx_prefix/nginx.pid;
error_log $nginx_prefix/logs/error.log info;
events { worker_connections 256; }
http {
  access_log $nginx_prefix/logs/access.log;
  client_body_temp_path $nginx_prefix/client_body;
  proxy_temp_path $nginx_prefix/proxy;
  fastcgi_temp_path $nginx_prefix/fastcgi;
  uwsgi_temp_path $nginx_prefix/uwsgi;
  scgi_temp_path $nginx_prefix/scgi;
  upstream raising_game_drill {
    server 127.0.0.1:$PORT_A max_fails=1 fail_timeout=2s;
    server 127.0.0.1:$PORT_B max_fails=1 fail_timeout=2s;
    keepalive 16;
  }
  map \$http_upgrade \$connection_upgrade { default upgrade; "" ""; }
  server {
    listen 127.0.0.1:$EDGE_PORT;
    location /api/ {
      proxy_pass http://raising_game_drill;
      proxy_http_version 1.1;
      proxy_set_header Host \$host;
      proxy_set_header X-Real-IP \$remote_addr;
      proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
      proxy_set_header X-Forwarded-Proto \$scheme;
      proxy_set_header Connection "";
      proxy_next_upstream error timeout http_502 http_503 http_504;
      proxy_next_upstream_tries 2;
      proxy_connect_timeout 1s;
      proxy_read_timeout 10s;
      proxy_send_timeout 10s;
    }
    location / {
      proxy_pass http://raising_game_drill;
      proxy_http_version 1.1;
      proxy_set_header Host \$host;
      proxy_set_header X-Real-IP \$remote_addr;
      proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
      proxy_set_header X-Forwarded-Proto \$scheme;
      proxy_set_header Upgrade \$http_upgrade;
      proxy_set_header Connection \$connection_upgrade;
      proxy_next_upstream error timeout http_502 http_503 http_504;
      proxy_next_upstream_tries 2;
      proxy_connect_timeout 1s;
      proxy_read_timeout 10s;
      proxy_send_timeout 10s;
    }
  }
}
NGINX

"$NGINX_BIN" -t -p "$nginx_prefix" -c "$nginx_prefix/conf/nginx.conf" >"$RUN_ROOT/nginx-test.log" 2>&1
"$NGINX_BIN" -p "$nginx_prefix" -c "$nginx_prefix/conf/nginx.conf" >"$RUN_ROOT/nginx-start.log" 2>&1
nginx_pid="$(cat "$nginx_prefix/nginx.pid")"
echo "NGINX_TEST_OK edge_port=$EDGE_PORT upstream_ports=$PORT_A,$PORT_B"

http_a="$(start_app "$PORT_A" "$logs/http-a.log")"
http_b="$(start_app "$PORT_B" "$logs/http-b.log")"
pid_a="$http_a"
pid_b="$http_b"
wait_http "$PORT_A" "$http_a" || { cat "$logs/http-a.log" >&2; echo "HTTP A failed readiness" >&2; exit 5; }
wait_http "$PORT_B" "$http_b" || { cat "$logs/http-b.log" >&2; echo "HTTP B failed readiness" >&2; exit 5; }
echo "HTTP_INSTANCES_READY=2 schedulers=disabled generation_submit_worker=disabled"
if grep -q 'startWalletScanScheduler\|wallet-chain-scan' "$logs/http-a.log" "$logs/http-b.log"; then
  echo "Scheduler unexpectedly started while disabled." >&2
  exit 6
fi

for i in $(seq 1 10); do
  curl -fsS --max-time 3 "http://127.0.0.1:$EDGE_PORT/api/health" >/dev/null
done
echo "EDGE_HEALTH_OK=10/10"

# Drain a known peer directly, then require the edge to keep serving from the
# other peer. This avoids relying on a particular round-robin selection.
drain_pid="$http_a"
drain_port="$PORT_A"
kill -TERM "$drain_pid"
wait_exit "$drain_pid" || { echo "Drained peer did not exit cleanly." >&2; exit 8; }
pid_a=""
for i in $(seq 1 20); do
  curl -fsS --max-time 3 "http://127.0.0.1:$EDGE_PORT/api/health" >/dev/null || { echo "Edge failed after peer drain." >&2; exit 9; }
done
echo "PEER_DRAIN_SURVIVED=1 drained_port=$drain_port"

# Restart the drained peer and verify it becomes healthy again. This is a
# rolling replacement, not a production topology change.
if [[ "$drain_port" == "$PORT_A" ]]; then http_a="$(start_app "$PORT_A" "$logs/http-a-restarted.log")"; pid_a="$http_a"; replacement="$http_a"; else http_b="$(start_app "$PORT_B" "$logs/http-b-restarted.log")"; pid_b="$http_b"; replacement="$http_b"; fi
# A stopped peer remains in the upstream rotation until fail_timeout expires.
# Wait for that window before declaring the replacement ready at the edge.
sleep 3
wait_http "$drain_port" "$replacement" || { echo "Replacement peer failed readiness." >&2; exit 10; }
for i in $(seq 1 10); do
  curl -fsS --max-time 3 "http://127.0.0.1:$EDGE_PORT/api/health" >/dev/null
done
echo "ROLLING_REPLACEMENT_OK=1 replacement_port=$drain_port"

# SIGKILL the remaining original peer. The replacement peer must keep serving.
if [[ -n "$pid_a" && "$pid_a" != "$replacement" ]]; then killed_pid="$pid_a"; killed_port="$PORT_A"; else killed_pid="$pid_b"; killed_port="$PORT_B"; fi
kill -KILL "$killed_pid"
wait "$killed_pid" 2>/dev/null || true
[[ "$killed_port" == "$PORT_A" ]] && pid_a="" || pid_b=""
for i in $(seq 1 20); do
  curl -fsS --max-time 3 "http://127.0.0.1:$EDGE_PORT/api/health" >/dev/null || { echo "Edge failed after SIGKILL." >&2; exit 11; }
done
echo "SIGKILL_FAILOVER_OK=1 killed_port=$killed_port"

# Verify the surviving replacement still reports healthy and then drain it.
for i in $(seq 1 10); do
  curl -fsS --max-time 3 "http://127.0.0.1:$EDGE_PORT/api/health" >/dev/null
done
echo "NGINX_MULTI_UPSTREAM_DRILL_OK edge_port=$EDGE_PORT upstream_ports=$PORT_A,$PORT_B"
