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
import logging
import os
import shlex

import paramiko


logging.getLogger("paramiko.transport").setLevel(logging.CRITICAL)

HOST = os.environ.get("FYSHARK_HOST", os.environ.get("DEPLOY_HOST", "101.47.76.188"))
USER = os.environ.get("FYSHARK_USER", os.environ.get("DEPLOY_USER", "root"))
PASSWORD = os.environ.get("FYSHARK_SSH_PASSWORD", os.environ.get("DEPLOY_SSH_PASSWORD", ""))
PORT = int(os.environ.get("FYSHARK_PORT", os.environ.get("DEPLOY_PORT", "22")))
REMOTE_ROOT = os.environ.get("DEPLOY_REMOTE_ROOT", "/opt/raising-game-demo")
SERVICE = os.environ.get("DEPLOY_SERVICE", "raising-game-demo")
HEALTH_URL = os.environ.get("DEPLOY_HEALTH_URL", "https://123vips.com/api/health")
BRANCH = os.environ.get("DEPLOY_BRANCH")
ENV_FILE = os.environ.get("DEPLOY_ENV_FILE", "")


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
    parser.add_argument("--env-file", default=ENV_FILE, help="Required systemd EnvironmentFile path for this production service.")
    parser.add_argument("--port", type=int, default=PORT)
    parser.add_argument(
        "--forbid-env-pattern",
        action="append",
        default=[],
        help="Reject deployment if the required env file contains this extended grep pattern.",
    )
    parser.add_argument(
        "--require-env-pattern",
        action="append",
        default=[],
        help="Reject deployment unless the required env file contains this extended grep pattern.",
    )
    parser.add_argument(
        "--require-min-files",
        action="append",
        default=[],
        help="Reject deployment unless PATH contains at least COUNT files. Format: /absolute/path=COUNT",
    )
    parser.add_argument("--no-restart", action="store_true")
    args = parser.parse_args()
    if not PASSWORD:
        raise SystemExit("FYSHARK_SSH_PASSWORD is required.")
    if not args.branch:
        raise SystemExit("--branch is required. Use old-site for 123vips.com or cloudtoken for cloudtoken.ai.")
    if args.branch == "main" and os.environ.get("DEPLOY_ALLOW_MAIN") != "1":
        raise SystemExit("Refusing to deploy main. Use --branch old-site or --branch cloudtoken.")

    env_check = "true"
    if args.env_file:
        service_q = shlex.quote(args.service)
        env_file_q = shlex.quote(args.env_file)
        env_line_q = shlex.quote(f"EnvironmentFile={args.env_file}")
        forbidden_checks = []
        for pattern in args.forbid_env_pattern:
            pattern_q = shlex.quote(pattern)
            forbidden_checks.append(
                f"grep -E -- {pattern_q} {env_file_q} >/dev/null && "
                f"{{ echo \"Forbidden env pattern in {args.env_file}: {pattern}\"; exit 22; }} || true"
            )
        forbidden_env_check = "\n".join(forbidden_checks)
        required_checks = []
        for pattern in args.require_env_pattern:
            pattern_q = shlex.quote(pattern)
            required_checks.append(
                f"grep -E -- {pattern_q} {env_file_q} >/dev/null || "
                f"{{ echo \"Missing required env pattern in {args.env_file}: {pattern}\"; exit 24; }}"
            )
        required_env_check = "\n".join(required_checks)
        env_check = f"""
test -f {env_file_q} || {{ echo "Missing required env file: {args.env_file}"; exit 20; }}
systemctl cat {service_q} | grep -F -- {env_line_q} >/dev/null || {{ echo "Missing systemd EnvironmentFile={args.env_file} in {args.service}"; exit 21; }}
{forbidden_env_check}
{required_env_check}
"""

    required_file_checks = []
    for requirement in args.require_min_files:
        path_text, separator, count_text = str(requirement or "").rpartition("=")
        if not separator or not path_text.startswith("/") or not count_text.isdigit():
            raise SystemExit(f"Invalid --require-min-files value: {requirement}")
        minimum = int(count_text)
        path_q = shlex.quote(path_text)
        required_file_checks.append(
            f"actual_files=$(find {path_q} -type f 2>/dev/null | wc -l); "
            f"test \"$actual_files\" -ge {minimum} || "
            f"{{ echo \"Required media incomplete: {path_text} has $actual_files files, expected at least {minimum}\"; exit 23; }}"
        )
    required_files_check = "\n".join(required_file_checks) or "true"

    command = f"""
set -euo pipefail
cd {args.remote_root}
{env_check}
{required_files_check}
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
    try:
        client.connect(HOST, port=args.port, username=USER, password=PASSWORD, timeout=20)
        rc, out, err = remote_run(client, command, timeout=240)
    except paramiko.SSHException as exc:
        client.close()
        message = str(exc)
        hint = ""
        if "Error reading SSH protocol banner" in message:
            hint = " Host/port accepted TCP but did not present SSH; check sshd, firewall/security group, and DEPLOY_PORT."
        raise SystemExit(f"SSH connection failed: {message}.{hint}") from None
    except Exception as exc:
        client.close()
        raise SystemExit(f"SSH connection failed: {exc}") from None
    client.close()
    print(out)
    if err.strip():
        print(err)
    if rc != 0:
        raise SystemExit(rc)


if __name__ == "__main__":
    main()
