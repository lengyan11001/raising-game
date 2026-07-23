#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="${ROOT_DIR:-/opt/raising-game-cloudtoken}"
BRANCH="${1:-main}"
SERVICE="${SERVICE:-raising-game-cloudtoken}"

cd "$ROOT_DIR"

export DISPLAY="${DISPLAY:-none}"
export SSH_ASKPASS="${SSH_ASKPASS:-/root/.ssh/github-askpass.sh}"
export SSH_ASKPASS_REQUIRE="${SSH_ASKPASS_REQUIRE:-force}"
export GIT_SSH_COMMAND="${GIT_SSH_COMMAND:-ssh -p 443 -i /root/.ssh/github-maczhuji -o IdentitiesOnly=yes -o StrictHostKeyChecking=accept-new}"

setsid git fetch origin "$BRANCH"
git checkout "$BRANCH"
git reset --hard "origin/$BRANCH"

systemctl restart "$SERVICE"
sleep 2
systemctl status "$SERVICE" --no-pager -l | head -25
