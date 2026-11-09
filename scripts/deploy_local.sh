#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CREDENTIALS_FILE="${DEPLOY_CREDENTIALS_FILE:-$ROOT_DIR/LOCAL_CREDENTIALS.md}"

if [[ ! -f "$CREDENTIALS_FILE" ]]; then
  echo "Missing local deployment credentials: $CREDENTIALS_FILE" >&2
  exit 1
fi

set -a
# shellcheck disable=SC1090
. "$CREDENTIALS_FILE"
set +a

exec python3 "$ROOT_DIR/scripts/deploy_site.py" "$@"
