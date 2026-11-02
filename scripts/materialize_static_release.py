#!/usr/bin/env python3
"""Materialize an allowlisted static release checkout without starting a second app.

Release branches are source-of-truth snapshots. This helper copies only the paths
owned by one public surface into its dedicated production worktree. Runtime data
(database, uploads, generated media, env files, logs) is never copied.
"""
from __future__ import annotations

import argparse
import os
import shutil
import subprocess
import sys
from pathlib import Path


LIVE_PATHS = (
    "live.html",
    "live.css",
    "live.js",
    "chat-live.js",
    "qrcode.js",
    "site-landing.html",
    "site-landing.css",
    "site-landing.js",
    "downloads/vipeak-live.apk",
    "mobile/live-android",
    "assets/chat-live/gifts",
    "assets/chat-live/moans",
    "assets/brand/default-avatar.jpg",
    "assets/brand/MaShanZheng-Regular.ttf",
    "assets/brand/wechat-logo.png",
    "assets/brand/alipay-logo.svg",
    "assets/brand/showcase",
)
LIVE_BRAND_GLOBS = (
    "live-*.png",
)
LIVE_WELCOME_GLOBS = (
    "welcome-newcomer*",
)


def run(command: list[str], cwd: Path) -> None:
    subprocess.run(command, cwd=cwd, check=True)


def copy_path(source: Path, target: Path) -> None:
    if source.is_dir():
        if target.exists():
            shutil.rmtree(target)
        shutil.copytree(source, target)
        return
    target.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(source, target)


def main() -> None:
    parser = argparse.ArgumentParser(description="Populate a release-only static worktree.")
    parser.add_argument("--source", required=True, help="Source Git checkout, usually the release branch worktree.")
    parser.add_argument("--target", required=True, help="Target directory served for this release surface.")
    parser.add_argument("--profile", choices=("live",), required=True)
    args = parser.parse_args()

    source = Path(args.source).resolve()
    target = Path(args.target).resolve()
    if source == target:
        raise SystemExit("Source and target must be different directories.")
    if not (source / ".git").exists() and not (source.parent / ".git").exists():
        raise SystemExit(f"Not a Git checkout: {source}")
    if target == Path("/"):
        raise SystemExit("Refusing to materialize into /")

    run(["git", "diff", "--quiet"], source)
    run(["git", "diff", "--cached", "--quiet"], source)
    staging = target.with_name(f".{target.name}.staging")
    retirement = target.with_name(f".{target.name}.retired")
    if staging.exists():
        shutil.rmtree(staging)
    staging.mkdir(parents=True)

    try:
        for relative in LIVE_PATHS:
            copy_path(source / relative, staging / relative)
        for pattern in LIVE_BRAND_GLOBS:
            for source_file in sorted((source / "assets" / "brand").glob(pattern)):
                copy_path(source_file, staging / "assets" / "brand" / source_file.name)
        for pattern in LIVE_WELCOME_GLOBS:
            for source_file in sorted((source / "assets" / "chat-live").glob(pattern)):
                copy_path(source_file, staging / "assets" / "chat-live" / source_file.name)

        # The live worktree is static-only. Do not let a later service restart
        # pick up a duplicate server.js or scheduler from this directory.
        forbidden_entries = ("server.js", "db.js", "package.json", ".env.local")
        present = [name for name in forbidden_entries if (staging / name).exists()]
        if present:
            raise SystemExit(f"Live static release contains backend files: {', '.join(present)}")

        if retirement.exists():
            shutil.rmtree(retirement)
        if target.exists():
            target.rename(retirement)
        staging.rename(target)
        if retirement.exists():
            shutil.rmtree(retirement)
    finally:
        if staging.exists():
            shutil.rmtree(staging)

    print(f"[release] profile={args.profile}")
    print(f"[release] source={source}")
    print(f"[release] target={target}")
    for relative in LIVE_PATHS:
        print(f"[release] materialized={relative}")
    for pattern in LIVE_BRAND_GLOBS:
        print(f"[release] materialized=assets/brand/{pattern}")
    for pattern in LIVE_WELCOME_GLOBS:
        print(f"[release] materialized=assets/chat-live/{pattern}")
    print(f"[release] source_commit={subprocess.run(['git', 'rev-parse', 'HEAD'], cwd=source, check=True, capture_output=True, text=True).stdout.strip()}")


if __name__ == "__main__":
    main()
