#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WATCHDOG_SCRIPT="${RAISING_GAME_WATCHDOG_SCRIPT:-$ROOT_DIR/ops/service-watchdog.sh}"

# The secondary instance is an already-running standby, not the primary
# traffic owner. Its watchdog is observation-only unless an operator has
# explicitly installed the active-mode drop-in. This wrapper never changes the
# primary watchdog or application unit.
exec env \
  HEALTH_URL="${HEALTH_URL:-http://127.0.0.1:4175/api/livez}" \
  SERVICE="${SERVICE:-raising-game-demo-b.service}" \
  SERVICE_CHECK_ACTIVE="${SERVICE_CHECK_ACTIVE:-1}" \
  STATE_FILE="${STATE_FILE:-/run/raising-game-watchdog-b.failures}" \
  LOCK_FILE="${LOCK_FILE:-/run/raising-game-watchdog-b.lock}" \
  RESTART_STATE_FILE="${RESTART_STATE_FILE:-/run/raising-game-watchdog-b.restarts}" \
  RESTART_PENDING_FILE="${RESTART_PENDING_FILE:-/run/raising-game-watchdog-b.restart.pending}" \
  WATCHDOG_DRY_RUN="${WATCHDOG_DRY_RUN:-1}" \
  "$WATCHDOG_SCRIPT"
