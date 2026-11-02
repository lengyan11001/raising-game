#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="${ROOT_DIR:-/opt/raising-game-demo}"
BRANCH="${1:-old-site}"
SERVICE="${SERVICE:-raising-game-demo}"

cd "$ROOT_DIR"

if ! git diff --quiet || ! git diff --cached --quiet; then
  echo 'Server has uncommitted tracked changes; reconcile them before deploying.' >&2
  git status --short --untracked-files=no >&2
  exit 25
fi
git checkout "$BRANCH"
git pull --ff-only origin "$BRANCH"

systemctl restart "$SERVICE"
sleep 2
systemctl status "$SERVICE" --no-pager -l | head -25
