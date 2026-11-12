#!/usr/bin/env python3
"""Safely merge late runtime-media writes into an existing shared root.

The default is a read-only plan. `--apply` copies only missing destination
files. It never deletes and never overwrites an existing destination path.
Same-size files are compared by SHA-256; any content or type conflict is a
collision and aborts with a non-zero exit before mutation when planning, or
before copying that path when applying. New files are staged beside the final
path and atomically renamed, so an interrupted run cannot expose a partial
file.

This is the final incremental-sync step after traffic has moved to the standby
instance. PostgreSQL remains the authority for media metadata and ownership.
"""
from __future__ import annotations

import argparse
import hashlib
import os
import shutil
import stat
import sys
from pathlib import Path

from runtime_media_paths import RUNTIME_MEDIA_PATHS


class SyncError(RuntimeError):
    pass


def clean_directory(path: Path, label: str) -> Path:
    if path.is_symlink():
        raise SyncError(f"{label} must not be a symlink: {path}")
    if not path.is_dir():
        raise SyncError(f"{label} must be an existing directory: {path}")
    return path.resolve()


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        while True:
            chunk = handle.read(1024 * 1024)
            if not chunk:
                break
            digest.update(chunk)
    return digest.hexdigest()


def stable_stat(path: Path) -> tuple[int, int, int, int]:
    info = path.stat()
    return (info.st_ino, info.st_size, info.st_mtime_ns, info.st_ctime_ns)


def safe_relative(parts: tuple[str, ...]) -> str:
    return Path(*parts).as_posix()


def validate_target_path(target_root: Path, relative: Path) -> None:
    ensure_safe_parent(target_root, target_root / relative)


def iter_source_files(source_assets: Path):
    for runtime_path in RUNTIME_MEDIA_PATHS:
        root = source_assets / runtime_path
        current = source_assets
        for part in Path(runtime_path).parts:
            current = current / part
            if current.is_symlink():
                raise SyncError(f"source runtime path contains a symlink: {current}")
            if current.exists() and not current.is_dir():
                raise SyncError(f"source runtime path is not a directory: {current}")
        if not root.exists():
            continue
        if not root.is_dir():
            raise SyncError(f"source runtime path is not a directory: {root}")
        for current, directories, files in os.walk(root, topdown=True, followlinks=False):
            current_path = Path(current)
            directories.sort()
            files.sort()
            for name in directories:
                path = current_path / name
                if path.is_symlink():
                    raise SyncError(f"source tree contains a symlink: {path}")
            for name in files:
                path = current_path / name
                info = path.lstat()
                if stat.S_ISLNK(info.st_mode):
                    raise SyncError(f"source tree contains a symlink: {path}")
                if not stat.S_ISREG(info.st_mode):
                    raise SyncError(f"unsupported source entry type: {path}")
                relative = path.relative_to(source_assets)
                yield path, relative


def ensure_safe_parent(target_root: Path, destination: Path) -> None:
    if target_root.is_symlink():
        raise SyncError(f"destination root must not be a symlink: {target_root}")
    try:
        relative = destination.relative_to(target_root)
    except ValueError as error:
        raise SyncError(f"destination escapes target root: {destination}") from error
    current = target_root
    for part in relative.parts[:-1]:
        current = current / part
        if current.is_symlink():
            raise SyncError(f"destination path contains a symlink: {current}")
        if current.exists() and not current.is_dir():
            raise SyncError(f"destination parent is not a directory: {current}")


def classify(source: Path, destination: Path) -> tuple[str, str]:
    if destination.is_symlink():
        return "collision", "destination is a symlink"
    if destination.exists():
        if not destination.is_file():
            return "collision", "destination is not a regular file"
        source_size = source.stat().st_size
        destination_size = destination.stat().st_size
        if source_size != destination_size:
            return "collision", f"size differs source={source_size} destination={destination_size}"
        if sha256_file(source) != sha256_file(destination):
            return "collision", "content differs"
        return "same", "same size and SHA-256"
    return "missing", "destination file is absent"


def copy_missing_file(source: Path, destination: Path, target_root: Path) -> tuple[int, int]:
    before = stable_stat(source)
    destination.parent.mkdir(parents=True, exist_ok=True)
    ensure_safe_parent(target_root, destination)
    if destination.exists() or destination.is_symlink():
        raise SyncError(f"destination appeared during sync: {destination}")
    staging = destination.parent / f".{destination.name}.syncing-{os.getpid()}"
    if staging.exists() or staging.is_symlink():
        raise SyncError(f"staging path already exists: {staging}")
    try:
        shutil.copy2(source, staging)
        after = stable_stat(source)
        if before != after:
            raise SyncError(f"source file changed while copying: {source}")
        if sha256_file(source) != sha256_file(staging):
            raise SyncError(f"staged file verification failed: {destination}")
        if destination.exists() or destination.is_symlink():
            raise SyncError(f"destination appeared before publish: {destination}")
        os.rename(staging, destination)
    finally:
        if staging.exists():
            staging.unlink()
    return before[1], 1


def sync(source_assets: Path, target: Path, *, apply: bool) -> int:
    source_assets = clean_directory(source_assets, "--source-assets")
    target = clean_directory(target, "--target")
    files = list(iter_source_files(source_assets))
    for runtime_path in RUNTIME_MEDIA_PATHS:
        validate_target_path(target, Path(runtime_path))
    missing: list[tuple[Path, Path]] = []
    collisions: list[tuple[str, str]] = []
    same = 0
    for source, relative in files:
        destination = target / relative
        ensure_safe_parent(target, destination)
        kind, detail = classify(source, destination)
        if kind == "missing":
            missing.append((source, destination))
        elif kind == "collision":
            collisions.append((relative.as_posix(), detail))
        else:
            same += 1

    for relative, detail in collisions:
        print(f"RUNTIME_MEDIA_COLLISION path={relative} reason={detail}")
    print(f"PLAN files={len(files)} same={same} missing={len(missing)} collisions={len(collisions)}")
    for source, destination in missing:
        print(f"PLAN copy={destination.relative_to(target).as_posix()} bytes={source.stat().st_size}")
    if collisions:
        print("RUNTIME_MEDIA_SYNC_BLOCKED collisions=1", file=sys.stderr)
        return 3
    if not apply:
        print("RUNTIME_MEDIA_SYNC_PLAN_OK")
        return 0

    copied_files = 0
    copied_bytes = 0
    for source, destination in missing:
        size, count = copy_missing_file(source, destination, target)
        copied_bytes += size
        copied_files += count
    print(f"RUNTIME_MEDIA_SYNC_READY copied_files={copied_files} copied_bytes={copied_bytes} target={target}")
    return 0


def parse_args(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source-assets", required=True, help="old release assets directory")
    parser.add_argument("--target", required=True, help="existing shared runtime-media root")
    parser.add_argument("--apply", action="store_true", help="copy missing files; otherwise plan only")
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    try:
        args = parse_args(argv or sys.argv[1:])
        return sync(Path(args.source_assets), Path(args.target), apply=args.apply)
    except SyncError as error:
        print(f"ERROR {error}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    sys.exit(main())
