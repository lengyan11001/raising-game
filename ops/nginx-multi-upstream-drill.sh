#!/usr/bin/env bash
set -euo pipefail
set -E
umask 077

failure_context() {
  local code=$?
  echo "NGINX_DRILL_FAILED line=$LINENO command=$BASH_COMMAND status=$code" >&2
}
trap failure_context ERR

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
#   PORT_A=4181 PORT_B=4182 EDGE_PORT=48080 SWITCH_PORT=4183
#   RUN_ROOT=/tmp/raising-game-nginx-drill
#   PROBE_REQUESTS=80

if [[ "$(id -u)" -ne 0 ]]; then
  echo "Run as root on the isolated Old-host drill environment." >&2
  exit 1
fi

DRILL_DB="${DRILL_DB:-}"
APP_ROOT="${APP_ROOT:-/opt/raising-game-demo}"
SWITCH_SCRIPT="${SWITCH_SCRIPT:-$APP_ROOT/ops/nginx-upstream-switch.py}"
ENV_FILE="${ENV_FILE:-/etc/raising-game-demo.env}"
PORT_A="${PORT_A:-4181}"
PORT_B="${PORT_B:-4182}"
EDGE_PORT="${EDGE_PORT:-48080}"
SWITCH_PORT="${SWITCH_PORT:-4183}"
RUN_ROOT="${RUN_ROOT:-/tmp/raising-game-nginx-drill}"
NGINX_BIN="${NGINX_BIN:-nginx}"
PROBE_REQUESTS="${PROBE_REQUESTS:-80}"

if [[ ! "$DRILL_DB" =~ ^raising_game_nginx_drill_[0-9]{14}$ ]]; then
  echo "DRILL_DB must be a disposable raising_game_nginx_drill_YYYYMMDDHHMMSS database." >&2
  exit 2
fi
for port in "$PORT_A" "$PORT_B" "$EDGE_PORT" "$SWITCH_PORT"; do
  if [[ ! "$port" =~ ^[0-9]+$ ]] || (( port < 1024 || port > 65535 )); then
    echo "Invalid drill port: $port" >&2
    exit 2
  fi
  if ss -ltn "sport = :$port" | grep -q LISTEN; then
    echo "Drill port is already in use: $port" >&2
    exit 3
  fi
done
if [[ "$PORT_A" == "4174" || "$PORT_B" == "4174" || "$EDGE_PORT" == "4174" || "$SWITCH_PORT" == "4174" ]]; then
  echo "The production port 4174 must not be used for this drill." >&2
  exit 2
fi
if [[ ! "$PROBE_REQUESTS" =~ ^[1-9][0-9]*$ ]] || (( PROBE_REQUESTS > 1000 )); then
  echo "PROBE_REQUESTS must be an integer between 1 and 1000." >&2
  exit 2
fi
if [[ ! -d "$APP_ROOT" || ! -f "$APP_ROOT/server.js" || ! -f "$APP_ROOT/ops/run-db-migrations.js" ]]; then
  echo "APP_ROOT is not a release checkout: $APP_ROOT" >&2
  exit 2
fi
if [[ ! -f "$SWITCH_SCRIPT" ]]; then
  echo "SWITCH_SCRIPT does not exist: $SWITCH_SCRIPT" >&2
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
  local status=$?
  local remaining
  set +e
  for pid in "$request_loop_pid" "$nginx_pid" "$pid_a" "$pid_b"; do
    [[ -n "$pid" ]] && kill -TERM "$pid" 2>/dev/null
  done
  for pid in "$request_loop_pid" "$nginx_pid" "$pid_a" "$pid_b"; do
    [[ -n "$pid" ]] && timeout 10 tail --pid="$pid" -f /dev/null 2>/dev/null
  done
  if [[ "$status" -ne 0 && -d "$RUN_ROOT" ]]; then
    failed_root="${RUN_ROOT}-failed-$DRILL_DB"
    rm -rf "$failed_root"
    cp -a "$RUN_ROOT" "$failed_root"
    echo "NGINX_DRILL_FAILURE_LOGS_RETAINED=$failed_root" >&2
  fi
  rm -rf "$RUN_ROOT"
  if ! runuser -u postgres -- dropdb --if-exists -- "$DRILL_DB"; then
    echo "NGINX_DRILL_CLEANUP_FAILED db=$DRILL_DB reason=dropdb" >&2
    [[ "$status" -eq 0 ]] && status=1
  else
    remaining="$(runuser -u postgres -- psql -X -A -t -d postgres -c "SELECT count(*) FROM pg_database WHERE datname = '$DRILL_DB'")"
    if [[ "$remaining" == "0" ]]; then
      echo "NGINX_DRILL_CLEANUP_OK=1 db=$DRILL_DB"
    else
      echo "NGINX_DRILL_CLEANUP_FAILED db=$DRILL_DB remaining=${remaining:-unknown}" >&2
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
if ! DRILL_CONNECTION_RESOLVED="$(DATABASE_URL="$DRILL_DATABASE_URL" node -e '
const { URL } = require("node:url");
try {
  const parsed = new URL(process.env.DATABASE_URL);
  if (!["postgres:", "postgresql:"].includes(parsed.protocol)) process.exit(2);
  const database = decodeURIComponent(parsed.pathname.replace(/^\//, ""));
  const user = decodeURIComponent(parsed.username);
  process.stdout.write(`${user}|${database}`);
} catch {
  process.exit(2);
}
')"; then
  echo "DRILL_DATABASE_URL must be a valid PostgreSQL URL." >&2
  exit 4
fi
IFS='|' read -r DRILL_APP_ROLE DRILL_DB_RESOLVED <<<"$DRILL_CONNECTION_RESOLVED"
if [[ ! "$DRILL_APP_ROLE" =~ ^[a-z_][a-z0-9_]*$ ]]; then
  echo "DRILL_DATABASE_URL must name a valid application role, got: ${DRILL_APP_ROLE:-<empty>}" >&2
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

# A restore performed with --no-owner leaves public objects owned by postgres.
# Reassign only this disposable database so the application role can read the
# catalogs and run schema migrations before any app process is started.
runuser -u postgres -- psql -X -v ON_ERROR_STOP=1 -q -d "$DRILL_DB" <<SQL
ALTER SCHEMA public OWNER TO $DRILL_APP_ROLE;
DO \$\$
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
    EXECUTE format('ALTER TABLE %s OWNER TO $DRILL_APP_ROLE', item.object_name);
  END LOOP;
  -- Linked serial/identity sequences follow their owning table.
  FOR item IN
    SELECT c.oid::regclass AS object_name
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind = 'S'
      AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.objid = c.oid AND d.deptype IN ('a', 'i'))
  LOOP
    EXECUTE format('ALTER SEQUENCE %s OWNER TO $DRILL_APP_ROLE', item.object_name);
  END LOOP;
END
\$\$;
GRANT USAGE, CREATE ON SCHEMA public TO $DRILL_APP_ROLE;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO $DRILL_APP_ROLE;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO $DRILL_APP_ROLE;
SQL
echo "DRILL_APP_ROLE_READY=$DRILL_APP_ROLE"

# A migrated empty database cannot boot this application because required
# runtime catalogs are intentionally PostgreSQL-only. Require a disposable
# copy restored from a populated snapshot before starting Nginx or any app.
catalog_error="$RUN_ROOT/catalog-probe.stderr"
if ! catalog_probe="$(
  psql "$DRILL_DATABASE_URL" -X -A -t -v ON_ERROR_STOP=1 -c "
    SELECT
      to_regclass('public.app_catalog_entries') IS NOT NULL,
      COALESCE((SELECT COUNT(*) FROM app_catalog_entries WHERE catalog = 'ourdream_presets' AND deleted_at IS NULL), 0),
      COALESCE((SELECT COUNT(*) FROM app_catalog_entries WHERE catalog = 'ourdream_actions' AND deleted_at IS NULL), 0),
      COALESCE((SELECT COUNT(*) FROM app_catalog_entries WHERE catalog = 'chat_live_voices' AND scope = 'realtime' AND deleted_at IS NULL), 0),
      COALESCE((SELECT COUNT(*) FROM app_catalog_entries WHERE catalog = 'chat_live_voices' AND scope = 'component' AND deleted_at IS NULL), 0),
      COALESCE((SELECT COUNT(*) FROM app_catalog_entries WHERE catalog = 'showcase_cases' AND deleted_at IS NULL), 0)
  " 2>"$catalog_error"
)"; then
  cat "$catalog_error" >&2
  echo "DRILL_DB must be restored from a populated disposable snapshot; catalog probe failed." >&2
  exit 4
fi
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
schema_error="$RUN_ROOT/schema-privilege-probe.stderr"
if ! schema_privileges="$(
  psql "$DRILL_DATABASE_URL" -X -A -t -v ON_ERROR_STOP=1 -c "
    SELECT has_schema_privilege(current_user, 'public', 'USAGE')
       AND has_schema_privilege(current_user, 'public', 'CREATE')
  " 2>"$schema_error"
)"; then
  cat "$schema_error" >&2
  echo "DRILL_DB schema privilege probe failed." >&2
  exit 4
fi
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
  upstream raising_game_switch_drill {
    server 127.0.0.1:$PORT_A;
    keepalive 16;
  }
  upstream raising_game_txn_app {
    server 127.0.0.1:$PORT_A;
  }
  upstream raising_game_txn_chat {
    server 127.0.0.1:$PORT_A;
  }
  upstream raising_game_txn_live {
    server 127.0.0.1:$PORT_A;
  }
  upstream raising_game_failover_drill {
    server 127.0.0.1:$PORT_A max_fails=1 fail_timeout=2s;
    server 127.0.0.1:$PORT_B backup;
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
    location /txn-app/ {
      proxy_pass http://raising_game_txn_app/api/;
      proxy_http_version 1.1;
      proxy_set_header Host \$host;
      proxy_set_header Connection "";
      proxy_connect_timeout 1s;
      proxy_read_timeout 10s;
      proxy_send_timeout 10s;
    }
    location /txn-chat/ {
      proxy_pass http://raising_game_txn_chat/api/;
      proxy_http_version 1.1;
      proxy_set_header Host \$host;
      proxy_set_header Connection "";
      proxy_connect_timeout 1s;
      proxy_read_timeout 10s;
      proxy_send_timeout 10s;
    }
    location /txn-live/ {
      proxy_pass http://raising_game_txn_live/api/;
      proxy_http_version 1.1;
      proxy_set_header Host \$host;
      proxy_set_header Connection "";
      proxy_connect_timeout 1s;
      proxy_read_timeout 10s;
      proxy_send_timeout 10s;
    }
    location /switch/ {
      proxy_pass http://raising_game_switch_drill/api/;
      proxy_http_version 1.1;
      proxy_set_header Host \$host;
      proxy_set_header X-Real-IP \$remote_addr;
      proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
      proxy_set_header X-Forwarded-Proto \$scheme;
      proxy_set_header Connection "";
      proxy_connect_timeout 1s;
      proxy_read_timeout 10s;
      proxy_send_timeout 10s;
    }
    location /failover/ {
      proxy_pass http://raising_game_failover_drill/api/;
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

# Stop the surviving peer, then restart the drained peer and verify it becomes
# healthy. This proves a rolling replacement can operate with one peer at a
# time; the restarted peer is the only live process before switch testing.
if [[ "$drain_port" == "$PORT_A" ]]; then
  kill -TERM "$pid_b"; wait_exit "$pid_b" || { echo "Peer B did not drain for rolling replacement." >&2; exit 10; }; pid_b=""
  http_a="$(start_app "$PORT_A" "$logs/http-a-restarted.log")"; pid_a="$http_a"; replacement="$http_a"
  wait_http "$PORT_A" "$pid_a" || { cat "$logs/http-a-restarted.log" >&2; echo "Replacement A failed readiness." >&2; exit 10; }
  http_b="$(start_app "$PORT_B" "$logs/http-b-rolling-restored.log")"; pid_b="$http_b"
  wait_http "$PORT_B" "$pid_b" || { cat "$logs/http-b-rolling-restored.log" >&2; echo "Peer B failed readiness after A replacement." >&2; exit 10; }
else
  kill -TERM "$pid_a"; wait_exit "$pid_a" || { echo "Peer A did not drain for rolling replacement." >&2; exit 10; }; pid_a=""
  http_b="$(start_app "$PORT_B" "$logs/http-b-restarted.log")"; pid_b="$http_b"; replacement="$http_b"
  wait_http "$PORT_B" "$pid_b" || { cat "$logs/http-b-restarted.log" >&2; echo "Replacement B failed readiness." >&2; exit 10; }
  http_a="$(start_app "$PORT_A" "$logs/http-a-rolling-restored.log")"; pid_a="$http_a"
  wait_http "$PORT_A" "$pid_a" || { cat "$logs/http-a-rolling-restored.log" >&2; echo "Peer A failed readiness after B replacement." >&2; exit 10; }
fi
# A stopped peer remains in the upstream rotation until fail_timeout expires.
# Wait for that window before declaring the replacement ready at the edge.
sleep 3
wait_http "$drain_port" "$replacement" || { echo "Replacement peer failed readiness." >&2; exit 10; }
for i in $(seq 1 10); do
  curl -fsS --max-time 3 "http://127.0.0.1:$EDGE_PORT/api/health" >/dev/null
done
echo "ROLLING_REPLACEMENT_OK=1 replacement_port=$drain_port"

# Restore both peers before the transaction test. The transaction has one
# healthy source and target, and must be exercised while both listeners are up.
if [[ -z "$pid_a" ]]; then
  http_a="$(start_app "$PORT_A" "$logs/http-a-transaction-restored.log")"; pid_a="$http_a"
  wait_http "$PORT_A" "$pid_a" || { cat "$logs/http-a-transaction-restored.log" >&2; echo "Transaction peer A failed readiness." >&2; exit 10; }
fi
if [[ -z "$pid_b" ]]; then
  http_b="$(start_app "$PORT_B" "$logs/http-b-transaction-restored.log")"; pid_b="$http_b"
  wait_http "$PORT_B" "$pid_b" || { cat "$logs/http-b-transaction-restored.log" >&2; echo "Transaction peer B failed readiness." >&2; exit 10; }
fi

# Verify the controlled switch path independently from emergency failover.
# The drained peer has just been recreated as the rolling replacement, so it
# is the healthy switch source. The control upstream starts on the other peer.
source_port="$drain_port"
[[ "$source_port" == "$PORT_A" ]] && source_pid="$pid_a" || source_pid="$pid_b"
control_port="$PORT_A"
[[ "$control_port" == "$source_port" ]] && control_port="$PORT_B"
for i in $(seq 1 10); do
  curl -fsS --max-time 3 "http://127.0.0.1:$EDGE_PORT/switch/health" >/dev/null
done
switch_log="$logs/upstream-switch.log"
python3 "$SWITCH_SCRIPT" \
  --file "$nginx_prefix/conf/nginx.conf" \
  --upstream raising_game_switch_drill \
  --current-port "$source_port" \
  --next-port "$control_port" \
  --health-url "http://127.0.0.1:$EDGE_PORT/switch/health" \
  --nginx-bin "$NGINX_BIN" \
  --nginx-test-command "$NGINX_BIN -t -p $nginx_prefix -c $nginx_prefix/conf/nginx.conf" \
  --reload-command "$NGINX_BIN -p $nginx_prefix -c $nginx_prefix/conf/nginx.conf -s reload" \
  --apply >"$switch_log" 2>&1
grep -q "UPSTREAM_SWITCH_OK upstream=raising_game_switch_drill port=$control_port" "$switch_log"
cat "$switch_log"
old_pid="$source_pid"
kill -0 "$old_pid" 2>/dev/null || { echo "Switch source process died before switch proof." >&2; exit 10; }
for i in $(seq 1 10); do
  curl -fsS --max-time 3 "http://127.0.0.1:$EDGE_PORT/switch/health" >/dev/null
 done
echo "UPSTREAM_SWITCH_BEFORE_DRAIN_OK=1 from=$source_port to=$control_port source_alive=1"

# Force a health failure after atomic config replacement. The exact old file
# must be restored, Nginx reloaded back, and the old process must still be alive.
rollback_log="$logs/upstream-switch-rollback.log"
if python3 "$SWITCH_SCRIPT" \
  --file "$nginx_prefix/conf/nginx.conf" \
  --upstream raising_game_switch_drill \
  --current-port "$control_port" \
  --next-port 4199 \
  --health-url "http://127.0.0.1:$EDGE_PORT/switch/definitely-not-healthy" \
  --nginx-bin "$NGINX_BIN" \
  --nginx-test-command "$NGINX_BIN -t -p $nginx_prefix -c $nginx_prefix/conf/nginx.conf" \
  --reload-command "$NGINX_BIN -p $nginx_prefix -c $nginx_prefix/conf/nginx.conf -s reload" \
  --apply >"$rollback_log" 2>&1; then
  echo "Expected failed health proof, but switch reported success." >&2
  exit 10
fi
grep -q "UPSTREAM_SWITCH_ROLLBACK files=1" "$rollback_log" || {
  echo "Switch rollback did not report a restored file." >&2
  exit 10
}
if ! grep -q "server 127.0.0.1:$control_port;" "$nginx_prefix/conf/nginx.conf"; then
  echo "Failed switch did not restore the previous upstream." >&2
  exit 10
fi
kill -0 "$old_pid" 2>/dev/null || { echo "Old switch source process died during rollback." >&2; exit 10; }
for i in $(seq 1 10); do
  curl -fsS --max-time 3 "http://127.0.0.1:$EDGE_PORT/api/health" >/dev/null
done
echo "UPSTREAM_SWITCH_ROLLBACK_OK=1 restored_port=$control_port source_alive=1"

# A successful switch reload can leave the previous control source unavailable
# for a few milliseconds. Wait for both transaction paths to be stably healthy
# before replacing the whole file in one transaction.
txn_health_ready=0
for _ in $(seq 1 20); do
  if curl -fsS --max-time 3 "http://127.0.0.1:$EDGE_PORT/txn-app/health" >/dev/null \
    && curl -fsS --max-time 3 "http://127.0.0.1:$EDGE_PORT/txn-chat/health" >/dev/null \
    && curl -fsS --max-time 3 "http://127.0.0.1:$EDGE_PORT/txn-live/health" >/dev/null; then
    txn_health_ready=1
    break
  fi
  sleep 0.25
done
if [[ "$txn_health_ready" != "1" ]]; then
  echo "Transaction preflight failed before config switch." >&2
  echo "txn_ports source=$source_port control=$control_port" >&2
  ss -ltnp | grep -E ":($PORT_A|$PORT_B) " >&2 || true
  tail -n 40 "$logs/http-a-rolling-restored.log" "$logs/http-b-rolling-restored.log" "$logs/http-a-transaction-restored.log" "$logs/http-b-transaction-restored.log" 2>/dev/null >&2 || true
  tail -n 40 "$nginx_prefix/logs/error.log" >&2 || true
  curl -sS -D - --max-time 3 "http://127.0.0.1:$EDGE_PORT/txn-app/health" -o /dev/null >&2 || true
  exit 10
fi

# Production-shaped transaction: all three independently named traffic
# upstreams must move in one file replacement and one Nginx reload. The health
# URLs cover each entry path, so a partial cutover or one unhealthy route must
# roll the whole file back.
txn_log="$logs/upstream-transaction.log"
python3 "$SWITCH_SCRIPT" \
  --file "$nginx_prefix/conf/nginx.conf" \
  --switch "raising_game_txn_app=$source_port:$control_port" \
  --switch "raising_game_txn_chat=$source_port:$control_port" \
  --switch "raising_game_txn_live=$source_port:$control_port" \
  --health-url "http://127.0.0.1:$EDGE_PORT/txn-app/health" \
  --health-url "http://127.0.0.1:$EDGE_PORT/txn-chat/health" \
  --health-url "http://127.0.0.1:$EDGE_PORT/txn-live/health" \
  --nginx-bin "$NGINX_BIN" \
  --nginx-test-command "$NGINX_BIN -t -p $nginx_prefix -c $nginx_prefix/conf/nginx.conf" \
  --reload-command "$NGINX_BIN -p $nginx_prefix -c $nginx_prefix/conf/nginx.conf -s reload" \
  --apply >"$txn_log" 2>&1
cat "$txn_log"
grep -Eq "^UPSTREAM_SWITCH_COMMIT_OK upstreams=3( files=1)? health_urls=3$" "$txn_log"
for upstream in raising_game_txn_app raising_game_txn_chat raising_game_txn_live; do
  grep -q "server 127.0.0.1:$control_port;" "$nginx_prefix/conf/nginx.conf" || { echo "Transaction did not switch $upstream." >&2; exit 10; }
done
for path in txn-app txn-chat txn-live; do
  curl -fsS --max-time 3 "http://127.0.0.1:$EDGE_PORT/$path/health" >/dev/null
done
old_txn_pid="$source_pid"
if ! kill -0 "$old_txn_pid" 2>/dev/null; then
  echo "Rolling replacement died during transaction switch." >&2
  echo "old_txn_pid=$old_txn_pid source_port=$source_port control_port=$control_port" >&2
  ss -ltnp | grep -E ":($PORT_A|$PORT_B) " >&2 || true
  ps -eo pid,ppid,stat,lstart,cmd | grep -E "node server.js|PID" | grep -v grep >&2 || true
  tail -n 80 "$logs/http-a.log" "$logs/http-b.log" "$logs/http-a-restarted.log" "$logs/http-b-rolling-restored.log" "$logs/http-a-rolling-restored.log" "$logs/http-b-restarted.log" "$logs/http-a-transaction-restored.log" "$logs/http-b-transaction-restored.log" 2>/dev/null >&2 || true
  dmesg -T 2>/dev/null | grep -Ei 'out of memory|killed process|oom' | tail -n 20 >&2 || true
  exit 10
fi
echo "UPSTREAM_TRANSACTION_SWITCH_OK=1 upstreams=3 port=$control_port source_alive=1"

# A single bad route must restore all three upstream members together.
txn_rollback_log="$logs/upstream-transaction-rollback.log"
if python3 "$SWITCH_SCRIPT" \
  --file "$nginx_prefix/conf/nginx.conf" \
  --switch "raising_game_txn_app=$control_port:$source_port" \
  --switch "raising_game_txn_chat=$control_port:$source_port" \
  --switch "raising_game_txn_live=$control_port:$source_port" \
  --health-url "http://127.0.0.1:$EDGE_PORT/txn-app/health" \
  --health-url "http://127.0.0.1:$EDGE_PORT/txn-chat/definitely-not-healthy" \
  --health-url "http://127.0.0.1:$EDGE_PORT/txn-live/health" \
  --nginx-bin "$NGINX_BIN" \
  --nginx-test-command "$NGINX_BIN -t -p $nginx_prefix -c $nginx_prefix/conf/nginx.conf" \
  --reload-command "$NGINX_BIN -p $nginx_prefix -c $nginx_prefix/conf/nginx.conf -s reload" \
  --apply >"$txn_rollback_log" 2>&1; then
  echo "Expected transaction health failure, but switch reported success." >&2
  exit 10
fi
cat "$txn_rollback_log"
for upstream in raising_game_txn_app raising_game_txn_chat raising_game_txn_live; do
  grep -q "server 127.0.0.1:$control_port;" "$nginx_prefix/conf/nginx.conf" || { echo "Transaction rollback lost $upstream." >&2; exit 10; }
done
grep -q "UPSTREAM_SWITCH_ROLLBACK files=1" "$txn_rollback_log" || {
  echo "Transaction rollback did not report a restored file." >&2
  exit 10
}
for path in txn-app txn-chat txn-live; do
  curl -fsS --max-time 3 "http://127.0.0.1:$EDGE_PORT/$path/health" >/dev/null
done
echo "UPSTREAM_TRANSACTION_ROLLBACK_OK=1 upstreams=3 restored_port=$control_port"

# Automatic primary/backup takeover: while both peers are alive, only the
# primary serves the dedicated edge. After SIGKILL the backup must take over
# without a configuration reload. The steady probe includes the transition, so
# a failed or incomplete failover cannot be hidden by a later success.
failover_probe_log="$logs/edge-backup-failover-probe.log"
(
  ok=0
  failed=0
  for _ in $(seq 1 "$PROBE_REQUESTS"); do
    if curl -fsS --max-time 3 "http://127.0.0.1:$EDGE_PORT/failover/health" >/dev/null 2>&1; then
      ok=$((ok + 1))
    else
      failed=$((failed + 1))
    fi
    sleep 0.05
  done
  printf 'EDGE_BACKUP_FAILOVER_PROBE_OK requests=%s failures=%s\n' "$ok" "$failed"
) >"$failover_probe_log" 2>&1 &
failover_probe_pid=$!
sleep 0.75
kill -KILL "$pid_a"
wait "$pid_a" 2>/dev/null || true
pid_a=""
wait "$failover_probe_pid"
cat "$failover_probe_log"
grep -qx "EDGE_BACKUP_FAILOVER_PROBE_OK requests=$PROBE_REQUESTS failures=0" "$failover_probe_log" || {
  echo "Nginx backup did not absorb the primary SIGKILL without failed requests." >&2
  exit 11
}
for i in $(seq 1 20); do
  curl -fsS --max-time 3 "http://127.0.0.1:$EDGE_PORT/failover/health" >/dev/null
done
echo "AUTOMATIC_BACKUP_FAILOVER_OK=1 killed_primary=$PORT_A surviving_backup=$PORT_B"

# A live port with an unresponsive process is different from a dead port.
# Verify that Nginx's backup member is exercised by an upstream timeout too.
# Restore a live primary first because the SIGKILL probe above left it down.
http_a="$(start_app "$PORT_A" "$logs/http-a-stop-recovery.log")"
pid_a="$http_a"
wait_http "$PORT_A" "$http_a" || { cat "$logs/http-a-stop-recovery.log" >&2; echo "Primary did not restart before freeze test" >&2; exit 11; }
curl -fsS --max-time 3 "http://127.0.0.1:$EDGE_PORT/failover/health" >/dev/null
kill -STOP "$pid_a" 2>/dev/null || true
stop_failures=0
for _ in $(seq 1 10); do
  curl -fsS --max-time 3 "http://127.0.0.1:$EDGE_PORT/failover/health" >/dev/null || stop_failures=$((stop_failures + 1))
done
kill -CONT "$pid_a" 2>/dev/null || true
wait_http "$PORT_A" "$pid_a" || { echo "Stopped primary did not recover" >&2; exit 11; }
(( stop_failures == 0 )) || { echo "Backup did not absorb an event-loop freeze (failures=$stop_failures)." >&2; exit 11; }
echo "AUTOMATIC_BACKUP_STOP_TAKEOVER_OK=1 frozen_primary=$PORT_A backup=$PORT_B"

# Require the backup to stop receiving traffic once the primary is healthy
# again. This tests recovery without leaving a sticky split-brain rotation.
# Recreate the primary after the freeze so all of its event-loop state is clean.
kill -KILL "$pid_a" 2>/dev/null || true
wait "$pid_a" 2>/dev/null || true
http_a="$(start_app "$PORT_A" "$logs/http-a-failover-recovered.log")"
pid_a="$http_a"
wait_http "$PORT_A" "$http_a" || { cat "$logs/http-a-failover-recovered.log" >&2; echo "Recovered primary failed readiness" >&2; exit 11; }
sleep 3
for i in $(seq 1 20); do
  curl -fsS --max-time 3 "http://127.0.0.1:$EDGE_PORT/failover/health" >/dev/null
done
kill -KILL "$pid_b"
wait "$pid_b" 2>/dev/null || true
pid_b=""
for i in $(seq 1 20); do
  curl -fsS --max-time 3 "http://127.0.0.1:$EDGE_PORT/failover/health" >/dev/null
done
echo "PRIMARY_RECOVERY_WITHOUT_BACKUP_OK=1 primary=$PORT_A stopped_backup=$PORT_B"

# Restore the backup for the remaining rolling and crash tests.
http_b="$(start_app "$PORT_B" "$logs/http-b-failover-recovered.log")"
pid_b="$http_b"
wait_http "$PORT_B" "$http_b" || { cat "$logs/http-b-failover-recovered.log" >&2; echo "Recovered backup failed readiness" >&2; exit 11; }
sleep 3
echo "BACKUP_RESTORED_OK=1 port=$PORT_B"

# SIGKILL the remaining original peer while a steady request loop runs through
# the disposable Nginx edge. A successful failover means every request returns
# HTTP 200; a request that reaches the dead peer must be retried successfully.
if [[ -n "$pid_a" && "$pid_a" != "$replacement" ]]; then killed_pid="$pid_a"; killed_port="$PORT_A"; else killed_pid="$pid_b"; killed_port="$PORT_B"; fi
probe_log="$logs/edge-sigkill-probe.log"
(
  ok=0
  failed=0
  for _ in $(seq 1 "$PROBE_REQUESTS"); do
    if curl -fsS --max-time 3 "http://127.0.0.1:$EDGE_PORT/api/health" >/dev/null 2>&1; then
      ok=$((ok + 1))
    else
      failed=$((failed + 1))
    fi
    sleep 0.05
  done
  printf 'EDGE_SIGKILL_PROBE_OK requests=%s failures=%s\n' "$ok" "$failed"
) >"$probe_log" 2>&1 &
probe_pid=$!
sleep 0.75
kill -KILL "$killed_pid"
wait "$killed_pid" 2>/dev/null || true
[[ "$killed_port" == "$PORT_A" ]] && pid_a="" || pid_b=""
wait "$probe_pid"
cat "$probe_log"
grep -qx "EDGE_SIGKILL_PROBE_OK requests=$PROBE_REQUESTS failures=0" "$probe_log" || {
  echo "Edge had failed or incomplete requests after SIGKILL." >&2
  exit 11
}
echo "SIGKILL_FAILOVER_OK=1 killed_port=$killed_port"

# Verify the surviving replacement still reports healthy and then drain it.
for i in $(seq 1 10); do
  curl -fsS --max-time 3 "http://127.0.0.1:$EDGE_PORT/api/health" >/dev/null
done
echo "NGINX_MULTI_UPSTREAM_DRILL_OK edge_port=$EDGE_PORT upstream_ports=$PORT_A,$PORT_B"
