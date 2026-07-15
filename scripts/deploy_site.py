#!/usr/bin/env python3
"""
Deploy a known production site by pulling the already-pushed Git branch.

This wrapper exists so production targets are not rediscovered ad hoc. It
does not copy files to the server; it delegates to deploy_pull.py with the
fixed branch, remote root, service, and health URL for each site.
"""
from __future__ import annotations

import argparse
import os
import subprocess
import sys
from pathlib import Path


TARGETS = {
    "old": {
        "host": "101.47.76.188",
        "branch": "old-site",
        "remote_root": "/opt/raising-game-demo",
        "service": "raising-game-demo",
        "health_url": "https://123vips.com/api/health",
        "password_env": ("OLD_SITE_SSH_PASSWORD", "FYSHARK_SSH_PASSWORD", "DEPLOY_SSH_PASSWORD"),
    },
    "new2": {
        "host": "198.200.37.82",
        "branch": "codex/site-667zui",
        "remote_root": "/opt/raising-game-667zui",
        "service": "raising-game-667zui",
        "health_url": "https://667zui.video/api/health",
        "password_env": ("NEW_SITE2_SSH_PASSWORD", "DEPLOY_SSH_PASSWORD"),
    },
}


def first_env(names: tuple[str, ...]) -> tuple[str, str]:
    for name in names:
        value = os.environ.get(name, "")
        if value:
            return name, value
    return "", ""


def main() -> None:
    parser = argparse.ArgumentParser(description="Deploy a fixed production target.")
    parser.add_argument("--site", choices=sorted(TARGETS), required=True, help="old=123vips.com, new2=667zui.video")
    parser.add_argument("--port", type=int, default=int(os.environ.get("DEPLOY_PORT", "22")))
    parser.add_argument("--dry-run", action="store_true", help="Print the fixed target and exit.")
    parser.add_argument("--no-restart", action="store_true", help="Pull code without restarting the service.")
    args = parser.parse_args()

    target = TARGETS[args.site]
    env_name, password = first_env(target["password_env"])
    print(f"[deploy-site] site={args.site}")
    print(f"[deploy-site] host={target['host']} port={args.port}")
    print(f"[deploy-site] branch={target['branch']}")
    print(f"[deploy-site] remote_root={target['remote_root']}")
    print(f"[deploy-site] service={target['service']}")
    print(f"[deploy-site] health_url={target['health_url']}")
    print(f"[deploy-site] password_env={env_name or '<missing>'}")
    if args.dry_run:
        return
    if not password:
        expected = ", ".join(target["password_env"])
        raise SystemExit(f"Missing SSH password env. Set one of: {expected}")

    env = os.environ.copy()
    env["DEPLOY_HOST"] = target["host"]
    env["DEPLOY_USER"] = env.get("DEPLOY_USER", "root")
    env["DEPLOY_SSH_PASSWORD"] = password
    env["DEPLOY_PORT"] = str(args.port)
    deploy_pull = Path(__file__).with_name("deploy_pull.py")
    command = [
        sys.executable,
        str(deploy_pull),
        "--branch",
        target["branch"],
        "--remote-root",
        target["remote_root"],
        "--service",
        target["service"],
        "--health-url",
        target["health_url"],
        "--port",
        str(args.port),
    ]
    if args.no_restart:
        command.append("--no-restart")
    raise SystemExit(subprocess.call(command, env=env))


if __name__ == "__main__":
    main()
