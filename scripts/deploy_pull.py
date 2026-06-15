#!/usr/bin/env python3
"""
Deploy the server by pulling from GitHub on the server.

This script intentionally does not upload files. The release flow is:

1. Commit locally.
2. Push to GitHub.
3. SSH to the server.
4. Run scripts/server_pull_deploy.sh, which fetches the selected production
   branch and restarts the systemd service.
"""
from __future__ import annotations

import argparse
import os

import paramiko


HOST = os.environ.get("FYSHARK_HOST", os.environ.get("DEPLOY_HOST", "101.47.76.188"))
USER = os.environ.get("FYSHARK_USER", os.environ.get("DEPLOY_USER", "root"))
PASSWORD = os.environ.get("FYSHARK_SSH_PASSWORD", os.environ.get("DEPLOY_SSH_PASSWORD", ""))
PORT = int(os.environ.get("FYSHARK_PORT", os.environ.get("DEPLOY_PORT", "22")))
REMOTE_ROOT = os.environ.get("DEPLOY_REMOTE_ROOT", "/opt/raising-game-demo")
SERVICE = os.environ.get("DEPLOY_SERVICE", "raising-game-demo")
HEALTH_URL = os.environ.get("DEPLOY_HEALTH_URL", "https://123vips.com/api/health")
BRANCH = os.environ.get("DEPLOY_BRANCH")


def remote_run(client: paramiko.SSHClient, command: str, timeout: int = 120) -> tuple[int, str, str]:
    _stdin, stdout, stderr = client.exec_command(command, timeout=timeout)
    out = stdout.read().decode("utf-8", errors="replace")
    err = stderr.read().decode("utf-8", errors="replace")
    return stdout.channel.recv_exit_status(), out, err


def main() -> None:
    parser = argparse.ArgumentParser(description="Pull latest GitHub code on the server and restart the app.")
    parser.add_argument(
        "--branch",
        default=BRANCH,
        required=BRANCH is None,
        help="Production branch to deploy, e.g. old-site or cloudtoken. Do not use main for production.",
    )
    parser.add_argument("--remote-root", default=REMOTE_ROOT)
    parser.add_argument("--service", default=SERVICE)
    parser.add_argument("--health-url", default=HEALTH_URL)
    parser.add_argument("--port", type=int, default=PORT)
    parser.add_argument("--no-restart", action="store_true")
    args = parser.parse_args()
    if not PASSWORD:
        raise SystemExit("FYSHARK_SSH_PASSWORD is required.")
    if not args.branch:
        raise SystemExit("--branch is required. Use old-site for 123vips.com or cloudtoken for cloudtoken.ai.")
    if args.branch == "main" and os.environ.get("DEPLOY_ALLOW_MAIN") != "1":
        raise SystemExit("Refusing to deploy main. Use --branch old-site or --branch cloudtoken.")

    command = f"""
set -euo pipefail
cd {args.remote_root}
git fetch origin {args.branch}
git checkout {args.branch}
git reset --hard origin/{args.branch}
{"true" if args.no_restart else f"systemctl restart {args.service}"}
sleep 2
git status --short
git log -1 --oneline
{"true" if args.no_restart else f"systemctl status {args.service} --no-pager -l | head -25"}
curl -sS -o /tmp/raising-game-health -w 'http=%{{http_code}}\\n' {args.health_url} -m 10
cat /tmp/raising-game-health 2>/dev/null || true
echo
"""

    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    print(f"[ssh] connecting {USER}@{HOST}:{args.port}")
    client.connect(HOST, port=args.port, username=USER, password=PASSWORD, timeout=20)
    rc, out, err = remote_run(client, command, timeout=240)
    client.close()
    print(out)
    if err.strip():
        print(err)
    if rc != 0:
        raise SystemExit(rc)


if __name__ == "__main__":
    main()
