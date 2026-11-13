#!/usr/bin/env python3
"""Prepare a non-destructive shared runtime-media root for Old.

The source is the currently deployed release's `assets/` tree. Only path
prefixes that the application treats as writable runtime media are copied;
static release-owned assets are intentionally excluded. The default is a
read-only plan. `--apply` copies into a fresh sibling directory, verifies every
copied file and directory against the source, and only then atomically renames
the completed tree to the requested target.

This tool does not edit service environment files, restart services, reload
Nginx, or touch the database. It refuses to overwrite an existing target.
"""
from __future__ import annotations

import argparse
import hashlib
import os
import shutil
import stat
import sys
from pathlib import Path

from runtime_media_paths import RUNTIME_MEDIA_PATHS as RUNTIME_PATHS


class PreparationError(RuntimeError):
    pass


def clean_directory(path: Path, label: str, *, must_exist: bool = True) -> Path:
    if path.is_symlink():
        raise PreparationError(f"{label} must not be a symlink: {path}")
    if must_exist and not path.is_dir():
        raise PreparationError(f"{label} must be an existing directory: {path}")
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


def copy_stable_file(source: str, destination: str) -> str:
    source_path = Path(source)
    before = stable_stat(source_path)
    copied = shutil.copy2(source, destination)
    after = stable_stat(source_path)
    if before != after:
        raise PreparationError(f"source file changed while copying: {source_path}")
    return copied


def validate_runtime_source(source_assets: Path, relative: str) -> Path | None:
    current = source_assets
    parts = Path(relative).parts
    for part in parts:
        current = current / part
        if current.is_symlink():
            raise PreparationError(f"source runtime path contains a symlink: {current}")
        if not current.exists():
            return None
        if not current.is_dir():
            raise PreparationError(f"source runtime path must be a real directory: {current}")
    return current


def tree_entries(root: Path) -> dict[str, tuple[str, int | None, str, str]]:
    entries: dict[str, tuple[str, int | None, str, str]] = {}
    for current, directories, files in os.walk(root, topdown=True, followlinks=False):
        current_path = Path(current)
        directories.sort()
        files.sort()
        for name in [*directories, *files]:
            path = current_path / name
            relative = path.relative_to(root).as_posix()
            info = path.lstat()
            mode = stat.S_IMODE(info.st_mode)
            if stat.S_ISLNK(info.st_mode):
                entries[relative] = ("symlink", mode, os.readlink(path), "")
            elif stat.S_ISDIR(info.st_mode):
                entries[relative] = ("dir", None, "", "")
            elif stat.S_ISREG(info.st_mode):
                entries[relative] = ("file", mode, str(info.st_size), sha256_file(path))
            else:
                raise PreparationError(f"unsupported source entry type: {path}")
    return entries


def copy_runtime_tree(source_assets: Path, destination: Path) -> dict[str, int]:
    counts = {"files": 0, "dirs": 0, "bytes": 0, "missing_prefixes": 0}
    destination.mkdir(mode=0o755)
    for relative in RUNTIME_PATHS:
        source = validate_runtime_source(source_assets, relative)
        if source is None:
            (destination / relative).mkdir(parents=True, exist_ok=True)
            print(f"CREATE empty runtime path={relative}")
            counts["missing_prefixes"] += 1
            continue
        target = destination / relative
        shutil.copytree(source, target, symlinks=False, copy_function=copy_stable_file)
        print(f"COPY runtime path={relative}")
    for current, directories, files in os.walk(destination, topdown=True, followlinks=False):
        for name in directories:
            path = Path(current) / name
            if path.is_symlink():
                raise PreparationError(f"copied tree contains a symlink: {path}")
            counts["dirs"] += 1
        for name in files:
            path = Path(current) / name
            if path.is_symlink() or not path.is_file():
                raise PreparationError(f"copied tree contains an unsafe file: {path}")
            counts["files"] += 1
            counts["bytes"] += path.stat().st_size
    return counts


def runtime_snapshot(source_assets: Path) -> dict[str, tuple[str, int | None, str, str]]:
    snapshot: dict[str, tuple[str, int | None, str, str]] = {}
    for relative in RUNTIME_PATHS:
        source = validate_runtime_source(source_assets, relative)
        if source is None:
            continue
        for key, value in tree_entries(source).items():
            snapshot[f"{relative}/{key}"] = value
    return snapshot


def verify_tree(
    source_assets: Path,
    destination: Path,
    *,
    expected_snapshot: dict[str, tuple[str, int | None, str, str]] | None = None,
) -> dict[str, int]:
    expected: dict[str, tuple[str, int | None, str, str]] = {}
    if expected_snapshot is None:
        for relative in RUNTIME_PATHS:
            source = validate_runtime_source(source_assets, relative)
            if source is None:
                target = destination / relative
                if target.is_symlink() or not target.is_dir():
                    raise PreparationError(f"prepared runtime path must be a real directory: {target}")
                continue
            for key, value in tree_entries(source).items():
                expected[f"{relative}/{key}"] = value
    else:
        expected = dict(expected_snapshot)
    actual = tree_entries(destination)
    for runtime_path in RUNTIME_PATHS:
        parts = Path(runtime_path).parts
        for index in range(1, len(parts) + 1):
            relative = Path(*parts[:index]).as_posix()
            path = destination / relative
            if path.is_symlink() or not path.is_dir():
                raise PreparationError(f"prepared runtime directory is missing or unsafe: {path}")
            actual.setdefault(relative, ("dir", None, "", ""))
    relevant_actual = {
        key: value for key, value in actual.items()
        if any(
            key == root
            or key.startswith(root + "/")
            or root.startswith(key + "/")
            for root in RUNTIME_PATHS
        )
    }
    expected_entries = {key: value for key, value in expected.items() if value[0] != "dir"}
    actual_entries = {key: value for key, value in relevant_actual.items() if value[0] != "dir"}
    if set(expected_entries) != set(actual_entries):
        missing = sorted(set(expected_entries) - set(actual_entries))[:10]
        extra = sorted(set(actual_entries) - set(expected_entries))[:10]
        raise PreparationError(f"runtime tree mismatch missing={missing} extra={extra}")
    for relative, value in expected_entries.items():
        if actual_entries[relative] != value:
            raise PreparationError(f"runtime tree content mismatch: {relative}")
    expected_dirs = {key for key, value in expected.items() if value[0] == "dir"}
    for runtime_path in RUNTIME_PATHS:
        parts = Path(runtime_path).parts
        for index in range(1, len(parts) + 1):
            expected_dirs.add(Path(*parts[:index]).as_posix())
    actual_dirs = {key for key, value in relevant_actual.items() if value[0] == "dir"}
    if expected_dirs != actual_dirs:
        missing_dirs = sorted(expected_dirs - actual_dirs)[:10]
        extra_dirs = sorted(actual_dirs - expected_dirs)[:10]
        raise PreparationError(f"runtime directory mismatch missing={missing_dirs} extra={extra_dirs}")
    for relative in sorted(expected_dirs):
        path = destination / relative
        if path.is_symlink() or not path.is_dir():
            raise PreparationError(f"prepared runtime directory is missing or unsafe: {path}")
    return {
        "files": sum(1 for value in expected_entries.values() if value[0] == "file"),
        "dirs": len(actual_dirs),
        "bytes": sum(int(value[2]) for value in expected_entries.values() if value[0] == "file"),
        "missing_prefixes": sum(
            1 for relative in RUNTIME_PATHS
            if validate_runtime_source(source_assets, relative) is None
        ),
    }


def prepare(source_assets: Path, target: Path, *, apply: bool) -> int:
    source_assets = clean_directory(source_assets, "--source-assets")
    parent = target.parent
    if not parent.exists() or not parent.is_dir() or parent.is_symlink():
        raise PreparationError(f"target parent must be an existing non-symlink directory: {parent}")
    if target.exists() or target.is_symlink():
        raise PreparationError(f"target already exists: {target}")
    if target.parent.resolve() != parent.resolve():
        raise PreparationError("target parent resolution changed unexpectedly")

    print(f"OBSERVED source_assets={source_assets} target={target}")
    include = [relative for relative in RUNTIME_PATHS if validate_runtime_source(source_assets, relative) is not None]
    missing = [relative for relative in RUNTIME_PATHS if relative not in include]
    for relative in include:
        print(f"PLAN include runtime path={relative}")
    for relative in missing:
        print(f"PLAN create empty runtime path={relative}")
    if not apply:
        print("RUNTIME_MEDIA_PLAN_OK")
        return 0

    baseline = runtime_snapshot(source_assets)

    staging = parent / f".{target.name}.preparing-{os.getpid()}"
    if staging.exists() or staging.is_symlink():
        raise PreparationError(f"staging path already exists: {staging}")
    try:
        counts = copy_runtime_tree(source_assets, staging)
        verified = verify_tree(source_assets, staging, expected_snapshot=baseline)
        after_copy = runtime_snapshot(source_assets)
        if after_copy != baseline:
            raise PreparationError("source runtime media changed during copy; retry during a quiet window")
        if counts != verified:
            raise PreparationError(f"copy verification counts differ: copied={counts} verified={verified}")
        if target.exists() or target.is_symlink():
            raise PreparationError(f"target appeared during preparation: {target}")
        os.rename(staging, target)
        if target.is_symlink() or not target.is_dir():
            raise PreparationError(f"prepared target is not a real directory: {target}")
        final = verify_tree(source_assets, target, expected_snapshot=baseline)
        after_rename = runtime_snapshot(source_assets)
        if after_rename != baseline:
            raise PreparationError("source runtime media changed before publish; target was not modified")
        if final != verified:
            raise PreparationError(f"final verification changed: before={verified} after={final}")
        print(
            f"RUNTIME_MEDIA_READY files={final['files']} dirs={final['dirs']} bytes={final['bytes']} target={target}"
        )
        return 0
    except Exception:
        if staging.exists():
            shutil.rmtree(staging, ignore_errors=True)
        raise


def parse_args(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source-assets", required=True, help="release assets directory")
    parser.add_argument("--target", required=True, help="new shared runtime-media root")
    parser.add_argument("--apply", action="store_true", help="perform the copy; otherwise plan only")
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    try:
        args = parse_args(argv or sys.argv[1:])
        return prepare(Path(args.source_assets), Path(args.target), apply=args.apply)
    except PreparationError as error:
        print(f"ERROR {error}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    sys.exit(main())
