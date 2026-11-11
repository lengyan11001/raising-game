#!/usr/bin/env bash
set -euo pipefail

HEALTH_URL="${HEALTH_URL:-http://127.0.0.1:4174/api/livez}"
FAILURE_THRESHOLD="${FAILURE_THRESHOLD:-3}"
TIMEOUT_SECONDS="${TIMEOUT_SECONDS:-3}"
STATE_FILE="${STATE_FILE:-/run/raising-game-watchdog.failures}"
LOCK_FILE="${LOCK_FILE:-/run/raising-game-watchdog.lock}"
SERVICE="${SERVICE:-raising-game-demo}"
SERVICE_CHECK_ACTIVE="${SERVICE_CHECK_ACTIVE:-0}"
CURL_BIN="${CURL_BIN:-curl}"
SYSTEMCTL_BIN="${SYSTEMCTL_BIN:-systemctl}"
UPTIME_FILE="${UPTIME_FILE:-/proc/uptime}"
RESTART_COMMAND="${RESTART_COMMAND:-}"
WATCHDOG_DRY_RUN="${WATCHDOG_DRY_RUN:-0}"
WARMUP_SECONDS="${WARMUP_SECONDS:-45}"
RESTART_COOLDOWN_SECONDS="${RESTART_COOLDOWN_SECONDS:-60}"
RESTART_BACKOFF_MAX_SECONDS="${RESTART_BACKOFF_MAX_SECONDS:-900}"
RESTART_MAX_PER_HOUR="${RESTART_MAX_PER_HOUR:-3}"
RESTART_STATE_FILE="${RESTART_STATE_FILE:-/run/raising-game-watchdog.restarts}"
RESTART_PENDING_FILE="${RESTART_PENDING_FILE:-/run/raising-game-watchdog.restart.pending}"
SIGKILL_AFTER_SECONDS="${SIGKILL_AFTER_SECONDS:-15}"

log() {
  printf '%s service-watchdog %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ 2>/dev/null || printf unknown-time)" "$*" >&2
}

if [[ ! "$FAILURE_THRESHOLD" =~ ^[1-9][0-9]*$ ]]; then
  log "invalid FAILURE_THRESHOLD=$FAILURE_THRESHOLD"
  exit 2
fi
if [[ ! "$TIMEOUT_SECONDS" =~ ^[1-9][0-9]*$ ]]; then
  log "invalid TIMEOUT_SECONDS=$TIMEOUT_SECONDS"
  exit 2
fi
for value_name in WARMUP_SECONDS RESTART_COOLDOWN_SECONDS RESTART_BACKOFF_MAX_SECONDS RESTART_MAX_PER_HOUR SIGKILL_AFTER_SECONDS; do
  value="${!value_name}"
  if [[ ! "$value" =~ ^[0-9]+$ ]]; then
    log "invalid ${value_name}=${value}"
    exit 2
  fi
done
if [[ "$RESTART_MAX_PER_HOUR" -lt 1 ]]; then
  log "invalid RESTART_MAX_PER_HOUR=$RESTART_MAX_PER_HOUR"
  exit 2
fi

mkdir -p "$(dirname "$STATE_FILE")" "$(dirname "$LOCK_FILE")" "$(dirname "$RESTART_STATE_FILE")" "$(dirname "$RESTART_PENDING_FILE")"
exec 9>"$LOCK_FILE"
if command -v flock >/dev/null 2>&1; then
  flock -n 9 || exit 0
fi

now_epoch() {
  date +%s
}

reset_failures() {
  printf '0\n' > "$STATE_FILE"
}

service_uptime_seconds() {
  local start_us uptime_seconds
  start_us="$("$SYSTEMCTL_BIN" show "$SERVICE" -p ExecMainStartTimestampMonotonic --value 2>/dev/null || true)"
  [[ "$start_us" =~ ^[0-9]+$ ]] || return 1
  [[ -r "$UPTIME_FILE" ]] || return 1
  uptime_seconds="$(awk '{print int($1)}' "$UPTIME_FILE" 2>/dev/null || true)"
  [[ "$uptime_seconds" =~ ^[0-9]+$ ]] || return 1
  printf '%s\n' "$((uptime_seconds - start_us / 1000000))"
}

prune_restart_history() {
  local cutoff now
  [[ -f "$RESTART_STATE_FILE" ]] || return 0
  now="$(now_epoch)"
  cutoff=$((now - 3600))
  awk -v cutoff="$cutoff" '$1 ~ /^[0-9]+$/ && $1 >= cutoff' "$RESTART_STATE_FILE" > "$RESTART_STATE_FILE.tmp"
  mv -f "$RESTART_STATE_FILE.tmp" "$RESTART_STATE_FILE"
}

restart_count() {
  if [[ -f "$RESTART_STATE_FILE" ]]; then
    wc -l < "$RESTART_STATE_FILE" | tr -d ' '
  else
    printf '0\n'
  fi
}

last_restart_epoch() {
  [[ -s "$RESTART_STATE_FILE" ]] && tail -n 1 "$RESTART_STATE_FILE" || true
}

restart_backoff_seconds() {
  local count base exponent delay
  count="$(restart_count)"
  base="$RESTART_COOLDOWN_SECONDS"
  if [[ "$count" -lt 1 ]]; then
    printf '0\n'
    return 0
  fi
  exponent=$((count - 1))
  if [[ "$exponent" -gt 20 ]]; then
    exponent=20
  fi
  delay=$((base * (1 << exponent)))
  if [[ "$delay" -gt "$RESTART_BACKOFF_MAX_SECONDS" ]]; then
    delay="$RESTART_BACKOFF_MAX_SECONDS"
  fi
  printf '%s\n' "$delay"
}

record_restart_request() {
  local pid="${1:-}"
  printf '%s\n' "$(now_epoch)" >> "$RESTART_STATE_FILE"
  printf '%s %s\n' "$(now_epoch)" "$pid" > "$RESTART_PENDING_FILE"
}

service_main_pid() {
  "$SYSTEMCTL_BIN" show "$SERVICE" -p MainPID --value 2>/dev/null | tr -d '[:space:]'
}

force_kill_stuck_main_pid() {
  local pending_epoch pending_pid current_pid now elapsed
  [[ -n "$RESTART_COMMAND" ]] && return 0
  [[ -f "$RESTART_PENDING_FILE" ]] || return 0
  read -r pending_epoch pending_pid < "$RESTART_PENDING_FILE" || return 0
  [[ "$pending_epoch" =~ ^[0-9]+$ && "$pending_pid" =~ ^[1-9][0-9]*$ ]] || {
    log "force-kill skipped reason=invalid_pending_marker"
    return 0
  }
  now="$(now_epoch)"
  elapsed=$((now - pending_epoch))
  [[ "$elapsed" -ge "$SIGKILL_AFTER_SECONDS" ]] || return 0
  current_pid="$(service_main_pid || true)"
  if [[ ! "$current_pid" =~ ^[1-9][0-9]*$ ]]; then
    log "force-kill skipped reason=no_live_main_pid service=$SERVICE pending_pid=$pending_pid"
    rm -f "$RESTART_PENDING_FILE"
    return 0
  fi
  if [[ "$current_pid" != "$pending_pid" ]]; then
    log "force-kill skipped reason=main_pid_changed service=$SERVICE pending_pid=$pending_pid current_pid=$current_pid"
    rm -f "$RESTART_PENDING_FILE"
    return 0
  fi
  if "$CURL_BIN" --silent --show-error --fail --max-time "$TIMEOUT_SECONDS" "$HEALTH_URL" >/dev/null; then
    log "force-kill deferred reason=health_recovered service=$SERVICE pid=$current_pid stuck_seconds=$elapsed"
    return 0
  fi
  log "force-kill requested service=$SERVICE pid=$current_pid stuck_seconds=$elapsed signal=SIGKILL"
  if ! "$SYSTEMCTL_BIN" kill --kill-who=main --signal=SIGKILL "$SERVICE"; then
    log "force-kill dispatch failed service=$SERVICE pid=$current_pid"
    return 1
  fi
  log "force-kill dispatched service=$SERVICE pid=$current_pid; systemd will restart"
}

restart_suppressed() {
  local reason="$1" detail="$2"
  log "restart suppressed reason=$reason service=$SERVICE consecutive_failures=$failures $detail"
  reset_failures
  exit 0
}

if [[ "$SERVICE_CHECK_ACTIVE" == "1" ]] && ! "$SYSTEMCTL_BIN" is-active --quiet "$SERVICE"; then
  log "service is not active; skipping watchdog service=$SERVICE"
  exit 0
fi

if [[ "$WATCHDOG_DRY_RUN" != "1" ]]; then
  force_kill_stuck_main_pid || exit 1
fi

if [[ "$SERVICE_CHECK_ACTIVE" == "1" ]]; then
  uptime_seconds="$(service_uptime_seconds || true)"
  if [[ "$uptime_seconds" =~ ^[0-9]+$ ]] && [[ "$uptime_seconds" -lt "$WARMUP_SECONDS" ]]; then
    log "service warm-up grace service=$SERVICE uptime_seconds=$uptime_seconds warmup_seconds=$WARMUP_SECONDS"
    reset_failures
    exit 0
  fi
fi

failures=0
if [[ -f "$STATE_FILE" ]]; then
  failures="$(tr -dc '0-9' < "$STATE_FILE" || true)"
  failures="${failures:-0}"
fi

if "$CURL_BIN" --silent --show-error --fail --max-time "$TIMEOUT_SECONDS" "$HEALTH_URL" >/dev/null; then
  if [[ "$failures" -ne 0 ]]; then
    log "recovered url=$HEALTH_URL previous_failures=$failures"
  fi
  if [[ -f "$RESTART_PENDING_FILE" ]]; then
    read -r pending_epoch pending_pid < "$RESTART_PENDING_FILE" || true
    if [[ ! "$pending_pid" =~ ^[1-9][0-9]*$ || "$(service_main_pid || true)" != "$pending_pid" ]]; then
      log "post-restart health recovered service=$SERVICE"
      rm -f "$RESTART_PENDING_FILE"
    fi
  fi
  reset_failures
  exit 0
fi

failures=$((failures + 1))
printf '%s\n' "$failures" > "$STATE_FILE"
log "health check failed url=$HEALTH_URL consecutive_failures=$failures threshold=$FAILURE_THRESHOLD"

if [[ "$failures" -lt "$FAILURE_THRESHOLD" ]]; then
  exit 0
fi

if [[ "$WATCHDOG_DRY_RUN" == "1" ]]; then
  log "dry-run would restart service=$SERVICE consecutive_failures=$failures"
  # Re-arm after reporting so observation does not emit the same alert every timer tick.
  reset_failures
  exit 0
fi

prune_restart_history
attempts_last_hour="$(restart_count)"
if [[ "$attempts_last_hour" -ge "$RESTART_MAX_PER_HOUR" ]]; then
  restart_suppressed hourly_limit "attempts_last_hour=$attempts_last_hour limit=$RESTART_MAX_PER_HOUR"
fi

last_restart="$(last_restart_epoch)"
if [[ "$last_restart" =~ ^[0-9]+$ ]]; then
  now="$(now_epoch)"
  elapsed=$((now - last_restart))
  cooldown="$(restart_backoff_seconds)"
  if [[ "$elapsed" -lt "$cooldown" ]]; then
    restart_suppressed cooldown "elapsed_seconds=$elapsed cooldown_seconds=$cooldown"
  fi
fi

main_pid_before_restart="$(service_main_pid || true)"
[[ "$main_pid_before_restart" =~ ^[1-9][0-9]*$ ]] || main_pid_before_restart=""
log "restart requested service=$SERVICE consecutive_failures=$failures async=1 main_pid=$main_pid_before_restart"
if [[ -n "$RESTART_COMMAND" ]]; then
  if ! bash -c "$RESTART_COMMAND"; then
    record_restart_request "$main_pid_before_restart"
    reset_failures
    log "restart dispatch failed service=$SERVICE; cooldown will prevent a tight retry loop"
    exit 1
  fi
else
  if ! "$SYSTEMCTL_BIN" --no-block restart "$SERVICE"; then
    record_restart_request "$main_pid_before_restart"
    reset_failures
    log "restart dispatch failed service=$SERVICE; cooldown will prevent a tight retry loop"
    exit 1
  fi
fi
record_restart_request "$main_pid_before_restart"
reset_failures
log "restart queued service=$SERVICE; waiting for post-restart health force_kill_after_seconds=$SIGKILL_AFTER_SECONDS"
