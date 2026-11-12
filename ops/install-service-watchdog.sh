#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
UNIT_DIR="${SYSTEMD_UNIT_DIR:-/etc/systemd/system}"
SYSTEMCTL_BIN="${SYSTEMCTL_BIN:-systemctl}"
SYSTEMD_RUN_BIN="${SYSTEMD_RUN_BIN:-systemd-run}"
SYSTEMD_ANALYZE_BIN="${SYSTEMD_ANALYZE_BIN:-systemd-analyze}"
MODE="${WATCHDOG_INSTALL_MODE:-dry-run}"
START_NOW="${WATCHDOG_START_NOW:-1}"
CONFIRM_ACTIVE="${WATCHDOG_CONFIRM_ACTIVE:-0}"
ALLOW_NONROOT="${WATCHDOG_INSTALL_TEST_MODE:-0}"

SERVICE_NAME="raising-game-watchdog.service"
TIMER_NAME="raising-game-watchdog.timer"
DROPIN_DIR="$UNIT_DIR/$SERVICE_NAME.d"
DROPIN_FILE="$DROPIN_DIR/50-dry-run.conf"
STATE_FILE="${STATE_FILE:-/run/raising-game-watchdog.failures}"
RESTART_STATE_FILE="${RESTART_STATE_FILE:-/run/raising-game-watchdog.restarts}"
RESTART_PENDING_FILE="${RESTART_PENDING_FILE:-/run/raising-game-watchdog.restart.pending}"

usage() {
  cat >&2 <<'USAGE'
Usage: ops/install-service-watchdog.sh [--mode dry-run|active|rollback|status]

Modes:
  dry-run   Install systemd units with WATCHDOG_DRY_RUN=1. No app restart.
  active    Enable actual restart after three consecutive failures. Requires --confirm-active.
  rollback  Disable/remove watchdog units only. The app service is never restarted.
  status    Print watchdog unit/timer state without changing anything.

Safety: this script only operates on raising-game-watchdog.{service,timer}.
USAGE
}

log() {
  printf 'service-watchdog-install %s\n' "$*"
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --mode)
      [[ $# -ge 2 ]] || { usage; exit 2; }
      MODE="$2"
      shift 2
      ;;
    --no-start)
      START_NOW=0
      shift
      ;;
    --confirm-active)
      CONFIRM_ACTIVE=1
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      log "unknown argument: $1"
      usage
      exit 2
      ;;
  esac
done

case "$MODE" in
  dry-run|active|rollback|status) ;;
  *)
    log "invalid mode: $MODE"
    usage
    exit 2
    ;;
esac

if [[ "$MODE" == "active" && "$CONFIRM_ACTIVE" != "1" ]]; then
  log "refusing to enable automatic restarts without --confirm-active"
  exit 2
fi

if [[ "$MODE" != "status" && "$ALLOW_NONROOT" != "1" && "$(id -u)" -ne 0 ]]; then
  log "must run as root for mode=$MODE"
  exit 1
fi

if [[ "$MODE" != "status" && "$(basename "$SYSTEMCTL_BIN")" != "systemctl" && "$ALLOW_NONROOT" != "1" ]]; then
  log "refusing non-systemctl command: $SYSTEMCTL_BIN"
  exit 2
fi
if [[ "$UNIT_DIR" != "/etc/systemd/system" && "$ALLOW_NONROOT" != "1" ]]; then
  log "refusing non-default unit directory without test mode: $UNIT_DIR"
  exit 2
fi

show_status() {
  local enabled active timer_enabled timer_active
  enabled="$($SYSTEMCTL_BIN is-enabled "$SERVICE_NAME" 2>/dev/null || true)"
  active="$($SYSTEMCTL_BIN is-active "$SERVICE_NAME" 2>/dev/null || true)"
  timer_enabled="$($SYSTEMCTL_BIN is-enabled "$TIMER_NAME" 2>/dev/null || true)"
  timer_active="$($SYSTEMCTL_BIN is-active "$TIMER_NAME" 2>/dev/null || true)"
  printf 'service=%s enabled=%s active=%s\n' "$SERVICE_NAME" "${enabled:-unknown}" "${active:-unknown}"
  printf 'timer=%s enabled=%s active=%s\n' "$TIMER_NAME" "${timer_enabled:-unknown}" "${timer_active:-unknown}"
  if [[ -f "$DROPIN_FILE" ]]; then
    printf 'mode=dry-run dropin=%s\n' "$DROPIN_FILE"
  else
    printf 'mode=not-dry-run dropin=absent\n'
  fi
}

if [[ "$MODE" == "status" ]]; then
  show_status
  exit 0
fi

if [[ "$MODE" == "rollback" ]]; then
  log "disabling watchdog timer; application service will not be restarted"
  "$SYSTEMCTL_BIN" disable --now "$TIMER_NAME" >/dev/null 2>&1 || true
  "$SYSTEMCTL_BIN" stop "$SERVICE_NAME" >/dev/null 2>&1 || true
  rm -f "$UNIT_DIR/$TIMER_NAME" "$UNIT_DIR/$SERVICE_NAME"
  rm -rf "$DROPIN_DIR"
  rm -f "$STATE_FILE" "$RESTART_STATE_FILE" "$RESTART_PENDING_FILE"
  "$SYSTEMCTL_BIN" daemon-reload
  "$SYSTEMCTL_BIN" reset-failed "$TIMER_NAME" "$SERVICE_NAME" >/dev/null 2>&1 || true
  log "watchdog units removed; application service was not touched"
  show_status
  exit 0
fi

SOURCE_SERVICE="$ROOT_DIR/ops/systemd/$SERVICE_NAME"
SOURCE_TIMER="$ROOT_DIR/ops/systemd/$TIMER_NAME"
for file in "$SOURCE_SERVICE" "$SOURCE_TIMER" "$ROOT_DIR/ops/service-watchdog.sh"; do
  if [[ ! -f "$file" ]]; then
    log "missing required file: $file"
    exit 1
  fi
done

if [[ "$ALLOW_NONROOT" != "1" ]]; then
  if command -v "$SYSTEMD_ANALYZE_BIN" >/dev/null 2>&1; then
    # Verify from the source directory so the timer can resolve its sibling service.
    (
      cd "$(dirname "$SOURCE_SERVICE")"
      "$SYSTEMD_ANALYZE_BIN" verify "$(basename "$SOURCE_SERVICE")" "$(basename "$SOURCE_TIMER")"
    )
  fi
fi

install_atomic() {
  local source="$1" target="$2" tmp
  tmp="$(mktemp "$target.XXXXXX")"
  install -m 0644 "$source" "$tmp"
  mv -f "$tmp" "$target"
}

install -d -m 0755 "$UNIT_DIR"
install_atomic "$SOURCE_SERVICE" "$UNIT_DIR/$SERVICE_NAME"
install_atomic "$SOURCE_TIMER" "$UNIT_DIR/$TIMER_NAME"

if [[ "$MODE" == "dry-run" ]]; then
  install -d -m 0755 "$DROPIN_DIR"
  cat > "$DROPIN_FILE.tmp" <<'DROPIN'
[Service]
Environment=WATCHDOG_DRY_RUN=1
DROPIN
  chmod 0644 "$DROPIN_FILE.tmp"
  mv -f "$DROPIN_FILE.tmp" "$DROPIN_FILE"
else
  rm -rf "$DROPIN_DIR"
fi

if [[ "$ALLOW_NONROOT" == "1" ]]; then
  log "test mode: units written to $UNIT_DIR; invoking systemctl unchanged"
fi

"$SYSTEMCTL_BIN" daemon-reload
"$SYSTEMCTL_BIN" enable "$TIMER_NAME" >/dev/null
"$SYSTEMCTL_BIN" start "$TIMER_NAME"

if [[ "$START_NOW" == "1" ]]; then
  if [[ "$ALLOW_NONROOT" == "1" ]] && command -v "$SYSTEMD_RUN_BIN" >/dev/null 2>&1; then
    "$SYSTEMD_RUN_BIN" --unit=raising-game-watchdog-test --collect --wait --pipe "$ROOT_DIR/ops/service-watchdog.sh"
  else
    "$SYSTEMCTL_BIN" start "$SERVICE_NAME"
  fi
fi

log "installed mode=$MODE start_now=$START_NOW timer_enabled=1"
show_status
