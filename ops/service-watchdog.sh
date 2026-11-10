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
RESTART_COMMAND="${RESTART_COMMAND:-}"
WATCHDOG_DRY_RUN="${WATCHDOG_DRY_RUN:-0}"

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

mkdir -p "$(dirname "$STATE_FILE")" "$(dirname "$LOCK_FILE")"
exec 9>"$LOCK_FILE"
if command -v flock >/dev/null 2>&1; then
  flock -n 9 || exit 0
fi

if [[ "$SERVICE_CHECK_ACTIVE" == "1" ]] && ! systemctl is-active --quiet "$SERVICE"; then
  log "service is not active; skipping watchdog service=$SERVICE"
  exit 0
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
  printf '0\n' > "$STATE_FILE"
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
  printf '0\n' > "$STATE_FILE"
  exit 0
fi

log "restarting service=$SERVICE consecutive_failures=$failures"
if [[ -n "$RESTART_COMMAND" ]]; then
  bash -c "$RESTART_COMMAND"
else
  systemctl restart "$SERVICE"
fi
printf '0\n' > "$STATE_FILE"
log "restart command completed service=$SERVICE"
