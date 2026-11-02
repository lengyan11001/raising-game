#!/usr/bin/env python3
"""Configure the Agentic Mobile Wan 3.0 Prime node on production."""
from __future__ import annotations

import argparse
import os
import posixpath
import shlex
import time
from pathlib import Path

import paramiko


def split_env_line(line: str) -> tuple[str, str] | None:
    stripped = line.strip()
    if not stripped or stripped.startswith("#") or "=" not in stripped:
        return None
    key, value = line.split("=", 1)
    return (key.strip(), value) if key.strip() else None


def quote_env_value(value: str) -> str:
    if all(ch.isalnum() or ch in "._-/:+" for ch in value):
        return value
    return '"' + value.replace("\\", "\\\\").replace('"', '\"') + '"'


def upsert_env(content: str, updates: dict[str, str]) -> str:
    output: list[str] = []
    seen: set[str] = set()
    for line in content.splitlines():
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


def remote_run(client: paramiko.SSHClient, command: str, timeout: int = 120) -> tuple[int, str, str]:
    _stdin, stdout, stderr = client.exec_command(command, timeout=timeout)
    out = stdout.read().decode("utf-8", errors="replace")
    err = stderr.read().decode("utf-8", errors="replace")
    return stdout.channel.recv_exit_status(), out, err


def main() -> int:
    parser = argparse.ArgumentParser(description="Configure Agentic Mobile Prime on production.")
    parser.add_argument("--key-file", required=True)
    parser.add_argument("--host", default="47.84.76.131")
    parser.add_argument("--user", default="root")
    parser.add_argument("--env-file", default="/etc/raising-game-demo.env")
    parser.add_argument("--service", default="raising-game-demo")
    parser.add_argument("--health-url", default="https://123vips.com/api/health")
    args = parser.parse_args()

    password = os.environ.get("OLD_SITE_SSH_PASSWORD", "")
    if not password:
        raise SystemExit("OLD_SITE_SSH_PASSWORD is required")
    api_key = Path(args.key_file).read_text(encoding="utf-8").strip()
    if not api_key:
        raise SystemExit("Agentic Mobile API key file is empty")

    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    client.connect(args.host, username=args.user, password=password, timeout=20)
    try:
        sftp = client.open_sftp()
        try:
            with sftp.file(args.env_file, "r") as handle:
                raw = handle.read()
            content = raw if isinstance(raw, str) else raw.decode("utf-8", errors="replace")
        finally:
            sftp.close()

        updates = {
            "ALIYUN_WAN30_PRIME_API_KEY": api_key,
            "ALIYUN_WAN30_PRIME_BASE_URL": "https://model-intl.aimobile.wuying.aliyuncs.com/us-east-1",
            "ALIYUN_WAN30_PRIME_MODEL": "wan3.0-video-prime",
        }
        next_content = upsert_env(content, updates)
        stamp = time.strftime("%Y%m%d%H%M%S")
        temp_path = posixpath.join(posixpath.dirname(args.env_file), f".{posixpath.basename(args.env_file)}.prime-{stamp}.tmp")
        backup_path = f"{args.env_file}.bak.{stamp}"
        sftp = client.open_sftp()
        try:
            with sftp.file(temp_path, "w") as handle:
                handle.write(next_content)
            sftp.chmod(temp_path, 0o600)
        finally:
            sftp.close()
        install = (
            f"set -e; cp -p {shlex.quote(args.env_file)} {shlex.quote(backup_path)}; "
            f"install -m 600 {shlex.quote(temp_path)} {shlex.quote(args.env_file)}; "
            f"rm -f {shlex.quote(temp_path)}"
        )
        rc, out, err = remote_run(client, install)
        if rc:
            raise RuntimeError(err.strip() or out.strip() or "failed to install env")
        rc, out, err = remote_run(
            client,
            f"systemctl restart {shlex.quote(args.service)} && sleep 3 && "
            f"systemctl is-active {shlex.quote(args.service)} && "
            f"curl -fsS -m 20 {shlex.quote(args.health_url)}",
            timeout=45,
        )
        if rc:
            raise RuntimeError(err.strip() or out.strip() or "restart/health check failed")
        print(f"configured=3 backup={backup_path}")
        print(out.strip())
        return 0
    finally:
        client.close()


if __name__ == "__main__":
    raise SystemExit(main())
