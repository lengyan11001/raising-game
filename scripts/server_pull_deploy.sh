#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="${ROOT_DIR:-/opt/raising-game-demo}"
BRANCH="${1:-main}"
SERVICE="${SERVICE:-raising-game-demo}"

cd "$ROOT_DIR"

git fetch origin "$BRANCH"
git checkout "$BRANCH"
git reset --hard "origin/$BRANCH"

systemctl restart "$SERVICE"
sleep 2
systemctl status "$SERVICE" --no-pager -l | head -25
