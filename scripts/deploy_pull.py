#!/usr/bin/env python3
"""
Deploy the server by pulling from GitHub on the server.

This script intentionally does not upload files. The release flow is:

1. Commit locally.
2. Push to GitHub.
3. SSH to the server.
4. Fast-forward the selected production branch on a clean server worktree
   and restart the systemd service.
"""
from __future__ import annotations

import argparse
import logging
import os
import re
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
    parser.add_argument(
        "--forbid-changed-path",
        action="append",
        default=[],
        help="Reject deployment if the pulled commit range changes this repository-relative path.",
    )
    parser.add_argument(
        "--verify-url",
        action="append",
        default=[],
        help="Fetch this URL after deployment and fail unless it responds successfully. Repeat for multiple surfaces.",
    )
    parser.add_argument(
        "--verify-contains",
        action="append",
        default=[],
        help="Require verified page content. Format: URL=EXPECTED_TEXT. The URL must also be passed to --verify-url.",
    )
    parser.add_argument(
        "--verify-not-contains",
        action="append",
        default=[],
        help="Reject verified page content. Format: URL=UNEXPECTED_TEXT. The URL must also be passed to --verify-url.",
    )
    parser.add_argument("--commit", help="Require the remote checkout to be exactly this commit after deployment.")
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

    forbidden_path_check = "true"
    if args.forbid_changed_path:
        normalized_paths = [path_text.strip("/") for path_text in args.forbid_changed_path if path_text.strip()]
        def path_pattern(path_text: str) -> str:
            return "(^|/)" + re.escape(path_text).replace("\\*", ".*") + "$"

        forbidden_patterns = "|".join(path_pattern(path_text) for path_text in normalized_paths)
        forbidden_display = "\n".join(f"  {path_text}" for path_text in normalized_paths)
        if forbidden_patterns:
            pattern_q = shlex.quote(forbidden_patterns)
            forbidden_path_check = f"""changed_paths=$(git diff --name-only "$remote_head".."origin/{args.branch}")
if printf '%s\n' "$changed_paths" | grep -E -- {pattern_q} >/dev/null; then
  echo 'This deployment target forbids changes to:' >&2
  printf '%s\n' {shlex.quote(forbidden_display)} >&2
  echo 'Changed forbidden paths:' >&2
  printf '%s\n' "$changed_paths" | grep -E -- {pattern_q} >&2 || true
  echo 'Split the release or use the domain-specific deployment target.' >&2
  exit 26
fi
published_paths=$(git diff --name-only "$remote_head" "$(git rev-parse origin/{args.branch})")
if printf '%s\n' "$published_paths" | grep -E -- {pattern_q} >/dev/null; then
  echo 'The published commit forbids changes to:' >&2
  printf '%s\n' {shlex.quote(forbidden_display)} >&2
  echo 'Changed forbidden paths in published commit:' >&2
  printf '%s\n' "$published_paths" | grep -E -- {pattern_q} >&2 || true
  echo 'Split the release or use the domain-specific deployment target.' >&2
  exit 26
fi"""

    verify_contains: dict[str, list[str]] = {}
    verify_not_contains: dict[str, list[str]] = {}
    for option_name, requirements, target_map in (
        ("--verify-contains", args.verify_contains, verify_contains),
        ("--verify-not-contains", args.verify_not_contains, verify_not_contains),
    ):
        for requirement in requirements:
            verify_url, separator, expected_text = str(requirement or "").partition("=")
            if not separator or not verify_url.startswith(("http://", "https://")) or not expected_text:
                raise SystemExit(f"Invalid {option_name} value: {requirement}")
            target_map.setdefault(verify_url, []).append(expected_text)
    verify_urls = list(dict.fromkeys([*args.verify_url, *verify_contains, *verify_not_contains]))
    unknown_verify_urls = [
        verify_url
        for verify_url in [*verify_contains, *verify_not_contains]
        if verify_url not in args.verify_url
    ]
    if unknown_verify_urls:
        raise SystemExit(f"Verification URL must also be passed to --verify-url: {unknown_verify_urls[0]}")
    verification_checks = []
    for verify_url in verify_urls:
        verify_url_q = shlex.quote(verify_url)
        expected_checks = []
        for expected_text in verify_contains.get(verify_url, ()):
            expected_text_q = shlex.quote(expected_text)
            expected_display = expected_text.replace("\\", "\\\\").replace("'", "\\'")
            expected_checks.append(
                f"grep -F -- {expected_text_q} \"$verify_body\" >/dev/null || "
                f"{{ echo \"Verified page missing expected content: {verify_url} => {expected_display}\"; exit 28; }}"
            )
        unexpected_checks = []
        for unexpected_text in verify_not_contains.get(verify_url, ()):
            unexpected_text_q = shlex.quote(unexpected_text)
            unexpected_display = unexpected_text.replace("\\", "\\\\").replace("'", "\\'")
            unexpected_checks.append(
                f"if grep -F -- {unexpected_text_q} \"$verify_body\" >/dev/null; then "
                f"echo \"Verified page contains forbidden content: {verify_url} => {unexpected_display}\"; rm -f \"$verify_body\"; exit 30; fi"
            )
        expected_check = "\n".join([*expected_checks, *unexpected_checks]) or "true"
        verification_checks.append(f"""
verify_body=$(mktemp)
curl -fsSL --max-time 15 {verify_url_q} -o "$verify_body" || {{ echo "Page verification failed: {verify_url}"; rm -f "$verify_body"; exit 27; }}
{expected_check}
rm -f "$verify_body"
echo "Verified page: {verify_url}"
""")
    verification_check = "\n".join(verification_checks) or "true"

    if args.commit:
        expected_q = shlex.quote(args.commit)
        commit_check = f"""deployed_commit=$(git rev-parse HEAD)
if [ "$deployed_commit" != {expected_q} ]; then
  echo "Deployed commit mismatch: expected {args.commit}, got $deployed_commit" >&2
  exit 29
fi"""
    else:
        commit_check = "true"

    command = f"""
set -euo pipefail
cd {args.remote_root}
{env_check}
{required_files_check}
if ! git diff --quiet || ! git diff --cached --quiet; then
  echo 'Server has uncommitted tracked changes; reconcile them before deploying.' >&2
  git status --short --untracked-files=no >&2
  exit 25
fi
git fetch origin {args.branch}
if git show-ref --verify --quiet refs/heads/{args.branch}; then
  git checkout {args.branch}
else
  git checkout -b {args.branch} "origin/{args.branch}"
fi
remote_head=$(git rev-parse HEAD)
{forbidden_path_check}
git pull --ff-only origin {args.branch}
{"true" if args.no_restart else f"systemctl restart {args.service}"}
sleep 2
git status --short
git log -1 --oneline
{"true" if args.no_restart else f"systemctl status {args.service} --no-pager -l | head -25"}
health_code=$(curl -sS --max-time 10 -o /tmp/raising-game-health -w '%{{http_code}}' {args.health_url}) || {{ echo "Health check failed: {args.health_url}"; exit 27; }}
echo "http=$health_code"
cat /tmp/raising-game-health 2>/dev/null || true
echo
if [ "$health_code" != "200" ]; then
  echo "Health check returned HTTP $health_code: {args.health_url}" >&2
  exit 27
fi
{verification_check}
{commit_check}
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
