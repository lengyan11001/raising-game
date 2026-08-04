#!/usr/bin/env python3
"""
Sync shared application code from the old-site worktree to the new2 worktree.

Old site is the source of truth. This script never copies runtime data,
environment files, uploads, generated media, or database content.
"""
from __future__ import annotations

import argparse
import filecmp
import shutil
import sys
from pathlib import Path


DEFAULT_OLD_ROOT = Path(r"D:\raising-game-old-asyncfix")
DEFAULT_NEW2_ROOT = Path(r"D:\raising-game-667zui")

SHARED_APP_FILES = (
    ".gitignore",
    ".env.example",
    "package.json",
    "package-lock.json",
    "index.html",
    "app.js",
    "game.html",
    "game.js",
    "platform.html",
    "platform.css",
    "platform.js",
    "platform.config.js",
    "platform.copy.js",
    "platform.ui.js",
    "platform.explore.js",
    "platform.create.js",
    "platform.main.js",
    "platform.video-tools.js",
    "platform.vitals.js",
    "site-seo.js",
    "site-http.js",
    "vendor/lucide-1.27.0.min.js",
    "tool-video.css",
    "downloads/123tops-video.apk",
    "downloads/123tops-video.mobileconfig",
    "mobile/android/AndroidManifest.xml",
    "mobile/android/README.md",
    "mobile/android/res/drawable/ic_launcher.xml",
    "mobile/android/res/values/colors.xml",
    "mobile/android/res/values/strings.xml",
    "mobile/android/res/values/styles.xml",
    "mobile/android/src/com/tops123/video/MainActivity.java",
    "scripts/build_tool_android.ps1",
    "scripts/build_tool_installers.ps1",
    "admin.css",
    "admin.html",
    "admin.js",
    "aliyun-video.js",
    "db.js",
    "media-inputs.js",
    "server.js",
    "seedance25.js",
    "video-tools.js",
    "test/advanced-custom-ui.test.js",
    "test/advanced-pricing.test.js",
    "test/aliyun-video.test.js",
    "test/media-inputs.test.js",
    "test/mobile-tool-ux.test.js",
    "test/seedance25.test.js",
    "test/site-seo.test.js",
    "test/site-http.test.js",
    "test/tool-video-provider.test.js",
    "test/video-tool-actions.test.js",
    "test/wallet-scan.test.js",
    "test/web-vitals.test.js",
)

SHARED_TOOLING_FILES = (
    "DEPLOY.md",
    "scripts/deploy_site.py",
    "scripts/deploy_pull.py",
    "scripts/sync_old_to_new2.py",
)

def normalized_root(value: str | None, fallback: Path) -> Path:
    return Path(value).resolve() if value else fallback.resolve()


def selected_files(args: argparse.Namespace) -> list[str]:
    files = list(SHARED_APP_FILES) + list(SHARED_TOOLING_FILES)
    if args.only:
        wanted = {item.strip().replace("\\", "/") for item in args.only.split(",") if item.strip()}
        files = [item for item in files if item.replace("\\", "/") in wanted]
    return files


def ensure_inside(root: Path, path: Path) -> None:
    root_resolved = root.resolve()
    path_resolved = path.resolve()
    try:
        path_resolved.relative_to(root_resolved)
    except ValueError:
        raise SystemExit(f"Refusing to touch path outside root: {path_resolved}") from None


def main() -> int:
    parser = argparse.ArgumentParser(description="Copy shared files from old site to new2, or check drift.")
    parser.add_argument("--old-root", default=None, help=f"Old site worktree. Default: {DEFAULT_OLD_ROOT}")
    parser.add_argument("--new2-root", default=None, help=f"New2 worktree. Default: {DEFAULT_NEW2_ROOT}")
    parser.add_argument("--check", action="store_true", help="Report drift without copying files.")
    parser.add_argument("--include-server", action="store_true", help=argparse.SUPPRESS)
    parser.add_argument("--only", default="", help="Comma-separated subset from the selected shared file list.")
    args = parser.parse_args()

    old_root = normalized_root(args.old_root, DEFAULT_OLD_ROOT)
    new2_root = normalized_root(args.new2_root, DEFAULT_NEW2_ROOT)
    if not old_root.exists():
        raise SystemExit(f"Old site root not found: {old_root}")
    if not new2_root.exists():
        raise SystemExit(f"New2 root not found: {new2_root}")

    changed: list[str] = []
    missing: list[str] = []
    files = selected_files(args)
    for relative in files:
        source = old_root / relative
        target = new2_root / relative
        ensure_inside(old_root, source)
        ensure_inside(new2_root, target)
        if not source.exists():
            missing.append(f"old missing: {relative}")
            continue
        if not target.exists():
            if args.check:
                missing.append(f"new2 missing: {relative}")
                continue
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(source, target)
            changed.append(relative)
            continue
        if filecmp.cmp(source, target, shallow=False):
            continue
        changed.append(relative)
        if not args.check:
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(source, target)

    if missing:
        for item in missing:
            print(item)
    if changed:
        action = "DRIFT" if args.check else "SYNCED"
        for item in changed:
            print(f"{action}: {item}")
    elif not missing:
        print("shared files match")

    if args.check and (changed or missing):
        return 1
    return 0 if not missing else 2


if __name__ == "__main__":
    sys.exit(main())
