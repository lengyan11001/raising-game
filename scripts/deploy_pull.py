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
import subprocess
import sys
from pathlib import Path

import paramiko


logging.getLogger("paramiko.transport").setLevel(logging.CRITICAL)

HOST = os.environ.get("FYSHARK_HOST", os.environ.get("DEPLOY_HOST", "101.47.76.188"))
USER = os.environ.get("FYSHARK_USER", os.environ.get("DEPLOY_USER", "root"))
PASSWORD = os.environ.get("FYSHARK_SSH_PASSWORD", os.environ.get("DEPLOY_SSH_PASSWORD", ""))
PORT = int(os.environ.get("FYSHARK_PORT", os.environ.get("DEPLOY_PORT", "22")))
REMOTE_ROOT = os.environ.get("DEPLOY_REMOTE_ROOT", "/opt/raising-game-demo")
REPO_URL = os.environ.get("DEPLOY_REPO_URL", "")
SERVICE = os.environ.get("DEPLOY_SERVICE", "raising-game-demo")
HEALTH_URL = os.environ.get("DEPLOY_HEALTH_URL", "https://123vips.com/api/health")
BRANCH = os.environ.get("DEPLOY_BRANCH")
ENV_FILE = os.environ.get("DEPLOY_ENV_FILE", "")


def changed_paths_for_release(repo_root: str | Path, base_ref: str, target_ref: str) -> list[str]:
    """Return every path changed in base_ref..target_ref, independent of current checkout."""
    result = subprocess.run(
        ["git", "log", "--format=", "--name-only", f"{base_ref}..{target_ref}"],
        cwd=Path(repo_root),
        check=True,
        capture_output=True,
        text=True,
    )
    return sorted({line.strip() for line in result.stdout.splitlines() if line.strip()})


def changed_entries_for_release(repo_root: str | Path, base_ref: str, target_ref: str) -> list[tuple[str, str]]:
    """Return (status, path) pairs changed in base_ref..target_ref.

    A release branch may remove files owned by another surface when creating its
    clean root. It may never add, modify, copy, or rename them back in.
    """
    result = subprocess.run(
        ["git", "log", "--format=", "--name-status", f"{base_ref}..{target_ref}"],
        cwd=Path(repo_root),
        check=True,
        capture_output=True,
        text=True,
    )
    entries: list[tuple[str, str]] = []
    for line in result.stdout.splitlines():
        parts = line.strip().split("\t")
        if len(parts) < 2:
            continue
        status = parts[0]
        # For renames/copies only the destination is a change to this release.
        # Deleting a foreign-owned source path is allowed; introducing any
        # destination path into this history is not.
        path_text = parts[-1]
        entries.append((status, path_text))
    return sorted(set(entries))


def release_path_pattern(path_pattern: str) -> re.Pattern[str]:
    """Compile a repository-relative release pattern with ** and * support."""
    escaped = re.escape(pattern_path := path_pattern.strip("/"))
    escaped = escaped.replace(r"\*\*", "__DOUBLE_STAR__").replace(r"\*", "[^/]*")
    escaped = escaped.replace("__DOUBLE_STAR__", ".*")
    if not escaped:
        raise ValueError("Release boundary patterns cannot be empty.")
    return re.compile(rf"^{escaped}$")


def forbidden_release_paths(changed_paths: list[str], forbidden_patterns: list[str]) -> list[str]:
    """Return changed paths matching any release-boundary pattern."""
    compiled = [release_path_pattern(pattern) for pattern in forbidden_patterns]
    matched = [
        path_text
        for path_text in sorted(set(changed_paths))
        if any(regex.match(path_text) for regex in compiled)
    ]
    return matched


def forbidden_release_entries(
    changed_entries: list[tuple[str, str]],
    forbidden_patterns: list[str],
) -> list[str]:
    """Return forbidden paths that were added, modified, copied, or renamed back in."""
    candidates: list[str] = []
    for status, path_text in changed_entries:
        if status.startswith("D"):
            continue
        # For renames/copies, destination paths are checked. The source path is
        # harmless when a foreign-owned path is being removed.
        candidates.append(path_text)
    return forbidden_release_paths(candidates, forbidden_patterns)


def enforce_local_release_audit(
    repo_root: str | Path,
    branch: str,
    audit_base: str | None,
    forbidden_patterns: list[str],
) -> list[str]:
    """Fail before SSH if the target release history crosses its ownership boundary."""
    if not forbidden_patterns:
        return []
    root = Path(repo_root)
    fetch_refs = [branch, *([audit_base] if audit_base else [])]
    subprocess.run(["git", "fetch", "origin", *fetch_refs], cwd=root, check=True)
    target_ref = f"origin/{branch}"
    if audit_base:
        base_ref = f"origin/{audit_base}"
    else:
        roots = subprocess.run(
            ["git", "rev-list", "--max-parents=0", target_ref],
            cwd=root,
            check=True,
            capture_output=True,
            text=True,
        ).stdout.split()
        if not roots:
            raise SystemExit("Release audit base is missing.")
        base_ref = roots[0]
    changed_entries = changed_entries_for_release(root, base_ref, target_ref)
    matched = forbidden_release_entries(changed_entries, forbidden_patterns)
    if matched:
        print("This deployment target forbids these paths anywhere in its release history:", file=sys.stderr)
        for pattern in forbidden_patterns:
            print(f"  {pattern}", file=sys.stderr)
        print("Forbidden paths in release history:", file=sys.stderr)
        for path_text in matched:
            print(f"  {path_text}", file=sys.stderr)
        print("Move that work to its own release branch; do not publish it through this target.", file=sys.stderr)
        raise SystemExit(26)
    return sorted({path_text for _status, path_text in changed_entries})


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
    parser.add_argument(
        "--bootstrap-clone-url",
        default=REPO_URL,
        help="Clone this Git URL into --remote-root when the release checkout does not exist yet.",
    )
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
        help="Reject deployment if any commit reachable from the target ref changes this repository-relative path.",
    )
    parser.add_argument(
        "--audit-base",
        help="Git ref used as the immutable release boundary. Every commit in AUDIT_BASE..origin/BRANCH must be in scope.",
    )
    parser.add_argument(
        "--pre-restart-command",
        action="append",
        default=[],
        help="Run this command inside REMOTE_ROOT after pulling but before restarting the service.",
    )
    parser.add_argument(
        "--verify-url",
        action="append",
        default=[],
        help="Check this URL after deployment. Repeat for multiple surfaces.",
    )
    parser.add_argument(
        "--verify-status",
        action="append",
        default=[],
        help="Require an exact HTTP status. Format: URL=CODE. The URL must also be passed to --verify-url.",
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
        raise SystemExit("--branch is required. Use platform-release for 123vips.com, live-release for live.123vipeak.com, or cloudtoken for cloudtoken.ai.")
    if args.branch in {"main", "old-site"} and os.environ.get("DEPLOY_ALLOW_INTEGRATION_BRANCH") != "1":
        raise SystemExit("Refusing to deploy an integration branch. Use platform-release or live-release.")
    normalized_forbidden_paths = [path_text.strip("/") for path_text in args.forbid_changed_path if path_text.strip()]
    enforce_local_release_audit(
        Path(__file__).resolve().parent.parent,
        args.branch,
        args.audit_base,
        normalized_forbidden_paths,
    )

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
        normalized_paths = normalized_forbidden_paths
        def path_pattern(path_text: str) -> str:
            return "(^|/)" + re.escape(path_text).replace("\\*", ".*") + "$"

        forbidden_patterns = "|".join(path_pattern(path_text) for path_text in normalized_paths)
        forbidden_display = "\n".join(f"  {path_text}" for path_text in normalized_paths)
        if forbidden_patterns:
            pattern_q = shlex.quote(forbidden_patterns)
            audit_base_q = shlex.quote(f"origin/{args.audit_base}" if args.audit_base else "")
            if args.audit_base:
                base_check = f"""git rev-parse --verify {audit_base_q}^{{commit}} >/dev/null || {{ echo 'Missing release audit base: origin/{args.audit_base}' >&2; exit 31; }}
release_base=$(git rev-parse {audit_base_q}^{{commit}})
git merge-base --is-ancestor "$release_base" "origin/{args.branch}" || {{ echo 'Audit base is not an ancestor of target branch.' >&2; exit 31; }}"""
            else:
                base_check = 'release_base=$(git rev-list --max-parents=0 "origin/"' + shlex.quote(args.branch) + ' | head -n 1)'
            forbidden_path_check = f"""{base_check}
changed_entries=$(git log --format= --name-status "$release_base".."origin/{args.branch}" | sed '/^$/d')
if [ -z "$changed_entries" ]; then
  changed_entries=$(printf 'M\t%s' "origin/{args.branch}")
fi
forbidden_entries=$(printf '%s\n' "$changed_entries" | awk -F '\t' 'BEGIN {{ OFS="\t" }} {{
  status=$1
  if (status ~ /^D/) next
  if (status ~ /^[RC]/) {{ print status, $3; next }}
  print status, $2
}}' | grep -E -- {pattern_q} || true)
if [ -n "$forbidden_entries" ]; then
  echo 'This deployment target forbids these paths anywhere in its release history:' >&2
  printf '%s\n' {shlex.quote(forbidden_display)} >&2
  echo 'Forbidden paths in release history:' >&2
  printf '%s\n' "$forbidden_entries" >&2
  echo 'Move that work to its own release branch; do not publish it through this target.' >&2
  exit 26
fi"""

    verify_contains: dict[str, list[str]] = {}
    verify_not_contains: dict[str, list[str]] = {}
    verify_status: dict[str, list[int]] = {}
    for option_name, requirements, target_map in (
        ("--verify-contains", args.verify_contains, verify_contains),
        ("--verify-not-contains", args.verify_not_contains, verify_not_contains),
    ):
        for requirement in requirements:
            verify_url, separator, expected_text = str(requirement or "").partition("=")
            if not separator or not verify_url.startswith(("http://", "https://")) or not expected_text:
                raise SystemExit(f"Invalid {option_name} value: {requirement}")
            target_map.setdefault(verify_url, []).append(expected_text)
    for requirement in args.verify_status:
        verify_url, separator, expected_code = str(requirement or "").rpartition("=")
        if not separator or not verify_url.startswith(("http://", "https://")) or not expected_code.isdigit():
            raise SystemExit(f"Invalid --verify-status value: {requirement}")
        verify_status.setdefault(verify_url, []).append(int(expected_code))
    verify_urls = list(dict.fromkeys([*args.verify_url, *verify_contains, *verify_not_contains, *verify_status]))
    unknown_verify_urls = [
        verify_url
        for verify_url in [*verify_contains, *verify_not_contains, *verify_status]
        if verify_url not in args.verify_url
    ]
    if unknown_verify_urls:
        raise SystemExit(f"Verification URL must also be passed to --verify-url: {unknown_verify_urls[0]}")
    verification_checks = []
    for verify_url in verify_urls:
        verify_url_q = shlex.quote(verify_url)
        expected_statuses = verify_status.get(verify_url, [])
        if len(set(expected_statuses)) > 1:
            raise SystemExit(f"Conflicting --verify-status values for {verify_url}")
        expected_status_check = ""
        if expected_statuses:
            expected_status = expected_statuses[0]
            expected_status_check = f"""if [ "$verify_code" != "{expected_status}" ]; then echo "Verified page returned HTTP $verify_code, expected {expected_status}: {verify_url}" >&2; rm -f "$verify_body"; exit 32; fi"""
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
        if expected_statuses:
            fetch = f"""verify_body=$(mktemp)
verify_code=$(curl -sSL --max-time 15 -o "$verify_body" -w '%{{http_code}}' {verify_url_q}) || {{ echo "Page verification failed: {verify_url}"; rm -f "$verify_body"; exit 27; }}
{expected_status_check}"""
        else:
            fetch = f"""verify_body=$(mktemp)
curl -fsSL --max-time 15 {verify_url_q} -o "$verify_body" || {{ echo "Page verification failed: {verify_url}"; rm -f "$verify_body"; exit 27; }}
"""
        verification_checks.append(f"""
{fetch}
{expected_check}
rm -f "$verify_body"
echo "Verified page: {verify_url}"
""")
    verification_check = "\n".join(verification_checks) or "true"

    pre_restart_check = "\n".join(args.pre_restart_command) or "true"

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
if [ ! -d {shlex.quote(args.remote_root)}/.git ]; then
  test -n {shlex.quote(args.bootstrap_clone_url)} || {{ echo 'Missing release checkout and no --bootstrap-clone-url was provided.' >&2; exit 33; }}
  mkdir -p "$(dirname {shlex.quote(args.remote_root)})"
  git clone --branch {shlex.quote(args.branch)} {shlex.quote(args.bootstrap_clone_url)} {shlex.quote(args.remote_root)}
fi
cd {args.remote_root}
{env_check}
{required_files_check}
if ! git diff --quiet || ! git diff --cached --quiet; then
  echo 'Server has uncommitted tracked changes; reconcile them before deploying.' >&2
  git status --short --untracked-files=no >&2
  exit 25
fi
git fetch origin {args.branch}{(" " + shlex.quote(args.audit_base)) if args.audit_base else ""}
{forbidden_path_check}
if git show-ref --verify --quiet refs/heads/{args.branch}; then
  git checkout {args.branch}
else
  git checkout -b {args.branch} "origin/{args.branch}"
fi
git pull --ff-only origin {args.branch}
{pre_restart_check}
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
