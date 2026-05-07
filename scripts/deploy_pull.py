#!/usr/bin/env python3
"""
Deploy the server by pulling from GitHub on the server.

This script intentionally does not upload files. The release flow is:

1. Commit locally.
2. Push to GitHub.
3. SSH to the server.
4. Run scripts/server_pull_deploy.sh, which fetches origin/main and restarts
   the systemd service.
"""
from __future__ import annotations

import argparse
import os

import paramiko


HOST = os.environ.get("FYSHARK_HOST", "101.47.76.188")
USER = os.environ.get("FYSHARK_USER", "root")
PASSWORD = os.environ.get("FYSHARK_SSH_PASSWORD", "")
REMOTE_ROOT = "/opt/raising-game-demo"
SERVICE = "raising-game-demo"


def remote_run(client: paramiko.SSHClient, command: str, timeout: int = 120) -> tuple[int, str, str]:
    _stdin, stdout, stderr = client.exec_command(command, timeout=timeout)
    out = stdout.read().decode("utf-8", errors="replace")
    err = stderr.read().decode("utf-8", errors="replace")
    return stdout.channel.recv_exit_status(), out, err


def main() -> None:
    parser = argparse.ArgumentParser(description="Pull latest GitHub code on the server and restart the app.")
    parser.add_argument("--branch", default="main")
    parser.add_argument("--no-restart", action="store_true")
    args = parser.parse_args()
    if not PASSWORD:
        raise SystemExit("FYSHARK_SSH_PASSWORD is required.")

    command = f"""
set -euo pipefail
cd {REMOTE_ROOT}
git fetch origin {args.branch}
git checkout {args.branch}
git reset --hard origin/{args.branch}
{"true" if args.no_restart else f"systemctl restart {SERVICE}"}
sleep 2
git status --short
git log -1 --oneline
{"true" if args.no_restart else f"systemctl status {SERVICE} --no-pager -l | head -25"}
curl -sS -o /tmp/raising-game-health -w 'http=%{{http_code}}\\n' https://123vips.com/api/health -m 10
cat /tmp/raising-game-health 2>/dev/null || true
echo
"""

    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    print(f"[ssh] connecting {USER}@{HOST}")
    client.connect(HOST, username=USER, password=PASSWORD, timeout=20)
    rc, out, err = remote_run(client, command, timeout=240)
    client.close()
    print(out)
    if err.strip():
        print(err)
    if rc != 0:
        raise SystemExit(rc)


if __name__ == "__main__":
    main()
