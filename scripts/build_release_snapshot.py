#!/usr/bin/env python3
"""Build a clean release branch from an integration commit without copying foreign paths.

The integration branch keeps every product surface together for development.
Production branches are separate snapshots: the platform snapshot excludes all
Live-owned files, and the Live snapshot includes only the static Live surface.
This helper writes Git trees directly, so historical commits on the source branch
never become part of the release branch ancestry.
"""
from __future__ import annotations

import argparse
import fnmatch
import os
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path


LIVE_PATTERNS = (
    "live.html",
    "live.css",
    "live.js",
    "qrcode.js",
    "site-landing.*",
    "downloads/vipeak-live.apk",
    "mobile/live-android/**",
    "assets/brand/live-*",
    "assets/chat-live/moans/**",
    "assets/chat-live/welcome-newcomer*",
    "test/live-*.test.js",
    "verification/live-transaction/**",
)
PLATFORM_PATTERNS = (
    "platform.html",
    "platform.css",
    "platform.prompt-editor.css",
    "platform*.js",
    "vendor/vipeak-prompt-editor.js",
    "server-source.js",
    "server.parts/**",
    "platform.ui.parts/**",
    "platform.create.parts/**",
    "admin.html",
    "admin.css",
    "admin.js",
    "chat.html",
    "chat.css",
    "chat.js",
    "server.js",
    "db.js",
    "package.json",
    "lib-*.js",
    "site-123vipfans.js",
    "site-123vipfans.css",
    "assets/ourdream/**",
    "assets/generated/**",
    "assets/user-uploads/**",
    "assets/user-characters/**",
    "assets/admin/**",
    "workflow-react/**",
    "ops/apply-production-tuning.sh",
    "ops/harden_old_nginx_private_media.py",
    "ops/harden-old-nginx-private-media.sh",
)
LIVE_SHARED_PATHS = (
    "chat-live.js",
    "assets/chat-live/gifts/**",
    "assets/brand/default-avatar.jpg",
    "assets/brand/MaShanZheng-Regular.ttf",
    "assets/brand/wechat-logo.png",
    "assets/brand/alipay-logo.svg",
    "assets/brand/showcase/**",
)
LIVE_ONLY_PATHS = (
    "live.html",
    "live.css",
    "live.js",
    "qrcode.js",
    "site-landing.html",
    "site-landing.css",
    "site-landing.js",
    "downloads/vipeak-live.apk",
    "mobile/live-android/**",
    "assets/brand/live-*",
    "assets/chat-live/moans/**",
    "assets/chat-live/welcome-newcomer*",
    "test/live-*.test.js",
    "verification/live-transaction/**",
)
# Runtime files in the platform checkout are retained even if an integration
# branch happens to update one of them. Release ownership is decided by path.
LIVE_RELEASE_PATHS = (*LIVE_ONLY_PATHS, *LIVE_SHARED_PATHS)
RELEASE_TOOLS = (
    "DEPLOY.md",
    "scripts/build_release_snapshot.py",
    "scripts/ensure_media_signing_secret.py",
    "scripts/deploy_pull.py",
    "scripts/deploy_site.py",
    "scripts/materialize_static_release.py",
)
def run(args: list[str], cwd: Path, *, input_text: str | None = None) -> str:
    result = subprocess.run(
        args,
        cwd=cwd,
        check=True,
        input=input_text,
        capture_output=True,
        text=True,
    )
    return result.stdout.strip()


def path_matches(path_text: str, pattern: str) -> bool:
    return fnmatch.fnmatchcase(path_text, pattern)


def matches_any(path_text: str, patterns: tuple[str, ...]) -> bool:
    return any(path_matches(path_text, pattern) for pattern in patterns)


def source_entries(root: Path, source_ref: str) -> list[tuple[str, str, str]]:
    """Return (mode, object id, path) for every tracked source entry."""
    output = run(["git", "ls-tree", "-r", source_ref], root)
    entries: list[tuple[str, str, str]] = []
    for line in output.splitlines():
        metadata, separator, path_text = line.partition("\t")
        if not separator:
            continue
        mode, object_type, object_id = metadata.split(" ", 2)
        if object_type != "blob":
            continue
        entries.append((mode, object_id, path_text))
    return entries


def release_paths(source_ref: str, profile: str, root: Path) -> list[str]:
    tracked = [path_text for _mode, _object_id, path_text in source_entries(root, source_ref)]
    if profile == "platform":
        paths = [path for path in tracked if not matches_any(path, LIVE_PATTERNS)]
        return sorted(set(paths))
    live = [path for path in tracked if matches_any(path, LIVE_RELEASE_PATHS)]
    return sorted(set(live))


def write_release_tree(root: Path, source_ref: str, profile: str, parent: str | None) -> str:
    paths = release_paths(source_ref, profile, root)
    wanted = set(paths)
    entries = [entry for entry in source_entries(root, source_ref) if entry[2] in wanted]
    index_dir = Path(tempfile.mkdtemp(prefix="release-index-"))
    index_path = index_dir / "index"
    env = os.environ.copy()
    env["GIT_INDEX_FILE"] = str(index_path)
    try:
        subprocess.run(["git", "read-tree", "--empty"], cwd=root, env=env, check=True)
        manifest = "\n".join(f"{mode} {object_id}\t{path_text}" for mode, object_id, path_text in entries) + "\n"
        subprocess.run(
            ["git", "update-index", "--add", "--index-info"],
            cwd=root,
            env=env,
            input=manifest,
            text=True,
            check=True,
        )
        tree = subprocess.run(
            ["git", "write-tree"], cwd=root, env=env, check=True, capture_output=True, text=True
        ).stdout.strip()
    finally:
        shutil.rmtree(index_dir, ignore_errors=True)
    parent_args = ["-p", parent] if parent else []
    message = f"Build {profile} release snapshot from {source_ref}"
    return run(["git", "commit-tree", tree, *parent_args, "-m", message], root)


def main() -> None:
    parser = argparse.ArgumentParser(description="Create clean platform/live release branches.")
    parser.add_argument("--source", default="old-site", help="Integration branch or commit to snapshot.")
    parser.add_argument("--repo-root", default=None, help="Repository root. Defaults to this script's checkout.")
    parser.add_argument("--platform-branch", default="platform-release")
    parser.add_argument("--live-branch", default="live-release")
    parser.add_argument("--platform-base", default="release-base/platform")
    parser.add_argument("--live-base", default="release-base/live")
    args = parser.parse_args()

    root = Path(args.repo_root).resolve() if args.repo_root else Path(__file__).resolve().parent.parent
    source_ref = run(["git", "rev-parse", args.source], root)
    base_refs = ((args.platform_base, "platform"), (args.live_base, "live"))
    for base_branch, profile in base_refs:
        tracked = set(path for _mode, _object_id, path in source_entries(root, source_ref))
        missing_tools = [path for path in RELEASE_TOOLS if path not in tracked]
        if missing_tools:
            raise SystemExit(f"Source ref is missing release tooling: {', '.join(missing_tools)}")
        base_paths = release_paths(source_ref, profile, root)
        if profile == "platform":
            forbidden = [path for path in base_paths if matches_any(path, LIVE_PATTERNS)]
        else:
            forbidden = [path for path in base_paths if not matches_any(path, LIVE_RELEASE_PATHS)]
        if forbidden:
            raise SystemExit(f"{profile} snapshot would contain foreign paths: {forbidden[:5]}")

        base_ref = f"refs/heads/{base_branch}"
        try:
            base_commit = run(["git", "rev-parse", "--verify", f"{base_ref}^{{commit}}"], root)
            print(f"{profile}: preserving immutable base={base_commit}")
        except subprocess.CalledProcessError:
            base_commit = write_release_tree(root, source_ref, profile, None)
            subprocess.run(["git", "update-ref", base_ref, base_commit, "0" * 40], cwd=root, check=True)
            print(f"{profile}: created immutable base={base_commit}")

        release_commit = write_release_tree(root, source_ref, profile, base_commit)
        release_branch = args.platform_branch if profile == "platform" else args.live_branch
        release_ref = f"refs/heads/{release_branch}"
        old_release = subprocess.run(
            ["git", "rev-parse", "--verify", f"{release_ref}^{{commit}}"],
            cwd=root,
            capture_output=True,
            text=True,
        )
        expected_old = old_release.stdout.strip() if old_release.returncode == 0 else "0" * 40
        subprocess.run(
            ["git", "update-ref", release_ref, release_commit, expected_old],
            cwd=root,
            check=True,
        )
        print(f"{profile}: base={base_commit} release={release_commit} source={source_ref}")


if __name__ == "__main__":
    main()
