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
import re
import subprocess
import sys
from pathlib import Path


TARGETS = {
    "old": {
        "host": "101.47.76.188",
        "port": 22,
        "branch": "old-site",
        "remote_root": "/opt/raising-game-demo",
        "service": "raising-game-demo",
        "health_url": "https://123vips.com/api/health",
        "env_file": "/etc/raising-game-demo.env",
        "password_env": ("OLD_SITE_SSH_PASSWORD", "FYSHARK_SSH_PASSWORD", "DEPLOY_SSH_PASSWORD"),
        "local_password_files": (
            {
                "path": r"D:\raising-game\scripts\fyshark_tail_log.py",
                "pattern": r'(?m)^PASSWORD\s*=\s*"([^"]+)"',
            },
        ),
    },
    "new2": {
        "host": "198.200.37.82",
        "port": 42607,
        "branch": "codex/site-667zui",
        "remote_root": "/opt/raising-game-667zui",
        "service": "raising-game-667zui",
        "health_url": "https://667zui.video/api/health",
        "env_file": "/etc/raising-game-667zui.env",
        "password_env": ("NEW_SITE2_SSH_PASSWORD", "DEPLOY_SSH_PASSWORD"),
        "forbidden_env_patterns": (
            r"^(R2_BUCKET|CLOUDFLARE_R2_BUCKET)=\"?vipeak-media\"?$",
            r"^(R2_PUBLIC_BASE_URL|R2_PUBLIC_DOMAIN|CLOUDFLARE_R2_PUBLIC_BASE_URL|CLOUDFLARE_R2_PUBLIC_DOMAIN)=\"?https://media\.123vips\.com\"?$",
            r"^TOS_BUCKET=\"?fal-task\"?$",
            r"^TOS_PUBLIC_DOMAIN=\"?https://cdn-video\.51sux\.com\"?$",
        ),
    },
}


def first_password(target: dict[str, object]) -> tuple[str, str]:
    names = target.get("password_env", ())
    for name in names:
        value = os.environ.get(name, "")
        if value:
            return name, value
    for source in target.get("local_password_files", ()):
        path = Path(str(source.get("path", "")))
        pattern = str(source.get("pattern", ""))
        if not path.exists() or not pattern:
            continue
        text = path.read_text(encoding="utf-8", errors="replace")
        match = re.search(pattern, text)
        if match and match.group(1):
            return f"local-file:{path}", match.group(1)
    return "", ""


def enforce_shared_sync_for_new2() -> None:
    sync_script = Path(__file__).with_name("sync_old_to_new2.py")
    if not sync_script.exists():
        raise SystemExit(f"Missing shared sync checker: {sync_script}")
    result = subprocess.run([sys.executable, str(sync_script), "--check"], text=True)
    if result.returncode != 0:
        raise SystemExit("New2 shared code is not synced from old-site. Run: python .\\scripts\\sync_old_to_new2.py")


def main() -> None:
    parser = argparse.ArgumentParser(description="Deploy a fixed production target.")
    parser.add_argument("--site", choices=sorted(TARGETS), required=True, help="old=123vips.com, new2=667zui.video")
    parser.add_argument("--port", type=int, default=None, help="Override the fixed SSH port for this site.")
    parser.add_argument("--dry-run", action="store_true", help="Print the fixed target and exit.")
    parser.add_argument("--no-restart", action="store_true", help="Pull code without restarting the service.")
    parser.add_argument("--skip-shared-sync-check", action="store_true", help="Emergency override for new2 drift guard.")
    args = parser.parse_args()

    target = TARGETS[args.site]
    port = args.port or int(os.environ.get("DEPLOY_PORT") or target["port"])
    password_source, password = first_password(target)
    print(f"[deploy-site] site={args.site}")
    print(f"[deploy-site] host={target['host']} port={port}")
    print(f"[deploy-site] branch={target['branch']}")
    print(f"[deploy-site] remote_root={target['remote_root']}")
    print(f"[deploy-site] service={target['service']}")
    print(f"[deploy-site] health_url={target['health_url']}")
    print(f"[deploy-site] env_file={target['env_file']}")
    print(f"[deploy-site] password_source={password_source or '<missing>'}")
    for pattern in target.get("forbidden_env_patterns", ()):
        print(f"[deploy-site] forbid_env_pattern={pattern}")
    if args.dry_run:
        return
    if args.site == "new2" and not args.skip_shared_sync_check:
        enforce_shared_sync_for_new2()
    if not password:
        expected = ", ".join(target["password_env"])
        raise SystemExit(f"Missing SSH password env. Set one of: {expected}")

    env = os.environ.copy()
    env["DEPLOY_HOST"] = target["host"]
    env["DEPLOY_USER"] = env.get("DEPLOY_USER", "root")
    env["DEPLOY_SSH_PASSWORD"] = password
    env["DEPLOY_PORT"] = str(port)
    env["DEPLOY_ENV_FILE"] = target["env_file"]
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
        str(port),
    ]
    if args.no_restart:
        command.append("--no-restart")
    for pattern in target.get("forbidden_env_patterns", ()):
        command.extend(["--forbid-env-pattern", pattern])
    raise SystemExit(subprocess.call(command, env=env))


if __name__ == "__main__":
    main()
