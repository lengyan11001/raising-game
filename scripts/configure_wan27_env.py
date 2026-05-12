#!/usr/bin/env python3
"""Configure Wan2.7 environment variables on the production server."""
from __future__ import annotations

import argparse
import getpass
import os
import posixpath
import shlex
import sys
import time
from dataclasses import dataclass

import paramiko


DEFAULT_HOST = "101.47.76.188"
DEFAULT_USER = "root"
DEFAULT_ENV_FILE = "/etc/raising-game-demo.env"
DEFAULT_SERVICE = "raising-game-demo"
DEFAULT_HEALTH_URL = "https://123vips.com/api/health"
DEFAULT_BASE_URL = "https://dashscope-intl.aliyuncs.com"
DEFAULT_MODEL = "wan2.7-i2v-2026-04-25"


@dataclass
class RemoteResult:
    rc: int
    out: str
    err: str


def remote_run(client: paramiko.SSHClient, command: str, timeout: int = 120) -> RemoteResult:
    _stdin, stdout, stderr = client.exec_command(command, timeout=timeout)
    out = stdout.read().decode("utf-8", errors="replace")
    err = stderr.read().decode("utf-8", errors="replace")
    return RemoteResult(stdout.channel.recv_exit_status(), out, err)


def split_env_line(line: str) -> tuple[str, str] | None:
    stripped = line.strip()
    if not stripped or stripped.startswith("#") or "=" not in stripped:
        return None
    key, value = line.split("=", 1)
    key = key.strip()
    if not key:
        return None
    return key, value.rstrip("\n")


def quote_env_value(value: str) -> str:
    if value == "":
        return '""'
    safe = all(ch.isalnum() or ch in "._-/:+" for ch in value)
    if safe:
        return value
    return '"' + value.replace("\\", "\\\\").replace('"', '\\"') + '"'


def upsert_env(content: str, updates: dict[str, str]) -> str:
    lines = content.splitlines()
    seen: set[str] = set()
    output: list[str] = []
    for line in lines:
        parsed = split_env_line(line)
        if parsed and parsed[0] in updates:
            key = parsed[0]
            output.append(f"{key}={quote_env_value(updates[key])}")
            seen.add(key)
        else:
            output.append(line)
    if output and output[-1].strip():
        output.append("")
    for key, value in updates.items():
        if key not in seen:
            output.append(f"{key}={quote_env_value(value)}")
    return "\n".join(output).rstrip() + "\n"


def read_remote_file(client: paramiko.SSHClient, path: str) -> str:
    sftp = client.open_sftp()
    try:
        with sftp.file(path, "r") as handle:
            data = handle.read()
    except FileNotFoundError:
        data = b""
    finally:
        sftp.close()
    if isinstance(data, str):
        return data
    return data.decode("utf-8", errors="replace")


def write_remote_file(client: paramiko.SSHClient, path: str, content: str) -> None:
    timestamp = time.strftime("%Y%m%d%H%M%S")
    quoted_path = shlex.quote(path)
    backup_path = f"{path}.bak.{timestamp}"
    temp_path = posixpath.join(posixpath.dirname(path), f".{posixpath.basename(path)}.codex-{timestamp}.tmp")
    quoted_temp = shlex.quote(temp_path)
    sftp = client.open_sftp()
    try:
        with sftp.file(temp_path, "w") as handle:
            handle.write(content)
        sftp.chmod(temp_path, 0o600)
    finally:
        sftp.close()
    command = (
        f"set -e; "
        f"if [ -f {quoted_path} ]; then cp -p {quoted_path} {shlex.quote(backup_path)}; fi; "
        f"install -m 600 {quoted_temp} {quoted_path}; "
        f"rm -f {quoted_temp}; "
        f"echo backup={shlex.quote(backup_path)}"
    )
    result = remote_run(client, command)
    if result.rc != 0:
        raise RuntimeError(result.err.strip() or result.out.strip() or "failed to install env file")
    print(result.out.strip())


def redacted_env_summary(content: str) -> str:
    wanted = {
        "ALIYUN_DASHSCOPE_API_KEY",
        "DASHSCOPE_API_KEY",
        "BAILIAN_API_KEY",
        "ALIYUN_DASHSCOPE_BASE_URL",
        "ALIYUN_WAN27_MODEL",
        "ARK_API_KEY",
    }
    rows: list[str] = []
    for line in content.splitlines():
        parsed = split_env_line(line)
        if not parsed or parsed[0] not in wanted:
            continue
        key, value = parsed
        if key.endswith("KEY"):
            rows.append(f"{key}=<set length {len(value)}>")
        else:
            rows.append(f"{key}={value}")
    return "\n".join(rows) if rows else "No matching env keys found."


def health_check(client: paramiko.SSHClient, url: str) -> None:
    result = remote_run(client, f"curl -sS -m 20 {shlex.quote(url)}", timeout=30)
    print("== health ==")
    print(result.out.strip())
    if result.err.strip():
        print(result.err.strip(), file=sys.stderr)
    if result.rc != 0:
        raise SystemExit(result.rc)


def main() -> None:
    parser = argparse.ArgumentParser(description="Set Wan2.7 DashScope env vars on production.")
    parser.add_argument("--host", default=os.environ.get("FYSHARK_HOST", DEFAULT_HOST))
    parser.add_argument("--user", default=os.environ.get("FYSHARK_USER", DEFAULT_USER))
    parser.add_argument("--env-file", default=DEFAULT_ENV_FILE)
    parser.add_argument("--service", default=DEFAULT_SERVICE)
    parser.add_argument("--health-url", default=DEFAULT_HEALTH_URL)
    parser.add_argument("--base-url", default=os.environ.get("ALIYUN_DASHSCOPE_BASE_URL", DEFAULT_BASE_URL))
    parser.add_argument("--model", default=os.environ.get("ALIYUN_WAN27_MODEL", DEFAULT_MODEL))
    parser.add_argument("--check-only", action="store_true", help="Only inspect current env and health.")
    parser.add_argument("--model-only", action="store_true", help="Only update ALIYUN_WAN27_MODEL and keep the existing key.")
    parser.add_argument("--no-restart", action="store_true", help="Write env without restarting systemd service.")
    args = parser.parse_args()

    ssh_password = os.environ.get("FYSHARK_SSH_PASSWORD") or getpass.getpass("SSH password: ")
    dashscope_key = (
        os.environ.get("ALIYUN_DASHSCOPE_API_KEY")
        or os.environ.get("DASHSCOPE_API_KEY")
        or os.environ.get("BAILIAN_API_KEY")
        or ""
    )
    if not args.check_only and not args.model_only and not dashscope_key:
        dashscope_key = getpass.getpass("ALIYUN_DASHSCOPE_API_KEY: ")
    if not args.check_only and not args.model_only and not dashscope_key.strip():
        raise SystemExit("ALIYUN_DASHSCOPE_API_KEY is required unless --check-only is used.")

    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    print(f"[ssh] connecting {args.user}@{args.host}")
    client.connect(args.host, username=args.user, password=ssh_password, timeout=20)
    try:
        content = read_remote_file(client, args.env_file)
        print("== current env ==")
        print(redacted_env_summary(content))
        if args.check_only:
            health_check(client, args.health_url)
            return

        updates = {"ALIYUN_WAN27_MODEL": args.model}
        if not args.model_only:
            updates = {
                "ALIYUN_DASHSCOPE_API_KEY": dashscope_key.strip(),
                "ALIYUN_DASHSCOPE_BASE_URL": args.base_url,
                **updates,
            }
        next_content = upsert_env(content, updates)
        write_remote_file(client, args.env_file, next_content)

        if not args.no_restart:
            print(f"== restart {args.service} ==")
            result = remote_run(client, f"systemctl restart {shlex.quote(args.service)} && sleep 2 && systemctl is-active {shlex.quote(args.service)}")
            print(result.out.strip())
            if result.err.strip():
                print(result.err.strip(), file=sys.stderr)
            if result.rc != 0:
                raise SystemExit(result.rc)
        print("== updated env ==")
        print(redacted_env_summary(next_content))
        health_check(client, args.health_url)
    finally:
        client.close()


if __name__ == "__main__":
    main()
