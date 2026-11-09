#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
if [[ ! -f "$ROOT_DIR/ops/harden_old_nginx_private_media.py" ]]; then
  ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/.."
fi
SCRIPT="${SCRIPT_PATH:-$ROOT_DIR/ops/harden_old_nginx_private_media.py}"
FILES=(
  /etc/nginx/sites-enabled/default
  /etc/nginx/sites-enabled/123vip.fans
  /etc/nginx/sites-available/default
  /etc/nginx/sites-available/123vip.fans
)
STAMP="$(date +%Y%m%d%H%M%S)"
BACKUP_DIR="/root/raising-game-config-backups"

if [[ "$(id -u)" -ne 0 ]]; then
  echo "Run as root." >&2
  exit 1
fi

mkdir -p "$BACKUP_DIR"
for file in "${FILES[@]}"; do
  [[ -f "$file" ]] && cp -p "$file" "$BACKUP_DIR/$(echo "$file" | sed 's|^/||; s|/|__|g').private-media.${STAMP}"
done

if ! python3 "$SCRIPT" --apply "${FILES[@]}"; then
  echo "private-media hardening failed before nginx validation" >&2
  exit 1
fi

if ! nginx -t; then
  echo "nginx validation failed; restoring private-media backups" >&2
  for file in "${FILES[@]}"; do
    backup="$BACKUP_DIR/$(echo "$file" | sed 's|^/||; s|/|__|g').private-media.${STAMP}"
    [[ -f "$backup" ]] && cp -p "$backup" "$file"
  done
  exit 1
fi

python3 "$SCRIPT" --check "${FILES[@]}"
systemctl reload nginx
echo "nginx private-media hardening applied; Node service was not restarted"
